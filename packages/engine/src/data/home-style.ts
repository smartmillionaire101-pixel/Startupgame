/**
 * Buy mode at home (the feedback round): what each thing does for you, and
 * the floor and wall finishes you can give your rooms.
 *
 * Boosts: every furniture slot lifts one or two needs (a TV and a console
 * are fun, a sofa and a dining table are for company, a kitchen and a
 * fridge feed you, a washer keeps you fresh, a bed and an air conditioner
 * rest you, plants and art calm you). A thing's boost is its tier in
 * points: a basic one +1, a good one +2, a luxury one +3. Comfort is the
 * comfort score every thing already adds (shop.ts `comfortOf`). Applied by
 * homestyle.ts, switched on by FEEDBACK_NOTE.
 *
 * Finishes: floors per room, paint for the walls. The everyday ones are
 * free to anyone; the rest cost cost-of-living units once, then they're
 * yours to use in any room.
 */
import type { FurnitureSlot } from './lifestyle-shop.js';

/** What a thing at home can lift: the four needs, energy, calm (less stress) and comfort. */
export type BoostKey = 'hunger' | 'hygiene' | 'fun' | 'social' | 'energy' | 'mood' | 'comfort';

export const BOOST_KEYS: readonly BoostKey[] = [
  'hunger',
  'hygiene',
  'fun',
  'social',
  'energy',
  'mood',
  'comfort',
];

/** Translatable. */
export const BOOST_LABEL: Record<BoostKey, string> = {
  hunger: 'Hunger',
  hygiene: 'Hygiene',
  fun: 'Fun',
  social: 'Social',
  energy: 'Energy',
  mood: 'Mood',
  comfort: 'Comfort',
};

/** Which needs each slot lifts (the first is the one shown first). */
export const SLOT_BOOSTS: Record<FurnitureSlot, readonly BoostKey[]> = {
  sofa: ['social', 'comfort'],
  bed: ['energy', 'comfort'],
  desk: ['energy'],
  tv: ['fun'],
  plants: ['mood'],
  art: ['mood'],
  kitchen: ['hunger'],
  sound: ['fun'],
  gaming: ['fun', 'social'],
  fridge: ['hunger'],
  washer: ['hygiene'],
  cooling: ['energy'],
  power: ['mood'],
  lights: ['comfort', 'mood'],
  rug: ['comfort'],
  dining: ['social', 'hunger'],
  wardrobe: ['hygiene'],
  books: ['fun', 'mood'],
  coffee: ['energy'],
  wifi: ['fun', 'social'],
  laptop: ['social'],
};

/**
 * Month end: each point of a need's boost from what you own softens that
 * need's monthly fall by this much (capped), adds energy, or takes stress off.
 */
export const BOOST_SETTLE = {
  needPerPoint: 2,
  needCap: 12,
  energyPerPoint: 1,
  energyCap: 6,
  moodStressPerPoint: -1,
  moodStressCap: -6,
};

/** Using a thing at home (`home.act`): its boost points times this on top of the act. */
export const BOOST_ACT_PER_POINT = 3;

/** The home acts and the slots they use (the boost of what you own adds to the act). */
export const ACT_SLOTS: Record<string, readonly FurnitureSlot[]> = {
  sleep: ['bed', 'cooling'],
  nap: ['sofa', 'cooling'],
  shower: ['wardrobe'],
  cook: ['kitchen', 'fridge'],
  snack: ['fridge', 'coffee'],
  tv: ['tv', 'sound'],
  game: ['gaming', 'wifi'],
  read: ['books', 'lights'],
  laundry: ['washer'],
  /** Having someone over (`home.invite`). */
  invite: ['sofa', 'dining', 'sound'],
};

// ---------------------------------------------------------------- More than one

/**
 * Player feedback ("I need multiple speakers"): the things you can have more
 * than one of, each placed on its own (`home.extra.buy`). Decor and small
 * things only: a home has one bed, one kitchen, one sofa to sit on.
 *
 * Boosts don't stack: a need counts each kind of thing once (the one in its
 * slot, `SLOT_BOOSTS` by its tier); the extra speakers, plants and paintings
 * make the room, not a fuller fun or mood bar. Comfort neither.
 */
export const EXTRA_SLOTS: readonly FurnitureSlot[] = [
  'sound',
  'plants',
  'lights',
  'art',
  'rug',
  'books',
];

/**
 * Round 7 (GAMEPLAY_NOTE; player feedback "I can't buy two sofas"): more than
 * one of any furniture, except what's built in (the kitchen, the air
 * conditioning, the power and the internet) and the laptop on the desk.
 * Extra copies still add no boost: each kind of thing counts once.
 */
export const ONE_PER_HOME: readonly FurnitureSlot[] = [
  'kitchen',
  'cooling',
  'power',
  'wifi',
  'laptop',
];

/** How many more of each kind (on top of the one in its slot), and in all. */
export const EXTRAS_PER_SLOT = 5;
export const EXTRAS_MAX = 20;

// ---------------------------------------------------------------- Finishes

export interface FinishSpec {
  id: string;
  /** Translatable. */
  label: string;
  /** Free to anyone (0), or a one-off price in cost-of-living units. */
  priceCol: number;
  /** A wall paint's colour. */
  swatch?: string;
}

/** Floors (the ids are the 3D floor textures). */
export const FLOOR_FINISHES: readonly FinishSpec[] = [
  { id: 'oak', label: 'Honey oak', priceCol: 0 },
  { id: 'parquet', label: 'Parquet', priceCol: 0 },
  { id: 'parquet-dark', label: 'Dark parquet', priceCol: 0 },
  { id: 'cream', label: 'Cream tiles', priceCol: 0 },
  { id: 'tile', label: 'Ceramic tiles', priceCol: 0.2 },
  { id: 'carpet', label: 'Soft carpet', priceCol: 0.3 },
  { id: 'concrete', label: 'Polished concrete', priceCol: 0.35 },
  { id: 'checker', label: 'Checkerboard', priceCol: 0.3 },
  { id: 'stone', label: 'Natural stone', priceCol: 0.55 },
  { id: 'marble', label: 'Marble', priceCol: 0.8 },
];

/** Wall paint (the walls and dividers' paints, and a few more). */
export const WALL_FINISHES: readonly FinishSpec[] = [
  { id: 'white', label: 'Painted white', priceCol: 0, swatch: '#f1ede4' },
  { id: 'sage', label: 'Sage green', priceCol: 0, swatch: '#9fb59a' },
  { id: 'clay', label: 'Terracotta', priceCol: 0, swatch: '#c47a5a' },
  { id: 'navy', label: 'Deep navy', priceCol: 0.2, swatch: '#2f4163' },
  { id: 'charcoal', label: 'Charcoal', priceCol: 0.21, swatch: '#3b3d40' },
  { id: 'blush', label: 'Blush pink', priceCol: 0.2, swatch: '#e3b9ae' },
  { id: 'timber', label: 'Timber-clad', priceCol: 1.13, swatch: '#b07a48' },
];

export type FinishSurface = 'floor' | 'wall';

export const finishSpec = (surface: FinishSurface, id: string): FinishSpec | undefined =>
  (surface === 'floor' ? FLOOR_FINISHES : WALL_FINISHES).find((f) => f.id === id);
