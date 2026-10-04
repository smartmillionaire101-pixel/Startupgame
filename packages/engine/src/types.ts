/**
 * World state. Plain JSON-serialisable data only (no classes, Maps or Dates)
 * so it can be snapshotted, diffed, sent to clients and replayed.
 *
 * Money fields are integer minor units in the currency of the owning account
 * (or of the market, for company-level settings).
 */
import type { Currency } from './money.js';
import type { MarketData, MarketId, Seniority, StaffRole } from './data/markets.js';
import type { Industry, SegmentKind, NeedWeights } from './data/industries.js';
import type { Role, Skills } from './data/characters.js';
import type { OutletType } from './data/fiction.js';
import type { Command } from './commands.js';
import type { LenderKind, LenderLook, LenderProductSeed } from './data/capital.js';

export type Id = string;

export const STAGES = ['pre-seed', 'seed', 'series-a', 'series-b', 'series-c'] as const;
export type Stage = (typeof STAGES)[number];

export const REVENUE_MODELS = [
  'subscription',
  'transaction',
  'usage',
  'marketplace',
  'one-off',
  'services',
] as const;
export type RevenueModel = (typeof REVENUE_MODELS)[number];

export type Incorporation = 'local' | 'uk' | 'us';
export type BuildMode = 'fast' | 'balanced' | 'quality';

// ---------------------------------------------------------------- Money

export interface TxRecord {
  month: number;
  amount: number;
  memo: string;
}

export interface Account {
  id: Id;
  currency: Currency;
  market: MarketId;
  balance: number;
  /** External accounts represent the outside world (AI customers, tax, LPs…) and may go negative. */
  external: boolean;
  /** Player bank holding this account (null/absent: the market's default AI bank). */
  bankId?: Id | null;
  /** Bank operating accounts may go negative down to this (lending out of deposits). */
  overdraftLimit?: number;
  label: string;
  recent: TxRecord[];
}

// ---------------------------------------------------------------- Reputation

export interface StarState {
  /** Public rating, 0–5, one decimal for display. */
  value: number;
  /** What real performance says the rating should be. */
  anchor: number;
  /** Positive coverage boost, fades over a few months. */
  good: number;
  /** Scandal penalty, fades slowly. */
  bad: number;
  history: number[];
}

// ---------------------------------------------------------------- Players

export interface PersonalLoan {
  id: Id;
  lender: string;
  lenderAccount: Id;
  lenderBankId: Id | null;
  /** Market whose bank lent the money (repayments go there). */
  market: MarketId;
  principal: number;
  outstanding: number;
  rateBps: number;
  monthlyPayment: number;
  monthsLeft: number;
  collateral: { companyId: Id; shares: number; label: string } | null;
  /** Consecutive missed payments; two in a row is a default. */
  missed: number;
  /** AI lender and product, when borrowed from a named lender (Wave 1). */
  lenderId?: Id;
  productId?: string;
}

export interface InvestorProfile {
  sectors: Industry[];
  stages: Stage[];
  /** Typical cheque in local minor units. */
  checkSize: number;
  lpCredibility: number;
  founderTrust: number;
  fundId?: Id;
}

export interface Player {
  id: Id;
  handle: string;
  name: string;
  ai: boolean;
  role: Role;
  backgroundId: string;
  market: MarketId;
  joinedAt: number;
  lastActiveAt: number;
  skills: Skills;
  network: number;
  stars: StarState;
  hours: { available: number; used: number };
  energy: number;
  burnout: boolean;
  lifestyleTier: number;
  accounts: { local: Id; usd?: Id };
  credit: { missedPayments: number; defaults: number; onTimePayments: number };
  /** Markets visited, with the home-market month of the last trip (§14). */
  visited: Partial<Record<MarketId, number>>;
  /** Personal loans from banks (§8). */
  loans: PersonalLoan[];
  companyIds: Id[];
  investor?: InvestorProfile;
  milestones: Record<string, number>;
  /** Trust score with each counterparty (−1..1), built only through real interactions. */
  trust: Record<Id, number>;
  inactivity: { warned: boolean; forSale: boolean };
  /** Personal monthly income/expense summary from the last settlement. */
  lastMonth: { income: number; spend: number; tax: number };
  /** Diligence depth unlocked per company (0–2). */
  diligence: Record<Id, number>;
  /** Last month this player pitched each outlet (story pitch limits, §10). */
  pitchedOutlets: Record<string, number>;
  /** Freelance gigs taken this month (the floor, §13). */
  gigsThisMonth: number;
  /** Has this player ever had a company fail? (for "first comeback"). */
  failures: number;
}

// ---------------------------------------------------------------- Companies

export interface Staff {
  id: Id;
  name: string;
  role: StaffRole;
  seniority: Seniority;
  /** Monthly gross salary. */
  salary: number;
  equityBps: number;
  morale: number;
  skill: number;
  personality: Personality;
  hiredMonth: number;
}

export type Personality = 'steady' | 'ambitious' | 'anxious' | 'maverick';

export interface Candidate {
  id: Id;
  name: string;
  role: StaffRole;
  seniority: Seniority;
  skill: number;
  /** Monthly salary expectation (local minor). */
  ask: number;
  /** 0 = all cash, 1 = loves equity. */
  equityPreference: number;
  /** Willingness to join an early-stage company. */
  riskAppetite: number;
  personality: Personality;
  competingOffers: number;
  /** Market month after which the candidate leaves the pool. */
  expiresMonth: number;
  /** Company that last countered or was declined, to make repeat offers cost more. */
  rejectedBy: Id[];
}

export interface SegmentPosition {
  awareness: number;
  paying: number;
  /** New paying customers last month. */
  won: number;
  churned: number;
  /** B2B deals in the pipeline: count due to close at month `due`. */
  pipeline: { due: number; count: number }[];
  /** Funnel numbers from the last settlement, for the dashboard. */
  funnel: { aware: number; interested: number; trial: number; paying: number; churned: number };
  /** Last month's new customers by channel (for the monthly story). Missing on old saves. */
  channels?: { marketing: number; outreach: number; wordOfMouth: number; pipeline: number };
  /** Main reason customers left last month. */
  churnCause?: ChurnCause;
}

export type ChurnCause = 'reliability' | 'price' | 'competition' | 'normal';

export interface MonthlyPnl {
  month: number;
  revenue: number;
  /** Revenue from other player companies, reported separately (§6 guardrails). */
  playerRevenue: number;
  /** Paid to player suppliers on the B2B marketplace. */
  suppliers: number;
  payroll: number;
  founderSalary: number;
  office: number;
  marketing: number;
  cloud: number;
  compliance: number;
  interest: number;
  tax: number;
  net: number;
  cashEnd: number;
  customers: number;
}

export interface Loan {
  id: Id;
  lender: string;
  /** Where repayments go: the AI bank's account or a player bank's account. */
  lenderAccount: Id;
  lenderBankId: Id | null;
  principal: number;
  outstanding: number;
  rateBps: number;
  monthlyPayment: number;
  monthsLeft: number;
  personalGuarantee: Id | null;
  /** AI lender and product, when borrowed from a named lender (Wave 1). */
  lenderId?: Id;
  productId?: string;
  /** Revenue-based finance: share of each month's revenue repaid until `outstanding` is cleared. */
  revenueShareBps?: number;
  /** Revenue-based finance: total repayable as a multiple of the advance (bps). */
  repayCapBps?: number;
}

export interface Holding {
  shares: number;
  kind: 'founder' | 'investor' | 'pool' | 'staff' | 'safe-converted';
}

export interface Safe {
  holderId: Id;
  amount: number;
  /** Post-money valuation cap. */
  cap: number;
  month: number;
}

export interface Preference {
  holderId: Id;
  invested: number;
  multiple: number;
  participating: boolean;
  shares: number;
  /** Later rounds have higher seniority (paid first). */
  seniority: number;
}

export interface CapTable {
  holdings: Record<Id, Holding>;
  safes: Safe[];
  preferences: Preference[];
  /** Price per share of the last priced round, local minor units (fractional allowed). */
  lastPrice: number;
  lastPostMoney: number;
  roundsRaised: number;
}

export type CompanyStatus = 'active' | 'shutdown' | 'acquired';

export interface Company {
  id: Id;
  name: string;
  handle: string;
  market: MarketId;
  industry: Industry;
  idea: string;
  revenueModel: RevenueModel;
  incorporation: Incorporation;
  founderIds: Id[];
  ai: boolean;
  status: CompanyStatus;
  foundedMonth: number;
  account: Id;
  stars: StarState;
  /** Last round closed, or null before any outside money. */
  lastRound: Stage | null;
  lastRaiseMonth: number | null;
  closedMonth: number | null;
  /** AI startups only: actively raising this month. */
  raising: boolean;
  /** Dollar-priced cost to serve one customer per month (cloud, processing), USD minor. */
  cogsUsdPerCustomer: number;
  /** Founder hours spent building this month (added to engineering output at settlement). */
  buildHours: number;
  /** Month of the last key-person departure (hurts fundraising for a while). */
  keyPersonLossMonth: number | null;
  product: {
    fit: number;
    quality: number;
    techDebt: number;
    buildMode: BuildMode;
    /** Customer discovery done per segment, 0–1. */
    discovery: Record<string, number>;
  };
  /** Price per customer per month, local minor units. */
  price: number;
  marketingBudget: number;
  founderSalary: number;
  targetSegments: string[];
  segments: Record<string, SegmentPosition>;
  staff: Staff[];
  capTable: CapTable;
  finance: {
    history: MonthlyPnl[];
    lossCarryForward: number;
    receivables: { due: number; amount: number }[];
    loans: Loan[];
    unpaidPayroll: number;
  };
  compliance: Record<string, boolean>;
  pivots: number;
  warnings: string[];
  /** Month when the company was last updated by a human decision. */
  lastDecisionMonth: number;
  forSale: boolean;
  /** No founders left (they relocated): an AI CEO runs it, competently but slower (§14). */
  aiCeo: boolean;
  /** Effects of this month's supply contracts (recomputed at settlement). */
  supply: SupplyEffectsState;
  supplyDisruptionMonth: number | null;
  /** B2B money this month, folded into the P&L at settlement. */
  ledgerThisMonth: { playerRevenue: number; supplierCost: number; flaggedRevenue: number };
  lastFlaggedRevenue: number;
  /** Consecutive months of mostly flagged revenue (anti-cheat, §18). */
  fraudStreak: number;
  bannedFromRaising: boolean;
  /** Non-founder board members (investors who negotiated a seat). */
  board: Id[];
  /** Holders with a veto on any sale. */
  vetoes: Id[];
  /** Parent company, when bought by another player company across markets. */
  parentId: Id | null;
  /** Founders removed by the board, with the month (evidence for the arbitrator). */
  removedFounders: Record<Id, number>;
  /** Why last month went the way it did (Wave 1). Missing on old saves = null. */
  story?: CompanyStory | null;
  /** Distress state for the rescue plan. Missing = null (not in distress). */
  distress?: Distress | null;
  /** Hibernation: staff furloughed on reduced pay, product frozen. Missing = null. */
  hibernation?: { since: number } | null;
  /** Office downsized to cut rent. Missing = false. */
  officeDownsized?: boolean;
  /** Snapshot at the end of last settlement, to explain what changed. Internal. */
  storyBase?: StoryBase | null;
}

export type StoryPlace = 'bank' | 'investors' | 'market' | 'hub' | 'office' | 'home' | 'airport';

export interface StoryAction {
  label: string;
  why: string;
  /** Where the UI should take the player. */
  place: StoryPlace;
  /** Optional one-tap action. */
  command?: Command;
}

export interface StoryItem {
  tone: 'good' | 'bad' | 'neutral';
  text: string;
  cause: string;
  metric?: 'revenue' | 'customers' | 'cash' | 'burn' | 'morale' | 'stars' | 'product';
  delta?: number;
}

export interface CompanyStory {
  month: number;
  headline: string;
  items: StoryItem[];
  next: StoryAction[];
}

export type DistressLevel = 'watch' | 'danger' | 'critical';

export interface Distress {
  level: DistressLevel;
  /** Whole months of cash left at today's spending. */
  monthsLeft: number;
  /** Market month the company entered distress. */
  since: number;
}

export interface StoryBase {
  month: number;
  price: number;
  marketingBudget: number;
  staffIds: Id[];
  output: number;
  morale: number;
}

export interface SupplyEffectsState {
  cogsMult: number;
  overheadMult: number;
  outputMult: number;
  reliabilityAdd: number;
  moraleAdd: number;
  skillAdd: number;
}

export interface Listing {
  id: Id;
  companyId: Id;
  market: MarketId;
  category: string;
  title: string;
  price: number;
  active: boolean;
  createdMonth: number;
  reviews: { sum: number; count: number };
}

export interface SupplyContract {
  id: Id;
  listingId: Id;
  buyerId: Id;
  sellerId: Id;
  market: MarketId;
  price: number;
  startMonth: number;
  endMonth: number;
  /** Guardrail flags: 'related-party', 'above-market'. */
  flags: string[];
  status: 'active' | 'ended' | 'cancelled';
  reviewed: boolean;
  /** The originally agreed end month (endMonth moves when a contract ends early). */
  plannedEndMonth: number;
  /** Company that cancelled early, if any (evidence for the arbitrator). */
  cancelledBy?: Id | null;
}

export interface Vote {
  id: Id;
  companyId: Id;
  market: MarketId;
  kind: 'sale' | 'raise' | 'remove-ceo';
  dealId: Id | null;
  /** For remove-ceo: the founder being removed. */
  targetId: Id | null;
  reason: string;
  /** Voting weight per holder: share fraction for sales, one per seat for the board. */
  weights: Record<Id, number>;
  /** Holders whose consent is required (vetoes on sale). */
  vetoHolders: Id[];
  ballots: Record<Id, 'yes' | 'no'>;
  status: 'open' | 'passed' | 'failed';
  createdMonth: number;
  deadlineMonth: number;
}

export interface Dispute {
  id: Id;
  market: MarketId;
  kind: 'supply-breach' | 'wrongful-removal';
  claimantId: Id;
  /** Contract id or company id the dispute is about. */
  refId: Id;
  filedMonth: number;
  status: 'open' | 'ruled';
  ruling: string | null;
  award: number;
}

export type BankType = 'commercial' | 'investment' | 'venture-debt' | 'microfinance';

/** A player-owned bank (§8). */
export interface Bank {
  id: Id;
  name: string;
  market: MarketId;
  type: BankType;
  ownerId: Id;
  status: 'applying' | 'licensed' | 'rejected' | 'failed';
  /** Operating account; may run negative down to the liquidity limit. */
  account: Id;
  appliedMonth: number;
  licensedMonth: number | null;
  /** The banker's share; AI shareholders hold the rest. */
  ownerShareBps: number;
  policy: { loanSpreadPp: number; depositRateBps: number; accountFee: number; salary: number };
  /** AI households, in aggregate (liability: deposits; asset: loans). */
  retail: { customers: number; deposits: number; loans: number };
  cbLoans: { outstanding: number; rateBps: number; dueMonth: number }[];
  /** Months the bank borrowed from the central bank (repeated borrowing triggers inspection). */
  cbBorrowMonths: number[];
  stars: StarState;
  reviews: { sum: number; count: number };
  lastMonth: {
    interestIncome: number;
    fees: number;
    depositInterest: number;
    opex: number;
    loanLosses: number;
    net: number;
  };
  thisMonth: { interest: number; fees: number; losses: number };
  /** Deals advised (investment banks' league table). */
  advised: number;
}

// ---------------------------------------------------------------- Investors & funds

export interface Fund {
  id: Id;
  name: string;
  market: MarketId;
  ai: boolean;
  managerId: Id | null;
  partner: string;
  sectors: Industry[] | 'any';
  stages: Stage[];
  /** Cheque range, local minor units. */
  check: [number, number];
  minStars: number;
  /** 0.5 (burned recently) – 1.5 (euphoric). */
  mood: number;
  account: Id;
  size: number;
  vintageMonth: number;
  /** Management fee per year, as a fraction. */
  feeRate: number;
  carry: number;
  /** Cash distributed from exits so far (player funds: LPs first, then carry). */
  distributed: number;
  thesis: string;
  stars: StarState;
}

/** Cost basis of an investor in a company, for marks, DPI and write-offs. */
export interface Position {
  investorId: Id;
  companyId: Id;
  invested: number;
  returned: number;
  month: number;
  writtenOff: boolean;
}

// ---------------------------------------------------------------- Deal cards

export interface InvestmentTerms {
  kind: 'investment';
  instrument: 'safe' | 'priced';
  stage: Stage;
  amount: number;
  /** Pre-money valuation for priced rounds; post-money cap for SAFEs. */
  valuation: number;
  liquidationMultiple: number;
  participating: boolean;
  proRata: boolean;
  boardSeat: boolean;
  vetoOnSale: boolean;
  /** Option pool top-up (bps of post-money) created before the round. */
  poolTopUpBps: number;
  /** A bridge SAFE offered to existing investors at a discount (rescue plan). */
  bridge?: boolean;
}

export interface CofounderTerms {
  kind: 'cofounder';
  title: 'CEO' | 'CTO' | 'COO';
  equityBps: number;
  vestingMonths: number;
  cliffMonths: number;
}

export interface LoanTerms {
  kind: 'loan';
  amount: number;
  rateBps: number;
  months: number;
  personalGuarantee: boolean;
  /** Product borrowed from a named AI lender. */
  productId?: string;
  /** Revenue-based products: share of monthly revenue repaid, and the total cap (bps of the advance). */
  revenueShareBps?: number;
  repayCapBps?: number;
}

export interface AcquisitionTerms {
  kind: 'acquisition';
  price: number;
  buyer: string;
  /** Set when the buyer is a player company (§12); absent for AI corporates. */
  buyerCompanyId?: Id;
  /** Retention packages for the target's founders, paid by the buyer. */
  retention?: number;
  /** Fair-value and related-party flags (§12). */
  flags?: string[];
  /** Investment bank advising the buyer; paid a fee on completion. */
  advisorBankId?: Id;
}

/** A bank lends to a person (§8 "Personal loans and credit profiles"). */
export interface PersonalLoanTerms {
  kind: 'personal-loan';
  amount: number;
  rateBps: number;
  months: number;
  /** Shares pledged as collateral; seized on default. */
  collateral: { companyId: Id; shares: number; label: string } | null;
  /** Product borrowed from a named AI lender. */
  productId?: string;
}

/** A supply contract on the B2B marketplace (§6). */
export interface SupplyTerms {
  kind: 'supply';
  listingId: Id;
  buyerId: Id;
  /** Price per month, local minor units. */
  price: number;
  months: number;
}

export type DealTerms =
  InvestmentTerms | CofounderTerms | LoanTerms | AcquisitionTerms | PersonalLoanTerms | SupplyTerms;

export interface PartyRef {
  /** 'bank' is the market's AI bank (id = market); 'playerbank' is a player-owned bank (id = bank id). */
  kind: 'player' | 'fund' | 'bank' | 'corporate' | 'company' | 'playerbank';
  id: Id;
  /** For 'bank': the named AI lender in that market (absent: the market's default bank). */
  lenderId?: Id;
}

export type DealStatus = 'open' | 'accepted' | 'declined' | 'expired' | 'withdrawn';

export interface DealCard {
  id: Id;
  market: MarketId;
  /** The company the deal is about; null for deals with a person (personal loans). */
  companyId: Id | null;
  proposer: PartyRef;
  counterparty: PartyRef;
  /** The party whose move it is. */
  awaiting: PartyRef;
  status: DealStatus;
  terms: DealTerms;
  /** Plain-language one-liner (§9 term sheets). */
  summary: string;
  history: {
    month: number;
    by: Id;
    action: 'propose' | 'counter' | 'accept' | 'decline' | 'expire' | 'withdraw';
    summary: string;
  }[];
  createdMonth: number;
  expiresMonth: number;
  /** A board or shareholder vote this deal is waiting on (§9). */
  pendingVoteId?: Id | null;
  /** For AI counterparties: the most they will concede (hidden from players in views). */
  aiLimit?: {
    minValuation?: number;
    maxValuation?: number;
    maxAmount?: number;
    /** AI lenders: a personal guarantee is a condition. */
    needsGuarantee?: boolean;
    /** AI lenders: the lowest rate they will take. */
    minRateBps?: number;
  };
}

// ---------------------------------------------------------------- Pitches

export interface PitchQuestion {
  id: string;
  text: string;
  options: {
    id: string;
    label: string;
    /** Claimed figure, checked in diligence. */ claim?: number;
    truth?: number;
    tone: 'honest' | 'spin' | 'vague';
  }[];
}

export interface Pitch {
  id: Id;
  companyId: Id;
  founderId: Id;
  fundId: Id | null;
  investorPlayerId: Id | null;
  slides: string[];
  status: 'questions' | 'partner-meeting' | 'passed' | 'term-sheet' | 'sent';
  questions: PitchQuestion[];
  answers: Record<string, string>;
  reason: string;
  month: number;
  dealId: Id | null;
  /** Amount the founder is raising, local minor units. */
  ask: number;
}

// ---------------------------------------------------------------- Media

export interface NewsItem {
  id: Id;
  market: MarketId;
  month: number;
  outletId: string;
  outletName: string;
  kind: 'feature' | 'raise' | 'public-record' | 'market' | 'milestone';
  /** Push alert, under 12 words. */
  alert: string;
  headline: string;
  /** Under 60 words. */
  body: string;
  starDelta: number;
  verified: boolean;
  subject: { kind: 'player' | 'company' | 'fund' | 'market'; id: Id };
  chart?: { label: string; values: number[] };
}

export type FactCheckResult = 'accurate' | 'slightly-off' | 'false' | 'future';

export interface MediaQuestion {
  id: string;
  text: string;
  metric: 'revenue' | 'customers' | 'growth' | 'team' | 'funding' | 'plan';
  options: { id: string; label: string; claim: number | null }[];
}

export interface MediaInvite {
  id: Id;
  playerId: Id;
  companyId: Id | null;
  market: MarketId;
  outletId: string;
  outletName: string;
  outletType: OutletType;
  reporter: string;
  /** 'pitched' when the player pitched the story. */
  origin: 'outreach' | 'pitched';
  status: 'invited' | 'angle' | 'questions' | 'preview' | 'published' | 'declined' | 'pulled';
  invite: string;
  angles: string[];
  angle: string | null;
  questions: MediaQuestion[];
  answers: Record<string, string>;
  checks: { questionId: string; result: FactCheckResult; claim: number | null; truth: number }[];
  draft: Omit<NewsItem, 'id'> | null;
  month: number;
}

// ---------------------------------------------------------------- Inbox

export interface InboxItem {
  id: Id;
  month: number;
  kind:
    | 'lead'
    | 'meeting'
    | 'reporter'
    | 'pitch'
    | 'warning'
    | 'deal'
    | 'system'
    | 'milestone'
    | 'staff';
  text: string;
  ref?: { kind: 'deal' | 'pitch' | 'media' | 'company' | 'candidate'; id: Id };
  read: boolean;
}

// ---------------------------------------------------------------- Markets

export interface SegmentState {
  key: string;
  industry: Industry;
  name: string;
  kind: SegmentKind;
  needs: NeedWeights;
  needsLabel: string;
  /** Total potential buyers (capped by real data). */
  buyers: number;
  /** Monthly budget per buyer, local minor units. */
  budget: number;
  switchingCost: number;
  trustThreshold: number;
  incumbentName: string;
  incumbentCustomers: number;
  incumbentScore: number;
  monthlyGrowth: number;
  salesCycle: [number, number];
}

export interface Outlet {
  id: string;
  name: string;
  type: OutletType;
  reporter: string;
}

export interface MarketState {
  id: MarketId;
  data: MarketData;
  /** Game months settled so far. */
  month: number;
  /** Local calendar date (YYYY-MM-DD) of the last settlement. */
  lastSettledDate: string | null;
  /** Current sector multiples (live, before country discount). */
  multiples: Record<Industry, number>;
  /** Funding climate index; 1 = normal. */
  climate: number;
  segments: Record<string, SegmentState>;
  talent: Candidate[];
  outlets: Outlet[];
  news: NewsItem[];
  /** The first high-street lender's name (kept for anything still reading it). */
  bankName: string;
  /** AI lenders and their products, seeded from data/capital.ts (Wave 1). */
  lenders: Record<Id, LenderState>;
  economicNote: string;
  /** Accounts that model the outside world in this market, keyed by purpose. */
  ext: Record<ExternalPurpose, Id>;
}

/** An AI lender in a market. All AI lenders lend from the market's external bank account. */
export interface LenderState {
  id: Id;
  name: string;
  kind: LenderKind;
  /** 0.5 tight … 1.5 loose; moves monthly with the funding climate. */
  appetite: number;
  /** Appetite in a normal climate. */
  baseAppetite: number;
  products: LenderProductSeed[];
  look: LenderLook;
}

export type ExternalPurpose =
  | 'genesis'
  | 'customers'
  | 'payroll'
  | 'suppliers'
  | 'tax'
  | 'lifestyle'
  | 'lps'
  | 'bank'
  | 'fx'
  | 'gigs';

// ---------------------------------------------------------------- World

export interface World {
  /** Bumped when the shape changes; `upgradeWorld` migrates older saves. */
  schemaVersion: number;
  seed: number;
  /** Increments with every applied command. */
  version: number;
  nextId: number;
  createdAt: number;
  /** Open markets only; more open in waves via `market.open`. */
  markets: Partial<Record<MarketId, MarketState>>;
  players: Record<Id, Player>;
  companies: Record<Id, Company>;
  funds: Record<Id, Fund>;
  accounts: Record<Id, Account>;
  positions: Record<string, Position>;
  deals: Record<Id, DealCard>;
  pitches: Record<Id, Pitch>;
  media: Record<Id, MediaInvite>;
  inbox: Record<Id, InboxItem[]>;
  /** Names/handles reserved per market (normalised), with the owner id. */
  names: Partial<Record<MarketId, Record<string, Id>>>;
  /** B2B marketplace (§6). */
  listings: Record<Id, Listing>;
  contracts: Record<Id, SupplyContract>;
  votes: Record<Id, Vote>;
  banks: Record<Id, Bank>;
  disputes: Record<Id, Dispute>;
  /** USD external accounts (dollar costs, dollar accounts). */
  usdExt: { fx: Id; suppliers: Id; genesis: Id };
}
