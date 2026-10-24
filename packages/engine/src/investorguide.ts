/**
 * The investor guide (player feedback, 24 October 2026: "the banker game is
 * better: not chaotic, proper guidance and education"). What the banker
 * licence does for bankers, this does for investors:
 *
 *  - Stages: angel → syndicate lead → first exit → Fund I → Fund II → family
 *    office, read off the career ladder (career.ts), each with a short
 *    checklist and the one next step. It is the investor's single "what to
 *    do now": the client shows its next step as the main objective.
 *  - Live checks on a cheque (pure, the client runs them as you type): the
 *    cheque against your money (keep under 10%), the price against the
 *    company's model value, sector concentration and follow-on reserves.
 *  - Scored decisions (feedback round only, `feedbackOn`): screening (take a
 *    first call or pass, and why), the first question on a first call, the
 *    price and the cheque, each against the company's real numbers with the
 *    best call and the numbers behind it. Asking the right first question
 *    teaches more (investing skill); nothing here moves money.
 *  - A mentor: a senior partner at one of the city's funds, who explains the
 *    stage's rules (the client words them).
 *
 * The view and the checks are read-only; only the scored decisions write
 * state (the pipeline entry's `calls`), and only in feedback-round worlds.
 */
import { companyRunway } from './company.js';
import { hasCareer, managedFunds, rungRequirements } from './career.js';
import type { RungRequirement } from './career.js';
import { markupsOf } from './firstfund.js';
import { angelRecord } from './funds.js';
import { getMarket, nextStage } from './helpers.js';
import type { JourneyGo } from './journey.js';
import { publicOnly } from './lpreview.js';
import { roundTo } from './math.js';
import { dealflowOn, feedbackOn, investorOn } from './releases.js';
import type {
  Company,
  DecisionCall,
  FirstCallAsk,
  Id,
  PassReason,
  PipelineEntry,
  Player,
  World,
} from './types.js';
import { monthlyGrowth, valueCompany } from './valuation.js';
import { wealthView } from './wealth.js';

export const GUIDE = {
  /** One cheque at most this share of your money (warn above, bad above `chequeWarn`). */
  chequeShare: 0.1,
  chequeWarn: 0.2,
  /** Sector concentration from three companies: warn above a third, bad above half. */
  sectorWarn: 1 / 3,
  sectorBad: 0.5,
  /** Follow-on reserves: about half of each cheque again for the next round. */
  reserveShare: 0.5,
  /** A fair price, as a multiple of the model value (an AI founder walks below 0.85). */
  fair: [0.85, 1.15] as const,
  /** Defensible, but costs you: a lowball they may counter, or overpaying. */
  stretch: [0.75, 1.5] as const,
  /** Screening: an ask this far above the model value is a pass on price. */
  askTooHigh: 1.5,
  /** First call: what a healthy company shows. */
  runwayMonths: 6,
  churn: 0.1,
  growth: 0.03,
  team: 3,
  /** Asking the right first question: investing and risk skill. */
  askSkill: 1,
  askRisk: 0.5,
  /** Scored decisions kept per company, and shown in the guide. */
  decisionsShown: 8,
} as const;

/** The investor's stages, in order (the client names them). */
export const INVESTOR_STAGES = [
  'angel',
  'syndicate',
  'first-exit',
  'fund-1',
  'fund-2',
  'family-office',
] as const;
export type InvestorStage = (typeof INVESTOR_STAGES)[number];

export type GuideLevel = 'good' | 'warn' | 'bad';

// ---------------------------------------------------------------- live checks

export interface InvestCheckInput {
  amount: number;
  /** Your money in the cheque's currency; 0 when it isn't comparable (a fund, another currency). */
  liquid: number;
  industry: string;
  /** Companies you already back, by sector. */
  holdings: Record<string, number>;
  /** Your diligence depth on this company (0: none). */
  diligence: number;
  /** The company's model value (known after a first call), else 0. */
  model: number;
  valuation: number;
}

export interface InvestCheck {
  id: 'size' | 'diligence' | 'spread' | 'reserves' | 'price';
  level: GuideLevel;
  values: Record<string, number>;
}

/** A round cheque at most `v`: two steps per power of ten (16,600 → 15,000). */
export function niceDown(v: number): number {
  if (v <= 0) return 0;
  const step = Math.pow(10, Math.floor(Math.log10(v))) / 2;
  return Math.max(step, Math.floor(v / step) * step);
}

/** The cheque guide for this much money: under a tenth, rounded down. */
export const chequeGuide = (liquid: number): number => niceDown(liquid * GUIDE.chequeShare);

/**
 * A cheque checked against your money, the company's numbers and your
 * portfolio (pure: the client runs it live as you type).
 */
export function investChecks(i: InvestCheckInput): InvestCheck[] {
  const out: InvestCheck[] = [];
  if (i.liquid > 0) {
    const share = i.amount / i.liquid;
    out.push({
      id: 'size',
      level: share <= GUIDE.chequeShare ? 'good' : share <= GUIDE.chequeWarn ? 'warn' : 'bad',
      values: {
        amount: i.amount,
        liquid: i.liquid,
        share: roundTo(share, 3),
        guide: Math.floor(i.liquid * GUIDE.chequeShare),
        suggested: chequeGuide(i.liquid),
      },
    });
  }
  out.push({
    id: 'diligence',
    level: i.diligence >= 1 ? 'good' : 'bad',
    values: { depth: i.diligence },
  });
  const companies = Object.values(i.holdings).reduce((a, n) => a + n, 0) + 1;
  const same = (i.holdings[i.industry] ?? 0) + 1;
  const share = same / companies;
  out.push({
    id: 'spread',
    level:
      companies < 3
        ? 'good'
        : share > GUIDE.sectorBad && same >= 3
          ? 'bad'
          : share > GUIDE.sectorWarn
            ? 'warn'
            : 'good',
    values: { same, companies },
  });
  if (i.liquid > 0) {
    const left = i.liquid - i.amount;
    const need = Math.round(i.amount * GUIDE.reserveShare * companies);
    out.push({
      id: 'reserves',
      level: left >= need ? 'good' : left >= need / 2 ? 'warn' : 'bad',
      values: { left: Math.max(0, left), need, companies },
    });
  }
  if (i.model > 0 && i.valuation > 0) {
    const ratio = i.valuation / i.model;
    out.push({
      id: 'price',
      level: priceLevel(ratio),
      values: {
        ratio: roundTo(ratio, 2),
        model: i.model,
        lo: Math.round(i.model * GUIDE.fair[0]),
        hi: Math.round(i.model * GUIDE.fair[1]),
      },
    });
  }
  return out;
}

const priceLevel = (ratio: number): GuideLevel =>
  ratio >= GUIDE.fair[0] && ratio <= GUIDE.fair[1]
    ? 'good'
    : ratio >= GUIDE.stretch[0] && ratio <= GUIDE.stretch[1]
      ? 'warn'
      : 'bad';

// ---------------------------------------------------------------- the company's real numbers

/** What a first call finds: the numbers the best calls are judged on. */
function numbersOf(world: World, c: Company) {
  const segs = Object.values(c.segments);
  const paying = segs.reduce((a, s) => a + (s.paying ?? 0), 0);
  const churned = segs.reduce((a, s) => a + (s.churned ?? 0), 0);
  const runway = companyRunway(world, c);
  const last = c.finance.history.at(-1);
  return {
    revenue: Math.max(last?.revenue ?? 0, paying * c.price),
    growth: monthlyGrowth(c),
    runway: Number.isFinite(runway) ? Math.floor(runway) : 99,
    churn: churned / Math.max(1, paying + churned),
    team: c.staff.length + c.founderIds.length,
    model: Math.max(1, valueCompany(world, c, nextStage(c.lastRound)).value),
  };
}

type ScreenChoice = 'call' | PassReason;

/**
 * Screening: is it worth a first call? A company outside your thesis, an ask
 * far above what it's worth, or no revenue, no growth and no team is a pass
 * (with that reason); otherwise the call.
 */
export function screenBest(world: World, p: Player, c: Company) {
  const n = numbersOf(world, c);
  const sectors = p.investor?.sectors ?? [];
  const ask = p.pipeline?.[c.id]?.pitch?.valuation ?? 0;
  const ratio = ask > 0 ? ask / n.model : 0;
  const best: ScreenChoice =
    sectors.length > 0 && !sectors.includes(c.industry)
      ? 'fit'
      : ratio > GUIDE.askTooHigh
        ? 'price'
        : n.revenue === 0 && n.growth < GUIDE.growth && n.team < GUIDE.team
          ? 'traction'
          : 'call';
  return {
    best,
    values: {
      fit: sectors.length === 0 || sectors.includes(c.industry) ? 1 : 0,
      ratio: roundTo(ratio, 2),
      revenue: n.revenue,
      growth: roundTo(n.growth * 100, 1),
      team: n.team,
    },
  };
}

/**
 * The first question on a first call: the company's biggest risk first.
 * Money running out beats everything; then customers leaving, slow growth
 * and a thin team. A healthy company: growth, which sets the price.
 */
export function firstCallBest(world: World, c: Company) {
  const n = numbersOf(world, c);
  const weak: FirstCallAsk[] = [];
  if (n.runway < GUIDE.runwayMonths) weak.push('burn');
  if (n.churn > GUIDE.churn) weak.push('customers');
  if (n.growth < GUIDE.growth) weak.push('growth');
  if (n.team < GUIDE.team) weak.push('team');
  return {
    best: weak[0] ?? ('growth' as FirstCallAsk),
    weak,
    values: {
      runway: n.runway,
      churn: roundTo(n.churn * 100, 1),
      growth: roundTo(n.growth * 100, 1),
      team: n.team,
    },
  };
}

// ---------------------------------------------------------------- scored decisions

function entryOf(world: World, p: Player, companyId: Id): PipelineEntry {
  const book = (p.pipeline ??= {});
  return (book[companyId] ??= {
    companyId,
    stage: 'screened',
    month: getMarket(world, p.market).month,
    source: 'manual',
  });
}

function record(world: World, p: Player, companyId: Id, call: Omit<DecisionCall, 'month'>) {
  const e = entryOf(world, p, companyId);
  const full: DecisionCall = { ...call, month: getMarket(world, p.market).month };
  e.calls = [...(e.calls ?? []).filter((x) => x.step !== call.step), full];
  return full;
}

/** Scored decisions are on for investors in feedback-round worlds. */
const scoring = (world: World, p: Player) =>
  investorOn(world) && feedbackOn(world) && hasCareer(p) && !p.ai;

/** Screening scored: a pass with its reason, or taking the call (once per company). */
export function scoreScreen(world: World, p: Player, c: Company, choice: ScreenChoice) {
  if (!scoring(world, p)) return null;
  if (choice === 'call' && p.pipeline?.[c.id]?.calls?.some((x) => x.step === 'screen')) return null;
  const { best, values } = screenBest(world, p, c);
  const score = choice === best ? 1 : best === 'call' ? 0 : 0.5;
  return record(world, p, c.id, { step: 'screen', choice, best, score, values });
}

/**
 * A first call scored: what you asked first against the company's biggest
 * risk. The right question teaches (investing and risk skill).
 */
export function scoreFirstCall(world: World, p: Player, c: Company, ask: FirstCallAsk) {
  if (!scoring(world, p)) return null;
  const { best, weak, values } = firstCallBest(world, c);
  const score = ask === best ? 1 : weak.includes(ask) ? 0.5 : 0;
  if (score === 1) {
    p.skills.investing = Math.min(100, p.skills.investing + GUIDE.askSkill);
    p.skills.risk = Math.min(100, p.skills.risk + GUIDE.askRisk);
  }
  return record(world, p, c.id, { step: 'first-call', choice: ask, best, score, values });
}

/**
 * A term sheet scored before it is sent: the price against the model value,
 * and (a personal cheque) its size against your money.
 */
export function scoreTerms(
  world: World,
  p: Player,
  c: Company,
  amount: number,
  valuation: number,
  personal: boolean,
) {
  if (!scoring(world, p)) return [];
  const model = numbersOf(world, c).model;
  const ratio = valuation / model;
  const price = priceLevel(ratio);
  const calls: DecisionCall[] = [
    record(world, p, c.id, {
      step: 'valuation',
      choice: price === 'good' ? 'fair' : ratio < 1 ? 'low' : 'high',
      best: 'fair',
      score: price === 'good' ? 1 : price === 'warn' ? 0.5 : 0,
      values: {
        ratio: roundTo(ratio, 2),
        model,
        lo: Math.round(model * GUIDE.fair[0]),
        hi: Math.round(model * GUIDE.fair[1]),
      },
    }),
  ];
  const home = getMarket(world, p.market).data.currency;
  const same = getMarket(world, c.market).data.currency === home;
  const liquid = wealthView(world, p).liquid;
  if (personal && same && liquid > 0) {
    const share = amount / liquid;
    const level: GuideLevel =
      share <= GUIDE.chequeShare ? 'good' : share <= GUIDE.chequeWarn ? 'warn' : 'bad';
    calls.push(
      record(world, p, c.id, {
        step: 'cheque',
        choice: level === 'good' ? 'small' : level === 'warn' ? 'large' : 'too-big',
        best: 'small',
        score: level === 'good' ? 1 : level === 'warn' ? 0.5 : 0,
        values: { amount, liquid, share: roundTo(share, 3), suggested: chequeGuide(liquid) },
      }),
    );
  }
  return calls;
}

// ---------------------------------------------------------------- stages

export interface GuideItem {
  id: string;
  done: boolean;
  have?: number;
  need?: number;
  currency?: string;
  go: JourneyGo | null;
}

const deals: JourneyGo = { kind: 'tab', tab: 'deals' };
const portfolio: JourneyGo = { kind: 'tab', tab: 'portfolio' };
const events: JourneyGo = { kind: 'app', app: 'events' };

const fromRung = (r: RungRequirement, go: JourneyGo): GuideItem => ({
  id: r.id,
  done: r.done,
  have: r.have,
  need: r.need,
  ...(r.currency ? { currency: r.currency } : {}),
  go,
});

const item = (id: string, done: boolean, go: JourneyGo, have?: number, need?: number) => ({
  id,
  done,
  go,
  ...(have !== undefined && need !== undefined ? { have: Math.min(have, need), need } : {}),
});

/** Companies you back yourself (not listed shares bought on the market). */
function personalHoldings(world: World, p: Player) {
  return Object.values(world.positions).filter(
    (x) =>
      x.investorId === p.id &&
      x.invested > 0 &&
      !x.writtenOff &&
      !publicOnly(world, x.investorId, x.companyId, x.invested),
  );
}

/** Where you are: the ladder's rungs (2–5) read as stages; the first cheque before them. */
export function stageOf(world: World, p: Player): InvestorStage {
  const reached = (n: number) => p.career?.reached[n] !== undefined;
  if (reached(5)) return 'family-office';
  if (reached(4)) return 'fund-2';
  if (reached(3)) return 'fund-1';
  if (reached(2)) return 'first-exit';
  return angelRecord(world, p).deals > 0 ? 'syndicate' : 'angel';
}

/** The stage's checklist: what it takes to reach the next one. */
function stageItems(world: World, p: Player, stage: InvestorStage): GuideItem[] {
  const rec = angelRecord(world, p);
  switch (stage) {
    case 'angel': {
      const met = Object.keys(p.pipeline ?? {}).length > 0 || rec.deals > 0;
      const called = Object.values(p.diligence).some((d) => d >= 1);
      return [
        item('meet', met, dealflowOn(world) ? events : deals),
        item('first-call', called, deals),
        item('first-cheque', rec.deals > 0, deals),
      ];
    }
    case 'syndicate': {
      const held = personalHoldings(world, p);
      const checked = held.filter((x) => (p.diligence[x.companyId] ?? 0) >= 1).length;
      const total = held.reduce((a, x) => a + x.invested, 0);
      const money = wealthView(world, p).liquid + total;
      const largest = Math.max(0, ...held.map((x) => x.invested));
      const [d, s] = rungRequirements(world, p, 2);
      return [
        fromRung(d!, deals),
        item('diligence', held.length > 0 && checked >= held.length, deals, checked, held.length),
        fromRung(s!, portfolio),
        item('spread', held.length > 0 && largest <= money * GUIDE.chequeShare, portfolio),
      ];
    }
    case 'first-exit': {
      const [d, score] = rungRequirements(world, p, 3);
      return [
        item('markup', markupsOf(world, p) > 0, portfolio),
        fromRung(d!, deals),
        item('exit', rec.returned > 0, { kind: 'app', app: 'capital' }),
        fromRung(score!, portfolio),
      ];
    }
    case 'fund-1': {
      const panel = p.dealflow?.lastPanel;
      return [
        ...(dealflowOn(world)
          ? [
              item(
                'lessons',
                (p.dealflow?.lessons.length ?? 0) >= 3,
                events,
                p.dealflow?.lessons.length ?? 0,
                3,
              ),
            ]
          : []),
        item('strategy', !!panel && panel.checks.every((c) => c.level !== 'bad'), portfolio),
        ...rungRequirements(world, p, 4).map((r) => fromRung(r, portfolio)),
      ];
    }
    case 'fund-2': {
      const funds = new Set(managedFunds(world, p).map((f) => f.id));
      const fromFund = Object.values(world.positions).some((x) => funds.has(x.investorId));
      return [
        item('fund-deal', fromFund, deals),
        item('lead', rec.syndicates > 0, portfolio),
        ...rungRequirements(world, p, 5).map((r) => fromRung(r, portfolio)),
      ];
    }
    case 'family-office':
      return rungRequirements(world, p, 7).map((r) => fromRung(r, portfolio));
  }
}

/** The senior partner who explains the rules: one of the city's AI funds. */
function mentorOf(world: World, p: Player) {
  const f = Object.values(world.funds)
    .filter((x) => x.ai && !x.angelId && !x.managerId && x.market === p.market)
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  return f ? { name: f.partner, org: f.name } : null;
}

/**
 * `view.investorGuide`: the stage tracker (every stage, the current one's
 * checklist and next step), the mentor, the money the live checks need and
 * your recent scored decisions. Investor-career worlds; null otherwise.
 */
export function investorGuideView(world: World, p: Player) {
  if (!investorOn(world) || !hasCareer(p) || p.ai) return null;
  const stage = stageOf(world, p);
  const at = INVESTOR_STAGES.indexOf(stage);
  const items = stageItems(world, p, stage);
  const top = stage === 'family-office' && p.career?.reached[7] !== undefined;
  const home = getMarket(world, p.market).data.currency;
  const holdings: Record<string, number> = {};
  for (const x of personalHoldings(world, p)) {
    const c = world.companies[x.companyId];
    if (c && c.status === 'active') holdings[c.industry] = (holdings[c.industry] ?? 0) + 1;
  }
  const decisions = Object.values(p.pipeline ?? {})
    .flatMap((e) =>
      (e.calls ?? []).map((call) => ({
        ...call,
        companyId: e.companyId,
        name: world.companies[e.companyId]?.name ?? '',
        currency: world.companies[e.companyId]
          ? getMarket(world, world.companies[e.companyId]!.market).data.currency
          : home,
      })),
    )
    .sort(
      (a, b) =>
        b.month - a.month ||
        (a.companyId < b.companyId ? -1 : a.companyId > b.companyId ? 1 : 0) ||
        STEP_ORDER.indexOf(a.step) - STEP_ORDER.indexOf(b.step),
    )
    .slice(0, GUIDE.decisionsShown);
  return {
    stage,
    stages: INVESTOR_STAGES.map((id, i) => ({
      id,
      status:
        i < at || (i === at && top)
          ? ('done' as const)
          : i === at
            ? ('now' as const)
            : ('later' as const),
    })),
    items,
    done: items.filter((x) => x.done).length,
    next: top ? null : (items.find((x) => !x.done) ?? null),
    mentor: mentorOf(world, p),
    money: {
      currency: home,
      liquid: wealthView(world, p).liquid,
      guide: chequeGuide(wealthView(world, p).liquid),
      holdings,
    },
    /** Feedback round: first calls, screening and terms are scored. */
    scoring: feedbackOn(world),
    decisions,
  };
}

const STEP_ORDER: DecisionCall['step'][] = ['screen', 'first-call', 'valuation', 'cheque'];
