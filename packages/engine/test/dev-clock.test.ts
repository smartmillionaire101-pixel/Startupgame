/**
 * Dev tools' clock: a test world's city runs its game clock ahead
 * (`market.devClock`), up to the month's last minute; resting counts the time;
 * the shift ends when the month settles; players can't send it.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { MONTH_MIN, gameMinute } from '../src/places.js';
import { dispatch } from '../src/dispatch.js';
import type { World } from '../src/types.js';
import { T0, run } from './helpers.js';
import { F, founder } from './r7-helpers.js';

const sys = (w: World, minutes: number, now = T0) =>
  dispatch(w, { type: 'market.devClock', market: 'london', minutes }, { actorId: null, now });

describe('the dev tools clock', () => {
  it('moves the city on, never past the month, and resting counts it', () => {
    let w = produce(founder('healthtech'), (x) => {
      x.players[F]!.stress = 50;
    });
    const before = gameMinute(w.markets.london!, T0);
    w = run(w, F, { type: 'home.rest', action: 'start', spot: 'seat' }, T0).world;
    const r = sys(w, 60);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    w = r.world;
    expect(gameMinute(w.markets.london!, T0)).toBe(before + 60);
    const up = run(w, F, { type: 'home.rest', action: 'stop' }, T0);
    expect(up.result.minutes).toBe(60);
    expect(up.world.players[F]!.stress).toBe(46);
    // Capped at the month's last minute.
    const far = sys(w, 30 * 24 * 60);
    if (!far.ok) throw new Error(far.error.message);
    const m = far.world.markets.london!;
    expect(gameMinute(m, T0)).toBe(m.month * MONTH_MIN + MONTH_MIN - 1);
  });

  it('is the server’s alone', () => {
    const w = founder('healthtech');
    const r = dispatch(
      w,
      { type: 'market.devClock', market: 'london', minutes: 60 },
      { actorId: F, now: T0 },
    );
    expect(r.ok).toBe(false);
  });

  it('ends when the month settles', () => {
    const r = sys(founder('healthtech'), 120);
    if (!r.ok) throw new Error(r.error.message);
    const m = r.world.markets.london!;
    const monthMs = m.monthMs ?? 86_400_000;
    const s = dispatch(
      r.world,
      { type: 'market.settle', market: 'london', at: T0 + monthMs, monthMs },
      { actorId: null, now: T0 + monthMs },
    );
    if (!s.ok) throw new Error(s.error.message);
    expect(s.world.markets.london!.devClockMin).toBeUndefined();
  });
});
