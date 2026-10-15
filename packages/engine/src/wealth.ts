/**
 * Realised vs unrealised wealth (blueprint §7.4, Founder Journey 5): what
 * you can spend today, what you own but can't spend yet, and what you owe.
 * Shares are never cash: they are marked at the last round (private) or at
 * the market price (listed), and listed shares under lock-up are illiquid.
 */
import { propertiesOf, priceOf } from './property.js';
import { getMarket } from './helpers.js';
import { valueIn } from './ledger.js';
import type { Player, World } from './types.js';

export type ShareKind = 'private' | 'locked' | 'sellable';

export function wealthView(world: World, p: Player) {
  const home = getMarket(world, p.market);
  const cur = home.data.currency;
  const local = world.accounts[p.accounts.local]?.balance ?? 0;
  const usd = p.accounts.usd ? (world.accounts[p.accounts.usd]?.balance ?? 0) : 0;
  const cash = local + valueIn(world, usd, 'USD', cur);

  const items: {
    companyId: string;
    name: string;
    kind: ShareKind;
    shares: number;
    /** In your home currency. */
    value: number;
    /** Price per share used (the company's currency). */
    price: number;
    currency: string;
    lockedUntil: number | null;
  }[] = [];
  for (const c of Object.values(world.companies)) {
    if (c.status !== 'active') continue;
    const h = c.capTable.holdings[p.id];
    const safes = c.capTable.safes
      .filter((s) => s.holderId === p.id)
      .reduce((a, s) => a + s.amount, 0);
    if (!(h && h.shares > 0) && safes <= 0) continue;
    const m = getMarket(world, c.market);
    const listed = c.ipo?.status === 'listed';
    const price = listed ? (c.ipo!.price ?? 0) : c.capTable.lastPrice;
    const shares = h?.shares ?? 0;
    const lockedUntil = listed ? (c.ipo!.lockups?.[p.id] ?? 0) : 0;
    const kind: ShareKind = !listed ? 'private' : lockedUntil > m.month ? 'locked' : 'sellable';
    items.push({
      companyId: c.id,
      name: c.name,
      kind,
      shares,
      // A SAFE is marked at cost until it converts.
      value: valueIn(world, Math.round(shares * price) + safes, m.data.currency, cur),
      price: Math.round(price * 100) / 100,
      currency: m.data.currency,
      lockedUntil: kind === 'locked' ? lockedUntil : null,
    });
  }
  const sum = (k: ShareKind) => items.filter((x) => x.kind === k).reduce((a, x) => a + x.value, 0);

  let propertyValue = 0;
  let mortgages = 0;
  for (const x of Object.values(propertiesOf(world))) {
    if (x.ownerId !== p.id) continue;
    const mc = getMarket(world, x.market).data.currency;
    propertyValue += valueIn(world, priceOf(world, x), mc, cur);
    mortgages += valueIn(world, x.mortgage?.outstanding ?? 0, mc, cur);
  }
  const loans = p.loans.reduce(
    (a, l) => a + valueIn(world, l.outstanding, world.markets[l.market]?.data.currency ?? cur, cur),
    0,
  );
  const r = p.realised;
  const conv = (v: number) => (r ? valueIn(world, v, r.currency, cur) : 0);
  const shares = { private: sum('private'), locked: sum('locked'), sellable: sum('sellable') };
  const shareTotal = shares.private + shares.locked + shares.sellable;
  return {
    currency: cur,
    /** Money in your personal accounts: the only part you can spend today. */
    liquid: cash,
    cash: { local, usd },
    /** Shares at their mark: not cash until you sell. */
    shares: { ...shares, total: shareTotal, items },
    property: { value: propertyValue, mortgages, equity: propertyValue - mortgages },
    liabilities: { loans, mortgages, total: loans + mortgages },
    /** Everything you own but can't spend today. */
    illiquid: shareTotal + propertyValue - mortgages,
    netWorth: cash + shareTotal + propertyValue - mortgages - loans,
    /** Cash actually received from selling shares, the gain over cost, and the tax paid. */
    realised: {
      proceeds: conv(r?.proceeds ?? 0),
      gains: conv(r?.gains ?? 0),
      tax: conv(r?.tax ?? 0),
    },
  };
}
