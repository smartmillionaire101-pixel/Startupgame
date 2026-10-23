/**
 * Investor deal flow at events (player feedback, 23 October 2026: "for a
 * new investor there is limited deal flow"). Deal-flow note worlds only.
 *
 *  - Founders pitch you: when an investor goes to a tech event, a hosted
 *    event (investor breakfast, demo day, founder meetup) or a hangout,
 *    founders come up and pitch. AI companies, and human founders who are
 *    there too. Each pitch joins your pipeline (source `event`) with a
 *    snapshot: stage, sector, traction, the ask and the valuation. You take
 *    a follow-up meeting (first-call diligence), pass with a reason, or send
 *    terms through the ordinary deal flow. A new investor always hears a few
 *    pitches (no dead ends); a demo day is a batch.
 *  - Investors talk to you: AI angels and fund partners there share their
 *    strategy (thesis, cheque, fund size, portfolio construction, reserves,
 *    ownership) and a lesson (data/dealflow.ts). A lesson new to you adds
 *    investing skill and a little LP credibility, and counts as knowledge in
 *    an LP pitch (lpreview.ts). They become contacts, and some refer a deal
 *    (a co-investment when they're in it).
 *
 * Determinism: every draw comes from the 'dealflow' RNG label, keyed by the
 * event and the investor, so nothing else's draws shift. Nothing moves money.
 */
import { contactWarmth, addContact } from './events.js';
import { DEALFLOW, LESSONS, lessonById } from './data/dealflow.js';
import type { Lesson } from './data/dealflow.js';
import type { MarketId } from './data/markets.js';
import { stageOf, isHotRound } from './dealcraft.js';
import { aiStartupTarget } from './ai.js';
import { angelRecord } from './funds.js';
import { getMarket, lastPnl, nextStage, notify, usdToLocal } from './helpers.js';
import { lpsOf } from './programs.js';
import { typicalPostMoney } from './lpreview.js';
import { clamp, roundTo } from './math.js';
import { dealflowOn } from './releases.js';
import { deriveRng } from './rng.js';
import type { Rng } from './rng.js';
import { monthlyGrowth, valueCompany } from './valuation.js';
import { spawnAiStartup } from './world.js';
import type {
  Company,
  EventPitch,
  Fund,
  Id,
  InvestorLearning,
  InvestorTalk,
  PipelineEntry,
  Player,
  World,
} from './types.js';

/** Where an investor met founders and other investors. */
export interface DealflowEvent {
  id: string;
  title: string;
  /** Tech event kind, hosted event kind, or 'hangout'. */
  kind: string;
  where: 'tech' | 'hosted' | 'hangout';
  market: MarketId;
}

/** A human investor in a deal-flow world. */
export const isDealflowInvestor = (world: World, p: Player | undefined): p is Player =>
  !!p && !p.ai && p.role === 'investor' && !!p.investor && dealflowOn(world);

/** The investor's learning record, created on first use. */
export const learningOf = (p: Player): InvestorLearning =>
  (p.dealflow ??= { lessons: [], talks: [] });

/** Round to two significant figures, so asks read like a founder's. */
const nice = (v: number) => {
  if (v <= 0) return 0;
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
  return Math.round(v / p) * p;
};

const customersOf = (c: Company) =>
  Object.values(c.segments).reduce((a, s) => a + (s.paying ?? 0), 0);

/** The pitch a founder gives: a snapshot of the company now, with an ask an AI founder would take. */
function pitchOf(
  world: World,
  c: Company,
  founder: Player,
  ev: { title: string; whereKind: EventPitch['whereKind']; eventKind: string },
  month: number,
  rng: Rng,
  via?: EventPitch['via'],
): EventPitch {
  const stage = nextStage(c.lastRound);
  const model = Math.max(1, valueCompany(world, c, stage).value);
  // A human founder's latest ask, if they pitched lately; otherwise a usual share of the value.
  const lastAsk = Object.values(world.pitches)
    .filter((x) => x.companyId === c.id && x.ask > 0)
    .sort((a, b) => b.month - a.month || (a.id < b.id ? 1 : -1))[0]?.ask;
  const ask = !c.ai && lastAsk ? lastAsk : nice(model * rng.range(...DEALFLOW.askShare));
  const priced = c.capTable.roundsRaised > 0 || !['pre-seed', 'seed'].includes(stage);
  return {
    where: ev.title,
    whereKind: ev.whereKind,
    eventKind: ev.eventKind,
    founderId: founder.id,
    founderName: founder.name,
    human: !founder.ai,
    stage,
    industry: c.industry,
    revenue: lastPnl(c)?.revenue ?? 0,
    customers: customersOf(c),
    growth: roundTo(monthlyGrowth(c), 3),
    team: c.staff.length + c.founderIds.length,
    ask,
    valuation: nice(Math.max(model, c.capTable.lastPostMoney)),
    instrument: priced ? 'priced' : 'safe',
    month,
    ...(via ? { via } : {}),
  };
}

function addPitch(p: Player, c: Company, pitch: EventPitch, source: PipelineEntry['source']) {
  const book = (p.pipeline ??= {});
  book[c.id] = { companyId: c.id, stage: 'sourced', month: pitch.month, source, pitch };
}

/** AI companies an investor hasn't seen, in their thesis first. */
function aiCandidates(world: World, me: Player, market: MarketId, rng: Rng, newbie: boolean) {
  const sectors = me.investor?.sectors ?? [];
  const list = Object.values(world.companies)
    .filter(
      (c) =>
        c.ai &&
        c.market === market &&
        c.status === 'active' &&
        !c.bannedFromRaising &&
        !c.ipo &&
        !c.founderIds.includes(me.id) &&
        !me.pipeline?.[c.id],
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const fit = (c: Company) =>
    (sectors.includes(c.industry) ? 2 : 0) +
    // A new investor meets founders who'll take their cheque now, not hot rounds.
    (newbie && isHotRound(world, c) ? -3 : 0);
  return rng.shuffle(list).sort((a, b) => fit(b) - fit(a));
}

const founderOf = (world: World, c: Company): Player | undefined =>
  c.founderIds.map((id) => world.players[id]).find((x): x is Player => !!x);

/** AI investors in a city: angels still writing cheques and fund partners. */
function aiInvestors(world: World, market: MarketId): Fund[] {
  return Object.values(world.funds)
    .filter((f) => {
      if (!f.ai || f.managerId || f.market !== market) return false;
      const angel = f.angelId ? world.players[f.angelId] : undefined;
      return !f.angelId || (!!angel && angel.angel?.retiredMonth === undefined);
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** An AI fund's strategy, as its partner would describe it. */
function strategyOf(world: World, f: Fund) {
  const angel = !!f.angelId;
  const reserveRatio = angel ? 0.2 : 0.5;
  const avg = Math.max(1, Math.round((f.check[0] + f.check[1]) / 2));
  const companies = clamp(Math.round((f.size * (1 - reserveRatio) * 0.84) / avg), 5, 60);
  const stage = f.stages[0] ?? 'seed';
  const ownership = roundTo(avg / Math.max(1, typicalPostMoney(world, f.market)[stage]), 3);
  return { reserveRatio, companies, ownership };
}

function pickLesson(rng: Rng, known: string[], angel: boolean): Lesson {
  const fits = LESSONS.filter((l) => l.by === 'any' || l.by === (angel ? 'angel' : 'vc'));
  const fresh = fits.filter((l) => !known.includes(l.id));
  return rng.pick(fresh.length ? fresh : fits);
}

export interface DealflowResult {
  pitches: ReturnType<typeof pitchView>[];
  investors: ReturnType<typeof talkView>[];
  lessonsLearned: number;
}

/**
 * Founders pitch and investors talk to a human investor at an event (or a
 * hangout). `present` are the other humans there: founders among them pitch
 * in person. Returns what happened, or null when nothing did (or the note is off).
 */
export function eventDealFlow(
  world: World,
  me: Player,
  ev: DealflowEvent,
  month: number,
  present: Player[] = [],
): DealflowResult | null {
  if (!isDealflowInvestor(world, me)) return null;
  const rng = deriveRng(world.seed, 'dealflow', ev.id, me.id);
  const newbie = angelRecord(world, me).deals < DEALFLOW.newInvestorDeals;
  const [lo, hi] = DEALFLOW.pitches[ev.kind] ?? [1, 1];
  let n = rng.int(lo, hi);
  if (newbie && hi >= 1 && ev.where !== 'hangout') n = Math.max(n, DEALFLOW.minPitches);
  const meta = { title: ev.title, whereKind: ev.where, eventKind: ev.kind };
  const pitched: Company[] = [];

  // Human founders there pitch in person (at most three).
  const humans = present
    .filter((q) => q.id !== me.id && !q.ai)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .flatMap((q) =>
      q.companyIds
        .map((id) => world.companies[id])
        .filter(
          (c): c is Company =>
            !!c &&
            c.status === 'active' &&
            c.founderIds.includes(q.id) &&
            !c.bannedFromRaising &&
            !c.founderIds.includes(me.id) &&
            !me.pipeline?.[c.id],
        )
        .slice(0, 1)
        .map((c) => ({ c, q })),
    )
    .slice(0, 3);
  for (const { c, q } of humans) {
    addPitch(me, c, pitchOf(world, c, q, meta, month, rng), 'event');
    pitched.push(c);
    notify(world, q.id, {
      month: getMarket(world, q.market).month,
      kind: 'pitch',
      text: `You pitched ${c.name} to ${me.name} at ${ev.title}. You’re in their pipeline.`,
      ref: { kind: 'company', id: c.id },
    });
  }
  // AI founders come up and pitch. When the city has too few new faces for a new
  // investor's first events (or a demo day's batch), fresh startups from the
  // accelerators pitch too, within the city's room for AI startups.
  let founders = aiCandidates(world, me, ev.market, rng, newbie);
  const need = Math.max(
    newbie && hi >= 1 && ev.where !== 'hangout' ? DEALFLOW.minPitches : 0,
    ev.kind === 'demo-day' ? lo : 0,
  );
  if (founders.length < need) {
    const room = aiStartupTarget(world, ev.market) + DEALFLOW.extraStartups;
    let active = Object.values(world.companies).filter(
      (c) => c.ai && c.market === ev.market && c.status === 'active',
    ).length;
    for (let i = founders.length; i < need && active < room; i++, active++) {
      try {
        spawnAiStartup(world, ev.market, rng, world.activity?.at ?? 0);
      } catch {
        break;
      }
    }
    founders = aiCandidates(world, me, ev.market, rng, newbie);
  }
  for (const c of founders.slice(0, n)) {
    const founder = founderOf(world, c);
    if (!founder) continue;
    c.raising = true;
    addPitch(me, c, pitchOf(world, c, founder, meta, month, rng), 'event');
    addContact(
      me,
      {
        kind: 'founder',
        refId: founder.id,
        name: `${founder.name}, ${c.name}`,
        warmth: DEALFLOW.founderWarmth,
      },
      month,
    );
    pitched.push(c);
  }

  // Investors there talk strategy; some refer a deal.
  const [tlo, thi] = DEALFLOW.talks[ev.kind] ?? [0, 0];
  const k = rng.int(tlo, thi);
  const book = learningOf(me);
  const recent = new Set(book.talks.filter((t) => month - t.month < 2).map((t) => t.fundId));
  const pool = rng.shuffle(aiInvestors(world, ev.market));
  const order = [...pool.filter((f) => !recent.has(f.id)), ...pool.filter((f) => recent.has(f.id))];
  const talks: InvestorTalk[] = [];
  let learned = 0;
  for (const f of order.slice(0, k)) {
    const angelPlayer = f.angelId ? world.players[f.angelId] : undefined;
    const who = angelPlayer?.name ?? f.partner;
    const lesson = pickLesson(rng, book.lessons, !!f.angelId);
    const isNew = !book.lessons.includes(lesson.id);
    if (isNew) {
      book.lessons.push(lesson.id);
      me.skills.investing = Math.min(100, me.skills.investing + DEALFLOW.lessonSkill);
      me.investor!.lpCredibility = roundTo(
        Math.min(DEALFLOW.credibilityCap, me.investor!.lpCredibility + DEALFLOW.lessonCredibility),
        3,
      );
      learned++;
    }
    addContact(
      me,
      { kind: 'fund', refId: f.id, name: `${who}, ${f.name}`, warmth: DEALFLOW.investorWarmth },
      month,
    );
    // A referral: a company they back (a co-investment) or one they've seen.
    let referredId: Id | null = null;
    let coinvest = false;
    if (rng.chance(newbie ? DEALFLOW.referralChanceNew : DEALFLOW.referralChance)) {
      const held = Object.values(world.companies)
        .filter(
          (c) =>
            c.market === ev.market &&
            c.status === 'active' &&
            c.ai &&
            !c.ipo &&
            !c.bannedFromRaising &&
            !me.pipeline?.[c.id] &&
            !!world.positions[`${f.id}:${c.id}`],
        )
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      const c = held.length ? rng.pick(held) : aiCandidates(world, me, ev.market, rng, newbie)[0];
      const founder = c ? founderOf(world, c) : undefined;
      if (c && founder) {
        coinvest = held.includes(c);
        c.raising = true;
        addPitch(
          me,
          c,
          pitchOf(
            world,
            c,
            founder,
            { title: ev.title, whereKind: 'referral', eventKind: 'referral' },
            month,
            rng,
            { name: who, fundId: f.id, coinvest },
          ),
          'referral',
        );
        referredId = c.id;
      }
    }
    const s = strategyOf(world, f);
    const talk: InvestorTalk = {
      fundId: f.id,
      name: who,
      org: f.name,
      angel: !!f.angelId,
      where: ev.title,
      month,
      lessonId: lesson.id,
      learned: isNew,
      sectors: f.sectors,
      stages: f.stages,
      cheque: [f.check[0], f.check[1]],
      size: f.size,
      currency: getMarket(world, f.market).data.currency,
      companies: s.companies,
      reserveRatio: s.reserveRatio,
      ownership: s.ownership,
      referredId,
      coinvest,
    };
    talks.push(talk);
    book.talks.unshift(talk);
  }
  book.talks = book.talks.slice(0, DEALFLOW.talksKept);

  if (pitched.length === 0 && talks.length === 0) return null;
  const referred = talks.filter((t) => t.referredId).length;
  notify(world, me.id, {
    month,
    kind: 'pitch',
    text:
      `${ev.title}: ${pitched.length} founder${pitched.length === 1 ? '' : 's'} pitched you` +
      (talks.length
        ? ` and you talked strategy with ${talks.length} investor${talks.length === 1 ? '' : 's'}`
        : '') +
      (referred ? ` (${referred} referred a deal)` : '') +
      '. They’re in your pipeline.',
  });
  return {
    pitches: [...pitched.map((c) => c.id), ...talks.flatMap((t) => t.referredId ?? [])]
      .map((id) => pitchView(world, me, me.pipeline![id]!))
      .filter((x): x is NonNullable<typeof x> => !!x),
    investors: talks.map((t) => talkView(world, t)),
    lessonsLearned: learned,
  };
}

// ---------------------------------------------------------------- views

/** One pitch in your pipeline, with where it stands now. */
export function pitchView(world: World, p: Player, e: PipelineEntry) {
  const c = world.companies[e.companyId];
  if (!c || !e.pitch) return null;
  const contact = (p.contacts ?? []).find((x) => x.refId === e.pitch!.founderId);
  return {
    companyId: c.id,
    name: c.name,
    idea: c.idea,
    currency: getMarket(world, c.market).data.currency,
    status: c.status,
    raising: c.raising,
    hot: isHotRound(world, c),
    stage: stageOf(world, p, c.id),
    source: e.source ?? 'event',
    diligence: p.diligence[c.id] ?? 0,
    warmth: contact ? roundTo(contactWarmth(contact, getMarket(world, p.market).month), 2) : 0,
    pitch: e.pitch,
  };
}

/** A conversation with an AI investor, with the lesson in words. */
export function talkView(world: World, t: InvestorTalk) {
  const lesson = lessonById(t.lessonId);
  const c = t.referredId ? world.companies[t.referredId] : undefined;
  return {
    ...t,
    topic: lesson?.topic ?? 'thesis',
    lesson: lesson?.text ?? '',
    tip: lesson?.tip ?? '',
    referred: c ? { companyId: c.id, name: c.name } : null,
  };
}

/**
 * `view.investorDealFlow`: pitches you heard at events (live first), the
 * investors you talked to, what you've learned, and what an LP pitch needs
 * (typical valuations by stage, your last panel). Null outside deal-flow
 * worlds or for non-investors.
 */
export function investorDealFlowView(world: World, p: Player) {
  if (!isDealflowInvestor(world, p)) return null;
  const m = getMarket(world, p.market);
  const pitches = Object.values(p.pipeline ?? {})
    .filter((e) => e.pitch)
    .sort((a, b) => b.month - a.month || (a.companyId < b.companyId ? -1 : 1))
    .map((e) => pitchView(world, p, e))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 30);
  const book = p.dealflow;
  return {
    pitches,
    talks: (book?.talks ?? []).slice(0, 8).map((t) => talkView(world, t)),
    lessons: (book?.lessons ?? [])
      .map((id) => lessonById(id))
      .filter((l): l is Lesson => !!l)
      .map((l) => ({ id: l.id, topic: l.topic, text: l.text, tip: l.tip })),
    lessonsTotal: LESSONS.length,
    skill: Math.round(p.skills.investing),
    lpCredibility: p.investor?.lpCredibility ?? 0,
    newInvestor: angelRecord(world, p).deals < DEALFLOW.newInvestorDeals,
    lastPanel: book?.lastPanel ?? null,
    typicalPost: typicalPostMoney(world, m.id),
    /** The most the city's LPs would put into a first fund (pension and sovereign money waits). */
    panelCapacity: lpsOf(m.id)
      .filter((lp) => lp.kind !== 'pension' && lp.kind !== 'sovereign')
      .reduce((a, lp) => a + usdToLocal(world, m, lp.ticketUsd[1]), 0),
    lps: lpsOf(m.id).map((lp) => ({ id: lp.id, name: lp.name, kind: lp.kind })),
    currency: m.data.currency,
  };
}
