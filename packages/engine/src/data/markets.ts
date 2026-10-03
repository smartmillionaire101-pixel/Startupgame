/**
 * Real-world data layer, seed snapshot (design doc §17).
 *
 * Real data sets the *conditions* of each market; it never decides outcomes.
 * These values are a hand-assembled seed snapshot from free public sources,
 * rounded and simplified for play. Fast-moving inputs (FX, policy rates,
 * public multiples) are refreshed at runtime by the server's data feeds; the
 * rest are reviewed by a human on change (§11 "How updates work").
 *
 * Every figure here is in MAJOR units of the market currency unless noted;
 * the engine converts to minor units on use.
 */
import type { Currency } from '../money.js';

export const MARKET_IDS = ['lagos', 'nairobi', 'london'] as const;
export type MarketId = (typeof MARKET_IDS)[number];

export const STAFF_ROLES = [
  'engineer',
  'product',
  'sales',
  'marketing',
  'support',
  'operations',
  'finance',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const SENIORITIES = ['junior', 'mid', 'senior', 'head'] as const;
export type Seniority = (typeof SENIORITIES)[number];

export interface DataSource {
  input: string;
  source: string;
  refresh: 'daily' | 'on change' | 'quarterly' | 'yearly' | 'weekly';
}

export interface MarketData {
  id: MarketId;
  name: string;
  country: string;
  currency: Currency;
  timeZone: string;
  /** Local currency units per 1 USD (official rate). */
  unitsPerUsd: number;
  /** Bank FX conversion fee in basis points; widens with official/street gap. */
  fxFeeBps: number;
  /** Central bank policy rate, basis points per year. */
  baseRateBps: number;
  tax: { corporate: number; personalIncome: number; capitalGains: number };
  /** Monthly cost of living for one person, modest lifestyle incl. rent. */
  costOfLiving: number;
  /** Monthly co-working cost per seat. */
  officeSeat: number;
  /** Monthly gross salary bands by role and seniority ('head' is role-agnostic). */
  salaries: Record<StaffRole, Record<Exclude<Seniority, 'head'>, number>> & { head: number };
  demographics: {
    population: number;
    adultShare: number;
    digitalAdoption: number;
    microBusinesses: number;
    smes: number;
    midsize: number;
  };
  /** 1–5 scores shown on the market picker card (§3). */
  card: { costOfLiving: number; talent: number; capitalAccess: number; regulation: number };
  /** Discount applied to US public multiples for country risk and capital depth. */
  multipleDiscount: number;
  /** Deposit insurance limit per depositor per bank (open question §21). */
  depositInsurance: number;
  /** The floor (§13): freelance gig pay and hours. Open question §21. */
  floorGig: { pay: number; hours: number };
  sources: DataSource[];
}

export const MARKET_DATA: Record<MarketId, MarketData> = {
  lagos: {
    id: 'lagos',
    name: 'Lagos',
    country: 'Nigeria',
    currency: 'NGN',
    timeZone: 'Africa/Lagos',
    unitsPerUsd: 1530,
    fxFeeBps: 150,
    baseRateBps: 2700,
    tax: { corporate: 0.3, personalIncome: 0.18, capitalGains: 0.25 },
    costOfLiving: 450_000,
    officeSeat: 80_000,
    salaries: {
      engineer: { junior: 400_000, mid: 1_000_000, senior: 2_500_000 },
      product: { junior: 450_000, mid: 1_200_000, senior: 2_800_000 },
      sales: { junior: 250_000, mid: 600_000, senior: 1_500_000 },
      marketing: { junior: 300_000, mid: 700_000, senior: 1_600_000 },
      support: { junior: 180_000, mid: 350_000, senior: 700_000 },
      operations: { junior: 250_000, mid: 600_000, senior: 1_400_000 },
      finance: { junior: 350_000, mid: 800_000, senior: 2_000_000 },
      head: 3_500_000,
    },
    demographics: {
      population: 16_500_000,
      adultShare: 0.6,
      digitalAdoption: 0.7,
      microBusinesses: 3_300_000,
      smes: 70_000,
      midsize: 20_000,
    },
    card: { costOfLiving: 2, talent: 4, capitalAccess: 3, regulation: 3 },
    multipleDiscount: 0.45,
    depositInsurance: 5_000_000,
    floorGig: { pay: 120_000, hours: 30 },
    sources: [
      {
        input: 'Exchange rate',
        source: 'Central Bank of Nigeria official window',
        refresh: 'daily',
      },
      { input: 'Policy rate', source: 'CBN Monetary Policy Committee', refresh: 'on change' },
      {
        input: 'Population',
        source: 'Lagos State / UN World Urbanization Prospects (est.)',
        refresh: 'yearly',
      },
      { input: 'MSMEs', source: 'SMEDAN/NBS MSME survey (est.)', refresh: 'yearly' },
      {
        input: 'Tax rates',
        source: 'Nigeria Tax Act 2025 (simplified effective rates)',
        refresh: 'on change',
      },
      {
        input: 'Salaries',
        source: 'Public salary surveys and job boards (est.)',
        refresh: 'quarterly',
      },
      { input: 'Deposit insurance', source: 'NDIC', refresh: 'on change' },
    ],
  },
  nairobi: {
    id: 'nairobi',
    name: 'Nairobi',
    country: 'Kenya',
    currency: 'KES',
    timeZone: 'Africa/Nairobi',
    unitsPerUsd: 129.2,
    fxFeeBps: 100,
    baseRateBps: 950,
    tax: { corporate: 0.3, personalIncome: 0.25, capitalGains: 0.15 },
    costOfLiving: 70_000,
    officeSeat: 15_000,
    salaries: {
      engineer: { junior: 90_000, mid: 220_000, senior: 450_000 },
      product: { junior: 100_000, mid: 250_000, senior: 500_000 },
      sales: { junior: 50_000, mid: 120_000, senior: 280_000 },
      marketing: { junior: 60_000, mid: 140_000, senior: 300_000 },
      support: { junior: 40_000, mid: 70_000, senior: 130_000 },
      operations: { junior: 55_000, mid: 130_000, senior: 270_000 },
      finance: { junior: 70_000, mid: 160_000, senior: 350_000 },
      head: 650_000,
    },
    demographics: {
      population: 5_300_000,
      adultShare: 0.62,
      digitalAdoption: 0.8,
      microBusinesses: 1_200_000,
      smes: 30_000,
      midsize: 8_000,
    },
    card: { costOfLiving: 2, talent: 4, capitalAccess: 3, regulation: 3 },
    multipleDiscount: 0.5,
    depositInsurance: 500_000,
    floorGig: { pay: 18_000, hours: 30 },
    sources: [
      {
        input: 'Exchange rate',
        source: 'Central Bank of Kenya indicative rates',
        refresh: 'daily',
      },
      { input: 'Policy rate', source: 'CBK Monetary Policy Committee', refresh: 'on change' },
      { input: 'Population', source: 'KNBS census projections (est.)', refresh: 'yearly' },
      { input: 'MSMEs', source: 'KNBS MSME survey (est.)', refresh: 'yearly' },
      {
        input: 'Tax rates',
        source: 'Kenya Revenue Authority (simplified effective rates)',
        refresh: 'on change',
      },
      {
        input: 'Salaries',
        source: 'Public salary surveys and job boards (est.)',
        refresh: 'quarterly',
      },
      { input: 'Deposit insurance', source: 'KDIC', refresh: 'on change' },
    ],
  },
  london: {
    id: 'london',
    name: 'London',
    country: 'United Kingdom',
    currency: 'GBP',
    timeZone: 'Europe/London',
    unitsPerUsd: 0.745,
    fxFeeBps: 50,
    baseRateBps: 400,
    tax: { corporate: 0.25, personalIncome: 0.3, capitalGains: 0.24 },
    costOfLiving: 2_300,
    officeSeat: 450,
    salaries: {
      engineer: { junior: 3_300, mid: 5_000, senior: 7_500 },
      product: { junior: 3_500, mid: 5_500, senior: 8_000 },
      sales: { junior: 2_600, mid: 4_000, senior: 6_500 },
      marketing: { junior: 2_600, mid: 3_800, senior: 5_800 },
      support: { junior: 2_100, mid: 2_600, senior: 3_300 },
      operations: { junior: 2_400, mid: 3_500, senior: 5_200 },
      finance: { junior: 2_800, mid: 4_300, senior: 6_500 },
      head: 10_000,
    },
    demographics: {
      population: 9_100_000,
      adultShare: 0.78,
      digitalAdoption: 0.96,
      microBusinesses: 1_000_000,
      smes: 50_000,
      midsize: 7_000,
    },
    card: { costOfLiving: 5, talent: 5, capitalAccess: 5, regulation: 5 },
    multipleDiscount: 0.9,
    depositInsurance: 85_000,
    floorGig: { pay: 600, hours: 30 },
    sources: [
      { input: 'Exchange rate', source: 'Bank of England daily spot rates', refresh: 'daily' },
      { input: 'Policy rate', source: 'Bank of England Bank Rate', refresh: 'on change' },
      { input: 'Population', source: 'ONS mid-year estimates', refresh: 'yearly' },
      { input: 'Businesses', source: 'ONS UK business population (London)', refresh: 'yearly' },
      { input: 'Tax rates', source: 'HMRC (simplified effective rates)', refresh: 'on change' },
      { input: 'Salaries', source: 'ONS ASHE and job boards (est.)', refresh: 'quarterly' },
      { input: 'Deposit insurance', source: 'FSCS', refresh: 'on change' },
    ],
  },
};

/** Approximate EV/revenue multiples of US-listed public peers, by sector. Refreshed daily at runtime. */
export const PUBLIC_MULTIPLES = {
  fintech: 4.5,
  ecommerce: 1.8,
  logistics: 1.3,
  healthtech: 3.5,
  edtech: 2.5,
  saas: 6.5,
  agritech: 1.5,
} as const;
