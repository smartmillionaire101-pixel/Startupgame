/**
 * A realistic first fund (player feedback, 23 October 2026: a new angel
 * pitching a ₦1.6bn Fund I is passed by every LP, with no path for a
 * first-time manager). More-games note worlds only (releases.ts).
 *
 *  - Suggested size: a pure function of the record (capital deployed,
 *    deals, markups, cash returned, lessons from other investors and
 *    reputation): 10–50× what you deployed yourself, with a floor in months
 *    of the city's cost of living (about ₦100–300m in Lagos for a new
 *    investor with a handful of deals). The LP review's size check uses it.
 *  - First-time-manager LPs: an emerging-manager programme (Fund I only, a
 *    lower bar, but five deals and a markup) and your circle: angels you met
 *    at events and friends and family, who commit small tickets on
 *    relationship and reputation. The city's LPs keep their bars.
 *  - The anchor: the first commitment of 20–30% of the target lifts every
 *    other LP's score a little (lpreview.ts).
 *  - Rolling closes: Fund I holds its first close at half the target and
 *    invests; LPs that passed re-review each month (or when pitched again)
 *    and join with a catch-up, up to the target, then the final close. The
 *    closes, commitments and calls are lpfunds.ts's own.
 *  - Next steps: when LPs pass, concrete actions computed from the gap.
 *
 * Determinism: the panel's RNG stream is the deal-flow one; a rolling
 * re-review draws from its own 'firstfund' stream keyed by fund and month.
 */
import { markValue } from './captable.js';
import { managedFunds } from './career.js';
import { LESSONS } from './data/dealflow.js';
import { FIRST_FUND, INVESTOR } from './data/investor.js';
import type { LpSeed } from './data/programs.js';
import type { MarketId } from './data/markets.js';
import { warmthWith } from './events.js';
import { col, getMarket, notify } from './helpers.js';
import { aiLpCommit, committedTotal, finalClose } from './lpfunds.js';
import { publicOnly, reviewPitch, trackOf } from './lpreview.js';
import type { StrategyPlan } from './lpreview.js';
import { clamp01, roundTo } from './math.js';
import { formatMoney } from './money.js';
import { fundInvestorType, lpsOf } from './programs.js';
import { deriveRng } from './rng.js';
import type { Fund, Player, World } from './types.js';

// ---------------------------------------------------------------- the record and the size

/** What a first fund's size is judged on, in the manager's home currency (minor units). */
export interface FirstFundRecord {
  /** Personal capital deployed into private deals (and any fund's). */
  invested: number;
  returned: number;
  deals: number;
  /** Companies you backed that raised a later round at a higher price. */
  markups: number;
  dpi: number;
  lessons: number;
  lessonsTotal: number;
  stars: number;
  /** A month of the city's cost of living (minor units). */
  monthCost: number;
}

export interface SuggestedSize {
  lo: number;
  /** The size to pitch. */
  size: number;
  /** LPs take you seriously up to about this. */
  hi: number;
  /** The multiple of capital deployed behind it. */
  multiple: number;
}

/**
 * Companies a manager backed that raised again at a higher price: a round
 * after the entry, with the stake now marked above what went in.
 */
export function markupsOf(world: World, p: Player): number {
  const holders = new Set([p.id, ...managedFunds(world, p).map((f) => f.id)]);
  const seen = new Set<string>();
  for (const x of Object.values(world.positions)) {
    if (!holders.has(x.investorId) || x.writtenOff || seen.has(x.companyId)) continue;
    if (publicOnly(world, x.investorId, x.companyId, x.invested)) continue;
    const c = world.companies[x.companyId];
    if (!c || c.status !== 'active') continue;
    const marked = [...(x.marks ?? [])].reverse().find((k) => k.source === 'round');
    const raisedSince = c.lastRaiseMonth !== null && c.lastRaiseMonth > x.month;
    // A SAFE is marked up when someone else's later money values the company above its cap.
    const mine = c.capTable.safes.filter((s) => s.holderId === x.investorId);
    const safeUp = mine.some((s) =>
      c.capTable.safes.some((o) => !holders.has(o.holderId) && o.month > s.month && o.cap > s.cap),
    );
    const up =
      (marked !== undefined && marked.month > x.month && marked.value > x.invested) ||
      (raisedSince && (safeUp || markValue(c.capTable, x.investorId) > x.invested));
    if (up) seen.add(x.companyId);
  }
  return seen.size;
}

export function firstFundRecord(world: World, p: Player): FirstFundRecord {
  const t = trackOf(world, p);
  return {
    invested: t.invested,
    returned: t.returned,
    deals: t.deals,
    markups: markupsOf(world, p),
    dpi: t.dpi,
    lessons: p.dealflow?.lessons.length ?? 0,
    lessonsTotal: LESSONS.length,
    stars: p.stars.value,
    monthCost: col(getMarket(world, p.market)),
  };
}

/** Two significant figures, so a size reads like one a manager would pitch. */
export const niceAmount = (v: number): number => {
  if (v <= 0) return 0;
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
  return Math.round(v / p) * p;
};

/**
 * The Fund I size LPs take seriously from this record (pure): 10–50× the
 * capital deployed, never below a floor in months of the city's cost of
 * living that grows with deals, markups, cash returned, lessons and stars.
 */
export function suggestFundSize(r: FirstFundRecord): SuggestedSize {
  const F = FIRST_FUND;
  const deals = Math.min(Math.max(0, r.deals), F.dealsCap);
  const markups = Math.min(Math.max(0, r.markups), F.markupsCap);
  const dpi = Math.min(Math.max(0, r.dpi), F.dpiCap);
  const knowledge = r.lessonsTotal > 0 ? clamp01(r.lessons / r.lessonsTotal) : 0;
  const rep = clamp01((r.stars - 2) / 3);
  const M = F.multiple;
  const multiple = Math.min(
    M.max,
    M.base +
      M.perDeal * deals +
      M.perMarkup * markups +
      M.perDpi * dpi +
      M.knowledge * knowledge +
      M.reputation * rep,
  );
  const L = F.floorMonths;
  const months =
    L.base +
    L.perDeal * deals +
    L.perMarkup * markups +
    L.perDpi * dpi +
    L.knowledge * knowledge +
    L.reputation * rep;
  const size = niceAmount(Math.max(r.invested * multiple, months * r.monthCost));
  return {
    lo: niceAmount(size * F.lo),
    size,
    hi: niceAmount(size * F.hi),
    multiple: roundTo(multiple, 1),
  };
}
// ---------------------------------------------------------------- the first-time-manager LPs

/** An LP judging a first fund: a city LP, or one of the first-time-manager pool. */
export interface Prospect extends LpSeed {
  /** Commitment range as shares of the target (the emerging-manager programme). */
  ticketShare?: readonly [number, number];
  /** Commitment range, local minor units (angels, friends and family). */
  ticketLocal?: readonly [number, number];
  minMarkups?: number;
  /** Backs a manager's first fund only. */
  firstOnly?: boolean;
  /** How well they know you, 0–1 (angels, friends and family). */
  warmth?: number;
}

export const isCircle = (kind: string) => kind === 'angel' || kind === 'friends';

/** The city's emerging-manager programme (a fund-of-funds / DFI window for Fund I managers). */
export function emergingProgramme(world: World, market: MarketId): Prospect {
  const m = getMarket(world, market);
  const E = FIRST_FUND.emerging;
  return {
    id: `${market}-emerging-programme`,
    name: `${m.data.name} Emerging Managers Programme`,
    kind: 'emerging',
    ticketUsd: [0, 0],
    ticketShare: E.share,
    prefers: ['vc', 'impact', 'angel'],
    minDeals: E.minDeals,
    minMarkups: E.minMarkups,
    minStars: E.minStars,
    firstOnly: true,
    pitch: 'Backs first funds only: a lower bar, but a real record of deals and a markup.',
    look: { color: '#0369a1', accent: '#ffffff' },
  };
}

/** Angels and fund partners you talked to at events, newest first, and friends and family. */
function circleOf(world: World, p: Player, market: MarketId): Prospect[] {
  const C = FIRST_FUND.circle;
  const cost = col(getMarket(world, market));
  const month = getMarket(world, p.market).month;
  const out: Prospect[] = [];
  const seen = new Set<string>();
  for (const t of p.dealflow?.talks ?? []) {
    if (seen.has(t.fundId) || out.length >= C.angels) continue;
    seen.add(t.fundId);
    out.push({
      id: `circle:${t.fundId}`,
      name: t.name,
      kind: 'angel',
      ticketUsd: [0, 0],
      ticketLocal: [C.angelMonths[0] * cost, C.angelMonths[1] * cost],
      prefers: ['angel', 'vc', 'impact', 'corporate'],
      minDeals: 0,
      minStars: 0,
      warmth: Math.max(C.minWarmth, warmthWith(world, p, 'fund', t.fundId, month)),
      pitch: 'An investor you met: backs people they know with a small cheque.',
      look: { color: '#475569', accent: '#ffffff' },
    });
  }
  out.push({
    id: `friends:${p.id}`,
    name: 'Friends and family',
    kind: 'friends',
    ticketUsd: [0, 0],
    ticketLocal: [C.friendsMonths[0] * cost, C.friendsMonths[1] * cost],
    prefers: ['angel', 'vc', 'impact', 'corporate'],
    minDeals: 0,
    minStars: 0,
    warmth: C.friendsWarmth,
    pitch: 'People who know you best: small cheques on trust.',
    look: { color: '#a16207', accent: '#ffffff' },
  });
  return out;
}

/** Everyone a first fund is pitched to: the programme (the natural anchor), the city's LPs, your circle. */
export const firstFundPool = (world: World, p: Player, market: MarketId): Prospect[] => [
  emergingProgramme(world, market),
  ...lpsOf(market),
  ...circleOf(world, p, market),
];

/** Investors you've talked strategy with (distinct people). */
export const investorsMet = (p: Player): number =>
  new Set((p.dealflow?.talks ?? []).map((t) => t.fundId)).size;

// ---------------------------------------------------------------- next steps

export interface NextStep {
  id: 'deals' | 'markup' | 'size' | 'strategy' | 'meet' | 'reputation' | 'again';
  values: Record<string, number>;
}

/**
 * What to do when LPs pass, computed from the gap: deals and a markup for
 * the emerging-manager bar, a size that fits the record, a strategy that
 * adds up, and more investors met (your circle). At most four.
 */
export function nextStepsFor(
  r: FirstFundRecord,
  suggested: SuggestedSize,
  gap: { asked?: number; strategy?: boolean; met: number; stars?: number },
): NextStep[] {
  const F = FIRST_FUND;
  const steps: NextStep[] = [];
  if (r.deals < F.readyDeals) steps.push({ id: 'deals', values: { n: F.readyDeals - r.deals } });
  if (r.markups < F.readyMarkups)
    steps.push({ id: 'markup', values: { n: F.readyMarkups - r.markups } });
  if (gap.asked !== undefined && gap.asked > suggested.hi)
    steps.push({ id: 'size', values: { size: suggested.size, asked: gap.asked } });
  if (gap.strategy) steps.push({ id: 'strategy', values: {} });
  if (gap.met < F.readyInvestors)
    steps.push({ id: 'meet', values: { n: F.readyInvestors - gap.met } });
  if (gap.stars !== undefined)
    steps.push({ id: 'reputation', values: { stars: roundTo(gap.stars, 1) } });
  if (!steps.length) steps.push({ id: 'again', values: {} });
  return steps.slice(0, 4);
}

// ---------------------------------------------------------------- rolling closes

/** The strategy a fund was pitched on, from its LP book. */
function fundPlan(f: Fund): StrategyPlan {
  const book = f.lp!;
  const plan = book.plan!;
  return {
    sectors: f.sectors === 'any' ? [] : f.sectors,
    stages: f.stages,
    geography: plan.geography ?? 'city',
    size: book.terms.target,
    avgCheque: plan.avgCheque,
    companies: plan.companies,
    reserveRatio: plan.reserveRatio,
    targetOwnership: plan.targetOwnership ?? 0.1,
    feeRate: book.terms.feeRate,
    carry: book.terms.carry,
  };
}

/** The anchor already in a fund (its first close), for the review's anchor lift. */
export function fundAnchor(f: Fund) {
  const c = f.lp?.commitments.find((x) => x.anchor && x.status === 'committed');
  return c ? { name: c.name, amount: c.committed, ...(c.lpId ? { lpId: c.lpId } : {}) } : undefined;
}

/**
 * Month end after a first close: LPs not yet in re-review (the close lifts
 * them), and the most willing joins with a catch-up, never past the target.
 * At the target the fund holds its final close.
 */
export function rollingClose(world: World, f: Fund, month: number) {
  const book = f.lp;
  const manager = f.managerId ? world.players[f.managerId] : undefined;
  if (!book?.plan || !manager) return;
  const target = book.terms.target;
  if (committedTotal(f) < target) {
    const have = new Set(book.commitments.flatMap((c) => (c.lpId ? [c.lpId] : [])));
    const prospects = firstFundPool(world, manager, f.market).filter((x) => !have.has(x.id));
    if (!prospects.length) return;
    const review = reviewPitch(
      world,
      manager,
      fundPlan(f),
      prospects,
      {
        number: book.number,
        type: fundInvestorType(f),
        month,
        rolling: true,
        committed: committedTotal(f),
        ...(fundAnchor(f) ? { anchor: fundAnchor(f)! } : {}),
      },
      deriveRng(world.seed, 'firstfund', 'rolling', f.id, month),
    );
    const joins = review.lps
      .filter((v) => v.commit && v.amount > 0)
      .sort((a, b) => b.score - a.score || (a.lpId < b.lpId ? -1 : 1))
      .slice(0, FIRST_FUND.rollingJoinsPerMonth);
    const cur = getMarket(world, f.market).data.currency;
    for (const v of joins) {
      const amount = Math.min(v.amount, target - committedTotal(f));
      const seed = prospects.find((x) => x.id === v.lpId);
      if (amount <= 0 || !seed) break;
      aiLpCommit(world, f, seed, amount, month);
      notify(world, manager.id, {
        month: getMarket(world, manager.market).month,
        kind: 'deal',
        text: `${v.name} joined ${f.name} after its first close: ${formatMoney(amount, cur)} (with a catch-up).`,
      });
    }
  }
  if (committedTotal(f) >= target) finalClose(world, f, month);
}

/** Months a first fund keeps its doors open after the first close. */
const ROLLING_MONTHS = INVESTOR.fund.finalCloseMonths;

// ---------------------------------------------------------------- the view

/**
 * `investorDealFlow.firstFund`: the size LPs take seriously from your
 * record, what the emerging-manager programme wants, your next steps before
 * you pitch, and (once Fund I holds its first close) the rolling close.
 */
export function firstFundView(world: World, p: Player) {
  const r = firstFundRecord(world, p);
  const suggested = suggestFundSize(r);
  const met = investorsMet(p);
  const F = FIRST_FUND;
  const fund = managedFunds(world, p).find((f) => f.lp?.rolling);
  const book = fund?.lp;
  const month = getMarket(world, p.market).month;
  return {
    suggested,
    record: {
      deals: r.deals,
      markups: r.markups,
      invested: r.invested,
      returned: r.returned,
      lessons: r.lessons,
      investorsMet: met,
    },
    ready: r.deals >= F.readyDeals && r.markups >= F.readyMarkups && met >= F.readyInvestors,
    steps: nextStepsFor(r, suggested, { met }).filter((s) => s.id !== 'again'),
    programme: {
      name: emergingProgramme(world, p.market).name,
      minDeals: F.emerging.minDeals,
      minMarkups: F.emerging.minMarkups,
    },
    firstCloseShare: INVESTOR.fund.firstCloseShare,
    fund:
      fund && book
        ? {
            id: fund.id,
            name: fund.name,
            stage: book.stage,
            target: book.terms.target,
            committed: committedTotal(fund),
            firstCloseMonth: book.firstCloseMonth ?? null,
            finalCloseMonth: book.finalCloseMonth ?? null,
            /** The final close happens by this month at the latest. */
            closesBy: (book.firstCloseMonth ?? month) + ROLLING_MONTHS,
            month,
            joined: book.commitments
              .filter(
                (c) =>
                  c.kind !== 'gp' &&
                  book.firstCloseMonth !== undefined &&
                  c.month > book.firstCloseMonth,
              )
              .map((c) => ({ name: c.name, kind: c.kind, amount: c.committed, month: c.month })),
          }
        : null,
  };
}
