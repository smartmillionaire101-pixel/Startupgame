/**
 * "Take me there" from outside the City tab (e.g. Me → Contacts → a fund's
 * office): remembers the destination, tells the app to open the City, and
 * the city walks you there when it mounts.
 */
let pending: string | null = null;
const listeners = new Set<() => void>();

/** Ask the city to walk to a place (and go in). */
export function visitPlace(placeId: string) {
  pending = placeId;
  for (const l of listeners) l();
}

/** The destination waiting for the city, if any (cleared once taken). */
export function takeVisit(): string | null {
  const p = pending;
  pending = null;
  return p;
}

export function onVisit(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
