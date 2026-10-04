/**
 * Fictional AI population for Phase 2 markets. Every market gets the same six
 * fund archetypes as the launch markets, with cheque sizes scaled to local
 * capital depth, so newcomers face a familiar shape of investor (§2).
 */
import type { AiFundSeed, OutletSeed } from './fiction.js';
import type { Industry } from './industries.js';

/** Phase 2 markets, plus Wave 3's San Francisco (same shape). */
type P2 = 'accra' | 'freetown' | 'kigali' | 'johannesburg' | 'cairo' | 'dubai' | 'san-francisco';

interface MarketFiction {
  /** Cheque scale relative to Lagos. */
  scale: number;
  funds: [name: string, partner: string][];
  outlets: [national: string, tech: string, tabloid: string, trade: string, regional: string];
  reporters: [string, string, string, string, string];
  bank: string;
  incumbents: Record<Industry, string>;
  first: string[];
  last: string[];
}

const ARCHETYPES: Omit<AiFundSeed, 'name' | 'partner'>[] = [
  {
    sectors: ['fintech', 'saas'],
    stages: ['pre-seed', 'seed'],
    check: [50_000, 400_000],
    minStars: 0.5,
  },
  { sectors: 'any', stages: ['seed', 'series-a'], check: [300_000, 2_500_000], minStars: 2 },
  { sectors: 'any', stages: ['pre-seed'], check: [20_000, 150_000], minStars: 0 },
  {
    sectors: ['logistics', 'ecommerce', 'agritech'],
    stages: ['seed', 'series-a'],
    check: [500_000, 3_000_000],
    minStars: 2,
  },
  { sectors: 'any', stages: ['series-a', 'series-b'], check: [3_000_000, 15_000_000], minStars: 3 },
  {
    sectors: ['healthtech', 'edtech'],
    stages: ['pre-seed', 'seed'],
    check: [100_000, 800_000],
    minStars: 1,
  },
];

const FICTION: Record<P2, MarketFiction> = {
  accra: {
    scale: 0.8,
    funds: [
      ['Kente Loom Ventures', 'Kwame Asante'],
      ['Volta Crest Capital', 'Efua Mensah'],
      ['Trotro Angels', 'Kojo Boateng'],
      ['Tema Gate Partners', 'Abena Owusu'],
      ['Golden Stool Growth', 'Yaw Darko'],
      ['Adinkra Health Fund', 'Akosua Frimpong'],
    ],
    outlets: [
      'The Accra Chronicle',
      'CediTech',
      'Chale Gist',
      'Sector Signal Ghana',
      'Osu & Labone Times',
    ],
    reporters: ['Ama Serwaa', 'Kofi Agyei', 'Esi Quaye', 'Nana Ofori', 'Kwesi Badu'],
    bank: 'Akwaaba Commercial Bank',
    incumbents: {
      fintech: 'Sika Payments',
      ecommerce: 'Makola Online',
      logistics: 'Tema Haulage',
      healthtech: 'Korle Care Group',
      edtech: 'Akoma Learning',
      saas: 'Osei Systems',
      agritech: 'Cocoa Belt Holdings',
    },
    first: ['Kwame', 'Ama', 'Kofi', 'Akosua', 'Yaw', 'Efua', 'Kojo', 'Abena', 'Nana', 'Esi'],
    last: ['Mensah', 'Asante', 'Owusu', 'Boateng', 'Agyei', 'Darko', 'Quaye', 'Frimpong'],
  },
  freetown: {
    scale: 0.4,
    funds: [
      ['Lion Mountain Ventures', 'Mohamed Kamara'],
      ['Cotton Tree Capital', 'Fatmata Sesay'],
      ['Poda-Poda Angels', 'Ibrahim Conteh'],
      ['Kissy Road Partners', 'Aminata Koroma'],
      ['Peninsula Growth', 'Abu Bangura'],
      ['Bintumani Impact Fund', 'Isatu Turay'],
    ],
    outlets: [
      'The Freetown Observer',
      'SaloneTech',
      'Gbo Gbo News',
      'Sector Signal Salone',
      'East End Echo',
    ],
    reporters: [
      'Mariama Jalloh',
      'Alhaji Kanu',
      'Hawa Mansaray',
      'Sorie Fofanah',
      'Kadiatu Barrie',
    ],
    bank: 'Salone Mutual Bank',
    incumbents: {
      fintech: 'Leone Pay',
      ecommerce: 'Big Market Online',
      logistics: 'Wharf Freight',
      healthtech: 'Connaught Care',
      edtech: 'Fourah Learning',
      saas: 'Krio Systems',
      agritech: 'Rice Belt Farms',
    },
    first: [
      'Mohamed',
      'Fatmata',
      'Ibrahim',
      'Aminata',
      'Abu',
      'Isatu',
      'Alhaji',
      'Mariama',
      'Sorie',
      'Hawa',
    ],
    last: ['Kamara', 'Sesay', 'Conteh', 'Koroma', 'Bangura', 'Turay', 'Jalloh', 'Kanu'],
  },
  kigali: {
    scale: 0.6,
    funds: [
      ['Thousand Hills Ventures', 'Jean Mugisha'],
      ['Imigongo Capital', 'Aline Uwase'],
      ['Moto Angels', 'Eric Habimana'],
      ['Nyabugogo Partners', 'Grace Mukamana'],
      ['Akagera Growth', 'Patrick Nkurunziza'],
      ['Agaciro Health Fund', 'Diane Ingabire'],
    ],
    outlets: [
      'The Kigali Herald',
      'Hills Tech',
      'Inkuru Za Kigali',
      'Sector Signal Rwanda',
      'Kimihurura Weekly',
    ],
    reporters: [
      'Claudine Umutoni',
      'Olivier Niyonzima',
      'Sandrine Uwimana',
      'Fabrice Hakizimana',
      'Josiane Mutesi',
    ],
    bank: 'Isange Bank',
    incumbents: {
      fintech: 'Imari Pay',
      ecommerce: 'Isoko Online',
      logistics: 'Gisenyi Freight',
      healthtech: 'Ubuzima Group',
      edtech: 'Ishuri Learning',
      saas: 'Umurava Systems',
      agritech: 'Kawa Highlands',
    },
    first: [
      'Jean',
      'Aline',
      'Eric',
      'Grace',
      'Patrick',
      'Diane',
      'Olivier',
      'Claudine',
      'Fabrice',
      'Sandrine',
    ],
    last: [
      'Mugisha',
      'Uwase',
      'Habimana',
      'Mukamana',
      'Nkurunziza',
      'Ingabire',
      'Niyonzima',
      'Umutoni',
    ],
  },
  johannesburg: {
    scale: 1.3,
    funds: [
      ['Highveld Ventures', 'Thabo Nkosi'],
      ['Reef Line Capital', 'Lerato Mokoena'],
      ['Taxi Rank Angels', 'Sipho Dlamini'],
      ['Gold Reef Partners', 'Naledi Khumalo'],
      ['Jacaranda Ridge Growth', 'Pieter van Wyk'],
      ['Ubuntu Health Fund', 'Zanele Mthembu'],
    ],
    outlets: [
      'The Jozi Ledger',
      'RandTech',
      'The Braai Talk',
      'Sector Signal SA',
      'Braamfontein Bulletin',
    ],
    reporters: [
      'Busisiwe Ndlovu',
      'Kagiso Molefe',
      'Annelie Botha',
      'Mandla Zulu',
      'Refilwe Sithole',
    ],
    bank: 'Highveld Union Bank',
    incumbents: {
      fintech: 'Rand Pay Group',
      ecommerce: 'Kopano Retail Online',
      logistics: 'Witwatersrand Freight',
      healthtech: 'Medivale Group',
      edtech: 'Thuto Learning',
      saas: 'Mzansi Systems',
      agritech: 'Karoo Holdings',
    },
    first: [
      'Thabo',
      'Lerato',
      'Sipho',
      'Naledi',
      'Pieter',
      'Zanele',
      'Kagiso',
      'Busisiwe',
      'Mandla',
      'Annelie',
    ],
    last: ['Nkosi', 'Mokoena', 'Dlamini', 'Khumalo', 'van Wyk', 'Mthembu', 'Ndlovu', 'Molefe'],
  },
  cairo: {
    scale: 1,
    funds: [
      ['Nile Delta Ventures', 'Ahmed Hassan'],
      ['Zamalek Capital', 'Mariam Fawzy'],
      ['Tuk-Tuk Angels', 'Omar Khalil'],
      ['Suez Gate Partners', 'Nour El-Sayed'],
      ['Pyramid Plateau Growth', 'Karim Mansour'],
      ['Papyrus Health Fund', 'Salma Abdelrahman'],
    ],
    outlets: [
      'The Cairo Gazette',
      'NileTech',
      'Ahwa Talk',
      'Sector Signal Egypt',
      'Maadi Messenger',
    ],
    reporters: ['Yasmin Farouk', 'Tarek Saad', 'Dina Ragab', 'Mostafa Adel', 'Heba Shawky'],
    bank: 'Nilestone Bank',
    incumbents: {
      fintech: 'Masr Pay',
      ecommerce: 'Souq Al Medina Online',
      logistics: 'Delta Freight',
      healthtech: 'Kasr Care Group',
      edtech: 'Maktaba Learning',
      saas: 'Fustat Systems',
      agritech: 'Fayoum Farms',
    },
    first: [
      'Ahmed',
      'Mariam',
      'Omar',
      'Nour',
      'Karim',
      'Salma',
      'Tarek',
      'Yasmin',
      'Mostafa',
      'Dina',
    ],
    last: ['Hassan', 'Fawzy', 'Khalil', 'El-Sayed', 'Mansour', 'Abdelrahman', 'Farouk', 'Saad'],
  },
  dubai: {
    scale: 2,
    funds: [
      ['Creek Side Ventures', 'Rashid Al Falasi'],
      ['Dhow Harbour Capital', 'Layla Haddad'],
      ['Abra Angels', 'Arjun Menon'],
      ['Jebel Gate Partners', 'Fatima Al Suwaidi'],
      ['Dune Crest Growth', 'James Whitfield'],
      ['Oasis Health Fund', 'Rania Khoury'],
    ],
    outlets: [
      'The Gulf Ledger',
      'DesertTech',
      'Marina Gossip',
      'Sector Signal Gulf',
      'Deira Daily',
    ],
    reporters: ['Noura Al Mansoori', 'Vikram Rao', 'Hala Nasser', 'Omar Al Habtoor', 'Priya Iyer'],
    bank: 'Creekstone Bank',
    incumbents: {
      fintech: 'Dirham Pay',
      ecommerce: 'Sahara Mart Online',
      logistics: 'Gulfgate Freight',
      healthtech: 'Palmview Care',
      edtech: 'Falcon Learning',
      saas: 'Seaview Systems',
      agritech: 'Liwa Growers',
    },
    first: [
      'Rashid',
      'Layla',
      'Arjun',
      'Fatima',
      'James',
      'Rania',
      'Vikram',
      'Noura',
      'Hala',
      'Priya',
    ],
    last: ['Al Falasi', 'Haddad', 'Menon', 'Al Suwaidi', 'Whitfield', 'Khoury', 'Rao', 'Nasser'],
  },
  // Wave 3. Funds follow the six archetypes in order: seed (fintech/SaaS),
  // generalist seed/A, angels, sector (logistics/commerce/agri), growth, and
  // a health/education studio run like an accelerator.
  'san-francisco': {
    scale: 4,
    funds: [
      ['Cable Car Ventures', 'Maya Lindqvist'],
      ['Twin Peaks Capital', 'Daniel Reyes'],
      ['Dolores Park Angels', 'Priya Raman'],
      ['Embarcadero Partners', 'Kevin Tran'],
      ['Presidio Growth', 'Elena Vasquez'],
      ['Mission Bay Health Studio', 'Marcus Bell'],
    ],
    outlets: [
      'The Bay Dispatch',
      'SoMa Signal',
      'Fog City Gossip',
      'Sector Signal West',
      'Mission & Market Weekly',
    ],
    reporters: ['Grace Nakamura', 'Luis Ortega', 'Tasha Greene', 'Ravi Iyer', 'Sofia Chen'],
    bank: 'Golden Bay Bank',
    incumbents: {
      fintech: 'Bayline Payments',
      ecommerce: 'Pacific Cart',
      logistics: 'Golden Freightways',
      healthtech: 'Sutro Health Network',
      edtech: 'Lighthouse Learning',
      saas: 'Ironwood Cloud',
      agritech: 'Central Valley Harvest',
    },
    first: [
      'Maya',
      'Daniel',
      'Priya',
      'Kevin',
      'Elena',
      'Marcus',
      'Wei',
      'Sofia',
      'Jamal',
      'Hannah',
      'Arjun',
      'Mei',
      'Diego',
      'Olivia',
    ],
    last: [
      'Chen',
      'Nguyen',
      'Garcia',
      'Patel',
      'Kim',
      'Johnson',
      'Lopez',
      'Wong',
      'Rivera',
      'Shah',
      'Murphy',
      'Tanaka',
    ],
  },
};

const TYPES = ['national', 'tech', 'tabloid', 'trade', 'regional'] as const;
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const entries = Object.entries(FICTION) as [P2, MarketFiction][];

export const P2_FUNDS = Object.fromEntries(
  entries.map(([m, f]) => [
    m,
    f.funds.map(([name, partner], i) => {
      const a = ARCHETYPES[i]!;
      return {
        ...a,
        name,
        partner,
        check: [Math.round(a.check[0] * f.scale), Math.round(a.check[1] * f.scale)] as [
          number,
          number,
        ],
      };
    }),
  ]),
) as Record<P2, AiFundSeed[]>;

export const P2_OUTLETS = Object.fromEntries(
  entries.map(([m, f]) => [
    m,
    [
      ...f.outlets.map((name, i): OutletSeed => ({
        id: slug(name),
        name,
        type: TYPES[i]!,
        reporter: f.reporters[i]!,
      })),
      {
        id: 'global-ticker',
        name: 'The Global Ticker',
        type: 'global',
        reporter: 'Marta Lind',
      } satisfies OutletSeed,
    ],
  ]),
) as Record<P2, OutletSeed[]>;

export const P2_BANKS = Object.fromEntries(entries.map(([m, f]) => [m, f.bank])) as Record<
  P2,
  string
>;
export const P2_INCUMBENTS = Object.fromEntries(
  entries.map(([m, f]) => [m, f.incumbents]),
) as Record<P2, Record<Industry, string>>;
export const P2_FIRST_NAMES = Object.fromEntries(entries.map(([m, f]) => [m, f.first])) as Record<
  P2,
  string[]
>;
export const P2_LAST_NAMES = Object.fromEntries(entries.map(([m, f]) => [m, f.last])) as Record<
  P2,
  string[]
>;
