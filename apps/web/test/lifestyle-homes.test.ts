import { describe, expect, it } from 'vitest';
import { LIFESTYLE_TIERS } from '@runway/engine';
import { TIER_HOME, floorsFor, homeSpecOf, planFor, withBuiltIns } from '../src/home/layout';
import { BLOCK_FLOOR, blockOf, groundsFor } from '../src/home/grounds';
import { lifestyleHome } from '../src/city/three/homes3d';

/**
 * Player feedback: "This house is no different from the poor house (Lean),
 * and I selected Modest." Every lifestyle tier lives somewhere of its own,
 * matching its housing label, on the map and inside.
 */
const home = (tier: number) => {
  const spec = homeSpecOf(null, tier);
  const plan = floorsFor(tier, spec)[0]!;
  return { spec, plan, grounds: groundsFor(plan, []) };
};

describe('a home of its own for every lifestyle tier', () => {
  it('names each home after its housing label', () => {
    expect(TIER_HOME).toHaveLength(LIFESTYLE_TIERS.length);
    expect(TIER_HOME[1]).toBe(LIFESTYLE_TIERS[1]!.housing);
    expect(TIER_HOME[2]).toBe(LIFESTYLE_TIERS[2]!.housing);
  });

  it('puts the flats in blocks: a walk-up, a tidy block, a modern tower; a house on its plot', () => {
    expect(home(1).grounds.style).toBe('block');
    expect(home(1).grounds.block?.tier).toBe('walkup');
    expect(home(2).grounds.block?.tier).toBe('block');
    expect(home(3).grounds.block?.tier).toBe('modern');
    expect(home(4).grounds.style).toBe('estate');
    expect(home(5).grounds.style).toBe('roof');
    // Higher up the better the flat; a flat has no lawn, drive or garden.
    expect(BLOCK_FLOOR.walkup).toBeLessThan(BLOCK_FLOOR.block);
    expect(BLOCK_FLOOR.block).toBeLessThan(BLOCK_FLOOR.modern);
    for (const t of [1, 2, 3]) {
      const g = home(t).grounds;
      expect(g.drive).toBeNull();
      expect(g.trees).toHaveLength(0);
      expect(g.block?.floor).toBe(BLOCK_FLOOR[g.block!.tier]);
    }
    // An owner's apartment is a flat in a block too; a rich owner's in the modern tower.
    expect(blockOf(planFor(2, { kind: 'apartment', wealth: 1 }))).toBe('block');
    expect(blockOf(planFor(2, { kind: 'apartment', wealth: 2 }))).toBe('modern');
    expect(blockOf(planFor(4, { kind: 'villa', wealth: 1 }))).toBeNull();
  });

  it('gives each tier up more room and a better-fitted home', () => {
    const [lean, modest, good] = [1, 2, 3].map((t) => home(t).plan);
    expect(modest!.w * modest!.h).toBeGreaterThan(lean!.w * lean!.h);
    expect(good!.w * good!.h).toBeGreaterThan(modest!.w * modest!.h);
    expect(good!.rooms.length).toBeGreaterThan(modest!.rooms.length);
    const fitted = (p: typeof lean) => withBuiltIns(p!, new Map());
    expect(fitted(lean).size).toBe(0);
    expect(fitted(modest).get('kitchen')).toBeGreaterThanOrEqual(2);
    expect(fitted(good).size).toBeGreaterThan(fitted(modest).size);
    expect(fitted(good).get('cooling')).toBeDefined();
  });

  it('draws a different building on the map for each tier', () => {
    const built = [1, 2, 3, 4, 5].map((t) => lifestyleHome(t, 19, 19));
    const hs = built.map((b) => b.h);
    // A walk-up under a five-storey block under a tower under a penthouse's tower.
    expect(hs[0]).toBeLessThan(hs[1]!);
    expect(hs[1]).toBeLessThan(hs[2]!);
    expect(hs[2]).toBeLessThan(hs[4]!);
    // A house is low, with a pitched roof (a cone).
    expect(hs[3]).toBeLessThan(hs[1]!);
    const meshes = built.map((b) => {
      let n = 0;
      b.group.traverse((o) => {
        if ((o as { isMesh?: boolean }).isMesh) n++;
      });
      return n;
    });
    expect(new Set(meshes).size).toBe(meshes.length);
  });
});
