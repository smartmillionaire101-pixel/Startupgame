/**
 * Your hotel room abroad (player feedback: "showing the room with bathrooms
 * like the original home", then "can the room be different layers of
 * expensive — a suite should have a proper suite experience"): a floor plan
 * the home scene (./HomeScene.tsx) and the 3D home (../interiors3d/Home3D.tsx)
 * draw like your own home, but laid out like a hotel room and furnished by
 * the hotel, not by you. No kitchen in any of them.
 *
 * - budget (6×6): a compact room, a double bed, a small desk, a TV, a
 *   wardrobe niche by the door and a shower room (shower, toilet, basin);
 * - business (10×8): a king bed, a work desk with an ergonomic chair, an
 *   armchair and a side table by the window, a coffee and tea tray, a TV on
 *   a console, a wardrobe in the entrance, a bathroom with a walk-in shower
 *   and a vanity;
 * - suite (14×10): an entrance foyer; a living room (a sofa and armchairs
 *   round a coffee table on a rug, a TV wall, a dining table for four, a
 *   bar with a wine fridge, no cooker); a bedroom with a king bed, bedside
 *   lamps and a bench at its foot; a walk-in wardrobe; a marble bathroom
 *   with a freestanding tub at the window, a walk-in rain shower, double
 *   basins and the WC behind its own wall; the balcony with loungers.
 *
 * Every room has a window on the city (the 3D view puts the room partway up
 * the hotel's tower, the corridor and the neighbours' closed rooms round it,
 * the city far below) and your suitcase. Pure data in tiles, like ./layout.ts.
 */
import type { HotelTier } from '../city/travel';
import type { Grounds } from './grounds';
import type { Decor, FixtureId, HomeAct, HomePlan, Room, Spot } from './layout';

/** What you can do in a hotel room (the home acts the engine lets you do away from home). */
export const HOTEL_ACTS: ReadonlySet<HomeAct> = new Set(['sleep', 'nap', 'shower', 'toilet', 'tv']);

/** The room's finish by tier (the furniture's tier, 1–3). */
const HOTEL_FINISH: Record<HotelTier, number> = { budget: 1, business: 2, luxury: 3 };

/** The tier the 3D shell is drawn at (a suite's living room is marble). */
export const HOTEL_SHELL_TIER: Record<HotelTier, number> = { budget: 2, business: 3, luxury: 5 };

/** How the tier reads under the hotel's name ("★★★★★ suite"). */
export const HOTEL_TIER_LABEL: Record<HotelTier, string> = {
  budget: '★ room',
  business: '★★★ business room',
  luxury: '★★★★★ suite',
};

const tierOf = (t: HotelTier | null | undefined): HotelTier =>
  t === 'business' || t === 'luxury' ? t : 'budget';

type At = [number, number, number, number, number, number];

const spot = (
  x: number,
  y: number,
  w: number,
  h: number,
  ix: number,
  iy: number,
  opts: { blocked?: boolean; wall?: boolean; rot?: number } = {},
): Spot => ({
  x,
  y,
  w,
  h,
  blocked: opts.blocked ?? !opts.wall,
  ...(opts.wall ? { wall: true } : {}),
  // A quarter-turn facing (../interiors3d/catalog.ts `facingOf` reads it).
  ...(opts.rot !== undefined ? ({ rot: opts.rot } as object) : {}),
  interact: { x: ix, y: iy },
});

const decor = (
  id: string,
  model: string,
  label: string,
  room: Decor['room'],
  at: At,
  rot: number,
  tier: number,
  verbs: Decor['verbs'] = [],
  opts: { blocked?: boolean; wall?: boolean } = {},
): Decor => ({
  id,
  model,
  label,
  room,
  spot: { ...spot(...at, opts), rot },
  verbs,
  tier,
});

const feetUp = [{ act: 'nap' as const, label: 'Put your feet up' }];
const watch = [{ act: 'tv' as const, label: 'Watch TV' }];

interface Shape {
  w: number;
  h: number;
  rooms: Room[];
  walls: HomePlan['walls'];
  slots: Record<string, Spot>;
  fixtures: Partial<Record<FixtureId, Spot>>;
  door: { x: number; y: number };
  seats?: { x: number; y: number }[];
  decor: Decor[];
}

const vWalls = (x: number, ys: number[]) => ys.map((y) => ({ dir: 'v' as const, x, y }));
const hWalls = (y: number, xs: number[]) => xs.map((x) => ({ dir: 'h' as const, x, y }));

function budget(f: number): Shape {
  // 6×6: the room on the left, the shower room and the entrance on the right.
  return {
    w: 6,
    h: 6,
    rooms: [
      { id: 'bedroom', x: 0, y: 0, w: 4, h: 6 },
      { id: 'bathroom', x: 4, y: 0, w: 2, h: 3 },
      { id: 'hall', x: 4, y: 3, w: 2, h: 3 },
    ],
    walls: [
      ...vWalls(4, [0, 1, 2]),
      // The shower room's door is the gap at x = 4.
      { dir: 'h', x: 5, y: 3 },
    ],
    slots: {
      bed: spot(1, 0, 2, 3, 3, 1),
      // A small desk and chair against the wall, the TV on the wall facing the bed.
      desk: spot(0, 3, 1, 2, 1, 4, { rot: 1 }),
      tv: spot(1, 5, 2, 1, 1, 4),
      // The wardrobe: a niche of rail and shelves by the door.
      wardrobe: spot(5, 3, 1, 2, 4, 4),
      lights: spot(3, 0, 1, 1, 3, 1),
    },
    fixtures: {
      door: spot(4, 5, 1, 1, 4, 5, { blocked: false }),
      shower: spot(5, 0, 1, 1, 4, 0),
      sink: spot(5, 1, 1, 1, 4, 1),
      toilet: spot(5, 2, 1, 1, 4, 2),
    },
    door: { x: 4, y: 5 },
    seats: [
      { x: 2, y: 4 },
      { x: 3, y: 4 },
      { x: 3, y: 3 },
    ],
    decor: [
      decor('nightstand-1', 'nightstand', 'Bedside table', 'bedroom', [0, 0, 1, 1, 1, 3], 0, f),
      decor('suitcase', 'suitcase', 'Your suitcase', 'bedroom', [0, 5, 1, 1, 1, 4], 0, f),
    ],
  };
}

function business(f: number): Shape {
  // 10×8: the room on the left; the bathroom and the entrance on the right.
  return {
    w: 10,
    h: 8,
    rooms: [
      { id: 'bedroom', x: 0, y: 0, w: 7, h: 8 },
      { id: 'bathroom', x: 7, y: 0, w: 3, h: 4 },
      { id: 'hall', x: 7, y: 4, w: 3, h: 4 },
    ],
    walls: [
      ...vWalls(7, [0, 1, 2, 3]),
      // The bathroom's door is the gap at x = 8.
      ...hWalls(4, [7, 9]),
    ],
    slots: {
      bed: spot(2, 0, 2, 3, 1, 1),
      // The work desk on the wall, an ergonomic chair at it.
      desk: spot(0, 4, 1, 2, 1, 4, { rot: 1 }),
      wardrobe: spot(9, 5, 1, 2, 8, 5, { rot: 3 }),
      lights: spot(0, 0, 1, 1, 0, 1),
    },
    fixtures: {
      door: spot(8, 7, 1, 1, 8, 7, { blocked: false }),
      // A walk-in shower across the back, the vanity along the wall, the WC.
      shower: spot(8, 0, 2, 1, 8, 1),
      sink: spot(7, 1, 1, 2, 8, 2, { rot: 1 }),
      toilet: spot(9, 2, 1, 1, 8, 2, { rot: 3 }),
    },
    door: { x: 8, y: 7 },
    seats: [
      { x: 5, y: 1 },
      { x: 1, y: 5 },
      { x: 6, y: 2 },
    ],
    decor: [
      decor(
        'nightstand-1',
        'hotel-nightstand',
        'Bedside table',
        'bedroom',
        [1, 0, 1, 1, 1, 1],
        0,
        f,
      ),
      decor(
        'nightstand-2',
        'hotel-nightstand',
        'Bedside table',
        'bedroom',
        [4, 0, 1, 1, 4, 1],
        0,
        f,
      ),
      decor('art', 'hotel-art', 'Painting', 'bedroom', [2, 0, 2, 1, 1, 3], 0, f, [], {
        wall: true,
      }),
      decor('bench', 'bed-bench', 'Bench', 'bedroom', [2, 3, 2, 1, 2, 4], 0, f),
      decor('area-rug', 'suite-rug', 'Rug', 'bedroom', [1, 1, 4, 4, 1, 4], 0, f, [], {
        blocked: false,
      }),
      // The window corner: an armchair and a side table with a lamp.
      decor('armchair', 'suite-armchair', 'Armchair', 'bedroom', [5, 0, 1, 1, 5, 1], 0, f, feetUp),
      decor('side-table', 'side-table', 'Side table', 'bedroom', [6, 0, 1, 1, 6, 1], 0, f),
      // The TV on a console facing the bed, the coffee and tea tray beside it.
      decor('tv', 'hotel-tv', 'TV', 'bedroom', [2, 7, 2, 1, 2, 6], 2, f, watch),
      decor('tea', 'tea-tray', 'Coffee and tea', 'bedroom', [4, 7, 1, 1, 4, 6], 2, f),
      decor('suitcase', 'suitcase', 'Your suitcase', 'hall', [9, 7, 1, 1, 8, 6], 3, f),
    ],
  };
}

function luxury(f: number): Shape {
  // 14×10. Along the windows: the living room, the bedroom, the bathroom.
  // Along the corridor: the dining end of the living room, the foyer (the
  // door), the walk-in wardrobe and the WC behind its own wall.
  return {
    w: 14,
    h: 10,
    rooms: [
      { id: 'living', x: 0, y: 0, w: 6, h: 10 },
      { id: 'bedroom', x: 6, y: 0, w: 5, h: 6 },
      { id: 'bathroom', x: 11, y: 0, w: 3, h: 10 },
      { id: 'hall', x: 6, y: 6, w: 3, h: 4 },
      // The walk-in wardrobe (drawn as a dressing room).
      { id: 'guest', x: 9, y: 6, w: 2, h: 4 },
    ],
    walls: [
      // Living room | bedroom, the bedroom's door at y = 4.
      ...vWalls(6, [0, 1, 2, 3, 5]),
      // The foyer opens onto the living room between two short walls.
      ...vWalls(6, [6, 9]),
      // Bedroom | foyer, and the walk-in wardrobe's door at x = 10.
      ...hWalls(6, [6, 7, 8, 9]),
      // Foyer | wardrobe.
      ...vWalls(9, [6, 7, 8, 9]),
      // Bedroom | bathroom (the door at y = 4), wardrobe | bathroom.
      ...vWalls(11, [0, 1, 2, 3, 5, 6, 7, 8, 9]),
      // The WC's own wall, its door at x = 12.
      ...hWalls(7, [11, 13]),
    ],
    slots: {
      sofa: spot(3, 1, 1, 3, 4, 2, { rot: 3 }),
      rug: spot(1, 1, 3, 3, 1, 2, { blocked: false }),
      lights: spot(3, 0, 1, 1, 4, 0),
      plants: spot(0, 0, 1, 1, 1, 0),
      bed: spot(8, 0, 2, 3, 7, 1),
      wardrobe: spot(9, 7, 1, 3, 10, 8, { rot: 1 }),
    },
    fixtures: {
      door: spot(7, 9, 1, 1, 7, 9, { blocked: false }),
      // A freestanding tub at the window, a walk-in rain shower, double basins.
      bathtub: spot(12, 0, 2, 1, 12, 1),
      shower: spot(13, 2, 1, 2, 12, 2, { rot: 3 }),
      sink: spot(11, 2, 1, 2, 12, 3, { rot: 1 }),
      toilet: spot(13, 8, 1, 1, 12, 8, { rot: 3 }),
    },
    door: { x: 7, y: 9 },
    seats: [
      { x: 3, y: 2 },
      { x: 3, y: 1 },
      { x: 3, y: 3 },
    ],
    decor: [
      // The living room: the TV wall, armchairs either end of the coffee table.
      decor('tv', 'hotel-tv-wall', 'TV', 'living', [0, 1, 1, 3, 1, 2], 1, f, watch),
      decor(
        'coffee-table',
        'hotel-coffee-table',
        'Coffee table',
        'living',
        [2, 1, 1, 3, 1, 2],
        1,
        f,
      ),
      decor('armchair', 'suite-armchair', 'Armchair', 'living', [2, 0, 1, 1, 1, 0], 0, f, feetUp),
      decor('armchair-2', 'suite-armchair', 'Armchair', 'living', [2, 4, 1, 1, 1, 4], 2, f, feetUp),
      decor('plant-2', 'tall-plant', 'Plant', 'living', [0, 4, 1, 1, 1, 4], 0, f),
      decor('desk', 'writing-desk', 'Writing desk', 'living', [5, 0, 1, 1, 5, 1], 0, f),
      // The dining end: a table for four under a pendant, the bar on the wall.
      decor('dining', 'hotel-dining', 'Dining table', 'living', [2, 6, 2, 2, 2, 8], 0, f),
      decor('bar', 'suite-bar', 'Bar', 'living', [0, 7, 1, 2, 1, 7], 1, f),
      decor('art', 'hotel-art', 'Painting', 'living', [0, 6, 1, 1, 1, 6], 1, f, [], { wall: true }),
      decor('sideboard', 'sideboard', 'Sideboard', 'living', [4, 9, 2, 1, 4, 8], 2, f),
      // The bedroom.
      decor(
        'nightstand-1',
        'hotel-nightstand',
        'Bedside table',
        'bedroom',
        [7, 0, 1, 1, 7, 1],
        0,
        f,
      ),
      decor(
        'nightstand-2',
        'hotel-nightstand',
        'Bedside table',
        'bedroom',
        [10, 0, 1, 1, 10, 1],
        0,
        f,
      ),
      decor('bench', 'bed-bench', 'Bench', 'bedroom', [8, 3, 2, 1, 8, 4], 0, f),
      decor('chaise', 'suite-armchair', 'Armchair', 'bedroom', [6, 0, 1, 1, 6, 1], 0, f, feetUp),
      decor('art-2', 'hotel-art', 'Painting', 'bedroom', [8, 0, 2, 1, 7, 2], 0, f, [], {
        wall: true,
      }),
      decor('dresser', 'sideboard', 'Dresser', 'bedroom', [6, 5, 1, 1, 7, 5], 1, f),
      // The walk-in wardrobe: a mirror, your suitcase on its rack.
      decor('mirror', 'dress-mirror', 'Mirror', 'guest', [9, 6, 1, 1, 10, 7], 1, f),
      decor('suitcase', 'suitcase', 'Your suitcase', 'guest', [10, 9, 1, 1, 10, 8], 2, f),
      // The foyer: a console with flowers, a round rug.
      decor('console', 'foyer-console', 'Console', 'hall', [8, 7, 1, 2, 7, 7], 3, f),
      decor('plant-3', 'tall-plant', 'Plant', 'hall', [6, 6, 1, 1, 7, 7], 0, f),
      decor('entry-rug', 'round-rug', 'Rug', 'hall', [6, 7, 2, 2, 7, 8], 0, f, [], {
        blocked: false,
      }),
      // The bathroom.
      decor('plant-4', 'tall-plant', 'Plant', 'bathroom', [11, 0, 1, 1, 11, 1], 0, f),
      decor('towels', 'towel-rack', 'Towels', 'bathroom', [13, 5, 1, 1, 12, 5], 3, f),
    ],
  };
}

const PLANS = new Map<HotelTier, HomePlan>();

/** The room for a hotel tier (anything unknown: the budget room). */
export function hotelPlan(tier: HotelTier | null | undefined): HomePlan {
  const t = tierOf(tier);
  let p = PLANS.get(t);
  if (!p) {
    const f = HOTEL_FINISH[t];
    const s = t === 'luxury' ? luxury(f) : t === 'business' ? business(f) : budget(f);
    p = {
      tier: f,
      w: s.w,
      h: s.h,
      rooms: s.rooms,
      walls: s.walls,
      slots: s.slots,
      fixtures: s.fixtures,
      door: s.door,
      seats: s.seats ?? [],
      kind: t === 'luxury' ? 'apartment' : 'room',
      wealth: 1,
      coreW: s.w,
      decor: s.decor,
    };
    PLANS.set(t, p);
  }
  return p;
}

/** The furniture the hotel put in: every slot of the plan, at the room's finish. */
export function hotelFurniture(plan: HomePlan, tier: HotelTier | null | undefined) {
  const f = HOTEL_FINISH[tierOf(tier)];
  return new Map(Object.keys(plan.slots).map((s) => [s, f]));
}

/**
 * The hotel's own fittings, by tier, in place of a home's (an object id →
 * the model drawn for it): a budget shower tray, a business walk-in shower
 * and vanity, a suite's freestanding tub, rain shower and double basins.
 */
export const HOTEL_MODELS: Record<HotelTier, Record<string, string>> = {
  budget: { desk: 'hotel-desk', wardrobe: 'wardrobe-niche', tv: 'hotel-tv' },
  business: {
    desk: 'hotel-desk',
    shower: 'walk-in-shower',
    sink: 'hotel-vanity',
    lights: 'floor-lamp',
  },
  luxury: {
    bathtub: 'freestanding-tub',
    shower: 'rain-shower',
    sink: 'double-vanity',
    wardrobe: 'walk-in-wardrobe',
    lights: 'floor-lamp',
    rug: 'suite-rug',
    bed: 'suite-bed',
  },
};

/** What the room has, for the flat view and tests (the ids of what's in it). */
export function hotelContents(tier: HotelTier | null | undefined): string[] {
  const p = hotelPlan(tier);
  return [...Object.keys(p.slots), ...Object.keys(p.fixtures), ...p.decor.map((d) => d.id)];
}

/**
 * Which floor of its tower the hotel puts you on (player feedback: "the
 * hotel room is now on top of the building"): partway up, never the roof.
 */
const HOTEL_FLOOR: Record<HotelTier, number> = { budget: 8, business: 11, luxury: 14 };

/** Windows in the room's window wall: centre and width (tiles); `tall`: floor to ceiling. */
export interface HotelWindow {
  c: number;
  w: number;
  tall?: boolean;
}

export const HOTEL_WINDOWS: Record<HotelTier, HotelWindow[]> = {
  budget: [{ c: 2, w: 1.4 }],
  business: [{ c: 5.6, w: 2.2 }],
  luxury: [
    // The living room's glass wall onto the balcony, the bedroom's window, the tub's view.
    { c: 3, w: 4.6, tall: true },
    { c: 6.9, w: 1.3, tall: true },
    { c: 12.9, w: 1.7, tall: true },
  ],
};

// ---------------------------------------------------------------- The floor round the room

/** The corridor's depth (metres) and the lift lobby's width, as the tower draws them. */
export const HOTEL_CORRIDOR = 2.2;
export const HOTEL_LOBBY = 3.4;

/** The rooms either side of yours, nearest first: R1 is next door on the right. */
export type NeighbourSlot = 'R1' | 'L1' | 'R2' | 'L2';
const SLOTS: NeighbourSlot[] = ['R1', 'L1', 'R2', 'L2'];

export interface HotelRow {
  /** A neighbour's room width. */
  nw: number;
  /** The row's ends (x). */
  x0: number;
  x1: number;
  /** Each neighbour's room [x0, x1] and its door's centre (x) on the corridor. */
  rooms: Record<NeighbourSlot, { x0: number; x1: number; door: number }>;
  /** The lift lobby between R1 and R2. */
  lobby: { x0: number; x1: number };
}

/** Where the neighbours' rooms and doors are along your row of the corridor. */
export function hotelRow(plan: { w: number }): HotelRow {
  const W = plan.w;
  const nw = Math.max(5, Math.min(7, W));
  // Doors near the room's end nearest yours: next door is a few steps away.
  const room = (x0: number, near: 1 | -1) => ({
    x0,
    x1: x0 + nw,
    door: near === -1 ? x0 + 1.1 : x0 + nw - 1.1,
  });
  const lobby = { x0: W + nw, x1: W + nw + HOTEL_LOBBY };
  return {
    nw,
    x0: -2 * nw,
    x1: lobby.x1 + nw,
    rooms: { L2: room(-2 * nw, 1), L1: room(-nw, 1), R1: room(W, -1), R2: room(lobby.x1, -1) },
    lobby,
  };
}

export interface HotelDoor {
  slot: NeighbourSlot;
  /** The room's number on its door. */
  number: number;
  /** A friend's room: their name on the door. */
  friend?: { id: string; name: string };
  /** A "Do not disturb" sign on the handle (never on a friend's door). */
  dnd: boolean;
}

/**
 * The doors either side of yours: friends from your holiday (view.holidays'
 * room numbers) nearest you, next door first; the rest strangers, a few
 * with "Do not disturb" on the handle.
 */
export function hotelDoors(
  room: number,
  friends: readonly { id: string; name: string; room: number }[] = [],
): HotelDoor[] {
  const near = [...friends]
    .filter((f) => f.room !== room)
    .sort((a, b) => Math.abs(a.room - room) - Math.abs(b.room - room) || a.room - b.room)
    .slice(0, SLOTS.length);
  const used = new Set([room, ...near.map((f) => f.room)]);
  const spare: number[] = [];
  for (let d = 1; spare.length < SLOTS.length; d++)
    for (const n of [room + d, room - d]) if (!used.has(n) && n > 0) spare.push(n);
  return SLOTS.map((slot, i) => {
    const f = near[i];
    if (f) return { slot, number: f.room, friend: { id: f.id, name: f.name }, dnd: false };
    const number = spare.shift()!;
    return { slot, number, dnd: number % 3 === 0 };
  });
}

/** Your room's number when no holiday gave you one: on the tier's floor. */
const hotelRoomNumber = (tier: HotelTier | null | undefined) =>
  HOTEL_FLOOR[tierOf(tier)] * 100 + 16;

export interface HotelStay {
  tier?: HotelTier | null;
  name?: string | null;
  /** Your room's number (a holiday's), else the tier's floor and a room on it. */
  room?: number | null;
  /** Friends from your holiday staying here now, with their room numbers. */
  friends?: readonly { id: string; name: string; room: number }[];
}

/**
 * Round the room: a floor of the hotel's tower (the corridor along the door,
 * the neighbours' closed rooms either side and across, more floors above and
 * below, the city far below), no pool, no cars.
 */
export function hotelGrounds(plan: HomePlan, stay: HotelStay = {}): Grounds {
  const tier = tierOf(stay.tier);
  const W = plan.w;
  const H = plan.h;
  const focus = { x: 0, y: 0, w: W, h: H + 0.6 };
  const r = Math.hypot(W, H) / 2 + 2;
  const room = stay.room && stay.room > 100 ? stay.room : hotelRoomNumber(tier);
  // A holiday's room number says which floor you're on (partway up the tower).
  const floor = stay.room && stay.room > 100 ? Math.floor(room / 100) : HOTEL_FLOOR[tier];
  return {
    style: 'hotel',
    lawn: { x: W / 2, y: H / 2, r },
    pool: null,
    terrace: null,
    loungers: [],
    parasol: null,
    drive: null,
    bays: [],
    carport: null,
    hedges: [],
    gate: null,
    street: { y: H + 6, x0: -20, x1: W + 20 },
    path: { x: plan.door.x, y: H, w: 1, h: 0.3 },
    trees: [],
    pots: [],
    fountain: null,
    beds: [],
    van: { x: W + 3, y: H + 3 },
    focus,
    view: null,
    hotel: {
      tier,
      name: stay.name ?? '',
      floor,
      room,
      doors: hotelDoors(room, stay.friends),
      windows: HOTEL_WINDOWS[tier],
    },
  };
}
