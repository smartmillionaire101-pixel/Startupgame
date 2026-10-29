import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { DELIVERY_TERMS, deliveryFee, slotCategory } from '../src/data/catalog.js';
import { furnitureItem } from '../src/data/lifestyle-shop.js';
import { FEEDBACK_NOTE, GAMEPLAY_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { Command } from '../src/commands.js';
import type { World } from '../src/types.js';
import { T0, addFounder, careerWorld, run, tryRun } from './helpers.js';

/**
 * Round 7 (GAMEPLAY_NOTE): a basket is one order, and one order is one van
 * (basket.ts): quantities (more of a thing rides in the van and is yours
 * when unpacked), the van arrives with its slowest thing and charges its
 * dearest fee once, and "Unpack all" empties it.
 */
const F = 'u_founder';
const me = (w: World) => w.players[F]!;
const cash = (w: World) => w.accounts[me(w).accounts.local]!.balance;
const total = (w: World) => Object.values(w.accounts).reduce((a, x) => a + x.balance, 0);

function world(note: string = GAMEPLAY_NOTE): World {
  const w0 = run(careerWorld(42, ['lagos']), null, {
    type: 'system.announce',
    id: note,
    text: 'Notes.',
  }).world;
  return produce(addFounder(w0), (d) => {
    d.accounts[d.players[F]!.accounts.local]!.balance += 500_000_000_00;
  });
}

type Shop = { prices: Record<string, number>; delivery: Record<string, { minFee: number }> };
const shop = (w: World) =>
  (playerView(w, F)!.me as unknown as { shop: Shop & { basket: boolean } }).shop;
const mine = (w: World) =>
  Object.values(w.deliveries ?? {}).filter((d) => d.owner === F && !d.complete);
const order = (lines: unknown[], extra: Record<string, unknown> = {}) =>
  ({ type: 'shop.order', lines, ...extra }) as unknown as Command;

describe('one order, one van (round 7)', () => {
  it('an older world doesn’t know the order or Unpack all', () => {
    const w = world(FEEDBACK_NOTE);
    expect(shop(w).basket).toBe(false);
    const r = tryRun(w, F, order([{ kind: 'furniture', itemId: 'plants-1', qty: 1 }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('command.unknown');
    const one = run(w, F, { type: 'home.order', itemId: 'plants-1' });
    expect(one.world.deliveries![one.result.id]!.van).toBeUndefined();
    const all = tryRun(
      one.world,
      F,
      { type: 'living.collect', deliveryId: one.result.id, all: true },
      T0 + 31_000,
    );
    expect(all.ok).toBe(false);
    if (!all.ok) expect(all.error.code).toBe('command.unknown');
  });

  it('three plants and a painting from Buy mode: one van, unpacked at once, three plants owned', () => {
    const w = world();
    expect(shop(w).basket).toBe(true);
    const prices = shop(w).prices;
    const sum = total(w);
    const before = cash(w);
    const r = run(
      w,
      F,
      order([
        { kind: 'furniture', itemId: 'plants-1', qty: 3 },
        { kind: 'furniture', itemId: 'art-1', qty: 1 },
      ]),
    );
    expect(r.result.things).toBe(4);
    const ds = mine(r.world);
    expect(ds).toHaveLength(4);
    expect(new Set(ds.map((d) => d.van))).toEqual(new Set([r.result.van]));
    expect(new Set(ds.map((d) => d.arrivesAt)).size).toBe(1);
    // The shop's van home: no fee; the things at the store's price.
    expect(cash(r.world)).toBe(before - 3 * prices['plants-1']! - prices['art-1']!);
    expect(total(r.world)).toBe(sum);
    // Not in yet.
    const early = tryRun(
      r.world,
      F,
      { type: 'living.collect', deliveryId: ds[0]!.id, all: true },
      T0 + 1000,
    );
    expect(early.ok).toBe(false);
    // Unpack all: the plants in their slot, two more of them, the painting.
    const u = run(
      r.world,
      F,
      { type: 'living.collect', deliveryId: ds[2]!.id, all: true },
      T0 + 31_000,
    );
    expect(u.result.unpacked).toHaveLength(4);
    expect(mine(u.world)).toHaveLength(0);
    const p = me(u.world);
    expect(p.home!.items.map((i) => i.itemId).sort()).toEqual(['art-1', 'plants-1']);
    expect(p.homeExtras!.map((x) => x.itemId)).toEqual(['plants-1', 'plants-1']);
    // The social lift of carrying it in, once.
    expect(p.needs!.social - me(r.world).needs!.social).toBeLessThanOrEqual(8);
  });

  it('more of a thing you have: all extras; and the limit counts what’s on its way', () => {
    let w = world();
    w = run(w, F, order([{ kind: 'furniture', itemId: 'sound-1', qty: 1 }])).world;
    w = run(w, F, { type: 'living.collect', deliveryId: mine(w)[0]!.id }, T0 + 31_000).world;
    const r = run(w, F, order([{ kind: 'furniture', itemId: 'sound-1', qty: 5 }]));
    expect(mine(r.world).every((d) => d.order?.extra?.itemId === 'sound-1')).toBe(true);
    // One in the slot and five more is the most.
    const more = tryRun(r.world, F, order([{ kind: 'furniture', itemId: 'sound-1', qty: 1 }]));
    expect(more.ok).toBe(false);
    if (!more.ok) expect(more.error.code).toBe('home.extra.max');
    // A kitchen is built in: one to a home.
    const kitchen = tryRun(w, F, order([{ kind: 'furniture', itemId: 'kitchen-1', qty: 2 }]));
    expect(kitchen.ok).toBe(false);
    if (!kitchen.ok) expect(kitchen.error.code).toBe('home.extra');
    // All or nothing: nothing was bought or sent.
    expect(mine(w)).toHaveLength(0);
  });

  it('three sofas: any furniture but built-ins comes in more than one (older worlds: decor only)', () => {
    const w = world();
    const r = run(w, F, order([{ kind: 'furniture', itemId: 'sofa-1', qty: 3 }]));
    expect(mine(r.world)).toHaveLength(3);
    expect(new Set(mine(r.world).map((d) => d.van)).size).toBe(1);
    const u = run(
      r.world,
      F,
      { type: 'living.collect', deliveryId: mine(r.world)[0]!.id, all: true },
      T0 + 31_000,
    );
    const p = me(u.world);
    expect(p.home!.items.filter((i) => i.itemId === 'sofa-1')).toHaveLength(1);
    expect(p.homeExtras!.map((x) => x.itemId)).toEqual(['sofa-1', 'sofa-1']);
    const style = (playerView(u.world, F)!.me as unknown as { homeStyle: { extraSlots: string[] } })
      .homeStyle;
    expect(style.extraSlots).toContain('sofa');
    expect(style.extraSlots).not.toContain('kitchen');
    // Before the note: a second sofa is refused, as it always was.
    let old = world(FEEDBACK_NOTE);
    old = produce(old, (d) => {
      d.players[F]!.home = { items: [{ slot: 'sofa', itemId: 'sofa-1', paid: 1 }] };
    });
    const r2 = tryRun(old, F, { type: 'home.extra.buy', itemId: 'sofa-1' });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe('home.extra');
  });

  it('online: one van, its slowest thing’s wait and its dearest fee once', () => {
    const w = world();
    const s = shop(w);
    const sum = total(w);
    const before = cash(w);
    const items = ['sofa-2', 'art-1', 'plants-1'];
    const r = run(
      w,
      F,
      order(
        items.map((itemId) => ({ kind: 'furniture', itemId, qty: 1 })),
        { delivery: 'standard' },
      ),
    );
    const ds = mine(r.world);
    expect(ds).toHaveLength(3);
    expect(new Set(ds.map((d) => d.van)).size).toBe(1);
    const fees = items.map((id) => {
      const cat = slotCategory(furnitureItem(id)!.slot);
      return deliveryFee(cat, s.prices[id]!, s.delivery[cat]!.minFee, 'standard');
    });
    const slowest = Math.max(
      ...items.map((id) => DELIVERY_TERMS[slotCategory(furnitureItem(id)!.slot)].standardS),
    );
    expect(ds[0]!.arrivesAt).toBe(T0 + slowest * 1000);
    expect(r.result.fee).toBe(Math.max(...fees));
    expect(ds.reduce((a, d) => a + d.order!.fee, 0)).toBe(Math.max(...fees));
    const prices = items.reduce((a, id) => a + s.prices[id]!, 0);
    expect(cash(r.world)).toBe(before - prices - Math.max(...fees));
    expect(total(r.world)).toBe(sum);
  });

  it('a van takes one place in the waiting deliveries, however full', () => {
    let w = world();
    for (let i = 0; i < 8; i++)
      w = run(
        w,
        F,
        order([{ kind: 'wall', wall: 'half', length: 1, qty: 2 }], { delivery: 'standard' }),
      ).world;
    expect(mine(w)).toHaveLength(16);
    const ninth = tryRun(
      w,
      F,
      order([{ kind: 'wall', wall: 'half', length: 1, qty: 1 }], { delivery: 'standard' }),
    );
    expect(ninth.ok).toBe(false);
    if (!ninth.ok) expect(ninth.error.code).toBe('delivery.limit');
  });

  it('is deterministic: the same orders make the same world', () => {
    const play = () => {
      let w = world();
      w = run(
        w,
        F,
        order(
          [
            { kind: 'furniture', itemId: 'rug-1', qty: 2 },
            { kind: 'wall', wall: 'full', length: 2, qty: 1 },
          ],
          { delivery: 'express' },
        ),
      ).world;
      const d = mine(w)[0]!;
      return run(w, F, { type: 'living.collect', deliveryId: d.id, all: true }, T0 + 600_000).world;
    };
    expect(JSON.stringify(play())).toBe(JSON.stringify(play()));
  });
});
