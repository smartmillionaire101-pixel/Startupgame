import { CURRENCY_SYMBOL, formatMoney, type Currency } from '@runway/engine';
import { getLang, t } from './i18n';

/**
 * Money in the player's language. French writes ₦2,5 M, ₦12 k and ₦1,2 Md
 * (milliard) where English writes ₦2.5m, ₦12k and ₦1.2bn.
 */
export function money(minor: number, currency: string): string {
  const en = formatMoney(minor, currency as Currency);
  if (getLang() !== 'fr') return en;
  const m = /^(-?)(\D*)([\d.,]+)(bn|m|k)?$/.exec(en);
  if (!m) return en;
  const [, sign, sym, num, suffix] = m;
  const n = num!.replace(/,/g, '\u202f').replace('.', ',');
  const fr = { bn: '\u00a0Md', m: '\u00a0M', k: '\u00a0k' }[suffix as 'bn' | 'm' | 'k'] ?? '';
  return `${sign}${sym}${n}${fr}`;
}

/**
 * The exact amount, every unit shown: ₦11,424,950 or £1,234.56 (French
 * ₦11 424 950, £1 234,56). For balances: the short form (₦11.4m) hides a
 * transfer of a few thousand, so the money looked like it never moved.
 */
export function moneyExact(minor: number, currency: string): string {
  const fr = getLang() === 'fr';
  const v = Math.round(Math.abs(minor));
  const whole = Math.floor(v / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, fr ? ' ' : ',');
  const cents = v % 100 ? `${fr ? ',' : '.'}${String(v % 100).padStart(2, '0')}` : '';
  const sym = CURRENCY_SYMBOL[currency as Currency] ?? `${currency} `;
  return `${minor < 0 && v > 0 ? '-' : ''}${sym}${whole}${cents}`;
}

/** Percent; French puts a space before the sign and uses a decimal comma. */
export const pct = (x: number, digits = 0) => {
  const v = (x * 100).toFixed(digits);
  return getLang() === 'fr' ? `${v.replace('.', ',')}\u00a0%` : `${v}%`;
};

export const runway = (months: number | null) =>
  months === null
    ? t('Profitable')
    : months >= 120
      ? t('10y+')
      : t('{n} mo', { n: Math.max(0, Math.floor(months)) });

export const stars = (v: number) =>
  `${getLang() === 'fr' ? v.toFixed(1).replace('.', ',') : v.toFixed(1)}★`;

export const titleCase = (s: string) =>
  s.replace(
    /(^|[-\s])(\w)/g,
    (_, a: string, b: string) => `${a === '-' ? ' ' : a}${b.toUpperCase()}`,
  );

/**
 * Parse a user-typed amount like "2.5m", "800k", "1,200" into minor units.
 * Also French style: "2,5 M", "1 200", "1,2 Md".
 */
export function parseAmount(input: string): number | null {
  const m = /^\s*([\d.,\s\u00a0\u202f]*\d)\s*(k|m|md|bn|b)?\s*$/i.exec(input);
  if (!m) return null;
  let digits = m[1]!.replace(/[\s\u00a0\u202f]/g, '');
  // A lone comma followed by one or two digits is a French decimal comma.
  if (/^\d+,\d{1,2}$/.test(digits) && !digits.includes('.')) digits = digits.replace(',', '.');
  const n = Number(digits.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const mult =
    { k: 1e3, m: 1e6, b: 1e9, bn: 1e9, md: 1e9 }[
      (m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b' | 'bn' | 'md'
    ] ?? 1;
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
