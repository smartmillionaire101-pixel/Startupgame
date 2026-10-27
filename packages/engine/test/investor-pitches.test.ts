import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { FEEDBACK_NOTE, SHOP_NOTE } from '../src/releases.js';
import { isEstablished } from '../src/helpers.js';
import type { World } from '../src/types.js';
import { addInvestor, careerWorld, run } from './helpers.js';

/**
 * A new investor's first day: three startups pitch. In a long-running world
 * the focus sectors can run dry in a city; from the feedback round the rest
 * of the city's startups pitch instead of nobody.
 */
const I = 'u_investor';

/** A Lagos world where no open AI startup is in fintech or saas any more. */
function dry(on: boolean): World {
  const w0 = run(careerWorld(42, ['lagos']), null, {
    type: 'system.announce',
    id: on ? FEEDBACK_NOTE : SHOP_NOTE,
    text: 'Notes.',
  }).world;
  return produce(w0, (d) => {
    for (const c of Object.values(d.companies))
      if (c.ai && (c.industry === 'fintech' || c.industry === 'saas')) c.status = 'shutdown';
  });
}

const pitches = (w: World) => (w.inbox[I] ?? []).filter((n) => n.kind === 'pitch');

describe('a new investor’s first pitches', () => {
  it('the rest of the city pitches when the focus sectors have run dry', () => {
    const w = addInvestor(dry(true), I);
    const got = pitches(w);
    expect(got.length).toBe(3);
    for (const n of got) {
      const c = w.companies[n.ref!.id]!;
      expect(c.market).toBe('lagos');
      expect(c.status).toBe('active');
      expect(isEstablished(c)).toBe(false);
    }
  });

  it('worlds before the feedback round play as before', () => {
    expect(pitches(addInvestor(dry(false), I)).length).toBe(0);
  });
});
