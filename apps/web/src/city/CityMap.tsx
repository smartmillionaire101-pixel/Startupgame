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
  type CityLayout,
  type DistrictId,
  type Place,
  type Pt,
} from './layout';

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

/** Last avatar position per market, so switching tabs doesn't send you home. */
const lastPos = new Map<string, Pt>();

export interface CityMapHandle {
  /** Walk to a place's door, then call onEnter. */
  goTo: (placeId: string) => void;
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

const Ground = memo(function Ground({ layout }: { layout: CityLayout }) {
  const { flavour: f, extent: E, size } = layout;
  const m = 6;
  const out: ReactNode[] = [];
  // Land around the city.
  out.push(
    <polygon
      key="land"
      points={[P(-m, -m), P(E + m, -m), P(E + m, E + m), P(-m, E + m)].join(' ')}
      fill={f.land}
    />,
  );
  // Edge flavour: water along the front-left edge, hills or dumps behind.
  if (f.edge === 'water') {
    out.push(
      <polygon
        key="shore"
        points={[P(-m, E + 1.1), P(E + m, E + 1.1), P(E + m, E + 1.9), P(-m, E + 1.9)].join(' ')}
        fill="#f5e6c4"
      />,
      <polygon
        key="water"
        points={[P(-m, E + 1.8), P(E + m, E + 1.8), P(E + m, E + m), P(-m, E + m)].join(' ')}
        fill="url(#water)"
      />,
    );
    for (let k = 0; k < 14; k++) {
      const a = project(-2 + ((k * 7) % (E + 6)), E + 2.6 + (k % 3) * 0.9);
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
  } else {
    for (let k = 0; k < 6; k++) {
      const c = project(-3 + k * ((E + 6) / 5), -4.2 + (k % 2) * 0.8);
      const rw = 70 + (k % 3) * 25;
      if (f.edge === 'mine-dumps')
        out.push(
          <polygon
            key={`hill${k}`}
            points={`${c.x - rw},${c.y} ${c.x - rw * 0.55},${c.y - 34} ${c.x + rw * 0.55},${c.y - 34} ${c.x + rw},${c.y}`}
            fill={k % 2 ? f.edgeColor : shade(f.edgeColor, -0.1)}
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
            fill={k % 2 ? f.edgeColor : shade(f.edgeColor, -0.08)}
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
    const mid = Math.floor(size / 2) * B;
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
            <g key={n} transform={`translate(${p.x},${p.y})`}>
              <VehicleShape spec={v.spec} axis={v.axis} />
            </g>
          );
        }
        return (
          <g key={n}>
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

const Labels = memo(function Labels({
  layout,
  labelOf,
}: {
  layout: CityLayout;
  labelOf: (p: Place) => string;
}) {
  return (
    <g className="city-labels" pointerEvents="none">
      {layout.districts.map((d) => {
        const c = project(d.at.x, d.at.y);
        const text = districtLabel(d.id);
        if (!text) return null;
        return (
          <text key={d.id} x={c.x} y={c.y - 4} className="city-district" textAnchor="middle">
            {text.toUpperCase()}
          </text>
        );
      })}
      {layout.places.map((p) => {
        const label = labelOf(p);
        if (!label) return null;
        const c = project(p.x + p.w / 2, p.y + p.d / 2);
        const tier =
          p.kind === 'stall'
            ? 'lbl-stall'
            : p.kind === 'lender' || p.kind === 'fund' || p.kind === 'playerbank'
              ? 'lbl-detail'
              : 'lbl-main';
        const w = Math.min(150, label.length * 5.6 + 14);
        return (
          <g
            key={p.id}
            className={`city-label ${tier}${p.soon ? ' is-soon' : ''}`}
            transform={`translate(${Math.round(c.x)},${Math.round(c.y - p.h - (p.kind === 'stall' ? 12 : 18))})`}
          >
            <rect x={-w / 2} y={-9} width={w} height={17} rx={8.5} />
            <text x={0} y={3.5} textAnchor="middle">
              {label.length > 26 ? `${label.slice(0, 25)}…` : label}
            </text>
          </g>
        );
      })}
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
  useEffect(() => {
    onEnterRef.current = onEnter;
  }, [onEnter]);

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
  }, [layout, placeAvatar, centreOn]);

  const stopWalk = useCallback(() => {
    walk.current?.cancel();
    walk.current = null;
    avatarRef.current?.classList.remove('is-walking');
    targetRef.current?.setAttribute('visibility', 'hidden');
  }, []);
  useEffect(() => stopWalk, [stopWalk]);

  const walkTo = useCallback(
    (target: Pt, then?: () => void) => {
      stopWalk();
      const path = findPath(layout, pos.current, target);
      const len = pathLength(path);
      const done = () => {
        pos.current = target;
        lastPos.set(layout.marketId, target);
        placeAvatar(target);
        stopWalk();
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
      walkTo(p.door, () => onEnterRef.current(p));
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
      recentre: () => centreOn(pos.current),
      zoom: (f) => zoomAt(f),
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, goTo, centreOn, zoomAt]);

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
    // A tap.
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
