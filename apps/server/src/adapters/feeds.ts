/**
 * Real-world data feeds (§17). Free public sources first. Each feed turns
 * outside data into a `market.data` command, so every change is logged,
 * replayable and announced in-game. Failures are logged and ignored: the
 * game keeps running on the last known values.
 */
import { MARKET_DATA, type MarketId } from '@runway/engine';
import { z } from 'zod';

const fxSchema = z.object({
  result: z.string().optional(),
  rates: z.record(z.string(), z.number()),
});

/** Fetch USD→local rates and return per-market updates for meaningful moves (> 0.25%). */
export async function fetchFxUpdates(
  url: string,
  current: Record<MarketId, number>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ market: MarketId; unitsPerUsd: number }[]> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`FX feed HTTP ${res.status}`);
  const body = fxSchema.parse(await res.json());
  const out: { market: MarketId; unitsPerUsd: number }[] = [];
  for (const [market, data] of Object.entries(MARKET_DATA) as [
    MarketId,
    (typeof MARKET_DATA)[MarketId],
  ][]) {
    const rate = body.rates[data.currency];
    if (!rate || !Number.isFinite(rate) || rate <= 0) continue;
    // Sanity bound: ignore feeds that move more than 50% at once (bad data, not a crisis).
    const prev = current[market];
    if (prev && Math.abs(rate / prev - 1) > 0.5) continue;
    if (prev && Math.abs(rate / prev - 1) < 0.0025) continue;
    out.push({ market, unitsPerUsd: Math.round(rate * 10_000) / 10_000 });
  }
  return out;
}
