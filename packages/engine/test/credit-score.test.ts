import { describe, expect, it } from 'vitest';
import { creditProfile, STANDARD_CREDIT_SCORE } from '../src/credit.js';
import { INVESTOR_NOTE } from '../src/releases.js';
import type { World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  careerWorld,
  DAY,
  makeWorld,
  moneyByCurrency,
  run,
  settle,
  T0,
} from './helpers.js';

/** Move a player's savings out, so nothing (living costs, repayments) can be paid. */
function broke(world: World, id = 'u_founder'): World {
  const w = structuredClone(world);
  const acc = w.accounts[w.players[id]!.accounts.local]!;
  w.accounts['ext:lagos:lifestyle']!.balance += acc.balance;
  acc.balance = 0;
  return w;
}

const score = (w: World, id = 'u_founder') => creditProfile(w, w.players[id]!).score;

function borrow(world: World, amount = 100_000_00, months = 12): World {
  const req = run(world, 'u_founder', { type: 'player.loan', amount, months });
  return run(req.world, 'u_founder', {
    type: 'deal.act',
    dealId: req.result.dealId,
    action: 'accept',
  }).world;
}

const announce = (w: World) =>
  run(w, null, { type: 'system.announce', id: INVESTOR_NOTE, text: 'Investor career.' }).world;

describe('credit score: a standard start, moved only by real credit events', () => {
  it('before the note, unpaid living costs still count as missed payments (old logs replay)', () => {
    // The player feedback: no debt at all, yet a year of "missed payments" and a ruined score.
    let w = broke(addFounder(makeWorld(31, ['lagos'])));
    w = settle(w, 'lagos', 12, T0 + DAY);
    const p = w.players.u_founder!;
    expect(p.loans).toHaveLength(0);
    expect(p.credit.missedPayments).toBe(12);
    expect(score(w)).toBeLessThan(20);
  });

  it('everyone starts at the standard score, rich or poor, founder or investor', () => {
    let w = addInvestor(addFounder(careerWorld(31, ['lagos'])));
    expect(score(w)).toBe(STANDARD_CREDIT_SCORE);
    expect(score(w, 'u_investor')).toBe(STANDARD_CREDIT_SCORE);
    expect(creditProfile(w, w.players.u_founder!).band).toBe('fair');
    w = broke(w);
    expect(score(w)).toBe(STANDARD_CREDIT_SCORE);
  });

  it('no debt means no missed payments, however broke the player gets', () => {
    let w = broke(addFounder(careerWorld(31, ['lagos'])));
    w = settle(w, 'lagos', 12, T0 + DAY);
    const p = w.players.u_founder!;
    expect(p.loans).toHaveLength(0);
    const profile = creditProfile(w, p);
    expect(profile.missedPayments).toBe(0);
    expect(profile.defaults).toBe(0);
    expect(profile.score).toBe(STANDARD_CREDIT_SCORE);
  });

  it('on-time loan repayments raise it slowly', () => {
    let w = borrow(addFounder(careerWorld(32, ['lagos'])));
    w = settle(w, 'lagos', 6, T0 + DAY);
    const p = w.players.u_founder!;
    expect(p.credit.onTimePayments).toBe(6);
    expect(p.credit.missedPayments).toBe(0);
    expect(score(w)).toBeGreaterThan(STANDARD_CREDIT_SCORE);
    expect(score(w)).toBeLessThanOrEqual(STANDARD_CREDIT_SCORE + 10);
  });

  it('missed loan payments and defaults lower it', () => {
    let w = broke(borrow(addFounder(careerWorld(33, ['lagos']))));
    w = settle(w, 'lagos', 1, T0 + DAY);
    expect(w.players.u_founder!.credit.missedPayments).toBe(1);
    const missedOnce = score(w);
    expect(missedOnce).toBeLessThan(STANDARD_CREDIT_SCORE);
    w = settle(w, 'lagos', 1, T0 + 2 * DAY);
    const p = w.players.u_founder!;
    expect(p.loans).toHaveLength(0);
    expect(p.credit.defaults).toBe(1);
    expect(score(w)).toBeLessThan(missedOnce - 15);
  });

  it('a missed capital call (a default on the record) lowers it', () => {
    const w = structuredClone(addInvestor(careerWorld(34, ['lagos'])));
    w.players.u_investor!.credit.defaults += 1;
    expect(score(w, 'u_investor')).toBe(STANDARD_CREDIT_SCORE - 20);
  });

  it('the note repairs records wrongly marked with missed payments, moving no money', () => {
    let w = broke(addFounder(makeWorld(35, ['lagos'])));
    w = settle(w, 'lagos', 12, T0 + DAY);
    expect(w.players.u_founder!.credit.missedPayments).toBe(12);
    const total = moneyByCurrency(w);
    w = announce(w);
    expect(w.players.u_founder!.credit.missedPayments).toBe(0);
    expect(score(w)).toBe(STANDARD_CREDIT_SCORE);
    expect(moneyByCurrency(w)).toEqual(total);
    // Once only: announcing again changes nothing.
    expect(announce(w).players).toEqual(w.players);
  });

  it('the repair keeps misses still showing on an open loan', () => {
    let w = broke(borrow(addFounder(makeWorld(36, ['lagos']))));
    w = settle(w, 'lagos', 1, T0 + DAY);
    const before = w.players.u_founder!;
    expect(before.loans[0]!.missed).toBe(1);
    // One for the loan, one for living costs.
    expect(before.credit.missedPayments).toBe(2);
    w = announce(w);
    expect(w.players.u_founder!.credit.missedPayments).toBe(1);
    expect(score(w)).toBeLessThan(STANDARD_CREDIT_SCORE);
  });
});
