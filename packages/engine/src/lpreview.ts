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
import { getMarket, usdToLocal, isEstablished } from './helpers.js';
import { valueIn } from './ledger.js';
import { FIRST_FUND, INVESTOR } from './data/investor.js';
import {
  firstFundRecord,
  investorsMet,
  isCircle,
  nextStepsFor,
  suggestFundSize,
} from './firstfund.js';
import type { Prospect, SuggestedSize } from './firstfund.js';
import { moreGamesOn } from './releases.js';
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
export function publicOnly(world: World, investorId: string, companyId: string, invested: number) {
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
  // More-games note: the emerging-manager programme weighs the strategy and the person.
  emerging: { track: 0.2, strategy: 0.4, team: 0.25, market: 0.15 },
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
  // More-games note (firstfund.ts): first-time-manager LPs and the anchor.
  'first-only': 'We only back a manager’s first fund.',
  'bar-markups': 'We want to see a markup: a company you backed raising again at a higher price.',
  'circle-record': 'Do a few more deals and we’ll come in.',
  'pass-relationship': 'We don’t know you well enough yet.',
  'pass-full': 'The fund is full.',
  'wait-close': 'We’ll come in after your first close.',
  'commit-relationship': 'We know you, and we back you.',
  'commit-anchor': 'We anchor first funds we believe in.',
  'commit-anchored': 'With an anchor in, we’re in too.',
};

/** Checks that make a strategy unfundable when they fail: the deploy maths, or two of these. */
const CORE: readonly StrategyCheck['id'][] = ['deploy', 'portfolio', 'reserves', 'ownership'];

/** An LP commits at or above this score. */
const COMMIT_SCORE = 0.45;

export interface PitchContext {
  /** Fund number: 1 for a first fund. */
  number: number;
  /** The fund's investor type (an LP's `prefers`). */
  type: InvestorType;
  /** The previous fund's size, for a later fund (fund currency). */
  lastSize?: number;
  month: number;
  /** More-games note: an anchor already in (a career anchor, or the fund's after its first close). */
  anchor?: { name: string; amount: number; lpId?: string };
  /** More-games note: already committed (a rolling close): commitments stop at the target. */
  committed?: number;
  /** More-games note: a re-review after the first close (the close lifts LPs a little). */
  rolling?: boolean;
}

/**
 * Size a strategy to a fund (pure, the client's "Use this size" too): the
 * stage's smallest sensible portfolio, mid-range reserves, the cheque that
 * fills what is left after fees, and the ownership that cheque buys.
 */
export function fitPlanToSize(
  size: number,
  stages: readonly Stage[],
  typicalPost: Record<Stage, number>,
  feeRate = 0.02,
): Pick<StrategyPlan, 'avgCheque' | 'companies' | 'reserveRatio' | 'targetOwnership'> {
  const stage = earliest(stages);
  const companies = PORTFOLIO[stage][0];
  const reserveRatio = roundTo((RESERVES[stage][0] + RESERVES[stage][1]) / 2, 2);
  const room = size * (1 - clamp01(feeRate * LIFETIME_FEE_YEARS)) * (1 - reserveRatio);
  const raw = Math.max(1, Math.floor(room / companies));
  // A round cheque, never more than the room allows.
  const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(raw)) - 1));
  const avgCheque = Math.max(1, Math.floor(raw / step) * step);
  const targetOwnership = Math.min(
    0.5,
    Math.max(0.001, roundTo(avgCheque / Math.max(1, typicalPost[stage]), 4)),
  );
  return { avgCheque, companies, reserveRatio, targetOwnership };
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
  // More-games note: a first fund is sized against what LPs take seriously from the record.
  const record = moreGamesOn(world) ? firstFundRecord(world, manager) : null;
  const suggested = record && !ctx.lastSize ? suggestFundSize(record) : null;
  if (suggested) {
    const over = plan.size / Math.max(1, suggested.hi);
    checks.push({
      id: 'size',
      level: over <= 1 ? 'good' : over <= FIRST_FUND.breakAt ? 'warn' : 'bad',
      values: {
        multiple: roundTo(plan.size / Math.max(1, suggested.size), 1),
        suggested: suggested.size,
        upTo: suggested.hi,
        size: plan.size,
        later: 0,
      },
    });
  } else {
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
  }
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
      track.losses * 0.04 +
      // More-games note: a markup is proof others priced your picks higher.
      (record ? Math.min(record.markups, 2) * 0.06 : 0),
  );
  // Market: the city's capital depth and enough companies in the thesis to back.
  const reach = plan.geography === 'city' ? 1 : plan.geography === 'country' ? 2 : 4;
  const inThesis = Object.values(world.companies).filter(
    (c) =>
      c.market === m.id &&
      c.status === 'active' &&
      !isEstablished(c) &&
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
  if (record && record.markups === 0 && track.deals > 0)
    questions.splice(Math.max(0, questions.length - 2), 0, {
      id: 'q-markups',
      values: { deals: track.deals },
    });

  // Each LP's answer, through its own lens.
  const cur = m.data.currency;
  const core = checks.filter((c) => CORE.includes(c.id) && c.level === 'bad');
  const broken = core.find((c) => c.id === 'deploy') ?? (core.length >= 2 ? core[0] : undefined);
  if (record && suggested)
    return firstFundVerdicts(world, manager, plan, lps, ctx, rng, {
      track,
      checks,
      parts,
      score,
      questions,
      record,
      suggested,
      // Far above what the record supports, nobody takes the pitch seriously.
      broken: broken ?? checks.find((c) => c.id === 'size' && c.level === 'bad'),
    });
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

/** An LP's commitment range for this fund (local minor units). */
function ticketOf(
  world: World,
  lp: Prospect,
  size: number,
  m: ReturnType<typeof getMarket>,
): readonly [number, number] {
  if (lp.ticketShare) return [size * lp.ticketShare[0], size * lp.ticketShare[1]];
  if (lp.ticketLocal) return lp.ticketLocal;
  return [usdToLocal(world, m, lp.ticketUsd[0]), usdToLocal(world, m, lp.ticketUsd[1])];
}

const PARTS = ['track', 'strategy', 'team', 'market'] as const;

/**
 * More-games note: the LPs' answers on a first fund (firstfund.ts). The
 * city's LPs keep their bars and lenses; the emerging-manager programme has
 * a lower bar but wants five deals and a markup; angels and friends commit
 * on relationship and reputation. The first LP that commits 20–30% of the
 * target anchors the fund and lifts everyone else a little. When the fund
 * can't close, the review says what to do next.
 */
function firstFundVerdicts(
  world: World,
  manager: Player,
  plan: StrategyPlan,
  lps: readonly Prospect[],
  ctx: PitchContext,
  rng: Rng,
  r: {
    track: LpPanelReview['track'];
    checks: StrategyCheck[];
    parts: LpPanelReview['parts'];
    score: number;
    questions: LpPanelReview['questions'];
    record: ReturnType<typeof firstFundRecord>;
    suggested: SuggestedSize;
    broken: StrategyCheck | undefined;
  },
): LpPanelReview {
  const F = FIRST_FUND;
  const m = getMarket(world, manager.market);
  const { track, parts, record, broken } = r;
  const stars = manager.stars.value;
  const size = plan.size;
  // Pass 1: bars and scores, in the pool's order (one draw each).
  const judged = lps.map((lp) => {
    let bar: string | null = null;
    let values: Record<string, number> | undefined;
    if (lp.firstOnly && ctx.number >= 2) bar = 'first-only';
    else if (ctx.number < 2 && (lp.kind === 'pension' || lp.kind === 'sovereign'))
      bar = 'later-funds';
    else if (isCircle(lp.kind) && track.deals < F.circle.minDeals) {
      bar = 'circle-record';
      values = { need: F.circle.minDeals, have: track.deals };
    } else if (track.deals < lp.minDeals) {
      bar = 'bar-deals';
      values = { need: lp.minDeals, have: track.deals };
    } else if (record.markups < (lp.minMarkups ?? 0)) {
      bar = 'bar-markups';
      values = { need: lp.minMarkups ?? 0, have: record.markups };
    } else if (stars < lp.minStars) {
      bar = 'bar-stars';
      values = { need: lp.minStars, have: roundTo(stars, 1) };
    }
    let score: number;
    let at: number;
    if (isCircle(lp.kind)) {
      score =
        0.25 +
        (lp.warmth ?? 0) * 0.4 +
        (stars / 5) * 0.2 +
        (Math.min(track.deals, 5) / 5) * 0.15 +
        rng.normal(0, 0.03);
      at = F.circle.score;
    } else {
      const w = LENS[lp.kind] ?? LENS.endowment!;
      score =
        w.track * parts.track +
        w.strategy * parts.strategy +
        w.team * parts.team +
        w.market * parts.market +
        (lp.prefers.includes(ctx.type) ? 0.05 : -0.05) +
        rng.normal(0, 0.03);
      at = lp.kind === 'emerging' ? F.emerging.score : COMMIT_SCORE;
    }
    if (ctx.rolling) score += F.rollingLift;
    const [lo, hi] = ticketOf(world, lp, size, m);
    return { lp, bar, values, score, at, lo, hi };
  });
  type Judged = (typeof judged)[number];
  const willing = (j: Judged, lift = 0) => !j.bar && !broken && j.score + lift >= j.at;
  // The anchor: one already in, or the first LP willing to put in 20–30% of the target.
  const career = ctx.anchor && !ctx.rolling ? ctx.anchor : undefined;
  const anchorJ = ctx.anchor
    ? undefined
    : judged.find((j) => willing(j) && j.hi >= size * F.anchorShare[0]);
  const lift = ctx.anchor || anchorJ ? F.anchorLift : 0;
  // Room: never past the target (a rolling close counts what is already in).
  let room = Math.max(0, size - (ctx.committed ?? 0) - (career?.amount ?? 0));
  const amountOf = (j: Judged, s: number) => j.lo + (j.hi - j.lo) * clamp01((s - j.at) / 0.35);
  const amounts = new Map<string, number>();
  // Once a first close is covered, the other willing LPs wait for it and join after (rolling).
  const need = Math.round(size * INVESTOR.fund.firstCloseShare);
  const waiting = new Map<string, number>();
  let total = career?.amount ?? 0;
  if (anchorJ) {
    const want = Math.min(amountOf(anchorJ, anchorJ.score), size * F.anchorShare[1], anchorJ.hi);
    const a = Math.round(Math.min(room, Math.max(size * F.anchorShare[0], want)));
    amounts.set(anchorJ.lp.id, a);
    room -= a;
    total += a;
  }
  for (const j of judged) {
    if (j === anchorJ || !willing(j, lift)) continue;
    const a = Math.round(Math.min(amountOf(j, j.score + lift), size * 0.4, room));
    if (!ctx.rolling && total >= need) {
      waiting.set(j.lp.id, a);
      continue;
    }
    amounts.set(j.lp.id, a);
    room -= a;
    total += a;
  }
  const verdicts: LpVerdict[] = [];
  if (career)
    verdicts.push({
      lpId: career.lpId ?? 'anchor',
      name: career.name,
      kind: 'dfi-fof',
      commit: true,
      amount: career.amount,
      reason: 'commit-anchor',
      score: 1,
      anchor: true,
    });
  for (const j of judged) {
    const amount = amounts.get(j.lp.id) ?? 0;
    const commit = amount > 0;
    const isAnchor = j === anchorJ;
    const w = LENS[j.lp.kind] ?? LENS.endowment!;
    let reason: string;
    if (j.bar) reason = j.bar;
    else if (broken) reason = `pass-${broken.id}`;
    else if (commit) {
      const best = PARTS.reduce((a, b) => (w[b] * parts[b] > w[a] * parts[a] ? b : a));
      reason =
        !isAnchor && j.score < j.at
          ? 'commit-anchored'
          : isCircle(j.lp.kind)
            ? 'commit-relationship'
            : isAnchor && j.lp.kind !== 'emerging'
              ? 'commit-anchor'
              : j.lp.kind === 'emerging' || (j.lp.kind === 'dfi-fof' && ctx.number < 2)
                ? 'commit-emerging'
                : `commit-${best}`;
    } else if (waiting.has(j.lp.id)) reason = 'wait-close';
    else if (willing(j, lift)) reason = 'pass-full';
    else if (isCircle(j.lp.kind)) reason = 'pass-relationship';
    else {
      const worst = PARTS.reduce((a, b) => (w[b] * (1 - parts[b]) > w[a] * (1 - parts[a]) ? b : a));
      if (worst === 'strategy') {
        const weak =
          r.checks.find((c) => c.level === 'bad') ?? r.checks.find((c) => c.level === 'warn');
        reason = weak ? `pass-${weak.id}` : 'pass-strategy';
      } else if (worst === 'track') reason = track.dpi === 0 ? 'pass-dpi' : 'pass-track';
      else reason = `pass-${worst}`;
    }
    verdicts.push({
      lpId: j.lp.id,
      name: j.lp.name,
      kind: j.lp.kind,
      commit,
      amount,
      reason,
      score: roundTo(j.score, 3),
      ...(isAnchor ? { anchor: true } : {}),
      ...(j.values ? { values: j.values } : {}),
      ...(waiting.has(j.lp.id) ? { values: { amount: waiting.get(j.lp.id)! } } : {}),
    });
  }
  const committed = verdicts.reduce((a, v) => a + v.amount, 0);
  const ok = ctx.rolling ? committed > 0 : committed >= need;
  const anchor =
    career ??
    (anchorJ ? { name: anchorJ.lp.name, amount: amounts.get(anchorJ.lp.id) ?? 0 } : ctx.anchor);
  const strategyBroken = r.checks.some((c) => CORE.includes(c.id) && c.level === 'bad');
  return {
    month: ctx.month,
    currency: m.data.currency,
    score: r.score,
    parts,
    track: { ...track, markups: record.markups },
    checks: r.checks.map((c) => ({ id: c.id, level: c.level, values: c.values })),
    questions: r.questions.slice(0, 4),
    lps: verdicts,
    committed,
    target: size,
    ok,
    suggested: { lo: r.suggested.lo, size: r.suggested.size, hi: r.suggested.hi },
    need,
    ...(anchor && committed > 0 ? { anchor: { name: anchor.name, amount: anchor.amount } } : {}),
    ...(!ok && !ctx.rolling
      ? {
          nextSteps: nextStepsFor(record, r.suggested, {
            asked: size,
            strategy: strategyBroken,
            met: investorsMet(manager),
            ...(verdicts.some((v) => v.reason === 'bar-stars') && stars < 2 ? { stars } : {}),
          }),
        }
      : {}),
  };
}
