/**
 * The sales conversation (player feedback, round two: "finding customers… I
 * simply click and I have a customer. I should be quizzed with context of the
 * business and their needs so I can display my understanding of their needs
 * and pitch"). Feedback-note worlds only: `sales.talk` is an unknown command
 * before it, and the pipeline's one-click close and the walk-in pitch stay as
 * they were for old worlds.
 *
 * A deal in the pipeline (sales.ts), or a local business you walk into, is a
 * conversation of three turns before you ask for the deal:
 *
 *   1. What you lead with: three openings, their real need (sales.ts
 *      SalesNeed: fit, price, a known brand, reliability; revealed by a
 *      discovery meeting, hinted by your interviews and the segment's needs),
 *      which scores best, another need and a feature tour.
 *   2. Price: three prices against the budget band you know (theirs after
 *      discovery, a guess before it), and a discount up to the pipeline's
 *      40% cap.
 *   3. Terms: three of a paid pilot, month-to-month, annual up front, or pay
 *      per use, each right for a different customer (trust, authority,
 *      urgency, need); the one that suits them is always among them.
 *
 * Three choices a turn (player feedback: "Maybe we reduce the questions").
 *
 * The win chance is the pipeline's own (`winChance`, at the price you named),
 * moved by how well the opening and the terms fit them, and shown live after
 * every turn. Asking for the deal closes it through the pipeline's
 * `closeDeal`: a win is a Sales account billed every settlement, so revenue,
 * customers and the stage tracker move as for any other deal; a loss names
 * its reason and leaves the one recovery attempt. The result is scored 0–100
 * with your call vs the best call and why at each turn, and what this kind of
 * customer cares about (the segment's need weights).
 *
 * Determinism: the openings on offer come from
 * `deriveRng(seed, 'sales', 'talk', deal, n)`, the close from the 'talk'
 * close label. No money moves until the won account is billed.
 */
import {
  LEAD_LINES,
  LEAD_REACTIONS,
  LEAD_WHY,
  PRICE_REACTIONS,
  PRICE_WHY,
  TALK_GRADES,
  TERMS_KINDS,
  TERMS_LINES,
  TERMS_REACTIONS,
  TERMS_WHY,
  TOUR_LINE,
  type LeadKind,
  type Line,
  type PriceBand,
  type TermsKind,
} from './data/customer-interviews.js';
import { openerFor, productTheme } from './data/sales-openers.js';
import { getBusiness, isOpen, pitchBlocker } from './economy.js';
import { ensure, fail } from './errors.js';
import { getMarket, ownCompany, spendHours } from './helpers.js';
import { interviewHints } from './customer-interviews.js';
import { clamp } from './math.js';
import { formatMoney } from './money.js';
import { deriveRng } from './rng.js';
import {
  SALES,
  assumed,
  closeDeal,
  hasDealRoom,
  isOpenDeal,
  makeLead,
  salesView,
  winChance,
} from './sales.js';
import { feedbackOn } from './releases.js';
import type {
  Company,
  Id,
  Player,
  SalesCustomer,
  SalesDeal,
  SalesNeed,
  SalesTalk,
  World,
} from './types.js';

export const TALK = {
  /** The meeting itself, and asking for the deal. */
  hours: 2,
  askHours: 1,
  /** How far a perfect (or hopeless) opening and terms move the chance. */
  leadEffect: 0.2,
  termsEffect: 0.15,
  /** A walk-in deal must close within this many months. */
  walkInMonths: 2,
  /** What each terms option does to the monthly price. */
  termsFactor: { pilot: 1, monthly: 1, annual: 0.85, usage: 0.9 } as Record<TermsKind, number>,
  /**
   * Months after the signing month a won customer is committed for: a paid
   * pilot for one month then a year, a year up front; none month to month.
   */
  commitMonths: { pilot: 12, monthly: 0, annual: 11, usage: 0 } as Record<TermsKind, number>,
} as const;

/** Stages a conversation can start from: after the first call, before a close. */
export const TALK_FROM = ['contacted', 'discovery', 'demo', 'proposal', 'negotiation'] as const;
const canTalkAt = (d: SalesDeal) => (TALK_FROM as readonly string[]).includes(d.stage);
/** Sat down and not yet asked (a recovered deal keeps only the count of talks held). */
const underWay = (t: SalesTalk) => !t.result && t.leadOptions.length > 0;

const NEEDS: SalesNeed[] = ['fit', 'price', 'stars', 'reliability'];
const round2 = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------- Scoring

function needWeights(world: World, c: Company, d: SalesDeal): Record<SalesNeed, number> {
  const seg = getMarket(world, c.market).segments[d.customer.segmentKey];
  const w = seg?.needs ?? { fit: 0.25, price: 0.25, stars: 0.25, reliability: 0.25 };
  const total = NEEDS.reduce((a, k) => a + w[k], 0) || 1;
  return Object.fromEntries(NEEDS.map((k) => [k, w[k] / total])) as Record<SalesNeed, number>;
}

type LeadFit = 'match' | 'partial' | 'tour' | 'miss';

function leadScore(world: World, c: Company, d: SalesDeal, k: LeadKind) {
  if (k === 'tour') return { score: 0.2, fit: 'tour' as LeadFit };
  if (k === d.customer.need) return { score: 1, fit: 'match' as LeadFit };
  const w = needWeights(world, c, d);
  const top = Math.max(...NEEDS.map((n) => w[n]));
  const score = round2(0.6 * (w[k] / top));
  return { score, fit: (score >= 0.4 ? 'partial' : 'miss') as LeadFit };
}

/** The price band options rest on: theirs after discovery, a guess before it. */
const bandOf = (world: World, c: Company, d: SalesDeal) =>
  d.revealed ? d.customer : assumed(getMarket(world, c.market), d);

function priceOptions(world: World, c: Company, d: SalesDeal) {
  const b = bandOf(world, c, d);
  const mid = Math.round((b.budgetMin + b.budgetMax) / 2);
  return [
    { id: 'below', amount: Math.max(1, Math.round(b.budgetMin * 0.75)) },
    { id: 'mid', amount: Math.max(1, mid) },
    { id: 'top', amount: Math.max(1, b.budgetMax) },
  ];
}

/** Where a monthly price falls against their real band. */
function bandFor(who: SalesCustomer, monthly: number): PriceBand {
  const mid = (who.budgetMin + who.budgetMax) / 2;
  if (monthly < who.budgetMin) return 'below';
  if (monthly <= mid * 1.1) return 'inside';
  if (monthly <= who.budgetMax) return 'top';
  return 'above';
}
const PRICE_SCORE: Record<PriceBand, number> = { below: 0.5, inside: 1, top: 0.7, above: 0.25 };

function termsScore(who: SalesCustomer, t: TermsKind): number {
  switch (t) {
    case 'pilot':
      return who.trust < 0.5 || who.authority < 0.5 ? 1 : 0.65;
    case 'annual':
      return who.authority >= 0.6 && who.trust >= 0.5 && who.urgency >= 0.6 ? 1 : 0.3;
    case 'monthly':
      return who.need === 'price' || who.urgency < 0.4 ? 0.8 : 0.5;
    case 'usage':
      return who.need === 'price' ? 0.85 : 0.45;
  }
}
/** The terms on offer in a conversation (one begun before there were three: all four). */
const termsOf = (t: SalesTalk): readonly string[] => t.termsOptions ?? TERMS_KINDS;
const bestTerms = (who: SalesCustomer): TermsKind =>
  TERMS_KINDS.slice().sort((a, b) => termsScore(who, b) - termsScore(who, a))[0]!;

/** Monthly price after the discount and the terms. */
function monthlyOf(d: SalesDeal): number {
  const t = d.talk;
  if (!t?.price) return 0;
  const f = t.terms ? TALK.termsFactor[t.terms as TermsKind] : 1;
  return Math.max(1, Math.round(t.price * f * (1 - (t.discountPct ?? 0) / 100)));
}

/** What a deal is worth a month in a conversation: the price you named, else the middle option. */
function talkValue(world: World, c: Company, d: SalesDeal): number {
  if (d.talk?.price) return monthlyOf(d);
  return priceOptions(world, c, d).find((o) => o.id === 'mid')!.amount;
}

/**
 * The chance if you asked now: the pipeline's chance at your price (an
 * estimate before discovery), moved by the opening and the terms.
 */
function talkChance(world: World, c: Company, d: SalesDeal, me: Player, known?: boolean): number {
  const t = d.talk;
  const monthly = monthlyOf(d) || d.price || c.price;
  let p = winChance(world, c, d, { price: monthly, founder: me, ...(known ? { known } : {}) });
  if (t?.lead) p += (leadScore(world, c, d, t.lead as LeadKind).score - 0.5) * TALK.leadEffect;
  if (t?.terms) p += (termsScore(d.customer, t.terms as TermsKind) - 0.6) * TALK.termsEffect;
  return round2(clamp(p, SALES.chance[0], SALES.chance[1]));
}

// ---------------------------------------------------------------- Commands

export interface TalkInput {
  companyId?: Id;
  dealId?: Id;
  businessId?: Id;
  action: 'start' | 'lead' | 'price' | 'terms' | 'ask';
  option?: string;
  discountPct?: number;
}

function myCompany(world: World, me: Player, companyId?: Id): Company {
  if (companyId) return ownCompany(world, me.id, companyId);
  const c = me.companyIds
    .map((id) => world.companies[id])
    .find((x) => x && x.status === 'active' && x.founderIds.includes(me.id));
  ensure(c, 'sales.company', 'Start a company first: you need something to sell.');
  return c!;
}

function findTalkDeal(world: World, me: Player, cmd: TalkInput): { c: Company; d: SalesDeal } {
  const ids = cmd.companyId ? [cmd.companyId] : me.companyIds;
  for (const id of ids) {
    const c = world.companies[id];
    const d = c?.deals?.find((x) => x.id === cmd.dealId);
    if (c && d) return { c: ownCompany(world, me.id, c.id), d };
  }
  return fail('sales.deal', 'That deal isn’t in your pipeline.');
}

/** Walk into a local business: it joins your pipeline as a deal you're talking to now. */
function walkIn(world: World, me: Player, companyId: Id | undefined, businessId: Id) {
  const c = myCompany(world, me, companyId);
  const b = getBusiness(world, businessId);
  const m = getMarket(world, c.market);
  const month = m.month;
  const open = (c.deals ?? []).find(
    (x) => x.customer.businessId === b.id && isOpenDeal(x) && x.stage !== 'lead',
  );
  if (open) return { c, d: open };
  ensure(isOpen(b), 'business.closed', `${b.name} has closed.`);
  const blocker = pitchBlocker(world, me, b, c.id, TALK.hours);
  ensure(!blocker, 'business.pitch', blocker ?? '');
  ensure(
    hasDealRoom(c),
    'sales.prospect.full',
    'Your pipeline is full. Close or drop a deal first.',
  );
  const rng = deriveRng(world.seed, 'sales', 'walkin', c.id, b.id, month);
  const customer = makeLead(world, c, m, rng, b);
  ensure(customer, 'sales.prospect.market', 'No buyers for this product here.');
  // A lead already on the board for this business: you're talking to them now.
  const lead = (c.deals ?? []).find((x) => x.customer.businessId === b.id && x.stage === 'lead');
  me.businessPitches = {
    month,
    count: (me.businessPitches?.month === month ? me.businessPitches.count : 0) + 1,
  };
  if (lead) {
    lead.stage = 'contacted';
    return { c, d: lead };
  }
  c.salesSeq = (c.salesSeq ?? 0) + 1;
  const d: SalesDeal = {
    id: `${c.id}-d${c.salesSeq}`,
    customer: customer!,
    stage: 'contacted',
    createdMonth: month,
    deadline: month + TALK.walkInMonths,
    revealed: false,
  };
  (c.deals ??= []).push(d);
  return { c, d };
}

export function salesTalk(world: World, me: Player, cmd: TalkInput) {
  if (cmd.action === 'start' && cmd.businessId && !cmd.dealId) {
    const { c, d } = walkIn(world, me, cmd.companyId, cmd.businessId);
    return startTalk(world, me, c, d);
  }
  ensure(cmd.dealId, 'sales.deal', 'Pick a deal.');
  const { c, d } = findTalkDeal(world, me, cmd);
  if (cmd.action === 'start') return startTalk(world, me, c, d);
  const t = d.talk;
  ensure(t && underWay(t), 'sales.talk.none', 'Start the conversation first.');
  ensure(canTalkAt(d), 'sales.stage', 'That step isn’t possible at this stage of the deal.');
  const month = getMarket(world, c.market).month;
  ensure(month <= d.deadline, 'sales.deadline', 'This deal has run out of time.');
  c.lastDecisionMonth = month;
  switch (cmd.action) {
    case 'lead': {
      ensure(!t.lead, 'sales.talk.order', 'You’ve already opened.');
      ensure(
        cmd.option && t.leadOptions.includes(cmd.option),
        'sales.talk.option',
        'That isn’t one of the options.',
      );
      t.lead = cmd.option;
      break;
    }
    case 'price': {
      ensure(t.lead && !t.terms, 'sales.talk.order', 'Open first, then name your price.');
      const opt = priceOptions(world, c, d).find((o) => o.id === cmd.option);
      ensure(opt, 'sales.talk.option', 'That isn’t one of the options.');
      const pct = cmd.discountPct ?? 0;
      ensure(
        Number.isInteger(pct) && pct >= 0 && pct <= SALES.maxDiscountPct,
        'sales.discount',
        `A discount can be at most ${SALES.maxDiscountPct}%.`,
      );
      t.priceOption = opt.id;
      t.price = opt.amount;
      t.discountPct = pct;
      if (!d.revealed) t.guessed = true;
      break;
    }
    case 'terms': {
      ensure(t.price && !t.terms, 'sales.talk.order', 'Name your price first.');
      ensure(
        cmd.option && termsOf(t).includes(cmd.option),
        'sales.talk.option',
        'That isn’t one of the options.',
      );
      t.terms = cmd.option;
      break;
    }
    case 'ask':
      ensure(t.lead && t.price && t.terms, 'sales.talk.order', 'Finish the conversation first.');
      return askForDeal(world, me, c, d, month);
  }
  return { dealId: d.id, chance: talkChance(world, c, d, me) };
}

function startTalk(world: World, me: Player, c: Company, d: SalesDeal) {
  const month = getMarket(world, c.market).month;
  ensure(
    canTalkAt(d),
    'sales.stage',
    d.stage === 'lead'
      ? 'Call them first: then you can sit down and talk.'
      : 'That step isn’t possible at this stage of the deal.',
  );
  ensure(month <= d.deadline, 'sales.deadline', 'This deal has run out of time.');
  // A conversation under way picks up where you left it.
  if (d.talk && underWay(d.talk))
    return { dealId: d.id, resumed: true, chance: talkChance(world, c, d, me) };
  spendHours(me, TALK.hours, `Sales conversation: ${d.customer.name}`);
  const n = (d.talk?.n ?? 0) + 1;
  const rng = deriveRng(world.seed, 'sales', 'talk', d.id, n);
  // Their real need is always on offer, with a feature tour and one other opening;
  // the terms that suit them best, with two others.
  const other = rng.pick(NEEDS.filter((k) => k !== d.customer.need));
  const best = bestTerms(d.customer);
  const terms = rng.shuffle(TERMS_KINDS.filter((k) => k !== best)).slice(0, 2);
  d.talk = {
    n,
    month,
    leadOptions: rng.shuffle([d.customer.need, 'tour', other]),
    termsOptions: rng.shuffle([best, ...terms]),
  };
  c.lastDecisionMonth = month;
  return { dealId: d.id, started: true, chance: talkChance(world, c, d, me) };
}

function askForDeal(world: World, me: Player, c: Company, d: SalesDeal, month: number) {
  const t = d.talk!;
  // The deal is decided on what they really have; before discovery the
  // player saw a guess (the live chance, as shown), kept with the result so
  // it can show both.
  const guess = d.revealed ? undefined : talkChance(world, c, d, me);
  spendHours(me, TALK.askHours, `Asking ${d.customer.name} for the deal`);
  const chance = talkChance(world, c, d, me, true);
  const f = TALK.termsFactor[t.terms as TermsKind];
  d.price = Math.max(1, Math.round(t.price! * f));
  d.discountPct = t.discountPct ?? 0;
  d.revealed = true;
  const out = closeDeal(world, me, c, d, month, { chance, label: 'talk' });
  // A paid pilot then a year, or a year up front, is a commitment: they stay
  // through it (sales.ts settleSales). Month to month and pay-per-use don't.
  const months = TALK.commitMonths[t.terms as TermsKind];
  const account = out.won ? c.salesAccounts?.find((a) => a.dealId === d.id) : undefined;
  if (account && months > 0) account.committedUntil = month + months;
  const who = d.customer;
  const lead = leadScore(world, c, d, t.lead as LeadKind);
  const monthly = monthlyOf(d);
  const priceS = PRICE_SCORE[bandFor(who, monthly)];
  const termsS = termsScore(who, t.terms as TermsKind);
  t.result = {
    score: Math.round(((lead.score + priceS + termsS) / 3) * 100),
    won: !!out.won,
    chance,
    ...(guess !== undefined ? { guess } : {}),
    monthly: 'monthly' in out ? out.monthly : monthly,
    turns: [
      { turn: 'lead', option: t.lead!, score: lead.score, best: who.need },
      { turn: 'price', option: t.priceOption!, score: priceS, best: 'mid' },
      { turn: 'terms', option: t.terms!, score: termsS, best: bestTerms(who) },
    ],
  };
  return { ...out, score: t.result.score };
}

// ---------------------------------------------------------------- View

/**
 * What an opening says: in the customer's segment's words, the product-fit
 * one following the company's idea (data/sales-openers.ts); the industry's
 * line for a segment without its own.
 */
function leadLine(c: Company, segmentKey: string, k: string): Line {
  if (k === 'tour') return TOUR_LINE;
  const need = k as Exclude<LeadKind, 'tour'>;
  const theme = productTheme(c.industry, c.idea, c.starterIdea?.id);
  return openerFor(segmentKey, need, theme) ?? LEAD_LINES[c.industry][need];
}

const fit3 = (s: number) => (s >= 0.8 ? 'good' : s >= 0.5 ? 'ok' : 'bad');

/** A deal's conversation for the client (feedback note): options, reactions, live chance, result. */
export function talkView(world: World, c: Company, d: SalesDeal, viewer?: Player) {
  const m = getMarket(world, c.market);
  const me = viewer ?? world.players[c.founderIds[0]!]!;
  const t = d.talk;
  const cur = m.data.currency;
  const open = isOpenDeal(d);
  const band = bandOf(world, c, d);
  const prices = priceOptions(world, c, d);
  const reactLead = t?.lead ? LEAD_REACTIONS[leadScore(world, c, d, t.lead as LeadKind).fit] : null;
  const monthly = monthlyOf(d);
  const reactPrice = t?.price ? PRICE_REACTIONS[bandFor(d.customer, monthly)] : null;
  const reactTerms = t?.terms
    ? TERMS_REACTIONS[fit3(termsScore(d.customer, t.terms as TermsKind))]
    : null;
  const step =
    !t || !underWay(t) ? null : !t.lead ? 'lead' : !t.price ? 'price' : !t.terms ? 'terms' : 'ask';
  const w = needWeights(world, c, d);
  const res = t?.result;
  return {
    canStart: open && canTalkAt(d) && m.month <= d.deadline,
    hours: TALK.hours,
    askHours: TALK.askHours,
    step,
    maxDiscountPct: SALES.maxDiscountPct,
    band: { min: band.budgetMin, max: band.budgetMax, known: d.revealed },
    chance: open && t ? talkChance(world, c, d, me) : null,
    /** The live chance is a guess until a discovery meeting shows what they really have. */
    chanceGuess: !d.revealed,
    leadOptions: (t?.leadOptions ?? []).map((id) => ({
      id,
      text: leadLine(c, d.customer.segmentKey, id),
    })),
    lead: t?.lead ? { id: t.lead, reaction: reactLead } : null,
    priceOptions: prices,
    price: t?.price
      ? {
          id: t.priceOption!,
          amount: t.price,
          discountPct: t.discountPct ?? 0,
          monthly,
          reaction: reactPrice,
          /** Named against your guess at their band, not theirs. */
          guessed: !!t.guessed,
        }
      : null,
    termsOptions: (t ? termsOf(t) : TERMS_KINDS).map((id) => ({
      id,
      text: TERMS_LINES[id as TermsKind],
    })),
    terms: t?.terms ? { id: t.terms, reaction: reactTerms } : null,
    hints: interviewHints(world, c, d.customer.segmentKey),
    result: res
      ? {
          score: res.score,
          won: res.won,
          chance: res.chance,
          /** The chance shown before you asked, when it was a guess (no discovery). */
          guess: res.guess ?? null,
          monthly: res.monthly,
          grade: TALK_GRADES.find((g) => res.score >= g.min)!.label,
          turns: res.turns.map((x) => {
            const fit = x.turn === 'lead' ? leadScore(world, c, d, x.option as LeadKind).fit : null;
            return {
              turn: x.turn,
              score: x.score,
              mark: fit3(x.score),
              option:
                x.turn === 'lead'
                  ? leadLine(c, d.customer.segmentKey, x.option)
                  : x.turn === 'terms'
                    ? TERMS_LINES[x.option as TermsKind]
                    : null,
              best:
                x.option === x.best
                  ? null
                  : x.turn === 'lead'
                    ? leadLine(c, d.customer.segmentKey, x.best)
                    : x.turn === 'terms'
                      ? TERMS_LINES[x.best as TermsKind]
                      : null,
              bestAmount:
                x.turn === 'price' && x.score < 1
                  ? Math.round((d.customer.budgetMin + d.customer.budgetMax) / 2)
                  : null,
              why:
                x.turn === 'lead'
                  ? LEAD_WHY[fit!]
                  : x.turn === 'price'
                    ? PRICE_WHY[bandFor(d.customer, res.monthly)]
                    : TERMS_WHY[x.best as TermsKind],
            };
          }),
          /** What this kind of customer cares about (the segment's need weights), theirs flagged. */
          cared: NEEDS.map((k) => ({
            need: k,
            weight: round2(w[k]),
            theirs: k === d.customer.need,
          })).sort((a, b) => b.weight - a.weight),
          budget: { min: d.customer.budgetMin, max: d.customer.budgetMax },
          bandLabel: `${formatMoney(d.customer.budgetMin, cur)}–${formatMoney(d.customer.budgetMax, cur)}`,
        }
      : null,
  };
}

export type TalkView = ReturnType<typeof talkView>;

/** The pipeline view (sales.ts) with each deal's conversation (null before the feedback note). */
export function salesWithTalk(world: World, c: Company, viewer?: Player) {
  const v = salesView(world, c, viewer);
  const on = feedbackOn(world);
  const byId = new Map((c.deals ?? []).map((d) => [d.id, d]));
  const deals = v.deals.map((x) => {
    const d = byId.get(x.id);
    // Feedback note: an open deal's value is what the conversation would ask
    // (the middle of the band you know, a guess before discovery, or the price
    // you named), not the company's list price.
    const value = on && d && isOpenDeal(d) && !d.price ? talkValue(world, c, d) : x.value;
    return {
      ...x,
      value,
      valueGuess: on && !!d && isOpenDeal(d) && !d.price && !d.talk?.price && !d.revealed,
      talk: on && d ? talkView(world, c, d, viewer) : null,
    };
  });
  return {
    ...v,
    /** Feedback note: proposals and closes happen in a sales conversation. */
    talks: on,
    deals,
    stats: on
      ? {
          ...v.stats,
          pipelineValue: Math.round(
            deals
              .filter((x) => x.monthsLeft !== null)
              .reduce((a, x) => a + x.value * x.probability, 0),
          ),
        }
      : v.stats,
  };
}
