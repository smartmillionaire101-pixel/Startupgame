import { describe, expect, it } from 'vitest';
import { isOpen } from '../src/economy.js';
import { col } from '../src/helpers.js';
import { scale } from '../src/money.js';
import {
  HANGOUT_FUN,
  HANGOUT_SOCIAL,
  SEND_DAILY_LIMIT_COL,
  SEND_FEE_MIN_COL,
  VISIT_SOCIAL,
  techEventsFor,
} from '../src/social.js';
import { playerView } from '../src/views.js';
import type { MarketId } from '../src/data/markets.js';
import type { World } from '../src/types.js';
import { DAY, makeWorld, moneyByCurrency, run, settle, T0, tryRun } from './helpers.js';

const bal = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;
const bankSink = (w: World, m: MarketId) => w.accounts[w.markets[m]!.ext.bank]!.balance;

function person(w: World, id: string, market: MarketId = 'lagos', name = 'Ama Person'): World {
  return run(w, id, {
    type: 'player.create',
    handle: `h_${id}`,
    name,
    role: 'investor',
    backgroundId: 'i-first',
    market,
    investor: { sectors: ['fintech'], stages: ['seed'], checkSize: 1_000_000_00 },
  }).world;
}

function founder(w: World, id: string, market: MarketId = 'lagos'): World {
  return run(w, id, {
    type: 'player.create',
    handle: `h_${id}`,
    name: 'Femi Founder',
    role: 'founder',
    backgroundId: 'f-engineer',
    market,
    company: {
      name: `Startup ${id.replace(/\W|_/g, '')}`,
      industry: 'fintech',
      revenueModel: 'subscription',
      idea: 'Payments for market traders',
      incorporation: 'local',
    },
  }).world;
}

const two = () =>
  person(
    person(makeWorld(8, ['lagos', 'london']), 'u_a', 'lagos', 'Ade A'),
    'u_b',
    'lagos',
    'Bisi B',
  );

describe('money.send (Wave 8 §C)', () => {
  it('moves the amount to the friend and the fee to their city bank; money is conserved', () => {
    const w0 = two();
    const total = moneyByCurrency(w0);
    const m = w0.markets.lagos!;
    const amount = scale(col(m), 1);
    const r = run(w0, 'u_a', { type: 'money.send', toPlayerId: 'u_b', amount, note: 'For lunch' });
    const w = r.world;
    const fee = Math.max(Math.round(amount * 0.01), scale(col(m), SEND_FEE_MIN_COL));
    expect(r.result.fee).toBe(fee);
    expect(bal(w, 'u_a')).toBe(bal(w0, 'u_a') - amount - fee);
    expect(bal(w, 'u_b')).toBe(bal(w0, 'u_b') + amount);
    expect(bankSink(w, 'lagos')).toBe(bankSink(w0, 'lagos') + fee);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(w.inbox.u_a!.some((i) => i.text.includes('You sent'))).toBe(true);
    expect(
      w.inbox.u_b!.some((i) => i.text.includes('Ade A sent you') && i.text.includes('For lunch')),
    ).toBe(true);
  });

  it('charges the minimum fee on small amounts', () => {
    const w0 = two();
    const m = w0.markets.lagos!;
    const r = run(w0, 'u_a', { type: 'money.send', toPlayerId: 'u_b', amount: 100 });
    expect(r.result.fee).toBe(scale(col(m), SEND_FEE_MIN_COL));
  });

  it('converts across currencies at the FX rate, conserving each currency', () => {
    const w0 = person(two(), 'u_l', 'london', 'Lou L');
    const total = moneyByCurrency(w0);
    const amount = scale(col(w0.markets.lagos!), 0.5);
    const r = run(w0, 'u_a', { type: 'money.send', toPlayerId: 'u_l', amount });
    const w = r.world;
    expect(r.result.receivedCurrency).toBe('GBP');
    expect(bal(w, 'u_l') - bal(w0, 'u_l')).toBe(r.result.received);
    expect(r.result.received).toBeGreaterThan(0);
    expect(bankSink(w, 'london')).toBeGreaterThan(bankSink(w0, 'london'));
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('has a daily limit that resets the next day', () => {
    let w = two();
    const limit = scale(col(w.markets.lagos!), SEND_DAILY_LIMIT_COL);
    w = run(w, 'u_a', { type: 'money.send', toPlayerId: 'u_b', amount: limit - 100 }).world;
    const over = tryRun(w, 'u_a', { type: 'money.send', toPlayerId: 'u_b', amount: 200 });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.code).toBe('money.limit');
    expect(
      run(w, 'u_a', { type: 'money.send', toPlayerId: 'u_b', amount: 100 }).result.leftToday,
    ).toBe(0);
    // Tomorrow it's fine again.
    expect(
      tryRun(w, 'u_a', { type: 'money.send', toPlayerId: 'u_b', amount: 200 }, T0 + DAY).ok,
    ).toBe(true);
    expect(playerView(w, 'u_a', { now: T0, monthMs: DAY })!.sendMoney.left).toBe(100);
  });

  it('refuses self-sends, AI players, zero amounts, notes with links and empty pockets', () => {
    const w = two();
    const ai = Object.values(w.players).find((p) => p.ai)!;
    const code = (cmd: Parameters<typeof tryRun>[2]) => {
      const r = tryRun(w, 'u_a', cmd);
      return r.ok ? 'ok' : r.error.code;
    };
    expect(code({ type: 'money.send', toPlayerId: 'u_a', amount: 100 })).toBe('money.self');
    expect(code({ type: 'money.send', toPlayerId: ai.id, amount: 100 })).toBe('social.player');
    expect(code({ type: 'money.send', toPlayerId: 'nobody', amount: 100 })).toBe('social.player');
    expect(code({ type: 'money.send', toPlayerId: 'u_b', amount: 0 })).toBe('money.amount');
    expect(code({ type: 'money.send', toPlayerId: 'u_b', amount: -5 })).toBe('money.amount');
    expect(
      code({ type: 'money.send', toPlayerId: 'u_b', amount: 100, note: 'pay me at www.scam.com' }),
    ).toBe('money.note');
    const broke = structuredClone(w);
    const acc = broke.accounts[broke.players.u_a!.accounts.local]!;
    broke.accounts[broke.markets.lagos!.ext.genesis]!.balance += acc.balance - 50;
    acc.balance = 50;
    const r = tryRun(broke, 'u_a', { type: 'money.send', toPlayerId: 'u_b', amount: 100 });
    expect(r.ok ? 'ok' : r.error.code).toBe('money.funds');
  });
});

describe('home visits (Wave 8 §C)', () => {
  it('invite, accept: the guest sees the host’s home; both get social and trust', () => {
    let w = two();
    const r = run(w, 'u_a', { type: 'visit.invite', toPlayerId: 'u_b' });
    w = r.world;
    const id = r.result.inviteId as string;
    expect(playerView(w, 'u_b')!.visits.incoming[0]!.id).toBe(id);
    expect(playerView(w, 'u_b')!.visiting).toBeNull();
    const before = { a: w.players.u_a!.needs!.social, b: w.players.u_b!.needs!.social };
    w = structuredClone(w);
    w.players.u_a!.needs!.social = 40;
    w.players.u_b!.needs!.social = 40;
    w = run(w, 'u_b', { type: 'visit.accept', inviteId: id }).world;
    expect(w.players.u_a!.needs!.social).toBe(40 + VISIT_SOCIAL);
    expect(w.players.u_b!.needs!.social).toBe(40 + VISIT_SOCIAL);
    expect(before.a).toBeGreaterThan(0);
    expect(w.players.u_a!.trust.u_b).toBeGreaterThan(0);
    expect(w.players.u_b!.trust.u_a).toBeGreaterThan(0);
    const v = playerView(w, 'u_b')!.visiting!;
    expect(v.host.id).toBe('u_a');
    expect(v.readOnly).toBe(true);
    expect(v.home.items).toBeDefined();
    // Answering twice fails; the visit ends with the month.
    expect(tryRun(w, 'u_b', { type: 'visit.accept', inviteId: id }).ok).toBe(false);
    w = settle(w, 'lagos', 1);
    expect(playerView(w, 'u_b')!.visiting).toBeNull();
  });

  it('declines, expiry, and the guest must be in the host’s city', () => {
    let w = person(two(), 'u_l', 'london', 'Lou L');
    w = run(w, 'u_a', { type: 'visit.invite', toPlayerId: 'u_l' }).world;
    const far = Object.keys(w.visits!)[0]!;
    const r = tryRun(w, 'u_l', { type: 'visit.accept', inviteId: far });
    expect(r.ok ? 'ok' : r.error.code).toBe('visit.where');
    w = run(w, 'u_l', { type: 'visit.decline', inviteId: far }).world;
    expect(w.visits![far]!.status).toBe('declined');
    expect(w.inbox.u_a!.some((i) => i.text.includes('can’t come over'))).toBe(true);
    // An invitation expires with the month.
    const r2 = run(w, 'u_a', { type: 'visit.invite', toPlayerId: 'u_b' });
    w = settle(r2.world, 'lagos', 1);
    const late = tryRun(w, 'u_b', { type: 'visit.accept', inviteId: r2.result.inviteId });
    expect(late.ok ? 'ok' : late.error.code).toBe('visit.expired');
    // No self invites or AI guests.
    const ai = Object.values(w.players).find((p) => p.ai)!;
    expect(tryRun(w, 'u_a', { type: 'visit.invite', toPlayerId: 'u_a' }).ok).toBe(false);
    expect(tryRun(w, 'u_a', { type: 'visit.invite', toPlayerId: ai.id }).ok).toBe(false);
    // Someone else can't answer your invitation.
    const r3 = run(w, 'u_a', { type: 'visit.invite', toPlayerId: 'u_b' });
    expect(tryRun(r3.world, 'u_l', { type: 'visit.accept', inviteId: r3.result.inviteId }).ok).toBe(
      false,
    );
  });
});

describe('hangouts (Wave 8 §C)', () => {
  const bar = (w: World) =>
    Object.values(w.markets.lagos!.businesses!).find(
      (b) => isOpen(b) && (b.kind === 'bar' || b.kind === 'pub' || b.kind === 'lounge-bar'),
    )!;

  it('plan at a bar, friends join: boosts and warm contacts between every pair', () => {
    let w = structuredClone(person(two(), 'u_c', 'lagos', 'Chi C'));
    for (const id of ['u_a', 'u_b', 'u_c']) {
      w.players[id]!.needs = { hunger: 50, hygiene: 50, fun: 40, social: 40 };
    }
    const b = bar(w);
    const r = run(w, 'u_a', {
      type: 'hangout.plan',
      businessId: b.id,
      inviteeIds: ['u_b', 'u_c'],
      when: 'tonight',
    });
    w = r.world;
    const id = r.result.hangoutId as string;
    expect(w.inbox.u_b!.some((i) => i.text.includes('wants to hang out'))).toBe(true);
    const hv = playerView(w, 'u_b')!.hangouts;
    expect(hv[0]!.id).toBe(id);
    expect(hv[0]!.joined).toBe(false);
    w = run(w, 'u_b', { type: 'hangout.join', hangoutId: id }).world;
    w = run(w, 'u_c', { type: 'hangout.join', hangoutId: id }).world;
    for (const x of ['u_a', 'u_b', 'u_c']) {
      expect(w.players[x]!.needs!.social).toBe(40 + HANGOUT_SOCIAL);
      expect(w.players[x]!.needs!.fun).toBe(40 + HANGOUT_FUN);
      for (const y of ['u_a', 'u_b', 'u_c'])
        if (x !== y)
          expect((w.players[x]!.contacts ?? []).some((c) => c.id === `player:${y}`)).toBe(true);
    }
    expect(tryRun(w, 'u_b', { type: 'hangout.join', hangoutId: id }).ok).toBe(false);
    w = run(w, 'u_b', { type: 'hangout.leave', hangoutId: id }).world;
    expect(w.hangouts![id]!.memberIds).toEqual(['u_a', 'u_c']);
    // Over when the month ends.
    w = settle(w, 'lagos', 1);
    expect(playerView(w, 'u_a')!.hangouts).toEqual([]);
  });

  it('only invitees join; AI invitees and other cities are refused', () => {
    let w = person(two(), 'u_x', 'lagos', 'Xan X');
    const b = bar(w);
    const ai = Object.values(w.players).find((p) => p.ai)!;
    expect(
      tryRun(w, 'u_a', { type: 'hangout.plan', businessId: b.id, inviteeIds: [ai.id], when: 'now' })
        .ok,
    ).toBe(false);
    expect(
      tryRun(w, 'u_a', { type: 'hangout.plan', businessId: b.id, inviteeIds: ['u_a'], when: 'now' })
        .ok,
    ).toBe(false);
    const r = run(w, 'u_a', {
      type: 'hangout.plan',
      businessId: b.id,
      inviteeIds: ['u_b'],
      when: 'now',
    });
    w = r.world;
    const join = tryRun(w, 'u_x', { type: 'hangout.join', hangoutId: r.result.hangoutId });
    expect(join.ok ? 'ok' : join.error.code).toBe('hangout.invite');
  });
});

describe('tech events (Wave 8 §C)', () => {
  it('3–6 a month, deterministic, at the Hub, the Event Hall or a venue', () => {
    const w = two();
    const m = w.markets.lagos!;
    for (let month = 0; month < 6; month++) {
      const a = techEventsFor(w, m, month);
      expect(a.length).toBeGreaterThanOrEqual(3);
      expect(a.length).toBeLessThanOrEqual(6);
      expect(techEventsFor(w, m, month)).toEqual(a);
      for (const e of a) {
        expect(['hub', 'hall', 'business']).toContain(e.venue.kind);
        expect(e.speakers.length).toBeGreaterThan(0);
        expect(e.capacity).toBeGreaterThan(0);
      }
    }
    const view = playerView(w, 'u_a')!;
    expect(view.market.techEvents.filter((e) => e.status === 'on').length).toBe(
      techEventsFor(w, m, m.month).length,
    );
    expect(view.market.techEvents.some((e) => e.status === 'soon')).toBe(true);
  });

  it('attending gives network and contacts with the speakers; tickets are conserved', () => {
    let w = two();
    const total = moneyByCurrency(w);
    const m = w.markets.lagos!;
    const events = techEventsFor(w, m, m.month);
    const e = [...events].sort((a, b) => b.ticket - a.ticket)[0]!;
    const before = { net: w.players.u_a!.network, cash: bal(w, 'u_a') };
    const r = run(w, 'u_a', { type: 'techevent.attend', eventId: e.id });
    w = r.world;
    expect(w.players.u_a!.network).toBeGreaterThan(before.net);
    expect(bal(w, 'u_a')).toBe(before.cash - e.ticket);
    for (const s of e.speakers)
      expect((w.players.u_a!.contacts ?? []).some((c) => c.refId === s.contact.refId)).toBe(true);
    expect(r.result.contacts.length).toBeGreaterThan(e.speakers.length);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(playerView(w, 'u_a')!.market.techEvents.find((x) => x.id === e.id)!.attended).toBe(true);
    // Once per event; next month's events aren't on yet; other cities need a flight.
    expect(tryRun(w, 'u_a', { type: 'techevent.attend', eventId: e.id }).ok).toBe(false);
    const soon = techEventsFor(w, m, m.month + 1)[0]!;
    const r2 = tryRun(w, 'u_a', { type: 'techevent.attend', eventId: soon.id });
    expect(r2.ok ? 'ok' : r2.error.code).toBe('techevent.when');
    const lon = techEventsFor(w, w.markets.london!, w.markets.london!.month)[0]!;
    const r3 = tryRun(w, 'u_a', { type: 'techevent.attend', eventId: lon.id });
    expect(r3.ok ? 'ok' : r3.error.code).toBe('techevent.where');
    expect(tryRun(w, 'u_a', { type: 'techevent.attend', eventId: 'te:bogus' }).ok).toBe(false);
  });

  it('a demo day can put a founder on stage, with an investor interested', () => {
    // Find a world and month with a demo day, then try founders until one gets a slot.
    let found = false;
    for (let seed = 1; seed < 40 && !found; seed++) {
      let w = makeWorld(seed, ['lagos']);
      const m = w.markets.lagos!;
      const demo = techEventsFor(w, m, m.month).find((e) => e.kind === 'demo-day');
      if (!demo) continue;
      for (let i = 0; i < 6 && !found; i++) {
        w = founder(w, `u_f${i}`);
        const r = tryRun(w, `u_f${i}`, { type: 'techevent.attend', eventId: demo.id });
        if (!r.ok) continue;
        const pitch = (
          r.result as { pitch: { onStage: boolean; interest: { fundId: string } | null } }
        ).pitch;
        expect(pitch).not.toBeNull();
        if (pitch.onStage && pitch.interest) {
          const c = r.world.players[`u_f${i}`]!.contacts!.find(
            (x) => x.kind === 'fund' && x.refId === pitch.interest!.fundId,
          );
          expect(c!.warmth).toBeGreaterThanOrEqual(0.35);
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });
});

describe('old saves (Wave 8)', () => {
  it('work without visits, hangouts, moneySent or techEvents', () => {
    const w = structuredClone(two());
    delete w.visits;
    delete w.hangouts;
    delete w.players.u_a!.moneySent;
    delete w.players.u_a!.techEvents;
    const v = playerView(w, 'u_a')!;
    expect(v.visiting).toBeNull();
    expect(v.visits).toEqual({ incoming: [], outgoing: [] });
    expect(v.hangouts).toEqual([]);
    expect(run(w, 'u_a', { type: 'visit.invite', toPlayerId: 'u_b' }).world.visits).toBeDefined();
  });
});
