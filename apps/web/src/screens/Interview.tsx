/**
 * A customer interview (player feedback, round two: "When I click interview
 * customers I don't really interview"). Meet one person from a segment (who
 * they are, where, what you know), then three rounds: pick a question, they
 * answer in character, and your notes fill in (Pain, Pays now, Would switch
 * if). The summary is scored like a banker's call: each question with ✓ / ≈
 * / ✗ and why, the best question when you missed it, the question to ask
 * next time, and what it added to your customer understanding.
 *
 * Opened from the Market (the stall's "Interview a customer", the segment
 * cards) in feedback-note worlds. The engine keeps the interview under way
 * (`company.interview`), so closing the sheet and coming back picks it up.
 */
import { useState } from 'react';
import { Portrait } from '../avatar/Portrait';
import { money, pct } from '../format';
import { t, tx, useLang } from '../i18n';
import { useView, type Company } from '../store';
import { Button, Card, Segmented, Sheet } from '../ui';
import './convo.css';

type Interviews = NonNullable<Company['interviews']>;
type Person = Interviews['next'][number];
type Active = NonNullable<Interviews['active']>;
type Summary = NonNullable<Interviews['last']>;
type Line = { en: string; fr: string };
type Notes = Active['notes'];
type NoteKey = 'pain' | 'paysNow' | 'switchIf' | 'price';

/** Engine lines come in English and French. */
export function useLine() {
  const lang = useLang();
  return (l: Line | null | undefined) => (l ? (lang === 'fr' ? l.fr : l.en) : '');
}

export const kindLabel = (k: string) =>
  ({
    best: t('open · past'),
    broad: t('open · general'),
    yesno: t('yes/no'),
    leading: t('leading'),
    early: t('too early'),
  })[k] ?? k;

const noteLabel = (k: NoteKey) =>
  ({
    pain: t('Pain'),
    paysNow: t('Pays now'),
    switchIf: t('Would switch if'),
    price: t('Price'),
  })[k];

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** A 0–100 score as a ring (the banker's scored-call look). */
export function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const len = 2 * Math.PI * r;
  const tone = score >= 75 ? 'var(--good)' : score >= 50 ? 'var(--warn)' : 'var(--bad)';
  return (
    <svg
      className="score-ring"
      viewBox="0 0 84 84"
      width={84}
      height={84}
      role="img"
      aria-label={t('{n} out of 100', { n: score })}
      data-score={score}
    >
      <circle className="track" cx="42" cy="42" r={r} />
      <circle
        cx="42"
        cy="42"
        r={r}
        stroke={tone}
        strokeDasharray={`${(len * score) / 100} ${len}`}
        strokeLinecap="round"
        transform="rotate(-90 42 42)"
      />
      <text x="42" y="51" textAnchor="middle">
        {score}
      </text>
    </svg>
  );
}

export const markIcon = (m: string) => (m === 'good' ? '✓' : m === 'ok' ? '≈' : '✗');

/** The market scene behind the interviewee. */
function MarketScene({ caption }: { caption: string }) {
  return (
    <div className="convo-scene" aria-hidden="true">
      <svg viewBox="0 0 380 96" preserveAspectRatio="xMidYMid slice">
        <rect x="18" y="24" width="140" height="52" fill="#1e3a8a" />
        <path d="M10 24h156l-9-14H19z" fill="#dc2626" />
        <rect x="30" y="34" width="116" height="24" fill="#dbeafe" />
        <rect x="186" y="40" width="64" height="36" fill="#14532d" />
        <path d="M180 40h76l-6-10h-64z" fill="#f59e0b" />
        <rect x="196" y="48" width="44" height="20" fill="#fef3c7" />
        <rect x="276" y="18" width="104" height="58" fill="#7c3aed" />
        <rect x="276" y="12" width="104" height="8" fill="#22c55e" />
        <circle cx="352" cy="84" r="5" fill="#facc15" />
      </svg>
      <span className="convo-cap">📍 {caption}</span>
    </div>
  );
}

function PersonCard({ p, ln }: { p: Person | Active['person']; ln: (l: Line) => string }) {
  return (
    <div className="convo-person">
      <Portrait id={p.portraitId} bg="b-commercial" gender={p.gender} size={76} label={p.name} />
      <div>
        <h3>{p.name}</h3>
        <div className="small">{ln(p.job)}</div>
        <div className="small muted">{ln(p.detail)}</div>
      </div>
    </div>
  );
}

function NotesPanel({ notes, fresh }: { notes: Notes; fresh?: string | null }) {
  const ln = useLine();
  const keys: NoteKey[] = ['pain', 'paysNow', 'switchIf'];
  if (notes.price) keys.push('price');
  return (
    <dl className="notes" aria-label={t('Your notes')} data-notes>
      {keys.map((k) => (
        <div key={k} data-note={k}>
          <dt>{noteLabel(k)}:</dt>
          <dd className={notes[k] ? (fresh === k ? 'new' : '') : 'empty'}>
            {notes[k] ? ln(notes[k]) : t('not yet asked…')}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function InterviewSheet({
  companyId,
  segmentKey,
  onClose,
}: {
  companyId: string;
  segmentKey?: string;
  onClose: () => void;
}) {
  const { view, send, busy } = useView();
  const ln = useLine();
  const c = view.companies.find((x) => x.id === companyId);
  const iv = c?.interviews;
  const [seg, setSeg] = useState<string | undefined>(segmentKey);
  /** The round just asked, shown with its answer before the next one. */
  const [review, setReview] = useState<number | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [summary, setSummary] = useState(false);
  if (!c || !iv) return null;
  const cur = c.currency;
  const person = iv.next.find((p) => p.segmentKey === seg) ?? iv.next[0];
  const title = iv.active
    ? t('Customer interview · round {n} of {of}', {
        n: Math.min(iv.rounds, (review ?? iv.active.round) + 1),
        of: iv.rounds,
      })
    : summary && iv.last
      ? t('Customer interview · summary')
      : t('Customer interview');

  const start = () => {
    if (!person) return;
    setSummary(false);
    setReview(null);
    void send({
      type: 'company.interview',
      companyId,
      action: 'start',
      segmentKey: person.segmentKey,
    });
  };
  const ask = async (questionId: string, round: number) => {
    const r = await send<{ done: boolean; note: { key: string } | null }>({
      type: 'company.interview',
      companyId,
      action: 'ask',
      questionId,
    });
    if (!r) return;
    setFresh(r.note?.key ?? null);
    if (r.done) setSummary(true);
    else setReview(round);
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="convo" data-interview={iv.active ? 'round' : summary ? 'summary' : 'intro'}>
        {iv.active ? (
          <Rounds
            a={iv.active}
            review={review}
            fresh={fresh}
            busy={busy}
            onAsk={ask}
            onNext={() => setReview(null)}
          />
        ) : summary && iv.last ? (
          <SummaryView
            s={iv.last}
            c={c}
            left={iv.left}
            onNext={() => setSummary(false)}
            onClose={onClose}
          />
        ) : person ? (
          <>
            <Card>
              <MarketScene caption={`${person.place} · ${tx(person.segment)}`} />
              <PersonCard p={person} ln={ln} />
              <p className="bubble them">{ln(person.greeting)}</p>
            </Card>
            <Card title={t('How it works')} sub={t('{n} rounds', { n: iv.rounds })}>
              {iv.next.length > 1 && (
                <Segmented
                  label={t('Who to meet')}
                  value={person.segmentKey}
                  options={iv.next.map((p) => ({ value: p.segmentKey, label: tx(p.segment) }))}
                  onChange={(v) => setSeg(v)}
                />
              )}
              <ol className="small">
                <li>
                  {t('Pick a question. Open questions about real past events teach you most.')}
                </li>
                <li>{t('They answer in their own words; useful lines go in your notes.')}</li>
                <li>
                  {t('Leading questions (“Would you use…?”) get polite yeses that teach nothing.')}
                </li>
              </ol>
              <dl className="convo-known">
                <dt>{t('What you know about them')}</dt>
                <dd>{tx(person.needs)}</dd>
                <dt>{t('Customer understanding')}</dt>
                <dd data-understanding>{pct(person.understanding)}</dd>
                <dt>{t('Takes')}</dt>
                <dd>{t('{h}h · {amount}', { h: iv.hours, amount: money(iv.cost, cur) })}</dd>
                <dt>{t('Interviews left this month')}</dt>
                <dd>{iv.left}</dd>
              </dl>
              <Button
                onClick={start}
                disabled={busy || iv.left === 0 || view.me.hours.left < iv.hours}
              >
                {t('Start the interview')}
              </Button>
              {iv.left === 0 && (
                <p className="small muted">
                  {t('No more interviews this month. Come back next month.')}
                </p>
              )}
            </Card>
          </>
        ) : (
          <Card>
            <p className="small muted">{t('Nobody to interview in your sector here yet.')}</p>
          </Card>
        )}
      </div>
    </Sheet>
  );
}

function Rounds({
  a,
  review,
  fresh,
  busy,
  onAsk,
  onNext,
}: {
  a: Active;
  review: number | null;
  fresh: string | null;
  busy: boolean;
  onAsk: (id: string, round: number) => void;
  onNext: () => void;
}) {
  const ln = useLine();
  const shown = review ?? a.round;
  const asked = a.rounds.filter((r) => r.round < shown);
  const just = review !== null ? a.rounds[review] : undefined;
  const first = a.person.name.split(' ')[0]!;
  return (
    <>
      <Card>
        <div className="convo-head">
          <Portrait id={a.person.portraitId} bg="b-commercial" gender={a.person.gender} size={48} />
          <div>
            <strong>
              {first} · {ln(a.person.job).split(' · ')[0]}, {a.person.place}
            </strong>
            <div className="small muted">{t('Round {n} of {of}', { n: shown + 1, of: 3 })}</div>
          </div>
          <span className="round-dots" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <i key={i} className={i < a.round ? 'done' : i === shown ? 'now' : ''} />
            ))}
          </span>
        </div>
        <div className="chat" aria-label={t('The interview so far')}>
          {asked.map((r) => (
            <div key={r.round} className="chat" data-asked={r.round}>
              <p className="bubble me">{ln(r.question)}</p>
              <div className="who">
                <p className="bubble them">{ln(r.answer)}</p>
              </div>
            </div>
          ))}
        </div>
        {just ? (
          <>
            <h3 className="small">{t('Your question')}</h3>
            <ul className="convo-opts" data-round-review={just.round}>
              {just.offered.map((o, i) => (
                <li key={o.id}>
                  <div className={`convo-opt ${o.id === just.id ? 'is-on' : 'is-off'}`}>
                    <span className="convo-letter">{LETTERS[i]}</span>
                    <span>
                      {ln(o.text)}
                      <span className={`q-tag q-${o.kind}`} data-kind={o.kind}>
                        {kindLabel(o.kind)}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="who" data-answer>
              <p className="bubble them">{ln(just.answer)}</p>
            </div>
          </>
        ) : (
          <>
            <h3 className="small">{t('Ask')}</h3>
            <ul className="convo-opts" aria-label={t('Your next question')}>
              {a.options.map((o, i) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="convo-opt"
                    data-question={o.id}
                    disabled={busy}
                    onClick={() => onAsk(o.id, a.round)}
                  >
                    <span className="convo-letter">{LETTERS[i]}</span>
                    <span>{ln(o.text)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card title={t('📝 Your notes')}>
        <NotesPanel notes={a.notes} fresh={just ? fresh : null} />
      </Card>
      {just && <Button onClick={onNext}>{t('Round {n}', { n: just.round + 2 })}</Button>}
    </>
  );
}

function SummaryView({
  s,
  c,
  left,
  onNext,
  onClose,
}: {
  s: Summary;
  c: Company;
  left: number;
  onNext: () => void;
  onClose: () => void;
}) {
  const ln = useLine();
  const need = c.guide.stages[0]?.tasks.find((x) => x.id === 'idea.discovery')?.need ?? 20;
  return (
    <>
      <Card
        title={t('Interview done: {name}', { name: s.person.name.split(' ')[0]! })}
        sub={`${ln(s.person.job).split(' · ')[0]} · ${s.person.place}`}
      >
        <div className="convo-score" data-interview-score={s.score}>
          <ScoreRing score={s.score} />
          <div>
            <strong>
              {s.score} / 100 · {ln(s.grade)}
            </strong>
          </div>
        </div>
        <ul className="convo-marks" aria-label={t('Your questions')}>
          {s.rounds.map((r) => (
            <li key={r.round} data-mark={r.mark}>
              <span className={r.mark === 'good' ? 'good' : r.mark === 'ok' ? '' : 'bad'}>
                {markIcon(r.mark)}
              </span>{' '}
              {t('Round {n}', { n: r.round + 1 })} <b>{ln(r.question)}</b>
              {r.best && (
                <span className="muted"> {t('Best question: {q}', { q: ln(r.best) })}</span>
              )}
              <span className="why">💡 {ln(r.why)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t('Best question you missed')}>
        <div className="convo-ask">
          <div className="small good">
            <b>{t('ASK NEXT TIME')}</b>
          </div>
          {ln(s.missed.question)}
        </div>
        <p className="small">
          <b>{t('Because:')}</b> {ln(s.missed.why)}
        </p>
      </Card>
      <Card title={t('📝 What you learned')}>
        <NotesPanel notes={s.notes} />
      </Card>
      <Card title={t('Knowledge')} sub={tx(s.person.segment)}>
        <div className="k-gain" data-gain>
          <div>
            <div className="v">{pct(s.before)}</div>
            <div className="small muted">{t('before')}</div>
          </div>
          <div className="arr" aria-hidden="true">
            →
          </div>
          <div>
            <div className="v good">{pct(s.after)}</div>
            <div className="small muted">{t('customer understanding')}</div>
          </div>
        </div>
        <p className="small muted">
          {t(
            'The Idea stage needs {need}% · product fit grows faster as this rises · sales skill +1',
            {
              need,
            },
          )}
        </p>
        <div className="convo-actions">
          {left > 0 && (
            <Button onClick={onNext}>{t('Next interview ({n} left)', { n: left })}</Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('Done for today')}
          </Button>
        </div>
      </Card>
    </>
  );
}
