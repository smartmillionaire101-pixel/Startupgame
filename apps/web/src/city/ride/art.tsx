/**
 * Shared art for the ride scenes: skies by time of day, a city's skyline and
 * street in its own palette, side-view vehicles and people. Everything is
 * static SVG; the scenes move whole layers through refs.
 */
import type { ReactNode, RefObject } from 'react';
import type { AvatarLook } from '../art';
import type { Flavour } from '../flavour';
import { seeded, type DayPart } from '../travel';

/** A scene's frameRef callback: ms since the ride began and progress 0–1. */
export type Frame = (ms: number, k: number) => void;
export type FrameRef = RefObject<Frame | null>;

export interface SceneProps {
  /** Unique per ride: SVG ids. */
  uid: string;
  flavour: Flavour;
  marketId: string;
  part: DayPart;
  look: AvatarLook;
  frameRef: FrameRef;
}

/** Visible area of a 400×600 viewBox drawn with "meet" on any screen. */
export const VB = { w: 400, h: 600, x0: -800, x1: 1200, y0: -400, y1: 1000 };

export const SKY: Record<DayPart, [string, string]> = {
  day: ['#38bdf8', '#e0f2fe'],
  dusk: ['#f97316', '#fde68a'],
  night: ['#0b1026', '#3730a3'],
};

export function Sky({
  uid,
  part,
  horizon = 380,
}: {
  uid: string;
  part: DayPart;
  horizon?: number;
}) {
  const [a, b] = SKY[part];
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect
        x={VB.x0}
        y={VB.y0}
        width={VB.x1 - VB.x0}
        height={horizon - VB.y0}
        fill={`url(#${uid}-sky)`}
      />
      {part === 'night' ? (
        <>
          <circle cx="320" cy="70" r="16" fill="#fef9c3" />
          <circle cx="313" cy="64" r="14" fill={a} />
          {Array.from({ length: 14 }, (_, k) => (
            <circle
              key={k}
              cx={-300 + ((k * 137) % 1100)}
              cy={-120 + ((k * 89) % 320)}
              r={k % 3 ? 1 : 1.6}
              fill="#fff"
              opacity="0.8"
            />
          ))}
        </>
      ) : (
        <circle
          cx="320"
          cy={part === 'dusk' ? 300 : 70}
          r={part === 'dusk' ? 34 : 24}
          fill="#fde68a"
          opacity="0.95"
        />
      )}
    </>
  );
}

/**
 * A layer that repeats every `period` px horizontally: the content is drawn
 * once in <defs> and used three times, so moving it is one transform.
 */
export function Repeat({
  id,
  period,
  layerRef,
  children,
  y = 0,
}: {
  id: string;
  period: number;
  layerRef: RefObject<SVGGElement | null>;
  children: ReactNode;
  y?: number;
}) {
  return (
    <g transform={`translate(0 ${y})`}>
      <defs>
        <g id={id}>{children}</g>
      </defs>
      <g ref={layerRef} data-layer={id}>
        {[-1, 0, 1].map((n) => (
          <use key={n} href={`#${id}`} x={VB.x0 + n * period + period} />
        ))}
      </g>
    </g>
  );
}

/** Slide a repeating layer left at `speed` px a second. */
export const slide = (el: SVGGElement | null, ms: number, speed: number, period: number) => {
  if (!el) return;
  const x = -((ms / 1000) * speed) % period;
  el.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
};

const mix = (a: string, b: string, f: number) => {
  const p = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x
    .map((v, i) =>
      Math.round(v + (y[i]! - v) * f)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

/** The far skyline, in the city's colours faded into the sky. */
export function Skyline({
  flavour,
  part,
  seed,
  period,
  base,
}: {
  flavour: Flavour;
  part: DayPart;
  seed: number;
  period: number;
  base: number;
}) {
  const rnd = seeded(seed);
  const haze = SKY[part][1];
  const out: ReactNode[] = [];
  let x = 0;
  let k = 0;
  while (x < period) {
    const w = 26 + Math.floor(rnd() * 40);
    const h = 40 + Math.floor(rnd() * 110);
    const wall = flavour.walls[k % flavour.walls.length]!;
    const fill = mix(part === 'night' ? '#1e1b4b' : wall, haze, part === 'night' ? 0.15 : 0.45);
    out.push(<rect key={k} x={x} y={base - h} width={w} height={h} fill={fill} />);
    // A tall landmark-ish tower now and then.
    if (k % 7 === 3)
      out.push(
        <rect
          key={`t${k}`}
          x={x + w / 2 - 4}
          y={base - h - 50}
          width="8"
          height="50"
          fill={mix(flavour.landmarkColor, haze, 0.4)}
        />,
      );
    x += w + 2;
    k++;
  }
  return <>{out}</>;
}

/** Mid-distance buildings with windows, billboards naming the city's streets. */
export function Street({
  flavour,
  part,
  seed,
  period,
  base,
  signs,
}: {
  flavour: Flavour;
  part: DayPart;
  seed: number;
  period: number;
  base: number;
  signs: string[];
}) {
  const rnd = seeded(seed);
  const out: ReactNode[] = [];
  let x = 0;
  let k = 0;
  const lit = part === 'night' ? '#fde68a' : '#bae6fd';
  while (x < period - 60) {
    const w = 70 + Math.floor(rnd() * 70);
    const h = 70 + Math.floor(rnd() * 120);
    const wall = flavour.walls[(k * 3 + 1) % flavour.walls.length]!;
    const roof = flavour.roofs[k % flavour.roofs.length]!;
    out.push(
      <g key={k}>
        <rect x={x} y={base - h} width={w} height={h} fill={wall} />
        <rect x={x - 3} y={base - h - 6} width={w + 6} height="8" fill={roof} />
        {Array.from({ length: Math.floor(h / 34) }, (_, r) => (
          <rect
            key={r}
            x={x + 10}
            y={base - h + 14 + r * 34}
            width={w - 20}
            height="14"
            fill={lit}
            opacity={part === 'night' ? 0.85 : 0.6}
          />
        ))}
        <rect x={x + w / 2 - 9} y={base - 28} width="18" height="28" fill="#334155" />
      </g>,
    );
    if (k % 2 === 1 && signs.length) {
      const text = signs[Math.floor(k / 2) % signs.length]!.toUpperCase();
      const bw = Math.max(90, text.length * 8 + 20);
      out.push(
        <g key={`b${k}`} transform={`translate(${x + w + 6} ${base - 150})`}>
          <rect x={bw / 2 - 3} y="40" width="6" height="110" fill="#475569" />
          <rect width={bw} height="44" rx="3" fill="#0f172a" />
          <rect x="3" y="3" width={bw - 6} height="38" rx="2" fill={roof} />
          <text
            x={bw / 2}
            y="27"
            textAnchor="middle"
            fontSize="13"
            fontWeight="800"
            fill="#fff"
            fontFamily="system-ui, sans-serif"
          >
            {text}
          </text>
        </g>,
      );
      x += bw + 12;
    }
    x += w + 10;
    k++;
  }
  return <>{out}</>;
}

/** Near things at the kerb: lamps and the city's trees. */
export function Kerb({
  flavour,
  period,
  base,
}: {
  flavour: Flavour;
  period: number;
  base: number;
}) {
  const out: ReactNode[] = [];
  const [l1, l2] = flavour.leaf;
  for (let x = 40, k = 0; x < period; x += 160, k++) {
    if (k % 2)
      out.push(
        <g key={k} transform={`translate(${x} ${base})`}>
          <rect x="-2" y="-120" width="4" height="120" fill="#334155" />
          <rect x="-2" y="-120" width="26" height="4" fill="#334155" />
          <ellipse cx="22" cy="-114" rx="7" ry="3" fill="#fef08a" />
        </g>,
      );
    else if (flavour.tree === 'palm')
      out.push(
        <g key={k} transform={`translate(${x} ${base})`}>
          <path d="M -3 0 Q -6 -60 4 -120 L 8 -120 Q 2 -60 4 0 Z" fill="#92400e" />
          {[-60, -25, 15, 50, 85].map((a, i) => (
            <path
              key={i}
              d="M 6 -120 q 30 -14 52 6 q -26 -4 -52 -6 Z"
              fill={i % 2 ? l1 : l2}
              transform={`rotate(${a} 6 -120)`}
            />
          ))}
        </g>,
      );
    else
      out.push(
        <g key={k} transform={`translate(${x} ${base})`}>
          <rect x="-3" y="-60" width="6" height="60" fill="#78350f" />
          <circle cx="0" cy="-78" r="28" fill={l2} />
          <circle cx="-10" cy="-86" r="18" fill={l1} />
        </g>,
      );
  }
  return <>{out}</>;
}

/** A side-on person sitting or riding: head, torso, arm (facing right). */
export function SideTorso({ look, lean = 0 }: { look: AvatarLook; lean?: number }) {
  return (
    <g transform={`rotate(${lean})`}>
      <rect x="-9" y="-44" width="18" height="34" rx="7" fill={look.top} />
      <rect x="-4" y="-50" width="8" height="8" fill={look.skin} />
      <circle cx="1" cy="-58" r="10" fill={look.skin} />
      <path d="M -10 -60 Q -6 -72 6 -70 Q 12 -66 11 -60 Q 2 -64 -10 -56 Z" fill={look.hair} />
      {look.hairStyle === 'afro' || look.hairStyle === 'bun' ? (
        <circle cx="-7" cy="-64" r={look.hairStyle === 'afro' ? 9 : 5} fill={look.hair} />
      ) : null}
      {look.hairStyle === 'long' || look.hairStyle === 'braids' ? (
        <rect x="-11" y="-62" width="7" height="22" rx="3" fill={look.hair} />
      ) : null}
      <circle cx="7" cy="-58" r="1.4" fill="#0f172a" />
    </g>
  );
}

/** A side-on minibus, car or motorbike, facing left (oncoming), wheels at y = 0. */
export function SideVehicle({
  kind,
  body,
  accent,
}: {
  kind: string;
  body: string;
  accent: string;
}) {
  if (kind === 'bike')
    return (
      <g>
        <circle cx="-16" cy="-8" r="8" fill="none" stroke="#111827" strokeWidth="3" />
        <circle cx="16" cy="-8" r="8" fill="none" stroke="#111827" strokeWidth="3" />
        <path d="M -16 -8 L -2 -20 L 14 -20 L 16 -8" stroke={body} strokeWidth="4" fill="none" />
        <rect x="-6" y="-48" width="12" height="26" rx="5" fill={accent} />
        <circle cx="-2" cy="-54" r="7" fill="#7c2d12" />
        <circle cx="-2" cy="-56" r="7.5" fill={body} />
      </g>
    );
  if (kind === 'keke')
    return (
      <g>
        <path d="M -30 -10 L -26 -46 Q -10 -54 20 -46 L 30 -10 Z" fill={body} />
        <path d="M -22 -40 L -6 -40 L -6 -20 L -24 -20 Z" fill="#1e293b" opacity="0.7" />
        <rect x="-30" y="-14" width="60" height="5" fill={accent} />
        <circle cx="-18" cy="-6" r="6" fill="#111827" />
        <circle cx="20" cy="-6" r="6" fill="#111827" />
      </g>
    );
  const bus = kind === 'bus';
  const len = bus ? 120 : 76;
  const h = bus ? 52 : 30;
  return (
    <g>
      <rect x={-len / 2} y={-h - 8} width={len} height={h} rx={bus ? 8 : 10} fill={body} />
      {bus ? (
        <>
          {Array.from({ length: 5 }, (_, k) => (
            <rect
              key={k}
              x={-len / 2 + 8 + k * 22}
              y={-h + 2}
              width="18"
              height="16"
              rx="2"
              fill="#1e293b"
              opacity="0.8"
            />
          ))}
          <rect x={-len / 2} y={-22} width={len} height="5" fill={accent} />
        </>
      ) : (
        <path
          d={`M ${-len / 2 + 14} ${-h - 8} L ${-len / 2 + 24} ${-h - 24} L ${len / 2 - 20} ${-h - 24} L ${len / 2 - 8} ${-h - 8} Z`}
          fill={body}
        />
      )}
      <circle cx={-len / 2 + 18} cy="-6" r="8" fill="#111827" />
      <circle cx={len / 2 - 18} cy="-6" r="8" fill="#111827" />
    </g>
  );
}

/** What passes in a city: its own vehicles where we know them. */
export function trafficOf(flavour: Flavour): { kind: string; body: string; accent: string }[] {
  const out = flavour.vehicles.map((v) => ({
    kind:
      v.extra === 'rider'
        ? 'bike'
        : v.id.startsWith('keke')
          ? 'keke'
          : v.len >= 0.75
            ? 'bus'
            : 'car',
    body: v.body,
    accent: v.accent,
  }));
  return out.length ? out : [{ kind: 'car', body: '#2563eb', accent: '#e2e8f0' }];
}
