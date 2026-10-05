import { describe, expect, it } from 'vitest';
import { EVENT_KIND_DATA } from '../src/data/events.js';
import { eventCost, warmIntro } from '../src/events.js';
import { firstMeetingOdds, firstMeetingScore } from '../src/fundraising.js';
import { playerView } from '../src/views.js';
import type { Pitch, World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  companyOf,
  makeWorld,
  moneyByCurrency,
  run,
  settle,
  tryRun,
} from './helpers.js';

const bal = (w: World, playerId: string) =>
  w.accounts[w.players[playerId]!.accounts.local]!.balance;

function base(): World {
  let w = addFounder(makeWorld(42, ['lagos']));
  w = addFounder(w, 'u_f2', 'lagos', 'Shopwise');
  w = addInvestor(w, 'u_inv');
  return w;
}

const COL = 45_000_000; // Lagos cost of living, minor units

describe('hosting, RSVPs and cancelling', () => {
  it('moves money: host pays venue + budget, attendees pay tickets, refunds on un-RSVP and cancel', () => {
    let w = base();
    const total = moneyByCurrency(w);
    const m = w.markets.lagos!;
    const suppliers = m.ext.suppliers;
    const hostBefore = bal(w, 'u_founder');
    const supBefore = w.accounts[suppliers]!.balance;
    const hoursBefore = w.players.u_founder!.hours.used;
    const budget = 5_000_000;
    const ticket = 1_000_000;
    const r = run(w, 'u_founder', {
      type: 'event.host',
      kind: 'founder-meetup',
      title: 'Yaba Founders Night',
      venue: 'hall',
      budget,
      ticket,
    });
    w = r.world;
    const cost = eventCost(m, 'founder-meetup', 'hall') + budget;
    expect(r.result.cost).toBe(cost);
    expect(bal(w, 'u_founder')).toBe(hostBefore - cost);
    expect(w.accounts[suppliers]!.balance).toBe(supBefore + cost);
    expect(w.players.u_founder!.hours.used - hoursBefore).toBe(
      EVENT_KIND_DATA['founder-meetup'].hoursHost,
    );
    const id = r.result.eventId as string;
    const e = w.events![id]!;
    expect(e.status).toBe('upcoming');
    expect(e.month).toBe(m.month);
    expect(e.capacity).toBe(EVENT_KIND_DATA['founder-meetup'].capacity[1]);

    // RSVP: the ticket goes to the host; no hours (Wave 5: money only).
    const f2Before = bal(w, 'u_f2');
    const f2Hours = w.players.u_f2!.hours.used;
    w = run(w, 'u_f2', { type: 'event.rsvp', eventId: id, going: true }).world;
    expect(bal(w, 'u_f2')).toBe(f2Before - ticket);
    expect(bal(w, 'u_founder')).toBe(hostBefore - cost + ticket);
    expect(w.players.u_f2!.hours.used - f2Hours).toBe(0);
    expect(tryRun(w, 'u_f2', { type: 'event.rsvp', eventId: id, going: true }).ok).toBe(false);

    // Un-RSVP: refunded.
    w = run(w, 'u_f2', { type: 'event.rsvp', eventId: id, going: false }).world;
    expect(bal(w, 'u_f2')).toBe(f2Before);
    expect(w.events![id]!.attendees).toEqual([]);

    // Back in, then the host cancels: tickets refunded, costs not.
    w = run(w, 'u_f2', { type: 'event.rsvp', eventId: id, going: true }).world;
    w = run(w, 'u_inv', { type: 'event.rsvp', eventId: id, going: true }).world;
    expect(tryRun(w, 'u_f2', { type: 'event.cancel', eventId: id }).ok).toBe(false);
    w = run(w, 'u_founder', { type: 'event.cancel', eventId: id }).world;
    expect(w.events![id]!.status).toBe('cancelled');
    expect(bal(w, 'u_f2')).toBe(f2Before);
    expect(bal(w, 'u_founder')).toBe(hostBefore - cost);
    expect(w.accounts[suppliers]!.balance).toBe(supBefore + cost);
    expect(tryRun(w, 'u_f2', { type: 'event.rsvp', eventId: id, going: true }).ok).toBe(false);
    expect(moneyByCurrency(w)).toEqual(total);

    // A cancelled event never holds.
    w = settle(w, 'lagos', 1);
    expect(w.events![id]!.status).toBe('cancelled');
  });

  it('validates hosting', () => {
    let w = base();
    const host = (actor: string, extra: object) =>
      tryRun(w, actor, {
        type: 'event.host',
        kind: 'founder-meetup',
        title: 'Founders Night',
        venue: 'hub',
        budget: 0,
        ...extra,
      } as never);
    // Standing: a 1-star founder can't host an investor breakfast; an investor can.
    expect(host('u_founder', { kind: 'investor-breakfast' })).toMatchObject({
      ok: false,
      error: { code: 'event.standing' },
    });
    expect(host('u_inv', { kind: 'investor-breakfast' }).ok).toBe(true);
    // Title must pass the name checker.
    expect(host('u_founder', { title: 'Paystack Night' })).toMatchObject({
      error: { code: 'event.title' },
    });
    // Months: now to three ahead.
    expect(host('u_founder', { month: 9 })).toMatchObject({ error: { code: 'event.month' } });
    // Customer mixers need a segment; others must not have one.
    expect(host('u_founder', { kind: 'customer-mixer' })).toMatchObject({
      error: { code: 'event.segment' },
    });
    expect(host('u_founder', { segmentKey: 'fintech.traders' })).toMatchObject({
      error: { code: 'event.segment' },
    });
    // Budget and ticket caps.
    expect(host('u_founder', { budget: COL * 21 })).toMatchObject({
      error: { code: 'event.budget' },
    });
    expect(host('u_founder', { ticket: COL * 3 })).toMatchObject({
      error: { code: 'event.ticket' },
    });
    // One upcoming event per host.
    w = run(w, 'u_founder', {
      type: 'event.host',
      kind: 'founder-meetup',
      title: 'Founders Night',
      venue: 'office',
      budget: 0,
    }).world;
    expect(host('u_founder', {})).toMatchObject({ error: { code: 'event.limit' } });
    // You can't RSVP to your own event.
    const id = Object.keys(w.events!)[0]!;
    expect(tryRun(w, 'u_founder', { type: 'event.rsvp', eventId: id, going: true }).ok).toBe(false);
  });

  it('enforces capacity (the host takes a seat)', () => {
    let w = base();
    w = run(w, 'u_founder', {
      type: 'event.host',
      kind: 'founder-meetup',
      title: 'Tiny Supper',
      venue: 'office',
      budget: 0,
    }).world;
    const id = Object.keys(w.events!)[0]!;
    expect(w.events![id]!.capacity).toBe(EVENT_KIND_DATA['founder-meetup'].capacity[0]);
    // Shrink the room to two seats: host + one guest.
    w = structuredClone(w);
    w.events![id]!.capacity = 2;
    w = run(w, 'u_f2', { type: 'event.rsvp', eventId: id, going: true }).world;
    expect(tryRun(w, 'u_inv', { type: 'event.rsvp', eventId: id, going: true })).toMatchObject({
      ok: false,
      error: { code: 'event.full' },
    });
  });
});

describe('holding an event', () => {
  it('creates contacts, network and trust for host and attendees, with a recap', () => {
    let w = base();
    w = run(w, 'u_founder', {
      type: 'event.host',
      kind: 'founder-meetup',
      title: 'Yaba Founders Night',
      venue: 'hall',
      budget: COL,
    }).world;
    const id = Object.keys(w.events!)[0]!;
    w = run(w, 'u_f2', { type: 'event.rsvp', eventId: id, going: true }).world;
    const netBefore = w.players.u_founder!.network;
    w = settle(w, 'lagos', 1);
    const e = w.events![id]!;
    expect(e.status).toBe('held');
    expect(e.outcome!.aiGuests).toBeGreaterThan(0);
    expect(e.outcome!.humans).toBe(2);

    const host = w.players.u_founder!;
    const guest = w.players.u_f2!;
    expect(host.contacts!.some((c) => c.kind === 'founder')).toBe(true);
    expect(host.contacts!.some((c) => c.kind === 'player' && c.refId === 'u_f2')).toBe(true);
    expect(guest.contacts!.some((c) => c.kind === 'player' && c.refId === 'u_founder')).toBe(true);
    expect(guest.contacts!.length).toBeGreaterThan(1);
    expect(host.network).toBeGreaterThan(netBefore);
    expect(guest.trust.u_founder).toBeGreaterThan(0);
    expect(host.trust.u_f2).toBeGreaterThan(0);
    expect(e.outcome!.contacts.u_founder).toBe(host.contacts!.length);
    for (const c of [...host.contacts!, ...guest.contacts!]) {
      expect(c.warmth).toBeGreaterThan(0);
      expect(c.warmth).toBeLessThanOrEqual(1);
    }
    expect(w.inbox.u_founder!.some((i) => i.text.startsWith('Yaba Founders Night:'))).toBe(true);
    expect(w.inbox.u_f2!.some((i) => i.text.startsWith('Yaba Founders Night:'))).toBe(true);

    // Views: the held event with your recap, the kinds, and your contacts.
    const v = playerView(w, 'u_f2')!;
    const ev = v.market.events.find((x) => x.id === id)!;
    expect(ev).toMatchObject({
      kind: 'founder-meetup',
      kindLabel: 'Founder meetup',
      host: { id: 'u_founder' },
      status: 'held',
      youHost: false,
      youGoing: true,
      going: 2,
    });
    expect(ev.outcome!.contacts).toBe(guest.contacts!.length);
    expect(ev.dateLabel).toMatch(/^Year \d+, Month \d+$/);
    expect(v.market.eventKinds.map((k) => k.kind)).toEqual([
      'founder-meetup',
      'investor-breakfast',
      'demo-day',
      'customer-mixer',
      'talent-night',
    ]);
    expect(v.me.contacts.length).toBe(guest.contacts!.length);
    expect(v.me.contacts[0]!.month).toBe(w.markets.lagos!.month);
  });

  it('is deterministic for the same seed and commands', () => {
    const go = () => {
      let w = base();
      w = run(w, 'u_inv', {
        type: 'event.host',
        kind: 'investor-breakfast',
        title: 'Lagos Seed Breakfast',
        venue: 'hall',
        budget: COL * 2,
      }).world;
      const id = Object.keys(w.events!)[0]!;
      w = run(w, 'u_founder', { type: 'event.rsvp', eventId: id, going: true }).world;
      return settle(w, 'lagos', 1);
    };
    const a = go();
    const b = go();
    expect(a.players.u_founder!.contacts).toEqual(b.players.u_founder!.contacts);
    expect(Object.values(a.events!)[0]!.outcome).toEqual(Object.values(b.events!)[0]!.outcome);
  });

  it('an investor breakfast gives attendees warm fund contacts', () => {
    let w = base();
    w = run(w, 'u_inv', {
      type: 'event.host',
      kind: 'investor-breakfast',
      title: 'Lagos Seed Breakfast',
      venue: 'hall',
      budget: COL * 2,
    }).world;
    const id = Object.keys(w.events!)[0]!;
    w = run(w, 'u_founder', { type: 'event.rsvp', eventId: id, going: true }).world;
    w = settle(w, 'lagos', 1);
    const funds = w.players.u_founder!.contacts!.filter((c) => c.kind === 'fund');
    expect(funds.length).toBeGreaterThan(0);
    for (const f of funds) expect(w.funds[f.refId]).toBeDefined();
    // And the warm intro is live for that fund.
    expect(warmIntro(w, w.players.u_founder!, funds[0]!.refId).warmth).toBeGreaterThan(0);
  });

  it('a held event in a later month waits for that month', () => {
    let w = base();
    const month = w.markets.lagos!.month;
    w = run(w, 'u_founder', {
      type: 'event.host',
      kind: 'founder-meetup',
      title: 'Later Meetup',
      venue: 'hub',
      budget: 0,
      month: month + 1,
    }).world;
    const id = Object.keys(w.events!)[0]!;
    w = settle(w, 'lagos', 1);
    expect(w.events![id]!.status).toBe('upcoming');
    w = settle(w, 'lagos', 1);
    expect(w.events![id]!.status).toBe('held');
  });
});

describe('warm intros', () => {
  it('a warm fund contact improves the first meeting versus a cold pitch (same seed)', () => {
    const w0 = base();
    const fund = w0.funds.fund_1!; // fintech, pre-seed/seed
    const c = companyOf(w0, 'u_founder');
    const starsNow = Math.max(c.stars.value, w0.players.u_founder!.stars.value);

    const setup = (warm: boolean) => {
      const w = structuredClone(w0);
      // Raise the bar half a star above where the founder is.
      w.funds[fund.id]!.minStars = starsNow + 0.5;
      if (warm)
        w.players.u_founder!.contacts = [
          {
            id: `fund:${fund.id}`,
            kind: 'fund',
            refId: fund.id,
            name: fund.partner,
            warmth: 0.9,
            month: w.markets.lagos!.month,
          },
        ];
      return w;
    };
    const pitch = (w: World) =>
      tryRun(w, 'u_founder', {
        type: 'pitch.start',
        companyId: c.id,
        fundId: fund.id,
        slides: ['problem', 'product', 'team'],
        ask: 20_000_000_00,
      });

    const cold = pitch(setup(false));
    const warm = pitch(setup(true));
    expect(cold.ok && warm.ok).toBe(true);
    if (!cold.ok || !warm.ok) return;
    // Cold: turned away at the door. Warm: the partner takes the meeting.
    expect((cold.result as { status: string }).status).toBe('passed');
    expect((warm.result as { status: string }).status).toBe('questions');

    // Same pitch, same seed: the warm founder's first-meeting odds are higher.
    const w = setup(false);
    const ww = setup(true);
    const p: Pitch = {
      id: 'pitch_x',
      companyId: c.id,
      founderId: 'u_founder',
      fundId: fund.id,
      investorPlayerId: null,
      slides: ['problem', 'product', 'team'],
      status: 'questions',
      questions: [],
      answers: {},
      reason: '',
      month: 0,
      dealId: null,
      ask: 1,
    };
    const coldScore = firstMeetingScore(w, w.funds[fund.id]!, w.companies[c.id]!, p);
    const warmScore = firstMeetingScore(ww, ww.funds[fund.id]!, ww.companies[c.id]!, p);
    expect(warmScore - coldScore).toBeCloseTo(0.9 * 0.12, 5);
    expect(firstMeetingOdds(warmScore)).toBeGreaterThan(firstMeetingOdds(coldScore) * 3);
  });

  it('a wider network slightly raises first-meeting odds', () => {
    const w = structuredClone(base());
    const founder = w.players.u_founder!;
    founder.network = 30;
    const low = warmIntro(w, founder, 'fund_1').scoreBonus;
    founder.network = 80;
    const high = warmIntro(w, founder, 'fund_1').scoreBonus;
    expect(low).toBe(0);
    expect(high).toBeGreaterThan(0);
    expect(high).toBeLessThanOrEqual(0.03);
  });

  it('warmth fades over time', () => {
    const w = structuredClone(base());
    const month = w.markets.lagos!.month;
    w.players.u_founder!.contacts = [
      { id: 'fund:fund_1', kind: 'fund', refId: 'fund_1', name: 'x', warmth: 0.8, month },
    ];
    const now = warmIntro(w, w.players.u_founder!, 'fund_1', month).warmth;
    const later = warmIntro(w, w.players.u_founder!, 'fund_1', month + 6).warmth;
    const gone = warmIntro(w, w.players.u_founder!, 'fund_1', month + 12).warmth;
    expect(now).toBeCloseTo(0.8);
    expect(later).toBeCloseTo(0.4);
    expect(gone).toBe(0);
  });
});

describe('kind outcomes', () => {
  it('a customer mixer raises awareness and brings trials in that segment', () => {
    const w0 = base();
    const c = companyOf(w0, 'u_founder');
    const seg = c.targetSegments[0]!;
    const withEvent = run(w0, 'u_founder', {
      type: 'event.host',
      kind: 'customer-mixer',
      title: 'Traders Mixer',
      venue: 'hall',
      budget: COL,
      segmentKey: seg,
    }).world;
    const a = settle(withEvent, 'lagos', 1);
    const b = settle(w0, 'lagos', 1);
    const posA = a.companies[c.id]!.segments[seg]!;
    const posB = b.companies[c.id]!.segments[seg]!;
    expect(posA.awareness).toBeGreaterThan(posB.awareness);
    const trialsA = posA.paying + posA.pipeline.reduce((s, p) => s + p.count, 0);
    const trialsB = posB.paying + posB.pipeline.reduce((s, p) => s + p.count, 0);
    expect(trialsA).toBeGreaterThan(trialsB);
    const e = Object.values(a.events!)[0]!;
    expect(e.outcome!.summary).toMatch(/trial/);
    expect(
      a.players.u_founder!.contacts!.some((x) => x.kind === 'customer' && x.refId === seg),
    ).toBe(true);
  });

  it('a talent night refers a candidate who is keener to join', () => {
    let w = base();
    w = run(w, 'u_inv', {
      type: 'event.host',
      kind: 'talent-night',
      title: 'Hiring Night',
      venue: 'hall',
      budget: COL,
    }).world;
    const id = Object.keys(w.events!)[0]!;
    w = run(w, 'u_founder', { type: 'event.rsvp', eventId: id, going: true }).world;
    w = settle(w, 'lagos', 1);
    const c = companyOf(w, 'u_founder');
    const referred = w.markets.lagos!.talent.filter((t) => t.referredFor === c.id);
    expect(referred.length).toBeGreaterThan(0);
    const cand = referred[0]!;
    expect(
      w.players.u_founder!.contacts!.some((x) => x.kind === 'talent' && x.refId === cand.id),
    ).toBe(true);
    // The referred candidate takes an offer at their ask.
    const r = run(w, 'u_founder', {
      type: 'company.offer',
      companyId: c.id,
      candidateId: cand.id,
      salary: cand.ask,
      equityBps: 0,
    });
    expect(r.result.outcome).toBe('accept');
  });
});
