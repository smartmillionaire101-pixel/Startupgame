/**
 * The kit heads measured and hair grown on them (src/three-kit/humans/face.ts),
 * on a made-up head: a skull, a nose, a chin, two eyes and brows.
 */
import { describe, expect, it } from 'vitest';
import { faceGrow, measureHead, scalpGrow } from '../src/three-kit/humans/face';

/** Points on an ellipsoid head (0.142 half width), a nose and a chin in front. */
function head() {
  const skin: number[] = [];
  for (let i = 0; i <= 24; i++)
    for (let j = 0; j <= 24; j++) {
      const th = (i / 24) * Math.PI;
      const ph = (j / 24) * Math.PI * 2;
      skin.push(
        0.142 * Math.sin(th) * Math.cos(ph),
        0.2 * Math.cos(th) - 0.02,
        0.15 * Math.sin(th) * Math.sin(ph),
      );
    }
  skin.push(0, -0.075, 0.17); // nose
  skin.push(0, -0.17, 0.125, 0.03, -0.175, 0.12); // chin
  const eyes = [-0.075, 0.005, 0.135, -0.04, 0.02, 0.13, 0.04, 0.0, 0.13, 0.075, 0.02, 0.135];
  const brows = [-0.08, 0.03, 0.145, 0.08, 0.035, 0.145];
  return measureHead([new Float32Array(skin)], [new Float32Array(eyes)], [new Float32Array(brows)]);
}

describe('a kit head measured', () => {
  const f = head();
  it('finds the crown, the eyes, the brows, the nose, the chin and a mouth between them', () => {
    expect(f.crown).toBeCloseTo(0.18, 2);
    expect(f.half).toBeCloseTo(0.142, 2);
    expect(f.eye.x).toBeCloseTo(0.0575, 3);
    expect(f.eye.y).toBeCloseTo(0.01, 3);
    expect(f.brow).toBeCloseTo(0.035, 3);
    expect(f.nose).toEqual({ y: expect.closeTo(-0.075, 3), z: expect.closeTo(0.17, 3) });
    expect(f.chin).toBeLessThan(-0.16);
    expect(f.mouth.y).toBeLessThan(f.nose.y);
    expect(f.mouth.y).toBeGreaterThan(f.chin);
  });

  it('a beard grows on the jaw and chin but leaves the lips, the eyes and the crown bare', () => {
    const b = faceGrow(f, 'beard');
    expect(b.t(0.09, f.mouth.y, 0.1)).toBeGreaterThan(0); // cheek beside the mouth
    expect(b.t(0, f.chin + 0.01, 0.11)).toBeGreaterThan(0); // chin
    expect(b.t(0, f.mouth.y, f.mouth.z)).toBeLessThan(0); // lips
    expect(b.t(f.eye.x, f.eye.y, f.eye.z)).toBeLessThan(0);
    expect(b.t(0, f.crown, 0)).toBeLessThan(0);
    // Fuller on the chin than at the top of the cheek.
    expect(b.t(0, f.chin + 0.01, 0.11)).toBeGreaterThan(b.t(0.1, f.nose.y - 0.03, 0.08));
  });

  it('a goatee is the chin and above the lip, not the cheeks', () => {
    const g = faceGrow(f, 'goatee');
    expect(g.t(0, f.chin + 0.01, 0.11)).toBeGreaterThan(0);
    expect(g.t(0, (f.nose.y + f.mouth.y) / 2, f.mouth.z)).toBeGreaterThan(0);
    expect(g.t(0.1, f.mouth.y, 0.1)).toBeLessThan(0);
  });

  it('close-cropped hair covers the crown down to the hairline, never the forehead', () => {
    const s = scalpGrow(f);
    expect(s.t(0, f.crown, 0)).toBeGreaterThan(0);
    expect(s.t(0, f.brow + 0.01, f.front)).toBeLessThan(0);
    expect(s.t(0, f.eye.y, -0.15)).toBeGreaterThan(0); // the back of the head
  });
});
