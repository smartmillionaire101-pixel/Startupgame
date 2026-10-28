/**
 * Playtest round 7, the table games:
 *
 * #16 "Quiz night: can't find an opponent". Quick play matched a waiting
 * quiz at the same venue only, and the lobby listed only that venue's
 * tables: two players looking for a quiz in the same city at two venues
 * each opened a table of their own and never met. AI players also started
 * the quiz the moment they sat down, so a player arriving later could never
 * take the seat. The gameplay round matches any waiting quiz in the city
 * (this venue's first), seats AI players after 30 s and starts 15 s later,
 * and a real player joining by then takes an AI's seat.
 *
 * #18 "Cancel didn't end the game": a game nobody has played yet can be
 * cancelled (entries and the lane fee back, no forfeit); once anyone has
 * played, leaving forfeits it.
 *
 * #23 Play a game from Messages: a table made for an invitation, the
 * invitee's answer (Accept, Decline, from anywhere), stakes held in the pot
 * and paid out, and the invitation's expiry with the stakes back.
 */
import { describe, expect, it } from 'vitest';
import { FEEDBACK_NOTE, GAMEPLAY_NOTE } from '../src/releases.js';
import { PLAY_IDLE_MS, QUIZ_AI_SEAT_AFTER, QUIZ_TAKEOVER_MS } from '../src/play.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { T0, addFounder, makeWorld, moneyByCurrency, run, tryRun } from './helpers.js';

const announce = (w: World, id: string) =>
  run(w, null, { type: 'system.announce', id, text: 'New release.' }).world;
const balance = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;
const venues = (w: World) =>
  Object.values(w.markets.lagos!.businesses ?? {}).filter((b) => b.kind !== 'bowling-alley');
const alley = (w: World) =>
  Object.values(w.markets.lagos!.businesses ?? {}).find((b) => b.kind === 'bowling-alley')!;

function world(note: string = GAMEPLAY_NOTE) {
  let w = announce(makeWorld(3, ['lagos', 'nairobi']), note);
  w = addFounder(w, 'host');
  w = addFounder(w, 'ada', 'lagos', 'Ada Labs');
  return w;
}

describe('quiz night: finding an opponent', () => {
  it('pairs two players looking at once, at the same venue or another one in the city', () => {
    for (const other of [0, 1]) {
      let w = world();
      const [a, b] = [venues(w)[0]!.id, venues(w)[other]!.id];
      const first = run(w, 'host', { type: 'play.match', venue: a, stake: 0 });
      w = first.world;
      expect(first.result.joined).toBe(false);
      // The other player sees the waiting table in their lobby.
      expect(playerView(w, 'ada')!.playRooms.map((r) => r.id)).toContain(first.result.id);
      const second = run(w, 'ada', { type: 'play.match', venue: b, stake: 0 });
      w = second.world;
      expect(second.result).toEqual({ id: first.result.id, joined: true });
      expect(w.playRooms![first.result.id]!.members.map((m) => m.id)).toEqual(['host', 'ada']);
    }
  });

  it('before the gameplay round, players at different venues never met (the cause)', () => {
    let w = world(FEEDBACK_NOTE);
    const [a, b] = [venues(w)[0]!.id, venues(w)[1]!.id];
    const first = run(w, 'host', { type: 'play.match', venue: a, stake: 0 });
    w = first.world;
    const second = run(w, 'ada', { type: 'play.match', venue: b, stake: 0 });
    expect(second.result.joined).toBe(false);
    expect(second.result.id).not.toBe(first.result.id);
  });

  it('seats AI players after 30 s, and a real player can take a seat until the quiz starts', () => {
    let w = world();
    const before = moneyByCurrency(w);
    const venue = venues(w)[0]!.id;
    const made = run(w, 'host', { type: 'play.match', venue, stake: 5_000 });
    w = made.world;
    const id = made.result.id as string;
    // Too early: nothing happens.
    w = run(w, 'host', { type: 'play.sync', roomId: id }, T0 + QUIZ_AI_SEAT_AFTER - 1_000).world;
    expect(w.playRooms![id]!.members).toHaveLength(1);
    expect(playerView(w, 'host')!.playRooms.find((r) => r.id === id)!.autoAt).toBe(
      w.playRooms![id]!.createdAt + QUIZ_AI_SEAT_AFTER,
    );
    const seatAt = T0 + QUIZ_AI_SEAT_AFTER;
    w = run(w, 'host', { type: 'play.sync', roomId: id }, seatAt).world;
    let r = w.playRooms![id]!;
    expect(r.status).toBe('waiting');
    expect(r.ai!.length).toBeGreaterThan(0);
    expect(r.startAt).toBe(seatAt + QUIZ_TAKEOVER_MS);
    const ais = r.ai!.length;
    const lastAi = r.ai!.at(-1)!;
    const aiBefore = balance(w, lastAi);
    // Ada joins before the start: the last AI player gives her its seat (and gets its stake back).
    w = run(w, 'ada', { type: 'play.match', venue, stake: 5_000 }, seatAt + 5_000).world;
    r = w.playRooms![id]!;
    expect(r.members.map((m) => m.id)).toContain('ada');
    expect(r.members.map((m) => m.id)).not.toContain(lastAi);
    expect(r.ai).toHaveLength(ais - 1);
    expect(balance(w, lastAi)).toBe(aiBefore + 5_000);
    expect(w.accounts[r.escrow]!.balance).toBe(5_000 * r.members.length);
    // The quiz starts on time with whoever is seated.
    w = run(w, 'ada', { type: 'play.sync', roomId: id }, r.startAt! - 1).world;
    expect(w.playRooms![id]!.status).toBe('waiting');
    w = run(w, 'ada', { type: 'play.sync', roomId: id }, r.startAt!).world;
    expect(w.playRooms![id]!.status).toBe('playing');
    expect(moneyByCurrency(w)).toEqual(before);
  });
});

describe('cancelling a table game', () => {
  it('cancels a game nobody has played yet: stakes and lane fees back, no forfeit', () => {
    let w = world();
    const before = moneyByCurrency(w);
    const host0 = balance(w, 'host');
    const made = run(w, 'host', {
      type: 'play.create',
      game: 'bowling',
      venue: alley(w).id,
      title: 'Bowling against AI',
      stake: 5_000,
    });
    const id = made.result.id as string;
    w = run(made.world, 'host', { type: 'play.ai', roomId: id }).world;
    const r = w.playRooms![id]!;
    expect(r.status).toBe('playing');
    expect(r.bowling!.fee).toBeGreaterThan(0);
    const ai = r.ai![0]!;
    const ai0 = balance(made.world, ai);
    expect(playerView(w, 'host')!.playRooms.find((x) => x.id === id)!.fresh).toBe(true);
    w = run(w, 'host', { type: 'play.cancel', roomId: id }).world;
    const done = w.playRooms![id]!;
    expect(done.status).toBe('cancelled');
    expect(done.forfeitBy).toBeUndefined();
    expect(done.winners).toEqual([]);
    expect(balance(w, 'host')).toBe(host0);
    expect(balance(w, ai)).toBe(ai0);
    expect(moneyByCurrency(w)).toEqual(before);
  });

  it('once anyone has played, cancel is refused and leaving forfeits', () => {
    let w = world();
    const made = run(w, 'host', {
      type: 'play.create',
      game: 'bowling',
      venue: alley(w).id,
      title: 'Bowling against AI',
      stake: 5_000,
    });
    const id = made.result.id as string;
    w = run(made.world, 'host', { type: 'play.ai', roomId: id }).world;
    w = run(w, 'host', {
      type: 'play.bowl',
      roomId: id,
      round: w.playRooms![id]!.round,
      x: 0,
      aim: 0,
      power: 0.6,
      spin: 0,
    }).world;
    expect(playerView(w, 'host')!.playRooms.find((x) => x.id === id)!.fresh).toBe(false);
    const refused = tryRun(w, 'host', { type: 'play.cancel', roomId: id });
    expect(refused.ok).toBe(false);
    w = run(w, 'host', { type: 'play.leave', roomId: id }).world;
    expect(w.playRooms![id]!.forfeitBy).toBe('host');
    expect(w.playRooms![id]!.status).toBe('finished');
  });

  it('before the gameplay round, a started game could not be cancelled', () => {
    let w = world(FEEDBACK_NOTE);
    const made = run(w, 'host', {
      type: 'play.create',
      game: 'bowling',
      venue: alley(w).id,
      title: 'Bowling against AI',
      stake: 0,
    });
    w = run(made.world, 'host', { type: 'play.ai', roomId: made.result.id }).world;
    expect(tryRun(w, 'host', { type: 'play.cancel', roomId: made.result.id }).ok).toBe(false);
  });
});

describe('a game from Messages', () => {
  const invite = (w: World, stake = 10_000) =>
    run(w, 'host', {
      type: 'play.create',
      game: 'quiz',
      venue: venues(w)[0]!.id,
      title: 'Quiz with Ada',
      stake,
      invite: 'ada',
    });

  it('accepted: both at the same table, stakes in the pot, the winner paid', () => {
    let w = world();
    const before = moneyByCurrency(w);
    const host0 = balance(w, 'host');
    const ada0 = balance(w, 'ada');
    const made = invite(w);
    w = made.world;
    const id = made.result.id as string;
    expect(w.playRooms![id]!.byInvite).toBe(true);
    expect(w.accounts[w.playRooms![id]!.escrow]!.balance).toBe(10_000);
    // Ada has the invitation (and a notice); nobody else sees the table.
    const asked = playerView(w, 'ada')!.playInvites;
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ id, game: 'quiz', hostName: 'Ada Founder', stake: 10_000 });
    expect(w.inbox.ada!.some((n) => n.text.includes('invites you to a quiz'))).toBe(true);
    let other = addFounder(w, 'kemi', 'lagos', 'Kemi Labs');
    expect(playerView(other, 'kemi')!.playRooms.some((r) => r.id === id)).toBe(false);
    expect(tryRun(other, 'kemi', { type: 'play.join', roomId: id }).ok).toBe(false);
    // Quick play never matches it either.
    other = run(other, 'kemi', {
      type: 'play.match',
      venue: venues(w)[0]!.id,
      stake: 10_000,
    }).world;
    expect(other.playRooms![id]!.members).toHaveLength(1);
    // Ada accepts: her stake joins the pot, the host hears it, either of them starts.
    w = run(w, 'ada', { type: 'play.join', roomId: id }).world;
    let r = w.playRooms![id]!;
    expect(r.members.map((m) => m.id)).toEqual(['host', 'ada']);
    expect(r.invited).toEqual([]);
    expect(w.accounts[r.escrow]!.balance).toBe(20_000);
    expect(w.inbox.host!.some((n) => n.text.includes('accepted your invitation'))).toBe(true);
    expect(playerView(w, 'ada')!.playInvites).toEqual([]);
    w = run(w, 'ada', { type: 'play.start', roomId: id }).world;
    // The host knows every answer; Ada none.
    for (let q = 0; q < r.questions.length; q++) {
      r = w.playRooms![id]!;
      const right = r.questions[r.round]!.answer;
      const t = T0 + 1_000 + q * 1_000;
      w = run(
        w,
        'host',
        { type: 'play.answer', roomId: id, round: r.round, choice: right },
        t,
      ).world;
      w = run(
        w,
        'ada',
        { type: 'play.answer', roomId: id, round: r.round, choice: (right + 1) % 4 },
        t,
      ).world;
    }
    r = w.playRooms![id]!;
    expect(r.status).toBe('finished');
    expect(r.winners).toEqual(['host']);
    expect(balance(w, 'host')).toBe(host0 + 10_000);
    expect(balance(w, 'ada')).toBe(ada0 - 10_000);
    expect(moneyByCurrency(w)).toEqual(before);
  });

  it('declined from another city: the table is off and the stake is back', () => {
    let w = world();
    const host0 = balance(w, 'host');
    const made = invite(w);
    w = run(made.world, 'ada', { type: 'travel.fly', to: 'nairobi' }).world;
    const asked = playerView(w, 'ada')!.playInvites[0]!;
    expect(asked.here).toBe(false);
    // She must travel to sit at it …
    expect(tryRun(w, 'ada', { type: 'play.join', roomId: made.result.id }).ok).toBe(false);
    // … but can say no from anywhere.
    w = run(w, 'ada', { type: 'play.decline', roomId: made.result.id }).world;
    expect(w.playRooms![made.result.id]!.status).toBe('cancelled');
    expect(balance(w, 'host')).toBe(host0);
    expect(w.inbox.host!.some((n) => n.text.includes('declined your invitation'))).toBe(true);
  });

  it('cancelled by the host before it starts: the stake is back and the invitee hears it', () => {
    let w = world();
    const host0 = balance(w, 'host');
    const made = invite(w);
    w = run(made.world, 'host', { type: 'play.cancel', roomId: made.result.id }).world;
    expect(w.playRooms![made.result.id]!.status).toBe('cancelled');
    expect(balance(w, 'host')).toBe(host0);
    expect(w.inbox.ada!.some((n) => n.text.includes('called off'))).toBe(true);
    expect(playerView(w, 'ada')!.playInvites).toEqual([]);
  });

  it('unanswered for 30 minutes: it expires, stake back, both told', () => {
    let w = world();
    const host0 = balance(w, 'host');
    const made = invite(w);
    w = made.world;
    expect(playerView(w, 'ada')!.playInvites[0]!.expiresAt).toBe(T0 + PLAY_IDLE_MS);
    w = run(w, 'host', { type: 'play.sync', roomId: made.result.id }, T0 + PLAY_IDLE_MS + 1).world;
    expect(w.playRooms![made.result.id]!.status).toBe('cancelled');
    expect(balance(w, 'host')).toBe(host0);
    expect(w.inbox.host!.some((n) => n.text.includes('Nobody answered'))).toBe(true);
    expect(w.inbox.ada!.some((n) => n.text.includes('has expired'))).toBe(true);
  });

  it('also asks a player to a waiting table from the lobby (play.invite)', () => {
    let w = world();
    const made = run(w, 'host', { type: 'play.match', venue: venues(w)[0]!.id, stake: 0 });
    w = run(made.world, 'host', {
      type: 'play.invite',
      roomId: made.result.id,
      playerId: 'ada',
    }).world;
    expect(playerView(w, 'ada')!.playInvites.map((x) => x.id)).toEqual([made.result.id]);
    // Declining a lobby invitation leaves the host's table open.
    w = run(w, 'ada', { type: 'play.decline', roomId: made.result.id }).world;
    expect(w.playRooms![made.result.id]!.status).toBe('waiting');
  });

  it('before the gameplay round, an invite on a quiz table changed nothing', () => {
    const w = world(FEEDBACK_NOTE);
    const made = invite(w);
    const r = made.world.playRooms![made.result.id]!;
    expect(r.byInvite).toBeUndefined();
    expect(r.invited).toBeUndefined();
  });
});
