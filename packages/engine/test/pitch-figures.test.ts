import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { commandSchema, type Command } from '../src/commands.js';
import { totalCustomers } from '../src/helpers.js';
import { LIFE_BARS_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { Pitch, World } from '../src/types.js';
import { addFounder, companyOf, makeWorld, run, tryRun } from './helpers.js';

const F = 'u_founder';
const DILIGENCE = 'didn’t match what we found in diligence';

const announce = (w: World) =>
  run(w, null, { type: 'system.announce', id: LIFE_BARS_NOTE, text: 'Life bars.' }).world;

/** A founder with an open pitch at an AI fund that asks questions, or null for this seed. */
function openPitch(seed: number, released: boolean): { w: World; p: Pitch } | null {
  const base = makeWorld(seed, ['lagos']);
  const w = addFounder(released ? announce(base) : base);
  const c = companyOf(w, F);
  const fund = Object.values(w.funds).find(
    (f) =>
      f.market === 'lagos' &&
      f.stages.includes('pre-seed') &&
      (f.sectors === 'any' || f.sectors.includes('fintech')) &&
      f.minStars <= 0.5,
  );
  if (!fund) return null;
  const s = run(w, F, {
    type: 'pitch.start',
    companyId: c.id,
    fundId: fund.id,
    slides: ['problem', 'product', 'team'],
    ask: fund.check[0],
  });
  if (s.result.status !== 'questions') return null;
  return { w: s.world, p: s.world.pitches[s.result.pitchId]! };
}

const answer = (p: Pitch, answers: Record<string, string>, figures?: Record<string, number>) =>
  ({ type: 'pitch.answer', pitchId: p.id, answers, ...(figures ? { figures } : {}) }) as Command;

/** Give the founder's company `n` paying customers (a company that grew since pitching). */
const grow = (w: World, n: number) =>
  produce(w, (d) => {
    const c = Object.values(d.companies).find((x) => x.founderIds.includes(F))!;
    const seg = Object.values(c.segments)[0]!;
    seg.paying += n - totalCustomers(c);
  });

const seeds = Array.from({ length: 30 }, (_, i) => i + 1);

describe('pitch questions: typed figures (life-bars note)', () => {
  it('asks in plain words and marks the numeric questions', () => {
    const o = seeds.map((s) => openPitch(s, true)).find(Boolean)!;
    const qs = o.p.questions;
    expect(qs.find((q) => q.id === 'runway')!.text).toBe(
      'How many months will your company’s money last?',
    );
    expect(Object.fromEntries(qs.map((q) => [q.id, q.figure]))).toEqual({
      traction: 'customers',
      revenue: 'money',
      runway: 'months',
    });
    // Never "Infinity months" (and Infinity would not survive JSON).
    for (const q of qs) for (const opt of q.options) expect(opt.label).not.toContain('Infinity');
  });

  it('judges a typed figure against today’s truth, and shows today’s numbers', () => {
    let tried = 0;
    for (const seed of seeds) {
      const o = openPitch(seed, true);
      if (!o) continue;
      tried++;
      // The company grew to 52 customers after the pitch began.
      const w = grow(o.w, 52);
      const view = playerView(w, F)!;
      const shown = view.pitches.find((x) => x.id === o.p.id)!.questions;
      expect(shown.find((q) => q.id === 'traction')!.options[0]!.label).toBe('52, and growing');
      const a = run(w, F, answer(o.p, { revenue: 'honest', runway: 'honest' }, { traction: 53 }));
      const p = a.world.pitches[o.p.id]!;
      expect(p.reason).not.toContain(DILIGENCE);
      expect(p.figures).toEqual({ traction: 53 });
      expect(p.questions.find((q) => q.id === 'traction')!.options[0]!.truth).toBe(52);
    }
    expect(tried).toBeGreaterThan(3);
  });

  it('can catch an inflated typed figure in diligence', () => {
    let caught = 0;
    let tried = 0;
    for (const seed of seeds) {
      const o = openPitch(seed, true);
      if (!o) continue;
      tried++;
      const w = grow(o.w, 50);
      const a = run(w, F, answer(o.p, { revenue: 'honest', runway: 'honest' }, { traction: 500 }));
      if (a.world.pitches[o.p.id]!.reason.includes(DILIGENCE)) caught++;
    }
    expect(tried).toBeGreaterThan(3);
    expect(caught).toBeGreaterThan(0);
    expect(caught).toBeLessThan(tried + 1);
  });

  it('treats an under-claim as honest (never caught)', () => {
    for (const seed of seeds) {
      const o = openPitch(seed, true);
      if (!o) continue;
      const w = grow(o.w, 80);
      const a = run(w, F, answer(o.p, { runway: 'honest' }, { traction: 10, revenue: 0 }));
      expect(a.world.pitches[o.p.id]!.reason).not.toContain(DILIGENCE);
    }
  });

  it('rejects bad figures', () => {
    const o = seeds.map((s) => openPitch(s, true)).find(Boolean)!;
    const bad = (
      figures: Record<string, number>,
      answers: Record<string, string> = { revenue: 'honest', runway: 'honest' },
    ) => {
      const r = tryRun(o.w, F, answer(o.p, answers, figures));
      return r.ok ? 'ok' : r.error.code;
    };
    // Picked and typed for the same question.
    expect(bad({ traction: 5 }, { traction: 'honest', revenue: 'honest', runway: 'honest' })).toBe(
      'pitch.figures',
    );
    expect(bad({ traction: 2.5 })).toBe('pitch.figures');
    expect(bad({ traction: -1 })).toBe('pitch.figures');
    expect(bad({ traction: Number.POSITIVE_INFINITY })).toBe('pitch.figures');
    expect(bad({ traction: 2e9 })).toBe('pitch.figures');
    expect(bad({ team: 3, traction: 4 })).toBe('pitch.figures');
    expect(bad({ traction: 4, runway: 5000 }, { revenue: 'honest' })).toBe('pitch.figures');
    expect(bad({ traction: 4, revenue: 12.5 }, { runway: 'honest' })).toBe('pitch.figures');
    expect(bad({ traction: 4, runway: 7.5 }, { revenue: 'honest' })).toBe('ok');
    // Missing an answer for a question.
    expect(tryRun(o.w, F, answer(o.p, { revenue: 'honest' }, { traction: 4 })).ok).toBe(false);
    expect(bad({ traction: 4 })).toBe('ok');
    // The schema refuses what JSON can't carry honestly, too.
    const cmd = { type: 'pitch.answer', pitchId: 'p', answers: {}, figures: { traction: -3 } };
    expect(commandSchema.safeParse(cmd).success).toBe(false);
    expect(commandSchema.safeParse({ ...cmd, figures: { traction: 3 } }).success).toBe(true);
    expect(commandSchema.safeParse({ ...cmd, figures: undefined }).success).toBe(true);
  });

  it('still takes an answers-only command', () => {
    const o = seeds.map((s) => openPitch(s, true)).find(Boolean)!;
    const answers = Object.fromEntries(o.p.questions.map((q) => [q.id, 'honest']));
    const a = run(o.w, F, answer(o.p, answers));
    expect(a.world.pitches[o.p.id]!.status).not.toBe('questions');
    expect(a.world.pitches[o.p.id]!.figures).toBeUndefined();
  });
});

describe('pitch questions before the life-bars note', () => {
  it('asks and judges exactly as before, and refuses typed figures', () => {
    let tried = 0;
    for (const seed of seeds) {
      const o = openPitch(seed, false);
      if (!o) continue;
      tried++;
      expect(o.p.questions.find((q) => q.id === 'runway')!.text).toBe(
        'How many months of runway do you have?',
      );
      expect(o.p.questions.some((q) => 'figure' in q)).toBe(false);
      // Growth after the pitch began doesn't change what was asked or shown.
      const w = grow(o.w, 52);
      const shown = playerView(w, F)!.pitches.find((x) => x.id === o.p.id)!.questions;
      expect(shown.map((q) => q.options.map((x) => x.label))).toEqual(
        o.p.questions.map((q) => q.options.map((x) => x.label)),
      );
      const r = tryRun(
        w,
        F,
        answer(o.p, { revenue: 'honest', runway: 'honest' }, { traction: 52 }),
      );
      expect(r.ok ? 'ok' : r.error.code).toBe('pitch.figures');
      const answers = Object.fromEntries(o.p.questions.map((q) => [q.id, 'honest']));
      const a = run(w, F, answer(o.p, answers));
      // The stored questions are untouched: judged on the numbers at pitch start.
      expect(a.world.pitches[o.p.id]!.questions).toEqual(o.p.questions);
      expect(a.world.pitches[o.p.id]!.figures).toBeUndefined();
    }
    expect(tried).toBeGreaterThan(3);
  });
});
