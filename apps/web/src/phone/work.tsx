/**
 * The jobs rework (engine work.ts): professional employers, their ladders
 * with your eligibility, applying, the interview (in person, at the
 * employer) and the answer with its reason. Shared by the phone's Jobs app
 * and the employer's place scene.
 */
import { useState } from 'react';
import type { PlayerView } from '@runway/engine';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Pill } from '../ui';
import { looseCmd } from '../city/life';
import { BriefToggle, LevelInterview, LevelReview } from './interview';
import './work.css';

type View = PlayerView;
export type Work = NonNullable<View['work']>;
export type Employer = Work['employers'][number];
export type Rung = Employer['levels'][number];
type Application = Work['applications'][number];
export type Why = NonNullable<Rung['why']>;

export const workOf = (view: View): Work | null => view.work ?? null;

export const PROFESSION_ICON: Record<string, string> = {
  bank: '🏦',
  investment: '📈',
  tech: '💻',
  engineering: '🏗️',
  consultancy: '📊',
  law: '⚖️',
  hospital: '🏥',
};

/** A field as a heading ("Finance"). */
export function fieldTitle(f: string): string {
  return (
    {
      finance: t('Finance'),
      tech: t('Tech'),
      engineering: t('Engineering'),
      consulting: t('Consulting'),
      legal: t('Law'),
      health: t('Health care'),
      service: t('Service jobs'),
    }[f] ?? f
  );
}

/** A field inside a sentence ("12 months in finance"). */
export function fieldIn(f: string): string {
  return (
    {
      finance: t('in finance'),
      tech: t('in tech'),
      engineering: t('in engineering'),
      consulting: t('in consulting'),
      legal: t('in law'),
      health: t('in health care'),
      service: t('in service jobs'),
    }[f] ?? f
  );
}

export function skillName(s: string): string {
  return (
    {
      product: t('Product'),
      sales: t('Sales'),
      fundraising: t('Fundraising'),
      finance: t('Finance'),
      hiring: t('Hiring'),
      leadership: t('Leadership'),
      negotiation: t('Negotiation'),
      publicSpeaking: t('Public speaking'),
      investing: t('Investing'),
      risk: t('Risk'),
    }[s] ?? s
  );
}

/** The reason, in the player's language. */
export function whyLine(w: Why): string {
  switch (w.code) {
    case 'months':
      return t('Needs {need} months {field} — you have {have}', {
        need: w.need,
        have: w.have,
        field: fieldIn(w.field),
      });
    case 'skill':
      return t('{skill} skill {have}, they look for {need}', {
        skill: skillName(w.skill),
        have: w.have,
        need: w.need,
      });
    case 'tenure':
      return t('Needs {need} months in your current role — you have {have}', {
        need: w.need,
        have: w.have,
      });
    case 'interview':
      return t(
        'The interview didn’t convince them: {score}%, they hire from {need}%. Weakest answer: “{question}”',
        {
          score: w.score,
          need: w.need,
          question: tx(w.question),
        },
      );
    case 'hired':
      return w.strong === false
        ? t('Good interview — offer: {role}', { role: tx(w.label) })
        : t('Strong interview — offer: {role}', { role: tx(w.label) });
    case 'expired':
      return t('You missed the interview.');
  }
}

/** A rung's short status: Eligible, Needs 6 more months, Needs Finance 30… */
function rungChip(r: Rung): { label: string; tone: 'good' | 'warn' | 'bad' | 'info' } {
  if (r.status === 'current') return { label: t('Your role'), tone: 'info' };
  if (r.status === 'below') return { label: t('Done'), tone: 'info' };
  const w = r.why;
  if (!w) return { label: t('Eligible'), tone: 'good' };
  if (w.code === 'months')
    return { label: t('Needs {n} more months', { n: w.need - w.have }), tone: 'warn' };
  if (w.code === 'skill')
    return { label: t('Needs {skill} {n}', { skill: skillName(w.skill), n: w.need }), tone: 'bad' };
  if (w.code === 'tenure')
    return { label: t('Needs {n} more months', { n: w.need - w.have }), tone: 'warn' };
  return { label: t('Eligible'), tone: 'good' };
}

/** When a booked interview has to happen by. */
function interviewBy(view: View, a: Application): string {
  return a.expiresMonth <= view.market.month
    ? t('Go there before the month ends')
    : t('Go there this month or next');
}

/** One employer's ladder, each rung with your eligibility and Apply. */
export function Ladder({ e, compact = false }: { e: Employer; compact?: boolean }) {
  const { view, send, busy } = useView();
  const work = workOf(view);
  const cur = view.market.currency;
  if (!work) return null;
  const tooFew = work.hoursLeft < work.applyHours;
  const apply = (r: Rung) =>
    void send(
      looseCmd({ type: 'job.apply', businessId: e.businessId, level: r.level }),
      (res: { message?: string } | null) =>
        res?.message ? tx(res.message) : t('Interview booked at {place}.', { place: e.name }),
    );
  return (
    <ul className="work-ladder" aria-label={t('Roles at {place}', { place: e.name })}>
      {e.levels.map((r) => {
        const chip = rungChip(r);
        const open = r.status !== 'current' && r.status !== 'below';
        return (
          <li key={r.role} className="work-rung" data-rung={r.role} data-status={r.status}>
            <div className="work-rung-main">
              <span className="item-title">
                {tx(r.label)}{' '}
                <span className="small muted">· {t('Level {n}', { n: r.level })}</span>
              </span>
              <span className="small muted">
                {t('{pay}/mo · {h}h a month', { pay: money(r.monthlyPay, cur), h: r.hours })}
              </span>
              {!compact && r.why && open && (
                <span className="small work-why">{whyLine(r.why)}</span>
              )}
            </div>
            <div className="work-rung-end">
              <Pill tone={chip.tone}>{chip.label}</Pill>
              {open && (
                <Button
                  size="sm"
                  variant={r.why ? 'ghost' : 'primary'}
                  data-apply={r.role}
                  disabled={busy || !!e.booked || !!e.cooldownUntil || tooFew}
                  onClick={() => apply(r)}
                >
                  {r.promotion ? t('Ask for it') : t('Apply')}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The note under an employer: booked, cooling off, or what applying costs. */
export function EmployerNote({ e }: { e: Employer }) {
  const { view } = useView();
  const work = workOf(view);
  if (!work) return null;
  if (e.booked) return <p className="small work-note is-booked">{t('Interview booked here.')}</p>;
  if (e.cooldownUntil)
    return (
      <p className="small muted work-note">
        {t('They turned you down recently. You can apply again next month.')}
      </p>
    );
  return (
    <p className="small muted work-note">
      {work.hoursLeft < work.applyHours
        ? t('Applying takes {h}h; you have {left}h left this month.', {
            h: work.applyHours,
            left: Math.floor(work.hoursLeft),
          })
        : t('Applying takes {h}h. The interview is here, in person ({i}h).', {
            h: work.applyHours,
            i: work.interviewHours,
          })}
    </p>
  );
}

/** The interview: three questions, one answer each; the decision comes straight after. */
function Interview({ a }: { a: Application }) {
  // The feedback round: the questions of this level, a case step by step.
  if (a.level) return <LevelInterview a={a} />;
  return <ClassicInterview a={a} />;
}

function ClassicInterview({ a }: { a: Application }) {
  const { view, send, busy } = useView();
  const work = workOf(view);
  const [answers, setAnswers] = useState<(number | null)[]>(() => a.questions.map(() => null));
  if (!work) return null;
  const ready = answers.every((x) => x !== null);
  const tooFew = work.hoursLeft < work.interviewHours;
  const finish = () =>
    void send(
      looseCmd({ type: 'job.interview', applicationId: a.id, answers: answers as number[] }),
      (r: { hired?: boolean; message?: string } | null) =>
        r?.hired ? t('You got the job at {place}.', { place: a.employer }) : null,
    );
  return (
    <section
      className="work-interview"
      aria-label={t('Interview at {place}', { place: a.employer })}
    >
      <div className="work-interview-head">
        <span aria-hidden="true">🤝</span>
        <div>
          <div className="item-title">
            {a.promotion
              ? t('Promotion interview: {role}', { role: tx(a.label) })
              : t('Interview: {role}', { role: tx(a.label) })}
          </div>
          <div className="small muted">
            {t('{place} · about {h}h · answer all three', {
              place: a.employer,
              h: work.interviewHours,
            })}
          </div>
        </div>
      </div>
      <ol className="work-questions">
        {a.questions.map((q, i) => (
          <li key={q.id} className="work-question" data-question={q.id}>
            <p className="work-q">{tx(q.text)}</p>
            <div className="work-options" role="radiogroup" aria-label={tx(q.text)}>
              {q.options.map((o, n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={answers[i] === n}
                  className={`work-option${answers[i] === n ? ' is-on' : ''}`}
                  onClick={() => setAnswers((xs) => xs.map((x, k) => (k === i ? n : x)))}
                >
                  {tx(o)}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <Button block disabled={!ready || busy || tooFew || !a.canAttend} onClick={finish}>
        {tooFew
          ? t('The interview takes {h}h; you have {left}h left', {
              h: work.interviewHours,
              left: Math.floor(work.hoursLeft),
            })
          : t('Finish the interview')}
      </Button>
    </section>
  );
}

/** The answer: hired or turned down, with the reason (by level: the full review). */
function Decision({ a }: { a: Application }) {
  if (a.level?.review) return <LevelReview a={a} />;
  const hired = a.status === 'hired';
  return (
    <section
      className={`work-decision ${hired ? 'is-hired' : 'is-rejected'}`}
      data-decision={a.status}
      aria-label={hired ? t('Hired') : t('Not this time')}
    >
      <div className="work-decision-head">
        <span aria-hidden="true">{hired ? '🎉' : a.status === 'expired' ? '⌛' : '✋'}</span>
        <div>
          <div className="item-title">
            {hired
              ? a.promotion
                ? t('Promoted: {role}', { role: tx(a.label) })
                : t('Hired: {role}', { role: tx(a.label) })
              : a.status === 'expired'
                ? t('Interview missed: {role}', { role: tx(a.label) })
                : t('Not this time: {role}', { role: tx(a.label) })}
          </div>
          <div className="small muted">{a.employer}</div>
        </div>
      </div>
      {a.why && <p className="work-reason">{whyLine(a.why)}</p>}
    </section>
  );
}

/** Your applications, booked interviews first. */
export function Applications({ onGo }: { onGo: (businessId: string) => void }) {
  const { view } = useView();
  const work = workOf(view);
  if (!work || !work.applications.length) return null;
  const booked = work.applications.filter((a) => a.status === 'booked');
  const done = work.applications.filter((a) => a.status !== 'booked').slice(0, 4);
  return (
    <ul className="phone-list work-apps" aria-label={t('Applications')}>
      {booked.map((a) => (
        <li key={a.id} className="phone-card work-app" data-application={a.status}>
          <div className="work-app-head">
            <span className="work-app-icon" aria-hidden="true">
              {PROFESSION_ICON[a.profession] ?? '💼'}
            </span>
            <span className="phone-row-main">
              <span className="item-title">{tx(a.label)}</span>
              <span className="small muted">{a.employer}</span>
            </span>
            <Pill tone="info">{t('Interview booked')}</Pill>
          </div>
          <p className="small muted">{interviewBy(view, a)}</p>
          <Button size="sm" data-go-interview={a.businessId} onClick={() => onGo(a.businessId)}>
            {t('Go to interview')}
          </Button>
          <BriefToggle a={a} onGo={() => onGo(a.businessId)} />
        </li>
      ))}
      {done.map((a) => (
        <li key={a.id}>
          <Decision a={a} />
        </li>
      ))}
    </ul>
  );
}

/** Months of experience you have, by field (the ones you have any in). */
export function ExperienceLine() {
  const { view } = useView();
  const work = workOf(view);
  if (!work) return null;
  const xs = Object.entries(work.exp).filter(([, n]) => n > 0);
  return (
    <p className="small muted work-exp" data-experience="">
      {xs.length
        ? t('Your experience: {list}', {
            list: xs.map(([f, n]) => t('{field} {n} mo', { field: fieldTitle(f), n })).join(' · '),
          })
        : t('No work experience yet: entry roles (level 1) are open to you.')}
      {work.learnRate > 1 ? ` ${t('You learn fast: ×{n} experience.', { n: work.learnRate })}` : ''}
    </p>
  );
}

/** At the employer: the answer (once you've had the interview), the interview, the ladder. */
export function EmployerPanel({ businessId }: { businessId: string }) {
  const { view } = useView();
  const work = workOf(view);
  const e = work?.employers.find((x) => x.businessId === businessId);
  if (!work || !e) return null;
  const booked = work.applications.find(
    (a) => a.businessId === businessId && a.status === 'booked',
  );
  const last = work.applications.find(
    (a) =>
      a.businessId === businessId && a.status !== 'booked' && a.decidedMonth === view.market.month,
  );
  return (
    <div className="work-panel" data-employer={businessId}>
      {last && <Decision a={last} />}
      {booked?.level && <BriefToggle a={booked} />}
      {booked && <Interview key={booked.id} a={booked} />}
      <h3 className="phone-h">
        {PROFESSION_ICON[e.profession]} {t('Careers at {place}', { place: e.name })}
      </h3>
      <ExperienceLine />
      <EmployerNote e={e} />
      <Ladder e={e} />
    </div>
  );
}
