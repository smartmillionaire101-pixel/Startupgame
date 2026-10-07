/**
 * The 3D city data (Wave 9 §A). Runs in GitHub Actions after build.mjs and
 * overture.py (.github/workflows/osm-maps.yml) and writes, per city, into
 * apps/web/public/geo/<city>/:
 *
 *   b-<tx>_<ty>.bin  every building in the `wide` box, in 1 km tiles, from
 *                    Overture Maps (OpenStreetMap plus Microsoft and Google
 *                    footprints), exported by overture.py to
 *                    scripts/osm/work/buildings-<city>.ndjson
 *   terrain.bin      an elevation grid over `wide` (AWS Terrarium; water at 0 m)
 *   trees.bin        tree points: mapped trees and residential streets from
 *                    Overpass (optional: on failure the geo JSON's streets are
 *                    used), plus samples in the geo JSON's parks and woods
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
import { LEVEL_HEIGHT, fitBudget, resolveParts, tileBuildings } from './buildings.mjs';
import { bb, flat, hash01, projector, simplify } from './geom.mjs';
import { readOverture } from './overture.mjs';
import { overpass, sleep } from './overpass.mjs';
import { clampWater, fetchTerrarium, sampleGrid, terrainPlan } from './terrain.mjs';
import { cityTrees } from './trees.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

export const ATTRIBUTION =
  '© OpenStreetMap contributors, Overture Maps Foundation; includes data from Microsoft and Google Open Buildings under ODbL/CDLA';

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

/** The small Overpass query: mapped trees and residential streets. */
const query = (box) => `[out:json][timeout:120];(
  node["natural"="tree"](${bb(box)});
  way["highway"~"^(residential|living_street)$"](${bb(box)});
);out body geom qt;`;

/**
 * Mapped trees and residential streets from Overpass, chunk by chunk. Never
 * fatal: returns { tagged, streets, ok }, ok false when any chunk failed (the
 * caller then plants street trees along the geo JSON's streets instead).
 */
async function overpassTrees(id, wide, proj) {
  const seen = new Set();
  const tagged = [];
  const streets = [];
  let ok = true;
  const boxes = chunkBox(wide, 0.05);
  for (const [k, box] of boxes.entries()) {
    try {
      const data = await overpass(query(box), { attempts: 2, pause: 5000 });
      for (const e of data.elements ?? []) {
        const t = e.tags ?? {};
        const key = `${e.type}/${e.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (e.type === 'node' && t.natural === 'tree') {
          const [x, y] = proj.p(e.lon, e.lat);
          const h = parseLength(t.height);
          tagged.push({
            x,
            y,
            height: h > 1 && h < 80 ? h : 6 + hash01(x * 10, y * 10, 5) * 8,
            kind: 0,
          });
        } else if (e.type === 'way' && t.highway && e.geometry) {
          const pts = simplify(
            e.geometry.map((g) => proj.p(g.lon, g.lat)),
            2,
          );
          if (pts.length >= 2) streets.push(flat(pts));
        }
      }
    } catch (e) {
      ok = false;
      console.warn(`[${id}] trees chunk ${k + 1}/${boxes.length} failed: ${e?.message}`);
    }
    await sleep(2000);
  }
  return { tagged, streets, ok };
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

export async function build(id) {
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

  // ----- Buildings (Overture export) → tiles
  const ndjson = join(here, 'work', `buildings-${id}.ndjson`);
  if (!existsSync(ndjson)) throw new Error(`${ndjson} missing: run overture.py first`);
  const metaFile = join(here, 'work', `buildings-${id}.meta.json`);
  const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
  const { buildings, rows } = await readOverture(ndjson, proj, bounds, core);
  const resolved = resolveParts(buildings);
  const { list, minArea, dropped } = fitBudget(resolved, budget, core);
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
    `[${id}] Overture ${meta.release ?? '?'}: ${rows} rows → ${buildings.length} footprints → ${count} kept in ${tileList.length} tiles, ${kb(bytes)}` +
      `${dropped ? `; dropped ${dropped} small ones outside the core (cut-off ${minArea} m² at the core's edge)` : ''}; ${estimated} heights estimated`,
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
  const { tagged, streets, ok } = await overpassTrees(id, wide, proj);
  if (!ok) console.warn(`[${id}] Overpass incomplete: street trees from the geo JSON`);
  const trees = cityTrees({
    tagged,
    parks: geo?.parks ?? [],
    green: geo?.green ?? [],
    streets: ok && streets.length ? streets : (geo?.roads?.residential ?? []).map((r) => r.l),
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
    attribution: ATTRIBUTION,
    license:
      'Buildings: Overture Maps (ODbL; CDLA Permissive 2.0 for ML footprints); trees: OpenStreetMap (ODbL); terrain: Mapzen Terrarium on AWS Open Data',
    sources: { overture: meta.release ?? null },
    origin: proj.origin.map((v) => Math.round(v * 1e6) / 1e6),
    bounds,
    core,
    tileSize: TILE_SIZE,
    levelHeight: LEVEL_HEIGHT,
    buildings: { count, bytes, minArea, dropped },
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
