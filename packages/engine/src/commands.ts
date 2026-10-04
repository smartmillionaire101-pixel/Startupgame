/**
 * Commands: the only way the world changes. Validated with Zod at the trust
 * boundary (server) and shared with the client for types. Each command plus
 * the world seed is enough to replay history exactly.
 */
import { z } from 'zod';
import { INDUSTRIES } from './data/industries.js';
import { MARKET_IDS, type MarketId } from './data/markets.js';
import { ROLES } from './data/characters.js';
import { EVENT_KINDS, EVENT_VENUES } from './data/events.js';
import { REVENUE_MODELS, STAGES } from './types.js';

const id = z.string().min(1).max(64);
const money = z.number().int().nonnegative().max(1e15);
const market = z.enum(MARKET_IDS);
const industry = z.enum(INDUSTRIES);
const answers = z.record(z.string().max(32), z.string().max(32));

export const companySetup = z.object({
  name: z.string().min(3).max(32),
  industry,
  revenueModel: z.enum(REVENUE_MODELS),
  idea: z.string().min(5).max(120),
  incorporation: z.enum(['local', 'uk', 'us']),
});

export const investorSetup = z.object({
  sectors: z.array(industry).min(1).max(INDUSTRIES.length),
  stages: z.array(z.enum(STAGES)).min(1).max(STAGES.length),
  checkSize: money,
});

export const commandSchema = z.discriminatedUnion('type', [
  // ---- system (server only)
  z.object({ type: z.literal('market.open'), market }),
  z.object({
    type: z.literal('market.settle'),
    market,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  z.object({
    type: z.literal('market.data'),
    market,
    unitsPerUsd: z.number().positive().optional(),
    baseRateBps: z.number().int().min(0).max(10_000).optional(),
    multiples: z.partialRecord(industry, z.number().positive().max(100)).optional(),
  }),
  z.object({ type: z.literal('player.anonymize'), playerId: id }),
  // ---- onboarding
  z.object({
    type: z.literal('player.create'),
    handle: z.string().min(3).max(20),
    name: z.string().min(1).max(40),
    role: z.enum(ROLES),
    backgroundId: z.string().max(32),
    market,
    company: companySetup.optional(),
    bank: z
      .object({
        name: z.string().min(3).max(32),
        bankType: z.enum(['commercial', 'investment', 'venture-debt', 'microfinance']),
      })
      .optional(),
    investor: investorSetup.optional(),
  }),
  // ---- founder
  z.object({
    type: z.literal('company.strategy'),
    companyId: id,
    price: money.optional(),
    marketingBudget: money.optional(),
    founderSalary: money.optional(),
    buildMode: z.enum(['fast', 'balanced', 'quality']).optional(),
    targetSegments: z.array(z.string().max(48)).min(1).max(2).optional(),
  }),
  z.object({ type: z.literal('company.discovery'), companyId: id, segmentKey: z.string().max(48) }),
  z.object({
    type: z.literal('company.build'),
    companyId: id,
    hours: z.number().int().min(10).max(160),
  }),
  z.object({
    type: z.literal('company.offer'),
    companyId: id,
    candidateId: id,
    salary: money,
    equityBps: z.number().int().min(0).max(500),
  }),
  z.object({
    type: z.literal('company.layoff'),
    companyId: id,
    staffId: id,
    generous: z.boolean(),
  }),
  z.object({ type: z.literal('company.raiseSalary'), companyId: id, staffId: id, salary: money }),
  z.object({ type: z.literal('company.comply'), companyId: id, ruleId: z.string().max(64) }),
  z.object({
    type: z.literal('company.pivot'),
    companyId: id,
    kind: z.enum(['customer', 'product', 'market', 'model']),
    segments: z.array(z.string().max(48)).min(1).max(2).optional(),
    industry: industry.optional(),
    revenueModel: z.enum(REVENUE_MODELS).optional(),
  }),
  z.object({ type: z.literal('company.shutdown'), companyId: id }),
  z.object({
    type: z.literal('company.loan'),
    companyId: id,
    bankId: id.optional(),
    /** A named AI lender and one of its products (Wave 1); both or neither. */
    lenderId: id.optional(),
    productId: id.optional(),
    amount: money,
    months: z.number().int().min(3).max(60),
    personalGuarantee: z.boolean(),
  }),
  z.object({ type: z.literal('company.found'), company: companySetup }),
  // ---- rescue plan (Wave 1)
  z.object({
    type: z.literal('company.cutCosts'),
    companyId: id,
    marketing: money.optional(),
    founderSalary: money.optional(),
    office: z.literal('downsize').optional(),
  }),
  z.object({ type: z.literal('company.hibernate'), companyId: id, on: z.boolean() }),
  z.object({ type: z.literal('company.bridge'), companyId: id, amount: money }),
  z.object({ type: z.literal('company.fireSale'), companyId: id }),
  z.object({
    type: z.literal('cofounder.invite'),
    companyId: id,
    playerId: id,
    title: z.enum(['CEO', 'CTO', 'COO']),
    equityBps: z.number().int().min(100).max(5000),
  }),
  z.object({
    type: z.literal('pitch.start'),
    companyId: id,
    fundId: id.optional(),
    investorId: id.optional(),
    slides: z.array(z.string().max(16)).min(1).max(5),
    ask: money,
  }),
  z.object({ type: z.literal('pitch.answer'), pitchId: id, answers }),
  z.object({ type: z.literal('pitch.partners'), pitchId: id }),
  // ---- deals
  z.object({
    type: z.literal('deal.act'),
    dealId: id,
    action: z.enum(['accept', 'decline', 'counter', 'withdraw']),
    terms: z
      .object({
        amount: money.optional(),
        valuation: money.optional(),
        price: money.optional(),
        equityBps: z.number().int().min(100).max(5000).optional(),
        months: z.number().int().min(3).max(60).optional(),
      })
      .optional(),
  }),
  // ---- investor
  z.object({
    type: z.literal('invest.propose'),
    companyId: id,
    instrument: z.enum(['safe', 'priced']),
    amount: money,
    valuation: money,
    proRata: z.boolean(),
    boardSeat: z.boolean(),
    vetoOnSale: z.boolean(),
    fromFund: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('invest.diligence'),
    companyId: id,
    depth: z.union([z.literal(1), z.literal(2)]),
  }),
  z.object({
    type: z.literal('fund.raise'),
    sectors: z.array(industry).min(1),
    stages: z.array(z.enum(STAGES)).min(1),
    checkSize: money,
    why: z.string().min(10).max(200),
  }),
  // ---- media
  z.object({ type: z.literal('media.accept'), inviteId: id, angle: z.string().max(40) }),
  z.object({ type: z.literal('media.decline'), inviteId: id }),
  z.object({ type: z.literal('media.answer'), inviteId: id, answers }),
  z.object({ type: z.literal('media.publish'), inviteId: id, insist: z.boolean() }),
  z.object({ type: z.literal('media.pull'), inviteId: id }),
  z.object({
    type: z.literal('media.pitch'),
    outletId: z.string().max(40),
    companyId: id.optional(),
  }),
  // ---- personal
  z.object({ type: z.literal('player.lifestyle'), tier: z.number().int().min(1).max(5) }),
  z.object({ type: z.literal('player.gig') }),
  z.object({
    type: z.literal('player.loan'),
    amount: money,
    months: z.number().int().min(3).max(60),
    collateralCompanyId: id.optional(),
    bankId: id.optional(),
    /** A named AI lender's founder product, e.g. a Start Up Loan (Wave 1). */
    lenderId: id.optional(),
    productId: id.optional(),
  }),
  z.object({ type: z.literal('player.travel'), market }),
  // ---- acquisitions, governance, arbitration (§9, §12)
  z.object({
    type: z.literal('acquire.propose'),
    buyerCompanyId: id,
    targetCompanyId: id,
    price: money,
    retention: money,
    advisorBankId: id.optional(),
  }),
  // ---- banks (§8)
  z.object({
    type: z.literal('bank.found'),
    name: z.string().min(3).max(32),
    bankType: z.enum(['commercial', 'investment', 'venture-debt', 'microfinance']),
    contribution: money,
  }),
  z.object({
    type: z.literal('bank.policy'),
    bankId: id,
    loanSpreadPp: z.number().min(0.5).max(30).optional(),
    depositRateBps: z.number().int().min(0).max(5000).optional(),
    accountFee: money.optional(),
    salary: money.optional(),
  }),
  z.object({ type: z.literal('bank.dividend'), bankId: id, amount: money }),
  z.object({ type: z.literal('bank.review'), bankId: id, rating: z.number().int().min(1).max(5) }),
  z.object({
    type: z.literal('account.move'),
    account: z.union([z.literal('personal'), z.literal('usd'), id]),
    bankId: id.nullable(),
  }),
  z.object({ type: z.literal('vote.cast'), voteId: id, ballot: z.enum(['yes', 'no']) }),
  z.object({ type: z.literal('governance.removeCeo'), companyId: id, founderId: id }),
  z.object({
    type: z.literal('dispute.file'),
    kind: z.enum(['supply-breach', 'wrongful-removal']),
    refId: id,
  }),
  // ---- B2B marketplace (§6)
  z.object({
    type: z.literal('listing.create'),
    companyId: id,
    title: z.string().min(3).max(60),
    price: money,
  }),
  z.object({
    type: z.literal('listing.update'),
    listingId: id,
    price: money.optional(),
    active: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('supply.propose'),
    buyerCompanyId: id,
    listingId: id,
    price: money,
    months: z.number().int().min(1).max(36),
  }),
  z.object({ type: z.literal('supply.cancel'), contractId: id }),
  z.object({
    type: z.literal('supply.review'),
    contractId: id,
    rating: z.number().int().min(1).max(5),
  }),
  z.object({
    type: z.literal('player.relocate'),
    market,
    handle: z.string().min(3).max(20).optional(),
  }),
  z.object({ type: z.literal('player.repay'), loanId: id, amount: money }),
  z.object({ type: z.literal('company.inject'), companyId: id, amount: money }),
  z.object({ type: z.literal('player.usdOpen') }),
  z.object({
    type: z.literal('player.convert'),
    direction: z.enum(['toUsd', 'toLocal']),
    amount: money,
  }),
  z.object({ type: z.literal('player.becomeInvestor'), investor: investorSetup }),
  // ---- city events (Wave 2)
  z.object({
    type: z.literal('event.host'),
    kind: z.enum(EVENT_KINDS),
    title: z.string().min(3).max(48),
    venue: z.enum(EVENT_VENUES),
    month: z.number().int().min(0).max(100_000).optional(),
    budget: money,
    ticket: money.optional(),
    segmentKey: z.string().max(48).optional(),
  }),
  z.object({ type: z.literal('event.rsvp'), eventId: id, going: z.boolean() }),
  z.object({ type: z.literal('event.cancel'), eventId: id }),
  z.object({ type: z.literal('inbox.read'), ids: z.array(id).max(100).optional() }),
]);

export type Command = z.infer<typeof commandSchema>;
export type CommandType = Command['type'];

/** Commands only the server itself may issue (never accepted from a client). */
export const SYSTEM_COMMANDS: ReadonlySet<CommandType> = new Set([
  'market.open',
  'market.settle',
  'market.data',
  'player.anonymize',
]);

export const isMarketId = (v: string): v is MarketId =>
  (MARKET_IDS as readonly string[]).includes(v);
