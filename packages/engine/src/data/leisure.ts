/**
 * Golf and the mall: a short course at each city's golf club and a shopping
 * mall in each city (the client stands both on the map).
 *
 * - The course: three holes per city, laid out from the city's id (the same
 *   on the server and every client), played in the golf scene. The club is
 *   the city's golf landmark (data/landmarks.ts); its till takes the green
 *   fee when it's open.
 * - The mall: a handful of shops (fashion, phones and electronics, home and
 *   furniture, a supermarket, a food court, a cinema). Prices are in
 *   cost-of-living units, so they scale with the city like everything else.
 *   Furniture and electronics are the lifestyle shop's own items
 *   (data/lifestyle-shop.ts): they go into your home inventory.
 *
 * Names are generic and of their city, never real brands.
 */
import { hashString, createRng } from '../rng.js';
import type { TopStyle } from '../appearance.js';
import type { MarketId } from './markets.js';
import { LANDMARKS } from './landmarks.js';

// ---------------------------------------------------------------- Golf

export interface GolfHole {
  /** 1-based. */
  n: number;
  par: 3 | 4 | 5;
  /** Tee to pin, metres. */
  length: number;
  /** Where the green sits sideways from the tee line, −1 (left) … 1 (right). */
  bend: number;
  /** Bunkers by the green (0–3) and one on the fairway (par 4 and 5). */
  bunkers: number;
  /** A pond short of the green. */
  water: boolean;
}

export interface GolfCourse {
  market: MarketId;
  name: string;
  holes: GolfHole[];
  par: number;
}

export const GOLF = {
  /** The green fee for three holes, in cost-of-living units. */
  feeCol: 0.03,
  /** Hours three holes take. */
  hours: 2,
  energy: -6,
  stress: -8,
  /** Extra calm for a round at or under par. */
  goodRoundStress: -3,
  fun: 12,
  social: 6,
  /** The chance you get talking with someone worth knowing (the first rounds a month). */
  meetChance: 0.45,
  meetRoundsPerMonth: 3,
  meetWarmth: 0.18,
  /** Strokes a hole counts at most (a pick-up). */
  maxStrokes: 10,
} as const;

/** Each city's three holes, from its id: the same everywhere. */
export function golfCourse(market: MarketId): GolfCourse {
  const r = createRng(hashString(`golf-course:${market}`));
  const pars: (3 | 4 | 5)[] = r.chance(0.5) ? [4, 3, 5] : [4, 5, 3];
  const holes = pars.map((par, i) => ({
    n: i + 1,
    par,
    length: Math.round(
      par === 3 ? r.range(120, 165) : par === 4 ? r.range(255, 330) : r.range(400, 450),
    ),
    bend: Math.round(r.range(-1, 1) * 100) / 100,
    bunkers: r.int(1, 3),
    water: par !== 4 && r.chance(0.5),
  }));
  const seed = (LANDMARKS[market] ?? []).find((l) => l.kind === 'golf-club');
  return {
    market,
    name: seed?.name ?? 'City Golf Club',
    holes,
    par: holes.reduce((s, h) => s + h.par, 0),
  };
}

// ---------------------------------------------------------------- The mall

export type MallShopId = 'fashion' | 'phones' | 'home' | 'supermarket' | 'foodcourt' | 'cinema';

export const MALL_SHOPS: readonly MallShopId[] = [
  'fashion',
  'phones',
  'home',
  'supermarket',
  'foodcourt',
  'cinema',
];

/** Business kinds whose till takes a mall shop's sales (the mall's branch of them). */
export const MALL_TILLS: Record<Exclude<MallShopId, 'home' | 'foodcourt'>, readonly string[]> = {
  fashion: ['boutique', 'tailor', 'fabric-stall'],
  phones: ['electronics', 'appliance-store', 'phone-repair'],
  supermarket: ['grocer', 'corner-shop'],
  cinema: ['cinema'],
};

export type PhoneTier = 1 | 2 | 3;

export interface MallItem {
  id: string;
  shop: MallShopId;
  /** Translatable. */
  label: string;
  /** Cost-of-living units (furniture: the lifestyle shop's price). */
  priceCol: number;
  /** Clothes: the top it puts you in (a colour is picked at the till). */
  topStyle?: TopStyle;
  /** Accessories. */
  headwear?: 'cap' | 'beanie';
  glasses?: 'shades' | 'round';
  /** A new phone. */
  phone?: PhoneTier;
  /** A lifestyle-shop item (furniture, a TV, a laptop): into your home. */
  furnitureId?: string;
  /** Food: hunger filled; fun; energy. */
  hunger?: number;
  fun?: number;
  energy?: number;
  /** Stress eased (a film). */
  stress?: number;
  /** Hours it takes (a film). */
  hours?: number;
}

const it = (x: MallItem) => x;

export const PHONE_NAMES: Record<PhoneTier, string> = {
  1: 'Everyday smartphone',
  2: 'Mid-range smartphone',
  3: 'Flagship smartphone',
};

export const MALL_ITEMS: readonly MallItem[] = [
  // Fashion: a new top in the colour you pick, and a few accessories.
  it({ id: 'top-tee', shop: 'fashion', label: 'T-shirt', priceCol: 0.015, topStyle: 'tee' }),
  it({ id: 'top-shirt', shop: 'fashion', label: 'Smart shirt', priceCol: 0.03, topStyle: 'shirt' }),
  it({ id: 'top-hoodie', shop: 'fashion', label: 'Hoodie', priceCol: 0.035, topStyle: 'hoodie' }),
  it({ id: 'top-kaftan', shop: 'fashion', label: 'Kaftan', priceCol: 0.06, topStyle: 'kaftan' }),
  it({ id: 'top-dress', shop: 'fashion', label: 'Dress', priceCol: 0.06, topStyle: 'dress' }),
  it({ id: 'top-blazer', shop: 'fashion', label: 'Blazer', priceCol: 0.09, topStyle: 'blazer' }),
  it({ id: 'acc-cap', shop: 'fashion', label: 'Cap', priceCol: 0.01, headwear: 'cap' }),
  it({ id: 'acc-beanie', shop: 'fashion', label: 'Beanie', priceCol: 0.01, headwear: 'beanie' }),
  it({ id: 'acc-shades', shop: 'fashion', label: 'Sunglasses', priceCol: 0.02, glasses: 'shades' }),
  // Phones and electronics.
  it({ id: 'phone-1', shop: 'phones', label: PHONE_NAMES[1], priceCol: 0.15, phone: 1 }),
  it({ id: 'phone-2', shop: 'phones', label: PHONE_NAMES[2], priceCol: 0.4, phone: 2 }),
  it({ id: 'phone-3', shop: 'phones', label: PHONE_NAMES[3], priceCol: 1, phone: 3 }),
  it({ id: 'laptop-2', shop: 'phones', label: '', priceCol: 0, furnitureId: 'laptop-2' }),
  it({ id: 'tv-2', shop: 'phones', label: '', priceCol: 0, furnitureId: 'tv-2' }),
  it({ id: 'sound-1', shop: 'phones', label: '', priceCol: 0, furnitureId: 'sound-1' }),
  // Home and furniture.
  it({ id: 'sofa-2', shop: 'home', label: '', priceCol: 0, furnitureId: 'sofa-2' }),
  it({ id: 'bed-2', shop: 'home', label: '', priceCol: 0, furnitureId: 'bed-2' }),
  it({ id: 'rug-2', shop: 'home', label: '', priceCol: 0, furnitureId: 'rug-2' }),
  it({ id: 'lights-2', shop: 'home', label: '', priceCol: 0, furnitureId: 'lights-2' }),
  it({ id: 'plants-1', shop: 'home', label: '', priceCol: 0, furnitureId: 'plants-1' }),
  it({ id: 'art-2', shop: 'home', label: '', priceCol: 0, furnitureId: 'art-2' }),
  // The supermarket.
  it({
    id: 'groceries',
    shop: 'supermarket',
    label: 'A basket of groceries',
    priceCol: 0.012,
    hunger: 20,
  }),
  it({
    id: 'groceries-week',
    shop: 'supermarket',
    label: 'The weekly shop',
    priceCol: 0.035,
    hunger: 40,
  }),
  it({
    id: 'snacks',
    shop: 'supermarket',
    label: 'Snacks and a cold drink',
    priceCol: 0.004,
    hunger: 10,
    energy: 2,
  }),
  // The food court.
  it({
    id: 'local-plate',
    shop: 'foodcourt',
    label: 'A local favourite',
    priceCol: 0.006,
    hunger: 35,
    fun: 2,
  }),
  it({
    id: 'burger',
    shop: 'foodcourt',
    label: 'Burger and fries',
    priceCol: 0.007,
    hunger: 35,
    fun: 2,
  }),
  it({
    id: 'smoothie',
    shop: 'foodcourt',
    label: 'Fresh smoothie',
    priceCol: 0.003,
    hunger: 8,
    energy: 4,
  }),
  // The cinema.
  it({
    id: 'film',
    shop: 'cinema',
    label: 'Watch a film',
    priceCol: 0.012,
    fun: 18,
    stress: -4,
    hours: 2.5,
  }),
  it({
    id: 'film-vip',
    shop: 'cinema',
    label: 'Film in the VIP seats',
    priceCol: 0.03,
    fun: 24,
    stress: -6,
    hours: 2.5,
  }),
];

const MALL_BY_ID = new Map(MALL_ITEMS.map((x) => [x.id, x]));
export const mallItem = (id: string) => MALL_BY_ID.get(id);
