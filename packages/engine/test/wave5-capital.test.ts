import { describe, expect, it } from 'vitest';
import { activeAngels, angelTarget } from '../src/angels.js';
import { aiStartupTarget } from '../src/ai.js';
import { ACCELERATORS, DEV_PARTNERS, LPS } from '../src/data/programs.js';
import {
  acceleratorCount,
  acceleratorHolderId,
  aiGovernorName,
  angelsAt,
  demoDayFor,
  expectedAiGuests,
  lpCount,
} from '../src/programs.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  companyOf,
  DAY,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  T0,
  tryRun,
} from './helpers.js';

/** A founder whose company looks ready for an accelerator (tests may edit a clone). */
function strongFounder(seed: number, market: 'lagos' | 'london' = 'lagos'): World {
  const w = structuredClone(addFounder(makeWorld(seed, ['lagos', 'london']), 'u_founder', market));
  const c = companyOf(w, 'u_founder');
  c.product.fit = 0.8;
  c.product.discovery = { [c.targetSegments[0]!]: 0.8 };
  const seg = c.segments[c.targetSegments[0]!];
  if (seg) seg.paying = 40;
  w.players.u_founder!.stars.value = 4;
  c.stars.value = 3.5;
  return w;
}

const zero = (before: Record<string, number>, w: World) => {
  expect(moneyByCurrency(w)).toEqual(before);
  expect(negativeInternalAccounts(w)).toEqual([]);
};

describe('Wave 5 B: accelerators', () => {
  it('opens 1–3 accelerators per market by depth, with fictional names and stable ids', () => {
    expect(acceleratorCount('london')).toBe(3);
    expect(acceleratorCount('san-francisco')).toBe(3);
    expect(acceleratorCount('lagos')).toBe(2);
    expect(acceleratorCount('freetown')).toBe(1);
    expect(acceleratorCount('kigali')).toBe(1);
    for (const list of Object.values(ACCELERATORS)) {
      expect(new Set(list.map((a) => a.id)).size).toBe(list.length);
      for (const a of list) expect(a.equityBps).toBeLessThanOrEqual(1000);
    }
    const v = playerView(addFounder(makeWorld(1, ['lagos'])), 'u_founder')!;
    expect(v.here).toBeNull();
    expect(v.market.accelerators).toHaveLength(2);
    const a = v.market.accelerators[0]!;
    expect(a.name).toBe('Yaba Launchpad');
    expect(a.you[0]!.status).toBe('eligible');
    expect(a.cohort.demoDayMonth % 3).toBe(0);
  });

  it('accepts at settlement: cash for equity on a SAFE, stars, a mentor; demo day later', () => {
    let w = strongFounder(11);
    const total = moneyByCurrency(w);
    const cid = companyOf(w, 'u_founder').id;
    const cashBefore = w.accounts[companyOf(w, 'u_founder').account]!.balance;
    const r = run(w, 'u_founder', {
      type: 'accelerator.apply',
      acceleratorId: 'lagos-yaba-launchpad',
      companyId: cid,
    });
    w = r.world;
    expect(r.result.applicationId).toMatch(/^app:accelerator:/);
    expect(
      tryRun(w, 'u_founder', {
        type: 'accelerator.apply',
        acceleratorId: 'lagos-lekki-builders',
        companyId: cid,
      }).ok,
    ).toBe(false);
    w = settle(w, 'lagos', 1);
    const c = companyOf(w, 'u_founder');
    const app = Object.values(w.applications!)[0]!;
    expect(app.status).toBe('accepted');
    expect(c.accelerator?.name).toBe('Yaba Launchpad');
    expect(ACCELERATORS.lagos[0]!.mentors).toContain(c.accelerator!.mentor);
    expect(
      c.capTable.safes.some((s) => s.holderId === acceleratorHolderId('lagos-yaba-launchpad')),
    ).toBe(true);
    expect(w.accounts[c.account]!.balance).toBeGreaterThan(cashBefore - 1); // grew by the cheque minus a month's costs
    expect(w.inbox.u_founder!.some((i) => /Yaba Launchpad is in/.test(i.text))).toBe(true);
    zero(total, w);
    const v = playerView(w, 'u_founder')!;
    expect(v.market.accelerators[0]!.you[0]!.status).toBe('accepted');
    expect(v.market.accelerators[0]!.you[0]!.mentor).toBe(c.accelerator!.mentor);

    // Demo day at the cohort's end.
    const demo = c.accelerator!.demoDayMonth;
    expect(demo).toBe(demoDayFor(1));
    w = settle(w, 'lagos', demo - w.markets.lagos!.month, T0 + DAY);
    const after = companyOf(w, 'u_founder');
    expect(after.accelerator!.demoDayDone).toBe(true);
    expect(w.markets.lagos!.news.some((n) => /demo day/i.test(n.headline))).toBe(true);
    expect(playerView(w, 'u_founder')!.market.accelerators[0]!.you[0]!.status).toBe('alumni');
    zero(total, w);
  });

  it('says no with a reason, and checks eligibility up front', () => {
    let w = addFounder(makeWorld(12, ['lagos', 'london']));
    const cid = companyOf(w, 'u_founder').id;
    // Not in London: apply in person.
    const away = tryRun(w, 'u_founder', {
      type: 'accelerator.apply',
      acceleratorId: 'london-old-street',
      companyId: cid,
    });
    expect(away.ok).toBe(false);
    // A fintech can't join an agritech-only programme… Lekki takes fintech, so use Ikeja (not open in Lagos).
    expect(
      tryRun(w, 'u_founder', {
        type: 'accelerator.apply',
        acceleratorId: 'lagos-ikeja-garage',
        companyId: cid,
      }).ok,
    ).toBe(false);
    // Priced out of the market, no marketing: no customers this month.
    w = run(w, 'u_founder', {
      type: 'company.strategy',
      companyId: cid,
      price: 900_000_000_00,
      marketingBudget: 0,
    }).world;
    w = run(w, 'u_founder', {
      type: 'accelerator.apply',
      acceleratorId: 'lagos-yaba-launchpad',
      companyId: cid,
    }).world;
    w = settle(w, 'lagos', 1);
    const app = Object.values(w.applications!)[0]!;
    // A brand-new company with no customers: the answer names why.
    expect(app.status).toBe('rejected');
    expect(app.reason.length).toBeGreaterThan(5);
    expect(w.inbox.u_founder!.some((i) => /Yaba Launchpad said no/.test(i.text))).toBe(true);
  });
});

describe('Wave 5 B: development partners', () => {
  it('are generous in Freetown and scarce in London', () => {
    const programs = (m: keyof typeof DEV_PARTNERS) =>
      DEV_PARTNERS[m].reduce((a, p) => a + p.programs.length, 0);
    expect(programs('freetown')).toBeGreaterThan(programs('london'));
    expect(programs('lagos')).toBeGreaterThan(programs('san-francisco'));
    expect(programs('dubai')).toBe(1);
  });

  it('awards a non-dilutive grant in two tranches, the second after the report', () => {
    let w = strongFounder(21);
    const total = moneyByCurrency(w);
    const c0 = companyOf(w, 'u_founder');
    const v = playerView(w, 'u_founder')!;
    const youth = v.market.devPartners
      .flatMap((p) => p.programs.map((pr) => ({ p, pr })))
      .find((x) => x.pr.kind === 'youth-employment')!;
    expect(youth.pr.you[0]!.status).toBe('eligible');
    // Women-led programmes explain who they're for.
    const women = v.market.devPartners.flatMap((p) => p.programs).find((pr) => pr.womenLed)!;
    expect(women.you[0]!.status).toBe('ineligible');
    expect(women.you[0]!.reason).toMatch(/woman/);
    w = run(w, 'u_founder', {
      type: 'grant.apply',
      partnerId: youth.p.id,
      programId: youth.pr.id,
      companyId: c0.id,
    }).world;
    const capBefore = JSON.stringify(companyOf(w, 'u_founder').capTable);
    w = settle(w, 'lagos', 1);
    const app = Object.values(w.applications!)[0]!;
    expect(app.status).toBe('accepted');
    expect(app.grant!.paid).toBe(Math.round(app.grant!.total * 0.6));
    // Non-dilutive: the cap table is untouched.
    expect(JSON.stringify(companyOf(w, 'u_founder').capTable)).toBe(capBefore);
    // The condition (a hire) isn't met: the second tranche lapses at the report.
    w = settle(w, 'lagos', 3, T0 + DAY);
    const done = Object.values(w.applications!)[0]!;
    expect(done.grant!.reported).toBe('missed');
    expect(done.grant!.paid).toBeLessThan(done.grant!.total);
    zero(total, w);
  });
});

describe('Wave 5 B: investors, LPs and deal flow', () => {
  it('lists raising companies in the deal flow, and invest.quick backs one in one tap', () => {
    let w = addInvestor(addFounder(makeWorld(31, ['lagos'])), 'u_inv');
    w = settle(w, 'lagos', 2);
    const total = moneyByCurrency(w);
    const v = playerView(w, 'u_inv')!;
    expect(v.me.investorType).toBe('angel');
    expect(
      v.market.funds.every((f) => ['angel', 'vc', 'impact', 'corporate'].includes(f.type)),
    ).toBe(true);
    const deal = v.market.dealFlow.find((d) => d.ai && d.canInvest && d.maxCheck > 0);
    expect(deal).toBeTruthy();
    const amount = Math.min(deal!.maxCheck, 1_000_000_00);
    const r = run(w, 'u_inv', { type: 'invest.quick', companyId: deal!.companyId, amount });
    expect(r.result.status).toBe('accepted');
    w = r.world;
    expect(w.positions[`u_inv:${deal!.companyId}`]!.invested).toBe(amount);
    zero(total, w);
    // Too big a cheque is refused with the limit.
    const big = tryRun(w, 'u_inv', {
      type: 'invest.quick',
      companyId: deal!.companyId,
      amount: deal!.maxCheck * 2 + 1,
    });
    expect(big.ok).toBe(false);
    // Founders can't use the investor path.
    expect(
      tryRun(w, 'u_founder', { type: 'invest.quick', companyId: deal!.companyId, amount }).ok,
    ).toBe(false);
  });

  it('LPs commit to a player-run fund at settlement by track record', () => {
    let w = structuredClone(addInvestor(makeWorld(32, ['lagos']), 'u_inv'));
    // A fund this investor runs, as fund.raise would make it.
    const fund = structuredClone(Object.values(w.funds).find((f) => f.ai && !f.angelId)!);
    fund.id = 'fund_player';
    fund.ai = false;
    fund.managerId = 'u_inv';
    fund.name = 'Ike Capital Fund I';
    fund.account = Object.keys(w.accounts).find(
      (id) => w.accounts[id]!.label === 'Ike Investor personal',
    )!;
    w.funds[fund.id] = fund;
    w.players.u_inv!.investor!.fundId = fund.id;
    w.players.u_inv!.stars.value = 4.5;
    const real = Object.values(w.companies).slice(0, 4);
    for (const [i, rc] of real.entries())
      w.positions[`fund_player:${rc.id}`] = {
        investorId: 'fund_player',
        companyId: rc.id,
        invested: 100,
        returned: 300,
        month: i,
        writtenOff: false,
      };
    const total = moneyByCurrency(w);
    const v = playerView(w, 'u_inv')!;
    expect(v.market.lps).toHaveLength(lpCount('lagos'));
    const lp = v.market.lps.find((l) => l.you.canPitch && !l.you.reason)!;
    expect(lp).toBeTruthy();
    const sizeBefore = fund.size;
    w = run(w, 'u_inv', { type: 'lp.pitch', lpId: lp.id }).world;
    expect(tryRun(w, 'u_inv', { type: 'lp.pitch', lpId: lp.id }).ok).toBe(false);
    w = settle(w, 'lagos', 1);
    const app = Object.values(w.applications!)[0]!;
    expect(['accepted', 'rejected']).toContain(app.status);
    if (app.status === 'accepted') {
      expect(w.funds.fund_player!.size).toBe(sizeBefore + app.amount);
      expect(playerView(w, 'u_inv')!.market.lps.find((l) => l.id === lp.id)!.you.status).toBe(
        'committed',
      );
    }
    zero(total, w);
    // Without a fund: no pitching.
    const w2 = addFounder(makeWorld(33, ['lagos']));
    expect(tryRun(w2, 'u_founder', { type: 'lp.pitch', lpId: LPS.lagos[0]!.id }).ok).toBe(false);
  });
});

describe('Wave 5 B: pitching angels anywhere', () => {
  it('angels hang out at meeting places each period; pitching there is warm', () => {
    let w = addFounder(makeWorld(41, ['london', 'lagos']), 'u_founder', 'london');
    const where = angelsAt(w, 'london');
    expect(angelsAt(w, 'london')).toEqual(where);
    const entries = Object.entries(where);
    expect(entries.length).toBeGreaterThan(0);
    const [bizId, ids] = entries[0]!;
    const angelId = ids[0]!;
    const v = playerView(w, 'u_founder')!;
    expect(v.market.angelsAt).toEqual(where);
    expect(v.market.angels.map((a) => a.id)).toContain(angelId);
    const cid = companyOf(w, 'u_founder').id;
    // Not there.
    const other = Object.keys(w.markets.london!.businesses!).find((id) => !where[id])!;
    expect(
      tryRun(w, 'u_founder', { type: 'pitch.angel', angelId, companyId: cid, businessId: other })
        .ok,
    ).toBe(false);
    const total = moneyByCurrency(w);
    const r = run(w, 'u_founder', {
      type: 'pitch.angel',
      angelId,
      companyId: cid,
      businessId: bizId,
      treat: true,
    });
    w = r.world;
    expect(r.result.warm).toBe(true);
    expect(r.result.spent).toBeGreaterThan(0);
    const fundId = w.players[angelId]!.angel!.fundId;
    expect(w.players.u_founder!.contacts!.some((c) => c.refId === fundId)).toBe(true);
    expect(w.pitches[r.result.pitchId]!.fundId).toBe(fundId);
    zero(total, w);
    // Cold, from their office: also fine (different angel to avoid an open pitch).
    const otherAngel = activeAngels(w, 'london').find((a) => a.id !== angelId)!;
    const cold = run(w, 'u_founder', {
      type: 'pitch.angel',
      angelId: otherAngel.id,
      companyId: cid,
    });
    expect(cold.result.warm).toBe(false);
  });
});

describe('Wave 5 B: event broadcasts and AI attendees', () => {
  it('broadcasting costs money only, raises AI turnout and names the guests', () => {
    let w = addFounder(makeWorld(51, ['lagos']));
    w = run(w, 'u_founder', {
      type: 'event.host',
      kind: 'founder-meetup',
      title: 'Lagos Demo Night',
      venue: 'hall',
      month: w.markets.lagos!.month + 1,
      budget: 0,
    }).world;
    const id = Object.keys(w.events!)[0]!;
    const before = expectedAiGuests(w, w.events![id]!);
    const total = moneyByCurrency(w);
    const hours = w.players.u_founder!.hours.used;
    const r = run(w, 'u_founder', { type: 'event.broadcast', eventId: id, spend: 50_000_00 });
    w = r.world;
    expect(w.players.u_founder!.hours.used).toBe(hours);
    expect(expectedAiGuests(w, w.events![id]!)).toBeGreaterThan(before);
    zero(total, w);
    const ev = playerView(w, 'u_founder')!.market.events[0]!;
    expect(ev.broadcast).toBe(50_000_00);
    expect(ev.attendeesAi.length).toBeGreaterThan(0);
    for (const g of ev.attendeesAi) expect(g.name).toMatch(/\S/);
    // More RSVPs as the month goes on (view clock).
    const now = w.markets.lagos!.settledAt!;
    const early = playerView(w, 'u_founder', { now, monthMs: DAY })!.market.events[0]!;
    // Only the host may broadcast.
    w = addInvestor(w, 'u_inv');
    expect(tryRun(w, 'u_inv', { type: 'event.broadcast', eventId: id, spend: 1_00 }).ok).toBe(
      false,
    );
    w = settle(w, 'lagos', 2, T0 + DAY);
    const held = w.events![id]!;
    expect(held.status).toBe('held');
    expect(held.outcome!.aiNames!.length).toBe(Math.min(held.outcome!.aiGuests, 40));
    expect(early.attendeesAi.length).toBeGreaterThan(0);
  });
});

describe('Wave 5 B: central bank governor', () => {
  it('names the best human banker governor each quarter; the AI governor otherwise', () => {
    let w = makeWorld(61, ['lagos']);
    expect(playerView(addFounder(w), 'u_founder')!.market.centralBank.governor).toEqual({
      name: aiGovernorName('lagos'),
      human: false,
    });
    w = run(w, 'u_bank', {
      type: 'player.create',
      handle: 'h_bank',
      name: 'Bea Banker',
      role: 'banker',
      backgroundId: 'b-wealthy',
      market: 'lagos',
      bank: { name: 'Trust Bank Ltd', bankType: 'microfinance' },
    }).world;
    const total = moneyByCurrency(w);
    w = settle(w, 'lagos', 3, T0 + DAY);
    expect(w.markets.lagos!.governor?.playerId).toBe('u_bank');
    const v = playerView(w, 'u_bank')!;
    expect(v.market.centralBank.governor).toEqual({ name: 'Bea Banker', human: true });
    expect(w.inbox.u_bank!.some((i) => /governor/.test(i.text))).toBe(true);
    expect(w.markets.lagos!.news.some((n) => /governor/.test(n.headline))).toBe(true);
    zero(total, w);
  });
});

describe('Wave 5 B: AI phase-out', () => {
  it('shrinks AI startups and angels as humans join, keeping minimums', () => {
    expect(angelTarget('london')).toBe(4);
    expect(angelTarget('london', 2)).toBe(3);
    expect(angelTarget('london', 40)).toBe(2);
    expect(angelTarget('lagos', 10)).toBe(2);
    let w = makeWorld(71, ['london']);
    expect(aiStartupTarget(w, 'london')).toBe(10);
    for (let i = 0; i < 4; i++) w = addInvestor(w, `u_inv${i}`, 'london');
    expect(aiStartupTarget(w, 'london')).toBe(10);
    w = settle(w, 'london', 1);
    expect(activeAngels(w, 'london')).toHaveLength(2);
    const names =
      'Quokka Zephyr Marlin Basalt Tundra Orchid Falcon Juniper Cobalt Saffron Glacier Lantern Meadow Pebble Rocket Thistle Velvet Walnut'.split(
        ' ',
      );
    for (const [i, n] of names.entries()) w = addFounder(w, `u_f${i}`, 'london', `${n}ly`);
    expect(aiStartupTarget(w, 'london')).toBe(4);
  });

  it('is deterministic', () => {
    const play = () => {
      let w = strongFounder(81);
      w = run(w, 'u_founder', {
        type: 'accelerator.apply',
        acceleratorId: 'lagos-yaba-launchpad',
        companyId: companyOf(w, 'u_founder').id,
      }).world;
      return settle(w, 'lagos', 4);
    };
    expect(play()).toEqual(play());
  });
});
