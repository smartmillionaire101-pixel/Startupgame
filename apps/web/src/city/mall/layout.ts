/**
 * The walkable mall's plan (no three.js here: the 3D view, its HUD and the
 * tests share it). Metres; the hall runs from the entrance (z ≈ +6) down to
 * the food court (z ≈ −44); x is across it (shops on both sides past
 * |x| = HALF). A shop's own frame: u is depth in from its glass, v along
 * the hall from its middle.
 *
 * Walking: a grid over the floor (walls, glass, columns, planters,
 * escalators, the food court's tables and each shop's racks are solid),
 * A* through it and the path pulled straight where nothing is in the way.
 */
import type { MallShopId } from '@runway/engine';

export const HALF = 8;
export const DEPTH = 7;
export const SHOP_W = 9;
export const LEVEL = 4.6;
/** The entrance's glass wall. */
export const FRONT_Z = 7;
/** Where the hall widens into the food court. */
const COURT_Z = -32.8;
/** The food court's counters (their fronts). */
export const COUNTER_Z = -44;
/** How far a person keeps from walls and things (their half-width). */
const R = 0.32;

/** The shops with a room to walk into (the first five); the food court is the hall's end. */
export type RoomShop = 'fashion' | 'phones' | 'home' | 'supermarket' | 'cinema';
/** The bigger mall's shops: storefronts you walk up to (their stock is on a list). */
export type UnitShop = Exclude<MallShopId, RoomShop | 'foodcourt'>;
export type Where = MallShopId | 'concourse';

/** Each shop with a room: its side of the hall (−1 left, 1 right) and its middle (z). */
export const SPOT: Record<RoomShop, { side: -1 | 1; z: number }> = {
  fashion: { side: -1, z: -6 },
  phones: { side: -1, z: -17 },
  home: { side: -1, z: -28 },
  supermarket: { side: 1, z: -6 },
  cinema: { side: 1, z: -17 },
};
export const ROOM_SHOPS = Object.keys(SPOT) as RoomShop[];
export const isRoom = (w: Where): w is RoomShop => w in SPOT;

/**
 * The bigger mall's storefronts: a glass front with its sign and a shallow
 * lit window behind it, where the hall had bare wall (by the entrance, the
 * empty unit opposite home and along the food court's walls). `x, z` is the
 * middle of the glass, `n` the way it faces (into the hall), `w` its width,
 * `reach` how far out in front of it counts as being at the shop.
 */
export interface Unit {
  x: number;
  z: number;
  nx: number;
  nz: number;
  w: number;
  reach: number;
}
/** How deep a storefront's window is, behind its glass. */
export const UNIT_DEPTH = 2.4;
const COURT_GLASS = HALF + DEPTH - UNIT_DEPTH;
export const UNITS: Record<UnitShop, Unit> = {
  outlet: { x: -HALF, z: 2.6, nx: 1, nz: 0, w: 5.4, reach: 2 },
  pharmacy: { x: HALF, z: 2.6, nx: -1, nz: 0, w: 5.4, reach: 2 },
  jewellery: { x: HALF, z: -25.7, nx: -1, nz: 0, w: 4.3, reach: 2 },
  beauty: { x: HALF, z: -30.2, nx: -1, nz: 0, w: 4.3, reach: 2 },
  designer: { x: -COURT_GLASS, z: -36.0, nx: 1, nz: 0, w: 4.3, reach: 2 },
  shoes: { x: -COURT_GLASS, z: -40.5, nx: 1, nz: 0, w: 4.3, reach: 2 },
  sports: { x: COURT_GLASS, z: -36.0, nx: -1, nz: 0, w: 4.3, reach: 2 },
  books: { x: COURT_GLASS, z: -40.5, nx: -1, nz: 0, w: 4.3, reach: 2 },
  toys: { x: -12.3, z: -46.3 + UNIT_DEPTH, nx: 0, nz: 1, w: 4.3, reach: 1.5 },
  arcade: { x: 12.3, z: -46.3 + UNIT_DEPTH, nx: 0, nz: 1, w: 4.3, reach: 1.5 },
};
export const UNIT_SHOPS = Object.keys(UNITS) as UnitShop[];
export const isUnit = (w: Where): w is UnitShop => w in UNITS;
/** A storefront's point: `d` out in front of its glass (negative: behind it), `l` along it. */
export const unitPoint = (shop: UnitShop, d: number, l = 0) => {
  const u = UNITS[shop];
  return { x: u.x + u.nx * d - u.nz * l, z: u.z + u.nz * d + u.nx * l };
};
/** Where a point is against a storefront: out in front (d) and along (l). */
const unitLocal = (u: Unit, x: number, z: number) => ({
  d: (x - u.x) * u.nx + (z - u.z) * u.nz,
  l: -(x - u.x) * u.nz + (z - u.z) * u.nx,
});

/** A shop-frame point in the world. */
export const shopToWorld = (shop: RoomShop, u: number, v: number) => ({
  x: SPOT[shop].side * (HALF + u),
  z: SPOT[shop].z + v,
});

/** The columns down both sides of the hall, the planters and benches. */
export const COLUMN_Z = [4, -7, -18, -29, -40];
export const PLANTER_Z = [-1, -27];
/** The food court's tables (x, z). */
export const TABLES: { x: number; z: number }[] = [];
for (let i = 0; i < 4; i++)
  for (let j = 0; j < 2; j++) TABLES.push({ x: -6 + i * 4, z: -38 - j * 3.2 });

/** The food court's counters: the dishes each sells (the first is its own). */
export const COUNTERS: {
  items: string[];
  name: string;
  x: number;
  colour: string;
  icon: string;
}[] = [
  {
    items: ['local-plate', 'fc-chicken', 'fc-shawarma'],
    name: 'Grill',
    x: -7,
    colour: '#ea580c',
    icon: '🍲',
  },
  {
    items: ['burger', 'fc-pizza', 'fc-noodles'],
    name: 'Burgers',
    x: 0,
    colour: '#f59e0b',
    icon: '🍔',
  },
  {
    items: ['smoothie', 'fc-icecream', 'fc-coffee'],
    name: 'Juice',
    x: 7,
    colour: '#16a34a',
    icon: '🧃',
  },
];
/** The counter that sells a dish (else the one with the fewest). */
export const counterOf = (item: string) => COUNTERS.find((c) => c.items.includes(item));

/**
 * Where a shop shows its stock (shop frame): three pairs of displays
 * staggered back from the door either side of a clear aisle, and three
 * along the back. `h` is how high its tag floats.
 */
const SLOTS: { u: number; v: number; h: number }[] = [
  { u: 3.3, v: -2.4, h: 1.9 },
  { u: 3.3, v: 2.4, h: 1.9 },
  { u: 4.5, v: -1.6, h: 2.0 },
  { u: 4.5, v: 1.6, h: 2.0 },
  { u: 5.6, v: -3.0, h: 2.1 },
  { u: 5.6, v: 3.0, h: 2.1 },
  { u: 6.2, v: -1.4, h: 1.5 },
  { u: 6.2, v: 0, h: 1.5 },
  { u: 6.2, v: 1.4, h: 1.5 },
];

/** Each item's display spot (index into SLOTS); others take the free ones in order. */
const SLOT_OF: Record<string, number> = {
  'top-tee': 0,
  'top-shirt': 1,
  'top-hoodie': 2,
  'top-kaftan': 3,
  'top-dress': 4,
  'top-blazer': 5,
  'acc-cap': 6,
  'acc-beanie': 7,
  'acc-shades': 8,
  'phone-1': 0,
  'phone-2': 1,
  'phone-3': 2,
  'laptop-2': 3,
  'sound-1': 5,
  'tv-2': 7,
  'lights-2': 0,
  'plants-1': 1,
  'rug-2': 2,
  'sofa-2': 4,
  'bed-2': 5,
  'art-2': 7,
  groceries: 2,
  'groceries-week': 3,
  snacks: 7,
  film: 2,
  'film-vip': 3,
};

/** What a display is, for its shape (and how much floor it takes). */
type DisplayKind =
  | 'rail'
  | 'plinth'
  | 'table'
  | 'tv'
  | 'speaker'
  | 'lamp'
  | 'plant'
  | 'rug'
  | 'sofa'
  | 'bed'
  | 'art'
  | 'basket'
  | 'trolley'
  | 'fridge'
  | 'desk'
  | 'booth';

function displayKind(id: string, shop: MallShopId): DisplayKind {
  if (id.startsWith('top-')) return 'rail';
  if (id.startsWith('acc-') || id.startsWith('phone-')) return 'plinth';
  const by: Record<string, DisplayKind> = {
    'laptop-2': 'table',
    'tv-2': 'tv',
    'sound-1': 'speaker',
    'lights-2': 'lamp',
    'plants-1': 'plant',
    'rug-2': 'rug',
    'sofa-2': 'sofa',
    'bed-2': 'bed',
    'art-2': 'art',
    groceries: 'basket',
    'groceries-week': 'trolley',
    snacks: 'fridge',
    film: 'desk',
    'film-vip': 'booth',
  };
  return by[id] ?? (shop === 'home' ? 'table' : 'plinth');
}

/** Half-sizes of the floor a display takes (u, v); 0: walk over it (a rug) or on the wall. */
const FOOT: Record<DisplayKind, [number, number]> = {
  rail: [0.3, 0.75],
  plinth: [0.35, 0.35],
  table: [0.45, 0.6],
  tv: [0.3, 0.7],
  speaker: [0.3, 0.3],
  lamp: [0.25, 0.25],
  plant: [0.35, 0.35],
  rug: [0, 0],
  sofa: [0.5, 0.95],
  bed: [1.0, 0.75],
  art: [0, 0],
  basket: [0.4, 0.4],
  trolley: [0.4, 0.55],
  fridge: [0.35, 0.7],
  desk: [0.4, 0.9],
  booth: [0.45, 0.9],
};

/** How high a display's tag floats (just over the top of it). */
const TAG_Y: Record<DisplayKind, number> = {
  rail: 1.8,
  plinth: 1.35,
  table: 1.3,
  tv: 2.2,
  speaker: 1.25,
  lamp: 1.95,
  plant: 1.6,
  rug: 0.4,
  sofa: 1.25,
  bed: 1.25,
  art: 2.3,
  basket: 1.35,
  trolley: 1.1,
  fridge: 2.25,
  desk: 1.4,
  booth: 1.4,
};

export interface Display {
  id: string;
  shop: MallShopId;
  kind: DisplayKind;
  /** World position of its middle (floor) and where its tag floats. */
  x: number;
  z: number;
  tagY: number;
  /** Floor half-sizes in world axes. */
  hx: number;
  hz: number;
}

/**
 * Where each item in the shops is shown: on a display in a shop's room (as
 * many as its nine spots hold), at a food court counter (three each). The
 * storefronts' stock, and what doesn't fit, is on the shop's list.
 */
export function displays(stock: { id: string; shop: MallShopId }[]): Display[] {
  const out: Display[] = [];
  const used = new Map<RoomShop, Set<number>>();
  const later: { id: string; shop: RoomShop }[] = [];
  const atCounter = new Map<number, number>();
  for (const it of stock) {
    if (it.shop === 'foodcourt') {
      const c =
        counterOf(it.id) ??
        [...COUNTERS].sort((a, b) => (atCounter.get(a.x) ?? 0) - (atCounter.get(b.x) ?? 0))[0]!;
      const k = atCounter.get(c.x) ?? 0;
      if (k >= 3) continue;
      atCounter.set(c.x, k + 1);
      out.push({
        id: it.id,
        shop: 'foodcourt',
        kind: 'desk',
        x: c.x + (k - 1) * 1.7,
        z: COUNTER_Z - 0.6,
        tagY: 2.2 + (k === 1 ? 0 : 0.5),
        hx: 0,
        hz: 0,
      });
      continue;
    }
    if (!isRoom(it.shop)) continue;
    const shop = it.shop;
    const s = used.get(shop) ?? new Set<number>();
    used.set(shop, s);
    const k = SLOT_OF[it.id];
    if (k === undefined || s.has(k)) later.push({ id: it.id, shop });
    else {
      s.add(k);
      out.push(place(it.id, shop, k));
    }
  }
  for (const it of later) {
    const s = used.get(it.shop)!;
    const k = SLOTS.findIndex((_, i) => !s.has(i));
    if (k < 0) continue;
    s.add(k);
    out.push(place(it.id, it.shop, k));
  }
  return out;
}

function place(id: string, shop: RoomShop, k: number): Display {
  const sl = SLOTS[k]!;
  const kind = displayKind(id, shop);
  // Things hung on the back wall stand against it.
  const u = kind === 'art' || kind === 'tv' ? DEPTH - 0.35 : sl.u;
  const p = shopToWorld(shop, u, sl.v);
  const [fu, fv] = FOOT[kind];
  return { id, shop, kind, x: p.x, z: p.z, tagY: TAG_Y[kind], hx: fu, hz: fv };
}

/** Where you stand inside a shop on coming in, and just outside its door. */
const inside = (shop: RoomShop) => shopToWorld(shop, 2.4, 0);
const outside = (shop: RoomShop) => shopToWorld(shop, -1.6, 0);
/** Where you go for a shop (its inside; at a storefront's window; the food court's middle). */
export function goal(shop: MallShopId): { x: number; z: number } {
  if (shop === 'foodcourt') return { x: 0, z: -35.6 };
  if (isUnit(shop)) return unitPoint(shop, UNITS[shop].reach * 0.55);
  return inside(shop);
}
/** Back out in the hall from a shop (or the food court). */
export function backOut(where: Where): { x: number; z: number } {
  if (where === 'concourse') return { x: 0.9, z: 4.5 };
  if (where === 'foodcourt') return { x: 0, z: -31.5 };
  // The food court's back corners: out into the court, clear of the side storefronts.
  if (where === 'toys' || where === 'arcade')
    return { x: Math.sign(UNITS[where].x) * 9.4, z: -41.2 };
  if (isUnit(where)) return unitPoint(where, UNITS[where].reach + 1.2);
  return outside(where);
}
/** Where you come in. */
export const START = { x: 1.2, z: 4.4, heading: Math.PI + 0.5 };

/** Which part of the mall a point is in. */
export function regionOf(x: number, z: number): Where {
  for (const shop of UNIT_SHOPS) {
    const u = UNITS[shop];
    const p = unitLocal(u, x, z);
    if (p.d > -0.2 && p.d < u.reach && Math.abs(p.l) < u.w / 2) return shop;
  }
  for (const shop of ROOM_SHOPS) {
    const sp = SPOT[shop];
    const u = sp.side * x - HALF;
    if (u > 0.15 && u < DEPTH && Math.abs(z - sp.z) < SHOP_W / 2) return shop;
  }
  return z < COURT_Z ? 'foodcourt' : 'concourse';
}

/** Whether a person can stand here (walls, glass and things in the way). */
function makeFree(ds: Display[]) {
  return (x: number, z: number): boolean => {
    // Shops' rooms, through their doors.
    for (const shop of ROOM_SHOPS) {
      const sp = SPOT[shop];
      const u = sp.side * x - HALF;
      const v = z - sp.z;
      if (Math.abs(v) < SHOP_W / 2 && u > -0.7) {
        if (u <= 0.45) {
          // The glass front: only the door (between the mullions) is open.
          if (Math.abs(v) > 1.2) return false;
          if (u > -0.7) return roomOk(ds, x, z);
        }
        if (u >= DEPTH - 0.45 || Math.abs(v) > SHOP_W / 2 - 0.45) return false;
        return roomOk(ds, x, z);
      }
    }
    if (z > FRONT_Z - 0.8) return false;
    if (z < COUNTER_Z + 0.4) return false;
    const wide = z < COURT_Z - 0.3;
    if (Math.abs(x) > (wide ? HALF + DEPTH - 0.6 : HALF - 0.45)) return false;
    // Columns.
    for (const cz of COLUMN_Z)
      for (const s of [-1, 1]) if (Math.hypot(x - s * 4.4, z - cz) < 0.32 + R) return false;
    // Planters and their benches.
    for (const pz of PLANTER_Z)
      for (const s of [-1, 1]) {
        if (Math.hypot(x - s * 3.1, z - pz) < 0.7 + R) return false;
        if (Math.abs(x - s * 3.1) < 0.28 + R && Math.abs(z - (pz - 2.2)) < 0.9 + R) return false;
      }
    // The escalators.
    if (Math.abs(x) < 2.1 + R && z < -12.8 + R && z > -21.2 - R) return false;
    // The storefronts' glass (in the food court they stand out from the wall).
    for (const shop of UNIT_SHOPS) {
      const u = UNITS[shop];
      const p = unitLocal(u, x, z);
      if (p.d < 0.45 && p.d > -UNIT_DEPTH - 1 && Math.abs(p.l) < u.w / 2 + 0.3) return false;
    }
    // The food court's tables and chairs.
    for (const t of TABLES)
      if (Math.abs(x - t.x) < 0.65 + R && Math.abs(z - t.z) < 1.15 + R) return false;
    return roomOk(ds, x, z);
  };
}

function roomOk(ds: Display[], x: number, z: number) {
  for (const d of ds) {
    if (!d.hx && !d.hz) continue;
    // Displays' frames turn with their side of the hall: u is along x.
    if (Math.abs(x - d.x) < d.hx + R && Math.abs(z - d.z) < d.hz + R) return false;
  }
  // Mannequins and tills by the windows.
  for (const m of FIXED) if (Math.hypot(x - m.x, z - m.z) < m.r + R) return false;
  return true;
}

/** Fixed things in the shops' rooms (mannequins, tills), world positions. */
export const FIXED: { x: number; z: number; r: number }[] = [
  { ...shopToWorld('fashion', 1.0, -3.7), r: 0.3 },
  { ...shopToWorld('fashion', 1.0, 3.7), r: 0.3 },
  { ...shopToWorld('supermarket', 1.3, -3.4), r: 0.6 },
  { ...shopToWorld('phones', 1.2, -3.5), r: 0.5 },
  { ...shopToWorld('cinema', 1.2, 3.4), r: 0.5 },
];

// ---------------------------------------------------------------- Walking

const CELL = 0.25;
const X0 = -(HALF + DEPTH);
const Z0 = COUNTER_Z - 0.5;
const NX = Math.ceil((2 * (HALF + DEPTH)) / CELL);
const NZ = Math.ceil((FRONT_Z - Z0) / CELL);

export interface WalkGrid {
  free: (x: number, z: number) => boolean;
  cells: Uint8Array;
}

export function walkGrid(ds: Display[]): WalkGrid {
  const free = makeFree(ds);
  const cells = new Uint8Array(NX * NZ);
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NX; i++)
      cells[j * NX + i] = free(X0 + (i + 0.5) * CELL, Z0 + (j + 0.5) * CELL) ? 1 : 0;
  return { free, cells };
}

const cellOf = (x: number, z: number) => ({
  i: Math.floor((x - X0) / CELL),
  j: Math.floor((z - Z0) / CELL),
});
const centre = (i: number, j: number) => ({ x: X0 + (i + 0.5) * CELL, z: Z0 + (j + 0.5) * CELL });
const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < NX && j < NZ;

/** The nearest free cell to a point (within `reach` metres), or null. */
function nearestFree(
  g: WalkGrid,
  x: number,
  z: number,
  reach = 3,
): { x: number; z: number } | null {
  const c = cellOf(x, z);
  if (inGrid(c.i, c.j) && g.cells[c.j * NX + c.i]) return { x, z };
  const n = Math.ceil(reach / CELL);
  let best: { x: number; z: number } | null = null;
  let bd = Infinity;
  for (let dj = -n; dj <= n; dj++)
    for (let di = -n; di <= n; di++) {
      const i = c.i + di;
      const j = c.j + dj;
      if (!inGrid(i, j) || !g.cells[j * NX + i]) continue;
      const d = di * di + dj * dj;
      if (d < bd) {
        bd = d;
        best = centre(i, j);
      }
    }
  return best && Math.sqrt(bd) * CELL <= reach ? best : null;
}

/** Whether a point is on the walkable grid (what paths keep to). */
export function onGrid(g: WalkGrid, x: number, z: number) {
  const c = cellOf(x, z);
  return inGrid(c.i, c.j) && g.cells[c.j * NX + c.i] === 1;
}

/** Whether the straight line from a to b stays on free floor. */
function clear(g: WalkGrid, ax: number, az: number, bx: number, bz: number) {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(d / (CELL * 0.2)));
  for (let k = 1; k < n; k++) {
    const c = cellOf(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
    if (!inGrid(c.i, c.j) || !g.cells[c.j * NX + c.i]) return false;
  }
  return true;
}

/**
 * A path from a to b on free floor (b moved to the nearest free spot), as
 * corner points after a; null if b can't be reached.
 */
export function findPath(
  g: WalkGrid,
  a: { x: number; z: number },
  bIn: { x: number; z: number },
): { x: number; z: number }[] | null {
  const b = nearestFree(g, bIn.x, bIn.z);
  if (!b) return null;
  const from = nearestFree(g, a.x, a.z, 3) ?? a;
  if (clear(g, from.x, from.z, b.x, b.z)) return [b];
  const s = cellOf(from.x, from.z);
  const e = cellOf(b.x, b.z);
  if (!inGrid(s.i, s.j) || !inGrid(e.i, e.j)) return null;
  const N = NX * NZ;
  const gs = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const shut = new Uint8Array(N);
  const start = s.j * NX + s.i;
  const end = e.j * NX + e.i;
  gs[start] = 0;
  // A binary heap of [f, cell].
  const heap: number[][] = [];
  const push = (f: number, c: number) => {
    heap.push([f, c]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p]![0]! <= heap[k]![0]!) break;
      [heap[p], heap[k]] = [heap[k]!, heap[p]!];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l]![0]! < heap[m]![0]!) m = l;
        if (r < heap.length && heap[r]![0]! < heap[m]![0]!) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k]!, heap[m]!];
        k = m;
      }
    }
    return top;
  };
  const hfn = (i: number, j: number) => {
    const dx = Math.abs(i - e.i);
    const dz = Math.abs(j - e.j);
    return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
  };
  push(hfn(s.i, s.j), start);
  let found = false;
  while (heap.length) {
    const [, c] = pop() as [number, number];
    if (shut[c]) continue;
    if (c === end) {
      found = true;
      break;
    }
    shut[c] = 1;
    const ci = c % NX;
    const cj = (c - ci) / NX;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di;
        const j = cj + dj;
        if (!inGrid(i, j)) continue;
        const n = j * NX + i;
        if (!g.cells[n] || shut[n]) continue;
        // No cutting corners past something solid.
        if (di && dj && (!g.cells[cj * NX + i] || !g.cells[j * NX + ci])) continue;
        const ng = gs[c]! + (di && dj ? Math.SQRT2 : 1);
        if (ng < gs[n]!) {
          gs[n] = ng;
          came[n] = c;
          push(ng + hfn(i, j), n);
        }
      }
  }
  if (!found) return null;
  const cells: number[] = [];
  for (let c = end; c !== -1 && c !== start; c = came[c]!) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => centre(c % NX, Math.floor(c / NX)));
  pts[pts.length - 1] = b;
  // Pull the path straight: from each corner, go as far as can be seen.
  const out: { x: number; z: number }[] = [];
  let cur = from;
  let k = 0;
  while (k < pts.length) {
    let far = k;
    for (let m = pts.length - 1; m > k; m--)
      if (clear(g, cur.x, cur.z, pts[m]!.x, pts[m]!.z)) {
        far = m;
        break;
      }
    out.push(pts[far]!);
    cur = pts[far]!;
    k = far + 1;
  }
  return out;
}

/**
 * A path with its corners rounded (a quadratic curve through each corner,
 * as far round as the floor allows), as close-spaced points after a: you
 * walk round a corner instead of zig-zagging at it.
 */
export function smoothPath(
  g: WalkGrid,
  a: { x: number; z: number },
  pts: { x: number; z: number }[],
  round = 1.1,
): { x: number; z: number }[] {
  const poly = [a, ...pts];
  const out: { x: number; z: number }[] = [];
  let last = a;
  for (let i = 1; i < poly.length - 1; i++) {
    const p0 = poly[i - 1]!;
    const c = poly[i]!;
    const n = poly[i + 1]!;
    const l1 = Math.hypot(c.x - p0.x, c.z - p0.z);
    const l2 = Math.hypot(n.x - c.x, n.z - c.z);
    let r = Math.min(round, l1 / 2, l2 / 2);
    let done = false;
    while (r >= 0.12 && !done) {
      const e = { x: c.x + ((p0.x - c.x) / l1) * r, z: c.z + ((p0.z - c.z) / l1) * r };
      const x = { x: c.x + ((n.x - c.x) / l2) * r, z: c.z + ((n.z - c.z) / l2) * r };
      const curve = [e];
      const k = Math.max(3, Math.ceil(r / 0.2));
      for (let j = 1; j <= k; j++) {
        const u = j / k;
        const w0 = (1 - u) * (1 - u);
        const w1 = 2 * u * (1 - u);
        const w2 = u * u;
        curve.push({ x: w0 * e.x + w1 * c.x + w2 * x.x, z: w0 * e.z + w1 * c.z + w2 * x.z });
      }
      let ok = clear(g, last.x, last.z, e.x, e.z);
      for (let j = 1; ok && j < curve.length; j++)
        ok = clear(g, curve[j - 1]!.x, curve[j - 1]!.z, curve[j]!.x, curve[j]!.z);
      if (ok) {
        out.push(...curve);
        last = curve[curve.length - 1]!;
        done = true;
      } else r /= 2;
    }
    if (!done) {
      out.push(c);
      last = c;
    }
  }
  out.push(poly[poly.length - 1]!);
  return out;
}

/** The length of a path from a through its points. */
export function pathLength(a: { x: number; z: number }, pts: { x: number; z: number }[]) {
  let d = 0;
  let p = a;
  for (const q of pts) {
    d += Math.hypot(q.x - p.x, q.z - p.z);
    p = q;
  }
  return d;
}

// ---------------------------------------------------------------- Looking

/** Where things are, for the compass and the "what's ahead" card. */
export function landmarks(
  open: readonly MallShopId[] = [...ROOM_SHOPS, ...UNIT_SHOPS],
): { id: MallShopId | 'exit'; x: number; z: number }[] {
  return [
    ...ROOM_SHOPS.map((s) => ({ id: s, ...shopToWorld(s, 0, 0) })),
    ...UNIT_SHOPS.filter((s) => open.includes(s)).map((s) => ({ id: s, ...unitPoint(s, 0) })),
    { id: 'foodcourt' as const, x: 0, z: -40 },
    { id: 'exit' as const, x: 0, z: FRONT_Z },
  ];
}

/**
 * A heading (radians, forward = (sin h, cos h); down the hall is π) as a
 * compass point: north is down the hall towards the food court.
 */
export function compassPoint(h: number): 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' {
  // From north (h = π), clockwise (north → east is π → π/2).
  const a = ((((Math.PI - h) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4);
  return (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const)[Math.round(a) % 8]!;
}

/** The angle of a point from where you face (−π…π, positive to your right). */
export function bearing(from: { x: number; z: number }, h: number, to: { x: number; z: number }) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const f = dx * Math.sin(h) + dz * Math.cos(h);
  const r = dx * -Math.cos(h) + dz * Math.sin(h);
  return Math.atan2(r, f);
}
