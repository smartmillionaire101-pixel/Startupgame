/**
 * Name tags over seats in the cabin (yours, your friends'): each wants to sit
 * centred above a point on screen, but must stay fully on screen (a margin
 * from every edge) and not cover another tag. Placed in order (yours first):
 * clamped into the screen, then nudged up (or, with no room above, down)
 * past any tag already placed that it would overlap.
 */
export interface TagWant {
  /** The point the tag sits above (its bottom centre), CSS px. */
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface TagBox {
  left: number;
  top: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function layoutTags(
  wants: readonly (TagWant | null)[],
  width: number,
  height: number,
  margin = 8,
  gap = 4,
): (TagBox | null)[] {
  const placed: { left: number; top: number; w: number; h: number }[] = [];
  const hits = (b: { left: number; top: number; w: number; h: number }) =>
    placed.find(
      (p) =>
        b.left < p.left + p.w + gap &&
        p.left < b.left + b.w + gap &&
        b.top < p.top + p.h + gap &&
        p.top < b.top + b.h + gap,
    );
  return wants.map((t) => {
    if (!t) return null;
    const maxL = Math.max(margin, width - margin - t.w);
    const maxT = Math.max(margin, height - margin - t.h);
    const b = {
      left: clamp(t.x - t.w / 2, margin, maxL),
      top: clamp(t.y - t.h, margin, maxT),
      w: t.w,
      h: t.h,
    };
    // Up past whatever it covers; at the top edge, below it instead.
    for (let i = 0; i < placed.length * 2 + 1; i++) {
      const p = hits(b);
      if (!p) break;
      const up = p.top - gap - b.h;
      b.top = up >= margin ? up : clamp(p.top + p.h + gap, margin, maxT);
    }
    placed.push(b);
    return { left: Math.round(b.left), top: Math.round(b.top) };
  });
}
