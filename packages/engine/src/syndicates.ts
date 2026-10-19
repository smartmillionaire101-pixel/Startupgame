/**
 * Syndicates (investor blueprint §8.1, Phase 3): a lead (rung 2) pools their
 * own cheque with backers' money for one deal. The syndicate has its own
 * account and invests as one holder; the company sees one deal card. At an
 * exit (or a dividend, or a wind-down) the cash is paid to members pro rata:
 * the lead's own share in full, each backer's after the lead's deal-by-deal
 * carry on that backer's profit. Capital gains tax is withheld where the
 * company is.
 *
 * Backers are human players (any of the lead's investor peers in the city
 * hear about it: co-investor referrals) and AI angels, who fill part of what
 * is left when the allocation closes (own RNG stream: 'syndicate'). A lead
 * who accepted an AI co-lead invitation gets that angel's matching cheque.
 * Investor-career worlds only.
 */
import { markValue } from './captable.js';
import { checkPersonalCap } from './career.js';
import { INVESTOR } from './data/investor.js';
import { aiRespond, openDeal } from './deals.js';
import { isHotRound } from './dealcraft.js';
import { ensure } from './errors.js';
import { activeAngels } from './angels.js';
import { recordRealised } from './exits.js';
import {
  achieve,
  getCompany,
  getMarket,
  locationOf,
  nextStage,
  notify,
  spendHours,
  usdToLocal,
} from './helpers.js';
import { newId } from './ids.js';
import { account, costIn, openAccount, pay, payExact, transfer, withTx } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney } from './money.js';
import { investorOn } from './releases.js';
import { deriveRng } from './rng.js';
import { hasVisited } from './travel.js';
import type { MarketId } from './data/markets.js';
import type { Id, InvestmentTerms, Player, Syndicate, SyndicateBacker, World } from './types.js';
import { valueCompany } from './valuation.js';

const syndicatesOf = (world: World): Record<Id, Syndicate> => (world.syndicates ??= {});

export function getSyndicate(world: World, id: Id): Syndicate {
  const s = world.syndicates?.[id];
  ensure(s, 'syndicate.missing', 'Syndicate not found.');
  return s;
}

const raised = (s: Syndicate) => s.leadAmount + s.backers.reduce((a, b) => a + b.amount, 0);
const fmt = (world: World, s: Syndicate, v: number) =>
  formatMoney(v, getMarket(world, s.market).data.currency);

export const minBack = (world: World, market: MarketId) =>
  usdToLocal(world, getMarket(world, market), INVESTOR.syndicate.minBackUsd);

/** `syndicate.open`: lead a deal, putting in your own cheque first. */
export function openSyndicate(
  world: World,
  me: Player,
  args: {
    companyId: Id;
    leadAmount: number;
    target: number;
    carry: number;
    instrument: 'safe' | 'priced';
    valuation: number;
    proRata: boolean;
    boardSeat: boolean;
  },
) {
  ensure(investorOn(world), 'syndicate.off', 'Syndicates aren’t open yet.');
  ensure(
    me.career?.reached[2] !== undefined,
    'syndicate.rung',
    `Syndicates open at rung 2: ${INVESTOR.ladder.syndicateDeals} angel deals and ${INVESTOR.ladder.syndicateStars}★.`,
  );
  const c = getCompany(world, args.companyId);
  ensure(c.status === 'active', 'company.closed', 'Company is not operating.');
  ensure(!c.founderIds.includes(me.id), 'invest.self', 'You can’t invest in your own company.');
  ensure(
    !c.bannedFromRaising,
    'invest.banned',
    'Confirmed fraud: this company is barred from raising.',
  );
  ensure(
    hasVisited(me, c.market),
    'invest.market',
    'You can back a startup in another market only after travelling there at least once.',
  );
  const [lo, hi] = INVESTOR.syndicate.carry;
  ensure(
    args.carry >= lo - 1e-9 && args.carry <= hi + 1e-9,
    'syndicate.carry',
    `Carry is ${Math.round(lo * 100)}–${Math.round(hi * 100)}% of backers’ profits.`,
  );
  ensure(args.leadAmount > 0, 'syndicate.amount', 'Put in your own cheque first.');
  ensure(
    args.target > args.leadAmount,
    'syndicate.target',
    'The target is what you and your backers put in together.',
  );
  ensure(
    args.valuation > args.target * 1.5,
    'deal.terms',
    'Valuation must be well above the amount.',
  );
  ensure(
    !Object.values(syndicatesOf(world)).some(
      (s) =>
        s.leadId === me.id &&
        s.companyId === c.id &&
        (s.status === 'open' || s.status === 'offered'),
    ),
    'syndicate.exists',
    'You already lead a syndicate into this company.',
  );
  const m = getMarket(world, c.market);
  checkPersonalCap(world, me, m.data.currency, args.leadAmount);
  const acc = account(world, me.accounts.local);
  ensure(
    acc.balance >= costIn(world, args.leadAmount, m.data.currency, acc.currency),
    'syndicate.funds',
    'Not enough money in your account for your own cheque.',
  );
  spendHours(me, INVESTOR.hours.syndicate, 'Setting up a syndicate');
  const id = newId(world, 'syn');
  const name = `${me.name.split(' ')[0]} × ${c.name} syndicate`;
  const accountId = openAccount(world, { currency: m.data.currency, market: m.id, label: name });
  payExact(
    world,
    me.accounts.local,
    accountId,
    args.leadAmount,
    `Syndicate: your cheque into ${c.name}`,
    m.month,
    'invested',
  );
  const s: Syndicate = {
    id,
    name,
    leadId: me.id,
    companyId: c.id,
    market: c.market,
    account: accountId,
    carry: args.carry,
    leadAmount: args.leadAmount,
    target: args.target,
    backers: [],
    terms: {
      instrument: args.instrument,
      valuation: args.valuation,
      proRata: args.proRata,
      boardSeat: args.instrument === 'priced' && args.boardSeat,
    },
    status: 'open',
    month: m.month,
    closesMonth: m.month + INVESTOR.syndicate.openMonths,
    invested: 0,
    proceeds: 0,
    carryPaid: 0,
    leadReturned: 0,
  };
  syndicatesOf(world)[id] = s;
  // An accepted co-lead invitation: that AI angel matches your cheque.
  const co = me.career?.coLead;
  if (co) {
    const angel = world.players[co.angelId];
    const fund = angel?.angel ? world.funds[angel.angel.fundId] : undefined;
    if (fund && fund.market === s.market) {
      const amount = Math.min(
        Math.round(args.leadAmount * INVESTOR.syndicate.coLeadMultiple),
        args.target - raised(s),
        account(world, fund.account).balance,
      );
      if (amount > 0) {
        transfer(
          world,
          fund.account,
          s.account,
          amount,
          `Syndicate: ${c.name}`,
          m.month,
          'invested',
        );
        s.backers.push({ playerId: null, fundId: fund.id, name: co.name, amount, returned: 0 });
      }
    }
    delete me.career!.coLead;
  }
  // Co-investor referrals: investors in the city and your contacts hear about it.
  const told = new Set<Id>();
  const tell = (pid: Id) => {
    if (pid === me.id || told.has(pid)) return;
    const p = world.players[pid];
    if (!p || p.ai) return;
    told.add(pid);
    notify(world, pid, {
      month: getMarket(world, p.market).month,
      kind: 'pitch',
      text: `${me.name} is leading a syndicate into ${c.name} and invites backers (from ${formatMoney(minBack(world, s.market), m.data.currency)}, ${Math.round(s.carry * 100)}% carry). It closes at month end.`,
      ref: { kind: 'company', id: c.id },
    });
  };
  for (const p of Object.values(world.players))
    if (!p.ai && p.market === c.market && p.role === 'investor') tell(p.id);
  for (const ct of me.contacts ?? []) if (ct.kind === 'player') tell(ct.refId);
  return {
    syndicateId: id,
    message: `${name} is open: ${fmt(world, s, raised(s))} of ${fmt(world, s, s.target)} so far.`,
  };
}

/** `syndicate.back`: put money into someone's syndicate. */
export function backSyndicate(world: World, me: Player, id: Id, amount: number) {
  const s = getSyndicate(world, id);
  ensure(s.status === 'open', 'syndicate.closed', 'This syndicate has closed its allocation.');
  ensure(
    s.leadId !== me.id,
    'syndicate.lead',
    'You lead this syndicate: your cheque is already in.',
  );
  const m = getMarket(world, s.market);
  const c = getCompany(world, s.companyId);
  ensure(!c.founderIds.includes(me.id), 'invest.self', 'You can’t invest in your own company.');
  ensure(
    amount >= minBack(world, s.market),
    'syndicate.min',
    `The smallest allocation is ${fmt(world, s, minBack(world, s.market))}.`,
  );
  ensure(
    raised(s) + amount <= s.target,
    'syndicate.full',
    `Only ${fmt(world, s, Math.max(0, s.target - raised(s)))} is left in this syndicate.`,
  );
  const mine = s.backers.find((b) => b.playerId === me.id);
  ensure(
    mine || s.backers.length < INVESTOR.syndicate.maxBackers,
    'syndicate.many',
    'This syndicate is full of backers.',
  );
  checkPersonalCap(world, me, m.data.currency, (mine?.amount ?? 0) + amount);
  const acc = account(world, me.accounts.local);
  ensure(
    acc.balance >= costIn(world, amount, m.data.currency, acc.currency),
    'syndicate.funds',
    'Not enough money in your account.',
  );
  payExact(
    world,
    me.accounts.local,
    s.account,
    amount,
    `Syndicate: ${c.name}`,
    m.month,
    'invested',
  );
  if (mine) mine.amount += amount;
  else s.backers.push({ playerId: me.id, name: me.name, amount, returned: 0 });
  notify(world, s.leadId, {
    month: m.month,
    kind: 'deal',
    text: `${me.name} backed your ${c.name} syndicate with ${fmt(world, s, amount)}.`,
  });
  return { message: `You’re in ${s.name} for ${fmt(world, s, (mine?.amount ?? 0) || amount)}.` };
}

/** Pay every member back what is in the account, pro rata to their allocation (no carry). */
function refundAll(world: World, s: Syndicate, memo: string) {
  const m = getMarket(world, s.market);
  const cash = account(world, s.account).balance;
  if (cash <= 0) return;
  const total = raised(s);
  let left = cash;
  const members = [
    { to: world.players[s.leadId]?.accounts.local, amount: s.leadAmount },
    ...s.backers.map((b) => ({
      to: b.playerId
        ? world.players[b.playerId]?.accounts.local
        : world.funds[b.fundId ?? '']?.account,
      amount: b.amount,
    })),
  ];
  members.forEach((x, i) => {
    const share =
      i === members.length - 1 ? left : Math.floor((cash * x.amount) / Math.max(1, total));
    left -= share;
    if (share > 0 && x.to) pay(world, s.account, x.to, share, memo, m.month, 'move');
  });
  // Anything that couldn't be returned (a deleted member) leaves to the outside world.
  const dust = account(world, s.account).balance;
  if (dust > 0) transfer(world, s.account, m.ext.lps, dust, memo, m.month);
}

/** `syndicate.close`: stop taking backers and offer the company one term sheet. */
export function closeSyndicate(world: World, me: Player, id: Id) {
  const s = getSyndicate(world, id);
  ensure(s.leadId === me.id, 'syndicate.lead', 'Only the lead closes the syndicate.');
  ensure(
    s.status === 'open',
    'syndicate.closed',
    'This syndicate has already closed its allocation.',
  );
  return offer(world, s);
}

function offer(world: World, s: Syndicate) {
  const c = getCompany(world, s.companyId);
  const m = getMarket(world, s.market);
  if (c.status !== 'active') {
    refundAll(world, s, `Syndicate refund: ${c.name} closed`);
    s.status = 'failed';
    return { status: s.status, message: `${c.name} has closed; everyone was refunded.` };
  }
  const stage = nextStage(c.lastRound);
  const terms: InvestmentTerms = {
    kind: 'investment',
    instrument: s.terms.instrument,
    stage,
    amount: raised(s),
    valuation: s.terms.valuation,
    liquidationMultiple: 1,
    participating: false,
    proRata: s.terms.proRata,
    boardSeat: s.terms.boardSeat,
    vetoOnSale: false,
    poolTopUpBps: s.terms.instrument === 'priced' ? 1000 : 0,
  };
  const model = valueCompany(world, c, stage).value;
  const deal = openDeal(world, {
    companyId: c.id,
    proposer: { kind: 'syndicate', id: s.id },
    counterparty: { kind: 'company', id: c.id },
    terms,
    by: s.leadId,
    aiLimit: { minValuation: Math.round(model * 0.85), maxAmount: Math.round(model * 0.3) },
  });
  s.status = 'offered';
  s.dealId = deal.id;
  // A hot round compares every offer at month end (Phase 8).
  if (c.ai && isHotRound(world, c)) deal.hot = true;
  else if (c.ai) aiRespond(world, deal);
  // AI founders answer at once: a decline releases everyone's money.
  if (deal.status === 'declined') failSyndicate(world, s, `${c.name} passed`);
  const status = s.status as Syndicate['status'];
  return {
    status,
    dealId: deal.id,
    message:
      status === 'closed'
        ? `${c.name} took the syndicate’s ${fmt(world, s, s.invested)}.`
        : status === 'failed'
          ? `${c.name} passed. Everyone was refunded.`
          : `Term sheet sent to ${c.name} for ${fmt(world, s, terms.amount)}.`,
    month: m.month,
  };
}

function failSyndicate(world: World, s: Syndicate, why: string) {
  const c = world.companies[s.companyId];
  refundAll(world, s, `Syndicate refund: ${c?.name ?? 'the company'}`);
  s.status = 'failed';
  const text = `${s.name}: ${why}. Every member was refunded.`;
  const month = getMarket(world, s.market).month;
  notify(world, s.leadId, { month, kind: 'deal', text });
  for (const b of s.backers)
    if (b.playerId) notify(world, b.playerId, { month, kind: 'deal', text });
}

/** `syndicate.cancel`: the lead calls it off before the offer; everyone is refunded. */
export function cancelSyndicate(world: World, me: Player, id: Id) {
  const s = getSyndicate(world, id);
  ensure(s.leadId === me.id, 'syndicate.lead', 'Only the lead can cancel the syndicate.');
  ensure(
    s.status === 'open',
    'syndicate.closed',
    'The offer has gone out; it can’t be cancelled now.',
  );
  refundAll(world, s, `Syndicate cancelled: refund`);
  s.status = 'cancelled';
  return { status: s.status };
}

/**
 * The deal executed (deals.ts): the syndicate holds the shares. If the
 * round took less than was pooled, each member gets the rest back and their
 * allocation shrinks to what was invested.
 */
export function syndicateInvested(world: World, id: Id, amount: number, month: number) {
  const s = world.syndicates?.[id];
  if (!s) return;
  const total = raised(s);
  if (amount < total) {
    const scale = amount / Math.max(1, total);
    refundAll(world, s, 'Syndicate: the round took less, refund');
    s.leadAmount = Math.round(s.leadAmount * scale);
    for (const b of s.backers) b.amount = Math.round(b.amount * scale);
    // Rounding: the lead's allocation absorbs any difference.
    s.leadAmount += amount - raised(s);
  }
  s.invested = amount;
  s.status = 'closed';
  const lead = world.players[s.leadId];
  if (lead && !lead.ai)
    achieve(world, lead, 'investor.first-syndicate', 'First syndicate led', month);
  const c = world.companies[s.companyId];
  for (const b of s.backers)
    if (b.playerId)
      notify(world, b.playerId, {
        month,
        kind: 'deal',
        text: `${s.name} closed: ${fmt(world, s, b.amount)} of yours is in ${c?.name ?? 'the company'}.`,
      });
}

/**
 * Pay out whatever cash the syndicate holds (an exit, a dividend, a
 * wind-down): pro rata to allocations; the lead's carry comes out of each
 * backer's profit; capital gains tax on gains, withheld where the company is.
 */
export function distributeSyndicate(world: World, s: Syndicate, month: number) {
  const cash = account(world, s.account).balance;
  if (cash <= 0 || s.status !== 'closed') return;
  const m = getMarket(world, s.market);
  const lead = world.players[s.leadId];
  const total = raised(s);
  const rate = m.data.tax.capitalGains;
  const company = world.companies[s.companyId]?.name ?? 'the company';
  let left = cash;
  let carryAll = 0;
  const profit = (returned: number, amount: number) => Math.max(0, returned - amount);
  const payPerson = (p: Player | undefined, gross: number, gain: number, memo: string) => {
    if (!p || gross <= 0) return;
    const tax = Math.round(gain * rate);
    withTx(world, { kind: 'sale' }, () => {
      transfer(world, s.account, m.ext.tax, tax, `Capital gains tax: ${company}`, month);
      pay(world, s.account, p.accounts.local, gross - tax, memo, month, 'move');
    });
    if (!p.ai) recordRealised(world, p, m, gross, gain, tax);
  };
  const shareOf = (amount: number, last: boolean) => {
    const v = last ? left : Math.floor((cash * amount) / Math.max(1, total));
    left -= v;
    return v;
  };
  const backers: SyndicateBacker[] = s.backers;
  backers.forEach((b) => {
    const share = shareOf(b.amount, false);
    const gainDelta = profit(b.returned + share, b.amount) - profit(b.returned, b.amount);
    const carry = Math.round(gainDelta * s.carry);
    carryAll += carry;
    b.returned += share;
    const net = share - carry;
    if (b.playerId) {
      payPerson(
        world.players[b.playerId],
        net,
        Math.max(0, gainDelta - carry),
        `Syndicate payout: ${company}`,
      );
      notify(world, b.playerId, {
        month,
        kind: 'deal',
        text: `${s.name} paid out: ${fmt(world, s, net)} to you after ${fmt(world, s, carry)} carry.`,
      });
    } else {
      const fund = world.funds[b.fundId ?? ''];
      if (fund && net > 0)
        pay(world, s.account, fund.account, net, `Syndicate payout: ${company}`, month);
    }
  });
  const leadShare = shareOf(s.leadAmount, true);
  const leadGain =
    profit(s.leadReturned + leadShare, s.leadAmount) - profit(s.leadReturned, s.leadAmount);
  s.leadReturned += leadShare;
  // The lead's own share, then the carry (both capital gains).
  payPerson(
    lead,
    leadShare + carryAll,
    leadGain + carryAll,
    `Syndicate payout and carry: ${company}`,
  );
  s.proceeds += cash;
  s.carryPaid += carryAll;
  if (lead && !lead.ai)
    notify(world, lead.id, {
      month,
      kind: 'deal',
      text: `${s.name} paid out ${fmt(world, s, cash)}. Your carry: ${fmt(world, s, carryAll)}.`,
    });
  const dust = account(world, s.account).balance;
  if (dust > 0) transfer(world, s.account, m.ext.lps, dust, 'Syndicate: rounding', month);
}

/**
 * Month end: AI angels back syndicates closing now, the allocation closes and
 * the offer goes out; failed offers refund everyone; cash that arrived is paid
 * out; syndicates in companies that are gone are finished.
 */
export function settleSyndicates(world: World, marketId: MarketId, month: number) {
  if (!investorOn(world) || !world.syndicates) return;
  for (const s of Object.values(world.syndicates)) {
    if (s.market !== marketId) continue;
    if (s.status === 'open' && month >= s.closesMonth) {
      aiBackers(world, s, month);
      offer(world, s);
      continue;
    }
    if (s.status === 'offered') {
      const d = s.dealId ? world.deals[s.dealId] : undefined;
      if (!d || d.status === 'declined' || d.status === 'expired' || d.status === 'withdrawn')
        failSyndicate(world, s, 'the company didn’t take the offer');
      continue;
    }
    if (s.status === 'closed') {
      distributeSyndicate(world, s, month);
      const c = world.companies[s.companyId];
      if (!c || c.status !== 'active') s.status = 'exited';
    }
  }
}

/** AI angels fill part of what is left (deterministic: own RNG stream). */
function aiBackers(world: World, s: Syndicate, month: number) {
  const c = world.companies[s.companyId];
  if (!c) return;
  const rng = deriveRng(world.seed, 'syndicate', s.id, month);
  const chance = clamp(0.25 + c.stars.value / 10, 0.25, 0.75);
  let added = 0;
  for (const angel of activeAngels(world, s.market)) {
    if (added >= 3 || raised(s) >= s.target || s.backers.length >= INVESTOR.syndicate.maxBackers)
      break;
    const fund = angel.angel ? world.funds[angel.angel.fundId] : undefined;
    if (!fund || s.backers.some((b) => b.fundId === fund.id)) continue;
    if (rng.next() > chance) continue;
    const amount = Math.min(
      fund.check[1],
      s.target - raised(s),
      account(world, fund.account).balance,
    );
    if (amount < minBack(world, s.market)) continue;
    transfer(world, fund.account, s.account, amount, `Syndicate: ${c.name}`, month, 'invested');
    s.backers.push({ playerId: null, fundId: fund.id, name: angel.name, amount, returned: 0 });
    added++;
  }
}

// ---------------------------------------------------------------- views

/** A member's stake in a syndicate at the latest mark (company currency). */
export function syndicateStake(world: World, s: Syndicate, playerId: Id): number {
  const c = world.companies[s.companyId];
  if (!c || c.status !== 'active' || s.status !== 'closed') return 0;
  const total = raised(s);
  const mine =
    s.leadId === playerId
      ? s.leadAmount
      : s.backers.filter((b) => b.playerId === playerId).reduce((a, b) => a + b.amount, 0);
  return total > 0 ? Math.round((markValue(c.capTable, s.id) * mine) / total) : 0;
}

/** `view.syndicates`: what you lead, what you backed, and what's open to back. */
export function syndicatesView(world: World, p: Player) {
  if (!investorOn(world) || p.ai) return null;
  const all = Object.values(world.syndicates ?? {});
  const row = (s: Syndicate) => {
    const c = world.companies[s.companyId];
    const m = getMarket(world, s.market);
    const mine = s.backers.find((b) => b.playerId === p.id);
    return {
      id: s.id,
      name: s.name,
      companyId: s.companyId,
      companyName: c?.name ?? '',
      companyStars: c ? Math.round(c.stars.value * 10) / 10 : 0,
      market: s.market,
      city: m.data.name,
      currency: m.data.currency,
      leadId: s.leadId,
      leadName: world.players[s.leadId]?.name ?? '',
      status: s.status,
      carry: s.carry,
      target: s.target,
      raised: raised(s),
      leadAmount: s.leadAmount,
      backers: s.backers.map((b) => ({ name: b.name, amount: b.amount, ai: b.playerId === null })),
      closesMonth: s.closesMonth,
      month: m.month,
      instrument: s.terms.instrument,
      valuation: s.terms.valuation,
      invested: s.invested,
      proceeds: s.proceeds,
      carryPaid: s.carryPaid,
      minBack: minBack(world, s.market),
      yours: s.leadId === p.id ? s.leadAmount : (mine?.amount ?? 0),
      yourReturned: s.leadId === p.id ? s.leadReturned : (mine?.returned ?? 0),
      yourMark: syndicateStake(world, s, p.id),
      dealId: s.dealId ?? null,
    };
  };
  const here = locationOf(p);
  return {
    canLead: p.career?.reached[2] !== undefined,
    carryRange: INVESTOR.syndicate.carry,
    led: all.filter((s) => s.leadId === p.id).map(row),
    backed: all.filter((s) => s.backers.some((b) => b.playerId === p.id)).map(row),
    open: all
      .filter(
        (s) =>
          s.status === 'open' &&
          s.leadId !== p.id &&
          !s.backers.some((b) => b.playerId === p.id) &&
          (s.market === p.market || s.market === here),
      )
      .map(row),
  };
}
