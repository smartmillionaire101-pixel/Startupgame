/**
 * Round 4: every founder stage step's "Do it now" leads somewhere from the
 * Company screen itself. A step whose engine target is the Company tab (the
 * screen the stage card sits on) only scrolled to the top: it now opens its
 * own section, scrolled into view, with the step's hint on top.
 */
import { describe, expect, it } from 'vitest';
import { createWorld, dispatch, playerView, type FounderTask } from '@runway/engine';
import { stageGo, STEP_PLACES } from '../src/screens/stageFocus';

/** Every founder step, with the engine's own targets (a new London company). */
function allSteps(): FounderTask[] {
  const w0 = createWorld({ seed: 7, now: Date.UTC(2026, 9, 3), markets: ['london'] });
  const r = dispatch(
    w0,
    {
      type: 'player.create',
      handle: 'h_stage',
      name: 'Stage Founder',
      role: 'founder',
      backgroundId: 'f-engineer',
      market: 'london',
      company: {
        name: 'Stage Co',
        industry: 'fintech',
        revenueModel: 'subscription',
        idea: 'Payments for market traders',
        incorporation: 'local',
      },
    },
    { actorId: 'u_stage', now: Date.UTC(2026, 9, 3) },
  );
  if (!r.ok) throw new Error(r.error.message);
  const v = playerView(r.world, 'u_stage')!;
  return v.companies[0]!.guide.stages.flatMap((s) => s.tasks);
}

describe('stage steps from the Company screen', () => {
  const steps = allSteps();

  it('covers all six stages', () => {
    expect(steps.length).toBeGreaterThanOrEqual(18);
    expect(steps.map((x) => x.id)).toContain('a.revenue');
  });

  it('never leaves a step on the bare Company tab (a tap that only scrolls to the top)', () => {
    for (const x of steps) {
      const g = stageGo(x);
      expect(g, x.id).not.toBeNull();
      const bare = g!.kind === 'tab' && g!.tab === 'company';
      expect(bare, `${x.id} leads nowhere on the Company screen`).toBe(false);
      // Each Company step has its own place (no fallback by accident).
      if (g!.kind === 'company') expect(STEP_PLACES[x.id], x.id).toBeDefined();
    }
  });

  it('sends the revenue step to the Customers section with its hint', () => {
    const revenue = steps.find((x) => x.id === 'a.revenue')!;
    expect(stageGo(revenue)).toEqual({
      kind: 'company',
      section: 'customers',
      focus: { step: 'a.revenue' },
    });
    const city = steps.find((x) => x.id === 'a.city')!;
    expect(stageGo(city)).toEqual({
      kind: 'company',
      section: 'product',
      focus: { step: 'a.city', anchor: 'expansion' },
    });
  });

  it('keeps steps that already leave the Company screen as they are', () => {
    for (const id of ['idea.discovery', 'seed.pitch', 'a.raise', 'first.customer', 'seed.raise']) {
      const x = steps.find((y) => y.id === id)!;
      expect(stageGo(x), id).toBe(x.go);
    }
  });
});
