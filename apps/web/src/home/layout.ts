/**
 * The home's floor plan (docs/WAVE7-IMMERSIVE.md §A): a grid that grows with
 * your lifestyle tier, four rooms, walls with door gaps, fixtures every home
 * has (a front door, a kitchenette, somewhere to sleep, a bathroom) and a
 * fixed spot with a real footprint for every furniture slot.
 *
 * Coordinates are tiles; (0,0) is the top-left floor tile under the back wall.
 */

export type RoomId = 'bedroom' | 'bathroom' | 'kitchen' | 'living' | 'study';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Room extends Rect {
  id: RoomId;
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
  | 'workout';

export type Verb =
  | { id: string; act: HomeAct; label: string }
  | { id: 'order'; label: string }
  | { id: 'sit'; label: string }
  | { id: 'invite'; label: string }
  | { id: 'out'; label: string }
  | { id: 'buy'; label: string; slot: string }
  | { id: 'move'; label: string; move: string }
  /** Wave 12: play a game for real (football on the TV, pool, a quiz night). */
  | { id: 'play'; label: string; game: 'football' | 'pool' | 'quiz' };

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
}

export const TIER_GRID: Record<number, { w: number; h: number }> = {
  1: { w: 8, h: 8 },
  2: { w: 10, h: 10 },
  3: { w: 12, h: 12 },
  4: { w: 14, h: 14 },
  5: { w: 16, h: 14 },
};

/** Home names by tier (translated by the caller). */
export const TIER_HOME = ['Shared room', 'Flat', 'Good flat', 'House', 'Penthouse'] as const;

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
    walls: [],
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
      dining: spot(5, 5, 2, 1, 5, 6),
      plants: spot(0, 7, 1, 1, 0, 6),
      wifi: spot(6, 7, 1, 1, 5, 7),
      power: spot(7, 7, 1, 1, 7, 6),
    },
    fixtures: {
      door: spot(1, 7, 1, 1, 1, 7, { blocked: false }),
      kitchenette: spot(7, 1, 1, 2, 6, 1),
      mat: spot(0, 0, 2, 3, 2, 1),
      cushions: spot(1, 6, 3, 1, 2, 5, { blocked: false }),
      'shared-bath': spot(6, 0, 1, 1, 6, 0, { wall: true }),
    },
    door: { x: 1, y: 7 },
    seats: [
      { x: 2, y: 6 },
      { x: 1, y: 6 },
      { x: 3, y: 6 },
    ],
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
  };
}

const PLANS = new Map<number, HomePlan>();

export function planFor(tier: number): HomePlan {
  const t = Math.max(1, Math.min(5, Math.round(tier) || 1));
  let p = PLANS.get(t);
  if (!p) {
    p = t === 1 ? sharedRoom() : flat(t);
    PLANS.set(t, p);
  }
  return p;
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
