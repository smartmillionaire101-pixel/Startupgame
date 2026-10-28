/**
 * Play-test fixes for bankers and investors (feedback round, FEEDBACK_NOTE):
 * the licence is decided on the capital the checklist showed, the recap
 * says what the regulator decided, the interview's result, the owner's own
 * bank, first clients and loan requests after the licence, a new angel's
 * career and journey, and a SAFE's stake and fee.
 */
import { describe, expect, it } from 'vitest';
import { OPENING_MONTHS, bankFigures } from '../src/banks.js';
import { LOAN_REQUESTS } from '../src/bankwork.js';
import { PLACE_SPECS } from '../src/data/places.js';
import { MONTH_MIN, gameMinute } from '../src/places.js';
import { recapView } from '../src/recap.js';
import { BANKERS_NOTE, FEEDBACK_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { Bank, World } from '../src/types.js';
import { DAY, T0, makeWorld, moneyByCurrency, run, settle } from './helpers.js';

const B = 'u_banker';
const MS_PER_MIN = DAY / MONTH_MIN;
const announce = (w: World, id: string) =>
  run(w, null, { type: 'system.announce', id, text: id }).world;
const bankOf = (w: World): Bank => Object.values(w.banks).find((b) => b.ownerId === B)!;

/** A feedback-round banker with a signed microfinance bank. */
function signedBanker(seed = 11, feedback = true): World {
  let w = announce(makeWorld(seed, ['lagos']), BANKERS_NOTE);
  if (feedback) w = announce(w, FEEDBACK_NOTE);
  w = run(w, B, {
    type: 'player.quickStart',
    username: 'h_banker',
    name: 'Bea Banker',
    role: 'banker',
    backgroundId: 'b-commercial',
    market: 'lagos',
  }).world;
  const balance = w.accounts[w.players[B]!.accounts.local]!.balance;
  w = run(w, B, {
    type: 'bank.found',
    name: 'Harbour Trust',
    bankType: 'microfinance',
    contribution: Math.floor(balance * 0.25),
  }).world;
  const b = bankOf(w);
  w = run(w, B, { type: 'bank.terms', bankId: b.id, chosen: ['g1', 'g2'] }).world;
  return run(w, B, { type: 'bank.sign', bankId: b.id }).world;
}

/** The Central Bank interview at the booked slot. */
function interview(w: World, answers = [1, 0, 2, 1]) {
  const b = bankOf(w);
  const booked = run(w, B, { type: 'place.book', placeId: 'lagos:central-bank' });
  const slot = booked.result.appointment.at as number;
  const when = T0 + (slot + 10 - gameMinute(w.markets.lagos!, T0)) * MS_PER_MIN;
  return run(booked.world, B, { type: 'bank.interview', bankId: b.id, answers }, when);
}

/** The rest of the checklist with the best picks. */
function checklist(w: World): World {
  const b = bankOf(w);
  const v = playerView(w, B)!.banker!.bank!.licence!;
  w = run(w, B, { type: 'bank.plan', bankId: b.id, ...v.suggestedPlan }).world;
  for (const role of ['ceo', 'cro', 'compliance', 'aml'] as const) {
    const pick = [...v.candidates[role].filter((c) => c.id !== 'self')].sort(
      (x, y) => y.quality - x.quality,
    )[0]!;
    w = run(w, B, { type: 'bank.hire', bankId: b.id, role, candidateId: pick.id }).world;
  }
  return run(w, B, {
    type: 'bank.setup',
    bankId: b.id,
    system: 'premium',
    district: v.districts[0]!.id,
  }).world;
}

/** Move money so the bank's capital is exactly `equity` (the rest to an outside account). */
function setCapital(w: World, equity: number): World {
  const t = structuredClone(w);
  const b = bankOf(t);
  const acc = t.accounts[b.account]!;
  const delta = bankFigures(t, b).equity - equity;
  acc.balance -= delta;
  t.accounts[t.markets.lagos!.ext.lps]!.balance += delta;
  return t;
}

describe('play-test #1: the licence is decided on the capital the checklist shows', () => {
  it('a bank just above the minimum is licensed: month costs are paid after the decision', () => {
    let w = interview(signedBanker()).world;
    w = checklist(w);
    const cap = playerView(w, B)!.banker!.bank!.licence!.capital;
    expect(cap.costs).toBeGreaterThan(0);
    // Above the minimum now, below it once this month's salaries and rent are paid.
    w = setCapital(w, cap.need + Math.round(cap.costs / 2));
    expect(playerView(w, B)!.banker!.bank!.licence!.capital.short).toBe(0);
    const total = moneyByCurrency(w);
    w = settle(w, 'lagos', 1);
    expect(bankOf(w).licence!.decision!.outcome).not.toBe('refused');
    expect(bankOf(w).status).toBe('licensed');
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('the checklist warns when capital is short, and the recap says the licence was refused and why', () => {
    let w = interview(signedBanker()).world;
    w = checklist(w);
    const cap = playerView(w, B)!.banker!.bank!.licence!.capital;
    w = setCapital(w, cap.need - 1000);
    expect(playerView(w, B)!.banker!.bank!.licence!.capital.short).toBe(1000);
    w = settle(w, 'lagos', 1);
    expect(bankOf(w).licence!.decision!.outcome).toBe('refused');
    const recap = recapView(w, B)!;
    const bank = recap.banks.find((x) => x.id === bankOf(w).id)!;
    expect(bank.decision).toMatchObject({ outcome: 'refused' });
    expect(bank.decision!.reasons).toContain('capital');
    expect(recap.risks).toContainEqual(
      expect.objectContaining({ kind: 'licence', bank: 'Harbour Trust' }),
    );
    // The bank's own money is in the recap too.
    expect(recap.business.some((a) => a.account === bankOf(w).id)).toBe(true);
  });

  it('before the feedback round the costs still come first (old worlds play as before)', () => {
    let w = interview(signedBanker(11, false)).world;
    w = checklist(w);
    const cap = playerView(w, B)!.banker!.bank!.licence!.capital;
    w = setCapital(w, cap.need + Math.round(cap.costs / 2));
    w = settle(w, 'lagos', 2);
    expect(bankOf(w).licence!.decision!.outcome).toBe('refused');
  });
});

describe('play-test #34: the Central Bank says it grants bank licences', () => {
  it('names bank licences and the interview, then payments and fund manager licences', () => {
    const purpose = PLACE_SPECS['central-bank'].purpose;
    expect(purpose).toMatch(/bank licences/);
    expect(purpose).toMatch(/fit-and-proper/);
    expect(purpose).toMatch(/payments licences/);
  });
});

/** A licensed feedback-round bank whose founder has few stars (a run without the opening). */
function licensed(feedback = true): World {
  let w = interview(signedBanker(11, feedback)).world;
  w = checklist(w);
  w = settle(w, 'lagos', feedback ? 1 : 2);
  expect(bankOf(w).status).toBe('licensed');
  // A banker with a poor rating: the bank starts on 1.2 stars.
  const t = structuredClone(w);
  const s = bankOf(t).stars;
  s.value = s.anchor = 1.2;
  return t;
}

const requestsTo = (w: World) =>
  Object.values(w.deals).filter(
    (d) =>
      d.status === 'open' &&
      d.counterparty.kind === 'playerbank' &&
      d.counterparty.id === bankOf(w).id &&
      d.proposer.kind === 'company',
  );

describe('play-test #16: a newly licensed bank gets customers and loan requests', () => {
  it('households open accounts in its opening months, however few stars it starts with', () => {
    let w = licensed();
    w = settle(w, 'lagos', 1, T0 + DAY);
    const b = bankOf(w);
    expect(b.retail.customers).toBeGreaterThan(0);
    expect(b.retail.deposits).toBeGreaterThan(0);
    expect(b.licensedMonth! + OPENING_MONTHS).toBeGreaterThan(w.markets.lagos!.month);
  });

  it('the city’s startups ask to borrow; accepting one is the bank’s first loan', () => {
    let w = licensed();
    // The month it's licensed, the first request is already on the desk.
    const first = requestsTo(w);
    expect(first.length).toBe(1);
    w = settle(w, 'lagos', 1, T0 + DAY);
    const reqs = requestsTo(w);
    expect(reqs.length).toBe(LOAN_REQUESTS.open);
    const d = reqs[0]!;
    expect(d.terms.kind).toBe('loan');
    const c = w.companies[d.proposer.id]!;
    expect(c.ai).toBe(true);
    const total = moneyByCurrency(w);
    const before = w.accounts[c.account]!.balance;
    w = run(w, B, { type: 'deal.act', dealId: d.id, action: 'accept' }, T0 + DAY).world;
    expect(w.deals[d.id]!.status).toBe('accepted');
    expect(w.accounts[c.account]!.balance - before).toBe((d.terms as { amount: number }).amount);
    expect(w.companies[c.id]!.finance.loans.some((l) => l.lenderBankId === bankOf(w).id)).toBe(
      true,
    );
    expect(w.players[B]!.milestones['banker.first-loan']).toBeDefined();
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('a counter for less is taken by the AI borrower', () => {
    let w = licensed();
    const d = requestsTo(w)[0]!;
    const amount = (d.terms as { amount: number }).amount;
    const half = Math.floor(amount / 2);
    w = run(w, B, {
      type: 'deal.act',
      dealId: d.id,
      action: 'counter',
      terms: { amount: half },
    }).world;
    expect(w.deals[d.id]!.status).toBe('accepted');
  });

  it('before the feedback round nothing changes: no requests, and a low-star bank still has no households', () => {
    let w = licensed(false);
    expect(requestsTo(w)).toEqual([]);
    w = settle(w, 'lagos', 1, T0 + DAY);
    expect(requestsTo(w)).toEqual([]);
    expect(bankOf(w).retail.customers).toBe(0);
  });
});
