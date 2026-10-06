/**
 * Wave 7 §B: the ride in progress, as a tiny store anyone can read.
 *
 * CityMap.walkTo calls `beginRide()` when a trip across town starts and gets
 * back how long the trip takes on the map (the scene's length) plus a way to
 * ask whether the player skipped. The full-screen `RideScene` is mounted on
 * demand in its own React root (code-split), so the map and the City screen
 * don't need to know about it.
 *
 * Other parts read whether a ride is playing with `useRiding()` / `isRiding()`,
 * or listen for the window event `runway:riding` (`detail: boolean`).
 *
 * Settings: "Always skip rides" is localStorage `runway.skipRides` = '1';
 * reduce motion is `<html data-reduce-motion="1">` or prefers-reduced-motion.
 */
import { useSyncExternalStore } from 'react';
import type { AvatarLook } from '../art';
import type { CityLayout, Pt } from '../layout';
import type { RideMode } from '../travel';

export const SKIP_RIDES_KEY = 'runway.skipRides';
const COUNT_KEY = 'runway.rideCount';
export const RIDING_EVENT = 'runway:riding';

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable: lasts for this visit */
  }
};

/** "Always skip rides" (phone Settings and the ride scene both set it). */
export const skipRides = () => read(SKIP_RIDES_KEY) === '1';
export function setSkipRides(on: boolean) {
  write(SKIP_RIDES_KEY, on ? '1' : null);
  emit();
}

/** Reduce motion: the in-game setting (on <html>) or the system's. */
export function reduceMotion(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.reduceMotion === '1')
    return true;
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Rides seen so far (the "Always skip rides" toggle shows from the second). */
export const rideCount = () => Number(read(COUNT_KEY)) || 0;

// ---------------------------------------------------------------------------
// The quote from the ride chooser (fare and where to), used by the next ride.

export interface RideQuote {
  mode: RideMode;
  fare: number;
  currency: string;
  where: string;
}
let quote: RideQuote | null = null;
export function quoteRide(q: RideQuote) {
  quote = q;
}

// ---------------------------------------------------------------------------
// The ride itself.

export interface RideRequest {
  mode: RideMode;
  /** Trip length in tiles along the streets. */
  tiles: number;
  path: Pt[];
  layout: CityLayout;
  placeId: string | null;
  look: AvatarLook;
  /** The map's own duration for the trip (ms): used for the reduced-motion chase. */
  mapMs: number;
}

export interface Ride extends RideRequest {
  id: number;
  ms: number;
  startedAt: number;
  where: string;
  fare: number;
  currency: string;
  /** Bird's-eye chase on the map, no scene (reduced motion). */
  chase: boolean;
  /** Show the "Always skip rides" toggle. */
  offerSkip: boolean;
}

export interface RideHandle {
  /** How long the trip takes on the map (ms). */
  ms: number;
  /** The player skipped: jump to the arrival. */
  skipped: () => boolean;
  /** The trip is over (arrived or cancelled). */
  end: () => void;
}

/** Scene length: scaled by distance, 5–12 s (walking 5–8 s). */
export function sceneMs(mode: RideMode, tiles: number): number {
  const per = { walk: 70, cycle: 60, bus: 95, taxi: 80 }[mode];
  const max = mode === 'walk' ? 8000 : 12000;
  return Math.round(Math.min(max, Math.max(5000, 3800 + tiles * per)));
}

let current: Ride | null = null;
let skipped = false;
let seq = 0;
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function announce(on: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(RIDING_EVENT, { detail: on }));
  } catch {
    /* very old browsers: the hook still works */
  }
}

export const subscribeRide = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
export const currentRide = () => current;
export const isRiding = () => current !== null;
/** Whether a ride scene is playing (re-renders when one starts or ends). */
export const useRiding = () => useSyncExternalStore(subscribeRide, isRiding, () => false);
export const useRide = () => useSyncExternalStore(subscribeRide, currentRide, () => null);

/** Skip ›: jump straight to the arrival. */
export function skipRide() {
  if (current) skipped = true;
}

let host: Promise<unknown> | null = null;
function mountHost() {
  if (host || typeof document === 'undefined') return;
  host = import('./host').then((m) => m.mountRideHost()).catch(() => (host = null));
}

const KIND_NAMES: Record<string, string> = {
  airport: 'Airport',
  hub: 'The Hub',
  eventhall: 'Event Hall',
  newsstand: 'Newsstand',
  office: 'Office',
  home: 'Home',
};

/**
 * A trip across town starts. Returns null when there's no scene (the player
 * always skips rides): the map plays the trip at its own pace.
 */
export function beginRide(req: RideRequest): RideHandle | null {
  if (typeof window === 'undefined' || skipRides()) return null;
  const chase = reduceMotion();
  const q = quote && quote.mode === req.mode ? quote : null;
  quote = null;
  const place = req.placeId ? req.layout.places.find((p) => p.id === req.placeId) : undefined;
  const n = rideCount() + 1;
  write(COUNT_KEY, String(n));
  const ride: Ride = {
    ...req,
    id: ++seq,
    ms: chase ? Math.max(1500, req.mapMs) : sceneMs(req.mode, req.tiles),
    startedAt: performance.now(),
    where: q?.where || place?.name || (place ? (KIND_NAMES[place.kind] ?? '') : ''),
    fare: q?.fare ?? 0,
    currency: q?.currency ?? '',
    chase,
    offerSkip: n >= 2,
  };
  current = ride;
  skipped = false;
  mountHost();
  emit();
  announce(true);
  let over = false;
  return {
    ms: ride.ms,
    skipped: () => skipped && current === ride,
    end: () => {
      if (over) return;
      over = true;
      if (current === ride) {
        current = null;
        skipped = false;
        emit();
        announce(false);
      }
    },
  };
}
