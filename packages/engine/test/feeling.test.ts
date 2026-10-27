/**
 * Play-test #12: "'Your day' says 'Feeling great' with Mood 21, Hunger 0,
 * Hygiene 0", and no warning came as mood fell. With the feedback release,
 * feeling great needs your needs met too, a low mood is named, and the
 * needs and mood warn before they run out. Older worlds are untouched.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { barEdge, barEffects } from '../src/lifebars.js';
import { FEEDBACK_NOTE, LIFE_BARS_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { Player, World } from '../src/types.js';
import { addFounder, makeWorld, run, settle } from './helpers.js';

const F = 'u_founder';
const announce = (w: World, note: string) =>
  run(w, null, { type: 'system.announce', id: note, text: 'Release.' }).world;
const world = (note: string) => addFounder(announce(makeWorld(42, ['lagos']), note));
const me = (w: World): Player => w.players[F]!;
/** Rested and calm, but starving and unwashed (the play-test's founder). */
const neglected = (w: World) =>
  produce(w, (d) => {
    const p = me(d);
    p.energy = 90;
    p.stress = 20;
    p.needs = { hunger: 0, hygiene: 0, fun: 5, social: 10 };
  });

describe('feeling great (play-test #12)', () => {
  it('is not "feeling great" with empty needs and a low mood, after the feedback note', () => {
    const w = neglected(world(FEEDBACK_NOTE));
    const ids = playerView(w, F)!.me.barEffects!.map((e) => e.id);
    expect(ids).not.toContain('feeling-great');
    expect(ids).toContain('low-mood');
    expect(barEdge(me(w), true)).toBeLessThan(barEdge(me(w), false));
  });

  it('still feels great when rested, calm and cared for', () => {
    const w = world(FEEDBACK_NOTE);
    expect(playerView(w, F)!.me.barEffects!.map((e) => e.id)).toContain('feeling-great');
  });

  it('keeps the old rule in a world before the feedback note', () => {
    const w = neglected(world(LIFE_BARS_NOTE));
    const ids = playerView(w, F)!.me.barEffects!.map((e) => e.id);
    expect(ids).toContain('feeling-great');
    expect(ids).not.toContain('low-mood');
    expect(barEffects(me(w)).map((e) => e.id)).toContain('feeling-great');
  });
});

describe('low needs warn before they run out (play-test #12)', () => {
  const notes = (w: World) => (w.inbox[F] ?? []).map((i) => i.text);
  const hungry = 'You’re hungry. Cook, order in or eat out.';
  const low = (t: string) => t.startsWith('You’re feeling low');
  const needs = (w: World, n: Player['needs'], energy = 60) =>
    produce(w, (d) => {
      me(d).needs = n;
      me(d).energy = energy;
    });
  /** Hunger 60 falls to 25 at month end: under 40, a month before it would run out. */
  const peckish = { hunger: 60, hygiene: 90, fun: 90, social: 90 };
  /** Mood 36 now, in the teens after a month. */
  const slipping = { hunger: 40, hygiene: 35, fun: 30, social: 25 };

  it('warns a month before hunger runs out, and when the mood falls low', () => {
    const w = settle(needs(world(FEEDBACK_NOTE), peckish), 'lagos', 1);
    expect(me(w).needs!.hunger).toBeGreaterThan(0);
    expect(notes(w)).toContain(hungry);
    const m = settle(needs(world(FEEDBACK_NOTE), slipping, 50), 'lagos', 1);
    expect(notes(m).filter(low)).toHaveLength(1);
  });

  it('warns only when the need is nearly empty in an older world', () => {
    const w = settle(needs(world(LIFE_BARS_NOTE), peckish), 'lagos', 1);
    expect(notes(w)).not.toContain(hungry);
    const m = settle(needs(world(LIFE_BARS_NOTE), slipping, 50), 'lagos', 1);
    expect(notes(m).filter(low)).toHaveLength(0);
  });
});
