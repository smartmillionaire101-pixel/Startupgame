/**
 * Wave 12 §A: quiz night on your phone. A countdown, then each question with
 * a shrinking timer and four big answers; who's answered shows as it happens
 * (never what they picked), then the answer, everyone's points and the
 * scoreboard. The server scores every answer from when it arrived.
 */
import { useState } from 'react';
import { getLang, t } from '../i18n';
import type { Act } from './GamesHost';
import { Face } from './GamesHost';
import { packName } from './labels';
import { useTick, type Match } from './useMatch';

const LETTERS = ['A', 'B', 'C', 'D'];

export function Quiz({ g, act, now }: { g: Match; act: Act; now: () => number }) {
  const q = g.quiz;
  const on = g.status === 'playing';
  const tnow = useTick(now, 200, on);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const fr = getLang() === 'fr';
  const cur = q?.current ?? null;
  if (!q) return null;
  const me = g.seats.find((s) => s.you);
  const playing = !!me && !me.out;
  const sorted = [...g.seats].sort((a, b) => (q.scores[b.id] ?? 0) - (q.scores[a.id] ?? 0));

  if (g.status === 'settled')
    return (
      <section className="gm-quiz" aria-label={t('Answers')}>
        <h3 className="gm-sub">{t('The answers')}</h3>
        <ol className="gm-review">
          {(q.review ?? []).map((r, i) => (
            <li key={i}>
              <span className="small gm-muted">{packName(r.cat)}</span>
              <b>{fr ? r.fr : r.en}</b>
              <span className="gm-review-a">✓ {(fr ? r.optionsFr : r.options)[r.right]}</span>
            </li>
          ))}
        </ol>
      </section>
    );

  if (q.phase === 'countdown' || !cur) {
    const left = Math.max(0, Math.ceil(((q.until ?? tnow) - tnow) / 1000));
    return (
      <section className="gm-quiz gm-countdown" aria-live="polite" data-quiz-phase="countdown">
        <p className="gm-sub">{t('Get ready!')}</p>
        <b className="gm-count">{left || '…'}</b>
        <p className="small gm-muted">
          {t('{n} questions. Fast right answers score more.', { n: q.count })}
        </p>
      </section>
    );
  }

  const reveal = q.phase === 'reveal' || q.phase === 'over';
  const total = Math.max(1, cur.closeAt - cur.openAt);
  const leftMs = Math.max(0, cur.closeAt - tnow);
  const mineAnswer = cur.answers.find((a) => a.id === me?.id);
  const myChoice = mineAnswer?.choice ?? picked[cur.i] ?? null;
  const answeredCount = cur.answers.filter((a) => a.answered).length;
  const answer = (c: number) => {
    if (reveal || myChoice !== null || !playing) return;
    setPicked((p) => ({ ...p, [cur.i]: c }));
    void act({ type: 'game.play', gameId: g.id, move: { k: 'answer', q: cur.i, choice: c } });
  };
  const options = fr ? cur.optionsFr : cur.options;
  return (
    <section
      className={`gm-quiz${reveal ? ' is-reveal' : ''}`}
      data-quiz-phase={q.phase}
      data-question={cur.i}
    >
      <div className="gm-q-top">
        <span className="gm-q-n">{t('Question {n} of {m}', { n: cur.i + 1, m: q.count })}</span>
        <span className="gm-chip">{packName(cur.cat)}</span>
      </div>
      <div className="gm-timer" aria-hidden="true">
        <span style={{ transform: `scaleX(${reveal ? 0 : leftMs / total})` }} />
      </div>
      <p className="gm-q" aria-live="polite">
        {fr ? cur.fr : cur.en}
      </p>
      <div className="gm-answers" role="group" aria-label={t('Answers')}>
        {options.map((o, i) => {
          const right = reveal && cur.right === i;
          const wrong = reveal && myChoice === i && cur.right !== i;
          return (
            <button
              key={i}
              type="button"
              className={`gm-answer a${i}${myChoice === i ? ' is-mine' : ''}${right ? ' is-right' : ''}${wrong ? ' is-wrong' : ''}`}
              disabled={reveal || myChoice !== null || !playing}
              aria-pressed={myChoice === i}
              data-answer={i}
              onClick={() => answer(i)}
            >
              <span className="gm-letter">{LETTERS[i]}</span>
              <span>{o}</span>
              {right && <span aria-label={t('Right answer')}>✓</span>}
            </button>
          );
        })}
      </div>
      <p className="small gm-status" aria-live="polite">
        {reveal
          ? mineAnswer && mineAnswer.points
            ? t('Right! +{n} points', { n: mineAnswer.points })
            : playing
              ? myChoice === null
                ? t('Too slow!')
                : t('Not this time.')
              : t('The answer is {a}.', { a: options[cur.right ?? 0] ?? '' })
          : !playing
            ? t('You’re the quizmaster. {n} answered.', { n: answeredCount })
            : myChoice !== null
              ? t('Locked in. {n} of {m} answered.', { n: answeredCount, m: cur.answers.length })
              : t('{s}s left', { s: Math.ceil(leftMs / 1000) })}
      </p>
      <ol className="gm-scores" aria-label={t('Scoreboard')}>
        {sorted.map((s) => {
          const a = cur.answers.find((x) => x.id === s.id);
          return (
            <li key={s.id} className={s.you ? 'is-you' : ''} data-score-id={s.id}>
              <Face id={s.id} name={s.name} ai={s.ai} size={26} />
              <span className="gm-score-name">{s.you ? t('You') : s.name.split(' ')[0]}</span>
              <span
                className={`gm-dot${a?.answered ? ' on' : ''}`}
                aria-label={a?.answered ? t('answered') : t('thinking')}
              />
              {reveal && a?.points ? <span className="gm-plus">+{a.points}</span> : null}
              <b>{q.scores[s.id] ?? 0}</b>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
