import { describe, expect, it } from 'vitest';
import { recapView } from '../src/recap.js';
import { ENDGAME_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  DAY,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  T0,
  tryRun,
} from './helpers.js';

/**
 * Phase 9 (§13, §14.1): long sessions. Two years of play in two cities with
 * every release switched on: money is conserved and nothing is overdrawn
 * after every settlement, every human's view and recap still build, a save
 * (JSON round trip) plays on exactly like the original, and a settlement
 * for a period already settled is refused (scheduled work runs once).
 */
const HUMANS = ['u_a', 'u_b', 'u_c', 'u_investor'];

function start(): World {
  let w = makeWorld(7, ['lagos', 'nairobi']);
  w = run(w, null, { type: 'system.announce', id: ENDGAME_NOTE, text: 'Endgame.' }).world;
  w = addFounder(w, 'u_a', 'lagos', 'Paylink');
  w = addFounder(w, 'u_b', 'lagos', 'Stockroom');
  w = addFounder(w, 'u_c', 'nairobi', 'Matatu Pay');
  w = addInvestor(w);
  w = run(w, 'u_a', { type: 'journey.ambition', id: 'profitable' }).world;
  w = run(w, 'u_investor', { type: 'journey.ambition', id: 'angel' }).world;
  return w;
}

/** One month: a few player actions, then both cities settle. */
function month(w: World, i: number): World {
  const now = T0 + (i + 1) * DAY;
  for (const id of ['u_a', 'u_b', 'u_c']) {
    // Something every month, valid or not: the world must stay sound either way.
    const r = tryRun(w, id, { type: 'inbox.read', ids: [] }, now);
    if (r.ok) w = r.world;
  }
  for (const market of ['lagos', 'nairobi'] as const) {
    const at = (w.markets[market]!.settledAt ?? T0) + DAY;
    w = run(w, null, { type: 'market.settle', market, at }, now).world;
  }
  return w;
}

function check(w: World) {
  for (const v of Object.values(moneyByCurrency(w))) expect(v).toBe(0);
  expect(negativeInternalAccounts(w)).toEqual([]);
  for (const id of HUMANS) {
    expect(playerView(w, id)).not.toBeNull();
    expect(recapView(w, id)).not.toBeNull();
  }
}

describe('long sessions (Phase 9)', () => {
  it(
    'two years of play stay sound, and a saved game plays on the same',
    { timeout: 120_000 },
    () => {
      let w = start();
      for (let i = 0; i < 12; i++) {
        w = month(w, i);
        check(w);
      }
      // Save and load: the world as JSON, as the server stores it.
      let loaded = JSON.parse(JSON.stringify(w)) as World;
      for (let i = 12; i < 24; i++) {
        w = month(w, i);
        loaded = month(loaded, i);
        check(w);
      }
      expect(JSON.stringify(loaded)).toBe(JSON.stringify(w));
      expect(w.markets.lagos!.month).toBeGreaterThanOrEqual(24);
    },
  );

  it('a settlement for a period already settled is refused and changes nothing', () => {
    const w = month(start(), 0);
    const at = w.markets.lagos!.settledAt!;
    const r = tryRun(w, null, { type: 'market.settle', market: 'lagos', at }, T0 + 2 * DAY);
    expect(r.ok).toBe(false);
    expect(r.world).toBe(w);
  });
});
