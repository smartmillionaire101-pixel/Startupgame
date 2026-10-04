/**
 * Capital that mirrors each market (Wave 1, section A): lenders, their
 * products, and how deep the equity markets are.
 *
 * Lender names are fictional, like the rest of the AI population, and are
 * reserved so players cannot impersonate them. Products are calibrated from
 * public facts about each market (policy rates, typical SME lending terms,
 * state schemes) and kept in USD; the engine converts at today's rate. The
 * first high-street lender in each market keeps the name of the market's
 * original AI bank, so saved worlds read the same.
 */
import type { Industry } from './industries.js';
import type { MarketId } from './markets.js';

export type LenderKind =
  | 'high-street' // big retail/commercial bank
  | 'challenger' // digital bank, faster, pricier
  | 'government' // state-backed scheme (e.g. UK Start Up Loans, BOI, NYOTA)
  | 'development' // DFI / development bank (SME windows)
  | 'microfinance'
  | 'fintech'; // revenue-based / inventory finance, BNPL-for-business

export type ProductKind =
  | 'startup-loan' // personal loan for founders, pre-revenue allowed
  | 'working-capital'
  | 'revenue-based' // repay a % of monthly revenue
  | 'asset-finance'
  | 'overdraft';

export interface LenderProductSeed {
  /** Unique within the lender. */
  id: string;
  kind: ProductKind;
  /** "Start Up Loan", "Business overdraft". */
  label: string;
  borrower: 'founder' | 'company';
  /** Eligibility. 0 months = pre-revenue allowed. */
  minMonthsTrading: number;
  minMonthlyRevenueUsd: number;
  minStars: number;
  /** For founder products. */
  minCreditScore: number;
  /** Size and price. */
  amountUsd: [number, number];
  /** Cap = monthly revenue × this (company products). */
  maxRevenueMultiple?: number;
  /** Over the market base rate (fixed-rate schemes set fixedRateBps instead). */
  spreadBps: number;
  fixedRateBps?: number;
  termMonths: [number, number];
  guarantee: 'required' | 'optional' | 'none';
  /** Revenue-based only: share of monthly revenue repaid. */
  revenueShareBps?: number;
  /** Revenue-based only: total repaid as a multiple of the advance, in bps (11000 = 1.1×). */
  repayCapBps?: number;
  /** One-line plain-language description shown at the counter. */
  pitch: string;
}

export interface LenderLook {
  color: string;
  accent: string;
  motif: 'columns' | 'glass' | 'kiosk' | 'tower' | 'shopfront';
}

export interface LenderSeed {
  id: string;
  /** Fictional, like the rest of the AI population. */
  name: string;
  kind: LenderKind;
  /** How much appetite it has this cycle: 0.5 tight … 1.5 loose. Moves with climate. */
  appetite: number;
  products: LenderProductSeed[];
  /** City art. */
  look: LenderLook;
}

/** Extra AI funds and angel networks beyond the six every market starts with. */
export interface ExtraFundSeed {
  name: string;
  partner: string;
  /** 'vc' cheques scale with vcDepth, 'angels' with angelDepth. */
  kind: 'seed-vc' | 'sector-vc' | 'growth-vc' | 'angels';
  sectors: Industry[] | 'any';
}

export interface CapitalProfile {
  /** Sources, for the "where the numbers come from" card. */
  sources: string[];
  lenders: LenderSeed[];
  /** Funds and angels per market are scaled by these (London = 1). */
  vcDepth: number;
  angelDepth: number;
  /** Tax-advantaged angel schemes etc., shown in the city. */
  schemes: { name: string; effect: string }[];
  /** Name pool for extra funds; how many open follows vcDepth and angelDepth. */
  funds: ExtraFundSeed[];
}

const look = (color: string, accent: string, motif: LenderLook['motif']): LenderLook => ({
  color,
  accent,
  motif,
});

export const CAPITAL: Record<MarketId, CapitalProfile> = {
  london: {
    sources: [
      'Bank of England Bank Rate',
      'British Business Bank: Small Business Finance Markets report',
      'Start Up Loans programme terms (gov.uk)',
      'HMRC SEIS and EIS statistics',
      'UK Finance SME lending data',
    ],
    vcDepth: 1,
    angelDepth: 1,
    schemes: [
      {
        name: 'SEIS',
        effect: 'Angels get 50% income tax relief on early cheques, so they say yes more often.',
      },
      {
        name: 'EIS',
        effect: 'Angels get 30% relief on later cheques, so angel rounds run larger.',
      },
    ],
    lenders: [
      {
        id: 'albion-weir',
        name: 'Albion & Weir Bank',
        kind: 'high-street',
        appetite: 1,
        look: look('#1f3a5f', '#c9a227', 'columns'),
        products: [
          {
            id: 'overdraft',
            kind: 'overdraft',
            label: 'Business overdraft',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 4_000,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [1_300, 32_000],
            maxRevenueMultiple: 2,
            spreadBps: 900,
            termMonths: [3, 12],
            guarantee: 'optional',
            pitch: 'A safety net on your account for lumpy months.',
          },
          {
            id: 'working-capital',
            kind: 'working-capital',
            label: 'Small business loan',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 8_000,
            minStars: 1,
            minCreditScore: 0,
            amountUsd: [13_000, 320_000],
            maxRevenueMultiple: 4,
            spreadBps: 450,
            termMonths: [12, 60],
            guarantee: 'optional',
            pitch: 'A term loan for growth once you have six months of sales.',
          },
        ],
      },
      {
        id: 'thamesgate',
        name: 'Thamesgate Bank',
        kind: 'high-street',
        appetite: 0.9,
        look: look('#0b6e4f', '#e8e4d8', 'tower'),
        products: [
          {
            id: 'working-capital',
            kind: 'working-capital',
            label: 'Business growth loan',
            borrower: 'company',
            minMonthsTrading: 12,
            minMonthlyRevenueUsd: 10_000,
            minStars: 1.5,
            minCreditScore: 0,
            amountUsd: [25_000, 500_000],
            maxRevenueMultiple: 5,
            spreadBps: 400,
            termMonths: [12, 60],
            guarantee: 'required',
            pitch: 'Cheaper money for established businesses, with your guarantee.',
          },
        ],
      },
      {
        id: 'kestrel',
        name: 'Kestrel Bank',
        kind: 'challenger',
        appetite: 1.2,
        look: look('#ff5a5f', '#1b1b1b', 'glass'),
        products: [
          {
            id: 'flex-loan',
            kind: 'working-capital',
            label: 'Flex business loan',
            borrower: 'company',
            minMonthsTrading: 3,
            minMonthlyRevenueUsd: 3_000,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [3_000, 130_000],
            maxRevenueMultiple: 3,
            spreadBps: 900,
            termMonths: [6, 36],
            guarantee: 'optional',
            pitch: 'Decision in a day from three months of sales. Pricier than the big banks.',
          },
        ],
      },
      {
        id: 'start-up-loans',
        name: 'Founders Start Up Loans',
        kind: 'government',
        appetite: 1,
        look: look('#4b2e83', '#f2c14e', 'shopfront'),
        products: [
          {
            id: 'start-up-loan',
            kind: 'startup-loan',
            label: 'Start Up Loan',
            borrower: 'founder',
            minMonthsTrading: 0,
            minMonthlyRevenueUsd: 0,
            minStars: 0,
            minCreditScore: 30,
            amountUsd: [650, 32_000],
            spreadBps: 0,
            fixedRateBps: 600,
            termMonths: [12, 60],
            guarantee: 'none',
            pitch: 'Government-backed personal loan at a fixed 6%, before you have any revenue.',
          },
        ],
      },
      {
        id: 'ironbridge',
        name: 'Ironbridge Asset Finance',
        kind: 'fintech',
        appetite: 1,
        look: look('#5c5c5c', '#f28c28', 'shopfront'),
        products: [
          {
            id: 'asset-finance',
            kind: 'asset-finance',
            label: 'Equipment finance',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 5_000,
            minStars: 0.5,
            minCreditScore: 0,
            amountUsd: [6_500, 260_000],
            maxRevenueMultiple: 6,
            spreadBps: 550,
            termMonths: [12, 60],
            guarantee: 'none',
            pitch: 'Secured on the kit you buy, so no personal guarantee.',
          },
        ],
      },
      {
        id: 'tideline',
        name: 'Tideline Revenue Capital',
        kind: 'fintech',
        appetite: 1.1,
        look: look('#00a6a6', '#0d1b2a', 'glass'),
        products: [
          {
            id: 'revenue-based',
            kind: 'revenue-based',
            label: 'Revenue-based finance',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 12_000,
            minStars: 1,
            minCreditScore: 0,
            amountUsd: [13_000, 1_300_000],
            maxRevenueMultiple: 4,
            spreadBps: 0,
            termMonths: [6, 24],
            guarantee: 'none',
            revenueShareBps: 800,
            repayCapBps: 11_000,
            pitch: 'Repay 8% of each month’s revenue until you’ve paid back 1.1×. No equity.',
          },
        ],
      },
    ],
    funds: [
      { name: 'Ravenmoor Seed', partner: 'Eleanor Byrne', kind: 'seed-vc', sectors: 'any' },
      {
        name: 'Hollowstone Ventures',
        partner: 'Marcus Adeyinka',
        kind: 'sector-vc',
        sectors: ['fintech', 'saas'],
      },
      { name: 'Cinderpath Growth', partner: 'Isabel Hart', kind: 'growth-vc', sectors: 'any' },
      { name: 'Barrowgate Angels', partner: 'Tom Whitlock', kind: 'angels', sectors: 'any' },
      {
        name: 'Larkhill Angel Syndicate',
        partner: 'Nadia Rahman',
        kind: 'angels',
        sectors: ['healthtech', 'edtech', 'saas'],
      },
    ],
  },
  lagos: {
    sources: [
      'Central Bank of Nigeria Monetary Policy Rate',
      'CBN credit to the private sector statistics',
      'Bank of Industry and development finance windows (public terms)',
      'Nigeria Startup Act 2022',
    ],
    vcDepth: 0.25,
    angelDepth: 0.3,
    schemes: [
      {
        name: 'Nigeria Startup Act',
        effect: 'Labelled startups get tax breaks and access to a state seed fund.',
      },
    ],
    lenders: [
      {
        id: 'eko-union',
        name: 'Eko Union Bank',
        kind: 'high-street',
        appetite: 0.8,
        look: look('#7a1f1f', '#f4d35e', 'columns'),
        products: [
          {
            id: 'working-capital',
            kind: 'working-capital',
            label: 'SME working capital loan',
            borrower: 'company',
            minMonthsTrading: 12,
            minMonthlyRevenueUsd: 2_500,
            minStars: 1,
            minCreditScore: 0,
            amountUsd: [3_000, 100_000],
            maxRevenueMultiple: 3,
            spreadBps: 600,
            termMonths: [6, 24],
            guarantee: 'required',
            pitch: 'Twelve months of trading and a personal guarantee, then we talk.',
          },
          {
            id: 'overdraft',
            kind: 'overdraft',
            label: 'Business overdraft',
            borrower: 'company',
            minMonthsTrading: 12,
            minMonthlyRevenueUsd: 1_500,
            minStars: 0.5,
            minCreditScore: 0,
            amountUsd: [600, 15_000],
            maxRevenueMultiple: 1.5,
            spreadBps: 800,
            termMonths: [3, 12],
            guarantee: 'required',
            pitch: 'A short overdraft for established businesses with collateral.',
          },
        ],
      },
      {
        id: 'agege-mfb',
        name: 'Agege Microfinance Bank',
        kind: 'microfinance',
        appetite: 1.1,
        look: look('#2e7d32', '#ffd54f', 'kiosk'),
        products: [
          {
            id: 'micro-loan',
            kind: 'working-capital',
            label: 'Trader loan',
            borrower: 'company',
            minMonthsTrading: 3,
            minMonthlyRevenueUsd: 300,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [150, 6_000],
            maxRevenueMultiple: 2,
            spreadBps: 1300,
            termMonths: [3, 12],
            guarantee: 'optional',
            pitch: 'Small loans for small businesses. Quick, but dear.',
          },
          {
            id: 'founder-loan',
            kind: 'startup-loan',
            label: 'Founder micro-loan',
            borrower: 'founder',
            minMonthsTrading: 0,
            minMonthlyRevenueUsd: 0,
            minStars: 0,
            minCreditScore: 30,
            amountUsd: [100, 2_000],
            spreadBps: 1500,
            termMonths: [3, 12],
            guarantee: 'none',
            pitch: 'A small personal loan to get started.',
          },
        ],
      },
      {
        id: 'delta-enterprise',
        name: 'Delta Enterprise Development Bank',
        kind: 'development',
        appetite: 0.7,
        look: look('#14532d', '#e5e7eb', 'tower'),
        products: [
          {
            id: 'sme-window',
            kind: 'working-capital',
            label: 'SME development loan',
            borrower: 'company',
            minMonthsTrading: 18,
            minMonthlyRevenueUsd: 5_000,
            minStars: 2,
            minCreditScore: 0,
            amountUsd: [6_000, 160_000],
            maxRevenueMultiple: 4,
            spreadBps: 0,
            fixedRateBps: 900,
            termMonths: [12, 60],
            guarantee: 'required',
            pitch: 'Single-digit fixed rate. Slow, strict, and worth it if you qualify.',
          },
          {
            id: 'youth-loan',
            kind: 'startup-loan',
            label: 'Youth enterprise loan',
            borrower: 'founder',
            minMonthsTrading: 0,
            minMonthlyRevenueUsd: 0,
            minStars: 0,
            minCreditScore: 45,
            amountUsd: [300, 6_000],
            spreadBps: 0,
            fixedRateBps: 500,
            termMonths: [12, 36],
            guarantee: 'none',
            pitch: 'A state-backed start-up loan at 5% fixed, for founders with clean credit.',
          },
        ],
      },
      {
        id: 'ferry-credit',
        name: 'Ferry Credit',
        kind: 'fintech',
        appetite: 1.2,
        look: look('#ffb703', '#023047', 'glass'),
        products: [
          {
            id: 'quick-loan',
            kind: 'working-capital',
            label: 'Quick business loan',
            borrower: 'company',
            minMonthsTrading: 3,
            minMonthlyRevenueUsd: 500,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [100, 10_000],
            maxRevenueMultiple: 1.5,
            spreadBps: 2000,
            termMonths: [3, 6],
            guarantee: 'none',
            pitch: 'Money in your account today. Short tenor, high rate.',
          },
        ],
      },
    ],
    funds: [
      { name: 'Lekki Lagoon Seed', partner: 'Bisi Ogunleye', kind: 'seed-vc', sectors: 'any' },
      { name: 'Yaba Angels Club', partner: 'Emeka Nwosu', kind: 'angels', sectors: 'any' },
    ],
  },
  nairobi: {
    sources: [
      'Central Bank of Kenya Central Bank Rate',
      'CBK bank supervision report (SME lending)',
      'Youth Enterprise Development Fund (public terms)',
      'FinAccess household survey (mobile credit)',
    ],
    vcDepth: 0.3,
    angelDepth: 0.3,
    schemes: [
      {
        name: 'Youth enterprise funds',
        effect: 'Young founders can borrow small amounts at low fixed rates.',
      },
    ],
    lenders: [
      {
        id: 'mlima',
        name: 'Mlima Commercial Bank',
        kind: 'high-street',
        appetite: 0.9,
        look: look('#0f4c81', '#9bc53d', 'columns'),
        products: [
          {
            id: 'working-capital',
            kind: 'working-capital',
            label: 'SME business loan',
            borrower: 'company',
            minMonthsTrading: 12,
            minMonthlyRevenueUsd: 2_000,
            minStars: 1,
            minCreditScore: 0,
            amountUsd: [2_000, 80_000],
            maxRevenueMultiple: 3,
            spreadBps: 650,
            termMonths: [6, 36],
            guarantee: 'required',
            pitch: 'A year of trading and your guarantee, then a proper term loan.',
          },
          {
            id: 'overdraft',
            kind: 'overdraft',
            label: 'Business overdraft',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 1_000,
            minStars: 0.5,
            minCreditScore: 0,
            amountUsd: [400, 10_000],
            maxRevenueMultiple: 1.5,
            spreadBps: 800,
            termMonths: [3, 12],
            guarantee: 'optional',
            pitch: 'A cushion on your account once you have six months of sales.',
          },
        ],
      },
      {
        id: 'tujenge',
        name: 'Tujenge Microfinance',
        kind: 'microfinance',
        appetite: 1.1,
        look: look('#e76f51', '#264653', 'kiosk'),
        products: [
          {
            id: 'micro-loan',
            kind: 'working-capital',
            label: 'Biashara loan',
            borrower: 'company',
            minMonthsTrading: 3,
            minMonthlyRevenueUsd: 200,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [100, 5_000],
            maxRevenueMultiple: 2,
            spreadBps: 1200,
            termMonths: [3, 12],
            guarantee: 'optional',
            pitch: 'Small loans for small businesses, repaid weekly in spirit.',
          },
        ],
      },
      {
        id: 'vijana-fund',
        name: 'Vijana Enterprise Fund',
        kind: 'government',
        appetite: 1,
        look: look('#006b3f', '#fcd116', 'shopfront'),
        products: [
          {
            id: 'youth-loan',
            kind: 'startup-loan',
            label: 'Youth start-up loan',
            borrower: 'founder',
            minMonthsTrading: 0,
            minMonthlyRevenueUsd: 0,
            minStars: 0,
            minCreditScore: 30,
            amountUsd: [80, 4_000],
            spreadBps: 0,
            fixedRateBps: 600,
            termMonths: [6, 36],
            guarantee: 'none',
            pitch: 'A small state loan at 6% fixed for young founders, before revenue.',
          },
        ],
      },
      {
        id: 'simu-credit',
        name: 'Simu Credit',
        kind: 'fintech',
        appetite: 1.2,
        look: look('#43aa8b', '#f9c74f', 'kiosk'),
        products: [
          {
            id: 'mobile-loan',
            kind: 'working-capital',
            label: 'Mobile business loan',
            borrower: 'company',
            minMonthsTrading: 2,
            minMonthlyRevenueUsd: 150,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [50, 3_000],
            maxRevenueMultiple: 1,
            spreadBps: 2500,
            termMonths: [3, 6],
            guarantee: 'none',
            pitch: 'Scored on your till and mobile money. Fast and expensive.',
          },
        ],
      },
    ],
    funds: [
      { name: 'Ngong Ridge Seed', partner: 'Njeri Wambui', kind: 'seed-vc', sectors: 'any' },
      { name: 'Kilimani Angels', partner: 'Brian Kiprop', kind: 'angels', sectors: 'any' },
    ],
  },
  accra: {
    sources: [
      'Bank of Ghana Monetary Policy Rate',
      'Bank of Ghana SME credit statistics',
      'Ghana Enterprises Agency programmes (public terms)',
    ],
    vcDepth: 0.2,
    angelDepth: 0.2,
    schemes: [
      {
        name: 'YouStart',
        effect: 'A state programme lending to young founders at below-market rates.',
      },
    ],
    lenders: [
      {
        id: 'akwaaba',
        name: 'Akwaaba Commercial Bank',
        kind: 'high-street',
        appetite: 0.85,
        look: look('#b5651d', '#006b3f', 'columns'),
        products: [
          {
            id: 'working-capital',
            kind: 'working-capital',
            label: 'SME working capital loan',
            borrower: 'company',
            minMonthsTrading: 12,
            minMonthlyRevenueUsd: 2_000,
            minStars: 1,
            minCreditScore: 0,
            amountUsd: [2_000, 70_000],
            maxRevenueMultiple: 3,
            spreadBps: 700,
            termMonths: [6, 36],
            guarantee: 'required',
            pitch: 'A year of trading and collateral, then a term loan.',
          },
        ],
      },
      {
        id: 'osu-savings',
        name: 'Osu Savings & Loans',
        kind: 'microfinance',
        appetite: 1.1,
        look: look('#fcd116', '#ce1126', 'kiosk'),
        products: [
          {
            id: 'micro-loan',
            kind: 'working-capital',
            label: 'Susu business loan',
            borrower: 'company',
            minMonthsTrading: 3,
            minMonthlyRevenueUsd: 250,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [100, 5_000],
            maxRevenueMultiple: 2,
            spreadBps: 1200,
            termMonths: [3, 12],
            guarantee: 'optional',
            pitch: 'Small loans built on your savings record.',
          },
        ],
      },
      {
        id: 'adwuma-start',
        name: 'Adwuma Youth Start',
        kind: 'government',
        appetite: 0.9,
        look: look('#006b3f', '#fcd116', 'shopfront'),
        products: [
          {
            id: 'youth-loan',
            kind: 'startup-loan',
            label: 'Youth start-up loan',
            borrower: 'founder',
            minMonthsTrading: 0,
            minMonthlyRevenueUsd: 0,
            minStars: 0,
            minCreditScore: 35,
            amountUsd: [200, 8_000],
            spreadBps: 0,
            fixedRateBps: 1000,
            termMonths: [12, 36],
            guarantee: 'none',
            pitch: 'A state start-up loan at 10% fixed, far below the banks.',
          },
        ],
      },
      {
        id: 'kenkey-credit',
        name: 'Kenkey Credit',
        kind: 'fintech',
        appetite: 1.2,
        look: look('#8338ec', '#ffbe0b', 'glass'),
        products: [
          {
            id: 'quick-loan',
            kind: 'working-capital',
            label: 'Mobile money business loan',
            borrower: 'company',
            minMonthsTrading: 3,
            minMonthlyRevenueUsd: 400,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [100, 8_000],
            maxRevenueMultiple: 1.5,
            spreadBps: 1800,
            termMonths: [3, 6],
            guarantee: 'none',
            pitch: 'Scored on your mobile money flows. Fast, short and pricey.',
          },
        ],
      },
    ],
    funds: [
      { name: 'Labadi Seed Partners', partner: 'Afia Nkansah', kind: 'seed-vc', sectors: 'any' },
    ],
  },
  freetown: {
    sources: [
      'Bank of Sierra Leone Monetary Policy Rate',
      'Bank of Sierra Leone financial stability report',
      'Microfinance sector reports (public)',
    ],
    vcDepth: 0.05,
    angelDepth: 0.05,
    schemes: [],
    lenders: [
      {
        id: 'salone-mutual',
        name: 'Salone Mutual Bank',
        kind: 'high-street',
        appetite: 0.7,
        look: look('#1eb53a', '#0072c6', 'columns'),
        products: [
          {
            id: 'working-capital',
            kind: 'working-capital',
            label: 'Business loan',
            borrower: 'company',
            minMonthsTrading: 24,
            minMonthlyRevenueUsd: 3_000,
            minStars: 2,
            minCreditScore: 0,
            amountUsd: [2_000, 30_000],
            maxRevenueMultiple: 2,
            spreadBps: 900,
            termMonths: [6, 24],
            guarantee: 'required',
            pitch: 'For established businesses with two years of books and collateral.',
          },
        ],
      },
      {
        id: 'kroo-bay',
        name: 'Kroo Bay Microfinance',
        kind: 'microfinance',
        appetite: 1,
        look: look('#f4a261', '#2a9d8f', 'kiosk'),
        products: [
          {
            id: 'micro-loan',
            kind: 'working-capital',
            label: 'Market trader loan',
            borrower: 'company',
            minMonthsTrading: 3,
            minMonthlyRevenueUsd: 100,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [50, 2_500],
            maxRevenueMultiple: 2,
            spreadBps: 1500,
            termMonths: [3, 12],
            guarantee: 'optional',
            pitch: 'The main source of credit for small businesses here.',
          },
          {
            id: 'founder-loan',
            kind: 'startup-loan',
            label: 'Group start-up loan',
            borrower: 'founder',
            minMonthsTrading: 0,
            minMonthlyRevenueUsd: 0,
            minStars: 0,
            minCreditScore: 30,
            amountUsd: [50, 600],
            spreadBps: 1800,
            termMonths: [3, 12],
            guarantee: 'none',
            pitch: 'A tiny personal loan to get going, backed by your group.',
          },
        ],
      },
    ],
    funds: [],
  },
  kigali: {
    sources: [
      'National Bank of Rwanda Central Bank Rate',
      'Business Development Fund guarantee schemes (public terms)',
      'Kigali International Financial Centre',
    ],
    vcDepth: 0.15,
    angelDepth: 0.2,
    schemes: [
      {
        name: 'SME credit guarantees',
        effect:
          'The state guarantees part of small business loans, so lenders ask less collateral.',
      },
      {
        name: 'Financial centre incentives',
        effect: 'Tax breaks attract regional funds to base themselves here.',
      },
    ],
    lenders: [
      {
        id: 'isange',
        name: 'Isange Bank',
        kind: 'high-street',
        appetite: 0.9,
        look: look('#00a1de', '#fad201', 'columns'),
        products: [
          {
            id: 'working-capital',
            kind: 'working-capital',
            label: 'SME loan',
            borrower: 'company',
            minMonthsTrading: 12,
            minMonthlyRevenueUsd: 2_000,
            minStars: 1,
            minCreditScore: 0,
            amountUsd: [2_000, 60_000],
            maxRevenueMultiple: 3,
            spreadBps: 900,
            termMonths: [6, 36],
            guarantee: 'required',
            pitch: 'A year of trading and your guarantee for a term loan.',
          },
        ],
      },
      {
        id: 'imihigo',
        name: 'Imihigo Enterprise Fund',
        kind: 'government',
        appetite: 1.2,
        look: look('#20603d', '#fad201', 'shopfront'),
        products: [
          {
            id: 'guaranteed-loan',
            kind: 'working-capital',
            label: 'Guaranteed SME loan',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 500,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [1_000, 30_000],
            maxRevenueMultiple: 4,
            spreadBps: 0,
            fixedRateBps: 800,
            termMonths: [12, 48],
            guarantee: 'none',
            pitch: 'The state guarantees most of it, so you don’t have to.',
          },
          {
            id: 'youth-loan',
            kind: 'startup-loan',
            label: 'Youth start loan',
            borrower: 'founder',
            minMonthsTrading: 0,
            minMonthlyRevenueUsd: 0,
            minStars: 0,
            minCreditScore: 30,
            amountUsd: [200, 6_000],
            spreadBps: 0,
            fixedRateBps: 800,
            termMonths: [12, 36],
            guarantee: 'none',
            pitch: 'A supportive start-up loan at 8% fixed, before revenue.',
          },
        ],
      },
      {
        id: 'umurenge',
        name: 'Umurenge Savings Cooperative',
        kind: 'microfinance',
        appetite: 1,
        look: look('#7cb518', '#5c4d7d', 'kiosk'),
        products: [
          {
            id: 'micro-loan',
            kind: 'working-capital',
            label: 'Cooperative loan',
            borrower: 'company',
            minMonthsTrading: 3,
            minMonthlyRevenueUsd: 100,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [50, 3_000],
            maxRevenueMultiple: 2,
            spreadBps: 1100,
            termMonths: [3, 12],
            guarantee: 'optional',
            pitch: 'Small loans from your local savings cooperative.',
          },
        ],
      },
    ],
    funds: [],
  },
  johannesburg: {
    sources: [
      'South African Reserve Bank repo rate and prime',
      'Banking Association South Africa SME lending data',
      'State development finance for small businesses (public terms)',
      'SAVCA venture capital survey',
    ],
    vcDepth: 0.4,
    angelDepth: 0.4,
    schemes: [
      {
        name: 'Small business development finance',
        effect: 'State agencies lend to small and black-owned businesses below bank rates.',
      },
    ],
    lenders: [
      {
        id: 'highveld',
        name: 'Highveld Union Bank',
        kind: 'high-street',
        appetite: 0.95,
        look: look('#003b49', '#ffb81c', 'columns'),
        products: [
          {
            id: 'overdraft',
            kind: 'overdraft',
            label: 'Business overdraft',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 3_000,
            minStars: 0.5,
            minCreditScore: 0,
            amountUsd: [1_000, 30_000],
            maxRevenueMultiple: 2,
            spreadBps: 650,
            termMonths: [3, 12],
            guarantee: 'optional',
            pitch: 'Prime plus a few points, once you have six months of sales.',
          },
          {
            id: 'working-capital',
            kind: 'working-capital',
            label: 'Business term loan',
            borrower: 'company',
            minMonthsTrading: 12,
            minMonthlyRevenueUsd: 5_000,
            minStars: 1,
            minCreditScore: 0,
            amountUsd: [5_000, 250_000],
            maxRevenueMultiple: 4,
            spreadBps: 550,
            termMonths: [12, 60],
            guarantee: 'required',
            pitch: 'A term loan for businesses with a year of books.',
          },
        ],
      },
      {
        id: 'jacaranda',
        name: 'Jacaranda Bank',
        kind: 'challenger',
        appetite: 1.15,
        look: look('#7b2cbf', '#e0aaff', 'glass'),
        products: [
          {
            id: 'flex-loan',
            kind: 'working-capital',
            label: 'Flexi business loan',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 2_000,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [1_000, 60_000],
            maxRevenueMultiple: 3,
            spreadBps: 900,
            termMonths: [6, 36],
            guarantee: 'optional',
            pitch: 'Apply on your phone, decision in a day.',
          },
        ],
      },
      {
        id: 'ubuntu-enterprise',
        name: 'Ubuntu Enterprise Finance',
        kind: 'development',
        appetite: 1,
        look: look('#007a4d', '#ffb612', 'tower'),
        products: [
          {
            id: 'sme-loan',
            kind: 'working-capital',
            label: 'Small enterprise loan',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 1_000,
            minStars: 0.5,
            minCreditScore: 0,
            amountUsd: [3_000, 100_000],
            maxRevenueMultiple: 5,
            spreadBps: 300,
            termMonths: [12, 60],
            guarantee: 'required',
            pitch: 'Development finance below bank rates, with your guarantee.',
          },
          {
            id: 'start-up-loan',
            kind: 'startup-loan',
            label: 'Start-up loan',
            borrower: 'founder',
            minMonthsTrading: 0,
            minMonthlyRevenueUsd: 0,
            minStars: 0,
            minCreditScore: 35,
            amountUsd: [300, 25_000],
            spreadBps: 0,
            fixedRateBps: 900,
            termMonths: [12, 60],
            guarantee: 'none',
            pitch: 'A state-backed personal loan to start, at 9% fixed.',
          },
        ],
      },
      {
        id: 'kwela',
        name: 'Kwela Capital',
        kind: 'fintech',
        appetite: 1.1,
        look: look('#ef476f', '#073b4c', 'glass'),
        products: [
          {
            id: 'revenue-based',
            kind: 'revenue-based',
            label: 'Revenue advance',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 8_000,
            minStars: 1,
            minCreditScore: 0,
            amountUsd: [10_000, 500_000],
            maxRevenueMultiple: 4,
            spreadBps: 0,
            termMonths: [6, 24],
            guarantee: 'none',
            revenueShareBps: 1000,
            repayCapBps: 11_200,
            pitch: 'Repay 10% of each month’s revenue until you’ve paid back 1.12×.',
          },
        ],
      },
    ],
    funds: [
      { name: 'Melville Koppies Seed', partner: 'Lerato Mokoena', kind: 'seed-vc', sectors: 'any' },
      { name: 'Braamfontein Angels', partner: 'Pieter van Wyk', kind: 'angels', sectors: 'any' },
    ],
  },
  cairo: {
    sources: [
      'Central Bank of Egypt overnight lending rate',
      'CBE SME lending initiative (public terms)',
      'Small enterprise development agency programmes (public terms)',
    ],
    vcDepth: 0.3,
    angelDepth: 0.25,
    schemes: [
      {
        name: 'SME lending quota',
        effect:
          'Banks must direct a share of lending to small businesses, so they will talk to you.',
      },
    ],
    lenders: [
      {
        id: 'nilestone',
        name: 'Nilestone Bank',
        kind: 'high-street',
        appetite: 0.9,
        look: look('#c8102e', '#d4af37', 'columns'),
        products: [
          {
            id: 'working-capital',
            kind: 'working-capital',
            label: 'SME loan',
            borrower: 'company',
            minMonthsTrading: 12,
            minMonthlyRevenueUsd: 2_000,
            minStars: 1,
            minCreditScore: 0,
            amountUsd: [2_000, 100_000],
            maxRevenueMultiple: 3,
            spreadBps: 300,
            termMonths: [6, 36],
            guarantee: 'required',
            pitch: 'A year of trading and your guarantee for a term loan.',
          },
        ],
      },
      {
        id: 'lotus-enterprise',
        name: 'Lotus Enterprise Agency',
        kind: 'development',
        appetite: 1,
        look: look('#1d3557', '#a8dadc', 'tower'),
        products: [
          {
            id: 'sme-loan',
            kind: 'working-capital',
            label: 'Small enterprise loan',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 500,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [1_000, 50_000],
            maxRevenueMultiple: 4,
            spreadBps: 0,
            fixedRateBps: 1200,
            termMonths: [12, 60],
            guarantee: 'required',
            pitch: 'A state-backed loan well below bank rates.',
          },
          {
            id: 'start-up-loan',
            kind: 'startup-loan',
            label: 'Start-up loan',
            borrower: 'founder',
            minMonthsTrading: 0,
            minMonthlyRevenueUsd: 0,
            minStars: 0,
            minCreditScore: 35,
            amountUsd: [200, 10_000],
            spreadBps: 0,
            fixedRateBps: 1000,
            termMonths: [12, 60],
            guarantee: 'none',
            pitch: 'A personal start-up loan at 10% fixed, before revenue.',
          },
        ],
      },
      {
        id: 'fustat',
        name: 'Fustat Microfinance',
        kind: 'microfinance',
        appetite: 1.1,
        look: look('#e9c46a', '#264653', 'kiosk'),
        products: [
          {
            id: 'micro-loan',
            kind: 'working-capital',
            label: 'Micro business loan',
            borrower: 'company',
            minMonthsTrading: 3,
            minMonthlyRevenueUsd: 150,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [100, 4_000],
            maxRevenueMultiple: 2,
            spreadBps: 1200,
            termMonths: [3, 12],
            guarantee: 'optional',
            pitch: 'Small loans for small shops and workshops.',
          },
        ],
      },
      {
        id: 'felucca',
        name: 'Felucca Credit',
        kind: 'fintech',
        appetite: 1.15,
        look: look('#3a86ff', '#ffbe0b', 'glass'),
        products: [
          {
            id: 'stock-finance',
            kind: 'working-capital',
            label: 'Buy-now-pay-later for business',
            borrower: 'company',
            minMonthsTrading: 3,
            minMonthlyRevenueUsd: 1_000,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [500, 20_000],
            maxRevenueMultiple: 2,
            spreadBps: 1200,
            termMonths: [3, 12],
            guarantee: 'none',
            pitch: 'Pay suppliers now, repay us over a few months.',
          },
        ],
      },
    ],
    funds: [
      { name: 'Zamalek Seed Fund', partner: 'Mariam Fawzy', kind: 'seed-vc', sectors: 'any' },
      { name: 'Maadi Angel Circle', partner: 'Karim Saleh', kind: 'angels', sectors: 'any' },
    ],
  },
  dubai: {
    sources: [
      'Central Bank of the UAE base rate',
      'UAE SME lending reports (public)',
      'Emirate SME development programmes (public terms)',
      'MAGNiTT venture funding reports',
    ],
    vcDepth: 0.5,
    angelDepth: 0.5,
    schemes: [
      {
        name: 'Free zones',
        effect: 'Zero or low corporate tax for qualifying companies; regional funds cluster here.',
      },
      {
        name: 'Founder visas',
        effect: 'Long-stay visas for founders and investors draw angels to the city.',
      },
    ],
    lenders: [
      {
        id: 'creekstone',
        name: 'Creekstone Bank',
        kind: 'high-street',
        appetite: 0.9,
        look: look('#00205b', '#c8a96e', 'tower'),
        products: [
          {
            id: 'working-capital',
            kind: 'working-capital',
            label: 'SME business loan',
            borrower: 'company',
            minMonthsTrading: 24,
            minMonthlyRevenueUsd: 15_000,
            minStars: 1.5,
            minCreditScore: 0,
            amountUsd: [25_000, 1_000_000],
            maxRevenueMultiple: 4,
            spreadBps: 500,
            termMonths: [12, 48],
            guarantee: 'required',
            pitch: 'Two years of audited books and a guarantee for a large facility.',
          },
          {
            id: 'overdraft',
            kind: 'overdraft',
            label: 'Business overdraft',
            borrower: 'company',
            minMonthsTrading: 12,
            minMonthlyRevenueUsd: 10_000,
            minStars: 1,
            minCreditScore: 0,
            amountUsd: [10_000, 250_000],
            maxRevenueMultiple: 2,
            spreadBps: 650,
            termMonths: [3, 12],
            guarantee: 'required',
            pitch: 'A working-capital line for established businesses.',
          },
        ],
      },
      {
        id: 'falcon-digital',
        name: 'Falcon Digital Bank',
        kind: 'challenger',
        appetite: 1.15,
        look: look('#0a9396', '#ee9b00', 'glass'),
        products: [
          {
            id: 'flex-loan',
            kind: 'working-capital',
            label: 'Digital business loan',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 5_000,
            minStars: 0.5,
            minCreditScore: 0,
            amountUsd: [5_000, 150_000],
            maxRevenueMultiple: 3,
            spreadBps: 900,
            termMonths: [6, 36],
            guarantee: 'optional',
            pitch: 'Six months of sales and an app, no branch visit.',
          },
        ],
      },
      {
        id: 'dhow-fund',
        name: 'Dhow Enterprise Fund',
        kind: 'government',
        appetite: 1,
        look: look('#9b2226', '#e9d8a6', 'shopfront'),
        products: [
          {
            id: 'start-up-loan',
            kind: 'startup-loan',
            label: 'Founder start-up loan',
            borrower: 'founder',
            minMonthsTrading: 0,
            minMonthlyRevenueUsd: 0,
            minStars: 0,
            minCreditScore: 45,
            amountUsd: [5_000, 80_000],
            spreadBps: 0,
            fixedRateBps: 300,
            termMonths: [12, 60],
            guarantee: 'none',
            pitch: 'A state loan at 3% fixed for founders with a clean record.',
          },
        ],
      },
      {
        id: 'sandline',
        name: 'Sandline Revenue Finance',
        kind: 'fintech',
        appetite: 1.1,
        look: look('#d4a373', '#3d405b', 'glass'),
        products: [
          {
            id: 'revenue-based',
            kind: 'revenue-based',
            label: 'Revenue-based finance',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 10_000,
            minStars: 1,
            minCreditScore: 0,
            amountUsd: [15_000, 750_000],
            maxRevenueMultiple: 4,
            spreadBps: 0,
            termMonths: [6, 24],
            guarantee: 'none',
            revenueShareBps: 800,
            repayCapBps: 11_000,
            pitch: 'Repay 8% of each month’s revenue until you’ve paid back 1.1×.',
          },
        ],
      },
    ],
    funds: [
      { name: 'Marina Seed Capital', partner: 'Omar Haddad', kind: 'seed-vc', sectors: 'any' },
      {
        name: 'Jumeirah Bridge Ventures',
        partner: 'Layla Mansour',
        kind: 'sector-vc',
        sectors: ['fintech', 'logistics', 'ecommerce'],
      },
      { name: 'Creekside Angels', partner: 'Rania Aziz', kind: 'angels', sectors: 'any' },
    ],
  },
  'san-francisco': {
    sources: [
      'Federal Reserve FOMC federal funds target range',
      'SBA 7(a) and Microloan program terms (sba.gov)',
      'IRC §1202 qualified small business stock (IRS)',
      'Federal Reserve Small Business Credit Survey',
      'PitchBook-NVCA Venture Monitor (public summaries)',
    ],
    // The deepest venture market in the game: more funds, bigger cheques.
    vcDepth: 1.6,
    angelDepth: 1.8,
    schemes: [
      {
        name: 'QSBS',
        effect:
          'Early shareholders in a qualifying C-corp can exclude most gains from federal tax, so angels write more first cheques.',
      },
      {
        name: 'SBA 7(a)',
        effect:
          'A federal guarantee on most of a bank loan, so lenders back young businesses for longer terms.',
      },
    ],
    lenders: [
      {
        id: 'golden-bay',
        name: 'Golden Bay Bank',
        kind: 'high-street',
        appetite: 1,
        look: look('#7a1f1f', '#e8c170', 'columns'),
        products: [
          {
            id: 'overdraft',
            kind: 'overdraft',
            label: 'Business line of credit',
            borrower: 'company',
            minMonthsTrading: 12,
            minMonthlyRevenueUsd: 10_000,
            minStars: 0.5,
            minCreditScore: 0,
            amountUsd: [10_000, 250_000],
            maxRevenueMultiple: 2,
            spreadBps: 500,
            termMonths: [3, 12],
            guarantee: 'optional',
            pitch: 'A revolving line for lumpy months once you have a year of sales.',
          },
          {
            id: 'working-capital',
            kind: 'working-capital',
            label: 'Business term loan',
            borrower: 'company',
            minMonthsTrading: 24,
            minMonthlyRevenueUsd: 25_000,
            minStars: 1.5,
            minCreditScore: 0,
            amountUsd: [50_000, 1_000_000],
            maxRevenueMultiple: 4,
            spreadBps: 400,
            termMonths: [12, 60],
            guarantee: 'required',
            pitch: 'Cheap money for established businesses with two years of books.',
          },
        ],
      },
      {
        id: 'pacific-crest',
        name: 'Pacific Crest Bank',
        kind: 'high-street',
        appetite: 0.9,
        look: look('#1d3557', '#a8dadc', 'tower'),
        products: [
          {
            id: 'working-capital',
            kind: 'working-capital',
            label: 'Small business loan',
            borrower: 'company',
            minMonthsTrading: 12,
            minMonthlyRevenueUsd: 15_000,
            minStars: 1,
            minCreditScore: 0,
            amountUsd: [25_000, 500_000],
            maxRevenueMultiple: 4,
            spreadBps: 450,
            termMonths: [12, 60],
            guarantee: 'optional',
            pitch: 'A term loan for growth after a year of trading.',
          },
        ],
      },
      {
        id: 'redwood-venture',
        name: 'Redwood Venture Bank',
        kind: 'challenger',
        appetite: 1.15,
        look: look('#2d6a4f', '#f1faee', 'glass'),
        products: [
          {
            id: 'venture-debt',
            kind: 'working-capital',
            label: 'Venture debt',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 5_000,
            minStars: 2,
            minCreditScore: 0,
            amountUsd: [100_000, 3_000_000],
            maxRevenueMultiple: 8,
            spreadBps: 450,
            termMonths: [12, 48],
            guarantee: 'none',
            pitch: 'Runway extension for venture-backed startups, sized to your last round.',
          },
        ],
      },
      {
        id: 'bridgeway-sba',
        name: 'Bridgeway Community Lending',
        kind: 'government',
        appetite: 1,
        look: look('#3a0ca3', '#f2c14e', 'shopfront'),
        products: [
          {
            id: 'sba-7a',
            kind: 'working-capital',
            label: 'SBA 7(a) loan',
            borrower: 'company',
            minMonthsTrading: 0,
            minMonthlyRevenueUsd: 0,
            minStars: 0.5,
            minCreditScore: 0,
            amountUsd: [25_000, 500_000],
            maxRevenueMultiple: 10,
            // Prime (≈ fed funds + 3%) plus the SBA's permitted spread.
            spreadBps: 600,
            termMonths: [24, 60],
            guarantee: 'required',
            pitch:
              'A federally guaranteed loan for young businesses, with your personal guarantee.',
          },
          {
            id: 'microloan',
            kind: 'startup-loan',
            label: 'SBA Microloan',
            borrower: 'founder',
            minMonthsTrading: 0,
            minMonthlyRevenueUsd: 0,
            minStars: 0,
            minCreditScore: 35,
            amountUsd: [500, 50_000],
            spreadBps: 0,
            fixedRateBps: 800,
            termMonths: [12, 60],
            guarantee: 'none',
            pitch: 'A small fixed-rate loan to get started, before you have revenue.',
          },
        ],
      },
      {
        id: 'clearwater',
        name: 'Clearwater Revenue Capital',
        kind: 'fintech',
        appetite: 1.1,
        look: look('#0077b6', '#caf0f8', 'glass'),
        products: [
          {
            id: 'revenue-based',
            kind: 'revenue-based',
            label: 'Revenue-based finance',
            borrower: 'company',
            minMonthsTrading: 6,
            minMonthlyRevenueUsd: 15_000,
            minStars: 1,
            minCreditScore: 0,
            amountUsd: [25_000, 2_000_000],
            maxRevenueMultiple: 5,
            spreadBps: 0,
            termMonths: [6, 24],
            guarantee: 'none',
            revenueShareBps: 800,
            repayCapBps: 11_000,
            pitch: 'Repay 8% of each month’s revenue until you’ve paid back 1.1×. No equity.',
          },
        ],
      },
      {
        id: 'swiftline',
        name: 'Swiftline Merchant Capital',
        kind: 'fintech',
        appetite: 1.25,
        look: look('#ff7b00', '#22223b', 'kiosk'),
        products: [
          {
            id: 'cash-advance',
            kind: 'revenue-based',
            label: 'Merchant cash advance',
            borrower: 'company',
            minMonthsTrading: 3,
            minMonthlyRevenueUsd: 5_000,
            minStars: 0,
            minCreditScore: 0,
            amountUsd: [5_000, 250_000],
            maxRevenueMultiple: 1.5,
            spreadBps: 0,
            termMonths: [3, 12],
            guarantee: 'none',
            revenueShareBps: 1_500,
            repayCapBps: 13_000,
            pitch: 'Cash tomorrow against your card sales: 15% of revenue until 1.3× is repaid.',
          },
        ],
      },
    ],
    funds: [
      { name: 'Hayes Valley Seed', partner: 'Nora Whitman', kind: 'seed-vc', sectors: 'any' },
      {
        name: 'Bayshore Fintech Partners',
        partner: 'Raj Malhotra',
        kind: 'sector-vc',
        sectors: ['fintech', 'saas'],
      },
      { name: 'Sand Ridge Growth', partner: 'Catherine Moore', kind: 'growth-vc', sectors: 'any' },
      { name: 'Crookedline Ventures', partner: 'Tyler Brooks', kind: 'seed-vc', sectors: 'any' },
      {
        name: 'Golden Hour Food & Climate',
        partner: 'Ana Morales',
        kind: 'sector-vc',
        sectors: ['agritech', 'logistics'],
      },
      { name: 'Valencia Street Angels', partner: 'Jordan Ellis', kind: 'angels', sectors: 'any' },
      {
        name: 'Nob Hill Angel Circle',
        partner: 'Margaret Huang',
        kind: 'angels',
        sectors: ['healthtech', 'edtech', 'saas'],
      },
      { name: 'Sunset District Angels', partner: 'Tom Nakamura', kind: 'angels', sectors: 'any' },
      {
        name: 'Castro Collective Angels',
        partner: 'Leo Martinez',
        kind: 'angels',
        sectors: ['ecommerce', 'fintech'],
      },
    ],
  },
};

/** Base cheque (USD, at depth 1), stages and bar for each extra-fund kind. */
export const EXTRA_FUND_KINDS: Record<
  ExtraFundSeed['kind'],
  {
    check: [number, number];
    stages: ('pre-seed' | 'seed' | 'series-a' | 'series-b')[];
    minStars: number;
    depth: 'vc' | 'angel';
  }
> = {
  'seed-vc': {
    check: [250_000, 2_500_000],
    stages: ['pre-seed', 'seed'],
    minStars: 0.5,
    depth: 'vc',
  },
  'sector-vc': {
    check: [1_000_000, 8_000_000],
    stages: ['seed', 'series-a'],
    minStars: 1.5,
    depth: 'vc',
  },
  'growth-vc': {
    check: [5_000_000, 30_000_000],
    stages: ['series-a', 'series-b'],
    minStars: 3,
    depth: 'vc',
  },
  angels: { check: [25_000, 300_000], stages: ['pre-seed'], minStars: 0, depth: 'angel' },
};

/**
 * Which extra funds open in a market: the count follows depth (about three
 * VC funds and two angel networks at London depth) and cheques scale with it.
 */
export function extraFunds(market: MarketId) {
  const p = CAPITAL[market];
  const vcCount = Math.round(p.vcDepth * 3);
  const angelCount = Math.round(p.angelDepth * 2);
  const vcs = p.funds.filter((f) => f.kind !== 'angels').slice(0, vcCount);
  const angels = p.funds.filter((f) => f.kind === 'angels').slice(0, angelCount);
  return [...vcs, ...angels].map((f) => {
    const k = EXTRA_FUND_KINDS[f.kind];
    const depth = k.depth === 'vc' ? p.vcDepth : p.angelDepth;
    const factor = 0.25 + 0.75 * depth;
    const round = (x: number) => Math.max(1_000, Math.round((x * factor) / 1_000) * 1_000);
    return {
      name: f.name,
      partner: f.partner,
      sectors: f.sectors,
      stages: k.stages,
      check: [round(k.check[0]), round(k.check[1])] as [number, number],
      minStars: k.minStars,
    };
  });
}

/** Names the name checker reserves for this market's lenders and extra funds. */
export const capitalNames = (market: MarketId): string[] => [
  ...CAPITAL[market].lenders.map((l) => l.name),
  ...CAPITAL[market].funds.map((f) => f.name),
];
