/**
 * Something to do in every building (player feedback: "buildings where
 * nothing happens"). Feedback-note worlds only; errands.ts runs them.
 *
 * - Errands at businesses that had nothing but shifts (a grocer, a pharmacy,
 *   a mechanic, a warehouse…), at one-item services (waiting customers to
 *   talk to), at showrooms (a test drive) and at the professional employers
 *   (a lawyer for your papers, meeting the team).
 * - Errands at the city's own spots: the newsstand (a paper with a tip in
 *   it), the airport's business lounge, your office's morning stand-up and
 *   the capital programmes' offices.
 * - What the civic places do besides (places.ts `place.use`, data/places.ts
 *   `more`): the cases, tax questions and public consultations they draw on
 *   are here.
 *
 * Amounts are in cost-of-living units, so an errand costs about the same
 * share of a month's living everywhere.
 */
import type { Industry } from './industries.js';

export const ERRAND_IDS = [
  // Businesses
  'groceries',
  'clothes',
  'medicine',
  'car-service',
  'prototype',
  'course',
  'storage',
  'ship-stock',
  'lawyer',
  'meet-team',
  'chat',
  'test-drive',
  // The city's spots
  'paper',
  'lounge',
  'standup',
  'office-hours',
  'cohort',
  'rehearsal',
] as const;
export type ErrandId = (typeof ERRAND_IDS)[number];

/** Who pays an errand's fee: you, or your company (materials, storage, a lawyer). */
export type ErrandPayer = 'you' | 'company';

export interface ErrandSpec {
  /** Translatable. */
  label: string;
  /** Founder hours it takes. */
  hours: number;
  /** Fee in cost-of-living units (0 = free; clothes: the item's own price). */
  feeCol: number;
  paidBy: ErrandPayer;
  /** How often: once a game day, once a month, or as often as you like. */
  once: 'day' | 'month' | null;
}

export const ERRAND_SPECS: Record<ErrandId, ErrandSpec> = {
  groceries: { label: 'Buy food for the week', hours: 0, feeCol: 0.03, paidBy: 'you', once: null },
  clothes: { label: 'Buy clothes', hours: 0, feeCol: 0, paidBy: 'you', once: null },
  medicine: { label: 'Buy medicine', hours: 0, feeCol: 0.015, paidBy: 'you', once: 'day' },
  'car-service': {
    label: 'Service your car',
    hours: 1,
    feeCol: 0.04,
    paidBy: 'you',
    once: 'month',
  },
  prototype: {
    label: 'Build a prototype in the workshop',
    hours: 6,
    feeCol: 0.12,
    paidBy: 'company',
    once: 'month',
  },
  course: { label: 'Take a course', hours: 8, feeCol: 0.06, paidBy: 'you', once: 'month' },
  storage: {
    label: 'Rent storage space',
    hours: 1,
    feeCol: 0.08,
    paidBy: 'company',
    once: 'month',
  },
  'ship-stock': {
    label: 'Ship stock to customers',
    hours: 2,
    feeCol: 0.05,
    paidBy: 'company',
    once: 'month',
  },
  // The fee is the papers' own cost (the compliance rule's), paid to the firm.
  lawyer: {
    label: 'Book a lawyer for company papers',
    hours: 2,
    feeCol: 0,
    paidBy: 'company',
    once: 'month',
  },
  'meet-team': { label: 'Meet the team', hours: 1, feeCol: 0, paidBy: 'you', once: 'month' },
  chat: {
    label: 'Chat to the customers waiting',
    hours: 1,
    feeCol: 0,
    paidBy: 'you',
    once: 'day',
  },
  'test-drive': { label: 'Take a test drive', hours: 1, feeCol: 0, paidBy: 'you', once: 'day' },
  paper: { label: 'Buy a paper', hours: 0, feeCol: 0.002, paidBy: 'you', once: 'day' },
  lounge: {
    label: 'Business lounge: meet travelling investors',
    hours: 2,
    feeCol: 0.05,
    paidBy: 'you',
    once: 'month',
  },
  standup: { label: 'Morning stand-up', hours: 1, feeCol: 0, paidBy: 'you', once: 'day' },
  'office-hours': {
    label: 'Office hours with the programme lead',
    hours: 2,
    feeCol: 0,
    paidBy: 'you',
    once: 'month',
  },
  cohort: {
    label: 'Meet the cohort at their desks',
    hours: 1,
    feeCol: 0,
    paidBy: 'you',
    once: 'month',
  },
  rehearsal: { label: 'Demo-day rehearsal', hours: 3, feeCol: 0, paidBy: 'you', once: 'month' },
};

/** The errands each business kind offers. */
export const KIND_ERRANDS: Record<string, readonly ErrandId[]> = {
  grocer: ['groceries'],
  'market-stall': ['groceries'],
  'corner-shop': ['groceries', 'chat'],
  boutique: ['clothes'],
  'fabric-stall': ['clothes'],
  'souk-stall': ['clothes'],
  pharmacy: ['medicine'],
  mechanic: ['car-service', 'prototype'],
  workshop: ['prototype'],
  'builders-merchant': ['prototype'],
  tutoring: ['course'],
  school: ['course'],
  'courier-depot': ['ship-stock'],
  'transport-depot': ['ship-stock'],
  warehouse: ['storage'],
  'cold-store': ['storage'],
  'employer-law': ['lawyer', 'meet-team'],
  'employer-engineering': ['meet-team'],
  'employer-consultancy': ['meet-team'],
  'employer-hospital': ['meet-team'],
  // One-item services: customers waiting their turn.
  salon: ['chat'],
  barber: ['chat'],
  laundry: ['chat'],
  tailor: ['chat'],
  'print-shop': ['chat'],
  'phone-repair': ['chat'],
  'bike-shop': ['chat'],
  clinic: ['chat'],
  dentist: ['chat'],
  bootcamp: ['chat'],
  // Showrooms: a salesperson and other shoppers.
  'car-dealer': ['test-drive', 'chat'],
  'car-dealership': ['test-drive', 'chat'],
  'furniture-store': ['chat'],
  'appliance-store': ['chat'],
  electronics: ['chat'],
};

/** The city's own spots (places on the map that aren't businesses). */
export const SPOTS = ['newsstand', 'airport', 'office', 'capital'] as const;
export type Spot = (typeof SPOTS)[number];

export const SPOT_ERRANDS: Record<Spot, readonly ErrandId[]> = {
  newsstand: ['paper'],
  airport: ['lounge'],
  office: ['standup'],
  // Accelerators, development partners and LPs; a rehearsal only at an accelerator.
  capital: ['office-hours', 'cohort', 'rehearsal'],
};

/** The stand-up's focus for the day. */
export const STANDUP_FOCUS = ['build', 'sell', 'team'] as const;
export type StandupFocus = (typeof STANDUP_FOCUS)[number];

/** Clothes each stall or shop sells: a mall item (data/mall.ts) in the shop's colour. */
export const CLOTHES: Record<string, readonly { item: string; colour: string }[]> = {
  boutique: [
    { item: 'top-shirt', colour: '#f5f5f5' },
    { item: 'top-dress', colour: '#ad1457' },
    { item: 'top-blazer', colour: '#263238' },
  ],
  'fabric-stall': [
    { item: 'top-kaftan', colour: '#7b1fa2' },
    { item: 'top-dress', colour: '#f9a825' },
  ],
  'souk-stall': [
    { item: 'top-kaftan', colour: '#a1887f' },
    { item: 'top-shirt', colour: '#00838f' },
  ],
};

/** Industries that ship physical things (storage and shipping help them). */
export const GOODS_INDUSTRIES: readonly Industry[] = [
  'ecommerce',
  'agritech',
  'logistics',
  'healthtech',
];

/** Every number in one place. */
export const ERRANDS = {
  /** Food for the week: hunger filled, a little energy. */
  groceries: { hunger: 40, energy: 5 },
  /** Not hungry: at or above this, food can wait. */
  fullHunger: 95,
  /** Clothes are fun to buy. */
  clothesFun: 4,
  /** Medicine: when your health is under this. */
  unwell: 85,
  medicine: { health: 8, stress: -2 },
  /** A serviced car: one worry less. */
  carStress: -4,
  /** Workshop hours a prototype adds to the company's build (beside your own). */
  prototypeBuild: 12,
  /** Skill points from a course, office hours or a rehearsal (up to the jobs' skill cap). */
  skill: 2,
  /** Product quality from storage or shipping, for a company that ships things. */
  fulfilment: 0.01,
  /** Discovery a chat with waiting customers adds (share of what's left to learn). */
  chatDiscovery: 0.1,
  chatSocial: 6,
  testDrive: { fun: 8, stress: -2 },
  /** Contacts: the warmth of someone you met on an errand. */
  warmth: 0.3,
  investorWarmth: 0.35,
  /** Network from meeting the team, the lounge, the cohort. */
  network: 1,
  /** The stand-up: build hours per person on the team (capped), and the team focus. */
  standupBuild: 2,
  standupBuildMax: 12,
  standupStress: -4,
} as const;

/**
 * What's in the paper: one rumour a day for anyone without a lead to chase.
 * Translatable (the client words them with `tx`).
 */
export const PAPER_TIPS: readonly string[] = [
  'The business pages say the central bank may cut rates next quarter: borrowers are watching.',
  'A columnist says the city’s market traders are moving to mobile money faster than the banks expected.',
  'Word in the property section: offices near the new rail line are filling up.',
  'The small ads are full of shops looking for someone to fix their websites.',
  'A profile of a founder who sold her company says she asked every customer the same three questions.',
  'The paper says two big funds are raising new money to invest in the region this year.',
];

/** A commercial case at the High Court: who won, why, and the contract lesson. */
export interface CourtCase {
  id: string;
  /** Translatable. */
  title: string;
  ruling: string;
  lesson: string;
}

export const COURT_CASES: readonly CourtCase[] = [
  {
    id: 'unsigned-change',
    title: 'A software supplier against a retailer over unpaid invoices',
    ruling:
      'The supplier lost: the retailer had asked for the extra work by phone and never signed a change order, so the court held the price was the one in the contract.',
    lesson: 'Put every change to the scope in writing, with its price, before you do the work.',
  },
  {
    id: 'vesting',
    title: 'A co-founder who left after four months claimed a third of the company',
    ruling:
      'The company won: the founders’ agreement had a one-year cliff, so the departing founder kept no shares.',
    lesson: 'Founders’ shares should vest, with a cliff, from the first day.',
  },
  {
    id: 'late-delivery',
    title: 'A restaurant chain against a farm co-operative over late deliveries',
    ruling:
      'The co-operative won: the contract promised “best efforts”, not a date, and the floods were outside its control.',
    lesson: 'If a date matters to you, write the date and what happens if it’s missed.',
  },
  {
    id: 'non-compete',
    title: 'A logistics firm tried to stop a former manager working for a rival',
    ruling:
      'The manager won: a five-year ban on working anywhere in the country was wider than the court would enforce.',
    lesson: 'A restraint has to be reasonable in time and place, or it may not hold at all.',
  },
  {
    id: 'personal-guarantee',
    title: 'A bank against a founder after her company failed to repay a loan',
    ruling:
      'The bank won: the founder had signed a personal guarantee, so her own savings answered for the company’s debt.',
    lesson: 'Read what a guarantee puts at risk before you sign it: it reaches past the company.',
  },
  {
    id: 'ip-assignment',
    title: 'A freelancer claimed the code he wrote for a startup',
    ruling:
      'The freelancer won: nothing in his contract assigned the work to the company, so he still owned it.',
    lesson: 'Make sure every contractor’s agreement assigns what they make to the company.',
  },
];

/** A question at the Tax Office's clinic, and the answer. Translatable. */
export const TAX_QA: readonly { q: string; a: string }[] = [
  {
    q: 'Do I pay company tax before we make a profit?',
    a: 'Company tax is on profit, so a company that loses money pays none that year, but it still files a return.',
  },
  {
    q: 'Can I pay myself from the company account whenever I like?',
    a: 'Take a salary through payroll or a dividend from profit: money taken any other way is a loan from the company and may be taxed.',
  },
  {
    q: 'Is the cost of my laptop deductible?',
    a: 'Equipment bought for the business is a cost of the business: keep the receipt and put it in the company’s books.',
  },
  {
    q: 'What happens if I file late?',
    a: 'A late return brings a penalty and interest on what’s owed, even when the tax itself is small: file on time, even if you can’t pay yet.',
  },
  {
    q: 'Do I charge sales tax to customers in another country?',
    a: 'Exports are usually zero-rated, but you still keep the invoices to show the goods or services left the country.',
  },
  {
    q: 'Should a new hire be a contractor or an employee?',
    a: 'If you set their hours and they work only for you, they are an employee in the tax office’s eyes, whatever the contract says.',
  },
];

/** A public consultation at the Ministry of Finance: a tax change to vote on. Translatable. */
export const CONSULTATIONS: readonly { id: string; proposal: string }[] = [
  {
    id: 'sme-rate',
    proposal:
      'Cut company tax for small businesses (turnover under a set threshold) by two points.',
  },
  {
    id: 'digital-tax',
    proposal: 'A new tax of one percent on digital services sold in the country.',
  },
  {
    id: 'startup-relief',
    proposal: 'Tax relief for people who invest in young companies, up to a yearly cap.',
  },
  {
    id: 'mobile-levy',
    proposal: 'A small levy on every mobile money transfer, to fund roads.',
  },
];
