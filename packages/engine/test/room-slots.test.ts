import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  BATHROOM_SLOTS,
  FURNITURE,
  FURNITURE_SLOTS,
  HALLWAY_SLOTS,
  MAX_COMFORT_POINTS,
  ROOM_SLOTS,
  isRoomSlot,
} from '../src/data/lifestyle-shop.js';
import { ONE_PER_HOME, SLOT_BOOSTS } from '../src/data/home-style.js';
import { comfortEnergy } from '../src/shop.js';
import { FEEDBACK_NOTE, GAMEPLAY_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { addFounder, careerWorld, run, tryRun } from './helpers.js';

/**
 * Round 7 (GAMEPLAY_NOTE): things for the bathroom and the hallway. Worlds
 * without the note don't sell them (the catalogue, the commands and comfort
 * are exactly as before).
 */
const F = 'u_founder';
const me = (w: World) => w.players[F]!;
const cash = (w: World) => w.accounts[me(w).accounts.local]!.balance;

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

type View = {
  market: { shop: { furniture: { id: string; slot: string; price: number }[] } };
  me: { shop: { prices: Record<string, number> }; homeStyle: { extraSlots: string[] } | null };
};
const view = (w: World) => playerView(w, F) as unknown as View;

describe('bathroom and hallway things (round 7)', () => {
  it('five slots each, three tiers, a boost each, none of them built in', () => {
    expect(BATHROOM_SLOTS).toHaveLength(5);
    expect(HALLWAY_SLOTS).toHaveLength(5);
    for (const s of ROOM_SLOTS) {
      expect(FURNITURE_SLOTS).toContain(s);
      expect(SLOT_BOOSTS[s].length).toBeGreaterThan(0);
      expect(ONE_PER_HOME).not.toContain(s);
      const tiers = FURNITURE.filter((f) => f.slot === s);
      expect(tiers.map((f) => f.tier)).toEqual([1, 2, 3]);
      expect(tiers[0]!.priceCol).toBeLessThan(tiers[1]!.priceCol);
      expect(tiers[1]!.priceCol).toBeLessThan(tiers[2]!.priceCol);
    }
    // Comfort's scale is the 21 slots it always was.
    expect(MAX_COMFORT_POINTS).toBe(21 * 3);
  });

  it('an older world doesn’t sell them: not in the shop or the catalogue, refused', () => {
    const w = world(FEEDBACK_NOTE);
    const v = view(w);
    expect(v.market.shop.furniture.some((f) => isRoomSlot(f.slot))).toBe(false);
    expect(Object.keys(v.me.shop.prices).some((k) => k.startsWith('towels-'))).toBe(false);
    for (const type of ['home.buy', 'home.order'] as const) {
      const r = tryRun(w, F, { type, itemId: 'towels-1' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('home.item');
    }
    expect(v.me.homeStyle?.extraSlots).not.toContain('towels');
  });

  it('with the note: sold in the shop and online, bought, and more than one of them', () => {
    let w = world();
    const v = view(w);
    for (const s of ROOM_SLOTS) {
      expect(v.market.shop.furniture.filter((f) => f.slot === s)).toHaveLength(3);
      expect(v.me.shop.prices[`${s}-2`]).toBeGreaterThan(0);
    }
    expect(v.me.homeStyle?.extraSlots).toEqual(expect.arrayContaining([...ROOM_SLOTS]));
    const before = cash(w);
    w = run(w, F, { type: 'home.buy', itemId: 'shoes-2' }).world;
    expect(cash(w)).toBeLessThan(before);
    expect(me(w).home?.items.some((x) => x.itemId === 'shoes-2')).toBe(true);
    w = run(w, F, { type: 'home.extra.buy', itemId: 'shoes-1' }).world;
    expect(me(w).homeExtras?.filter((x) => x.slot === 'shoes')).toHaveLength(1);
    const o = run(w, F, { type: 'home.order', itemId: 'hamper-3' });
    expect(o.world.deliveries![o.result.id]).toBeTruthy();
  });

  it('comfort still tops out at 100 with every slot at luxury', () => {
    const w = produce(world(), (d) => {
      d.players[F]!.home = {
        items: FURNITURE_SLOTS.map((s) => ({ slot: s, itemId: `${s}-3`, paid: 1 })),
      };
    });
    expect((playerView(w, F)!.me as unknown as { home: { comfort: number } }).home.comfort).toBe(
      100,
    );
    expect(comfortEnergy(me(w))).toBe(8);
  });
});
