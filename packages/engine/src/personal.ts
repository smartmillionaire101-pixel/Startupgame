/**
 * Personal life (§4): lifestyle tiers, hours and energy, personal finances,
 * the floor (freelance gigs), and dollar accounts.
 */
import { LIFESTYLE_TIERS, BASE_HOURS, backgroundById } from './data/characters.js';
import { ensure } from './errors.js';
import { col, getMarket, notify, spendHours } from './helpers.js';
import { account, convert, openAccount, transfer, transferUpTo } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney, scale } from './money.js';
import { applyStarEvent } from './stars.js';
import { settlePersonalLoans } from './credit.js';
import { ECONOMY, JOB_HOURS, payJob } from './economy.js';
import { comfortEnergy, settleCar } from './shop.js';
import { decayNeeds, moodHoursFactor } from './needs.js';
import { livingCostFactor } from './property.js';
import type { MarketState, Player, World } from './types.js';

/** The agency gig's pay, local minor units (Wave 6: about 30% more). */
export const floorGigPay = (m: MarketState) =>
  Math.round(m.data.floorGig.pay * 100 * ECONOMY.gigPayBoost);

/** Gigs a month (Wave 5: up from 2), shared with gigs at businesses. */
export const GIGS_PER_MONTH = 8;
export const BURNOUT_ENERGY = 25;
export const OVERWORK_HOURS = 170;

export const tierOf = (p: Player) => LIFESTYLE_TIERS[clamp(p.lifestyleTier, 1, 5) - 1]!;

/** Monthly lifestyle cost in local minor units (Wave 10: no rent when you live in a home you own). */
export const lifestyleCost = (world: World, p: Player) =>
  scale(col(getMarket(world, p.market)), tierOf(p).costCol * livingCostFactor(world, p));

/** Hours available next month: base, background, lifestyle, energy and burnout. */
export function computeHours(p: Player): number {
  const bg = backgroundById(p.backgroundId);
  const base = BASE_HOURS + (bg?.hoursBonus ?? 0) + tierOf(p).hours;
  const energyFactor = 0.6 + (0.4 * p.energy) / 100;
  // Wave 7: a low mood costs hours, a good one adds a few.
  return Math.round(base * energyFactor * (p.burnout ? 0.7 : 1) * moodHoursFactor(p));
}

/**
 * Month-end for a person: pay for their lifestyle, recover or burn energy,
 * reset hours. Overspending drains savings; missed payments hurt credit.
 */
export function settlePerson(world: World, p: Player, month: number) {
  const m = getMarket(world, p.market);
  // Banks debit loan repayments before anything else.
  settlePersonalLoans(world, p, month);
  // Wave 5: your wage arrives from the business till, then the car's running costs go out.
  payJob(world, p, month);
  settleCar(world, p, month);
  const cost = lifestyleCost(world, p);
  const paid = transferUpTo(
    world,
    p.accounts.local,
    m.ext.lifestyle,
    cost,
    `Living costs (${tierOf(p).name})`,
    month,
  );
  p.lastMonth.spend = paid;
  if (paid < cost) {
    p.credit.missedPayments += 1;
    p.energy = clamp(p.energy - 15, 0, 100);
    if (p.lifestyleTier > 1) {
      p.lifestyleTier -= 1;
      notify(world, p.id, {
        month,
        kind: 'warning',
        text: `You couldn’t cover living costs. Downgraded to ${tierOf(p).name}.`,
      });
    } else {
      notify(world, p.id, {
        month,
        kind: 'warning',
        text: 'You’re out of money. Take a freelance gig or a salary to get by.',
      });
    }
  }
  const overwork = Math.max(0, p.hours.used - OVERWORK_HOURS) * 0.3;
  // A comfortable home helps you recover (Wave 5).
  p.energy = clamp(p.energy + tierOf(p).recovery + comfortEnergy(p) - 18 - overwork, 0, 100);
  const wasBurnt = p.burnout;
  p.burnout = p.energy < BURNOUT_ENERGY;
  if (p.burnout && !wasBurnt)
    notify(world, p.id, {
      month,
      kind: 'warning',
      text: 'You’re burning out. Fewer hours and worse decisions until you rest.',
    });
  // Wave 7: needs fall each month (mood then shapes next month's hours).
  decayNeeds(world, p, month);
  p.hours = { available: computeHours(p), used: 0 };
  // A job takes its hours at the start of every month (Wave 5).
  if (p.job) p.hours.used = Math.min(p.hours.available, JOB_HOURS);
  p.gigsThisMonth = 0;
  // Lavish lifestyles at struggling companies attract tabloid attention (§4).
  const tier = tierOf(p);
  if (tier.flash >= 0.65) {
    const struggling = p.companyIds.some((id) => {
      const c = world.companies[id];
      return (
        c &&
        c.status === 'active' &&
        c.finance.history.length > 0 &&
        (c.finance.history.at(-1)?.revenue ?? 0) < scale(col(m), 20)
      );
    });
    if (struggling) applyStarEvent(p.stars, -0.05);
  }
}

export function setLifestyle(world: World, p: Player, tier: number) {
  ensure(
    Number.isInteger(tier) && tier >= 1 && tier <= 5,
    'lifestyle.tier',
    'Pick a tier from 1 to 5.',
  );
  p.lifestyleTier = tier;
  return { cost: lifestyleCost(world, p) };
}

/**
 * Wave 5: "zero personal cash": less than 2% of a month's living costs at
 * home and nothing in a dollar account. Broke founders can always take the
 * agency gig (no monthly cap, and whatever hours they have left).
 */
export function isBroke(world: World, p: Player): boolean {
  const m = getMarket(world, p.market);
  const local = account(world, p.accounts.local).balance;
  const usd = p.accounts.usd ? account(world, p.accounts.usd).balance : 0;
  return local < scale(col(m), 0.02) && usd <= 0;
}

/** The floor (§13): nobody is ever locked out. */
export function takeGig(world: World, p: Player, month: number) {
  const m = getMarket(world, p.market);
  const broke = isBroke(world, p);
  if (broke) {
    // Never stuck: no cap, and it fits whatever hours are left.
    p.hours.used = Math.min(p.hours.available, p.hours.used + m.data.floorGig.hours);
  } else {
    ensure(
      p.gigsThisMonth < GIGS_PER_MONTH,
      'gig.limit',
      `At most ${GIGS_PER_MONTH} gigs a month.`,
    );
    spendHours(p, m.data.floorGig.hours, 'A freelance gig');
  }
  const pay = floorGigPay(m);
  transfer(world, m.ext.gigs, p.accounts.local, pay, 'Freelance consulting gig', month);
  const tax = Math.round(pay * m.data.tax.personalIncome);
  transfer(world, p.accounts.local, m.ext.tax, tax, 'Personal income tax', month);
  p.gigsThisMonth += 1;
  return {
    pay,
    tax,
    text: `Gig done: ${formatMoney(pay, m.data.currency)}. Tax: ${formatMoney(tax, m.data.currency)}.`,
  };
}

export function openUsdAccount(world: World, p: Player) {
  ensure(!p.accounts.usd, 'usd.exists', 'You already have a dollar account.');
  ensure(
    account(world, p.accounts.local).currency !== 'USD',
    'usd.local',
    'Your account is already in dollars.',
  );
  p.accounts.usd = openAccount(world, {
    currency: 'USD',
    market: p.market,
    label: `${p.name} USD`,
  });
  return p.accounts.usd;
}

export function convertPersonal(
  world: World,
  p: Player,
  direction: 'toUsd' | 'toLocal',
  amount: number,
  month: number,
) {
  ensure(p.accounts.usd, 'usd.none', 'Open a dollar account first.');
  ensure(Number.isInteger(amount) && amount > 0, 'fx.amount', 'Enter an amount.');
  const [from, to] =
    direction === 'toUsd' ? [p.accounts.local, p.accounts.usd] : [p.accounts.usd, p.accounts.local];
  ensure(account(world, from).balance >= amount, 'fx.funds', 'Not enough money.');
  return convert(world, from, to, amount, 'Currency conversion', month);
}
