/**
 * The Customers view (round 3 player feedback: "I have about six paying
 * customers now but their monies are not counted, and I can't see how to
 * track my customers").
 *
 * One list of everyone who pays the company, one total (the same number as
 * traction.ts `customerFacts`, which every other screen shows), and where
 * the month's revenue from customers came from:
 *
 *  - signed: customers won in the Sales pipeline (sales.ts), each with its
 *    agreed monthly price, when it signed, any commitment, what it has paid;
 *  - businesses: local businesses buying after a pitch (economy.ts);
 *  - buyers: player companies on an active supply contract (marketplace.ts);
 *  - market: the paying customers the market model brings in each segment
 *    (customers.ts: marketing, outreach, word of mouth and the B2B deals the
 *    team closes), one row per segment. A new company's welcome customer is
 *    one of these.
 *
 * Pure derivation: nothing here changes the world.
 */
import { RECURRING, reliability } from './customers.js';
import { businessesOf, isOpen } from './economy.js';
import { getMarket, lastPnl } from './helpers.js';
import { customersOn } from './releases.js';
import { customerFacts } from './traction.js';
import type { Company, SalesChurnReason, World } from './types.js';

export type CustomerStatus = 'active' | 'risk' | 'churned';
export type CustomerKind = 'signed' | 'business' | 'buyer' | 'market';

/** Why a customer may leave soon. */
export type CustomerRisk = 'hibernation' | 'reliability' | 'price' | 'competition';

export interface CustomerRow {
  id: string;
  kind: CustomerKind;
  name: string;
  /** The segment (signed and market rows). */
  segment: string | null;
  /** Customers this row stands for (1, a segment's paying customers, or 0 once churned). */
  count: number;
  /** What they pay a month now, local minor units. */
  monthly: number;
  /** Market month they started paying; null for a segment row. */
  since: number | null;
  status: CustomerStatus;
  risk: CustomerRisk | null;
  /** Signed customers and contracts: the last month they are committed to. */
  committedUntil: number | null;
  /** Churned signed customers: when and why they left. */
  left: { month: number; reason: SalesChurnReason } | null;
  /** What they have paid (or been billed) so far; null where it isn't tracked. */
  paid: number | null;
}

export interface CustomerBook {
  /** Every paying customer: the number every screen shows. */
  total: number;
  breakdown: { signed: number; businesses: number; buyers: number; market: number };
  /** Of the market customers, the one a new company starts with (0 or 1). */
  welcome: number;
  /** Monthly recurring revenue from today's customers at today's prices. */
  mrr: number;
  /** MRR by kind of customer. */
  mrrBy: { signed: number; businesses: number; buyers: number; market: number };
  /**
   * How signed customers pay: 'month-end' (customers note: their price at
   * every month end, counted in that month's revenue) or 'terms' (invoiced,
   * paid 30–90 days later, counted when paid).
   */
  billing: 'month-end' | 'terms';
  /** The last settled month's revenue and where it came from (null before the first). */
  lastMonth: {
    month: number;
    revenue: number;
    /** What signed customers paid; null when not recorded (before the customers note). */
    signed: number | null;
    businesses: number;
    buyers: number;
    branches: number;
    /** Everything else: market customers, and B2B invoices collected. */
    market: number;
  } | null;
  /** Customer money invoiced but not yet paid (B2B terms). */
  receivables: number;
  rows: CustomerRow[];
}

/** Below this reliability a signed customer is a churn risk (sales.ts churn rises steeply). */
const SIGNED_RISK = 0.45;

function signedRisk(c: Company, month: number, committed?: number): CustomerRisk | null {
  if (committed !== undefined && month <= committed) return null;
  if (c.hibernation) return 'hibernation';
  // Well below what customers put up with: they leave several times as often.
  if (reliability(c) < SIGNED_RISK) return 'reliability';
  return null;
}

export function customerBook(world: World, c: Company): CustomerBook {
  const m = getMarket(world, c.market);
  const month = m.month;
  const facts = customerFacts(world, c);
  const rows: CustomerRow[] = [];
  const rel = reliability(c);

  // Signed in the Sales pipeline. Each settlement since signing bills one month.
  let signedMrr = 0;
  for (const a of c.salesAccounts ?? []) {
    const risk = signedRisk(c, month, a.committedUntil);
    signedMrr += a.monthly;
    rows.push({
      id: `signed:${a.dealId}`,
      kind: 'signed',
      name: a.name,
      segment: m.segments[a.segmentKey]?.name ?? null,
      count: 1,
      monthly: a.monthly,
      since: a.since,
      status: risk ? 'risk' : 'active',
      risk,
      committedUntil: a.committedUntil ?? null,
      left: null,
      paid: a.paid ?? a.monthly * Math.max(0, month - a.since),
    });
  }

  // Local businesses buying after a pitch (not already a signed customer).
  const viaSales = new Set((c.salesAccounts ?? []).map((a) => a.businessId).filter(Boolean));
  let businessMrr = 0;
  for (const b of Object.values(businessesOf(m))) {
    if (!isOpen(b) || viaSales.has(b.id)) continue;
    for (const s of b.suppliers) {
      if (s.companyId !== c.id) continue;
      const risk: CustomerRisk | null = c.hibernation
        ? 'hibernation'
        : rel < 0.55
          ? 'reliability'
          : null;
      businessMrr += s.monthlyMinor;
      rows.push({
        id: `business:${b.id}`,
        kind: 'business',
        name: b.name,
        segment: null,
        count: 1,
        monthly: s.monthlyMinor,
        since: s.since,
        status: risk ? 'risk' : 'active',
        risk,
        committedUntil: null,
        left: null,
        paid: s.paid ?? s.monthlyMinor * Math.max(0, month - s.since),
      });
    }
  }

  // Player companies on an active supply contract, one row per buyer.
  const buyers = new Map<string, CustomerRow>();
  let buyerMrr = 0;
  for (const k of Object.values(world.contracts ?? {})) {
    if (k.sellerId !== c.id || k.status !== 'active' || k.buyerId === c.id) continue;
    buyerMrr += k.price;
    const paid = k.price * Math.max(0, month - k.startMonth);
    const row = buyers.get(k.buyerId);
    if (row) {
      row.monthly += k.price;
      row.paid = (row.paid ?? 0) + paid;
      row.since = Math.min(row.since ?? k.startMonth, k.startMonth);
      continue;
    }
    buyers.set(k.buyerId, {
      id: `buyer:${k.buyerId}`,
      kind: 'buyer',
      name: world.companies[k.buyerId]?.name ?? '—',
      segment: null,
      count: 1,
      monthly: k.price,
      since: k.startMonth,
      status: 'active',
      risk: null,
      committedUntil: k.plannedEndMonth,
      left: null,
      paid,
    });
  }
  rows.push(...buyers.values());

  // The market model's paying customers, one row per segment.
  let marketMrr = 0;
  for (const [key, pos] of Object.entries(c.segments)) {
    if (pos.paying <= 0) continue;
    const seg = m.segments[key];
    const monthly = RECURRING[c.revenueModel] ? pos.paying * c.price : 0;
    marketMrr += monthly;
    const cause = pos.churnCause;
    const risk: CustomerRisk | null = c.hibernation
      ? 'hibernation'
      : pos.churned > 0 && cause && cause !== 'normal'
        ? cause
        : null;
    rows.push({
      id: `market:${key}`,
      kind: 'market',
      name: seg?.name ?? key,
      segment: seg?.name ?? key,
      count: pos.paying,
      monthly,
      since: null,
      status: risk ? 'risk' : 'active',
      risk,
      committedUntil: null,
      left: null,
      paid: null,
    });
  }

  // Signed customers who left (the last few, feedback note).
  for (const x of c.salesChurn ?? []) {
    rows.push({
      id: `churned:${x.dealId}:${x.month}`,
      kind: 'signed',
      name: x.name,
      segment: null,
      count: 0,
      monthly: x.monthly,
      since: c.deals?.find((d) => d.id === x.dealId)?.closedMonth ?? null,
      status: 'churned',
      risk: null,
      committedUntil: null,
      left: { month: x.month, reason: x.reason },
      paid: x.paid ?? null,
    });
  }

  const pnl = lastPnl(c);
  const signed = pnl?.signedRevenue ?? null;
  const businesses = pnl?.businessRevenue ?? 0;
  const buyersPaid = pnl?.playerRevenue ?? 0;
  const branches = pnl?.branches?.revenue ?? 0;
  return {
    total: facts.total,
    breakdown: {
      signed: facts.accounts,
      businesses: facts.businesses,
      buyers: facts.buyers,
      market: facts.people,
    },
    welcome: facts.welcome,
    mrr: signedMrr + businessMrr + buyerMrr + marketMrr,
    mrrBy: { signed: signedMrr, businesses: businessMrr, buyers: buyerMrr, market: marketMrr },
    billing: customersOn(world) ? 'month-end' : 'terms',
    lastMonth: pnl
      ? {
          month: pnl.month,
          revenue: pnl.revenue,
          signed,
          businesses,
          buyers: buyersPaid,
          branches,
          market: Math.max(0, pnl.revenue - (signed ?? 0) - businesses - buyersPaid - branches),
        }
      : null,
    receivables: c.finance.receivables.reduce((a, r) => a + r.amount, 0),
    rows,
  };
}
