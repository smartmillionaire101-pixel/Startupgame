/**
 * Play-test round 6, #4: closing a bowling game with × left the room under
 * way; every other game was then refused ("Finish or cancel your current
 * room first") and a started game could not be left at all. Leaving a game
 * under way now forfeits it, from anywhere, and the view names the game
 * you're still in.
 */
import { describe, expect, it } from 'vitest';
import { FEEDBACK_NOTE, MORE_GAMES_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { addFounder, makeWorld, moneyByCurrency, run, tryRun } from './helpers.js';

const announce = (w: World, id: string) =>
  run(w, null, { type: 'system.announce', id, text: 'New release.' }).world;
const alley = (w: World) =>
  Object.values(w.markets.lagos!.businesses ?? {}).find(
    (b) => b.landmark?.startsWith('games-') && b.kind === 'bowling-alley',
  )!;
const balance = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;

function world(note: string = FEEDBACK_NOTE) {
  let w = announce(makeWorld(3, ['lagos', 'nairobi']), note);
  w = addFounder(w, 'host');
  w = addFounder(w, 'ada', 'lagos', 'Ada Labs');
  return w;
}

function bowlSolo(w: World) {
  const made = run(w, 'host', {
    type: 'play.create',
    game: 'bowling',
    venue: alley(w).id,
    title: 'Just me',
    stake: 0,
  });
  const id = made.result.id as string;
  return { w: run(made.world, 'host', { type: 'play.start', roomId: id }).world, id };
}

describe('leaving a game', () => {
  it('ends a solo game under way, and you can play something else straight after', () => {
    const solo = bowlSolo(world());
    let w = solo.w;
    expect(w.playRooms![solo.id]!.status).toBe('playing');
    // The view names the game you're in, wherever you are.
    expect(playerView(w, 'host')!.myPlayRoom).toMatchObject({
      id: solo.id,
      status: 'playing',
      host: true,
    });
    // Another game is refused, naming the one you're still in.
    const quiz = { type: 'play.match', venue: alley(w).id, stake: 0 } as const;
    const refused = tryRun(w, 'host', quiz);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.message).toContain('Just me');
    w = run(w, 'host', { type: 'play.leave', roomId: solo.id }).world;
    expect(w.playRooms![solo.id]!.status).toBe('cancelled');
    expect(playerView(w, 'host')!.myPlayRoom).toBeNull();
    expect(bowlSolo(w).w.playRooms).toBeTruthy();
  });

  it('forfeits a game with others: they win the pot, and the ledger balances', () => {
    let w = world();
    const before = moneyByCurrency(w);
    const made = run(w, 'host', {
      type: 'play.create',
      game: 'bowling',
      venue: alley(w).id,
      title: 'Friends',
      stake: 10_000,
    });
    const id = made.result.id as string;
    w = run(made.world, 'ada', { type: 'play.join', roomId: id }).world;
    w = run(w, 'host', { type: 'play.start', roomId: id }).world;
    // Ada flies to Nairobi and leaves from there.
    w = run(w, 'ada', { type: 'travel.fly', to: 'nairobi' }).world;
    const ada0 = balance(w, 'ada');
    w = run(w, 'ada', { type: 'play.leave', roomId: id }).world;
    const r = w.playRooms![id]!;
    expect(r.status).toBe('finished');
    expect(r.winners).toEqual(['host']);
    expect(r.forfeitBy).toBe('ada');
    expect(balance(w, 'ada')).toBe(ada0);
    expect(w.accounts[r.escrow]!.balance).toBe(0);
    expect(moneyByCurrency(w)).toEqual(before);
  });

  it('calls off a table its host leaves before it starts (feedback round)', () => {
    let w = world();
    const made = run(w, 'host', {
      type: 'play.create',
      game: 'bowling',
      venue: alley(w).id,
      title: 'Later',
      stake: 5_000,
    });
    const id = made.result.id as string;
    const host0 = balance(made.world, 'host');
    w = run(made.world, 'host', { type: 'play.leave', roomId: id }).world;
    expect(w.playRooms![id]!.status).toBe('cancelled');
    expect(balance(w, 'host')).toBe(host0 + 5_000);
    // Worlds before the feedback round: the host just steps away, as before.
    let old = world(MORE_GAMES_NOTE);
    const m2 = run(old, 'host', {
      type: 'play.create',
      game: 'bowling',
      venue: alley(old).id,
      title: 'Later',
      stake: 5_000,
    });
    old = run(m2.world, 'host', { type: 'play.leave', roomId: m2.result.id }).world;
    expect(old.playRooms![m2.result.id]!.status).toBe('waiting');
  });
});
