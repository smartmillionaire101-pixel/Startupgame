import { describe, expect, it } from 'vitest';
import { dispatch } from '../src/dispatch.js';
import { addFounder, addInvestor, DAY, makeWorld, settle, T0 } from './helpers.js';

/**
 * A settlement runs on a private copy of the world rather than an Immer draft
 * (see WHOLE_WORLD in dispatch.ts). It must still behave like any command:
 * the world it was given is untouched, the new one is frozen, and a refused
 * settlement changes nothing.
 */
describe('settlement on a private copy', () => {
  const base = () => addInvestor(addFounder(makeWorld(7, ['lagos'])));

  it('leaves the given world as it was and returns a frozen one', () => {
    const w = base();
    const before = JSON.stringify(w);
    const r = dispatch(
      w,
      { type: 'market.settle', market: 'lagos', at: T0 + DAY },
      {
        actorId: null,
        now: T0 + DAY,
      },
    );
    expect(r.ok).toBe(true);
    expect(JSON.stringify(w)).toBe(before);
    expect(r.world.version).toBe(w.version + 1);
    expect(r.world.markets.lagos!.month).toBe(w.markets.lagos!.month + 1);
    const p = r.world.players.u_founder!;
    expect(Object.isFrozen(r.world)).toBe(true);
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.stars)).toBe(true);
    expect(Object.isFrozen(r.world.accounts[p.accounts.local])).toBe(true);
  });

  it('also works on an unfrozen world (as loaded from a snapshot), without changing it', () => {
    const w = JSON.parse(JSON.stringify(base()));
    const before = JSON.stringify(w);
    const a = settle(w, 'lagos', 2);
    const b = settle(base(), 'lagos', 2);
    expect(JSON.stringify(w)).toBe(before);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a refused settlement returns the same world', () => {
    const w = settle(base(), 'lagos', 1);
    const at = w.markets.lagos!.settledAt!;
    const r = dispatch(
      w,
      { type: 'market.settle', market: 'lagos', at },
      { actorId: null, now: at },
    );
    expect(r.ok).toBe(false);
    expect(r.world).toBe(w);
  });
});
