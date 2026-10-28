/**
 * Who each customer segment is in the city (round 7, player feedback: "a
 * health-tech company gets Bankside Bathhouse Spa and Waterloo Workspace as
 * leads"). The kinds of local business (./businesses.ts) that are a segment's
 * buyers: a healthtech company's private-clinic leads are clinics, dentists,
 * pharmacies and hospitals, its staff-health leads are big employers, and a
 * spa or a co-working space is no healthtech customer at all.
 *
 * A segment with no business kinds here (families, parents, urban shoppers,
 * smallholder farmers) buys as households and people: its leads are made up
 * with the contact's name (sales.ts leadName), never a local business.
 *
 * Gameplay-note worlds only (releases.ts GAMEPLAY_NOTE): before it, leads
 * came from any business whose spending (`buys`) named the industry, with a
 * segment drawn at random.
 */
import type { Industry } from './industries.js';

const EMPLOYERS = [
  'employer-bank',
  'employer-investment',
  'employer-tech',
  'employer-engineering',
  'employer-consultancy',
  'employer-law',
  'employer-hospital',
  'tech-campus',
] as const;

const FOOD = [
  'restaurant',
  'cafe',
  'bakery',
  'pub',
  'bar',
  'buka',
  'suya-spot',
  'grill-house',
  'chop-bar',
  'waakye-stand',
  'kibanda',
  'koshary',
  'shawarma',
  'taqueria',
  'dim-sum',
  'curry-house',
  'caff',
  'food-truck',
  'lounge-bar',
  'lounge',
  'coffee-chain',
] as const;

const SHOPS = [
  'corner-shop',
  'grocer',
  'market-stall',
  'fabric-stall',
  'souk-stall',
  'boutique',
  'electronics',
  'bike-shop',
  'phone-repair',
  'appliance-store',
  'furniture-store',
] as const;

const SERVICES = ['salon', 'barber', 'tailor', 'laundry', 'print-shop', 'mechanic'] as const;

const VENUES = [
  'hotel',
  'guesthouse',
  'event-venue',
  'co-living',
  'nightclub',
  'cinema',
  'live-music',
  'karaoke',
  'arcade',
  'bowling-alley',
  'beach-club',
  'gym',
  'climbing-gym',
  'studio-gym',
  'spa',
  'football-pitch',
  'co-working',
  'art-gallery',
] as const;

/** Segment → the kinds of local business that are its buyers. */
export const SEGMENT_BUYERS: Record<string, readonly string[]> = {
  // Fintech: market traders and micro businesses, shops that sell online, distributors.
  'fintech.traders': [
    'market-stall',
    'fabric-stall',
    'souk-stall',
    'corner-shop',
    'phone-repair',
    'mobile-money-agent',
    'tailor',
    'barber',
    'salon',
    'buka',
    'suya-spot',
    'chop-bar',
    'waakye-stand',
    'kibanda',
    'koshary',
    'food-truck',
  ],
  'fintech.online-sellers': [
    'boutique',
    'electronics',
    'bike-shop',
    'art-gallery',
    'appliance-store',
    'furniture-store',
  ],
  'fintech.distributors': [
    'warehouse',
    'builders-merchant',
    'cold-store',
    'coffee-roaster',
    'transport-depot',
    'car-dealer',
    'car-dealership',
  ],
  // E-commerce: shops that restock, and brands that sell through them.
  'ecommerce.urban': [],
  'ecommerce.retailers': [...SHOPS, 'builders-merchant'],
  'ecommerce.brands': ['coffee-roaster', 'coffee-chain', 'appliance-store', 'furniture-store'],
  // Logistics: shops that ship parcels, shops that need pickups, big shippers.
  'logistics.sellers': [
    'boutique',
    'electronics',
    'bakery',
    'print-shop',
    'art-gallery',
    'bike-shop',
    'phone-repair',
    'pharmacy',
  ],
  'logistics.retailers': [
    'corner-shop',
    'grocer',
    'market-stall',
    'fabric-stall',
    'souk-stall',
    'restaurant',
    'cafe',
    'pub',
    'bar',
  ],
  'logistics.shippers': [
    'warehouse',
    'cold-store',
    'builders-merchant',
    'coffee-roaster',
    'appliance-store',
    'furniture-store',
    'employer-engineering',
    'workshop',
  ],
  // Health: families at home; clinics, dentists, pharmacies and hospitals; employers.
  'healthtech.families': [],
  'healthtech.clinics': ['clinic', 'dentist', 'pharmacy', 'employer-hospital'],
  'healthtech.employers': EMPLOYERS.filter((k) => k !== 'employer-hospital'),
  // Education: parents at home; schools and tutoring centres; companies that train staff.
  'edtech.parents': [],
  'edtech.schools': ['school', 'tutoring', 'bootcamp'],
  'edtech.corporate': [...EMPLOYERS, 'hotel'],
  // Business software: one-person trades, small businesses, bigger companies.
  'saas.solo': [...SERVICES, 'phone-repair', 'art-gallery'],
  'saas.smes': [
    ...FOOD.filter((k) =>
      ['restaurant', 'cafe', 'bakery', 'pub', 'bar', 'coffee-chain'].includes(k),
    ),
    ...VENUES,
    'boutique',
    'electronics',
    'pharmacy',
    'clinic',
    'dentist',
    'workshop',
    'tutoring',
    'courier-depot',
  ],
  'saas.midmarket': [
    ...EMPLOYERS,
    'warehouse',
    'transport-depot',
    'marina',
    'golf-club',
    'ballroom',
    'private-terminal',
    'heliport',
    'skydive-centre',
    'car-dealership',
  ],
  // Agriculture: farmers; kitchens and grocers that buy fresh produce; processors.
  'agritech.farmers': [],
  'agritech.food-retail': [
    ...FOOD,
    'grocer',
    'corner-shop',
    'market-stall',
    'hotel',
    'guesthouse',
    'event-venue',
    'beach-club',
    'ballroom',
  ],
  'agritech.processors': ['coffee-roaster', 'cold-store'],
};

/** The segment of `industry` a kind of business buys as, or null if it doesn't buy from it. */
export function buyerSegment(
  industry: Industry,
  kind: string,
  among?: readonly string[],
): string | null {
  for (const [key, kinds] of Object.entries(SEGMENT_BUYERS)) {
    if (!key.startsWith(`${industry}.`)) continue;
    if (among && !among.includes(key)) continue;
    if (kinds.includes(kind)) return key;
  }
  return null;
}
