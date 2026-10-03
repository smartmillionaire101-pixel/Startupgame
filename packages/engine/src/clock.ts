/**
 * The clock (§2): one real day = one game month. Each market settles at local
 * midnight in its own time zone. One game year passes in about 12 real days.
 */
import type { MarketId } from './data/markets.js';
import type { World } from './types.js';

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

/** Settlements that are due now, oldest first. Caps catch-up so a long outage can't stall the server. */
export function dueSettlements(
  world: World,
  now: number,
  limit = 7,
): { market: MarketId; date: string }[] {
  const due: { market: MarketId; date: string }[] = [];
  for (const m of Object.values(world.markets)) {
    const today = localDate(now, m.data.timeZone);
    const last = m.lastSettledDate ?? today;
    for (const date of datesBetween(last, today, limit)) due.push({ market: m.id, date });
  }
  return due.sort((a, b) => a.date.localeCompare(b.date));
}

/** "Year 2, Month 7" from a market's settled-month counter. */
export function gameDate(month: number): { year: number; month: number; label: string } {
  const year = Math.floor(month / 12) + 1;
  const mo = (month % 12) + 1;
  return { year, month: mo, label: `Year ${year}, Month ${mo}` };
}
