/**
 * Wave 8 §C: a tech event you go to. The stage with a big screen, a speaker
 * at the lectern (speech bubbles with their talk titles), the crowd, then a
 * networking phase where you meet people, and on a demo day a moment on stage
 * pitching your company. Attending sends `techevent.attend`; the scene ends
 * with a result card (what it cost, what you gained). Every phase can be
 * skipped.
 *
 * Opened by PlaceScene when you walk into the venue of an event you chose
 * (./techevent.ts).
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import './techevent.css';
import { use3d } from '../three-kit/quality';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { techEventsOf, type TechEventView } from '../phone/friends';
import { AvatarFigure, avatarLook, type AvatarLook } from './art';
import { hash } from './contract';
import { genderOf } from './life';
import { leaveTechEvent, techKindLabel } from './techevent';
import { hereOf } from './travel';
import type { SceneProps } from './PlaceScene';

type Phase = 'intro' | 'talk' | 'network' | 'pitch' | 'done';

/** Wave 9 §C: the hall in 3D, loaded on demand. */
const TechEvent3D = lazy(() => import('../interiors3d/TechEvent3D'));

interface AttendResult {
  ticket?: number;
  effects?: { network?: number; social?: number; fun?: number };
  contacts?: { name: string; kind: string }[];
  pitch?: { onStage: boolean; interest: { name: string; fund: string } | null } | null;
}

const PHASE_MS: Record<'talk' | 'network' | 'pitch', number> = {
  talk: 5200,
  network: 3800,
  pitch: 3600,
};
const BUBBLE_MS = 1700;

const reduceMotion = () =>
  (typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ||
  (typeof document !== 'undefined' &&
    document.documentElement.dataset.reduceMotion !== undefined &&
    !['false', '0'].includes(document.documentElement.dataset.reduceMotion));

const CROWD_BG = [
  'f-engineer',
  'f-dropout',
  'i-first',
  'b-commercial',
  'f-corporate',
  'i-operator',
  'b-fintech',
  'f-consultant',
];

/** Seats in the hall: three rows facing the stage (x, y of the feet). */
const SEATS: { x: number; y: number }[] = [];
for (let row = 0; row < 3; row++)
  for (let i = 0; i < 6; i++) SEATS.push({ x: 50 + i * 52 + (row % 2) * 14, y: 196 + row * 38 });
/** Where people stand to mingle in the networking phase. */
const MINGLE: { x: number; y: number }[] = SEATS.map((_, n) => ({
  x: 40 + ((n * 67) % 290),
  y: 180 + ((n * 29) % 96),
}));
/** Your seat: front row, middle. */
const YOU = 2;

export function TechEventScene(props: SceneProps & { eventId: string }) {
  const { view } = useView();
  const event = useMemo(
    () => (techEventsOf(view) ?? []).find((e) => e.id === props.eventId) ?? null,
    [view, props.eventId],
  );
  const close = () => {
    leaveTechEvent();
    props.onClose();
  };
  if (!event)
    return (
      <div
        className="place-scene tech-scene"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
      >
        <header className="place-head">
          <div className="place-title">
            <h2>{props.title}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label={t('Close')} onClick={close}>
            ✕
          </button>
        </header>
        <p className="tech-gone">{t('That event is over.')}</p>
      </div>
    );
  return <EventStage event={event} title={props.title} onClose={close} />;
}

function EventStage({
  event,
  title,
  onClose,
}: {
  event: TechEventView;
  title: string;
  onClose: () => void;
}) {
  const { view, send, busy } = useView();
  const cur = hereOf(view).currency;
  const pocket = view.accounts.local?.balance ?? 0;
  const [phase, setPhase] = useState<Phase>(event.attended ? 'talk' : 'intro');
  const [result, setResult] = useState<AttendResult | null>(null);
  const [bubble, setBubble] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const quick = reduceMotion();

  // The speaker's bubble cycles through the talks while the stage is live.
  useEffect(() => {
    if (phase !== 'talk' && phase !== 'intro') return;
    const id = window.setInterval(() => setBubble((n) => n + 1), quick ? BUBBLE_MS * 2 : BUBBLE_MS);
    return () => window.clearInterval(id);
  }, [phase, quick]);

  // Phases run on their own once you've attended.
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!result || phase === 'intro' || phase === 'done') return;
    const next: Phase =
      phase === 'talk'
        ? 'network'
        : phase === 'network' && result.pitch?.onStage
          ? 'pitch'
          : 'done';
    timer.current = window.setTimeout(
      () => setPhase(next),
      quick ? 700 : PHASE_MS[phase as 'talk' | 'network' | 'pitch'],
    );
    return () => window.clearTimeout(timer.current);
  }, [phase, result, quick]);

  const attend = async () => {
    const r = await send<AttendResult>({ type: 'techevent.attend', eventId: event.id });
    if (!r) return;
    setResult(r);
    setPhase('talk');
  };

  const speakers = event.speakers.length
    ? event.speakers
    : [{ id: 'host', name: t('The host'), role: 'founder' as const, org: '', talk: event.title }];
  const speaker = speakers[bubble % speakers.length]!;
  const speakerLook = avatarLook(
    speaker.role === 'investor' ? 'i-first' : 'f-engineer',
    speaker.id || 'speaker',
  );
  const meLook = avatarLook(view.me.background?.id, view.me.id, genderOf(view.me));
  const crowd: AvatarLook[] = useMemo(
    () =>
      SEATS.map((_, n) =>
        avatarLook(CROWD_BG[hash(`${event.id}:${n}`) % CROWD_BG.length], `${event.id}:crowd:${n}`),
      ),
    [event.id],
  );
  const mingling = phase === 'network';
  const onStage = phase === 'pitch';
  const met = result?.contacts ?? [];
  const live = phase === 'talk' || phase === 'network' || phase === 'pitch';
  const want3d = use3d();
  const [ready3d, setReady3d] = useState(false);

  return (
    <div
      className={`place-scene tech-scene phase-${phase}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-tech-scene={event.id}
      data-phase={phase}
      data-kind={event.kind}
    >
      <header className="place-head">
        <div className="place-title">
          <h2>{tx(event.title)}</h2>
          <span className="small muted">
            {techKindLabel(event.kind)} · {tx(event.venue.name)}
          </span>
        </div>
        <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
          ✕
        </button>
      </header>
      <div className={`tech-hall${want3d && ready3d ? ' is-3d' : ''}`}>
        {want3d && (
          <Suspense fallback={null}>
            <TechEvent3D
              phase={phase}
              crowd={crowd}
              you={YOU}
              me={meLook}
              speaker={speakerLook}
              onReady={() => setReady3d(true)}
            />
          </Suspense>
        )}
        <svg viewBox="0 0 360 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="tech-floor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1e1b4b" />
              <stop offset="1" stopColor="#0f172a" />
            </linearGradient>
            <radialGradient id="tech-spot" cx="0.5" cy="0" r="1">
              <stop offset="0" stopColor="#fef3c7" stopOpacity="0.5" />
              <stop offset="1" stopColor="#fef3c7" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="360" height="300" fill="url(#tech-floor)" />
          {/* The screen */}
          <g className="tech-screen">
            <rect x="70" y="14" width="220" height="74" rx="6" fill="#0b1020" stroke="#334155" />
            <rect x="76" y="20" width="208" height="62" rx="3" fill="#312e81" />
            <text x="180" y="44" textAnchor="middle" className="tech-screen-kind">
              {techKindLabel(event.kind).toUpperCase()}
            </text>
            <text x="180" y="64" textAnchor="middle" className="tech-screen-title">
              {tx(event.title).slice(0, 34)}
            </text>
          </g>
          {/* The stage */}
          <path d="M20 150 L340 150 L320 128 L40 128 Z" fill="#7c2d12" />
          <rect x="20" y="150" width="320" height="10" fill="#431407" />
          <ellipse cx="180" cy="128" rx="120" ry="60" fill="url(#tech-spot)" />
          {/* Speaker (or you, pitching) at the lectern */}
          <g transform={`translate(${onStage ? 150 : 180} 140) scale(2)`}>
            <AvatarFigure look={onStage ? meLook : speakerLook} />
          </g>
          <rect x="196" y="116" width="26" height="30" rx="3" fill="#1f2937" />
          <rect x="194" y="112" width="30" height="6" rx="2" fill="#374151" />
          {/* Crowd */}
          {SEATS.map((s, n) => {
            const at = mingling ? MINGLE[n]! : s;
            const you = n === YOU;
            if (you && onStage) return null;
            return (
              <g
                key={n}
                className={`tech-person${you ? ' is-you' : ''}`}
                style={{ transform: `translate(${at.x}px, ${at.y}px) scale(1.5)` }}
                data-you={you ? '' : undefined}
              >
                <AvatarFigure look={you ? meLook : crowd[n]!} />
                {mingling && !you && n % 4 === 1 && (
                  <text x="0" y="-26" textAnchor="middle" className="tech-chat-dot">
                    💬
                  </text>
                )}
              </g>
            );
          })}
          {phase === 'pitch' && (
            <g className="tech-clap">
              <text x="90" y="186">
                👏
              </text>
              <text x="270" y="200">
                👏
              </text>
            </g>
          )}
        </svg>
        {(phase === 'intro' || phase === 'talk') && (
          <div className="tech-bubble" key={bubble} data-talk={speaker.talk}>
            <b>{speaker.name}</b>
            {speaker.org && <span className="small"> · {speaker.org}</span>}
            <div>“{tx(speaker.talk || event.title)}”</div>
          </div>
        )}
        {phase === 'network' && (
          <div className="tech-bubble tech-network" role="status">
            <b>{t('Networking')}</b>
            <ul className="tech-met" aria-label={t('People you met')}>
              {met.slice(0, 5).map((c, i) => (
                <li key={i} style={{ animationDelay: `${i * 0.35}s` }}>
                  + {c.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        {phase === 'pitch' && (
          <div className="tech-bubble tech-pitch" role="status" data-pitch>
            <b>{t('Your pitch on stage')}</b>
            <div>{t('Three minutes, one slide too many, and a big round of applause.')}</div>
            {result?.pitch?.interest && (
              <div className="tech-interest">
                {t('{name} from {fund} wants to talk.', {
                  name: result.pitch.interest.name,
                  fund: result.pitch.interest.fund,
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="place-tray tech-tray">
        {phase === 'intro' && (
          <>
            <p className="small muted">
              {t('Day {day} · {going} of {capacity} going', {
                day: event.day,
                going: event.going,
                capacity: event.capacity,
              })}
              {event.pitchChance && ` · ${t('founders may pitch on stage')}`}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              data-attend
              disabled={busy || (cur === view.market.currency && pocket < event.ticket)}
              onClick={() => void attend()}
            >
              {event.ticket
                ? t('Attend · {price}', { price: money(event.ticket, cur) })
                : t('Attend · free')}
            </button>
          </>
        )}
        {live && (
          <div className="spread">
            <span className="small muted">
              {phase === 'talk'
                ? t('The talks')
                : phase === 'network'
                  ? t('Meeting people')
                  : t('Demo time')}
            </span>
            {result ? (
              <button type="button" className="btn btn-ghost" onClick={() => setPhase('done')}>
                {t('Skip ›')}
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                {t('Leave')}
              </button>
            )}
          </div>
        )}
        {phase === 'done' && (
          <section className="tech-result" role="status" data-result>
            <h3>{t('What you got out of it')}</h3>
            <ul>
              <li>
                {result?.ticket
                  ? t('Ticket: {price}', { price: money(result.ticket, cur) })
                  : t('Free entry')}
              </li>
              {!!result?.effects?.network && (
                <li className="good">{t('+{n} network', { n: result.effects.network })}</li>
              )}
              {!!result?.effects?.social && (
                <li className="good">{t('+{n} social', { n: result.effects.social })}</li>
              )}
              <li data-contacts={met.length}>
                {t('{n} new contacts: {names}', {
                  n: met.length,
                  names: met.map((c) => c.name.split(' ')[0]).join(', '),
                })}
              </li>
              {result?.pitch?.interest && (
                <li className="good">
                  {t('{name} ({fund}) liked your pitch: a warm intro is waiting.', {
                    name: result.pitch.interest.name,
                    fund: result.pitch.interest.fund,
                  })}
                </li>
              )}
            </ul>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {t('Leave the event')}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
