import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { playtestMetrics } from '../src/metrics.js';
import { economyDashboard } from '../src/views.js';
import type { World } from '../src/types.js';
import { addFounder, addInvestor, companyOf, makeWorld, run } from './helpers.js';

const edit = (w: World, f: (d: World) => void) => produce(w, f);

describe('playtest metrics (Phase 9, §10.4)', () => {
  it('counts humans only, with no ids or names in the output', () => {
    const w = addInvestor(
      addFounder(addFounder(makeWorld(), 'u_a', 'lagos', 'Alpha Pay'), 'u_b', 'lagos', 'Beta Pay'),
    );
    const m = playtestMetrics(w);
    expect(m.players).toEqual({ humans: 3, founders: 2, investors: 1, bankers: 0 });
    const text = JSON.stringify(m);
    for (const p of Object.values(w.players)) {
      expect(text).not.toContain(p.id);
      expect(text).not.toContain(p.name);
    }
    expect(economyDashboard(w).playtest).toEqual(m);
  });

  it('measures time to first customer, chapters, failure, decisions and ambitions', () => {
    let w = addFounder(
      addFounder(makeWorld(), 'u_a', 'lagos', 'Alpha Pay'),
      'u_b',
      'lagos',
      'Beta Pay',
    );
    w = run(w, 'u_a', { type: 'journey.ambition', id: 'unicorn' }).world;
    const a = companyOf(w, 'u_a');
    const b = companyOf(w, 'u_b');
    w = edit(w, (d) => {
      d.players.u_a!.milestones['founder.first-customer'] = a.foundedMonth + 2;
      d.players.u_b!.milestones['founder.first-customer'] = b.foundedMonth + 4;
      d.players.u_a!.milestones['founder.chapter-1'] = 1;
      d.players.u_a!.milestones['founder.chapter-2'] = 2;
      d.players.u_a!.milestones['ambition.unicorn'] = 3;
      d.companies[b.id]!.status = 'shutdown';
      d.players.u_b!.decisions = {
        seq: 2,
        cooldowns: {},
        events: [{ status: 'defaulted' }, { status: 'chosen' }] as never,
      };
    });
    const m = playtestMetrics(w);
    expect(m.firstCustomer).toEqual({ reached: 2, reachedPct: 100, medianMonths: 3 });
    expect(m.chapters[0]).toBe(1);
    expect(m.chapters[2]).toBe(1);
    expect(m.companies).toMatchObject({ total: 2, active: 1, shutdown: 1, failurePct: 50 });
    expect(m.decisions).toEqual({ chosen: 1, defaulted: 1, open: 0, defaultedPct: 50 });
    expect(m.ambitions.unicorn).toEqual({ chosen: 1, reached: 1 });
    expect(m.ambitions.angel).toEqual({ chosen: 0, reached: 0 });
  });
});
