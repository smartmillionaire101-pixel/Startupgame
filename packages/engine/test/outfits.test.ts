import { describe, expect, it } from 'vitest';
import { MALL_ITEMS, MALL_SHOPS, MALL_SHOPS_FEEDBACK, SUIT_COLOURS } from '../src/data/leisure.js';
import { roleOutfit } from '../src/outfits.js';
import { FEEDBACK_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { addFounder, addInvestor, careerWorld, makeWorld, run, tryRun } from './helpers.js';

/**
 * The feedback round's outfits: new players dressed for their role, The Suit
 * Shop and more clothes at the mall, all switched on by the game-feedback
 * note (older worlds' players and shops unchanged).
 */
const F = 'u_founder';
const I = 'u_investor';
const B = 'u_banker';
const announce = (w: World, id = FEEDBACK_NOTE) =>
  run(w, null, { type: 'system.announce', id, text: 'The feedback round.' }).world;
/** The investor note (the bigger mall) logged; with the feedback note on top when `on`. */
const world = (on: boolean, markets: Parameters<typeof careerWorld>[1] = ['lagos']) =>
  on ? announce(careerWorld(42, markets)) : careerWorld(42, markets);
const cash = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;

function addBanker(w: World, gender: 'female' | 'male' = 'male', id = B): World {
  return run(w, id, {
    type: 'player.create',
    handle: `h_${id}`.slice(0, 20),
    name: 'Bea Banker',
    role: 'banker',
    backgroundId: 'b-commercial',
    market: 'lagos',
    bank: { name: 'Trust Bank', bankType: 'commercial' },
    gender,
  }).world;
}

interface MallItemT {
  id: string;
  shop: string;
  price: number;
  colours?: string[];
  local?: true;
}
const mallOf = (w: World, id: string) =>
  (playerView(w, id)!.me as unknown as { mall: { shops: string[]; items: MallItemT[] } }).mall;

describe('dressed for the role', () => {
  it('a new banker starts in a suit and tie, with the pieces in the wardrobe', () => {
    const w = addBanker(world(true));
    const p = w.players[B]!;
    expect(p.appearance).toMatchObject({
      topStyle: 'suit',
      topColor: '#1f2633',
      tie: 'silk',
      shoes: 'oxfords',
      watch: 'dress',
      bag: 'briefcase',
    });
    expect(p.wardrobe!.map((e) => e.item)).toEqual([
      'sui-classic',
      'sui-tie-silk',
      'sui-oxfords',
      'sui-watch',
      'sui-briefcase',
    ]);
    expect(p.wardrobe![0]).toMatchObject({ colour: '#1f2633' });
    // Change into something else and back into the suit, free.
    const before = cash(w, B);
    const tee = run(w, B, { type: 'mall.buy', itemId: 'top-tee', colour: '#dc2626' }).world;
    const back = run(tee, B, {
      type: 'wardrobe.wear',
      itemId: 'sui-classic',
      colour: '#1f2633',
    }).world;
    expect(back.players[B]!.appearance).toMatchObject({ topStyle: 'suit', topColor: '#1f2633' });
    expect(cash(back, B)).toBe(cash(tee, B));
    expect(cash(tee, B)).toBeLessThan(before);
  });

  it('a woman banker in a trouser suit with courts; an investor smart-casual; a founder casual', () => {
    let w = addBanker(world(true), 'female');
    w = addInvestor(w, I);
    w = addFounder(w, F);
    expect(w.players[B]!.appearance).toMatchObject({
      topStyle: 'suit',
      topColor: '#1e2a44',
      shoes: 'courts',
      bag: 'worktote',
    });
    expect(w.players[B]!.appearance!.tie).toBeUndefined();
    expect(w.players[I]!.appearance).toMatchObject({
      topStyle: 'blazer',
      legs: 'chinos',
      shoes: 'loafers',
      bag: 'folio',
    });
    expect(w.players[F]!.appearance).toMatchObject({
      topStyle: 'hoodie',
      legs: 'jeans',
      shoes: 'trainers',
    });
    // The rest of the look is the seeded one (skin, hair …): only the clothes are the role's.
    expect(w.players[F]!.appearance!.skin).toBeTruthy();
  });

  it('dresses players who start with quick start too', () => {
    const w = run(world(true), B, {
      type: 'player.quickStart',
      username: 'quick_banker',
      role: 'banker',
      gender: 'male',
    }).world;
    expect(w.players[B]!.appearance).toMatchObject({ topStyle: 'suit', tie: 'silk' });
  });

  it('every outfit piece is a real wardrobe item for its part of the look', () => {
    for (const role of ['founder', 'investor', 'banker'] as const)
      for (const g of ['female', 'male'] as const) {
        const kit = roleOutfit(role, g);
        for (const k of kit.items) {
          const x = MALL_ITEMS.find((i) => i.id === k.item);
          expect(x, k.item).toBeTruthy();
          expect(!!(x!.topStyle || x!.worn), k.item).toBe(true);
          if (x!.topStyle) {
            expect(kit.look.topStyle).toBe(x!.topStyle);
            expect(k.colour).toBe(kit.look.topColor);
          } else expect((kit.look as Record<string, string>)[x!.worn!.slot]).toBe(x!.worn!.style);
        }
      }
  });

  it('without the feedback note, new players are created exactly as before', () => {
    const w = addFounder(addBanker(world(false)), F);
    for (const id of [B, F]) {
      expect(w.players[id]!.appearance).toBeUndefined();
      expect(w.players[id]!.wardrobe).toBeUndefined();
      expect(w.players[id]!.appearanceAt).toBeUndefined();
    }
  });

  it('existing players keep their look when the note arrives', () => {
    const before = addFounder(world(false), F);
    const after = announce(before);
    expect(after.players[F]!.appearance).toBeUndefined();
    expect(after.players[F]!.wardrobe).toBeUndefined();
  });
});

describe('The Suit Shop and more clothes', () => {
  it('opens with the feedback note: suits in their cloths, shirts, ties, shoes, watches, bags', () => {
    const w = addFounder(world(true), F);
    const mall = mallOf(w, F);
    expect(mall.shops).toEqual([...MALL_SHOPS_FEEDBACK]);
    const suits = mall.items.filter((i) => i.shop === 'suits');
    expect(suits.length).toBeGreaterThanOrEqual(20);
    const suit = suits.find((i) => i.id === 'sui-classic')!;
    expect(suit.colours).toEqual([...SUIT_COLOURS]);
    // Cheap to designer.
    const prices = suits.filter((i) => i.colours && i.id.startsWith('sui-')).map((i) => i.price);
    expect(Math.max(...prices)).toBeGreaterThan(Math.min(...prices) * 8);
    // Buy a navy suit and a silk tie: on you, in your wardrobe; money to the shop.
    const before = cash(w, F);
    const a = run(w, F, { type: 'mall.buy', itemId: 'sui-slim', colour: '#1E2A44' });
    const b = run(a.world, F, { type: 'mall.buy', itemId: 'sui-tie-silk' });
    expect(b.world.players[F]!.appearance).toMatchObject({
      topStyle: 'suit',
      topColor: '#1e2a44',
      tie: 'silk',
    });
    expect(cash(b.world, F)).toBe(before - a.result.price - b.result.price);
    expect(b.world.players[F]!.wardrobe!.map((e) => e.item)).toEqual(
      expect.arrayContaining(['sui-slim', 'sui-tie-silk']),
    );
    // A suit comes in its cloths only.
    expect(tryRun(w, F, { type: 'mall.buy', itemId: 'sui-slim', colour: '#f97316' }).ok).toBe(
      false,
    );
  });

  it('sells each city’s own traditional styles in that city only', () => {
    const w = addFounder(
      addFounder(world(true, ['lagos', 'nairobi']), F, 'lagos'),
      'u_f2',
      'nairobi',
    );
    const lagos = mallOf(w, F).items.map((i) => i.id);
    const nairobi = mallOf(w, 'u_f2').items.map((i) => i.id);
    expect(lagos).toContain('loc-agbada');
    expect(lagos).not.toContain('loc-kitenge');
    expect(nairobi).toContain('loc-kitenge');
    expect(mallOf(w, F).items.find((i) => i.id === 'loc-agbada')!.local).toBe(true);
    expect(
      tryRun(w, 'u_f2', { type: 'mall.buy', itemId: 'loc-agbada', colour: '#a16207' }).ok,
    ).toBe(false);
    expect(tryRun(w, F, { type: 'mall.buy', itemId: 'loc-agbada', colour: '#a16207' }).ok).toBe(
      true,
    );
  });

  it('without the feedback note, the shops are unchanged and nothing new is sold', () => {
    const w = addFounder(world(false), F);
    const mall = mallOf(w, F);
    expect(mall.shops).toEqual([...MALL_SHOPS]);
    const fresh = MALL_ITEMS.filter((i) => i.feedback).map((i) => i.id);
    expect(fresh.length).toBeGreaterThan(40);
    expect(mall.items.filter((i) => fresh.includes(i.id))).toEqual([]);
    expect(mall.items.length).toBe(MALL_ITEMS.filter((i) => !i.feedback).length);
    for (const itemId of ['sui-classic', 'sui-tie-silk', 'fash-chinos', 'loc-agbada'])
      expect(tryRun(w, F, { type: 'mall.buy', itemId, colour: '#1f2633' }).ok, itemId).toBe(false);
    // An older world (no notes) still has its first six shops.
    const old = addFounder(makeWorld(42, ['lagos']), F);
    expect(mallOf(old, F).shops).toHaveLength(6);
  });
});
