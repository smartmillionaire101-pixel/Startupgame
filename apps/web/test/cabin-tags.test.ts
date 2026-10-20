import { describe, expect, it } from 'vitest';
import { layoutTags } from '../src/city/flight3d/tags';

/** Cabin name tags: on screen, never covering each other. */
describe('cabin name tags', () => {
  const W = 390;
  const H = 844;
  const overlap = (
    a: { left: number; top: number },
    b: { left: number; top: number },
    w: number,
    h: number,
  ) => a.left < b.left + w && b.left < a.left + w && a.top < b.top + h && b.top < a.top + h;

  it('keeps a tag at the left edge fully on screen, with a margin', () => {
    const [b] = layoutTags([{ x: 10, y: 300, w: 90, h: 24 }], W, H, 12);
    expect(b).toEqual({ left: 12, top: 276 });
    const [r] = layoutTags([{ x: 385, y: 5, w: 90, h: 24 }], W, H, 12);
    expect(r).toEqual({ left: W - 12 - 90, top: 12 });
  });

  it('stacks tags over seats side by side instead of overlapping', () => {
    const wants = [
      { x: 40, y: 400, w: 90, h: 24 },
      { x: 70, y: 405, w: 100, h: 24 },
      { x: 100, y: 398, w: 100, h: 24 },
    ];
    const boxes = layoutTags(wants, W, H, 12);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]!;
      expect(b.left).toBeGreaterThanOrEqual(12);
      expect(b.left + wants[i]!.w).toBeLessThanOrEqual(W - 12);
      expect(b.top).toBeGreaterThanOrEqual(12);
      for (let j = 0; j < i; j++) expect(overlap(b, boxes[j]!, 100, 24)).toBe(false);
    }
    // Out of view: no tag.
    expect(layoutTags([null, wants[0]!], W, H)[0]).toBeNull();
  });

  it('at the top edge, goes below the tag it would cover', () => {
    const boxes = layoutTags(
      [
        { x: 200, y: 20, w: 80, h: 24 },
        { x: 210, y: 22, w: 80, h: 24 },
      ],
      W,
      H,
      12,
    );
    expect(boxes[0]!.top).toBe(12);
    expect(boxes[1]!.top).toBeGreaterThanOrEqual(12 + 24);
  });
});
