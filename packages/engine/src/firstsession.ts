/**
 * Founder Journey 6: the guided first session (blueprint §3, §3.1, FR-002,
 * FR-004). The tutorial itself is client-side; this is the engine half:
 *
 *   - the starting idea chosen at the café (stored on the company when it is
 *     founded with `ideaId`, see world.ts createCompany) and its sales edge;
 *   - the first pipeline customer pays its first month up front, so the
 *     founder sees a payment land in the business account the same day;
 *   - `company.expense`: a small one-off business cost, paid from the
 *     company account (business and personal money are separate).
 *
 * Replay safety: everything here only happens for companies founded with an
 * idea (a new optional field) or through the new `company.expense` command,
 * so replaying an old command log reaches the same world.
 */
import { ideaById, ideaEdge, STARTER_EXPENSES, type StarterExpense } from './data/ideas.js';
import { ensure } from './errors.js';
import { col, getMarket, notify, ownCompany } from './helpers.js';
import { account, transfer } from './ledger.js';
import { formatMoney, scale } from './money.js';
import type { Company, Id, Player, World } from './types.js';

/** Expenses kept on the company (the latest few). */
const KEEP_EXPENSES = 10;

/** The sales win-chance shift from the company's starting idea (0 without one). */
export function starterIdeaEdge(c: Company): number {
  if (!c.starterIdea) return 0;
  const idea = ideaById(c.starterIdea.id);
  return idea ? ideaEdge(idea, c.starterIdea.fit) : 0;
}

/**
 * The first customer won through the pipeline pays its first month up front
 * (companies founded with an idea only). Returns the amount paid, or 0.
 */
export function firstPayment(world: World, c: Company, name: string, monthly: number): number {
  if (!c.starterIdea || c.starterIdea.paid || monthly <= 0) return 0;
  const m = getMarket(world, c.market);
  const month = m.month;
  transfer(world, m.ext.customers, c.account, monthly, `First payment: ${name}`, month);
  c.ledgerThisMonth.upfrontRevenue = (c.ledgerThisMonth.upfrontRevenue ?? 0) + monthly;
  c.starterIdea.paid = { month, amount: monthly };
  for (const fid of c.founderIds)
    notify(world, fid, {
      month,
      kind: 'lead',
      text: `${name} paid their first month up front: ${formatMoney(monthly, m.data.currency)} is in ${c.name}’s business account.`,
    });
  return monthly;
}

export const expenseCost = (world: World, c: Company, item: StarterExpense): number =>
  Math.max(1, scale(col(getMarket(world, c.market)), STARTER_EXPENSES[item].costCol));

/** Pay a small business expense from the company account. */
export function payExpense(world: World, me: Player, companyId: Id, item: StarterExpense) {
  const c = ownCompany(world, me.id, companyId);
  ensure(c.status === 'active', 'company.inactive', 'This company is closed.');
  const m = getMarket(world, c.market);
  const amount = expenseCost(world, c, item);
  ensure(
    account(world, c.account).balance >= amount,
    'company.cash',
    'Your company doesn’t have the cash for this right now.',
  );
  const label = STARTER_EXPENSES[item].label;
  transfer(world, c.account, m.ext.suppliers, amount, label, m.month);
  const list = (c.expenses ??= []);
  list.push({ item, month: m.month, amount });
  if (list.length > KEEP_EXPENSES) list.splice(0, list.length - KEEP_EXPENSES);
  return {
    item,
    amount,
    balance: account(world, c.account).balance,
    message: `${label}: ${formatMoney(amount, m.data.currency)} paid from ${c.name}’s account.`,
  };
}

/** What the first-session screens need to know about a company. */
export function firstSessionView(world: World, c: Company) {
  const idea = c.starterIdea ? ideaById(c.starterIdea.id) : undefined;
  return {
    starterIdea: c.starterIdea
      ? {
          id: c.starterIdea.id,
          title: idea?.title ?? c.starterIdea.id,
          fit: c.starterIdea.fit,
          edge: Math.round(starterIdeaEdge(c) * 1000) / 1000,
          paid: c.starterIdea.paid ?? null,
        }
      : null,
    expenses: (c.expenses ?? []).map((e) => ({ ...e })),
    expenseCosts: Object.fromEntries(
      (Object.keys(STARTER_EXPENSES) as StarterExpense[]).map((k) => [k, expenseCost(world, c, k)]),
    ) as Record<StarterExpense, number>,
  };
}
