/**
 * Decision events (Founder Journey 4a; blueprint §9.3, FR-018): the templates.
 *
 * Each template is one situation a founder can meet, in one of six families.
 * Its trigger lives in decisions.ts (it reads the world as it is); here are
 * the words, the timing and the knobs. Amounts are relative (months of the
 * city's cost of living, a share of payroll) so a choice costs about the same
 * share of a founder's means in every city.
 *
 *   deadline  months after it appears to answer (0: this month only); an
 *             unanswered event resolves to `defaultChoice` at the settlement
 *             after its deadline. A default never spends hours or cash.
 *   cooldown  months before the same template can appear again for you.
 *   weight    how likely it is picked among those that could fire.
 *
 * The client has its own (translated) copy keyed on template and choice ids;
 * the English here is for the API and the inbox.
 */
import type { DecisionFamily } from '../types.js';
import { LIFE_EVENT_TEMPLATES } from './lifeevents.js';

export interface DecisionChoiceData {
  id: string;
  label: string;
  /** What happens, in a line (before the numbers). */
  outcome: string;
}

export interface DecisionTemplateData {
  id: string;
  family: DecisionFamily;
  title: string;
  body: string;
  deadline: number;
  cooldown: number;
  weight: number;
  defaultChoice: string;
  choices: DecisionChoiceData[];
}

/** Limits and tuning shared by all templates. */
export const DECISIONS = {
  /** Open events a founder can have at once. */
  maxOpen: 3,
  /** Chance a quiet month brings an event when one could fire (rival moves always do). */
  fireChance: 0.55,
  /** Months before the same family can appear again. */
  familyCooldown: 2,
  /** Answered events kept for the record. */
  keepResolved: 10,
  bigProspect: { fit: 0.4, budgetX: [1.8, 3] as [number, number], deadlineMonths: 3 },
  unhappy: { reliability: 0.55, customers: 5 },
  stretched: { workload: 115, morale: 50 },
  raise: { morale: 65, belowBand: 0.95 },
  runway: { months: 4 },
  slowPayers: { revenueX: 1.5 },
  friend: { trust: 0.3, hoursFree: 15 },
  dinner: { hoursFree: 25 },
  wealth: { colMonths: [12, 50, 200] as readonly number[] },
} as const;

export const DECISION_TEMPLATES: DecisionTemplateData[] = [
  // ---------------------------------------------------------------- customer
  {
    id: 'big-prospect',
    family: 'customer',
    title: 'A big prospect: {customer}',
    body: '{contact} at {customer} has heard about {company}. They could pay about {budget} a month, but want a better deal or changes first.',
    deadline: 1,
    cooldown: 4,
    weight: 3,
    defaultChoice: 'delay',
    choices: [
      {
        id: 'discount',
        label: 'Offer a launch discount',
        outcome: 'They go straight to a proposal at 15% off.',
      },
      {
        id: 'customise',
        label: 'Customise it for them',
        outcome: 'You build what they asked for and show them a demo.',
      },
      { id: 'delay', label: 'Tell them to wait', outcome: 'They go on your pipeline as a lead.' },
      { id: 'decline', label: 'Say no', outcome: 'You keep your focus. Nothing changes.' },
    ],
  },
  {
    id: 'unhappy-customers',
    family: 'customer',
    title: 'Customers are complaining',
    body: 'Outages and slow support at {company}: reliability is {reliability}%. {customers} paying customers are watching what you do.',
    deadline: 1,
    cooldown: 5,
    weight: 2,
    defaultChoice: 'apologise',
    choices: [
      {
        id: 'fix',
        label: 'Drop everything and fix it',
        outcome: 'Less tech debt, a steadier product.',
      },
      {
        id: 'credit',
        label: 'Give everyone a credit',
        outcome: 'You pay them back a little; they stay fond of you.',
      },
      {
        id: 'apologise',
        label: 'Just apologise',
        outcome: 'Free, but your rating slips a little.',
      },
    ],
  },
  // ---------------------------------------------------------------- team
  {
    id: 'team-stretched',
    family: 'team',
    title: 'Your team is stretched',
    body: '{name} is at {workload}% of a full load and team morale is {morale}. Something has to give.',
    deadline: 1,
    cooldown: 4,
    weight: 3,
    defaultChoice: 'reprioritise',
    choices: [
      {
        id: 'hire',
        label: 'Hire help',
        outcome: 'You post a {role} job (find candidates on the Team tab).',
      },
      {
        id: 'reprioritise',
        label: 'Pause the less important work',
        outcome: 'The team breathes; the product moves a little slower.',
      },
      {
        id: 'reward',
        label: 'Thank them with a bonus',
        outcome: 'A bonus paid through payroll lifts morale.',
      },
      { id: 'ignore', label: 'Push on', outcome: 'Nothing changes, and morale dips.' },
    ],
  },
  {
    id: 'raise-request',
    family: 'team',
    title: '{name} asks for a raise',
    body: '{name} ({role}) earns {salary} a month; the market rate is {band}. They want to talk.',
    deadline: 1,
    cooldown: 5,
    weight: 2,
    defaultChoice: 'decline',
    choices: [
      {
        id: 'raise',
        label: 'Pay the market rate',
        outcome: 'Their salary goes up every month from now.',
      },
      {
        id: 'bonus',
        label: 'One-off bonus instead',
        outcome: 'Half a month’s pay now; their salary stays.',
      },
      { id: 'decline', label: 'Not now', outcome: 'Free, but they’re disappointed.' },
    ],
  },
  {
    id: 'rival-poach',
    family: 'team',
    title: '{rival} wants {name}',
    body: '{rival} has offered {name} ({role}) a job at about {offer} a month. {name} hasn’t said yes yet.',
    deadline: 0,
    cooldown: 4,
    weight: 4,
    defaultChoice: 'leave-it',
    choices: [
      { id: 'counter', label: 'Counter-offer', outcome: 'You raise their pay; they stay.' },
      {
        id: 'talk',
        label: 'Talk to them about the mission',
        outcome: 'Most stay after a real conversation.',
      },
      { id: 'let-go', label: 'Wish them well', outcome: 'They leave; you save their salary.' },
      {
        id: 'leave-it',
        label: 'Leave it to them',
        outcome: 'Free. It’s a coin toss whether they stay.',
      },
    ],
  },
  // ---------------------------------------------------------------- competition
  {
    id: 'rival-price-cut',
    family: 'competition',
    title: '{rival} cut prices {pct}%',
    body: '{move}. Buyers comparing you will notice.',
    deadline: 1,
    cooldown: 3,
    weight: 4,
    defaultChoice: 'hold',
    choices: [
      {
        id: 'match',
        label: 'Cut your price too',
        outcome: 'You stay close on price; every customer pays a little less.',
      },
      {
        id: 'product',
        label: 'Sell on quality instead',
        outcome: 'You show buyers what’s better; their cut stops hurting you for a while.',
      },
      {
        id: 'partner',
        label: 'Partner with a bigger brand',
        outcome: 'A co-marketing deal that lends you their name.',
      },
      {
        id: 'hold',
        label: 'Hold your price',
        outcome: 'Free. Their cut weighs a little on your win chances while it lasts.',
      },
    ],
  },
  {
    id: 'rival-raised',
    family: 'competition',
    title: '{rival} raised money',
    body: '{move}. Expect them to hire, launch and spend on marketing.',
    deadline: 1,
    cooldown: 3,
    weight: 3,
    defaultChoice: 'hold',
    choices: [
      { id: 'speed', label: 'Ship faster with contractors', outcome: 'A better product, sooner.' },
      {
        id: 'niche',
        label: 'Double down on your best customers',
        outcome: 'You go deeper where you already win.',
      },
      { id: 'hold', label: 'Stay the course', outcome: 'Free. You keep doing what works.' },
    ],
  },
  {
    id: 'rival-launch',
    family: 'competition',
    title: '{rival} launched something new',
    body: '{move}. Some of your prospects will ask why you don’t have it.',
    deadline: 1,
    cooldown: 3,
    weight: 3,
    defaultChoice: 'hold',
    choices: [
      { id: 'respond', label: 'Build your answer', outcome: 'Your product closes the gap.' },
      {
        id: 'price',
        label: 'Be the cheaper option',
        outcome: 'A small price cut instead of a race.',
      },
      {
        id: 'hold',
        label: 'Ignore it',
        outcome: 'Free. If their product pulls ahead, it weighs a little on your deals.',
      },
    ],
  },
  {
    id: 'rival-courting',
    family: 'competition',
    title: '{rival} is courting {customer}',
    body: '{rival} has been talking to {customer}, one of your open deals.',
    deadline: 0,
    cooldown: 3,
    weight: 4,
    defaultChoice: 'ride',
    choices: [
      { id: 'discount', label: 'Sweeten your offer', outcome: '10% more off your deal with them.' },
      { id: 'visit', label: 'Go and see them', outcome: 'Face time builds their trust in you.' },
      { id: 'ride', label: 'Let it ride', outcome: 'Free. Their trust in you slips a little.' },
    ],
  },
  // ---------------------------------------------------------------- finance
  {
    id: 'runway-low',
    family: 'finance',
    title: 'Runway is short: {months} months',
    body: '{company} has about {months} months of cash at this burn ({burn} a month).',
    deadline: 1,
    cooldown: 4,
    weight: 4,
    defaultChoice: 'cut',
    choices: [
      { id: 'cut', label: 'Halve marketing', outcome: 'Burn drops; fewer new customers find you.' },
      {
        id: 'collect',
        label: 'Collect invoices early',
        outcome: 'A finance house pays your invoices now, minus a fee.',
      },
      {
        id: 'loan',
        label: 'Lend the company money',
        outcome: 'From your personal account; the company owes it back.',
      },
      {
        id: 'raise',
        label: 'Plan a raise',
        outcome: 'No cost now: open a round from the Money tab.',
      },
    ],
  },
  {
    id: 'slow-payers',
    family: 'finance',
    title: 'Customers are paying late',
    body: '{receivables} of invoices are still unpaid, more than your monthly revenue.',
    deadline: 1,
    cooldown: 4,
    weight: 2,
    defaultChoice: 'wait',
    choices: [
      { id: 'chase', label: 'Chase them yourself', outcome: 'About a third comes in now.' },
      { id: 'factor', label: 'Sell the invoices', outcome: 'All of it now, minus a fee.' },
      {
        id: 'wait',
        label: 'Wait for the due dates',
        outcome: 'Free. The money comes when it’s due.',
      },
    ],
  },
  // ---------------------------------------------------------------- social
  {
    id: 'friend-invite',
    family: 'social',
    title: '{friend} invites you out',
    body: '{friend} is free this week and wants to catch up. You have {hours}h left this month.',
    deadline: 0,
    cooldown: 3,
    weight: 3,
    defaultChoice: 'reschedule',
    choices: [
      { id: 'attend', label: 'Go', outcome: 'A good evening: you feel better and get closer.' },
      { id: 'reschedule', label: 'Suggest another time', outcome: 'Free. No harm done.' },
      { id: 'decline', label: 'Say you’re too busy', outcome: 'Free, but it stings a little.' },
    ],
  },
  {
    id: 'peer-dinner',
    family: 'social',
    title: 'A founders’ dinner',
    body: 'A few founders are meeting for dinner in {city}. Good people to know.',
    deadline: 0,
    cooldown: 4,
    weight: 2,
    defaultChoice: 'skip',
    choices: [
      { id: 'go', label: 'Go along', outcome: 'You meet people who might help later.' },
      { id: 'skip', label: 'Skip it', outcome: 'Free. Another time.' },
    ],
  },
  // ---------------------------------------------------------------- life
  {
    id: 'wealth-milestone',
    family: 'life',
    title: 'You’ve saved {amount}',
    body: 'Your personal savings passed {amount}. What do you do with it?',
    deadline: 1,
    cooldown: 6,
    weight: 2,
    defaultChoice: 'save',
    choices: [
      { id: 'trip', label: 'Take a weekend away', outcome: 'You come back rested.' },
      {
        id: 'invest',
        label: 'Back your own company',
        outcome: 'A founder loan: the company owes it back.',
      },
      { id: 'save', label: 'Keep it saved', outcome: 'Free. The money stays where it is.' },
    ],
  },
  {
    id: 'home-milestone',
    family: 'life',
    title: 'Your own place',
    body: 'You live in a home you own now. Friends keep asking when the housewarming is.',
    deadline: 1,
    cooldown: 120,
    weight: 2,
    defaultChoice: 'later',
    choices: [
      { id: 'host', label: 'Throw a housewarming', outcome: 'Friends, food and new faces.' },
      { id: 'later', label: 'Maybe later', outcome: 'Free.' },
    ],
  },
];

/** A founder decision's template, or a life event's (Phase 5: answered the same way). */
export const decisionTemplate = (id: string): DecisionTemplateData | undefined =>
  DECISION_TEMPLATES.find((t) => t.id === id) ?? LIFE_EVENT_TEMPLATES.find((t) => t.id === id);
