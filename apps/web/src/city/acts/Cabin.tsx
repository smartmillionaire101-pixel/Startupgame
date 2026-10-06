/**
 * Wave 8 §B: the plane's cabin, seen from the front galley down the aisle in
 * perspective: rows of seats with passengers facing you, overhead bins,
 * windows on the side walls, the crew pushing the trolley down the aisle,
 * your seat highlighted, a window inset with the sky outside, the seatbelt
 * sign and the meal. The cabin class follows your lifestyle tier: economy
 * (3+3), premium (2+2) or business (1+1 suites).
 *
 * One requestAnimationFrame loop writes the moving parts through refs; the
 * cabin itself is drawn once. Paused while the tab is hidden; reduced motion
 * shows the meal moment, still.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from '../../i18n';
import { AvatarFigure, avatarLook, shade, type AvatarLook } from '../art';
import { dayPart, fmtFlightTime, localHour } from '../travel';
import './acts.css';
import { SeatedFigure } from './figure';
import { ease, fade, lerp, put, seg, text } from './types';

export type CabinClass = 'economy' | 'premium' | 'business';
export const cabinClassOf = (tier: number | undefined): CabinClass =>
  (tier ?? 2) >= 4 ? 'business' : (tier ?? 2) >= 3 ? 'premium' : 'economy';

// ---------------------------------------------------------------------------
// Perspective: the camera stands in the aisle at the front, eyes at y = 0.

const VP = { x: 200, y: 236 };
const K = 0.36;
const sAt = (z: number) => 1 / (1 + z * K);
/** Screen point for world (x, h) at depth z: h is down from eye level (floor = 330). */
const P = (x: number, h: number, z: number) => {
  const s = sAt(z);
  return { x: VP.x + x * s, y: VP.y + h * s, s };
};
const pt = (x: number, h: number, z: number) => {
  const p = P(x, h, z);
  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
};
const FLOOR = 290;
const CEIL = -215;
const BIN = -118;
const ROWS = 6;
const rowZ = (i: number) => 0.45 + i * 1.0;
const NEAR = -1.6;
const FAR = rowZ(ROWS - 1) + 1.1;
const YOUR_ROW = 2;

interface ClassSpec {
  perSide: number;
  seatW: number;
  aisle: number;
  seat: string;
  trim: string;
  wall: string;
  carpet: string;
  label: string;
  rowNo: number;
}
const CLASSES: Record<CabinClass, ClassSpec> = {
  economy: {
    perSide: 3,
    seatW: 54,
    aisle: 50,
    seat: '#1e3a8a',
    trim: '#38bdf8',
    wall: '#e7e5e4',
    carpet: '#475569',
    label: 'Economy',
    rowNo: 24,
  },
  premium: {
    perSide: 2,
    seatW: 70,
    aisle: 56,
    seat: '#334155',
    trim: '#f59e0b',
    wall: '#e7e5e4',
    carpet: '#3f3f46',
    label: 'Premium economy',
    rowNo: 12,
  },
  business: {
    perSide: 1,
    seatW: 112,
    aisle: 60,
    seat: '#d6c7a1',
    trim: '#7c2d12',
    wall: '#f5f0e6',
    carpet: '#44403c',
    label: 'Business',
    rowNo: 3,
  },
};

const BGS = [
  'f-engineer',
  'i-first',
  'b-wealthy',
  'f-dropout',
  'i-operator',
  'f-corporate',
  'b-fintech',
  'i-exited',
];
const LETTERS = 'ABCDEFGHJK';

/** One seat, front-on, with whoever is in it. */
function Seat({
  x,
  z,
  spec,
  cls,
  who,
  you,
  children,
}: {
  x: number;
  z: number;
  spec: ClassSpec;
  cls: CabinClass;
  who: AvatarLook | null;
  you?: boolean;
  children?: ReactNode;
}) {
  const w = spec.seatW - 6;
  const p = P(x, FLOOR, z);
  const s = p.s;
  const top = cls === 'business' ? -175 : cls === 'premium' ? -162 : -150;
  const fig = 3.4 * s;
  return (
    <g data-seat={you ? 'you' : undefined}>
      {/* Backrest and headrest. */}
      <rect
        x={p.x - (w / 2) * s}
        y={VP.y + (FLOOR + top) * s}
        width={w * s}
        height={(-top - 60) * s}
        rx={10 * s}
        fill={spec.seat}
      />
      <rect
        x={p.x - (w / 2 - 8) * s}
        y={VP.y + (FLOOR + top + 6) * s}
        width={(w - 16) * s}
        height={20 * s}
        rx={6 * s}
        fill={cls === 'business' ? '#f8fafc' : shade(spec.seat, 0.25)}
      />
      {/* The cushion and the base under it. */}
      <rect
        x={p.x - (w / 2) * s}
        y={VP.y + (FLOOR - 62) * s}
        width={w * s}
        height={26 * s}
        rx={6 * s}
        fill={shade(spec.seat, -0.15)}
      />
      <rect
        x={p.x - (w / 2 - 4) * s}
        y={VP.y + (FLOOR - 36) * s}
        width={(w - 8) * s}
        height={36 * s}
        fill={shade(spec.seat, -0.45)}
      />
      {who && (
        <g
          transform={`translate(${p.x.toFixed(1)} ${(VP.y + (FLOOR - 14) * s).toFixed(1)}) scale(${fig.toFixed(3)})`}
        >
          <SeatedFigure look={who} />
        </g>
      )}
      {children}
      {/* Armrests. */}
      <rect
        x={p.x - (w / 2 + 4) * s}
        y={VP.y + (FLOOR - 92) * s}
        width={8 * s}
        height={60 * s}
        rx={3 * s}
        fill={shade(spec.seat, -0.35)}
      />
      <rect
        x={p.x + (w / 2 - 4) * s}
        y={VP.y + (FLOOR - 92) * s}
        width={8 * s}
        height={60 * s}
        rx={3 * s}
        fill={shade(spec.seat, -0.35)}
      />
      {you && (
        <rect
          x={p.x - (w / 2 + 8) * s}
          y={VP.y + (FLOOR + top - 8) * s}
          width={(w + 16) * s}
          height={(-top + 8) * s}
          rx={12 * s}
          fill="none"
          stroke="#facc15"
          strokeWidth={4 * s}
          className="cab-you-ring"
        />
      )}
    </g>
  );
}

export function Cabin({
  from,
  to,
  hours,
  still,
  dur,
  tier,
  look,
}: {
  from: string;
  to: string;
  hours: number;
  still: boolean;
  /** How long the cabin phase lasts (ms). */
  dur: number;
  tier: number | undefined;
  /** You, in your seat. */
  look: AvatarLook;
}) {
  const cls = cabinClassOf(tier);
  const spec = CLASSES[cls];
  const root = useRef<HTMLDivElement>(null);
  const [mood, setMood] = useState<'awake' | 'sleep' | 'work'>('awake');
  const part = dayPart(localHour(from));
  const sky =
    part === 'night'
      ? ['#020617', '#1e3a8a']
      : part === 'dusk'
        ? ['#7c3aed', '#fb923c']
        : ['#0284c7', '#bae6fd'];
  const night = part === 'night';

  // The seats: who sits where (stable per route), and yours.
  const seats = useMemo(() => {
    const out: {
      x: number;
      z: number;
      row: number;
      who: AvatarLook | null;
      you: boolean;
      seat: string;
    }[] = [];
    for (let i = ROWS - 1; i >= 0; i--) {
      const z = rowZ(i);
      for (let side = -1; side <= 1; side += 2)
        for (let j = 0; j < spec.perSide; j++) {
          const x = side * (spec.aisle + spec.seatW / 2 + j * spec.seatW);
          const you = i === YOUR_ROW && side === -1 && j === 0;
          const idx = i * 10 + (side + 1) * 3 + j;
          let h = 0;
          const key = `${from}:${to}:${idx}`;
          for (let q = 0; q < key.length; q++) h = (h * 31 + key.charCodeAt(q)) >>> 0;
          const taken = you || h % 4 !== 0;
          const col = side < 0 ? spec.perSide - 1 - j : spec.perSide + j;
          out.push({
            x,
            z,
            row: i,
            you,
            seat: `${spec.rowNo + i}${LETTERS[col]}`,
            who: you ? look : taken ? avatarLook(BGS[h % BGS.length], `pax:${key}`) : null,
          });
        }
    }
    return out;
  }, [from, to, spec, look]);
  const mine = seats.find((s) => s.you)!;
  const youP = P(mine.x, FLOOR, mine.z);
  const W = spec.aisle + spec.perSide * spec.seatW + 14;

  useEffect(() => {
    const map = new Map<string, SVGElement>();
    root.current?.querySelectorAll<SVGElement>('[data-n]').forEach((x) => map.set(x.dataset.n!, x));
    const n = (k: string) => map.get(k);
    const yourZ = rowZ(YOUR_ROW);
    let lastStep = '';
    const put2 = (ms: number) => {
      const k = Math.min(1, ms / dur);
      // The trolley: from the back to your row, a stop for the meal, then past you.
      const z =
        k < 0.42
          ? lerp(FAR - 0.3, yourZ + 0.15, ease(seg(k, 0.1, 0.42)))
          : k < 0.62
            ? yourZ + 0.15
            : lerp(yourZ + 0.15, NEAR - 0.6, ease(seg(k, 0.62, 0.98)));
      const tp = P(0, FLOOR, z);
      put(n('trolley'), tp.x, tp.y, tp.s);
      fade(n('trolley'), seg(k, 0.06, 0.12));
      const cz = z + 0.55;
      const cp = P(0, FLOOR, cz);
      const bob = Math.abs(Math.sin(ms / 260)) * 3 * cp.s;
      put(n('crew'), cp.x, cp.y - bob, 3.4 * cp.s);
      fade(n('crew'), seg(k, 0.06, 0.12));
      // Your meal arrives while the trolley is by your row.
      const meal = seg(k, 0.48, 0.54);
      fade(n('meal'), meal);
      put(n('meal'), youP.x, youP.y - 70 * youP.s + (1 - meal) * -20, youP.s);
      // The seatbelt sign: on for take-off, off, on again for landing.
      const belt = k < 0.16 || k > 0.9;
      fade(n('belt1'), belt ? 1 : 0.15);
      fade(n('belt2'), belt ? 1 : 0.15);
      fade(n('ding'), belt && (k < 0.04 || (k > 0.9 && k < 0.94)) ? 1 : 0);
      const step =
        k < 0.16
          ? 'Seatbelt sign on'
          : k < 0.42
            ? 'Cruising'
            : k < 0.66
              ? 'Meal service'
              : k < 0.9
                ? 'Enjoy the flight'
                : 'Starting our descent';
      if (step !== lastStep) {
        lastStep = step;
        text(n('status'), t(step));
      }
      // Out of the window: clouds slide past.
      put(n('far'), -((ms / 1000) * 14) % 140, 0);
      put(n('near'), -((ms / 1000) * 50) % 140, 0);
      // The flight map.
      const a = Math.PI * (1 - k);
      const mx = 60 + 46 * Math.cos(a);
      const my = 58 - 34 * Math.sin(a);
      const a2 = Math.PI * (1 - Math.min(1, k + 0.01));
      const deg =
        (Math.atan2(58 - 34 * Math.sin(a2) - my, 60 + 46 * Math.cos(a2) - mx) * 180) / Math.PI;
      n('plane')?.setAttribute(
        'transform',
        `translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${deg.toFixed(0)})`,
      );
      text(n('left'), fmtFlightTime(hours * (1 - k)));
    };
    if (still) {
      put2(dur * 0.55);
      return;
    }
    let raf = 0;
    let t0 = -1;
    let hiddenAt = 0;
    const step = (now: number) => {
      if (t0 < 0) t0 = now;
      put2(now - t0);
      raf = requestAnimationFrame(step);
    };
    const onVis = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
        cancelAnimationFrame(raf);
      } else {
        if (hiddenAt && t0 >= 0) t0 += performance.now() - hiddenAt;
        hiddenAt = 0;
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [hours, still, dur, youP.x, youP.y, youP.s]);

  const crew = avatarLook('f-corporate', `${from}:${to}:crew`);
  const crew2 = avatarLook('i-banker', `${from}:${to}:crew2`);
  const binA = spec.aisle + 26;
  const side = (sgn: number) => {
    const a = sgn * binA;
    const w = sgn * W;
    return (
      <g key={sgn}>
        {/* The side wall, with a window per row. */}
        <polygon
          points={`${pt(w, CEIL + 60, NEAR)} ${pt(w, CEIL + 60, FAR)} ${pt(w, FLOOR, FAR)} ${pt(w, FLOOR, NEAR)}`}
          fill={shade(spec.wall, -0.06)}
        />
        {Array.from({ length: ROWS + 1 }, (_, i) => {
          const p = P(w, 20, rowZ(i) - 0.5);
          return (
            <g key={i}>
              <ellipse cx={p.x} cy={p.y} rx={9 * p.s} ry={26 * p.s} fill="#cbd5e1" />
              <ellipse cx={p.x} cy={p.y} rx={6.5 * p.s} ry={21 * p.s} fill={sky[1]} />
              <ellipse
                cx={p.x}
                cy={p.y - 8 * p.s}
                rx={6.5 * p.s}
                ry={10 * p.s}
                fill={sky[0]}
                opacity="0.7"
              />
            </g>
          );
        })}
        {/* Overhead bins: their bottom, then the front face over the aisle. */}
        <polygon
          points={`${pt(a, BIN, NEAR)} ${pt(a, BIN, FAR)} ${pt(w, BIN - 20, FAR)} ${pt(w, BIN - 20, NEAR)}`}
          fill={shade(spec.wall, -0.18)}
        />
        <polygon
          points={`${pt(a, CEIL + 20, NEAR)} ${pt(a, CEIL + 20, FAR)} ${pt(a, BIN, FAR)} ${pt(a, BIN, NEAR)}`}
          fill={spec.wall}
        />
        {Array.from({ length: ROWS + 2 }, (_, i) => {
          const z = rowZ(i) - 1.04;
          return (
            <g key={i}>
              <line
                x1={P(a, CEIL + 20, z).x}
                y1={P(a, CEIL + 20, z).y}
                x2={P(a, BIN, z).x}
                y2={P(a, BIN, z).y}
                stroke={shade(spec.wall, -0.2)}
                strokeWidth={2 * sAt(z)}
              />
              <rect
                x={P(a, BIN - 14, z + 0.5).x - (sgn > 0 ? 0 : 8 * sAt(z + 0.5))}
                y={P(a, BIN - 14, z + 0.5).y}
                width={8 * sAt(z + 0.5)}
                height={4 * sAt(z + 0.5)}
                rx={2 * sAt(z + 0.5)}
                fill={shade(spec.wall, -0.4)}
              />
              <circle
                cx={P((a + w) / 2, BIN - 10, z + 0.5).x}
                cy={P((a + w) / 2, BIN - 10, z + 0.5).y}
                r={3 * sAt(z + 0.5)}
                fill={night ? '#fde68a' : '#f8fafc'}
              />
            </g>
          );
        })}
        {/* The seatbelt sign, over the first rows. */}
        <g
          transform={`translate(${P((a + w) / 2, BIN - 6, 1.3).x} ${P((a + w) / 2, BIN - 6, 1.3).y}) scale(${sAt(1.3)})`}
        >
          <rect x="-22" y="-2" width="44" height="18" rx="4" fill="#1c1917" />
          <g data-n={sgn < 0 ? 'belt1' : 'belt2'}>
            <circle cx="-9" cy="7" r="5.5" fill="#fbbf24" />
            <rect x="0" y="4" width="16" height="6" rx="2" fill="#fbbf24" />
          </g>
        </g>
      </g>
    );
  };

  return (
    <div className={`fl-cabin cab-${cls} is-${mood}`} data-cabin={cls} ref={root}>
      <svg
        className="fl-svg"
        viewBox="-200 0 800 640"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <linearGradient id="cab-light" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0"
              stopColor={night ? '#312e81' : '#fff'}
              stopOpacity={night ? 0.35 : 0.2}
            />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="-400" y="-100" width="1200" height="900" fill={spec.wall} />
        {/* Ceiling, the galley at the back, the floor. */}
        <polygon
          points={`${pt(-W, CEIL + 60, NEAR)} ${pt(-binA, CEIL, NEAR)} ${pt(binA, CEIL, NEAR)} ${pt(W, CEIL + 60, NEAR)} ${pt(W, CEIL + 60, FAR)} ${pt(binA, CEIL, FAR)} ${pt(-binA, CEIL, FAR)} ${pt(-W, CEIL + 60, FAR)}`}
          fill={shade(spec.wall, 0.04)}
        />
        <polygon
          points={`${pt(-20, CEIL + 2, NEAR)} ${pt(20, CEIL + 2, NEAR)} ${pt(20, CEIL + 2, FAR)} ${pt(-20, CEIL + 2, FAR)}`}
          fill={night ? '#818cf8' : '#fef9c3'}
          opacity="0.8"
        />
        <g>
          <polygon
            points={`${pt(-W, CEIL + 60, FAR)} ${pt(W, CEIL + 60, FAR)} ${pt(W, FLOOR, FAR)} ${pt(-W, FLOOR, FAR)}`}
            fill={shade(spec.wall, -0.1)}
          />
          <rect
            x={P(-binA + 6, CEIL + 40, FAR).x}
            y={P(0, CEIL + 40, FAR).y}
            width={(binA - 6) * 2 * sAt(FAR)}
            height={(FLOOR - CEIL - 40) * sAt(FAR)}
            fill={spec.trim}
            opacity="0.85"
          />
          <rect
            x={P(-24, 0, FAR).x}
            y={P(0, CEIL + 70, FAR).y}
            width={48 * sAt(FAR)}
            height={14 * sAt(FAR)}
            rx={3}
            fill="#16a34a"
          />
        </g>
        <polygon
          points={`${pt(-W, FLOOR, NEAR)} ${pt(W, FLOOR, NEAR)} ${pt(W, FLOOR, FAR)} ${pt(-W, FLOOR, FAR)}`}
          fill={shade(spec.carpet, 0.15)}
        />
        <polygon
          points={`${pt(-spec.aisle + 6, FLOOR, NEAR)} ${pt(spec.aisle - 6, FLOOR, NEAR)} ${pt(spec.aisle - 6, FLOOR, FAR)} ${pt(-spec.aisle + 6, FLOOR, FAR)}`}
          fill={spec.carpet}
        />
        {Array.from({ length: 10 }, (_, i) => {
          const z = NEAR + i * 0.9;
          return (
            <g key={i} fill={night ? '#a5b4fc' : '#fde68a'} opacity="0.7">
              <circle cx={P(-spec.aisle + 4, FLOOR, z).x} cy={P(0, FLOOR, z).y} r={2.2 * sAt(z)} />
              <circle cx={P(spec.aisle - 4, FLOOR, z).x} cy={P(0, FLOOR, z).y} r={2.2 * sAt(z)} />
            </g>
          );
        })}
        {side(-1)}
        {side(1)}
        {/* The rows, back to front. */}
        {seats.map((s) => (
          <Seat
            key={`${s.row}:${s.x}`}
            x={s.x}
            z={s.z}
            spec={spec}
            cls={cls}
            who={s.who}
            you={s.you}
          >
            {cls === 'business' && (
              <rect
                x={
                  P(s.x + (s.x < 0 ? -spec.seatW / 2 - 4 : spec.seatW / 2 - 18), FLOOR - 100, s.z).x
                }
                y={P(0, FLOOR - 100, s.z).y}
                width={22 * sAt(s.z)}
                height={100 * sAt(s.z)}
                fill="#7c2d12"
              />
            )}
          </Seat>
        ))}
        {/* You: a tag over your seat; your meal; sleep or work. */}
        <g transform={`translate(${youP.x.toFixed(1)} ${(youP.y - 196 * youP.s).toFixed(1)})`}>
          <rect x="-34" y="-14" width="68" height="18" rx="9" fill="#facc15" />
          <text y="-1" textAnchor="middle" className="cab-tag">
            {t('You · {seat}', { seat: mine.seat })}
          </text>
        </g>
        <g data-n={'meal'} opacity="0" data-meal="">
          <rect x="-26" y="-6" width="52" height="8" rx="2" fill="#94a3b8" />
          <rect x="-22" y="-12" width="20" height="7" rx="2" fill="#f8fafc" />
          <ellipse cx="-12" cy="-12" rx="7" ry="2.2" fill="#ea580c" />
          <rect x="4" y="-14" width="7" height="9" rx="1.5" fill="#f8fafc" />
          <rect x="13" y="-11" width="8" height="5" rx="1" fill="#fde68a" />
          <path
            d="M -12 -16 q 3 -5 0 -9 M -8 -16 q 3 -5 0 -9"
            stroke="#fff"
            strokeWidth="1.2"
            fill="none"
            className="cab-steam"
          />
        </g>
        {mood === 'work' && (
          <g
            transform={`translate(${youP.x.toFixed(1)} ${(youP.y - 70 * youP.s).toFixed(1)}) scale(${youP.s.toFixed(3)})`}
          >
            <path d="M -24 0 L -18 -30 L 18 -30 L 24 0 Z" fill="#334155" />
            <rect x="-15" y="-27" width="30" height="22" fill="#a5f3fc" className="fl-laptop" />
          </g>
        )}
        {/* The trolley and the crew member pushing it. */}
        <g data-n={'crew'} opacity="0">
          <AvatarFigure look={crew} />
        </g>
        <g data-n={'trolley'} opacity="0" data-trolley="">
          <rect x="-34" y="-96" width="68" height="92" rx="5" fill="#cbd5e1" />
          <rect x="-34" y="-96" width="68" height="8" rx="4" fill="#94a3b8" />
          {[0, 1, 2].map((k) => (
            <rect
              key={k}
              x="-28"
              y={-84 + k * 26}
              width="56"
              height="20"
              rx="3"
              fill="#e2e8f0"
              stroke="#94a3b8"
            />
          ))}
          <rect x="-8" y="-77" width="16" height="3" rx="1.5" fill="#64748b" />
          <rect x="-26" y="-114" width="8" height="18" rx="2" fill="#16a34a" />
          <rect x="-14" y="-110" width="10" height="14" rx="2" fill="#f97316" />
          <rect x="0" y="-108" width="8" height="12" rx="2" fill="#f8fafc" />
          <rect x="12" y="-112" width="10" height="16" rx="2" fill="#dc2626" />
          <circle cx="-26" cy="0" r="6" fill="#1f2937" />
          <circle cx="26" cy="0" r="6" fill="#1f2937" />
        </g>
        {/* A second crew member at the galley for the take-off demo. */}
        <g
          transform={`translate(${P(-18, FLOOR, FAR - 0.15).x} ${P(0, FLOOR, FAR - 0.15).y}) scale(${(3.4 * sAt(FAR - 0.15)).toFixed(3)})`}
        >
          <AvatarFigure look={crew2} />
        </g>
        <rect
          x="-400"
          y="-100"
          width="1200"
          height="900"
          fill="url(#cab-light)"
          pointerEvents="none"
        />
        {mood === 'sleep' && (
          <g className="fl-zzz">
            <rect x="-400" y="-100" width="1200" height="900" fill="#020617" opacity="0.55" />
            <text
              x={youP.x + 30}
              y={youP.y - 200 * youP.s}
              fontSize="30"
              fontWeight="800"
              fill="#e0e7ff"
            >
              Z z z
            </text>
          </g>
        )}
        <text data-n={'ding'} x="200" y="60" textAnchor="middle" className="cab-ding" opacity="0">
          🔔
        </text>
      </svg>

      {/* The window you'd see from your seat. */}
      <svg className="cab-window" viewBox="0 0 120 150" aria-hidden data-window="">
        <defs>
          <linearGradient id="cab-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sky[0]} />
            <stop offset="1" stopColor={sky[1]} />
          </linearGradient>
          <clipPath id="cab-oval">
            <ellipse cx="60" cy="75" rx="46" ry="62" />
          </clipPath>
        </defs>
        <rect width="120" height="150" rx="22" fill={spec.wall} />
        <g clipPath="url(#cab-oval)">
          <rect width="120" height="150" fill="url(#cab-sky)" />
          {night &&
            [14, 40, 70, 96, 30, 84].map((x, k) => (
              <circle key={k} cx={x} cy={18 + k * 9} r="0.9" fill="#fff" />
            ))}
          <g data-n={'far'}>
            {[0, 70, 140, 210].map((x) => (
              <ellipse
                key={x}
                cx={x + 20}
                cy="96"
                rx="26"
                ry="7"
                fill="#fff"
                opacity={night ? 0.25 : 0.75}
              />
            ))}
          </g>
          <g data-n={'near'}>
            {[0, 70, 140, 210].map((x) => (
              <g key={x} opacity={night ? 0.35 : 0.95}>
                <ellipse cx={x + 30} cy="124" rx="34" ry="12" fill="#fff" />
                <ellipse cx={x + 46} cy="116" rx="18" ry="10" fill="#fff" />
              </g>
            ))}
          </g>
          <path d="M 0 112 L 70 98 L 74 104 L 10 132 Z" fill="#cbd5e1" />
        </g>
        <ellipse
          cx="60"
          cy="75"
          rx="46"
          ry="62"
          fill="none"
          stroke={shade(spec.wall, -0.15)}
          strokeWidth="6"
        />
        <rect
          x="26"
          y="8"
          width="68"
          height="18"
          rx="8"
          fill={shade(spec.wall, 0.04)}
          opacity="0.9"
        />
      </svg>

      {/* The seat-back map: where you are, and the time left. */}
      <svg className="cab-map" viewBox="0 0 120 112" data-map="">
        <rect width="120" height="112" rx="12" fill="#0f172a" />
        <path
          d="M 14 58 A 46 34 0 0 1 106 58"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2"
          strokeDasharray="3 4"
        />
        <circle cx="14" cy="58" r="3" fill="#f59e0b" />
        <circle cx="106" cy="58" r="3" fill="#f59e0b" />
        <g data-n={'plane'} data-flight-plane="">
          <path d="M 6 0 L -4 -3.4 L -2.6 0 L -4 3.4 Z" fill="#fff" />
          <path d="M 1 0 L -2.6 -7 L -4.4 -7 L -2.6 0 L -4.4 7 L -2.6 7 Z" fill="#fff" />
        </g>
        <text data-n={'left'} x="60" y="82" textAnchor="middle" className="fl-left">
          {fmtFlightTime(hours)}
        </text>
        <text x="60" y="94" textAnchor="middle" className="fl-left-sub">
          {t('to go')}
        </text>
        <text data-n={'status'} x="60" y="106" textAnchor="middle" className="cab-status">
          {t('Seatbelt sign on')}
        </text>
        <text x="60" y="16" textAnchor="middle" className="cab-class">
          {t(spec.label)}
        </text>
      </svg>

      <div className="fl-cabin-acts">
        <button
          type="button"
          aria-pressed={mood === 'sleep'}
          onClick={() => setMood((m) => (m === 'sleep' ? 'awake' : 'sleep'))}
        >
          {t('Sleep through')}
        </button>
        <button
          type="button"
          aria-pressed={mood === 'work'}
          onClick={() => setMood((m) => (m === 'work' ? 'awake' : 'work'))}
        >
          {t('Work on laptop')}
        </button>
      </div>
    </div>
  );
}
