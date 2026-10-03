/**
 * Valuation (§9 "Funding climate", §17). Live public multiples by sector set
 * the climate; the company's own revenue, growth, model and stars set its place in it.
 */
import { clamp } from './math.js';
import { getMarket, lastPnl, usdToLocal } from './helpers.js';
import { starMultiplier } from './stars.js';
import type { Company, RevenueModel, Stage, World } from './types.js';

/** Investors value revenue models differently: subscription highest, services lowest (§6). */
export const MODEL_MULTIPLE: Record<RevenueModel, number> = {
  subscription: 1,
  usage: 0.9,
  transaction: 0.8,
  marketplace: 0.75,
  'one-off': 0.4,
  services: 0.3,
};

/** Typical pre-money in USD for a company raising this stage in a deep market (London). */
export const STAGE_FLOOR_USD: Record<Stage, number> = {
  'pre-seed': 1_500_000,
  seed: 5_000_000,
  'series-a': 18_000_000,
  'series-b': 60_000_000,
  'series-c': 180_000_000,
};

/** Monthly revenue growth over the last three months (compound). */
export function monthlyGrowth(c: Company): number {
  const h = c.finance.history;
  if (h.length < 2) return 0;
  const now = h[h.length - 1]!.revenue;
  const then = h[Math.max(0, h.length - 4)]!.revenue;
  const n = Math.min(3, h.length - 1);
  if (then <= 0) return now > 0 ? 0.3 : 0;
  return Math.pow(now / then, 1 / n) - 1;
}

export interface ValuationBreakdown {
  arr: number;
  multiple: number;
  revenueBased: number;
  floor: number;
  value: number;
}

/** What a rational AI investor thinks the company is worth today (pre-money, local minor). */
export function valueCompany(world: World, c: Company, stage: Stage): ValuationBreakdown {
  const m = getMarket(world, c.market);
  const last = lastPnl(c);
  const arr = (last?.revenue ?? 0) * 12;
  const growth = monthlyGrowth(c);
  const growthFactor = clamp(1 + growth * 8, 0.5, 3);
  const multiple =
    m.multiples[c.industry] *
    m.data.multipleDiscount *
    MODEL_MULTIPLE[c.revenueModel] *
    growthFactor *
    starMultiplier(c.stars.value) *
    m.climate;
  const revenueBased = Math.round(arr * multiple);
  const marketDepth = m.data.multipleDiscount / 0.9;
  const floorUsd =
    STAGE_FLOOR_USD[stage] * marketDepth * (0.5 + (0.5 * c.product.fit) / 0.5) * m.climate;
  const floor = Math.round(
    usdToLocal(world, m, floorUsd) * clamp(starMultiplier(c.stars.value), 0.6, 1.4),
  );
  // Early stages lean on the floor (team, market); later stages are mostly revenue.
  const weight = stage === 'pre-seed' ? 0.2 : stage === 'seed' ? 0.5 : 0.85;
  const value = Math.max(
    Math.round(floor * (1 - weight) + revenueBased * weight),
    Math.round(floor * 0.5),
  );
  return { arr, multiple, revenueBased, floor, value };
}
