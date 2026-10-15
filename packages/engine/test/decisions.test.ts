import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { DECISION_TEMPLATES, DECISIONS } from '../src/data/decisions.js';
import { decisionsView, forceDecision } from '../src/decisions.js';
import { account } from '../src/ledger.js';
import { JOURNEY_EVENTS_NOTE } from '../src/releases.js';
import { rivalPressure, rivalsView } from '../src/rivals.js';
import { winChance } from '../src/sales.js';
import { playerView } from '../src/views.js';
import type { DecisionEvent, Rival, World } from '../src/types.js';
import {
  addFounder,
  companyOf,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
} from './helpers.js';

const F = 'u_founder';
const edit = (w: World, f: (d: World) => void) => produce(w, f);
const announce = (w: World) =>
  run(w, null, { type: 'system.announce', id: JOURNEY_EVENTS_NOTE, text: 'Decisions are here.' })
    .world;
const gated = () => announce(addFounder(makeWorld()));
const events = (w: World, id = F) => w.players[id]!.decisions?.events ?? [];

function force(w: World, template: string, opts: Parameters<typeof forceDecision>[3] = {}) {
  let ev: DecisionEvent | null = null;
  const next = edit(w, (d) => {
    ev = forceDecision(d, F, template, opts);
  });
  return { w: next, ev: ev as DecisionEvent | null };
}

const choose = (w: World, eventId: string, choiceId: string) =>
  run(w, F, { type: 'event.choose', eventId, choiceId });

describe('decision events: gating', () => {
  it('worlds without the journey-events note never get events or rivals', () => {
    const w = settle(addFounder(makeWorld()), 'lagos', 8);
    expect(w.players[F]!.decisions).toBeUndefined();
    expect(w.markets.lagos!.rivals).toBeUndefined();
    expect(playerView(w, F)!.decisions.on).toBe(false);
  });

  it('without the note, rivals (even with a price cut) change nothing', () => {
    const base = addFounder(makeWorld());
    const withRival = edit(base, (d) => {
      d.markets.lagos!.rivals = {
        fintech: [
          {
            id: 'rv-x',
            companyId: null,
            name: 'Cheapo',
            industry: 'fintech',
            goal: 'dominate',
            style: 'price',
            funding: 1,
            maturity: 0.99,
            priceIndex: 0.3,
            priceCut: { pct: 25, until: 99 },
            reputation: 3,
            customers: 10,
            nextMoveMonth: 999,
            status: 'active',
            moves: [],
          },
        ],
      };
    });
    expect(rivalPressure(withRival, companyOf(withRival, F))).toBe(0);
    const a = settle(base, 'lagos', 4);
    const b = settle(withRival, 'lagos', 4);
    expect(companyOf(b, F).segments).toEqual(companyOf(a, F).segments);
    expect(moneyByCurrency(b)).toEqual(moneyByCurrency(a));
  });

  it('a refused choice outside a gated world: there is nothing to choose', () => {
    const r = tryRun(addFounder(makeWorld()), F, {
      type: 'event.choose',
      eventId: 'ev1',
      choiceId: 'x',
    });
    expect(r.ok).toBe(false);
  });
});

describe('rivals', () => {
  it('each founder industry gets 2–3 named rivals, AI startups first', () => {
    const w = settle(gated(), 'lagos', 1);
    const list = w.markets.lagos!.rivals!.fintech!;
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.length).toBeLessThanOrEqual(3);
    const ai = Object.values(w.companies).filter(
      (c) => c.ai && c.market === 'lagos' && c.industry === 'fintech' && c.status === 'active',
    );
    // Reuse first: as many mirrored AI startups as there are (up to three).
    expect(list.filter((r) => r.companyId).length).toBe(Math.min(3, ai.length));
    for (const r of list) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(['growth', 'profit', 'dominate']).toContain(r.goal);
    }
    const v = rivalsView(w, [companyOf(w, F)]);
    expect(v[0]!.rivals.length).toBe(list.length);
  });

  it('move on schedule, deterministically, with explainable text', () => {
    const a = settle(gated(), 'lagos', 10);
    const b = settle(gated(), 'lagos', 10);
    expect(a.markets.lagos!.rivals).toEqual(b.markets.lagos!.rivals);
    const moves = a.markets.lagos!.rivals!.fintech!.flatMap((r) => r.moves);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) expect(m.text.length).toBeGreaterThan(5);
    const cut = moves.find((m) => m.kind === 'price_cut');
    if (cut) expect(cut.text).toMatch(/cut prices \d+%/);
  });

  it('a price cut weighs a little on win chances, and an edge lifts it', () => {
    let w = run(gated(), F, { type: 'sales.prospect' }).world;
    const deal = companyOf(w, F).deals![0]!;
    const before = winChance(w, companyOf(w, F), deal);
    w = edit(w, (d) => {
      const r: Rival = {
        id: 'rv-cut',
        companyId: null,
        name: 'Cheapo',
        industry: 'fintech',
        goal: 'dominate',
        style: 'price',
        funding: 1,
        maturity: 0.2,
        priceIndex: 0.5,
        priceCut: { pct: 25, until: d.markets.lagos!.month + 3 },
        reputation: 3,
        customers: 10,
        nextMoveMonth: 999,
        status: 'active',
        moves: [],
      };
      d.markets.lagos!.rivals = { fintech: [r] };
    });
    const p = rivalPressure(w, companyOf(w, F));
    expect(p).toBeCloseTo(0.02, 5);
    expect(p).toBeLessThanOrEqual(0.04);
    const after = winChance(w, companyOf(w, F), deal);
    expect(after).toBeLessThan(before);
    expect(before - after).toBeLessThanOrEqual(0.04 + 1e-9);
    const shielded = edit(w, (d) => {
      companyOf(d, F).rivalEdge = { until: d.markets.lagos!.month + 2, kind: 'product' };
    });
    expect(winChance(shielded, companyOf(shielded, F), deal)).toBeCloseTo(before, 10);
  });
});

describe('decision events: triggers, choices, deadlines, cooldowns', () => {
  it('appear from state at settlement (and only a few at a time)', () => {
    const w = settle(gated(), 'lagos', 12);
    const list = events(w);
    expect(list.length).toBeGreaterThan(0);
    expect(list.filter((e) => e.status === 'open').length).toBeLessThanOrEqual(DECISIONS.maxOpen);
    for (const e of list) {
      expect(e.id).toMatch(/^ev\d+$/);
      expect(e.choices.length).toBeGreaterThanOrEqual(2);
      expect(e.choices.length).toBeLessThanOrEqual(4);
    }
    // Deterministic.
    expect(events(settle(gated(), 'lagos', 12))).toEqual(list);
  });

  it('a short runway triggers the finance event; nothing fires when cash is healthy', () => {
    const w = gated();
    expect(force(w, 'runway-low').ev).toBeNull();
    const short = edit(settle(w, 'lagos', 1), (d) => {
      const c = companyOf(d, F);
      c.finance.history.push(
        ...[1, 2, 3].map((i) => ({ ...c.finance.history[0]!, month: 90 + i, net: -1_000_000_00 })),
      );
      d.accounts[c.account]!.balance = 2_000_000_00;
    });
    const { ev } = force(short, 'runway-low');
    expect(ev?.family).toBe('finance');
    expect(Number(ev!.vars.months)).toBeLessThan(4);
  });

  it('every default costs no cash and no hours', () => {
    for (const t of DECISION_TEMPLATES) {
      expect(t.choices.some((c) => c.id === t.defaultChoice)).toBe(true);
      expect(t.choices.length).toBeGreaterThanOrEqual(2);
      expect(t.choices.length).toBeLessThanOrEqual(4);
    }
    const w = settle(gated(), 'lagos', 18);
    for (const e of events(w)) {
      const d = e.choices.find((c) => c.id === e.defaultChoice)!;
      expect(
        d.effects.some((x) => x.kind === 'cash' || x.kind === 'hours' || x.kind === 'loan'),
      ).toBe(false);
    }
  });

  it('a big prospect: customising pays through the ledger and puts the deal on the pipeline', () => {
    const w0 = edit(gated(), (d) => {
      companyOf(d, F).product.fit = 0.8;
    });
    const { w, ev } = force(w0, 'big-prospect');
    expect(ev).not.toBeNull();
    const ch = ev!.choices.find((c) => c.id === 'customise')!;
    const cost = (ch.effects.find((e) => e.kind === 'cash') as { amount: number }).amount;
    const c0 = companyOf(w, F);
    const cash0 = account(w, c0.account).balance;
    const money0 = moneyByCurrency(w);
    const hours0 = w.players[F]!.hours.used;
    const r = choose(w, ev!.id, 'customise');
    const c1 = companyOf(r.world, F);
    expect(account(r.world, c1.account).balance).toBe(cash0 - cost);
    expect(moneyByCurrency(r.world)).toEqual(money0);
    expect(negativeInternalAccounts(r.world)).toEqual([]);
    expect(r.world.players[F]!.hours.used).toBe(hours0 + 8);
    const deal = c1.deals!.find((d) => d.customer.name === ev!.customer!.name)!;
    expect(deal.stage).toBe('demo');
    expect(deal.revealed).toBe(true);
    const e = events(r.world).find((x) => x.id === ev!.id)!;
    expect(e.status).toBe('chosen');
    // Answered once only.
    expect(
      tryRun(r.world, F, { type: 'event.choose', eventId: ev!.id, choiceId: 'decline' }).ok,
    ).toBe(false);
  });

  it('a choice you can’t afford is refused up front and changes nothing', () => {
    const w0 = edit(gated(), (d) => {
      companyOf(d, F).product.fit = 0.8;
    });
    const { w, ev } = force(w0, 'big-prospect');
    const broke = edit(w, (d) => {
      const c = companyOf(d, F);
      const acc = d.accounts[c.account]!;
      d.accounts[d.markets.lagos!.ext.suppliers]!.balance += acc.balance;
      acc.balance = 0;
    });
    const v = decisionsView(broke, broke.players[F]!);
    expect(v.open[0]!.choices.find((c) => c.id === 'customise')!.blocker).toMatch(/cash/);
    const r = tryRun(broke, F, { type: 'event.choose', eventId: ev!.id, choiceId: 'customise' });
    expect(r.ok).toBe(false);
    expect(events(r.world).find((x) => x.id === ev!.id)!.status).toBe('open');
  });

  it('unanswered by the deadline, it resolves to the default at settlement', () => {
    const w0 = edit(settle(gated(), 'lagos', 1), (d) => {
      const c = companyOf(d, F);
      c.marketingBudget = 1_000_00;
      c.finance.history.push(
        ...[1, 2, 3].map((i) => ({ ...c.finance.history[0]!, month: 90 + i, net: -1_000_000_00 })),
      );
      d.accounts[c.account]!.balance = 2_000_000_00;
    });
    const { w, ev } = force(w0, 'runway-low');
    expect(ev!.deadline).toBe(w.markets.lagos!.month + 1);
    let next = settle(w, 'lagos', 1);
    expect(events(next).find((e) => e.id === ev!.id)!.status).toBe('open');
    next = settle(next, 'lagos', 1);
    const e = events(next).find((x) => x.id === ev!.id)!;
    expect(e.status).toBe('defaulted');
    expect(e.choiceId).toBe('cut');
    // Late answers are refused.
    expect(tryRun(next, F, { type: 'event.choose', eventId: ev!.id, choiceId: 'raise' }).ok).toBe(
      false,
    );
  });

  it('cooldowns stop the same event coming straight back', () => {
    const w0 = edit(gated(), (d) => {
      companyOf(d, F).product.fit = 0.8;
    });
    const { w, ev } = force(w0, 'big-prospect');
    const d = w.players[F]!.decisions!;
    const c = companyOf(w, F);
    expect(d.cooldowns[`big-prospect:${c.id}`]).toBe(ev!.month + 4);
    expect(d.cooldowns['family:customer']).toBe(ev!.month + DECISIONS.familyCooldown);
    // Over the next months the settlement never brings a second big prospect before it cools.
    const later = settle(w, 'lagos', 3);
    const prospects = events(later).filter((e) => e.template === 'big-prospect');
    expect(prospects.length).toBe(1);
  });

  it('a rival’s price cut brings the competition event; matching cuts your price', () => {
    const w0 = gated();
    const rival: Rival = {
      id: 'rv-t',
      companyId: null,
      name: 'Cheapo',
      industry: 'fintech',
      goal: 'dominate',
      style: 'price',
      funding: 5_000_000_00,
      maturity: 0.4,
      priceIndex: 0.6,
      priceCut: { pct: 20, until: 5 },
      reputation: 2,
      customers: 50,
      nextMoveMonth: 99,
      status: 'active',
      moves: [],
    };
    const move = {
      month: 0,
      kind: 'price_cut' as const,
      pct: 20,
      text: 'Cheapo cut prices 20% after raising ₦50,000,000',
    };
    const { w, ev } = force(w0, 'rival-price-cut', { move: { rival, move } });
    expect(ev!.family).toBe('competition');
    expect(ev!.vars.move).toBe(move.text);
    const price0 = companyOf(w, F).price;
    const r = choose(w, ev!.id, 'match');
    expect(companyOf(r.world, F).price).toBe(Math.round(price0 * 0.85));
  });

  it('a chance choice is bounded and deterministic', () => {
    let w = gated();
    w = edit(w, (d) => {
      const c = companyOf(d, F);
      c.staff.push({
        id: 'st1',
        name: 'Tunde',
        role: 'engineer',
        seniority: 'mid',
        salary: 500_000_00,
        equityBps: 0,
        morale: 60,
        skill: 0.6,
        personality: 'steady',
        hiredMonth: 0,
      });
    });
    const rival = {
      id: 'rv-p',
      companyId: null,
      name: 'Grabbit',
      industry: 'fintech',
      goal: 'growth',
      style: 'sales',
      funding: 0,
      maturity: 0.5,
      priceIndex: 1,
      reputation: 2,
      customers: 1,
      nextMoveMonth: 9,
      status: 'active',
      moves: [],
    } as Rival;
    const c = companyOf(w, F);
    const move = {
      month: 0,
      kind: 'poach' as const,
      text: 'Grabbit is trying to hire Tunde',
      targetCompanyId: c.id,
      staffId: 'st1',
    };
    const { w: w1, ev } = force(w, 'rival-poach', { move: { rival, move } });
    const a = choose(w1, ev!.id, 'leave-it');
    const b = choose(w1, ev!.id, 'leave-it');
    expect(a.result.succeeded).toBe(b.result.succeeded);
    const stays = companyOf(a.world, F).staff.some((s) => s.id === 'st1');
    expect(stays).toBe(a.result.succeeded);
    // The view shows the odds and both outcomes.
    const v = decisionsView(w1, w1.players[F]!).open[0]!;
    const leave = v.choices.find((x) => x.id === 'leave-it')!;
    expect(leave.effects).toContainEqual({ kind: 'chance', pct: 50 });
    expect(leave.fail[0]!.kind).toBe('staffLeaves');
  });

  it('keeps money conserved and accounts non-negative across a year of events', () => {
    let w = gated();
    const before = moneyByCurrency(w);
    for (let i = 0; i < 12; i++) {
      w = settle(w, 'lagos', 1);
      const open = events(w).filter((e) => e.status === 'open');
      for (const e of open) {
        const ch = e.choices.find((x) => x.id !== e.defaultChoice) ?? e.choices[0]!;
        const r = tryRun(w, F, { type: 'event.choose', eventId: e.id, choiceId: ch.id });
        if (r.ok) w = r.world;
      }
    }
    // External accounts are the only sources and sinks: the total never moves.
    const after = moneyByCurrency(w);
    for (const k of Object.keys(before)) expect(after[k]).toBe(before[k]);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });
});
