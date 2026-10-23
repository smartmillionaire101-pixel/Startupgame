/**
 * Banker work (player feedback, 23 October 2026: "Bankers have nothing to
 * do... while waiting for the central bank, what do I do in the meantime?
 * When I visit other banks or institutions there is no value"). Every number
 * and every line of the advisory desk and of the conversations at banks and
 * institutions, in one place (bankwork.ts runs them). Bankers note only.
 */

/** What a client asks a banker to do. */
export const MANDATE_KINDS = ['debt', 'bond', 'sale', 'ipo'] as const;
export type MandateKind = (typeof MANDATE_KINDS)[number];

/** A client's credit quality, read from its numbers. */
export type ClientBand = 'strong' | 'steady' | 'stretched';
/** How a client's business makes and uses cash. */
export type ClientShape = 'growth' | 'cash-flow' | 'asset-heavy' | 'seasonal';

export interface MandateSpec {
  label: string;
  /** One line: what the client wants. */
  blurb: string;
  /** Hours the work takes, spent when you hand it in. */
  hours: number;
  /** Success fee as a share of the deal. */
  feeRate: number;
  /** The decisions, in order (step ids in `STEPS`). */
  steps: readonly StepId[];
}

export const MANDATES: Record<MandateKind, MandateSpec> = {
  debt: {
    label: 'Raise debt',
    blurb: 'Structure a loan and find the lender who will say yes on good terms.',
    hours: 8,
    feeRate: 0.02,
    steps: ['structure', 'lender', 'size', 'covenants'],
  },
  bond: {
    label: 'Arrange a bond',
    blurb: 'Take a note to investors: tenor, coupon, who buys it and what secures it.',
    hours: 10,
    feeRate: 0.01,
    steps: ['tenor', 'coupon', 'investors', 'security'],
  },
  sale: {
    label: 'Sell the company',
    blurb: 'Run a sale: which buyers, at what price, paid how.',
    hours: 12,
    feeRate: 0.02,
    steps: ['buyers', 'price', 'consideration'],
  },
  ipo: {
    label: 'Pre-IPO readiness',
    blurb: 'Review whether the company is ready to list, and what it must fix first.',
    hours: 10,
    feeRate: 0.004,
    steps: ['board', 'accounts', 'timing', 'pricing'],
  },
};

export type StepId =
  | 'structure'
  | 'lender'
  | 'size'
  | 'covenants'
  | 'tenor'
  | 'coupon'
  | 'investors'
  | 'security'
  | 'buyers'
  | 'price'
  | 'consideration'
  | 'board'
  | 'accounts'
  | 'timing'
  | 'pricing';

export interface StepOption {
  id: string;
  label: string;
  /** Why this is (or isn't) the right call, shown after the deal. */
  why: string;
}

export interface StepSpec {
  /** The question the client puts to you. */
  question: string;
  /** The options (the lender step lists the city's lenders instead). */
  options: readonly StepOption[];
}

export const STEPS: Record<StepId, StepSpec> = {
  structure: {
    question: 'What kind of facility fits how this business makes cash?',
    options: [
      {
        id: 'term-loan',
        label: 'Term loan',
        why: 'Steady cash flow repays a fixed schedule at the cheapest rate.',
      },
      {
        id: 'revolver',
        label: 'Revolving credit facility',
        why: 'Seasonal businesses draw in the slow months and repay in the busy ones.',
      },
      {
        id: 'revenue-based',
        label: 'Revenue-based finance',
        why: 'A growing company repays a share of revenue, so payments flex with growth.',
      },
      {
        id: 'asset-finance',
        label: 'Asset finance',
        why: 'Vehicles, machines and stock secure the loan, so the lender charges less.',
      },
    ],
  },
  lender: {
    question: 'Which lender do you take it to?',
    options: [],
  },
  size: {
    question: 'How much should they borrow?',
    options: [
      {
        id: 'modest',
        label: 'Three months of revenue',
        why: 'A stretched borrower must keep repayments small: lenders will only say yes to a modest loan.',
      },
      {
        id: 'standard',
        label: 'Six months of revenue',
        why: 'Six months of revenue keeps debt service comfortable for most businesses.',
      },
      {
        id: 'stretch',
        label: 'Twelve months of revenue',
        why: 'Only a strong borrower can carry a year of revenue in debt without strain.',
      },
    ],
  },
  covenants: {
    question: 'What covenants will you negotiate?',
    options: [
      {
        id: 'light',
        label: 'Covenant-light',
        why: 'Strong borrowers can push back on covenants; weak ones can’t.',
      },
      {
        id: 'standard',
        label: 'Standard (leverage and interest cover)',
        why: 'Standard tests protect the lender without tripping a healthy borrower.',
      },
      {
        id: 'tight',
        label: 'Tight, with monthly reporting',
        why: 'A stretched borrower gets credit only by giving the lender tight control.',
      },
    ],
  },
  tenor: {
    question: 'How long should the bond run?',
    options: [
      {
        id: '2y',
        label: 'Two years',
        why: 'Investors lend a weaker issuer money only for a short time.',
      },
      {
        id: '5y',
        label: 'Five years',
        why: 'Five years is the market’s sweet spot: long enough to matter, short enough to price.',
      },
      {
        id: '10y',
        label: 'Ten years',
        why: 'Only the strongest issuers can lock in money for ten years at a fair price.',
      },
    ],
  },
  coupon: {
    question: 'Where do you price the coupon?',
    options: [
      {
        id: 'tight',
        label: 'Base rate + 2 points',
        why: 'A tight coupon saves a strong issuer money; on a weak one it goes unsold.',
      },
      {
        id: 'fair',
        label: 'Base rate + 4 points',
        why: 'A fair coupon clears the book without overpaying.',
      },
      {
        id: 'generous',
        label: 'Base rate + 7 points',
        why: 'A riskier issuer has to pay up, or the book doesn’t fill.',
      },
    ],
  },
  investors: {
    question: 'Who do you sell it to?',
    options: [
      {
        id: 'pension',
        label: 'Pension funds',
        why: 'Pension funds buy long, safe paper from strong issuers and hold it.',
      },
      {
        id: 'asset-managers',
        label: 'Asset managers',
        why: 'Asset managers take mid-grade credit at a fair price.',
      },
      {
        id: 'private-credit',
        label: 'Private credit funds',
        why: 'Private credit lends to stretched issuers, for a higher return.',
      },
    ],
  },
  security: {
    question: 'What secures the note?',
    options: [
      {
        id: 'unsecured',
        label: 'Unsecured',
        why: 'Strong issuers keep their assets free; weak ones can’t sell unsecured paper.',
      },
      {
        id: 'secured',
        label: 'Secured on assets',
        why: 'Security on assets brings the coupon down for a mid-grade issuer.',
      },
      {
        id: 'guaranteed',
        label: 'Guaranteed by a parent or a development bank',
        why: 'A guarantee is how a stretched issuer gets investors comfortable.',
      },
    ],
  },
  buyers: {
    question: 'Which buyers do you approach?',
    options: [
      {
        id: 'strategic',
        label: 'Strategic buyers in the sector',
        why: 'A strategic buyer pays for growth it can fold into its own business.',
      },
      {
        id: 'private-equity',
        label: 'Private equity',
        why: 'Private equity pays for steady cash flow it can borrow against.',
      },
      {
        id: 'auction',
        label: 'A broad auction',
        why: 'A stretched seller needs every bidder at the table to find a price.',
      },
    ],
  },
  price: {
    question: 'Where do you set the asking price?',
    options: [
      {
        id: 'below',
        label: 'Below fair value, for certainty',
        why: 'A seller under pressure trades price for a deal that closes.',
      },
      {
        id: 'fair',
        label: 'At fair value',
        why: 'A fair price holds buyers’ interest through diligence.',
      },
      {
        id: 'premium',
        label: 'A premium',
        why: 'Only a strong company with buyers circling can hold out for a premium.',
      },
    ],
  },
  consideration: {
    question: 'How should the buyer pay?',
    options: [
      {
        id: 'cash',
        label: 'All cash at closing',
        why: 'A strong seller can insist on cash and walk away clean.',
      },
      {
        id: 'earn-out',
        label: 'Cash plus an earn-out',
        why: 'An earn-out bridges a gap on price when the future is uncertain.',
      },
      {
        id: 'shares',
        label: 'Shares in the buyer',
        why: 'Shares keep a stretched seller in the upside when buyers are short of cash.',
      },
    ],
  },
  board: {
    question: 'What should the board look like at listing?',
    options: [
      {
        id: 'independent',
        label: 'Add two independent directors',
        why: 'Every exchange wants independent directors and an audit committee.',
      },
      {
        id: 'founder',
        label: 'Keep a founder-controlled board',
        why: 'Public investors discount a board that can’t say no to the founder.',
      },
      {
        id: 'dual-class',
        label: 'Dual-class shares for the founders',
        why: 'Dual-class shares put off index funds and many investors.',
      },
    ],
  },
  accounts: {
    question: 'What accounts will you put in the prospectus?',
    options: [
      {
        id: 'three-years',
        label: 'Three years of audited accounts',
        why: 'Listing rules ask for three years of audited accounts.',
      },
      {
        id: 'one-year',
        label: 'One audited year',
        why: 'One audited year isn’t enough for a main-market listing.',
      },
      {
        id: 'management',
        label: 'Management accounts',
        why: 'Unaudited numbers won’t get past the listing authority.',
      },
    ],
  },
  timing: {
    question: 'When should they list?',
    options: [
      {
        id: 'now',
        label: 'This quarter',
        why: 'A strong company should list while the window is open.',
      },
      {
        id: 'six-months',
        label: 'In six months, after a clean-up',
        why: 'Six months to fix the gaps turns a decent company into a good listing.',
      },
      {
        id: 'next-year',
        label: 'Next year, after a turnaround',
        why: 'A stretched company that lists now prices badly and trades worse.',
      },
    ],
  },
  pricing: {
    question: 'Where do you guide the price range?',
    options: [
      {
        id: 'below',
        label: 'Below fair value, for a first-day pop',
        why: 'A discount buys demand for a company the market doubts.',
      },
      {
        id: 'fair',
        label: 'At fair value',
        why: 'Pricing at fair value leaves a little on the table and keeps investors happy.',
      },
      {
        id: 'premium',
        label: 'At a premium',
        why: 'Only a company the market is excited about holds a premium range.',
      },
    ],
  },
};

/** How well each option fits a client: by band, then by shape where the step reads shape. */
type Fit = Partial<Record<ClientBand | ClientShape, number>>;

export const FIT: Partial<Record<StepId, Record<string, Fit>>> = {
  // Structure reads the client's shape.
  structure: {
    'term-loan': { 'cash-flow': 1, seasonal: 0.6, 'asset-heavy': 0.6, growth: 0.35 },
    revolver: { seasonal: 1, 'cash-flow': 0.6, growth: 0.6, 'asset-heavy': 0.35 },
    'revenue-based': { growth: 1, seasonal: 0.5, 'cash-flow': 0.35, 'asset-heavy': 0.3 },
    'asset-finance': { 'asset-heavy': 1, 'cash-flow': 0.6, seasonal: 0.4, growth: 0.3 },
  },
  size: {
    modest: { strong: 0.6, steady: 0.7, stretched: 1 },
    standard: { strong: 0.8, steady: 1, stretched: 0.5 },
    stretch: { strong: 1, steady: 0.5, stretched: 0.1 },
  },
  covenants: {
    light: { strong: 1, steady: 0.5, stretched: 0.2 },
    standard: { strong: 0.7, steady: 1, stretched: 0.6 },
    tight: { strong: 0.4, steady: 0.7, stretched: 1 },
  },
  tenor: {
    '2y': { strong: 0.6, steady: 0.8, stretched: 1 },
    '5y': { strong: 1, steady: 1, stretched: 0.5 },
    '10y': { strong: 0.8, steady: 0.4, stretched: 0.1 },
  },
  coupon: {
    tight: { strong: 1, steady: 0.4, stretched: 0.1 },
    fair: { strong: 0.6, steady: 1, stretched: 0.5 },
    generous: { strong: 0.3, steady: 0.6, stretched: 1 },
  },
  investors: {
    pension: { strong: 1, steady: 0.5, stretched: 0.1 },
    'asset-managers': { strong: 0.7, steady: 1, stretched: 0.4 },
    'private-credit': { strong: 0.4, steady: 0.7, stretched: 1 },
  },
  security: {
    unsecured: { strong: 1, steady: 0.5, stretched: 0.1 },
    secured: { strong: 0.7, steady: 1, stretched: 0.8 },
    guaranteed: { strong: 0.5, steady: 0.7, stretched: 1 },
  },
  // Buyers read the shape, unless the seller is stretched (then an auction).
  buyers: {
    strategic: { growth: 1, 'asset-heavy': 0.8, seasonal: 0.6, 'cash-flow': 0.6, stretched: 0.6 },
    'private-equity': {
      'cash-flow': 1,
      'asset-heavy': 0.8,
      seasonal: 0.8,
      growth: 0.4,
      stretched: 0.3,
    },
    auction: { growth: 0.7, 'cash-flow': 0.7, 'asset-heavy': 0.6, seasonal: 0.7, stretched: 1 },
  },
  price: {
    below: { strong: 0.4, steady: 0.6, stretched: 1 },
    fair: { strong: 0.8, steady: 1, stretched: 0.6 },
    premium: { strong: 1, steady: 0.5, stretched: 0.1 },
  },
  consideration: {
    cash: { strong: 1, steady: 0.8, stretched: 0.5 },
    'earn-out': { strong: 0.6, steady: 1, stretched: 0.8 },
    shares: { strong: 0.7, steady: 0.6, stretched: 1 },
  },
  board: {
    independent: { strong: 1, steady: 1, stretched: 1 },
    founder: { strong: 0.2, steady: 0.2, stretched: 0.2 },
    'dual-class': { strong: 0.6, steady: 0.4, stretched: 0.2 },
  },
  accounts: {
    'three-years': { strong: 1, steady: 1, stretched: 1 },
    'one-year': { strong: 0.4, steady: 0.4, stretched: 0.4 },
    management: { strong: 0.1, steady: 0.1, stretched: 0.1 },
  },
  timing: {
    now: { strong: 1, steady: 0.5, stretched: 0.1 },
    'six-months': { strong: 0.7, steady: 1, stretched: 0.5 },
    'next-year': { strong: 0.4, steady: 0.7, stretched: 1 },
  },
  pricing: {
    below: { strong: 0.4, steady: 0.6, stretched: 1 },
    fair: { strong: 0.8, steady: 1, stretched: 0.6 },
    premium: { strong: 1, steady: 0.5, stretched: 0.1 },
  },
};

/** How well each kind of lender fits a borrower's band (the lender step). */
export const LENDER_FIT: Record<string, Record<ClientBand, number>> = {
  'high-street': { strong: 1, steady: 0.7, stretched: 0.25 },
  challenger: { strong: 0.6, steady: 0.9, stretched: 0.5 },
  fintech: { strong: 0.4, steady: 0.7, stretched: 0.8 },
  development: { strong: 0.6, steady: 0.9, stretched: 0.7 },
  government: { strong: 0.5, steady: 0.8, stretched: 0.8 },
  microfinance: { strong: 0.3, steady: 0.5, stretched: 0.8 },
  /** Another banker's licensed bank. */
  player: { strong: 0.7, steady: 0.8, stretched: 0.6 },
  /** Your own bank: a conflict to disclose, so clients trust it a little less. */
  own: { strong: 0.6, steady: 0.7, stretched: 0.6 },
};

export const LENDER_WHY: Record<string, string> = {
  'high-street': 'High-street banks lend cheaply to strong borrowers and turn weak ones away.',
  challenger: 'Challenger banks move fast for mid-grade borrowers, at a slightly higher price.',
  fintech: 'Fintech lenders take more risk and price it in.',
  development: 'Development banks have SME windows for businesses commercial banks won’t touch.',
  government: 'State schemes back small businesses that can’t yet borrow commercially.',
  microfinance: 'Microfinance banks lend small amounts to small, riskier borrowers.',
  player: 'Another banker’s bank: a relationship lender that wants the business.',
  own: 'Your own bank: allowed, but you must disclose the conflict, and clients notice.',
};

/** The banker's advisory desk and the conversations: every number in one place. */
export const BANKWORK = {
  /** Mandates offered each month, and one more once you've closed this many. */
  offers: 3,
  offersBonusAfter: 3,
  /** Mandates you can hold at once, and close in a month. */
  maxActive: 3,
  perMonth: 4,
  /** Quality (0–1) a deal needs to close. */
  closeAt: 0.55,
  /** Fee multiplier: `feeBase + feeSlope × quality`. */
  feeBase: 0.6,
  feeSlope: 0.8,
  /** Fee floor and cap, in months of the city's cost of living. */
  minFeeCol: 1,
  maxFeeCol: 60,
  /** The smallest deal a mandate is about (months of cost of living). */
  minDealCol: 20,
  /** Reputation (stars) for an excellent deal (quality ≥ 0.8), a good one, and a lost one. */
  starsGreat: 0.15,
  starsGood: 0.06,
  starsLost: -0.08,
  /** Skill points per deal (finance and negotiation), up to the jobs' skill cap. */
  skill: 2,
  /** Track record entries kept. */
  recordKept: 12,
  /** Conversations: a month's total, and the hours each takes. */
  talksPerMonth: 8,
  talkHours: 2,
  /** Skill points from a lesson new to you. */
  lessonSkill: 2,
  /** Network from a conversation. */
  network: 1,
  /** Warmth of the contacts you make. */
  warmth: 0.35,
  /** Recruits you can keep in mind for later. */
  recruitsKept: 6,
  /** Clients waiting to bank with you. */
  clientsKept: 12,
  /** Clients met at the Chamber or the Founders’ Hub per conversation. */
  clientsPerTalk: 2,
  /** Interbank credit line: limit as a share of capital (floor in months of cost of living). */
  lineShare: 0.25,
  lineMinCol: 10,
  /** Spread over base: this much at 5 stars, plus `lineSpreadPerStar` per star below. */
  lineSpreadBps: 150,
  lineSpreadPerStar: 100,
  /** Listing your bank: months licensed, capital over the minimum, stars. */
  listing: { months: 12, capitalMultiple: 2, stars: 3.5 },
  /** Talks kept on the profile. */
  talksKept: 10,
} as const;

/** Who you can talk to, and where. */
export const TALK_TOPICS = [
  'ceo',
  'treasurer',
  'risk',
  'poach',
  'line',
  'supervisor',
  'standing',
  'owners',
  'founders',
  'listing',
] as const;
export type TalkTopic = (typeof TALK_TOPICS)[number];

export interface TalkSpec {
  label: string;
  /** Who you meet. */
  role: string;
  /** One line: what you get from it. */
  blurb: string;
}

export const TALKS: Record<TalkTopic, TalkSpec> = {
  ceo: {
    label: 'Meet the chief executive',
    role: 'Chief executive',
    blurb: 'How they run the bank: capital, branches, digital.',
  },
  treasurer: {
    label: 'Meet the treasurer',
    role: 'Treasurer',
    blurb: 'Deposits, liquidity and matching assets to liabilities.',
  },
  risk: {
    label: 'Meet the head of risk',
    role: 'Head of risk',
    blurb: 'Credit risk, provisions and anti-money-laundering.',
  },
  poach: {
    label: 'Sound out their staff',
    role: 'Staff member',
    blurb: 'Someone good who might join your bank later.',
  },
  line: {
    label: 'Arrange an interbank credit line',
    role: 'Treasurer',
    blurb: 'A standby facility your bank can draw when it runs short.',
  },
  supervisor: {
    label: 'Meet a bank supervisor',
    role: 'Bank supervisor',
    blurb: 'The current rules, the base rate and what’s changing.',
  },
  standing: {
    label: 'Check your bank’s standing',
    role: 'Bank supervisor',
    blurb: 'Where your bank stands with the regulator.',
  },
  owners: {
    label: 'Meet business owners',
    role: 'Business owner',
    blurb: 'Owners who could bank with you, and advisory leads.',
  },
  founders: {
    label: 'Meet founders',
    role: 'Founder',
    blurb: 'Founders who need a bank, and advisory leads.',
  },
  listing: {
    label: 'Talk to the listing desk',
    role: 'Head of listings',
    blurb: 'What your bank needs to list, or raise more capital.',
  },
};

/** What each kind of place offers a banker. */
export const PLACE_TALKS: Record<string, readonly TalkTopic[]> = {
  'central-bank': ['supervisor', 'standing'],
  chamber: ['owners'],
  'tech-hub': ['founders'],
  'stock-exchange': ['listing'],
};
/** At an AI bank. */
export const BANK_TALKS: readonly TalkTopic[] = ['ceo', 'treasurer', 'risk', 'poach', 'line'];

/** What a banking conversation is about. */
export type BankLessonTopic =
  | 'capital'
  | 'deposits'
  | 'credit'
  | 'alm'
  | 'aml'
  | 'digital'
  | 'branches'
  | 'liquidity'
  | 'rules'
  | 'listing';

export interface BankLesson {
  id: string;
  /** Who teaches it. */
  by: 'ceo' | 'treasurer' | 'risk' | 'supervisor' | 'listing';
  topic: BankLessonTopic;
  text: string;
  /** What to do with it. */
  tip: string;
}

export const BANK_LESSONS: readonly BankLesson[] = [
  {
    id: 'ceo-capital-buffer',
    by: 'ceo',
    topic: 'capital',
    text: 'We run at fifteen per cent capital when the rule is ten. The buffer is what lets us keep lending in a bad year.',
    tip: 'Keep your capital ratio well above the minimum, not on it.',
  },
  {
    id: 'ceo-branches',
    by: 'ceo',
    topic: 'branches',
    text: 'A branch costs as much as forty staff on the app. We keep branches where deposits are big and close the rest.',
    tip: 'Open a branch only where it brings in deposits it pays for.',
  },
  {
    id: 'ceo-digital',
    by: 'ceo',
    topic: 'digital',
    text: 'Our app opens an account in eight minutes. Half our new customers never visit a branch.',
    tip: 'Cheap digital onboarding wins small depositors at low cost.',
  },
  {
    id: 'ceo-cost-income',
    by: 'ceo',
    topic: 'capital',
    text: 'I watch one number: cost-to-income. Below fifty per cent we can price keenly and still grow capital.',
    tip: 'Keep running costs below half of what the bank earns.',
  },
  {
    id: 'ceo-dividends',
    by: 'ceo',
    topic: 'capital',
    text: 'We pay out a third of profits and keep the rest. Shareholders grumble; the regulator smiles.',
    tip: 'Retained profit is the cheapest capital a bank can get.',
  },
  {
    id: 'treasurer-deposit-pricing',
    by: 'treasurer',
    topic: 'deposits',
    text: 'We pay a quarter of the base rate on current accounts and more on fixed deposits. Pay too much and the margin is gone.',
    tip: 'Price deposits just high enough to win them; every point comes off your margin.',
  },
  {
    id: 'treasurer-alm',
    by: 'treasurer',
    topic: 'alm',
    text: 'Deposits can leave tomorrow; our loans run for years. I match the two so a bad week doesn’t sink us.',
    tip: 'Don’t lend long what depositors can take back short.',
  },
  {
    id: 'treasurer-liquidity',
    by: 'treasurer',
    topic: 'liquidity',
    text: 'I keep the reserve plus a cushion in cash, and a credit line with two other banks for the day it isn’t enough.',
    tip: 'Arrange standby funding before you need it, not during a run.',
  },
  {
    id: 'treasurer-concentration',
    by: 'treasurer',
    topic: 'deposits',
    text: 'No one depositor is more than five per cent of our book. One big account leaving can’t hurt us.',
    tip: 'Spread deposits across many customers.',
  },
  {
    id: 'treasurer-rate-moves',
    by: 'treasurer',
    topic: 'alm',
    text: 'When the base rate rises we reprice loans first and deposits slowly. When it falls, the reverse. That’s the margin.',
    tip: 'Watch the base rate: it moves your margin every month.',
  },
  {
    id: 'risk-provisions',
    by: 'risk',
    topic: 'credit',
    text: 'We provision for losses the day we lend, not the day the borrower stops paying.',
    tip: 'Price expected losses into the loan spread from day one.',
  },
  {
    id: 'risk-concentration',
    by: 'risk',
    topic: 'credit',
    text: 'No sector is more than a fifth of our loans. When one goes bad, the bank survives.',
    tip: 'Lend across sectors, not all into one.',
  },
  {
    id: 'risk-aml',
    by: 'risk',
    topic: 'aml',
    text: 'Know your customer: we check every new account against sanctions lists and ask where big deposits come from.',
    tip: 'A fine for money laundering can cost more than a year’s profit.',
  },
  {
    id: 'risk-collateral',
    by: 'risk',
    topic: 'credit',
    text: 'Collateral doesn’t make a bad loan good. We lend on cash flow and take security as a second way out.',
    tip: 'Ask how the loan gets repaid before asking what secures it.',
  },
  {
    id: 'risk-watchlist',
    by: 'risk',
    topic: 'credit',
    text: 'A borrower who pays late twice goes on our watchlist. Early calls save most of the money.',
    tip: 'Act on the first missed payment, not the third.',
  },
  {
    id: 'supervisor-capital-rule',
    by: 'supervisor',
    topic: 'rules',
    text: 'Capital must stay at least ten per cent of loans. Below three per cent we wind the bank down.',
    tip: 'Check your capital ratio every month; it is the first thing we read.',
  },
  {
    id: 'supervisor-reserves',
    by: 'supervisor',
    topic: 'rules',
    text: 'Ten per cent of deposits stays in reserve. The rest you may lend.',
    tip: 'Your lending room is deposits less the reserve, within your capital.',
  },
  {
    id: 'supervisor-lender-of-last-resort',
    by: 'supervisor',
    topic: 'liquidity',
    text: 'We lend to a bank that runs short, above base rate, against its loans. Three times in a year and we send inspectors.',
    tip: 'Borrow from us rarely; use an interbank line first.',
  },
  {
    id: 'supervisor-fit-proper',
    by: 'supervisor',
    topic: 'rules',
    text: 'We license people as much as banks: a clean credit record, real experience and a plan we can believe.',
    tip: 'A track record in advisory work counts in your favour.',
  },
  {
    id: 'supervisor-insurance',
    by: 'supervisor',
    topic: 'rules',
    text: 'Deposits are insured up to a limit. Above it, depositors lose money when a bank fails, and they know it.',
    tip: 'Big depositors watch your stars: keep them high.',
  },
  {
    id: 'listing-requirements',
    by: 'listing',
    topic: 'listing',
    text: 'To list, a bank needs a year of licensed trading, capital well above the minimum and a reputation investors trust.',
    tip: 'Build a year of clean results before you talk to the exchange.',
  },
  {
    id: 'listing-rights-issue',
    by: 'listing',
    topic: 'listing',
    text: 'A listed bank raises capital with a rights issue: existing shareholders buy first, at a discount.',
    tip: 'Listing gives your bank a way to raise capital when it grows.',
  },
];

export const bankLessonById = (id: string) => BANK_LESSONS.find((l) => l.id === id);

/** Names for the people you meet at banks (fictional). */
export const BANKER_NAMES = [
  'Adaeze Okafor',
  'Kwame Asante',
  'Wanjiru Kamau',
  'Thandiwe Nkosi',
  'Omar Haddad',
  'Fatima Bello',
  'Samuel Mensah',
  'Grace Achieng',
  'Yusuf Kargbo',
  'Claire Dubois',
  'Daniel Okoye',
  'Leila Mansour',
  'Peter Mwangi',
  'Aisha Diallo',
  'Hannah Clarke',
  'Jean-Paul Habimana',
  'Naledi Dlamini',
  'Mariam Farouk',
  'Tunde Bakare',
  'Esi Owusu',
] as const;

/** Roles a poached staff member could fill. */
export const RECRUIT_ROLES = [
  'Head of risk',
  'Treasurer',
  'Compliance officer',
  'Branch manager',
  'Relationship manager',
  'Head of digital',
] as const;

/**
 * Corporate clients outside the startup scene: the city's established
 * companies (fictional), so a new banker always has work. Monthly revenue in
 * months of the city's cost of living.
 */
export interface CorporateClient {
  name: string;
  sector: string;
  revenueCol: number;
  band: ClientBand;
  shape: ClientShape;
  kinds: readonly MandateKind[];
}

export const CORPORATES: readonly CorporateClient[] = [
  {
    name: 'Cold Chain Logistics',
    sector: 'Logistics',
    revenueCol: 60,
    band: 'steady',
    shape: 'asset-heavy',
    kinds: ['debt', 'bond'],
  },
  {
    name: 'Harvest Mills',
    sector: 'Food processing',
    revenueCol: 90,
    band: 'strong',
    shape: 'seasonal',
    kinds: ['debt', 'bond', 'ipo'],
  },
  {
    name: 'Sunline Solar',
    sector: 'Energy',
    revenueCol: 45,
    band: 'steady',
    shape: 'asset-heavy',
    kinds: ['bond', 'debt', 'sale'],
  },
  {
    name: 'Meridian Pharmacies',
    sector: 'Retail health',
    revenueCol: 70,
    band: 'strong',
    shape: 'cash-flow',
    kinds: ['debt', 'sale', 'ipo'],
  },
  {
    name: 'Crestline Builders',
    sector: 'Construction',
    revenueCol: 55,
    band: 'stretched',
    shape: 'asset-heavy',
    kinds: ['debt', 'sale'],
  },
  {
    name: 'Bluewave Telecom Towers',
    sector: 'Telecoms',
    revenueCol: 120,
    band: 'strong',
    shape: 'cash-flow',
    kinds: ['bond', 'ipo'],
  },
  {
    name: 'Palmgrove Hotels',
    sector: 'Hospitality',
    revenueCol: 40,
    band: 'stretched',
    shape: 'seasonal',
    kinds: ['debt', 'sale'],
  },
  {
    name: 'Northgate Packaging',
    sector: 'Manufacturing',
    revenueCol: 50,
    band: 'steady',
    shape: 'cash-flow',
    kinds: ['debt', 'sale', 'bond'],
  },
];
