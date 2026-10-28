import { describe, expect, it } from 'vitest';
import { newHeli, stepHeli } from '../src/experiences/air/flight';

/**
 * Play-test round 6, #37: "Head back" took about half a minute to come home
 * (at the tour's sightseeing pace all the way).
 */
describe('the helicopter heading back', () => {
  it('flies home at twice the tour pace, then slows for the pad', () => {
    const route = [{ name: 'Far', x: 4000, z: 0, h: 0 }];
    let h = {
      ...newHeli(0, 0),
      x: 3000,
      z: 0,
      alt: 220,
      speed: 75,
      heading: -Math.PI / 2,
      leg: route.length,
      t: 60,
    };
    let top = 0;
    let secs = 0;
    for (let k = 0; k < 20000 && h.leg <= route.length; k++) {
      h = stepHeli(h, 0.05, route, { x: 0, z: 0 });
      top = Math.max(top, h.speed);
      secs += 0.05;
    }
    expect(h.leg).toBe(route.length + 1);
    expect(top).toBeGreaterThan(140);
    // 3 km at the old 75 m/s was 40 s before the landing; now well under.
    expect(secs).toBeLessThan(40);
  });
});
