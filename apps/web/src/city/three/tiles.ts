/**
 * Wave 9 §B: full-density building tiles (Wave 9 §A), when a city has them.
 *
 * The data pipeline writes `public/geo/<city>/index.json` and binary tiles
 * `b-<tx>_<ty>.bin`; a decoder lives in `src/city/geo3d/tiles.ts`. Both are
 * optional: with no index (or no decoder) the scene makes its own infill.
 *
 * Expected decoder contract (normalised here, so small differences are fine):
 *   export function decodeTile(buf: ArrayBuffer, index?: unknown):
 *     Array<{ p: ArrayLike<number>; h?: number; levels?: number; minHeight?: number }>
 *     | { buildings: Array<…same…> }
 * with outlines in the city file's metres (x east, y south) and h in metres.
 * The index lists its tiles as "tx_ty" strings, [tx, ty] pairs or {x, y}
 * objects, with the tile size in metres as `tile`, `tileSize` or `size`
 * (default 1000).
 *
 * Wave 10 §B: a tile's outlines are thinned as they arrive (buildings.ts
 * osmFootprints → footprints.ts): none on the game's places or landmarks,
 * and none sharing space with another, in this tile or a neighbour already
 * standing. While a tile stands, the city file's own outlines there hide
 * (`onShow`), so the same building is never drawn twice.
 */
import * as THREE from 'three';
import type { CityLook } from './cities';
import { boxMeshes, mergedMesh, osmFootprints, type RealBuilding } from './buildings';
import { FootprintGrid, type Fp } from './footprints';

type Decoder = (buf: ArrayBuffer, index?: unknown) => unknown;
const DECODERS = import.meta.glob<{ decodeTile?: Decoder; decode?: Decoder }>('../geo3d/tiles.ts');

interface RawBuilding {
  p: ArrayLike<number>;
  h?: number;
  levels?: number;
  minHeight?: number;
}

export interface TileContext {
  scene: THREE.Scene;
  mat: THREE.Material;
  /** For the instanced boxes (spires, roof plant). */
  inst: THREE.Material;
  look: CityLook;
  clear: { e: number; s: number; r: number }[];
  blocked: FootprintGrid;
  /** A tile came (true) or went (false): hide or show what stood in for it. */
  onShow?: (key: string, shown: boolean) => void;
}

export interface TileSet {
  /** Tiles that exist ("tx_ty") and their size in metres. */
  keys: Set<string>;
  size: number;
  update(x: number, y: number, dist: number, ctx: TileContext): void;
  /** How many tiles stand now. */
  loaded(): number;
}

/** Raw tile buildings → the shape osmFootprints takes. */
export function tileBuildings(list: RawBuilding[]): RealBuilding[] {
  return list.map((b) => ({
    p: b.p,
    h: b.levels || (b.h ? Math.max(1, Math.round(b.h / 3.25)) : undefined),
    hm: b.h && b.h > 0 ? b.h : undefined,
    base: b.minHeight && b.minHeight > 0 ? b.minHeight : undefined,
  }));
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
  /** What stands of every tile shown: no new outline may share their space. */
  const grid = new FootprintGrid();
  const loaded = new Map<string, { obj: THREE.Object3D; fps: Fp[] } | 'loading'>();
  return {
    keys,
    size,
    loaded: () => [...loaded.values()].filter((v) => v !== 'loading').length,
    update(x, y, dist, ctx) {
      const R = Math.min(3000, Math.max(1200, dist * 2));
      const want = new Set<string>();
      for (let ty = Math.floor((y - R) / size); ty <= Math.floor((y + R) / size); ty++)
        for (let tx = Math.floor((x - R) / size); tx <= Math.floor((x + R) / size); tx++) {
          const k = `${tx}_${ty}`;
          if (keys.has(k)) want.add(k);
        }
      for (const [k, o] of loaded)
        if (!want.has(k) && o !== 'loading') {
          o.obj.removeFromParent();
          o.obj.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
          for (const f of o.fps) grid.remove(f);
          loaded.delete(k);
          ctx.onShow?.(k, false);
        }
      for (const k of want) {
        if (loaded.has(k)) continue;
        loaded.set(k, 'loading');
        void fetch(`/geo/${marketId}/b-${k}.bin`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((buf) => {
            if (loaded.get(k) !== 'loading') return;
            const out = decode(buf, index) as RawBuilding[] | { buildings: RawBuilding[] };
            const list = Array.isArray(out) ? out : (out?.buildings ?? []);
            const fp = osmFootprints(
              { buildings: tileBuildings(list) },
              ctx.look,
              ctx.clear,
              marketId,
              { blocked: ctx.blocked, grid },
            );
            const g = new THREE.Group();
            const m = mergedMesh(fp.polys, ctx.mat);
            if (m) g.add(m);
            for (const b of boxMeshes(fp.boxes, ctx.inst)) g.add(b);
            ctx.scene.add(g);
            loaded.set(k, { obj: g, fps: fp.fps });
            ctx.onShow?.(k, true);
          })
          .catch(() => loaded.set(k, { obj: new THREE.Group(), fps: [] }));
      }
    },
  };
}
