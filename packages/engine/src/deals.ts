/**
 * Deal cards (§9). Chats are for talking; deal cards are for committing.
 * Both sides see the same terms on one screen, either side can counter, and
 * once both accept the deal executes: money moves through banks and cap
 * tables update. Deal cards are the only evidence used in disputes.
 */
import { addSafe, closePricedRound, fullyDiluted, waterfall } from './captable.js';
import type { WaterfallLine } from './captable.js';
import { ensure, fail } from './errors.js';
import { achieve, adjustTrust, holderAccount, getCompany, getMarket, notify } from './helpers.js';
import { newId } from './ids.js';
import { account, pay, payExact, costIn, transfer } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney } from './money.js';
import { applyStarEvent } from './stars.js';
import { distributeFund } from './funds.js';
import type {
  AcquisitionTerms,
  CofounderTerms,
  Company,
  DealCard,
  DealTerms,
  Id,
  InvestmentTerms,
  LoanTerms,
  PartyRef,
  PersonalLoanTerms,
  SupplyTerms,
  World,
} from './types.js';
import type { MarketId } from './data/markets.js';
import { executePersonalLoan } from './credit.js';
import { contractFlags, startContract } from './marketplace.js';
import { openVote, requiresVote } from './governance.js';
import { executePlayerAcquisition } from './acquisitions.js';

export const DEAL_LIFETIME_MONTHS = 2;

/** What a deal is about: a company, or (for personal loans) just a market. */
interface DealContext {
  market: MarketId;
  company: Company | null;
}

const money = (world: World, ctx: DealContext, v: number) =>
  formatMoney(v, getMarket(world, ctx.market).data.currency);

const contextOf = (world: World, d: Pick<DealCard, 'market' | 'companyId'>): DealContext => ({
  market: d.market,
  company: d.companyId ? getCompany(world, d.companyId) : null,
});
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

export function monthlyPayment(principal: number, rateBps: number, months: number): number {
  const r = rateBps / 10_000 / 12;
  if (r === 0) return Math.ceil(principal / months);
  return Math.ceil((principal * r) / (1 - Math.pow(1 + r, -months)));
}

/** Guardrail flags a proposed supply deal would carry (shown before signing). */
function contractFlagsFor(world: World, t: SupplyTerms, sellerId: Id): string[] {
  const seller = world.companies[sellerId];
  const buyer = world.companies[t.buyerId];
  return seller && buyer ? contractFlags(world, buyer, seller, t.price) : [];
}

/** Plain-language one-liner shown on the deal card (§9 "Term sheets"). */
export function summarise(
  world: World,
  c: DealContext,
  terms: DealTerms,
  partyName: string,
): string {
  switch (terms.kind) {
    case 'investment': {
      const owns =
        terms.instrument === 'priced'
          ? terms.amount / (terms.valuation + terms.amount)
          : terms.amount / terms.valuation;
      const pref =
        terms.liquidationMultiple > 1 || terms.participating
          ? ` They get ${terms.liquidationMultiple}x back first${terms.participating ? ' and share the rest' : ''} if you sell.`
          : ' They get paid back first if you sell.';
      const extras = [
        terms.boardSeat && 'a board seat',
        terms.vetoOnSale && 'a veto on any sale',
        terms.proRata && 'pro-rata rights',
      ].filter(Boolean);
      const pool = terms.poolTopUpBps
        ? ` A ${terms.poolTopUpBps / 100}% staff option pool comes out of your side first.`
        : '';
      const head =
        terms.instrument === 'safe'
          ? `${partyName} puts in ${money(world, c, terms.amount)} now for about ${pct(owns)} later (cap ${money(world, c, terms.valuation)}).`
          : `${partyName} gets ${pct(owns)} for ${money(world, c, terms.amount)}.`;
      return `${head}${pref}${extras.length ? ` Plus ${extras.join(', ')}.` : ''}${pool}`;
    }
    case 'loan': {
      const pay = monthlyPayment(terms.amount, terms.rateBps, terms.months);
      return `${money(world, c, terms.amount)} now. You repay ${money(world, c, pay)} a month for ${terms.months} months at ${terms.rateBps / 100}% a year.${terms.personalGuarantee ? ' Your personal savings are on the line if the company defaults.' : ''}`;
    }
    case 'cofounder':
      return `${partyName} joins as ${terms.title} for ${terms.equityBps / 100}%, vesting over ${terms.vestingMonths / 12} years with a ${terms.cliffMonths}-month cliff.`;
    case 'acquisition':
      return `${terms.buyer} buys ${c.company?.name ?? 'the company'} for ${money(world, c, terms.price)}. The waterfall shows who gets what.`;
    case 'supply': {
      const listing = world.listings[terms.listingId];
      const flags = listing && c.company ? contractFlagsFor(world, terms, c.company.id) : [];
      return `${c.company?.name ?? 'The supplier'} supplies ${listing?.category.toLowerCase() ?? 'services'} for ${money(world, c, terms.price)} a month, for ${terms.months} months.${flags.length ? ` Flagged: ${flags.join(', ')}.` : ''}`;
    }
    case 'personal-loan': {
      const pay = monthlyPayment(terms.amount, terms.rateBps, terms.months);
      return `${partyName} lends you ${money(world, c, terms.amount)}. You repay ${money(world, c, pay)} a month for ${terms.months} months at ${terms.rateBps / 100}% a year.${terms.collateral ? ` ${terms.collateral.label} is pledged; the bank takes it if you default.` : ' Unsecured: a default damages your credit profile.'}`;
    }
  }
}

export function partyName(world: World, p: PartyRef): string {
  switch (p.kind) {
    case 'player':
      return world.players[p.id]?.name ?? 'A player';
    case 'fund':
      return world.funds[p.id]?.name ?? 'A fund';
    case 'company':
      return world.companies[p.id]?.name ?? 'The company';
    case 'bank':
      return getMarket(world, p.id as never)?.bankName ?? 'The bank';
    case 'corporate':
      return p.id;
  }
}

/** Is this party controlled by a human, and if so which player acts for it? */
export function humanFor(world: World, p: PartyRef): Id | null {
  if (p.kind === 'player') return world.players[p.id]?.ai ? null : p.id;
  if (p.kind === 'fund') return world.funds[p.id]?.managerId ?? null;
  if (p.kind === 'company') {
    const c = world.companies[p.id];
    if (!c || c.ai) return null;
    return c.founderIds.find((f) => !world.players[f]?.ai) ?? null;
  }
  return null;
}

export function canAct(world: World, actorId: Id, p: PartyRef): boolean {
  if (p.kind === 'player') return p.id === actorId;
  if (p.kind === 'fund') return world.funds[p.id]?.managerId === actorId;
  if (p.kind === 'company') return !!world.companies[p.id]?.founderIds.includes(actorId);
  return false;
}

export function openDeal(
  world: World,
  args: {
    companyId: Id | null;
    /** Required when there is no company. */
    market?: MarketId;
    proposer: PartyRef;
    counterparty: PartyRef;
    terms: DealTerms;
    aiLimit?: DealCard['aiLimit'];
    by: Id;
  },
): DealCard {
  const company = args.companyId ? getCompany(world, args.companyId) : null;
  const market = company?.market ?? args.market;
  ensure(market, 'deal.market', 'A deal needs a company or a market.');
  const m = getMarket(world, market);
  const ctx: DealContext = { market, company };
  const name = partyName(
    world,
    args.terms.kind === 'cofounder' ? args.counterparty : args.proposer,
  );
  const deal: DealCard = {
    id: newId(world, 'deal'),
    market,
    companyId: company?.id ?? null,
    proposer: args.proposer,
    counterparty: args.counterparty,
    awaiting: args.counterparty,
    status: 'open',
    terms: args.terms,
    summary: summarise(world, ctx, args.terms, name),
    history: [],
    createdMonth: m.month,
    expiresMonth: m.month + DEAL_LIFETIME_MONTHS,
    ...(args.aiLimit ? { aiLimit: args.aiLimit } : {}),
  };
  deal.history.push({ month: m.month, by: args.by, action: 'propose', summary: deal.summary });
  world.deals[deal.id] = deal;
  const human = humanFor(world, args.counterparty);
  if (human)
    notify(world, human, {
      month: m.month,
      kind: 'deal',
      text: `New deal card: ${deal.summary}`,
      ref: { kind: 'deal', id: deal.id },
    });
  return deal;
}

const other = (d: DealCard, p: PartyRef): PartyRef =>
  d.proposer.kind === p.kind && d.proposer.id === p.id ? d.counterparty : d.proposer;

/** Apply counter terms: only the economic fields may change. */
function mergeCounter(terms: DealTerms, counter: Partial<DealTerms>): DealTerms {
  switch (terms.kind) {
    case 'investment': {
      const c = counter as Partial<InvestmentTerms>;
      return {
        ...terms,
        amount: c.amount ?? terms.amount,
        valuation: c.valuation ?? terms.valuation,
        boardSeat: c.boardSeat ?? terms.boardSeat,
        proRata: c.proRata ?? terms.proRata,
        vetoOnSale: c.vetoOnSale ?? terms.vetoOnSale,
      };
    }
    case 'loan': {
      const c = counter as Partial<LoanTerms>;
      return {
        ...terms,
        amount: c.amount ?? terms.amount,
        months: c.months ?? terms.months,
        personalGuarantee: c.personalGuarantee ?? terms.personalGuarantee,
      };
    }
    case 'cofounder': {
      const c = counter as Partial<CofounderTerms>;
      return { ...terms, equityBps: c.equityBps ?? terms.equityBps, title: c.title ?? terms.title };
    }
    case 'acquisition': {
      const c = counter as Partial<AcquisitionTerms>;
      return { ...terms, price: c.price ?? terms.price };
    }
    case 'supply': {
      const c = counter as Partial<SupplyTerms>;
      return { ...terms, price: c.price ?? terms.price, months: c.months ?? terms.months };
    }
    case 'personal-loan': {
      const c = counter as Partial<PersonalLoanTerms>;
      return { ...terms, amount: c.amount ?? terms.amount, months: c.months ?? terms.months };
    }
  }
}

function validateTerms(terms: DealTerms) {
  switch (terms.kind) {
    case 'investment':
      ensure(
        terms.amount > 0 && terms.valuation > terms.amount * 1.5,
        'deal.terms',
        'Valuation must be well above the amount.',
      );
      break;
    case 'loan':
    case 'personal-loan':
      ensure(
        terms.amount > 0 && terms.months >= 3 && terms.months <= 60,
        'deal.terms',
        'Loans run 3–60 months.',
      );
      break;
    case 'cofounder':
      ensure(
        terms.equityBps >= 100 && terms.equityBps <= 5000,
        'deal.terms',
        'Co-founder equity must be 1–50%.',
      );
      break;
    case 'acquisition':
      ensure(terms.price > 0, 'deal.terms', 'Price must be positive.');
      break;
    case 'supply':
      ensure(
        terms.price > 0 && terms.months >= 1 && terms.months <= 36,
        'deal.terms',
        'Contracts run 1–36 months at a positive price.',
      );
      break;
  }
}

export type DealAction =
  | { action: 'accept' }
  | { action: 'decline' }
  | { action: 'withdraw' }
  | { action: 'counter'; terms: Partial<DealTerms> };

/**
 * A party moves on a deal. If the other side is AI it answers immediately,
 * so a human never waits on the simulation.
 */
export function actOnDeal(
  world: World,
  dealId: Id,
  actor: PartyRef,
  actorPlayerId: Id,
  act: DealAction,
): DealCard {
  const d = world.deals[dealId];
  ensure(d, 'deal.missing', 'Deal not found.');
  ensure(d.status === 'open', 'deal.closed', 'This deal is no longer open.');
  const m = getMarket(world, d.market);
  const c = contextOf(world, d);
  const isProposer = d.proposer.kind === actor.kind && d.proposer.id === actor.id;
  const isCounterparty = d.counterparty.kind === actor.kind && d.counterparty.id === actor.id;
  ensure(isProposer || isCounterparty, 'deal.forbidden', 'You are not a party to this deal.');

  if (act.action === 'withdraw') {
    d.status = 'withdrawn';
    d.history.push({
      month: m.month,
      by: actorPlayerId,
      action: 'withdraw',
      summary: 'Withdrawn.',
    });
    return d;
  }
  ensure(
    d.awaiting.kind === actor.kind && d.awaiting.id === actor.id,
    'deal.turn',
    'Waiting on the other side.',
  );

  if (act.action === 'decline') {
    d.status = 'declined';
    d.history.push({ month: m.month, by: actorPlayerId, action: 'decline', summary: 'Declined.' });
    const h = humanFor(world, other(d, actor));
    if (h)
      notify(world, h, {
        month: m.month,
        kind: 'deal',
        text: `${partyName(world, actor)} declined: ${d.summary}`,
        ref: { kind: 'deal', id: d.id },
      });
    return d;
  }

  if (act.action === 'counter') {
    const terms = mergeCounter(d.terms, act.terms);
    validateTerms(terms);
    d.terms = terms;
    d.summary = summarise(
      world,
      c,
      terms,
      partyName(world, d.terms.kind === 'cofounder' ? d.counterparty : d.proposer),
    );
    d.awaiting = other(d, actor);
    d.expiresMonth = Math.max(d.expiresMonth, m.month + 1);
    d.history.push({ month: m.month, by: actorPlayerId, action: 'counter', summary: d.summary });
    const h = humanFor(world, d.awaiting);
    if (h)
      notify(world, h, {
        month: m.month,
        kind: 'deal',
        text: `Counter-offer: ${d.summary}`,
        ref: { kind: 'deal', id: d.id },
      });
    else aiRespond(world, d);
    return d;
  }

  executeDeal(world, d, actorPlayerId);
  return d;
}

/** How AI counterparties answer an offer or counter: accept within limits, meet once, or walk. */
export function aiRespond(world: World, d: DealCard) {
  const m = getMarket(world, d.market);
  const lim = d.aiLimit ?? {};
  const counters = d.history.filter((h) => h.action === 'counter').length;
  const say = (action: 'accept' | 'decline' | 'counter', summary: string) =>
    d.history.push({ month: m.month, by: d.awaiting.id, action, summary });

  let within = false;
  let meet: Partial<DealTerms> | null = null;
  const t = d.terms;
  if (t.kind === 'investment') {
    if (d.awaiting.kind === 'fund') {
      // AI investor: founder wants a higher valuation and/or more money.
      within =
        t.valuation <= (lim.maxValuation ?? t.valuation) && t.amount <= (lim.maxAmount ?? t.amount);
      if (!within && t.valuation <= (lim.maxValuation ?? 0) * 1.3) {
        meet = {
          valuation: Math.min(t.valuation, lim.maxValuation ?? t.valuation),
          amount: Math.min(t.amount, lim.maxAmount ?? t.amount),
        };
      }
    } else {
      // AI founder: investor wants a lower valuation.
      within = t.valuation >= (lim.minValuation ?? 0) && t.amount <= (lim.maxAmount ?? t.amount);
      if (!within && t.valuation >= (lim.minValuation ?? 0) * 0.75) {
        meet = {
          valuation: Math.max(t.valuation, lim.minValuation ?? t.valuation),
          amount: Math.min(t.amount, lim.maxAmount ?? t.amount),
        };
      }
    }
  } else if (t.kind === 'loan' || t.kind === 'personal-loan') {
    within = t.amount <= (lim.maxAmount ?? t.amount);
    if (!within) meet = { amount: lim.maxAmount ?? t.amount };
  } else if (t.kind === 'supply') {
    // AI seller: accepts at or near its list price.
    within = t.price >= (lim.minValuation ?? 0);
    if (!within && t.price >= (lim.minValuation ?? 0) * 0.75)
      meet = { price: lim.minValuation ?? t.price };
  } else if (t.kind === 'acquisition' && lim.minValuation !== undefined) {
    // AI founders selling to a player company: want at least their price.
    within = t.price >= lim.minValuation;
    if (!within && t.price >= lim.minValuation * 0.75) meet = { price: lim.minValuation };
  } else if (t.kind === 'acquisition') {
    within = t.price <= (lim.maxValuation ?? t.price);
    if (!within && t.price <= (lim.maxValuation ?? 0) * 1.3)
      meet = { price: lim.maxValuation ?? t.price };
  } else {
    within = true;
  }

  if (within) {
    say('accept', 'Accepted.');
    executeDeal(world, d, d.awaiting.id);
    return;
  }
  if (meet && counters <= 1) {
    const responder = d.awaiting;
    d.terms = mergeCounter(d.terms, meet);
    d.summary = summarise(
      world,
      contextOf(world, d),
      d.terms,
      partyName(world, d.terms.kind === 'cofounder' ? d.counterparty : d.proposer),
    );
    d.awaiting = other(d, responder);
    say('counter', `Our best: ${d.summary}`);
    const h = humanFor(world, d.awaiting);
    if (h)
      notify(world, h, {
        month: m.month,
        kind: 'deal',
        text: `Their best offer: ${d.summary}`,
        ref: { kind: 'deal', id: d.id },
      });
    return;
  }
  d.status = 'declined';
  say('decline', 'We’re too far apart.');
  const h = humanFor(world, other(d, d.awaiting));
  if (h)
    notify(world, h, {
      month: m.month,
      kind: 'deal',
      text: `${partyName(world, d.awaiting)} walked away: “We’re too far apart.”`,
      ref: { kind: 'deal', id: d.id },
    });
}

/** The money account a party pays from / is paid into. */
export function partyAccount(world: World, p: PartyRef): Id {
  switch (p.kind) {
    case 'player': {
      const pl = world.players[p.id];
      ensure(pl, 'player.missing', 'Player not found.');
      return pl.accounts.local;
    }
    case 'fund':
      return world.funds[p.id]!.account;
    case 'company':
      return world.companies[p.id]!.account;
    case 'bank':
      return getMarket(world, p.id as never).ext.bank;
    case 'corporate':
      return fail('deal.party', 'AI corporates pay through the exit waterfall.');
  }
}

function recordPosition(
  world: World,
  investorId: Id,
  companyId: Id,
  amount: number,
  month: number,
) {
  const key = `${investorId}:${companyId}`;
  const pos = (world.positions[key] ??= {
    investorId,
    companyId,
    invested: 0,
    returned: 0,
    month,
    writtenOff: false,
  });
  const followOn = pos.invested > 0;
  pos.invested += amount;
  return followOn;
}

/** Execute an accepted deal. Throws (rolling back the whole command) if money is short. */
export function executeDeal(world: World, d: DealCard, by: Id, opts: { approved?: boolean } = {}) {
  const m = getMarket(world, d.market);
  const t = d.terms;
  // Major decisions go to a board or shareholder vote first (§9).
  if (!opts.approved && !d.pendingVoteId) {
    const kind = requiresVote(world, d);
    if (kind) {
      const reason =
        kind === 'sale' ? `Approve the sale: ${d.summary}` : `Approve the round: ${d.summary}`;
      d.history.push({
        month: m.month,
        by,
        action: 'accept',
        summary:
          kind === 'sale'
            ? 'Accepted, subject to a shareholder vote.'
            : 'Accepted, subject to a board vote.',
      });
      const proposer =
        humanFor(world, d.companyId ? { kind: 'company', id: d.companyId } : d.counterparty) ?? by;
      const v = openVote(world, {
        companyId: d.companyId!,
        kind,
        dealId: d.id,
        proposerId: proposer,
        reason,
      });
      if (v.status === 'open') d.pendingVoteId = v.id;
      return;
    }
  }
  if (d.status !== 'open') return;
  if (t.kind === 'personal-loan') {
    executePersonalLoan(world, d, t);
    d.status = 'accepted';
    d.history.push({ month: m.month, by, action: 'accept', summary: 'Accepted. Deal executed.' });
    return;
  }
  if (t.kind === 'supply') {
    startContract(world, t.listingId, t.buyerId, t.price, t.months);
    d.status = 'accepted';
    d.history.push({ month: m.month, by, action: 'accept', summary: 'Accepted. Contract signed.' });
    return;
  }
  ensure(d.companyId, 'deal.company', 'This deal has no company.');
  const c = getCompany(world, d.companyId);
  ensure(c.status === 'active', 'company.closed', 'The company is no longer operating.');
  switch (t.kind) {
    case 'investment': {
      const investor = d.proposer.kind === 'company' ? d.counterparty : d.proposer;
      const holderId = investor.id;
      const from = partyAccount(world, investor);
      // Cross-market investors pay in their own currency: conversion fee and currency risk apply (§7).
      const cost = costIn(world, t.amount, m.data.currency, account(world, from).currency);
      if (account(world, from).balance < cost)
        fail('deal.funds', `${partyName(world, investor)} doesn’t have the money for this deal.`);
      payExact(world, from, c.account, t.amount, `Investment in ${c.name} (${t.stage})`, m.month);
      if (t.instrument === 'safe') {
        addSafe(c.capTable, { holderId, amount: t.amount, cap: t.valuation, month: m.month });
        c.capTable.lastPostMoney = Math.max(c.capTable.lastPostMoney, t.valuation);
      } else {
        closePricedRound(c.capTable, {
          investorId: holderId,
          amount: t.amount,
          preMoney: t.valuation,
          poolTopUpBps: t.poolTopUpBps,
          multiple: t.liquidationMultiple,
          participating: t.participating,
        });
      }
      c.lastRound = t.stage;
      c.lastRaiseMonth = m.month;
      c.raising = false;
      // Board composition changes with each round (§9).
      if (t.boardSeat && !c.board.includes(holderId)) c.board.push(holderId);
      if (t.vetoOnSale && !c.vetoes.includes(holderId)) c.vetoes.push(holderId);
      const followOn = recordPosition(world, holderId, c.id, t.amount, m.month);
      for (const fid of c.founderIds) {
        const f = world.players[fid];
        if (!f) continue;
        adjustTrust(f, holderId, 0.15);
        achieve(world, f, 'founder.first-raise', 'First raise', m.month);
        if (t.stage === 'series-a') achieve(world, f, 'founder.series-a', 'Series A', m.month);
        notify(world, fid, {
          month: m.month,
          kind: 'deal',
          text: `Deal closed: ${d.summary}`,
          ref: { kind: 'deal', id: d.id },
        });
      }
      const investorPlayer =
        investor.kind === 'player'
          ? world.players[investor.id]
          : investor.kind === 'fund' && world.funds[investor.id]?.managerId
            ? world.players[world.funds[investor.id]!.managerId!]
            : undefined;
      if (investorPlayer && !investorPlayer.ai) {
        achieve(world, investorPlayer, 'investor.first-check', 'First cheque', m.month);
        if (followOn)
          achieve(world, investorPlayer, 'investor.first-follow-on', 'First follow-on', m.month);
        if (t.boardSeat)
          achieve(world, investorPlayer, 'investor.first-board-seat', 'First board seat', m.month);
        for (const fid of c.founderIds) adjustTrust(investorPlayer, fid, 0.15);
        notify(world, investorPlayer.id, {
          month: m.month,
          kind: 'deal',
          text: `Deal closed: ${d.summary}`,
          ref: { kind: 'deal', id: d.id },
        });
      }
      break;
    }
    case 'loan': {
      const lenderAcc = partyAccount(world, d.proposer);
      transfer(
        world,
        lenderAcc,
        c.account,
        t.amount,
        `Loan from ${partyName(world, d.proposer)}`,
        m.month,
      );
      const founder = c.founderIds[0] ?? null;
      c.finance.loans.push({
        id: newId(world, 'loan'),
        lender: partyName(world, d.proposer),
        principal: t.amount,
        outstanding: t.amount,
        rateBps: (d.terms as LoanTerms).rateBps,
        monthlyPayment: monthlyPayment(t.amount, t.rateBps, t.months),
        monthsLeft: t.months,
        personalGuarantee: t.personalGuarantee ? founder : null,
      });
      for (const fid of c.founderIds)
        notify(world, fid, {
          month: m.month,
          kind: 'deal',
          text: `Loan received: ${d.summary}`,
          ref: { kind: 'deal', id: d.id },
        });
      break;
    }
    case 'cofounder': {
      const joiner = world.players[d.counterparty.id];
      ensure(joiner, 'player.missing', 'Co-founder not found.');
      ensure(!c.founderIds.includes(joiner.id), 'deal.cofounder', 'Already a co-founder.');
      const fd = fullyDiluted(c.capTable);
      const shares = Math.round((fd * t.equityBps) / (10_000 - t.equityBps));
      c.capTable.holdings[joiner.id] = { shares, kind: 'founder' };
      c.founderIds.push(joiner.id);
      joiner.companyIds.push(c.id);
      for (const fid of c.founderIds) adjustTrust(world.players[fid], joiner.id, 0.1);
      for (const fid of c.founderIds)
        notify(world, fid, {
          month: m.month,
          kind: 'deal',
          text: `${joiner.name} is now ${t.title} of ${c.name}.`,
        });
      break;
    }
    case 'acquisition': {
      if (t.buyerCompanyId) executePlayerAcquisition(world, d, t);
      else settleExit(world, c, t.price, t.buyer, 'acquired');
      break;
    }
  }
  d.status = 'accepted';
  d.history.push({ month: m.month, by, action: 'accept', summary: 'Accepted. Deal executed.' });
}

/**
 * Pay out an exit through the waterfall (§12): proceeds go to holders by
 * preference; players pay capital gains tax ("You sold shares for ₦50m. Tax: ₦5m.").
 */
export function settleExit(
  world: World,
  c: Company,
  proceeds: number,
  buyer: string,
  status: 'acquired',
): WaterfallLine[] {
  const m = getMarket(world, c.market);
  const lines = waterfall(c.capTable, proceeds);
  for (const line of lines) {
    if (line.total <= 0) continue;
    const player = world.players[line.holderId];
    const fund = world.funds[line.holderId];
    const pos = world.positions[`${line.holderId}:${c.id}`];
    if (pos) pos.returned += line.total;
    if (player) {
      // Capital gains tax is withheld where the company is; the rest is paid
      // out, converted if the holder lives in another market.
      const basis = pos?.invested ?? 0;
      const tax = Math.max(0, Math.round((line.total - basis) * m.data.tax.capitalGains));
      transfer(world, m.ext.lps, m.ext.tax, tax, `Capital gains tax: ${c.name}`, m.month);
      pay(
        world,
        m.ext.lps,
        player.accounts.local,
        line.total - tax,
        `Exit: ${c.name} sold to ${buyer}`,
        m.month,
      );
      if (!player.ai) {
        notify(world, player.id, {
          month: m.month,
          kind: 'deal',
          text: `You sold shares for ${formatMoney(line.total, m.data.currency)}. Tax: ${formatMoney(tax, m.data.currency)}.`,
        });
        achieve(
          world,
          player,
          player.role === 'investor' ? 'investor.first-exit' : 'founder.exit',
          player.role === 'investor' ? 'First exit' : 'First exit',
          m.month,
        );
      }
      applyStarEvent(player.stars, clamp(line.total / Math.max(1, proceeds), 0.05, 0.4));
    } else if (fund) {
      transfer(world, m.ext.lps, fund.account, line.total, `Exit: ${c.name}`, m.month);
      fund.mood = clamp(fund.mood + 0.1, 0.5, 1.5);
      distributeFund(world, fund, line.total, m.month);
    } else {
      // Parent companies, banks holding seized shares, staff and other AI holders.
      const to = holderAccount(world, m, line.holderId);
      pay(world, m.ext.lps, to, line.total, `Exit payout: ${c.name}`, m.month);
    }
  }
  c.status = status;
  c.closedMonth = m.month;
  c.forSale = false;
  return lines;
}

export function expireDeals(world: World, market: string) {
  const m = getMarket(world, market as never);
  for (const d of Object.values(world.deals)) {
    if (d.market !== market || d.status !== 'open' || d.expiresMonth > m.month) continue;
    d.status = 'expired';
    d.history.push({ month: m.month, by: 'system', action: 'expire', summary: 'Expired.' });
  }
}
