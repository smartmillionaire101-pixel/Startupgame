import { describe, expect, it } from 'vitest';
import { INVESTOR } from '../src/data/investor.js';
import { INVESTOR_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import { missingEmployers } from '../src/work.js';
import { produce } from 'immer';
import type { World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  careerWorld,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
} from './helpers.js';

const careerOf = (w: World, id = 'u_investor') => playerView(w, id)!.investorCareer!;

/** Walk the first session up to the term sheet and send the suggested SAFE. */
function firstCheque(w: World, id = 'u_investor') {
  w = run(w, id, { type: 'investor.tutorial', action: 'next' }).world;
  const pick = careerOf(w, id).tutorial!.picks[0]!;
  w = run(w, id, {
    type: 'investor.tutorial',
    action: 'shortlist',
    companyId: pick.companyId,
  }).world;
  w = run(w, id, { type: 'invest.diligence', companyId: pick.companyId, depth: 1 }).world;
  const r = run(w, id, {
    type: 'invest.propose',
    companyId: pick.companyId,
    instrument: 'safe',
    amount: pick.suggestedAmount,
    valuation: pick.suggestedCap,
    proRata: true,
    boardSeat: false,
    vetoOnSale: false,
  });
  return { world: r.world, result: r.result, pick };
}

describe('investor career: release note', () => {
  it('changes nothing in worlds without the note', () => {
    const w = addInvestor(makeWorld(7, ['lagos']));
    expect(w.players.u_investor!.career).toBeUndefined();
    expect(playerView(w, 'u_investor')!.investorCareer).toBeNull();
  });
});

describe('investor career: first session (§3)', () => {
  it('starts with the profile done, three café startups raising and a capped cheque', () => {
    const w = addInvestor(careerWorld());
    const c = careerOf(w);
    const t = c.tutorial!;
    expect(t.step).toBe('investable');
    expect(t.picks).toHaveLength(3);
    for (const p of t.picks) {
      expect(w.companies[p.companyId]!.raising).toBe(true);
      expect(p.suggestedAmount).toBeGreaterThan(0);
      expect(p.suggestedAmount).toBeLessThanOrEqual(t.chequeCap);
    }
    // Thesis-fitting startups come first.
    expect(t.picks[0]!.fits).toBe(true);
    expect(t.investable).toBe(Math.max(0, t.liquid - INVESTOR.caps.reserveMonths * t.livingCost));
    expect(t.chequeCap).toBe(Math.floor(t.investable * INVESTOR.caps.tutorialCheque));
    expect(c.current).toBe(1);
    expect(c.next).toBe(2);
  });

  it('teaches deal flow, diligence and a SAFE, then the portfolio and the ladder', () => {
    let w = addInvestor(careerWorld());
    const before = moneyByCurrency(w);
    const out = firstCheque(w);
    w = out.world;
    expect(out.result.status).toBe('accepted');
    expect(careerOf(w).tutorial!.step).toBe('portfolio');
    // Out-of-order steps are refused with the next step to do.
    w = run(w, 'u_investor', { type: 'investor.tutorial', action: 'next' }).world;
    expect(careerOf(w).tutorial!.step).toBe('ladder');
    w = run(w, 'u_investor', { type: 'investor.tutorial', action: 'next' }).world;
    const c = careerOf(w);
    expect(c.tutorial!.done).toBe(true);
    expect(c.tutorial!.step).toBeNull();
    expect(c.pinned).toBe(2);
    expect(w.players.u_investor!.milestones['investor.first-session']).toBeDefined();
    expect(w.players.u_investor!.milestones['investor.first-check']).toBeDefined();
    expect(c.prompts.main?.label).toMatch(/syndicate lead/);
    expect(c.prompts.opportunity).not.toBeNull();
    expect(c.prompts.personal).not.toBeNull();
    expect(moneyByCurrency(w)).toEqual(before);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });

  it('refuses steps out of order with what to do next', () => {
    let w = addInvestor(careerWorld());
    w = run(w, 'u_investor', { type: 'investor.tutorial', action: 'next' }).world;
    const r = tryRun(w, 'u_investor', { type: 'investor.tutorial', action: 'next' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/Pick one of the three/);
  });

  it('caps the tutorial cheque', () => {
    let w = addInvestor(careerWorld());
    w = run(w, 'u_investor', { type: 'investor.tutorial', action: 'next' }).world;
    const t = careerOf(w).tutorial!;
    const pick = t.picks[0]!;
    const r = tryRun(w, 'u_investor', {
      type: 'invest.propose',
      companyId: pick.companyId,
      instrument: 'safe',
      amount: t.chequeCap + 100_000,
      valuation: (t.chequeCap + 100_000) * 20,
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invest.cap');
      expect(r.error.message).toMatch(/first cheque is capped/);
    }
  });

  it('gives a reason and a way back when the founder walks away', () => {
    let w = addInvestor(careerWorld());
    w = run(w, 'u_investor', { type: 'investor.tutorial', action: 'next' }).world;
    const pick = careerOf(w).tutorial!.picks[0]!;
    w = run(w, 'u_investor', {
      type: 'investor.tutorial',
      action: 'shortlist',
      companyId: pick.companyId,
    }).world;
    w = run(w, 'u_investor', {
      type: 'invest.propose',
      companyId: pick.companyId,
      instrument: 'safe',
      amount: pick.suggestedAmount,
      // Far below what they'd take: they walk.
      valuation: Math.round(pick.suggestedAmount * 2),
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
    }).world;
    const rec = careerOf(w).tutorial!.recovery!;
    expect(rec.reason).toBe('price');
    expect(rec.second).not.toBe(pick.companyId);
    expect(careerOf(w).tutorial!.step).toBe('first-call');
  });

  it('skipping saves the profile and creates no position', () => {
    let w = addInvestor(careerWorld());
    w = run(w, 'u_investor', { type: 'investor.tutorial', action: 'skip' }).world;
    const t = careerOf(w).tutorial!;
    expect(t.skipped).toBe(true);
    expect(t.step).toBeNull();
    expect(Object.values(w.positions).filter((p) => p.investorId === 'u_investor')).toEqual([]);
    expect(w.players.u_investor!.investor).toBeTruthy();
  });

  it('a founder who switches gets the first session too', () => {
    let w = addFounder(careerWorld());
    w = run(w, 'u_founder', {
      type: 'player.becomeInvestor',
      investor: { sectors: ['saas'], stages: ['seed'], checkSize: 1_000_000_00 },
    }).world;
    expect(playerView(w, 'u_founder')!.investorCareer!.tutorial!.step).toBe('investable');
  });
});

describe('investor career: an older city', () => {
  it('still has café startups for a first session when every startup has grown', () => {
    const grown = produce(careerWorld(), (d) => {
      for (const c of Object.values(d.companies))
        if (c.market === 'lagos') c.lastRound = 'series-a';
    });
    const t = careerOf(addInvestor(grown)).tutorial!;
    expect(t.picks).toHaveLength(3);
  });

  it('opens missing employers when the server re-announces its note (an old preview world)', () => {
    const w0 = careerWorld();
    const employers = (w: World) =>
      Object.values(w.markets.lagos!.businesses ?? {}).filter((b) =>
        b.landmark?.startsWith('employer-'),
      ).length;
    expect(employers(w0)).toBeGreaterThan(0);
    const missing = produce(w0, (d) => {
      const bs = d.markets.lagos!.businesses!;
      for (const [id, b] of Object.entries(bs))
        if (b.landmark?.startsWith('employer-')) delete bs[id];
    });
    expect(employers(missing)).toBe(0);
    // The server's boot check: re-announce only while some are missing.
    expect(missingEmployers(missing)).toBe(true);
    expect(missingEmployers(w0)).toBe(false);
    // The server re-announces its note at boot: the city's employers open at once.
    const again = { type: 'system.announce', id: INVESTOR_NOTE, text: 'Update' } as const;
    expect(employers(run(missing, null, again).world)).toBe(employers(w0));
    // Where they exist, nothing new opens.
    expect(employers(run(w0, null, again).world)).toBe(employers(w0));
  });
});

describe('investor career: the angel ceiling (§2.3)', () => {
  function afterTutorial() {
    let w = addInvestor(careerWorld());
    w = run(w, 'u_investor', { type: 'investor.tutorial', action: 'skip' }).world;
    return w;
  }
  /** Run with the ceiling switched on (it is off by default: angels invest as before). */
  function withCeiling<T>(f: () => T): T {
    const caps = INVESTOR.caps as { angelCeiling: boolean };
    caps.angelCeiling = true;
    try {
      return f();
    } finally {
      caps.angelCeiling = false;
    }
  }
  const bigCheque = (w: World, amount: number) => {
    const target = Object.values(w.companies).find(
      (x) => x.ai && x.market === 'lagos' && x.status === 'active' && !x.lastRound,
    )!;
    return tryRun(w, 'u_investor', {
      type: 'invest.propose',
      companyId: target.id,
      instrument: 'safe',
      amount,
      valuation: amount * 10,
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
    });
  };
  const seriesA = (w0: World) => {
    const w = structuredClone(w0);
    const target = Object.values(w.companies).find(
      (x) => x.ai && x.market === 'lagos' && x.status === 'active',
    )!;
    target.lastRound = 'seed';
    return tryRun(w, 'u_investor', {
      type: 'invest.propose',
      companyId: target.id,
      instrument: 'priced',
      amount: 1_000_00,
      valuation: 1_000_000_00,
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
    });
  };

  it('is off by default: a cheque over a tenth of net worth and a lone Series A cheque go through', () => {
    const w = afterTutorial();
    const c = careerOf(w);
    expect(c.ceiling.on).toBe(false);
    const r = bigCheque(w, c.ceiling.maxCheque + 1);
    if (!r.ok) expect(r.error.code).not.toBe('invest.cap');
    const a = seriesA(w);
    if (!a.ok) expect(a.error.code).not.toBe('invest.lead');
  });

  it('switched on, caps one personal cheque at a tenth of liquid net worth', () => {
    const w = afterTutorial();
    const c = careerOf(w);
    expect(c.ceiling.maxCheque).toBe(Math.floor(c.ceiling.liquidNetWorth * 0.1));
    const r = withCeiling(() => bigCheque(w, c.ceiling.maxCheque + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invest.cap');
  });

  it('switched on, a Series A round needs a fund or syndicate lead', () => {
    const r = withCeiling(() => seriesA(afterTutorial()));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invest.lead');
      expect(r.error.message).toMatch(/needs a lead/);
    }
  });
});

describe('investor career: the ladder (§2.1)', () => {
  it('shows eight rungs, the next rung and its requirements', () => {
    const w = addInvestor(careerWorld());
    const c = careerOf(w);
    expect(c.rungs.map((r) => r.id)).toEqual([
      'angel',
      'syndicate',
      'emerging',
      'manager',
      'established',
      'firm',
      'allocator',
      'institution',
    ]);
    expect(c.rungs[0]!.status).toBe('reached');
    expect(c.rungs[1]!.status).toBe('next');
    expect(c.rungs[1]!.requirements.map((r) => r.id)).toEqual(['deals', 'stars']);
  });

  it('unlocks the next rung exactly once and sends one invitation', () => {
    let w = addInvestor(careerWorld());
    w = run(w, 'u_investor', { type: 'investor.tutorial', action: 'skip' }).world;
    w = structuredClone(w);
    w.players.u_investor!.stars.value = 2.5;
    // Two angel deals on record.
    const ids = Object.values(w.companies)
      .filter((c) => c.market === 'lagos' && c.status === 'active')
      .slice(0, 2)
      .map((c) => c.id);
    for (const cid of ids)
      w.positions[`u_investor:${cid}`] = {
        investorId: 'u_investor',
        companyId: cid,
        invested: 1_000_00,
        returned: 0,
        month: 0,
        writtenOff: false,
      };
    w = run(w, 'u_investor', { type: 'player.seen' }).world;
    let c = careerOf(w);
    expect(c.current).toBe(2);
    expect(w.players.u_investor!.milestones['investor.rung-2']).toBeDefined();
    expect(c.invitations).toHaveLength(1);
    expect(c.invitations[0]!.kind).toBe('co-lead');
    const inbox = () =>
      (w.inbox.u_investor ?? []).filter((i) => i.text.includes('syndicate lead')).length;
    expect(inbox()).toBe(1);
    // Another command doesn't record it again.
    w = settle(w, 'lagos', 1);
    expect(inbox()).toBe(1);
    w = run(w, 'u_investor', {
      type: 'career.invitation',
      invitationId: c.invitations[0]!.id,
      accept: true,
    }).world;
    c = careerOf(w);
    expect(c.coLead).not.toBeNull();
    expect(c.invitations).toHaveLength(0);
  });

  it('an anchor LP backs Fund I: a higher score and a bigger fund', () => {
    let w = addInvestor(careerWorld());
    w = run(w, 'u_investor', { type: 'investor.tutorial', action: 'skip' }).world;
    w = structuredClone(w);
    const p = w.players.u_investor!;
    p.stars.value = 3.5;
    const ids = Object.values(w.companies)
      .filter((c) => c.market === 'lagos' && c.status === 'active')
      .slice(0, 4)
      .map((c) => c.id);
    for (const cid of ids)
      w.positions[`u_investor:${cid}`] = {
        investorId: 'u_investor',
        companyId: cid,
        invested: 1_000_00,
        returned: 2_000_00,
        month: 0,
        writtenOff: false,
      };
    w = run(w, 'u_investor', { type: 'player.seen' }).world;
    const inv = careerOf(w).invitations.find((x) => x.kind === 'anchor')!;
    expect(inv).toBeTruthy();
    expect(careerOf(w).current).toBe(3);
    w = run(w, 'u_investor', {
      type: 'career.invitation',
      invitationId: inv.id,
      accept: true,
    }).world;
    const before = moneyByCurrency(w);
    const r = run(w, 'u_investor', {
      type: 'fund.raise',
      sectors: ['fintech'],
      stages: ['seed'],
      checkSize: 5_000_000_00,
      why: 'Payments rails for traders across Lagos',
    });
    expect(r.result.ok).toBe(true);
    const fund = r.world.funds[r.result.fund.id]!;
    expect(r.world.accounts[fund.account]!.balance).toBe(fund.size);
    expect(fund.size).toBeGreaterThan(inv.amount);
    expect(r.world.players.u_investor!.career!.anchor).toBeUndefined();
    expect(moneyByCurrency(r.world)).toEqual(before);
    // Fund I closed: rung 4 next time the career is recorded.
    expect(careerOf(r.world).current).toBe(4);
  });
});

describe('investor career: the release switch', () => {
  it('comes after every earlier note and turns them on', async () => {
    const r = await import('../src/releases.js');
    expect(r.RELEASES.indexOf(INVESTOR_NOTE)).toBeGreaterThan(r.RELEASES.indexOf(r.JOBS_NOTE));
    const w = { announcements: [INVESTOR_NOTE] } as unknown as World;
    expect(r.investorOn(w)).toBe(true);
    expect(r.lifeBarsOn(w)).toBe(true);
    expect(r.exitsOn(w)).toBe(true);
    expect(r.investorOn({ announcements: [r.LIFE_BARS_NOTE] } as unknown as World)).toBe(false);
  });
});
