/**
 * The clock (§2). Game time runs on fixed periods of real time: one period is
 * one game month (`MONTH_MINUTES` on the server, five real minutes by
 * default). Period n starts at `CLOCK_EPOCH + n × monthMs`; every market
 * settles once per period, at the period boundary.
 *
 * Saved worlds from the old day-based clock (one real day = one game month,
 * settled at local midnight) carry only `lastSettledDate`; they settle once
 * at the next tick and then follow the period clock (no schema break).
 */
import type { MarketId } from './data/markets.js';
import type { World } from './types.js';

/** Period 0 starts here (2026-01-01T00:00:00Z). */
export const CLOCK_EPOCH = Date.UTC(2026, 0, 1);
/** Default game month: five real minutes. */
export const DEFAULT_MONTH_MS = 5 * 60_000;
/** The old clock's month: one real day (used for saved settlements without a month length). */
export const LEGACY_MONTH_MS = 86_400_000;
/** Most settlements per market in one tick; a longer outage skips the oldest. */
export const MAX_CATCH_UP = 7;

/** Index of the period containing `now`. */
export const periodOf = (now: number, monthMs: number): number =>
  Math.floor((now - CLOCK_EPOCH) / monthMs);

/** Start (epoch ms) of a period. */
export const periodStart = (period: number, monthMs: number): number =>
  CLOCK_EPOCH + period * monthMs;

/** When the next settlement is due after `now` (epoch ms). */
export const nextSettlementAt = (now: number, monthMs: number): number =>
  periodStart(periodOf(now, monthMs) + 1, monthMs);

/** The clock as the client sees it: enough for a countdown. */
export function clockView(now: number, monthMs: number) {
  return { monthMs, nextSettlementAt: nextSettlementAt(now, monthMs), serverNow: now };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Local calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(now: number, timeZone: string): string {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f.format(now);
}

/** Calendar dates strictly after `from`, up to and including `to` (both YYYY-MM-DD). */
export function datesBetween(from: string, to: string, limit = 7): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`).getTime();
  while (out.length < limit) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getTime() > end) break;
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Settlements that are due now, oldest first: one per period boundary passed
 * since each market last settled. `at` is the boundary (period start, epoch
 * ms). At most `limit` per market; a longer outage settles only the latest
 * ones rather than fast-forwarding years of game time.
 */
export function dueSettlements(
  world: World,
  now: number,
  monthMs: number = DEFAULT_MONTH_MS,
  limit = MAX_CATCH_UP,
): { market: MarketId; at: number }[] {
  const due: { market: MarketId; at: number }[] = [];
  const current = periodOf(now, monthMs);
  for (const m of Object.values(world.markets)) {
    // Saved worlds from the day clock: settle once at the current boundary, then follow periods.
    const last = m.settledAt ?? periodStart(current, monthMs) - 1;
    const first = Math.max(periodOf(last, monthMs) + 1, current - limit + 1);
    for (let n = first; n <= current; n++) due.push({ market: m.id, at: periodStart(n, monthMs) });
  }
  return due.sort((a, b) => a.at - b.at);
}

/** "Year 2, Month 7" from a market's settled-month counter. */
export function gameDate(month: number): { year: number; month: number; label: string } {
  const year = Math.floor(month / 12) + 1;
  const mo = (month % 12) + 1;
  return { year, month: mo, label: `Year ${year}, Month ${mo}` };
}
