import { describe, expect, it } from 'vitest';
import { FURNITURE, CAR_MODEL_IDS } from '@runway/engine';
import { HOME_SLOTS } from '../src/city/life';
import { ROOM_KINDS } from '../src/city/rooms';
import { SLOT_MODEL, FIXTURE_MODEL, facingOf, frameOf, modelFor } from '../src/interiors3d/catalog';
import { BUILDERS, hasBuilder } from '../src/interiors3d/furniture';
import { MOVABLE, canPlace, placedSpot, withPlacements } from '../src/interiors3d/placement';
import { ROOM_STYLE, vx, vz, RW, RD } from '../src/interiors3d/venues';
import { blockedTiles, planFor, wallEdges } from '../src/home/layout';
import { findPath } from '../src/home/path';

const ALL = new Set<string>(HOME_SLOTS);

describe('3D catalogue (Wave 9 §C)', () => {
  it('maps every catalogue item and car to a model that exists', () => {
    for (const f of FURNITURE) {
      const m = modelFor(f.id);
      expect(m.model, f.id).not.toBe('crate');
      expect(m.tier).toBe(f.tier);
      expect(hasBuilder(m.model), f.id).toBe(true);
    }
    for (const c of CAR_MODEL_IDS) expect(hasBuilder(modelFor(`car:${c}`).model)).toBe(true);
    for (const id of Object.values(FIXTURE_MODEL)) expect(id in BUILDERS, id).toBe(true);
    for (const s of HOME_SLOTS) expect(SLOT_MODEL[s], s).toBeDefined();
  });

  it('falls back to a crate for anything unknown', () => {
    expect(modelFor('jacuzzi-2')).toEqual({ model: 'crate', tier: 2 });
    expect(modelFor('car:spaceship').model).toBe('car:hatchback');
  });

  it('turns things away from the wall they stand against', () => {
    const plan = planFor(2);
    expect(facingOf(plan, 'bed', plan.slots.bed!)).toBe(0);
    expect(facingOf(plan, 'kitchen', plan.slots.kitchen!)).toBe(-Math.PI / 2);
    expect(facingOf(plan, 'books', plan.slots.books!)).toBe(Math.PI / 2);
    expect(facingOf(plan, 'sofa', plan.slots.sofa!)).toBe(Math.PI);
    expect(facingOf(plan, 'tv', plan.slots.tv!)).toBe(0);
    // A quarter turn swaps the footprint.
    const f = frameOf(plan.slots.kitchen!, -Math.PI / 2);
    expect({ w: f.w, d: f.d }).toEqual({ w: 2, d: 1 });
  });

  it('has a style for every room kind and maps the 2D room into the 3D one', () => {
    for (const k of ROOM_KINDS) expect(ROOM_STYLE[k], k).toBeDefined();
    expect(vx(0)).toBeCloseTo(-RW / 2);
    expect(vx(360)).toBeCloseTo(RW / 2);
    expect(vz(240)).toBeLessThanOrEqual(RD / 2);
    expect(vz(130)).toBeGreaterThan(-RD / 2);
  });
});

describe('Buy mode placement (Wave 9 §C)', () => {
  for (const tier of [2, 3, 4, 5]) {
    it(`tier ${tier}: every movable thing can stay where it is`, () => {
      const plan = planFor(tier);
      for (const slot of MOVABLE) {
        const s = plan.slots[slot]!;
        expect(canPlace(plan, ALL, slot, { x: s.x, y: s.y, rot: 0 }), slot).toBe(true);
      }
    });
  }

  it('refuses a spot on top of something else, outside, or across a wall', () => {
    const plan = planFor(2);
    const bed = plan.slots.bed!;
    expect(canPlace(plan, ALL, 'sofa', { x: bed.x, y: bed.y, rot: 0 })).toBe(false);
    expect(canPlace(plan, ALL, 'sofa', { x: plan.w - 1, y: 6, rot: 0 })).toBe(false);
    expect(canPlace(plan, ALL, 'sofa', { x: -1, y: 6, rot: 0 })).toBe(false);
    // The wall between the bedroom and the living room runs along y = 4.
    expect(canPlace(plan, ALL, 'wardrobe', { x: 1, y: 3, rot: 1 })).toBe(false);
  });

  it('moves and turns a sofa, its seats come along, and the flat stays walkable', () => {
    const plan = planFor(3);
    const owned = new Set(['sofa', 'tv', 'bed']);
    const p = { x: 1, y: 9, rot: 2 };
    expect(canPlace(plan, owned, 'sofa', p)).toBe(true);
    const next = withPlacements(plan, owned, { sofa: p });
    expect(next.slots.sofa).toMatchObject({ x: 1, y: 9, w: 3, h: 1, rot: 2 });
    expect(next.seats[0]).toEqual({ x: 2, y: 9 });
    const g = { w: next.w, h: next.h, blocked: blockedTiles(next, owned), walls: wallEdges(next) };
    expect(findPath(g, next.door, next.slots.sofa!.interact)).not.toBeNull();
    // A quarter turn swaps the footprint and faces the side.
    const turned = placedSpot(plan.slots.sofa!, { x: 1, y: 6, rot: 1 });
    expect({ w: turned.w, h: turned.h }).toEqual({ w: 1, h: 3 });
    expect(turned.interact).toEqual({ x: 2, y: 7 });
  });

  it('ignores a saved spot that no longer fits', () => {
    const plan = planFor(2);
    const next = withPlacements(plan, ALL, { sofa: { x: 0, y: 0, rot: 0 } });
    expect(next.slots.sofa).toEqual(plan.slots.sofa);
  });
});
