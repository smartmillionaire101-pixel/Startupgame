/**
 * Customer interviews (interviews.ts; player feedback, round two: "When I
 * click interview customers I don't really interview"). Three rounds of
 * questions with in-character answers, a 0–100 score and a gain in customer
 * understanding scaled by it. Feedback-note worlds only.
 */
import { describe, expect, it } from 'vitest';
import { INTERVIEW, interviewsView, meet } from '../src/interviews.js';
import { QUESTION_SCORE, SEGMENT_INTERVIEWS } from '../src/data/interviews.js';
import { SEGMENT_TEMPLATES } from '../src/data/industries.js';
import { founderGuide } from '../src/founderguide.js';
import { FEEDBACK_NOTE } from '../src/releases.js';
import type { World } from '../src/types.js';
import {
  addFounder,
  companyOf,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  tryRun,
} from './helpers.js';

const F = 'u_founder';
const SEG = 'fintech.traders';
const announce = (w: World) =>
  run(w, null, { type: 'system.announce', id: FEEDBACK_NOTE, text: 'Feedback.' }).world;
const world = () => announce(addFounder(makeWorld()));
const cid = (w: World) => companyOf(w, F).id;
const start = (w: World, seg = SEG) =>
  run(w, F, { type: 'company.interview', companyId: cid(w), action: 'start', segmentKey: seg });
const ask = (w: World, questionId: string) =>
  run(w, F, { type: 'company.interview', companyId: cid(w), action: 'ask', questionId });
const kindOf = (id: string) => id.split('.')[1] as keyof typeof QUESTION_SCORE;
const active = (w: World) => companyOf(w, F).interviews!.active!;

/** Run a whole interview, picking each round's question by kind preference. */
function interview(w: World, pick: (ids: string[], round: number) => string) {
  w = start(w).world;
  let last: ReturnType<typeof ask> | null = null;
  for (let r = 0; r < INTERVIEW.rounds; r++) {
    last = ask(w, pick(active(w).offers[r]!, r));
    w = last.world;
  }
  return { w, result: last!.result };
}
const best = (ids: string[]) => ids.find((i) => kindOf(i) === 'best')!;
const worst = (ids: string[]) =>
  ids.slice().sort((a, b) => QUESTION_SCORE[kindOf(a)] - QUESTION_SCORE[kindOf(b)])[0]!;

describe('interview content', () => {
  it('has three people and the round answers for every segment of every industry', () => {
    for (const s of SEGMENT_TEMPLATES) {
      const seg = SEGMENT_INTERVIEWS[s.key];
      expect(seg, s.key).toBeDefined();
      expect(seg!.personas.length).toBeGreaterThanOrEqual(3);
      expect(seg!.tried.length).toBeGreaterThanOrEqual(2);
      expect(seg!.switchIf.length).toBeGreaterThanOrEqual(2);
      for (const p of seg!.personas)
        for (const l of [p.job, p.detail, p.greeting, p.pain, p.painNote])
          expect(l.en.length > 0 && l.fr.length > 0, `${s.key} ${l.en}`).toBe(true);
    }
  });

  it('meets the same person with the same questions for the same world', () => {
    const a = world();
    const b = world();
    const c = companyOf(a, F);
    expect(meet(a, c, SEG, 0)).toEqual(meet(b, companyOf(b, F), SEG, 0));
    // Four questions a round, always including the best one.
    for (const offer of meet(a, c, SEG, 0).offers) {
      expect(offer).toHaveLength(4);
      expect(offer.filter((i) => kindOf(i) === 'best')).toHaveLength(1);
    }
  });
});

describe('an interview', () => {
  it('takes an hour and a small cost through the ledger, and answers in character', () => {
    const w0 = world();
    const before = moneyByCurrency(w0);
    const hours = w0.players[F]!.hours.used;
    const cash = (w: World) => w.accounts[companyOf(w, F).account]!.balance;
    const r = start(w0);
    expect(r.world.players[F]!.hours.used - hours).toBe(INTERVIEW.hours);
    expect(cash(w0) - cash(r.world)).toBe(interviewsView(w0, companyOf(w0, F)).cost);
    expect(moneyByCurrency(r.world)).toEqual(before);
    expect(negativeInternalAccounts(r.world)).toEqual([]);
    // The best round-1 question fills the Pain note with a figure, in both languages.
    const q = best(active(r.world).offers[0]!);
    const a = ask(r.world, q);
    expect(a.result.note.key).toBe('pain');
    expect(a.result.answer.en).toMatch(/₦/);
    expect(a.result.answer.fr.length).toBeGreaterThan(0);
    const v = interviewsView(a.world, companyOf(a.world, F));
    expect(v.active!.round).toBe(1);
    expect(v.active!.notes.pain?.en).toMatch(/₦/);
    // Asked rounds show what kind each question was; the next round's don't.
    expect(v.active!.rounds[0]!.offered.every((o) => !!o.kind)).toBe(true);
    expect(v.active!.options.every((o) => !('kind' in o))).toBe(true);
  });

  it('scores the questions and adds understanding scaled by the score', () => {
    const good = interview(world(), best);
    expect(good.result.done).toBe(true);
    expect(good.result.score).toBe(100);
    const c = companyOf(good.w, F);
    expect(c.product.discovery[SEG]).toBeCloseTo(INTERVIEW.gain, 5);
    expect(c.interviews!.active).toBeNull();
    const sum = interviewsView(good.w, c).last!;
    expect(sum.score).toBe(100);
    expect(sum.rounds.every((r) => r.mark === 'good' && r.best === null)).toBe(true);
    expect(sum.notes.pain && sum.notes.paysNow && sum.notes.switchIf).toBeTruthy();
    expect(sum.missed.question.en.length).toBeGreaterThan(0);

    const bad = interview(world(), worst);
    expect(bad.result.score).toBeLessThan(40);
    const cb = companyOf(bad.w, F);
    expect(cb.product.discovery[SEG]!).toBeLessThan(c.product.discovery[SEG]!);
    const sb = interviewsView(bad.w, cb).last!;
    // Every miss names the best question you could have asked, and why.
    expect(sb.rounds.every((r) => r.mark === 'bad' && r.best !== null && r.why.en)).toBe(true);
  });

  it('credits the stage tracker’s discovery task', () => {
    let w = world();
    for (let i = 0; i < 3; i++) w = interview(w, best).w;
    const task = founderGuide(w, companyOf(w, F))
      .stages.flatMap((s) => s.tasks)
      .find((x) => x.id === 'idea.discovery')!;
    expect(task.interviews).toBe(3);
    expect(task.have).toBeGreaterThan(0);
  });

  it('allows a few a month, one at a time, and only asked questions on offer', () => {
    let w = start(world()).world;
    const again = tryRun(w, F, {
      type: 'company.interview',
      companyId: cid(w),
      action: 'start',
      segmentKey: SEG,
    });
    expect(!again.ok && again.error.code).toBe('interview.active');
    const wrong = tryRun(w, F, {
      type: 'company.interview',
      companyId: cid(w),
      action: 'ask',
      questionId: active(w).offers[1]![0]!,
    });
    expect(!wrong.ok && wrong.error.code).toBe('interview.question');
    w = run(w, F, { type: 'company.interview', companyId: cid(w), action: 'leave' }).world;
    for (let i = 1; i < INTERVIEW.perMonth; i++) w = interview(w, best).w;
    const over = tryRun(w, F, {
      type: 'company.interview',
      companyId: cid(w),
      action: 'start',
      segmentKey: SEG,
    });
    expect(!over.ok && over.error.code).toBe('interview.limit');
  });

  it('refuses segments outside your industry', () => {
    const r = tryRun(world(), F, {
      type: 'company.interview',
      companyId: cid(world()),
      action: 'start',
      segmentKey: 'saas.solo',
    });
    expect(!r.ok && r.error.code).toBe('interview.segment');
  });
});

describe('without the feedback note', () => {
  it('is an unknown command, and the one-click discovery works as before', () => {
    const w = addFounder(makeWorld());
    const r = tryRun(w, F, {
      type: 'company.interview',
      companyId: cid(w),
      action: 'start',
      segmentKey: SEG,
    });
    expect(!r.ok && r.error.code).toBe('command.unknown');
    const old = run(w, F, { type: 'company.discovery', companyId: cid(w), segmentKey: SEG });
    expect(companyOf(old.world, F).product.discovery[SEG]).toBeGreaterThan(0.2);
    expect(companyOf(old.world, F).interviews).toBeUndefined();
    const task = founderGuide(w, companyOf(w, F))
      .stages.flatMap((s) => s.tasks)
      .find((x) => x.id === 'idea.discovery')!;
    expect('interviews' in task).toBe(false);
  });
});
