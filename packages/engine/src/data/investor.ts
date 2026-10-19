/**
 * The investor career (investor blueprint, §11.6 "Starting values"): every
 * number the ladder, the angel ceiling, syndicates, funds, LPs, the stock
 * market and the firm use, in one place, so `npm run sim` and playtests can
 * tune them without touching the rules. Money is in US dollars where it is
 * a size (converted per city), and in months of the player's living costs
 * where it is personal wealth.
 */
import type { Stage } from '../types.js';

export const INVESTOR = {
  /** The career ladder (§2.1). */
  ladder: {
    /** Rung 2, syndicate lead: angel deals and investor stars. */
    syndicateDeals: 2,
    syndicateStars: 2,
    /** Rung 3, emerging manager: deals (syndicates count) and the AI LP panel's score. */
    fundDeals: 3,
    fundScore: 0.42,
    /** Rung 5, established GP: Fund I's cash returned (DPI) and LPs who say they'd re-up. */
    fund2Dpi: 0.5,
    fund2Reups: 2,
    /** Rung 6, firm founder: funds run and people hired. */
    firmFunds: 2,
    firmHires: 1,
    /** Rung 7, allocator: liquid wealth in months of living costs, or a fund's DPI. */
    allocatorMonths: 60,
    allocatorDpi: 1,
  },
  /** Investment tracks that open with wealth (§2.2). */
  tracks: {
    /** Committing to other funds as an LP: liquid wealth in months of living costs. */
    lpMonths: 24,
  },
  /** The angel ceiling (§2.3) and the first-session cap (§3.1). */
  caps: {
    /** One personal cheque: at most this share of liquid net worth. */
    angelCheque: 0.1,
    /** The tutorial cheque: at most this share of investable savings. */
    tutorialCheque: 0.1,
    /** Personal money kept safe from investing: months of living costs. */
    reserveMonths: 6,
    /** Rounds at these stages need a fund or syndicate lead (no lone angel cheques). */
    leadStages: ['series-a', 'series-b', 'growth'] as readonly Stage[],
  },
  /** Penalties (§6.2, §7.3, §8). */
  penalties: {
    /** Missing a capital call: share of paid-in forfeited, credit points lost, months barred. */
    missedCallForfeit: 0.25,
    missedCallCredit: 50,
    missedCallBanMonths: 6,
    /** Founder trust lost for each pitch left unanswered by the end of its month. */
    ghostTrust: 0.05,
    /** LP panel score lost per write-off (existing rule). */
    writeOff: 0.02,
    /** Months before pitching the same LP again (existing rule). */
    lpCooldownMonths: 3,
  },
  /** Hours (§4.3). Diligence and the LP panel use the existing constants. */
  hours: {
    termSheet: 2,
    lpPanel: 15,
    claimCheck: 2,
    references: 6,
    scouting: 6,
    lpDiligence: 6,
    lpLetter: 3,
    support: 4,
    syndicate: 4,
    icMeeting: 2,
    crossBorder: 1.5,
  },
  /** Fund terms (§8.5). */
  fund: {
    feeRate: 0.02,
    /** The fee after the investment period. */
    feeStepDown: 0.015,
    carry: 0.2,
    hurdle: 0,
    /** GP commitment from personal savings, as a share of the fund. */
    gpCommit: [0.01, 0.02] as const,
    /** Compressed fund life in game months. */
    termMonths: 48,
    investMonths: 24,
    /** Months from first close to the final close. */
    finalCloseMonths: 6,
    /** First close needs this share of the target committed. */
    firstCloseShare: 0.5,
    /** A late LP pays this much a month on their commitment as catch-up to the fund. */
    catchUpMonthly: 0.005,
    /** Player LPs pay in over this many capital calls, one a quarter. */
    calls: 4,
    callEveryMonths: 3,
    /** Months an LP has to pay a call. */
    callDueMonths: 1,
    /** Deals above this share of the fund need investment committee approval. */
    icShare: 0.05,
    /** Target reserve ratio for follow-ons. */
    reserveRatio: 0.4,
    /** Months an extension adds after an LP vote. */
    extensionMonths: 12,
    /** Smallest player LP commitment (USD) unless the GP sets one. */
    minCommitUsd: 25_000,
    /** Anchor commitment offered by a development LP to a qualifying angel (USD). */
    anchorUsd: 500_000,
  },
  /** Syndicates (§8.1, Phase 3). */
  syndicate: {
    /** Deal-by-deal carry the lead may set. */
    carry: [0.15, 0.2] as const,
    /** Months the lead has to gather backers before the allocation closes. */
    openMonths: 1,
    /** Smallest backer allocation (USD). */
    minBackUsd: 2_000,
    /** Most backers on one syndicate. */
    maxBackers: 20,
    /** An AI co-investor who accepted a co-lead backs with this many times the lead's cheque. */
    coLeadMultiple: 1,
  },
  /** Public markets (§7.2, Phase 2). */
  exchange: {
    /** One order may take at most this share of the float a month. */
    depthShare: 0.1,
    /** Price impact per share of the float bought or sold. */
    impact: 0.5,
    /** The city index fund's yearly fee. */
    indexFeeYear: 0.005,
    /** Profitable listed companies pay this share of last month's profit as a dividend. */
    dividendShare: 0.3,
    /** Limit orders last this many months. */
    orderMonths: 3,
    /** Insiders are blacked out this many months before results (every month: the last week). */
    blackout: true,
  },
  /** The firm (§8.4, Phase 6). */
  firm: {
    /** Monthly salaries in months of living costs. */
    associateCol: 1.5,
    principalCol: 2.5,
    partnerCol: 4,
    /** Diligence hours an associate adds a month. */
    associateHours: 30,
    principalHours: 40,
    partnerHours: 50,
    /** Carry pool share a partner asks for. */
    partnerCarry: 0.2,
  },
  /** Reputation (§6.6, Phase 8). */
  reputation: {
    /** Founder trust moves. */
    fairTerms: 0.02,
    harshTerms: -0.04,
    passWithReason: 0.01,
    support: 0.02,
    /** Reviews: at most one per founder per deal; ratings 1–5. */
    reviewLimit: 1,
  },
  /** Outcome targets for seed companies (§11.2), checked by the simulator. */
  outcomes: {
    loseMost: [0.5, 0.65] as const,
    oneToThree: [0.2, 0.3] as const,
    threeToTen: [0.08, 0.15] as const,
    tenPlus: [0.02, 0.05] as const,
  },
} as const;

/** The eight rungs of the investor career (§2.1). */
export const RUNGS = [
  { n: 1, id: 'angel', title: 'Angel' },
  { n: 2, id: 'syndicate', title: 'Syndicate lead' },
  { n: 3, id: 'emerging', title: 'Emerging manager' },
  { n: 4, id: 'manager', title: 'Fund manager' },
  { n: 5, id: 'established', title: 'Established GP' },
  { n: 6, id: 'firm', title: 'Firm founder' },
  { n: 7, id: 'allocator', title: 'Allocator' },
  { n: 8, id: 'institution', title: 'Institution leader' },
] as const;
export type RungId = (typeof RUNGS)[number]['id'];

/** The investor glossary (Phase 0): plain words shown beside the numbers. */
export const GLOSSARY: Record<string, string> = {
  'dry-powder': 'Cash ready to invest: yours, or the fund’s.',
  aum: 'Assets under management: all the money LPs have committed to your funds.',
  mark: 'What a stake is worth on paper at the latest price. Not cash.',
  nav: 'Net asset value: the marks of everything a fund holds added up.',
  tvpi: 'Total value to paid-in: cash returned plus marks, per unit LPs paid in.',
  dpi: 'Distributions to paid-in: cash returned per unit LPs paid in. What LPs judge.',
  irr: 'The yearly return on the actual cash in and out, timing included.',
  moic: 'Multiple on invested capital: (cash back + mark) ÷ what went in.',
  'capital-call': 'A GP asks LPs to pay in part of what they committed.',
  'pro-rata': 'The right to keep your ownership by investing in the next round.',
  preference: 'Liquidation preference: who gets paid back first in a sale.',
  carry: 'Carried interest: the GP’s share of profits after LPs get their money back.',
  hurdle: 'A return LPs get before carry starts.',
  reserves: 'Money held back to follow on in your winners.',
  'valuation-cap': 'The highest valuation a SAFE converts at.',
  dilution: 'Your share shrinks when new shares are issued.',
};
