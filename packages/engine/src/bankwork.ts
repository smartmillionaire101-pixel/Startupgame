/**
 * Banker work (player feedback, 23 October 2026: "Bankers have nothing to
 * do... while waiting for the central bank, what do I do in the meantime?
 * Also when I visit other places (banks or institutions) there is no
 * value"). Bankers note worlds only (`bankersOn`).
 *
 *  - The advisory desk: a banker (or anyone running a bank) takes mandates
 *    from the city's companies: raise debt (structure a loan and pick the
 *    lender, other bankers' banks included), arrange a bond, sell a company,
 *    or review a company's readiness to list. Clients are AI startups, local
 *    businesses and the city's established companies (data/bankwork.ts), so
 *    a new banker always finds work; human founders ask for an adviser with
 *    `banker.request`. Each mandate is a few real calls, scored against the
 *    client's numbers (its credit band and how it makes cash). A good deal
 *    closes and pays a success fee through the ledger: from the client to
 *    your licensed bank (its fees and its advisory league table), or to you
 *    before you have one (taxed as income). Reputation, skills and a track
 *    record (`advisoryRecord`) follow, for the licence and shareholders.
 *  - Conversations: at an AI bank, its chief executive, treasurer and head
 *    of risk share how they run a bank (a lesson: skill, network, a contact);
 *    a staff member open to a move joins your recruits; the treasurer can
 *    arrange an interbank credit line your bank draws when short (base rate
 *    plus a spread, interest through the ledger). At the Central Bank a
 *    supervisor explains the rules and checks your bank's standing; at the
 *    Chamber of Commerce and the Founders' Hub owners and founders become
 *    clients who bank with you once you're licensed, and advisory leads; the
 *    Stock Exchange's listing desk sets out what listing your bank takes.
 *    Each conversation once a month per place, and a few a month in all.
 *
 * Reputation (FEEDBACK_NOTE; player feedback: "Opportunity to have more
 * advisory positions because I scored well and people can hear about me"):
 * the mandates on your record are scored 0–100 and read as a star rating.
 * Good scores open bigger clients (mid-size, then big: listings and the
 * largest deals), add mandates to the desk and to what you can hold, and a
 * deal scored 80+ brings a referral: another client who heard about it comes
 * to your desk by name. Bankers at the city's banking events meet clients
 * too (`eventLead`). Without the note the desk is as it was: every client
 * size, the same counts, no referrals.
 *
 * Determinism: the desk is a pure function of the world (each candidate is
 * ranked by its own hash, so one company opening or closing never reshuffles
 * the rest); conversations draw from the 'bankwork' RNG label keyed by the
 * player, the place and the month. Money moves only through the ledger.
 */
import { addContact } from './events.js';
import {
  BANK_LESSONS,
  BANK_TALKS,
  BANKER_NAMES,
  BANKWORK,
  CLIENT_TIERS,
  CORPORATES,
  FIT,
  LENDER_FIT,
  LENDER_WHY,
  MANDATES,
  PLACE_TALKS,
  RECRUIT_ROLES,
  REPUTATION,
  STEPS,
  TALKS,
  bankLessonById,
  type BankLesson,
  type ClientBand,
  type ClientShape,
  type ClientTier,
  type MandateKind,
  type StepId,
  type TalkTopic,
} from './data/bankwork.js';
import { INDUSTRY_LABEL } from './data/industries.js';
import type { MarketId } from './data/markets.js';
import {
  BANK_TYPES,
  LICENCE_MONTHS,
  MIN_CAPITAL_RATIO,
  RESERVE_RATIO,
  bankFigures,
} from './banks.js';
import { ensure, fail } from './errors.js';
import {
  col,
  getMarket,
  lastPnl,
  locationOf,
  notify,
  spendHours,
  isEstablished,
} from './helpers.js';
import { account, transfer, transferUpTo } from './ledger.js';
import { clamp, roundTo } from './math.js';
import { formatMoney, scale } from './money.js';
import { findPlace, placeAccess } from './places.js';
import { bankersOn, feedbackOn } from './releases.js';
import { deriveRng, hashString } from './rng.js';
import { applyStarEvent } from './stars.js';
import { monthlyGrowth, valueCompany } from './valuation.js';
import { WORK } from './work.js';
import type {
  AdvisoryDeal,
  AdvisoryMandate,
  Bank,
  BankClientLead,
  BankerTalk,
  BankerWork,
  BankRecruit,
  Company,
  Id,
  LocalBusiness,
  MandateClient,
  MarketState,
  Player,
  World,
} from './types.js';

// ---------------------------------------------------------------- who and what

/** The bank a player runs (applying or licensed), if any. */
export function bankOf(world: World, p: Player): Bank | undefined {
  return Object.values(world.banks)
    .filter(
      (b) =>
        b.ownerId === p.id &&
        (b.status === 'licensed' || b.status === 'applying' || b.status === 'forming'),
    )
    .sort((a, b) => b.appliedMonth - a.appliedMonth || (a.id < b.id ? -1 : 1))[0];
}

/** A human banker (or anyone running a bank) in a bankers-note world. */
export const isBankerWorker = (world: World, p: Player | undefined): p is Player =>
  !!p && !p.ai && bankersOn(world) && (p.role === 'banker' || !!bankOf(world, p));

/** The banker's work record, created on first use. */
const workOf = (p: Player): BankerWork =>
  (p.bankwork ??= {
    active: [],
    taken: [],
    record: { deals: 0, lost: 0, fees: 0, qualitySum: 0, byKind: {} },
    history: [],
    lessons: [],
    talks: [],
    talked: {},
    talkMonth: { month: -1, n: 0 },
    recruits: [],
    clients: [],
    leads: [],
  });

const homeMonth = (world: World, p: Player) => getMarket(world, p.market).month;

const skillUp = (p: Player, s: 'finance' | 'negotiation' | 'risk' | 'investing', n: number) => {
  const before = p.skills[s] ?? 0;
  if (before < WORK.skillCap) p.skills[s] = Math.min(WORK.skillCap, before + n);
  return (p.skills[s] ?? 0) - before;
};

const networkUp = (p: Player, n: number) => {
  p.network = Math.min(100, p.network + n);
  return n;
};

// ---------------------------------------------------------------- clients

interface Candidate {
  client: MandateClient;
  band: ClientBand;
  shape: ClientShape;
  revenue: number;
  value: number;
  kinds: MandateKind[];
}

const customersOf = (c: Company) =>
  Object.values(c.segments).reduce((a, s) => a + (s.paying ?? 0), 0);

const SHAPE_BY_INDUSTRY: Record<string, ClientShape> = {
  fintech: 'growth',
  saas: 'growth',
  edtech: 'growth',
  healthtech: 'growth',
  ecommerce: 'seasonal',
  logistics: 'asset-heavy',
  agritech: 'asset-heavy',
};

function companyCandidate(world: World, c: Company): Candidate | null {
  const m = getMarket(world, c.market);
  const revenue = Math.max(lastPnl(c)?.revenue ?? 0, customersOf(c) * c.price);
  const value = Math.max(
    c.capTable.lastPostMoney,
    valueCompany(world, c, c.lastRound ?? 'pre-seed').value,
    0,
  );
  const cash = world.accounts[c.account]?.balance ?? 0;
  const net = lastPnl(c)?.net ?? 0;
  const growth = monthlyGrowth(c);
  const band: ClientBand =
    c.stars.value < 2 || (net < 0 && cash < -net * 3)
      ? 'stretched'
      : c.stars.value >= 3.5 && growth > 0.02
        ? 'strong'
        : 'steady';
  const kinds: MandateKind[] = [];
  if (c.ipo) {
    // A listed company borrows and issues bonds; it is past selling privately or listing.
    if (revenue > 0) kinds.push('debt', 'bond');
  } else {
    if (revenue > 0) kinds.push('debt', 'sale');
    if (['series-b', 'series-c'].includes(c.lastRound ?? '') || value >= scale(col(m), 3000))
      kinds.push('ipo');
  }
  if (!kinds.length) return null;
  return {
    client: {
      key: `c:${c.id}`,
      name: c.name,
      kind: 'company',
      refId: c.id,
      sector: INDUSTRY_LABEL[c.industry] ?? c.industry,
    },
    band,
    shape: SHAPE_BY_INDUSTRY[c.industry] ?? 'cash-flow',
    revenue,
    value,
    kinds,
  };
}

function businessCandidate(b: LocalBusiness): Candidate | null {
  if (b.closedMonth !== undefined || b.monthlyTakings <= 0 || b.kind.startsWith('employer-'))
    return null;
  const kind = b.gen?.kind ?? b.kind;
  const shape: ClientShape =
    /restaurant|cafe|caff|bar|lounge|club|hotel|spa|cinema|bakery|food|grill|bowling|skydive|heli/.test(
      kind,
    )
      ? 'seasonal'
      : /courier|garage|workshop|depot|farm|transport|clinic|pharmacy|warehouse/.test(kind)
        ? 'asset-heavy'
        : 'cash-flow';
  return {
    client: {
      key: `b:${b.id}`,
      name: b.gen?.name ?? b.name,
      kind: 'business',
      refId: b.id,
      sector: kind.replace(/-/g, ' '),
    },
    band: b.health >= 0.7 ? 'strong' : b.health < 0.4 ? 'stretched' : 'steady',
    shape,
    revenue: b.monthlyTakings,
    value: Math.round(b.monthlyTakings * 12 * 1.2),
    kinds: ['debt', 'sale'],
  };
}

function corporateCandidate(m: MarketState, i: number): Candidate {
  const k = CORPORATES[i]!;
  const revenue = scale(col(m), k.revenueCol);
  return {
    client: {
      key: `k:${i}`,
      name: `${m.data.name} ${k.name}`,
      kind: 'corporate',
      refId: null,
      sector: k.sector,
    },
    band: k.band,
    shape: k.shape,
    revenue,
    value: Math.round(revenue * 12 * 1.5),
    kinds: [...k.kinds],
  };
}

function candidateFor(world: World, m: MarketState, key: string): Candidate | null {
  const [kind, ref] = [key.slice(0, 1), key.slice(2)];
  if (kind === 'c') {
    const c = world.companies[ref];
    return c && c.market === m.id && c.status === 'active' ? companyCandidate(world, c) : null;
  }
  if (kind === 'b') {
    const b = m.businesses?.[ref];
    return b ? businessCandidate(b) : null;
  }
  if (kind === 'k') {
    const i = Number(ref);
    return CORPORATES[i] ? corporateCandidate(m, i) : null;
  }
  return null;
}

/** Every client in a city who might want an adviser, with what they might want. */
function candidates(world: World, p: Player, m: MarketState): Candidate[] {
  const out: Candidate[] = [];
  for (const c of Object.values(world.companies)) {
    if (!c.ai || c.market !== m.id || c.status !== 'active' || isEstablished(c)) continue;
    if (c.founderIds.includes(p.id)) continue;
    const x = companyCandidate(world, c);
    if (x) out.push(x);
  }
  for (const b of Object.values(m.businesses ?? {})) {
    const x = businessCandidate(b);
    if (x) out.push(x);
  }
  for (let i = 0; i < CORPORATES.length; i++) out.push(corporateCandidate(m, i));
  return out;
}

// ---------------------------------------------------------------- the desk

export interface MandateOffer {
  id: string;
  kind: MandateKind;
  client: MandateClient;
  band: ClientBand;
  shape: ClientShape;
  revenue: number;
  value: number;
  /** The fee for a good piece of work (quality 0.75). */
  estFee: number;
  hours: number;
  /** A human founder asked for an adviser. */
  requested: boolean;
  /** Someone you met sent them your way. */
  lead: boolean;
  /** How big the client is (what the deal is about). */
  tier: ClientTier;
  /** A referral: the client whose deal they heard about (FEEDBACK_NOTE). */
  referredBy: string | null;
  /** Met at this city event (FEEDBACK_NOTE). */
  metAt: string | null;
}

const mandateId = (month: number, key: string, kind: MandateKind) => `md:${month}:${key}:${kind}`;

/** Lenders a debt mandate can go to: the city's AI lenders and licensed player banks. */
function lendersFor(world: World, p: Player, m: MarketState) {
  const ai = Object.values(m.lenders ?? {})
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((l) => ({ id: `lender:${l.id}`, name: l.name, kind: l.kind as string }));
  const banks = Object.values(world.banks)
    .filter((b) => b.market === m.id && b.status === 'licensed' && BANK_TYPES[b.type].companies)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((b) => ({
      id: `bank:${b.id}`,
      name: b.name,
      kind: b.ownerId === p.id ? 'own' : 'player',
    }));
  return [...ai.slice(0, 5), ...banks.slice(0, 3)];
}

/** Deal value: what the deal is about, given the calls made (or typical ones). */
function dealValue(
  m: MarketState,
  md: Pick<AdvisoryMandate, 'kind' | 'revenue' | 'value'>,
  choices: Record<string, string> = {},
) {
  const floor = scale(col(m), BANKWORK.minDealCol);
  switch (md.kind) {
    case 'debt': {
      const months = { modest: 3, standard: 6, stretch: 12 }[choices.size ?? 'standard'] ?? 6;
      return Math.max(floor, md.revenue * months);
    }
    case 'bond':
      return Math.max(floor * 2, md.revenue * 6);
    case 'sale': {
      const mult = { below: 0.85, fair: 1, premium: 1.25 }[choices.price ?? 'fair'] ?? 1;
      return Math.max(floor, Math.round(md.value * mult));
    }
    case 'ipo':
      return Math.max(floor * 2, Math.round(md.value * 0.25));
  }
}

function feeFor(m: MarketState, kind: MandateKind, value: number, quality: number) {
  const raw = value * MANDATES[kind].feeRate * (BANKWORK.feeBase + BANKWORK.feeSlope * quality);
  return clamp(
    Math.round(raw),
    scale(col(m), BANKWORK.minFeeCol),
    scale(col(m), BANKWORK.maxFeeCol),
  );
}

/** How big a client is, from what a typical deal with it is about. */
function tierOf(
  m: MarketState,
  kind: MandateKind,
  x: Pick<Candidate, 'revenue' | 'value'>,
): ClientTier {
  if (kind === 'ipo') return 'big';
  const v = dealValue(m, { kind, revenue: x.revenue, value: x.value });
  return v >= scale(col(m), REPUTATION.bigCol)
    ? 'big'
    : v >= scale(col(m), REPUTATION.midCol)
      ? 'mid'
      : 'small';
}

const tierRank = (t: ClientTier) => CLIENT_TIERS.indexOf(t);

/**
 * Your advisory reputation (FEEDBACK_NOTE): the mandates on your record
 * (`BANKWORK.recordKept`, newest first) scored 0–100, read as a 1–5 star
 * rating, and what it opens. `level` is 0 (small clients), 1 (mid-size
 * open) or 2 (big clients open); it is 0 without the note, so nothing changes.
 */
export function advisoryReputation(world: World, p: Player) {
  const on = feedbackOn(world);
  const hist = p.bankwork?.history ?? [];
  const scored = hist.length;
  const avg = scored ? hist.reduce((a, d) => a + d.quality, 0) / scored : 0;
  const rating = scored ? roundTo(1 + 4 * avg, 1) : null;
  const great = hist.filter((d) => d.quality >= REPUTATION.great).length;
  const big = great >= REPUTATION.bigGreat;
  const mid = big || (scored >= REPUTATION.midScored && (rating ?? 0) >= REPUTATION.midStars);
  const level = on ? (big ? 2 : mid ? 1 : 0) : 0;
  // Rising or falling: the last three against the whole record.
  const recent = hist.slice(0, 3);
  const recentAvg = recent.length ? recent.reduce((a, d) => a + d.quality, 0) / recent.length : 0;
  const trend: 'rising' | 'steady' | 'falling' | null =
    scored < 2
      ? null
      : recentAvg > avg + 0.03
        ? 'rising'
        : recentAvg < avg - 0.03
          ? 'falling'
          : 'steady';
  return {
    on,
    rating,
    avgScore: Math.round(avg * 100),
    scored,
    great,
    level,
    trend,
    /** Mandates more to score 80+ before big clients open. */
    toBig: Math.max(0, REPUTATION.bigGreat - great),
  };
}

/** Mandates you can hold at once: more with a good reputation (FEEDBACK_NOTE). */
export const maxActiveFor = (world: World, p: Player) =>
  BANKWORK.maxActive + advisoryReputation(world, p).level * REPUTATION.activePerLevel;

const openRequests = (world: World, p: Player, m: MarketState) =>
  Object.values(world.players)
    .filter((q) => q.id !== p.id && !q.ai && q.bankwork?.requests?.length)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .flatMap((q) =>
      q
        .bankwork!.requests!.filter((r) => {
          const c = world.companies[r.companyId];
          return r.status === 'open' && !!c && c.market === m.id && c.status === 'active';
        })
        .map((r) => ({ q, r, c: world.companies[r.companyId]! })),
    );

/**
 * The mandates on your desk this month (not counting those you hold): any
 * founder's request first, then leads from people you met, then the city's
 * clients, each ranked by its own hash so the list holds steady.
 */
export function mandateOffers(world: World, p: Player): MandateOffer[] {
  if (!isBankerWorker(world, p)) return [];
  const m = getMarket(world, p.market);
  const month = m.month;
  const w = p.bankwork;
  const taken = new Set(w?.taken ?? []);
  const doneThisMonth = (w?.history ?? []).filter((d) => d.month === month).length;
  const held = new Set((w?.active ?? []).map((a) => a.client.key));
  if (doneThisMonth >= BANKWORK.perMonth) return [];
  const offer = (x: Candidate, kind: MandateKind, extra: Partial<MandateOffer> = {}) => {
    const md = { kind, revenue: x.revenue, value: x.value };
    return {
      id: mandateId(month, x.client.key, kind),
      kind,
      client: x.client,
      band: x.band,
      shape: x.shape,
      revenue: x.revenue,
      value: x.value,
      estFee: feeFor(m, kind, dealValue(m, md), 0.75),
      hours: MANDATES[kind].hours,
      requested: false,
      lead: false,
      tier: tierOf(m, kind, x),
      referredBy: null,
      metAt: null,
      ...extra,
    };
  };
  const out: MandateOffer[] = [];
  const used = new Set<string>(held);
  // A founder's request for an adviser.
  for (const { q, r, c } of openRequests(world, p, m)) {
    const x = companyCandidate(world, c) ?? {
      client: {
        key: `c:${c.id}`,
        name: c.name,
        kind: 'company' as const,
        refId: c.id,
        sector: INDUSTRY_LABEL[c.industry] ?? c.industry,
      },
      band: 'steady' as ClientBand,
      shape: SHAPE_BY_INDUSTRY[c.industry] ?? 'cash-flow',
      revenue: 0,
      value: Math.max(c.capTable.lastPostMoney, 0),
      kinds: [],
    };
    const id = `rq:${r.id}`;
    if (taken.has(id) || used.has(x.client.key)) continue;
    used.add(x.client.key);
    out.push({
      ...offer({ ...x, client: { ...x.client, requestId: r.id, requesterId: q.id } }, r.kind, {
        requested: true,
      }),
      id,
    });
  }
  // Leads from people you met (this month or last), referrals among them.
  for (const l of w?.leads ?? []) {
    if (month - l.month > 1 || used.has(l.key)) continue;
    const x = candidateFor(world, m, l.key);
    if (!x) continue;
    const id = mandateId(month, l.key, l.kind);
    if (taken.has(id)) continue;
    used.add(l.key);
    out.push(offer(x, l.kind, { lead: true, referredBy: l.from ?? null, metAt: l.at ?? null }));
  }
  // The city's clients, by hash: the month's desk is fixed, and what you take leaves it.
  const before =
    (w?.record.deals ?? 0) - (w?.history ?? []).filter((d) => d.month === month && d.closed).length;
  // Reputation (FEEDBACK_NOTE): more mandates, and only the client sizes it has opened
  // (then the next size up if those run short). Level 0 without the note: every size.
  const rep = advisoryReputation(world, p);
  const want =
    BANKWORK.offers +
    (before >= BANKWORK.offersBonusAfter ? 1 : 0) +
    rep.level * REPUTATION.offersPerLevel;
  const all = candidates(world, p, m)
    .flatMap((x) =>
      x.kinds.map((kind) => ({
        x,
        kind,
        h: hashString(`${world.seed}:bankwork:${p.id}:${month}:${x.client.key}:${kind}`),
      })),
    )
    .sort((a, b) => a.h - b.h || (a.x.client.key < b.x.client.key ? -1 : 1));
  const rank = (c: (typeof all)[number]) => tierRank(tierOf(m, c.kind, c.x));
  const pairs = rep.on
    ? [...all.filter((c) => rank(c) <= rep.level), ...all.filter((c) => rank(c) === rep.level + 1)]
    : all;
  const city: MandateOffer[] = [];
  const seen = new Set<string>();
  // A new banker's first desk always has a debt raise (the plainest mandate).
  const first = before === 0;
  const debt = first ? pairs.find((c) => c.kind === 'debt') : undefined;
  for (const c of debt ? [debt, ...pairs] : pairs) {
    if (city.length >= want) break;
    if (seen.has(c.x.client.key)) continue;
    seen.add(c.x.client.key);
    city.push(offer(c.x, c.kind));
  }
  for (const o of city)
    if (!used.has(o.client.key) && !taken.has(o.id)) {
      used.add(o.client.key);
      out.push(o);
    }
  return out;
}

/** Take a mandate from your desk (`banker.mandate` take). */
export function takeMandate(world: World, p: Player, id: string) {
  ensure(isBankerWorker(world, p), 'banker.only', 'Advisory work is for bankers.');
  const w = workOf(p);
  ensure(
    w.active.length < maxActiveFor(world, p),
    'banker.busy',
    'You hold all the mandates you can. Finish one first.',
  );
  const o = mandateOffers(world, p).find((x) => x.id === id);
  ensure(o, 'banker.mandate', 'That mandate is no longer on your desk.');
  const m = getMarket(world, p.market);
  const md: AdvisoryMandate = {
    id: o.id,
    kind: o.kind,
    month: m.month,
    client: o.client,
    band: o.band,
    shape: o.shape,
    revenue: o.revenue,
    value: o.value,
    ...(o.kind === 'debt' ? { lenders: lendersFor(world, p, m) } : {}),
  };
  w.active.push(md);
  w.taken = [...w.taken.filter((t) => monthOfId(t) >= m.month - 1), o.id].slice(-40);
  if (o.client.requestId && o.client.requesterId) {
    const q = world.players[o.client.requesterId];
    const r = q?.bankwork?.requests?.find((x) => x.id === o.client.requestId);
    if (q && r) {
      r.status = 'taken';
      r.bankerId = p.id;
      notify(world, q.id, {
        month: getMarket(world, q.market).month,
        kind: 'system',
        text: `${p.name} took your request: ${MANDATES[o.kind].label.toLowerCase()} for ${o.client.name}.`,
      });
    }
  }
  return { mandate: mandateView(world, p, md), message: `Mandate taken: ${o.client.name}.` };
}

const monthOfId = (id: string) => {
  const m = /^md:(\d+):/.exec(id);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
};

/** Drop a mandate you hold (no fee; the client finds someone else). */
export function dropMandate(world: World, p: Player, id: string) {
  const w = workOf(p);
  const md = w.active.find((x) => x.id === id);
  ensure(md, 'banker.mandate', 'You don’t hold that mandate.');
  w.active = w.active.filter((x) => x.id !== id);
  reopenRequest(world, md);
  return { message: `You stepped back from ${md.client.name}.` };
}

function reopenRequest(world: World, md: AdvisoryMandate) {
  if (!md.client.requestId || !md.client.requesterId) return;
  const r = world.players[md.client.requesterId]?.bankwork?.requests?.find(
    (x) => x.id === md.client.requestId,
  );
  if (r && r.status === 'taken') {
    r.status = 'open';
    delete r.bankerId;
  }
}

/** Score one call against the client. */
function scoreStep(
  md: AdvisoryMandate,
  step: StepId,
  option: string,
): { score: number; best: string } {
  if (step === 'lender') {
    const lenders = md.lenders ?? [];
    const fit = (kind: string) => LENDER_FIT[kind]?.[md.band] ?? 0.5;
    const best = [...lenders].sort(
      (a, b) => fit(b.kind) - fit(a.kind) || (a.id < b.id ? -1 : 1),
    )[0];
    const pick = lenders.find((l) => l.id === option);
    return { score: pick ? fit(pick.kind) : 0, best: best?.id ?? '' };
  }
  const table = FIT[step] ?? {};
  const fitOf = (id: string) => {
    const f = table[id] ?? {};
    // Buyers: a stretched seller needs an auction whatever its shape.
    if (step === 'buyers' && md.band === 'stretched') return f.stretched ?? 0.5;
    if (step === 'structure' || step === 'buyers') return f[md.shape] ?? 0.5;
    return f[md.band] ?? 0.5;
  };
  const ids = STEPS[step].options.map((o) => o.id);
  const best = [...ids].sort((a, b) => fitOf(b) - fitOf(a))[0]!;
  return { score: ids.includes(option) ? fitOf(option) : 0, best };
}

/**
 * Hand in a mandate (`banker.mandate` complete) with your call at each step.
 * The deal closes when the work is good enough: the client pays a success
 * fee (to your licensed bank, or to you), and your reputation and record grow.
 */
export function completeMandate(
  world: World,
  p: Player,
  id: string,
  choices: Record<string, string>,
) {
  ensure(isBankerWorker(world, p), 'banker.only', 'Advisory work is for bankers.');
  const w = workOf(p);
  const md = w.active.find((x) => x.id === id);
  ensure(md, 'banker.mandate', 'You don’t hold that mandate.');
  const m = getMarket(world, p.market);
  const month = m.month;
  const spec = MANDATES[md.kind];
  const picks = spec.steps.map((step) => {
    const option = choices[step];
    if (!option) fail('banker.choice', 'Make a call at every step.');
    const valid =
      step === 'lender'
        ? (md.lenders ?? []).some((l) => l.id === option)
        : STEPS[step].options.some((o) => o.id === option);
    ensure(valid, 'banker.choice', 'That isn’t one of the options.');
    const s = scoreStep(md, step, option);
    const lender = (lid: string) => md.lenders?.find((l) => l.id === lid);
    return {
      step,
      option,
      score: roundTo(s.score, 2),
      best: s.best,
      ...(step === 'lender'
        ? {
            optionName: lender(option)?.name ?? option,
            bestName: lender(s.best)?.name ?? s.best,
            bestKind: lender(s.best)?.kind ?? '',
          }
        : {}),
    };
  });
  spendHours(p, spec.hours, spec.label);
  const quality = roundTo(picks.reduce((a, x) => a + x.score, 0) / picks.length, 3);
  const closed = quality >= BANKWORK.closeAt;
  const value = dealValue(m, md, choices);
  let fee = 0;
  let paidTo: AdvisoryDeal['paidTo'] = 'none';
  const bank = bankOf(world, p);
  if (closed) {
    fee = feeFor(m, md.kind, value, quality);
    // Who pays: the client (a company or business that can afford it), else the
    // outside world (an established company outside the modelled economy).
    const human = md.client.requesterId ? world.players[md.client.requesterId] : undefined;
    const company = md.client.kind === 'company' ? world.companies[md.client.refId!] : undefined;
    const business = md.client.kind === 'business' ? m.businesses?.[md.client.refId!] : undefined;
    const clientAcc = company?.account ?? business?.account;
    const to = bank?.status === 'licensed' ? bank.account : p.accounts.local;
    paidTo = bank?.status === 'licensed' ? 'bank' : 'personal';
    const memo = `Advisory fee: ${spec.label}, ${md.client.name}`;
    if (human && company) {
      // A human founder pays what the company can.
      fee = transferUpTo(world, company.account, to, fee, memo, month);
    } else if (clientAcc && account(world, clientAcc).balance >= fee * 3) {
      transfer(world, clientAcc, to, fee, memo, month);
    } else {
      transfer(world, m.ext.customers, to, fee, memo, month);
    }
    if (paidTo === 'bank') {
      bank!.thisMonth.fees += fee;
      bank!.advised += 1;
      applyStarEvent(bank!.stars, quality >= 0.8 ? 0.05 : 0.02);
    } else if (fee > 0) {
      const tax = Math.round(fee * m.data.tax.personalIncome);
      transfer(world, p.accounts.local, m.ext.tax, tax, 'Personal income tax', month);
      p.lastMonth.income += fee;
    }
  }
  const stars = applyStarEvent(
    p.stars,
    !closed ? BANKWORK.starsLost : quality >= 0.8 ? BANKWORK.starsGreat : BANKWORK.starsGood,
  );
  const skills = {
    finance: skillUp(p, 'finance', closed ? BANKWORK.skill : 1),
    negotiation: skillUp(p, 'negotiation', closed ? BANKWORK.skill : 1),
  };
  const r = w.record;
  if (closed) {
    r.deals += 1;
    r.fees += fee;
    r.byKind[md.kind] = (r.byKind[md.kind] ?? 0) + 1;
  } else r.lost += 1;
  r.qualitySum = roundTo(r.qualitySum + quality, 3);
  const deal: AdvisoryDeal = {
    id: md.id,
    kind: md.kind,
    month,
    client: md.client.name,
    clientKind: md.client.kind,
    quality,
    closed,
    dealValue: value,
    fee,
    paidTo,
    picks,
  };
  w.history = [deal, ...w.history].slice(0, BANKWORK.recordKept);
  w.active = w.active.filter((x) => x.id !== id);
  // Word gets round (FEEDBACK_NOTE): a deal scored 80+ brings another client by name.
  const referral =
    closed && quality >= REPUTATION.great && feedbackOn(world) ? referFrom(world, p, m, md) : null;
  // A human founder hears how it went, and good advice shows in the company's reputation.
  if (md.client.requestId && md.client.requesterId) {
    const q = world.players[md.client.requesterId];
    const req = q?.bankwork?.requests?.find((x) => x.id === md.client.requestId);
    if (req) req.status = 'done';
    const c = md.client.refId ? world.companies[md.client.refId] : undefined;
    if (c && closed) applyStarEvent(c.stars, quality >= 0.8 ? 0.1 : 0.04);
    if (q)
      notify(world, q.id, {
        month: getMarket(world, q.market).month,
        kind: 'system',
        text: closed
          ? `${p.name} closed your ${spec.label.toLowerCase()} mandate for ${md.client.name}. Fee: ${formatMoney(fee, m.data.currency)}.`
          : `${p.name}’s ${spec.label.toLowerCase()} for ${md.client.name} didn’t come together. No fee.`,
      });
  }
  notify(world, p.id, {
    month,
    kind: 'system',
    text: closed
      ? `Deal closed: ${spec.label.toLowerCase()} for ${md.client.name}. Fee ${formatMoney(fee, m.data.currency)}${paidTo === 'bank' ? ` to ${bank!.name}` : ''}.`
      : `${md.client.name} walked away: the ${spec.label.toLowerCase()} didn’t come together.`,
  });
  return {
    deal: dealView(deal),
    stars,
    skills,
    referral,
    currency: m.data.currency,
    message: closed
      ? `Deal closed for ${md.client.name}: ${formatMoney(fee, m.data.currency)} fee.`
      : `${md.client.name} walked away. No fee this time.`,
  };
}

/**
 * A referral after a deal scored 80+ (FEEDBACK_NOTE): a client in the city
 * who heard about it, one size up from the deal where there is one (word
 * reaches bigger clients before your rating does), else the same size or
 * any. Ranked by its own hash, so the pick is fixed. It joins your leads
 * and comes to your desk by name this month and next.
 */
function referFrom(world: World, p: Player, m: MarketState, md: AdvisoryMandate) {
  const w = workOf(p);
  const skip = new Set([
    md.client.key,
    ...w.active.map((a) => a.client.key),
    ...w.leads.map((l) => l.key),
  ]);
  const from = tierRank(tierOf(m, md.kind, md));
  const pairs = candidates(world, p, m)
    .filter((x) => !skip.has(x.client.key))
    .flatMap((x) =>
      x.kinds.map((kind) => ({
        x,
        kind,
        rank: tierRank(tierOf(m, kind, x)),
        h: hashString(`${world.seed}:referral:${p.id}:${md.id}:${x.client.key}:${kind}`),
      })),
    )
    .sort((a, b) => a.h - b.h || (a.x.client.key < b.x.client.key ? -1 : 1));
  const pick =
    pairs.find((c) => c.rank === Math.min(2, from + 1)) ??
    pairs.find((c) => c.rank >= from) ??
    pairs[0];
  if (!pick) return null;
  const month = m.month;
  w.leads = [
    { key: pick.x.client.key, kind: pick.kind, month, from: md.client.name },
    ...w.leads.filter((l) => l.key !== pick.x.client.key),
  ].slice(0, 6);
  notify(world, p.id, {
    month,
    kind: 'system',
    text: `${pick.x.client.name} heard about your work for ${md.client.name}: ${MANDATES[pick.kind].label.toLowerCase()}. It’s on your advisory desk.`,
  });
  return {
    client: pick.x.client.name,
    from: md.client.name,
    kind: pick.kind,
    tier: CLIENT_TIERS[pick.rank]!,
  };
}

/**
 * A banker meets a client at one of the city's banking events (FEEDBACK_NOTE):
 * a client of a size you've opened (or the next one up) wants an adviser. It
 * joins your leads and comes to your desk this month and next. `salt` (the
 * event id) fixes the pick. Null for anyone but a banker, or without the note.
 */
export function eventLead(world: World, p: Player, eventTitle: string, salt: string) {
  if (!isBankerWorker(world, p) || !feedbackOn(world)) return null;
  const w = workOf(p);
  const m = getMarket(world, p.market);
  const rep = advisoryReputation(world, p);
  const skip = new Set([...w.active.map((a) => a.client.key), ...w.leads.map((l) => l.key)]);
  const pick = candidates(world, p, m)
    .filter((x) => !skip.has(x.client.key))
    .flatMap((x) =>
      x.kinds
        .filter((kind) => tierRank(tierOf(m, kind, x)) <= rep.level + 1)
        .map((kind) => ({
          x,
          kind,
          h: hashString(`${world.seed}:event-lead:${p.id}:${salt}:${x.client.key}:${kind}`),
        })),
    )
    .sort((a, b) => a.h - b.h || (a.x.client.key < b.x.client.key ? -1 : 1))[0];
  if (!pick) return null;
  w.leads = [
    { key: pick.x.client.key, kind: pick.kind, month: m.month, at: eventTitle },
    ...w.leads.filter((l) => l.key !== pick.x.client.key),
  ].slice(0, 6);
  return { client: pick.x.client.name, kind: pick.kind, label: MANDATES[pick.kind].label };
}

/** A founder asks the city's bankers for an adviser (`banker.request`). */
export function requestAdviser(world: World, p: Player, companyId: Id, kind: MandateKind) {
  ensure(bankersOn(world), 'command.unknown', 'Unknown command.');
  const c = world.companies[companyId];
  ensure(
    c && c.founderIds.includes(p.id) && c.status === 'active',
    'banker.request',
    'Ask for an adviser for a company you run.',
  );
  const w = workOf(p);
  const reqs = (w.requests ??= []);
  ensure(
    !reqs.some((r) => r.companyId === companyId && (r.status === 'open' || r.status === 'taken')),
    'banker.request',
    'You already asked for an adviser for this company.',
  );
  const month = getMarket(world, c.market).month;
  const id = `${companyId}:${kind}:${month}:${reqs.length}`;
  reqs.unshift({ id, companyId, kind, month, status: 'open' });
  w.requests = reqs.slice(0, 8);
  for (const q of Object.values(world.players))
    if (isBankerWorker(world, q) && q.market === c.market && q.id !== p.id)
      notify(world, q.id, {
        month: getMarket(world, q.market).month,
        kind: 'system',
        text: `${c.name} is looking for an adviser: ${MANDATES[kind].label.toLowerCase()}. It’s on your advisory desk.`,
      });
  return { requestId: id, message: 'Request sent to the city’s bankers.' };
}

/** Withdraw an open request. */
export function withdrawRequest(p: Player, companyId: Id) {
  const r = p.bankwork?.requests?.find((x) => x.companyId === companyId && x.status === 'open');
  ensure(r, 'banker.request', 'No open request for that company.');
  r.status = 'withdrawn';
  return { message: 'Request withdrawn.' };
}

/**
 * A banker's advisory track record, for the licence decision and shareholders:
 * deals closed and lost, fees earned, average quality (0–1), deals by kind and
 * the latest month a deal was handed in.
 */
export function advisoryRecord(world: World, p: Player) {
  const r = p.bankwork?.record;
  const handed = (r?.deals ?? 0) + (r?.lost ?? 0);
  return {
    deals: r?.deals ?? 0,
    lost: r?.lost ?? 0,
    fees: r?.fees ?? 0,
    avgQuality: handed ? roundTo((r?.qualitySum ?? 0) / handed, 2) : 0,
    byKind: { ...(r?.byKind ?? {}) },
    lastMonth: p.bankwork?.history[0]?.month ?? null,
    currency: getMarket(world, p.market).data.currency,
  };
}

// ---------------------------------------------------------------- conversations

/** Where a banker can talk: an AI bank (`lender:<id>`) or a city place (`place:<market>:<role>`). */
interface Venue {
  at: string;
  name: string;
  kind: 'lender' | 'place';
  role: string;
  market: MarketId;
  topics: readonly TalkTopic[];
}

function venueOf(world: World, at: string): Venue | null {
  if (at.startsWith('lender:')) {
    const id = at.slice(7);
    for (const m of Object.values(world.markets)) {
      const l = m.lenders?.[id];
      if (l)
        return { at, name: l.name, kind: 'lender', role: l.kind, market: m.id, topics: BANK_TALKS };
    }
    return null;
  }
  if (at.startsWith('place:')) {
    const place = findPlace(at.slice(6));
    const topics = place ? PLACE_TALKS[place.role] : undefined;
    if (!place || !topics) return null;
    return { at, name: place.name, kind: 'place', role: place.role, market: place.market, topics };
  }
  return null;
}

/** May a banker go in to a place? The Founders' Hub opens to bankers (bankers note). */
function canEnter(world: World, p: Player, v: Venue, now: number): string | null {
  if (locationOf(p) !== v.market) return 'That’s in another city.';
  if (v.kind === 'lender') return null;
  const place = findPlace(v.at.slice(6))!;
  const access = placeAccess(world, p, place, now);
  if (access.ok) return null;
  if (access.why === 'members' && place.role === 'tech-hub' && isBankerWorker(world, p))
    return null;
  if (access.why === 'appointment' || access.why === 'early')
    return 'By appointment only. Book one first.';
  if (access.why === 'resident') return 'Government offices see residents of the city.';
  return 'You can’t go in here.';
}

/** Why a conversation can't happen now, or null. */
export function talkCheck(
  world: World,
  p: Player,
  at: string,
  topic: TalkTopic,
  now: number,
): string | null {
  if (!isBankerWorker(world, p)) return 'Conversations here are for bankers.';
  const v = venueOf(world, at);
  if (!v || !v.topics.includes(topic)) return 'Nobody here for that.';
  const door = canEnter(world, p, v, now);
  if (door) return door;
  const w = p.bankwork;
  const month = homeMonth(world, p);
  if (w?.talked[`${at}:${topic}`] === month) return 'Done this month. Come back next month.';
  if (w && w.talkMonth.month === month && w.talkMonth.n >= BANKWORK.talksPerMonth)
    return 'You’ve had all your meetings this month.';
  if (p.hours.available - p.hours.used < BANKWORK.talkHours)
    return 'Not enough hours left this month.';
  const bank = bankOf(world, p);
  if (topic === 'line') {
    if (bank?.status !== 'licensed') return 'Credit lines are for licensed banks.';
    if (bank.market !== v.market) return 'Arrange a line with a bank in your bank’s city.';
    if (w?.line && w.line.outstanding > 0) return 'Repay your current line first.';
  }
  if (topic === 'standing' && !bank) return 'Start a bank first: then they’ll check its standing.';
  if (topic === 'poach' && (w?.recruits.length ?? 0) >= BANKWORK.recruitsKept)
    return 'You have enough people in mind already.';
  return null;
}

function personAt(world: World, at: string, topic: TalkTopic, month: number) {
  // The same person holds the same job (a staff member changes month to month).
  const key = topic === 'poach' ? `${at}:poach:${month}` : `${at}:${TALKS[topic].role}`;
  return BANKER_NAMES[hashString(`${world.seed}:${key}`) % BANKER_NAMES.length]!;
}

function pickLesson(
  rng: ReturnType<typeof deriveRng>,
  known: string[],
  by: BankLesson['by'],
): BankLesson | null {
  const fits = BANK_LESSONS.filter((l) => l.by === by);
  if (!fits.length) return null;
  const fresh = fits.filter((l) => !known.includes(l.id));
  return rng.pick(fresh.length ? fresh : fits);
}

/** The rules as a supervisor explains them (the current numbers). */
function rulesOf(world: World, market: MarketId) {
  const m = getMarket(world, market);
  return {
    baseRateBps: m.data.baseRateBps,
    reserveRatio: RESERVE_RATIO,
    minCapitalRatio: MIN_CAPITAL_RATIO,
    licenceMonths: LICENCE_MONTHS,
    depositInsurance: m.data.depositInsurance * 100,
    minCapital: Object.entries(BANK_TYPES).map(([id, t]) => ({
      id,
      label: t.label,
      amount: scale(col(m), t.minCapitalCol),
    })),
    currency: m.data.currency,
  };
}

/** Where your bank stands with the regulator. */
function standingOf(world: World, b: Bank) {
  const m = getMarket(world, b.market);
  const f = bankFigures(world, b);
  const need = scale(col(m), BANK_TYPES[b.type].minCapitalCol);
  // What the supervisor says, as ids and figures the client words.
  const notes: { id: string; amount?: number; months?: number }[] = [];
  if (b.status === 'applying') {
    const months = Math.max(0, LICENCE_MONTHS - (m.month - b.appliedMonth));
    notes.push(
      f.equity >= need
        ? { id: 'capital-meets', months }
        : { id: 'capital-short', amount: need - f.equity, months },
    );
  } else {
    notes.push({
      id:
        f.capitalRatio >= MIN_CAPITAL_RATIO * 1.5
          ? 'capital-comfortable'
          : f.capitalRatio >= MIN_CAPITAL_RATIO
            ? 'capital-close'
            : 'capital-below',
    });
    if (f.cbBorrowing > 0) notes.push({ id: 'cb-owed', amount: f.cbBorrowing });
    if (f.cash < -f.liquidityLimit * 0.8) notes.push({ id: 'liquidity-thin' });
  }
  return {
    status: b.status,
    capitalRatio: f.capitalRatio,
    minCapitalRatio: MIN_CAPITAL_RATIO,
    equity: f.equity,
    minCapital: need,
    cbBorrowing: f.cbBorrowing,
    notes,
    currency: m.data.currency,
  };
}

/** What listing your bank takes, and how far you are. */
function listingOf(world: World, p: Player) {
  const b = bankOf(world, p);
  const L = BANKWORK.listing;
  const m = getMarket(world, p.market);
  const months =
    b?.status === 'licensed' && b.licensedMonth !== null ? m.month - b.licensedMonth : 0;
  const need = b ? scale(col(m), BANK_TYPES[b.type].minCapitalCol) * L.capitalMultiple : 0;
  const equity = b ? bankFigures(world, b).equity : 0;
  return {
    checks: [
      { id: 'licensed', need: L.months, have: months, ok: months >= L.months },
      { id: 'capital', need, have: equity, ok: !!b && equity >= need },
      {
        id: 'stars',
        need: L.stars,
        have: b ? roundTo(b.stars.value, 1) : 0,
        ok: !!b && b.stars.value >= L.stars,
      },
    ],
    currency: m.data.currency,
  };
}

/** Meet people at a bank or an institution (`banker.talk`). */
export function bankerTalk(world: World, p: Player, at: string, topic: TalkTopic, now: number) {
  ensure(bankersOn(world), 'command.unknown', 'Unknown command.');
  const why = talkCheck(world, p, at, topic, now);
  ensure(!why, 'banker.talk', why ?? 'Not now.');
  const v = venueOf(world, at)!;
  const w = workOf(p);
  const month = homeMonth(world, p);
  const vm = getMarket(world, v.market);
  const rng = deriveRng(world.seed, 'bankwork', 'talk', p.id, at, topic, month);
  spendHours(p, BANKWORK.talkHours, TALKS[topic].label);
  w.talked[`${at}:${topic}`] = month;
  w.talkMonth = w.talkMonth.month === month ? { month, n: w.talkMonth.n + 1 } : { month, n: 1 };
  const person = personAt(world, at, topic, month);
  const role = TALKS[topic].role;
  const out: Record<string, unknown> = { topic, at, where: v.name, person, role };
  let lessonId: string | null = null;
  let learned = false;
  const learn = (by: BankLesson['by'], skill: 'finance' | 'risk' | 'investing') => {
    const l = pickLesson(rng, w.lessons, by);
    if (!l) return;
    lessonId = l.id;
    learned = !w.lessons.includes(l.id);
    if (learned) {
      w.lessons.push(l.id);
      out.skill = { [skill]: skillUp(p, skill, BANKWORK.lessonSkill) };
    }
    out.lesson = { id: l.id, topic: l.topic, text: l.text, tip: l.tip, learned };
  };
  const contact = (refId: string, name: string, kind: 'local' | 'founder' = 'local') =>
    addContact(p, { kind, refId, name, warmth: BANKWORK.warmth }, month);
  let message = '';
  switch (topic) {
    case 'ceo':
    case 'treasurer':
    case 'risk': {
      learn(topic, topic === 'risk' ? 'risk' : 'finance');
      contact(`${at}:${topic}`, `${person}, ${role}, ${v.name}`);
      message = `${person}, ${role.toLowerCase()} at ${v.name}, told you how they run the bank.`;
      break;
    }
    case 'poach': {
      const r: BankRecruit = {
        id: `${at}:${month}`,
        name: person,
        role: rng.pick(RECRUIT_ROLES),
        from: v.name,
        skill: rng.int(50, 80),
        salary: scale(col(vm), rng.range(2, 5)),
        month,
      };
      w.recruits = [r, ...w.recruits.filter((x) => x.id !== r.id)].slice(0, BANKWORK.recruitsKept);
      contact(`${at}:recruit:${month}`, `${person}, ${r.role}, ${v.name}`);
      out.recruit = r;
      message = `${person} (${r.role.toLowerCase()} at ${v.name}) would move for the right offer.`;
      break;
    }
    case 'line': {
      const b = bankOf(world, p)!;
      const f = bankFigures(world, b);
      const lender = vm.lenders[at.slice(7)]!;
      const limit = Math.max(
        scale(col(vm), BANKWORK.lineMinCol),
        Math.round(Math.max(0, f.equity) * BANKWORK.lineShare * clamp(lender.appetite, 0.5, 1.5)),
      );
      const spreadBps = Math.round(
        BANKWORK.lineSpreadBps + Math.max(0, 5 - b.stars.value) * BANKWORK.lineSpreadPerStar,
      );
      w.line = {
        lenderId: lender.id,
        lender: lender.name,
        market: v.market,
        bankId: b.id,
        limit,
        spreadBps,
        outstanding: 0,
        paidMonth: month,
        month,
      };
      contact(`${at}:treasurer`, `${person}, Treasurer, ${v.name}`);
      out.line = lineView(world, p);
      message = `${v.name} will lend ${b.name} up to ${formatMoney(limit, vm.data.currency)} on demand, at base rate + ${(spreadBps / 100).toFixed(1)} points.`;
      break;
    }
    case 'supervisor': {
      learn('supervisor', 'risk');
      contact(`${at}:supervisor`, `${person}, Bank supervisor, ${v.name}`);
      out.rules = rulesOf(world, v.market);
      message = `${person} walked you through the rules: base rate ${(vm.data.baseRateBps / 100).toFixed(1)}%, capital at least ${MIN_CAPITAL_RATIO * 100}% of loans, ${RESERVE_RATIO * 100}% of deposits in reserve.`;
      break;
    }
    case 'standing': {
      const b = bankOf(world, p)!;
      out.standing = standingOf(world, b);
      out.skill = { risk: skillUp(p, 'risk', 1) };
      contact(`${at}:supervisor`, `${person}, Bank supervisor, ${v.name}`);
      message = `${person} went through ${b.name}’s numbers with you.`;
      break;
    }
    case 'owners':
    case 'founders': {
      const clients = meetClients(world, p, v.market, topic, rng, month);
      out.clients = clients;
      const lead = clients.find((c) => c.lead)?.lead ?? null;
      out.lead = lead;
      networkUp(p, BANKWORK.network);
      message =
        `You met ${clients.map((c) => c.name).join(' and ')}: they’ll bank with you once you’re licensed` +
        (lead ? `, and one wants an adviser` : '') +
        '.';
      convertClients(world, p, month);
      break;
    }
    case 'listing': {
      learn('listing', 'investing');
      w.objective = { kind: 'list-bank', month };
      out.listing = listingOf(world, p);
      contact(`${at}:listing`, `${person}, Head of listings, ${v.name}`);
      message = `${person} set out what listing your bank takes.`;
      break;
    }
  }
  if (topic !== 'owners' && topic !== 'founders') networkUp(p, BANKWORK.network);
  const talk: BankerTalk = { at, where: v.name, topic, person, month, lessonId, learned };
  w.talks = [talk, ...w.talks].slice(0, BANKWORK.talksKept);
  return { ...out, message };
}

/** Owners at the Chamber, founders at the Hub: clients for your bank, and maybe a lead. */
function meetClients(
  world: World,
  p: Player,
  market: MarketId,
  topic: 'owners' | 'founders',
  rng: ReturnType<typeof deriveRng>,
  month: number,
) {
  const w = workOf(p);
  const m = getMarket(world, market);
  const known = new Set(w.clients.map((c) => c.key));
  interface Met {
    key: string;
    name: string;
    who: string;
    kind: 'business' | 'company';
    refId: Id;
    size: number;
  }
  const owners: Met[] = Object.values(m.businesses ?? {})
    .filter((b) => businessCandidate(b) && !known.has(`b:${b.id}`))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((b) => ({
      key: `b:${b.id}`,
      name: b.gen?.name ?? b.name,
      who: b.gen?.owner ?? b.owner.name,
      kind: 'business' as const,
      refId: b.id,
      size: b.monthlyTakings,
    }));
  const founders: Met[] = Object.values(world.companies)
    .filter(
      (c) =>
        c.ai &&
        c.market === market &&
        c.status === 'active' &&
        !isEstablished(c) &&
        !known.has(`c:${c.id}`),
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((c) => ({
      key: `c:${c.id}`,
      name: c.name,
      who: world.players[c.founderIds[0]!]?.name ?? c.name,
      kind: 'company' as const,
      refId: c.id,
      size: Math.max(world.accounts[c.account]?.balance ?? 0, scale(col(m), 5)),
    }));
  // The people you came for first; when they're all met, the others there.
  const [first, second] = topic === 'owners' ? [owners, founders] : [founders, owners];
  const met = [...rng.shuffle(first), ...rng.shuffle(second)].slice(0, BANKWORK.clientsPerTalk);
  const leadIndex = met.length ? rng.int(0, met.length - 1) : -1;
  return met.map((x, i) => {
    const wants: BankClientLead['wants'] = rng.chance(0.5) ? 'deposit' : 'loan';
    const amount = Math.max(
      scale(col(m), 2),
      Math.round(x.size * (wants === 'deposit' ? 0.3 : 2) * rng.range(0.6, 1.2)),
    );
    const c: BankClientLead = {
      key: x.key,
      name: x.name,
      kind: x.kind,
      refId: x.refId,
      wants,
      amount,
      month,
    };
    w.clients = [c, ...w.clients.filter((y) => y.key !== c.key)].slice(0, BANKWORK.clientsKept);
    addContact(
      p,
      {
        kind: x.kind === 'company' ? 'founder' : 'local',
        refId:
          x.kind === 'company'
            ? (world.companies[x.refId]?.founderIds[0] ?? x.refId)
            : `biz:${x.refId}`,
        name: `${x.who}, ${x.name}`,
        warmth: BANKWORK.warmth,
      },
      month,
    );
    let lead: { key: string; kind: MandateKind } | null = null;
    if (i === leadIndex) {
      const cand = candidateFor(world, m, x.key);
      const kind = cand?.kinds[0];
      if (kind) {
        lead = { key: x.key, kind };
        w.leads = [{ key: x.key, kind, month }, ...w.leads.filter((l) => l.key !== x.key)].slice(
          0,
          6,
        );
      }
    }
    return { ...c, who: x.who, lead };
  });
}

/**
 * Clients you met join your bank once it's licensed: depositors move their
 * account to it; borrowers join its loan book (lent like its retail loans,
 * within its lending room).
 */
function convertClients(world: World, p: Player, month: number) {
  const b = bankOf(world, p);
  const w = p.bankwork;
  if (!w || !b || b.status !== 'licensed') return 0;
  const m = getMarket(world, b.market);
  let joined = 0;
  for (const c of w.clients) {
    if (c.joined !== undefined) continue;
    const accId =
      c.kind === 'business'
        ? world.markets[b.market]?.businesses?.[c.refId]?.account
        : world.companies[c.refId]?.status === 'active'
          ? world.companies[c.refId]!.account
          : undefined;
    if (c.wants === 'deposit') {
      const acc = accId ? world.accounts[accId] : undefined;
      if (!acc || acc.market !== b.market) continue;
      acc.bankId = b.id;
    } else {
      if (!BANK_TYPES[b.type].companies && !BANK_TYPES[b.type].personal) continue;
      const room = bankFigures(world, b).lendingRoom;
      const amount = Math.min(c.amount, Math.floor(room * 0.5));
      if (amount <= 0) continue;
      account(world, b.account).overdraftLimit = bankFigures(world, b).liquidityLimit;
      transfer(world, b.account, m.ext.customers, amount, `Loan to ${c.name}`, month);
      b.retail.loans += amount;
      b.retail.customers += 1;
    }
    c.joined = month;
    joined++;
  }
  if (joined)
    notify(world, p.id, {
      month,
      kind: 'system',
      text: `${joined} client${joined === 1 ? '' : 's'} you met joined ${b.name}.`,
    });
  return joined;
}

// ---------------------------------------------------------------- the interbank line

const lineRate = (world: World, line: { market: MarketId; spreadBps: number }) =>
  getMarket(world, line.market).data.baseRateBps + line.spreadBps;

/** Draw on or repay your interbank credit line (`banker.line`). */
export function useLine(world: World, p: Player, action: 'draw' | 'repay', amount: number) {
  ensure(bankersOn(world), 'command.unknown', 'Unknown command.');
  const line = p.bankwork?.line;
  ensure(line, 'banker.line', 'Arrange a credit line with an AI bank first.');
  const b = world.banks[line.bankId];
  ensure(
    b && b.status === 'licensed' && b.ownerId === p.id,
    'banker.line',
    'Your bank isn’t open.',
  );
  const m = getMarket(world, line.market);
  const month = m.month;
  ensure(amount > 0 && Number.isInteger(amount), 'banker.line', 'Pick an amount.');
  if (action === 'draw') {
    ensure(
      amount <= line.limit - line.outstanding,
      'banker.line',
      'That’s more than the line has left.',
    );
    transfer(world, m.ext.bank, b.account, amount, `Interbank line: ${line.lender}`, month);
    // A month's interest up front at draw time (base rate plus the spread).
    const interest = Math.round((amount * lineRate(world, line)) / 10_000 / 12);
    transfer(world, b.account, m.ext.bank, interest, `Interbank interest: ${line.lender}`, month);
    line.outstanding += amount;
    line.paidMonth = month;
    return {
      line: lineView(world, p),
      interest,
      message: `${b.name} drew ${formatMoney(amount, m.data.currency)} from ${line.lender}. Interest this month: ${formatMoney(interest, m.data.currency)}.`,
    };
  }
  ensure(line.outstanding > 0, 'banker.line', 'Nothing drawn.');
  const pay = Math.min(amount, line.outstanding);
  ensure(
    account(world, b.account).balance >= pay,
    'banker.line',
    'Your bank needs the cash to repay.',
  );
  transfer(world, b.account, m.ext.bank, pay, `Interbank repayment: ${line.lender}`, month);
  line.outstanding -= pay;
  return {
    line: lineView(world, p),
    message: `${b.name} repaid ${formatMoney(pay, m.data.currency)} to ${line.lender}.`,
  };
}

function lineView(world: World, p: Player) {
  const line = p.bankwork?.line;
  if (!line) return null;
  return {
    lender: line.lender,
    lenderId: line.lenderId,
    limit: line.limit,
    outstanding: line.outstanding,
    available: line.limit - line.outstanding,
    rateBps: lineRate(world, line),
    spreadBps: line.spreadBps,
    currency: getMarket(world, line.market).data.currency,
  };
}

/**
 * Month end for bankers (bankers note): interest on drawn interbank lines
 * (a failed bank's line is written off by the lender), clients met joining
 * licensed banks, and old leads and desk ids dropped.
 */
export function settleBankwork(world: World, market: MarketId, month: number) {
  if (!bankersOn(world)) return;
  const m = getMarket(world, market);
  for (const p of Object.values(world.players)) {
    if (p.ai || p.market !== market || !p.bankwork) continue;
    const w = p.bankwork;
    const line = w.line;
    if (line) {
      const b = world.banks[line.bankId];
      if (!b || b.status !== 'licensed') delete w.line;
      else if (line.outstanding > 0 && line.paidMonth < month) {
        const due = Math.round((line.outstanding * lineRate(world, line)) / 10_000 / 12);
        transferUpTo(
          world,
          b.account,
          m.ext.bank,
          due,
          `Interbank interest: ${line.lender}`,
          month,
        );
        line.paidMonth = month;
      }
    }
    convertClients(world, p, month);
    w.leads = w.leads.filter((l) => month - l.month <= 1);
    w.taken = w.taken.filter((t) => monthOfId(t) >= month - 1);
  }
}

// ---------------------------------------------------------------- views

const stepView = (md: AdvisoryMandate, step: StepId) => ({
  id: step,
  question: STEPS[step].question,
  options:
    step === 'lender'
      ? (md.lenders ?? []).map((l) => ({ id: l.id, label: l.name, kind: l.kind }))
      : STEPS[step].options.map((o) => ({ id: o.id, label: o.label, kind: null })),
});

function mandateView(world: World, p: Player, md: AdvisoryMandate) {
  const m = getMarket(world, p.market);
  return {
    id: md.id,
    kind: md.kind,
    label: MANDATES[md.kind].label,
    blurb: MANDATES[md.kind].blurb,
    hours: MANDATES[md.kind].hours,
    client: md.client,
    band: md.band,
    shape: md.shape,
    revenue: md.revenue,
    value: md.value,
    estFee: feeFor(m, md.kind, dealValue(m, md), 0.75),
    steps: MANDATES[md.kind].steps.map((s) => stepView(md, s)),
  };
}

const optionOf = (step: string, id: string) =>
  STEPS[step as StepId]?.options.find((o) => o.id === id);

/** A handed-in mandate, with each call and the best one in words. */
function dealView(d: AdvisoryDeal) {
  return {
    ...d,
    label: MANDATES[d.kind].label,
    picks: d.picks.map((x) => ({
      ...x,
      question: STEPS[x.step as StepId]?.question ?? '',
      optionLabel: x.optionName ?? optionOf(x.step, x.option)?.label ?? x.option,
      bestLabel: x.bestName ?? optionOf(x.step, x.best)?.label ?? x.best,
      why:
        x.step === 'lender'
          ? (LENDER_WHY[x.bestKind ?? ''] ?? '')
          : (optionOf(x.step, x.best)?.why ?? ''),
    })),
  };
}

/**
 * The reputation panel (FEEDBACK_NOTE; null without it): the rating, recent
 * scores, and each client size with whether it's open, how many of this
 * month's offers are that size, and the deal sizes it covers.
 */
function reputationView(world: World, p: Player) {
  const rep = advisoryReputation(world, p);
  if (!rep.on) return null;
  const m = getMarket(world, p.market);
  const offers = mandateOffers(world, p);
  const midFrom = scale(col(m), REPUTATION.midCol);
  const bigFrom = scale(col(m), REPUTATION.bigCol);
  return {
    rating: rep.rating,
    avgScore: rep.avgScore,
    scored: rep.scored,
    great: rep.great,
    level: rep.level,
    trend: rep.trend,
    toBig: rep.toBig,
    bigGreat: REPUTATION.bigGreat,
    midStars: REPUTATION.midStars,
    recent: (p.bankwork?.history ?? []).slice(0, REPUTATION.recentShown).map((d) => ({
      id: d.id,
      client: d.client,
      kind: d.kind,
      label: MANDATES[d.kind].label,
      score: Math.round(d.quality * 100),
      closed: d.closed,
      month: d.month,
    })),
    /** Each size: open, this month's offers of that size, and the deal sizes it covers. */
    tiers: CLIENT_TIERS.map((id, i) => ({
      id,
      open: i <= rep.level,
      offers: offers.filter((o) => o.tier === id).length,
      from: [0, midFrom, bigFrom][i]!,
      to: [midFrom, bigFrom, null][i] ?? null,
    })),
  };
}

/** Places and banks in the city you're in where a banker can talk, with what's on. */
function venuesHere(world: World, p: Player, now: number) {
  const here = getMarket(world, locationOf(p));
  const venues: Venue[] = [
    ...Object.values(here.lenders ?? {})
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((l) => venueOf(world, `lender:${l.id}`)!),
    ...Object.keys(PLACE_TALKS)
      .map((role) => venueOf(world, `place:${here.id}:${role}`))
      .filter((v): v is Venue => !!v),
  ];
  return venues.map((v) => ({
    at: v.at,
    name: v.name,
    kind: v.kind,
    role: v.role,
    topics: v.topics.map((t) => {
      const reason = talkCheck(world, p, v.at, t, now);
      return {
        id: t,
        label: TALKS[t].label,
        who: TALKS[t].role,
        blurb: TALKS[t].blurb,
        hours: BANKWORK.talkHours,
        ok: !reason,
        reason,
      };
    }),
  }));
}

/**
 * `view.bankWork`: the advisory desk (offers, mandates you hold, recent
 * deals, your record) and the conversations (where you can talk in the city
 * you're in, lessons, recruits, clients waiting, the credit line, the
 * listing goal). For founders, just the advisers they asked for. Null
 * outside bankers-note worlds.
 */
export function bankWorkView(world: World, p: Player, now: number) {
  if (!bankersOn(world) || p.ai) return null;
  const requests = (p.bankwork?.requests ?? []).map((r) => ({
    ...r,
    company: world.companies[r.companyId]?.name ?? '',
    banker: r.bankerId ? (world.players[r.bankerId]?.name ?? null) : null,
  }));
  if (!isBankerWorker(world, p)) return { banker: false as const, requests };
  const w = p.bankwork;
  const m = getMarket(world, p.market);
  const month = m.month;
  const bank = bankOf(world, p);
  return {
    banker: true as const,
    requests,
    currency: m.data.currency,
    feeTo: bank?.status === 'licensed' ? ('bank' as const) : ('personal' as const),
    bankName: bank?.name ?? null,
    offers: mandateOffers(world, p),
    active: (w?.active ?? []).map((md) => mandateView(world, p, md)),
    history: (w?.history ?? []).slice(0, 6).map(dealView),
    record: advisoryRecord(world, p),
    reputation: reputationView(world, p),
    caps: {
      maxActive: maxActiveFor(world, p),
      perMonth: BANKWORK.perMonth,
      doneThisMonth: (w?.history ?? []).filter((d) => d.month === month).length,
      talksPerMonth: BANKWORK.talksPerMonth,
      talksThisMonth: w && w.talkMonth.month === month ? w.talkMonth.n : 0,
    },
    venues: venuesHere(world, p, now),
    talks: (w?.talks ?? []).slice(0, 6),
    lessons: (w?.lessons ?? [])
      .map((id) => bankLessonById(id))
      .filter((l): l is BankLesson => !!l)
      .map((l) => ({ id: l.id, topic: l.topic, text: l.text, tip: l.tip, by: l.by })),
    lessonsTotal: BANK_LESSONS.length,
    recruits: w?.recruits ?? [],
    clients: w?.clients ?? [],
    line: lineView(world, p),
    listing: w?.objective ? listingOf(world, p) : null,
  };
}
