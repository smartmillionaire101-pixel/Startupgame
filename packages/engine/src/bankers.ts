/**
 * Bankers (BANKERS_NOTE): founding a bank is work, not a wait.
 *
 * 1. Negotiate with shareholders before you sign (`bank.found` makes a bank
 *    `forming`). Two or three AI investor groups make term offers that
 *    differ: more capital, more control, or a board seat and strategic help.
 *    The levers are your own capital, a smaller bank, co-founders (players,
 *    or AI angels you know), voting shares, and management performance
 *    shares that vest on milestones. One counter-offer per group, answered
 *    deterministically by your credibility. Signing (`bank.sign`) moves the
 *    money and records who owns the bank (economic ownership: dividends and
 *    figures) and who controls it (votes and board seats: policy rights).
 * 2. The licence process is a checklist: a fit-and-proper interview at the
 *    city's Central Bank (booked with `place.book`), a business plan checked
 *    for coherence as you write it, key people (CEO, Chief Risk Officer,
 *    compliance, AML), a core banking system and a first branch. Interview
 *    and plan give approval in principle, which opens pre-opening: sign up
 *    a few of the city's AI businesses as first clients. The decision comes
 *    at a month end once the review time has passed and the checklist is
 *    done: approved, approved with conditions, or refused with reasons (fix
 *    them and the review runs again).
 * 3. The banker's first session and journey (journey.ts BANKER_CHAPTERS).
 *
 * Determinism: dice only from `deriveRng` streams named here, money only
 * through the ledger, and every command refused unless the note is logged.
 */
import { BANK_TYPES, MIN_CAPITAL_RATIO, RESERVE_RATIO, bankFigures, getBank } from './banks.js';
import { advisoryRecord } from './bankwork.js';
import { backgroundById } from './data/characters.js';
import { CITY_DISTRICTS } from './data/businesses.js';
import { AI_FIRST_NAMES, AI_LAST_NAMES } from './data/fiction.js';
import { creditProfile } from './credit.js';
import { districtWeights } from './districts.js';
import { districtLabel } from './economy.js';
import { ensure, fail } from './errors.js';
import { contactWarmth } from './events.js';
import {
  achieve,
  col,
  getMarket,
  locationOf,
  notify,
  spendHours,
  isEstablished,
} from './helpers.js';
import { newId } from './ids.js';
import { account, openAccount, transfer, transferUpTo } from './ledger.js';
import { clamp, clamp01, roundTo } from './math.js';
import { formatMoney, scale } from './money.js';
import { checkName } from './names.js';
import { DAY_MIN, MONTH_MIN, gameMinute, placeAccess, placeId, findPlace } from './places.js';
import { bankersOn, feedbackOn } from './releases.js';
import { deriveRng, hashString } from './rng.js';
import { newStars } from './stars.js';
import type {
  Bank,
  BankCharter,
  BankCounterAsk,
  BankHire,
  BankKeyRole,
  BankOfferStyle,
  BankPlan,
  BankShareholder,
  BankSystemId,
  BankType,
  BankVesting,
  Id,
  Player,
  World,
} from './types.js';

// ---------------------------------------------------------------- numbers

/** Every number in one place. */
export const BANKERS = {
  /** The regulator likes a buffer: the groups size their offers to this × the minimum. */
  targetBuffer: 1.25,
  /** Your shares carry this many votes each with voting shares (dual class). */
  dualClassVotes: 3,
  /** The most performance shares management may ask for (basis points of the bank). */
  maxPerformanceBps: 1500,
  /** The independent chair the regulator expects on every board. */
  independentSeats: 1,
  /** Days the regulator takes at least (the tracker's "day N of 60"); 30 from FEEDBACK_NOTE. */
  reviewDays: 60,
  /** Months a review takes at least (month ends), and before an unfinished application lapses. */
  reviewMonths: 2,
  lapseMonths: 6,
  /** Hours: the interview, writing the plan, signing up a client. */
  interviewHours: 3,
  planHours: 2,
  clientHours: 1,
  /** The interview's pass mark (0–100), and the luck either way. */
  interviewPass: 60,
  interviewJitter: 5,
  /** Final decision: approved from here, with conditions from `conditions`, refused below. */
  approve: 72,
  conditions: 55,
  /** Conditions last this many months: a lending cap (share of capacity) and a higher capital ratio. */
  conditionMonths: 12,
  conditionCap: 0.5,
  conditionRatio: 0.12,
  /** Pre-opening: AI businesses that will listen (plus the strategic group's introductions). */
  prospects: 5,
  strategicProspects: 2,
  /** A strategic shareholder's standing with the regulator (decision points). */
  strategicHelp: 5,
  /** Performance shares vest at this many customers ("size"). */
  sizeCustomers: 1000,
  /** Counter-offer difficulty by ask; credibility (plus skin in the game) must reach it. */
  counter: { price: 1.4, seat: 1.6, voting: 1.9 } as Record<BankCounterAsk, number>,
} as const;

export const BANK_KEY_ROLES: readonly BankKeyRole[] = ['ceo', 'cro', 'compliance', 'aml'];

export const BANK_SYSTEMS: Record<BankSystemId, { costCol: number; reliability: number }> = {
  basic: { costCol: 1, reliability: 0.55 },
  standard: { costCol: 2.5, reliability: 0.8 },
  premium: { costCol: 5, reliability: 0.95 },
};

export const BANK_SEGMENTS = [
  'households',
  'small-business',
  'corporates',
  'startups',
  'unbanked',
] as const;
export const BANK_PRODUCTS = [
  'current-accounts',
  'savings',
  'personal-loans',
  'mortgages',
  'sme-loans',
  'micro-loans',
  'venture-loans',
  'trade-finance',
  'advisory',
] as const;

/** What each kind of bank is licensed to do (the plan's fit check). */
export const TYPE_FIT: Record<BankType, { segments: string[]; products: string[] }> = {
  commercial: {
    segments: ['households', 'small-business', 'corporates'],
    products: [
      'current-accounts',
      'savings',
      'personal-loans',
      'mortgages',
      'sme-loans',
      'trade-finance',
    ],
  },
  microfinance: {
    segments: ['households', 'small-business', 'unbanked'],
    products: ['current-accounts', 'savings', 'micro-loans', 'personal-loans'],
  },
  'venture-debt': {
    segments: ['startups', 'small-business'],
    products: ['venture-loans', 'sme-loans'],
  },
  investment: {
    segments: ['corporates', 'startups'],
    products: ['advisory', 'trade-finance'],
  },
};

/** The fit-and-proper interview: capital, risk, AML/KYC and governance. */
export const BANK_INTERVIEW: {
  id: string;
  topic: 'capital' | 'risk' | 'aml' | 'governance';
  text: string;
  options: {
    text: string;
    skill: 'finance' | 'risk' | 'negotiation' | 'leadership' | 'sales';
    fit: number;
  }[];
}[] = [
  {
    id: 'capital',
    topic: 'capital',
    text: 'A large borrower defaults in your first year. How do you protect your capital?',
    options: [
      { text: 'Lend more to earn it back quickly', skill: 'sales', fit: 0.2 },
      {
        text: 'Keep a buffer above the minimum and slow lending until it is rebuilt',
        skill: 'finance',
        fit: 1,
      },
      { text: 'Ask the shareholders for more capital', skill: 'negotiation', fit: 0.6 },
    ],
  },
  {
    id: 'risk',
    topic: 'risk',
    text: 'How will your bank decide who gets a loan?',
    options: [
      {
        text: 'A written credit policy: cash flow, limits per borrower and per sector',
        skill: 'risk',
        fit: 1,
      },
      { text: 'Collateral first, then the story', skill: 'risk', fit: 0.6 },
      { text: 'Relationships: I know my market', skill: 'sales', fit: 0.25 },
    ],
  },
  {
    id: 'aml',
    topic: 'aml',
    text: 'A new client wants to deposit a large sum in cash and won’t say where it came from. What do you do?',
    options: [
      { text: 'Take it: deposits are deposits', skill: 'sales', fit: 0 },
      { text: 'Take it and keep an eye on the account', skill: 'finance', fit: 0.35 },
      {
        text: 'Refuse until they document the source, and report it to the authorities',
        skill: 'risk',
        fit: 1,
      },
    ],
  },
  {
    id: 'governance',
    topic: 'governance',
    text: 'Who checks the chief executive?',
    options: [
      { text: 'The biggest shareholder', skill: 'negotiation', fit: 0.5 },
      {
        text: 'An independent board with risk and audit committees',
        skill: 'leadership',
        fit: 1,
      },
      { text: 'Nobody: I founded the bank', skill: 'leadership', fit: 0.1 },
    ],
  },
];

const GROUP_NAMES: Record<BankOfferStyle, string[]> = {
  capital: ['Meridian Capital Partners', 'Harbour Capital', 'Summit Equity Partners'],
  control: ['Heritage Family Office', 'Lakeside Family Office', 'Oakmont Family Office'],
  strategic: ['Continental Banking Group', 'Atlas Financial Group', 'Crown Bank Holdings'],
};
const STYLES: readonly BankOfferStyle[] = ['capital', 'control', 'strategic'];

// ---------------------------------------------------------------- helpers

const homeMonth = (world: World, p: Player) => getMarket(world, p.market).month;

/** Bigger banks: bigger systems and branches (√ of minimum capital vs microfinance). */
const sizeOf = (type: BankType) => Math.sqrt(BANK_TYPES[type].minCapitalCol / 30);

const minCapitalOf = (world: World, b: Pick<Bank, 'market' | 'type'>) =>
  scale(col(getMarket(world, b.market)), BANK_TYPES[b.type].minCapitalCol);

/**
 * How the regulator and investors see you (0.5–2): reputation, banking
 * background, credit, and advisory deals closed while you wait (bankwork.ts;
 * up to +0.3 for a good track record).
 */
export function bankerCredibility(world: World, p: Player): number {
  const bg = backgroundById(p.backgroundId);
  const advisory = advisoryRecord(world, p);
  return clamp(
    0.4 +
      p.stars.value / 5 +
      (bg?.role === 'banker' ? 0.3 : 0) +
      creditProfile(world, p).score / 200 +
      Math.min(0.3, advisory.deals * 0.06 * (0.5 + advisory.avgQuality)),
    0.5,
    2,
  );
}

function bankerOn(world: World) {
  if (!bankersOn(world)) fail('command.unknown', 'Unknown command.');
}

/** The bank you run, still being formed (negotiation) or applying (licence work). */
function myBank(world: World, p: Player, bankId: Id, status: Bank['status'][]): Bank {
  const b = getBank(world, bankId);
  ensure(b.ownerId === p.id, 'bank.forbidden', 'You don’t run this bank.');
  ensure(
    status.includes(b.status),
    'bank.status',
    b.status === 'forming'
      ? 'Sign with your shareholders first.'
      : b.status === 'applying'
        ? 'The licence application is under review.'
        : 'Not at this stage.',
  );
  return b;
}

// ---------------------------------------------------------------- 1. forming the bank

/** `bank.found` in a bankers world: name and licence chosen, nothing signed or paid yet. */
export function formBank(
  world: World,
  p: Player,
  args: { name: string; type: BankType; contribution: number },
): Bank {
  const m = getMarket(world, p.market);
  ensure(
    !Object.values(world.banks).some(
      (b) => b.ownerId === p.id && b.status !== 'failed' && b.status !== 'rejected',
    ),
    'bank.exists',
    'You already run a bank.',
  );
  const check = checkName(args.name, { taken: world.names[m.id] ?? {} });
  if (!check.ok) fail('bank.name', check.reason);
  ensure(args.contribution > 0, 'bank.capital', 'Put in some of your own capital.');
  ensure(
    creditProfile(world, p).defaults === 0,
    'bank.credit',
    'Regulators won’t license someone with a recent default.',
  );
  const id = newId(world, 'bank');
  const acc = openAccount(world, { currency: m.data.currency, market: m.id, label: args.name });
  const bank: Bank = {
    id,
    name: args.name.trim(),
    market: m.id,
    type: args.type,
    ownerId: p.id,
    status: 'forming',
    account: acc,
    appliedMonth: m.month,
    licensedMonth: null,
    ownerShareBps: 10_000,
    policy: {
      loanSpreadPp: 6,
      depositRateBps: Math.round(m.data.baseRateBps / 4),
      accountFee: scale(col(m), 0.002),
      salary: 0,
    },
    retail: { customers: 0, deposits: 0, loans: 0 },
    cbLoans: [],
    cbBorrowMonths: [],
    stars: newStars(Math.min(2.5, p.stars.value)),
    reviews: { sum: 0, count: 0 },
    lastMonth: { interestIncome: 0, fees: 0, depositInterest: 0, opex: 0, loanLosses: 0, net: 0 },
    thisMonth: { interest: 0, fees: 0, losses: 0 },
    advised: 0,
    charter: {
      contribution: args.contribution,
      dualClass: false,
      performanceBps: 0,
      chosen: [],
      counters: {},
      invites: [],
    },
  };
  world.banks[id] = bank;
  world.names[m.id] ??= {};
  world.names[m.id]![check.normalised] = id;
  notify(world, p.id, {
    month: m.month,
    kind: 'system',
    text: `${bank.name}: three investor groups have sent term offers. Compare them, negotiate, then sign and file for your licence.`,
  });
  return bank;
}

export interface BankOffer {
  id: string;
  style: BankOfferStyle;
  name: string;
  capital: number;
  /** What they pay per share, basis points of your price (10,000 = the same price as you). */
  priceBps: number;
  shares: number;
  /** Ordinary (voting) shares, or non-voting. */
  voting: boolean;
  boardSeats: number;
  /** A strategic partner: standing with the regulator and introductions to first clients. */
  strategic: boolean;
  counter: { ask: BankCounterAsk; accepted: boolean } | null;
  chosen: boolean;
}

/** Capital already committed by the founding side: you, and co-founders who said yes. */
const foundingCapital = (c: BankCharter) =>
  c.contribution +
  c.invites.filter((i) => i.status === 'accepted').reduce((a, i) => a + i.amount, 0);

/** Your skin in the game helps a counter-offer (0–1: your side's share of the target). */
function counterScore(world: World, p: Player, b: Bank): number {
  const target = Math.round(minCapitalOf(world, b) * BANKERS.targetBuffer);
  return roundTo(
    bankerCredibility(world, p) + clamp01(foundingCapital(b.charter!) / Math.max(1, target)),
    2,
  );
}

/**
 * The groups' offers as they stand: sized to the gap between what the
 * founding side brings and what the regulator wants, priced by your
 * credibility, and moved by your levers and any counter-offer they took.
 */
export function bankOffers(world: World, b: Bank): BankOffer[] {
  const c = b.charter;
  if (!c) return [];
  const owner = world.players[b.ownerId];
  const cred = owner ? bankerCredibility(world, owner) : 1;
  const need = minCapitalOf(world, b);
  const target = Math.round(need * BANKERS.targetBuffer);
  const base = Math.max(target - foundingCapital(c), Math.round(need * 0.2));
  const pick = hashString(b.id) % 3;
  return STYLES.map((style, i) => {
    const id = `g${i + 1}`;
    const counter = c.counters[id] ?? null;
    let capital: number;
    let priceBps: number;
    let voting = true;
    let boardSeats: number;
    if (style === 'capital') {
      capital = base;
      priceBps = 8000 + Math.round((cred - 1) * 500);
      boardSeats = 1;
      if (c.dualClass) priceBps -= 1000;
    } else if (style === 'control') {
      capital = Math.round(base * 0.5);
      priceBps = 10_000;
      voting = false;
      boardSeats = 0;
    } else {
      capital = Math.round(base * 0.6);
      priceBps = 9000 + Math.round((cred - 1) * 400);
      boardSeats = 2;
      if (c.dualClass) priceBps -= 500;
    }
    // Voting investors price in performance shares (their stake is diluted if they vest).
    if (voting) priceBps -= Math.round(c.performanceBps / 3);
    if (counter?.accepted) {
      if (counter.ask === 'price') priceBps += 1000;
      if (counter.ask === 'seat') boardSeats = Math.max(0, boardSeats - 1);
      if (counter.ask === 'voting') voting = false;
    }
    priceBps = clamp(priceBps, 6000, 10_000);
    return {
      id,
      style,
      name: GROUP_NAMES[style][(pick + i) % 3]!,
      capital,
      priceBps,
      shares: Math.round((capital * 10_000) / priceBps),
      voting,
      boardSeats,
      strategic: style === 'strategic',
      counter,
      chosen: c.chosen.includes(id),
    };
  });
}

export interface CapTablePreview {
  shareholders: BankShareholder[];
  capital: number;
  minCapital: number;
  target: number;
  /** Short of the regulator's minimum (0 when there's enough). */
  short: number;
  ownershipBps: number;
  /** Your voting control: you and your co-founders. */
  controlBps: number;
  board: { founderSide: number; total: number };
  boardMajority: boolean;
  policyRights: boolean;
  /** Performance shares if every milestone vests. */
  vesting: BankVesting[];
}

const sumShares = (list: BankShareholder[]) => list.reduce((a, s) => a + s.shares, 0);

/** Ownership, control and board from a list of shareholders. */
function measure(list: BankShareholder[]) {
  const shares = sumShares(list);
  const votes = list.reduce((a, s) => a + s.votes, 0);
  const founder = list.find((s) => s.kind === 'founder');
  const side = list.filter((s) => s.kind !== 'ai');
  const founderSide = side.reduce((a, s) => a + s.boardSeats, 0);
  const total = list.reduce((a, s) => a + s.boardSeats, 0) + BANKERS.independentSeats;
  const ownershipBps = shares ? Math.round(((founder?.shares ?? 0) * 10_000) / shares) : 0;
  const controlBps = votes
    ? Math.round((side.reduce((a, s) => a + s.votes, 0) * 10_000) / votes)
    : 0;
  const boardMajority = founderSide * 2 > total;
  return {
    ownershipBps,
    controlBps,
    board: { founderSide, total },
    boardMajority,
    policyRights: controlBps > 5000 || boardMajority,
  };
}

/** Who would own and control the bank if you signed now. */
export function capTablePreview(world: World, b: Bank): CapTablePreview {
  const c = b.charter!;
  const owner = world.players[b.ownerId];
  const votesPer = c.dualClass ? BANKERS.dualClassVotes : 1;
  const list: BankShareholder[] = [
    {
      id: b.ownerId,
      name: owner?.name ?? 'You',
      kind: 'founder',
      playerId: b.ownerId,
      capital: c.contribution,
      shares: c.contribution,
      votes: c.contribution * votesPer,
      boardSeats: 1,
    },
  ];
  const cofounders = c.invites.filter((i) => i.status === 'accepted');
  cofounders.forEach((i, n) =>
    list.push({
      id: i.playerId,
      name: i.name,
      kind: 'cofounder',
      ...(i.ai ? {} : { playerId: i.playerId }),
      capital: i.amount,
      shares: i.amount,
      votes: i.amount,
      // Co-founders share one seat between them.
      boardSeats: n === 0 ? 1 : 0,
    }),
  );
  for (const o of bankOffers(world, b))
    if (o.chosen)
      list.push({
        id: `ai:${o.id}`,
        name: o.name,
        kind: 'ai',
        capital: o.capital,
        shares: o.shares,
        votes: o.voting ? o.shares : 0,
        boardSeats: o.boardSeats,
      });
  const capital = list.reduce((a, s) => a + s.capital, 0);
  const minCapital = minCapitalOf(world, b);
  const total = sumShares(list);
  // Performance shares: if all vest, management holds `performanceBps` more of the bank.
  const grant =
    c.performanceBps > 0 ? Math.round((total * c.performanceBps) / (10_000 - c.performanceBps)) : 0;
  const third = Math.floor(grant / 3);
  const vesting: BankVesting[] = grant
    ? [
        { milestone: 'licence', shares: third },
        { milestone: 'profit', shares: third },
        { milestone: 'size', shares: grant - 2 * third },
      ]
    : [];
  return {
    shareholders: list,
    capital,
    minCapital,
    target: Math.round(minCapital * BANKERS.targetBuffer),
    short: Math.max(0, minCapital - capital),
    ...measure(list),
    vesting,
  };
}

/** `bank.terms`: move a lever (your capital, the kind of bank, voting shares, performance shares, the offers you take). */
export function setTerms(
  world: World,
  p: Player,
  bankId: Id,
  t: {
    contribution?: number;
    bankType?: BankType;
    dualClass?: boolean;
    performanceBps?: number;
    chosen?: string[];
  },
) {
  bankerOn(world);
  const b = myBank(world, p, bankId, ['forming']);
  const c = b.charter!;
  if (t.contribution !== undefined) {
    ensure(t.contribution > 0, 'bank.capital', 'Put in some of your own capital.');
    c.contribution = t.contribution;
  }
  if (t.bankType !== undefined) b.type = t.bankType;
  if (t.dualClass !== undefined) c.dualClass = t.dualClass;
  if (t.performanceBps !== undefined) {
    ensure(
      t.performanceBps >= 0 && t.performanceBps <= BANKERS.maxPerformanceBps,
      'bank.performance',
      'Investors accept at most 15% in performance shares.',
    );
    c.performanceBps = Math.round(t.performanceBps);
  }
  if (t.chosen !== undefined) {
    const ids = new Set(bankOffers(world, b).map((o) => o.id));
    ensure(
      t.chosen.every((x) => ids.has(x)),
      'bank.offer',
      'No such offer.',
    );
    c.chosen = [...new Set(t.chosen)].sort();
  }
  c.touched = true;
  return { preview: capTablePreview(world, b) };
}

/** What a counter-offer takes: the capital group guards its price; the strategic group its seats. */
const counterNeed = (style: BankOfferStyle, ask: BankCounterAsk) =>
  roundTo(
    BANKERS.counter[ask] +
      (style === 'capital' && ask === 'price' ? 0.2 : 0) +
      (style === 'strategic' && ask === 'seat' ? 0.3 : 0),
    2,
  );

/** `bank.counter`: one counter-offer per group; they answer at once, by your credibility. */
export function counterOffer(
  world: World,
  p: Player,
  bankId: Id,
  groupId: string,
  ask: BankCounterAsk,
) {
  bankerOn(world);
  const b = myBank(world, p, bankId, ['forming']);
  const c = b.charter!;
  const offer = bankOffers(world, b).find((o) => o.id === groupId);
  ensure(offer, 'bank.offer', 'No such offer.');
  ensure(!c.counters[groupId], 'bank.counter', `You’ve already countered ${offer.name}.`);
  if (ask === 'voting')
    ensure(offer.voting, 'bank.counter', 'They already take non-voting shares.');
  if (ask === 'seat') ensure(offer.boardSeats > 0, 'bank.counter', 'They don’t ask for a seat.');
  if (ask === 'price')
    ensure(offer.priceBps < 10_000, 'bank.counter', 'They already pay your price.');
  const score = counterScore(world, p, b);
  const need = counterNeed(offer.style, ask);
  const accepted = score >= need;
  c.counters[groupId] = { ask, accepted };
  c.touched = true;
  const what =
    ask === 'price'
      ? 'a better price'
      : ask === 'seat'
        ? 'one board seat fewer'
        : 'non-voting shares';
  return {
    accepted,
    score,
    need: roundTo(need, 2),
    message: accepted
      ? `${offer.name} agreed to ${what}.`
      : `${offer.name} holds firm on its terms: your standing (${score}) is short of what it takes (${roundTo(need, 2)}).`,
  };
}

/** AI angels you know (a warm contact) in your city, who could co-invest. */
function knownAngels(world: World, p: Player) {
  const month = homeMonth(world, p);
  return Object.values(world.players)
    .filter((x) => x.ai && x.angel && x.angel.retiredMonth === undefined && x.market === p.market)
    .map((x) => {
      const contact = (p.contacts ?? []).find(
        (c) => c.refId === x.id || c.refId === x.angel!.fundId,
      );
      return { angel: x, warmth: contact ? contactWarmth(contact, month) : 0 };
    })
    .filter((x) => x.warmth > 0)
    .sort((a, b) => b.warmth - a.warmth || (a.angel.id < b.angel.id ? -1 : 1));
}

/** `bank.invite`: ask a player (or an AI angel you know) to co-found the bank with capital. */
export function inviteCofounder(world: World, p: Player, bankId: Id, playerId: Id, amount: number) {
  bankerOn(world);
  const b = myBank(world, p, bankId, ['forming']);
  const c = b.charter!;
  const m = getMarket(world, b.market);
  const other = world.players[playerId];
  ensure(other && other.id !== p.id, 'bank.invite', 'Invite someone else.');
  ensure(amount > 0, 'bank.invite', 'Ask for some capital.');
  ensure(
    !c.invites.some((i) => i.playerId === playerId && i.status !== 'declined'),
    'bank.invite',
    'You’ve already invited them.',
  );
  ensure(c.invites.length < 6, 'bank.invite', 'That’s enough invitations.');
  c.touched = true;
  if (other.ai) {
    const known = knownAngels(world, p).find((x) => x.angel.id === playerId);
    ensure(known, 'bank.invite', 'Invite an AI angel you know.');
    const fund = world.funds[other.angel!.fundId];
    const cheque = fund ? fund.check[1] : 0;
    const yes =
      !!fund &&
      known.warmth >= 0.3 &&
      amount <= cheque &&
      account(world, fund.account).balance >= amount;
    c.invites.push({
      playerId,
      name: other.name,
      amount,
      status: yes ? 'accepted' : 'declined',
      ai: true,
    });
    if (yes)
      transfer(
        world,
        fund!.account,
        b.account,
        amount,
        `Capital for ${b.name}`,
        m.month,
        'invested',
      );
    return {
      accepted: yes,
      message: yes
        ? `${other.name} is in: ${formatMoney(amount, m.data.currency)} as a co-founder.`
        : known.warmth < 0.3
          ? `${other.name} doesn’t know you well enough yet.`
          : `${other.name} won’t put in that much.`,
    };
  }
  ensure(!other.ai && other.market === b.market, 'bank.invite', 'Invite someone in your city.');
  c.invites.push({ playerId, name: other.name, amount, status: 'open' });
  notify(world, playerId, {
    month: getMarket(world, other.market).month,
    kind: 'pitch',
    text: `${p.name} invites you to co-found ${b.name} with ${formatMoney(amount, m.data.currency)} of capital. Answer from the Bank screen.`,
  });
  return { accepted: null, message: `Invitation sent to ${other.name}.` };
}

/** `bank.join`: answer an invitation to co-found a bank (your capital goes in at once). */
export function answerCofounder(world: World, me: Player, bankId: Id, accept: boolean) {
  bankerOn(world);
  const b = getBank(world, bankId);
  ensure(b.status === 'forming' && b.charter, 'bank.status', 'That bank has already signed.');
  const inv = b.charter.invites.find((i) => i.playerId === me.id && i.status === 'open');
  ensure(inv, 'bank.invite', 'No open invitation.');
  const m = getMarket(world, b.market);
  if (accept) {
    ensure(
      account(world, me.accounts.local).balance >= inv.amount,
      'bank.funds',
      'You don’t have that much in your account.',
    );
    transfer(
      world,
      me.accounts.local,
      b.account,
      inv.amount,
      `Capital for ${b.name}`,
      m.month,
      'invested',
    );
  }
  inv.status = accept ? 'accepted' : 'declined';
  notify(world, b.ownerId, {
    month: m.month,
    kind: 'system',
    text: accept
      ? `${me.name} is co-founding ${b.name} with ${formatMoney(inv.amount, m.data.currency)}.`
      : `${me.name} declined to co-found ${b.name}.`,
  });
  return { message: accept ? `You’re a co-founder of ${b.name}.` : 'Declined.' };
}

/** `bank.sign`: the money moves, the shareholders are recorded, and the licence application is filed. */
export function signBank(world: World, p: Player, bankId: Id, now: number) {
  bankerOn(world);
  const b = myBank(world, p, bankId, ['forming']);
  const c = b.charter!;
  const m = getMarket(world, b.market);
  const pv = capTablePreview(world, b);
  ensure(
    pv.short === 0,
    'bank.short',
    `The regulator wants at least ${formatMoney(pv.minCapital, m.data.currency)} of capital: you’re ${formatMoney(pv.short, m.data.currency)} short. Take another offer, put in more, or pick a smaller bank.`,
  );
  ensure(
    account(world, p.accounts.local).balance >= c.contribution,
    'bank.funds',
    'You don’t have that much in your account.',
  );
  transfer(
    world,
    p.accounts.local,
    b.account,
    c.contribution,
    `Capital for ${b.name}`,
    m.month,
    'capital',
  );
  for (const s of pv.shareholders)
    if (s.kind === 'ai')
      transfer(world, m.ext.lps, b.account, s.capital, `${s.name}: capital for ${b.name}`, m.month);
  // Co-founders who never answered: their invitation lapses.
  for (const i of c.invites) if (i.status === 'open') i.status = 'declined';
  // An AI angel's dividends go back to its fund.
  b.shareholders = pv.shareholders.map((s) => {
    const ai = s.kind === 'cofounder' && !s.playerId ? world.players[s.id] : undefined;
    const fund = ai?.angel ? world.funds[ai.angel.fundId] : undefined;
    return fund ? { ...s, account: fund.account } : s;
  });
  b.vesting = pv.vesting;
  remeasure(b);
  b.status = 'applying';
  b.appliedMonth = m.month;
  b.licence = {
    filedMonth: m.month,
    filedMin: gameMinute(m, now),
    attempt: 1,
    hires: {},
    clients: [],
  };
  delete b.charter;
  notify(world, p.id, {
    month: m.month,
    kind: 'system',
    text: `Signed: ${b.name} has ${formatMoney(pv.capital, m.data.currency)} of capital and you own ${(pv.ownershipBps / 100).toFixed(1)}%. Licence application filed: book your fit-and-proper interview at the Central Bank.`,
  });
  return { bankId: b.id, preview: pv };
}

/** Recompute ownership, control and board after shares change. */
function remeasure(b: Bank) {
  const list = b.shareholders ?? [];
  const r = measure(list);
  b.ownerShareBps = r.ownershipBps;
  b.controlBps = r.controlBps;
  b.board = r.board;
}

/** Does the founder set policy? Voting control or a board majority (always, in an old bank). */
export function hasPolicyRights(b: Bank): boolean {
  if (!b.shareholders) return true;
  return (b.controlBps ?? 0) > 5000 || (b.board ? b.board.founderSide * 2 > b.board.total : false);
}

/**
 * Policy the AI board would veto when the founder lacks control: a very
 * thin loan spread, paying depositors above base rate, or a large salary.
 * Returns the reason, or null.
 */
export function boardVeto(
  world: World,
  b: Bank,
  policy: { loanSpreadPp?: number; depositRateBps?: number; salary?: number },
): string | null {
  if (hasPolicyRights(b)) return null;
  const m = getMarket(world, b.market);
  if (policy.loanSpreadPp !== undefined && policy.loanSpreadPp < 3)
    return 'The board vetoed it: a loan spread under 3 points leaves too little for losses.';
  if (policy.depositRateBps !== undefined && policy.depositRateBps > m.data.baseRateBps)
    return 'The board vetoed it: paying depositors above the base rate loses money.';
  if (policy.salary !== undefined && policy.salary > scale(col(m), 4))
    return 'The board vetoed it: that salary is more than the board will approve.';
  return null;
}

/** `bank.capital`: put more of your own money in (new shares at your founding price). */
export function addCapital(world: World, p: Player, bankId: Id, amount: number) {
  bankerOn(world);
  const b = myBank(world, p, bankId, ['applying', 'licensed']);
  ensure(b.shareholders, 'bank.capital', 'This bank’s capital can’t be topped up this way.');
  ensure(amount > 0, 'bank.capital', 'Put in some capital.');
  const m = getMarket(world, b.market);
  ensure(
    account(world, p.accounts.local).balance >= amount,
    'bank.funds',
    'You don’t have that much in your account.',
  );
  transfer(
    world,
    p.accounts.local,
    b.account,
    amount,
    `More capital for ${b.name}`,
    m.month,
    'capital',
  );
  const me = b.shareholders.find((s) => s.kind === 'founder')!;
  const votesPer = me.shares > 0 ? me.votes / me.shares : 1;
  me.capital += amount;
  me.shares += amount;
  me.votes += Math.round(amount * votesPer);
  remeasure(b);
  return { message: `Capital added. You own ${(b.ownerShareBps / 100).toFixed(1)}% now.` };
}

/**
 * A dividend paid to every shareholder by economic ownership: players (with
 * tax) to their accounts, AI groups to the outside world. Returns your part.
 */
export function payBankDividend(world: World, p: Player, b: Bank, amount: number, month: number) {
  const m = getMarket(world, b.market);
  const list = b.shareholders!;
  const total = sumShares(list);
  let left = amount;
  let mine = 0;
  let tax = 0;
  list.forEach((s, i) => {
    const part = i === list.length - 1 ? left : Math.floor((amount * s.shares) / total);
    left -= part;
    if (part <= 0) return;
    const player = s.playerId ? world.players[s.playerId] : undefined;
    const to = player ? player.accounts.local : (s.account ?? m.ext.lps);
    transfer(world, b.account, to, part, `${b.name} dividend`, month);
    if (player) {
      const t = Math.round(part * m.data.tax.capitalGains);
      transfer(world, to, m.ext.tax, t, 'Dividend tax', month);
      if (player.id === p.id) {
        mine = part;
        tax = t;
      }
    }
  });
  achieve(world, p, 'banker.first-dividend', 'First dividend', month);
  return {
    message: `Dividend paid. Your share: ${formatMoney(mine - tax, m.data.currency)} after tax.`,
  };
}

/** `bank.withdraw`: give up the application; the capital goes back to whoever put it in. */
export function withdrawBank(world: World, p: Player, bankId: Id) {
  bankerOn(world);
  const b = myBank(world, p, bankId, ['forming', 'applying']);
  returnCapital(world, b, getMarket(world, b.market).month);
  b.status = 'rejected';
  delete b.charter;
  return { message: `${b.name} withdrawn. The capital went back to the shareholders.` };
}

function returnCapital(world: World, b: Bank, month: number) {
  const m = getMarket(world, b.market);
  const memo = `${b.name}: capital returned`;
  if (b.charter) {
    // Not signed: only co-founders' money is in.
    for (const i of b.charter.invites) {
      if (i.status !== 'accepted') continue;
      const who = world.players[i.playerId];
      const to = i.ai ? world.funds[who?.angel?.fundId ?? '']?.account : who?.accounts.local;
      transferUpTo(world, b.account, to ?? m.ext.lps, i.amount, memo, month);
    }
  } else if (b.shareholders) {
    const bal = account(world, b.account).balance;
    const total = sumShares(b.shareholders);
    for (const s of b.shareholders) {
      const to = s.playerId ? world.players[s.playerId]?.accounts.local : s.account;
      if (!to) continue;
      transferUpTo(world, b.account, to, Math.floor((bal * s.shares) / total), memo, month);
    }
  }
  transferUpTo(world, b.account, m.ext.lps, account(world, b.account).balance, memo, month);
}

// ---------------------------------------------------------------- 2. the licence process

/** The fit-and-proper interview: at the Central Bank, by appointment, four questions. */
export function bankInterview(
  world: World,
  p: Player,
  bankId: Id,
  answers: readonly number[],
  now: number,
) {
  bankerOn(world);
  const b = myBank(world, p, bankId, ['applying']);
  const lic = b.licence!;
  ensure(
    !lic.interview || lic.interview.score < BANKERS.interviewPass,
    'bank.interview',
    'You passed the interview.',
  );
  const place = findPlace(placeId(b.market, 'central-bank'));
  ensure(place, 'place.missing', 'There’s no central bank here.');
  const access = placeAccess(world, p, place, now);
  ensure(
    access.ok,
    'bank.appointment',
    access.why === 'early'
      ? 'Your appointment at the Central Bank is later. Come back then.'
      : access.why === 'away'
        ? 'The Central Bank is in your home city.'
        : 'Book an appointment at the Central Bank first.',
  );
  const m = getMarket(world, b.market);
  const nowMin = gameMinute(m, now);
  const appt = (p.places?.appointments ?? []).find(
    (a) => a.placeId === place.id && nowMin >= a.at && nowMin < a.at + MONTH_MIN,
  );
  ensure(appt, 'bank.appointment', 'Book an appointment at the Central Bank first.');
  ensure(
    lic.interview?.at !== appt.at,
    'bank.interview',
    'You’ve had this interview. Book another appointment to try again.',
  );
  ensure(
    answers.length === BANK_INTERVIEW.length &&
      answers.every(
        (n, i) => Number.isInteger(n) && n >= 0 && n < BANK_INTERVIEW[i]!.options.length,
      ),
    'bank.answers',
    'Answer each question.',
  );
  spendHours(p, BANKERS.interviewHours, 'Central Bank interview');
  appt.attended = true;
  const scores = answers.map((n, i) => {
    const o = BANK_INTERVIEW[i]!.options[n]!;
    return o.fit * (0.8 + clamp(p.skills[o.skill] ?? 0, 0, 100) / 500);
  });
  const answered = scores.reduce((a, x) => a + x, 0) / scores.length;
  const bg = backgroundById(p.backgroundId);
  const f = bankFigures(world, b);
  const buffer = f.equity >= minCapitalOf(world, b) * 1.1 ? 1 : 0.5;
  const rng = deriveRng(world.seed, 'bankers', 'interview', b.id, lic.attempt, appt.at);
  const score = Math.round(
    clamp(
      100 *
        (0.05 +
          0.7 * clamp01(answered) +
          (bg?.role === 'banker' ? 0.08 : 0.03) +
          0.07 * clamp01(p.stars.value / 3) +
          0.1 * buffer) +
        rng.range(-BANKERS.interviewJitter, BANKERS.interviewJitter),
      0,
      100,
    ),
  );
  const weakest = BANK_INTERVIEW[scores.indexOf(Math.min(...scores))]!;
  lic.interview = { score, month: m.month, at: appt.at, weakest: weakest.id };
  const passed = score >= BANKERS.interviewPass;
  notify(world, p.id, {
    month: m.month,
    kind: passed ? 'system' : 'warning',
    text: passed
      ? `Fit-and-proper interview passed (${score}/100).`
      : `The regulator wasn’t convinced (${score}/100; they need ${BANKERS.interviewPass}). Weakest answer: “${weakest.text}” Book another appointment to try again.`,
  });
  const aip = checkAip(world, p, b);
  recordBankerTutorial(world, p);
  return { score, passed, weakest: weakest.id, aip, need: BANKERS.interviewPass };
}

export interface BankPlanInput {
  type: BankType;
  /** Capital the plan stands on (local minor units). */
  capital: number;
  /** The city's monthly cost of living (local minor units). */
  col: number;
  /** Monthly cost of the key people hired so far. */
  staffCost: number;
  plan: BankPlan;
}

export type PlanLevel = 'good' | 'warn' | 'bad';
export interface PlanCheck {
  id: 'fit' | 'capital' | 'growth' | 'funding' | 'opex' | 'branches';
  level: PlanLevel;
  values: Record<string, number>;
}

const band = (x: number, good: number, warn: number): PlanLevel =>
  x <= good ? 'good' : x <= warn ? 'warn' : 'bad';

/** Deposits a plan can expect by year three: branches for households, relationships for businesses. */
function plannedDeposits(i: BankPlanInput): number {
  const retail = BANK_TYPES[i.type].retail > 0;
  const perBranch = Math.round(i.col * (i.type === 'microfinance' ? 60 : 120));
  const branches = retail ? Math.min(i.plan.branches, 10) * perBranch : 0;
  const business =
    i.plan.segments.includes('small-business') || i.plan.segments.includes('corporates')
      ? Math.round(i.capital * 2)
      : 0;
  return branches + business;
}

/** What a plan's loans can be funded with: deposits (less the reserve) and capital. */
const fundingOf = (i: BankPlanInput) =>
  Math.round(plannedDeposits(i) * (1 - RESERVE_RATIO) + i.capital);

/**
 * The business plan's coherence, live as you write it (the LP strategy
 * checks' pattern): products and customers fit the licence, capital carries
 * the lending, growth is steady, deposits fund the loans, costs are covered
 * and the branch count suits the customers.
 */
export function bankPlanChecks(i: BankPlanInput): PlanCheck[] {
  const fit = TYPE_FIT[i.type];
  const lends = BANK_TYPES[i.type].personal || BANK_TYPES[i.type].companies;
  const [y1, y2, y3] = i.plan.lending;
  const misfits =
    i.plan.segments.filter((s) => !fit.segments.includes(s)).length +
    i.plan.products.filter((s) => !fit.products.includes(s)).length;
  const empty = !i.plan.segments.length || !i.plan.products.length;
  const capacity = Math.max(1, Math.round(i.capital / MIN_CAPITAL_RATIO));
  const deposits = plannedDeposits(i);
  const funding = fundingOf(i);
  const rent = Math.round(i.col * 0.4 * sizeOf(i.type));
  const costs =
    12 * (i.staffCost + i.plan.branches * rent + Math.round(i.col * BANK_TYPES[i.type].opexCol));
  // Year three: a margin on the loan book and fees on deposits (advisory banks: fees).
  const income = lends
    ? Math.round(y3 * 0.08 + deposits * 0.02)
    : Math.round(i.col * 12 * BANK_TYPES[i.type].opexCol * 1.5);
  const steady = y1 <= y2 && y2 <= y3;
  const needsBranches =
    BANK_TYPES[i.type].retail > 0 &&
    (i.plan.segments.includes('households') || i.plan.segments.includes('unbanked'));
  return [
    {
      id: 'fit',
      level: empty ? 'bad' : misfits === 0 ? 'good' : misfits === 1 ? 'warn' : 'bad',
      values: { misfits, segments: i.plan.segments.length, products: i.plan.products.length },
    },
    {
      id: 'capital',
      level: lends ? band(y3 / capacity, 0.7, 0.9) : y3 === 0 ? 'good' : 'warn',
      values: { lending: y3, capacity, ratio: y3 ? roundTo(i.capital / y3, 3) : 1 },
    },
    {
      id: 'growth',
      level: !lends
        ? 'good'
        : !steady
          ? 'bad'
          : y1 <= 0.4 * capacity && y3 > 0
            ? 'good'
            : y3 > 0
              ? 'warn'
              : 'bad',
      values: { y1, y2, y3, firstYearCap: Math.round(0.4 * capacity) },
    },
    {
      id: 'funding',
      level: lends ? band(y3 / Math.max(1, funding), 0.85, 1) : 'good',
      values: { lending: y3, funding, deposits },
    },
    {
      id: 'opex',
      // Costs a bank can't cover yet are a warning: lending more or fewer branches helps.
      level: costs <= income ? 'good' : 'warn',
      values: { costs, income },
    },
    {
      id: 'branches',
      level:
        i.plan.branches > 10
          ? 'bad'
          : needsBranches && i.plan.branches === 0
            ? 'warn'
            : i.plan.branches > 5
              ? 'warn'
              : 'good',
      values: { branches: i.plan.branches },
    },
  ];
}

/** A plan that passes, to start the player from (they change it). */
export function suggestedPlan(type: BankType, capital: number, cl: number): BankPlan {
  const fit = TYPE_FIT[type];
  const lends = BANK_TYPES[type].personal || BANK_TYPES[type].companies;
  const capacity = Math.round(capital / MIN_CAPITAL_RATIO);
  const plan: BankPlan = {
    segments: fit.segments.slice(0, 2),
    products: fit.products.slice(0, 3),
    branches: BANK_TYPES[type].retail > 0 ? 2 : 1,
    lending: [0, 0, 0],
  };
  const funding = fundingOf({ type, capital, col: cl, staffCost: 0, plan });
  const y3 = lends ? Math.min(Math.round(capacity * 0.55), Math.round(funding * 0.75)) : 0;
  const round = (x: number) => Math.floor(x / Math.max(1, cl)) * Math.max(1, cl);
  plan.lending = [round(y3 * 0.3), round(y3 * 0.65), round(y3)];
  return plan;
}

const staffCostOf = (b: Bank) =>
  Object.values(b.licence?.hires ?? {}).reduce((a, h) => a + (h?.salary ?? 0), 0);

function planInput(world: World, b: Bank, plan: BankPlan): BankPlanInput {
  return {
    type: b.type,
    capital: Math.max(0, bankFigures(world, b).equity),
    col: col(getMarket(world, b.market)),
    staffCost: staffCostOf(b),
    plan,
  };
}

const planPasses = (checks: PlanCheck[]) => !checks.some((c) => c.level === 'bad');

/** `bank.plan`: file the business plan (it must hold together: no red checks). */
export function filePlan(world: World, p: Player, bankId: Id, plan: BankPlan) {
  bankerOn(world);
  const b = myBank(world, p, bankId, ['applying']);
  const checks = bankPlanChecks(planInput(world, b, plan));
  ensure(
    planPasses(checks),
    'bank.plan',
    'The plan doesn’t hold together yet: fix the red checks first.',
  );
  if (!b.licence!.plan) spendHours(p, BANKERS.planHours, 'Bank business plan');
  b.licence!.plan = {
    segments: [...plan.segments],
    products: [...plan.products],
    branches: plan.branches,
    lending: [...plan.lending] as [number, number, number],
  };
  const aip = checkAip(world, p, b);
  return { checks, aip, message: 'Business plan filed with the regulator.' };
}

/** Approval in principle: a passed interview and a plan on file. */
function checkAip(world: World, p: Player, b: Bank): boolean {
  const lic = b.licence!;
  if (lic.aip !== undefined) return true;
  if (!lic.plan || !lic.interview || lic.interview.score < BANKERS.interviewPass) return false;
  const m = getMarket(world, b.market);
  lic.aip = m.month;
  notify(world, p.id, {
    month: m.month,
    kind: 'milestone',
    text: `Approval in principle for ${b.name}. Sign up your first clients before you open, and finish the checklist for the final licence.`,
  });
  return true;
}

/** Three candidates for a key role (the same three for this application). */
function bankCandidates(world: World, b: Bank, role: BankKeyRole): BankHire[] {
  const m = getMarket(world, b.market);
  const rng = deriveRng(world.seed, 'bankers', 'candidates', b.id, role, b.licence?.attempt ?? 1);
  const first = AI_FIRST_NAMES[b.market] ?? ['Alex'];
  const last = AI_LAST_NAMES[b.market] ?? ['Smith'];
  return [0, 1, 2].map((i) => {
    const quality = rng.int(35 + i * 10, 65 + i * 12);
    return {
      id: `c${i}`,
      name: `${rng.pick(first)} ${rng.pick(last)}`,
      quality,
      salary: scale(col(m), roundTo(0.15 + quality / 250, 2)),
    };
  });
}

/** You as the bank's CEO: how the regulator rates you (no salary beyond your policy). */
function selfAsCeo(p: Player): BankHire {
  const bg = backgroundById(p.backgroundId);
  return {
    id: 'self',
    name: p.name,
    quality: Math.round(
      clamp(
        25 +
          ((p.skills.finance ?? 0) + (p.skills.risk ?? 0)) / 3 +
          (bg?.role === 'banker' ? 15 : 0) +
          p.stars.value * 5,
        20,
        90,
      ),
    ),
    salary: 0,
  };
}

/** `bank.hire`: a CEO (or you), Chief Risk Officer, compliance officer, AML officer. */
export function hireKeyPerson(
  world: World,
  p: Player,
  bankId: Id,
  role: BankKeyRole,
  candidateId: string,
) {
  bankerOn(world);
  const b = myBank(world, p, bankId, ['applying', 'licensed']);
  ensure(b.licence, 'bank.hire', 'Not for this bank.');
  const hire =
    candidateId === 'self'
      ? role === 'ceo'
        ? selfAsCeo(p)
        : fail('bank.hire', 'You can be the CEO; hire the others.')
      : bankCandidates(world, b, role).find((c) => c.id === candidateId);
  ensure(hire, 'bank.hire', 'No such candidate.');
  b.licence.hires[role] = hire;
  return { hire, message: `${hire.name} joins ${b.name}.` };
}

/** Rent a branch in this district costs a month (and the fit-out, once). */
function branchRent(world: World, b: Pick<Bank, 'market' | 'type'>, district: string) {
  const w = districtWeights(b.market).find((d) => d.district === district)?.w ?? 1;
  return scale(col(getMarket(world, b.market)), roundTo((0.25 + w * 0.1) * sizeOf(b.type), 2));
}

const systemCost = (world: World, b: Pick<Bank, 'market' | 'type'>, s: BankSystemId) =>
  scale(col(getMarket(world, b.market)), roundTo(BANK_SYSTEMS[s].costCol * sizeOf(b.type), 2));

/** `bank.setup`: the core banking system (cost vs reliability) and the first branch. */
export function setupBank(
  world: World,
  p: Player,
  bankId: Id,
  args: { system?: BankSystemId; district?: string },
) {
  bankerOn(world);
  const b = myBank(world, p, bankId, ['applying', 'licensed']);
  ensure(b.licence, 'bank.setup', 'Not for this bank.');
  ensure(args.system || args.district, 'bank.setup', 'Choose a system or a district.');
  const m = getMarket(world, b.market);
  const bits: string[] = [];
  if (args.system) {
    ensure(b.licence.system !== args.system, 'bank.setup', 'That system is already installed.');
    const cost = systemCost(world, b, args.system);
    ensure(account(world, b.account).balance >= cost, 'bank.funds', 'The bank can’t pay for that.');
    transfer(
      world,
      b.account,
      m.ext.suppliers,
      cost,
      `Core banking system (${args.system})`,
      m.month,
    );
    b.licence.system = args.system;
    bits.push(`${args.system} core banking system installed`);
  }
  if (args.district) {
    ensure(
      (CITY_DISTRICTS[b.market] ?? []).includes(args.district),
      'bank.setup',
      'Pick a district of this city.',
    );
    ensure(
      b.licence.branch?.district !== args.district,
      'bank.setup',
      'Your branch is already there.',
    );
    const rent = branchRent(world, b, args.district);
    const fitOut = rent * 2;
    ensure(
      account(world, b.account).balance >= fitOut,
      'bank.funds',
      'The bank can’t pay for that.',
    );
    transfer(
      world,
      b.account,
      m.ext.suppliers,
      fitOut,
      `Branch fit-out: ${districtLabel(args.district)}`,
      m.month,
    );
    b.licence.branch = { district: args.district, rent };
    bits.push(`branch leased in ${districtLabel(args.district)}`);
  }
  return { message: `${bits.join('; ')}.` };
}

/** AI businesses in the city that would bank with you before you open (the same ones each time). */
function preopeningProspects(world: World, b: Bank) {
  const strategic = (b.shareholders ?? []).some((s) => s.id === 'ai:g3');
  const n = BANKERS.prospects + (strategic ? BANKERS.strategicProspects : 0);
  return Object.values(world.companies)
    .filter((c) => c.ai && c.market === b.market && c.status === 'active' && !isEstablished(c))
    .map((c) => ({ c, k: hashString(`${b.id}:${c.id}`) }))
    .sort((x, y) => x.k - y.k || (x.c.id < y.c.id ? -1 : 1))
    .slice(0, n)
    .map((x) => x.c);
}

/** `bank.client`: sign up a first corporate client (after approval in principle). */
export function signClient(world: World, p: Player, bankId: Id, companyId: Id) {
  bankerOn(world);
  const b = myBank(world, p, bankId, ['applying']);
  const lic = b.licence!;
  ensure(lic.aip !== undefined, 'bank.aip', 'Clients sign up after approval in principle.');
  ensure(!lic.clients.includes(companyId), 'bank.client', 'They’ve already signed up.');
  const c = preopeningProspects(world, b).find((x) => x.id === companyId);
  ensure(c, 'bank.client', 'They aren’t looking for a new bank.');
  ensure(locationOf(p) === b.market, 'bank.away', 'Meet them in your city.');
  spendHours(p, BANKERS.clientHours, `Meeting ${c.name}`);
  lic.clients.push(companyId);
  return { message: `${c.name} will bank with ${b.name} when you open.` };
}

/** What the licence still needs (ids the client words), in checklist order. */
export function licenceMissing(b: Bank): string[] {
  const lic = b.licence;
  if (!lic) return [];
  const out: string[] = [];
  if (!lic.interview || lic.interview.score < BANKERS.interviewPass) out.push('interview');
  if (!lic.plan) out.push('plan');
  for (const r of BANK_KEY_ROLES) if (!lic.hires[r]) out.push(`hire.${r}`);
  if (!lic.system) out.push('system');
  if (!lic.branch) out.push('branch');
  return out;
}

/** The decision's parts (0–1 each) and the score (0–100), for the regulator and the tracker. */
function licenceScore(world: World, b: Bank) {
  const lic = b.licence!;
  const owner = world.players[b.ownerId];
  const f = bankFigures(world, b);
  const need = minCapitalOf(world, b);
  const checks = lic.plan ? bankPlanChecks(planInput(world, b, lic.plan)) : [];
  const parts = {
    interview: (lic.interview?.score ?? 0) / 100,
    plan: checks.length
      ? checks.reduce((a, c) => a + (c.level === 'good' ? 1 : c.level === 'warn' ? 0.5 : 0), 0) /
        checks.length
      : 0,
    people:
      BANK_KEY_ROLES.reduce((a, r) => a + (lic.hires[r]?.quality ?? 0), 0) /
      (100 * BANK_KEY_ROLES.length),
    systems: lic.system ? BANK_SYSTEMS[lic.system].reliability : 0,
    capital: clamp01(0.5 + (f.equity / Math.max(1, need) - 1) / 0.3),
    credit: owner ? clamp01(creditProfile(world, owner).score / 100) : 0,
  };
  const strategic = (b.shareholders ?? []).some((s) => s.id === 'ai:g3');
  const score = Math.round(
    100 *
      (0.3 * parts.interview +
        0.2 * parts.plan +
        0.25 * parts.people +
        0.1 * parts.systems +
        0.1 * parts.capital +
        0.05 * parts.credit) +
      (strategic ? BANKERS.strategicHelp : 0),
  );
  return { parts, score, equity: f.equity, need };
}

/** The licence's capital check: now, the minimum, this month's costs and any shortfall. */
function licenceCapital(world: World, b: Bank) {
  const equity = bankFigures(world, b).equity;
  const need = minCapitalOf(world, b);
  const costs = staffCostOf(b) + (b.licence?.branch?.rent ?? 0);
  const decidedAfterCosts = !feedbackOn(world);
  const counted = decidedAfterCosts ? equity - costs : equity;
  return { equity, need, costs, decidedAfterCosts, short: Math.max(0, need - counted) };
}

/** Reasons a weak part gives (ids the client words; English for the inbox). */
const REASONS: Record<string, string> = {
  capital: 'Capital is below the minimum: add capital.',
  credit: 'Your credit record is weak: clear defaults and debts.',
  interview: 'The fit-and-proper interview was weak: book another and answer again.',
  plan: 'The business plan has weak spots: revise it.',
  people: 'The key people are not strong enough: hire stronger candidates.',
  systems: 'The core banking system is not reliable enough: choose a better one.',
};

/** Month end for bankers' banks: salaries and rent, the licence decision, vesting and conditions. */
export function settleBankers(world: World, market: string, month: number) {
  if (!bankersOn(world)) return;
  for (const b of Object.values(world.banks)) {
    if (b.market !== market || !b.licence) continue;
    if (b.status !== 'applying' && b.status !== 'licensed') continue;
    const m = getMarket(world, b.market);
    const owner = world.players[b.ownerId];
    // Play-test (FEEDBACK_NOTE): the regulator decides on the capital the
    // checklist showed, before this month's salaries and rent are taken.
    const early = b.status === 'applying' && feedbackOn(world);
    if (early) decide(world, b, month);
    // Key people and the branch are paid from the bank's account.
    const staff = staffCostOf(b);
    let paid = 0;
    if (staff)
      paid += transferUpTo(world, b.account, m.ext.payroll, staff, 'Key staff salaries', month);
    if (b.licence.branch)
      paid += transferUpTo(
        world,
        b.account,
        m.ext.suppliers,
        b.licence.branch.rent,
        'Branch rent',
        month,
      );
    if (b.status === 'licensed') {
      b.lastMonth.opex += paid;
      b.lastMonth.net -= paid;
      vest(world, b, month);
      if (b.conditions && month >= b.conditions.untilMonth) {
        delete b.conditions;
        if (owner)
          notify(world, owner.id, {
            month,
            kind: 'system',
            text: `The regulator lifted the conditions on ${b.name}'s licence.`,
          });
      }
      continue;
    }
    if (!early) decide(world, b, month);
  }
}

/** The review's length: 30 days and one month end once FEEDBACK_NOTE is logged. */
const reviewDays = (world: World) => (feedbackOn(world) ? 30 : BANKERS.reviewDays);
const reviewMonths = (world: World) => (feedbackOn(world) ? 1 : BANKERS.reviewMonths);

function decide(world: World, b: Bank, month: number) {
  const lic = b.licence!;
  const owner = world.players[b.ownerId];
  if (month - lic.filedMonth < reviewMonths(world)) return;
  const missing = licenceMissing(b);
  const reasons: string[] = [];
  let outcome: 'approved' | 'conditions' | 'refused';
  const s = licenceScore(world, b);
  if (missing.length) {
    if (month - lic.filedMonth < BANKERS.lapseMonths) return;
    outcome = 'refused';
    reasons.push('lapsed');
  } else {
    const hard: string[] = [];
    if (s.equity < s.need) hard.push('capital');
    if (owner && creditProfile(world, owner).defaults > 0) hard.push('credit');
    if (hard.length) {
      outcome = 'refused';
      reasons.push(...hard);
    } else if (s.score >= BANKERS.approve) outcome = 'approved';
    else if (s.score >= BANKERS.conditions) outcome = 'conditions';
    else outcome = 'refused';
    if (outcome !== 'approved') {
      const weak = (Object.keys(s.parts) as (keyof typeof s.parts)[])
        .filter((k) => !reasons.includes(k) && s.parts[k] < 0.6)
        .sort((x, y) => s.parts[x] - s.parts[y] || (x < y ? -1 : 1));
      reasons.push(...weak);
    }
  }
  lic.decision = { month, outcome, score: s.score, reasons };
  if (outcome === 'refused') {
    // Re-apply: what was weak is done again, and the review runs again from now.
    lic.attempt += 1;
    lic.filedMonth = month;
    lic.filedMin = month * MONTH_MIN;
    if (reasons.includes('interview')) delete lic.interview;
    if (reasons.includes('plan')) delete lic.plan;
    if (reasons.includes('people'))
      for (const r of BANK_KEY_ROLES) if ((lic.hires[r]?.quality ?? 0) < 60) delete lic.hires[r];
    if (reasons.includes('systems')) delete lic.system;
    if (owner)
      notify(world, owner.id, {
        month,
        kind: 'warning',
        text: `Licence refused for ${b.name} (score ${s.score}). ${reasons
          .map((r) => (r === 'lapsed' ? 'The checklist wasn’t finished in time.' : REASONS[r]))
          .join(' ')} Fix it and the regulator reviews it again.`,
      });
    return;
  }
  b.status = 'licensed';
  b.licensedMonth = month;
  if (outcome === 'conditions') {
    const f = bankFigures(world, b);
    b.conditions = {
      lendingCap: Math.round((Math.max(0, f.equity) / MIN_CAPITAL_RATIO) * BANKERS.conditionCap),
      ...(s.parts.capital < 0.6 ? { minCapitalRatio: BANKERS.conditionRatio } : {}),
      untilMonth: month + BANKERS.conditionMonths,
    };
  }
  // First clients move their accounts in on opening day.
  let moved = 0;
  for (const id of lic.clients) {
    const c = world.companies[id];
    if (!c || c.status !== 'active' || !BANK_TYPES[b.type].companies) continue;
    const acc = world.accounts[c.account];
    if (acc) {
      acc.bankId = b.id;
      moved++;
    }
  }
  vest(world, b, month);
  if (owner) {
    achieve(world, owner, 'banker.licence', 'Licence granted', month);
    notify(world, owner.id, {
      month,
      kind: 'system',
      text:
        outcome === 'approved'
          ? `Licence granted: ${b.name} is open for business${moved ? ` with ${moved} clients` : ''}.`
          : `Licence granted with conditions: ${b.name} is open, with a lending cap for ${BANKERS.conditionMonths} months. ${reasons.map((r) => REASONS[r]).join(' ')}`,
    });
  }
}

/** Performance shares vest on their milestones: the licence, a profitable month, 1,000 customers. */
function vest(world: World, b: Bank, month: number) {
  if (!b.vesting?.length || !b.shareholders) return;
  const founder = b.shareholders.find((s) => s.kind === 'founder');
  if (!founder) return;
  const f = bankFigures(world, b);
  let changed = false;
  for (const g of b.vesting) {
    if (g.vestedMonth !== undefined) continue;
    const due =
      g.milestone === 'licence'
        ? b.status === 'licensed'
        : g.milestone === 'profit'
          ? b.status === 'licensed' && b.licensedMonth !== month && b.lastMonth.net > 0
          : f.customers >= BANKERS.sizeCustomers;
    if (!due) continue;
    g.vestedMonth = month;
    const votesPer = founder.shares ? founder.votes / founder.shares : 1;
    founder.shares += g.shares;
    founder.votes += Math.round(g.shares * votesPer);
    changed = true;
    notify(world, b.ownerId, {
      month,
      kind: 'milestone',
      text: `Performance shares vested (${g.milestone}) at ${b.name}.`,
    });
  }
  if (changed) remeasure(b);
}

// ---------------------------------------------------------------- 3. tutorial

export const BANKER_TUTORIAL_STEPS = ['name', 'negotiate', 'sign', 'book', 'interview'] as const;
export type BankerTutorialStep = (typeof BANKER_TUTORIAL_STEPS)[number];

/** The bank this banker runs (any status but failed/refused), newest first. */
export function currentBank(world: World, p: Player): Bank | undefined {
  return Object.values(world.banks)
    .filter((b) => b.ownerId === p.id && b.status !== 'failed' && b.status !== 'rejected')
    .sort((a, b) => b.appliedMonth - a.appliedMonth || (a.id < b.id ? 1 : -1))[0];
}

function bankerStepDone(world: World, p: Player, step: BankerTutorialStep): boolean {
  const b = currentBank(world, p);
  if (!b) return false;
  const signed = b.status !== 'forming';
  switch (step) {
    case 'name':
      return true;
    case 'negotiate':
      return signed || !!b.charter?.touched;
    case 'sign':
      return signed;
    case 'book': {
      if (b.status === 'licensed' || b.licence?.interview) return true;
      const id = placeId(b.market, 'central-bank');
      return (p.places?.appointments ?? []).some((a) => a.placeId === id);
    }
    case 'interview':
      return b.status === 'licensed' || !!b.licence?.interview;
  }
}

/** A new banker's first session begins (bankers worlds only). */
export function startBankerTutorial(world: World, p: Player) {
  if (!bankersOn(world) || p.ai || p.role !== 'banker' || p.bankerTutorial) return;
  p.bankerTutorial = { startedMonth: homeMonth(world, p) };
}

function bankerTutorialStep(world: World, p: Player): BankerTutorialStep | null {
  const t = p.bankerTutorial;
  if (!t || t.doneMonth !== undefined || t.skipped) return null;
  return BANKER_TUTORIAL_STEPS.find((s) => !bankerStepDone(world, p, s)) ?? null;
}

/** Finished? Record it (after a command of the banker's). */
export function recordBankerTutorial(world: World, p: Player) {
  const t = p.bankerTutorial;
  if (!t || t.doneMonth !== undefined || t.skipped) return;
  if (bankerTutorialStep(world, p) !== null) return;
  const month = homeMonth(world, p);
  t.doneMonth = month;
  achieve(world, p, 'banker.first-session', 'First session', month);
}

/** `banker.tutorial`: skip it (nothing else needs a click: every step is a real act). */
export function bankerTutorialCommand(world: World, p: Player, action: 'skip') {
  bankerOn(world);
  ensure(p.role === 'banker', 'tutorial.role', 'The banker first session is for bankers.');
  p.bankerTutorial ??= { startedMonth: homeMonth(world, p) };
  if (action === 'skip') {
    p.bankerTutorial.skipped = true;
    p.bankerTutorial.doneMonth = homeMonth(world, p);
  }
  return { step: bankerTutorialStep(world, p) };
}

// ---------------------------------------------------------------- the view

/** `view.banker`: the negotiation, the licence tracker and checklist, and the first session. */
export function bankerView(world: World, p: Player, now: number) {
  if (!bankersOn(world)) return null;
  const b = currentBank(world, p);
  const m = getMarket(world, p.market);
  const t = p.bankerTutorial;
  const invitations = Object.values(world.banks)
    .filter((x) => x.status === 'forming' && x.charter)
    .flatMap((x) =>
      x
        .charter!.invites.filter((i) => i.playerId === p.id && i.status === 'open')
        .map((i) => ({
          bankId: x.id,
          bankName: x.name,
          from: world.players[x.ownerId]?.name ?? '',
          amount: i.amount,
        })),
    );
  const tutorial = t
    ? {
        step: bankerTutorialStep(world, p),
        steps: BANKER_TUTORIAL_STEPS.map((s) => ({ id: s, done: bankerStepDone(world, p, s) })),
        done: t.doneMonth !== undefined,
        skipped: !!t.skipped,
      }
    : null;
  const base = {
    currency: m.data.currency,
    invitations,
    tutorial,
    centralBank: placeId(m.id, 'central-bank'),
  };
  if (!b || (!b.charter && !b.licence)) return { ...base, bank: null };
  const minCapital = minCapitalOf(world, b);
  const forming = b.charter
    ? {
        contribution: b.charter.contribution,
        dualClass: b.charter.dualClass,
        performanceBps: b.charter.performanceBps,
        offers: bankOffers(world, b),
        preview: capTablePreview(world, b),
        invites: b.charter.invites,
        counterScore: counterScore(world, p, b),
        /** Would each counter-offer land today, by group and ask (the same rule as `bank.counter`)? */
        counterOdds: Object.fromEntries(
          bankOffers(world, b).map((o) => {
            const score = counterScore(world, p, b);
            return [
              o.id,
              {
                price: score >= counterNeed(o.style, 'price'),
                seat: score >= counterNeed(o.style, 'seat'),
                voting: score >= counterNeed(o.style, 'voting'),
              },
            ];
          }),
        ) as Record<string, Record<BankCounterAsk, boolean>>,
        maxPerformanceBps: BANKERS.maxPerformanceBps,
        angels: knownAngels(world, p).map((x) => ({
          playerId: x.angel.id,
          name: x.angel.name,
          warmth: roundTo(x.warmth, 2),
          maxCheque: world.funds[x.angel.angel!.fundId]?.check[1] ?? 0,
        })),
        friends: Object.values(world.players)
          .filter(
            (x) => !x.ai && x.id !== p.id && x.market === p.market && (p.trust[x.id] ?? 0) > 0,
          )
          .map((x) => ({ playerId: x.id, name: x.name })),
        balance: account(world, p.accounts.local).balance,
        types: (Object.keys(BANK_TYPES) as BankType[]).map((id) => ({
          id,
          minCapital: scale(col(m), BANK_TYPES[id].minCapitalCol),
        })),
      }
    : null;
  const lic = b.licence;
  const nowMin = gameMinute(getMarket(world, b.market), now);
  const licence = lic
    ? {
        day: clamp(Math.floor((nowMin - lic.filedMin) / DAY_MIN) + 1, 1, reviewDays(world)),
        reviewDays: reviewDays(world),
        decisionMonth: lic.filedMonth + reviewMonths(world),
        attempt: lic.attempt,
        aip: lic.aip ?? null,
        missing: licenceMissing(b),
        interview: lic.interview ?? null,
        interviewPass: BANKERS.interviewPass,
        questions: BANK_INTERVIEW.map((q) => ({
          id: q.id,
          topic: q.topic,
          text: q.text,
          options: q.options.map((o) => o.text),
        })),
        plan: lic.plan ?? null,
        suggestedPlan: suggestedPlan(b.type, Math.max(0, bankFigures(world, b).equity), col(m)),
        /** What the live plan checks stand on (bankPlanChecks with the plan being written). */
        planBase: {
          type: b.type,
          capital: Math.max(0, bankFigures(world, b).equity),
          col: col(m),
          staffCost: staffCostOf(b),
        },
        checks: lic.plan ? bankPlanChecks(planInput(world, b, lic.plan)) : null,
        segments: BANK_SEGMENTS,
        products: BANK_PRODUCTS,
        fit: TYPE_FIT[b.type],
        hires: lic.hires,
        candidates: Object.fromEntries(
          BANK_KEY_ROLES.map((r) => [
            r,
            [...(r === 'ceo' ? [selfAsCeo(p)] : []), ...bankCandidates(world, b, r)],
          ]),
        ) as Record<BankKeyRole, BankHire[]>,
        system: lic.system ?? null,
        systems: (Object.keys(BANK_SYSTEMS) as BankSystemId[]).map((id) => ({
          id,
          cost: systemCost(world, b, id),
          reliability: BANK_SYSTEMS[id].reliability,
        })),
        branch: lic.branch ? { ...lic.branch, label: districtLabel(lic.branch.district) } : null,
        districts: (CITY_DISTRICTS[b.market] ?? []).map((d) => ({
          id: d,
          label: districtLabel(d),
          rent: branchRent(world, b, d),
        })),
        clients: lic.clients,
        prospects: preopeningProspects(world, b).map((c) => ({
          id: c.id,
          name: c.name,
          industry: c.industry,
          signed: lic.clients.includes(c.id),
        })),
        decision: lic.decision ?? null,
        /**
         * Capital against the minimum (play-test: say it before month end).
         * From the feedback round the regulator decides before this month's
         * costs; before it, on what is left after them (`decidedAfterCosts`).
         */
        capital: licenceCapital(world, b),
        score: licenceScore(world, b).score,
        approveAt: BANKERS.approve,
        conditionsAt: BANKERS.conditions,
      }
    : null;
  return {
    ...base,
    bank: {
      id: b.id,
      name: b.name,
      type: b.type,
      status: b.status,
      minCapital,
      forming,
      licence,
      shareholders: b.shareholders ?? null,
      ownershipBps: b.ownerShareBps,
      controlBps: b.controlBps ?? null,
      board: b.board ?? null,
      policyRights: hasPolicyRights(b),
      vesting: b.vesting ?? [],
      conditions: b.conditions ?? null,
    },
  };
}
