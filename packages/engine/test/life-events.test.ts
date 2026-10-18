import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { LIFE_EVENTS, LIFE_EVENT_TEMPLATES } from '../src/data/lifeevents.js';
import { LIFE_EVENT_IDS, forceLifeEvent, openLifeEvents } from '../src/lifeevents.js';
import { account } from '../src/ledger.js';
import { barsOf } from '../src/lifebars.js';
import { JOURNEY_EVENTS_NOTE, LIFE_BARS_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { DecisionEvent, World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
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
const announce = (w: World, id: string = LIFE_BARS_NOTE) =>
  run(w, null, { type: 'system.announce', id, text: 'Life bars.' }).world;
/** A founder and an investor in a life-bars world. */
const gated = (seed = 42) => addInvestor(addFounder(announce(makeWorld(seed, ['lagos']))));
const lifeOf = (w: World, id = F) => (w.players[id]!.decisions?.events ?? []).filter((e) => e.life);
const cash = (w: World, id = F) => account(w, w.players[id]!.accounts.local).balance;

function force(w: World, template: string, id = F) {
  let ev: DecisionEvent | null = null;
  const next = edit(w, (d) => {
    ev = forceLifeEvent(d, id, template);
  });
  return { w: next, ev: ev as DecisionEvent | null };
}
const choose = (w: World, eventId: string, choiceId: string, id = F) =>
  run(w, id, { type: 'event.choose', eventId, choiceId });

describe('life events: content', () => {
  it('has about twenty events across five families, each with a condition', () => {
    expect(LIFE_EVENT_TEMPLATES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(LIFE_EVENT_TEMPLATES.map((t) => t.family))).toEqual(
      new Set(['health', 'money', 'social', 'work', 'city']),
    );
    expect(new Set(LIFE_EVENT_TEMPLATES.map((t) => t.id)).size).toBe(LIFE_EVENT_TEMPLATES.length);
    for (const t of LIFE_EVENT_TEMPLATES) {
      expect(LIFE_EVENT_IDS).toContain(t.id);
      expect(t.choices.length).toBeGreaterThanOrEqual(2);
      expect(t.choices.length).toBeLessThanOrEqual(3);
      expect(t.choices.map((c) => c.id)).toContain(t.defaultChoice);
      expect(t.deadline).toBe(0);
      expect(t.emoji).toBeTruthy();
    }
  });

  it('every event that can fire offers its template’s choices; defaults never take hours', () => {
    let w = gated();
    // Give the founder everything a condition could ask for.
    w = edit(w, (d) => {
      const p = d.players[F]!;
      p.stress = 70;
      p.car = { model: 'x' } as never;
      d.companies[p.companyIds[0]!]!.staff.push({
        ...(d.companies[p.companyIds[0]!]!.staff[0] ?? {}),
        id: 'st1',
        name: 'Bola',
        salary: 100_000_00,
      } as never);
    });
    let fired = 0;
    for (const t of LIFE_EVENT_TEMPLATES) {
      const { ev } = force(w, t.id);
      if (!ev) continue;
      fired += 1;
      expect(ev.choices.map((c) => c.id)).toEqual(t.choices.map((c) => c.id));
      const def = ev.choices.find((c) => c.id === t.defaultChoice)!;
      expect([...def.effects, ...(def.fail ?? [])].some((e) => e.kind === 'hours')).toBe(false);
      // Chance choices say how it went, either way.
      for (const ch of ev.choices)
        if (ch.effects.some((e) => e.kind === 'chance')) {
          const data = t.choices.find((c) => c.id === ch.id)!;
          expect(data.win && data.lose).toBeTruthy();
        }
    }
    // Only "co-found a startup" is for people without a company.
    expect(fired).toBe(LIFE_EVENT_TEMPLATES.length - 1);
  });
});

describe('life events: gating and replay', () => {
  it('worlds without the life-bars note never get life events', () => {
    const plain = addInvestor(addFounder(makeWorld(42, ['lagos'])));
    const journey = announce(plain, JOURNEY_EVENTS_NOTE);
    for (const w0 of [plain, journey]) {
      const w = settle(w0, 'lagos', 8);
      expect(lifeOf(w, F)).toEqual([]);
      expect(lifeOf(w, I)).toEqual([]);
      const cds = Object.keys(w.players[F]!.decisions?.cooldowns ?? {});
      expect(cds.some((k) => k.startsWith('life:'))).toBe(false);
      expect(playerView(w, F)!.decisions.lifeOn).toBe(false);
    }
  });
});

describe('life events: drawing', () => {
  it('is deterministic for a seed, and reaches non-founders', () => {
    const a = settle(gated(), 'lagos', 6);
    const b = settle(gated(), 'lagos', 6);
    expect(lifeOf(a, F)).toEqual(lifeOf(b, F));
    expect(lifeOf(a, I)).toEqual(lifeOf(b, I));
    expect(lifeOf(a, F).length).toBeGreaterThan(0);
    // The investor (not a founder) gets them too.
    expect(lifeOf(a, I).length).toBeGreaterThan(0);
    expect(playerView(a, I)!.decisions.lifeOn).toBe(true);
  });

  it('never has more than the cap open, and every event is due this month', () => {
    let w = gated(7);
    for (let i = 0; i < 10; i++) {
      w = settle(w, 'lagos', 1);
      const month = w.markets.lagos!.month;
      for (const id of [F, I]) {
        const open = openLifeEvents(w.players[id]!);
        expect(open.length).toBeLessThanOrEqual(LIFE_EVENTS.maxOpen);
        for (const e of open) expect(e.deadline).toBe(month);
      }
    }
  });

  it('draws nothing new while the cap is full', () => {
    let w = force(gated(), 'life-family-visit').w;
    w = force(w, 'life-neighbour').w;
    // Keep them open past this settlement.
    w = edit(w, (d) => {
      for (const e of d.players[F]!.decisions!.events) e.deadline += 5;
    });
    const before = lifeOf(w).length;
    w = settle(w, 'lagos', 3);
    expect(lifeOf(w).length).toBe(before);
  });

  it('only offers what fits your life: conditions', () => {
    const w = gated();
    // Renters only, car owners only, stressed only, founders only, non-founders only.
    expect(force(w, 'life-rent-rise').ev).not.toBeNull();
    const owner = edit(w, (d) => {
      d.players[F]!.residence = { propertyId: 'pr1', since: 0 };
    });
    expect(force(owner, 'life-rent-rise').ev).toBeNull();
    expect(force(w, 'life-parking-fine').ev).toBeNull();
    expect(force(w, 'life-burnout').ev).toBeNull();
    const stressed = edit(w, (d) => {
      d.players[F]!.stress = LIFE_EVENTS.burnoutStress;
    });
    expect(force(stressed, 'life-burnout').ev).not.toBeNull();
    expect(force(w, 'life-laptop').ev).not.toBeNull();
    expect(force(w, 'life-laptop', I).ev).toBeNull();
    expect(force(w, 'life-cofounder').ev).toBeNull();
    expect(force(w, 'life-cofounder', I).ev).not.toBeNull();
    // Too little saved: no friend asks for a loan.
    const broke = edit(w, (d) => {
      const acc = d.accounts[d.players[I]!.accounts.local]!;
      acc.balance = 0;
    });
    expect(force(broke, 'life-friend-loan', I).ev).toBeNull();
  });
});

describe('life events: choosing', () => {
  it('applies the bars, hours and money through the ledger, and records the result', () => {
    const base = edit(gated(), (d) => {
      d.players[F]!.stress = 70;
    });
    const { w, ev } = force(base, 'life-burnout');
    const money0 = moneyByCurrency(w);
    const cash0 = cash(w);
    const hours0 = w.players[F]!.hours.used;
    const cost = ev!.choices
      .find((c) => c.id === 'counsellor')!
      .effects.find((e) => e.kind === 'cash') as { amount: number };
    const r = choose(w, ev!.id, 'counsellor');
    const p = r.world.players[F]!;
    expect(p.stress).toBe(58);
    expect(p.hours.used).toBe(hours0 + 2);
    expect(cash(r.world)).toBe(cash0 - cost.amount);
    expect(moneyByCurrency(r.world)).toEqual(money0);
    expect(negativeInternalAccounts(r.world)).toEqual([]);
    expect(r.result.life).toBe(true);
    expect(r.result.result).toEqual({ bars: { stress: -12 }, cash: -cost.amount });
    expect(r.result.message).toBe('An hour with someone who listens helps a lot.');
    const view = playerView(r.world, F)!.decisions.recent.find((e) => e.id === ev!.id)!;
    expect(view.life).toBe(true);
    expect(view.result).toEqual({ bars: { stress: -12 }, cash: -cost.amount });
  });

  it('money in comes from an outside account: the books still balance', () => {
    const { w, ev } = force(gated(), 'life-tax-refund', I);
    const money0 = moneyByCurrency(w);
    const r = choose(w, ev!.id, 'save', I);
    expect(r.result.result.cash).toBeGreaterThan(0);
    expect(moneyByCurrency(r.world)).toEqual(money0);
  });

  it('a chance choice rolls on its own stream: same seed, same outcome; a loan comes back', () => {
    const { w, ev } = force(gated(), 'life-friend-loan', I);
    const a = choose(w, ev!.id, 'lend', I);
    const b = choose(w, ev!.id, 'lend', I);
    expect(a.result.succeeded).toBe(b.result.succeeded);
    expect(typeof a.result.succeeded).toBe('boolean');
    const lent = -a.result.result.cash;
    expect(lent).toBeGreaterThan(0);
    const owed = a.world.players[I]!.decisions!.repayments ?? [];
    expect(owed.length).toBe(a.result.succeeded ? 1 : 0);
    // Try a few seeds so both outcomes are seen: a won loan is paid back next month.
    const outcomes = new Set<boolean>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const f = force(gated(seed), 'life-friend-loan', I);
      const c = choose(f.w, f.ev!.id, 'lend', I);
      outcomes.add(c.result.succeeded);
      if (!c.result.succeeded) continue;
      const before = cash(c.world, I);
      const money0 = moneyByCurrency(c.world);
      const next = settle(c.world, 'lagos', 1);
      expect(next.players[I]!.decisions!.repayments).toBeUndefined();
      const memos = account(next, next.players[I]!.accounts.local).recent.map((x) => x.memo);
      expect(memos).toContain('Life: A friend needs a loan: paid back');
      expect(moneyByCurrency(next)).toEqual(money0);
      expect(cash(next, I)).not.toBe(before);
    }
    expect(outcomes).toEqual(new Set([true, false]));
  });

  it('unanswered, it takes the default at the next settlement', () => {
    const { w, ev } = force(gated(), 'life-food-poisoning');
    const health0 = barsOf(w.players[F]!).health;
    const next = settle(w, 'lagos', 1);
    const done = next.players[F]!.decisions!.events.find((e) => e.id === ev!.id)!;
    expect(done.status).toBe('defaulted');
    expect(done.choiceId).toBe('push');
    expect(done.result!.bars.health).toBeLessThan(0);
    expect(barsOf(next.players[F]!).health).toBeLessThan(health0);
  });

  it('a company effect reaches the company (a founder’s ill colleague)', () => {
    const w0 = edit(gated(), (d) => {
      const c = d.companies[d.players[F]!.companyIds[0]!]!;
      if (!c.staff.length)
        c.staff.push({ id: 'st1', name: 'Bola', salary: 100_000_00, morale: 60 } as never);
    });
    const { w, ev } = force(w0, 'life-staff-ill');
    expect(ev!.companyId).not.toBeNull();
    const money0 = moneyByCurrency(w);
    const r = choose(w, ev!.id, 'leave');
    expect(moneyByCurrency(r.world)).toEqual(money0);
    const c = r.world.companies[ev!.companyId!]!;
    const s = c.staff.find((x) => x.name === ev!.vars.name)!;
    expect(s.morale).toBeGreaterThan(0);
  });

  it('validates: yours, open, in time, a real choice, and affordable', () => {
    const { w, ev } = force(gated(), 'life-wedding');
    const err = (r: ReturnType<typeof tryRun>) => (r.ok ? null : r.error.code);
    expect(err(tryRun(w, I, { type: 'event.choose', eventId: ev!.id, choiceId: 'go' }))).toBe(
      'decision.none',
    );
    expect(err(tryRun(w, F, { type: 'event.choose', eventId: ev!.id, choiceId: 'nope' }))).toBe(
      'decision.choice',
    );
    const broke = edit(w, (d) => {
      d.accounts[d.players[F]!.accounts.local]!.balance = 0;
    });
    expect(err(tryRun(broke, F, { type: 'event.choose', eventId: ev!.id, choiceId: 'go' }))).toBe(
      'decision.blocked',
    );
    const once = choose(w, ev!.id, 'no').world;
    expect(err(tryRun(once, F, { type: 'event.choose', eventId: ev!.id, choiceId: 'gift' }))).toBe(
      'decision.done',
    );
    const late = edit(w, (d) => {
      d.markets.lagos!.month += 1;
    });
    expect(err(tryRun(late, F, { type: 'event.choose', eventId: ev!.id, choiceId: 'gift' }))).toBe(
      'decision.late',
    );
  });

  it('the view marks life events and carries the card’s picture and text', () => {
    const view = playerView(force(force(gated(), 'life-coffee').w, 'life-festival').w, F)!;
    const life = view.decisions.open.filter((e) => e.life);
    expect(life.length).toBe(2);
    expect(life[0]!.emoji).toBeTruthy();
    expect(life[0]!.raw.title).toBeTruthy();
    expect(life[0]!.monthsLeft).toBe(0);
  });
});
