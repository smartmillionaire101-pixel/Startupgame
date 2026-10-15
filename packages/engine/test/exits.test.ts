/**
 * Founder Journey 5: exits (secondary sales, the IPO path, public shares),
 * the capital allocator paths, realised vs unrealised wealth, and replay safety.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { closePricedRound, fullyDiluted, sharesOf } from '../src/captable.js';
import { settleExit } from '../src/deals.js';
import { EXITS, ipoChecks } from '../src/exits.js';
import { ALLOCATOR } from '../src/allocator.js';
import { deriveChapters } from '../src/journey.js';
import { EXITS_NOTE } from '../src/releases.js';
import { wealthView } from '../src/wealth.js';
import { playerView } from '../src/views.js';
import type { MonthlyPnl, World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  companyOf,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
} from './helpers.js';

const F = 'u_founder';
const I = 'u_investor';
const edit = (w: World, f: (d: World) => void) => produce(w, f);
const bal = (w: World, id: string) => w.accounts[id]!.balance;
const personal = (w: World, pid: string) => bal(w, w.players[pid]!.accounts.local);

/** A founder (and an investor) whose company closed a priced seed round with an AI fund. */
function pricedWorld() {
  let w = addInvestor(addFounder(makeWorld()), I);
  w = edit(w, (d) => {
    const c = companyOf(d, F);
    const m = d.markets.lagos!;
    const fund = Object.values(d.funds).find((f) => f.market === 'lagos' && f.ai)!;
    const amount = 100_000_000_00;
    closePricedRound(c.capTable, {
      investorId: fund.id,
      amount,
      preMoney: 400_000_000_00,
      poolTopUpBps: 0,
      multiple: 1,
      participating: false,
    });
    c.lastRound = 'seed';
    d.positions[`${fund.id}:${c.id}`] = {
      investorId: fund.id,
      companyId: c.id,
      invested: amount,
      returned: 0,
      month: m.month,
      writtenOff: false,
    };
    // The round's money and some cash for the fund, from the outside world.
    for (const [to, v] of [
      [c.account, amount * 5],
      [fund.account, 500_000_000_00],
      [d.players[I]!.accounts.local, 900_000_000_00],
    ] as const) {
      d.accounts[m.ext.genesis]!.balance -= v;
      d.accounts[to]!.balance += v;
    }
  });
  const c = companyOf(w, F);
  const fundId = Object.keys(c.capTable.holdings).find((h) => w.funds[h])!;
  return { w, cid: c.id, fundId };
}

/** Make the company pass the IPO checklist (books, revenue, board). */
function makeReady(w: World, cid: string, fundId: string) {
  return edit(w, (d) => {
    const c = d.companies[cid]!;
    c.board = [fundId];
    c.distress = null;
    const row: MonthlyPnl = {
      month: 0,
      revenue: 0,
      playerRevenue: 0,
      suppliers: 0,
      payroll: 0,
      founderSalary: 0,
      office: 0,
      marketing: 0,
      cloud: 0,
      compliance: 0,
      interest: 0,
      tax: 0,
      net: 0,
      cashEnd: 0,
      customers: 0,
    };
    c.finance.history = Array.from({ length: 12 }, (_, i) => ({
      ...row,
      month: i,
      revenue: 12_000_000_000 + i * 600_000_000,
      net: 1_000_000_00,
    }));
  });
}

describe('secondary sales', () => {
  it('moves founder shares to an outside buyer: shares and money conserved, tax withheld', () => {
    const { w, cid } = pricedWorld();
    const money0 = moneyByCurrency(w);
    const c0 = w.companies[cid]!;
    const fd0 = fullyDiluted(c0.capTable);
    const mine0 = sharesOf(c0.capTable, F);
    const cash0 = personal(w, F);
    const r = run(w, F, {
      type: 'exit.secondary',
      companyId: cid,
      pctBps: 1_000,
      buyerKind: 'fund',
    });
    const w1 = r.world;
    const c1 = w1.companies[cid]!;
    const sold = Math.floor((mine0 * 1_000) / 10_000);
    expect(fullyDiluted(c1.capTable)).toBe(fd0);
    expect(sharesOf(c1.capTable, F)).toBe(mine0 - sold);
    expect(sharesOf(c1.capTable, 'sec:lagos')).toBe(sold);
    const price = Math.round(
      sold * c0.capTable.lastPrice * (1 - EXITS.secondary.discountBps.outside / 10_000),
    );
    expect(r.result.price).toBe(price);
    const tax = Math.round(price * w.markets.lagos!.data.tax.capitalGains);
    expect(r.result.tax).toBe(tax);
    expect(personal(w1, F) - cash0).toBe(price - tax);
    expect(moneyByCurrency(w1)).toEqual(money0);
    expect(negativeInternalAccounts(w1)).toEqual([]);
    // Realised wealth: the cash received, the gain and the tax.
    expect(w1.players[F]!.realised).toMatchObject({ proceeds: price, gains: price, tax });
    const wealth = wealthView(w1, w1.players[F]!);
    expect(wealth.realised.proceeds).toBe(price);
    // Unsold shares are illiquid, never cash.
    expect(wealth.liquid).toBe(personal(w1, F));
    expect(wealth.shares.private).toBeGreaterThan(0);
    expect(wealth.illiquid).toBeGreaterThanOrEqual(wealth.shares.private);
    expect(w1.players[F]!.milestones['founder.secondary']).toBeDefined();
  });

  it('allows at most 25% of a holding a year', () => {
    const { w, cid } = pricedWorld();
    const sell = (x: World, bps: number) =>
      tryRun(x, F, { type: 'exit.secondary', companyId: cid, pctBps: bps, buyerKind: 'fund' });
    const a = sell(w, 2_000);
    expect(a.ok).toBe(true);
    const b = sell(a.world, 1_000);
    expect(b.ok).toBe(false);
    expect(sell(a.world, 500).ok).toBe(true);
    // A year later the allowance is back.
    const later = edit(a.world, (d) => {
      d.markets.lagos!.month += 12;
    });
    expect(sell(later, 1_000).ok).toBe(true);
  });

  it('needs a priced round, and board consent when investors hold seats', () => {
    let w = addFounder(makeWorld());
    const cid = companyOf(w, F).id;
    const none = tryRun(w, F, {
      type: 'exit.secondary',
      companyId: cid,
      pctBps: 500,
      buyerKind: 'fund',
    });
    expect(none.ok).toBe(false);
    const p = pricedWorld();
    w = edit(p.w, (d) => {
      const c = d.companies[p.cid]!;
      c.board = [p.fundId];
      c.distress = { level: 'danger', monthsLeft: 2, since: 0 };
    });
    const r = tryRun(w, F, {
      type: 'exit.secondary',
      companyId: p.cid,
      pctBps: 500,
      buyerKind: 'fund',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/board/i);
  });

  it('sells to a fund already on the cap table, which pays from its own account', () => {
    const { w, cid, fundId } = pricedWorld();
    const money0 = moneyByCurrency(w);
    const fundCash = bal(w, w.funds[fundId]!.account);
    const held = sharesOf(w.companies[cid]!.capTable, fundId);
    const r = run(w, F, {
      type: 'exit.secondary',
      companyId: cid,
      pctBps: 500,
      buyerKind: 'fund',
      buyerId: fundId,
    });
    expect(bal(r.world, w.funds[fundId]!.account)).toBe(fundCash - r.result.price);
    expect(sharesOf(r.world.companies[cid]!.capTable, fundId)).toBe(held + r.result.shares);
    expect(r.world.positions[`${fundId}:${cid}`]!.invested).toBe(100_000_000_00 + r.result.price);
    expect(moneyByCurrency(r.world)).toEqual(money0);
  });

  it('offers shares to a real player, who accepts through the offer card', () => {
    const { w, cid } = pricedWorld();
    const money0 = moneyByCurrency(w);
    const offer = run(w, F, {
      type: 'exit.secondary',
      companyId: cid,
      pctBps: 800,
      buyerKind: 'player',
      buyerId: I,
    });
    expect(offer.result.waiting).toBe(true);
    const view = playerView(offer.world, I)!;
    expect(view.capital!.offers).toHaveLength(1);
    // Nothing has moved yet.
    expect(sharesOf(offer.world.companies[cid]!.capTable, I)).toBe(0);
    const inv0 = personal(offer.world, I);
    const done = run(offer.world, I, {
      type: 'exit.secondary.accept',
      offerId: offer.result.offerId,
    });
    const c = done.world.companies[cid]!;
    expect(sharesOf(c.capTable, I)).toBe(offer.result.shares);
    expect(personal(done.world, I)).toBe(inv0 - offer.result.price);
    expect(done.world.positions[`${I}:${cid}`]!.invested).toBe(offer.result.price);
    expect(moneyByCurrency(done.world)).toEqual(money0);
    // Once accepted, the offer is gone.
    expect(
      tryRun(done.world, I, { type: 'exit.secondary.accept', offerId: offer.result.offerId }).ok,
    ).toBe(false);
  });
});

describe('the IPO path and public shares', () => {
  it('has a readiness checklist', () => {
    const { w, cid, fundId } = pricedWorld();
    expect(ipoChecks(w, w.companies[cid]!).every((x) => x.ok)).toBe(false);
    expect(tryRun(w, F, { type: 'ipo.prepare', companyId: cid }).ok).toBe(false);
    const ready = makeReady(w, cid, fundId);
    expect(ipoChecks(ready, ready.companies[cid]!).every((x) => x.ok)).toBe(true);
  });

  function listed() {
    const p = pricedWorld();
    let w = makeReady(p.w, p.cid, p.fundId);
    const cash0 = bal(w, w.companies[p.cid]!.account);
    const prep = run(w, F, { type: 'ipo.prepare', companyId: p.cid });
    expect(bal(prep.world, w.companies[p.cid]!.account)).toBe(cash0 - prep.result.fee);
    w = prep.world;
    // Too early to list.
    expect(tryRun(w, F, { type: 'ipo.list', companyId: p.cid }).ok).toBe(false);
    w = edit(w, (d) => {
      d.markets.lagos!.month += EXITS.ipo.prepMonths;
    });
    const fd0 = fullyDiluted(w.companies[p.cid]!.capTable);
    const before = moneyByCurrency(w);
    const list = run(w, F, { type: 'ipo.list', companyId: p.cid });
    expect(moneyByCurrency(list.world)).toEqual(before);
    const c = list.world.companies[p.cid]!;
    expect(c.ipo!.status).toBe('listed');
    const pub = sharesOf(c.capTable, `pub:${p.cid}`);
    expect(pub).toBe(list.result.newShares);
    expect(Math.round((pub / fullyDiluted(c.capTable)) * 10_000)).toBe(EXITS.ipo.floatBps);
    expect(fullyDiluted(c.capTable)).toBe(fd0 + pub);
    return { ...p, w: list.world, list: list.result };
  }

  it('lists the company: a public float, new money, and a founder lock-up', () => {
    const { w, cid } = listed();
    const m = w.markets.lagos!;
    expect(w.companies[cid]!.ipo!.lockups![F]).toBe(m.month + EXITS.ipo.lockupMonths);
    const early = tryRun(w, F, { type: 'shares.sell', companyId: cid, pctBps: 1_000 });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.code).toBe('shares.locked');
    // Locked shares are illiquid in the wealth view.
    const wealth = wealthView(w, w.players[F]!);
    expect(wealth.shares.locked).toBeGreaterThan(0);
    expect(wealth.shares.sellable).toBe(0);
    expect(w.players[F]!.milestones['founder.ipo']).toBeDefined();
    // After the lock-up the founder sells on the market.
    const later = edit(w, (d) => {
      d.markets.lagos!.month += EXITS.ipo.lockupMonths;
    });
    const money0 = moneyByCurrency(later);
    const fd0 = fullyDiluted(later.companies[cid]!.capTable);
    const cash0 = personal(later, F);
    const sold = run(later, F, { type: 'shares.sell', companyId: cid, pctBps: 1_000 });
    expect(fullyDiluted(sold.world.companies[cid]!.capTable)).toBe(fd0);
    expect(personal(sold.world, F) - cash0).toBe(sold.result.net);
    expect(sold.result.gross - sold.result.fee).toBe(sold.result.net + sold.result.tax);
    expect(moneyByCurrency(sold.world)).toEqual(money0);
  });

  it('prices shares deterministically each month, within the band', () => {
    const { w, cid } = listed();
    const a = settle(w, 'lagos', 2);
    const b = settle(w, 'lagos', 2);
    const pa = a.companies[cid]!.ipo!;
    expect(pa.price).toBe(b.companies[cid]!.ipo!.price);
    expect(pa.history).toEqual(b.companies[cid]!.ipo!.history);
    expect(pa.history!.length).toBe(3);
    for (const x of pa.history!) expect(x).toBeGreaterThan(0);
    expect(a.companies[cid]!.capTable.lastPrice).toBe(pa.price);
  });

  it('lets another player buy and sell shares: shares and money conserved', () => {
    const { w, cid } = listed();
    const money0 = moneyByCurrency(w);
    const fd0 = fullyDiluted(w.companies[cid]!.capTable);
    const pub0 = sharesOf(w.companies[cid]!.capTable, `pub:${cid}`);
    const cash0 = personal(w, I);
    const buy = run(w, I, { type: 'shares.buy', companyId: cid, amount: 50_000_000_00 });
    const c = buy.world.companies[cid]!;
    expect(sharesOf(c.capTable, I)).toBe(buy.result.shares);
    expect(sharesOf(c.capTable, `pub:${cid}`)).toBe(pub0 - buy.result.shares);
    expect(fullyDiluted(c.capTable)).toBe(fd0);
    expect(personal(buy.world, I)).toBe(cash0 - buy.result.cost);
    expect(moneyByCurrency(buy.world)).toEqual(money0);
    expect(playerView(buy.world, I)!.capital!.market[0]!.yourShares).toBe(buy.result.shares);
    // Founders can't trade their own listed company's shares this way.
    expect(tryRun(w, F, { type: 'shares.buy', companyId: cid, amount: 1_000_000_00 }).ok).toBe(
      false,
    );
    // Selling straight back at the same price: a loss (fees), so no tax.
    const sell = run(buy.world, I, { type: 'shares.sell', companyId: cid, pctBps: 10_000 });
    expect(sell.result.tax).toBe(0);
    expect(sharesOf(sell.world.companies[cid]!.capTable, I)).toBe(0);
    expect(moneyByCurrency(sell.world)).toEqual(money0);
    expect(negativeInternalAccounts(sell.world)).toEqual([]);
  });
});

describe('the capital allocator', () => {
  it('mentor: an advisor grant through the cap table, then monthly advice', () => {
    let w = addInvestor(addFounder(makeWorld()), I);
    const ai = Object.values(w.companies).find((c) => c.ai && c.market === 'lagos')!;
    const fd0 = fullyDiluted(ai.capTable);
    const r = run(w, I, { type: 'mentor.offer', companyId: ai.id, grantBps: 50 });
    expect(r.result.status).toBe('active');
    const c = r.world.companies[ai.id]!;
    const mine = sharesOf(c.capTable, I);
    expect(fullyDiluted(c.capTable)).toBe(fd0 + mine);
    expect(Math.round((mine / fullyDiluted(c.capTable)) * 10_000)).toBe(50);
    w = settle(r.world, 'lagos', 1);
    const x = Object.values(w.mentorships!)[0]!;
    expect(x.months).toBe(1);
    expect(x.lastBoost).toMatch(/fit|quality/);
    // A real founder answers the offer.
    const offer = run(w, I, { type: 'mentor.offer', companyId: companyOf(w, F).id });
    expect(offer.result.status).toBe('offered');
    const yes = run(offer.world, F, {
      type: 'mentor.answer',
      mentorshipId: offer.result.mentorshipId,
      accept: true,
    });
    expect(sharesOf(yes.world.companies[companyOf(w, F).id]!.capTable, I)).toBe(yes.result.shares);
    expect(yes.result.shares).toBeGreaterThan(0);
  });

  it('give: money goes through the ledger to the city giving fund, with an outcome', () => {
    const w = addFounder(makeWorld());
    const money0 = moneyByCurrency(w);
    const cash0 = personal(w, F);
    const stars0 = w.players[F]!.stars.value;
    const amount = 200_000_00;
    const r = run(w, F, { type: 'give.pledge', cause: 'clinics', amount });
    expect(personal(r.world, F)).toBe(cash0 - amount);
    expect(bal(r.world, r.world.charity!.lagos!)).toBe(amount);
    expect(moneyByCurrency(r.world)).toEqual(money0);
    expect(r.result.outcome).toBeGreaterThan(0);
    expect(r.world.players[F]!.stars.value).toBeGreaterThanOrEqual(stars0);
    expect(tryRun(w, F, { type: 'give.pledge', cause: 'nope', amount }).ok).toBe(false);
  });

  it('career: blocked without a record, then a monthly salary and a decision', () => {
    let w = addInvestor(addFounder(makeWorld()), I);
    expect(tryRun(w, F, { type: 'career.join', orgKind: 'dfi' }).ok).toBe(false);
    const j = run(w, I, { type: 'career.join', orgKind: 'dfi' });
    const role = j.world.players[I]!.allocator!.career!;
    expect(role.salary).toBeGreaterThan(0);
    w = settle(j.world, 'lagos', 1);
    const lines = w.accounts[w.players[I]!.accounts.local]!.recent;
    expect(lines.some((l) => l.memo.startsWith('Salary:') && l.amount === role.salary)).toBe(true);
    const tax = Math.round(role.salary * w.markets.lagos!.data.tax.personalIncome);
    expect(lines.some((l) => l.memo.startsWith('Income tax:') && l.amount === -tax)).toBe(true);
    const cash = personal(w, I);
    const d = run(w, I, { type: 'career.decide', choiceId: 'safe' });
    expect(personal(d.world, I)).toBe(cash + d.result.bonus);
    expect(tryRun(d.world, I, { type: 'career.decide', choiceId: 'impact' }).ok).toBe(false);
    expect(run(d.world, I, { type: 'career.leave' }).world.players[I]!.allocator!.career).toBe(
      null,
    );
  });

  it('serial founder: start again after closing, carrying skills', () => {
    let w = addFounder(makeWorld());
    const setup = {
      name: 'Second Go',
      industry: 'saas' as const,
      revenueModel: 'subscription' as const,
      idea: 'Tools for shop owners',
      incorporation: 'local' as const,
    };
    expect(tryRun(w, F, { type: 'company.start', company: setup }).ok).toBe(false);
    w = run(w, F, { type: 'company.shutdown', companyId: companyOf(w, F).id }).world;
    const skill0 = w.players[F]!.skills.product;
    const r = run(w, F, { type: 'company.start', company: setup });
    const p = r.world.players[F]!;
    expect(r.world.companies[r.result.companyId]!.status).toBe('active');
    expect(p.allocator!.serial).toBeDefined();
    expect(p.skills.product).toBe(Math.min(100, skill0 + 5));
    expect(p.milestones['founder.serial']).toBeDefined();
  });
});

describe('journey chapters 6 and 7', () => {
  const step = (w: World, id: string) =>
    deriveChapters(w, w.players[F]!)
      .flatMap((c) => c.steps)
      .find((s) => s.id === id)!;

  it('a secondary completes the Exit chapter; a gift completes the Capital Allocator', () => {
    const { w, cid } = pricedWorld();
    expect(step(w, 'exit.cash').done).toBe(false);
    expect(step(w, 'allocator.path').done).toBe(false);
    const a = run(w, F, { type: 'exit.secondary', companyId: cid, pctBps: 500, buyerKind: 'fund' });
    expect(step(a.world, 'exit.cash').done).toBe(true);
    expect(step(a.world, 'exit.secondary').done).toBe(true);
    const chapters = deriveChapters(a.world, a.world.players[F]!);
    expect(chapters[5]!.status).not.toBe('upcoming');
    const b = run(a.world, F, { type: 'give.pledge', cause: 'water', amount: 100_000_00 });
    expect(step(b.world, 'allocator.give').done).toBe(true);
    expect(step(b.world, 'allocator.path').done).toBe(true);
    expect(step(b.world, 'allocator.path').go).toEqual({ kind: 'app', app: 'capital' });
  });
});

describe('replay safety', () => {
  it('a world that never uses the new commands carries none of their state', () => {
    let w = addInvestor(addFounder(makeWorld()), I);
    w = settle(w, 'lagos', 4);
    expect(w.secondaryOffers).toBeUndefined();
    expect(w.mentorships).toBeUndefined();
    expect(w.charity).toBeUndefined();
    for (const c of Object.values(w.companies)) {
      expect(c.ipo).toBeUndefined();
      expect(c.secondaries).toBeUndefined();
    }
    for (const p of Object.values(w.players)) {
      expect(p.allocator).toBeUndefined();
      expect(p.realised).toBeUndefined();
    }
  });

  it('an exit counts as realised wealth only after the exits release note', () => {
    const { w, cid } = pricedWorld();
    const sell = (x: World) =>
      edit(x, (d) => {
        settleExit(d, d.companies[cid]!, 900_000_000_00, 'Big Co', 'acquired');
      });
    const before = sell(w);
    expect(before.players[F]!.realised).toBeUndefined();
    const noted = run(w, null, { type: 'system.announce', id: EXITS_NOTE, text: 'Exits.' }).world;
    const after = sell(noted);
    expect(after.players[F]!.realised!.proceeds).toBeGreaterThan(0);
    // Same money either way: only the record differs.
    expect(personal(after, F)).toBe(personal(before, F));
  });

  it('the mentor grant limits hold', () => {
    const w = addInvestor(addFounder(makeWorld()), I);
    const ai = Object.values(w.companies).find((c) => c.ai && c.market === 'lagos')!;
    const [lo, hi] = ALLOCATOR.mentor.grantBps;
    expect(lo).toBe(25);
    expect(hi).toBe(100);
    expect(tryRun(w, F, { type: 'mentor.offer', companyId: companyOf(w, F).id }).ok).toBe(false);
    expect(run(w, I, { type: 'mentor.offer', companyId: ai.id }).result.status).toBe('active');
  });
});
