/**
 * Wave 8 §A: the city on its real streets (docs/WAVE8-REAL-AND-SOCIAL.md).
 *
 * A market with an OpenStreetMap file (./geo.ts) is laid out on its real
 * geography instead of the generated block grid:
 *
 * - The map is north-up. Metres (x east, y south) map onto the game's tile
 *   frame turned 45°, so the existing 2:1 projection shows the city from the
 *   south with a tilt, and every building, avatar and vehicle keeps its art.
 * - Walking follows a graph built from the real roads (motorway to
 *   residential, bridges included): vertices shared between roads join, road
 *   ends and near-misses (from the simplified outlines) snap onto the road
 *   they meet, and only the largest connected part is kept, so every door
 *   can reach every other.
 * - The game's places stand in the real neighbourhoods their plan district
 *   names (Balogun, Yaba, Ikoyi…), on free ground beside a road, with the
 *   door on the road. The airport is at the real airport.
 *
 * Everything is deterministic for the market and the map file.
 */
import { hash, seeded } from './contract';
import { flavourOf, type Flavour } from './flavour';
import {
  B,
  buildLayout,
  CATEGORY_FALLBACK,
  financeItems,
  HOST_FALLBACK,
  lot,
  putAirport,
  putDowntown,
  putEventHall,
  putHome,
  putLotItem,
  putStalls,
  TH,
  TW,
  type Area,
  type BizInput,
  type CityInput,
  type CityLayout,
  type Ctx,
  type Decor,
  type LotItem,
  type Place,
  type Pt,
  type Vehicle,
} from './layout';
import { planOf, type CityPlan, type DistrictKind, type Host } from './plans';
import {
  fromLatLon,
  GEO_DISTRICTS,
  GEO_LANDMARKS,
  ROAD_CLASSES,
  type GeoData,
  type SpriteKind,
} from './geo';

// ---------------------------------------------------------------------------
// The frame

/** Metres along the side of a tile on a real map. */
export const GEO_TILE_M = 30;
const K = 1 / (GEO_TILE_M * Math.SQRT2);
/** Metres (x east, y south) → tiles. */
export const geoTile = (e: number, s: number): Pt => ({ x: (e + s) * K, y: (s - e) * K });
/** Tiles → metres. */
export const geoMetres = (p: Pt) => ({ e: (p.x - p.y) / (2 * K), s: (p.x + p.y) / (2 * K) });
/** Screen px per metre at zoom 1: east–west, and north–south (the ground is tilted). */
export const GEO_KX = 2 * K * TW;
export const GEO_KY = 2 * K * TH;

export interface GeoSprite {
  kind: SpriteKind;
  name: string;
  /** Metres. */
  e: number;
  s: number;
  /** A bridge's far end (metres). */
  e2?: number;
  s2?: number;
  color?: string;
}

export interface GeoWorld {
  data: GeoData;
  /** Metres along a tile's side. */
  tileM: number;
  graph: WalkGraph;
  sprites: GeoSprite[];
  /** Ground the game's buildings and landmarks stand on: OSM outlines there are not drawn. */
  clear: { e: number; s: number; r: number }[];
}

// ---------------------------------------------------------------------------
// Geometry helpers (metres)

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { d: Math.hypot(px - x, py - y), t, x, y };
}

type Box = [number, number, number, number];
function bboxOf(pts: number[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const x = pts[i]!;
    const y = pts[i + 1]!;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function inPoly(pts: number[], x: number, y: number) {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[2 * i]!;
    const yi = pts[2 * i + 1]!;
    const xj = pts[2 * j]!;
    const yj = pts[2 * j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function areaOf(pts: number[]) {
  let a = 0;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++)
    a += (pts[2 * j]! + pts[2 * i]!) * (pts[2 * j + 1]! - pts[2 * i + 1]!);
  return Math.abs(a / 2);
}

function centroidOf(pts: number[]) {
  let x = 0;
  let y = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    x += pts[2 * i]!;
    y += pts[2 * i + 1]!;
  }
  return { x: x / n, y: y / n };
}

/** Polygons with their boxes, for quick point tests. */
class PolySet {
  private items: { p: number[]; b: Box }[];
  constructor(polys: number[][]) {
    this.items = polys.filter((p) => p.length >= 6).map((p) => ({ p, b: bboxOf(p) }));
  }
  get size() {
    return this.items.length;
  }
  has(x: number, y: number) {
    for (const { p, b } of this.items)
      if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && inPoly(p, x, y)) return true;
    return false;
  }
}

/** Polylines with their boxes, for distance tests. */
class LineSet {
  private items: { p: number[]; b: Box }[];
  constructor(lines: number[][]) {
    this.items = lines.filter((p) => p.length >= 4).map((p) => ({ p, b: bboxOf(p) }));
  }
  near(x: number, y: number, r: number) {
    for (const { p, b } of this.items) {
      if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) continue;
      for (let i = 0; i + 3 < p.length; i += 2)
        if (segDist(x, y, p[i]!, p[i + 1]!, p[i + 2]!, p[i + 3]!).d < r) return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// The walk graph

/** Half a road's width by class (motorway … residential), in metres. */
const HALF = [11, 9, 7.5, 6.5, 5.5, 4.5];
/** Class flag: the segment is on a bridge. */
const BRIDGE = 8;
const CELL = 120;
const cellKey = (cx: number, cy: number) => (cx + 4000) * 8000 + (cy + 4000);

/** A tiny binary min-heap of (node, priority). */
class Heap {
  private n: number[] = [];
  private p: number[] = [];
  get size() {
    return this.n.length;
  }
  push(node: number, pri: number) {
    const { n, p } = this;
    let i = n.length;
    n.push(node);
    p.push(pri);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (p[up]! <= pri) break;
      n[i] = n[up]!;
      p[i] = p[up]!;
      i = up;
    }
    n[i] = node;
    p[i] = pri;
  }
  pop(): [number, number] {
    const { n, p } = this;
    const top: [number, number] = [n[0]!, p[0]!];
    const ln = n.pop()!;
    const lp = p.pop()!;
    if (n.length) {
      let i = 0;
      const len = n.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= len) break;
        const r = l + 1;
        const c = r < len && p[r]! < p[l]! ? r : l;
        if (p[c]! >= lp) break;
        n[i] = n[c]!;
        p[i] = p[c]!;
        i = c;
      }
      n[i] = ln;
      p[i] = lp;
    }
    return top;
  }
}

export interface StreetHit {
  /** Segment index. */
  s: number;
  /** Fraction along it. */
  t: number;
  x: number;
  y: number;
  d: number;
}

/**
 * The real roads as a connected graph, in metres. Nodes are road vertices
 * and junctions; segments carry the road class (and a bridge flag).
 */
export class WalkGraph {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly segA: Int32Array;
  readonly segB: Int32Array;
  readonly segC: Uint8Array;
  private off: Int32Array;
  private nb: Int32Array;
  private wt: Float64Array;
  private cells = new Map<number, number[]>();
  private maxR: number;

  constructor(x: number[], y: number[], a: number[], b: number[], c: number[]) {
    this.x = Float64Array.from(x);
    this.y = Float64Array.from(y);
    this.segA = Int32Array.from(a);
    this.segB = Int32Array.from(b);
    this.segC = Uint8Array.from(c);
    const n = x.length;
    const deg = new Int32Array(n + 1);
    for (let s = 0; s < a.length; s++) {
      deg[a[s]!]!++;
      deg[b[s]!]!++;
    }
    this.off = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) this.off[i + 1] = this.off[i]! + deg[i]!;
    const fill = this.off.slice(0, n);
    this.nb = new Int32Array(this.off[n]!);
    this.wt = new Float64Array(this.off[n]!);
    let x0 = 0;
    let x1 = 0;
    let y0 = 0;
    let y1 = 0;
    for (let s = 0; s < a.length; s++) {
      const u = a[s]!;
      const v = b[s]!;
      const w = Math.hypot(x[u]! - x[v]!, y[u]! - y[v]!);
      this.nb[fill[u]!] = v;
      this.wt[fill[u]!++] = w;
      this.nb[fill[v]!] = u;
      this.wt[fill[v]!++] = w;
      this.index(s);
    }
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, x[i]!);
      x1 = Math.max(x1, x[i]!);
      y0 = Math.min(y0, y[i]!);
      y1 = Math.max(y1, y[i]!);
    }
    this.maxR = Math.ceil(Math.max(x1 - x0, y1 - y0) / CELL) + 3;
  }

  get nodes() {
    return this.x.length;
  }
  get segments() {
    return this.segA.length;
  }

  private index(s: number) {
    const ax = this.x[this.segA[s]!]!;
    const ay = this.y[this.segA[s]!]!;
    const bx = this.x[this.segB[s]!]!;
    const by = this.y[this.segB[s]!]!;
    for (
      let cx = Math.floor(Math.min(ax, bx) / CELL);
      cx <= Math.floor(Math.max(ax, bx) / CELL);
      cx++
    )
      for (
        let cy = Math.floor(Math.min(ay, by) / CELL);
        cy <= Math.floor(Math.max(ay, by) / CELL);
        cy++
      ) {
        const k = cellKey(cx, cy);
        const list = this.cells.get(k);
        if (list) list.push(s);
        else this.cells.set(k, [s]);
      }
  }

  /** Segments with a cell within `r` metres of a point (a superset of those that near). */
  segsNear(px: number, py: number, r: number): number[] {
    const out = new Set<number>();
    for (let cx = Math.floor((px - r) / CELL); cx <= Math.floor((px + r) / CELL); cx++)
      for (let cy = Math.floor((py - r) / CELL); cy <= Math.floor((py + r) / CELL); cy++)
        for (const s of this.cells.get(cellKey(cx, cy)) ?? []) out.add(s);
    return [...out].sort((p, q) => p - q);
  }

  segHit(s: number, px: number, py: number) {
    const a = this.segA[s]!;
    const b = this.segB[s]!;
    return segDist(px, py, this.x[a]!, this.y[a]!, this.x[b]!, this.y[b]!);
  }

  /** The closest point on any road to a point (metres). */
  nearest(px: number, py: number, accept?: (s: number) => boolean): StreetHit {
    const cx0 = Math.floor(px / CELL);
    const cy0 = Math.floor(py / CELL);
    let best = null as StreetHit | null;
    for (let r = 0; r <= this.maxR; r++) {
      for (let cx = cx0 - r; cx <= cx0 + r; cx++)
        for (let cy = cy0 - r; cy <= cy0 + r; cy++) {
          if (Math.max(Math.abs(cx - cx0), Math.abs(cy - cy0)) !== r) continue;
          const list = this.cells.get(cellKey(cx, cy));
          if (!list) continue;
          for (const s of list) {
            if (accept && !accept(s)) continue;
            const h = this.segHit(s, px, py);
            if (!best || h.d < best.d - 1e-9 || (Math.abs(h.d - best.d) <= 1e-9 && s < best.s))
              best = { s, t: h.t, x: h.x, y: h.y, d: h.d };
          }
        }
      if (best && best.d <= r * CELL) break;
    }
    if (!best) {
      const a = this.segA[0] ?? 0;
      return { s: 0, t: 0, x: this.x[a] ?? 0, y: this.y[a] ?? 0, d: Infinity };
    }
    return best;
  }

  /** Shortest walk along the roads between two points (metres), as a polyline. */
  path(fx: number, fy: number, tx: number, ty: number): { x: number; y: number }[] {
    const a = this.nearest(fx, fy);
    const b = this.nearest(tx, ty);
    if (a.s === b.s) return [a, b].map(({ x, y }) => ({ x, y }));
    const n = this.nodes;
    const g = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const heap = new Heap();
    const h = (v: number) => Math.hypot(this.x[v]! - b.x, this.y[v]! - b.y);
    const start = (v: number) => {
      const c = Math.hypot(this.x[v]! - a.x, this.y[v]! - a.y);
      if (c < g[v]!) {
        g[v] = c;
        heap.push(v, c + h(v));
      }
    };
    start(this.segA[a.s]!);
    start(this.segB[a.s]!);
    const gc = this.segA[b.s]!;
    const gd = this.segB[b.s]!;
    const extra = (v: number) =>
      v === gc || v === gd ? Math.hypot(this.x[v]! - b.x, this.y[v]! - b.y) : Infinity;
    let best = Infinity;
    let bestNode = -1;
    while (heap.size) {
      const [u, f] = heap.pop();
      if (f >= best) break;
      if (f > g[u]! + h(u) + 1e-6) continue;
      const total = g[u]! + extra(u);
      if (total < best) {
        best = total;
        bestNode = u;
      }
      for (let k = this.off[u]!; k < this.off[u + 1]!; k++) {
        const v = this.nb[k]!;
        const ng = g[u]! + this.wt[k]!;
        if (ng < g[v]!) {
          g[v] = ng;
          prev[v] = u;
          heap.push(v, ng + h(v));
        }
      }
    }
    const nodes: number[] = [];
    for (let v = bestNode; v >= 0; v = prev[v]!) nodes.push(v);
    nodes.reverse();
    return [
      { x: a.x, y: a.y },
      ...nodes.map((v) => ({ x: this.x[v]!, y: this.y[v]! })),
      { x: b.x, y: b.y },
    ];
  }

  /** nearestStreetPoint, in tiles. */
  nearestTile(p: Pt): Pt {
    const m = geoMetres(p);
    const h = this.nearest(m.e, m.s);
    return geoTile(h.x, h.y);
  }

  /** findPath, in tiles: from where you are to `to`, along the roads. */
  pathTiles(from: Pt, to: Pt): Pt[] {
    const f = geoMetres(from);
    const t = geoMetres(to);
    const out: Pt[] = [];
    const add = (p: Pt) => {
      const last = out[out.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-4) out.push(p);
    };
    add(from);
    for (const q of this.path(f.e, f.s, t.e, t.s)) add(geoTile(q.x, q.y));
    // End exactly where asked (the snapped point can differ in the last bits).
    const last = out[out.length - 1]!;
    if (out.length > 1 && Math.hypot(last.x - to.x, last.y - to.y) <= 1e-4) out.pop();
    out.push(to);
    return out;
  }

  /** Whether every node reaches node 0 (the graph is one piece). */
  connected(): boolean {
    const n = this.nodes;
    if (!n) return true;
    const seen = new Uint8Array(n);
    const stack = [0];
    seen[0] = 1;
    let count = 1;
    while (stack.length) {
      const u = stack.pop()!;
      for (let k = this.off[u]!; k < this.off[u + 1]!; k++) {
        const v = this.nb[k]!;
        if (!seen[v]) {
          seen[v] = 1;
          count++;
          stack.push(v);
        }
      }
    }
    return count === n;
  }
}

/** Build the walk graph from a map's roads and bridges. */
export function buildGraph(data: GeoData): WalkGraph {
  type Line = { pts: number[]; cls: number; rigid: boolean };
  const lines: Line[] = [];
  ROAD_CLASSES.forEach((c, ci) => {
    for (const r of data.roads?.[c] ?? []) lines.push({ pts: r.l, cls: ci, rigid: ci === 0 });
  });
  for (const br of data.bridges ?? [])
    lines.push({ pts: br.l, cls: Math.max(0, ROAD_CLASSES.indexOf(br.c)) | BRIDGE, rigid: true });

  // ---- Nodes: shared vertices join.
  const nx: number[] = [];
  const ny: number[] = [];
  const nodeLine: number[] = [];
  const byKey = new Map<number, number>();
  const node = (x: number, y: number, li: number) => {
    const k = (Math.round(x) + 200_000) * 400_000 + (Math.round(y) + 200_000);
    let id = byKey.get(k);
    if (id === undefined) {
      id = nx.length;
      byKey.set(k, id);
      nx.push(Math.round(x));
      ny.push(Math.round(y));
      nodeLine.push(li);
    } else if (nodeLine[id] !== li) nodeLine[id] = -2;
    return id;
  };
  const sa: number[] = [];
  const sb: number[] = [];
  const sc: number[] = [];
  const sl: number[] = [];
  const lineNodes: number[][] = [];
  lines.forEach((L, li) => {
    const ids: number[] = [];
    let prev = -1;
    for (let i = 0; i + 1 < L.pts.length; i += 2) {
      const id = node(L.pts[i]!, L.pts[i + 1]!, li);
      if (id === prev) continue;
      if (prev >= 0) {
        sa.push(prev);
        sb.push(id);
        sc.push(L.cls);
        sl.push(li);
      }
      ids.push(id);
      prev = id;
    }
    lineNodes.push(ids);
  });

  // ---- A grid of the raw segments, for snapping.
  const grid = new Map<number, number[]>();
  for (let s = 0; s < sa.length; s++) {
    const ax = nx[sa[s]!]!;
    const ay = ny[sa[s]!]!;
    const bx = nx[sb[s]!]!;
    const by = ny[sb[s]!]!;
    for (
      let cx = Math.floor(Math.min(ax, bx) / CELL);
      cx <= Math.floor(Math.max(ax, bx) / CELL);
      cx++
    )
      for (
        let cy = Math.floor(Math.min(ay, by) / CELL);
        cy <= Math.floor(Math.max(ay, by) / CELL);
        cy++
      ) {
        const k = cellKey(cx, cy);
        const list = grid.get(k);
        if (list) list.push(s);
        else grid.set(k, [s]);
      }
  }

  // ---- Snapping: a road that ends at (or runs through) another without a
  // shared vertex (the outlines were simplified) joins it there.
  const splits = new Map<number, { t: number; v: number }[]>();
  const extra: [number, number][] = [];
  const done = new Uint8Array(nx.length);
  lines.forEach((L, li) => {
    const ids = lineNodes[li]!;
    ids.forEach((v, k) => {
      const end = k === 0 || k === ids.length - 1;
      if ((!end && L.rigid) || nodeLine[v] === -2 || done[v]) return;
      done[v] = 1;
      const T = end ? 14 : 3;
      const px = nx[v]!;
      const py = ny[v]!;
      let best = -1;
      let bd = T;
      let bt = 0;
      for (let cx = Math.floor((px - T) / CELL); cx <= Math.floor((px + T) / CELL); cx++)
        for (let cy = Math.floor((py - T) / CELL); cy <= Math.floor((py + T) / CELL); cy++)
          for (const s of grid.get(cellKey(cx, cy)) ?? []) {
            if (sa[s] === v || sb[s] === v) continue;
            if (!end && (sl[s] === li || lines[sl[s]!]!.rigid)) continue;
            const h = segDist(px, py, nx[sa[s]!]!, ny[sa[s]!]!, nx[sb[s]!]!, ny[sb[s]!]!);
            if (h.d < bd - 1e-9 || (Math.abs(h.d - bd) <= 1e-9 && s < best)) {
              bd = h.d;
              best = s;
              bt = h.t;
            }
          }
      if (best < 0) return;
      const len = Math.hypot(nx[sa[best]!]! - nx[sb[best]!]!, ny[sa[best]!]! - ny[sb[best]!]!);
      if (bt * len < 3) extra.push([v, sa[best]!]);
      else if ((1 - bt) * len < 3) extra.push([v, sb[best]!]);
      else {
        const list = splits.get(best);
        if (list) list.push({ t: bt, v });
        else splits.set(best, [{ t: bt, v }]);
      }
    });
  });

  // ---- Edges after the splits.
  const ea: number[] = [];
  const eb: number[] = [];
  const ec: number[] = [];
  const edge = (u: number, v: number, c: number) => {
    if (u === v) return;
    ea.push(u);
    eb.push(v);
    ec.push(c);
  };
  for (let s = 0; s < sa.length; s++) {
    const sp = splits.get(s);
    if (!sp) {
      edge(sa[s]!, sb[s]!, sc[s]!);
      continue;
    }
    sp.sort((p, q) => p.t - q.t || p.v - q.v);
    let prev = sa[s]!;
    for (const { v } of sp) {
      edge(prev, v, sc[s]!);
      prev = v;
    }
    edge(prev, sb[s]!, sc[s]!);
  }
  for (const [u, v] of extra) edge(u, v, 5);

  // ---- Keep the largest connected part.
  const n = nx.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let e = 0; e < ea.length; e++) {
    adj[ea[e]!]!.push(eb[e]!);
    adj[eb[e]!]!.push(ea[e]!);
  }
  const comp = new Int32Array(n).fill(-1);
  let bestComp = -1;
  let bestSize = 0;
  for (let i = 0, c = 0; i < n; i++) {
    if (comp[i] !== -1 || !adj[i]!.length) continue;
    let size = 0;
    const stack = [i];
    comp[i] = c;
    while (stack.length) {
      const u = stack.pop()!;
      size++;
      for (const v of adj[u]!)
        if (comp[v] === -1) {
          comp[v] = c;
          stack.push(v);
        }
    }
    if (size > bestSize) {
      bestSize = size;
      bestComp = c;
    }
    c++;
  }
  const remap = new Int32Array(n).fill(-1);
  const fx: number[] = [];
  const fy: number[] = [];
  for (let i = 0; i < n; i++)
    if (comp[i] === bestComp) {
      remap[i] = fx.length;
      fx.push(nx[i]!);
      fy.push(ny[i]!);
    }
  const fa: number[] = [];
  const fb: number[] = [];
  const fc: number[] = [];
  const seen = new Set<number>();
  for (let e = 0; e < ea.length; e++) {
    const u = remap[ea[e]!]!;
    const v = remap[eb[e]!]!;
    if (u < 0 || v < 0) continue;
    const k = u < v ? u * 4_000_000 + v : v * 4_000_000 + u;
    if (seen.has(k)) continue;
    seen.add(k);
    fa.push(u);
    fb.push(v);
    fc.push(ec[e]!);
  }
  return new WalkGraph(fx, fy, fa, fb, fc);
}

// ---------------------------------------------------------------------------
// Landmarks

function spritesOf(data: GeoData, marketId: string): GeoSprite[] {
  const [bx0, by0, bx1, by1] = data.bounds;
  const inside = (x: number, y: number) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1;
  const out: GeoSprite[] = [];
  for (const spec of GEO_LANDMARKS[marketId] ?? []) {
    let at = fromLatLon(data, spec.at[0], spec.at[1]);
    let to = spec.to ? fromLatLon(data, spec.to[0], spec.to[1]) : null;
    if (spec.match) {
      const hit =
        data.landmarks?.find((l) => spec.match!.test(l.n)) ??
        data.buildings?.find((b) => b.n && spec.match!.test(b.n));
      if (hit && 'x' in hit) at = { x: hit.x, y: hit.y };
      else if (hit && 'p' in hit) at = centroidOf(hit.p);
    }
    if (spec.bridge) {
      // The longest stretch of the named bridge: its two ends (or, for a
      // curving one, its longest straight run, where the towers stand).
      let bestLen = 0;
      for (const br of data.bridges ?? []) {
        if (!br.n || !spec.bridge.test(br.n)) continue;
        const l = br.l;
        const chord = Math.hypot(l[l.length - 2]! - l[0]!, l[l.length - 1]! - l[1]!);
        let len = 0;
        let seg = { i: 0, len: 0 };
        for (let i = 0; i + 3 < l.length; i += 2) {
          const d = Math.hypot(l[i + 2]! - l[i]!, l[i + 3]! - l[i + 1]!);
          len += d;
          if (d > seg.len) seg = { i, len: d };
        }
        const straight = chord >= len * 0.97;
        const use = straight ? chord : seg.len;
        if (use > bestLen) {
          bestLen = use;
          const i0 = straight ? 0 : seg.i;
          const i1 = straight ? l.length - 2 : seg.i + 2;
          at = { x: l[i0]!, y: l[i0 + 1]! };
          to = { x: l[i1]!, y: l[i1 + 1]! };
        }
      }
    }
    if (!inside(at.x, at.y)) continue;
    out.push({
      kind: spec.kind,
      name: spec.name,
      e: at.x,
      s: at.y,
      ...(to ? { e2: to.x, s2: to.y } : {}),
      ...(spec.color ? { color: spec.color } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Placing the game's buildings

interface Slot {
  /** The door: a point on a road (metres). */
  px: number;
  py: number;
  /** Unit normal away from the road. */
  nx: number;
  ny: number;
  half: number;
  d: number;
  used: boolean;
}

interface Anchor {
  e: number;
  s: number;
  R: number;
  slots: Slot[];
}

class Placer {
  private placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  private anchors = new Map<string, Anchor>();
  private land: PolySet;
  private water: PolySet;
  private airport: PolySet;
  private rivers: LineSet;
  readonly clear: GeoWorld['clear'] = [];

  constructor(
    data: GeoData,
    private graph: WalkGraph,
  ) {
    this.land = new PolySet(data.land ?? []);
    this.water = new PolySet(data.water ?? []);
    this.airport = new PolySet(data.airport ?? []);
    this.rivers = new LineSet(data.rivers ?? []);
  }

  private slotsFor(a: Anchor) {
    const g = this.graph;
    const step = 16;
    const out: Slot[] = [];
    for (const s of g.segsNear(a.e, a.s, a.R)) {
      const c = g.segC[s]!;
      if (c & BRIDGE || c === 0) continue;
      const ax = g.x[g.segA[s]!]!;
      const ay = g.y[g.segA[s]!]!;
      const bx = g.x[g.segB[s]!]!;
      const by = g.y[g.segB[s]!]!;
      const L = Math.hypot(bx - ax, by - ay);
      if (L < 6) continue;
      const nxx = -(by - ay) / L;
      const nyy = (bx - ax) / L;
      const k = Math.max(1, Math.floor(L / step));
      for (let i = 0; i < k; i++) {
        const t = (i + 0.5) / k;
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        const d = Math.hypot(px - a.e, py - a.s);
        if (d > a.R) continue;
        for (const sign of [1, -1])
          out.push({ px, py, nx: nxx * sign, ny: nyy * sign, half: HALF[c] ?? 5, d, used: false });
      }
    }
    out.sort((p, q) => p.d - q.d || p.px - q.px || p.py - q.py || p.nx - q.nx || p.ny - q.ny);
    return out;
  }

  private free(p: Place, cx: number, cy: number, r: number, isAirport: boolean) {
    // On land, out of the water, off the runways (unless it is the terminal).
    if (this.land.size && !this.land.has(cx, cy)) return false;
    if (this.water.has(cx, cy)) return false;
    if (this.rivers.near(cx, cy, r + 6)) return false;
    if (!isAirport && this.airport.has(cx, cy)) return false;
    // Clear of every road but by its own door.
    const g = this.graph;
    for (const s of g.segsNear(cx, cy, r + 14)) {
      const c = g.segC[s]! & 7;
      if (g.segHit(s, cx, cy).d < (HALF[c] ?? 5) + r * 0.7) return false;
    }
    // Clear of the buildings already placed.
    const t = geoTile(cx, cy);
    const box = {
      x0: t.x - p.w / 2 - 0.2,
      y0: t.y - p.d / 2 - 0.2,
      x1: t.x + p.w / 2 + 0.2,
      y1: t.y + p.d / 2 + 0.2,
    };
    for (const o of this.placed)
      if (box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0) return false;
    return true;
  }

  /** Stand a building near an anchor: on free ground, its door on a road. */
  place(p: Place, key: string, e: number, s: number): boolean {
    let a = this.anchors.get(key);
    if (!a) {
      a = { e, s, R: 0, slots: [] };
      this.anchors.set(key, a);
    }
    const r = (Math.hypot(p.w, p.d) / 2) * GEO_TILE_M;
    const isAirport = p.kind === 'airport';
    for (let tries = 0; tries < 12; tries++) {
      if (a.R === 0 || tries > 0) {
        a.R = a.R === 0 ? 260 : a.R * 1.7;
        a.slots = this.slotsFor(a);
      }
      for (const sl of a.slots) {
        if (sl.used) continue;
        const off = sl.half + r * 0.75 + 2;
        const cx = sl.px + sl.nx * off;
        const cy = sl.py + sl.ny * off;
        if (!this.free(p, cx, cy, r, isAirport)) continue;
        sl.used = true;
        const c = geoTile(cx, cy);
        const door = geoTile(sl.px, sl.py);
        p.x = c.x - p.w / 2;
        p.y = c.y - p.d / 2;
        p.door = door;
        const vx = door.x - c.x;
        const vy = door.y - c.y;
        p.doorFace = vy > 0 && vy >= vx ? 'left' : vx > 0 ? 'right' : null;
        this.placed.push({ x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.d });
        this.clear.push({ e: cx, s: cy, r: r * 1.15 });
        return true;
      }
      if (a.R > 9000) break;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// The layout

const graphs = new WeakMap<GeoData, WalkGraph>();
const graphOf = (data: GeoData) => {
  let g = graphs.get(data);
  if (!g) {
    g = buildGraph(data);
    graphs.set(data, g);
  }
  return g;
};

/** Where a plan district really is, in metres. */
function districtAt(data: GeoData, marketId: string, id: string, name: string, n: number) {
  const spec = GEO_DISTRICTS[marketId]?.[id];
  const byName = (want: string) =>
    data.places?.find((p) => p.n.toLowerCase() === want.toLowerCase());
  if (spec) {
    for (const nm of spec.slice(2) as string[]) {
      const hit = byName(nm);
      if (hit) return { e: hit.x, s: hit.y };
    }
    const p = fromLatLon(data, spec[0], spec[1]);
    return { e: p.x, s: p.y };
  }
  const hit = byName(name);
  if (hit) return { e: hit.x, s: hit.y };
  // Unknown: round the centre.
  const ang = n * 2.4;
  return { e: Math.cos(ang) * 1500, s: Math.sin(ang) * 1500 };
}

/**
 * The real airport near the district that hosts it: the nearest big airport
 * outline (within 12 km), at its edge towards the district when its middle
 * is off the map.
 */
function airportAt(data: GeoData, near: { e: number; s: number }) {
  const [x0, y0, x1, y1] = data.bounds;
  const on = (x: number, y: number) => x > x0 && x < x1 && y > y0 && y < y1;
  let best: { e: number; s: number } | null = null;
  let bestD = 12_000;
  for (const p of data.airport ?? []) {
    if (areaOf(p) < 400_000) continue;
    const c = centroidOf(p);
    const d = Math.hypot(c.x - near.e, c.y - near.s);
    if (d >= bestD) continue;
    let at = { e: c.x, s: c.y };
    if (!on(c.x, c.y)) {
      // The vertex nearest the district, a little way in.
      let vd = Infinity;
      for (let i = 0; i + 1 < p.length; i += 2) {
        const dd = Math.hypot(p[i]! - near.e, p[i + 1]! - near.s);
        if (dd < vd && on(p[i]!, p[i + 1]!)) {
          vd = dd;
          at = { e: p[i]! * 0.85 + c.x * 0.15, s: p[i + 1]! * 0.85 + c.y * 0.15 };
        }
      }
      if (vd === Infinity) continue;
    }
    bestD = d;
    best = at;
  }
  return best;
}

/** Traffic on the main roads near the places, along their real lines. */
function trafficOf(data: GeoData, flavour: Flavour, near: { e: number; s: number }[]) {
  const rnd = seeded(hash(`traffic:${data.city}`));
  const lines: number[][] = [];
  for (const c of ['trunk', 'primary', 'secondary'] as const)
    for (const r of data.roads?.[c] ?? []) {
      const l = r.l;
      if (l.length < 4) continue;
      let len = 0;
      for (let i = 2; i + 1 < l.length; i += 2)
        len += Math.hypot(l[i]! - l[i - 2]!, l[i + 1]! - l[i - 1]!);
      if (len < 250) continue;
      const mx = l[(l.length >> 2) * 2]!;
      const my = l[(l.length >> 2) * 2 + 1]!;
      if (near.some((p) => Math.hypot(p.e - mx, p.s - my) < 1800)) lines.push(l);
    }
  const vehicles: Vehicle[] = [];
  const n = Math.min(lines.length, 18);
  const pool = [...lines];
  for (let k = 0; k < n; k++) {
    const l = pool.splice(Math.floor(rnd() * pool.length), 1)[0]!;
    const fwd = rnd() < 0.5;
    const pts: Pt[] = [];
    for (let i = 0; i + 1 < l.length; i += 2) pts.push(geoTile(l[i]!, l[i + 1]!));
    // Keep to the right-hand lane of the road's line.
    const path = fwd ? pts : pts.reverse();
    const from = path[0]!;
    const to = path[path.length - 1]!;
    let len = 0;
    for (let i = 1; i < path.length; i++)
      len += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
    vehicles.push({
      spec: flavour.vehicles[k % flavour.vehicles.length]!,
      from,
      to,
      axis: Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? 'x' : 'y',
      dur: Math.max(8, len / 1.6),
      delay: -rnd() * 40,
      path,
    });
  }
  return vehicles;
}

export function buildGeoLayout(input: CityInput, data: GeoData, plan: CityPlan): CityLayout {
  const base = flavourOf(input.marketId);
  const flavour: Flavour = {
    ...base,
    streets: plan.streetNames.length ? plan.streetNames : base.streets,
  };
  const rnd = seeded(hash(`city:${input.marketId}`));
  const ctx: Ctx = { input, flavour, rnd, places: [], decor: [] };
  const graph = graphOf(data);
  const placer = new Placer(data, graph);

  // ---- Districts and who hosts what (as the planned layout decides it).
  const D = plan.districts.map((d, n) => ({
    d,
    at: districtAt(data, input.marketId, d.id, d.name, n),
  }));
  const byKind = (kinds: DistrictKind[]) => {
    for (const k of kinds) {
      const n = D.findIndex((x) => x.d.kind === k);
      if (n >= 0) return n;
    }
    return -1;
  };
  const hostOf = new Map<Host, number>();
  D.forEach((x, n) => {
    for (const h of x.d.hosts ?? []) if (!hostOf.has(h)) hostOf.set(h, n);
  });
  for (const h of Object.keys(HOST_FALLBACK) as Host[])
    if (!hostOf.has(h)) {
      const n = byKind(HOST_FALLBACK[h]);
      hostOf.set(h, n >= 0 ? n : 0);
    }
  const idx = new Map(D.map((x, n) => [x.d.id, n]));
  const bizIn = D.map(() => [] as BizInput[]);
  for (const b of [...(input.businesses ?? [])].sort((a, c) => (a.id < c.id ? -1 : 1))) {
    let n = idx.get(b.district);
    if (n === undefined) {
      n = byKind(CATEGORY_FALLBACK[b.category] ?? []);
      if (n < 0) n = hostOf.get('market') ?? 0;
    }
    bizIn[n]!.push(b);
  }
  const hosts = (n: number) =>
    (Object.keys(HOST_FALLBACK) as Host[]).filter((h) => hostOf.get(h) === n);
  const fin = financeItems(input);
  const capital = [...(input.capital ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1));
  const marketBlocks = Math.ceil(input.segments.length / 9);

  // ---- Make each district's buildings (the shared builders), then stand
  // each one on real ground near the district's heart.
  type Job = { p: Place; key: string; e: number; s: number; rank: number };
  const jobs: Job[] = [];
  const cell = { i: 0, j: 0 };
  const take = (n: number, rank: number, key = `d${n}`, at = D[n]!.at) => {
    for (const p of ctx.places.splice(0)) jobs.push({ p, key, e: at.e, s: at.s, rank });
    ctx.decor.length = 0;
  };
  D.forEach((x, n) => {
    const area = x.d.id;
    const hs = hosts(n);
    if (hs.includes('hub')) {
      putDowntown(ctx, cell, area);
      take(n, 0);
    }
    if (hs.includes('home')) {
      putHome(ctx, cell, area);
      take(n, 0);
    }
    if (hs.includes('eventhall')) {
      putEventHall(ctx, cell, area);
      take(n, 0);
    }
    if (hs.includes('airport')) {
      const airport = airportAt(data, x.at);
      putAirport(ctx, cell, area);
      take(n, 0, airport ? 'airport' : `d${n}`, airport ?? x.at);
    }
    if (hs.includes('market')) {
      putStalls(
        ctx,
        Array.from({ length: marketBlocks }, () => cell),
        area,
      );
      take(n, 2);
    }
    const items: LotItem[] = [
      ...(hs.includes('finance') ? fin : []),
      ...(hs.includes('investors')
        ? input.funds.map((f) => ({ kind: 'fund' as const, ...f }))
        : []),
      ...(hs.includes('hub')
        ? capital
            .filter((c) => c.kind === 'accelerator')
            .map((c) => ({ kind: 'capital' as const, cap: c }))
        : []),
      ...(hs.includes('investors')
        ? capital
            .filter((c) => c.kind !== 'accelerator')
            .map((c) => ({ kind: 'capital' as const, cap: c }))
        : []),
    ];
    for (const it of items) putLotItem(ctx, it, lot(0, 0, 1, 1), cell, area);
    take(n, 1);
    for (const b of bizIn[n]!)
      putLotItem(ctx, { kind: 'business', biz: b }, lot(0, 0, 1, 1), cell, area);
    take(n, 3);
  });
  // Key places first, then banks and funds, the market, then businesses.
  jobs.sort((a, b) => a.rank - b.rank);
  const places: Place[] = [];
  for (const j of jobs) {
    if (!placer.place(j.p, j.key, j.e, j.s)) {
      // Nowhere free (a tiny map): stand it at the nearest road anyway.
      const h = graph.nearest(j.e, j.s);
      const c = geoTile(h.x, h.y);
      j.p.x = c.x - j.p.w / 2;
      j.p.y = c.y - j.p.d / 2;
      j.p.door = c;
      j.p.doorFace = null;
    }
    places.push(j.p);
  }

  // ---- Landmarks, drawn among the buildings.
  const sprites = spritesOf(data, input.marketId);
  const decor: Decor[] = [];
  for (const sp of sprites) {
    const a = geoTile(sp.e, sp.s);
    const b = sp.e2 !== undefined ? geoTile(sp.e2, sp.s2!) : null;
    decor.push({
      kind: 'landmark',
      x: b ? (a.x + b.x) / 2 : a.x,
      y: b ? (a.y + b.y) / 2 : a.y,
      name: sp.name,
      sprite: sp.kind,
      ...(b ? { from: a, to: b } : {}),
      ...(sp.color ? { color: sp.color } : {}),
    });
    if (!b) placer.clear.push({ e: sp.e, s: sp.s, r: 45 });
  }

  const areas: Area[] = D.map((x) => ({
    id: x.d.id,
    name: x.d.name,
    kind: x.d.kind,
    at: geoTile(x.at.e, x.at.s),
  }));

  const [bx0, by0, bx1, by1] = data.bounds;
  const bounds = {
    minX: bx0 * GEO_KX,
    maxX: bx1 * GEO_KX,
    minY: by0 * GEO_KY - 120,
    maxY: by1 * GEO_KY,
  };
  const office = places.find((p) => p.kind === 'office')!;
  return {
    marketId: input.marketId,
    flavour,
    size: 1,
    extent: B,
    blocks: [],
    places,
    decor,
    vehicles: trafficOf(
      data,
      flavour,
      D.map((x) => x.at),
    ),
    streets: [],
    districts: [],
    areas,
    waters: [],
    bridges: [],
    cuts: [],
    boats: [],
    roundabouts: [],
    transit: [...plan.transit],
    bounds,
    start: office.door,
    ...(plan.marketName ? { marketName: plan.marketName } : {}),
    geo: { data, tileM: GEO_TILE_M, graph, sprites, clear: placer.clear },
  };
}

/**
 * The city to show: on its real map when the market has one (loaded) and a
 * plan, else the generated city.
 */
export function buildCityLayout(input: CityInput, data: GeoData | null): CityLayout {
  const plan = planOf(input.marketId);
  if (data && plan) return buildGeoLayout(input, data, plan);
  return buildLayout(input);
}
