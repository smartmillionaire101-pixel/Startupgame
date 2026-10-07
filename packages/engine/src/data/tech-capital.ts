/**
 * Wave 10: San Francisco is the tech capital. On top of its depth-scaled
 * funds (data/capital.ts) it gets more venture funds and angel syndicates
 * (fictional names), more AI startups, more AI angels and a busier tech
 * calendar. Cheques in USD (major units).
 */
import type { AiFundSeed } from './fiction.js';
import type { MarketId } from './markets.js';

export const TECH_CAPITAL_FUNDS: Partial<Record<MarketId, readonly AiFundSeed[]>> = {
  'san-francisco': [
    {
      name: 'Sand Hill Forge',
      partner: 'Evelyn Brandt',
      sectors: 'any',
      stages: ['seed', 'series-a'],
      check: [500_000, 4_000_000],
      minStars: 2,
    },
    {
      name: 'Foglight Ventures',
      partner: 'Marcus Oyelaran',
      sectors: ['saas', 'fintech'],
      stages: ['pre-seed', 'seed'],
      check: [150_000, 1_500_000],
      minStars: 1,
    },
    {
      name: 'Mission Bay Bio Partners',
      partner: 'Dr Helen Cho',
      sectors: ['healthtech'],
      stages: ['seed', 'series-a'],
      check: [500_000, 5_000_000],
      minStars: 1.5,
    },
    {
      name: 'Embarcadero Growth',
      partner: 'William Hartley',
      sectors: 'any',
      stages: ['series-a', 'series-b'],
      check: [5_000_000, 25_000_000],
      minStars: 3,
    },
    {
      name: 'Twin Peaks Pre-Seed',
      partner: 'Sofia Reyes',
      sectors: 'any',
      stages: ['pre-seed'],
      check: [50_000, 400_000],
      minStars: 0,
    },
    {
      name: 'Hayes Point Climate Fund',
      partner: 'Aaron Feldman',
      sectors: ['agritech', 'logistics'],
      stages: ['seed', 'series-a'],
      check: [400_000, 3_000_000],
      minStars: 1,
    },
    {
      name: 'Lombard Street Angels',
      partner: 'Grace Liu',
      sectors: 'any',
      stages: ['pre-seed', 'seed'],
      check: [25_000, 250_000],
      minStars: 0,
    },
    {
      name: 'Dogpatch Operator Angels',
      partner: 'Kevin Okafor',
      sectors: ['saas', 'ecommerce', 'edtech'],
      stages: ['pre-seed', 'seed'],
      check: [25_000, 200_000],
      minStars: 0,
    },
  ],
};

/** Extra AI angels (people) a tech capital keeps on top of round(4 × angelDepth). */
export const TECH_CAPITAL_ANGELS: Partial<Record<MarketId, number>> = { 'san-francisco': 4 };

/** Extra AI startups a tech capital keeps (and opens with, as a share of the usual number). */
export const TECH_CAPITAL_STARTUPS: Partial<Record<MarketId, number>> = { 'san-francisco': 0.6 };

/** Extra tech events a month. */
export const TECH_CAPITAL_EVENTS: Partial<Record<MarketId, number>> = { 'san-francisco': 4 };

/** Tech-capital event topics, on top of the usual ones. */
export const TECH_CAPITAL_TOPICS: Partial<Record<MarketId, readonly string[]>> = {
  'san-francisco': [
    'AI agents summit',
    'Foundation models night',
    'YC-style demo day',
    'Founders at the Ferry Building',
    'Dev tools meetup',
    'Robotics showcase',
  ],
};
