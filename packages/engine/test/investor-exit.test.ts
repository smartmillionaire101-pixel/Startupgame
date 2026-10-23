/**
 * An investor exits a private stake from Capital (MORE_GAMES_NOTE): an outside
 * secondary buyer, or an AI fund already on the cap table, pays through the
 * ledger; the cap table moves; the gain is realised. Older worlds keep the
 * rung-2 gate so they replay exactly.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { sharesOf } from '../src/captable.js';
import { MORE_GAMES_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import {
  addInvestor,
  careerWorld,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  tryRun,
} from './helpers.js';

const I = 'u_investor';

function investorWorld(w: World): World {
  w = addInvestor(w);
  return run(w, I, { type: 'investor.tutorial', action: 'skip' }).world;
}

/** The investor holds 10% of an AI company bought for `invested`, priced at 100 a share. */
function withStake(w: World, invested = 1_000_00) {
  const c = Object.values(w.companies).find(
    (x) => x.market === 'lagos' && x.status === 'active' && x.ipo?.status !== 'listed',
  )!;
  w = produce(w, (d) => {
    const co = d.companies[c.id]!;
    const fd = Object.values(co.capTable.holdings).reduce((a, h) => a + h.shares, 0);
    co.capTable.holdings[I] = { shares: Math.round(fd / 10), kind: 'investor' };
    co.capTable.lastPrice = 100;
    co.capTable.roundsRaised = Math.max(1, co.capTable.roundsRaised);
    co.board = []; // no board seat to ask
    d.positions[`${I}:${c.id}`] = {
      investorId: I,
      companyId: c.id,
      invested,
      returned: 0,
      month: 0,
      writtenOff: false,
    };
  });
  return { w, id: c.id };
}

const newWorld = (seed: number) =>
  run(makeWorld(seed, ['lagos']), null, {
    type: 'system.announce',
    id: MORE_GAMES_NOTE,
    text: 'More games.',
  }).world;

describe('an investor exits a private stake', () => {
  it('sells to the outside buyer: money conserved, holding reduced, gain realised', () => {
    const { w, id } = withStake(investorWorld(newWorld(301)));
    const view = playerView(w, I)!.capital!.stakes.find((x) => x.companyId === id)!;
    expect(view.blocked).toBeNull();
    expect(view.buyers[0]!.id).toBeNull();
    const held = sharesOf(w.companies[id]!.capTable, I);
    const before = moneyByCurrency(w);
    const cash = w.accounts[w.players[I]!.accounts.local]!.balance;

    const r = run(w, I, { type: 'secondary.investorSell', companyId: id, pctBps: 5_000 });
    const sold = Math.floor(held / 2);
    expect(r.result.shares).toBe(sold);
    expect(r.result.price).toBe(Math.round(sold * 75)); // 25% under the last round
    expect(r.result.basis).toBe(500_00);
    expect(r.result.gain).toBeGreaterThan(0);
    expect(r.result.gain).toBe(r.result.price - r.result.basis);
    expect(r.result.net).toBe(r.result.price - r.result.tax);

    const after = r.world;
    expect(moneyByCurrency(after)).toEqual(before);
    expect(negativeInternalAccounts(after)).toEqual([]);
    expect(after.accounts[after.players[I]!.accounts.local]!.balance).toBe(cash + r.result.net);
    expect(sharesOf(after.companies[id]!.capTable, I)).toBe(held - sold);
    expect(after.companies[id]!.capTable.holdings[`sec:${id}`]!.shares).toBe(sold);
    expect(after.positions[`${I}:${id}`]!.returned).toBe(r.result.price);
    expect(after.players[I]!.realised).toMatchObject({
      proceeds: r.result.price,
      gains: r.result.gain,
      tax: r.result.tax,
    });
    const wealth = playerView(after, I)!.me.wealth;
    expect(wealth.realised.gains).toBe(r.result.gain);

    // Selling the rest: the holding is gone and the stake leaves the Capital list.
    const rest = run(after, I, { type: 'secondary.investorSell', companyId: id, pctBps: 10_000 });
    expect(sharesOf(rest.world.companies[id]!.capTable, I)).toBe(0);
    expect(playerView(rest.world, I)!.capital!.stakes.some((x) => x.companyId === id)).toBe(false);
    expect(moneyByCurrency(rest.world)).toEqual(before);
  });

  it('sells to an AI fund on the cap table, which pays from its own account', () => {
    const s0 = withStake(investorWorld(newWorld(302)));
    const id = s0.id;
    let w = s0.w;
    const fund = Object.values(w.funds).find((f) => !f.managerId || w.players[f.managerId]?.ai)!;
    w = produce(w, (d) => {
      d.companies[id]!.capTable.holdings[fund.id] = { shares: 1_000, kind: 'investor' };
      d.accounts[fund.account]!.balance += 10_000_000_00;
      d.accounts[d.markets.lagos!.ext.genesis]!.balance -= 10_000_000_00;
    });
    const buyer = playerView(w, I)!.capital!.stakes.find((x) => x.companyId === id)!.buyers;
    expect(buyer.map((b) => b.id)).toContain(fund.id);
    const before = moneyByCurrency(w);
    const fundCash = w.accounts[fund.account]!.balance;
    const r = run(w, I, {
      type: 'secondary.investorSell',
      companyId: id,
      pctBps: 2_500,
      buyerId: fund.id,
    });
    expect(r.result.price).toBe(Math.round(r.result.shares * 85)); // 15% under
    expect(moneyByCurrency(r.world)).toEqual(before);
    expect(r.world.accounts[fund.account]!.balance).toBe(fundCash - r.result.price);
    expect(r.world.companies[id]!.capTable.holdings[fund.id]!.shares).toBe(1_000 + r.result.shares);
    expect(r.world.positions[`${fund.id}:${id}`]!.invested).toBe(r.result.price);

    // A buyer that isn't on the cap table is refused, with a reason.
    const other = Object.values(w.funds).find(
      (f) => f.id !== fund.id && !w.companies[id]!.capTable.holdings[f.id],
    );
    if (other) {
      const no = tryRun(w, I, {
        type: 'secondary.investorSell',
        companyId: id,
        pctBps: 2_500,
        buyerId: other.id,
      });
      expect(no.ok).toBe(false);
      if (!no.ok) expect(no.error.code).toBe('secondary.buyer');
    }
  });

  it('sells a SAFE: the buyer takes it over at its as-converted value, less the discount', () => {
    const s0 = withStake(investorWorld(newWorld(303)));
    const id = s0.id;
    let w = s0.w;
    w = produce(w, (d) => {
      const co = d.companies[id]!;
      delete co.capTable.holdings[I];
      // The newest SAFE: the company's latest valuation is this cap.
      co.capTable.safes.push({ holderId: I, amount: 400_000_00, cap: 1_000_000_000_00, month: 99 });
    });
    const s = playerView(w, I)!.capital!.stakes.find((x) => x.companyId === id)!;
    expect(s.blocked).toBeNull();
    expect(s.safe).toBe(400_000_00);
    const quote = s.buyers[0]!.quotes.find((q) => q.bps === 5_000)!;
    expect(quote.safeAmount).toBe(200_000_00);
    expect(quote.price).toBe(150_000_00); // 25% under what it's worth
    expect(quote.basis).toBe(200_000_00);
    const before = moneyByCurrency(w);
    const cash = w.accounts[w.players[I]!.accounts.local]!.balance;
    const r = run(w, I, { type: 'secondary.investorSell', companyId: id, pctBps: 5_000 });
    expect(r.result.price).toBe(quote.price);
    expect(r.result.net).toBe(quote.net);
    expect(r.result.gain).toBe(0); // sold at a loss: no tax
    expect(moneyByCurrency(r.world)).toEqual(before);
    expect(r.world.accounts[r.world.players[I]!.accounts.local]!.balance).toBe(cash + quote.net);
    const safes = r.world.companies[id]!.capTable.safes;
    expect(safes.filter((x) => x.holderId === I).map((x) => x.amount)).toEqual([200_000_00]);
    expect(safes.filter((x) => x.holderId === `sec:${id}`).map((x) => x.amount)).toEqual([
      200_000_00,
    ]);
    expect(r.world.players[I]!.realised!.proceeds).toBe(quote.price);
  });

  it('says why a stake can’t be sold yet instead of a dead button', () => {
    const s0 = withStake(investorWorld(newWorld(305)));
    const id = s0.id;
    let w = s0.w;
    const fund = Object.values(w.funds)[0]!;
    w = produce(w, (d) => {
      const co = d.companies[id]!;
      co.board = [fund.id];
      co.hibernation = { since: 0 };
    });
    const s = playerView(w, I)!.capital!.stakes.find((x) => x.companyId === id)!;
    expect(s.blocked?.code).toBe('secondary.board');
    expect(s.buyers[0]!.quotes).toEqual([]);
    const r = tryRun(w, I, { type: 'secondary.investorSell', companyId: id, pctBps: 5_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('secondary.board');
  });

  it('keeps the rung-2 gate in worlds from before the release', () => {
    // An investor below rung 2 who isn't an allocator.
    const old = produce(investorWorld(careerWorld(304)), (d) => {
      delete d.players[I]!.career!.reached[7];
    });
    const { w, id } = withStake(old);
    const s = playerView(w, I)!.capital!.stakes.find((x) => x.companyId === id)!;
    expect(s.blocked?.code).toBe('secondary.rung');
    expect(s.buyers).toHaveLength(1);
    const r = tryRun(w, I, { type: 'secondary.investorSell', companyId: id, pctBps: 5_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('secondary.rung');
  });
});
