/**
 * Visible rivals (Founder Journey 4a; blueprint §6.7, §9.4, FR-021).
 *
 * Every industry a human founder works in gets two or three named rivals in
 * that city. They are the city's AI startups in the same industry where there
 * are some (their funding, product, price, stars and customers are read from
 * the real company each month), topped up with lightweight abstract rivals
 * when there aren't enough. Abstract rivals are a few numbers on a cheap
 * monthly update (§9.4: no full simulation for distant entities).
 *
 * Each rival moves on a schedule (every 2–4 months): it raises, launches a
 * feature, cuts its price, tries to poach someone, or wins a deal. What it
 * picks follows from its state and style, so every move reads as a reason:
 * "Kopapay cut prices 20% after raising ₦50m". Moves make the news and feed
 * the competition events in decisions.ts.
 *
 * A price cut, or a clearly better product, weighs a little on a founder's
 * win chance (sales.ts) and segment score (customers.ts) — only in worlds
 * where the journey-events release note is logged (releases.ts), and never
 * while the founder's own response (an edge) holds. Rivals never touch the
 * AI startup they mirror, and their "funding" is a figure in the press, not
 * money on the ledger.
 */
import { CITY_NAME_PARTS } from './data/business-names.js';
import { AI_STARTUP_PREFIXES, AI_STARTUP_SUFFIXES } from './data/fiction.js';
import type { Industry } from './data/industries.js';
import type { MarketId } from './data/markets.js';
import { col, getMarket, publish, totalCustomers } from './helpers.js';
import { clamp, clamp01 } from './math.js';
import { formatMoney, scale } from './money.js';
import { normaliseName } from './names.js';
import { journeyEventsOn } from './releases.js';
import { deriveRng } from './rng.js';
import type { Rng } from './rng.js';
import type { Company, MarketState, Rival, RivalMove, RivalMoveKind, World } from './types.js';

export const RIVALS = {
  min: 2,
  max: 3,
  /** Moves remembered per rival. */
  keepMoves: 6,
  /** Months between a rival's moves. */
  every: [2, 4] as [number, number],
  /** A price cut: this many percent, lasting this many months. */
  cutPct: [10, 25] as [number, number],
  cutMonths: 4,
  /** Score lost per 100% of a rival's price cut (a 20% cut costs 0.016). */
  cutWeight: 0.08,
  /** A rival product this far ahead of yours costs a little too. */
  productLead: 0.15,
  productWeight: 0.006,
  /** Never more than this off a score or a win chance. */
  pressureCap: 0.04,
  /** An abstract raise, in months of the city's cost of living. */
  raiseCol: [20, 80] as [number, number],
} as const;

const FEATURES: Record<string, string[]> = {
  default: [
    'a mobile app',
    'team accounts',
    'an analytics dashboard',
    'an open API',
    'offline mode',
  ],
  fintech: ['instant payouts', 'a merchant app', 'cheaper transfers', 'a savings wallet'],
  saas: ['a free tier', 'integrations', 'an AI assistant', 'single sign-on'],
};

const humanFounded = (world: World, c: Company) =>
  !c.ai &&
  c.status === 'active' &&
  c.founderIds.some((f) => world.players[f] && !world.players[f]!.ai);

/** Industries human founders work in, in this city. */
function founderIndustries(world: World, market: MarketId): Industry[] {
  const set = new Set<Industry>();
  for (const c of Object.values(world.companies))
    if (c.market === market && humanFounded(world, c)) set.add(c.industry);
  return [...set].sort();
}

const budgetOf = (m: MarketState, industry: Industry): number => {
  const segs = Object.values(m.segments).filter((s) => s.industry === industry);
  return segs.length ? Math.max(1, segs[0]!.budget) : 1;
};

/** Money investors have put into a company (what the press reports as raised). */
function raisedOf(world: World, c: Company): number {
  let n = 0;
  for (const p of Object.values(world.positions)) if (p.companyId === c.id) n += p.invested;
  return n;
}

function syncFromCompany(m: MarketState, r: Rival, c: Company) {
  r.name = c.name;
  r.maturity = Math.round(clamp01((c.product.fit + c.product.quality) / 2) * 100) / 100;
  r.reputation = Math.round(c.stars.value * 10) / 10;
  r.customers = totalCustomers(c);
  r.priceIndex = Math.round((c.price / budgetOf(m, c.industry)) * 100) / 100;
}

function rivalFromCompany(world: World, m: MarketState, c: Company, rng: Rng): Rival {
  const r: Rival = {
    id: `rv-${c.id}`,
    companyId: c.id,
    name: c.name,
    industry: c.industry,
    goal: rng.pick(['growth', 'profit', 'dominate'] as const),
    style: rng.pick(['price', 'product', 'sales'] as const),
    funding: raisedOf(world, c),
    maturity: 0,
    priceIndex: 1,
    reputation: 0,
    customers: 0,
    nextMoveMonth: m.month + rng.int(1, RIVALS.every[1]),
    status: 'active',
    moves: [],
  };
  syncFromCompany(m, r, c);
  return r;
}

function abstractRival(world: World, m: MarketState, industry: Industry, rng: Rng): Rival | null {
  const used = new Set(
    Object.values(m.rivals ?? {})
      .flat()
      .map((r) => r!.name),
  );
  for (let i = 0; i < 12; i++) {
    const name = `${rng.pick(AI_STARTUP_PREFIXES)}${rng.pick(AI_STARTUP_SUFFIXES)}`;
    const handle = normaliseName(name);
    // Never a name a company here already uses (rivals don't reserve one).
    if (used.has(name) || world.names[m.id]?.[handle]) continue;
    return {
      id: `rv-${m.id}-${industry}-${handle}`,
      companyId: null,
      name,
      industry,
      goal: rng.pick(['growth', 'profit', 'dominate'] as const),
      style: rng.pick(['price', 'product', 'sales'] as const),
      funding: scale(col(m), rng.range(5, 40)),
      maturity: Math.round(rng.range(0.3, 0.6) * 100) / 100,
      priceIndex: Math.round(rng.range(0.5, 0.9) * 100) / 100,
      reputation: Math.round(rng.range(1.5, 3) * 10) / 10,
      customers: rng.int(20, 400),
      nextMoveMonth: m.month + rng.int(1, RIVALS.every[1]),
      status: 'active',
      moves: [],
    };
  }
  return null;
}

const recent = (r: Rival, month: number, within: number, kind?: RivalMoveKind) =>
  r.moves.find((x) => month - x.month <= within && (!kind || x.kind === kind));

function remember(r: Rival, move: RivalMove) {
  r.moves.unshift(move);
  if (r.moves.length > RIVALS.keepMoves) r.moves.length = RIVALS.keepMoves;
}

function news(world: World, m: MarketState, r: Rival, move: RivalMove, headline: string) {
  const outlet = m.outlets.find((o) => o.type === 'tech') ?? m.outlets[0];
  publish(world, {
    market: m.id,
    month: move.month,
    outletId: outlet?.id ?? 'tech',
    outletName: outlet?.name ?? 'Tech desk',
    kind: 'market',
    alert: move.text.slice(0, 80),
    headline,
    body: `${move.text}.`,
    starDelta: 0,
    verified: true,
    subject: r.companyId ? { kind: 'company', id: r.companyId } : { kind: 'market', id: m.id },
  });
}

/** Founder companies in this rival's industry and city (targets for poach and deals). */
const targetsOf = (world: World, m: MarketState, r: Rival) =>
  Object.values(world.companies)
    .filter((c) => c.market === m.id && c.industry === r.industry && humanFounded(world, c))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

/** Pick and play a rival's scheduled move. Explainable from its state and style. */
function scheduledMove(world: World, m: MarketState, r: Rival, rng: Rng): RivalMove | null {
  const month = m.month;
  const cur = m.data.currency;
  const raised = recent(r, month, 3, 'raise');
  const targets = targetsOf(world, m, r);
  const staffTargets = targets.filter((c) => c.staff.some((s) => !s.cofounder));
  const dealTargets = targets.filter((c) =>
    (c.deals ?? []).some((d) =>
      ['contacted', 'discovery', 'demo', 'proposal', 'negotiation'].includes(d.stage),
    ),
  );
  const options: [RivalMoveKind, number][] = [
    [
      'price_cut',
      r.priceCut && r.priceCut.until >= month
        ? 0
        : (r.style === 'price' ? 3 : 1) + (raised ? 2 : 0),
    ],
    ['launch', r.maturity >= 0.95 ? 0 : r.style === 'product' ? 3 : 1],
    [
      'poach',
      staffTargets.length
        ? (r.style === 'sales' ? 2 : 1) + (r.funding > scale(col(m), 30) ? 1 : 0)
        : 0,
    ],
    ['win_deal', r.reputation >= 2 ? 2 : 1],
    // Abstract rivals raise on their own clock; AI startups raise through the funds.
    ['raise', r.companyId || recent(r, month, 5, 'raise') ? 0 : r.goal === 'dominate' ? 2 : 1],
  ];
  const total = options.reduce((a, [, w]) => a + w, 0);
  if (total <= 0) return null;
  let roll = rng.next() * total;
  let kind: RivalMoveKind = 'launch';
  for (const [k, w] of options) {
    if (roll < w) {
      kind = k;
      break;
    }
    roll -= w;
  }
  switch (kind) {
    case 'price_cut': {
      const pct = rng.int(RIVALS.cutPct[0], RIVALS.cutPct[1]);
      r.priceCut = { pct, until: month + RIVALS.cutMonths };
      r.priceIndex = Math.round(r.priceIndex * (1 - pct / 100) * 100) / 100;
      const text = raised
        ? `${r.name} cut prices ${pct}% after raising ${formatMoney(raised.amount ?? 0, cur)}`
        : `${r.name} cut prices ${pct}%`;
      return { month, kind, text, pct };
    }
    case 'launch': {
      const list = FEATURES[r.industry] ?? FEATURES.default!;
      const fresh = list.filter((f) => !r.moves.some((x) => x.text.endsWith(f)));
      const feature = rng.pick(fresh.length ? fresh : list);
      r.maturity = Math.round(clamp01(r.maturity + rng.range(0.05, 0.12)) * 100) / 100;
      return { month, kind, text: `${r.name} launched ${feature}` };
    }
    case 'poach': {
      const c = rng.pick(staffTargets);
      const who = rng.pick(c.staff.filter((s) => !s.cofounder));
      return {
        month,
        kind,
        text: `${r.name} is trying to hire ${who.name} from ${c.name}`,
        targetCompanyId: c.id,
        staffId: who.id,
      };
    }
    case 'win_deal': {
      r.customers += rng.int(1, 5);
      r.reputation = Math.round(clamp(r.reputation + 0.1, 0, 5) * 10) / 10;
      if (dealTargets.length && rng.chance(0.6)) {
        const c = rng.pick(dealTargets);
        return {
          month,
          kind,
          text: `${r.name} is courting one of ${c.name}’s prospects`,
          targetCompanyId: c.id,
        };
      }
      const parts = CITY_NAME_PARTS[m.id];
      const who = `${rng.pick(parts.places)} ${rng.pick(['Traders', 'Group', 'Logistics', 'Stores'])}`;
      return { month, kind, text: `${r.name} won a contract with ${who}` };
    }
    case 'raise': {
      const amount = scale(col(m), rng.range(RIVALS.raiseCol[0], RIVALS.raiseCol[1]));
      r.funding += amount;
      return { month, kind, text: `${r.name} raised ${formatMoney(amount, cur)}`, amount };
    }
    default:
      return null;
  }
}

/**
 * Monthly, after companies settle (journey-events worlds only): keep two or
 * three rivals per founder industry, follow the AI startups they mirror, and
 * play the moves that are due. Own RNG stream per rival and month.
 */
export function settleRivals(world: World, market: MarketId, month: number) {
  if (!journeyEventsOn(world)) return;
  const m = getMarket(world, market);
  const all = (m.rivals ??= {});
  for (const industry of founderIndustries(world, market)) {
    const list = (all[industry] ??= []);
    const setup = deriveRng(world.seed, 'rivals', market, industry, month);
    // Follow the AI startups; mark the ones that closed.
    for (const r of list) {
      if (r.status !== 'active' || !r.companyId) continue;
      const c = world.companies[r.companyId];
      if (!c || c.status !== 'active') {
        r.status = 'failed';
        const move: RivalMove = { month, kind: 'fail', text: `${r.name} shut down` };
        remember(r, move);
        continue;
      }
      syncFromCompany(m, r, c);
      const funding = raisedOf(world, c);
      if (funding > r.funding) {
        // A real raise (ai.ts already put it in the news).
        remember(r, {
          month,
          kind: 'raise',
          text: `${r.name} raised ${formatMoney(funding - r.funding, m.data.currency)}`,
          amount: funding - r.funding,
        });
      }
      r.funding = funding;
    }
    // Drop long-gone rivals; top up to the minimum (AI startups first).
    const failedOld = list.filter(
      (r) => r.status === 'failed' && month - (r.moves[0]?.month ?? 0) > 3,
    );
    for (const r of failedOld) list.splice(list.indexOf(r), 1);
    const active = () => list.filter((r) => r.status === 'active');
    if (active().length < RIVALS.min) {
      const linked = new Set(list.map((r) => r.companyId));
      const ai = Object.values(world.companies)
        .filter(
          (c) =>
            c.ai &&
            c.status === 'active' &&
            c.market === market &&
            c.industry === industry &&
            !linked.has(c.id),
        )
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      for (const c of ai) {
        if (active().length >= RIVALS.max) break;
        list.push(rivalFromCompany(world, m, c, setup));
      }
      while (active().length < RIVALS.min) {
        const r = abstractRival(world, m, industry, setup);
        if (!r) break;
        list.push(r);
      }
    }
    // Scheduled moves.
    for (const r of active()) {
      if (r.priceCut && r.priceCut.until < month) delete r.priceCut;
      if (!r.companyId) {
        // The cheap update for an abstract rival: slow, steady progress.
        r.maturity = Math.round(clamp01(r.maturity + 0.005) * 1000) / 1000;
        r.customers = Math.round(r.customers * 1.02);
      }
      if (month < r.nextMoveMonth) continue;
      const rng = deriveRng(world.seed, 'rivals', market, r.id, month);
      r.nextMoveMonth = month + rng.int(RIVALS.every[0], RIVALS.every[1]);
      const move = scheduledMove(world, m, r, rng);
      if (!move) continue;
      remember(r, move);
      if (move.kind === 'price_cut') news(world, m, r, move, `${r.name} cuts prices`);
      else if (move.kind === 'launch') news(world, m, r, move, `${r.name} ships something new`);
      else if (move.kind === 'raise') news(world, m, r, move, `${r.name} raises money`);
      else if (move.kind === 'win_deal' && !move.targetCompanyId)
        news(world, m, r, move, `${r.name} wins a contract`);
    }
  }
}

/** This city's active rivals for a company's industry. */
export const rivalsOf = (world: World, c: Company): Rival[] =>
  (world.markets[c.market]?.rivals?.[c.industry] ?? []).filter((r) => r.status === 'active');

export interface RivalPressure {
  /** Taken off a score or win chance, 0–0.04. */
  value: number;
  /** Plain-English reasons. */
  reasons: string[];
}

/**
 * How much rivals weigh on a founder's company right now: price cuts in
 * force, and products clearly ahead of yours. Zero for AI companies, in
 * worlds without the journey-events note, and while an edge holds.
 */
export function rivalPressureOf(world: World, c: Company): RivalPressure {
  const none = { value: 0, reasons: [] };
  if (c.ai || !journeyEventsOn(world)) return none;
  const m = world.markets[c.market];
  if (!m) return none;
  if (c.rivalEdge && c.rivalEdge.until >= m.month) return none;
  let v = 0;
  const reasons: string[] = [];
  for (const r of rivalsOf(world, c)) {
    if (r.priceCut && r.priceCut.until >= m.month) {
      v += (r.priceCut.pct / 100) * RIVALS.cutWeight;
      reasons.push(`${r.name} cut prices ${r.priceCut.pct}%`);
    }
    if (r.maturity > c.product.fit + RIVALS.productLead) {
      v += RIVALS.productWeight;
      reasons.push(`${r.name}’s product is further along`);
    }
  }
  return { value: Math.min(RIVALS.pressureCap, Math.round(v * 1000) / 1000), reasons };
}

export const rivalPressure = (world: World, c: Company): number => rivalPressureOf(world, c).value;

/** `view.rivals`: per active company you founded, its rivals and their recent moves. */
export function rivalsView(world: World, companies: Company[]) {
  return companies
    .filter((c) => c.status === 'active' && !c.ai)
    .map((c) => {
      const m = getMarket(world, c.market);
      const pressure = rivalPressureOf(world, c);
      return {
        companyId: c.id,
        companyName: c.name,
        industry: c.industry,
        /** Percentage points off your win chance (0–4). */
        pressurePct: Math.round(pressure.value * 1000) / 10,
        reasons: pressure.reasons,
        edgeUntil: c.rivalEdge && c.rivalEdge.until >= m.month ? c.rivalEdge.until : null,
        rivals: (m.rivals?.[c.industry] ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          ai: r.companyId !== null,
          goal: r.goal,
          style: r.style,
          funding: r.funding,
          maturity: r.maturity,
          priceIndex: r.priceIndex,
          priceCutPct: r.priceCut && r.priceCut.until >= m.month ? r.priceCut.pct : 0,
          reputation: r.reputation,
          customers: r.customers,
          status: r.status,
          nextMoveMonth: r.nextMoveMonth,
          moves: r.moves.map((x) => ({ ...x })),
        })),
      };
    });
}
