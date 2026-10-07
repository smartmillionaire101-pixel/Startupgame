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
import { areaOf, bb, flat, projector, rings, simplify } from './geom.mjs';
import { overpass, sleep } from './overpass.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const outDir = join(root, 'apps/web/src/city/geo');
const work = join(here, 'work');
mkdirSync(outDir, { recursive: true });

function line(geom, proj, tol) {
  const pts = simplify(
    geom.map((g) => proj.p(g.lon, g.lat)),
    tol,
  );
  return pts.length >= 2 ? flat(pts) : null;
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
