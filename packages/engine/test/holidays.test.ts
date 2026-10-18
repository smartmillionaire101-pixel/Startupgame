import { describe, expect, it } from 'vitest';
import { isOpen, specOf } from '../src/economy.js';
import { HOLIDAY_TRUST } from '../src/holidays.js';
import { flightFare, hotelPrice } from '../src/travel.js';
import { playerView } from '../src/views.js';
import { hashString } from '../src/rng.js';
import type { Command } from '../src/commands.js';
import type { MarketId } from '../src/data/markets.js';
import type { World } from '../src/types.js';
import { makeWorld, moneyByCurrency, run, settle, T0, tryRun } from './helpers.js';

/**
 * Holiday with friends (player feedback): a host invites friends on a trip
 * abroad, paying for them or not; guests fly from their own cities to the
 * same hotel; doing something together there gives a small shared bonus.
 */

const bal = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;

function person(w: World, id: string, market: MarketId, name: string): World {
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

/** Ada (Lagos), Bola (Nairobi) and Chi (Lagos); Ada has booked London with a business hotel. */
function setup(): World {
  let w = makeWorld(11, ['lagos', 'nairobi', 'london']);
  w = person(w, 'u_a', 'lagos', 'Ada A');
  w = person(w, 'u_b', 'nairobi', 'Bola B');
  w = person(w, 'u_c', 'lagos', 'Chi C');
  return run(w, 'u_a', { type: 'travel.book', to: 'london', hotel: 'business' }).world;
}

const holidayOf = (w: World) => Object.values(w.holidays ?? {})[0]!;
const venue = (w: World) =>
  Object.values(w.markets.london!.businesses!)
    .filter((b) => isOpen(b) && specOf(b).venue)
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0]!;

describe('holiday with friends', () => {
  it('needs a trip abroad, and only invites other human players', () => {
    let w = makeWorld(11, ['lagos', 'nairobi', 'london']);
    w = person(w, 'u_a', 'lagos', 'Ada A');
    w = person(w, 'u_b', 'nairobi', 'Bola B');
    const none = tryRun(w, 'u_a', { type: 'holiday.invite', inviteeIds: ['u_b'], hostPays: false });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error.code).toBe('holiday.trip');
    w = run(w, 'u_a', { type: 'travel.book', to: 'london', hotel: 'business' }).world;
    const ai = Object.values(w.players).find((p) => p.ai)!;
    expect(
      tryRun(w, 'u_a', { type: 'holiday.invite', inviteeIds: [ai.id], hostPays: false }).ok,
    ).toBe(false);
    expect(
      tryRun(w, 'u_a', { type: 'holiday.invite', inviteeIds: ['u_a'], hostPays: false }).ok,
    ).toBe(false);
  });

  it('the host pays: the guest flies from their own city to the same hotel; money is conserved', () => {
    let w = setup();
    const r = run(w, 'u_a', { type: 'holiday.invite', inviteeIds: ['u_b'], hostPays: true });
    w = r.world;
    const h = holidayOf(w);
    expect(h).toMatchObject({ hostId: 'u_a', market: 'london', tier: 'business' });
    expect(h.month).toBe(w.markets.london!.month);
    const note = w.inbox.u_b!.find((i) => i.ref?.kind === 'holiday')!;
    expect(note.text).toContain('Ada A invited you on holiday to London');
    expect(note.text).toContain('Canary Wharf Business Hotel');
    expect(note.text).toContain('pay your flight and hotel');

    // Bola sees the invitation, its cost and that Ada pays.
    const inv = playerView(w, 'u_b')!.holidays[0]!;
    const b = w.players.u_b!;
    const cost = flightFare(w, b, 'london') + hotelPrice(w, b, 'london', 'business');
    expect(inv.invite).toMatchObject({ hostPays: true, cost, affordable: true, blocked: null });
    // Ada sees an estimate of what she'll cover, in her currency.
    expect(playerView(w, 'u_a')!.holidays[0]!.guests[0]!.estimate).toBeGreaterThan(0);

    const total = moneyByCurrency(w);
    const a0 = bal(w, 'u_a');
    const b0 = bal(w, 'u_b');
    const acc = run(w, 'u_b', { type: 'holiday.accept', holidayId: h.id });
    w = acc.world;
    expect(acc.result.hostPaid).toBe(true);
    // Bola's trip is from Nairobi, with the same hotel tier, paid by Ada.
    expect(w.players.u_b!.flightTicket).toMatchObject({
      from: 'nairobi',
      to: 'london',
      hotel: { tier: 'business' },
      sponsor: { playerId: 'u_a', amount: cost },
    });
    expect(bal(w, 'u_b')).toBe(b0);
    expect(bal(w, 'u_a')).toBeLessThan(a0);
    expect(holidayOf(w).guests[0]).toMatchObject({ status: 'accepted', paid: a0 - bal(w, 'u_a') });
    expect(moneyByCurrency(w)).toEqual(total);
    expect(w.inbox.u_a!.some((i) => i.text === 'Bola B is coming to London with you.')).toBe(true);
    // Ada's trip card lists who's coming.
    expect(playerView(w, 'u_a')!.holidays[0]!.guests).toEqual([
      expect.objectContaining({ id: 'u_b', name: 'Bola B', status: 'accepted', hostPays: true }),
    ]);

    // Cancelling the ticket Ada paid for gives her the money back.
    const a1 = bal(w, 'u_a');
    const c = run(w, 'u_b', { type: 'travel.cancel' });
    expect(c.result.returnedToHost).toBe(cost);
    expect(bal(c.world, 'u_b')).toBe(b0);
    expect(bal(c.world, 'u_a')).toBeGreaterThan(a1);
    expect(moneyByCurrency(c.world)).toEqual(total);
  });

  it('each pays their own: refused clearly when the guest can’t afford it; decline tells the host', () => {
    let w = setup();
    w = run(w, 'u_a', {
      type: 'holiday.invite',
      inviteeIds: ['u_b', 'u_c'],
      hostPays: false,
    }).world;
    const h = holidayOf(w);
    // Chi is broke (for this test only: money moved to the city's suppliers).
    const broke = structuredClone(w);
    const acc = broke.accounts[broke.players.u_c!.accounts.local]!;
    broke.accounts[broke.markets.lagos!.ext.suppliers]!.balance += acc.balance;
    acc.balance = 0;
    const no = tryRun(broke, 'u_c', { type: 'holiday.accept', holidayId: h.id });
    expect(no.ok).toBe(false);
    if (!no.ok) {
      expect(no.error.code).toBe('holiday.funds');
      expect(no.error.message).toContain('Ask Ada A to cover it, or decline.');
    }
    expect(playerView(broke, 'u_c')!.holidays[0]!.invite?.affordable).toBe(false);

    // Chi can afford it normally: she pays, Ada doesn't.
    const a0 = bal(w, 'u_a');
    const c0 = bal(w, 'u_c');
    const ok = run(w, 'u_c', { type: 'holiday.accept', holidayId: h.id });
    expect(bal(ok.world, 'u_a')).toBe(a0);
    expect(bal(ok.world, 'u_c')).toBe(c0 - ok.result.cost);
    expect(ok.world.players.u_c!.flightTicket?.sponsor).toBeUndefined();

    // Bola declines: Ada hears, and it's off Bola's list.
    w = run(ok.world, 'u_b', { type: 'holiday.decline', holidayId: h.id }).world;
    expect(w.inbox.u_a!.some((i) => i.text === 'Bola B can’t come to London this time.')).toBe(
      true,
    );
    expect(playerView(w, 'u_b')!.holidays).toEqual([]);
    expect(tryRun(w, 'u_b', { type: 'holiday.accept', holidayId: h.id }).ok).toBe(false);
  });

  it('refuses a guest already travelling elsewhere, with a clear message', () => {
    let w = setup();
    w = run(w, 'u_a', { type: 'holiday.invite', inviteeIds: ['u_b'], hostPays: true }).world;
    w = run(w, 'u_b', { type: 'travel.book', to: 'lagos' }).world;
    const r = tryRun(w, 'u_b', { type: 'holiday.accept', holidayId: holidayOf(w).id });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('holiday.busy');
      expect(r.error.message).toContain('You already have a ticket to Lagos');
    }
    expect(playerView(w, 'u_b')!.holidays[0]!.invite?.blocked).toContain('ticket to Lagos');
    // Abroad elsewhere: the same.
    w = run(w, 'u_b', { type: 'travel.fly', to: 'lagos' }).world;
    const r2 = tryRun(w, 'u_b', { type: 'holiday.accept', holidayId: holidayOf(w).id });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.message).toContain('You’re in Lagos right now');
  });

  it('together in London: same hotel, neighbouring rooms, an outing and the shared bonus', () => {
    let w = setup();
    w = run(w, 'u_a', { type: 'holiday.invite', inviteeIds: ['u_b'], hostPays: true }).world;
    const id = holidayOf(w).id;
    w = run(w, 'u_b', { type: 'holiday.accept', holidayId: id }).world;
    // Not there yet: nothing to do together.
    expect(
      tryRun(w, 'u_a', { type: 'holiday.together', holidayId: id, businessId: venue(w).id }).ok,
    ).toBe(false);
    w = run(w, 'u_a', { type: 'travel.fly', to: 'london' }).world;
    const alone = tryRun(w, 'u_a', {
      type: 'holiday.together',
      holidayId: id,
      businessId: venue(w).id,
    });
    expect(alone.ok).toBe(false);
    if (!alone.ok) expect(alone.error.code).toBe('holiday.alone');
    w = run(w, 'u_b', { type: 'travel.fly', to: 'london' }).world;
    expect(w.players.u_b!.location?.hotel?.name).toBe(w.players.u_a!.location?.hotel?.name);

    const va = playerView(w, 'u_a')!.holidays[0]!;
    expect(va.together).toBe(true);
    expect(va.companionsHere).toEqual([{ id: 'u_b', name: 'Bola B' }]);
    expect(va.rooms.u_b! - va.rooms.u_a!).toBe(1);
    expect(va.things.length).toBeGreaterThan(0);

    w = structuredClone(w);
    for (const p of ['u_a', 'u_b'])
      w.players[p]!.needs = { hunger: 50, hygiene: 50, fun: 30, social: 30 };
    const trust0 = w.players.u_a!.trust.u_b ?? 0;
    const b = venue(w);
    const plan = run(w, 'u_a', { type: 'holiday.together', holidayId: id, businessId: b.id });
    w = plan.world;
    expect(plan.result.hangoutId).toBeTruthy();
    expect(w.inbox.u_b!.some((i) => i.text.includes(`wants to go to ${b.name} together`))).toBe(
      true,
    );
    const funA = w.players.u_a!.needs!.fun;
    const join = run(w, 'u_b', { type: 'holiday.together', holidayId: id, businessId: b.id });
    w = join.world;
    expect(join.result.holiday).toMatchObject({ trust: HOLIDAY_TRUST, with: ['u_a'] });
    expect(join.result.holiday.happiness).toBeGreaterThan(0);
    // Both get it: fun (so happiness) up for the host too, trust both ways.
    expect(w.players.u_a!.needs!.fun).toBeGreaterThan(funA);
    expect(w.players.u_a!.trust.u_b).toBeCloseTo(trust0 + HOLIDAY_TRUST + 0.03);
    expect(w.players.u_b!.trust.u_a).toBeGreaterThan(0);
    const done = playerView(w, 'u_a')!.holidays[0]!.done;
    expect(done).toEqual([expect.objectContaining({ businessId: b.id, withMe: true })]);
    expect(done[0]!.members.map((m) => m.id)).toEqual(['u_a', 'u_b']);
  });

  it('expires at the end of the month; invitations persist for an offline guest until then', () => {
    let w = setup();
    w = run(w, 'u_a', { type: 'holiday.invite', inviteeIds: ['u_b'], hostPays: false }).world;
    // Later, still the same month: still waiting.
    expect(playerView(w, 'u_b')!.holidays).toHaveLength(1);
    w = settle(w, 'london', 1);
    expect(playerView(w, 'u_b')!.holidays).toEqual([]);
    const r = tryRun(w, 'u_b', { type: 'holiday.accept', holidayId: holidayOf(w).id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('holiday.expired');
  });

  it('replays to the same world', () => {
    const log: [string, Command][] = [
      ['u_a', { type: 'holiday.invite', inviteeIds: ['u_b', 'u_c'], hostPays: true }],
      ['u_b', { type: 'holiday.accept', holidayId: 'X' }],
      ['u_c', { type: 'holiday.decline', holidayId: 'X' }],
      ['u_a', { type: 'travel.fly', to: 'london' }],
      ['u_b', { type: 'travel.fly', to: 'london' }],
    ];
    const play = () => {
      let w = setup();
      for (const [who, cmd] of log) {
        const c = 'holidayId' in cmd ? { ...cmd, holidayId: holidayOf(w).id } : cmd;
        w = run(w, who, c, T0 + 1000).world;
      }
      return run(w, 'u_a', {
        type: 'holiday.together',
        holidayId: holidayOf(w).id,
        businessId: venue(w).id,
      }).world;
    };
    expect(play()).toEqual(play());
  });
});

// ---------------------------------------------------------------- Fly together, AI friends

const FLIGHT = { airline: 'Savanna Air', number: 'SV 123', time: '14:05', gate: 'B4' };

/** Ada (Lagos) books London on SV 123 with a business hotel; Bola (Nairobi), Chi (Lagos). */
function setupFlight(): World {
  let w = makeWorld(11, ['lagos', 'nairobi', 'london']);
  w = person(w, 'u_a', 'lagos', 'Ada A');
  w = person(w, 'u_b', 'nairobi', 'Bola B');
  w = person(w, 'u_c', 'lagos', 'Chi C');
  return run(w, 'u_a', { type: 'travel.book', to: 'london', hotel: 'business', flight: FLIGHT })
    .world;
}

/** A regular in Lagos whose means are tight / comfortable (by their number). */
const npcWith = (means: number, skip = 0) => {
  let found = 0;
  for (let n = 0; n < 500; n++)
    if (hashString(`npc:lagos:${n}:means`) % 3 === means && found++ === skip)
      return `npc:lagos:${n}`;
  throw new Error('none');
};

/** Make these people Ada's contacts (AI friends), at this warmth and trust. */
function befriend(w: World, ids: string[], warmth: number, trust: number): World {
  const x = structuredClone(w);
  const a = x.players.u_a!;
  const month = x.markets.lagos!.month;
  for (const id of ids) {
    const q = x.players[id];
    const kind = q?.ai ? 'founder' : 'local';
    (a.contacts ??= []).unshift({
      id: `${kind}:${id}`,
      kind,
      refId: id,
      name: q ? q.name : `Tunde ${id.slice(-3)}, Driver`,
      warmth,
      month,
    });
    a.trust[id] = trust;
  }
  return x;
}

describe('holiday: fly together', () => {
  it('a friend from the same city is booked on the host’s flight, in the next seat', () => {
    let w = setupFlight();
    expect(w.players.u_a!.flightTicket?.flight).toEqual(FLIGHT);
    w = run(w, 'u_a', {
      type: 'holiday.invite',
      inviteeIds: ['u_c', 'u_b'],
      hostPays: false,
    }).world;
    const id = holidayOf(w).id;
    const c = run(w, 'u_c', { type: 'holiday.accept', holidayId: id });
    w = c.world;
    expect(c.result.sameFlight).toBe(true);
    expect(c.result.message).toContain('You’re on Ada’s flight (SV 123), in the next seat.');
    expect(w.players.u_c!.flightTicket).toMatchObject({
      from: 'lagos',
      to: 'london',
      flight: FLIGHT,
      party: { holidayId: id },
    });
    // Bola flies from Nairobi: on their own, meeting the others there.
    const b = run(w, 'u_b', { type: 'holiday.accept', holidayId: id });
    w = b.world;
    expect(b.result.sameFlight).toBe(false);
    expect(w.players.u_b!.flightTicket?.party).toBeUndefined();

    const va = playerView(w, 'u_a')!.holidays[0]!;
    const vc = playerView(w, 'u_c')!.holidays[0]!;
    expect(va.flight).toMatchObject({ from: 'lagos', number: 'SV 123', airline: 'Savanna Air' });
    const row = Number(va.flight!.seat!.slice(0, -1));
    expect(va.flight!.seat).toBe(`${row}A`);
    expect(vc.flight!.seat).toBe(`${row}B`);
    expect(va.flight!.with).toEqual([{ id: 'u_c', name: 'Chi C', seat: `${row}B` }]);
    expect(vc.flight!.with).toEqual([{ id: 'u_a', name: 'Ada A', seat: `${row}A` }]);
    const bola = va.companions.find((x) => x.id === 'u_b')!;
    expect(bola).toMatchObject({ sameFlight: false, seat: null, from: 'nairobi', ai: false });
    expect(playerView(w, 'u_b')!.holidays[0]!.flight).toBeNull();
    // Each one's room next door; everyone drawn the same way.
    expect(va.companions.map((x) => x.room! - va.rooms.u_a!)).toEqual([1, 2]);
    expect(va.companions[0]!.appearance).toBeTruthy();

    // Chi cancels: off the flight.
    w = run(w, 'u_c', { type: 'travel.cancel' }).world;
    expect(playerView(w, 'u_a')!.holidays[0]!.flight).toBeNull();
  });
});

describe('holiday: AI friends', () => {
  it('only AI people in your contacts can be invited', () => {
    const w = setupFlight();
    const r = tryRun(w, 'u_a', {
      type: 'holiday.invite',
      inviteeIds: [npcWith(2)],
      hostPays: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('holiday.player');
  });

  it('a close, comfortable friend says yes at once: a companion on your flight, in the next room', () => {
    const tunde = npcWith(2);
    let w = befriend(setupFlight(), [tunde], 1, 1);
    const a0 = bal(w, 'u_a');
    const r = run(w, 'u_a', { type: 'holiday.invite', inviteeIds: [tunde], hostPays: false });
    w = r.world;
    expect(r.result.replies).toEqual([
      expect.objectContaining({ id: tunde, answer: 'yes', paid: 0 }),
    ]);
    expect(r.result.message).toContain('is coming with you.');
    expect(bal(w, 'u_a')).toBe(a0);
    // Their chat reply is in Ada's inbox.
    const reply = r.result.replies[0].text as string;
    expect(w.inbox.u_a!.some((i) => i.text.endsWith(`“${reply}”`))).toBe(true);
    const h = holidayOf(w);
    expect(h.guests[0]).toMatchObject({ id: tunde, status: 'accepted', ai: { answer: 'yes' } });
    const v = playerView(w, 'u_a')!.holidays[0]!;
    const row = Number(v.flight!.seat!.slice(0, -1));
    expect(v.companions).toEqual([
      expect.objectContaining({
        id: tunde,
        ai: true,
        kind: 'local',
        from: 'lagos',
        seat: `${row}B`,
        sameFlight: true,
        room: v.rooms.u_a! + 1,
      }),
    ]);
    expect(v.companions[0]!.appearance.skin).toBeTruthy();
    expect(v.guests[0]).toMatchObject({ ai: { answer: 'yes' } });

    // In London together: things to do with Tunde; the bonus is Ada's, trust rises.
    w = run(w, 'u_a', { type: 'travel.fly', to: 'london' }).world;
    const there = playerView(w, 'u_a')!.holidays[0]!;
    expect(there.together).toBe(true);
    expect(there.companionsHere.map((x) => x.id)).toEqual([tunde]);
    w = structuredClone(w);
    w.players.u_a!.needs = { hunger: 50, hygiene: 50, fun: 30, social: 30 };
    const out = run(w, 'u_a', {
      type: 'holiday.together',
      holidayId: h.id,
      businessId: venue(w).id,
    });
    expect(out.result.holiday).toMatchObject({ with: [tunde], trust: HOLIDAY_TRUST });
    expect(out.world.players.u_a!.trust[tunde]).toBe(1);
    expect(out.world.players.u_a!.needs!.fun).toBeGreaterThan(30);
    const done = playerView(out.world, 'u_a')!.holidays[0]!.done;
    expect(done[0]!.members.map((m) => m.id)).toEqual(['u_a', tunde]);
  });

  it('a friend short of money asks you to pay; paying for them goes through the ledger', () => {
    const tight = npcWith(0);
    let w = befriend(setupFlight(), [tight], 1, 1);
    const r = run(w, 'u_a', { type: 'holiday.invite', inviteeIds: [tight], hostPays: false });
    w = r.world;
    expect(r.result.replies[0]).toMatchObject({ answer: 'pay' });
    expect(r.result.message).toContain('would come if you pay.');
    expect(holidayOf(w).guests[0]!.status).toBe('declined');
    // Ask again, paying: yes, and Ada pays their fare and hotel to the airline and hotel.
    const total = moneyByCurrency(w);
    const a0 = bal(w, 'u_a');
    const again = run(w, 'u_a', { type: 'holiday.invite', inviteeIds: [tight], hostPays: true });
    w = again.world;
    expect(again.result.replies[0]).toMatchObject({ answer: 'yes' });
    const paid = again.result.replies[0].paid as number;
    expect(paid).toBeGreaterThan(0);
    expect(bal(w, 'u_a')).toBe(a0 - paid);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(holidayOf(w).guests[0]).toMatchObject({ status: 'accepted', paid });
  });

  it('a distant friend often can’t make it this month; the answer is the same on every replay', () => {
    const ids = [0, 1, 2, 3, 4, 5].map((k) => npcWith(2, k));
    const base = befriend(setupFlight(), ids, 0, 0);
    const go = () =>
      run(base, 'u_a', { type: 'holiday.invite', inviteeIds: ids, hostPays: true }).result
        .replies as { answer: string; text: string }[];
    const answers = go();
    expect(answers.map((x) => x.answer)).toEqual(go().map((x) => x.answer));
    const busy = answers.find((x) => x.answer === 'busy');
    expect(busy).toBeTruthy();
    expect([
      'I can’t make it this month, sorry. Next time!',
      'Ah, this month is packed for me. Have fun, send photos!',
    ]).toContain(busy!.text);
    expect(answers.some((x) => x.answer === 'yes')).toBe(true);
  });

  it('an AI founder in your contacts can come too, paying their own way', () => {
    const w0 = setupFlight();
    const ai = Object.values(w0.players).find((p) => p.ai && p.market === 'lagos')!;
    let w = befriend(w0, [ai.id], 1, 1);
    const total = moneyByCurrency(w);
    const r = run(w, 'u_a', { type: 'holiday.invite', inviteeIds: [ai.id], hostPays: false });
    w = r.world;
    expect(moneyByCurrency(w)).toEqual(total);
    const answer = r.result.replies[0].answer;
    expect(['yes', 'pay']).toContain(answer);
    if (answer === 'yes')
      expect(playerView(w, 'u_a')!.holidays[0]!.companions[0]).toMatchObject({
        id: ai.id,
        kind: 'founder',
        name: ai.name,
      });
  });
});

// ---------------------------------------------------------------- Knocking next door

/** Ada and Bola on holiday in London, both landed at the same hotel. */
function inLondon(): { w: World; id: string } {
  let w = setup();
  w = run(w, 'u_a', { type: 'holiday.invite', inviteeIds: ['u_b'], hostPays: true }).world;
  const id = holidayOf(w).id;
  w = run(w, 'u_b', { type: 'holiday.accept', holidayId: id }).world;
  w = run(w, 'u_a', { type: 'travel.fly', to: 'london' }).world;
  w = structuredClone(run(w, 'u_b', { type: 'travel.fly', to: 'london' }).world);
  for (const p of ['u_a', 'u_b'])
    w.players[p]!.needs = { hunger: 50, hygiene: 50, fun: 30, social: 30 };
  return { w, id };
}

describe('holiday: knocking next door', () => {
  it('A knocks; B is told and sees it; B opens: a visit in A’s room for both, the bonus once', () => {
    const s0 = inLondon();
    const id = s0.id;
    let w = s0.w;
    const rooms = playerView(w, 'u_a')!.holidays[0]!.rooms;
    const k = run(w, 'u_a', { type: 'hotel.knock', holidayId: id, playerId: 'u_b' }, T0 + 5);
    w = k.world;
    expect(k.result).toMatchObject({ answered: null, knock: { to: 'u_b', room: rooms.u_b } });
    expect(holidayOf(w).knocks).toEqual([
      { from: 'u_a', to: 'u_b', at: T0 + 5, room: rooms.u_b, status: 'pending' },
    ]);
    expect(
      w.inbox.u_b!.some((i) => i.text === `Ada A is knocking on your door (room ${rooms.u_b}).`),
    ).toBe(true);
    const vb = playerView(w, 'u_b')!.holidays[0]!;
    expect(vb.knocks).toEqual([{ from: 'u_a', name: 'Ada A', room: rooms.u_b, at: T0 + 5 }]);
    expect(playerView(w, 'u_a')!.holidays[0]!.myKnock).toMatchObject({
      to: 'u_b',
      name: 'Bola B',
      status: 'pending',
    });
    // Only the one knocked on can answer.
    expect(
      tryRun(w, 'u_a', { type: 'hotel.answer', holidayId: id, from: 'u_a', accept: true }).ok,
    ).toBe(false);

    const trust0 = w.players.u_a!.trust.u_b ?? 0;
    const open = run(
      w,
      'u_b',
      { type: 'hotel.answer', holidayId: id, from: 'u_a', accept: true },
      T0 + 9,
    );
    w = open.world;
    expect(open.result).toMatchObject({ accepted: true, visit: { host: 'u_a', guest: 'u_b' } });
    expect(open.result.bonus.happiness).toBeGreaterThan(0);
    expect(holidayOf(w).visit).toEqual({ host: 'u_a', guest: 'u_b', since: T0 + 9 });
    expect(holidayOf(w).knocks).toEqual([]);
    for (const p of ['u_a', 'u_b']) {
      expect(w.players[p]!.needs!.fun).toBeGreaterThan(30);
      expect(w.players[p]!.needs!.social).toBeGreaterThan(30);
      const v = playerView(w, p)!.holidays[0]!;
      expect(v.visit).toMatchObject({
        host: { id: 'u_a', room: rooms.u_a },
        guest: { id: 'u_b', name: 'Bola B' },
        me: p === 'u_a' ? 'host' : 'guest',
      });
      expect(v.knocks).toEqual([]);
    }
    expect(w.players.u_a!.trust.u_b).toBeGreaterThan(trust0);
    expect(w.inbox.u_a!.some((i) => i.text.includes('opened the door and came over'))).toBe(true);
    // One visit at a time.
    const again = tryRun(w, 'u_a', { type: 'hotel.knock', holidayId: id, playerId: 'u_b' });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('hotel.visiting');

    // A says goodbye: the visit ends for both; B is told.
    const bye = run(w, 'u_a', { type: 'hotel.leave', holidayId: id });
    w = bye.world;
    expect(bye.result.message).toBe(`Bola went back to room ${rooms.u_b}.`);
    expect(holidayOf(w).visit).toBeUndefined();
    expect(playerView(w, 'u_b')!.holidays[0]!.visit).toBeNull();
    expect(w.inbox.u_b!.some((i) => i.text.startsWith('Ada A said goodbye'))).toBe(true);
    expect(tryRun(w, 'u_a', { type: 'hotel.leave', holidayId: id }).ok).toBe(false);

    // Again the same holiday: a visit, but the bonus was once.
    w = run(w, 'u_b', { type: 'hotel.knock', holidayId: id, playerId: 'u_a' }).world;
    const fun = w.players.u_a!.needs!.fun;
    const twice = run(w, 'u_a', { type: 'hotel.answer', holidayId: id, from: 'u_b', accept: true });
    expect(twice.result.bonus).toBeUndefined();
    expect(twice.world.players.u_a!.needs!.fun).toBe(fun);
    expect(holidayOf(twice.world).visit).toMatchObject({ host: 'u_b', guest: 'u_a' });
  });

  it('not now: the knocker is told; both must be in the city, on the holiday, with a hotel', () => {
    const s0 = inLondon();
    const id = s0.id;
    let w = s0.w;
    // Chi isn't on the holiday.
    expect(tryRun(w, 'u_a', { type: 'hotel.knock', holidayId: id, playerId: 'u_c' }).ok).toBe(
      false,
    );
    w = run(w, 'u_a', { type: 'hotel.knock', holidayId: id, playerId: 'u_b' }).world;
    const no = run(w, 'u_b', { type: 'hotel.answer', holidayId: id, from: 'u_a', accept: false });
    w = no.world;
    expect(no.result.accepted).toBe(false);
    expect(holidayOf(w).visit).toBeUndefined();
    expect(w.inbox.u_a!.some((i) => i.text === 'Bola B can’t come over right now.')).toBe(true);
    expect(playerView(w, 'u_a')!.holidays[0]!.myKnock).toMatchObject({ status: 'declined' });
    expect(playerView(w, 'u_b')!.holidays[0]!.knocks).toEqual([]);
    // Answered already.
    expect(
      tryRun(w, 'u_b', { type: 'hotel.answer', holidayId: id, from: 'u_a', accept: true }).ok,
    ).toBe(false);

    // Bola flies home: no knocking on an empty room; a visit ends when one leaves the city.
    const home = run(w, 'u_b', { type: 'travel.fly', to: 'nairobi' }).world;
    const away = tryRun(home, 'u_a', { type: 'hotel.knock', holidayId: id, playerId: 'u_b' });
    expect(away.ok).toBe(false);
    if (!away.ok) expect(away.error.code).toBe('hotel.away');
    w = run(w, 'u_a', { type: 'hotel.knock', holidayId: id, playerId: 'u_b' }).world;
    w = run(w, 'u_b', { type: 'hotel.answer', holidayId: id, from: 'u_a', accept: true }).world;
    w = run(w, 'u_b', { type: 'travel.fly', to: 'nairobi' }).world;
    expect(playerView(w, 'u_a')!.holidays[0]!.visit).toBeNull();

    // No hotel booked: no rooms to knock on.
    let f = makeWorld(11, ['lagos', 'nairobi', 'london']);
    f = person(f, 'u_a', 'lagos', 'Ada A');
    f = person(f, 'u_c', 'lagos', 'Chi C');
    f = run(f, 'u_a', { type: 'travel.book', to: 'london' }).world;
    f = run(f, 'u_a', { type: 'holiday.invite', inviteeIds: ['u_c'], hostPays: true }).world;
    const hid = holidayOf(f).id;
    f = run(f, 'u_c', { type: 'holiday.accept', holidayId: hid }).world;
    f = run(f, 'u_a', { type: 'travel.fly', to: 'london' }).world;
    f = run(f, 'u_c', { type: 'travel.fly', to: 'london' }).world;
    const none = tryRun(f, 'u_a', { type: 'hotel.knock', holidayId: hid, playerId: 'u_c' });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error.code).toBe('hotel.none');
  });

  it('an AI friend next door answers at once, mostly yes, the same on every replay', () => {
    const tunde = npcWith(2);
    let w = befriend(setupFlight(), [tunde], 1, 1);
    w = run(w, 'u_a', { type: 'holiday.invite', inviteeIds: [tunde], hostPays: false }).world;
    const id = holidayOf(w).id;
    // Not in London yet.
    expect(tryRun(w, 'u_a', { type: 'hotel.knock', holidayId: id, playerId: tunde }).ok).toBe(
      false,
    );
    w = run(w, 'u_a', { type: 'travel.fly', to: 'london' }).world;
    const answers = Array.from({ length: 40 }, (_, i) => {
      const r = run(w, 'u_a', { type: 'hotel.knock', holidayId: id, playerId: tunde }, T0 + i);
      const again = run(w, 'u_a', { type: 'hotel.knock', holidayId: id, playerId: tunde }, T0 + i);
      expect(again.world).toEqual(r.world);
      return r;
    });
    const yes = answers.filter((r) => r.result.answered === 'yes');
    expect(yes.length).toBeGreaterThan(25);
    expect(yes.length).toBeLessThan(40);
    const r = yes[0]!;
    expect(r.result.message).toContain('opened the door and came over from room');
    expect(holidayOf(r.world).visit).toMatchObject({ host: 'u_a', guest: tunde });
    expect(r.result.bonus.trust).toBe(HOLIDAY_TRUST);
    expect(playerView(r.world, 'u_a')!.holidays[0]!.visit?.me).toBe('host');
    const no = answers.find((x) => x.result.answered === 'no')!;
    expect(holidayOf(no.world).visit).toBeUndefined();
    expect(playerView(no.world, 'u_a')!.holidays[0]!.myKnock?.status).toBe('declined');
    // Goodbye ends it.
    const bye = run(r.world, 'u_a', { type: 'hotel.leave', holidayId: id });
    expect(holidayOf(bye.world).visit).toBeUndefined();
  });
});
