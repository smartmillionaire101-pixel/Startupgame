/**
 * Round 7 (gameplay note): a business co-founder's investor introductions.
 *
 * Each month end a business co-founder (an AI CEO-operator or growth
 * co-founder) introduces the company to AI funds in its city that fit its
 * next round's stage and its sector: one a month, more as they get better
 * (cofounders.ts TEAM.intro). An intro is a warm lead in the founder's
 * investor list ("Introduced by Sidi") for a few months. Pitching that fund
 * uses it: the fund's star bar drops (more pitches get the meeting), its
 * first-meeting score rises, and in the pitch meeting his interest starts
 * higher ("Introduced by Sidi: +11").
 *
 * Determinism: who is introduced comes from `deriveRng(seed, 'intro',
 * company, co-founder, month)` over the funds sorted by id. No money moves.
 */
import { TEAM, businessCofounderOf } from './cofounders.js';
import { getMarket, nextStage, notify } from './helpers.js';
import { gameplayOn } from './releases.js';
import { deriveRng } from './rng.js';
import type { Company, Fund, Id, InvestorIntro, Staff, World } from './types.js';

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Introductions a co-founder makes a month, by skill. */
export const introsPerMonth = (skill: number): number =>
  1 + (skill >= TEAM.intro.twoSkill ? 1 : 0) + (skill >= TEAM.intro.threeSkill ? 1 : 0);

/** An intro's strength (0.5–1) from the co-founder's skill. */
export const introStrength = (skill: number): number => round2(0.5 + 0.5 * skill);

/** Does a fund back this company's next round in its sector? */
export const fundFits = (c: Company, f: Fund): boolean =>
  (f.sectors === 'any' || f.sectors.includes(c.industry)) &&
  f.stages.includes(nextStage(c.lastRound));

const openPitchStatuses = new Set(['questions', 'partner-meeting', 'sent', 'meeting']);

/**
 * The intro that counts for a pitch to this fund: a warm one not yet used
 * (before the pitch), or the one the pitch used. None before the gameplay note.
 */
export function introFor(
  world: World,
  c: Company,
  fundId: Id,
  pitchId?: Id,
): InvestorIntro | undefined {
  if (!gameplayOn(world)) return undefined;
  const month = getMarket(world, c.market).month;
  return (c.investorIntros ?? []).find(
    (x) =>
      x.fundId === fundId &&
      (pitchId !== undefined && x.pitchId === pitchId
        ? true
        : x.pitchId === undefined && x.until >= month),
  );
}

/** A pitch to this fund uses its warm intro, if there is one. */
export function useIntro(world: World, c: Company, fundId: Id, pitchId: Id) {
  const x = introFor(world, c, fundId);
  if (x) x.pitchId = pitchId;
}

/**
 * Month end: the business co-founder introduces new investors. Returns the
 * funds introduced (for the recap's "Your team this month").
 */
export function settleIntros(world: World, c: Company, month: number): Fund[] {
  if (!gameplayOn(world) || c.ai) return [];
  const list = (c.investorIntros ??= []);
  // Cold intros fall away; used ones stay with their pitch for a year.
  c.investorIntros = list.filter((x) =>
    x.pitchId !== undefined ? month - x.month <= 12 : x.until >= month,
  );
  const biz = businessCofounderOf(c);
  if (!biz) return [];
  const waiting = c.investorIntros.filter((x) => x.pitchId === undefined);
  const room = TEAM.intro.open - waiting.length;
  if (room <= 0) return [];
  const pitches = Object.values(world.pitches).filter((p) => p.companyId === c.id && p.fundId);
  const busy = new Set(
    pitches
      .filter(
        (p) => openPitchStatuses.has(p.status) || (p.status === 'passed' && month - p.month < 3),
      )
      .map((p) => p.fundId!),
  );
  const known = new Set(waiting.map((x) => x.fundId));
  const pool = Object.values(world.funds)
    .filter((f) => f.ai && f.market === c.market && fundFits(c, f))
    .filter((f) => !busy.has(f.id) && !known.has(f.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const rng = deriveRng(world.seed, 'intro', c.id, biz.id, month);
  const made = rng.shuffle(pool).slice(0, Math.min(room, introsPerMonth(biz.skill)));
  for (const f of made)
    c.investorIntros.push({
      fundId: f.id,
      by: biz.id,
      byName: biz.name,
      month,
      until: month + TEAM.intro.months,
      strength: introStrength(biz.skill),
    });
  if (made.length) notifyIntros(world, c, biz, made, month);
  return made;
}

function notifyIntros(world: World, c: Company, biz: Staff, made: Fund[], month: number) {
  const text =
    made.length === 1
      ? `${biz.name} introduced you to ${made[0]!.partner} at ${made[0]!.name}: a warm lead in your investor list.`
      : `${biz.name} introduced you to ${made.length} investors who fit your round: ${made.map((f) => f.name).join(', ')}. They’re warm leads in your investor list.`;
  for (const id of c.founderIds)
    notify(world, id, { month, kind: 'pitch', text, ref: { kind: 'company', id: c.id } });
}

/** For the founder's view: the warm intros, and the ones that went into a pitch. */
export function introsView(world: World, c: Company) {
  if (!gameplayOn(world)) return null;
  const month = getMarket(world, c.market).month;
  return (c.investorIntros ?? [])
    .filter((x) => x.pitchId !== undefined || x.until >= month)
    .map((x) => ({
      fundId: x.fundId,
      by: x.by,
      byName: x.byName,
      month: x.month,
      monthsLeft: x.pitchId === undefined ? x.until - month : null,
      pitchId: x.pitchId ?? null,
      /** Points it adds to his interest at the start of a pitch meeting. */
      interest: introInterest(x),
    }));
}

/** Points an intro adds to his starting interest in a pitch meeting. */
export const introInterest = (x: InvestorIntro): number =>
  Math.round(TEAM.intro.interest * x.strength);
