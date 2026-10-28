/**
 * A booked flight waits for you (play-test: flights follow the game clock, and
 * a game hour is about two real minutes, so the departure can pass while you
 * ride to the airport and check in). The engine keeps no departure time: a
 * ticket you hold is honoured whenever you board, out and home, with no extra
 * charge and nothing rebooked.
 */
import { describe, expect, it } from 'vitest';
import { addFounder, DAY, makeWorld, moneyByCurrency, run, T0 } from './helpers.js';
import { flightFare } from '../src/travel.js';
import { FEEDBACK_NOTE } from '../src/releases.js';
import type { World } from '../src/types.js';

function world(): World {
  let w = addFounder(makeWorld(), 'host', 'lagos');
  w = run(w, null, { type: 'system.announce', id: FEEDBACK_NOTE, text: 'Update.' }).world;
  w = structuredClone(w);
  const p = w.players.host!;
  const local = w.accounts[p.accounts.local]!;
  local.balance = Math.max(local.balance, 40 * flightFare(w, p, 'london'));
  return w;
}
const local = (w: World) => w.accounts[w.players.host!.accounts.local]!;

describe('a held ticket waits for you', () => {
  it('boards hours after its departure time: no extra charge, ledger unchanged', () => {
    let w = world();
    const flight = { airline: 'Runway Air', number: 'RW 101', time: '08:05', gate: 'A3' };
    w = run(w, 'host', { type: 'travel.book', to: 'london', flight }, T0).world;
    const ticket = structuredClone(w.players.host!.flightTicket!);
    const balance = local(w).balance;
    const lines = local(w).recent.length;
    const supply = moneyByCurrency(w);
    // Long past the 08:05 departure (and the same game day long gone).
    const late = T0 + DAY / 2;
    const r = run(w, 'host', { type: 'travel.fly', to: 'london' }, late);
    w = r.world;
    expect(r.result.cost).toBe(ticket.paid);
    expect(w.players.host!.flightTicket).toBeUndefined();
    expect(w.players.host!.location?.market).toBe('london');
    expect(local(w).balance).toBe(balance);
    expect(local(w).recent.length).toBe(lines);
    expect(moneyByCurrency(w)).toEqual(supply);
  });

  it('the way home on a return ticket boards late too, already paid', () => {
    let w = world();
    w = run(w, 'host', { type: 'travel.book', to: 'london', returnCabin: 'economy' }, T0).world;
    w = run(w, 'host', { type: 'travel.fly', to: 'london' }, T0).world;
    const held = w.players.host!.location!.returnLeg!;
    const balance = local(w).balance;
    const lines = local(w).recent.length;
    w = run(
      w,
      'host',
      { type: 'travel.book', to: 'lagos', flight: { number: 'RW 202', time: '09:10' } },
      T0 + DAY,
    ).world;
    expect(w.players.host!.flightTicket).toMatchObject({ prepaid: true, paid: held.paid });
    const r = run(w, 'host', { type: 'travel.fly', to: 'lagos' }, T0 + DAY + DAY / 3);
    w = r.world;
    expect(r.result.cost).toBe(held.paid);
    expect(w.players.host!.location).toBeUndefined();
    expect(local(w).balance).toBe(balance);
    expect(local(w).recent.length).toBe(lines);
  });

  it('is replayed the same way', () => {
    const play = () => {
      let w = world();
      w = run(w, 'host', { type: 'travel.book', to: 'london' }, T0).world;
      return run(w, 'host', { type: 'travel.fly', to: 'london' }, T0 + DAY).world;
    };
    expect(play()).toEqual(play());
  });
});
