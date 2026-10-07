/**
 * Wave 10 §B: footprints that never overlap.
 *
 * Plan-view geometry for the 3D city's buildings (metres, x east, y south):
 * exact overlap areas between any two outlines (concave ones too, through
 * their triangles), a spatial grid of footprints, and the rules that keep
 * the city clean:
 *
 * - Real buildings (OpenStreetMap, Overture): where two outlines overlap,
 *   the smaller is dropped — unless it stands *inside* the larger and rises
 *   above it (a tower on its podium), when it is stacked on the podium's
 *   roof instead, so the two never share a cubic metre.
 * - Generated infill keeps a gap to every other lot, a setback from the road
 *   ribbons by class width, and clear of real buildings, landmarks and the
 *   game's places (scene.ts / buildings.ts LotMaker use these).
 */
import * as THREE from 'three';

/** An open ring, flat [x, y, x, y, …]. */
export type Poly = ArrayLike<number>;
export type BBox = [number, number, number, number];

export interface Fp {
  p: Poly;
  /** Bottom and top (metres above the ground). */
  base: number;
  top: number;
  area: number;
  box: BBox;
  /** Triangles, flat [ax, ay, bx, by, cx, cy, …] (made on demand). */
  tris?: Float64Array;
  /** Anything the caller wants to keep with it. */
  tag?: unknown;
}

export function polyArea(p: Poly): number {
  let a = 0;
  const n = p.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++)
    a += p[2 * j]! * p[2 * i + 1]! - p[2 * i]! * p[2 * j + 1]!;
  return Math.abs(a) / 2;
}

export function polyBox(p: Poly): BBox {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < p.length; i += 2) {
    const x = p[i]!;
    const y = p[i + 1]!;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

export function makeFp(p: Poly, base = 0, top = 10, tag?: unknown): Fp {
  return { p, base, top, area: polyArea(p), box: polyBox(p), tag };
}

/** A rectangle centred on (x, y), `w` along direction `rot` and `d` across it. */
export function rectPoly(x: number, y: number, w: number, d: number, rot: number): number[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const hw = w / 2;
  const hd = d / 2;
  const out: number[] = [];
  for (const [a, b] of [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ] as const)
    out.push(x + a * c - b * s, y + a * s + b * c);
  return out;
}

/** A regular polygon (a disc, near enough). */
export function discPoly(x: number, y: number, r: number, n = 12): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  return out;
}

export const boxesMeet = (a: BBox, b: BBox, pad = 0) =>
  a[0] - pad < b[2] && b[0] - pad < a[2] && a[1] - pad < b[3] && b[1] - pad < a[3];

function trisOf(f: Fp): Float64Array {
  if (f.tris) return f.tris;
  const p = f.p;
  const n = p.length >> 1;
  const contour: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(p[2 * i]!, p[2 * i + 1]!));
  let idx: number[][] = [];
  try {
    idx = THREE.ShapeUtils.triangulateShape(contour, []);
  } catch {
    idx = [];
  }
  if (!idx.length && n >= 3) for (let i = 1; i + 1 < n; i++) idx.push([0, i, i + 1]);
  const out = new Float64Array(idx.length * 6);
  idx.forEach((t, k) => {
    for (let m = 0; m < 3; m++) {
      out[k * 6 + 2 * m] = p[2 * t[m]!]!;
      out[k * 6 + 2 * m + 1] = p[2 * t[m]! + 1]!;
    }
  });
  f.tris = out;
  return out;
}

/** Clip a convex polygon by a convex (counter-clockwise) one; the area of what is left. */
function clipArea(subject: number[], clip: number[]): number {
  let out = subject;
  const n = clip.length >> 1;
  for (let i = 0; i < n && out.length >= 6; i++) {
    const ax = clip[2 * i]!;
    const ay = clip[2 * i + 1]!;
    const bx = clip[(2 * i + 2) % (2 * n)]!;
    const by = clip[(2 * i + 3) % (2 * n)]!;
    const side = (x: number, y: number) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const inp = out;
    out = [];
    const m = inp.length >> 1;
    for (let k = 0; k < m; k++) {
      const px = inp[2 * k]!;
      const py = inp[2 * k + 1]!;
      const qx = inp[(2 * k + 2) % (2 * m)]!;
      const qy = inp[(2 * k + 3) % (2 * m)]!;
      const sp = side(px, py);
      const sq = side(qx, qy);
      if (sp >= 0) out.push(px, py);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        out.push(px + (qx - px) * t, py + (qy - py) * t);
      }
    }
  }
  return out.length >= 6 ? polyArea(out) : 0;
}

const ccwTri = (t: Float64Array, k: number): number[] => {
  const ax = t[k]!;
  const ay = t[k + 1]!;
  const bx = t[k + 2]!;
  const by = t[k + 3]!;
  const cx = t[k + 4]!;
  const cy = t[k + 5]!;
  const cr = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return cr >= 0 ? [ax, ay, bx, by, cx, cy] : [ax, ay, cx, cy, bx, by];
};

/** The exact area two footprints share in plan (m²). */
export function overlapArea(a: Fp, b: Fp): number {
  if (!boxesMeet(a.box, b.box)) return 0;
  const ta = trisOf(a);
  const tb = trisOf(b);
  let sum = 0;
  for (let i = 0; i < ta.length; i += 6) {
    const A = ccwTri(ta, i);
    const ab: BBox = [
      Math.min(A[0]!, A[2]!, A[4]!),
      Math.min(A[1]!, A[3]!, A[5]!),
      Math.max(A[0]!, A[2]!, A[4]!),
      Math.max(A[1]!, A[3]!, A[5]!),
    ];
    if (!boxesMeet(ab, b.box)) continue;
    for (let j = 0; j < tb.length; j += 6) {
      const B = ccwTri(tb, j);
      if (
        Math.max(B[0]!, B[2]!, B[4]!) <= ab[0] ||
        Math.min(B[0]!, B[2]!, B[4]!) >= ab[2] ||
        Math.max(B[1]!, B[3]!, B[5]!) <= ab[1] ||
        Math.min(B[1]!, B[3]!, B[5]!) >= ab[3]
      )
        continue;
      sum += clipArea(A, B);
    }
  }
  return sum;
}

/** Whether two footprints share space: in plan by more than `tol` m², and in height. */
export function clash(a: Fp, b: Fp, tol = 0.5): boolean {
  if (a.top <= b.base + 0.05 || b.top <= a.base + 0.05) return false;
  return overlapArea(a, b) > tol;
}

/** Separating axes: whether two convex polygons overlap (touching is not overlapping). */
export function convexOverlap(a: Poly, b: Poly, eps = 1e-6): boolean {
  for (const P of [a, b]) {
    const n = P.length >> 1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const nx = P[2 * j + 1]! - P[2 * i + 1]!;
      const ny = P[2 * i]! - P[2 * j]!;
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (let k = 0; k + 1 < a.length; k += 2) {
        const v = a[k]! * nx + a[k + 1]! * ny;
        a0 = Math.min(a0, v);
        a1 = Math.max(a1, v);
      }
      for (let k = 0; k + 1 < b.length; k += 2) {
        const v = b[k]! * nx + b[k + 1]! * ny;
        b0 = Math.min(b0, v);
        b1 = Math.max(b1, v);
      }
      const L = Math.hypot(nx, ny) || 1;
      if (a1 <= b0 + eps * L || b1 <= a0 + eps * L) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// A grid of footprints

const GCELL = 64;

export class FootprintGrid {
  private cells = new Map<number, Fp[]>();
  size = 0;
  private key = (i: number, j: number) => (i + 30000) * 60000 + (j + 30000);

  private span(b: BBox, cb: (k: number) => void) {
    const i0 = Math.floor(b[0] / GCELL);
    const i1 = Math.floor(b[2] / GCELL);
    const j0 = Math.floor(b[1] / GCELL);
    const j1 = Math.floor(b[3] / GCELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) cb(this.key(i, j));
  }

  add(f: Fp) {
    this.size++;
    this.span(f.box, (k) => {
      let a = this.cells.get(k);
      if (!a) this.cells.set(k, (a = []));
      a.push(f);
    });
  }

  remove(f: Fp) {
    this.size--;
    this.span(f.box, (k) => {
      const a = this.cells.get(k);
      if (!a) return;
      const i = a.indexOf(f);
      if (i >= 0) a.splice(i, 1);
      if (!a.length) this.cells.delete(k);
    });
  }

  /** Every footprint whose box meets `b` (padded), once each. */
  query(b: BBox, pad = 0): Fp[] {
    const seen = new Set<Fp>();
    this.span([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad], (k) => {
      for (const f of this.cells.get(k) ?? []) if (boxesMeet(f.box, b, pad)) seen.add(f);
    });
    return [...seen];
  }

  /** Whether `f` shares more than `tol` m² of plan with anything here (any height). */
  overlapsPlan(f: Fp, tol = 0.05): boolean {
    for (const o of this.query(f.box)) if (overlapArea(f, o) > tol) return true;
    return false;
  }
}

// ---------------------------------------------------------------------------
// Real buildings: no two in the same space

/** Share of the smaller footprint inside the larger above which it counts as standing on it. */
const INSIDE = 0.8;

export interface DedupeResult {
  kept: Fp[];
  dropped: Fp[];
  /** Kept, raised onto the roof of the building they stand in. */
  stacked: Fp[];
}

/**
 * Thin a list of real footprints so no two share space, against what the
 * grid already holds (neighbouring tiles) and each other. The biggest go
 * first; a smaller one that overlaps a kept one by more than `tol` m² (or
 * 2% of itself) is dropped, unless it lies inside it and rises above it: then
 * it is stacked on top (base = that roof). Kept footprints are added to `grid`.
 */
export function dedupeFootprints(list: Fp[], grid = new FootprintGrid(), tol = 1): DedupeResult {
  const order = [...list].sort((a, b) => b.area - a.area);
  const kept: Fp[] = [];
  const dropped: Fp[] = [];
  const stacked: Fp[] = [];
  for (const f of order) {
    if (f.area < 4) {
      dropped.push(f);
      continue;
    }
    let ok = true;
    let base = f.base;
    for (const o of grid.query(f.box)) {
      if (f.top <= o.base + 0.05 || o.top <= base + 0.05) continue;
      const ov = overlapArea(f, o);
      if (ov <= Math.max(tol, Math.min(f.area, o.area) * 0.02)) continue;
      const inside = ov / Math.min(f.area, o.area) >= INSIDE && o.area >= f.area;
      if (inside && f.top > o.top + 2.5) {
        // A tower on its podium: start at the podium's roof.
        base = Math.max(base, o.top);
        continue;
      }
      ok = false;
      break;
    }
    if (ok && base > f.base) {
      // Raised: check again at the new height (another podium may still be in the way).
      for (const o of grid.query(f.box)) {
        if (f.top <= o.base + 0.05 || o.top <= base + 0.05) continue;
        if (overlapArea(f, o) > Math.max(tol, Math.min(f.area, o.area) * 0.02)) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) {
      dropped.push(f);
      continue;
    }
    if (base > f.base) {
      f.base = base;
      stacked.push(f);
    }
    kept.push(f);
    grid.add(f);
  }
  return { kept, dropped, stacked };
}

// ---------------------------------------------------------------------------
// Roads: how far a rectangle is from a segment

/**
 * Distance from segment (ax, ay)–(bx, by) to the rectangle centred on (x, y),
 * `w` along `rot` and `d` across (0 when they touch).
 */
export function segRectDist(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  x: number,
  y: number,
  w: number,
  d: number,
  rot: number,
): number {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  // Into the rectangle's frame.
  const lx = (px: number, py: number) => (px - x) * c + (py - y) * s;
  const ly = (px: number, py: number) => -(px - x) * s + (py - y) * c;
  const p0x = lx(ax, ay);
  const p0y = ly(ax, ay);
  const p1x = lx(bx, by);
  const p1y = ly(bx, by);
  const hw = w / 2;
  const hd = d / 2;
  // Liang–Barsky: does the segment cross the box?
  let t0 = 0;
  let t1 = 1;
  const dx = p1x - p0x;
  const dy = p1y - p0y;
  const edges: [number, number][] = [
    [-dx, p0x + hw],
    [dx, hw - p0x],
    [-dy, p0y + hd],
    [dy, hd - p0y],
  ];
  let cross = true;
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) {
        cross = false;
        break;
      }
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) {
        cross = false;
        break;
      }
    }
  }
  if (cross) return 0;
  const boxDist = (px: number, py: number) =>
    Math.hypot(Math.max(0, Math.abs(px) - hw), Math.max(0, Math.abs(py) - hd));
  let best = Math.min(boxDist(p0x, p0y), boxDist(p1x, p1y));
  const l2 = dx * dx + dy * dy;
  for (const [qx, qy] of [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ] as const) {
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((qx - p0x) * dx + (qy - p0y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p0x + dx * t - qx, p0y + dy * t - qy));
  }
  return best;
}
