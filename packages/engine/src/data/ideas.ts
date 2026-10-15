/**
 * Starting ideas (Founder Journey 6; blueprint §3 "Coffee shop", §6.1,
 * FR-004). A contact at the café describes a problem; the new founder picks
 * one of these. Each idea is a set of configurable attributes, never a sure
 * winner: high demand comes with competition, cheap ideas with rivals.
 *
 * Attributes are 0–1. `fitSkills` are the founder skills that help: the
 * founder's fit is read from them when the company is founded and stored on
 * the company (so it never shifts as skills grow).
 *
 * Gameplay: a company founded with an idea (`company.found` with `ideaId`)
 * gets a small, bounded edge or handicap on every sales win chance
 * (sales.ts winChance): more demand helps, more competition hurts, a good
 * founder fit helps. Companies founded without one are unchanged.
 */
import type { Industry } from './industries.js';
import type { Skill, Skills } from './characters.js';
import type { RevenueModel } from '../types.js';

export interface IdeaAttributes {
  /** Potential customer interest and urgency. */
  demand: number;
  /** Number and strength of alternatives. */
  competition: number;
  /** Time, skills and cost to build a viable product. */
  buildDifficulty: number;
  /** Cash needed before revenue. */
  capitalIntensity: number;
}

export interface StarterIdea {
  id: string;
  /** Short name of the idea. */
  title: string;
  /** What the contact at the café says: the problem, in their words. */
  problem: string;
  /** The one-line idea stored on the company (5–120 characters). */
  pitch: string;
  industry: Industry;
  revenueModel: RevenueModel;
  attributes: IdeaAttributes;
  /** Founder skills that make this idea easier. */
  fitSkills: Skill[];
}

export const STARTER_IDEAS: readonly StarterIdea[] = [
  {
    id: 'market-pay',
    title: 'Card payments for market traders',
    problem:
      'The traders next door lose sales every day: buyers have no cash on them, and the traders can’t take cards.',
    pitch: 'Cheap card and phone payments for market traders',
    industry: 'fintech',
    revenueModel: 'transaction',
    attributes: { demand: 0.8, competition: 0.7, buildDifficulty: 0.6, capitalIntensity: 0.6 },
    fitSkills: ['finance', 'product'],
  },
  {
    id: 'shop-stock',
    title: 'Stock app for small shops',
    problem:
      'I still count my stock in a notebook. Every week I run out of what sells best and keep what doesn’t.',
    pitch: 'A simple stock and reorder app for small shops',
    industry: 'saas',
    revenueModel: 'subscription',
    attributes: { demand: 0.6, competition: 0.35, buildDifficulty: 0.4, capitalIntensity: 0.3 },
    fitSkills: ['product', 'sales'],
  },
  {
    id: 'last-mile',
    title: 'Reliable same-day delivery',
    problem:
      'Our deliveries across town arrive late, and nobody can tell the customer where the parcel is.',
    pitch: 'Same-day delivery with live tracking for local shops',
    industry: 'logistics',
    revenueModel: 'services',
    attributes: { demand: 0.75, competition: 0.5, buildDifficulty: 0.5, capitalIntensity: 0.8 },
    fitSkills: ['leadership', 'hiring'],
  },
  {
    id: 'tutor-match',
    title: 'Trusted tutors near you',
    problem:
      'Parents keep asking me for a good tutor. They don’t know whom to trust, and good tutors can’t find pupils.',
    pitch: 'A marketplace of checked, rated tutors for families',
    industry: 'edtech',
    revenueModel: 'marketplace',
    attributes: { demand: 0.55, competition: 0.4, buildDifficulty: 0.3, capitalIntensity: 0.25 },
    fitSkills: ['sales', 'publicSpeaking'],
  },
];

export const ideaById = (id: string | undefined): StarterIdea | undefined =>
  STARTER_IDEAS.find((i) => i.id === id);

/** How these numbers move a sales win chance (see ideaEdge). */
export const IDEA_EFFECT = {
  demand: 0.1,
  competition: 0.1,
  fit: 0.08,
  /** Skill level that counts as no fit at all, and the span to a full fit. */
  fitFloor: 10,
  fitSpan: 50,
} as const;

/** Founder fit 0–1 from the skills the idea needs (skills are 0–100). */
export function founderFit(idea: StarterIdea, skills: Partial<Skills>): number {
  const levels = idea.fitSkills.map((s) => skills[s] ?? 20);
  const avg = levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length);
  const fit = (avg - IDEA_EFFECT.fitFloor) / IDEA_EFFECT.fitSpan;
  return Math.round(Math.min(1, Math.max(0, fit)) * 100) / 100;
}

/**
 * The bounded shift an idea gives a sales win chance: about ±0.1 at the
 * extremes. Zero for a middling idea and a middling fit.
 */
export function ideaEdge(idea: StarterIdea, fit: number): number {
  const a = idea.attributes;
  return (
    IDEA_EFFECT.demand * (a.demand - 0.5) -
    IDEA_EFFECT.competition * (a.competition - 0.5) +
    IDEA_EFFECT.fit * (fit - 0.5)
  );
}

/**
 * First-session expenses (blueprint §3: "pay a small expense"): small
 * business costs paid from the company account, as a share of the city's
 * monthly cost of living.
 */
export const STARTER_EXPENSES = {
  cards: { label: 'Business cards', costCol: 0.01 },
  domain: { label: 'A website domain', costCol: 0.006 },
  coffee: { label: 'Coffee for a customer meeting', costCol: 0.004 },
} as const;
export type StarterExpense = keyof typeof STARTER_EXPENSES;
export const STARTER_EXPENSE_IDS = Object.keys(STARTER_EXPENSES) as [
  StarterExpense,
  ...StarterExpense[],
];
