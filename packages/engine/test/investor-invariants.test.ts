import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { produce } from 'immer';
import { dispatch } from '../src/dispatch.js';
import { listedIn } from '../src/exchange.js';
import type { Command } from '../src/commands.js';
import type { World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  careerWorld,
  DAY,
  moneyByCurrency,
  negativeInternalAccounts,
  T0,
} from './helpers.js';

/**
 * Property (Appendix C "money is conserved and the ledger property test
 * covers the new commands"): whatever the investor career's commands do, in
 * whatever order, with month ends in between, money is conserved per
 * currency, no real account is overdrawn, and positions never go negative.
 */
const GP = 'u_investor';
const LP = 'u_lp';

function base(): World {
  let w = addFounder(addInvestor(addInvestor(careerWorld(91)), LP));
  for (const id of [GP, LP]) {
    const r = dispatch(w, { type: 'investor.tutorial', action: 'skip' }, { actorId: id, now: T0 });
    if (r.ok) w = r.world;
  }
  w = produce(w, (d) => {
    // Every rung open, so every command can succeed; money from the outside world.
    for (const id of [GP, LP]) {
      const p = d.players[id]!;
      p.stars.value = 3.5;
      for (let n = 1; n <= 7; n++) p.career!.reached[n] = 0;
      const amount = 3_000_000_000_00;
      d.accounts[d.markets.lagos!.ext.genesis]!.balance -= amount;
      d.accounts[p.accounts.local]!.balance += amount;
    }
  });
  // A fund past its first close (calls, letters, reserves, stakes) and one still raising.
  const must = (actor: string, cmd: Command) => {
    const r = dispatch(w, cmd, { actorId: actor, now: T0 });
    if (!r.ok) throw new Error(`${cmd.type}: ${r.error.message}`);
    w = r.world;
    return r.result as { fundId?: string };
  };
  const launch = (strategy: 'seed' | 'fof'): Command => ({
    type: 'fund.launch',
    sectors: ['fintech', 'saas'],
    stages: ['pre-seed', 'seed'],
    checkSize: 20_000_000_00,
    why: 'Backing founders across the city',
    strategy,
    target: 2_000_000_000_00,
    minCommit: 20_000_000_00,
    feeRate: 0.02,
    carry: 0.2,
    hurdle: 0,
    gpCommit: 0.02,
    termMonths: 48,
    investMonths: 24,
    keyPerson: true,
  });
  const gpFund = must(GP, launch('seed')).fundId!;
  must(LP, { type: 'lp.commit', fundId: gpFund, amount: 1_200_000_000_00 });
  must(GP, { type: 'fund.close', fundId: gpFund });
  must(LP, launch('fof'));
  return w;
}

const companies = (w: World) =>
  Object.values(w.companies)
    .filter((c) => c.market === 'lagos' && c.status === 'active')
    .sort((a, b) => (a.id < b.id ? -1 : 1));

function command(
  w: World,
  a: { op: number; who: boolean; pick: number; amount: number; bps: number },
): [string, Command] | null {
  const me = a.who ? GP : LP;
  const cs = companies(w);
  const c = cs[a.pick % Math.max(1, cs.length)];
  const listed = listedIn(w, 'lagos');
  const l = listed[a.pick % Math.max(1, listed.length)];
  const myFunds = Object.values(w.funds).filter((f) => f.managerId === me && f.lp);
  const fund = myFunds[a.pick % Math.max(1, myFunds.length)];
  const otherFunds = Object.values(w.funds).filter((f) => f.lp && f.managerId !== me);
  const other = otherFunds[a.pick % Math.max(1, otherFunds.length)];
  const syn = Object.values(w.syndicates ?? {})[
    a.pick % Math.max(1, Object.keys(w.syndicates ?? {}).length)
  ];
  const call = Object.values(w.funds)
    .flatMap((f) => f.lp?.calls ?? [])
    .filter((x) => x.status === 'due')[a.pick % 3];
  const offer = Object.values(w.prorata ?? {})[0];
  const sale = Object.values(w.stakeOffers ?? {}).find((x) => x.status === 'awaiting-gp');
  switch (a.op % 27) {
    case 0:
      return c
        ? [
            me,
            {
              type: 'invest.propose',
              companyId: c.id,
              instrument: 'safe',
              amount: a.amount,
              valuation: a.amount * 8,
              proRata: true,
              boardSeat: false,
              vetoOnSale: false,
            },
          ]
        : null;
    case 1:
      return [me, { type: 'index.buy', market: 'lagos', amount: a.amount }];
    case 2:
      return [me, { type: 'index.sell', market: 'lagos', pctBps: a.bps }];
    case 3:
      return l ? [me, { type: 'shares.buy', companyId: l.id, amount: a.amount }] : null;
    case 4:
      return l ? [me, { type: 'shares.sell', companyId: l.id, pctBps: a.bps }] : null;
    case 5:
      return l
        ? [
            me,
            {
              type: 'shares.order',
              companyId: l.id,
              side: a.who ? 'buy' : 'sell',
              amount: a.who ? a.amount : a.bps,
              limit: (l.ipo?.price ?? 1) * (a.who ? 1.1 : 0.9),
            },
          ]
        : null;
    case 6:
      return c
        ? [
            me,
            {
              type: 'syndicate.open',
              companyId: c.id,
              leadAmount: a.amount,
              target: a.amount * 3,
              carry: 0.2,
              instrument: 'safe',
              valuation: a.amount * 20,
              proRata: true,
              boardSeat: false,
            },
          ]
        : null;
    case 7:
      return syn ? [me, { type: 'syndicate.back', syndicateId: syn.id, amount: a.amount }] : null;
    case 8:
      return syn ? [me, { type: 'syndicate.close', syndicateId: syn.id }] : null;
    case 9:
      return [
        me,
        {
          type: 'fund.launch',
          sectors: ['fintech'],
          stages: ['seed'],
          checkSize: a.amount,
          why: 'Backing founders across the city',
          strategy: a.who ? 'seed' : 'public',
          target: 2_000_000_000_00,
          minCommit: 20_000_000_00,
          feeRate: 0.02,
          carry: 0.2,
          hurdle: 0,
          gpCommit: 0.02,
          termMonths: 48,
          investMonths: 24,
          keyPerson: true,
        },
      ];
    case 10:
      return fund ? [me, { type: 'fund.close', fundId: fund.id }] : null;
    case 11:
      return other ? [me, { type: 'lp.commit', fundId: other.id, amount: a.amount * 50 }] : null;
    case 12:
      return call
        ? [
            Object.values(w.funds)
              .flatMap((f) => f.lp?.commitments ?? [])
              .find((x) => x.id === call.commitmentId)?.playerId ?? me,
            { type: 'lp.pay', callId: call.id },
          ]
        : null;
    case 13:
      return fund ? [me, { type: 'lp.autopay', fundId: fund.id, on: a.who }] : null;
    case 14:
      return fund && c
        ? [me, { type: 'fund.reserve', fundId: fund.id, companyId: c.id, amount: a.amount }]
        : null;
    case 15:
      return fund && c
        ? [me, { type: 'fund.ic', fundId: fund.id, companyId: c.id, amount: a.amount }]
        : null;
    case 16:
      return fund ? [me, { type: 'fund.letter', fundId: fund.id, honest: a.who }] : null;
    case 17:
      return offer ? [me, { type: 'prorata.answer', offerId: offer.id, take: a.who }] : null;
    case 18:
      return [me, { type: 'firm.found', name: `Firm ${me}` }];
    case 19:
      return [me, { type: 'firm.hire', title: a.who ? 'associate' : 'partner' }];
    case 20:
      return fund && other
        ? [
            me,
            { type: 'fof.commit', fundId: fund.id, targetFundId: other.id, amount: a.amount * 20 },
          ]
        : null;
    case 21:
      return other ? [me, { type: 'stake.sell', fundId: other.id }] : null;
    case 22:
      return c ? [me, { type: 'secondary.investorSell', companyId: c.id, pctBps: a.bps }] : null;
    case 23:
      return [
        me,
        { type: 'accelerator.found', name: `Accel ${me}`, cheque: 40_000_000_00, equityBps: 700 },
      ];
    case 24:
      return c ? [me, { type: 'accelerator.admit', companyId: c.id }] : null;
    case 25:
      return sale
        ? [
            w.funds[sale.fundId]!.managerId!,
            { type: 'stake.consent', offerId: sale.id, approve: a.who },
          ]
        : null;
    default:
      return c ? [me, { type: 'invest.support', companyId: c.id, kind: 'customers' }] : null;
  }
}

describe('investor career invariants under random play', () => {
  it('conserves money and keeps real accounts and positions non-negative', () => {
    const start = base();
    const total = moneyByCurrency(start);
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({ k: fc.constant('settle' as const) }),
            fc.record({
              k: fc.constant('act' as const),
              op: fc.nat(60),
              who: fc.boolean(),
              pick: fc.nat(20),
              amount: fc.integer({ min: 100_000_00, max: 50_000_000_00 }),
              bps: fc.integer({ min: 1, max: 10_000 }),
            }),
          ),
          { minLength: 10, maxLength: 40 },
        ),
        (steps) => {
          let w = start;
          let months = 0;
          for (const s of steps) {
            if (s.k === 'settle') {
              months++;
              const at = (w.markets.lagos!.settledAt ?? T0) + DAY;
              const r = dispatch(
                w,
                { type: 'market.settle', market: 'lagos', at },
                { actorId: null, now: T0 + months * DAY },
              );
              if (r.ok) w = r.world;
              continue;
            }
            const cmd = command(w, s);
            if (!cmd) continue;
            const r = dispatch(w, cmd[1], { actorId: cmd[0], now: T0 + months * DAY });
            if (r.ok) w = r.world;
          }
          expect(moneyByCurrency(w)).toEqual(total);
          expect(negativeInternalAccounts(w)).toEqual([]);
          for (const p of Object.values(w.positions)) {
            expect(p.invested).toBeGreaterThanOrEqual(0);
            expect(p.returned).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 25, seed: 7 },
    );
  });
});
