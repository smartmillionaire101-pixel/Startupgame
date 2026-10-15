/**
 * Founder ambitions (blueprint §4.1 "set or select an ambition", §9.5
 * endgame paths, Phase 7 "alternate founder goals"): the run a player is
 * going for, chosen any time and changed any time.
 *
 * Seven paths: unicorn founder, profitable owner, serial founder, angel
 * investor, venture capitalist, lifestyle entrepreneur and philanthropist.
 * Each is a few steps measured from the world as it is (valuations, the
 * P&L, companies started and ended, positions, funds, homes, contacts,
 * gifts), like the journey's chapters: no command makes progress, real
 * play does. The chosen ambition's next steps lead the main objective.
 *
 * The only state kept is `Player.ambition` (which one, since when) and an
 * `ambition.<id>` milestone when the chosen one is reached. Recording takes
 * no world id, rolls no dice and moves no money, so replaying a command log
 * reaches the same world (plus the milestones).
 */
import { getMarket, INBOX_LIMIT } from './helpers.js';
import { ensure } from './errors.js';
import { contactWarmth } from './events.js';
import type { JourneyGo, JourneyStep } from './journey.js';
import { valueIn } from './ledger.js';
import type { Currency } from './money.js';
import { lifestyleCost } from './personal.js';
import { propertiesOf } from './property.js';
import type { Company, Id, Player, World } from './types.js';

export const AMBITION_IDS = [
  'unicorn',
  'profitable',
  'serial',
  'angel',
  'vc',
  'lifestyle',
  'philanthropist',
] as const;
export type AmbitionId = (typeof AMBITION_IDS)[number];

/** Every threshold in one place (money in US dollars, converted per city). */
export const AMBITION = {
  unicorn: { valuationUsd: 1_000_000_000 },
  profitable: { months: 6, livingMonths: 24 },
  serial: { companies: 3 },
  angel: { companies: 5 },
  vc: { companies: 5 },
  lifestyle: { contacts: 5, warmth: 0.5 },
  philanthropist: { givenUsd: 100_000, causes: 3 },
} as const;

/** What kind of life the ambition is about (§4.1: business, financial, social, lifestyle). */
export type AmbitionCategory = 'business' | 'financial' | 'social' | 'lifestyle';

export interface AmbitionOption {
  id: AmbitionId;
  title: string;
  story: string;
  category: AmbitionCategory;
  steps: JourneyStep[];
  done: boolean;
  /** Home-city month it was reached while chosen, or null. */
  reachedMonth: number | null;
}

export interface AmbitionView {
  /** The ambition you are going for, or null (none chosen yet). */
  chosen: AmbitionId | null;
  /** Home-city month it was chosen. */
  since: number | null;
  options: AmbitionOption[];
}

export const ambitionMilestone = (id: AmbitionId) => `ambition.${id}`;

/** Every human player can choose an ambition (investors and bankers too). */
export const hasAmbitions = (p: Player) => !p.ai;

// ---------------------------------------------------------------- facts

const step = (
  id: string,
  label: string,
  done: boolean,
  go: JourneyGo | null,
  extra: Partial<JourneyStep> = {},
): JourneyStep => ({ id, label, done, go, ...extra });

const count = (have: number, need: number) => ({ have: Math.min(have, need), need });

/** Money progress in the player's home currency (amounts in minor units). */
const money = (have: number, need: number, currency: Currency) => ({
  have: Math.max(0, Math.min(have, need)),
  need,
  currency,
});

const homeCurrency = (world: World, p: Player) => getMarket(world, p.market).data.currency;
const usdHome = (world: World, p: Player, usd: number) =>
  Math.round(usd * 100 * getMarket(world, p.market).data.unitsPerUsd);

/** Companies this player founded (any status). */
const founded = (world: World, p: Player): Company[] =>
  p.companyIds
    .map((id) => world.companies[id])
    .filter((c): c is Company => !!c && c.founderIds.includes(p.id));

/** Profitable months in a row, most recent first. */
function profitableStreak(c: Company): number {
  let n = 0;
  for (let i = c.finance.history.length - 1; i >= 0; i--) {
    const h = c.finance.history[i]!;
    if (h.net > 0 && h.revenue > 0) n++;
    else break;
  }
  return n;
}

/** Distinct companies in positions held by any of these investor ids. */
function backed(world: World, holders: Set<Id>): Set<Id> {
  const out = new Set<Id>();
  for (const x of Object.values(world.positions))
    if (holders.has(x.investorId) && x.invested > 0) out.add(x.companyId);
  return out;
}

const liquid = (world: World, p: Player) => {
  const cur = homeCurrency(world, p);
  const local = world.accounts[p.accounts.local]?.balance ?? 0;
  const usd = p.accounts.usd ? (world.accounts[p.accounts.usd]?.balance ?? 0) : 0;
  return local + valueIn(world, usd, 'USD', cur);
};

// ---------------------------------------------------------------- the paths

interface AmbitionDef {
  id: AmbitionId;
  title: string;
  story: string;
  category: AmbitionCategory;
  steps: (world: World, p: Player) => JourneyStep[];
}

const company = { kind: 'tab', tab: 'company' } as const;
const capital = { kind: 'app', app: 'capital' } as const;
const invest = { kind: 'app', app: 'invest' } as const;

export const AMBITIONS: AmbitionDef[] = [
  {
    id: 'unicorn',
    title: 'Unicorn founder',
    story: 'Build a company worth a billion dollars.',
    category: 'business',
    steps: (world, p) => {
      const mine = founded(world, p);
      const cur = homeCurrency(world, p);
      const need = usdHome(world, p, AMBITION.unicorn.valuationUsd);
      // The best mark any company you founded has reached, in your home currency.
      const best = mine.reduce(
        (a, c) =>
          Math.max(
            a,
            valueIn(
              world,
              c.capTable.lastPostMoney,
              getMarket(world, c.market).data.currency,
              cur,
            ),
          ),
        0,
      );
      return [
        step('unicorn.company', 'Start a company', mine.length > 0, company),
        step(
          'unicorn.valuation',
          'Reach a $1bn valuation',
          mine.length > 0 && best >= need,
          { kind: 'place', place: 'investors' },
          { progress: money(best, need, cur) },
        ),
      ];
    },
  },
  {
    id: 'profitable',
    title: 'Profitable owner',
    story: 'Run a business that pays its way, and never need a job again.',
    category: 'financial',
    steps: (world, p) => {
      const mine = founded(world, p).filter((c) => c.status === 'active');
      const months = AMBITION.profitable.months;
      const streak = mine.reduce((a, c) => Math.max(a, profitableStreak(c)), 0);
      const cur = homeCurrency(world, p);
      const need = lifestyleCost(world, p) * AMBITION.profitable.livingMonths;
      const have = liquid(world, p);
      return [
        step(
          'profitable.streak',
          `Be profitable ${months} months in a row`,
          streak >= months,
          company,
          { progress: count(streak, months) },
        ),
        step(
          'profitable.independent',
          `Save ${AMBITION.profitable.livingMonths} months of living costs`,
          have >= need,
          { kind: 'tab', tab: 'money' },
          { progress: money(have, need, cur) },
        ),
      ];
    },
  },
  {
    id: 'serial',
    title: 'Serial founder',
    story: 'Sell or close a venture, then start again with what you learned.',
    category: 'business',
    steps: (world, p) => {
      const mine = founded(world, p);
      const n = AMBITION.serial.companies;
      const ended = mine.filter((c) => c.status !== 'active');
      // Running a company started after one of yours ended: you came back.
      const firstEnd = ended.reduce((a, c) => Math.min(a, c.closedMonth ?? Infinity), Infinity);
      const again = mine.some(
        (c) => c.status === 'active' && Number.isFinite(firstEnd) && c.foundedMonth >= firstEnd,
      );
      return [
        step('serial.end', 'Sell or close a company', ended.length > 0, capital),
        step('serial.again', 'Start again after it ends', again || p.allocator?.serial !== undefined, capital),
        step(
          'serial.companies',
          `Found ${n} companies`,
          mine.length >= n,
          capital,
          { progress: count(mine.length, n) },
        ),
      ];
    },
  },
  {
    id: 'angel',
    title: 'Angel investor',
    story: 'Back founders with your own money and build a network.',
    category: 'financial',
    steps: (world, p) => {
      const n = AMBITION.angel.companies;
      const mine = new Set<Id>([p.id]);
      const companies = backed(world, mine);
      const returned = Object.values(world.positions).some(
        (x) => x.investorId === p.id && x.returned > 0,
      );
      return [
        step('angel.first', 'Invest in a startup', companies.size > 0, invest),
        step('angel.portfolio', `Back ${n} startups`, companies.size >= n, invest, {
          progress: count(companies.size, n),
        }),
        step('angel.return', 'Get money back from one', returned, invest),
      ];
    },
  },
  {
    id: 'vc',
    title: 'Venture capitalist',
    story: 'Raise a fund, build a portfolio and return money to your backers.',
    category: 'financial',
    steps: (world, p) => {
      const n = AMBITION.vc.companies;
      const funds = Object.values(world.funds).filter((f) => !f.ai && f.managerId === p.id);
      const companies = backed(world, new Set(funds.map((f) => f.id)));
      return [
        step(
          'vc.fund',
          'Raise a fund',
          funds.length > 0 || p.milestones['investor.fund-1'] !== undefined,
          invest,
        ),
        step('vc.portfolio', `Back ${n} companies from your fund`, companies.size >= n, invest, {
          progress: count(companies.size, n),
        }),
        step(
          'vc.distribute',
          'Return money to your investors',
          funds.some((f) => f.distributed > 0),
          invest,
        ),
      ];
    },
  },
  {
    id: 'lifestyle',
    title: 'Lifestyle entrepreneur',
    story: 'Freedom first: a home of your own, income that covers life, people who matter.',
    category: 'lifestyle',
    steps: (world, p) => {
      const month = getMarket(world, p.market).month;
      const home = Object.values(propertiesOf(world)).some((x) => x.ownerId === p.id);
      const cur = homeCurrency(world, p);
      const cost = lifestyleCost(world, p);
      // What your companies pay you each month, in your home currency.
      const salary = founded(world, p)
        .filter((c) => c.status === 'active')
        .reduce(
          (a, c) =>
            a + valueIn(world, c.founderSalary, getMarket(world, c.market).data.currency, cur),
          0,
        );
      const n = AMBITION.lifestyle.contacts;
      const close = (p.contacts ?? []).filter(
        (c) => contactWarmth(c, month) >= AMBITION.lifestyle.warmth,
      ).length;
      return [
        step('lifestyle.home', 'Own your home', home, { kind: 'app', app: 'homes' }),
        step(
          'lifestyle.income',
          'Pay yourself enough to cover your living costs',
          cost > 0 && salary >= cost,
          company,
          { progress: money(salary, cost, cur) },
        ),
        step(
          'lifestyle.people',
          `Keep ${n} close contacts`,
          close >= n,
          { kind: 'app', app: 'events' },
          { progress: count(close, n) },
        ),
      ];
    },
  },
  {
    id: 'philanthropist',
    title: 'Philanthropist',
    story: 'Put your wealth to work on causes, with outcomes you can measure.',
    category: 'social',
    steps: (world, p) => {
      const cur = homeCurrency(world, p);
      const pledges = p.allocator?.pledges ?? [];
      const given = pledges.reduce((a, x) => a + valueIn(world, x.amount, x.currency, cur), 0);
      const need = usdHome(world, p, AMBITION.philanthropist.givenUsd);
      const causes = new Set(pledges.map((x) => x.cause)).size;
      const n = AMBITION.philanthropist.causes;
      return [
        step('philanthropist.first', 'Give to a cause', pledges.length > 0, capital),
        step(
          'philanthropist.given',
          'Give $100k in total',
          given >= need,
          capital,
          { progress: money(given, need, cur) },
        ),
        step('philanthropist.causes', `Support ${n} different causes`, causes >= n, capital, {
          progress: count(causes, n),
        }),
      ];
    },
  },
];

/** The path's definition (undefined for an id this build doesn't know). */
const defOf = (id: AmbitionId) => AMBITIONS.find((a) => a.id === id);

/** Every path with its steps for this player (none for AI players). */
export function ambitionView(world: World, p: Player): AmbitionView | null {
  if (!hasAmbitions(p)) return null;
  const options = AMBITIONS.map((def): AmbitionOption => {
    const reached = p.milestones[ambitionMilestone(def.id)];
    const steps = def.steps(world, p);
    return {
      id: def.id,
      title: def.title,
      story: def.story,
      category: def.category,
      // Once reached, it stays reached (a valuation can fall, savings can be spent).
      steps: reached !== undefined ? steps.map((s) => ({ ...s, done: true })) : steps,
      done: reached !== undefined || steps.every((s) => s.done),
      reachedMonth: reached ?? null,
    };
  });
  return { chosen: p.ambition?.id ?? null, since: p.ambition?.since ?? null, options };
}

/** The chosen ambition's unfinished steps, for the main objective (empty when none or reached). */
export function ambitionSteps(world: World, p: Player): JourneyStep[] {
  const id = p.ambition?.id;
  if (!id || !hasAmbitions(p) || p.milestones[ambitionMilestone(id)] !== undefined) return [];
  return (defOf(id)?.steps(world, p) ?? []).filter((s) => !s.done);
}

// ---------------------------------------------------------------- state

/** Choose an ambition (`id` missing: go without one). Changing keeps reached milestones. */
export function chooseAmbition(p: Player, id: AmbitionId | undefined, month: number) {
  ensure(id === undefined || !!defOf(id), 'ambition.unknown', 'Pick one of the ambitions on offer.');
  if (id === undefined) delete p.ambition;
  else if (p.ambition?.id !== id) p.ambition = { id, since: month };
  return { ambition: p.ambition?.id ?? null };
}

/**
 * Record the chosen ambition as an `ambition.<id>` milestone once all its
 * steps are done, with one inbox note. Called with the journey's chapters:
 * after every command (for the player who issued it) and after a settlement.
 */
export function recordAmbition(world: World, p: Player): AmbitionId | null {
  const id = p.ambition?.id;
  if (!id || !hasAmbitions(p) || p.milestones[ambitionMilestone(id)] !== undefined) return null;
  const def = defOf(id);
  if (!def || !def.steps(world, p).every((s) => s.done)) return null;
  const month = getMarket(world, p.market).month;
  p.milestones[ambitionMilestone(id)] = month;
  const list = (world.inbox[p.id] ??= []);
  list.unshift({
    // A fixed id per ambition: the world's id counter is left alone.
    id: `in_ambition_${id}` as Id,
    month,
    kind: 'milestone',
    text: `Ambition reached: ${def.title}. Choose another any time, or enjoy it.`,
    read: false,
  });
  if (list.length > INBOX_LIMIT) list.length = INBOX_LIMIT;
  return id;
}

/** After a settlement: every human player with a chosen ambition in that market. */
export function recordAmbitionsAfterSettle(world: World, market: string) {
  for (const p of Object.values(world.players)) {
    if (!p.ambition || p.ai) continue;
    const here =
      p.market === market || p.companyIds.some((id) => world.companies[id]?.market === market);
    if (here) recordAmbition(world, p);
  }
}

