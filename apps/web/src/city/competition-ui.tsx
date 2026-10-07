/**
 * Wave 10 §C: pitch competitions, the parts the phone's Competitions tab
 * and the stage scene share: the facts (sponsor, prize, date, venue,
 * judges, line-up), Enter with your company, Join the judges, and scoring
 * each pitch 1–10 as a judge.
 */
import { useState } from 'react';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button } from '../ui';
import type { CompetitionEntryView, CompetitionView } from './wave10';

export const sponsorKind = (k: string) =>
  ({ fund: t('a fund'), bank: t('a bank'), corporate: t('a company') })[k] ?? k;

/** Sponsor, prize, date, venue. */
export function CompetitionFacts({ c }: { c: CompetitionView }) {
  return (
    <div className="comp-facts">
      <div className="spread">
        <span className="small muted">
          {t('Sponsored by {sponsor} ({kind})', {
            sponsor: c.sponsor.name,
            kind: sponsorKind(c.sponsor.kind),
          })}
        </span>
        <b className="comp-prize" data-prize={c.prizePool}>
          🏆 {money(c.prizePool, c.currency)}
        </b>
      </div>
      <div className="small muted">
        {tx(c.dateLabel)} · {c.venue.name}, {c.venue.districtLabel}
      </div>
    </div>
  );
}

export function JudgesList({ c }: { c: CompetitionView }) {
  return (
    <ul className="comp-judges" aria-label={t('Judges')}>
      {c.judges.map((j) => (
        <li
          key={j.id}
          className={`comp-judge${j.kind === 'player' ? ' is-player' : ''}`}
          data-judge={j.kind}
        >
          <b>{j.name}</b>
          {j.you && <span className="pill pill-info">{t('you')}</span>}
          <span className="small muted">
            {j.org} · {j.kind === 'player' ? t('player') : t('AI investor')}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Score a pitch 1–10 (judges only). */
export function ScorePicker({ c, e }: { c: CompetitionView; e: CompetitionEntryView }) {
  const { send, busy } = useView();
  const score = (n: number) =>
    void send<{ message?: string }>(
      { type: 'competition.score', competitionId: c.id, entryId: e.id, score: n },
      (r) => (r?.message ? tx(r.message) : t('Scored.')),
    );
  return (
    <div
      className="score-picker"
      role="group"
      aria-label={t('Score {company}', { company: e.companyName })}
    >
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className={`score-btn${e.myScore === n ? ' on' : ''}`}
          aria-pressed={e.myScore === n}
          aria-label={t('{n} out of 10', { n })}
          disabled={busy}
          onClick={() => score(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** Enter with a company you run, or join the judges. */
export function CompetitionActions({ c }: { c: CompetitionView }) {
  const { view, send, busy } = useView();
  const mine = view.companies.filter((x) => x.status === 'active');
  const [companyId, setCompanyId] = useState(mine[0]?.id ?? '');
  if (c.status !== 'open') return null;
  const you = c.you;
  return (
    <div className="comp-actions">
      {you.entryId ? (
        <p className="small good" data-entered>
          {t('You’re in the line-up. Results when the month ends.')}
        </p>
      ) : mine.length > 0 && view.me.role !== 'investor' ? (
        <>
          {mine.length > 1 && (
            <select
              aria-label={t('Company to enter')}
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              {mine.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <Button
            disabled={busy || !you.canEnter}
            onClick={() =>
              void send<{ message?: string }>(
                { type: 'competition.enter', competitionId: c.id, companyId },
                (r) => (r?.message ? tx(r.message) : t('You’re in.')),
              )
            }
          >
            {t('Enter with {company}', {
              company: mine.find((m) => m.id === companyId)?.name ?? mine[0]!.name,
            })}
          </Button>
          {you.enterReason && <p className="small bad">{tx(you.enterReason)}</p>}
        </>
      ) : null}
      {you.judging ? (
        <p className="small good" data-judging>
          {you.toScore
            ? t('You’re judging: {n} pitches to score.', { n: you.toScore })
            : t('You’re judging, and you’ve scored every pitch.')}
        </p>
      ) : view.me.role === 'investor' || you.canJudge ? (
        <>
          <Button
            variant="secondary"
            disabled={busy || !you.canJudge}
            onClick={() =>
              void send<{ message?: string }>(
                { type: 'competition.judge.join', competitionId: c.id },
                (r) => (r?.message ? tx(r.message) : t('You’re on the panel.')),
              )
            }
          >
            {t('Join as a judge')}
          </Button>
          {you.judgeReason && <p className="small bad">{tx(you.judgeReason)}</p>}
        </>
      ) : null}
    </div>
  );
}

/** The final standings: rank, company, every judge's card, average, prize. */
export function Standings({ c }: { c: CompetitionView }) {
  const ranked = c.entries.slice().sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  return (
    <ol className="comp-standings" aria-label={t('Results')}>
      {ranked.map((e) => (
        <li
          key={e.id}
          className={`comp-standing${e.rank === 1 ? ' is-winner' : ''}${e.you ? ' is-you' : ''}`}
          data-rank={e.rank ?? ''}
          data-entry={e.id}
        >
          <span className="comp-rank">{e.rank === 1 ? '🏆' : `#${e.rank}`}</span>
          <span className="comp-standing-main">
            <b>{e.companyName}</b>
            {e.you && <span className="pill pill-info">{t('you')}</span>}
            <span className="small muted">{e.founder.name}</span>
            <span className="comp-cards" aria-label={t('Scores')}>
              {(e.scores ?? []).map((s, i) => (
                <span key={i} className="comp-card" title={c.judges[i]?.name}>
                  {s.score ?? '–'}
                </span>
              ))}
            </span>
          </span>
          <span className="comp-standing-end">
            <b>{e.total ?? '–'}/10</b>
            {!!e.prize && <span className="small good">+{money(e.prize, c.currency)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
