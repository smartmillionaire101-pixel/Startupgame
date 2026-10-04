/**
 * Acquisitions between players (§12).
 *
 * A player company offers to buy another through a deal card. Prices far
 * from market value are flagged to stop disguised transfers between friends;
 * a related-party deal far from value is refused outright. Selling needs
 * board and shareholder approval (governance.ts). Buying a company doesn't
 * guarantee its revenue: after the purchase some staff leave, some
 * customers churn, and culture clashes reduce morale.
 *
 * Same market: the target is merged into the buyer. Another market: the
 * target keeps operating there as a subsidiary run by the buyer's founders.
 */
import { aiRespond, openDeal, settleExit } from './deals.js';
import { emptyPosition } from './customers.js';
import { ensure, fail } from './errors.js';
import { achieve, getCompany, getMarket, nextStage, notify, publish } from './helpers.js';
import { account, costIn, payExact, transfer } from './ledger.js';
import { clamp } from './math.js';
import { relatedParties } from './marketplace.js';
import { deriveRng } from './rng.js';
import { applyStarEvent } from './stars.js';
import { removeStaff } from './staff.js';
import { hasVisited } from './travel.js';
import { valueCompany } from './valuation.js';
import { newCapTable } from './captable.js';
import type { AcquisitionTerms, Company, DealCard, Id, World } from './types.js';

/** Fair-value band around the model valuation (§12 "Fair-value checks"). */
export const FAIR_VALUE = { low: 0.4, high: 2.5 } as const;

export function acquisitionFlags(
  world: World,
  buyer: Company,
  target: Company,
  price: number,
): string[] {
  const value = valueCompany(world, target, nextStage(target.lastRound)).value;
  const flags: string[] = [];
  if (price < value * FAIR_VALUE.low || price > value * FAIR_VALUE.high) flags.push('fair-value');
  if (relatedParties(world, buyer, target)) flags.push('related-party');
  return flags;
}

export function proposeAcquisition(
  world: World,
  args: { buyerId: Id; targetId: Id; price: number; retention: number; by: Id },
): DealCard {
  const buyer = getCompany(world, args.buyerId);
  const target = getCompany(world, args.targetId);
  ensure(buyer.id !== target.id, 'acquire.self', 'A company can’t buy itself.');
  ensure(
    buyer.status === 'active' && target.status === 'active',
    'company.closed',
    'Both companies must be operating.',
  );
  ensure(!target.parentId, 'acquire.subsidiary', 'That company is already owned by another.');
  const actor = world.players[args.by];
  ensure(
    actor && hasVisited(actor, target.market),
    'acquire.market',
    'Acquiring in another market needs a trip there first.',
  );
  ensure(args.price > 0, 'acquire.price', 'Offer a price.');
  const buyerCur = getMarket(world, buyer.market).data.currency;
  const targetCur = getMarket(world, target.market).data.currency;
  const cost = costIn(world, args.price + args.retention, targetCur, buyerCur);
  ensure(
    account(world, buyer.account).balance >= cost,
    'acquire.funds',
    `${buyer.name} doesn’t have the cash for this offer.`,
  );
  ensure(
    !Object.values(world.deals).some(
      (d) => d.status === 'open' && d.companyId === target.id && d.terms.kind === 'acquisition',
    ),
    'acquire.open',
    'There is already an offer on the table for that company.',
  );
  const flags = acquisitionFlags(world, buyer, target, args.price);
  if (flags.includes('fair-value') && flags.includes('related-party')) {
    fail(
      'acquire.blocked',
      'A related-party sale far from market value looks like a disguised transfer. Refused.',
    );
  }
  const terms: AcquisitionTerms = {
    kind: 'acquisition',
    price: args.price,
    buyer: buyer.name,
    buyerCompanyId: buyer.id,
    retention: args.retention,
    flags,
  };
  const value = valueCompany(world, target, nextStage(target.lastRound)).value;
  const deal = openDeal(world, {
    companyId: target.id,
    proposer: { kind: 'company', id: buyer.id },
    counterparty: { kind: 'company', id: target.id },
    terms,
    by: args.by,
    aiLimit: { minValuation: Math.round(Math.max(value, target.capTable.lastPostMoney) * 1.1) },
  });
  if (target.ai) aiRespond(world, deal);
  return deal;
}

/**
 * Pay for and integrate the target. The money goes through the liquidation
 * waterfall to the target's holders, exactly as with any exit.
 */
export function executePlayerAcquisition(world: World, d: DealCard, t: AcquisitionTerms) {
  const buyer = getCompany(world, t.buyerCompanyId!);
  const target = getCompany(world, d.companyId!);
  const tm = getMarket(world, target.market);
  ensure(buyer.status === 'active', 'company.closed', 'The buyer is no longer operating.');
  // Price into the target market's outside-world account, then out through the waterfall.
  payExact(world, buyer.account, tm.ext.lps, t.price, `Acquisition of ${target.name}`, tm.month);
  // Retention packages for the target's founders (taxed as income where they work).
  const founders = target.founderIds.map((id) => world.players[id]).filter((p) => p !== undefined);
  if (t.retention && founders.length) {
    const each = Math.floor(t.retention / founders.length);
    for (const f of founders) {
      const tax = Math.round(each * tm.data.tax.personalIncome);
      payExact(world, buyer.account, tm.ext.tax, tax, 'Retention package tax (withheld)', tm.month);
      payExact(
        world,
        buyer.account,
        f.accounts.local,
        each - tax,
        `Retention package from ${buyer.name}`,
        tm.month,
      );
    }
  }
  const sellers = [...target.founderIds];
  settleExit(world, target, t.price, buyer.name, 'acquired');

  if (target.market === buyer.market) mergeInto(world, buyer, target);
  else keepAsSubsidiary(world, buyer, target);

  for (const fid of buyer.founderIds) {
    const f = world.players[fid];
    if (f)
      achieve(
        world,
        f,
        'founder.first-acquisition',
        'First acquisition of another company',
        tm.month,
      );
  }
  for (const fid of sellers)
    notify(world, fid, {
      month: tm.month,
      kind: 'deal',
      text: `${buyer.name} bought ${target.name}.`,
    });
  applyStarEvent(buyer.stars, 0.1);
  publish(world, {
    market: target.market,
    month: tm.month,
    outletId: tm.outlets.find((o) => o.type === 'national')?.id ?? 'national',
    outletName: tm.outlets.find((o) => o.type === 'national')?.name ?? 'National desk',
    kind: 'feature',
    alert: `${buyer.name} buys ${target.name}.`,
    headline: `${buyer.name} acquires ${target.name}`,
    body: `${buyer.name} bought ${target.name}${t.flags?.length ? '. Regulators noted the price was far from market value' : ''}.`,
    starDelta: 0.1,
    verified: true,
    subject: { kind: 'company', id: buyer.id },
  });
}

/** Integration risk: staff may leave, customers may churn, culture clashes cut morale. */
function mergeInto(world: World, buyer: Company, target: Company) {
  const m = getMarket(world, buyer.market);
  const rng = deriveRng(world.seed, 'integration', target.id);
  // Cash, loans and contracts come across with the company.
  transfer(
    world,
    target.account,
    buyer.account,
    account(world, target.account).balance,
    `Merged: ${target.name}`,
    m.month,
  );
  buyer.finance.loans.push(...target.finance.loans);
  target.finance.loans = [];
  for (const k of Object.values(world.contracts)) {
    if (k.status !== 'active') continue;
    if (k.buyerId === target.id) k.buyerId = buyer.id;
    if (k.sellerId === target.id) k.sellerId = buyer.id;
    if (k.buyerId === k.sellerId) k.status = 'ended';
  }
  for (const l of Object.values(world.listings)) if (l.companyId === target.id) l.active = false;
  // Customers: some churn in the switch.
  for (const [key, pos] of Object.entries(target.segments)) {
    const to = (buyer.segments[key] ??= emptyPosition());
    to.paying += Math.round(pos.paying * 0.8);
    to.awareness = Math.max(to.awareness, pos.awareness);
  }
  // Product: the better product wins, imperfectly.
  if (target.industry === buyer.industry)
    buyer.product.fit = Math.max(buyer.product.fit, target.product.fit * 0.8);
  buyer.product.techDebt = clamp(buyer.product.techDebt + 0.05, 0, 1);
  // Staff: culture clash.
  for (const s of target.staff) {
    if (rng.chance(0.2)) continue;
    buyer.staff.push({ ...s, morale: clamp(s.morale - 15, 0, 100), equityBps: 0 });
  }
  for (const s of buyer.staff) s.morale = clamp(s.morale - 5, 0, 100);
  for (const s of [...target.staff]) removeStaff(target, s.id);
  target.staff = [];
  target.segments = {};
}

/** Across markets the target keeps trading there, 100% owned by the buyer and run by its founders. */
function keepAsSubsidiary(world: World, buyer: Company, target: Company) {
  target.status = 'active';
  target.closedMonth = null;
  target.parentId = buyer.id;
  target.ai = false;
  target.aiCeo = buyer.founderIds.length === 0;
  target.founderIds = [...buyer.founderIds];
  for (const fid of buyer.founderIds) world.players[fid]?.companyIds.push(target.id);
  // Fresh cap table: the parent owns everything.
  const ct = newCapTable([{ id: buyer.id, bps: 10_000 }]);
  for (const h of Object.values(ct.holdings)) h.kind = 'investor';
  target.capTable = ct;
  target.board = [];
  target.vetoes = [];
  for (const s of target.staff) s.morale = clamp(s.morale - 10, 0, 100);
}
