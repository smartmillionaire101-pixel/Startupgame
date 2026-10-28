// @vitest-environment node
/**
 * Round 7 (player feedback: "the city is sometimes slow to load at start"):
 * the 3D city's building tiles come in stages, your area first and then the
 * rest, and each is fetched once (geo3d/cache.ts), so a second load of the
 * same city needs nothing from the network.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as F from '../../../scripts/osm/format.mjs';
import {
  areaKeys,
  clearTileCache,
  prefetchArea,
  tileBuffer,
  tileHeld,
} from '../src/city/geo3d/cache';
import { cityLook } from '../src/city/three/cities';
import { FootprintGrid } from '../src/city/three/footprints';
import { loadTiles } from '../src/city/three/tiles';

/** A 6 × 6 city of 1 km tiles round the centre: -3…2 each way. */
const KEYS: string[] = [];
for (let y = -3; y < 3; y++) for (let x = -3; x < 3; x++) KEYS.push(`${x}_${y}`);

let asked: string[] = [];
/** Tile fetches held back until let go (to see what was asked for first). */
let held: (() => void)[] = [];
let hold = false;

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      asked.push(url);
      if (url.endsWith('/index.json'))
        return new Response(
          JSON.stringify({
            format: 1,
            tileSize: 1000,
            tiles: KEYS.map((k) => {
              const [x, y] = k.split('_').map(Number);
              return { x, y };
            }),
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      const m = /b-(-?\d+)_(-?\d+)\.bin$/.exec(url);
      if (!m) return new Response('', { status: 404 });
      const bytes = F.encodeTile(Number(m[1]), Number(m[2]), []) as Uint8Array;
      if (hold) await new Promise<void>((r) => held.push(r));
      return new Response(new Uint8Array(bytes).buffer);
    }),
  );
}

const ctx = () => ({
  scene: new THREE.Scene(),
  mat: new THREE.MeshBasicMaterial(),
  inst: new THREE.MeshBasicMaterial(),
  look: cityLook('london'),
  clear: [],
  blocked: new FootprintGrid(),
});

const tilesAsked = () =>
  asked.filter((u) => u.includes('/b-')).map((u) => /b-(.*)\.bin/.exec(u)![1]);
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  clearTileCache();
  asked = [];
  held = [];
  hold = false;
  stubFetch();
});
afterEach(() => vi.unstubAllGlobals());

describe('3D city tiles: your area first, then the rest', () => {
  it('names your area: the tiles within reach of where you stand, nearest first', () => {
    expect(areaKeys(KEYS, 1000, 100, 100)).toEqual(['0_0', '-1_0', '0_-1', '-1_-1']);
    expect(areaKeys(KEYS, 1000, 500, 500)).toHaveLength(9);
  });

  it('asks for your area, and only then for the rest; the progress says which', async () => {
    const set = (await loadTiles('london'))!;
    expect(set.keys.size).toBe(36);
    hold = true;
    const c = ctx();
    // Standing near the centre (100 m, 100 m): a reach of 1.2 km is 16 tiles.
    set.update(100, 100, 600, c);
    await settle();
    const area = ['-1_-1', '-1_0', '0_-1', '0_0'];
    expect(tilesAsked().sort()).toEqual(area);
    expect(set.progress()).toEqual({ stage: 'area', area: [0, 4], rest: [0, 12] });
    // Your area arrives: the rest is asked for at once.
    hold = false;
    held.splice(0).forEach((go) => go());
    await settle();
    expect(tilesAsked()).toHaveLength(16);
    expect(set.progress()).toEqual({ stage: 'done', area: [4, 4], rest: [12, 12] });
    expect(set.loaded()).toBe(16);
  });

  it('a second load of the city takes everything from memory', async () => {
    const first = (await loadTiles('london'))!;
    first.update(100, 100, 600, ctx());
    await settle();
    const before = asked.length;
    expect(before).toBe(17);
    const again = (await loadTiles('london'))!;
    again.update(100, 100, 600, ctx());
    await settle();
    expect(asked.length).toBe(before);
    expect(again.progress().stage).toBe('done');
  });

  it('fetches your area before the scene asks, once', async () => {
    expect(await prefetchArea('london', 100, 100)).toBe(4);
    expect(tileHeld('london', '0_0')).toBe(true);
    expect(tileHeld('london', '1_1')).toBe(false);
    await prefetchArea('london', 100, 100);
    expect(asked).toHaveLength(5);
    // A failed tile is not kept: the next ask tries again.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    await expect(tileBuffer('london', '2_2')).rejects.toThrow();
    expect(tileHeld('london', '2_2')).toBe(false);
  });
});
