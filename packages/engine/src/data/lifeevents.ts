/**
 * Phase 5 life events: the templates (BitLife-style choice cards).
 *
 * Each template is one thing that happens in a player's life, in one of five
 * families (health, money, social, work, city). Its condition and its
 * effects live in lifeevents.ts (they read the world as it is); here are the
 * words and the knobs. Amounts there are relative to the city's monthly cost
 * of living, so a choice costs about the same share of anyone's means in
 * every city.
 *
 * Every life event is answered the month it appears (deadline 0): left
 * unanswered, it takes `defaultChoice` at the next settlement. The card says
 * so. A default never spends hours; only a bill you can't dodge (the rent,
 * a fine) costs money by default.
 *
 *   cooldown  months before the same event can come back for you.
 *   weight    how likely it is picked among those whose condition holds.
 *   emoji     the card's picture.
 *
 * A choice with a chance in it has `win` and `lose` lines: what happened,
 * either way. The client shows this English through tx()/t() with its
 * placeholders, so every line here has French in the web client
 * (apps/web/src/i18n/fr/life-events.ts; a test checks).
 */
import type { DecisionChoiceData, DecisionTemplateData } from './decisions.js';

export type LifeFamily = 'health' | 'money' | 'social' | 'work' | 'city';

export interface LifeChoiceData extends DecisionChoiceData {
  /** A chance choice: what happened when it went well, and when it didn't. */
  win?: string;
  lose?: string;
}

export interface LifeEventTemplateData extends DecisionTemplateData {
  family: LifeFamily;
  emoji: string;
  choices: LifeChoiceData[];
}

/** Limits and tuning shared by every life event. */
export const LIFE_EVENTS = {
  /** Open (unanswered) life events a player can have at once. */
  maxOpen: 2,
  /** Chance of a first, then a second, event at each month's settlement. */
  firstChance: 0.7,
  secondChance: 0.3,
  /** Life events are answered within their month (0: this month only). */
  deadline: 0,
  /** Below this much in your account (months of cost of living), no trips or loans come up. */
  weddingCash: 0.5,
  loanCash: 0.4,
  phoneCash: 0.1,
  /** Burnout warning: stress at or above this (or burnout). */
  burnoutStress: 55,
  /** Food poisoning only when health is above this (it never kicks you when you're down). */
  sickHealth: 15,
  /** Charity run: health at least this. */
  runHealth: 50,
  /** Festival: happiness under this. */
  festivalHappiness: 85,
} as const;

const T = (
  t: Omit<LifeEventTemplateData, 'deadline' | 'cooldown' | 'weight'> &
    Partial<Pick<LifeEventTemplateData, 'cooldown' | 'weight'>>,
): LifeEventTemplateData => ({
  deadline: LIFE_EVENTS.deadline,
  cooldown: 6,
  weight: 2,
  ...t,
});

export const LIFE_EVENT_TEMPLATES: LifeEventTemplateData[] = [
  // ---------------------------------------------------------------- health
  T({
    id: 'life-food-poisoning',
    family: 'health',
    emoji: '🤢',
    title: 'Food poisoning',
    body: 'That street food last night was a mistake. Your stomach is not happy.',
    defaultChoice: 'push',
    choices: [
      { id: 'doctor', label: 'See a doctor', outcome: 'Medicine and advice. You recover quickly.' },
      { id: 'rest', label: 'Rest at home', outcome: 'A day in bed. Slow, but it works.' },
      { id: 'push', label: 'Push through it', outcome: 'You carry on, and feel terrible.' },
    ],
  }),
  T({
    id: 'life-burnout',
    family: 'health',
    emoji: '🔥',
    title: 'Burnout warning',
    body: 'Long weeks are catching up with you. You can’t sleep and everything feels hard.',
    cooldown: 4,
    weight: 4,
    defaultChoice: 'push',
    choices: [
      {
        id: 'weekend',
        label: 'Take the weekend off',
        outcome: 'No work for two days. You come back calmer.',
      },
      {
        id: 'counsellor',
        label: 'Talk to a counsellor',
        outcome: 'An hour with someone who listens helps a lot.',
      },
      { id: 'push', label: 'Push on', outcome: 'You keep going. It gets worse.' },
    ],
  }),
  T({
    id: 'life-gym',
    family: 'health',
    emoji: '🏋️',
    title: 'A gym opens nearby',
    body: '{place} just opened near you, and the first month is free.',
    cooldown: 12,
    defaultChoice: 'skip',
    choices: [
      {
        id: 'join',
        label: 'Sign up and go often',
        outcome: 'Sore at first, then stronger and calmer.',
      },
      { id: 'once', label: 'Try one class', outcome: 'One good session.' },
      { id: 'skip', label: 'Not for me', outcome: 'Nothing changes.' },
    ],
  }),
  T({
    id: 'life-noisy-nights',
    family: 'health',
    emoji: '🔊',
    title: 'Noisy neighbours',
    body: 'Music through the wall until 3am, three nights in a row.',
    defaultChoice: 'bear',
    choices: [
      { id: 'earplugs', label: 'Buy earplugs', outcome: 'Cheap, and you finally sleep.' },
      {
        id: 'talk',
        label: 'Knock and talk to them',
        outcome: 'Could go well or badly.',
        win: 'They apologise and turn it down. Peace at last.',
        lose: 'They don’t care. Now it’s awkward, and still loud.',
      },
      { id: 'bear', label: 'Put up with it', outcome: 'You lose sleep.' },
    ],
  }),
  T({
    id: 'life-charity-run',
    family: 'health',
    emoji: '🏃',
    title: 'A charity run',
    body: 'Friends are running 10 km for a local hospital and want you to join.',
    cooldown: 8,
    defaultChoice: 'skip',
    choices: [
      {
        id: 'run',
        label: 'Run with them',
        outcome: 'Tiring, but you feel great at the finish.',
      },
      { id: 'donate', label: 'Just donate', outcome: 'A good cause, and a warm feeling.' },
      { id: 'skip', label: 'Skip it', outcome: 'Nothing changes.' },
    ],
  }),
  // ---------------------------------------------------------------- money
  T({
    id: 'life-rent-rise',
    family: 'money',
    emoji: '🏠',
    title: 'Your landlord raises the rent',
    body: 'A letter under the door: the rent goes up, and the extra for this year is about {amount}.',
    cooldown: 12,
    defaultChoice: 'pay',
    choices: [
      { id: 'pay', label: 'Pay it', outcome: 'Annoying, but done.' },
      {
        id: 'negotiate',
        label: 'Push back',
        outcome: 'Could go well or badly.',
        win: 'The landlord backs down: no rise this year.',
        lose: 'No luck. You pay the rise, after an argument.',
      },
      {
        id: 'flatmate',
        label: 'Find a flatmate',
        outcome: 'Someone shares the cost. Home gets busier.',
      },
    ],
  }),
  T({
    id: 'life-friend-loan',
    family: 'money',
    emoji: '🤝',
    title: 'A friend needs a loan',
    body: 'An old friend is short this month and asks to borrow {amount}.',
    cooldown: 8,
    defaultChoice: 'no',
    choices: [
      {
        id: 'lend',
        label: 'Lend it',
        outcome: 'They promise to pay you back next month. Could go well or badly.',
        win: 'They’ll pay you back next month, with thanks.',
        lose: 'They can’t pay you back. The money is gone.',
      },
      {
        id: 'gift',
        label: 'Give a little, no strings',
        outcome: 'A smaller gift. They’re grateful.',
      },
      { id: 'no', label: 'Say no', outcome: 'You keep your money. It’s a bit awkward.' },
    ],
  }),
  T({
    id: 'life-tax-refund',
    family: 'money',
    emoji: '💸',
    title: 'A tax refund',
    body: 'The tax office says you paid too much last year. {amount} is coming back to you.',
    cooldown: 12,
    weight: 1,
    defaultChoice: 'save',
    choices: [
      { id: 'save', label: 'Save it', outcome: 'The money goes into your account.' },
      {
        id: 'treat',
        label: 'Treat yourself',
        outcome: 'You spend it on something nice.',
      },
    ],
  }),
  T({
    id: 'life-parking-fine',
    family: 'money',
    emoji: '🚗',
    title: 'A parking fine',
    body: 'A ticket on your car’s windscreen. You were sure that spot was fine.',
    cooldown: 6,
    defaultChoice: 'pay',
    choices: [
      { id: 'pay', label: 'Pay the fine', outcome: 'Paid. Lesson learned.' },
      {
        id: 'appeal',
        label: 'Appeal it',
        outcome: 'Could go well or badly.',
        win: 'Appeal won. You pay nothing.',
        lose: 'Appeal lost. You pay the fine plus a late fee.',
      },
    ],
  }),
  // ---------------------------------------------------------------- social
  T({
    id: 'life-wedding',
    family: 'social',
    emoji: '💒',
    title: 'A wedding in {city}',
    body: 'A close friend is getting married in {city} and really wants you there.',
    cooldown: 10,
    defaultChoice: 'no',
    choices: [
      {
        id: 'go',
        label: 'Go to the wedding',
        outcome: 'Travel, dancing, old friends. Tiring but wonderful.',
      },
      { id: 'gift', label: 'Send a gift', outcome: 'They know you care.' },
      { id: 'no', label: 'Say you can’t come', outcome: 'You stay home and feel a little sad.' },
    ],
  }),
  T({
    id: 'life-family-visit',
    family: 'social',
    emoji: '👪',
    title: 'Your family wants to visit',
    body: 'Your parents want to come and stay for a few days.',
    cooldown: 8,
    defaultChoice: 'later',
    choices: [
      { id: 'host', label: 'Have them to stay', outcome: 'Home cooking and long talks.' },
      { id: 'call', label: 'Video call instead', outcome: 'A long call. Nice, not the same.' },
      { id: 'later', label: 'Not now', outcome: 'They’re disappointed.' },
    ],
  }),
  T({
    id: 'life-neighbour',
    family: 'social',
    emoji: '👋',
    title: 'A friendly new neighbour',
    body: 'Someone new moved in next door and says hello on the stairs.',
    cooldown: 12,
    weight: 1,
    defaultChoice: 'wave',
    choices: [
      { id: 'tea', label: 'Invite them for tea', outcome: 'A new friend on your street.' },
      { id: 'wave', label: 'Just wave', outcome: 'Nothing changes.' },
    ],
  }),
  // ---------------------------------------------------------------- work
  T({
    id: 'life-cofounder',
    family: 'work',
    emoji: '🚀',
    title: 'Co-found a startup?',
    body: 'A friend asks you to co-found their startup. They have an idea and a lot of energy.',
    cooldown: 12,
    defaultChoice: 'no',
    choices: [
      {
        id: 'yes',
        label: 'Yes, help them',
        outcome: 'Evenings of work together. Exciting and a bit stressful.',
      },
      { id: 'no', label: 'No, thanks', outcome: 'You stay focused on your own path.' },
      {
        id: 'equity',
        label: 'Ask for equity first',
        outcome: 'Could go well or badly.',
        win: 'They agree and make you an adviser. You meet their whole network.',
        lose: 'They’re offended you asked. It’s awkward now.',
      },
    ],
  }),
  T({
    id: 'life-journalist',
    family: 'work',
    emoji: '🎤',
    title: 'A journalist wants a quote',
    body: 'A reporter is writing about startups in {city} and wants a few words from you.',
    cooldown: 6,
    defaultChoice: 'decline',
    choices: [
      {
        id: 'bold',
        label: 'Say something bold',
        outcome: 'Could go well or badly.',
        win: 'Your quote is the headline. People are talking about you.',
        lose: 'Your quote comes out wrong. Some people are annoyed.',
      },
      {
        id: 'careful',
        label: 'Give a careful quote',
        outcome: 'A short, safe line in the article.',
      },
      { id: 'decline', label: 'No comment', outcome: 'Nothing changes.' },
    ],
  }),
  T({
    id: 'life-laptop',
    family: 'work',
    emoji: '💻',
    title: 'Your laptop breaks before a pitch',
    body: 'The screen goes black the night before an important meeting.',
    cooldown: 8,
    defaultChoice: 'borrow',
    choices: [
      { id: 'new', label: 'Buy a new one today', outcome: 'Expensive, but no more worries.' },
      {
        id: 'repair',
        label: 'Get it repaired',
        outcome: 'Cheaper. Could go well or badly.',
        win: 'Fixed overnight. Good as new.',
        lose: 'The repair doesn’t hold. You pitch from your phone, stressed.',
      },
      {
        id: 'borrow',
        label: 'Borrow a friend’s',
        outcome: 'It works, just about. A stressful day.',
      },
    ],
  }),
  T({
    id: 'life-job-offer',
    family: 'work',
    emoji: '💼',
    title: 'A well-paid job offer',
    body: 'An old classmate runs a big company now and offers you some well-paid contract work: {amount}.',
    cooldown: 8,
    defaultChoice: 'no',
    choices: [
      {
        id: 'contract',
        label: 'Take the contract',
        outcome: 'Long days, but the money is good.',
      },
      {
        id: 'keep',
        label: 'Ask them to keep you in mind',
        outcome: 'A friendly no. The door stays open.',
      },
      { id: 'no', label: 'Say no', outcome: 'Nothing changes.' },
    ],
  }),
  T({
    id: 'life-coffee',
    family: 'work',
    emoji: '☕',
    title: 'Coffee with someone successful',
    body: 'A well-known founder in {city} has a free hour and offers you a coffee.',
    cooldown: 6,
    defaultChoice: 'later',
    choices: [
      { id: 'go', label: 'Go and listen', outcome: 'Good advice, and a useful contact.' },
      { id: 'later', label: 'Not this time', outcome: 'Nothing changes.' },
    ],
  }),
  T({
    id: 'life-staff-ill',
    family: 'work',
    emoji: '🤒',
    title: '{name} is ill',
    body: '{name} at {company} is sick and will be off for a week.',
    cooldown: 6,
    defaultChoice: 'slide',
    choices: [
      { id: 'cover', label: 'Do their work yourself', outcome: 'Long hours, but nothing slips.' },
      {
        id: 'leave',
        label: 'Pay them to rest properly',
        outcome: 'Paid sick leave. They come back grateful.',
      },
      { id: 'slide', label: 'Let the work wait', outcome: 'Things slip, and they feel guilty.' },
    ],
  }),
  // ---------------------------------------------------------------- city
  T({
    id: 'life-power-cut',
    family: 'city',
    emoji: '🔌',
    title: 'A power cut on your street',
    body: 'No electricity since this morning, and no one knows when it’s coming back.',
    cooldown: 5,
    defaultChoice: 'wait',
    choices: [
      { id: 'cafe', label: 'Work from a café', outcome: 'Coffee, Wi-Fi and a change of scene.' },
      {
        id: 'battery',
        label: 'Buy a power bank',
        outcome: 'Ready for next time, too.',
      },
      { id: 'wait', label: 'Wait it out', outcome: 'A long, dark, frustrating day.' },
    ],
  }),
  T({
    id: 'life-festival',
    family: 'city',
    emoji: '🎉',
    title: 'A street festival',
    body: 'Music, food stalls and dancing in {city} this weekend.',
    cooldown: 6,
    defaultChoice: 'stay',
    choices: [
      { id: 'go', label: 'Go along', outcome: 'A brilliant evening.' },
      { id: 'stay', label: 'Stay in', outcome: 'Nothing changes.' },
    ],
  }),
  T({
    id: 'life-phone-stolen',
    family: 'city',
    emoji: '📱',
    title: 'Your phone is stolen',
    body: 'One moment it was in your pocket on the bus, the next it was gone.',
    cooldown: 12,
    weight: 1,
    defaultChoice: 'without',
    choices: [
      { id: 'new', label: 'Buy a new phone', outcome: 'Back online today.' },
      { id: 'used', label: 'Buy a cheap used one', outcome: 'Slow, but it works.' },
      { id: 'without', label: 'Do without for a while', outcome: 'Peaceful, and very stressful.' },
    ],
  }),
  T({
    id: 'life-car-breakdown',
    family: 'city',
    emoji: '🛠️',
    title: 'Your car breaks down',
    body: 'A strange noise, some smoke, and the car won’t start.',
    cooldown: 8,
    defaultChoice: 'bus',
    choices: [
      { id: 'garage', label: 'Take it to a garage', outcome: 'Fixed properly.' },
      {
        id: 'cheap',
        label: 'Try a cheap mechanic',
        outcome: 'Could go well or badly.',
        win: 'A bargain: it runs like new.',
        lose: 'It breaks again a week later. Buses it is.',
      },
      { id: 'bus', label: 'Take buses for now', outcome: 'Slow, crowded trips for a while.' },
    ],
  }),
];

export const lifeEventTemplate = (id: string): LifeEventTemplateData | undefined =>
  LIFE_EVENT_TEMPLATES.find((t) => t.id === id);
