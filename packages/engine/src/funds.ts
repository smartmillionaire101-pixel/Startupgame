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
import { account, openAccount, pay, transfer, valueIn } from './ledger.js';
import { dealflowOn, investorOn } from './releases.js';
import { learningOf } from './dealflow.js';
import { INVESTOR } from './data/investor.js';
import type { InvestorType } from './data/programs.js';
import { reviewPitch } from './lpreview.js';
import type { StrategyPlan } from './lpreview.js';
import { lpsOf } from './programs.js';
import { deriveRng } from './rng.js';
import { distributeLpFund, lpFeeRate, payCarry } from './lpfunds.js';
import { feeRecipient } from './firms.js';
import { clamp, roundTo } from './math.js';
import { formatMoney } from './money.js';
import { newStars } from './stars.js';
import type { Fund, FundGeography, Player, Stage, World } from './types.js';

export const MIN_ANGEL_DEALS_FOR_FUND = 3;
/** An anchor LP's commitment adds this to the panel's score. */
export const ANCHOR_SCORE = 0.05;

/** A public-market buy (no deal card behind it): the cost basis is all on the listing. */
function publicOnly(world: World, investorId: string, companyId: string, invested: number) {
  const basis = world.companies[companyId]?.ipo?.basis?.[investorId] ?? 0;
  return basis > 0 && basis >= invested;
}

/**
 * The investor career's track record: private deals you made personally (a
 * listed share bought on the market isn't a deal) plus syndicates you led.
 */
export function angelRecord(world: World, p: Player) {
  const pos = Object.values(world.positions).filter(
    (x) => x.investorId === p.id && !publicOnly(world, x.investorId, x.companyId, x.invested),
  );
  const invested = pos.reduce((a, x) => a + x.invested, 0);
  const returned = pos.reduce((a, x) => a + x.returned, 0);
  const led = syndicatesLed(world, p.id);
  return {
    deals: pos.length + led.length,
    invested,
    returned,
    dpi: invested > 0 ? roundTo(returned / invested, 2) : 0,
    exits: pos.filter((x) => x.returned > 0 && !x.writtenOff).length,
    writeOffs: pos.filter((x) => x.writtenOff).length,
    syndicates: led.length,
  };
}

/** Syndicates this player led that closed (Phase 3). */
export function syndicatesLed(world: World, playerId: string) {
  return Object.values(world.syndicates ?? {}).filter(
    (s) => s.leadId === playerId && (s.status === 'closed' || s.status === 'exited'),
  );
}

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

/**
 * The AI LP panel's score (§7): background credibility, deals, cash
 * returned, stars and a focused thesis, less write-offs. 0.42 raises Fund I.
 */
export function lpPanelScore(
  p: Player,
  record: { deals: number; dpi: number; writeOffs: number },
  thesis: { sectors: unknown[]; stages: unknown[] },
) {
  const bg = backgroundById(p.backgroundId);
  const focus = (thesis.sectors.length <= 2 ? 0.1 : 0) + (thesis.stages.length === 1 ? 0.05 : 0);
  const score =
    (bg?.lpCredibility ?? 0.3) * 0.35 +
    Math.min(record.deals, 10) * 0.025 +
    Math.min(record.dpi, 3) * 0.12 +
    (p.stars.value / 5) * 0.2 +
    focus -
    record.writeOffs * 0.02;
  return { score, focus };
}

export interface FundThesis {
  sectors: Industry[];
  stages: Stage[];
  /** Typical cheque, local minor units. */
  checkSize: number;
  why: string;
}

/** Deal-flow note: the strategy pitched with Fund I (lpreview.ts). Money in local minor units. */
export interface FundPitchPlan {
  geography: FundGeography;
  size: number;
  avgCheque: number;
  companies: number;
  reserveRatio: number;
  targetOwnership: number;
  feeRate: number;
  carry: number;
}

/**
 * The AI LP panel tests the thesis and the track record. Narrower commitments
 * raise more but lock the investor in (§7). With the deal-flow note and a
 * strategy, the panel's LPs judge the strategy itself (`raiseWithPanel`).
 */
export function raiseFund(
  world: World,
  p: Player,
  thesis: FundThesis,
  month: number,
  opts: { plan?: FundPitchPlan; investorType?: InvestorType } = {},
) {
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
  // The investor career: buying listed shares isn't a deal, syndicates you led are.
  const record = investorOn(world) ? angelRecord(world, p) : trackRecord(world, [p.id]);
  ensure(
    record.deals >= MIN_ANGEL_DEALS_FOR_FUND,
    'fund.record',
    `AI LPs want at least ${MIN_ANGEL_DEALS_FOR_FUND} angel deals first. You have ${record.deals}.`,
  );
  if (opts.plan && dealflowOn(world))
    return raiseWithPanel(world, p, thesis, month, opts.plan, opts);
  const m = getMarket(world, p.market);
  const anchor = investorOn(world) ? p.career?.anchor : undefined;
  const panel = lpPanelScore(p, record, thesis);
  const focus = panel.focus;
  // An anchor LP makes the rest of the panel more willing (§8.2).
  const score = panel.score + (anchor ? ANCHOR_SCORE : 0);
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
  let total = size;
  if (anchor) {
    const amount = valueIn(world, anchor.amount, anchor.currency, m.data.currency);
    transfer(world, m.ext.lps, accountId, amount, `Anchor commitment: ${anchor.name}`, month);
    total += amount;
    delete p.career!.anchor;
  }
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
    size: total,
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
    text: `AI LPs committed ${formatMoney(total, m.data.currency)} to ${name}.`,
  });
  return { ok: true as const, score: roundTo(score, 2), fund };
}

/**
 * Deal-flow note: Fund I pitched as a strategy to the city's LPs. Each LP
 * asks its questions and commits or passes with a reason (lpreview.ts); the
 * fund closes if commitments (and any anchor) reach half the target, the
 * size of a first close. Every commitment is its own ledger transfer.
 */
function raiseWithPanel(
  world: World,
  p: Player,
  thesis: FundThesis,
  month: number,
  pitch: FundPitchPlan,
  opts: { investorType?: InvestorType },
) {
  const m = getMarket(world, p.market);
  const smallest = usdToLocal(world, m, 250_000);
  ensure(
    pitch.size >= smallest,
    'fund.size',
    `The smallest fund LPs look at is ${formatMoney(smallest, m.data.currency)}.`,
  );
  const plan: StrategyPlan = { sectors: thesis.sectors, stages: thesis.stages, ...pitch };
  const rng = deriveRng(world.seed, 'dealflow', 'panel', p.id, month);
  const review = reviewPitch(
    world,
    p,
    plan,
    lpsOf(m.id),
    { number: 1, type: opts.investorType ?? 'vc', month },
    rng,
  );
  const anchor = p.career?.anchor;
  const anchorAmount = anchor ? valueIn(world, anchor.amount, anchor.currency, m.data.currency) : 0;
  const need = Math.round(pitch.size * INVESTOR.fund.firstCloseShare);
  review.committed += anchorAmount;
  review.ok = review.committed >= need;
  learningOf(p).lastPanel = review;
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  if (!review.ok) {
    notify(world, p.id, {
      month,
      kind: 'system',
      text: `AI LP panel: ${fmt(review.committed)} committed of the ${fmt(need)} a first close needs. Read their questions and reasons, then pitch again.`,
    });
    return { ok: false as const, score: review.score, review };
  }
  const id = newId(world, 'fund');
  const name = `${p.name.split(' ')[0]} Capital Fund I`;
  const accountId = openAccount(world, { currency: m.data.currency, market: m.id, label: name });
  for (const v of review.lps)
    if (v.commit && v.amount > 0)
      transfer(world, m.ext.lps, accountId, v.amount, `LP commitment: ${v.name}`, month);
  if (anchor) {
    transfer(world, m.ext.lps, accountId, anchorAmount, `Anchor commitment: ${anchor.name}`, month);
    delete p.career!.anchor;
  }
  const fund: Fund = {
    id,
    name,
    market: m.id,
    ai: false,
    managerId: p.id,
    partner: p.name,
    sectors: thesis.sectors,
    stages: thesis.stages,
    check: [Math.round(pitch.avgCheque * 0.5), Math.round(pitch.avgCheque * 2)],
    minStars: 0,
    mood: 1,
    account: accountId,
    size: review.committed,
    vintageMonth: month,
    feeRate: pitch.feeRate,
    carry: pitch.carry,
    distributed: 0,
    thesis: thesis.why.trim().slice(0, 200),
    stars: newStars(p.stars.value),
  };
  world.funds[id] = fund;
  p.investor!.fundId = id;
  achieve(world, p, 'investor.fund-1', 'Fund I', month);
  notify(world, p.id, {
    month,
    kind: 'system',
    text: `${review.lps.filter((v) => v.commit).length} LPs committed ${fmt(review.committed)} to ${name}.`,
  });
  return { ok: true as const, score: review.score, fund, review };
}

/** Monthly management fee: 2%/year of fund size, paid to the manager as salary (taxed). */
export function settleFundFees(world: World, f: Fund, month: number) {
  if (f.ai || !f.managerId) return;
  const manager = world.players[f.managerId];
  if (!manager) return;
  // Investor career: a fund raised the full way pays from its first close, stepping down later.
  if (f.lp && f.lp.stage !== 'investing' && f.lp.stage !== 'harvest' && f.lp.stage !== 'extended')
    return;
  const m = getMarket(world, f.market);
  const fee = Math.round((f.size * lpFeeRate(world, f)) / 12);
  // Investor career Phase 6: the fee goes to the firm, which pays the team and then the GP.
  const firmAccount = feeRecipient(world, f);
  if (firmAccount) {
    const toFirm = Math.min(fee, account(world, f.account).balance);
    transfer(world, f.account, firmAccount, toFirm, 'Management fee', month);
    if (f.lp) f.lp.feesPaid += toFirm;
    return;
  }
  // Tax is withheld where the fund is; the rest reaches the manager (converted if they relocated).
  const paid = Math.min(fee, account(world, f.account).balance);
  const tax = Math.round(paid * m.data.tax.personalIncome);
  transfer(world, f.account, m.ext.tax, tax, 'Personal income tax (withheld)', month);
  pay(world, f.account, manager.accounts.local, paid - tax, 'Management fee', month);
  manager.lastMonth.income += paid;
  if (f.lp) f.lp.feesPaid += paid;
}

/**
 * Distribute cash a player-managed fund received from an exit: LPs get their
 * money back first, then the manager earns carry on profits.
 */
export function distributeFund(world: World, f: Fund, proceeds: number, month: number) {
  // Investor career Phase 4: a fund with an LP book pays every LP pro rata, then carry.
  if (f.lp) return distributeLpFund(world, f, proceeds, month);
  if (f.ai || !f.managerId) return;
  const m = getMarket(world, f.market);
  const before = f.distributed;
  const after = before + proceeds;
  const profitBefore = Math.max(0, before - f.size);
  const profitAfter = Math.max(0, after - f.size);
  const carry = Math.round((profitAfter - profitBefore) * f.carry);
  const manager = world.players[f.managerId];
  if (manager && carry > 0 && f.firmId) payCarry(world, f, manager, carry, month);
  else if (manager && carry > 0) {
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
