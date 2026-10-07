/**
 * Wave 10: every city's property market.
 *
 * Real neighbourhoods (and real streets in them), each mapped to the district
 * of the city plan it sits in, so the map can show a home where it really is.
 * `apartment` is what a typical two-bed flat there costs, in local currency
 * (major units, 2025–26 asking prices, rounded); other tiers scale from it
 * (`TIER_PRICE`). Neighbourhoods only list the kinds of home they really
 * have: Sea Cliff and Emirates Hills are houses, SoMa is lofts and flats.
 */
import type { MarketId } from './markets.js';
import type { PropertyTier } from '../types.js';

export interface Neighbourhood {
  name: string;
  /** District id from the city plan (`CITY_DISTRICTS`). */
  district: string;
  /** A typical two-bed apartment here, local major units. */
  apartment: number;
  tiers: readonly PropertyTier[];
  streets: readonly string[];
}

/** Price of each tier relative to a two-bed apartment in the same neighbourhood. */
export const TIER_PRICE: Record<PropertyTier, number> = {
  studio: 0.45,
  apartment: 1,
  townhouse: 1.9,
  villa: 3.2,
  mansion: 6.5,
  penthouse: 3,
};

export const TIER_LABEL: Record<PropertyTier, string> = {
  studio: 'Studio',
  apartment: 'Apartment',
  townhouse: 'Townhouse',
  villa: 'Villa',
  mansion: 'Mansion',
  penthouse: 'Penthouse',
};

export const TIER_BEDROOMS: Record<PropertyTier, number> = {
  studio: 0,
  apartment: 2,
  townhouse: 3,
  villa: 5,
  mansion: 7,
  penthouse: 3,
};

/** Monthly running costs (service charge, rates, insurance, repairs) as a share of the price. */
export const TIER_UPKEEP: Record<PropertyTier, number> = {
  studio: 0.0011,
  apartment: 0.0012,
  townhouse: 0.0013,
  villa: 0.0016,
  mansion: 0.002,
  penthouse: 0.0015,
};

/** The lifestyle tier living in a home of this tier gives you (1 Lean … 5 Lavish). */
export const TIER_LIFESTYLE: Record<PropertyTier, number> = {
  studio: 1,
  apartment: 2,
  townhouse: 3,
  villa: 4,
  penthouse: 4,
  mansion: 5,
};

/** Gross rental yield a year, by city. */
export const RENT_YIELD: Record<MarketId, number> = {
  lagos: 0.065,
  nairobi: 0.065,
  london: 0.035,
  accra: 0.07,
  freetown: 0.08,
  kigali: 0.07,
  johannesburg: 0.085,
  cairo: 0.06,
  dubai: 0.06,
  'san-francisco': 0.035,
};

/** Monthly drift (mean) and volatility of each city's price index. */
export const PRICE_TREND: Record<MarketId, { drift: number; vol: number }> = {
  lagos: { drift: 0.006, vol: 0.02 },
  nairobi: { drift: 0.004, vol: 0.012 },
  london: { drift: 0.002, vol: 0.008 },
  accra: { drift: 0.005, vol: 0.015 },
  freetown: { drift: 0.004, vol: 0.02 },
  kigali: { drift: 0.005, vol: 0.012 },
  johannesburg: { drift: 0.002, vol: 0.01 },
  cairo: { drift: 0.007, vol: 0.02 },
  dubai: { drift: 0.006, vol: 0.015 },
  'san-francisco': { drift: 0.002, vol: 0.012 },
};

/** Taxes and fees on a purchase (stamp duty, transfer tax, legal) as a share of the price. */
export const BUY_COSTS = 0.03;
/** Agent's fee on a sale. */
export const SELL_FEE = 0.02;
/** Mortgage spread over the policy rate, and the limits. */
export const MORTGAGE = {
  spreadBps: 300,
  minDownPct: 20,
  minMonths: 60,
  maxMonths: 360,
  /** After the down payment you must hold this many monthly payments in reserve. */
  reserveMonths: 6,
  /** Missed payments in a row before the bank repossesses. */
  repossessAfter: 3,
  /** A repossession sells at this share of the price. */
  repossessionPrice: 0.85,
} as const;
/** Living in a home you own saves the rent part of your living costs. */
export const OWNER_LIVING_DISCOUNT = 0.4;
/** Chance a let property has a tenant in a given month. */
export const OCCUPANCY = 0.92;

const n = (
  name: string,
  district: string,
  apartment: number,
  tiers: PropertyTier[],
  streets: string[],
): Neighbourhood => ({ name, district, apartment, tiers, streets });

export const NEIGHBOURHOODS: Record<MarketId, readonly Neighbourhood[]> = {
  'san-francisco': [
    n('Pacific Heights', 'presidio', 1_900_000, ['apartment', 'townhouse', 'mansion'], [
      'Broadway',
      'Vallejo Street',
      'Pacific Avenue',
    ]),
    n('Sea Cliff', 'presidio', 2_400_000, ['townhouse', 'villa', 'mansion'], [
      'Sea Cliff Avenue',
      'El Camino del Mar',
    ]),
    n('Nob Hill', 'chinatown', 1_500_000, ['studio', 'apartment', 'penthouse'], [
      'California Street',
      'Sacramento Street',
    ]),
    n('SoMa lofts', 'soma', 950_000, ['studio', 'apartment', 'penthouse'], [
      'Brannan Street',
      'Townsend Street',
      'Folsom Street',
    ]),
    n('Mission', 'mission', 1_100_000, ['studio', 'apartment', 'townhouse'], [
      'Dolores Street',
      'Guerrero Street',
    ]),
    n('Russian Hill', 'north-beach', 1_700_000, ['apartment', 'penthouse', 'townhouse'], [
      'Lombard Street',
      'Green Street',
    ]),
    n('Dogpatch', 'dogpatch', 1_050_000, ['studio', 'apartment', 'townhouse'], [
      'Tennessee Street',
      '22nd Street',
    ]),
    n('Rincon Hill', 'fidi', 1_300_000, ['apartment', 'penthouse'], ['Harrison Street']),
    n('Dolores Heights', 'castro', 1_600_000, ['apartment', 'townhouse', 'villa'], [
      'Liberty Street',
      'Cumberland Street',
    ]),
  ],
  lagos: [
    n('Banana Island', 'ikoyi', 750_000_000, ['apartment', 'penthouse', 'villa', 'mansion'], [
      'Ocean Parade',
      'Banana Island Road',
    ]),
    n('Ikoyi', 'ikoyi', 450_000_000, ['apartment', 'townhouse', 'villa', 'penthouse'], [
      'Bourdillon Road',
      'Glover Road',
      'Alexander Avenue',
    ]),
    n('Victoria Island', 'victoria-island', 320_000_000, ['studio', 'apartment', 'penthouse'], [
      'Adeola Odeku Street',
      'Ahmadu Bello Way',
    ]),
    n('Lekki Phase 1', 'lekki', 220_000_000, ['apartment', 'townhouse', 'villa'], [
      'Admiralty Way',
      'Fola Osibo Road',
    ]),
    n('Yaba', 'yaba', 70_000_000, ['studio', 'apartment'], ['Herbert Macaulay Way', 'Sabo Road']),
    n('Ikeja GRA', 'ikeja', 150_000_000, ['apartment', 'townhouse', 'villa'], [
      'Isaac John Street',
      'Joel Ogunnaike Street',
    ]),
    n('Surulere', 'surulere', 55_000_000, ['studio', 'apartment', 'townhouse'], [
      'Adeniran Ogunsanya Street',
      'Bode Thomas Street',
    ]),
  ],
  london: [
    n('Mayfair', 'mayfair', 3_200_000, ['apartment', 'townhouse', 'penthouse', 'mansion'], [
      'Mount Street',
      'Grosvenor Square',
      'Park Lane',
    ]),
    n('Hampstead', 'camden', 1_500_000, ['apartment', 'townhouse', 'villa', 'mansion'], [
      'The Bishops Avenue',
      'Heath Street',
      'Frognal',
    ]),
    n('Shoreditch', 'shoreditch', 750_000, ['studio', 'apartment', 'penthouse'], [
      'Curtain Road',
      'Rivington Street',
    ]),
    n('Canary Wharf', 'canary-wharf', 650_000, ['studio', 'apartment', 'penthouse'], [
      'Westferry Circus',
      'Marsh Wall',
    ]),
    n('Bankside', 'southbank', 900_000, ['apartment', 'penthouse'], ['Holland Street', 'Hopton Street']),
    n('Soho', 'soho', 1_100_000, ['studio', 'apartment', 'penthouse'], [
      'Greek Street',
      'Dean Street',
    ]),
  ],
  dubai: [
    n('Palm Jumeirah', 'jumeirah', 4_500_000, ['apartment', 'penthouse', 'villa', 'mansion'], [
      'Frond G',
      'Palm Jumeirah Crescent',
    ]),
    n('Emirates Hills', 'marina', 6_000_000, ['villa', 'mansion'], [
      'Emirates Hills Sector E',
      'Emirates Hills Sector L',
    ]),
    n('Downtown', 'business-bay', 2_600_000, ['studio', 'apartment', 'penthouse'], [
      'Mohammed Bin Rashid Boulevard',
      'Sheikh Zayed Road',
    ]),
    n('Dubai Marina', 'marina', 1_900_000, ['studio', 'apartment', 'penthouse'], [
      'Marina Walk',
      'Al Marsa Street',
    ]),
    n('Jumeirah', 'jumeirah', 3_000_000, ['townhouse', 'villa'], ['Al Wasl Road', 'Jumeirah Beach Road']),
    n('DIFC', 'difc', 2_800_000, ['apartment', 'penthouse'], ['Gate Avenue']),
    n('Dubai Creek Harbour', 'creek', 1_700_000, ['studio', 'apartment', 'penthouse'], [
      'Creek Island',
    ]),
  ],
  nairobi: [
    n('Karen', 'karen', 30_000_000, ['townhouse', 'villa', 'mansion'], [
      'Karen Road',
      'Langata Road',
    ]),
    n('Runda', 'westlands', 35_000_000, ['townhouse', 'villa', 'mansion'], ['Runda Grove']),
    n('Westlands', 'westlands', 14_000_000, ['studio', 'apartment', 'penthouse'], [
      'Waiyaki Way',
      'Rhapta Road',
    ]),
    n('Kilimani', 'kilimani', 11_000_000, ['studio', 'apartment', 'penthouse'], [
      'Argwings Kodhek Road',
      'Lenana Road',
    ]),
    n('Lavington', 'kilimani', 18_000_000, ['apartment', 'townhouse', 'villa'], [
      'James Gichuru Road',
    ]),
    n('Upper Hill', 'upper-hill', 13_000_000, ['apartment', 'penthouse'], ['Ralph Bunche Road']),
  ],
  accra: [
    n('East Legon', 'east-legon', 2_200_000, ['apartment', 'townhouse', 'villa', 'mansion'], [
      'Lagos Avenue',
      'American House Road',
    ]),
    n('Cantonments', 'cantonments', 3_000_000, ['apartment', 'penthouse', 'villa', 'mansion'], [
      'Cantonments Road',
      'Switchback Road',
    ]),
    n('Airport Residential', 'airport-city', 2_600_000, ['apartment', 'townhouse', 'penthouse'], [
      'Patrice Lumumba Road',
      'Liberation Road',
    ]),
    n('Labone', 'osu', 1_600_000, ['apartment', 'townhouse'], ['Labone Crescent']),
    n('Osu', 'osu', 1_100_000, ['studio', 'apartment'], ['Oxford Street', 'Cantonments Road']),
  ],
  freetown: [
    n('Hill Station', 'wilberforce', 4_500_000, ['townhouse', 'villa', 'mansion'], [
      'Hill Station Road',
    ]),
    n('Aberdeen', 'aberdeen', 3_800_000, ['apartment', 'penthouse', 'villa'], [
      'Aberdeen Road',
      'Cape Road',
    ]),
    n('Lumley', 'lumley', 3_000_000, ['apartment', 'townhouse', 'villa'], [
      'Lumley Beach Road',
      'Wilkinson Road',
    ]),
    n('Wilberforce', 'wilberforce', 3_200_000, ['apartment', 'townhouse', 'villa'], [
      'Wilberforce Street',
    ]),
    n('Spur Road', 'congo-cross', 2_600_000, ['apartment', 'townhouse'], ['Spur Road']),
    n('Central Freetown', 'central', 1_500_000, ['studio', 'apartment'], ['Siaka Stevens Street']),
  ],
  kigali: [
    n('Nyarutarama', 'remera', 280_000_000, ['apartment', 'townhouse', 'villa', 'mansion'], [
      'KG 9 Avenue',
      'Golf Course Road',
    ]),
    n('Kiyovu', 'kiyovu', 250_000_000, ['apartment', 'villa', 'mansion'], ['KN 3 Road']),
    n('Kimihurura', 'kimihurura', 200_000_000, ['apartment', 'townhouse', 'villa'], [
      'KG 7 Avenue',
    ]),
    n('Kacyiru', 'kacyiru', 170_000_000, ['apartment', 'townhouse'], ['KG 2 Avenue']),
    n('Nyarugenge', 'nyarugenge', 110_000_000, ['studio', 'apartment', 'penthouse'], [
      'KN 4 Avenue',
    ]),
  ],
  johannesburg: [
    n('Sandhurst', 'sandton', 6_000_000, ['villa', 'mansion'], ['Sandhurst Drive']),
    n('Sandton', 'sandton', 2_800_000, ['apartment', 'townhouse', 'penthouse'], [
      'Rivonia Road',
      'Maude Street',
    ]),
    n('Houghton', 'rosebank', 4_000_000, ['townhouse', 'villa', 'mansion'], [
      'Houghton Drive',
      '12th Avenue',
    ]),
    n('Rosebank', 'rosebank', 2_000_000, ['studio', 'apartment', 'penthouse'], [
      'Oxford Road',
      'Tyrwhitt Avenue',
    ]),
    n('Maboneng', 'maboneng', 1_000_000, ['studio', 'apartment'], ['Fox Street', 'Kruger Street']),
    n('Braamfontein', 'braamfontein', 850_000, ['studio', 'apartment'], ['Juta Street']),
  ],
  cairo: [
    n('Zamalek', 'zamalek', 14_000_000, ['apartment', 'penthouse', 'villa'], [
      '26th of July Street',
      'Abu El Feda Street',
    ]),
    n('Garden City', 'garden-city', 11_000_000, ['apartment', 'penthouse'], [
      'Qasr El Nil Street',
    ]),
    n('Maadi', 'maadi', 9_000_000, ['apartment', 'townhouse', 'villa'], ['Road 9', 'Road 233']),
    n('New Cairo', 'new-cairo', 10_000_000, ['apartment', 'townhouse', 'villa', 'mansion'], [
      'Fifth Settlement',
      'Teseen Street',
    ]),
    n('Heliopolis', 'heliopolis', 7_500_000, ['studio', 'apartment', 'villa'], [
      'Baron Empain Street',
      'El Merghany Street',
    ]),
  ],
};
