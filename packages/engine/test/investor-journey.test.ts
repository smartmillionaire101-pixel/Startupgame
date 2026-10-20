import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { addFounder, addInvestor, careerWorld, makeWorld, run } from './helpers.js';

const I = 'u_investor';

/**
 * The investor journey: investors get the same chapters and "What to do
 * now" prompts as founders, pointing at the investing already in the game
 * first (deal offers, the Invest and Capital apps, Fund I), then the
 * investor career's later steps.
 */
const journey = (w: World, id = I) => playerView(w, id)!.journey;

function backThree(w: World): World {
  return produce(w, (d) => {
    const cs = Object.values(d.companies)
      .filter((c) => c.ai && c.status === 'active')
      .slice(0, 3);
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
}

describe('the investor journey', () => {
  it('is only in investor-career worlds; founders keep theirs', () => {
    const old = addInvestor(makeWorld(7));
    expect(journey(old)).toBeNull();
    const w = addFounder(addInvestor(careerWorld(7)));
    expect(journey(w)!.kind).toBe('investor');
    expect(journey(w, 'u_founder')!.kind).toBe('founder');
  });

  it('starts with backing a startup, and the later chapters are the investor career', () => {
    const j = journey(addInvestor(careerWorld(8)))!;
    expect(j.chapters.map((c) => c.id)).toEqual([
      'first-cheque',
      'track-record',
      'fund',
      'firm',
      'legacy',
    ]);
    expect(j.current).toBe(1);
    expect(j.main[0]!.id).toBe('first-cheque.invest');
    expect(j.main[0]!.go).toEqual({ kind: 'app', app: 'invest' });
  });

  it('records a finished chapter once, with an inbox note, and moves the prompt on', () => {
    let w = backThree(addInvestor(careerWorld(9)));
    w = run(w, I, { type: 'player.seen' }).world;
    expect(w.players[I]!.milestones['investor.chapter-1']).toBeDefined();
    expect(w.players[I]!.milestones['founder.chapter-1']).toBeUndefined();
    expect(
      (w.inbox[I] ?? []).filter((x) => x.text.startsWith('Chapter 1 complete: The First Cheque')),
    ).toHaveLength(1);
    const j = journey(w)!;
    expect(j.current).toBe(2);
    expect(j.main[0]!.chapter).toBe(2);
    w = run(w, I, { type: 'player.seen' }).world;
    expect((w.inbox[I] ?? []).filter((x) => x.id === 'in_ijourney_1')).toHaveLength(1);
  });

  it('follows the role: an investor who has founded a company still gets the investor journey', () => {
    let w = addInvestor(careerWorld(11));
    w = produce(w, (d) => {
      const c = Object.values(d.companies).find((x) => x.status === 'active')!;
      d.players[I]!.companyIds.push(c.id);
    });
    expect(journey(w)!.kind).toBe('investor');
    expect(journey(w)!.chapters[0]!.id).toBe('first-cheque');
  });

  it('lets an investor pin and dismiss prompts', () => {
    let w = addInvestor(careerWorld(10));
    w = run(w, I, { type: 'journey.dismiss', kind: 'main', id: 'first-cheque.invest' }).world;
    expect(journey(w)!.dismissed.main).toContain('first-cheque.invest');
    w = run(w, I, { type: 'journey.pin', kind: 'main', id: 'first-cheque.invest' }).world;
    expect(journey(w)!.pinned.main).toBe('first-cheque.invest');
  });
});
