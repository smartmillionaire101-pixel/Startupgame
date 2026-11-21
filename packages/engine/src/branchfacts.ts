/**
 * Branches note: counts read from a company's branches, for the customer
 * total (traction.ts), the Customers view and the "Sell in a second city"
 * step. A leaf module (types and release notes only) so those can read it
 * without importing the branch rules and everything they import.
 */
import { branchesOn } from './releases.js';
import type { Branch, Company, World } from './types.js';

/** A company's open branches. */
export const openBranchesOf = (world: World, companyId: string): Branch[] =>
  Object.values(world.branches ?? {}).filter(
    (b) => b.companyId === companyId && b.status === 'open',
  );

/** Customers a company has at its open branches (branches note; 0 before it). */
export function branchCustomerCount(world: World, c: Company): number {
  if (!branchesOn(world)) return 0;
  return openBranchesOf(world, c.id).reduce((a, b) => a + (b.customers ?? 0), 0);
}

/**
 * Selling in another city (the "Sell in a second city" step): open branches
 * there, and customers there (the branches' own, and signed customers from
 * those cities).
 */
export function secondCityProgress(world: World, c: Company) {
  const open = openBranchesOf(world, c.id);
  const away = open.filter((b) => b.market !== c.market);
  const branchCustomers = away.reduce((a, b) => a + (b.customers ?? 0), 0);
  const signed = (c.salesAccounts ?? []).filter((a) => a.market && a.market !== c.market).length;
  return {
    branches: away.length,
    sameCity: open.length - away.length,
    customers: branchCustomers + signed,
    /** The first open branch in another city, to point at. */
    branchId: away[0]?.id ?? open[0]?.id ?? null,
  };
}
