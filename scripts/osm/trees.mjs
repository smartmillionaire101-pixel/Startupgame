/**
 * Trees for the 3D city (Wave 9 §A): mapped trees (natural=tree), plus
 * deterministic samples inside parks and woods and along residential streets,
 * capped per city. No Math.random: every choice is a hash of the position.
 */
import { TREE_KINDS } from './format.mjs';
import { hash01, pointInRing } from './geom.mjs';

export const TREE_CAP = 40_000;
const K = Object.fromEntries(TREE_KINDS.map((k, i) => [k, i]));

const bboxOf = (p) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = 0; k < p.length; k += 2) {
    x0 = Math.min(x0, p[k]);
    x1 = Math.max(x1, p[k]);
    y0 = Math.min(y0, p[k + 1]);
    y1 = Math.max(y1, p[k + 1]);
  }
  return [x0, y0, x1, y1];
};

/** A point test against many flat polygons, with a bbox prefilter. */
export function polygonIndex(polys) {
  const items = polys.filter((p) => p.length >= 6).map((p) => ({ p, b: bboxOf(p) }));
  return (x, y) =>
    items.some(
      ({ p, b }) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && pointInRing(x, y, p),
    );
}

/**
 * Jittered-grid samples inside flat polygons: one candidate per `spacing`
 * cell, moved by up to 40% of a cell, kept when inside the polygon and when
 * a smooth-ish hash noise says so (`density` in [0, 1]), giving clumps.
 */
export function sampleArea(polys, spacing, density, kind, [hLo, hHi]) {
  const out = [];
  const seen = new Set();
  for (const p of polys) {
    if (p.length < 6) continue;
    const [x0, y0, x1, y1] = bboxOf(p);
    for (let gx = Math.floor(x0 / spacing); gx <= Math.ceil(x1 / spacing); gx++)
      for (let gy = Math.floor(y0 / spacing); gy <= Math.ceil(y1 / spacing); gy++) {
        // Clumps: a coarse cell's hash scales the chance of a tree.
        const clump = hash01(Math.floor(gx / 4), Math.floor(gy / 4), 7);
        if (hash01(gx, gy, 1) > density * (0.4 + 1.2 * clump)) continue;
        const x = (gx + 0.5 + (hash01(gx, gy, 2) - 0.5) * 0.8) * spacing;
        const y = (gy + 0.5 + (hash01(gx, gy, 3) - 0.5) * 0.8) * spacing;
        if (seen.has(`${gx},${gy}`) || !pointInRing(x, y, p)) continue;
        seen.add(`${gx},${gy}`);
        out.push({ x, y, height: hLo + hash01(gx, gy, 4) * (hHi - hLo), kind });
      }
  }
  return out;
}

/**
 * Street trees along lines (flat arrays): every `spacing` metres, on
 * alternating sides `offset` metres from the centre line, with hash jitter.
 */
export function sampleStreets(lines, spacing = 15, offset = 6, keep = 0.75) {
  const out = [];
  for (const l of lines) {
    let carry = spacing / 2;
    let side = 1;
    for (let k = 0; k + 3 < l.length; k += 2) {
      const ax = l[k];
      const ay = l[k + 1];
      const bx = l[k + 2];
      const by = l[k + 3];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-6) continue;
      const ux = (bx - ax) / len;
      const uy = (by - ay) / len;
      let d = carry;
      for (; d < len; d += spacing) {
        const px = ax + ux * d;
        const py = ay + uy * d;
        side = -side;
        const hx = Math.round(px);
        const hy = Math.round(py);
        if (hash01(hx, hy, 11) > keep) continue;
        const along = (hash01(hx, hy, 12) - 0.5) * 4;
        const across = offset + (hash01(hx, hy, 13) - 0.5) * 2;
        out.push({
          x: px + ux * along - uy * across * side,
          y: py + uy * along + ux * across * side,
          height: 6 + hash01(hx, hy, 14) * 5,
          kind: K.street,
        });
      }
      carry = d - len;
    }
  }
  return out;
}

/** Deterministic thinning of a list to at most `n` items (by position hash). */
export function thin(list, n) {
  if (list.length <= n) return list;
  return list
    .map((t) => ({ t, h: hash01(t.x * 10, t.y * 10, 99) }))
    .sort((a, b) => a.h - b.h)
    .slice(0, n)
    .map(({ t }) => t);
}

/**
 * All of a city's trees, capped at `cap`: mapped trees first (up to 40% of
 * the cap), then parks and woods (up to 60% of what is left), then streets,
 * with any unused share passed on. Trees in water or outside `bounds` go.
 */
export function cityTrees({ tagged, parks, green, streets, water, bounds, cap = TREE_CAP }) {
  const inWater = polygonIndex(water);
  const [bx0, by0, bx1, by1] = bounds;
  const ok = (t) => t.x >= bx0 && t.x <= bx1 && t.y >= by0 && t.y <= by1 && !inWater(t.x, t.y);
  const real = tagged.filter(ok);
  const area = [
    ...sampleArea(parks, 14, 0.55, K.park, [7, 14]),
    ...sampleArea(green, 11, 0.7, K.wood, [8, 16]),
  ].filter(ok);
  const street = sampleStreets(streets).filter(ok);
  const a = thin(real, Math.floor(cap * 0.4));
  const restAfterReal = cap - a.length;
  const b = thin(area, Math.max(Math.floor(restAfterReal * 0.6), restAfterReal - street.length));
  const c = thin(street, cap - a.length - b.length);
  return [...a, ...b, ...c].map((t) => ({
    x: Math.round(t.x * 2) / 2,
    y: Math.round(t.y * 2) / 2,
    height: Math.round(t.height),
    kind: t.kind,
  }));
}
