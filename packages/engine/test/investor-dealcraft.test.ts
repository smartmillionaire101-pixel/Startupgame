import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { INVESTOR } from '../src/data/investor.js';
import { nextStage } from '../src/helpers.js';
import { valueCompany } from '../src/valuation.js';
import { playerView } from '../src/views.js';
import type { Company, World } from '../src/types.js';
import { addFounder, addInvestor, careerWorld, companyOf, run, settle, tryRun } from './helpers.js';

const I = 'u_investor';
const F = 'u_founder';

/** An investor past the first session and a human founder in Lagos. */
function world(seed = 71): World {
  let w = addFounder(addInvestor(careerWorld(seed)));
  w = run(w, I, { type: 'investor.tutorial', action: 'skip' }).world;
  return w;
}

const dc = (w: World, id = I) => playerView(w, id)!.dealCraft!;
const aiCompany = (w: World, pred: (c: Company) => boolean = () => true) =>
  Object.values(w.companies).find(
    (c) =>
      c.ai && c.market === 'lagos' && c.status === 'active' && !c.ipo && !c.lastRound && pred(c),
  )!;

describe('the pipeline (§6.2)', () => {
  it('moves with diligence and deals, and passing gives the founder a reason', () => {
    let w = world();
    const c = aiCompany(w);
    w = run(w, I, { type: 'pipeline.add', companyId: c.id, watch: true }).world;
    expect(dc(w).pipeline.find((x) => x.companyId === c.id)!.stage).toBe('screened');
    w = run(w, I, { type: 'invest.diligence', companyId: c.id, depth: 1 }).world;
    expect(dc(w).pipeline.find((x) => x.companyId === c.id)!.stage).toBe('first-call');
    w = run(w, I, { type: 'invest.diligence', companyId: c.id, depth: 2 }).world;
    const deep = dc(w).pipeline.find((x) => x.companyId === c.id)!;
    expect(deep.stage).toBe('deep');
    expect(Array.isArray(deep.redFlags)).toBe(true);
    // A human founder pitches; the investor passes with a reason in the month.
    const fc = companyOf(w, F);
    w = run(w, F, {
      type: 'pitch.start',
      companyId: fc.id,
      investorId: I,
      slides: ['problem', 'product', 'team'],
      ask: 1_000_000_00,
    }).world;
    expect(dc(w).pitchesToMe).toHaveLength(1);
    const trust0 = w.players[I]!.investor!.founderTrust;
    w = run(w, I, { type: 'pipeline.pass', companyId: fc.id, reason: 'traction' }).world;
    expect(w.players[I]!.investor!.founderTrust).toBeCloseTo(
      trust0 + INVESTOR.reputation.passWithReason,
      5,
    );
    expect((w.inbox[F] ?? []).some((x) => x.text.includes('passed on'))).toBe(true);
    // Answered in time: no ghosting at month end.
    w = settle(w, 'lagos', 1);
    expect(w.players[I]!.investor!.founderTrust).toBeGreaterThanOrEqual(trust0);
  });

  it('ghosting a pitch past its month costs founder trust', () => {
    let w = world(72);
    const fc = companyOf(w, F);
    w = run(w, F, {
      type: 'pitch.start',
      companyId: fc.id,
      investorId: I,
      slides: ['problem', 'product', 'team'],
      ask: 1_000_000_00,
    }).world;
    const trust0 = w.players[I]!.investor!.founderTrust;
    w = settle(w, 'lagos', 1);
    expect(w.players[I]!.investor!.founderTrust).toBeCloseTo(
      trust0 - INVESTOR.penalties.ghostTrust,
      5,
    );
    // Counted once.
    w = settle(w, 'lagos', 1);
    expect(w.players[I]!.investor!.founderTrust).toBeGreaterThan(
      trust0 - 2 * INVESTOR.penalties.ghostTrust,
    );
  });

  it('founders pitch investors with a good reputation more often (FR-I-023)', () => {
    const inbound = (trust: number, stars: number) => {
      let w = produce(world(73), (d) => {
        d.players[I]!.investor!.founderTrust = trust;
        d.players[I]!.stars.value = stars;
      });
      w = settle(w, 'lagos', 6);
      return dc(w).pipeline.filter((x) => x.source === 'pitch').length;
    };
    expect(inbound(1, 4.5)).toBeGreaterThan(inbound(0, 0.5));
  });

  it('scouting finds companies that fit the thesis and aren’t raising yet', () => {
    let w = world(74);
    const r = run(w, I, { type: 'invest.scout' });
    w = r.world;
    expect(r.result.found.length).toBeGreaterThan(0);
    expect(dc(w).pipeline.filter((x) => x.source === 'scouting').length).toBe(
      r.result.found.length,
    );
  });
});

describe('diligence: claims, references, red flags (§6.3)', () => {
  it('checks a pitch claim against the truth', () => {
    let w = world(75);
    const c = aiCompany(w);
    w = produce(w, (d) => {
      d.pitches.p_test = {
        id: 'p_test',
        companyId: c.id,
        founderId: c.founderIds[0]!,
        fundId: null,
        investorPlayerId: null,
        slides: ['traction'],
        status: 'passed',
        questions: [
          {
            id: 'customers',
            text: 'How many paying customers?',
            options: [
              { id: 'honest', label: '40', claim: 40, truth: 40, tone: 'honest' },
              { id: 'spin', label: '100', claim: 100, truth: 40, tone: 'spin' },
            ],
          },
        ],
        answers: { customers: 'spin' },
        reason: '',
        month: 0,
        dealId: null,
        ask: 0,
      };
    });
    const early = tryRun(w, I, {
      type: 'diligence.claim',
      companyId: c.id,
      questionId: 'customers',
    });
    expect(early.ok).toBe(false);
    w = run(w, I, { type: 'invest.diligence', companyId: c.id, depth: 1 }).world;
    const r = run(w, I, { type: 'diligence.claim', companyId: c.id, questionId: 'customers' });
    expect(r.result.result).toBe('false');
    expect(dc(r.world).pipeline.find((x) => x.companyId === c.id)!.claims[0]!.result).toBe('false');
  });

  it('reference calls return team and customer signals', () => {
    const w = world(76);
    const c = aiCompany(w);
    const r = run(w, I, { type: 'diligence.references', companyId: c.id });
    expect(r.result.signals.length).toBeGreaterThan(0);
    expect(dc(r.world).pipeline.find((x) => x.companyId === c.id)!.references).not.toBeNull();
  });
});

describe('terms, support, hot rounds and reviews (§6.4–6.6)', () => {
  it('fair terms build founder trust; a veto on sale costs it', () => {
    let w = world(77);
    const c = aiCompany(w);
    const model = valueCompany(w, c, nextStage(c.lastRound)).value;
    const cap = playerView(w, I)!.investorCareer!.ceiling.maxCheque;
    const amount = Math.min(cap, Math.round(model * 0.05));
    const trust0 = w.players[I]!.investor!.founderTrust;
    const r = run(w, I, {
      type: 'invest.propose',
      companyId: c.id,
      instrument: 'safe',
      amount,
      valuation: model + amount,
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
    });
    w = r.world;
    if (r.result.status === 'accepted')
      expect(w.players[I]!.investor!.founderTrust).toBeCloseTo(
        trust0 + INVESTOR.reputation.fairTerms,
        5,
      );
    // Support: an intro once a month.
    if (r.result.status === 'accepted') {
      w = run(w, I, { type: 'invest.support', companyId: c.id, kind: 'investors' }).world;
      const again = tryRun(w, I, { type: 'invest.support', companyId: c.id, kind: 'hires' });
      expect(again.ok).toBe(false);
    }
  });

  it('a hot round picks the best offer at month end and tells the others why', () => {
    let w = addInvestor(world(78), 'u_rival');
    w = run(w, 'u_rival', { type: 'investor.tutorial', action: 'skip' }).world;
    const c0 = aiCompany(w);
    w = produce(w, (d) => {
      const c = d.companies[c0.id]!;
      c.stars.value = 4;
      c.raising = true;
    });
    const c = w.companies[c0.id]!;
    const model = valueCompany(w, c, nextStage(c.lastRound)).value;
    const cap = Math.min(
      playerView(w, I)!.investorCareer!.ceiling.maxCheque,
      playerView(w, 'u_rival')!.investorCareer!.ceiling.maxCheque,
    );
    const amount = Math.min(cap, Math.round(model * 0.05));
    const low = run(w, I, {
      type: 'invest.propose',
      companyId: c.id,
      instrument: 'safe',
      amount,
      valuation: Math.round(model * 0.95) + amount,
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
    });
    expect(low.result.status).toBe('open');
    w = low.world;
    const high = run(w, 'u_rival', {
      type: 'invest.propose',
      companyId: c.id,
      instrument: 'safe',
      amount,
      valuation: Math.round(model * 1.3) + amount,
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
    });
    w = settle(high.world, 'lagos', 1);
    expect(w.deals[high.result.dealId]!.status).toBe('accepted');
    expect(w.deals[low.result.dealId]!.status).toBe('declined');
    expect((w.inbox[I] ?? []).some((x) => x.text.includes('better price'))).toBe(true);
  });

  it('founders review investors who backed them, once, checked against the deals', () => {
    let w = world(79);
    const fc = companyOf(w, F);
    const no = tryRun(w, F, {
      type: 'review.investor',
      investorId: I,
      companyId: fc.id,
      rating: 5,
      text: 'Great',
    });
    expect(no.ok).toBe(false);
    w = produce(w, (d) => {
      d.positions[`${I}:${fc.id}`] = {
        investorId: I,
        companyId: fc.id,
        invested: 1_000_00,
        returned: 0,
        month: 0,
        writtenOff: false,
      };
    });
    const trust0 = w.players[I]!.investor!.founderTrust;
    w = run(w, F, {
      type: 'review.investor',
      investorId: I,
      companyId: fc.id,
      rating: 5,
      text: 'Fast and fair.',
    }).world;
    expect(w.players[I]!.investor!.founderTrust).toBeCloseTo(trust0 + 0.04, 5);
    expect(dc(w).reputation.reviews.average).toBe(5);
    const twice = tryRun(w, F, {
      type: 'review.investor',
      investorId: I,
      companyId: fc.id,
      rating: 1,
      text: 'x',
    });
    expect(twice.ok).toBe(false);
  });

  it('the monthly recap lists decisions, risks and new pitches', () => {
    let w = world(80);
    w = settle(w, 'lagos', 1);
    const r = dc(w).recap;
    expect(r).toHaveProperty('decisions');
    expect(r).toHaveProperty('atRisk');
    expect(typeof r.newPitches).toBe('number');
  });
});

describe('comparing offers side by side (human founders, §6.4)', () => {
  it('shows two offers together and choosing one declines the other with a reason', () => {
    let w = addInvestor(world(78), 'u_inv2');
    w = run(w, 'u_inv2', { type: 'investor.tutorial', action: 'skip' }).world;
    const fc = companyOf(w, F);
    const offer = (id: string, valuation: number, vetoOnSale: boolean) =>
      run(w, id, {
        type: 'invest.propose',
        companyId: fc.id,
        instrument: 'safe',
        amount: 1_000_000_00,
        valuation,
        proRata: true,
        boardSeat: false,
        vetoOnSale,
      });
    let r = offer(I, 20_000_000_00, false);
    w = r.world;
    const cheap = r.result.dealId as string;
    r = offer('u_inv2', 15_000_000_00, true);
    w = r.world;
    const low = r.result.dealId as string;
    const cmp = playerView(w, F)!.offerComparison;
    expect(cmp).toHaveLength(1);
    expect(cmp[0]!.offers).toHaveLength(2);
    const a = cmp[0]!.offers.find((x) => x.dealId === cheap)!;
    const b = cmp[0]!.offers.find((x) => x.dealId === low)!;
    expect(a.ownership).toBeCloseTo(0.05, 4);
    expect(b.ownership).toBeGreaterThan(a.ownership);
    expect(cmp[0]!.bestDealId).toBe(cheap);
    // Investors don't see it; only one offer is no comparison.
    expect(playerView(w, I)!.offerComparison).toHaveLength(0);
    expect(tryRun(w, I, { type: 'deal.choose', dealId: cheap }).ok).toBe(false);
    const res = run(w, F, { type: 'deal.choose', dealId: cheap });
    w = res.world;
    expect(w.deals[cheap]!.status).toBe('accepted');
    expect(w.deals[low]!.status).toBe('declined');
    expect(w.deals[low]!.history.at(-1)!.summary).toContain('better price');
    expect((w.inbox.u_inv2 ?? []).some((x) => x.text.includes('chose another offer'))).toBe(true);
    expect(playerView(w, F)!.offerComparison).toHaveLength(0);
  });
});
