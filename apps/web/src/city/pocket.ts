/**
 * Your pocket where you are. Your account keeps your home currency; abroad,
 * a price here is paid in this city's money, converted at the bank's rate
 * (`view.spendHere`). Play-test: Accra's mall showed a naira balance with a
 * cedi sign ("GH₵3.8m" for ₦3.78m) and weighed naira against cedi prices.
 */
import type { PlayerView } from '@runway/engine';
import { money } from '../format';
import { t } from '../i18n';

export interface Pocket {
  /** What your balance buys, in `currency` (your balance itself when no exchange is needed). */
  balance: number;
  currency: string;
  /** Your balance as the account holds it. */
  home: number;
  homeCurrency: string;
  /** Whether prices here are paid through an exchange. */
  converted: boolean;
  /** Whether you can pay `price` (in `currency`): the rule the server charges by. */
  canPay: (price: number) => boolean;
}

type SpendHere = { from: string; currency: string; rate: number };

function spendHereOf(view: PlayerView): SpendHere | null {
  const s = (view as PlayerView & { spendHere?: unknown }).spendHere as SpendHere | null;
  return s && typeof s.rate === 'number' && s.rate > 0 && typeof s.currency === 'string' ? s : null;
}

/** Your pocket against prices in `currency` (default: the city you're in). */
export function pocketOf(view: PlayerView, currency: string = view.market.currency): Pocket {
  const home = view.accounts.local?.balance ?? 0;
  const homeCurrency = view.accounts.local?.currency ?? currency;
  const fx = spendHereOf(view);
  if (homeCurrency === currency || !fx || fx.currency !== currency || fx.from !== homeCurrency)
    return {
      balance: home,
      currency: homeCurrency,
      home,
      homeCurrency,
      converted: false,
      canPay: (price) => home >= price,
    };
  // The engine's `costIn`: ceil(price / rate) + 1 of your money buys `price` here.
  const cost = (price: number) => Math.ceil(price / fx.rate) + 1;
  return {
    balance: Math.max(0, Math.floor((home - 1) * fx.rate)),
    currency,
    home,
    homeCurrency,
    converted: true,
    canPay: (price) => price <= 0 || home >= cost(price),
  };
}

/** "₦3.78m", or abroad "≈ GH₵290k (₦3.78m)". */
export function pocketText(p: Pocket): string {
  if (!p.converted) return money(p.home, p.homeCurrency);
  return t('≈ {local} ({home})', {
    local: money(p.balance, p.currency),
    home: money(p.home, p.homeCurrency),
  });
}
