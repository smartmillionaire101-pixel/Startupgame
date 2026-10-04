/**
 * The city economy (Wave 3): the local businesses that fill every city.
 *
 * Kinds describe what a business is (what it sells, roughly how big it is,
 * what it spends on startup products, the gigs it offers and how it looks);
 * seeds name the actual places in each city, with the district they stand in
 * (district ids from the web's city plans) and their AI owner. Every name is
 * fictional but meant to feel of its city. Amounts are in cost-of-living
 * units (one single adult's monthly living costs in that city), so a café
 * is about the same size relative to its city everywhere.
 */
import type { Industry } from './industries.js';

export type BusinessCategory =
  | 'food' // restaurant, café, street food, bakery, pub/bar
  | 'retail' // grocer, market stall, boutique, electronics, pharmacy
  | 'services' // salon, laundry, tailor, repair shop, print shop
  | 'trades' // workshop, builder's merchant, mechanic
  | 'health' // clinic, dentist, gym
  | 'education' // tutoring centre, private school, coding bootcamp
  | 'logistics' // courier depot, warehouse
  | 'hospitality'; // hotel, event venue, co-living

export const BUSINESS_CATEGORIES: readonly BusinessCategory[] = [
  'food',
  'retail',
  'services',
  'trades',
  'health',
  'education',
  'logistics',
  'hospitality',
];

export type GigSkill = 'tech' | 'sales' | 'ops' | 'creative';

export interface VenueItem {
  id: string;
  label: string;
  priceCol: number;
  /** Energy restored (0–100 scale). */
  energy?: number;
  /** Good for a meeting: you can invite someone. */
  meeting?: boolean;
}

export interface BusinessGig {
  id: string;
  label: string;
  hours: number;
  payCol: number;
  skill?: GigSkill | null;
}

export type BusinessShape =
  | 'shopfront'
  | 'stall'
  | 'kiosk'
  | 'restaurant'
  | 'pub'
  | 'warehouse'
  | 'clinic'
  | 'school'
  | 'hotel';

export interface BusinessKindSpec {
  kind: string;
  category: BusinessCategory;
  /** Translatable. */
  label: string;
  /** A player can go in and spend (eat, drink, get a haircut…). */
  venue?: { items: VenueItem[] };
  /** Typical monthly takings in cost-of-living units, [low, high]. */
  revenueCol: [number, number];
  /** Share of takings spent on each startup sector it buys from. */
  buys: Partial<Record<Industry, number>>;
  /** Gigs it offers. */
  gigs: BusinessGig[];
  look: { shape: BusinessShape; awning?: string; color: string };
}

export interface BusinessSeed {
  /** Fictional, local, recognisably of the city. */
  name: string;
  /** BusinessKindSpec.kind */
  kind: string;
  /** District id from the city plan (web `city/plans/<market>.ts`). */
  district: string;
  /** The AI owner's name. */
  owner: string;
}

// ---------------------------------------------------------------- Helpers

const item = (
  id: string,
  label: string,
  priceCol: number,
  energy?: number,
  meeting?: boolean,
): VenueItem => ({
  id,
  label,
  priceCol,
  ...(energy ? { energy } : {}),
  ...(meeting ? { meeting: true } : {}),
});

const gig = (
  id: string,
  label: string,
  hours: number,
  payCol: number,
  skill: GigSkill | null = null,
): BusinessGig => ({ id, label, hours, payCol, skill });

/** What each category typically spends on startup products (share of takings). */
const BUYS: Record<BusinessCategory, Partial<Record<Industry, number>>> = {
  food: { fintech: 0.012, logistics: 0.015, saas: 0.006, agritech: 0.05 },
  retail: { fintech: 0.012, ecommerce: 0.02, logistics: 0.015, saas: 0.006 },
  services: { fintech: 0.015, saas: 0.012, ecommerce: 0.01 },
  trades: { fintech: 0.01, ecommerce: 0.02, logistics: 0.012, saas: 0.008 },
  health: { healthtech: 0.03, fintech: 0.01, saas: 0.01 },
  education: { edtech: 0.04, fintech: 0.01, saas: 0.008 },
  logistics: { logistics: 0.025, fintech: 0.01, saas: 0.012 },
  hospitality: { fintech: 0.01, saas: 0.015, agritech: 0.02, logistics: 0.008 },
};

/** Gigs each category typically offers. */
const GIGS: Record<BusinessCategory, BusinessGig[]> = {
  food: [
    gig('shift', 'Waiting shift', 8, 0.06),
    gig('kitchen', 'Kitchen shift', 10, 0.075, 'ops'),
    gig('socials', 'Menu photos and social posts', 10, 0.12, 'creative'),
  ],
  retail: [
    gig('shift', 'Shop shift', 8, 0.06),
    gig('stocktake', 'Stocktake', 10, 0.08, 'ops'),
    gig('online', 'Set up online sales', 12, 0.16, 'tech'),
  ],
  services: [
    gig('front', 'Front desk', 8, 0.055),
    gig('promo', 'Flyers and promotion', 8, 0.1, 'creative'),
    gig('books', 'Sort out the books', 10, 0.13, 'ops'),
  ],
  trades: [
    gig('labour', 'Workshop labour', 10, 0.08),
    gig('quotes', 'Chase quotes and invoices', 10, 0.12, 'sales'),
  ],
  health: [
    gig('reception', 'Reception shift', 8, 0.065),
    gig('booking', 'Set up online booking', 12, 0.17, 'tech'),
  ],
  education: [
    gig('tutor', 'Teach a block of lessons', 8, 0.1, 'tech'),
    gig('enrol', 'Enrolment drive', 10, 0.12, 'sales'),
  ],
  logistics: [
    gig('loading', 'Loading shift', 10, 0.07),
    gig('driver', 'Delivery run', 8, 0.065),
    gig('routes', 'Plan the routes', 10, 0.13, 'ops'),
  ],
  hospitality: [
    gig('events', 'Event staffing', 8, 0.065),
    gig('sales', 'Corporate sales calls', 10, 0.14, 'sales'),
    gig('web', 'Fix the booking website', 12, 0.17, 'tech'),
  ],
};

const COLORS: Record<BusinessCategory, string> = {
  food: '#d9653b',
  retail: '#3b82c4',
  services: '#9b59b6',
  trades: '#8d6e63',
  health: '#2e9e6a',
  education: '#e0a526',
  logistics: '#607d8b',
  hospitality: '#c2185b',
};

function kind(
  k: string,
  category: BusinessCategory,
  label: string,
  shape: BusinessShape,
  revenueCol: [number, number],
  extra: {
    items?: VenueItem[];
    buys?: Partial<Record<Industry, number>>;
    gigs?: BusinessGig[];
    awning?: string;
    color?: string;
  } = {},
): BusinessKindSpec {
  return {
    kind: k,
    category,
    label,
    ...(extra.items ? { venue: { items: extra.items } } : {}),
    revenueCol,
    buys: extra.buys ?? BUYS[category],
    gigs: extra.gigs ?? GIGS[category],
    look: {
      shape,
      ...(extra.awning ? { awning: extra.awning } : {}),
      color: extra.color ?? COLORS[category],
    },
  };
}

// Common menus.
const MEAL = [
  item('lunch', 'Lunch', 0.012, 8, true),
  item('dinner', 'Dinner', 0.025, 10, true),
  item('drink', 'Soft drink', 0.003, 2),
];
const STREET = [item('plate', 'A plate', 0.006, 7, true), item('drink', 'Cold drink', 0.002, 2)];
const COFFEE = [
  item('coffee', 'Coffee', 0.003, 5, true),
  item('breakfast', 'Breakfast', 0.008, 7, true),
  item('pastry', 'Pastry', 0.003, 3),
];
const DRINKS = [
  item('drink', 'A drink', 0.006, 3, true),
  item('round', 'Buy a round', 0.02, 4, true),
  item('food', 'Bar food', 0.01, 6, true),
];

// ---------------------------------------------------------------- Kinds

export const BUSINESS_KINDS: BusinessKindSpec[] = [
  // Food
  kind('restaurant', 'food', 'Restaurant', 'restaurant', [14, 40], {
    items: MEAL,
    awning: '#b23a2a',
  }),
  kind('cafe', 'food', 'Café', 'shopfront', [5, 14], {
    items: COFFEE,
    buys: { fintech: 0.015, agritech: 0.04, saas: 0.01 },
    awning: '#6d4c41',
  }),
  kind('coffee-roaster', 'food', 'Coffee roaster', 'shopfront', [8, 20], {
    items: COFFEE,
    buys: { fintech: 0.012, ecommerce: 0.015, logistics: 0.02, agritech: 0.04 },
    awning: '#4e342e',
  }),
  kind('bakery', 'food', 'Bakery', 'shopfront', [6, 16], {
    items: [
      item('bread', 'Bread and pastries', 0.004, 4),
      item('coffee', 'Coffee', 0.003, 4, true),
    ],
    awning: '#f0c27b',
  }),
  kind('pub', 'food', 'Pub', 'pub', [12, 32], { items: DRINKS, awning: '#1b5e20' }),
  kind('bar', 'food', 'Bar', 'pub', [10, 28], { items: DRINKS, awning: '#311b92' }),
  kind('buka', 'food', 'Buka (mama-put)', 'stall', [2, 6], { items: STREET, awning: '#ef6c00' }),
  kind('suya-spot', 'food', 'Suya spot', 'stall', [2, 6], {
    items: [item('suya', 'Suya', 0.005, 6, true), item('drink', 'Cold drink', 0.002, 2)],
    awning: '#bf360c',
  }),
  kind('grill-house', 'food', 'Grill house', 'restaurant', [8, 20], {
    items: [
      item('grill', 'Grilled meat to share', 0.015, 9, true),
      item('drink', 'A drink', 0.004, 2),
    ],
    awning: '#8d2b0b',
  }),
  kind('chop-bar', 'food', 'Chop bar', 'restaurant', [3, 8], {
    items: STREET,
    awning: '#e65100',
  }),
  kind('waakye-stand', 'food', 'Waakye stand', 'stall', [1.5, 4], {
    items: STREET,
    awning: '#f57f17',
  }),
  kind('kibanda', 'food', 'Kibanda (food kiosk)', 'kiosk', [1.5, 4], {
    items: STREET,
    awning: '#ff8f00',
  }),
  kind('koshary', 'food', 'Koshary shop', 'shopfront', [4, 10], {
    items: STREET,
    awning: '#c62828',
  }),
  kind('shawarma', 'food', 'Shawarma shop', 'kiosk', [3, 8], {
    items: STREET,
    awning: '#d84315',
  }),
  kind('taqueria', 'food', 'Taquería', 'restaurant', [6, 16], {
    items: [
      item('burrito', 'Burrito', 0.004, 8, true),
      item('tacos', 'Tacos and a drink', 0.005, 7, true),
    ],
    awning: '#2e7d32',
  }),
  kind('dim-sum', 'food', 'Dim sum restaurant', 'restaurant', [12, 30], {
    items: MEAL,
    awning: '#b71c1c',
  }),
  kind('curry-house', 'food', 'Curry house', 'restaurant', [10, 26], {
    items: MEAL,
    awning: '#880e4f',
  }),
  kind('caff', 'food', 'Caff', 'shopfront', [4, 10], {
    items: [item('fryup', 'Full breakfast', 0.006, 9, true), item('tea', 'Mug of tea', 0.001, 3)],
    awning: '#c62828',
  }),
  kind('food-truck', 'food', 'Food truck', 'stall', [3, 8], {
    items: STREET,
    awning: '#00838f',
  }),
  // Retail
  kind('grocer', 'retail', 'Grocer', 'shopfront', [8, 24], {
    buys: { fintech: 0.01, ecommerce: 0.015, logistics: 0.015, agritech: 0.03 },
    awning: '#2e7d32',
  }),
  kind('corner-shop', 'retail', 'Corner shop', 'shopfront', [4, 10], {
    items: [item('snack', 'Snack and a drink', 0.002, 3)],
    buys: { fintech: 0.012, ecommerce: 0.02, agritech: 0.02 },
    awning: '#1565c0',
  }),
  kind('market-stall', 'retail', 'Market stall', 'stall', [1.5, 5], {
    buys: { fintech: 0.015, logistics: 0.012, agritech: 0.03 },
    gigs: [
      gig('shift', 'Help on the stall', 8, 0.05),
      gig('online', 'Sell online', 10, 0.13, 'tech'),
    ],
    awning: '#fbc02d',
  }),
  kind('fabric-stall', 'retail', 'Fabric stall', 'stall', [3, 9], {
    buys: { fintech: 0.015, ecommerce: 0.02, logistics: 0.012 },
    awning: '#7b1fa2',
  }),
  kind('souk-stall', 'retail', 'Souk stall', 'stall', [3, 8], {
    buys: { fintech: 0.012, ecommerce: 0.02, logistics: 0.012 },
    awning: '#a1887f',
  }),
  kind('boutique', 'retail', 'Boutique', 'shopfront', [5, 14], { awning: '#ad1457' }),
  kind('electronics', 'retail', 'Electronics shop', 'shopfront', [8, 22], { awning: '#0277bd' }),
  kind('pharmacy', 'retail', 'Pharmacy', 'shopfront', [8, 20], {
    buys: { healthtech: 0.025, fintech: 0.01, logistics: 0.012, saas: 0.006 },
    color: '#2e9e6a',
    awning: '#43a047',
  }),
  kind('bike-shop', 'retail', 'Bike shop', 'shopfront', [4, 10], {
    items: [item('tuneup', 'Bike tune-up', 0.01)],
    awning: '#f9a825',
  }),
  // Services
  kind('salon', 'services', 'Hair salon', 'shopfront', [3, 9], {
    items: [item('hair', 'Get your hair done', 0.012, 4)],
    awning: '#ec407a',
  }),
  kind('barber', 'services', 'Barber', 'shopfront', [2, 6], {
    items: [item('cut', 'Haircut', 0.006, 3)],
    awning: '#1e88e5',
  }),
  kind('laundry', 'services', 'Laundry', 'shopfront', [2, 6], {
    items: [item('wash', 'Wash and fold', 0.004, 2)],
    awning: '#4fc3f7',
  }),
  kind('tailor', 'services', 'Tailor', 'shopfront', [2, 6], {
    items: [item('fit', 'Get something tailored', 0.02, 2)],
    awning: '#6a1b9a',
  }),
  kind('print-shop', 'services', 'Print shop', 'shopfront', [4, 10], {
    items: [item('cards', 'Business cards and flyers', 0.01)],
    buys: { fintech: 0.012, saas: 0.015, logistics: 0.01, ecommerce: 0.01 },
    awning: '#455a64',
  }),
  kind('phone-repair', 'services', 'Phone repair shop', 'kiosk', [2, 6], {
    items: [item('fix', 'Fix your phone screen', 0.015)],
    buys: { fintech: 0.015, ecommerce: 0.02, saas: 0.01 },
    gigs: [
      gig('front', 'Mind the counter', 8, 0.055),
      gig('repair', 'Repair jobs', 10, 0.13, 'tech'),
    ],
    awning: '#00897b',
  }),
  kind('mobile-money-agent', 'services', 'Mobile money agent', 'kiosk', [1.5, 4], {
    buys: { fintech: 0.05, saas: 0.008 },
    gigs: [gig('shift', 'Agent shift', 8, 0.05), gig('float', 'Float runs', 6, 0.05, 'ops')],
    awning: '#fdd835',
  }),
  // Trades
  kind('mechanic', 'trades', 'Mechanic', 'warehouse', [4, 12], {
    buys: { fintech: 0.01, ecommerce: 0.025, saas: 0.008 },
    awning: '#5d4037',
  }),
  kind('workshop', 'trades', 'Workshop', 'warehouse', [6, 16], { awning: '#795548' }),
  kind('builders-merchant', 'trades', "Builder's merchant", 'warehouse', [15, 40], {
    awning: '#ff7043',
  }),
  // Health
  kind('clinic', 'health', 'Clinic', 'clinic', [12, 30], {
    items: [item('checkup', 'Health check-up', 0.02, 6)],
  }),
  kind('dentist', 'health', 'Dentist', 'clinic', [8, 20], {
    items: [item('cleaning', 'Dental cleaning', 0.02)],
  }),
  kind('gym', 'health', 'Gym', 'shopfront', [6, 16], {
    items: [item('session', 'Workout session', 0.006, 10)],
    buys: { healthtech: 0.02, fintech: 0.012, saas: 0.015 },
    awning: '#263238',
  }),
  kind('climbing-gym', 'health', 'Climbing gym', 'warehouse', [10, 24], {
    items: [
      item('session', 'Climbing session', 0.008, 10),
      item('climb', 'Climb together', 0.016, 8, true),
    ],
    buys: { healthtech: 0.02, fintech: 0.012, saas: 0.015 },
  }),
  // Education
  kind('tutoring', 'education', 'Tutoring centre', 'school', [3, 8]),
  kind('school', 'education', 'Private school', 'school', [20, 50], {
    buys: { edtech: 0.04, fintech: 0.012, saas: 0.008, healthtech: 0.005 },
  }),
  kind('bootcamp', 'education', 'Coding bootcamp', 'school', [10, 26], {
    items: [item('workshop', 'Evening workshop', 0.01, 0, true)],
    buys: { edtech: 0.03, saas: 0.02, fintech: 0.01 },
    gigs: [
      gig('mentor', 'Mentor a cohort', 10, 0.18, 'tech'),
      gig('enrol', 'Enrolment drive', 10, 0.12, 'sales'),
    ],
  }),
  // Logistics
  kind('courier-depot', 'logistics', 'Courier depot', 'warehouse', [10, 26]),
  kind('warehouse', 'logistics', 'Warehouse', 'warehouse', [15, 40], {
    buys: { logistics: 0.02, ecommerce: 0.015, saas: 0.012, fintech: 0.008 },
  }),
  kind('transport-depot', 'logistics', 'Transport co-op depot', 'warehouse', [12, 30], {
    buys: { fintech: 0.02, logistics: 0.015, saas: 0.01 },
  }),
  kind('cold-store', 'logistics', 'Cold store', 'warehouse', [10, 24], {
    buys: { agritech: 0.03, logistics: 0.02, fintech: 0.008 },
  }),
  // Hospitality
  kind('hotel', 'hospitality', 'Hotel', 'hotel', [40, 110], {
    items: [
      item('coffee', 'Lobby coffee', 0.005, 4, true),
      item('dinner', 'Dinner at the hotel', 0.04, 10, true),
    ],
  }),
  kind('event-venue', 'hospitality', 'Event venue', 'hotel', [15, 40], {
    items: [item('drinks', 'Drinks at the bar', 0.008, 3, true)],
    color: '#8e24aa',
  }),
  kind('co-living', 'hospitality', 'Co-living house', 'hotel', [12, 30], {
    items: [item('dinner', 'Community dinner', 0.008, 7, true)],
    buys: { fintech: 0.012, saas: 0.02, healthtech: 0.005, agritech: 0.01 },
  }),
  kind('guesthouse', 'hospitality', 'Guesthouse', 'hotel', [5, 14], {
    items: [item('breakfast', 'Breakfast', 0.008, 7, true)],
  }),
];

const BY_KIND = new Map(BUSINESS_KINDS.map((k) => [k.kind, k]));

export const businessKind = (k: string): BusinessKindSpec | undefined => BY_KIND.get(k);

/** Which backgrounds match each gig skill (a match pays more). */
export const GIG_SKILL_BACKGROUNDS: Record<GigSkill, readonly string[]> = {
  tech: ['f-engineer', 'f-dropout', 'i-operator', 'i-exited', 'b-fintech'],
  sales: ['f-consultant', 'b-microfinance', 'i-corporate', 'b-ib'],
  ops: [
    'f-corporate',
    'f-second-time',
    'f-banker',
    'i-banker',
    'i-consultant',
    'b-commercial',
    'b-regulator',
    'b-wealthy',
  ],
  creative: ['f-dropout', 'f-consultant', 'i-first'],
};

// ---------------------------------------------------------------- Rosters

type Row = [name: string, kind: string, district: string, owner: string];

const seeds = (rows: Row[]): BusinessSeed[] =>
  rows.map(([name, k, district, owner]) => ({ name, kind: k, district, owner }));

/**
 * The businesses of each city, by market id. The last few in each list are
 * not open on day one; they open over the months as the city changes.
 * Keyed by string so a market can have a roster before it joins `MarketId`.
 */
export const CITY_BUSINESSES: Partial<Record<string, BusinessSeed[]>> = {
  london: seeds([
    ['The Lamb & Lantern', 'pub', 'borough', 'Declan Murphy'],
    ['Banglatown Spice House', 'curry-house', 'shoreditch', 'Rahim Uddin'],
    ["Nico's Caff", 'caff', 'camden', 'Nico Kostas'],
    ['Old Street Roasters', 'coffee-roaster', 'shoreditch', 'Freya Lund'],
    ['Borough Cheese & Bread', 'market-stall', 'borough', 'Harriet Cole'],
    ["Patel's Corner Shop", 'corner-shop', 'camden', 'Vikesh Patel'],
    ['Sharp & Co Barbers', 'barber', 'soho', 'Tunde Bakare'],
    ['The Riverside Grand', 'hotel', 'southbank', 'Eleanor Whitfield'],
    ['Soho Noodle Bar', 'restaurant', 'soho', 'Mei Lin Chen'],
    ['Wharf Fitness', 'gym', 'canary-wharf', 'Callum Price'],
    ['Mayfair Tailoring House', 'tailor', 'mayfair', 'Ahmed Siddiqui'],
    ['Camden Fix-It Phones', 'phone-repair', 'camden', 'Kemal Arslan'],
    ['Square Mile Pharmacy', 'pharmacy', 'city', 'Priya Shah'],
    ['Bermondsey Bakehouse', 'bakery', 'borough', 'Sophie Turner'],
    ['Fleet Print Works', 'print-shop', 'city', 'Graham Hughes'],
    ['Spin Cycle Laundrette', 'laundry', 'camden', 'Grace Okafor'],
    ['Southbank Event Rooms', 'event-venue', 'southbank', 'Olivia Grant'],
    ['Docklands Courier Hub', 'courier-depot', 'canary-wharf', 'Marek Nowak'],
    ['Shoreditch Code School', 'bootcamp', 'shoreditch', 'Hannah Okoye'],
    ['Marylebone Smile Studio', 'dentist', 'mayfair', 'Dr Ravi Mehta'],
    ['The Copper Still', 'bar', 'soho', 'Jamie Doyle'],
    ['Camden Lock Vintage', 'boutique', 'camden', 'Lily Evans'],
    ['Bankside Clinic', 'clinic', 'southbank', 'Dr Amara Nwosu'],
    ['Hackney Joinery Workshop', 'workshop', 'shoreditch', 'Sean Gallagher'],
    ['Mile End Tutors', 'tutoring', 'city', 'Fatima Begum'],
    ['Canary Co-Living', 'co-living', 'canary-wharf', 'Tom Hartley'],
    ['Pie & Mash on the Cut', 'caff', 'southbank', 'Albert Cooke'],
    ['Salon Rouge Soho', 'salon', 'soho', 'Chloe Martin'],
  ]),
  lagos: seeds([
    ["Mama Titi's Buka", 'buka', 'yaba', 'Titilayo Adebayo'],
    ['Mallam Sule Suya Spot', 'suya-spot', 'surulere', 'Sule Abubakar'],
    ['Balogun Ankara House', 'fabric-stall', 'balogun', 'Folake Ogun'],
    ['Computer Village Fix Point', 'phone-repair', 'ikeja', 'Chinedu Okeke'],
    ['Good Life Pharmacy', 'pharmacy', 'ikeja', 'Ngozi Eze'],
    ['Eko Grand Event Centre', 'event-venue', 'lekki', 'Bayo Martins'],
    ['Yaba POS Point', 'mobile-money-agent', 'yaba', 'Kunle Bello'],
    ['Island Bistro', 'restaurant', 'victoria-island', 'Ifeoma Nwankwo'],
    ['Ikoyi Brew House', 'cafe', 'ikoyi', 'Tolu Adeyemi'],
    ['Agege Bread Bakery', 'bakery', 'ikeja', 'Musa Lawal'],
    ['Fresh Cuts Barbers', 'barber', 'surulere', 'Emeka Obi'],
    ['Lekki Glam Salon', 'salon', 'lekki', 'Adaeze Okoro'],
    ['Marina Print & Copy', 'print-shop', 'marina', 'Segun Ajayi'],
    ['Rasaki Auto Works', 'mechanic', 'surulere', 'Rasaki Olatunji'],
    ['Lekki Pointe Hotel', 'hotel', 'lekki', 'Bisi Coker'],
    ['VI Lounge & Grill', 'bar', 'victoria-island', 'Dapo Shonibare'],
    ['Yaba Tech Academy', 'bootcamp', 'yaba', 'Oluwaseun Ade'],
    ['Ikeja Mega Provisions', 'grocer', 'ikeja', 'Kemi Ojo'],
    ['Marina Dispatch Riders', 'courier-depot', 'marina', 'Ibrahim Danjuma'],
    ['Ikoyi Family Clinic', 'clinic', 'ikoyi', 'Dr Funmi Akande'],
    ['Lekki Smile Dental', 'dentist', 'lekki', 'Dr Chuka Obi'],
    ['Bodyline Gym Surulere', 'gym', 'surulere', 'Femi Oladipo'],
    ['Bright Stars Tutorials', 'tutoring', 'yaba', 'Ade Akinola'],
    ['Balogun Wholesale Warehouse', 'warehouse', 'balogun', 'Ganiyu Yusuf'],
    ['Aso-Oke Tailors', 'tailor', 'balogun', 'Kudi Ahmed'],
    ['Iya Basira Amala Joint', 'buka', 'ikeja', 'Basira Salami'],
    ['VI Shawarma Hub', 'shawarma', 'victoria-island', 'Hassan Karim'],
    ['Yaba Co-Living', 'co-living', 'yaba', 'Bolaji Ogunleye'],
  ]),
  nairobi: seeds([
    ['Mzee Kamau Choma Zone', 'grill-house', 'westlands', 'Peter Kamau'],
    ['Umoja Line Matatu Sacco', 'transport-depot', 'cbd', 'Joseph Mwangi'],
    ['Gikomba Mitumba Stall', 'market-stall', 'gikomba', 'Wanjiru Njoroge'],
    ['Tuko Pamoja Mobile Money', 'mobile-money-agent', 'cbd', 'Brian Otieno'],
    ['Kilimani Coffee Collective', 'cafe', 'kilimani', 'Wambui Karanja'],
    ['Upper Hill Medical Centre', 'clinic', 'upper-hill', 'Dr Achieng Odhiambo'],
    ['Eastleigh Textile Stall', 'fabric-stall', 'eastleigh', 'Abdi Hassan'],
    ['Eastleigh Biryani House', 'restaurant', 'eastleigh', 'Fatuma Ali'],
    ['Westlands Rooftop Bar', 'bar', 'westlands', 'Kevin Ochieng'],
    ['Karen Country Bakery', 'bakery', 'karen', 'Grace Wairimu'],
    ['Industrial Area Cold Store', 'cold-store', 'industrial-area', 'Samuel Kiprono'],
    ['Mombasa Road Logistics Yard', 'warehouse', 'industrial-area', 'Ali Mohamed'],
    ['Kilimani Kinyozi', 'barber', 'kilimani', 'Dennis Mutua'],
    ['Salon Mrembo', 'salon', 'cbd', 'Esther Akinyi'],
    ['Upper Hill Executive Hotel', 'hotel', 'upper-hill', 'Margaret Njeri'],
    ['Luthuli Electronics', 'electronics', 'cbd', 'Moses Kariuki'],
    ['Karen Boma Events', 'event-venue', 'karen', 'Susan Wangari'],
    ['Kilimani Code Hub', 'bootcamp', 'kilimani', 'Collins Kiptoo'],
    ['Westlands Dental Studio', 'dentist', 'westlands', 'Dr Imran Shah'],
    ['CBD Fix Phones', 'phone-repair', 'cbd', 'James Omondi'],
    ['Gikomba Jua Kali Workshop', 'workshop', 'gikomba', 'John Mutiso'],
    ['Westlands Fitness Club', 'gym', 'westlands', 'Linda Chebet'],
    ['Karen Valley Academy', 'school', 'karen', 'Francis Owino'],
    ["Mama Akoth's Fish Kibanda", 'kibanda', 'gikomba', 'Akoth Atieno'],
    ['Duka la Baraka', 'corner-shop', 'eastleigh', 'Baraka Mwende'],
    ['Wekesa Auto Garage', 'mechanic', 'industrial-area', 'Patrick Wekesa'],
    ['Haraka Courier Depot', 'courier-depot', 'industrial-area', 'Hussein Abdullahi'],
    ['Kilimani Co-Living', 'co-living', 'kilimani', 'Faith Muthoni'],
  ]),
  accra: seeds([
    ['Auntie Muni Waakye', 'waakye-stand', 'osu', 'Munira Issah'],
    ['Makola Kente & Wax Prints', 'fabric-stall', 'makola', 'Akosua Mensah'],
    ['Osu Chop Bar', 'chop-bar', 'osu', 'Kwame Asante'],
    ['Jamestown Smoked Fish', 'market-stall', 'jamestown', 'Naa Adjeley Tetteh'],
    ['Airport City Suites', 'hotel', 'airport-city', 'Nana Yaw Boateng'],
    ['Labadi Beach Grill', 'restaurant', 'labadi', 'Kojo Amponsah'],
    ['Cantonments Coffee House', 'cafe', 'cantonments', 'Efua Owusu'],
    ['East Legon Medical Centre', 'clinic', 'east-legon', 'Dr Yaa Sarpong'],
    ['Osu Cash Point Agent', 'mobile-money-agent', 'osu', 'Kofi Appiah'],
    ['Makola Provisions', 'grocer', 'makola', 'Comfort Adjei'],
    ['Jamestown Auto Fitters', 'mechanic', 'jamestown', 'Ebo Quansah'],
    ['Glory Hair Salon', 'salon', 'east-legon', 'Abena Darko'],
    ['Royal Cuts Barbering', 'barber', 'osu', 'Kweku Mensah'],
    ['Mallam Abu Chichinga', 'suya-spot', 'osu', 'Abubakar Sadiq'],
    ['Labadi Beach Events Garden', 'event-venue', 'labadi', 'Dede Lamptey'],
    ['East Legon Bakery', 'bakery', 'east-legon', 'Akua Boakye'],
    ['Accra Code Lab', 'bootcamp', 'airport-city', 'Selasi Agbeko'],
    ['Cantonments Dental', 'dentist', 'cantonments', 'Dr Kwabena Ofori'],
    ['Fresh Fold Laundry', 'laundry', 'east-legon', 'Esi Nyarko'],
    ['Makola Electronics', 'electronics', 'makola', 'Yaw Frimpong'],
    ['Ridge Pharmacy', 'pharmacy', 'cantonments', 'Adwoa Badu'],
    ['Makola Wholesale Store', 'warehouse', 'makola', 'Iddrisu Mahama'],
    ['Swift Dispatch Accra', 'courier-depot', 'airport-city', 'Kwesi Amoah'],
    ['Osu Night Spot', 'bar', 'osu', 'Fiifi Baidoo'],
    ['Auntie Ama Seamstress', 'tailor', 'jamestown', 'Ama Serwaa'],
    ['East Legon Tutors', 'tutoring', 'east-legon', 'Kojo Ansah'],
    ['Airport City Gym', 'gym', 'airport-city', 'Nii Armah'],
    ['Jamestown Print Shop', 'print-shop', 'jamestown', 'Kofi Tetteh'],
  ]),
  freetown: seeds([
    ["Mammy Kadi's Cookery", 'chop-bar', 'central', 'Kadiatu Kamara'],
    ['Lumley Beach Bar', 'bar', 'lumley', 'Mohamed Sesay'],
    ['Aberdeen Seaview Hotel', 'hotel', 'aberdeen', 'Isatu Bangura'],
    ['Big Market Gara Cloth', 'fabric-stall', 'central', 'Fatmata Conteh'],
    ['Kissy Road Phone Doctor', 'phone-repair', 'kissy', 'Abu Koroma'],
    ['Congo Cross Pharmacy', 'pharmacy', 'congo-cross', 'Aminata Jalloh'],
    ['Wilberforce Bakery', 'bakery', 'wilberforce', 'Christiana Cole'],
    ['Central Cash Point Agent', 'mobile-money-agent', 'central', 'Ibrahim Turay'],
    ['Keke Fix Mechanics', 'mechanic', 'kissy', 'Alusine Kanu'],
    ['Aberdeen Grill House', 'restaurant', 'aberdeen', 'Fouad Hassan'],
    ['Lumley Fresh Fish Stall', 'market-stall', 'lumley', 'Yeabu Kargbo'],
    ['Krio Pot Restaurant', 'restaurant', 'congo-cross', 'Olivia Macauley'],
    ['Freetown Style Salon', 'salon', 'central', 'Mariama Bah'],
    ['Wilberforce Barbing Saloon', 'barber', 'wilberforce', 'Sorie Kamara'],
    ['Kissy Provisions Store', 'grocer', 'kissy', 'Sheku Fofanah'],
    ['Congo Cross Clinic', 'clinic', 'congo-cross', 'Dr Fatu Kallon'],
    ['Lumley Event Hall', 'event-venue', 'lumley', 'Samuel Thomas'],
    ['Central Print & Photocopy', 'print-shop', 'central', 'Joseph Williams'],
    ['Aberdeen Coffee Corner', 'cafe', 'aberdeen', 'Hawa Sankoh'],
    ['Kissy Dockyard Warehouse', 'warehouse', 'kissy', 'Abdul Mansaray'],
    ['Salone Tailoring', 'tailor', 'central', 'Musa Kabia'],
    ['Wilberforce Tutorial Centre', 'tutoring', 'wilberforce', 'Daniel Kamara'],
    ['Swift Dispatch Salone', 'courier-depot', 'congo-cross', 'Lansana Sesay'],
    ['Lumley Gym', 'gym', 'lumley', 'Ishmael Kamara'],
    ['Freetown Code Club', 'bootcamp', 'wilberforce', 'Fatmata Koroma'],
    ['Congo Cross Laundry', 'laundry', 'congo-cross', 'Mabinty Sillah'],
    ['Aberdeen Guesthouse', 'guesthouse', 'aberdeen', 'Rugiatu Kamara'],
    ['Kissy Road Electronics', 'electronics', 'kissy', 'Hassan Jaber'],
  ]),
  kigali: seeds([
    ['Chez Jean Brochettes', 'grill-house', 'kimihurura', 'Jean-Pierre Habimana'],
    ['Kiyovu Hills Hotel', 'hotel', 'kiyovu', 'Claudine Uwase'],
    ['Nyabugogo Express Coach Depot', 'transport-depot', 'nyabugogo', 'Emmanuel Nkurunziza'],
    ['Nyabugogo Market Stall', 'market-stall', 'nyabugogo', 'Odette Uwimana'],
    ['Kacyiru Coffee Roasters', 'coffee-roaster', 'kacyiru', 'Aline Mukamana'],
    ['Remera Moto Mechanics', 'mechanic', 'remera', 'Eric Niyonzima'],
    ['Nyarugenge Mobile Money', 'mobile-money-agent', 'nyarugenge', 'Patrick Mugisha'],
    ['Kiyovu Bistro', 'restaurant', 'kiyovu', 'Diane Ingabire'],
    ['Kimihurura Rooftop Lounge', 'bar', 'kimihurura', 'Olivier Kayitare'],
    ['Remera Bakery', 'bakery', 'remera', 'Josiane Uwamahoro'],
    ['Kacyiru Medical Clinic', 'clinic', 'kacyiru', 'Dr Yves Nshimiyimana'],
    ['Hills Code Academy', 'bootcamp', 'kacyiru', 'Grace Umutoni'],
    ['Nyarugenge Pharmacy', 'pharmacy', 'nyarugenge', 'Vestine Mukeshimana'],
    ['Salon Belle Remera', 'salon', 'remera', 'Sandrine Iradukunda'],
    ['Kiyovu Barber Studio', 'barber', 'kiyovu', 'Kevin Ndayisaba'],
    ['Nyabugogo Wholesale Store', 'warehouse', 'nyabugogo', 'Alphonse Bizimana'],
    ['Kimihurura Conference Gardens', 'event-venue', 'kimihurura', 'Christine Mutoni'],
    ['Nyarugenge Tailors', 'tailor', 'nyarugenge', 'Esperance Nyirahabimana'],
    ['Remera Fresh Grocer', 'grocer', 'remera', 'Didier Hakizimana'],
    ['Kacyiru Dental Care', 'dentist', 'kacyiru', 'Dr Clarisse Uwera'],
    ['Remera Fitness Hub', 'gym', 'remera', 'Jean Bosco Ntwari'],
    ['Nyarugenge Print House', 'print-shop', 'nyarugenge', 'Felix Rukundo'],
    ['Kiyovu Tutoring Centre', 'tutoring', 'kiyovu', 'Innocent Habiyaremye'],
    ['Kimihurura Café', 'cafe', 'kimihurura', 'Nadine Umubyeyi'],
    ['Nyabugogo Phone Repair', 'phone-repair', 'nyabugogo', 'Samuel Twagirayezu'],
    ['Kacyiru Co-Living', 'co-living', 'kacyiru', 'Eric Manzi'],
    ['Remera Cold Chain Store', 'cold-store', 'remera', 'Theogene Ndagijimana'],
    ['Kiyovu Laundry', 'laundry', 'kiyovu', 'Beatrice Mukandayisenga'],
  ]),
  johannesburg: seeds([
    ['Orlando Shisa Nyama', 'grill-house', 'soweto', 'Sipho Dlamini'],
    ['Maboneng Coffee Lab', 'coffee-roaster', 'maboneng', 'Lerato Mokoena'],
    ['Sandton Grand Hotel', 'hotel', 'sandton', 'Johan van der Merwe'],
    ['Braam Kota Truck', 'food-truck', 'braamfontein', 'Thabo Nkosi'],
    ["Mama Nomsa's Spaza", 'corner-shop', 'soweto', 'Nomsa Zulu'],
    ['Marshalltown Taxi Rank Depot', 'transport-depot', 'marshalltown', 'Bongani Khumalo'],
    ['Rosebank Bistro', 'restaurant', 'rosebank', 'Charlotte Botha'],
    ['Maboneng Gallery Bar', 'bar', 'maboneng', 'Kagiso Molefe'],
    ['Kasi Cuts Barbershop', 'barber', 'soweto', 'Tshepo Mahlangu'],
    ['Rosebank Hair Studio', 'salon', 'rosebank', 'Naledi Mthembu'],
    ['Marshalltown Pharmacy', 'pharmacy', 'marshalltown', 'Ayesha Patel'],
    ['Sandton Executive Gym', 'gym', 'sandton', 'Ryan Naidoo'],
    ['Braam Code Academy', 'bootcamp', 'braamfontein', 'Zanele Ndlovu'],
    ['Soweto Community Clinic', 'clinic', 'soweto', 'Dr Mpho Sithole'],
    ['Sandton Smile Dentistry', 'dentist', 'sandton', 'Dr Anika Pillay'],
    ['Marshalltown Print Shop', 'print-shop', 'marshalltown', 'Gerhard Pretorius'],
    ['Maboneng Events Warehouse', 'event-venue', 'maboneng', 'Lindiwe Mabaso'],
    ['City Deep Distribution', 'warehouse', 'marshalltown', 'Hendrik Venter'],
    ['Rosebank Courier Co', 'courier-depot', 'rosebank', 'Sibusiso Mkhize'],
    ['Soweto Auto Fix', 'mechanic', 'soweto', 'Lucky Masondo'],
    ['Braamfontein Phone Repairs', 'phone-repair', 'braamfontein', 'Farid Osman'],
    ['Rosebank Bakery', 'bakery', 'rosebank', 'Elmarie du Plessis'],
    ['Sandton Tailors', 'tailor', 'sandton', 'Rajesh Govender'],
    ['Braamfontein Co-Living', 'co-living', 'braamfontein', 'Katlego Modise'],
    ['Marshalltown Fresh Produce', 'grocer', 'marshalltown', 'Vusi Ntuli'],
    ['Soweto Maths Tutors', 'tutoring', 'soweto', 'Themba Zwane'],
    ['Maboneng Boutique', 'boutique', 'maboneng', 'Palesa Radebe'],
    ['Sandton Laundry Express', 'laundry', 'sandton', 'Grace Moloi'],
  ]),
  cairo: seeds([
    ['Koshary El Nour', 'koshary', 'downtown', 'Hassan Abdel Rahman'],
    ['Khan el-Khalili Spice Stall', 'souk-stall', 'khan-el-khalili', 'Ahmed El-Masry'],
    ['Zamalek Nile View Café', 'cafe', 'zamalek', 'Nour Farouk'],
    ['Ahwa El Hussein', 'cafe', 'khan-el-khalili', 'Mahmoud Saleh'],
    ['Garden City Grand Hotel', 'hotel', 'garden-city', 'Laila Mansour'],
    ['Maadi Feteer & Bakery', 'bakery', 'maadi', 'Omar Shawky'],
    ['Heliopolis Pharmacy', 'pharmacy', 'heliopolis', 'Mona Fathy'],
    ['Downtown Shawarma House', 'shawarma', 'downtown', 'Karim Hosny'],
    ['Zamalek Bistro', 'restaurant', 'zamalek', 'Yasmine Kamal'],
    ['New Cairo Fitness', 'gym', 'new-cairo', 'Tamer Adel'],
    ['Maadi Dental Centre', 'dentist', 'maadi', 'Dr Sherif Naguib'],
    ['Downtown Mobile Repair', 'phone-repair', 'downtown', 'Mostafa Ibrahim'],
    ['Khan el-Khalili Silver Workshop', 'workshop', 'khan-el-khalili', 'Saad Morsi'],
    ['Heliopolis Clinic', 'clinic', 'heliopolis', 'Dr Rania Youssef'],
    ['Garden City Print Shop', 'print-shop', 'garden-city', 'Adel Botros'],
    ['New Cairo Code Camp', 'bootcamp', 'new-cairo', 'Salma Hegazy'],
    ['Maadi Tutoring Centre', 'tutoring', 'maadi', 'Wael Gaber'],
    ['Heliopolis Salon', 'salon', 'heliopolis', 'Dina Sami'],
    ['El Ostaz Barber', 'barber', 'downtown', 'Fathy Ragab'],
    ['Downtown Wallet Agent', 'mobile-money-agent', 'downtown', 'Sayed Ali'],
    ['New Cairo Events Hall', 'event-venue', 'new-cairo', 'Hesham Zaki'],
    ['Heliopolis Logistics Warehouse', 'warehouse', 'heliopolis', 'Magdy Hanna'],
    ['Zamalek Boutique', 'boutique', 'zamalek', 'Farida El-Sayed'],
    ['Maadi Grocer', 'grocer', 'maadi', 'Ashraf Salem'],
    ['Downtown Courier Depot', 'courier-depot', 'downtown', 'Ramy Fouad'],
    ['Khan el-Khalili Tailor', 'tailor', 'khan-el-khalili', 'Ibrahim Nasr'],
    ['Maadi Co-Living', 'co-living', 'maadi', 'Ahmed Tarek'],
    ['Heliopolis Mechanics', 'mechanic', 'heliopolis', 'Hany Rizk'],
  ]),
  dubai: seeds([
    ['Deira Spice Souk Stall', 'souk-stall', 'deira', 'Abdullah Al Mansoori'],
    ['Creekside Karak Café', 'cafe', 'creek', 'Rashid Al Falasi'],
    ['Marina Pier Hotel', 'hotel', 'marina', 'Sophie Laurent'],
    ['DIFC Grill Room', 'restaurant', 'difc', 'James Whitaker'],
    ['Al Quoz Roastery', 'coffee-roaster', 'al-quoz', 'Mariam Al Suwaidi'],
    ['Deira Electronics Bazaar', 'electronics', 'deira', 'Faisal Rahman'],
    ['Deira Shawarma Corner', 'shawarma', 'deira', 'Mohammed Rafiq'],
    ['Jumeirah Beach Salon', 'salon', 'jumeirah', 'Layla Haddad'],
    ['Business Bay Fitness', 'gym', 'business-bay', 'Omar Khalil'],
    ['Jumeirah Family Clinic', 'clinic', 'jumeirah', 'Dr Priya Nair'],
    ['Business Bay Dental', 'dentist', 'business-bay', 'Dr Hamad Al Ketbi'],
    ['Al Quoz Logistics Warehouse', 'warehouse', 'al-quoz', 'Vikram Menon'],
    ['Deira Cargo Couriers', 'courier-depot', 'deira', 'Sajid Hussain'],
    ['Al Quoz Auto Garage', 'mechanic', 'al-quoz', 'Ramesh Pillai'],
    ['Marina Rooftop Lounge', 'bar', 'marina', 'Elena Petrova'],
    ['Jumeirah Bakery', 'bakery', 'jumeirah', 'Nadia Saleh'],
    ['Deira Tailors', 'tailor', 'deira', 'Abdul Kareem'],
    ['Al Quoz Creative Workshop', 'workshop', 'al-quoz', 'Hessa Al Marri'],
    ['DIFC Events Pavilion', 'event-venue', 'difc', 'Khalid Al Hashimi'],
    ['Business Bay Code Academy', 'bootcamp', 'business-bay', 'Aisha Rahman'],
    ['Creek Remittance Counter', 'mobile-money-agent', 'creek', 'Anil Kumar'],
    ['Marina Phone Clinic', 'phone-repair', 'marina', 'Jun Reyes'],
    ['Jumeirah Tutors', 'tutoring', 'jumeirah', 'Sarah Mitchell'],
    ['Deira Grocery', 'grocer', 'deira', 'Abdul Latif'],
    ['Business Bay Co-Living', 'co-living', 'business-bay', 'Daniel Fischer'],
    ['Marina Laundry', 'laundry', 'marina', 'Maricel Santos'],
    ['DIFC Print Studio', 'print-shop', 'difc', 'Yusuf Qureshi'],
    ['Karak & Chapati Truck', 'food-truck', 'jumeirah', 'Saeed Al Nuaimi'],
  ]),
  'san-francisco': seeds([
    ['Taquería Los Gemelos', 'taqueria', 'mission', 'Rosa Hernández'],
    ['Fog City Sourdough', 'bakery', 'wharf', 'Ernesto Bianchi'],
    ['Valencia Pour-Over', 'coffee-roaster', 'mission', 'Maya Lindqvist'],
    ['Golden Lantern Dim Sum', 'dim-sum', 'chinatown', 'Wing Lee'],
    ['SoMa Bike Works', 'bike-shop', 'soma', 'Jake Morrison'],
    ['Dogpatch Co-Living House', 'co-living', 'dogpatch', 'Priya Raman'],
    ['Potrero Crag Climbing Gym', 'climbing-gym', 'dogpatch', 'Alex Kim'],
    ['North Beach Trattoria', 'restaurant', 'north-beach', 'Giovanni Russo'],
    ['The Rainbow Tap', 'pub', 'castro', 'Daniel Ortiz'],
    ['Embarcadero Lunch Truck', 'food-truck', 'fidi', 'Carlos Mendoza'],
    ['Wharf Chowder House', 'restaurant', 'wharf', "Patrick O'Neill"],
    ['Chinatown Herbal Pharmacy', 'pharmacy', 'chinatown', 'Grace Wong'],
    ['SoMa Hackers Bootcamp', 'bootcamp', 'soma', 'Jordan Ellis'],
    ['Presidio Wellness Clinic', 'clinic', 'presidio', 'Dr Sarah Goldberg'],
    ['Castro Dental Studio', 'dentist', 'castro', 'Dr Michael Tran'],
    ['Mission Hair Collective', 'salon', 'mission', 'Lupe García'],
    ['FiDi Barber Lounge', 'barber', 'fidi', 'Marcus Johnson'],
    ['Dogpatch Maker Workshop', 'workshop', 'dogpatch', 'Hannah Schultz'],
    ['SoMa Last-Mile Depot', 'courier-depot', 'soma', 'Kevin Nguyen'],
    ['Third Street Warehouse', 'warehouse', 'dogpatch', 'Luis Ramírez'],
    ['Embarcadero Bay Hotel', 'hotel', 'fidi', 'Catherine Hale'],
    ['North Beach Print Shop', 'print-shop', 'north-beach', 'Tony Esposito'],
    ['Mission Laundromat', 'laundry', 'mission', 'Ana Morales'],
    ['Castro Fitness', 'gym', 'castro', 'Ryan Cooper'],
    ['Presidio Event Hall', 'event-venue', 'presidio', 'Elizabeth Park'],
    ['Chinatown Phone Repair', 'phone-repair', 'chinatown', 'Kenny Chan'],
    ['Wharf Fish Market Stall', 'market-stall', 'wharf', 'Sal Lombardi'],
    ['North Beach Tutors', 'tutoring', 'north-beach', 'Emily Chen'],
  ]),
};

/** Seeds from the end of each roster held back to open over time. */
export const LATE_OPENINGS = 4;

/** District ids per city (shared with the web's city plans). */
export const CITY_DISTRICTS: Partial<Record<string, readonly string[]>> = {
  london: [
    'city',
    'shoreditch',
    'mayfair',
    'soho',
    'borough',
    'camden',
    'southbank',
    'canary-wharf',
  ],
  lagos: ['marina', 'victoria-island', 'ikoyi', 'yaba', 'ikeja', 'balogun', 'lekki', 'surulere'],
  nairobi: [
    'cbd',
    'upper-hill',
    'westlands',
    'kilimani',
    'gikomba',
    'karen',
    'eastleigh',
    'industrial-area',
  ],
  accra: ['osu', 'airport-city', 'makola', 'cantonments', 'labadi', 'east-legon', 'jamestown'],
  freetown: ['central', 'aberdeen', 'lumley', 'kissy', 'wilberforce', 'congo-cross'],
  kigali: ['kiyovu', 'kimihurura', 'nyarugenge', 'nyabugogo', 'kacyiru', 'remera'],
  johannesburg: ['sandton', 'braamfontein', 'maboneng', 'rosebank', 'soweto', 'marshalltown'],
  cairo: [
    'downtown',
    'zamalek',
    'garden-city',
    'khan-el-khalili',
    'maadi',
    'new-cairo',
    'heliopolis',
  ],
  dubai: ['difc', 'marina', 'deira', 'jumeirah', 'business-bay', 'al-quoz', 'creek'],
  'san-francisco': [
    'fidi',
    'soma',
    'mission',
    'chinatown',
    'north-beach',
    'wharf',
    'castro',
    'dogpatch',
    'presidio',
  ],
};
