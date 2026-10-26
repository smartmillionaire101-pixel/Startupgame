/**
 * Founder guidance (player feedback: "the banker game is better: not chaotic,
 * proper guidance"). What the banker's licence gives a banker, for founders:
 *
 *  - The stage tracker: Idea → First customers → Product fit → Seed → Growth
 *    → Series A, each with a checklist of measurable tasks read from the
 *    company as it is (`founderGuide`). Pure derivation, like the journey:
 *    nothing is stored and no command is needed to make progress.
 *  - Live checks on pricing, spend and payroll (`founderPlanChecks`), in the
 *    business-plan checks' good / warn / bad style with the figures behind
 *    each, so the client can run them as the founder types.
 *  - Scored pitch answers with the best answer and why (`scorePitch`), and the
 *    real reason a fund passed, read from the company's numbers with how to
 *    fix it (`pitchPassWhy`), in place of a random line.
 *  - The best candidate to offer so far for an open role (`bestCandidate`).
 *
 * Replay safety: the tracker, the checks and the hiring pick only describe
 * the world. The pitch scores and pass reasons are written by fundraising.ts
 * only in worlds with the feedback note (`feedbackOn`); without it a pass
 * picks its random reason exactly as before.
 */
import { companyRunway, marketingSpend, monthlyCosts, payrollThisMonth } from './company.js';
import { strengths, type Slide } from './fundraising.js';
import { getMarket, lastPnl, nextStage, totalCustomers } from './helpers.js';
import type { JourneyGo } from './journey.js';
import { formatMoney } from './money.js';
import { rulesFor } from './data/rules.js';
import { feedbackOn } from './releases.js';
import { customerFacts, TRACTION, type CustomerFacts } from './traction.js';
import { monthlyGrowth } from './valuation.js';
import type {
  Company,
  Fund,
  Pitch,
  PitchAnswerScore,
  PitchPassWhy,
  Stage,
  World,
} from './types.js';
import { STAGES } from './types.js';

/** Every threshold in one place (money in US dollars a month, converted per city). */
export const FOUNDER_GUIDE = {
  /** How well you know the customer (traction.ts: interviews, meetings and every customer). */
  idea: { discovery: TRACTION.knowNeed },
  first: { customers: 5, revenueUsd: 500, keepPct: 90 },
  fit: { productFit: 0.6, customers: 50, growthMonths: 3, team: 3 },
  seed: { runwayMonths: 12 },
  growth: { revenueUsd: 10_000, staff: 5 },
  seriesA: { revenueUsd: 30_000 },
  /** What a fund looks for at each round: paying customers and monthly revenue (USD). */
  bar: {
    customers: { 'pre-seed': 10, seed: 50, 'series-a': 500, 'series-b': 2000, 'series-c': 5000 },
    revenueUsd: {
      'pre-seed': 500,
      seed: 5_000,
      'series-a': 50_000,
      'series-b': 200_000,
      'series-c': 500_000,
    },
    runwayMonths: 12,
  } as {
    customers: Record<Stage, number>;
    revenueUsd: Record<Stage, number>;
    runwayMonths: number;
  },
} as const;

export const FOUNDER_STAGES = [
  'idea',
  'first-customers',
  'product-fit',
  'seed',
  'growth',
  'series-a',
] as const;
export type FounderStageId = (typeof FOUNDER_STAGES)[number];

/** One measurable task: the client keys its copy on `id` (`<stage>.<task>`). */
export interface FounderTask {
  id: string;
  done: boolean;
  /** Progress, when the task counts something; `money` = minor units of the company's currency. */
  have?: number;
  need?: number;
  money?: boolean;
  /** Where to do it (the journey's Go targets). */
  go: JourneyGo | null;
}

export interface FounderStage {
  id: FounderStageId;
  status: 'done' | 'current' | 'upcoming';
  tasks: FounderTask[];
}

export interface FounderGuideView {
  /** The current stage (the last one once everything is done). */
  stage: FounderStageId;
  index: number;
  /** Every stage's checklist is complete. */
  complete: boolean;
  stages: FounderStage[];
  /** The first unfinished task of the current stage. */
  next: FounderTask | null;
}

const usdIn = (world: World, c: Company, usd: number) =>
  Math.round(usd * 100 * getMarket(world, c.market).data.unitsPerUsd);
const revenueOf = (c: Company) => lastPnl(c)?.revenue ?? 0;
const company = { kind: 'tab', tab: 'company' } as JourneyGo;
const counted = (have: number, need: number) => ({ have: Math.min(have, need), need });

/** Customers kept last month, in percent (100 when nobody has had the chance to leave). */
export function keptPct(c: Company): number {
  const seg = Object.values(c.segments);
  const churned = seg.reduce((a, s) => a + s.churned, 0);
  const base = totalCustomers(c) + churned;
  return base > 0 ? Math.round(((base - churned) / base) * 100) : 100;
}

/** Months in a row, up to last month, that revenue grew. */
export function growthStreak(c: Company): number {
  const h = c.finance.history;
  let n = 0;
  for (let i = h.length - 1; i > 0 && h[i]!.revenue > h[i - 1]!.revenue; i--) n++;
  return n;
}

/** Money from outside (investors, SAFEs, a loan, an accelerator or a grant). */
function funded(world: World, c: Company): boolean {
  const outsiders = Object.entries(c.capTable.holdings).some(
    ([h, x]) => (x.kind === 'investor' || x.kind === 'safe-converted') && !c.founderIds.includes(h),
  );
  if (outsiders || c.capTable.safes.length > 0 || c.capTable.roundsRaised > 0) return true;
  if (c.finance.loans.length > 0 || c.accelerator || c.lastRound) return true;
  if (
    Object.values(world.ffRounds ?? {}).some((r) => r.companyId === c.id && r.status === 'closed')
  )
    return true;
  return Object.values(world.applications ?? {}).some(
    (a) => a.kind === 'grant' && a.status === 'accepted' && a.companyId === c.id,
  );
}

/** Put in front of anyone with money: a fund, friends, an accelerator, a grant. */
function pitched(world: World, c: Company): boolean {
  return (
    Object.values(world.pitches).some((p) => p.companyId === c.id) ||
    Object.values(world.ffRounds ?? {}).some((r) => r.companyId === c.id) ||
    Object.values(world.applications ?? {}).some((a) => a.companyId === c.id)
  );
}

/** Selling in a second city: a branch there, or a company of the group. */
function secondCity(world: World, c: Company): boolean {
  const branch = Object.values(world.branches ?? {}).some(
    (b) => b.companyId === c.id && b.status === 'open' && b.market !== c.market,
  );
  if (branch) return true;
  return Object.values(world.companies).some(
    (x) => x.status === 'active' && x.parentId === c.id && x.market !== c.market,
  );
}

const profitableMonth = (c: Company) => c.finance.history.some((h) => h.net > 0 && h.revenue > 0);
const raisedRound = (c: Company, stage: Stage) =>
  c.lastRound !== null && STAGES.indexOf(c.lastRound) >= STAGES.indexOf(stage);

function stageTasks(
  world: World,
  c: Company,
  facts: CustomerFacts,
): Record<FounderStageId, FounderTask[]> {
  const G = FOUNDER_GUIDE;
  // One count of real customers for all guidance (traction.ts).
  const customers = facts.total;
  const revenue = revenueOf(c);
  const checks = founderPlanChecks({
    ...founderPlanBase(world, c),
    price: c.price,
    marketing: c.marketingBudget,
    founderSalary: c.founderSalary,
  });
  const level = (id: FounderCheck['id']) => checks.find((x) => x.id === id)!.level;
  const discovery = facts.known;
  const money = (have: number, usd: number) => ({
    ...counted(have, usdIn(world, c, usd)),
    money: true,
  });
  const runway = companyRunway(world, c);
  const pnl = lastPnl(c);
  const profitable = !!pnl && pnl.net > 0 && pnl.revenue > 0;
  const team = c.staff.length + c.founderIds.length;
  const firstRevenue = usdIn(world, c, G.first.revenueUsd);
  return {
    idea: [
      {
        id: 'idea.discovery',
        done: facts.knows,
        have: Math.round(Math.min(discovery, G.idea.discovery) * 100),
        need: Math.round(G.idea.discovery * 100),
        go: { kind: 'place', place: 'market' },
      },
      { id: 'idea.price', done: level('budget') === 'good', go: company },
      {
        id: 'idea.lead',
        done: (c.deals?.length ?? 0) > 0 || customers > 0,
        go: { kind: 'app', app: 'sales' },
      },
    ],
    'first-customers': [
      { id: 'first.customer', done: customers > 0, go: { kind: 'app', app: 'sales' } },
      {
        id: 'first.customers',
        done: customers >= G.first.customers,
        ...counted(customers, G.first.customers),
        go: { kind: 'place', place: 'market' },
      },
      {
        id: 'first.revenue',
        done: revenue >= firstRevenue,
        ...money(revenue, G.first.revenueUsd),
        go: company,
      },
      { id: 'first.margin', done: level('margin') !== 'bad', go: company },
      {
        id: 'first.retention',
        done: customers > 0 && c.finance.history.length > 0 && keptPct(c) >= G.first.keepPct,
        ...counted(customers > 0 ? keptPct(c) : 0, G.first.keepPct),
        go: company,
      },
    ],
    'product-fit': [
      {
        id: 'fit.product',
        done: c.product.fit >= G.fit.productFit,
        ...counted(Math.round(c.product.fit * 100), Math.round(G.fit.productFit * 100)),
        go: { kind: 'tab', tab: 'company', section: 'roadmap' },
      },
      {
        id: 'fit.customers',
        done: customers >= G.fit.customers,
        ...counted(customers, G.fit.customers),
        go: { kind: 'place', place: 'market' },
      },
      {
        id: 'fit.growth',
        done: growthStreak(c) >= G.fit.growthMonths,
        ...counted(growthStreak(c), G.fit.growthMonths),
        go: company,
      },
      {
        id: 'fit.team',
        done: team >= G.fit.team,
        ...counted(team, G.fit.team),
        go: { kind: 'tab', tab: 'company', section: 'team' },
      },
    ],
    seed: [
      { id: 'seed.pitch', done: pitched(world, c), go: { kind: 'place', place: 'investors' } },
      {
        id: 'seed.raise',
        done: funded(world, c) || profitable,
        go: { kind: 'tab', tab: 'money' },
      },
      {
        id: 'seed.runway',
        done: profitable || runway >= G.seed.runwayMonths,
        ...counted(
          Number.isFinite(runway) ? Math.floor(runway) : G.seed.runwayMonths,
          G.seed.runwayMonths,
        ),
        go: { kind: 'tab', tab: 'money' },
      },
    ],
    growth: [
      {
        id: 'growth.revenue',
        done: revenue >= usdIn(world, c, G.growth.revenueUsd),
        ...money(revenue, G.growth.revenueUsd),
        go: company,
      },
      {
        id: 'growth.team',
        done: c.staff.length >= G.growth.staff,
        ...counted(c.staff.length, G.growth.staff),
        go: { kind: 'place', place: 'hub' },
      },
      { id: 'growth.profit', done: profitableMonth(c), go: company },
    ],
    'series-a': [
      {
        id: 'a.revenue',
        done: revenue >= usdIn(world, c, G.seriesA.revenueUsd),
        ...money(revenue, G.seriesA.revenueUsd),
        go: company,
      },
      { id: 'a.city', done: secondCity(world, c), go: company },
      {
        id: 'a.raise',
        done: raisedRound(c, 'series-a'),
        go: { kind: 'place', place: 'investors' },
      },
    ],
  };
}

/**
 * Where a company stands: the first stage with an unfinished task, but never
 * before what its funding already shows (a seed round means it is past Seed)
 * or what its customers show (a customer won means it is past Idea).
 */
export function founderGuide(world: World, c: Company): FounderGuideView {
  const facts = customerFacts(world, c);
  const tasks = stageTasks(world, c, facts);
  // Real paying customers mean the Idea stage is behind you (feedback note).
  const selling = feedbackOn(world) && facts.earned > 0;
  const floor = raisedRound(c, 'series-a')
    ? FOUNDER_STAGES.indexOf('series-a')
    : raisedRound(c, 'seed')
      ? FOUNDER_STAGES.indexOf('growth')
      : selling
        ? FOUNDER_STAGES.indexOf('first-customers')
        : 0;
  const open = FOUNDER_STAGES.findIndex((s, i) => i >= floor && tasks[s].some((x) => !x.done));
  const complete = open < 0;
  const index = complete ? FOUNDER_STAGES.length - 1 : open;
  const stages = FOUNDER_STAGES.map((id, i): FounderStage => ({
    id,
    status: i < index || (complete && i === index) ? 'done' : i === index ? 'current' : 'upcoming',
    tasks: tasks[id],
  }));
  const stage = FOUNDER_STAGES[index]!;
  return {
    stage,
    index,
    complete,
    stages,
    next: complete ? null : (tasks[stage].find((x) => !x.done) ?? null),
  };
}

// ---------------------------------------------------------------- pricing, spend and payroll

/** What the live checks stand on: the company today, apart from the three settings typed. */
export interface FounderPlanBase {
  /** Cost to serve one customer as a share of the price (cloud and processing). */
  costShare: number;
  /** Monthly costs that don't move with price, marketing or founder pay (payroll, rent, loans…). */
  fixedCosts: number;
  /** Staff salaries a month (part of fixedCosts). */
  payroll: number;
  founders: number;
  cash: number;
  /** Last month's revenue, at `basePrice`. */
  revenue: number;
  basePrice: number;
  /** Customers pay every month (one-off sales pay once). */
  recurring: boolean;
  customers: number;
  /** The targeted segments' monthly budgets per customer. */
  budgetMin: number;
  budgetMax: number;
  /** Buyers a young company can hope to reach in its segments (a tenth of them). */
  reachable: number;
  /** Last month: marketing spent, and customers it brought. */
  lastMarketing: number;
  lastFromMarketing: number;
}

export interface FounderPlanInput extends FounderPlanBase {
  price: number;
  marketing: number;
  founderSalary: number;
  /** A salary being offered (the hiring sheet), on top of today's payroll. */
  extraPayroll?: number;
}

export type FounderCheckLevel = 'good' | 'warn' | 'bad';
export interface FounderCheck {
  id: 'budget' | 'margin' | 'runway' | 'payroll' | 'marketing';
  level: FounderCheckLevel;
  values: Record<string, number>;
}

/** Cost to serve one customer a month, at the price being typed. */
const serveCost = (i: FounderPlanInput) => Math.round(i.price * i.costShare);

export function founderPlanBase(world: World, c: Company): FounderPlanBase {
  const m = getMarket(world, c.market);
  const customers = totalCustomers(c);
  const perCustomer = Math.round(c.cogsUsdPerCustomer * m.data.unitsPerUsd * c.supply.cogsMult);
  const founderPay = c.founderSalary * c.founderIds.length;
  const variable = perCustomer * customers;
  const targets = c.targetSegments.map((k) => m.segments[k]).filter((s) => !!s);
  const budgets = targets.map((s) => s.budget);
  const pnl = lastPnl(c);
  const fromMarketing = Object.values(c.segments).reduce(
    (a, s) => a + (s.channels?.marketing ?? 0),
    0,
  );
  return {
    costShare: c.price > 0 ? Math.round((perCustomer / c.price) * 1000) / 1000 : 0,
    fixedCosts: Math.max(0, monthlyCosts(world, c) - marketingSpend(c) - founderPay - variable),
    payroll: payrollThisMonth(c),
    founders: c.founderIds.length,
    cash: world.accounts[c.account]!.balance,
    revenue: pnl?.revenue ?? 0,
    basePrice: c.price,
    recurring: c.revenueModel !== 'one-off',
    customers,
    budgetMin: budgets.length ? Math.min(...budgets) : 0,
    budgetMax: budgets.length ? Math.max(...budgets) : 0,
    reachable: Math.round(targets.reduce((a, s) => a + s.buyers, 0) * 0.1),
    lastMarketing: pnl?.marketing ?? 0,
    lastFromMarketing: Math.round(fromMarketing),
  };
}

/** A round figure near `x` (two significant digits), for suggested prices. */
const roundish = (x: number) => {
  if (x <= 0) return 0;
  const step = Math.pow(10, Math.max(2, Math.floor(Math.log10(x)) - 1));
  return Math.round(x / step) * step;
};

/**
 * Pricing, spend and payroll, live as the founder types (the bank plan
 * checks' pattern). -1 in a `months` value means the money never runs out.
 *
 *  - budget: the price against what the targeted customers can pay.
 *  - margin: what each customer leaves after the cost to serve them, and how
 *    many customers cover the month's fixed costs.
 *  - runway: months the cash lasts with these settings.
 *  - payroll: months the cash lasts on salaries alone.
 *  - marketing: what last month's marketing paid per customer, and how long
 *    a customer takes to pay that back.
 */
export function founderPlanChecks(i: FounderPlanInput): FounderCheck[] {
  const cost = serveCost(i);
  const margin = i.price - cost;
  const breakEven = margin > 0 ? Math.ceil(i.fixedCosts / margin) : 0;
  // Revenue at the typed price: recurring customers pay the new price next month.
  const revenue =
    i.recurring && i.basePrice > 0 ? Math.round((i.revenue * i.price) / i.basePrice) : i.revenue;
  const pay = i.payroll + (i.extraPayroll ?? 0) + i.founderSalary * i.founders;
  const out =
    i.fixedCosts +
    (i.extraPayroll ?? 0) +
    cost * i.customers +
    i.marketing +
    i.founderSalary * i.founders;
  const burn = out - revenue;
  const months = (b: number) => (b <= 0 ? -1 : Math.round((Math.max(0, i.cash) / b) * 10) / 10);
  const runway = months(burn);
  const payMonths = months(pay - revenue);
  const band = (m: number, good: number, warn: number): FounderCheckLevel =>
    m < 0 || m >= good ? 'good' : m >= warn ? 'warn' : 'bad';
  const cac = i.lastFromMarketing > 0 ? Math.round(i.lastMarketing / i.lastFromMarketing) : 0;
  const payback = cac > 0 && margin > 0 ? Math.round((cac / margin) * 10) / 10 : -1;
  const marketing: FounderCheck =
    i.marketing <= 0
      ? { id: 'marketing', level: 'warn', values: { marketing: 0 } }
      : i.lastMarketing > 0 && i.lastFromMarketing > 0
        ? {
            id: 'marketing',
            level: margin <= 0 || payback > 24 ? 'bad' : payback > 12 ? 'warn' : 'good',
            values: { marketing: i.marketing, cac, payback, won: i.lastFromMarketing },
          }
        : i.lastMarketing > 0
          ? {
              id: 'marketing',
              level: 'warn',
              values: { marketing: i.marketing, spent: i.lastMarketing, won: 0 },
            }
          : {
              id: 'marketing',
              level:
                i.marketing * 3 > Math.max(0, i.cash)
                  ? 'bad'
                  : out > 0 && i.marketing / out > 0.5
                    ? 'warn'
                    : 'good',
              values: {
                marketing: i.marketing,
                share: out > 0 ? Math.round((i.marketing / out) * 100) : 0,
              },
            };
  return [
    {
      id: 'budget',
      level:
        i.budgetMax <= 0
          ? 'good'
          : i.price > i.budgetMax * 1.2
            ? 'bad'
            : i.price > i.budgetMax || i.price < i.budgetMin * 0.3
              ? 'warn'
              : 'good',
      values: {
        price: i.price,
        budgetMin: i.budgetMin,
        budgetMax: i.budgetMax,
        suggested: roundish(i.budgetMin * 0.7),
      },
    },
    {
      id: 'margin',
      level:
        margin <= 0
          ? 'bad'
          : i.customers >= breakEven
            ? 'good'
            : breakEven <= Math.max(1, i.reachable)
              ? 'warn'
              : 'bad',
      values: {
        price: i.price,
        cost,
        margin,
        breakEven,
        customers: i.customers,
        fixed: i.fixedCosts,
      },
    },
    {
      id: 'runway',
      level: band(runway, 12, 6),
      values: { months: runway, burn: Math.max(0, burn), cash: i.cash },
    },
    {
      id: 'payroll',
      level: band(payMonths, 18, 9),
      values: { pay, months: payMonths, revenue },
    },
    marketing,
  ];
}

// ---------------------------------------------------------------- pitches

/** Points for how a question was answered (a number's strength adds up to 50 more). */
const TONE_POINTS: Record<PitchAnswerScore['tone'], number> = {
  honest: 50,
  modest: 35,
  spin: 25,
  vague: 10,
  caught: 0,
};

/** What a fund looks for in the round being raised, in the company's currency. */
export function pitchBar(world: World, c: Company) {
  const stage = nextStage(c.lastRound);
  return {
    stage,
    customers: FOUNDER_GUIDE.bar.customers[stage],
    revenue: usdIn(world, c, FOUNDER_GUIDE.bar.revenueUsd[stage]),
    runway: FOUNDER_GUIDE.bar.runwayMonths,
  };
}

/**
 * Score each answer 0–100: how it was answered (the true figure scores
 * best: spin is found in diligence three times in four), plus how strong the
 * figure is against what the fund looks for at this round. `tones` is how
 * answerPitch judged each answer.
 */
export function scorePitch(
  world: World,
  c: Company,
  p: Pitch,
  tones: Record<string, PitchAnswerScore['tone']>,
): PitchAnswerScore[] {
  const bar = pitchBar(world, c);
  return p.questions.map((q) => {
    const honest = q.options.find((o) => o.tone === 'honest');
    const tone = tones[q.id] ?? 'vague';
    const factors: PitchAnswerScore['factors'] = [{ id: tone, points: TONE_POINTS[tone] }];
    const truth = honest?.truth;
    const gave = tone === 'honest' || tone === 'modest' || tone === 'spin';
    const need =
      q.id === 'traction'
        ? bar.customers
        : q.id === 'revenue'
          ? bar.revenue
          : q.id === 'runway'
            ? bar.runway
            : 0;
    if (gave && need > 0 && truth !== undefined)
      factors.push({
        id: q.id,
        points: Math.round(50 * Math.min(1, Math.max(0, truth) / need)),
        values: { have: truth, need },
      });
    else if (gave && q.id === 'team') factors.push({ id: 'team', points: 40 });
    const score = Math.max(
      0,
      Math.min(
        100,
        factors.reduce((a, f) => a + f.points, 0),
      ),
    );
    return {
      questionId: q.id,
      score,
      tone,
      best: honest?.id ?? q.options[0]?.id ?? '',
      factors,
    };
  });
}

/**
 * Why a fund passed, read from the company's numbers: the biggest gap
 * between the company and what the fund looks for at this round (each gap
 * 0–1, the largest wins; ties go to the first listed).
 */
export function pitchPassWhy(
  world: World,
  fund: Fund,
  c: Company,
  p: Pitch,
  vague: number,
): PitchPassWhy {
  const m = getMarket(world, c.market);
  const bar = pitchBar(world, c);
  const s = strengths(world, c);
  const customers = totalCustomers(c);
  const revenue = revenueOf(c);
  const growth = monthlyGrowth(c);
  const runway = companyRunway(world, c);
  const gaps = rulesFor(c.market, c.industry).filter((r) => !c.compliance[r.id]).length;
  const weakSlide = p.slides.find((sl) => (s[sl as Slide] ?? 0.5) < 0.35);
  const seniors = c.staff.filter((x) => x.seniority === 'senior' || x.seniority === 'head').length;
  const short = (have: number, need: number) => (need > 0 ? Math.max(0, 1 - have / need) : 0);
  const options: (PitchPassWhy & { gap: number })[] = [
    {
      id: 'traction',
      gap: short(customers, bar.customers),
      values: { customers, need: bar.customers },
    },
    {
      id: 'revenue',
      gap: short(revenue, bar.revenue) * 0.95,
      values: { revenue, need: bar.revenue },
    },
    {
      id: 'product',
      gap: short(c.product.fit, 0.5) * 0.9,
      values: { fit: Math.round(c.product.fit * 100), need: 50 },
    },
    {
      id: 'runway',
      gap: Number.isFinite(runway) ? short(runway, 6) * 0.85 : 0,
      values: { months: Number.isFinite(runway) ? Math.floor(runway) : -1, need: 6 },
    },
    {
      id: 'growth',
      gap: c.finance.history.length >= 3 ? short(growth, 0.1) * 0.7 : 0,
      values: { growth: Math.round(growth * 1000) / 10, need: 10 },
    },
    {
      id: 'team',
      gap: short(s.team, 0.4) * 0.7,
      values: { seniors, founders: c.founderIds.length },
    },
    { id: 'answers', gap: vague > 0 ? 0.5 : 0, values: { vague } },
    {
      id: 'deck',
      gap: weakSlide ? 0.3 : 0,
      values: {},
      ...(weakSlide ? { slide: weakSlide } : {}),
    },
    { id: 'compliance', gap: Math.min(0.45, gaps * 0.15), values: { gaps } },
    {
      id: 'timing',
      gap: fund.mood < 0.9 || m.climate < 0.9 ? 0.25 : 0.05,
      values: {
        mood: Math.round(fund.mood * 100),
        climate: Math.round(m.climate * 100),
      },
    },
  ];
  const best = options.reduce((a, b) => (b.gap > a.gap ? b : a));
  const { gap: _gap, ...why } = best;
  return why;
}

/** The pass reason in English (the client has its own translated copy, keyed on `id`). */
export function passWhyText(why: PitchPassWhy, currency: Parameters<typeof formatMoney>[1]) {
  const v = why.values;
  switch (why.id) {
    case 'traction':
      return `You have ${v.customers} paying customers; at this round we look for ${v.need}. Win more customers and come back.`;
    case 'revenue':
      return `Revenue is ${formatMoney(v.revenue ?? 0, currency)} a month; we look for ${formatMoney(v.need ?? 0, currency)}. Grow revenue first.`;
    case 'product':
      return `Product fit is ${v.fit}%; we want to see at least ${v.need}%. Talk to customers and build what they ask for.`;
    case 'runway':
      return `Your money lasts ${v.months} months; that's too short to reach the next milestone. Cut costs or raise smaller first.`;
    case 'growth':
      return `Revenue grows ${v.growth}% a month; we look for ${v.need}%. Show steady growth for a few months.`;
    case 'team':
      return 'The team is thin for what you want to build. Hire senior people or bring in a co-founder.';
    case 'answers':
      return 'Your answers dodged our questions. Give us the real numbers.';
    case 'deck':
      return 'Your deck led with your weakest slide. Show what is strong.';
    case 'compliance':
      return `You have ${v.gaps} open compliance items. Fix them on the Rules tab before you raise.`;
    case 'timing':
      return 'It’s a hard time to raise and we’re being careful. The numbers are close: try again in a few months.';
  }
}

// ---------------------------------------------------------------- hiring

/** A candidate as the hiring view shows them: skill and fit only once interviewed. */
export interface CandidateSeen {
  id: string;
  skill: number | null;
  cvSkill: number;
  fit: number | null;
  ask: number;
}

/**
 * The best candidate to offer so far for one role, and why: checked skill
 * over a CV (CVs flatter), good fit, and value for the salary asked.
 */
export function bestCandidate(
  cands: CandidateSeen[],
): { id: string; why: 'interview' | 'checked' | 'fit' | 'value' } | null {
  if (cands.length < 2) return null;
  const meanAsk = cands.reduce((a, x) => a + x.ask, 0) / cands.length;
  const value = (x: CandidateSeen) =>
    (x.skill ?? x.cvSkill - 0.1) *
    (0.75 + 0.5 * ((x.fit ?? 0.5) - 0.5)) *
    Math.sqrt(meanAsk / Math.max(1, x.ask));
  const best = cands.reduce((a, b) => (value(b) > value(a) ? b : a));
  const seen = cands.some((x) => x.skill !== null || x.fit !== null);
  return {
    id: best.id,
    why: !seen
      ? 'interview'
      : best.skill !== null && cands.some((x) => x.id !== best.id && x.skill === null)
        ? 'checked'
        : (best.fit ?? 0) >= 0.7
          ? 'fit'
          : 'value',
  };
}
