/**
 * Round 7 (GAMEPLAY_NOTE): resting at home (sit on a seat: stress falls; lie
 * on a bed or mat: energy comes back, per 15 game minutes), and handing a
 * deal to a salesperson. Worlds without the note don't know either command.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { gameMinute } from '../src/places.js';
import { REST } from '../src/rest.js';
import { playerView } from '../src/views.js';
import type { Staff, World } from '../src/types.js';
import { T0, companyOf, run, tryRun } from './helpers.js';
import { F, founder } from './r7-helpers.js';

const me = (w: World) => w.players[F]!;
/** Real ms for `min` game minutes in this world's London. */
const ms = (w: World, min: number) => {
  const m = w.markets.london!;
  const per = (m.monthMs ?? 86_400_000) / (30 * 24 * 60);
  return Math.ceil(min * per);
};
const rest = (w: World, action: 'start' | 'stop', spot?: 'seat' | 'bed', now = T0) =>
  run(w, F, { type: 'home.rest', action, ...(spot ? { spot } : {}) }, now);

describe('#3 resting at home', () => {
  it('a seat takes 1 off stress per 15 game minutes, and spends the hours', () => {
    let w = produce(founder('healthtech'), (x) => {
      x.players[F]!.stress = 50;
    });
    const hours = me(w).hours.used;
    w = rest(w, 'start', 'seat').world;
    expect(me(w).rest).toEqual({ spot: 'seat', since: gameMinute(w.markets.london!, T0) });
    expect(playerView(w, F)!.me.rest?.resting?.spot).toBe('seat');
    // An hour of game time: four blocks.
    const r = rest(w, 'stop', undefined, T0 + ms(w, 60));
    expect(r.result.minutes).toBe(60);
    expect(r.result.stress).toBe(-4 * REST.seatStress);
    expect(r.world.players[F]!.stress).toBe(50 - 4);
    expect(r.world.players[F]!.hours.used).toBe(hours + 1);
    expect(r.world.players[F]!.rest).toBeUndefined();
  });

  it('a nap on the bed or mat gives 4 energy per 15 game minutes; part blocks count for nothing', () => {
    let w = produce(founder('healthtech'), (x) => {
      x.players[F]!.energy = 30;
    });
    w = rest(w, 'start', 'bed').world;
    const r = rest(w, 'stop', undefined, T0 + ms(w, 44));
    expect(r.result.minutes).toBe(30);
    expect(r.result.energy).toBe(2 * REST.bedEnergy);
    expect(r.world.players[F]!.energy).toBe(30 + 8);
  });

  it('one rest counts for at most its cap, and never more hours than you have', () => {
    let w = produce(founder('healthtech'), (x) => {
      x.players[F]!.energy = 0;
    });
    w = rest(w, 'start', 'bed').world;
    const long = rest(w, 'stop', undefined, T0 + ms(w, 24 * 60));
    expect(long.result.minutes).toBe(REST.maxMinutes.bed);
    // Two hours left: two hours of rest.
    let x = produce(founder('healthtech'), (y) => {
      const p = y.players[F]!;
      p.hours.used = p.hours.available - 2;
      p.energy = 0;
    });
    x = rest(x, 'start', 'bed').world;
    const short = rest(x, 'stop', undefined, T0 + ms(x, 6 * 60));
    expect(short.result.minutes).toBe(120);
    expect(short.world.players[F]!.hours.used).toBe(short.world.players[F]!.hours.available);
  });

  it('sitting somewhere else settles the rest before it; replaying gives the same world', () => {
    let w = founder('healthtech');
    w = rest(w, 'start', 'seat').world;
    const a = rest(w, 'start', 'bed', T0 + ms(w, 30));
    expect(a.result.ended.minutes).toBe(30);
    expect(a.world.players[F]!.rest!.spot).toBe('bed');
    const b = rest(w, 'start', 'bed', T0 + ms(w, 30));
    expect(b.world).toEqual(a.world);
  });

  it('is an unknown command before the gameplay note', () => {
    const w = founder('healthtech', false);
    const r = tryRun(w, F, { type: 'home.rest', action: 'start', spot: 'seat' });
    expect(r.ok).toBe(false);
    expect(playerView(w, F)!.me.rest).toBeNull();
  });
});

describe('#12 hand a deal to a salesperson', () => {
  const withSales = (w: World) =>
    produce(w, (x) => {
      const c = companyOf(x, F);
      c.staff.push({
        id: 'st_sales_0',
        name: 'Tunde Bello',
        role: 'sales',
        seniority: 'mid',
        salary: 50_000,
        equityBps: 0,
        morale: 70,
        skill: 0.7,
        personality: 'steady',
        hiredMonth: x.markets.london!.month,
      } as Staff);
    });

  it('hands an open deal over and takes it back', () => {
    let w = withSales(founder('healthtech'));
    w = run(w, F, { type: 'sales.prospect' }).world;
    const id = companyOf(w, F).deals![0]!.id;
    w = run(w, F, { type: 'sales.assign', dealId: id, staffId: 'st_sales_0' }).world;
    expect(companyOf(w, F).deals![0]!.owner).toBe('st_sales_0');
    w = run(w, F, { type: 'sales.assign', dealId: id }).world;
    expect(companyOf(w, F).deals![0]!.owner).toBeUndefined();
    // Only someone on the sales team.
    expect(tryRun(w, F, { type: 'sales.assign', dealId: id, staffId: 'nobody' }).ok).toBe(false);
  });

  it('is an unknown command before the gameplay note', () => {
    let w = withSales(founder('healthtech', false));
    w = run(w, F, { type: 'sales.prospect' }).world;
    const id = companyOf(w, F).deals![0]!.id;
    expect(tryRun(w, F, { type: 'sales.assign', dealId: id, staffId: 'st_sales_0' }).ok).toBe(
      false,
    );
  });
});
