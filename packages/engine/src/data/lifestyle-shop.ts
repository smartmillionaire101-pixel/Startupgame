/**
 * The lifestyle shop (Wave 5): furniture for your apartment and a car.
 *
 * Furniture comes in nine slots and three quality tiers; one item per slot.
 * Prices are in cost-of-living units (one adult's monthly living costs in
 * that city), so a sofa is the same effort to buy everywhere. Cars are priced
 * in cost-of-living units too, scaled per market: a car costs many more
 * months of living in Freetown than in London. Names are local flavour, never
 * real brands.
 */
import type { MarketId } from './markets.js';

export type FurnitureSlot =
  'sofa' | 'bed' | 'desk' | 'tv' | 'plants' | 'art' | 'kitchen' | 'sound' | 'gaming';

export const FURNITURE_SLOTS: readonly FurnitureSlot[] = [
  'sofa',
  'bed',
  'desk',
  'tv',
  'plants',
  'art',
  'kitchen',
  'sound',
  'gaming',
];

export type Tier = 1 | 2 | 3;

export interface FurnitureItem {
  /** `${slot}-${tier}`, e.g. 'sofa-2'. */
  id: string;
  slot: FurnitureSlot;
  tier: Tier;
  /** Translatable. */
  label: string;
  priceCol: number;
  /** Comfort points (adds up across slots; see `comfortOf`). */
  comfort: number;
}

/** Labels per slot and tier (basic, good, luxury), and the price of the basic one. */
const FURNITURE_SPEC: Record<
  FurnitureSlot,
  { labels: [string, string, string]; priceCol: number }
> = {
  sofa: {
    labels: ['Second-hand sofa', 'Comfy fabric sofa', 'Designer leather sofa'],
    priceCol: 0.25,
  },
  bed: {
    labels: ['Simple bed frame', 'Queen bed and good mattress', 'King bed, hotel linen'],
    priceCol: 0.3,
  },
  desk: {
    labels: ['Folding desk', 'Solid wood desk and chair', 'Standing desk, ergonomic chair'],
    priceCol: 0.15,
  },
  tv: { labels: ['Small TV', 'Big smart TV', 'Home cinema screen'], priceCol: 0.2 },
  plants: { labels: ['A few pot plants', 'Indoor jungle', 'Designer planters'], priceCol: 0.04 },
  art: { labels: ['Posters', 'Prints by local artists', 'An original painting'], priceCol: 0.05 },
  kitchen: {
    labels: ['Pots and a hotplate', 'Fitted kitchen kit', 'Chef’s kitchen'],
    priceCol: 0.25,
  },
  sound: { labels: ['Bluetooth speaker', 'Hi-fi system', 'Studio monitors'], priceCol: 0.08 },
  gaming: {
    labels: ['Second-hand console', 'New console and a big chair', 'Gaming PC rig'],
    priceCol: 0.2,
  },
};

/** Price multiple per tier (basic, good, luxury). */
const TIER_PRICE: Record<Tier, number> = { 1: 1, 2: 3, 3: 8 };

export const FURNITURE: FurnitureItem[] = FURNITURE_SLOTS.flatMap((slot) =>
  ([1, 2, 3] as Tier[]).map((tier) => ({
    id: `${slot}-${tier}`,
    slot,
    tier,
    label: FURNITURE_SPEC[slot].labels[tier - 1]!,
    priceCol: Math.round(FURNITURE_SPEC[slot].priceCol * TIER_PRICE[tier] * 1000) / 1000,
    comfort: tier,
  })),
);

const FURNITURE_BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));
export const furnitureItem = (id: string) => FURNITURE_BY_ID.get(id);

/** Most comfort points a home can have (luxury in every slot). */
export const MAX_COMFORT_POINTS = FURNITURE_SLOTS.length * 3;

// ---------------------------------------------------------------- Cars

export type CarModelId =
  'motorbike' | 'hatchback' | 'ride-hail-sedan' | 'city-suv' | 'electric' | 'luxury';

export const CAR_MODEL_IDS: readonly CarModelId[] = [
  'motorbike',
  'hatchback',
  'ride-hail-sedan',
  'city-suv',
  'electric',
  'luxury',
];

interface CarBase {
  /** Price in cost-of-living units in a rich market (scaled by CAR_PRICE_FACTOR). */
  priceCol: number;
  /** Monthly fuel, insurance and upkeep in COL units (scaled by CAR_RUNNING_FACTOR). */
  runningCol: number;
  /** Status points shown on your profile. */
  status: number;
}

const CAR_BASE: Record<CarModelId, CarBase> = {
  motorbike: { priceCol: 1.2, runningCol: 0.03, status: 2 },
  hatchback: { priceCol: 4, runningCol: 0.07, status: 4 },
  'ride-hail-sedan': { priceCol: 6, runningCol: 0.09, status: 5 },
  'city-suv': { priceCol: 9, runningCol: 0.13, status: 8 },
  electric: { priceCol: 11, runningCol: 0.05, status: 9 },
  luxury: { priceCol: 22, runningCol: 0.22, status: 15 },
};

/** Cars cost more months of living where living is cheap. */
const CAR_PRICE_FACTOR: Record<MarketId, number> = {
  london: 1,
  'san-francisco': 1,
  dubai: 0.8,
  johannesburg: 1.6,
  cairo: 2.2,
  lagos: 2.4,
  nairobi: 2.2,
  accra: 2.3,
  kigali: 2.4,
  freetown: 2.6,
};

const CAR_RUNNING_FACTOR: Record<MarketId, number> = {
  london: 1,
  'san-francisco': 1,
  dubai: 0.7,
  johannesburg: 1.3,
  cairo: 1.2,
  lagos: 1.6,
  nairobi: 1.5,
  accra: 1.5,
  kigali: 1.6,
  freetown: 1.8,
};

/** Local names per market (no real brands). */
const CAR_NAMES: Record<MarketId, Record<CarModelId, string>> = {
  london: {
    motorbike: 'Courier scooter',
    hatchback: 'Thames runabout hatchback',
    'ride-hail-sedan': 'Minicab saloon',
    'city-suv': 'Chelsea tractor SUV',
    electric: 'Ultra-low-emission electric',
    luxury: 'Mayfair grand tourer',
  },
  lagos: {
    motorbike: 'Okada motorbike',
    hatchback: 'Tokunbo hatchback',
    'ride-hail-sedan': 'Ride-hail saloon',
    'city-suv': 'Lekki jeep',
    electric: 'Solar-charged electric',
    luxury: 'Banana Island land cruiser',
  },
  nairobi: {
    motorbike: 'Boda boda motorbike',
    hatchback: 'Mitumba hatchback',
    'ride-hail-sedan': 'Ride-hail saloon',
    'city-suv': 'Safari-ready SUV',
    electric: 'Green-line electric',
    luxury: 'Muthaiga luxury saloon',
  },
  accra: {
    motorbike: 'Okada motorbike',
    hatchback: 'Home-used hatchback',
    'ride-hail-sedan': 'Ride-hail saloon',
    'city-suv': 'East Legon SUV',
    electric: 'Coastal electric',
    luxury: 'Trasacco luxury cruiser',
  },
  freetown: {
    motorbike: 'Okada motorbike',
    hatchback: 'Used hatchback',
    'ride-hail-sedan': 'Poda-poda-proof saloon',
    'city-suv': 'Hill Station jeep',
    electric: 'Peninsula electric',
    luxury: 'Aberdeen luxury cruiser',
  },
  kigali: {
    motorbike: 'Moto taxi bike',
    hatchback: 'Hills hatchback',
    'ride-hail-sedan': 'Ride-hail saloon',
    'city-suv': 'Thousand-hills SUV',
    electric: 'Kigali e-car',
    luxury: 'Nyarutarama luxury saloon',
  },
  johannesburg: {
    motorbike: 'Delivery scooter',
    hatchback: 'Jozi city hatch',
    'ride-hail-sedan': 'Ride-hail sedan',
    'city-suv': 'Highveld SUV',
    electric: 'Solar-age electric',
    luxury: 'Sandton sports saloon',
  },
  cairo: {
    motorbike: 'Delivery scooter',
    hatchback: 'Nile city hatchback',
    'ride-hail-sedan': 'Ride-hail sedan',
    'city-suv': 'Desert-road SUV',
    electric: 'New Capital electric',
    luxury: 'Zamalek luxury saloon',
  },
  dubai: {
    motorbike: 'Delivery bike',
    hatchback: 'Compact hatchback',
    'ride-hail-sedan': 'Ride-hail sedan',
    'city-suv': 'Dune-bashing SUV',
    electric: 'Smart-city electric',
    luxury: 'Palm supercar',
  },
  'san-francisco': {
    motorbike: 'City scooter',
    hatchback: 'Bay Area hatchback',
    'ride-hail-sedan': 'Rideshare sedan',
    'city-suv': 'Weekend Tahoe SUV',
    electric: 'Valley electric',
    luxury: 'Pacific Heights roadster',
  },
};

export interface CarModel {
  id: CarModelId;
  /** Translatable. */
  label: string;
  priceCol: number;
  runningCol: number;
  status: number;
}

/** The car catalogue for a market, in that market's cost-of-living units. */
export function carsFor(market: MarketId): CarModel[] {
  return CAR_MODEL_IDS.map((id) => ({
    id,
    label: CAR_NAMES[market]?.[id] ?? id,
    priceCol: Math.round(CAR_BASE[id].priceCol * (CAR_PRICE_FACTOR[market] ?? 1) * 100) / 100,
    runningCol:
      Math.round(CAR_BASE[id].runningCol * (CAR_RUNNING_FACTOR[market] ?? 1) * 1000) / 1000,
    status: CAR_BASE[id].status,
  }));
}

export const carModel = (market: MarketId, id: string): CarModel | undefined =>
  carsFor(market).find((c) => c.id === id);

/** Share of the price you get back when replacing furniture or a car. */
export const SELL_BACK = { furniture: 0.4, car: 0.5 } as const;
