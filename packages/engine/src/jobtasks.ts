/**
 * On-the-job tasks (FEEDBACK_NOTE; player feedback: "jobs where you can be
 * asked questions, and if you keep answering wrongly you can be fired").
 *
 * Anyone holding a professional job (founders too) gets four tasks a month
 * from their manager, drawn from their profession's bank
 * (data/job-tasks.ts): a code review, a credit check, a triage call… Each
 * has four options and a best one. `job.task` answers the task in hand
 * (an hour); the result comes back at once with the best answer and why.
 *
 * Performance (`work.perf`, the score promotion interviews already read)
 * goes up 5 points for a right call and down 8 for a wrong one. A month
 * that ends with tasks still open counts each of them as missed (down 5).
 *
 * Strikes, deterministic: every wrong call is a strike, and a month with
 * missed tasks is one more. One strike is a manager warning, two a final
 * warning, three and you're let go: the job ends, the salary stops, two
 * weeks' notice is paid from payroll (taxed), the employer won't take you
 * back for a while, and it goes on your record. A month with every task
 * right clears a strike.
 *
 * Worlds without the note never hand out tasks: jobs play exactly as
 * before, and `job.task` is refused.
 */
import { jobTaskById, jobTasksOf, type JobTask } from './data/job-tasks.js';
import { professionById } from './data/professions.js';
import { ensure } from './errors.js';
import { getMarket, notify, spendHours } from './helpers.js';
import { transfer, withTx } from './ledger.js';
import { clamp01 } from './math.js';
import { formatMoney } from './money.js';
import { feedbackOn } from './releases.js';
import { deriveRng } from './rng.js';
import type { JobTaskResult, JobTasks, Player, PlayerWork, World } from './types.js';
import { proPay } from './work.js';

export const TASKS = {
  /** Tasks handed out each month. */
  perMonth: 4,
  /** Hours a task takes. */
  hours: 1,
  /** Performance change (0–1 scale): right, wrong, missed. */
  right: 0.05,
  wrong: -0.08,
  missed: -0.05,
  /** Strikes: manager warning, final warning, let go. */
  warning: 1,
  final: 2,
  letGo: 3,
  /** Notice pay when you're let go, as a share of a month's gross pay. */
  notice: 0.5,
  /** Months before the employer that let you go will see you again. */
  rehireMonths: 3,
  /** Record entries kept. */
  keepRecord: 6,
} as const;

/** The tasks of your current professional job (none: no job, or none handed out yet). */
function tasksOfJob(p: Player): JobTasks | undefined {
  const t = p.work?.tasks;
  return t && p.job?.profession && t.businessId === p.job.businessId ? t : undefined;
}

/** The task in hand this month, if any. */
function currentId(p: Player, month: number): string | null {
  const t = tasksOfJob(p);
  if (!t || t.month !== month) return null;
  return t.ids[t.results.length] ?? null;
}

/**
 * Hand out a month's tasks: a seeded draw from the profession's bank, the
 * tasks you didn't see last month first. Strikes carry over at the same
 * employer; a new employer is a clean sheet.
 */
function handOut(world: World, p: Player, work: PlayerWork, month: number) {
  const job = p.job;
  if (!job?.profession) return;
  const bank = jobTasksOf(job.profession);
  if (!bank.length) return;
  const prev = work.tasks?.businessId === job.businessId ? work.tasks : undefined;
  const seen = new Set(prev?.ids ?? []);
  const rng = deriveRng(world.seed, 'work.tasks', p.id, job.businessId, month);
  const fresh = rng.shuffle(bank.filter((x) => !seen.has(x.id)));
  const again = rng.shuffle(bank.filter((x) => seen.has(x.id)));
  work.tasks = {
    businessId: job.businessId,
    month,
    ids: [...fresh, ...again].slice(0, TASKS.perMonth).map((x) => x.id),
    results: [],
    strikes: prev?.strikes ?? 0,
  };
}

/** A new hire (feedback worlds): a clean sheet and this month's tasks. */
export function startJobTasks(world: World, p: Player, work: PlayerWork, month: number) {
  if (!feedbackOn(world) || p.ai) return;
  delete work.tasks;
  handOut(world, p, work, month);
}

const STRIKE_NOTE: Record<number, string> = {
  [TASKS.warning]: 'Manager warning: a strike at work. Three strikes and you’re let go.',
  [TASKS.final]: 'Final warning: two strikes at work. One more and you’re let go.',
};

/** After strikes change: the warning, or (three strikes) the end of the job. */
function discipline(world: World, p: Player, before: number, month: number) {
  const t = tasksOfJob(p);
  if (!t || t.strikes === before) return;
  if (t.strikes >= TASKS.letGo) {
    letGo(world, p, month);
    return;
  }
  const note = STRIKE_NOTE[t.strikes];
  if (note && t.strikes > before) notify(world, p.id, { month, kind: 'warning', text: note });
}

/** Three strikes: the job ends, two weeks' notice is paid, and it goes on your record. */
function letGo(world: World, p: Player, month: number) {
  const job = p.job;
  const work = p.work;
  if (!job?.profession || !work) return;
  const m = getMarket(world, p.market);
  const b = m.businesses?.[job.businessId];
  const prof = professionById(job.profession);
  const level = job.level ?? 1;
  const notice = prof ? Math.round(proPay(m, prof, level) * TASKS.notice) : 0;
  const name = b?.name ?? 'your employer';
  if (notice > 0) {
    const tax = Math.round(notice * m.data.tax.personalIncome);
    withTx(world, { kind: 'salary' }, () => {
      transfer(world, m.ext.payroll, p.accounts.local, notice, `Notice pay: ${name}`, month);
      transfer(world, p.accounts.local, m.ext.tax, tax, `Income tax: ${name}`, month);
    });
  }
  (work.record ??= []).unshift({
    month,
    businessId: job.businessId,
    employer: name,
    profession: job.profession,
    label: prof?.levels[level - 1]?.label ?? '',
    reason: 'performance',
    notice,
  });
  if (work.record.length > TASKS.keepRecord) work.record.length = TASKS.keepRecord;
  (work.cooldown ??= {})[job.businessId] = month + TASKS.rehireMonths;
  delete work.tasks;
  delete p.job;
  notify(world, p.id, {
    month,
    kind: 'warning',
    text: `${name} let you go after three strikes. Your salary has stopped; two weeks’ notice pay is ${formatMoney(notice, m.data.currency)} before tax.`,
  });
}

const setPerf = (work: PlayerWork, delta: number) => {
  work.perf = Math.round(clamp01((work.perf ?? 0.5) + delta) * 100) / 100;
};

/** `job.task`: answer the task in hand. The result, the best answer and why come back at once. */
export function answerTask(world: World, me: Player, taskId: string, choice: number) {
  ensure(feedbackOn(world), 'job.task.release', 'There are no work tasks yet.');
  ensure(me.job?.profession, 'job.task.none', 'You don’t have a professional job.');
  const m = getMarket(world, me.market);
  const id = currentId(me, m.month);
  ensure(id, 'job.task.done', 'No task waiting: your manager will send more next month.');
  ensure(id === taskId, 'job.task.stale', 'That task isn’t the one in hand any more.');
  const task = jobTaskById(id)!;
  ensure(
    Number.isInteger(choice) && choice >= 0 && choice < task.options.length,
    'job.task.answer',
    'Pick one of the options.',
  );
  spendHours(me, TASKS.hours, 'A work task');
  const work = me.work!;
  const t = work.tasks!;
  const right = choice === task.best;
  const delta = right ? TASKS.right : TASKS.wrong;
  const result: JobTaskResult = { id, choice, best: task.best, right, delta, month: m.month };
  t.results.push(result);
  setPerf(work, delta);
  const before = t.strikes;
  if (!right) t.strikes += 1;
  const strikes = t.strikes;
  discipline(world, me, before, m.month);
  const fired = !me.job;
  return {
    right,
    best: task.best,
    why: task.why[task.best]!,
    strikes,
    fired,
    message: fired
      ? 'Three strikes: you’ve been let go.'
      : right
        ? 'Good call.'
        : `Not quite. Best: ${task.options[task.best]}`,
  };
}

/**
 * Month end (feedback worlds; `month` is the month starting): open tasks
 * from the month that ended are missed, strikes are counted (a clean month
 * clears one), and the new month's tasks are handed out.
 */
export function settleJobTasks(world: World, p: Player, month: number) {
  if (!feedbackOn(world) || p.ai || !p.job?.profession || !p.work) return;
  const work = p.work;
  const t = tasksOfJob(p);
  if (t && t.month < month) {
    const open = t.ids.slice(t.results.length);
    for (const id of open) {
      const task = jobTaskById(id);
      t.results.push({
        id,
        choice: null,
        best: task?.best ?? 0,
        right: false,
        delta: TASKS.missed,
        month: t.month,
      });
      setPerf(work, TASKS.missed);
    }
    const before = t.strikes;
    if (open.length) {
      t.strikes += 1;
      notify(world, p.id, {
        month,
        kind: 'warning',
        text:
          open.length === 1
            ? 'A work task went unanswered last month: it counts as a strike.'
            : `${open.length} work tasks went unanswered last month: they count as a strike.`,
      });
    } else if (t.strikes > 0 && t.results.every((r) => r.right)) {
      t.strikes -= 1;
      notify(world, p.id, {
        month,
        kind: 'milestone',
        text: 'Every work task right last month: one strike cleared.',
      });
    }
    discipline(world, p, before, month);
  }
  if (p.job?.profession && (!tasksOfJob(p) || tasksOfJob(p)!.month < month))
    handOut(world, p, work, month);
}

// ---------------------------------------------------------------- Views

const card = (x: JobTask) => ({
  id: x.id,
  title: x.title,
  text: x.text,
  options: x.options,
  code: x.code ?? null,
  fr: { title: x.fr.title, text: x.fr.text, options: x.fr.options },
});

/** The tasks part of `view.work.job` (null in worlds without the note). */
export function jobTasksView(world: World, p: Player) {
  if (!feedbackOn(world) || !p.job?.profession) return null;
  const m = getMarket(world, p.market);
  const t = tasksOfJob(p);
  const month = m.month;
  const results = t && t.month === month ? t.results : [];
  const id = currentId(p, month);
  const task = id ? jobTaskById(id) : undefined;
  const lastR = results.at(-1);
  const last = lastR ? jobTaskById(lastR.id) : undefined;
  const strikes = t?.strikes ?? 0;
  const b = m.businesses?.[p.job.businessId];
  return {
    perMonth: t?.ids.length ?? TASKS.perMonth,
    hours: TASKS.hours,
    manager: b?.owner.name ?? '',
    strikes,
    letGoAt: TASKS.letGo,
    warning: (strikes >= TASKS.final ? 'final' : strikes >= TASKS.warning ? 'manager' : null) as
      'final' | 'manager' | null,
    results: results.map((r, i) => ({
      n: i + 1,
      id: r.id,
      right: r.right,
      missed: r.choice === null,
    })),
    current: task ? { n: results.length + 1, ...card(task) } : null,
    last:
      lastR && last
        ? {
            n: results.length,
            ...card(last),
            choice: lastR.choice,
            best: lastR.best,
            right: lastR.right,
            delta: Math.round(lastR.delta * 100),
            why: last.why,
            frWhy: last.fr.why,
          }
        : null,
  };
}

/** `view.work.letGo`: the job you were let go from this month or last (null otherwise). */
export function letGoView(world: World, p: Player) {
  if (!feedbackOn(world)) return null;
  const r = p.work?.record?.[0];
  const month = getMarket(world, p.market).month;
  if (!r || r.month < month - 1 || (p.job && p.job.since >= r.month)) return null;
  return r;
}
