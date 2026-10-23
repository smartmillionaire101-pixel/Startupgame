/**
 * Allocators (investor blueprint §7.3, §8.1, §8.6, Phase 7):
 *
 *  - The family office: one view of a player's wealth across every track
 *    (cash, angel stakes, syndicates, LP commitments at their share of NAV
 *    and what is still to be called, listed shares, index funds, property),
 *    with how liquid each part is.
 *  - A fund of funds: an allocator (rung 7) raises it from AI LPs like any
 *    fund, then commits to other GPs' funds. Its capital calls are paid from
 *    its own account; distributions pass through to its LPs; its NAV looks
 *    through to the funds it backs.
 *  - The LP advisory committee: the three largest LPs approve conflicts —
 *    a fund investing where the GP already holds a stake personally, through
 *    a syndicate, or from another of their funds.
 *  - Selling an LP stake: to an outside secondary buyer at a discount to its
 *    share of NAV (they pay what's left to call at once), or to another
 *    player at an agreed price. The GP consents to qualified buyers.
 *  - Investors' startup secondaries: sell part of a private stake to an
 *    outside buyer at a discount to the last round, with the board's consent.
 *
 * Investor-career worlds only; every movement is a ledger transfer.
 */
import { fullyDiluted, markValue, sharesOf } from './captable.js';
import { INVESTOR } from './data/investor.js';
import { ensure, fail } from './errors.js';
import {
  EXITS,
  boardConsents,
  isListed,
  payShareSale,
  referencePrice,
  secondaryPrice,
} from './exits.js';
import { fundNav } from './fundops.js';
import { achieve, getCompany, getFund, getMarket, notify } from './helpers.js';
import { lpTrackOpen } from './lpfunds.js';
import { indexHolderId, indexNav } from './exchange.js';
import { account, costIn, pay, payExact, transfer, valueIn, withTx } from './ledger.js';
import { roundTo } from './math.js';
import { formatMoney } from './money.js';
import { investorOn, moreGamesOn } from './releases.js';
import { syndicateStake } from './syndicates.js';
import { recordRealised } from './exits.js';
import { wealthView } from './wealth.js';
import type {
  Company,
  Fund,
  FundLpState,
  Id,
  LpCommitment,
  Player,
  Safe,
  StakeOffer,
  World,
} from './types.js';

const fmt = (world: World, f: Fund, v: number) =>
  formatMoney(v, getMarket(world, f.market).data.currency);

// ---------------------------------------------------------------- fund of funds

/** `fof.commit`: a fund of funds commits to another GP's fund. */
export function fofCommit(world: World, me: Player, fofId: Id, targetId: Id, amount: number) {
  ensure(investorOn(world), 'fof.off', 'Not available yet.');
  const fof = getFund(world, fofId);
  ensure(
    fof.managerId === me.id && fof.lp?.strategy === 'fof',
    'fof.fund',
    'Commit from a fund of funds you run.',
  );
  ensure(fof.lp!.stage === 'investing', 'fof.stage', `${fof.name} isn’t investing.`);
  const target = getFund(world, targetId);
  ensure(
    target.id !== fof.id && target.managerId !== me.id,
    'fof.own',
    'A fund of funds backs other managers’ funds.',
  );
  ensure(
    target.lp?.strategy !== 'fof' && !target.angelId,
    'fof.target',
    'Back a venture fund, not another fund of funds.',
  );
  ensure(amount > 0, 'fof.amount', 'Say how much.');
  const cash = account(world, fof.account).balance;
  const outstanding = committedByFof(world, fof);
  ensure(
    outstanding + amount <= cash + paidByFof(world, fof),
    'fof.funds',
    `${fof.name} can commit ${fmt(world, fof, Math.max(0, cash + paidByFof(world, fof) - outstanding))} more.`,
  );
  const tm = getMarket(world, target.market);
  if (target.ai) {
    // AI funds are fully funded: pay in now.
    const lp = (target.lp ??= aiLpBook(world, target));
    const received = pay(
      world,
      fof.account,
      target.account,
      amount,
      `LP commitment: ${target.name}`,
      tm.month,
      'invested',
    );
    target.size += received;
    lp.commitments.push(commitment(target, fof, received, received, tm.month));
    lp.paidIn += received;
    return { message: `${fof.name} committed ${fmt(world, target, received)} to ${target.name}.` };
  }
  const lp = target.lp;
  ensure(lp, 'fof.target', 'That fund takes no outside LPs.');
  ensure(
    lp.stage === 'raising' || (lp.stage === 'investing' && lp.finalCloseMonth === undefined),
    'lp.closed',
    `${target.name} has held its final close.`,
  );
  ensure(
    amount >= lp.terms.minCommit,
    'lp.min',
    `The smallest commitment is ${fmt(world, target, lp.terms.minCommit)}.`,
  );
  const c = commitment(target, fof, amount, 0, tm.month);
  lp.commitments.push(c);
  if (target.managerId)
    notify(world, target.managerId, {
      month: tm.month,
      kind: 'deal',
      text: `${fof.name} (a fund of funds) committed ${fmt(world, target, amount)} to ${target.name}.`,
    });
  achieve(
    world,
    me,
    'investor.first-fof',
    'First fund of funds commitment',
    getMarket(world, me.market).month,
  );
  return {
    message: `${fof.name} committed ${fmt(world, target, amount)} to ${target.name}. Calls are paid from the fund.`,
  };
}

function commitment(
  target: Fund,
  fof: Fund,
  committed: number,
  paidIn: number,
  month: number,
): LpCommitment {
  return {
    id: `${target.id}:${fof.id}`,
    playerId: null,
    lpId: fof.id,
    fundId: fof.id,
    name: fof.name,
    kind: 'fof',
    committed,
    paidIn,
    distributed: 0,
    month,
    status: 'committed',
  };
}

function aiLpBook(world: World, f: Fund): FundLpState {
  const m = getMarket(world, f.market);
  return {
    number: 1,
    strategy: 'seed',
    terms: {
      target: f.size,
      minCommit: 0,
      feeRate: f.feeRate,
      feeStepDown: f.feeRate,
      carry: f.carry,
      hurdle: 0,
      gpCommit: 0,
      termMonths: INVESTOR.fund.termMonths,
      investMonths: INVESTOR.fund.investMonths,
      keyPerson: false,
    },
    stage: 'investing',
    openedMonth: m.month,
    firstCloseMonth: m.month,
    commitments: [],
    calls: [],
    paidIn: 0,
    relations: {},
    letters: [],
    reserves: {},
    marks: [],
    flows: [],
    ic: [],
    feesPaid: 0,
    carryPaid: 0,
  };
}

const fofCommitments = (world: World, fof: Fund) =>
  Object.values(world.funds).flatMap((f) =>
    (f.lp?.commitments ?? [])
      .filter((c) => c.fundId === fof.id && c.status !== 'released' && c.status !== 'sold')
      .map((c) => ({ f, c })),
  );

const committedByFof = (world: World, fof: Fund) =>
  fofCommitments(world, fof).reduce((a, { c }) => a + (c.committed - c.paidIn), 0);
const paidByFof = (world: World, fof: Fund) =>
  fofCommitments(world, fof).reduce((a, { c }) => a + c.paidIn, 0);

/** A fund of funds' look-through value: its share of each underlying fund's NAV. */
export function lookThroughNav(world: World, fof: Fund): number {
  let v = 0;
  for (const { f, c } of fofCommitments(world, fof)) {
    const paid = f.lp?.paidIn ?? f.size;
    if (paid <= 0 || c.paidIn <= 0) continue;
    const share = (fundNav(world, f) * c.paidIn) / paid;
    v += valueIn(
      world,
      Math.round(share),
      getMarket(world, f.market).data.currency,
      getMarket(world, fof.market).data.currency,
    );
  }
  return v;
}

// ---------------------------------------------------------------- conflicts and the LP advisory committee

/** Why a fund cheque into this company is a conflict for its GP (§8.6), or null. */
export function conflictOf(world: World, f: Fund, c: Company): string | null {
  const gp = f.managerId;
  if (!gp) return null;
  if (world.positions[`${gp}:${c.id}`] && !world.positions[`${gp}:${c.id}`]!.writtenOff)
    return 'You hold a personal stake in this company.';
  if (
    Object.values(world.syndicates ?? {}).some(
      (s) => s.leadId === gp && s.companyId === c.id && s.status === 'closed',
    )
  )
    return 'A syndicate you lead holds this company.';
  if (
    Object.values(world.funds).some(
      (o) => o.id !== f.id && o.managerId === gp && world.positions[`${o.id}:${c.id}`],
    )
  )
    return 'Another of your funds already holds this company.';
  return null;
}

/** The three largest LPs (by commitment) sit on the advisory committee. */
function lpacMembers(f: Fund): LpCommitment[] {
  return (f.lp?.commitments ?? [])
    .filter((c) => c.kind !== 'gp' && c.status === 'committed')
    .sort((a, b) => b.committed - a.committed || (a.id < b.id ? -1 : 1))
    .slice(0, 3);
}

/** `fund.lpac`: ask the advisory committee to approve a conflicted deal. */
export function requestLpac(world: World, me: Player, fundId: Id, companyId: Id) {
  const f = getFund(world, fundId);
  ensure(f.managerId === me.id && f.lp, 'fund.manager', 'Only the GP can do that.');
  const c = getCompany(world, companyId);
  const why = conflictOf(world, f, c);
  ensure(why, 'lpac.none', 'No conflict here: no committee needed.');
  const lp = f.lp!;
  const members = lpacMembers(f);
  ensure(members.length > 0, 'lpac.none', 'The fund has no LPs to ask.');
  const month = getMarket(world, f.market).month;
  const votes: Record<Id, 'yes' | 'no'> = {};
  for (const mbr of members)
    if (!mbr.playerId) votes[mbr.id] = (lp.relations[mbr.id]?.trust ?? 0.5) >= 0.55 ? 'yes' : 'no';
  const entry = {
    companyId: c.id,
    month,
    status: 'pending' as const,
    members: members.map((x) => x.id),
    votes,
  };
  lp.lpac = (lp.lpac ?? []).filter((x) => x.companyId !== c.id);
  lp.lpac.push(entry);
  for (const mbr of members)
    if (mbr.playerId)
      notify(world, mbr.playerId, {
        month,
        kind: 'deal',
        text: `${f.name}'s advisory committee: ${me.name} asks to invest in ${c.name}. ${why} Vote in your LP portfolio by month end.`,
      });
  resolveLpac(world, f, false);
  const done = lp.lpac.find((x) => x.companyId === c.id)!;
  return {
    status: done.status,
    message:
      done.status === 'pending'
        ? 'The committee votes by month end.'
        : done.status === 'approved'
          ? `The committee approved investing in ${c.name}.`
          : `The committee said no to ${c.name}.`,
  };
}

/** `lpac.vote`: a player LP on the committee votes. */
export function voteLpac(world: World, me: Player, fundId: Id, companyId: Id, approve: boolean) {
  const f = getFund(world, fundId);
  const entry = f.lp?.lpac?.find((x) => x.companyId === companyId && x.status === 'pending');
  ensure(entry, 'lpac.none', 'Nothing to vote on.');
  const mine = f.lp!.commitments.find((c) => c.playerId === me.id && entry.members.includes(c.id));
  ensure(mine, 'lpac.member', 'You’re not on this committee.');
  entry.votes[mine.id] = approve ? 'yes' : 'no';
  resolveLpac(world, f, false);
  return { status: entry.status };
}

/** Decide when everyone voted, or at month end (missing votes don't count). */
export function resolveLpac(world: World, f: Fund, monthEnd: boolean) {
  for (const x of f.lp?.lpac ?? []) {
    if (x.status !== 'pending') continue;
    const cast = Object.values(x.votes);
    if (!monthEnd && cast.length < x.members.length) continue;
    const yes = cast.filter((v) => v === 'yes').length;
    x.status = yes * 2 > cast.length && cast.length > 0 ? 'approved' : 'rejected';
    if (f.managerId)
      notify(world, f.managerId, {
        month: getMarket(world, f.market).month,
        kind: 'deal',
        text: `${f.name}'s advisory committee ${x.status === 'approved' ? 'approved' : 'rejected'} the deal in ${world.companies[x.companyId]?.name ?? 'the company'}.`,
      });
  }
}

/** Before a fund cheque (fundops.ts): a conflict needs the committee's yes; a fund of funds backs funds only. */
export function checkConflict(world: World, f: Fund, c: Company) {
  ensure(f.lp?.strategy !== 'fof', 'fof.companies', 'A fund of funds backs funds, not companies.');
  const why = conflictOf(world, f, c);
  if (!why) return;
  const ok = f.lp?.lpac?.some((x) => x.companyId === c.id && x.status === 'approved');
  ensure(ok, 'fund.conflict', `${why} The LP advisory committee has to approve this deal first.`);
}

// ---------------------------------------------------------------- selling an LP stake

/** A commitment's share of the fund's NAV, the fund's currency. */
export function stakeNav(world: World, f: Fund, c: LpCommitment): number {
  const paid = f.lp?.paidIn ?? f.size;
  return paid > 0 ? Math.round((fundNav(world, f) * c.paidIn) / paid) : 0;
}

function myStake(world: World, me: Player, fundId: Id) {
  const f = getFund(world, fundId);
  const c = f.lp?.commitments.find(
    (x) => x.playerId === me.id && x.status === 'committed' && x.kind !== 'gp',
  );
  ensure(c, 'stake.none', 'You have no LP stake in this fund to sell.');
  ensure(f.lp!.stage !== 'raising', 'stake.raising', 'Wait for the first close to sell a stake.');
  return { f, c };
}

/** Pay the seller (tax on any gain over the capital not yet returned) and record it. */
function paySeller(
  world: World,
  f: Fund,
  seller: Player,
  c: LpCommitment,
  price: number,
  from: Id,
) {
  const m = getMarket(world, f.market);
  const basis = Math.max(0, c.paidIn - c.distributed);
  const gain = Math.max(0, price - basis);
  const tax = Math.round(gain * m.data.tax.capitalGains);
  withTx(world, { kind: 'sale' }, () => {
    if (from === m.ext.lps) {
      transfer(
        world,
        m.ext.lps,
        m.ext.tax,
        tax,
        `Capital gains tax: LP stake in ${f.name}`,
        m.month,
      );
      pay(
        world,
        m.ext.lps,
        seller.accounts.local,
        price - tax,
        `LP stake sold: ${f.name}`,
        m.month,
        'move',
      );
    } else {
      pay(world, from, seller.accounts.local, price, `LP stake sold: ${f.name}`, m.month, 'move');
      transferTax(world, seller, tax, f);
    }
  });
  recordRealised(world, seller, m, price, gain, tax);
  return { tax, net: price - tax };
}

/** Player-to-player sale: the seller pays the tax from what they received. */
function transferTax(world: World, seller: Player, tax: number, f: Fund) {
  if (tax <= 0) return;
  const m = getMarket(world, f.market);
  payExact(
    world,
    seller.accounts.local,
    m.ext.tax,
    tax,
    `Capital gains tax: LP stake in ${f.name}`,
    m.month,
  );
}

/** Does a human GP have to approve transfers of LP stakes in this fund? (AI funds consent at once.) */
const gpApproves = (world: World, f: Fund) =>
  !!f.managerId && world.players[f.managerId]?.ai === false;

/**
 * `stake.sell`: sell your LP stake to an outside secondary buyer at a
 * discount to its share of NAV. The fund's GP approves or rejects it first.
 */
export function sellStakeOutside(world: World, me: Player, fundId: Id) {
  const { f, c } = myStake(world, me, fundId);
  const m = getMarket(world, f.market);
  const price = Math.round(
    stakeNav(world, f, c) * (1 - EXITS.secondary.discountBps.outside / 10_000),
  );
  ensure(price > 0, 'stake.price', 'Your stake has no value to sell yet.');
  if (!gpApproves(world, f)) return executeOutside(world, f, me, c, price);
  const offers = (world.stakeOffers ??= {});
  const id = `stk:${f.id}:${me.id}:${m.month}:out`;
  ensure(
    !offers[id] || offers[id]!.status !== 'awaiting-gp',
    'stake.open',
    'This sale is already waiting for the GP.',
  );
  offers[id] = {
    id,
    fundId: f.id,
    sellerId: me.id,
    buyerId: null,
    price,
    month: m.month,
    expiresMonth: m.month + EXITS.secondary.offerMonths,
    status: 'awaiting-gp',
  };
  notify(world, f.managerId!, {
    month: m.month,
    kind: 'deal',
    text: `${me.name} wants to sell their LP stake in ${f.name} to a secondary buyer for ${fmt(world, f, price)}. Approve or reject it in your fund.`,
  });
  return {
    offerId: id,
    price,
    message: `A buyer will pay ${fmt(world, f, price)}. Waiting for ${f.name}'s GP to approve.`,
  };
}

function executeOutside(world: World, f: Fund, seller: Player, c: LpCommitment, price: number) {
  const m = getMarket(world, f.market);
  const lp = f.lp!;
  // The buyer takes on what's left to call and pays it in now.
  const unpaid = Math.max(0, c.committed - c.paidIn);
  if (unpaid > 0)
    transfer(world, m.ext.lps, f.account, unpaid, `LP stake bought: ${f.name}`, m.month);
  lp.calls = lp.calls.filter((x) => !(x.commitmentId === c.id && x.status === 'due'));
  const paid = paySeller(world, f, seller, c, price, m.ext.lps);
  c.status = 'sold';
  lp.commitments.push({
    id: `${c.id}:sec${m.month}`,
    playerId: null,
    name: 'Secondary buyer',
    kind: 'secondary',
    committed: c.committed,
    paidIn: c.paidIn + unpaid,
    distributed: 0,
    month: m.month,
    status: 'committed',
  });
  lp.paidIn += unpaid;
  if (unpaid > 0) lp.flows.push({ month: m.month, amount: -unpaid });
  // The seller is out: their paid-in leaves the books with them.
  c.paidIn = 0;
  return {
    price,
    ...paid,
    message: `Sold your stake in ${f.name} for ${fmt(world, f, price)} (${EXITS.secondary.discountBps.outside / 100}% under its share of NAV).`,
  };
}

export function offerStake(world: World, me: Player, fundId: Id, buyerId: Id, price: number) {
  const { f } = myStake(world, me, fundId);
  const buyer = world.players[buyerId];
  ensure(buyer && !buyer.ai && buyer.id !== me.id, 'stake.buyer', 'Offer it to another player.');
  ensure(buyer.id !== f.managerId, 'stake.gp', 'The GP can’t buy LP stakes in their own fund.');
  ensure(price > 0, 'stake.price', 'Set a price.');
  const m = getMarket(world, f.market);
  const id = `stk:${f.id}:${me.id}:${m.month}`;
  const offers = (world.stakeOffers ??= {});
  ensure(
    !offers[id] || offers[id]!.status !== 'open',
    'stake.open',
    'You already offered this stake this month.',
  );
  const offer: StakeOffer = {
    id,
    fundId: f.id,
    sellerId: me.id,
    buyerId,
    price,
    month: m.month,
    expiresMonth: m.month + EXITS.secondary.offerMonths,
    status: 'open',
  };
  offers[id] = offer;
  notify(world, buyerId, {
    month: getMarket(world, buyer.market).month,
    kind: 'deal',
    text: `${me.name} offers you their LP stake in ${f.name} for ${fmt(world, f, price)}. Answer in your LP portfolio.`,
  });
  return { offerId: id };
}

/** The buyer must qualify as an LP and afford the price. */
function checkBuyer(world: World, f: Fund, buyer: Player, price: number) {
  ensure(lpTrackOpen(world, buyer), 'lp.track', 'The buyer has to qualify as an LP.');
  ensure(
    (buyer.lp?.banUntil ?? 0) <= getMarket(world, buyer.market).month,
    'lp.banned',
    'After a missed call the buyer can’t take on LP stakes yet.',
  );
  const m = getMarket(world, f.market);
  const acc = account(world, buyer.accounts.local);
  ensure(
    acc.balance >= costIn(world, price, m.data.currency, acc.currency),
    'stake.funds',
    `${buyer.name} doesn’t have the money for this stake.`,
  );
}

const sellerStake = (f: Fund, sellerId: Id) =>
  f.lp?.commitments.find((x) => x.playerId === sellerId && x.status === 'committed');

/**
 * `stake.answer`: the buyer accepts or declines. An accepted offer goes to
 * the fund's GP, who approves or rejects the transfer (AI funds consent at once).
 */
export function answerStake(world: World, me: Player, offerId: Id, accept: boolean) {
  const o = world.stakeOffers?.[offerId];
  ensure(o && o.buyerId === me.id, 'stake.offer', 'Offer not found.');
  ensure(o.status === 'open', 'stake.offer', 'That offer has closed.');
  if (getMarket(world, world.funds[o.fundId]!.market).month > o.expiresMonth) {
    o.status = 'expired';
    return { status: o.status, message: 'That offer has expired.' };
  }
  if (!accept) {
    o.status = 'declined';
    notify(world, o.sellerId, {
      month: getMarket(world, world.players[o.sellerId]!.market).month,
      kind: 'deal',
      text: `${me.name} declined your LP stake.`,
    });
    return { status: o.status };
  }
  const f = getFund(world, o.fundId);
  ensure(sellerStake(f, o.sellerId), 'stake.none', 'The stake is no longer there.');
  checkBuyer(world, f, me, o.price);
  if (!gpApproves(world, f)) return executePlayerSale(world, f, o);
  o.status = 'awaiting-gp';
  const m = getMarket(world, f.market);
  notify(world, f.managerId!, {
    month: m.month,
    kind: 'deal',
    text: `${world.players[o.sellerId]?.name ?? 'An LP'} wants to sell their LP stake in ${f.name} to ${me.name} for ${fmt(world, f, o.price)}. Approve or reject it in your fund.`,
  });
  return { status: o.status, message: `Agreed. Waiting for ${f.name}'s GP to approve.` };
}

function executePlayerSale(world: World, f: Fund, o: StakeOffer) {
  const m = getMarket(world, f.market);
  const seller = world.players[o.sellerId]!;
  const buyer = world.players[o.buyerId!]!;
  const c = sellerStake(f, seller.id)!;
  payExact(
    world,
    buyer.accounts.local,
    seller.accounts.local,
    o.price,
    `LP stake bought: ${f.name}`,
    m.month,
    'invested',
  );
  const basis = Math.max(0, c.paidIn - c.distributed);
  const gain = Math.max(0, o.price - basis);
  const tax = Math.round(gain * m.data.tax.capitalGains);
  transferTax(world, seller, tax, f);
  recordRealised(world, seller, m, o.price, gain, tax);
  // The commitment (and its due calls) passes to the buyer.
  c.playerId = buyer.id;
  c.name = buyer.name;
  c.autopay = false;
  o.status = 'accepted';
  notify(world, seller.id, {
    month: getMarket(world, seller.market).month,
    kind: 'deal',
    text: `${buyer.name} bought your LP stake in ${f.name} for ${fmt(world, f, o.price)}.`,
  });
  notify(world, buyer.id, {
    month: getMarket(world, buyer.market).month,
    kind: 'deal',
    text: `You’re an LP in ${f.name} now: ${seller.name}'s stake is yours.`,
  });
  return { status: o.status, message: `The stake in ${f.name} passed to ${buyer.name}.` };
}

/** `stake.consent`: the fund's GP approves or rejects a sale of an LP stake. */
export function consentStake(world: World, me: Player, offerId: Id, approve: boolean) {
  const o = world.stakeOffers?.[offerId];
  ensure(o, 'stake.offer', 'Sale not found.');
  const f = getFund(world, o.fundId);
  ensure(f.managerId === me.id, 'stake.gp', 'Only the fund’s GP approves stake sales.');
  ensure(o.status === 'awaiting-gp', 'stake.offer', 'Nothing to approve.');
  const m = getMarket(world, f.market);
  const seller = world.players[o.sellerId]!;
  const tell = (text: string) => {
    notify(world, seller.id, { month: getMarket(world, seller.market).month, kind: 'deal', text });
    const buyer = o.buyerId ? world.players[o.buyerId] : undefined;
    if (buyer)
      notify(world, buyer.id, { month: getMarket(world, buyer.market).month, kind: 'deal', text });
  };
  if (!approve) {
    o.status = 'rejected';
    tell(`${f.name}'s GP rejected the sale of ${seller.name}'s LP stake.`);
    return { status: o.status };
  }
  if (m.month > o.expiresMonth) {
    o.status = 'expired';
    tell(`The sale of ${seller.name}'s LP stake in ${f.name} expired before the GP answered.`);
    return { status: o.status };
  }
  const c = sellerStake(f, seller.id);
  ensure(c, 'stake.none', 'The stake is no longer there.');
  if (o.buyerId === null) {
    const r = executeOutside(world, f, seller, c, o.price);
    o.status = 'accepted';
    tell(`${f.name}'s GP approved: ${r.message}`);
    return { status: o.status };
  }
  checkBuyer(world, f, world.players[o.buyerId]!, o.price);
  return executePlayerSale(world, f, o);
}

/** For a GP: stake sales waiting for your approval, with who and at what price. */
export function stakeConsentsView(world: World, p: Player) {
  return Object.values(world.stakeOffers ?? {})
    .filter((o) => o.status === 'awaiting-gp' && world.funds[o.fundId]?.managerId === p.id)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((o) => {
      const f = world.funds[o.fundId]!;
      const c = sellerStake(f, o.sellerId);
      return {
        ...o,
        fundName: f.name,
        sellerName: world.players[o.sellerId]?.name ?? '',
        buyerName: o.buyerId ? (world.players[o.buyerId]?.name ?? '') : 'Secondary buyer',
        currency: getMarket(world, f.market).data.currency,
        navShare: c ? stakeNav(world, f, c) : 0,
      };
    });
}

// ---------------------------------------------------------------- investors' startup secondaries

/** Your SAFEs in this company (a SAFE is a promise of shares at the next priced round). */
const safesOf = (c: Company, holderId: Id) =>
  c.capTable.safes.filter((s) => s.holderId === holderId);

/**
 * Why `me` can't sell their private stake in `c` right now (null: they can).
 * The same checks the command runs, in the same order, so the Capital screen
 * says exactly why instead of showing a button that does nothing.
 */
export function investorSecondaryBlocker(
  world: World,
  me: Player,
  c: Company,
): { code: string; message: string } | null {
  if (!investorOn(world)) return { code: 'secondary.off', message: 'Not available yet.' };
  const after = moreGamesOn(world);
  // After the more-games release every investor can sell a private stake,
  // SAFEs included; before it, secondaries opened at rung 2 or as an
  // allocator, for converted shares only.
  if (!after && me.career?.reached[2] === undefined && me.career?.reached[7] === undefined)
    return {
      code: 'secondary.rung',
      message: 'Secondaries open at rung 2 (syndicate lead) or as an allocator.',
    };
  if (!(c.status === 'active' && !isListed(c)))
    return { code: 'secondary.listed', message: 'Sell listed shares on the exchange.' };
  if (c.founderIds.includes(me.id))
    return { code: 'secondary.founder', message: 'Founders sell through Capital → Exit.' };
  if (sharesOf(c.capTable, me.id) <= 0 && !(after && safesOf(c, me.id).length))
    return {
      code: 'secondary.shares',
      message: 'You hold no converted shares here (a SAFE converts at the next priced round).',
    };
  if (referencePrice(c) <= 0)
    return { code: 'secondary.price', message: 'There is no share price yet.' };
  if (!boardConsents(world, c).ok)
    return {
      code: 'secondary.board',
      message: 'The board won’t consent while the company is short of runway.',
    };
  return null;
}

/** AI-run funds and angels already on the cap table: they buy at the insider discount. */
function insiderBuyers(world: World, c: Company, me: Player) {
  return Object.keys(c.capTable.holdings)
    .filter((h) => {
      const f = world.funds[h];
      if (!f || h === me.id || (c.capTable.holdings[h]?.shares ?? 0) <= 0) return false;
      const manager = f.managerId ? world.players[f.managerId] : undefined;
      return !manager || manager.ai;
    })
    .sort()
    .map((h) => world.funds[h]!);
}

/**
 * What selling `bps` of a private stake pays: `bps` of the converted shares
 * at the buyer's discount to the last round price and (after the more-games
 * release) `bps` of each SAFE, marked as converted at the newest SAFE's cap,
 * at the same discount. The cost basis is what was paid for what is sold.
 */
function saleQuote(world: World, me: Player, c: Company, bps: number, fund?: Fund) {
  const kind = fund ? 'investor' : 'outside';
  const held = sharesOf(c.capTable, me.id);
  const shares = Math.floor((held * bps) / 10_000);
  let price = Math.round(shares * secondaryPrice(c, kind));
  const pos = world.positions[`${me.id}:${c.id}`];
  if (!moreGamesOn(world)) {
    const basis = pos ? Math.round((pos.invested * shares) / held) : 0;
    return { shares, safes: [], safeAmount: 0, price, basis };
  }
  const mine = safesOf(c, me.id);
  const latest = c.capTable.safes.reduce<Safe | null>(
    (a, x) => (!a || x.month >= a.month ? x : a),
    null,
  );
  const keep = 1 - EXITS.secondary.discountBps[kind] / 10_000;
  const safes = mine
    .map((s) => ({ s, part: bps >= 10_000 ? s.amount : Math.floor((s.amount * bps) / 10_000) }))
    .filter((x) => x.part > 0);
  for (const { s, part } of safes)
    price += Math.round(((part * (latest?.cap ?? s.cap)) / s.cap) * keep);
  const safeAmount = safes.reduce((a, x) => a + x.part, 0);
  // A SAFE's cost is its amount; the rest of what you paid in bought the shares.
  const shareCost = Math.max(0, (pos?.invested ?? 0) - mine.reduce((a, s) => a + s.amount, 0));
  const basis = (held > 0 ? Math.round((shareCost * shares) / held) : 0) + safeAmount;
  return { shares, safes, safeAmount, price, basis };
}

/**
 * `secondary.investorSell`: sell part of a private stake (§6.7). Without
 * `buyerId` an outside secondary buyer pays at once (the steeper discount);
 * after the more-games release an AI fund or angel already on the cap table
 * can buy instead, at the insider discount, paying from its own account, and
 * SAFEs can be sold too (the buyer takes over the SAFE).
 */
export function investorSecondary(
  world: World,
  me: Player,
  companyId: Id,
  bps: number,
  buyerId?: Id,
) {
  ensure(investorOn(world), 'secondary.off', 'Not available yet.');
  const c = getCompany(world, companyId);
  const why = investorSecondaryBlocker(world, me, c);
  if (why) fail(why.code, why.message);
  ensure(
    Number.isInteger(bps) && bps >= 1 && bps <= 10_000,
    'secondary.pct',
    'Pick how much to sell.',
  );
  const after = moreGamesOn(world);
  const m = getMarket(world, c.market);
  const insider = buyerId !== undefined && after;
  const fund = insider ? world.funds[buyerId] : undefined;
  if (insider)
    ensure(
      fund && insiderBuyers(world, c, me).some((f) => f.id === fund.id),
      'secondary.buyer',
      'Only an AI fund or angel already on the cap table buys this way.',
    );
  const q = saleQuote(world, me, c, bps, fund);
  ensure(q.shares > 0 || q.safeAmount > 0, 'secondary.shares', 'That is less than one share.');
  if (after) ensure(q.price > 0, 'secondary.price', 'Too small to sell.');
  const { shares, price, basis } = q;
  if (fund) {
    const acc = account(world, fund.account);
    ensure(
      acc.balance >= costIn(world, price, m.data.currency, acc.currency),
      'secondary.funds',
      `${fund.name} can’t pay for these shares right now.`,
    );
    payExact(
      world,
      fund.account,
      m.ext.lps,
      price,
      `Secondary: ${c.name} shares`,
      m.month,
      'invested',
    );
  }
  const holderId = fund ? fund.id : `sec:${c.id}`;
  // The shares change hands: no new shares, so nobody else is diluted.
  if (shares > 0) {
    c.capTable.holdings[me.id]!.shares -= shares;
    const to = (c.capTable.holdings[holderId] ??= { shares: 0, kind: 'investor' });
    to.shares += shares;
  }
  // A SAFE changes hands whole, or splits (same cap and discount).
  for (const { s, part } of q.safes) {
    if (part >= s.amount) s.holderId = holderId;
    else {
      s.amount -= part;
      c.capTable.safes.push({ ...s, holderId, amount: part });
    }
  }
  if (fund) {
    const fp = (world.positions[`${fund.id}:${c.id}`] ??= {
      investorId: fund.id,
      companyId: c.id,
      invested: 0,
      returned: 0,
      month: m.month,
      writtenOff: false,
    });
    fp.invested += price;
  }
  const buyerName = fund ? fund.name : `${m.data.name} Secondaries`;
  const paid = payShareSale(
    world,
    c,
    me,
    price,
    basis,
    after ? `Secondary sale: ${c.name} stake to ${buyerName}` : `Secondary sale: ${c.name}`,
  );
  const pos = world.positions[`${me.id}:${c.id}`];
  if (pos) pos.returned += price;
  achieve(
    world,
    me,
    'investor.first-secondary',
    'First secondary sale',
    getMarket(world, me.market).month,
  );
  if (after) {
    (c.secondaries ??= []).push({
      sellerId: me.id,
      buyerId: holderId,
      month: m.month,
      shares,
      bps,
      price,
    });
    const f = (v: number) => formatMoney(v, m.data.currency);
    notify(world, me.id, {
      month: m.month,
      kind: 'deal',
      text: `You sold ${bps / 100}% of your ${c.name} stake to ${buyerName} for ${f(price)}. It cost you ${f(basis)}; tax ${f(paid.tax)}. ${f(paid.net)} is in your personal account.`,
    });
  }
  const discount = EXITS.secondary.discountBps[fund ? 'investor' : 'outside'] / 100;
  return {
    shares,
    safeAmount: q.safeAmount,
    price,
    basis,
    buyer: buyerName,
    ...paid,
    message: `Sold ${shares.toLocaleString()} ${c.name} shares for ${formatMoney(price, m.data.currency)} (${discount}% under the last round).`,
  };
}

/** The sizes the Capital screen offers, bps of the stake. */
export const STAKE_SALE_BPS = [1_000, 2_500, 5_000, 10_000] as const;

/**
 * `view.capital.stakes`: every private company you hold a stake in but didn't
 * found, what each sale size pays each buyer, and (when you can't sell yet)
 * exactly why.
 */
export function investorStakesView(world: World, p: Player) {
  return Object.values(world.companies)
    .filter(
      (c) =>
        c.status === 'active' &&
        !isListed(c) &&
        !c.founderIds.includes(p.id) &&
        (sharesOf(c.capTable, p.id) > 0 || safesOf(c, p.id).length > 0),
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((c) => {
      const m = getMarket(world, c.market);
      const shares = sharesOf(c.capTable, p.id);
      const pos = world.positions[`${p.id}:${c.id}`];
      const blocked = investorSecondaryBlocker(world, p, c);
      const rate = m.data.tax.capitalGains;
      const quotes = (fund?: Fund) =>
        blocked
          ? []
          : STAKE_SALE_BPS.map((bps) => {
              const q = saleQuote(world, p, c, bps, fund);
              const gain = Math.max(0, q.price - q.basis);
              const tax = Math.round(gain * rate);
              return {
                bps,
                shares: q.shares,
                safeAmount: q.safeAmount,
                price: q.price,
                basis: q.basis,
                tax,
                net: q.price - tax,
              };
            });
      const buyers: {
        id: string | null;
        name: string;
        kind: 'outside' | 'insider';
        discountBps: number;
        /** Most it can pay right now, the company's currency (null: no limit). */
        cash: number | null;
        quotes: ReturnType<typeof quotes>;
      }[] = [
        {
          id: null,
          name: `${m.data.name} Secondaries`,
          kind: 'outside',
          discountBps: EXITS.secondary.discountBps.outside,
          cash: null,
          quotes: quotes(),
        },
        ...(moreGamesOn(world) ? insiderBuyers(world, c, p) : []).map((f) => {
          const acc = account(world, f.account);
          return {
            id: f.id,
            name: f.name,
            kind: 'insider' as const,
            discountBps: EXITS.secondary.discountBps.investor,
            cash: valueIn(world, Math.max(0, acc.balance), acc.currency, m.data.currency),
            quotes: quotes(f),
          };
        }),
      ];
      return {
        companyId: c.id,
        name: c.name,
        market: c.market,
        currency: m.data.currency,
        aiFounded: c.ai,
        shares,
        /** Your SAFEs here (money in, not yet shares). */
        safe: safesOf(c, p.id).reduce((a, s) => a + s.amount, 0),
        pct: roundTo((shares / Math.max(1, fullyDiluted(c.capTable))) * 100, 2),
        lastPrice: roundTo(referencePrice(c), 2),
        /** Shares at the last round price, SAFEs at cost: paper value, not cash. */
        paperValue: markValue(c.capTable, p.id),
        invested: pos?.invested ?? 0,
        returned: pos?.returned ?? 0,
        capitalGainsRate: rate,
        boardRunwayMonths: EXITS.secondary.boardRunwayMonths,
        /** Why you can't sell yet (null: you can). */
        blocked,
        buyers,
      };
    });
}

// ---------------------------------------------------------------- the family office

/** `view.familyOffice`: every track's value (home currency), how liquid, and what's still to be called. */
export function familyOfficeView(world: World, p: Player) {
  if (!investorOn(world) || p.ai) return null;
  const home = getMarket(world, p.market).data.currency;
  const conv = (v: number, cur: string) => valueIn(world, Math.round(v), cur as never, home);
  const w = wealthView(world, p);
  let startups = 0;
  let listed = 0;
  for (const c of Object.values(world.companies)) {
    if (c.status !== 'active') continue;
    const cur = getMarket(world, c.market).data.currency;
    if (isListed(c))
      listed += conv((c.capTable.holdings[p.id]?.shares ?? 0) * (c.ipo!.price ?? 0), cur);
    else if (sharesOf(c.capTable, p.id) > 0 || c.capTable.safes.some((s) => s.holderId === p.id))
      startups += conv(markValue(c.capTable, p.id), cur);
  }
  let index = 0;
  for (const m of Object.values(world.markets)) {
    const units = m?.exchange?.units[p.id] ?? 0;
    if (!m || units <= 0) continue;
    index += conv(
      (indexNav(world, m) / Math.max(1e-9, m.exchange!.totalUnits)) * units,
      m.data.currency,
    );
  }
  let syndicates = 0;
  for (const s of Object.values(world.syndicates ?? {}))
    syndicates += conv(syndicateStake(world, s, p.id), getMarket(world, s.market).data.currency);
  let lpValue = 0;
  let uncalled = 0;
  const funds: { fundId: Id; name: string; value: number; uncalled: number }[] = [];
  for (const f of Object.values(world.funds)) {
    const c = f.lp?.commitments.find(
      (x) =>
        x.playerId === p.id && x.status !== 'sold' && x.status !== 'released' && x.kind !== 'gp',
    );
    if (!c) continue;
    const cur = getMarket(world, f.market).data.currency;
    const v = conv(stakeNav(world, f, c), cur);
    const u = conv(Math.max(0, c.committed - c.paidIn), cur);
    lpValue += v;
    uncalled += u;
    funds.push({ fundId: f.id, name: f.name, value: v, uncalled: u });
  }
  const tracks = [
    { id: 'cash', value: w.liquid, liquid: true },
    { id: 'startups', value: startups, liquid: false },
    { id: 'syndicates', value: syndicates, liquid: false },
    { id: 'lp', value: lpValue, liquid: false },
    { id: 'listed', value: listed, liquid: true },
    { id: 'index', value: index, liquid: true },
    { id: 'property', value: w.property.equity, liquid: false },
  ];
  const total = tracks.reduce((a, x) => a + Math.max(0, x.value), 0);
  return {
    currency: home,
    total,
    liquid: tracks.filter((x) => x.liquid).reduce((a, x) => a + x.value, 0),
    tracks: tracks.map((x) => ({
      ...x,
      share: total > 0 ? roundTo(Math.max(0, x.value) / total, 3) : 0,
    })),
    /** LP commitments still to be called: keep this much liquid. */
    uncalled,
    funds,
    stakeOffers: Object.values(world.stakeOffers ?? {})
      .filter((o) => o.buyerId === p.id && o.status === 'open')
      .map((o) => ({
        ...o,
        fundName: world.funds[o.fundId]?.name ?? '',
        sellerName: world.players[o.sellerId]?.name ?? '',
        currency: getMarket(world, world.funds[o.fundId]!.market).data.currency,
      })),
    /** Your stake sales and where they are (waiting for a buyer or the GP, done, rejected). */
    mySales: Object.values(world.stakeOffers ?? {})
      .filter((o) => o.sellerId === p.id)
      .sort((a, b) => b.month - a.month)
      .slice(0, 6)
      .map((o) => ({
        id: o.id,
        fundName: world.funds[o.fundId]?.name ?? '',
        buyerId: o.buyerId,
        buyerName: o.buyerId ? (world.players[o.buyerId]?.name ?? '') : 'Secondary buyer',
        price: o.price,
        status: o.status,
        currency: getMarket(world, world.funds[o.fundId]!.market).data.currency,
      })),
    lpacVotes: Object.values(world.funds).flatMap((f) =>
      (f.lp?.lpac ?? [])
        .filter(
          (x) =>
            x.status === 'pending' &&
            x.members.some((id) => f.lp!.commitments.find((c) => c.id === id)?.playerId === p.id),
        )
        .map((x) => ({
          fundId: f.id,
          fundName: f.name,
          companyId: x.companyId,
          companyName: world.companies[x.companyId]?.name ?? '',
          voted: !!x.votes[f.lp!.commitments.find((c) => c.playerId === p.id)!.id],
        })),
    ),
    /** Private stakes you could sell to an outside secondary buyer. */
    secondaries: Object.values(world.companies)
      .filter(
        (c) =>
          c.status === 'active' &&
          !isListed(c) &&
          !c.founderIds.includes(p.id) &&
          sharesOf(c.capTable, p.id) > 0,
      )
      .map((c) => ({
        companyId: c.id,
        name: c.name,
        shares: sharesOf(c.capTable, p.id),
        pct: roundTo((sharesOf(c.capTable, p.id) / Math.max(1, fullyDiluted(c.capTable))) * 100, 2),
        price: roundTo(secondaryPrice(c, 'outside'), 2),
        currency: getMarket(world, c.market).data.currency,
        boardOk: boardConsents(world, c).ok,
      })),
    canSecondary: p.career?.reached[2] !== undefined || p.career?.reached[7] !== undefined,
    indexHolder: indexHolderId(p.market),
  };
}
