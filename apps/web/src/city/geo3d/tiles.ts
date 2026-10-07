/**
 * Wave 9 §A: decoders for the 3D city data that scripts/osm/tiles.mjs writes
 * into apps/web/public/geo/<city>/ (served as static files, fetched lazily by
 * the viewport, never bundled). The byte layouts are documented in
 * scripts/osm/format.mjs; everything is little-endian.
 *
 * Frame: metres from the centre of the city's `wide` box, x EAST and y SOUTH,
 * the same frame as apps/web/src/city/geo/<city>.json (geo.ts).
 *
 *   index.json        GeoIndex: tiles, bounds, origin, enums, attribution
 *   b-<tx>_<ty>.bin   decodeBuildingTile → BuildingTile (1 km tiles)
 *   terrain.bin       decodeTerrain → Terrain (elevationAt for any x, y)
 *   trees.bin         decodeTrees → Trees
 *
 * Data © OpenStreetMap contributors (ODbL); terrain from the Mapzen Terrarium
 * tiles on AWS Open Data. Show `attribution` wherever the map is drawn.
 */

export const GEO3D_FORMAT = 1;
export const TILE_SIZE = 1000;

/** Building types (the `type` byte). Kept equal to scripts/osm/format.mjs. */
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
] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];

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
] as const;
export type RoofShape = (typeof ROOF_SHAPES)[number];

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
] as const;
export type Material = (typeof MATERIALS)[number];

export const TREE_KINDS = ['tagged', 'park', 'wood', 'street', 'grass'] as const;
export type TreeKind = (typeof TREE_KINDS)[number];

export const FLAG_COLOUR = 1;
export const FLAG_ROOF_COLOUR = 2;
/** The height is an estimate (no height or levels tag in OSM). */
export const FLAG_ESTIMATED = 4;
/** A building:part (a tier of a tower), not a whole building. */
export const FLAG_PART = 8;
/** Inside the city's busy `core` box. */
export const FLAG_CORE = 16;

/** apps/web/public/geo/<city>/index.json */
export interface GeoIndex {
  format: number;
  city: string;
  attribution: string;
  license: string;
  /** [lon, lat] of the frame's centre. */
  origin: [number, number];
  /** [minX, minY, maxX, maxY] in metres (y south): the `wide` box. */
  bounds: [number, number, number, number];
  core: [number, number, number, number];
  tileSize: number;
  /** Metres per storey used for levels → height. */
  levelHeight: number;
  /** minArea: footprints below it (m²) outside the core were dropped for size (0 = none). */
  buildings: { count: number; bytes: number; minArea: number };
  /** Tiles that exist; tile (x, y) covers [x·tileSize, (x+1)·tileSize) × [y·tileSize, …). */
  tiles: { x: number; y: number; n: number; bytes: number }[];
  terrain: {
    file: string;
    cols: number;
    rows: number;
    zoom: number;
    bounds: [number, number, number, number];
    min: number;
    max: number;
    bytes: number;
  } | null;
  trees: { file: string; count: number; bytes: number };
  enums: { type: string[]; roof: string[]; material: string[]; tree: string[] };
  totalBytes: number;
}

/**
 * One decoded tile, as flat typed arrays (ready for merged geometry).
 * Building i's outline is points [start[i], start[i] + count[i]) of `xy`,
 * an open ring in absolute local metres, clockwise with north up.
 */
export interface BuildingTile {
  tx: number;
  ty: number;
  length: number;
  /** x, y pairs (metres, local frame). */
  xy: Float32Array;
  /** Index of each building's first point (in points, not floats). */
  start: Uint32Array;
  /** Point count of each building. */
  count: Uint16Array;
  /** Metres above the ground: top (roof included) and bottom (raised parts). */
  height: Float32Array;
  minHeight: Float32Array;
  /** Metres of roof (0 when unknown or flat). */
  roofHeight: Float32Array;
  /** Storeys (0 = unknown). */
  levels: Uint8Array;
  type: Uint8Array;
  roof: Uint8Array;
  material: Uint8Array;
  flags: Uint8Array;
  /** 0xRRGGBB, or -1 when not tagged. */
  colour: Int32Array;
  roofColour: Int32Array;
}

export interface Terrain {
  cols: number;
  rows: number;
  /** [minX, minY, maxX, maxY] in metres: the grid's corner samples. */
  bounds: [number, number, number, number];
  /** Row-major metres from (minX, minY); water and sea are 0. */
  elev: Float32Array;
}

export interface Trees {
  length: number;
  /** x, y pairs (metres, local frame). */
  xy: Float32Array;
  /** Metres. */
  height: Uint8Array;
  /** TREE_KINDS index. */
  kind: Uint8Array;
}

export class GeoFormatError extends Error {}

const magic = (dv: DataView, s: string) => {
  if (dv.byteLength < 8) throw new GeoFormatError('too short');
  for (let i = 0; i < 4; i++)
    if (dv.getUint8(i) !== s.charCodeAt(i)) throw new GeoFormatError(`not a ${s} file`);
  const v = dv.getUint8(4);
  if (v !== GEO3D_FORMAT) throw new GeoFormatError(`unsupported ${s} version ${v}`);
};

const view = (buf: ArrayBuffer | ArrayBufferView) =>
  buf instanceof ArrayBuffer
    ? new DataView(buf)
    : new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

/** Decode a b-<tx>_<ty>.bin tile. */
export function decodeBuildingTile(buf: ArrayBuffer | ArrayBufferView): BuildingTile {
  const dv = view(buf);
  magic(dv, 'RWBT');
  const tx = dv.getInt16(8, true);
  const ty = dv.getInt16(10, true);
  const n = dv.getUint32(12, true);
  const ox = tx * TILE_SIZE;
  const oy = ty * TILE_SIZE;
  // First pass: point total.
  let o = 16;
  let points = 0;
  for (let i = 0; i < n; i++) {
    if (o + 12 > dv.byteLength) throw new GeoFormatError('truncated tile');
    const c = dv.getUint16(o, true);
    const f = dv.getUint8(o + 11);
    points += c;
    o += 12 + (f & FLAG_COLOUR ? 3 : 0) + (f & FLAG_ROOF_COLOUR ? 3 : 0) + 4 * c;
  }
  if (o > dv.byteLength) throw new GeoFormatError('truncated tile');
  const t: BuildingTile = {
    tx,
    ty,
    length: n,
    xy: new Float32Array(points * 2),
    start: new Uint32Array(n),
    count: new Uint16Array(n),
    height: new Float32Array(n),
    minHeight: new Float32Array(n),
    roofHeight: new Float32Array(n),
    levels: new Uint8Array(n),
    type: new Uint8Array(n),
    roof: new Uint8Array(n),
    material: new Uint8Array(n),
    flags: new Uint8Array(n),
    colour: new Int32Array(n),
    roofColour: new Int32Array(n),
  };
  o = 16;
  let p = 0;
  const rgb = () => {
    const c = (dv.getUint8(o) << 16) | (dv.getUint8(o + 1) << 8) | dv.getUint8(o + 2);
    o += 3;
    return c;
  };
  for (let i = 0; i < n; i++) {
    const c = dv.getUint16(o, true);
    t.count[i] = c;
    t.start[i] = p;
    t.height[i] = dv.getUint16(o + 2, true) / 10;
    t.minHeight[i] = dv.getUint16(o + 4, true) / 10;
    t.type[i] = dv.getUint8(o + 6);
    t.roof[i] = dv.getUint8(o + 7);
    t.material[i] = dv.getUint8(o + 8);
    t.levels[i] = dv.getUint8(o + 9);
    t.roofHeight[i] = dv.getUint8(o + 10) / 2;
    const f = dv.getUint8(o + 11);
    t.flags[i] = f;
    o += 12;
    t.colour[i] = f & FLAG_COLOUR ? rgb() : -1;
    t.roofColour[i] = f & FLAG_ROOF_COLOUR ? rgb() : -1;
    for (let k = 0; k < c; k++, p++, o += 4) {
      t.xy[2 * p] = ox + dv.getInt16(o, true) / 10;
      t.xy[2 * p + 1] = oy + dv.getInt16(o + 2, true) / 10;
    }
  }
  return t;
}

/** Decode terrain.bin. */
export function decodeTerrain(buf: ArrayBuffer | ArrayBufferView): Terrain {
  const dv = view(buf);
  magic(dv, 'RWTE');
  const cols = dv.getUint16(8, true);
  const rows = dv.getUint16(10, true);
  if (cols < 2 || rows < 2 || dv.byteLength < 32 + 2 * cols * rows)
    throw new GeoFormatError('truncated terrain');
  const bounds: [number, number, number, number] = [
    dv.getFloat32(12, true),
    dv.getFloat32(16, true),
    dv.getFloat32(20, true),
    dv.getFloat32(24, true),
  ];
  const base = dv.getFloat32(28, true);
  const elev = new Float32Array(cols * rows);
  for (let i = 0; i < elev.length; i++) elev[i] = base + dv.getInt16(32 + 2 * i, true) / 10;
  return { cols, rows, bounds, elev };
}

/** Ground height (metres) at local (x, y), bilinear; clamped at the grid's edge. */
export function elevationAt(t: Terrain, x: number, y: number): number {
  const [x0, y0, x1, y1] = t.bounds;
  const fx = Math.min(t.cols - 1, Math.max(0, ((x - x0) / (x1 - x0)) * (t.cols - 1)));
  const fy = Math.min(t.rows - 1, Math.max(0, ((y - y0) / (y1 - y0)) * (t.rows - 1)));
  const i = Math.min(t.cols - 2, Math.floor(fx));
  const j = Math.min(t.rows - 2, Math.floor(fy));
  const ax = fx - i;
  const ay = fy - j;
  const e = t.elev;
  const at = (ii: number, jj: number) => e[jj * t.cols + ii] ?? 0;
  const top = at(i, j) * (1 - ax) + at(i + 1, j) * ax;
  const bot = at(i, j + 1) * (1 - ax) + at(i + 1, j + 1) * ax;
  return top * (1 - ay) + bot * ay;
}

/** Decode trees.bin. */
export function decodeTrees(buf: ArrayBuffer | ArrayBufferView): Trees {
  const dv = view(buf);
  magic(dv, 'RWTR');
  const unit = dv.getUint8(5) / 10;
  const n = dv.getUint32(8, true);
  if (dv.byteLength < 12 + 6 * n) throw new GeoFormatError('truncated trees');
  const xy = new Float32Array(2 * n);
  const height = new Uint8Array(n);
  const kind = new Uint8Array(n);
  for (let i = 0, o = 12; i < n; i++, o += 6) {
    xy[2 * i] = dv.getInt16(o, true) * unit;
    xy[2 * i + 1] = dv.getInt16(o + 2, true) * unit;
    height[i] = dv.getUint8(o + 4);
    kind[i] = dv.getUint8(o + 5);
  }
  return { length: n, xy, height, kind };
}

// ---------------------------------------------------------------------------
// Locating and fetching (static files under /geo/<city>/).

export const geoBase = (city: string) => `/geo/${encodeURIComponent(city)}`;
export const indexUrl = (city: string) => `${geoBase(city)}/index.json`;
export const tileUrl = (city: string, tx: number, ty: number) =>
  `${geoBase(city)}/b-${tx}_${ty}.bin`;

/** The tile (tx, ty) holding local point (x, y). */
export const tileOf = (x: number, y: number, size = TILE_SIZE): [number, number] => [
  Math.floor(x / size),
  Math.floor(y / size),
];

/** Tiles of an index that meet the box [minX, minY, maxX, maxY] (metres). */
export function tilesInView(index: GeoIndex, [x0, y0, x1, y1]: readonly number[]) {
  const s = index.tileSize;
  return index.tiles.filter(
    (t) =>
      (t.x + 1) * s > (x0 ?? -Infinity) &&
      t.x * s < (x1 ?? Infinity) &&
      (t.y + 1) * s > (y0 ?? -Infinity) &&
      t.y * s < (y1 ?? Infinity),
  );
}

/** Fetch a binary file; resolves null on 404 or when it is not ours (an SPA fallback page). */
async function fetchBin<T>(url: string, decode: (b: ArrayBuffer) => T): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  try {
    return decode(await res.arrayBuffer());
  } catch (e) {
    if (e instanceof GeoFormatError) return null;
    throw e;
  }
}

/** A city's index.json, or null when the city has no 3D data yet. */
export async function loadGeoIndex(city: string): Promise<GeoIndex | null> {
  const res = await fetch(indexUrl(city));
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
  const j = (await res.json()) as GeoIndex;
  return j.format === GEO3D_FORMAT ? j : null;
}

export const loadBuildingTile = (city: string, tx: number, ty: number) =>
  fetchBin(tileUrl(city, tx, ty), decodeBuildingTile);
export const loadTerrain = (city: string) =>
  fetchBin(`${geoBase(city)}/terrain.bin`, decodeTerrain);
export const loadTrees = (city: string) => fetchBin(`${geoBase(city)}/trees.bin`, decodeTrees);

/**
 * The 3D map's tile hook (city/three/tiles.ts) reads buildings as outlines
 * (flat x, y in local metres) with a height in metres.
 */
export function decodeTile(
  buf: ArrayBuffer,
): { p: Float32Array; h: number; levels: number; minHeight: number }[] {
  const t = decodeBuildingTile(buf);
  const out: { p: Float32Array; h: number; levels: number; minHeight: number }[] = [];
  for (let i = 0; i < t.length; i++) {
    const s = t.start[i]! * 2;
    out.push({
      p: t.xy.subarray(s, s + t.count[i]! * 2),
      h: t.height[i]!,
      levels: t.levels[i]!,
      minHeight: t.minHeight[i]!,
    });
  }
  return out;
}
