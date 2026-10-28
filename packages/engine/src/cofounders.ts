/**
 * Round 7: the jobs a company's people do (team.ts), as small lookups the
 * sales pipeline, the product and fundraising read without depending on the
 * team module. All of it applies only in gameplay-note worlds (releases.ts):
 * callers check `gameplayOn` first.
 */
import { SEGMENT_TEMPLATES, type Industry } from './data/industries.js';
import { gameplayOn } from './releases.js';
import { deriveRng } from './rng.js';
import { outputOf } from './staff.js';
import type { Company, Staff, World } from './types.js';

export const TEAM = {
  /** A technical co-founder lifts a demo's score by this much at full skill. */
  ctoDemo: 0.12,
  /** …and the team's build output by this share. */
  ctoBuild: 0.3,
  /** Engineers ship roadmap work this much faster than before the note. */
  engineerBuild: 0.2,
  /** A deal's salesperson lifts its chance by this much at full skill. */
  ownerChance: 0.08,
  /** A business co-founder's contacts make new leads this much warmer (trust), at full skill. */
  warmTrust: 0.12,
  /** …and add this much to an investor's score of a pitch, plus a warm intro. */
  pitchScore: 0.05,
  pitchIntro: 0.03,
  /** Leads a salesperson brings each month: one, two from this skill on. */
  leadsSkill: 0.65,
  /** Discovery meetings a salesperson runs a month on their own deals. */
  discoveryPerMonth: 2,
  /** Monthly skill growth on the job, as a share of what's left to learn. */
  skillGrowth: 0.02,
} as const;

/** The technical co-founder (an AI CTO), if the company has one. */
export const ctoOf = (c: Company): Staff | undefined =>
  c.staff.find((s) => s.cofounder?.profile === 'cto');

/** The business co-founder (an AI CEO-operator or growth co-founder), if any. */
export const businessCofounderOf = (c: Company): Staff | undefined =>
  c.staff.find((s) => s.cofounder && s.cofounder.profile !== 'cto');

/** The salesperson who owns a deal, while they still work here. */
export const ownerOf = (c: Company, ownerId: string | undefined): Staff | undefined =>
  ownerId ? c.staff.find((s) => s.id === ownerId) : undefined;

/**
 * The customer segment a person knows from their last job: half the time one
 * of the hiring company's own industry's (candidates apply where they fit),
 * otherwise any. Pure: the same person always knows the same sector.
 */
export function expertiseOf(world: World, personId: string, industry: Industry): string {
  const rng = deriveRng(world.seed, 'expertise', personId);
  const own = SEGMENT_TEMPLATES.filter((s) => s.industry === industry);
  const pool = rng.chance(0.5) && own.length ? own : SEGMENT_TEMPLATES;
  return rng.pick(pool).key;
}

/**
 * The team's build output this month: engineers, product people at 0.6, the
 * founder's own building. Gameplay note: engineers ship faster, and a
 * technical co-founder lifts the whole team by their skill.
 */
export function buildOutput(world: World | undefined, c: Company, founderBuild: number): number {
  const on = !!world && gameplayOn(world);
  const eng = outputOf(c, ['engineer']) * (on ? 1 + TEAM.engineerBuild : 1);
  const total = eng + outputOf(c, ['product']) * 0.6 + founderBuild;
  if (!on) return total;
  const cto = ctoOf(c);
  return total * (1 + (cto ? TEAM.ctoBuild * cto.skill : 0));
}
