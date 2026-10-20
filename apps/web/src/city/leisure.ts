/**
 * Golf and the mall on the city map (player feedback: "they should actually
 * play golf", "people should go to the malls to shop").
 *
 * Every city has a golf course (its golf club, the engine's golf landmark)
 * and a shopping mall, as places of their own: `golf` and `mall`. On a real
 * map they stand where the city's real golf course and a big mall are (when
 * the map reaches that far), else in the district the table names. The names
 * are generic and of their city, never real brands.
 *
 * The engine sends the course, the green fee and the mall's prices in the
 * view (`me.golf`, `me.mall`); `golfOf` / `mallOf` read them loosely.
 */
import {
  golfCourse,
  type Appearance,
  type GolfHole,
  type MallShopId,
  type MarketId,
  type PlayerView,
} from '@runway/engine';
import { B, SW, type Cell, type Ctx, type Place } from './layout';
import type { Host } from './plans';

interface Spot {
  name: string;
  /** City-plan district id. */
  district: string;
  /** The real spot (lat, lon), used when the map reaches it. */
  at?: [number, number];
}

const golfAt: Record<string, Omit<Spot, 'name'>> = {
  lagos: { district: 'ikoyi', at: [6.4565, 3.4335] },
  nairobi: { district: 'karen', at: [-1.3297, 36.713] },
  london: { district: 'camden', at: [51.5705, -0.1585] },
  accra: { district: 'east-legon', at: [5.6395, -0.219] },
  freetown: { district: 'lumley', at: [8.4497, -13.2735] },
  kigali: { district: 'remera', at: [-1.9355, 30.1057] },
  johannesburg: { district: 'rosebank', at: [-26.164, 28.056] },
  cairo: { district: 'new-cairo', at: [30.006, 31.42] },
  dubai: { district: 'jumeirah', at: [25.089, 55.161] },
  'san-francisco': { district: 'presidio', at: [37.7905, -122.459] },
};

export const MALLS: Record<string, Spot> = {
  lagos: { name: 'Lekki Lagoon Mall', district: 'lekki', at: [6.4365, 3.4705] },
  nairobi: { name: 'Westlands Grove Mall', district: 'westlands', at: [-1.2615, 36.8035] },
  london: { name: 'Borough Exchange Centre', district: 'borough' },
  accra: { name: 'Airport City Galleria', district: 'airport-city', at: [5.6225, -0.1735] },
  freetown: { name: 'Aberdeen Bay Mall', district: 'aberdeen' },
  kigali: { name: 'Kacyiru Hills Mall', district: 'kacyiru' },
  johannesburg: { name: 'Sandton Exchange Mall', district: 'sandton', at: [-26.108, 28.053] },
  cairo: { name: 'Heliopolis Oasis Mall', district: 'heliopolis' },
  dubai: { name: 'Marina Pearl Mall', district: 'marina', at: [25.0775, 55.1395] },
  'san-francisco': { name: 'Market Street Centre', district: 'soma' },
};

export const golfSpot = (marketId: string): Spot => ({
  name: golfCourse(marketId as MarketId).name,
  district: golfAt[marketId]?.district ?? '',
  ...(golfAt[marketId]?.at ? { at: golfAt[marketId]!.at } : {}),
});
export const mallSpot = (marketId: string): Spot =>
  MALLS[marketId] ?? { name: 'City Mall', district: '' };

/** The golf course: a wide green plot, the clubhouse by the road. */
export function putGolf(ctx: Ctx, { i, j }: Cell, area?: string) {
  const w = 3.4;
  const d = 2.8;
  const x = i * B + (B - w) / 2;
  const y = (j + 1) * B - SW - 0.25 - d;
  ctx.places.push({
    id: 'golf',
    kind: 'golf',
    name: golfSpot(ctx.input.marketId).name,
    district: 'park',
    area,
    x,
    y,
    w,
    d,
    h: 14,
    motif: 'golf',
    color: '#4d9a2a',
    accent: '#f8fafc',
    door: { x: x + w / 2, y: (j + 1) * B },
    doorFace: 'left',
  });
}

/** The mall: a long glass-fronted block with a big sign. */
export function putMall(ctx: Ctx, { i, j }: Cell, area?: string) {
  const w = 2.8;
  const d = 2.2;
  const x = i * B + (B - w) / 2;
  const y = (j + 1) * B - SW - 0.25 - d;
  ctx.places.push({
    id: 'mall',
    kind: 'mall',
    name: mallSpot(ctx.input.marketId).name,
    district: 'shops',
    area,
    x,
    y,
    w,
    d,
    h: 44,
    motif: 'mall',
    color: '#e7e2d8',
    accent: '#db2777',
    door: { x: x + w / 2, y: (j + 1) * B },
    doorFace: 'left',
  });
}

/** The districts that host the course and the mall (unless the plan names them). */
export function leisureHosts(
  D: readonly { d: { id: string } }[],
  hostOf: Map<Host, number>,
  marketId: string,
) {
  for (const [h, spot] of [
    ['golf', golfSpot(marketId)],
    ['mall', mallSpot(marketId)],
  ] as const) {
    if (hostOf.has(h)) continue;
    const n = D.findIndex((x) => x.d.id === spot.district);
    if (n >= 0) hostOf.set(h, n);
  }
}

// ---------------------------------------------------------------------------
// What the engine sends

export interface GolfView {
  name: string;
  holes: GolfHole[];
  par: number;
  fee: number;
  currency: string;
  hours: number;
  clubId: string | null;
  you: { rounds: number; best: number } | null;
  /** Golf with a friend: the stake chips, the cap and the AI friends free here (newer servers). */
  match?: GolfMatchOptions;
}

export interface GolfMatchOptions {
  venue: string;
  stakes: number[];
  maxStake: number;
  shotMs: number;
  pickupOver: number;
  hours: number;
  handicap: number;
  friends: {
    id: string;
    name: string;
    role: string;
    backgroundId: string;
    handicap: number;
    maxStake: number;
  }[];
}

export interface MallItemView {
  id: string;
  shop: MallShopId;
  label: string;
  price: number;
  topStyle?: string;
  headwear?: string;
  glasses?: string;
  phone?: 1 | 2 | 3;
  furniture?: string;
  slot?: string;
  tier?: number;
  /** The bigger mall: something you keep (in your bag), and what kind. */
  keep?: string;
  hunger?: number;
  fun?: number;
  energy?: number;
  hygiene?: number;
  health?: number;
  stress?: number;
  hours?: number;
  /** Priced in dollars at the day's rate. */
  imported?: boolean;
  /** Can be bought for the friend you're shopping with. */
  gift?: boolean;
  owned: boolean;
}

/** Someone you shop with (how they look, for the figure walking with you). */
export interface MallPerson {
  id: string;
  name: string;
  ai: boolean;
  role?: string;
  backgroundId?: string;
  gender: 'female' | 'male' | null;
  appearance?: Appearance;
  /** They chose their look (else they're dressed by their background). */
  styled?: boolean;
  company?: string | null;
}

export interface MallTripView {
  id: string;
  status: 'invited' | 'together';
  /** You asked them. */
  mine: boolean;
  market: string;
  friend: MallPerson;
  gifts: { from: string; to: string; item: string; label: string; price: number }[];
}

export interface MallView {
  currency: string;
  /** The shops open here (older servers: the first six). */
  shops?: MallShopId[];
  delivers: boolean;
  phone: { tier: 1 | 2 | 3; name: string } | null;
  items: MallItemView[];
  /** What you keep from the mall, newest first. */
  bag?: {
    item: string;
    label: string;
    kind: string | null;
    from: { id: string; name: string } | null;
  }[];
  /** Shopping together (newer servers). */
  trip?: MallTripView | null;
  invites?: { id: string; from: { id: string; name: string }; market: string; city: string }[];
  friends?: MallPerson[];
}

type Loose = { me: Record<string, unknown> };

export function golfOf(view: PlayerView, marketId: string): GolfView {
  const raw = (view as unknown as Loose).me.golf as GolfView | undefined;
  if (raw && Array.isArray(raw.holes)) return raw;
  const c = golfCourse(marketId as MarketId);
  return { ...c, fee: 0, currency: '', hours: 2, clubId: null, you: null };
}

export function mallOf(view: PlayerView): MallView | null {
  const raw = (view as unknown as Loose).me.mall as MallView | undefined;
  return raw && Array.isArray(raw.items) ? raw : null;
}

export const isLeisure = (p: Place) => p.kind === 'golf' || p.kind === 'mall';
