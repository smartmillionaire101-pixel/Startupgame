/**
 * Money is always an integer number of minor units (kobo, cents, pence) in a
 * named currency. Floats never touch balances. Integers stay exact up to
 * 2^53 minor units (~9e13 major units), far above any plausible game value.
 */
export const CURRENCIES = ['NGN', 'KES', 'GBP', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  NGN: '₦',
  KES: 'KSh',
  GBP: '£',
  USD: '$',
};

/** Convert major units (e.g. naira) to minor units (kobo). */
export const major = (amount: number): number => Math.round(amount * 100);

/** Convert minor units back to major units, for display and ratios only. */
export const toMajor = (minor: number): number => minor / 100;

/** Multiply a minor-unit amount by a ratio, rounding to the nearest unit. */
export const scale = (minor: number, ratio: number): number => Math.round(minor * ratio);

/** Short, human format: ₦50m, $2.4m, £850k, KSh1.2bn. */
export function formatMoney(minor: number, currency: Currency): string {
  const sign = minor < 0 ? '-' : '';
  const v = Math.abs(toMajor(minor));
  const sym = CURRENCY_SYMBOL[currency];
  const fmt = (n: number, suffix: string) =>
    `${sign}${sym}${n >= 100 ? Math.round(n) : Number(n.toFixed(1))}${suffix}`;
  if (v >= 1e9) return fmt(v / 1e9, 'bn');
  if (v >= 1e6) return fmt(v / 1e6, 'm');
  if (v >= 1e4) return fmt(v / 1e3, 'k');
  return `${sign}${sym}${Math.round(v).toLocaleString('en-GB')}`;
}
