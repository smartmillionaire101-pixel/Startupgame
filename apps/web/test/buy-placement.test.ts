import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { blockedTiles, key, planFor, wallEdges } from '../src/home/layout';
import { findPath } from '../src/home/path';
import {
  canPlace,
  extraKey,
  nudgeOnWall,
  placedSpot,
  screenToGrid,
  slotOf,
  snapToWall,
  turnOnWall,
  wallBehind,
  withPlacements,
} from '../src/interiors3d/placement';
import {
  dividerPaint,
  paintColour,
  wallPalette,
  WALL_GREEN,
  WALL_INNER,
} from '../src/interiors3d/finishes';

/**
 * Player feedback on decorating the house: the arrows follow the camera,
 * more than one of a thing (each placed on its own), pictures on any wall,
 * and every wall in the paint you chose.
 */

/** Where one tile along +x and along +y (+z) go on screen, the camera as the home's stage puts it. */
function axes(azimuth: number, elevation = 0.9) {
  const cam = new THREE.PerspectiveCamera(30, 390 / 600, 0.1, 600);
  const t = new THREE.Vector3(6, 0, 6);
  const r = 150;
  cam.position.set(
    t.x + r * Math.cos(elevation) * Math.sin(azimuth),
    t.y + r * Math.sin(elevation),
    t.z + r * Math.cos(elevation) * Math.cos(azimuth),
  );
  cam.lookAt(t);
  cam.updateMatrixWorld();
  const px = (v: THREE.Vector3) => {
    const p = v.clone().project(cam);
    return { x: (p.x + 1) * 195, y: (1 - p.y) * 300 };
  };
  const o = px(t);
  const ex = px(t.clone().add(new THREE.Vector3(1, 0, 0)));
  const ez = px(t.clone().add(new THREE.Vector3(0, 0, 1)));
  return {
    ex: { x: ex.x - o.x, y: ex.y - o.y },
    ez: { x: ez.x - o.x, y: ez.y - o.y },
  };
}

describe('nudges follow the camera ("when I click left the item goes right")', () => {
  const SCREEN = {
    left: [-1, 0],
    right: [1, 0],
    up: [0, -1],
    down: [0, 1],
  } as const;

  // The home's stage starts at -0.3 and Turn adds a quarter each time.
  for (let turn = 0; turn < 4; turn++) {
    const az = -0.3 + (turn * Math.PI) / 2;
    it(`turned ${turn} quarter(s): each arrow moves it that way on screen`, () => {
      const { ex, ez } = axes(az);
      for (const [name, [dx, dy]] of Object.entries(SCREEN)) {
        const g = screenToGrid(dx, dy, ex, ez);
        expect(Math.abs(g.dx) + Math.abs(g.dy), name).toBe(1);
        // Where that grid step goes on screen: mostly the way you pressed.
        const s = { x: g.dx * ex.x + g.dy * ez.x, y: g.dx * ex.y + g.dy * ez.y };
        const cos = (s.x * dx + s.y * dy) / Math.hypot(s.x, s.y);
        expect(cos, `${name} at turn ${turn}`).toBeGreaterThan(0.6);
      }
      // Opposite arrows, opposite steps; the four cover the four grid directions.
      const all = Object.values(SCREEN).map(([dx, dy]) => screenToGrid(dx, dy, ex, ez));
      expect(new Set(all.map((g) => `${g.dx},${g.dy}`)).size).toBe(4);
    });
  }

  it('the four quarter turns, step by step', () => {
    const steps = [0, 1, 2, 3].map((turn) => {
      const { ex, ez } = axes(-0.3 + (turn * Math.PI) / 2);
      return {
        left: screenToGrid(-1, 0, ex, ez),
        up: screenToGrid(0, -1, ex, ez),
      };
    });
    // As built: left is -x, up (away from you) is -y, towards the back wall.
    expect(steps[0]).toEqual({ left: { dx: -1, dy: 0 }, up: { dx: 0, dy: -1 } });
    // A quarter turn: the camera's on the +x side, so away is -x and left is +y.
    expect(steps[1]).toEqual({ left: { dx: 0, dy: 1 }, up: { dx: -1, dy: 0 } });
    expect(steps[2]).toEqual({ left: { dx: 1, dy: 0 }, up: { dx: 0, dy: 1 } });
    expect(steps[3]).toEqual({ left: { dx: 0, dy: -1 }, up: { dx: 1, dy: 0 } });
  });

  it('a flat 2D view (no turn) maps straight across', () => {
    expect(screenToGrid(1, 0, { x: 1, y: 0 }, { x: 0, y: 1 })).toEqual({ dx: 1, dy: 0 });
    expect(screenToGrid(0, -1, { x: 1, y: 0 }, { x: 0, y: 1 })).toEqual({ dx: 0, dy: -1 });
  });
});

describe('more than one of a thing, each placed on its own', () => {
  const plan = planFor(3);
  const owned = new Set(['sound', 'sofa', 'tv', 'bed', 'art']);
  const a = extraKey('sound', 'extra_1');
  const b = extraKey('sound', 'extra_2');

  it('keys: the slot and the extra’s id', () => {
    expect(a).toBe('sound#extra_1');
    expect(slotOf(a)).toBe('sound');
    expect(slotOf('sound')).toBe('sound');
  });

  it('two more speakers find spots of their own; the flat stays walkable', () => {
    const next = withPlacements(plan, owned, {}, [a, b]);
    const spots = ['sound', a, b].map((k) => next.slots[k]!);
    expect(spots.every(Boolean)).toBe(true);
    const tiles = spots.map((s) => key(s.x, s.y));
    expect(new Set(tiles).size).toBe(3);
    const all = new Set([...owned, a, b]);
    const g = { w: next.w, h: next.h, blocked: blockedTiles(next, all), walls: wallEdges(next) };
    for (const k of [...all]) {
      const s = next.slots[k];
      if (s) expect(findPath(g, next.door, s.interact), k).not.toBeNull();
    }
    // The slot's own one hasn't moved.
    expect(next.slots.sound).toEqual(plan.slots.sound);
  });

  it('each moves on its own: a saved spot for one leaves the other be', () => {
    const before = withPlacements(plan, owned, {}, [a, b]);
    const all = new Set([...owned, a]);
    const p = { x: 3, y: 9, rot: 0 };
    expect(canPlace(before, all, b, p)).toBe(true);
    const after = withPlacements(plan, owned, { [b]: p }, [a, b]);
    expect(after.slots[b]).toMatchObject({ x: 3, y: 9 });
    expect(after.slots[a]).toEqual(before.slots[a]);
    // A spot it can't have (on the bed) is ignored: it goes where there's room.
    const bed = plan.slots.bed!;
    const bad = withPlacements(plan, owned, { [b]: { x: bed.x, y: bed.y, rot: 0 } }, [a, b]);
    expect(bad.slots[b]).toEqual(before.slots[b]);
  });

  it('more paintings hang on walls of their own', () => {
    const k1 = extraKey('art', 'extra_3');
    const k2 = extraKey('art', 'extra_4');
    const next = withPlacements(plan, owned, {}, [k1, k2]);
    const at = ['art', k1, k2].map((k) => next.slots[k]! as { x: number; y: number; rot?: number });
    for (const s of at) expect(wallBehind(plan, s.x, s.y, s.rot ?? 0)).toBe(true);
    expect(new Set(at.map((s) => `${s.x},${s.y},${s.rot ?? 0}`)).size).toBe(3);
  });
});

describe('a painting moves along the walls ("it just put it in my room")', () => {
  // The tier-3 flat: 12×12, the bedroom over the living room (a wall along y = 5,
  // doorways at x 5 and 8), the bathroom beyond a wall along x = 7.
  const plan = planFor(3);
  const owned = new Set(['art', 'cooling', 'bed']);

  it('knows the walls: outer, inner, and the gaps that are doorways', () => {
    expect(wallBehind(plan, 4, 0, 0)).toBe(true);
    expect(wallBehind(plan, 4, 1, 0)).toBe(false);
    expect(wallBehind(plan, 0, 3, 1)).toBe(true);
    expect(wallBehind(plan, 11, 3, 3)).toBe(true);
    expect(wallBehind(plan, 2, 5, 0)).toBe(true);
    expect(wallBehind(plan, 2, 4, 2)).toBe(true);
    expect(wallBehind(plan, 5, 5, 0)).toBe(false);
    expect(wallBehind(plan, 6, 2, 3)).toBe(true);
  });

  it('hangs only with a wall behind it, not on the AC, not in the doorway', () => {
    expect(canPlace(plan, owned, 'art', { x: 4, y: 0, rot: 0 })).toBe(true);
    expect(canPlace(plan, owned, 'art', { x: 4, y: 2, rot: 0 })).toBe(false);
    expect(canPlace(plan, owned, 'art', { x: 2, y: 5, rot: 0 })).toBe(true);
    // The AC hangs at (0–1, 0) on the back wall; the left wall there is free.
    expect(canPlace(plan, owned, 'art', { x: 0, y: 0, rot: 0 })).toBe(false);
    expect(canPlace(plan, owned, 'art', { x: 0, y: 0, rot: 1 })).toBe(true);
  });

  it('nudges along a wall, round a corner, across the room and through a wall', () => {
    const p = { x: 4, y: 0, rot: 0 };
    expect(nudgeOnWall(plan, p, 1, 0)).toEqual({ x: 5, y: 0, rot: 0 });
    expect(nudgeOnWall(plan, p, -1, 0)).toEqual({ x: 3, y: 0, rot: 0 });
    // The corner: onto the left wall.
    expect(nudgeOnWall(plan, { x: 0, y: 0, rot: 0 }, -1, 0)).toEqual({ x: 0, y: 0, rot: 1 });
    // Away from the back wall: to the bedroom's far wall, facing back.
    const far = nudgeOnWall(plan, p, 0, 1);
    expect(far).toEqual({ x: 4, y: 4, rot: 2 });
    // Through that wall into the living room, and back up to the bedroom's back wall.
    expect(nudgeOnWall(plan, far, 0, 1)).toEqual({ x: 4, y: 5, rot: 0 });
    expect(nudgeOnWall(plan, far, 0, -1)).toEqual({ x: 4, y: 0, rot: 0 });
    // Not out through the outer wall.
    expect(nudgeOnWall(plan, p, 0, -1)).toEqual(p);
    // Height is kept.
    expect(nudgeOnWall(plan, { ...p, lift: 1 }, 1, 0)).toEqual({ x: 5, y: 0, rot: 0, lift: 1 });
  });

  it('dropped on a tile it turns its back to the wall there; Turn picks another wall', () => {
    expect(snapToWall(plan, { x: 0, y: 3, rot: 0 })).toEqual({ x: 0, y: 3, rot: 1 });
    expect(snapToWall(plan, { x: 6, y: 4, rot: 0 })).toMatchObject({ x: 6, y: 4 });
    expect(turnOnWall(plan, { x: 0, y: 0, rot: 0 })).toEqual({ x: 0, y: 0, rot: 1 });
  });

  it('is drawn where it hangs, a step higher when lifted', () => {
    const s = placedSpot(plan.slots.art!, { x: 2, y: 5, rot: 0, lift: 1 });
    expect(s).toMatchObject({ x: 2, y: 5, w: 1, h: 1, wall: true, rot: 0, lift: 1 });
    expect(s.interact).toEqual({ x: 2, y: 6 });
    const next = withPlacements(plan, owned, { art: { x: 2, y: 5, rot: 0, lift: 1 } });
    expect(next.slots.art).toMatchObject({ x: 2, y: 5, rot: 0, lift: 1 });
  });
});

describe('every wall in the paint you chose ("not all of them change")', () => {
  it('a paint is its id (what the engine keeps), its colour found', () => {
    expect(paintColour('sage')).toBe('#9fb59a');
    expect(paintColour('navy')).toBe('#2f4163');
    expect(paintColour('#123456')).toBe('#123456');
    expect(paintColour(null)).toBeNull();
    // Before: 'sage' went to the walls as a colour (the inner ones came out near black).
    const p = wallPalette(null, 'sage');
    expect(p.outer).toBe('#9fb59a');
    expect(p.inner).toMatch(/^#[0-9a-f]{6}$/);
    expect(p.inner).not.toBe(WALL_INNER);
    expect(parseInt(p.inner.slice(1), 16)).toBeGreaterThan(parseInt('9fb59a', 16) - 1);
    expect(wallPalette(null, null).outer).toBe(WALL_GREEN);
  });

  it('plastered dividers take the paint; glass, screens, shelves and timber keep theirs', () => {
    expect(dividerPaint('full', 'white', null, 'sage')).toBe(wallPalette(null, 'sage').inner);
    expect(dividerPaint('half', 'clay', 'modern', 'navy')).toBe(
      wallPalette('modern', 'navy').inner,
    );
    expect(dividerPaint('full', 'timber', null, 'sage')).toBeNull();
    expect(dividerPaint('glass', 'clear', null, 'sage')).toBeNull();
    expect(dividerPaint('full', 'white', null, null)).toBeNull();
  });
});
