/**
 * Shared geometry for the OpenStreetMap pipeline (build.mjs, tiles.mjs).
 *
 * The local frame: metres from the centre of a city's `wide` box, x east and
 * y SOUTH, on a simple equirectangular projection. Every file the pipeline
 * writes (apps/web/src/city/geo/<city>.json and apps/web/public/geo/<city>/*)
 * uses this same frame, so they line up exactly.
 */

/** The projector of a `wide` box [west, south, east, north]. */
export function projector(wide) {
  const lon0 = (wide[0] + wide[2]) / 2;
  const lat0 = (wide[1] + wide[3]) / 2;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_540;
  return {
    origin: [lon0, lat0],
    kx,
    ky,
    /** [lon, lat] → [x, y] metres. */
    p: (lon, lat) => [(lon - lon0) * kx, -(lat - lat0) * ky],
    /** [x, y] metres → [lon, lat]. */
    inv: (x, y) => [lon0 + x / kx, lat0 - y / ky],
  };
}

/** Overpass bbox string (south,west,north,east) of [west, south, east, north]. */
export const bb = ([w, s, e, n]) => `${s},${w},${n},${e}`;

/** Douglas–Peucker on [[x, y], …] (an open chain; the two ends are kept). */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    let best = -1;
    let bestD = t2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Simplify a closed ring (its first point may or may not repeat at the end)
 * with Douglas–Peucker, split at two far-apart vertices so that no vertex is
 * kept only for being first. Corners (right angles included) stay exact; only
 * near-collinear points within `tol` metres go. Returns an OPEN ring (no
 * repeated last point), or null when it collapses below 3 points.
 */
export function simplifyRing(ring, tol) {
  const pts = [];
  for (const p of ring) {
    const q = pts[pts.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) pts.push(p);
  }
  while (pts.length > 1) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) pts.pop();
    else break;
  }
  if (pts.length < 3) return null;
  const far = (from) => {
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i][0] - pts[from][0]) ** 2 + (pts[i][1] - pts[from][1]) ** 2;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  const i0 = far(0);
  const j0 = far(i0);
  if (i0 === j0) return null;
  const [a, b] = i0 < j0 ? [i0, j0] : [j0, i0];
  const chain1 = simplify(pts.slice(a, b + 1), tol);
  const chain2 = simplify([...pts.slice(b), ...pts.slice(0, a + 1)], tol);
  const out = [...chain1, ...chain2.slice(1, -1)];
  return out.length >= 3 && areaOf(out) > 1e-6 ? out : null;
}

export const flat = (pts) => pts.flatMap(([x, y]) => [Math.round(x), Math.round(y)]);

/** Signed shoelace area of [[x, y], …] (open or closed ring). */
export function signedArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
}

export function areaOf(pts) {
  return Math.abs(signedArea(pts));
}

/** Area-weighted centroid of a ring (falls back to the vertex mean). */
export function centroid(pts) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    a += f;
    cx += (pts[j][0] + pts[i][0]) * f;
    cy += (pts[j][1] + pts[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = pts.length || 1;
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Even–odd point in polygon; `poly` is [[x, y], …] or a flat [x, y, x, y, …] array. */
export function pointInRing(x, y, poly) {
  const isFlat = typeof poly[0] === 'number';
  const n = isFlat ? poly.length / 2 : poly.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = isFlat ? poly[2 * i] : poly[i][0];
    const yi = isFlat ? poly[2 * i + 1] : poly[i][1];
    const xj = isFlat ? poly[2 * j] : poly[j][0];
    const yj = isFlat ? poly[2 * j + 1] : poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Join way segments (arrays of {lat, lon}) end to end into closed rings. */
export function rings(segments) {
  const key = (g) => `${g.lat.toFixed(7)},${g.lon.toFixed(7)}`;
  const left = segments.filter((s) => s.length >= 2).map((s) => s.slice());
  const out = [];
  while (left.length) {
    let ring = left.shift();
    let grew = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const s = left[i];
        const end = key(ring[ring.length - 1]);
        if (key(s[0]) === end) ring = ring.concat(s.slice(1));
        else if (key(s[s.length - 1]) === end) ring = ring.concat(s.slice(0, -1).reverse());
        else continue;
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (key(ring[0]) === key(ring[ring.length - 1]) && ring.length >= 4) out.push(ring);
  }
  return out;
}

/**
 * A deterministic 32-bit hash of numbers (FNV-1a over their 32-bit integer
 * parts, then a final avalanche). Used instead of Math.random so every build
 * of a city is byte-identical.
 */
export function hash32(...nums) {
  let h = 0x811c9dc5;
  for (const v of nums) {
    let n = Math.round(v) | 0;
    for (let k = 0; k < 4; k++) {
      h ^= n & 0xff;
      h = Math.imul(h, 0x01000193);
      n >>>= 8;
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** hash32 mapped to [0, 1). */
export const hash01 = (...nums) => hash32(...nums) / 4294967296;
