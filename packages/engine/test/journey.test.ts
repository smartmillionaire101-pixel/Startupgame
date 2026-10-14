import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  JOURNEY,
  chapterMilestone,
  deriveChapters,
  journeyView,
  pickObjective,
} from '../src/journey.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  companyOf,
  makeWorld,
  moneyByCurrency,
  run,
  tryRun,
} from './helpers.js';

const F = 'u_founder';
const steps = (w: World, n: number) =>
  Object.fromEntries(deriveChapters(w, w.players[F]!)[n - 1]!.steps.map((s) => [s.id, s.done]));
/** Edit the world directly (a mid-game state), as a saved game would hold it. */
const edit = (w: World, f: (d: World) => void) => produce(w, f);
/** Any harmless command: the journey records chapters after every command. */
const poke = (w: World) => run(w, F, { type: 'inbox.read', ids: [] }).world;

function withCustomers(w: World, n: number): World {
  return edit(w, (d) => {
    const c = companyOf(d, F);
    const seg = c.segments[c.targetSegments[0]!]!;
    seg.paying = n;
  });
}

describe('founder journey: chapters derived from the world', () => {
  it('a new founder starts in chapter 1 with the company and first customer ticked', () => {
    const w = addFounder(makeWorld());
    const j = journeyView(w, w.players[F]!)!;
    expect(j.current).toBe(1);
    expect(j.chapters.map((c) => c.status)).toEqual([
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    expect(steps(w, 1)).toEqual({
      'hustle.company': true,
      'hustle.discovery': false,
      'hustle.first-customer': true,
      'hustle.customers': false,
    });
    const cust = j.chapters[0]!.steps.find((s) => s.id === 'hustle.customers')!;
    expect(cust.progress).toEqual({ have: 1, need: JOURNEY.hustle.customers });
    expect(j.main[0]!.id).toBe('hustle.discovery');
    expect(j.main[0]!.go).toEqual({ kind: 'place', place: 'market' });
    // In the player view too.
    expect(playerView(w, F)!.journey?.current).toBe(1);
  });

  it('quick-start founders start with no company; investors and bankers get no journey', () => {
    let w = run(makeWorld(), 'q', {
      type: 'player.quickStart',
      username: 'quick_founder',
      role: 'founder',
    }).world;
    expect(journeyView(w, w.players.q!)!.chapters[0]!.steps[0]).toMatchObject({
      id: 'hustle.company',
      done: false,
      go: { kind: 'tab', tab: 'company' },
    });
    w = addInvestor(w);
    expect(journeyView(w, w.players.u_investor!)).toBeNull();
    expect(tryRun(w, 'u_investor', { type: 'journey.pin', kind: 'main', id: 'x' }).ok).toBe(false);
  });

  it('finishing chapter 1 records a milestone and one inbox note, without touching ids or money', () => {
    let w = addFounder(makeWorld());
    const c = companyOf(w, F);
    w = run(w, F, {
      type: 'company.discovery',
      companyId: c.id,
      segmentKey: c.targetSegments[0]!,
    }).world;
    expect(steps(w, 1)['hustle.discovery']).toBe(true);
    expect(w.players[F]!.milestones[chapterMilestone(1)]).toBeUndefined();
    w = withCustomers(w, JOURNEY.hustle.customers);
    const before = { nextId: w.nextId, money: moneyByCurrency(w) };
    w = poke(w);
    expect(w.players[F]!.milestones[chapterMilestone(1)]).toBe(w.markets.lagos!.month);
    expect(w.nextId).toBe(before.nextId);
    expect(moneyByCurrency(w)).toEqual(before.money);
    const notes = w.inbox[F]!.filter((i) => i.id === 'in_journey_1');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.text).toBe('Chapter 1 complete: The Hustle. Next: The First Team.');
    // Recorded once only.
    w = poke(w);
    expect(w.inbox[F]!.filter((i) => i.id === 'in_journey_1')).toHaveLength(1);
    expect(journeyView(w, w.players[F]!)!.current).toBe(2);
    // A recorded chapter stays done even if customers fall away.
    w = withCustomers(w, 0);
    expect(deriveChapters(w, w.players[F]!)[0]!.status).toBe('done');
    expect(steps(w, 1)['hustle.customers']).toBe(true);
  });

  it('a mid-game company sees its chapters at once, and later chapters can finish early', () => {
    let w = addFounder(makeWorld());
    w = edit(w, (d) => {
      const c = companyOf(d, F);
      c.product.discovery[c.targetSegments[0]!] = 0.5;
      c.segments[c.targetSegments[0]!]!.paying = 40;
      for (let i = 0; i < JOURNEY.growth.staff; i++)
        c.staff.push({
          id: `s${i}`,
          name: `Staff ${i}`,
          role: 'engineer',
          seniority: 'mid',
          salary: 1,
          equityBps: 0,
          morale: 0.8,
          skill: 0.5,
          personality: 'steady',
          hiredMonth: 0,
        } as never);
      const rev = Math.round(20_000 * 100 * d.markets.lagos!.data.unitsPerUsd);
      c.finance.history.push({
        month: d.markets.lagos!.month,
        revenue: rev,
        net: rev / 2,
      } as never);
      d.players[F]!.milestones['founder.profitable'] = 1;
    });
    const ch = deriveChapters(w, w.players[F]!);
    // 1, 2 and 4 are done; 3 (no funding yet) is current; 4 finished early.
    expect(ch.map((c) => c.status)).toEqual([
      'done',
      'done',
      'current',
      'done',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    w = poke(w);
    const ms = w.players[F]!.milestones;
    expect([1, 2, 3, 4].map((n) => ms[chapterMilestone(n)] !== undefined)).toEqual([
      true,
      true,
      false,
      true,
    ]);
    // Choosing to bootstrap is a funding choice: chapter 3 completes (runway via profit).
    w = run(w, F, { type: 'journey.bootstrap', on: true }).world;
    expect(steps(w, 3)).toEqual({
      'fundraising.pitch': true,
      'fundraising.funding': true,
      'fundraising.runway': true,
    });
    expect(w.players[F]!.milestones[chapterMilestone(3)]).toBeDefined();
    expect(journeyView(w, w.players[F]!)!.current).toBe(5);
  });

  it('any outside money counts as funding: a loan, a grant, an accelerator, a raise', () => {
    let w = addFounder(makeWorld());
    expect(steps(w, 3)['fundraising.funding']).toBe(false);
    w = edit(w, (d) => {
      companyOf(d, F).accelerator = {
        acceleratorId: 'a',
        market: 'lagos',
        name: 'Acc',
        mentor: 'M',
        joinedMonth: 0,
        demoDayMonth: 3,
      };
    });
    expect(steps(w, 3)['fundraising.funding']).toBe(true);
    expect(steps(w, 3)['fundraising.pitch']).toBe(true);
  });

  it('the Empire needs any two of its four; the Exit needs a sale', () => {
    let w = addFounder(makeWorld());
    w = edit(w, (d) => {
      const c = companyOf(d, F);
      c.board.push('someone');
      c.lastRound = 'series-a';
    });
    const ch = deriveChapters(w, w.players[F]!);
    expect(ch[4]!.status).toBe('done');
    expect(ch[5]!.status).toBe('upcoming');
    w = edit(w, (d) => {
      d.players[F]!.milestones['founder.exit'] = 3;
    });
    expect(deriveChapters(w, w.players[F]!)[5]!.status).toBe('done');
  });
});

describe('founder journey: the objective tracker', () => {
  const cands = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('picks the pinned prompt while it lasts, else the first not dismissed', () => {
    expect(pickObjective(cands, undefined, undefined)?.id).toBe('a');
    expect(pickObjective(cands, undefined, ['a'])?.id).toBe('b');
    expect(pickObjective(cands, 'c', ['a'])?.id).toBe('c');
    // A pinned prompt that's gone (done, expired) gives way.
    expect(pickObjective(cands, 'zzz', ['a', 'b'])?.id).toBe('c');
    expect(pickObjective(cands, undefined, ['a', 'b', 'c'])).toBeNull();
  });

  it('pin, dismiss, undo and unpin are stored on the player', () => {
    let w = addFounder(makeWorld());
    const money = moneyByCurrency(w);
    const main = () => {
      const j = journeyView(w, w.players[F]!)!;
      return pickObjective(j.main, j.pinned.main, j.dismissed.main)?.id;
    };
    expect(main()).toBe('hustle.discovery');
    w = run(w, F, { type: 'journey.dismiss', kind: 'main', id: 'hustle.discovery' }).world;
    expect(main()).toBe('hustle.customers');
    w = run(w, F, { type: 'journey.pin', kind: 'main', id: 'team.hire' }).world;
    expect(main()).toBe('team.hire');
    // Dismissing the pinned one unpins it.
    w = run(w, F, { type: 'journey.dismiss', kind: 'main', id: 'team.hire' }).world;
    expect(w.players[F]!.journey!.pinned!.main).toBeUndefined();
    expect(main()).toBe('hustle.customers');
    w = run(w, F, {
      type: 'journey.dismiss',
      kind: 'main',
      id: 'hustle.discovery',
      undo: true,
    }).world;
    expect(main()).toBe('hustle.discovery');
    // Pinning a dismissed prompt brings it back; pin without id unpins.
    w = run(w, F, { type: 'journey.pin', kind: 'main', id: 'team.hire' }).world;
    expect(main()).toBe('team.hire');
    w = run(w, F, { type: 'journey.pin', kind: 'main' }).world;
    expect(main()).toBe('hustle.discovery');
    // Other kinds keep their own lists, bounded.
    for (let i = 0; i < JOURNEY.maxDismissed + 5; i++)
      w = run(w, F, { type: 'journey.dismiss', kind: 'opportunity', id: `acc:${i}` }).world;
    expect(w.players[F]!.journey!.dismissed!.opportunity).toHaveLength(JOURNEY.maxDismissed);
    expect(w.players[F]!.journey!.dismissed!.opportunity!.at(-1)).toBe(
      `acc:${JOURNEY.maxDismissed + 4}`,
    );
    expect(moneyByCurrency(w)).toEqual(money);
  });
});
