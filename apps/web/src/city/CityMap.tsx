/**
 * The illustrated city: an SVG scene with a camera (drag, pinch, wheel,
 * arrow keys), ambient traffic and the player's avatar walking the streets.
 *
 * Rendering is split in two: the static scene is memoised and only rebuilt
 * when the layout changes; the camera, the avatar and the walk animation
 * write straight to the DOM through refs, so panning and walking never
 * re-render React.
 */
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import {
  ArtDefs,
  AvatarFigure,
  depthBand,
  MAP_FIGURE_SCALE,
  MAP_RIDE_SCALE,
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
  SW,
  findPath,
  nearestStreetPoint,
  pathLength,
  pointAlong,
  project,
  TH,
  TW,
  unproject,
  BEACH_W,
  MARGIN,
  travelTiles,
  type Boat,
  type Bridge,
  type Decor,
  type Water,
  type CityLayout,
  type DistrictId,
  type Place,
  type Pt,
} from './layout';
import { CATEGORY_COLOR } from './contract';
import { Crowd } from './Crowd';
import { setRiding } from './riding';
import { rideMs, rideVehicle, SHORT_HOP, type MyCar, type RideMode } from './travel';
import { mapTint, useSun } from './sun';
import type { OwnedProperty } from './properties';
import type { VehicleSpec } from './flavour';
import { playersByPlace, type PresenceView, type Walker } from './people';
import { beginRide } from './ride/state';
import { loadGeo, OSM_CREDIT } from './geo';
import { GeoPainter } from './geoPaint';
import { GeoSprite } from './geoSprites';
import { getMapQuality, hasWebGL, useMapQuality } from './three/quality';

// The 3D city is its own chunk (three.js), loaded when a real map first shows
// (or early, see preloadCityMap).
const load3d = () => import('./three/CityMap3D');
const CityMap3D = lazy(load3d);

/**
 * Start fetching what the city map needs before the City tab asks for it:
 * the 3D chunk (when the 3D map will draw) and the city's map file. Called as
 * soon as the game knows where you are, so neither waits behind sign-in.
 */
export function preloadCityMap(marketId?: string) {
  if (typeof navigator === 'undefined' || /jsdom/i.test(navigator.userAgent)) return;
  if (getMapQuality() === '3d' && hasWebGL()) void load3d().catch(() => {});
  if (marketId) void loadGeo(marketId);
}

// ---------------------------------------------------------------------------
// Reduced motion, as a subscribable media query.

// The OS setting, or the in-game one: App puts the answer on <html> as
// data-reduce-motion (Wave 7), so both are followed.
const RM = '(prefers-reduced-motion: reduce)';
const subscribeRM = (cb: () => void) => {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia?.(RM);
  mq?.addEventListener?.('change', cb);
  const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(cb);
  mo?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-reduce-motion'],
  });
  return () => {
    mq?.removeEventListener?.('change', cb);
    mo?.disconnect();
  };
};
const getRM = () => {
  if (typeof window === 'undefined') return false;
  const d = document.documentElement.dataset.reduceMotion;
  if (d === '1' || d === '0') return d === '1';
  return !!window.matchMedia && window.matchMedia(RM).matches;
};
export const useReducedMotion = () => useSyncExternalStore(subscribeRM, getRM, () => false);

const NONE_WALKERS: Walker[] = [];
const SVG_NS = 'http://www.w3.org/2000/svg';
/** The camera looks this far above your feet (about half your height on the map). */
const CAM_LIFT = 14;
/** On-screen size of labels, as a multiple of their drawn size (9.5 px: about 12 px). */
const LABEL_PX = 1.25;
const NONE_PLAYERS: PresenceView[] = [];
const NONE_FLAGS: string[] = [];

/** Last avatar position per market, so switching tabs doesn't send you home. */
const lastPos = new Map<string, Pt>();

/** Put the avatar somewhere in a city before it shows (landing at its airport). */
export function placeAvatarAt(marketId: string, at: Pt) {
  lastPos.set(marketId, at);
}

/** Where the avatar last stood in a city (shared by the 2D and 3D maps). */
export const avatarPosIn = (marketId: string): Pt | undefined => lastPos.get(marketId);

/** A far trip waiting for the player to choose how to get there. */
export interface FarTrip {
  /** Length along the streets, in tiles. */
  tiles: number;
  placeId: string | null;
}

export interface CityMapHandle {
  /** Go to a place's door (walking, or by `mode`), then call onEnter. */
  goTo: (placeId: string, mode?: RideMode) => void;
  /** Walk to a place's door without going in. */
  walkToPlace: (placeId: string) => void;
  /** Set off on the trip waiting in the chooser, by this mode. */
  ride: (mode: RideMode) => void;
  /** Drop the trip waiting in the chooser. */
  cancelTrip: () => void;
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
function shoreOf(w: Water, E: number, wide = 1.9): [number, number, number, number] {
  const m = MARGIN;
  switch (w.side) {
    case 'south':
      return [-m, E + 1.1, E + m, E + wide];
    case 'north':
      return [-m, -wide, E + m, -1.1];
    case 'east':
      return [E + 1.1, -m, E + wide, E + m];
    default:
      return [-wide, -m, -1.1, E + m];
  }
}

const UMBRELLAS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];

function WaterBody({ w, E, beach }: { w: Water; E: number; beach?: string }) {
  const out: ReactNode[] = [];
  if (w.kind === 'edge') {
    const [a, b, c, d] = shoreOf(w, E, beach ? BEACH_W + 0.1 : 1.9);
    out.push(<polygon key="shore" points={rect(a, b, c, d)} fill="#f5e6c4" />);
    if (beach) {
      // Lumley Beach: umbrellas and loungers along the sand, and its name.
      const along = w.side === 'north' || w.side === 'south';
      const mid = (along ? b + d : a + c) / 2;
      for (let k = 0; k < 9; k++) {
        const u = 1 + k * ((E - 2) / 8);
        const at = along ? project(u, mid) : project(mid, u);
        out.push(
          <g key={`umb${k}`} data-beach-umbrella>
            <line x1={at.x} y1={at.y} x2={at.x} y2={at.y - 12} stroke="#78716c" strokeWidth="1" />
            <path
              d={`M ${at.x - 8} ${at.y - 11} Q ${at.x} ${at.y - 19} ${at.x + 8} ${at.y - 11} Z`}
              fill={UMBRELLAS[k % UMBRELLAS.length]}
            />
            <rect
              x={at.x + 3}
              y={at.y - 2}
              width="8"
              height="3"
              rx="1"
              fill="#fff"
              opacity="0.85"
            />
          </g>,
        );
      }
      const c0 = along ? project(E / 2, mid) : project(mid, E / 2);
      out.push(
        <text
          key="beach-name"
          x={c0.x}
          y={c0.y + 12}
          textAnchor="middle"
          className="city-landmark-name"
          data-beach={beach}
        >
          {beach}
        </text>,
      );
    }
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
  edges.forEach((w, n) =>
    out.push(
      <WaterBody
        key={`edge${n}`}
        w={w}
        E={E}
        beach={layout.beach?.side === w.side ? layout.beach.name : undefined}
      />,
    ),
  );
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
              P(x + SW + 0.07, y + s * 0.17 - 0.05),
              P(x + SW + 0.37, y + s * 0.17 - 0.05),
              P(x + SW + 0.37, y + s * 0.17 + 0.05),
              P(x + SW + 0.07, y + s * 0.17 + 0.05),
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
        ? rect(i * B + SW, j * B - SW - 0.15, i2 * B - SW, j * B + SW + 0.15, 2)
        : rect(i * B - SW - 0.15, j * B + SW, i * B + SW + 0.15, j2 * B - SW, 2);
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
    const x = blk.i * B + SW;
    const y = blk.j * B + SW;
    const s = B - 2 * SW;
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
          key={`sn${st.axis}${st.k}:${st.seg}`}
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
          key={`sn${st.axis}${st.k}:${st.seg}`}
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
        // A real map's road: along its whole line.
        const line = v.path
          ? `M ${v.path
              .map((q) => project(q.x, q.y))
              .map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`)
              .join(' L ')}`
          : null;
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
              path={line ?? `M ${a.x} ${a.y} L ${b.x} ${b.y}`}
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

/** An empty building plot: a kerbed patch of ground with a small sign. */
function EmptyLot({ d }: { d: Decor }) {
  const w = d.w ?? 1;
  const dd = d.d ?? 1;
  const post = project(d.x + w * 0.75, d.y + dd * 0.8);
  return (
    <g className="city-lot" data-lot="">
      <polygon
        points={[P(d.x, d.y), P(d.x + w, d.y), P(d.x + w, d.y + dd), P(d.x, d.y + dd)].join(' ')}
        fill={shade(d.color ?? '#d6d3d1', 0.25)}
        stroke={shade(d.color ?? '#d6d3d1', -0.25)}
        strokeWidth="1"
        strokeDasharray="3 2"
        opacity="0.7"
      />
      <line x1={post.x} y1={post.y} x2={post.x} y2={post.y - 9} stroke="#57534e" strokeWidth="1" />
      <rect x={post.x - 5} y={post.y - 14} width="10" height="6" rx="1" fill="#fef3c7" />
    </g>
  );
}

/**
 * Wave 6: how many players are inside each building (a count badge on its
 * roof), and a "New" ribbon on businesses that opened lately. Both are part
 * of the building: a tap on them goes in.
 */
const Overlays = memo(function Overlays({
  layout,
  players,
  fresh,
}: {
  layout: CityLayout;
  players: PresenceView[];
  fresh: string[];
}) {
  const here = playersByPlace(players);
  const isNew = new Set(fresh);
  const out: ReactNode[] = [];
  for (const p of layout.places) {
    const n = here.get(p.id) ?? 0;
    const ribbon = isNew.has(p.id);
    if (!n && !ribbon) continue;
    // The count sits on the roof (the name label floats just above it); the
    // ribbon hangs from the roof's left corner.
    const roof = project(p.x + p.w / 2, p.y + p.d / 2);
    const corner = project(p.x, p.y + p.d);
    out.push(
      <g key={p.id} data-place={p.id}>
        {ribbon && (
          <g
            className="city-new"
            data-new={p.id}
            transform={`translate(${corner.x + 10} ${corner.y - p.h + 4})`}
          >
            <rect x={-14} y={-6} width={28} height={12} rx={3} />
            <text y={3} textAnchor="middle">
              {t('New')}
            </text>
          </g>
        )}
        {n > 0 && (
          <g
            className="city-here"
            data-here={p.id}
            data-count={n}
            transform={`translate(${roof.x} ${roof.y - p.h})`}
          >
            <circle r={8} />
            <text y={3.5} textAnchor="middle">
              {n > 9 ? '9+' : n}
            </text>
          </g>
        )}
      </g>,
    );
  }
  return <g className="city-overlays">{out}</g>;
});

/** Where an item of the skyline is drawn, for culling: a screen-space box. */
type CullBox = [minX: number, minY: number, maxX: number, maxY: number] | null;

interface SkyItem {
  depth: number;
  box: CullBox;
  node: ReactNode;
}

/** Large or long decor is never culled (runways, hills, landmarks, bridges). */
const UNCULLED: Decor['kind'][] = ['runway', 'hill', 'landmark', 'bridge', 'station'];

/** Buildings and decor with their depth and on-screen box (shared with culling). */
export function skylineItems(layout: CityLayout): SkyItem[] {
  const f = layout.flavour;
  const items: SkyItem[] = [];
  for (const p of layout.places) {
    const l = project(p.x, p.y + p.d);
    const r = project(p.x + p.w, p.y);
    const tp = project(p.x, p.y);
    const bt = project(p.x + p.w, p.y + p.d);
    items.push({
      depth: p.x + p.w / 2 + p.y + p.d / 2,
      box: [l.x - 12, tp.y - p.h - 30, r.x + 12, bt.y + 8],
      node: <Building key={p.id} p={p} f={f} />,
    });
  }
  layout.decor.forEach((d, n) => {
    const w = d.w ?? 0;
    const dd = d.d ?? 0;
    const c = project(d.x + w / 2, d.y + dd / 2);
    const half = Math.max(36, ((w + dd) * TW) / 2 + 24);
    items.push({
      depth: d.x + w / 2 + d.y + dd / 2 + (d.kind === 'runway' ? -10 : 0),
      box: UNCULLED.includes(d.kind)
        ? null
        : [c.x - half, c.y - 90, c.x + half, c.y + half / 2 + 10],
      node:
        d.kind === 'lot' ? (
          <EmptyLot key={`d${n}`} d={d} />
        ) : d.sprite ? (
          <GeoSprite key={`d${n}`} d={d} />
        ) : (
          <DecorItem key={`d${n}`} d={d} f={f} />
        ),
    });
  });
  items.sort((a, b) => a.depth - b.depth);
  return items;
}

/**
 * Buildings and decor, painted back to front, in depth bands. After each band
 * is an empty slot (`data-depth-slot`) that people and vehicles are moved into
 * as they walk, so nobody is drawn on a roof (Wave 7). Each item sits in a
 * `data-cull` group the map hides while it's off screen.
 */
const Skyline = memo(function Skyline({ layout }: { layout: CityLayout }) {
  const items = skylineItems(layout);
  let band = items.length ? depthBand(items[0]!.depth) : 0;
  // A slot under everything, for anyone behind the furthest building.
  const out: ReactNode[] = [<g key="slotlow" data-depth-slot={band - 1} />];
  items.forEach((it, i) => {
    const k = depthBand(it.depth);
    while (band < k) {
      out.push(<g key={`slot${band}`} data-depth-slot={band} />);
      band++;
    }
    out.push(
      <g key={`c${i}`} data-cull={i}>
        {it.node}
      </g>,
    );
  });
  // Room for people beyond the last building (the front streets and the shore).
  for (let n = 0; n < 40; n++, band++) out.push(<g key={`slot${band}`} data-depth-slot={band} />);
  return <g className="city-skyline">{out}</g>;
});

/**
 * Map labels, decluttered (Wave 4). Two sets, each collision-checked on its
 * own because they show at different zooms:
 *
 * - far (zoomed out and the default zoom): the key places (your office, the
 *   Hub, the Market, the Event Hall, the airport) and district names; at the
 *   default zoom only the districts with banks or investors keep their name.
 * - near (zoomed in): the key places again, then banks, funds, your home and
 *   the newsstand, then businesses and stalls.
 *
 * A key place's label moves up a little to clear another; any other label
 * that would overlap one already placed is skipped. Labels scale with the
 * map, so placement holds at every zoom. A place you tap shows its label
 * whatever the zoom (`is-focus`).
 */
export interface MapLabel {
  id: string;
  x: number;
  y: number;
  w: number;
  text: string;
  /** lbl-main (always), lbl-detail / lbl-biz / lbl-stall (zoomed in only). */
  tier: string;
  soon: boolean;
  color?: string;
}

export interface MapAreaLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  /** Districts with banks or investors: named at the default zoom too. */
  key: boolean;
}

const KEY_KINDS: Place['kind'][] = ['office', 'hub', 'airport', 'eventhall'];

export function placeLabels(
  layout: CityLayout,
  labelOf: (p: Place) => string,
  marketName = '',
): { labels: MapLabel[]; areas: MapAreaLabel[] } {
  const rank = (p: Place) =>
    KEY_KINDS.includes(p.kind) ? 0 : p.kind === 'stall' || p.kind === 'business' ? 2 : 1;
  type Box = { x: number; y: number; w: number };
  const hits = (boxes: Box[], x: number, y: number, w: number) =>
    boxes.some((o) => Math.abs(o.x - x) < (o.w + w) / 2 + 3 && Math.abs(o.y - y) < 19);
  const widthOf = (text: string) => Math.min(150, text.length * 5.6 + 14);
  const clip = (raw: string) => (raw.length > 26 ? `${raw.slice(0, 25)}…` : raw);

  // ---- Key places (both sets).
  const labels: MapLabel[] = [];
  const main: Box[] = [];
  const put = (id: string, raw: string, c: Pt, h: number, extra: Partial<MapLabel> = {}) => {
    const text = clip(raw);
    const w = widthOf(text);
    let y = c.y - h - 18;
    for (let tries = 0; tries < 3 && hits(main, c.x, y, w); tries++) y -= 19;
    main.push({ x: c.x, y, w });
    labels.push({ id, x: c.x, y, w, text, tier: 'lbl-main', soon: false, ...extra });
  };
  for (const p of layout.places.filter((x) => rank(x) === 0)) {
    const raw = labelOf(p);
    if (raw) put(p.id, raw, project(p.x + p.w / 2, p.y + p.d / 2), p.h, { soon: !!p.soon });
  }
  // The Market: one label over its stalls instead of a label per stall.
  const stalls = layout.places.filter((p) => p.kind === 'stall');
  if (stalls.length && marketName) {
    if (layout.geo) {
      // A real map's stalls line the streets: the name goes over their middle.
      const cx = stalls.reduce((s, p) => s + p.x + p.w / 2, 0) / stalls.length;
      const cy = stalls.reduce((s, p) => s + p.y + p.d / 2, 0) / stalls.length;
      put('market', marketName, project(cx, cy), 16);
    } else {
      const first = stalls[0]!;
      const i = Math.floor(first.x / B);
      const j = Math.floor(first.y / B);
      put('market', marketName, project(i * B + B / 2, j * B + B / 2), 16);
    }
  }

  // ---- Far set: district names, skipping any that would cover a key place.
  const keyAreas = new Set(
    layout.places
      .filter((p) => p.kind === 'lender' || p.kind === 'fund' || p.kind === 'playerbank')
      .map((p) => p.area)
      .filter((a): a is string => !!a),
  );
  const far: Box[] = [...main];
  const areas: MapAreaLabel[] = [];
  const named = layout.areas.length
    ? layout.areas.map((a) => ({
        id: a.id,
        at: a.at,
        text: a.name.toUpperCase(),
        key: keyAreas.has(a.id),
      }))
    : layout.districts
        .filter((d) => d.id === 'finance' || d.id === 'investors' || d.id === 'market')
        .map((d) => ({
          id: d.id,
          at: d.at,
          text: districtLabel(d.id).toUpperCase(),
          key: d.id !== 'market',
        }));
  for (const a of [...named.filter((x) => x.key), ...named.filter((x) => !x.key)]) {
    const c = project(a.at.x, a.at.y);
    // District names are spaced capitals: wider than a label's text.
    const w = a.text.length * 9.5;
    if (hits(far, c.x, c.y - 4, w)) continue;
    far.push({ x: c.x, y: c.y - 4, w });
    areas.push({ id: a.id, x: c.x, y: c.y - 4, text: a.text, key: a.key });
  }

  // ---- Near set: banks, funds and the rest, then businesses and stalls.
  const near: Box[] = [...main];
  const rest = layout.places
    .filter((p) => rank(p) > 0 && !(p.kind === 'stall' && p.dim))
    .sort((a, b) => rank(a) - rank(b));
  for (const p of rest) {
    const raw = labelOf(p);
    if (!raw) continue;
    const text = clip(raw);
    const w = widthOf(text);
    const c = project(p.x + p.w / 2, p.y + p.d / 2);
    let y = c.y - p.h - (p.kind === 'stall' ? 12 : 18);
    if (hits(near, c.x, y, w)) y -= 19;
    if (hits(near, c.x, y, w)) continue;
    near.push({ x: c.x, y, w });
    labels.push({
      id: p.id,
      x: c.x,
      y,
      w,
      text,
      tier: p.kind === 'business' ? 'lbl-biz' : p.kind === 'stall' ? 'lbl-stall' : 'lbl-detail',
      soon: !!p.soon,
      color: p.category ? CATEGORY_COLOR[p.category] : undefined,
    });
  }
  return { labels, areas };
}

const Labels = memo(function Labels({
  layout,
  labelOf,
}: {
  layout: CityLayout;
  labelOf: (p: Place) => string;
}) {
  const { labels, areas } = placeLabels(
    layout,
    labelOf,
    layout.marketName ?? districtLabel('market'),
  );
  return (
    <g className="city-labels" pointerEvents="none">
      {areas.map((a) => (
        <g key={a.id} transform={`translate(${Math.round(a.x)},${Math.round(a.y)})`}>
          <text
            className={`city-district lbl-s${a.key ? ' is-key' : ''}`}
            textAnchor="middle"
            data-area={a.id}
          >
            {a.text}
          </text>
        </g>
      ))}
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
            <g
              key="water"
              data-water={layout.geo ? w.name : undefined}
              transform={`translate(${Math.round(c.x)},${Math.round(c.y + 4)})`}
            >
              <text className="city-water-name lbl-s" textAnchor="middle">
                {w.name}
              </text>
            </g>
          );
        })}
      {layout.decor
        .filter((d) => d.kind === 'landmark' && d.name)
        .map((d) => {
          const c = project(d.x, d.y);
          return (
            <g
              key={`lm${d.name}`}
              transform={`translate(${Math.round(c.x)},${Math.round(c.y + 30)})`}
            >
              <text
                textAnchor="middle"
                className="city-landmark-name lbl-s"
                data-landmark-name={d.name}
              >
                {d.name}
              </text>
            </g>
          );
        })}
      {labels.map((l) => (
        <g
          key={l.id}
          data-label={l.id}
          className={`city-label ${l.tier}${l.soon ? ' is-soon' : ''}`}
          transform={`translate(${Math.round(l.x)},${Math.round(l.y)})`}
        >
          {/* Counter-scaled with the zoom, so a label stays 11–13 px on screen. */}
          <g className="lbl-s">
            <rect x={-l.w / 2} y={-9} width={l.w} height={17} rx={8.5} />
            {l.color && <circle cx={-l.w / 2 + 7} cy={-0.5} r={3} fill={l.color} />}
            <text x={l.color ? 3 : 0} y={3.5} textAnchor="middle">
              {l.text}
            </text>
          </g>
        </g>
      ))}
    </g>
  );
});

// ---------------------------------------------------------------------------
// The interactive map

export type CityMapProps = Parameters<typeof CityMap2D>[0];

/**
 * Wave 9 §B: a real city (OpenStreetMap) is drawn in 3D (WebGL, loaded on
 * demand) unless the player chose the Lite map or WebGL is missing; the 2D
 * map shows while the 3D one loads, and stands in if it fails.
 */
export function CityMap(props: CityMapProps) {
  const quality = useMapQuality();
  const [broken, setBroken] = useState(false);
  const use3d = !!props.layout.geo && quality === '3d' && !broken && hasWebGL();
  if (!use3d) return <CityMap2D {...props} />;
  // While the 3D chunk loads: a quiet placeholder, not the 2D map (it would
  // paint a whole other city for a moment, then be swapped out).
  return (
    <Suspense
      fallback={
        <div className="city-map city-loading" data-map3d="loading" role="status">
          <p>{t('Building the city…')}</p>
        </div>
      }
    >
      <CityMap3D {...props} onBroken={() => setBroken(true)} />
    </Suspense>
  );
}

/** The 2D map: Wave 8's canvas + SVG, and the generated cities. */
function CityMap2D({
  layout,
  look,
  name,
  labelOf,
  marker,
  onEnter,
  handleRef,
  ariaLabel,
  walkers = NONE_WALKERS,
  players = NONE_PLAYERS,
  flags = NONE_FLAGS,
  fresh = NONE_FLAGS,
  onArrive,
  onFarTrip,
  car = null,
  paused = false,
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
  /** A few anonymous passers-by (Wave 6: nobody to tap on the street). */
  walkers?: Walker[];
  /** Other players, from presence: a count on the building they're in. */
  players?: PresenceView[];
  /** Place ids flying bunting: an event is coming up there. */
  flags?: string[];
  /** Place ids of businesses that opened lately (a "New" ribbon). */
  fresh?: string[];
  /** The avatar stopped somewhere (after a walk, or on arrival in the city). */
  onArrive?: (at: Pt, placeId: string | null) => void;
  /** A tap on somewhere far: choose how to get there, then call handle.ride. */
  onFarTrip?: (trip: FarTrip) => void;
  /** Wave 10: your car (drive it yourself), when it is in this city. */
  car?: MyCar | null;
  /** Wave 10: homes you own here (the 3D map shows them; the 2D map ignores them). */
  properties?: OwnedProperty[];
  /** Wave 10: a tap on one of your homes on the map. */
  onOpenProperty?: (id: string) => void;
  /** Covered (a place's scene, a flight): the 3D map stops drawing meanwhile. */
  paused?: boolean;
}) {
  const reduced = useReducedMotion();
  // Wave 12: the real light in this city now (night blue, sunset gold).
  const sun = useSun(layout.marketId);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const avatarRef = useRef<SVGGElement>(null);
  const flipRef = useRef<SVGGElement>(null);
  const targetRef = useRef<SVGGElement>(null);
  const cam = useRef({ x: 0, y: 0, z: 1, w: 360, h: 480 });
  const pos = useRef<Pt>(lastPos.get(layout.marketId) ?? layout.start);
  const walk = useRef<{ raf: number; cancel: () => void } | null>(null);
  const rideRef = useRef<SVGGElement>(null);
  const pending = useRef<{ target: Pt; then?: () => void; placeId: string | null } | null>(null);
  const [vehicle, setVehicle] = useState<VehicleSpec | null>(null);
  const following = useRef(true);
  const onEnterRef = useRef(onEnter);
  const onArriveRef = useRef(onArrive);
  const onFarTripRef = useRef(onFarTrip);
  const carRef = useRef(car);
  useEffect(() => {
    carRef.current = car;
  }, [car]);
  useEffect(() => {
    onEnterRef.current = onEnter;
    onArriveRef.current = onArrive;
    onFarTripRef.current = onFarTrip;
  }, [onEnter, onArrive, onFarTrip]);

  const zoomLimits = useCallback(() => {
    const { w, h } = cam.current;
    const b = layout.bounds;
    // Zoomed right out, the whole city just fits (Wave 7: tight bounds, so
    // little empty sea or sand), but never smaller than 0.3.
    const fit = Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
    // A real map zooms right out, to the whole city.
    // (filling the view: beyond the map's edge there is no data).
    const cover = Math.max(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
    return { min: layout.geo ? Math.max(0.004, cover) : Math.max(0.3, fit), max: 2.6 };
  }, [layout]);

  // ---- Depth: slots in the skyline that people are moved into (see Skyline).
  const slots = useRef<{ min: number; els: Element[] } | null>(null);
  const entitiesRef = useRef<SVGGElement>(null);
  const placeDepth = useCallback((host: Element, depth: number) => {
    const s = slots.current;
    const parent = s?.els.length
      ? s.els[Math.max(0, Math.min(s.els.length - 1, depthBand(depth) - s.min))]!
      : entitiesRef.current;
    if (parent && host.parentNode !== parent) parent.appendChild(host);
  }, []);

  // ---- Culling: skyline items well off screen are hidden (fewer nodes to paint).
  const cull = useRef<{
    els: (SVGElement | undefined)[];
    boxes: CullBox[];
    shown: Uint8Array;
    at: { x: number; y: number; z: number; w: number; h: number };
  } | null>(null);
  const runCull = useCallback((force = false) => {
    const k = cull.current;
    if (!k) return;
    const c = cam.current;
    const moved =
      Math.abs(c.x - k.at.x) * c.z > 48 ||
      Math.abs(c.y - k.at.y) * c.z > 48 ||
      Math.abs(c.z / k.at.z - 1) > 0.04 ||
      c.w !== k.at.w ||
      c.h !== k.at.h;
    if (!force && !moved) return;
    k.at = { x: c.x, y: c.y, z: c.z, w: c.w, h: c.h };
    // The view plus half a screen each way, so a pan reveals buildings already drawn.
    const hw = c.w / c.z;
    const hh = c.h / c.z;
    const x0 = c.x - hw;
    const x1 = c.x + hw;
    const y0 = c.y - hh;
    const y1 = c.y + hh;
    for (let i = 0; i < k.boxes.length; i++) {
      const b = k.boxes[i];
      const on = !b || (b[2] >= x0 && b[0] <= x1 && b[3] >= y0 && b[1] <= y1) ? 1 : 0;
      if (on !== k.shown[i]) {
        k.shown[i] = on;
        const el = k.els[i];
        if (el) el.style.display = on ? '' : 'none';
      }
    }
  }, []);

  // Wave 8: a real map's base layers, on a canvas under the SVG.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The painted ground depends on the map alone: a new layout of the same city
  // (a business opening, a hire) keeps the painter and its cached tiles.
  const painter = useMemo(
    () =>
      layout.geo
        ? new GeoPainter(
            layout.geo,
            layout.flavour,
            layout.areas.map((a) => project(a.at.x, a.at.y)),
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same map and city, same ground
    [layout.geo?.data, layout.marketId],
  );

  const lastZ = useRef(0);
  const apply = useCallback(() => {
    const c = cam.current;
    const b = layout.bounds;
    const lim = zoomLimits();
    c.z = Math.max(lim.min, Math.min(lim.max, c.z));
    const hw = c.w / c.z / 2;
    const hh = c.h / c.z / 2;
    // Keep the view on the city: centred when it all fits, else clamped to its edges.
    const bw = b.maxX - b.minX;
    const bh = b.maxY - b.minY;
    c.x = hw * 2 >= bw ? (b.minX + b.maxX) / 2 : Math.max(b.minX + hw, Math.min(b.maxX - hw, c.x));
    c.y = hh * 2 >= bh ? (b.minY + b.maxY) / 2 : Math.max(b.minY + hh, Math.min(b.maxY - hh, c.y));
    const svg = svgRef.current;
    if (!svg) return;
    const vb = `${(c.x - hw).toFixed(1)} ${(c.y - hh).toFixed(1)} ${(hw * 2).toFixed(1)} ${(hh * 2).toFixed(1)}`;
    // Only touch the DOM when the camera really moved.
    if (svg.getAttribute('viewBox') !== vb) svg.setAttribute('viewBox', vb);
    if (painter && canvasRef.current) painter.draw(canvasRef.current, c);
    if (Math.abs(c.z - lastZ.current) > 0.002) {
      lastZ.current = c.z;
      // Labels counter-scale with the zoom (CSS `.lbl-s`): about 12 px on screen.
      svg.style.setProperty('--lbl-s', (LABEL_PX / c.z).toFixed(3));
    }
    const zl = c.z < 0.75 ? '0' : c.z < 1.25 ? '1' : '2';
    if (wrapRef.current && wrapRef.current.dataset.zoom !== zl) wrapRef.current.dataset.zoom = zl;
    runCull();
  }, [layout, zoomLimits, runCull, painter]);

  // The avatar's body is drawn into the depth slots (behind buildings in
  // front of it); its name tag stays on top.
  const [avatarHost] = useState(() =>
    typeof document === 'undefined' ? null : document.createElementNS(SVG_NS, 'g'),
  );
  const tagRef = useRef<SVGGElement>(null);
  const placeAvatar = useCallback(
    (p: Pt, dx = 0, dy = 0) => {
      const s = project(p.x, p.y);
      const tr = `translate(${s.x.toFixed(1)},${s.y.toFixed(1)})`;
      avatarRef.current?.setAttribute('transform', tr);
      tagRef.current?.setAttribute('transform', tr);
      if (avatarHost) placeDepth(avatarHost, p.x + p.y);
      const sdx = (dx - dy) * TW;
      if (flipRef.current && Math.abs(sdx) > 0.001)
        flipRef.current.setAttribute(
          'transform',
          `scale(${sdx < 0 ? -MAP_FIGURE_SCALE : MAP_FIGURE_SCALE},${MAP_FIGURE_SCALE})`,
        );
    },
    [avatarHost, placeDepth],
  );

  const centreOn = useCallback(
    (p: Pt) => {
      const s = project(p.x, p.y);
      cam.current.x = s.x;
      cam.current.y = s.y - CAM_LIFT;
      apply();
    },
    [apply],
  );

  // After the skyline is drawn: find its depth slots and cull groups, then put
  // the avatar in place.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const found = [...svg.querySelectorAll<SVGGElement>('[data-depth-slot]')];
    slots.current = found.length
      ? { min: Number(found[0]!.getAttribute('data-depth-slot')), els: found }
      : null;
    const items = skylineItems(layout);
    const els: (SVGElement | undefined)[] = [];
    svg.querySelectorAll<SVGGElement>('[data-cull]').forEach((el) => {
      els[Number(el.getAttribute('data-cull'))] = el;
    });
    cull.current = {
      els,
      boxes: items.map((i) => i.box),
      shown: new Uint8Array(items.length).fill(1),
      at: { x: 0, y: 0, z: 1, w: 0, h: 0 },
    };
    if (avatarHost) {
      avatarHost.setAttribute('pointer-events', 'none');
      placeDepth(avatarHost, pos.current.x + pos.current.y);
    }
    runCull(true);
  }, [layout, avatarHost, placeDepth, runCull]);
  useEffect(() => () => avatarHost?.remove(), [avatarHost]);

  // Riding or not, for the HUD ("What to do now" hides during a ride). The
  // ride scenes (city/ride) send the same event; see CityScreen.
  useEffect(() => {
    if (!vehicle) return;
    setRiding(true);
    return () => setRiding(false);
  }, [vehicle]);

  // Covered by a place's scene: the traffic (SVG animations) stops meanwhile,
  // so the hidden map isn't repainted every frame.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg?.pauseAnimations) return;
    if (paused) svg.pauseAnimations();
    else svg.unpauseAnimations();
  }, [paused]);

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

  // Another city: start at the avatar, at a comfortable zoom. (A new layout
  // of the same city leaves the camera where you put it.)
  const shownMarket = useRef<string | null>(null);
  useEffect(() => {
    if (shownMarket.current === layout.marketId) return;
    shownMarket.current = layout.marketId;
    pos.current = lastPos.get(layout.marketId) ?? layout.start;
    placeAvatar(pos.current);
    cam.current.z = layout.geo ? (cam.current.w < 500 ? 0.9 : 1) : cam.current.w < 500 ? 1 : 1.15;
    centreOn(pos.current);
    onArriveRef.current?.(pos.current, null);
  }, [layout, placeAvatar, centreOn]);

  const stopWalk = useCallback(() => {
    walk.current?.cancel();
    walk.current = null;
    avatarRef.current?.classList.remove('is-walking', 'is-riding');
    targetRef.current?.setAttribute('visibility', 'hidden');
  }, []);
  useEffect(() => stopWalk, [stopWalk]);

  /** Show a place's label whatever the zoom (the one you tapped). */
  const focusLabel = useCallback((placeId: string | null) => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.querySelectorAll('.city-label.is-focus').forEach((el) => el.classList.remove('is-focus'));
    if (placeId)
      svg
        .querySelector(`[data-label="${placeId.replace(/["\\]/g, '')}"]`)
        ?.classList.add('is-focus');
  }, []);

  const walkTo = useCallback(
    (
      target: Pt,
      then?: () => void,
      placeId: string | null = null,
      opts: { mode?: RideMode; ask?: boolean } = {},
    ) => {
      stopWalk();
      pending.current = null;
      focusLabel(placeId);
      const path = findPath(layout, pos.current, target);
      // Trips count in travel tiles (about 50 m), whatever the map's scale.
      const len = travelTiles(layout, pathLength(path));
      const ts = project(target.x, target.y);
      // Somewhere far that you tapped: ask how to get there first.
      if (opts.ask && len > SHORT_HOP && onFarTripRef.current) {
        pending.current = { target, then, placeId };
        targetRef.current?.setAttribute('transform', `translate(${ts.x},${ts.y})`);
        targetRef.current?.setAttribute('visibility', 'visible');
        onFarTripRef.current({ tiles: len, placeId });
        return;
      }
      // Short hops always walk.
      const mode: RideMode = len > SHORT_HOP ? (opts.mode ?? 'walk') : 'walk';
      // Wave 7: a ride across town plays full screen (or a chase with reduced motion).
      const spec0 = rideVehicle(mode, layout.marketId, layout.flavour.vehicles, carRef.current);
      const spec =
        spec0 && mode !== 'bus' && mode !== 'drive' ? { ...spec0, body: look.top } : spec0;
      const scene =
        len > SHORT_HOP
          ? beginRide({ mode, tiles: len, path, layout, placeId, look, mapMs: rideMs(mode, len) })
          : null;
      const done = () => {
        scene?.end();
        pos.current = target;
        lastPos.set(layout.marketId, target);
        placeAvatar(target);
        stopWalk();
        setVehicle(null);
        onArriveRef.current?.(target, placeId);
        then?.();
      };
      if (len < 0.05 || (reduced && !scene)) {
        done();
        if (reduced) centreOn(target);
        return;
      }
      targetRef.current?.setAttribute('transform', `translate(${ts.x},${ts.y})`);
      targetRef.current?.setAttribute('visibility', 'visible');
      setVehicle(spec);
      avatarRef.current?.classList.add(spec ? 'is-riding' : 'is-walking');
      following.current = true;
      // Each way of getting around has its own pace (walking: about 5 tiles a second).
      const ms = scene?.ms ?? rideMs(mode, len);
      const t0 = performance.now();
      let cancelled = false;
      let axis = '';
      const step = (now: number) => {
        if (cancelled) return;
        const k = scene?.skipped() ? 1 : Math.min(1, (now - t0) / ms);
        const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const { p, dx, dy } = pointAlong(path, eased);
        pos.current = p;
        placeAvatar(p, dx, dy);
        // A vehicle turns with the street.
        const ax = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        if (ax !== axis && (dx || dy)) {
          axis = ax;
          rideRef.current?.setAttribute('data-axis', ax);
        }
        if (following.current) {
          const s = project(p.x, p.y);
          const c = cam.current;
          // Faster rides pull the camera along harder, so you never lose yourself.
          const pull = spec ? 0.14 : 0.08;
          c.x += (s.x - c.x) * pull;
          c.y += (s.y - CAM_LIFT - c.y) * pull;
          apply();
        }
        if (k < 1) walk.current!.raf = requestAnimationFrame(step);
        else done();
      };
      walk.current = {
        raf: requestAnimationFrame(step),
        cancel: () => {
          cancelled = true;
          scene?.end();
          if (walk.current) cancelAnimationFrame(walk.current.raf);
          lastPos.set(layout.marketId, pos.current);
        },
      };
    },
    [layout, reduced, look, placeAvatar, stopWalk, apply, centreOn, focusLabel],
  );

  const goTo = useCallback(
    (id: string, mode?: RideMode, ask = false) => {
      const p = layout.places.find((x) => x.id === id);
      if (!p) return;
      walkTo(p.door, () => onEnterRef.current(p), p.id, { mode, ask });
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
  const ride = useCallback(
    (mode: RideMode) => {
      const trip = pending.current;
      if (trip) walkTo(trip.target, trip.then, trip.placeId, { mode });
    },
    [walkTo],
  );
  const cancelTrip = useCallback(() => {
    pending.current = null;
    targetRef.current?.setAttribute('visibility', 'hidden');
  }, []);

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
      goTo: (id, mode) => goTo(id, mode),
      walkToPlace,
      ride,
      cancelTrip,
      recentre: () => centreOn(pos.current),
      zoom: (f) => zoomAt(f),
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, goTo, walkToPlace, ride, cancelTrip, centreOn, zoomAt]);

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
    // A tap: on a building (or its badge) or a street. People live inside buildings.
    const el = (e.target as Element).closest?.('[data-place]');
    const id = el?.getAttribute('data-place');
    if (id) {
      goTo(id, undefined, true);
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    const g = unproject(w.x, w.y);
    const s = nearestStreetPoint(layout, g);
    walkTo(s, undefined, null, { ask: true });
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
  const tint = mapTint(sun);

  return (
    <div
      ref={wrapRef}
      className={`city-map${reduced ? ' is-reduced' : ''}`}
      data-sun-phase={sun.phase}
      data-lights={sun.lightsOn ? 'on' : 'off'}
      data-zoom="1"
      tabIndex={0}
      role="application"
      aria-roledescription={t('map')}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {painter && <canvas ref={canvasRef} className="city-geo-canvas" aria-hidden="true" />}
      <svg
        ref={svgRef}
        className={`city-svg${painter ? ' is-geo' : ''}`}
        aria-hidden="true"
        viewBox={`${b.minX} ${b.minY} ${b.maxX - b.minX} ${b.maxY - b.minY}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <ArtDefs f={layout.flavour} />
        {!painter && (
          <rect
            x={b.minX - 2000}
            y={b.minY - 2000}
            width={b.maxX - b.minX + 4000}
            height={b.maxY - b.minY + 4000}
            fill="url(#sky)"
          />
        )}
        {!painter && <Ground layout={layout} />}
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
        <Crowd walkers={walkers} reduced={reduced} paused={paused} placeDepth={placeDepth} />
        {layout.flavour.fog && !painter && <Fog layout={layout} />}
        <Labels layout={layout} labelOf={labelOf} />
        <Overlays layout={layout} players={players} fresh={fresh} />
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
        <g ref={entitiesRef} className="city-entities" pointerEvents="none" />
        <g
          ref={tagRef}
          className="city-you-tag"
          transform={`translate(${start.x},${start.y})`}
          pointerEvents="none"
        >
          <g transform="translate(0 -30)">
            <g className="city-you lbl-s">
              <rect
                x={-name.length * 3.1 - 7}
                y="-15"
                width={name.length * 6.2 + 14}
                height="15"
                rx="7.5"
              />
              <text y="-4.5" textAnchor="middle">
                {name}
              </text>
            </g>
          </g>
        </g>
        {avatarHost &&
          createPortal(
            <g
              ref={avatarRef}
              className="city-avatar"
              transform={`translate(${start.x},${start.y})`}
            >
              <ellipse className="city-you-ring" rx="8" ry="4" />
              <g
                ref={flipRef}
                className="city-avatar-fig"
                transform={`scale(${MAP_FIGURE_SCALE},${MAP_FIGURE_SCALE})`}
              >
                <AvatarFigure look={look} />
              </g>
              {vehicle && (
                <g ref={rideRef} className="city-ride" data-axis="x" data-ride={vehicle.id}>
                  <g className="city-ride-x" transform={`scale(${MAP_RIDE_SCALE})`}>
                    <VehicleShape spec={vehicle} axis="x" />
                  </g>
                  <g className="city-ride-y" transform={`scale(${MAP_RIDE_SCALE})`}>
                    <VehicleShape spec={vehicle} axis="y" />
                  </g>
                </g>
              )}
            </g>,
            avatarHost,
          )}
      </svg>
      {/* Wave 12: the city's real light over the map (night blue, sunset gold). */}
      {tint.opacity > 0 && (
        <div
          className="city-daylight"
          aria-hidden="true"
          style={{ background: tint.color, opacity: tint.opacity }}
        />
      )}
      {painter && (
        <a
          className="city-osm-credit"
          data-osm-credit=""
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          {OSM_CREDIT}
        </a>
      )}
    </div>
  );
}
