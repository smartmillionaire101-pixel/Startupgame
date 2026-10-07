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
import type { MarketId } from './markets.js';

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
  /** Wave 6: 0..10, how much fun it is (adds energy, and feeds the scene text). */
  fun?: number;
  /** Wave 6: 0..1, the chance you meet someone new here (they become a contact). */
  meetChance?: number;
  /** Wave 6: a thing to do (dance, watch a film), not just food and drink. */
  activity?: boolean;
  /**
   * Wave 10: the lifestyle tier you need (1 Lean … 5 Lavish). Missing = anyone.
   * Street food, buses and football are for everyone; gyms and cinemas 2;
   * fine dining, golf and spas 3; yachts, galas and polo 4; private jets 5.
   */
  requiresTier?: number;
  /** Wave 10: the activity takes you to another city (`venue.buy` with `to`). */
  travel?: boolean;
}

export interface BusinessGig {
  id: string;
  label: string;
  hours: number;
  payCol: number;
  skill?: GigSkill | null;
}

/** A part-time job a business offers (Wave 5): 40 hours a month, paid monthly from the till. */
export interface JobRole {
  /** Unique within the kind, e.g. 'waiter', 'barista', 'junior-dev'. */
  role: string;
  /** Translatable. */
  label: string;
  /**
   * Monthly take-home pay in cost-of-living units (so it scales with the
   * city). Wave 6: at least 0.9 (entry), 1.2–2.0 skilled, 2.0–3.0 lead. The
   * gross wage is grossed up for the city's income tax (`jobPay`).
   */
  payCol: number;
  /** Wave 6: entry, skilled or lead. */
  level?: JobLevel;
  /** A background matching this skill is paid a little more. */
  skill?: GigSkill | null;
}

export type JobLevel = 'entry' | 'skilled' | 'lead';

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
  /** Part-time jobs it offers (Wave 5). */
  roles: JobRole[];
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
  /** The real street or area it stands on (Wave 5), e.g. 'Lumley Beach Road'. */
  street?: string;
}

// ---------------------------------------------------------------- Helpers

const item = (
  id: string,
  label: string,
  priceCol: number,
  energy?: number,
  meeting?: boolean,
  fun?: { fun?: number; meetChance?: number; activity?: boolean },
): VenueItem => ({
  id,
  label,
  priceCol,
  ...(energy ? { energy } : {}),
  ...(meeting ? { meeting: true } : {}),
  ...(fun?.fun ? { fun: fun.fun } : {}),
  ...(fun?.meetChance ? { meetChance: fun.meetChance } : {}),
  ...(fun?.activity ? { activity: true } : {}),
});

/** Wave 6: a thing to do (an activity), with how much fun it is and who you might meet. */
const act = (
  id: string,
  label: string,
  priceCol: number,
  fun: number,
  meetChance: number,
  opts: { energy?: number; meeting?: boolean } = {},
): VenueItem =>
  item(id, label, priceCol, opts.energy, opts.meeting, { fun, meetChance, activity: true });

/** Wave 10: an activity that needs a lifestyle tier (and may take you to another city). */
const luxe = (
  id: string,
  label: string,
  priceCol: number,
  fun: number,
  meetChance: number,
  requiresTier: number,
  opts: { energy?: number; meeting?: boolean; travel?: boolean } = {},
): VenueItem => ({
  ...act(id, label, priceCol, fun, meetChance, opts),
  requiresTier,
  ...(opts.travel ? { travel: true } : {}),
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

const job = (
  role: string,
  label: string,
  payCol: number,
  skill: GigSkill | null = null,
  level?: JobLevel,
): JobRole => ({ role, label, payCol, skill, ...(level ? { level } : {}) });

/** An entry role (Wave 6: at least 0.9 COL take-home a month). */
const entry = (role: string, label: string, payCol = 0.9, skill: GigSkill | null = null) =>
  job(role, label, payCol, skill, 'entry');
/** A skilled role: 1.2–2.0 COL. */
const skilled = (role: string, label: string, payCol: number, skill: GigSkill | null = null) =>
  job(role, label, payCol, skill, 'skilled');
/** A manager or head role: 2.0–3.0 COL. */
const lead = (role: string, label: string, payCol: number, skill: GigSkill | null = 'ops') =>
  job(role, label, payCol, skill, 'lead');

/**
 * Jobs each category typically offers (Wave 5; Wave 6: entry, skilled and
 * lead in every kind). Monthly take-home pay for the job, in COL units.
 */
const ROLES: Record<BusinessCategory, JobRole[]> = {
  food: [
    entry('waiter', 'Waiter'),
    entry('kitchen', 'Kitchen hand', 0.95, 'ops'),
    skilled('chef', 'Chef', 1.5, 'creative'),
    lead('manager', 'Restaurant manager', 2.2),
  ],
  retail: [
    entry('cashier', 'Cashier'),
    skilled('sales-rep', 'Sales rep', 1.25, 'sales'),
    lead('manager', 'Store manager', 2.1),
  ],
  services: [
    entry('receptionist', 'Receptionist'),
    skilled('bookkeeper', 'Bookkeeper', 1.3, 'ops'),
    lead('manager', 'Branch manager', 2.0),
  ],
  trades: [
    entry('apprentice', 'Apprentice', 0.95),
    skilled('bookkeeper', 'Bookkeeper', 1.3, 'ops'),
    skilled('craftsman', 'Skilled tradesperson', 1.5),
    lead('foreman', 'Foreman', 2.2),
  ],
  health: [
    entry('receptionist', 'Receptionist', 0.95),
    skilled('bookkeeper', 'Bookkeeper', 1.3, 'ops'),
    skilled('nurse', 'Nurse', 1.6),
    lead('manager', 'Practice manager', 2.4),
  ],
  education: [
    entry('assistant', 'Teaching assistant', 0.95),
    skilled('tutor', 'Tutor', 1.4, 'tech'),
    skilled('sales-rep', 'Enrolment officer', 1.25, 'sales'),
    lead('head', 'Head of centre', 2.6),
  ],
  logistics: [
    entry('driver', 'Driver', 0.95),
    skilled('dispatcher', 'Dispatcher', 1.3, 'ops'),
    lead('manager', 'Depot manager', 2.3),
  ],
  hospitality: [
    entry('front-desk', 'Front desk', 0.95),
    entry('waiter', 'Waiter'),
    skilled('sales-rep', 'Sales rep', 1.3, 'sales'),
    lead('manager', 'Duty manager', 2.4),
  ],
};

const BARISTA = [
  entry('barista', 'Barista'),
  entry('cashier', 'Cashier'),
  skilled('head-barista', 'Head barista', 1.2, 'creative'),
  lead('manager', 'Café manager', 2.0),
];
const BAR_STAFF = [
  entry('bartender', 'Bartender', 0.95),
  entry('waiter', 'Waiter'),
  skilled('mixologist', 'Mixologist', 1.4, 'creative'),
  lead('manager', 'Bar manager', 2.1),
];
const TECHNICIAN = [
  skilled('technician', 'Repair technician', 1.3, 'tech'),
  entry('cashier', 'Cashier'),
  lead('manager', 'Shop manager', 2.0),
];

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
    roles?: JobRole[];
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
    roles: extra.roles ?? ROLES[category],
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
  act('pool', 'Game of pool', 0.004, 5, 0.12),
  act('quiz', 'Quiz night', 0.006, 6, 0.2, { meeting: true }),
];

/** Car showrooms (Wave 6 `car-dealer`; `car-dealership` is the Wave 5 name, kept for saved worlds). */
function carDealer(k: 'car-dealer' | 'car-dealership'): BusinessKindSpec {
  return kind(k, 'retail', 'Car dealership', 'warehouse', [20, 60], {
    items: [item('coffee', 'Coffee while you browse', 0.002, 2, true)],
    buys: { fintech: 0.02, saas: 0.012, logistics: 0.01, ecommerce: 0.01 },
    gigs: [
      gig('valet', 'Wash and valet the stock', 8, 0.065),
      gig('leads', 'Call sales leads', 10, 0.14, 'sales'),
    ],
    roles: [
      entry('driver', 'Delivery driver', 0.95),
      entry('valet', 'Valet'),
      skilled('sales-rep', 'Car salesperson', 1.6, 'sales'),
      lead('manager', 'Showroom manager', 2.5, 'sales'),
    ],
    awning: '#37474f',
    color: '#455a64',
  });
}

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
    roles: BARISTA,
    awning: '#6d4c41',
  }),
  kind('coffee-roaster', 'food', 'Coffee roaster', 'shopfront', [8, 20], {
    items: COFFEE,
    buys: { fintech: 0.012, ecommerce: 0.015, logistics: 0.02, agritech: 0.04 },
    roles: BARISTA,
    awning: '#4e342e',
  }),
  kind('bakery', 'food', 'Bakery', 'shopfront', [6, 16], {
    items: [
      item('bread', 'Bread and pastries', 0.004, 4),
      item('coffee', 'Coffee', 0.003, 4, true),
    ],
    roles: [
      entry('baker', 'Baker’s assistant', 0.95, 'ops'),
      entry('cashier', 'Cashier'),
      skilled('head-baker', 'Head baker', 1.4, 'creative'),
      lead('manager', 'Bakery manager', 2.0),
    ],
    awning: '#f0c27b',
  }),
  kind('pub', 'food', 'Pub', 'pub', [12, 32], {
    items: DRINKS,
    roles: BAR_STAFF,
    awning: '#1b5e20',
  }),
  kind('bar', 'food', 'Bar', 'pub', [10, 28], {
    items: DRINKS,
    roles: BAR_STAFF,
    awning: '#311b92',
  }),
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
  kind('electronics', 'retail', 'Electronics shop', 'shopfront', [8, 22], {
    roles: [
      entry('cashier', 'Cashier'),
      skilled('sales-rep', 'Sales rep', 1.25, 'sales'),
      skilled('technician', 'Repair technician', 1.3, 'tech'),
      lead('manager', 'Store manager', 2.2),
    ],
    awning: '#0277bd',
  }),
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
    roles: [
      skilled('designer', 'Junior designer', 1.3, 'creative'),
      entry('cashier', 'Cashier'),
      lead('manager', 'Print shop manager', 2.0),
    ],
    awning: '#455a64',
  }),
  kind('phone-repair', 'services', 'Phone repair shop', 'kiosk', [2, 6], {
    items: [item('fix', 'Fix your phone screen', 0.015)],
    buys: { fintech: 0.015, ecommerce: 0.02, saas: 0.01 },
    gigs: [
      gig('front', 'Mind the counter', 8, 0.055),
      gig('repair', 'Repair jobs', 10, 0.13, 'tech'),
    ],
    roles: TECHNICIAN,
    awning: '#00897b',
  }),
  kind('mobile-money-agent', 'services', 'Mobile money agent', 'kiosk', [1.5, 4], {
    buys: { fintech: 0.05, saas: 0.008 },
    gigs: [gig('shift', 'Agent shift', 8, 0.05), gig('float', 'Float runs', 6, 0.05, 'ops')],
    roles: [
      entry('agent', 'Till operator'),
      skilled('float', 'Float runner', 1.2, 'ops'),
      lead('supervisor', 'Agent supervisor', 2.0),
    ],
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
    items: [
      act('session', 'Workout session', 0.006, 5, 0.06, { energy: 8 }),
      act('spin', 'Spin class with a friend', 0.012, 6, 0.15, { energy: 7, meeting: true }),
    ],
    buys: { healthtech: 0.02, fintech: 0.012, saas: 0.015 },
    roles: [
      skilled('instructor', 'Fitness instructor', 1.3),
      entry('receptionist', 'Receptionist'),
      lead('manager', 'Gym manager', 2.1),
    ],
    awning: '#263238',
  }),
  kind('climbing-gym', 'health', 'Climbing gym', 'warehouse', [10, 24], {
    items: [
      act('session', 'Climbing session', 0.008, 6, 0.08, { energy: 8 }),
      act('climb', 'Climb together', 0.016, 7, 0.15, { energy: 6, meeting: true }),
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
    roles: [
      entry('assistant', 'Teaching assistant', 0.95),
      skilled('junior-dev', 'Junior developer', 1.8, 'tech'),
      skilled('sales-rep', 'Enrolment officer', 1.25, 'sales'),
      lead('head', 'Head of school', 2.8),
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
      act('pool', 'Pool day', 0.02, 7, 0.15, { energy: 6, meeting: true }),
      act('rooftop', 'Rooftop bar night', 0.015, 7, 0.25, { meeting: true }),
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
  // ---- Wave 5: more to do in town (Wave 6: activities, three roles each).
  kind('nightclub', 'hospitality', 'Nightclub', 'pub', [14, 36], {
    items: [
      act('entry', 'Entry', 0.008, 6, 0.12, { energy: 2 }),
      act('dance', 'Dance', 0.004, 8, 0.25),
      item('drink', 'A drink', 0.006, 2, true),
      act('vip', 'VIP table', 0.045, 9, 0.35, { energy: 2, meeting: true }),
      act('bottle', 'Bottle service', 0.08, 10, 0.45, { meeting: true }),
    ],
    buys: { fintech: 0.012, saas: 0.01, logistics: 0.008 },
    gigs: [
      gig('door', 'Door shift', 8, 0.07),
      gig('promo', 'Promote a night', 10, 0.13, 'creative'),
    ],
    roles: [
      entry('bartender', 'Bartender', 0.95),
      entry('security', 'Bouncer', 0.95),
      skilled('promoter', 'Promoter', 1.3, 'creative'),
      skilled('dj', 'DJ', 1.6, 'creative'),
      lead('manager', 'Club manager', 2.4),
    ],
    awning: '#4a148c',
    color: '#6a1b9a',
  }),
  kind('lounge-bar', 'food', 'Rooftop lounge', 'pub', [10, 28], {
    items: [
      item('cocktail', 'Cocktail', 0.01, 3, true),
      item('sundowner', 'Sundowner and small plates', 0.022, 6, true),
      act('dj-set', 'Sunset DJ set', 0.008, 7, 0.2),
      // Wave 10: the rooftop party, for people doing well.
      luxe('rooftop-party', 'Rooftop party', 0.04, 9, 0.4, 3, { meeting: true }),
    ],
    roles: BAR_STAFF,
    awning: '#00695c',
  }),
  kind('coffee-chain', 'food', 'Coffee chain café', 'shopfront', [8, 22], {
    items: [
      item('coffee', 'Coffee', 0.003, 5, true),
      item('latte', 'Iced latte and a muffin', 0.006, 6, true),
      item('laptop', 'An afternoon with your laptop', 0.008, 3),
    ],
    buys: { fintech: 0.015, agritech: 0.035, saas: 0.012, logistics: 0.01 },
    roles: BARISTA,
    awning: '#1b5e20',
  }),
  // Wave 6: a cinema is hospitality (it was services in Wave 5).
  kind('cinema', 'hospitality', 'Cinema', 'hotel', [12, 30], {
    items: [
      act('ticket', 'Film ticket', 0.006, 6, 0.05, { energy: 3, meeting: true }),
      act('combo', 'Ticket, popcorn and a drink', 0.01, 7, 0.06, { energy: 4, meeting: true }),
      { ...act('premiere', 'Premiere night', 0.02, 9, 0.3, { meeting: true }), requiresTier: 3 },
    ],
    buys: { fintech: 0.012, saas: 0.015, ecommerce: 0.01 },
    gigs: [
      gig('usher', 'Usher shift', 8, 0.055),
      gig('posters', 'Posters and social posts', 10, 0.12, 'creative'),
    ],
    roles: [
      entry('usher', 'Usher'),
      entry('box-office', 'Box office'),
      skilled('projectionist', 'Projectionist', 1.3, 'tech'),
      lead('manager', 'Cinema manager', 2.2),
    ],
    awning: '#b71c1c',
    color: '#c62828',
  }),
  kind('studio-gym', 'health', 'Fitness class studio', 'shopfront', [5, 14], {
    items: [
      act('class', 'Group class', 0.008, 6, 0.1, { energy: 8 }),
      act('class-together', 'Take a class together', 0.016, 6, 0.15, {
        energy: 7,
        meeting: true,
      }),
    ],
    buys: { healthtech: 0.025, fintech: 0.012, saas: 0.015 },
    roles: [
      skilled('instructor', 'Class instructor', 1.3),
      entry('receptionist', 'Receptionist'),
      lead('manager', 'Studio manager', 2.0),
    ],
    awning: '#ff4081',
  }),
  carDealer('car-dealer'),
  // The Wave 5 name, kept so saved worlds' dealerships still work (new rosters use 'car-dealer').
  carDealer('car-dealership'),
  kind('furniture-store', 'retail', 'Furniture store', 'warehouse', [10, 28], {
    items: [item('browse', 'Coffee in the showroom', 0.002, 2, true)],
    buys: { fintech: 0.012, ecommerce: 0.025, logistics: 0.02, saas: 0.006 },
    gigs: [
      gig('delivery', 'Delivery and assembly', 8, 0.065),
      gig('online', 'Put the catalogue online', 12, 0.16, 'tech'),
    ],
    roles: [
      entry('driver', 'Delivery driver', 0.95),
      skilled('sales-rep', 'Showroom sales', 1.3, 'sales'),
      lead('manager', 'Showroom manager', 2.2, 'sales'),
    ],
    awning: '#8d6e63',
  }),
  kind('co-working', 'services', 'Co-working space', 'hotel', [8, 22], {
    items: [
      item('day-pass', 'Day pass', 0.012, 2, true),
      item('coffee', 'Coffee in the lounge', 0.003, 4, true),
      act('demo-night', 'Founder demo night', 0.006, 6, 0.3, { meeting: true }),
    ],
    buys: { fintech: 0.012, saas: 0.03, healthtech: 0.004 },
    gigs: [
      gig('community', 'Run a community evening', 8, 0.08, 'sales'),
      gig('it', 'Fix the Wi-Fi and printers', 10, 0.15, 'tech'),
    ],
    roles: [
      entry('host', 'Front desk host'),
      skilled('community', 'Community manager', 1.3, 'sales'),
      skilled('junior-dev', 'Junior developer', 1.8, 'tech'),
      lead('manager', 'Space manager', 2.2),
    ],
    awning: '#0288d1',
  }),
  kind('art-gallery', 'services', 'Art gallery', 'shopfront', [4, 12], {
    items: [
      act('visit', 'See the exhibition', 0.003, 5, 0.1, { energy: 4, meeting: true }),
      act('opening', 'Opening night drinks', 0.01, 7, 0.35, { energy: 4, meeting: true }),
    ],
    buys: { fintech: 0.01, ecommerce: 0.025, saas: 0.008 },
    gigs: [
      gig('hang', 'Hang a show', 8, 0.06),
      gig('catalogue', 'Write the catalogue', 10, 0.13, 'creative'),
    ],
    roles: [
      entry('gallery', 'Gallery assistant', 0.95, 'creative'),
      skilled('sales-rep', 'Art sales', 1.4, 'sales'),
      lead('curator', 'Curator', 2.2, 'creative'),
    ],
    awning: '#fafafa',
    color: '#7e57c2',
  }),
  kind('live-music', 'hospitality', 'Live-music venue', 'pub', [10, 28], {
    items: [
      act('gig-ticket', 'Live show ticket', 0.012, 8, 0.2, { energy: 4, meeting: true }),
      act('open-mic', 'Open-mic night', 0.004, 7, 0.25),
      item('drink', 'A drink', 0.006, 2, true),
    ],
    buys: { fintech: 0.012, saas: 0.012, ecommerce: 0.008 },
    gigs: [
      gig('stage', 'Stage crew', 8, 0.065),
      gig('promo', 'Promote the line-up', 10, 0.13, 'creative'),
    ],
    roles: [
      entry('bartender', 'Bartender', 0.95),
      entry('stage', 'Stage hand'),
      skilled('sound', 'Sound engineer', 1.5, 'tech'),
      lead('manager', 'Venue manager', 2.2),
    ],
    awning: '#ff6f00',
    color: '#e65100',
  }),
  // ---- Wave 6: a city that's alive.
  kind('lounge', 'food', 'Lounge', 'pub', [10, 26], {
    items: [
      item('cocktail', 'Cocktails', 0.01, 3, true),
      act('shisha', 'Shisha', 0.01, 6, 0.15, { meeting: true }),
      act('live-dj', 'Live DJ night', 0.012, 8, 0.25),
    ],
    buys: { fintech: 0.012, saas: 0.01, agritech: 0.02, logistics: 0.008 },
    gigs: [
      gig('door', 'Host the door', 8, 0.065),
      gig('promo', 'Promote a night', 10, 0.13, 'creative'),
    ],
    roles: [
      entry('bartender', 'Bartender', 0.95),
      entry('shisha', 'Shisha attendant'),
      skilled('dj', 'DJ', 1.6, 'creative'),
      lead('manager', 'Lounge manager', 2.2),
    ],
    awning: '#5d1049',
    color: '#880e4f',
  }),
  kind('karaoke', 'hospitality', 'Karaoke bar', 'pub', [6, 16], {
    items: [
      act('room', 'Karaoke room', 0.015, 8, 0.15, { meeting: true }),
      act('song', 'Sing a song', 0.003, 7, 0.12, { energy: 2 }),
      item('drink', 'A drink', 0.006, 2, true),
    ],
    buys: { fintech: 0.012, saas: 0.012, ecommerce: 0.006 },
    gigs: [
      gig('host', 'Host a karaoke night', 8, 0.065, 'creative'),
      gig('tech', 'Fix the song system', 10, 0.15, 'tech'),
    ],
    roles: [
      entry('host', 'Karaoke host', 0.95, 'creative'),
      entry('bartender', 'Bartender', 0.95),
      skilled('sound', 'Sound engineer', 1.4, 'tech'),
      lead('manager', 'Bar manager', 2.0),
    ],
    awning: '#e91e63',
    color: '#ad1457',
  }),
  kind('arcade', 'hospitality', 'Arcade and bowling', 'warehouse', [6, 18], {
    items: [
      act('games', 'Arcade games', 0.005, 7, 0.08, { energy: 2 }),
      act('bowling', 'Bowling lane', 0.012, 8, 0.15, { energy: 2, meeting: true }),
      item('snack', 'Snacks and a drink', 0.004, 3),
    ],
    buys: { fintech: 0.012, saas: 0.015, ecommerce: 0.006 },
    gigs: [
      gig('floor', 'Floor shift', 8, 0.06),
      gig('machines', 'Repair the machines', 10, 0.15, 'tech'),
    ],
    roles: [
      entry('attendant', 'Floor attendant'),
      skilled('technician', 'Machine technician', 1.3, 'tech'),
      lead('manager', 'Arcade manager', 2.0),
    ],
    awning: '#2962ff',
    color: '#304ffe',
  }),
  kind('spa', 'health', 'Spa', 'clinic', [6, 16], {
    items: [
      { ...act('massage', 'Massage', 0.02, 6, 0.03, { energy: 12 }), requiresTier: 3 },
      { ...act('day-pass', 'Spa day pass', 0.012, 5, 0.08, { energy: 8, meeting: true }), requiresTier: 3 },
    ],
    buys: { healthtech: 0.025, fintech: 0.012, saas: 0.012 },
    gigs: [
      gig('reception', 'Reception shift', 8, 0.065),
      gig('booking', 'Set up online booking', 12, 0.17, 'tech'),
    ],
    roles: [
      entry('receptionist', 'Receptionist'),
      skilled('therapist', 'Spa therapist', 1.4),
      lead('manager', 'Spa manager', 2.2),
    ],
    awning: '#80cbc4',
    color: '#00897b',
  }),
  kind('beach-club', 'hospitality', 'Beach club', 'hotel', [12, 32], {
    items: [
      act('day-bed', 'Day bed', 0.02, 7, 0.15, { energy: 6, meeting: true }),
      act('sunset', 'Sunset party', 0.012, 9, 0.3),
      item('drink', 'A drink on the sand', 0.007, 2, true),
    ],
    buys: { fintech: 0.012, saas: 0.012, agritech: 0.02, logistics: 0.008 },
    gigs: [
      gig('events', 'Beach party staffing', 8, 0.065),
      gig('promo', 'Promote the season', 10, 0.13, 'creative'),
    ],
    roles: [
      entry('waiter', 'Waiter'),
      entry('bartender', 'Bartender', 0.95),
      skilled('lifeguard', 'Lifeguard', 1.2),
      skilled('dj', 'DJ', 1.6, 'creative'),
      lead('manager', 'Club manager', 2.4),
    ],
    awning: '#ffb300',
    color: '#ff8f00',
  }),
  kind('football-pitch', 'health', 'Football pitch', 'warehouse', [3, 9], {
    items: [
      act('five-a-side', 'Five-a-side game', 0.004, 8, 0.5),
      act('book', 'Book the pitch with friends', 0.012, 8, 0.35, { meeting: true }),
      item('drink', 'Cold drink', 0.002, 2),
    ],
    buys: { healthtech: 0.02, fintech: 0.012, saas: 0.01 },
    gigs: [
      gig('referee', 'Referee a match', 6, 0.05),
      gig('league', 'Run the weekend league', 10, 0.12, 'ops'),
    ],
    roles: [
      entry('groundskeeper', 'Groundskeeper'),
      skilled('coach', 'Coach', 1.4),
      lead('manager', 'Pitch manager', 2.0),
    ],
    awning: '#43a047',
    color: '#2e7d32',
  }),
  kind('appliance-store', 'retail', 'Appliance and electronics store', 'warehouse', [10, 28], {
    items: [item('browse', 'Try the latest gadgets', 0.002, 2, true)],
    buys: { fintech: 0.012, ecommerce: 0.025, logistics: 0.02, saas: 0.006 },
    gigs: [
      gig('delivery', 'Delivery and installation', 8, 0.065),
      gig('online', 'Put the catalogue online', 12, 0.16, 'tech'),
    ],
    roles: [
      entry('cashier', 'Cashier'),
      skilled('sales-rep', 'Sales rep', 1.25, 'sales'),
      skilled('installer', 'Installer', 1.3, 'tech'),
      lead('manager', 'Store manager', 2.2),
    ],
    awning: '#0277bd',
    color: '#01579b',
  }),
  // Wave 10: lifestyle venues (landmarks, data/landmarks.ts) and the tech campuses of SF.
  kind('marina', 'hospitality', 'Yacht marina', 'hotel', [20, 50], {
    items: [
      luxe('sunset-cruise', 'Sunset cruise', 0.06, 8, 0.3, 3, { meeting: true }),
      luxe('yacht-day', 'Yacht day', 0.8, 10, 0.6, 4, { energy: 10, meeting: true }),
      item('drink', 'A drink on the pontoon', 0.008, 2, true),
    ],
    buys: { fintech: 0.012, saas: 0.015, logistics: 0.012 },
    gigs: [
      gig('deckhand', 'Deckhand for the day', 8, 0.07),
      gig('charters', 'Sell charters to companies', 10, 0.15, 'sales'),
    ],
    roles: [
      entry('deckhand', 'Deckhand', 0.95),
      skilled('skipper', 'Skipper', 1.8),
      lead('manager', 'Harbour master', 2.6),
    ],
    awning: '#0d47a1',
    color: '#1565c0',
  }),
  kind('golf-club', 'hospitality', 'Golf and country club', 'hotel', [20, 50], {
    items: [
      item('clubhouse', 'Lunch at the clubhouse', 0.03, 8, true),
      luxe('golf', 'Round of golf', 0.06, 7, 0.45, 3, { energy: 4, meeting: true }),
      luxe('polo', 'Polo match', 0.3, 9, 0.5, 4, { meeting: true }),
    ],
    buys: { fintech: 0.012, saas: 0.015, agritech: 0.015 },
    gigs: [
      gig('caddie', 'Caddie a round', 6, 0.06),
      gig('members', 'Sign up new members', 10, 0.15, 'sales'),
    ],
    roles: [
      entry('caddie', 'Caddie', 0.95),
      skilled('pro', 'Golf pro', 1.9),
      lead('manager', 'Club secretary', 2.6),
    ],
    awning: '#1b5e20',
    color: '#2e7d32',
  }),
  kind('ballroom', 'hospitality', 'Grand ballroom', 'hotel', [18, 45], {
    items: [
      luxe('charity-ball', 'Charity ball', 0.09, 8, 0.45, 3, { meeting: true }),
      luxe('gala', 'Gala dinner', 0.4, 9, 0.6, 4, { meeting: true }),
    ],
    buys: { fintech: 0.012, saas: 0.015, agritech: 0.02, logistics: 0.008 },
    gigs: [
      gig('events', 'Gala staffing', 8, 0.07),
      gig('sales', 'Sell tables to companies', 10, 0.15, 'sales'),
    ],
    roles: [
      entry('waiter', 'Waiter'),
      skilled('planner', 'Events planner', 1.6, 'ops'),
      lead('manager', 'Banqueting manager', 2.5),
    ],
    awning: '#6a1b9a',
    color: '#4a148c',
  }),
  kind('private-terminal', 'hospitality', 'Private jet terminal', 'warehouse', [25, 60], {
    items: [
      item('lounge', 'Lounge access', 0.03, 4, true),
      luxe('jet-weekend', 'Private-jet weekend', 4, 10, 0.5, 5, { meeting: true, travel: true }),
    ],
    buys: { fintech: 0.015, saas: 0.015, logistics: 0.02 },
    gigs: [
      gig('ground', 'Ground crew shift', 8, 0.08),
      gig('charters', 'Sell charter hours', 10, 0.16, 'sales'),
    ],
    roles: [
      entry('ground', 'Ground crew', 0.95),
      skilled('dispatcher', 'Flight dispatcher', 1.7, 'ops'),
      lead('manager', 'Terminal manager', 2.8),
    ],
    awning: '#263238',
    color: '#37474f',
  }),
  kind('tech-campus', 'services', 'Tech campus', 'hotel', [150, 400], {
    items: [
      item('cafeteria', 'Lunch at the campus café', 0.004, 7, true),
      act('tour', 'Campus tour and talk', 0.006, 5, 0.4, { meeting: true }),
    ],
    buys: { saas: 0.03, fintech: 0.01, healthtech: 0.01, edtech: 0.008, logistics: 0.008 },
    gigs: [
      gig('contract', 'Contract engineering sprint', 12, 0.25, 'tech'),
      gig('research', 'User research sessions', 10, 0.18, 'creative'),
    ],
    roles: [
      entry('support', 'Support specialist', 1.1, 'tech'),
      skilled('engineer', 'Software engineer', 2, 'tech'),
      skilled('pm', 'Product manager', 1.9, 'ops'),
      lead('director', 'Engineering director', 3, 'tech'),
    ],
    awning: '#00bcd4',
    color: '#0097a7',
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

type Row = [name: string, kind: string, district: string, owner: string, street?: string];

const seeds = (rows: Row[]): BusinessSeed[] =>
  rows.map(([name, k, district, owner, street]) => ({
    name,
    kind: k,
    district,
    owner,
    ...(street ? { street } : {}),
  }));

/**
 * The businesses of each city, by market id. The last few in each list are
 * not open on day one; they open over the months as the city changes.
 */
export const CITY_BUSINESSES: Record<MarketId, BusinessSeed[]> = {
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
    ['Velvet Arches Club', 'nightclub', 'shoreditch', 'Marcus Adeyemi', 'Old Street'],
    ['Skyline Terrace Bar', 'lounge-bar', 'southbank', 'Isla Morgan', 'Upper Ground'],
    ['Daily Grind Coffee Co.', 'coffee-chain', 'city', 'Oliver Bennett', 'Cheapside'],
    ['The Wardour Picturehouse', 'cinema', 'soho', 'Ruth Abrahams', 'Wardour Street'],
    ['Wharf Motor Company', 'car-dealer', 'canary-wharf', 'Gary Holt', 'Westferry Road'],
    ['Camden Loft Furniture', 'furniture-store', 'camden', 'Nadia Rossi', 'Camden High Street'],
    ['The Bureau Shoreditch', 'co-working', 'shoreditch', 'Priyanka Desai', 'Great Eastern Street'],
    ['Pulse Cycle Studio', 'studio-gym', 'mayfair', 'Jade Whitmore', 'Mount Street'],
    ['Bankside Contemporary', 'art-gallery', 'southbank', 'Felix Navarro', 'Bankside'],
    ['The Chalk Farm Rooms', 'live-music', 'camden', 'Kwame Boateng', 'Chalk Farm Road'],
    ['Borough Oyster Bar', 'restaurant', 'borough', 'Aisling Byrne', 'Borough High Street'],
    ['Leather Lane Street Kitchen', 'food-truck', 'city', 'Dimitri Papadopoulos', 'Leather Lane'],
    // Wave 6: two nightclubs, a lounge, showrooms, a pitch, a spa, karaoke; the last four open later.
    ['Neon Arches', 'nightclub', 'shoreditch', 'Marcus Bell', 'Great Eastern Street'],
    ['The Amber Room', 'lounge', 'mayfair', 'Leyla Haddad', 'Mount Street'],
    ['Cheapside Home Electrics', 'appliance-store', 'city', 'Dev Malhotra', 'Cheapside'],
    ['Westferry Five-a-Side', 'football-pitch', 'canary-wharf', 'Kwame Asante', 'Westferry Road'],
    ['Bankside Bathhouse Spa', 'spa', 'southbank', 'Ingrid Sorensen', 'Bankside'],
    ['Wardour Street Sing-Song', 'karaoke', 'soho', 'Jin Park', 'Wardour Street'],
    ['Camden Pins & Pixels', 'arcade', 'camden', 'Danny Walsh', 'Chalk Farm Road'],
    ['The Borough Taproom', 'bar', 'borough', 'Siobhan Kelly', 'Borough High Street'],
    ['Leather Lane Trattoria', 'restaurant', 'city', 'Marco Bellini', 'Leather Lane'],
    ['Upper Ground Coffee House', 'cafe', 'southbank', 'Ruth Adeyemi', 'Upper Ground'],
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
    ['Club Eko Nights', 'nightclub', 'victoria-island', 'Tunde Bakare-Cole', 'Adeola Odeku Street'],
    ['Lagoon Rooftop Lounge', 'lounge-bar', 'ikoyi', 'Zainab Bello', 'Awolowo Road'],
    ['Mainland Brew Coffee', 'coffee-chain', 'yaba', 'Chioma Udeh', 'Herbert Macaulay Way'],
    ['Lekki Silverscreen Cinema', 'cinema', 'lekki', 'Ayo Oyelaran', 'Admiralty Way'],
    ['Allen Avenue Motors', 'car-dealer', 'ikeja', 'Alhaji Musa Dantata', 'Allen Avenue'],
    [
      'Ikeja Home Comfort Furniture',
      'furniture-store',
      'ikeja',
      'Bimbo Adeleke',
      'Obafemi Awolowo Way',
    ],
    ['Yaba Hub Co-Working', 'co-working', 'yaba', 'Femi Ogundipe', 'Herbert Macaulay Way'],
    ['Admiralty Spin Studio', 'studio-gym', 'lekki', 'Tomi Adesina', 'Admiralty Way'],
    ['Ikoyi Art House', 'art-gallery', 'ikoyi', 'Nike Okafor', 'Bourdillon Road'],
    [
      'Surulere Afrobeat Hall',
      'live-music',
      'surulere',
      'Kola Ransome',
      'Adeniran Ogunsanya Street',
    ],
    ['Broad Street Canteen', 'buka', 'marina', 'Iya Kafayat Lawal', 'Broad Street'],
    ['Balogun Shoe Market Stall', 'market-stall', 'balogun', 'Uche Nwosu', 'Balogun Market'],
    // Wave 6: two nightclubs, a lounge, showrooms, a pitch, a spa, karaoke; the last four open later.
    ['Lekki Afrobeats Arena', 'nightclub', 'lekki', 'Tobi Adeyemi', 'Admiralty Way'],
    ['Lekki Smoke Lounge', 'lounge', 'lekki', 'Folake Ajayi', 'Admiralty Way'],
    ['Allen Avenue Home Appliances', 'appliance-store', 'ikeja', 'Chukwuma Eze', 'Allen Avenue'],
    [
      'Surulere Five-a-Side Pitch',
      'football-pitch',
      'surulere',
      'Kunle Bakare',
      'Adeniran Ogunsanya Street',
    ],
    ['Bourdillon Wellness Spa', 'spa', 'ikoyi', 'Ngozi Okafor', 'Bourdillon Road'],
    ['Yaba Mic Drop Karaoke', 'karaoke', 'yaba', 'Emeka Nwosu', 'Herbert Macaulay Way'],
    ['Ikeja Strike Zone', 'arcade', 'ikeja', 'Bisi Lawal', 'Obafemi Awolowo Way'],
    ['Atlantic Sands Beach Club', 'beach-club', 'lekki', 'Uche Obi', 'Admiralty Way'],
    ['Broad Street Pepper Soup House', 'restaurant', 'marina', 'Titi Ogundipe', 'Broad Street'],
    ['Awolowo Road Coffee Corner', 'cafe', 'ikoyi', 'Funmi Adewale', 'Awolowo Road'],
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
    ['Westlands Groove Club', 'nightclub', 'westlands', 'Victor Kamau', 'Waiyaki Way'],
    ['Kilimani Sky Lounge', 'lounge-bar', 'kilimani', 'Njeri Gathoni', 'Argwings Kodhek Road'],
    ['Nairobi Bean Coffee Co.', 'coffee-chain', 'cbd', 'Paul Mbugua', 'Kenyatta Avenue'],
    ['Upper Hill Cineplex', 'cinema', 'upper-hill', 'Hassan Noor', 'Hospital Road'],
    ['Mombasa Road Auto Mart', 'car-dealer', 'industrial-area', 'Raj Patel', 'Mombasa Road'],
    ['Ngong Road Furniture Gallery', 'furniture-store', 'kilimani', 'Lucy Wanjiku', 'Ngong Road'],
    ['The Hive Westlands', 'co-working', 'westlands', 'Martin Otieno', 'Woodvale Grove'],
    ['Karen Pulse Studio', 'studio-gym', 'karen', 'Amina Said', 'Karen Road'],
    ['Ngong Hill Gallery', 'art-gallery', 'karen', 'Wanjiru Mwangi', 'Ngong Road'],
    ['Eastleigh Benga Hall', 'live-music', 'eastleigh', 'Otieno Ouma', 'First Avenue Eastleigh'],
    ['Moi Avenue Nyama Choma', 'grill-house', 'cbd', 'Stephen Kiprop', 'Moi Avenue'],
    ['Gikomba Shoe Stall', 'market-stall', 'gikomba', 'Rose Wambui', 'Gikomba Market'],
    // Wave 6: two nightclubs, a lounge, showrooms, a pitch, a spa, karaoke; the last four open later.
    ['Woodvale Nights', 'nightclub', 'westlands', 'Brian Otieno', 'Woodvale Grove'],
    ['Kilimani Hookah Lounge', 'lounge', 'kilimani', 'Wanjiru Kamau', 'Argwings Kodhek Road'],
    ['Moi Avenue Electronics & Appliances', 'appliance-store', 'cbd', 'Hassan Abdi', 'Moi Avenue'],
    ['Ngong Road Turf', 'football-pitch', 'kilimani', 'Peter Mwangi', 'Ngong Road'],
    ['Karen Garden Spa', 'spa', 'karen', 'Njeri Wambui', 'Karen Road'],
    ['Kenyatta Avenue Karaoke Club', 'karaoke', 'cbd', 'Kevin Ochieng', 'Kenyatta Avenue'],
    ['Waiyaki Way Bowl & Play', 'arcade', 'westlands', 'Faith Chebet', 'Waiyaki Way'],
    ['Eastleigh Rooftop Bar', 'bar', 'eastleigh', 'Abdirahman Yusuf', 'First Avenue Eastleigh'],
    ['Hospital Road Swahili Kitchen', 'restaurant', 'upper-hill', 'Zawadi Mutua', 'Hospital Road'],
    ['Mombasa Road Coffee Stop', 'cafe', 'industrial-area', 'James Kiprop', 'Mombasa Road'],
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
    ['Oxford Street Club House', 'nightclub', 'osu', 'Kwabena Owusu', 'Oxford Street'],
    ['Airport Sky Lounge', 'lounge-bar', 'airport-city', 'Adjoa Mensah', 'Liberation Road'],
    ['Black Star Coffee Co.', 'coffee-chain', 'cantonments', 'Yaw Darko', 'Cantonments Road'],
    ['Labadi Picture House', 'cinema', 'labadi', 'Nii Okai', 'Labadi Road'],
    ['Spintex Auto Plaza', 'car-dealer', 'east-legon', 'Alhaji Ibrahim Iddrisu', 'Spintex Road'],
    ['Osu Home & Living', 'furniture-store', 'osu', 'Esi Asante', 'Cantonments Road'],
    ['Airport City Co-Lab', 'co-working', 'airport-city', 'Selorm Kpodo', 'Airport Bypass Road'],
    ['East Legon Fit Studio', 'studio-gym', 'east-legon', 'Akosua Ampofo', 'Lagos Avenue'],
    ['Jamestown Light Gallery', 'art-gallery', 'jamestown', 'Kofi Dawson', 'High Street'],
    ['Osu Highlife Joint', 'live-music', 'osu', 'Ebo Quaye', 'Oxford Street'],
    ['Makola Kenkey House', 'chop-bar', 'makola', 'Auntie Adukwei', 'Makola Market'],
    ['Kaneshie Fabric Stall', 'fabric-stall', 'makola', 'Gifty Boateng', 'Kojo Thompson Road'],
    // Wave 6: two nightclubs, a lounge, showrooms, a pitch, a spa, karaoke; the last four open later.
    ['Oxford Street After Dark', 'nightclub', 'osu', 'Kojo Mensah-Bonsu', 'Oxford Street'],
    ['Airport City Sky Lounge', 'lounge', 'airport-city', 'Adwoa Sarpong', 'Liberation Road'],
    ['Spintex Home Appliances', 'appliance-store', 'east-legon', 'Kwesi Ofori', 'Spintex Road'],
    ['Labadi Astro Turf', 'football-pitch', 'labadi', 'Nii Armah Tetteh', 'Labadi Road'],
    ['Cantonments Shea Spa', 'spa', 'cantonments', 'Akua Boakye', 'Cantonments Road'],
    ['Lagos Avenue Karaoke Lounge', 'karaoke', 'east-legon', 'Yaw Darko', 'Lagos Avenue'],
    ['Airport Bypass Bowling', 'arcade', 'airport-city', 'Efua Quaye', 'Airport Bypass Road'],
    ['Labadi Sands Beach Club', 'beach-club', 'labadi', 'Nana Kwame Asare', 'Labadi Road'],
    ['Jamestown Lighthouse Grill', 'restaurant', 'jamestown', 'Dede Lartey', 'High Street'],
    ['Kojo Thompson Coffee', 'cafe', 'makola', 'Esi Owusu', 'Kojo Thompson Road'],
  ]),
  freetown: seeds([
    ["Mammy Kadi's Cookery", 'chop-bar', 'central', 'Kadiatu Kamara', 'Siaka Stevens Street'],
    ['Lumley Beach Bar', 'bar', 'lumley', 'Mohamed Sesay', 'Lumley Beach Road'],
    ['Aberdeen Seaview Hotel', 'hotel', 'aberdeen', 'Isatu Bangura', 'Aberdeen'],
    ['Big Market Gara Cloth', 'fabric-stall', 'central', 'Fatmata Conteh', 'Big Market'],
    ['Kissy Road Phone Doctor', 'phone-repair', 'kissy', 'Abu Koroma', 'Kissy Road'],
    ['Congo Cross Pharmacy', 'pharmacy', 'congo-cross', 'Aminata Jalloh', 'Congo Cross'],
    ['Wilberforce Bakery', 'bakery', 'wilberforce', 'Christiana Cole', 'Spur Road'],
    [
      'Central Cash Point Agent',
      'mobile-money-agent',
      'central',
      'Ibrahim Turay',
      'Siaka Stevens Street',
    ],
    ['Keke Fix Mechanics', 'mechanic', 'kissy', 'Alusine Kanu', 'Kissy Road'],
    ['Aberdeen Grill House', 'restaurant', 'aberdeen', 'Fouad Hassan', 'Aberdeen'],
    ['Lumley Fresh Fish Stall', 'market-stall', 'lumley', 'Yeabu Kargbo', 'Lumley Beach Road'],
    ['Krio Pot Restaurant', 'restaurant', 'congo-cross', 'Olivia Macauley', 'Wilkinson Road'],
    ['Freetown Style Salon', 'salon', 'central', 'Mariama Bah', 'Siaka Stevens Street'],
    ['Wilberforce Barbing Saloon', 'barber', 'wilberforce', 'Sorie Kamara', 'Spur Road'],
    ['Kissy Provisions Store', 'grocer', 'kissy', 'Sheku Fofanah', 'Kissy Road'],
    ['Congo Cross Clinic', 'clinic', 'congo-cross', 'Dr Fatu Kallon', 'Congo Cross'],
    ['Lumley Event Hall', 'event-venue', 'lumley', 'Samuel Thomas', 'Lumley Beach Road'],
    [
      'Central Print & Photocopy',
      'print-shop',
      'central',
      'Joseph Williams',
      'Siaka Stevens Street',
    ],
    ['Aberdeen Coffee Corner', 'cafe', 'aberdeen', 'Hawa Sankoh', 'Aberdeen'],
    ['Kissy Dockyard Warehouse', 'warehouse', 'kissy', 'Abdul Mansaray', 'Kissy Road'],
    ['Salone Tailoring', 'tailor', 'central', 'Musa Kabia', 'Big Market'],
    ['Wilberforce Tutorial Centre', 'tutoring', 'wilberforce', 'Daniel Kamara', 'Spur Road'],
    ['Swift Dispatch Salone', 'courier-depot', 'congo-cross', 'Lansana Sesay', 'Wilkinson Road'],
    ['Lumley Gym', 'gym', 'lumley', 'Ishmael Kamara', 'Lumley Beach Road'],
    ['Freetown Code Club', 'bootcamp', 'wilberforce', 'Fatmata Koroma', 'Wilkinson Road'],
    ['Congo Cross Laundry', 'laundry', 'congo-cross', 'Mabinty Sillah', 'Congo Cross'],
    ['Aberdeen Guesthouse', 'guesthouse', 'aberdeen', 'Rugiatu Kamara', 'Aberdeen'],
    ['Kissy Road Electronics', 'electronics', 'kissy', 'Hassan Jaber', 'Kissy Road'],
    ['Atlantic Groove Club', 'nightclub', 'aberdeen', 'Abdulai Conteh', 'Aberdeen'],
    ['Sunset Deck Lounge', 'lounge-bar', 'lumley', 'Yvonne Taylor-Pearce', 'Lumley Beach Road'],
    ['Cotton Tree Coffee Co.', 'coffee-chain', 'central', 'Fatu Sesay', 'Siaka Stevens Street'],
    ['Salone Screens Cinema', 'cinema', 'congo-cross', 'Emmanuel Johnson', 'Wilkinson Road'],
    ['Lion Mountain Motors', 'car-dealer', 'kissy', 'Alhaji Ibrahim Bah', 'Kissy Road'],
    [
      'Hill Station Home & Furniture',
      'furniture-store',
      'wilberforce',
      'Josephine Williams',
      'Wilkinson Road',
    ],
    ['Wilkinson Hub Co-Working', 'co-working', 'congo-cross', 'Michael Kargbo', 'Wilkinson Road'],
    ['Beach Body Studio', 'studio-gym', 'lumley', 'Zainab Kamara', 'Lumley Beach Road'],
    ['Krio Heritage Gallery', 'art-gallery', 'central', 'Adetokunbo Nicol', 'Siaka Stevens Street'],
    ['Congo Cross Live Yard', 'live-music', 'congo-cross', 'Sahr Komba', 'Congo Cross'],
    ["Aunty Isha's Poyo & Grill", 'grill-house', 'lumley', 'Isha Turay', 'Lumley Beach Road'],
    ['Big Market Craft Stall', 'market-stall', 'central', 'Kumba Lahai', 'Big Market'],
    ['Kissy Road Cash Point', 'mobile-money-agent', 'kissy', 'Osman Kamara', 'Kissy Road'],
    ['Spur Road Dental', 'dentist', 'wilberforce', 'Dr Kadie Sesay', 'Spur Road'],
    ['Aberdeen Ferry Café', 'cafe', 'aberdeen', 'Marie Cole', 'Aberdeen'],
    ['Congo Cross Fashion House', 'boutique', 'congo-cross', 'Nenneh Bangura', 'Congo Cross'],
    ['Kissy Cold Store', 'cold-store', 'kissy', 'Foday Mansaray', 'Kissy Road'],
    // Wave 6: two nightclubs, a lounge, showrooms, a pitch, a spa, karaoke; the last four open later.
    ['Aberdeen Night Owl Club', 'nightclub', 'aberdeen', 'Sahr Kamara', 'Aberdeen'],
    ['Wilkinson Road Shisha Lounge', 'lounge', 'congo-cross', 'Mariama Jalloh', 'Wilkinson Road'],
    [
      'Siaka Stevens Home Electrics',
      'appliance-store',
      'central',
      'Abdul Sesay',
      'Siaka Stevens Street',
    ],
    ['Kissy Road Football Pitch', 'football-pitch', 'kissy', 'Alusine Conteh', 'Kissy Road'],
    ['Spur Road Calm Spa', 'spa', 'wilberforce', 'Isatu Bangura', 'Spur Road'],
    ['Lumley Sing-Along', 'karaoke', 'lumley', 'Foday Turay', 'Lumley Beach Road'],
    ['Congo Cross Games Hall', 'arcade', 'congo-cross', 'Hawa Koroma', 'Congo Cross'],
    ['Lumley Sunset Beach Club', 'beach-club', 'lumley', 'Mohamed Kanu', 'Lumley Beach Road'],
    ["Auntie Kadi's Kitchen", 'restaurant', 'aberdeen', 'Kadiatu Kargbo', 'Aberdeen'],
    ['Big Market Coffee Stop', 'cafe', 'central', 'Aminata Sesay', 'Big Market'],
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
    ['Kimihurura Night Club', 'nightclub', 'kimihurura', 'Fabrice Mugenzi', 'KG 7 Avenue'],
    ['Kiyovu Sky Lounge', 'lounge-bar', 'kiyovu', 'Aline Uwase', 'KN 3 Road'],
    [
      'Thousand Hills Coffee Co.',
      'coffee-chain',
      'nyarugenge',
      'Jean Claude Mutabazi',
      'KN 4 Avenue',
    ],
    ['Kigali Hills Screens', 'cinema', 'nyarugenge', 'Gilbert Nkusi', 'KN 2 Avenue'],
    ['Remera Motors', 'car-dealer', 'remera', 'Eric Rwigema', 'KG 11 Avenue'],
    ['Kacyiru Home Furniture', 'furniture-store', 'kacyiru', 'Pacifique Uwera', 'KG 5 Avenue'],
    ['Kacyiru Innovation Co-Working', 'co-working', 'kacyiru', 'Teta Ishimwe', 'KG 7 Avenue'],
    ['Remera Fit Studio', 'studio-gym', 'remera', 'Divine Iradukunda', 'KG 17 Avenue'],
    ['Kiyovu Art Space', 'art-gallery', 'kiyovu', 'Emmanuel Nkurunziza-Habimana', 'KN 5 Road'],
    ['Kimihurura Live Lounge', 'live-music', 'kimihurura', 'Cedric Manzi', 'KG 9 Avenue'],
    [
      'Nyabugogo Brochette Corner',
      'grill-house',
      'nyabugogo',
      'Jeanne Mukamurenzi',
      'Nyabugogo Market',
    ],
    ['Kimironko Market Stall', 'market-stall', 'remera', 'Solange Uwimana', 'Kimironko Market'],
    // Wave 6: two nightclubs, a lounge, showrooms, a pitch, a spa, karaoke; the last four open later.
    ['Kimihurura Pulse Club', 'nightclub', 'kimihurura', 'Yves Mugabo', 'KG 9 Avenue'],
    ['Kiyovu Hills Lounge', 'lounge', 'kiyovu', 'Claudine Uwimana', 'KN 5 Road'],
    [
      'KN 4 Home Appliances',
      'appliance-store',
      'nyarugenge',
      'Emmanuel Nsengiyumva',
      'KN 4 Avenue',
    ],
    ['Remera Five-a-Side', 'football-pitch', 'remera', 'Jean-Paul Niyonsaba', 'KG 17 Avenue'],
    ['Kacyiru Hills Spa', 'spa', 'kacyiru', 'Diane Mukeshimana', 'KG 5 Avenue'],
    ['KN 2 Karaoke Bar', 'karaoke', 'nyarugenge', 'Olivier Ndayisaba', 'KN 2 Avenue'],
    ['Remera Bowling & Games', 'arcade', 'remera', 'Fabrice Iradukunda', 'KG 11 Avenue'],
    ['Kiyovu Terrace Bar', 'bar', 'kiyovu', 'Aline Uwase', 'KN 3 Road'],
    ['Kimironko Brochette House', 'restaurant', 'remera', 'Grace Mukamana', 'Kimironko Market'],
    ['KG 7 Coffee Bar', 'cafe', 'kacyiru', 'Sandrine Ingabire', 'KG 7 Avenue'],
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
    ['Rivonia Night Club', 'nightclub', 'sandton', 'Thabo Mokoena', 'Rivonia Road'],
    ['Rosebank Rooftop Lounge', 'lounge-bar', 'rosebank', 'Ayanda Khumalo', 'Jan Smuts Avenue'],
    ['Jozi Bean Coffee Co.', 'coffee-chain', 'braamfontein', 'Kyle Naidoo', 'Juta Street'],
    ['Rosebank Picture Palace', 'cinema', 'rosebank', 'Miriam Cohen', 'Cradock Avenue'],
    ['Sandton Auto Village', 'car-dealer', 'sandton', 'Pieter Joubert', 'Rivonia Road'],
    ['Marshalltown Home Store', 'furniture-store', 'marshalltown', 'Zodwa Ngcobo', 'Main Street'],
    ['Braam Workspace', 'co-working', 'braamfontein', 'Neo Molefe', 'De Korte Street'],
    ['Sandton Spin & Box', 'studio-gym', 'sandton', 'Chantal Smit', 'Maude Street'],
    ['Fox Street Gallery', 'art-gallery', 'maboneng', 'Lebo Maseko', 'Fox Street'],
    ['Soweto Jazz Shebeen', 'live-music', 'soweto', 'Mandla Shabalala', 'Vilakazi Street'],
    ['Vilakazi Street Kitchen', 'restaurant', 'soweto', 'Dineo Mahlangu', 'Vilakazi Street'],
    ['Mai Mai Market Stall', 'market-stall', 'marshalltown', 'Busisiwe Zulu', 'Mai Mai Market'],
    // Wave 6: two nightclubs, a lounge, showrooms, a pitch, a spa, karaoke; the last four open later.
    ['Braam Basement Club', 'nightclub', 'braamfontein', 'Lwazi Mthembu', 'De Korte Street'],
    ['Cradock Avenue Lounge', 'lounge', 'rosebank', 'Refilwe Molefe', 'Cradock Avenue'],
    ['Maude Street Appliance Centre', 'appliance-store', 'sandton', 'Johan Botha', 'Maude Street'],
    ['Soweto Kasi Five-a-Side', 'football-pitch', 'soweto', 'Tebogo Nkosi', 'Vilakazi Street'],
    ['Jan Smuts Day Spa', 'spa', 'rosebank', 'Annelie Venter', 'Jan Smuts Avenue'],
    ['Fox Street Karaoke Bar', 'karaoke', 'maboneng', 'Sizwe Dlamini', 'Fox Street'],
    ['Rivonia Road Bowl', 'arcade', 'sandton', 'Ruan Pretorius', 'Rivonia Road'],
    ['Juta Street Taproom', 'bar', 'braamfontein', 'Nomsa Khumalo', 'Juta Street'],
    ['Main Street Braai House', 'restaurant', 'marshalltown', 'Thabo Mokoena', 'Main Street'],
    ['Mai Mai Coffee Corner', 'cafe', 'marshalltown', 'Zodwa Ndlovu', 'Mai Mai Market'],
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
    ['Zamalek After Dark', 'nightclub', 'zamalek', 'Sherif El-Gendy', '26th of July Street'],
    ['Nile Terrace Lounge', 'lounge-bar', 'garden-city', 'Rana Abdallah', 'Corniche El Nil'],
    ['Bean & Nile Coffee Co.', 'coffee-chain', 'downtown', 'Youssef Hamdy', 'Talaat Harb Street'],
    ['Downtown Cinema Palace', 'cinema', 'downtown', 'Nabil Fawzy', 'Emad El-Din Street'],
    ['Nasr City Motors', 'car-dealer', 'heliopolis', 'Adel Shoukry', 'Abbas El-Akkad Street'],
    ['Maadi Home Furniture', 'furniture-store', 'maadi', 'Heba Lotfy', 'Road 9'],
    ['Tahrir Campus Co-Working', 'co-working', 'downtown', 'Ahmed Saleh', 'Tahrir Square'],
    ['New Cairo Spin Studio', 'studio-gym', 'new-cairo', 'Nadine Osman', '90th Street'],
    ['Zamalek Art Lounge', 'art-gallery', 'zamalek', 'Hoda Sabry', 'Mohamed Mazhar Street'],
    ['El Hussein Oud House', 'live-music', 'khan-el-khalili', 'Hamza Rifaat', 'Al-Muizz Street'],
    ['Korba Grill House', 'grill-house', 'heliopolis', 'Mohsen Barakat', 'Baghdad Street'],
    ['Ataba Market Stall', 'market-stall', 'downtown', 'Om Sayed', 'Ataba Square'],
    // Wave 6: two nightclubs, a lounge, showrooms, a pitch, a spa, karaoke; the last four open later.
    ['Zamalek Riverboat Club', 'nightclub', 'zamalek', 'Sherif Nabil', 'Mohamed Mazhar Street'],
    ['Maadi Garden Lounge', 'lounge', 'maadi', 'Rana Fathy', 'Road 9'],
    [
      'Abbas El-Akkad Appliances',
      'appliance-store',
      'heliopolis',
      'Hany Gamal',
      'Abbas El-Akkad Street',
    ],
    ['90th Street Football Pitch', 'football-pitch', 'new-cairo', 'Mahmoud Saleh', '90th Street'],
    ['Corniche Hammam & Spa', 'spa', 'garden-city', 'Dalia Fouad', 'Corniche El Nil'],
    ['Emad El-Din Karaoke', 'karaoke', 'downtown', 'Tamer Adel', 'Emad El-Din Street'],
    ['Baghdad Street Bowling', 'arcade', 'heliopolis', 'Youssef Kamal', 'Baghdad Street'],
    ['Talaat Harb Rooftop Bar', 'bar', 'downtown', 'Mona Rashed', 'Talaat Harb Street'],
    ['Al-Muizz Fatta House', 'restaurant', 'khan-el-khalili', 'Mahmoud Saad', 'Al-Muizz Street'],
    ['26th of July Coffee House', 'cafe', 'zamalek', 'Nadia Ezzat', '26th of July Street'],
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
    ['Marina After Hours', 'nightclub', 'marina', 'Luca Ferrari', 'Dubai Marina Walk'],
    [
      'Sheikh Zayed Sky Lounge',
      'lounge-bar',
      'business-bay',
      'Dana Al Zarooni',
      'Sheikh Zayed Road',
    ],
    ['Desert Bean Coffee Co.', 'coffee-chain', 'jumeirah', 'Rami Haddad', 'Al Wasl Road'],
    ['Deira Grand Cinemas', 'cinema', 'deira', 'Arjun Mehta', 'Al Rigga Road'],
    ['Al Quoz Auto Gallery', 'car-dealer', 'al-quoz', 'Sultan Al Shamsi', 'Sheikh Zayed Road'],
    ['Al Quoz Home Studio', 'furniture-store', 'al-quoz', 'Fatima Al Hammadi', 'Alserkal Avenue'],
    ['DIFC Hive Co-Working', 'co-working', 'difc', 'Tom Becker', 'Gate Avenue'],
    ['Jumeirah Barre Studio', 'studio-gym', 'jumeirah', 'Chloe Dubois', 'Jumeirah Beach Road'],
    ['Alserkal Light Gallery', 'art-gallery', 'al-quoz', 'Noor Al Qasimi', 'Alserkal Avenue'],
    ['Creek Jazz Garden', 'live-music', 'creek', 'Samir Aziz', 'Dubai Creek'],
    ['Al Fahidi Machboos House', 'restaurant', 'creek', 'Umm Khalid', 'Al Fahidi Street'],
    ['Naif Souk Stall', 'souk-stall', 'deira', 'Zubair Ahmed', 'Naif Souk'],
    // Wave 6: two nightclubs, a lounge, showrooms, a pitch, a spa, karaoke; the last four open later.
    ['Marina Walk Neon Club', 'nightclub', 'marina', 'Karim Saade', 'Dubai Marina Walk'],
    ['Gate Avenue Majlis Lounge', 'lounge', 'difc', 'Mariam Al Hashimi', 'Gate Avenue'],
    [
      'Al Rigga Electronics & Appliances',
      'appliance-store',
      'deira',
      'Suresh Nair',
      'Al Rigga Road',
    ],
    ['Al Quoz Floodlit Pitches', 'football-pitch', 'al-quoz', 'Tariq Mahmood', 'Sheikh Zayed Road'],
    ['Al Wasl Oasis Spa', 'spa', 'jumeirah', 'Leila Rahimi', 'Al Wasl Road'],
    ['Al Fahidi Karaoke Rooms', 'karaoke', 'creek', 'Joseph Fernandes', 'Al Fahidi Street'],
    ['Business Bay Bowl', 'arcade', 'business-bay', 'Omar Siddiqui', 'Sheikh Zayed Road'],
    [
      'Jumeirah Sands Beach Club',
      'beach-club',
      'jumeirah',
      'Natalia Petrova',
      'Jumeirah Beach Road',
    ],
    ['Creekside Biryani House', 'restaurant', 'creek', 'Abdul Kareem', 'Dubai Creek'],
    ['Alserkal Coffee Lab', 'cafe', 'al-quoz', 'Hessa Al Mansoori', 'Alserkal Avenue'],
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
    ['SoMa Warehouse Club', 'nightclub', 'soma', 'DJ Andre Brooks', 'Folsom Street'],
    ['North Beach Rooftop', 'lounge-bar', 'north-beach', 'Sofia Marchetti', 'Columbus Avenue'],
    ['Bay Bean Coffee Co.', 'coffee-chain', 'fidi', 'Ethan Park', 'Market Street'],
    ['Castro Picture Palace', 'cinema', 'castro', 'Harold Fein', 'Castro Street'],
    ['Van Ness Motor Row', 'car-dealer', 'presidio', 'Bill Kowalski', 'Van Ness Avenue'],
    ['Dogpatch Home Goods', 'furniture-store', 'dogpatch', 'Megan Liu', '3rd Street'],
    ['The Foundry SoMa', 'co-working', 'soma', 'Raj Iyer', '2nd Street'],
    ['Mission Cycle Studio', 'studio-gym', 'mission', 'Tasha Green', 'Valencia Street'],
    ['Chinatown Ink Gallery', 'art-gallery', 'chinatown', 'Li Wei', 'Grant Avenue'],
    ['Fillmore Street Social', 'live-music', 'presidio', 'Marcus Reed', 'Fillmore Street'],
    ['Mission Pupusería', 'taqueria', 'mission', 'Ana Ramos', 'Mission Street'],
    ['Ferry Building Farm Stall', 'market-stall', 'wharf', 'Peter Okada', 'The Embarcadero'],
    // Wave 6: two nightclubs, a lounge, showrooms, a pitch, a spa, karaoke; the last four open later.
    ['Folsom Street Warehouse Club', 'nightclub', 'soma', 'Derek Huang', 'Folsom Street'],
    ['Columbus Avenue Velvet Lounge', 'lounge', 'north-beach', 'Gina Russo', 'Columbus Avenue'],
    ['Market Street Home Electronics', 'appliance-store', 'fidi', 'Raj Mehta', 'Market Street'],
    ['Dogpatch Futsal Courts', 'football-pitch', 'dogpatch', 'Carlos Mendoza', '3rd Street'],
    ['Fillmore Street Day Spa', 'spa', 'presidio', 'Akiko Sato', 'Fillmore Street'],
    ['Grant Avenue Karaoke', 'karaoke', 'chinatown', 'Kevin Lau', 'Grant Avenue'],
    ['Valencia Street Arcade', 'arcade', 'mission', 'Tony Alvarez', 'Valencia Street'],
    ['Castro Street Tavern', 'bar', 'castro', 'Michael Brennan', 'Castro Street'],
    ['2nd Street Ramen House', 'restaurant', 'soma', 'Yuki Tanaka', '2nd Street'],
    ['Embarcadero Coffee Co.', 'cafe', 'wharf', 'Lisa Chang', 'The Embarcadero'],
  ]),
};

/** Seeds from the end of each roster held back to open over time. */
export const LATE_OPENINGS = 4;

/** District ids per city (shared with the web's city plans). */
export const CITY_DISTRICTS: Record<MarketId, readonly string[]> = {
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
