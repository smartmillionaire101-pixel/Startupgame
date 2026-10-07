/**
 * Buildings at full density for the 3D city (Wave 9 §A): OSM elements →
 * projected, simplified footprints with heights, roof, material and colour,
 * grouped into 1 km tiles. Pure functions (no network); tiles.mjs feeds them.
 */
import {
  BUILDING_TYPES,
  TILE_SIZE,
  buildingBytes,
  fitsTile,
  materialCode,
  parseColour,
  parseLength,
  roofCode,
  typeCode,
} from './format.mjs';
import { areaOf, centroid, hash01, pointInRing, rings, signedArea, simplifyRing } from './geom.mjs';

export const LEVEL_HEIGHT = 3.2;
/** Footprint simplification tolerance (metres): corners stay, near-collinear points go. */
export const SIMPLIFY_TOLERANCE = 0.5;

const T = Object.fromEntries(BUILDING_TYPES.map((t, i) => [t, i]));

/**
 * Levels by type when nothing is tagged: [lo, hi] for a small footprint and
 * for a large one, outside / inside the core. Heights in metres for the
 * one-volume types (industrial halls, churches, stadiums…).
 */
const LEVELS = {
  house: { small: [1, 2], large: [2, 3] },
  apartments: { small: [2, 4], large: [4, 7], core: [5, 12] },
  commercial: { small: [1, 3], large: [2, 4], core: [3, 10] },
  retail: { small: [1, 2], large: [1, 2], core: [2, 5] },
  office: { small: [2, 5], large: [4, 9], core: [8, 24] },
  civic: { small: [2, 3], large: [2, 4], core: [3, 6] },
  school: { small: [1, 2], large: [2, 4] },
  hospital: { small: [2, 4], large: [3, 7] },
  hotel: { small: [3, 6], large: [5, 12], core: [8, 22] },
  tower: { small: [12, 25], large: [18, 40] },
  parking: { small: [2, 4], large: [3, 6] },
  other: { small: [1, 2], large: [2, 4], core: [3, 8] },
};
const METRES = {
  industrial: [6, 11],
  religious: [10, 18],
  transport: [8, 15],
  stadium: [14, 26],
  garage: [2.6, 3.2],
  shed: [2.4, 3.4],
  roof: [4, 6],
  construction: [3, 9],
};

/**
 * A deterministic height estimate for an untagged building, from its type,
 * footprint area (m²), whether it is in the core, and a hash in [0, 1) of its
 * position. Returns { height (m), levels }.
 */
export function estimateHeight(type, area, core, h) {
  const name = BUILDING_TYPES[type] ?? 'other';
  const m = METRES[name];
  if (m) return { height: round1(m[0] + h * (m[1] - m[0])), levels: name === 'garage' ? 1 : 0 };
  const spec = LEVELS[name] ?? LEVELS.other;
  // Tiny footprints are sheds and kiosks whatever their tag.
  if (area < 40) return { height: round1(LEVEL_HEIGHT * (h < 0.7 ? 1 : 2)), levels: h < 0.7 ? 1 : 2 };
  const range = core && spec.core ? spec.core : area >= 600 ? spec.large : spec.small;
  // Bigger footprints lean to the top of the range.
  const lean = Math.min(1, Math.log10(Math.max(area, 40) / 40) / 2);
  const t = Math.min(0.999, h * 0.7 + lean * 0.3);
  const levels = range[0] + Math.floor(t * (range[1] - range[0] + 1));
  return { height: round1(levels * LEVEL_HEIGHT), levels };
}

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * Height, min height, levels and roof height of a building from its tags; the
 * estimate fills in when no height is tagged. `area` in m², `h` in [0, 1).
 */
export function heightOf(tags, type, area, core, h) {
  const levels = Number.parseFloat(tags['building:levels']);
  const minLevel = Number.parseFloat(tags['building:min_level']);
  const roofLevels = Number.parseFloat(tags['roof:levels']);
  let roofHeight = parseLength(tags['roof:height']);
  if (!(roofHeight >= 0) && roofLevels > 0) roofHeight = roofLevels * 3;
  if (!(roofHeight >= 0)) roofHeight = 0;
  let minHeight = parseLength(tags.min_height);
  if (!(minHeight >= 0)) minHeight = minLevel > 0 ? minLevel * LEVEL_HEIGHT : 0;
  let height = parseLength(tags.height);
  let estimated = false;
  let lv = levels > 0 ? Math.round(levels) : 0;
  if (!(height > 0)) {
    if (levels > 0) height = levels * LEVEL_HEIGHT + roofHeight;
    else {
      const est = estimateHeight(type, area, core, h);
      height = est.height;
      lv = est.levels;
      estimated = true;
    }
  }
  height = Math.min(height, 1000);
  if (height < minHeight + 1) height = minHeight + LEVEL_HEIGHT;
  roofHeight = Math.min(roofHeight, height - minHeight);
  return { height: round1(height), minHeight: round1(minHeight), levels: lv, roofHeight, estimated };
}

/** The outer rings ([[x, y], …], projected) of a way or multipolygon relation. */
export function outerRings(el, proj) {
  if (el.type === 'way' && el.geometry) return [el.geometry.map((g) => proj.p(g.lon, g.lat))];
  if (el.type === 'relation' && el.members) {
    const outer = el.members.filter((m) => m.role !== 'inner' && m.geometry).map((m) => m.geometry);
    return rings(outer).map((r) => r.map((g) => proj.p(g.lon, g.lat)));
  }
  return [];
}

const inBox = (x, y, [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/**
 * Buildings (and building parts) from OSM elements. `bounds` and `core` are
 * [minX, minY, maxX, maxY] in local metres; a footprint whose centroid falls
 * outside `bounds` is dropped. Elements are deduplicated by type and id via
 * `seen` (shared across Overpass chunks).
 */
export function buildingsFrom(elements, proj, bounds, core, seen = new Set()) {
  const out = [];
  for (const el of elements) {
    const t = el.tags ?? {};
    const isPart = !t.building && !!t['building:part'] && t['building:part'] !== 'no';
    if (!isPart && (!t.building || t.building === 'no')) continue;
    if (el.type !== 'way' && el.type !== 'relation') continue;
    const key = `${el.type}/${el.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const raw of outerRings(el, proj)) {
      const ring = simplifyRing(raw, SIMPLIFY_TOLERANCE);
      if (!ring) continue;
      if (signedArea(ring) < 0) ring.reverse();
      const area = areaOf(ring);
      if (area < 4) continue;
      const [cx, cy] = centroid(ring);
      if (!inBox(cx, cy, bounds)) continue;
      const inCore = inBox(cx, cy, core);
      const type = typeCode(isPart ? t['building:part'] : t.building);
      const h = hash01(cx * 10, cy * 10, area);
      const hgt = heightOf(t, type, area, inCore, h);
      out.push({
        points: ring,
        cx,
        cy,
        area,
        type,
        roof: roofCode(t['roof:shape']),
        material: materialCode(t['building:material'] ?? t['building:facade:material']),
        colour: parseColour(t['building:colour'] ?? t['building:facade:colour']),
        roofColour: parseColour(t['roof:colour']),
        ...hgt,
        part: isPart,
        core: inCore,
      });
    }
  }
  return out;
}

/**
 * Building parts replace the outline they sit in (Simple 3D Buildings): a
 * building whose parts cover at least 60% of its footprint is dropped, and
 * parts inherit the building's type, material and colours when untagged.
 */
export function resolveParts(list) {
  const parts = list.filter((b) => b.part);
  if (!parts.length) return list;
  const CELL = 100;
  const grid = new Map();
  for (const p of parts) {
    const k = `${Math.floor(p.cx / CELL)},${Math.floor(p.cy / CELL)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  const drop = new Set();
  for (const b of list) {
    if (b.part) continue;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of b.points) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    let covered = 0;
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
      for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++)
        for (const p of grid.get(`${gx},${gy}`) ?? []) {
          if (!pointInRing(p.cx, p.cy, b.points)) continue;
          covered += p.area;
          if (!p.type) p.type = b.type;
          if (!p.material) p.material = b.material;
          if (p.colour < 0) p.colour = b.colour;
          if (p.roofColour < 0) p.roofColour = b.roofColour;
        }
    if (covered >= 0.6 * b.area) drop.add(b);
  }
  return drop.size ? list.filter((b) => !drop.has(b)) : list;
}

/** Group buildings into 1 km tiles by centroid: Map "tx,ty" → { tx, ty, buildings }. */
export function tileBuildings(list) {
  const tiles = new Map();
  for (const b of list) {
    const tx = Math.floor(b.cx / TILE_SIZE);
    const ty = Math.floor(b.cy / TILE_SIZE);
    if (!fitsTile(b.points, tx, ty)) continue;
    const k = `${tx},${ty}`;
    if (!tiles.has(k)) tiles.set(k, { tx, ty, buildings: [] });
    tiles.get(k).buildings.push(b);
  }
  return tiles;
}

/**
 * Keep the total size within `budget` bytes: drop the smallest footprints
 * outside the core first (< 25 m², then 40, 60, 80 m²). Returns the list kept
 * and the area threshold used (0 when nothing was dropped).
 */
export function fitBudget(list, budget) {
  const total = (l) => 16 + l.reduce((s, b) => s + buildingBytes(b), 0);
  if (total(list) <= budget) return { list, minArea: 0 };
  let kept = list;
  let used = 0;
  for (const minArea of [25, 40, 60, 80, 120]) {
    used = minArea;
    kept = list.filter((b) => b.core || b.part || b.area >= minArea || !b.estimated);
    if (total(kept) <= budget) break;
    kept = list.filter((b) => b.core || b.part || b.area >= minArea);
    if (total(kept) <= budget) break;
  }
  return { list: kept, minArea: used };
}
