/**
 * Investor deal flow (DEALFLOW_NOTE): founders pitch investors at events,
 * investors talk strategy and refer deals, and LP pitches are judged on the
 * fund's strategy and the track record.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { LESSONS } from '../src/data/dealflow.js';
import { coherenceOf, reviewPitch, strategyChecks, typicalPostMoney } from '../src/lpreview.js';
import type { StrategyPlan } from '../src/lpreview.js';
import { lpsOf } from '../src/programs.js';
import { DEALFLOW_NOTE, INVESTOR_NOTE, RELEASES, dealflowOn, investorOn } from '../src/releases.js';
import { deriveRng } from '../src/rng.js';
import { techEventsFor } from '../src/social.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  careerWorld,
  makeWorld,
  moneyByCurrency,
  run,
  settle,
  tryRun,
} from './helpers.js';

const I = 'u_investor';

/** A world with the deal-flow note (a new world logs only the newest note). */
function dealflowWorld(seed = 81): World {
  return run(makeWorld(seed, ['lagos']), null, {
    type: 'system.announce',
    id: DEALFLOW_NOTE,
    text: 'Deal flow is here.',
  }).world;
}

/** A new investor, past the first session. */
function newInvestor(w: World): World {
  w = addInvestor(w);
  return run(w, I, { type: 'investor.tutorial', action: 'skip' }).world;
}

/** This month's tech events in Lagos, the free ones first. */
const eventsNow = (w: World) =>
  techEventsFor(w, w.markets.lagos!, w.markets.lagos!.month).sort((a, b) => a.ticket - b.ticket);

const eventEntries = (w: World, id = I) =>
  Object.values(w.players[id]!.pipeline ?? {}).filter((e) => e.source === 'event');

describe('deal flow: the release switch', () => {
  it('comes after the investor career and implies it', () => {
    expect(RELEASES.indexOf(DEALFLOW_NOTE)).toBeGreaterThan(RELEASES.indexOf(INVESTOR_NOTE));
    const w = { announcements: [DEALFLOW_NOTE] } as unknown as World;
    expect(dealflowOn(w)).toBe(true);
    expect(investorOn(w)).toBe(true);
    expect(dealflowOn({ announcements: [INVESTOR_NOTE] } as unknown as World)).toBe(false);
  });
});

describe('founders pitch investors at events', () => {
  it('a new investor at a tech event is pitched and gets real deals in the pipeline', () => {
    let w = newInvestor(dealflowWorld());
    const e = eventsNow(w)[0]!;
    const before = moneyByCurrency(w);
    const r = run(w, I, { type: 'techevent.attend', eventId: e.id });
    w = r.world;
    const df = r.result.dealflow;
    expect(df).toBeTruthy();
    // No dead ends: at least two founders pitch a new investor.
    expect(df.pitches.length).toBeGreaterThanOrEqual(2);
    const entries = eventEntries(w);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    for (const x of entries) {
      expect(x.pitch!.where).toBe(e.title);
      expect(x.pitch!.ask).toBeGreaterThan(0);
      expect(x.pitch!.valuation).toBeGreaterThan(x.pitch!.ask * 1.5);
      expect(w.companies[x.companyId]!.raising).toBe(true);
    }
    // The founders became contacts.
    const founderIds = entries.map((x) => x.pitch!.founderId);
    expect((w.players[I]!.contacts ?? []).filter((c) => founderIds.includes(c.refId)).length).toBe(
      founderIds.length,
    );
    // The view shows them, with a stage that moves with the deal flow.
    const view = playerView(w, I)!.investorDealFlow!;
    expect(view.pitches.length).toBe(entries.length);
    // Follow-up meeting (first call), then terms from the pitch: an AI founder says yes.
    const p = view.pitches.find((x) => !x.hot)!;
    w = run(w, I, { type: 'invest.diligence', companyId: p.companyId, depth: 1 }).world;
    expect(
      playerView(w, I)!.investorDealFlow!.pitches.find((x) => x.companyId === p.companyId)!.stage,
    ).toBe('first-call');
    const deal = run(w, I, {
      type: 'invest.propose',
      companyId: p.companyId,
      instrument: p.pitch.instrument,
      amount: Math.min(p.pitch.ask, w.players[I]!.investor!.checkSize),
      valuation: p.pitch.valuation,
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
    });
    expect(deal.result.status).toBe('accepted');
    w = deal.world;
    expect(w.positions[`${I}:${p.companyId}`]).toBeTruthy();
    // Passing on another one tells the pipeline why.
    const other = view.pitches.find((x) => x.companyId !== p.companyId)!;
    w = run(w, I, { type: 'pipeline.pass', companyId: other.companyId, reason: 'traction' }).world;
    expect(w.players[I]!.pipeline![other.companyId]!.stage).toBe('passed');
    // Money only moved through the ledger.
    expect(moneyByCurrency(w)).toEqual(before);
  });

  it('a human founder at the same event pitches in person', () => {
    let w = addFounder(newInvestor(dealflowWorld(82)));
    const e = eventsNow(w)[0]!;
    w = run(w, 'u_founder', { type: 'techevent.attend', eventId: e.id }).world;
    const r = run(w, I, { type: 'techevent.attend', eventId: e.id });
    const fc = r.world.players.u_founder!.companyIds[0]!;
    const entry = r.world.players[I]!.pipeline![fc]!;
    expect(entry.source).toBe('event');
    expect(entry.pitch!.human).toBe(true);
    expect((r.world.inbox.u_founder ?? []).some((x) => x.text.includes('in their pipeline'))).toBe(
      true,
    );
  });

  it('a hosted demo day gives a batch of pitches and new contacts', () => {
    let w = newInvestor(dealflowWorld(83));
    const contacts0 = (w.players[I]!.contacts ?? []).length;
    w = run(w, I, {
      type: 'event.host',
      kind: 'demo-day',
      title: 'Lagos Seed Demo Day',
      venue: 'hall',
      budget: 50_000_000,
    }).world;
    w = settle(w, 'lagos', 1);
    const entries = eventEntries(w);
    expect(entries.length).toBeGreaterThanOrEqual(4);
    expect(entries.every((x) => x.pitch!.eventKind === 'demo-day')).toBe(true);
    const contacts = w.players[I]!.contacts ?? [];
    expect(contacts.length).toBeGreaterThan(contacts0 + 4);
    expect(contacts.some((c) => c.kind === 'fund')).toBe(true);
    expect((w.inbox[I] ?? []).some((x) => x.text.includes('pitched you'))).toBe(true);
  });
});

describe('meeting other investors', () => {
  it('teaches strategy: lessons, skill, LP credibility and contacts', () => {
    let w = newInvestor(dealflowWorld(84));
    const skill0 = w.players[I]!.skills.investing;
    const cred0 = w.players[I]!.investor!.lpCredibility;
    w = run(w, I, {
      type: 'event.host',
      kind: 'investor-breakfast',
      title: 'Seed investors breakfast',
      venue: 'hall',
      budget: 20_000_000,
    }).world;
    w = settle(w, 'lagos', 1);
    const me = w.players[I]!;
    expect(me.dealflow!.talks.length).toBe(2);
    expect(me.dealflow!.lessons.length).toBeGreaterThanOrEqual(1);
    expect(me.skills.investing).toBeGreaterThan(skill0);
    expect(me.investor!.lpCredibility).toBeGreaterThan(cred0);
    const talk = playerView(w, I)!.investorDealFlow!.talks[0]!;
    expect(talk.lesson.length).toBeGreaterThan(10);
    expect(talk.cheque[1]).toBeGreaterThan(0);
    expect(talk.companies).toBeGreaterThanOrEqual(5);
    expect(LESSONS.some((l) => l.id === talk.lessonId)).toBe(true);
    expect((me.contacts ?? []).some((c) => c.kind === 'fund' && c.refId === talk.fundId)).toBe(
      true,
    );
    // The investor journey's optional tips appear.
    const steps = playerView(w, I)!.journey!.chapters.flatMap((c) => c.steps.map((s) => s.id));
    expect(steps).toContain('first-cheque.events');
    expect(steps).toContain('fund.learn');
  });

  it('is deterministic: the same commands give the same deals and lessons', () => {
    const go = () => {
      let w = newInvestor(dealflowWorld(85));
      w = run(w, I, { type: 'techevent.attend', eventId: eventsNow(w)[0]!.id }).world;
      return w.players[I]!;
    };
    const a = go();
    const b = go();
    expect(a.pipeline).toEqual(b.pipeline);
    expect(a.dealflow).toEqual(b.dealflow);
  });
});

/** A coherent pre-seed plan for this city, sized to its LPs: the arithmetic adds up. */
function coherentPlan(w: World): StrategyPlan {
  const post = typicalPostMoney(w, 'lagos')['pre-seed'];
  const avgCheque = Math.round(post * 0.04);
  const companies = 25;
  return {
    sectors: ['fintech'],
    stages: ['pre-seed'],
    geography: 'city',
    avgCheque,
    companies,
    reserveRatio: 0.5,
    targetOwnership: 0.04,
    feeRate: 0.02,
    carry: 0.2,
    size: Math.round((companies * avgCheque) / ((1 - 0.16) * 0.5)),
  };
}

const incoherentPlan = (w: World): StrategyPlan => ({
  ...coherentPlan(w),
  companies: 6,
  reserveRatio: 0,
  targetOwnership: 0.3,
  feeRate: 0.03,
  carry: 0.3,
  sectors: ['fintech', 'saas', 'health', 'edtech', 'logistics', 'agritech'],
});

/** An investor with a record: deals with cash returned, sized to the plan. */
function withRecord(w: World, size: number, deals = 4, dpi = 1.5): World {
  return produce(w, (d) => {
    d.players[I]!.stars.value = 3;
    const ids = Object.values(d.companies)
      .filter((c) => c.market === 'lagos' && c.status === 'active' && c.ai)
      .slice(0, deals)
      .map((c) => c.id);
    const each = Math.round(size / 12 / deals);
    for (const cid of ids)
      d.positions[`${I}:${cid}`] = {
        investorId: I,
        companyId: cid,
        invested: each,
        returned: Math.round(each * dpi),
        month: 0,
        writtenOff: false,
      };
  });
}

describe('realistic LP pitches', () => {
  it('checks the strategy arithmetic', () => {
    const w = dealflowWorld(86);
    const post = typicalPostMoney(w, 'lagos');
    const good = strategyChecks(coherentPlan(w), post);
    expect(good.every((c) => c.level === 'good')).toBe(true);
    expect(coherenceOf(good)).toBe(1);
    const bad = strategyChecks(incoherentPlan(w), post);
    const level = (id: string) => bad.find((c) => c.id === id)!.level;
    expect(level('deploy')).toBe('bad');
    expect(level('portfolio')).toBe('bad');
    expect(level('reserves')).toBe('bad');
    expect(level('terms')).toBe('bad');
    expect(level('focus')).toBe('bad');
    expect(coherenceOf(bad)).toBeLessThan(0.3);
  });

  it('rewards a coherent strategy and a track record, with questions and reasons', () => {
    let w = newInvestor(dealflowWorld(87));
    const plan = coherentPlan(w);
    w = withRecord(w, plan.size);
    const lps = lpsOf('lagos');
    const ctx = { number: 1, type: 'vc' as const, month: 0 };
    const rng = () => deriveRng(w.seed, 'test', 'panel');
    const me = w.players[I]!;
    const good = reviewPitch(w, me, plan, lps, ctx, rng());
    const bad = reviewPitch(w, me, incoherentPlan(w), lps, ctx, rng());
    expect(good.parts.strategy).toBeGreaterThan(bad.parts.strategy);
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.committed).toBeGreaterThan(bad.committed);
    expect(good.lps.some((v) => v.commit && v.amount > 0)).toBe(true);
    // Pension and sovereign money waits for Fund II, and says so.
    expect(good.lps.filter((v) => v.reason === 'later-funds').length).toBe(
      lps.filter((l) => l.kind === 'pension' || l.kind === 'sovereign').length,
    );
    // Passing LPs name the strategy's weak points; questions probe them.
    expect(bad.lps.some((v) => !v.commit && v.reason.startsWith('pass-'))).toBe(true);
    expect(bad.questions.map((q) => q.id)).toContain('q-deploy');
    expect(good.questions.map((q) => q.id)).toContain('q-sourcing');
    // A bigger record with cash returned scores better than a thin one.
    const thinWorld = withRecord(newInvestor(dealflowWorld(87)), plan.size, 1, 0);
    const thin = reviewPitch(thinWorld, thinWorld.players[I]!, plan, lps, ctx, rng());
    expect(good.parts.track).toBeGreaterThan(thin.parts.track);
    expect(good.score).toBeGreaterThan(thin.score);
    expect(good.track.dpi).toBeGreaterThan(0);
    expect(good.track.tvpi).toBeGreaterThan(0);
  });

  it('raises Fund I from the LP panel on a coherent strategy, and not on a broken one', () => {
    let w = newInvestor(dealflowWorld(88));
    const plan = coherentPlan(w);
    w = withRecord(w, plan.size);
    const before = moneyByCurrency(w);
    const pitch = (p: StrategyPlan) => ({
      type: 'fund.raise' as const,
      sectors: ['fintech' as const],
      stages: ['pre-seed' as const],
      checkSize: p.avgCheque,
      why: 'Pre-seed fintech for market traders in Lagos',
      plan: {
        geography: p.geography,
        size: p.size,
        avgCheque: p.avgCheque,
        companies: p.companies,
        reserveRatio: p.reserveRatio,
        targetOwnership: p.targetOwnership,
        feeRate: p.feeRate,
        carry: p.carry,
      },
    });
    const no = run(w, I, pitch(incoherentPlan(w)));
    expect(no.result.ok).toBe(false);
    const panel = no.world.players[I]!.dealflow!.lastPanel!;
    expect(panel.ok).toBe(false);
    expect(panel.lps.some((v) => v.reason.startsWith('pass-'))).toBe(true);
    expect(playerView(no.world, I)!.investorDealFlow!.lastPanel!.questions.length).toBeGreaterThan(
      0,
    );
    const yes = run(w, I, pitch(plan));
    expect(yes.result.ok).toBe(true);
    const f = yes.world.funds[yes.result.fund.id]!;
    const committed = yes.result.review.lps.reduce(
      (a: number, v: { amount: number }) => a + v.amount,
      0,
    );
    expect(f.size).toBe(committed);
    expect(f.size).toBeGreaterThanOrEqual(plan.size / 2);
    expect(yes.world.accounts[f.account]!.balance).toBe(f.size);
    expect(f.feeRate).toBe(0.02);
    // LP money came in from the outside world's LP accounts: still conserved.
    expect(moneyByCurrency(yes.world)).toEqual(before);
  });

  it('an LP judges a fund launched with a strategy and explains itself', () => {
    let w = newInvestor(dealflowWorld(89));
    const plan = coherentPlan(w);
    w = withRecord(w, plan.size);
    w = produce(w, (d) => {
      d.players[I]!.career!.reached[3] = 0;
      d.accounts[d.players[I]!.accounts.local]!.balance += plan.size;
      d.accounts[d.markets.lagos!.ext.genesis]!.balance -= plan.size;
    });
    const r = run(w, I, {
      type: 'fund.launch',
      sectors: ['fintech'],
      stages: ['pre-seed'],
      checkSize: plan.avgCheque,
      why: 'Pre-seed fintech for market traders in Lagos',
      strategy: 'seed',
      target: plan.size,
      minCommit: Math.round(plan.size / 50),
      feeRate: 0.02,
      carry: 0.2,
      hurdle: 0,
      gpCommit: 0.02,
      termMonths: 48,
      investMonths: 24,
      keyPerson: true,
      plan: {
        geography: 'city',
        avgCheque: plan.avgCheque,
        companies: plan.companies,
        reserveRatio: plan.reserveRatio,
        targetOwnership: plan.targetOwnership,
      },
    });
    w = r.world;
    expect(w.funds[r.result.fundId]!.lp!.plan!.targetOwnership).toBe(0.04);
    const lp = lpsOf('lagos').find((x) => x.kind === 'dfi-fof')!;
    w = run(w, I, { type: 'lp.pitch', lpId: lp.id, fundId: r.result.fundId }).world;
    w = settle(w, 'lagos', 1);
    const app = Object.values(w.applications ?? {}).find((a) => a.targetId === lp.id)!;
    expect(app.review).toBeTruthy();
    expect(app.review!.lps[0]!.reason).toMatch(/^(commit|pass|bar)-/);
    const row = playerView(w, I)!
      .lpFunds!.gp.find((f) => f.id === r.result.fundId)!
      .lpPipeline.find((x) => x.id === lp.id)!;
    expect(row.review).toBeTruthy();
    expect(row.status).toBe(app.status);
  });
});

describe('old worlds are unaffected', () => {
  it('without the note: no pitches at events, and Fund I raises the old way', () => {
    let w = addInvestor(careerWorld(90));
    w = run(w, I, { type: 'investor.tutorial', action: 'skip' }).world;
    const e = eventsNow(w)[0]!;
    const r = run(w, I, { type: 'techevent.attend', eventId: e.id });
    expect(r.result.dealflow).toBeUndefined();
    expect(eventEntries(r.world)).toEqual([]);
    expect(r.world.players[I]!.dealflow).toBeUndefined();
    expect(playerView(r.world, I)!.investorDealFlow).toBeNull();
    // The plan is ignored: the old panel decides.
    const plan = coherentPlan(w);
    const raised = tryRun(withRecord(r.world, plan.size), I, {
      type: 'fund.raise',
      sectors: ['fintech'],
      stages: ['pre-seed'],
      checkSize: plan.avgCheque,
      why: 'Pre-seed fintech for market traders in Lagos',
      plan: {
        geography: 'city',
        size: plan.size,
        avgCheque: plan.avgCheque,
        companies: plan.companies,
        reserveRatio: 0.5,
        targetOwnership: 0.06,
        feeRate: 0.02,
        carry: 0.2,
      },
    });
    expect(raised.ok).toBe(true);
    if (raised.ok) {
      expect((raised.result as { review?: unknown }).review).toBeUndefined();
      expect(raised.world.players[I]!.dealflow).toBeUndefined();
    }
  });
});
