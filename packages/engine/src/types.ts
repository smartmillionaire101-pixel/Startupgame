import type { Appearance } from './appearance.js';
import type { Delivery, DateSession } from './living.js';
import type { PlayRoom } from './play.js';
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
import type { Role, Skill, Skills } from './data/characters.js';
import type { ProfessionId, WorkField } from './data/professions.js';
import type { OutletType } from './data/fiction.js';
import type { Command } from './commands.js';
import type { LenderKind, LenderLook, LenderProductSeed } from './data/capital.js';
import type { EventKind, EventVenue } from './data/events.js';
import type { ClientBand, ClientShape, MandateKind, TalkTopic } from './data/bankwork.js';
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

/** What a movement was, for statements and receipts (set by the code that moved the money). */
export type TxKind =
  | 'transfer'
  | 'purchase'
  | 'sale'
  | 'fee'
  | 'salary'
  | 'loan'
  | 'refund'
  | 'stake'
  | 'pot'
  | 'tax'
  | 'rent'
  | 'investment'
  | 'income'
  | 'exchange'
  | 'deposit'
  | 'other';

/** Currency conversion on a movement: `sent` in `from` became `received` in `to`. */
export interface TxFx {
  from: Currency;
  to: Currency;
  /** Official units of `to` per unit of `from` (before the fee). */
  rate: number;
  feeBps: number;
  sent: number;
  received: number;
}

/**
 * One line of an account's history. The fields after `memo` were added for
 * statements and receipts; older lines don't have them. The balance after
 * each line is not stored: it follows from the current balance, because every
 * movement is recorded and only the oldest lines are ever dropped.
 */
export interface TxRecord {
  month: number;
  /** Signed: money in is positive, money out negative. */
  amount: number;
  memo: string;
  /** Transaction number: every leg of one transaction (amount, fee, FX) shares it. */
  tx?: number;
  /** Wall-clock time (ms) of the command that moved it. */
  at?: number;
  /** The other party's account (the real one, not the FX desk in between). */
  peer?: Id;
  kind?: TxKind;
  /** The sender's note, on both sides of a transfer. */
  note?: string;
  /** This leg is a fee on the transaction. */
  fee?: boolean;
  fx?: TxFx;
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
  /** Lines of history kept (default 30); a player's own accounts keep a longer statement. */
  history?: number;
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

/** A hotel stay abroad, booked with a flight. `paid` is in home minor units. */
export interface HotelStay {
  tier: 'budget' | 'business' | 'luxury';
  name: string;
  paid: number;
  /**
   * Feedback round: the named hotel (data/hotels.ts), its district, stars and
   * the nights paid for. Missing = booked by tier, as before.
   */
  id?: string;
  district?: string;
  stars?: number;
  nights?: number;
}

/** More games (games.ts): a player's record at the lanes and in the air. */
export interface PlayerGames {
  bowling?: { games: number; best: number; last: number; strikes: number; month: number };
  /** Skydives and helicopter flights taken. */
  jumps: number;
  flights: number;
  /** The best jump's score (0–1100), and the last one. */
  bestJump: number;
  lastJump?: { score: number; miss: number; deployAt: number; style: number; month: number };
  /** A jump or flight paid for and not yet flown (its experience plays on the client). */
  booked: { id: Id; item: string; businessId: Id; month: number } | null;
}

export interface Player {
  garage?: PlayerCar[];
  flightTicket?: {
    from: MarketId;
    to: MarketId;
    paid: number;
    bookedAt: number;
    /** A hotel booked with the flight (amount in home minor units). Missing = none. */
    hotel?: HotelStay;
    /**
     * Holiday with friends: a host who paid for this trip (`amount` in this
     * player's home minor units). A cancelled ticket refunds them. Missing = you paid.
     */
    sponsor?: { playerId: Id; amount: number };
    /**
     * The flight as the client showed it when booking (cosmetic: airline,
     * flight number, departure time, gate). Holiday friends from the same
     * city are booked on the host's. Missing = derived by the client.
     */
    flight?: TicketFlight;
    /** Holiday with friends: booked on the host's flight for this holiday. */
    party?: { holidayId: Id };
    /** Business or first (investor release). Missing = economy, as every ticket was. */
    cabin?: 'business' | 'first';
    /**
     * First-class release (bankers note): the way home, booked and paid with
     * this ticket (`paid` in home minor units, charged as its own leg).
     * Missing = one way, as every ticket was.
     */
    return?: { cabin: 'economy' | 'business' | 'first'; paid: number };
    /** The flight home on a return ticket already paid for (cancelling keeps it). */
    prepaid?: true;
    /** Lounge acts done while holding this ticket (business and first). */
    lounge?: string[];
  };
  /**
   * First-class release: the last business or first flight, while its
   * in-flight acts (dine, sleep, watch, work…) can still be taken. Cleared by
   * the next booking. Missing = none.
   */
  lastFlight?: {
    cabin: 'business' | 'first';
    from: MarketId;
    to: MarketId;
    month: number;
    acts: string[];
  };
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
  location?: {
    market: MarketId;
    since: number;
    hotel?: HotelStay;
    /** First-class release: the return leg home, already paid (home minor units). */
    returnLeg?: { cabin: 'economy' | 'business' | 'first'; paid: number };
    /** First-class release: the cabin you flew out in (remembered for the way home). */
    cabin?: 'business' | 'first';
  };
  /** Flights taken this (home) month (Wave 4). Missing = none. */
  flights?: { month: number; count: number };
  /** Bus and taxi rides taken this (home) month (Wave 4). Missing = none. */
  rides?: { month: number; count: number };
  /** AI angels only (Wave 3): the angel fund this person runs; set when they stop investing. */
  angel?: { fundId: Id; retiredMonth?: number };
  /** Wave 5: chosen at onboarding. Missing on old saves (the client keeps its avatar). */
  gender?: Gender;
  /**
   * Phase 6a: the look picked in the character creator (appearance.ts).
   * Cosmetic. Missing = never chosen: drawn from `defaultAppearance`.
   */
  appearance?: Appearance;
  /** When `appearance` last changed (ms), so a device's unsaved look knows it's older. */
  appearanceAt?: number;
  /** Wave 5: a part-time job at a local business in the home city. Missing = none. */
  job?: PlayerJob;
  /** The jobs rework: experience per field and applications. Missing = seeded from the background. */
  work?: PlayerWork;
  /** Wave 5: furniture in your apartment, one item per slot. Missing = bare. */
  home?: { items: HomeItem[] };
  /** Shop note: walls and dividers you own (placed or in storage). Missing = none. */
  walls?: HomeWall[];
  /** Shop note: the names you gave the rooms of your home. Missing = none. */
  roomLabels?: RoomLabel[];
  /**
   * Buy mode (the feedback round): your rooms' floors ('0:living' → a floor
   * finish), your walls' paint, and the paid finishes you own. Missing = as built.
   */
  homeStyle?: { floors?: Record<string, string>; wall?: string; owned?: string[] };
  /** Wave 5: your car. Missing = none. */
  car?: PlayerCar;
  /** Wave 6: venue buys this month (seeds the "who you meet" roll). Missing = none. */
  venueBuys?: { month: number; count: number };
  /** Wave 7: needs, 0–100 each. New players start at 80; missing on old saves = 70. */
  needs?: { hunger: number; hygiene: number; fun: number; social: number };
  /** Wave 7: home acts (and 'invite') used per home month. Missing = none. */
  homeActs?: Record<string, { month: number; n: number }>;
  /**
   * Phase 3 life bars (lifebars.ts), 0–100 each. Humans created after the
   * release note start at 80 and 20; missing (older saves) = 75 and 25.
   */
  health?: number;
  stress?: number;
  /** Phase 3: stress added by work this home month (capped). Missing = none. */
  workStress?: { month: number; n: number };
  /** Phase 3: health gained from long walks this home month (capped). Missing = none. */
  walkHealth?: { month: number; n: number };
  /** Wave 8: money sent to other players on one real (UTC) day, for the daily limit. Missing = none. */
  moneySent?: { day: number; total: number };
  /** Wave 8: tech events attended in a market month (`te:<market>:<month>:<n>` ids). Missing = none. */
  techEvents?: { month: number; ids: string[] };
  /** Wave 10: the property you live in (one you own). Missing = renting, as before. */
  residence?: { propertyId: Id; since: number };
  /**
   * Founder journey: pinned and dismissed objective prompts (by kind: main,
   * opportunity, personal) and the month you chose to bootstrap. Missing = none.
   */
  journey?: {
    pinned?: Partial<Record<'main' | 'opportunity' | 'personal', string>>;
    dismissed?: Partial<Record<'main' | 'opportunity' | 'personal', string[]>>;
    bootstrap?: number;
  };
  /** Founder Journey 4a: decision events (only after the journey-events release note). */
  decisions?: PlayerDecisions;
  /**
   * Founder Journey 5 (§7.4): cash actually received from selling shares, the
   * gain over cost and the tax paid, in `currency`. Missing = nothing sold yet.
   */
  realised?: { currency: Currency; proceeds: number; gains: number; tax: number };
  /** Founder Journey 5, chapter 7: gifts, a career at a DFI or bank, a second company. */
  allocator?: PlayerAllocator;
  /** Investor career (investor blueprint §2–3): the ladder, invitations, first session. Missing = none. */
  career?: InvestorCareer;
  /**
   * Investor career Phase 4: as a limited partner. LP diligence done per fund
   * (home month), and the month a missed capital call's ban on new
   * commitments ends. Missing = none.
   */
  lp?: { diligence?: Record<Id, number>; banUntil?: number };
  /** Investor career Phase 8: the deal pipeline and watchlist, by company. Missing = none. */
  pipeline?: Record<Id, PipelineEntry>;
  /** Investor career Phase 8: the month you last supported each portfolio company. */
  support?: Record<Id, number>;
  /**
   * Investor deal flow (dealflow.ts): strategy lessons learned from AI
   * investors met at events, the latest conversations, and the AI LP
   * panel's last verdict on your fund pitch. Missing = none yet.
   */
  dealflow?: InvestorLearning;
  /**
   * Golf (leisure.ts): rounds played at a city's golf club, your best and
   * latest score against par, and rounds this month (for who you meet).
   * Missing = never played.
   */
  golf?: {
    rounds: number;
    best: number;
    last: { market: MarketId; strokes: number[]; par: number; month: number };
    month: number;
    thisMonth: number;
  };
  /** More games (games.ts): bowling, skydives and helicopter flights. Missing = never played. */
  games?: PlayerGames;
  /** The mall (leisure.ts): the phone you bought there (cosmetic). Missing = the one you came with. */
  phone?: { tier: 1 | 2 | 3; paid: number; month: number };
  /**
   * The bigger mall: things you bought there and keep (shoes, jewellery,
   * books …), newest last, and who gave it to you. Missing = none.
   */
  belongings?: { item: string; month: number; from?: Id }[];
  /**
   * Your wardrobe (wardrobe.ts): every wearable thing you bought or were
   * given at the mall (a top in each colour you picked), oldest first, to
   * put on again free. Missing = none (worlds before the investor release).
   */
  wardrobe?: { item: string; month: number; colour?: string; from?: Id }[];
  /** City places (places.ts): appointments, services used, visas and licences. Missing = none. */
  places?: PlayerPlaces;
  /**
   * Errands (errands.ts, feedback note): `<market>:<errand>` → the game day
   * (places.ts `gameMinute` / DAY_MIN, on that city's clock) it was last done.
   * Missing = never.
   */
  errands?: Record<string, number>;
  /** Bankers note: the banker's first session. */
  bankerTutorial?: BankerTutorial;
  /**
   * Banker work (bankwork.ts, bankers note): advisory mandates and the track
   * record, conversations at banks and institutions (lessons, recruits,
   * clients waiting to bank with you, an interbank credit line), and a
   * founder's requests for an adviser. Missing = none yet.
   */
  bankwork?: BankerWork;
}

/** A government appointment: the place (`<market>:<role>`) and its time on the game clock. */
export interface PlaceAppointment {
  placeId: string;
  market: MarketId;
  /** Game minute (places.ts `gameMinute`) the appointment starts. */
  at: number;
  /** Game minute it was booked. */
  bookedAt: number;
  /** Went in and used a service. */
  attended?: boolean;
}

/** What a player has done at the city's places (the city places release). */
export interface PlayerPlaces {
  /** Appointments, newest first (kept short). */
  appointments: PlaceAppointment[];
  /** Appointments ever booked (seeds the time drawn for the next). */
  booked: number;
  /** `<place>:<service>` (or `<place>:<service>:<company>`) → home month it was last used. */
  used: Record<string, number>;
  /** Business visas: destination → home month issued. */
  visas?: Partial<Record<MarketId, number>>;
}

// ---------------------------------------------------------------- Banker work (bankwork.ts)

/** Who an advisory mandate is for. */
export interface MandateClient {
  /** `c:<company>`, `b:<business>` or `k:<corporate index>`. */
  key: string;
  name: string;
  kind: 'company' | 'business' | 'corporate';
  /** The company or business id (null for a corporate). */
  refId: Id | null;
  sector: string;
  /** A human founder asked for this (their request id). */
  requestId?: string;
  requesterId?: Id;
}

/** An advisory mandate you hold (taken from the desk, not yet handed in). */
export interface AdvisoryMandate {
  /** `md:<month>:<client key>:<kind>` (or `rq:<request id>` for a founder's request). */
  id: string;
  kind: MandateKind;
  month: number;
  client: MandateClient;
  band: ClientBand;
  shape: ClientShape;
  /** Monthly revenue the deal is sized from, and what the business is worth (local minor). */
  revenue: number;
  value: number;
  /** Debt mandates: the lenders you can take it to. */
  lenders?: { id: string; name: string; kind: string }[];
}

/** A mandate handed in: how each call scored and what it paid. */
export interface AdvisoryDeal {
  id: string;
  kind: MandateKind;
  month: number;
  client: string;
  clientKind: MandateClient['kind'];
  quality: number;
  closed: boolean;
  dealValue: number;
  fee: number;
  /** Where the fee went. */
  paidTo: 'bank' | 'personal' | 'none';
  /** Each call; the lender step keeps the names (lenders are ids). */
  picks: {
    step: string;
    option: string;
    score: number;
    best: string;
    optionName?: string;
    bestName?: string;
    bestKind?: string;
  }[];
}

/** A conversation at a bank or an institution. */
export interface BankerTalk {
  at: string;
  where: string;
  topic: TalkTopic;
  person: string;
  month: number;
  lessonId: string | null;
  learned: boolean;
}

/** Someone good you met at another bank, who might join yours. */
export interface BankRecruit {
  id: string;
  name: string;
  role: string;
  from: string;
  skill: number;
  /** Monthly salary they'd want, local minor. */
  salary: number;
  month: number;
}

/** A business owner or founder who'll bank with you once you're licensed. */
export interface BankClientLead {
  key: string;
  name: string;
  kind: 'business' | 'company';
  refId: Id;
  wants: 'deposit' | 'loan';
  amount: number;
  month: number;
  /** Home month they joined your bank. */
  joined?: number;
}

/** A standby facility from an AI bank your bank can draw on. */
export interface InterbankLine {
  lenderId: Id;
  lender: string;
  market: MarketId;
  bankId: Id;
  limit: number;
  spreadBps: number;
  outstanding: number;
  /** Home month interest was last paid up to. */
  paidMonth: number;
  month: number;
}

/** A founder's request for an adviser. */
export interface AdvisoryRequest {
  id: string;
  companyId: Id;
  kind: MandateKind;
  month: number;
  status: 'open' | 'taken' | 'done' | 'withdrawn';
  bankerId?: Id;
}

export interface BankerWork {
  active: AdvisoryMandate[];
  /** Mandate ids taken (this month and last), so they leave the desk. */
  taken: string[];
  record: {
    deals: number;
    lost: number;
    fees: number;
    qualitySum: number;
    byKind: Partial<Record<MandateKind, number>>;
  };
  history: AdvisoryDeal[];
  lessons: string[];
  talks: BankerTalk[];
  /** `<at>:<topic>` → home month last held. */
  talked: Record<string, number>;
  talkMonth: { month: number; n: number };
  recruits: BankRecruit[];
  clients: BankClientLead[];
  /** Advisory leads from people you met: they come to your desk. */
  leads: {
    key: string;
    kind: MandateKind;
    month: number;
    /** A referral (FEEDBACK_NOTE): the client whose deal they heard about. */
    from?: string;
    /** Met at a city event (FEEDBACK_NOTE): its title. */
    at?: string;
  }[];
  line?: InterbankLine;
  /** The listing desk set you a goal. */
  objective?: { kind: 'list-bank'; month: number };
  /** As a founder: advisers you asked for. */
  requests?: AdvisoryRequest[];
}

// ---------------------------------------------------------------- Founder Journey 5: exits and the capital allocator

/** A company on its way to (or on) the stock market. */
export interface IpoState {
  status: 'preparing' | 'listed' | 'delisted';
  preparedMonth: number;
  /** Market month the bankers are done and `ipo.list` can go ahead. */
  readyMonth: number;
  bankerFee: number;
  listedMonth?: number;
  /** Price per share now and at the last settlement (local minor units, fractional). */
  price?: number;
  prevPrice?: number;
  /** The listing price, and the closing price at each settlement since (capped). */
  history?: number[];
  /** Pre-IPO holders who can't sell until this market month. */
  lockups?: Record<Id, number>;
  /** What each player paid for the shares they still hold (tax basis). */
  basis?: Record<Id, number>;
  /** New money the listing raised for the company. */
  raised?: number;
}

/** A founder's sale of existing shares (no new shares are issued). */
export interface SecondarySale {
  sellerId: Id;
  buyerId: Id;
  month: number;
  shares: number;
  /** Part of the seller's holding sold, in bps. */
  bps: number;
  price: number;
}

/** A secondary sale offered to a real player (or a player-run fund), waiting for them. */
export interface SecondaryOffer {
  id: Id;
  companyId: Id;
  market: MarketId;
  sellerId: Id;
  /** The player who decides, and the holder who gets the shares (the player, or their fund). */
  buyerId: Id;
  holderId: Id;
  bps: number;
  shares: number;
  price: number;
  status: 'open' | 'accepted' | 'declined' | 'expired';
  month: number;
  expiresMonth: number;
}

/** A mentor's monthly advice to a startup, for a small advisor grant. */
export interface Mentorship {
  id: Id;
  mentorId: Id;
  companyId: Id;
  grantBps: number;
  status: 'offered' | 'active' | 'declined' | 'ended';
  month: number;
  /** Months of advice given so far. */
  months: number;
  /** The metric the advice moved last (fit or quality). */
  lastBoost?: 'fit' | 'quality';
}

export interface Pledge {
  cause: string;
  amount: number;
  currency: Currency;
  month: number;
  market: MarketId;
  /** Measurable outcome, in the cause's units. */
  outcome: number;
}

export interface CareerRole {
  /** Investor career Phase 9 adds the sovereign fund. */
  orgKind: 'dfi' | 'bank' | 'sovereign';
  orgId: Id;
  orgName: string;
  title: string;
  market: MarketId;
  /** Gross monthly salary, the market's minor units. */
  salary: number;
  since: number;
  /** Market month of the last answered work decision. */
  decidedMonth?: number;
  /** Decisions answered, for the CV. */
  decisions?: number;
}

export interface PlayerAllocator {
  pledges?: Pledge[];
  career?: CareerRole | null;
  /** Market month you started a company again after an exit or a closure. */
  serial?: number;
}

// ---------------------------------------------------------------- the investor career

/** The investor first session (blueprint §3), step by step. */
export const INVESTOR_TUTORIAL_STEPS = [
  'profile',
  'investable',
  'shortlist',
  'first-call',
  'term-sheet',
  'portfolio',
  'ladder',
] as const;
export type InvestorTutorialStep = (typeof INVESTOR_TUTORIAL_STEPS)[number];

export interface InvestorTutorial {
  /** Home month it started. */
  startedMonth: number;
  /** Steps acknowledged by the player (the ones nothing else marks done). */
  seen: InvestorTutorialStep[];
  /** The startup picked from the café's three. */
  shortlist?: Id;
  /** The three startups shown at the café, picked when the tutorial began. */
  picks: Id[];
  doneMonth?: number;
  skipped?: boolean;
}

/** A qualified investor is invited up the ladder (blueprint §2.3, §10.3). */
export interface CareerInvitation {
  id: Id;
  rung: number;
  kind: 'co-lead' | 'anchor';
  /** The AI angel (co-lead) or LP (anchor) making the offer. */
  fromId: Id;
  fromName: string;
  /** Anchor: the commitment (local minor units of `currency`); co-lead: 0. */
  amount: number;
  currency: Currency;
  month: number;
  expiresMonth: number;
  status: 'open' | 'accepted' | 'declined' | 'expired';
}

export interface InvestorCareer {
  /** Rungs reached (1–8) with the home month each was reached. */
  reached: Partial<Record<number, number>>;
  invitations: CareerInvitation[];
  /** An accepted co-lead: this AI angel backs your next syndicate. */
  coLead?: { angelId: Id; name: string };
  /** An accepted anchor: this LP commits to your Fund I. */
  anchor?: { lpId: Id; name: string; amount: number; currency: Currency };
  tutorial?: InvestorTutorial;
  /** The rung pinned as the main objective (end of the first session). */
  pinned?: number;
}

/** A backer's allocation in a syndicate: a player, or an AI angel's fund. */
export interface SyndicateBacker {
  /** The human backer, or null for an AI angel. */
  playerId: Id | null;
  /** The AI angel's fund (AI backers only). */
  fundId?: Id;
  name: string;
  /** Allocation, in the syndicate's (company's) currency, minor units. */
  amount: number;
  /** Cash returned so far, after the lead's carry. */
  returned: number;
}

/**
 * A syndicate (SPV) led by an investor for one deal (blueprint §8.1,
 * Phase 3): the lead and backers pool money in the syndicate's own account,
 * which invests as one holder; exits pay backers pro rata after the lead's
 * deal-by-deal carry on profit.
 */
export interface Syndicate {
  id: Id;
  name: string;
  leadId: Id;
  companyId: Id;
  market: MarketId;
  account: Id;
  /** The lead's carry on backers' profits (0.15–0.2). */
  carry: number;
  /** The lead's own allocation. */
  leadAmount: number;
  /** What the lead wants to raise in total, lead included. */
  target: number;
  backers: SyndicateBacker[];
  /** The terms the syndicate will offer the company. */
  terms: { instrument: 'safe' | 'priced'; valuation: number; proRata: boolean; boardSeat: boolean };
  status: 'open' | 'offered' | 'closed' | 'exited' | 'failed' | 'cancelled';
  month: number;
  /** Market month the allocation closes (backers can join until then). */
  closesMonth: number;
  dealId?: Id;
  /** Amount invested in the company. */
  invested: number;
  /** Proceeds received from the company, and carry paid to the lead. */
  proceeds: number;
  carryPaid: number;
  /** The lead's returned share (their allocation, no carry on it). */
  leadReturned: number;
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

/**
 * Shopping together (malltrips.ts): one player takes another (a player who
 * says yes, or an AI friend who answers at once) to the mall in the city
 * they're both in, for the month. Gifts bought there are listed.
 */
export interface MallTrip {
  id: Id;
  host: Id;
  guest: Id;
  market: MarketId;
  /** The city's month: the outing lasts until it settles (or one of you leaves). */
  month: number;
  status: 'invited' | 'together' | 'declined' | 'ended';
  createdAt: number;
  gifts: { from: Id; to: Id; item: string; price: number }[];
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
  /** Holiday with friends: a thing to do together on this holiday (shared bonus on joining). */
  holidayId?: Id;
}

/** A flight as the airport board shows it (cosmetic, chosen by the client). */
export interface TicketFlight {
  airline?: string;
  /** "SV 123". */
  number?: string;
  /** Local departure time, "14:05". */
  time?: string;
  gate?: string;
}

/** Holiday with friends: one guest on a holiday and their answer. */
export interface HolidayGuest {
  /** A player id, or for an AI friend their chat id (`npc:<market>:<n>`, `biz:<id>`, an AI founder's id). */
  id: Id;
  status: 'pending' | 'accepted' | 'declined';
  /** The host pays this guest's flight and hotel. */
  hostPays: boolean;
  /** What the host paid for them (host home minor units), once accepted. */
  paid?: number;
  /**
   * An AI friend (one of the host's contacts): they answer at once. `answer`:
   * yes, only if you pay, or can't make it this month; `text` is their chat
   * reply. An AI friend who says yes is a travel companion (no ticket).
   */
  ai?: {
    name: string;
    kind: 'founder' | 'local';
    market: MarketId;
    gender: Gender;
    answer: 'yes' | 'pay' | 'busy';
    text: string;
  };
}

/**
 * Holiday with friends: a host's trip abroad and the friends invited on it.
 * It lasts the destination city's month it was planned in.
 */
export interface Holiday {
  id: Id;
  hostId: Id;
  /** The destination. */
  market: MarketId;
  /** Destination city month (the invitations expire when it ends). */
  month: number;
  /** The hotel tier the host booked; null = flight only. */
  tier: HotelStay['tier'] | null;
  /** Feedback round: the named hotel the host booked (friends book the same one). */
  hotelId?: string;
  guests: HolidayGuest[];
  createdAt: number;
  /** Things done together: the hangout, the venue and who came. */
  together?: { hangoutId: Id; businessId: Id; name: string; memberIds: Id[] }[];
  /**
   * Fly together: the host's flight out of `from` and everyone booked on it
   * (seat order: the host first, then each friend as they joined), in seats
   * side by side from row `row`. Missing = nobody shares the host's flight.
   */
  flight?: { from: MarketId; row: number; ids: Id[] };
  /**
   * Knocks on a friend's door in the hotel (`hotel.knock`): who knocked, on
   * whose door (`to`, their room), when, and whether it's still waiting or
   * was turned down. One per knocker: a new knock replaces their last one.
   */
  knocks?: HotelKnock[];
  /** A friend over in someone's room (`hotel.answer` accepted): the guest is in the host's room. */
  visit?: { host: Id; guest: Id; since: number };
  /** Pairs (`a|b`, sorted) who already had the visit bonus on this holiday. */
  visited?: string[];
}

export interface HotelKnock {
  from: Id;
  to: Id;
  at: number;
  /** The room knocked on (the friend's), if the holiday has a hotel. */
  room: number | null;
  status: 'pending' | 'declined';
}

export type Gender = 'female' | 'male';

export interface PlayerJob {
  businessId: Id;
  /** JobRole.role of the business's kind (a professional job: its ladder role). */
  role: string;
  /** Home month the job started. */
  since: number;
  /**
   * The jobs rework (work.ts): a professional job, paid from payroll. Missing
   * = a part-time job at a local business, as before.
   */
  profession?: ProfessionId;
  /** Professional jobs: the ladder level (1–4). */
  level?: number;
  /** Professional jobs: months worked at this level. */
  months?: number;
}

/** An application to a professional employer (work.ts). */
export interface JobApplication {
  id: Id;
  businessId: Id;
  profession: ProfessionId;
  level: number;
  /** Asking your own employer for the next level. */
  promotion?: boolean;
  status: 'booked' | 'hired' | 'rejected' | 'expired';
  /** Home month you applied. */
  appliedMonth: number;
  /** Last home month you can go to the interview. */
  expiresMonth: number;
  decidedMonth?: number;
  /** The interview score (0–1) and the bar it had to clear. */
  score?: number;
  /** Why: plain English, plus the parts a client needs to say it in its own words. */
  reason?: string;
  why?: JobWhy;
  /** FEEDBACK_NOTE: the interview by level, step by step (work.ts). Missing = an old interview. */
  review?: JobReview;
}

/** FEEDBACK_NOTE: how a levelled interview went (data/interviews.ts holds the words). */
export interface JobReview {
  /** Your score and the pass mark, 0–100. */
  score: number;
  passMark: number;
  /** Points the brief you studied added, and how many times you studied it. */
  bonus: number;
  studied: number;
  /** One per step, in the order answered. */
  steps: { id: string; choice: number; best: number }[];
  /** The hard checks you didn't meet (months, skill, time in the role). */
  checks: JobWhy[];
  /** Brief concepts to re-read: the ones behind the answers that let you down. */
  study: string[];
}

export type JobWhy =
  | { code: 'months'; field: WorkField; need: number; have: number }
  | { code: 'skill'; skill: Skill; need: number; have: number }
  | { code: 'tenure'; need: number; have: number }
  | { code: 'interview'; score: number; need: number; question: string }
  | { code: 'hired'; role: string; label: string; strong?: boolean }
  | { code: 'expired' };

/** The jobs rework: experience, applications and cooldowns. Missing = seeded from the background. */
export interface PlayerWork {
  /** Months of experience per field. */
  exp: Partial<Record<WorkField, number>>;
  /** Newest first (the last few). */
  applications: JobApplication[];
  /** Employer business id → the home month you can apply there again. */
  cooldown?: Record<Id, number>;
  /** How well you're doing in your professional job, 0–1. Missing = 0.5. */
  perf?: number;
  /** FEEDBACK_NOTE (jobtasks.ts): this month's work tasks and your strikes. Missing = none. */
  tasks?: JobTasks;
  /** FEEDBACK_NOTE: jobs you were let go from, newest first. Missing = none. */
  record?: JobRecord[];
  /** FEEDBACK_NOTE: interview briefs studied, `profession:level` → times (capped). Missing = none. */
  study?: Record<string, number>;
}

/** On-the-job tasks (jobtasks.ts): the month's queue at your employer. */
export interface JobTasks {
  /** The employer they come from (a new employer starts a clean sheet). */
  businessId: Id;
  /** Home month they were handed out. */
  month: number;
  /** Task ids (data/job-tasks.ts), in the order they come. */
  ids: string[];
  /** One per task done (answered or missed), in order. */
  results: JobTaskResult[];
  /** 1: manager warning, 2: final warning, 3: let go. */
  strikes: number;
}

export interface JobTaskResult {
  id: string;
  /** Your option, or null: the month ended before you answered. */
  choice: number | null;
  best: number;
  right: boolean;
  /** The performance change (0–1 scale). */
  delta: number;
  month: number;
}

export interface JobRecord {
  month: number;
  businessId: Id;
  employer: string;
  profession: ProfessionId;
  /** The role's label when you left. */
  label: string;
  reason: 'performance';
  /** Notice pay before tax (minor units). */
  notice: number;
}

export interface HomeItem {
  slot: string;
  itemId: string;
  /** What you paid (home currency, minor units): sell-back is a share of it. */
  paid: number;
  /** Shop note: the finish or warranty picked in the catalogue (option id). Missing = the default. */
  finish?: string;
  warranty?: string;
}

export interface PlayerCar {
  modelId: string;
  paid: number;
  /** Home month it was bought. */
  since: number;
  /** Shop note: the paint and trim picked in the catalogue (option ids). Missing = the default. */
  paint?: string;
  trim?: string;
}

/**
 * Shop note: a wall or divider you own (data/catalog.ts WALLS). Placed when
 * `x` is set: on floor `floor`, along the tile edge at (x, y) for `len` tiles,
 * 'h' running along x (between rows y-1 and y), 'v' along y (between columns
 * x-1 and x), like the floor plan's own walls. Unplaced = in storage.
 */
export interface HomeWall {
  id: Id;
  kind: 'full' | 'half' | 'glass' | 'sliding' | 'bookshelf';
  len: number;
  finish: string;
  paid: number;
  floor?: number;
  x?: number;
  y?: number;
  dir?: 'h' | 'v';
}

/** Shop note: a name you gave a room, at a tile on a floor of your home. */
export interface RoomLabel {
  floor: number;
  x: number;
  y: number;
  label: string;
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
  /** Culture fit 0–1 (hired through the pipeline, §6.4). Missing = unknown: no effect. */
  fit?: number;
  /** Workload, % of a full load (100 = full). Missing = not tracked: no effect on morale. */
  workload?: number;
  /** An AI co-founder (§2.1 chapter 2): founder shares with a vesting record. */
  cofounder?: AiCofounderRecord;
}

/** The vesting record of an AI co-founder's founder shares. */
export interface AiCofounderRecord {
  profile: AiCofounderProfileId;
  title: 'CTO' | 'CEO' | 'Growth';
  equityBps: number;
  vestingMonths: number;
  cliffMonths: number;
  /** Company-market month they joined. */
  since: number;
}

export type AiCofounderProfileId = 'cto' | 'operator' | 'growth';

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
  /** Discount on the next round's price (Friends & Family SAFEs). Missing = none. */
  discountPct?: number;
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

/**
 * An established company of a city's exchange (established.ts, feedback
 * note): run by the game from this profile, not by a founder.
 */
export interface EstablishedProfile {
  kind: 'blue-chip' | 'steady' | 'grower' | 'turnaround' | 'small';
  /** Its place in the city's roster (fixes its id). */
  slot: number;
  /** Mean monthly sales growth, net profit margin and monthly swing (0–1 shares). */
  growth: number;
  margin: number;
  swing: number;
  employees: number;
}

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
    /** Founder Journey 6: a first customer's up-front payment, already in the account. */
    upfrontRevenue?: number;
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
  /** An established listed company run by the game (feedback note). Missing = a startup. */
  established?: EstablishedProfile;
  /** Founder Journey 2a: the per-deal sales pipeline (only once `sales.*` is used). */
  deals?: SalesDeal[];
  /** Customers won through the pipeline, billed monthly on B2B terms. */
  salesAccounts?: SalesAccount[];
  /** Next deal number (per company, so ids never touch the world counter). */
  salesSeq?: number;
  /**
   * Founder Journey 6: the starting idea picked at the café (data/ideas.ts),
   * with the founder's fit when it was founded. Missing = founded the old way:
   * no idea effects. `paid`: the first pipeline customer's up-front payment.
   */
  starterIdea?: { id: string; fit: number; paid?: { month: number; amount: number } };
  /** Founder Journey 6: small one-off business expenses paid (newest last, a few kept). */
  expenses?: { item: string; month: number; amount: number }[];
  /** Prospecting done this month (limited by founder hours and sales staff). */
  salesProspects?: { month: number; count: number };
  /** Customer interviews at the Market (feedback note, interviews.ts). Missing = never interviewed. */
  interviews?: CompanyInterviews;
  /** In (or graduated from) an accelerator (Wave 5). Missing = never joined one. */
  accelerator?: CompanyAccelerator | null;
  /** The product roadmap (§6.3). Missing = never opened: product work runs as before. */
  roadmap?: Roadmap | null;
  /** The hiring pipeline (§6.4). Missing = never used: hiring runs as before. */
  hiring?: Hiring | null;
  /** Business reserve account (§7.2): set aside, not counted as available cash. Missing = none. */
  reserve?: Id;
  /** Founder loans to the company (§7.3), outstanding per founder. A liability, never revenue. */
  founderLoans?: Record<Id, number>;
  /** Money each founder put in as equity (§7.3), for the books. */
  founderEquity?: Record<Id, number>;
  /** Founder Journey 4a: a response to rivals holds until this market month (no rival pressure). */
  rivalEdge?: { until: number; kind: 'product' | 'partner' };
  /** Founder Journey 5: the IPO path. Missing = private, never prepared. */
  ipo?: IpoState;
  /** Founder Journey 5: secondary sales of founders' shares. Missing = none. */
  secondaries?: SecondarySale[];
  /**
   * Founder setup (setup.ts, feedback note): register, fund, plan and lease
   * an office before the company starts spending. Missing = founded the old way.
   */
  setup?: FounderSetup;
}

export type InterviewStyle = 'technical' | 'culture' | 'work_trial';
export type SalaryBand = 'lean' | 'market' | 'generous';
export type CandidateValues = 'mission' | 'money' | 'craft' | 'stability';
export type WorkStyle = 'independent' | 'collaborative' | 'structured' | 'fast';

/** An open role (a job post). `hr<n>`, numbered per company. */
export interface HireRole {
  id: Id;
  role: StaffRole;
  seniority: Seniority | null;
  band: SalaryBand;
  openedMonth: number;
  status: 'open' | 'filled' | 'closed';
  /** Times candidates were sourced for it. */
  sourced: number;
  postingCost: number;
}

/** A candidate sourced for a role: a talent-pool candidate plus a CV and hidden traits. */
export interface PipelineCandidate extends Candidate {
  roleId: Id;
  /** The skill their CV claims (the true skill is `skill`, hidden until interviewed). */
  cvSkill: number;
  /** Hidden culture fit, 0–1. */
  fit: number;
  values: CandidateValues;
  workStyle: WorkStyle;
  sourcedMonth: number;
  /** Last month to make an offer; after it they take another job. */
  deadline: number;
  interviews: InterviewStyle[];
  status: 'open' | 'hired' | 'withdrawn' | 'declined';
}

export interface Hiring {
  roles: HireRole[];
  candidates: PipelineCandidate[];
  nextId: number;
}

/** One friend's (or AI angel's) commitment to a Friends & Family round, held in escrow. */
export interface FriendsCommitment {
  /** A player id, or an AI angel's fund id (the SAFE holder). */
  holderId: Id;
  name: string;
  ai: boolean;
  /** Company-currency amount in escrow. */
  amount: number;
  /** Where it came from (refunds go back here). */
  fromAccount: Id;
  month: number;
}

/** A Friends & Family round (chapter 3): SAFE terms, commitments in escrow, then close. */
export interface FriendsRound {
  id: Id;
  companyId: Id;
  founderId: Id;
  market: MarketId;
  target: number;
  valuationCap: number;
  discountPct: number;
  status: 'open' | 'closed' | 'cancelled';
  openedMonth: number;
  closedMonth?: number;
  /** Escrow account holding commitments until close. */
  escrow: Id;
  commitments: FriendsCommitment[];
  /** Months the founder asked AI angels (once per month). */
  aiAskedMonths?: number[];
}

/** A feature on the roadmap (§6.3): planned → in progress → released. */
export interface ProductProject {
  /** `rp<n>`, numbered per company (the world's id counter is left alone). */
  id: Id;
  featureId: string;
  status: 'planned' | 'in_progress' | 'released';
  /** Person-weeks done so far (the feature's effort is in the catalogue). */
  progress: number;
  addedMonth: number;
  startedMonth?: number;
  releasedMonth?: number;
  /** Person-weeks paid for from contractors, delivered at the next settlement. */
  contractorWeeks?: number;
  /** Contractors worked on it (a little more tech debt on release). */
  contracted?: boolean;
  /** Bugs it shipped with, and the tech debt it added (set on release). */
  defects?: number;
  debtAdded?: number;
}

/** Customer feedback for the roadmap: a feature request or a support incident. */
export interface RoadmapFeedback {
  /** `fb<month>_<n>`: fixed, no world id taken. */
  id: string;
  month: number;
  kind: 'idea' | 'incident';
  featureId: string;
  /** Segment name the customer belongs to (or empty). */
  from: string;
  /** Incidents: bugs reaching customers. */
  count?: number;
}

export interface Roadmap {
  projects: ProductProject[];
  feedback: RoadmapFeedback[];
  /** Known bugs in the live product (support incidents until a bug bash). */
  defects: number;
  nextId: number;
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
  /** `forming`: the bankers note's negotiation with shareholders, before signing. */
  status: 'forming' | 'applying' | 'licensed' | 'rejected' | 'failed';
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
  /** Bankers note (bankers.ts): the negotiation before signing (status `forming`). */
  charter?: BankCharter;
  /** Bankers note: who owns the bank and who controls it, once signed. */
  shareholders?: BankShareholder[];
  /** The founder's voting control (founder plus co-founders), basis points. */
  controlBps?: number;
  /** Board seats: the founder's side, and everyone (an independent chair included). */
  board?: { founderSide: number; total: number };
  /** Management performance shares that vest on milestones. */
  vesting?: BankVesting[];
  /** Bankers note: the licence process (approval in principle, then the final licence). */
  licence?: BankLicence;
  /** Conditions attached to an approval (lifted after `untilMonth`). */
  conditions?: { lendingCap?: number; minCapitalRatio?: number; untilMonth: number };
}

export type BankOfferStyle = 'capital' | 'control' | 'strategic';
export type BankCounterAsk = 'price' | 'seat' | 'voting';

export interface BankCharter {
  /** Your own capital, and the levers on the table. */
  contribution: number;
  /** Your shares carry three votes each. */
  dualClass: boolean;
  /** Performance shares for management, basis points of the bank if all vest (0–1500). */
  performanceBps: number;
  /** Offers (group ids) you've chosen to take. */
  chosen: string[];
  /** One counter-offer per group, and its answer. */
  counters: Record<string, { ask: BankCounterAsk; accepted: boolean }>;
  /** Co-investors invited as co-founders (players, or AI angels you know). */
  invites: BankInvite[];
  /** You changed a lever or countered (the tutorial's negotiate step). */
  touched?: boolean;
}

export interface BankInvite {
  playerId: Id;
  name: string;
  amount: number;
  status: 'open' | 'accepted' | 'declined';
  /** An AI angel answers at once. */
  ai?: boolean;
}

export interface BankShareholder {
  /** A player id, or `ai:<group>` for an investor group. */
  id: string;
  name: string;
  kind: 'founder' | 'cofounder' | 'ai';
  /** A player (founder or co-founder) is paid into their account; AI to the outside world. */
  playerId?: Id;
  /** Where an AI co-founder's dividends go (an AI angel's fund). */
  account?: Id;
  capital: number;
  shares: number;
  votes: number;
  boardSeats: number;
}

export interface BankVesting {
  milestone: 'licence' | 'profit' | 'size';
  shares: number;
  vestedMonth?: number;
}

export type BankKeyRole = 'ceo' | 'cro' | 'compliance' | 'aml';
export type BankSystemId = 'basic' | 'standard' | 'premium';

export interface BankHire {
  /** A candidate id (`c0`…), or `self` (you run the bank as CEO). */
  id: string;
  name: string;
  /** 0–100: how strong they look to the regulator. */
  quality: number;
  /** Monthly, local minor units, paid from the bank's account. */
  salary: number;
}

export interface BankPlan {
  segments: string[];
  products: string[];
  branches: number;
  /** Loan book at the end of years 1–3 (local minor units). */
  lending: [number, number, number];
}

export interface BankLicence {
  /** Home month the review clock started (filing, or a re-application). */
  filedMonth: number;
  /** Game minute it was filed (the tracker's "day N of 60"). */
  filedMin: number;
  attempt: number;
  interview?: { score: number; month: number; at: number; weakest: string | null };
  plan?: BankPlan;
  hires: Partial<Record<BankKeyRole, BankHire>>;
  system?: BankSystemId;
  branch?: { district: string; rent: number };
  /** Approval in principle (home month). */
  aip?: number;
  /** AI companies signed up before opening. */
  clients: Id[];
  decision?: {
    month: number;
    outcome: 'approved' | 'conditions' | 'refused';
    score: number;
    reasons: string[];
  };
}

/** The banker's first session (bankers note). */
export interface BankerTutorial {
  startedMonth: number;
  doneMonth?: number;
  skipped?: boolean;
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
  /**
   * Investor career (Phases 4–6): terms, closes, LPs, capital calls, letters,
   * reserves and marks for a fund raised the full way. Missing = an AI-LP
   * fund paid in at once (Fund I's simple raise and every AI fund).
   */
  lp?: FundLpState;
  /** The firm managing it (Phase 6). Missing = none. */
  firmId?: Id;
}

/** The limited partnership agreement (blueprint §8.2, Phase 4). */
export interface FundTerms {
  /** Target size, local minor units. */
  target: number;
  /** Smallest LP commitment. */
  minCommit: number;
  feeRate: number;
  /** Fee after the investment period. */
  feeStepDown: number;
  carry: number;
  /** A yearly return LPs get before carry (0 = none). */
  hurdle: number;
  /** The GP's own commitment, as a share of the fund. */
  gpCommit: number;
  termMonths: number;
  investMonths: number;
  /** LPs can stop new investments if the GP leaves (key person). */
  keyPerson: boolean;
}

export type FundStrategy = 'seed' | 'growth' | 'public' | 'impact' | 'fof';

/** An LP's stake in a fund (players and AI LPs). */
export interface LpCommitment {
  id: Id;
  /** A human LP, or null for an AI LP. */
  playerId: Id | null;
  /** The AI LP (data/programs.ts) or a player fund of funds. */
  lpId?: Id;
  name: string;
  kind:
    | 'player'
    | 'pension'
    | 'family-office'
    | 'endowment'
    | 'dfi-fof'
    | 'sovereign'
    | 'gp'
    | 'fof'
    | 'secondary'
    /** First funds (more-games note, firstfund.ts): an emerging-manager programme, angels you met, friends and family. */
    | 'emerging'
    | 'angel'
    | 'friends';
  /** A fund of funds that pays this commitment from its own account (Phase 7). */
  fundId?: Id;
  committed: number;
  paidIn: number;
  distributed: number;
  month: number;
  status: 'committed' | 'defaulted' | 'released' | 'sold';
  anchor?: boolean;
  /** Pay capital calls automatically when they fall due (player LPs). */
  autopay?: boolean;
  /** A call delayed once already (player LPs may ask for one short delay per call). */
  delayed?: Id[];
  /** Catch-up paid by a late LP (to the fund, for earlier LPs). */
  catchUp?: number;
}

export interface CapitalCall {
  id: Id;
  commitmentId: Id;
  amount: number;
  month: number;
  dueMonth: number;
  status: 'due' | 'paid' | 'missed';
}

/** How an LP sees the GP (Phase 5): trust from letters, honesty and returns. */
export interface LpRelation {
  trust: number;
  reup: boolean;
  letters: number;
}

export interface FundLetter {
  month: number;
  nav: number;
  tvpi: number;
  dpi: number;
  /** The GP wrote it honestly (marks at the model) or talked the book up. */
  honest: boolean;
  /** A rosy letter LPs later saw through (counted once). */
  exposed?: boolean;
  text: string;
}

export interface FundLpState {
  /** Fund I, II… */
  number: number;
  strategy: FundStrategy;
  terms: FundTerms;
  stage: 'raising' | 'investing' | 'harvest' | 'extended' | 'wound-down' | 'failed';
  openedMonth: number;
  firstCloseMonth?: number;
  finalCloseMonth?: number;
  commitments: LpCommitment[];
  calls: CapitalCall[];
  /** Total paid in by LPs (and the GP). */
  paidIn: number;
  relations: Record<Id, LpRelation>;
  letters: FundLetter[];
  /** Earmarked for follow-ons, by company. */
  reserves: Record<Id, number>;
  /** Monthly NAV (Phase 5), oldest first, capped. */
  marks: { month: number; nav: number }[];
  /** Cash flows to LPs for IRR: −paid in, +distributed, by month. */
  flows: { month: number; amount: number }[];
  /** Deals waiting for or given investment committee approval. */
  ic: {
    dealKey: string;
    companyId: Id;
    amount: number;
    status: 'pending' | 'approved' | 'rejected';
    month: number;
    votes: Record<Id, 'yes' | 'no'>;
  }[];
  /** A term extension being voted on by LPs. */
  extension?: { month: number; status: 'open' | 'approved' | 'rejected' };
  /** Advisory committee approvals for conflicts (Phase 7): members are commitment ids. */
  lpac?: {
    companyId: Id;
    month: number;
    status: 'pending' | 'approved' | 'rejected';
    members: Id[];
    votes: Record<Id, 'yes' | 'no'>;
  }[];
  /** Fees paid so far. */
  feesPaid: number;
  carryPaid: number;
  /**
   * Portfolio construction (Phase 5): companies planned, average first
   * cheque, reserve ratio. With the deal-flow note the LP pitch adds the
   * ownership target and the geography (lpreview.ts).
   */
  plan?: {
    companies: number;
    avgCheque: number;
    reserveRatio: number;
    targetOwnership?: number;
    geography?: FundGeography;
  };
  /** Quarters for which a letter is due (home month the quarter ended), and the last one written. */
  lettersDue?: number[];
  /**
   * A first fund raised from the LP panel with rolling closes (more-games
   * note, firstfund.ts): after the first close, LPs that passed re-review
   * each month and may join up to the target, until the final close.
   */
  rolling?: boolean;
}

/** A partner or associate in a firm (Phase 6). */
export interface FirmMember {
  id: Id;
  name: string;
  title: 'associate' | 'principal' | 'partner';
  /** A human player, or null for an AI hire. */
  playerId: Id | null;
  /** Share of the firm's carry pool. */
  carryShare: number;
  /** Monthly salary, local minor units. */
  salary: number;
  hours: number;
  month: number;
  status: 'active' | 'left' | 'invited';
  /** A partner asking for a bigger share of the carry pool (answer or they leave). */
  ask?: { carryShare: number; month: number };
}

/** A firm (management company): fees from every fund, a team and a carry pool (Phase 6). */
export interface Firm {
  id: Id;
  name: string;
  ownerId: Id;
  market: MarketId;
  account: Id;
  fundIds: Id[];
  members: FirmMember[];
  stars: StarState;
  month: number;
  /** Phase 9: the GP stepped back; the successor runs it and the founder keeps a carry share. */
  succession?: { successorId: Id; month: number; founderCarry: number };
}

/** Cost basis of an investor in a company, for marks, DPI and write-offs. */
export interface Position {
  investorId: Id;
  companyId: Id;
  invested: number;
  returned: number;
  month: number;
  writtenOff: boolean;
  /** Investor career Phase 5: a pro-rata right from the terms. Missing = none. */
  proRata?: boolean;
  /** Investor career Phase 5: monthly marks (newest last, capped), with what set them. */
  marks?: { month: number; value: number; source: 'round' | 'model' | 'listed' | 'exit' }[];
}

/** The deal pipeline (blueprint §6.2, Phase 8). */
export const PIPELINE_STAGES = [
  'sourced',
  'screened',
  'first-call',
  'deep',
  'term-sheet',
  'negotiation',
  'closed',
  'passed',
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export const PASS_REASONS = ['team', 'market', 'traction', 'price', 'fit', 'timing'] as const;
export type PassReason = (typeof PASS_REASONS)[number];

/** What an investor asks first on a first call (feedback round, investorguide.ts). */
export const FIRST_CALL_ASKS = ['growth', 'burn', 'customers', 'team'] as const;
export type FirstCallAsk = (typeof FIRST_CALL_ASKS)[number];

/**
 * One scored investing decision (feedback round, investorguide.ts): the
 * player's choice against the best call for the company's real numbers.
 * `values` are the numbers behind the best call, for the client's "why".
 */
export interface DecisionCall {
  step: 'screen' | 'first-call' | 'valuation' | 'cheque';
  choice: string;
  best: string;
  /** 1 the best call, ½ defensible, 0 a mistake. */
  score: number;
  month: number;
  values: Record<string, number>;
}

export interface PipelineEntry {
  companyId: Id;
  stage: PipelineStage;
  /** Home month it was added. */
  month: number;
  watch?: boolean;
  passReason?: PassReason;
  /** How it came in: a pitch, scouting, a co-investor, the café, an event (deal-flow note). */
  source?: 'pitch' | 'scouting' | 'referral' | 'cafe' | 'manual' | 'event';
  /** The founder's pitch when you met (deal-flow note): a snapshot of the company then. */
  pitch?: EventPitch;
  /** Claims checked against game data (question id → result). */
  claims?: Record<string, 'accurate' | 'slightly-off' | 'false'>;
  /** Reference calls done (home month) and what they said. */
  references?: { month: number; signals: string[] };
  /** For watchlist nudges: the last round month seen. */
  seenRaise?: number;
  /** Feedback round: scored decisions on this company, one per step (investorguide.ts). */
  calls?: DecisionCall[];
}

/** Where a fund invests (deal-flow note): its home city, its country, or the region. */
export type FundGeography = 'city' | 'country' | 'region';

/**
 * A founder's pitch to an investor at an event, a hangout or through an
 * investor's referral (dealflow.ts). Money in the company's currency.
 */
export interface EventPitch {
  /** Where you met: the event's title, or the venue of a hangout. */
  where: string;
  whereKind: 'tech' | 'hosted' | 'hangout' | 'referral';
  /** The event kind (a tech or hosted event's), or 'hangout' / 'referral'. */
  eventKind: string;
  founderId: Id;
  founderName: string;
  /** A human founder pitched in person. */
  human: boolean;
  stage: Stage;
  industry: Industry;
  /** Monthly revenue, paying customers, monthly growth (fraction) and team size then. */
  revenue: number;
  customers: number;
  growth: number;
  team: number;
  /** What they raise and at what valuation (a SAFE cap, or the pre-money of a priced round). */
  ask: number;
  valuation: number;
  instrument: 'safe' | 'priced';
  month: number;
  /** An AI investor who referred it; `coinvest` when they're in it and offer you room. */
  via?: { name: string; fundId: Id; coinvest: boolean };
}

/** A conversation with an AI investor at an event (dealflow.ts). */
export interface InvestorTalk {
  fundId: Id;
  name: string;
  org: string;
  angel: boolean;
  where: string;
  month: number;
  /** The lesson they shared (data/dealflow.ts), and whether it was new to you. */
  lessonId: string;
  learned: boolean;
  /** Their strategy, in the fund's currency. */
  sectors: Industry[] | 'any';
  stages: Stage[];
  cheque: [number, number];
  size: number;
  currency: Currency;
  companies: number;
  reserveRatio: number;
  ownership: number;
  /** A company they referred to you, if any. */
  referredId: Id | null;
  coinvest: boolean;
}

export interface InvestorLearning {
  /** Lesson ids learned, oldest first. */
  lessons: string[];
  /** Conversations, newest first (kept short). */
  talks: InvestorTalk[];
  /** The AI LP panel's last verdict on a Fund I pitch (`fund.raise` with a plan). */
  lastPanel?: LpPanelReview;
}

/** How a strategy check came out (lpreview.ts). */
export type CheckLevel = 'good' | 'warn' | 'bad';

/** An LP's answer to a fund pitch (lpreview.ts): ids and figures the client puts in words. */
export interface LpVerdict {
  lpId: string;
  name: string;
  kind: string;
  commit: boolean;
  /** Commitment, in the fund's currency (0 on a pass). */
  amount: number;
  /** Why, as a reason id (lpreview.ts REASONS). */
  reason: string;
  score: number;
  /** More-games note: this LP anchored the fund (the first commitment, 20–30% of the target). */
  anchor?: boolean;
  /** More-games note: figures behind the reason (deals needed and had …). */
  values?: Record<string, number>;
}

/** A whole LP pitch review: track record, strategy checks, questions and each LP's answer. */
export interface LpPanelReview {
  month: number;
  currency: Currency;
  score: number;
  parts: { track: number; strategy: number; team: number; market: number };
  track: {
    deals: number;
    invested: number;
    returned: number;
    unrealised: number;
    tvpi: number;
    dpi: number;
    losses: number;
    /** More-games note: companies that raised a later round at a higher price. */
    markups?: number;
  };
  checks: { id: string; level: CheckLevel; values: Record<string, number> }[];
  questions: { id: string; values: Record<string, number> }[];
  lps: LpVerdict[];
  /** Committed in total, and the target pitched. */
  committed: number;
  target: number;
  ok: boolean;
  /** More-games note (firstfund.ts): the first-fund size LPs take seriously from this record. */
  suggested?: { lo: number; size: number; hi: number };
  /** More-games note: who anchored the fund, and with how much. */
  anchor?: { name: string; amount: number };
  /** More-games note: what a first close needs (half the target). */
  need?: number;
  /** More-games note: concrete next steps when LPs pass, computed from the gap. */
  nextSteps?: { id: string; values: Record<string, number> }[];
}

/** A founder's review of an investor after a round or an ending (Phase 8). */
export interface InvestorReview {
  id: Id;
  founderId: Id;
  investorId: Id;
  companyId: Id;
  rating: number;
  text: string;
  month: number;
}

/** A player-run accelerator (stored on the world). */
export interface PlayerAccelerator {
  id: Id;
  ownerId: Id;
  /** The fund that writes the cheques, or null for the owner's own money. */
  fundId: Id | null;
  name: string;
  market: MarketId;
  /** One cheque per company, local minor units, for `equityBps` of the company (SAFE cap). */
  cheque: number;
  equityBps: number;
  month: number;
  admitted: Id[];
  demoDays: number;
}

/** An LP stake offered to another player (Phase 7), with the GP's consent. */
export interface StakeOffer {
  id: Id;
  fundId: Id;
  sellerId: Id;
  /** The buying player, or null for an outside secondary buyer. */
  buyerId: Id | null;
  price: number;
  month: number;
  expiresMonth: number;
  /** `awaiting-gp`: buyer and seller agree; the fund's GP approves or rejects the transfer. */
  status: 'open' | 'awaiting-gp' | 'accepted' | 'declined' | 'rejected' | 'expired';
}

/** A pro-rata right offered when a company raises again (Phase 5). */
export interface ProRataOffer {
  id: Id;
  companyId: Id;
  /** The holder with the right: a player or a fund. */
  holderId: Id;
  amount: number;
  instrument: 'safe' | 'priced';
  /** SAFE: the round's cap. Priced: the round's price per share. */
  cap: number;
  price: number;
  month: number;
  expiresMonth: number;
  status: 'open' | 'taken' | 'declined' | 'expired';
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
  /** Investor career Phase 9: a place in a player-run accelerator comes with this SAFE. */
  accelerator?: Id;
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
  kind: 'player' | 'fund' | 'bank' | 'corporate' | 'company' | 'playerbank' | 'syndicate';
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
  /** Investor career Phase 8: an offer in a hot round, compared with others at month end. */
  hot?: boolean;
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
  /** Founder setup: a startup loan application to a player bank carries the plan. */
  application?: StartupApplication;
}

// ---------------------------------------------------------------- Pitches

/** What a typed pitch answer measures: customers, money (minor units) or months. */
export type PitchFigure = 'customers' | 'money' | 'months';

export interface PitchQuestion {
  id: string;
  text: string;
  /**
   * Set on a numeric question (life-bars note): the founder may type their
   * own figure instead of picking an option, judged against today's truth.
   */
  figure?: PitchFigure;
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
  /** Figures the founder typed instead of picking an option, by question id (life-bars note). */
  figures?: Record<string, number>;
  reason: string;
  month: number;
  dealId: Id | null;
  /** Amount the founder is raising, local minor units. */
  ask: number;
  /** Investor career Phase 8: left unanswered past its month (counted once). */
  ghosted?: boolean;
  /** Investor career Phase 8: why the investor passed. */
  passReason?: PassReason;
  /** Feedback note: each answer scored, with the best answer and why. */
  scores?: PitchAnswerScore[];
  /** Feedback note: the real reason an AI fund passed, from the company's numbers. */
  passWhy?: PitchPassWhy;
}

/** One founder pitch answer, scored 0–100 (feedback note, founderguide.ts). */
export interface PitchAnswerScore {
  questionId: string;
  score: number;
  /** How the founder answered: an option's tone, a typed figure, or spin found out. */
  tone: 'honest' | 'modest' | 'spin' | 'vague' | 'caught';
  /** The option id that scores best (the honest one). */
  best: string;
  /** What moved the score, in points. */
  factors: { id: string; points: number; values?: Record<string, number> }[];
}

/** Why an AI fund passed, with the figures behind it (feedback note). */
export interface PitchPassWhy {
  id:
    | 'traction'
    | 'revenue'
    | 'growth'
    | 'product'
    | 'team'
    | 'runway'
    | 'answers'
    | 'compliance'
    | 'deck'
    | 'timing';
  values: Record<string, number>;
  /** The weak slide shown (`deck`). */
  slide?: string;
}

/** A demo's ingredients (feedback note): raw 0–1 values, not weighted. */
export interface DemoParts {
  fit: number;
  quality: number;
  reliability: number;
  discovery: boolean;
  /** The day's luck, added to the weighted score. */
  luck: number;
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
      | 'player'
      /** Wave 13: a home offered as a gift. */
      | 'gift'
      /** Holiday with friends: an invitation or an answer. */
      | 'holiday'
      /** Shopping together: an invitation to the mall, or a gift bought there. */
      | 'mall';
    id: Id;
  };
  /** The other player this is about (a payment, a gift): their chat is where to act. */
  from?: Id;
  /** A payment's transaction: both players' receipts carry it (`/api/receipts/:id`). */
  receipt?: Id;
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
  /** Founder Journey 4a: named rivals per industry, for founders' companies here. */
  rivals?: Partial<Record<Industry, Rival[]>>;
  /** Investor career Phase 2: the city exchange (index, index fund, benchmarks). Missing = none yet. */
  exchange?: ExchangeState;
  /** The real length of a game month (ms), from the last clock settlement (insider blackouts). */
  monthMs?: number;
}

/**
 * A city's stock exchange (investor blueprint §7.2, Phase 2): a cap-weighted
 * price index with a divisor (continuous when companies list or leave), the
 * city index fund (a real holder, `idx:<market>`, buying from the public
 * float), and what each player's share buys would be worth in the index.
 */
export interface ExchangeState {
  /** Index level (100 when the exchange opened) and last month's. */
  level: number;
  prevLevel: number;
  history: number[];
  /** Sum of market caps ÷ divisor = level. */
  divisor: number;
  /** Companies in the index (listed). */
  constituents: Id[];
  /** Index fund units per player, total units, and each player's cost basis. */
  units: Record<Id, number>;
  totalUnits: number;
  unitCost: Record<Id, number>;
  /** What each player's share buys would be worth in the index: index units bought at cost. */
  bench: Record<Id, { units: number; since: number }>;
  /** Realised gains and dividends from this exchange, per player (local minor units). */
  realised: Record<Id, number>;
  dividends: Record<Id, number>;
  /** Shares bought this month per player and company (depth caps). */
  bought: { month: number; by: Record<string, number> };
  /** The index fund's fee owed in fractions of a share, by company (paid as whole shares). */
  feeOwed?: Record<Id, number>;
}

/** A limit order, filled at a settlement if the price crosses (Phase 2). */
export interface ShareOrder {
  id: Id;
  playerId: Id;
  companyId: Id;
  market: MarketId;
  side: 'buy' | 'sell';
  /** Buy: money to spend (company currency, minor). Sell: share of your holding, bps. */
  amount: number;
  /** Price per share (company currency minor units, fractional allowed). */
  limit: number;
  month: number;
  expiresMonth: number;
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  fill?: { month: number; price: number; shares: number };
  reason?: string;
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
  /** An LP's verdict on a fund pitched with a strategy (deal-flow note): reasons and questions. */
  review?: LpPanelReview;
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
  deliveries?: Record<Id, Delivery>;
  dates?: Record<Id, DateSession>;
  playRooms?: Record<Id, PlayRoom>;
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
  /** Last transaction number handed out by the ledger (receipts). */
  txSeq?: number;
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
  /** Friends & Family rounds (chapter 3). Missing on old saves = none. */
  ffRounds?: Record<Id, FriendsRound>;
  /** Wave 8: home visit invitations. Missing on old saves = none. */
  visits?: Record<Id, Visit>;
  /** Wave 8: hangouts. Missing on old saves = none. */
  hangouts?: Record<Id, Hangout>;
  /** Shopping together (malltrips.ts). Missing = none. */
  mallTrips?: Record<Id, MallTrip>;
  /** Holiday with friends: trips abroad friends were invited on. Missing = none. */
  holidays?: Record<Id, Holiday>;
  /** Wave 10: every city's property market (listed and owned). Missing = seeded at the next settlement. */
  properties?: Record<Id, Property>;
  /** Wave 10: company branches in other neighbourhoods and cities. Missing = none. */
  branches?: Record<Id, Branch>;
  /** Wave 13: homes offered as gifts between players (gifts.ts). Missing = none. */
  propertyGifts?: Record<Id, PropertyGift>;
  /** Wave 10: pitch competitions. Missing = none. */
  competitions?: Record<Id, Competition>;
  /** Founder Journey 5: secondary sales offered to players. Missing = none. */
  secondaryOffers?: Record<Id, SecondaryOffer>;
  /** Founder Journey 5: mentors and the startups they advise. Missing = none. */
  mentorships?: Record<Id, Mentorship>;
  /** Founder Journey 5: each city's giving fund (a real account). Missing = none yet. */
  charity?: Partial<Record<MarketId, Id>>;
  /** Investor career Phase 3: syndicates. Missing = none. */
  syndicates?: Record<Id, Syndicate>;
  /** Investor career Phase 6: firms. Missing = none. */
  firms?: Record<Id, Firm>;
  /** Investor career Phase 2: limit orders on the stock market. Missing = none. */
  orders?: Record<Id, ShareOrder>;
  /** Investor career Phase 5: pro-rata offers when a portfolio company raises. Missing = none. */
  prorata?: Record<Id, ProRataOffer>;
  /** Investor career Phase 7: LP stakes offered to other players. Missing = none. */
  stakeOffers?: Record<Id, StakeOffer>;
  /** Investor career Phase 8: founders' reviews of investors. Missing = none. */
  reviews?: Record<Id, InvestorReview>;
  /** Investor career Phase 9: player-run accelerators. Missing = none. */
  playerAccelerators?: Record<Id, PlayerAccelerator>;
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

/** Wave 13: a home one player offers another as a gift (accepted or declined by them). */
export interface PropertyGift {
  id: Id;
  propertyId: Id;
  fromId: Id;
  toId: Id;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  /** Market month (of the property's city) it was offered and answered in. */
  month: number;
  answeredMonth?: number;
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

// ---------------------------------------------------------------- Sales pipeline (Journey 2a)

export const SALES_STAGES = [
  'lead',
  'contacted',
  'discovery',
  'demo',
  'proposal',
  'negotiation',
  'won',
  'lost',
] as const;
export type SalesStage = (typeof SALES_STAGES)[number];
export const SALES_LOSS_REASONS = [
  'price',
  'missing_feature',
  'timing',
  'trust',
  'competitor',
  'no_budget',
] as const;
export type SalesLossReason = (typeof SALES_LOSS_REASONS)[number];
export const SALES_ACTIONS = [
  'contact',
  'discover',
  'demo',
  'propose',
  'negotiate',
  'close',
  'recover',
] as const;
export type SalesAction = (typeof SALES_ACTIONS)[number];
export type SalesNeed = 'fit' | 'price' | 'stars' | 'reliability';
export type SalesCurrent = 'nothing' | 'spreadsheet' | 'incumbent' | 'rival';

/** A prospective customer. Need, budget, authority, urgency, current solution and trust are hidden until discovery. */
export interface SalesCustomer {
  name: string;
  /** The person you deal with. */
  contact: string;
  /** A local business this lead is (when it is one). */
  businessId?: Id;
  segmentKey: string;
  need: SalesNeed;
  /** Willingness to pay per month, local minor units. */
  budgetMin: number;
  budgetMax: number;
  /** 0–1: can they sign alone? */
  authority: number;
  /** 0–1: how soon they must fix the problem. */
  urgency: number;
  current: SalesCurrent;
  /** Who they use today (incumbent or rival), when anyone. */
  currentName?: string;
  /** 0–1, grows with every good interaction. */
  trust: number;
}

export interface SalesDeal {
  id: Id;
  customer: SalesCustomer;
  stage: SalesStage;
  createdMonth: number;
  /** Last game month to close in; it expires at the settlement after. */
  deadline: number;
  /** Discovery done: the hidden attributes are known. */
  revealed: boolean;
  /** How the demo went, 0–1. */
  demoScore?: number;
  /**
   * What the demo score was made of (feedback note): the product's fit for
   * their segment, quality and reliability (0–1 each, weighted by
   * DEMO_WEIGHTS), whether discovery came first, and the day's luck.
   */
  demoParts?: DemoParts;
  /** Proposed monthly price (before discount). */
  price?: number;
  discountPct?: number;
  negotiations?: number;
  lossReason?: SalesLossReason;
  /** The one recovery attempt after a loss has been used. */
  recovered?: boolean;
  /** Lost because the deadline passed. */
  expired?: boolean;
  closedMonth?: number;
  /** The sales conversation (feedback note, salestalk.ts). Missing = none started. */
  talk?: SalesTalk;
}

/** A sales conversation's turns so far (salestalk.ts). Option ids are fixed when it starts. */
export interface SalesTalk {
  /** Conversations held on this deal (each draws its own options). */
  n: number;
  /** The month it started. */
  month: number;
  leadOptions: string[];
  lead?: string;
  /** Price option picked ('below' | 'mid' | 'top') and its amount, before any discount. */
  priceOption?: string;
  price?: number;
  discountPct?: number;
  /** The price was named against your guess at their band (before discovery). */
  guessed?: boolean;
  terms?: string;
  /** Set once you asked for the deal. */
  result?: SalesTalkResult;
}

export interface SalesTalkResult {
  score: number;
  won: boolean;
  chance: number;
  monthly: number;
  turns: { turn: 'lead' | 'price' | 'terms'; option: string; score: number; best: string }[];
}

/** One interview in progress (interviews.ts): who, and the questions on offer each round. */
export interface InterviewState {
  /** The company's interview number (0-based): seeds who you meet and what you can ask. */
  n: number;
  segmentKey: string;
  persona: number;
  name: string;
  gender: 'female' | 'male';
  place: string;
  month: number;
  /** Question ids offered in each of the three rounds. */
  offers: string[][];
  /** Question ids asked so far. */
  picks: string[];
}

export interface InterviewRecord extends InterviewState {
  score: number;
  before: number;
  after: number;
}

export interface CompanyInterviews {
  /** Interviews started, ever. */
  n: number;
  /** Interviews started this month. */
  month: number;
  count: number;
  active?: InterviewState | null;
  /** The last one finished. */
  last?: InterviewRecord | null;
  /** What people told you (the pain notes), for the sales conversation's hints; newest first. */
  hints?: { segmentKey: string; name: string; place: string; persona: number; n: number }[];
}

export interface SalesAccount {
  dealId: Id;
  name: string;
  /** The local business this customer is, when it is one. */
  businessId?: Id;
  segmentKey: string;
  /** Agreed monthly price, local minor units. */
  monthly: number;
  since: number;
}

// ---------------------------------------------------------------- Decision events & rivals (Journey 4a)

/** Founder decisions, plus (Phase 5 life events) health, money, work and city; social is shared. */
export type DecisionFamily =
  | 'customer'
  | 'team'
  | 'competition'
  | 'finance'
  | 'social'
  | 'life'
  | 'health'
  | 'money'
  | 'work'
  | 'city';

/** One concrete consequence of a choice, its numbers fixed when the event appears. */
export type DecisionEffect =
  | {
      kind: 'cash';
      from: 'company' | 'personal';
      /** `lifestyle`: someone outside the game (a friend you lend to, a gift). */
      to: 'suppliers' | 'payroll' | 'customers' | 'lifestyle';
      amount: number;
    }
  /** Phase 5 life events: money in from someone outside the game (a client, the tax office). */
  | { kind: 'income'; from: 'gigs' | 'tax' | 'lifestyle'; amount: number }
  /** Phase 5: money lent out comes back from `lifestyle` this many months later. */
  | { kind: 'repay'; amount: number; months: number }
  /** Phase 5 life bars, through the lifebars helpers (happiness: fun and social each by `n`). */
  | { kind: 'health'; n: number }
  | { kind: 'stress'; n: number }
  | { kind: 'happiness'; n: number }
  /** Shown, not applied: a rival's move keeps weighing on win chances by about this much. */
  | { kind: 'pressure'; pct: number }
  | { kind: 'hours'; n: number }
  | { kind: 'morale'; n: number; staffId?: Id; name?: string }
  | { kind: 'stars'; n: number }
  | { kind: 'price'; pct: number }
  | { kind: 'marketing'; pct: number }
  | { kind: 'salary'; staffId: Id; name: string; amount: number }
  | { kind: 'staffLeaves'; staffId: Id; name: string }
  | { kind: 'deal'; stage: SalesStage; discountPct: number; trust: number }
  | { kind: 'dealDiscount'; dealId: Id; pct: number }
  | { kind: 'dealTrust'; dealId: Id; n: number }
  | { kind: 'product'; fit?: number; quality?: number; techDebt?: number }
  | { kind: 'edge'; months: number; edge: 'product' | 'partner' }
  | { kind: 'trust'; playerId: Id; name: string; n: number }
  | { kind: 'energy'; n: number }
  | { kind: 'social'; n: number }
  | { kind: 'network'; n: number }
  | { kind: 'loan'; amount: number }
  | { kind: 'collect'; amount: number; fee: number }
  | { kind: 'hire'; role: StaffRole; cost: number }
  /** Bounded randomness: a `pct`% chance it works out (shown up front). */
  | { kind: 'chance'; pct: number };

export interface DecisionChoice {
  id: string;
  effects: DecisionEffect[];
  /** Chance-based choices: what happens instead when it doesn't work out. */
  fail?: DecisionEffect[];
}

export interface DecisionEvent {
  /** `ev<n>`, numbered per player (the world's id counter is left alone). */
  id: Id;
  template: string;
  family: DecisionFamily;
  companyId: Id | null;
  market: MarketId;
  /** Market month it appeared. */
  month: number;
  /** Last month to answer; unanswered, it resolves to the default at the next settlement. */
  deadline: number;
  /** Names and amounts in its text. */
  vars: Record<string, string | number>;
  choices: DecisionChoice[];
  defaultChoice: string;
  status: 'open' | 'chosen' | 'defaulted';
  choiceId?: string;
  resolvedMonth?: number;
  /** Chance choices: did it work out. */
  succeeded?: boolean;
  /** The rival it's about (competition family). */
  rivalId?: Id;
  /** A big prospect's customer, fixed when it appears. */
  customer?: SalesCustomer;
  /** An existing deal it's about. */
  dealId?: Id;
  /** Phase 5: a life event (lifeevents.ts), drawn for every human, not just founders. */
  life?: boolean;
  /** Phase 5, once a life event is answered (or defaulted): what actually changed. */
  result?: LifeEventResult;
}

/** What a life event's choice changed: the bars (only those that moved) and your cash. */
export interface LifeEventResult {
  bars: Partial<Record<'energy' | 'health' | 'happiness' | 'stress', number>>;
  /** Change in your local account (minor units; negative: spent). */
  cash: number;
}

export interface PlayerDecisions {
  seq: number;
  events: DecisionEvent[];
  /** Phase 5: loans to friends, paid back (from `lifestyle`) at the settlement of month `due`. */
  repayments?: { due: number; amount: number; market: MarketId; memo: string }[];
  /** Template id (or `family:<f>`) → first month it may fire again. */
  cooldowns: Record<string, number>;
}

export type RivalMoveKind = 'raise' | 'launch' | 'price_cut' | 'poach' | 'win_deal' | 'fail';

export interface RivalMove {
  month: number;
  kind: RivalMoveKind;
  /** Plain English: "Kopapay cut prices 20% after raising ₦50m". */
  text: string;
  amount?: number;
  pct?: number;
  /** The founder company it touched (poach, win_deal). */
  targetCompanyId?: Id;
  /** Who they tried to hire (poach). */
  staffId?: Id;
  /** The feature launched, or the customer won (English). */
  detail?: string;
}

/** A named rival in a founder's industry: an AI startup's mirror, or a lightweight abstract one. */
export interface Rival {
  id: Id;
  /** The AI startup it follows, or null for an abstract rival. */
  companyId: Id | null;
  name: string;
  industry: Industry;
  goal: 'growth' | 'profit' | 'dominate';
  /** How it likes to compete. */
  style: 'price' | 'product' | 'sales';
  /** Money raised so far (local minor units). */
  funding: number;
  /** Product maturity 0–1. */
  maturity: number;
  /** Its price relative to what buyers spend (1 = the segment's budget). */
  priceIndex: number;
  /** A price cut in force, until this month. */
  priceCut?: { pct: number; until: number };
  reputation: number;
  customers: number;
  nextMoveMonth: number;
  status: 'active' | 'failed';
  moves: RivalMove[];
}

// ---------------------------------------------------------------- Founder setup

export type SetupStepId = 'idea' | 'register' | 'fund' | 'plan' | 'office';
export type SetupCheckLevel = 'good' | 'warn' | 'bad';
export interface SetupCheck {
  id: 'price' | 'margin' | 'breakEven' | 'runway' | 'understanding' | 'repayment';
  level: SetupCheckLevel;
  values: Record<string, number>;
}

/** The business plan and pitch lenders and banks read (setup.ts). Money in minor units. */
export interface SetupPlanFields {
  sell: string;
  /** The customer segment it is for. */
  segment: string;
  price: number;
  costToServe: number;
  monthlyCosts: number;
  customersMonth6: number;
  /** What it asks lenders for in total. */
  ask: number;
  /** How many months the founder says the money lasts. */
  months: number;
}

export interface SetupPlan extends SetupPlanFields {
  month: number;
  checks: SetupCheck[];
  /** 0–100: the checks, with the founder's credit. */
  score: number;
}

/** A city lender's answer to a startup loan (decided when asked, like a licence decision). */
export interface SetupDecision {
  lenderId: Id;
  productId: string;
  month: number;
  outcome: 'approved' | 'conditions' | 'declined';
  score: number;
  /** Approved in total; paid now; the rest after `restAfterCustomers` paying customers. */
  amount: number;
  now: number;
  rest: number;
  restAfterCustomers: number;
  rateBps: number;
  months: number;
  /** The checks behind a condition or a decline (each with a fix in the client's copy). */
  reasons: SetupCheck[];
  /** The lender's own reason for a decline (eligibility), or null. */
  lenderReason: string | null;
  dealId: Id | null;
  restDealId?: Id;
}

export interface SetupOffice {
  id: 'home' | 'cowork' | 'small' | 'shop' | 'serviced';
  district: string;
  desks: number;
  rent: number;
  leaseMonths: number;
  month: number;
}

export interface FounderSetup {
  step: 'register' | 'fund' | 'plan' | 'office' | 'done';
  startedMonth: number;
  registered?: { month: number; fee: number; incorporation: Incorporation };
  plan?: SetupPlan;
  decisions: SetupDecision[];
  office?: SetupOffice;
  doneMonth?: number;
}

/** What a banker reads on a startup loan application (a snapshot of the plan when sent). */
export interface StartupApplication {
  plan: SetupPlan;
  /** The founder's own money in the company when the application was sent. */
  ownMoney: number;
  creditScore: number;
  defaults: number;
  /** City lenders that approved too (names). */
  alsoApproved: string[];
  declineReason?: string;
}
