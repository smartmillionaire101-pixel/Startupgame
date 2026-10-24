/**
 * On-the-job tasks (engine jobtasks.ts, the feedback round): your
 * performance this month, the result of your last task with the best answer
 * and why, a manager or final warning, and the task in hand. When three
 * strikes end the job, the let-go card. Shown in the phone's Jobs app.
 */
import { useState } from 'react';
import { money } from '../format';
import { t, tx, useLang } from '../i18n';
import { useView } from '../store';
import { Button, Pill } from '../ui';
import { looseCmd } from '../city/life';
import { Meter } from './shared';
import { workOf, type Work } from './work';
import './jobtasks.css';

type Tasks = NonNullable<NonNullable<NonNullable<Work['job']>['tasks']>>;
type Card = NonNullable<Tasks['current']>;
type Last = NonNullable<Tasks['last']>;

const LETTERS = ['A', 'B', 'C', 'D'];

/** A task's words in the player's language. */
function words(c: Card | Last, fr: boolean) {
  return fr
    ? { title: c.fr.title, text: c.fr.text, options: c.fr.options }
    : { title: c.title, text: c.text, options: c.options };
}

function Performance({ tasks, perf }: { tasks: Tasks; perf: number }) {
  const right = tasks.results.filter((r) => r.right).length;
  const v = Math.round(perf * 100);
  return (
    <section className="phone-card job-perf" data-job-perf={v}>
      <div className="job-card-head">
        <h3 className="phone-h">{t('Performance this month')}</h3>
        <Pill tone={perf >= 0.6 ? 'good' : perf >= 0.45 ? 'info' : 'warn'}>
          {perf >= 0.6 ? t('Strong') : perf >= 0.45 ? t('Meets the bar') : t('Needs work')}
        </Pill>
      </div>
      <Meter label={t('Performance')} value={v} />
      <div className="job-task-pills">
        {tasks.results.map((r) => (
          <Pill key={r.n} tone={r.right ? 'good' : 'bad'}>
            {r.right ? '✓' : '✕'}{' '}
            {r.missed ? t('Task {n} missed', { n: r.n }) : t('Task {n}', { n: r.n })}
          </Pill>
        ))}
        <span className="small muted">
          {tasks.results.length
            ? t('{right} of {done} right · {total} tasks a month', {
                right,
                done: tasks.results.length,
                total: tasks.perMonth,
              })
            : t('{total} tasks a month', { total: tasks.perMonth })}
        </span>
      </div>
      <p className="small muted job-strikes" data-strikes={tasks.strikes}>
        {t('Strikes: {n} of {max}. A wrong call is a strike; three and you’re let go.', {
          n: tasks.strikes,
          max: tasks.letGoAt,
        })}
      </p>
    </section>
  );
}

/** The task in hand: four options, one answer. */
function TaskCard({ c, tasks }: { c: Card; tasks: Tasks }) {
  const { view, send, busy } = useView();
  const fr = useLang() === 'fr';
  const work = workOf(view);
  const [pick, setPick] = useState<number | null>(null);
  const w = words(c, fr);
  const tooFew = (work?.hoursLeft ?? 0) < tasks.hours;
  const submit = () =>
    void send(
      looseCmd({ type: 'job.task', taskId: c.id, answer: pick! }),
      (r: { right?: boolean; fired?: boolean } | null) =>
        r?.fired ? t('You’ve been let go.') : r?.right ? t('Good call.') : t('Not quite.'),
    );
  return (
    <section className="phone-card job-task" data-task={c.id} aria-label={w.title}>
      <div className="job-card-head">
        <h3 className="phone-h">{w.title}</h3>
        <span className="small muted">
          {t('Task {n} · {h}h · from {manager}', {
            n: c.n,
            h: tasks.hours,
            manager: tasks.manager,
          })}
        </span>
      </div>
      <p className="job-task-q">{w.text}</p>
      {c.code && <pre className="job-task-code">{c.code}</pre>}
      <div className="job-task-options" role="radiogroup" aria-label={w.text}>
        {w.options.map((o, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={pick === n}
            className={`job-task-option${pick === n ? ' is-on' : ''}`}
            onClick={() => setPick(n)}
          >
            <span className="job-task-letter">{LETTERS[n]}</span>
            {o}
          </button>
        ))}
      </div>
      <Button block disabled={pick === null || busy || tooFew} onClick={submit}>
        {tooFew
          ? t('A task takes {h}h; you have none left this month', { h: tasks.hours })
          : t('Send answer')}
      </Button>
    </section>
  );
}

/** Your last answer: right or not, the best answer, and why. */
function ResultCard({ last }: { last: Last }) {
  const fr = useLang() === 'fr';
  const w = words(last, fr);
  const why = (fr ? last.frWhy : last.why)[last.best];
  const delta = last.delta > 0 ? `+${last.delta}` : `${last.delta}`;
  return (
    <section
      className={`phone-card job-result ${last.right ? 'is-right' : 'is-wrong'}`}
      data-task-result={last.right ? 'right' : last.choice === null ? 'missed' : 'wrong'}
    >
      <div className="job-card-head">
        <h3 className="phone-h">{last.right ? `✓ ${t('Good call')}` : `✕ ${t('Not quite')}`}</h3>
        <Pill tone={last.right ? 'good' : 'bad'}>{t('{delta} performance', { delta })}</Pill>
      </div>
      <p className="small muted">{w.text}</p>
      {!last.right && last.choice !== null && (
        <div className="job-task-option is-wrong">
          <span className="job-task-letter">{LETTERS[last.choice]}</span>
          {t('You said: {answer}', { answer: w.options[last.choice]! })}
        </div>
      )}
      <div className="job-task-option is-right">
        <span className="job-task-letter">{LETTERS[last.best]}</span>
        {last.right ? w.options[last.best] : t('Best: {answer}', { answer: w.options[last.best]! })}
      </div>
      <p className="job-why">
        <b>{t('Why:')}</b> {why}
      </p>
    </section>
  );
}

function WarningCard({ tasks }: { tasks: Tasks }) {
  const final = tasks.warning === 'final';
  return (
    <section className="phone-card job-warning" data-warning={tasks.warning}>
      <div className="job-card-head">
        <h3 className="phone-h">⚠️ {final ? t('Final warning') : t('Manager warning')}</h3>
        <span className="small muted">{t('from {manager}', { manager: tasks.manager })}</span>
      </div>
      <p className="job-warning-line">
        {final
          ? t('Two strikes — final warning. One more and you’re let go.')
          : t('One strike — a warning. Three and you’re let go.')}
      </p>
      <p className="small muted">
        {t(
          'Get every task right for a month to clear a strike. Unanswered tasks count against you.',
        )}
      </p>
    </section>
  );
}

/** The tasks part of the Jobs app (nothing in worlds without them). */
export function JobTasksPanel() {
  const { view } = useView();
  const job = workOf(view)?.job;
  const tasks = job?.tasks;
  if (!job || !tasks) return null;
  return (
    <div className="job-tasks" data-job-tasks="">
      <Performance tasks={tasks} perf={job.perf} />
      {tasks.last && <ResultCard key={tasks.last.n} last={tasks.last} />}
      {tasks.warning && <WarningCard tasks={tasks} />}
      {tasks.current ? (
        <TaskCard key={tasks.current.id} c={tasks.current} tasks={tasks} />
      ) : (
        <p className="small muted">
          {t('No task waiting: your manager will send more next month.')}
        </p>
      )}
    </div>
  );
}

/** Let go for performance: what ended, what was paid, what's on your record. */
export function LetGoCard() {
  const { view } = useView();
  const r = workOf(view)?.letGo;
  if (!r) return null;
  const cur = view.market.currency;
  return (
    <section className="phone-card job-letgo" data-let-go={r.businessId}>
      <div className="job-letgo-big" aria-hidden="true">
        📦
      </div>
      <h3 className="phone-h">{t('You’ve been let go')}</h3>
      <p className="small">
        {t('{employer} ended your job as {role} after three strikes.', {
          employer: r.employer,
          role: tx(r.label),
        })}
      </p>
      <dl className="job-letgo-kv">
        <dt>{t('Notice pay (two weeks, before tax)')}</dt>
        <dd>{money(r.notice, cur)}</dd>
        <dt>{t('Salary')}</dt>
        <dd>{t('Stopped')}</dd>
        <dt>{t('On your record')}</dt>
        <dd>{t('“Let go: performance”')}</dd>
      </dl>
      <p className="small muted">{t('Other employers are hiring: see their ladders below.')}</p>
    </section>
  );
}
