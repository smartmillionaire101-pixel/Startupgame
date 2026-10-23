import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { settleExit } from '../src/deals.js';
import { angelRecord } from '../src/funds.js';
import { nextStage } from '../src/helpers.js';
import { valueCompany } from '../src/valuation.js';
import { playerView } from '../src/views.js';
import type { Company, World } from '../src/types.js';
import {
  addInvestor,
  careerWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
} from './helpers.js';

const L = 'u_investor';
const B = 'u_backer';

/** A lead at rung 2 (two angel deals, 2.5★) and a second investor in Lagos. */
function setup(seed = 21) {
  let w = addInvestor(careerWorld(seed));
  w = addInvestor(w, B);
  w = run(w, L, { type: 'investor.tutorial', action: 'skip' }).world;
  w = run(w, B, { type: 'investor.tutorial', action: 'skip' }).world;
  w = produce(w, (d) => {
    d.players[L]!.stars.value = 2.5;
    const ids = Object.values(d.companies)
      .filter((c) => c.market === 'lagos' && c.status === 'active' && !c.ai)
      .map((c) => c.id);
    const others = Object.values(d.companies)
      .filter((c) => c.market === 'lagos' && c.status === 'active')
      .slice(-2)
      .map((c) => c.id);
    for (const cid of [...ids, ...others].slice(0, 2))
      d.positions[`${L}:${cid}`] = {
        investorId: L,
        companyId: cid,
        invested: 1_000_00,
        returned: 0,
        month: 0,
        writtenOff: false,
      };
  });
  w = run(w, L, { type: 'player.seen' }).world;
  return w;
}

/** A healthy unlisted AI startup and terms it would take. */
function target(w: World) {
  const c = Object.values(w.companies).find(
    (x) => x.ai && x.market === 'lagos' && x.status === 'active' && !x.ipo && !x.lastRound,
  ) as Company;
  const model = valueCompany(w, c, nextStage(c.lastRound)).value;
  // Each personal cheque fits under the angel cap; the round takes up to 30% of the model.
  const cap = playerView(w, L)!.investorCareer!.ceiling.maxCheque;
  const lead = Math.min(Math.round(cap * 0.9), Math.round(model * 0.1));
  const total = lead * 2;
  return { c, model, total, lead, valuation: model + total };
}

const zero = (before: Record<string, number>, w: World) => {
  expect(moneyByCurrency(w)).toEqual(before);
  expect(negativeInternalAccounts(w)).toEqual([]);
};

describe('syndicates (Phase 3)', () => {
  it('need rung 2', () => {
    let w = addInvestor(careerWorld(21));
    w = run(w, L, { type: 'investor.tutorial', action: 'skip' }).world;
    const t = target(w);
    const r = tryRun(w, L, {
      type: 'syndicate.open',
      companyId: t.c.id,
      leadAmount: t.lead,
      target: t.total,
      carry: 0.2,
      instrument: 'safe',
      valuation: t.valuation,
      proRata: true,
      boardSeat: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('syndicate.rung');
  });

  it('pools the lead and backers, invests as one holder, and pays carry on the exit', () => {
    let w = setup();
    expect(playerView(w, L)!.syndicates!.canLead).toBe(true);
    const before = moneyByCurrency(w);
    const t = target(w);
    const o = run(w, L, {
      type: 'syndicate.open',
      companyId: t.c.id,
      leadAmount: t.lead,
      target: t.total,
      carry: 0.2,
      instrument: 'safe',
      valuation: t.valuation,
      proRata: true,
      boardSeat: false,
    });
    w = o.world;
    const id = o.result.syndicateId as string;
    // The backer heard about it (co-investor referral) and sees it open.
    expect((w.inbox[B] ?? []).some((i) => i.text.includes('leading a syndicate'))).toBe(true);
    const open = playerView(w, B)!.syndicates!.open;
    expect(open.map((s) => s.id)).toContain(id);
    const backAmount = t.total - t.lead;
    w = run(w, B, { type: 'syndicate.back', syndicateId: id, amount: backAmount }).world;
    zero(before, w);
    const r = run(w, L, { type: 'syndicate.close', syndicateId: id });
    w = r.world;
    const s = w.syndicates![id]!;
    expect(s.status).toBe('closed');
    expect(s.invested).toBe(t.total);
    expect(w.companies[t.c.id]!.capTable.safes.some((x) => x.holderId === id)).toBe(true);
    expect(w.positions[`${id}:${t.c.id}`]!.invested).toBe(t.total);
    expect(w.players[L]!.milestones['investor.first-syndicate']).toBeDefined();
    // It counts on the lead's track record.
    expect(angelRecord(w, w.players[L]!).syndicates).toBe(1);
    // Backer and lead see their stake as private wealth.
    expect(playerView(w, B)!.syndicates!.backed[0]!.yours).toBe(backAmount);
    zero(before, w);

    // An exit at three times the money.
    const proceeds = t.total * 3 * 4;
    const leadCash = w.accounts[w.players[L]!.accounts.local]!.balance;
    const backerCash = w.accounts[w.players[B]!.accounts.local]!.balance;
    const after = produce(w, (d) => {
      const c = d.companies[t.c.id]!;
      // The SAFE converts in the waterfall: model a priced holding for a clean split.
      const safe = c.capTable.safes.find((x) => x.holderId === id)!;
      c.capTable.safes = c.capTable.safes.filter((x) => x !== safe);
      const fd = Object.values(c.capTable.holdings).reduce((a, h) => a + h.shares, 0);
      c.capTable.holdings[id] = { shares: Math.round(fd / 3), kind: 'investor' };
      // Pay the external LP side enough to fund the purchase (an AI buyer).
      settleExit(d as World, c, proceeds, 'BigCo', 'acquired');
    });
    const syn = after.syndicates![id]!;
    expect(syn.proceeds).toBeGreaterThan(0);
    const backer = syn.backers[0]!;
    const backerShare = backer.returned;
    const gain = Math.max(0, backerShare - backer.amount);
    const carry = Math.round(gain * 0.2);
    expect(syn.carryPaid).toBe(carry);
    const rate = after.markets.lagos!.data.tax.capitalGains;
    const backerNet = backerShare - carry - Math.round((gain - carry) * rate);
    expect(after.accounts[after.players[B]!.accounts.local]!.balance - backerCash).toBe(backerNet);
    expect(after.accounts[after.players[L]!.accounts.local]!.balance).toBeGreaterThan(leadCash);
    expect(after.accounts[syn.account]!.balance).toBe(0);
    // Exit money came from outside (the buyer): conservation holds within currencies.
    expect(negativeInternalAccounts(after)).toEqual([]);
  });

  it('refunds everyone when the company passes', () => {
    let w = setup(22);
    const before = moneyByCurrency(w);
    const t = target(w);
    const lead0 = w.accounts[w.players[L]!.accounts.local]!.balance;
    const o = run(w, L, {
      type: 'syndicate.open',
      companyId: t.c.id,
      leadAmount: t.lead,
      target: t.total,
      carry: 0.15,
      instrument: 'safe',
      // Far too low a cap: the AI founder walks.
      valuation: Math.round(t.total * 1.6),
      proRata: true,
      boardSeat: false,
    });
    w = o.world;
    const r = run(w, L, { type: 'syndicate.close', syndicateId: o.result.syndicateId });
    w = r.world;
    const s = w.syndicates![o.result.syndicateId]!;
    expect(['failed', 'offered']).toContain(s.status);
    if (s.status === 'offered') w = settle(w, 'lagos', 3);
    expect(w.syndicates![o.result.syndicateId]!.status).toBe('failed');
    expect(w.accounts[w.players[L]!.accounts.local]!.balance).toBeGreaterThanOrEqual(lead0 - 1);
    zero(before, w);
  });

  it('a lead can cancel before the offer; an accepted co-lead matches the cheque', () => {
    let w = setup(23);
    const inv = playerView(w, L)!.investorCareer!.invitations.find((x) => x.kind === 'co-lead');
    expect(inv).toBeTruthy();
    w = run(w, L, { type: 'career.invitation', invitationId: inv!.id, accept: true }).world;
    const before = moneyByCurrency(w);
    const t = target(w);
    const o = run(w, L, {
      type: 'syndicate.open',
      companyId: t.c.id,
      leadAmount: t.lead,
      target: t.total,
      carry: 0.2,
      instrument: 'safe',
      valuation: t.valuation,
      proRata: true,
      boardSeat: false,
    });
    w = o.world;
    const s = w.syndicates![o.result.syndicateId]!;
    expect(s.backers).toHaveLength(1);
    expect(s.backers[0]!.playerId).toBeNull();
    expect(s.backers[0]!.amount).toBeGreaterThan(0);
    expect(w.players[L]!.career!.coLead).toBeUndefined();
    w = run(w, L, { type: 'syndicate.cancel', syndicateId: s.id }).world;
    expect(w.syndicates![s.id]!.status).toBe('cancelled');
    expect(w.accounts[s.account]!.balance).toBe(0);
    zero(before, w);
  });

  it('closes at month end on its own, with AI angels filling some of the rest', () => {
    let w = setup(24);
    const before = moneyByCurrency(w);
    const t = target(w);
    const o = run(w, L, {
      type: 'syndicate.open',
      companyId: t.c.id,
      leadAmount: t.lead,
      target: t.total,
      carry: 0.2,
      instrument: 'safe',
      valuation: t.valuation,
      proRata: true,
      boardSeat: false,
    });
    w = settle(o.world, 'lagos', 1);
    const s = w.syndicates![o.result.syndicateId]!;
    expect(['closed', 'offered', 'failed']).toContain(s.status);
    zero(before, w);
  });
});
