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
import type { EventKind, EventVenue } from './data/events.js';
import type { GrantCondition, InvestorType } from './data/programs.js';

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
  /** Wave 5: angel, VC, impact or corporate. Missing = angel (no fund) or VC (with a fund). */
  type?: InvestorType;
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
  /** People met at events (Wave 2), newest first. Missing on old saves = none. */
  contacts?: Contact[];
  /** Businesses pitched this month (Wave 3). Missing = none. */
  businessPitches?: { month: number; count: number };
  /** Where the player physically is (Wave 4). Missing = at home (`market`). */
  location?: { market: MarketId; since: number };
  /** Flights taken this (home) month (Wave 4). Missing = none. */
  flights?: { month: number; count: number };
  /** Bus and taxi rides taken this (home) month (Wave 4). Missing = none. */
  rides?: { month: number; count: number };
  /** AI angels only (Wave 3): the angel fund this person runs; set when they stop investing. */
  angel?: { fundId: Id; retiredMonth?: number };
  /** Wave 5: chosen at onboarding. Missing on old saves (the client keeps its avatar). */
  gender?: Gender;
  /** Wave 5: a part-time job at a local business in the home city. Missing = none. */
  job?: PlayerJob;
  /** Wave 5: furniture in your apartment, one item per slot. Missing = bare. */
  home?: { items: HomeItem[] };
  /** Wave 5: your car. Missing = none. */
  car?: PlayerCar;
  /** Wave 6: venue buys this month (seeds the "who you meet" roll). Missing = none. */
  venueBuys?: { month: number; count: number };
  /** Wave 7: needs, 0–100 each. New players start at 80; missing on old saves = 70. */
  needs?: { hunger: number; hygiene: number; fun: number; social: number };
  /** Wave 7: home acts (and 'invite') used per home month. Missing = none. */
  homeActs?: Record<string, { month: number; n: number }>;
  /** Wave 8: money sent to other players on one real (UTC) day, for the daily limit. Missing = none. */
  moneySent?: { day: number; total: number };
  /** Wave 8: tech events attended in a market month (`te:<market>:<month>:<n>` ids). Missing = none. */
  techEvents?: { month: number; ids: string[] };
  /** Wave 10: the property you live in (one you own). Missing = renting, as before. */
  residence?: { propertyId: Id; since: number };
}

// ---------------------------------------------------------------- Friends (Wave 8)

/** An invitation to visit a player's home: it lasts the host city's month it was sent in. */
export interface Visit {
  id: Id;
  hostId: Id;
  guestId: Id;
  /** The host's home city (where the home is). */
  market: MarketId;
  /** Host city month the invitation was sent (and, once accepted, the visit lasts). */
  month: number;
  status: 'pending' | 'accepted' | 'declined';
}

/** Going out together: a venue in a city, the people asked and the people who came. */
export interface Hangout {
  id: Id;
  market: MarketId;
  businessId: Id;
  hostId: Id;
  inviteeIds: Id[];
  memberIds: Id[];
  when: 'now' | 'tonight';
  /** City month planned (it is over when the month ends). */
  month: number;
  status: 'open' | 'cancelled';
}

export type Gender = 'female' | 'male';

export interface PlayerJob {
  businessId: Id;
  /** JobRole.role of the business's kind. */
  role: string;
  /** Home month the job started. */
  since: number;
}

export interface HomeItem {
  slot: string;
  itemId: string;
  /** What you paid (home currency, minor units): sell-back is a share of it. */
  paid: number;
}

export interface PlayerCar {
  modelId: string;
  paid: number;
  /** Home month it was bought. */
  since: number;
}

// ---------------------------------------------------------------- Events & contacts (Wave 2)

/**
 * Wave 6 adds 'local': a business owner (`biz:<businessId>`) or a regular
 * met around town (`npc:<market>:<n>`); the refId is that person id.
 */
export type ContactKind = 'fund' | 'founder' | 'talent' | 'customer' | 'player' | 'local';

export interface Contact {
  /** `${kind}:${refId}`: one contact per person (meeting again warms it). */
  id: Id;
  kind: ContactKind;
  /** Fund id, AI founder's player id, candidate id, segment key, or player id. */
  refId: Id;
  name: string;
  /** 0..1 at `month`; fades over time (see contactWarmth). */
  warmth: number;
  /** Market month of the last meeting. */
  month: number;
}

export interface EventOutcome {
  /** AI guests who came. */
  aiGuests: number;
  /** Human players present (host included). */
  humans: number;
  /** Share of seats filled, 0..1. */
  fill: number;
  summary: string;
  /** New or warmed contacts per human participant. */
  contacts: Record<Id, number>;
  /** Star change for the host. */
  hostStars: number;
  /** AI guests who came, by name (Wave 5). Missing on old saves. */
  aiNames?: { name: string; kind: ContactKind }[];
}

export interface CityEvent {
  id: Id;
  market: MarketId;
  hostId: Id;
  kind: EventKind;
  title: string;
  venue: EventVenue;
  /** Game month in which it is held (at that month's settlement). */
  month: number;
  capacity: number;
  /** Spent on top of the venue (food, speakers, promotion), local minor. */
  budget: number;
  /** Ticket per attendee, paid to the host, local minor. */
  ticket: number;
  segmentKey?: string;
  /** A local hotel or event venue hosting it (Wave 3): the venue fee goes to that business. */
  businessId?: Id;
  /** Human attendees (the host is not listed). */
  attendees: Id[];
  /** Spent on broadcasting it (Wave 5), local minor: more AI guests. Missing = 0. */
  broadcast?: number;
  status: 'upcoming' | 'held' | 'cancelled';
  createdMonth: number;
  outcome?: EventOutcome;
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
  /** Referred to this company at an event (Wave 2): keener to join it. */
  referredFor?: Id;
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
  /** Of revenue, what local businesses paid (Wave 3). Missing on old saves = 0. */
  businessRevenue?: number;
  /** Wave 10: branch takings (part of revenue) and branch running costs. Missing = none. */
  branches?: { revenue: number; opex: number };
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
  ledgerThisMonth: {
    playerRevenue: number;
    supplierCost: number;
    flaggedRevenue: number;
    /** Paid by local businesses this month (Wave 3). */
    businessRevenue?: number;
    /** Wave 10: branch takings and running costs this month (company currency). */
    branchRevenue?: number;
    branchCost?: number;
  };
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
  /** Local business customers won and lost since the last story (Wave 3). Internal. */
  businessNews?: BusinessNews | null;
  /** In (or graduated from) an accelerator (Wave 5). Missing = never joined one. */
  accelerator?: CompanyAccelerator | null;
}

/** A company's accelerator place (Wave 5). Months are the accelerator market's months. */
export interface CompanyAccelerator {
  acceleratorId: Id;
  market: MarketId;
  name: string;
  mentor: string;
  joinedMonth: number;
  /** Demo day is held at the settlement that reaches this month. */
  demoDayMonth: number;
  demoDayDone?: boolean;
}

export interface BusinessNews {
  won: { businessId: Id; name: string; monthly: number; how: 'pitch' | 'found' }[];
  lost: { businessId: Id; name: string; reason: string; monthly: number }[];
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
  /** AI angel funds (Wave 3): the AI angel player who runs it. `managerId` stays null (no human). */
  angelId?: Id;
  /** Wave 5: angel, VC, impact or corporate. Missing = derived (see fundInvestorType). */
  investorType?: InvestorType;
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
  ref?: {
    kind:
      | 'deal'
      | 'pitch'
      | 'media'
      | 'company'
      | 'candidate'
      /** Wave 8: a visit invitation, a hangout, a tech event, or a player (money sent). */
      | 'visit'
      | 'hangout'
      | 'techevent'
      | 'player';
    id: Id;
  };
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
  /**
   * Start (epoch ms) of the last clock period settled, or when the market
   * opened. Missing on saves from the day-based clock (see clock.ts).
   */
  settledAt?: number;
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
  /** Local businesses (Wave 3). Missing on old saves: seeded at the next settlement. */
  businesses?: Record<Id, LocalBusiness>;
  /** City economy totals (Wave 3). */
  economy?: EconomyStats;
  /**
   * Wave 6: human players who ever joined in this market (drives how many
   * businesses the city grows). Missing on old saves: counted from the players.
   */
  humansJoined?: number;
  /** Head of the central bank (Wave 5): the best human banker each quarter. Missing = the AI governor. */
  governor?: Governor;
  /** Wave 10: the city's property price index (1 = when the market opened) and last month's. */
  propertyIndex?: { value: number; prev: number; month: number };
}

export interface Governor {
  /** Null: the AI governor. */
  playerId: Id | null;
  name: string;
  bankId: Id | null;
  /** Market month appointed. */
  since: number;
}

/** Applications to accelerators, development partners and LPs (Wave 5). */
export type ApplicationKind = 'accelerator' | 'grant' | 'lp';

export interface CapitalApplication {
  /** Stable: `app:<kind>:<target>:<applicant>:<month>`. */
  id: Id;
  kind: ApplicationKind;
  /** The accelerator's, partner's or LP's market (decided at its settlement). */
  market: MarketId;
  playerId: Id;
  companyId: Id | null;
  fundId: Id | null;
  /** Accelerator, partner or LP id. */
  targetId: Id;
  programId?: string;
  /** Market month applied. */
  month: number;
  status: 'pending' | 'accepted' | 'rejected';
  reason: string;
  decidedMonth?: number;
  /** Cash received so far, in the receiving account's currency. */
  amount: number;
  /** Grants: two tranches; the second after a report. */
  grant?: {
    total: number;
    paid: number;
    reportMonth: number;
    condition: GrantCondition;
    reported?: 'met' | 'missed';
  };
  /** Pitched over a meal / met at their office. */
  warm?: boolean;
}

/** A local business run by an AI owner (Wave 3, data/businesses.ts). */
export interface LocalBusiness {
  id: Id;
  market: MarketId;
  name: string;
  kind: string;
  district: string;
  owner: { name: string };
  /** A real ledger account. */
  account: Id;
  /** Takings last month, local minor. */
  monthlyTakings: number;
  /** 0..1: drives growth and closure. */
  health: number;
  suppliers: { companyId: Id; sector: Industry; monthlyMinor: number; since: number }[];
  openedMonth: number;
  closedMonth?: number;
  /**
   * Index of its seed in the city roster; -1 for a generated business (Wave 6, see `gen`);
   * -2 for a landmark or a second site (Wave 10, also described by `gen`).
   */
  seed: number;
  /**
   * Wave 6: a business generated as the city grows (not from the roster).
   * Every roster lookup (`CITY_BUSINESSES[m.id][b.seed]`) falls back to this.
   */
  gen?: { name: string; kind: string; district: string; street: string | null; owner: string };
  /** Underlying monthly demand, local minor (takings before season and noise). */
  base: number;
  /** What the cost structure (staff, rent) is sized for, local minor; follows demand slowly. */
  costBase: number;
  /** The owner's rapport with each player (0..1), built by pitching, gigs and custom. */
  rapport: Record<Id, number>;
  /** Last month's figures. */
  lastMonth: { takings: number; costs: number; trade: number; profit: number };
  /** Wave 10: a second site opened by another business (its parent's id). */
  branchOf?: Id;
  /** Wave 10: a landmark venue (marina, golf club, ballroom, terminal, tech campus): its stable key. */
  landmark?: string;
}

export interface EconomyStats {
  /** Month the totals are for. */
  month: number;
  takings: number;
  /** Paid by businesses to startups. */
  trade: number;
  /** Gigs worked at businesses last month. */
  gigs: number;
  /** Gigs worked so far this month. */
  gigsNow: number;
  openings: number;
  closures: number;
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
  /** Durable admin counters. Older snapshots start tracking at their next command. */
  activity?: {
    since: number;
    at: number;
    sequence: number;
    totals: Record<string, { spent: number; sent: number; invested: number; capital: number }>;
    recent: {
      id: number;
      at: number;
      playerId: Id;
      kind: 'spent' | 'sent' | 'invested' | 'capital';
      currency: Currency;
      amount: number;
      memo: string;
    }[];
  };
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
  /** Ids of announcements already sent (system.announce), so each goes out once. */
  announcements?: string[];
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
  /** Player-hosted city events (Wave 2). Missing on old saves = none. */
  events?: Record<Id, CityEvent>;
  /** Accelerator, grant and LP applications (Wave 5). Missing on old saves = none. */
  applications?: Record<Id, CapitalApplication>;
  /** Wave 8: home visit invitations. Missing on old saves = none. */
  visits?: Record<Id, Visit>;
  /** Wave 8: hangouts. Missing on old saves = none. */
  hangouts?: Record<Id, Hangout>;
  /** Wave 10: every city's property market (listed and owned). Missing = seeded at the next settlement. */
  properties?: Record<Id, Property>;
  /** Wave 10: company branches in other neighbourhoods and cities. Missing = none. */
  branches?: Record<Id, Branch>;
  /** Wave 10: pitch competitions. Missing = none. */
  competitions?: Record<Id, Competition>;
}

// ---------------------------------------------------------------- Wave 10: a living economy

export const PROPERTY_TIERS = [
  'studio',
  'apartment',
  'townhouse',
  'villa',
  'mansion',
  'penthouse',
] as const;
export type PropertyTier = (typeof PROPERTY_TIERS)[number];

export interface Mortgage {
  /** The AI bank of the property's market lends (its external bank account). */
  lenderAccount: Id;
  lender: string;
  /** Local minor units of the property's market. */
  principal: number;
  outstanding: number;
  rateBps: number;
  monthlyPayment: number;
  monthsLeft: number;
  /** Missed payments in a row; three is repossession. */
  missed: number;
  startMonth: number;
}

/** A home on a city's property market (Wave 10). Prices in the market's local minor units. */
export interface Property {
  /** Stable: `prop-<market>-<n>`. */
  id: Id;
  market: MarketId;
  /** The real neighbourhood (Pacific Heights, Banana Island…). */
  neighbourhood: string;
  /** The city-plan district it sits in (for the map). */
  district: string;
  street: string;
  tier: PropertyTier;
  bedrooms: number;
  /** Price when the city index is 1. Current price = basePrice × index. */
  basePrice: number;
  /** Human owner, or null when it's on the market. */
  ownerId: Id | null;
  /** What the owner paid (local minor) and when (market month). */
  bought?: { price: number; month: number };
  rentedOut: boolean;
  mortgage?: Mortgage | null;
  /** Rent and running costs last month (local minor), for the portfolio. */
  lastMonth?: { month: number; rent: number; upkeep: number; mortgage: number; vacant: boolean };
}

/** A company's branch in another neighbourhood or city (Wave 10). */
export interface Branch {
  id: Id;
  companyId: Id;
  market: MarketId;
  district: string;
  /** Branch-market month it opened (and closed). */
  openedMonth: number;
  closedMonth?: number;
  status: 'open' | 'closed';
  /** Running costs a month, branch-market local minor units. */
  monthlyOpex: number;
  /** What opening it cost (branch-market local minor). */
  setupCost: number;
  lastMonth: { month: number; revenue: number; opex: number };
  closedReason?: string;
}

export interface CompetitionJudge {
  /** A player id (human judge) or `fund:<fundId>` (AI investor). */
  id: Id;
  kind: 'player' | 'ai';
  name: string;
  org: string;
  fundId: Id | null;
}

export interface CompetitionEntry {
  id: Id;
  companyId: Id;
  /** The founder who pitched (an AI founder for AI entrants). */
  founderId: Id;
  ai: boolean;
  /** Judge id → score 1–10. Hidden from other players until the result. */
  scores: Record<Id, number>;
  /** Average score after the result. */
  total?: number;
  rank?: number;
  prize?: number;
}

/** A pitch competition (Wave 10): enter this month, judged at the settlement. */
export interface Competition {
  /** Stable: `comp-<market>-<month>`. */
  id: Id;
  market: MarketId;
  /** Market month of the entry window (it is judged when that month settles). */
  month: number;
  name: string;
  sponsor: { name: string; kind: 'fund' | 'bank' | 'corporate' };
  venue: { businessId: Id | null; name: string; district: string };
  /** Local minor units, held in `account` (from the sponsor's side of the world). */
  prizePool: number;
  account: Id;
  judges: CompetitionJudge[];
  entries: CompetitionEntry[];
  status: 'open' | 'judged' | 'cancelled';
  winnerEntryId?: Id | null;
  /** Fund that wants to meet the winner (the investor interest). */
  interest?: { fundId: Id; name: string } | null;
}
