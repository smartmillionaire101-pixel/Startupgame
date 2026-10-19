/**
 * Where people walk and cars drive across a road: the game's paths run
 * along the road centre lines (doors are points on them), and the 3D city
 * draws the road at its real width. These turn a centre-line path into the
 * line a pedestrian takes on the pavement (one side of the road, crossing
 * only at a junction) or a car takes in its lane. Pure: map metres in and out.
 */

export interface P2 {
  x: number;
  y: number;
}

/**
 * Pavement middle, metres from the road's centre line, by class (motorway …
 * residential): the road's half width plus half its pavement, as ground.ts
 * draws them (ROAD_W / 2 + PAVE / 2; the big roads have no pavement, so just
 * beyond their edge).
 */
export const KERB = [13.2, 10.7, 9.1, 7.5, 6.3, 5.1];

/** Unit direction and right-of-travel normal (x east, y south: right is (-dy, dx)) of a → b. */
function dirOf(a: P2, b: P2) {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const dx = (b.x - a.x) / L;
  const dy = (b.y - a.y) / L;
  return { dx, dy, nx: -dy, ny: dx };
}

/** Drop points closer than `min` metres to the one before (the ends are kept). */
export function dedupe(pts: readonly P2[], min = 0.5): P2[] {
  const out: P2[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < min) {
      if (out.length > 1 && p === pts[pts.length - 1]) out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
}

/** Which side of the line a → b a point lies (1 right of travel, -1 left). */
export function sideOf(a: P2, b: P2, p: P2): 1 | -1 {
  const { nx, ny } = dirOf(a, b);
  return (p.x - a.x) * nx + (p.y - a.y) * ny >= 0 ? 1 : -1;
}

/**
 * A centre-line path moved sideways: segment i by `off[i]` metres (positive
 * right of travel). Corners are mitred (the two offset lines meet), so a
 * walker goes round the corner of the block; where the side changes (or the
 * path doubles back) the line crosses over at the corner itself.
 */
export function offsetPath(pts: readonly P2[], off: readonly number[]): P2[] {
  const n = pts.length;
  if (n < 2) return pts.map((p) => ({ ...p }));
  const d = Array.from({ length: n - 1 }, (_, i) => dirOf(pts[i]!, pts[i + 1]!));
  const at = (i: number, k: number) => ({
    x: pts[k]!.x + d[i]!.nx * off[i]!,
    y: pts[k]!.y + d[i]!.ny * off[i]!,
  });
  const out: P2[] = [at(0, 0)];
  for (let k = 1; k < n - 1; k++) {
    const a = d[k - 1]!;
    const b = d[k]!;
    const oa = off[k - 1]!;
    const ob = off[k]!;
    const cross = a.dx * b.dy - a.dy * b.dx;
    const dot = a.dx * b.dx + a.dy * b.dy;
    const same = Math.sign(oa) === Math.sign(ob);
    if (same && Math.abs(cross) < 0.12 && dot > 0) {
      // Straight on: halfway between the two offsets.
      out.push({
        x: pts[k]!.x + (a.nx * oa + b.nx * ob) / 2,
        y: pts[k]!.y + (a.ny * oa + b.ny * ob) / 2,
      });
      continue;
    }
    if (same && Math.abs(cross) >= 0.12) {
      // A corner: where the two offset lines meet.
      const p1 = at(k - 1, k);
      const p2 = at(k, k);
      const t = ((p2.x - p1.x) * b.dy - (p2.y - p1.y) * b.dx) / cross;
      const q = { x: p1.x + a.dx * t, y: p1.y + a.dy * t };
      if (Math.hypot(q.x - pts[k]!.x, q.y - pts[k]!.y) < 3 * Math.max(Math.abs(oa), Math.abs(ob))) {
        out.push(q);
        continue;
      }
    }
    // Over to the other side (or back the way it came): across at the corner.
    out.push(at(k - 1, k), at(k, k));
  }
  out.push(at(n - 2, n - 1));
  return out;
}

/**
 * A walk on the pavement: one side of the road from the start (`start`: 1
 * right of travel, -1 left), over to the end's side (`end`) at the last
 * junction before it (`junction(k)`: whether point k is one; else at the
 * last corner, or halfway along a single stretch). `kerb[i]`: how far
 * segment i's pavement is from its centre line.
 */
export function pavementPath(
  pts: readonly P2[],
  kerb: readonly number[],
  start: 1 | -1,
  end: 1 | -1,
  junction: (k: number) => boolean,
): P2[] {
  const n = pts.length;
  if (n < 2) return pts.map((p) => ({ ...p }));
  let line: readonly P2[] = pts;
  let k0 = kerb;
  if (n === 2 && start !== end) {
    // One stretch of road: cross halfway along.
    const m = { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 };
    line = [pts[0]!, m, pts[1]!];
    k0 = [kerb[0]!, kerb[0]!];
  }
  const m = line.length;
  // Sides are of travel: keeping right of travel round a corner keeps to the
  // same block's pavement.
  let cross = m - 2;
  for (let k = m - 2; k >= 1; k--)
    if (junction(k)) {
      cross = k;
      break;
    }
  const off = Array.from({ length: m - 1 }, (_, i) => (i < cross ? start : end) * k0[i]!);
  return offsetPath(line, off);
}
