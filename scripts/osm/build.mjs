/**
 * Real city maps from OpenStreetMap (© OpenStreetMap contributors, ODbL).
 *
 * Runs in GitHub Actions (.github/workflows/osm-maps.yml), which can reach the
 * Overpass API; the result is committed as compact JSON in
 * apps/web/src/city/geo/<city>.json and nothing is fetched at runtime.
 *
 * Per city: land (from the OSM land polygons clipped by ogr2ogr into
 * scripts/osm/work/land-<city>.geojson), water, rivers, parks, roads by class,
 * bridges, rail, airport, building outlines in the centre (and tall buildings
 * everywhere), and named neighbourhoods and landmarks. Coordinates are metres
 * from the city's centre (x east, y south), rounded to whole metres, and
 * stored as flat [x, y, x, y, …] arrays.
 *
 *   node scripts/osm/build.mjs [city …]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITIES } from './cities.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const outDir = join(root, 'apps/web/src/city/geo');
const work = join(here, 'work');
mkdirSync(outDir, { recursive: true });

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  let last;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'runway-startup-game-map-builder',
        },
        body: 'data=' + encodeURIComponent(query),
      });
      if (res.ok) return await res.json();
      last = new Error(`${url} ${res.status} ${(await res.text()).slice(0, 200)}`);
    } catch (e) {
      last = e;
    }
    console.warn(`overpass retry ${attempt + 1}: ${last?.message}`);
    await sleep(15_000 * (attempt + 1));
  }
  throw last;
}

const bb = ([w, s, e, n]) => `${s},${w},${n},${e}`;

// ---------------------------------------------------------------- geometry

function projector(wide) {
  const lon0 = (wide[0] + wide[2]) / 2;
  const lat0 = (wide[1] + wide[3]) / 2;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_540;
  return {
    origin: [lon0, lat0],
    p: (lon, lat) => [(lon - lon0) * kx, -(lat - lat0) * ky],
  };
}

/** Douglas–Peucker on [[x, y], …]. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    let best = -1;
    let bestD = t2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const flat = (pts) => pts.flatMap(([x, y]) => [Math.round(x), Math.round(y)]);

function line(geom, proj, tol) {
  const pts = simplify(
    geom.map((g) => proj.p(g.lon, g.lat)),
    tol,
  );
  return pts.length >= 2 ? flat(pts) : null;
}

function areaOf(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
}

/** Join way segments (arrays of {lat, lon}) end to end into closed rings. */
function rings(segments) {
  const key = (g) => `${g.lat.toFixed(7)},${g.lon.toFixed(7)}`;
  const left = segments.filter((s) => s.length >= 2).map((s) => s.slice());
  const out = [];
  while (left.length) {
    let ring = left.shift();
    let grew = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const s = left[i];
        const end = key(ring[ring.length - 1]);
        if (key(s[0]) === end) ring = ring.concat(s.slice(1));
        else if (key(s[s.length - 1]) === end) ring = ring.concat(s.slice(0, -1).reverse());
        else continue;
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (key(ring[0]) === key(ring[ring.length - 1]) && ring.length >= 4) out.push(ring);
  }
  return out;
}

/** Polygons (outer rings only, holes dropped for size) from ways and multipolygon relations. */
function polygons(elements, proj, tol, minArea = 0) {
  const out = [];
  const add = (geom) => {
    const pts = simplify(
      geom.map((g) => proj.p(g.lon, g.lat)),
      tol,
    );
    if (pts.length >= 4 && areaOf(pts) >= minArea) out.push(flat(pts));
  };
  for (const el of elements) {
    if (el.type === 'way' && el.geometry) add(el.geometry);
    else if (el.type === 'relation' && el.members) {
      const outer = el.members
        .filter((m) => m.role !== 'inner' && m.geometry)
        .map((m) => m.geometry);
      for (const r of rings(outer)) add(r);
    }
  }
  return out;
}

// ---------------------------------------------------------------- per city

const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential'];
const roadClass = (hw) =>
  hw.startsWith('motorway')
    ? 'motorway'
    : hw.startsWith('trunk')
      ? 'trunk'
      : hw.startsWith('primary')
        ? 'primary'
        : hw.startsWith('secondary')
          ? 'secondary'
          : hw.startsWith('tertiary')
            ? 'tertiary'
            : 'residential';

async function build(id) {
  const { wide, core } = CITIES[id];
  const proj = projector(wide);
  const W = bb(wide);
  const C = bb(core);

  const wideQ = `[out:json][timeout:240];(
    way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|secondary)$"](${W});
    way["railway"="rail"](${W});
    way["natural"="water"](${W}); relation["natural"="water"](${W});
    way["waterway"~"^(river|canal)$"](${W});
    way["water"~"^(river|lagoon|lake|reservoir)$"](${W}); relation["water"~"^(river|lagoon|lake)$"](${W});
    way["leisure"~"^(park|golf_course)$"](${W}); relation["leisure"="park"](${W});
    way["landuse"~"^(forest|grass)$"](${W}); way["natural"~"^(wood|beach|sand)$"](${W});
    way["aeroway"~"^(aerodrome|runway)$"](${W});
    node["place"~"^(suburb|neighbourhood|quarter|island)$"]["name"](${W});
    node["tourism"~"^(attraction|museum|viewpoint)$"]["name"](${W});
    way["tourism"="attraction"]["name"](${W});
    way["building"]["building:levels"~"^([2-9][0-9]|1[2-9])$"](${W});
    way["building"]["height"~"^([4-9][0-9]|[1-9][0-9][0-9])"](${W});
  );out geom;`;
  const coreQ = `[out:json][timeout:240];(
    way["highway"~"^(tertiary|tertiary_link|residential|unclassified|living_street|pedestrian)$"](${C});
    way["building"](${C});
  );out geom;`;

  console.log(`[${id}] wide…`);
  const wideData = await overpass(wideQ);
  await sleep(5000);
  console.log(`[${id}] core…`);
  const coreData = await overpass(coreQ);
  const els = [...wideData.elements, ...coreData.elements];
  const tags = (e) => e.tags ?? {};

  const roads = Object.fromEntries(ROAD_CLASSES.map((c) => [c, []]));
  const bridges = [];
  const rail = [];
  const rivers = [];
  const waterEls = [];
  const parkEls = [];
  const greenEls = [];
  const beachEls = [];
  const airportEls = [];
  const runways = [];
  const buildings = [];
  const places = [];
  const landmarks = [];
  const seenBuilding = new Set();

  for (const e of els) {
    const t = tags(e);
    if (t.highway && e.type === 'way' && e.geometry) {
      const cls = roadClass(t.highway);
      const l = line(e.geometry, proj, cls === 'residential' || cls === 'tertiary' ? 2.5 : 6);
      if (!l) continue;
      if (t.bridge === 'yes' || t.bridge === 'viaduct')
        bridges.push({ c: cls, n: t.name ?? null, l });
      else roads[cls].push(t.name ? { n: t.name, l } : { l });
    } else if (t.railway === 'rail' && e.geometry) {
      const l = line(e.geometry, proj, 8);
      if (l) rail.push(l);
    } else if (t.waterway && e.type === 'way' && e.geometry) {
      const l = line(e.geometry, proj, 6);
      if (l) rivers.push(l);
    } else if (t.natural === 'water' || t.water) waterEls.push(e);
    else if (t.leisure === 'park' || t.leisure === 'golf_course') parkEls.push(e);
    else if (t.landuse === 'forest' || t.landuse === 'grass' || t.natural === 'wood')
      greenEls.push(e);
    else if (t.natural === 'beach' || t.natural === 'sand') beachEls.push(e);
    else if (t.aeroway === 'aerodrome') airportEls.push(e);
    else if (t.aeroway === 'runway' && e.geometry) {
      const l = line(e.geometry, proj, 10);
      if (l) runways.push(l);
    } else if (t.building && e.type === 'way' && e.geometry && !seenBuilding.has(e.id)) {
      seenBuilding.add(e.id);
      const pts = simplify(
        e.geometry.map((g) => proj.p(g.lon, g.lat)),
        1.5,
      );
      if (pts.length < 4) continue;
      const a = areaOf(pts);
      const levels =
        Number.parseFloat(t['building:levels']) || (Number.parseFloat(t.height) || 0) / 3.2 || 0;
      buildings.push({
        p: flat(pts.slice(0, -1)),
        h: Math.round(levels) || undefined,
        a,
        n: t.name ?? undefined,
      });
    } else if (e.type === 'node' && t.place && t.name) {
      const [x, y] = proj.p(e.lon, e.lat);
      places.push({ n: t.name, k: t.place, x: Math.round(x), y: Math.round(y) });
    } else if (t.tourism && t.name) {
      const g = e.type === 'node' ? e : e.geometry?.[0];
      if (!g) continue;
      const [x, y] = proj.p(g.lon, g.lat);
      landmarks.push({ n: t.name, k: t.tourism, x: Math.round(x), y: Math.round(y) });
    }
  }

  // Size: keep the biggest building outlines in the centre, every tall one.
  buildings.sort((a, b) => (b.h ?? 0) * 1e6 + b.a - ((a.h ?? 0) * 1e6 + a.a));
  const keptBuildings = buildings
    .slice(0, 6000)
    .map(({ p, h, n }) => ({ p, ...(h ? { h } : {}), ...(n && h && h >= 12 ? { n } : {}) }));

  // Land: the OSM land polygons clipped to this city (made by ogr2ogr in CI).
  const land = [];
  const landFile = join(work, `land-${id}.geojson`);
  if (existsSync(landFile)) {
    const g = JSON.parse(readFileSync(landFile, 'utf8'));
    for (const f of g.features) {
      const geom = f.geometry;
      const ps =
        geom?.type === 'Polygon'
          ? [geom.coordinates]
          : geom?.type === 'MultiPolygon'
            ? geom.coordinates
            : [];
      for (const poly of ps) {
        const outer = simplify(
          poly[0].map(([lon, lat]) => proj.p(lon, lat)),
          4,
        );
        if (outer.length >= 4) land.push(flat(outer));
      }
    }
  } else console.warn(`[${id}] no land file: the whole box is land`);

  const corners = [proj.p(wide[0], wide[3]), proj.p(wide[2], wide[1])];
  const coreCorners = [proj.p(core[0], core[3]), proj.p(core[2], core[1])];
  const out = {
    city: id,
    attribution: '© OpenStreetMap contributors',
    origin: proj.origin.map((v) => Math.round(v * 1e6) / 1e6),
    bounds: [...corners[0], ...corners[1]].map(Math.round),
    core: [...coreCorners[0], ...coreCorners[1]].map(Math.round),
    land,
    water: polygons(waterEls, proj, 4, 400),
    rivers,
    parks: polygons(parkEls, proj, 4, 1500),
    green: polygons(greenEls, proj, 6, 4000),
    beach: polygons(beachEls, proj, 5, 1500),
    airport: polygons(airportEls, proj, 10),
    runways,
    roads,
    bridges,
    rail,
    buildings: keptBuildings,
    places,
    landmarks,
  };
  const json = JSON.stringify(out);
  writeFileSync(join(outDir, `${id}.json`), json);
  console.log(
    `[${id}] ${Math.round(json.length / 1024)} KB · land ${land.length} · roads ${ROAD_CLASSES.map((c) => `${c} ${roads[c].length}`).join(' ')} · bridges ${bridges.length} · buildings ${keptBuildings.length}/${buildings.length} · places ${places.length} · landmarks ${landmarks.length}`,
  );
}

const only = process.argv.slice(2);
for (const id of only.length ? only : Object.keys(CITIES)) {
  await build(id);
  await sleep(8000);
}
