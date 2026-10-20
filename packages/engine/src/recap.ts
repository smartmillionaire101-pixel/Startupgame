/**
 * The month recap (blueprint §9.6, §5.3, FR-020): "end of day", where one
 * game month is one real day.
 *
 * Read-only and derived: nothing here is stored, rolled or paid, so it is
 * safe under replay. Every number comes from an authoritative system:
 *
 * - Money: the statement lines of each account for one game month (the same
 *   lines, and so the same totals, as the Bank statement filtered on that
 *   month). Personal accounts and company accounts are never added together.
 * - Company: the month's P&L, the sales pipeline, the roadmap and the team.
 * - People: contacts met, visits, hangouts and dates.
 * - Journey: chapters recorded complete that month.
 * - Risks and "Tomorrow": today's state and the same cost functions the next
 *   settlement uses (payroll, rent, loans, living costs).
 *
 * A month's lines are labelled with the market month they were posted in:
 * the settlement that opens month M (payroll, revenue, rent, living costs)
 * posts as month M, and so does everything you do until the next one.
 */
import {
  cloudCost,
  loanPaymentsDue,
  marketingSpend,
  officeRent,
  payrollThisMonth,
} from './company.js';
import { carModel } from './data/lifestyle-shop.js';
import { featureById } from './data/roadmap.js';
import { burn, col, getMarket } from './helpers.js';
import { deriveChapters, hasAnyJourney } from './journey.js';
import { RECENT_LIMIT } from './ledger.js';
import { scale, type Currency } from './money.js';
import { lifestyleCost } from './personal.js';
import { propertiesOf, upkeepOf } from './property.js';
import { statementLines, type StatementLine } from './statement.js';
import type { StaffRole } from './data/markets.js';
import type { Company, Id, MonthlyPnl, Player, World } from './types.js';

/** Runway below this many months is flagged as a risk. */
export const RECAP_RUNWAY_RISK = 6;
/** Biggest movements listed per account. */
export const RECAP_TOP = 3;
/** Relationship highlights listed at most. */
export const RECAP_PEOPLE = 6;

export interface RecapItem {
  ref: string | null;
  description: string;
  counterparty: string;
  /** Signed, in the account's currency: in is positive. */
  amount: number;
}

/** One account's month. Personal and business accounts are separate entries, never summed. */
export interface RecapAccount {
  scope: 'personal' | 'business';
  /** 'local' / 'usd' for your own accounts; the company id for a business account. */
  account: string;
  /** The company's name for a business account; null for your own. */
  name: string | null;
  currency: Currency;
  in: number;
  out: number;
  /** in − out: what the balance changed by over the month. */
  net: number;
  count: number;
  /** The biggest movements by size (in or out), at most RECAP_TOP. */
  biggest: RecapItem[];
  /** Balance after the month's last line (now, for the current month). */
  balanceEnd: number;
  /** False if older lines of this month have scrolled off the account's history. */
  complete: boolean;
}

export interface RecapCompany {
  id: Id;
  name: string;
  currency: Currency;
  /** From the month's P&L (null when the company had no settlement that month). */
  revenue: number | null;
  revenueBefore: number | null;
  customers: number | null;
  customersBefore: number | null;
  /** New and lost customers at that settlement (only known for the latest one). */
  won: number | null;
  churned: number | null;
  /** Profit (+) or burn (−) that month, from the P&L. */
  net: number | null;
  deals: {
    won: { name: string; monthly: number }[];
    lost: { name: string; reason: string | null }[];
  };
  releases: string[];
  hires: { name: string; role: StaffRole }[];
  departures: string[];
  /** Months of cash left at the end of the month before and of this month (null: not burning). */
  runwayBefore: number | null;
  runwayAfter: number | null;
  /** The month's story headline, when it is this month's. */
  headline: string | null;
}

export type RecapPerson =
  | { kind: 'contact'; name: string; contact: string }
  | { kind: 'visit'; name: string; host: boolean }
  | { kind: 'hangout'; names: string[] }
  | { kind: 'date'; name: string };

export type RecapRisk =
  | { kind: 'runway'; company: string; months: number }
  | { kind: 'payroll'; company: string; owed: number; currency: Currency }
  | { kind: 'distress'; company: string; level: string }
  | { kind: 'deal'; company: string; name: string; stage: string }
  | { kind: 'candidate'; company: string; name: string; role: StaffRole }
  | { kind: 'loan'; lender: string; missed: number }
  | { kind: 'bills'; short: number; currency: Currency };

export interface RecapBill {
  kind:
    | 'payroll'
    | 'founderPay'
    | 'rent'
    | 'marketing'
    | 'cloud'
    | 'loan'
    | 'suppliers'
    | 'living'
    | 'mortgage'
    | 'upkeep'
    | 'car';
  /** English label (the client has its own copy, keyed on `kind`). */
  label: string;
  /** The lender, or the home's street, for loans, mortgages and running costs. */
  who?: string;
  amount: number;
  currency: Currency;
  /** Depends on things that can still change before it is paid (customers, prices). */
  estimate?: boolean;
}

export type RecapDate =
  | { kind: 'deal'; company: string; name: string }
  | { kind: 'candidate'; company: string; name: string }
  | { kind: 'event'; title: string; host: boolean }
  | { kind: 'competition'; name: string; entered: boolean }
  | { kind: 'demoDay'; company: string; accelerator: string }
  | { kind: 'loanEnds'; lender: string };

export interface RecapView {
  month: number;
  /** The home city's month now. */
  current: number;
  /** Months there is a recap for (newest first), for a month picker. */
  months: number[];
  personal: RecapAccount[];
  business: RecapAccount[];
  companies: RecapCompany[];
  people: RecapPerson[];
  journey: {
    /** Chapters recorded complete this month. */
    completed: { n: number; title: string }[];
    current: { n: number; title: string; done: number; need: number } | null;
  } | null;
  /** Open problems now (always from today's state). */
  risks: RecapRisk[];
  /** What the next settlement (month `current + 1`) brings. */
  tomorrow: {
    month: number;
    personal: RecapBill[];
    /** Per company, its bills and their total (company currency; never added to personal). */
    business: { company: string; currency: Currency; bills: RecapBill[]; total: number }[];
    dates: RecapDate[];
  };
}

// ---------------------------------------------------------------- money

function accountMonth(
  world: World,
  me: Player,
  accountId: Id,
  month: number,
  scope: RecapAccount['scope'],
  account: string,
  name: string | null,
): RecapAccount | null {
  const acc = world.accounts[accountId];
  if (!acc) return null;
  const all = statementLines(world, me, accountId);
  const lines = all.filter((l) => l.month === month);
  let moneyIn = 0;
  let moneyOut = 0;
  for (const l of lines) {
    if (l.amount > 0) moneyIn += l.amount;
    else moneyOut -= l.amount;
  }
  // Lines are newest first: the first line after this month is just before it.
  const after = all.find((l) => l.month <= month);
  const keep = acc.history ?? RECENT_LIMIT;
  const oldest = acc.recent[acc.recent.length - 1];
  const complete = acc.recent.length < keep || (oldest !== undefined && oldest.month < month);
  return {
    scope,
    account,
    name,
    currency: acc.currency,
    in: moneyIn,
    out: moneyOut,
    net: moneyIn - moneyOut,
    count: lines.length,
    biggest: [...lines]
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, RECAP_TOP)
      .map(item),
    balanceEnd: after
      ? after.balance
      : month >= getMarket(world, acc.market).month
        ? acc.balance
        : 0,
    complete,
  };
}

const item = (l: StatementLine): RecapItem => ({
  ref: l.ref,
  description: l.description,
  counterparty: l.counterparty.name,
  amount: l.amount,
});

// ---------------------------------------------------------------- company

const runwayOf = (p: MonthlyPnl | undefined): number | null =>
  p && p.net < 0 ? Math.round((p.cashEnd / -p.net) * 10) / 10 : null;

function companyMonth(world: World, c: Company, month: number): RecapCompany {
  const m = getMarket(world, c.market);
  const h = c.finance.history;
  const pnl = h.find((x) => x.month === month);
  const before = h.find((x) => x.month === month - 1);
  const latest = h[h.length - 1];
  const isLatest = !!pnl && latest === pnl;
  let won = 0;
  let churned = 0;
  for (const pos of Object.values(c.segments)) {
    won += pos.won;
    churned += pos.churned;
  }
  const story = c.story && c.story.month === month ? c.story : null;
  const departures = (story?.items ?? [])
    .filter((i) => i.metric === 'morale' && i.text.endsWith(' quit.'))
    .flatMap((i) => i.text.slice(0, -' quit.'.length).split(', '));
  const deals = c.deals ?? [];
  const accounts = c.salesAccounts ?? [];
  return {
    id: c.id,
    name: c.name,
    currency: m.data.currency,
    revenue: pnl?.revenue ?? null,
    revenueBefore: before?.revenue ?? null,
    customers: pnl?.customers ?? null,
    customersBefore: before?.customers ?? null,
    won: isLatest ? won : null,
    churned: isLatest ? churned : null,
    net: pnl?.net ?? null,
    deals: {
      won: deals
        .filter((d) => d.stage === 'won' && d.closedMonth === month)
        .map((d) => ({
          name: d.customer.name,
          monthly: accounts.find((a) => a.dealId === d.id)?.monthly ?? 0,
        })),
      lost: deals
        .filter((d) => d.stage === 'lost' && d.closedMonth === month)
        .map((d) => ({ name: d.customer.name, reason: d.lossReason ?? null })),
    },
    releases: (c.roadmap?.projects ?? [])
      .filter((p) => p.status === 'released' && p.releasedMonth === month)
      .map((p) => featureById(p.featureId)?.name ?? p.featureId),
    hires: c.staff
      .filter((s) => s.hiredMonth === month)
      .map((s) => ({ name: s.name, role: s.role })),
    departures,
    runwayBefore: runwayOf(before),
    runwayAfter: runwayOf(pnl),
    headline: story?.headline ?? null,
  };
}

// ---------------------------------------------------------------- people

function peopleMonth(world: World, me: Player, month: number, current: boolean): RecapPerson[] {
  const out: RecapPerson[] = [];
  const nameOf = (id: Id) => world.players[id]?.name ?? '';
  for (const c of me.contacts ?? [])
    if (c.month === month) out.push({ kind: 'contact', name: c.name, contact: c.kind });
  for (const v of Object.values(world.visits ?? {})) {
    if (v.status !== 'accepted' || v.month !== month) continue;
    if (v.hostId === me.id) out.push({ kind: 'visit', name: nameOf(v.guestId), host: true });
    else if (v.guestId === me.id) out.push({ kind: 'visit', name: nameOf(v.hostId), host: false });
  }
  for (const g of Object.values(world.hangouts ?? {})) {
    if (g.status !== 'open' || g.month !== month || !g.memberIds.includes(me.id)) continue;
    const names = g.memberIds
      .filter((id) => id !== me.id)
      .map(nameOf)
      .filter(Boolean);
    if (names.length) out.push({ kind: 'hangout', names });
  }
  // Dates carry a wall-clock time, not a month: only this month's are known.
  const since = getMarket(world, me.market).settledAt;
  if (current)
    for (const d of Object.values(world.dates ?? {})) {
      if (d.status === 'invited' || (since !== undefined && d.createdAt < since)) continue;
      const other = d.host === me.id ? d.guest : d.guest === me.id ? d.host : null;
      if (other) out.push({ kind: 'date', name: nameOf(other) });
    }
  return out.slice(0, RECAP_PEOPLE);
}

// ---------------------------------------------------------------- tomorrow

function companyBills(world: World, c: Company): RecapBill[] {
  const m = getMarket(world, c.market);
  const currency = m.data.currency;
  const contracts = Object.values(world.contracts ?? {})
    .filter((k) => k.buyerId === c.id && k.status === 'active')
    .reduce((a, k) => a + k.price, 0);
  const bills: RecapBill[] = [
    { kind: 'payroll', label: 'Payroll', amount: payrollThisMonth(c), currency },
    {
      kind: 'founderPay',
      label: 'Founder pay',
      amount: c.founderSalary * c.founderIds.length,
      currency,
    },
    { kind: 'rent', label: 'Office rent', amount: officeRent(m, c), currency },
    { kind: 'marketing', label: 'Marketing', amount: marketingSpend(c), currency },
    {
      kind: 'cloud',
      label: 'Cloud and processing',
      amount: cloudCost(m, c),
      currency,
      estimate: true,
    },
    { kind: 'loan', label: 'Loan repayments', amount: loanPaymentsDue(c), currency },
    { kind: 'suppliers', label: 'Supplier contracts', amount: contracts, currency },
  ];
  return bills.filter((b) => b.amount > 0);
}

function personalBills(world: World, me: Player): RecapBill[] {
  const m = getMarket(world, me.market);
  const currency = m.data.currency;
  const bills: RecapBill[] = [];
  for (const loan of me.loans) {
    const interest = Math.round((loan.outstanding * loan.rateBps) / 10_000 / 12);
    const due = Math.min(loan.monthlyPayment, loan.outstanding + interest);
    if (due > 0)
      bills.push({
        kind: 'loan',
        label: `Loan repayment (${loan.lender})`,
        who: loan.lender,
        amount: due,
        currency: getMarket(world, loan.market).data.currency,
      });
  }
  const cars = me.car ? (me.garage ?? [me.car]) : [];
  const car = cars.reduce(
    (n, x) => n + scale(col(m), carModel(m.id, x.modelId)?.runningCol ?? 0),
    0,
  );
  if (car > 0) bills.push({ kind: 'car', label: 'Car running costs', amount: car, currency });
  bills.push({ kind: 'living', label: 'Living costs', amount: lifestyleCost(world, me), currency });
  for (const p of Object.values(propertiesOf(world))) {
    if (p.ownerId !== me.id) continue;
    const pc = getMarket(world, p.market).data.currency;
    bills.push({
      kind: 'upkeep',
      label: `Running costs: ${p.street}`,
      who: p.street,
      amount: upkeepOf(world, p),
      currency: pc,
      estimate: true,
    });
    const mg = p.mortgage;
    if (mg && mg.outstanding > 0) {
      const interest = Math.round((mg.outstanding * mg.rateBps) / 10_000 / 12);
      bills.push({
        kind: 'mortgage',
        label: `Mortgage: ${p.street}`,
        who: p.street,
        amount: Math.min(mg.monthlyPayment, mg.outstanding + interest),
        currency: pc,
      });
    }
  }
  return bills.filter((b) => b.amount > 0);
}

// ---------------------------------------------------------------- the view

/**
 * The recap of one game month (the home city's month; default: the current
 * one, which the settlement just opened). Null for an unknown player.
 */
export function recapView(world: World, playerId: Id, month?: number): RecapView | null {
  const me = world.players[playerId];
  if (!me) return null;
  const home = getMarket(world, me.market);
  const current = home.month;
  const mo = month === undefined ? current : Math.max(0, Math.min(current, Math.floor(month)));
  const isCurrent = mo === current;
  const companies = me.companyIds
    .map((id) => world.companies[id])
    .filter((c): c is Company => !!c && (c.status === 'active' || c.closedMonth === mo));

  // --- Money, personal and business apart.
  const personal: RecapAccount[] = [];
  const local = accountMonth(world, me, me.accounts.local, mo, 'personal', 'local', null);
  if (local) personal.push(local);
  if (me.accounts.usd) {
    const usd = accountMonth(world, me, me.accounts.usd, mo, 'personal', 'usd', null);
    if (usd && usd.count > 0) personal.push(usd);
  }
  const business = companies
    .map((c) => accountMonth(world, me, c.account, mo, 'business', c.id, c.name))
    .filter((a): a is RecapAccount => !!a);

  // --- Journey.
  let journey: RecapView['journey'] = null;
  if (hasAnyJourney(world, me)) {
    const chapters = deriveChapters(world, me);
    const cur = chapters.find((c) => c.status === 'current');
    journey = {
      completed: chapters
        .filter((c) => c.doneMonth === mo)
        .map((c) => ({ n: c.n, title: c.title })),
      current: cur
        ? {
            n: cur.n,
            title: cur.title,
            done: cur.steps.filter((s) => !s.optional && s.done).length,
            need: cur.need,
          }
        : null,
    };
  }

  // --- Risks, from today's state.
  const risks: RecapRisk[] = [];
  const active = companies.filter((c) => c.status === 'active');
  for (const c of active) {
    const cash = world.accounts[c.account]?.balance ?? 0;
    const b = burn(c);
    const months = b > 0 ? cash / b : Infinity;
    if (c.finance.unpaidPayroll > 0)
      risks.push({
        kind: 'payroll',
        company: c.name,
        owed: c.finance.unpaidPayroll,
        currency: getMarket(world, c.market).data.currency,
      });
    if (c.distress) risks.push({ kind: 'distress', company: c.name, level: c.distress.level });
    else if (months < RECAP_RUNWAY_RISK)
      risks.push({ kind: 'runway', company: c.name, months: Math.round(months * 10) / 10 });
    const cm = getMarket(world, c.market).month;
    for (const d of c.deals ?? [])
      if (d.stage !== 'won' && d.stage !== 'lost' && d.deadline <= cm)
        risks.push({ kind: 'deal', company: c.name, name: d.customer.name, stage: d.stage });
    for (const k of c.hiring?.candidates ?? [])
      if (k.status === 'open' && k.deadline <= cm)
        risks.push({ kind: 'candidate', company: c.name, name: k.name, role: k.role });
  }
  for (const loan of me.loans)
    if (loan.missed > 0) risks.push({ kind: 'loan', lender: loan.lender, missed: loan.missed });

  // --- Tomorrow: the next settlement.
  const pBills = personalBills(world, me);
  const homeCurrency = home.data.currency;
  const dueHere = pBills
    .filter((b) => b.currency === homeCurrency)
    .reduce((a, b) => a + b.amount, 0);
  const cashHere = world.accounts[me.accounts.local]?.balance ?? 0;
  if (dueHere > cashHere)
    risks.push({ kind: 'bills', short: dueHere - cashHere, currency: homeCurrency });

  const dates: RecapDate[] = [];
  for (const c of active) {
    const cm = getMarket(world, c.market).month;
    for (const d of c.deals ?? [])
      if (d.stage !== 'won' && d.stage !== 'lost' && d.deadline === cm)
        dates.push({ kind: 'deal', company: c.name, name: d.customer.name });
    for (const k of c.hiring?.candidates ?? [])
      if (k.status === 'open' && k.deadline === cm)
        dates.push({ kind: 'candidate', company: c.name, name: k.name });
    const acc = c.accelerator;
    if (acc && !acc.demoDayDone && acc.demoDayMonth === getMarket(world, acc.market).month + 1)
      dates.push({ kind: 'demoDay', company: c.name, accelerator: acc.name });
  }
  for (const e of Object.values(world.events ?? {})) {
    if (e.status !== 'upcoming' || e.month !== getMarket(world, e.market).month) continue;
    if (e.hostId === me.id) dates.push({ kind: 'event', title: e.title, host: true });
    else if (e.attendees.includes(me.id))
      dates.push({ kind: 'event', title: e.title, host: false });
  }
  for (const k of Object.values(world.competitions ?? {})) {
    if (k.status !== 'open' || k.market !== me.market || k.month !== current) continue;
    dates.push({
      kind: 'competition',
      name: k.name,
      entered: k.entries.some((x) => x.founderId === me.id),
    });
  }
  for (const loan of me.loans)
    if (loan.monthsLeft === 1) dates.push({ kind: 'loanEnds', lender: loan.lender });

  // Months with a recap: those your statement still holds.
  const seen = new Set<number>();
  for (const r of world.accounts[me.accounts.local]?.recent ?? []) seen.add(r.month);
  seen.add(current);
  const months = [...seen].filter((x) => x <= current).sort((a, b) => b - a);

  return {
    month: mo,
    current,
    months,
    personal,
    business,
    companies: companies.map((c) => companyMonth(world, c, mo)),
    people: peopleMonth(world, me, mo, isCurrent),
    journey,
    risks,
    tomorrow: {
      month: current + 1,
      personal: pBills,
      business: active.map((c) => {
        const bills = companyBills(world, c);
        return {
          company: c.name,
          currency: getMarket(world, c.market).data.currency,
          bills,
          total: bills.reduce((a, b) => a + b.amount, 0),
        };
      }),
      dates,
    },
  };
}
