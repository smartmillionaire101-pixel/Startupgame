/**
 * Founder Journey 5, chapter 7 "The Capital Allocator" (blueprint §2.1, §9.5):
 * what to do with money and experience after an exit (or instead of one).
 *
 *  - Angel and fund paths already exist (invest.*, fund.raise).
 *  - Mentor: monthly advice to a startup (a small product boost) for an
 *    advisor grant of 0.25–1% through the cap table, if the founder agrees.
 *  - Philanthropy: gifts to causes with measurable outcomes, through the
 *    ledger into the city's giving fund.
 *  - A career at a DFI or a bank: a monthly salary and a work decision a month.
 *  - Serial founder: start again, carrying skills, reputation and contacts.
 *
 * Replay safety: all state is new and optional; settlement only touches
 * mentorships and careers that exist.
 */
import { investorOn } from './releases.js';
import { LPS } from './data/programs.js';
import { fullyDiluted } from './captable.js';
import { DEV_PARTNERS } from './data/programs.js';
import type { MarketId } from './data/markets.js';
import { ensure, fail } from './errors.js';
import {
  achieve,
  adjustTrust,
  col,
  getCompany,
  getMarket,
  hoursLeft,
  notify,
  spendHours,
} from './helpers.js';
import { newId } from './ids.js';
import { account, openAccount, transfer, valueIn, withTx } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney, scale } from './money.js';
import { hashString } from './rng.js';
import { applyStarEvent } from './stars.js';
import type { CareerRole, Company, Id, Mentorship, Player, World } from './types.js';

export const ALLOCATOR = {
  mentor: {
    /** Advisor grant range, bps of the company after the grant. */
    grantBps: [25, 100] as const,
    defaultGrantBps: 50,
    /** Hours a month of advice (taken when you offer, then each month). */
    hours: 10,
    maxActive: 3,
    months: 12,
    /** Product fit or quality added each month (0–1 scale). */
    boost: 0.01,
  },
  give: {
    /** Smallest gift, US dollars. */
    minUsd: 10,
    maxPledges: 50,
  },
  career: {
    /** Monthly salary as multiples of the city's cost of living. */
    salaryCol: { dfi: 5, bank: 6, sovereign: 8 } as Record<'dfi' | 'bank' | 'sovereign', number>,
    hours: 60,
    /** Players need this many stars to be hired without an exit or an investor/banker past. */
    minStars: 3,
  },
} as const;

// ---------------------------------------------------------------- causes

export interface Cause {
  id: string;
  name: string;
  /** What one unit of outcome is, and what it costs in US dollars. */
  unit: string;
  unitUsd: number;
  /** The trade-off, in plain words. */
  tradeoff: string;
}

/** Causes you can give to (configurable). */
export const CAUSES: Cause[] = [
  {
    id: 'schools',
    name: 'School fees for girls',
    unit: 'girls kept in school for a year',
    unitUsd: 150,
    tradeoff: 'Slow to show, but it changes a whole life.',
  },
  {
    id: 'clinics',
    name: 'Community health clinics',
    unit: 'health checks',
    unitUsd: 15,
    tradeoff: 'Many people helped at once; each gift is small.',
  },
  {
    id: 'water',
    name: 'Clean water points',
    unit: 'families with clean water',
    unitUsd: 60,
    tradeoff: 'A clear result you can see, in one place.',
  },
  {
    id: 'founders',
    name: 'First-time founders',
    unit: 'first-time founders trained',
    unitUsd: 400,
    tradeoff: 'Few people, but they go on to hire others.',
  },
];

const causeById = (id: string) => CAUSES.find((c) => c.id === id);

// ---------------------------------------------------------------- liquidity

/** Has this player turned shares into cash (or listed)? */
function hadLiquidity(p: Player): boolean {
  return ['founder.exit', 'investor.first-exit', 'founder.secondary', 'founder.ipo'].some(
    (k) => p.milestones[k] !== undefined,
  );
}

// ---------------------------------------------------------------- mentoring

const mentorships = (world: World) => (world.mentorships ??= {});

const activeMentorships = (world: World, mentorId: Id) =>
  Object.values(world.mentorships ?? {}).filter(
    (x) => x.mentorId === mentorId && (x.status === 'active' || x.status === 'offered'),
  );

/** Give the mentor their advisor shares (new shares: everyone is diluted a little). */
function grantAdvisorShares(c: Company, mentorId: Id, bps: number): number {
  const fd = fullyDiluted(c.capTable);
  const shares = Math.round((fd * bps) / (10_000 - bps));
  const h = c.capTable.holdings[mentorId];
  if (h) h.shares += shares;
  else c.capTable.holdings[mentorId] = { shares, kind: 'staff' };
  return shares;
}

function activate(world: World, x: Mentorship, c: Company, month: number) {
  x.status = 'active';
  const shares = grantAdvisorShares(c, x.mentorId, x.grantBps);
  const mentor = world.players[x.mentorId];
  if (mentor) {
    achieve(world, mentor, 'allocator.mentor', 'First startup mentored', month);
    notify(world, mentor.id, {
      month,
      kind: 'deal',
      text: `${c.name} took you on as a mentor: ${x.grantBps / 100}% advisor shares (${shares.toLocaleString('en')} shares). Your advice starts next month.`,
    });
  }
  return shares;
}

/** `mentor.offer`: advise a startup (yours or AI) for an advisor grant. */
export function offerMentoring(world: World, me: Player, companyId: Id, grantBps?: number) {
  const c = getCompany(world, companyId);
  const m = getMarket(world, c.market);
  const bps = grantBps ?? ALLOCATOR.mentor.defaultGrantBps;
  const [lo, hi] = ALLOCATOR.mentor.grantBps;
  ensure(bps >= lo && bps <= hi, 'mentor.grant', `Ask for between ${lo / 100}% and ${hi / 100}%.`);
  ensure(c.status === 'active', 'company.closed', 'This company is no longer operating.');
  ensure(!c.founderIds.includes(me.id), 'mentor.own', 'You can’t mentor your own company.');
  ensure(
    !activeMentorships(world, me.id).some((x) => x.companyId === c.id),
    'mentor.already',
    'You already mentor (or offered to mentor) this company.',
  );
  ensure(
    activeMentorships(world, me.id).length < ALLOCATOR.mentor.maxActive,
    'mentor.limit',
    `You can mentor ${ALLOCATOR.mentor.maxActive} startups at a time.`,
  );
  spendHours(me, ALLOCATOR.mentor.hours, 'A first mentoring session');
  const id = newId(world, 'mnt');
  const x: Mentorship = {
    id,
    mentorId: me.id,
    companyId: c.id,
    grantBps: bps,
    status: 'offered',
    month: m.month,
    months: 0,
  };
  mentorships(world)[id] = x;
  const humans = c.founderIds.filter((f) => world.players[f] && !world.players[f]!.ai);
  if (humans.length === 0) {
    // AI founders take a mentor with a record (an exit, or a good name).
    const yes = hadLiquidity(me) || me.stars.value >= 2.5 || me.role === 'investor';
    if (!yes) {
      x.status = 'declined';
      return {
        mentorshipId: id,
        status: x.status,
        reason: 'They want a mentor with a track record.',
      };
    }
    const shares = activate(world, x, c, m.month);
    return { mentorshipId: id, status: x.status, shares };
  }
  for (const f of humans)
    notify(world, f, {
      month: m.month,
      kind: 'deal',
      text: `${me.name} offers to mentor ${c.name}: monthly advice for ${bps / 100}% advisor shares. Answer in Capital.`,
    });
  return { mentorshipId: id, status: x.status };
}

function getMentorship(world: World, id: Id): Mentorship {
  const x = world.mentorships?.[id];
  if (!x) fail('mentor.missing', 'Mentoring offer not found.');
  return x;
}

/** A founder answers a mentoring offer. */
export function answerMentoring(world: World, me: Player, id: Id, accept: boolean) {
  const x = getMentorship(world, id);
  const c = getCompany(world, x.companyId);
  ensure(c.founderIds.includes(me.id), 'mentor.forbidden', 'Only a founder can answer this.');
  ensure(x.status === 'offered', 'mentor.closed', 'This offer is no longer open.');
  const m = getMarket(world, c.market);
  if (!accept) {
    x.status = 'declined';
    notify(world, x.mentorId, {
      month: m.month,
      kind: 'deal',
      text: `${c.name} said no to your mentoring offer, for now.`,
    });
    return { status: x.status };
  }
  ensure(c.status === 'active', 'company.closed', 'This company is no longer operating.');
  const shares = activate(world, x, c, m.month);
  adjustTrust(me, x.mentorId, 0.05);
  return { status: x.status, shares };
}

/** A mentor (or founder) ends the advice; the advisor shares stay granted. */
export function endMentoring(world: World, me: Player, id: Id) {
  const x = getMentorship(world, id);
  const c = world.companies[x.companyId];
  ensure(
    x.mentorId === me.id || !!c?.founderIds.includes(me.id),
    'mentor.forbidden',
    'This isn’t yours to end.',
  );
  ensure(x.status === 'active' || x.status === 'offered', 'mentor.closed', 'Already over.');
  x.status = x.status === 'offered' ? 'declined' : 'ended';
  return { status: x.status };
}

/** Month end: each active mentor's advice lifts the weaker of fit or quality a little. */
export function settleMentorships(world: World, marketId: MarketId, month: number) {
  for (const x of Object.values(world.mentorships ?? {})) {
    if (x.status !== 'active') continue;
    const c = world.companies[x.companyId];
    if (!c || c.market !== marketId) continue;
    const mentor = world.players[x.mentorId];
    if (c.status !== 'active' || !mentor) {
      x.status = 'ended';
      continue;
    }
    const metric = c.product.fit <= c.product.quality ? 'fit' : 'quality';
    c.product[metric] = clamp(c.product[metric] + ALLOCATOR.mentor.boost, 0, 1);
    x.lastBoost = metric;
    x.months += 1;
    // Advice takes the mentor's time next month too (after hours reset).
    if (!mentor.ai)
      mentor.hours.used = Math.min(
        mentor.hours.available,
        mentor.hours.used + ALLOCATOR.mentor.hours,
      );
    mentor.network += 1;
    for (const f of c.founderIds) adjustTrust(world.players[f], mentor.id, 0.01);
    if (x.months >= ALLOCATOR.mentor.months) {
      x.status = 'ended';
      notify(world, mentor.id, {
        month,
        kind: 'milestone',
        text: `A year of mentoring ${c.name} is done. Your advisor shares stay yours.`,
      });
    }
  }
}

// ---------------------------------------------------------------- philanthropy

/** The city's giving fund (a real account: gifts land there). */
function charityAccount(world: World, marketId: MarketId): Id {
  const ids = (world.charity ??= {});
  const existing = ids[marketId];
  if (existing && world.accounts[existing]) return existing;
  const m = getMarket(world, marketId);
  const id = openAccount(world, {
    currency: m.data.currency,
    market: marketId,
    label: `${m.data.name} Giving Fund`,
  });
  ids[marketId] = id;
  return id;
}

/** `give.pledge`: give `amount` (your home currency) to a cause. */
export function pledge(world: World, me: Player, causeId: string, amount: number) {
  const cause = causeById(causeId);
  ensure(cause, 'give.cause', 'Pick a cause.');
  const m = getMarket(world, me.market);
  const acc = account(world, me.accounts.local);
  const min = Math.round(ALLOCATOR.give.minUsd * 100 * m.data.unitsPerUsd);
  ensure(amount >= min, 'give.small', `Give at least ${formatMoney(min, m.data.currency)}.`);
  ensure(acc.balance >= amount, 'give.funds', 'Not enough money in your personal account.');
  const to = charityAccount(world, me.market);
  // Same currency as the giving fund? (your account is in your home city's money)
  ensure(
    account(world, to).currency === acc.currency,
    'give.currency',
    'Give from your home account.',
  );
  withTx(world, { kind: 'transfer', note: cause.name }, () =>
    transfer(world, me.accounts.local, to, amount, `Gift: ${cause.name}`, m.month, 'sent'),
  );
  const usd = valueIn(world, amount, m.data.currency, 'USD') / 100;
  const outcome = Math.floor(usd / cause.unitUsd);
  const a = (me.allocator ??= {});
  const list = (a.pledges ??= []);
  list.unshift({
    cause: cause.id,
    amount,
    currency: m.data.currency,
    month: m.month,
    market: me.market,
    outcome,
  });
  if (list.length > ALLOCATOR.give.maxPledges) list.length = ALLOCATOR.give.maxPledges;
  // A good name follows real giving (bounded: big gifts don't buy stars).
  applyStarEvent(me.stars, clamp(usd / 100_000, 0.02, 0.2));
  me.network += 1;
  achieve(world, me, 'allocator.give', 'First gift to a cause', m.month);
  notify(world, me.id, {
    month: m.month,
    kind: 'milestone',
    text: `You gave ${formatMoney(amount, m.data.currency)} to ${cause.name}: about ${outcome.toLocaleString('en')} ${cause.unit}.`,
  });
  return { outcome, unit: cause.unit };
}

// ---------------------------------------------------------------- careers

export interface CareerOrg {
  orgKind: 'dfi' | 'bank' | 'sovereign';
  orgId: Id;
  name: string;
  title: string;
  salary: number;
}

/** Institutions hiring in your home city: development partners and lenders. */
export function careerOrgs(world: World, p: Player): CareerOrg[] {
  const m = getMarket(world, p.market);
  const pay = (k: 'dfi' | 'bank' | 'sovereign') => scale(col(m), ALLOCATOR.career.salaryCol[k]);
  const dfis = (DEV_PARTNERS[m.id] ?? [])
    .filter((d) => d.kind === 'dfi' || d.kind === 'foundation')
    .map((d) => ({
      orgKind: 'dfi' as const,
      orgId: d.id,
      name: d.name,
      title: 'Investment Director',
      salary: pay('dfi'),
    }));
  const banks = Object.values(m.lenders ?? {})
    .slice(0, 3)
    .map((l) => ({
      orgKind: 'bank' as const,
      orgId: l.id,
      name: l.name,
      title: 'Head of SME Banking',
      salary: pay('bank'),
    }));
  // Investor career Phase 9: the city's sovereign fund hires a managing director.
  const sovereign = investorOn(world)
    ? (LPS[m.id] ?? [])
        .filter((l) => l.kind === 'sovereign')
        .slice(0, 1)
        .map((l) => ({
          orgKind: 'sovereign' as const,
          orgId: l.id,
          name: l.name,
          title: 'Managing Director',
          salary: pay('sovereign'),
        }))
    : [];
  return [...dfis.slice(0, 3), ...banks, ...sovereign];
}

/** Why you can't be hired yet (null: you can). */
function careerBlocker(p: Player): string | null {
  if (p.allocator?.career) return 'You already have a job at an institution.';
  if (p.job) return 'Quit your part-time job first.';
  const ok =
    hadLiquidity(p) ||
    p.role === 'investor' ||
    p.role === 'banker' ||
    p.stars.value >= ALLOCATOR.career.minStars;
  return ok
    ? null
    : `Institutions hire people with a record: an exit, or a ${ALLOCATOR.career.minStars}-star reputation.`;
}

/** `career.join`: take an executive role at a DFI or bank in your city. */
export function joinCareer(
  world: World,
  me: Player,
  orgKind: 'dfi' | 'bank' | 'sovereign',
  orgId?: Id,
) {
  const blocker = careerBlocker(me);
  if (blocker) fail('career.blocked', blocker);
  const orgs = careerOrgs(world, me).filter((o) => o.orgKind === orgKind);
  const org = orgId ? orgs.find((o) => o.orgId === orgId) : orgs[0];
  ensure(org, 'career.org', 'No such institution is hiring in your city.');
  ensure(
    hoursLeft(me) >= ALLOCATOR.career.hours,
    'hours.short',
    `The role needs ${ALLOCATOR.career.hours}h a month; you have ${Math.floor(hoursLeft(me))}h left this month.`,
  );
  const m = getMarket(world, me.market);
  me.hours.used += ALLOCATOR.career.hours;
  const role: CareerRole = {
    orgKind,
    orgId: org.orgId,
    orgName: org.name,
    title: org.title,
    market: me.market,
    salary: org.salary,
    since: m.month,
    decisions: 0,
  };
  (me.allocator ??= {}).career = role;
  achieve(world, me, `allocator.career-${orgKind}`, `Joined ${org.name}`, m.month);
  notify(world, me.id, {
    month: m.month,
    kind: 'milestone',
    text: `You joined ${org.name} as ${org.title}: ${formatMoney(org.salary, m.data.currency)} a month before tax, ${ALLOCATOR.career.hours}h of your month.`,
  });
  return { org: org.name, salary: org.salary };
}

export function leaveCareer(me: Player) {
  const role = me.allocator?.career;
  ensure(role, 'career.none', 'You don’t have an institution job.');
  me.allocator!.career = null;
  return { left: role.orgName };
}

/** A work decision each month, picked from the seed (no shared dice). */
export interface CareerDecision {
  id: string;
  text: string;
  choices: { id: 'impact' | 'safe'; label: string; effect: string }[];
}

const DECISIONS: Record<'dfi' | 'bank' | 'sovereign', CareerDecision[]> = {
  sovereign: [
    {
      id: 'swf-local',
      text: 'The mandate allows a slice for local venture funds. They are young and unproven.',
      choices: [
        {
          id: 'impact',
          label: 'Back local managers',
          effect: 'Better name and more contacts; no bonus.',
        },
        {
          id: 'safe',
          label: 'Stay in global funds',
          effect: 'A performance bonus; no reputation gain.',
        },
      ],
    },
    {
      id: 'swf-infra',
      text: 'A port upgrade needs patient capital: low returns, many jobs.',
      choices: [
        {
          id: 'impact',
          label: 'Fund the port',
          effect: 'Better name and more contacts; no bonus.',
        },
        { id: 'safe', label: 'Keep it liquid', effect: 'A performance bonus; no reputation gain.' },
      ],
    },
  ],
  dfi: [
    {
      id: 'dfi-grant',
      text: 'A young agritech asks for a grant. Strong team, no revenue yet.',
      choices: [
        { id: 'impact', label: 'Back them', effect: 'Better name and more contacts; no bonus.' },
        {
          id: 'safe',
          label: 'Wait for traction',
          effect: 'A performance bonus; no reputation gain.',
        },
      ],
    },
    {
      id: 'dfi-women',
      text: 'Your board wants a fund for women-led companies. It needs a champion.',
      choices: [
        { id: 'impact', label: 'Champion it', effect: 'Better name and more contacts; no bonus.' },
        {
          id: 'safe',
          label: 'Stick to the plan',
          effect: 'A performance bonus; no reputation gain.',
        },
      ],
    },
  ],
  bank: [
    {
      id: 'bank-sme',
      text: 'Small businesses want loans without collateral. Risky, but they create jobs.',
      choices: [
        { id: 'impact', label: 'Lend to them', effect: 'Better name and more contacts; no bonus.' },
        {
          id: 'safe',
          label: 'Ask for collateral',
          effect: 'A performance bonus; no reputation gain.',
        },
      ],
    },
    {
      id: 'bank-fees',
      text: 'Fees are up. You could cut them for the poorest customers.',
      choices: [
        { id: 'impact', label: 'Cut the fees', effect: 'Better name and more contacts; no bonus.' },
        { id: 'safe', label: 'Keep the fees', effect: 'A performance bonus; no reputation gain.' },
      ],
    },
  ],
};

function careerDecision(world: World, p: Player): CareerDecision | null {
  const role = p.allocator?.career;
  if (!role) return null;
  const month = getMarket(world, role.market).month;
  if (role.decidedMonth === month) return null;
  const list = DECISIONS[role.orgKind];
  return list[hashString(`${world.seed}:${p.id}:${month}`) % list.length]!;
}

/** `career.decide`: answer this month's work decision. */
export function decideCareer(world: World, me: Player, choiceId: 'impact' | 'safe') {
  const role = me.allocator?.career;
  ensure(role, 'career.none', 'You don’t have an institution job.');
  const d = careerDecision(world, me);
  ensure(d, 'career.decided', 'You already decided this month.');
  const m = getMarket(world, role.market);
  role.decidedMonth = m.month;
  role.decisions = (role.decisions ?? 0) + 1;
  if (choiceId === 'impact') {
    applyStarEvent(me.stars, 0.05);
    me.network += 2;
    return { choice: choiceId, bonus: 0 };
  }
  const bonus = Math.round(role.salary * 0.25);
  withTx(world, { kind: 'salary' }, () =>
    transfer(world, m.ext.payroll, me.accounts.local, bonus, `Bonus: ${role.orgName}`, m.month),
  );
  return { choice: choiceId, bonus };
}

/** Month end: institution salaries (income tax withheld), and the role's hours. */
export function settleCareers(world: World, marketId: MarketId, month: number) {
  for (const p of Object.values(world.players)) {
    const role = p.allocator?.career;
    if (!role || role.market !== marketId || p.ai) continue;
    if (p.market !== role.market) {
      // Moved away: the job stays behind.
      p.allocator!.career = null;
      continue;
    }
    const m = getMarket(world, marketId);
    const tax = Math.round(role.salary * m.data.tax.personalIncome);
    withTx(world, { kind: 'salary' }, () => {
      transfer(
        world,
        m.ext.payroll,
        p.accounts.local,
        role.salary,
        `Salary: ${role.orgName}`,
        month,
      );
      transfer(world, p.accounts.local, m.ext.tax, tax, `Income tax: ${role.orgName}`, month);
    });
    p.hours.used = Math.min(p.hours.available, p.hours.used + ALLOCATOR.career.hours);
  }
}

// ---------------------------------------------------------------- serial founder

/** Can this player start again as a serial founder? */
export function serialEligible(world: World, p: Player): boolean {
  if (hadLiquidity(p) || p.failures > 0) return true;
  return p.companyIds.some((id) => {
    const c = world.companies[id];
    return !!c && c.status !== 'active';
  });
}

/**
 * After `company.found` made the company: what a serial founder carries in.
 * Lessons (a little skill), reputation (company stars), and contacts who hear.
 */
export function carrySerialFounder(world: World, me: Player, c: Company) {
  const m = getMarket(world, c.market);
  for (const k of ['product', 'fundraising', 'leadership'] as const)
    me.skills[k] = Math.min(100, me.skills[k] + 5);
  applyStarEvent(c.stars, clamp((me.stars.value - 2) * 0.15, 0, 0.4));
  const told = new Set<Id>();
  for (const contact of me.contacts ?? []) {
    if (contact.kind !== 'player' || !contact.refId || told.has(contact.refId)) continue;
    told.add(contact.refId);
    notify(world, contact.refId, {
      month: m.month,
      kind: 'pitch',
      text: `${me.name}, a founder you know, just started ${c.name}.`,
      ref: { kind: 'company', id: c.id },
    });
  }
  (me.allocator ??= {}).serial = m.month;
  achieve(world, me, 'founder.serial', 'Started again as a serial founder', m.month);
  return { contactsTold: told.size };
}

// ---------------------------------------------------------------- the hub view

export function allocatorView(world: World, p: Player) {
  const m = getMarket(world, p.market);
  const a = p.allocator ?? {};
  const pledges = a.pledges ?? [];
  const byCause = CAUSES.map((c) => {
    const mine = pledges.filter((x) => x.cause === c.id);
    return {
      ...c,
      given: mine.reduce((s, x) => s + valueIn(world, x.amount, x.currency, m.data.currency), 0),
      outcome: mine.reduce((s, x) => s + x.outcome, 0),
    };
  });
  const charity = world.charity?.[p.market];
  return {
    currency: m.data.currency,
    liquidity: hadLiquidity(p),
    causes: byCause,
    pledges: pledges.slice(0, 10),
    cityGiving: charity ? (world.accounts[charity]?.balance ?? 0) : 0,
    minGift: Math.round(ALLOCATOR.give.minUsd * 100 * m.data.unitsPerUsd),
    mentor: {
      grantBps: ALLOCATOR.mentor.grantBps,
      defaultGrantBps: ALLOCATOR.mentor.defaultGrantBps,
      hours: ALLOCATOR.mentor.hours,
      months: ALLOCATOR.mentor.months,
      maxActive: ALLOCATOR.mentor.maxActive,
      mine: Object.values(world.mentorships ?? {})
        .filter((x) => x.mentorId === p.id)
        .map((x) => ({ ...x, companyName: world.companies[x.companyId]?.name ?? '' })),
      /** Offers to mentor your companies, waiting for your answer. */
      offers: Object.values(world.mentorships ?? {})
        .filter((x) => x.status === 'offered' && p.companyIds.includes(x.companyId))
        .map((x) => ({
          ...x,
          companyName: world.companies[x.companyId]?.name ?? '',
          mentorName: world.players[x.mentorId]?.name ?? '',
        })),
      /** Startups in your city you could mentor. */
      candidates: Object.values(world.companies)
        .filter(
          (c) => c.market === p.market && c.status === 'active' && !c.founderIds.includes(p.id),
        )
        .slice(0, 12)
        .map((c) => ({
          companyId: c.id,
          name: c.name,
          industry: c.industry,
          ai: c.founderIds.every((f) => world.players[f]?.ai !== false),
          fit: Math.round(c.product.fit * 100),
          quality: Math.round(c.product.quality * 100),
        })),
    },
    career: {
      role: a.career ?? null,
      blocker: careerBlocker(p),
      orgs: careerOrgs(world, p),
      hours: ALLOCATOR.career.hours,
      taxRate: m.data.tax.personalIncome,
      decision: careerDecision(world, p),
    },
    serial: {
      eligible: serialEligible(world, p),
      startedMonth: a.serial ?? null,
      canStart: p.companyIds.filter((id) => world.companies[id]?.status === 'active').length < 2,
    },
  };
}
