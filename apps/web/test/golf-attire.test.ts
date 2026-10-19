import { describe, expect, it } from 'vitest';
import { golfAttire } from '../src/city/golf/attire';
import type { AvatarLook } from '../src/city/art';

const base: AvatarLook = {
  skin: '#8d5524',
  hair: '#111827',
  hairStyle: 'long',
  top: '#db2777',
  bottom: '#1f2937',
  accessory: 'tie',
  gender: 'female',
  topStyle: 'dress',
  headwear: 'gele',
};

describe('golfAttire', () => {
  it('dresses every golfer in a polo, trousers and a cap', () => {
    const g = golfAttire(base, 'u_1');
    expect(g).toMatchObject({
      topStyle: 'shirt',
      trousers: true,
      headwear: 'cap',
      accessory: 'none',
    });
    expect(g.top).toBe('#db2777');
    expect(g.gender).toBe('female');
  });
  it('keeps glasses, swaps a plain white top for a coloured polo', () => {
    const g = golfAttire({ ...base, accessory: 'glasses', top: '#e2e8f0' }, 'u_2');
    expect(g.accessory).toBe('glasses');
    expect(g.top).not.toBe('#e2e8f0');
  });
  it('picks the same trousers for the same golfer', () => {
    expect(golfAttire(base, 'u_3').bottom).toBe(golfAttire(base, 'u_3').bottom);
  });
});
