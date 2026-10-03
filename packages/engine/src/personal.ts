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
import type { Player, World } from './types.js';

export const GIGS_PER_MONTH = 2;
export const BURNOUT_ENERGY = 25;
export const OVERWORK_HOURS = 170;

export const tierOf = (p: Player) => LIFESTYLE_TIERS[clamp(p.lifestyleTier, 1, 5) - 1]!;

/** Monthly lifestyle cost in local minor units. */
export const lifestyleCost = (world: World, p: Player) =>
  scale(col(getMarket(world, p.market)), tierOf(p).costCol);

/** Hours available next month: base, background, lifestyle, energy and burnout. */
export function computeHours(p: Player): number {
  const bg = backgroundById(p.backgroundId);
  const base = BASE_HOURS + (bg?.hoursBonus ?? 0) + tierOf(p).hours;
  const energyFactor = 0.6 + (0.4 * p.energy) / 100;
  return Math.round(base * energyFactor * (p.burnout ? 0.7 : 1));
}

/**
 * Month-end for a person: pay for their lifestyle, recover or burn energy,
 * reset hours. Overspending drains savings; missed payments hurt credit.
 */
export function settlePerson(world: World, p: Player, month: number) {
  const m = getMarket(world, p.market);
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
  p.energy = clamp(p.energy + tierOf(p).recovery - 18 - overwork, 0, 100);
  const wasBurnt = p.burnout;
  p.burnout = p.energy < BURNOUT_ENERGY;
  if (p.burnout && !wasBurnt)
    notify(world, p.id, {
      month,
      kind: 'warning',
      text: 'You’re burning out. Fewer hours and worse decisions until you rest.',
    });
  p.hours = { available: computeHours(p), used: 0 };
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

/** The floor (§13): nobody is ever locked out. */
export function takeGig(world: World, p: Player, month: number) {
  const m = getMarket(world, p.market);
  ensure(p.gigsThisMonth < GIGS_PER_MONTH, 'gig.limit', `At most ${GIGS_PER_MONTH} gigs a month.`);
  spendHours(p, m.data.floorGig.hours, 'A freelance gig');
  const pay = m.data.floorGig.pay * 100;
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
