import { formatMoney, type Currency } from '@runway/engine';

export const money = (minor: number, currency: string) => formatMoney(minor, currency as Currency);

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

export const runway = (months: number | null) =>
  months === null ? 'Profitable' : months >= 120 ? '10y+' : `${Math.max(0, Math.floor(months))} mo`;

export const stars = (v: number) => `${v.toFixed(1)}★`;

export const titleCase = (s: string) =>
  s.replace(
    /(^|[-\s])(\w)/g,
    (_, a: string, b: string) => `${a === '-' ? ' ' : a}${b.toUpperCase()}`,
  );

/** Parse a user-typed amount like "2.5m", "800k", "1,200" into minor units. */
export function parseAmount(input: string): number | null {
  const m = /^\s*([\d.,]+)\s*([kmb]n?)?\s*$/i.exec(input);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const mult =
    { k: 1e3, m: 1e6, b: 1e9, bn: 1e9 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b' | 'bn'] ?? 1;
  return Math.round(n * mult * 100);
}

/** Minor units → an editable major-unit string ("2.5m"). */
export function amountInput(minor: number): string {
  const v = minor / 100;
  if (v >= 1e9) return `${+(v / 1e9).toFixed(2)}b`;
  if (v >= 1e6) return `${+(v / 1e6).toFixed(2)}m`;
  if (v >= 1e3) return `${+(v / 1e3).toFixed(1)}k`;
  return String(Math.round(v));
}
