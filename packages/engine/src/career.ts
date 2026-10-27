/**
 * The investor career (investor blueprint §2–3, Phase 1).
 *
 *  - The ladder: eight rungs from angel to institution leader. The climb
 *    (rungs 1–6) is one rung at a time; allocator (7) and institution (8)
 *    open on their own conditions. Each rung is recorded once, with a
 *    milestone and a note, and the next rung always shows what it takes.
 *  - Invitations: crossing into rung 2 brings an AI angel's co-lead offer,
 *    rung 3 an LP's anchor commitment for Fund I.
 *  - The angel ceiling: a personal cheque is capped at a share of liquid
 *    net worth, and Series A and later rounds need a fund or syndicate lead.
 *  - The first session: profile → investable money → a café shortlist →
 *    a first call → a small SAFE → the portfolio → the ladder, with a
 *    capped tutorial cheque and a recovery when a founder says no.
 *
 * Everything here is switched on by the investor release note (investorOn):
 * worlds without it play exactly as before. The ladder only reads state; it
 * never moves money (§12.1).
 */
import { activeAngels } from './angels.js';
import { lpsOf } from './programs.js';
import { INVESTOR, RUNGS } from './data/investor.js';
import { ensure } from './errors.js';
import { contactWarmth } from './events.js';
import { angelRecord, lpPanelScore, trackRecord } from './funds.js';
import { achieve, getMarket, hoursLeft, locationOf, notify, usdToLocal } from './helpers.js';
import type { JourneyGo } from './journey.js';
import { costIn, valueIn } from './ledger.js';
import { roundTo } from './math.js';
import { formatMoney } from './money.js';
import { lifestyleCost } from './personal.js';
import { feedbackOn, investorOn } from './releases.js';
import { companyRunway } from './company.js';
import type {
  CareerInvitation,
  Company,
  Fund,
  Id,
  InvestorCareer,
  InvestorTutorialStep,
  Player,
  Stage,
  World,
} from './types.js';
import { INVESTOR_TUTORIAL_STEPS } from './types.js';
import { valueCompany } from './valuation.js';
import { wealthView } from './wealth.js';
import { nextStage } from './helpers.js';

/** Invitations stay open this many months. */
const INVITATION_MONTHS = 3;

/** Investors and anyone who has invested from an investor profile get a career. */
export const hasCareer = (p: Player): boolean => !p.ai && (p.role === 'investor' || !!p.investor);

function careerOf(p: Player): InvestorCareer {
  return (p.career ??= { reached: {}, invitations: [] });
}

const homeMonth = (world: World, p: Player) => getMarket(world, p.market).month;

// ---------------------------------------------------------------- money you can invest

/** A month of your living costs, home minor units. */
export const monthOfLiving = (world: World, p: Player) => lifestyleCost(world, p);

/**
 * Investable money (§3, §8.8): personal cash less a reserve of living costs.
 * "Never invest the rent."
 */
function investable(world: World, p: Player): number {
  const liquid = wealthView(world, p).liquid;
  return Math.max(0, liquid - INVESTOR.caps.reserveMonths * monthOfLiving(world, p));
}

/** Liquid net worth for the angel cap: cash plus listed shares you can sell today. */
function liquidNetWorth(world: World, p: Player): number {
  const w = wealthView(world, p);
  return Math.max(0, w.liquid + w.shares.sellable);
}

/** The largest personal cheque, home minor units (§2.3). */
function angelCap(world: World, p: Player): number {
  const cap = Math.floor(liquidNetWorth(world, p) * INVESTOR.caps.angelCheque);
  const t = p.career?.tutorial;
  if (t && !t.doneMonth && !t.skipped)
    return Math.min(cap, Math.floor(investable(world, p) * INVESTOR.caps.tutorialCheque));
  return cap;
}

const needsLead = (stage: Stage) => INVESTOR.caps.leadStages.includes(stage);

/**
 * The cap on any personal cheque (an angel deal, a syndicate allocation),
 * `amount` in `currency`; investor-career worlds only.
 */
export function checkPersonalCap(world: World, p: Player, currency: string, amount: number) {
  if (!investorOn(world) || p.ai) return;
  const home = getMarket(world, p.market);
  const cost = costIn(world, amount, currency as never, home.data.currency);
  const cap = angelCap(world, p);
  const t = p.career?.tutorial;
  const firstSession = !!t && !t.doneMonth && !t.skipped;
  if (!firstSession && !INVESTOR.caps.angelCeiling) return;
  ensure(
    cost <= cap,
    'invest.cap',
    firstSession
      ? `Your first cheque is capped at ${formatMoney(cap, home.data.currency)} (a tenth of what you can invest), so one deal can’t sink you.`
      : `One angel cheque is capped at ${formatMoney(cap, home.data.currency)}, a tenth of your liquid net worth. Bigger cheques need a syndicate or a fund.`,
  );
}

/**
 * The angel ceiling, checked on every personal cheque in investor-career
 * worlds: at most a share of liquid net worth (less in the first session),
 * and no lone angel cheque into a Series A or later round.
 */
export function checkAngelCheque(
  world: World,
  p: Player,
  c: Company,
  amount: number,
  stage: Stage,
) {
  if (!investorOn(world) || p.ai) return;
  const m = getMarket(world, c.market);
  ensure(
    !INVESTOR.caps.angelCeiling || !needsLead(stage),
    'invest.lead',
    `${c.name} is raising a ${stage.replace('-', ' ')} round: it needs a lead. Lead a syndicate or invest from your fund.`,
  );
  checkPersonalCap(world, p, m.data.currency, amount);
}

// ---------------------------------------------------------------- the ladder

export interface RungRequirement {
  id: string;
  label: string;
  have: number;
  need: number;
  done: boolean;
  /** Amounts in minor units of this currency. */
  currency?: string;
}

/** Funds this player runs (Fund I, Fund II, strategy funds…). */
export const managedFunds = (world: World, p: Player): Fund[] =>
  Object.values(world.funds).filter(
    (f) => f.managerId === p.id && !f.ai && f.lp?.stage !== 'raising' && f.lp?.stage !== 'failed',
  );

const fundDpi = (world: World, f: Fund) => {
  const paid = paidIn(world, f);
  return paid > 0 ? f.distributed / paid : 0;
};

/** What LPs have paid into a fund so far (the whole size when AI LPs paid at once). */
function paidIn(_world: World, f: Fund): number {
  const lp = f.lp;
  return lp ? lp.paidIn : f.size;
}

/** LPs who said they would re-up into the next fund (Phase 5 LP relations). */
const reupIntents = (f: Fund): number =>
  Object.values(f.lp?.relations ?? {}).filter((r) => r.reup).length;

/** People hired by the player's firm (Phase 6). */
const firmHires = (world: World, p: Player): number => {
  const firm = Object.values(world.firms ?? {}).find((x) => x.ownerId === p.id);
  return firm ? firm.members.filter((m) => m.status === 'active').length : 0;
};

/** Each rung's requirements, as progress bars (§5.3 "Career ladder"). */
export function rungRequirements(world: World, p: Player, n: number): RungRequirement[] {
  const L = INVESTOR.ladder;
  const req = (
    id: string,
    label: string,
    have: number,
    need: number,
    currency?: string,
  ): RungRequirement => ({
    id,
    label,
    have: roundTo(Math.min(have, need), 2),
    need,
    done: have >= need,
    ...(currency ? { currency } : {}),
  });
  const rec = angelRecord(world, p);
  const funds = managedFunds(world, p);
  const fund1 = funds.find((f) => f.id === p.investor?.fundId) ?? funds[0];
  const cur = getMarket(world, p.market).data.currency;
  switch (n) {
    case 1:
      return [req('profile', 'Be an investor', p.role === 'investor' || !!p.investor ? 1 : 0, 1)];
    case 2:
      return [
        req('deals', 'Angel deals', rec.deals, L.syndicateDeals),
        req('stars', 'Investor stars', p.stars.value, L.syndicateStars),
      ];
    case 3: {
      const thesis = p.investor ?? { sectors: [], stages: [] };
      const score = lpPanelScore(p, rec, thesis).score;
      return [
        req('deals', 'Deals (syndicates count)', rec.deals, L.fundDeals),
        req('lp-score', 'LP panel score', roundTo(score, 2), L.fundScore),
      ];
    }
    case 4:
      return [req('fund', 'Close Fund I', funds.length > 0 ? 1 : 0, 1)];
    case 5:
      return [
        req(
          'dpi',
          'Fund I cash returned (DPI)',
          fund1 ? roundTo(fundDpi(world, fund1), 2) : 0,
          L.fund2Dpi,
        ),
        req('reups', 'LPs who would re-up', fund1 ? reupIntents(fund1) : 0, L.fund2Reups),
      ];
    case 6:
      return [
        req('funds', 'Funds raised', funds.length, L.firmFunds),
        req('hires', 'Partners or associates hired', firmHires(world, p), L.firmHires),
      ];
    case 7: {
      const need = Math.round(L.allocatorMonths * monthOfLiving(world, p));
      const liquid = wealthView(world, p).liquid;
      const bestDpi = Math.max(0, ...funds.map((f) => fundDpi(world, f)));
      // Play-test (FEEDBACK_NOTE): savings alone aren't a career. A new angel whose
      // savings already cover 60 months started on rung 7; the wealth route now
      // needs a track record too (rung 2, leading a syndicate).
      const track = feedbackOn(world)
        ? [req('track', 'Lead a syndicate first', p.career?.reached[2] !== undefined ? 1 : 0, 1)]
        : [];
      // Either route opens the rung: show the closer one.
      return bestDpi >= L.allocatorDpi
        ? [req('dpi', 'A fund that returned 1×', roundTo(bestDpi, 2), L.allocatorDpi)]
        : [...track, req('liquid', 'Liquid wealth (60 months of living costs)', liquid, need, cur)];
    }
    case 8:
      return [req('role', 'A senior role at a DFI or bank', p.allocator?.career ? 1 : 0, 1)];
    default:
      return [];
  }
}

const met = (reqs: RungRequirement[]) => reqs.every((r) => r.done);

/** What each rung unlocks (§2.1, §5.2). */
const RUNG_UNLOCKS: Record<number, string> = {
  1: 'Angel cheques, deal flow, diligence and the stock market.',
  2: 'Lead syndicates: bring backers into your deals and earn deal-by-deal carry.',
  3: 'Raise Fund I from AI and player LPs.',
  4: 'A management fee every month, reserves, an investment committee and LP letters.',
  5: 'Raise Fund II and strategy funds on the cash you returned.',
  6: 'A firm: partners and associates, a carry pool and several funds at once.',
  7: 'Commit to other funds as an LP, a family office and a fund of funds.',
  8: 'Run an institution’s balance sheet: a senior salary and a mandate.',
};

/**
 * Record rungs newly reached (once each), expire old invitations and send
 * new ones. Called after each command of an investor and after settlement.
 */
export function recordCareer(world: World, p: Player) {
  if (!investorOn(world) || !hasCareer(p)) return;
  const month = homeMonth(world, p);
  const career = careerOf(p);
  for (const inv of career.invitations)
    if (inv.status === 'open' && month > inv.expiresMonth) inv.status = 'expired';
  if (career.reached[1] === undefined) career.reached[1] = month;
  // The climb is one rung at a time; rungs 7 and 8 open on their own.
  for (let n = 2; n <= 6; n++) {
    if (career.reached[n] !== undefined) continue;
    if (career.reached[n - 1] === undefined) break;
    if (!met(rungRequirements(world, p, n))) break;
    reach(world, p, n, month);
  }
  for (const n of [7, 8])
    if (career.reached[n] === undefined && met(rungRequirements(world, p, n)))
      reach(world, p, n, month);
}

function reach(world: World, p: Player, n: number, month: number) {
  const career = careerOf(p);
  career.reached[n] = month;
  const rung = RUNGS[n - 1]!;
  achieve(world, p, `investor.rung-${n}`, rung.title, month);
  notify(world, p.id, {
    month,
    kind: 'system',
    text: `Career: you’re now ${/^[aeiou]/i.test(rung.title) ? 'an' : 'a'} ${rung.title.toLowerCase()}. ${RUNG_UNLOCKS[n]}`,
  });
  invite(world, p, n, month);
}

/** A qualified investor is approached with a concrete offer (§2.3, §10.3). */
function invite(world: World, p: Player, n: number, month: number) {
  const m = getMarket(world, p.market);
  const career = careerOf(p);
  if (career.invitations.some((x) => x.rung === n)) return;
  let inv: CareerInvitation | null = null;
  if (n === 2) {
    const angel = activeAngels(world, p.market)[0];
    if (angel)
      inv = {
        id: `inv:${p.id}:2`,
        rung: 2,
        kind: 'co-lead',
        fromId: angel.id,
        fromName: angel.name,
        amount: 0,
        currency: m.data.currency,
        month,
        expiresMonth: month + INVITATION_MONTHS,
        status: 'open',
      };
  } else if (n === 3) {
    // A development or emerging-manager LP anchors first-time managers (§8.2).
    const lps = lpsOf(p.market);
    const lp = lps.find((x: { kind: string }) => x.kind === 'dfi-fof') ?? lps[0];
    if (lp)
      inv = {
        id: `inv:${p.id}:3`,
        rung: 3,
        kind: 'anchor',
        fromId: lp.id,
        fromName: lp.name,
        amount: usdToLocal(world, m, INVESTOR.fund.anchorUsd * (m.data.multipleDiscount / 0.9)),
        currency: m.data.currency,
        month,
        expiresMonth: month + INVITATION_MONTHS,
        status: 'open',
      };
  }
  if (!inv) return;
  career.invitations.push(inv);
  notify(world, p.id, {
    month,
    kind: 'deal',
    text:
      inv.kind === 'co-lead'
        ? `${inv.fromName} would like to co-lead your first syndicate: they’ll match your cheque. Answer in your career ladder.`
        : `${inv.fromName} offers to anchor your Fund I with ${formatMoney(inv.amount, inv.currency)}. Answer in your career ladder.`,
  });
}

/** `career.invitation`: accept or decline an offer to move up. */
export function answerInvitation(_world: World, me: Player, invitationId: Id, accept: boolean) {
  const career = careerOf(me);
  const inv = career.invitations.find((x) => x.id === invitationId);
  ensure(inv, 'career.invitation', 'Invitation not found.');
  ensure(inv.status === 'open', 'career.invitation', 'That offer has closed.');
  inv.status = accept ? 'accepted' : 'declined';
  if (!accept) return { status: inv.status, message: 'Declined. The offer is closed.' };
  if (inv.kind === 'co-lead') {
    career.coLead = { angelId: inv.fromId, name: inv.fromName };
    return {
      status: inv.status,
      message: `${inv.fromName} will back your next syndicate.`,
    };
  }
  career.anchor = {
    lpId: inv.fromId,
    name: inv.fromName,
    amount: inv.amount,
    currency: inv.currency,
  };
  return {
    status: inv.status,
    message: `${inv.fromName} will anchor your Fund I with ${formatMoney(inv.amount, inv.currency)}.`,
  };
}

// ---------------------------------------------------------------- the first session

/**
 * The café's three startups (§3.1 "guarantee a tutorial-ready AI startup"):
 * healthy AI companies in the city, those fitting the thesis first. They're
 * marked raising so the first cheque never depends on luck.
 */
function pickTutorialStartups(world: World, p: Player): Id[] {
  const sectors = p.investor?.sectors ?? [];
  const month = homeMonth(world, p);
  const healthy = (c: Company) => {
    return companyRunway(world, c) >= 6;
  };
  // Early-stage, unlisted startups first (an angel's first cheque); in an older city
  // where every startup has grown, the rest (the angel ceiling is off).
  const early = (c: Company) => !needsLead(nextStage(c.lastRound));
  const all = Object.values(world.companies)
    .filter(
      (c) =>
        c.ai &&
        c.market === p.market &&
        c.status === 'active' &&
        !c.bannedFromRaising &&
        (early(c) || !INVESTOR.caps.angelCeiling),
    )
    .sort(
      (a, b) =>
        Number(early(b)) - Number(early(a)) ||
        Number(a.ipo?.status === 'listed') - Number(b.ipo?.status === 'listed') ||
        Number(sectors.includes(b.industry)) - Number(sectors.includes(a.industry)) ||
        Number(healthy(b)) - Number(healthy(a)) ||
        b.stars.value - a.stars.value ||
        (a.id < b.id ? -1 : 1),
    )
    .slice(0, 3);
  for (const c of all) {
    c.raising = true;
    if (c.lastDecisionMonth < month) c.lastDecisionMonth = month;
  }
  return all.map((c) => c.id);
}

/** A new investor's first session begins (investor-career worlds only). */
export function startInvestorTutorial(world: World, p: Player) {
  if (!investorOn(world) || p.ai) return;
  const career = careerOf(p);
  if (career.tutorial) return;
  career.tutorial = {
    startedMonth: homeMonth(world, p),
    seen: ['profile'],
    picks: pickTutorialStartups(world, p),
  };
  recordCareer(world, p);
}

function tutorialDone(world: World, p: Player, step: InvestorTutorialStep): boolean {
  const t = p.career?.tutorial;
  if (!t) return false;
  switch (step) {
    case 'profile':
      return !!p.investor;
    case 'shortlist':
      return !!t.shortlist;
    case 'first-call':
      return !!t.shortlist && (p.diligence[t.shortlist] ?? 0) >= 1;
    case 'term-sheet':
      return Object.values(world.positions).some(
        (x) => x.investorId === p.id && x.invested > 0 && !publicBuy(world, x.companyId, p.id),
      );
    default:
      return t.seen.includes(step);
  }
}

const publicBuy = (world: World, companyId: Id, id: Id) =>
  (world.companies[companyId]?.ipo?.basis?.[id] ?? 0) > 0;

/** The step the player is on, or null when finished or skipped. */
function tutorialStep(world: World, p: Player): InvestorTutorialStep | null {
  const t = p.career?.tutorial;
  if (!t || t.doneMonth !== undefined || t.skipped) return null;
  return INVESTOR_TUTORIAL_STEPS.find((s) => !tutorialDone(world, p, s)) ?? null;
}

/**
 * `investor.tutorial`: acknowledge a step (`next`), pick a startup from the
 * café (`shortlist`), or skip it all (`skip`: nothing is invested on a skip).
 */
export function tutorialCommand(
  world: World,
  me: Player,
  action: 'next' | 'shortlist' | 'skip',
  companyId?: Id,
) {
  ensure(investorOn(world), 'tutorial.off', 'Not available yet.');
  ensure(hasCareer(me), 'tutorial.role', 'The investor first session is for investors.');
  const career = careerOf(me);
  career.tutorial ??= {
    startedMonth: homeMonth(world, me),
    seen: ['profile'],
    picks: pickTutorialStartups(world, me),
  };
  const t = career.tutorial;
  const month = homeMonth(world, me);
  if (action === 'skip') {
    t.skipped = true;
    t.doneMonth = month;
    return { step: null, message: 'Skipped. Your profile and thesis are saved.' };
  }
  const step = tutorialStep(world, me);
  ensure(step, 'tutorial.done', 'You’ve finished the first session.');
  if (action === 'shortlist') {
    ensure(companyId, 'tutorial.company', 'Pick a startup.');
    const c = world.companies[companyId];
    ensure(c && c.status === 'active', 'tutorial.company', 'Pick a startup that is operating.');
    ensure(
      c.market === locationOf(me) || c.market === me.market,
      'tutorial.company',
      'Pick a startup in your city.',
    );
    t.shortlist = companyId;
    // The café's pick starts your pipeline (Phase 8).
    (me.pipeline ??= {})[companyId] ??= {
      companyId,
      stage: 'screened',
      month: homeMonth(world, me),
      source: 'cafe',
    };
  } else {
    ensure(
      step === 'investable' || step === 'portfolio' || step === 'ladder',
      'tutorial.step',
      step === 'shortlist'
        ? 'Pick one of the three startups first.'
        : step === 'first-call'
          ? 'Do a first call with the startup you picked.'
          : 'Send them a small SAFE first.',
    );
    if (!t.seen.includes(step)) t.seen.push(step);
    if (step === 'ladder') {
      t.doneMonth = month;
      const next = nextRung(me);
      if (next) career.pinned = next;
      achieve(world, me, 'investor.first-session', 'First session', month);
    }
  }
  return { step: tutorialStep(world, me) };
}

/** The lowest rung of the climb not reached yet (2–6), or null at the top. */
function nextRung(p: Player): number | null {
  for (let n = 2; n <= 6; n++) if (p.career?.reached[n] === undefined) return n;
  return null;
}

/** The tutorial for the client: steps, the café's startups, a suggested cheque, and a recovery. */
function tutorialView(world: World, p: Player) {
  const t = p.career?.tutorial;
  if (!t) return null;
  const home = getMarket(world, p.market);
  const step = tutorialStep(world, p);
  const can = investable(world, p);
  const cap = Math.floor(can * INVESTOR.caps.tutorialCheque);
  const picks = t.picks
    .map((id) => world.companies[id])
    .filter((c): c is Company => !!c && c.status === 'active')
    .map((c) => {
      const stage = nextStage(c.lastRound);
      const model = valueCompany(world, c, stage).value;
      const maxCheck = Math.max(0, Math.round(model * 0.3));
      const m = getMarket(world, c.market);
      const capIn = valueIn(world, cap, home.data.currency, m.data.currency);
      return {
        companyId: c.id,
        name: c.name,
        industry: c.industry,
        idea: c.idea,
        stage,
        stars: roundTo(c.stars.value, 1),
        fits: (p.investor?.sectors ?? []).includes(c.industry),
        currency: m.data.currency,
        /** A suggested first cheque: small, inside the cap and what they'd take. */
        suggestedAmount: Math.max(0, Math.min(capIn, maxCheck)),
        /** A cap they'd accept today (the model's value; SAFE post-money). */
        suggestedCap: model + Math.min(capIn, maxCheck),
      };
    });
  // A founder said no to your term sheet: why, and the way back (§3.1).
  const last = t.shortlist
    ? Object.values(world.deals)
        .filter(
          (d) =>
            d.companyId === t.shortlist &&
            d.terms.kind === 'investment' &&
            d.proposer.kind === 'player' &&
            d.proposer.id === p.id,
        )
        .sort((a, b) => b.createdMonth - a.createdMonth || (a.id < b.id ? 1 : -1))[0]
    : undefined;
  const declined = last?.status === 'declined' || last?.status === 'expired';
  return {
    step,
    steps: INVESTOR_TUTORIAL_STEPS.map((s) => ({ id: s, done: tutorialDone(world, p, s) })),
    done: t.doneMonth !== undefined,
    skipped: !!t.skipped,
    shortlist: t.shortlist ?? null,
    picks,
    currency: home.data.currency,
    liquid: wealthView(world, p).liquid,
    livingCost: monthOfLiving(world, p),
    reserveMonths: INVESTOR.caps.reserveMonths,
    investable: can,
    chequeCap: cap,
    hoursLeft: hoursLeft(p),
    recovery: declined
      ? {
          reason: 'price' as const,
          message:
            'They passed on price: your cap was below what they think they’re worth. Offer the suggested cap, or pick the second startup.',
          second: picks.find((x) => x.companyId !== t.shortlist)?.companyId ?? null,
        }
      : null,
  };
}

// ---------------------------------------------------------------- three prompts

interface InvestorPrompt {
  id: string;
  label: string;
  /** The name in the label (an event, a competition, a contact), for translated copy. */
  name?: string;
  go: JourneyGo | null;
}

/** Main, opportunity and personal prompts for an investor (§10.2). */
function investorPrompts(world: World, p: Player) {
  const m = getMarket(world, locationOf(p));
  const step = tutorialStep(world, p);
  const next = nextRung(p);
  let main: InvestorPrompt | null = null;
  if (step)
    main = {
      id: `tutorial.${step}`,
      label: 'Finish your first session',
      go: { kind: 'tab', tab: 'portfolio' },
    };
  else if (next) {
    const todo = rungRequirements(world, p, next).find((r) => !r.done);
    main = {
      id: `rung.${next}.${todo?.id ?? 'done'}`,
      label: `Become a ${RUNGS[next - 1]!.title.toLowerCase()}: ${todo?.label.toLowerCase() ?? 'almost there'}`,
      go:
        next === 2 || next === 3
          ? { kind: 'tab', tab: 'deals' }
          : { kind: 'tab', tab: 'portfolio' },
    };
  }
  const event = Object.values(world.events ?? {})
    .filter(
      (e) =>
        e.market === m.id &&
        e.status === 'upcoming' &&
        (e.kind === 'investor-breakfast' || e.kind === 'demo-day'),
    )
    .sort((a, b) => a.month - b.month || (a.id < b.id ? -1 : 1))[0];
  const comp = Object.values(world.competitions ?? {}).find(
    (c) => c.market === m.id && c.status === 'open',
  );
  const opportunity: InvestorPrompt | null = event
    ? {
        id: `event.${event.id}`,
        label: `Go to ${event.title}`,
        name: event.title,
        go: { kind: 'app', app: 'events' },
      }
    : comp
      ? {
          id: `comp.${comp.id}`,
          label: `Judge ${comp.name}`,
          name: comp.name,
          go: { kind: 'app', app: 'events' },
        }
      : {
          id: 'dealflow',
          label: 'See who is raising this month',
          go: { kind: 'tab', tab: 'deals' },
        };
  const warm = (p.contacts ?? [])
    .filter((c) => c.kind === 'founder' || c.kind === 'fund' || c.kind === 'player')
    .map((c) => ({ c, w: contactWarmth(c, homeMonth(world, p)) }))
    .sort((a, b) => b.w - a.w || (a.c.id < b.c.id ? -1 : 1))[0];
  const personal: InvestorPrompt = warm
    ? {
        id: `dinner.${warm.c.id}`,
        label: `Dinner with ${warm.c.name}`,
        name: warm.c.name,
        go: { kind: 'app', app: 'contacts' },
      }
    : {
        id: 'coffee',
        label: 'Coffee in the Investor Quarter',
        go: { kind: 'place', place: 'investors' },
      };
  return { main, opportunity, personal };
}

// ---------------------------------------------------------------- the view

/** `view.investorCareer`: the ladder, invitations, the ceiling, the first session and prompts. */
export function careerView(world: World, p: Player) {
  if (!investorOn(world) || !hasCareer(p)) return null;
  const career = p.career ?? { reached: {}, invitations: [] };
  const home = getMarket(world, p.market);
  const next = nextRung(p);
  const current = Math.max(1, ...[1, 2, 3, 4, 5, 6].filter((n) => career.reached[n] !== undefined));
  const rec = angelRecord(world, p);
  const lpOpen = wealthView(world, p).liquid >= INVESTOR.tracks.lpMonths * monthOfLiving(world, p);
  return {
    current,
    next,
    pinned: career.pinned ?? null,
    rungs: RUNGS.map((r) => ({
      n: r.n,
      id: r.id,
      title: r.title,
      unlocks: RUNG_UNLOCKS[r.n]!,
      reachedMonth: career.reached[r.n] ?? null,
      status:
        career.reached[r.n] !== undefined
          ? ('reached' as const)
          : r.n === next
            ? ('next' as const)
            : ('locked' as const),
      requirements: rungRequirements(world, p, r.n),
    })),
    invitations: career.invitations.filter((x) => x.status === 'open'),
    coLead: career.coLead ?? null,
    anchor: career.anchor ?? null,
    ceiling: {
      /** False: no cap on angel cheques after the first session (`INVESTOR.caps.angelCeiling`). */
      on: INVESTOR.caps.angelCeiling,
      currency: home.data.currency,
      /** The largest personal cheque today (home minor units). */
      maxCheque: angelCap(world, p),
      share: INVESTOR.caps.angelCheque,
      leadStages: INVESTOR.caps.leadStages,
      liquidNetWorth: liquidNetWorth(world, p),
      investable: investable(world, p),
    },
    tracks: {
      startups: true,
      stocks: true,
      property: true,
      lp: lpOpen,
      lpNeed: Math.round(INVESTOR.tracks.lpMonths * monthOfLiving(world, p)),
      secondaries: career.reached[2] !== undefined || career.reached[7] !== undefined,
    },
    record: rec,
    fullRecord: trackRecord(world, [p.id, ...managedFunds(world, p).map((f) => f.id)]),
    tutorial: tutorialView(world, p),
    prompts: investorPrompts(world, p),
  };
}
