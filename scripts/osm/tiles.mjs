/**
 * The 3D city data (Wave 9 §A) from OpenStreetMap (© OpenStreetMap
 * contributors, ODbL) and the AWS Terrarium elevation tiles. Runs in GitHub
 * Actions after build.mjs (.github/workflows/osm-maps.yml) and writes, per
 * city, into apps/web/public/geo/<city>/:
 *
 *   b-<tx>_<ty>.bin  every building in the `wide` box, in 1 km tiles
 *   terrain.bin      an elevation grid over `wide` (water at 0 m)
 *   trees.bin        tree points (mapped trees, parks and woods, streets)
 *   index.json       tile list, bounds, origin, sizes, enums, attribution
 *
 * The formats are documented in format.mjs and decoded in the web app by
 * apps/web/src/city/geo3d/tiles.ts. The frame is the one of the city's geo
 * JSON (geom.mjs projector), so everything lines up with today's 2D map.
 *
 *   node scripts/osm/tiles.mjs <city> [city …]
 *   BUDGET_MB=6 node scripts/osm/tiles.mjs san-francisco
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITIES } from './cities.mjs';
import {
  BUILDING_TYPES,
  FORMAT_VERSION,
  MATERIALS,
  ROOF_SHAPES,
  TILE_SIZE,
  TREE_KINDS,
  encodeTerrain,
  encodeTile,
  encodeTrees,
  parseLength,
} from './format.mjs';
import { LEVEL_HEIGHT, buildingsFrom, fitBudget, resolveParts, tileBuildings } from './buildings.mjs';
import { bb, flat, hash01, projector, simplify } from './geom.mjs';
import { overpass, sleep } from './overpass.mjs';
import { clampWater, fetchTerrarium, sampleGrid, terrainPlan } from './terrain.mjs';
import { cityTrees } from './trees.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

/** Split a [w, s, e, n] box into sub-boxes of at most `step` degrees a side. */
export function chunkBox([w, s, e, n], step) {
  const nx = Math.max(1, Math.ceil((e - w) / step - 1e-9));
  const ny = Math.max(1, Math.ceil((n - s) / step - 1e-9));
  const out = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      out.push([
        w + ((e - w) * i) / nx,
        s + ((n - s) * j) / ny,
        w + ((e - w) * (i + 1)) / nx,
        s + ((n - s) * (j + 1)) / ny,
      ]);
  return out;
}

const query = (box) => `[out:json][timeout:300][maxsize:1073741824];(
  way["building"](${bb(box)});
  relation["building"]["type"="multipolygon"](${bb(box)});
  way["building:part"]["height"](${bb(box)});
  way["building:part"]["building:levels"](${bb(box)});
  node["natural"="tree"](${bb(box)});
  way["highway"~"^(residential|living_street)$"](${bb(box)});
);out body geom qt;`;

/** Fetch one sub-box; on repeated failure split it in four (twice at most). */
async function fetchBox(box, depth, onElements) {
  try {
    const data = await overpass(query(box), { attempts: depth < 2 ? 3 : 6, pause: 10_000 });
    onElements(data.elements ?? []);
  } catch (e) {
    if (depth >= 2) throw e;
    console.warn(`split ${box.map((v) => v.toFixed(4)).join(',')}: ${e?.message}`);
    const [w, s, ee, n] = box;
    const mx = (w + ee) / 2;
    const my = (s + n) / 2;
    for (const sub of [
      [w, s, mx, my],
      [mx, s, ee, my],
      [w, my, mx, n],
      [mx, my, ee, n],
    ]) {
      await sleep(3000);
      await fetchBox(sub, depth + 1, onElements);
    }
  }
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

async function build(id) {
  const { wide, core: coreBox } = CITIES[id];
  const proj = projector(wide);
  const outDir = join(root, 'apps/web/public/geo', id);
  mkdirSync(outDir, { recursive: true });
  const geoFile = join(root, 'apps/web/src/city/geo', `${id}.json`);
  const geo = existsSync(geoFile) ? JSON.parse(readFileSync(geoFile, 'utf8')) : null;
  if (!geo) console.warn(`[${id}] no geo JSON: no water clamp or park trees`);
  const corner = (lon, lat) => proj.p(lon, lat).map(Math.round);
  const bounds = [...corner(wide[0], wide[3]), ...corner(wide[2], wide[1])];
  const core = [...corner(coreBox[0], coreBox[3]), ...corner(coreBox[2], coreBox[1])];
  const budget = Number(process.env.BUDGET_MB || 6) * 1024 * 1024;

  // ----- Overpass, chunk by chunk
  const seen = new Set();
  const seenOther = new Set();
  const buildings = [];
  const tagged = [];
  const streets = [];
  const boxes = chunkBox(wide, 0.05);
  for (const [k, box] of boxes.entries()) {
    console.log(`[${id}] chunk ${k + 1}/${boxes.length}`);
    await fetchBox(box, 0, (elements) => {
      buildings.push(...buildingsFrom(elements, proj, bounds, core, seen));
      for (const e of elements) {
        const t = e.tags ?? {};
        const key = `${e.type}/${e.id}`;
        if (e.type === 'node' && t.natural === 'tree' && !seenOther.has(key)) {
          seenOther.add(key);
          const [x, y] = proj.p(e.lon, e.lat);
          const h = parseLength(t.height);
          tagged.push({
            x,
            y,
            height: h > 1 && h < 80 ? h : 6 + hash01(x * 10, y * 10, 5) * 8,
            kind: 0,
          });
        } else if (e.type === 'way' && t.highway && e.geometry && !seenOther.has(key)) {
          seenOther.add(key);
          const pts = simplify(
            e.geometry.map((g) => proj.p(g.lon, g.lat)),
            2,
          );
          if (pts.length >= 2) streets.push(flat(pts));
        }
      }
    });
    await sleep(3000);
  }

  // ----- Buildings → tiles
  const resolved = resolveParts(buildings);
  const { list, minArea } = fitBudget(resolved, budget);
  const tiles = tileBuildings(list);
  for (const f of readdirSync(outDir))
    if (/^b-.*\.bin$/.test(f) || f === 'index.json') rmSync(join(outDir, f));
  const tileList = [];
  let bytes = 0;
  let count = 0;
  for (const { tx, ty, buildings: bs } of [...tiles.values()].sort(
    (a, b) => a.ty - b.ty || a.tx - b.tx,
  )) {
    // Big first, so a renderer streaming a tile can stop early.
    bs.sort((a, b) => b.area - a.area);
    const buf = encodeTile(tx, ty, bs);
    writeFileSync(join(outDir, `b-${tx}_${ty}.bin`), buf);
    tileList.push({ x: tx, y: ty, n: bs.length, bytes: buf.length });
    bytes += buf.length;
    count += bs.length;
  }
  const estimated = list.filter((b) => b.estimated).length;
  console.log(
    `[${id}] buildings ${count}/${resolved.length} (${buildings.length} incl. parts) in ${tileList.length} tiles, ${kb(bytes)}` +
      `${minArea ? `, dropped footprints < ${minArea} m² outside the core` : ''}, ${estimated} heights estimated`,
  );

  // ----- Terrain
  let terrain = null;
  try {
    const w = bounds[2] - bounds[0];
    const h = bounds[3] - bounds[1];
    const plan = terrainPlan(w, h, proj.origin[1]);
    const opts = { ...plan, bounds, inv: proj.inv };
    const fetched = await fetchTerrarium(opts);
    const got = [...fetched.values()].filter(Boolean).length;
    if (!got) throw new Error('no Terrarium tiles');
    const raw = sampleGrid({ ...opts, getTile: (z, x, y) => fetched.get(`${z}/${x}/${y}`) });
    const elev = clampWater(raw, plan.cols, plan.rows, bounds, geo?.land ?? [], geo?.water ?? []);
    const buf = encodeTerrain(plan.cols, plan.rows, bounds, elev);
    writeFileSync(join(outDir, 'terrain.bin'), buf);
    let lo = Infinity;
    let hi = -Infinity;
    for (const e of elev) {
      lo = Math.min(lo, e);
      hi = Math.max(hi, e);
    }
    terrain = {
      file: 'terrain.bin',
      cols: plan.cols,
      rows: plan.rows,
      zoom: plan.zoom,
      bounds,
      min: Math.round(lo * 10) / 10,
      max: Math.round(hi * 10) / 10,
      bytes: buf.length,
    };
    console.log(
      `[${id}] terrain ${plan.cols}×${plan.rows} z${plan.zoom} (${got} tiles) ${terrain.min}–${terrain.max} m, ${kb(buf.length)}`,
    );
  } catch (e) {
    console.warn(`::warning::[${id}] terrain skipped: ${e?.message}`);
  }

  // ----- Trees
  const trees = cityTrees({
    tagged,
    parks: geo?.parks ?? [],
    green: geo?.green ?? [],
    streets: streets.length ? streets : (geo?.roads?.residential ?? []).map((r) => r.l),
    water: geo?.water ?? [],
    bounds,
  });
  const treeBuf = encodeTrees(trees);
  writeFileSync(join(outDir, 'trees.bin'), treeBuf);
  const byKind = TREE_KINDS.map((k, i) => `${k} ${trees.filter((t) => t.kind === i).length}`);
  console.log(`[${id}] trees ${trees.length} (${byKind.join(', ')}), ${kb(treeBuf.length)}`);

  // ----- Index (last, so its presence means the city is complete)
  const total = bytes + (terrain?.bytes ?? 0) + treeBuf.length;
  const index = {
    format: FORMAT_VERSION,
    city: id,
    attribution: '© OpenStreetMap contributors',
    license: 'ODbL (buildings, trees); terrain: Mapzen Terrarium on AWS Open Data',
    origin: proj.origin.map((v) => Math.round(v * 1e6) / 1e6),
    bounds,
    core,
    tileSize: TILE_SIZE,
    levelHeight: LEVEL_HEIGHT,
    buildings: { count, bytes, minArea },
    tiles: tileList,
    terrain,
    trees: { file: 'trees.bin', count: trees.length, bytes: treeBuf.length },
    enums: { type: BUILDING_TYPES, roof: ROOF_SHAPES, material: MATERIALS, tree: TREE_KINDS },
    totalBytes: total,
  };
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index));
  console.log(`[${id}] total ${(total / 1024 / 1024).toFixed(2)} MB raw`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const only = process.argv.slice(2);
  for (const id of only.length ? only : Object.keys(CITIES)) {
    if (!CITIES[id]) throw new Error(`unknown city ${id}`);
    await build(id);
  }
}
