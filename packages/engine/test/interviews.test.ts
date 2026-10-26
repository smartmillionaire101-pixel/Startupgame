/**
 * Interviews by level (FEEDBACK_NOTE, work.ts + data/interviews.ts): a
 * question bank per profession and level (more questions and a case in
 * steps higher up, a higher pass mark), the interview brief and its capped
 * study bonus, the review after a turn-down (score against the pass mark,
 * best answers and why, the hard checks, what to re-read, the one-month
 * cooldown), on-the-job tasks by level, and worlds without the note
 * interviewing exactly as before.
 */
import { describe, expect, it } from 'vitest';
import {
  INTERVIEW_SETS,
  PASS_MARKS,
  bestAnswers,
  bestOf,
  interviewSetOf,
  stepsOf,
  worstAnswers,
} from '../src/data/interviews.js';
import { jobTaskById, jobTasksOf } from '../src/data/job-tasks.js';
import { PROFESSIONS, type ProfessionId } from '../src/data/professions.js';
import { businessesOf, isOpen } from '../src/economy.js';
import { FEEDBACK_NOTE, JOBS_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import { WORK } from '../src/work.js';
import type { Player, World } from '../src/types.js';
import { makeWorld, run, settle, tryRun } from './helpers.js';

const F = 'u_founder';
/** The most answers `job.interview` takes (commands.ts). */
const MAX_ANSWERS = 5;
const me = (w: World): Player => w.players[F]!;

/** A founder of this background in Lagos, in a world with this release note. */
function founder(backgroundId: string, note: string = FEEDBACK_NOTE) {
  const w = run(makeWorld(42, ['lagos']), null, {
    type: 'system.announce',
    id: note,
    text: 'Notes.',
  }).world;
  return run(w, F, {
    type: 'player.create',
    handle: 'h_levels',
    name: 'Lev Els',
    role: 'founder',
    backgroundId,
    market: 'lagos',
    company: {
      name: 'Levels Co',
      industry: 'fintech',
      revenueModel: 'subscription',
      idea: 'Payments for market traders',
      incorporation: 'local',
    },
  }).world;
}

const employer = (w: World, prof: ProfessionId) =>
  Object.values(businessesOf(w.markets.lagos!)).find(
    (b) => b.landmark === `employer-${prof}` && isOpen(b),
  )!;

function apply(w: World, prof: ProfessionId, level: number) {
  const r = run(w, F, { type: 'job.apply', businessId: employer(w, prof).id, level });
  return { w: r.world, id: r.result.application.id as string };
}

const appView = (w: World, id: string) =>
  playerView(w, F)!.work!.applications.find((a) => a.id === id)!;

function interview(w: World, id: string, answers: number[]) {
  const r = run(w, F, { type: 'job.interview', applicationId: id, answers });
  return { w: r.world, r: r.result as { hired: boolean; reason: string } };
}

describe('interviews by level: the bank', () => {
  it('every profession has a set for every rung, with more to answer higher up', () => {
    for (const p of PROFESSIONS) {
      const counts = p.levels.map((l) => {
        const set = interviewSetOf(p.id, l.level);
        expect(set, `${p.id} ${l.level}`).toBeDefined();
        return stepsOf(set!).length;
      });
      expect(counts[0], p.id).toBe(3);
      expect(counts[1], p.id).toBe(4);
      // The top of every ladder (and level 3) asks a case in steps.
      for (const l of p.levels.slice(2)) {
        const set = interviewSetOf(p.id, l.level)!;
        const cases = set.items.filter((i) => i.kind === 'case');
        expect(cases.length, `${p.id} ${l.level}`).toBe(1);
        expect(cases[0]!.steps.length).toBeGreaterThanOrEqual(2);
        expect(cases[0]!.setup!.length).toBeGreaterThan(40);
      }
      const top = interviewSetOf(p.id, p.levels.length)!;
      expect(top.items.find((i) => i.kind === 'case')!.steps).toHaveLength(3);
      for (let i = 1; i < counts.length; i++)
        expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
      for (const n of counts) expect(n).toBeLessThanOrEqual(MAX_ANSWERS);
    }
  });

  it('the pass mark rises with the level', () => {
    expect([...PASS_MARKS]).toEqual([0.42, 0.48, 0.52, 0.56]);
    for (const p of PROFESSIONS) {
      const marks = p.levels.map((l) => interviewSetOf(p.id, l.level)!.passMark);
      for (let i = 1; i < marks.length; i++) expect(marks[i]!).toBeGreaterThan(marks[i - 1]!);
    }
  });

  it('each step has one best answer (weight 1), a why for every option, and French', () => {
    const ids = new Set<string>();
    const slots = new Set<number>();
    for (const set of INTERVIEW_SETS) {
      const concepts = new Set(set.concepts.map((c) => c.id));
      expect(set.concepts.length, `${set.profession} ${set.level}`).toBeGreaterThanOrEqual(3);
      for (const c of set.concepts) {
        for (const s of [c.title, c.body, c.example, c.fr.title, c.fr.body, c.fr.example])
          expect(s.length, c.id).toBeGreaterThan(3);
        expect(c.fr.body).not.toBe(c.body);
      }
      for (const step of stepsOf(set)) {
        expect(ids.has(step.id), step.id).toBe(false);
        ids.add(step.id);
        expect(concepts.has(step.concept), step.id).toBe(true);
        expect(step.options.length).toBeGreaterThanOrEqual(3);
        expect(
          step.options.filter((o) => o.weight === 1),
          step.id,
        ).toHaveLength(1);
        expect(step.fr.text).not.toBe(step.text);
        slots.add(bestOf(step));
        for (const o of step.options) {
          expect(o.weight).toBeGreaterThanOrEqual(0);
          expect(o.weight).toBeLessThanOrEqual(1);
          expect(o.why.length, step.id).toBeGreaterThan(5);
          expect(o.fr.text.length, step.id).toBeGreaterThan(0);
          expect(o.fr.why.length, step.id).toBeGreaterThan(5);
        }
      }
    }
    // The best answer isn't always in the same place.
    expect([...slots].sort()).toEqual([0, 1, 2]);
  });

  it('an Analyst and a Director at the same bank are asked different things', () => {
    const analyst = stepsOf(interviewSetOf('bank', 1)!).map((s) => s.id);
    const director = stepsOf(interviewSetOf('bank', 4)!).map((s) => s.id);
    expect(analyst.some((id) => director.includes(id))).toBe(false);
    expect(director).toHaveLength(5);
    expect(interviewSetOf('bank', 4)!.items.at(-1)!.title).toBe('The Ferry Credit case');
  });
});

describe('interviews by level: in the game', () => {
  it('a booked interview shows its level’s questions and the brief', () => {
    let { w, id } = apply(founder('f-dropout'), 'bank', 4);
    const v = appView(w, id);
    expect(v.level).not.toBeNull();
    expect(v.level!.passMark).toBe(56);
    expect(v.level!.levels).toEqual(['Analyst', 'Associate', 'Vice President', 'Director']);
    expect(v.level!.items.map((i) => i.kind)).toEqual(['question', 'question', 'case']);
    expect(v.level!.items[2]!.steps).toHaveLength(3);
    expect(v.questions).toHaveLength(5);
    // The brief: its concepts with worked examples, and the hard checks against you.
    expect(v.level!.concepts.map((c) => c.title)).toContain('Single-borrower limit');
    expect(v.level!.checks).toMatchObject({ monthsNeed: 84, monthsHave: 0, skillBar: true });
    // No weights or whys before the interview.
    expect(JSON.stringify(v.level!.items)).not.toMatch(/"(weight|why)":/);
    // The Analyst set is a different one.
    ({ w, id } = apply(w, 'investment', 1));
    expect(appView(w, id).level!.items.every((i) => i.kind === 'question')).toBe(true);
    expect(appView(w, id).level!.passMark).toBe(42);
  });

  it('wrong answer counts are refused', () => {
    const { w, id } = apply(founder('f-dropout'), 'bank', 4);
    expect(tryRun(w, F, { type: 'job.interview', applicationId: id, answers: [0, 0, 0] }).ok).toBe(
      false,
    );
  });

  it('studying the brief takes hours, is recorded, and its bonus is capped', () => {
    const { w: w0, id } = apply(founder('f-dropout'), 'bank', 1);
    const hours = me(w0).hours.used;
    let w = run(w0, F, { type: 'job.study', applicationId: id }).world;
    expect(me(w).hours.used).toBe(hours + WORK.studyHours);
    expect(me(w).work!.study).toEqual({ 'bank:1': 1 });
    w = run(w, F, { type: 'job.study', applicationId: id }).world;
    expect(appView(w, id).level).toMatchObject({ studied: 2, bonus: 6 });
    // The cap: a third study is refused (and costs nothing).
    const again = tryRun(w, F, { type: 'job.study', applicationId: id });
    expect(again.ok).toBe(false);
    // The same interview, studied or not: exactly the bonus apart.
    const answers = bestAnswers('bank', 1);
    const plain = interview(w0, id, answers).w;
    const studied = interview(w, id, answers).w;
    const s0 = me(plain).work!.applications[0]!.score!;
    const s1 = me(studied).work!.applications[0]!.score!;
    expect(Math.round((s1 - s0) * 100)).toBe(2 * WORK.studyBonus * 100);
    expect(me(studied).work!.applications[0]!.review).toMatchObject({ studied: 2, bonus: 6 });
  });

  it('an Analyst who answers well is hired, against the entry pass mark', () => {
    const { w, id } = apply(founder('f-dropout'), 'bank', 1);
    const { w: after, r } = interview(w, id, bestAnswers('bank', 1));
    expect(r.hired).toBe(true);
    const a = me(after).work!.applications[0]!;
    expect(a.review).toMatchObject({ passMark: 42, checks: [], study: [] });
    expect(a.review!.score).toBeGreaterThanOrEqual(42);
    expect(me(after).job).toMatchObject({ profession: 'bank', level: 1 });
  });

  it('the weakest answers fail an Analyst interview on the score, with the weakest question', () => {
    const { w, id } = apply(founder('f-dropout'), 'bank', 1);
    const { w: after, r } = interview(w, id, worstAnswers('bank', 1));
    expect(r.hired).toBe(false);
    const a = me(after).work!.applications[0]!;
    expect(a.why).toMatchObject({ code: 'interview', need: 42 });
    expect(a.review!.score).toBeLessThan(42);
  });

  it('a failed Director interview says why: the checks, each answer against the best, what to study', () => {
    const { w, id } = apply(founder('f-dropout'), 'bank', 4);
    const worst = worstAnswers('bank', 4);
    const { w: after, r } = interview(w, id, worst);
    expect(r.hired).toBe(false);
    const a = me(after).work!.applications[0]!;
    expect(a.status).toBe('rejected');
    // The hard checks still decide first: 84 months in finance.
    expect(a.why).toMatchObject({ code: 'months', need: 84, have: 0 });
    expect(a.review!.passMark).toBe(56);
    expect(a.review!.checks[0]).toMatchObject({ code: 'months' });
    expect(a.review!.steps.every((s) => s.choice !== s.best)).toBe(true);
    expect(a.review!.study).toEqual(['b4-capital', 'b4-stress', 'b4-el', 'b4-limit', 'b4-memo']);
    // The view spells it out: your answer, the best one and why, the concepts to re-read.
    const v = appView(after, id).level!;
    expect(v.review!.steps).toHaveLength(5);
    const limit = v.review!.steps.find((s) => s.id === 'bank4-ferry-2')!;
    expect(limit).toMatchObject({
      right: false,
      case: 'The Ferry Credit case',
      choice: '2bn: under the 3.6bn limit, fine',
      best: '4.4bn: over the 3.6bn limit by 0.8bn',
    });
    expect(limit.why).toContain('3.6bn');
    expect(limit.fr.best).toContain('4,4 Md');
    expect(v.review!.study.map((s) => s.title)).toContain('Single-borrower limit');
    expect(v.review!.checks[0]!.reason).toBe('Needs 84 months in finance — you have 0.');
    // You can study again straight away, but re-apply only after the one-month cooldown.
    expect(tryRun(after, F, { type: 'job.study', applicationId: id }).ok).toBe(true);
    const b = employer(after, 'bank').id;
    expect(me(after).work!.cooldown![b]).toBe(after.markets.lagos!.month + WORK.cooldownMonths);
    expect(tryRun(after, F, { type: 'job.apply', businessId: b, level: 4 }).ok).toBe(false);
    const next = settle(after, 'lagos', 1);
    expect(tryRun(next, F, { type: 'job.apply', businessId: b, level: 4 }).ok).toBe(true);
  });

  it('a qualified Associate passes on good answers and fails on poor ones', () => {
    // An ex-banker founder: 30 months in finance, the bank's level 2 needs 24.
    const { w, id } = apply(founder('f-banker'), 'bank', 2);
    const good = interview(w, id, bestAnswers('bank', 2));
    expect(good.r.hired).toBe(true);
    const poor = interview(w, id, worstAnswers('bank', 2));
    expect(poor.r.hired).toBe(false);
    expect(me(poor.w).work!.applications[0]!.why).toMatchObject({ code: 'interview', need: 48 });
  });
});

describe('interviews by level: on-the-job tasks', () => {
  it('every task has a level, and senior roles have harder tasks to draw', () => {
    for (const p of PROFESSIONS) {
      const xs = jobTasksOf(p.id);
      for (const l of [1, 2, 3])
        expect(xs.filter((x) => x.level === l).length, p.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('an Analyst never draws senior tasks; a Director never draws entry ones', () => {
    const booked = apply(founder('f-dropout'), 'bank', 1);
    let w = interview(booked.w, booked.id, bestAnswers('bank', 1)).w;
    const levels = () => me(w).work!.tasks!.ids.map((x) => jobTaskById(x)!.level);
    expect(levels().every((l) => l <= 2)).toBe(true);
    // The same player as a Director (set directly): next month's draw is skilled and senior work.
    w = structuredClone(w);
    me(w).job!.level = 4;
    w = settle(w, 'lagos', 1);
    expect(levels().every((l) => l >= 2)).toBe(true);
    expect(levels().filter((l) => l === 3).length).toBeGreaterThanOrEqual(3);
  });
});

describe('interviews by level: worlds without the feedback note', () => {
  it('interview exactly as before: the three questions, the single bar, no brief, no study', () => {
    const { w, id } = apply(founder('f-dropout', JOBS_NOTE), 'bank', 4);
    const v = appView(w, id);
    expect(v.level).toBeNull();
    expect(v.questions.map((q) => q.id)).toEqual(['bank-loan', 'bank-fee', 'bank-model']);
    expect(tryRun(w, F, { type: 'job.study', applicationId: id }).ok).toBe(false);
    const r = interview(w, id, [1, 2, 0]);
    expect(r.r.hired).toBe(false);
    const a = me(r.w).work!.applications[0]!;
    expect(a.review).toBeUndefined();
    expect(a.why).toMatchObject({ code: 'months' });
    expect(me(r.w).work!.study).toBeUndefined();
    // The old bar for an Analyst who answers badly.
    const b = apply(founder('f-dropout', JOBS_NOTE), 'bank', 1);
    const bad = interview(b.w, b.id, [2, 0, 2]);
    expect(me(bad.w).work!.applications[0]!.why).toMatchObject({ code: 'interview', need: 48 });
  });
});
