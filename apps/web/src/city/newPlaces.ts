/**
 * Round 7 (#26; player feedback: "New" on almost every pin): a place is new
 * to you only when it opened after you first saw this city (a business that
 * opened since; what stood there on your first day isn't news), you haven't
 * been in yet, and you first saw it
 * marked less than a few game days ago. At most the few nearest show, as a
 * small dot. Places you've been in are kept on this device (per player).
 *
 * Pure apart from the storage helpers at the end.
 */
export interface NewCandidate {
  /** The place id on the map ('biz:…'). */
  id: string;
  openedMonth: number;
  x: number;
  y: number;
}

export interface NewRules {
  /** The city's month when you first saw it (on this device). */
  joinMonth: number;
  visited: ReadonlySet<string>;
  /** When each place was first shown to you as new (ms). */
  seen: Readonly<Record<string, number>>;
  now: number;
  /** How long a game month is (ms). */
  monthMs: number;
  /** Where you are on the map (the nearest show first). */
  at?: { x: number; y: number } | null;
}

/** Most dots on the map at once. */
export const NEW_MAX = 3;
/** A place stops being new this many game days after you first saw it marked. */
export const NEW_DAYS = 3;

export function newPlaces(cands: readonly NewCandidate[], r: NewRules): string[] {
  const life = (NEW_DAYS / 30) * r.monthMs;
  const at = r.at;
  return cands
    .filter(
      (c) =>
        c.openedMonth > r.joinMonth &&
        !r.visited.has(c.id) &&
        (r.seen[c.id] === undefined || r.now - r.seen[c.id]! < life),
    )
    .map((c) => ({ c, d: at ? Math.hypot(c.x - at.x, c.y - at.y) : 0 }))
    .sort((a, b) => a.d - b.d || (a.c.id < b.c.id ? -1 : 1))
    .slice(0, NEW_MAX)
    .map((x) => x.c.id);
}

// ---------------------------------------------------------------- this device

const visitedKey = (me: string) => `runway.visited.${me}`;
const seenKey = (me: string) => `runway.newSeen.${me}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: it lasts for this visit */
  }
}

/** The places you've been in (this device). */
export const visitedPlaces = (me: string): Set<string> =>
  new Set(read<string[]>(visitedKey(me), []));

/** You went in: it isn't new any more. */
export function markVisited(me: string, placeId: string) {
  const v = visitedPlaces(me);
  if (v.has(placeId)) return;
  v.add(placeId);
  write(visitedKey(me), [...v].slice(-400));
}

/** When each place was first shown as new; records the ones shown now. */
export function seenNew(me: string, shown: readonly string[], now: number): Record<string, number> {
  const s = read<Record<string, number>>(seenKey(me), {});
  let changed = false;
  for (const id of shown)
    if (s[id] === undefined) {
      s[id] = now;
      changed = true;
    }
  if (changed) write(seenKey(me), s);
  return s;
}

/** The city's month when you first saw its map here (recorded now if never). */
export function firstSeenMonth(me: string, market: string, month: number): number {
  const key = `runway.cityFirst.${me}.${market}`;
  const had = read<number | null>(key, null);
  if (typeof had === 'number') return had;
  write(key, month);
  return month;
}
