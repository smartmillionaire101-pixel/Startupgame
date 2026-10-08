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
import { rideMs, rideVehicle, SHORT_HOP, type RideMode } from '../travel';
import { sunFor, SUN_TICK_MS, useSunValue } from '../sun';
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

function tierOf(): Tier {
  if (typeof window === 'undefined') return 'low';
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const cores = navigator.hardwareConcurrency || 4;
  return small || cores <= 4 ? 'low' : 'high';
}

/**
 * The scene of the City tab you left, kept drawing nothing: coming back to
 * the same city shows it at once instead of building it again. Let go after
 * a while away (its memory is the phone's).
 */
let parked: { scene: CityScene; reduced: boolean; timer: ReturnType<typeof setTimeout> } | null =
  null;
const PARK_MS = 10 * 60_000;

function park(scene: CityScene, reduced: boolean) {
  if (parked && parked.scene !== scene) dropParked();
  if (parked) clearTimeout(parked.timer);
  scene.paused = true;
  parked = { scene, reduced, timer: setTimeout(dropParked, PARK_MS) };
}

function dropParked() {
  if (!parked) return;
  clearTimeout(parked.timer);
  parked.scene.dispose();
  parked = null;
}

/** The parked scene, if it shows this city (brought up to this layout). */
function unpark(layout: CityScene['layout'], reduced: boolean): CityScene | null {
  const p = parked;
  if (!p) return null;
  if (p.reduced === reduced && p.scene.updatePlaces(layout)) {
    clearTimeout(p.timer);
    parked = null;
    return p.scene;
  }
  dropParked();
  return null;
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
    paused = false,
  } = props;
  const reduced = useReducedMotion();
  // Wave 12: the light phase, for the page (the scene itself is relit every minute below).
  const sunPhase = useSunValue(layout.marketId, (s) => `${s.phase}:${s.lightsOn ? 'on' : 'off'}`);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
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

  // ---- The scene: one per city. A new layout of the same city (a hire, a
  // siren, a business closing) only rebuilds the places in it; a city built
  // again (a new place, another city) gets a fresh canvas (a canvas whose
  // context was let go can't draw again) and keeps the camera where it was.
  // Leaving the City tab parks the scene: coming back shows it at once.
  const [gen, setGen] = useState(0);
  const layoutRef = useRef(layout);
  const keep = useRef<{ market: string; rig: CityScene['rig']; following: boolean } | null>(null);
  useLayoutEffect(() => {
    layoutRef.current = layout;
    const s = sceneRef.current;
    if (!s || s.layout === layout) return;
    if (s.updatePlaces(layout)) return;
    keep.current = { market: s.layout.marketId, rig: { ...s.rig }, following: s.following };
    setGen((g) => g + 1);
  }, [layout]);

  useLayoutEffect(() => {
    const host = canvasHostRef.current;
    const wrap = wrapRef.current;
    const layout = layoutRef.current;
    if (!host || !wrap) return;
    let scene: CityScene;
    let canvas: HTMLCanvasElement;
    const old = unpark(layout, reduced);
    if (old) {
      scene = old;
      canvas = scene.canvas;
    } else {
      canvas = document.createElement('canvas');
      canvas.className = 'c3-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      try {
        scene = new CityScene(
          canvas,
          layout,
          { tier: tierOf(), reduced, sun: sunFor(layout.marketId) },
          look,
          walkers,
        );
      } catch {
        markWebGLBroken();
        onBroken?.();
        return;
      }
    }
    host.appendChild(canvas);
    sceneRef.current = scene;
    (window as unknown as { __city3d?: CityScene }).__city3d = scene;
    const r = wrap.getBoundingClientRect();
    scene.resize(r.width, r.height);
    if (old) {
      // Back on the City tab: where you left it.
      scene.paused = false;
      scene.setSun(sunFor(layout.marketId));
      pos.current = avatarPosIn(layout.marketId) ?? pos.current;
      scene.actors.setAvatar(pos.current);
      scene.touch(400);
      cb.current.onArrive?.(pos.current, null);
    } else {
      const was = keep.current?.market === layout.marketId ? keep.current : null;
      keep.current = null;
      if (!was) pos.current = avatarPosIn(layout.marketId) ?? layout.start;
      scene.actors.setAvatar(pos.current);
      if (was) {
        Object.assign(scene.rig, was.rig);
        scene.flyTo(was.rig.x, was.rig.y, was.rig.dist);
        scene.following = was.following;
      } else {
        scene.rig.dist = r.width < 500 ? 520 : 640;
        scene.following = true;
      }
      if (!was) cb.current.onArrive?.(pos.current, null);
    }
    let broken = false;
    const lost = (e: Event) => {
      e.preventDefault();
      broken = true;
      markWebGLBroken();
      onBroken?.();
    };
    canvas.addEventListener('webglcontextlost', lost);
    const shown = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(shown);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.remove();
      if (broken) scene.dispose();
      else park(scene, reduced);
      sceneRef.current = null;
      setReady(false);
    };
    // The layout is read from its ref (a new layout of the same city is
    // handled above); the look and walkers are pushed in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen, reduced]);

  // Hidden under a place's scene or a flight: no drawing behind it.
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.paused = !!paused;
    if (!paused) s.touch(400);
  }, [paused, ready]);

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

  // Wave 12: the sky follows the city's real sun, a minute at a time (no re-render).
  useEffect(() => {
    const id = setInterval(() => sceneRef.current?.setSun(sunFor(layout.marketId)), SUN_TICK_MS);
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
    const homesEls = [...host.querySelectorAll<HTMLElement>('[data-property]')];
    // Pill widths, read once each (a label is a 1 px point; its pill is what
    // takes room). Reading layout every frame would force a reflow per label.
    const widths = new Map<HTMLElement, number>();
    const widthOf = (el: HTMLElement, l: Lbl) => {
      const w = widths.get(el);
      if (w) return w;
      const pill = el.firstElementChild as HTMLElement | null;
      const m = !el.hidden && pill ? pill.offsetWidth : 0;
      if (m > 0) widths.set(el, m + 4);
      return m > 0 ? m + 4 : l.text.length * 7 + 22;
    };
    const PILL_H = 24;
    type Box = [number, number, number, number];
    const hits = (boxes: Box[], b: Box) =>
      boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    const place = () => {
      const d = s.rig.dist;
      const boxes: Box[] = [];
      const { w: W, h: H } = s.viewSize;
      // Your name tag first: labels make room for it.
      const tag = tagRef.current;
      if (tag) {
        const a = s.actors.avatarPos();
        const grow = Math.max(1, Math.min(9, d / 140));
        s.project(a.x, a.h + 2.3 * grow, a.y, out);
        tag.style.transform = `translate(${Math.round(out.x)}px,${Math.round(out.y)}px)`;
        tag.hidden = out.z >= 1;
        const tw = name.length * 7 + 20;
        if (!tag.hidden) boxes.push([out.x - tw / 2, out.y - 22, out.x + tw / 2, out.y]);
      }
      for (const l of order) {
        const el = els.get(l.id);
        if (!el) continue;
        const focusOn = el.classList.contains('is-focus') || el.classList.contains('is-marker');
        const key = l.rank === 0 || focusOn;
        const tierOk = key || (l.rank === 1 ? d < 2600 : d < 1100);
        let vis = false;
        let lift = 0;
        if (tierOk) {
          const at = anchor.get(l.id);
          if (at) s.project(at.x, at.y, at.z, out);
          else out.z = 2;
          if (out.z < 1 && out.x > -60 && out.x < W + 60 && out.y > -20 && out.y < H + 20) {
            const w = widthOf(el, l);
            // Crowded: a key label rises on a leader line until it is clear;
            // the others step up once, else wait their turn (zoom in).
            const tries = key ? 6 : 2;
            let box: Box | null = null;
            for (let k = 0; k < tries; k++) {
              const y = out.y - k * (PILL_H + 2);
              const b: Box = [out.x - w / 2, y - PILL_H - 6, out.x + w / 2, y - 4];
              if (!hits(boxes, b)) {
                box = b;
                lift = k * (PILL_H + 2);
                break;
              }
            }
            if (!box && key) box = [out.x - w / 2, out.y - PILL_H - 6, out.x + w / 2, out.y - 4];
            if (box) {
              vis = true;
              boxes.push(box);
              const tr = `translate(${Math.round(out.x)}px,${Math.round(out.y)}px)|${lift}`;
              if (shown.get(el) !== tr) {
                el.style.transform = `translate(${Math.round(out.x)}px,${Math.round(out.y)}px)`;
                el.style.setProperty('--lift', `${lift}px`);
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
      for (const el of homesEls) {
        const h = s.homes.find((x) => x.prop.id === el.dataset.property);
        if (!h) {
          el.hidden = true;
          continue;
        }
        s.project(h.x, h.h + 16, h.y, out);
        const vis = out.z < 1 && out.x > -40 && out.x < W + 40 && out.y > 0 && out.y < H + 20;
        if (vis) el.style.transform = `translate(${Math.round(out.x)}px,${Math.round(out.y)}px)`;
        if (el.hidden === vis) el.hidden = !vis;
      }
    };
    const off = s.onFrame(place);
    return () => {
      off();
    };
  }, [labels, ready, properties, name]);

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
      data-sun-phase={sunPhase.split(':')[0]}
      data-lights={sunPhase.split(':')[1]}
      data-map3d={ready ? 'ready' : 'loading'}
      data-driving={driving ? '1' : undefined}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={canvasHostRef} className="c3-canvas-host" aria-hidden="true" />
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
