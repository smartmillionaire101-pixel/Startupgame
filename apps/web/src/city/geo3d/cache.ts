/**
 * Round 7 (player feedback: "the city is sometimes slow to load at start"):
 * the 3D city's building tiles (public/geo/<city>/), fetched once and kept.
 *
 * - The index and each tile are fetched once per page: a scene built again
 *   (another city and back, a place left, a sky view) takes them from here
 *   instead of the network. The HTTP cache (netlify.toml, the server's static
 *   files: a day fresh, then revalidated in the background) makes the next
 *   visit's first load quick too.
 * - Your own area comes first: as soon as the City knows where you stand,
 *   `prefetchArea` fetches the index and the tiles round you, while the 3D
 *   code downloads and the city is built; the scene then asks for the rest
 *   (three/tiles.ts loads in two stages: your area, then the rest).
 *
 * No three.js here: the City's main chunk imports it to start the fetches.
 */

/** Metres round you that count as "your area" (the first stage). */
export const AREA_R = 800;
/** Tile bytes kept in memory across cities (a whole city is 5–9 MB). */
const MAX_BYTES = 32 * 1024 * 1024;

export type TileIndex = Record<string, unknown>;

const indexes = new Map<string, Promise<TileIndex | null>>();
const bufs = new Map<string, Promise<ArrayBuffer>>();
const sizes = new Map<string, number>();
let held = 0;

const canFetch = () => typeof fetch !== 'undefined';

/** A city's tile index (null: the city has no 3D tiles). Fetched once; a failure is tried again. */
export function tileIndex(city: string): Promise<TileIndex | null> {
  let p = indexes.get(city);
  if (p) return p;
  if (!canFetch()) return Promise.resolve(null);
  p = fetch(`/geo/${encodeURIComponent(city)}/index.json`)
    .then(async (res) => {
      // An SPA fallback page is not an index.
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
      return (await res.json()) as TileIndex;
    })
    .catch(() => {
      indexes.delete(city);
      return null;
    });
  indexes.set(city, p);
  return p;
}

/** The tiles an index lists ("tx_ty") and their size in metres. */
export function tileKeys(index: TileIndex): { keys: Set<string>; size: number } {
  const size = Number(index.tileSize ?? index.tile ?? index.size ?? 1000) || 1000;
  const keys = new Set<string>();
  for (const t of (index.tiles as unknown[]) ?? []) {
    if (typeof t === 'string') keys.add(t);
    else if (Array.isArray(t)) keys.add(`${t[0]}_${t[1]}`);
    else if (t && typeof t === 'object' && 'x' in t) {
      const o = t as unknown as { x: number; y: number };
      keys.add(`${o.x}_${o.y}`);
    }
  }
  return { keys, size };
}

/** Metres from (x, y) to the nearest point of tile `k`. */
export function tileDistance(k: string, size: number, x: number, y: number) {
  const [tx, ty] = k.split('_').map(Number) as [number, number];
  const dx = Math.max(tx * size - x, 0, x - (tx + 1) * size);
  const dy = Math.max(ty * size - y, 0, y - (ty + 1) * size);
  return Math.hypot(dx, dy);
}

/** The tiles of your area round (x, y), nearest first. */
export function areaKeys(keys: Iterable<string>, size: number, x: number, y: number, r = AREA_R) {
  return [...keys]
    .map((k) => ({ k, d: tileDistance(k, size, x, y) }))
    .filter((t) => t.d <= r)
    .sort((a, b) => a.d - b.d || (a.k < b.k ? -1 : 1))
    .map((t) => t.k);
}

function trim() {
  // Oldest first (a hit moves a tile to the back).
  for (const [k] of bufs) {
    if (held <= MAX_BYTES) break;
    held -= sizes.get(k) ?? 0;
    sizes.delete(k);
    bufs.delete(k);
  }
}

/** A building tile's bytes: from memory when it was fetched before. */
export function tileBuffer(city: string, key: string): Promise<ArrayBuffer> {
  const id = `${city}/${key}`;
  const hit = bufs.get(id);
  if (hit) {
    bufs.delete(id);
    bufs.set(id, hit);
    return hit;
  }
  if (!canFetch()) return Promise.reject(new Error('offline'));
  const p = fetch(`/geo/${encodeURIComponent(city)}/b-${key}.bin`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((buf) => {
      if (bufs.get(id) === p) {
        sizes.set(id, buf.byteLength);
        held += buf.byteLength;
        trim();
      }
      return buf;
    });
  // A failed fetch is not kept: the next scene tries again.
  p.catch(() => {
    if (bufs.get(id) === p) bufs.delete(id);
  });
  bufs.set(id, p);
  return p;
}

/** Whether a tile's bytes are in memory (or on their way). */
export const tileHeld = (city: string, key: string) => bufs.has(`${city}/${key}`);

/**
 * Your area first: the index, then the tiles round where you stand (metres,
 * x east, y south), before the scene asks. Resolves when they are in (or
 * failed); never rejects.
 */
export async function prefetchArea(city: string, x: number, y: number): Promise<number> {
  const index = await tileIndex(city);
  if (!index) return 0;
  const { keys, size } = tileKeys(index);
  const area = areaKeys(keys, size, x, y);
  await Promise.all(area.map((k) => tileBuffer(city, k).catch(() => null)));
  return area.length;
}

/** For tests: forget everything. */
export function clearTileCache() {
  indexes.clear();
  bufs.clear();
  sizes.clear();
  held = 0;
}
