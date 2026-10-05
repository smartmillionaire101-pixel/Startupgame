/**
 * Capital programmes and investor gameplay (Wave 5, section B).
 *
 *  - Accelerators (data/programs.ts, 1–3 per market by VC depth): a founder
 *    applies (`accelerator.apply`); the answer comes at the accelerator
 *    market's next settlement, judged on stage, traction and founder stars.
 *    Acceptance pays cash for a small stake on a SAFE (holder `accel:<id>`,
 *    paid from the market's LP account, exit proceeds return there), bumps
 *    stars and assigns a mentor (product fit and fundraising skill grow each
 *    month). Cohorts close every three months with a demo day: news, stars,
 *    a fundraising bonus for three months and, often, a SAFE offer from a
 *    local fund.
 *  - Development partners: `grant.apply` → decision at settlement with the
 *    eligibility reasons spelled out; non-dilutive cash in two tranches, the
 *    second only if the reporting condition is met three months later.
 *  - LPs: a player-run fund pitches an LP in its city (`lp.pitch`) and gets a
 *    commitment at settlement, by track record, stars and fit with the LP's
 *    preferred investor types.
 *  - Deal flow (`dealFlowView`) and one-tap investing (`invest.quick`) through
 *    the ordinary SAFE / priced-round deal machinery.
 *  - AI angels "hang out" at cafés and restaurants each period (`angelsAt`);
 *    `pitch.angel` from there (warm) or cold (their office).
 *  - Event broadcasts and AI attendees by name.
 *  - The central bank governor: the best licensed human banker per market,
 *    reviewed each quarter.
 *
 * Determinism and saved worlds: everything is derived from static data and
 * optional world fields (`world.applications`, `company.accelerator`,
 * `m.governor`, `event.broadcast`); ids are stable strings built from their
 * inputs, never `newId`, so nothing here shifts other ids; every draw uses
 * the new 'programs' RNG label. Money moves only through the ledger
 * (external LP and supplier accounts on the outside), so it is conserved.
 */
import {
  ACCELERATORS,
  COHORT_MONTHS,
  DEV_PARTNERS,
  INVESTOR_TYPES,
  LPS,
  LP_KIND_LABEL,
} from './data/programs.js';
import type {
  AcceleratorSeed,
  DevPartnerSeed,
  GrantProgramSeed,
  InvestorType,
  LpSeed,
} from './data/programs.js';
import { CAPITAL } from './data/capital.js';
import { EVENT_KIND_DATA, EVENT_MAX_BUDGET_COL } from './data/events.js';
import { AI_FIRST_NAMES, AI_LAST_NAMES } from './data/fiction.js';
import { INDUSTRY_LABEL } from './data/industries.js';
import type { MarketId } from './data/markets.js';
import { activeAngels } from './angels.js';
import { bankFigures } from './banks.js';
import { addSafe } from './captable.js';
import { gameDate } from './clock.js';
import { openDeal } from './deals.js';
import { businessesOf, getBusiness, isOpen, specOf } from './economy.js';
import { ensure } from './errors.js';
import { addContact, expectedFill, guestPool } from './events.js';
import { SLIDES, proposeInvestment, startPitch, strengths } from './fundraising.js';
import type { Slide } from './fundraising.js';
import { trackRecord } from './funds.js';
import {
  col,
  getCompany,
  getMarket,
  lastPnl,
  locationOf,
  nextStage,
  notify,
  ownCompany,
  publish,
  totalCustomers,
  usdToLocal,
} from './helpers.js';
import { account, costIn, pay, payExact, transfer, valueIn } from './ledger.js';
import { clamp, clamp01 } from './math.js';
import { formatMoney, scale } from './money.js';
import { deriveRng, hashString } from './rng.js';
import type { Rng } from './rng.js';
import { applyStarEvent } from './stars.js';
import { hasVisited } from './travel.js';
import { monthlyGrowth, valueCompany } from './valuation.js';
import type {
  CapitalApplication,
  CityEvent,
  Company,
  ContactKind,
  Fund,
  Id,
  MarketState,
  Player,
  World,
} from './types.js';

// ---------------------------------------------------------------- Lookups

/** Accelerators open in a market: 3 at London depth and above, 2 from a quarter of it, else 1. */
export const acceleratorCount = (market: MarketId): number => {
  const d = CAPITAL[market].vcDepth;
  return d >= 1 ? 3 : d >= 0.25 ? 2 : 1;
};
export const acceleratorsOf = (market: MarketId): AcceleratorSeed[] =>
  ACCELERATORS[market].slice(0, acceleratorCount(market));
export const devPartnersOf = (market: MarketId): DevPartnerSeed[] => DEV_PARTNERS[market];
/** LPs in a market: 2 to 5 by VC depth. */
export const lpCount = (market: MarketId): number =>
  clamp(Math.round(2 + 2 * CAPITAL[market].vcDepth), 2, 5);
export const lpsOf = (market: MarketId): LpSeed[] => LPS[market].slice(0, lpCount(market));

const markets = () => Object.keys(ACCELERATORS) as MarketId[];

function findAccelerator(id: Id): { seed: AcceleratorSeed; market: MarketId } | null {
  for (const market of markets()) {
    const seed = acceleratorsOf(market).find((a) => a.id === id);
    if (seed) return { seed, market };
  }
  return null;
}

function findPartner(id: Id): { seed: DevPartnerSeed; market: MarketId } | null {
  for (const market of markets()) {
    const seed = devPartnersOf(market).find((a) => a.id === id);
    if (seed) return { seed, market };
  }
  return null;
}

function findLp(id: Id): { seed: LpSeed; market: MarketId } | null {
  for (const market of markets()) {
    const seed = lpsOf(market).find((a) => a.id === id);
    if (seed) return { seed, market };
  }
  return null;
}

/** Cap-table holder id of an accelerator (paid like an outside holder, from/to the LP account). */
export const acceleratorHolderId = (id: Id) => `accel:${id}`;

const appsOf = (world: World) => (world.applications ??= {});
const appList = (world: World): CapitalApplication[] => Object.values(world.applications ?? {});

const appId = (kind: string, target: string, applicant: string, month: number) =>
  `app:${kind}:${target}:${applicant}:${month}`;

/** Fund types: explicit, or read from what the fund is. */
export function fundInvestorType(f: Fund): InvestorType {
  if (f.investorType) return f.investorType;
  if (f.angelId || /angel/i.test(f.name)) return 'angel';
  if (/impact|health fund|development/i.test(f.name)) return 'impact';
  if (/corporate|telecom|bank ventures/i.test(f.name)) return 'corporate';
  return 'vc';
}

/** A player's investor type: explicit, or VC once they run a fund, angel before. */
export function playerInvestorType(world: World, p: Player): InvestorType | null {
  if (p.role !== 'investor' || !p.investor) return null;
  if (p.investor.type) return p.investor.type;
  const f = p.investor.fundId ? world.funds[p.investor.fundId] : undefined;
  return f ? fundInvestorType(f) : 'angel';
}

export const isInvestorType = (v: unknown): v is InvestorType =>
  (INVESTOR_TYPES as readonly unknown[]).includes(v);

/** The fund a human manages, if any. */
function managedFund(world: World, p: Player): Fund | null {
  const f = p.investor?.fundId ? world.funds[p.investor.fundId] : undefined;
  return f && f.managerId === p.id ? f : null;
}

const humanFounders = (world: World, c: Company): Player[] =>
  c.founderIds.map((id) => world.players[id]).filter((p): p is Player => !!p && !p.ai);

/** Wave 5 (section A) adds `gender`; read it loosely so older saves still work. */
const isWoman = (p: Player) => (p as Player & { gender?: string }).gender === 'female';

const fmt = (m: MarketState, v: number) => formatMoney(v, m.data.currency);

function techOutlet(m: MarketState) {
  const o = m.outlets.find((x) => x.type === 'tech') ?? m.outlets[0];
  return { outletId: o?.id ?? 'tech', outletName: o?.name ?? 'Tech desk' };
}

// ---------------------------------------------------------------- Accelerators

/** Demo days fall on cohort boundaries: the first one at least two months after joining. */
export function demoDayFor(month: number): number {
  const first = Math.ceil((month + 2) / COHORT_MONTHS) * COHORT_MONTHS;
  return Math.max(first, COHORT_MONTHS);
}

/** Recently through demo day (three months): funds and angels lean in. */
export const demoDayGlow = (world: World, c: Company): boolean =>
  !!c.accelerator?.demoDayDone &&
  (world.markets[c.accelerator.market]?.month ?? 0) - c.accelerator.demoDayMonth < 3;

interface Fit {
  ok: boolean;
  reason: string;
}

function acceleratorEligibility(seed: AcceleratorSeed, c: Company): Fit {
  if (c.status !== 'active') return { ok: false, reason: 'The company has closed.' };
  if (c.bannedFromRaising)
    return { ok: false, reason: 'Barred from raising after a fraud ruling.' };
  if (c.capTable.roundsRaised > 0 || (c.lastRound !== null && c.lastRound !== 'pre-seed'))
    return { ok: false, reason: 'Accelerators take companies before a priced round.' };
  if (seed.sectors !== 'any' && !seed.sectors.includes(c.industry))
    return {
      ok: false,
      reason: `Only ${seed.sectors.map((s) => INDUSTRY_LABEL[s]).join(', ')} companies.`,
    };
  if (c.accelerator && !c.accelerator.demoDayDone)
    return { ok: false, reason: `Already in ${c.accelerator.name}.` };
  if (c.accelerator?.acceleratorId === seed.id)
    return { ok: false, reason: 'Already an alumnus of this programme.' };
  return { ok: true, reason: '' };
}

/** How well a company fits an accelerator's bar, 0–1, with its weakest point. */
function acceleratorScore(world: World, c: Company) {
  const founder = humanFounders(world, c)[0] ?? world.players[c.founderIds[0]!];
  const pnl = lastPnl(c);
  const discovery = Math.max(0, ...Object.values(c.product.discovery));
  const parts = {
    product: c.product.fit * 0.35,
    customers: totalCustomers(c) > 0 ? 0.1 : 0,
    revenue: (pnl?.revenue ?? 0) > 0 ? 0.1 : 0,
    discovery: discovery * 0.15,
    founder: ((founder?.stars.value ?? 1) / 5) * 0.2,
    company: (c.stars.value / 5) * 0.1,
  };
  const score = 0.2 + Object.values(parts).reduce((a, b) => a + b, 0);
  const weakest =
    parts.customers === 0
      ? 'No paying customers yet.'
      : c.product.fit < 0.35
        ? 'The product isn’t there yet.'
        : discovery < 0.3
          ? 'Talk to more customers first.'
          : 'Not this cohort; the founder track record is thin.';
  return { score, weakest };
}

const ACCEL_BAR: Record<1 | 2 | 3, number> = { 1: 0.62, 2: 0.47, 3: 0.36 };

export function applyAccelerator(world: World, me: Player, acceleratorId: Id, companyId: Id) {
  const found = findAccelerator(acceleratorId);
  ensure(found, 'accelerator.missing', 'Accelerator not found.');
  const { seed, market } = found;
  const c = ownCompany(world, me.id, companyId);
  const m = getMarket(world, market);
  ensure(
    locationOf(me) === market,
    'accelerator.where',
    `${seed.name} is in ${m.data.name}. Apply in person.`,
  );
  const fit = acceleratorEligibility(seed, c);
  ensure(fit.ok, 'accelerator.eligible', `${seed.name}: “${fit.reason}”`);
  ensure(
    !appList(world).some(
      (a) => a.kind === 'accelerator' && a.companyId === c.id && a.status === 'pending',
    ),
    'accelerator.pending',
    'You already have an accelerator application waiting for an answer.',
  );
  const recent = appList(world).find(
    (a) =>
      a.kind === 'accelerator' &&
      a.targetId === seed.id &&
      a.companyId === c.id &&
      a.status === 'rejected' &&
      m.month - a.month < COHORT_MONTHS,
  );
  ensure(!recent, 'accelerator.cooldown', `${seed.name} said no recently. Try the next cohort.`);
  const app: CapitalApplication = {
    id: appId('accelerator', seed.id, c.id, m.month),
    kind: 'accelerator',
    market,
    playerId: me.id,
    companyId: c.id,
    fundId: null,
    targetId: seed.id,
    month: m.month,
    status: 'pending',
    reason: '',
    amount: 0,
  };
  ensure(!appsOf(world)[app.id], 'accelerator.pending', 'You applied this month already.');
  appsOf(world)[app.id] = app;
  return {
    applicationId: app.id,
    message: `Applied to ${seed.name}. You’ll hear back at month end.`,
  };
}

function decideAccelerator(
  world: World,
  app: CapitalApplication,
  m: MarketState,
  month: number,
  rng: Rng,
) {
  const found = findAccelerator(app.targetId);
  const c = app.companyId ? world.companies[app.companyId] : undefined;
  if (!found || !c) return reject(world, app, month, 'The application lapsed.');
  const { seed } = found;
  const fit = acceleratorEligibility(seed, c);
  if (!fit.ok) return reject(world, app, month, fit.reason, seed.name);
  const demoDayMonth = demoDayFor(month);
  const filled = Object.values(world.companies).filter(
    (x) => x.accelerator?.acceleratorId === seed.id && x.accelerator.demoDayMonth === demoDayMonth,
  ).length;
  if (filled >= seed.seats)
    return reject(world, app, month, 'This cohort is full. Apply for the next one.', seed.name);
  const { score, weakest } = acceleratorScore(world, c);
  // Selective programmes want paying customers; open-door ones at least customer discovery.
  const discovery = Math.max(0, ...Object.values(c.product.discovery));
  if (seed.tier < 3 && totalCustomers(c) === 0)
    return reject(world, app, month, 'No paying customers yet.', seed.name);
  if (seed.tier < 3 && c.product.fit < 0.4)
    return reject(world, app, month, 'The product isn’t there yet.', seed.name);
  if (seed.tier === 3 && totalCustomers(c) === 0 && discovery < 0.2)
    return reject(world, app, month, 'Talk to more customers first.', seed.name);
  if (score + rng.normal(0, 0.05) < ACCEL_BAR[seed.tier])
    return reject(world, app, month, weakest, seed.name);

  // Cash for equity on a SAFE whose cap converts into the advertised stake.
  const check = usdToLocal(world, m, seed.checkUsd);
  const received = pay(world, m.ext.lps, c.account, check, `${seed.name} investment`, month);
  const cap = Math.round((received * 10_000) / seed.equityBps);
  addSafe(c.capTable, { holderId: acceleratorHolderId(seed.id), amount: received, cap, month });
  c.capTable.lastPostMoney = Math.max(c.capTable.lastPostMoney, cap);
  const mentor = rng.pick(seed.mentors);
  c.accelerator = {
    acceleratorId: seed.id,
    market: m.id,
    name: seed.name,
    mentor,
    joinedMonth: month,
    demoDayMonth,
  };
  applyStarEvent(c.stars, 0.25);
  for (const f of humanFounders(world, c)) applyStarEvent(f.stars, 0.15);
  app.status = 'accepted';
  app.decidedMonth = month;
  app.amount = received;
  app.reason = `${seed.name} is in: ${fmt(getMarket(world, c.market), received)} for ${seed.equityBps / 100}% on a SAFE.`;
  for (const f of humanFounders(world, c))
    notify(world, f.id, {
      month: getMarket(world, c.market).month,
      kind: 'deal',
      text: `${app.reason} Your mentor is ${mentor}. Demo day: ${gameDate(demoDayMonth).label}.`,
      ref: { kind: 'company', id: c.id },
    });
  publish(world, {
    market: m.id,
    month,
    ...techOutlet(m),
    kind: 'milestone',
    alert: `${c.name} joins ${seed.name}.`,
    headline: `${c.name} gets into ${seed.name}`,
    body: `${c.name}, a ${INDUSTRY_LABEL[c.industry]} startup, joins the ${seed.name} cohort with ${mentor} as mentor. Demo day is ${gameDate(demoDayMonth).label}.`,
    starDelta: 0.25,
    verified: true,
    subject: { kind: 'company', id: c.id },
  });
}

function reject(world: World, app: CapitalApplication, month: number, why: string, who?: string) {
  app.status = 'rejected';
  app.decidedMonth = month;
  app.reason = why;
  const c = app.companyId ? world.companies[app.companyId] : undefined;
  notify(world, app.playerId, {
    month: world.markets[world.players[app.playerId]?.market ?? app.market]?.month ?? month,
    kind: 'deal',
    text: who ? `${who} said no: “${why}”` : why,
    ...(c ? { ref: { kind: 'company' as const, id: c.id } } : {}),
  });
}

/** Mentoring while in the programme, then demo day at the cohort's end. */
function runAccelerators(world: World, m: MarketState, month: number, rng: Rng) {
  const inProgramme = Object.values(world.companies)
    .filter((c) => c.accelerator?.market === m.id && !c.accelerator.demoDayDone)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const demo: Record<string, Company[]> = {};
  for (const c of inProgramme) {
    if (c.status !== 'active') {
      c.accelerator!.demoDayDone = true;
      continue;
    }
    // The mentor: a little product sharpening and fundraising practice every month.
    c.product.fit = clamp01(c.product.fit + 0.02 * (1 - c.product.fit));
    for (const f of humanFounders(world, c))
      f.skills.fundraising = Math.min(100, f.skills.fundraising + 1);
    if (month >= c.accelerator!.demoDayMonth) (demo[c.accelerator!.acceleratorId] ??= []).push(c);
  }
  for (const [accelId, cohort] of Object.entries(demo)) {
    const seed = findAccelerator(accelId)?.seed;
    const name = seed?.name ?? cohort[0]!.accelerator!.name;
    for (const c of cohort) {
      c.accelerator!.demoDayDone = true;
      applyStarEvent(c.stars, 0.1);
      if (c.ai || c.aiCeo) {
        c.raising = true;
        continue;
      }
      for (const f of humanFounders(world, c))
        notify(world, f.id, {
          month: getMarket(world, c.market).month,
          kind: 'milestone',
          text: `Demo day at ${name}: you pitched the room. Funds are paying attention for the next three months.`,
          ref: { kind: 'company', id: c.id },
        });
      demoDayOffer(world, c, rng, seed?.tier ?? 3);
    }
    publish(world, {
      market: m.id,
      month,
      ...techOutlet(m),
      kind: 'feature',
      alert: `${name} demo day: ${cohort.length} startup${cohort.length === 1 ? '' : 's'} pitch.`,
      headline: `${name} demo day`,
      body: `${cohort.map((c) => c.name).join(', ')} pitched investors at ${name}’s demo day.`,
      starDelta: 0.1,
      verified: true,
      subject: { kind: 'market', id: m.id },
    });
  }
}

/** Demo day interest: often a local AI fund offers a SAFE on a deal card. */
function demoDayOffer(world: World, c: Company, rng: Rng, tier: number) {
  const stage = nextStage(c.lastRound);
  const funds = Object.values(world.funds).filter(
    (f) =>
      f.ai &&
      !f.angelId &&
      f.market === c.market &&
      f.stages.includes(stage) &&
      (f.sectors === 'any' || f.sectors.includes(c.industry)),
  );
  if (!funds.length || !rng.chance(clamp(0.3 + c.stars.value / 10 + (3 - tier) * 0.1, 0, 0.85)))
    return;
  const fund = rng.pick(funds);
  const pre = Math.max(valueCompany(world, c, stage).value, c.capTable.lastPostMoney);
  const amount = clamp(Math.round(pre * 0.15), fund.check[0], fund.check[1]);
  if (account(world, fund.account).balance < amount || pre + amount <= amount * 1.5) return;
  openDeal(world, {
    companyId: c.id,
    proposer: { kind: 'fund', id: fund.id },
    counterparty: { kind: 'company', id: c.id },
    terms: {
      kind: 'investment',
      instrument: 'safe',
      stage,
      amount,
      valuation: pre + amount,
      liquidationMultiple: 1,
      participating: false,
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
      poolTopUpBps: 0,
    },
    by: fund.id,
    aiLimit: { maxValuation: Math.round((pre + amount) * 1.15), maxAmount: fund.check[1] },
  });
}

export function acceleratorsView(world: World, viewer: Player, m: MarketState) {
  const companies = viewer.companyIds
    .map((id) => world.companies[id])
    .filter((c): c is Company => !!c && c.status === 'active' && c.founderIds.includes(viewer.id));
  const nextDemo = demoDayFor(m.month);
  return acceleratorsOf(m.id).map((seed) => {
    const cohort = Object.values(world.companies).filter(
      (c) => c.accelerator?.acceleratorId === seed.id,
    );
    const current = cohort.filter((c) => !c.accelerator!.demoDayDone);
    return {
      id: seed.id,
      name: seed.name,
      tagline: seed.tagline,
      tier: seed.tier,
      sectors: seed.sectors,
      stages: ['pre-seed', 'seed'],
      /** Cash on a SAFE, local minor units. */
      check: usdToLocal(world, m, seed.checkUsd),
      equityBps: seed.equityBps,
      mentors: seed.mentors,
      look: seed.look,
      cohort: {
        seats: seed.seats,
        filled: current.filter((c) => c.accelerator!.demoDayMonth === nextDemo).length,
        demoDayMonth: nextDemo,
        demoDayLabel: gameDate(nextDemo).label,
        monthsToDemoDay: nextDemo - m.month,
        companies: current.map((c) => ({ id: c.id, name: c.name, ai: c.ai })),
      },
      alumni: cohort.length - current.length,
      /** For each of your companies: can it apply, is it waiting, in, or turned down (and why). */
      you: companies.map((c) => {
        const app = appList(world)
          .filter((a) => a.kind === 'accelerator' && a.targetId === seed.id && a.companyId === c.id)
          .sort((a, b) => b.month - a.month)[0];
        const fit = acceleratorEligibility(seed, c);
        const member = c.accelerator?.acceleratorId === seed.id;
        const status = member
          ? c.accelerator!.demoDayDone
            ? 'alumni'
            : 'accepted'
          : app?.status === 'pending'
            ? 'applied'
            : app?.status === 'rejected' && m.month - app.month < COHORT_MONTHS
              ? 'rejected'
              : fit.ok
                ? 'eligible'
                : 'ineligible';
        return {
          companyId: c.id,
          companyName: c.name,
          status: status as
            'eligible' | 'ineligible' | 'applied' | 'accepted' | 'rejected' | 'alumni',
          reason: status === 'ineligible' ? fit.reason : (app?.reason ?? ''),
          mentor: member ? c.accelerator!.mentor : null,
        };
      }),
    };
  });
}

// ---------------------------------------------------------------- Development partners

function grantEligibility(
  world: World,
  m: MarketState,
  program: GrantProgramSeed,
  c: Company,
): Fit {
  if (c.status !== 'active') return { ok: false, reason: 'The company has closed.' };
  if (c.market !== m.id)
    return { ok: false, reason: `Only for companies registered in ${m.data.name}.` };
  if (c.bannedFromRaising) return { ok: false, reason: 'Barred after a fraud ruling.' };
  if (program.sectors !== 'any' && !program.sectors.includes(c.industry))
    return {
      ok: false,
      reason: `Only ${program.sectors.map((s) => INDUSTRY_LABEL[s]).join(', ')} companies.`,
    };
  if (program.womenLed && !humanFounders(world, c).some(isWoman))
    return { ok: false, reason: 'For companies with a woman on the founding team.' };
  const age = m.month - c.foundedMonth;
  if (program.minMonthsTrading !== undefined && age < program.minMonthsTrading)
    return { ok: false, reason: `Trading at least ${program.minMonthsTrading} months.` };
  if (program.maxMonthsTrading !== undefined && age > program.maxMonthsTrading)
    return { ok: false, reason: `For companies under ${program.maxMonthsTrading} months old.` };
  if (program.needsRevenue && !((lastPnl(c)?.revenue ?? 0) > 0))
    return { ok: false, reason: 'You need some revenue first.' };
  return { ok: true, reason: '' };
}

const CONDITION_LABEL: Record<GrantProgramSeed['condition'], string> = {
  active: 'Still trading at the three-month report.',
  hire: 'At least one hire by the three-month report.',
  customers: 'Paying customers at the three-month report.',
  revenue: 'Revenue at the three-month report.',
};

function grantRange(world: World, m: MarketState, p: GrantProgramSeed): [number, number] {
  return [usdToLocal(world, m, p.amountUsd[0]), usdToLocal(world, m, p.amountUsd[1])];
}

export function applyGrant(
  world: World,
  me: Player,
  partnerId: Id,
  programId: string,
  companyId: Id,
) {
  const found = findPartner(partnerId);
  ensure(found, 'grant.missing', 'Development partner not found.');
  const program = found.seed.programs.find((p) => p.id === programId);
  ensure(program, 'grant.missing', 'Programme not found.');
  const m = getMarket(world, found.market);
  const c = ownCompany(world, me.id, companyId);
  ensure(
    locationOf(me) === m.id,
    'grant.where',
    `${found.seed.name} is in ${m.data.name}. Visit their office to apply.`,
  );
  const fit = grantEligibility(world, m, program, c);
  ensure(fit.ok, 'grant.eligible', `${program.label}: ${fit.reason}`);
  const mine = appList(world).filter(
    (a) =>
      a.kind === 'grant' &&
      a.targetId === partnerId &&
      a.programId === programId &&
      a.companyId === c.id,
  );
  ensure(!mine.some((a) => a.status === 'accepted'), 'grant.held', 'You already hold this grant.');
  ensure(
    !mine.some((a) => a.status === 'pending'),
    'grant.pending',
    'Your application is with the panel.',
  );
  ensure(
    !mine.some((a) => a.status === 'rejected' && m.month - a.month < 3),
    'grant.cooldown',
    'The panel turned you down recently. Reapply in a few months.',
  );
  const app: CapitalApplication = {
    id: appId('grant', `${partnerId}/${programId}`, c.id, m.month),
    kind: 'grant',
    market: m.id,
    playerId: me.id,
    companyId: c.id,
    fundId: null,
    targetId: partnerId,
    programId,
    month: m.month,
    status: 'pending',
    reason: '',
    amount: 0,
  };
  appsOf(world)[app.id] = app;
  return {
    applicationId: app.id,
    message:
      program.window === 'quarterly'
        ? `Applied to ${program.label}. The panel sits at the end of the quarter.`
        : `Applied to ${program.label}. You’ll hear back at month end.`,
  };
}

function decideGrant(
  world: World,
  app: CapitalApplication,
  m: MarketState,
  month: number,
  rng: Rng,
) {
  const found = findPartner(app.targetId);
  const program = found?.seed.programs.find((p) => p.id === app.programId);
  const c = app.companyId ? world.companies[app.companyId] : undefined;
  if (!found || !program || !c) return reject(world, app, month, 'The application lapsed.');
  // Quarterly windows: the panel sits at quarter ends only.
  if (program.window === 'quarterly' && month % 3 !== 0) return;
  const fit = grantEligibility(world, m, program, c);
  if (!fit.ok) return reject(world, app, month, fit.reason, found.seed.name);
  const founder = humanFounders(world, c)[0];
  const discovery = Math.max(0, ...Object.values(c.product.discovery));
  const score =
    0.3 +
    c.product.fit * 0.25 +
    discovery * 0.15 +
    (c.stars.value / 5) * 0.1 +
    ((founder?.stars.value ?? 1) / 5) * 0.1 +
    ((lastPnl(c)?.revenue ?? 0) > 0 ? 0.1 : 0) +
    ((founder?.network ?? 30) / 100) * 0.05;
  const bar = 0.3 + program.selectivity * 0.4;
  if (score + rng.normal(0, 0.06) < bar)
    return reject(
      world,
      app,
      month,
      discovery < 0.3
        ? 'Show us more evidence from customers.'
        : 'Strong field this round; we funded others.',
      found.seed.name,
    );
  const [lo, hi] = grantRange(world, m, program);
  const total = Math.round(lo + (hi - lo) * clamp01((score - bar) / 0.4));
  const first = Math.round(total * 0.6);
  transfer(world, m.ext.lps, c.account, first, `Grant: ${program.label} (first tranche)`, month);
  app.status = 'accepted';
  app.decidedMonth = month;
  app.amount = first;
  app.grant = {
    total,
    paid: first,
    reportMonth: month + 3,
    condition: program.condition,
  };
  app.reason = `${program.label}: ${fmt(m, total)}, no equity. ${fmt(m, first)} now; the rest after the report (${CONDITION_LABEL[program.condition].toLowerCase()})`;
  notify(world, app.playerId, {
    month,
    kind: 'deal',
    text: `${found.seed.name} awarded ${c.name} a grant. ${app.reason}`,
    ref: { kind: 'company', id: c.id },
  });
}

/** Three months on: the report. Met → second tranche; missed → it lapses. */
function grantReports(world: World, m: MarketState, month: number) {
  for (const app of appList(world)) {
    if (app.kind !== 'grant' || app.market !== m.id || !app.grant) continue;
    if (app.grant.reported || month < app.grant.reportMonth) continue;
    const c = app.companyId ? world.companies[app.companyId] : undefined;
    const program = findPartner(app.targetId)?.seed.programs.find((p) => p.id === app.programId);
    const met =
      !!c &&
      c.status === 'active' &&
      (app.grant.condition === 'active' ||
        (app.grant.condition === 'hire' && c.staff.length > 0) ||
        (app.grant.condition === 'customers' && totalCustomers(c) > 0) ||
        (app.grant.condition === 'revenue' && (lastPnl(c)?.revenue ?? 0) > 0));
    const label = program?.label ?? 'Grant';
    if (met && c) {
      const rest = app.grant.total - app.grant.paid;
      transfer(world, m.ext.lps, c.account, rest, `Grant: ${label} (second tranche)`, month);
      app.grant.paid += rest;
      app.amount += rest;
      app.grant.reported = 'met';
      notify(world, app.playerId, {
        month,
        kind: 'deal',
        text: `${label}: report accepted. The second tranche (${fmt(m, rest)}) is in.`,
        ref: { kind: 'company', id: c.id },
      });
    } else {
      app.grant.reported = 'missed';
      notify(world, app.playerId, {
        month,
        kind: 'warning',
        text: `${label}: the report missed the condition (${CONDITION_LABEL[app.grant.condition].toLowerCase()}). The second tranche lapses.`,
      });
    }
  }
}

export function devPartnersView(world: World, viewer: Player, m: MarketState) {
  const companies = viewer.companyIds
    .map((id) => world.companies[id])
    .filter((c): c is Company => !!c && c.status === 'active' && c.founderIds.includes(viewer.id));
  return devPartnersOf(m.id).map((seed) => ({
    id: seed.id,
    name: seed.name,
    kind: seed.kind,
    look: seed.look,
    programs: seed.programs.map((p) => ({
      id: p.id,
      label: p.label,
      kind: p.kind,
      pitch: p.pitch,
      /** Grant size, local minor units. */
      amount: grantRange(world, m, p),
      sectors: p.sectors,
      womenLed: !!p.womenLed,
      window: p.window,
      condition: CONDITION_LABEL[p.condition],
      you: companies.map((c) => {
        const app = appList(world)
          .filter(
            (a) =>
              a.kind === 'grant' &&
              a.targetId === seed.id &&
              a.programId === p.id &&
              a.companyId === c.id,
          )
          .sort((a, b) => b.month - a.month)[0];
        const fit = grantEligibility(world, m, p, c);
        const status =
          app?.status === 'accepted'
            ? 'awarded'
            : app?.status === 'pending'
              ? 'applied'
              : app?.status === 'rejected' && m.month - app.month < 3
                ? 'rejected'
                : fit.ok
                  ? 'eligible'
                  : 'ineligible';
        return {
          companyId: c.id,
          companyName: c.name,
          status: status as 'eligible' | 'ineligible' | 'applied' | 'awarded' | 'rejected',
          reason: status === 'ineligible' ? fit.reason : (app?.reason ?? ''),
          grant: app?.grant
            ? {
                total: app.grant.total,
                paid: app.grant.paid,
                reportMonth: app.grant.reportMonth,
                reported: app.grant.reported ?? null,
              }
            : null,
        };
      }),
    })),
  }));
}

// ---------------------------------------------------------------- LPs

function lpBar(world: World, lp: LpSeed, manager: Player, fund: Fund): Fit {
  const record = trackRecord(world, [manager.id, fund.id]);
  if (record.deals < lp.minDeals)
    return {
      ok: false,
      reason: `They want ${lp.minDeals}+ deals on your record; you have ${record.deals}.`,
    };
  if (manager.stars.value < lp.minStars)
    return { ok: false, reason: `They back managers with ${lp.minStars}★ or more.` };
  return { ok: true, reason: '' };
}

export function pitchLp(world: World, me: Player, lpId: Id) {
  const found = findLp(lpId);
  ensure(found, 'lp.missing', 'LP not found.');
  const fund = managedFund(world, me);
  ensure(fund, 'lp.fund', 'LPs back funds. Raise your Fund I first.');
  const m = getMarket(world, found.market);
  ensure(
    locationOf(me) === m.id,
    'lp.where',
    `${found.seed.name} is in ${m.data.name}. Meet them there.`,
  );
  const mine = appList(world).filter(
    (a) => a.kind === 'lp' && a.targetId === lpId && a.fundId === fund.id,
  );
  ensure(
    !mine.some((a) => a.status === 'accepted'),
    'lp.committed',
    `${found.seed.name} is already one of your LPs.`,
  );
  ensure(
    !mine.some((a) => a.status === 'pending'),
    'lp.pending',
    'They’re still deciding. Answer at month end.',
  );
  ensure(
    !mine.some((a) => a.status === 'rejected' && m.month - a.month < 3),
    'lp.cooldown',
    'They passed recently. Come back with more on your record.',
  );
  const app: CapitalApplication = {
    id: appId('lp', lpId, fund.id, m.month),
    kind: 'lp',
    market: m.id,
    playerId: me.id,
    companyId: null,
    fundId: fund.id,
    targetId: lpId,
    month: m.month,
    status: 'pending',
    reason: '',
    amount: 0,
  };
  appsOf(world)[app.id] = app;
  return {
    applicationId: app.id,
    message: `You pitched ${found.seed.name}. They’ll decide at month end.`,
  };
}

function decideLp(world: World, app: CapitalApplication, m: MarketState, month: number, rng: Rng) {
  const lp = findLp(app.targetId)?.seed;
  const fund = app.fundId ? world.funds[app.fundId] : undefined;
  const manager = world.players[app.playerId];
  if (!lp || !fund || !manager || fund.managerId !== manager.id)
    return reject(world, app, month, 'The pitch lapsed.');
  const bar = lpBar(world, lp, manager, fund);
  if (!bar.ok) return reject(world, app, month, bar.reason, lp.name);
  const record = trackRecord(world, [manager.id, fund.id]);
  const type = fundInvestorType(fund);
  const score =
    0.2 +
    Math.min(record.deals, 10) * 0.035 +
    Math.min(record.dpi, 3) * 0.12 +
    (manager.stars.value / 5) * 0.25 +
    (lp.prefers.includes(type) ? 0.12 : -0.05) +
    (manager.investor?.lpCredibility ?? 0.3) * 0.2 -
    record.writeOffs * 0.02;
  if (score + rng.normal(0, 0.05) < 0.5)
    return reject(
      world,
      app,
      month,
      lp.prefers.includes(type)
        ? 'Not yet: show us cash returned, not paper gains.'
        : `We mostly back ${lp.prefers.join(' and ')} managers.`,
      lp.name,
    );
  const usd = lp.ticketUsd[0] + (lp.ticketUsd[1] - lp.ticketUsd[0]) * clamp01((score - 0.5) / 0.4);
  const commitment = usdToLocal(world, m, usd);
  const received = pay(
    world,
    m.ext.lps,
    fund.account,
    commitment,
    `LP commitment: ${lp.name}`,
    month,
  );
  fund.size += received;
  app.status = 'accepted';
  app.decidedMonth = month;
  app.amount = received;
  const fm = getMarket(world, fund.market);
  app.reason = `${lp.name} committed ${fmt(fm, received)} to ${fund.name}.`;
  notify(world, manager.id, { month: fm.month, kind: 'deal', text: app.reason });
  publish(world, {
    market: fund.market,
    month: fm.month,
    ...techOutlet(fm),
    kind: 'raise',
    alert: `${lp.name} backs ${fund.name}.`,
    headline: `${fund.name} adds ${LP_KIND_LABEL[lp.kind].toLowerCase()} money`,
    body: app.reason,
    starDelta: 0,
    verified: true,
    subject: { kind: 'fund', id: fund.id },
  });
}

export function lpsView(world: World, viewer: Player, m: MarketState) {
  const fund = managedFund(world, viewer);
  return lpsOf(m.id).map((lp) => {
    const app = fund
      ? appList(world)
          .filter((a) => a.kind === 'lp' && a.targetId === lp.id && a.fundId === fund.id)
          .sort((a, b) => b.month - a.month)[0]
      : undefined;
    const bar = fund ? lpBar(world, lp, viewer, fund) : null;
    const status = !fund
      ? 'no-fund'
      : app?.status === 'accepted'
        ? 'committed'
        : app?.status === 'pending'
          ? 'pending'
          : app?.status === 'rejected' && m.month - app.month < 3
            ? 'declined'
            : 'open';
    return {
      id: lp.id,
      name: lp.name,
      kind: lp.kind,
      kindLabel: LP_KIND_LABEL[lp.kind],
      pitch: lp.pitch,
      /** Commitment range, local minor units. */
      ticket: [usdToLocal(world, m, lp.ticketUsd[0]), usdToLocal(world, m, lp.ticketUsd[1])],
      prefers: lp.prefers,
      minDeals: lp.minDeals,
      minStars: lp.minStars,
      look: lp.look,
      you: {
        status: status as 'no-fund' | 'open' | 'pending' | 'committed' | 'declined',
        canPitch: status === 'open',
        reason: !fund
          ? 'LPs back funds: raise your Fund I first.'
          : status === 'open'
            ? bar && !bar.ok
              ? bar.reason
              : ''
            : (app?.reason ?? ''),
        committed: app?.status === 'accepted' ? app.amount : 0,
      },
    };
  });
}

// ---------------------------------------------------------------- Deal flow and quick investing

/** Raising: AI companies say so; human founders by pitching lately; anyone fresh from demo day. */
function raisingNow(world: World, c: Company, pitched: Map<Id, number>): boolean {
  if (demoDayGlow(world, c)) return true;
  // AI founders say so, or take money while young and before a priced round (like angels see it).
  if (c.ai || c.aiCeo)
    return (
      c.raising ||
      (c.capTable.roundsRaised === 0 &&
        (world.markets[c.market]?.month ?? 0) - c.foundedMonth <= 24)
    );
  return pitched.has(c.id);
}

/** The terms a one-tap investment would carry: a post-money cap (SAFE) or a pre-money (priced). */
function quickTerms(world: World, c: Company) {
  const stage = nextStage(c.lastRound);
  const model = valueCompany(world, c, stage).value;
  const pre = Math.max(model, c.capTable.lastPostMoney);
  const priced = c.capTable.roundsRaised > 0 || !['pre-seed', 'seed'].includes(stage);
  const maxCheck = Math.max(0, Math.round(model * 0.3));
  return { stage, model, pre, priced, maxCheck };
}

export function dealFlowView(world: World, viewer: Player, m: MarketState) {
  const pitched = new Map<Id, number>();
  for (const p of Object.values(world.pitches))
    if (p.month >= m.month - 3 && (pitched.get(p.companyId) ?? 0) < p.ask)
      pitched.set(p.companyId, p.ask);
  const isInvestor = viewer.role === 'investor';
  const fund = managedFund(world, viewer);
  return Object.values(world.companies)
    .filter(
      (c) =>
        c.market === m.id &&
        c.status === 'active' &&
        !c.bannedFromRaising &&
        !c.founderIds.includes(viewer.id) &&
        raisingNow(world, c, pitched),
    )
    .sort((a, b) => b.stars.value - a.stars.value || (a.id < b.id ? -1 : 1))
    .slice(0, 12)
    .map((c) => {
      const t = quickTerms(world, c);
      const pnl = lastPnl(c);
      const ask = c.ai || c.aiCeo ? Math.round(t.model * 0.15) : (pitched.get(c.id) ?? 0);
      const visited = hasVisited(viewer, c.market);
      const reason = !isInvestor
        ? 'Become an investor to back companies.'
        : !visited
          ? `Visit ${m.data.name} first.`
          : t.maxCheck <= 0
            ? 'Too early to price.'
            : '';
      return {
        companyId: c.id,
        name: c.name,
        ai: c.ai,
        industry: c.industry,
        industryLabel: INDUSTRY_LABEL[c.industry],
        idea: c.idea,
        stage: t.stage,
        stars: Math.round(c.stars.value * 10) / 10,
        customers: totalCustomers(c),
        monthlyRevenue: pnl?.revenue ?? 0,
        growthPct: Math.round(monthlyGrowth(c) * 1000) / 10,
        /** What they're raising, local minor units. */
        ask,
        /** The one-tap terms: SAFE post-money cap before the amount, or priced pre-money. */
        instrument: t.priced ? ('priced' as const) : ('safe' as const),
        valuation: t.pre,
        maxCheck: t.maxCheck,
        currency: m.data.currency,
        founders: c.founderIds.map((id) => world.players[id]?.name ?? '—'),
        accelerator: c.accelerator ? c.accelerator.name : null,
        youInvested: !!(
          world.positions[`${viewer.id}:${c.id}`] ||
          (fund && world.positions[`${fund.id}:${c.id}`])
        ),
        canInvest: reason === '',
        reason,
      };
    });
}

/**
 * One tap: back a raising company at fair terms from the model. SAFE at a
 * post-money cap (pre + amount) before a priced round, else priced at the
 * pre-money. Uses your fund when you run one with the cash, else personal
 * money. AI founders answer at once; human founders get a deal card.
 */
export function quickInvest(world: World, me: Player, companyId: Id, amount: number) {
  ensure(me.role === 'investor', 'invest.role', 'Become an investor to back companies.');
  const c = getCompany(world, companyId);
  ensure(c.status === 'active', 'company.closed', 'Company is not operating.');
  ensure(amount > 0, 'invest.amount', 'Say how much.');
  const m = getMarket(world, c.market);
  const t = quickTerms(world, c);
  ensure(
    t.maxCheck > 0 && amount <= t.maxCheck,
    'invest.amount',
    t.maxCheck > 0
      ? `${c.name} takes at most ${fmt(m, t.maxCheck)} from one investor.`
      : `${c.name} is too early to price.`,
  );
  const fund = managedFund(world, me);
  const cur = m.data.currency;
  const fundCan =
    !!fund &&
    account(world, fund.account).balance >=
      costIn(world, amount, cur, account(world, fund.account).currency);
  if (!fundCan) {
    const mine = account(world, me.accounts.local);
    ensure(
      mine.balance >= costIn(world, amount, cur, mine.currency),
      'invest.funds',
      `That’s ${fmt(m, amount)}; you don’t have it.`,
    );
  }
  const deal = proposeInvestment(world, {
    investorId: me.id,
    companyId,
    terms: {
      instrument: t.priced ? 'priced' : 'safe',
      amount,
      valuation: t.priced ? t.pre : t.pre + amount,
      proRata: false,
      boardSeat: false,
      vetoOnSale: false,
      fromFund: fundCan,
    },
  });
  me.skills.investing = Math.min(100, me.skills.investing + 0.5);
  return {
    dealId: deal.id,
    status: deal.status,
    summary: deal.summary,
    message:
      deal.status === 'accepted'
        ? `Done: you backed ${c.name}.`
        : deal.status === 'open'
          ? `Offer sent to ${c.name}.`
          : `${c.name} passed.`,
  };
}

// ---------------------------------------------------------------- Angels about town

/** Places an angel might be found: open businesses where you can sit down for a meeting. */
function hangouts(m: MarketState) {
  return Object.values(businessesOf(m))
    .filter((b) => isOpen(b) && !!specOf(b).venue?.items.some((i) => i.meeting))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Where each AI angel is this period: most are out at a café, restaurant or
 * hotel bar, the rest at their office. Deterministic per (market, month,
 * angel); read-only (no world change), so it never shifts anything.
 */
export function angelsAt(world: World, market: MarketId): Record<Id, Id[]> {
  const m = world.markets[market];
  if (!m) return {};
  const places = hangouts(m);
  const out: Record<Id, Id[]> = {};
  if (!places.length) return out;
  for (const a of activeAngels(world, market).sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const rng = deriveRng(world.seed, 'programs', 'hangout', market, m.month, a.id);
    if (!rng.chance(0.7)) continue;
    const b = rng.pick(places);
    (out[b.id] ??= []).push(a.id);
  }
  return out;
}

export function angelsView(world: World, m: MarketState) {
  return activeAngels(world, m.id).map((a) => {
    const f = world.funds[a.angel!.fundId];
    return {
      id: a.id,
      name: a.name,
      stars: Math.round(a.stars.value * 10) / 10,
      fundId: a.angel!.fundId,
      fundName: f?.name ?? '',
      sectors: f?.sectors ?? 'any',
      check: f?.check ?? [0, 0],
    };
  });
}

function bestSlides(world: World, c: Company): Slide[] {
  const s = strengths(world, c);
  return [...SLIDES].sort((a, b) => s[b] - s[a]).slice(0, 3);
}

/**
 * Pitch an AI angel in person: at a place they are right now (warm: a
 * contact is made first, so the pitch gets the warm-intro bonus; `treat`
 * buys the coffee for two) or from their office (cold). Then it's an
 * ordinary pitch to their angel fund: questions, then maybe a SAFE.
 */
export function pitchAngel(
  world: World,
  me: Player,
  args: { angelId: Id; companyId: Id; businessId?: Id; treat?: boolean },
) {
  const angel = world.players[args.angelId];
  ensure(
    angel && angel.ai && angel.angel && angel.angel.retiredMonth === undefined,
    'angel.missing',
    'That angel isn’t investing right now.',
  );
  const fund = world.funds[angel.angel.fundId];
  ensure(fund, 'angel.missing', 'That angel isn’t investing right now.');
  const c = ownCompany(world, me.id, args.companyId);
  const m = getMarket(world, angel.market);
  ensure(
    locationOf(me) === angel.market,
    'angel.where',
    `${angel.name} is in ${m.data.name}. Fly there to pitch in person.`,
  );
  let warm = false;
  let spent = 0;
  if (args.businessId) {
    const here = angelsAt(world, angel.market)[args.businessId] ?? [];
    ensure(here.includes(angel.id), 'angel.notHere', `${angel.name} isn’t there right now.`);
    warm = true;
    let warmth = 0.3;
    if (args.treat) {
      const b = getBusiness(world, args.businessId);
      const items = (specOf(b).venue?.items ?? []).filter((i) => i.meeting);
      const item = items.sort((x, y) => x.priceCol - y.priceCol)[0];
      ensure(item, 'venue.item', `${b.name} has nothing to share.`);
      spent = scale(col(m), item.priceCol) * 2;
      const mine = account(world, me.accounts.local);
      ensure(
        mine.balance >= costIn(world, spent, m.data.currency, mine.currency),
        'venue.funds',
        `That costs ${fmt(m, spent)}; you don’t have it.`,
      );
      payExact(
        world,
        me.accounts.local,
        b.account,
        spent,
        `${item.label} with ${angel.name}`,
        m.month,
      );
      warmth = 0.45;
    }
    addContact(
      me,
      { kind: 'fund', refId: fund.id, name: `${angel.name}, angel investor`, warmth },
      m.month,
    );
  }
  const cur = getMarket(world, c.market).data.currency;
  const fundCur = m.data.currency;
  const ask = valueIn(world, Math.round((fund.check[0] + fund.check[1]) / 2), fundCur, cur);
  const p = startPitch(world, {
    founderId: me.id,
    companyId: c.id,
    fundId: fund.id,
    slides: bestSlides(world, c),
    ask: Math.max(1, ask),
  });
  c.lastDecisionMonth = getMarket(world, c.market).month;
  return { pitchId: p.id, status: p.status, reason: p.reason, warm, spent };
}

// ---------------------------------------------------------------- Events

/** Most a host can spend broadcasting one event, in cost-of-living units. */
export const EVENT_MAX_BROADCAST_COL = EVENT_MAX_BUDGET_COL;

export function broadcastEvent(world: World, me: Player, eventId: Id, spend: number) {
  const e = world.events?.[eventId];
  ensure(e, 'event.missing', 'Event not found.');
  ensure(e.hostId === me.id, 'event.forbidden', 'Only the host can broadcast it.');
  ensure(e.status === 'upcoming', 'event.closed', 'This event is no longer upcoming.');
  ensure(spend > 0, 'event.broadcast', 'Say how much to spend.');
  const m = getMarket(world, e.market);
  const cap = scale(col(m), EVENT_MAX_BROADCAST_COL);
  ensure(
    (e.broadcast ?? 0) + spend <= cap,
    'event.broadcast',
    `Most you can spend broadcasting one event is ${fmt(m, cap)}.`,
  );
  const mine = account(world, me.accounts.local);
  ensure(
    mine.balance >= costIn(world, spend, m.data.currency, mine.currency),
    'event.funds',
    `That costs ${fmt(m, spend)}; you don’t have it.`,
  );
  const before = expectedAiGuests(world, e);
  payExact(world, me.accounts.local, m.ext.suppliers, spend, `Broadcast: ${e.title}`, m.month);
  e.broadcast = (e.broadcast ?? 0) + spend;
  const after = expectedAiGuests(world, e);
  return {
    broadcast: e.broadcast,
    expectedAi: after,
    message: `${e.title} is on the radio and every feed in town: about ${after} AI guests expected${after > before ? ` (+${after - before})` : ''}.`,
  };
}

/** AI guests we expect, from the room left and the fill (before the night's noise). */
export function expectedAiGuests(world: World, e: CityEvent): number {
  const humans = 1 + e.attendees.length;
  return Math.round(Math.max(0, e.capacity - humans) * expectedFill(world, e));
}

/**
 * AI guests by name. Held events: who came. Upcoming ones: who has RSVPed so
 * far; RSVPs accrue over the month (more after a broadcast) toward the
 * expected turnout. Read-only, own RNG label.
 */
export function attendeesAi(
  world: World,
  e: CityEvent,
  clock?: { now: number; monthMs: number },
): { name: string; kind: ContactKind }[] {
  if (e.status === 'cancelled') return [];
  const m = world.markets[e.market];
  if (!m) return [];
  if (e.status === 'held' && e.outcome?.aiNames?.length) return e.outcome.aiNames;
  const pool: { name: string; kind: ContactKind }[] = guestPool(world, e, m).map((g) => ({
    name: g.name,
    kind: g.kind,
  }));
  if (pool.length === 0)
    for (const b of Object.values(businessesOf(m)).filter(isOpen))
      pool.push({ name: `${b.owner.name}, ${b.name}`, kind: 'customer' });
  const order = deriveRng(world.seed, 'programs', 'rsvp', e.id).shuffle(pool);
  if (e.status === 'held') return order.slice(0, Math.min(e.outcome?.aiGuests ?? 0, 40));
  const expected = expectedAiGuests(world, e);
  const boost = Math.min(
    0.3,
    (e.broadcast ?? 0) / Math.max(1, scale(col(m), EVENT_KIND_DATA[e.kind].costCol * 5)),
  );
  let progress: number;
  if (e.month > m.month) progress = 0.15 + boost;
  else if (clock && m.settledAt !== undefined)
    progress = 0.3 + boost + 0.7 * clamp01((clock.now - m.settledAt) / clock.monthMs);
  else progress = 0.6 + boost;
  return order.slice(0, Math.min(40, Math.round(expected * clamp01(progress))));
}

// ---------------------------------------------------------------- Central bank governor

/** The AI governor's name: fixed per market. */
export function aiGovernorName(market: MarketId): string {
  const h = hashString(`governor:${market}`);
  const first = AI_FIRST_NAMES[market];
  const last = AI_LAST_NAMES[market];
  return `${first[h % first.length]} ${last[(h >>> 8) % last.length]}`;
}

/**
 * Each quarter: the best licensed bank run by a human (capital ratio, stars,
 * deposits) makes its banker governor; with none, the AI governor returns.
 */
export function appointGovernor(world: World, marketId: MarketId, month: number) {
  if (month % 3 !== 0) return;
  const m = getMarket(world, marketId);
  const unit = Math.max(1, col(m));
  let best: { bankId: Id; ownerId: Id; score: number } | null = null;
  for (const b of Object.values(world.banks).sort((x, y) => (x.id < y.id ? -1 : 1))) {
    if (b.market !== marketId || b.status !== 'licensed') continue;
    const owner = world.players[b.ownerId];
    if (!owner || owner.ai) continue;
    const f = bankFigures(world, b);
    const score =
      Math.min(0.5, Math.max(0, f.capitalRatio)) * 4 +
      b.stars.value +
      Math.log10(1 + Math.max(0, f.deposits) / unit);
    if (!best || score > best.score) best = { bankId: b.id, ownerId: b.ownerId, score };
  }
  const prev = m.governor;
  if (!best) {
    if (prev?.playerId) {
      m.governor = { playerId: null, name: aiGovernorName(marketId), bankId: null, since: month };
      announceGovernor(world, m, month, `${m.governor.name} returns as central bank governor.`);
    }
    return;
  }
  if (prev?.playerId === best.ownerId) {
    prev.bankId = best.bankId;
    return;
  }
  const owner = world.players[best.ownerId]!;
  m.governor = { playerId: owner.id, name: owner.name, bankId: best.bankId, since: month };
  applyStarEvent(owner.stars, 0.2);
  const bank = world.banks[best.bankId]!;
  notify(world, owner.id, {
    month,
    kind: 'milestone',
    text: `You’re the new governor of the central bank in ${m.data.name}: ${bank.name} is the best-run bank in the city.`,
  });
  if (prev?.playerId && prev.playerId !== owner.id)
    notify(world, prev.playerId, {
      month,
      kind: 'system',
      text: `${owner.name} replaces you as central bank governor in ${m.data.name}.`,
    });
  announceGovernor(world, m, month, `${owner.name} of ${bank.name} named central bank governor.`);
}

function announceGovernor(world: World, m: MarketState, month: number, text: string) {
  const o = m.outlets.find((x) => x.type === 'national') ?? m.outlets[0];
  publish(world, {
    market: m.id,
    month,
    outletId: o?.id ?? 'national',
    outletName: o?.name ?? 'National desk',
    kind: 'market',
    alert: text,
    headline: text,
    body: `${text} The governor is reviewed every quarter on capital, stars and deposits.`,
    starDelta: 0,
    verified: true,
    subject: { kind: 'market', id: m.id },
  });
  for (const p of Object.values(world.players))
    if (!p.ai && p.market === m.id && p.id !== m.governor?.playerId)
      notify(world, p.id, { month, kind: 'system', text });
}

export function centralBankView(m: MarketState) {
  const g = m.governor;
  return {
    name: `Central bank of ${m.data.country}`,
    baseRateBps: m.data.baseRateBps,
    governor: {
      name: g?.name ?? aiGovernorName(m.id),
      human: !!g?.playerId,
    },
    governorSince: g?.since ?? null,
  };
}

// ---------------------------------------------------------------- Settlement

/**
 * Once a month per market, after the AI funds and angels: decide pending
 * applications (oldest first), mentor and hold demo days, file grant reports.
 * Own RNG label ('programs'), so no other system's draws shift.
 */
export function settlePrograms(world: World, marketId: MarketId, month: number) {
  const m = getMarket(world, marketId);
  const rng = deriveRng(world.seed, 'programs', marketId, month);
  const pending = appList(world)
    .filter((a) => a.market === marketId && a.status === 'pending' && a.month < month)
    .sort((a, b) => a.month - b.month || (a.id < b.id ? -1 : 1));
  for (const app of pending) {
    if (app.kind === 'accelerator') decideAccelerator(world, app, m, month, rng);
    else if (app.kind === 'grant') decideGrant(world, app, m, month, rng);
    else decideLp(world, app, m, month, rng);
  }
  runAccelerators(world, m, month, rng);
  grantReports(world, m, month);
}

/** Everything a city adds for Wave 5 section B, for `view.market` and `view.here`. */
export function capitalProgramsView(world: World, viewer: Player, m: MarketState) {
  return {
    accelerators: acceleratorsView(world, viewer, m),
    devPartners: devPartnersView(world, viewer, m),
    lps: lpsView(world, viewer, m),
    dealFlow: dealFlowView(world, viewer, m),
    /** businessId → AI angel player ids there this period. */
    angelsAt: angelsAt(world, m.id),
    /** Active AI angels in this city (for names and pitching). */
    angels: angelsView(world, m),
    centralBank: centralBankView(m),
  };
}
