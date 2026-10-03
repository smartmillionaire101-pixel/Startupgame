/**
 * Cap table maths (§5, §9, §12): founders' shares, option pool, post-money
 * SAFEs, priced rounds with the "option pool shuffle", and the liquidation
 * waterfall with non-participating / participating preferences.
 *
 * All functions mutate the CapTable passed in (call them on an Immer draft)
 * and return what changed, so callers can move money and log it.
 */
import { ensure } from './errors.js';
import type { CapTable, Id, Preference, Safe } from './types.js';

export const POOL_ID = 'pool';
export const FOUNDER_SHARES = 10_000_000;

export function newCapTable(founders: { id: Id; bps: number }[]): CapTable {
  const total = founders.reduce((a, f) => a + f.bps, 0);
  ensure(total === 10_000, 'captable.split', 'Founder split must add up to 100%.');
  const holdings: CapTable['holdings'] = {};
  for (const f of founders) {
    holdings[f.id] = { shares: Math.round((FOUNDER_SHARES * f.bps) / 10_000), kind: 'founder' };
  }
  return { holdings, safes: [], preferences: [], lastPrice: 0, lastPostMoney: 0, roundsRaised: 0 };
}

export const fullyDiluted = (ct: CapTable): number =>
  Object.values(ct.holdings).reduce((a, h) => a + h.shares, 0);

export const sharesOf = (ct: CapTable, holderId: Id): number => ct.holdings[holderId]?.shares ?? 0;

export function ownership(ct: CapTable, holderId: Id): number {
  const fd = fullyDiluted(ct);
  return fd === 0 ? 0 : sharesOf(ct, holderId) / fd;
}

function addShares(
  ct: CapTable,
  holderId: Id,
  shares: number,
  kind: CapTable['holdings'][string]['kind'],
) {
  if (shares <= 0) return;
  const h = ct.holdings[holderId];
  if (h) h.shares += shares;
  else ct.holdings[holderId] = { shares, kind };
}

/** Grant equity to staff out of the pool (or by new issue if the pool is empty). */
export function grantOptions(ct: CapTable, staffId: Id, bps: number): number {
  if (bps <= 0) return 0;
  const shares = Math.round((fullyDiluted(ct) * bps) / 10_000);
  const pool = ct.holdings[POOL_ID];
  const fromPool = Math.min(pool?.shares ?? 0, shares);
  if (pool) pool.shares -= fromPool;
  addShares(ct, staffId, shares, 'staff');
  // Any shortfall is a fresh issue; the staff member was already credited above,
  // so total shares rise only by (shares - fromPool).
  return shares;
}

/** Return a departing staff member's unvested equity to the pool (simplified: all of it). */
export function returnOptions(ct: CapTable, staffId: Id) {
  const h = ct.holdings[staffId];
  if (!h) return;
  addShares(ct, POOL_ID, h.shares, 'pool');
  delete ct.holdings[staffId];
}

export function addSafe(ct: CapTable, safe: Safe) {
  ensure(
    safe.amount > 0 && safe.cap > safe.amount,
    'safe.terms',
    'SAFE cap must exceed the amount.',
  );
  ct.safes.push(safe);
}

/** Combined post-money ownership promised to all outstanding SAFEs. */
export const safeOwnership = (ct: CapTable): number =>
  ct.safes.reduce((a, s) => a + s.amount / s.cap, 0);

export interface PricedRound {
  investorId: Id;
  amount: number;
  preMoney: number;
  /** Target unallocated pool as bps of post-money; 0 to skip. */
  poolTopUpBps: number;
  multiple: number;
  participating: boolean;
}

export interface PricedRoundResult {
  pricePerShare: number;
  newShares: number;
  poolShares: number;
  safeShares: Record<Id, number>;
  postMoney: number;
}

/**
 * Close a priced round. Order (standard post-money SAFE mechanics):
 *  1. Pool top-up happens in the pre-money (dilutes existing holders, not the new investor).
 *  2. Outstanding SAFEs convert in the pre-money at their caps.
 *  3. New money buys shares at preMoney / (pre-round fully diluted).
 * Pool and SAFE amounts depend on each other, so we solve by fixed-point iteration.
 */
export function closePricedRound(ct: CapTable, round: PricedRound): PricedRoundResult {
  ensure(
    round.amount > 0 && round.preMoney > 0,
    'round.terms',
    'Amount and valuation must be positive.',
  );
  const S = fullyDiluted(ct);
  const P0 = ct.holdings[POOL_ID]?.shares ?? 0;
  const P = safeOwnership(ct);
  ensure(P < 0.9, 'round.safes', 'SAFEs would own almost everything; round cannot close.');
  const a = round.amount / round.preMoney;
  const t = round.poolTopUpBps / 10_000;

  let x = 0; // new pool shares
  let Z = 0; // SAFE conversion shares
  for (let i = 0; i < 50; i++) {
    // SAFEs own P of the pre-money capitalisation (S + x + Z).
    const zNext = ((S + x) * P) / (1 - P);
    // Pool target: (P0 + x) = t × post, post = (S + x + Z)(1 + a).
    const xNext = Math.max(0, t * (S + x + zNext) * (1 + a) - P0);
    if (Math.abs(xNext - x) < 0.5 && Math.abs(zNext - Z) < 0.5) {
      x = xNext;
      Z = zNext;
      break;
    }
    x = xNext;
    Z = zNext;
  }
  x = Math.round(x);
  const preShares = S + x + Math.round(Z);
  const pricePerShare = round.preMoney / preShares;

  addShares(ct, POOL_ID, x, 'pool');
  const safeShares: Record<Id, number> = {};
  const capitalisation = S + x + Z;
  for (const s of ct.safes) {
    const shares = Math.round((capitalisation * s.amount) / s.cap);
    safeShares[s.holderId] = (safeShares[s.holderId] ?? 0) + shares;
    addShares(ct, s.holderId, shares, 'safe-converted');
    // Converted SAFEs become standard 1x non-participating preferred.
    ct.preferences.push({
      holderId: s.holderId,
      invested: s.amount,
      multiple: 1,
      participating: false,
      shares,
      seniority: ct.roundsRaised + 1,
    });
  }
  ct.safes = [];

  const newShares = Math.round(round.amount / pricePerShare);
  addShares(ct, round.investorId, newShares, 'investor');
  ct.roundsRaised += 1;
  ct.preferences.push({
    holderId: round.investorId,
    invested: round.amount,
    multiple: round.multiple,
    participating: round.participating,
    shares: newShares,
    seniority: ct.roundsRaised,
  });
  ct.lastPrice = pricePerShare;
  ct.lastPostMoney = round.preMoney + round.amount;
  return { pricePerShare, newShares, poolShares: x, safeShares, postMoney: ct.lastPostMoney };
}

/** Paper value of a holder's stake at the last round price (SAFEs at cost). */
export function markValue(ct: CapTable, holderId: Id): number {
  const safes = ct.safes.filter((s) => s.holderId === holderId).reduce((a, s) => a + s.amount, 0);
  return Math.round(sharesOf(ct, holderId) * ct.lastPrice) + safes;
}

export interface WaterfallLine {
  holderId: Id;
  preference: number;
  common: number;
  total: number;
  converted: boolean;
}

/**
 * Who gets paid, in what order, and how much (§12 "The liquidation waterfall").
 * Unallocated pool shares receive nothing. Unconverted SAFEs get the greater of
 * their money back or their as-converted share, like 1x non-participating preferred.
 */
export function waterfall(ct: CapTable, proceeds: number): WaterfallLine[] {
  const holdings = {
    ...Object.fromEntries(Object.entries(ct.holdings).map(([k, v]) => [k, v.shares])),
  };
  delete holdings[POOL_ID];
  const prefs: Preference[] = ct.preferences.map((p) => ({ ...p }));

  // Materialise SAFEs as virtual preferred at their cap.
  if (ct.safes.length) {
    const base = Object.values(holdings).reduce((a, b) => a + b, 0);
    const P = safeOwnership(ct);
    for (const s of ct.safes) {
      const shares = Math.round((base / (1 - P)) * (s.amount / s.cap));
      holdings[s.holderId] = (holdings[s.holderId] ?? 0) + shares;
      prefs.push({
        holderId: s.holderId,
        invested: s.amount,
        multiple: 1,
        participating: false,
        shares,
        seniority: ct.roundsRaised + 1,
      });
    }
  }

  const totalShares = Object.values(holdings).reduce((a, b) => a + b, 0);
  const converted = new Set<number>();

  const compute = () => {
    let remaining = proceeds;
    const prefPaid = new Map<number, number>();
    const tiers = [...new Set(prefs.map((p) => p.seniority))].sort((x, y) => y - x);
    for (const tier of tiers) {
      const idx = prefs
        .map((p, i) => [p, i] as const)
        .filter(([p, i]) => p.seniority === tier && !converted.has(i));
      const owed = idx.reduce((a, [p]) => a + Math.round(p.invested * p.multiple), 0);
      const pay = Math.min(remaining, owed);
      for (const [p, i] of idx) {
        prefPaid.set(
          i,
          owed === 0 ? 0 : Math.floor((pay * Math.round(p.invested * p.multiple)) / owed),
        );
      }
      remaining -= [...idx].reduce((a, [, i]) => a + (prefPaid.get(i) ?? 0), 0);
    }
    // Shares that share in the residual: everyone except non-participating prefs that took their preference.
    const excluded = new Map<Id, number>();
    prefs.forEach((p, i) => {
      if (!converted.has(i) && !p.participating)
        excluded.set(p.holderId, (excluded.get(p.holderId) ?? 0) + p.shares);
    });
    const participatingShares = totalShares - [...excluded.values()].reduce((a, b) => a + b, 0);
    const perShare = participatingShares > 0 ? Math.max(0, remaining) / participatingShares : 0;
    return { prefPaid, perShare, excluded };
  };

  // Each non-participating pref converts if its as-converted share beats its preference.
  // Converting only ever raises the per-share residual for others, so iterate to a fixed point.
  for (let iter = 0; iter < prefs.length + 1; iter++) {
    const { prefPaid, perShare } = compute();
    let changed = false;
    prefs.forEach((p, i) => {
      if (p.participating || converted.has(i)) return;
      if (perShare * p.shares > (prefPaid.get(i) ?? 0)) {
        converted.add(i);
        changed = true;
      }
    });
    if (!changed) break;
  }

  const { prefPaid, perShare, excluded } = compute();
  const lines = new Map<Id, WaterfallLine>();
  const line = (id: Id) => {
    let l = lines.get(id);
    if (!l) {
      l = { holderId: id, preference: 0, common: 0, total: 0, converted: false };
      lines.set(id, l);
    }
    return l;
  };
  prefs.forEach((p, i) => {
    const l = line(p.holderId);
    l.preference += prefPaid.get(i) ?? 0;
    if (converted.has(i)) l.converted = true;
  });
  for (const [id, shares] of Object.entries(holdings)) {
    const sharing = shares - (excluded.get(id) ?? 0);
    line(id).common += Math.floor(sharing * perShare);
  }
  for (const l of lines.values()) l.total = l.preference + l.common;
  return [...lines.values()]
    .filter((l) => l.total > 0 || holdings[l.holderId])
    .sort((x, y) => y.total - x.total);
}
