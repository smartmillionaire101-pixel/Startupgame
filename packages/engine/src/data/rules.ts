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

/** Phase 2 markets share the same rule shapes with their own regulators. */
const phase2 = (
  market: MarketId,
  data: string,
  tax: string,
  labour: string,
  payments: string,
  health: string,
): RuleCard[] => [
  ...common(market, data, tax, labour),
  {
    id: `${market}.payments-licence`,
    title: 'Payments licence',
    appliesTo: ['fintech'],
    requires: 'Hold a payment service licence with minimum capital.',
    costCol: 25,
    hours: 40,
    penalty: 'Forced shutdown of the payments product line.',
    fineCol: 20,
    regulator: payments,
  },
  {
    id: `${market}.health-records`,
    title: 'Health services registration',
    appliesTo: ['healthtech'],
    requires: 'Register clinical services and protect records.',
    costCol: 3,
    hours: 15,
    penalty: 'Suspension of the service.',
    fineCol: 6,
    regulator: health,
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
  accra: phase2(
    'accra',
    'Data Protection Commission',
    'Ghana Revenue Authority',
    'National Labour Commission',
    'Bank of Ghana',
    'Health Facilities Regulatory Agency',
  ),
  freetown: phase2(
    'freetown',
    'Ministry of Information and Communications',
    'National Revenue Authority',
    'Ministry of Labour',
    'Bank of Sierra Leone',
    'Pharmacy Board of Sierra Leone',
  ),
  kigali: phase2(
    'kigali',
    'National Cyber Security Authority',
    'Rwanda Revenue Authority',
    'Ministry of Public Service and Labour',
    'National Bank of Rwanda',
    'Rwanda FDA',
  ),
  johannesburg: phase2(
    'johannesburg',
    'Information Regulator (POPIA)',
    'SARS',
    'Department of Employment and Labour',
    'SARB Prudential Authority',
    'Health Professions Council',
  ),
  cairo: phase2(
    'cairo',
    'Personal Data Protection Centre',
    'Egyptian Tax Authority',
    'Ministry of Labour',
    'Central Bank of Egypt',
    'Egyptian Drug Authority',
  ),
  dubai: phase2(
    'dubai',
    'UAE Data Office',
    'Federal Tax Authority',
    'Ministry of Human Resources',
    'Central Bank of the UAE',
    'Dubai Health Authority',
  ),
  'san-francisco': [
    ...common(
      'san-francisco',
      'California Privacy Protection Agency (CCPA/CPRA)',
      'IRS and California Franchise Tax Board',
      'California Labor Commissioner',
    ),
    {
      id: 'san-francisco.money-transmitter',
      title: 'Money transmitter licence',
      appliesTo: ['fintech'],
      requires: 'Register with FinCEN and hold a California money transmission licence.',
      costCol: 30,
      hours: 50,
      penalty: 'Forced shutdown of the payments product line.',
      fineCol: 25,
      regulator: 'California DFPI and FinCEN',
    },
    {
      id: 'san-francisco.hipaa',
      title: 'Patient privacy (HIPAA)',
      appliesTo: ['healthtech'],
      requires: 'Sign business associate agreements and secure patient records.',
      costCol: 4,
      hours: 15,
      penalty: 'Civil penalties and suspension of the service.',
      fineCol: 6,
      regulator: 'HHS Office for Civil Rights',
    },
    {
      id: 'san-francisco.business-registration',
      title: 'City business registration',
      appliesTo: 'all',
      requires: 'Register with the city treasurer and renew the certificate each year.',
      costCol: 0.1,
      hours: 2,
      penalty: 'Penalties and a hold on city permits.',
      fineCol: 0.5,
      regulator: 'SF Treasurer & Tax Collector',
    },
  ],
};

export const rulesFor = (market: MarketId, industry: Industry): RuleCard[] =>
  RULE_CARDS[market].filter((r) => r.appliesTo === 'all' || r.appliesTo.includes(industry));
