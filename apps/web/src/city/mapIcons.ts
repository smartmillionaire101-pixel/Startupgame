/**
 * Map badges: each place on the city map is a small round icon (its
 * category's colour as the ring) instead of a long name pill. Money places
 * (funds, accelerators and LPs, lenders, players' banks, mobile-money
 * agents) are gold discs. Pure: no React, no DOM (the maps and the Map key
 * read it).
 */
import { CATEGORY_COLOR } from './contract';
import type { Place } from './layout';

/** Icon per business kind (packages/engine/src/data/businesses.ts kinds). */
export const BIZ_ICON: Record<string, string> = {
  // Cafés and bakeries.
  cafe: '☕',
  'coffee-chain': '☕',
  'coffee-roaster': '☕',
  caff: '☕',
  bakery: '🥖',
  // Restaurants and street food.
  restaurant: '🍽️',
  'curry-house': '🍽️',
  buka: '🍲',
  'chop-bar': '🍲',
  koshary: '🍲',
  'grill-house': '🍖',
  'dim-sum': '🥟',
  taqueria: '🌮',
  'suya-spot': '🍢',
  'waakye-stand': '🍢',
  kibanda: '🍢',
  shawarma: '🌯',
  'food-truck': '🚚',
  // Nightlife.
  bar: '🍸',
  lounge: '🍸',
  'lounge-bar': '🍸',
  pub: '🍺',
  nightclub: '🪩',
  karaoke: '🎤',
  'live-music': '🎶',
  // Shops.
  grocer: '🛒',
  'corner-shop': '🛒',
  boutique: '🛍️',
  'fabric-stall': '🛍️',
  'souk-stall': '🛍️',
  mall: '🛍️',
  electronics: '📱',
  'appliance-store': '📺',
  'furniture-store': '🛋️',
  'car-dealer': '🚗',
  'car-dealership': '🚗',
  'bike-shop': '🚲',
  'market-stall': '🧺',
  // Health.
  clinic: '🏥',
  gym: '🏋️',
  'studio-gym': '🏋️',
  dentist: '🦷',
  pharmacy: '💊',
  spa: '💆',
  'climbing-gym': '🧗',
  'football-pitch': '⚽',
  // Services.
  salon: '✂️',
  barber: '✂️',
  tailor: '🧵',
  laundry: '🧺',
  'print-shop': '🖨️',
  'art-gallery': '🖼️',
  'phone-repair': '🔧',
  'mobile-money-agent': '🏦',
  // Work and trades.
  'co-working': '💼',
  'tech-campus': '💼',
  mechanic: '🔧',
  workshop: '🔧',
  'builders-merchant': '🧱',
  // Education.
  tutoring: '🎓',
  school: '🎓',
  bootcamp: '🎓',
  // Logistics.
  'courier-depot': '🛵',
  'transport-depot': '🚌',
  warehouse: '📦',
  'cold-store': '📦',
  // Stays and fun.
  hotel: '🛏️',
  guesthouse: '🛏️',
  'co-living': '🛏️',
  'event-venue': '🎉',
  ballroom: '🎉',
  cinema: '🎬',
  arcade: '🎳',
  'beach-club': '🏖️',
  marina: '⛵',
  'private-terminal': '🛩️',
  'golf-club': '⛳',
  // The jobs rework: professional employers.
  'employer-bank': '🏦',
  'employer-investment': '📈',
  'employer-tech': '💻',
  'employer-engineering': '🏗️',
  'employer-consultancy': '📊',
  'employer-law': '⚖️',
  'employer-hospital': '🏥',
};

/** Places that aren't businesses, by kind. */
const KIND_ICON: Partial<Record<Place['kind'], string>> = {
  hub: '🚀',
  newsstand: '📰',
  eventhall: '🎤',
  airport: '✈️',
  golf: '⛳',
  mall: '🛍️',
  stall: '🧺',
  office: '🏢',
  home: '🏠',
  fund: '💰',
  capital: '💰',
  lender: '🏦',
  playerbank: '🏦',
};

/** Ring colours for places that aren't businesses. */
const KIND_RING: Partial<Record<Place['kind'], string>> = {
  hub: '#0f766e',
  newsstand: '#7c3aed',
  eventhall: '#7c3aed',
  airport: '#0f766e',
  golf: '#ca8a04',
  mall: '#db2777',
  stall: '#db2777',
  office: '#0f172a',
  home: '#0f766e',
};

export const FALLBACK_ICON = '📍';
/** The gold disc's ring. */
export const MONEY_RING = '#c2410c';
const PLAIN_RING = '#475569';

/** The icon for a business kind (the fallback pin when it's unknown). */
export const bizIcon = (kind: string | undefined) => (kind && BIZ_ICON[kind]) || FALLBACK_ICON;

export interface Badge {
  icon: string;
  /** The ring's colour (the category's, for a business). */
  ring: string;
  /** A gold disc: somewhere with money (funds, banks). */
  money: boolean;
}

type BadgePlace = Pick<Place, 'id' | 'kind' | 'category'> & { bizKind?: string };

/** A place's badge on the map. `market` is the Market's own label (no place). */
export function placeBadge(p: BadgePlace | null): Badge {
  if (!p) return { icon: '🧺', ring: CATEGORY_COLOR.retail, money: false };
  const money =
    p.kind === 'fund' ||
    p.kind === 'capital' ||
    p.kind === 'lender' ||
    p.kind === 'playerbank' ||
    p.bizKind === 'mobile-money-agent';
  const icon =
    p.kind === 'business'
      ? bizIcon(p.bizKind)
      : (KIND_ICON[p.kind] ?? (p.id.startsWith('stall:') ? '🧺' : FALLBACK_ICON));
  const ring = money
    ? MONEY_RING
    : p.category
      ? CATEGORY_COLOR[p.category]
      : (KIND_RING[p.kind] ?? PLAIN_RING);
  return { icon, ring, money };
}

/** Places that always show their name (your home and your company). */
export const ALWAYS_NAMED: readonly string[] = ['home', 'office'];
