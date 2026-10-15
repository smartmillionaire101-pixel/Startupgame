import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { AMBITION, AMBITION_IDS, ambitionMilestone, ambitionView } from '../src/ambitions.js';
import { journeyView } from '../src/journey.js';
import { lifestyleCost } from '../src/personal.js';
import { playerView } from '../src/views.js';
import type { MonthlyPnl, World } from '../src/types.js';
import { addFounder, addInvestor, companyOf, makeWorld, run, settle, tryRun } from './helpers.js';

const F = 'u_founder';
const edit = (w: World, f: (d: World) => void) => produce(w, f);
/** Any harmless command: ambitions are recorded after every command, like chapters. */
const poke = (w: World, who = F) => run(w, who, { type: 'inbox.read', ids: [] }).world;
const choose = (w: World, id?: (typeof AMBITION_IDS)[number], who = F) =>
  run(w, who, { type: 'journey.ambition', ...(id ? { id } : {}) }).world;
const option = (w: World, id: string, who = F) =>
  ambitionView(w, w.players[who]!)!.options.find((o) => o.id === id)!;
const steps = (w: World, id: string, who = F) =>
  Object.fromEntries(option(w, id, who).steps.map((s) => [s.id, s.done]));

const pnl = (month: number, revenue: number, net: number): MonthlyPnl => ({
  month,
  revenue,
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
  net,
  cashEnd: 0,
  customers: 1,
});

describe('ambitions: seven paths for every human player', () => {
  it('lists every path with steps, none chosen; AI players get none', () => {
    const w = addFounder(makeWorld());
    const v = ambitionView(w, w.players[F]!)!;
    expect(v.chosen).toBeNull();
    expect(v.options.map((o) => o.id)).toEqual([...AMBITION_IDS]);
    expect(v.options.every((o) => o.steps.length >= 2 && !o.done)).toBe(true);
    expect(playerView(w, F)!.ambition?.options).toHaveLength(7);
    const ai = Object.values(w.players).find((p) => p.ai)!;
    expect(ambitionView(w, ai)).toBeNull();
  });

  it('choosing one leads the main objective with its next step; clearing it goes back', () => {
    let w = addFounder(makeWorld());
    const before = journeyView(w, w.players[F]!)!.main[0]!;
    expect(before.chapter).toBe(1);
    w = choose(w, 'unicorn');
    expect(ambitionView(w, w.players[F]!)!.chosen).toBe('unicorn');
    expect(ambitionView(w, w.players[F]!)!.since).toBe(w.markets.lagos!.month);
    const main = journeyView(w, w.players[F]!)!.main;
    expect(main[0]).toMatchObject({ id: 'unicorn.valuation', chapter: 0 });
    // The chapters' steps still follow.
    expect(main.some((s) => s.id === before.id)).toBe(true);
    w = choose(w);
    expect(ambitionView(w, w.players[F]!)!.chosen).toBeNull();
    expect(journeyView(w, w.players[F]!)!.main[0]!.id).toBe(before.id);
  });

  it('investors choose too (no journey needed); unknown ids are refused', () => {
    let w = addInvestor(makeWorld());
    w = choose(w, 'angel', 'u_investor');
    expect(ambitionView(w, w.players.u_investor!)!.chosen).toBe('angel');
    expect(
      tryRun(w, 'u_investor', { type: 'journey.ambition', id: 'astronaut' as 'angel' }).ok,
    ).toBe(false);
  });

  it('choosing takes no world id and moves no money (replay-safe)', () => {
    const w = addFounder(makeWorld());
    const next = choose(w, 'serial');
    expect(next.nextId).toBe(w.nextId);
    const bal = (x: World) => Object.values(x.accounts).map((a) => a.balance);
    expect(bal(next)).toEqual(bal(w));
  });
});

describe('ambitions: progress measured from the world', () => {
  it('unicorn: reached at a $1bn mark, recorded once with one note, and stays reached', () => {
    let w = choose(addFounder(makeWorld()), 'unicorn');
    const c = companyOf(w, F);
    const need = Math.round(
      AMBITION.unicorn.valuationUsd * 100 * w.markets.lagos!.data.unitsPerUsd,
    );
    const val = option(w, 'unicorn').steps.find((s) => s.id === 'unicorn.valuation')!;
    expect(val.progress).toMatchObject({ need, currency: 'NGN' });
    w = poke(
      edit(w, (d) => {
        d.companies[c.id]!.capTable.lastPostMoney = need;
      }),
    );
    const month = w.markets.lagos!.month;
    expect(w.players[F]!.milestones[ambitionMilestone('unicorn')]).toBe(month);
    expect(option(w, 'unicorn')).toMatchObject({ done: true, reachedMonth: month });
    expect(w.inbox[F]!.filter((i) => i.id === 'in_ambition_unicorn')).toHaveLength(1);
    // Reached ambitions no longer lead the main objective.
    expect(journeyView(w, w.players[F]!)!.main[0]!.chapter).not.toBe(0);
    // A falling valuation doesn't take it back, and no second note arrives.
    w = poke(
      edit(w, (d) => {
        d.companies[c.id]!.capTable.lastPostMoney = 1;
      }),
    );
    expect(option(w, 'unicorn').done).toBe(true);
    expect(w.inbox[F]!.filter((i) => i.id === 'in_ambition_unicorn')).toHaveLength(1);
  });

  it('an unchosen path is shown as done but not recorded', () => {
    let w = addFounder(makeWorld());
    const c = companyOf(w, F);
    w = poke(
      edit(w, (d) => {
        d.companies[c.id]!.capTable.lastPostMoney = 1e15;
      }),
    );
    expect(option(w, 'unicorn').done).toBe(true);
    expect(w.players[F]!.milestones[ambitionMilestone('unicorn')]).toBeUndefined();
  });

  it('profitable owner: a run of profitable months and two years of living costs saved', () => {
    let w = addFounder(makeWorld());
    const c = companyOf(w, F);
    const n = AMBITION.profitable.months;
    w = edit(w, (d) => {
      const h = d.companies[c.id]!.finance.history;
      h.push(pnl(1, 100, -5)); // an older loss doesn't break the run
      for (let i = 0; i < n; i++) h.push(pnl(2 + i, 100, 10));
    });
    expect(steps(w, 'profitable')['profitable.streak']).toBe(true);
    const need = lifestyleCost(w, w.players[F]!) * AMBITION.profitable.livingMonths;
    w = edit(w, (d) => {
      d.accounts[d.players[F]!.accounts.local]!.balance = need - 1;
    });
    expect(steps(w, 'profitable')['profitable.independent']).toBe(false);
    w = edit(w, (d) => {
      d.accounts[d.players[F]!.accounts.local]!.balance = need;
    });
    expect(steps(w, 'profitable')['profitable.independent']).toBe(true);
    // A loss this month resets the run.
    w = edit(w, (d) => {
      d.companies[c.id]!.finance.history.push(pnl(9, 100, -1));
    });
    expect(steps(w, 'profitable')['profitable.streak']).toBe(false);
  });

  it('serial founder: a company ends, a new one starts after, three in all', () => {
    let w = addFounder(makeWorld());
    const first = companyOf(w, F);
    expect(steps(w, 'serial')).toEqual({
      'serial.end': false,
      'serial.again': false,
      'serial.companies': false,
    });
    w = edit(w, (d) => {
      const c = d.companies[first.id]!;
      c.status = 'shutdown';
      c.closedMonth = d.markets.lagos!.month;
    });
    expect(steps(w, 'serial')['serial.end']).toBe(true);
    expect(steps(w, 'serial')['serial.again']).toBe(false);
    w = run(w, F, {
      type: 'company.found',
      company: {
        name: 'Second Go',
        industry: 'fintech',
        revenueModel: 'subscription',
        idea: 'Again, better',
        incorporation: 'local',
      },
    }).world;
    expect(steps(w, 'serial')['serial.again']).toBe(true);
    expect(option(w, 'serial').steps.find((s) => s.id === 'serial.companies')!.progress).toEqual({
      have: 2,
      need: AMBITION.serial.companies,
    });
  });

  it('angel investor: personal positions in distinct startups and money back', () => {
    let w = addFounder(addInvestor(makeWorld()));
    const ids = Object.keys(w.companies).slice(0, AMBITION.angel.companies);
    w = edit(w, (d) => {
      ids.forEach((companyId, i) => {
        d.positions[`p${i}`] = {
          investorId: 'u_investor',
          companyId,
          invested: 1000,
          returned: i === 0 ? 500 : 0,
          month: 0,
          writtenOff: false,
        };
      });
    });
    expect(steps(w, 'angel', 'u_investor')).toEqual({
      'angel.first': true,
      'angel.portfolio': true,
      'angel.return': true,
    });
    // Someone else's positions don't count for you.
    expect(steps(w, 'angel')['angel.first']).toBe(false);
  });

  it('philanthropist: total given across causes, converted to your currency', () => {
    let w = addFounder(makeWorld());
    const usd = AMBITION.philanthropist.givenUsd * 100;
    w = edit(w, (d) => {
      d.players[F]!.allocator = {
        pledges: [
          {
            cause: 'schools',
            amount: usd / 2,
            currency: 'USD',
            month: 1,
            market: 'lagos',
            outcome: 1,
          },
          {
            cause: 'clinics',
            amount: usd / 2,
            currency: 'USD',
            month: 1,
            market: 'lagos',
            outcome: 1,
          },
        ],
      };
    });
    const s = steps(w, 'philanthropist');
    expect(s['philanthropist.first']).toBe(true);
    // Two causes so far; a third (and a dollar more, past any rounding at today's rate) finishes it.
    expect(s['philanthropist.causes']).toBe(false);
    w = edit(w, (d) => {
      d.players[F]!.allocator!.pledges!.push({
        cause: 'water',
        amount: 100,
        currency: 'USD',
        month: 1,
        market: 'lagos',
        outcome: 1,
      });
    });
    expect(steps(w, 'philanthropist')).toEqual({
      'philanthropist.first': true,
      'philanthropist.given': true,
      'philanthropist.causes': true,
    });
  });

  it('lifestyle: income that covers living costs and close contacts', () => {
    let w = addFounder(makeWorld());
    const c = companyOf(w, F);
    const cost = lifestyleCost(w, w.players[F]!);
    w = edit(w, (d) => {
      d.companies[c.id]!.founderSalary = cost;
      const month = d.markets.lagos!.month;
      d.players[F]!.contacts = Array.from({ length: AMBITION.lifestyle.contacts }, (_, i) => ({
        id: `player:x${i}`,
        kind: 'player' as const,
        refId: `x${i}`,
        name: `Friend ${i}`,
        warmth: 0.9,
        month,
      }));
    });
    const s = steps(w, 'lifestyle');
    expect(s['lifestyle.income']).toBe(true);
    expect(s['lifestyle.people']).toBe(true);
    expect(s['lifestyle.home']).toBe(false);
  });

  it('a settlement records the chosen ambition for founders in that city', () => {
    let w = choose(addFounder(makeWorld()), 'unicorn');
    const c = companyOf(w, F);
    w = edit(w, (d) => {
      d.companies[c.id]!.capTable.lastPostMoney = 1e15;
    });
    w = settle(w, 'lagos', 1);
    expect(w.players[F]!.milestones[ambitionMilestone('unicorn')]).toBeDefined();
  });
});
