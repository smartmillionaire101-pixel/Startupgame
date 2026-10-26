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
