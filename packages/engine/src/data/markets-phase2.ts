/**
 * Phase 2 markets (§20): Accra, Freetown, Kigali, Johannesburg, Cairo, Dubai.
 *
 * Same conventions as markets.ts: a rounded seed snapshot from free public
 * sources, in MAJOR units of local currency, refreshed at runtime where a
 * feed exists. Figures marked (est.) are estimates awaiting human review.
 * Where a country has no explicit deposit-insurance scheme the limit is 0:
 * a bank failure there can wipe out deposits (§8).
 */
import type { DataSource, MarketData, MarketId } from './markets.js';

type Bands = [junior: number, mid: number, senior: number];

export interface Spec extends Omit<MarketData, 'salaries' | 'sources' | 'id'> {
  bands: Record<
    'engineer' | 'product' | 'sales' | 'marketing' | 'support' | 'operations' | 'finance',
    Bands
  >;
  head: number;
  sources: {
    fx: string;
    rate: string;
    stats: string;
    tax: string;
    deposit: string;
    /** Defaults to public salary surveys and job boards. */
    salaries?: string;
    /** Cost of living and office rents, when a specific source is cited. */
    costs?: string;
  };
}

export function market(id: MarketId, s: Spec): MarketData {
  const { bands, head, sources, ...rest } = s;
  const salaries = Object.fromEntries(
    Object.entries(bands).map(([role, [junior, mid, senior]]) => [role, { junior, mid, senior }]),
  ) as unknown as MarketData['salaries'];
  salaries.head = head;
  const src: DataSource[] = [
    { input: 'Exchange rate', source: sources.fx, refresh: 'daily' },
    { input: 'Policy rate', source: sources.rate, refresh: 'on change' },
    { input: 'Population and businesses', source: sources.stats, refresh: 'yearly' },
    { input: 'Tax rates', source: sources.tax, refresh: 'on change' },
    {
      input: 'Salaries',
      source: sources.salaries ?? 'Public salary surveys and job boards (est.)',
      refresh: 'quarterly',
    },
    { input: 'Deposit insurance', source: sources.deposit, refresh: 'on change' },
    ...(sources.costs
      ? [{ input: 'Cost of living and office', source: sources.costs, refresh: 'yearly' as const }]
      : []),
  ];
  return { id, ...rest, salaries, sources: src };
}

export const PHASE2_DATA = {
  accra: market('accra', {
    name: 'Accra',
    country: 'Ghana',
    currency: 'GHS',
    timeZone: 'Africa/Accra',
    unitsPerUsd: 11,
    fxFeeBps: 150,
    baseRateBps: 2500,
    tax: { corporate: 0.25, personalIncome: 0.25, capitalGains: 0.15 },
    costOfLiving: 5_000,
    officeSeat: 1_200,
    bands: {
      engineer: [6_000, 12_000, 25_000],
      product: [6_500, 14_000, 28_000],
      sales: [3_000, 7_000, 15_000],
      marketing: [3_500, 8_000, 16_000],
      support: [2_500, 4_000, 7_000],
      operations: [3_000, 7_000, 14_000],
      finance: [4_000, 9_000, 18_000],
    },
    head: 35_000,
    demographics: {
      population: 5_500_000,
      adultShare: 0.62,
      digitalAdoption: 0.75,
      microBusinesses: 900_000,
      smes: 25_000,
      midsize: 5_000,
    },
    card: { costOfLiving: 3, talent: 3, capitalAccess: 3, regulation: 3 },
    multipleDiscount: 0.45,
    depositInsurance: 20_000,
    floorGig: { pay: 1_500, hours: 30 },
    sources: {
      fx: 'Bank of Ghana reference rate',
      rate: 'Bank of Ghana MPC',
      stats: 'Ghana Statistical Service (est.)',
      tax: 'Ghana Revenue Authority (simplified)',
      deposit: 'Ghana Deposit Protection Corporation',
    },
  }),
  freetown: market('freetown', {
    name: 'Freetown',
    country: 'Sierra Leone',
    currency: 'SLE',
    timeZone: 'Africa/Freetown',
    unitsPerUsd: 22.7,
    // Official and street rates diverge; the conversion fee widens with the gap (§8).
    fxFeeBps: 350,
    baseRateBps: 2475,
    tax: { corporate: 0.25, personalIncome: 0.25, capitalGains: 0.25 },
    costOfLiving: 7_000,
    officeSeat: 1_500,
    bands: {
      engineer: [4_000, 9_000, 18_000],
      product: [4_500, 10_000, 20_000],
      sales: [2_000, 4_500, 9_000],
      marketing: [2_500, 5_000, 10_000],
      support: [1_500, 2_500, 4_000],
      operations: [2_000, 4_500, 9_000],
      finance: [3_000, 6_000, 12_000],
    },
    head: 25_000,
    demographics: {
      population: 1_300_000,
      adultShare: 0.55,
      digitalAdoption: 0.45,
      microBusinesses: 250_000,
      smes: 5_000,
      midsize: 700,
    },
    card: { costOfLiving: 2, talent: 2, capitalAccess: 1, regulation: 2 },
    multipleDiscount: 0.3,
    depositInsurance: 20_000,
    floorGig: { pay: 1_500, hours: 30 },
    sources: {
      fx: 'Bank of Sierra Leone official rate',
      rate: 'Bank of Sierra Leone MPC',
      stats: 'Statistics Sierra Leone (est.)',
      tax: 'National Revenue Authority (simplified)',
      deposit: 'Deposit Protection Fund (est.)',
    },
  }),
  kigali: market('kigali', {
    name: 'Kigali',
    country: 'Rwanda',
    currency: 'RWF',
    timeZone: 'Africa/Kigali',
    unitsPerUsd: 1_440,
    fxFeeBps: 150,
    baseRateBps: 675,
    tax: { corporate: 0.28, personalIncome: 0.25, capitalGains: 0.05 },
    costOfLiving: 600_000,
    officeSeat: 120_000,
    bands: {
      engineer: [600_000, 1_400_000, 3_000_000],
      product: [700_000, 1_600_000, 3_300_000],
      sales: [350_000, 800_000, 1_800_000],
      marketing: [400_000, 900_000, 2_000_000],
      support: [250_000, 450_000, 800_000],
      operations: [350_000, 800_000, 1_700_000],
      finance: [500_000, 1_100_000, 2_400_000],
    },
    head: 4_500_000,
    demographics: {
      population: 1_700_000,
      adultShare: 0.58,
      digitalAdoption: 0.6,
      microBusinesses: 200_000,
      smes: 6_000,
      midsize: 1_200,
    },
    card: { costOfLiving: 2, talent: 3, capitalAccess: 3, regulation: 4 },
    multipleDiscount: 0.4,
    depositInsurance: 1_000_000,
    floorGig: { pay: 150_000, hours: 30 },
    sources: {
      fx: 'National Bank of Rwanda reference rate',
      rate: 'National Bank of Rwanda MPC',
      stats: 'NISR (est.)',
      tax: 'Rwanda Revenue Authority (simplified)',
      deposit: 'Deposit Guarantee Fund',
    },
  }),
  johannesburg: market('johannesburg', {
    name: 'Johannesburg',
    country: 'South Africa',
    currency: 'ZAR',
    timeZone: 'Africa/Johannesburg',
    unitsPerUsd: 17.5,
    fxFeeBps: 50,
    baseRateBps: 700,
    // Capital gains: 40% inclusion at the top marginal rate ≈ 18% effective.
    tax: { corporate: 0.27, personalIncome: 0.28, capitalGains: 0.18 },
    costOfLiving: 18_000,
    officeSeat: 3_000,
    bands: {
      engineer: [30_000, 55_000, 90_000],
      product: [32_000, 60_000, 100_000],
      sales: [18_000, 35_000, 60_000],
      marketing: [20_000, 38_000, 65_000],
      support: [12_000, 18_000, 28_000],
      operations: [18_000, 32_000, 55_000],
      finance: [25_000, 45_000, 80_000],
    },
    head: 140_000,
    demographics: {
      population: 6_200_000,
      adultShare: 0.68,
      digitalAdoption: 0.8,
      microBusinesses: 700_000,
      smes: 60_000,
      midsize: 10_000,
    },
    card: { costOfLiving: 3, talent: 4, capitalAccess: 4, regulation: 4 },
    multipleDiscount: 0.6,
    depositInsurance: 100_000,
    floorGig: { pay: 6_000, hours: 30 },
    sources: {
      fx: 'South African Reserve Bank rates',
      rate: 'SARB repo rate',
      stats: 'Stats SA (est.)',
      tax: 'SARS (simplified)',
      deposit: 'Corporation for Deposit Insurance',
    },
  }),
  cairo: market('cairo', {
    name: 'Cairo',
    country: 'Egypt',
    currency: 'EGP',
    timeZone: 'Africa/Cairo',
    unitsPerUsd: 48.5,
    fxFeeBps: 150,
    baseRateBps: 2200,
    tax: { corporate: 0.225, personalIncome: 0.22, capitalGains: 0.1 },
    costOfLiving: 22_000,
    officeSeat: 4_000,
    bands: {
      engineer: [25_000, 50_000, 100_000],
      product: [28_000, 55_000, 110_000],
      sales: [12_000, 25_000, 50_000],
      marketing: [14_000, 28_000, 55_000],
      support: [8_000, 13_000, 22_000],
      operations: [12_000, 25_000, 48_000],
      finance: [18_000, 35_000, 70_000],
    },
    head: 150_000,
    demographics: {
      population: 22_000_000,
      adultShare: 0.62,
      digitalAdoption: 0.72,
      microBusinesses: 2_500_000,
      smes: 90_000,
      midsize: 15_000,
    },
    card: { costOfLiving: 2, talent: 4, capitalAccess: 3, regulation: 3 },
    multipleDiscount: 0.4,
    depositInsurance: 0,
    floorGig: { pay: 6_000, hours: 30 },
    sources: {
      fx: 'Central Bank of Egypt official rate',
      rate: 'CBE overnight deposit rate',
      stats: 'CAPMAS (est.)',
      tax: 'Egyptian Tax Authority (simplified)',
      deposit: 'No explicit deposit insurance scheme',
    },
  }),
  dubai: market('dubai', {
    name: 'Dubai',
    country: 'United Arab Emirates',
    currency: 'AED',
    timeZone: 'Asia/Dubai',
    // Pegged to the dollar.
    unitsPerUsd: 3.6725,
    fxFeeBps: 25,
    baseRateBps: 440,
    tax: { corporate: 0.09, personalIncome: 0, capitalGains: 0 },
    costOfLiving: 9_000,
    officeSeat: 2_000,
    bands: {
      engineer: [12_000, 20_000, 32_000],
      product: [14_000, 22_000, 35_000],
      sales: [9_000, 15_000, 25_000],
      marketing: [9_000, 15_000, 24_000],
      support: [6_000, 8_000, 12_000],
      operations: [9_000, 14_000, 22_000],
      finance: [11_000, 18_000, 28_000],
    },
    head: 45_000,
    demographics: {
      population: 3_800_000,
      adultShare: 0.85,
      digitalAdoption: 0.99,
      microBusinesses: 300_000,
      smes: 60_000,
      midsize: 12_000,
    },
    card: { costOfLiving: 5, talent: 4, capitalAccess: 5, regulation: 4 },
    multipleDiscount: 0.75,
    depositInsurance: 0,
    floorGig: { pay: 2_500, hours: 30 },
    sources: {
      fx: 'CBUAE (USD peg)',
      rate: 'CBUAE base rate',
      stats: 'Dubai Statistics Center (est.)',
      tax: 'Federal Tax Authority (simplified)',
      deposit: 'No explicit deposit insurance scheme',
    },
  }),
} satisfies Record<string, MarketData>;
