import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  CATALOG_ENTRIES,
  DELIVERY_TERMS,
  OPTION_GROUPS,
  WALLS,
  deliveryFee,
  groupsFor,
  priceWithOptions,
} from '../src/data/catalog.js';
import { MALL_ITEMS } from '../src/data/leisure.js';
import { FURNITURE_SLOTS } from '../src/data/lifestyle-shop.js';
import { BANKERS_NOTE, RELEASES, SHOP_NOTE, shopOn } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { T0, addFounder, careerWorld, run, tryRun } from './helpers.js';

const F = 'u_founder';
const me = (w: World) => w.players[F]!;
const cash = (w: World) => w.accounts[me(w).accounts.local]!.balance;

/** A Lagos founder in a world that logged the shop note, with money to spend. */
function world(note: string = SHOP_NOTE): World {
  const w0 = run(careerWorld(42, ['lagos']), null, {
    type: 'system.announce',
    id: note,
    text: 'Shop online.',
  }).world;
  const w = addFounder(w0);
  return produce(w, (d) => {
    d.accounts[d.players[F]!.accounts.local]!.balance += 500_000_000_00;
  });
}

interface ShopView {
  currency: string;
  prices: Record<string, number>;
  delivery: Record<string, { minFee: number; rate: number }>;
}
const shopOf = (w: World) => (playerView(w, F)!.me as unknown as { shop: ShopView | null }).shop;
const fee = (w: World, cat: keyof typeof DELIVERY_TERMS, price: number, express = false) =>
  deliveryFee(cat, price, shopOf(w)!.delivery[cat]!.minFee, express ? 'express' : 'standard');

describe('the shop note', () => {
  it('comes right after the bankers', () => {
    expect(RELEASES.indexOf(SHOP_NOTE)).toBe(RELEASES.indexOf(BANKERS_NOTE) + 1);
    expect(shopOn({ announcements: [SHOP_NOTE] } as unknown as World)).toBe(true);
    expect(shopOn({ announcements: [BANKERS_NOTE] } as unknown as World)).toBe(false);
  });

  it('an older world plays as before: no options, no delivery, no walls', () => {
    const w = world(BANKERS_NOTE);
    expect(shopOf(w)).toBeNull();
    const refused = [
      { type: 'mall.buy', itemId: 'top-tee', colour: '#dc2626', delivery: 'standard' },
      { type: 'mall.buy', itemId: 'top-tee', colour: '#dc2626', options: { fabric: 'organic' } },
      { type: 'home.order', itemId: 'sofa-2', delivery: 'standard' },
      { type: 'car.buy', modelId: 'hatchback', delivery: 'express' },
      { type: 'home.wall.buy', kind: 'full', length: 2, delivery: 'standard' },
      { type: 'home.room.label', floor: 0, x: 1, y: 1, label: 'Office' },
    ] as const;
    for (const cmd of refused) {
      const r = tryRun(w, F, cmd as never);
      expect(r.ok, cmd.type).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('command.unknown');
    }
    // The plain purchase is as it was.
    expect(tryRun(w, F, { type: 'mall.buy', itemId: 'top-tee', colour: '#dc2626' }).ok).toBe(true);
  });
});

describe('the catalogue', () => {
  it('has every shop thing you take home, with options on each', () => {
    const ids = new Set(CATALOG_ENTRIES.flatMap((e) => e.variants.map((v) => v.ref)));
    for (const slot of FURNITURE_SLOTS)
      for (const t of [1, 2, 3]) expect(ids.has(`${slot}-${t}`)).toBe(true);
    for (const x of MALL_ITEMS) {
      if (x.hours || x.shop === 'foodcourt' || x.shop === 'cinema' || x.shop === 'arcade') {
        expect(ids.has(x.id), x.id).toBe(false);
        continue;
      }
      expect(ids.has(x.furnitureId ?? x.id), x.id).toBe(true);
    }
    for (const e of CATALOG_ENTRIES) {
      expect(e.groups.length, e.id).toBeGreaterThan(0);
      for (const g of e.groups) expect(g.options.length, e.id).toBeGreaterThan(1);
    }
    expect(CATALOG_ENTRIES.filter((e) => e.category === 'walls').map((e) => e.id)).toEqual([
      'wall:full',
      'wall:half',
      'wall:glass',
      'wall:sliding',
      'wall:bookshelf',
    ]);
  });

  it('prices options in whole minor units, the same every time', () => {
    const a = priceWithOptions(123_457, [OPTION_GROUPS.fabric], { fabric: 'premium' });
    expect(a).toEqual({
      price: Math.round((123_457 * 1800) / 1000),
      chosen: { fabric: 'premium' },
    });
    expect(priceWithOptions(1000, [OPTION_GROUPS.paint, OPTION_GROUPS.trim], {}).chosen).toEqual({
      paint: 'white',
      trim: 'standard',
    });
    expect(() => priceWithOptions(1000, [OPTION_GROUPS.fabric], { fabric: 'silk' })).toThrow();
    expect(() => priceWithOptions(1000, [OPTION_GROUPS.fabric], { paint: 'red' })).toThrow();
  });

  it('an option changes what you pay in person (a premium-fabric shirt)', () => {
    const w = world();
    const base = shopOf(w)!.prices['top-shirt']!;
    const r = run(w, F, {
      type: 'mall.buy',
      itemId: 'top-shirt',
      colour: '#2563eb',
      options: { fabric: 'premium' },
    });
    expect(r.result.price).toBe(Math.round((base * 1800) / 1000));
    expect(cash(w) - cash(r.world)).toBe(r.result.price);
    // In person you wear it out of the shop.
    expect(me(r.world).appearance).toMatchObject({ topStyle: 'shirt', topColor: '#2563eb' });
  });
});

describe('shopping online', () => {
  it('a top: paid with a delivery fee, at your door later, into the wardrobe (not on you)', () => {
    const w = world();
    const before = me(w).appearance;
    const base = shopOf(w)!.prices['top-hoodie']!;
    const r = run(w, F, {
      type: 'mall.buy',
      itemId: 'top-hoodie',
      colour: '#16a34a',
      options: { fabric: 'organic' },
      delivery: 'standard',
    });
    const price = Math.round((base * 1300) / 1000);
    expect(r.result.price).toBe(price);
    expect(r.result.fee).toBe(fee(w, 'fashion', price));
    expect(r.result.fee).toBeGreaterThan(0);
    expect(cash(w) - cash(r.world)).toBe(price + r.result.fee);
    expect(r.result.arrivesAt).toBe(T0 + DELIVERY_TERMS.fashion.standardS * 1000);
    // Nothing tried on: your look hasn't changed, and it isn't in the wardrobe yet.
    expect(me(r.world).appearance).toEqual(before);
    expect(me(r.world).wardrobe ?? []).toEqual([]);
    // Too early to unpack.
    expect(
      tryRun(r.world, F, { type: 'living.collect', deliveryId: r.result.id }, T0 + 1000).ok,
    ).toBe(false);
    const u = run(
      r.world,
      F,
      { type: 'living.collect', deliveryId: r.result.id },
      r.result.arrivesAt,
    );
    expect(me(u.world).wardrobe).toEqual([
      expect.objectContaining({ item: 'top-hoodie', colour: '#16a34a' }),
    ]);
    expect(me(u.world).appearance).toEqual(before);
  });

  it('express costs twice the fee and comes sooner', () => {
    const w = world();
    const s = run(w, F, { type: 'mall.buy', itemId: 'groceries-week', delivery: 'standard' });
    const e = run(w, F, { type: 'mall.buy', itemId: 'groceries-week', delivery: 'express' });
    expect(e.result.fee).toBe(s.result.fee * 2);
    expect(e.result.arrivesAt).toBeLessThan(s.result.arrivesAt);
    // Groceries feed you when they're unpacked, not when ordered.
    const hunger = me(e.world).needs?.hunger ?? 0;
    const u = run(
      e.world,
      F,
      { type: 'living.collect', deliveryId: e.result.id },
      e.result.arrivesAt,
    );
    expect(me(u.world).needs!.hunger).toBeGreaterThan(hunger);
  });

  it('things you do there are in person only', () => {
    const w = world();
    for (const itemId of ['burger', 'film'])
      expect(tryRun(w, F, { type: 'mall.buy', itemId, delivery: 'standard' }).ok).toBe(false);
  });

  it('furniture in a finish: the store’s price with the option, installed when unpacked', () => {
    const w = world();
    const base = shopOf(w)!.prices['sofa-3']!;
    const r = run(w, F, {
      type: 'home.order',
      itemId: 'sofa-3',
      options: { finish: 'walnut' },
      delivery: 'express',
    });
    const price = Math.round((base * 1150) / 1000);
    expect(r.result.price).toBe(price);
    expect(r.result.fee).toBe(fee(w, 'home', price, true));
    expect(me(r.world).home?.items.some((i) => i.slot === 'sofa') ?? false).toBe(false);
    const u = run(
      r.world,
      F,
      { type: 'living.collect', deliveryId: r.result.id },
      r.result.arrivesAt,
    );
    expect(me(u.world).home!.items).toContainEqual(
      expect.objectContaining({ slot: 'sofa', itemId: 'sofa-3', finish: 'walnut', paid: price }),
    );
    // A second order for the same slot while one is coming is refused.
    expect(
      tryRun(r.world, F, { type: 'home.order', itemId: 'sofa-1', delivery: 'standard' }).ok,
    ).toBe(false);
  });

  it('a car, delivered to the drive in the paint you picked', () => {
    const w = world();
    const base = shopOf(w)!.prices['car:hatchback']!;
    const r = run(w, F, {
      type: 'car.buy',
      modelId: 'hatchback',
      options: { paint: 'red', trim: 'sport' },
      delivery: 'standard',
    });
    const price = Math.round((Math.round((base * 1060) / 1000) * 1120) / 1000);
    expect(r.result.price).toBe(price);
    expect(me(r.world).car).toBeUndefined();
    const u = run(
      r.world,
      F,
      { type: 'living.collect', deliveryId: r.result.id },
      r.result.arrivesAt,
    );
    expect(me(u.world).car).toMatchObject({ modelId: 'hatchback', paint: 'red', trim: 'sport' });
  });

  it('can be ordered from abroad: it waits at home', () => {
    let w = world();
    w = produce(w, (d) => {
      d.players[F]!.location = { market: 'nairobi' } as never;
    });
    const r = run(w, F, { type: 'mall.buy', itemId: 'snacks', delivery: 'standard' });
    expect(r.world.deliveries![r.result.id]!.market).toBe('lagos');
  });

  it('replays exactly', () => {
    const script = (w: World) => {
      let x = run(w, F, { type: 'home.wall.buy', kind: 'glass', length: 3, delivery: 'standard' });
      const id = x.result.id;
      x = run(x.world, F, {
        type: 'mall.buy',
        itemId: 'phone-2',
        options: { warranty: 'w5' },
        delivery: 'express',
      });
      x = run(x.world, F, { type: 'living.collect', deliveryId: id }, T0 + 200_000);
      return x.world;
    };
    expect(JSON.stringify(script(world()))).toBe(JSON.stringify(script(world())));
  });
});

describe('walls and dividers', () => {
  it('ordered online, placed on the grid, moved, taken down and sold back', () => {
    const w = world();
    const base = shopOf(w)!.prices['wall:glass:2']!;
    expect(base).toBeGreaterThan(0);
    const r = run(w, F, {
      type: 'home.wall.buy',
      kind: 'glass',
      length: 2,
      options: { finish: 'frosted' },
      delivery: 'standard',
    });
    const price = Math.round((base * 1150) / 1000);
    expect(r.result.price).toBe(price);
    expect(me(r.world).walls ?? []).toEqual([]);
    let x = run(
      r.world,
      F,
      { type: 'living.collect', deliveryId: r.result.id },
      r.result.arrivesAt,
    ).world;
    const wall = me(x).walls![0]!;
    expect(wall).toMatchObject({ kind: 'glass', len: 2, finish: 'frosted', paid: price });
    expect(wall.x).toBeUndefined();

    x = run(x, F, {
      type: 'home.wall.place',
      wallId: wall.id,
      floor: 0,
      x: 2,
      y: 3,
      dir: 'h',
    }).world;
    expect(me(x).walls![0]).toMatchObject({ floor: 0, x: 2, y: 3, dir: 'h' });
    // The home view shows it (visitors see it too).
    const home = (playerView(x, F)!.me as unknown as { home: { walls: unknown[] } }).home;
    expect(home.walls).toEqual([expect.objectContaining({ id: wall.id, x: 2, y: 3 })]);

    // A second wall can't overlap it; turned, it can cross nearby.
    x = run(x, F, { type: 'home.wall.buy', kind: 'half', length: 3, delivery: 'express' }).world;
    const d2 = Object.values(x.deliveries!).find((d) => !d.complete)!;
    x = run(x, F, { type: 'living.collect', deliveryId: d2.id }, d2.arrivesAt).world;
    const half = me(x).walls![1]!;
    expect(
      tryRun(x, F, { type: 'home.wall.place', wallId: half.id, floor: 0, x: 3, y: 3, dir: 'h' }).ok,
    ).toBe(false);
    expect(
      tryRun(x, F, { type: 'home.wall.place', wallId: half.id, floor: 1, x: 3, y: 3, dir: 'h' }).ok,
    ).toBe(true);
    x = run(x, F, {
      type: 'home.wall.place',
      wallId: half.id,
      floor: 0,
      x: 4,
      y: 0,
      dir: 'v',
    }).world;
    // Moved: place it again somewhere else.
    x = run(x, F, {
      type: 'home.wall.place',
      wallId: half.id,
      floor: 0,
      x: 5,
      y: 1,
      dir: 'v',
    }).world;
    expect(me(x).walls![1]).toMatchObject({ x: 5, y: 1, dir: 'v' });

    // Taken down (into storage), then sold back at 40%.
    x = run(x, F, { type: 'home.wall.remove', wallId: wall.id }).world;
    expect(me(x).walls![0]!.x).toBeUndefined();
    const before = cash(x);
    const s = run(x, F, { type: 'home.wall.remove', wallId: wall.id, sell: true });
    expect(cash(s.world) - before).toBe(Math.round(price * 0.4));
    expect(me(s.world).walls!.map((v) => v.id)).toEqual([half.id]);
  });

  it('in person at a furniture store it’s yours at once, free', () => {
    const w = world();
    const store = Object.values(w.markets.lagos!.businesses ?? {}).find(
      (b) => b.kind === 'furniture-store' && b.closedMonth === undefined,
    );
    if (!store) return; // this city's seed has no furniture store open
    const r = run(w, F, {
      type: 'home.wall.buy',
      kind: 'bookshelf',
      length: 2,
      options: { finish: 'walnut' },
      businessId: store.id,
    });
    expect(cash(w) - cash(r.world)).toBe(r.result.price);
    expect(me(r.world).walls).toHaveLength(1);
    expect(r.result.fee).toBeUndefined();
  });

  it('needs a shop or a delivery, and a length it comes in', () => {
    const w = world();
    expect(tryRun(w, F, { type: 'home.wall.buy', kind: 'full', length: 2 }).ok).toBe(false);
    expect(groupsFor('wall', 'sliding')).toEqual([WALLS.sliding.finish]);
  });

  it('rooms can be named, renamed and cleared', () => {
    let w = world();
    w = run(w, F, {
      type: 'home.room.label',
      floor: 0,
      x: 1,
      y: 1,
      label: '  Home   office ',
    }).world;
    expect(me(w).roomLabels).toEqual([{ floor: 0, x: 1, y: 1, label: 'Home office' }]);
    w = run(w, F, { type: 'home.room.label', floor: 0, x: 1, y: 1, label: 'Nursery' }).world;
    expect(me(w).roomLabels).toEqual([{ floor: 0, x: 1, y: 1, label: 'Nursery' }]);
    w = run(w, F, { type: 'home.room.label', floor: 0, x: 1, y: 1 }).world;
    expect(me(w).roomLabels).toEqual([]);
  });
});
