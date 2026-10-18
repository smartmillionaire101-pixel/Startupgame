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
 *
 * Replay: the field is optional and only the new command writes it, so a
 * logged world without that command replays to exactly the same state.
 */
import { z } from 'zod';
import { hashString } from './rng.js';
import type { Gender } from './types.js';

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
/** A kaftan is a long top (a buba, a dashiki, an agbada); a dress reaches the knee. */
export const TOP_STYLES = ['tee', 'shirt', 'blazer', 'hoodie', 'kaftan', 'dress'] as const;

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

export type SkinTone = (typeof SKIN_TONES)[number];
export type FaceShape = (typeof FACE_SHAPES)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type FacialHair = (typeof FACIAL_HAIR)[number];
export type Glasses = (typeof GLASSES)[number];
export type Headwear = (typeof HEADWEAR)[number];
export type TopStyle = (typeof TOP_STYLES)[number];

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
}

const colour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((s) => s.toLowerCase());

/** One look, every part named (validated at the trust boundary). */
export const appearanceSchema = z.object({
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
 * The look a seed gives: a pure function of the seed (and gender, when it's
 * known), so a player who never opened the creator, an AI founder or a
 * stranger on the pavement looks the same to everyone, every time.
 * Without a gender, one follows from the seed.
 */
export function defaultAppearance(seed: string, gender?: Gender | null): Appearance {
  const h = hashString(seed);
  const g: Gender = gender ?? seedGender(seed);
  const female = g === 'female';
  // Its own hash: bits of `h` follow the seed's text closely, which gave
  // whole runs of similar ids (and far more men than women) grey hair.
  const grey = hashString(`${seed}:grey`) % 16 === 0;
  return {
    skin: at(SKIN_TONES, h),
    face: at(FACE_SHAPES, h >>> 13),
    hairStyle: at(female ? FEMALE_HAIR : MALE_HAIR, h >>> 9),
    hairColor: grey ? '#9ca3af' : at(HAIR_COLOURS.slice(0, 4), h >>> 5),
    facialHair: female ? 'none' : at(MALE_FACIAL, h >>> 16),
    glasses: (h >>> 19) % 5 === 0 ? (((h >>> 22) & 1) === 1 ? 'round' : 'square') : 'none',
    // Headwear only when a player picks it: a seeded crowd shows its hair.
    headwear: 'none',
    topStyle: at(female ? FEMALE_TOPS : MALE_TOPS, h >>> 26),
    topColor: at(TOP_COLOURS, (h >>> 28) ^ (h >>> 11)),
  };
}

/** The gender a seed gives a person whose gender isn't known (half and half). */
export const seedGender = (seed: string): Gender =>
  ((hashString(seed) >>> 3) & 1) === 1 ? 'female' : 'male';

/** The seed a player's default look comes from (their id and background). */
export const appearanceSeed = (p: { id: string; backgroundId?: string }) =>
  `${p.id}:${p.backgroundId ?? ''}`;
