/**
 * Wave 9 §B: the road network in 3D terms — a spatial index of road
 * segments (nearest road, its direction), bridge decks with their heights
 * (so viaducts and the Golden Gate stand above the water, and anyone on them
 * walks at deck level), and polylines for traffic.
 */
import { ROAD_CLASSES, type GeoData } from '../geo';

export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Road class index (0 motorway … 5 residential). */
  c: number;
  /** Deck height at a and b (bridges), else 0. */
  ha: number;
  hb: number;
  /** The street's name (OSM), when it has one. */
  n?: string;
}

const CELL = 150;

/** Deck heights of named bridges (metres above the water). */
const DECKS: [RegExp, number][] = [
  [/Golden Gate Bridge/i, 67],
  [/Bay Bridge|San Francisco.?Oakland/i, 58],
  [/Third Mainland/i, 9],
  [/Lekki.?Ikoyi/i, 12],
  [/Carter Bridge|Eko Bridge/i, 10],
  [/Tower Bridge/i, 9],
  [/Nelson Mandela Bridge/i, 9],
  [/6th October|October 6/i, 12],
];

export class RoadIndex {
  readonly segs: Seg[] = [];
  /** Bridge segments only. */
  readonly decks: Seg[] = [];
  private grid = new Map<number, number[]>();
  private deckGrid = new Map<number, number[]>();
  /** Polylines of the main roads (for traffic): flat [x, y, …] with their class. */
  readonly lines: { l: number[]; c: number; len: number }[] = [];

  constructor(data: GeoData) {
    ROAD_CLASSES.forEach((c, ci) => {
      for (const r of data.roads?.[c] ?? []) this.addLine(r.l, ci, null, r.n);
    });
    this.addBridges(data);
  }

  private key = (i: number, j: number) => (i + 5000) * 10000 + (j + 5000);

  private addLine(l: number[], c: number, h: number[] | null, name?: string | null) {
    let len = 0;
    for (let i = 0; i + 3 < l.length; i += 2) {
      const s: Seg = {
        ax: l[i]!,
        ay: l[i + 1]!,
        bx: l[i + 2]!,
        by: l[i + 3]!,
        c,
        ha: h ? h[i / 2]! : 0,
        hb: h ? h[i / 2 + 1]! : 0,
        ...(name ? { n: name } : {}),
      };
      len += Math.hypot(s.bx - s.ax, s.by - s.ay);
      this.addSeg(s, !!h);
    }
    if (c <= 3 && len > 200) this.lines.push({ l, c, len });
  }

  private addSeg(s: Seg, deck: boolean) {
    this.insert(this.grid, s, this.segs.push(s) - 1);
    if (deck) this.insert(this.deckGrid, s, this.decks.push(s) - 1);
  }

  private insert(grid: Map<number, number[]>, s: Seg, n: number) {
    const i0 = Math.floor(Math.min(s.ax, s.bx) / CELL);
    const i1 = Math.floor(Math.max(s.ax, s.bx) / CELL);
    const j0 = Math.floor(Math.min(s.ay, s.by) / CELL);
    const j1 = Math.floor(Math.max(s.ay, s.by) / CELL);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = this.key(i, j);
        let a = grid.get(k);
        if (!a) grid.set(k, (a = []));
        a.push(n);
      }
  }

  /**
   * Bridges: decks raised over what they cross. A chain of bridge ways that
   * meet end to end ramps down only at its free ends.
   */
  private addBridges(data: GeoData) {
    const ends = new Map<string, number>();
    const k = (x: number, y: number) => `${Math.round(x / 3)},${Math.round(y / 3)}`;
    const bridges = data.bridges ?? [];
    for (const b of bridges) {
      const l = b.l;
      if (l.length < 4) continue;
      for (const key of [k(l[0]!, l[1]!), k(l[l.length - 2]!, l[l.length - 1]!)])
        ends.set(key, (ends.get(key) ?? 0) + 1);
    }
    for (const b of bridges) {
      const l = b.l;
      if (l.length < 4) continue;
      const ci = Math.max(0, ROAD_CLASSES.indexOf(b.c));
      let total = 0;
      const cum = [0];
      for (let i = 2; i + 1 < l.length; i += 2) {
        total += Math.hypot(l[i]! - l[i - 2]!, l[i + 1]! - l[i - 1]!);
        cum.push(total);
      }
      const named = b.n ? DECKS.find(([re]) => re.test(b.n!)) : undefined;
      const H = named ? named[1] : ci <= 1 ? 9 : total > 400 ? 10 : 6;
      const freeA = (ends.get(k(l[0]!, l[1]!)) ?? 0) < 2;
      const freeB = (ends.get(k(l[l.length - 2]!, l[l.length - 1]!)) ?? 0) < 2;
      const ramp = Math.min(named ? 400 : 120, total * 0.3);
      const h = cum.map((d) => {
        let f = 1;
        if (freeA) f = Math.min(f, d / ramp);
        if (freeB) f = Math.min(f, (total - d) / ramp);
        f = Math.max(0, Math.min(1, f));
        return H * (f * f * (3 - 2 * f));
      });
      this.addLine(l, ci, h, b.n);
    }
  }

  /**
   * A landmark bridge stands here: decks along the line rise to its height
   * (and if the file has no deck there, one is added).
   */
  raiseAlong(ax: number, ay: number, bx: number, by: number, H: number) {
    const L = Math.hypot(bx - ax, by - ay) || 1;
    const prof = (t: number) => {
      const a = Math.max(0, Math.min(1, (t + 0.02) / 0.1));
      const b = Math.max(0, Math.min(1, (1.02 - t) / 0.1));
      const f = Math.min(a, b);
      return H * f * f * (3 - 2 * f);
    };
    const tOf = (x: number, y: number) => ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (L * L);
    const off = (x: number, y: number) => Math.abs((x - ax) * (by - ay) - (y - ay) * (bx - ax)) / L;
    let hits = 0;
    for (const s of this.decks.slice()) {
      const da = segDist(s.ax, s.ay, ax, ay, bx, by).d;
      const db = segDist(s.bx, s.by, ax, ay, bx, by).d;
      const sl = Math.hypot(s.bx - s.ax, s.by - s.ay);
      const ta = tOf(s.ax, s.ay);
      const tb = tOf(s.bx, s.by);
      // Or the file's own deck of it, running on past its ends (onto a viaduct
      // over land): its stretch along the bridge rises, the rest stays.
      const inLine =
        sl > 30 &&
        off(s.ax, s.ay) < 90 &&
        off(s.bx, s.by) < 90 &&
        Math.max(ta, tb) > -0.02 &&
        Math.min(ta, tb) < 1.02 &&
        Math.abs((s.bx - s.ax) * (bx - ax) + (s.by - s.ay) * (by - ay)) / (sl * L) > 0.95;
      if ((da > 45 || db > 45) && !inLine) continue;
      hits++;
      // In pieces (a single long way would only slope from end to end).
      const n = Math.max(1, Math.ceil(sl / 60));
      const { ax: x0, ay: y0, bx: x1, by: y1, ha, hb } = s;
      const hAt = (k: number) => {
        const x = x0 + ((x1 - x0) * k) / n;
        const y = y0 + ((y1 - y0) * k) / n;
        return Math.max(prof(tOf(x, y)), ha + ((hb - ha) * k) / n);
      };
      s.bx = x0 + (x1 - x0) / n;
      s.by = y0 + (y1 - y0) / n;
      s.ha = hAt(0);
      s.hb = hAt(1);
      for (let k = 1; k < n; k++)
        this.addSeg(
          {
            ax: x0 + ((x1 - x0) * k) / n,
            ay: y0 + ((y1 - y0) * k) / n,
            bx: x0 + ((x1 - x0) * (k + 1)) / n,
            by: y0 + ((y1 - y0) * (k + 1)) / n,
            c: s.c,
            ha: hAt(k),
            hb: hAt(k + 1),
            ...(s.n ? { n: s.n } : {}),
          },
          true,
        );
    }
    if (hits) return;
    const l: number[] = [];
    const h: number[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = -0.02 + (1.04 * i) / 24;
      l.push(ax + (bx - ax) * t, ay + (by - ay) * t);
      h.push(prof(t));
    }
    this.addLine(l, 0, h);
  }

  private near(
    grid: Map<number, number[]>,
    x: number,
    y: number,
    r: number,
    cb: (n: number) => void,
  ) {
    const i0 = Math.floor((x - r) / CELL);
    const i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((y - r) / CELL);
    const j1 = Math.floor((y + r) / CELL);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const a = grid.get(this.key(i, j));
        if (a) for (const n of a) cb(n);
      }
  }

  /** Every road segment (bridges included) whose cell is within r of a point. */
  forNear(x: number, y: number, r: number, cb: (s: Seg) => void) {
    const seen = new Set<number>();
    this.near(this.grid, x, y, r, (n) => {
      if (seen.has(n)) return;
      seen.add(n);
      cb(this.segs[n]!);
    });
  }

  /** The nearest road segment within r: its direction (radians), distance, class and closest point. */
  nearest(
    x: number,
    y: number,
    r: number,
    maxClass = 5,
  ): { angle: number; d: number; c: number; x: number; y: number; n?: string } | null {
    let best: { angle: number; d: number; c: number; x: number; y: number; n?: string } | null =
      null;
    this.near(this.grid, x, y, r, (n) => {
      const s = this.segs[n]!;
      if (s.c > maxClass) return;
      const h = segDist(x, y, s.ax, s.ay, s.bx, s.by);
      if (h.d < r && (!best || h.d < best.d))
        best = {
          angle: Math.atan2(s.by - s.ay, s.bx - s.ax),
          d: h.d,
          c: s.c,
          x: h.x,
          y: h.y,
          ...(s.n ? { n: s.n } : {}),
        };
    });
    return best;
  }

  /** Deck height at a point (0 off any bridge). */
  deckAt(x: number, y: number): number {
    let h = 0;
    let bd = 9;
    this.near(this.deckGrid, x, y, 10, (n) => {
      const s = this.decks[n]!;
      const hit = segDist(x, y, s.ax, s.ay, s.bx, s.by);
      if (hit.d < bd) {
        bd = hit.d;
        h = s.ha + (s.hb - s.ha) * hit.t;
      }
    });
    return h;
  }
}

export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { d: Math.hypot(px - x, py - y), t, x, y };
}
