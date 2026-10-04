/**
 * Wave 3 markets: San Francisco.
 *
 * Same conventions as markets.ts: a rounded seed snapshot from free public
 * sources, in MAJOR units of local currency. San Francisco is the game's
 * first dollar market: its local currency *is* the reference currency, so
 * `unitsPerUsd` is fixed at 1 and conversions to USD are no-ops.
 *
 * Sources (public, rounded for play; figures marked (est.) await review):
 * - Policy rate: Federal Reserve FOMC federal funds target range, upper bound.
 * - Tax: IRS (21% federal corporate rate) plus California FTB (8.84% corporate
 *   franchise tax) ≈ 29.8%; personal income is a blended single rate for the
 *   game (federal + California + payroll ≈ 35%); capital gains 20% federal
 *   long-term rate + 3.8% NIIT, plus California taxing gains as income (est.).
 * - Population and businesses: US Census Bureau ACS and County Business
 *   Patterns / Nonemployer Statistics for the nine Bay Area counties (est.).
 * - Salaries: BLS OEWS for the San Francisco–Oakland–Fremont MSA and public
 *   job-board ranges (est.); a senior engineer ≈ $200k a year.
 * - Cost of living: single adult incl. a studio/1-bed share in the city, from
 *   public cost-of-living indices (est.); co-working ≈ $900 a seat.
 * - Deposit insurance: FDIC, $250,000 per depositor per bank.
 */
import { market } from './markets-phase2.js';
import type { MarketData } from './markets.js';

export const WAVE3_DATA = {
  'san-francisco': market('san-francisco', {
    name: 'San Francisco',
    country: 'United States',
    currency: 'USD',
    timeZone: 'America/Los_Angeles',
    // The reference currency: always 1. Feeds never move it (see applyMarketData).
    unitsPerUsd: 1,
    // Card/wire FX spreads at US banks; at or below every other market's fee.
    fxFeeBps: 25,
    baseRateBps: 375,
    tax: { corporate: 0.298, personalIncome: 0.35, capitalGains: 0.33 },
    costOfLiving: 5_500,
    officeSeat: 900,
    bands: {
      engineer: [11_000, 14_000, 17_000],
      product: [11_500, 15_000, 18_500],
      sales: [7_000, 10_000, 14_000],
      marketing: [7_500, 10_500, 14_000],
      support: [5_000, 6_000, 7_500],
      operations: [7_000, 9_500, 13_000],
      finance: [8_000, 11_000, 15_000],
    },
    head: 25_000,
    demographics: {
      population: 7_700_000,
      adultShare: 0.79,
      digitalAdoption: 0.97,
      microBusinesses: 650_000,
      smes: 180_000,
      midsize: 12_000,
    },
    card: { costOfLiving: 5, talent: 5, capitalAccess: 5, regulation: 4 },
    // US public peers are the reference: no country discount.
    multipleDiscount: 1,
    depositInsurance: 250_000,
    floorGig: { pay: 1_500, hours: 30 },
    sources: {
      fx: 'US dollar: the reference currency (no conversion)',
      rate: 'Federal Reserve FOMC federal funds target range (upper bound)',
      stats:
        'US Census Bureau ACS, County Business Patterns and Nonemployer Statistics, Bay Area (est.)',
      tax: 'IRS and California Franchise Tax Board (simplified effective rates)',
      deposit: 'FDIC',
      salaries: 'BLS OEWS, San Francisco–Oakland–Fremont MSA, and job boards (est.)',
      costs: 'Public cost-of-living indices and co-working list prices (est.)',
    },
  }),
} satisfies Record<string, MarketData>;
