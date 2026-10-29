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
 *
 * Round 7 (the city is slow to load at start): tiles come in two stages,
 * your area first (the tiles within AREA_R of the camera's target), then the
 * rest of the reach once your area stands, and each tile's bytes are kept
 * (geo3d/cache.ts), so a scene built again takes them from memory.
 * `progress()` says honestly where the loading is.
 */
import * as THREE from 'three';
import type { CityLook } from './cities';
import { boxMeshes, mergedMesh, osmFootprints, type RealBuilding } from './buildings';
import { FootprintGrid, type Fp } from './footprints';
import { beacons, glowPoints } from './lights';
import * as geoTiles from '../geo3d/tiles';
import { AREA_R, tileBuffer, tileDistance, tileIndex, tileKeys } from '../geo3d/cache';

type Decoder = (buf: ArrayBuffer, index?: unknown) => unknown;
// A plain import: terrain.ts already loads geo3d/tiles.ts with the map, so a
// lazy one split nothing off (the build warned about it).
const DECODERS: Record<string, () => Promise<{ decodeTile?: Decoder; decode?: Decoder }>> = {
  tiles: () => Promise.resolve(geoTiles),
};

interface RawBuilding {
  p: ArrayLike<number>;
  h?: number;
  levels?: number;
  minHeight?: number;
  /** BUILDING_TYPES index (geo3d/tiles.ts). */
  type?: number;
}

interface TileContext {
  scene: THREE.Scene;
  mat: THREE.Material;
  /** For the instanced boxes (spires, roof plant). */
  inst: THREE.Material;
  look: CityLook;
  clear: { e: number; s: number; r: number }[];
  blocked: FootprintGrid;
  /** Night lights (the towers' beacons). */
  glow?: THREE.Material;
  /** A tile came (true) or went (false): hide or show what stood in for it. */
  onShow?: (key: string, shown: boolean) => void;
  /**
   * Make and put up a tile later, a few a frame (a sky view, Wave 12: a
   * hundred tiles arrive at once, each to lay out and send to the GPU).
   */
  stage?: (show: () => void) => void;
}

/** Where the tiles round you are: your area first, then the rest. */
export interface TileProgress {
  stage: 'area' | 'rest' | 'done';
  /** Tiles of your area standing, of how many. */
  area: [number, number];
  /** The other tiles in reach standing, of how many. */
  rest: [number, number];
}

export interface TileSet {
  /** Tiles that exist ("tx_ty") and their size in metres. */
  keys: Set<string>;
  size: number;
  /** `reach`: load this far instead (a sky view, Wave 12). */
  update(x: number, y: number, dist: number, ctx: TileContext, reach?: number): void;
  /** How many tiles stand now. */
  loaded(): number;
  /** The two stages of the tiles last asked for. */
  progress(): TileProgress;
  /** Drop every tile (the ground kept clear changed): they come back at the next update. */
  reset(ctx: TileContext): void;
}

/** Raw tile buildings → the shape osmFootprints takes. */
export function tileBuildings(list: RawBuilding[]): RealBuilding[] {
  return list.map((b) => ({
    p: b.p,
    h: b.levels || (b.h ? Math.max(1, Math.round(b.h / 3.25)) : undefined),
    hm: b.h && b.h > 0 ? b.h : undefined,
    base: b.minHeight && b.minHeight > 0 ? b.minHeight : undefined,
    kind: b.type,
  }));
}

export async function loadTiles(marketId: string): Promise<TileSet | null> {
  const loader = Object.values(DECODERS)[0];
  if (!loader || typeof fetch === 'undefined') return null;
  const index = await tileIndex(marketId);
  if (!index) return null;
  const mod = await loader().catch(() => null);
  const decode = mod?.decodeTile ?? mod?.decode;
  if (!decode) return null;
  const { keys, size } = tileKeys(index);
  /** What stands of every tile shown: no new outline may share their space. */
  const grid = new FootprintGrid();
  const loaded = new Map<string, { obj: THREE.Object3D; fps: Fp[] } | 'loading'>();
  /** The tiles last asked for: your area, then the rest (nearest first). */
  let area: string[] = [];
  let rest: string[] = [];
  /** The last ask, made again when your area is in (the rest's turn). */
  let again: (() => void) | null = null;
  const done = (k: string) => {
    const o = loaded.get(k);
    return !!o && o !== 'loading';
  };
  const areaIn = () => area.every(done);
  const settle = (k: string, o: { obj: THREE.Object3D; fps: Fp[] }) => {
    loaded.set(k, o);
    if (again && area.includes(k) && areaIn()) {
      const go = again;
      again = null;
      go();
    }
  };
  const drop = (k: string, ctx: TileContext) => {
    const o = loaded.get(k);
    if (o && o !== 'loading') {
      o.obj.removeFromParent();
      o.obj.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
      for (const f of o.fps) grid.remove(f);
      ctx.onShow?.(k, false);
    }
    loaded.delete(k);
  };
  const set: TileSet = {
    keys,
    size,
    loaded: () => [...loaded.values()].filter((v) => v !== 'loading').length,
    progress() {
      const a = area.filter(done).length;
      const r = rest.filter(done).length;
      return {
        stage: a < area.length ? 'area' : r < rest.length ? 'rest' : 'done',
        area: [a, area.length],
        rest: [r, rest.length],
      };
    },
    reset(ctx) {
      for (const k of [...loaded.keys()]) drop(k, ctx);
      area = [];
      rest = [];
      again = null;
    },
    update(x, y, dist, ctx, reach) {
      const R = reach ?? Math.min(3000, Math.max(1200, dist * 2));
      const want = new Set<string>();
      for (let ty = Math.floor((y - R) / size); ty <= Math.floor((y + R) / size); ty++)
        for (let tx = Math.floor((x - R) / size); tx <= Math.floor((x + R) / size); tx++) {
          const k = `${tx}_${ty}`;
          // A sky view loads a disc round you, not the square's far corners (lost in the haze).
          if (
            reach !== undefined &&
            Math.hypot((tx + 0.5) * size - x, (ty + 0.5) * size - y) > R + size * 0.71
          )
            continue;
          if (keys.has(k)) want.add(k);
        }
      for (const k of [...loaded.keys()])
        if (!want.has(k) && loaded.get(k) !== 'loading') drop(k, ctx);
      // Nearest first; your area (AREA_R round the camera's target) before the rest.
      const order = [...want]
        .map((k) => ({ k, d: tileDistance(k, size, x, y) }))
        .sort((a, b) => a.d - b.d || (a.k < b.k ? -1 : 1));
      area = order.filter((t) => t.d <= AREA_R).map((t) => t.k);
      rest = order.filter((t) => t.d > AREA_R).map((t) => t.k);
      const start = (k: string) => {
        if (loaded.has(k)) return;
        loaded.set(k, 'loading');
        void tileBuffer(marketId, k)
          .then((buf) => {
            const make = () => {
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
              const lights = ctx.glow ? glowPoints(beacons(fp.fps), ctx.glow) : null;
              if (lights) g.add(lights);
              ctx.scene.add(g);
              settle(k, { obj: g, fps: fp.fps });
              ctx.onShow?.(k, true);
            };
            if (!ctx.stage) return make();
            ctx.stage(() => {
              try {
                make();
              } catch {
                settle(k, { obj: new THREE.Group(), fps: [] });
              }
            });
          })
          .catch(() => {
            if (loaded.get(k) === 'loading') settle(k, { obj: new THREE.Group(), fps: [] });
          });
      };
      area.forEach(start);
      // The rest waits for your area (and comes as soon as it stands).
      if (areaIn()) {
        again = null;
        rest.forEach(start);
      } else again = () => rest.forEach(start);
    },
  };
  return set;
}
