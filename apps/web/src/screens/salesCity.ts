/**
 * Branches note: the Sales board's city filter. Another screen (a branch on
 * Company → Branches) opens Sales on one city: `openSalesCity('lagos')`.
 */
import { openCompanyTab } from './Company';

let pending: string | null = null;
const listeners = new Set<(market: string) => void>();

/** Open Company → Sales showing one city's deals. */
export function openSalesCity(market: string) {
  pending = market;
  for (const l of listeners) l(market);
  openCompanyTab('sales');
  setTimeout(() => {
    document.querySelector('[data-sales]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, 80);
}

/** The city Sales was asked to show (once), or null for every city. */
export function takeSalesCity(): string | null {
  const m = pending;
  pending = null;
  return m;
}

/** A Sales board already open switches city at once. */
export function onSalesCity(fn: (market: string) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
