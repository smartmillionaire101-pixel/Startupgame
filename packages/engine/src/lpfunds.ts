/**
 * Raising a fund the full way, with player LPs (investor blueprint §7.3,
 * §8.2, §8.5, Phase 4). Fund I's one-step raise from the AI LP panel
 * (funds.ts) stays as the simple path.
 *
 *  - Launch: a rung-3 investor sets the thesis and the terms (target, the
 *    smallest commitment, fee and step-down, carry, hurdle, GP commitment,
 *    fund life, key person). An accepted anchor LP commits at once.
 *  - LPs: AI LPs (pitched in person, decided at month end: programs.ts)
 *    and players (any player with 24 months of living costs liquid, after an
 *    optional LP diligence) commit. Pension and sovereign money waits for
 *    Fund II.
 *  - Closes: the first close needs half the target committed. AI LPs pay in
 *    full; player LPs (and the GP) pay through four quarterly capital calls.
 *    The final close follows within six months (automatically at the end);
 *    late LPs pay a catch-up so early LPs aren't diluted. A raise that never
 *    reaches its first close fails: commitments are released, nothing moved.
 *  - Calls: each has a deadline; an LP can pay, set autopay, or ask once for
 *    a month's delay. Missing one forfeits a quarter of what they paid in,
 *    goes on their credit record as a default and bars new commitments for
 *    six months.
 *  - Distributions: LPs get their paid-in back (plus any hurdle) first, pro
 *    rata; then the GP's carry. Player LPs in AI funds share an AI fund's
 *    exits pro rata to their money.
 *
 * Investor-career worlds only; every movement is a ledger transfer.
 */
import { hasCareer, managedFunds } from './career.js';
import { INVESTOR } from './data/investor.js';
import { lpsOf } from './programs.js';
import type { LpSeed } from './data/programs.js';
import { ensure } from './errors.js';
import { recordRealised } from './exits.js';
import { achieve, getFund, getMarket, notify, spendHours, usdToLocal } from './helpers.js';
import { newId } from './ids.js';
import { account, costIn, openAccount, pay, payExact, transfer, withTx } from './ledger.js';
import { roundTo } from './math.js';
import { formatMoney } from './money.js';
import { monthOfLiving } from './career.js';
import { investorOn } from './releases.js';
import { fundOpsView } from './fundops.js';
import { aiCarry, attachFund, nextFundCap, splitCarry } from './firms.js';
import { distributeFund } from './funds.js';
import { newStars } from './stars.js';
import { wealthView } from './wealth.js';
import type { Industry } from './data/industries.js';
import type {
  CapitalCall,
  Fund,
  FundLpState,
  FundStrategy,
  FundTerms,
  Id,
  LpCommitment,
  Player,
  Stage,
  World,
} from './types.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const fundNumeral = (n: number) => ROMAN[n - 1] ?? String(n);

const STRATEGY_NAME: Record<FundStrategy, string> = {
  seed: 'Fund',
  growth: 'Growth Fund',
  public: 'Crossover Fund',
  impact: 'Impact Fund',
  fof: 'Fund of Funds',
};

const fmt = (world: World, f: Fund, v: number) =>
  formatMoney(v, getMarket(world, f.market).data.currency);

/** The live LP state (throws for funds raised the simple way). */
function lpOf(f: Fund): FundLpState {
  ensure(f.lp, 'fund.simple', 'This fund was raised from the AI LP panel: it has no LP book.');
  return f.lp;
}

export const committedTotal = (f: Fund) =>
  (f.lp?.commitments ?? [])
    .filter((c) => c.status === 'committed' || c.status === 'defaulted')
    .reduce((a, c) => a + c.committed, 0);

export const paidTotal = (f: Fund) => (f.lp?.commitments ?? []).reduce((a, c) => a + c.paidIn, 0);

/** Months since the first close (0 before it). */
const monthsIn = (world: World, f: Fund) =>
  f.lp?.firstCloseMonth === undefined ? 0 : getMarket(world, f.market).month - f.lp.firstCloseMonth;

/** Is the fund past its investment period? */
export const inHarvest = (world: World, f: Fund) =>
  !!f.lp && f.lp.firstCloseMonth !== undefined && monthsIn(world, f) >= f.lp.terms.investMonths;

/** Can the fund invest in new companies now? */
export function fundCanInvest(world: World, f: Fund, companyId?: Id): string | null {
  if (!f.lp) return null;
  if (f.lp.stage === 'raising')
    return `${f.name} hasn’t held its first close: it can’t invest yet.`;
  if (f.lp.stage === 'failed' || f.lp.stage === 'wound-down') return `${f.name} is closed.`;
  // After the investment period: follow-ons in companies it already backs only (§8.3).
  if (inHarvest(world, f) && companyId && !world.positions[`${f.id}:${companyId}`])
    return `${f.name} is past its investment period: follow-ons only.`;
  return null;
}

// ---------------------------------------------------------------- launch

export interface LaunchArgs {
  sectors: Industry[];
  stages: Stage[];
  checkSize: number;
  why: string;
  strategy: FundStrategy;
  target: number;
  minCommit: number;
  feeRate: number;
  carry: number;
  hurdle: number;
  gpCommit: number;
  termMonths: number;
  investMonths: number;
  keyPerson: boolean;
}

/** `fund.launch`: write the thesis and the terms, and start raising. */
export function launchFund(world: World, me: Player, a: LaunchArgs) {
  ensure(investorOn(world), 'fund.off', 'Not available yet.');
  ensure(me.role === 'investor' && me.investor, 'fund.role', 'Only investors raise funds.');
  const mine = managedFunds(world, me);
  const first = mine.length === 0;
  ensure(
    first ? me.career?.reached[3] !== undefined : me.career?.reached[5] !== undefined,
    'fund.rung',
    first
      ? `Fund I opens at rung 3: ${INVESTOR.ladder.fundDeals} deals and an LP panel score of ${INVESTOR.ladder.fundScore}.`
      : `Fund II opens at rung 5: Fund I returned ${INVESTOR.ladder.fund2Dpi}× in cash and ${INVESTOR.ladder.fund2Reups} LPs would re-up.`,
  );
  ensure(
    a.strategy !== 'fof' || me.career?.reached[7] !== undefined,
    'fund.rung',
    'A fund of funds is for allocators (rung 7).',
  );
  ensure(
    !Object.values(world.funds).some((f) => f.managerId === me.id && f.lp?.stage === 'raising'),
    'fund.raising',
    'You’re already raising a fund. Close it or call it off first.',
  );
  ensure(
    a.sectors.length >= 1 && a.stages.length >= 1,
    'fund.thesis',
    'Pick at least one sector and stage.',
  );
  ensure(a.why.trim().length >= 10, 'fund.thesis', 'Say why now and why you’ll win, in a line.');
  ensure(a.feeRate >= 0.01 && a.feeRate <= 0.03, 'fund.terms', 'Management fee: 1–3% a year.');
  ensure(a.carry >= 0.1 && a.carry <= 0.3, 'fund.terms', 'Carry: 10–30% of profits.');
  ensure(a.hurdle >= 0 && a.hurdle <= 0.1, 'fund.terms', 'Hurdle: 0–10% a year.');
  const [gpLo, gpHi] = INVESTOR.fund.gpCommit;
  ensure(
    a.gpCommit >= gpLo - 1e-9 && a.gpCommit <= gpHi + 1e-9,
    'fund.terms',
    `GP commitment: ${gpLo * 100}–${gpHi * 100}% of the fund.`,
  );
  ensure(
    a.investMonths >= 6 && a.termMonths >= a.investMonths + 6 && a.termMonths <= 120,
    'fund.terms',
    'Fund life: at least six months of investing and six of harvest.',
  );
  const m = getMarket(world, me.market);
  const minTarget = usdToLocal(world, m, 500_000);
  ensure(
    a.target >= minTarget,
    'fund.terms',
    `The smallest fund is ${formatMoney(minTarget, m.data.currency)}.`,
  );
  ensure(
    a.minCommit > 0 && a.minCommit <= a.target / 4,
    'fund.terms',
    'Set a smallest commitment under a quarter of the target.',
  );
  // Phase 6: a later fund's size follows the last one and the firm's stars (§8.4).
  const cap = first ? null : nextFundCap(world, me);
  ensure(
    cap === null || a.target <= cap,
    'fund.size',
    `LPs will back up to ${formatMoney(cap ?? 0, m.data.currency)} for your next fund: the last one’s size, scaled by your firm’s stars.`,
  );
  spendHours(me, INVESTOR.hours.lpPanel, 'Writing the fund’s terms');
  const n = mine.length + 1;
  const id = newId(world, 'fund');
  const name = `${me.name.split(' ')[0]} Capital ${STRATEGY_NAME[a.strategy]} ${fundNumeral(
    mine.filter((f) => (f.lp?.strategy ?? 'seed') === a.strategy).length + 1,
  )}`;
  const accountId = openAccount(world, { currency: m.data.currency, market: m.id, label: name });
  const terms: FundTerms = {
    target: a.target,
    minCommit: a.minCommit,
    feeRate: a.feeRate,
    feeStepDown: Math.min(a.feeRate, INVESTOR.fund.feeStepDown),
    carry: a.carry,
    hurdle: a.hurdle,
    gpCommit: a.gpCommit,
    termMonths: a.termMonths,
    investMonths: a.investMonths,
    keyPerson: a.keyPerson,
  };
  const fund: Fund = {
    id,
    name,
    market: m.id,
    ai: false,
    managerId: me.id,
    partner: me.name,
    sectors: a.sectors,
    stages: a.stages,
    check: [Math.round(a.checkSize * 0.5), Math.round(a.checkSize * 2)],
    minStars: 0,
    mood: 1,
    account: accountId,
    size: 0,
    vintageMonth: m.month,
    feeRate: a.feeRate,
    carry: a.carry,
    distributed: 0,
    thesis: a.why.trim().slice(0, 200),
    stars: newStars(me.stars.value),
    investorType: a.strategy === 'impact' ? 'impact' : 'vc',
    lp: {
      number: n,
      strategy: a.strategy,
      terms,
      stage: 'raising',
      openedMonth: m.month,
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
    },
  };
  world.funds[id] = fund;
  if (first) me.investor.fundId = id;
  attachFund(world, fund);
  // The GP's own money, called like any player LP's.
  fund.lp!.commitments.push({
    id: `${id}:gp`,
    playerId: me.id,
    name: me.name,
    kind: 'gp',
    committed: Math.round(a.target * a.gpCommit),
    paidIn: 0,
    distributed: 0,
    month: m.month,
    status: 'committed',
    autopay: true,
  });
  // An anchor accepted from the ladder commits now (§8.2 "land an anchor LP").
  const anchor = me.career?.anchor;
  if (anchor && first) {
    fund.lp!.commitments.push({
      id: `${id}:anchor`,
      playerId: null,
      lpId: anchor.lpId,
      name: anchor.name,
      kind: 'dfi-fof',
      committed: costIn(world, anchor.amount, anchor.currency, m.data.currency),
      paidIn: 0,
      distributed: 0,
      month: m.month,
      status: 'committed',
      anchor: true,
    });
    delete me.career!.anchor;
  }
  // Investors in the city hear about it (player LPs).
  for (const p of Object.values(world.players))
    if (!p.ai && p.id !== me.id && p.market === m.id && hasCareer(p))
      notify(world, p.id, {
        month: m.month,
        kind: 'deal',
        text: `${me.name} is raising ${name} (target ${formatMoney(a.target, m.data.currency)}). LPs can commit from ${formatMoney(a.minCommit, m.data.currency)}.`,
      });
  return { fundId: id, name, message: `${name} is raising. Pitch LPs, then hold a first close.` };
}

/** `fund.abandon`: call off a raise before its first close; commitments are released. */
export function abandonFund(world: World, me: Player, fundId: Id) {
  const f = getFund(world, fundId);
  ensure(f.managerId === me.id, 'fund.manager', 'Only the GP can do that.');
  const lp = lpOf(f);
  ensure(
    lp.stage === 'raising',
    'fund.closed',
    'After the first close a fund can’t be called off.',
  );
  failRaise(world, f, 'You called the raise off.');
  return { status: lp.stage };
}

function failRaise(world: World, f: Fund, why: string) {
  const lp = lpOf(f);
  lp.stage = 'failed';
  for (const c of lp.commitments) if (c.status === 'committed') c.status = 'released';
  const m = getMarket(world, f.market);
  const manager = f.managerId ? world.players[f.managerId] : undefined;
  if (manager?.investor?.fundId === f.id) delete manager.investor.fundId;
  const have = committedTotal(f);
  const need = Math.round(lp.terms.target * INVESTOR.fund.firstCloseShare);
  const text = `${f.name} didn’t close: ${why} Commitments ${fmt(world, f, have)} of the ${fmt(world, f, need)} a first close needs. Commitments are released; you stay at your rung.`;
  if (manager) notify(world, manager.id, { month: m.month, kind: 'system', text });
  for (const c of lp.commitments)
    if (c.playerId && c.playerId !== f.managerId)
      notify(world, c.playerId, {
        month: m.month,
        kind: 'deal',
        text: `${f.name} didn’t close. Your commitment is released.`,
      });
}

// ---------------------------------------------------------------- LPs

/** Months of living costs a player needs liquid to commit to funds (§2.2). */
export function lpTrackOpen(world: World, p: Player): boolean {
  if (p.career?.reached[7] !== undefined) return true;
  return wealthView(world, p).liquid >= INVESTOR.tracks.lpMonths * monthOfLiving(world, p);
}

/** `lp.diligence`: hours on a GP unlock their full track record (§7.3). */
export function lpDiligence(world: World, me: Player, fundId: Id) {
  const f = getFund(world, fundId);
  ensure(f.managerId !== me.id, 'lp.own', 'It’s your own fund.');
  spendHours(me, INVESTOR.hours.lpDiligence, 'LP diligence');
  const lp = (me.lp ??= {});
  (lp.diligence ??= {})[fundId] = getMarket(world, me.market).month;
  return { message: `Diligence on ${f.name} done: track record, write-offs and terms unlocked.` };
}

/** `lp.commit`: commit money to a fund as a limited partner. */
export function commitToFund(world: World, me: Player, fundId: Id, amount: number) {
  ensure(investorOn(world), 'lp.off', 'Not available yet.');
  const f = getFund(world, fundId);
  ensure(f.managerId !== me.id, 'lp.own', 'GPs commit through the GP commitment, not as an LP.');
  ensure(!f.angelId, 'lp.angel', 'Angel funds don’t take outside LPs.');
  const m = getMarket(world, me.market);
  ensure(
    (me.lp?.banUntil ?? 0) <= m.month,
    'lp.banned',
    `You missed a capital call: no new commitments until month ${me.lp?.banUntil}.`,
  );
  ensure(
    lpTrackOpen(world, me),
    'lp.track',
    `LP commitments open at ${formatMoney(Math.round(INVESTOR.tracks.lpMonths * monthOfLiving(world, me)), m.data.currency)} of liquid wealth (${INVESTOR.tracks.lpMonths} months of living costs).`,
  );
  const fm = getMarket(world, f.market);
  ensure(amount > 0, 'lp.amount', 'Say how much.');
  if (f.ai) return commitToAiFund(world, me, f, amount);
  const lp = lpOf(f);
  ensure(
    lp.stage === 'raising' || (lp.stage === 'investing' && lp.finalCloseMonth === undefined),
    'lp.closed',
    `${f.name} has held its final close.`,
  );
  ensure(
    amount >= lp.terms.minCommit,
    'lp.min',
    `The smallest commitment is ${fmt(world, f, lp.terms.minCommit)}.`,
  );
  ensure(
    committedTotal(f) + amount <= Math.round(lp.terms.target * 1.5),
    'lp.full',
    `${f.name} is oversubscribed.`,
  );
  const existing = lp.commitments.find((c) => c.playerId === me.id && c.status === 'committed');
  const c: LpCommitment = existing ?? {
    id: `${f.id}:${me.id}`,
    playerId: me.id,
    name: me.name,
    kind: 'player',
    committed: 0,
    paidIn: 0,
    distributed: 0,
    month: fm.month,
    status: 'committed',
  };
  if (!existing) lp.commitments.push(c);
  c.committed += amount;
  // After the first close: catch up on calls already made, plus a catch-up fee.
  if (lp.stage === 'investing') {
    const issued = lp.calls.filter((x) => x.commitmentId === lp.commitments[0]!.id).length;
    const owed = Math.round((amount * issued) / INVESTOR.fund.calls);
    const fee = Math.round(amount * INVESTOR.fund.catchUpMonthly * monthsIn(world, f));
    if (owed + fee > 0) issueCall(world, f, c, owed + fee, fm.month, fee);
  }
  notify(world, f.managerId!, {
    month: fm.month,
    kind: 'deal',
    text: `${me.name} committed ${fmt(world, f, amount)} to ${f.name}.`,
  });
  achieve(world, me, 'investor.first-lp', 'First LP commitment', m.month);
  return { message: `You committed ${fmt(world, f, c.committed)} to ${f.name}.` };
}

/** Player LPs in AI funds pay in at once (AI funds are always fully funded). */
function commitToAiFund(world: World, me: Player, f: Fund, amount: number) {
  const fm = getMarket(world, f.market);
  const min = usdToLocal(world, fm, INVESTOR.fund.minCommitUsd);
  ensure(amount >= min, 'lp.min', `The smallest commitment is ${fmt(world, f, min)}.`);
  const acc = account(world, me.accounts.local);
  ensure(
    acc.balance >= costIn(world, amount, fm.data.currency, acc.currency),
    'lp.funds',
    'Not enough money in your account.',
  );
  const lp = (f.lp ??= {
    number: 1,
    strategy: 'seed',
    terms: {
      target: f.size,
      minCommit: min,
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
    openedMonth: fm.month,
    firstCloseMonth: fm.month,
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
  });
  payExact(
    world,
    me.accounts.local,
    f.account,
    amount,
    `LP commitment: ${f.name}`,
    fm.month,
    'invested',
  );
  f.size += amount;
  const existing = lp.commitments.find((c) => c.playerId === me.id);
  if (existing) {
    existing.committed += amount;
    existing.paidIn += amount;
  } else
    lp.commitments.push({
      id: `${f.id}:${me.id}`,
      playerId: me.id,
      name: me.name,
      kind: 'player',
      committed: amount,
      paidIn: amount,
      distributed: 0,
      month: fm.month,
      status: 'committed',
    });
  lp.paidIn += amount;
  achieve(world, me, 'investor.first-lp', 'First LP commitment', getMarket(world, me.market).month);
  achieve(
    world,
    me,
    'investor.first-call-paid',
    'First capital call paid',
    getMarket(world, me.market).month,
  );
  return { message: `You’re an LP in ${f.name}: ${fmt(world, f, amount)} paid in.` };
}

/**
 * An AI LP's decision from programs.ts on a fund with an LP book: a
 * commitment, paid in full now if the fund has already closed.
 */
export function aiLpCommit(
  world: World,
  f: Fund,
  lp: LpSeed,
  amount: number,
  month: number,
): number {
  const book = lpOf(f);
  const c: LpCommitment = {
    id: `${f.id}:${lp.id}`,
    playerId: null,
    lpId: lp.id,
    name: lp.name,
    kind: lp.kind,
    committed: amount,
    paidIn: 0,
    distributed: 0,
    month,
    status: 'committed',
  };
  book.commitments.push(c);
  if (book.stage === 'investing') {
    const m = getMarket(world, f.market);
    const fee = Math.round(amount * INVESTOR.fund.catchUpMonthly * monthsIn(world, f));
    transfer(world, m.ext.lps, f.account, amount + fee, `LP commitment: ${lp.name}`, month);
    c.paidIn = amount;
    c.catchUp = fee;
    book.paidIn += amount;
    book.flows.push({ month: m.month, amount: -amount });
    f.size += amount;
  }
  return amount;
}

// ---------------------------------------------------------------- closes

/** `fund.close`: the first close (half the target), or the final close. */
export function closeFund(world: World, me: Player, fundId: Id) {
  const f = getFund(world, fundId);
  ensure(f.managerId === me.id, 'fund.manager', 'Only the GP can do that.');
  const lp = lpOf(f);
  const m = getMarket(world, f.market);
  if (lp.stage === 'raising') {
    const need = Math.round(lp.terms.target * INVESTOR.fund.firstCloseShare);
    ensure(
      committedTotal(f) >= need,
      'fund.firstClose',
      `A first close needs ${fmt(world, f, need)} committed; you have ${fmt(world, f, committedTotal(f))}.`,
    );
    firstClose(world, f, m.month);
    return {
      stage: lp.stage,
      message: `${f.name} held its first close at ${fmt(world, f, f.size)}. It can invest now.`,
    };
  }
  ensure(
    lp.stage === 'investing' && lp.finalCloseMonth === undefined,
    'fund.closed',
    'The final close is done.',
  );
  finalClose(world, f, m.month);
  return {
    stage: lp.stage,
    message: `${f.name} held its final close at ${fmt(world, f, f.size)}.`,
  };
}

function firstClose(world: World, f: Fund, month: number) {
  const lp = lpOf(f);
  const m = getMarket(world, f.market);
  lp.stage = 'investing';
  lp.firstCloseMonth = month;
  f.vintageMonth = month;
  for (const c of lp.commitments) {
    if (c.status !== 'committed') continue;
    if (c.playerId === null && !c.fundId) {
      // AI LPs pay in full at the close.
      transfer(world, m.ext.lps, f.account, c.committed, `LP commitment: ${c.name}`, month);
      c.paidIn = c.committed;
      lp.paidIn += c.committed;
      lp.flows.push({ month, amount: -c.committed });
    } else issueCall(world, f, c, callAmount(c, 0), month);
  }
  f.size = committedTotal(f);
  const manager = f.managerId ? world.players[f.managerId] : undefined;
  if (manager) {
    achieve(world, manager, 'investor.first-close', 'First close', month);
    if (lp.number === 1) achieve(world, manager, 'investor.fund-1', 'Fund I', month);
    if (lp.number === 2) achieve(world, manager, 'investor.fund-2', 'Fund II', month);
    if (!manager.investor!.fundId || world.funds[manager.investor!.fundId]?.lp?.stage === 'failed')
      manager.investor!.fundId = f.id;
  }
  for (const c of lp.commitments)
    if (c.playerId && c.playerId !== f.managerId)
      notify(world, c.playerId, {
        month,
        kind: 'deal',
        text: `${f.name} held its first close. First capital call: see your LP portfolio.`,
      });
}

function finalClose(world: World, f: Fund, month: number) {
  const lp = lpOf(f);
  lp.finalCloseMonth = month;
  f.size = committedTotal(f);
  if (f.managerId)
    notify(world, f.managerId, {
      month,
      kind: 'deal',
      text: `${f.name} held its final close: ${fmt(world, f, f.size)} from ${lp.commitments.filter((c) => c.status === 'committed').length} LPs.`,
    });
}

// ---------------------------------------------------------------- capital calls

/** The k-th call (0-based) on a commitment: equal slices, the last takes the rest. */
const callAmount = (c: LpCommitment, k: number) =>
  k < INVESTOR.fund.calls - 1
    ? Math.round(c.committed / INVESTOR.fund.calls)
    : c.committed - Math.round(c.committed / INVESTOR.fund.calls) * (INVESTOR.fund.calls - 1);

function issueCall(
  world: World,
  f: Fund,
  c: LpCommitment,
  amount: number,
  month: number,
  catchUp = 0,
) {
  const lp = lpOf(f);
  const call: CapitalCall = {
    id: `call:${f.id}:${c.id}:${lp.calls.length}`,
    commitmentId: c.id,
    amount,
    month,
    dueMonth: month + INVESTOR.fund.callDueMonths,
    status: 'due',
  };
  lp.calls.push(call);
  if (catchUp) c.catchUp = (c.catchUp ?? 0) + catchUp;
  if (c.playerId && c.playerId !== f.managerId)
    notify(world, c.playerId, {
      month,
      kind: 'deal',
      text: `Capital call from ${f.name}: ${fmt(world, f, amount)} due by month ${call.dueMonth}.`,
    });
  if (c.playerId && c.playerId === f.managerId && !c.autopay)
    notify(world, c.playerId, {
      month,
      kind: 'deal',
      text: `Your GP commitment to ${f.name}: ${fmt(world, f, amount)} due by month ${call.dueMonth}.`,
    });
}

function findCall(world: World, callId: Id) {
  for (const f of Object.values(world.funds)) {
    const call = f.lp?.calls.find((x) => x.id === callId);
    if (call) return { f, call, c: f.lp!.commitments.find((x) => x.id === call.commitmentId)! };
  }
  return null;
}

/** Pay a call from the LP's personal account (the catch-up fee isn't paid-in capital). */
function settleCall(
  world: World,
  f: Fund,
  call: CapitalCall,
  c: LpCommitment,
  p: Player | undefined,
  month: number,
  from = p!.accounts.local,
) {
  const lp = lpOf(f);
  payExact(world, from, f.account, call.amount, `Capital call: ${f.name}`, month, 'invested');
  const fee = Math.min(c.catchUp ?? 0, call.amount);
  const capital = call.amount - fee;
  if (fee) c.catchUp = (c.catchUp ?? 0) - fee;
  c.paidIn += capital;
  lp.paidIn += capital;
  lp.flows.push({ month, amount: -capital });
  call.status = 'paid';
  if (p)
    achieve(
      world,
      p,
      'investor.first-call-paid',
      'First capital call paid',
      getMarket(world, p.market).month,
    );
}

/** `lp.pay`: pay a capital call now. */
export function payCall(world: World, me: Player, callId: Id) {
  const found = findCall(world, callId);
  ensure(found && found.c.playerId === me.id, 'lp.call', 'Capital call not found.');
  ensure(found.call.status === 'due', 'lp.call', 'That call is settled.');
  const acc = account(world, me.accounts.local);
  const m = getMarket(world, found.f.market);
  ensure(
    acc.balance >= costIn(world, found.call.amount, m.data.currency, acc.currency),
    'lp.funds',
    'Not enough money in your account for this call.',
  );
  settleCall(world, found.f, found.call, found.c, me, m.month);
  return { message: `Paid ${fmt(world, found.f, found.call.amount)} to ${found.f.name}.` };
}

/** `lp.delay`: ask for one month more on a call (once per call; the GP notices). */
export function delayCall(world: World, me: Player, callId: Id) {
  const found = findCall(world, callId);
  ensure(found && found.c.playerId === me.id, 'lp.call', 'Capital call not found.');
  ensure(found.call.status === 'due', 'lp.call', 'That call is settled.');
  ensure(
    !(found.c.delayed ?? []).includes(callId),
    'lp.delay',
    'You already had a delay on this call.',
  );
  (found.c.delayed ??= []).push(callId);
  found.call.dueMonth += 1;
  const rel = (found.f.lp!.relations[found.c.id] ??= { trust: 0.5, reup: false, letters: 0 });
  rel.trust = Math.max(0, rel.trust - 0.05);
  if (found.f.managerId)
    notify(world, found.f.managerId, {
      month: getMarket(world, found.f.market).month,
      kind: 'deal',
      text: `${me.name} asked for a month more on a capital call to ${found.f.name}.`,
    });
  return { message: `Due by month ${found.call.dueMonth} now.` };
}

/** `lp.autopay`: pay this fund's calls automatically when they fall due. */
export function setAutopay(world: World, me: Player, fundId: Id, on: boolean) {
  const f = getFund(world, fundId);
  const c = f.lp?.commitments.find((x) => x.playerId === me.id && x.status === 'committed');
  ensure(c, 'lp.none', 'You have no commitment to this fund.');
  c.autopay = on;
  return { autopay: on };
}

/** A missed call (§7.3): forfeit, a default on the credit record, a ban on new commitments. */
function defaultOn(world: World, f: Fund, call: CapitalCall, c: LpCommitment, month: number) {
  call.status = 'missed';
  const p = c.playerId ? world.players[c.playerId] : undefined;
  const forfeit = Math.round(c.paidIn * INVESTOR.penalties.missedCallForfeit);
  c.paidIn -= forfeit;
  // The forfeited money stays in the fund, for the LPs who paid.
  f.lp!.paidIn -= forfeit;
  c.status = 'defaulted';
  for (const x of f.lp!.calls)
    if (x.commitmentId === c.id && x.status === 'due') x.status = 'missed';
  // The committed amount it will never pay drops out of the fund's size.
  const unpaid = c.committed - c.paidIn - forfeit;
  c.committed = c.paidIn;
  f.size = Math.max(0, f.size - Math.max(0, unpaid));
  if (!p) return;
  p.credit.defaults += 1;
  const home = getMarket(world, p.market).month;
  (p.lp ??= {}).banUntil = home + INVESTOR.penalties.missedCallBanMonths;
  notify(world, p.id, {
    month: home,
    kind: 'system',
    text: `You missed a capital call to ${f.name}. You forfeit ${fmt(world, f, forfeit)} of what you paid in, it goes on your credit record, and you can’t commit to funds for ${INVESTOR.penalties.missedCallBanMonths} months.`,
  });
  if (f.managerId && f.managerId !== p.id)
    notify(world, f.managerId, {
      month,
      kind: 'deal',
      text: `${p.name} defaulted on a capital call to ${f.name}.`,
    });
}

// ---------------------------------------------------------------- settlement

/**
 * Month end for funds with an LP book in this market: failed raises, the
 * automatic final close, the next capital calls, autopay, and defaults.
 */
export function settleLpFunds(world: World, marketId: string, month: number) {
  if (!investorOn(world)) return;
  for (const f of Object.values(world.funds)) {
    const lp = f.lp;
    if (!lp || f.market !== marketId || f.ai) continue;
    if (lp.stage === 'raising') {
      if (month - lp.openedMonth >= INVESTOR.fund.finalCloseMonths)
        failRaise(world, f, 'The raise ran out of time.');
      continue;
    }
    if (lp.stage === 'failed' || lp.stage === 'wound-down' || lp.firstCloseMonth === undefined)
      continue;
    const since = month - lp.firstCloseMonth;
    if (lp.finalCloseMonth === undefined && since >= INVESTOR.fund.finalCloseMonths)
      finalClose(world, f, month);
    // Next calls, one a quarter, for player LPs and the GP.
    if (since > 0 && since % INVESTOR.fund.callEveryMonths === 0) {
      const k = since / INVESTOR.fund.callEveryMonths;
      if (k < INVESTOR.fund.calls)
        for (const c of lp.commitments)
          if ((c.playerId || c.fundId) && c.status === 'committed' && c.paidIn < c.committed)
            issueCall(world, f, c, Math.min(callAmount(c, k), c.committed - c.paidIn), month);
    }
    for (const call of lp.calls) {
      if (call.status !== 'due') continue;
      const c = lp.commitments.find((x) => x.id === call.commitmentId);
      const p = c?.playerId ? world.players[c.playerId] : undefined;
      // Phase 7: a fund of funds pays its calls from its own account, always on time if it can.
      const payer = c?.fundId ? world.funds[c.fundId] : undefined;
      if (!c || (!p && !payer)) continue;
      const from = payer ? payer.account : p!.accounts.local;
      const acc = account(world, from);
      const affordable =
        acc.balance >=
        costIn(world, call.amount, getMarket(world, f.market).data.currency, acc.currency);
      if ((c.autopay || payer) && affordable) {
        settleCall(world, f, call, c, p, month, from);
        continue;
      }
      if (month > call.dueMonth) defaultOn(world, f, call, c, month);
    }
  }
}

// ---------------------------------------------------------------- distributions

/**
 * Exit cash reaching a fund with an LP book (§8.5): LPs get paid-in back
 * (plus the hurdle) first, pro rata; carry on the rest goes to the GP.
 * In an AI fund only the player LPs' share moves; the rest stays as before.
 */
export function distributeLpFund(world: World, f: Fund, proceeds: number, month: number) {
  const lp = lpOf(f);
  const m = getMarket(world, f.market);
  const rate = m.data.tax.capitalGains;
  const holders = lp.commitments.filter((c) => c.paidIn > 0);
  if (f.ai || !f.managerId) {
    // Player LPs in an AI fund: their share of the money, after the fund's carry.
    for (const c of holders) {
      if (!c.playerId) continue;
      const p = world.players[c.playerId];
      if (!p) continue;
      const share = Math.floor((proceeds * c.paidIn) / Math.max(1, f.size));
      const gainDelta =
        Math.max(0, c.distributed + share - c.paidIn) - Math.max(0, c.distributed - c.paidIn);
      const carry = Math.round(gainDelta * f.carry);
      transfer(world, f.account, m.ext.lps, carry, `Carry: ${f.name}`, month);
      payLp(world, f, c, p, share - carry, Math.max(0, gainDelta - carry), rate, month);
    }
    return;
  }
  const paid = holders.reduce((a, c) => a + c.paidIn, 0);
  const years = Math.max(0, month - (lp.firstCloseMonth ?? month)) / 12;
  const pref = Math.round(paid * (1 + lp.terms.hurdle * years));
  const before = f.distributed;
  const after = before + proceeds;
  const carry = Math.round(
    (Math.max(0, after - pref) - Math.max(0, before - pref)) * lp.terms.carry,
  );
  const manager = world.players[f.managerId];
  if (carry > 0 && manager) {
    payCarry(world, f, manager, carry, month);
    lp.carryPaid += carry;
  }
  const toLps = proceeds - Math.max(0, carry);
  let left = toLps;
  holders.forEach((c, i) => {
    const share =
      i === holders.length - 1 ? left : Math.floor((toLps * c.paidIn) / Math.max(1, paid));
    left -= share;
    if (c.playerId) {
      const p = world.players[c.playerId];
      const gain =
        Math.max(0, c.distributed + share - c.paidIn) - Math.max(0, c.distributed - c.paidIn);
      if (p) payLp(world, f, c, p, share, gain, rate, month);
      else transfer(world, f.account, m.ext.lps, share, `Distribution: ${f.name}`, month);
    } else if (c.fundId && world.funds[c.fundId]) {
      // Phase 7: a fund of funds passes its distribution on to its own LPs.
      const fof = world.funds[c.fundId]!;
      const received = pay(world, f.account, fof.account, share, `Distribution: ${f.name}`, month);
      c.distributed += share;
      distributeFund(world, fof, received, month);
    } else {
      transfer(world, f.account, m.ext.lps, share, `Distribution to ${c.name}`, month);
      c.distributed += share;
    }
  });
  lp.flows.push({ month, amount: toLps });
  f.distributed = after;
  if (manager) {
    const multiple = after / Math.max(1, paid);
    if (multiple >= 1) achieve(world, manager, 'investor.fund-1x', 'Fund returned 1x', month);
    if (multiple >= 3) achieve(world, manager, 'investor.fund-3x', 'Fund returned 3x', month);
    if (multiple >= 10) achieve(world, manager, 'investor.fund-10x', 'Fund returned 10x', month);
  }
}

function payLp(
  world: World,
  f: Fund,
  c: LpCommitment,
  p: Player,
  amount: number,
  gain: number,
  rate: number,
  month: number,
) {
  if (amount <= 0) return;
  const m = getMarket(world, f.market);
  const tax = Math.round(Math.min(gain, amount) * rate);
  withTx(world, { kind: 'sale' }, () => {
    transfer(world, f.account, m.ext.tax, tax, `Capital gains tax: ${f.name}`, month);
    pay(world, f.account, p.accounts.local, amount - tax, `Distribution: ${f.name}`, month, 'move');
  });
  c.distributed += amount;
  if (!p.ai) recordRealised(world, p, m, amount, gain, tax);
  notify(world, p.id, {
    month: getMarket(world, p.market).month,
    kind: 'deal',
    text: `${f.name} distributed ${fmt(world, f, amount)} to you (tax ${fmt(world, f, tax)}).`,
  });
}

/** Carry to the GP (Phase 6: through the firm's carry pool), taxed as a capital gain. */
export function payCarry(world: World, f: Fund, manager: Player, carry: number, month: number) {
  const m = getMarket(world, f.market);
  // Phase 6: a firm's carry pool (partners, a succession share, the head); AI partners are paid out.
  const ai = aiCarry(world, f, carry);
  if (ai > 0) transfer(world, f.account, m.ext.payroll, ai, 'Carried interest: AI partners', month);
  const split = f.firmId ? splitCarry(world, f, carry) : [{ to: manager, amount: carry }];
  for (const { to, amount } of split) {
    if (amount <= 0) continue;
    const tax = Math.round(amount * m.data.tax.capitalGains);
    transfer(world, f.account, m.ext.tax, tax, 'Capital gains tax on carry (withheld)', month);
    pay(world, f.account, to.accounts.local, amount - tax, 'Carried interest', month);
    notify(world, to.id, {
      month,
      kind: 'deal',
      text: `Carry paid from ${f.name}: ${formatMoney(amount, m.data.currency)}. Tax: ${formatMoney(tax, m.data.currency)}.`,
    });
  }
}

/** Management fee on an LP-book fund: the term's rate, stepping down after the investment period. */
export function lpFeeRate(world: World, f: Fund): number {
  if (!f.lp) return f.feeRate;
  return inHarvest(world, f) ? f.lp.terms.feeStepDown : f.lp.terms.feeRate;
}

// ---------------------------------------------------------------- views

const round2 = (x: number) => roundTo(x, 2);

/** One fund as an LP or a GP sees it. */
export function fundCard(world: World, f: Fund, viewer: Player) {
  const lp = f.lp;
  const m = getMarket(world, f.market);
  const manager = f.managerId ? world.players[f.managerId] : undefined;
  const record = managerRecord(world, f);
  const diligenced = (viewer.lp?.diligence?.[f.id] ?? -1) >= 0 || f.managerId === viewer.id;
  const mine = lp?.commitments.find((c) => c.playerId === viewer.id);
  return {
    id: f.id,
    name: f.name,
    ai: f.ai,
    market: f.market,
    city: m.data.name,
    currency: m.data.currency,
    managerName: manager?.name ?? f.partner,
    thesis: f.thesis,
    sectors: f.sectors,
    stages: f.stages,
    strategy: lp?.strategy ?? 'seed',
    number: lp?.number ?? 1,
    stage: lp?.stage ?? 'investing',
    size: f.size,
    target: lp?.terms.target ?? f.size,
    committed: lp ? committedTotal(f) : f.size,
    terms: lp?.terms ?? null,
    firstCloseMonth: lp?.firstCloseMonth ?? null,
    finalCloseMonth: lp?.finalCloseMonth ?? null,
    lps: lp?.commitments.filter((c) => c.status !== 'released').length ?? 0,
    /** Deals and write-offs anyone can see; cash returned only after LP diligence. */
    record: diligenced ? record : { deals: record.deals, writeOffs: record.writeOffs },
    diligenced,
    minCommit: lp?.terms.minCommit ?? usdToLocal(world, m, INVESTOR.fund.minCommitUsd),
    yours: mine
      ? {
          committed: mine.committed,
          paidIn: mine.paidIn,
          distributed: mine.distributed,
          status: mine.status,
          autopay: !!mine.autopay,
        }
      : null,
  };
}

function managerRecord(world: World, f: Fund) {
  const ids = [f.id, ...(f.managerId ? [f.managerId] : [])];
  const pos = Object.values(world.positions).filter((p) => ids.includes(p.investorId));
  const invested = pos.reduce((a, p) => a + p.invested, 0);
  const returned = pos.reduce((a, p) => a + p.returned, 0);
  return {
    deals: pos.length,
    writeOffs: pos.filter((p) => p.writtenOff).length,
    exits: pos.filter((p) => p.returned > 0 && !p.writtenOff).length,
    dpi: invested > 0 ? round2(returned / invested) : 0,
    distributed: f.distributed,
  };
}

/** `view.lpFunds`: the funds you run, funds raising you could join, and your LP book. */
export function lpFundsView(world: World, p: Player) {
  if (!investorOn(world) || p.ai) return null;
  const m = getMarket(world, p.market);
  const gp = Object.values(world.funds)
    .filter((f) => f.managerId === p.id && f.lp)
    .map((f) => {
      const lp = f.lp!;
      const need = Math.round(lp.terms.target * INVESTOR.fund.firstCloseShare);
      return {
        ...fundCard(world, f, p),
        cash: account(world, f.account).balance,
        paidIn: lp.paidIn,
        feesPaid: lp.feesPaid,
        carryPaid: lp.carryPaid,
        firstCloseNeed: need,
        canFirstClose: lp.stage === 'raising' && committedTotal(f) >= need,
        canFinalClose: lp.stage === 'investing' && lp.finalCloseMonth === undefined,
        ops: fundOpsView(world, f),
        monthsLeftToRaise:
          lp.stage === 'raising'
            ? Math.max(
                0,
                INVESTOR.fund.finalCloseMonths -
                  (getMarket(world, f.market).month - lp.openedMonth),
              )
            : null,
        commitments: lp.commitments.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          committed: c.committed,
          paidIn: c.paidIn,
          distributed: c.distributed,
          status: c.status,
          anchor: !!c.anchor,
        })),
        lpPipeline: lpsOf(f.market).map((x) => ({
          id: x.id,
          name: x.name,
          kind: x.kind,
          laterFundsOnly: (x.kind === 'pension' || x.kind === 'sovereign') && lp.number < 2,
        })),
      };
    });
  const myCalls: {
    id: Id;
    fundId: Id;
    fundName: string;
    amount: number;
    dueMonth: number;
    month: number;
    currency: string;
    canDelay: boolean;
  }[] = [];
  const book = Object.values(world.funds)
    .filter((f) => f.lp?.commitments.some((c) => c.playerId === p.id && f.managerId !== p.id))
    .map((f) => {
      for (const call of f.lp!.calls) {
        const c = f.lp!.commitments.find((x) => x.id === call.commitmentId);
        if (c?.playerId === p.id && call.status === 'due')
          myCalls.push({
            id: call.id,
            fundId: f.id,
            fundName: f.name,
            amount: call.amount,
            dueMonth: call.dueMonth,
            month: getMarket(world, f.market).month,
            currency: getMarket(world, f.market).data.currency,
            canDelay: !(c.delayed ?? []).includes(call.id),
          });
      }
      return fundCard(world, f, p);
    });
  // GP commitment calls show too.
  for (const f of Object.values(world.funds).filter((x) => x.managerId === p.id && x.lp))
    for (const call of f.lp!.calls) {
      const c = f.lp!.commitments.find((x) => x.id === call.commitmentId);
      if (c?.playerId === p.id && call.status === 'due')
        myCalls.push({
          id: call.id,
          fundId: f.id,
          fundName: f.name,
          amount: call.amount,
          dueMonth: call.dueMonth,
          month: getMarket(world, f.market).month,
          currency: getMarket(world, f.market).data.currency,
          canDelay: !(c.delayed ?? []).includes(call.id),
        });
    }
  const raising = Object.values(world.funds)
    .filter(
      (f) =>
        f.managerId !== p.id &&
        ((f.lp &&
          !f.ai &&
          (f.lp.stage === 'raising' ||
            (f.lp.stage === 'investing' && f.lp.finalCloseMonth === undefined))) ||
          (f.ai && !f.angelId && f.market === m.id)),
    )
    .map((f) => fundCard(world, f, p));
  return {
    trackOpen: lpTrackOpen(world, p),
    trackNeed: Math.round(INVESTOR.tracks.lpMonths * monthOfLiving(world, p)),
    bannedUntil: (p.lp?.banUntil ?? 0) > m.month ? p.lp!.banUntil! : null,
    gp,
    book,
    calls: myCalls,
    raising,
    defaults: {
      ...INVESTOR.fund,
      minTarget: usdToLocal(world, m, 500_000),
      currency: m.data.currency,
    },
    canLaunch:
      managedFunds(world, p).length === 0
        ? p.career?.reached[3] !== undefined
        : p.career?.reached[5] !== undefined,
  };
}
