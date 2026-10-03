import { describe, expect, it } from 'vitest';
import { playerView } from '../src/views.js';
import {
  addFounder,
  addInvestor,
  companyOf,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
  T0,
} from './helpers.js';

describe('onboarding (§3)', () => {
  it('creates a founder with a company, savings scaled to cost of living, and a first-day win', () => {
    const w = addFounder(makeWorld());
    const p = w.players.u_founder!;
    const c = companyOf(w, 'u_founder');
    expect(c.name).toBe('Paylink');
    expect(w.accounts[p.accounts.local]!.balance).toBeGreaterThan(0);
    const inbox = w.inbox.u_founder!;
    expect(inbox.some((i) => i.kind === 'lead')).toBe(true);
    expect(inbox.some((i) => i.kind === 'meeting')).toBe(true);
    expect(inbox.some((i) => i.kind === 'reporter')).toBe(true);
    expect(Object.values(c.segments)[0]!.paying).toBe(1);
  });

  it('gives every market the same months of personal runway', () => {
    let w = makeWorld();
    w = addInvestor(w, 'u_a', 'lagos');
    w = addInvestor(w, 'u_b', 'london');
    const months = (id: string) => {
      const p = w.players[id]!;
      return w.accounts[p.accounts.local]!.balance / (w.markets[p.market].data.costOfLiving * 100);
    };
    expect(months('u_a')).toBeCloseTo(months('u_b'), 5);
  });

  it('rejects duplicate handles, brand names and banker role for now', () => {
    let w = addFounder(makeWorld());
    const dup = tryRun(w, 'u_2', {
      type: 'player.create',
      handle: 'h_u_founder',
      name: 'X',
      role: 'investor',
      backgroundId: 'i-first',
      market: 'lagos',
      investor: { sectors: ['fintech'], stages: ['seed'], checkSize: 100 },
    });
    expect(dup.ok).toBe(false);
    const brand = tryRun(w, 'u_3', {
      type: 'player.create',
      handle: 'h_u_3',
      name: 'X',
      role: 'founder',
      backgroundId: 'f-dropout',
      market: 'lagos',
      company: {
        name: 'Flutterwav',
        industry: 'fintech',
        revenueModel: 'subscription',
        idea: 'payments again',
        incorporation: 'local',
      },
    });
    expect(brand.ok).toBe(false);
    if (!brand.ok) expect(brand.error.message).toMatch(/brand/);
    const banker = tryRun(w, 'u_4', {
      type: 'player.create',
      handle: 'h_u_4',
      name: 'X',
      role: 'banker',
      backgroundId: 'b-regulator',
      market: 'lagos',
    });
    expect(banker.ok).toBe(false);
    w = addInvestor(w, 'u_5');
    expect(w.players.u_5).toBeDefined();
  });
});

describe('dispatcher', () => {
  it('rolls back completely when a rule is broken', () => {
    const w = addFounder(makeWorld());
    const c = companyOf(w, 'u_founder');
    const r = tryRun(w, 'u_founder', { type: 'company.build', companyId: c.id, hours: 160 });
    expect(r.ok).toBe(true);
    const r2 = tryRun(r.world, 'u_founder', { type: 'company.build', companyId: c.id, hours: 160 });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe('hours.short');
    expect(r2.world).toBe(r.world);
  });

  it('refuses system commands from players and player commands from the system', () => {
    const w = addFounder(makeWorld());
    expect(
      tryRun(w, 'u_founder', { type: 'market.settle', market: 'lagos', date: '2030-01-01' }).ok,
    ).toBe(false);
    expect(tryRun(w, null, { type: 'player.gig' }).ok).toBe(false);
  });

  it('refuses to act on someone else’s company', () => {
    let w = addFounder(makeWorld());
    w = addFounder(w, 'u_other', 'lagos', 'Otherco');
    const c = companyOf(w, 'u_founder');
    expect(tryRun(w, 'u_other', { type: 'company.strategy', companyId: c.id, price: 1 }).ok).toBe(
      false,
    );
  });

  it('does not settle the same date twice', () => {
    const w = settle(addFounder(makeWorld()), 'lagos', 1);
    const again = tryRun(w, null, {
      type: 'market.settle',
      market: 'lagos',
      date: w.markets.lagos.lastSettledDate!,
    });
    expect(again.ok).toBe(false);
  });
});

describe('a founder’s first year', () => {
  function playYear() {
    let w = addFounder(makeWorld(7));
    const c = companyOf(w, 'u_founder');
    const seg = c.targetSegments[0]!;
    w = run(w, 'u_founder', { type: 'company.discovery', companyId: c.id, segmentKey: seg }).world;
    w = run(w, 'u_founder', {
      type: 'company.strategy',
      companyId: c.id,
      marketingBudget: 30_000_00,
      buildMode: 'balanced',
    }).world;
    w = run(w, 'u_founder', { type: 'company.build', companyId: c.id, hours: 100 }).world;
    const before = moneyByCurrency(w);
    w = settle(w, 'lagos', 12);
    return { w, before, cid: c.id };
  }

  it('conserves money in every currency and never overdraws a real account', () => {
    const { w, before } = playYear();
    expect(moneyByCurrency(w)).toEqual(before);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });

  it('wins customers without exceeding the segment’s real buyers', () => {
    const { w, cid } = playYear();
    const c = w.companies[cid]!;
    for (const [key, pos] of Object.entries(c.segments)) {
      const seg = w.markets.lagos.segments[key]!;
      const allPaying = Object.values(w.companies).reduce(
        (a, x) => a + (x.segments[key]?.paying ?? 0),
        0,
      );
      expect(allPaying + seg.incumbentCustomers).toBeLessThanOrEqual(seg.buyers);
      expect(pos.paying).toBeGreaterThanOrEqual(0);
    }
    expect(c.finance.history).toHaveLength(12);
  });

  it('is fully deterministic: same seed and commands, same world', () => {
    const a = playYear().w;
    const b = playYear().w;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('keeps stars within 0–5 for everyone', () => {
    const { w } = playYear();
    for (const p of Object.values(w.players)) {
      expect(p.stars.value).toBeGreaterThanOrEqual(0);
      expect(p.stars.value).toBeLessThanOrEqual(5);
    }
  });
});

describe('hiring (§5)', () => {
  it('a strong offer is accepted; a lowball is declined with a one-line reason', () => {
    let w = addFounder(makeWorld(3));
    const c = companyOf(w, 'u_founder');
    const cand = w.markets.lagos.talent.find((t) => t.seniority === 'junior')!;
    const low = run(w, 'u_founder', {
      type: 'company.offer',
      companyId: c.id,
      candidateId: cand.id,
      salary: Math.round(cand.ask * 0.5),
      equityBps: 0,
    });
    expect(low.result.outcome).toBe('decline');
    expect(low.result.reason.length).toBeGreaterThan(5);
    w = low.world;
    const other = w.markets.lagos.talent.find((t) => t.seniority === 'junior' && t.id !== cand.id)!;
    const good = run(w, 'u_founder', {
      type: 'company.offer',
      companyId: c.id,
      candidateId: other.id,
      salary: Math.round(other.ask * 1.5),
      equityBps: 50,
    });
    expect(good.result.outcome).toBe('accept');
    expect(good.world.companies[c.id]!.staff).toHaveLength(1);
  });
});

describe('fundraising (§9)', () => {
  function pitchReady(seed: number) {
    let w = addFounder(makeWorld(seed));
    const c = companyOf(w, 'u_founder');
    const fund = Object.values(w.funds).find(
      (f) =>
        f.market === 'lagos' &&
        f.stages.includes('pre-seed') &&
        (f.sectors === 'any' || f.sectors.includes('fintech')) &&
        f.minStars <= 0.5,
    )!;
    return { w, c, fund };
  }

  it('honest answers can earn a term sheet; accepting moves money and updates the cap table', () => {
    for (let seed = 1; seed < 40; seed++) {
      const { w, c, fund } = pitchReady(seed);
      const ask = fund.check[0];
      const s = run(w, 'u_founder', {
        type: 'pitch.start',
        companyId: c.id,
        fundId: fund.id,
        slides: ['problem', 'product', 'team'],
        ask,
      });
      if (s.result.status !== 'questions') continue;
      const pitch = s.world.pitches[s.result.pitchId]!;
      const answers = Object.fromEntries(pitch.questions.map((q) => [q.id, 'honest']));
      const a = run(s.world, 'u_founder', { type: 'pitch.answer', pitchId: pitch.id, answers });
      if (a.result.status !== 'term-sheet') continue;
      const deal = a.world.deals[a.result.dealId]!;
      expect(deal.summary).toMatch(/puts in|gets/);
      const cashBefore = a.world.accounts[c.account]!.balance;
      const acc = run(a.world, 'u_founder', {
        type: 'deal.act',
        dealId: deal.id,
        action: 'accept',
      });
      const after = acc.world.companies[c.id]!;
      expect(acc.world.accounts[c.account]!.balance - cashBefore).toBe(
        deal.terms.kind === 'investment' ? deal.terms.amount : 0,
      );
      expect(after.lastRound).toBe('pre-seed');
      expect(after.capTable.safes.length + after.capTable.preferences.length).toBeGreaterThan(0);
      expect(acc.world.players.u_founder!.milestones['founder.first-raise']).toBeDefined();
      return;
    }
    throw new Error('No seed produced a term sheet; fundraising is mis-tuned.');
  });

  it('spin is usually caught in diligence', () => {
    let caught = 0;
    let tried = 0;
    for (let seed = 1; seed < 30; seed++) {
      const { w, c, fund } = pitchReady(seed);
      const s = run(w, 'u_founder', {
        type: 'pitch.start',
        companyId: c.id,
        fundId: fund.id,
        slides: ['traction'],
        ask: fund.check[0],
      });
      if (s.result.status !== 'questions') continue;
      const pitch = s.world.pitches[s.result.pitchId]!;
      const answers = Object.fromEntries(
        pitch.questions.map((q) => [
          q.id,
          q.options.some((o) => o.id === 'spin') ? 'spin' : q.options[0]!.id,
        ]),
      );
      const a = run(s.world, 'u_founder', { type: 'pitch.answer', pitchId: pitch.id, answers });
      tried++;
      if (/didn’t match/.test(a.result.reason)) caught++;
    }
    expect(tried).toBeGreaterThan(5);
    expect(caught / tried).toBeGreaterThan(0.6);
  });

  it('never shows players the truth behind pitch options or AI negotiation limits', () => {
    const { w, c, fund } = pitchReady(5);
    const s = run(w, 'u_founder', {
      type: 'pitch.start',
      companyId: c.id,
      fundId: fund.id,
      slides: ['product'],
      ask: fund.check[0],
    });
    const view = JSON.stringify(playerView(s.world, 'u_founder'));
    expect(view).not.toContain('"truth"');
    expect(view).not.toContain('aiLimit');
  });

  it('an investor player can back an AI startup that accepts fair terms', () => {
    let w = addInvestor(makeWorld(11));
    const target = Object.values(w.companies).find(
      (c) => c.ai && c.market === 'lagos' && c.status === 'active',
    )!;
    w = run(w, 'u_investor', { type: 'invest.diligence', companyId: target.id, depth: 1 }).world;
    const view = playerView(w, 'u_investor')!;
    const d = view.directory.find((x) => x.id === target.id)!.diligence!;
    const savings = w.accounts[w.players.u_investor!.accounts.local]!.balance;
    const amount = Math.min(Math.round(d.modelValuation * 0.05), Math.round(savings * 0.5));
    const r = run(w, 'u_investor', {
      type: 'invest.propose',
      companyId: target.id,
      instrument: 'safe',
      amount,
      valuation: Math.round(d.modelValuation * 1.1),
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
    });
    expect(r.result.status).toBe('accepted');
    expect(r.world.positions[`u_investor:${target.id}`]?.invested).toBe(amount);
    expect(r.world.players.u_investor!.milestones['investor.first-check']).toBeDefined();
  });
});

describe('media and fact-checking (§10)', () => {
  it('blocks clearly false claims unless the player insists, and insisting costs stars', () => {
    let w = addFounder(makeWorld(9));
    const c = companyOf(w, 'u_founder');
    w = settle(w, 'lagos', 2);
    const outlet = w.markets.lagos.outlets.find((o) => o.type === 'regional')!;
    // Force acceptance by retrying outlets until a reporter bites.
    let inviteId: string | undefined;
    for (const o of [outlet, ...w.markets.lagos.outlets]) {
      const r = tryRun(
        w,
        'u_founder',
        { type: 'media.pitch', outletId: o.id, companyId: c.id },
        T0 + 3 * 86_400_000,
      );
      if (r.ok) {
        w = r.world;
        if ((r.result as { accepted: boolean; inviteId?: string }).accepted) {
          inviteId = (r.result as { inviteId: string }).inviteId;
          break;
        }
      }
    }
    expect(inviteId).toBeDefined();
    const inv = w.media[inviteId!]!;
    w = run(w, 'u_founder', {
      type: 'media.accept',
      inviteId: inv.id,
      angle: inv.angles[0]!,
    }).world;
    const qs = w.media[inv.id]!.questions;
    const answers = Object.fromEntries(
      qs.map((q) => [
        q.id,
        q.options.some((o) => o.id === 'inflate') ? 'inflate' : q.options[0]!.id,
      ]),
    );
    w = run(w, 'u_founder', { type: 'media.answer', inviteId: inv.id, answers }).world;
    expect(w.media[inv.id]!.checks.some((x) => x.result === 'false')).toBe(true);
    const blocked = tryRun(w, 'u_founder', {
      type: 'media.publish',
      inviteId: inv.id,
      insist: false,
    });
    expect(blocked.ok).toBe(false);
    const starsBefore = w.companies[c.id]!.stars.value;
    const pub = run(w, 'u_founder', { type: 'media.publish', inviteId: inv.id, insist: true });
    expect(pub.result.starDelta).toBeLessThan(0);
    expect(pub.world.companies[c.id]!.stars.value).toBeLessThan(starsBefore);
    const item = pub.world.markets.lagos.news.find((n) => n.id === pub.result.newsId)!;
    expect(item.body.split(/\s+/).length).toBeLessThanOrEqual(61);
    expect(item.alert.split(/\s+/).length).toBeLessThanOrEqual(13);
  });
});

describe('failure and the floor (§13)', () => {
  it('an orderly shutdown pays staff first and keeps the founder’s reputation mostly intact', () => {
    let w = addFounder(makeWorld(4));
    const c = companyOf(w, 'u_founder');
    w = run(w, 'u_founder', { type: 'company.shutdown', companyId: c.id }).world;
    expect(w.companies[c.id]!.status).toBe('shutdown');
    expect(w.accounts[c.account]!.balance).toBe(0);
    expect(w.players.u_founder!.failures).toBe(1);
    expect(w.markets.lagos.news[0]!.kind).toBe('public-record');
    // Comeback: found again.
    const again = run(w, 'u_founder', {
      type: 'company.found',
      company: {
        name: 'Second Wind',
        industry: 'saas',
        revenueModel: 'subscription',
        idea: 'Tools for shops',
        incorporation: 'local',
      },
    });
    expect(again.world.players.u_founder!.milestones['any.comeback']).toBeDefined();
  });

  it('anyone can take a freelance gig, at most twice a month', () => {
    let w = addInvestor(makeWorld());
    w = run(w, 'u_investor', { type: 'player.gig' }).world;
    w = run(w, 'u_investor', { type: 'player.gig' }).world;
    expect(tryRun(w, 'u_investor', { type: 'player.gig' }).ok).toBe(false);
  });

  it('dollar accounts convert at the official rate minus a fee', () => {
    let w = addInvestor(makeWorld());
    w = run(w, 'u_investor', { type: 'player.usdOpen' }).world;
    const r = run(w, 'u_investor', {
      type: 'player.convert',
      direction: 'toUsd',
      amount: 1_530_000_00,
    });
    // ₦1.53m at 1530/USD = $1,000, minus a 1.5% fee.
    expect(r.result.received).toBe(98_500);
  });
});

describe('market data feeds (§17)', () => {
  it('a devaluation is announced and raises dollar costs in local terms', () => {
    let w = addFounder(makeWorld());
    const r = run(w, null, { type: 'market.data', market: 'lagos', unitsPerUsd: 1700 });
    expect(r.result.alerts[0]).toMatch(/NGN weakens 11%/);
    w = r.world;
    expect(w.markets.lagos.news[0]!.kind).toBe('market');
  });
});
