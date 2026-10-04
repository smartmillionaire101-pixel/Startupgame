/**
 * Distress and the rescue plan (Wave 1, "Decisions that visibly matter").
 *
 * A struggling company gets a warning ladder (watch → danger → critical) and
 * real moves: cut costs, hibernate, ask existing investors for a bridge, ask
 * buyers for a quick offer, borrow, put in savings, or wind down properly.
 * Shutdown rules are unchanged: the second unpaid payroll still ends it.
 */
import type { Command } from './commands.js';
import {
  marketingSpend,
  monthlyCosts,
  officeRent,
  payrollThisMonth,
  projectedBurn,
  DOWNSIZED_OFFICE,
  FURLOUGH_PAY,
} from './company.js';
import { aiRespond, humanFor, openDeal, partyAccount, executeDeal } from './deals.js';
import { ensure, fail } from './errors.js';
import {
  col,
  getMarket,
  hoursLeft,
  lastPnl,
  nextStage,
  notify,
  totalCustomers,
} from './helpers.js';
import { account, costIn } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney } from './money.js';
import { deriveRng } from './rng.js';
import { monthlyGrowth, valueCompany } from './valuation.js';
import type {
  Company,
  DealCard,
  DistressLevel,
  Id,
  InvestmentTerms,
  PartyRef,
  StoryPlace,
  World,
} from './types.js';

/** Bridge SAFEs are capped this far below the last round's post-money. */
export const BRIDGE_DISCOUNT = 0.2;
/** A distressed buyer pays this share of the model valuation. */
export const FIRE_SALE_RANGE: [number, number] = [0.25, 0.45];
export const HIBERNATE_HOURS = 2;
export const BRIDGE_HOURS = 3;
export const FIRE_SALE_HOURS = 2;
/** Morale hits. */
export const DOWNSIZE_MORALE = 8;
export const HIBERNATE_MORALE = 10;

const RANK: Record<DistressLevel, number> = { watch: 1, danger: 2, critical: 3 };
const rank = (l: DistressLevel | null | undefined) => (l ? RANK[l] : 0);

/** Founder pay on a survival budget: half the local cost of living. */
export const survivalSalary = (world: World, c: Company) =>
  Math.round(col(getMarket(world, c.market)) * 0.5);

export interface DistressAssessment {
  level: DistressLevel;
  monthsLeft: number;
}

/**
 * watch: runway under 6 months; danger: under 3, or a payroll was missed;
 * critical: a payroll was missed and cash won't cover the next one, so one
 * more missed payroll ends the company.
 */
export function assessDistress(world: World, c: Company): DistressAssessment | null {
  if (c.status !== 'active') return null;
  const cash = account(world, c.account).balance;
  const burn = projectedBurn(world, c);
  const months = burn > 0 ? cash / burn : Infinity;
  const monthsLeft = Math.max(0, Math.min(99, Math.floor(months)));
  const unpaid = c.finance.unpaidPayroll;
  const revenue = lastPnl(c)?.revenue ?? 0;
  if (unpaid > 0 && cash + revenue < payrollThisMonth(c) + unpaid)
    return { level: 'critical', monthsLeft: 0 };
  if (unpaid > 0 || months < 3) return { level: 'danger', monthsLeft };
  if (months < 6) return { level: 'watch', monthsLeft };
  return null;
}

/** Plain-language deadline for the rescue plan. Critical always says what ends the company. */
export function distressDeadline(c: Company, level: DistressLevel, monthsLeft: number): string {
  if (level === 'critical')
    return `Payroll is due at month end and the cash won’t cover it. One more missed payroll ends ${c.name}.`;
  if (level === 'danger' && c.finance.unpaidPayroll > 0)
    return `Staff weren’t paid in full. If next month’s payroll is missed too, ${c.name} shuts down.`;
  if (level === 'danger')
    return monthsLeft < 1
      ? 'Cash runs out this month.'
      : `Cash runs out in about ${monthsLeft} month${monthsLeft === 1 ? '' : 's'}.`;
  return `About ${monthsLeft} months of cash left at today’s spending.`;
}

function distressNotice(c: Company, level: DistressLevel, monthsLeft: number): string {
  if (level === 'critical')
    return `${c.name} is critical: one more missed payroll ends the company. Open the rescue plan now.`;
  if (level === 'danger')
    return c.finance.unpaidPayroll > 0
      ? `${c.name} couldn’t pay staff in full. If it happens again, the company shuts down.`
      : `${c.name} is in danger: about ${monthsLeft} months of cash left. Open the rescue plan.`;
  return `${c.name}: about ${monthsLeft} months of cash left. Plan a raise or cut costs.`;
}

/** Refresh `c.distress`; tell the founders when it gets worse. */
export function updateDistress(world: World, c: Company, month: number, tell: boolean) {
  const a = assessDistress(world, c);
  const prev = c.distress ?? null;
  if (!a) {
    if (prev && tell)
      for (const fid of c.founderIds)
        notify(world, fid, {
          month,
          kind: 'system',
          text: `${c.name} is out of distress. Keep an eye on the burn.`,
          ref: { kind: 'company', id: c.id },
        });
    c.distress = null;
    return;
  }
  c.distress = { level: a.level, monthsLeft: a.monthsLeft, since: prev?.since ?? month };
  if (tell && rank(a.level) > rank(prev?.level))
    for (const fid of c.founderIds)
      notify(world, fid, {
        month,
        kind: 'warning',
        text: distressNotice(c, a.level, a.monthsLeft),
        ref: { kind: 'company', id: c.id },
      });
}

// ---------------------------------------------------------------- moves

export function cutCosts(
  world: World,
  c: Company,
  args: { marketing?: number; founderSalary?: number; office?: 'downsize' },
  month: number,
) {
  const before = monthlyCosts(world, c);
  const survival =
    args.marketing === undefined && args.founderSalary === undefined && args.office === undefined;
  let marketing = args.marketing;
  let founderSalary = args.founderSalary;
  let office = args.office === 'downsize';
  if (survival) {
    marketing = 0;
    founderSalary = Math.min(c.founderSalary, survivalSalary(world, c));
    office = !c.officeDownsized;
  }
  if (marketing !== undefined) {
    ensure(
      marketing <= c.marketingBudget,
      'cut.marketing',
      'That isn’t a cut. Change strategy to spend more.',
    );
    c.marketingBudget = marketing;
  }
  if (founderSalary !== undefined) {
    ensure(
      founderSalary <= c.founderSalary,
      'cut.salary',
      'That isn’t a cut. Change strategy to pay yourself more.',
    );
    c.founderSalary = founderSalary;
  }
  if (office) {
    ensure(!c.officeDownsized, 'cut.office', 'The office is already downsized.');
    c.officeDownsized = true;
    for (const s of c.staff) s.morale = clamp(s.morale - DOWNSIZE_MORALE, 0, 100);
  }
  const saved = before - monthlyCosts(world, c);
  if (survival) ensure(saved > 0, 'cut.none', 'Costs are already at a survival budget.');
  updateDistress(world, c, month, false);
  const cur = getMarket(world, c.market).data.currency;
  return {
    message:
      saved > 0
        ? `Costs cut. That saves about ${formatMoney(saved, cur)} a month.`
        : 'Nothing to cut there.',
    savedPerMonth: saved,
  };
}

export function setHibernation(world: World, c: Company, on: boolean, month: number) {
  if (on) {
    ensure(!c.hibernation, 'hibernate.on', `${c.name} is already hibernating.`);
    const before = monthlyCosts(world, c);
    c.hibernation = { since: month };
    for (const s of c.staff) s.morale = clamp(s.morale - HIBERNATE_MORALE, 0, 100);
    // Open hiring conversations stop; the pipeline waits.
    updateDistress(world, c, month, false);
    const saved = before - monthlyCosts(world, c);
    const cur = getMarket(world, c.market).data.currency;
    return {
      message: `Staff furloughed on ${Math.round(FURLOUGH_PAY * 100)}% pay. Product work stops and customers will drift away slowly. Saves about ${formatMoney(saved, cur)} a month.`,
      savedPerMonth: saved,
    };
  }
  ensure(c.hibernation, 'hibernate.off', `${c.name} isn’t hibernating.`);
  c.hibernation = null;
  for (const s of c.staff) s.morale = clamp(s.morale + 5, 0, 100);
  updateDistress(world, c, month, false);
  return { message: `${c.name} is back to work. Full pay and growth restart.` };
}

/** Existing outside investors who can be asked for a bridge, weighted by what they put in. */
export function bridgeInvestors(world: World, c: Company): { party: PartyRef; weight: number }[] {
  const ids = new Set<string>();
  for (const [h, holding] of Object.entries(c.capTable.holdings))
    if (holding.kind === 'investor' || holding.kind === 'safe-converted') ids.add(h);
  for (const s of c.capTable.safes) ids.add(s.holderId);
  const out: { party: PartyRef; weight: number }[] = [];
  for (const h of [...ids].sort()) {
    if (c.founderIds.includes(h)) continue;
    const weight = Math.max(1, world.positions[`${h}:${c.id}`]?.invested ?? 0);
    if (world.funds[h]) out.push({ party: { kind: 'fund', id: h }, weight });
    else if (world.players[h]) out.push({ party: { kind: 'player', id: h }, weight });
  }
  return out;
}

const openBridge = (world: World, c: Company) =>
  Object.values(world.deals).some(
    (d) =>
      d.companyId === c.id &&
      d.status === 'open' &&
      d.terms.kind === 'investment' &&
      d.terms.bridge === true,
  );

const openAcquisition = (world: World, c: Company) =>
  Object.values(world.deals).some(
    (d) => d.companyId === c.id && d.status === 'open' && d.terms.kind === 'acquisition',
  );

/** Bridge cap: the last post-money (or the model value) less the discount. */
export function bridgeCap(world: World, c: Company): number {
  const base =
    c.capTable.lastPostMoney > 0
      ? c.capTable.lastPostMoney
      : valueCompany(world, c, nextStage(c.lastRound)).value;
  return Math.round(base * (1 - BRIDGE_DISCOUNT));
}

/**
 * Ask existing investors for a bridge SAFE at a discount. Each investor gets a
 * deal card for their pro-rata share; AI holders answer at once from their
 * position and the company's trajectory, humans get the card in their inbox.
 */
export function requestBridge(world: World, c: Company, amount: number, by: Id) {
  ensure(amount > 0, 'bridge.amount', 'Ask for an amount.');
  ensure(
    !c.bannedFromRaising,
    'bridge.banned',
    'Investors won’t fund a company under a fraud ban.',
  );
  ensure(!openBridge(world, c), 'bridge.open', 'Your investors are already looking at a bridge.');
  const investors = bridgeInvestors(world, c);
  ensure(
    investors.length > 0,
    'bridge.none',
    'You have no outside investors to ask. Pitch new ones instead.',
  );
  const cap = bridgeCap(world, c);
  ensure(
    cap > amount * 1.5,
    'bridge.size',
    'That bridge is too big for what the company is worth. Ask for less.',
  );
  const total = investors.reduce((a, x) => a + x.weight, 0);
  let left = amount;
  const deals: DealCard[] = [];
  investors.forEach((inv, i) => {
    const share = i === investors.length - 1 ? left : Math.round((amount * inv.weight) / total);
    left -= share;
    if (share <= 0) return;
    const terms: InvestmentTerms = {
      kind: 'investment',
      instrument: 'safe',
      stage: c.lastRound ?? 'pre-seed',
      amount: share,
      valuation: cap,
      liquidationMultiple: 1,
      participating: false,
      proRata: false,
      boardSeat: false,
      vetoOnSale: false,
      poolTopUpBps: 0,
      bridge: true,
    };
    const d = openDeal(world, {
      companyId: c.id,
      proposer: { kind: 'company', id: c.id },
      counterparty: inv.party,
      terms,
      by,
      aiLimit: { maxValuation: cap, maxAmount: aiBridgeLimit(world, c, inv.party, share) },
    });
    if (!humanFor(world, inv.party)) aiBridgeRespond(world, d, c);
    deals.push(d);
  });
  return deals;
}

/** How far an AI holder's trajectory read goes: -3 (walk) … +4 (back it fully). */
function trajectoryScore(c: Company): number {
  const growth = monthlyGrowth(c);
  const revenue = lastPnl(c)?.revenue ?? 0;
  return (
    (growth > 0.03 ? 2 : growth > 0 ? 1 : growth > -0.03 ? 0 : -1) +
    (revenue > 0 ? 1 : 0) +
    (c.stars.value >= 2.5 ? 1 : c.stars.value < 1.5 ? -1 : 0) +
    (c.finance.unpaidPayroll > 0 ? -2 : 0) +
    (c.hibernation ? -1 : 0)
  );
}

/** The most an AI holder will put in: up to its position, less for a weaker trajectory. */
function aiBridgeLimit(world: World, c: Company, party: PartyRef, ask: number): number {
  const invested = world.positions[`${party.id}:${c.id}`]?.invested ?? ask;
  const score = trajectoryScore(c);
  return Math.round(invested * (score >= 3 ? 1 : score >= 1 ? 0.5 : 0));
}

function aiBridgeRespond(world: World, d: DealCard, c: Company) {
  const m = getMarket(world, d.market);
  const t = d.terms as InvestmentTerms;
  const investor = d.counterparty;
  const say = (action: 'accept' | 'decline' | 'counter', summary: string) =>
    d.history.push({ month: m.month, by: investor.id, action, summary });
  const from = account(world, partyAccount(world, investor));
  const cash = from.balance;
  const score = trajectoryScore(c);
  const limit = d.aiLimit?.maxAmount ?? 0;
  const decline = (reason: string) => {
    d.status = 'declined';
    say('decline', reason);
    for (const fid of c.founderIds)
      notify(world, fid, {
        month: m.month,
        kind: 'deal',
        text: `${world.funds[investor.id]?.name ?? world.players[investor.id]?.name ?? 'An investor'} passed on the bridge: “${reason}”`,
        ref: { kind: 'deal', id: d.id },
      });
  };
  if (cash < costIn(world, Math.min(t.amount, Math.max(limit, 1)), m.data.currency, from.currency))
    return decline('We have no money left for follow-ons.');
  if (score < 1 || limit <= 0)
    return decline(
      c.finance.unpaidPayroll > 0
        ? 'Not while staff are unpaid.'
        : monthlyGrowth(c) < 0
          ? 'Revenue is shrinking. We won’t put more in.'
          : 'We don’t see a path to the next round yet.',
    );
  if (t.amount <= limit && score >= 2) {
    say('accept', 'Accepted. We back you.');
    executeDeal(world, d, investor.id);
    return;
  }
  // Meet partway: the AI's own limit, routed through the normal counter logic.
  aiRespond(world, d);
}

/** Ask AI corporate buyers for a quick offer at a distressed price (deal card). */
export function fireSale(world: World, c: Company, month: number) {
  ensure(!openAcquisition(world, c), 'acquire.open', 'There is already an offer on the table.');
  ensure(
    totalCustomers(c) > 0 || c.staff.length > 0,
    'firesale.empty',
    'Buyers want customers or a team. You have neither yet.',
  );
  const m = getMarket(world, c.market);
  const rng = deriveRng(world.seed, 'firesale', c.id, month);
  const value = valueCompany(world, c, nextStage(c.lastRound)).value;
  const price = Math.round(value * rng.range(FIRE_SALE_RANGE[0], FIRE_SALE_RANGE[1]));
  if (price <= 0) fail('firesale.none', 'No buyer will pay for the company yet.');
  const buyer =
    c.targetSegments.map((k) => m.segments[k]?.incumbentName).find(Boolean) ?? 'An AI corporate';
  const d = openDeal(world, {
    companyId: c.id,
    proposer: { kind: 'corporate', id: buyer },
    counterparty: { kind: 'company', id: c.id },
    terms: { kind: 'acquisition', price, buyer },
    by: buyer,
    aiLimit: { maxValuation: Math.round(price * 1.1) },
  });
  // A quick offer: it lapses at the next month end.
  d.expiresMonth = month + 1;
  return d;
}

// ---------------------------------------------------------------- the plan

export interface RescueOption {
  id: string;
  label: string;
  effect: string;
  cost: string;
  place: StoryPlace;
  command?: Command;
}

export interface RescuePlan {
  level: DistressLevel | null;
  monthsLeft: number;
  deadline: string;
  options: RescueOption[];
}

/** The rescue plan for one company as one viewer sees it (pure). Options are only moves possible now. */
export function rescuePlan(world: World, c: Company, viewerId: Id): RescuePlan {
  const a = assessDistress(world, c);
  const level = a?.level ?? null;
  const monthsLeft = a?.monthsLeft ?? Math.max(0, Math.min(99, monthsAtBurn(world, c)));
  const deadline = level
    ? distressDeadline(c, level, monthsLeft)
    : 'No rescue needed. Cash covers more than six months.';
  const me = world.players[viewerId];
  if (!me || !c.founderIds.includes(viewerId) || c.status !== 'active')
    return { level, monthsLeft, deadline, options: [] };

  const m = getMarket(world, c.market);
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  const hours = hoursLeft(me);
  const companyId = c.id;
  const options: RescueOption[] = [];

  const mkt = marketingSpend(c);
  const salaryTarget = Math.min(c.founderSalary, survivalSalary(world, c));
  const salarySaving = (c.founderSalary - salaryTarget) * c.founderIds.length;
  const rent = officeRent(m, c);
  const rentSaving = c.officeDownsized ? 0 : rent - Math.round(rent * DOWNSIZED_OFFICE);
  const cuts = [mkt > 0, salarySaving > 0, rentSaving > 0].filter(Boolean).length;

  if (cuts >= 2)
    options.push({
      id: 'survival-budget',
      label: 'Switch to a survival budget',
      effect: `Saves about ${fmt(mkt + salarySaving + rentSaving)} a month.`,
      cost: 'Slower growth, a pay cut for you and lower team morale.',
      place: 'office',
      command: { type: 'company.cutCosts', companyId },
    });
  if (mkt > 0)
    options.push({
      id: 'cut-marketing',
      label: 'Pause marketing',
      effect: `Saves ${fmt(mkt)} a month.`,
      cost: 'Fewer new customers.',
      place: 'office',
      command: { type: 'company.cutCosts', companyId, marketing: 0 },
    });
  if (salarySaving > 0)
    options.push({
      id: 'cut-salary',
      label: `Cut your salary to ${fmt(salaryTarget)}`,
      effect: `Saves ${fmt(salarySaving)} a month.`,
      cost: 'Less money for you to live on.',
      place: 'office',
      command: { type: 'company.cutCosts', companyId, founderSalary: salaryTarget },
    });
  if (rentSaving > 0)
    options.push({
      id: 'downsize-office',
      label: 'Move to a smaller office',
      effect: `Saves ${fmt(rentSaving)} a month in rent.`,
      cost: 'Team morale drops.',
      place: 'office',
      command: { type: 'company.cutCosts', companyId, office: 'downsize' },
    });
  if (!c.hibernation && c.staff.length > 0 && hours >= HIBERNATE_HOURS) {
    const full = c.staff.reduce((s, x) => s + x.salary, 0);
    const saving = full - Math.round(full * FURLOUGH_PAY) + mkt;
    options.push({
      id: 'hibernate',
      label: 'Hibernate the company',
      effect: `Burn drops by about ${fmt(saving)} a month.`,
      cost: 'Product frozen, customers drift away slowly, morale falls and you can’t hire.',
      place: 'office',
      command: { type: 'company.hibernate', companyId, on: true },
    });
  }
  if (c.hibernation)
    options.push({
      id: 'wake',
      label: 'End hibernation',
      effect: 'Product work, selling and full pay restart.',
      cost: 'Burn goes back up.',
      place: 'office',
      command: { type: 'company.hibernate', companyId, on: false },
    });
  const top = [...c.staff].sort((x, y) => y.salary - x.salary || x.id.localeCompare(y.id))[0];
  if (top) {
    const generous = account(world, c.account).balance >= top.salary * 2;
    options.push({
      id: 'layoff',
      label: `Let ${top.name} go (${top.role})`,
      effect: `Saves ${fmt(top.salary)} a month.`,
      cost: generous
        ? 'Two months’ pay as severance; the team’s morale drops.'
        : 'No severance: morale and your reputation take a hit.',
      place: 'office',
      command: { type: 'company.layoff', companyId, staffId: top.id, generous },
    });
  }
  if (
    !c.bannedFromRaising &&
    !openBridge(world, c) &&
    bridgeInvestors(world, c).length > 0 &&
    hours >= BRIDGE_HOURS
  ) {
    const burnNow = Math.max(projectedBurn(world, c), payrollThisMonth(c));
    const cap = bridgeCap(world, c);
    const amount = Math.min(Math.max(1, burnNow * 3), Math.floor(cap / 1.5) - 1);
    if (amount > 0)
      options.push({
        id: 'bridge',
        label: 'Ask your investors for a bridge',
        effect: `Up to ${fmt(amount)} on a SAFE at a ${BRIDGE_DISCOUNT * 100}% discount.`,
        cost: 'More dilution. Investors judge your trajectory first.',
        place: 'investors',
        command: { type: 'company.bridge', companyId, amount },
      });
  }
  const savings = me.accounts.local ? (world.accounts[me.accounts.local]?.balance ?? 0) : 0;
  if (savings > 0 && me.market === c.market) {
    const need = Math.max(
      projectedBurn(world, c) * 3,
      payrollThisMonth(c) + c.finance.unpaidPayroll,
    );
    const amount = Math.min(savings, Math.max(1, need));
    options.push({
      id: 'inject',
      label: 'Put in your own savings',
      effect: `Adds ${fmt(amount)} to the company.`,
      cost: 'Your personal savings are at risk.',
      place: 'home',
      command: { type: 'company.inject', companyId, amount },
    });
  }
  options.push({
    id: 'bank',
    label: 'Ask a lender for working capital',
    effect: 'A loan buys time if you qualify.',
    cost: 'Interest. Lenders look at revenue and may want a guarantee.',
    place: 'bank',
  });
  if (
    !openAcquisition(world, c) &&
    (totalCustomers(c) > 0 || c.staff.length > 0) &&
    hours >= FIRE_SALE_HOURS
  )
    options.push({
      id: 'fire-sale',
      label: 'Ask buyers for a quick offer',
      effect: 'A corporate buyer may take the company at a distressed price.',
      cost: 'Investors with preferences are paid first; you may get little.',
      place: 'office',
      command: { type: 'company.fireSale', companyId },
    });
  if (level === 'danger' || level === 'critical')
    options.push({
      id: 'wind-down',
      label: 'Wind down properly',
      effect: 'Staff are paid first and your reputation holds.',
      cost: `${c.name} closes.`,
      place: 'office',
      command: { type: 'company.shutdown', companyId },
    });
  return { level, monthsLeft, deadline, options };
}

function monthsAtBurn(world: World, c: Company): number {
  const b = projectedBurn(world, c);
  return b > 0 ? Math.floor(account(world, c.account).balance / b) : 99;
}
