/**
 * Play-test fixes for investors (feedback round, FEEDBACK_NOTE): a new angel
 * starts at the bottom of the ladder and on Journey chapter 1, and shares
 * bought on the stock market aren't "backing a startup".
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { establishedId } from '../src/established.js';
import { isEstablished } from '../src/helpers.js';
import { FEEDBACK_NOTE, INVESTOR_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { makeWorld, run } from './helpers.js';

const I = 'u_investor';
const announce = (w: World, id: string) =>
  run(w, null, { type: 'system.announce', id, text: id }).world;

/** A new investor with the savings a playtester had (well over 60 months of living). */
function newInvestor(note: string = FEEDBACK_NOTE): World {
  const w = announce(makeWorld(11, ['lagos']), note);
  return run(w, I, {
    type: 'player.quickStart',
    username: 'h_investor',
    name: 'Kwame Investor',
    role: 'investor',
    backgroundId: 'i-operator',
    market: 'lagos',
  }).world;
}

const inbox = (w: World) => (playerView(w, I)!.inbox as { text: string }[]).map((n) => n.text);

describe('play-test #7: a new investor starts as an angel, on chapter 1', () => {
  it('savings alone don’t make a new angel an allocator', () => {
    const w = newInvestor();
    const p = w.players[I]!;
    expect(p.career!.reached).toEqual({ 1: expect.any(Number) });
    expect(p.milestones['investor.rung-7']).toBeUndefined();
    expect(inbox(w).some((t) => /allocator/i.test(t))).toBe(false);
    const rung7 = playerView(w, I)!.investorCareer!.rungs.find((r) => r.n === 7)!;
    expect(rung7.requirements.map((r) => r.id)).toEqual(['track', 'liquid']);
    expect(playerView(w, I)!.journey!.current).toBe(1);
  });

  it('with a track record (rung 2) the wealth route opens: “now an allocator”', () => {
    let w = newInvestor();
    w = produce(w, (d) => {
      d.players[I]!.career!.reached[2] = 0;
    });
    w = run(w, I, { type: 'player.seen' }).world;
    expect(w.players[I]!.career!.reached[7]).toBeDefined();
    expect(inbox(w)).toContainEqual(expect.stringMatching(/^Career: you’re now an allocator\./));
  });

  it('before the feedback round the ladder is as it was', () => {
    const w = newInvestor(INVESTOR_NOTE);
    expect(w.players[I]!.career!.reached[7]).toBeDefined();
  });

  it('shares bought on the stock market don’t count as backing a startup', () => {
    let w = newInvestor();
    w = run(w, I, { type: 'investor.tutorial', action: 'skip' }).world;
    // Two private cheques.
    w = produce(w, (d) => {
      const cs = Object.values(d.companies)
        .filter((c) => c.ai && c.status === 'active' && !isEstablished(c))
        .slice(0, 2);
      for (const c of cs)
        d.positions[`${I}:${c.id}`] = {
          investorId: I,
          companyId: c.id,
          invested: 1_000_00,
          returned: 0,
          month: 0,
          writtenOff: false,
        };
    });
    // And shares in one of the exchange's Plcs.
    w = run(w, I, {
      type: 'shares.buy',
      companyId: establishedId('lagos', 0),
      amount: 5_000_000_00,
    }).world;
    const j = playerView(w, I)!.journey!;
    expect(j.current).toBe(1);
    const step = j.chapters[0]!.steps.find((s) => s.id === 'first-cheque.portfolio')!;
    expect(step.done).toBe(false);
  });
});
