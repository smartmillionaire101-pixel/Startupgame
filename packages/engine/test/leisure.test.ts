import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { GOLF, golfCourse, MALL_ITEMS } from '../src/data/leisure.js';
import { isOpen } from '../src/economy.js';
import { LIFE_BARS_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import { MARKET_IDS } from '../src/data/markets.js';
import type { World } from '../src/types.js';
import { addFounder, makeWorld, run, settle, tryRun } from './helpers.js';

const F = 'u_founder';
const bal = (w: World, id: string) => w.accounts[id]!.balance;
const cash = (w: World) => bal(w, w.players[F]!.accounts.local);
const fresh = () => addFounder(makeWorld(42, ['lagos']));
/** After a settlement: the city's landmarks (the golf club among them) have opened. */
const settled = () => addFounder(settle(makeWorld(42, ['lagos']), 'lagos', 1));
const totalMoney = (w: World) =>
  Object.values(w.accounts)
    .filter((a) => !a.external && a.currency === 'NGN')
    .reduce((s, a) => s + a.balance, 0);

describe('golf: the course', () => {
  it('every city has three holes from its id, the same every time', () => {
    for (const id of MARKET_IDS) {
      const c = golfCourse(id);
      expect(c.holes).toHaveLength(3);
      expect(c.par).toBe(c.holes.reduce((s, h) => s + h.par, 0));
      expect(c.holes.map((h) => h.par).sort()).toEqual([3, 4, 5]);
      expect(golfCourse(id)).toEqual(c);
      for (const h of c.holes) expect(h.length).toBeGreaterThan(100);
    }
    expect(golfCourse('lagos').name).toBe('Ikoyi Golf and Polo Club');
  });

  it('the view carries the course, the fee and no record yet', () => {
    const w = fresh();
    const v = playerView(w, F)!.me as unknown as {
      golf: { fee: number; holes: unknown[]; you: unknown };
    };
    expect(v.golf.holes).toHaveLength(3);
    expect(v.golf.fee).toBeGreaterThan(0);
    expect(v.golf.you).toBeNull();
  });
});

describe('golf.round', () => {
  it('charges the green fee to the club’s till, takes hours and energy, keeps your record', () => {
    const w0 = settled();
    const club = Object.values(w0.markets.lagos!.businesses!).find(
      (b) => b.kind === 'golf-club' && isOpen(b),
    )!;
    expect(club).toBeTruthy();
    const course = golfCourse('lagos');
    const card = course.holes.map((h) => h.par + 1);
    const me0 = w0.players[F]!;
    const { world: w1, result } = run(w0, F, { type: 'golf.round', strokes: card });
    expect(result.fee).toBeGreaterThan(0);
    expect(cash(w0) - cash(w1)).toBe(result.fee);
    expect(bal(w1, club.account) - bal(w0, club.account)).toBe(result.fee);
    expect(totalMoney(w1)).toBe(totalMoney(w0));
    expect(w1.players[F]!.hours.used - me0.hours.used).toBe(GOLF.hours);
    expect(w1.players[F]!.energy).toBeLessThan(me0.energy);
    expect(result.vsPar).toBe(3);
    expect(w1.players[F]!.golf).toMatchObject({ rounds: 1, best: 3, thisMonth: 1 });
    // A better round lowers your best.
    const better = course.holes.map((h) => h.par - (h.par === 5 ? 1 : 0));
    const { world: w2, result: r2 } = run(w1, F, { type: 'golf.round', strokes: better });
    expect(r2.vsPar).toBe(-1);
    expect(w2.players[F]!.golf).toMatchObject({ rounds: 2, best: -1 });
  });

  it('is deterministic: the same card in the same world meets the same person', () => {
    const card = golfCourse('lagos').holes.map((h) => h.par);
    const a = run(fresh(), F, { type: 'golf.round', strokes: card });
    const b = run(fresh(), F, { type: 'golf.round', strokes: card });
    expect(a.result.met).toEqual(b.result.met);
    expect(a.world.players[F]).toEqual(b.world.players[F]);
  });

  it('may introduce someone on the course (a contact), on the first rounds of a month', () => {
    let w = fresh();
    const card = golfCourse('lagos').holes.map((h) => h.par);
    const before = (w.players[F]!.contacts ?? []).length;
    let met = 0;
    for (let i = 0; i < 5; i++) {
      w = produce(w, (d) => {
        d.players[F]!.hours.used = 0;
      });
      const r = run(w, F, { type: 'golf.round', strokes: card });
      w = r.world;
      if (r.result.met) met++;
      if (i >= GOLF.meetRoundsPerMonth) expect(r.result.met).toBeNull();
    }
    expect((w.players[F]!.contacts ?? []).length).toBe(before + met);
  });

  it('refuses a wrong card or a month without the hours', () => {
    const w = fresh();
    expect(tryRun(w, F, { type: 'golf.round', strokes: [4, 3] }).ok).toBe(false);
    const tired = produce(w, (d) => {
      const p = d.players[F]!;
      p.hours.used = p.hours.available - 1;
    });
    const r = tryRun(tired, F, { type: 'golf.round', strokes: [4, 3, 5] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('golf.hours');
  });

  it('eases stress once the life bars are on', () => {
    const w0 = addFounder(
      run(makeWorld(42, ['lagos']), null, {
        type: 'system.announce',
        id: LIFE_BARS_NOTE,
        text: 'x',
      }).world,
    );
    const card = golfCourse('lagos').holes.map((h) => h.par);
    const { world, result } = run(w0, F, { type: 'golf.round', strokes: card });
    expect(world.players[F]!.stress).toBeLessThan(w0.players[F]!.stress!);
    expect(result.barChanges.stress).toBeLessThan(0);
    expect(result.barsFx).toBeUndefined();
  });
});

describe('mall.buy', () => {
  it('clothes change your look, in the colour you pick', () => {
    const w0 = fresh();
    expect(tryRun(w0, F, { type: 'mall.buy', itemId: 'top-hoodie' }).ok).toBe(false);
    const { world, result } = run(w0, F, {
      type: 'mall.buy',
      itemId: 'top-hoodie',
      colour: '#DB2777',
    });
    expect(world.players[F]!.appearance).toMatchObject({ topStyle: 'hoodie', topColor: '#db2777' });
    expect(cash(w0) - cash(world)).toBe(result.price);
    expect(totalMoney(world)).toBe(totalMoney(w0));
    // The same again is refused; sunglasses go on top.
    expect(tryRun(world, F, { type: 'mall.buy', itemId: 'top-hoodie', colour: '#db2777' }).ok).toBe(
      false,
    );
    const r2 = run(world, F, { type: 'mall.buy', itemId: 'acc-shades' });
    expect(r2.world.players[F]!.appearance).toMatchObject({
      glasses: 'shades',
      topStyle: 'hoodie',
    });
  });

  it('a phone is yours (cosmetic); furniture goes into your home', () => {
    const w0 = fresh();
    const { world: w1 } = run(w0, F, { type: 'mall.buy', itemId: 'phone-2' });
    expect(w1.players[F]!.phone?.tier).toBe(2);
    expect(tryRun(w1, F, { type: 'mall.buy', itemId: 'phone-2' }).ok).toBe(false);
    const { world: w2, result } = run(w1, F, { type: 'mall.buy', itemId: 'sofa-2' });
    expect(result.home).toBe(true);
    expect(w2.players[F]!.home?.items.some((i) => i.itemId === 'sofa-2')).toBe(true);
    const mall = (
      playerView(w2, F)!.me as unknown as { mall: { items: { id: string; owned: boolean }[] } }
    ).mall;
    expect(mall.items.find((i) => i.id === 'sofa-2')?.owned).toBe(true);
    expect(mall.items.find((i) => i.id === 'phone-2')?.owned).toBe(true);
  });

  it('the food court feeds you, a film takes hours', () => {
    const w0 = produce(fresh(), (d) => {
      d.players[F]!.needs = { hunger: 30, hygiene: 70, fun: 40, social: 60 };
    });
    const { world: w1 } = run(w0, F, { type: 'mall.buy', itemId: 'local-plate' });
    expect(w1.players[F]!.needs!.hunger).toBe(65);
    const { world: w2 } = run(w1, F, { type: 'mall.buy', itemId: 'film' });
    expect(w2.players[F]!.hours.used - w1.players[F]!.hours.used).toBe(2.5);
    expect(w2.players[F]!.needs!.fun).toBeGreaterThan(w1.players[F]!.needs!.fun);
  });

  it('every item has a price in the view', () => {
    const items = (
      playerView(fresh(), F)!.me as unknown as { mall: { items: { price: number }[] } }
    ).mall.items;
    expect(items).toHaveLength(MALL_ITEMS.length);
    for (const i of items) expect(i.price).toBeGreaterThan(0);
  });

  it('a world that never golfs or shops has no new fields', () => {
    const w = settle(fresh(), 'lagos', 1);
    expect(w.players[F]!.golf).toBeUndefined();
    expect(w.players[F]!.phone).toBeUndefined();
  });
});
