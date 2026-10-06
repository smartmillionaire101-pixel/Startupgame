/**
 * Wave 7 §B: the flight, about twelve seconds, Skip always there.
 *
 * 1. Take-off: close up on the apron of your city's airport, the plane
 *    rolls and lifts.
 * 2. The cabin (Wave 8, ./acts/Cabin.tsx): down the aisle in perspective,
 *    rows of passengers, the crew and the trolley, your seat, the window,
 *    the seatbelt sign and the meal; the class follows your lifestyle.
 *    "Sleep through" and "Work on laptop" are just for the mood.
 * 3. Landing: a wider frame of the destination's airport, in its colours.
 *    Freetown lands at Lungi, so a water taxi crosses the estuary last.
 *
 * One requestAnimationFrame loop for the cabin, paused while the tab is
 * hidden. Reduced motion: the cabin alone, still, then you've arrived.
 */
import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { useView } from '../store';
import { avatarLook } from './art';
import { useReducedMotion } from './CityMap';
import { Cabin } from './acts/Cabin';
import { genderOf } from './life';
import { flavourOf } from './flavour';
import { AIRPORT_NAMES, CITY_GEO, fmtFlightTime, isNight, localHour, seeded, fnv } from './travel';
import './flight.css';

type Phase = 'takeoff' | 'cruise' | 'landing' | 'ferry' | 'arrived';
const DUR = { takeoff: 2600, cruise: 6500, landing: 2600, ferry: 2600 };

/** Great-circle hours at airliner speed, plus taxi and climb. */
function flightHours(from: string, to: string, fallback: number): number {
  const a = CITY_GEO[from];
  const b = CITY_GEO[to];
  if (!a || !b) return fallback;
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.sqrt(h));
  return km / 820 + 0.5;
}

/** A side-on airliner, facing right, wheels at y = 0. */
function Airliner({ gear = true, livery = '#0f766e' }: { gear?: boolean; livery?: string }) {
  return (
    <g>
      {gear && (
        <g fill="#334155">
          <rect x="-26" y="-9" width="3" height="9" />
          <circle cx="-24.5" cy="-1.5" r="3" />
          <rect x="22" y="-9" width="2.5" height="9" />
          <circle cx="23" cy="-1.5" r="2.6" />
        </g>
      )}
      <path d="M -6 -16 L -24 -30 L -16 -30 L 8 -16 Z" fill="#cbd5e1" />
      <path
        d="M -58 -22 Q -60 -8 -48 -8 L 36 -8 Q 54 -8 58 -15 Q 54 -24 36 -24 L -44 -24 Q -54 -24 -58 -22 Z"
        fill="#f8fafc"
        stroke="#94a3b8"
        strokeWidth="0.8"
      />
      <path d="M -56 -22 L -64 -46 L -52 -46 L -40 -24 Z" fill={livery} />
      <path d="M -60 -20 L -70 -18 L -58 -16 Z" fill={livery} />
      <rect x="-46" y="-15" width="88" height="2" fill={livery} />
      {Array.from({ length: 13 }, (_, k) => (
        <rect key={k} x={-40 + k * 6.2} y="-20.5" width="3" height="3" rx="1" fill="#1e3a5f" />
      ))}
      <path d="M 46 -21 Q 52 -21 55 -17 L 47 -17 Z" fill="#1e3a5f" />
      <path
        d="M -10 -12 L 8 -12 L -14 6 L -24 6 Z"
        fill="#e2e8f0"
        stroke="#94a3b8"
        strokeWidth="0.6"
      />
      <rect x="-4" y="-8" width="16" height="7" rx="3.5" fill="#64748b" />
    </g>
  );
}

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
      viewBox={close ? '0 150 240 140' : '0 0 400 360'}
      preserveAspectRatio={close ? 'xMidYMid slice' : 'xMidYMax meet'}
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
  status,
  note,
  onDone,
}: {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  hours: number;
  /** The server's answer: 'pending' keeps you at the gate until it comes. */
  status: 'pending' | 'ok';
  /** Shown on arrival with a Continue button (the fallback trip). */
  note?: string;
  onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const { view } = useView();
  const [phase, setPhase] = useState<Phase>(reduced ? 'cruise' : 'takeoff');
  const nightFrom = isNight(localHour(from));
  const nightTo = isNight(localHour(to));
  const ferry = to === 'freetown';
  const realHours = flightHours(from, to, hours);

  // Each phase hands over to the next on a timer.
  useEffect(() => {
    if (phase === 'arrived') return;
    const next: Phase = reduced
      ? 'arrived'
      : phase === 'takeoff'
        ? 'cruise'
        : phase === 'cruise'
          ? 'landing'
          : phase === 'landing' && ferry
            ? 'ferry'
            : 'arrived';
    const id = setTimeout(() => setPhase(next), reduced ? 1600 : DUR[phase]);
    return () => clearTimeout(id);
  }, [phase, reduced, ferry]);

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
      className={`flight${reduced ? ' is-reduced' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('Flight to {city}', { city: toName })}
      data-flight-phase={phase}
    >
      <div className="fl-stage">
        {phase === 'takeoff' && (
          <Airfield marketId={from} name={airportFrom} night={nightFrom} close>
            <g className="fl-plane fl-takeoff">
              <g transform="translate(60 246)">
                <Airliner />
              </g>
            </g>
          </Airfield>
        )}
        {phase === 'cruise' && (
          <Cabin
            from={from}
            to={to}
            hours={realHours}
            still={reduced}
            dur={DUR.cruise}
            tier={view.me.lifestyle?.tier}
            look={avatarLook(view.me.background?.id, view.me.id, genderOf(view.me))}
          />
        )}
        {(phase === 'landing' || (phase === 'arrived' && !ferry)) && (
          <Airfield marketId={to} name={airportTo} night={nightTo} arriving>
            <g className={`fl-plane${phase === 'landing' ? ' fl-landing' : ' fl-parked'}`}>
              <g transform="translate(60 246)">
                <Airliner />
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
