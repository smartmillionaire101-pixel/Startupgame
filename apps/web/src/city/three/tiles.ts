/**
 * Wave 9 §B: full-density building tiles (Wave 9 §A), when a city has them.
 *
 * The data pipeline writes `public/geo/<city>/index.json` and binary tiles
 * `b-<tx>_<ty>.bin`; a decoder lives in `src/city/geo3d/tiles.ts`. Both are
 * optional: with no index (or no decoder) the scene makes its own infill.
 *
 * Expected decoder contract (normalised here, so small differences are fine):
 *   export function decodeTile(buf: ArrayBuffer, index?: unknown):
 *     Array<{ p: ArrayLike<number>; h?: number; levels?: number }>
 *     | { buildings: Array<…same…> }
 * with outlines in the city file's metres (x east, y south) and h in metres.
 * The index lists its tiles as "tx_ty" strings, [tx, ty] pairs or {x, y}
 * objects, with the tile size in metres as `tile` or `size` (default 1000).
 */
import * as THREE from 'three';
import type { GeoData } from '../geo';
import type { CityLook } from './cities';
import { mergedMesh, osmFootprints } from './buildings';

type Decoder = (buf: ArrayBuffer, index?: unknown) => unknown;
const DECODERS = import.meta.glob<{ decodeTile?: Decoder; decode?: Decoder }>('../geo3d/tiles.ts');

interface RawBuilding {
  p: ArrayLike<number>;
  h?: number;
  levels?: number;
}

export interface TileSet {
  update(
    x: number,
    y: number,
    dist: number,
    scene: THREE.Scene,
    mat: THREE.Material,
    look: CityLook,
  ): void;
}

export async function loadTiles(marketId: string): Promise<TileSet | null> {
  const loader = Object.values(DECODERS)[0];
  if (!loader || typeof fetch === 'undefined') return null;
  let index: Record<string, unknown>;
  try {
    const res = await fetch(`/geo/${marketId}/index.json`);
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    index = (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
  const mod = await loader().catch(() => null);
  const decode = mod?.decodeTile ?? mod?.decode;
  if (!decode) return null;
  const size = Number(index.tile ?? index.size ?? 1000) || 1000;
  const keys = new Set<string>();
  for (const t of (index.tiles as unknown[]) ?? []) {
    if (typeof t === 'string') keys.add(t);
    else if (Array.isArray(t)) keys.add(`${t[0]}_${t[1]}`);
    else if (t && typeof t === 'object' && 'x' in t) {
      const o = t as unknown as { x: number; y: number };
      keys.add(`${o.x}_${o.y}`);
    }
  }
  const loaded = new Map<string, THREE.Object3D | 'loading'>();
  return {
    update(x, y, dist, scene, mat, look) {
      const R = Math.min(3000, Math.max(1200, dist * 2));
      const want = new Set<string>();
      for (let ty = Math.floor((y - R) / size); ty <= Math.floor((y + R) / size); ty++)
        for (let tx = Math.floor((x - R) / size); tx <= Math.floor((x + R) / size); tx++) {
          const k = `${tx}_${ty}`;
          if (keys.has(k)) want.add(k);
        }
      for (const [k, o] of loaded)
        if (!want.has(k) && o !== 'loading') {
          o.removeFromParent();
          (o as THREE.Mesh).geometry?.dispose();
          loaded.delete(k);
        }
      for (const k of want) {
        if (loaded.has(k)) continue;
        loaded.set(k, 'loading');
        void fetch(`/geo/${marketId}/b-${k}.bin`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((buf) => {
            const out = decode(buf, index) as RawBuilding[] | { buildings: RawBuilding[] };
            const list = Array.isArray(out) ? out : (out?.buildings ?? []);
            const data = {
              buildings: list.map((b) => ({
                p: Array.from(b.p),
                h: b.levels ?? (b.h ? Math.max(1, Math.round(b.h / 3.25)) : undefined),
              })),
            } as unknown as GeoData;
            const fp = osmFootprints(data, look, [], marketId);
            const m = mergedMesh(fp.polys, mat);
            if (m && loaded.get(k) === 'loading') {
              scene.add(m);
              loaded.set(k, m);
            }
          })
          .catch(() => loaded.set(k, new THREE.Group()));
      }
    },
  };
}
