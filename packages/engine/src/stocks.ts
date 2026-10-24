/**
 * Stock analysis (game feedback: "I am London based but stocks are from
 * other countries. Should be able to analyse the stocks and company before
 * investing."). Views only, derived from the world:
 *
 *  - Exchanges in the order a player meets them: their own city's first,
 *    then the others by name, each with its company count and index.
 *  - A company analysis for every listing: what it does, revenue and profit
 *    (month and year), growth, company value, P/E against the city average,
 *    P/S, any dividend, a risk score with its reasons, recent news, and what
 *    a buy needs (cash in the company's currency, the month's limit).
 *
 * The only state this release touches is the price history kept per listing
 * (exits.ts, `EXITS.ipo.historyMonths` once FEEDBACK_NOTE is logged).
 */
import { fullyDiluted } from './captable.js';
import { companyRunway } from './company.js';
import { INVESTOR } from './data/investor.js';
import { EXITS, isListed } from './exits.js';
import { getMarket } from './helpers.js';
import { account, valueIn } from './ledger.js';
import { investorOn } from './releases.js';
import type { Company, MarketState, Player, World } from './types.js';
import { monthlyGrowth } from './valuation.js';

/** Analysis thresholds in one place. */
export const STOCKS = {
  /** An average monthly price move above this is a risk; below `calmSwing` it's calm. */
  bigSwing: 0.04,
  wildSwing: 0.08,
  calmSwing: 0.02,
  /** Months of cash left (while losing money) below which runway is a risk. */
  shortRunway: 12,
  /** P/E over this many times the city average reads as expensive; under `cheap`, cheap. */
  expensive: 1.25,
  cheap: 0.8,
  /** P/E over this many times the city average adds to the risk. */
  pricey: 1.5,
  /** Monthly revenue growth that counts as growing fast. */
  fastGrowth: 0.02,
  /** Fewer months of prices than this: a new listing. */
  newListing: 6,
  /** News items shown per company. */
  news: 3,
} as const;

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** The player's own city: where they live, whatever city they're visiting. */
export const homeMarketOf = (p: Player) => p.market;

/** Sort key: the player's city first, then the other cities by name. */
export function homeFirst<T extends { market: string; city: string }>(p: Player, a: T, b: T) {
  const home = homeMarketOf(p);
  if (a.market === home && b.market !== home) return -1;
  if (b.market === home && a.market !== home) return 1;
  return a.city < b.city ? -1 : a.city > b.city ? 1 : 0;
}

const listedHere = (world: World, marketId: string) =>
  Object.values(world.companies).filter((c) => c.market === marketId && isListed(c));

const capOf = (c: Company) => (c.ipo?.price ?? 0) * fullyDiluted(c.capTable);

/** Revenue and profit over the last year: 12 months of accounts, or the last month × 12. */
function yearOf(c: Company) {
  const h = c.finance.history;
  const last = h[h.length - 1];
  if (h.length >= 12) {
    const year = h.slice(-12);
    return {
      revenue: year.reduce((a, x) => a + x.revenue, 0),
      profit: year.reduce((a, x) => a + x.net, 0),
      estimate: false,
    };
  }
  return { revenue: (last?.revenue ?? 0) * 12, profit: (last?.net ?? 0) * 12, estimate: true };
}

/** Price ÷ yearly profit, or null for a company that doesn't make one. */
function peOf(c: Company): number | null {
  const y = yearOf(c);
  return y.profit > 0 ? capOf(c) / y.profit : null;
}

/** Price ÷ yearly sales, or null without sales. */
function psOf(c: Company): number | null {
  const y = yearOf(c);
  return y.revenue > 0 ? capOf(c) / y.revenue : null;
}

const average = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);

/** The middle value (one tiny company with huge multiples doesn't move it). */
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The typical (median) P/E and P/S of a city's listed companies (those that have one). */
export function cityMultiples(world: World, marketId: string): CityMultiples {
  const listed = listedHere(world, marketId);
  const pe = median(listed.map(peOf).filter((x): x is number => x !== null));
  const ps = median(listed.map(psOf).filter((x): x is number => x !== null));
  return { pe: pe === null ? null : round1(pe), ps: ps === null ? null : round1(ps) };
}
export type CityMultiples = { pe: number | null; ps: number | null };

/** City multiples worked out once per city for a whole view (not once per listing). */
export function cityMultiplesOnce(world: World) {
  const seen = new Map<string, CityMultiples>();
  return (marketId: string) => {
    let x = seen.get(marketId);
    if (!x) seen.set(marketId, (x = cityMultiples(world, marketId)));
    return x;
  };
}

/** Average size of the monthly price move over the last year, or null when too new. */
function swingOf(c: Company): number | null {
  const h = (c.ipo?.history ?? []).slice(-13);
  if (h.length < 3) return null;
  const moves: number[] = [];
  for (let i = 1; i < h.length; i++) if (h[i - 1]! > 0) moves.push(Math.abs(h[i]! / h[i - 1]! - 1));
  return average(moves);
}

/** Consecutive months, counting back from the last, where `test` holds. */
function streak(c: Company, test: (net: number) => boolean) {
  let n = 0;
  for (let i = c.finance.history.length - 1; i >= 0; i--) {
    if (!test(c.finance.history[i]!.net)) break;
    n++;
  }
  return n;
}

export type RiskReasonKind =
  | 'profitable'
  | 'loss'
  | 'runway'
  | 'calm'
  | 'swings'
  | 'growing'
  | 'shrinking'
  | 'pricey'
  | 'noSales'
  | 'new';

export interface RiskReason {
  kind: RiskReasonKind;
  tone: 'good' | 'warn' | 'bad';
  /** Months, or a percentage, depending on the kind. */
  n: number;
}

/** A 1 (low) to 5 (high) risk score with the reasons behind it. */
function riskOf(world: World, c: Company, pe: number | null, cityPe: number | null) {
  const reasons: RiskReason[] = [];
  let points = 0;
  const up = streak(c, (net) => net > 0);
  const down = streak(c, (net) => net <= 0);
  if (up > 0) reasons.push({ kind: 'profitable', tone: 'good', n: up });
  else if (down > 0) {
    points++;
    reasons.push({ kind: 'loss', tone: 'bad', n: down });
    const runway = companyRunway(world, c);
    if (runway < STOCKS.shortRunway) {
      points += runway < STOCKS.shortRunway / 2 ? 2 : 1;
      reasons.push({ kind: 'runway', tone: 'bad', n: Math.max(0, Math.floor(runway)) });
    }
  }
  const last = c.finance.history[c.finance.history.length - 1];
  if (!last || last.revenue <= 0) {
    points++;
    reasons.push({ kind: 'noSales', tone: 'bad', n: 0 });
  }
  const g = monthlyGrowth(c);
  if (g < 0) {
    points++;
    reasons.push({ kind: 'shrinking', tone: 'bad', n: round1(-g * 100) });
  } else if (g >= STOCKS.fastGrowth)
    reasons.push({ kind: 'growing', tone: 'good', n: round1(g * 100) });
  const swing = swingOf(c);
  if (swing === null) {
    points++;
    reasons.push({ kind: 'new', tone: 'warn', n: (c.ipo?.history ?? []).length });
  } else if (swing >= STOCKS.bigSwing) {
    points += swing >= STOCKS.wildSwing ? 2 : 1;
    reasons.push({ kind: 'swings', tone: 'warn', n: Math.round(swing * 100) });
  } else if (swing < STOCKS.calmSwing)
    reasons.push({ kind: 'calm', tone: 'good', n: Math.round(swing * 1000) / 10 });
  else reasons.push({ kind: 'swings', tone: 'warn', n: Math.round(swing * 100) });
  if (pe !== null && cityPe !== null && pe > cityPe * STOCKS.pricey) {
    points++;
    reasons.push({ kind: 'pricey', tone: 'warn', n: round1(pe) });
  }
  const score = Math.max(1, Math.min(5, 1 + points));
  return { score, level: score <= 2 ? 'low' : score === 3 ? 'medium' : 'high', reasons } as const;
}

/** Is the price fair against the city: P/E against the city's, else P/S against the city's. */
function fairnessOf(
  pe: number | null,
  ps: number | null,
  city: { pe: number | null; ps: number | null },
): 'cheap' | 'fair' | 'expensive' | null {
  const ratio =
    pe !== null && city.pe ? pe / city.pe : ps !== null && city.ps ? ps / city.ps : null;
  if (ratio === null) return null;
  return ratio > STOCKS.expensive ? 'expensive' : ratio < STOCKS.cheap ? 'cheap' : 'fair';
}

/** Most of this company the player may buy now: the float, inside the month's depth cap. */
export function buyLimitShares(world: World, p: Player, c: Company) {
  const float = c.capTable.holdings[`pub:${c.id}`]?.shares ?? 0;
  if (!investorOn(world)) return float;
  const m = getMarket(world, c.market);
  const ex = m.exchange;
  const used = ex && ex.bought.month === m.month ? (ex.bought.by[`${p.id}:${c.id}`] ?? 0) : 0;
  return Math.max(0, Math.floor(INVESTOR.exchange.depthShare * (float + used)) - used);
}

/** Everything a player should see about a listed company before buying. */
export function stockAnalysis(
  world: World,
  p: Player,
  c: Company,
  multiples: (marketId: string) => CityMultiples = (id) => cityMultiples(world, id),
) {
  const m = getMarket(world, c.market);
  const h = c.finance.history;
  const last = h[h.length - 1];
  const year = yearOf(c);
  const fd = fullyDiluted(c.capTable);
  const cap = Math.round(capOf(c));
  const pe = peOf(c);
  const ps = psOf(c);
  const city = multiples(c.market);
  const g = monthlyGrowth(c);
  // Profitable listed companies pay a share of each month's profit (investor-career worlds).
  const dividendPct =
    investorOn(world) && !c.aiCeo && last && last.net > 0 && cap > 0
      ? round1(((last.net * INVESTOR.exchange.dividendShare * 12) / cap) * 100)
      : null;
  const acc = account(world, p.accounts.local);
  const yourCash = valueIn(world, Math.max(0, acc.balance), acc.currency, m.data.currency);
  return {
    idea: c.idea,
    revenueModel: c.revenueModel,
    customers: last?.customers ?? 0,
    /** Price per customer a month (company currency, minor units). */
    pricePerCustomer: c.price,
    staff: c.staff.length,
    foundedMonth: c.foundedMonth,
    revenueMonth: last?.revenue ?? 0,
    profitMonth: last?.net ?? 0,
    revenueYear: year.revenue,
    profitYear: year.profit,
    /** Fewer than 12 months of accounts: the year is the last month × 12. */
    yearIsEstimate: year.estimate,
    /** Profit per 100 of revenue, last month. */
    marginPct: last && last.revenue > 0 ? Math.round((last.net / last.revenue) * 100) : null,
    growthMonthPct: round1(g * 100),
    growthYearPct: Math.round((Math.pow(1 + g, 12) - 1) * 100),
    shares: fd,
    marketCap: cap,
    pe: pe === null ? null : round1(pe),
    ps: ps === null ? null : round1(ps),
    cityPe: city.pe,
    cityPs: city.ps,
    fairness: fairnessOf(pe, ps, city),
    dividendPct,
    risk: riskOf(world, c, pe, city.pe),
    /** The market month of the last price in `history`. */
    historyEndMonth: m.month,
    news: m.news
      .filter((n) => n.subject.kind === 'company' && n.subject.id === c.id)
      .slice(0, STOCKS.news)
      .map((n) => ({ id: n.id, headline: n.headline, outlet: n.outletName, month: n.month })),
    /** Your local account's money, in the company's currency. */
    yourCash,
    yourCurrency: acc.currency,
    /** Most you can buy now (the float, inside the month's depth cap). */
    maxBuyShares: buyLimitShares(world, p, c),
    brokerBps: EXITS.ipo.brokerBps,
    /** Limit orders exist on this exchange (investor-career worlds). */
    limitOrders: investorOn(world),
  };
}

export type StockAnalysis = ReturnType<typeof stockAnalysis>;

/** Every city with a stock market, the player's own city first. */
export function stockExchangesView(world: World, p: Player) {
  const home = getMarket(world, homeMarketOf(p));
  return Object.values(world.markets)
    .filter((m): m is MarketState => !!m)
    .map((m) => {
      const listed = listedHere(world, m.id);
      const ex = m.exchange;
      return {
        market: m.id,
        city: m.data.name,
        country: m.data.country,
        currency: m.data.currency,
        home: m.id === home.id,
        companies: listed.length,
        /** The city index (investor-career worlds), else null. */
        index: ex
          ? {
              level: round2(ex.level),
              changePct: ex.prevLevel
                ? round2(((ex.level - ex.prevLevel) / ex.prevLevel) * 100)
                : 0,
              history: ex.history,
            }
          : null,
        /** One unit of your home currency in this city's (when they differ). */
        fx:
          m.data.currency === home.data.currency
            ? null
            : round2(valueIn(world, 10_000, home.data.currency, m.data.currency) / 10_000),
      };
    })
    .filter((x) => x.companies > 0)
    .sort((a, b) => homeFirst(p, a, b));
}
