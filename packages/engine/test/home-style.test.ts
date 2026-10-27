import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { FURNITURE } from '../src/data/lifestyle-shop.js';
import {
  BOOST_ACT_PER_POINT,
  BOOST_KEYS,
  BOOST_SETTLE,
  FLOOR_FINISHES,
  SLOT_BOOSTS,
  WALL_FINISHES,
} from '../src/data/home-style.js';
import { boostsOf, ownedBoosts } from '../src/homestyle.js';
import { FEEDBACK_NOTE, SHOP_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { addFounder, careerWorld, run, settle, tryRun } from './helpers.js';

/**
 * Buy mode at home (the feedback round): every thing lifts a need, owning
 * it softens the month's fall, using it adds to the act; floors and paint.
 */
const F = 'u_founder';
const me = (w: World) => w.players[F]!;
const cash = (w: World) => w.accounts[me(w).accounts.local]!.balance;

function world(on: boolean): World {
  const w0 = run(careerWorld(42, ['lagos']), null, {
    type: 'system.announce',
    id: on ? FEEDBACK_NOTE : SHOP_NOTE,
    text: 'Notes.',
  }).world;
  return produce(addFounder(w0), (d) => {
    d.accounts[d.players[F]!.accounts.local]!.balance += 50_000_000_00;
  });
}

/** Own these things (installed, as if delivered and unpacked). */
const furnish = (w: World, ids: string[]) =>
  produce(w, (d) => {
    const p = d.players[F]!;
    p.home = {
      items: ids.map((id) => ({ slot: id.replace(/-\d$/, ''), itemId: id, paid: 1 })),
    };
  });

const view = (w: World) =>
  (playerView(w, F)!.me as unknown as { homeStyle: Record<string, unknown> | null }).homeStyle;

describe('need boosts: the data', () => {
  it('every furniture item lifts at least one need, by its tier', () => {
    for (const f of FURNITURE) {
      const b = boostsOf(f.id);
      const keys = Object.keys(b);
      expect(keys.length, f.id).toBeGreaterThan(0);
      for (const k of keys) {
        expect(BOOST_KEYS).toContain(k);
        expect(b[k as keyof typeof b]).toBe(f.tier);
      }
    }
  });

  it('the things you’d expect: a TV is fun, a sofa social, a kitchen feeds you, a bed rests you', () => {
    expect(SLOT_BOOSTS.tv).toContain('fun');
    expect(SLOT_BOOSTS.gaming).toContain('fun');
    expect(SLOT_BOOSTS.sofa).toContain('social');
    expect(SLOT_BOOSTS.kitchen).toContain('hunger');
    expect(SLOT_BOOSTS.washer).toContain('hygiene');
    expect(SLOT_BOOSTS.bed).toContain('energy');
  });
});

describe('need boosts: the gate', () => {
  it('an older world plays as before: no boosts at month end or in acts, no finishes', () => {
    const a = furnish(world(false), ['tv-3', 'sofa-3', 'kitchen-3', 'bed-3']);
    expect(view(a)).toBeNull();
    // A month: needs fall exactly as for a bare home.
    const bare = settle(world(false), 'lagos', 1);
    const full = settle(a, 'lagos', 1);
    expect(me(full).needs).toEqual(me(bare).needs);
    // An act: what it always did.
    const r = run(a, F, { type: 'home.act', act: 'cook' });
    expect((r.result as { boost?: unknown }).boost).toBeUndefined();
    const f = tryRun(a, F, { type: 'home.finish', surface: 'wall', finish: 'sage', floor: 0 });
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.error.code).toBe('command.unknown');
  });
});

describe('need boosts: applied', () => {
  it('owning things softens the monthly fall of the needs they lift', () => {
    const base = world(true);
    const bare = me(settle(base, 'lagos', 1)).needs!;
    const w = furnish(base, ['tv-3', 'sofa-2', 'kitchen-1']);
    expect(ownedBoosts(me(w))).toMatchObject({ fun: 3, social: 2, hunger: 1 });
    const after = me(settle(w, 'lagos', 1)).needs!;
    const S = BOOST_SETTLE.needPerPoint;
    expect(after.fun - bare.fun).toBe(3 * S);
    expect(after.social - bare.social).toBe(2 * S);
    expect(after.hunger - bare.hunger).toBe(1 * S);
    expect(after.hygiene).toBe(bare.hygiene);
  });

  it('using a better thing adds more to the act', () => {
    const hungry = (w: World) =>
      produce(w, (d) => {
        d.players[F]!.needs!.hunger = 10;
      });
    const lo = run(hungry(furnish(world(true), ['kitchen-1'])), F, {
      type: 'home.act',
      act: 'cook',
    });
    const hi = run(hungry(furnish(world(true), ['kitchen-3'])), F, {
      type: 'home.act',
      act: 'cook',
    });
    const boost = (r: typeof lo) => (r.result as { boost: { hunger?: number } }).boost;
    expect(boost(lo).hunger).toBe(1 * BOOST_ACT_PER_POINT);
    expect(boost(hi).hunger).toBe(3 * BOOST_ACT_PER_POINT);
    expect(me(hi.world).needs!.hunger - me(lo.world).needs!.hunger).toBe(2 * BOOST_ACT_PER_POINT);
  });

  it('the view lists every item’s boosts and what you own lifts', () => {
    const v = view(furnish(world(true), ['tv-2'])) as {
      boosts: Record<string, Record<string, number>>;
      owned: Record<string, number>;
    };
    expect(Object.keys(v.boosts)).toHaveLength(FURNITURE.length);
    expect(v.boosts['tv-2']).toEqual({ fun: 2 });
    expect(v.owned.fun).toBe(2);
  });
});

describe('floors and wall paint', () => {
  it('free finishes cost nothing; a paid one is paid once through the ledger, then yours', () => {
    let w = world(true);
    const before = cash(w);
    w = run(w, F, {
      type: 'home.finish',
      surface: 'floor',
      finish: 'parquet',
      floor: 0,
      room: 'living',
    }).world;
    expect(cash(w)).toBe(before);
    expect(me(w).homeStyle?.floors).toEqual({ '0:living': 'parquet' });

    const marble = FLOOR_FINISHES.find((f) => f.id === 'marble')!;
    const r = run(w, F, {
      type: 'home.finish',
      surface: 'floor',
      finish: marble.id,
      floor: 0,
      room: 'kitchen',
    });
    const price = (r.result as { price: number }).price;
    expect(price).toBeGreaterThan(0);
    expect(cash(r.world)).toBe(before - price);
    // Yours now: marble in another room is free.
    const again = run(r.world, F, {
      type: 'home.finish',
      surface: 'floor',
      finish: 'marble',
      floor: 1,
      room: 'bedroom',
    });
    expect((again.result as { price: number }).price).toBe(0);
    expect(cash(again.world)).toBe(before - price);
    const v = view(again.world) as { floors: { id: string; owned: boolean; price: number }[] };
    expect(v.floors.find((f) => f.id === 'marble')).toMatchObject({ owned: true, price: 0 });

    // Wall paint for the whole home; 'default' puts a room's own floor back.
    const charcoal = WALL_FINISHES.find((f) => f.id === 'charcoal')!;
    expect(charcoal.priceCol).toBeGreaterThan(0);
    w = run(again.world, F, {
      type: 'home.finish',
      surface: 'wall',
      finish: 'charcoal',
      floor: 0,
    }).world;
    expect(me(w).homeStyle?.wall).toBe('charcoal');
    w = run(w, F, {
      type: 'home.finish',
      surface: 'floor',
      finish: 'default',
      floor: 0,
      room: 'kitchen',
    }).world;
    expect(me(w).homeStyle?.floors?.['0:kitchen']).toBeUndefined();
  });

  it('refuses what it can’t do', () => {
    const w = world(true);
    const bad = tryRun(w, F, {
      type: 'home.finish',
      surface: 'floor',
      finish: 'lava',
      floor: 0,
      room: 'living',
    });
    expect(bad.ok).toBe(false);
    const noRoom = tryRun(w, F, { type: 'home.finish', surface: 'floor', finish: 'oak', floor: 0 });
    expect(noRoom.ok).toBe(false);
    const broke = produce(w, (d) => {
      d.accounts[d.players[F]!.accounts.local]!.balance = 0;
    });
    const r = tryRun(broke, F, {
      type: 'home.finish',
      surface: 'wall',
      finish: 'timber',
      floor: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('home.funds');
  });
});

describe('more than one of a thing (player feedback)', () => {
  const total = (w: World) => Object.values(w.accounts).reduce((a, x) => a + x.balance, 0);

  it('an older world doesn’t know the commands', () => {
    const w = furnish(world(false), ['sound-1']);
    const r = tryRun(w, F, { type: 'home.extra.buy', itemId: 'sound-1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('command.unknown');
  });

  it('buys a second and third speaker through the ledger, each its own; boosts count once', () => {
    let w = furnish(world(true), ['sound-2', 'art-1']);
    const before = cash(w);
    const sum = total(w);
    const boosts = ownedBoosts(me(w));
    const a = run(w, F, { type: 'home.extra.buy', itemId: 'sound-2' });
    const price = (a.result as { price: number }).price;
    expect(price).toBeGreaterThan(0);
    w = run(a.world, F, { type: 'home.extra.buy', itemId: 'sound-2' }).world;
    w = run(w, F, { type: 'home.extra.buy', itemId: 'art-1' }).world;
    const extras = me(w).homeExtras!;
    expect(extras.map((x) => x.slot)).toEqual(['sound', 'sound', 'art']);
    expect(new Set(extras.map((x) => x.id)).size).toBe(3);
    expect(cash(w)).toBeLessThan(before - 2 * price);
    // Money moves, none is made or lost.
    expect(total(w)).toBe(sum);
    // The slot keeps its one; the extras add no boost (each kind counts once).
    expect(me(w).home!.items).toHaveLength(2);
    expect(ownedBoosts(me(w))).toEqual(boosts);
    const v = view(w) as { extras: { id: string; slot: string; tier: number }[] };
    expect(v.extras.map((x) => [x.slot, x.tier])).toEqual([
      ['sound', 2],
      ['sound', 2],
      ['art', 1],
    ]);
    // Sell one back: furniture's share of what you paid, the rest stay.
    const s = run(w, F, { type: 'home.extra.sell', extraId: extras[0]!.id });
    expect((s.result as { refund: number }).refund).toBe(Math.round(price * 0.4));
    expect(me(s.world).homeExtras!.map((x) => x.id)).toEqual([extras[1]!.id, extras[2]!.id]);
    expect(total(s.world)).toBe(sum);
  });

  it('refuses what a home has one of, a first one you don’t have, and too many', () => {
    const w = furnish(world(true), ['bed-1', 'plants-1']);
    const bed = tryRun(w, F, { type: 'home.extra.buy', itemId: 'bed-1' });
    expect(bed.ok).toBe(false);
    if (!bed.ok) expect(bed.error.code).toBe('home.extra');
    const first = tryRun(w, F, { type: 'home.extra.buy', itemId: 'lights-1' });
    expect(first.ok).toBe(false);
    let full = w;
    for (let i = 0; i < 5; i++)
      full = run(full, F, { type: 'home.extra.buy', itemId: 'plants-1' }).world;
    const more = tryRun(full, F, { type: 'home.extra.buy', itemId: 'plants-1' });
    expect(more.ok).toBe(false);
    if (!more.ok) expect(more.error.code).toBe('home.extra.max');
  });
});
