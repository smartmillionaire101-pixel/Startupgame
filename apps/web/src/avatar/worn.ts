/**
 * What you wear from your wardrobe (the engine's `WORN`: shoes, jeans, a
 * belt, socks, a scarf, a bag, a watch, jewellery), as colours the drawings
 * share: the map figure and cards (../city/art.tsx), the portrait
 * (./portrait.ts) and both 3D people (../interiors3d/character.ts,
 * ../three-kit/character.ts). Missing or 'none' is drawn as before.
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
};
export const shoeColour = (s?: string) => SHOE_COLOUR[s ?? ''] ?? PLAIN_SHOES;

/** Jeans: denim over the outfit's trousers. */
export const DENIM = '#36588f';

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
};

export const SILVER = '#d1d5db';
const GOLD = '#f5b301';
export const necklaceColour = (s?: string) => (s === 'gold' ? GOLD : SILVER);
export const SCARF_COLOUR = '#c026d3';
export const BELT_COLOUR = '#3f2a14';
export const BEADS = '#f97316';
export const DIAMOND = '#e0f2fe';
