/**
 * Wave 4: the flight. Full screen: the plane rolls down your city's runway
 * and takes off, crosses a stylised map along a dotted arc (clouds, day or
 * night by local time), and lands at the destination's airport. Then the
 * City shows where you landed.
 *
 * Reduced motion: the route map alone, cross-faded in and out. The scene
 * waits at the gate if the server hasn't confirmed the flight yet, and
 * "Skip" jumps to the arrival at any point.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n';
import { useReducedMotion } from './CityMap';
import { alongRoute, isNight, localHour, routeOf } from './travel';

type Phase = 'takeoff' | 'cruise' | 'landing' | 'arrived';
const DUR: Record<Exclude<Phase, 'arrived'>, number> = {
  takeoff: 2800,
  cruise: 4000,
  landing: 2800,
};

/** Rough continents, as [longitude, latitude] rings: a stylised map, not an atlas. */
const LAND: [number, number][][] = [
  // Africa
  [
    [-17, 21],
    [-16, 28],
    [-10, 35],
    [10, 37],
    [32, 31],
    [35, 28],
    [43, 12],
    [51, 12],
    [40, -2],
    [40, -15],
    [35, -25],
    [20, -35],
    [18, -30],
    [12, -17],
    [9, -1],
    [9, 4],
    [-8, 4],
    [-17, 14],
  ],
  // Europe
  [
    [-10, 36],
    [-9, 43],
    [-2, 44],
    [-5, 48],
    [2, 51],
    [8, 54],
    [10, 58],
    [5, 62],
    [15, 69],
    [28, 71],
    [40, 67],
    [45, 55],
    [40, 45],
    [30, 41],
    [26, 38],
    [22, 37],
    [13, 38],
    [16, 41],
    [12, 44],
    [3, 43],
    [-1, 37],
  ],
  // Great Britain and Ireland
  [
    [-5, 50],
    [1, 51],
    [2, 53],
    [-1, 55],
    [-3, 58.5],
    [-6, 57],
    [-5, 54],
    [-3, 53],
  ],
  [
    [-10, 52],
    [-6, 52],
    [-6, 55],
    [-9, 54.5],
  ],
  // Arabia
  [
    [32, 31],
    [35, 36],
    [44, 37],
    [48, 30],
    [56, 26],
    [60, 22],
    [52, 16],
    [43, 12],
    [39, 21],
    [35, 28],
  ],
  // Asia
  [
    [40, 45],
    [50, 45],
    [60, 40],
    [62, 25],
    [68, 24],
    [73, 18],
    [78, 8],
    [80, 15],
    [88, 22],
    [92, 20],
    [100, 13],
    [105, 10],
    [108, 20],
    [122, 30],
    [122, 40],
    [130, 42],
    [140, 55],
    [160, 62],
    [180, 68],
    [180, 75],
    [100, 78],
    [60, 72],
    [45, 55],
  ],
  // North America
  [
    [-168, 66],
    [-140, 70],
    [-95, 72],
    [-80, 63],
    [-60, 55],
    [-66, 45],
    [-76, 35],
    [-81, 25],
    [-97, 26],
    [-97, 18],
    [-87, 13],
    [-80, 8],
    [-85, 10],
    [-105, 20],
    [-115, 30],
    [-122, 37],
    [-125, 42],
    [-124, 48],
    [-135, 58],
    [-150, 60],
    [-165, 62],
  ],
  // South America
  [
    [-80, 8],
    [-60, 10],
    [-50, 0],
    [-35, -7],
    [-40, -22],
    [-58, -38],
    [-68, -55],
    [-75, -50],
    [-72, -30],
    [-80, -5],
  ],
  // Madagascar
  [
    [44, -13],
    [50, -15],
    [47, -25],
    [43, -22],
  ],
];

const ring = (pts: [number, number][]) =>
  pts.map(([lon, lat]) => `${(lon + 180).toFixed(1)},${(90 - lat).toFixed(1)}`).join(' ');

/** A side-on airliner, facing right, wheels at y = 0. */
function Airliner({ gear = true }: { gear?: boolean }) {
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
      {/* Far wing */}
      <path d="M -6 -16 L -24 -30 L -16 -30 L 8 -16 Z" fill="#cbd5e1" />
      {/* Fuselage */}
      <path
        d="M -58 -22 Q -60 -8 -48 -8 L 36 -8 Q 54 -8 58 -15 Q 54 -24 36 -24 L -44 -24 Q -54 -24 -58 -22 Z"
        fill="#f8fafc"
        stroke="#94a3b8"
        strokeWidth="0.8"
      />
      {/* Tail */}
      <path d="M -56 -22 L -64 -46 L -52 -46 L -40 -24 Z" fill="#0f766e" />
      <path d="M -60 -20 L -70 -18 L -58 -16 Z" fill="#0f766e" />
      {/* Cheatline and windows */}
      <rect x="-46" y="-15" width="88" height="2" fill="#0f766e" />
      {Array.from({ length: 13 }, (_, k) => (
        <rect key={k} x={-40 + k * 6.2} y="-20.5" width="3" height="3" rx="1" fill="#1e3a5f" />
      ))}
      <path d="M 46 -21 Q 52 -21 55 -17 L 47 -17 Z" fill="#1e3a5f" />
      {/* Near wing and engine */}
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

/** The ground at an airport: sky, a skyline, the terminal with the city's name, the runway. */
function Airfield({
  name,
  night,
  children,
}: {
  name: string;
  night: boolean;
  children: React.ReactNode;
}) {
  return (
    // The scene is drawn wide and tall: a phone sees the whole runway, the sky fills above.
    <svg className="fl-svg" viewBox="0 0 400 360" preserveAspectRatio="xMidYMax meet" aria-hidden>
      <defs>
        <linearGradient id="fl-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={night ? '#0b1026' : '#38bdf8'} />
          <stop offset="1" stopColor={night ? '#3730a3' : '#e0f2fe'} />
        </linearGradient>
      </defs>
      <rect x="-800" y="-900" width="2000" height="1200" fill="url(#fl-sky)" />
      {night ? (
        <>
          <circle cx="320" cy="-40" r="16" fill="#fef9c3" />
          <circle cx="314" cy="-45" r="14" fill="#1e1b4b" opacity="0.9" />
          {[40, 90, 150, 210, 260, 360, 120, 300].map((x, k) => (
            <circle key={k} cx={x} cy={-260 + ((k * 97) % 360)} r="1.2" fill="#fff" opacity="0.8" />
          ))}
        </>
      ) : (
        <circle cx="320" cy="-40" r="22" fill="#fde68a" opacity="0.95" />
      )}
      <Cloud x={70} y={70} s={1} k={0} />
      <Cloud x={250} y={110} s={0.8} k={1} />
      <Cloud x={160} y={40} s={0.6} k={2} />
      <Cloud x={90} y={-150} s={0.9} k={3} />
      <Cloud x={300} y={-230} s={0.7} k={4} />
      {/* Distant skyline */}
      <g fill={night ? '#312e81' : '#94a3b8'} opacity="0.7">
        {[0, 24, 40, 70, 96, 300, 322, 350, 372].map((x, k) => (
          <rect key={k} x={x} y={200 - ((k * 23) % 50)} width={20} height={60 + ((k * 23) % 50)} />
        ))}
      </g>
      {/* Ground, runway and its lights */}
      <rect x="-800" y="225" width="2000" height="400" fill={night ? '#14532d' : '#86efac'} />
      <rect x="-800" y="238" width="2000" height="26" fill="#475569" />
      <g fill="#f8fafc">
        {Array.from({ length: 10 }, (_, k) => (
          <rect key={k} x={8 + k * 42} y="250" width="22" height="2" />
        ))}
      </g>
      <g fill={night ? '#fde047' : '#f8fafc'}>
        {Array.from({ length: 20 }, (_, k) => (
          <circle key={k} cx={4 + k * 21} cy="265" r="1.3" />
        ))}
      </g>
      {/* Terminal and tower */}
      <g>
        <rect x="150" y="186" width="140" height="40" rx="4" fill="#e2e8f0" />
        <rect
          x="156"
          y="196"
          width="128"
          height="16"
          fill={night ? '#fde68a' : '#7dd3fc'}
          opacity="0.9"
        />
        <rect x="186" y="172" width="68" height="16" rx="3" fill="#0f172a" />
        <text x="220" y="184" textAnchor="middle" className="fl-sign">
          {name.toUpperCase()}
        </text>
        <rect x="300" y="150" width="10" height="76" fill="#cbd5e1" />
        <rect x="294" y="140" width="22" height="14" rx="3" fill="#0f766e" />
      </g>
      {children}
    </svg>
  );
}

/** The route map: origin to destination along a dotted arc, the plane flying it. */
function RouteMap({
  from,
  to,
  fromName,
  toName,
  night,
  flying,
  ms,
}: {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  night: boolean;
  flying: boolean;
  ms: number;
}) {
  const r = useMemo(() => routeOf(from, to), [from, to]);
  const planeRef = useRef<SVGGElement>(null);
  const u = r.box.w / 100;
  useEffect(() => {
    const el = planeRef.current;
    if (!el) return;
    const put = (k: number) => {
      const p = alongRoute(r, k);
      el.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${p.deg})`);
    };
    if (!flying) {
      put(1);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      put(k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    put(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [r, flying, ms]);
  const { box } = r;
  const sea = night ? '#0f1e3d' : '#7dd3fc';
  return (
    <svg
      className="fl-svg fl-map"
      viewBox={`${box.minX} ${box.minY} ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ background: sea }}
      aria-hidden
    >
      <rect
        x={box.minX - box.w}
        y={box.minY - box.h}
        width={box.w * 3}
        height={box.h * 3}
        fill={sea}
      />
      {LAND.map((pts, k) => (
        <polygon
          key={k}
          points={ring(pts)}
          fill={night ? '#1e3a2f' : '#bbf7d0'}
          stroke={night ? '#2f5d4a' : '#86efac'}
          strokeWidth={u * 0.3}
          strokeLinejoin="round"
        />
      ))}
      <path
        d={`M ${r.a.x} ${r.a.y} Q ${r.c.x} ${r.c.y} ${r.b.x} ${r.b.y}`}
        fill="none"
        stroke={night ? '#fde68a' : '#0f172a'}
        strokeWidth={u * 0.5}
        strokeDasharray={`${u * 1.4} ${u * 1.4}`}
        strokeLinecap="round"
        opacity="0.75"
      />
      {[
        { p: r.a, name: fromName },
        { p: r.b, name: toName },
      ].map(({ p, name }, k) => (
        <g key={k}>
          <circle
            cx={p.x}
            cy={p.y}
            r={u * 1.5}
            fill="#f59e0b"
            stroke="#fff"
            strokeWidth={u * 0.5}
          />
          <text
            x={p.x}
            y={p.y + u * 5}
            textAnchor="middle"
            fontSize={u * 3.6}
            fontWeight="800"
            fill={night ? '#f8fafc' : '#0f172a'}
            stroke={night ? '#0f1e3d' : '#fff'}
            strokeWidth={u * 0.8}
            paintOrder="stroke"
          >
            {name}
          </text>
        </g>
      ))}
      <g className="fl-map-clouds" opacity="0.7">
        {[0.2, 0.55, 0.8].map((f, k) => (
          <ellipse
            key={k}
            className="fl-cloud"
            style={{ animationDelay: `${-k * 2}s` }}
            cx={box.minX + box.w * f}
            cy={box.minY + box.h * (0.25 + 0.25 * k)}
            rx={u * 9}
            ry={u * 3}
            fill="#fff"
          />
        ))}
      </g>
      <g ref={planeRef} data-flight-plane="">
        {/* Top-down airliner, nose along +x. */}
        <g transform={`scale(${u * 0.32})`}>
          <path
            d="M 14 0 Q 12 -2 6 -2 L -10 -2 L -14 -1 L -14 1 L -10 2 L 6 2 Q 12 2 14 0 Z"
            fill="#f8fafc"
            stroke="#0f172a"
            strokeWidth="0.6"
          />
          <path
            d="M 3 -2 L -4 -13 L -7 -13 L -3 -2 Z M 3 2 L -4 13 L -7 13 L -3 2 Z"
            fill="#e2e8f0"
            stroke="#0f172a"
            strokeWidth="0.6"
          />
          <path
            d="M -10 -2 L -14 -6 L -15 -6 L -13 -1 Z M -10 2 L -14 6 L -15 6 L -13 1 Z"
            fill="#0f766e"
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
  const [phase, setPhase] = useState<Phase>(reduced ? 'cruise' : 'takeoff');
  const nightFrom = isNight(localHour(from));
  const nightTo = isNight(localHour(to));

  // Each phase hands over to the next on a timer.
  useEffect(() => {
    if (phase === 'arrived') return;
    const next: Phase = reduced
      ? 'arrived'
      : phase === 'takeoff'
        ? 'cruise'
        : phase === 'cruise'
          ? 'landing'
          : 'arrived';
    const id = setTimeout(() => setPhase(next), reduced ? 1600 : DUR[phase]);
    return () => clearTimeout(id);
  }, [phase, reduced]);

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
          : status === 'pending'
            ? t('Taxiing to the gate…')
            : t('Welcome to {city}', { city: toName });

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
          <Airfield name={fromName} night={nightFrom}>
            <g className="fl-plane fl-takeoff">
              <g transform="translate(60 246)">
                <Airliner />
              </g>
            </g>
          </Airfield>
        )}
        {phase === 'cruise' && (
          <RouteMap
            from={from}
            to={to}
            fromName={fromName}
            toName={toName}
            night={nightTo}
            flying={!reduced}
            ms={DUR.cruise}
          />
        )}
        {(phase === 'landing' || phase === 'arrived') && (
          <Airfield name={toName} night={nightTo}>
            <g className={`fl-plane${phase === 'landing' ? ' fl-landing' : ' fl-parked'}`}>
              <g transform="translate(60 246)">
                <Airliner />
              </g>
            </g>
          </Airfield>
        )}
      </div>
      <div className="fl-top">
        <span className="fl-route">
          {fromName} → {toName}
        </span>
        <span className="fl-hours">{t('{n}h flight', { n: hours })}</span>
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
        ) : (
          phase !== 'arrived' && (
            <button type="button" className="fl-skip" onClick={() => setPhase('arrived')}>
              {t('Skip')}
            </button>
          )
        )}
      </div>
    </div>
  );
}
