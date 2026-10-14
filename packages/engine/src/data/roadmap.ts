/**
 * The product roadmap's feature catalogue (blueprint §6.3, FR-006): what a
 * founder can choose to build, per industry. Every feature is a small
 * project with an effort (person-weeks), the skill it needs, an up-front cost
 * (tools and licences, as a fraction of the city's monthly cost of living), an
 * optional dependency, a risk (how likely it ships with bugs) and the effect
 * a release has on the product.
 *
 * Effects all feed the product metrics the customer simulation already reads
 * (fit, quality, tech debt, cost to serve), so customers react on their own.
 */
import type { Industry } from './industries.js';

export type FeatureSkill = 'eng' | 'design' | 'data';

/**
 * What a release does:
 * - fit: more people find it does what they need;
 * - quality: it works better (reliability);
 * - conversion: more trials turn into paying customers (fit and quality);
 * - pricing: customers value it more, so the price feels fairer (fit);
 * - retention: fewer customers leave (quality, less tech debt);
 * - efficiency: cheaper to serve each customer (cloud costs, tech debt);
 * - stability: pays down tech debt and fixes known bugs.
 */
export type FeatureEffectKind =
  'fit' | 'quality' | 'conversion' | 'pricing' | 'retention' | 'efficiency' | 'stability';

export interface FeatureDef {
  id: string;
  name: string;
  /** One line: what it is. */
  blurb: string;
  /** What a customer says when they ask for it (feedback inbox). */
  ask: string;
  /** Industries it suits; omitted = every industry. */
  industries?: Industry[];
  /** Person-weeks of work. */
  effortWeeks: number;
  skill: FeatureSkill;
  /** Up-front cost as a fraction of the local monthly cost of living. */
  costCol: number;
  /** Must be released first. */
  requires?: string;
  /** 0–1: how likely it ships with bugs. */
  risk: number;
  effect: { kind: FeatureEffectKind; size: number };
}

/** The bug-fix project a support incident suggests. */
export const BUG_BASH = 'bug-bash';

export const FEATURES: FeatureDef[] = [
  // ---- every industry
  {
    id: 'onboarding',
    name: 'Onboarding flow',
    blurb: 'A guided first five minutes so new users get value fast.',
    ask: 'I signed up but didn’t know where to start.',
    effortWeeks: 4,
    skill: 'design',
    costCol: 0.1,
    risk: 0.15,
    effect: { kind: 'conversion', size: 0.12 },
  },
  {
    id: 'mobile-app',
    name: 'Mobile app',
    blurb: 'A proper phone app instead of a mobile website.',
    ask: 'Can I use it on my phone?',
    effortWeeks: 10,
    skill: 'eng',
    costCol: 0.4,
    requires: 'onboarding',
    risk: 0.35,
    effect: { kind: 'fit', size: 0.15 },
  },
  {
    id: 'analytics',
    name: 'Analytics dashboard',
    blurb: 'Charts that show customers what they get from you.',
    ask: 'I wish I could see my numbers in one place.',
    effortWeeks: 6,
    skill: 'data',
    costCol: 0.2,
    risk: 0.2,
    effect: { kind: 'pricing', size: 0.1 },
  },
  {
    id: 'security-audit',
    name: 'Security audit',
    blurb: 'Outside experts test your defences; you fix what they find.',
    ask: 'Our IT team asked how you keep our data safe.',
    effortWeeks: 3,
    skill: 'eng',
    costCol: 0.8,
    risk: 0.05,
    effect: { kind: 'stability', size: 0.12 },
  },
  {
    id: BUG_BASH,
    name: 'Bug bash',
    blurb: 'A sprint fixing reported bugs instead of building new things.',
    ask: 'It crashed again when I tried to save.',
    effortWeeks: 2,
    skill: 'eng',
    costCol: 0,
    risk: 0,
    effect: { kind: 'stability', size: 0.08 },
  },
  {
    id: 'notifications',
    name: 'Smart notifications',
    blurb: 'Timely reminders that bring people back.',
    ask: 'I keep forgetting to check it.',
    effortWeeks: 3,
    skill: 'eng',
    costCol: 0.1,
    risk: 0.15,
    effect: { kind: 'retention', size: 0.1 },
  },
  {
    id: 'performance',
    name: 'Speed and cost tune-up',
    blurb: 'Faster pages and cheaper servers.',
    ask: 'It’s really slow on my connection.',
    effortWeeks: 4,
    skill: 'eng',
    costCol: 0.1,
    risk: 0.2,
    effect: { kind: 'efficiency', size: 0.15 },
  },
  // ---- fintech
  {
    id: 'payments',
    name: 'Payments integration',
    blurb: 'Pay and get paid by card, bank transfer and mobile money.',
    ask: 'Can I pay with mobile money?',
    industries: ['fintech', 'ecommerce', 'saas'],
    effortWeeks: 6,
    skill: 'eng',
    costCol: 0.5,
    risk: 0.3,
    effect: { kind: 'conversion', size: 0.15 },
  },
  {
    id: 'fraud-checks',
    name: 'Fraud checks',
    blurb: 'Spot suspicious payments before they cost anyone money.',
    ask: 'Someone tried to scam me through your app.',
    industries: ['fintech', 'ecommerce'],
    effortWeeks: 6,
    skill: 'data',
    costCol: 0.3,
    requires: 'payments',
    risk: 0.25,
    effect: { kind: 'retention', size: 0.12 },
  },
  {
    id: 'savings-goals',
    name: 'Savings goals',
    blurb: 'Let customers put money aside for something they want.',
    ask: 'I want to save a bit every week for school fees.',
    industries: ['fintech'],
    effortWeeks: 5,
    skill: 'design',
    costCol: 0.1,
    risk: 0.2,
    effect: { kind: 'fit', size: 0.12 },
  },
  // ---- e-commerce
  {
    id: 'search',
    name: 'Product search',
    blurb: 'Find any item in two taps.',
    ask: 'I couldn’t find what I was looking for.',
    industries: ['ecommerce', 'saas', 'edtech'],
    effortWeeks: 4,
    skill: 'eng',
    costCol: 0.1,
    risk: 0.15,
    effect: { kind: 'conversion', size: 0.1 },
  },
  {
    id: 'recommendations',
    name: 'Recommendations',
    blurb: '“You might also like”, based on what people buy.',
    ask: 'Show me things like what I bought last time.',
    industries: ['ecommerce', 'edtech'],
    effortWeeks: 7,
    skill: 'data',
    costCol: 0.3,
    requires: 'search',
    risk: 0.3,
    effect: { kind: 'pricing', size: 0.12 },
  },
  {
    id: 'loyalty',
    name: 'Loyalty rewards',
    blurb: 'Points that make regulars stay.',
    ask: 'Do I get anything for buying here every week?',
    industries: ['ecommerce', 'fintech'],
    effortWeeks: 4,
    skill: 'design',
    costCol: 0.2,
    risk: 0.15,
    effect: { kind: 'retention', size: 0.12 },
  },
  // ---- logistics
  {
    id: 'live-tracking',
    name: 'Live tracking',
    blurb: 'See where a delivery is on a map, in real time.',
    ask: 'Where is my package right now?',
    industries: ['logistics', 'ecommerce'],
    effortWeeks: 6,
    skill: 'eng',
    costCol: 0.4,
    risk: 0.3,
    effect: { kind: 'fit', size: 0.14 },
  },
  {
    id: 'route-optimiser',
    name: 'Route optimiser',
    blurb: 'Plan delivery routes that save fuel and time.',
    ask: 'Your riders keep taking the long way round.',
    industries: ['logistics'],
    effortWeeks: 8,
    skill: 'data',
    costCol: 0.3,
    requires: 'live-tracking',
    risk: 0.35,
    effect: { kind: 'efficiency', size: 0.2 },
  },
  {
    id: 'proof-of-delivery',
    name: 'Proof of delivery',
    blurb: 'Photo and signature on every drop-off.',
    ask: 'The rider says he delivered, but I never got it.',
    industries: ['logistics'],
    effortWeeks: 3,
    skill: 'eng',
    costCol: 0.1,
    risk: 0.1,
    effect: { kind: 'quality', size: 0.1 },
  },
  // ---- health
  {
    id: 'booking',
    name: 'Appointment booking',
    blurb: 'Book, move and cancel appointments without calling.',
    ask: 'I spent an hour on the phone trying to book.',
    industries: ['healthtech', 'edtech', 'saas'],
    effortWeeks: 5,
    skill: 'eng',
    costCol: 0.2,
    risk: 0.2,
    effect: { kind: 'conversion', size: 0.12 },
  },
  {
    id: 'telehealth',
    name: 'Video consultations',
    blurb: 'See a clinician by video from home.',
    ask: 'Can I talk to someone without travelling?',
    industries: ['healthtech'],
    effortWeeks: 9,
    skill: 'eng',
    costCol: 0.6,
    requires: 'booking',
    risk: 0.35,
    effect: { kind: 'fit', size: 0.16 },
  },
  {
    id: 'records',
    name: 'Secure records',
    blurb: 'Patient records stored safely and shared with consent.',
    ask: 'My doctor couldn’t see my last test results.',
    industries: ['healthtech'],
    effortWeeks: 6,
    skill: 'data',
    costCol: 0.4,
    risk: 0.25,
    effect: { kind: 'quality', size: 0.12 },
  },
  // ---- education
  {
    id: 'offline-mode',
    name: 'Offline mode',
    blurb: 'Keep working without data; it syncs when you’re back online.',
    ask: 'It stops working when my data runs out.',
    industries: ['edtech', 'agritech', 'healthtech', 'logistics'],
    effortWeeks: 7,
    skill: 'eng',
    costCol: 0.2,
    risk: 0.3,
    effect: { kind: 'fit', size: 0.14 },
  },
  {
    id: 'progress-reports',
    name: 'Progress reports',
    blurb: 'Weekly reports for learners and parents.',
    ask: 'As a parent, I want to see how my child is doing.',
    industries: ['edtech'],
    effortWeeks: 4,
    skill: 'data',
    costCol: 0.1,
    risk: 0.15,
    effect: { kind: 'retention', size: 0.12 },
  },
  {
    id: 'quizzes',
    name: 'Practice quizzes',
    blurb: 'Short quizzes that make lessons stick.',
    ask: 'I want to test myself before the exam.',
    industries: ['edtech'],
    effortWeeks: 3,
    skill: 'design',
    costCol: 0.05,
    risk: 0.1,
    effect: { kind: 'fit', size: 0.1 },
  },
  // ---- business software
  {
    id: 'integrations',
    name: 'Integrations',
    blurb: 'Connect to the accounting and chat tools customers already use.',
    ask: 'Does it connect to our accounting software?',
    industries: ['saas', 'logistics'],
    effortWeeks: 6,
    skill: 'eng',
    costCol: 0.3,
    risk: 0.25,
    effect: { kind: 'pricing', size: 0.12 },
  },
  {
    id: 'team-accounts',
    name: 'Team accounts',
    blurb: 'Several people from one business sharing one account.',
    ask: 'Can my whole team log in?',
    industries: ['saas', 'fintech'],
    effortWeeks: 5,
    skill: 'eng',
    costCol: 0.1,
    requires: 'onboarding',
    risk: 0.2,
    effect: { kind: 'pricing', size: 0.14 },
  },
  // ---- agriculture
  {
    id: 'sms-alerts',
    name: 'SMS alerts',
    blurb: 'Text messages that reach farmers on any phone.',
    ask: 'Many of us don’t have smartphones. Can you send texts?',
    industries: ['agritech', 'healthtech'],
    effortWeeks: 3,
    skill: 'eng',
    costCol: 0.2,
    risk: 0.1,
    effect: { kind: 'fit', size: 0.12 },
  },
  {
    id: 'weather-insights',
    name: 'Weather and price insights',
    blurb: 'Local weather and market prices to plan planting and selling.',
    ask: 'When is the best time to sell my maize?',
    industries: ['agritech'],
    effortWeeks: 6,
    skill: 'data',
    costCol: 0.3,
    requires: 'sms-alerts',
    risk: 0.25,
    effect: { kind: 'pricing', size: 0.12 },
  },
  {
    id: 'cooperative',
    name: 'Cooperative accounts',
    blurb: 'One account for a whole farmers’ group.',
    ask: 'Our cooperative wants to sign up together.',
    industries: ['agritech'],
    effortWeeks: 5,
    skill: 'design',
    costCol: 0.1,
    risk: 0.2,
    effect: { kind: 'conversion', size: 0.12 },
  },
];

const BY_ID = new Map(FEATURES.map((f) => [f.id, f]));

export const featureById = (id: string): FeatureDef | undefined => BY_ID.get(id);

/** The catalogue for one industry: the shared features plus its own. */
export const featuresFor = (industry: Industry): FeatureDef[] =>
  FEATURES.filter((f) => !f.industries || f.industries.includes(industry));
