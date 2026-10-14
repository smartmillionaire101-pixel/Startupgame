/**
 * The home's floor plan (docs/WAVE7-IMMERSIVE.md §A): a grid that grows with
 * your lifestyle tier, four rooms, walls with door gaps, fixtures every home
 * has (a front door, a kitchenette, somewhere to sleep, a bathroom) and a
 * fixed spot with a real footprint for every furniture slot.
 *
 * Coordinates are tiles; (0,0) is the top-left floor tile under the back wall.
 */

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
  | 'cinema';

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
  verbs: ({ act: HomeAct; label: string } | { id: 'invite'; label: string })[];
  /** Finish, 1–3. */
  tier: number;
}

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
  // Wave 12: take one of your cars out.
  | { id: 'car'; label: string; model: string };

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
export function finishOf(kind: HomeKind, wealth: number): number {
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
  return { kind: KIND_OF_TIER[Math.max(1, Math.min(5, lifestyleTier))]!, wealth: 1 };
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
