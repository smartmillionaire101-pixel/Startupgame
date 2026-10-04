/**
 * Company operations (§5, §6, §8, §11, §12, §13): product progress, revenue
 * collection, costs (some priced in dollars), taxes, loans, compliance,
 * pivots, shutdown, and the warning signs that precede failure.
 */
import { segmentsForIndustry } from './data/industries.js';
import { rulesFor } from './data/rules.js';
import type { Industry } from './data/industries.js';
import { waterfall } from './captable.js';
import { RECURRING, emptyPosition, reliability } from './customers.js';
import { ensure } from './errors.js';
import {
  achieve,
  holderAccount,
  adjustTrust,
  burn,
  col,
  getMarket,
  lastPnl,
  notify,
  publish,
  totalCustomers,
} from './helpers.js';
import { account, pay, transfer, transferUpTo } from './ledger.js';
import { clamp, clamp01 } from './math.js';
import { formatMoney, scale } from './money.js';
import type { Rng } from './rng.js';
import { applyStarEvent, settleStars } from './stars.js';
import { outputOf, settleStaff } from './staff.js';
import { monthlyGrowth } from './valuation.js';
import { setCogs } from './world.js';
import { recordInterest, recordLoanLoss } from './banks.js';
import { updateDistress } from './rescue.js';
import { buildStory, storySnapshot } from './story.js';
import type {
  BuildMode,
  Company,
  MarketState,
  MonthlyPnl,
  Player,
  RevenueModel,
  World,
} from './types.js';

export const PNL_HISTORY = 36;

/** Months of cash left at the current burn; Infinity when profitable. */
export function companyRunway(world: World, c: Company): number {
  const cash = account(world, c.account).balance;
  const b = burn(c);
  if (b <= 0) return Infinity;
  return cash / b;
}

/** Default alive: profitable before the money runs out, at current growth. */
export function defaultAlive(world: World, c: Company): boolean {
  const pnl = lastPnl(c);
  if (!pnl) return false;
  if (pnl.net >= 0) return true;
  const g = monthlyGrowth(c);
  if (g <= 0) return false;
  let cash = account(world, c.account).balance;
  let rev = pnl.revenue;
  const costs = pnl.revenue - pnl.net;
  for (let i = 0; i < 60 && cash > 0; i++) {
    rev *= 1 + g;
    if (rev >= costs) return true;
    cash -= costs - rev;
  }
  return false;
}

const MODE: Record<BuildMode, { fit: number; quality: number; debt: number }> = {
  fast: { fit: 1.35, quality: 0.5, debt: 1.6 },
  balanced: { fit: 1, quality: 1, debt: 0.6 },
  quality: { fit: 0.7, quality: 1.5, debt: -0.4 },
};

/** Engineering and product output turn into fit, quality and tech debt. */
export function settleProduct(c: Company, founder: Player | undefined) {
  const founderBuild = founder ? (c.buildHours / 160) * (founder.skills.product / 60) : 0;
  const output = outputOf(c, ['engineer']) + outputOf(c, ['product']) * 0.6 + founderBuild;
  const discovery =
    c.targetSegments.reduce((a, k) => a + (c.product.discovery[k] ?? 0), 0) /
    Math.max(1, c.targetSegments.length);
  const mode = MODE[c.product.buildMode];
  const p = c.product;
  // Building without customer discovery raises the risk of building the wrong thing (§5).
  p.fit = clamp01(p.fit + output * 0.025 * (1 - p.fit) * (0.3 + 0.7 * discovery) * mode.fit);
  p.quality = clamp01(
    p.quality + output * 0.02 * (1 - p.quality) * mode.quality - p.techDebt * 0.025,
  );
  p.techDebt = clamp01(p.techDebt + output * 0.012 * mode.debt + (output === 0 ? 0.005 : 0));
  c.buildHours = 0;
}

/** Share of salary paid to furloughed staff while a company hibernates. */
export const FURLOUGH_PAY = 0.4;
/** Rent saved by downsizing the office. */
export const DOWNSIZED_OFFICE = 0.5;

/** Salaries due this month (reduced while hibernating), excluding arrears. */
export function payrollThisMonth(c: Company): number {
  const full = c.staff.reduce((a, s) => a + s.salary, 0);
  return c.hibernation ? Math.round(full * FURLOUGH_PAY) : full;
}

export function officeRent(m: MarketState, c: Company): number {
  const seats = c.staff.length + c.founderIds.length;
  const rent = Math.round(scale(m.data.officeSeat * 100, seats) * c.supply.overheadMult);
  return c.officeDownsized ? Math.round(rent * DOWNSIZED_OFFICE) : rent;
}

/** Marketing actually spent this month (nothing while hibernating). */
export function marketingSpend(c: Company): number {
  return c.hibernation ? 0 : Math.round(c.marketingBudget * c.supply.overheadMult);
}

export function cloudCost(m: MarketState, c: Company, customers = totalCustomers(c)): number {
  return Math.round(
    (Math.round(c.cogsUsdPerCustomer * customers * m.data.unitsPerUsd) + scale(col(m), 0.05)) *
      c.supply.cogsMult,
  );
}

/** Loan repayments due this month across all loans. */
export function loanPaymentsDue(c: Company): number {
  return c.finance.loans.reduce((a, l) => {
    const r = Math.round((l.outstanding * l.rateBps) / 10_000 / 12);
    return a + Math.min(l.monthlyPayment, l.outstanding + r);
  }, 0);
}

/**
 * What the company will spend next month at today's settings (no randomness):
 * payroll, founder pay, rent, marketing, cloud, loan repayments and supplier contracts.
 */
export function monthlyCosts(world: World, c: Company): number {
  const m = getMarket(world, c.market);
  const contracts = Object.values(world.contracts ?? {})
    .filter((k) => k.buyerId === c.id && k.status === 'active')
    .reduce((a, k) => a + k.price, 0);
  return (
    payrollThisMonth(c) +
    c.founderSalary * c.founderIds.length +
    officeRent(m, c) +
    marketingSpend(c) +
    cloudCost(m, c) +
    loanPaymentsDue(c) +
    contracts
  );
}

/** Net cash out next month at today's settings, using last month's revenue. */
export function projectedBurn(world: World, c: Company): number {
  return monthlyCosts(world, c) - (lastPnl(c)?.revenue ?? 0);
}

interface CostLine {
  key: keyof Pick<
    MonthlyPnl,
    'payroll' | 'founderSalary' | 'office' | 'marketing' | 'cloud' | 'interest'
  >;
  amount: number;
  to: string;
  memo: string;
}

/**
 * Money side of the month. Order of payment when cash is short mirrors the
 * shutdown waterfall: staff first, then lenders, then everything else.
 */
export function settleFinances(world: World, c: Company, rng: Rng, month: number): MonthlyPnl {
  const m = getMarket(world, c.market);
  // Revenue.
  let revenue = 0;
  let b2bInvoiced = 0;
  for (const [key, pos] of Object.entries(c.segments)) {
    const seg = m.segments[key];
    if (!seg) continue;
    const perCustomer =
      c.revenueModel === 'usage' ? Math.round(c.price * rng.range(0.85, 1.15)) : c.price;
    const billed = RECURRING[c.revenueModel] ? pos.paying * perCustomer : pos.won * perCustomer * 4;
    if (seg.kind === 'b2b') b2bInvoiced += billed;
    else revenue += billed;
  }
  // B2B invoices: paid on 30/60/90-day terms; some pay late, some never (§6).
  if (b2bInvoiced > 0) {
    const terms = rng.int(1, 3);
    const bad = Math.round(b2bInvoiced * rng.range(0.01, 0.06));
    c.finance.receivables.push({ due: month + terms, amount: b2bInvoiced - bad });
  }
  const due = c.finance.receivables.filter((r) => r.due <= month);
  c.finance.receivables = c.finance.receivables.filter((r) => r.due > month);
  const collected = due.reduce((a, r) => a + r.amount, 0);
  transfer(world, m.ext.customers, c.account, revenue + collected, 'Customer revenue', month);
  // Revenue from other player companies (already paid by settleContracts), reported separately (§6).
  const b2b = c.ledgerThisMonth;
  const totalRevenue = revenue + collected + b2b.playerRevenue;

  // Costs. Cloud/processing is priced in dollars, so devaluation hurts local earners (§8).
  const customers = totalCustomers(c);
  // A good payments supplier cuts processing costs; a procurement supplier trims overheads.
  const cloudLocal = cloudCost(m, c, customers);
  const payroll = payrollThisMonth(c) + c.finance.unpaidPayroll;

  const lines: CostLine[] = [
    { key: 'payroll', amount: payroll, to: m.ext.payroll, memo: 'Payroll' },
    // Loans are paid one by one to each lender, right after payroll (see below).
    { key: 'interest', amount: 0, to: m.ext.bank, memo: 'Loan repayment' },
    {
      key: 'founderSalary',
      amount: c.founderSalary * c.founderIds.length,
      to: '',
      memo: 'Founder salary',
    },
    {
      key: 'office',
      amount: officeRent(m, c),
      to: m.ext.suppliers,
      memo: 'Office rent',
    },
    {
      key: 'marketing',
      amount: marketingSpend(c),
      to: m.ext.suppliers,
      memo: 'Marketing',
    },
    {
      key: 'cloud',
      amount: cloudLocal,
      to: m.ext.suppliers,
      memo: 'Cloud and processing (USD-priced)',
    },
  ];
  const paid: Record<string, number> = {};
  let paidInterest = 0;
  let paidPrincipal = 0;
  let loanShort = false;
  for (const line of lines) {
    if (line.key === 'founderSalary') {
      let total = 0;
      for (const fid of c.founderIds) {
        const f = world.players[fid];
        if (!f) continue;
        const gross = transferUpTo(
          world,
          c.account,
          f.accounts.local,
          c.founderSalary,
          'Founder salary',
          month,
        );
        const tax = Math.round(gross * m.data.tax.personalIncome);
        transfer(
          world,
          f.accounts.local,
          m.ext.tax,
          Math.min(tax, account(world, f.accounts.local).balance),
          'Personal income tax',
          month,
        );
        f.lastMonth.income += gross;
        f.lastMonth.tax += tax;
        total += gross;
      }
      paid[line.key] = total;
      continue;
    }
    if (line.key === 'interest') {
      // Each loan repays its own lender (the AI bank or a player bank).
      let total = 0;
      for (const l of c.finance.loans) {
        // Revenue-based finance repays a share of this month's revenue; the fee is built into what's owed.
        const rbf = !!(l.revenueShareBps && l.repayCapBps);
        const r = rbf ? 0 : Math.round((l.outstanding * l.rateBps) / 10_000 / 12);
        const due = rbf
          ? Math.min(l.outstanding, Math.round((totalRevenue * l.revenueShareBps!) / 10_000))
          : Math.min(l.monthlyPayment, l.outstanding + r);
        const got = transferUpTo(
          world,
          c.account,
          l.lenderAccount ?? m.ext.bank,
          due,
          `Loan repayment (${l.lender})`,
          month,
        );
        const interestPart = rbf
          ? Math.round((got * (l.repayCapBps! - 10_000)) / l.repayCapBps!)
          : Math.min(got, r);
        recordInterest(world, l.lenderBankId, interestPart);
        paidInterest += interestPart;
        paidPrincipal += got - interestPart;
        l.outstanding -= rbf ? got : got - interestPart;
        l.monthsLeft -= 1;
        if (got < due) loanShort = true;
        total += got;
      }
      paid[line.key] = total;
      continue;
    }
    paid[line.key] = transferUpTo(world, c.account, line.to, line.amount, line.memo, month);
  }

  // Unpaid payroll carries over and is a crisis (staff are paid first in a shutdown, too).
  const payrollShort = payroll - (paid.payroll ?? 0);
  c.finance.unpaidPayroll = payrollShort;
  // A short loan payment is a default.
  if (loanShort) defaultOnLoans(world, c, month);
  c.finance.loans = c.finance.loans.filter((l) => l.outstanding > 0);

  // Corporate tax on profit, with losses carried forward.
  const expenses =
    (paid.payroll ?? 0) +
    paidInterest +
    (paid.founderSalary ?? 0) +
    (paid.office ?? 0) +
    (paid.marketing ?? 0) +
    (paid.cloud ?? 0) +
    b2b.supplierCost;
  const profit = totalRevenue - expenses;
  let tax = 0;
  if (profit > 0) {
    const taxable = Math.max(0, profit - c.finance.lossCarryForward);
    c.finance.lossCarryForward = Math.max(0, c.finance.lossCarryForward - profit);
    tax = transferUpTo(
      world,
      c.account,
      m.ext.tax,
      Math.round(taxable * m.data.tax.corporate),
      'Corporate tax',
      month,
    );
  } else {
    c.finance.lossCarryForward += -profit;
  }

  const pnl: MonthlyPnl = {
    month,
    revenue: totalRevenue,
    playerRevenue: b2b.playerRevenue,
    suppliers: b2b.supplierCost,
    payroll: paid.payroll ?? 0,
    founderSalary: paid.founderSalary ?? 0,
    office: paid.office ?? 0,
    marketing: paid.marketing ?? 0,
    cloud: paid.cloud ?? 0,
    compliance: 0,
    interest: paid.interest ?? 0,
    tax,
    net: totalRevenue - expenses - tax - paidPrincipal,
    cashEnd: account(world, c.account).balance,
    customers,
  };
  c.lastFlaggedRevenue = b2b.flaggedRevenue;
  c.ledgerThisMonth = { playerRevenue: 0, supplierCost: 0, flaggedRevenue: 0 };
  c.finance.history.push(pnl);
  if (c.finance.history.length > PNL_HISTORY) c.finance.history.shift();
  return pnl;
}

function defaultOnLoans(world: World, c: Company, month: number) {
  const m = getMarket(world, c.market);
  for (const l of c.finance.loans) {
    if (l.personalGuarantee) {
      const g = world.players[l.personalGuarantee];
      if (g) {
        const taken = transferUpTo(
          world,
          g.accounts.local,
          l.lenderAccount ?? m.ext.bank,
          l.outstanding,
          `Personal guarantee called (${c.name})`,
          month,
        );
        l.outstanding -= taken;
        g.credit.defaults += 1;
        notify(world, g.id, {
          month,
          kind: 'warning',
          text: `Your personal guarantee was called: ${formatMoney(taken, m.data.currency)} taken from savings.`,
        });
      }
    }
  }
  for (const fid of c.founderIds) {
    const f = world.players[fid];
    if (f) f.credit.defaults += 1;
  }
  applyStarEvent(c.stars, -0.3);
  publish(world, {
    market: c.market,
    month,
    outletId: 'public-record',
    outletName: 'Public record',
    kind: 'public-record',
    alert: `${c.name} misses a loan payment.`,
    headline: `${c.name} defaults on a bank loan`,
    body: `${c.name} missed a scheduled repayment to ${m.bankName}. Lenders are reviewing their exposure.`,
    starDelta: -0.3,
    verified: true,
    subject: { kind: 'company', id: c.id },
  });
}

/** What real performance says a company's stars should be (0–5). */
export function companyPerformanceRating(world: World, c: Company): number {
  const pnl = lastPnl(c);
  const growth = monthlyGrowth(c);
  const customers = totalCustomers(c);
  const runway = companyRunway(world, c);
  return clamp(
    1 +
      Math.min(1.2, Math.log10(Math.max(1, customers)) * 0.3) +
      clamp(growth * 6, -0.8, 1.2) +
      reliability(c) * 1 +
      (pnl && pnl.net >= 0 ? 0.6 : 0) -
      (runway < 3 ? 0.5 : 0) -
      (c.finance.unpaidPayroll > 0 ? 1 : 0),
    0,
    5,
  );
}

/** Warning signs (§13): runway under six months, retention falls, a key customer leaves, a raise fails. */
export function computeWarnings(world: World, c: Company): string[] {
  const w: string[] = [];
  const runway = companyRunway(world, c);
  if (runway < 6)
    w.push(`Runway is ${Math.max(0, Math.floor(runway))} months. Cut costs or raise.`);
  const churn = Object.values(c.segments).reduce((a, s) => a + s.churned, 0);
  const paying = totalCustomers(c);
  if (paying > 20 && churn / Math.max(1, paying + churn) > 0.08)
    w.push('Retention is falling. Fix reliability or support.');
  if (c.finance.unpaidPayroll > 0) w.push('Staff were not paid in full. Morale is collapsing.');
  if (c.product.techDebt > 0.6) w.push('Tech debt is causing outages. Switch to quality mode.');
  const missing = rulesFor(c.market, c.industry).filter((r) => !c.compliance[r.id]);
  if (missing.length && paying > 200)
    w.push(`${missing.length} compliance gap(s) could surface in diligence.`);
  return w;
}

/** Regulator inspections: higher stars and size bring closer attention (§11). */
export function inspections(world: World, c: Company, rng: Rng, month: number) {
  const m = getMarket(world, c.market);
  const size = c.staff.length / 10 + totalCustomers(c) / 5000;
  for (const rule of rulesFor(c.market, c.industry)) {
    if (c.compliance[rule.id]) continue;
    const p = 0.004 * (1 + c.stars.value) * (1 + size) * (rule.fineCol > 10 ? 2 : 1);
    if (!rng.chance(p)) continue;
    const fine = scale(col(m), rule.fineCol);
    transferUpTo(world, c.account, m.ext.tax, fine, `Fine: ${rule.title}`, month);
    applyStarEvent(c.stars, -0.3);
    if (rule.fineCol >= 20) {
      // Forced shutdown of the product line: half of customers lost.
      for (const pos of Object.values(c.segments)) pos.paying = Math.floor(pos.paying / 2);
    }
    publish(world, {
      market: c.market,
      month,
      outletId: 'public-record',
      outletName: 'Public record',
      kind: 'public-record',
      alert: `${rule.regulator} fines ${c.name}.`,
      headline: `${c.name} fined over ${rule.title.toLowerCase()}`,
      body: `${rule.regulator} fined ${c.name} ${formatMoney(fine, m.data.currency)}. ${rule.penalty}`,
      starDelta: -0.3,
      verified: true,
      subject: { kind: 'company', id: c.id },
    });
    for (const fid of c.founderIds)
      notify(world, fid, {
        month,
        kind: 'warning',
        text: `Regulator fine: ${formatMoney(fine, m.data.currency)} (${rule.title}).`,
      });
  }
}

/** The whole month for one company, after customers have been settled at market level. */
export function settleCompany(world: World, c: Company, rng: Rng, month: number) {
  const founder = world.players[c.founderIds[0]!];
  const owedBefore = c.finance.unpaidPayroll > 0;
  const before = c.ai ? null : storySnapshot(world, c);
  // Hibernation freezes the product: no progress, no new debt.
  if (c.hibernation) c.buildHours = 0;
  else settleProduct(c, founder);
  const pnl = settleFinances(world, c, rng, month);
  const runway = companyRunway(world, c);
  const departures = settleStaff(world, c, rng, month, runway, c.finance.unpaidPayroll > 0);
  inspections(world, c, rng, month);
  settleStars(c.stars, companyPerformanceRating(world, c));
  c.warnings = computeWarnings(world, c);
  if (!c.ai) {
    for (const fid of c.founderIds) {
      const f = world.players[fid];
      if (!f || f.ai) continue;
      if (totalCustomers(c) > 0)
        achieve(world, f, 'founder.first-customer', 'First customer', month);
      if (c.staff.length > 0) achieve(world, f, 'founder.first-hire', 'First hire', month);
      if (pnl.net > 0 && pnl.revenue > 0)
        achieve(world, f, 'founder.profitable', 'Profitability', month);
      const m = getMarket(world, c.market);
      const hundredM = Math.round((100_000_000_00 / 1530) * m.data.unitsPerUsd);
      if (pnl.revenue * 12 >= hundredM)
        achieve(
          world,
          f,
          'founder.revenue-100m',
          'First ₦100m (or local equivalent) annual revenue',
          month,
        );
      if (c.capTable.lastPostMoney >= Math.round(1_000_000_000_00 * m.data.unitsPerUsd))
        achieve(world, f, 'founder.unicorn', 'Unicorn', month);
      for (const w of c.warnings)
        notify(world, fid, { month, kind: 'warning', text: `${c.name}: ${w}` });
    }
  }
  // A second month of unpaid payroll means the company cannot go on.
  if (owedBefore && c.finance.unpaidPayroll > 0) {
    shutdownCompany(world, c, 'insolvent', month);
    c.distress = null;
    return;
  }
  if (!c.ai && before) {
    updateDistress(world, c, month, true);
    c.story = buildStory(world, c, month, c.storyBase ?? before, departures);
    c.storyBase = storySnapshot(world, c);
  }
}

/** Compliance (§11): costs money and hours; skipping it is a gamble. */
export function comply(world: World, c: Company, ruleId: string, month: number) {
  const rule = rulesFor(c.market, c.industry).find((r) => r.id === ruleId);
  ensure(rule, 'rule.missing', 'That rule doesn’t apply to you.');
  ensure(!c.compliance[ruleId], 'rule.done', 'Already compliant.');
  const m = getMarket(world, c.market);
  transfer(
    world,
    c.account,
    m.ext.suppliers,
    scale(col(m), rule.costCol),
    `Compliance: ${rule.title}`,
    month,
  );
  c.compliance[ruleId] = true;
  return rule;
}

export type PivotKind = 'customer' | 'product' | 'market' | 'model';

/**
 * Pivots (§13). Keeps the company, cash, team, investors and code; costs some
 * customers, morale, staff and investor patience. Too many pivots erode trust.
 */
export function pivot(
  world: World,
  c: Company,
  kind: PivotKind,
  opts: { segments?: string[]; industry?: Industry; revenueModel?: RevenueModel },
  rng: Rng,
) {
  if (kind === 'customer') {
    ensure(opts.segments?.length, 'pivot.segments', 'Pick the new customer segment.');
    setTargets(world, c, opts.segments);
    for (const pos of Object.values(c.segments)) pos.paying = Math.round(pos.paying * 0.7);
  } else if (kind === 'product') {
    c.product.fit *= 0.5;
    c.product.techDebt = clamp01(c.product.techDebt + 0.1);
    for (const pos of Object.values(c.segments)) pos.paying = Math.round(pos.paying * 0.6);
  } else if (kind === 'market') {
    ensure(
      opts.industry && opts.industry !== c.industry,
      'pivot.industry',
      'Pick a different sector.',
    );
    c.industry = opts.industry;
    c.product.fit *= 0.3;
    c.product.discovery = {};
    c.segments = {};
    c.targetSegments = [segmentsForIndustry(opts.industry)[0]!.key];
    c.compliance = Object.fromEntries(
      Object.entries(c.compliance).filter(([k]) =>
        rulesFor(c.market, opts.industry!).some((r) => r.id === k),
      ),
    );
  } else {
    ensure(
      opts.revenueModel && opts.revenueModel !== c.revenueModel,
      'pivot.model',
      'Pick a different revenue model.',
    );
    c.revenueModel = opts.revenueModel;
    for (const pos of Object.values(c.segments)) pos.paying = Math.round(pos.paying * 0.8);
    setCogs(world, c);
  }
  for (const s of c.staff) s.morale = clamp(s.morale - 12, 0, 100);
  const quitters = c.staff.filter(() => rng.chance(0.1));
  c.staff = c.staff.filter((s) => !quitters.includes(s));
  c.pivots += 1;
}

export function setTargets(world: World, c: Company, segments: string[]) {
  const m = getMarket(world, c.market);
  ensure(
    segments.length >= 1 && segments.length <= 2,
    'segments.count',
    'Target one or two segments.',
  );
  for (const k of segments) {
    const seg = m.segments[k];
    ensure(
      seg && seg.industry === c.industry,
      'segments.industry',
      'That segment isn’t in your sector.',
    );
    c.segments[k] ??= emptyPosition();
  }
  c.targetSegments = [...new Set(segments)];
}

/**
 * Shutdown (§12): cash pays staff first, then creditors, then investors by
 * preference; founders usually get nothing. How you fail matters (§13).
 */
export function shutdownCompany(
  world: World,
  c: Company,
  how: 'orderly' | 'insolvent',
  month: number,
) {
  const m = getMarket(world, c.market);
  // Staff first: unpaid wages plus one month's severance in an orderly wind-down.
  const owedStaff =
    c.finance.unpaidPayroll + (how === 'orderly' ? c.staff.reduce((a, s) => a + s.salary, 0) : 0);
  const staffPaid = transferUpTo(
    world,
    c.account,
    m.ext.payroll,
    owedStaff,
    'Final pay and severance',
    month,
  );
  // Then creditors.
  for (const l of c.finance.loans) {
    const paid = transferUpTo(
      world,
      c.account,
      l.lenderAccount ?? m.ext.bank,
      l.outstanding,
      `Loan payoff (${l.lender})`,
      month,
    );
    l.outstanding -= paid;
    if (l.outstanding > 0) {
      defaultOnLoans(world, c, month);
      // What a shut company can't repay is the lender's loss.
      recordLoanLoss(world, l.lenderBankId, l.outstanding);
      l.outstanding = 0;
    }
  }
  // Then shareholders by preference.
  const remaining = account(world, c.account).balance;
  if (remaining > 0) {
    for (const line of waterfall(c.capTable, remaining)) {
      if (line.total <= 0) continue;
      const to = holderAccount(world, m, line.holderId);
      pay(
        world,
        c.account,
        to,
        Math.min(line.total, account(world, c.account).balance),
        `Wind-down distribution: ${c.name}`,
        month,
      );
      const pos = world.positions[`${line.holderId}:${c.id}`];
      if (pos) pos.returned += line.total;
    }
  }
  // Any rounding dust goes to the outside world so the account closes at zero.
  transfer(
    world,
    c.account,
    m.ext.suppliers,
    account(world, c.account).balance,
    'Account closed',
    month,
  );
  for (const pos of Object.values(world.positions))
    if (pos.companyId === c.id && pos.returned < pos.invested) pos.writtenOff = true;

  const cleanExit = how === 'orderly' && staffPaid >= owedStaff;
  // Relationship capital (§13): returning money fairly builds trust; collapsing burns it.
  const backers = Object.values(world.positions).filter((p) => p.companyId === c.id);
  for (const fid of c.founderIds) {
    for (const b of backers) {
      const investorPlayer =
        world.players[b.investorId] ??
        (world.funds[b.investorId]?.managerId
          ? world.players[world.funds[b.investorId]!.managerId!]
          : undefined);
      adjustTrust(investorPlayer, fid, cleanExit ? 0.1 : -0.3);
      adjustTrust(world.players[fid], b.investorId, cleanExit ? 0.05 : -0.1);
    }
  }
  for (const fid of c.founderIds) {
    const f = world.players[fid];
    if (!f) continue;
    f.failures += 1;
    applyStarEvent(f.stars, cleanExit ? -0.1 : -0.6);
    // Experience carries over: how you fail shapes how easily you come back.
    f.skills.leadership = Math.min(100, f.skills.leadership + (cleanExit ? 6 : 2));
    f.skills.risk = Math.min(100, f.skills.risk + 4);
    notify(world, fid, {
      month,
      kind: 'system',
      text: cleanExit
        ? `${c.name} wound down properly. Staff were paid. Your reputation holds.`
        : `${c.name} collapsed with staff unpaid. This will follow you.`,
    });
  }
  c.status = 'shutdown';
  c.closedMonth = month;
  c.staff = [];
  c.raising = false;
  for (const d of Object.values(world.deals))
    if (d.companyId === c.id && d.status === 'open') d.status = 'withdrawn';
  publish(world, {
    market: c.market,
    month,
    outletId: 'public-record',
    outletName: 'Public record',
    kind: 'public-record',
    alert: `${c.name} shuts down.`,
    headline: cleanExit ? `${c.name} winds down` : `${c.name} collapses, staff unpaid`,
    body: cleanExit
      ? `${c.name} closed after ${month - c.foundedMonth} months. Staff were paid in full and creditors settled.`
      : `${c.name} ran out of cash after ${month - c.foundedMonth} months. Staff are owed wages; creditors face losses.`,
    starDelta: cleanExit ? -0.1 : -0.6,
    verified: true,
    subject: { kind: 'company', id: c.id },
  });
}
