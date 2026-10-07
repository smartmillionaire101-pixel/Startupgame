/**
 * Wave 10 §C: a pitch competition on stage. While it's open, the line-up
 * pitches in turn (the slide shows each company and its idea, the founder at
 * the podium, the judges at their table; your own scores show as you give
 * them) and the tray lets you enter, join the judges or score. Once judged
 * (at the month's settlement), the reveal: each pitch, then every judge
 * raises a card, one by one; then the winner's moment (spotlight, trophy,
 * cheque, confetti) and the standings. Skip jumps to the results. 3D on the
 * interiors kit, a drawing in Lite.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { reduceMotion } from '../ui';
import { use3d } from '../three-kit/quality';
import { AvatarFigure, avatarLook, type AvatarLook } from './art';
import { hash } from './contract';
import { genderOf } from './life';
import { CompetitionActions, CompetitionFacts, ScorePicker, Standings } from './competition-ui';
import { competitionsHere, type CompetitionView } from './wave10';
import type { Competition3DFrame } from '../interiors3d/Competition3D';
import './wave10.css';

const Competition3D = lazy(() =>
  import('../interiors3d/Competition3D').catch(() => ({ default: () => null })),
);

const PITCH_MS = 1700;
const CARD_MS = 480;
const HOLD_MS = 700;
const CROWN_MS = 4200;
const LOOP_MS = 3800;
const CROWD_BG = [
  'f-engineer',
  'f-dropout',
  'i-first',
  'b-commercial',
  'f-corporate',
  'i-operator',
  'b-fintech',
];

type Phase = 'live' | 'reveal' | 'crown' | 'results';

export function CompetitionScene({ id, onClose }: { id: string; onClose: () => void }) {
  const { view } = useView();
  const c = competitionsHere(view).find((x) => x.id === id) ?? null;
  if (!c)
    return (
      <div
        className="place-scene comp-scene"
        role="dialog"
        aria-modal="true"
        aria-label={t('Pitch competition')}
      >
        <header className="place-head">
          <div className="place-title">
            <h2>{t('Pitch competition')}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
            ✕
          </button>
        </header>
        <p className="tech-gone">{t('That competition isn’t on here.')}</p>
      </div>
    );
  // A new stage when it's judged while you watch: the reveal starts from the top.
  return <Stage key={c.status} c={c} onClose={onClose} />;
}

function Stage({ c, onClose }: { c: CompetitionView; onClose: () => void }) {
  const { view } = useView();
  const judged = c.status === 'judged';
  const entries = c.entries;
  const judges = c.judges;
  const reduced = reduceMotion();
  // The phase and how long it has run (ms); a judged competition starts on the reveal.
  const [clock, setClock] = useState<{ phase: Phase; ms: number }>({
    phase: judged ? (reduced ? 'results' : 'reveal') : 'live',
    ms: 0,
  });
  const phase = clock.phase;
  const setPhase = (p: Phase) => setClock({ phase: p, ms: 0 });
  // The reveal runs in line-up order; the winner last.
  const perEntry = PITCH_MS + CARD_MS * judges.length + HOLD_MS;
  const revealMs = perEntry * entries.length;
  const winnerIdx = Math.max(
    0,
    entries.findIndex((e) => e.id === c.winner?.entryId),
  );
  const me = avatarLook(view.me.background?.id, view.me.id, genderOf(view.me));

  useEffect(() => {
    if (phase === 'results') return;
    const start = performance.now();
    const id = window.setInterval(() => {
      const el = performance.now() - start;
      if (phase === 'reveal' && el >= revealMs) setClock({ phase: 'crown', ms: 0 });
      else if (phase === 'crown' && el >= CROWN_MS) setClock({ phase: 'results', ms: 0 });
      else setClock((k) => (k.phase === phase ? { phase, ms: el } : k));
    }, 120);
    return () => window.clearInterval(id);
  }, [phase, revealMs]);

  const el = clock.ms;
  const n = Math.max(1, entries.length);
  let f: Competition3DFrame & { step: number };
  if (phase === 'live') {
    const i = Math.floor(el / LOOP_MS) % n;
    const e = entries[i];
    f = {
      entry: i,
      cards: judges.map((j) => (j.you && e?.myScore ? String(e.myScore) : null)),
      winner: null,
      prize: null,
      step: 0,
    };
  } else if (phase === 'reveal') {
    const i = Math.min(n - 1, Math.floor(el / perEntry));
    const into = el - i * perEntry;
    const up =
      into < PITCH_MS ? 0 : Math.min(judges.length, Math.floor((into - PITCH_MS) / CARD_MS) + 1);
    const e = entries[i];
    f = {
      entry: i,
      cards: judges.map((_, j) => (j < up ? String(e?.scores?.[j]?.score ?? '–') : null)),
      winner: null,
      prize: null,
      step: into < PITCH_MS ? 1 : 2,
    };
  } else {
    const w = entries[winnerIdx];
    f = {
      entry: winnerIdx,
      cards: judges.map(() => null),
      winner: winnerIdx,
      prize: w?.prize ? money(w.prize, c.currency) : null,
      step: 3,
    };
  }
  // The 3D view reads the latest frame each time it draws.
  const frameRef = useRef(f);
  useEffect(() => {
    frameRef.current = f;
  });
  const getFrame = useCallback(() => frameRef.current, []);
  const current = entries[f.entry];
  const want3d = use3d();
  const [ready3d, setReady3d] = useState(false);
  const audience: AvatarLook[] = useMemo(
    () =>
      Array.from({ length: 14 }, (_, k) =>
        avatarLook(CROWD_BG[hash(`${c.id}:${k}`) % CROWD_BG.length], `${c.id}:crowd:${k}`),
      ),
    [c.id],
  );
  const entries3d = entries.map((e) => ({
    id: e.id,
    company: e.companyName,
    idea: e.idea,
    founder: e.you ? me : avatarLook('f-engineer', e.founder.id),
    you: e.you,
  }));
  const judges3d = judges.map((j) => ({
    id: j.id,
    name: j.name,
    org: j.org,
    ai: j.kind === 'ai',
    look: j.you ? me : avatarLook(j.kind === 'ai' ? 'i-first' : 'i-exited', j.id),
  }));

  const caption =
    phase === 'live'
      ? t('On stage: {company}', { company: current?.companyName ?? '' })
      : phase === 'reveal'
        ? f.step === 1
          ? t('{founder} pitches {company}', {
              founder: current?.founder.name ?? '',
              company: current?.companyName ?? '',
            })
          : t('The judges score {company}', { company: current?.companyName ?? '' })
        : phase === 'crown'
          ? t('And the winner is… {company}!', { company: c.winner?.companyName ?? '' })
          : t('The results');
  const mine = entries.find((e) => e.you);

  return (
    <div
      className={`place-scene comp-scene phase-${phase}`}
      role="dialog"
      aria-modal="true"
      aria-label={c.name}
      data-competition={c.id}
      data-status={c.status}
      data-phase={phase}
    >
      <header className="place-head">
        <div className="place-title">
          <h2>{c.name}</h2>
          <span className="small muted">
            {c.venue.name} · {tx(c.dateLabel)}
          </span>
        </div>
        <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
          ✕
        </button>
      </header>
      <div className={`place-room comp-room${want3d && ready3d ? ' is-3d' : ''}`}>
        {want3d && entries.length > 0 && (
          <Suspense fallback={null}>
            <Competition3D
              title={c.name}
              pitchLabel={(n, m) => t('Pitch {n} of {m}', { n, m })}
              winnerLabel={t('Winner')}
              entries={entries3d}
              judges={judges3d}
              audience={audience}
              frame={getFrame}
              onReady={() => setReady3d(true)}
            />
          </Suspense>
        )}
        <CompetitionArt c={c} f={f} me={me} />
        {phase === 'crown' && <div className="confetti" aria-hidden="true" />}
        <div className="act-hud" data-act-hud="">
          <p className="act-caption" aria-live="polite">
            <b>{t('Pitch competition')}</b>
            <span data-comp-caption="">{caption}</span>
          </p>
          {(phase === 'reveal' || phase === 'crown') && (
            <button type="button" className="act-skip" onClick={() => setPhase('results')}>
              {t('Skip')} <span aria-hidden="true">›</span>
            </button>
          )}
        </div>
      </div>
      <div className="place-tray comp-tray">
        {phase === 'live' && (
          <section className="comp-live" aria-label={t('The competition')}>
            <CompetitionFacts c={c} />
            <p className="small">
              {t('{n} startups pitch to {j} judges. Scores are revealed when the month ends.', {
                n: entries.length,
                j: judges.length,
              })}
            </p>
            {c.you.judging && current && !current.you && <ScorePicker c={c} e={current} />}
            <CompetitionActions c={c} />
          </section>
        )}
        {(phase === 'reveal' || phase === 'crown') && (
          <p className="act-playing">
            <span aria-hidden="true">🎤</span> {t('The judges’ scores')}
          </p>
        )}
        {phase === 'results' && (
          <section className="comp-results" role="status" data-result="">
            {c.status === 'cancelled' ? (
              <p>{t('No one entered, so it was called off.')}</p>
            ) : (
              <>
                <h3>
                  {t('{company} wins {prize}', {
                    company: c.winner?.companyName ?? '',
                    prize: money(entries[winnerIdx]?.prize ?? 0, c.currency),
                  })}
                </h3>
                {mine && (
                  <p className={mine.rank === 1 ? 'good' : 'small'} data-my-rank={mine.rank ?? ''}>
                    {mine.rank === 1
                      ? t('You won! {score}/10 from the judges.', { score: mine.total ?? '–' })
                      : t('{company} came #{rank} with {score}/10.', {
                          company: mine.companyName,
                          rank: mine.rank ?? '–',
                          score: mine.total ?? '–',
                        })}
                  </p>
                )}
                {c.interest && (
                  <p className="small">
                    {t('{name} wants to meet the winner.', { name: c.interest.name })}
                  </p>
                )}
                <Standings c={c} />
              </>
            )}
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {t('Done')}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

/** Lite: the hall drawn flat, same moments. */
function CompetitionArt({
  c,
  f,
  me,
}: {
  c: CompetitionView;
  f: Competition3DFrame;
  me: AvatarLook;
}) {
  const e = c.entries[f.entry];
  const crowning = f.winner !== null;
  const founderLook = e ? (e.you ? me : avatarLook('f-engineer', e.founder.id)) : me;
  const n = c.judges.length;
  return (
    <svg
      className="comp-art"
      viewBox="0 0 360 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="360" height="300" fill="#1e1b4b" />
      <rect y="150" width="360" height="150" fill="#0f172a" />
      {/* The slide */}
      <rect x="40" y="14" width="210" height="104" rx="6" fill="#0b1020" stroke="#334155" />
      <rect x="46" y="20" width="198" height="92" rx="3" fill={crowning ? '#b45309' : '#4338ca'} />
      <text x="56" y="38" className="comp-slide-kicker">
        {crowning ? t('Winner') : t('Pitch {n} of {m}', { n: f.entry + 1, m: c.entries.length })}
      </text>
      <text x="56" y="66" className="comp-slide-title" data-slide={e?.companyName ?? ''}>
        {(e?.companyName ?? '').slice(0, 16)}
      </text>
      <text x="56" y="86" className="comp-slide-idea">
        {(e?.idea ?? '').slice(0, 40)}
      </text>
      <text x="56" y="100" className="comp-slide-idea">
        {(e?.idea ?? '').slice(40, 80)}
      </text>
      {/* Stage, podium, founder */}
      <path d="M10 160 L350 160 L330 134 L30 134 Z" fill="#4c1d95" />
      <rect x="10" y="160" width="340" height="8" fill="#2e1065" />
      <ellipse cx="270" cy="134" rx="70" ry="40" fill="#fef3c7" opacity={crowning ? 0.35 : 0.18} />
      <g transform="translate(262 152) scale(2)">
        <AvatarFigure look={founderLook} />
      </g>
      <rect x="284" y="118" width="26" height="36" rx="3" fill="#1f2937" />
      <rect x="282" y="114" width="30" height="6" rx="2" fill="#6d28d9" />
      {crowning && (
        <text x="236" y="96" className="comp-trophy">
          🏆
        </text>
      )}
      {/* Judges' table */}
      <rect x="30" y="196" width="300" height="26" rx="3" fill="#f8fafc" />
      <rect x="30" y="208" width="300" height="14" fill="#6d28d9" />
      {c.judges.map((j, i) => {
        const x = 30 + ((i + 0.5) * 300) / Math.max(1, n);
        const card = f.cards[i];
        return (
          <g key={j.id} className="comp-judge-2d" data-judge-card={card ?? ''}>
            <circle cx={x} cy="186" r="9" fill={j.kind === 'player' ? '#a78bfa' : '#94a3b8'} />
            <text x={x} y="219" textAnchor="middle" className="comp-judge-name">
              {j.name.split(' ')[0]}
            </text>
            {card !== null && (
              <g className="comp-card-up">
                <rect
                  x={x - 11}
                  y="150"
                  width="22"
                  height="26"
                  rx="2"
                  fill="#fff"
                  stroke="#1e293b"
                />
                <text x={x} y="169" textAnchor="middle" className="comp-card-n">
                  {card}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {/* Audience */}
      {Array.from({ length: 16 }, (_, i) => (
        <circle
          key={i}
          cx={20 + (i % 8) * 46 + (i > 7 ? 20 : 0)}
          cy={i > 7 ? 284 : 254}
          r="10"
          fill="#334155"
        />
      ))}
    </svg>
  );
}
