import { describe, expect, it } from 'vitest';
import { fullyDiluted, sharesOf } from '../src/captable.js';
import { ENDGAME_NOTE } from '../src/releases.js';
import type { DealCard, World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  companyOf,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  tryRun,
} from './helpers.js';

const F = 'u_f';
const A = 'u_a'; // the early angel, with pro-rata rights
const B = 'u_b'; // leads the next round

function rich(w: World, ...ids: string[]): World {
  const x = structuredClone(w);
  for (const id of ids) {
    x.accounts[x.players[id]!.accounts.local]!.balance += 500_000_000_00;
    x.accounts['ext:lagos:genesis']!.balance -= 500_000_000_00;
  }
  return x;
}

/** One priced round from `investor`, accepted by the founder. */
function round(w: World, investor: string, amount: number, valuation: number, proRata: boolean) {
  const c = companyOf(w, F);
  const p = run(w, investor, {
    type: 'invest.propose',
    companyId: c.id,
    instrument: 'priced',
    amount,
    valuation,
    proRata,
    boardSeat: false,
    vetoOnSale: false,
  });
  return run(p.world, F, { type: 'deal.act', dealId: p.result.dealId, action: 'accept' }).world;
}

const followOns = (w: World, holder: string): DealCard[] =>
  Object.values(w.deals).filter(
    (d) =>
      d.status === 'open' &&
      d.counterparty.id === holder &&
      d.terms.kind === 'investment' &&
      !!d.terms.followOn,
  );

function world(note = true): World {
  let w = addInvestor(addInvestor(addFounder(makeWorld(51, ['lagos']), F), A), B);
  if (note) w = run(w, null, { type: 'system.announce', id: ENDGAME_NOTE, text: 'Endgame.' }).world;
  return rich(w, A, B);
}

describe('pro-rata follow-ons (Phase 8)', () => {
  it('after a new priced round, a holder with pro-rata rights is offered their share at its price', () => {
    let w = round(world(), A, 20_000_000_00, 200_000_000_00, true);
    const c0 = companyOf(w, F);
    expect(c0.capTable.proRata).toEqual([A]);
    const stake = sharesOf(c0.capTable, A) / fullyDiluted(c0.capTable);

    w = round(w, B, 100_000_000_00, 600_000_000_00, false);
    const c1 = companyOf(w, F);
    const [offer] = followOns(w, A);
    expect(offer).toBeDefined();
    const t = offer!.terms as Extract<DealCard['terms'], { kind: 'investment' }>;
    expect(offer!.proposer).toEqual({ kind: 'company', id: c1.id });
    expect(t.amount).toBe(Math.round(stake * 100_000_000_00));
    expect(t.followOn).toEqual({
      price: c1.capTable.lastPrice,
      round: c1.capTable.roundsRaised,
      stakeBps: Math.round(stake * 10_000),
    });
    expect(offer!.summary).toMatch(/^Keep your .* pro-rata right/);
    // The round's lead has no rights recorded, so is offered nothing.
    expect(followOns(w, B)).toHaveLength(0);

    // Take it or leave it: no counters.
    expect(
      tryRun(w, A, {
        type: 'deal.act',
        dealId: offer!.id,
        action: 'counter',
        terms: { amount: 1_000_00 },
      }).ok,
    ).toBe(false);

    const before = sharesOf(c1.capTable, A);
    const rounds = c1.capTable.roundsRaised;
    const post = c1.capTable.lastPostMoney;
    const cash = w.accounts[c1.account]!.balance;
    w = run(w, A, { type: 'deal.act', dealId: offer!.id, action: 'accept' }).world;
    const c2 = companyOf(w, F);
    const bought = sharesOf(c2.capTable, A) - before;
    // New shares at the round's price, in the same round and preference tier.
    expect(Math.abs(bought * c1.capTable.lastPrice - t.amount)).toBeLessThan(c1.capTable.lastPrice);
    expect(c2.capTable.lastPrice).toBe(c1.capTable.lastPrice);
    expect(c2.capTable.roundsRaised).toBe(rounds);
    expect(c2.capTable.lastPostMoney).toBe(post + t.amount);
    expect(c2.capTable.preferences.at(-1)).toMatchObject({
      holderId: A,
      invested: t.amount,
      seniority: rounds,
    });
    expect(w.accounts[c2.account]!.balance - cash).toBe(t.amount);
    expect(w.positions[`${A}:${c2.id}`]!.invested).toBe(20_000_000_00 + t.amount);
    expect(w.players[A]!.milestones['investor.first-follow-on']).toBeDefined();
    // The company's round history is unchanged by a follow-on.
    expect(c2.lastRound).toBe(c1.lastRound);
    // Money is conserved and nothing internal goes negative.
    expect(Object.values(moneyByCurrency(w)).every((v) => v === 0)).toBe(true);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });

  it('a follow-on lapses once another round closes', () => {
    let w = round(world(), A, 20_000_000_00, 200_000_000_00, true);
    w = round(w, B, 100_000_000_00, 600_000_000_00, false);
    const [first] = followOns(w, A);
    w = round(w, B, 100_000_000_00, 1_500_000_000_00, false);
    const r = tryRun(w, A, { type: 'deal.act', dealId: first!.id, action: 'accept' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('deal.stale');
    // The newer round brought its own offer.
    expect(followOns(w, A).length).toBe(2);
  });

  it('declining changes no money', () => {
    let w = round(world(), A, 20_000_000_00, 200_000_000_00, true);
    w = round(w, B, 100_000_000_00, 600_000_000_00, false);
    const [offer] = followOns(w, A);
    const bal = (x: World) => Object.values(x.accounts).map((a) => a.balance);
    const next = run(w, A, { type: 'deal.act', dealId: offer!.id, action: 'decline' }).world;
    expect(bal(next)).toEqual(bal(w));
    expect(next.deals[offer!.id]!.status).toBe('declined');
  });

  it('before the endgame release nothing is recorded or offered (old logs replay the same)', () => {
    let w = round(world(false), A, 20_000_000_00, 200_000_000_00, true);
    w = round(w, B, 100_000_000_00, 600_000_000_00, false);
    expect(companyOf(w, F).capTable.proRata).toBeUndefined();
    expect(followOns(w, A)).toHaveLength(0);
  });
});

describe('the endgame release note', () => {
  it('records pro-rata rights agreed before it, and a later round then offers a follow-on', () => {
    let w = round(world(false), A, 20_000_000_00, 200_000_000_00, true);
    expect(companyOf(w, F).capTable.proRata).toBeUndefined();
    w = run(w, null, { type: 'system.announce', id: ENDGAME_NOTE, text: 'Endgame.' }).world;
    expect(companyOf(w, F).capTable.proRata).toEqual([A]);
    w = round(w, B, 100_000_000_00, 600_000_000_00, false);
    expect(followOns(w, A)).toHaveLength(1);
  });

  it('opens the stock market in a new world that only ever logs the newest note', () => {
    const w = run(makeWorld(51, ['lagos']), null, {
      type: 'system.announce',
      id: ENDGAME_NOTE,
      text: 'Endgame.',
    }).world;
    const listed = Object.values(w.companies).filter((c) => c.ipo?.status === 'listed');
    expect(listed.length).toBeGreaterThan(0);
  });
});
