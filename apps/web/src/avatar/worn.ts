/**
 * What you wear from your wardrobe (the engine's `WORN`: shoes, jeans, a
 * belt, socks, a scarf, a bag, a watch, jewellery), as colours the drawings
 * share: the map figure and cards (../city/art.tsx), the portrait
 * (./portrait.ts) and both 3D people (../interiors3d/character.ts,
 * ../three-kit/character.ts). Missing or 'none' is drawn as before. The
 * feedback round's suit shop adds Oxfords and courts, chinos and joggers, a
 * tie, a briefcase, a folio and a work tote.
 */
import { WORN_SLOTS, type Appearance, type WornSlot } from '@runway/engine';

export type Worn = Partial<Pick<Appearance, WornSlot>>;

/** The parts a look wears, without the ones it doesn't (for spreading into a look). */
export function wornOf(a: Worn): Worn {
  const out: Record<string, string> = {};
  for (const k of WORN_SLOTS) {
    const v = a[k];
    if (v && v !== 'none') out[k] = v;
  }
  return out as Worn;
}

/** Plain shoes (nothing from the wardrobe on). */
const PLAIN_SHOES = '#111827';

const SHOE_COLOUR: Record<string, string> = {
  trainers: '#e2e8f0',
  running: '#2563eb',
  sneakers: '#f8fafc',
  sandals: '#a16207',
  flipflops: '#0ea5e9',
  loafers: '#5b3416',
  heels: '#b91c1c',
  boots: '#4a2f1b',
  oxfords: '#0b0b0d',
  courts: '#111111',
};
export const shoeColour = (s?: string) => SHOE_COLOUR[s ?? ''] ?? PLAIN_SHOES;

/** Jeans: denim over the outfit's trousers. */
export const DENIM = '#36588f';
/** Chinos (stone) and joggers (charcoal marl), over the outfit's trousers too. */
export const CHINO = '#c8b48a';
export const JOGGER = '#3f4652';
/** The trousers a worn `legs` part draws (none: the outfit's own). */
export const legsColour = (s?: string): string | undefined =>
  s === 'jeans' ? DENIM : s === 'chinos' ? CHINO : s === 'joggers' ? JOGGER : undefined;

/** Ties by style: silk (burgundy), a navy knit, a black bow tie. */
export const TIE_COLOUR: Record<string, string> = {
  silk: '#991b1b',
  navy: '#1e3a8a',
  bow: '#0b0b0d',
};
/** What's under a suit or blazer: a white shirt (a woman's suit: an ivory blouse). */
export const SHIRT_WHITE = '#f8fafc';
export const BLOUSE_IVORY = '#f5efe4';

export const WATCH_COLOUR: Record<string, string> = {
  everyday: '#94a3b8',
  smart: '#111827',
  dress: '#d4a017',
  luxury: '#fbbf24',
};

export const BAG_COLOUR: Record<string, string> = {
  tote: '#e7d8b5',
  handbag: '#7c2d12',
  gymbag: '#1f2937',
  briefcase: '#3b2416',
  folio: '#7c4a1e',
  worktote: '#1c1814',
};

export const SILVER = '#d1d5db';
const GOLD = '#f5b301';
export const necklaceColour = (s?: string) => (s === 'gold' ? GOLD : SILVER);
export const SCARF_COLOUR = '#c026d3';
export const BELT_COLOUR = '#3f2a14';
export const BEADS = '#f97316';
export const DIAMOND = '#e0f2fe';
