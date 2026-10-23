import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { TIER_OF_KIND, floorsFor, type HomeKind, type HomePlan } from '../src/home/layout';
import { HOTEL_MODELS, hotelPlan } from '../src/home/hotel';
import { SLOT_MODEL } from '../src/interiors3d/catalog';
import { buildEstateModel } from '../src/interiors3d/estate-models';
import { FLOOR_Y } from '../src/interiors3d/house';

/**
 * Player feedback: "That carpet in the room is still floating". The rug's
 * flat 2D drawing stayed visible over the 3D room (the 2D scene is kept on
 * top as an invisible hit layer, and the rug was drawn outside the groups
 * hidden in 3D); and the 3D rugs themselves lie flush on their floor.
 */
const KINDS: HomeKind[] = [
  'studio',
  'apartment',
  'townhouse',
  'house',
  'villa',
  'mansion',
  'penthouse',
];
const RUGS = new Set(['rug', 'suite-rug', 'round-rug']);
const SRC = join(__dirname, '..', 'src');

/** jsdom has no 2D canvas: the rugs' painted textures draw into a context that does nothing. */
const noop: object = new Proxy(() => noop, { get: () => noop, set: () => true, apply: () => noop });
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    noop) as unknown as HTMLCanvasElement['getContext'];
});

/** Every rug on a floor: the rug slot (owned) and the decor that's a rug (bath mats, a foyer's). */
function rugsOf(p: HomePlan, slotModel: (slot: string) => string | undefined) {
  const out: { id: string; model: string; w: number; d: number; tier: number }[] = [];
  const s = p.slots.rug;
  const m = slotModel('rug');
  // The rug you buy, at each of its tiers.
  if (s && m)
    for (const tier of [1, 2, 3]) out.push({ id: `rug-${tier}`, model: m, w: s.w, d: s.h, tier });
  for (const d of p.decor)
    if (RUGS.has(d.model))
      out.push({ id: d.id, model: d.model, w: d.spot.w, d: d.spot.h, tier: d.tier ?? 1 });
  return out;
}

/** A rug as Home3D places it indoors (its group at the floor's origin, y 0). */
function rugBox(model: string, w: number, d: number, tier: number) {
  const g = buildEstateModel(model, { w, d, tier, seed: 1 }).group;
  g.position.set(0, 0, 0);
  g.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(g);
}

const flush = (where: string, b: THREE.Box3) => {
  // Its underside on the floor, within a centimetre, and never below the floor's own underside.
  expect(Math.abs(b.min.y - FLOOR_Y), `${where}: underside ${b.min.y}`).toBeLessThanOrEqual(0.01);
  // A rug, not a mattress: it's no thicker than a couple of centimetres.
  expect(b.max.y - FLOOR_Y, `${where}: top ${b.max.y}`).toBeLessThanOrEqual(0.02);
};

describe('rugs lie flush on their floor (player feedback: "the carpet is still floating")', () => {
  for (const kind of KINDS)
    for (const wealth of [0, 1, 2, 3])
      it(`${kind}, wealth ${wealth}: on every floor`, () => {
        const floors = floorsFor(TIER_OF_KIND[kind], { kind, wealth });
        let n = 0;
        for (const p of floors)
          for (const r of rugsOf(p, (s) => SLOT_MODEL[s])) {
            flush(
              `${kind} w${wealth} floor ${p.level ?? 0} ${r.id}`,
              rugBox(r.model, r.w, r.d, r.tier),
            );
            n++;
          }
        expect(n).toBeGreaterThan(0);
      });

  for (const tier of ['budget', 'business', 'luxury'] as const)
    it(`a ${tier} hotel room`, () => {
      const p = hotelPlan(tier);
      const rugs = rugsOf(p, (s) => HOTEL_MODELS[tier]?.[s] ?? SLOT_MODEL[s]);
      for (const r of rugs) flush(`${tier} ${r.id}`, rugBox(r.model, r.w, r.d, r.tier));
    });

  it('in 3D the 2D scene hides its rug too, so no flat copy floats over the room', () => {
    const css = readFileSync(join(SRC, 'interiors3d', 'i3d.css'), 'utf8');
    const rule = /([^{}]*)\{\s*opacity:\s*0;\s*\}/g;
    const hidden = new Set<string>();
    for (const m of css.matchAll(rule))
      for (const sel of m[1]!.split(',')) hidden.add(sel.replace(/\/\*[\s\S]*?\*\//g, '').trim());
    expect(hidden).toContain('.home-scene.is-3d .home-obj');
    expect(hidden).toContain('.home-scene.is-3d .home-rugs');
    const scene = readFileSync(join(SRC, 'home', 'HomeScene.tsx'), 'utf8');
    expect(scene).toMatch(
      /<g className="home-rugs">\s*\{objects\s*\.filter\(\(o\) => o\.id === 'rug'\)/,
    );
  });
});
