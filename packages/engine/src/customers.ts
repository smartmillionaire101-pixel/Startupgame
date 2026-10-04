/**
 * AI customers (§6).
 *
 * Each segment has a fixed (data-driven) number of buyers. A new startup does
 * not create buyers; it takes them from the incumbent and rivals, or wins the
 * unserved. Every month:
 *   1. Marketing, sales staff and coverage grow awareness (reach).
 *   2. Unserved buyers who are "in market" plus switchers form a contestable pool.
 *   3. The pool splits across options by awareness × exp(score / τ), where score
 *      weighs fit, price, stars and reliability by the segment's needs.
 *      "Nobody" is an option too, so weak products don't win by default.
 *   4. Winners go to trial; trial converts to paying on quality. B2B deals
 *      enter a pipeline with a 3–9 month sales cycle and need sales capacity.
 *   5. Paying customers churn on reliability and price.
 */
import { clamp, clamp01, logistic } from './math.js';
import type { Rng } from './rng.js';
import { outputOf } from './staff.js';
import { SEGMENT_TEMPLATES } from './data/industries.js';
import type { Company, SegmentPosition, SegmentState } from './types.js';

export const CUSTOMER_TUNING = {
  temperature: 0.1,
  noBuyScore: 0.42,
  inMarketRate: { b2c: 0.06, b2b: 0.03 },
  incumbentLeakage: 0.015,
  baseChurn: { b2c: 0.06, b2b: 0.015 },
  /**
   * Cost to make one buyer aware, as a multiple of their monthly budget.
   * Tuned so customer acquisition cost pays back in roughly 6–12 months, as in the real world.
   */
  costPerReach: { b2c: 1.5, b2b: 6 },
  /** Buyers reached per unit of sales output per month. */
  salesReach: { b2c: 120, b2b: 3 },
  founderReach: { b2c: 30, b2b: 1.5 },
  /** Customer load one unit of capacity can serve (a B2B account counts as 20). */
  serviceCapacity: { founder: 200, support: 2500, engineer: 800, product: 300 },
  b2bLoadWeight: 20,
  /** B2B deals one unit of sales output can work per month. */
  salesCapacity: 6,
  awarenessDecay: 0.03,
  /** Buyers each happy paying customer tells per month (B2C), scaled by reliability. */
  wordOfMouth: 0.05,
  /** Monthly customer loss while a company hibernates (slow decay). */
  hibernationChurn: 0.03,
} as const;

export const isHibernating = (c: Company): boolean => !!c.hibernation;

export const emptyPosition = (): SegmentPosition => ({
  awareness: 0,
  paying: 0,
  won: 0,
  churned: 0,
  pipeline: [],
  funnel: { aware: 0, interested: 0, trial: 0, paying: 0, churned: 0 },
});

export function priceScore(price: number, budget: number): number {
  if (budget <= 0) return 0;
  return logistic(-4 * (price / budget - 1));
}

/** How many customers the team can serve well. Beyond it, service degrades and churn rises. */
export function serviceCapacity(c: Company): number {
  const k = CUSTOMER_TUNING.serviceCapacity;
  return (
    c.founderIds.length * k.founder +
    outputOf(c, ['support', 'operations']) * k.support +
    outputOf(c, ['engineer']) * k.engineer +
    outputOf(c, ['product']) * k.product
  );
}

export function serviceLoad(c: Company): number {
  return Object.entries(c.segments).reduce(
    (a, [key, s]) =>
      a + s.paying * (key.includes('.') && isB2bKey(key) ? CUSTOMER_TUNING.b2bLoadWeight : 1),
    0,
  );
}

const B2B_KEYS = new Set(SEGMENT_TEMPLATES.filter((t) => t.kind === 'b2b').map((t) => t.key));
const isB2bKey = (key: string) => B2B_KEYS.has(key);

export function reliability(c: Company): number {
  const load = serviceLoad(c);
  const cap = serviceCapacity(c);
  // A team stretched past capacity ships outages and slow support.
  const stretch = load <= cap ? 1 : clamp(Math.pow(cap / load, 0.6), 0.3, 1);
  return clamp01(
    c.product.quality * (1 - 0.5 * c.product.techDebt) * stretch + c.supply.reliabilityAdd,
  );
}

export function segmentFit(c: Company, segKey: string): number {
  return clamp01(c.product.fit * (0.55 + 0.45 * (c.product.discovery[segKey] ?? 0)));
}

/** Score 0–1 of a company's offer to a segment, weighted by that segment's needs. */
export function scoreOffer(c: Company, seg: SegmentState): number {
  const w = seg.needs;
  const total = w.fit + w.price + w.stars + w.reliability;
  const stars = c.stars.value / 5;
  const s =
    (w.fit * segmentFit(c, seg.key) +
      w.price * priceScore(c.price, seg.budget) +
      w.stars * stars +
      w.reliability * reliability(c)) /
    total;
  // Some segments only buy from known brands (trust threshold).
  return c.stars.value < seg.trustThreshold ? s * 0.6 : s;
}

/** Revenue per paying customer per month by revenue model (one-off pays only when won). */
export const RECURRING: Record<Company['revenueModel'], boolean> = {
  subscription: true,
  transaction: true,
  usage: true,
  marketplace: true,
  'one-off': false,
  services: true,
};

export interface SegmentOutcome {
  companyId: string;
  segKey: string;
  won: number;
  churned: number;
  paying: number;
}

/**
 * Run one month of customer dynamics for one segment across every company
 * that targets it. Mutates company positions and the segment's incumbent.
 */
export function settleSegment(
  seg: SegmentState,
  companies: Company[],
  rng: Rng,
  month: number,
  maintenance: (c: Company) => boolean,
): SegmentOutcome[] {
  const T = CUSTOMER_TUNING;
  seg.buyers = Math.round(seg.buyers * (1 + seg.monthlyGrowth));

  const positions = companies.map((c) => (c.segments[seg.key] ??= emptyPosition()));
  const targeting = companies.map((c) => c.targetSegments.includes(seg.key));

  // 1. Reach → awareness. Remember where reach came from, for the monthly story.
  const mix = companies.map(() => ({ marketing: 0, outreach: 0, wordOfMouth: 0 }));
  companies.forEach((c, i) => {
    const pos = positions[i]!;
    if (!targeting[i] || isHibernating(c)) {
      pos.awareness *= 1 - T.awarenessDecay * 2;
      return;
    }
    const activeTargets = Math.max(1, c.targetSegments.length);
    const spend = c.marketingBudget / activeTargets;
    const mkt = 1 + outputOf(c, ['marketing']) * 0.6;
    const perReach = Math.max(1, seg.budget * T.costPerReach[seg.kind]);
    const fromMarketing = (spend / perReach) * mkt;
    const fromOutreach =
      (outputOf(c, ['sales']) * T.salesReach[seg.kind]) / activeTargets +
      T.founderReach[seg.kind] * c.founderIds.length;
    // Happy customers tell their friends (consumers only; B2B buys through sales).
    const fromWord = seg.kind === 'b2c' ? pos.paying * T.wordOfMouth * reliability(c) : 0;
    mix[i] = { marketing: fromMarketing, outreach: fromOutreach, wordOfMouth: fromWord };
    const reached = fromMarketing + fromOutreach + fromWord;
    const growth = maintenance(c) ? 0.6 : 1;
    const newAware = (reached * growth * (1 - pos.awareness)) / Math.max(1, seg.buyers);
    pos.awareness = clamp01(pos.awareness * (1 - T.awarenessDecay) + newAware);
  });

  // 2. Churn first: churned customers rejoin the unserved pool.
  const scores = companies.map((c) => scoreOffer(c, seg));
  companies.forEach((c, i) => {
    const pos = positions[i]!;
    const priceStrain = c.price > seg.budget ? 0.5 * (c.price / seg.budget - 1) : 0;
    const rel = reliability(c);
    const rate = isHibernating(c)
      ? T.hibernationChurn
      : clamp(
          T.baseChurn[seg.kind] * (1.7 - rel) * (1.3 - scores[i]!) + priceStrain * 0.05,
          0.003,
          0.6,
        );
    const rivalBest = Math.max(
      seg.incumbentScore,
      ...scores.filter((_, j) => j !== i && targeting[j]),
    );
    pos.churnCause =
      priceStrain * 0.05 > rate * 0.3
        ? 'price'
        : rel < 0.45
          ? 'reliability'
          : rivalBest > scores[i]! + 0.05
            ? 'competition'
            : 'normal';
    const churned = RECURRING[c.revenueModel]
      ? Math.round(pos.paying * rate + (rng.next() - 0.5) * Math.min(1, pos.paying * rate))
      : pos.paying;
    pos.churned = clamp(churned, 0, pos.paying);
    pos.paying -= pos.churned;
  });

  const startupPaying = positions.reduce((a, p) => a + p.paying, 0);
  const unserved = Math.max(0, seg.buyers - seg.incumbentCustomers - startupPaying);
  const switchers = Math.round(
    seg.incumbentCustomers * T.incumbentLeakage * (1 - seg.switchingCost),
  );
  seg.incumbentCustomers -= switchers;
  const pool = Math.round(unserved * T.inMarketRate[seg.kind]) + switchers;

  // 3. Split the pool.
  const weight = (score: number) => Math.exp(score / T.temperature);
  const ws = companies.map((c, i) =>
    targeting[i] && !isHibernating(c) ? positions[i]!.awareness * weight(scores[i]!) : 0,
  );
  const wIncumbent = 0.8 * weight(seg.incumbentScore);
  const wNobody = weight(T.noBuyScore);
  const totalW = ws.reduce((a, b) => a + b, 0) + wIncumbent + wNobody;

  const outcomes: SegmentOutcome[] = [];
  let incumbentWins = Math.round((pool * wIncumbent) / totalW);

  companies.forEach((c, i) => {
    const pos = positions[i]!;
    const share = ws[i]! / totalW;
    const expected = pool * share;
    // Small-number noise so tiny startups see lumpy, real-feeling results.
    const trial = Math.max(
      0,
      Math.round(expected + rng.normal(0, Math.sqrt(Math.max(expected, 0.25)) * 0.5)),
    );
    const conversion = clamp(
      0.25 + 0.55 * reliability(c) + 0.2 * segmentFit(c, seg.key),
      0.05,
      0.95,
    );
    let won = 0;
    if (seg.kind === 'b2b') {
      // Pipeline: deals close after the sales cycle if there is capacity to work them.
      const capacity = Math.round(
        outputOf(c, ['sales']) * T.salesCapacity + 2 * c.founderIds.length,
      );
      const open = pos.pipeline.reduce((a, p) => a + p.count, 0);
      // A hibernating company works no new deals; its pipeline waits.
      const admitted = isHibernating(c) ? 0 : Math.max(0, Math.min(trial, capacity - open));
      if (admitted > 0) {
        const due = month + rng.int(seg.salesCycle[0], seg.salesCycle[1]);
        pos.pipeline.push({ due, count: admitted });
      }
      const closing = isHibernating(c) ? [] : pos.pipeline.filter((p) => p.due <= month);
      if (isHibernating(c)) for (const p of pos.pipeline) p.due += 1;
      else pos.pipeline = pos.pipeline.filter((p) => p.due > month);
      for (const p of closing) {
        for (let k = 0; k < p.count; k++) if (rng.chance(conversion)) won++;
      }
      incumbentWins += trial - admitted;
    } else {
      won = isHibernating(c) ? 0 : Math.round(trial * conversion);
    }
    const room = Math.max(
      0,
      seg.buyers - seg.incumbentCustomers - positions.reduce((a, p) => a + p.paying, 0),
    );
    won = Math.min(won, room);
    pos.won = won;
    pos.paying += won;
    // Attribute new customers to channels: B2B through the pipeline, B2C by this month's reach mix.
    const r = mix[i]!;
    const reachTotal = r.marketing + r.outreach + r.wordOfMouth;
    if (seg.kind === 'b2b' || reachTotal <= 0) {
      pos.channels = {
        marketing: 0,
        outreach: seg.kind === 'b2b' ? 0 : won,
        wordOfMouth: 0,
        pipeline: seg.kind === 'b2b' ? won : 0,
      };
    } else {
      const marketing = Math.round((won * r.marketing) / reachTotal);
      const wordOfMouth = Math.min(won - marketing, Math.round((won * r.wordOfMouth) / reachTotal));
      pos.channels = {
        marketing,
        outreach: won - marketing - wordOfMouth,
        wordOfMouth,
        pipeline: 0,
      };
    }
    const aware = Math.round(pos.awareness * seg.buyers);
    pos.funnel = {
      aware,
      interested: Math.round(aware * clamp01(scores[i]! * 1.2)),
      trial: seg.kind === 'b2b' ? pos.pipeline.reduce((a, p) => a + p.count, 0) : trial,
      paying: pos.paying,
      churned: pos.churned,
    };
    outcomes.push({
      companyId: c.id,
      segKey: seg.key,
      won,
      churned: pos.churned,
      paying: pos.paying,
    });
  });

  // Incumbent keeps what it wins; churned startup customers mostly drift back to it.
  const churnedTotal = positions.reduce((a, p) => a + p.churned, 0);
  seg.incumbentCustomers += incumbentWins + Math.round(churnedTotal * 0.3);
  const cap = seg.buyers - positions.reduce((a, p) => a + p.paying, 0);
  seg.incumbentCustomers = clamp(seg.incumbentCustomers, 0, Math.max(0, cap));
  return outcomes;
}
