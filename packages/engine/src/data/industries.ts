/**
 * Industries and customer segment templates (§6).
 *
 * Segments are sized bottom-up from market demographics:
 *   buyers = demographic base × digital adoption × share,
 *   budget = fraction of local cost of living per month.
 * so the same template yields very different markets in Lagos and London.
 */
import type { MarketId } from './markets.js';

export const INDUSTRIES = [
  'fintech',
  'ecommerce',
  'logistics',
  'healthtech',
  'edtech',
  'saas',
  'agritech',
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const INDUSTRY_LABEL: Record<Industry, string> = {
  fintech: 'Fintech',
  ecommerce: 'E-commerce',
  logistics: 'Logistics',
  healthtech: 'Health',
  edtech: 'Education',
  saas: 'Business software',
  agritech: 'Agriculture',
};

export type SegmentKind = 'b2c' | 'b2b';
export type DemographicBase = 'adults' | 'microBusinesses' | 'smes' | 'midsize';

/** How much each factor matters to this segment. Normalised at use. */
export interface NeedWeights {
  fit: number;
  price: number;
  stars: number;
  reliability: number;
}

export interface SegmentTemplate {
  key: string;
  industry: Industry;
  name: string;
  kind: SegmentKind;
  base: DemographicBase;
  /** Fraction of the base that could plausibly buy. Overridable per market. */
  share: number;
  shareByMarket?: Partial<Record<MarketId, number>>;
  /** Monthly budget per buyer as a fraction of local monthly cost of living. */
  budgetCol: number;
  needs: NeedWeights;
  needsLabel: string;
  /** 0–1: how hard it is to leave a current provider. */
  switchingCost: number;
  /** Minimum company stars this segment will consider (0–5). */
  trustThreshold: number;
  /** Fraction of buyers already served by the AI incumbent. */
  incumbentShare: number;
  /** Incumbent's quality score 0–1 (reach but slow, weaker product). */
  incumbentScore: number;
  /** Real monthly growth of the segment. */
  monthlyGrowth: number;
  /** B2B sales cycle in game months [min, max]; 0 for B2C. */
  salesCycle: [number, number];
}

const t = (s: SegmentTemplate) => s;

export const SEGMENT_TEMPLATES: readonly SegmentTemplate[] = [
  // Fintech
  t({
    key: 'fintech.traders',
    industry: 'fintech',
    name: 'Market traders',
    kind: 'b2c',
    base: 'microBusinesses',
    share: 0.5,
    budgetCol: 0.015,
    needs: { fit: 0.25, price: 0.4, stars: 0.1, reliability: 0.25 },
    needsLabel: 'Low fees, works offline, local language',
    switchingCost: 0.25,
    trustThreshold: 1,
    incumbentShare: 0.35,
    incumbentScore: 0.45,
    monthlyGrowth: 0.004,
    salesCycle: [0, 0],
  }),
  t({
    key: 'fintech.online-sellers',
    industry: 'fintech',
    name: 'Online sellers',
    kind: 'b2c',
    base: 'smes',
    share: 0.35,
    budgetCol: 0.12,
    needs: { fit: 0.35, price: 0.25, stars: 0.15, reliability: 0.25 },
    needsLabel: 'Fast payouts, reliability, easy checkout',
    switchingCost: 0.35,
    trustThreshold: 1.5,
    incumbentShare: 0.45,
    incumbentScore: 0.5,
    monthlyGrowth: 0.008,
    salesCycle: [0, 0],
  }),
  t({
    key: 'fintech.distributors',
    industry: 'fintech',
    name: 'Mid-size distributors',
    kind: 'b2b',
    base: 'midsize',
    share: 0.5,
    budgetCol: 1.5,
    needs: { fit: 0.3, price: 0.15, stars: 0.25, reliability: 0.3 },
    needsLabel: 'Reliability, reconciliation, a known brand',
    switchingCost: 0.6,
    trustThreshold: 2.5,
    incumbentShare: 0.6,
    incumbentScore: 0.5,
    monthlyGrowth: 0.003,
    salesCycle: [3, 6],
  }),
  // E-commerce
  t({
    key: 'ecommerce.urban',
    industry: 'ecommerce',
    name: 'Urban shoppers',
    kind: 'b2c',
    base: 'adults',
    share: 0.3,
    budgetCol: 0.03,
    needs: { fit: 0.3, price: 0.4, stars: 0.15, reliability: 0.15 },
    needsLabel: 'Price, delivery speed, trust',
    switchingCost: 0.1,
    trustThreshold: 1,
    incumbentShare: 0.4,
    incumbentScore: 0.5,
    monthlyGrowth: 0.006,
    salesCycle: [0, 0],
  }),
  t({
    key: 'ecommerce.retailers',
    industry: 'ecommerce',
    name: 'Small retailers (restock)',
    kind: 'b2c',
    base: 'microBusinesses',
    share: 0.2,
    budgetCol: 0.05,
    needs: { fit: 0.35, price: 0.35, stars: 0.1, reliability: 0.2 },
    needsLabel: 'Credit terms, price, reliable restock',
    switchingCost: 0.3,
    trustThreshold: 1,
    incumbentShare: 0.25,
    incumbentScore: 0.45,
    monthlyGrowth: 0.005,
    salesCycle: [0, 0],
  }),
  t({
    key: 'ecommerce.brands',
    industry: 'ecommerce',
    name: 'Consumer brands',
    kind: 'b2b',
    base: 'midsize',
    share: 0.15,
    budgetCol: 2,
    needs: { fit: 0.35, price: 0.2, stars: 0.25, reliability: 0.2 },
    needsLabel: 'Reach, data, brand safety',
    switchingCost: 0.4,
    trustThreshold: 2.5,
    incumbentShare: 0.5,
    incumbentScore: 0.55,
    monthlyGrowth: 0.004,
    salesCycle: [3, 5],
  }),
  // Logistics
  t({
    key: 'logistics.sellers',
    industry: 'logistics',
    name: 'Online sellers (delivery)',
    kind: 'b2c',
    base: 'smes',
    share: 0.4,
    budgetCol: 0.15,
    needs: { fit: 0.25, price: 0.35, stars: 0.1, reliability: 0.3 },
    needsLabel: 'On-time delivery, price, tracking',
    switchingCost: 0.2,
    trustThreshold: 1,
    incumbentShare: 0.4,
    incumbentScore: 0.45,
    monthlyGrowth: 0.007,
    salesCycle: [0, 0],
  }),
  t({
    key: 'logistics.retailers',
    industry: 'logistics',
    name: 'Small retailers',
    kind: 'b2c',
    base: 'microBusinesses',
    share: 0.15,
    budgetCol: 0.04,
    needs: { fit: 0.25, price: 0.45, stars: 0.05, reliability: 0.25 },
    needsLabel: 'Cheap, predictable pickups',
    switchingCost: 0.15,
    trustThreshold: 0.5,
    incumbentShare: 0.2,
    incumbentScore: 0.4,
    monthlyGrowth: 0.004,
    salesCycle: [0, 0],
  }),
  t({
    key: 'logistics.shippers',
    industry: 'logistics',
    name: 'Enterprise shippers',
    kind: 'b2b',
    base: 'midsize',
    share: 0.35,
    budgetCol: 4,
    needs: { fit: 0.25, price: 0.2, stars: 0.2, reliability: 0.35 },
    needsLabel: 'Reliability, coverage, contracts',
    switchingCost: 0.55,
    trustThreshold: 3,
    incumbentShare: 0.65,
    incumbentScore: 0.5,
    monthlyGrowth: 0.003,
    salesCycle: [4, 9],
  }),
  // Health
  t({
    key: 'healthtech.families',
    industry: 'healthtech',
    name: 'Families (telehealth)',
    kind: 'b2c',
    base: 'adults',
    share: 0.12,
    budgetCol: 0.02,
    needs: { fit: 0.3, price: 0.3, stars: 0.25, reliability: 0.15 },
    needsLabel: 'Trust, price, doctors available',
    switchingCost: 0.25,
    trustThreshold: 2,
    incumbentShare: 0.2,
    incumbentScore: 0.45,
    monthlyGrowth: 0.006,
    salesCycle: [0, 0],
  }),
  t({
    key: 'healthtech.clinics',
    industry: 'healthtech',
    name: 'Private clinics',
    kind: 'b2b',
    base: 'smes',
    share: 0.06,
    budgetCol: 0.6,
    needs: { fit: 0.4, price: 0.2, stars: 0.2, reliability: 0.2 },
    needsLabel: 'Records, billing, data protection',
    switchingCost: 0.6,
    trustThreshold: 2,
    incumbentShare: 0.3,
    incumbentScore: 0.45,
    monthlyGrowth: 0.004,
    salesCycle: [2, 4],
  }),
  t({
    key: 'healthtech.employers',
    industry: 'healthtech',
    name: 'Employers (staff health)',
    kind: 'b2b',
    base: 'midsize',
    share: 0.2,
    budgetCol: 2.5,
    needs: { fit: 0.3, price: 0.25, stars: 0.3, reliability: 0.15 },
    needsLabel: 'Cost per employee, trusted brand',
    switchingCost: 0.5,
    trustThreshold: 3,
    incumbentShare: 0.55,
    incumbentScore: 0.5,
    monthlyGrowth: 0.003,
    salesCycle: [4, 8],
  }),
  // Education
  t({
    key: 'edtech.parents',
    industry: 'edtech',
    name: 'Parents and students',
    kind: 'b2c',
    base: 'adults',
    share: 0.15,
    budgetCol: 0.015,
    needs: { fit: 0.4, price: 0.35, stars: 0.15, reliability: 0.1 },
    needsLabel: 'Exam results, price, works on cheap phones',
    switchingCost: 0.15,
    trustThreshold: 1,
    incumbentShare: 0.2,
    incumbentScore: 0.4,
    monthlyGrowth: 0.005,
    salesCycle: [0, 0],
  }),
  t({
    key: 'edtech.schools',
    industry: 'edtech',
    name: 'Private schools',
    kind: 'b2b',
    base: 'smes',
    share: 0.04,
    budgetCol: 0.4,
    needs: { fit: 0.4, price: 0.3, stars: 0.15, reliability: 0.15 },
    needsLabel: 'Teacher time saved, fee collection',
    switchingCost: 0.5,
    trustThreshold: 1.5,
    incumbentShare: 0.25,
    incumbentScore: 0.4,
    monthlyGrowth: 0.003,
    salesCycle: [2, 5],
  }),
  t({
    key: 'edtech.corporate',
    industry: 'edtech',
    name: 'Corporate training',
    kind: 'b2b',
    base: 'midsize',
    share: 0.25,
    budgetCol: 1.2,
    needs: { fit: 0.35, price: 0.2, stars: 0.3, reliability: 0.15 },
    needsLabel: 'Certified content, reporting',
    switchingCost: 0.4,
    trustThreshold: 2.5,
    incumbentShare: 0.5,
    incumbentScore: 0.5,
    monthlyGrowth: 0.003,
    salesCycle: [3, 6],
  }),
  // Business software
  t({
    key: 'saas.solo',
    industry: 'saas',
    name: 'Solo professionals',
    kind: 'b2c',
    base: 'microBusinesses',
    share: 0.15,
    budgetCol: 0.02,
    needs: { fit: 0.4, price: 0.35, stars: 0.1, reliability: 0.15 },
    needsLabel: 'Simple, cheap, mobile',
    switchingCost: 0.3,
    trustThreshold: 1,
    incumbentShare: 0.3,
    incumbentScore: 0.5,
    monthlyGrowth: 0.006,
    salesCycle: [0, 0],
  }),
  t({
    key: 'saas.smes',
    industry: 'saas',
    name: 'Small businesses',
    kind: 'b2c',
    base: 'smes',
    share: 0.4,
    budgetCol: 0.1,
    needs: { fit: 0.4, price: 0.25, stars: 0.15, reliability: 0.2 },
    needsLabel: 'Saves time, integrates, support',
    switchingCost: 0.5,
    trustThreshold: 1.5,
    incumbentShare: 0.4,
    incumbentScore: 0.55,
    monthlyGrowth: 0.005,
    salesCycle: [0, 0],
  }),
  t({
    key: 'saas.midmarket',
    industry: 'saas',
    name: 'Mid-market companies',
    kind: 'b2b',
    base: 'midsize',
    share: 0.5,
    budgetCol: 2,
    needs: { fit: 0.35, price: 0.15, stars: 0.25, reliability: 0.25 },
    needsLabel: 'Security, uptime, integrations',
    switchingCost: 0.7,
    trustThreshold: 3,
    incumbentShare: 0.6,
    incumbentScore: 0.55,
    monthlyGrowth: 0.003,
    salesCycle: [3, 9],
  }),
  // Agriculture
  t({
    key: 'agritech.farmers',
    industry: 'agritech',
    name: 'Smallholder farmers',
    kind: 'b2c',
    base: 'microBusinesses',
    share: 0.2,
    shareByMarket: { london: 0.002, dubai: 0.003 },
    budgetCol: 0.01,
    needs: { fit: 0.35, price: 0.45, stars: 0.1, reliability: 0.1 },
    needsLabel: 'Price, inputs on credit, local language',
    switchingCost: 0.2,
    trustThreshold: 0.5,
    incumbentShare: 0.15,
    incumbentScore: 0.35,
    monthlyGrowth: 0.003,
    salesCycle: [0, 0],
  }),
  t({
    key: 'agritech.food-retail',
    industry: 'agritech',
    name: 'Food retailers',
    kind: 'b2c',
    base: 'smes',
    share: 0.1,
    budgetCol: 0.2,
    needs: { fit: 0.3, price: 0.35, stars: 0.1, reliability: 0.25 },
    needsLabel: 'Fresh supply, price, reliability',
    switchingCost: 0.25,
    trustThreshold: 1,
    incumbentShare: 0.3,
    incumbentScore: 0.45,
    monthlyGrowth: 0.004,
    salesCycle: [0, 0],
  }),
  t({
    key: 'agritech.processors',
    industry: 'agritech',
    name: 'Agri-processors',
    kind: 'b2b',
    base: 'midsize',
    share: 0.08,
    shareByMarket: { london: 0.02, dubai: 0.03 },
    budgetCol: 3,
    needs: { fit: 0.3, price: 0.25, stars: 0.2, reliability: 0.25 },
    needsLabel: 'Consistent volume, quality grading',
    switchingCost: 0.5,
    trustThreshold: 2,
    incumbentShare: 0.45,
    incumbentScore: 0.45,
    monthlyGrowth: 0.003,
    salesCycle: [3, 6],
  }),
];

export const segmentsForIndustry = (industry: Industry) =>
  SEGMENT_TEMPLATES.filter((s) => s.industry === industry);
