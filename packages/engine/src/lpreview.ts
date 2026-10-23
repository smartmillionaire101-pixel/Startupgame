/**
 * Realistic LP pitches (player feedback, 23 October 2026: "when I pitch to
 * LPs it has to be a bit more realistic about my strategy"). Deal-flow note
 * worlds only.
 *
 * A fund pitch is a strategy: the thesis (sectors, stages, geography), the
 * fund size, the average first cheque and how many companies, the reserve
 * ratio, the ownership target and the fees and carry. LPs judge it on four
 * things, each weighed by the kind of LP:
 *
 *  - Track record: deals done, realised and unrealised value (TVPI), cash
 *    returned (DPI) and losses.
 *  - Strategy: does the arithmetic add up (companies × cheque against what
 *    is left after fees and reserves), is the portfolio big enough for the
 *    stage, are reserves and the ownership target consistent with the stage
 *    and the cheque, are the terms market, is the thesis focused, and is the
 *    fund a credible size for this manager.
 *  - Team: background, stars, what you learned from other investors, a firm.
 *  - Market: the city's capital depth and enough companies to back.
 *
 * Each LP asks questions about the weak points and answers with a reason
 * and, when it commits, an amount in its ticket range. `strategyChecks` is
 * pure arithmetic, so the client shows the same checks live as you type.
 */
import { markValue } from './captable.js';
import { managedFunds } from './career.js';
import { CAPITAL } from './data/capital.js';
import { backgroundById } from './data/characters.js';
import { LESSONS } from './data/dealflow.js';
import type { InvestorType, LpSeed } from './data/programs.js';
import type { MarketId } from './data/markets.js';
import { getMarket, usdToLocal } from './helpers.js';
import { valueIn } from './ledger.js';
import { clamp, clamp01, roundTo } from './math.js';
import type { Rng } from './rng.js';
import { STAGE_FLOOR_USD } from './valuation.js';
import { STAGES } from './types.js';
import type {
  CheckLevel,
  FundGeography,
  LpPanelReview,
  LpVerdict,
  Player,
  Stage,
  World,
} from './types.js';

/** A fund's strategy as pitched to LPs. Money in the fund's currency (minor units). */
export interface StrategyPlan {
  sectors: readonly string[];
  stages: readonly Stage[];
  geography: FundGeography;
  /** Target fund size. */
  size: number;
  avgCheque: number;
  companies: number;
  /** Share of the fund kept for follow-ons (0–1). */
  reserveRatio: number;
  /** Ownership aimed for at entry (0–1). */
  targetOwnership: number;
  feeRate: number;
  carry: number;
}

export interface StrategyCheck {
  id: 'deploy' | 'portfolio' | 'reserves' | 'ownership' | 'terms' | 'focus' | 'size' | 'geography';
  level: CheckLevel;
  values: Record<string, number>;
}

/** Fees over a fund's life, in years of the fee (ten years, stepping down). */
export const LIFETIME_FEE_YEARS = 8;

/** Companies a fund should back, by its earliest stage. */
const PORTFOLIO: Record<Stage, [number, number]> = {
  'pre-seed': [25, 60],
  seed: [20, 40],
  'series-a': [12, 25],
  'series-b': [8, 20],
  'series-c': [8, 20],
};

/** Reserves to keep for follow-ons, by earliest stage. */
const RESERVES: Record<Stage, [number, number]> = {
  'pre-seed': [0.4, 0.6],
  seed: [0.4, 0.6],
  'series-a': [0.3, 0.5],
  'series-b': [0.2, 0.4],
  'series-c': [0.2, 0.4],
};

const earliest = (stages: readonly Stage[]): Stage =>
  STAGES.find((s) => stages.includes(s)) ?? 'seed';

/**
 * A typical post-money at each stage in a city (local minor units): the
 * stage floor investors use (valuation.ts), scaled by the city's depth and
 * climate, plus the round itself (about a sixth of the company).
 */
export function typicalPostMoney(world: World, market: MarketId): Record<Stage, number> {
  const m = getMarket(world, market);
  const out = {} as Record<Stage, number>;
  for (const s of STAGES) {
    const pre = usdToLocal(
      world,
      m,
      STAGE_FLOOR_USD[s] * (m.data.multipleDiscount / 0.9) * m.climate,
    );
    out[s] = Math.round(pre * 1.2);
  }
  return out;
}

const band = (x: number, good: [number, number], warn: [number, number]): CheckLevel =>
  x >= good[0] && x <= good[1] ? 'good' : x >= warn[0] && x <= warn[1] ? 'warn' : 'bad';

/** The strategy's arithmetic and consistency, check by check (pure: the client runs it too). */
export function strategyChecks(
  plan: StrategyPlan,
  typicalPost: Record<Stage, number>,
): StrategyCheck[] {
  const stage = earliest(plan.stages);
  const fees = clamp01(plan.feeRate * LIFETIME_FEE_YEARS);
  const room = Math.max(0, Math.round(plan.size * (1 - fees) * (1 - plan.reserveRatio)));
  const need = Math.max(0, plan.companies * plan.avgCheque);
  const ratio = need / Math.max(1, room);
  const [lo, hi] = PORTFOLIO[stage];
  const [rlo, rhi] = RESERVES[stage];
  const implied = plan.avgCheque / Math.max(1, typicalPost[stage]);
  const own = plan.targetOwnership / Math.max(1e-6, implied);
  const terms: CheckLevel =
    plan.feeRate <= 0.02 + 1e-9 && plan.carry <= 0.2 + 1e-9
      ? 'good'
      : plan.feeRate <= 0.025 + 1e-9 && plan.carry <= 0.25 + 1e-9
        ? 'warn'
        : 'bad';
  const sectors = plan.sectors.length;
  const focus: CheckLevel =
    sectors >= 1 && sectors <= 3 && plan.stages.length <= 2
      ? 'good'
      : sectors <= 5 && plan.stages.length <= 3
        ? 'warn'
        : 'bad';
  let ownership = band(own, [0.67, 1.5], [0.4, 2.5]);
  // A minority investor rarely gets a quarter of a company at entry.
  if (plan.targetOwnership > 0.25 && ownership === 'good') ownership = 'warn';
  return [
    {
      id: 'deploy',
      level: band(ratio, [0.8, 1.15], [0.6, 1.4]),
      values: {
        need,
        room,
        fit: Math.floor(room / Math.max(1, plan.avgCheque)),
        companies: plan.companies,
        fees: roundTo(fees, 2),
      },
    },
    {
      id: 'portfolio',
      level: band(plan.companies, [lo, hi], [Math.round(lo * 0.6), Math.round(hi * 1.5)]),
      values: { companies: plan.companies, lo, hi },
    },
    {
      id: 'reserves',
      level: band(plan.reserveRatio, [rlo, rhi], [rlo - 0.15, rhi + 0.15]),
      values: { reserves: plan.reserveRatio, lo: rlo, hi: rhi },
    },
    {
      id: 'ownership',
      level: ownership,
      values: {
        implied: roundTo(implied, 3),
        target: plan.targetOwnership,
        post: typicalPost[stage],
      },
    },
    { id: 'terms', level: terms, values: { fee: plan.feeRate, carry: plan.carry } },
    { id: 'focus', level: focus, values: { sectors, stages: plan.stages.length } },
  ];
}

const LEVEL: Record<CheckLevel, number> = { good: 1, warn: 0.5, bad: 0 };

/** How coherent a strategy is, 0–1: the checks averaged (good 1, warn ½, bad 0). */
export const coherenceOf = (checks: readonly { level: CheckLevel }[]): number =>
  checks.length ? checks.reduce((a, c) => a + LEVEL[c.level], 0) / checks.length : 0;

// ---------------------------------------------------------------- the track record

/** A listed share bought on the market isn't a deal (as in funds.ts). */
function publicOnly(world: World, investorId: string, companyId: string, invested: number) {
  const basis = world.companies[companyId]?.ipo?.basis?.[investorId] ?? 0;
  return basis > 0 && basis >= invested;
}

/**
 * The manager's whole record in their home currency: personal deals, the
 * funds they run and syndicates they led. Realised = cash returned;
 * unrealised = today's marks of companies still operating.
 */
export function trackOf(world: World, p: Player): LpPanelReview['track'] {
  const home = getMarket(world, p.market).data.currency;
  const holders = new Set([p.id, ...managedFunds(world, p).map((f) => f.id)]);
  let invested = 0;
  let returned = 0;
  let unrealised = 0;
  let losses = 0;
  let deals = 0;
  for (const x of Object.values(world.positions)) {
    if (!holders.has(x.investorId) || publicOnly(world, x.investorId, x.companyId, x.invested))
      continue;
    const c = world.companies[x.companyId];
    const cur = c ? getMarket(world, c.market).data.currency : home;
    deals++;
    invested += valueIn(world, x.invested, cur, home);
    returned += valueIn(world, x.returned, cur, home);
    if (c && c.status === 'active' && !x.writtenOff)
      unrealised += valueIn(world, markValue(c.capTable, x.investorId), cur, home);
    else if (x.writtenOff || (c && c.status !== 'active' && x.returned < x.invested)) losses++;
  }
  deals += Object.values(world.syndicates ?? {}).filter(
    (s) => s.leadId === p.id && (s.status === 'closed' || s.status === 'exited'),
  ).length;
  return {
    deals,
    invested,
    returned,
    unrealised,
    tvpi: invested > 0 ? roundTo((returned + unrealised) / invested, 2) : 0,
    dpi: invested > 0 ? roundTo(returned / invested, 2) : 0,
    losses,
  };
}

// ---------------------------------------------------------------- the review

/** How each kind of LP weighs track record, strategy, team and market. */
const LENS: Record<string, { track: number; strategy: number; team: number; market: number }> = {
  'family-office': { track: 0.45, strategy: 0.2, team: 0.3, market: 0.05 },
  'dfi-fof': { track: 0.15, strategy: 0.35, team: 0.2, market: 0.3 },
  endowment: { track: 0.3, strategy: 0.45, team: 0.15, market: 0.1 },
  pension: { track: 0.55, strategy: 0.25, team: 0.1, market: 0.1 },
  sovereign: { track: 0.6, strategy: 0.2, team: 0.1, market: 0.1 },
};

/** What each reason id means, as an LP says it (inbox notes; the client words its own). */
export const REASON_TEXT: Record<string, string> = {
  'later-funds': 'We only back a manager’s second fund or later.',
  'bar-deals': 'We want more deals on your record first.',
  'bar-stars': 'We back managers with a stronger reputation.',
  'pass-track': 'Your track record is too thin for us yet.',
  'pass-dpi': 'Not yet: show us cash returned, not paper gains.',
  'pass-team': 'We need to know you and your team better.',
  'pass-market': 'We’re not convinced there are enough companies to back here.',
  'pass-strategy': 'The strategy doesn’t hang together yet.',
  'pass-deploy':
    'The maths doesn’t work: your companies and cheques don’t fit the fund after fees and reserves.',
  'pass-portfolio': 'The portfolio is the wrong size for the stage.',
  'pass-reserves': 'Your reserves don’t fit the stage: winners will need follow-on money.',
  'pass-ownership': 'Your cheque won’t buy the ownership you’re targeting at that stage.',
  'pass-terms': 'Your fees and carry are above market for this fund.',
  'pass-focus': 'The thesis is too broad for a fund this size.',
  'pass-size': 'The fund is too big for what you’ve shown so far.',
  'pass-geography': 'We doubt you can cover that geography yet.',
  'commit-track': 'Your track record speaks for itself.',
  'commit-strategy': 'The strategy is coherent and the maths adds up.',
  'commit-team': 'We back the team.',
  'commit-market': 'The market is deep and the timing is right.',
  'commit-emerging': 'We back emerging local managers, and your strategy adds up.',
};

/** Checks that make a strategy unfundable when they fail: the deploy maths, or two of these. */
const CORE: readonly StrategyCheck['id'][] = ['deploy', 'portfolio', 'reserves', 'ownership'];

/** An LP commits at or above this score. */
export const COMMIT_SCORE = 0.45;

export interface PitchContext {
  /** Fund number: 1 for a first fund. */
  number: number;
  /** The fund's investor type (an LP's `prefers`). */
  type: InvestorType;
  /** The previous fund's size, for a later fund (fund currency). */
  lastSize?: number;
  month: number;
}

/**
 * Review a fund pitch with these LPs: the four parts, the strategy checks,
 * the questions they ask and each LP's answer and amount (fund currency).
 */
export function reviewPitch(
  world: World,
  manager: Player,
  plan: StrategyPlan,
  lps: readonly LpSeed[],
  ctx: PitchContext,
  rng: Rng,
): LpPanelReview {
  const m = getMarket(world, manager.market);
  const track = trackOf(world, manager);
  const checks = strategyChecks(plan, typicalPostMoney(world, m.id));
  // Size against what this manager has shown: a first fund against what they invested
  // themselves, a later one against the last fund.
  const multiple = ctx.lastSize
    ? plan.size / Math.max(1, ctx.lastSize)
    : plan.size / Math.max(1, track.invested);
  checks.push({
    id: 'size',
    level: ctx.lastSize ? band(multiple, [0, 2.5], [0, 4]) : band(multiple, [0, 20], [0, 40]),
    values: { multiple: roundTo(multiple, multiple >= 10 ? 0 : 1), later: ctx.lastSize ? 1 : 0 },
  });
  // A first fund across the region needs people on the ground.
  checks.push({
    id: 'geography',
    level:
      plan.geography === 'region' && ctx.number < 2
        ? 'warn'
        : plan.geography === 'city' && CAPITAL[m.id].vcDepth < 0.15
          ? 'warn'
          : 'good',
    values: { first: ctx.number < 2 ? 1 : 0 },
  });
  const strategy = coherenceOf(checks);
  const bg = backgroundById(manager.backgroundId);
  const lessons = manager.dealflow?.lessons.length ?? 0;
  const knowledge = lessons / Math.max(1, LESSONS.length);
  const team = clamp01(
    (bg?.lpCredibility ?? 0.3) * 0.4 +
      (manager.stars.value / 5) * 0.3 +
      knowledge * 0.2 +
      (Object.values(world.firms ?? {}).some((f) => f.ownerId === manager.id) ? 0.1 : 0) +
      (ctx.number > 1 ? 0.1 : 0),
  );
  const trackPart = clamp01(
    (Math.min(track.deals, 12) / 12) * 0.35 +
      (clamp(track.tvpi - 0.5, 0, 2) / 2) * 0.3 +
      (Math.min(track.dpi, 1.5) / 1.5) * 0.35 -
      track.losses * 0.04,
  );
  // Market: the city's capital depth and enough companies in the thesis to back.
  const reach = plan.geography === 'city' ? 1 : plan.geography === 'country' ? 2 : 4;
  const inThesis = Object.values(world.companies).filter(
    (c) =>
      c.market === m.id &&
      c.status === 'active' &&
      (plan.sectors.length === 0 || plan.sectors.includes(c.industry)),
  ).length;
  const market = clamp01(
    Math.sqrt(CAPITAL[m.id].vcDepth) * 0.6 + Math.min(1, (inThesis * reach) / 10) * 0.4,
  );
  const parts = {
    track: roundTo(trackPart, 3),
    strategy: roundTo(strategy, 3),
    team: roundTo(team, 3),
    market: roundTo(market, 3),
  };
  const score = roundTo(0.35 * trackPart + 0.35 * strategy + 0.2 * team + 0.1 * market, 3);

  // Questions: the weak points first, then where deals come from and why you.
  const questions: LpPanelReview['questions'] = [];
  for (const c of checks)
    if (c.level !== 'good' && c.id !== 'focus')
      questions.push({ id: `q-${c.id}`, values: c.values });
  if (track.deals > 0 && track.dpi === 0)
    questions.push({ id: 'q-dpi', values: { deals: track.deals, tvpi: track.tvpi } });
  if (track.losses > 0) questions.push({ id: 'q-losses', values: { losses: track.losses } });
  const book = Object.values(manager.pipeline ?? {});
  questions.push({
    id: 'q-sourcing',
    values: {
      pipeline: book.filter((e) => e.stage !== 'passed').length,
      events: book.filter((e) => e.source === 'event' || e.source === 'referral').length,
    },
  });
  questions.push({ id: 'q-edge', values: { lessons, deals: track.deals } });

  // Each LP's answer, through its own lens.
  const cur = m.data.currency;
  const core = checks.filter((c) => CORE.includes(c.id) && c.level === 'bad');
  const broken = core.find((c) => c.id === 'deploy') ?? (core.length >= 2 ? core[0] : undefined);
  const verdicts: LpVerdict[] = [];
  let committed = 0;
  for (const lp of lps) {
    const w = LENS[lp.kind] ?? LENS.endowment!;
    const bar =
      ctx.number < 2 && (lp.kind === 'pension' || lp.kind === 'sovereign')
        ? 'later-funds'
        : track.deals < lp.minDeals
          ? 'bar-deals'
          : manager.stars.value < lp.minStars
            ? 'bar-stars'
            : null;
    const lpScore = roundTo(
      w.track * trackPart +
        w.strategy * strategy +
        w.team * team +
        w.market * market +
        (lp.prefers.includes(ctx.type) ? 0.05 : -0.05) +
        rng.normal(0, 0.03),
      3,
    );
    // The weakest (or strongest) part through this lens is the reason they give.
    const shortfalls = (['track', 'strategy', 'team', 'market'] as const).map((k) => ({
      k,
      gap: w[k] * (1 - parts[k]),
      gain: w[k] * parts[k],
    }));
    // Broken arithmetic is a no from every LP, whatever else is strong.
    const commit = !bar && !broken && lpScore >= COMMIT_SCORE;
    let reason: string;
    if (bar) reason = bar;
    else if (broken) reason = `pass-${broken.id}`;
    else if (commit) {
      const best = shortfalls.reduce((a, b) => (b.gain > a.gain ? b : a));
      reason = lp.kind === 'dfi-fof' && ctx.number < 2 ? 'commit-emerging' : `commit-${best.k}`;
    } else {
      const worst = shortfalls.reduce((a, b) => (b.gap > a.gap ? b : a));
      if (worst.k === 'strategy') {
        const weak =
          checks.find((c) => c.level === 'bad') ?? checks.find((c) => c.level === 'warn');
        reason = weak ? `pass-${weak.id}` : 'pass-strategy';
      } else if (worst.k === 'track') reason = track.dpi === 0 ? 'pass-dpi' : 'pass-track';
      else reason = `pass-${worst.k}`;
    }
    let amount = 0;
    if (commit) {
      const t = clamp01((lpScore - COMMIT_SCORE) / 0.35);
      const usd = lp.ticketUsd[0] + (lp.ticketUsd[1] - lp.ticketUsd[0]) * t;
      // An LP rarely takes more than 40% of a fund, and never past the target.
      amount = Math.min(
        usdToLocal(world, m, usd),
        Math.round(plan.size * 0.4),
        Math.max(0, plan.size - committed),
      );
      committed += amount;
    }
    verdicts.push({
      lpId: lp.id,
      name: lp.name,
      kind: lp.kind,
      commit: commit && amount > 0,
      amount,
      reason,
      score: lpScore,
    });
  }
  return {
    month: ctx.month,
    currency: cur,
    score,
    parts,
    track,
    checks: checks.map((c) => ({ id: c.id, level: c.level, values: c.values })),
    questions: questions.slice(0, 4),
    lps: verdicts,
    committed,
    target: plan.size,
    ok: committed > 0,
  };
}
