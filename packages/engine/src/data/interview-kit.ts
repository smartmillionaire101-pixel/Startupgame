/**
 * The shapes of the interview bank by level (data/interviews.ts) and the
 * short builders its content files are written with. English is the game's
 * text; French rides along on each entry (like the on-the-job tasks), and
 * proper names and numbers stay the same in both.
 */
import type { Skill } from './characters.js';
import type { ProfessionId } from './professions.js';

export interface LevelOption {
  text: string;
  /** The skill this answer leans on (how well you'd carry it out). */
  skill: Skill;
  /** How good an answer it is (0–1): the best one is 1. */
  weight: number;
  /** Why it is (or isn't) the call, one line. */
  why: string;
  fr: { text: string; why: string };
}

/** One answer to give: a single question, or one step of a case. */
export interface LevelStep {
  id: string;
  /** The brief concept it tests (what to re-read when you get it wrong). */
  concept: string;
  text: string;
  options: LevelOption[];
  fr: { text: string };
}

/** A question (one step) or a multi-step case with its setup. */
export interface LevelItem {
  id: string;
  kind: 'question' | 'case';
  /** Cases: the name of the case and the facts every step works from. */
  title?: string;
  setup?: string;
  fr?: { title: string; setup: string };
  steps: LevelStep[];
}

/** A key concept in the interview brief, with a short worked example (never the questions). */
export interface BriefConcept {
  id: string;
  title: string;
  body: string;
  example: string;
  fr: { title: string; body: string; example: string };
}

export interface InterviewSet {
  profession: ProfessionId;
  level: number;
  /** The score (0–1) to reach. */
  passMark: number;
  concepts: BriefConcept[];
  items: LevelItem[];
}

/** An option: [text, skill, weight, why, French text, French why]. */
export type O = [string, Skill, number, string, string, string];

const opt = ([text, skill, weight, why, frText, frWhy]: O): LevelOption => ({
  text,
  skill,
  weight,
  why,
  fr: { text: frText, why: frWhy },
});

/** A case step. */
export const S = (
  id: string,
  concept: string,
  text: string,
  fr: string,
  options: O[],
): LevelStep => ({
  id,
  concept,
  text,
  options: options.map(opt),
  fr: { text: fr },
});

/** A single question. */
export const Q = (
  id: string,
  concept: string,
  text: string,
  fr: string,
  options: O[],
): LevelItem => ({ id, kind: 'question', steps: [S(id, concept, text, fr, options)] });

/** A case: its name and facts, then the steps. */
export const CASE = (
  id: string,
  title: string,
  frTitle: string,
  setup: string,
  frSetup: string,
  steps: LevelStep[],
): LevelItem => ({ id, kind: 'case', title, setup, fr: { title: frTitle, setup: frSetup }, steps });

/** A brief concept. */
export const K = (
  id: string,
  title: string,
  frTitle: string,
  body: string,
  frBody: string,
  example: string,
  frExample: string,
): BriefConcept => ({
  id,
  title,
  body,
  example,
  fr: { title: frTitle, body: frBody, example: frExample },
});

/** The score to reach, by level (index 0 = level 1): higher roles set a higher bar. */
export const PASS_MARKS = [0.42, 0.48, 0.52, 0.56] as const;

export const SET = (
  profession: ProfessionId,
  level: number,
  concepts: BriefConcept[],
  items: LevelItem[],
): InterviewSet => ({
  profession,
  level,
  passMark: PASS_MARKS[level - 1] ?? PASS_MARKS[PASS_MARKS.length - 1]!,
  concepts,
  items,
});
