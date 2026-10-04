/**
 * Fundraising (§9). Founders build a deck of up to five slides from real game
 * data: they choose the story and emphasis but can't invent numbers. AI
 * partners ask a few short questions and respond according to their fund's
 * thesis, stage, recent results and mood. Claims made in answers are checked
 * in due diligence.
 */
import { ensure, fail } from './errors.js';
import {
  adjustTrust,
  col,
  getCompany,
  getFund,
  getMarket,
  getPlayer,
  lastPnl,
  localToUsdMajor,
  nextStage,
  notify,
  totalCustomers,
} from './helpers.js';
import { newId } from './ids.js';
import { clamp, clamp01, logistic } from './math.js';
import { formatMoney } from './money.js';
import { deriveRng } from './rng.js';
import { starMultiplier } from './stars.js';
import { aiRespond, openDeal } from './deals.js';
import { monthlyGrowth, valueCompany } from './valuation.js';
import { rulesFor } from './data/rules.js';
import { INCORPORATION } from './world.js';
import { companyRunway } from './company.js';
import type {
  Company,
  Fund,
  Id,
  InvestmentTerms,
  Pitch,
  PitchQuestion,
  Stage,
  World,
} from './types.js';

export const SLIDES = [
  'problem',
  'product',
  'traction',
  'team',
  'market',
  'financials',
  'vision',
  'ask',
] as const;
export type Slide = (typeof SLIDES)[number];
export const MAX_SLIDES = 5;
export const PITCH_HOURS = 8;
export const PARTNER_MEETING_HOURS = 6;

/** Rounds at or above this USD size, or Series A+, need a partner meeting. */
const PARTNER_MEETING_USD = 1_000_000;

function strengths(world: World, c: Company): Record<Slide, number> {
  const m = getMarket(world, c.market);
  const pnl = lastPnl(c);
  const growth = monthlyGrowth(c);
  const segBuyers = c.targetSegments.reduce(
    (a, k) => a + (m.segments[k]?.buyers ?? 0) * (m.segments[k]?.budget ?? 0),
    0,
  );
  return {
    problem: clamp01(
      0.3 + Object.values(c.product.discovery).reduce((a, b) => Math.max(a, b), 0) * 0.7,
    ),
    product: clamp01(c.product.fit * 0.7 + c.product.quality * 0.3),
    // Growth only counts once there is real revenue behind it (growth from ₦0 to ₦1 is not traction).
    traction: clamp01(
      Math.min(growth, 0.3) * 1.5 * Math.min(1, (pnl?.revenue ?? 0) / Math.max(1, col(m) * 5)) +
        Math.min(totalCustomers(c), 2000) / 4000,
    ),
    team: clamp01(
      0.2 +
        c.staff.filter((s) => s.seniority === 'senior' || s.seniority === 'head').length * 0.12 +
        c.founderIds.length * 0.1,
    ),
    market: clamp01(Math.log10(Math.max(10, segBuyers / 100)) / 10),
    financials: clamp01(
      pnl ? 0.5 + (pnl.net / Math.max(1, pnl.revenue + Math.abs(pnl.net))) * 0.5 : 0.3,
    ),
    vision: 0.5,
    ask: 0.5,
  };
}

/** Generate the AI partner's questions from the company's weak spots. */
function buildQuestions(world: World, c: Company): PitchQuestion[] {
  const m = getMarket(world, c.market);
  const cur = m.data.currency;
  const customers = totalCustomers(c);
  const pnl = lastPnl(c);
  const revenue = pnl?.revenue ?? 0;
  const runway = companyRunway(world, c);
  const qs: PitchQuestion[] = [
    {
      id: 'traction',
      text: 'How many paying customers do you have today?',
      options: [
        {
          id: 'honest',
          label: `${customers.toLocaleString('en-GB')}, and growing`,
          claim: customers,
          truth: customers,
          tone: 'honest',
        },
        {
          id: 'spin',
          label: `About ${Math.max(10, Math.round(customers * 1.6)).toLocaleString('en-GB')}`,
          claim: Math.max(10, Math.round(customers * 1.6)),
          truth: customers,
          tone: 'spin',
        },
        { id: 'vague', label: 'We’re focused on product right now', tone: 'vague' },
      ],
    },
    {
      id: 'revenue',
      text: 'What was revenue last month?',
      options: [
        {
          id: 'honest',
          label: formatMoney(revenue, cur),
          claim: revenue,
          truth: revenue,
          tone: 'honest',
        },
        {
          id: 'spin',
          label: formatMoney(Math.max(revenue * 2, 100_00), cur),
          claim: Math.max(revenue * 2, 100_00),
          truth: revenue,
          tone: 'spin',
        },
        { id: 'vague', label: 'It’s early, but the pipeline is strong', tone: 'vague' },
      ],
    },
    {
      id: 'runway',
      text: 'How many months of runway do you have?',
      options: [
        {
          id: 'honest',
          label: `${Math.round(runway)} months`,
          claim: Math.round(runway),
          truth: Math.round(runway),
          tone: 'honest',
        },
        {
          id: 'spin',
          label: `${Math.round(runway) + 9} months`,
          claim: Math.round(runway) + 9,
          truth: Math.round(runway),
          tone: 'spin',
        },
        { id: 'vague', label: 'Enough to hit our next milestones', tone: 'vague' },
      ],
    },
  ];
  if (c.keyPersonLossMonth !== null && m.month - c.keyPersonLossMonth < 4) {
    qs.push({
      id: 'team',
      text: 'We heard a senior person left. What happened?',
      options: [
        { id: 'honest', label: 'Wrong fit. We’re hiring a stronger replacement.', tone: 'honest' },
        { id: 'vague', label: 'Normal turnover', tone: 'vague' },
      ],
    });
  }
  return qs.slice(0, 3);
}

export function startPitch(
  world: World,
  args: {
    founderId: Id;
    companyId: Id;
    fundId?: Id;
    investorPlayerId?: Id;
    slides: string[];
    ask: number;
  },
): Pitch {
  const c = getCompany(world, args.companyId);
  const m = getMarket(world, c.market);
  ensure(
    args.slides.length >= 1 && args.slides.length <= MAX_SLIDES,
    'pitch.slides',
    `Pick 1–${MAX_SLIDES} slides.`,
  );
  ensure(
    new Set(args.slides).size === args.slides.length &&
      args.slides.every((s) => (SLIDES as readonly string[]).includes(s)),
    'pitch.slides',
    'Unknown or repeated slide.',
  );
  const open = Object.values(world.pitches).some(
    (p) =>
      p.companyId === c.id &&
      (p.fundId ?? p.investorPlayerId) === (args.fundId ?? args.investorPlayerId) &&
      (p.status === 'questions' || p.status === 'partner-meeting' || p.status === 'sent'),
  );
  ensure(!open, 'pitch.open', 'You already have an open pitch with them.');

  const pitch: Pitch = {
    id: newId(world, 'pitch'),
    companyId: c.id,
    founderId: args.founderId,
    fundId: args.fundId ?? null,
    investorPlayerId: args.investorPlayerId ?? null,
    slides: args.slides,
    status: 'questions',
    questions: [],
    answers: {},
    reason: '',
    month: m.month,
    dealId: null,
    ask: args.ask,
  };
  ensure(args.ask > 0, 'pitch.ask', 'Say how much you are raising.');

  if (args.fundId) {
    const fund = getFund(world, args.fundId);
    ensure(
      fund.market === c.market,
      'pitch.market',
      'Pitch funds in your own market (cross-market comes with travel).',
    );
    const stage = nextStage(c.lastRound);
    const recentPass = Object.values(world.pitches).find(
      (p) =>
        p.companyId === c.id &&
        p.fundId === fund.id &&
        p.status === 'passed' &&
        m.month - p.month < 3,
    );
    if (recentPass)
      fail('pitch.cooldown', `${fund.name} passed recently. Try again in a few months.`);
    if (fund.sectors !== 'any' && !fund.sectors.includes(c.industry)) {
      pitch.status = 'passed';
      pitch.reason = `${fund.partner}: “Not our sector. We only do ${fund.sectors.join(', ')}.”`;
    } else if (!fund.stages.includes(stage)) {
      pitch.status = 'passed';
      pitch.reason = `${fund.partner}: “You’re raising ${stage}; we do ${fund.stages.join(', ')}.”`;
    } else if (
      Math.max(c.stars.value, getPlayer(world, args.founderId).stars.value) < fund.minStars
    ) {
      pitch.status = 'passed';
      pitch.reason = `${fund.partner}: “Come back when you have more of a track record.”`;
    } else {
      pitch.questions = buildQuestions(world, c);
    }
  } else if (args.investorPlayerId) {
    const inv = getPlayer(world, args.investorPlayerId);
    ensure(inv.role === 'investor' && !inv.ai, 'pitch.investor', 'That player isn’t an investor.');
    ensure(inv.market === c.market, 'pitch.market', 'Pitch investors in your own market.');
    pitch.status = 'sent';
    // Pitching a human investor shares the deck's public-level data and grants diligence depth 1.
    inv.diligence[c.id] = Math.max(inv.diligence[c.id] ?? 0, 1);
    notify(world, inv.id, {
      month: m.month,
      kind: 'pitch',
      text: `${c.name} pitched you (${args.slides.join(', ')}).`,
      ref: { kind: 'company', id: c.id },
    });
  } else {
    fail('pitch.target', 'Choose a fund or an investor.');
  }
  world.pitches[pitch.id] = pitch;
  return pitch;
}

/** Score 0–1 of how much an AI fund likes the company, before honesty checks. */
export function fundScore(world: World, fund: Fund, c: Company, slides: string[]): number {
  const m = getMarket(world, c.market);
  const s = strengths(world, c);
  const founder = world.players[c.founderIds[0]!];
  // Emphasis: slides that show real strengths help; showing weaknesses hurts.
  const deck = slides.reduce((a, sl) => a + ((s[sl as Slide] ?? 0.5) - 0.45) * 0.12, 0);
  const pnl = lastPnl(c);
  const gaps = rulesFor(c.market, c.industry).filter((r) => !c.compliance[r.id]).length;
  const keyLoss = c.keyPersonLossMonth !== null && m.month - c.keyPersonLossMonth < 4 ? 0.06 : 0;
  const tooManyPivots = Math.max(0, c.pivots - 1) * 0.05;
  return clamp01(
    0.25 +
      s.product * 0.2 +
      s.traction * 0.25 +
      s.team * 0.1 +
      (starMultiplier(c.stars.value) - 1) * 0.15 +
      (starMultiplier(founder?.stars.value ?? 1) - 1) * 0.1 +
      (founder?.skills.fundraising ?? 20) / 1000 +
      deck +
      INCORPORATION[c.incorporation].investorAppeal +
      (pnl && pnl.revenue > 0 ? 0.05 : 0) +
      (fund.mood - 1) * 0.15 +
      (m.climate - 1) * 0.2 -
      gaps * 0.015 -
      keyLoss -
      tooManyPivots +
      // Relationship capital (§13): a fund that backed you before remembers how it went.
      (founder?.trust[fund.id] ?? 0) * 0.1,
  );
}

const PASS_REASONS = [
  'Too early for us. Come back with more traction.',
  'We don’t see how this gets big enough.',
  'Retention worries us. Show us customers stay.',
  'We just lost money in this sector; we’re cautious.',
  'Great team, but the market is crowded.',
];

/** Founder answers the partner's questions; the fund decides (or asks for a partner meeting). */
export function answerPitch(
  world: World,
  pitchId: Id,
  founderId: Id,
  answers: Record<string, string>,
): Pitch {
  const p = world.pitches[pitchId];
  ensure(p && p.founderId === founderId, 'pitch.missing', 'Pitch not found.');
  ensure(p.status === 'questions', 'pitch.state', 'This pitch is not waiting for answers.');
  ensure(p.fundId, 'pitch.state', 'Only AI funds ask questions.');
  for (const q of p.questions)
    ensure(
      q.options.some((o) => o.id === answers[q.id]),
      'pitch.answers',
      'Answer every question.',
    );
  p.answers = answers;
  const c = getCompany(world, p.companyId);
  const fund = getFund(world, p.fundId);
  const m = getMarket(world, c.market);
  const rng = deriveRng(world.seed, 'pitch', p.id);

  // Due diligence on claims: spin is usually caught. Depth grows with the round.
  let caught = false;
  let honesty = 0;
  for (const q of p.questions) {
    const o = q.options.find((x) => x.id === answers[q.id])!;
    if (o.tone === 'honest') honesty += 0.02;
    if (o.tone === 'vague') honesty -= 0.025;
    if (o.tone === 'spin' && o.claim !== undefined && o.truth !== undefined) {
      const off = Math.abs(o.claim - o.truth) / Math.max(1, Math.abs(o.truth));
      if (off > 0.1 && rng.chance(0.75)) caught = true;
      else honesty += 0.03;
    }
  }
  if (caught) {
    p.status = 'passed';
    p.reason = `${fund.partner}: “Your numbers didn’t match what we found in diligence.”`;
    fund.mood = clamp(fund.mood - 0.02, 0.5, 1.5);
    adjustTrust(getPlayer(world, founderId), fund.id, -0.5);
    return p;
  }

  const score = fundScore(world, fund, c, p.slides) + honesty;
  const stage = nextStage(c.lastRound);
  const big =
    localToUsdMajor(world, m, p.ask) >= PARTNER_MEETING_USD ||
    stage === 'series-a' ||
    stage === 'series-b' ||
    stage === 'series-c';
  const passP = 1 - logistic((score - 0.55) / 0.06);
  if (rng.chance(passP)) {
    p.status = 'passed';
    p.reason = `${fund.partner}: “${rng.pick(PASS_REASONS)}”`;
    return p;
  }
  if (big) {
    p.status = 'partner-meeting';
    p.reason = `${fund.partner}: “I’d like you to meet my partners.”`;
    return p;
  }
  offerTermSheet(world, p, fund, c, score);
  return p;
}

export function partnerMeeting(world: World, pitchId: Id, founderId: Id): Pitch {
  const p = world.pitches[pitchId];
  ensure(
    p && p.founderId === founderId && p.status === 'partner-meeting' && p.fundId,
    'pitch.state',
    'No partner meeting pending.',
  );
  const c = getCompany(world, p.companyId);
  const fund = getFund(world, p.fundId);
  const rng = deriveRng(world.seed, 'partners', p.id);
  const score = fundScore(world, fund, c, p.slides) + rng.normal(0, 0.05);
  if (rng.chance(1 - logistic((score - 0.52) / 0.06))) {
    p.status = 'passed';
    p.reason = `${fund.partner}: “The partnership didn’t get there this time.”`;
    return p;
  }
  offerTermSheet(world, p, fund, c, score);
  return p;
}

function offerTermSheet(world: World, p: Pitch, fund: Fund, c: Company, score: number) {
  const askAmount = p.ask;
  const rng = deriveRng(world.seed, 'termsheet', p.id);
  const stage: Stage = nextStage(c.lastRound);
  const val = valueCompany(world, c, stage).value;
  const valuation = Math.round(val * fund.mood * rng.range(0.85, 1.05) * (0.9 + score * 0.2));
  const amount = clamp(askAmount, fund.check[0], fund.check[1]);
  const priced =
    stage === 'series-a' ||
    stage === 'series-b' ||
    stage === 'series-c' ||
    c.capTable.roundsRaised > 0;
  const terms: InvestmentTerms = {
    kind: 'investment',
    instrument: priced ? 'priced' : 'safe',
    stage,
    amount: Math.min(amount, Math.round(valuation * 0.35)),
    valuation: priced ? valuation : valuation + amount,
    liquidationMultiple: m1(fund.mood, score),
    participating: false,
    proRata: true,
    boardSeat: priced,
    vetoOnSale: priced && score < 0.55,
    poolTopUpBps: priced ? 1000 : 0,
  };
  const deal = openDeal(world, {
    companyId: c.id,
    proposer: { kind: 'fund', id: fund.id },
    counterparty: { kind: 'company', id: c.id },
    terms,
    by: fund.id,
    aiLimit: {
      maxValuation: Math.round(terms.valuation * (1.1 + score * 0.15)),
      maxAmount: fund.check[1],
    },
  });
  p.status = 'term-sheet';
  p.dealId = deal.id;
  p.reason = `${fund.partner}: “We’d like to invest. Term sheet attached.”`;
}

/** Hot funds in a weak market ask for more protection: 1x normally, 1.5x when the deal is marginal. */
const m1 = (mood: number, score: number) => (score < 0.5 && mood < 0.9 ? 1.5 : 1);

/** Investor player proposes terms to a company (from a pitch, or cold). */
export function proposeInvestment(
  world: World,
  args: {
    investorId: Id;
    companyId: Id;
    terms: Omit<
      InvestmentTerms,
      'kind' | 'stage' | 'liquidationMultiple' | 'participating' | 'poolTopUpBps'
    > & { fromFund?: boolean };
  },
) {
  const inv = getPlayer(world, args.investorId);
  const c = getCompany(world, args.companyId);
  ensure(
    inv.role === 'investor' || inv.companyIds.length > 0,
    'invest.role',
    'Only investors and founders can invest.',
  );
  ensure(!c.founderIds.includes(inv.id), 'invest.self', 'You can’t invest in your own company.');
  ensure(
    inv.market === c.market,
    'invest.market',
    'Cross-market investing needs travel first (phase 2).',
  );
  ensure(c.status === 'active', 'company.closed', 'Company is not operating.');
  const stage = nextStage(c.lastRound);
  const priced = args.terms.instrument === 'priced';
  const terms: InvestmentTerms = {
    kind: 'investment',
    instrument: args.terms.instrument,
    stage,
    amount: args.terms.amount,
    valuation: args.terms.valuation,
    liquidationMultiple: 1,
    participating: false,
    proRata: args.terms.proRata,
    boardSeat: priced && args.terms.boardSeat,
    vetoOnSale: priced && args.terms.vetoOnSale,
    poolTopUpBps: priced ? 1000 : 0,
  };
  ensure(
    terms.amount > 0 && terms.valuation > terms.amount * 1.5,
    'deal.terms',
    'Valuation must be well above the amount.',
  );
  const proposer =
    args.terms.fromFund && inv.investor?.fundId
      ? { kind: 'fund' as const, id: inv.investor.fundId }
      : { kind: 'player' as const, id: inv.id };
  const model = valueCompany(world, c, stage).value;
  const deal = openDeal(world, {
    companyId: c.id,
    proposer,
    counterparty: { kind: 'company', id: c.id },
    terms,
    by: inv.id,
    aiLimit: { minValuation: Math.round(model * 0.85), maxAmount: Math.round(model * 0.3) },
  });
  // AI founders answer straight away: accept, meet once, or walk.
  if (c.ai) {
    aiRespond(world, deal);
    return deal;
  }
  const pitch = Object.values(world.pitches).find(
    (p) => p.companyId === c.id && p.investorPlayerId === inv.id && p.status === 'sent',
  );
  if (pitch) {
    pitch.status = 'term-sheet';
    pitch.dealId = deal.id;
  }
  return deal;
}

/** Diligence depth costs hours (§7): 1 = revenue, customers, burn; 2 = retention, concentration, legal, conflicts. */
export const DILIGENCE_HOURS = { 1: 4, 2: 10 } as const;
