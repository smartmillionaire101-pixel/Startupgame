/**
 * "Take me there" from outside the City tab (e.g. Me → Contacts → a fund's
 * office): remembers the destination, tells the app to open the City, and
 * the city walks you there when it mounts.
 *
 * Wave 7: the phone's Rides app books a way to get there too (`mode`); the
 * City reads it with takeVisitMode() and rides instead of walking.
 */
import type { RideMode } from './travel';

let pending: string | null = null;
let pendingMode: RideMode | null = null;
const listeners = new Set<() => void>();

/** Ask the city to walk (or ride, with `mode`) to a place, and go in. */
export function visitPlace(placeId: string, mode?: RideMode) {
  pending = placeId;
  pendingMode = mode ?? null;
  for (const l of listeners) l();
}

/** The destination waiting for the city, if any (cleared once taken). */
export function takeVisit(): string | null {
  const p = pending;
  pending = null;
  return p;
}

/** How the player booked the pending trip (Rides app), if they did (cleared once taken). */
export function takeVisitMode(): RideMode | null {
  const m = pendingMode;
  pendingMode = null;
  return m;
}

export function onVisit(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
