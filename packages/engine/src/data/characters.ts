/**
 * Backgrounds and lifestyle (§4). Six cards per role, each with clear
 * strengths and gaps.
 */
export const ROLES = ['founder', 'investor', 'banker'] as const;
export type Role = (typeof ROLES)[number];

export const SKILLS = [
  'product',
  'sales',
  'fundraising',
  'finance',
  'hiring',
  'leadership',
  'negotiation',
  'publicSpeaking',
  'investing',
  'risk',
] as const;
export type Skill = (typeof SKILLS)[number];
export type Skills = Record<Skill, number>;

export interface Background {
  id: string;
  role: Role;
  name: string;
  strengths: string;
  gaps: string;
  /** Skill levels 0–100 that differ from the baseline of 20. */
  skills: Partial<Skills>;
  /** Starting network size (contacts who take your call). */
  network: number;
  /**
   * Multiplier on starting personal runway (months of cost of living).
   * Investors start with more: angel investing is done from personal savings (§7).
   */
  savingsMultiplier: number;
  /** Extra hours per month (e.g. first-timers have the most hours). */
  hoursBonus: number;
  /** Starting public stars. */
  stars: number;
  /** Investors only: LP credibility 0–1 used when raising Fund I. */
  lpCredibility?: number;
  /** Investors only: founder trust 0–1. */
  founderTrust?: number;
}

export const BACKGROUNDS: readonly Background[] = [
  // Founders
  {
    id: 'f-engineer',
    role: 'founder',
    name: 'Ex-engineer',
    strengths: 'Builds fast, cheap product',
    gaps: 'Weak at sales and pitching',
    skills: { product: 60, sales: 10, fundraising: 15 },
    network: 20,
    savingsMultiplier: 1.1,
    hoursBonus: 0,
    stars: 1,
  },
  {
    id: 'f-banker',
    role: 'founder',
    name: 'Ex-banker',
    strengths: 'Finance and investor network',
    gaps: 'Product instincts',
    skills: { finance: 60, fundraising: 45, product: 10 },
    network: 40,
    savingsMultiplier: 1.6,
    hoursBonus: -10,
    stars: 1.2,
  },
  {
    id: 'f-dropout',
    role: 'founder',
    name: 'Dropout',
    strengths: 'Most hours, fearless',
    gaps: 'Lowest savings and credibility',
    skills: { product: 35, risk: 50, leadership: 10 },
    network: 10,
    savingsMultiplier: 0.5,
    hoursBonus: 30,
    stars: 0.6,
  },
  {
    id: 'f-consultant',
    role: 'founder',
    name: 'Consultant',
    strengths: 'Strategy, decks, corporate buyers',
    gaps: 'Has never shipped',
    skills: { sales: 40, publicSpeaking: 45, product: 10 },
    network: 35,
    savingsMultiplier: 1.3,
    hoursBonus: 0,
    stars: 1.1,
  },
  {
    id: 'f-second-time',
    role: 'founder',
    name: 'Second-time founder',
    strengths: 'Trusted by investors, knows the playbook',
    gaps: 'Expensive habits, fewer hours',
    skills: { fundraising: 55, hiring: 45, leadership: 45 },
    network: 45,
    savingsMultiplier: 1.4,
    hoursBonus: -15,
    stars: 1.8,
  },
  {
    id: 'f-corporate',
    role: 'founder',
    name: 'Corporate manager',
    strengths: 'Hiring, leadership, B2B buyers',
    gaps: 'Slow and risk-averse at the start',
    skills: { leadership: 50, hiring: 40, risk: 5 },
    network: 35,
    savingsMultiplier: 1.5,
    hoursBonus: -5,
    stars: 1,
  },
  // Investors (§4 table)
  {
    id: 'i-operator',
    role: 'investor',
    name: 'Ex-operator',
    strengths: 'Founder trust, portfolio support',
    gaps: 'Weaker LP credibility',
    skills: { product: 45, hiring: 40, investing: 30 },
    network: 35,
    savingsMultiplier: 6,
    hoursBonus: 0,
    stars: 1.2,
    lpCredibility: 0.35,
    founderTrust: 0.75,
  },
  {
    id: 'i-banker',
    role: 'investor',
    name: 'Ex-banker',
    strengths: 'LP credibility, financial skill',
    gaps: 'Weak product judgement, founder trust',
    skills: { finance: 60, investing: 40, product: 10 },
    network: 40,
    savingsMultiplier: 8,
    hoursBonus: -5,
    stars: 1.2,
    lpCredibility: 0.7,
    founderTrust: 0.35,
  },
  {
    id: 'i-consultant',
    role: 'investor',
    name: 'Ex-consultant',
    strengths: 'Analysis, strategy network',
    gaps: "Founders doubt they've built anything",
    skills: { investing: 35, risk: 40 },
    network: 40,
    savingsMultiplier: 6,
    hoursBonus: 0,
    stars: 1,
    lpCredibility: 0.5,
    founderTrust: 0.4,
  },
  {
    id: 'i-corporate',
    role: 'investor',
    name: 'Corporate executive',
    strengths: 'Industry and acquirer connections',
    gaps: 'Slow and risk-averse at the start',
    skills: { negotiation: 45, investing: 25, risk: 10 },
    network: 45,
    savingsMultiplier: 9,
    hoursBonus: -10,
    stars: 1.1,
    lpCredibility: 0.55,
    founderTrust: 0.45,
  },
  {
    id: 'i-exited',
    role: 'investor',
    name: 'Exited founder',
    strengths: 'High trust, strong deal flow',
    gaps: 'Small savings from a modest exit',
    skills: { product: 50, investing: 35, leadership: 40 },
    network: 50,
    savingsMultiplier: 5,
    hoursBonus: 0,
    stars: 1.8,
    lpCredibility: 0.45,
    founderTrust: 0.85,
  },
  {
    id: 'i-first',
    role: 'investor',
    name: 'First-timer',
    strengths: 'Most hours, no bad habits',
    gaps: 'Lowest credibility and savings',
    skills: { investing: 15 },
    network: 10,
    savingsMultiplier: 3,
    hoursBonus: 30,
    stars: 0.5,
    lpCredibility: 0.15,
    founderTrust: 0.3,
  },
  // Bankers (Phase 2 role; cards present so the picker can show them as "coming soon")
  {
    id: 'b-commercial',
    role: 'banker',
    name: 'Ex-commercial banker',
    strengths: 'Lending, deposits',
    gaps: 'Tech',
    skills: { finance: 60, risk: 50 },
    network: 40,
    savingsMultiplier: 2,
    hoursBonus: 0,
    stars: 1.2,
  },
  {
    id: 'b-regulator',
    role: 'banker',
    name: 'Ex-regulator',
    strengths: 'Licences, compliance',
    gaps: 'Sales',
    skills: { risk: 60, finance: 40 },
    network: 35,
    savingsMultiplier: 1.5,
    hoursBonus: 0,
    stars: 1.3,
  },
  {
    id: 'b-fintech',
    role: 'banker',
    name: 'Fintech founder',
    strengths: 'Product, digital channels',
    gaps: 'Risk discipline',
    skills: { product: 55, risk: 20 },
    network: 30,
    savingsMultiplier: 1.8,
    hoursBonus: 10,
    stars: 1.2,
  },
  {
    id: 'b-ib',
    role: 'banker',
    name: 'Ex-investment banker',
    strengths: 'Deals and advisory',
    gaps: 'Retail banking',
    skills: { negotiation: 55, finance: 50 },
    network: 45,
    savingsMultiplier: 2.5,
    hoursBonus: -10,
    stars: 1.3,
  },
  {
    id: 'b-microfinance',
    role: 'banker',
    name: 'Microfinance operator',
    strengths: 'Small loans at volume',
    gaps: 'Corporate clients',
    skills: { risk: 45, sales: 40 },
    network: 30,
    savingsMultiplier: 1.2,
    hoursBonus: 10,
    stars: 1.1,
  },
  {
    id: 'b-wealthy',
    role: 'banker',
    name: 'Wealthy exited founder',
    strengths: 'Capital to start a bank',
    gaps: 'Banking know-how',
    skills: { leadership: 45, product: 40 },
    network: 50,
    savingsMultiplier: 4,
    hoursBonus: 0,
    stars: 1.6,
  },
];

export const backgroundById = (id: string): Background | undefined =>
  BACKGROUNDS.find((b) => b.id === id);

export const PLAYABLE_ROLES: readonly Role[] = ['founder', 'investor'];

/** Months of personal runway every player starts with, before background adjustment (§3). */
export const STARTING_RUNWAY_MONTHS = 6;

/** Base hours per game month. Open question §21: tune in beta. */
export const BASE_HOURS = 200;

export interface LifestyleTier {
  tier: number;
  name: string;
  housing: string;
  transport: string;
  /** Monthly cost as a multiple of local cost of living. */
  costCol: number;
  /** Energy recovered per month. */
  recovery: number;
  /** Hours added (driver saves commute; shared flat costs some). */
  hours: number;
  /** How flashy this looks to investors and tabloids (0–1). */
  flash: number;
}

export const LIFESTYLE_TIERS: readonly LifestyleTier[] = [
  {
    tier: 1,
    name: 'Lean',
    housing: 'Shared flat',
    transport: 'Public transport',
    costCol: 0.7,
    recovery: 14,
    hours: -10,
    flash: 0,
  },
  {
    tier: 2,
    name: 'Modest',
    housing: 'Small flat',
    transport: 'Ride-hailing',
    costCol: 1,
    recovery: 20,
    hours: 0,
    flash: 0.1,
  },
  {
    tier: 3,
    name: 'Comfortable',
    housing: 'Good flat',
    transport: 'Own car',
    costCol: 1.8,
    recovery: 26,
    hours: 5,
    flash: 0.3,
  },
  {
    tier: 4,
    name: 'Affluent',
    housing: 'House',
    transport: 'Car and driver',
    costCol: 3.5,
    recovery: 30,
    hours: 12,
    flash: 0.65,
  },
  {
    tier: 5,
    name: 'Lavish',
    housing: 'Penthouse',
    transport: 'Driver, travel',
    costCol: 7,
    recovery: 32,
    hours: 15,
    flash: 1,
  },
];
