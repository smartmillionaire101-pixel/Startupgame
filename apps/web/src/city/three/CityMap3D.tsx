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
import { BadgeCard, useMapNames } from '../MapBadges';
import { ALWAYS_NAMED, placeBadge, type Badge } from '../mapIcons';
import { OSM_CREDIT } from '../geo';
import { GEO_TILE_M, geoTile } from '../geoLayout';
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
import { localHour, rideMinutes, rideMs, rideVehicle, SHORT_HOP, type RideMode } from '../travel';
import type { VehicleSpec } from '../flavour';
import { personScale } from './actors';
import { Drive } from './drive';
import { DriveHud } from './DriveHud';
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
import { SKY_VIEWS } from '@runway/engine';
import { openSky } from '../../experiences/sky-bus';

const NONE: never[] = [];
const KEY_KINDS: Place['kind'][] = ['office', 'hub', 'airport', 'eventhall', 'golf', 'mall'];

interface Lbl {
  id: string;
  text: string;
  /** The full name (the badge's accessible name). */
  name: string;
  badge: Badge;
  place: Place | null;
  /** World anchor (metres; y up). */
  x: number;
  y: number;
  z: number;
  rank: number;
  tier: string;
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
  // localHour already counts the minutes.
  return localHour(marketId);
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
  // Driving your own car: its controls (the HUD's), while it's on the road.
  const [driveCtl, setDriveCtlState] = useState<Drive | null>(null);
  const driveRef = useRef<Drive | null>(null);
  const setDriveCtl = useCallback((d: Drive | null) => {
    driveRef.current = d;
    setDriveCtlState(d);
  }, []);
  const [focus, setFocus] = useState<string | null>(null);
  // Where you're going (a trip asked for or under way): named on the map.
  const [heading, setHeading] = useState<string | null>(null);
  // A tapped badge: its name and a card (Go); the others dim.
  const [picked, setPicked] = useState<string | null>(null);
  const showNames = useMapNames();
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
  // Under a place's scene from the start (a new session opens at home, or in
  // your hotel): the city isn't built behind it, where it would hold up the
  // home's first frames for seconds on a phone. It's built once the cover
  // goes, after a frame showing that it's on its way (a parked scene is
  // ready at once).
  const [awake, setAwake] = useState(() => !paused || parked !== null);
  useEffect(() => {
    if (awake || paused) return;
    let t = 0;
    const raf = requestAnimationFrame(() => {
      t = window.setTimeout(() => setAwake(true), 0);
    });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [awake, paused]);
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
    if (!host || !wrap || !awake) return;
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
          { tier: tierOf(), reduced, hour: hourOf(layout.marketId) },
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
      scene.setHour(hourOf(layout.marketId));
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
  }, [gen, reduced, awake]);

  // Hidden under a place's scene or a flight: no drawing behind it.
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.paused = !!paused;
    if (!paused) s.touch(400);
  }, [paused, ready]);

  // Going home (or to your hotel room) is a tap away: its code, and the 3D
  // home's stage (a WebGL context takes a moment to make), are got ready in
  // a quiet moment once the city is up.
  useEffect(() => {
    if (!ready || paused) return;
    let idle = 0;
    const go = () => {
      void import('../Interiors').catch(() => {});
      void import('../../interiors3d/Home3D').then(
        (m) => m.prewarmHome3D(),
        () => {},
      );
    };
    const t = window.setTimeout(() => {
      if (typeof requestIdleCallback === 'function')
        idle = requestIdleCallback(go, { timeout: 4000 });
      else go();
    }, 3000);
    return () => {
      clearTimeout(t);
      if (idle) cancelIdleCallback(idle);
    };
  }, [ready, paused]);

  useEffect(() => {
    sceneRef.current?.actors.setLook(look);
    sceneRef.current?.invalidate();
  }, [look, ready]);
  useEffect(() => {
    sceneRef.current?.actors.setWalkers(walkers);
  }, [walkers, ready]);
  // How many vehicles are on the streets (`data-traffic`, for tests): set on
  // the element directly, so counting never re-renders the map.
  useEffect(() => {
    if (!ready) return;
    const put = () => {
      const n = sceneRef.current?.actors.trafficCount();
      if (n !== undefined) wrapRef.current?.setAttribute('data-traffic', String(n));
    };
    put();
    const id = setInterval(put, 2000);
    return () => clearInterval(id);
  }, [ready]);
  // Wave 10: the homes you own, at their neighbourhoods.
  useEffect(() => {
    sceneRef.current?.setProperties(properties);
  }, [properties, ready]);

  // The sky follows the city's clock; the map says how dark it is (`data-night`, for tests).
  useEffect(() => {
    const tick = () => {
      const s = sceneRef.current;
      if (!s) return;
      s.setHour(hourOf(layout.marketId));
      s.refreshLamps();
      wrapRef.current?.setAttribute('data-night', String(Math.round(s.night * 100) / 100));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [layout.marketId, ready]);

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
      opts: { mode?: RideMode; ask?: boolean; instant?: boolean } = {},
    ) => {
      stopWalk();
      pending.current = null;
      setFocus(placeId);
      setHeading(placeId);
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
      // Skipping the trip: no ride scene, you're simply there.
      const scene =
        (len > SHORT_HOP || driving) && !opts.instant
          ? beginRide({
              mode,
              tiles: len,
              path,
              layout,
              placeId,
              look,
              mapMs: rideMs(mode, len),
              hud: driving && !reduced && !!sceneRef.current && !!layout.geo,
            })
          : null;
      const done = () => {
        scene?.end();
        if (driving) {
          driveRef.current?.end();
          setDriveCtl(null);
          sceneRef.current?.actors.setDriving(false);
          sceneRef.current?.endChase();
          setDriving(false);
        }
        pos.current = target;
        placeAvatarAt(layout.marketId, target);
        placeAvatar(target);
        stopWalk();
        setVehicle(null);
        setHeading(null);
        cb.current.onArrive?.(target, placeId);
        then?.();
      };
      if (opts.instant || len < 0.05 || (reduced && !scene)) {
        done();
        if (opts.instant && sceneRef.current) sceneRef.current.following = true;
        return;
      }
      setVehicle(spec);
      setWalking(true);
      const s3 = sceneRef.current;
      s3?.actors.setWalking(true);
      if (s3) s3.following = true;
      // The path runs along the road centre lines: on foot you take the
      // pavement, in a vehicle your lane.
      const street = s3 ? s3.actors.streetPath(path, mode === 'walk' ? 'walk' : 'lane') : path;
      const ms = scene?.ms ?? rideMs(mode, len);
      // Driving: metres to go, and the pace that takes about the trip's time.
      const metres = pathLength(street) * GEO_TILE_M;
      const cruise = (metres / Math.max(0.5, ms / 1000)) * 1.15;
      // Your own car, with its trip on screen: you drive it (GO and BRAKE,
      // a way at each junction). Skipping rides or reduced motion: it drives
      // itself, as a taxi does.
      const drive =
        driving && s3 && scene && !reduced && layout.geo
          ? new Drive(s3.actors, layout.geo.graph, path, target, ms)
          : null;
      if (driving && s3) {
        // Keep to your lane, the camera behind you.
        if (!drive) s3.actors.setDriving(true, path, cruise);
        if (!reduced) s3.startChase();
        setDriving(true);
        setDriveCtl(drive);
        // For tests, as __city3d is.
        (window as unknown as { __drive?: Drive | null }).__drive = drive;
      }
      const t0 = performance.now();
      let last = t0;
      let gone = 0;
      let v = 0;
      let cancelled = false;
      const step = (now: number) => {
        if (cancelled) return;
        let f: number;
        if (drive && !scene?.skipped()) {
          const r = drive.step((now - last) / 1000);
          last = now;
          pos.current = r.p;
          placeAvatar(r.p, r.dx, r.dy);
          if (!r.done) walk.current!.raf = requestAnimationFrame(step);
          else done();
          return;
        }
        if (driving && !scene?.skipped() && now - t0 < ms * 3) {
          // Your own car: up to speed, easing into the stop at the end, and
          // never into the car in front (it slows and waits behind it). A
          // trip held up twice as long as planned goes on regardless (and
          // at three times, you're simply there). Short steps, so a slow
          // frame (a software GPU) still keeps to the clock.
          const lead = reduced || now - t0 > ms * 2 ? null : s3?.actors.leadAhead();
          let room = lead ? Math.max(0, lead.gap - 2.5) : Infinity;
          for (let left = Math.min(1, (now - last) / 1000); left > 1e-4; left -= 0.05) {
            const dt = Math.min(0.05, left);
            let want = Math.min(cruise, Math.sqrt(2 * (cruise / 1.2) * (metres - gone)) + 1);
            if (lead) want = Math.min(want, Math.max(0, lead.v + room * 2));
            v += Math.max(-cruise * 2.5 * dt, Math.min(cruise * 0.9 * dt, want - v));
            if (v < 0) v = 0;
            const move = Math.min(v * dt, room, metres - gone);
            gone += move;
            // The car in front moves on meanwhile.
            room += (lead?.v ?? 0) * dt - move;
          }
          f = metres > 0 ? gone / metres : 1;
          if (metres - gone < 0.05) f = 1;
        } else {
          const k = scene?.skipped() ? 1 : Math.min(1, (now - t0) / ms);
          f = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        }
        last = now;
        const { p, dx, dy } = pointAlong(street, f);
        pos.current = p;
        placeAvatar(p, dx, dy);
        if (f < 1) walk.current!.raf = requestAnimationFrame(step);
        else done();
      };
      walk.current = {
        raf: requestAnimationFrame(step),
        cancel: () => {
          cancelled = true;
          scene?.end();
          if (driving) {
            driveRef.current?.end();
            setDriveCtl(null);
            sceneRef.current?.actors.setDriving(false);
            sceneRef.current?.endChase();
            setDriving(false);
          }
          if (walk.current) cancelAnimationFrame(walk.current.raf);
          placeAvatarAt(layout.marketId, pos.current);
        },
      };
    },
    [layout, reduced, look, placeAvatar, stopWalk, setDriveCtl],
  );

  const goTo = useCallback(
    (id: string, mode?: RideMode, opts: { ask?: boolean; instant?: boolean } = {}) => {
      const p = layout.places.find((x) => x.id === id);
      if (!p) return;
      walkTo(p.door, () => cb.current.onEnter(p), p.id, { mode, ...opts });
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
      goTo: (id, mode, opts) => goTo(id, mode, opts),
      walkToPlace: (id) => {
        const p = layout.places.find((x) => x.id === id);
        if (p) walkTo(p.door, undefined, p.id);
      },
      ride: (mode, instant = false) => {
        const trip = pending.current;
        if (trip) walkTo(trip.target, trip.then, trip.placeId, { mode, instant });
      },
      cancelTrip: () => {
        pending.current = null;
        setHeading(null);
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
    // A tap: a sky view's landmark, a label (or badge), a building, or the street.
    const sky = (e.target as Element).closest?.('[data-sky]')?.getAttribute('data-sky');
    if (sky) {
      openSky(sky);
      return;
    }
    // A badge: its name and card (tap it again, or anywhere else, to close).
    const bid = (e.target as Element).closest?.('[data-badge]')?.getAttribute('data-badge');
    if (bid) {
      setPicked((was) => (was === bid ? null : bid));
      return;
    }
    if (picked) {
      setPicked(null);
      return;
    }
    const s = sceneRef.current;
    if (!s) return;
    // Driving: a stray tap on the road isn't a new trip (it would end the
    // drive); Skip on the route card, or a badge's Go, goes elsewhere.
    if (driveRef.current) return;
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
      goTo(hit.id, undefined, { ask: true });
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
    if (e.key === 'Escape' && picked) {
      e.preventDefault();
      setPicked(null);
      return;
    }
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
      const raw = labelOf(p);
      if (!raw) continue;
      out.push({
        id: p.id,
        text: raw.length > 26 ? `${raw.slice(0, 25)}…` : raw,
        name: raw,
        badge: placeBadge(p),
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
        soon: !!p.soon,
      });
    }
    const stalls = layout.places.filter((p) => p.kind === 'stall');
    if (stalls.length && layout.marketName)
      out.push({
        id: 'market',
        text: layout.marketName,
        name: layout.marketName,
        badge: placeBadge(null),
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
    // Badge and pill sizes, read once each (a label is a 1 px point; its
    // badge is what takes room). Reading layout every frame would force a
    // reflow per label. A badge opening to its name (or "Show names") runs
    // this again, so the sizes are measured afresh.
    const sizes = new Map<HTMLElement, [number, number]>();
    const sizeOf = (el: HTMLElement, l: Lbl): [number, number] => {
      const got = sizes.get(el);
      if (got) return got;
      const pill = el.firstElementChild as HTMLElement | null;
      const w = !el.hidden && pill ? pill.offsetWidth : 0;
      if (w > 0) {
        const m: [number, number] = [w + 4, pill!.offsetHeight];
        sizes.set(el, m);
        return m;
      }
      return el.classList.contains('is-badge') ? [34, 30] : [l.text.length * 7 + 40, 24];
    };
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
        const grow = personScale(d);
        s.project(a.x, a.h + 2.3 * grow, a.y, out);
        tag.style.transform = `translate(${Math.round(out.x)}px,${Math.round(out.y)}px)`;
        tag.hidden = out.z >= 1;
        const tw = name.length * 7 + 20;
        if (!tag.hidden) boxes.push([out.x - tw / 2, out.y - 22, out.x + tw / 2, out.y]);
      }
      for (const l of order) {
        const el = els.get(l.id);
        if (!el) continue;
        const focusOn =
          el.classList.contains('is-focus') ||
          el.classList.contains('is-marker') ||
          el.classList.contains('is-picked') ||
          el.classList.contains('is-heading');
        const key = l.rank === 0 || focusOn;
        const tierOk = key || (l.rank === 1 ? d < 2600 : d < 1100);
        let vis = false;
        let lift = 0;
        if (tierOk) {
          const at = anchor.get(l.id);
          if (at) s.project(at.x, at.y, at.z, out);
          else out.z = 2;
          if (out.z < 1 && out.x > -60 && out.x < W + 60 && out.y > -20 && out.y < H + 20) {
            const [w, PILL_H] = sizeOf(el, l);
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
    // picked / showNames / heading: badges change size (measured again).
  }, [labels, ready, properties, name, picked, showNames, heading]);

  // The suggested move pulses; flags (events coming up) show on the label.
  const landmarks = layout.geo?.sprites ?? [];
  // A landmark that is a sky view (the Salesforce Tower, the Eye…): tap to go up.
  const skyByLandmark = new Map(
    SKY_VIEWS.flatMap((v) => [
      [v.name, v.id] as const,
      ...(v.landmark ? [[v.landmark, v.id] as const] : []),
    ]),
  );

  const pickedLabel = picked ? (labels.find((l) => l.id === picked) ?? null) : null;
  // Go, from a badge's card: what tapping a label did before (the Market's
  // name goes to one of its stalls).
  const goPicked = (p: Place | null) => {
    setPicked(null);
    const to =
      p ??
      layout.places.find((x) => x.kind === 'stall' && !x.dim) ??
      layout.places.find((x) => x.kind === 'stall');
    if (to) goTo(to.id, undefined, { ask: true });
  };

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
      <div ref={canvasHostRef} className="c3-canvas-host" aria-hidden="true" />
      {!awake && !paused && (
        <p className="c3-waking" role="status">
          {t('Building the city…')}
        </p>
      )}
      <div ref={labelsRef} className={`c3-labels${picked ? ' has-pick' : ''}`}>
        {landmarks.map((lm) => (
          <span
            key={lm.name}
            aria-hidden="true"
            className="c3-landmark"
            data-landmark={lm.name}
            {...(skyByLandmark.get(lm.name) ? { 'data-sky': skyByLandmark.get(lm.name) } : {})}
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
          const isPicked = picked === l.id;
          const isHeading = heading === l.id;
          const named = showNames || isPicked || isHeading || ALWAYS_NAMED.includes(l.id);
          return (
            <div
              key={l.id}
              data-label={l.id}
              data-badge={l.id}
              {...(l.place?.category ? { 'data-category': l.place.category } : {})}
              className={`c3-label ${l.tier} ${named ? 'is-named' : 'is-badge'}${l.badge.money ? ' is-money' : ''}${l.soon ? ' is-soon' : ''}${focus === l.id ? ' is-focus' : ''}${marker === l.id ? ' is-marker' : ''}${isPicked ? ' is-picked' : ''}${isHeading ? ' is-heading' : ''}`}
              style={{ '--ring': l.badge.ring } as React.CSSProperties}
              hidden
            >
              <button
                type="button"
                className="c3-pill"
                aria-label={l.name}
                aria-expanded={isPicked}
                // Taps are read by the map (a drag from a badge still pans);
                // the keyboard's Enter and Space come here.
                onClick={(e) => {
                  if (e.detail === 0) setPicked((was) => (was === l.id ? null : l.id));
                }}
              >
                {isHeading && (
                  <span className="c3-heading" aria-hidden="true">
                    {t('Heading here')}
                  </span>
                )}
                <span className="c3-ico" aria-hidden="true">
                  {l.badge.icon}
                </span>
                {named && (
                  <span className="c3-name" aria-hidden="true">
                    {l.text}
                  </span>
                )}
                {n > 0 && (
                  <b className="c3-here" data-here={l.id} data-count={n} aria-hidden="true">
                    {n > 9 ? '9+' : n}
                  </b>
                )}
                {freshSet.has(l.id) && (
                  <b className="c3-new" data-new={l.id} aria-hidden="true">
                    {t('New')}
                  </b>
                )}
                {flagSet.has(l.id) && <i className="c3-flag" aria-hidden="true" />}
              </button>
              {marker === l.id && (
                <span className="c3-marker" aria-hidden="true">
                  !
                </span>
              )}
            </div>
          );
        })}
        {properties.map((h) => (
          <div
            key={h.id}
            className="c3-label c3-home is-named"
            data-property={h.id}
            aria-hidden="true"
            hidden
          >
            <span className="c3-pill">
              <i className="c3-home-dot" aria-hidden="true" />
              {h.name || tierLabel(h.tier)}
              {h.neighbourhood && <span className="c3-home-where"> · {h.neighbourhood}</span>}
            </span>
          </div>
        ))}
      </div>
      {driveCtl && (
        <DriveHud
          drive={driveCtl}
          marketId={layout.marketId}
          minutes={(m) => rideMinutes('drive', travelTiles(layout, m / GEO_TILE_M))}
          yaw={() => sceneRef.current?.rig.yaw ?? 0}
        />
      )}
      <div
        ref={tagRef}
        className={`c3-you-tag city-avatar${walking ? (vehicle ? ' is-riding' : ' is-walking') : ''}`}
        hidden
      >
        <span>{name}</span>
      </div>
      {pickedLabel && (
        <BadgeCard
          place={pickedLabel.place}
          name={pickedLabel.name}
          onGo={() => goPicked(pickedLabel.place)}
          onClose={() => setPicked(null)}
        />
      )}
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
