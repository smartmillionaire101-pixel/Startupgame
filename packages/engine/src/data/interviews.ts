/**
 * The interview bank by level (FEEDBACK_NOTE; player feedback: "the
 * interviews are the same questions for banker analysts and directors").
 *
 * Every profession has a set per rung of its ladder: level 1 asks three
 * single questions, level 2 four, level 3 three and a case in two steps,
 * the top level two and a case in three steps. Each option has a weight
 * (the best answer is 1) and a one-line why; each set has a pass mark that
 * rises with the level, and an interview brief: the key concepts it tests,
 * each with a short worked example (never the questions themselves).
 *
 * The answers to an interview are given in order, one per step (a case's
 * steps one after another). Worlds without the note keep the profession's
 * three questions (data/professions.ts).
 */
import { ADVICE_SETS } from './interviews-advice.js';
import { BUILD_SETS } from './interviews-build.js';
import { FINANCE_SETS } from './interviews-finance.js';
import type { InterviewSet, LevelOption, LevelStep } from './interview-kit.js';

export type {
  BriefConcept,
  InterviewSet,
  LevelItem,
  LevelOption,
  LevelStep,
} from './interview-kit.js';
export { PASS_MARKS } from './interview-kit.js';

export const INTERVIEW_SETS: readonly InterviewSet[] = [
  ...FINANCE_SETS,
  ...BUILD_SETS,
  ...ADVICE_SETS,
];

const BY_KEY = new Map(INTERVIEW_SETS.map((s) => [`${s.profession}:${s.level}`, s]));

/** The set a profession asks at a level (undefined: no such rung). */
export const interviewSetOf = (profession: string, level: number): InterviewSet | undefined =>
  BY_KEY.get(`${profession}:${level}`);

/** Every step of a set, in the order the answers are given. */
export const stepsOf = (set: InterviewSet): LevelStep[] => set.items.flatMap((i) => i.steps);

/** The index of a step's best option. */
export const bestOf = (step: LevelStep): number =>
  step.options.reduce((b, o, i, xs) => (o.weight > xs[b]!.weight ? i : b), 0);

/** The best answer to every step (tests and the e2e specs use it). */
export const bestAnswers = (profession: string, level: number): number[] => {
  const set = interviewSetOf(profession, level);
  return set ? stepsOf(set).map(bestOf) : [];
};

/** The weakest answer to every step. */
export const worstAnswers = (profession: string, level: number): number[] => {
  const set = interviewSetOf(profession, level);
  return set
    ? stepsOf(set).map((s) =>
        s.options.reduce(
          (w: number, o: LevelOption, i, xs) => (o.weight < xs[w]!.weight ? i : w),
          0,
        ),
      )
    : [];
};
