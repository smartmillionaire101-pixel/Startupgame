/**
 * Wave 10: a scattered economy. New businesses, offices, investors, branches
 * and events are spread across every district of a city, weighted by how
 * much already happens there (the city roster), but softly (square root), so
 * the busy centre gets more without everything piling up downtown.
 */
import { CITY_BUSINESSES, CITY_DISTRICTS } from './data/businesses.js';
import type { MarketId } from './data/markets.js';
import { createRng, hashString } from './rng.js';
import type { Rng } from './rng.js';

const cache = new Map<MarketId, { district: string; w: number }[]>();

/** Each district of a city with its weight (√(roster places there + 1)). */
export function districtWeights(market: MarketId): { district: string; w: number }[] {
  const hit = cache.get(market);
  if (hit) return hit;
  const roster = CITY_BUSINESSES[market] ?? [];
  const out = (CITY_DISTRICTS[market] ?? []).map((district) => ({
    district,
    w: Math.sqrt(roster.filter((s) => s.district === district).length + 1),
  }));
  cache.set(market, out);
  return out;
}

function pickWeighted(items: { district: string; w: number }[], r: number): string | null {
  if (!items.length) return null;
  const total = items.reduce((a, x) => a + x.w, 0);
  let left = r * total;
  for (const x of items) {
    left -= x.w;
    if (left < 0) return x.district;
  }
  return items[items.length - 1]!.district;
}

/** A district drawn from an RNG stream (weighted). `avoid` districts are skipped when possible. */
export function randomDistrict(
  market: MarketId,
  rng: Rng,
  avoid: readonly string[] = [],
): string | null {
  const all = districtWeights(market);
  const pool = all.filter((d) => !avoid.includes(d.district));
  return pickWeighted(pool.length ? pool : all, rng.next());
}

/**
 * A stable district for something that has no stored one (an AI startup's
 * office, a fund's office): the same id always lands in the same district.
 */
export function stableDistrict(market: MarketId, ...labels: (string | number)[]): string | null {
  // Mixed through the generator: FNV alone keeps similar ids (co_1, co_2…) too close.
  const r = createRng(hashString(`district:${market}:${labels.join(':')}`)).next();
  return pickWeighted(districtWeights(market), r);
}
