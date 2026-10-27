/**
 * Play-test round 6, #36: two plain straight swipes, two strikes, and the
 * sheet still read 0. With the feedback round the pin deck carries less (a
 * hook into the pocket strikes far more often than a straight ball), and the
 * view says what the sheet reads so far, bonus balls included.
 */
import { describe, expect, it } from 'vitest';
import { FULL_RACK, aimFor, bowlingGame, launchOf, simulateBowl } from '../src/bowling.js';
import { FEEDBACK_NOTE, MORE_GAMES_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { T0, addFounder, makeWorld, run } from './helpers.js';

/** Strikes out of straight balls (or hooks) entering across the pocket, ±22 cm. */
function strikeRate(deck: 'lively' | 'true', spin: number, x0: number) {
  let strikes = 0;
  let n = 0;
  for (let e = -0.22; e <= 0.221; e += 0.01) {
    const aim = spin ? aimFor(x0, 0.8, spin, e) : 0;
    const l = launchOf({ x: spin ? x0 : e, aim, power: 0.8, spin });
    if (simulateBowl(FULL_RACK, l, false, deck).knocked.length === 10) strikes++;
    n++;
  }
  return strikes / n;
}

describe('bowling: the pin deck', () => {
  it('rewards a hook over a plain straight ball (feedback round)', () => {
    const straight = strikeRate('true', 0, 0);
    const hook = strikeRate('true', -0.6, 0.3);
    expect(straight).toBeLessThan(0.2);
    expect(hook).toBeGreaterThan(straight * 1.8);
    // The deck as it first shipped: a straight ball struck a third of the time.
    expect(strikeRate('lively', 0, 0)).toBeGreaterThan(0.3);
  });

  it('rolls old worlds on the old deck, so their games replay the same', () => {
    const announce = (w: World, id: string) =>
      run(w, null, { type: 'system.announce', id, text: 'New release.' }).world;
    for (const [note, deck] of [
      [MORE_GAMES_NOTE, 'lively'],
      [FEEDBACK_NOTE, 'true'],
    ] as const) {
      let w = addFounder(announce(makeWorld(9, ['lagos']), note), 'host');
      const lane = Object.values(w.markets.lagos!.businesses!).find(
        (b) => b.kind === 'bowling-alley' && b.landmark?.startsWith('games-'),
      )!;
      const made = run(w, 'host', {
        type: 'play.create',
        game: 'bowling',
        venue: lane.id,
        title: 'Me',
        stake: 0,
      });
      const id = made.result.id as string;
      w = run(made.world, 'host', { type: 'play.start', roomId: id }).world;
      w = run(
        w,
        'host',
        { type: 'play.bowl', roomId: id, round: 0, x: 0.05, aim: 0, power: 0.8, spin: 0 },
        T0 + 2_000,
      ).world;
      const B = w.playRooms![id]!.bowling!;
      const view = playerView(w, 'host')!.playRooms.find((r) => r.id === id)!.bowling!;
      expect(view.deck).toBe(deck);
      expect(B.last!.knocked).toEqual(
        simulateBowl(B.last!.standing, B.last!.launch, false, deck).knocked,
      );
    }
  });
});

describe('bowling: the sheet so far', () => {
  it('counts strikes and spares with the bonus balls bowled so far', () => {
    const two = bowlingGame([10, 10]);
    expect(two.score).toBe(0);
    expect(two.soFar).toBe(30);
    expect(bowlingGame([10, 10, 10]).soFar).toBe(60);
    expect(bowlingGame([10, 10, 10]).score).toBe(30);
    expect(bowlingGame([7, 3]).soFar).toBe(10);
    expect(bowlingGame([7, 3, 4]).soFar).toBe(18);
    expect(bowlingGame([7, 2]).soFar).toBe(9);
    const perfect = bowlingGame(Array(12).fill(10));
    expect(perfect.soFar).toBe(perfect.score);
  });
});
