/** Round 7: a business co-founder's investor introductions (gameplay note, intros.ts). */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import type { Command } from '../src/commands.js';
import { TEAM } from '../src/cofounders.js';
import { fundFits, introStrength, introsPerMonth } from '../src/intros.js';
import { recapView } from '../src/recap.js';
import { playerView } from '../src/views.js';
import type { Staff, World } from '../src/types.js';
import { companyOf, run, settle } from './helpers.js';
import { F, founder } from './r7-helpers.js';

const co = (w: World) => companyOf(w, F);

/** A business co-founder (CEO-operator) on the team. */
function withCofounder(w: World, skill = 0.8): World {
  return produce(w, (x) => {
    const c = companyOf(x, F);
    c.staff.push({
      id: 'st_biz',
      name: 'Sidi Kamara',
      role: 'operations',
      seniority: 'head',
      salary: 0,
      equityBps: 2000,
      morale: 70,
      skill,
      personality: 'steady',
      hiredMonth: x.markets.london!.month,
      cofounder: {
        profile: 'operator',
        title: 'CEO',
        equityBps: 2000,
        vestingMonths: 48,
        cliffMonths: 12,
        since: 0,
      },
    } as Staff);
  });
}

function pitch(w: World, fundId: string) {
  const r = run(w, F, {
    type: 'pitch.start',
    companyId: co(w).id,
    fundId,
    slides: ['problem', 'product', 'team'],
    ask: w.funds[fundId]!.check[0],
  } as Command);
  return { w: r.world, p: r.world.pitches[r.result.pitchId]! };
}

describe('round 7: a business co-founder introduces investors', () => {
  it('introduces a few funds a month that fit your stage and sector, by their skill', () => {
    const w = settle(withCofounder(founder('healthtech'), 0.8), 'london', 1);
    const c = co(w);
    const intros = c.investorIntros!;
    expect(intros).toHaveLength(introsPerMonth(0.8));
    expect(introsPerMonth(0.3)).toBe(1);
    expect(introsPerMonth(0.7)).toBe(2);
    expect(introsPerMonth(0.9)).toBe(3);
    for (const x of intros) {
      const f = w.funds[x.fundId]!;
      expect(f.ai).toBe(true);
      expect(f.market).toBe('london');
      expect(fundFits(c, f)).toBe(true);
      expect(x.byName).toBe('Sidi Kamara');
      expect(x.strength).toBe(introStrength(0.8));
    }
    // No fund twice.
    expect(new Set(intros.map((x) => x.fundId)).size).toBe(intros.length);
    // The founder hears about it, the view lists them, the recap says what Sidi did.
    expect(w.inbox[F]!.some((i) => /^Sidi Kamara introduced you to /.test(i.text))).toBe(true);
    const v = playerView(w, F)!.companies.find((x) => x.id === c.id)!;
    expect(v.investorIntros!.map((x) => x.fundId)).toEqual(intros.map((x) => x.fundId));
    expect(v.investorIntros![0]!.byName).toBe('Sidi Kamara');
    const month = w.markets.london!.month;
    const sidi = recapView(w, F, month)!.companies[0]!.team!.find((p) => p.staffId === 'st_biz')!;
    expect(sidi.intros).toHaveLength(intros.length);
    // The hire card says so.
    expect(v.teamBrings!.st_biz!.introsPerMonth).toBe(introsPerMonth(0.8));
  });

  it('nothing without a business co-founder, or before the gameplay note', () => {
    expect(co(settle(founder('healthtech'), 'london', 1)).investorIntros ?? []).toEqual([]);
    const off = settle(withCofounder(founder('healthtech', false)), 'london', 1);
    expect(co(off).investorIntros).toBeUndefined();
    expect(playerView(off, F)!.companies[0]!.investorIntros).toBeNull();
  });

  it('a warm intro starts his interest higher in the pitch meeting, and is used', () => {
    const w = settle(withCofounder(founder('healthtech'), 0.8), 'london', 1);
    const intro = co(w).investorIntros![0]!;
    const open = produce(w, (x) => {
      x.funds[intro.fundId]!.minStars = 0;
    });
    // The same fund, cold: drop the intro.
    const cold = produce(open, (x) => {
      companyOf(x, F).investorIntros = [];
    });
    const warm = pitch(open, intro.fundId);
    const none = pitch(cold, intro.fundId);
    const points = Math.round(TEAM.intro.interest * intro.strength);
    expect(warm.p.meeting!.intro).toEqual({ name: 'Sidi Kamara', points });
    expect(warm.p.meeting!.start.find((x) => x.id === 'intro')!.points).toBe(points);
    expect(none.p.meeting!.intro).toBeNull();
    const interest = (x: { w: World; p: { id: string } }) =>
      playerView(x.w, F)!.pitches.find((y) => y.id === x.p.id)!.meeting!.interest!;
    expect(interest(warm) - interest(none)).toBeGreaterThanOrEqual(points - 1);
    // Used by this pitch: no longer a waiting lead.
    const used = co(warm.w).investorIntros!.find((x) => x.fundId === intro.fundId)!;
    expect(used.pitchId).toBe(warm.p.id);
    const v = playerView(warm.w, F)!.companies[0]!.investorIntros!;
    expect(v.find((x) => x.fundId === intro.fundId)!.pitchId).toBe(warm.p.id);
  });

  it('a warm intro gets you a meeting a cold pitch would not', () => {
    const w = settle(withCofounder(founder('healthtech'), 1), 'london', 1);
    const intro = co(w).investorIntros![0]!;
    const c = co(w);
    const stars = Math.max(c.stars.value, w.players[F]!.stars.value);
    // A bar just out of reach without the intro.
    const high = produce(w, (x) => {
      x.funds[intro.fundId]!.minStars = stars + 0.5;
    });
    const cold = produce(high, (x) => {
      companyOf(x, F).investorIntros = [];
    });
    expect(pitch(cold, intro.fundId).p.status).toBe('passed');
    expect(pitch(high, intro.fundId).p.status).toBe('meeting');
  });

  it('is deterministic', () => {
    const go = () => settle(withCofounder(founder('healthtech', true, 3), 0.9), 'london', 2);
    expect(co(go()).investorIntros).toEqual(co(go()).investorIntros);
    expect(go()).toEqual(go());
  });
});
