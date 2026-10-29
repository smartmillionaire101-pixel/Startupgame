/**
 * The hiring pipeline and AI co-founders (blueprint §2.1 chapter 2, §6.4, FR-007).
 *
 * Recruitment flow: open a role (a job post, paid through the ledger) →
 * source 2–4 candidates for it → read their CV → interview them (technical,
 * culture, or a paid work trial) to learn their true skill and fit → make an
 * offer with the existing `company.offer` → hire or walk away. Sourced
 * candidates have other offers too: wait past their deadline and they're gone.
 *
 * An AI co-founder is the other way to stop working alone: one of three
 * profiles (CTO, CEO-operator, growth) joins for founder shares with a
 * four-year vesting record and a token salary.
 *
 * Optional state: `Company.hiring` exists only once a founder uses these
 * commands, and staff get `fit`/`workload` only through it, so a company that
 * never touches them settles exactly as before. Ids are numbered per company,
 * dice come from streams derived for this purpose alone, and money moves only
 * through the ledger.
 */
import { AI_FIRST_NAMES, AI_LAST_NAMES } from './data/fiction.js';
import type { Seniority, StaffRole } from './data/markets.js';
import { fullyDiluted } from './captable.js';
import { ensure, fail } from './errors.js';
import { col, getMarket, notify, spendHours, totalCustomers } from './helpers.js';
import { transfer } from './ledger.js';
import { clamp, clamp01 } from './math.js';
import { newId } from './ids.js';
import { scale } from './money.js';
import { deriveRng } from './rng.js';
import { workable } from './roadmap.js';
import { gameplayOn } from './releases.js';
import { bringsOf } from './team.js';
import { expertiseOf } from './cofounders.js';
import { bandSalary, isOverloaded, SENIORITY_OUTPUT } from './staff.js';
import type {
  AiCofounderProfileId,
  AiCofounderRecord,
  CandidateValues,
  Company,
  Hiring,
  HireRole,
  Id,
  InterviewStyle,
  Personality,
  PipelineCandidate,
  Player,
  SalaryBand,
  Staff,
  WorkStyle,
  World,
} from './types.js';

export const HIRING = {
  /** A job post costs this share of a month's cost of living. */
  postingCol: 0.1,
  maxOpenRoles: 4,
  /** Times you can source candidates for one role. */
  maxSources: 3,
  sourceHours: 2,
  interviewHours: { technical: 3, culture: 2, work_trial: 6 } as Record<InterviewStyle, number>,
  /** A work trial pays the candidate this many weeks of their asking salary. */
  trialWeeks: 1,
  /** Chance per competing offer, per month, that a candidate takes another job early. */
  withdrawPerOffer: 0.12,
  /** Candidates remembered per company (oldest closed ones forgotten first). */
  maxCandidates: 16,
  band: {
    lean: { ask: 0.85, skill: -0.06 },
    market: { ask: 1, skill: 0 },
    generous: { ask: 1.15, skill: 0.06 },
  } as Record<SalaryBand, { ask: number; skill: number }>,
} as const;

const PERSONALITIES: Personality[] = ['steady', 'ambitious', 'anxious', 'maverick'];
const VALUES: CandidateValues[] = ['mission', 'money', 'craft', 'stability'];
const STYLES: WorkStyle[] = ['independent', 'collaborative', 'structured', 'fast'];

function ensureHiring(c: Company): Hiring {
  return (c.hiring ??= { roles: [], candidates: [], nextId: 1 });
}

const postingCost = (world: World, c: Company): number =>
  scale(col(getMarket(world, c.market)), HIRING.postingCol);

/** A work trial's fee: a week of the candidate's asking salary. */
export const trialFee = (cand: { ask: number }): number =>
  Math.round(((cand.ask / 4.33) * HIRING.trialWeeks) / 100) * 100;

// ---------------------------------------------------------------- roles

export function openRole(
  world: World,
  c: Company,
  args: { role: StaffRole; seniority?: Seniority; salaryBand?: SalaryBand },
  month: number,
) {
  ensure(!c.hibernation, 'hire.hibernating', 'You can’t hire while the company hibernates.');
  const h = ensureHiring(c);
  ensure(
    h.roles.filter((r) => r.status === 'open').length < HIRING.maxOpenRoles,
    'hire.roles',
    'You have enough open roles. Fill or close one first.',
  );
  const cost = postingCost(world, c);
  const m = getMarket(world, c.market);
  transfer(world, c.account, m.ext.suppliers, cost, `Job post: ${args.role}`, month);
  const role: HireRole = {
    id: `hr${h.nextId++}` as Id,
    role: args.role,
    seniority: args.seniority ?? null,
    band: args.salaryBand ?? 'market',
    openedMonth: month,
    status: 'open',
    sourced: 0,
    postingCost: cost,
  };
  h.roles.push(role);
  return { message: 'Job posted. Now find candidates for it.', roleId: role.id, cost };
}

function roleOf(c: Company, roleId: string): HireRole {
  const r = c.hiring?.roles.find((x) => x.id === roleId);
  ensure(r, 'hire.role', 'That role isn’t open.');
  return r;
}

export function closeRole(c: Company, roleId: string) {
  const r = roleOf(c, roleId);
  ensure(r.status === 'open', 'hire.closed', 'That role is already closed.');
  r.status = 'closed';
  for (const cand of c.hiring!.candidates)
    if (cand.roleId === r.id && cand.status === 'open') cand.status = 'withdrawn';
  return { message: 'Role closed.' };
}

/** Bring 2–4 candidates tailored to the role (own dice stream per role and round). */
export function sourceCandidates(
  world: World,
  c: Company,
  me: Player,
  roleId: string,
  month: number,
) {
  const r = roleOf(c, roleId);
  ensure(r.status === 'open', 'hire.closed', 'That role is closed.');
  ensure(
    r.sourced < HIRING.maxSources,
    'hire.sourced',
    'You’ve met everyone looking for this role.',
  );
  spendHours(me, HIRING.sourceHours, 'Reading CVs');
  const h = c.hiring!;
  const rng = deriveRng(world.seed, 'hiring.source', c.id, r.id, r.sourced);
  r.sourced += 1;
  const band = HIRING.band[r.band];
  const n = rng.int(2, 4);
  const made: PipelineCandidate[] = [];
  for (let k = 0; k < n; k++) {
    const x = rng.next();
    const seniority: Seniority =
      r.seniority ?? (x < 0.4 ? 'junior' : x < 0.8 ? 'mid' : x < 0.96 ? 'senior' : 'head');
    const base = { junior: 0.35, mid: 0.55, senior: 0.72, head: 0.82 }[seniority];
    const skill = clamp01(base + band.skill + rng.normal(0, 0.09));
    // CVs flatter: some a little, some a lot.
    const cvSkill = clamp01(skill + rng.normal(0.05, 0.1));
    const ask = Math.round(
      bandSalary(world, c.market, r.role, seniority) *
        band.ask *
        clamp(rng.normal(1, 0.08), 0.8, 1.25),
    );
    const deadline = month + rng.int(1, 2);
    const cand: PipelineCandidate = {
      id: `hc${h.nextId++}` as Id,
      name: `${rng.pick(AI_FIRST_NAMES[c.market])} ${rng.pick(AI_LAST_NAMES[c.market])}`,
      role: r.role,
      seniority,
      skill,
      ask,
      equityPreference: rng.next(),
      riskAppetite: rng.next(),
      personality: rng.pick(PERSONALITIES),
      competingOffers: rng.int(0, 2),
      expiresMonth: deadline,
      rejectedBy: [],
      roleId: r.id,
      cvSkill,
      fit: rng.next(),
      values: rng.pick(VALUES),
      workStyle: rng.pick(STYLES),
      sourcedMonth: month,
      deadline,
      interviews: [],
      status: 'open',
    };
    h.candidates.push(cand);
    made.push(cand);
  }
  prune(h);
  me.skills.hiring = Math.min(100, me.skills.hiring + 0.3);
  return { message: `${n} candidates applied.`, candidateIds: made.map((x) => x.id) };
}

function prune(h: Hiring) {
  while (h.candidates.length > HIRING.maxCandidates) {
    const i = h.candidates.findIndex((x) => x.status !== 'open');
    if (i < 0) break;
    h.candidates.splice(i, 1);
  }
}

export function pipelineCandidate(c: Company, candidateId: string): PipelineCandidate | undefined {
  return c.hiring?.candidates.find((x) => x.id === candidateId && x.status === 'open');
}

// ---------------------------------------------------------------- interviews

const revealsSkill = (cand: PipelineCandidate) =>
  cand.interviews.includes('technical') || cand.interviews.includes('work_trial');
const revealsFit = (cand: PipelineCandidate) =>
  cand.interviews.includes('culture') || cand.interviews.includes('work_trial');

export function interview(
  world: World,
  c: Company,
  me: Player,
  candidateId: string,
  style: InterviewStyle,
  month: number,
) {
  const cand = pipelineCandidate(c, candidateId);
  ensure(cand, 'hire.candidate', 'That candidate is no longer available.');
  ensure(
    !cand.interviews.includes(style),
    'hire.interviewed',
    'You’ve already done that interview.',
  );
  spendHours(me, HIRING.interviewHours[style], 'An interview');
  let fee = 0;
  if (style === 'work_trial') {
    fee = trialFee(cand);
    const m = getMarket(world, c.market);
    transfer(world, c.account, m.ext.payroll, fee, `Work trial: ${cand.name}`, month);
  }
  cand.interviews.push(style);
  // A good conversation or a week together makes them keener to join you.
  if ((style === 'culture' && cand.fit >= 0.6) || (style === 'work_trial' && cand.fit >= 0.4))
    cand.referredFor = c.id;
  me.skills.hiring = Math.min(100, me.skills.hiring + 0.5);
  const parts: string[] = [];
  if (style !== 'culture') parts.push(`true skill ${Math.round(cand.skill * 100)}`);
  if (style !== 'technical') parts.push(`${fitWord(cand.fit)} fit`);
  return {
    message: `Interview done: ${parts.join(', ')}.`,
    fee,
    skill: revealsSkill(cand) ? cand.skill : null,
    fit: revealsFit(cand) ? cand.fit : null,
  };
}

const fitWord = (fit: number) => (fit >= 0.7 ? 'great' : fit >= 0.4 ? 'decent' : 'poor');

/** A pipeline candidate accepted an offer: close the loop on the role and the new hire. */
export function onPipelineHire(world: World, c: Company, cand: PipelineCandidate, s: Staff) {
  cand.status = 'hired';
  const r = c.hiring!.roles.find((x) => x.id === cand.roleId);
  if (r && r.status === 'open') {
    r.status = 'filled';
    for (const other of c.hiring!.candidates)
      if (other.roleId === r.id && other.status === 'open') other.status = 'withdrawn';
  }
  s.fit = cand.fit;
  s.morale = Math.round(55 + 30 * cand.fit);
  trackWorkload(world, c);
}

export function onPipelineDecline(cand: PipelineCandidate, companyId: Id) {
  if (cand.rejectedBy.filter((x) => x === companyId).length >= 2) cand.status = 'declined';
}

// ---------------------------------------------------------------- workload

/** Each person's workload, % of a full load (100 = full, over 120 = stretched). */
export function workloadOf(c: Company): Record<Id, number> {
  const customers = totalCustomers(c);
  const projects = workable(c).length;
  const n = c.staff.length;
  const demand: Record<StaffRole, number> = {
    engineer: 0.8 + 0.3 * projects + c.product.techDebt,
    product: 0.6 + 0.3 * projects,
    support: 0.2 + customers / 150,
    sales: 0.6 + customers / 400,
    marketing: 0.5 + customers / 600 + (c.marketingBudget > 0 ? 0.3 : 0),
    operations: 0.3 + n / 8 + customers / 1000,
    finance: 0.3 + n / 12,
  };
  const cap: Partial<Record<StaffRole, number>> = {};
  for (const s of c.staff) cap[s.role] = (cap[s.role] ?? 0) + SENIORITY_OUTPUT[s.seniority];
  const extra = isOverloaded(c) ? 15 : 0;
  const out: Record<Id, number> = {};
  for (const s of c.staff) {
    const load = demand[s.role] / Math.max(0.1, cap[s.role] ?? 1);
    out[s.id] = clamp(Math.round(85 * load) + extra, 15, 200);
  }
  return out;
}

function trackWorkload(_world: World, c: Company) {
  const w = workloadOf(c);
  for (const s of c.staff) s.workload = w[s.id] ?? 85;
}

export type RetentionRisk = 'low' | 'medium' | 'high';
function retentionRisk(s: Staff, workload: number): RetentionRisk {
  if (s.cofounder) return s.morale < 20 ? 'high' : 'low';
  if (s.morale < 35 || workload > 140) return 'high';
  if (s.morale < 50 || workload > 115) return 'medium';
  return 'low';
}

/** Roles the team is missing, in the order they start to hurt. */
export function coverageGaps(c: Company): StaffRole[] {
  const has = (r: StaffRole) => c.staff.some((s) => s.role === r);
  const n = c.staff.length;
  const gaps: StaffRole[] = [];
  if (!has('engineer')) gaps.push('engineer');
  if (!has('product')) gaps.push('product');
  if (!has('sales') && !has('marketing')) gaps.push('sales');
  if (totalCustomers(c) >= 50 && !has('support')) gaps.push('support');
  if (n >= 6 && !has('operations')) gaps.push('operations');
  if (n >= 8 && !has('finance')) gaps.push('finance');
  return gaps;
}

// ---------------------------------------------------------------- settlement

/**
 * Month end, before staff morale: candidates with other offers may take them,
 * and anyone past their deadline is gone. Workload is tracked from now on.
 * Does nothing for a company that never used the pipeline.
 */
export function settleHiring(world: World, c: Company, month: number) {
  const h = c.hiring;
  if (!h || c.ai) return;
  for (const cand of h.candidates) {
    if (cand.status !== 'open') continue;
    const rng = deriveRng(world.seed, 'hiring.withdraw', c.id, cand.id, month);
    const late = month > cand.deadline;
    const early =
      !late &&
      month > cand.sourcedMonth &&
      rng.chance(HIRING.withdrawPerOffer * cand.competingOffers);
    if (!late && !early) continue;
    cand.status = 'withdrawn';
    for (const fid of c.founderIds)
      notify(world, fid, {
        month,
        kind: 'staff',
        text: `${cand.name} took another job. Move faster next time.`,
        ref: { kind: 'company', id: c.id },
      });
  }
  prune(h);
  trackWorkload(world, c);
}

// ---------------------------------------------------------------- AI co-founders

interface ProfileDef {
  id: AiCofounderProfileId;
  title: AiCofounderRecord['title'];
  role: StaffRole;
  /** Salary as a share of a head's market pay. */
  pay: number;
  pitch: string;
}

export const AI_COFOUNDER_PROFILES: ProfileDef[] = [
  {
    id: 'cto',
    title: 'CTO',
    role: 'engineer',
    pay: 0.2,
    pitch: 'Builds the product with you and leads the engineers.',
  },
  {
    id: 'operator',
    title: 'CEO',
    role: 'operations',
    pay: 0.25,
    pitch: 'Runs the day to day so you can manage a bigger team.',
  },
  {
    id: 'growth',
    title: 'Growth',
    role: 'marketing',
    pay: 0.15,
    pitch: 'Finds customers and grows revenue.',
  },
];

export interface AiCofounderOffer {
  id: AiCofounderProfileId;
  title: AiCofounderRecord['title'];
  name: string;
  role: StaffRole;
  skill: number;
  equityBps: number;
  salary: number;
  personality: Personality;
  pitch: string;
  vestingMonths: number;
  cliffMonths: number;
}

/** The three AI co-founders who'd join this company (fixed per company). */
export function aiCofounderOffers(world: World, c: Company): AiCofounderOffer[] {
  const rng = deriveRng(world.seed, 'cofounder.ai', c.id);
  return AI_COFOUNDER_PROFILES.map((p) => ({
    id: p.id,
    title: p.title,
    name: `${rng.pick(AI_FIRST_NAMES[c.market])} ${rng.pick(AI_LAST_NAMES[c.market])}`,
    role: p.role,
    skill: Math.round((0.74 + rng.next() * 0.18) * 100) / 100,
    equityBps: rng.int(15, 35) * 100,
    salary: Math.round((bandSalary(world, c.market, p.role, 'head') * p.pay) / 1000) * 1000,
    personality: rng.pick(PERSONALITIES),
    pitch: p.pitch,
    vestingMonths: 48,
    cliffMonths: 12,
  }));
}

const aiCofounderOf = (c: Company): Staff | undefined => c.staff.find((s) => s.cofounder);

/**
 * An AI co-founder joins: new founder shares so they own exactly their ask
 * (everyone else dilutes pro rata), a vesting record and a token salary.
 */
export function hireAiCofounder(
  world: World,
  c: Company,
  me: Player,
  profileId: AiCofounderProfileId | undefined,
  month: number,
) {
  ensure(!c.hibernation, 'hire.hibernating', 'You can’t hire while the company hibernates.');
  ensure(!aiCofounderOf(c), 'cofounder.ai.taken', 'You already have an AI co-founder.');
  const offers = aiCofounderOffers(world, c);
  const o = profileId ? offers.find((x) => x.id === profileId) : offers[0];
  if (!o) fail('cofounder.ai.profile', 'Pick one of the co-founders on offer.');
  spendHours(me, 4, 'Agreeing co-founder terms');
  const fd = fullyDiluted(c.capTable);
  const shares = Math.round((fd * o.equityBps) / (10_000 - o.equityBps));
  const staff: Staff = {
    id: newId(world, 'st'),
    name: o.name,
    role: o.role,
    seniority: 'head',
    salary: o.salary,
    equityBps: o.equityBps,
    morale: 80,
    skill: o.skill,
    personality: o.personality,
    hiredMonth: month,
    fit: 0.8,
    cofounder: {
      profile: o.id,
      title: o.title,
      equityBps: o.equityBps,
      vestingMonths: o.vestingMonths,
      cliffMonths: o.cliffMonths,
      since: month,
    },
  };
  // Round 7: the sector they know, as their card showed it.
  if (gameplayOn(world))
    staff.expertise = expertiseOf(world, `cofounder:${c.id}:${o.id}`, c.industry);
  c.staff.push(staff);
  c.capTable.holdings[staff.id] = { shares, kind: 'founder' };
  ensureHiring(c);
  trackWorkload(world, c);
  return {
    message: `${o.name} joins as your ${o.title} co-founder.`,
    staffId: staff.id,
    equityBps: o.equityBps,
  };
}

/** Months of an AI co-founder's shares vested so far (0 before the cliff). */
function vestedMonths(rec: AiCofounderRecord, month: number): number {
  const served = month - rec.since;
  return served < rec.cliffMonths ? 0 : Math.min(rec.vestingMonths, served);
}

// ---------------------------------------------------------------- views

export function teamView(world: World, c: Company) {
  const load = workloadOf(c);
  return {
    people: c.staff.map((s) => {
      const workload = s.workload ?? load[s.id] ?? 85;
      return {
        staffId: s.id,
        workload,
        risk: retentionRisk(s, workload),
        fit: s.fit ?? null,
        cofounder: s.cofounder
          ? {
              ...s.cofounder,
              vested: vestedMonths(s.cofounder, getMarket(world, c.market).month),
            }
          : null,
      };
    }),
    gaps: coverageGaps(c),
  };
}

export function hiringView(world: World, c: Company) {
  const h = c.hiring;
  const month = getMarket(world, c.market).month;
  const cof = aiCofounderOf(c);
  return {
    started: !!h,
    postingCost: postingCost(world, c),
    maxOpenRoles: HIRING.maxOpenRoles,
    maxSources: HIRING.maxSources,
    sourceHours: HIRING.sourceHours,
    interviewHours: HIRING.interviewHours,
    roles: (h?.roles ?? [])
      .filter((r) => r.status === 'open' || month - r.openedMonth <= 1)
      .map((r) => ({
        ...r,
        open: h!.candidates.filter((x) => x.roleId === r.id && x.status === 'open').length,
      })),
    candidates: (h?.candidates ?? [])
      .filter((x) => x.status === 'open')
      .map((x) => ({
        id: x.id,
        roleId: x.roleId,
        name: x.name,
        role: x.role,
        seniority: x.seniority,
        ask: x.ask,
        cvSkill: x.cvSkill,
        values: x.values,
        workStyle: x.workStyle,
        riskAppetite: x.riskAppetite,
        equityPreference: x.equityPreference,
        competingOffers: x.competingOffers,
        deadline: x.deadline,
        monthsLeft: Math.max(0, x.deadline - month),
        interviews: x.interviews,
        skill: revealsSkill(x) ? x.skill : null,
        fit: revealsFit(x) ? x.fit : null,
        personality: revealsFit(x) ? x.personality : null,
        keen: x.referredFor === c.id,
        trialFee: trialFee(x),
        /** Round 7 (gameplay note): what they'd bring, at the skill their CV claims until checked. */
        brings: gameplayOn(world)
          ? bringsOf(world, c, { ...x, skill: revealsSkill(x) ? x.skill : x.cvSkill })
          : null,
      })),
    aiCofounder: {
      hired: cof ? { staffId: cof.id, name: cof.name, title: cof.cofounder!.title } : null,
      offers: cof
        ? []
        : aiCofounderOffers(world, c).map((o) => ({
            ...o,
            /** Round 7 (gameplay note): what this co-founder would bring. */
            brings: gameplayOn(world)
              ? bringsOf(world, c, {
                  id: `cofounder:${c.id}:${o.id}`,
                  role: o.role,
                  seniority: 'head',
                  skill: o.skill,
                  cofounder: o.id,
                })
              : null,
          })),
    },
  };
}
