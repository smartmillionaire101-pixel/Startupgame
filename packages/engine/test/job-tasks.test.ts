/**
 * On-the-job tasks (FEEDBACK_NOTE, jobtasks.ts): tasks handed out with the
 * job and each month, scoring, warning → final warning → let go, missed
 * tasks at month end, a clean month clearing a strike, the ledger staying
 * balanced, and worlds without the note playing as before.
 */
import { describe, expect, it } from 'vitest';
import { JOB_TASKS, jobTaskById } from '../src/data/job-tasks.js';
import { bestAnswers } from '../src/data/interviews.js';
import { PROFESSIONS, professionById, type ProfessionId } from '../src/data/professions.js';
import { businessesOf, isOpen } from '../src/economy.js';
import { TASKS } from '../src/jobtasks.js';
import { FEEDBACK_NOTE, JOBS_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { Player, World } from '../src/types.js';
import {
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
} from './helpers.js';

const F = 'u_founder';
const me = (w: World): Player => w.players[F]!;
const announce = (w: World, id: string) =>
  run(w, null, { type: 'system.announce', id, text: 'Notes.' }).world;

/** A founder (ex-engineer) in Lagos, in a world with this release note. */
function founder(note: string) {
  return run(announce(makeWorld(42, ['lagos']), note), F, {
    type: 'player.create',
    handle: 'h_tasker',
    name: 'Tia Tasker',
    role: 'founder',
    backgroundId: 'f-engineer',
    market: 'lagos',
    company: {
      name: 'Tasker Co',
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

/** Hired as a Software engineer (level 2) at the tech company. */
function hired(note: string = FEEDBACK_NOTE) {
  let w = founder(note);
  const b = employer(w, 'tech');
  const a = run(w, F, { type: 'job.apply', businessId: b.id, level: 2 });
  w = a.world;
  // The feedback round asks by level (data/interviews.ts); old worlds the three questions.
  const answers =
    note === FEEDBACK_NOTE
      ? bestAnswers('tech', 2)
      : professionById('tech')!.questions.map((q) =>
          q.options.reduce((bi, o, i, xs) => (o.fit > xs[bi]!.fit ? i : bi), 0),
        );
  const r = run(w, F, { type: 'job.interview', applicationId: a.result.application.id, answers });
  expect(r.result.hired).toBe(true);
  return { w: r.world, b };
}

const tasksOf = (w: World) => playerView(w, F)!.work!.job!.tasks!;
/** Answer the task in hand: right, or a wrong option. */
function answer(w: World, right: boolean) {
  const cur = tasksOf(w).current!;
  const best = jobTaskById(cur.id)!.best;
  return run(w, F, { type: 'job.task', taskId: cur.id, answer: right ? best : (best + 1) % 4 });
}

describe('job tasks: the bank', () => {
  it('every profession has eight tasks, four options, a best one and a why for each, in French too', () => {
    const ids = new Set<string>();
    for (const p of PROFESSIONS) {
      const xs = JOB_TASKS.filter((t) => t.profession === p.id);
      expect(xs.length, p.id).toBeGreaterThanOrEqual(8);
      for (const t of xs) {
        expect(ids.has(t.id), t.id).toBe(false);
        ids.add(t.id);
        expect(t.options).toHaveLength(4);
        expect(t.why).toHaveLength(4);
        expect(t.best).toBeGreaterThanOrEqual(0);
        expect(t.best).toBeLessThan(4);
        expect(t.fr.options).toHaveLength(4);
        expect(t.fr.why).toHaveLength(4);
        expect(t.fr.text).not.toBe(t.text);
        expect(t.title.length).toBeGreaterThan(0);
        expect(t.fr.title.length).toBeGreaterThan(0);
      }
    }
  });

  it('the best answer sits on every letter, not always the same one', () => {
    const slots = new Set(JOB_TASKS.map((t) => t.best));
    expect([...slots].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('job tasks: worlds without the feedback note', () => {
  it('jobs play as before: no tasks, no strikes, nobody is let go, job.task is refused', () => {
    let { w } = hired(JOBS_NOTE);
    expect(me(w).work!.tasks).toBeUndefined();
    expect(playerView(w, F)!.work!.job!.tasks).toBeNull();
    expect(playerView(w, F)!.work!.letGo).toBeNull();
    const r = tryRun(w, F, { type: 'job.task', taskId: 'tech-t-review', answer: 0 });
    expect(r.ok).toBe(false);
    w = settle(w, 'lagos', 4);
    expect(me(w).job).toMatchObject({ profession: 'tech', level: 2, months: 4 });
    expect(me(w).work!.tasks).toBeUndefined();
    expect(me(w).work!.record).toBeUndefined();
  });
});

describe('job tasks: the feedback round', () => {
  it('a new hire gets the month’s tasks from their profession, one at a time', () => {
    const { w, b } = hired();
    const t = me(w).work!.tasks!;
    expect(t.businessId).toBe(b.id);
    expect(t.ids).toHaveLength(TASKS.perMonth);
    expect(new Set(t.ids).size).toBe(TASKS.perMonth);
    for (const id of t.ids) expect(jobTaskById(id)!.profession).toBe('tech');
    const v = tasksOf(w);
    expect(v.current).toMatchObject({ n: 1, id: t.ids[0] });
    expect(v.current!.fr.text.length).toBeGreaterThan(0);
    // The best answer isn't sent with the task in hand.
    expect(v.current).not.toHaveProperty('best');
    expect(v.manager).toBe(b.owner.name);
    expect(v.strikes).toBe(0);
    expect(v.warning).toBeNull();
  });

  it('a right answer raises performance, costs an hour and shows the best answer and why', () => {
    const { w } = hired();
    const perf = me(w).work!.perf!;
    const used = me(w).hours.used;
    const r = answer(w, true);
    expect(r.result).toMatchObject({ right: true, fired: false, strikes: 0 });
    const w2 = r.world;
    expect(me(w2).work!.perf).toBeCloseTo(perf + TASKS.right, 5);
    expect(me(w2).hours.used).toBe(used + TASKS.hours);
    const v = tasksOf(w2);
    expect(v.last).toMatchObject({ n: 1, right: true, delta: 5 });
    expect(v.last!.why).toHaveLength(4);
    expect(v.current!.n).toBe(2);
    expect(v.results).toEqual([{ n: 1, id: v.last!.id, right: true, missed: false }]);
  });

  it('only the task in hand can be answered', () => {
    const { w } = hired();
    const t = me(w).work!.tasks!;
    expect(tryRun(w, F, { type: 'job.task', taskId: t.ids[1]!, answer: 0 }).ok).toBe(false);
    expect(tryRun(w, F, { type: 'job.task', taskId: t.ids[0]!, answer: 4 }).ok).toBe(false);
  });

  it('wrong calls: a manager warning, a final warning, then let go (notice paid, on the record)', () => {
    const { w: start, b } = hired();
    let w = start;
    const perf = me(w).work!.perf!;
    const money = moneyByCurrency(w);
    w = answer(w, false).world;
    expect(tasksOf(w)).toMatchObject({ strikes: 1, warning: 'manager' });
    expect(tasksOf(w).last).toMatchObject({ right: false, delta: -8 });
    expect(w.inbox[F]![0]!.text).toMatch(/^Manager warning/);
    w = answer(w, false).world;
    expect(tasksOf(w)).toMatchObject({ strikes: 2, warning: 'final' });
    expect(w.inbox[F]![0]!.text).toMatch(/^Final warning/);
    const gross = playerView(w, F)!.work!.job!.monthlyPay;
    const r = answer(w, false);
    w = r.world;
    expect(r.result).toMatchObject({ right: false, fired: true, strikes: 3 });
    expect(me(w).job).toBeUndefined();
    expect(me(w).work!.perf).toBeCloseTo(perf + 3 * TASKS.wrong, 5);
    expect(me(w).work!.tasks).toBeUndefined();
    const notice = Math.round(gross * TASKS.notice);
    expect(me(w).work!.record![0]).toMatchObject({
      businessId: b.id,
      employer: b.name,
      profession: 'tech',
      label: 'Software engineer',
      reason: 'performance',
      notice,
    });
    expect(w.inbox[F]![0]!.text).toContain(`${b.name} let you go after three strikes`);
    const lines = w.accounts[me(w).accounts.local]!.recent;
    expect(lines.find((l) => l.memo === `Notice pay: ${b.name}`)?.amount).toBe(notice);
    expect(lines.find((l) => l.memo === `Income tax: ${b.name}`)?.amount).toBeLessThan(0);
    // Money only moved: nothing created or destroyed.
    expect(moneyByCurrency(w)).toEqual(money);
    expect(negativeInternalAccounts(w)).toEqual([]);
    // The view: the let-go card; no job, no tasks; the employer won't see you for a while.
    const v = playerView(w, F)!.work!;
    expect(v.job).toBeNull();
    expect(v.letGo).toMatchObject({ employer: b.name, reason: 'performance', notice });
    expect(v.employers.find((e) => e.businessId === b.id)!.cooldownUntil).toBe(
      w.markets.lagos!.month + TASKS.rehireMonths,
    );
    expect(tryRun(w, F, { type: 'job.task', taskId: 'tech-t-review', answer: 0 }).ok).toBe(false);
    // The salary stops (hired and let go before any payday: no salary ever paid).
    w = settle(w, 'lagos', 1);
    const recent = w.accounts[me(w).accounts.local]!.recent;
    expect(recent.some((l) => l.memo.startsWith('Salary:'))).toBe(false);
  });

  it('unanswered tasks expire at month end: missed, a strike, and new tasks for the new month', () => {
    let { w } = hired();
    const perf = me(w).work!.perf!;
    const first = me(w).work!.tasks!.ids;
    w = settle(w, 'lagos', 1);
    const t = me(w).work!.tasks!;
    expect(t.month).toBe(w.markets.lagos!.month);
    expect(t.strikes).toBe(1);
    expect(t.results).toEqual([]);
    // Fresh tasks first: none of last month's.
    expect(t.ids.some((id) => first.includes(id))).toBe(false);
    expect(w.inbox[F]!.some((n) => n.text.startsWith('4 work tasks went unanswered'))).toBe(true);
    expect(w.inbox[F]!.some((n) => n.text.startsWith('Manager warning'))).toBe(true);
    // Four misses, then the month's own performance blend (payroll first): lower than before.
    expect(me(w).work!.perf!).toBeLessThan(perf);
    w = settle(w, 'lagos', 1);
    expect(me(w).work!.tasks!.strikes).toBe(2);
    expect(me(w).job).toBeDefined();
    w = settle(w, 'lagos', 1);
    expect(me(w).job).toBeUndefined();
    expect(me(w).work!.record![0]!.reason).toBe('performance');
    expect(negativeInternalAccounts(w)).toEqual([]);
  });

  it('a month with every task right clears a strike', () => {
    let { w } = hired();
    w = answer(w, false).world;
    for (let i = 0; i < 3; i++) w = answer(w, true).world;
    expect(tasksOf(w).current).toBeNull();
    expect(tryRun(w, F, { type: 'job.task', taskId: 'tech-t-review', answer: 0 }).ok).toBe(false);
    w = settle(w, 'lagos', 1);
    expect(me(w).work!.tasks!.strikes).toBe(1);
    for (let i = 0; i < TASKS.perMonth; i++) w = answer(w, true).world;
    w = settle(w, 'lagos', 1);
    expect(me(w).work!.tasks!.strikes).toBe(0);
    expect(w.inbox[F]!.some((n) => n.text.includes('one strike cleared'))).toBe(true);
    expect(me(w).job).toMatchObject({ profession: 'tech' });
  });

  it('is deterministic: the same log hands out the same tasks', () => {
    const a = settle(hired().w, 'lagos', 2);
    const b = settle(hired().w, 'lagos', 2);
    expect(me(a).work!.tasks).toEqual(me(b).work!.tasks);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
