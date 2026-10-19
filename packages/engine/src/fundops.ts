/**
 * Managing a fund (investor blueprint §8.3, §8.7, Phase 5), for funds raised
 * the full way (lpfunds.ts):
 *
 *  - Metrics: NAV (marks of what the fund holds plus its cash), paid-in,
 *    distributions, TVPI, DPI and IRR on the LPs' real cash flows (game
 *    months as periods), each position's MOIC and a monthly mark history.
 *  - Portfolio construction: a plan (companies, average cheque, reserve
 *    ratio), reserves earmarked per company; new deals only from dry powder
 *    (cash less reserves), follow-ons from their reserve.
 *  - The investment committee: a cheque above a share of the fund needs IC
 *    approval; the GP and partners (or two independent AI advisers) vote,
 *    with reasons.
 *  - LPs: a quarterly letter (honest marks, or a rosy one that backfires
 *    when the next round prices lower), deployment pacing, and trust that
 *    sets who would re-up into Fund II.
 *  - Fund life: the investment period ends (harvest: follow-ons only, the
 *    fee steps down), then the term ends: an LP vote on an extension, or a
 *    wind-down that distributes the cash to every LP and carry.
 *  - Pro-rata: when a portfolio company raises again, holders with a
 *    pro-rata right are offered their share at the round's terms.
 *
 * Investor-career worlds only.
 */
import { addSafe, markValue, ownership } from './captable.js';
import { companyRunway } from './company.js';
import { INVESTOR } from './data/investor.js';
import { ensure } from './errors.js';
import { achieve, getCompany, getFund, getMarket, notify, spendHours } from './helpers.js';
import { checkPersonalCap } from './career.js';
import { checkConflict, lookThroughNav, resolveLpac } from './allocation.js';
import { committedTotal, distributeLpFund, fundCanInvest, inHarvest } from './lpfunds.js';
import { account, costIn, payExact, valueIn as convert } from './ledger.js';
import { clamp, roundTo } from './math.js';
import { formatMoney } from './money.js';
import { investorOn } from './releases.js';
import type {
  Company,
  Fund,
  FundLpState,
  Id,
  InvestmentTerms,
  LpRelation,
  Player,
  ProRataOffer,
  World,
} from './types.js';

const MARKS_KEPT = 48;
const POSITION_MARKS_KEPT = 24;

const fmt = (world: World, f: Fund, v: number) =>
  formatMoney(v, getMarket(world, f.market).data.currency);

function lpOf(f: Fund): FundLpState {
  ensure(f.lp, 'fund.simple', 'This fund was raised from the AI LP panel: it has no LP book.');
  return f.lp;
}

const monthOf = (world: World, f: Fund) => getMarket(world, f.market).month;
const monthsIn = (world: World, f: Fund) =>
  f.lp?.firstCloseMonth === undefined ? 0 : monthOf(world, f) - f.lp.firstCloseMonth;

// ---------------------------------------------------------------- metrics

/** What the fund holds at its marks (active companies), local minor units. */
export function holdingsNav(world: World, f: Fund): number {
  // Phase 7: a fund of funds holds funds; its value looks through to theirs.
  let nav = f.lp?.strategy === 'fof' ? lookThroughNav(world, f) : 0;
  for (const p of Object.values(world.positions)) {
    if (p.investorId !== f.id) continue;
    const c = world.companies[p.companyId];
    if (!c || c.status !== 'active') continue;
    nav += valueIn(world, c, f, markValue(c.capTable, f.id));
  }
  return nav;
}

/** A company-currency value in the fund's currency (funds hold abroad too). */
function valueIn(world: World, c: Company, f: Fund, v: number) {
  return convert(
    world,
    v,
    getMarket(world, c.market).data.currency,
    getMarket(world, f.market).data.currency,
  );
}

/** Net asset value: holdings at their marks plus the fund's cash. */
export const fundNav = (world: World, f: Fund) =>
  holdingsNav(world, f) + account(world, f.account).balance;

/**
 * Yearly IRR of cash flows by month (negative in, positive out), with a
 * terminal value now. Null when it can't be solved (no money in or out yet).
 */
export function irr(flows: { month: number; amount: number }[], now: number, terminal: number) {
  const all = [...flows, { month: now, amount: terminal }].filter((x) => x.amount !== 0);
  if (!all.some((x) => x.amount < 0) || !all.some((x) => x.amount > 0)) return null;
  const t0 = Math.min(...all.map((x) => x.month));
  const npv = (r: number) => all.reduce((a, x) => a + x.amount / Math.pow(1 + r, x.month - t0), 0);
  let lo = -0.99;
  let hi = 5;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  const monthly = (lo + hi) / 2;
  return roundTo(Math.pow(1 + monthly, 12) - 1, 4);
}

export function fundMetrics(world: World, f: Fund) {
  const lp = f.lp;
  const paid = lp ? lp.paidIn : f.size;
  const cash = account(world, f.account).balance;
  const holdings = holdingsNav(world, f);
  const nav = holdings + cash;
  const reserves = Object.values(lp?.reserves ?? {}).reduce((a, x) => a + x, 0);
  const deployed = Object.values(world.positions)
    .filter((p) => p.investorId === f.id)
    .reduce((a, p) => a + p.invested, 0);
  const lpDistributed = lp ? lp.commitments.reduce((a, c) => a + c.distributed, 0) : f.distributed;
  return {
    nav,
    holdings,
    cash,
    paidIn: paid,
    committed: lp ? committedTotal(f) : f.size,
    distributed: lpDistributed,
    tvpi: paid > 0 ? roundTo((lpDistributed + nav) / paid, 2) : 0,
    dpi: paid > 0 ? roundTo(lpDistributed / paid, 2) : 0,
    irr: lp ? irr(lp.flows, monthOf(world, f), nav) : null,
    deployed,
    reserves,
    dryPowder: Math.max(0, cash - reserves),
  };
}

// ---------------------------------------------------------------- plan, reserves, IC

/** `fund.plan`: how many companies, the average first cheque, the reserve ratio. */
export function setPlan(
  world: World,
  me: Player,
  fundId: Id,
  plan: { companies: number; avgCheque: number; reserveRatio: number },
) {
  const f = myFund(world, me, fundId);
  ensure(plan.companies >= 1 && plan.companies <= 60, 'fund.plan', 'Plan 1–60 companies.');
  ensure(
    plan.reserveRatio >= 0 && plan.reserveRatio <= 0.7,
    'fund.plan',
    'Reserves: 0–70% of the fund.',
  );
  ensure(plan.avgCheque > 0, 'fund.plan', 'Set an average first cheque.');
  lpOf(f).plan = plan;
  const need = plan.companies * plan.avgCheque;
  const room = Math.round(f.size * (1 - plan.reserveRatio));
  return {
    message:
      need > room
        ? `That plan needs ${fmt(world, f, need)} for first cheques, more than the ${fmt(world, f, room)} left after reserves.`
        : `Plan saved: ${plan.companies} companies at about ${fmt(world, f, plan.avgCheque)}, ${Math.round(plan.reserveRatio * 100)}% kept for follow-ons.`,
  };
}

function myFund(world: World, me: Player, fundId: Id): Fund {
  const f = getFund(world, fundId);
  ensure(f.managerId === me.id, 'fund.manager', 'Only the GP can do that.');
  lpOf(f);
  return f;
}

/** `fund.reserve`: earmark money for follow-ons in a portfolio company (0 releases it). */
export function setReserve(world: World, me: Player, fundId: Id, companyId: Id, amount: number) {
  const f = myFund(world, me, fundId);
  const lp = lpOf(f);
  ensure(
    world.positions[`${f.id}:${companyId}`],
    'fund.reserve',
    'Reserve only for companies the fund backs.',
  );
  const others = Object.entries(lp.reserves)
    .filter(([id]) => id !== companyId)
    .reduce((a, [, v]) => a + v, 0);
  const cash = account(world, f.account).balance;
  ensure(
    others + amount <= cash,
    'fund.reserve',
    `Reserves can’t exceed the fund’s cash (${fmt(world, f, cash)}).`,
  );
  if (amount <= 0) delete lp.reserves[companyId];
  else lp.reserves[companyId] = amount;
  return { reserves: others + amount };
}

const icThreshold = (f: Fund) => Math.round(f.size * INVESTOR.fund.icShare);

/**
 * Before a fund cheque (fundraising.ts): new companies only from dry powder;
 * cheques above the IC threshold only with an approval for that company.
 */
export function checkFundCheque(world: World, f: Fund, c: Company, amount: number) {
  if (!investorOn(world) || !f.lp) return;
  // Phase 7: conflicts need the LP advisory committee; a fund of funds backs funds only.
  checkConflict(world, f, c);
  const lp = f.lp;
  const followOn = !!world.positions[`${f.id}:${c.id}`];
  const m = getMarket(world, c.market);
  const cost = costIn(world, amount, m.data.currency, getMarket(world, f.market).data.currency);
  if (!followOn) {
    const dry = fundMetrics(world, f).dryPowder;
    ensure(
      cost <= dry,
      'fund.dryPowder',
      `${f.name} has ${fmt(world, f, dry)} of dry powder after reserves. Release a reserve or invest less.`,
    );
  }
  if (cost > icThreshold(f)) {
    const ok = lp.ic.some(
      (x) => x.companyId === c.id && x.status === 'approved' && x.amount >= cost,
    );
    ensure(
      ok,
      'fund.ic',
      `Cheques over ${fmt(world, f, icThreshold(f))} need investment committee approval first.`,
    );
  }
}

/** After a fund cheque: use the company's reserve first, and the IC approval. */
export function fundInvested(_world: World, f: Fund, companyId: Id, amount: number) {
  const lp = f.lp;
  if (!lp) return;
  const r = lp.reserves[companyId];
  if (r) {
    const left = r - Math.min(r, amount);
    if (left > 0) lp.reserves[companyId] = left;
    else delete lp.reserves[companyId];
  }
  const approval = lp.ic.find((x) => x.companyId === companyId && x.status === 'approved');
  if (approval) approval.amount = Math.max(0, approval.amount - amount);
}

/** Who sits on the IC: the GP, the firm's partners and principals, or two AI advisers. */
function committee(world: World, f: Fund): { id: Id; name: string; ai: boolean }[] {
  const gp = world.players[f.managerId!]!;
  const firm = f.firmId ? world.firms?.[f.firmId] : undefined;
  const members =
    firm?.members.filter(
      (m) => m.status === 'active' && (m.title === 'partner' || m.title === 'principal'),
    ) ?? [];
  if (members.length > 0)
    return [
      { id: gp.id, name: gp.name, ai: false },
      ...members.map((m) => ({ id: m.playerId ?? m.id, name: m.name, ai: m.playerId === null })),
    ];
  return [
    { id: gp.id, name: gp.name, ai: false },
    { id: `${f.id}:adviser-1`, name: 'Independent adviser (risk)', ai: true },
    { id: `${f.id}:adviser-2`, name: 'Independent adviser (markets)', ai: true },
  ];
}

/**
 * An AI member's vote, with a reason (deterministic): the company's stars,
 * the thesis, diligence done, and how much of the fund the cheque is.
 */
function aiVote(world: World, f: Fund, c: Company, amount: number, who: string) {
  const gp = world.players[f.managerId!]!;
  const inThesis = f.sectors === 'any' || f.sectors.includes(c.industry);
  const depth = gp.diligence[c.id] ?? 0;
  const share = amount / Math.max(1, f.size);
  const runway = companyRunway(world, c);
  if (!inThesis)
    return { yes: false, reason: `${who}: “It’s outside the thesis we sold our LPs.”` };
  if (depth < 1) return { yes: false, reason: `${who}: “No first call yet. Do the diligence.”` };
  if (c.stars.value < 2) return { yes: false, reason: `${who}: “The numbers aren’t there yet.”` };
  if (share > 0.15) return { yes: false, reason: `${who}: “Too much of the fund in one company.”` };
  if (runway < 3) return { yes: false, reason: `${who}: “They’re out of money in weeks.”` };
  return { yes: true, reason: `${who}: “In the thesis, diligenced, sized right. Yes.”` };
}

/** `fund.ic`: take a cheque to the investment committee (2h). */
export function requestIc(world: World, me: Player, fundId: Id, companyId: Id, amount: number) {
  const f = myFund(world, me, fundId);
  const lp = lpOf(f);
  const c = getCompany(world, companyId);
  ensure(amount > 0, 'fund.ic', 'Say how much.');
  spendHours(me, INVESTOR.hours.icMeeting, 'Investment committee');
  const members = committee(world, f);
  const votes: Record<Id, 'yes' | 'no'> = {};
  const reasons: string[] = [];
  for (const mbr of members) {
    if (!mbr.ai) {
      votes[mbr.id] = 'yes';
      continue;
    }
    const v = aiVote(world, f, c, amount, mbr.name);
    votes[mbr.id] = v.yes ? 'yes' : 'no';
    reasons.push(v.reason);
  }
  const yes = Object.values(votes).filter((v) => v === 'yes').length;
  const status = yes * 2 > members.length ? 'approved' : 'rejected';
  lp.ic = lp.ic.filter((x) => x.companyId !== c.id);
  lp.ic.push({
    dealKey: `${f.id}:${c.id}`,
    companyId: c.id,
    amount,
    status,
    month: monthOf(world, f),
    votes,
  });
  return {
    status,
    reasons,
    message:
      status === 'approved'
        ? `The investment committee approved ${fmt(world, f, amount)} for ${c.name}.`
        : `The investment committee said no to ${c.name}.`,
  };
}

// ---------------------------------------------------------------- LP relations and letters

const relationOf = (lp: FundLpState, id: Id): LpRelation =>
  (lp.relations[id] ??= { trust: 0.5, reup: false, letters: 0 });

function nudgeTrust(lp: FundLpState, delta: number) {
  for (const c of lp.commitments)
    if (c.status === 'committed' || c.status === 'defaulted') {
      const r = relationOf(lp, c.id);
      r.trust = clamp(r.trust + delta, 0, 1);
    }
}

/** `fund.letter`: the quarterly letter to LPs (3h). Honest marks, or a rosier story. */
export function writeLetter(world: World, me: Player, fundId: Id, honest: boolean) {
  const f = myFund(world, me, fundId);
  const lp = lpOf(f);
  ensure(lp.firstCloseMonth !== undefined, 'fund.letter', 'Letters start after the first close.');
  ensure((lp.lettersDue ?? []).length > 0, 'fund.letter', 'No letter is due: one a quarter.');
  spendHours(me, INVESTOR.hours.lpLetter, 'Writing to LPs');
  const metrics = fundMetrics(world, f);
  const nav = honest ? metrics.nav : Math.round(metrics.nav * 1.25);
  const tvpi = metrics.paidIn > 0 ? roundTo((metrics.distributed + nav) / metrics.paidIn, 2) : 0;
  const month = monthOf(world, f);
  const news = Object.values(world.positions)
    .filter((p) => p.investorId === f.id)
    .map((p) => world.companies[p.companyId])
    .filter((c): c is Company => !!c)
    .slice(0, 3)
    .map(
      (c) =>
        `${c.name} ${c.status === 'active' ? `(${roundTo(c.stars.value, 1)}★)` : `(${c.status})`}`,
    )
    .join(', ');
  const text = `${f.name}, quarterly letter: NAV ${fmt(world, f, nav)}, TVPI ${tvpi}×, DPI ${metrics.dpi}×. ${news ? `Portfolio: ${news}.` : ''}${honest ? '' : ' “Momentum has never been stronger.”'}`;
  lp.letters.push({ month, nav, tvpi, dpi: metrics.dpi, honest, text });
  if (lp.letters.length > 16) lp.letters.splice(0, lp.letters.length - 16);
  lp.lettersDue = [];
  // Honest letters build trust slowly (faster with cash returned); rosy ones win a little now.
  nudgeTrust(lp, honest ? 0.04 + (metrics.dpi > 0 ? 0.04 : 0) : 0.06);
  for (const c of lp.commitments) {
    relationOf(lp, c.id).letters += 1;
    if (c.playerId && c.playerId !== me.id)
      notify(world, c.playerId, { month, kind: 'deal', text });
  }
  return {
    message: honest
      ? 'Letter sent. LPs appreciate straight marks.'
      : 'Letter sent. It reads well… for now.',
  };
}

// ---------------------------------------------------------------- fund life

/** `fund.extend`: ask LPs to extend the fund's term (they vote at the term's end). */
export function requestExtension(world: World, me: Player, fundId: Id) {
  const f = myFund(world, me, fundId);
  const lp = lpOf(f);
  ensure(
    lp.stage === 'harvest' || lp.stage === 'investing',
    'fund.extend',
    'Only a live fund can be extended.',
  );
  ensure(!lp.extension, 'fund.extend', 'LPs already have an extension to vote on.');
  lp.extension = { month: monthOf(world, f), status: 'open' };
  return {
    message: `LPs will vote on ${INVESTOR.fund.extensionMonths} more months when the term ends.`,
  };
}

/** Did LPs (by commitment, those trusting the GP) approve the extension? */
function extensionVote(f: Fund): boolean {
  const lp = lpOf(f);
  let yes = 0;
  let all = 0;
  for (const c of lp.commitments) {
    if (c.status !== 'committed' || c.kind === 'gp') continue;
    all += c.committed;
    if (relationOf(lp, c.id).trust >= 0.5) yes += c.committed;
  }
  return all === 0 || yes * 2 > all;
}

/** Month end for every live fund with an LP book in this market. */
export function settleFundOps(world: World, marketId: string, month: number) {
  if (!investorOn(world)) return;
  for (const f of Object.values(world.funds)) {
    const lp = f.lp;
    if (!lp || f.ai || f.market !== marketId || lp.firstCloseMonth === undefined) continue;
    if (lp.stage === 'failed' || lp.stage === 'wound-down') continue;
    resolveLpac(world, f, true);
    const metrics = fundMetrics(world, f);
    lp.marks.push({ month, nav: metrics.nav });
    if (lp.marks.length > MARKS_KEPT) lp.marks.splice(0, lp.marks.length - MARKS_KEPT);
    const since = month - lp.firstCloseMonth;
    const gp = f.managerId ? world.players[f.managerId] : undefined;
    // The investment period ends: harvest (follow-ons only, the fee steps down).
    if (lp.stage === 'investing' && since >= lp.terms.investMonths) {
      lp.stage = 'harvest';
      if (gp)
        notify(world, gp.id, {
          month,
          kind: 'system',
          text: `${f.name} is past its investment period: follow-ons only, and the fee steps down.`,
        });
    }
    // A quarter ends: a letter is due. One left unwritten for a quarter costs trust.
    if (since > 0 && since % 3 === 0) {
      const due = (lp.lettersDue ??= []);
      if (due.length > 0) {
        nudgeTrust(lp, -0.05);
        if (gp)
          notify(world, gp.id, {
            month,
            kind: 'system',
            text: `LPs in ${f.name} didn’t get last quarter’s letter. Trust fell.`,
          });
      }
      lp.lettersDue = [month];
      if (gp)
        notify(world, gp.id, {
          month,
          kind: 'deal',
          text: `Quarterly LP letter due for ${f.name}.`,
        });
      // Pacing: deploying too slowly or too fast worries LPs.
      const investable = f.size * (1 - (lp.plan?.reserveRatio ?? INVESTOR.fund.reserveRatio));
      const expected = investable * Math.min(1, since / lp.terms.investMonths);
      if (lp.stage === 'investing' && since >= 6 && expected > 0) {
        const ratio = metrics.deployed / expected;
        if (ratio < 0.5 || ratio > 1.5) nudgeTrust(lp, -0.02);
      }
    }
    // A rosy letter in the last six months backfires when a company prices lower or fails.
    const rosy = lp.letters.filter((l) => !l.honest && !l.exposed && month - l.month <= 6);
    if (rosy.length > 0 && portfolioHitThisMonth(world, f, month)) {
      nudgeTrust(lp, -0.15);
      for (const l of rosy) l.exposed = true;
      if (gp)
        notify(world, gp.id, {
          month,
          kind: 'system',
          text: `LPs in ${f.name} noticed the marks in your last letter were too high. Trust fell sharply.`,
        });
    }
    // Who would re-up into the next fund.
    if (since >= 12)
      for (const c of lp.commitments) {
        if (c.kind === 'gp') continue;
        const r = relationOf(lp, c.id);
        r.reup =
          c.status === 'committed' && r.trust >= 0.6 && (metrics.dpi >= 0.3 || metrics.tvpi >= 1.2);
      }
    // The term ends: an extension vote, or a wind-down.
    if (since >= lp.terms.termMonths) {
      if (lp.extension?.status === 'open') {
        if (extensionVote(f)) {
          lp.extension.status = 'approved';
          lp.terms.termMonths += INVESTOR.fund.extensionMonths;
          lp.stage = 'extended';
          if (gp)
            notify(world, gp.id, {
              month,
              kind: 'deal',
              text: `LPs voted to extend ${f.name} by ${INVESTOR.fund.extensionMonths} months.`,
            });
          continue;
        }
        lp.extension.status = 'rejected';
      }
      windDown(world, f, month);
    }
  }
  // Pro-rata offers lapse.
  for (const o of Object.values(world.prorata ?? {}))
    if (
      o.status === 'open' &&
      month > o.expiresMonth &&
      world.companies[o.companyId]?.market === marketId
    )
      o.status = 'expired';
}

/** Did a fund company price lower, or fail, this month? (From the mark history.) */
function portfolioHitThisMonth(world: World, f: Fund, month: number): boolean {
  for (const p of Object.values(world.positions)) {
    if (p.investorId !== f.id) continue;
    const m = p.marks ?? [];
    const last = m[m.length - 1];
    const prev = m[m.length - 2];
    if (last?.month === month && prev && last.value < prev.value * 0.8) return true;
    if (p.writtenOff && world.companies[p.companyId]?.closedMonth === month) return true;
  }
  return false;
}

/** The fund's life is over: its cash goes to LPs (then carry); what it still holds pays out later. */
function windDown(world: World, f: Fund, month: number) {
  const lp = lpOf(f);
  lp.stage = 'wound-down';
  const cash = account(world, f.account).balance;
  if (cash > 0) distributeLpFund(world, f, cash, month);
  if (f.managerId)
    notify(world, f.managerId, {
      month,
      kind: 'system',
      text: `${f.name} reached the end of its term and is wound down: ${fmt(world, f, cash)} distributed.`,
    });
}

// ---------------------------------------------------------------- marks for every investor

/** A position's mark this month: listed price, last round, or exit. */
function markOf(c: Company, holderId: Id) {
  if (c.status !== 'active') return { value: 0, source: 'exit' as const };
  if (c.ipo?.status === 'listed')
    return {
      value: Math.round((c.capTable.holdings[holderId]?.shares ?? 0) * (c.ipo.price ?? 0)),
      source: 'listed' as const,
    };
  return { value: markValue(c.capTable, holderId), source: 'round' as const };
}

/** Month end: record each human investor's (and their funds' and syndicates') marks here. */
export function settlePositionMarks(world: World, marketId: string, month: number) {
  if (!investorOn(world)) return;
  for (const p of Object.values(world.positions)) {
    const c = world.companies[p.companyId];
    if (!c || c.market !== marketId) continue;
    const human =
      world.players[p.investorId]?.ai === false ||
      (world.funds[p.investorId]?.managerId && !world.funds[p.investorId]?.ai) ||
      !!world.syndicates?.[p.investorId];
    if (!human) continue;
    const marks = (p.marks ??= []);
    if (marks[marks.length - 1]?.month === month) continue;
    if (c.status !== 'active' && marks[marks.length - 1]?.source === 'exit') continue;
    const mk = markOf(c, p.investorId);
    marks.push({
      month,
      value: mk.value,
      source: c.lastRaiseMonth === month ? 'round' : mk.source === 'round' ? 'model' : mk.source,
    });
    if (marks.length > POSITION_MARKS_KEPT) marks.splice(0, marks.length - POSITION_MARKS_KEPT);
  }
}

// ---------------------------------------------------------------- pro-rata

/** What a holder owns for pro-rata: shares, plus unconverted SAFEs at their caps. */
function proRataShare(c: Company, holderId: Id): number {
  const safes = c.capTable.safes
    .filter((s) => s.holderId === holderId)
    .reduce((a, s) => a + s.amount / Math.max(1, s.cap), 0);
  return ownership(c.capTable, holderId) + safes;
}

/** Holders with a pro-rata right and what they own before a new round (deals.ts). */
export function proRataBefore(world: World, c: Company, newInvestorId: Id) {
  if (!investorOn(world)) return [];
  return Object.values(world.positions)
    .filter(
      (p) => p.companyId === c.id && p.proRata && p.investorId !== newInvestorId && !p.writtenOff,
    )
    .map((p) => ({ holderId: p.investorId, own: proRataShare(c, p.investorId) }))
    .filter((x) => x.own > 0);
}

/**
 * After a round executes (deals.ts): the new investor's pro-rata right is
 * recorded, earlier holders with one are offered their share at the round's
 * terms, and a fund's reserve and IC approval are used.
 */
export function afterRound(
  world: World,
  c: Company,
  holderId: Id,
  t: InvestmentTerms,
  before: { holderId: Id; own: number }[],
) {
  if (!investorOn(world)) return;
  const m = getMarket(world, c.market);
  const pos = world.positions[`${holderId}:${c.id}`];
  if (pos && t.proRata) pos.proRata = true;
  const fund = world.funds[holderId];
  if (fund?.lp) fundInvested(world, fund, c.id, t.amount);
  if (t.bridge) return;
  for (const b of before) {
    const amount = Math.round(b.own * t.amount);
    if (amount <= 0) continue;
    const offer: ProRataOffer = {
      id: `pr:${c.id}:${b.holderId}:${m.month}`,
      companyId: c.id,
      holderId: b.holderId,
      amount,
      instrument: t.instrument,
      cap: t.valuation,
      price: c.capTable.lastPrice,
      month: m.month,
      expiresMonth: m.month + 1,
      status: 'open',
    };
    (world.prorata ??= {})[offer.id] = offer;
    const who =
      world.players[b.holderId] ??
      (world.funds[b.holderId]?.managerId
        ? world.players[world.funds[b.holderId]!.managerId!]
        : undefined);
    if (who && !who.ai)
      notify(world, who.id, {
        month: m.month,
        kind: 'deal',
        text: `${c.name} raised again. Your pro-rata: ${formatMoney(amount, m.data.currency)} at the same terms, until month ${offer.expiresMonth}.`,
        ref: { kind: 'company', id: c.id },
      });
  }
}

/** `prorata.take` / `prorata.decline`: use a pro-rata right, personally or from your fund. */
export function answerProRata(world: World, me: Player, offerId: Id, take: boolean) {
  const o = world.prorata?.[offerId];
  ensure(o, 'prorata.missing', 'Offer not found.');
  const fund = world.funds[o.holderId];
  ensure(
    o.holderId === me.id || fund?.managerId === me.id,
    'prorata.forbidden',
    'This offer isn’t yours.',
  );
  ensure(o.status === 'open', 'prorata.closed', 'That offer has closed.');
  if (!take) {
    o.status = 'declined';
    return { status: o.status };
  }
  const c = getCompany(world, o.companyId);
  ensure(c.status === 'active', 'company.closed', 'The company is no longer operating.');
  const m = getMarket(world, c.market);
  const from = fund ? fund.account : me.accounts.local;
  if (fund) {
    const why = fundCanInvest(world, fund, c.id);
    ensure(!why, 'fund.notInvesting', why ?? '');
  } else checkPersonalCap(world, me, m.data.currency, o.amount);
  const acc = account(world, from);
  ensure(
    acc.balance >= costIn(world, o.amount, m.data.currency, acc.currency),
    'prorata.funds',
    'Not enough money for your pro-rata.',
  );
  payExact(world, from, c.account, o.amount, `Pro-rata follow-on: ${c.name}`, m.month, 'invested');
  if (o.instrument === 'safe')
    addSafe(c.capTable, {
      holderId: o.holderId,
      amount: o.amount,
      cap: Math.max(o.cap, o.amount + 1),
      month: m.month,
    });
  else {
    const shares = Math.round(o.amount / Math.max(1e-9, o.price));
    const h = (c.capTable.holdings[o.holderId] ??= { shares: 0, kind: 'investor' });
    h.shares += shares;
    c.capTable.preferences.push({
      holderId: o.holderId,
      invested: o.amount,
      multiple: 1,
      participating: false,
      shares,
      seniority: c.capTable.roundsRaised,
    });
  }
  const pos = world.positions[`${o.holderId}:${c.id}`]!;
  pos.invested += o.amount;
  if (fund?.lp) fundInvested(world, fund, c.id, o.amount);
  o.status = 'taken';
  achieve(
    world,
    me,
    'investor.first-follow-on',
    'First follow-on',
    getMarket(world, me.market).month,
  );
  return {
    status: o.status,
    message: `Follow-on done: ${formatMoney(o.amount, m.data.currency)} more in ${c.name}.`,
  };
}

// ---------------------------------------------------------------- views

/** The fund dashboard for its GP (§5.3 "Fund dashboard"). */
export function fundOpsView(world: World, f: Fund) {
  const lp = f.lp;
  if (!lp) return null;
  const metrics = fundMetrics(world, f);
  const since = monthsIn(world, f);
  const positions = Object.values(world.positions)
    .filter((p) => p.investorId === f.id)
    .map((p) => {
      const c = world.companies[p.companyId];
      const mark = c && c.status === 'active' ? markValue(c.capTable, f.id) : 0;
      return {
        companyId: p.companyId,
        name: c?.name ?? '',
        invested: p.invested,
        returned: p.returned,
        mark,
        moic: p.invested > 0 ? roundTo((p.returned + mark) / p.invested, 2) : 0,
        reserve: lp.reserves[p.companyId] ?? 0,
        status: positionStatus(world, p.companyId, p.writtenOff),
        history: (p.marks ?? []).map((x) => x.value),
      };
    });
  const relations = lp.commitments
    .filter((c) => c.kind !== 'gp' && c.status !== 'released')
    .map((c) => ({
      name: c.name,
      kind: c.kind,
      ...(lp.relations[c.id] ?? { trust: 0.5, reup: false, letters: 0 }),
    }));
  return {
    metrics,
    month: monthOf(world, f),
    monthsIn: since,
    investMonths: lp.terms.investMonths,
    termMonths: lp.terms.termMonths,
    feeRate: inHarvest(world, f) ? lp.terms.feeStepDown : lp.terms.feeRate,
    plan: lp.plan ?? null,
    icThreshold: icThreshold(f),
    ic: lp.ic.slice(-6),
    letterDue: (lp.lettersDue ?? []).length > 0,
    letters: lp.letters
      .slice(-4)
      .map((l) => ({ month: l.month, nav: l.nav, tvpi: l.tvpi, dpi: l.dpi })),
    relations,
    reups: relations.filter((r) => r.reup).length,
    navHistory: lp.marks.map((x) => x.nav),
    positions,
    extension: lp.extension ?? null,
  };
}

/** Raising, healthy, at risk, exited or written off (§5.3 "Portfolio grid"). */
export function positionStatus(world: World, companyId: Id, writtenOff: boolean) {
  const c = world.companies[companyId];
  if (!c) return 'written-off' as const;
  if (writtenOff || c.status === 'shutdown') return 'written-off' as const;
  if (c.status === 'acquired' || c.ipo?.status === 'listed') return 'exited' as const;
  if (companyRunway(world, c) < 3) return 'at-risk' as const;
  if (c.raising) return 'raising' as const;
  return 'healthy' as const;
}

/** Your open pro-rata offers (personal and your funds'). */
export function proRataView(world: World, p: Player) {
  return Object.values(world.prorata ?? {})
    .filter(
      (o) =>
        o.status === 'open' && (o.holderId === p.id || world.funds[o.holderId]?.managerId === p.id),
    )
    .map((o) => {
      const c = world.companies[o.companyId];
      return {
        ...o,
        companyName: c?.name ?? '',
        currency: c ? getMarket(world, c.market).data.currency : '',
        viaFund: world.funds[o.holderId]?.name ?? null,
        ownershipPct: c ? roundTo((ownership(c.capTable, o.holderId) || 0) * 100, 1) : 0,
      };
    });
}
