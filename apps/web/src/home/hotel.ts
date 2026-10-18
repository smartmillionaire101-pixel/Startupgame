/**
 * Your hotel room abroad (player feedback: "showing the room with bathrooms
 * like the original home"): a floor plan the home scene (./HomeScene.tsx)
 * and the 3D home (../interiors3d/Home3D.tsx) draw like your own home, but
 * laid out like a hotel room and furnished by the hotel, not by you.
 *
 * - budget: a small room, a bed, a TV, a wardrobe in the entrance and a
 *   shower room off it;
 * - business: a bigger room with a desk and an armchair, a bathroom with a
 *   shower;
 * - luxury: a suite, a living room (sofa, armchair, TV, desk) and a bedroom
 *   with a king bed, a big bathroom with a tub and a dressing area.
 *
 * Every room has a window on the city (the 3D view puts the room on a roof
 * among the city's towers) and your suitcase by the bed. Pure data in tiles,
 * like ./layout.ts.
 */
import type { HotelTier } from '../city/travel';
import type { Grounds } from './grounds';
import type { Decor, FixtureId, HomeAct, HomePlan, Room, Spot } from './layout';

/** What you can do in a hotel room (the home acts the engine lets you do away from home). */
export const HOTEL_ACTS: ReadonlySet<HomeAct> = new Set(['sleep', 'nap', 'shower', 'toilet', 'tv']);

/** The room's finish by tier (the furniture's tier, 1–3). */
export const HOTEL_FINISH: Record<HotelTier, number> = { budget: 1, business: 2, luxury: 3 };

/** The tier the 3D shell is drawn at (a suite's living room is marble). */
export const HOTEL_SHELL_TIER: Record<HotelTier, number> = { budget: 2, business: 3, luxury: 5 };

/** How the tier reads under the hotel's name ("★★★★★ suite"). */
export const HOTEL_TIER_LABEL: Record<HotelTier, string> = {
  budget: '★ room',
  business: '★★★ business room',
  luxury: '★★★★★ suite',
};

const spot = (
  x: number,
  y: number,
  w: number,
  h: number,
  ix: number,
  iy: number,
  opts: { blocked?: boolean; wall?: boolean } = {},
): Spot => ({
  x,
  y,
  w,
  h,
  blocked: opts.blocked ?? !opts.wall,
  ...(opts.wall ? { wall: true } : {}),
  interact: { x: ix, y: iy },
});

const decor = (
  id: string,
  model: string,
  label: string,
  room: Decor['room'],
  at: [number, number, number, number, number, number],
  rot: number,
  tier: number,
  verbs: Decor['verbs'] = [],
): Decor => ({
  id,
  model,
  label,
  room,
  spot: { ...spot(...at), rot },
  verbs,
  tier,
});

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
      { dir: 'v', x: 4, y: 0 },
      { dir: 'v', x: 4, y: 1 },
      { dir: 'v', x: 4, y: 2 },
      // The shower room's door is the gap at x = 4.
      { dir: 'h', x: 5, y: 3 },
    ],
    slots: {
      bed: spot(1, 0, 2, 3, 3, 1),
      tv: spot(0, 4, 1, 2, 1, 4),
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
    decor: [
      decor('nightstand-1', 'nightstand', 'Bedside table', 'bedroom', [0, 0, 1, 1, 0, 1], 0, f),
      decor('suitcase', 'suitcase', 'Your suitcase', 'bedroom', [2, 3, 1, 1, 2, 4], 0, f),
    ],
  };
}

function business(f: number): Shape {
  // 8×7: the room on the left; the bathroom and the entrance on the right.
  return {
    w: 8,
    h: 7,
    rooms: [
      { id: 'bedroom', x: 0, y: 0, w: 5, h: 7 },
      { id: 'bathroom', x: 5, y: 0, w: 3, h: 4 },
      { id: 'hall', x: 5, y: 4, w: 3, h: 3 },
    ],
    walls: [
      ...[0, 1, 2, 3].map((y) => ({ dir: 'v' as const, x: 5, y })),
      // The bathroom's door is the gap at x = 6.
      { dir: 'h', x: 5, y: 4 },
      { dir: 'h', x: 7, y: 4 },
    ],
    slots: {
      bed: spot(1, 0, 2, 3, 3, 1),
      desk: spot(0, 4, 1, 2, 1, 4),
      wardrobe: spot(7, 5, 1, 2, 6, 5),
      lights: spot(0, 6, 1, 1, 1, 6),
      cooling: spot(4, 0, 1, 1, 3, 1, { wall: true }),
    },
    fixtures: {
      door: spot(6, 6, 1, 1, 6, 6, { blocked: false }),
      sink: spot(5, 0, 1, 1, 5, 1),
      shower: spot(7, 0, 1, 1, 6, 0),
      toilet: spot(7, 2, 1, 1, 6, 2),
    },
    door: { x: 6, y: 6 },
    decor: [
      decor('nightstand-1', 'nightstand', 'Bedside table', 'bedroom', [0, 0, 1, 1, 0, 1], 0, f),
      decor('nightstand-2', 'nightstand', 'Bedside table', 'bedroom', [3, 0, 1, 1, 3, 1], 0, f),
      // The TV on the bathroom wall, facing the bed.
      decor('tv', 'tv', 'TV', 'bedroom', [4, 1, 1, 2, 3, 2], 3, f, [
        { act: 'tv', label: 'Watch TV' },
      ]),
      decor('armchair', 'armchair', 'Armchair', 'bedroom', [4, 6, 1, 1, 4, 5], 2, f, [
        { act: 'nap', label: 'Put your feet up' },
      ]),
      decor('suitcase', 'suitcase', 'Your suitcase', 'bedroom', [2, 3, 1, 1, 2, 4], 0, f),
    ],
  };
}

function luxury(f: number): Shape {
  // 12×8: the living room on the left, the bedroom in the middle, the
  // bathroom (a tub and a shower) and a dressing area on the right.
  return {
    w: 12,
    h: 8,
    rooms: [
      { id: 'living', x: 0, y: 0, w: 5, h: 8 },
      { id: 'bedroom', x: 5, y: 0, w: 4, h: 8 },
      { id: 'bathroom', x: 9, y: 0, w: 3, h: 5 },
      { id: 'hall', x: 9, y: 5, w: 3, h: 3 },
    ],
    walls: [
      // Living room | bedroom, the door at y = 5.
      ...[0, 1, 2, 3, 4, 6, 7].map((y) => ({ dir: 'v' as const, x: 5, y })),
      // Bedroom | bathroom, the door at y = 2.
      ...[0, 1, 3, 4].map((y) => ({ dir: 'v' as const, x: 9, y })),
      ...[9, 10, 11].map((x) => ({ dir: 'h' as const, x, y: 5 })),
    ],
    slots: {
      tv: spot(1, 0, 3, 1, 4, 1),
      rug: spot(1, 1, 3, 2, 2, 2, { blocked: false }),
      sofa: spot(1, 3, 3, 1, 2, 4),
      desk: spot(0, 5, 1, 2, 1, 5),
      lights: spot(4, 7, 1, 1, 3, 7),
      plants: spot(0, 7, 1, 1, 1, 7),
      bed: spot(6, 0, 2, 3, 8, 1),
      wardrobe: spot(11, 5, 1, 2, 10, 6),
      cooling: spot(5, 0, 1, 1, 5, 1, { wall: true }),
    },
    fixtures: {
      door: spot(2, 7, 1, 1, 2, 7, { blocked: false }),
      sink: spot(9, 0, 1, 1, 9, 1),
      bathtub: spot(10, 0, 2, 1, 10, 1),
      shower: spot(11, 2, 1, 1, 10, 2),
      toilet: spot(11, 4, 1, 1, 10, 4),
    },
    door: { x: 2, y: 7 },
    seats: [
      { x: 2, y: 3 },
      { x: 1, y: 3 },
      { x: 3, y: 3 },
    ],
    decor: [
      decor('armchair', 'armchair', 'Armchair', 'living', [4, 3, 1, 1, 4, 4], 2, f, [
        { act: 'nap', label: 'Put your feet up' },
      ]),
      decor('coffee-table', 'coffee-table', 'Coffee table', 'living', [2, 1, 1, 1, 2, 2], 0, f),
      decor('nightstand-1', 'nightstand', 'Bedside table', 'bedroom', [5, 0, 1, 1, 5, 1], 0, f),
      decor('nightstand-2', 'nightstand', 'Bedside table', 'bedroom', [8, 0, 1, 1, 8, 1], 0, f),
      decor('suitcase', 'suitcase', 'Your suitcase', 'bedroom', [7, 3, 1, 1, 7, 4], 0, f),
    ],
  };
}

const PLANS = new Map<HotelTier, HomePlan>();

/** The room for a hotel tier (anything unknown: the budget room). */
export function hotelPlan(tier: HotelTier | null | undefined): HomePlan {
  const t: HotelTier = tier === 'business' || tier === 'luxury' ? tier : 'budget';
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
  const f = HOTEL_FINISH[tier === 'business' || tier === 'luxury' ? tier : 'budget'];
  return new Map(Object.keys(plan.slots).map((s) => [s, f]));
}

/**
 * Round the room: the hotel's roof among the city's towers (the 3D home's
 * penthouse roof without the hot tub, the loungers or a car deck).
 */
export function hotelGrounds(plan: HomePlan): Grounds {
  const W = plan.w;
  const H = plan.h;
  const focus = { x: 0, y: 0, w: W, h: H + 0.6 };
  const r = Math.hypot(W, H) / 2 + 2;
  return {
    style: 'roof',
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
  };
}
