/**
 * The home's floor plan (docs/WAVE7-IMMERSIVE.md §A): a grid that grows with
 * your lifestyle tier, four rooms, walls with door gaps, fixtures every home
 * has (a front door, a kitchenette, somewhere to sleep, a bathroom) and a
 * fixed spot with a real footprint for every furniture slot.
 *
 * Coordinates are tiles; (0,0) is the top-left floor tile under the back wall.
 */

import { overOpening, wallOpenings } from './windows';

export type RoomId =
  | 'bedroom'
  | 'bathroom'
  | 'kitchen'
  | 'living'
  | 'study'
  // Wave 12: the wing a bigger, richer home adds.
  | 'dining'
  | 'guest'
  | 'gym'
  | 'cinema'
  // A house with an upstairs: the entrance hall, the landing, a home office,
  // a balcony and (a mansion) the roof terrace.
  | 'hall'
  | 'landing'
  | 'office'
  | 'balcony'
  | 'terrace';

/**
 * Wave 12: what kind of home it is. Owners get their property's tier
 * (Homes app); renters the kind their lifestyle tier pays for.
 */
export type HomeKind =
  'room' | 'studio' | 'apartment' | 'townhouse' | 'house' | 'villa' | 'mansion' | 'penthouse';

export interface HomeSpec {
  kind: HomeKind;
  /**
   * 0 (stretched) … 3 (very rich next to the home's value): more and bigger
   * rooms, a gym and a cinema, a bigger pool and garden.
   */
  wealth: number;
}

/**
 * Wave 12: something a home of this size comes with (a guest bed, the
 * gym, the cinema, a kitchen island): drawn by `model`, used for `verbs`.
 */
export interface Decor {
  id: string;
  model: string;
  label: string;
  room: RoomId;
  /** Quarter turns: 0 faces +y (away from the back wall). */
  spot: Spot & { rot: number };
  verbs: (
    | { act: HomeAct; label: string }
    | { id: 'invite'; label: string }
    // The stairs: to another floor (an index into `floorsFor`).
    | { id: 'floor'; label: string; to: number }
  )[];
  /** Finish, 1–3. */
  tier: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Room extends Rect {
  id: RoomId;
  /** Outdoors (a balcony, a roof terrace): a glass railing, not a wall. */
  open?: boolean;
}

export type HomeAct =
  | 'sleep'
  | 'nap'
  | 'shower'
  | 'toilet'
  | 'cook'
  | 'snack'
  | 'tv'
  | 'game'
  | 'read'
  | 'work'
  | 'workout'
  | 'laundry';

export type Verb =
  | { id: string; act: HomeAct; label: string }
  | { id: 'order'; label: string }
  | { id: 'sit'; label: string }
  | { id: 'invite'; label: string }
  | { id: 'out'; label: string }
  | { id: 'buy'; label: string; slot: string }
  | { id: 'move'; label: string; move: string }
  // Sell back another one of a thing (player feedback: more than one speaker).
  | { id: 'sell'; label: string; extra: string }
  // Wave 12: take one of your cars out.
  | { id: 'car'; label: string; model: string }
  // Up or down the stairs (an index into `floorsFor`).
  | { id: 'floor'; label: string; to: number }
  // A penthouse balcony: the city's skyline, and friends over to see it.
  | { id: 'skyline'; label: string }
  | { id: 'party'; label: string };

/** Where a furniture slot (or a fixture) stands. */
export interface Spot extends Rect {
  /** Blocks walking (a rug and wall-mounted things don't). */
  blocked: boolean;
  /** Mounted on the back wall (drawn on the wall face; y is the wall). */
  wall?: boolean;
  /** The tile you stand on to use it. */
  interact: { x: number; y: number };
}

export type FixtureId =
  | 'door'
  | 'kitchenette'
  | 'mat'
  | 'cushions'
  | 'shower'
  | 'toilet'
  | 'sink'
  | 'shared-bath'
  // Wave 9: a house (tiers 4–5) has a bathtub, a study with a pool table and a piano.
  | 'bathtub'
  | 'pool'
  | 'piano';

export interface HomePlan {
  tier: number;
  w: number;
  h: number;
  rooms: Room[];
  /** Wall segments between tiles: 'h' runs along y (between y-1 and y), 'v' along x. */
  walls: { dir: 'h' | 'v'; x: number; y: number }[];
  /** Furniture slot → its spot. */
  slots: Record<string, Spot>;
  /** Fixtures every home of this tier has. */
  fixtures: Partial<Record<FixtureId, Spot>>;
  /** The front door tile (bottom edge). */
  door: { x: number; y: number };
  /** Sofa seats (guests sit here; the middle one is yours). */
  seats: { x: number; y: number }[];
  /** Wave 12: the kind of home and how rich its owner is (sizes the wing and grounds). */
  kind: HomeKind;
  wealth: number;
  /** Wave 12: the core flat's width (the wing, if any, is to its right). */
  coreW: number;
  /** Wave 12: things the bigger home comes with. */
  decor: Decor[];
  /** 0 the ground floor (the front door), 1 upstairs, 2 a mansion's roof terrace. */
  level?: number;
}

export const TIER_GRID: Record<number, { w: number; h: number }> = {
  1: { w: 8, h: 8 },
  2: { w: 10, h: 10 },
  3: { w: 12, h: 12 },
  4: { w: 14, h: 14 },
  5: { w: 16, h: 14 },
};

/** Home names by tier (translated by the caller). */
export const TIER_HOME = ['Shared room', 'Small flat', 'Good flat', 'House', 'Penthouse'] as const;

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

function sharedRoom(): HomePlan {
  const w = 8;
  const h = 8;
  return {
    tier: 1,
    w,
    h,
    rooms: [
      { id: 'bedroom', x: 0, y: 0, w: 6, h: 4 },
      { id: 'kitchen', x: 6, y: 0, w: 2, h: 5 },
      { id: 'living', x: 0, y: 4, w: 6, h: 4 },
      { id: 'bathroom', x: 6, y: 5, w: 2, h: 3 },
    ],
    // The bathroom's walls, with its door off the living room.
    walls: [
      { dir: 'h', x: 6, y: 5 },
      { dir: 'h', x: 7, y: 5 },
      { dir: 'v', x: 6, y: 5 },
      { dir: 'v', x: 6, y: 6 },
    ],
    slots: {
      bed: spot(0, 0, 2, 3, 2, 1),
      desk: spot(2, 0, 2, 1, 3, 1),
      laptop: spot(2, 0, 1, 1, 3, 1, { blocked: false }),
      wardrobe: spot(4, 0, 2, 1, 4, 1),
      lights: spot(0, 3, 1, 1, 1, 3),
      cooling: spot(0, 0, 2, 1, 2, 1, { wall: true }),
      art: spot(3, 0, 1, 1, 3, 1, { wall: true }),
      coffee: spot(7, 0, 1, 1, 6, 1),
      kitchen: spot(7, 1, 1, 2, 6, 1),
      fridge: spot(7, 3, 1, 1, 6, 3),
      sound: spot(0, 4, 1, 1, 0, 5),
      tv: spot(1, 4, 2, 1, 2, 5),
      gaming: spot(3, 4, 1, 1, 3, 5),
      books: spot(5, 4, 1, 1, 4, 4),
      washer: spot(7, 4, 1, 1, 6, 4),
      rug: spot(1, 5, 3, 1, 2, 5, { blocked: false }),
      sofa: spot(1, 6, 3, 1, 2, 5),
      dining: spot(5, 5, 1, 2, 4, 5),
      plants: spot(0, 7, 1, 1, 0, 6),
      wifi: spot(5, 2, 1, 1, 4, 2),
      power: spot(5, 1, 1, 1, 4, 1),
    },
    fixtures: {
      door: spot(1, 7, 1, 1, 1, 7, { blocked: false }),
      kitchenette: spot(7, 1, 1, 2, 6, 1),
      mat: spot(0, 0, 2, 3, 2, 1),
      cushions: spot(1, 6, 3, 1, 2, 5, { blocked: false }),
      // Even the smallest home has a bathroom of its own: a shower, a basin, a toilet.
      shower: spot(7, 5, 1, 1, 6, 5),
      sink: spot(7, 6, 1, 1, 6, 6),
      toilet: spot(7, 7, 1, 1, 6, 7),
    },
    door: { x: 1, y: 7 },
    seats: [
      { x: 2, y: 6 },
      { x: 1, y: 6 },
      { x: 3, y: 6 },
    ],
    kind: 'room',
    wealth: 1,
    coreW: w,
    decor: [],
  };
}

/** Tiers 2–5: bedroom and bathroom at the back, living room and kitchen at the front. */
function flat(tier: number): HomePlan {
  const { w: W, h: H } = TIER_GRID[tier]!;
  const T = { 2: 4, 3: 5, 4: 6, 5: 6 }[tier as 2 | 3 | 4 | 5];
  const B = Math.ceil(W * 0.55);
  const L = B;
  const ox = Math.floor((L - 6) / 2);
  const oy = Math.floor((H - T - 6) / 2);
  const bedDoor = B - 2;
  const bathDoor = B + 1;
  // Wave 9: a house splits the big bathroom: an en-suite off the bedroom at the
  // back and a study (a pool table) you reach from the living room.
  const house = tier >= 4;
  const S = 3;
  const walls: HomePlan['walls'] = [];
  for (let y = 0; y < T; y++) if (!house || y !== 1) walls.push({ dir: 'v', x: B, y });
  for (let x = 0; x < W; x++)
    if (x !== bedDoor && x !== bathDoor) walls.push({ dir: 'h', x, y: T });
  if (house) for (let x = B; x < W; x++) walls.push({ dir: 'h', x, y: S });
  const sofaY = T + 3 + oy;
  const houseFixtures: Partial<Record<FixtureId, Spot>> = house
    ? {
        bathtub: spot(W - 3, S - 1, 2, 1, W - 4, S - 1),
        pool: spot(B + 2, S + 1, 3, 2, B + 1, S + 1),
        piano: spot(L - 3, H - 3, 2, 2, L - 4, H - 2),
      }
    : {};
  return {
    tier,
    w: W,
    h: H,
    rooms: house
      ? [
          { id: 'bedroom', x: 0, y: 0, w: B, h: T },
          { id: 'bathroom', x: B, y: 0, w: W - B, h: S },
          { id: 'study', x: B, y: S, w: W - B, h: T - S },
          { id: 'living', x: 0, y: T, w: L, h: H - T },
          { id: 'kitchen', x: L, y: T, w: W - L, h: H - T },
        ]
      : [
          { id: 'bedroom', x: 0, y: 0, w: B, h: T },
          { id: 'bathroom', x: B, y: 0, w: W - B, h: T },
          { id: 'living', x: 0, y: T, w: L, h: H - T },
          { id: 'kitchen', x: L, y: T, w: W - L, h: H - T },
        ],
    walls,
    slots: {
      bed: spot(0, 0, 2, 3, 2, 1),
      desk: spot(2, 0, 2, 1, 3, 1),
      laptop: spot(2, 0, 1, 1, 3, 1, { blocked: false }),
      wardrobe: spot(B - 2, 0, 2, 1, B - 2, 1),
      lights: spot(B - 1, T - 1, 1, 1, B - 2, T - 1),
      cooling: spot(0, 0, 2, 1, 2, 1, { wall: true }),
      art: spot(4, 0, 1, 1, 3, 1, { wall: true }),
      washer: house
        ? spot(W - 1, S - 1, 1, 1, W - 1, S - 2)
        : spot(W - 1, T - 1, 1, 1, W - 2, T - 1),
      sound: spot(0, T, 1, 1, 1, T + 1),
      tv: spot(1 + ox, T, 2, 1, 2 + ox, T + 1),
      gaming: spot(3 + ox, T, 1, 1, 3 + ox, T + 1),
      books: spot(0, T + 1, 1, 2, 1, T + 2),
      rug: spot(1 + ox, T + 1 + oy, 3, 2, 2 + ox, T + 1 + oy, { blocked: false }),
      sofa: spot(1 + ox, sofaY, 3, 1, 2 + ox, sofaY - 1),
      plants: spot(0, H - 1, 1, 1, 0, H - 2),
      wifi: spot(L - 1, H - 1, 1, 1, L - 2, H - 1),
      kitchen: spot(W - 1, T + 1, 1, 2, W - 2, T + 1),
      fridge: spot(W - 1, T + 3, 1, 1, W - 2, T + 3),
      coffee: spot(W - 1, T + 4, 1, 1, W - 2, T + 4),
      dining: spot(L, T + 2, 2, 2, L, T + 4),
      power: spot(W - 1, H - 1, 1, 1, W - 2, H - 1),
    },
    fixtures: {
      door: spot(1, H - 1, 1, 1, 1, H - 1, { blocked: false }),
      kitchenette: spot(W - 1, T + 1, 1, 2, W - 2, T + 1),
      mat: spot(0, 0, 2, 3, 2, 1),
      cushions: spot(1 + ox, sofaY, 3, 1, 2 + ox, sofaY - 1, { blocked: false }),
      toilet: spot(B, 0, 1, 1, B, 1),
      sink: spot(B + 1, 0, 1, 1, B + 1, 1),
      shower: spot(W - 1, 0, 1, 1, W - 2, 0),
      ...houseFixtures,
    },
    door: { x: 1, y: H - 1 },
    seats: [
      { x: 2 + ox, y: sofaY },
      { x: 1 + ox, y: sofaY },
      { x: 3 + ox, y: sofaY },
    ],
    kind: KIND_OF_TIER[tier]!,
    wealth: 1,
    coreW: W,
    decor: [],
  };
}

/** A renter's home kind by lifestyle tier (the labels in TIER_HOME). */
export const KIND_OF_TIER: Record<number, HomeKind> = {
  1: 'room',
  2: 'apartment',
  3: 'apartment',
  4: 'house',
  5: 'penthouse',
};

/** The lifestyle tier a kind of home lives at (the size of its core flat). */
export const TIER_OF_KIND: Record<HomeKind, number> = {
  room: 1,
  studio: 1,
  apartment: 2,
  townhouse: 3,
  house: 4,
  villa: 4,
  penthouse: 4,
  mansion: 5,
};

/** The wing's rooms in the back and front bands, with their widths in tiles. */
interface Wing {
  back: RoomId[];
  front: RoomId[];
  bw: number[];
  fw: number[];
}

function wingOf(kind: HomeKind, wealth: number): Wing | null {
  const rich = wealth >= 2;
  const one = (w: number): Wing => ({ back: ['guest'], front: ['dining'], bw: [w], fw: [w] });
  const four = (bw: number[], fw: number[]): Wing => ({
    back: bw.length === 3 ? ['guest', 'guest', 'gym'] : ['guest', 'gym'],
    front: ['dining', 'cinema'],
    bw,
    fw,
  });
  switch (kind) {
    case 'room':
    case 'studio':
      return null;
    case 'apartment':
      return rich ? one(4) : null;
    case 'townhouse':
      return one(rich ? 5 : 4);
    case 'house':
      return one(5);
    case 'penthouse':
      return rich ? four([5, 4], [5, 4]) : one(5);
    case 'villa':
      if (wealth >= 3) return four([5, 5], [5, 5]);
      if (rich) return four([5, 4], [5, 4]);
      return one(wealth >= 1 ? 6 : 5);
    case 'mansion':
      if (wealth >= 3) return four([5, 5, 5], [8, 7]);
      if (rich) return four([4, 4, 5], [7, 6]);
      if (wealth >= 1)
        return { back: ['guest', 'guest'], front: ['dining', 'cinema'], bw: [5, 5], fw: [6, 4] };
      return { back: ['guest', 'guest'], front: ['dining'], bw: [4, 4], fw: [8] };
  }
}

/** Finish of what a home comes with (1–3), from its kind and the owner's wealth. */
function finishOf(kind: HomeKind, wealth: number): number {
  const base = kind === 'villa' || kind === 'mansion' || kind === 'penthouse' ? 2 : 1;
  return Math.max(1, Math.min(3, base + (wealth >= 2 ? 1 : 0)));
}

const dspot = (
  x: number,
  y: number,
  w: number,
  h: number,
  ix: number,
  iy: number,
  rot = 0,
  blocked = true,
): Spot & { rot: number } => ({ x, y, w, h, blocked, interact: { x: ix, y: iy }, rot });

/**
 * Wave 12: the core flat plus a wing to its right for a bigger home (guest
 * bedrooms, a dining room, a gym, a cinema) and a kitchen island. The
 * kitchen opens into the dining room through a door by the front wall; each
 * back room opens into the front room below it.
 */
function extend(core: HomePlan, spec: HomeSpec): HomePlan {
  const tier = core.tier;
  const wealth = Math.max(0, Math.min(3, Math.round(spec.wealth)));
  const base: HomePlan = { ...core, kind: spec.kind, wealth };
  const wing = tier === 1 ? null : wingOf(spec.kind, wealth);
  if (!wing) return base;
  const W0 = core.w;
  const H = core.h;
  const T = { 2: 4, 3: 5, 4: 6, 5: 6 }[tier as 2 | 3 | 4 | 5];
  const L = Math.ceil(W0 * 0.55);
  const finish = finishOf(spec.kind, wealth);
  const decor: Decor[] = [];
  const slots = { ...core.slots };
  const walls = [...core.walls];
  const rooms = [...core.rooms];
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const W = W0 + Math.max(sum(wing.bw), sum(wing.fw));
  // The core's right wall becomes an inner wall, open by the front wall.
  for (let y = 0; y < H - 1; y++) walls.push({ dir: 'v', x: W0, y });
  // Backup power moves from that corner to the wing's.
  slots.power = spot(W - 1, H - 1, 1, 1, W - 2, H - 1);
  const band = (ids: RoomId[], ws: number[], y: number, h: number) => {
    let x = W0;
    return ids.map((id, i) => {
      const w = i === ids.length - 1 ? W - x : ws[i]!;
      const r: Room = { id, x, y, w, h };
      x += w;
      return r;
    });
  };
  const back = band(wing.back, wing.bw, 0, T);
  const front = band(wing.front, wing.fw, T, H - T);
  rooms.push(...back, ...front);
  // Between the bands: a door from each back room into the room below it.
  const doors = new Set(back.map((r) => r.x + 1));
  for (let x = W0; x < W; x++) if (!doors.has(x)) walls.push({ dir: 'h', x, y: T });
  // Between rooms in a band: walls (the front band's open just below the back rooms).
  for (const r of back.slice(1)) for (let y = 0; y < T; y++) walls.push({ dir: 'v', x: r.x, y });
  for (const r of front.slice(1))
    for (let y = T; y < H; y++) if (y !== T + 1) walls.push({ dir: 'v', x: r.x, y });

  // A kitchen island with bar stools (the dining table has moved to its own room).
  if (W0 - L >= 4)
    decor.push({
      id: 'island',
      model: 'island',
      label: 'Kitchen island',
      room: 'kitchen',
      spot: dspot(L + 1, T + 2, 2, 1, L + 1, T + 3),
      verbs: [
        { act: 'snack', label: 'Snack' },
        { act: 'cook', label: 'Cook' },
      ],
      tier: finish,
    });
  let guests = 0;
  for (const r of back) {
    if (r.id === 'guest') {
      guests++;
      const bx = r.x + Math.max(1, Math.floor((r.w - 2) / 2));
      const ix = bx + 2 < r.x + r.w ? bx + 2 : bx - 1;
      decor.push({
        id: `guest-bed-${guests}`,
        model: 'guest-bed',
        label: 'Guest bed',
        room: 'guest',
        spot: dspot(bx, 0, 2, 3, ix, 1),
        verbs: [
          { act: 'sleep', label: 'Sleep' },
          { act: 'nap', label: 'Nap' },
        ],
        tier: finish,
      });
      if (r.w >= 5 && T >= 5)
        decor.push({
          id: `guest-wardrobe-${guests}`,
          model: 'wardrobe',
          label: 'Wardrobe',
          room: 'guest',
          spot: dspot(r.x + r.w - 1, T - 3, 1, 2, r.x + r.w - 2, T - 2, 3),
          verbs: [{ act: 'nap', label: 'Change and rest' }],
          tier: finish,
        });
    } else if (r.id === 'gym') {
      decor.push({
        id: 'treadmill',
        model: 'treadmill',
        label: 'Treadmill',
        room: 'gym',
        spot: dspot(r.x + r.w - 1, 0, 1, 2, r.x + r.w - 1, 2),
        verbs: [{ act: 'workout', label: 'Run' }],
        tier: finish,
      });
      decor.push({
        id: 'weights',
        model: 'weight-rack',
        label: 'Weights',
        room: 'gym',
        spot: dspot(r.x + 1, 0, 2, 1, r.x + 2, 1),
        verbs: [{ act: 'workout', label: 'Lift' }],
        tier: finish,
      });
    }
  }
  for (const r of front) {
    if (r.id === 'dining') {
      // The dining table moves in here: a long table in the middle of the room.
      const tw = Math.min(4, r.w - 2);
      const tx = r.x + Math.floor((r.w - tw) / 2);
      const ty = r.y + Math.max(2, Math.floor((r.h - 2) / 2));
      slots.dining = spot(tx, ty, tw, 2, tx, ty + 2);
      if (wealth >= 1 || tier >= 4)
        decor.push({
          id: 'bar',
          model: 'bar-counter',
          label: 'Bar',
          room: 'dining',
          spot: dspot(r.x + 1, H - 1, Math.min(3, r.w - 3), 1, r.x + 1, H - 2, 2),
          verbs: [{ act: 'snack', label: 'Mix a drink' }],
          tier: finish,
        });
    } else if (r.id === 'cinema') {
      // The screen hangs on the back wall (it doesn't block the door below it).
      decor.push({
        id: 'cinema-screen',
        model: 'screen-wall',
        label: 'Cinema screen',
        room: 'cinema',
        spot: dspot(r.x + 1, r.y, r.w - 2, 1, r.x + 1, r.y + 2, 0, false),
        verbs: [{ act: 'tv', label: 'Watch a film' }],
        tier: finish,
      });
      decor.push({
        id: 'cinema-seats',
        model: 'cinema-seats',
        label: 'Cinema seats',
        room: 'cinema',
        spot: dspot(r.x + 1, r.y + 3, r.w - 2, 1, r.x + 1, r.y + 2, 2),
        verbs: [
          { act: 'tv', label: 'Watch a film' },
          { id: 'invite', label: 'Invite friend' },
        ],
        tier: finish,
      });
    }
  }
  return { ...base, w: W, rooms, walls, slots, decor };
}

const PLANS = new Map<string, HomePlan>();

/**
 * The floor plan for a lifestyle tier. Wave 12: sized for the kind of home
 * and the owner's wealth; without a spec, the renter's flat of that tier.
 */
export function planFor(tier: number, spec?: HomeSpec): HomePlan {
  const t = Math.max(1, Math.min(5, Math.round(tier) || 1));
  const wealth = spec ? Math.max(0, Math.min(3, Math.round(spec.wealth) || 0)) : 1;
  const k = spec ? `${t}:${spec.kind}:${wealth}` : `${t}`;
  let p = PLANS.get(k);
  if (!p) {
    const core = t === 1 ? sharedRoom() : flat(t);
    p = spec ? extend(core, { kind: spec.kind, wealth }) : core;
    p = withRoomSlots(clearOfWindows(withFittedCounter(p)));
    PLANS.set(k, p);
  }
  return p;
}

/**
 * Wave 12: the home kind and wealth band for the home you live in. Owners:
 * their property's tier and the band the server sends; renters: the kind
 * their lifestyle tier pays for.
 */
export function homeSpecOf(
  residence: { tier?: string; wealth?: number } | null | undefined,
  lifestyleTier: number,
): HomeSpec {
  const kinds: HomeKind[] = ['studio', 'apartment', 'townhouse', 'villa', 'mansion', 'penthouse'];
  const kind = residence?.tier as HomeKind | undefined;
  if (kind && kinds.includes(kind))
    return { kind, wealth: typeof residence?.wealth === 'number' ? residence.wealth : 1 };
  // A renter's band follows the tier: Comfortable's good flat is roomier and
  // better fitted than Modest's small flat (a guest room and a dining room).
  const t = Math.max(1, Math.min(5, lifestyleTier));
  return { kind: KIND_OF_TIER[t]!, wealth: t === 3 ? 2 : 1 };
}

/**
 * A fitted kitchen's worktop and sink along the kitchen's back wall, meeting
 * the hob and the fridge in an L (player feedback: the kitchen "looks weird",
 * a lone hob by a big empty floor). Homes from an apartment up; only where
 * the wall is free (never across a doorway or something else).
 */
function withFittedCounter(p: HomePlan): HomePlan {
  if (p.kind === 'room' || p.kind === 'studio') return p;
  const r = p.rooms.find((x) => x.id === 'kitchen');
  if (!r || r.w < 5) return p;
  const x0 = r.x + 3;
  const w = r.x + r.w - x0;
  const y = r.y;
  const taken = (x: number, ty = y) =>
    [...Object.values(p.slots), ...Object.values(p.fixtures), ...p.decor.map((d) => d.spot)].some(
      (s) => !!s && x >= s.x && x < s.x + s.w && ty >= s.y && ty < s.y + s.h,
    );
  const walled = (x: number) => p.walls.some((s) => s.dir === 'h' && s.x === x && s.y === y);
  for (let x = x0; x < x0 + w; x++) if (taken(x) || !walled(x)) return p;
  // Where you stand to use it: a free tile in front of the run.
  let ix = -1;
  for (let x = x0; x < x0 + w && ix < 0; x++) if (!taken(x, y + 1)) ix = x;
  if (ix < 0) return p;
  const finish = builtIns(p).get('kitchen') ?? 2;
  return {
    ...p,
    decor: [
      ...p.decor,
      {
        id: 'kitchen-counter',
        model: 'kitchen-counter',
        label: 'Kitchen',
        room: 'kitchen',
        spot: { x: x0, y, w, h: 1, blocked: true, interact: { x: ix, y: y + 1 }, rot: 0 },
        verbs: [
          { act: 'cook', label: 'Cook' },
          { act: 'snack', label: 'Snack' },
        ],
        tier: finish,
      },
    ],
  };
}

/**
 * What a home comes with before you furnish it (player feedback: "despite
 * living in affluence I have no kitchen at all… I need the full kitchen
 * including utility"): from an apartment up, a fitted kitchen and a fridge;
 * from a townhouse up, a utility room's washer-dryer too. Better homes come
 * better fitted (a chef's kitchen in a mansion or a penthouse, or any home
 * of a rich owner). Furniture you buy can still upgrade them.
 *
 * Player feedback: a Modest flat looked no better than Lean's room. A room
 * in a shared flat comes bare; a small flat with its kitchen, fridge and a
 * ceiling light; a good flat (Comfortable, or a rich owner's apartment) also
 * with air conditioning, a washer-dryer and better lights.
 */
function builtIns(plan: Pick<HomePlan, 'kind' | 'wealth' | 'tier'>): Map<string, number> {
  const out = new Map<string, number>();
  if (plan.kind === 'room' || plan.kind === 'studio') return out;
  const grand = plan.kind === 'mansion' || plan.kind === 'penthouse' || plan.wealth >= 3;
  const finish = grand ? 3 : 2;
  out.set('kitchen', finish);
  out.set('fridge', finish);
  if (plan.kind !== 'apartment') {
    out.set('washer', finish);
    return out;
  }
  const good = plan.tier >= 3 || plan.wealth >= 2;
  out.set('lights', good ? 2 : 1);
  if (good) {
    out.set('washer', 2);
    out.set('cooling', 2);
  }
  return out;
}

/** What you own, with what the home comes with filled in (the better of the two). */
export function withBuiltIns(
  plan: Pick<HomePlan, 'kind' | 'wealth' | 'tier' | 'slots'>,
  owned: ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map(owned);
  for (const [slot, tier] of builtIns(plan))
    if (plan.slots[slot] && (out.get(slot) ?? 0) < tier) out.set(slot, tier);
  return out;
}

export const key = (x: number, y: number) => `${x},${y}`;

/** Blocked tiles given what you own (unowned slots are empty floor). */
export function blockedTiles(plan: HomePlan, owned: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  const add = (s: Spot) => {
    if (!s.blocked || s.wall) return;
    for (let x = s.x; x < s.x + s.w; x++) for (let y = s.y; y < s.y + s.h; y++) out.add(key(x, y));
  };
  for (const [slot, s] of Object.entries(plan.slots)) if (owned.has(slot)) add(s);
  const f = plan.fixtures;
  if (f.kitchenette && !owned.has('kitchen')) add(f.kitchenette);
  if (f.mat && !owned.has('bed')) add(f.mat);
  for (const id of ['toilet', 'sink', 'shower', 'bathtub', 'pool', 'piano'] as const)
    if (f[id]) add(f[id]!);
  for (const d of plan.decor) add(d.spot);
  return out;
}

/** Wall edges as "x,y|x2,y2" pairs (both directions). */
export function wallEdges(plan: HomePlan): Set<string> {
  const out = new Set<string>();
  for (const s of plan.walls) {
    const [a, b] =
      s.dir === 'h' ? [key(s.x, s.y - 1), key(s.x, s.y)] : [key(s.x - 1, s.y), key(s.x, s.y)];
    out.add(`${a}|${b}`);
    out.add(`${b}|${a}`);
  }
  return out;
}

export const roomAt = (plan: HomePlan, x: number, y: number): RoomId | null =>
  plan.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)?.id ?? null;

/**
 * Playtest #40: a picture's own spot (and the AC's) clear of the windows and
 * the front door: one that would hang over one moves along its wall to the
 * nearest clear tile (with a free tile in front to use it from).
 */
function clearOfWindows(plan: HomePlan): HomePlan {
  const openings = wallOpenings(plan);
  const blocked = blockedTiles(plan, new Set(Object.keys(plan.slots)));
  let slots: HomePlan['slots'] | null = null;
  for (const [k, s] of Object.entries(plan.slots)) {
    if (!s.wall || s.h !== 1) continue;
    const rot = s.y === 0 ? 0 : s.x === 0 ? 1 : s.x + s.w === plan.w ? 3 : 2;
    const [ax, ay] = rot % 2 === 0 ? [1, 0] : [0, 1];
    const [fx, fy] = (
      [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ] as const
    )[rot]!;
    const over = (x: number, y: number) => {
      for (let i = 0; i < s.w; i++) {
        const tx = x + i * ax;
        const ty = y + i * ay;
        if (overOpening(plan, tx, ty, rot, openings)) return true;
        if (tx === plan.door.x && ty === plan.door.y) return true;
      }
      return false;
    };
    if (!over(s.x, s.y)) continue;
    // Another thing on a wall on one of its tiles.
    const taken = (x: number, y: number) =>
      Object.entries(slots ?? plan.slots).some(([o, t]) => {
        if (o === k || !t.wall) return false;
        for (let i = 0; i < s.w; i++) {
          const tx = x + i * ax;
          const ty = y + i * ay;
          if (tx >= t.x && tx < t.x + t.w && ty >= t.y && ty < t.y + t.h) return true;
        }
        return false;
      });
    const fits = (x: number, y: number) => {
      const ix = x + fx;
      const iy = y + fy;
      if (x < 0 || y < 0 || x + (s.w - 1) * ax >= plan.w || y + (s.w - 1) * ay >= plan.h)
        return false;
      if (ix < 0 || iy < 0 || ix >= plan.w || iy >= plan.h || blocked.has(key(ix, iy)))
        return false;
      const room = plan.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      return !!room && !room.open && !over(x, y) && !taken(x, y);
    };
    for (let d = 1; d < plan.w + plan.h; d++) {
      const hit = [1, -1]
        .map((sg) => ({ x: s.x + sg * d * ax, y: s.y + sg * d * ay }))
        .find((t) => fits(t.x, t.y));
      if (!hit) continue;
      slots ??= { ...plan.slots };
      slots[k] = { ...s, x: hit.x, y: hit.y, interact: { x: hit.x + fx, y: hit.y + fy } };
      break;
    }
  }
  return slots ? { ...plan, slots } : plan;
}

// ---------------------------------------------------------------------------
// Round 7: the bathroom and the hallway (engine ROOM_SLOTS).

interface RoomSlotSpec {
  /** The rooms it goes in, the first that has room for it. */
  rooms: RoomId[];
  /** Footprints to try (tiles along x, along y), the first that fits. */
  sizes: [number, number][];
  /** Hung on a wall (a mirror, a towel rail). */
  wall?: boolean;
  /** Walked over (a mat, a runner): it may lie where you stand to use things. */
  flat?: boolean;
  /** Where in the room it goes nearest to: the front door, or the room's sink. */
  near?: 'door' | 'sink';
}

const HALLWAY: RoomId[] = ['hall', 'living'];

/**
 * Where round 7's bathroom and hallway things go: in the bathroom (a hamper
 * or a plant that doesn't fit there goes to the bedroom or the living room),
 * and in the hall, or by the front door where a home has no hall. A room in
 * a shared flat has no room for some of them (Buy mode doesn't offer those).
 */
export const ROOM_SLOT_SPECS: Record<string, RoomSlotSpec> = {
  // What stands on the floor first, then what hangs on a wall, then what you walk on.
  hamper: { rooms: ['bathroom', 'bedroom', 'landing'], sizes: [[1, 1]] },
  bathplant: { rooms: ['bathroom', 'living', 'bedroom'], sizes: [[1, 1]] },
  shoes: { rooms: HALLWAY, sizes: [[1, 1]], near: 'door' },
  coats: { rooms: HALLWAY, sizes: [[1, 1]], near: 'door' },
  console: {
    rooms: HALLWAY,
    sizes: [
      [2, 1],
      [1, 1],
    ],
    near: 'door',
  },
  cabinet: { rooms: ['bathroom'], sizes: [[1, 1]], wall: true, near: 'sink' },
  towels: { rooms: ['bathroom'], sizes: [[1, 1]], wall: true },
  hallmirror: { rooms: HALLWAY, sizes: [[1, 1]], wall: true, near: 'door' },
  bathmat: { rooms: ['bathroom'], sizes: [[1, 1]], flat: true },
  runner: {
    rooms: HALLWAY,
    sizes: [
      [2, 1],
      [1, 1],
    ],
    flat: true,
    near: 'door',
  },
};

/** The way each quarter turn faces, in tiles: 0 is +y (away from the back wall), 1 is +x. */
const FACE: readonly [number, number][] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/** The tiles you can walk to from the door (4-way, round the walls). */
function walkableFrom(
  plan: HomePlan,
  blocked: ReadonlySet<string>,
  walls: ReadonlySet<string>,
): Set<string> {
  const seen = new Set<string>([key(plan.door.x, plan.door.y)]);
  const queue = [plan.door];
  while (queue.length) {
    const t = queue.shift()!;
    for (const [dx, dy] of FACE) {
      const x = t.x + dx;
      const y = t.y + dy;
      const k = key(x, y);
      if (x < 0 || y < 0 || x >= plan.w || y >= plan.h || seen.has(k) || blocked.has(k)) continue;
      if (walls.has(`${key(t.x, t.y)}|${k}`)) continue;
      seen.add(k);
      queue.push({ x, y });
    }
  }
  return seen;
}

/** A free tile beside a thing that you can walk to (Buy mode's "use it from here"). */
function besideOk(sp: Spot, seen: ReadonlySet<string>): boolean {
  for (let x = sp.x; x < sp.x + sp.w; x++)
    if (seen.has(key(x, sp.y - 1)) || seen.has(key(x, sp.y + sp.h))) return true;
  for (let y = sp.y; y < sp.y + sp.h; y++)
    if (seen.has(key(sp.x - 1, y)) || seen.has(key(sp.x + sp.w, y))) return true;
  return false;
}

/**
 * Round 7: a spot for each bathroom and hallway thing on this floor: against
 * a wall of its room (hung on one, for a mirror), clear of everything else
 * and of where you stand to use it, never over a window or the front door,
 * with everything still reachable from the door with all of it owned. A
 * thing with no room for it on this floor gets no spot here.
 */
function withRoomSlots(plan: HomePlan): HomePlan {
  if (!plan.rooms.some((r) => r.id === 'bathroom' || r.id === 'hall' || r.id === 'living'))
    return plan;
  const slots: Record<string, Spot> = { ...plan.slots };
  const walls = wallEdges(plan);
  const openings = wallOpenings(plan);
  const roomOf = (x: number, y: number) =>
    plan.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  /** A wall right behind tile (x, y) facing `rot` (an outer one, an inner one, the floor's edge). */
  const wallAt = (x: number, y: number, rot: number) => {
    const [fx, fy] = FACE[rot]!;
    const bx = x - fx;
    const by = y - fy;
    if (bx < 0 || by < 0 || bx >= plan.w || by >= plan.h || !roomOf(bx, by)) return true;
    return walls.has(`${key(x, y)}|${key(bx, by)}`);
  };
  for (const [slot, spec] of Object.entries(ROOM_SLOT_SPECS)) {
    if (slots[slot]) continue;
    const current: HomePlan = { ...plan, slots };
    const all = new Set(Object.keys(slots));
    const blocked = blockedTiles(current, all);
    // Where things stand (owned or not), and where you stand to use them.
    const taken = new Set<string>();
    const uses = new Set<string>();
    const mark = (sp: Spot, floorToo: boolean) => {
      if (floorToo)
        for (let x = sp.x; x < sp.x + sp.w; x++)
          for (let y = sp.y; y < sp.y + sp.h; y++) taken.add(key(x, y));
      uses.add(key(sp.interact.x, sp.interact.y));
    };
    for (const sp of Object.values(slots) as (Spot & { rot?: number })[]) {
      mark(sp, !sp.wall);
      // And the tile in front of it as it faces (Buy mode moves it from there).
      const r = sp.rot ?? 0;
      uses.add(
        key(
          sp.x + (r === 1 ? sp.w : r === 3 ? -1 : Math.floor((sp.w - 1) / 2)),
          sp.y + (r === 0 ? sp.h : r === 2 ? -1 : Math.floor((sp.h - 1) / 2)),
        ),
      );
    }
    for (const sp of Object.values(plan.fixtures)) if (sp) mark(sp, true);
    for (const d of plan.decor) mark(d.spot, true);
    const onWall = Object.values(slots).filter((sp) => sp.wall) as (Spot & { rot?: number })[];
    const others = [
      ...Object.values(slots).map((sp) => sp.interact),
      ...Object.values(plan.fixtures).map((sp) => sp!.interact),
      ...plan.decor.map((d) => d.spot.interact),
    ];
    const door = key(plan.door.x, plan.door.y);
    let found: (Spot & { rot: number }) | null = null;
    for (const id of spec.rooms) {
      const rooms = plan.rooms.filter((r) => r.id === id && !r.open);
      if (!rooms.length) continue;
      const anchor =
        spec.near === 'door'
          ? plan.door
          : spec.near === 'sink' && plan.fixtures.sink
            ? plan.fixtures.sink
            : null;
      const tries: { x: number; y: number; w: number; h: number; rot: number; d: number }[] = [];
      for (const r of rooms)
        for (const [w, h] of spec.sizes)
          for (let y = r.y; y + h <= r.y + r.h; y++)
            for (let x = r.x; x + w <= r.x + r.w; x++)
              for (let rot = 0; rot < 4; rot++) {
                // A long thing lies along its wall (its footprint as it faces: rot 0 or 2).
                if (w !== h && rot % 2 === 1) continue;
                const cx = anchor ? anchor.x : r.x + r.w / 2;
                const cy = anchor ? anchor.y : r.y + r.h / 2;
                // The first footprint wherever it fits, then the smaller one.
                const d = Math.abs(x - cx) + Math.abs(y - cy) + rot * 0.01;
                tries.push({ x, y, w, h, rot, d: spec.sizes[0]![0] === w ? d : d + 1000 });
              }
      tries.sort((a, z) => a.d - z.d);
      // Against a wall if it can be; free-standing (not on a wall) where the room has no room left.
      const passes = spec.wall ? [true] : [true, false];
      for (const t of passes.flatMap((wallOnly) => tries.map((x) => ({ ...x, wallOnly })))) {
        // Its back to a wall along its whole length.
        let backed = true;
        for (let i = 0; i < t.w && backed; i++)
          for (let j = 0; j < t.h && backed; j++) {
            const x = t.x + i;
            const y = t.y + j;
            const edge =
              (t.rot === 0 && j === 0) ||
              (t.rot === 2 && j === t.h - 1) ||
              (t.rot === 1 && i === 0) ||
              (t.rot === 3 && i === t.w - 1);
            if (edge && !wallAt(x, y, t.rot)) backed = false;
          }
        if (!backed && t.wallOnly) continue;
        const tiles: string[] = [];
        let ok = true;
        for (let i = 0; i < t.w && ok; i++)
          for (let j = 0; j < t.h && ok; j++) {
            const x = t.x + i;
            const y = t.y + j;
            const k = key(x, y);
            if (roomOf(x, y)?.id !== id || k === door) ok = false;
            else if (taken.has(k) || (!spec.wall && !spec.flat && uses.has(k))) ok = false;
            tiles.push(k);
          }
        if (!ok) continue;
        // No wall runs through it.
        if (
          t.w > 1 &&
          plan.walls.some((wl) => wl.dir === 'v' && wl.x > t.x && wl.x < t.x + t.w && wl.y === t.y)
        )
          continue;
        // Where you stand to use it: in front, in the same room, free.
        const ix = t.x + (t.rot === 1 ? t.w : t.rot === 3 ? -1 : Math.floor((t.w - 1) / 2));
        const iy = t.y + (t.rot === 0 ? t.h : t.rot === 2 ? -1 : Math.floor((t.h - 1) / 2));
        const ik = key(ix, iy);
        if (roomOf(ix, iy)?.id !== id || blocked.has(ik) || tiles.includes(ik)) continue;
        if (!spec.wall && !spec.flat && taken.has(ik)) continue;
        if (spec.wall) {
          if (overOpening(plan, t.x, t.y, t.rot, openings)) continue;
          // Not over another thing hung there, facing the same way.
          if (
            onWall.some(
              (o) =>
                t.x >= o.x &&
                t.x < o.x + o.w &&
                t.y >= o.y &&
                t.y < o.y + o.h &&
                (o.rot ?? (o.y === 0 ? 0 : o.x === 0 ? 1 : o.x + o.w === plan.w ? 3 : 2)) === t.rot,
            )
          )
            continue;
        }
        const sp: Spot & { rot: number } = {
          x: t.x,
          y: t.y,
          w: t.w,
          h: t.h,
          blocked: !spec.wall && !spec.flat,
          ...(spec.wall ? { wall: true } : {}),
          interact: { x: ix, y: iy },
          rot: t.rot,
        };
        // Everything stays reachable from the door, with this and everything else owned,
        // and every thing keeps a free tile beside it to be used (and moved) from.
        const b = new Set(blocked);
        if (sp.blocked) for (const k of tiles) b.add(k);
        const seen = walkableFrom(plan, b, walls);
        if (![...others, sp.interact].every((x) => seen.has(key(x.x, x.y)))) continue;
        if (
          sp.blocked &&
          ![...Object.values(slots), sp].every((o) => o.wall || !o.blocked || besideOk(o, seen))
        )
          continue;
        found = sp;
        break;
      }
      if (found) break;
    }
    if (found) slots[slot] = found;
  }
  return { ...plan, slots };
}

/** The floor without round 7's bathroom and hallway spots (a world that doesn't sell them). */
export function withoutRoomSlots(plan: HomePlan): HomePlan {
  if (!Object.keys(ROOM_SLOT_SPECS).some((k) => plan.slots[k])) return plan;
  const slots = { ...plan.slots };
  for (const k of Object.keys(ROOM_SLOT_SPECS)) delete slots[k];
  return { ...plan, slots };
}

// ---------------------------------------------------------------------------
// Floors: a house has an upstairs, a mansion a roof terrace too.

/** How many floors a kind of home has (the rest are one floor). */
const STOREYS: Partial<Record<HomeKind, number>> = {
  townhouse: 2,
  house: 2,
  villa: 2,
  mansion: 3,
};
/** The bedroom things that move upstairs (the AC and the art stay in the hall). */
const UPSTAIRS = ['bed', 'desk', 'laptop', 'wardrobe', 'lights'] as const;

/** The staircase's depth in tiles: three of steps and the top step at the back. */
const STAIR_ROWS = 4;

const FLOORS = new Map<string, HomePlan[]>();

/**
 * The floors of a home, the ground floor (with the front door) first. A
 * townhouse, a house and a villa have an upstairs; a mansion an upstairs and a
 * roof terrace. Downstairs: an entrance hall open to the living room with the
 * (grand) staircase, the guest bathroom, the kitchen, a home office, the
 * dining room and the cinema. Upstairs: a landing over the stairs, the master
 * bedroom with its en-suite, the family bathroom, bedrooms and a balcony along
 * the front. Every other home is the one floor `planFor` gives.
 */
export function floorsFor(tier: number, spec?: HomeSpec): HomePlan[] {
  const ground = planFor(tier, spec);
  const n = spec && ground.tier >= 3 ? (STOREYS[ground.kind] ?? 1) : 1;
  if (n < 2) return [ground];
  const k = `${ground.tier}:${ground.kind}:${ground.wealth}`;
  let out = FLOORS.get(k);
  if (!out) {
    const g = geometry(ground);
    out = [groundFloor(ground, g), upperFloor(ground, g, n)];
    if (n >= 3) out.push(roofFloor(ground, g));
    out = out.map(clearOfWindows);
    // The bathroom and hallway things go where this floor's rooms are (the hall downstairs).
    out[0] = withRoomSlots(out[0]!);
    FLOORS.set(k, out);
  }
  return out;
}

interface Geometry {
  W: number;
  W0: number;
  H: number;
  T: number;
  B: number;
  /** The staircase's left edge and width. */
  sx: number;
  sw: number;
  /** The wing's back and front rooms on the ground floor, left to right. */
  back: Room[];
  front: Room[];
}

function geometry(p: HomePlan): Geometry {
  const W0 = p.coreW;
  const T = { 2: 4, 3: 5, 4: 6, 5: 6 }[p.tier as 2 | 3 | 4 | 5];
  const B = Math.ceil(W0 * 0.55);
  const sw = p.kind === 'villa' || p.kind === 'mansion' ? 3 : 2;
  const wing = p.rooms.filter((r) => r.x >= W0).sort((a, b) => a.x - b.x);
  return {
    W: p.w,
    W0,
    H: p.h,
    T,
    B,
    sx: Math.floor((B - sw) / 2),
    sw,
    back: wing.filter((r) => r.y === 0),
    front: wing.filter((r) => r.y === T),
  };
}

/**
 * A flight of stairs up the back wall (the foot at the front, the top step
 * against the wall), or upstairs the well over it: you step off at the top.
 */
function stairs(
  id: string,
  x: number,
  w: number,
  rows: number,
  down: boolean,
  verbs: Decor['verbs'],
): Decor {
  const cx = x + Math.floor(w / 2);
  return {
    id,
    model: down ? 'stairwell' : 'stairs',
    label: 'Stairs',
    room: 'hall',
    spot: down ? dspot(x, 1, w, rows - 1, cx, 0) : dspot(x, 0, w, rows, cx, rows),
    verbs,
    tier: 2,
  };
}

const inside = (s: Rect, r: Rect) => s.x >= r.x && s.x < r.x + r.w && s.y >= r.y && s.y < r.y + r.h;

function groundFloor(p: HomePlan, g: Geometry): HomePlan {
  const { W0, T, B, sx, sw } = g;
  let office: Room | null = null;
  const rooms = p.rooms.map((r): Room => {
    if (r.id === 'bedroom' && r.x === 0 && r.y === 0) return { ...r, id: 'hall' };
    if (!office && r.id === 'guest' && r.x >= W0 && r.y === 0) {
      office = { ...r, id: 'office' };
      return office;
    }
    return r;
  });
  const slots = { ...p.slots };
  for (const s of UPSTAIRS) delete slots[s];
  for (const s of Object.keys(ROOM_SLOT_SPECS)) delete slots[s];
  // The art hangs in the hall beside the stairs; the AC is reached from the side of them.
  slots.art = spot(B - 2, 0, 1, 1, B - 2, 1, { wall: true });
  slots.cooling = spot(0, 0, 2, 1, Math.min(1, sx - 1), 1, { wall: true });
  const fixtures = { ...p.fixtures };
  delete fixtures.mat;
  // The hall opens into the living room.
  const walls = p.walls.filter((w) => !(w.dir === 'h' && w.y === T && w.x < B));
  const o = office as Room | null;
  const decor = p.decor.filter((d) => !o || !inside(d.spot, o));
  const finish = finishOf(p.kind, p.wealth);
  if (o)
    decor.push(
      {
        id: 'office-desk',
        model: 'office-desk',
        label: 'Home office',
        room: 'office',
        spot: dspot(o.x + 1, 0, 2, 1, o.x + 2, 1),
        verbs: [
          { act: 'work', label: 'Work' },
          { act: 'read', label: 'Read' },
        ],
        tier: finish,
      },
      {
        id: 'office-shelves',
        model: 'shelves',
        label: 'Bookshelf',
        room: 'office',
        spot: dspot(o.x + o.w - 1, 0, 1, 1, o.x + o.w - 1, 1),
        verbs: [{ act: 'read', label: 'Read' }],
        tier: finish,
      },
    );
  decor.push(
    stairs('stairs-up', sx, sw, STAIR_ROWS, false, [{ id: 'floor', label: 'Go upstairs', to: 1 }]),
  );
  return { ...p, rooms, slots, fixtures, walls, decor, level: 0 };
}

function upperFloor(p: HomePlan, g: Geometry, n: number): HomePlan {
  const { W, W0, H, T, B, sx, sw } = g;
  const L = B;
  const BAL = 3;
  const finish = finishOf(p.kind, p.wealth);
  const back = g.back.map((r): Room => ({ id: 'guest', x: r.x, y: 0, w: r.w, h: T - 1 }));
  const front = g.front.map((r): Room => ({ id: 'guest', x: r.x, y: T, w: r.w, h: H - T - BAL }));
  const balcony: Room | null =
    W > W0 ? { id: 'balcony', x: W0, y: H - BAL, w: W - W0, h: BAL, open: true } : null;
  const rooms: Room[] = [
    { id: 'landing', x: 0, y: 0, w: B, h: T },
    // A corridor along the back rooms.
    { id: 'landing', x: B, y: T - 1, w: W - B, h: 1 },
    { id: 'bathroom', x: B, y: 0, w: W0 - B, h: T - 1 },
    { id: 'bedroom', x: 0, y: T, w: L, h: H - T },
    { id: 'bathroom', x: L, y: T, w: W0 - L, h: H - T },
    ...back,
    ...front,
    ...(balcony ? [balcony] : []),
  ];

  const walls: HomePlan['walls'] = [];
  const v = (x: number, y0: number, y1: number, gaps: number[] = []) => {
    for (let y = y0; y < y1; y++) if (!gaps.includes(y)) walls.push({ dir: 'v', x, y });
  };
  const h = (y: number, x0: number, x1: number, gaps: number[] = []) => {
    for (let x = x0; x < x1; x++) if (!gaps.includes(x)) walls.push({ dir: 'h', x, y });
  };
  v(B, 0, T - 1);
  h(T - 1, B, W, [B + 1, ...back.map((r) => r.x + 1)]);
  for (const r of back) v(r.x, 0, T - 1);
  h(T, 0, W, [L - 2, ...front.map((r) => r.x)]);
  v(L, T, H, [T + 1]);
  if (W > W0) v(W0, T, H);
  for (const r of front.slice(1)) v(r.x, T, H - BAL);
  // Every front bedroom opens onto the balcony.
  if (balcony)
    h(
      H - BAL,
      W0,
      W,
      front.map((r) => r.x + 1),
    );

  // The master bedroom, and its en-suite.
  const slots: Record<string, Spot> = {
    bed: spot(1, T, 2, 3, 3, T + 1),
    lights: spot(0, T, 1, 1, 0, T + 1),
    desk: spot(3, H - 1, 2, 1, 4, H - 2),
    laptop: spot(3, H - 1, 1, 1, 4, H - 2, { blocked: false }),
    wardrobe: spot(L - 2, H - 1, 2, 1, L - 2, H - 2),
  };
  const fixtures: HomePlan['fixtures'] = {
    toilet: spot(L + 1, T, 1, 1, L + 1, T + 1),
    sink: spot(L + 2, T, 1, 1, L + 2, T + 1),
    // A walk-in shower in the corner.
    shower: spot(W0 - 2, T, 2, 2, W0 - 3, T + 1),
    bathtub: spot(W0 - 3, H - 1, 2, 1, W0 - 3, H - 2),
  };
  const decor: Decor[] = [
    stairs('stairs-down', sx, sw, STAIR_ROWS, true, [
      { id: 'floor', label: 'Go downstairs', to: 0 },
    ]),
  ];
  if (n >= 3)
    decor.push(
      stairs('stairs-roof', 0, 2, 3, false, [
        { id: 'floor', label: 'Up to the roof terrace', to: 2 },
      ]),
    );
  // The family bathroom.
  const bath = (
    id: string,
    model: string,
    label: string,
    s: Spot & { rot: number },
    verbs: Decor['verbs'],
  ) => decor.push({ id, model, label, room: 'bathroom', spot: s, verbs, tier: finish });
  bath('bath2-toilet', 'toilet', 'Toilet', dspot(B, 0, 1, 1, B, 1), [
    { act: 'toilet', label: 'Use' },
  ]);
  bath('bath2-sink', 'sink', 'Sink', dspot(B + 1, 0, 1, 1, B + 1, 1), [
    { act: 'toilet', label: 'Freshen up' },
  ]);
  bath('bath2-shower', 'shower', 'Shower', dspot(W0 - 2, 0, 2, 2, W0 - 3, 1), [
    { act: 'shower', label: 'Shower' },
  ]);
  if (B + 2 < W0 - 2)
    bath('bath2-sink-2', 'sink', 'Sink', dspot(B + 2, 0, 1, 1, B + 2, 1), [
      { act: 'toilet', label: 'Freshen up' },
    ]);
  if (L + 3 < W0 - 2)
    bath('ensuite-sink-2', 'sink', 'Sink', dspot(L + 3, T, 1, 1, L + 3, T + 1), [
      { act: 'toilet', label: 'Freshen up' },
    ]);
  // Bath mats by the tubs.
  bath('ensuite-mat', 'rug', 'Bathtub', dspot(W0 - 3, H - 2, 2, 1, W0 - 3, H - 2, 0, false), [
    { act: 'shower', label: 'Take a bath' },
  ]);
  bath('bath2-mat', 'rug', 'Bathtub', dspot(W0 - 3, T - 3, 2, 1, W0 - 3, T - 3, 0, false), [
    { act: 'shower', label: 'Take a bath' },
  ]);
  bath('bath2-tub', 'bathtub', 'Bathtub', dspot(W0 - 3, T - 2, 2, 1, W0 - 3, T - 3), [
    { act: 'shower', label: 'Take a bath' },
  ]);
  // The bedrooms.
  [...back, ...front].forEach((r, i) => {
    const bx = r.x + Math.max(1, Math.floor((r.w - 2) / 2));
    const ix = bx + 2 < r.x + r.w ? bx + 2 : bx - 1;
    decor.push({
      id: `bedroom-bed-${i + 1}`,
      model: 'guest-bed',
      label: 'Bed',
      room: 'guest',
      spot: dspot(bx, r.y, 2, 3, ix, r.y + 1),
      verbs: [
        { act: 'sleep', label: 'Sleep' },
        { act: 'nap', label: 'Nap' },
      ],
      tier: finish,
    });
  });
  // Loungers on the balcony, facing the street.
  if (balcony)
    for (let i = 0; i < Math.min(3, Math.floor((balcony.w - 1) / 2)); i++) {
      const x = balcony.x + balcony.w - 2 - i * 2;
      decor.push({
        id: `balcony-lounger-${i + 1}`,
        model: 'lounger',
        label: 'Sun lounger',
        room: 'balcony',
        spot: dspot(x, H - 2, 1, 2, x, H - BAL),
        verbs: [{ act: 'nap', label: 'Sunbathe' }],
        tier: finish,
      });
    }
  return {
    tier: p.tier,
    w: W,
    h: H,
    rooms,
    walls,
    slots,
    fixtures,
    // You come up the stairs here.
    door: { x: sx + Math.floor(sw / 2), y: 0 },
    seats: [],
    kind: p.kind,
    wealth: p.wealth,
    coreW: W0,
    decor,
    level: 1,
  };
}

/** A mansion's roof terrace: loungers, a bar, a hot tub and a table under the sky. */
function roofFloor(p: HomePlan, g: Geometry): HomePlan {
  const { W, H } = g;
  const finish = finishOf(p.kind, p.wealth);
  const decor: Decor[] = [
    stairs('stairs-roof-down', 0, 2, 3, true, [{ id: 'floor', label: 'Go downstairs', to: 1 }]),
    {
      id: 'roof-bar',
      model: 'bar-counter',
      label: 'Bar',
      room: 'terrace',
      spot: dspot(W - 4, 0, 3, 1, W - 3, 1),
      verbs: [{ act: 'snack', label: 'Mix a drink' }],
      tier: finish,
    },
    {
      id: 'roof-hot-tub',
      model: 'spa-pool',
      label: 'Hot tub',
      room: 'terrace',
      spot: dspot(W - 5, 4, 3, 3, W - 6, 5),
      verbs: [{ act: 'nap', label: 'Relax in the hot tub' }],
      tier: finish,
    },
    {
      id: 'roof-table',
      model: 'restaurant-table',
      label: 'Outdoor table',
      room: 'terrace',
      spot: dspot(4, 4, 2, 2, 4, 6),
      verbs: [{ act: 'snack', label: 'Snack' }],
      tier: finish,
    },
  ];
  for (let i = 0; i < Math.min(6, Math.floor((W - 4) / 2)); i++)
    decor.push({
      id: `roof-lounger-${i + 1}`,
      model: 'lounger',
      label: 'Sun lounger',
      room: 'terrace',
      spot: dspot(2 + i * 2, H - 2, 1, 2, 2 + i * 2, H - 3),
      verbs: [{ act: 'nap', label: 'Sunbathe' }],
      tier: finish,
    });
  return {
    tier: p.tier,
    w: W,
    h: H,
    rooms: [{ id: 'terrace', x: 0, y: 0, w: W, h: H, open: true }],
    walls: [],
    slots: {},
    fixtures: {},
    door: { x: 1, y: 0 },
    seats: [],
    kind: p.kind,
    wealth: p.wealth,
    coreW: g.W0,
    decor,
    level: 2,
  };
}

export interface Doorway {
  /** 'h': the edge between rows y-1 and y; 'v': between columns x-1 and x. */
  dir: 'h' | 'v';
  x: number;
  y: number;
  /** +1: the bathroom is past the edge (row y / column x); -1: before it. */
  inside: 1 | -1;
}

/** Each bathroom's doorway: the first gap in the walls round it into another room. */
export function bathDoors(plan: HomePlan): Doorway[] {
  const walls = wallEdges(plan);
  const out: Doorway[] = [];
  const open = (ax: number, ay: number, bx: number, by: number) =>
    bx >= 0 &&
    by >= 0 &&
    bx < plan.w &&
    by < plan.h &&
    roomAt(plan, bx, by) !== 'bathroom' &&
    !walls.has(`${key(ax, ay)}|${key(bx, by)}`);
  for (const r of plan.rooms) {
    if (r.id !== 'bathroom') continue;
    let hit: Doorway | null = null;
    for (let x = r.x; x < r.x + r.w && !hit; x++) {
      if (open(x, r.y, x, r.y - 1)) hit = { dir: 'h', x, y: r.y, inside: 1 };
      else if (open(x, r.y + r.h - 1, x, r.y + r.h))
        hit = { dir: 'h', x, y: r.y + r.h, inside: -1 };
    }
    for (let y = r.y; y < r.y + r.h && !hit; y++) {
      if (open(r.x, y, r.x - 1, y)) hit = { dir: 'v', x: r.x, y, inside: 1 };
      else if (open(r.x + r.w - 1, y, r.x + r.w, y))
        hit = { dir: 'v', x: r.x + r.w, y, inside: -1 };
    }
    if (hit) out.push(hit);
  }
  return out;
}
