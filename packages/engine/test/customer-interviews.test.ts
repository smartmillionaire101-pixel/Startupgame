/**
 * Customer interviews (interviews.ts; player feedback, round two: "When I
 * click interview customers I don't really interview"). Three rounds of
 * questions with in-character answers, a 0–100 score and a gain in customer
 * understanding scaled by it. Feedback-note worlds only.
 */
import { describe, expect, it } from 'vitest';
import { INTERVIEW, interviewsView, meet } from '../src/customer-interviews.js';
import { QUESTION_SCORE, SEGMENT_INTERVIEWS } from '../src/data/customer-interviews.js';
import { INDUSTRIES, SEGMENT_TEMPLATES, type Industry } from '../src/data/industries.js';
import { INDUSTRY_INTERVIEWS } from '../src/data/interview-industries.js';
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
    // Three questions a round, always including the best one.
    for (const offer of meet(a, c, SEG, 0).offers) {
      expect(offer).toHaveLength(3);
      expect(offer.filter((i) => kindOf(i) === 'best')).toHaveLength(1);
    }
  });
});

/**
 * Player feedback: "questions submitted for interviewing clients are just
 * focus on fintech so when I select health tech it just give me the same
 * questions". Each industry asks in its own words, and none borrows another's.
 */
describe('interviews in each industry’s words', () => {
  /** Words only one industry's interviews should use. */
  const OWN: Partial<Record<Industry, RegExp>> = {
    fintech: /\b(payments?|payouts?|transfers?|owes?|owed|ledger|loans?|bank\w*|credit)\b/i,
    logistics: /\b(parcels?|couriers?|dispatch|pickups?|drivers?|fuel|deliver\w*)\b/i,
    healthtech: /\b(doctors?|clinics?|patients?|care|health\w*)\b/i,
    edtech: /\b(exams?|lessons?|tutors?|grades)\b/i,
    agritech: /\b(harvest|farm\w*|middlem[ae]n|produce|co-op|season)\b/i,
    saas: /\b(software|spreadsheets?|cloud|admin)\b/i,
  };
  /** An industry's own lines: every question but the price ones, and what people say to them. */
  const lines = (i: Industry) => {
    const kit = INDUSTRY_INTERVIEWS[i];
    return [
      ...kit.questions.flatMap((r) =>
        (['best', 'broad', 'yesno', 'leading'] as const).flatMap((k) => r[k]),
      ),
      ...kit.weak.flatMap((r) => Object.values(r)),
      kit.vague,
    ];
  };

  it('has every round’s questions and answers in English and French', () => {
    for (const i of INDUSTRIES) {
      const kit = INDUSTRY_INTERVIEWS[i];
      expect(kit.questions).toHaveLength(INTERVIEW.rounds);
      expect(kit.weak).toHaveLength(INTERVIEW.rounds);
      for (const r of kit.questions)
        for (const k of ['best', 'broad', 'yesno', 'leading', 'early'] as const)
          expect(r[k].length, `${i} ${k}`).toBeGreaterThan(0);
      for (const l of [...lines(i), ...kit.questions.flatMap((r) => r.early)])
        expect(l.en.length > 0 && l.fr.length > 0, `${i} ${l.en}`).toBe(true);
    }
  });

  it('asks each industry different questions, and no other industry’s', () => {
    const clash: string[] = [];
    for (const i of INDUSTRIES) {
      for (const j of INDUSTRIES) {
        if (j === i) continue;
        // Rounds 2 and 3's best questions are the industry's own.
        const theirs = new Set(
          INDUSTRY_INTERVIEWS[j].questions.slice(1).flatMap((r) => r.best.map((l) => l.en)),
        );
        for (const r of INDUSTRY_INTERVIEWS[i].questions.slice(1))
          for (const l of r.best) if (theirs.has(l.en)) clash.push(`${i} and ${j}: ${l.en}`);
        const words = OWN[j];
        for (const l of words ? lines(i) : [])
          if (words!.test(l.en)) clash.push(`${i} uses ${j}’s words: ${l.en}`);
      }
    }
    expect(clash).toEqual([]);
  });

  it('shows a health clinic and a courier their own questions and answers', () => {
    const at = (industry: Industry, idea: string) => {
      let w = run(makeWorld(), F, {
        type: 'player.create',
        handle: 'h_iv',
        name: 'Ada Founder',
        role: 'founder',
        backgroundId: 'f-engineer',
        market: 'lagos',
        company: {
          name: 'Mmna',
          industry,
          revenueModel: 'subscription',
          idea,
          incorporation: 'local',
        },
      }).world;
      w = announce(w);
      const seg = SEGMENT_TEMPLATES.find((s) => s.industry === industry)!.key;
      w = start(w, seg).world;
      w = ask(w, best(active(w).offers[0]!)).world;
      const v = interviewsView(w, companyOf(w, F)).active!;
      return { seg, text: [...v.options.map((o) => o.text.en), v.rounds[0]!.answer.en].join(' ') };
    };
    const health = at('healthtech', 'Health tech providing access to quality care');
    expect(health.seg).toMatch(/^healthtech\./);
    expect(health.text).not.toMatch(OWN.fintech!);
    expect(health.text).not.toMatch(OWN.logistics!);
    const parcels = at('logistics', 'Same-day deliveries for online sellers');
    expect(parcels.seg).toMatch(/^logistics\./);
    expect(parcels.text).not.toMatch(OWN.fintech!);
    expect(parcels.text).not.toMatch(OWN.healthtech!);
    expect(parcels.text).not.toEqual(health.text);
  });

  it('gives health and logistics people their own answers to rounds 2 and 3, not payments', () => {
    for (const s of SEGMENT_TEMPLATES.filter((x) => /^(healthtech|logistics)\./.test(x.key))) {
      const seg = SEGMENT_INTERVIEWS[s.key]!;
      for (const [answer, note] of [...seg.tried, ...seg.switchIf])
        for (const l of [answer, note])
          expect(
            /\b(payments?|payouts?|transfers?|ledger|loans?)\b/i.test(l.en),
            `${s.key}: ${l.en}`,
          ).toBe(false);
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
