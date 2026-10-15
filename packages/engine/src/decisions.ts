/**
 * Decision events (Founder Journey 4a; blueprint §9.3, FR-018).
 *
 * At each settlement a founder may meet one situation per company (customer,
 * team, competition, finance) and one in their own life (social, life). Each
 * is triggered by the world as it is — a big prospect when product fit is
 * high, a stretched team, a rival's move, a short runway, a friend when you
 * have free time, a savings milestone — never at random out of nowhere.
 * Randomness only picks among what could happen, and how a chance choice
 * turns out, always from `deriveRng(seed, 'decisions', …)`.
 *
 * Every event offers 2–4 choices whose consequences are fixed in numbers when
 * it appears (cash, hours, morale, price…), so the founder sees exactly what
 * each costs before choosing. A choice is applied through the owning systems:
 * money through the ledger, deals through the sales pipeline, job posts
 * through hiring, founder loans through founder finance. An event left
 * unanswered resolves at the settlement after its deadline to its default,
 * which never spends hours or cash. Cooldowns stop the same thing coming back
 * again and again.
 *
 * Replay safety: nothing here runs in a world that hasn't logged the
 * journey-events release note (releases.ts). Event ids come from a per-player
 * counter, never the world's id counter.
 */
import { companyRunway } from './company.js';
import { reliability, segmentFit } from './customers.js';
import {
  DECISIONS,
  DECISION_TEMPLATES,
  decisionTemplate,
  type DecisionTemplateData,
} from './data/decisions.js';
import type { MarketId } from './data/markets.js';
import { ensure, fail } from './errors.js';
import { contribute } from './founderfinance.js';
import { HIRING, openRole, workloadOf } from './hiring.js';
import {
  adjustTrust,
  burn,
  col,
  getMarket,
  hoursLeft,
  lastPnl,
  spendHours,
  totalCustomers,
} from './helpers.js';
import { account, costIn, transfer, valueIn } from './ledger.js';
import { clamp, clamp01 } from './math.js';
import { formatMoney, scale, type Currency } from './money.js';
import { bumpNeed } from './needs.js';
import { journeyEventsOn } from './releases.js';
import { deriveRng } from './rng.js';
import type { Rng } from './rng.js';
import { RIVALS } from './rivals.js';
import { SALES, addEventDeal, eventLead, hasDealRoom, isOpenDeal } from './sales.js';
import { applyStarEvent } from './stars.js';
import { bandSalary, isOverloaded, removeStaff } from './staff.js';
import type {
  Company,
  DecisionChoice,
  DecisionEffect,
  DecisionEvent,
  Id,
  MarketState,
  Player,
  PlayerDecisions,
  Rival,
  RivalMove,
  SalesCustomer,
  World,
} from './types.js';

/** Money vars (minor units): the client formats these in the event's currency. */
export const MONEY_VARS = ['budget', 'salary', 'band', 'offer', 'burn', 'receivables', 'amount'];

const ensureDecisions = (p: Player): PlayerDecisions =>
  (p.decisions ??= { seq: 0, events: [], cooldowns: {} });

const openEvents = (p: Player) => (p.decisions?.events ?? []).filter((e) => e.status === 'open');

/** The first human founder answers for a company (co-founders see it too). */
function leadFounder(world: World, c: Company): Player | undefined {
  for (const id of c.founderIds) {
    const f = world.players[id];
    if (f && !f.ai) return f;
  }
  return undefined;
}

interface Ctx {
  world: World;
  p: Player;
  c: Company | null;
  m: MarketState;
  month: number;
  rng: Rng;
}

interface Built {
  vars: Record<string, string | number>;
  choices: DecisionChoice[];
  rivalId?: Id;
  customer?: SalesCustomer;
  dealId?: Id;
  /** A personal event about a company (backing it with savings). */
  companyId?: Id;
}

type Trigger = (
  ctx: Ctx & { c: Company },
  move?: { rival: Rival; move: RivalMove },
) => Built | null;
type PersonalTrigger = (ctx: Ctx) => Built | null;

const payroll = (c: Company) => c.staff.reduce((a, s) => a + s.salary, 0);
const receivables = (c: Company) => c.finance.receivables.reduce((a, r) => a + r.amount, 0);
const one = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- Company triggers

const COMPANY_TRIGGERS: Record<string, Trigger> = {
  'big-prospect': ({ world, c, rng }) => {
    const T = DECISIONS.bigProspect;
    if (c.product.fit <= 0 || !hasDealRoom(c)) return null;
    const keys = c.targetSegments.length ? c.targetSegments : Object.keys(c.segments);
    const fit = Math.max(0, ...keys.map((k) => segmentFit(c, k)));
    if (fit < T.fit) return null;
    const who = eventLead(world, c, rng, rng.range(T.budgetX[0], T.budgetX[1]));
    if (!who) return null;
    const m = getMarket(world, c.market);
    return {
      vars: {
        customer: who.name,
        contact: who.contact,
        company: c.name,
        budget: Math.round((who.budgetMin + who.budgetMax) / 2),
      },
      customer: who,
      choices: [
        {
          id: 'discount',
          effects: [{ kind: 'deal', stage: 'proposal', discountPct: 15, trust: 0.2 }],
        },
        {
          id: 'customise',
          effects: [
            { kind: 'hours', n: 8 },
            { kind: 'cash', from: 'company', to: 'suppliers', amount: scale(col(m), 0.3) },
            { kind: 'deal', stage: 'demo', discountPct: 0, trust: 0.3 },
          ],
        },
        { id: 'delay', effects: [{ kind: 'deal', stage: 'lead', discountPct: 0, trust: 0 }] },
        { id: 'decline', effects: [] },
      ],
    };
  },
  'unhappy-customers': ({ world, c }) => {
    const T = DECISIONS.unhappy;
    const rel = reliability(c);
    const n = totalCustomers(c);
    if (rel >= T.reliability || n < T.customers) return null;
    const m = getMarket(world, c.market);
    const credit = Math.max(scale(col(m), 0.05), Math.round((lastPnl(c)?.revenue ?? 0) * 0.1));
    return {
      vars: { company: c.name, reliability: Math.round(rel * 100), customers: n },
      choices: [
        {
          id: 'fix',
          effects: [
            { kind: 'hours', n: 10 },
            { kind: 'product', techDebt: -0.06, quality: 0.02 },
          ],
        },
        {
          id: 'credit',
          effects: [
            { kind: 'cash', from: 'company', to: 'customers', amount: credit },
            { kind: 'stars', n: 0.05 },
          ],
        },
        { id: 'apologise', effects: [{ kind: 'stars', n: -0.03 }] },
      ],
    };
  },
  'team-stretched': ({ world, c }) => {
    const T = DECISIONS.stretched;
    if (c.staff.length < 2 || c.hibernation) return null;
    const load = workloadOf(c);
    const busiest = c.staff.slice().sort((a, b) => (load[b.id] ?? 0) - (load[a.id] ?? 0))[0]!;
    const morale = Math.round(c.staff.reduce((a, s) => a + s.morale, 0) / c.staff.length);
    const top = load[busiest.id] ?? 0;
    if (top < T.workload && morale >= T.morale && !isOverloaded(c)) return null;
    const m = getMarket(world, c.market);
    return {
      vars: { company: c.name, name: busiest.name, workload: top, morale, role: busiest.role },
      choices: [
        {
          id: 'hire',
          effects: [{ kind: 'hire', role: busiest.role, cost: scale(col(m), HIRING.postingCol) }],
        },
        {
          id: 'reprioritise',
          effects: [
            { kind: 'morale', n: 6 },
            { kind: 'product', quality: -0.01 },
          ],
        },
        {
          id: 'reward',
          effects: [
            {
              kind: 'cash',
              from: 'company',
              to: 'payroll',
              amount: Math.max(1, Math.round(payroll(c) * 0.25)),
            },
            { kind: 'morale', n: 12 },
          ],
        },
        { id: 'ignore', effects: [{ kind: 'morale', n: -4 }] },
      ],
    };
  },
  'raise-request': ({ world, c, rng }) => {
    const T = DECISIONS.raise;
    const asking = c.staff.filter(
      (s) =>
        !s.cofounder &&
        s.morale < T.morale &&
        s.salary < bandSalary(world, c.market, s.role, s.seniority) * T.belowBand,
    );
    if (!asking.length) return null;
    const s = rng.pick(asking.sort((a, b) => (a.id < b.id ? -1 : 1)));
    const band = bandSalary(world, c.market, s.role, s.seniority);
    return {
      vars: { company: c.name, name: s.name, role: s.role, salary: s.salary, band },
      choices: [
        {
          id: 'raise',
          effects: [
            { kind: 'salary', staffId: s.id, name: s.name, amount: band },
            { kind: 'morale', n: 15, staffId: s.id, name: s.name },
          ],
        },
        {
          id: 'bonus',
          effects: [
            { kind: 'cash', from: 'company', to: 'payroll', amount: Math.round(s.salary * 0.5) },
            { kind: 'morale', n: 8, staffId: s.id, name: s.name },
          ],
        },
        { id: 'decline', effects: [{ kind: 'morale', n: -8, staffId: s.id, name: s.name }] },
      ],
    };
  },
  'rival-poach': ({ c }, rm) => {
    if (!rm || rm.move.kind !== 'poach' || rm.move.targetCompanyId !== c.id) return null;
    const s = c.staff.find((x) => x.id === rm.move.staffId);
    if (!s) return null;
    const leaves: DecisionEffect = { kind: 'staffLeaves', staffId: s.id, name: s.name };
    return {
      rivalId: rm.rival.id,
      vars: {
        company: c.name,
        rival: rm.rival.name,
        name: s.name,
        role: s.role,
        offer: Math.round(s.salary * 1.25),
      },
      choices: [
        {
          id: 'counter',
          effects: [
            { kind: 'salary', staffId: s.id, name: s.name, amount: Math.round(s.salary * 1.15) },
            { kind: 'morale', n: 10, staffId: s.id, name: s.name },
          ],
        },
        {
          id: 'talk',
          effects: [
            { kind: 'hours', n: 3 },
            { kind: 'chance', pct: 70 },
            { kind: 'morale', n: 6, staffId: s.id, name: s.name },
          ],
          fail: [leaves],
        },
        { id: 'let-go', effects: [leaves] },
        { id: 'leave-it', effects: [{ kind: 'chance', pct: 50 }], fail: [leaves] },
      ],
    };
  },
  'rival-price-cut': ({ world, c }, rm) => {
    if (!rm || rm.move.kind !== 'price_cut') return null;
    const m = getMarket(world, c.market);
    const pct = rm.move.pct ?? 10;
    return {
      rivalId: rm.rival.id,
      vars: {
        company: c.name,
        rival: rm.rival.name,
        pct,
        move: rm.move.text,
        ...(rm.move.amount ? { amount: rm.move.amount } : {}),
      },
      choices: [
        { id: 'match', effects: [{ kind: 'price', pct: -Math.min(pct, 15) }] },
        {
          id: 'product',
          effects: [
            { kind: 'hours', n: 6 },
            { kind: 'edge', months: 4, edge: 'product' },
          ],
        },
        {
          id: 'partner',
          effects: [
            { kind: 'cash', from: 'company', to: 'suppliers', amount: scale(col(m), 0.5) },
            { kind: 'edge', months: 4, edge: 'partner' },
            { kind: 'stars', n: 0.05 },
          ],
        },
        { id: 'hold', effects: [{ kind: 'pressure', pct: one(pct * RIVALS.cutWeight) }] },
      ],
    };
  },
  'rival-raised': ({ world, c }, rm) => {
    if (!rm || rm.move.kind !== 'raise') return null;
    const m = getMarket(world, c.market);
    return {
      rivalId: rm.rival.id,
      vars: {
        company: c.name,
        rival: rm.rival.name,
        move: rm.move.text,
        amount: rm.move.amount ?? 0,
      },
      choices: [
        {
          id: 'speed',
          effects: [
            { kind: 'cash', from: 'company', to: 'suppliers', amount: scale(col(m), 0.6) },
            { kind: 'product', fit: 0.02, quality: 0.02 },
          ],
        },
        {
          id: 'niche',
          effects: [
            { kind: 'hours', n: 6 },
            { kind: 'product', fit: 0.03 },
          ],
        },
        { id: 'hold', effects: [] },
      ],
    };
  },
  'rival-launch': ({ c }, rm) => {
    if (!rm || rm.move.kind !== 'launch') return null;
    return {
      rivalId: rm.rival.id,
      vars: {
        company: c.name,
        rival: rm.rival.name,
        move: rm.move.text,
        feature: rm.move.detail ?? '',
      },
      choices: [
        {
          id: 'respond',
          effects: [
            { kind: 'hours', n: 8 },
            { kind: 'product', fit: 0.03 },
          ],
        },
        { id: 'price', effects: [{ kind: 'price', pct: -5 }] },
        { id: 'hold', effects: [{ kind: 'pressure', pct: one(RIVALS.productWeight * 100) }] },
      ],
    };
  },
  'rival-courting': ({ c, rng }, rm) => {
    if (!rm || rm.move.kind !== 'win_deal' || rm.move.targetCompanyId !== c.id) return null;
    const open = (c.deals ?? [])
      .filter((d) => isOpenDeal(d) && d.stage !== 'lead')
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    if (!open.length) return null;
    const d = rng.pick(open);
    return {
      rivalId: rm.rival.id,
      dealId: d.id,
      vars: { company: c.name, rival: rm.rival.name, customer: d.customer.name },
      choices: [
        { id: 'discount', effects: [{ kind: 'dealDiscount', dealId: d.id, pct: 10 }] },
        {
          id: 'visit',
          effects: [
            { kind: 'hours', n: 3 },
            { kind: 'dealTrust', dealId: d.id, n: 0.15 },
          ],
        },
        { id: 'ride', effects: [{ kind: 'dealTrust', dealId: d.id, n: -0.05 }] },
      ],
    };
  },
  'runway-low': ({ world, p, c }) => {
    const runway = companyRunway(world, c);
    const b = burn(c);
    const cash = account(world, c.account).balance;
    if (!(runway < DECISIONS.runway.months) || b <= 0 || cash <= 0 || c.hibernation) return null;
    const m = getMarket(world, c.market);
    const owed = receivables(c);
    const ccy = account(world, c.account).currency;
    const mine = account(world, p.accounts.local);
    const canLend = Math.round(valueIn(world, Math.floor(mine.balance * 0.5), mine.currency, ccy));
    const lend = Math.min(canLend, b * 2);
    const choices: DecisionChoice[] = [{ id: 'cut', effects: [{ kind: 'marketing', pct: -50 }] }];
    if (owed > 0)
      choices.push({
        id: 'collect',
        effects: [{ kind: 'collect', amount: owed, fee: Math.round(owed * 0.04) }],
      });
    if (lend >= scale(col(m), 0.1))
      choices.push({ id: 'loan', effects: [{ kind: 'loan', amount: lend }] });
    choices.push({ id: 'raise', effects: [] });
    return {
      vars: { company: c.name, months: one(Math.max(0, runway)), burn: b },
      choices,
    };
  },
  'slow-payers': ({ c }) => {
    const owed = receivables(c);
    const revenue = lastPnl(c)?.revenue ?? 0;
    if (owed <= 0 || revenue <= 0 || owed < revenue * DECISIONS.slowPayers.revenueX) return null;
    return {
      vars: { company: c.name, receivables: owed },
      choices: [
        {
          id: 'chase',
          effects: [
            { kind: 'hours', n: 4 },
            { kind: 'collect', amount: Math.round(owed / 3), fee: 0 },
          ],
        },
        {
          id: 'factor',
          effects: [{ kind: 'collect', amount: owed, fee: Math.round(owed * 0.04) }],
        },
        { id: 'wait', effects: [] },
      ],
    };
  },
};

/** Which rival move a competition (or poach) template answers. */
const MOVE_TEMPLATE: Record<string, string> = {
  poach: 'rival-poach',
  win_deal: 'rival-courting',
  price_cut: 'rival-price-cut',
  raise: 'rival-raised',
  launch: 'rival-launch',
};

// ---------------------------------------------------------------- Personal triggers

function friendOf(world: World, p: Player): Player | undefined {
  return Object.entries(p.trust)
    .filter(([id, v]) => v >= DECISIONS.friend.trust && id !== p.id && world.players[id])
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => world.players[id]!)[0];
}

function activeCompanyOf(world: World, p: Player): Company | undefined {
  return p.companyIds
    .map((id) => world.companies[id])
    .find((c) => c && c.status === 'active' && c.founderIds.includes(p.id));
}

const PERSONAL_TRIGGERS: Record<string, PersonalTrigger> = {
  'friend-invite': ({ world, p, m }) => {
    const f = friendOf(world, p);
    if (!f || hoursLeft(p) < DECISIONS.friend.hoursFree) return null;
    return {
      vars: { friend: f.name, hours: Math.floor(hoursLeft(p)) },
      choices: [
        {
          id: 'attend',
          effects: [
            { kind: 'hours', n: 4 },
            { kind: 'cash', from: 'personal', to: 'suppliers', amount: scale(col(m), 0.05) },
            { kind: 'trust', playerId: f.id, name: f.name, n: 0.1 },
            { kind: 'social', n: 20 },
            { kind: 'energy', n: 5 },
          ],
        },
        { id: 'reschedule', effects: [] },
        { id: 'decline', effects: [{ kind: 'trust', playerId: f.id, name: f.name, n: -0.03 }] },
      ],
    };
  },
  'peer-dinner': ({ p, m }) => {
    if (hoursLeft(p) < DECISIONS.dinner.hoursFree) return null;
    return {
      vars: { city: m.data.name },
      choices: [
        {
          id: 'go',
          effects: [
            { kind: 'hours', n: 3 },
            { kind: 'cash', from: 'personal', to: 'suppliers', amount: scale(col(m), 0.08) },
            { kind: 'network', n: 2 },
            { kind: 'social', n: 10 },
          ],
        },
        { id: 'skip', effects: [] },
      ],
    };
  },
  'wealth-milestone': ({ world, p, m }) => {
    const mine = account(world, p.accounts.local);
    const cd = ensureDecisions(p).cooldowns;
    const tiers = DECISIONS.wealth.colMonths;
    let tier = -1;
    for (let i = 0; i < tiers.length; i++)
      if (mine.balance >= scale(col(m), tiers[i]!) && cd[`wealth:${i}`] === undefined) tier = i;
    if (tier < 0) return null;
    const c = activeCompanyOf(world, p);
    const choices: DecisionChoice[] = [
      {
        id: 'trip',
        effects: [
          { kind: 'cash', from: 'personal', to: 'suppliers', amount: col(m) },
          { kind: 'energy', n: 20 },
          { kind: 'social', n: 10 },
        ],
      },
    ];
    if (c) {
      const ccy = account(world, c.account).currency;
      const amount = Math.round(valueIn(world, Math.floor(mine.balance * 0.2), mine.currency, ccy));
      if (amount > 0) choices.push({ id: 'invest', effects: [{ kind: 'loan', amount }] });
    }
    choices.push({ id: 'save', effects: [] });
    return {
      vars: { amount: scale(col(m), tiers[tier]!), tier },
      choices,
      ...(c && choices.some((x) => x.id === 'invest') ? { companyId: c.id } : {}),
    };
  },
  'home-milestone': ({ p, m }) => {
    if (!p.residence) return null;
    return {
      vars: {},
      choices: [
        {
          id: 'host',
          effects: [
            { kind: 'cash', from: 'personal', to: 'suppliers', amount: scale(col(m), 0.3) },
            { kind: 'hours', n: 4 },
            { kind: 'social', n: 25 },
            { kind: 'network', n: 1 },
          ],
        },
        { id: 'later', effects: [] },
      ],
    };
  },
};

// ---------------------------------------------------------------- Creating events

function cooledDown(d: PlayerDecisions, key: string, month: number) {
  return (d.cooldowns[key] ?? -Infinity) <= month;
}

function create(ctx: Ctx, t: DecisionTemplateData, built: Built): DecisionEvent {
  const d = ensureDecisions(ctx.p);
  d.seq += 1;
  const ev: DecisionEvent = {
    id: `ev${d.seq}`,
    template: t.id,
    family: t.family,
    companyId: built.companyId ?? ctx.c?.id ?? null,
    market: ctx.m.id,
    month: ctx.month,
    deadline: ctx.month + t.deadline,
    vars: built.vars,
    choices: built.choices,
    defaultChoice: t.defaultChoice,
    status: 'open',
    ...(built.rivalId ? { rivalId: built.rivalId } : {}),
    ...(built.customer ? { customer: built.customer } : {}),
    ...(built.dealId ? { dealId: built.dealId } : {}),
  };
  d.events.unshift(ev);
  d.cooldowns[cooldownKey(t.id, ctx.c)] = ctx.month + t.cooldown;
  d.cooldowns[`family:${t.family}`] = ctx.month + DECISIONS.familyCooldown;
  if (t.id === 'wealth-milestone') d.cooldowns[`wealth:${built.vars.tier}`] = ctx.month;
  // Forget the oldest answered ones.
  const resolved = d.events.filter((e) => e.status !== 'open');
  if (resolved.length > DECISIONS.keepResolved) {
    const drop = new Set(resolved.slice(DECISIONS.keepResolved).map((e) => e.id));
    d.events = d.events.filter((e) => !drop.has(e.id));
  }
  return ev;
}

const cooldownKey = (template: string, c: Company | null) => (c ? `${template}:${c.id}` : template);

function weightedPick<T extends { t: DecisionTemplateData }>(rng: Rng, list: T[]): T | undefined {
  const total = list.reduce((a, x) => a + x.t.weight, 0);
  if (total <= 0) return undefined;
  let roll = rng.next() * total;
  for (const x of list) {
    if (roll < x.t.weight) return x;
    roll -= x.t.weight;
  }
  return list[list.length - 1];
}

/** One company event this month, if anything calls for it. */
function companyEvent(world: World, p: Player, c: Company, month: number): DecisionEvent | null {
  const d = ensureDecisions(p);
  if (openEvents(p).length >= DECISIONS.maxOpen) return null;
  const m = getMarket(world, c.market);
  const rng = deriveRng(world.seed, 'decisions', c.id, month);
  const ctx = { world, p, c, m, month, rng };
  const busy = new Set(openEvents(p).map((e) => `${e.template}:${e.companyId}`));
  const allowed = (t: DecisionTemplateData) =>
    !busy.has(`${t.id}:${c.id}`) && cooledDown(d, cooldownKey(t.id, c), month);
  // A rival's move this month always gets an answer (if not on cooldown).
  const moves = (m.rivals?.[c.industry] ?? [])
    .filter((r) => r.status === 'active')
    .flatMap((r) => r.moves.filter((x) => x.month === month).map((move) => ({ rival: r, move })));
  const order = ['poach', 'win_deal', 'price_cut', 'raise', 'launch'];
  moves.sort((a, b) => order.indexOf(a.move.kind) - order.indexOf(b.move.kind));
  for (const rm of moves) {
    const t = decisionTemplate(MOVE_TEMPLATE[rm.move.kind] ?? '');
    if (!t || !allowed(t)) continue;
    const built = COMPANY_TRIGGERS[t.id]!(ctx, rm);
    if (built) return create(ctx, t, built);
  }
  // Otherwise, now and then, whatever the company's state calls for.
  if (!rng.chance(DECISIONS.fireChance)) return null;
  const eligible: { t: DecisionTemplateData; built: Built }[] = [];
  for (const t of DECISION_TEMPLATES) {
    if (t.family === 'social' || t.family === 'life') continue;
    if (Object.values(MOVE_TEMPLATE).includes(t.id)) continue;
    if (!allowed(t) || !cooledDown(d, `family:${t.family}`, month)) continue;
    const built = COMPANY_TRIGGERS[t.id]?.(ctx);
    if (built) eligible.push({ t, built });
  }
  const pick = weightedPick(rng, eligible);
  return pick ? create(ctx, pick.t, pick.built) : null;
}

/** One social or life event this month, now and then. */
function personalEvent(world: World, p: Player, month: number): DecisionEvent | null {
  const d = ensureDecisions(p);
  const m = getMarket(world, p.market);
  // Savings you already had when events began aren't a milestone: only new ones are.
  if (d.cooldowns['wealth:base'] === undefined) {
    d.cooldowns['wealth:base'] = month;
    const balance = account(world, p.accounts.local).balance;
    DECISIONS.wealth.colMonths.forEach((n, i) => {
      if (balance >= scale(col(m), n)) d.cooldowns[`wealth:${i}`] = month;
    });
  }
  if (openEvents(p).length >= DECISIONS.maxOpen) return null;
  const rng = deriveRng(world.seed, 'decisions', p.id, month);
  if (!rng.chance(DECISIONS.fireChance)) return null;
  const ctx: Ctx = { world, p, c: null, m, month, rng };
  const busy = new Set(openEvents(p).map((e) => e.template));
  const eligible: { t: DecisionTemplateData; built: Built }[] = [];
  for (const t of DECISION_TEMPLATES) {
    if (t.family !== 'social' && t.family !== 'life') continue;
    if (
      busy.has(t.id) ||
      !cooledDown(d, t.id, month) ||
      !cooledDown(d, `family:${t.family}`, month)
    )
      continue;
    const built = PERSONAL_TRIGGERS[t.id]?.(ctx);
    if (built) eligible.push({ t, built });
  }
  const pick = weightedPick(rng, eligible);
  return pick ? create(ctx, pick.t, pick.built) : null;
}

/**
 * Tests and tools: create an event from one template now, if its trigger
 * holds (no dice, no cooldowns). Rival templates need the rival's move.
 */
export function forceDecision(
  world: World,
  playerId: Id,
  templateId: string,
  opts: { companyId?: Id; move?: { rival: Rival; move: RivalMove } } = {},
): DecisionEvent | null {
  const p = world.players[playerId];
  const t = decisionTemplate(templateId);
  if (!p || !t) return null;
  const c = opts.companyId
    ? world.companies[opts.companyId]
    : t.family === 'social' || t.family === 'life'
      ? undefined
      : activeCompanyOf(world, p);
  const m = getMarket(world, c?.market ?? p.market);
  const month = m.month;
  const rng = deriveRng(world.seed, 'decisions', 'force', playerId, templateId, month);
  if (c) {
    const built = COMPANY_TRIGGERS[t.id]?.({ world, p, c, m, month, rng }, opts.move);
    return built ? create({ world, p, c, m, month, rng }, t, built) : null;
  }
  const built = PERSONAL_TRIGGERS[t.id]?.({ world, p, c: null, m, month, rng });
  return built ? create({ world, p, c: null, m, month, rng }, t, built) : null;
}

// ---------------------------------------------------------------- Applying a choice

interface ApplyCtx {
  world: World;
  p: Player;
  c: Company | null;
  ev: DecisionEvent;
  month: number;
}

const staffOf = (c: Company | null, id: Id) => c?.staff.find((s) => s.id === id);
const dealOf = (c: Company | null, id: Id) => c?.deals?.find((d) => d.id === id && isOpenDeal(d));

/** Why this effect can't happen right now, or null. */
function effectBlocker(a: ApplyCtx, e: DecisionEffect): string | null {
  const { world, p, c } = a;
  const needsCompany = ![
    'hours',
    'trust',
    'energy',
    'social',
    'network',
    'chance',
    'pressure',
  ].includes(e.kind);
  if (needsCompany && e.kind !== 'cash' && (!c || c.status !== 'active'))
    return 'The company isn’t running any more.';
  switch (e.kind) {
    case 'cash': {
      const id = e.from === 'company' ? c?.account : p.accounts.local;
      if (!id) return 'The company isn’t running any more.';
      if (account(world, id).balance < e.amount)
        return e.from === 'company'
          ? 'Your company doesn’t have the cash for this.'
          : 'You don’t have that much in your account.';
      return null;
    }
    case 'hours':
      return hoursLeft(p) < e.n ? 'Not enough hours left this month.' : null;
    case 'salary':
    case 'staffLeaves':
      return staffOf(c, e.staffId) ? null : `${e.name} isn’t on the team any more.`;
    case 'morale':
      return e.staffId && !staffOf(c, e.staffId)
        ? `${e.name ?? 'They'} isn’t on the team any more.`
        : null;
    case 'deal':
      if (!a.ev.customer) return 'That customer has moved on.';
      return hasDealRoom(c!) ? null : 'Your pipeline is full. Close or drop a deal first.';
    case 'dealDiscount':
    case 'dealTrust':
      return dealOf(c, e.dealId) ? null : 'That deal is closed now.';
    case 'loan': {
      const mine = account(world, p.accounts.local);
      const cost = costIn(world, e.amount, account(world, c!.account).currency, mine.currency);
      return mine.balance < cost ? 'You don’t have that much in your account.' : null;
    }
    case 'collect':
      return receivables(c!) <= 0 ? 'There are no unpaid invoices now.' : null;
    case 'hire':
      if (c!.hibernation) return 'You can’t hire while the company hibernates.';
      return (c!.hiring?.roles ?? []).filter((r) => r.status === 'open').length >=
        HIRING.maxOpenRoles
        ? 'You have enough open roles. Fill or close one first.'
        : null;
    default:
      return null;
  }
}

function choiceBlocker(a: ApplyCtx, ch: DecisionChoice): string | null {
  for (const e of [...ch.effects, ...(ch.fail ?? [])]) {
    // Failure effects only need their target to exist (they never cost anything).
    const b = effectBlocker(a, e);
    if (b) return b;
  }
  return null;
}

function applyEffect(a: ApplyCtx, e: DecisionEffect) {
  const { world, p, month } = a;
  const c = a.c!;
  switch (e.kind) {
    case 'cash': {
      const label = `${
        decisionTemplate(a.ev.template)
          ?.title.replace(/\{.*?\}/g, '')
          .trim() || 'Decision'
      }`;
      if (e.from === 'company') {
        const m = getMarket(world, c.market);
        transfer(world, c.account, m.ext[e.to], e.amount, `Decision: ${label}`, month);
      } else {
        const m = getMarket(world, p.market);
        transfer(world, p.accounts.local, m.ext[e.to], e.amount, `Decision: ${label}`, month);
      }
      return;
    }
    case 'hours':
      spendHours(p, e.n, 'This');
      return;
    case 'morale':
      for (const s of c.staff)
        if (!e.staffId || s.id === e.staffId) s.morale = clamp(s.morale + e.n, 0, 100);
      return;
    case 'stars':
      applyStarEvent(c.stars, e.n);
      return;
    case 'price':
      c.price = Math.max(1, Math.round(c.price * (1 + e.pct / 100)));
      return;
    case 'marketing':
      c.marketingBudget = Math.max(0, Math.round(c.marketingBudget * (1 + e.pct / 100)));
      return;
    case 'salary':
      staffOf(c, e.staffId)!.salary = e.amount;
      return;
    case 'staffLeaves':
      removeStaff(c, e.staffId);
      return;
    case 'deal':
      addEventDeal(c, a.ev.customer!, {
        stage: e.stage,
        discountPct: e.discountPct,
        trust: e.trust,
        month,
        months: DECISIONS.bigProspect.deadlineMonths,
      });
      return;
    case 'dealDiscount': {
      const d = dealOf(c, e.dealId)!;
      d.discountPct = Math.min(SALES.maxDiscountPct, (d.discountPct ?? 0) + e.pct);
      return;
    }
    case 'dealTrust': {
      const d = dealOf(c, e.dealId)!;
      d.customer.trust = Math.round(clamp01(d.customer.trust + e.n) * 100) / 100;
      return;
    }
    case 'product':
      if (e.fit) c.product.fit = clamp01(c.product.fit + e.fit);
      if (e.quality) c.product.quality = clamp01(c.product.quality + e.quality);
      if (e.techDebt) c.product.techDebt = clamp01(c.product.techDebt + e.techDebt);
      return;
    case 'edge':
      c.rivalEdge = { until: month + e.months, kind: e.edge };
      return;
    case 'trust':
      adjustTrust(p, e.playerId, e.n);
      adjustTrust(world.players[e.playerId], p.id, e.n);
      return;
    case 'energy':
      p.energy = clamp(p.energy + e.n, 0, 100);
      return;
    case 'social':
      bumpNeed(p, 'social', e.n);
      return;
    case 'network':
      p.network += e.n;
      return;
    case 'loan':
      contribute(world, p, c, e.amount, 'loan', month);
      return;
    case 'collect': {
      // A finance house (or your own chasing) brings invoices in early; any fee is written off.
      let left = Math.min(e.amount, receivables(c));
      const got = Math.max(0, left - e.fee);
      c.finance.receivables.sort((x, y) => x.due - y.due);
      for (const r of c.finance.receivables) {
        const take = Math.min(r.amount, left);
        r.amount -= take;
        left -= take;
        if (left <= 0) break;
      }
      c.finance.receivables = c.finance.receivables.filter((r) => r.amount > 0);
      const m = getMarket(world, c.market);
      transfer(world, m.ext.customers, c.account, got, 'Invoices collected early', month);
      return;
    }
    case 'hire':
      openRole(world, c, { role: e.role, salaryBand: 'market' }, month);
      return;
    default:
      return;
  }
}

/** Apply a choice: effects before a `chance` always, the rest on success, `fail` otherwise. */
function applyChoice(a: ApplyCtx, ch: DecisionChoice): boolean | undefined {
  const at = ch.effects.findIndex((e) => e.kind === 'chance');
  if (at < 0) {
    for (const e of ch.effects) applyEffect(a, e);
    return undefined;
  }
  for (const e of ch.effects.slice(0, at)) applyEffect(a, e);
  const pct = (ch.effects[at] as { pct: number }).pct;
  const rng = deriveRng(a.world.seed, 'decisions', 'choose', a.p.id, a.ev.id);
  const ok = rng.next() * 100 < pct;
  for (const e of ok ? ch.effects.slice(at + 1) : (ch.fail ?? [])) applyEffect(a, e);
  return ok;
}

function contextOf(world: World, p: Player, ev: DecisionEvent): ApplyCtx {
  const c = ev.companyId ? (world.companies[ev.companyId] ?? null) : null;
  return { world, p, c, ev, month: getMarket(world, ev.market).month };
}

/** `event.choose`: answer an open decision event. */
export function chooseDecision(world: World, me: Player, eventId: Id, choiceId: string) {
  const ev = me.decisions?.events.find((e) => e.id === eventId);
  ensure(ev, 'decision.none', 'That decision isn’t yours to make.');
  ensure(ev.status === 'open', 'decision.done', 'You’ve already decided that one.');
  const a = contextOf(world, me, ev);
  ensure(a.month <= ev.deadline, 'decision.late', 'Too late: that one has been decided for you.');
  if (ev.companyId)
    ensure(
      a.c && a.c.status === 'active',
      'decision.company',
      'The company isn’t running any more.',
    );
  const ch = ev.choices.find((x) => x.id === choiceId);
  ensure(ch, 'decision.choice', 'Pick one of the options.');
  const blocker = choiceBlocker(a, ch);
  if (blocker) fail('decision.blocked', blocker);
  const ok = applyChoice(a, ch);
  ev.status = 'chosen';
  ev.choiceId = ch.id;
  ev.resolvedMonth = a.month;
  if (ok !== undefined) ev.succeeded = ok;
  if (a.c) a.c.lastDecisionMonth = a.month;
  const t = decisionTemplate(ev.template);
  const label = t?.choices.find((x) => x.id === ch.id);
  return {
    eventId: ev.id,
    choiceId: ch.id,
    ...(ok !== undefined ? { succeeded: ok } : {}),
    message: label?.outcome ?? 'Done.',
  };
}

/** Unanswered past the deadline: the default (which costs no cash or hours), if it still applies. */
function resolveDefault(world: World, p: Player, ev: DecisionEvent) {
  const a = contextOf(world, p, ev);
  ev.status = 'defaulted';
  ev.choiceId = ev.defaultChoice;
  ev.resolvedMonth = a.month;
  const ch = ev.choices.find((x) => x.id === ev.defaultChoice);
  if (!ch) return;
  if (ev.companyId && (!a.c || a.c.status !== 'active')) return;
  if (choiceBlocker(a, ch)) return;
  const ok = applyChoice(a, ch);
  if (ok !== undefined) ev.succeeded = ok;
}

// ---------------------------------------------------------------- Settlement

/**
 * Monthly (journey-events worlds only), after companies and rivals settle:
 * overdue events take their default, then each founder may meet one new
 * company event per company here and, in their home city, one personal one.
 */
export function settleDecisions(world: World, market: MarketId, month: number) {
  if (!journeyEventsOn(world)) return;
  const humans = Object.values(world.players)
    .filter((p) => !p.ai)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const p of humans) {
    for (const ev of p.decisions?.events ?? [])
      if (ev.status === 'open' && ev.market === market && month > ev.deadline)
        resolveDefault(world, p, ev);
  }
  const companies = Object.values(world.companies)
    .filter((c) => c.market === market && c.status === 'active' && !c.ai)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const c of companies) {
    const p = leadFounder(world, c);
    if (p) companyEvent(world, p, c, month);
  }
  for (const p of humans) {
    if (p.market !== market) continue;
    const founder = p.role === 'founder' || activeCompanyOf(world, p);
    if (founder) personalEvent(world, p, month);
  }
}

// ---------------------------------------------------------------- View

function fill(text: string, vars: Record<string, string | number>, cur: Currency) {
  return text.replace(/\{(\w+)\}/g, (all, k: string) => {
    const v = vars[k];
    if (v === undefined) return all;
    return MONEY_VARS.includes(k) && typeof v === 'number' ? formatMoney(v, cur) : String(v);
  });
}

function eventView(world: World, p: Player, ev: DecisionEvent) {
  const t = decisionTemplate(ev.template);
  const a = contextOf(world, p, ev);
  const cur = account(world, a.c?.account ?? p.accounts.local).currency;
  const open = ev.status === 'open';
  return {
    id: ev.id,
    template: ev.template,
    family: ev.family,
    companyId: ev.companyId,
    companyName: a.c?.name ?? null,
    rivalId: ev.rivalId ?? null,
    month: ev.month,
    deadline: ev.deadline,
    /** 0: decide this month. */
    monthsLeft: open ? Math.max(0, ev.deadline - a.month) : null,
    currency: cur,
    vars: ev.vars,
    title: t ? fill(t.title, ev.vars, cur) : ev.template,
    body: t ? fill(t.body, ev.vars, cur) : '',
    status: ev.status,
    choiceId: ev.choiceId ?? null,
    succeeded: ev.succeeded ?? null,
    resolvedMonth: ev.resolvedMonth ?? null,
    choices: ev.choices.map((ch) => {
      const d = t?.choices.find((x) => x.id === ch.id);
      return {
        id: ch.id,
        label: d ? fill(d.label, ev.vars, cur) : ch.id,
        outcome: d ? fill(d.outcome, ev.vars, cur) : '',
        effects: ch.effects,
        fail: ch.fail ?? [],
        isDefault: ch.id === ev.defaultChoice,
        blocker: open ? choiceBlocker(a, ch) : null,
      };
    }),
  };
}

/** `view.decisions`: open events (soonest deadline first) and the last few answered. */
export function decisionsView(world: World, p: Player) {
  const all = p.decisions?.events ?? [];
  const open = all
    .filter((e) => e.status === 'open')
    .sort((a, b) => a.deadline - b.deadline || (a.id < b.id ? -1 : 1))
    .map((e) => eventView(world, p, e));
  const recent = all
    .filter((e) => e.status !== 'open')
    .slice(0, 5)
    .map((e) => eventView(world, p, e));
  return { on: journeyEventsOn(world), open, recent };
}

export type DecisionsView = ReturnType<typeof decisionsView>;
