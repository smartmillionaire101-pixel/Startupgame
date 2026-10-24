/**
 * The business and first class cabins' floor plan (player feedback: "When
 * going to the bar/shower we can walk through the wall"). One plan says
 * where everything stands, and both the 3D cabin (./suite3d) and the walk
 * read it:
 *
 * - the fuselage (its radius and the floor's width), the aisles;
 * - the walls, as segments seen from above (suite walls with their door
 *   openings, pod shells, the forward bulkhead with the bar's doorway and
 *   the shower spa's door, the rooms behind it), and the furniture you
 *   can't walk through (seats, ottomans, consoles, the bar counter);
 * - the places people walk between (your seat, the step out of it, your
 *   door, the aisle, the doorway, the bar, the spa, the galley).
 *
 * A walk is the shortest route through the places whose straight legs keep
 * a body's width clear of every wall and piece of furniture (a visibility
 * graph): out of your seat, through your door, along the aisle and through
 * the doorway, never through a wall. `pathClear` checks any route against
 * the same walls (the tests, and the walk's own `data-suite-path-clear`).
 *
 * Coordinates: metres, x across the plane (−x the left, A side), z along it
 * (the nose at −z), the floor at y = 0. No three.js here.
 */

export type CabinKind = 'business' | 'first';

/** The fuselage: its radius and the height of its axis above the floor. */
export const FUSELAGE = { r: 2.95, cy: 1.2 } as const;

/** The inside of the curved wall at height y (its distance from the centre line). */
export const wallX = (y: number) =>
  Math.sqrt(Math.max(0, FUSELAGE.r * FUSELAGE.r - (y - FUSELAGE.cy) * (y - FUSELAGE.cy)));

/** Half the floor's width (where the wall meets the carpet). */
export const FLOOR_HALF = wallX(0.02);

export interface Pt {
  x: number;
  z: number;
}

/** A wall seen from above. */
export interface Wall {
  a: Pt;
  b: Pt;
}

/** Furniture seen from above (an axis-aligned box). */
export interface Block {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** A first class suite: one side of the aisle, from `zf` (forward) to `zb`. */
export interface SuitePlan {
  id: string;
  /** −1 the left (A) side, +1 the right. */
  side: -1 | 1;
  zf: number;
  zb: number;
  /** Yours. */
  mine: boolean;
}

/** A business pod (1-2-1): its centre, and the side its shell's tall wall is on. */
export interface PodPlan {
  id: string;
  x: number;
  z: number;
  /** −1: the tall side wall is at −x (a left window pod, or the left of the centre pair). */
  mirror: -1 | 1;
  mine: boolean;
}

export type PlaceId =
  | 'seat'
  | 'stand'
  | 'door'
  | 'aisle'
  | 'fwd'
  | 'doorway'
  | 'bar'
  | 'spaFront'
  | 'spaDoor'
  | 'spa'
  | 'galley'
  | 'serve';

export interface CabinPlan {
  kind: CabinKind;
  /** The cabin's aft and forward ends (the tube's length). */
  z0: number;
  z1: number;
  /** The aisles' centre lines and half-width. */
  aisles: number[];
  aisleHalf: number;
  /** The forward bulkhead (first: the bar and the spa behind it). */
  bulkhead: number;
  suites: SuitePlan[];
  pods: PodPlan[];
  walls: Wall[];
  blocks: Block[];
  places: Partial<Record<PlaceId, Pt>>;
  /** Places you only leave one way (out of your seat, then out of the suite by its door). */
  links: Partial<Record<PlaceId, PlaceId[]>>;
  /** First: the bar's doorway and the spa's door in the bulkhead (x from, x to). */
  doorway?: [number, number];
  spaDoor?: [number, number];
  /** First: the rooms behind the bulkhead (the bar left of `split`, the spa right). */
  roomBack?: number;
  split?: number;
}

/** How far a body keeps from walls (shoulders, half a stride). */
export const BODY = 0.17;

// ---------------------------------------------------------------------------
// First class: one suite each side of a centre aisle, the bar and spa forward.

/** First: the suites' walls (the aisle side, the outer side), their height, the door. */
export const SUITE_X = { inner: 0.7, outer: 2.6 } as const;
export const SUITE_H = 1.5;
/** The door opening in a suite's aisle wall, at its aft end. */
export const SUITE_DOOR = 0.78;
/** First: where you sit in a suite (from its aft wall), and the seat's footprint. */
export const SUITE_SEAT = { x: 1.75, back: 0.75, w: 0.78, d: 0.95 } as const;

function firstPlan(): CabinPlan {
  const bz = -6.6;
  const rows: [number, number][] = [
    [-4.1, -1.6],
    [-1.6, 0.9],
    [0.9, 3.4],
  ];
  const suites: SuitePlan[] = [];
  rows.forEach(([zf, zb], n) => {
    for (const side of [-1, 1] as const)
      suites.push({
        id: `${n + 1}${side < 0 ? 'A' : 'K'}`,
        side,
        zf,
        zb,
        mine: n === 1 && side < 0,
      });
  });
  const walls: Wall[] = [];
  const blocks: Block[] = [];
  const W = (ax: number, az: number, bx: number, bz2: number) =>
    walls.push({ a: { x: ax, z: az }, b: { x: bx, z: bz2 } });
  const B = (x: number, z: number, w: number, d: number) =>
    blocks.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  for (const s of suites) {
    const xi = s.side * SUITE_X.inner;
    const xo = s.side * SUITE_X.outer;
    W(xi, s.zf, xo, s.zf);
    W(xi, s.zb, xo, s.zb);
    // The aisle wall, open at the aft end for the door.
    W(xi, s.zf, xi, s.zb - SUITE_DOOR);
    const seatX = s.side * SUITE_SEAT.x;
    // Your own seat is where you start: only the others' are in the way.
    if (!s.mine) B(seatX, s.zb - SUITE_SEAT.back + 0.1, SUITE_SEAT.w, SUITE_SEAT.d);
    // The ottoman, the window console.
    B(seatX, s.zf + 0.6, 0.75, 0.55);
    B(s.side * 2.42, (s.zf + s.zb) / 2, 0.32, s.zb - s.zf - 0.3);
  }
  // The forward bulkhead: the bar's doorway in the middle, the spa's door to its right.
  const doorway: [number, number] = [-0.62, 0.62];
  const spaDoor: [number, number] = [0.9, 1.72];
  const half = FLOOR_HALF;
  W(-half, bz, doorway[0], bz);
  W(doorway[1], bz, spaDoor[0], bz);
  W(spaDoor[1], bz, half, bz);
  // Behind it: the bar (left) and the spa (right), and the nose bulkhead.
  const roomBack = bz - 3;
  const split = 0.78;
  W(split, bz, split, roomBack);
  W(-half, roomBack, half, roomBack);
  // The bar counter, the shower.
  B(-0.35, bz - 1.95, 2.0, 0.6);
  B(1.85, bz - 2.3, 1.0, 1.0);
  // The aft end of the cabin and the fuselage's sides.
  W(-half, 5.9, half, 5.9);
  W(-half, 5.9, -half, roomBack);
  W(half, 5.9, half, roomBack);
  const mine = suites.find((s) => s.mine)!;
  const zDoor = mine.zb - SUITE_DOOR / 2 - 0.03;
  return {
    kind: 'first',
    z0: 6,
    z1: roomBack - 0.2,
    aisles: [0],
    aisleHalf: SUITE_X.inner - 0.05,
    bulkhead: bz,
    suites,
    pods: [],
    walls,
    blocks,
    doorway,
    spaDoor,
    roomBack,
    split,
    links: { seat: ['stand'], stand: ['seat', 'door'] },
    places: {
      seat: { x: -SUITE_SEAT.x, z: mine.zb - SUITE_SEAT.back },
      stand: { x: -1.08, z: zDoor },
      door: { x: -SUITE_X.inner, z: zDoor },
      aisle: { x: 0, z: zDoor },
      fwd: { x: 0, z: bz + 0.95 },
      doorway: { x: 0, z: bz },
      bar: { x: -0.3, z: bz - 1.2 },
      spaFront: { x: 1.31, z: bz + 0.6 },
      spaDoor: { x: 1.31, z: bz },
      spa: { x: 1.45, z: bz - 1.0 },
      galley: { x: -1.5, z: bz + 1.0 },
      serve: { x: -0.3, z: zDoor },
    },
  };
}

// ---------------------------------------------------------------------------
// Business: lie-flat pods, 1-2-1, two aisles.

/** Business: the pods' rows (their centres along the plane) and columns. */
export const POD_ROWS = [3.2, 1.0, -1.2, -3.4, -5.6, -7.8];
export const POD_X = 2.12;
export const POD_W = 0.82;
export const POD_LEN = 1.95;

function businessPlan(): CabinPlan {
  const bz = -9.6;
  const pods: PodPlan[] = [];
  POD_ROWS.forEach((z, n) => {
    const row = n + 1;
    pods.push({ id: `${row}A`, x: -POD_X, z, mirror: -1, mine: n === 1 });
    pods.push({ id: `${row}D`, x: -0.5, z, mirror: 1, mine: false });
    pods.push({ id: `${row}G`, x: 0.5, z, mirror: -1, mine: false });
    pods.push({ id: `${row}K`, x: POD_X, z, mirror: 1, mine: false });
  });
  const walls: Wall[] = [];
  const blocks: Block[] = [];
  for (const p of pods) {
    const h = POD_W / 2;
    // The back wall, the front wall, the tall side wall; the low privacy
    // screen on the aisle side leaves the way in open.
    walls.push({ a: { x: p.x - h, z: p.z + 0.95 }, b: { x: p.x + h, z: p.z + 0.95 } });
    walls.push({ a: { x: p.x - h, z: p.z - 1.0 }, b: { x: p.x + h, z: p.z - 1.0 } });
    const sx = p.x + p.mirror * 0.42;
    walls.push({ a: { x: sx, z: p.z - 1.0 }, b: { x: sx, z: p.z + 0.95 } });
    const ax = p.x - p.mirror * 0.42;
    walls.push({ a: { x: ax, z: p.z - 0.7 }, b: { x: ax, z: p.z + 0.3 } });
    if (!p.mine) blocks.push({ x0: p.x - 0.3, x1: p.x + 0.3, z0: p.z - 0.1, z1: p.z + 0.8 });
  }
  const half = FLOOR_HALF;
  walls.push({ a: { x: -half, z: bz }, b: { x: -1.75, z: bz } });
  walls.push({ a: { x: -0.88, z: bz }, b: { x: 0.88, z: bz } });
  walls.push({ a: { x: 1.75, z: bz }, b: { x: half, z: bz } });
  const mine = pods.find((p) => p.mine)!;
  const aisle = -1.31;
  return {
    kind: 'business',
    z0: 6,
    z1: bz - 0.4,
    aisles: [aisle, -aisle],
    aisleHalf: 0.38,
    bulkhead: bz,
    suites: [],
    pods,
    walls,
    blocks,
    links: { seat: ['stand'], stand: ['seat', 'aisle'] },
    places: {
      seat: { x: mine.x + 0.08, z: mine.z + 0.25 },
      stand: { x: mine.x + 0.15, z: mine.z + 0.62 },
      aisle: { x: aisle, z: mine.z + 0.62 },
      galley: { x: aisle, z: bz + 0.5 },
      serve: { x: aisle, z: mine.z + 0.35 },
    },
  };
}

const PLANS = new Map<CabinKind, CabinPlan>();

/** The cabin's plan (built once). */
export function cabinPlan(kind: CabinKind): CabinPlan {
  let p = PLANS.get(kind);
  if (!p) {
    p = kind === 'first' ? firstPlan() : businessPlan();
    PLANS.set(kind, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Walking

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

/** The distance from p to the segment ab. */
function toSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const k = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - (a.x + k * dx), p.z - (a.z + k * dz));
}

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

/** Do segments ab and cd cross? */
function crosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** The closest two segments come (0 when they cross). */
export function segmentGap(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (crosses(a, b, c, d)) return 0;
  return Math.min(toSegment(a, c, d), toSegment(b, c, d), toSegment(c, a, b), toSegment(d, a, b));
}

const blockWalls = (k: Block): Wall[] => [
  { a: { x: k.x0, z: k.z0 }, b: { x: k.x1, z: k.z0 } },
  { a: { x: k.x1, z: k.z0 }, b: { x: k.x1, z: k.z1 } },
  { a: { x: k.x1, z: k.z1 }, b: { x: k.x0, z: k.z1 } },
  { a: { x: k.x0, z: k.z1 }, b: { x: k.x0, z: k.z0 } },
];

/** Every edge of the plan's walls and furniture. */
export function obstacles(plan: CabinPlan): Wall[] {
  return [...plan.walls, ...plan.blocks.flatMap(blockWalls)];
}

/** Can a body walk straight from a to b (keeping `clear` from every wall)? */
export function legClear(plan: CabinPlan, a: Pt, b: Pt, clear = BODY): boolean {
  for (const w of obstacles(plan)) if (segmentGap(a, b, w.a, w.b) < clear) return false;
  return true;
}

/** Does a route (a list of points) keep clear of every wall and piece of furniture? */
export function pathClear(plan: CabinPlan, pts: Pt[], clear = BODY): boolean {
  for (let i = 1; i < pts.length; i++)
    if (!legClear(plan, pts[i - 1]!, pts[i]!, clear)) return false;
  return true;
}

/** The crew's own places: a passenger's walk doesn't go through them. */
const CREW: PlaceId[] = ['galley', 'serve'];

/**
 * The places to walk through from one place to another (both included):
 * the shortest route whose legs all keep clear. Some places are left only
 * one way (`links`: out of your seat to the step beside it, which starts
 * inside furniture and is always allowed, then through your door). Null
 * when there's no way (a plan without that place).
 */
export function walkPath(plan: CabinPlan, from: PlaceId, to: PlaceId): PlaceId[] | null {
  const crew = CREW.includes(from) || CREW.includes(to);
  const ids = (Object.keys(plan.places) as PlaceId[]).filter((id) => crew || !CREW.includes(id));
  const at = (id: PlaceId) => plan.places[id]!;
  if (!plan.places[from] || !plan.places[to]) return null;
  if (from === to) return [from];
  const ok = (a: PlaceId, b: PlaceId) => {
    const la = plan.links[a];
    const lb = plan.links[b];
    if (la || lb) return !!la?.includes(b) || !!lb?.includes(a);
    // Through the bulkhead only by stepping onto its doorway or the spa's
    // door (both stand on its line), never past one at a slant.
    const z = plan.bulkhead;
    if ((at(a).z - z) * (at(b).z - z) < 0) return false;
    return legClear(plan, at(a), at(b));
  };
  // Dijkstra over the few places.
  const best = new Map<PlaceId, number>([[from, 0]]);
  const prev = new Map<PlaceId, PlaceId>();
  const open = new Set<PlaceId>([from]);
  while (open.size) {
    let cur: PlaceId | null = null;
    for (const id of open) if (cur === null || best.get(id)! < best.get(cur)!) cur = id;
    open.delete(cur!);
    if (cur === to) break;
    for (const nx of ids) {
      if (nx === cur || !ok(cur!, nx)) continue;
      const d = best.get(cur!)! + dist(at(cur!), at(nx));
      if (d < (best.get(nx) ?? Infinity)) {
        best.set(nx, d);
        prev.set(nx, cur!);
        open.add(nx);
      }
    }
  }
  if (!best.has(to)) return null;
  const out: PlaceId[] = [to];
  while (out[0] !== from) out.unshift(prev.get(out[0]!)!);
  return out;
}

/** Where your act takes you (your seat for everything but the bar and the spa). */
export function placeFor(act: string | null, kind: CabinKind): PlaceId {
  if (kind === 'first' && act === 'bar') return 'bar';
  if (kind === 'first' && act === 'spa') return 'spa';
  return 'seat';
}

// ---------------------------------------------------------------------------
// Outside the windows

export type OutsidePhase = 'climb' | 'cruise' | 'descent';

export interface Outside {
  phase: OutsidePhase;
  /** 0 on the ground … 1 at cruising height. */
  altitude: number;
  /** The nose up (+) or down (−), radians: the horizon tilts in the windows. */
  pitch: number;
}

/** The climb after take-off and the descent before landing take this long (seconds). */
export const CLIMB_S = 40;
export const DESCENT_S = 45;

/**
 * What the windows show at a moment of the flight: the take-off moment
 * climbs out of the city's haze to cruising height above the clouds; the
 * meal and the night are at cruise; arrival descends towards the ground
 * (the fields and roads, the city's lights at night). `s` is the seconds
 * since that moment began.
 */
export function outsideAt(stage: 'boarding' | 'meal' | 'night' | 'arrival', s: number): Outside {
  const k = (x: number) => Math.max(0, Math.min(1, x));
  if (stage === 'boarding') {
    const u = k(s / CLIMB_S);
    const alt = 0.08 + 0.92 * (1 - (1 - u) * (1 - u));
    return { phase: u >= 1 ? 'cruise' : 'climb', altitude: alt, pitch: 0.2 * (1 - u) };
  }
  if (stage === 'arrival') {
    const u = k(s / DESCENT_S);
    return { phase: 'descent', altitude: 1 - 0.88 * u, pitch: -0.05 * (1 - u) };
  }
  return { phase: 'cruise', altitude: 1, pitch: 0 };
}
