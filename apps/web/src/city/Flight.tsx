/**
 * Wave 7 §B: the flight, about twelve seconds, Skip always there.
 *
 * 1. Take-off: close up on your city's airport, the plane (./airport/planes,
 *    your own jet at the top of the lifestyle ladder) taxis onto the
 *    runway, rolls, rotates, lifts and folds its gear away.
 * 2. The cabin (Wave 8, ./acts/Cabin.tsx): down the aisle in perspective,
 *    rows of passengers, the crew and the trolley, your seat, the window,
 *    the seatbelt sign and the meal; the class follows your lifestyle.
 *    "Sleep through" and "Work on laptop" are just for the mood.
 * 3. Landing: a wider frame of the destination's airport, in its colours:
 *    gear down on the approach, the flare, mains first, then the nose.
 *    Freetown lands at Lungi, so a water taxi crosses the estuary last.
 *
 * One requestAnimationFrame loop for the cabin, paused while the tab is
 * hidden. Reduced motion: the cabin alone, still, then you've arrived.
 *
 * Phase 6b: where WebGL works (and the player hasn't chosen Lite), the whole
 * flight is 3D (./flight3d): the climb-out over your city, the cabin at
 * real size (up the aisle to your window seat), then the full sky outside
 * (a fifth phase, `sky`: over the wing above the cloud deck, then the whole
 * plane banking in the sun or under the stars), and the approach down
 * through the clouds to the destination's runway. The drawings above stay
 * for Lite and for browsers without WebGL. Reduced motion: the cabin and the
 * sky, each a still.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { use3d } from '../three-kit/quality';
import { t } from '../i18n';
import { useView } from '../store';
import { avatarLook } from './art';
import { flightPartyTo } from './companions';
import { useReducedMotion } from './CityMap';
import { Cabin, cabinFor } from './acts/Cabin';
import { PlaneSide, type PlaneKind } from './airport/planes';
import { genderOf } from './life';
import { flavourOf } from './flavour';
import { useDaylight } from './useDaylight';
import {
  AIRPORT_NAMES,
  flightHours,
  fmtFlightTime,
  liveryOf,
  premiumActs,
  seeded,
  fnv,
} from './travel';
import { SuiteFlight } from './premium/Suite';
import { isPremium } from './premium/premium';
import './flight.css';

type Phase = 'takeoff' | 'cruise' | 'sky' | 'landing' | 'ferry' | 'arrived';
const DUR = { takeoff: 3200, cruise: 6500, sky: 0, landing: 2800, ferry: 2600 };
/** In 3D: a little longer up, the cabin, the sky (new), the approach. */
const DUR3D = { takeoff: 3600, cruise: 6000, sky: 4600, landing: 3800, ferry: 2600 };
const FlightView3D = lazy(() => import('./flight3d/FlightView3D'));

/**
 * `runway.flightPace` in localStorage (a number, 1–10) slows the 3D flight
 * down that many times: screenshots on a slow software renderer.
 */
function flightPace(): number {
  try {
    const n = Number(localStorage.getItem('runway.flightPace'));
    return Number.isFinite(n) && n >= 1 ? Math.min(10, n) : 1;
  } catch {
    return 1;
  }
}
const scaled = <T extends Record<string, number>>(d: T, k: number) =>
  Object.fromEntries(Object.entries(d).map(([a, v]) => [a, v * k])) as T;

function Cloud({ x, y, s, k }: { x: number; y: number; s: number; k: number }) {
  return (
    <g
      className="fl-cloud"
      style={{ animationDelay: `${-k * 1.7}s`, animationDuration: `${7 + (k % 3) * 2}s` }}
    >
      <g transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity="0.85">
        <ellipse cx="0" cy="0" rx="26" ry="11" />
        <ellipse cx="16" cy="-6" rx="16" ry="11" />
        <ellipse cx="-14" cy="-4" rx="13" ry="9" />
      </g>
    </g>
  );
}

/**
 * The ground at an airport: sky, the city's skyline in its colours, the
 * terminal with the airport's name, the runway. `close` frames the plane.
 */
function Airfield({
  marketId,
  name,
  night,
  close,
  arriving,
  children,
}: {
  marketId: string;
  name: string;
  night: boolean;
  close?: boolean;
  arriving?: boolean;
  children: React.ReactNode;
}) {
  const fl = flavourOf(marketId);
  const rnd = seeded(fnv(`${marketId}:airfield`));
  const sky = arriving
    ? night
      ? ['#1e1b4b', '#7c3aed']
      : ['#f59e0b', '#fde68a']
    : night
      ? ['#0b1026', '#3730a3']
      : ['#38bdf8', '#e0f2fe'];
  const id = arriving ? 'fl-sky-in' : 'fl-sky-out';
  return (
    <svg
      className="fl-svg"
      viewBox={close ? '0 120 320 190' : '20 100 340 210'}
      preserveAspectRatio="xMidYMax meet"
      aria-hidden
      data-airfield={arriving ? 'arrival' : 'departure'}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
      </defs>
      <rect x="-800" y="-900" width="2000" height="1200" fill={`url(#${id})`} />
      {night ? (
        <circle cx="320" cy="-40" r="16" fill="#fef9c3" />
      ) : (
        <circle cx="320" cy={arriving ? 150 : -40} r="22" fill="#fde68a" opacity="0.95" />
      )}
      <Cloud x={70} y={70} s={1} k={0} />
      <Cloud x={250} y={110} s={0.8} k={1} />
      <Cloud x={90} y={-150} s={0.9} k={3} />
      {/* The city's skyline, in its own colours. */}
      <g opacity={night ? 0.55 : 0.85}>
        {Array.from({ length: 16 }, (_, k) => {
          const h = 30 + Math.floor(rnd() * 70);
          return (
            <rect
              key={k}
              x={-120 + k * 42}
              y={226 - h}
              width={34}
              height={h}
              fill={night ? '#312e81' : fl.walls[k % fl.walls.length]}
            />
          );
        })}
      </g>
      <rect x="-800" y="225" width="2000" height="400" fill={night ? '#14532d' : fl.park} />
      <rect x="-800" y="238" width="2000" height="26" fill="#475569" />
      <g fill="#f8fafc">
        {Array.from({ length: 10 }, (_, k) => (
          <rect key={k} x={8 + k * 42} y="250" width="22" height="2" />
        ))}
      </g>
      <g fill={night || arriving ? '#fde047' : '#f8fafc'}>
        {Array.from({ length: 20 }, (_, k) => (
          <circle key={k} cx={4 + k * 21} cy="265" r="1.3" />
        ))}
      </g>
      <g>
        <rect x="150" y="186" width="140" height="40" rx="4" fill="#e2e8f0" />
        <rect x="156" y="196" width="128" height="16" fill={night ? '#fde68a' : '#7dd3fc'} />
        <rect x="160" y="172" width="120" height="16" rx="3" fill="#0f172a" />
        <text x="220" y="184" textAnchor="middle" className="fl-sign">
          {name.toUpperCase()}
        </text>
        <rect x="300" y="150" width="10" height="76" fill="#cbd5e1" />
        <rect x="294" y="140" width="22" height="14" rx="3" fill={fl.roofs[0]} />
      </g>
      {children}
    </svg>
  );
}

/** Lungi to Freetown: a water taxi across the Sierra Leone River estuary. */
function Ferry({ night }: { night: boolean }) {
  return (
    <svg
      className="fl-svg"
      viewBox="0 0 400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      data-ferry=""
    >
      <rect x="-800" y="-400" width="2000" height="700" fill={night ? '#1e1b4b' : '#7dd3fc'} />
      {/* Freetown's hills across the water. */}
      <path
        d="M -400 300 Q -100 180 100 260 Q 260 170 420 240 Q 600 200 800 290 V 320 H -400 Z"
        fill={night ? '#14532d' : '#4d7c0f'}
      />
      <g fill={night ? '#fde68a' : '#fef3c7'}>
        {Array.from({ length: 14 }, (_, k) => (
          <rect key={k} x={60 + k * 24} y={270 - ((k * 13) % 30)} width="12" height="10" />
        ))}
      </g>
      <rect x="-800" y="300" width="2000" height="700" fill={night ? '#0c4a6e' : '#0ea5e9'} />
      <g className="fl-waves" fill="none" stroke="#e0f2fe" strokeWidth="2" opacity="0.6">
        {Array.from({ length: 8 }, (_, k) => (
          <path key={k} d={`M ${-200 + ((k * 97) % 700)} ${340 + k * 30} q 15 -6 30 0 t 30 0`} />
        ))}
      </g>
      <g className="fl-boat">
        <g transform="translate(0 420)">
          <path
            d="M -60 0 L 60 0 L 46 22 L -50 22 Z"
            fill="#f8fafc"
            stroke="#0f172a"
            strokeWidth="2"
          />
          <rect x="-36" y="-22" width="58" height="22" rx="4" fill="#059669" />
          <rect x="-30" y="-16" width="46" height="10" fill="#bae6fd" />
          <path
            d="M -62 14 q -40 6 -90 4"
            stroke="#fff"
            strokeWidth="4"
            fill="none"
            opacity="0.8"
          />
        </g>
      </g>
    </svg>
  );
}

export function FlightScene({
  from,
  to,
  fromName,
  toName,
  hours,
  airline,
  cabin,
  status,
  note,
  onDone,
}: {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  hours: number;
  /** The airline flying you, for the plane's colours. */
  airline?: string;
  /** The cabin on your ticket (missing: an older server; the class follows your lifestyle). */
  cabin?: 'economy' | 'business' | 'first';
  /** The server's answer: 'pending' keeps you at the gate until it comes. */
  status: 'pending' | 'ok';
  /** Shown on arrival with a Continue button (the fallback trip). */
  note?: string;
  onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const { view } = useView();
  const three = use3d();
  const [pace] = useState(() => (three ? flightPace() : 1));
  const [dur3d] = useState(() => scaled(DUR3D, pace));
  const dur = three ? dur3d : DUR;
  const [phase, setPhase] = useState<Phase>(reduced ? 'cruise' : 'takeoff');
  const nightFrom = useDaylight(from).night;
  const nightTo = useDaylight(to).night;
  const ferry = to === 'freetown';
  const realHours = flightHours(from, to, hours);
  // The cabin on your ticket; your own jet at the top of the lifestyle ladder; an
  // airliner in the airline's colours otherwise.
  const cls = cabinFor(view.me.lifestyle?.tier, cabin);
  const kind: PlaneKind = cls === 'private' ? 'bizjet' : 'airliner';
  const livery = kind === 'bizjet' ? '#1e3a8a' : liveryOf(from, airline);
  // Holiday with friends: the ones on this flight sit next to you.
  const [party] = useState(() => flightPartyTo(view, to));
  // First-class release: business and first are lived, not watched (./premium/Suite):
  // the cabin waits for you instead of a timer.
  const [suite] = useState(() => isPremium(cls) && premiumActs(view));

  // In 3D the take-off waits for the first frame (a slow phone still sees it),
  // but never more than a few seconds.
  const [ready3d, setReady3d] = useState(!three);
  useEffect(() => {
    if (ready3d) return;
    const id = setTimeout(() => setReady3d(true), 8000);
    return () => clearTimeout(id);
  }, [ready3d]);

  // Each phase hands over to the next on a timer.
  useEffect(() => {
    if (phase === 'arrived' || !ready3d) return;
    if (suite && phase === 'cruise') return;
    const next: Phase = reduced
      ? three && phase === 'cruise'
        ? 'sky'
        : 'arrived'
      : phase === 'takeoff'
        ? 'cruise'
        : phase === 'cruise'
          ? three
            ? 'sky'
            : 'landing'
          : phase === 'sky'
            ? 'landing'
            : phase === 'landing' && ferry
              ? 'ferry'
              : 'arrived';
    const id = setTimeout(() => setPhase(next), reduced ? 1600 * pace : dur[phase]);
    return () => clearTimeout(id);
  }, [phase, reduced, ferry, three, dur, pace, ready3d, suite]);

  // Arrived and confirmed: step out into the city (unless there's a note to read).
  useEffect(() => {
    if (phase !== 'arrived' || status !== 'ok' || note) return;
    const id = setTimeout(onDone, reduced ? 300 : 900);
    return () => clearTimeout(id);
  }, [phase, status, note, onDone, reduced]);

  const caption =
    phase === 'takeoff'
      ? t('Taking off from {city}', { city: fromName })
      : phase === 'cruise'
        ? t('Flying to {city}', { city: toName })
        : phase === 'sky'
          ? t('Above the clouds, on the way to {city}', { city: toName })
          : phase === 'landing'
            ? t('Landing in {city}', { city: toName })
            : phase === 'ferry'
              ? t('Water taxi across the estuary to {city}', { city: toName })
              : status === 'pending'
                ? t('Taxiing to the gate…')
                : t('Welcome to {city}', { city: toName });
  const airportFrom = AIRPORT_NAMES[from] ?? fromName;
  const airportTo = AIRPORT_NAMES[to] ?? toName;

  return (
    <div
      className={`flight${reduced ? ' is-reduced' : ''}${suite && phase === 'cruise' ? ' is-suite' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('Flight to {city}', { city: toName })}
      data-flight-phase={phase}
    >
      <div className="fl-stage">
        {three && (
          <Suspense fallback={<div className="f3" data-flight3d="loading" />}>
            <FlightView3D
              phase={phase}
              dur={dur3d}
              from={from}
              to={to}
              hours={realHours}
              kind={kind}
              livery={livery}
              cls={cls}
              still={reduced}
              onReady={() => setReady3d(true)}
              party={party}
              suite={suite}
            />
          </Suspense>
        )}
        {!three && phase === 'takeoff' && (
          <Airfield marketId={from} name={airportFrom} night={nightFrom} close>
            <g className="fl-plane fl-takeoff">
              <g transform="translate(60 246)">
                <g className="fl-pitch">
                  <PlaneSide kind={kind} livery={livery} />
                </g>
              </g>
            </g>
          </Airfield>
        )}
        {suite && phase === 'cruise' && isPremium(cls) && (
          <SuiteFlight
            cabin={cls}
            from={from}
            to={to}
            hours={realHours}
            onLand={() => setPhase(three && !reduced ? 'sky' : 'landing')}
            livery={livery}
          />
        )}
        {!three && !suite && phase === 'cruise' && (
          <Cabin
            from={from}
            to={to}
            hours={realHours}
            still={reduced}
            dur={DUR.cruise}
            tier={view.me.lifestyle?.tier}
            cabin={cabin}
            look={avatarLook(view.me.background?.id, view.me.id, genderOf(view.me))}
            party={party}
          />
        )}
        {!three && (phase === 'landing' || (phase === 'arrived' && !ferry)) && (
          <Airfield marketId={to} name={airportTo} night={nightTo} arriving>
            <g className={`fl-plane${phase === 'landing' ? ' fl-landing' : ' fl-parked'}`}>
              <g transform="translate(60 246)">
                <g className="fl-pitch">
                  <PlaneSide kind={kind} livery={livery} />
                </g>
              </g>
            </g>
          </Airfield>
        )}
        {(phase === 'ferry' || (phase === 'arrived' && ferry)) && <Ferry night={nightTo} />}
      </div>
      <div className="fl-top">
        <span className="fl-route">
          {fromName} → {toName}
        </span>
        <span className="fl-hours">{fmtFlightTime(realHours)}</span>
      </div>
      <div className="fl-bottom">
        <p className="fl-caption" aria-live="polite">
          {caption}
        </p>
        {phase === 'arrived' && note ? (
          <>
            <p className="fl-note">{note}</p>
            <button type="button" className="btn btn-primary" onClick={onDone}>
              {t('Continue')}
            </button>
          </>
        ) : null}
      </div>
      {phase !== 'arrived' && (
        <button type="button" className="fl7-skip" onClick={() => setPhase('arrived')}>
          {t('Skip')} <span aria-hidden>›</span>
        </button>
      )}
    </div>
  );
}
