/**
 * Capital programmes beyond funds and lenders (Wave 5, section B):
 * accelerators, development partners (DFIs, donors, foundations, state
 * programmes) and limited partners (the money behind funds).
 *
 * Every name is fictional but meant to feel of its city. Amounts are in USD
 * and converted at today's rate. How many of each a market gets follows its
 * capital depth (data/capital.ts): deep VC markets get more accelerators and
 * LPs; development partners are generous in Freetown, Kigali, Lagos, Nairobi
 * and Accra and scarce in London, San Francisco and Dubai.
 */
import type { Industry } from './industries.js';
import type { MarketId } from './markets.js';

/** Investor types, on funds and on investor players. */
export const INVESTOR_TYPES = ['angel', 'vc', 'impact', 'corporate'] as const;
export type InvestorType = (typeof INVESTOR_TYPES)[number];

export interface ProgramLook {
  color: string;
  accent: string;
}

// ---------------------------------------------------------------- Accelerators

export interface AcceleratorSeed {
  /** Stable id: `<market>-<slug>`. */
  id: string;
  name: string;
  tagline: string;
  /** 1 = top tier (most selective) … 3 = open door. */
  tier: 1 | 2 | 3;
  sectors: Industry[] | 'any';
  /** Cash for equity, on a SAFE. */
  checkUsd: number;
  equityBps: number;
  /** Companies per cohort. */
  seats: number;
  mentors: string[];
  look: ProgramLook;
}

/** A cohort starts every this many game months; demo day closes it. */
export const COHORT_MONTHS = 3;

const acc = (
  id: string,
  name: string,
  tagline: string,
  tier: 1 | 2 | 3,
  sectors: Industry[] | 'any',
  checkUsd: number,
  equityBps: number,
  seats: number,
  mentors: string[],
  color: string,
  accent: string,
): AcceleratorSeed => ({
  id,
  name,
  tagline,
  tier,
  sectors,
  checkUsd,
  equityBps,
  seats,
  mentors,
  look: { color, accent },
});

/** Ordered by prominence: a market opens the first 1–3 by depth. */
export const ACCELERATORS: Record<MarketId, AcceleratorSeed[]> = {
  lagos: [
    acc(
      'lagos-yaba-launchpad',
      'Yaba Launchpad',
      'Twelve weeks on Herbert Macaulay Way, then a packed demo day.',
      2,
      'any',
      25_000,
      700,
      8,
      ['Tunde Bakare', 'Ngozi Eze', 'Femi Adeyemi'],
      '#0f766e',
      '#facc15',
    ),
    acc(
      'lagos-lekki-builders',
      'Lekki Builders Lab',
      'Fintech and commerce founders, mentored by operators who scaled.',
      3,
      ['fintech', 'ecommerce', 'logistics'],
      15_000,
      500,
      10,
      ['Kemi Adebayo', 'Chidi Okafor'],
      '#7c3aed',
      '#f472b6',
    ),
    acc(
      'lagos-ikeja-garage',
      'Ikeja Founders Garage',
      'Hardware, logistics and the people who move Lagos.',
      3,
      ['logistics', 'agritech'],
      10_000,
      400,
      10,
      ['Ifeoma Nwosu', 'Segun Alabi'],
      '#b45309',
      '#fde68a',
    ),
  ],
  nairobi: [
    acc(
      'nairobi-ngong-road',
      'Ngong Road Accelerator',
      'The cohort everyone in Kilimani talks about.',
      2,
      'any',
      25_000,
      700,
      8,
      ['Wanjiru Kamau', 'Otieno Odhiambo'],
      '#166534',
      '#fbbf24',
    ),
    acc(
      'nairobi-westlands-studio',
      'Westlands Venture Studio',
      'Fintech and agritech, with a mentor who has raised before.',
      3,
      ['fintech', 'agritech', 'healthtech'],
      15_000,
      500,
      10,
      ['Akinyi Achieng', 'Kariuki Mwangi'],
      '#0e7490',
      '#a5f3fc',
    ),
    acc(
      'nairobi-kilimani-lab',
      'Kilimani Founders Lab',
      'Open-door evenings and a small cheque.',
      3,
      'any',
      8_000,
      400,
      12,
      ['Njeri Wambui'],
      '#9a3412',
      '#fed7aa',
    ),
  ],
  london: [
    acc(
      'london-old-street',
      'Old Street Accelerator',
      'Top-tier: a hard door, a big cheque, a demo day investors fly in for.',
      1,
      'any',
      150_000,
      700,
      6,
      ['Eleanor Pryce', 'Rupert Vance', 'Amara Okoye'],
      '#111827',
      '#f97316',
    ),
    acc(
      'london-kings-cross',
      'Kings Cross Founders Programme',
      'Software and health, with an NHS-savvy mentor bench.',
      2,
      ['saas', 'healthtech', 'edtech'],
      60_000,
      600,
      8,
      ['Priya Raman', 'Tom Hadley'],
      '#1d4ed8',
      '#93c5fd',
    ),
    acc(
      'london-canary-fintech',
      'Canary Wharf Fintech Lab',
      'Regulated fintech, sandbox included.',
      2,
      ['fintech'],
      50_000,
      600,
      8,
      ['Marcus Bell', 'Sophie Lane'],
      '#0f172a',
      '#22d3ee',
    ),
  ],
  accra: [
    acc(
      'accra-osu-hub',
      'Osu Innovation Hub',
      'Ghana’s busiest cohort, demo day at the end of Oxford Street.',
      2,
      'any',
      20_000,
      700,
      8,
      ['Kwame Mensah', 'Efua Asante'],
      '#b91c1c',
      '#fde047',
    ),
    acc(
      'accra-airport-city-lab',
      'Airport City Venture Lab',
      'Fintech and logistics for West Africa.',
      3,
      ['fintech', 'logistics', 'ecommerce'],
      12_000,
      500,
      10,
      ['Kojo Boateng'],
      '#065f46',
      '#6ee7b7',
    ),
    acc(
      'accra-labone-studio',
      'Labone Founders Studio',
      'Evenings and weekends, small cheque.',
      3,
      'any',
      6_000,
      400,
      12,
      ['Akosua Owusu'],
      '#6d28d9',
      '#ddd6fe',
    ),
  ],
  freetown: [
    acc(
      'freetown-innovation-lab',
      'Freetown Innovation Lab',
      'Salone’s first demo-day cohort, on Wilkinson Road.',
      3,
      'any',
      8_000,
      600,
      8,
      ['Isata Kamara', 'Mohamed Sesay'],
      '#15803d',
      '#fde047',
    ),
    acc(
      'freetown-aberdeen-garage',
      'Aberdeen Startup Garage',
      'Agritech and fintech founders by the beach.',
      3,
      ['agritech', 'fintech'],
      5_000,
      500,
      10,
      ['Fatmata Conteh'],
      '#1e40af',
      '#93c5fd',
    ),
    acc(
      'freetown-congo-cross-studio',
      'Congo Cross Founders Studio',
      'A room, a mentor and a small cheque.',
      3,
      'any',
      4_000,
      400,
      12,
      ['Abu Bangura'],
      '#9d174d',
      '#fbcfe8',
    ),
  ],
  kigali: [
    acc(
      'kigali-innovation-hub',
      'Kigali Innovation Hub',
      'Government-backed cohort with a regional demo day.',
      2,
      'any',
      20_000,
      600,
      8,
      ['Aline Uwase', 'Eric Mugisha'],
      '#1d4ed8',
      '#fde68a',
    ),
    acc(
      'kigali-kacyiru-lab',
      'Kacyiru Venture Lab',
      'Health, education and agritech for the region.',
      3,
      ['healthtech', 'edtech', 'agritech'],
      10_000,
      500,
      10,
      ['Grace Mukamana'],
      '#047857',
      '#a7f3d0',
    ),
    acc(
      'kigali-nyamirambo-studio',
      'Nyamirambo Founders Studio',
      'Small cheque, big mentor energy.',
      3,
      'any',
      5_000,
      400,
      12,
      ['Jean Habimana'],
      '#a16207',
      '#fef08a',
    ),
  ],
  johannesburg: [
    acc(
      'joburg-braamfontein',
      'Braamfontein Launch Lab',
      'Joburg’s demo day, a block from Wits.',
      2,
      'any',
      40_000,
      700,
      8,
      ['Thabo Nkosi', 'Lerato Dlamini'],
      '#7c2d12',
      '#fdba74',
    ),
    acc(
      'joburg-sandton-fintech',
      'Sandton Fintech Studio',
      'Bank-adjacent fintech with a compliance mentor.',
      2,
      ['fintech', 'saas'],
      35_000,
      600,
      8,
      ['Pieter van Wyk', 'Naledi Mokoena'],
      '#0f172a',
      '#facc15',
    ),
    acc(
      'joburg-maboneng-makers',
      'Maboneng Makers',
      'Commerce and logistics, open door.',
      3,
      ['ecommerce', 'logistics'],
      12_000,
      500,
      10,
      ['Sipho Zulu'],
      '#be123c',
      '#fecdd3',
    ),
  ],
  cairo: [
    acc(
      'cairo-zamalek-launchpad',
      'Zamalek Launchpad',
      'Cairo’s best-known cohort, demo day on the Nile.',
      2,
      'any',
      30_000,
      700,
      8,
      ['Omar Farouk', 'Nour Hassan'],
      '#92400e',
      '#fcd34d',
    ),
    acc(
      'cairo-maadi-lab',
      'Maadi Founders Lab',
      'Fintech, health and education for Egypt.',
      3,
      ['fintech', 'healthtech', 'edtech'],
      15_000,
      500,
      10,
      ['Yasmin Adel'],
      '#155e75',
      '#a5f3fc',
    ),
    acc(
      'cairo-new-cairo-garage',
      'New Cairo Tech Garage',
      'Small cheque, open door.',
      3,
      'any',
      8_000,
      400,
      12,
      ['Karim Mostafa'],
      '#4c1d95',
      '#c4b5fd',
    ),
  ],
  dubai: [
    acc(
      'dubai-creek-accelerator',
      'Creek Accelerator',
      'A regional cohort with a Gulf investor demo day.',
      2,
      'any',
      60_000,
      700,
      8,
      ['Rashid Al Mansoori', 'Leila Haddad'],
      '#0c4a6e',
      '#fbbf24',
    ),
    acc(
      'dubai-marina-programme',
      'Marina Founders Programme',
      'Fintech and logistics for the corridor.',
      2,
      ['fintech', 'logistics', 'ecommerce'],
      40_000,
      600,
      8,
      ['Sameer Khan'],
      '#1e293b',
      '#5eead4',
    ),
    acc(
      'dubai-al-quoz-builders',
      'Al Quoz Builders',
      'Studios and warehouses: hands-on and open door.',
      3,
      'any',
      15_000,
      500,
      10,
      ['Hana Saleh'],
      '#9f1239',
      '#fda4af',
    ),
  ],
  'san-francisco': [
    acc(
      'sf-mission-street-combinator',
      'Mission Street Combinator',
      'Top-tier: half a million dollars, the most-watched demo day in tech.',
      1,
      'any',
      500_000,
      700,
      8,
      ['Dana Whitfield', 'Raj Iyer', 'Carmen Ruiz'],
      '#ea580c',
      '#fff7ed',
    ),
    acc(
      'sf-soma-seed-camp',
      'SoMa Seed Camp',
      'Software founders, a strong alumni network.',
      1,
      ['saas', 'fintech', 'healthtech'],
      150_000,
      600,
      8,
      ['Ben Carter', 'Mei Chen'],
      '#1d4ed8',
      '#bfdbfe',
    ),
    acc(
      'sf-embarcadero-launch',
      'Embarcadero Launch Program',
      'Open door for first-time founders.',
      2,
      'any',
      75_000,
      600,
      10,
      ['Alicia Gomez'],
      '#065f46',
      '#bbf7d0',
    ),
  ],
};

// ---------------------------------------------------------------- Development partners

export type GrantKind =
  | 'grant-window'
  | 'women-founders'
  | 'climate'
  | 'agritech'
  | 'youth-employment'
  | 'digital-innovation';

/** What a grantee must show at the report (for the second tranche). */
export type GrantCondition = 'active' | 'hire' | 'customers' | 'revenue';

export interface GrantProgramSeed {
  id: string;
  label: string;
  kind: GrantKind;
  pitch: string;
  amountUsd: [number, number];
  sectors: Industry[] | 'any';
  /** A woman on the founding team. */
  womenLed?: boolean;
  /** Months since founding, inclusive. */
  maxMonthsTrading?: number;
  minMonthsTrading?: number;
  needsRevenue?: boolean;
  condition: GrantCondition;
  /** Decisions every settlement ('rolling') or only at quarter ends. */
  window: 'rolling' | 'quarterly';
  /** 0 (most applicants who qualify get it) … 1 (very competitive). */
  selectivity: number;
}

export type DevPartnerKind = 'dfi' | 'donor' | 'foundation' | 'government';

export interface DevPartnerSeed {
  id: string;
  name: string;
  kind: DevPartnerKind;
  look: ProgramLook;
  programs: GrantProgramSeed[];
}

const prog = (
  id: string,
  label: string,
  kind: GrantKind,
  amountUsd: [number, number],
  extra: Partial<GrantProgramSeed> = {},
): GrantProgramSeed => {
  const base: Record<GrantKind, Omit<GrantProgramSeed, 'id' | 'label' | 'kind' | 'amountUsd'>> = {
    'grant-window': {
      pitch: 'Non-dilutive cash for early teams with a working product.',
      sectors: 'any',
      condition: 'active',
      window: 'quarterly',
      selectivity: 0.5,
    },
    'women-founders': {
      pitch: 'For companies with a woman on the founding team.',
      sectors: 'any',
      womenLed: true,
      condition: 'active',
      window: 'rolling',
      selectivity: 0.35,
    },
    climate: {
      pitch: 'Climate-smart farming and cleaner logistics.',
      sectors: ['agritech', 'logistics'],
      condition: 'customers',
      window: 'quarterly',
      selectivity: 0.4,
    },
    agritech: {
      pitch: 'Tools, finance and markets for smallholder farmers.',
      sectors: ['agritech'],
      condition: 'customers',
      window: 'rolling',
      selectivity: 0.3,
    },
    'youth-employment': {
      pitch: 'Hire young people: the grant pays toward the first jobs.',
      sectors: 'any',
      condition: 'hire',
      window: 'rolling',
      selectivity: 0.3,
    },
    'digital-innovation': {
      pitch: 'Software that reaches people banks, clinics and schools miss.',
      sectors: ['fintech', 'healthtech', 'edtech', 'saas'],
      condition: 'revenue',
      window: 'quarterly',
      selectivity: 0.55,
      minMonthsTrading: 2,
    },
  };
  return { id, label, kind, amountUsd, ...base[kind], ...extra };
};

const partner = (
  id: string,
  name: string,
  kind: DevPartnerKind,
  color: string,
  accent: string,
  programs: GrantProgramSeed[],
): DevPartnerSeed => ({ id, name, kind, look: { color, accent }, programs });

export const DEV_PARTNERS: Record<MarketId, DevPartnerSeed[]> = {
  freetown: [
    partner(
      'freetown-lion-mountain',
      'Lion Mountain Development Trust',
      'dfi',
      '#166534',
      '#fde047',
      [
        prog('sme-window', 'SME Grant Window', 'grant-window', [3_000, 12_000]),
        prog('agri-value', 'Agri Value Chains Fund', 'agritech', [4_000, 15_000]),
      ],
    ),
    partner(
      'freetown-salone-youth',
      'Salone Youth Works Programme',
      'government',
      '#1d4ed8',
      '#bfdbfe',
      [prog('first-jobs', 'First Jobs Grant', 'youth-employment', [2_000, 8_000])],
    ),
    partner(
      'freetown-western-area-women',
      'Western Area Women in Business Fund',
      'foundation',
      '#9d174d',
      '#fbcfe8',
      [
        prog('women-led', 'Women-Led Enterprise Grant', 'women-founders', [3_000, 10_000]),
        prog('green-coast', 'Green Coast Climate Grant', 'climate', [4_000, 12_000]),
      ],
    ),
  ],
  kigali: [
    partner(
      'kigali-thousand-hills',
      'Thousand Hills Development Fund',
      'dfi',
      '#1d4ed8',
      '#fde68a',
      [
        prog('innovation', 'Digital Innovation Grant', 'digital-innovation', [8_000, 30_000]),
        prog('agri', 'Smallholder Tech Fund', 'agritech', [5_000, 20_000]),
      ],
    ),
    partner(
      'kigali-youth-skills',
      'Rwanda Youth Skills Programme',
      'government',
      '#047857',
      '#a7f3d0',
      [prog('first-jobs', 'Youth Jobs Grant', 'youth-employment', [3_000, 12_000])],
    ),
    partner(
      'kigali-women-founders',
      'Inyange Women Founders Fund',
      'foundation',
      '#a16207',
      '#fef08a',
      [prog('women-led', 'Women Founders Grant', 'women-founders', [5_000, 15_000])],
    ),
  ],
  lagos: [
    partner(
      'lagos-niger-delta-dfi',
      'Atlantic Coast Development Partnership',
      'dfi',
      '#0f766e',
      '#facc15',
      [
        prog('sme-window', 'Growth Grant Window', 'grant-window', [10_000, 40_000]),
        prog('innovation', 'Inclusive Fintech Grant', 'digital-innovation', [15_000, 50_000]),
      ],
    ),
    partner(
      'lagos-women-enterprise',
      'Ìyá Ọlọ́jà Women Enterprise Fund',
      'foundation',
      '#7c3aed',
      '#f472b6',
      [prog('women-led', 'Women-Led Startup Grant', 'women-founders', [8_000, 25_000])],
    ),
    partner(
      'lagos-youth-employment',
      'Lagos Youth Employment Trust',
      'government',
      '#b45309',
      '#fde68a',
      [
        prog('first-jobs', 'Jobs for Graduates Grant', 'youth-employment', [5_000, 20_000]),
        prog('climate', 'Clean Cities Climate Grant', 'climate', [10_000, 30_000]),
      ],
    ),
  ],
  nairobi: [
    partner(
      'nairobi-rift-valley-dfi',
      'Rift Valley Development Partnership',
      'dfi',
      '#166534',
      '#fbbf24',
      [
        prog('sme-window', 'Enterprise Challenge Window', 'grant-window', [10_000, 40_000]),
        prog('climate', 'Climate Resilience Fund', 'climate', [10_000, 35_000]),
      ],
    ),
    partner('nairobi-shamba-fund', 'Shamba Smart Agriculture Fund', 'donor', '#0e7490', '#a5f3fc', [
      prog('agri', 'Smallholder Innovation Grant', 'agritech', [8_000, 25_000]),
    ]),
    partner(
      'nairobi-women-founders',
      'Wangari Women Founders Fund',
      'foundation',
      '#9a3412',
      '#fed7aa',
      [
        prog('women-led', 'Women Founders Grant', 'women-founders', [8_000, 20_000]),
        prog('first-jobs', 'Ajira Youth Jobs Grant', 'youth-employment', [5_000, 15_000]),
      ],
    ),
  ],
  accra: [
    partner(
      'accra-gold-coast-dfi',
      'Gold Coast Development Partnership',
      'dfi',
      '#b91c1c',
      '#fde047',
      [
        prog('sme-window', 'SME Growth Window', 'grant-window', [8_000, 30_000]),
        prog('agri', 'Cocoa Belt Agritech Fund', 'agritech', [6_000, 20_000]),
      ],
    ),
    partner('accra-youth-jobs', 'Ghana Youth Jobs Programme', 'government', '#065f46', '#6ee7b7', [
      prog('first-jobs', 'Youth Jobs Grant', 'youth-employment', [4_000, 15_000]),
    ]),
    partner(
      'accra-women-founders',
      'Adinkra Women in Tech Fund',
      'foundation',
      '#6d28d9',
      '#ddd6fe',
      [prog('women-led', 'Women in Tech Grant', 'women-founders', [6_000, 18_000])],
    ),
  ],
  johannesburg: [
    partner(
      'joburg-highveld-dfi',
      'Highveld Enterprise Development Fund',
      'dfi',
      '#7c2d12',
      '#fdba74',
      [
        prog('sme-window', 'Enterprise Development Grant', 'grant-window', [15_000, 50_000], {
          selectivity: 0.6,
        }),
        prog('first-jobs', 'Youth Employment Grant', 'youth-employment', [8_000, 25_000]),
      ],
    ),
    partner(
      'joburg-women-founders',
      'Jacaranda Women Founders Trust',
      'foundation',
      '#be123c',
      '#fecdd3',
      [prog('women-led', 'Women Founders Grant', 'women-founders', [10_000, 25_000])],
    ),
  ],
  cairo: [
    partner('cairo-nile-dfi', 'Nile Delta Development Partnership', 'dfi', '#92400e', '#fcd34d', [
      prog('innovation', 'Digital Egypt Grant', 'digital-innovation', [10_000, 35_000]),
      prog('agri', 'Delta Agritech Fund', 'agritech', [8_000, 25_000]),
    ]),
    partner(
      'cairo-women-founders',
      'Hatshepsut Women Founders Fund',
      'foundation',
      '#4c1d95',
      '#c4b5fd',
      [prog('women-led', 'Women Founders Grant', 'women-founders', [8_000, 20_000])],
    ),
  ],
  london: [
    partner(
      'london-thames-innovation',
      'Thames Innovation Fund',
      'government',
      '#111827',
      '#f97316',
      [
        prog('innovation', 'Thames R&D Grant', 'digital-innovation', [50_000, 150_000], {
          selectivity: 0.75,
          sectors: 'any',
        }),
      ],
    ),
  ],
  dubai: [
    partner('dubai-gulf-future', 'Gulf Future Fund', 'government', '#0c4a6e', '#fbbf24', [
      prog('innovation', 'Future Economy Grant', 'digital-innovation', [40_000, 120_000], {
        selectivity: 0.75,
      }),
    ]),
  ],
  'san-francisco': [
    partner(
      'sf-bay-research',
      'Bay Area Small Business Research Office',
      'government',
      '#065f46',
      '#bbf7d0',
      [
        prog(
          'innovation',
          'Small Business Research Grant',
          'digital-innovation',
          [100_000, 250_000],
          {
            selectivity: 0.8,
            sectors: ['healthtech', 'saas', 'agritech', 'edtech'],
          },
        ),
      ],
    ),
  ],
};

// ---------------------------------------------------------------- Limited partners

export type LpKind = 'pension' | 'family-office' | 'endowment' | 'dfi-fof' | 'sovereign';

export interface LpSeed {
  id: string;
  name: string;
  kind: LpKind;
  /** Commitment range per fund, USD. */
  ticketUsd: [number, number];
  /** Fund types it likes backing (others get less). */
  prefers: InvestorType[];
  /** Track record bar: deals done and manager stars. */
  minDeals: number;
  minStars: number;
  pitch: string;
  look: ProgramLook;
}

export const LP_KIND_LABEL: Record<LpKind, string> = {
  pension: 'Pension fund',
  'family-office': 'Family office',
  endowment: 'Endowment',
  'dfi-fof': 'DFI fund-of-funds',
  sovereign: 'Sovereign fund',
};

const lp = (
  id: string,
  name: string,
  kind: LpKind,
  ticketUsd: [number, number],
  prefers: InvestorType[],
  minDeals: number,
  minStars: number,
  color: string,
): LpSeed => ({
  id,
  name,
  kind,
  ticketUsd,
  prefers,
  minDeals,
  minStars,
  pitch: {
    pension: 'Patient money; wants a steady record and no surprises.',
    'family-office': 'Moves fast on managers it likes; backs people more than decks.',
    endowment: 'Long horizon, likes focused theses and cash returned.',
    'dfi-fof': 'Backs local managers with an impact mandate.',
    sovereign: 'Big cheques for managers who already return cash.',
  }[kind],
  look: { color, accent: '#ffffff' },
});

/** Ordered by prominence: a market opens 2–5 by depth. */
export const LPS: Record<MarketId, LpSeed[]> = {
  lagos: [
    lp(
      'lagos-eko-family',
      'Eko Heritage Family Office',
      'family-office',
      [100_000, 500_000],
      ['angel', 'vc'],
      2,
      1.5,
      '#0f766e',
    ),
    lp(
      'lagos-atlantic-fof',
      'Atlantic Fund-of-Funds',
      'dfi-fof',
      [250_000, 1_500_000],
      ['impact', 'vc'],
      3,
      2,
      '#1d4ed8',
    ),
    lp(
      'lagos-civil-pension',
      'Lagos Civil Service Pension',
      'pension',
      [500_000, 2_000_000],
      ['vc', 'corporate'],
      5,
      2.5,
      '#7c3aed',
    ),
    lp(
      'lagos-naija-sovereign',
      'Naija Future Sovereign Fund',
      'sovereign',
      [1_000_000, 4_000_000],
      ['vc', 'corporate'],
      8,
      3,
      '#b45309',
    ),
    lp(
      'lagos-akoka-endowment',
      'Akoka University Endowment',
      'endowment',
      [100_000, 600_000],
      ['vc', 'impact'],
      3,
      2,
      '#9d174d',
    ),
  ],
  nairobi: [
    lp(
      'nairobi-karen-family',
      'Karen Hills Family Office',
      'family-office',
      [100_000, 500_000],
      ['angel', 'vc'],
      2,
      1.5,
      '#166534',
    ),
    lp(
      'nairobi-eastern-fof',
      'Eastern Africa Fund-of-Funds',
      'dfi-fof',
      [250_000, 1_500_000],
      ['impact', 'vc'],
      3,
      2,
      '#0e7490',
    ),
    lp(
      'nairobi-teachers-pension',
      'Teachers’ Retirement Scheme',
      'pension',
      [400_000, 1_500_000],
      ['vc'],
      5,
      2.5,
      '#9a3412',
    ),
    lp(
      'nairobi-endowment',
      'Ngong University Endowment',
      'endowment',
      [100_000, 500_000],
      ['vc', 'impact'],
      3,
      2,
      '#1e40af',
    ),
    lp(
      'nairobi-sovereign',
      'Harambee Sovereign Fund',
      'sovereign',
      [1_000_000, 3_000_000],
      ['vc', 'corporate'],
      8,
      3,
      '#be123c',
    ),
  ],
  london: [
    lp(
      'london-mayfair-family',
      'Mayfair Lane Family Office',
      'family-office',
      [500_000, 3_000_000],
      ['angel', 'vc'],
      2,
      1.5,
      '#111827',
    ),
    lp(
      'london-local-gov-pension',
      'Borough Councils Pension Pool',
      'pension',
      [2_000_000, 10_000_000],
      ['vc', 'corporate'],
      5,
      2.5,
      '#1d4ed8',
    ),
    lp(
      'london-college-endowment',
      'Bloomsbury College Endowment',
      'endowment',
      [1_000_000, 5_000_000],
      ['vc', 'impact'],
      3,
      2,
      '#0f172a',
    ),
    lp(
      'london-british-fof',
      'Albion Growth Fund-of-Funds',
      'dfi-fof',
      [1_000_000, 8_000_000],
      ['vc', 'impact'],
      3,
      2,
      '#047857',
    ),
    lp(
      'london-gulf-sovereign',
      'Crescent Sovereign Holdings (London)',
      'sovereign',
      [5_000_000, 20_000_000],
      ['vc', 'corporate'],
      8,
      3,
      '#92400e',
    ),
  ],
  accra: [
    lp(
      'accra-osu-family',
      'Osu Castle Family Office',
      'family-office',
      [80_000, 400_000],
      ['angel', 'vc'],
      2,
      1.5,
      '#b91c1c',
    ),
    lp(
      'accra-west-africa-fof',
      'West Africa Venture Fund-of-Funds',
      'dfi-fof',
      [200_000, 1_200_000],
      ['impact', 'vc'],
      3,
      2,
      '#065f46',
    ),
    lp(
      'accra-workers-pension',
      'Gold Coast Workers Pension',
      'pension',
      [300_000, 1_200_000],
      ['vc'],
      5,
      2.5,
      '#6d28d9',
    ),
    lp(
      'accra-endowment',
      'Legon Hill Endowment',
      'endowment',
      [80_000, 400_000],
      ['vc', 'impact'],
      3,
      2,
      '#a16207',
    ),
    lp(
      'accra-sovereign',
      'Ghana Heritage Sovereign Fund',
      'sovereign',
      [800_000, 2_500_000],
      ['vc', 'corporate'],
      8,
      3,
      '#1e293b',
    ),
  ],
  freetown: [
    lp(
      'freetown-hill-station-family',
      'Hill Station Family Office',
      'family-office',
      [30_000, 200_000],
      ['angel', 'vc', 'impact'],
      1,
      1,
      '#15803d',
    ),
    lp(
      'freetown-salone-fof',
      'Salone Impact Fund-of-Funds',
      'dfi-fof',
      [100_000, 600_000],
      ['impact', 'vc'],
      2,
      1.5,
      '#1e40af',
    ),
    lp(
      'freetown-workers-pension',
      'Freetown Workers Pension Trust',
      'pension',
      [100_000, 500_000],
      ['vc'],
      4,
      2,
      '#9d174d',
    ),
    lp(
      'freetown-aureol-endowment',
      'Mount Aureol Endowment',
      'endowment',
      [30_000, 200_000],
      ['impact', 'vc'],
      2,
      1.5,
      '#a16207',
    ),
    lp(
      'freetown-sovereign',
      'Sierra Future Fund',
      'sovereign',
      [300_000, 1_000_000],
      ['vc', 'impact'],
      6,
      2.5,
      '#0f172a',
    ),
  ],
  kigali: [
    lp(
      'kigali-family',
      'Kiyovu Family Office',
      'family-office',
      [50_000, 300_000],
      ['angel', 'vc'],
      1,
      1.5,
      '#1d4ed8',
    ),
    lp(
      'kigali-fof',
      'Great Lakes Impact Fund-of-Funds',
      'dfi-fof',
      [200_000, 1_000_000],
      ['impact', 'vc'],
      2,
      1.5,
      '#047857',
    ),
    lp(
      'kigali-pension',
      'Kigali Workers Pension Pool',
      'pension',
      [200_000, 800_000],
      ['vc'],
      4,
      2.5,
      '#a16207',
    ),
    lp(
      'kigali-endowment',
      'Kigali Hills Endowment',
      'endowment',
      [50_000, 300_000],
      ['impact', 'vc'],
      2,
      2,
      '#7c2d12',
    ),
    lp(
      'kigali-sovereign',
      'Imena Future Fund',
      'sovereign',
      [500_000, 2_000_000],
      ['vc', 'impact'],
      6,
      3,
      '#111827',
    ),
  ],
  johannesburg: [
    lp(
      'joburg-houghton-family',
      'Houghton Ridge Family Office',
      'family-office',
      [200_000, 1_000_000],
      ['angel', 'vc'],
      2,
      1.5,
      '#7c2d12',
    ),
    lp(
      'joburg-gov-pension',
      'Highveld Public Pension Fund',
      'pension',
      [1_000_000, 5_000_000],
      ['vc', 'corporate'],
      5,
      2.5,
      '#0f172a',
    ),
    lp(
      'joburg-southern-fof',
      'Southern Africa Fund-of-Funds',
      'dfi-fof',
      [500_000, 3_000_000],
      ['impact', 'vc'],
      3,
      2,
      '#be123c',
    ),
    lp(
      'joburg-endowment',
      'Braam Ridge Endowment',
      'endowment',
      [200_000, 1_000_000],
      ['vc', 'impact'],
      3,
      2,
      '#1d4ed8',
    ),
    lp(
      'joburg-sovereign',
      'Ubuntu Sovereign Wealth Fund',
      'sovereign',
      [2_000_000, 6_000_000],
      ['vc', 'corporate'],
      8,
      3,
      '#065f46',
    ),
  ],
  cairo: [
    lp(
      'cairo-zamalek-family',
      'Zamalek Family Office',
      'family-office',
      [150_000, 800_000],
      ['angel', 'vc'],
      2,
      1.5,
      '#92400e',
    ),
    lp(
      'cairo-nile-fof',
      'Nile Fund-of-Funds',
      'dfi-fof',
      [300_000, 2_000_000],
      ['impact', 'vc'],
      3,
      2,
      '#155e75',
    ),
    lp(
      'cairo-pension',
      'Egyptian Insurance & Pension Pool',
      'pension',
      [500_000, 2_000_000],
      ['vc', 'corporate'],
      5,
      2.5,
      '#4c1d95',
    ),
    lp(
      'cairo-endowment',
      'Giza Plateau Endowment',
      'endowment',
      [100_000, 600_000],
      ['vc'],
      3,
      2,
      '#b45309',
    ),
    lp(
      'cairo-sovereign',
      'Pharos Sovereign Fund',
      'sovereign',
      [1_000_000, 4_000_000],
      ['vc', 'corporate'],
      8,
      3,
      '#0f172a',
    ),
  ],
  dubai: [
    lp(
      'dubai-jumeirah-family',
      'Jumeirah Palm Family Office',
      'family-office',
      [500_000, 3_000_000],
      ['angel', 'vc'],
      2,
      1.5,
      '#0c4a6e',
    ),
    lp(
      'dubai-sovereign',
      'Crescent Sovereign Holdings',
      'sovereign',
      [5_000_000, 20_000_000],
      ['vc', 'corporate'],
      6,
      2.5,
      '#1e293b',
    ),
    lp(
      'dubai-pension',
      'Emirates Civil Pension Fund',
      'pension',
      [2_000_000, 8_000_000],
      ['vc', 'corporate'],
      5,
      2.5,
      '#9f1239',
    ),
    lp(
      'dubai-fof',
      'Gulf Ventures Fund-of-Funds',
      'dfi-fof',
      [1_000_000, 5_000_000],
      ['vc', 'impact'],
      3,
      2,
      '#065f46',
    ),
    lp(
      'dubai-endowment',
      'Desert Rose Endowment',
      'endowment',
      [500_000, 2_000_000],
      ['vc'],
      3,
      2,
      '#a16207',
    ),
  ],
  'san-francisco': [
    lp(
      'sf-pacific-heights-family',
      'Pacific Heights Family Office',
      'family-office',
      [1_000_000, 5_000_000],
      ['angel', 'vc'],
      2,
      1.5,
      '#ea580c',
    ),
    lp(
      'sf-state-pension',
      'Golden State Teachers Pension',
      'pension',
      [5_000_000, 25_000_000],
      ['vc', 'corporate'],
      5,
      2.5,
      '#1d4ed8',
    ),
    lp(
      'sf-university-endowment',
      'Palo Verde University Endowment',
      'endowment',
      [3_000_000, 15_000_000],
      ['vc'],
      3,
      2,
      '#065f46',
    ),
    lp(
      'sf-fof',
      'Presidio Fund-of-Funds',
      'dfi-fof',
      [2_000_000, 10_000_000],
      ['vc', 'impact'],
      3,
      2,
      '#7c3aed',
    ),
    lp(
      'sf-sovereign',
      'Crescent Sovereign Holdings (SF)',
      'sovereign',
      [10_000_000, 40_000_000],
      ['vc', 'corporate'],
      8,
      3,
      '#0f172a',
    ),
  ],
};
