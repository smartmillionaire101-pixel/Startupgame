/**
 * Wave 9 §B: the 3D city map (WebGL). Same props and handle as the 2D map
 * (CityMap.tsx): the layout, places, walking along real roads (findPath),
 * rides and far trips. Only the drawing changes: a CityScene renders the
 * city; labels, counts and your name tag are HTML over the canvas, placed
 * each frame, and tapping a label or a building goes there as before. The
 * Places list stays the accessible way in (the canvas is decorative).
 *
 * Loaded on demand (its own chunk, with three.js).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n';
import { avatarPosIn, placeAvatarAt, useReducedMotion, type CityMapProps } from '../CityMap';
import { CATEGORY_COLOR } from '../contract';
import { OSM_CREDIT } from '../geo';
import { geoTile } from '../geoLayout';
import {
  findPath,
  nearestStreetPoint,
  pathLength,
  pointAlong,
  travelTiles,
  type Place,
  type Pt,
} from '../layout';
import { playersByPlace } from '../people';
import { setRiding } from '../riding';
import { beginRide } from '../ride/state';
import { localHour, rideMs, rideVehicle, SHORT_HOP, type RideMode } from '../travel';
import type { VehicleSpec } from '../flavour';
import { CityScene, type Tier } from './scene';
import type { PropertyTier } from '../properties';

const tierLabel = (tier: PropertyTier) =>
  ({
    studio: t('Studio'),
    apartment: t('Apartment'),
    townhouse: t('Townhouse'),
    villa: t('Villa'),
    mansion: t('Mansion'),
    penthouse: t('Penthouse'),
  })[tier];
import { markWebGLBroken } from './quality';
import './city3d.css';

const NONE: never[] = [];
const KEY_KINDS: Place['kind'][] = ['office', 'hub', 'airport', 'eventhall'];

interface Lbl {
  id: string;
  text: string;
  place: Place | null;
  /** World anchor (metres; y up). */
  x: number;
  y: number;
  z: number;
  rank: number;
  tier: string;
  color?: string;
  soon?: boolean;
}

/** The hour the sky shows: the city's clock (a debug override for screenshots). */
function hourOf(marketId: string) {
  try {
    const o = localStorage.getItem('runway.mapHour');
    if (o !== null && o !== '' && Number.isFinite(Number(o))) return Number(o);
  } catch {
    /* no storage */
  }
  return localHour(marketId) + new Date().getMinutes() / 60;
}

function tierOf(): Tier {
  if (typeof window === 'undefined') return 'low';
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const cores = navigator.hardwareConcurrency || 4;
  return small || cores <= 4 ? 'low' : 'high';
}

export default function CityMap3D(props: CityMapProps & { onBroken?: () => void }) {
  const {
    layout,
    look,
    name,
    labelOf,
    marker,
    handleRef,
    ariaLabel,
    walkers = NONE,
    players = NONE,
    flags = NONE,
    fresh = NONE,
    onBroken,
    properties = NONE,
  } = props;
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const pos = useRef<Pt>(avatarPosIn(layout.marketId) ?? layout.start);
  const walk = useRef<{ raf: number; cancel: () => void } | null>(null);
  const pending = useRef<{ target: Pt; then?: () => void; placeId: string | null } | null>(null);
  const [vehicle, setVehicle] = useState<VehicleSpec | null>(null);
  const [walking, setWalking] = useState(false);
  const [driving, setDriving] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const cb = useRef(props);
  useEffect(() => {
    cb.current = props;
  });

  // ---- The scene: one per layout.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let scene: CityScene;
    try {
      scene = new CityScene(
        canvas,
        layout,
        { tier: tierOf(), reduced, hour: hourOf(layout.marketId) },
        look,
        walkers,
      );
    } catch {
      markWebGLBroken();
      onBroken?.();
      return;
    }
    sceneRef.current = scene;
    (window as unknown as { __city3d?: CityScene }).__city3d = scene;
    const r = wrap.getBoundingClientRect();
    scene.resize(r.width, r.height);
    scene.rig.dist = r.width < 500 ? 520 : 640;
    pos.current = avatarPosIn(layout.marketId) ?? layout.start;
    scene.actors.setAvatar(pos.current);
    scene.following = true;
    const lost = (e: Event) => {
      e.preventDefault();
      markWebGLBroken();
      onBroken?.();
    };
    canvas.addEventListener('webglcontextlost', lost);
    const shown = requestAnimationFrame(() => setReady(true));
    cb.current.onArrive?.(pos.current, null);
    return () => {
      cancelAnimationFrame(shown);
      canvas.removeEventListener('webglcontextlost', lost);
      scene.dispose();
      sceneRef.current = null;
      setReady(false);
    };
    // The look and walkers are pushed in below; reduced motion rebuilds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, reduced]);

  useEffect(() => {
    sceneRef.current?.actors.setLook(look);
    sceneRef.current?.invalidate();
  }, [look, ready]);
  useEffect(() => {
    sceneRef.current?.actors.setWalkers(walkers);
  }, [walkers, ready]);
  // Wave 10: the homes you own, at their neighbourhoods.
  useEffect(() => {
    sceneRef.current?.setProperties(properties);
  }, [properties, ready]);

  // The sky follows the city's clock.
  useEffect(() => {
    const id = setInterval(() => sceneRef.current?.setHour(hourOf(layout.marketId)), 60_000);
    return () => clearInterval(id);
  }, [layout.marketId]);

  // Size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      sceneRef.current?.resize(r.width, r.height);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [ready]);

  // Riding, for the HUD.
  useEffect(() => {
    if (!vehicle) return;
    setRiding(true);
    return () => setRiding(false);
  }, [vehicle]);
  useEffect(() => {
    sceneRef.current?.actors.setRide(vehicle);
  }, [vehicle, ready]);

  // ---- Walking and rides (as the 2D map does).
  const placeAvatar = useCallback((p: Pt, dx = 0, dy = 0) => {
    sceneRef.current?.actors.setAvatar(p, dx, dy);
    sceneRef.current?.invalidate();
  }, []);

  const stopWalk = useCallback(() => {
    walk.current?.cancel();
    walk.current = null;
    sceneRef.current?.actors.setWalking(false);
    setWalking(false);
  }, []);
  useEffect(() => stopWalk, [stopWalk]);

  const walkTo = useCallback(
    (
      target: Pt,
      then?: () => void,
      placeId: string | null = null,
      opts: { mode?: RideMode; ask?: boolean } = {},
    ) => {
      stopWalk();
      pending.current = null;
      setFocus(placeId);
      const path = findPath(layout, pos.current, target);
      const len = travelTiles(layout, pathLength(path));
      if (opts.ask && len > SHORT_HOP && cb.current.onFarTrip) {
        pending.current = { target, then, placeId };
        cb.current.onFarTrip({ tiles: len, placeId });
        return;
      }
      // Your own car goes even round the corner; other short hops walk.
      const mode: RideMode =
        len > SHORT_HOP || opts.mode === 'drive' ? (opts.mode ?? 'walk') : 'walk';
      const spec0 = rideVehicle(mode, layout.marketId, layout.flavour.vehicles, cb.current.car);
      const spec =
        spec0 && mode !== 'bus' && mode !== 'drive' ? { ...spec0, body: look.top } : spec0;
      const driving = mode === 'drive';
      const scene =
        len > SHORT_HOP || driving
          ? beginRide({ mode, tiles: len, path, layout, placeId, look, mapMs: rideMs(mode, len) })
          : null;
      const done = () => {
        scene?.end();
        if (driving) {
          sceneRef.current?.actors.setDriving(0);
          sceneRef.current?.endChase();
          setDriving(false);
        }
        pos.current = target;
        placeAvatarAt(layout.marketId, target);
        placeAvatar(target);
        stopWalk();
        setVehicle(null);
        cb.current.onArrive?.(target, placeId);
        then?.();
      };
      if (len < 0.05 || (reduced && !scene)) {
        done();
        return;
      }
      setVehicle(spec);
      setWalking(true);
      const s3 = sceneRef.current;
      s3?.actors.setWalking(true);
      if (s3) s3.following = true;
      if (driving && s3) {
        // Keep to your lane, the camera behind you.
        s3.actors.setDriving(2.2);
        if (!reduced) s3.startChase();
        setDriving(true);
      }
      const ms = scene?.ms ?? rideMs(mode, len);
      const t0 = performance.now();
      let cancelled = false;
      const step = (now: number) => {
        if (cancelled) return;
        const k = scene?.skipped() ? 1 : Math.min(1, (now - t0) / ms);
        const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const { p, dx, dy } = pointAlong(path, eased);
        pos.current = p;
        placeAvatar(p, dx, dy);
        if (k < 1) walk.current!.raf = requestAnimationFrame(step);
        else done();
      };
      walk.current = {
        raf: requestAnimationFrame(step),
        cancel: () => {
          cancelled = true;
          scene?.end();
          if (driving) {
            sceneRef.current?.actors.setDriving(0);
            sceneRef.current?.endChase();
            setDriving(false);
          }
          if (walk.current) cancelAnimationFrame(walk.current.raf);
          placeAvatarAt(layout.marketId, pos.current);
        },
      };
    },
    [layout, reduced, look, placeAvatar, stopWalk],
  );

  const goTo = useCallback(
    (id: string, mode?: RideMode, ask = false) => {
      const p = layout.places.find((x) => x.id === id);
      if (!p) return;
      walkTo(p.door, () => cb.current.onEnter(p), p.id, { mode, ask });
    },
    [layout, walkTo],
  );

  /** A home of yours: open it (the Homes app), or go there when nothing opens it. */
  const openHome = useCallback(
    (id: string) => {
      if (cb.current.onOpenProperty) {
        cb.current.onOpenProperty(id);
        return;
      }
      const h = sceneRef.current?.homes.find((x) => x.prop.id === id);
      if (h) walkTo(nearestStreetPoint(layout, geoTile(h.x, h.y)), undefined, null, { ask: true });
    },
    [layout, walkTo],
  );

  const recentre = useCallback(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.following = true;
    s.touch(1200);
  }, []);

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      goTo: (id, mode) => goTo(id, mode),
      walkToPlace: (id) => {
        const p = layout.places.find((x) => x.id === id);
        if (p) walkTo(p.door, undefined, p.id);
      },
      ride: (mode) => {
        const trip = pending.current;
        if (trip) walkTo(trip.target, trip.then, trip.placeId, { mode });
      },
      cancelTrip: () => {
        pending.current = null;
      },
      recentre,
      zoom: (f) => sceneRef.current?.zoomAt(f),
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, goTo, walkTo, recentre, layout]);

  // ---- Input: drag pans, right-drag (or two fingers) turns and tilts, pinch and wheel zoom.
  const pointers = useRef(new Map<number, { x: number; y: number; button: number }>());
  const gesture = useRef({ moved: 0, downX: 0, downY: 0, pinch: 0, angle: 0, midY: 0 });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = local(e);
    pointers.current.set(e.pointerId, { ...p, button: e.button });
    if (pointers.current.size === 1)
      gesture.current = { moved: 0, downX: p.x, downY: p.y, pinch: 0, angle: 0, midY: p.y };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      gesture.current.angle = Math.atan2(b!.y - a!.y, b!.x - a!.x);
      gesture.current.midY = (a!.y + b!.y) / 2;
      gesture.current.moved = 99;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    const s = sceneRef.current;
    if (!prev || !s) return;
    const next = { ...local(e), button: prev.button };
    pointers.current.set(e.pointerId, next);
    const g = gesture.current;
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const ang = Math.atan2(b!.y - a!.y, b!.x - a!.x);
      const midY = (a!.y + b!.y) / 2;
      if (g.pinch > 0) s.zoomAt(dist / g.pinch, (a!.x + b!.x) / 2, midY);
      let da = ang - g.angle;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      s.rotate(-da, (midY - g.midY) * 0.004);
      g.pinch = dist;
      g.angle = ang;
      g.midY = midY;
      return;
    }
    g.moved = Math.max(g.moved, Math.hypot(next.x - g.downX, next.y - g.downY));
    if (g.moved > 6) {
      if (!wrapRef.current?.hasPointerCapture?.(e.pointerId))
        wrapRef.current?.setPointerCapture?.(e.pointerId);
      if (prev.button === 2 || e.shiftKey || e.ctrlKey)
        s.rotate((next.x - prev.x) * -0.006, (next.y - prev.y) * 0.004);
      else s.pan(prev.x, prev.y, next.x, next.y);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const had = pointers.current.delete(e.pointerId);
    if (!had || pointers.current.size > 0) return;
    if (gesture.current.moved > 6) return;
    // A tap: a label (or badge), a building, or the street.
    const el = (e.target as Element).closest?.('[data-place]');
    const id = el?.getAttribute('data-place');
    if (id) {
      goTo(id, undefined, true);
      return;
    }
    const s = sceneRef.current;
    if (!s) return;
    const p = local(e);
    // One of your homes (its label or its model).
    const hid =
      (e.target as Element).closest?.('[data-property]')?.getAttribute('data-property') ??
      s.pickHome(p.x, p.y)?.id;
    if (hid) {
      openHome(hid);
      return;
    }
    const hit = s.pickPlace(p.x, p.y);
    if (hit) {
      goTo(hit.id, undefined, true);
      return;
    }
    const gp = s.groundPoint(p.x, p.y);
    if (!gp) return;
    const tile = geoTile(gp.x, gp.z);
    walkTo(nearestStreetPoint(layout, tile), undefined, null, { ask: true });
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      sceneRef.current?.zoomAt(
        Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)),
        e.clientX - r.left,
        e.clientY - r.top,
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const s = sceneRef.current;
    if (!s) return;
    const step = s.rig.dist * 0.15;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      s.panBy(m[0], m[1]);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      s.zoomAt(1.2);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      s.zoomAt(1 / 1.2);
    } else if (e.key === '0' || e.key === 'Home') {
      e.preventDefault();
      recentre();
    } else if (e.key === '[' || e.key === ']') {
      e.preventDefault();
      s.rotate(e.key === '[' ? 0.15 : -0.15, 0);
    }
  };

  // ---- Labels over the canvas.
  const labels = useMemo<Lbl[]>(() => {
    const out: Lbl[] = [];
    for (const p of layout.places) {
      if (p.kind === 'stall') continue;
      const text = labelOf(p);
      if (!text) continue;
      out.push({
        id: p.id,
        text: text.length > 26 ? `${text.slice(0, 25)}…` : text,
        place: p,
        x: 0,
        y: 0,
        z: 0,
        rank: KEY_KINDS.includes(p.kind) ? 0 : p.kind === 'business' ? 2 : 1,
        tier: KEY_KINDS.includes(p.kind)
          ? 'lbl-main'
          : p.kind === 'business'
            ? 'lbl-biz'
            : 'lbl-detail',
        color: p.category ? CATEGORY_COLOR[p.category] : undefined,
        soon: !!p.soon,
      });
    }
    const stalls = layout.places.filter((p) => p.kind === 'stall');
    if (stalls.length && layout.marketName)
      out.push({
        id: 'market',
        text: layout.marketName,
        place: null,
        x: 0,
        y: 0,
        z: 0,
        rank: 0,
        tier: 'lbl-main',
      });
    return out;
  }, [layout, labelOf]);

  const here = useMemo(() => playersByPlace(players), [players]);
  const freshSet = useMemo(() => new Set(fresh), [fresh]);
  const flagSet = useMemo(() => new Set(flags), [flags]);

  // Place labels and the name tag after each frame, decluttered.
  useEffect(() => {
    const s = sceneRef.current;
    const host = labelsRef.current;
    if (!s || !host) return;
    const els = new Map<string, HTMLElement>();
    host
      .querySelectorAll<HTMLElement>('[data-label]')
      .forEach((el) => els.set(el.dataset.label!, el));
    const lms = [...host.querySelectorAll<HTMLElement>('[data-landmark]')];
    const lmPos = lms.map((el) => ({
      x: Number(el.dataset.x),
      y: Number(el.dataset.h),
      z: Number(el.dataset.z),
    }));
    const out = { x: 0, y: 0, z: 0 };
    // Each label sits on its building's roof (the market's over its stalls).
    const byId = new Map(s.places.map((b) => [b.place.id, b]));
    const stalls = s.places.filter((b) => b.place.kind === 'stall');
    const anchor = new Map<string, { x: number; y: number; z: number }>();
    for (const l of labels) {
      const b = l.place ? byId.get(l.place.id) : null;
      if (b) anchor.set(l.id, { x: b.x, y: b.h + 3, z: b.y });
      else if (!l.place && stalls.length)
        anchor.set(l.id, {
          x: stalls.reduce((a, q) => a + q.x, 0) / stalls.length,
          y: 8,
          z: stalls.reduce((a, q) => a + q.y, 0) / stalls.length,
        });
    }
    const order = [...labels].sort((a, b) => a.rank - b.rank);
    const shown = new Map<HTMLElement, string>();
    const place = () => {
      const d = s.rig.dist;
      const boxes: [number, number, number, number][] = [];
      const W = host.clientWidth;
      const H = host.clientHeight;
      for (const l of order) {
        const el = els.get(l.id);
        if (!el) continue;
        const focusOn = el.classList.contains('is-focus');
        const tierOk = l.rank === 0 || focusOn || (l.rank === 1 ? d < 2600 : d < 1100);
        let vis = false;
        if (tierOk) {
          const at = anchor.get(l.id);
          if (at) s.project(at.x, at.y, at.z, out);
          else out.z = 2;
          if (out.z < 1 && out.x > -60 && out.x < W + 60 && out.y > -20 && out.y < H + 20) {
            const w = el.offsetWidth || l.text.length * 7 + 16;
            const box: [number, number, number, number] = [
              out.x - w / 2,
              out.y - 22,
              out.x + w / 2,
              out.y,
            ];
            const hit = boxes.some(
              (b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1],
            );
            if (!hit || focusOn || l.rank === 0) {
              vis = true;
              boxes.push(box);
              const tr = `translate(${Math.round(out.x)}px,${Math.round(out.y)}px)`;
              if (shown.get(el) !== tr) {
                el.style.transform = tr;
                shown.set(el, tr);
              }
            }
          }
        }
        if (el.hidden === vis) el.hidden = !vis;
      }
      lms.forEach((el, i) => {
        const p = lmPos[i]!;
        s.project(p.x, p.y, p.z, out);
        const vis = d < 5000 && out.z < 1 && out.x > 0 && out.x < W && out.y > 0 && out.y < H;
        if (vis) el.style.transform = `translate(${Math.round(out.x)}px,${Math.round(out.y)}px)`;
        if (el.hidden === vis) el.hidden = !vis;
      });
      host.querySelectorAll<HTMLElement>('[data-property]').forEach((el) => {
        const h = s.homes.find((x) => x.prop.id === el.dataset.property);
        if (!h) {
          el.hidden = true;
          return;
        }
        s.project(h.x, h.h + 16, h.y, out);
        const vis = out.z < 1 && out.x > -40 && out.x < W + 40 && out.y > 0 && out.y < H + 20;
        if (vis) el.style.transform = `translate(${Math.round(out.x)}px,${Math.round(out.y)}px)`;
        if (el.hidden === vis) el.hidden = !vis;
      });
      const tag = tagRef.current;
      if (tag) {
        const a = s.actors.avatarPos();
        const grow = Math.max(1, Math.min(9, d / 140));
        s.project(a.x, a.h + 2.3 * grow, a.y, out);
        tag.style.transform = `translate(${Math.round(out.x)}px,${Math.round(out.y)}px)`;
        tag.hidden = out.z >= 1;
      }
    };
    const off = s.onFrame(place);
    return () => {
      off();
    };
  }, [labels, ready, properties]);

  // The suggested move pulses; flags (events coming up) show on the label.
  const landmarks = layout.geo?.sprites ?? [];

  return (
    <div
      ref={wrapRef}
      className={`city-map city-map-3d${reduced ? ' is-reduced' : ''}`}
      tabIndex={0}
      role="application"
      aria-roledescription={t('map')}
      aria-label={ariaLabel}
      data-map3d={ready ? 'ready' : 'loading'}
      data-driving={driving ? '1' : undefined}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="c3-canvas" aria-hidden="true" />
      <div ref={labelsRef} className="c3-labels" aria-hidden="true">
        {landmarks.map((lm) => (
          <span
            key={lm.name}
            className="c3-landmark"
            data-landmark={lm.name}
            data-x={lm.e2 !== undefined ? (lm.e + lm.e2) / 2 : lm.e}
            data-z={lm.s2 !== undefined ? (lm.s + lm.s2!) / 2 : lm.s}
            data-h={lm.e2 !== undefined ? 90 : 40}
            hidden
          >
            {lm.name}
          </span>
        ))}
        {labels.map((l) => {
          const n = l.place ? (here.get(l.place.id) ?? 0) : 0;
          return (
            <div
              key={l.id}
              data-label={l.id}
              {...(l.place ? { 'data-place': l.place.id } : {})}
              {...(l.place?.category ? { 'data-category': l.place.category } : {})}
              className={`c3-label ${l.tier}${l.soon ? ' is-soon' : ''}${focus === l.id ? ' is-focus' : ''}${marker === l.id ? ' is-marker' : ''}`}
              hidden
            >
              <span className="c3-pill">
                {l.color && <i className="c3-dot" style={{ background: l.color }} />}
                {l.text}
                {n > 0 && (
                  <b className="c3-here" data-here={l.id} data-count={n}>
                    {n > 9 ? '9+' : n}
                  </b>
                )}
                {freshSet.has(l.id) && (
                  <b className="c3-new" data-new={l.id}>
                    {t('New')}
                  </b>
                )}
                {flagSet.has(l.id) && <i className="c3-flag" aria-hidden="true" />}
              </span>
              {marker === l.id && <span className="c3-marker">!</span>}
            </div>
          );
        })}
        {properties.map((h) => (
          <div key={h.id} className="c3-label c3-home" data-property={h.id} hidden>
            <span className="c3-pill">
              <i className="c3-home-dot" aria-hidden="true" />
              {h.name || tierLabel(h.tier)}
              {h.neighbourhood && <span className="c3-home-where"> · {h.neighbourhood}</span>}
            </span>
          </div>
        ))}
      </div>
      <div
        ref={tagRef}
        className={`c3-you-tag city-avatar${walking ? (vehicle ? ' is-riding' : ' is-walking') : ''}`}
        hidden
      >
        <span>{name}</span>
      </div>
      {!ready && <div className="c3-loading">{t('Building the city…')}</div>}
      <a
        className="city-osm-credit"
        data-osm-credit=""
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        {OSM_CREDIT}
      </a>
    </div>
  );
}
