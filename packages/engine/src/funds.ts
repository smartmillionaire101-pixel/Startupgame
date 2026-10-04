/**
 * Investor career (§7): angel → (syndicate, phase 3) → Fund I from AI LPs.
 * Fund economics: ~2% management fee pays the manager; ~20% carry only after
 * LPs get their money back; AI LPs judge on cash returned, not paper value.
 */
import type { Industry } from './data/industries.js';
import { backgroundById } from './data/characters.js';
import { ensure } from './errors.js';
import { achieve, getMarket, notify, usdToLocal } from './helpers.js';
import { newId } from './ids.js';
import { account, openAccount, pay, transfer } from './ledger.js';
import { clamp, roundTo } from './math.js';
import { formatMoney } from './money.js';
import { newStars } from './stars.js';
import type { Fund, Player, Stage, World } from './types.js';

export const MIN_ANGEL_DEALS_FOR_FUND = 3;

export function trackRecord(world: World, investorIds: string[]) {
  const pos = Object.values(world.positions).filter((p) => investorIds.includes(p.investorId));
  const invested = pos.reduce((a, p) => a + p.invested, 0);
  const returned = pos.reduce((a, p) => a + p.returned, 0);
  return {
    deals: pos.length,
    invested,
    returned,
    dpi: invested > 0 ? roundTo(returned / invested, 2) : 0,
    exits: pos.filter((p) => p.returned > 0 && !p.writtenOff).length,
    writeOffs: pos.filter((p) => p.writtenOff).length,
  };
}

export interface FundThesis {
  sectors: Industry[];
  stages: Stage[];
  /** Typical cheque, local minor units. */
  checkSize: number;
  why: string;
}

/**
 * The AI LP panel tests the thesis and the track record. Narrower commitments
 * raise more but lock the investor in (§7).
 */
export function raiseFund(world: World, p: Player, thesis: FundThesis, month: number) {
  ensure(p.role === 'investor' && p.investor, 'fund.role', 'Only investors raise funds.');
  ensure(!p.investor.fundId, 'fund.exists', 'You already manage a fund. Fund II comes in phase 3.');
  ensure(
    thesis.sectors.length >= 1 && thesis.stages.length >= 1,
    'fund.thesis',
    'Pick at least one sector and stage.',
  );
  ensure(
    thesis.why.trim().length >= 10,
    'fund.thesis',
    'Say why now and why you’ll win, in a line.',
  );
  const record = trackRecord(world, [p.id]);
  ensure(
    record.deals >= MIN_ANGEL_DEALS_FOR_FUND,
    'fund.record',
    `AI LPs want at least ${MIN_ANGEL_DEALS_FOR_FUND} angel deals first. You have ${record.deals}.`,
  );
  const m = getMarket(world, p.market);
  const bg = backgroundById(p.backgroundId);
  const focus = (thesis.sectors.length <= 2 ? 0.1 : 0) + (thesis.stages.length === 1 ? 0.05 : 0);
  const score =
    (bg?.lpCredibility ?? 0.3) * 0.35 +
    Math.min(record.deals, 10) * 0.025 +
    Math.min(record.dpi, 3) * 0.12 +
    (p.stars.value / 5) * 0.2 +
    focus -
    record.writeOffs * 0.02;
  if (score < 0.42) {
    notify(world, p.id, {
      month,
      kind: 'system',
      text: 'AI LP panel: “Not yet. Show us cash returned, not paper gains.”',
    });
    return { ok: false as const, score: roundTo(score, 2) };
  }
  const sizeUsd =
    2_000_000 * Math.pow(score / 0.5, 2) * (1 + focus) * (m.data.multipleDiscount / 0.9);
  const size = usdToLocal(world, m, sizeUsd);
  const id = newId(world, 'fund');
  const name = `${p.name.split(' ')[0]} Capital Fund I`;
  const accountId = openAccount(world, { currency: m.data.currency, market: m.id, label: name });
  transfer(world, m.ext.lps, accountId, size, 'LP commitments (Fund I)', month);
  const fund: Fund = {
    id,
    name,
    market: m.id,
    ai: false,
    managerId: p.id,
    partner: p.name,
    sectors: thesis.sectors,
    stages: thesis.stages,
    check: [Math.round(thesis.checkSize * 0.5), Math.round(thesis.checkSize * 2)],
    minStars: 0,
    mood: 1,
    account: accountId,
    size,
    vintageMonth: month,
    feeRate: 0.02,
    carry: 0.2,
    distributed: 0,
    thesis: thesis.why.trim().slice(0, 200),
    stars: newStars(p.stars.value),
  };
  world.funds[id] = fund;
  p.investor.fundId = id;
  achieve(world, p, 'investor.fund-1', 'Fund I', month);
  notify(world, p.id, {
    month,
    kind: 'system',
    text: `AI LPs committed ${formatMoney(size, m.data.currency)} to ${name}.`,
  });
  return { ok: true as const, score: roundTo(score, 2), fund };
}

/** Monthly management fee: 2%/year of fund size, paid to the manager as salary (taxed). */
export function settleFundFees(world: World, f: Fund, month: number) {
  if (f.ai || !f.managerId) return;
  const manager = world.players[f.managerId];
  if (!manager) return;
  const m = getMarket(world, f.market);
  const fee = Math.round((f.size * f.feeRate) / 12);
  // Tax is withheld where the fund is; the rest reaches the manager (converted if they relocated).
  const paid = Math.min(fee, account(world, f.account).balance);
  const tax = Math.round(paid * m.data.tax.personalIncome);
  transfer(world, f.account, m.ext.tax, tax, 'Personal income tax (withheld)', month);
  pay(world, f.account, manager.accounts.local, paid - tax, 'Management fee', month);
  manager.lastMonth.income += paid;
}

/**
 * Distribute cash a player-managed fund received from an exit: LPs get their
 * money back first, then the manager earns carry on profits.
 */
export function distributeFund(world: World, f: Fund, proceeds: number, month: number) {
  if (f.ai || !f.managerId) return;
  const m = getMarket(world, f.market);
  const before = f.distributed;
  const after = before + proceeds;
  const profitBefore = Math.max(0, before - f.size);
  const profitAfter = Math.max(0, after - f.size);
  const carry = Math.round((profitAfter - profitBefore) * f.carry);
  const manager = world.players[f.managerId];
  if (manager && carry > 0) {
    const tax = Math.round(carry * m.data.tax.capitalGains);
    transfer(world, f.account, m.ext.tax, tax, 'Capital gains tax on carry (withheld)', month);
    pay(world, f.account, manager.accounts.local, carry - tax, 'Carried interest', month);
    notify(world, manager.id, {
      month,
      kind: 'deal',
      text: `Carry paid: ${formatMoney(carry, m.data.currency)}. Tax: ${formatMoney(tax, m.data.currency)}.`,
    });
  }
  transfer(world, f.account, m.ext.lps, proceeds - carry, 'Distribution to LPs', month);
  f.distributed = after;
  if (manager) {
    const multiple = after / Math.max(1, f.size);
    if (multiple >= 1) achieve(world, manager, 'investor.fund-1x', 'Fund returned 1x', month);
    if (multiple >= 3) achieve(world, manager, 'investor.fund-3x', 'Fund returned 3x', month);
    if (multiple >= 10) achieve(world, manager, 'investor.fund-10x', 'Fund returned 10x', month);
  }
  f.mood = clamp(f.mood + 0.05, 0.5, 1.5);
}
