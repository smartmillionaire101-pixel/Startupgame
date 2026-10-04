/**
 * The illustrated city: an SVG scene with a camera (drag, pinch, wheel,
 * arrow keys), ambient traffic and the player's avatar walking the streets.
 *
 * Rendering is split in two: the static scene is memoised and only rebuilt
 * when the layout changes; the camera, the avatar and the walk animation
 * write straight to the DOM through refs, so panning and walking never
 * re-render React.
 */
import { memo, useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { t } from '../i18n';
import {
  ArtDefs,
  AvatarFigure,
  Building,
  Bunting,
  DecorItem,
  P,
  VehicleShape,
  shade,
  type AvatarLook,
} from './art';
import {
  B,
  findPath,
  nearestStreetPoint,
  pathLength,
  pointAlong,
  project,
  TH,
  TW,
  unproject,
  MARGIN,
  type Boat,
  type Bridge,
  type Water,
  type CityLayout,
  type DistrictId,
  type Place,
  type Pt,
} from './layout';
import { CATEGORY_COLOR } from './contract';
import { Crowd } from './Crowd';
import type { AiPerson, PresenceView } from './people';

// ---------------------------------------------------------------------------
// Reduced motion, as a subscribable media query.

const RM = '(prefers-reduced-motion: reduce)';
const subscribeRM = (cb: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(RM);
  mq.addEventListener?.('change', cb);
  return () => mq.removeEventListener?.('change', cb);
};
const getRM = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(RM).matches;
export const useReducedMotion = () => useSyncExternalStore(subscribeRM, getRM, () => false);

const NONE_AI: AiPerson[] = [];
const NONE_PLAYERS: PresenceView[] = [];
const NONE_FLAGS: string[] = [];

/** Last avatar position per market, so switching tabs doesn't send you home. */
const lastPos = new Map<string, Pt>();

export interface CityMapHandle {
  /** Walk to a place's door, then call onEnter. */
  goTo: (placeId: string) => void;
  /** Walk to a place's door without going in. */
  walkToPlace: (placeId: string) => void;
  recentre: () => void;
  zoom: (factor: number) => void;
}

export const districtLabel = (id: DistrictId) =>
  (
    ({
      downtown: t('Downtown'),
      residential: t('Residential'),
      finance: t('Finance Row'),
      investors: t('Investor Quarter'),
      market: t('The Market'),
      events: t('Event Hall'),
      airport: t('Airport'),
    }) as Partial<Record<DistrictId, string>>
  )[id] ?? '';

// ---------------------------------------------------------------------------
// Static scene

/** The legacy coast: water along the front-left edge. */
const legacyWater = (E: number): Water => ({
  name: '',
  kind: 'edge',
  side: 'south',
  x0: -MARGIN,
  y0: E + 1.8,
  x1: E + MARGIN,
  y1: E + MARGIN,
});

const rect = (x0: number, y0: number, x1: number, y1: number, z = 0) =>
  [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)].join(' ');

/** Sand along a coast, between the land and the water. */
function shoreOf(w: Water, E: number): [number, number, number, number] {
  const m = MARGIN;
  switch (w.side) {
    case 'south':
      return [-m, E + 1.1, E + m, E + 1.9];
    case 'north':
      return [-m, -1.9, E + m, -1.1];
    case 'east':
      return [E + 1.1, -m, E + 1.9, E + m];
    default:
      return [-1.9, -m, -1.1, E + m];
  }
}

function WaterBody({ w, E }: { w: Water; E: number }) {
  const out: ReactNode[] = [];
  if (w.kind === 'edge') {
    const [a, b, c, d] = shoreOf(w, E);
    out.push(<polygon key="shore" points={rect(a, b, c, d)} fill="#f5e6c4" />);
  } else {
    // Stone embankments either side of the river.
    const along = w.x1 - w.x0 > w.y1 - w.y0;
    out.push(
      <polygon
        key="bank"
        points={
          along
            ? rect(w.x0, w.y0 - 0.12, w.x1, w.y1 + 0.12)
            : rect(w.x0 - 0.12, w.y0, w.x1 + 0.12, w.y1)
        }
        fill="#a8a29e"
      />,
    );
  }
  out.push(<polygon key="water" points={rect(w.x0, w.y0, w.x1, w.y1)} fill="url(#water)" />);
  const W = w.x1 - w.x0;
  const H = w.y1 - w.y0;
  for (let k = 0; k < 14; k++) {
    const a = project(
      w.x0 + 0.5 + ((k * 7.3) % Math.max(1, W - 1)),
      w.y0 + 0.3 + ((k * 1.7) % Math.max(0.4, H - 0.6)),
    );
    out.push(
      <path
        key={`wave${k}`}
        className="city-wave"
        style={{ animationDelay: `${-k * 0.7}s` }}
        d={`M ${a.x} ${a.y} q 5 -3 10 0 q 5 3 10 0`}
        stroke="#fff"
        strokeOpacity="0.55"
        strokeWidth="1.2"
        fill="none"
      />,
    );
  }
  return (
    <g data-water={w.name || 'water'} data-water-kind={w.kind}>
      {out}
    </g>
  );
}

/** A bridge deck over the water, with railings in the bridge's colour. */
function Deck({ br, asphalt }: { br: Bridge; asphalt: string }) {
  const dx = br.to.x - br.from.x;
  const dy = br.to.y - br.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * 0.42;
  const oy = (dx / len) * 0.42;
  const z = 3;
  const pts = [
    P(br.from.x + ox, br.from.y + oy, z),
    P(br.to.x + ox, br.to.y + oy, z),
    P(br.to.x - ox, br.to.y - oy, z),
    P(br.from.x - ox, br.from.y - oy, z),
  ].join(' ');
  const piers: ReactNode[] = [];
  const nP = Math.max(2, Math.round(len / 1.6));
  for (let k = 1; k < nP; k++) {
    const q = project(br.from.x + (dx * k) / nP, br.from.y + (dy * k) / nP);
    piers.push(<rect key={k} x={q.x - 3} y={q.y - z} width="6" height="9" fill="#78716c" />);
  }
  const rail = (s: number) => {
    const a = project(br.from.x + ox * s, br.from.y + oy * s);
    const b = project(br.to.x + ox * s, br.to.y + oy * s);
    return (
      <line
        key={s}
        x1={a.x}
        y1={a.y - z - 2}
        x2={b.x}
        y2={b.y - z - 2}
        stroke={br.color}
        strokeWidth="1.6"
      />
    );
  };
  return (
    <g data-bridge-deck={br.name || 'bridge'}>
      {piers}
      <polygon points={pts} fill={shade(asphalt, -0.1)} />
      <polygon points={pts} fill="none" stroke={br.color} strokeWidth="1" />
      {rail(1)}
      {rail(-1)}
    </g>
  );
}

const Ground = memo(function Ground({ layout }: { layout: CityLayout }) {
  const { flavour: f, extent: E, size } = layout;
  const m = MARGIN;
  const planned = layout.areas.length > 0;
  const out: ReactNode[] = [];
  // Land around the city.
  out.push(
    <polygon
      key="land"
      points={[P(-m, -m), P(E + m, -m), P(E + m, E + m), P(-m, E + m)].join(' ')}
      fill={f.land}
    />,
  );
  const waters = planned ? layout.waters : f.edge === 'water' ? [legacyWater(E)] : [];
  const edges = waters.filter((w) => w.kind === 'edge');
  const rivers = waters.filter((w) => w.kind === 'river');
  // Coasts behind everything; hills (or mine dumps) on the horizon when the back is dry.
  edges.forEach((w, n) => out.push(<WaterBody key={`edge${n}`} w={w} E={E} />));
  if (!edges.some((w) => w.side === 'north') && (planned || f.edge !== 'water')) {
    const edgeColor = f.edge === 'water' ? f.parkEdge : f.edgeColor;
    for (let k = 0; k < 6; k++) {
      const c = project(-3 + k * ((E + 6) / 5), -4.2 + (k % 2) * 0.8);
      const rw = 70 + (k % 3) * 25;
      if (f.edge === 'mine-dumps')
        out.push(
          <polygon
            key={`hill${k}`}
            points={`${c.x - rw},${c.y} ${c.x - rw * 0.55},${c.y - 34} ${c.x + rw * 0.55},${c.y - 34} ${c.x + rw},${c.y}`}
            fill={k % 2 ? edgeColor : shade(edgeColor, -0.1)}
          />,
        );
      else
        out.push(
          <ellipse
            key={`hill${k}`}
            cx={c.x}
            cy={c.y}
            rx={rw}
            ry={30 + (k % 3) * 10}
            fill={k % 2 ? edgeColor : shade(edgeColor, -0.08)}
          />,
        );
    }
  }
  // Asphalt.
  out.push(
    <polygon
      key="asphalt"
      points={[P(-0.5, -0.5), P(E + 0.5, -0.5), P(E + 0.5, E + 0.5), P(-0.5, E + 0.5)].join(' ')}
      fill={f.asphalt}
    />,
  );
  // Lane markings.
  for (let k = 0; k <= size; k++) {
    const a = project(k * B, -0.3);
    const b = project(k * B, E + 0.3);
    const c = project(-0.3, k * B);
    const d = project(E + 0.3, k * B);
    out.push(
      <line
        key={`ly${k}`}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        className="city-lane"
        stroke={f.lane}
      />,
      <line
        key={`lx${k}`}
        x1={c.x}
        y1={c.y}
        x2={d.x}
        y2={d.y}
        className="city-lane"
        stroke={f.lane}
      />,
    );
  }
  // Crossings at every intersection.
  for (let i = 0; i <= size; i++)
    for (let j = 0; j <= size; j++) {
      const x = i * B;
      const y = j * B;
      for (let s = -2; s <= 2; s++)
        out.push(
          <polygon
            key={`zx${i}-${j}-${s}`}
            points={[
              P(x + 0.52, y + s * 0.13 - 0.04),
              P(x + 0.78, y + s * 0.13 - 0.04),
              P(x + 0.78, y + s * 0.13 + 0.04),
              P(x + 0.52, y + s * 0.13 + 0.04),
            ].join(' ')}
            fill="#fff"
            opacity="0.55"
          />,
        );
    }
  // Closed segments (an organic city's merged blocks): paved over.
  for (const key of layout.cuts) {
    const [a, b] = key.split('|').map((t) => t.split(',').map(Number)) as [number[], number[]];
    const [i, j] = a as [number, number];
    const [i2, j2] = b as [number, number];
    const pts =
      j === j2
        ? rect(i * B + 0.45, j * B - 0.6, i2 * B - 0.45, j * B + 0.6, 2)
        : rect(i * B - 0.6, j * B + 0.45, i * B + 0.6, j2 * B - 0.45, 2);
    out.push(<polygon key={`cut${key}`} points={pts} fill={f.sidewalk} />);
  }
  rivers.forEach((w, n) => out.push(<WaterBody key={`river${n}`} w={w} E={E} />));
  for (const br of layout.bridges)
    out.push(<Deck key={`deck${br.name}${br.from.x},${br.from.y}`} br={br} asphalt={f.asphalt} />);
  for (const r of layout.roundabouts) {
    const c = project(r.x, r.y);
    out.push(
      <g key={`rb${r.x},${r.y}`} data-roundabout="">
        <ellipse
          cx={c.x}
          cy={c.y}
          rx={TW * 0.75}
          ry={TH * 0.75}
          fill={f.park}
          stroke="#fff"
          strokeWidth="1.5"
        />
        <ellipse cx={c.x} cy={c.y - 2} rx={TW * 0.3} ry={TH * 0.3} fill={f.sidewalk} />
      </g>,
    );
  }
  // Blocks: raised pavements, with parks, plazas and airfield tinted.
  for (const blk of layout.blocks) {
    const x = blk.i * B + 0.45;
    const y = blk.j * B + 0.45;
    const s = B - 0.9;
    const top = [P(x, y, 2), P(x + s, y, 2), P(x + s, y + s, 2), P(x, y + s, 2)].join(' ');
    out.push(
      <g key={`b${blk.i}-${blk.j}`}>
        <polygon
          points={[P(x, y + s), P(x + s, y + s), P(x + s, y + s, 2), P(x, y + s, 2)].join(' ')}
          fill={f.curb}
        />
        <polygon
          points={[P(x + s, y + s), P(x + s, y), P(x + s, y, 2), P(x + s, y + s, 2)].join(' ')}
          fill={shade(f.curb, -0.15)}
        />
        <polygon points={top} fill={f.sidewalk} />
        {(blk.district === 'park' ||
          blk.district === 'landmark' ||
          blk.district === 'airport' ||
          blk.district === 'residential' ||
          blk.district === 'houses') && (
          <polygon
            points={[
              P(x + 0.25, y + 0.25, 2),
              P(x + s - 0.25, y + 0.25, 2),
              P(x + s - 0.25, y + s - 0.25, 2),
              P(x + 0.25, y + s - 0.25, 2),
            ].join(' ')}
            fill={
              blk.district === 'park' || blk.district === 'landmark' ? f.park : shade(f.park, 0.25)
            }
            stroke={f.parkEdge}
            strokeWidth="1"
          />
        )}
        {(blk.district === 'market' || blk.district === 'events') && (
          <polygon
            points={[
              P(x + 0.2, y + 0.2, 2),
              P(x + s - 0.2, y + 0.2, 2),
              P(x + s - 0.2, y + s - 0.2, 2),
              P(x + 0.2, y + s - 0.2, 2),
            ].join(' ')}
            fill={blk.district === 'market' ? '#ead7b7' : '#e5e7eb'}
            stroke={blk.district === 'market' ? '#d6bf98' : '#d1d5db'}
            strokeDasharray="3 3"
          />
        )}
      </g>,
    );
  }
  // Street names, painted flat on the road.
  const s = 0.065;
  for (const st of layout.streets) {
    const mid = (st.seg ?? Math.floor(size / 2)) * B;
    if (st.axis === 'x') {
      const o = project(mid + 0.6, st.k * B - 0.06);
      out.push(
        <text
          key={`sn${st.axis}${st.k}`}
          className="city-street-name"
          transform={`matrix(${TW * s},${TH * s},${-TW * s},${TH * s},${o.x},${o.y})`}
          fontSize="4.6"
        >
          {st.name}
        </text>,
      );
    } else {
      const o = project(st.k * B + 0.06, mid + B - 0.6);
      out.push(
        <text
          key={`sn${st.axis}${st.k}`}
          className="city-street-name"
          transform={`matrix(${TW * s},${-TH * s},${TW * s},${TH * s},${o.x},${o.y})`}
          fontSize="4.6"
        >
          {st.name}
        </text>,
      );
    }
  }
  return <g className="city-ground">{out}</g>;
});

const Traffic = memo(function Traffic({
  layout,
  reduced,
}: {
  layout: CityLayout;
  reduced: boolean;
}) {
  return (
    <g className="city-traffic">
      {layout.vehicles.map((v, n) => {
        const a = project(v.from.x, v.from.y);
        const b = project(v.to.x, v.to.y);
        if (reduced) {
          // Parked: a third of the way along, no motion.
          const p = project(
            v.from.x + (v.to.x - v.from.x) * (0.2 + (n % 5) * 0.15),
            v.from.y + (v.to.y - v.from.y) * (0.2 + (n % 5) * 0.15),
          );
          return (
            <g key={n} data-vehicle={v.spec.id} transform={`translate(${p.x},${p.y})`}>
              <VehicleShape spec={v.spec} axis={v.axis} />
            </g>
          );
        }
        return (
          <g key={n} data-vehicle={v.spec.id}>
            <VehicleShape spec={v.spec} axis={v.axis} />
            <animateMotion
              dur={`${v.dur.toFixed(1)}s`}
              begin={`${v.delay.toFixed(1)}s`}
              repeatCount="indefinite"
              path={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
            />
          </g>
        );
      })}
      {layout.boats.map((bt, n) => {
        const a = project(bt.from.x, bt.from.y);
        const b = project(bt.to.x, bt.to.y);
        const flip = b.x < a.x;
        if (reduced) {
          const p = project(
            bt.from.x + (bt.to.x - bt.from.x) * (0.25 + (n % 3) * 0.2),
            bt.from.y + (bt.to.y - bt.from.y) * (0.25 + (n % 3) * 0.2),
          );
          return (
            <g key={`boat${n}`} data-boat={bt.kind} transform={`translate(${p.x},${p.y})`}>
              <BoatShape boat={bt} flip={flip} />
            </g>
          );
        }
        return (
          <g key={`boat${n}`} data-boat={bt.kind}>
            <BoatShape boat={bt} flip={flip} />
            <animateMotion
              dur={`${bt.dur.toFixed(1)}s`}
              begin={`${bt.delay.toFixed(1)}s`}
              repeatCount="indefinite"
              path={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
            />
          </g>
        );
      })}
    </g>
  );
});

/** A ferry or an abra (a Dubai Creek water taxi), in screen space. */
function BoatShape({ boat, flip }: { boat: Boat; flip: boolean }) {
  return (
    <g transform={flip ? 'scale(-1,1)' : undefined}>
      <ellipse cx="0" cy="3" rx="16" ry="4" fill="#0f172a" opacity="0.15" />
      {boat.kind === 'abra' ? (
        <>
          <path d="M -13 0 L 13 0 L 10 4 L -10 4 Z" fill="#92400e" />
          <rect x="-9" y="-8" width="18" height="2" fill="#fde68a" />
          <line x1="-8" y1="-6" x2="-8" y2="0" stroke="#78350f" />
          <line x1="8" y1="-6" x2="8" y2="0" stroke="#78350f" />
        </>
      ) : (
        <>
          <path d="M -16 0 L 16 0 L 12 5 L -13 5 Z" fill="#f8fafc" />
          <rect x="-10" y="-7" width="18" height="7" fill="#1e40af" />
          <rect x="-8" y="-5" width="14" height="2" fill="#bae6fd" />
          <rect x="2" y="-12" width="3" height="5" fill="#dc2626" />
        </>
      )}
    </g>
  );
}

/** San Francisco's fog: soft banks drifting across (still with reduced motion). */
const Fog = memo(function Fog({ layout }: { layout: CityLayout }) {
  const E = layout.extent;
  const banks = [
    [-2, -3, 0],
    [E * 0.5, -4, 1],
    [-4, E * 0.4, 2],
    [E * 0.3, E * 0.2, 3],
  ];
  return (
    <g className="city-fog" pointerEvents="none" data-fog="">
      {banks.map(([x, y, k]) => {
        const c = project(x!, y!);
        return (
          <g key={k} className="city-fog-bank" style={{ animationDelay: `${-k! * 9}s` }}>
            <ellipse cx={c.x} cy={c.y - 60} rx="220" ry="46" fill="#f8fafc" opacity="0.32" />
            <ellipse cx={c.x + 90} cy={c.y - 80} rx="140" ry="34" fill="#f8fafc" opacity="0.26" />
          </g>
        );
      })}
    </g>
  );
});

/** Buildings and decor, painted back to front. */
const Skyline = memo(function Skyline({ layout }: { layout: CityLayout }) {
  const f = layout.flavour;
  type Item = { depth: number; node: ReactNode };
  const items: Item[] = [];
  for (const p of layout.places)
    items.push({ depth: p.x + p.w / 2 + p.y + p.d / 2, node: <Building key={p.id} p={p} f={f} /> });
  layout.decor.forEach((d, n) =>
    items.push({
      depth: d.x + (d.w ?? 0) / 2 + d.y + (d.d ?? 0) / 2 + (d.kind === 'runway' ? -10 : 0),
      node: <DecorItem key={`d${n}`} d={d} f={f} />,
    }),
  );
  items.sort((a, b) => a.depth - b.depth);
  return <g className="city-skyline">{items.map((i) => i.node)}</g>;
});

/**
 * Building labels with simple collision avoidance: important places first;
 * a label that would overlap one already placed moves up a little, and minor
 * labels that still overlap are dropped. Labels scale with the map, so this
 * holds at every zoom.
 */
export function placeLabels(layout: CityLayout, labelOf: (p: Place) => string) {
  const rank = (p: Place) =>
    p.kind === 'stall' || p.kind === 'business'
      ? 2
      : p.kind === 'lender' || p.kind === 'fund' || p.kind === 'playerbank'
        ? 1
        : 0;
  const placed: {
    id: string;
    x: number;
    y: number;
    w: number;
    text: string;
    tier: string;
    soon: boolean;
    color?: string;
  }[] = [];
  const hits = (x: number, y: number, w: number) =>
    placed.some((o) => Math.abs(o.x - x) < (o.w + w) / 2 + 2 && Math.abs(o.y - y) < 18);
  const sorted = [...layout.places]
    .filter((p) => !(p.kind === 'stall' && p.dim))
    .sort((a, b) => rank(a) - rank(b));
  for (const p of sorted) {
    const raw = labelOf(p);
    if (!raw) continue;
    const text = raw.length > 26 ? `${raw.slice(0, 25)}…` : raw;
    const w = Math.min(150, text.length * 5.6 + 14);
    const c = project(p.x + p.w / 2, p.y + p.d / 2);
    const x = c.x;
    let y = c.y - p.h - (p.kind === 'stall' ? 12 : 18);
    let tries = 0;
    while (hits(x, y, w) && tries < 3) {
      y -= 19;
      tries++;
    }
    if (hits(x, y, w) && rank(p) > 0) continue;
    const tier =
      p.kind === 'business' ? 'lbl-biz' : ['lbl-main', 'lbl-detail', 'lbl-stall'][rank(p)]!;
    placed.push({
      id: p.id,
      x,
      y,
      w,
      text,
      tier,
      soon: !!p.soon,
      color: p.category ? CATEGORY_COLOR[p.category] : undefined,
    });
  }
  return placed;
}

const Labels = memo(function Labels({
  layout,
  labelOf,
}: {
  layout: CityLayout;
  labelOf: (p: Place) => string;
}) {
  return (
    <g className="city-labels" pointerEvents="none">
      {layout.areas.map((a) => {
        const c = project(a.at.x, a.at.y);
        return (
          <text
            key={a.id}
            x={c.x}
            y={c.y - 4}
            className="city-district"
            textAnchor="middle"
            data-area={a.id}
          >
            {a.name.toUpperCase()}
          </text>
        );
      })}
      {layout.waters
        .filter((w) => w.name)
        .slice(0, 1)
        .map((w) => {
          const c =
            w.kind === 'river'
              ? project((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2)
              : project(
                  w.side === 'east' ? w.x0 + 1.4 : (w.x0 + w.x1) / 2,
                  w.side === 'south'
                    ? w.y0 + 1.2
                    : w.side === 'north'
                      ? w.y1 - 1.2
                      : layout.extent / 2,
                );
          return (
            <text key="water" x={c.x} y={c.y + 4} className="city-water-name" textAnchor="middle">
              {w.name}
            </text>
          );
        })}
      {layout.districts
        .filter((d) => d.id === 'finance' || d.id === 'investors' || d.id === 'market')
        .map((d) => {
          const c = project(d.at.x, d.at.y);
          return (
            <text key={d.id} x={c.x} y={c.y - 4} className="city-district" textAnchor="middle">
              {districtLabel(d.id).toUpperCase()}
            </text>
          );
        })}
      {placeLabels(layout, labelOf).map((l) => (
        <g
          key={l.id}
          className={`city-label ${l.tier}${l.soon ? ' is-soon' : ''}`}
          transform={`translate(${Math.round(l.x)},${Math.round(l.y)})`}
        >
          <rect x={-l.w / 2} y={-9} width={l.w} height={17} rx={8.5} />
          {l.color && <circle cx={-l.w / 2 + 7} cy={-0.5} r={3} fill={l.color} />}
          <text x={l.color ? 3 : 0} y={3.5} textAnchor="middle">
            {l.text}
          </text>
        </g>
      ))}
    </g>
  );
});

// ---------------------------------------------------------------------------
// The interactive map

export function CityMap({
  layout,
  look,
  name,
  labelOf,
  marker,
  onEnter,
  handleRef,
  ariaLabel,
  ai = NONE_AI,
  players = NONE_PLAYERS,
  flags = NONE_FLAGS,
  onPerson,
  onArrive,
}: {
  layout: CityLayout;
  look: AvatarLook;
  name: string;
  labelOf: (p: Place) => string;
  /** Place id to pulse (the monthly story's suggested move). */
  marker: string | null;
  onEnter: (p: Place) => void;
  handleRef?: { current: CityMapHandle | null };
  ariaLabel: string;
  /** Ambient AI characters (Wave 2). */
  ai?: AiPerson[];
  /** Other players, from presence (Wave 2). */
  players?: PresenceView[];
  /** Place ids flying bunting: an event is coming up there. */
  flags?: string[];
  /** Someone was tapped. */
  onPerson?: (id: string) => void;
  /** The avatar stopped somewhere (after a walk, or on arrival in the city). */
  onArrive?: (at: Pt, placeId: string | null) => void;
}) {
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const avatarRef = useRef<SVGGElement>(null);
  const flipRef = useRef<SVGGElement>(null);
  const targetRef = useRef<SVGGElement>(null);
  const cam = useRef({ x: 0, y: 0, z: 1, w: 360, h: 480 });
  const pos = useRef<Pt>(lastPos.get(layout.marketId) ?? layout.start);
  const walk = useRef<{ raf: number; cancel: () => void } | null>(null);
  const following = useRef(true);
  const onEnterRef = useRef(onEnter);
  const onArriveRef = useRef(onArrive);
  useEffect(() => {
    onEnterRef.current = onEnter;
    onArriveRef.current = onArrive;
  }, [onEnter, onArrive]);

  const zoomLimits = useCallback(() => {
    const { w, h } = cam.current;
    const b = layout.bounds;
    const fit = Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
    return { min: Math.max(0.25, fit * 0.95), max: 2.6 };
  }, [layout]);

  const apply = useCallback(() => {
    const c = cam.current;
    const b = layout.bounds;
    const lim = zoomLimits();
    c.z = Math.max(lim.min, Math.min(lim.max, c.z));
    const hw = c.w / c.z / 2;
    const hh = c.h / c.z / 2;
    // Keep some of the city in view.
    c.x = Math.max(b.minX + hw * 0.4, Math.min(b.maxX - hw * 0.4, c.x));
    c.y = Math.max(b.minY + hh * 0.4, Math.min(b.maxY - hh * 0.4, c.y));
    const svg = svgRef.current;
    if (!svg) return;
    svg.setAttribute(
      'viewBox',
      `${(c.x - hw).toFixed(1)} ${(c.y - hh).toFixed(1)} ${(hw * 2).toFixed(1)} ${(hh * 2).toFixed(1)}`,
    );
    const zl = c.z < 0.75 ? '0' : c.z < 1.35 ? '1' : '2';
    if (wrapRef.current && wrapRef.current.dataset.zoom !== zl) wrapRef.current.dataset.zoom = zl;
  }, [layout, zoomLimits]);

  const placeAvatar = useCallback((p: Pt, dx = 0, dy = 0) => {
    const s = project(p.x, p.y);
    avatarRef.current?.setAttribute('transform', `translate(${s.x.toFixed(1)},${s.y.toFixed(1)})`);
    const sdx = (dx - dy) * TW;
    if (flipRef.current && Math.abs(sdx) > 0.001)
      flipRef.current.setAttribute('transform', `scale(${sdx < 0 ? -1.25 : 1.25},1.25)`);
  }, []);

  const centreOn = useCallback(
    (p: Pt) => {
      const s = project(p.x, p.y);
      cam.current.x = s.x;
      cam.current.y = s.y - 30;
      apply();
    },
    [apply],
  );

  // Size the camera to the element and keep it sized.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      cam.current.w = Math.max(1, r.width);
      cam.current.h = Math.max(1, r.height);
      apply();
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [apply]);

  // A new layout (other market): start at the avatar, at a comfortable zoom.
  useEffect(() => {
    pos.current = lastPos.get(layout.marketId) ?? layout.start;
    placeAvatar(pos.current);
    cam.current.z = cam.current.w < 500 ? 1 : 1.15;
    centreOn(pos.current);
    onArriveRef.current?.(pos.current, null);
  }, [layout, placeAvatar, centreOn]);

  const stopWalk = useCallback(() => {
    walk.current?.cancel();
    walk.current = null;
    avatarRef.current?.classList.remove('is-walking');
    targetRef.current?.setAttribute('visibility', 'hidden');
  }, []);
  useEffect(() => stopWalk, [stopWalk]);

  const walkTo = useCallback(
    (target: Pt, then?: () => void, placeId: string | null = null) => {
      stopWalk();
      const path = findPath(layout, pos.current, target);
      const len = pathLength(path);
      const done = () => {
        pos.current = target;
        lastPos.set(layout.marketId, target);
        placeAvatar(target);
        stopWalk();
        onArriveRef.current?.(target, placeId);
        then?.();
      };
      if (len < 0.05 || reduced) {
        done();
        if (reduced) centreOn(target);
        return;
      }
      const ts = project(target.x, target.y);
      targetRef.current?.setAttribute('transform', `translate(${ts.x},${ts.y})`);
      targetRef.current?.setAttribute('visibility', 'visible');
      avatarRef.current?.classList.add('is-walking');
      following.current = true;
      // About 5 tiles a second, never longer than 2.8s.
      const ms = Math.min(2800, Math.max(350, (len / 5) * 1000));
      const t0 = performance.now();
      let cancelled = false;
      const step = (now: number) => {
        if (cancelled) return;
        const k = Math.min(1, (now - t0) / ms);
        const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const { p, dx, dy } = pointAlong(path, eased);
        pos.current = p;
        placeAvatar(p, dx, dy);
        if (following.current) {
          const s = project(p.x, p.y);
          const c = cam.current;
          c.x += (s.x - c.x) * 0.08;
          c.y += (s.y - 30 - c.y) * 0.08;
          apply();
        }
        if (k < 1) walk.current!.raf = requestAnimationFrame(step);
        else done();
      };
      walk.current = {
        raf: requestAnimationFrame(step),
        cancel: () => {
          cancelled = true;
          if (walk.current) cancelAnimationFrame(walk.current.raf);
          lastPos.set(layout.marketId, pos.current);
        },
      };
    },
    [layout, reduced, placeAvatar, stopWalk, apply, centreOn],
  );

  const goTo = useCallback(
    (id: string) => {
      const p = layout.places.find((x) => x.id === id);
      if (!p) return;
      walkTo(p.door, () => onEnterRef.current(p), p.id);
    },
    [layout, walkTo],
  );
  const walkToPlace = useCallback(
    (id: string) => {
      const p = layout.places.find((x) => x.id === id);
      if (p) walkTo(p.door, undefined, p.id);
    },
    [layout, walkTo],
  );

  const zoomAt = useCallback(
    (factor: number, sx?: number, sy?: number) => {
      const c = cam.current;
      const svg = svgRef.current;
      const rect = svg?.getBoundingClientRect();
      // World point under the cursor stays put.
      const px = sx ?? (rect ? rect.left + rect.width / 2 : 0);
      const py = sy ?? (rect ? rect.top + rect.height / 2 : 0);
      const wx = c.x + (px - (rect?.left ?? 0) - c.w / 2) / c.z;
      const wy = c.y + (py - (rect?.top ?? 0) - c.h / 2) / c.z;
      const lim = zoomLimits();
      const nz = Math.max(lim.min, Math.min(lim.max, c.z * factor));
      c.x = wx - (wx - c.x) * (c.z / nz);
      c.y = wy - (wy - c.y) * (c.z / nz);
      c.z = nz;
      apply();
    },
    [apply, zoomLimits],
  );

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      goTo,
      walkToPlace,
      recentre: () => centreOn(pos.current),
      zoom: (f) => zoomAt(f),
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, goTo, walkToPlace, centreOn, zoomAt]);

  // ---- Pointer input: drag to pan, pinch to zoom, tap to walk or enter.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, pinch: 0, downX: 0, downY: 0 });

  const toWorld = (clientX: number, clientY: number): Pt => {
    const c = cam.current;
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: c.x + (clientX - rect.left - c.w / 2) / c.z,
      y: c.y + (clientY - rect.top - c.h / 2) / c.z,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1)
      gesture.current = { moved: 0, pinch: 0, downX: e.clientX, downY: e.clientY };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      gesture.current.moved = 99;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    const g = gesture.current;
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (g.pinch > 0) zoomAt(dist / g.pinch, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      g.pinch = dist;
      return;
    }
    g.moved = Math.max(g.moved, Math.hypot(next.x - g.downX, next.y - g.downY));
    if (g.moved > 6) {
      if (!svgRef.current?.hasPointerCapture?.(e.pointerId))
        svgRef.current?.setPointerCapture?.(e.pointerId);
      following.current = false;
      cam.current.x -= (next.x - prev.x) / cam.current.z;
      cam.current.y -= (next.y - prev.y) / cam.current.z;
      apply();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const had = pointers.current.delete(e.pointerId);
    if (!had || pointers.current.size > 0) return;
    if (gesture.current.moved > 6) return;
    // A tap: on a person, a building or a street.
    const who = (e.target as Element).closest?.('[data-person]')?.getAttribute('data-person');
    if (who && onPerson) {
      onPerson(who);
      return;
    }
    const el = (e.target as Element).closest?.('[data-place]');
    const id = el?.getAttribute('data-place');
    if (id) {
      goTo(id);
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    const g = unproject(w.x, w.y);
    const s = nearestStreetPoint(layout, g);
    walkTo(s);
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 60 / cam.current.z;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      following.current = false;
      cam.current.x += m[0];
      cam.current.y += m[1];
      apply();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomAt(1.2);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomAt(1 / 1.2);
    } else if (e.key === '0' || e.key === 'Home') {
      e.preventDefault();
      centreOn(pos.current);
    }
  };

  const markerPlace = marker ? layout.places.find((p) => p.id === marker) : null;
  const mp = markerPlace
    ? project(markerPlace.x + markerPlace.w / 2, markerPlace.y + markerPlace.d / 2)
    : null;
  const md = markerPlace ? project(markerPlace.door.x, markerPlace.door.y) : null;
  const b = layout.bounds;
  const start = project(layout.start.x, layout.start.y);

  return (
    <div
      ref={wrapRef}
      className={`city-map${reduced ? ' is-reduced' : ''}`}
      data-zoom="1"
      tabIndex={0}
      role="application"
      aria-roledescription={t('map')}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      <svg
        ref={svgRef}
        className="city-svg"
        aria-hidden="true"
        viewBox={`${b.minX} ${b.minY} ${b.maxX - b.minX} ${b.maxY - b.minY}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <ArtDefs f={layout.flavour} />
        <rect
          x={b.minX - 2000}
          y={b.minY - 2000}
          width={b.maxX - b.minX + 4000}
          height={b.maxY - b.minY + 4000}
          fill="url(#sky)"
        />
        <Ground layout={layout} />
        {md && (
          <g transform={`translate(${md.x},${md.y})`} className="city-pulse">
            <ellipse rx="22" ry="11" fill="url(#pulse)" />
            <ellipse rx="10" ry="5" fill="#f59e0b" opacity="0.6" />
          </g>
        )}
        <Traffic layout={layout} reduced={reduced} />
        <g ref={targetRef} visibility="hidden" className="city-target">
          <ellipse rx="9" ry="4.5" fill="none" stroke="#fff" strokeWidth="2" />
          <ellipse rx="4" ry="2" fill="#fff" opacity="0.8" />
        </g>
        <Skyline layout={layout} />
        {flags.map((id) => {
          const p = layout.places.find((x) => x.id === id);
          return p ? <Bunting key={id} p={p} /> : null;
        })}
        <Crowd layout={layout} ai={ai} players={players} reduced={reduced} />
        {layout.flavour.fog && <Fog layout={layout} />}
        <Labels layout={layout} labelOf={labelOf} />
        {mp && markerPlace && (
          <g transform={`translate(${mp.x},${mp.y - markerPlace.h - 40})`} className="city-marker">
            <g className="city-bob">
              <circle r="11" fill="#f59e0b" stroke="#fff" strokeWidth="2.5" />
              <text y="4.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">
                !
              </text>
              <polygon points="-5,10 5,10 0,17" fill="#f59e0b" />
            </g>
          </g>
        )}
        <g ref={avatarRef} className="city-avatar" transform={`translate(${start.x},${start.y})`}>
          <g ref={flipRef} transform="scale(1.25,1.25)">
            <AvatarFigure look={look} />
          </g>
          <g transform="translate(0 -62)" className="city-you">
            <rect
              x={-name.length * 3.1 - 7}
              y="-8"
              width={name.length * 6.2 + 14}
              height="15"
              rx="7.5"
            />
            <text y="3" textAnchor="middle">
              {name}
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}
