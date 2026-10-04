/**
 * AI staff (§5): live talent pools with real salary bands, offer negotiation,
 * morale, management load, departures and layoffs.
 */
import { AI_FIRST_NAMES, AI_LAST_NAMES } from './data/fiction.js';
import { STAFF_ROLES } from './data/markets.js';
import type { MarketId, Seniority, StaffRole } from './data/markets.js';
import { grantOptions, returnOptions } from './captable.js';
import { ensure } from './errors.js';
import { getMarket, notify } from './helpers.js';
import { newId } from './ids.js';
import { clamp, clamp01 } from './math.js';
import { major } from './money.js';
import type { Rng } from './rng.js';
import { applyStarEvent, starMultiplier } from './stars.js';
import type { Candidate, Company, Personality, Player, Staff, World } from './types.js';

export const TALENT_POOL_SIZE = 36;
const PERSONALITIES: Personality[] = ['steady', 'ambitious', 'anxious', 'maverick'];

export const SENIORITY_OUTPUT: Record<Seniority, number> = {
  junior: 0.7,
  mid: 1,
  senior: 1.4,
  head: 1.6,
};

export function bandSalary(
  world: World,
  market: MarketId,
  role: StaffRole,
  seniority: Seniority,
): number {
  const s = getMarket(world, market).data.salaries;
  return major(seniority === 'head' ? s.head : s[role][seniority]);
}

function makeCandidate(world: World, market: MarketId, rng: Rng, month: number): Candidate {
  const r = rng.next();
  const seniority: Seniority = r < 0.45 ? 'junior' : r < 0.8 ? 'mid' : r < 0.96 ? 'senior' : 'head';
  const role = rng.pick(STAFF_ROLES);
  const skillBase = { junior: 0.35, mid: 0.55, senior: 0.72, head: 0.82 }[seniority];
  return {
    id: newId(world, 'cand'),
    name: `${rng.pick(AI_FIRST_NAMES[market])} ${rng.pick(AI_LAST_NAMES[market])}`,
    role,
    seniority,
    skill: clamp01(skillBase + rng.normal(0, 0.07)),
    ask: Math.round(
      bandSalary(world, market, role, seniority) * clamp(rng.normal(1, 0.1), 0.75, 1.35),
    ),
    equityPreference: rng.next(),
    riskAppetite: rng.next(),
    personality: rng.pick(PERSONALITIES),
    competingOffers: rng.int(0, 2),
    expiresMonth: month + rng.int(1, 3),
    rejectedBy: [],
  };
}

/** Expire stale candidates and top the pool back up. Called at genesis and each settlement. */
export function refreshTalent(world: World, market: MarketId, rng: Rng) {
  const m = getMarket(world, market);
  m.talent = m.talent.filter((c) => c.expiresMonth >= m.month);
  while (m.talent.length < TALENT_POOL_SIZE)
    m.talent.push(makeCandidate(world, market, rng, m.month));
}

export type OfferResponse =
  | { outcome: 'accept'; reason: string }
  | { outcome: 'counter'; reason: string; salary: number }
  | { outcome: 'decline'; reason: string };

/**
 * A candidate weighs pay, equity, company momentum and the founder.
 * Outcomes depend on stars, funding and momentum, recent coverage and negotiation skill (§5).
 */
export function evaluateOffer(
  world: World,
  company: Company,
  founder: Player,
  cand: Candidate,
  offer: { salary: number; equityBps: number },
  runwayMonths: number,
): OfferResponse {
  const valuation = Math.max(
    company.capTable.lastPostMoney,
    major(getMarket(world, company.market).data.costOfLiving) * 200,
  );
  // Equity value spread over a 4-year vest, discounted heavily for risk.
  const equityMonthly = ((offer.equityBps / 10_000) * valuation) / 48 / 4;
  const pay = offer.salary / cand.ask;
  const equity = (equityMonthly / cand.ask) * (0.5 + cand.equityPreference);
  const momentum =
    0.08 * (starMultiplier(company.stars.value) - 1) +
    0.06 * (starMultiplier(founder.stars.value) - 1) +
    (runwayMonths >= 12 ? 0.05 : runwayMonths < 4 ? -0.1 : 0) +
    (company.stars.good > 0.1 ? 0.03 : 0) +
    founder.skills.negotiation / 1000;
  const early = company.lastRound === null || company.lastRound === 'pre-seed';
  const riskPenalty = early ? (1 - cand.riskAppetite) * 0.15 : 0;
  const repeat = cand.rejectedBy.filter((id) => id === company.id).length * 0.04;
  const needed = 1 + cand.competingOffers * 0.05 + riskPenalty + repeat;
  const value = pay + equity + momentum;

  if (offer.salary < cand.ask * 0.6)
    return { outcome: 'decline', reason: 'That’s far below what I earn now.' };
  if (value >= needed) return { outcome: 'accept', reason: 'Excited to join. See you Monday.' };
  if (value >= needed - 0.15 && cand.rejectedBy.filter((id) => id === company.id).length < 2) {
    const gap = needed - value;
    const salary = Math.round((offer.salary + gap * cand.ask) / 1000) * 1000;
    const reason =
      cand.competingOffers > 0
        ? 'I have another offer. Match this and I’m in.'
        : riskPenalty > 0.08
          ? 'Early-stage is a risk for me. I need more cash.'
          : 'Close. A bit more salary and we have a deal.';
    return { outcome: 'counter', reason, salary };
  }
  return {
    outcome: 'decline',
    reason:
      riskPenalty > 0.1
        ? 'I want more security than an early-stage company can offer.'
        : 'We’re too far apart. Good luck.',
  };
}

export function hire(
  world: World,
  company: Company,
  cand: Candidate,
  salary: number,
  equityBps: number,
  month: number,
): Staff {
  const m = getMarket(world, company.market);
  const staff: Staff = {
    id: newId(world, 'st'),
    name: cand.name,
    role: cand.role,
    seniority: cand.seniority,
    salary,
    equityBps,
    morale: 70,
    skill: cand.skill,
    personality: cand.personality,
    hiredMonth: month,
  };
  company.staff.push(staff);
  if (equityBps > 0) grantOptions(company.capTable, staff.id, equityBps);
  m.talent = m.talent.filter((c) => c.id !== cand.id);
  return staff;
}

/** People a company can manage without morale and mistakes suffering. */
export const managementCapacity = (c: Company): number =>
  5 * Math.max(c.founderIds.length, c.aiCeo ? 1 : 0) +
  c.staff.reduce((a, s) => a + (s.seniority === 'head' ? 7 : s.seniority === 'senior' ? 2 : 0), 0);

export const isOverloaded = (c: Company): boolean => c.staff.length > managementCapacity(c);

export const staffOutput = (s: Staff): number =>
  s.skill * SENIORITY_OUTPUT[s.seniority] * (0.5 + s.morale / 200);

export function outputOf(c: Company, roles: StaffRole[]): number {
  const base = c.staff
    .filter((s) => roles.includes(s.role))
    .reduce((a, s) => a + staffOutput(s), 0);
  // A good business-software supplier makes the team more productive (§6).
  return base * c.supply.outputMult;
}

/** Monthly morale drift, raise requests and departures. Returns departures. */
export function settleStaff(
  world: World,
  c: Company,
  rng: Rng,
  month: number,
  runwayMonths: number,
  unpaid: boolean,
): Staff[] {
  const overloaded = isOverloaded(c);
  const departures: Staff[] = [];
  for (const s of c.staff) {
    const band = bandSalary(world, c.market, s.role, s.seniority);
    let target =
      62 +
      40 * (s.salary / band - 1) +
      8 * (c.stars.value - 2.5) +
      (runwayMonths < 3 ? -15 : 0) +
      (overloaded ? -15 : 0) +
      (unpaid ? -45 : 0);
    if (s.personality === 'anxious' && runwayMonths < 6) target -= 10;
    if (s.personality === 'ambitious' && c.stars.value > 3) target += 8;
    if (s.personality === 'steady') target += 5;
    s.morale = clamp(s.morale + (target - s.morale) * 0.3 + c.supply.moraleAdd, 0, 100);
    s.skill = clamp(s.skill + c.supply.skillAdd, 0, 1);

    const leaveP = s.morale < 20 ? 0.35 : s.morale < 35 ? 0.15 : s.morale < 50 ? 0.03 : 0.005;
    if (rng.chance(leaveP)) {
      departures.push(s);
      continue;
    }
    if (s.personality === 'ambitious' && s.morale < 60 && s.salary < band && rng.chance(0.25)) {
      for (const fid of c.founderIds) {
        notify(world, fid, {
          month,
          kind: 'staff',
          text: `${s.name} (${s.role}) asks for a raise to the market rate.`,
          ref: { kind: 'company', id: c.id },
        });
      }
    }
  }
  for (const s of departures) {
    removeStaff(c, s.id);
    const key = s.seniority === 'senior' || s.seniority === 'head';
    if (key) c.keyPersonLossMonth = month;
    for (const fid of c.founderIds) {
      notify(world, fid, {
        month,
        kind: 'warning',
        text: key
          ? `Key person ${s.name} (${s.seniority} ${s.role}) quit. Investors will notice.`
          : `${s.name} (${s.role}) quit.`,
      });
    }
  }
  if (overloaded) c.product.techDebt = clamp01(c.product.techDebt + 0.02);
  return departures;
}

export function removeStaff(c: Company, staffId: string) {
  c.staff = c.staff.filter((s) => s.id !== staffId);
  returnOptions(c.capTable, staffId);
}

/** Layoffs (§5): handled badly, they damage stars and morale for a long time. */
export function layoff(c: Company, staffId: string, generous: boolean, founder: Player) {
  const s = c.staff.find((x) => x.id === staffId);
  ensure(s, 'staff.missing', 'Staff member not found.');
  removeStaff(c, staffId);
  for (const other of c.staff) other.morale = clamp(other.morale - (generous ? 8 : 22), 0, 100);
  if (!generous) {
    applyStarEvent(c.stars, -0.15);
    applyStarEvent(founder.stars, -0.1);
  }
  return s;
}
