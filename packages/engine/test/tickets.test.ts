import { describe, expect, it } from 'vitest';
import { playerView } from '../src/views.js';
import { cancelFee, BOARDING_GRACE_MS } from '../src/tickets.js';
import { MAX_FLIGHTS_PER_MONTH } from '../src/travel.js';
import type { World } from '../src/types.js';
import { addFounder, addInvestor, makeWorld, moneyByCurrency, run, T0, tryRun } from './helpers.js';

const savings = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;
const H = 3_600_000;
const clock = (now: number) => ({ now, monthMs: 86_400_000 });

describe('fares charged when booked (Wave 12 §D)', () => {
  it('charges at booking, boards without charging again', () => {
    let w = addFounder(makeWorld(3, ['lagos', 'london']));
    const total = moneyByCurrency(w);
    const fare = playerView(w, 'u_founder')!.flights.fareTo.london!;
    const before = savings(w, 'u_founder');
    const r = run(
      w,
      'u_founder',
      { type: 'travel.book', to: 'london', departAt: T0 + 3 * H, flight: 'EK 123', time: '15:00' },
      T0,
    );
    w = r.world;
    expect(r.result.charged).toBe(fare);
    expect(savings(w, 'u_founder')).toBe(before - fare);
    expect(moneyByCurrency(w)).toEqual(total);
    const v = playerView(w, 'u_founder', clock(T0 + H))!;
    expect(v.ticket).toMatchObject({
      from: 'lagos',
      to: 'london',
      toName: 'London',
      fare,
      flight: 'EK 123',
      status: 'valid',
      departAt: T0 + 3 * H,
    });
    // Still in Lagos until you board.
    expect(w.players.u_founder!.location).toBeUndefined();
    // A second booking needs the first cancelled.
    const again = tryRun(w, 'u_founder', { type: 'travel.book', to: 'london' }, T0 + H);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('travel.ticket');

    const b = run(w, 'u_founder', { type: 'travel.board' }, T0 + 2 * H);
    w = b.world;
    expect(b.result.cost).toBe(0);
    expect(b.result.ticketUsed).toBe(true);
    expect(savings(w, 'u_founder')).toBe(before - fare);
    expect(w.players.u_founder!.location?.market).toBe('london');
    expect(w.players.u_founder!.ticket).toBeUndefined();
    expect(w.players.u_founder!.flights?.count).toBe(1);
    expect(playerView(w, 'u_founder', clock(T0 + 2 * H))!.ticket).toBeNull();
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('boards on the ticket when travel.fly goes where the ticket goes', () => {
    let w = addFounder(makeWorld(3, ['lagos', 'london']));
    w = run(w, 'u_founder', { type: 'travel.book', to: 'london' }, T0).world;
    const after = savings(w, 'u_founder');
    const r = run(w, 'u_founder', { type: 'travel.fly', to: 'london' }, T0 + H);
    expect(r.result.cost).toBe(0);
    expect(savings(r.world, 'u_founder')).toBe(after);
    expect(r.world.players.u_founder!.location?.market).toBe('london');
  });

  it('refunds the fare minus a small fee before departure', () => {
    let w = addFounder(makeWorld(3, ['lagos', 'london']));
    const total = moneyByCurrency(w);
    const before = savings(w, 'u_founder');
    w = run(w, 'u_founder', { type: 'travel.book', to: 'london', departAt: T0 + 5 * H }, T0).world;
    const fare = w.players.u_founder!.ticket!.fare;
    const fee = cancelFee(fare);
    expect(fee).toBeGreaterThan(0);
    expect(fee).toBeLessThan(fare / 5);
    expect(playerView(w, 'u_founder', clock(T0))!.ticket!.refund).toBe(fare - fee);
    const r = run(w, 'u_founder', { type: 'travel.cancel' }, T0 + 4 * H);
    w = r.world;
    expect(r.result.refund).toBe(fare - fee);
    expect(savings(w, 'u_founder')).toBe(before - fee);
    expect(w.players.u_founder!.ticket).toBeUndefined();
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('expires after departure: a missed flight keeps the fare', () => {
    const w = run(
      addFounder(makeWorld(3, ['lagos', 'london'])),
      'u_founder',
      { type: 'travel.book', to: 'london', departAt: T0 + H },
      T0,
    ).world;
    const fare = w.players.u_founder!.ticket!.fare;
    const late = T0 + H + BOARDING_GRACE_MS + 1;
    expect(playerView(w, 'u_founder', clock(late))!.ticket?.status).toBe('missed');
    expect(playerView(w, 'u_founder', clock(late))!.ticket?.refund).toBe(0);
    const board = tryRun(w, 'u_founder', { type: 'travel.board' }, late);
    expect(board.ok).toBe(false);
    if (!board.ok) expect(board.error.code).toBe('travel.missed');
    expect(tryRun(w, 'u_founder', { type: 'travel.cancel' }, late).ok).toBe(false);
    // Fly now still works, and charges at the gate (the old ticket is no use).
    const r = run(w, 'u_founder', { type: 'travel.fly', to: 'london' }, late);
    expect(r.result.cost).toBe(fare);
    // A new booking replaces the missed ticket.
    const again = run(w, 'u_founder', { type: 'travel.book', to: 'london' }, late);
    expect(again.world.players.u_founder!.ticket!.bookedAt).toBe(late);
  });

  it('rejects departures in the past or too far ahead, and bookings you can’t pay', () => {
    const w = addFounder(makeWorld(3, ['lagos', 'london']));
    for (const departAt of [T0 - H, T0 + 48 * H]) {
      const r = tryRun(w, 'u_founder', { type: 'travel.book', to: 'london', departAt }, T0);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('travel.departure');
    }
    expect(tryRun(w, 'u_founder', { type: 'travel.book', to: 'lagos' }, T0).ok).toBe(false);
    const broke = structuredClone(w) as World;
    const acc = broke.players.u_founder!.accounts.local;
    broke.accounts[broke.markets.lagos!.ext.genesis]!.balance += broke.accounts[acc]!.balance;
    broke.accounts[acc]!.balance = 0;
    const r = tryRun(broke, 'u_founder', { type: 'travel.book', to: 'london' }, T0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('travel.funds');
  });

  it('a ticket from elsewhere can’t be boarded here; flight limits hold', () => {
    let w = addInvestor(makeWorld(3, ['lagos', 'london', 'nairobi']), 'u_inv');
    w = run(w, 'u_inv', { type: 'travel.book', to: 'nairobi' }, T0).world;
    // Fly now to London without the ticket: charged at the gate.
    w = run(w, 'u_inv', { type: 'travel.fly', to: 'london' }, T0 + 1).world;
    const r = tryRun(w, 'u_inv', { type: 'travel.board' }, T0 + 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('travel.ticket.from');
    // It can still be cancelled for the refund.
    w = run(w, 'u_inv', { type: 'travel.cancel' }, T0 + 3).world;
    for (let i = 1; i < MAX_FLIGHTS_PER_MONTH; i++)
      w = run(
        w,
        'u_inv',
        { type: 'travel.fly', to: i % 2 ? 'lagos' : 'london' },
        T0 + 10 + i,
      ).world;
    const x = tryRun(w, 'u_inv', { type: 'travel.book', to: 'nairobi' }, T0 + 100);
    expect(x.ok).toBe(false);
    if (!x.ok) expect(x.error.code).toBe('travel.flights');
  });
});
