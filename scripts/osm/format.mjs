/**
 * Binary formats of the 3D city data (Wave 9 §A), written by tiles.mjs into
 * apps/web/public/geo/<city>/ and read by apps/web/src/city/geo3d/tiles.ts.
 * Everything is little-endian. Coordinates are in the city's local frame
 * (metres from the centre of its `wide` box, x east, y SOUTH: see geom.mjs),
 * the same frame as apps/web/src/city/geo/<city>.json.
 *
 * ── Building tile  b-<tx>_<ty>.bin  (format 1) ─────────────────────────────
 * A tile is TILE_SIZE (1000 m) square; tile (tx, ty) covers
 * x ∈ [tx·1000, tx·1000 + 1000), y ∈ [ty·1000, …). A building belongs to the
 * tile holding its centroid; its outline may cross the tile's edge.
 *
 *   header, 16 bytes
 *     0  u8[4]  magic "RWBT"
 *     4  u8     format version (1)
 *     5  u8[3]  reserved (0)
 *     8  i16    tx
 *    10  i16    ty
 *    12  u32    building count
 *   then per building:
 *     0  u16    n, the outline's point count (open ring: last ≠ first)
 *     2  u16    height in decimetres (top of the roof above the ground)
 *     4  u16    min height in decimetres (bottom of a raised part; usually 0)
 *     6  u8     type      (BUILDING_TYPES index)
 *     7  u8     roof shape (ROOF_SHAPES index)
 *     8  u8     material  (MATERIALS index)
 *     9  u8     levels (0 = unknown, capped at 255)
 *    10  u8     roof height in half metres (0 = none/unknown)
 *    11  u8     flags: FLAG_COLOUR, FLAG_ROOF_COLOUR, FLAG_ESTIMATED, FLAG_PART, FLAG_CORE
 *    12  u8[3]  wall colour r, g, b          (only when FLAG_COLOUR)
 *     …  u8[3]  roof colour r, g, b          (only when FLAG_ROOF_COLOUR)
 *     …  i16[2n] x, y of each point in decimetres from the tile's origin
 *               (tx·1000, ty·1000)
 *   Outlines are outer rings only (courtyards are filled), with positive
 *   shoelace area Σ(x₍ᵢ₋₁₎·yᵢ − xᵢ·y₍ᵢ₋₁₎) in the stored (x east, y south)
 *   coordinates: clockwise when drawn with north up.
 *
 * ── Terrain  terrain.bin  (format 1) ───────────────────────────────────────
 *     0  u8[4]  magic "RWTE"
 *     4  u8     version (1)
 *     5  u8[3]  reserved
 *     8  u16    cols
 *    10  u16    rows
 *    12  f32[4] minX, minY, maxX, maxY (metres, local frame)
 *    28  f32    base elevation (metres)
 *    32  i16[cols·rows] elevation − base, in decimetres, row-major from
 *               (minX, minY); sample (i, j) is at
 *               x = minX + i·(maxX − minX)/(cols − 1), y = minY + j·(maxY − minY)/(rows − 1).
 *   Sea and water areas are 0 m.
 *
 * ── Trees  trees.bin  (format 1) ───────────────────────────────────────────
 *     0  u8[4]  magic "RWTR"
 *     4  u8     version (1)
 *     5  u8     unit in decimetres (5 = 0.5 m, 10 = 1 m)
 *     6  u8[2]  reserved
 *     8  u32    count
 *    12  per tree, 6 bytes: i16 x, i16 y (in units), u8 height (m), u8 kind (TREE_KINDS index)
 */

export const FORMAT_VERSION = 1;
export const TILE_SIZE = 1000;

export const FLAG_COLOUR = 1;
export const FLAG_ROOF_COLOUR = 2;
/** The height was estimated (no height or levels tag). */
export const FLAG_ESTIMATED = 4;
/** A building:part (a tower's tier), not a whole building. */
export const FLAG_PART = 8;
/** Inside the city's busy `core` box. */
export const FLAG_CORE = 16;

export const BUILDING_TYPES = [
  'other',
  'house',
  'apartments',
  'commercial',
  'retail',
  'office',
  'industrial',
  'civic',
  'school',
  'hospital',
  'religious',
  'hotel',
  'transport',
  'garage',
  'shed',
  'stadium',
  'construction',
  'tower',
  'parking',
  'roof',
];

const TYPE_ALIASES = {
  house: 'house',
  detached: 'house',
  semidetached_house: 'house',
  bungalow: 'house',
  villa: 'house',
  farm: 'house',
  cabin: 'house',
  hut: 'house',
  static_caravan: 'house',
  residential: 'apartments',
  apartments: 'apartments',
  terrace: 'apartments',
  dormitory: 'apartments',
  commercial: 'commercial',
  retail: 'retail',
  supermarket: 'retail',
  kiosk: 'retail',
  mall: 'retail',
  office: 'office',
  industrial: 'industrial',
  warehouse: 'industrial',
  factory: 'industrial',
  manufacture: 'industrial',
  storage_tank: 'industrial',
  service: 'industrial',
  public: 'civic',
  civic: 'civic',
  government: 'civic',
  townhall: 'civic',
  fire_station: 'civic',
  museum: 'civic',
  library: 'civic',
  courthouse: 'civic',
  school: 'school',
  university: 'school',
  college: 'school',
  kindergarten: 'school',
  hospital: 'hospital',
  clinic: 'hospital',
  church: 'religious',
  cathedral: 'religious',
  chapel: 'religious',
  mosque: 'religious',
  temple: 'religious',
  synagogue: 'religious',
  shrine: 'religious',
  religious: 'religious',
  hotel: 'hotel',
  train_station: 'transport',
  transportation: 'transport',
  terminal: 'transport',
  hangar: 'transport',
  garage: 'garage',
  garages: 'garage',
  carport: 'garage',
  shed: 'shed',
  greenhouse: 'shed',
  stadium: 'stadium',
  sports_hall: 'stadium',
  grandstand: 'stadium',
  construction: 'construction',
  skyscraper: 'tower',
  tower: 'tower',
  parking: 'parking',
  roof: 'roof',
};

export const ROOF_SHAPES = [
  'unknown',
  'flat',
  'gabled',
  'hipped',
  'pyramidal',
  'dome',
  'skillion',
  'round',
  'onion',
  'mansard',
  'gambrel',
  'half-hipped',
  'cone',
  'sawtooth',
];

const ROOF_ALIASES = { half_hipped: 'half-hipped', pyramid: 'pyramidal', conical: 'cone' };

export const MATERIALS = [
  'unknown',
  'concrete',
  'brick',
  'glass',
  'stone',
  'wood',
  'metal',
  'plaster',
  'earth',
];

const MATERIAL_ALIASES = {
  concrete: 'concrete',
  cement_block: 'concrete',
  reinforced_concrete: 'concrete',
  brick: 'brick',
  glass: 'glass',
  mirror: 'glass',
  stone: 'stone',
  sandstone: 'stone',
  limestone: 'stone',
  granite: 'stone',
  marble: 'stone',
  wood: 'wood',
  timber_framing: 'wood',
  metal: 'metal',
  steel: 'metal',
  tin: 'metal',
  aluminium: 'metal',
  metal_plates: 'metal',
  plaster: 'plaster',
  stucco: 'plaster',
  render: 'plaster',
  mud: 'earth',
  adobe: 'earth',
  clay: 'earth',
};

export const TREE_KINDS = ['tagged', 'park', 'wood', 'street', 'grass'];

const norm = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .split(';')[0]
    .trim();

export const typeCode = (v) => {
  const t = TYPE_ALIASES[norm(v)];
  return t ? BUILDING_TYPES.indexOf(t) : 0;
};
export const roofCode = (v) => {
  const n = norm(v);
  const i = ROOF_SHAPES.indexOf(ROOF_ALIASES[n] ?? n);
  return i > 0 ? i : 0;
};
export const materialCode = (v) => {
  const m = MATERIAL_ALIASES[norm(v)];
  return m ? MATERIALS.indexOf(m) : 0;
};

const NAMED_COLOURS = {
  white: 0xffffff,
  black: 0x000000,
  grey: 0x808080,
  gray: 0x808080,
  lightgrey: 0xd3d3d3,
  lightgray: 0xd3d3d3,
  darkgrey: 0xa9a9a9,
  darkgray: 0xa9a9a9,
  silver: 0xc0c0c0,
  red: 0xb03a2e,
  darkred: 0x8b0000,
  maroon: 0x800000,
  brown: 0x8b5a2b,
  tan: 0xd2b48c,
  beige: 0xf5f5dc,
  cream: 0xfffdd0,
  ivory: 0xfffff0,
  wheat: 0xf5deb3,
  yellow: 0xf2d24b,
  orange: 0xe08a3c,
  pink: 0xf4b6c2,
  salmon: 0xfa8072,
  green: 0x4c8c4a,
  darkgreen: 0x006400,
  olive: 0x808000,
  blue: 0x3a6ea5,
  lightblue: 0xadd8e6,
  navy: 0x000080,
  teal: 0x008080,
  cyan: 0x00ffff,
  purple: 0x800080,
  gold: 0xffd700,
  sandybrown: 0xf4a460,
  peru: 0xcd853f,
  sienna: 0xa0522d,
  terracotta: 0xe2725b,
};

/** A CSS-ish colour tag (#rgb, #rrggbb or a common name) → 0xRRGGBB, or -1. */
export function parseColour(v) {
  const s = norm(v).replace(/[\s_-]/g, '');
  if (!s) return -1;
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex && (s.startsWith('#') || /\d/.test(s))) {
    const h = hex[1];
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    return Number.parseInt(full, 16);
  }
  return NAMED_COLOURS[s] ?? -1;
}

/** A length tag ("12", "12 m", "40 ft", "12'6\"") → metres, or NaN. */
export function parseLength(v) {
  if (v === undefined || v === null) return Number.NaN;
  const s = String(v).trim().toLowerCase().replace(',', '.');
  const feet = /^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*")?$/.exec(s);
  if (feet) return Number(feet[1]) * 0.3048 + Number(feet[2] ?? 0) * 0.0254;
  const m = /^(-?\d+(?:\.\d+)?)\s*(m|metres|meters|ft|feet)?$/.exec(s);
  if (!m) return Number.NaN;
  const n = Number(m[1]);
  return m[2] === 'ft' || m[2] === 'feet' ? n * 0.3048 : n;
}

// ---------------------------------------------------------------- encoders

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

/** Bytes one building takes in a tile. */
export const buildingBytes = (b) =>
  12 + (b.colour >= 0 ? 3 : 0) + (b.roofColour >= 0 ? 3 : 0) + 4 * b.points.length;

/**
 * Encode one tile. `buildings` are
 *   { points: [[x, y], …] (local metres, open ring), height, minHeight (m),
 *     type, roof, material, levels, roofHeight (m), colour, roofColour
 *     (0xRRGGBB or -1), estimated, part, core (booleans) }.
 * Returns a Uint8Array. Throws when a point is out of the i16 range.
 */
export function encodeTile(tx, ty, buildings) {
  const size = 16 + buildings.reduce((s, b) => s + buildingBytes(b), 0);
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);
  buf.set([0x52, 0x57, 0x42, 0x54], 0); // "RWBT"
  dv.setUint8(4, FORMAT_VERSION);
  dv.setInt16(8, tx, true);
  dv.setInt16(10, ty, true);
  dv.setUint32(12, buildings.length, true);
  const ox = tx * TILE_SIZE;
  const oy = ty * TILE_SIZE;
  let o = 16;
  for (const b of buildings) {
    if (b.points.length > 0xffff) throw new Error('too many points');
    dv.setUint16(o, b.points.length, true);
    dv.setUint16(o + 2, clampInt(b.height * 10, 0, 0xffff), true);
    dv.setUint16(o + 4, clampInt((b.minHeight ?? 0) * 10, 0, 0xffff), true);
    dv.setUint8(o + 6, b.type ?? 0);
    dv.setUint8(o + 7, b.roof ?? 0);
    dv.setUint8(o + 8, b.material ?? 0);
    dv.setUint8(o + 9, clampInt(b.levels ?? 0, 0, 255));
    dv.setUint8(o + 10, clampInt((b.roofHeight ?? 0) * 2, 0, 255));
    const colour = b.colour ?? -1;
    const roofColour = b.roofColour ?? -1;
    const flags =
      (colour >= 0 ? FLAG_COLOUR : 0) |
      (roofColour >= 0 ? FLAG_ROOF_COLOUR : 0) |
      (b.estimated ? FLAG_ESTIMATED : 0) |
      (b.part ? FLAG_PART : 0) |
      (b.core ? FLAG_CORE : 0);
    dv.setUint8(o + 11, flags);
    o += 12;
    for (const c of [colour, roofColour]) {
      if (c < 0) continue;
      buf[o] = (c >> 16) & 0xff;
      buf[o + 1] = (c >> 8) & 0xff;
      buf[o + 2] = c & 0xff;
      o += 3;
    }
    for (const [x, y] of b.points) {
      const qx = Math.round((x - ox) * 10);
      const qy = Math.round((y - oy) * 10);
      if (qx < -32768 || qx > 32767 || qy < -32768 || qy > 32767)
        throw new RangeError(`point out of tile range: ${x}, ${y}`);
      dv.setInt16(o, qx, true);
      dv.setInt16(o + 2, qy, true);
      o += 4;
    }
  }
  return buf;
}

/** Whether every point of a ring fits the i16 decimetre range of tile (tx, ty). */
export function fitsTile(points, tx, ty) {
  const ox = tx * TILE_SIZE;
  const oy = ty * TILE_SIZE;
  return points.every(([x, y]) => Math.abs(x - ox) < 3276 && Math.abs(y - oy) < 3276);
}

/**
 * Encode a terrain grid. `elev` is a row-major array of cols·rows metres;
 * `bounds` is [minX, minY, maxX, maxY].
 */
export function encodeTerrain(cols, rows, bounds, elev) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of elev) {
    lo = Math.min(lo, e);
    hi = Math.max(hi, e);
  }
  if (!Number.isFinite(lo)) lo = hi = 0;
  // Centre the range so ±3276.7 m around the base covers it.
  const base = Math.round((lo + hi) / 2);
  const buf = new Uint8Array(32 + 2 * cols * rows);
  const dv = new DataView(buf.buffer);
  buf.set([0x52, 0x57, 0x54, 0x45], 0); // "RWTE"
  dv.setUint8(4, FORMAT_VERSION);
  dv.setUint16(8, cols, true);
  dv.setUint16(10, rows, true);
  bounds.forEach((v, i) => dv.setFloat32(12 + 4 * i, v, true));
  dv.setFloat32(28, base, true);
  for (let i = 0; i < cols * rows; i++)
    dv.setInt16(32 + 2 * i, clampInt((elev[i] - base) * 10, -32768, 32767), true);
  return buf;
}

/** Encode trees: [{ x, y, height (m), kind (TREE_KINDS index) }]. */
export function encodeTrees(trees) {
  let max = 0;
  for (const t of trees) max = Math.max(max, Math.abs(t.x), Math.abs(t.y));
  const unit = max * 2 < 32000 ? 5 : 10; // decimetres per unit
  const buf = new Uint8Array(12 + 6 * trees.length);
  const dv = new DataView(buf.buffer);
  buf.set([0x52, 0x57, 0x54, 0x52], 0); // "RWTR"
  dv.setUint8(4, FORMAT_VERSION);
  dv.setUint8(5, unit);
  dv.setUint32(8, trees.length, true);
  let o = 12;
  for (const t of trees) {
    dv.setInt16(o, clampInt((t.x * 10) / unit, -32768, 32767), true);
    dv.setInt16(o + 2, clampInt((t.y * 10) / unit, -32768, 32767), true);
    dv.setUint8(o + 4, clampInt(t.height, 1, 255));
    dv.setUint8(o + 5, t.kind ?? 0);
    o += 6;
  }
  return buf;
}
