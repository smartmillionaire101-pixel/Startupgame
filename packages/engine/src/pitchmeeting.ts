/**
 * Round 7 #13: the investor pitch meeting (gameplay-note worlds). Before the
 * note a pitch is a deck, a questions form and a status in the history; with
 * it, `pitch.start` sits you down with the investor, like the sales
 * conversation (salestalk.ts):
 *
 *   1. You open with one of three: a customer's story from your interview
 *      notes (when you have them), your traction or the problem, the size of
 *      the market, or a tour of the features.
 *   2. He asks two or three questions built from the company's real numbers
 *      (paying customers, revenue and its trend, the pipeline, runway, a
 *      named rival). Each has a true answer (stronger with won customers,
 *      a pipeline and interview notes), a stretch he will check in
 *      diligence, and a dodge. A business co-founder in the room takes the
 *      competition question, and adds to the pitch; one who introduced
 *      you to this fund (intros.ts) has him start warmer.
 *   3. The ask: an amount and a pre-money, against the band where he prices
 *      teams like yours.
 *
 * An AI fund decides at the table: diligence checks every stretch (most are
 * caught, and that ends it), then his interest decides whether a term sheet
 * comes out, priced from the band. The result says what moved him, in
 * points. You can accept it, counter once (he agrees, meets you or holds),
 * or walk away. A player investor gets the deck and your answers as a deal
 * card, and answers it themselves (`pitch.reply`): accept, counter or pass.
 *
 * Determinism: what's on offer and diligence come from
 * `deriveRng(seed, 'pitchmeet', pitch, …)`. Money moves only through the
 * deal card (deals.ts executeDeal, on the ledger).
 */
import { businessCofounderOf } from './cofounders.js';
import { forwardRunway } from './company.js';
import { introFor, introInterest } from './intros.js';
import { interviewHints } from './customer-interviews.js';
import { PASS_NOTE } from './dealcraft.js';
import { actOnDeal, openDeal } from './deals.js';
import { ensure } from './errors.js';
import {
  cofounderPitch,
  deckEmphasis,
  firstMeetingScore,
  introScore,
  proposeInvestment,
  strengths,
} from './fundraising.js';
import {
  adjustTrust,
  getCompany,
  getFund,
  getMarket,
  getPlayer,
  lastPnl,
  localToUsdMajor,
  nextStage,
  notify,
} from './helpers.js';
import { clamp, logistic } from './math.js';
import { account, valueIn } from './ledger.js';
import { deriveRng } from './rng.js';
import { dealPrice, isOpenDeal } from './sales.js';
import { payingCustomers } from './traction.js';
import { monthlyGrowth, valueCompany } from './valuation.js';
import type {
  Company,
  Fund,
  Id,
  InvestmentTerms,
  PassReason,
  Pitch,
  PitchAskOption,
  PitchMeeting,
  PitchMeetingAnswer,
  PitchMeetingFacts,
  PitchMeetingOpener,
  PitchMeetingQuestion,
  PitchMoved,
  Player,
  Stage,
  World,
} from './types.js';

export const MEETING = {
  minutes: 45,
  /** A player investor's starting interest (there is no fund score to start from). */
  playerBase: 45,
  /** Getting the meeting at all: interest starts this far above the fund's cold score. */
  warm: 20,
  opener: { problem: 5, market: 3, tour: -4 },
  /** A dodge, and a stretch at the table (before diligence finds it). */
  vague: -5,
  stretch: 7,
  /** Diligence finds a stretched number this often; "nobody else does this" less, without a rival. */
  caught: 0.75,
  caughtNoRival: 0.4,
  /** What being caught costs on the result, on top of losing the stretch. */
  caughtCost: 15,
  worry: { customers: -10, runway: -6 },
  ask: { below: 2, inside: 4, above: -4, far: -10 },
  /** His band around the model valuation (times the fund's mood). */
  band: [0.85, 1.1] as [number, number],
  /** Above the band by up to this share is "just above"; past it is far. */
  justAbove: 0.15,
  /** Interest where a term sheet is an even bet, and how sharp the turn is. */
  even: 50,
  spread: 8,
  /** Your one counter: this much over his number (or your own, if that's closer). */
  counterUp: 0.1,
  counterCap: 0.15,
} as const;

/** Round to two significant figures (£148,312 → £150k). */
export function nice(x: number): number {
  if (x <= 0) return 0;
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(x)) - 1));
  return Math.round(x / p) * p;
}

// ---------------------------------------------------------------- Facts

/** The company's real numbers when the meeting begins. */
export function meetingFacts(world: World, c: Company): PitchMeetingFacts {
  const m = getMarket(world, c.market);
  const pnl = lastPnl(c);
  const rawRunway = forwardRunway(world, c);
  const open = (c.deals ?? []).filter((d) => isOpenDeal(d) && d.stage !== 'lead');
  const order = ['negotiation', 'proposal', 'demo', 'discovery', 'contacted'];
  const top = open
    .slice()
    .sort(
      (a, b) =>
        order.indexOf(a.stage) - order.indexOf(b.stage) ||
        dealPrice(c, b) - dealPrice(c, a) ||
        (a.id < b.id ? -1 : 1),
    )[0];
  const accounts = c.salesAccounts ?? [];
  const biggest = accounts
    .slice()
    .sort((a, b) => b.monthly - a.monthly || (a.dealId < b.dealId ? -1 : 1))[0];
  const hint = c.interviews?.hints?.[0];
  const pain = hint ? interviewHints(world, c, hint.segmentKey, 1)[0] : undefined;
  const rival = m.rivals?.[c.industry]?.[0]?.name ?? null;
  return {
    customers: payingCustomers(world, c),
    revenue: pnl?.revenue ?? 0,
    growth: Math.round(monthlyGrowth(c) * 100) / 100,
    cash: account(world, c.account).balance,
    runway: Number.isFinite(rawRunway) ? Math.round(rawRunway * 10) / 10 : null,
    pipeline: open.length,
    pipelineValue: open.reduce((a, d) => a + dealPrice(c, d), 0),
    topDeal: top?.customer.name ?? null,
    topDealValue: top ? dealPrice(c, top) : 0,
    accounts: accounts.length,
    topAccount: biggest?.name ?? null,
    topAccountMonthly: biggest?.monthly ?? 0,
    interviews: c.interviews?.n ?? 0,
    interviewScore: c.interviews?.last?.score ?? null,
    pain: pain ? { en: pain.text.en, fr: pain.text.fr } : null,
    painBy: pain?.name ?? null,
    rival,
  };
}

// ---------------------------------------------------------------- Scoring

function openerPoints(f: PitchMeetingFacts, k: PitchMeetingOpener): number {
  if (k === 'story') return 8 + Math.round((4 * (f.interviewScore ?? 50)) / 100);
  if (k === 'traction') return 6 + Math.min(6, f.customers);
  return MEETING.opener[k];
}

/** What a true answer stands on, strongest first (the tag the founder sees). */
export function answerBasis(f: PitchMeetingFacts, q: PitchMeetingQuestion): string {
  switch (q) {
    case 'traction':
      return f.customers > 0 || f.accounts > 0
        ? 'customers'
        : f.pipeline > 0
          ? 'pipeline'
          : f.interviews > 0
            ? 'interviews'
            : 'none';
    case 'runway':
      return f.runway === null ? 'profitable' : 'runway';
    case 'competition':
      return f.pain ? 'notes' : f.rival ? 'rival' : 'plain';
  }
}

/** Points an answer moves him, at the table (a stretch before diligence). */
export function answerPoints(
  f: PitchMeetingFacts,
  q: PitchMeetingQuestion,
  a: PitchMeetingAnswer,
): number {
  if (a === 'vague') return MEETING.vague;
  if (a === 'stretch') return MEETING.stretch;
  const basis = answerBasis(f, q);
  switch (q) {
    case 'traction':
      // Won customers make the answer stronger; so does a pipeline, and interviews.
      if (basis === 'customers')
        return Math.min(14, 5 + Math.min(7, f.customers) + (f.accounts > 0 ? 2 : 0));
      if (basis === 'pipeline') return 5 + Math.min(3, f.pipeline - 1) + (f.interviews > 0 ? 1 : 0);
      return basis === 'interviews' ? 4 : 1;
    case 'runway': {
      const r = f.runway;
      return r === null || r >= 18 ? 7 : r >= 12 ? 6 : r >= 6 ? 3 : 1;
    }
    case 'competition':
      if (basis === 'notes') return 6 + ((f.interviewScore ?? 0) >= 70 ? 2 : 0);
      return basis === 'rival' ? 3 : 4;
  }
}

/** Where a pre-money falls against his band. */
export function askWhere(band: [number, number], pre: number) {
  if (pre < band[0]) return 'below' as const;
  if (pre <= band[1]) return 'inside' as const;
  if (pre <= band[1] * (1 + MEETING.justAbove)) return 'above' as const;
  return 'far' as const;
}

/** Interest now (0–100), and what has moved it so far, in order. */
export function meetingMoved(m: PitchMeeting): PitchMoved[] {
  const out: PitchMoved[] = [];
  if (m.opener) out.push({ id: `opener:${m.opener}`, points: openerPoints(m.facts, m.opener) });
  for (const q of m.questions)
    if (q.answer)
      out.push({
        id: `${q.cofounder ? 'cofounder-answer' : 'answer'}:${q.id}:${q.answer}`,
        points: answerPoints(m.facts, q.id, q.answer),
      });
  out.push(...m.start);
  if (m.ask)
    out.push({
      id: `ask:${askWhere(m.band, m.ask.preMoney)}`,
      points: MEETING.ask[askWhere(m.band, m.ask.preMoney)],
    });
  return out;
}

export const interestOf = (m: PitchMeeting, moved = meetingMoved(m)) =>
  Math.round(clamp(m.base + moved.reduce((a, x) => a + x.points, 0), 0, 100));

/** How well you played it, 0–100: each call against the best one on offer. */
function meetingScore(m: PitchMeeting, caught: PitchMeetingQuestion[]): number {
  const parts: number[] = [];
  if (m.opener) {
    const best = Math.max(...m.openers.map((o) => openerPoints(m.facts, o)));
    parts.push(clamp(openerPoints(m.facts, m.opener) / Math.max(1, best), 0, 1));
  }
  for (const q of m.questions) {
    if (!q.answer) continue;
    parts.push(
      q.answer === 'true' ? 1 : q.answer === 'vague' ? 0.15 : caught.includes(q.id) ? 0 : 0.3,
    );
  }
  if (m.ask)
    parts.push({ below: 0.75, inside: 1, above: 0.5, far: 0.25 }[askWhere(m.band, m.ask.preMoney)]);
  return parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : 0;
}

/** What he cares about at this stage (shown as weights; team first early on). */
export function caresFor(stage: Stage) {
  const w =
    stage === 'pre-seed'
      ? { team: 35, traction: 30, market: 20, deck: 15 }
      : stage === 'seed'
        ? { team: 25, traction: 40, market: 20, deck: 15 }
        : { team: 20, traction: 45, market: 20, deck: 15 };
  return (Object.keys(w) as (keyof typeof w)[]).map((k) => ({ id: k, weight: w[k] }));
}

// ---------------------------------------------------------------- Starting

/**
 * Sit down with the investor (after `startPitch` made the pitch a meeting):
 * the facts, his band, where his interest starts, the openers and questions.
 */
export function beginMeeting(world: World, p: Pitch, preMoney?: number): PitchMeeting {
  const c = getCompany(world, p.companyId);
  const f = meetingFacts(world, c);
  const rng = deriveRng(world.seed, 'pitchmeet', p.id, 'begin');
  const stage = nextStage(c.lastRound);
  const model = valueCompany(world, c, stage).value;
  const fund = p.fundId ? getFund(world, p.fundId) : null;
  const centre = model * (fund ? fund.mood : 1);
  const band: [number, number] = [nice(centre * MEETING.band[0]), nice(centre * MEETING.band[1])];
  const start: PitchMoved[] = [];
  const s = strengths(world, c);
  const deck = Math.round(deckEmphasis(s, p.slides) * 100);
  if (deck !== 0) start.push({ id: 'deck', points: deck });
  const biz = businessCofounderOf(c);
  const co = cofounderPitch(world, c);
  const coPoints = Math.round(co.score * 100);
  if (biz && coPoints > 0) start.push({ id: 'cofounder', points: coPoints });
  // A business co-founder introduced you: he starts warmer (intros.ts).
  const intro = fund ? introFor(world, c, fund.id, p.id) : undefined;
  const introPoints = intro ? introInterest(intro) : 0;
  if (intro && introPoints > 0) start.push({ id: 'intro', points: introPoints });
  if (f.customers === 0) start.push({ id: 'worry:customers', points: MEETING.worry.customers });
  if (f.runway !== null && f.runway < 3)
    start.push({ id: 'worry:runway', points: MEETING.worry.runway });
  let base: number = MEETING.playerBase;
  if (fund) {
    // The fund's own view of the company, less what the deck, the co-founder and the intro add (counted above).
    const raw =
      firstMeetingScore(world, fund, c, p) -
      deckEmphasis(s, p.slides) -
      co.score -
      introScore(world, c, fund.id, p.id);
    base = Math.round(clamp(raw * 100 + MEETING.warm, 5, 85));
  }
  const best: PitchMeetingOpener = f.pain ? 'story' : f.customers > 0 ? 'traction' : 'problem';
  const qs: PitchMeetingQuestion[] = ['traction', 'runway'];
  if (f.rival || f.pain || biz) qs.push('competition');
  const m: PitchMeeting = {
    investor: fund ? 'fund' : 'player',
    facts: f,
    openers: rng.shuffle([best, 'market', 'tour'] as PitchMeetingOpener[]),
    questions: qs.map((id) => {
      const options = rng.shuffle(['true', 'stretch', 'vague'] as PitchMeetingAnswer[]);
      // A business co-founder in the room takes the competition question, and answers it straight.
      return biz && id === 'competition'
        ? { id, options, answer: 'true' as const, cofounder: true }
        : { id, options };
    }),
    preMoney: preMoney && preMoney > 0 ? preMoney : nice(model),
    band,
    base,
    start,
    cofounder: biz && coPoints > 0 ? { name: biz.name, points: coPoints } : null,
    intro: intro && introPoints > 0 ? { name: intro.byName, points: introPoints } : null,
  };
  p.meeting = m;
  return m;
}

// ---------------------------------------------------------------- Asking

/** The three asks on offer: your number, inside his band, and a big swing. */
export function askOptions(p: Pitch): { id: PitchAskOption; amount: number; preMoney: number }[] {
  const m = p.meeting!;
  return [
    { id: 'yours', amount: p.ask, preMoney: m.preMoney },
    { id: 'inside', amount: p.ask, preMoney: nice((m.band[0] + m.band[1]) / 2) },
    {
      id: 'swing',
      amount: nice(p.ask * 2),
      preMoney: nice(Math.max(m.preMoney, m.band[1]) * 1.8),
    },
  ];
}

const priced = (c: Company, stage: Stage) =>
  stage === 'series-a' ||
  stage === 'series-b' ||
  stage === 'series-c' ||
  c.capTable.roundsRaised > 0;

/** A pre-money as the deal card's valuation: pre for a priced round, the post-money cap for a SAFE. */
const cardValuation = (isPriced: boolean, pre: number, amount: number) =>
  isPriced ? pre : pre + amount;

/** The pre-money behind a deal card's valuation. */
export const preOf = (t: InvestmentTerms) =>
  t.instrument === 'priced' ? t.valuation : t.valuation - t.amount;

/** He prices it: your number when it's in his band (or under it), else where his interest puts him. */
function offerPre(m: PitchMeeting, interest: number): number {
  const ask = m.ask!;
  const where = askWhere(m.band, ask.preMoney);
  if (where === 'below' || where === 'inside') return ask.preMoney;
  const [lo, hi] = m.band;
  return nice(lo + (hi - lo) * clamp((interest - 40) / 50, 0, 1));
}

function openTermSheet(world: World, p: Pitch, fund: Fund, c: Company, interest: number) {
  const m = p.meeting!;
  const stage = nextStage(c.lastRound);
  const fundCur = getMarket(world, fund.market).data.currency;
  const companyCur = getMarket(world, c.market).data.currency;
  const check = fund.check.map((v) => valueIn(world, v, fundCur, companyCur)) as [number, number];
  const pre = offerPre(m, interest);
  const amount = Math.max(
    1,
    Math.min(clamp(m.ask!.amount, check[0], check[1]), Math.round(pre / 2)),
  );
  const isPriced = priced(c, stage);
  const terms: InvestmentTerms = {
    kind: 'investment',
    instrument: isPriced ? 'priced' : 'safe',
    stage,
    amount,
    valuation: cardValuation(isPriced, pre, amount),
    liquidationMultiple: 1,
    participating: false,
    proRata: true,
    boardSeat: isPriced,
    vetoOnSale: isPriced && interest < 55,
    poolTopUpBps: isPriced ? 1000 : 0,
  };
  // How far he'd go on your one counter: further the keener he is.
  const give = clamp((interest - MEETING.even) / 250, 0, MEETING.counterCap);
  const deal = openDeal(world, {
    companyId: c.id,
    proposer: { kind: 'fund', id: fund.id },
    counterparty: { kind: 'company', id: c.id },
    terms,
    by: fund.id,
    aiLimit: { maxValuation: Math.round(terms.valuation * (1 + give)), maxAmount: check[1] },
  });
  p.status = 'term-sheet';
  p.dealId = deal.id;
  p.reason = `${fund.partner}: “We’d like to invest. Term sheet attached.”`;
  return pre;
}

/** Why he passed, from the biggest thing that held him back. */
const PASS_LINE: Record<string, string> = {
  'worry:customers': 'Come back when one customer pays you.',
  'worry:runway': 'You’re too close to running out of money for us.',
  'ask:far': 'We’re too far apart on price.',
  'ask:above': 'The price is ahead of where you are.',
  deck: 'The story isn’t there yet.',
};

function decide(world: World, p: Pitch, me: Player) {
  const m = p.meeting!;
  const c = getCompany(world, p.companyId);
  const moved = meetingMoved(m);
  const caught: PitchMeetingQuestion[] = [];
  if (m.investor === 'player') {
    // A player investor reads your answers and checks them themselves.
    const inv = getPlayer(world, p.investorPlayerId!);
    p.status = 'sent';
    inv.diligence[c.id] = Math.max(inv.diligence[c.id] ?? 0, 1);
    notify(world, inv.id, {
      month: getMarket(world, c.market).month,
      kind: 'pitch',
      text: `${c.name} pitched you (${p.slides.join(', ')}), with their answers. Answer it in Deal offers.`,
      ref: { kind: 'company', id: c.id },
    });
    m.result = {
      score: meetingScore(m, caught),
      interest: interestOf(m, moved),
      moved,
      outcome: 'sent',
      caught,
    };
    return;
  }
  const fund = getFund(world, p.fundId!);
  const rng = deriveRng(world.seed, 'pitchmeet', p.id, 'decide');
  // Diligence checks every stretch.
  for (const q of m.questions) {
    if (q.answer !== 'stretch') continue;
    const odds = q.id === 'competition' && !m.facts.rival ? MEETING.caughtNoRival : MEETING.caught;
    if (rng.chance(odds)) caught.push(q.id);
  }
  for (const id of caught)
    moved.push({ id: `caught:${id}`, points: -(MEETING.stretch + MEETING.caughtCost) });
  const interest = interestOf(m, moved);
  const score = meetingScore(m, caught);
  const result: NonNullable<PitchMeeting['result']> = {
    score,
    interest,
    moved,
    outcome: 'passed',
    caught,
  };
  m.result = result;
  if (caught.length) {
    result.outcome = 'caught';
    p.status = 'passed';
    p.reason = `${fund.partner}: “Your numbers didn’t match what we found in diligence.”`;
    fund.mood = clamp(fund.mood - 0.02, 0.5, 1.5);
    adjustTrust(me, fund.id, -0.5);
    return;
  }
  if (!rng.chance(logistic((interest - MEETING.even) / MEETING.spread))) {
    p.status = 'passed';
    const worst = moved
      .filter((x) => x.points < 0)
      .sort((a, b) => a.points - b.points || (a.id < b.id ? -1 : 1))[0];
    p.reason = `${fund.partner}: “${PASS_LINE[worst?.id ?? ''] ?? 'Not this time. Keep us posted.'}”`;
    return;
  }
  const mk = getMarket(world, c.market);
  const stage = nextStage(c.lastRound);
  const big =
    localToUsdMajor(world, mk, m.ask!.amount) >= 1_000_000 ||
    stage === 'series-a' ||
    stage === 'series-b' ||
    stage === 'series-c';
  if (big) {
    result.outcome = 'partners';
    p.status = 'partner-meeting';
    p.reason = `${fund.partner}: “I’d like you to meet my partners.”`;
    return;
  }
  result.outcome = 'term-sheet';
  result.offerPre = openTermSheet(world, p, fund, c, interest);
}

/** Your one counter: 10% over his number, or your own number if that's closer (at most 15% over). */
export function counterPre(p: Pitch, offer: number): number {
  const mine = p.meeting?.ask?.preMoney ?? 0;
  if (mine > offer) return Math.min(mine, nice(offer * (1 + MEETING.counterCap)));
  return nice(offer * (1 + MEETING.counterUp));
}

// ---------------------------------------------------------------- Commands

export interface MeetInput {
  pitchId: Id;
  action: 'open' | 'answer' | 'ask' | 'accept' | 'counter' | 'walk' | 'leave';
  option?: string;
  questionId?: string;
}

const company = (p: Pitch) => ({ kind: 'company' as const, id: p.companyId });

export function pitchMeet(world: World, me: Player, cmd: MeetInput) {
  const p = world.pitches[cmd.pitchId];
  ensure(p && p.founderId === me.id && p.meeting, 'pitch.missing', 'Pitch not found.');
  const m = p.meeting!;
  const c = getCompany(world, p.companyId);
  c.lastDecisionMonth = getMarket(world, c.market).month;
  if (cmd.action === 'accept' || cmd.action === 'counter' || cmd.action === 'walk')
    return termSheetMove(world, me, p, cmd.action);
  ensure(p.status === 'meeting', 'pitch.state', 'This meeting is over.');
  switch (cmd.action) {
    case 'leave': {
      // Over, without a verdict: no diligence, no pass, and the fund will see you again.
      m.left = true;
      p.status = 'passed';
      p.reason = 'You left the meeting before the ask.';
      return { pitchId: p.id, status: p.status, left: true };
    }
    case 'open': {
      ensure(!m.opener, 'pitch.meet.order', 'You’ve already opened.');
      const o = m.openers.find((x) => x === cmd.option);
      ensure(o, 'pitch.meet.option', 'That isn’t one of the options.');
      m.opener = o;
      break;
    }
    case 'answer': {
      ensure(m.opener, 'pitch.meet.order', 'Open first.');
      const q = m.questions.find((x) => !x.answer);
      ensure(q && q.id === cmd.questionId, 'pitch.meet.order', 'Answer the question he asked.');
      const a = q!.options.find((x) => x === cmd.option);
      ensure(a, 'pitch.meet.option', 'That isn’t one of the options.');
      q!.answer = a;
      break;
    }
    case 'ask': {
      ensure(
        m.opener && m.questions.every((x) => x.answer),
        'pitch.meet.order',
        'Answer his questions first.',
      );
      const o = askOptions(p).find((x) => x.id === cmd.option);
      ensure(o, 'pitch.meet.option', 'That isn’t one of the options.');
      m.ask = { option: o!.id, amount: o!.amount, preMoney: o!.preMoney };
      recordClaims(p);
      decide(world, p, me);
      return { pitchId: p.id, status: p.status, reason: p.reason, dealId: p.dealId };
    }
  }
  return { pitchId: p.id, interest: interestOf(m) };
}

/**
 * The claims made, as the questions form kept them (claim vs truth), so a
 * player investor's diligence (dealcraft.ts) checks what you said.
 */
function recordClaims(p: Pitch) {
  const m = p.meeting!;
  const f = m.facts;
  const runway = f.runway === null ? 120 : Math.round(f.runway);
  const truths: Partial<Record<PitchMeetingQuestion, [string, number, number]>> = {
    traction: ['How many paying customers do you have today?', f.customers, stretchCustomers(f)],
    runway: ['How many months will your company’s money last?', runway, runway + 9],
  };
  for (const q of m.questions) {
    const t = truths[q.id];
    if (!t || !q.answer || q.answer === 'vague') continue;
    p.questions.push({
      id: q.id,
      text: t[0],
      options: [
        { id: 'true', label: String(t[1]), claim: t[1], truth: t[1], tone: 'honest' },
        { id: 'stretch', label: String(t[2]), claim: t[2], truth: t[1], tone: 'spin' },
      ],
    });
    p.answers[q.id] = q.answer;
  }
}

/** The stretch on customers: "about ten are about to sign", or 60% more than you have. */
export const stretchCustomers = (f: PitchMeetingFacts) =>
  f.customers === 0 ? 10 : Math.max(f.customers + 5, Math.round(f.customers * 1.6));

function termSheetMove(world: World, me: Player, p: Pitch, action: 'accept' | 'counter' | 'walk') {
  const m = p.meeting!;
  const r = m.result;
  const d = p.dealId ? world.deals[p.dealId] : undefined;
  ensure(r && d && d.terms.kind === 'investment', 'pitch.state', 'There’s no term sheet yet.');
  ensure(
    d!.status === 'open' && d!.awaiting.kind === 'company' && d!.awaiting.id === p.companyId,
    'pitch.state',
    'This term sheet isn’t waiting on you.',
  );
  ensure(!r!.closed, 'pitch.state', 'You’ve already answered this term sheet.');
  const t = d!.terms as InvestmentTerms;
  if (action === 'accept') {
    actOnDeal(world, d!.id, company(p), me.id, { action: 'accept' });
    r!.closed = 'accepted';
  } else if (action === 'walk') {
    actOnDeal(world, d!.id, company(p), me.id, { action: 'decline' });
    r!.closed = 'walked';
    p.reason = 'You walked away from the term sheet.';
  } else {
    ensure(!r!.counter, 'pitch.meet.counter', 'You can counter once in a meeting.');
    const pre = counterPre(p, preOf(t));
    actOnDeal(world, d!.id, company(p), me.id, {
      action: 'counter',
      terms: { valuation: cardValuation(t.instrument === 'priced', pre, t.amount) },
    });
    const after = world.deals[d!.id]!;
    r!.counter = {
      preMoney: pre,
      reply:
        after.status === 'accepted' || after.pendingVoteId
          ? 'agreed'
          : after.status !== 'open'
            ? 'walked'
            : after.awaiting.kind === 'company'
              ? 'met'
              : 'waiting',
    };
    if (r!.counter.reply === 'agreed') r!.closed = 'accepted';
  }
  return { pitchId: p.id, dealId: d!.id, status: world.deals[d!.id]!.status };
}

/** A player investor answers a pitch made to them: accept the ask, counter it, or pass. */
export function pitchReply(
  world: World,
  me: Player,
  cmd: {
    pitchId: Id;
    action: 'accept' | 'counter' | 'decline';
    amount?: number;
    preMoney?: number;
    reason?: PassReason;
  },
) {
  const p = world.pitches[cmd.pitchId];
  ensure(p && p.investorPlayerId === me.id && p.meeting, 'pitch.missing', 'Pitch not found.');
  ensure(p.status === 'sent', 'pitch.state', 'You’ve already answered this pitch.');
  const m = p.meeting!;
  const c = getCompany(world, p.companyId);
  const month = getMarket(world, c.market).month;
  if (cmd.action === 'decline') {
    const reason = cmd.reason ?? 'timing';
    p.status = 'passed';
    p.passReason = reason;
    p.reason = `${me.name}: “Thank you. We’re passing for now: ${PASS_NOTE[reason]}.”`;
    m.reply = { action: 'decline' };
    notify(world, p.founderId, {
      month,
      kind: 'pitch',
      text: p.reason,
      ref: { kind: 'company', id: c.id },
    });
    return { pitchId: p.id, status: p.status };
  }
  const amount = cmd.action === 'counter' ? (cmd.amount ?? m.ask!.amount) : m.ask!.amount;
  const pre = cmd.action === 'counter' ? (cmd.preMoney ?? m.ask!.preMoney) : m.ask!.preMoney;
  ensure(amount > 0 && pre > 0, 'deal.terms', 'Name an amount and a valuation.');
  const isPriced = priced(c, nextStage(c.lastRound));
  const deal = proposeInvestment(world, {
    investorId: me.id,
    companyId: c.id,
    terms: {
      instrument: isPriced ? 'priced' : 'safe',
      amount,
      valuation: cardValuation(isPriced, pre, amount),
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
    },
  });
  m.reply = { action: cmd.action, amount, preMoney: pre };
  // The term sheet is the meeting's result now: the founder answers it there.
  if (m.result) {
    m.result.outcome = 'term-sheet';
    m.result.offerPre = pre;
  }
  notify(world, p.founderId, {
    month,
    kind: 'pitch',
    text:
      cmd.action === 'accept'
        ? `${me.name} accepted your ask for ${c.name}. The term sheet is in your pitch.`
        : `${me.name} came back with a counter for ${c.name}. The term sheet is in your pitch.`,
    ref: { kind: 'deal', id: deal.id },
  });
  return { pitchId: p.id, dealId: deal.id, status: p.status };
}

// ---------------------------------------------------------------- View

/** The meeting for the client: the founder sees the tags; the investor sees what was said. */
export function meetingView(world: World, p: Pitch, viewerId: Id) {
  const m = p.meeting;
  if (!m) return null;
  const c = world.companies[p.companyId];
  if (!c) return null;
  const founder = viewerId === p.founderId;
  const fund = p.fundId ? world.funds[p.fundId] : undefined;
  const inv = p.investorPlayerId ? world.players[p.investorPlayerId] : undefined;
  const stage = nextStage(c.lastRound);
  const next = m.questions.find((q) => !q.answer);
  const step =
    p.status === 'meeting' ? (!m.opener ? 'open' : next ? 'questions' : 'ask') : 'result';
  const moved = meetingMoved(m);
  const deal = p.dealId ? world.deals[p.dealId] : undefined;
  const terms = deal?.terms.kind === 'investment' ? deal.terms : undefined;
  const offer = terms ? preOf(terms) : null;
  const backed = fund
    ? new Set(
        Object.values(world.positions)
          .filter(
            (x) =>
              x.investorId === fund.id && world.companies[x.companyId]?.industry === c.industry,
          )
          .map((x) => x.companyId),
      ).size
    : 0;
  const awaitingMe =
    !!deal &&
    deal.status === 'open' &&
    deal.awaiting.kind === 'company' &&
    deal.awaiting.id === c.id;
  return {
    investor: {
      kind: m.investor,
      name: fund?.partner ?? inv?.name ?? '',
      firm: fund?.name ?? null,
      portraitId: fund ? `fund:${fund.id}` : (inv?.id ?? ''),
      playerId: inv?.id ?? null,
      check: fund
        ? (fund.check.map((v) =>
            valueIn(
              world,
              v,
              getMarket(world, fund.market).data.currency,
              getMarket(world, c.market).data.currency,
            ),
          ) as [number, number])
        : null,
      sectors: fund?.sectors ?? null,
      backed,
    },
    minutes: MEETING.minutes,
    slides: p.slides,
    step,
    cares: caresFor(stage),
    facts: founder || p.status !== 'meeting' ? m.facts : null,
    openers: m.openers.map((id) => ({ id, notes: id === 'story' })),
    opener: m.opener ? { id: m.opener, points: openerPoints(m.facts, m.opener) } : null,
    questions: m.questions.map((q) => ({
      id: q.id,
      cofounder: !!q.cofounder,
      basis: answerBasis(m.facts, q.id),
      stretchCustomers: stretchCustomers(m.facts),
      options: q.options.map((o) => ({
        id: o,
        // The founder sees which answers are true and which he'll check; the investor sees only what was said.
        tag: founder ? (o === 'true' ? 'true' : o === 'stretch' ? 'check' : null) : null,
      })),
      answer: q.answer
        ? {
            id: q.answer,
            points: founder ? answerPoints(m.facts, q.id, q.answer) : null,
            // What the investor finds checking it against the numbers the pitch shared.
            checked: q.answer === 'true' ? 'matches' : q.answer === 'stretch' ? 'off' : 'dodged',
          }
        : null,
      asked: q === next || !!q.answer,
    })),
    band: m.band,
    askOptions: askOptions(p).map((o) => ({ ...o, where: askWhere(m.band, o.preMoney) })),
    ask: m.ask ? { ...m.ask, where: askWhere(m.band, m.ask.preMoney) } : null,
    interest:
      founder && m.investor === 'fund' ? (m.result?.interest ?? interestOf(m, moved)) : null,
    /** Interest before the last turn, for "your opener lifted it from 40%". */
    interestBefore: founder && m.investor === 'fund' ? interestBefore(m, moved) : null,
    cofounder: m.cofounder,
    /** Round 7: who introduced you to this investor, and what it added. */
    intro: m.intro ?? null,
    start: founder ? m.start : [],
    result: m.result
      ? {
          score: m.result.score,
          interest: m.investor === 'fund' ? m.result.interest : null,
          moved: founder ? m.result.moved : [],
          outcome: m.result.outcome,
          caught: m.result.caught,
          closed: m.result.closed ?? null,
          counter: m.result.counter ?? null,
          terms:
            terms && offer !== null
              ? {
                  amount: terms.amount,
                  preMoney: offer,
                  pct: Math.round((terms.amount / (offer + terms.amount)) * 1000) / 10,
                  instrument: terms.instrument,
                  askedPre: m.ask?.preMoney ?? null,
                  dealStatus: deal!.status,
                  awaitingYou: awaitingMe,
                }
              : null,
          canCounter: founder && awaitingMe && !m.result.counter && !m.result.closed,
          counterTo: offer !== null ? counterPre(p, offer) : null,
          reply: m.reply ?? null,
        }
      : null,
    /** You left before the ask. */
    left: !!m.left,
    /** A player investor can answer a pitch sent to them. */
    canReply: viewerId === p.investorPlayerId && p.status === 'sent',
  };
}

/** Interest before your latest move (opener, answer or ask): null before the first. */
function interestBefore(m: PitchMeeting, moved: PitchMoved[]): number | null {
  const mine = (x: PitchMoved) => /^(opener|answer|ask):/.test(x.id);
  const last = moved.map(mine).lastIndexOf(true);
  if (last < 0) return null;
  return interestOf(
    m,
    moved
      .slice(0, last)
      .concat(moved.slice(last + 1))
      .filter((x) => !x.id.startsWith('caught:')),
  );
}

export type PitchMeetingView = NonNullable<ReturnType<typeof meetingView>>;
