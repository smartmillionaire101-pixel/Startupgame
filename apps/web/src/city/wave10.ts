/**
 * Wave 10 §C: the living economy's views, typed from the engine, and the
 * small helpers the Homes, Going out and Competitions screens share.
 */
import type { PlayerView } from '@runway/engine';
import { t } from '../i18n';
import { hereOf } from './travel';

type Market = PlayerView['market'];
export type PropertiesView = Market['properties'];
export type Listing = PropertiesView['listings'][number];
export type CompetitionView = Market['competitions']['list'][number];
export type CompetitionEntryView = CompetitionView['entries'][number];
export type MyProperty = PlayerView['me']['properties'][number];
export type NetWorthView = PlayerView['me']['netWorth'];
export type ExpansionView = PlayerView['companies'][number]['expansion'];
export type BranchRow = ExpansionView['branches'][number];

/** The property market of the city you're in (null on an older server). */
export const propertiesHere = (view: PlayerView): PropertiesView | null =>
  (hereOf(view) as Partial<Market>).properties ?? null;

/** Pitch competitions in the city you're in. */
export const competitionsHere = (view: PlayerView): CompetitionView[] =>
  (hereOf(view) as Partial<Market>).competitions?.list ?? [];

export const myProperties = (view: PlayerView): MyProperty[] =>
  (view.me as Partial<PlayerView['me']>).properties ?? [];

/** 'victoria-island' → 'Victoria Island'. */
export const districtName = (d: string) =>
  d
    .split('-')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');

/** A city's name from what the view knows. */
export function cityName(view: PlayerView, id: string): string {
  if (id === view.market.id) return view.market.name;
  if (id === hereOf(view).id) return hereOf(view).name;
  const d = view.me.destinations.find((x) => x.id === id);
  return d?.name ?? districtName(id);
}

// ---------------------------------------------------------------- Property tiers

export const PROPERTY_TIER_ORDER = [
  'studio',
  'apartment',
  'townhouse',
  'villa',
  'penthouse',
  'mansion',
] as const;

export const tierName = (tier: string) =>
  (
    ({
      studio: t('Studio'),
      apartment: t('Apartment'),
      townhouse: t('Townhouse'),
      villa: t('Villa'),
      mansion: t('Mansion'),
      penthouse: t('Penthouse'),
    }) as Record<string, string>
  )[tier] ?? districtName(tier);

/** The 3D floor plan's tier (1–5) for a property tier. */
export const planTierOf = (tier: string): number =>
  ({ studio: 1, apartment: 2, townhouse: 3, villa: 4, mansion: 5, penthouse: 5 })[tier] ?? 2;

/** The extras around the house: a pool and garden for a villa or mansion, a terrace up high. */
export const estateOf = (tier: string): 'villa' | 'mansion' | 'penthouse' | null =>
  tier === 'villa' || tier === 'mansion' || tier === 'penthouse' ? tier : null;

/** Monthly payment for a loan (the engine's formula: an annuity, rounded up). */
export function monthlyPayment(principal: number, rateBps: number, months: number): number {
  const r = rateBps / 10_000 / 12;
  if (months <= 0) return 0;
  if (r === 0) return Math.ceil(principal / months);
  return Math.ceil((principal * r) / (1 - Math.pow(1 + r, -months)));
}

// ---------------------------------------------------------------- Lifestyle tiers

export function lifestyleName(view: PlayerView, tier: number): string {
  const row = view.lifestyleTiers.find((x) => x.tier === tier);
  return row ? lifestyleLabel(row.name) : String(tier);
}

export const lifestyleLabel = (name: string) =>
  (
    ({
      Lean: t('Lean'),
      Modest: t('Modest'),
      Comfortable: t('Comfortable'),
      Affluent: t('Affluent'),
      Lavish: t('Lavish'),
    }) as Record<string, string>
  )[name] ?? name;

export const myLifestyleTier = (view: PlayerView): number => view.me.lifestyle?.tier ?? 1;
