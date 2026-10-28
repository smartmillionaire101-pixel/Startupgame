import { describe, expect, it } from 'vitest';
import {
  LABEL_GAP,
  LABEL_STEM,
  hits,
  placeLabels,
  type Box,
  type LabelWant,
} from '../src/experiences/air/labels';

/** The boxes of the names placed (stem lengths from `placeLabels`). */
const boxes = (wants: LabelWant[], stems: (number | null)[]): Box[] =>
  wants.flatMap((w, i) => {
    const s = stems[i];
    return s === null || s === undefined
      ? []
      : [{ l: w.x - w.w / 2, r: w.x + w.w / 2, t: w.y - w.h - s, b: w.y - s }];
  });
const want = (x: number, y: number, d: number, w = 120): LabelWant => ({
  x,
  y,
  d,
  w,
  h: 20,
  inFront: true,
});

describe('flight labels: two landmarks close together', () => {
  it('the nearer name stays put, the farther one stacks above it', () => {
    const wants = [want(400, 300, 900), want(420, 305, 400)];
    const stems = placeLabels(wants, [], 800, 600);
    expect(stems[1]).toBe(LABEL_STEM);
    expect(stems[0]).toBeGreaterThan(LABEL_STEM);
    const [a, b] = boxes(wants, stems);
    expect(hits(a!, b!, LABEL_GAP - 1)).toBe(false);
  });

  it('hides the farthest when there is no room to stack, and never overlaps', () => {
    const wants = [0, 1, 2, 3, 4].map((i) => want(400 + i * 6, 120 + i * 3, 300 + i * 100));
    const stems = placeLabels(wants, [], 800, 600);
    expect(stems.filter((s) => s === null).length).toBeGreaterThan(0);
    const shown = boxes(wants, stems);
    shown.forEach((a, i) => shown.slice(i + 1).forEach((b) => expect(hits(a, b)).toBe(false)));
  });

  it('keeps off the commentary and the buttons, the edges and what is behind you', () => {
    const say = { l: 300, r: 600, t: 250, b: 320 };
    const stems = placeLabels(
      [want(450, 320, 500), want(30, 300, 500), { ...want(400, 200, 500), inFront: false }],
      [say],
      800,
      600,
    );
    // Over the commentary it moves up past it (or hides); never on it.
    const shown = boxes([want(450, 320, 500)], [stems[0]!]);
    if (stems[0] !== null) expect(hits(shown[0]!, say)).toBe(false);
    expect(stems[1]).toBeNull();
    expect(stems[2]).toBeNull();
  });

  it('names apart from each other keep their short stems', () => {
    expect(placeLabels([want(150, 300, 500), want(600, 300, 800)], [], 800, 600)).toEqual([
      LABEL_STEM,
      LABEL_STEM,
    ]);
  });
});
