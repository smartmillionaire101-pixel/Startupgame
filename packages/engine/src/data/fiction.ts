/**
 * Fictional AI population (§2: "All AI businesses use fictional names").
 * These names are invented for the game. They also seed the name checker's
 * "taken" list so players cannot impersonate AI entities.
 */
import type { Industry } from './industries.js';
import type { MarketId } from './markets.js';

export interface AiFundSeed {
  name: string;
  partner: string;
  sectors: Industry[] | 'any';
  stages: ('pre-seed' | 'seed' | 'series-a' | 'series-b')[];
  /** Typical cheque in USD (major units). */
  check: [number, number];
  /** Minimum founder/company stars to take a first meeting. */
  minStars: number;
}

export const AI_FUNDS: Record<MarketId, AiFundSeed[]> = {
  lagos: [
    {
      name: 'Kolanut Ventures',
      partner: 'Tobi Adeyemi',
      sectors: ['fintech', 'saas'],
      stages: ['pre-seed', 'seed'],
      check: [50_000, 400_000],
      minStars: 0.5,
    },
    {
      name: 'Harmatta Capital',
      partner: 'Ngozi Eze',
      sectors: 'any',
      stages: ['seed', 'series-a'],
      check: [300_000, 2_500_000],
      minStars: 2,
    },
    {
      name: 'Danfo Angels Network',
      partner: 'Kunle Bakare',
      sectors: 'any',
      stages: ['pre-seed'],
      check: [20_000, 150_000],
      minStars: 0,
    },
    {
      name: 'Third Bridge Partners',
      partner: 'Halima Yusuf',
      sectors: ['logistics', 'ecommerce', 'agritech'],
      stages: ['seed', 'series-a'],
      check: [500_000, 3_000_000],
      minStars: 2,
    },
    {
      name: 'Adire Growth Fund',
      partner: 'Chidi Okafor',
      sectors: 'any',
      stages: ['series-a', 'series-b'],
      check: [3_000_000, 15_000_000],
      minStars: 3,
    },
    {
      name: 'Ebony Leaf Health Fund',
      partner: 'Funmi Alade',
      sectors: ['healthtech', 'edtech'],
      stages: ['pre-seed', 'seed'],
      check: [100_000, 800_000],
      minStars: 1,
    },
  ],
  nairobi: [
    {
      name: 'Savanna Thread Capital',
      partner: 'Wanjiru Kamau',
      sectors: ['fintech', 'agritech'],
      stages: ['pre-seed', 'seed'],
      check: [50_000, 500_000],
      minStars: 0.5,
    },
    {
      name: 'Rift Signal Ventures',
      partner: 'Otieno Ouma',
      sectors: 'any',
      stages: ['seed', 'series-a'],
      check: [300_000, 2_000_000],
      minStars: 2,
    },
    {
      name: 'Matatu Angels',
      partner: 'Achieng Odhiambo',
      sectors: 'any',
      stages: ['pre-seed'],
      check: [15_000, 120_000],
      minStars: 0,
    },
    {
      name: 'Kilele Partners',
      partner: 'Mwangi Njoroge',
      sectors: ['logistics', 'saas', 'ecommerce'],
      stages: ['seed', 'series-a'],
      check: [400_000, 2_500_000],
      minStars: 2,
    },
    {
      name: 'Baobab Crest Growth',
      partner: 'Amina Hassan',
      sectors: 'any',
      stages: ['series-a', 'series-b'],
      check: [3_000_000, 12_000_000],
      minStars: 3,
    },
    {
      name: 'Jacaranda Impact Fund',
      partner: 'Kiprop Rotich',
      sectors: ['healthtech', 'edtech', 'agritech'],
      stages: ['pre-seed', 'seed'],
      check: [80_000, 600_000],
      minStars: 1,
    },
  ],
  london: [
    {
      name: 'Fogbank Ventures',
      partner: 'Harriet Cole',
      sectors: ['fintech', 'saas'],
      stages: ['pre-seed', 'seed'],
      check: [150_000, 1_500_000],
      minStars: 0.5,
    },
    {
      name: 'Wharfside Capital',
      partner: 'Rupert Ashdown',
      sectors: 'any',
      stages: ['seed', 'series-a'],
      check: [1_000_000, 8_000_000],
      minStars: 2,
    },
    {
      name: 'Tidewater Angels',
      partner: 'Priya Nair',
      sectors: 'any',
      stages: ['pre-seed'],
      check: [25_000, 250_000],
      minStars: 0,
    },
    {
      name: 'Bellwire Partners',
      partner: 'Owen Price',
      sectors: ['logistics', 'ecommerce', 'saas'],
      stages: ['seed', 'series-a'],
      check: [1_000_000, 6_000_000],
      minStars: 2,
    },
    {
      name: 'Greyfriar Growth',
      partner: 'Sophie Laurent',
      sectors: 'any',
      stages: ['series-a', 'series-b'],
      check: [8_000_000, 40_000_000],
      minStars: 3,
    },
    {
      name: 'Lanternfish Health',
      partner: 'Daniel Osei',
      sectors: ['healthtech', 'edtech'],
      stages: ['pre-seed', 'seed'],
      check: [200_000, 2_000_000],
      minStars: 1,
    },
  ],
};

export type OutletType = 'national' | 'tech' | 'tabloid' | 'trade' | 'regional' | 'global';

export interface OutletSeed {
  id: string;
  name: string;
  type: OutletType;
  reporter: string;
}

/** Star effect multipliers per outlet type (§10 table). Open question: tune in beta. */
export const OUTLET_EFFECT: Record<OutletType, number> = {
  national: 0.35,
  global: 0.3,
  tech: 0.2,
  trade: 0.2,
  regional: 0.12,
  tabloid: 0.08,
};

export const OUTLETS: Record<MarketId, OutletSeed[]> = {
  lagos: [
    { id: 'lagos-ledger', name: 'The Lagos Ledger', type: 'national', reporter: 'Ama Okonkwo' },
    { id: 'techkobo', name: 'TechKobo', type: 'tech', reporter: 'Seyi Ogundipe' },
    { id: 'gist-daily', name: 'Gist Daily', type: 'tabloid', reporter: 'Bisi Lawal' },
    { id: 'sector-signal-ng', name: 'Sector Signal', type: 'trade', reporter: 'Emeka Nwosu' },
    {
      id: 'island-mainland',
      name: 'Island & Mainland Post',
      type: 'regional',
      reporter: 'Yemi Coker',
    },
    { id: 'global-ticker', name: 'The Global Ticker', type: 'global', reporter: 'Marta Lind' },
  ],
  nairobi: [
    {
      id: 'nairobi-courier',
      name: 'The Nairobi Courier',
      type: 'national',
      reporter: 'Njeri Wambui',
    },
    { id: 'silicon-savannah', name: 'Savannah Bytes', type: 'tech', reporter: 'Brian Kiptoo' },
    { id: 'mtaani-buzz', name: 'Mtaani Buzz', type: 'tabloid', reporter: 'Shiro Gitau' },
    {
      id: 'sector-signal-ke',
      name: 'Sector Signal East',
      type: 'trade',
      reporter: 'Faith Muthoni',
    },
    {
      id: 'westlands-weekly',
      name: 'Westlands Weekly',
      type: 'regional',
      reporter: 'Kevin Omondi',
    },
    { id: 'global-ticker', name: 'The Global Ticker', type: 'global', reporter: 'Marta Lind' },
  ],
  london: [
    { id: 'thames-record', name: 'The Thames Record', type: 'national', reporter: 'Eleanor Hart' },
    { id: 'shoreditch-wire', name: 'Shoreditch Wire', type: 'tech', reporter: 'Callum Reid' },
    { id: 'the-chatter', name: 'The Chatter', type: 'tabloid', reporter: 'Jess Morgan' },
    { id: 'sector-signal-uk', name: 'Sector Signal UK', type: 'trade', reporter: 'Imran Shah' },
    { id: 'borough-bulletin', name: 'Borough Bulletin', type: 'regional', reporter: 'Grace Okoro' },
    { id: 'global-ticker', name: 'The Global Ticker', type: 'global', reporter: 'Marta Lind' },
  ],
};

export const AI_BANKS: Record<MarketId, string> = {
  lagos: 'Eko Union Bank',
  nairobi: 'Mlima Commercial Bank',
  london: 'Albion & Weir Bank',
};

export const AI_INCUMBENTS: Record<MarketId, Partial<Record<Industry, string>>> = {
  lagos: {
    fintech: 'Ọ̀pẹ́ Bank Payments',
    ecommerce: 'Jumbomart',
    logistics: 'Okada Freight',
    healthtech: 'Marina Health Group',
    edtech: 'Bright Desk Learning',
    saas: 'Ledgerline Systems',
    agritech: 'Greenbelt Agro',
  },
  nairobi: {
    fintech: 'Tembo Pesa',
    ecommerce: 'Sokoni Mart',
    logistics: 'Haraka Haulage',
    healthtech: 'Afya Bora Group',
    edtech: 'Elimu Plus',
    saas: 'Kazi Systems',
    agritech: 'Shamba Holdings',
  },
  london: {
    fintech: 'Kingsgate Payments',
    ecommerce: 'Parcelbury',
    logistics: 'Northbound Freight',
    healthtech: 'Meridian Care',
    edtech: 'Quillstone Learning',
    saas: 'Ironbridge Software',
    agritech: 'Hedgerow Foods',
  },
};

/** Name parts for AI founders' startups. Combined deterministically by seed. */
export const AI_STARTUP_PREFIXES = [
  'Kopa',
  'Zuri',
  'Lumo',
  'Tanda',
  'Nuru',
  'Bayo',
  'Ola',
  'Kiva',
  'Mara',
  'Sela',
  'Vela',
  'Ruto',
  'Ayo',
  'Duma',
  'Pira',
  'Ndio',
  'Wema',
  'Koda',
];
export const AI_STARTUP_SUFFIXES = [
  'ly',
  'Pay',
  'Hub',
  'Go',
  'Stack',
  'Labs',
  'Box',
  'Link',
  'Path',
  'Grid',
  'Loop',
  'Wise',
];

export const AI_FIRST_NAMES: Record<MarketId, string[]> = {
  lagos: [
    'Adaeze',
    'Tunde',
    'Ifeoma',
    'Bolaji',
    'Zainab',
    'Femi',
    'Chioma',
    'Dayo',
    'Kemi',
    'Obinna',
  ],
  nairobi: [
    'Wairimu',
    'Kamau',
    'Akinyi',
    'Mutua',
    'Nyambura',
    'Barasa',
    'Chebet',
    'Kibet',
    'Atieno',
    'Maina',
  ],
  london: ['Olivia', 'James', 'Aisha', 'Tom', 'Mei', 'Rhys', 'Hannah', 'Kofi', 'Sara', 'Luca'],
};
export const AI_LAST_NAMES: Record<MarketId, string[]> = {
  lagos: ['Adebayo', 'Okeke', 'Balogun', 'Ibrahim', 'Nnamdi', 'Ogun', 'Danjuma', 'Afolabi'],
  nairobi: ['Kariuki', 'Wekesa', 'Otieno', 'Chege', 'Mwangi', 'Langat', 'Nduta', 'Kimani'],
  london: ['Hughes', 'Patel', 'Clarke', 'Bennett', 'Ahmed', 'Walsh', 'Turner', 'Okafor'],
};
