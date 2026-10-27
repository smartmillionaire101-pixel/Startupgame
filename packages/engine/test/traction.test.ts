/**
 * One count of a founder's real customers (traction.ts), shared by the stage
 * tracker, the journey, the company view and the tutorial (player feedback:
 * "I had 3 customers but the tracker kept me at Idea"). Worlds without the
 * feedback note count exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { founderGuide } from '../src/founderguide.js';
import { journeyView } from '../src/journey.js';
import { FEEDBACK_NOTE } from '../src/releases.js';
import { customerFacts } from '../src/traction.js';
import { playerView } from '../src/views.js';
import type { Company, World } from '../src/types.js';
import { addFounder, companyOf, makeWorld, run } from './helpers.js';

const F = 'u_founder';
const announce = (w: World) =>
  run(w, null, { type: 'system.announce', id: FEEDBACK_NOTE, text: 'Feedback.' }).world;
const mine = (w: World) => companyOf(w, F);
const task = (w: World, id: string) =>
  founderGuide(w, mine(w))
    .stages.flatMap((s) => s.tasks)
    .find((x) => x.id === id)!;
const step = (w: World, id: string) =>
  journeyView(w, w.players[F]!)!
    .chapters.flatMap((c) => c.steps)
    .find((s) => s.id === id)!;

/**
 * Three real customers and no interview: the welcome customer, one deal won
 * in Sales and one local business that buys after a pitch.
 */
function threeCustomers(w: World): World {
  return produce(w, (d) => {
    const c = mine(d) as Company;
    c.product.discovery = {};
    c.salesAccounts = [
      {
        dealId: 'deal_1',
        name: 'Mama Put',
        segmentKey: c.targetSegments[0]!,
        monthly: 1,
        since: 0,
      },
    ];
    const b = Object.values(d.markets.lagos!.businesses ?? {}).find(
      (x) => x.closedMonth === undefined && !x.suppliers.some((s) => s.companyId === c.id),
    )!;
    b.suppliers.push({ companyId: c.id, sector: c.industry, monthlyMinor: 1, since: 0 });
  });
}

describe('one count of real customers', () => {
  it('counts people, Sales accounts and local businesses, and the guidance agrees', () => {
    const w = threeCustomers(announce(addFounder(makeWorld(3, ['lagos']))));
    const facts = customerFacts(w, mine(w));
    expect(facts).toMatchObject({
      total: 3,
      people: 1,
      accounts: 1,
      businesses: 1,
      welcome: 1,
      earned: 2,
      interviews: 0,
    });
    expect(facts.knows).toBe(true);

    // The stage tracker: past Idea, with three customers counted.
    const g = founderGuide(w, mine(w));
    expect(g.stage).toBe('first-customers');
    expect(task(w, 'idea.discovery')).toMatchObject({ done: true, need: 20 });
    expect(task(w, 'first.customers').have).toBe(3);

    // The journey: the same customers, and they count as learning.
    expect(step(w, 'hustle.discovery').done).toBe(true);
    expect(step(w, 'hustle.customers')).toMatchObject({
      done: true,
      progress: { have: 3, need: 3 },
    });
    expect(step(w, 'team.customers').progress?.have).toBe(3);

    // The company view carries the same facts for the client (tutorial, Today).
    const v = playerView(w, F)!.companies[0]! as unknown as { traction: typeof facts };
    expect(v.traction.total).toBe(3);
    expect(v.traction.earned).toBe(2);
  });

  it('counts three people in the funnel with no interview the same way everywhere', () => {
    const base = announce(addFounder(makeWorld(3, ['lagos'])));
    const w = produce(base, (d) => {
      const c = mine(d) as Company;
      c.product.discovery = {};
      Object.values(c.segments)[0]!.paying = 3;
    });
    const facts = customerFacts(w, mine(w));
    expect(facts.total).toBe(3);
    expect(founderGuide(w, mine(w)).stage).not.toBe('idea');
    expect(task(w, 'first.customers').have).toBe(facts.total);
    expect(step(w, 'hustle.customers').progress?.have).toBe(facts.total);
    expect(step(w, 'hustle.discovery').done).toBe(task(w, 'idea.discovery').done);
  });

  it('leaves the welcome customer out of what the founder has learned', () => {
    const w = announce(addFounder(makeWorld(3, ['lagos'])));
    const facts = customerFacts(w, mine(w));
    expect(facts).toMatchObject({ total: 1, welcome: 1, earned: 0, known: 0, knows: false });
    expect(founderGuide(w, mine(w)).stage).toBe('idea');
    expect(task(w, 'idea.discovery')).toMatchObject({ done: false, have: 0, need: 20 });
    expect(step(w, 'hustle.discovery').done).toBe(false);
  });

  it('counts a Sales discovery meeting as learning', () => {
    const w = produce(announce(addFounder(makeWorld(3, ['lagos']))), (d) => {
      const c = mine(d) as Company;
      c.deals = [
        { revealed: true, stage: 'discovery' },
        { revealed: true, stage: 'demo' },
      ] as Company['deals'];
    });
    const facts = customerFacts(w, mine(w));
    expect(facts.meetings).toBe(2);
    expect(facts.knows).toBe(true);
    expect(task(w, 'idea.discovery').done).toBe(true);
    expect(step(w, 'hustle.discovery').done).toBe(true);
  });

  it('counts exactly as before without the feedback note', () => {
    const w = threeCustomers(addFounder(makeWorld(3, ['lagos'])));
    const facts = customerFacts(w, mine(w));
    expect(facts).toMatchObject({ total: 2, businesses: 0, known: 0, knows: false });
    expect(founderGuide(w, mine(w)).stage).toBe('idea');
    expect(task(w, 'idea.discovery')).toMatchObject({ done: false, have: 0 });
    expect(step(w, 'hustle.discovery').done).toBe(false);
    expect(step(w, 'hustle.customers').progress?.have).toBe(2);
  });
});
