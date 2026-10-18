/**
 * Phase 5: life events. BitLife-style cards: now and then something happens
 * in your life, and you choose what to do about it.
 *
 * Every human player gets them (founders, investors, bankers alike; there is
 * one life per player, no restarts). At each month's settlement a player may
 * meet one event, sometimes two, never more than `LIFE_EVENTS.maxOpen` open
 * at once. Which one is drawn from those whose condition holds right now
 * (you rent, you have a car, you're stressed, your city has a gym, you have
 * enough saved to lend…), on the player's own stream
 * `deriveRng(seed, 'life', 'event', playerId, month)`.
 *
 * A life event is an ordinary decision event (`DecisionEvent` with
 * `life: true`) in the player's decisions list, so it is answered with the
 * same `event.choose` command, shown in `view.decisions`, and resolved to its
 * default at the next settlement if left unanswered (decisions.ts). Its
 * effects are fixed in numbers when it appears and shown before choosing:
 * the life bars through the lifebars helpers, money through the ledger (paid
 * to or from the city's outside accounts: suppliers, gigs, the tax office,
 * or `lifestyle` for friends and family outside the game), a few company
 * effects for founders. A "could go well or badly" choice rolls at answer
 * time on `deriveRng(seed, 'life', 'choose', playerId, eventId)`.
 *
 * Replay safety: nothing here runs unless the world logged the life-bars
 * release note (`lifeBarsOn`), so older command logs replay identically.
 */
import {
  LIFE_EVENTS,
  LIFE_EVENT_TEMPLATES,
  type LifeEventTemplateData,
} from './data/lifeevents.js';
import { MARKET_DATA, MARKET_IDS, type MarketId } from './data/markets.js';
import { isOpen } from './economy.js';
import { col, getMarket } from './helpers.js';
import { account, transfer } from './ledger.js';
import { SPORT_KINDS, happinessOf, healthOf, stressOf } from './lifebars.js';
import { scale } from './money.js';
import { lifeBarsOn } from './releases.js';
import { deriveRng, type Rng } from './rng.js';
import type {
  Company,
  DecisionChoice,
  DecisionEffect,
  DecisionEvent,
  Id,
  MarketState,
  Player,
  PlayerDecisions,
  World,
} from './types.js';

interface Ctx {
  world: World;
  p: Player;
  m: MarketState;
  month: number;
  rng: Rng;
  /** Your running company, if you founded one. */
  c: Company | undefined;
  /** Your local account balance (minor units). */
  cash: number;
}

interface Built {
  vars: Record<string, string | number>;
  choices: DecisionChoice[];
  companyId?: Id;
}

type Condition = (ctx: Ctx) => Built | null;

const ensureDecisions = (p: Player): PlayerDecisions =>
  (p.decisions ??= { seq: 0, events: [], cooldowns: {} });

/** Life events still waiting for an answer. */
export const openLifeEvents = (p: Player): DecisionEvent[] =>
  (p.decisions?.events ?? []).filter((e) => e.life && e.status === 'open');

function companyOf(world: World, p: Player): Company | undefined {
  return p.companyIds
    .map((id) => world.companies[id])
    .find((c) => c && c.status === 'active' && c.founderIds.includes(p.id));
}

// Effect shorthands. `pay(x)`: x months of the city's cost of living, from you.
const E = {
  pay: (
    m: MarketState,
    x: number,
    to: 'suppliers' | 'lifestyle' = 'suppliers',
  ): DecisionEffect => ({
    kind: 'cash',
    from: 'personal',
    to,
    amount: scale(col(m), x),
  }),
  hours: (n: number): DecisionEffect => ({ kind: 'hours', n }),
  energy: (n: number): DecisionEffect => ({ kind: 'energy', n }),
  health: (n: number): DecisionEffect => ({ kind: 'health', n }),
  stress: (n: number): DecisionEffect => ({ kind: 'stress', n }),
  happy: (n: number): DecisionEffect => ({ kind: 'happiness', n }),
  network: (n: number): DecisionEffect => ({ kind: 'network', n }),
  chance: (pct: number): DecisionEffect => ({ kind: 'chance', pct }),
};

// ---------------------------------------------------------------- Conditions and effects

/** Each template's condition (null: it can't happen to you now) and its choices' numbers. */
const CONDITIONS: Record<string, Condition> = {
  // ---- health
  'life-food-poisoning': ({ p, m }) =>
    healthOf(p) <= LIFE_EVENTS.sickHealth
      ? null
      : {
          vars: {},
          choices: [
            { id: 'doctor', effects: [E.pay(m, 0.05), E.health(-3), E.energy(-5)] },
            { id: 'rest', effects: [E.hours(8), E.health(-4), E.stress(-2)] },
            { id: 'push', effects: [E.health(-10), E.energy(-15), E.stress(4)] },
          ],
        },
  'life-burnout': ({ p, m }) =>
    stressOf(p) < LIFE_EVENTS.burnoutStress && !p.burnout
      ? null
      : {
          vars: {},
          choices: [
            {
              id: 'weekend',
              effects: [E.hours(16), E.stress(-20), E.energy(15), E.happy(5)],
            },
            { id: 'counsellor', effects: [E.pay(m, 0.1), E.hours(2), E.stress(-12)] },
            { id: 'push', effects: [E.stress(8), E.health(-5)] },
          ],
        },
  'life-gym': ({ m, rng }) => {
    // Only in a city that has a gym (or a sports venue) open.
    const gyms = Object.values(m.businesses ?? {})
      .filter((b) => SPORT_KINDS.includes(b.kind) && isOpen(b))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    if (!gyms.length) return null;
    return {
      vars: { place: rng.pick(gyms).name },
      choices: [
        { id: 'join', effects: [E.hours(8), E.health(8), E.stress(-6), E.energy(-6)] },
        { id: 'once', effects: [E.hours(2), E.health(2), E.stress(-1)] },
        { id: 'skip', effects: [] },
      ],
    };
  },
  'life-noisy-nights': ({ m }) => ({
    vars: {},
    choices: [
      { id: 'earplugs', effects: [E.pay(m, 0.01), E.energy(6), E.stress(-2)] },
      {
        id: 'talk',
        effects: [E.hours(1), E.chance(60), E.energy(8), E.stress(-3)],
        fail: [E.stress(6), E.happy(-3)],
      },
      { id: 'bear', effects: [E.energy(-10), E.stress(4)] },
    ],
  }),
  'life-charity-run': ({ p, m }) =>
    healthOf(p) < LIFE_EVENTS.runHealth
      ? null
      : {
          vars: {},
          choices: [
            {
              id: 'run',
              effects: [
                E.hours(4),
                E.pay(m, 0.02, 'lifestyle'),
                E.health(5),
                E.happy(6),
                E.energy(-10),
              ],
            },
            { id: 'donate', effects: [E.pay(m, 0.05, 'lifestyle'), E.happy(3)] },
            { id: 'skip', effects: [] },
          ],
        },
  // ---- money
  'life-rent-rise': ({ p, m }) => {
    // Only renters (Wave 10: no residence means you rent).
    if (p.residence) return null;
    const amount = scale(col(m), 0.15);
    return {
      vars: { amount },
      choices: [
        { id: 'pay', effects: [E.pay(m, 0.15), E.stress(3)] },
        {
          id: 'negotiate',
          effects: [E.hours(2), E.chance(50), E.stress(-2)],
          fail: [E.pay(m, 0.15), E.stress(6)],
        },
        { id: 'flatmate', effects: [E.hours(4), E.happy(5), E.stress(2)] },
      ],
    };
  },
  'life-friend-loan': ({ m, cash }) => {
    if (cash < scale(col(m), LIFE_EVENTS.loanCash)) return null;
    const amount = scale(col(m), 0.3);
    return {
      vars: { amount },
      choices: [
        {
          id: 'lend',
          effects: [
            E.pay(m, 0.3, 'lifestyle'),
            E.happy(4),
            E.chance(70),
            { kind: 'repay', amount, months: 1 },
          ],
          fail: [E.happy(-8), E.stress(4)],
        },
        { id: 'gift', effects: [E.pay(m, 0.1, 'lifestyle'), E.happy(3)] },
        { id: 'no', effects: [E.happy(-3)] },
      ],
    };
  },
  'life-tax-refund': ({ m }) => {
    const amount = scale(col(m), 0.15);
    const refund: DecisionEffect = { kind: 'income', from: 'tax', amount };
    return {
      vars: { amount },
      choices: [
        { id: 'save', effects: [refund, E.stress(-2)] },
        { id: 'treat', effects: [refund, E.pay(m, 0.15), E.happy(8), E.stress(-3)] },
      ],
    };
  },
  'life-parking-fine': ({ p, m }) =>
    !p.car
      ? null
      : {
          vars: {},
          choices: [
            { id: 'pay', effects: [E.pay(m, 0.05), E.stress(1)] },
            {
              id: 'appeal',
              effects: [E.hours(3), E.chance(50), E.stress(-2)],
              fail: [E.pay(m, 0.08), E.stress(5)],
            },
          ],
        },
  // ---- social
  'life-wedding': ({ p, m, rng, cash }) => {
    if (cash < scale(col(m), LIFE_EVENTS.weddingCash)) return null;
    // Any other city in the game, open to players or not.
    const city = MARKET_DATA[rng.pick(MARKET_IDS.filter((id) => id !== p.market))].name;
    return {
      vars: { city },
      choices: [
        {
          id: 'go',
          effects: [
            E.pay(m, 0.4),
            E.hours(12),
            E.happy(15),
            E.stress(-5),
            E.energy(-10),
            E.network(1),
          ],
        },
        { id: 'gift', effects: [E.pay(m, 0.08), E.happy(3)] },
        { id: 'no', effects: [E.happy(-4)] },
      ],
    };
  },
  'life-family-visit': ({ m }) => ({
    vars: {},
    choices: [
      { id: 'host', effects: [E.pay(m, 0.1), E.hours(8), E.happy(12), E.stress(3)] },
      { id: 'call', effects: [E.hours(1), E.happy(4)] },
      { id: 'later', effects: [E.happy(-5)] },
    ],
  }),
  'life-neighbour': ({ m }) => ({
    vars: {},
    choices: [
      { id: 'tea', effects: [E.pay(m, 0.01), E.hours(2), E.happy(6), E.network(1)] },
      { id: 'wave', effects: [] },
    ],
  }),
  // ---- work
  'life-cofounder': ({ c }) =>
    c
      ? null
      : {
          vars: {},
          choices: [
            { id: 'yes', effects: [E.hours(10), E.happy(6), E.stress(6), E.network(3)] },
            { id: 'no', effects: [E.happy(-2)] },
            {
              id: 'equity',
              effects: [E.hours(4), E.chance(50), E.happy(8), E.network(4)],
              fail: [E.happy(-6), E.stress(4)],
            },
          ],
        },
  'life-journalist': ({ m, c }) => {
    // A founder's quote moves the company's rating too.
    const stars = (n: number): DecisionEffect[] => (c ? [{ kind: 'stars', n }] : []);
    return {
      vars: { city: m.data.name },
      ...(c ? { companyId: c.id } : {}),
      choices: [
        {
          id: 'bold',
          effects: [E.chance(60), E.happy(5), E.network(3), ...stars(0.1)],
          fail: [E.stress(8), E.happy(-4), ...stars(-0.05)],
        },
        { id: 'careful', effects: [E.hours(1), E.stress(-1), E.network(1), ...stars(0.03)] },
        { id: 'decline', effects: [] },
      ],
    };
  },
  'life-laptop': ({ p, m, c }) =>
    !c && p.role !== 'founder'
      ? null
      : {
          vars: {},
          choices: [
            { id: 'new', effects: [E.pay(m, 0.4), E.stress(-2)] },
            {
              id: 'repair',
              effects: [E.pay(m, 0.12), E.chance(60), E.stress(-1)],
              fail: [E.stress(8), E.energy(-5)],
            },
            { id: 'borrow', effects: [E.stress(6), E.energy(-5)] },
          ],
        },
  'life-job-offer': ({ m }) => {
    const amount = scale(col(m), 1.2);
    return {
      vars: { amount },
      choices: [
        {
          id: 'contract',
          effects: [
            E.hours(20),
            { kind: 'income', from: 'gigs', amount },
            E.stress(8),
            E.energy(-10),
          ],
        },
        { id: 'keep', effects: [E.network(2), E.happy(2)] },
        { id: 'no', effects: [] },
      ],
    };
  },
  'life-coffee': ({ m }) => ({
    vars: { city: m.data.name },
    choices: [
      { id: 'go', effects: [E.hours(2), E.network(3), E.happy(3)] },
      { id: 'later', effects: [] },
    ],
  }),
  'life-staff-ill': ({ world, c, rng }) => {
    if (!c || !c.staff.length) return null;
    const s = rng.pick(c.staff.slice().sort((a, b) => (a.id < b.id ? -1 : 1)));
    const m = getMarket(world, c.market);
    return {
      companyId: c.id,
      vars: { name: s.name, company: c.name },
      choices: [
        { id: 'cover', effects: [E.hours(10), E.stress(6), { kind: 'morale', n: 4 }] },
        {
          id: 'leave',
          effects: [
            {
              kind: 'cash',
              from: 'company',
              to: 'payroll',
              amount: Math.max(1, Math.round(Math.min(s.salary, scale(col(m), 1)) * 0.25)),
            },
            { kind: 'morale', n: 8, staffId: s.id, name: s.name },
            E.stress(-1),
          ],
        },
        {
          id: 'slide',
          effects: [{ kind: 'morale', n: -6, staffId: s.id, name: s.name }, E.stress(2)],
        },
      ],
    };
  },
  // ---- city
  'life-power-cut': ({ m }) => ({
    vars: {},
    choices: [
      { id: 'cafe', effects: [E.pay(m, 0.03), E.hours(1), E.happy(2), E.stress(-1)] },
      { id: 'battery', effects: [E.pay(m, 0.15), E.stress(-3)] },
      { id: 'wait', effects: [E.energy(-5), E.stress(4)] },
    ],
  }),
  'life-festival': ({ p, m }) =>
    happinessOf(p) >= LIFE_EVENTS.festivalHappiness
      ? null
      : {
          vars: { city: m.data.name },
          choices: [
            {
              id: 'go',
              effects: [E.pay(m, 0.03), E.hours(4), E.happy(12), E.stress(-6), E.energy(-4)],
            },
            { id: 'stay', effects: [] },
          ],
        },
  'life-phone-stolen': ({ m, cash }) =>
    cash < scale(col(m), LIFE_EVENTS.phoneCash)
      ? null
      : {
          vars: {},
          choices: [
            { id: 'new', effects: [E.pay(m, 0.3), E.stress(3)] },
            { id: 'used', effects: [E.pay(m, 0.1), E.stress(5)] },
            { id: 'without', effects: [E.stress(8), E.happy(-4)] },
          ],
        },
  'life-car-breakdown': ({ p, m }) =>
    !p.car
      ? null
      : {
          vars: {},
          choices: [
            { id: 'garage', effects: [E.pay(m, 0.3), E.stress(2)] },
            {
              id: 'cheap',
              effects: [E.pay(m, 0.1), E.chance(50), E.stress(-1)],
              fail: [E.stress(6), E.energy(-6)],
            },
            { id: 'bus', effects: [E.energy(-8), E.stress(5)] },
          ],
        },
};

/** Every template's condition, for tests (a template without one never fires). */
export const LIFE_EVENT_IDS = Object.keys(CONDITIONS);

// ---------------------------------------------------------------- Drawing

const cooldownKey = (id: string) => `life:${id}`;

function contextFor(world: World, p: Player, month: number, rng: Rng): Ctx {
  const m = getMarket(world, p.market);
  return {
    world,
    p,
    m,
    month,
    rng,
    c: companyOf(world, p),
    cash: account(world, p.accounts.local).balance,
  };
}

function create(ctx: Ctx, t: LifeEventTemplateData, built: Built): DecisionEvent {
  const d = ensureDecisions(ctx.p);
  d.seq += 1;
  const ev: DecisionEvent = {
    id: `ev${d.seq}`,
    template: t.id,
    family: t.family,
    companyId: built.companyId ?? null,
    market: ctx.m.id,
    month: ctx.month,
    deadline: ctx.month + t.deadline,
    vars: built.vars,
    choices: built.choices,
    defaultChoice: t.defaultChoice,
    status: 'open',
    life: true,
  };
  d.events.unshift(ev);
  d.cooldowns[cooldownKey(t.id)] = ctx.month + t.cooldown;
  // Keep the record short: the last few answered life events.
  const resolved = d.events.filter((e) => e.life && e.status !== 'open');
  if (resolved.length > LIFE_EVENTS_KEEP) {
    const drop = new Set(resolved.slice(LIFE_EVENTS_KEEP).map((e) => e.id));
    d.events = d.events.filter((e) => !drop.has(e.id));
  }
  return ev;
}

/** Answered life events kept for the record. */
const LIFE_EVENTS_KEEP = 10;

/** One life event for `p` this month, if one can happen to them now. */
function drawOne(world: World, p: Player, month: number, rng: Rng): DecisionEvent | null {
  const d = ensureDecisions(p);
  const ctx = contextFor(world, p, month, rng);
  const busy = new Set(openLifeEvents(p).map((e) => e.template));
  const eligible: { t: LifeEventTemplateData; built: Built }[] = [];
  for (const t of LIFE_EVENT_TEMPLATES) {
    if (busy.has(t.id) || (d.cooldowns[cooldownKey(t.id)] ?? -Infinity) > month) continue;
    const built = CONDITIONS[t.id]?.(ctx);
    if (built) eligible.push({ t, built });
  }
  const total = eligible.reduce((a, x) => a + x.t.weight, 0);
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (const x of eligible) {
    if (roll < x.t.weight) return create(ctx, x.t, x.built);
    roll -= x.t.weight;
  }
  const last = eligible[eligible.length - 1]!;
  return create(ctx, last.t, last.built);
}

/**
 * Monthly, in life-bars worlds only, after decision events have settled (so
 * last month's unanswered life events have already taken their default):
 * loans friends promised to pay back come in, then each human living in
 * this city may meet one new life event, sometimes two, up to the cap.
 * Players who've been away (warned for inactivity) get none.
 */
export function settleLifeEvents(world: World, market: MarketId, month: number) {
  if (!lifeBarsOn(world)) return;
  const m = getMarket(world, market);
  const humans = Object.values(world.players)
    .filter((p) => !p.ai && p.market === market)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const p of humans) {
    const d = p.decisions;
    if (d?.repayments?.length) {
      const due = d.repayments.filter((r) => r.market === market && r.due <= month);
      d.repayments = d.repayments.filter((r) => !due.includes(r));
      for (const r of due)
        transfer(world, m.ext.lifestyle, p.accounts.local, r.amount, r.memo, month);
      if (!d.repayments.length) delete d.repayments;
    }
    if (p.inactivity.warned) continue;
    const rng = deriveRng(world.seed, 'life', 'event', p.id, month);
    for (const chance of [LIFE_EVENTS.firstChance, LIFE_EVENTS.secondChance]) {
      if (openLifeEvents(p).length >= LIFE_EVENTS.maxOpen) break;
      if (!rng.chance(chance)) break;
      drawOne(world, p, month, rng);
    }
  }
}

/**
 * Tests and dev tools: create one life event for a player now, if its
 * condition holds (no dice, no cooldown, no cap). Null when it can't happen.
 */
export function forceLifeEvent(
  world: World,
  playerId: Id,
  templateId: string,
): DecisionEvent | null {
  const p = world.players[playerId];
  const t = LIFE_EVENT_TEMPLATES.find((x) => x.id === templateId);
  if (!p || p.ai || !t) return null;
  const month = getMarket(world, p.market).month;
  const rng = deriveRng(world.seed, 'life', 'force', playerId, templateId, month);
  const ctx = contextFor(world, p, month, rng);
  const built = CONDITIONS[t.id]?.(ctx);
  return built ? create(ctx, t, built) : null;
}
