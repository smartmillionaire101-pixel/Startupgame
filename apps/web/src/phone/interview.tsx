/**
 * Interviews by level (engine work.ts + data/interviews.ts, the feedback
 * round): the interview brief (what they test, the bar, the key concepts
 * with short worked examples, Study), the interview itself (one question at
 * a time, a case step by step), and the review after the answer (your score
 * against the pass mark, each answer against the best one and why, the hard
 * checks, what to re-read, Study again and when you can re-apply).
 */
import { useState } from 'react';
import { t, tx, useLang } from '../i18n';
import { useView } from '../store';
import { Button, Pill } from '../ui';
import { looseCmd } from '../city/life';
import { fieldIn, skillName, whyLine, workOf, type Work } from './work';
import './interview.css';

type Application = Work['applications'][number];
type Level = NonNullable<Application['level']>;
type Review = NonNullable<Level['review']>;

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** "3 questions" / "2 questions and a case in 3 steps". */
function shape(lv: Level): string {
  const c = lv.cases[0];
  if (!c) return t('{n} questions', { n: lv.questions });
  return t('{n} questions and a case in {steps} steps', { n: lv.questions, steps: c.steps });
}

/** Study the brief (a couple of hours, a capped bonus). */
function StudyButton({ a, again = false }: { a: Application; again?: boolean }) {
  const { view, send, busy } = useView();
  const lv = a.level!;
  const work = workOf(view);
  const capped = lv.studied >= lv.studyCap;
  const tooFew = (work?.hoursLeft ?? 0) < lv.studyHours;
  const study = () =>
    void send(looseCmd({ type: 'job.study', applicationId: a.id }), () =>
      t('Studied: +{n} points at the interview.', { n: (lv.studied + 1) * lv.studyPoints }),
    );
  return (
    <Button block data-study={lv.studied} disabled={busy || capped || tooFew} onClick={study}>
      {capped
        ? t('Studied: you know this brief')
        : tooFew
          ? t('Studying takes {h}h; you have {left}h left', {
              h: lv.studyHours,
              left: Math.floor(work?.hoursLeft ?? 0),
            })
          : again
            ? t('Study again ({h}h)', { h: lv.studyHours })
            : t('Study {h}h · +{n} points at the interview', {
                h: lv.studyHours,
                n: lv.studyPoints,
              })}
    </Button>
  );
}

/** One line of "What they test": a check, what it needs, and whether you meet it. */
function Check({
  ok,
  title,
  text,
  value,
}: {
  ok: boolean;
  title: string;
  text: string;
  value: string;
}) {
  return (
    <li className={`work-check ${ok ? 'is-ok' : 'is-short'}`} data-check={ok ? 'ok' : 'short'}>
      <span className="work-check-mark" aria-hidden="true">
        {ok ? '✓' : '!'}
      </span>
      <span className="work-check-main">
        <strong>{title}</strong> {text}
      </span>
      <span className="work-check-value">{value}</span>
    </li>
  );
}

/** The interview brief: what they test, the bar, the key concepts, Study. */
export function InterviewBrief({ a, onGo }: { a: Application; onGo?: () => void }) {
  const fr = useLang() === 'fr';
  const lv = a.level;
  if (!lv) return null;
  const c = lv.checks;
  const monthsOk = c.monthsHave >= c.monthsNeed;
  const skillOk = !c.skillBar || c.skillHave >= c.skillNeed;
  const minutes = Math.max(5, lv.concepts.length * 2);
  return (
    <section className="work-brief" data-brief={a.id} aria-label={t('Interview brief')}>
      <div className="work-brief-card">
        <div className="work-brief-head">
          <div>
            <h3 className="phone-h">{t('What they test')}</h3>
            <p className="small muted">
              {t('Level {n} of {of} · {shape}', {
                n: lv.level,
                of: lv.levels.length,
                shape: shape(lv),
              })}
            </p>
          </div>
          <Pill tone={lv.studied ? 'good' : 'warn'}>
            {lv.studied ? t('Studied: +{n} points', { n: lv.bonus }) : t('Not studied yet')}
          </Pill>
        </div>
        <ol className="work-ladder-chips" aria-label={t('The ladder')}>
          {lv.levels.map((l, i) => (
            <li
              key={l}
              className={i + 1 === lv.level ? 'is-on' : i + 1 < lv.level ? 'is-below' : ''}
            >
              {i + 1 < lv.level ? '✓ ' : ''}
              {tx(l)}
            </li>
          ))}
        </ol>
        <ul className="work-checks">
          <Check
            ok={monthsOk}
            title={t('Experience')}
            text={
              c.monthsNeed
                ? t('{need} months {field} needed; you have {have}.', {
                    need: c.monthsNeed,
                    have: c.monthsHave,
                    field: fieldIn(c.field),
                  })
                : t('No experience needed at this level.')
            }
            value={t('{have}/{need} mo', { have: c.monthsHave, need: c.monthsNeed })}
          />
          <Check
            ok={skillOk}
            title={t('{skill} skill', { skill: skillName(c.skill) })}
            text={
              c.skillBar
                ? t('They look for {need}; yours is {have}.', {
                    need: c.skillNeed,
                    have: c.skillHave,
                  })
                : t('Counts toward your score (no minimum here); yours is {have}.', {
                    have: c.skillHave,
                  })
            }
            value={c.skillBar ? `${c.skillHave}/${c.skillNeed}` : String(c.skillHave)}
          />
          <Check
            ok
            title={t('Pass mark')}
            text={t('Score {n} or more to get the offer.', { n: lv.passMark })}
            value={String(lv.passMark)}
          />
        </ul>
      </div>
      <div className="work-brief-card">
        <h3 className="phone-h">{t('Key concepts')}</h3>
        <p className="small muted">
          {t('{n} · read in {m} min', { n: lv.concepts.length, m: minutes })}
        </p>
        <ol className="work-concepts">
          {lv.concepts.map((k, i) => (
            <li key={k.id} className="work-concept" data-concept={k.id}>
              <div className="item-title">
                {i + 1} · {fr ? k.fr.title : k.title}
              </div>
              <p className="small muted">{fr ? k.fr.body : k.body}</p>
              <p className="small work-example">{fr ? k.fr.example : k.example}</p>
            </li>
          ))}
        </ol>
        <StudyButton a={a} />
        {onGo && (
          <Button block variant="secondary" data-go-brief={a.businessId} onClick={onGo}>
            {t('Go to the interview')}
          </Button>
        )}
      </div>
    </section>
  );
}

/** The brief behind a button (in the Jobs app and at the employer). */
export function BriefToggle({ a, onGo }: { a: Application; onGo?: () => void }) {
  const [open, setOpen] = useState(false);
  if (!a.level) return null;
  return (
    <div className="work-brief-toggle">
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={open}
        data-read-brief={a.id}
        onClick={() => setOpen((x) => !x)}
      >
        {open ? t('Hide the brief') : t('Read the brief')}
      </Button>
      {open && <InterviewBrief a={a} onGo={onGo} />}
    </div>
  );
}

/** The interview by level: one question at a time, a case step by step. */
export function LevelInterview({ a }: { a: Application }) {
  const { view, send, busy } = useView();
  const fr = useLang() === 'fr';
  const work = workOf(view);
  const lv = a.level!;
  const flat = lv.items.flatMap((item, i) => item.steps.map((step, k) => ({ item, i, k, step })));
  const [answers, setAnswers] = useState<(number | null)[]>(() => flat.map(() => null));
  const [pos, setPos] = useState(0);
  if (!work || !flat.length) return null;
  const cur = flat[Math.min(pos, flat.length - 1)]!;
  const last = pos >= flat.length - 1;
  const tooFew = work.hoursLeft < work.interviewHours;
  const qNo = lv.items.slice(0, cur.i + 1).filter((x) => x.kind === 'question').length;
  const pick = (n: number) => setAnswers((xs) => xs.map((x, j) => (j === pos ? n : x)));
  const finish = () =>
    void send(
      looseCmd({ type: 'job.interview', applicationId: a.id, answers: answers as number[] }),
      (r: { hired?: boolean } | null) =>
        r?.hired ? t('You got the job at {place}.', { place: a.employer }) : null,
    );
  const words = (s: (typeof flat)[number]['step']) =>
    fr ? { text: s.fr.text, options: s.fr.options } : { text: s.text, options: s.options };
  const options = (s: (typeof flat)[number]['step'], j: number) => (
    <div className="work-options" role="radiogroup" aria-label={words(s).text}>
      {words(s).options.map((o, n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={answers[j] === n}
          className={`work-option work-option-lettered${answers[j] === n ? ' is-on' : ''}`}
          onClick={() => pick(n)}
        >
          <span className="work-letter">{LETTERS[n]}</span>
          {o}
        </button>
      ))}
    </div>
  );
  const item = cur.item;
  const caseTitle = item.kind === 'case' ? (fr ? item.fr?.title : item.title) : null;
  return (
    <section
      className="work-interview work-level-interview"
      data-level={lv.level}
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
          <div className="small muted" data-progress={`${pos + 1}/${flat.length}`}>
            {item.kind === 'case'
              ? t('{place} · the case, step {n} of {of}', {
                  place: a.employer,
                  n: cur.k + 1,
                  of: item.steps.length,
                })
              : t('{place} · question {n} of {of}', {
                  place: a.employer,
                  n: qNo,
                  of: lv.questions,
                })}
          </div>
        </div>
      </div>
      {item.kind === 'case' ? (
        <div className="work-case" data-case={item.id}>
          <div className="item-title">{caseTitle}</div>
          <p className="small muted">{t('{n} steps', { n: item.steps.length })}</p>
          <p className="work-case-setup">{fr ? item.fr?.setup : item.setup}</p>
          <ol className="work-case-steps">
            {item.steps.map((s, k) => {
              const j = flat.findIndex((f) => f.step.id === s.id);
              const state = k < cur.k ? 'done' : k === cur.k ? 'now' : 'later';
              return (
                <li key={s.id} className={`work-case-step is-${state}`} data-step={s.id}>
                  <p className="work-q">
                    {k + 1} · {words(s).text}
                    {state === 'done' && answers[j] !== null ? ' ✓' : ''}
                  </p>
                  {state === 'done' && answers[j] !== null && (
                    <p className="small muted">
                      {t('You: {answer}', { answer: words(s).options[answers[j]!]! })}
                    </p>
                  )}
                  {state === 'now' && options(s, j)}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div className="work-question" data-step={cur.step.id}>
          <div className="item-title">{t('Question {n}', { n: qNo })}</div>
          <p className="small muted">{t('one call')}</p>
          <p className="work-q">{words(cur.step).text}</p>
          {options(cur.step, pos)}
        </div>
      )}
      <div className="work-interview-nav">
        {pos > 0 && (
          <Button variant="secondary" data-back="" onClick={() => setPos(pos - 1)}>
            {t('Back')}
          </Button>
        )}
        {last ? (
          <Button
            data-finish=""
            disabled={busy || tooFew || !a.canAttend || answers.some((x) => x === null)}
            onClick={finish}
          >
            {tooFew
              ? t('The interview takes {h}h; you have {left}h left', {
                  h: work.interviewHours,
                  left: Math.floor(work.hoursLeft),
                })
              : t('Finish the interview')}
          </Button>
        ) : (
          <Button data-next="" disabled={answers[pos] === null} onClick={() => setPos(pos + 1)}>
            {item.kind === 'case' && cur.k < item.steps.length - 1 ? t('Next step') : t('Next')}
          </Button>
        )}
      </div>
      <p className="small muted">
        {t('{n} answers in all · about {h}h · pass mark {pass}', {
          n: flat.length,
          h: work.interviewHours,
          pass: lv.passMark,
        })}
      </p>
    </section>
  );
}

/** The score ring: your score against the pass mark. */
function ScoreRing({ score, pass }: { score: number; pass: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const ok = score >= pass;
  return (
    <svg
      className={`work-ring ${ok ? 'is-ok' : 'is-short'}`}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <circle className="work-ring-track" cx="32" cy="32" r={r} />
      <circle
        className="work-ring-fill"
        cx="32"
        cy="32"
        r={r}
        strokeDasharray={`${(c * Math.max(0, Math.min(100, score))) / 100} ${c}`}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle">
        {score}
      </text>
    </svg>
  );
}

/** One line of the review summary. */
function summary(rv: Review, hired: boolean): string {
  const right = rv.steps.filter((s) => s.right).length;
  if (hired) return t('{right} of {n} answers were the best call.', { right, n: rv.steps.length });
  if (rv.checks.length) return t('The hard checks decided it, whatever the answers.');
  return t('{right} of {n} answers were the best call: the rest let you down.', {
    right,
    n: rv.steps.length,
  });
}

/** After a levelled interview: the score, each answer against the best one, the checks, what to study. */
export function LevelReview({ a }: { a: Application }) {
  const { view } = useView();
  const fr = useLang() === 'fr';
  const work = workOf(view);
  const lv = a.level!;
  const rv = lv.review!;
  const hired = a.status === 'hired';
  const e = work?.employers.find((x) => x.businessId === a.businessId);
  const holding = !!view.me.job;
  return (
    <section
      className={`work-decision work-review ${hired ? 'is-hired' : 'is-rejected'}`}
      data-decision={a.status}
      data-review={rv.score}
      aria-label={hired ? t('Hired') : t('Not this time')}
    >
      <div className="work-decision-head">
        <span aria-hidden="true">{hired ? '🎉' : '✋'}</span>
        <div>
          <div className="item-title">
            {hired
              ? a.promotion
                ? t('Promoted: {role}', { role: tx(a.label) })
                : t('Hired: {role}', { role: tx(a.label) })
              : t('Not this time: {role}', { role: tx(a.label) })}
          </div>
          <div className="small muted">{a.employer}</div>
        </div>
      </div>
      <div className="work-review-score">
        <ScoreRing score={rv.score} pass={rv.passMark} />
        <div>
          <div className="item-title" data-score="">
            {t('{score} / 100 · pass mark {pass}', { score: rv.score, pass: rv.passMark })}
          </div>
          <p className="small muted">{summary(rv, hired)}</p>
          {rv.bonus > 0 && (
            <p className="small muted">
              {t('Studying the brief added {n} points.', { n: rv.bonus })}
            </p>
          )}
        </div>
      </div>
      {a.why && <p className="work-reason">{whyLine(a.why)}</p>}
      <ol className="work-review-steps">
        {rv.steps.map((s) => {
          const w = fr ? s.fr : s;
          return (
            <li
              key={s.id}
              className={`work-review-step ${s.right ? 'is-right' : 'is-wrong'}`}
              data-review-step={s.id}
              data-right={s.right ? 'yes' : 'no'}
            >
              <p className="small">
                <span className="work-review-mark" aria-hidden="true">
                  {s.right ? '✓' : '✕'}
                </span>{' '}
                {w.case ? `${w.case} · ` : ''}
                {w.case ? t('Step {n}', { n: s.at }) : t('Question {n}', { n: s.at })}{' '}
                <strong>{w.choice}</strong>
                {!s.right && <> {t('Best call: {best}.', { best: w.best })}</>}
              </p>
              <p className="small muted work-review-why">
                💡 {s.right ? t('Right: {why}', { why: w.why }) : w.choiceWhy}
              </p>
              {!s.right && (
                <p className="small muted work-review-why">
                  {t('Why the best call works: {why}', { why: w.why })}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {rv.checks.length > 0 && (
        <ul className="work-checks">
          {rv.checks.map((c, i) => (
            <li key={i} className="work-check is-short" data-check="short">
              <span className="work-check-mark" aria-hidden="true">
                !
              </span>
              <span className="work-check-main">{whyLine(c)}</span>
            </li>
          ))}
        </ul>
      )}
      {!hired && (
        <div className="work-brief-card work-again" data-try-again="">
          <h3 className="phone-h">{t('Before you try again')}</h3>
          {rv.study.length > 0 ? (
            <ol className="work-study-list">
              {rv.study.map((s) => (
                <li key={s.id}>{t('Re-read: {concept}', { concept: fr ? s.fr : s.title })}</li>
              ))}
            </ol>
          ) : (
            <p className="small muted">
              {t('Your answers were right: build the experience first.')}
            </p>
          )}
          <div className="work-again-actions">
            <StudyButton a={a} again />
            {e?.cooldownUntil && (
              <Button block variant="subtle" disabled data-reapply="">
                {t('Re-apply next month')}
              </Button>
            )}
          </div>
          {holding && <p className="small muted">{t('You keep your current job.')}</p>}
        </div>
      )}
    </section>
  );
}
