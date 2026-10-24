/**
 * Phase 6a: how a person looks — skin, face, hair, facial hair, glasses,
 * headwear and top. Purely cosmetic: nothing in the simulation reads it, so
 * no number in the world changes with it.
 *
 * - A player picks theirs in the character creator (`player.appearance`,
 *   stored on `Player.appearance`); until then, and for every AI person, a
 *   look follows from a seed (`defaultAppearance`), the same on the server
 *   and every client, so the city is diverse and everyone sees the same faces.
 * - The client turns an appearance into its drawings (2D portrait, map
 *   figure, 3D figures); the lists here are the whole vocabulary.
 * - What you wear from your wardrobe (shoes, a watch, jewellery, a bag …:
 *   `WORN`, wardrobe.ts) are optional parts, put on with `wardrobe.wear`.
 *
 * Replay: the field is optional and only the new command writes it, so a
 * logged world without that command replays to exactly the same state.
 */
import { z } from 'zod';
import { hashString } from './rng.js';
import type { Gender } from './types.js';
import type { MarketId } from './data/markets.js';

/** Eight skin tones, deep to light. Old seeded looks used this order too. */
export const SKIN_TONES = [
  '#5c3a21',
  '#7a4a2a',
  '#8d5524',
  '#a0673a',
  '#c68642',
  '#e0ac69',
  '#f1c27d',
  '#ffdbac',
] as const;

export const FACE_SHAPES = ['oval', 'round', 'square', 'long'] as const;

/**
 * Hair, short to long. `short`, `afro`, `bun`, `long`, `braids` and `buzz`
 * are the Wave 8 styles (the barber and salon); `bald`, `locs`, `twists`
 * and `curly` are new with the creator.
 */
export const HAIR_STYLES = [
  'bald',
  'buzz',
  'short',
  'curly',
  'afro',
  'twists',
  'locs',
  'braids',
  'bun',
  'long',
] as const;

/** Natural shades first (seeded looks pick from those), then dyes and grey. */
export const HAIR_COLOURS = [
  '#0f0f0f',
  '#2b1b10',
  '#4a2c17',
  '#7a4b24',
  '#a0522d',
  '#d6a85c',
  '#9ca3af',
  '#7f1d3a',
] as const;

export const FACIAL_HAIR = ['none', 'stubble', 'moustache', 'goatee', 'beard'] as const;
export const GLASSES = ['none', 'round', 'square', 'shades'] as const;
/** A gele is the tall Yoruba head tie; a headwrap covers the hair. */
export const HEADWEAR = ['none', 'cap', 'beanie', 'headwrap', 'gele'] as const;
/**
 * A kaftan is a long top (a buba, a dashiki, an agbada); a dress reaches the
 * knee. A suit (the feedback round: "a banker should be in a suit") is a
 * tailored jacket over a shirt (a woman's: a blouse) with trousers to match;
 * a blouse has a soft neck. Old looks never name the last two.
 */
export const TOP_STYLES = [
  'tee',
  'shirt',
  'blazer',
  'hoodie',
  'kaftan',
  'dress',
  'suit',
  'blouse',
] as const;

/** The creator's swatches. Any #rrggbb is valid (onboarding's outfit colours, dyes). */
export const TOP_COLOURS = [
  '#0f766e',
  '#2563eb',
  '#1e3a8a',
  '#dc2626',
  '#16a34a',
  '#f59e0b',
  '#7c3aed',
  '#db2777',
  '#f97316',
  '#111827',
  '#e2e8f0',
  '#a16207',
] as const;

/**
 * What you wear from the mall's wardrobe (wardrobe.ts): shoes, jeans, a belt,
 * socks, a scarf, a bag, a watch and jewellery. Each part is optional on a
 * look (missing = 'none': drawn as before, with plain shoes and the outfit's
 * trousers), so every look saved before them is still valid. The feedback
 * round's suit shop adds Oxfords and courts, chinos and joggers, a tie, and a
 * briefcase, a folio and a work tote (the end of each list, never earlier).
 */
export const WORN = {
  shoes: [
    'none',
    'trainers',
    'running',
    'sneakers',
    'sandals',
    'flipflops',
    'loafers',
    'heels',
    'boots',
    'oxfords',
    'courts',
  ],
  legs: ['none', 'jeans', 'chinos', 'joggers'],
  belt: ['none', 'leather'],
  socks: ['none', 'plain'],
  scarf: ['none', 'silk'],
  bag: ['none', 'tote', 'handbag', 'gymbag', 'briefcase', 'folio', 'worktote'],
  watch: ['none', 'everyday', 'smart', 'dress', 'luxury'],
  bracelet: ['none', 'beaded'],
  ring: ['none', 'diamond'],
  cufflinks: ['none', 'silver'],
  necklace: ['none', 'silver', 'gold'],
  earrings: ['none', 'studs'],
  /** Worn with a suit, a shirt or a blazer (drawn only over those). */
  tie: ['none', 'silk', 'navy', 'bow'],
} as const;
export type WornSlot = keyof typeof WORN;
export const WORN_SLOTS = Object.keys(WORN) as WornSlot[];
/** What can be taken off (`wardrobe.remove`): headwear, glasses and every worn part. */
export const REMOVABLE = [
  'headwear',
  'glasses',
  'shoes',
  'legs',
  'belt',
  'socks',
  'scarf',
  'bag',
  'watch',
  'bracelet',
  'ring',
  'cufflinks',
  'necklace',
  'earrings',
  'tie',
] as const satisfies readonly ('headwear' | 'glasses' | WornSlot)[];
export type Removable = (typeof REMOVABLE)[number];
/** One worn part: its slot and style (a mall item's `worn`). */
export type WornPart = {
  [K in WornSlot]: { slot: K; style: Exclude<(typeof WORN)[K][number], 'none'> };
}[WornSlot];

export type SkinTone = (typeof SKIN_TONES)[number];
export type FaceShape = (typeof FACE_SHAPES)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type FacialHair = (typeof FACIAL_HAIR)[number];
export type Glasses = (typeof GLASSES)[number];
export type Headwear = (typeof HEADWEAR)[number];
export type TopStyle = (typeof TOP_STYLES)[number];
export type Shoes = (typeof WORN.shoes)[number];

export interface Appearance {
  skin: SkinTone;
  face: FaceShape;
  hairStyle: HairStyle;
  /** #rrggbb */
  hairColor: string;
  facialHair: FacialHair;
  glasses: Glasses;
  headwear: Headwear;
  topStyle: TopStyle;
  /** #rrggbb */
  topColor: string;
  /** What you wear from your wardrobe (WORN); missing = none. */
  shoes?: Shoes;
  legs?: (typeof WORN.legs)[number];
  belt?: (typeof WORN.belt)[number];
  socks?: (typeof WORN.socks)[number];
  scarf?: (typeof WORN.scarf)[number];
  bag?: (typeof WORN.bag)[number];
  watch?: (typeof WORN.watch)[number];
  bracelet?: (typeof WORN.bracelet)[number];
  ring?: (typeof WORN.ring)[number];
  cufflinks?: (typeof WORN.cufflinks)[number];
  necklace?: (typeof WORN.necklace)[number];
  earrings?: (typeof WORN.earrings)[number];
  tie?: (typeof WORN.tie)[number];
}

const colour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((s) => s.toLowerCase());

/**
 * The creator's parts (what `player.appearance` may set): what you wear from
 * the wardrobe is only put on with `wardrobe.wear`, for things you own.
 */
export const lookSchema = z.object({
  skin: z.enum(SKIN_TONES),
  face: z.enum(FACE_SHAPES),
  hairStyle: z.enum(HAIR_STYLES),
  hairColor: colour,
  facialHair: z.enum(FACIAL_HAIR),
  glasses: z.enum(GLASSES),
  headwear: z.enum(HEADWEAR),
  topStyle: z.enum(TOP_STYLES),
  topColor: colour,
});

/** One look, every part named, with what's worn from the wardrobe (validated at the trust boundary). */
export const appearanceSchema = lookSchema.extend({
  shoes: z.enum(WORN.shoes).optional(),
  legs: z.enum(WORN.legs).optional(),
  belt: z.enum(WORN.belt).optional(),
  socks: z.enum(WORN.socks).optional(),
  scarf: z.enum(WORN.scarf).optional(),
  bag: z.enum(WORN.bag).optional(),
  watch: z.enum(WORN.watch).optional(),
  bracelet: z.enum(WORN.bracelet).optional(),
  ring: z.enum(WORN.ring).optional(),
  cufflinks: z.enum(WORN.cufflinks).optional(),
  necklace: z.enum(WORN.necklace).optional(),
  earrings: z.enum(WORN.earrings).optional(),
  tie: z.enum(WORN.tie).optional(),
});

const FEMALE_HAIR: readonly HairStyle[] = [
  'bun',
  'long',
  'braids',
  'afro',
  'locs',
  'twists',
  'curly',
];
const MALE_HAIR: readonly HairStyle[] = [
  'short',
  'buzz',
  'afro',
  'bald',
  'locs',
  'twists',
  'curly',
  'short',
];
const MALE_FACIAL: readonly FacialHair[] = [
  'none',
  'none',
  'none',
  'stubble',
  'moustache',
  'goatee',
  'beard',
];
const FEMALE_TOPS: readonly TopStyle[] = ['tee', 'shirt', 'blazer', 'dress', 'kaftan'];
const MALE_TOPS: readonly TopStyle[] = ['tee', 'shirt', 'blazer', 'hoodie', 'kaftan'];

const at = <T>(xs: readonly T[], n: number): T => xs[n % xs.length]!;

/**
 * How often each skin tone (deep to light, as SKIN_TONES) is seeded in a
 * city, roughly as its people look: West and East African cities mostly
 * Black, Johannesburg mostly Black with a real mix, Cairo North African,
 * Dubai a broad mix, London and San Francisco mostly lighter with every
 * shade present. A player's own choice in the creator always wins.
 */
export const SKIN_MIX: Record<MarketId, readonly number[]> = {
  lagos: [24, 24, 22, 14, 8, 4, 2, 2],
  accra: [24, 24, 22, 14, 8, 4, 2, 2],
  freetown: [24, 24, 22, 14, 8, 4, 2, 2],
  nairobi: [22, 24, 22, 14, 8, 5, 3, 2],
  kigali: [22, 24, 22, 14, 8, 5, 3, 2],
  johannesburg: [18, 20, 18, 12, 10, 8, 7, 7],
  cairo: [2, 4, 8, 16, 26, 24, 13, 7],
  dubai: [3, 6, 10, 16, 20, 18, 15, 12],
  london: [3, 4, 4, 6, 9, 14, 26, 34],
  'san-francisco': [2, 3, 4, 6, 12, 23, 26, 24],
};

/** A pick from `xs` by weight, with `n` a 32-bit hash. */
function weighted<T>(xs: readonly T[], weights: readonly number[], n: number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = n % total;
  for (let i = 0; i < xs.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return xs[i]!;
  }
  return xs[xs.length - 1]!;
}

/**
 * The look a seed gives: a pure function of the seed (and gender, when it's
 * known), so a player who never opened the creator, an AI founder or a
 * stranger on the pavement looks the same to everyone, every time.
 * Without a gender, one follows from the seed. With the person's city, the
 * skin follows that city's mix (SKIN_MIX).
 */
export function defaultAppearance(
  seed: string,
  gender?: Gender | null,
  market?: MarketId | null,
): Appearance {
  const h = hashString(seed);
  const g: Gender = gender ?? seedGender(seed);
  const female = g === 'female';
  // Its own hash: bits of `h` follow the seed's text closely, which gave
  // whole runs of similar ids (and far more men than women) grey hair.
  const grey = hashString(`${seed}:grey`) % 16 === 0;
  // In a city, its own mix (an independent hash); without one, every tone alike.
  const skin = market
    ? weighted(SKIN_TONES, SKIN_MIX[market], hashString(`${seed}:skin`))
    : at(SKIN_TONES, h);
  return {
    skin,
    face: at(FACE_SHAPES, h >>> 13),
    hairStyle: at(female ? FEMALE_HAIR : MALE_HAIR, h >>> 9),
    // Black to brown for everyone; the lightest skin can also be auburn or blonde.
    hairColor: grey
      ? '#9ca3af'
      : at(HAIR_COLOURS.slice(0, SKIN_TONES.indexOf(skin) >= 6 ? 6 : 4), h >>> 5),
    facialHair: female ? 'none' : at(MALE_FACIAL, h >>> 16),
    glasses: (h >>> 19) % 5 === 0 ? (((h >>> 22) & 1) === 1 ? 'round' : 'square') : 'none',
    // Headwear only when a player picks it: a seeded crowd shows its hair.
    headwear: 'none',
    topStyle: at(female ? FEMALE_TOPS : MALE_TOPS, h >>> 26),
    topColor: at(TOP_COLOURS, (h >>> 28) ^ (h >>> 11)),
  };
}

/**
 * The parts each gender's creator offers. Men get no dress, blouse, gele, bun
 * or long straight hair (their kaftan is drawn as a tunic over trousers) and
 * no heels or courts from the wardrobe; women no facial hair. Everything else
 * is open to everyone.
 */
export const GENDER_PARTS: Record<
  Gender,
  {
    hairStyle: readonly HairStyle[];
    facialHair: readonly FacialHair[];
    headwear: readonly Headwear[];
    topStyle: readonly TopStyle[];
    shoes: readonly Shoes[];
  }
> = {
  female: {
    hairStyle: HAIR_STYLES,
    facialHair: ['none'],
    headwear: HEADWEAR,
    topStyle: TOP_STYLES,
    shoes: WORN.shoes,
  },
  male: {
    hairStyle: HAIR_STYLES.filter((h) => h !== 'bun' && h !== 'long' && h !== 'braids'),
    facialHair: FACIAL_HAIR,
    headwear: HEADWEAR.filter((h) => h !== 'gele'),
    topStyle: TOP_STYLES.filter((s) => s !== 'dress' && s !== 'blouse'),
    shoes: WORN.shoes.filter((s) => s !== 'heels' && s !== 'courts'),
  },
};

/** What a part the other gender wears becomes (the nearest one this gender has). */
const SWAP = {
  hairStyle: { bun: 'short', long: 'short', braids: 'twists' },
  headwear: { gele: 'headwrap' },
  topStyle: { dress: 'kaftan', blouse: 'shirt' },
  shoes: { heels: 'loafers', courts: 'oxfords' },
} as const;

/**
 * A look as this gender wears it: a dress, gele, heels, bun or long straight
 * hair on a man (a look made before he picked "Man", an old save, a gender changed
 * in Profile) becomes his nearest part, and a woman loses facial hair. Pure,
 * and the same object back when nothing changes.
 */
export function fitAppearance<
  A extends {
    hairStyle?: HairStyle;
    facialHair?: FacialHair;
    headwear?: Headwear;
    topStyle?: TopStyle;
    shoes?: Shoes;
  },
>(a: A, gender: Gender): A {
  const ok = GENDER_PARTS[gender];
  let out: A = a;
  const put = <K extends 'hairStyle' | 'facialHair' | 'headwear' | 'topStyle' | 'shoes'>(
    k: K,
    v: Appearance[K],
  ) => {
    if (out === a) out = { ...a };
    (out as Partial<Appearance>)[k] = v;
  };
  if (a.hairStyle && !ok.hairStyle.includes(a.hairStyle))
    put('hairStyle', (SWAP.hairStyle as Record<string, HairStyle>)[a.hairStyle] ?? 'short');
  if (a.facialHair && !ok.facialHair.includes(a.facialHair)) put('facialHair', 'none');
  if (a.headwear && !ok.headwear.includes(a.headwear)) {
    const swap = (SWAP.headwear as Record<string, Headwear>)[a.headwear] ?? 'none';
    put('headwear', ok.headwear.includes(swap) ? swap : 'none');
  }
  if (a.topStyle && !ok.topStyle.includes(a.topStyle))
    put('topStyle', (SWAP.topStyle as Record<string, TopStyle>)[a.topStyle] ?? 'shirt');
  if (a.shoes && !ok.shoes.includes(a.shoes))
    put('shoes', (SWAP.shoes as Record<string, Shoes>)[a.shoes] ?? 'none');
  return out;
}

/** The gender a seed gives a person whose gender isn't known (half and half). */
export const seedGender = (seed: string): Gender =>
  ((hashString(seed) >>> 3) & 1) === 1 ? 'female' : 'male';

/** The seed a player's default look comes from (their id and background). */
export const appearanceSeed = (p: { id: string; backgroundId?: string }) =>
  `${p.id}:${p.backgroundId ?? ''}`;
