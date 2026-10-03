/**
 * Rule cards (§11). Simplified summaries of real regulation, labelled as such.
 * "Nothing in the game is legal, financial, or tax advice."
 */
import type { Industry } from './industries.js';
import type { MarketId } from './markets.js';

export interface RuleCard {
  id: string;
  title: string;
  appliesTo: Industry[] | 'all';
  /** One line: what it requires. */
  requires: string;
  /** One-off compliance cost as a multiple of local monthly cost of living. */
  costCol: number;
  /** Founder hours to comply. */
  hours: number;
  /** One line: the penalty if a gap surfaces. */
  penalty: string;
  /** Fine as multiple of monthly cost of living when enforced. */
  fineCol: number;
  regulator: string;
}

const common = (
  market: MarketId,
  regulatorData: string,
  regulatorTax: string,
  regulatorLabour: string,
): RuleCard[] => [
  {
    id: `${market}.tax-registration`,
    title: 'Tax registration and filing',
    appliesTo: 'all',
    requires: 'Register for tax and file returns each year.',
    costCol: 0.3,
    hours: 4,
    penalty: 'Fines and back taxes in due diligence.',
    fineCol: 1,
    regulator: regulatorTax,
  },
  {
    id: `${market}.data-protection`,
    title: 'Data protection',
    appliesTo: 'all',
    requires: 'Register as a data controller and protect customer data.',
    costCol: 0.8,
    hours: 10,
    penalty: 'Fines; public-record event if breached.',
    fineCol: 4,
    regulator: regulatorData,
  },
  {
    id: `${market}.employment`,
    title: 'Employment contracts',
    appliesTo: 'all',
    requires: 'Written contracts, minimum wage, fair termination.',
    costCol: 0.4,
    hours: 6,
    penalty: 'Claims from former staff; layoffs cost more.',
    fineCol: 2,
    regulator: regulatorLabour,
  },
  {
    id: `${market}.founder-agreements`,
    title: 'Founder agreements and IP',
    appliesTo: 'all',
    requires: 'Sign founder agreements and assign IP to the company.',
    costCol: 0.5,
    hours: 4,
    penalty: 'Flagged in due diligence; can delay a round.',
    fineCol: 0,
    regulator: 'Company registry',
  },
];

export const RULE_CARDS: Record<MarketId, RuleCard[]> = {
  lagos: [
    ...common(
      'lagos',
      'Nigeria Data Protection Commission',
      'Federal Inland Revenue Service',
      'Federal Ministry of Labour',
    ),
    {
      id: 'lagos.payments-licence',
      title: 'Payments licence',
      appliesTo: ['fintech'],
      requires: 'Hold a CBN payment service licence with minimum capital.',
      costCol: 25,
      hours: 40,
      penalty: 'Forced shutdown of the payments product line.',
      fineCol: 20,
      regulator: 'Central Bank of Nigeria',
    },
    {
      id: 'lagos.health-records',
      title: 'Health records',
      appliesTo: ['healthtech'],
      requires: 'Use licensed practitioners; store records securely.',
      costCol: 3,
      hours: 15,
      penalty: 'Suspension of telehealth service.',
      fineCol: 6,
      regulator: 'Medical and Dental Council',
    },
  ],
  nairobi: [
    ...common(
      'nairobi',
      'Office of the Data Protection Commissioner',
      'Kenya Revenue Authority',
      'Ministry of Labour',
    ),
    {
      id: 'nairobi.payments-licence',
      title: 'Payment service provider',
      appliesTo: ['fintech'],
      requires: 'Hold a CBK PSP authorisation with minimum capital.',
      costCol: 25,
      hours: 40,
      penalty: 'Forced shutdown of the payments product line.',
      fineCol: 20,
      regulator: 'Central Bank of Kenya',
    },
    {
      id: 'nairobi.health-records',
      title: 'Health records',
      appliesTo: ['healthtech'],
      requires: 'Register digital health service; protect records.',
      costCol: 3,
      hours: 15,
      penalty: 'Suspension of the service.',
      fineCol: 6,
      regulator: 'Ministry of Health',
    },
  ],
  london: [
    ...common('london', 'Information Commissioner’s Office', 'HMRC', 'Employment tribunals'),
    {
      id: 'london.emi-licence',
      title: 'E-money / payments authorisation',
      appliesTo: ['fintech'],
      requires: 'FCA authorisation and safeguarding of customer funds.',
      costCol: 30,
      hours: 50,
      penalty: 'Forced shutdown of the payments product line.',
      fineCol: 25,
      regulator: 'Financial Conduct Authority',
    },
    {
      id: 'london.cqc',
      title: 'Care Quality registration',
      appliesTo: ['healthtech'],
      requires: 'Register clinical services with the regulator.',
      costCol: 4,
      hours: 15,
      penalty: 'Suspension of clinical services.',
      fineCol: 6,
      regulator: 'Care Quality Commission',
    },
  ],
};

export const rulesFor = (market: MarketId, industry: Industry): RuleCard[] =>
  RULE_CARDS[market].filter((r) => r.appliesTo === 'all' || r.appliesTo.includes(industry));
