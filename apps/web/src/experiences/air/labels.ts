/**
 * The landmarks' names over the city in a flight (player feedback: two
 * landmarks close together drew their names on top of each other). Nearest
 * first: a name goes where its landmark is; one that would sit on a name
 * already placed stacks above it on a longer stem (up to `LABEL_STACK`
 * steps; its stem runs behind the nearer name), and hides when there's no room. Never on the title, the buttons or
 * the commentary (`blocks`). Pure: no DOM, no three.js.
 */

/** A box on screen (px, in the labels' layer). */
export type Box = { l: number; r: number; t: number; b: number };

/** Do two boxes overlap (or come within `pad` px)? */
export const hits = (a: Box, k: Box, pad = 0) =>
  a.l < k.r + pad && a.r > k.l - pad && a.t < k.b + pad && a.b > k.t - pad;

/** A name's stem (px, .sky-label), the gap kept between two names, how many steps up one stacks. */
export const LABEL_STEM = 8;
export const LABEL_GAP = 4;
export const LABEL_STACK = 2;

export interface LabelWant {
  /** Where its landmark is on screen (px), and whether it's in front of the camera. */
  x: number;
  y: number;
  inFront: boolean;
  /** How far the landmark is (m): the nearer name goes first. */
  d: number;
  /** The name's size (px). */
  w: number;
  h: number;
}

/**
 * Each name's stem length (px), or null where it's hidden, in the order given
 * (draw the nearer names on top: `labelLayer`).
 * `W`, `H`: the layer's size; `bottom`: the band at the bottom kept clear (px).
 */
export function placeLabels(
  wants: readonly LabelWant[],
  blocks: readonly Box[],
  W: number,
  H: number,
  bottom = 120,
  far = 6000,
): (number | null)[] {
  const out: (number | null)[] = wants.map(() => null);
  const shown: Box[] = [];
  const order = wants.map((_, i) => i).sort((a, z) => wants[a]!.d - wants[z]!.d);
  for (const i of order) {
    const { x, y, inFront, d, w, h } = wants[i]!;
    if (!inFront || y >= H - bottom || d >= far) continue;
    for (let step = 0; step <= LABEL_STACK; step++) {
      const stem = LABEL_STEM + step * (h + LABEL_GAP);
      const box = { l: x - w / 2, r: x + w / 2, t: y - h - stem, b: y - stem };
      // Off the top or the sides: no higher step fits either.
      if (box.l <= 4 || box.r >= W - 4 || box.t <= 4) break;
      if (blocks.some((k) => hits(box, k))) continue;
      // Clear of the names already placed (a stem behind a nearer name is drawn under it).
      if (shown.some((k) => hits(box, k, LABEL_GAP))) continue;
      out[i] = stem;
      shown.push(box);
      break;
    }
  }
  return out;
}

/** Nearer names are drawn over farther ones (a stacked name's stem runs behind them). */
export const labelLayer = (wants: readonly Pick<LabelWant, 'd'>[]): number[] => {
  const order = wants.map((_, i) => i).sort((a, z) => wants[a]!.d - wants[z]!.d);
  const out = wants.map(() => 0);
  order.forEach((i, rank) => (out[i] = wants.length - rank));
  return out;
};
