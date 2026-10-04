/**
 * Player-to-player B2B marketplace (§6).
 *
 * Every player company can list one product or service; what it sells
 * follows its sector. Other companies buy through supply contracts signed on
 * deal cards and paid monthly. A good supplier measurably helps its buyers
 * (relative to the default AI supplier, which is functional but average); a
 * failing one hurts them. Guardrails flag related-party deals and prices far
 * above market rate, report player revenue separately, and treat proven
 * fake revenue as fraud.
 */
import type { Industry } from './data/industries.js';
import { reliability } from './customers.js';
import { ensure } from './errors.js';
import { adjustTrust, col, getCompany, getMarket, notify, publish } from './helpers.js';
import { aiRespond, openDeal } from './deals.js';
import { newId } from './ids.js';
import { transferUpTo } from './ledger.js';
import { clamp, roundTo } from './math.js';
import { formatMoney, scale } from './money.js';
import type { Rng } from './rng.js';
import { applyStarEvent } from './stars.js';
import type { Company, Id, Listing, SupplyContract, World } from './types.js';

export const CATEGORY: Record<Industry, string> = {
  fintech: 'Payments',
  ecommerce: 'Procurement',
  logistics: 'Delivery',
  healthtech: 'Staff health',
  edtech: 'Staff training',
  saas: 'Business software',
  agritech: 'Food supply',
};

/** Market rate per month, as a multiple of local cost of living. */
const BASE_PRICE_COL: Record<Industry, number> = {
  fintech: 0.3,
  ecommerce: 0.4,
  logistics: 0.5,
  healthtech: 0.6,
  edtech: 0.5,
  saas: 0.4,
  agritech: 0.4,
};

/** Prices above this multiple of market rate are flagged. */
export const ABOVE_MARKET = 2;
/** Flagged revenue share that, sustained, is treated as fraud. */
export const FRAUD_SHARE = 0.25;
export const FRAUD_MONTHS = 3;

export const marketRate = (world: World, c: Company, industry: Industry = c.industry) =>
  scale(col(getMarket(world, c.market)), BASE_PRICE_COL[industry]);

/** −0.5 (worse than the AI default) … 1 (excellent), from the seller's reliability. */
export const supplierQuality = (seller: Company) =>
  clamp((reliability(seller) - 0.45) / 0.5, -0.5, 1);

export interface SupplyEffects {
  /** Multiplier on dollar-priced processing costs. */
  cogsMult: number;
  /** Multiplier on office and marketing costs. */
  overheadMult: number;
  /** Multiplier on staff output. */
  outputMult: number;
  /** Added to reliability (0–1 scale). */
  reliabilityAdd: number;
  /** Added to staff morale each month. */
  moraleAdd: number;
  /** Added to staff skill each month. */
  skillAdd: number;
}

export const NO_EFFECTS: SupplyEffects = {
  cogsMult: 1,
  overheadMult: 1,
  outputMult: 1,
  reliabilityAdd: 0,
  moraleAdd: 0,
  skillAdd: 0,
};

/** Combined effect of a buyer's active supply contracts this month. */
export function supplyEffects(world: World, buyer: Company): SupplyEffects {
  const e = { ...NO_EFFECTS };
  for (const k of Object.values(world.contracts)) {
    if (k.buyerId !== buyer.id || k.status !== 'active') continue;
    const seller = world.companies[k.sellerId];
    if (!seller || seller.status !== 'active') continue;
    const q = supplierQuality(seller);
    switch (seller.industry) {
      case 'fintech':
        e.cogsMult *= 1 - 0.2 * q;
        break;
      case 'ecommerce':
        e.overheadMult *= 1 - 0.1 * q;
        break;
      case 'logistics':
        e.reliabilityAdd += 0.08 * q;
        break;
      case 'healthtech':
        e.moraleAdd += 6 * q;
        break;
      case 'edtech':
        e.skillAdd += 0.004 * q;
        break;
      case 'saas':
        e.outputMult *= 1 + 0.06 * q;
        break;
      case 'agritech':
        e.moraleAdd += 3 * q;
        break;
    }
  }
  e.reliabilityAdd = clamp(e.reliabilityAdd, -0.2, 0.2);
  return e;
}

export function createListing(world: World, c: Company, title: string, price: number): Listing {
  ensure(
    !Object.values(world.listings).some((l) => l.companyId === c.id),
    'listing.exists',
    'You already have a listing. Update it instead.',
  );
  ensure(price > 0, 'listing.price', 'Set a price.');
  const m = getMarket(world, c.market);
  const listing: Listing = {
    id: newId(world, 'lst'),
    companyId: c.id,
    market: c.market,
    category: CATEGORY[c.industry],
    title: title.trim(),
    price,
    active: true,
    createdMonth: m.month,
    reviews: { sum: 0, count: 0 },
  };
  world.listings[listing.id] = listing;
  return listing;
}

/** Shareholder or founder in common: buyer and seller are related parties. */
export function relatedParties(world: World, buyer: Company, seller: Company): boolean {
  // Human founders or shareholders in common (a VC backing both is normal, not related-party).
  const owners = (c: Company) =>
    new Set(
      [...c.founderIds, ...Object.keys(c.capTable.holdings)].filter(
        (h) => world.players[h] && !world.players[h]!.ai,
      ),
    );
  const a = owners(buyer);
  for (const o of owners(seller)) if (a.has(o)) return true;
  return false;
}

export function contractFlags(
  world: World,
  buyer: Company,
  seller: Company,
  price: number,
): string[] {
  const flags: string[] = [];
  if (relatedParties(world, buyer, seller)) flags.push('related-party');
  if (price > marketRate(world, seller) * ABOVE_MARKET) flags.push('above-market');
  return flags;
}

export function startContract(
  world: World,
  listingId: Id,
  buyerId: Id,
  price: number,
  months: number,
): SupplyContract {
  const listing = world.listings[listingId];
  ensure(listing && listing.active, 'listing.missing', 'That listing is no longer available.');
  const buyer = getCompany(world, buyerId);
  const seller = getCompany(world, listing.companyId);
  ensure(buyer.id !== seller.id, 'supply.self', 'A company can’t buy from itself.');
  ensure(
    buyer.status === 'active' && seller.status === 'active',
    'company.closed',
    'Both companies must be operating.',
  );
  ensure(buyer.market === seller.market, 'supply.market', 'Suppliers must be in your market.');
  ensure(
    !Object.values(world.contracts).some(
      (k) => k.status === 'active' && k.buyerId === buyer.id && k.sellerId === seller.id,
    ),
    'supply.exists',
    'You already buy from them.',
  );
  const m = getMarket(world, buyer.market);
  const k: SupplyContract = {
    id: newId(world, 'sup'),
    listingId,
    buyerId: buyer.id,
    sellerId: seller.id,
    market: buyer.market,
    price,
    startMonth: m.month,
    endMonth: m.month + months,
    flags: contractFlags(world, buyer, seller, price),
    status: 'active',
    reviewed: false,
  };
  world.contracts[k.id] = k;
  for (const c of [buyer, seller]) {
    for (const fid of c.founderIds) {
      notify(world, fid, {
        month: m.month,
        kind: 'deal',
        text: `Supply contract: ${seller.name} supplies ${buyer.name} (${listing.category}) for ${formatMoney(price, m.data.currency)}/month.${k.flags.length ? ` Flagged: ${k.flags.join(', ')}.` : ''}`,
      });
    }
  }
  return k;
}

export function endContract(
  world: World,
  k: SupplyContract,
  reason: 'ended' | 'cancelled',
  byCompanyId: Id | null,
  month: number,
) {
  if (k.status !== 'active') return;
  k.status = reason;
  k.endMonth = month;
  if (reason === 'cancelled' && byCompanyId) {
    const other = byCompanyId === k.buyerId ? k.sellerId : k.buyerId;
    const by = world.companies[byCompanyId];
    const them = world.companies[other];
    for (const f of by?.founderIds ?? [])
      for (const g of them?.founderIds ?? []) adjustTrust(world.players[g], f, -0.05);
    for (const g of them?.founderIds ?? [])
      notify(world, g, {
        month,
        kind: 'deal',
        text: `${by?.name ?? 'A company'} cancelled its supply contract with you.`,
      });
  }
}

export function reviewSupplier(world: World, k: SupplyContract, rating: number) {
  ensure(!k.reviewed, 'review.done', 'Already reviewed.');
  ensure(Number.isInteger(rating) && rating >= 1 && rating <= 5, 'review.rating', 'Rate 1 to 5.');
  const listing = world.listings[k.listingId];
  if (listing) {
    listing.reviews.sum += rating;
    listing.reviews.count += 1;
  }
  const seller = world.companies[k.sellerId];
  if (seller) applyStarEvent(seller.stars, (rating - 3) * 0.03);
  k.reviewed = true;
}

/**
 * Monthly: buyers pay suppliers, contracts expire, failed suppliers disrupt
 * their customers. Amounts are recorded for each company's P&L, with player
 * revenue reported separately (§6 guardrails).
 */
export function settleContracts(world: World, market: string, month: number) {
  for (const k of Object.values(world.contracts)) {
    if (k.market !== market || k.status !== 'active') continue;
    const buyer = world.companies[k.buyerId];
    const seller = world.companies[k.sellerId];
    if (!buyer || buyer.status !== 'active') {
      endContract(world, k, 'cancelled', null, month);
      continue;
    }
    if (!seller || seller.status !== 'active') {
      // A failing supplier hurts its customers (§6).
      endContract(world, k, 'cancelled', null, month);
      buyer.supplyDisruptionMonth = month;
      for (const f of buyer.founderIds)
        notify(world, f, {
          month,
          kind: 'warning',
          text: `Your supplier ${seller?.name ?? ''} failed. Service is disrupted while you switch to the default AI supplier.`,
        });
      continue;
    }
    const paid = transferUpTo(
      world,
      buyer.account,
      seller.account,
      k.price,
      `Supply contract: ${seller.name}`,
      month,
    );
    buyer.ledgerThisMonth.supplierCost += paid;
    seller.ledgerThisMonth.playerRevenue += paid;
    if (k.flags.length) seller.ledgerThisMonth.flaggedRevenue += paid;
    if (paid < k.price) {
      endContract(world, k, 'cancelled', buyer.id, month);
      for (const f of seller.founderIds)
        notify(world, f, {
          month,
          kind: 'warning',
          text: `${buyer.name} couldn’t pay. Contract cancelled.`,
        });
      continue;
    }
    if (month >= k.endMonth) endContract(world, k, 'ended', null, month);
  }
}

/**
 * Anti-cheat (§18): revenue that is mostly flagged (related-party or far above
 * market) for several months running is treated as proven fake revenue.
 */
export function detectFakeRevenue(world: World, c: Company, month: number) {
  const last = c.finance.history[c.finance.history.length - 1];
  if (!last || last.revenue <= 0) return;
  const share = c.lastFlaggedRevenue / Math.max(1, last.revenue);
  c.fraudStreak = share >= FRAUD_SHARE ? c.fraudStreak + 1 : 0;
  if (c.fraudStreak < FRAUD_MONTHS || c.bannedFromRaising) return;
  c.bannedFromRaising = true;
  applyStarEvent(c.stars, -1.5);
  for (const fid of c.founderIds) {
    const f = world.players[fid];
    if (f) applyStarEvent(f.stars, -1.2);
  }
  for (const k of Object.values(world.contracts)) {
    if (k.status === 'active' && k.flags.length && (k.sellerId === c.id || k.buyerId === c.id))
      endContract(world, k, 'cancelled', null, month);
  }
  publish(world, {
    market: c.market,
    month,
    outletId: 'public-record',
    outletName: 'Public record',
    kind: 'public-record',
    alert: `Regulator confirms fake revenue at ${c.name}.`,
    headline: `${c.name} faked revenue, regulator finds`,
    body: `Most of ${c.name}'s recent revenue came from related parties at inflated prices. The company is barred from raising money.`,
    starDelta: -1.5,
    verified: true,
    subject: { kind: 'company', id: c.id },
  });
}

/** AI startups buy from good player suppliers, so new sellers can find customers. */
export function aiProcurement(world: World, market: string, rng: Rng) {
  const listings = Object.values(world.listings).filter((l) => l.market === market && l.active);
  if (!listings.length) return;
  for (const buyer of Object.values(world.companies)) {
    if (!buyer.ai || buyer.market !== market || buyer.status !== 'active' || !rng.chance(0.08))
      continue;
    const current = Object.values(world.contracts).filter(
      (k) => k.buyerId === buyer.id && k.status === 'active',
    );
    if (current.length >= 2) continue;
    const options = listings.filter((l) => {
      const seller = world.companies[l.companyId];
      return (
        seller &&
        seller.id !== buyer.id &&
        seller.industry !== buyer.industry &&
        !current.some((k) => k.sellerId === seller.id)
      );
    });
    if (!options.length) continue;
    const pick = rng.pick(options);
    const seller = world.companies[pick.companyId]!;
    const rating = pick.reviews.count ? pick.reviews.sum / pick.reviews.count : 3;
    // Functional-but-average AI default is the bar to beat.
    if (
      supplierQuality(seller) < 0.1 ||
      rating < 2.5 ||
      pick.price > marketRate(world, seller) * 1.3
    )
      continue;
    startContract(world, pick.id, buyer.id, pick.price, rng.int(6, 12));
  }
}

export const playerRevenueShare = (c: Company) => {
  const last = c.finance.history[c.finance.history.length - 1];
  return last && last.revenue > 0 ? roundTo(last.playerRevenue / last.revenue, 3) : 0;
};

/** A buyer proposes a supply contract; AI sellers answer at once. */
export function proposeSupply(
  world: World,
  args: { buyerId: Id; listingId: Id; price: number; months: number; by: Id },
) {
  const listing = world.listings[args.listingId];
  ensure(listing && listing.active, 'listing.missing', 'That listing is no longer available.');
  const seller = getCompany(world, listing.companyId);
  const buyer = getCompany(world, args.buyerId);
  ensure(buyer.id !== seller.id, 'supply.self', 'A company can’t buy from itself.');
  ensure(buyer.market === seller.market, 'supply.market', 'Suppliers must be in your market.');
  const deal = openDeal(world, {
    companyId: seller.id,
    proposer: { kind: 'company', id: buyer.id },
    counterparty: { kind: 'company', id: seller.id },
    terms: {
      kind: 'supply',
      listingId: listing.id,
      buyerId: buyer.id,
      price: args.price,
      months: args.months,
    },
    by: args.by,
    aiLimit: { minValuation: Math.round(listing.price * 0.9) },
  });
  if (seller.ai) aiRespond(world, deal);
  return deal;
}

/** AI startups list their product at around market rate, so the marketplace is never empty (§2). */
export function ensureAiListings(world: World, market: string, rng: Rng) {
  const listed = new Set(Object.values(world.listings).map((l) => l.companyId));
  for (const c of Object.values(world.companies)) {
    if (!c.ai || c.market !== market || c.status !== 'active' || listed.has(c.id)) continue;
    createListing(
      world,
      c,
      `${c.name} ${CATEGORY[c.industry].toLowerCase()}`,
      Math.round(marketRate(world, c) * rng.range(0.85, 1.2)),
    );
  }
  for (const l of Object.values(world.listings)) {
    const c = world.companies[l.companyId];
    if (l.market === market && (!c || c.status !== 'active')) l.active = false;
  }
}
