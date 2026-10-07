/**
 * Capital that mirrors each market (Wave 1, section A): AI lenders and their
 * products, eligibility with plain-language reasons, and fund depth.
 *
 * Every AI lender lends from (and is repaid into) the market's external bank
 * account, like the original AI bank, so money is conserved. Decisions are
 * pure functions of the world: no randomness.
 */
import { CAPITAL, extraFunds } from './data/capital.js';
import type { LenderProductSeed } from './data/capital.js';
import type { AiFundSeed } from './data/fiction.js';
import type { MarketId } from './data/markets.js';
import { creditProfile } from './credit.js';
import { openDeal } from './deals.js';
import { ensure, fail } from './errors.js';
import { getMarket, lastPnl, notify, usdToLocal } from './helpers.js';
import { newId } from './ids.js';
import { openAccount, transfer } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney } from './money.js';
import { TECH_CAPITAL_FUNDS } from './data/tech-capital.js';
import { hashString } from './rng.js';
import { newStars } from './stars.js';
import { normaliseName } from './names.js';
import type {
  Company,
  DealCard,
  Fund,
  Id,
  LenderState,
  LoanTerms,
  MarketState,
  PartyRef,
  PersonalLoanTerms,
  Player,
  World,
} from './types.js';

// ------------------------------------------------------------------ Lenders

/** Fresh lender state for a market, from the capital profile. */
export function seedLenders(market: MarketId): Record<Id, LenderState> {
  const out: Record<Id, LenderState> = {};
  for (const l of CAPITAL[market].lenders) {
    out[l.id] = {
      id: l.id,
      name: l.name,
      kind: l.kind,
      appetite: l.appetite,
      baseAppetite: l.appetite,
      products: structuredClone(l.products),
      look: { ...l.look },
    };
  }
  return out;
}

/** Name of the first high-street lender (what `bankName` shows). */
export const firstHighStreetName = (market: MarketId): string =>
  (CAPITAL[market].lenders.find((l) => l.kind === 'high-street') ?? CAPITAL[market].lenders[0]!)
    .name;

/** Monthly: appetite follows the funding climate (warm climate, looser credit). */
export function updateLenderAppetite(m: MarketState) {
  for (const l of Object.values(m.lenders ?? {})) {
    l.appetite = Math.round(clamp(l.baseAppetite + (m.climate - 1) * 0.8, 0.5, 1.5) * 100) / 100;
  }
}

export const appetiteLabel = (a: number): 'tight' | 'normal' | 'loose' =>
  a < 0.85 ? 'tight' : a > 1.15 ? 'loose' : 'normal';

export function findProduct(m: MarketState, lenderId: Id, productId: string) {
  const lender = m.lenders?.[lenderId];
  const product = lender?.products.find((p) => p.id === productId);
  if (!lender || !product) fail('loan.lender', 'That lender doesn’t offer that loan here.');
  return { lender, product };
}

/** The bank side of a deal card with a named AI lender. */
export const lenderParty = (m: MarketState, lenderId: Id): PartyRef => ({
  kind: 'bank',
  id: m.id,
  lenderId,
});

/** What a product costs today, before borrower adjustments. Revenue-based: the flat fee. */
export function productRateBps(m: MarketState, p: LenderProductSeed): number {
  if (p.kind === 'revenue-based') return (p.repayCapBps ?? 10_000) - 10_000;
  return p.fixedRateBps ?? m.data.baseRateBps + p.spreadBps;
}

/** Product amount range in local minor units, at today's exchange rate. */
export function productAmount(world: World, m: MarketState, p: LenderProductSeed) {
  return [usdToLocal(world, m, p.amountUsd[0]), usdToLocal(world, m, p.amountUsd[1])] as [
    number,
    number,
  ];
}

export interface LoanQuote {
  eligible: boolean;
  reason: string | null;
  maxMinor: number;
  companyId: Id | null;
}

const months = (n: number) => `${n} month${n === 1 ? '' : 's'}`;
const stars = (n: number) => `${Math.round(n * 10) / 10} star${n === 1 ? '' : 's'}`;

/** Can this company borrow this product today, how much, and if not, why. */
export function companyQuote(
  world: World,
  m: MarketState,
  lender: LenderState,
  product: LenderProductSeed,
  c: Company | null,
): LoanQuote {
  const no = (reason: string, maxMinor = 0): LoanQuote => ({
    eligible: false,
    reason,
    maxMinor,
    companyId: c?.id ?? null,
  });
  if (product.borrower !== 'company')
    return no('This loan is for founders personally: apply in your own name.');
  if (!c || c.status !== 'active') return no('Start a company first: we lend to businesses.');
  if (c.market !== m.id) return no(`We only lend to businesses in ${m.data.name}.`);
  const tight = lender.appetite < 0.85;
  const trading = Math.max(0, m.month - c.foundedMonth);
  if (trading < product.minMonthsTrading)
    return no(`We lend from ${months(product.minMonthsTrading)} of trading. You have ${trading}.`);
  const revenue = lastPnl(c)?.revenue ?? 0;
  const minRevenue = usdToLocal(world, m, product.minMonthlyRevenueUsd * (tight ? 1.25 : 1));
  if (revenue < minRevenue)
    return no(
      `We need ${formatMoney(minRevenue, m.data.currency)} a month in revenue. You made ${formatMoney(revenue, m.data.currency)} last month.`,
    );
  const minStars = product.minStars + (tight ? 0.5 : 0);
  if (c.stars.value < minStars)
    return no(
      `We lend to companies rated ${stars(minStars)} or more. ${c.name} has ${stars(c.stars.value)}.`,
    );
  const founder = c.founderIds.map((id) => world.players[id]).find(Boolean);
  if (
    founder &&
    founder.credit.defaults > 0 &&
    lender.kind !== 'microfinance' &&
    lender.kind !== 'fintech'
  )
    return no('We can’t lend after a default on your record.');
  if (c.finance.loans.some((l) => l.lenderId === lender.id && l.productId === product.id))
    return no(`You already have our ${product.label.toLowerCase()}. Repay it first.`);
  const [min, max] = productAmount(world, m, product);
  const byRevenue =
    product.maxRevenueMultiple !== undefined
      ? Math.round(revenue * product.maxRevenueMultiple * clamp(lender.appetite, 0.5, 1.25))
      : max;
  const cap = Math.min(max, byRevenue);
  if (cap < min)
    return no(
      `Your revenue supports ${formatMoney(cap, m.data.currency)}; our smallest loan is ${formatMoney(min, m.data.currency)}.`,
      cap,
    );
  return { eligible: true, reason: null, maxMinor: cap, companyId: c.id };
}

/** Can this person borrow this founder product today, how much, and if not, why. */
export function founderQuote(
  world: World,
  m: MarketState,
  lender: LenderState,
  product: LenderProductSeed,
  p: Player,
): LoanQuote {
  const no = (reason: string, maxMinor = 0): LoanQuote => ({
    eligible: false,
    reason,
    maxMinor,
    companyId: null,
  });
  if (product.borrower !== 'founder')
    return no('This loan is for businesses: apply for your company.');
  if (p.market !== m.id) return no(`We only lend to people living in ${m.data.name}.`);
  const founding =
    p.role === 'founder' || p.companyIds.some((id) => world.companies[id]?.status === 'active');
  if (!founding) return no('This loan is for founders starting a business.');
  const profile = creditProfile(world, p);
  const tight = lender.appetite < 0.85;
  const minScore = product.minCreditScore + (tight ? 5 : 0);
  if (profile.score < minScore)
    return no(`We need a credit score of ${minScore}. Yours is ${profile.score}.`);
  if (p.credit.defaults > 0 && lender.kind !== 'microfinance')
    return no('We can’t lend after a default on your record.');
  if (p.loans.some((l) => l.lenderId === lender.id && l.productId === product.id))
    return no(`You already have a ${product.label}. Repay it first.`);
  const [min, max] = productAmount(world, m, product);
  const strength = clamp((profile.score - product.minCreditScore + 10) / 40, 0.25, 1);
  const cap = Math.round(max * strength * Math.min(1, lender.appetite));
  if (cap < min)
    return no(
      `Your credit profile supports ${formatMoney(cap, m.data.currency)}; our smallest loan is ${formatMoney(min, m.data.currency)}.`,
      cap,
    );
  return { eligible: true, reason: null, maxMinor: cap, companyId: null };
}

/** Record a decline on a deal card, with the lender's reason, and tell the borrower. */
function declineCard(
  world: World,
  m: MarketState,
  args: { companyId: Id | null; borrower: PartyRef; lender: LenderState; terms: DealCard['terms'] },
  reason: string,
  notifyId: Id,
): DealCard {
  const d = openDeal(world, {
    companyId: args.companyId,
    market: m.id,
    proposer: args.borrower,
    counterparty: lenderParty(m, args.lender.id),
    terms: args.terms,
    by: notifyId,
  });
  d.status = 'declined';
  d.history.push({
    month: m.month,
    by: args.lender.id,
    action: 'decline',
    summary: `${args.lender.name}: “${reason}”`,
  });
  notify(world, notifyId, {
    month: m.month,
    kind: 'deal',
    text: `${args.lender.name} declined: “${reason}”`,
    ref: { kind: 'deal', id: d.id },
  });
  return d;
}

const clampMonths = (p: LenderProductSeed, n: number) =>
  clamp(Math.round(n), Math.max(3, p.termMonths[0]), Math.min(60, p.termMonths[1]));

export interface LenderLoanResult {
  dealId: Id;
  declined: boolean;
  reason: string | null;
  message: string;
  maxMinor: number;
}

/**
 * A company applies for a product. The lender answers on a deal card: an
 * offer as asked, a counter (smaller amount, a guarantee, a term it offers),
 * or a decline with the specific reason.
 */
export function requestCompanyProductLoan(
  world: World,
  c: Company,
  me: Player,
  req: {
    lenderId: Id;
    productId: string;
    amount: number;
    months: number;
    personalGuarantee: boolean;
  },
): LenderLoanResult {
  const m = getMarket(world, c.market);
  const { lender, product } = findProduct(m, req.lenderId, req.productId);
  ensure(req.amount > 0, 'loan.amount', 'Ask for an amount.');
  ensure(
    product.borrower === 'company',
    'loan.product',
    'That loan is for founders personally: apply in your own name.',
  );
  ensure(
    !Object.values(world.deals).some(
      (d) => d.companyId === c.id && d.status === 'open' && d.terms.kind === 'loan',
    ),
    'loan.open',
    'You already have a loan offer open.',
  );
  const quote = companyQuote(world, m, lender, product, c);
  const rbf = product.kind === 'revenue-based';
  const asked: LoanTerms = {
    kind: 'loan',
    amount: req.amount,
    rateBps: rbf ? 0 : productRateBps(m, product),
    months: clamp(req.months, 3, 60),
    personalGuarantee: req.personalGuarantee,
    productId: product.id,
    ...(rbf ? { revenueShareBps: product.revenueShareBps, repayCapBps: product.repayCapBps } : {}),
  };
  if (!quote.eligible) {
    const d = declineCard(
      world,
      m,
      { companyId: c.id, borrower: { kind: 'company', id: c.id }, lender, terms: asked },
      quote.reason!,
      me.id,
    );
    return {
      dealId: d.id,
      declined: true,
      reason: quote.reason,
      message: `${lender.name}: “${quote.reason}”`,
      maxMinor: quote.maxMinor,
    };
  }
  const [min] = productAmount(world, m, product);
  const amount = clamp(req.amount, min, quote.maxMinor);
  const term = clampMonths(product, req.months);
  const guarantee =
    product.guarantee === 'required'
      ? true
      : product.guarantee === 'none'
        ? false
        : req.personalGuarantee;
  const founder = world.players[c.founderIds[0] ?? ''];
  let rateBps = asked.rateBps;
  if (!rbf && product.fixedRateBps === undefined) {
    rateBps += (founder?.credit.defaults ?? 0) * 300;
    if (product.guarantee === 'optional' && guarantee) rateBps -= 150;
  }
  const terms: LoanTerms = {
    ...asked,
    amount,
    months: term,
    personalGuarantee: guarantee,
    rateBps,
  };
  const changes: string[] = [];
  if (amount < req.amount)
    changes.push(`we can lend up to ${formatMoney(amount, m.data.currency)}`);
  if (amount > req.amount)
    changes.push(`our smallest loan is ${formatMoney(amount, m.data.currency)}`);
  if (guarantee && !req.personalGuarantee) changes.push('we need your personal guarantee');
  if (term !== req.months) changes.push(`we lend over ${term} months`);
  const deal = openDeal(world, {
    companyId: c.id,
    proposer: lenderParty(m, lender.id),
    counterparty: { kind: 'company', id: c.id },
    terms,
    by: lender.id,
    aiLimit: {
      maxAmount: quote.maxMinor,
      needsGuarantee: product.guarantee === 'required',
      minRateBps: terms.rateBps,
    },
  });
  const said = changes.join('; ');
  return {
    dealId: deal.id,
    declined: false,
    reason: null,
    message: said
      ? `${lender.name}: “${said.charAt(0).toUpperCase()}${said.slice(1)}.”`
      : `${lender.name} made you an offer.`,
    maxMinor: quote.maxMinor,
  };
}

/** A founder applies for a personal product (e.g. a Start Up Loan, pre-revenue). */
export function requestFounderProductLoan(
  world: World,
  p: Player,
  req: { lenderId: Id; productId: string; amount: number; months: number },
): LenderLoanResult {
  const m = getMarket(world, p.market);
  const { lender, product } = findProduct(m, req.lenderId, req.productId);
  ensure(req.amount > 0, 'loan.amount', 'Ask for an amount.');
  ensure(
    product.borrower === 'founder',
    'loan.product',
    'That loan is for businesses: apply for your company.',
  );
  ensure(
    !Object.values(world.deals).some(
      (d) =>
        d.status === 'open' &&
        d.terms.kind === 'personal-loan' &&
        (d.counterparty.id === p.id || d.proposer.id === p.id),
    ),
    'loan.open',
    'You already have a loan offer waiting.',
  );
  const quote = founderQuote(world, m, lender, product, p);
  const asked: PersonalLoanTerms = {
    kind: 'personal-loan',
    amount: req.amount,
    rateBps: productRateBps(m, product),
    months: clamp(req.months, 3, 60),
    collateral: null,
    productId: product.id,
  };
  if (!quote.eligible) {
    const d = declineCard(
      world,
      m,
      { companyId: null, borrower: { kind: 'player', id: p.id }, lender, terms: asked },
      quote.reason!,
      p.id,
    );
    return {
      dealId: d.id,
      declined: true,
      reason: quote.reason,
      message: `${lender.name}: “${quote.reason}”`,
      maxMinor: quote.maxMinor,
    };
  }
  const [min] = productAmount(world, m, product);
  const amount = clamp(req.amount, min, quote.maxMinor);
  const term = clampMonths(product, req.months);
  const deal = openDeal(world, {
    companyId: null,
    market: m.id,
    proposer: lenderParty(m, lender.id),
    counterparty: { kind: 'player', id: p.id },
    terms: { ...asked, amount, months: term },
    by: lender.id,
    aiLimit: { maxAmount: quote.maxMinor, minRateBps: asked.rateBps },
  });
  const changes: string[] = [];
  if (amount < req.amount)
    changes.push(`we can lend up to ${formatMoney(amount, m.data.currency)}`);
  if (amount > req.amount)
    changes.push(`our smallest loan is ${formatMoney(amount, m.data.currency)}`);
  if (term !== req.months) changes.push(`we lend over ${term} months`);
  const said = changes.join('; ');
  return {
    dealId: deal.id,
    declined: false,
    reason: null,
    message: said
      ? `${lender.name}: “${said.charAt(0).toUpperCase()}${said.slice(1)}.”`
      : `${lender.name} made you an offer.`,
    maxMinor: quote.maxMinor,
  };
}

// ------------------------------------------------------------------ Funds

/** Open an AI fund in a market, funded by LP commitments (money conserved). */
export function createAiFund(
  world: World,
  marketId: MarketId,
  seed: AiFundSeed,
  fixedId?: Id,
): Fund {
  const m = getMarket(world, marketId);
  const id = fixedId ?? newId(world, 'fund');
  const account = openAccount(world, {
    currency: m.data.currency,
    market: marketId,
    label: seed.name,
    ...(fixedId ? { id: `acc_${fixedId}` } : {}),
  });
  const check: [number, number] = [
    usdToLocal(world, m, seed.check[0]),
    usdToLocal(world, m, seed.check[1]),
  ];
  const size = check[1] * 25;
  transfer(world, m.ext.lps, account, size, 'LP commitments', m.month);
  const fund: Fund = {
    id,
    name: seed.name,
    market: marketId,
    ai: true,
    managerId: null,
    partner: seed.partner,
    sectors: seed.sectors,
    stages: seed.stages,
    check,
    minStars: seed.minStars,
    mood: 1,
    account,
    size,
    vintageMonth: m.month,
    feeRate: 0.02,
    carry: 0.2,
    distributed: 0,
    thesis: `${seed.sectors === 'any' ? 'Generalist' : seed.sectors.join(', ')} · ${seed.stages.join(', ')}`,
    stars: newStars(seed.minStars + 1.5),
  };
  world.funds[id] = fund;
  return fund;
}

/** Stable id for a depth fund, so adding them never shifts other ids (replays stay exact). */
export const extraFundId = (market: MarketId, name: string) =>
  `fund_${market}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/** Add the depth-scaled funds and angel networks a market is missing. */
export function seedExtraFunds(world: World, marketId: MarketId) {
  for (const seed of extraFunds(marketId)) {
    const id = extraFundId(marketId, seed.name);
    if (!world.funds[id]) createAiFund(world, marketId, seed, id);
  }
}

/**
 * Wave 10: a tech capital's extra funds and angel syndicates (stable ids,
 * names reserved). New markets get them when they open, saved worlds at the
 * next settlement.
 */
export function seedTechCapitalFunds(world: World, marketId: MarketId) {
  const names = (world.names[marketId] ??= {});
  for (const seed of TECH_CAPITAL_FUNDS[marketId] ?? []) {
    const id = extraFundId(marketId, seed.name);
    if (world.funds[id]) continue;
    createAiFund(world, marketId, seed, id);
    names[normaliseName(seed.name)] ??= 'ai';
  }
}

// ------------------------------------------------------------------ City art

const OFFICE_STYLES = ['loft', 'tower', 'garden', 'shophouse', 'glass'] as const;
const OFFICE_COLORS = [
  '#264653',
  '#2a9d8f',
  '#e9c46a',
  '#f4a261',
  '#e76f51',
  '#6d597a',
  '#355070',
  '#b56576',
  '#588157',
  '#3a86ff',
];

/** A fund's office in the city: deterministic from its id, so each looks different. */
export function fundOffice(fundId: Id) {
  const h = hashString(`office:${fundId}`);
  const style = OFFICE_STYLES[h % OFFICE_STYLES.length]!;
  const color = OFFICE_COLORS[(h >>> 8) % OFFICE_COLORS.length]!;
  const tall = style === 'tower' || style === 'glass';
  const floor = tall ? 5 + ((h >>> 16) % 30) : 1 + ((h >>> 16) % 4);
  return { style, color, floor };
}
