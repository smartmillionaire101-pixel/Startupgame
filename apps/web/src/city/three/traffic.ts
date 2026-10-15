/**
 * Street traffic around you: a pool of vehicles that live near the camera
 * (or your car) and drive the real OSM road graph — keeping to their lane,
 * easing off into each junction, queueing behind the car in front and behind
 * you. Vehicles that fall too far behind are moved back in near you, so the
 * streets you're on are never empty. Pure (no three.js): Actors draws it.
 *
 * Deterministic for a seed: the same city and the same moves give the same
 * traffic (no Math.random).
 */
import { h3 } from './buildings';
import type { Seg } from './roads';

/** What drives here: cars (and taxis), buses (danfo, matatu, red buses), motorbikes (okada, boda), tricycles (keke, tuk-tuk). */
export type VehicleKind = 'car' | 'bus' | 'moto' | 'keke';
export const VEHICLE_KINDS: readonly VehicleKind[] = ['car', 'bus', 'moto', 'keke'];

export interface CityFleet {
  /** Share of each kind (sums to about 1). */
  mix: Record<VehicleKind, number>;
  /** Share of cars that are taxis, and their colour. */
  taxiShare: number;
  taxi: string;
  /** Bus colours (danfo yellow, London red…), drawn in turn. */
  bus: string[];
  /** Tricycle colours. */
  keke: string;
  leftHand: boolean;
}

const FLEETS: Record<string, CityFleet> = {
  lagos: {
    mix: { car: 0.5, bus: 0.16, moto: 0.18, keke: 0.16 },
    taxiShare: 0.12,
    taxi: '#f2c230',
    bus: ['#f2c230', '#f2c230', '#e9e4d8'],
    keke: '#f2c230',
    leftHand: false,
  },
  accra: {
    mix: { car: 0.6, bus: 0.18, moto: 0.14, keke: 0.08 },
    taxiShare: 0.2,
    taxi: '#f2c230',
    bus: ['#e9e4d8', '#f2c230'],
    keke: '#f2c230',
    leftHand: false,
  },
  nairobi: {
    mix: { car: 0.55, bus: 0.22, moto: 0.18, keke: 0.05 },
    taxiShare: 0.06,
    taxi: '#f5f5f4',
    bus: ['#7c3aed', '#1f2937', '#e11d48', '#f5f5f4'],
    keke: '#facc15',
    leftHand: true,
  },
  kigali: {
    mix: { car: 0.5, bus: 0.12, moto: 0.38, keke: 0 },
    taxiShare: 0.05,
    taxi: '#2563eb',
    bus: ['#1d4ed8', '#f5f5f4'],
    keke: '#facc15',
    leftHand: false,
  },
  freetown: {
    mix: { car: 0.42, bus: 0.12, moto: 0.26, keke: 0.2 },
    taxiShare: 0.25,
    taxi: '#f2c230',
    bus: ['#e9e4d8', '#f2c230'],
    keke: '#f2c230',
    leftHand: false,
  },
  johannesburg: {
    mix: { car: 0.72, bus: 0.24, moto: 0.04, keke: 0 },
    taxiShare: 0.02,
    taxi: '#f5f5f4',
    // Mostly white minibus taxis, the odd Rea Vaya bus.
    bus: ['#f5f5f4', '#f5f5f4', '#f5f5f4', '#e8a33a'],
    keke: '#facc15',
    leftHand: true,
  },
  cairo: {
    mix: { car: 0.62, bus: 0.18, moto: 0.06, keke: 0.14 },
    taxiShare: 0.25,
    taxi: '#f5f5f4',
    bus: ['#e9e4d8', '#2563eb'],
    keke: '#1f2937',
    leftHand: false,
  },
  dubai: {
    mix: { car: 0.88, bus: 0.08, moto: 0.04, keke: 0 },
    taxiShare: 0.18,
    taxi: '#d9c3a0',
    bus: ['#e9e4d8', '#c8102e'],
    keke: '#facc15',
    leftHand: false,
  },
  london: {
    mix: { car: 0.8, bus: 0.14, moto: 0.06, keke: 0 },
    taxiShare: 0.18,
    taxi: '#141414',
    bus: ['#c8102e'],
    keke: '#facc15',
    leftHand: true,
  },
  'san-francisco': {
    mix: { car: 0.84, bus: 0.12, moto: 0.04, keke: 0 },
    taxiShare: 0.08,
    taxi: '#f2c230',
    // Muni buses and the odd cable car (wood brown and red).
    bus: ['#c9302c', '#e9e4d8', '#7a2e1f'],
    keke: '#facc15',
    leftHand: false,
  },
};

export const fleetOf = (marketId: string): CityFleet =>
  FLEETS[marketId] ?? {
    mix: { car: 0.8, bus: 0.12, moto: 0.08, keke: 0 },
    taxiShare: 0.15,
    taxi: '#f2c230',
    bus: ['#e9e4d8'],
    keke: '#facc15',
    leftHand: false,
  };

/** How many vehicles drive around you: a busy street on a good GPU, a few on a software one. */
export function trafficBudget(tier: 'high' | 'low', soft: boolean): number {
  if (soft) return 15;
  return tier === 'high' ? 90 : 40;
}

/** The kind of vehicle in pool slot k (fixed, so each kind has its own instanced mesh). */
export function kindOfSlot(fleet: CityFleet, seed: number, k: number): VehicleKind {
  const r = h3(seed, k, 71);
  let acc = 0;
  for (const kind of VEHICLE_KINDS) {
    acc += fleet.mix[kind];
    if (r < acc) return kind;
  }
  return 'car';
}

// ---------------------------------------------------------------------------
// The road graph

export interface RoadGraph {
  /** Node positions. */
  nx: Float64Array;
  ny: Float64Array;
  /** Edges out of each node (edge ids). */
  adj: number[][];
  /** Edge ends (node ids), length and road class. */
  ea: Int32Array;
  eb: Int32Array;
  len: Float64Array;
  cls: Uint8Array;
  /** Edge ids by grid cell (spawning near a point). */
  grid: Map<number, number[]>;
}

const CELL = 200;
const ckey = (i: number, j: number) => (i + 5000) * 10000 + (j + 5000);

/** Joins road segments that meet (within a metre) into a graph. */
export function buildGraph(segs: readonly Seg[]): RoadGraph {
  const ids = new Map<string, number>();
  const xs: number[] = [];
  const ys: number[] = [];
  const node = (x: number, y: number) => {
    const k = `${Math.round(x)},${Math.round(y)}`;
    let n = ids.get(k);
    if (n === undefined) {
      n = xs.length;
      ids.set(k, n);
      xs.push(x);
      ys.push(y);
    }
    return n;
  };
  const ea: number[] = [];
  const eb: number[] = [];
  const len: number[] = [];
  const cls: number[] = [];
  for (const s of segs) {
    const l = Math.hypot(s.bx - s.ax, s.by - s.ay);
    if (l < 0.5) continue;
    const a = node(s.ax, s.ay);
    const b = node(s.bx, s.by);
    if (a === b) continue;
    ea.push(a);
    eb.push(b);
    len.push(l);
    cls.push(s.c);
  }
  const adj: number[][] = xs.map(() => []);
  const grid = new Map<number, number[]>();
  for (let e = 0; e < ea.length; e++) {
    adj[ea[e]!]!.push(e);
    adj[eb[e]!]!.push(e);
    const mx = (xs[ea[e]!]! + xs[eb[e]!]!) / 2;
    const my = (ys[ea[e]!]! + ys[eb[e]!]!) / 2;
    const k = ckey(Math.floor(mx / CELL), Math.floor(my / CELL));
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(e);
  }
  return {
    nx: Float64Array.from(xs),
    ny: Float64Array.from(ys),
    adj,
    ea: Int32Array.from(ea),
    eb: Int32Array.from(eb),
    len: Float64Array.from(len),
    cls: Uint8Array.from(cls),
    grid,
  };
}

// ---------------------------------------------------------------------------
// The vehicles

/** Cruising speed by road class (m/s): motorway … residential. */
const VMAX = [24, 19, 14, 12, 10, 8];
/** How much more often a vehicle is put on each road class (main roads are busier). */
const DENSITY = [5, 5, 4, 3, 1.6, 0.8];
/** Lane offset from the centre line (m), by class. */
const LANE = [5.5, 5.5, 3.6, 3.2, 2.2, 1.9];
/** Body length (m) by kind: how close the next one queues. */
export const LENGTH: Record<VehicleKind, number> = { car: 4.4, bus: 11, moto: 2, keke: 2.7 };

export interface Vehicle {
  kind: VehicleKind;
  /** Edge, and the way along it (true: from ea to eb). */
  e: number;
  fwd: boolean;
  /** Distance along the edge in the travel direction (m). */
  s: number;
  v: number;
  /** This driver's cruising factor (0.8–1.15). */
  temper: number;
  /** Turns taken: seeds the next choice. */
  turns: number;
  /** Respawns: seeds where it comes back. */
  life: number;
  /** World position and heading (radians, atan2(dy, dx) of travel) after the last step. */
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface Focus {
  x: number;
  y: number;
  /** Radius vehicles live in (m). */
  r: number;
}

/** You, on the road: traffic behind you slows down and waits. */
export interface Obstacle {
  x: number;
  y: number;
}

export class TrafficSim {
  readonly vehicles: Vehicle[] = [];
  private spawned = 0;

  constructor(
    readonly g: RoadGraph,
    readonly kinds: readonly VehicleKind[],
    private seed: number,
    readonly leftHand: boolean,
  ) {}

  /** Edges near a point, weighted for picking (main roads more). */
  private near(f: Focus, minD: number): { e: number; w: number }[] {
    const out: { e: number; w: number }[] = [];
    const g = this.g;
    const i0 = Math.floor((f.x - f.r) / CELL);
    const i1 = Math.floor((f.x + f.r) / CELL);
    const j0 = Math.floor((f.y - f.r) / CELL);
    const j1 = Math.floor((f.y + f.r) / CELL);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const list = g.grid.get(ckey(i, j));
        if (!list) continue;
        for (const e of list) {
          const mx = (g.nx[g.ea[e]!]! + g.nx[g.eb[e]!]!) / 2;
          const my = (g.ny[g.ea[e]!]! + g.ny[g.eb[e]!]!) / 2;
          const d = Math.hypot(mx - f.x, my - f.y);
          if (d > f.r || d < minD) continue;
          out.push({ e, w: (DENSITY[g.cls[e]!] ?? 1) * g.len[e]! });
        }
      }
    return out;
  }

  private place(v: Vehicle, f: Focus, minD: number) {
    const cand = this.near(f, minD);
    v.life++;
    if (!cand.length) {
      v.e = -1;
      return;
    }
    const total = cand.reduce((a, c) => a + c.w, 0);
    let r = h3(this.seed, this.spawned++, 31) * total;
    let pick = cand[cand.length - 1]!.e;
    for (const c of cand) {
      r -= c.w;
      if (r < 0) {
        pick = c.e;
        break;
      }
    }
    const k = this.spawned;
    v.e = pick;
    v.fwd = h3(this.seed, k, 37) < 0.5;
    v.s = h3(this.seed, k, 41) * this.g.len[pick]!;
    v.v = (VMAX[this.g.cls[pick]!] ?? 8) * 0.6;
    this.locate(v);
  }

  /** Fill the pool around a point (the first frame, or a new city). */
  fill(f: Focus) {
    this.vehicles.length = 0;
    this.kinds.forEach((kind, k) => {
      const v: Vehicle = {
        kind,
        e: -1,
        fwd: true,
        s: 0,
        v: 0,
        temper: 0.8 + h3(this.seed, k, 43) * 0.35,
        turns: 0,
        life: 0,
        x: 0,
        y: 0,
        dx: 1,
        dy: 0,
      };
      this.place(v, f, 0);
      this.vehicles.push(v);
    });
  }

  /** Lane offset for a vehicle: kept right (or left), motorbikes nearer the kerb. */
  laneOf(v: Vehicle): number {
    const base = LANE[this.g.cls[v.e]!] ?? 2;
    const k = v.kind === 'moto' ? 0.9 : v.kind === 'bus' ? 1.15 : 1;
    return base * k * (this.leftHand ? -1 : 1);
  }

  private locate(v: Vehicle) {
    const g = this.g;
    if (v.e < 0) return;
    const a = v.fwd ? g.ea[v.e]! : g.eb[v.e]!;
    const b = v.fwd ? g.eb[v.e]! : g.ea[v.e]!;
    const L = g.len[v.e]!;
    const dx = (g.nx[b]! - g.nx[a]!) / L;
    const dy = (g.ny[b]! - g.ny[a]!) / L;
    const lane = this.laneOf(v);
    v.dx = dx;
    v.dy = dy;
    // Right of travel in map metres (x east, y south) is (-dy, dx).
    v.x = g.nx[a]! + dx * v.s - dy * lane;
    v.y = g.ny[a]! + dy * v.s + dx * lane;
  }

  /** The node a vehicle is heading for. */
  private ahead(v: Vehicle) {
    return v.fwd ? this.g.eb[v.e]! : this.g.ea[v.e]!;
  }

  /** At a node: the next edge (not straight back, unless it's a dead end); main roads preferred. */
  private turn(v: Vehicle) {
    const g = this.g;
    const at = this.ahead(v);
    const opts = g.adj[at]!.filter((e) => e !== v.e);
    v.turns++;
    let next = v.e;
    if (opts.length) {
      // Prefer going on straight-ish and onto a bigger road.
      const hx = v.dx;
      const hy = v.dy;
      let total = 0;
      const ws = opts.map((e) => {
        const o = g.ea[e] === at ? g.eb[e]! : g.ea[e]!;
        const ox = (g.nx[o]! - g.nx[at]!) / g.len[e]!;
        const oy = (g.ny[o]! - g.ny[at]!) / g.len[e]!;
        const straight = 0.35 + Math.max(0, hx * ox + hy * oy);
        const w = straight * (DENSITY[g.cls[e]!] ?? 1);
        total += w;
        return w;
      });
      let r = h3(this.seed, v.life * 7919 + v.turns, ((v.e * 31) ^ at) | 0) * total;
      next = opts[opts.length - 1]!;
      for (let i = 0; i < opts.length; i++) {
        r -= ws[i]!;
        if (r < 0) {
          next = opts[i]!;
          break;
        }
      }
    }
    v.fwd = g.ea[next] === at;
    v.e = next;
  }

  /**
   * Move everyone on by dt seconds. Vehicles outside the focus come back in
   * near it; `you` (your car or you on foot) holds up whoever is behind you.
   */
  step(dt: number, f: Focus, you: Obstacle | null) {
    const g = this.g;
    if (dt <= 0) return;
    // Who's on which edge (for queueing).
    const onEdge = new Map<number, Vehicle[]>();
    for (const v of this.vehicles) {
      if (v.e < 0) continue;
      const key = v.e * 2 + (v.fwd ? 1 : 0);
      let l = onEdge.get(key);
      if (!l) onEdge.set(key, (l = []));
      l.push(v);
    }
    for (const v of this.vehicles) {
      if (v.e < 0 || Math.hypot(v.x - f.x, v.y - f.y) > f.r * 1.25) {
        // Gone too far (or never placed): back in, out of sight-line of you.
        this.place(v, f, Math.min(f.r * 0.5, 160));
        continue;
      }
      const L = g.len[v.e]!;
      const vmax = (VMAX[g.cls[v.e]!] ?? 8) * v.temper * (v.kind === 'bus' ? 0.8 : 1);
      let want = vmax;
      // Ease off into a junction (three or more ways), lightly.
      const rem = L - v.s;
      const deg = g.adj[this.ahead(v)]!.length;
      if (deg >= 3) want = Math.min(want, 3 + rem * 0.45);
      // Queue behind the vehicle in front on this edge.
      const mine = onEdge.get(v.e * 2 + (v.fwd ? 1 : 0))!;
      for (const o of mine) {
        if (o === v || o.s <= v.s) continue;
        const gap = o.s - v.s - (LENGTH[o.kind] + LENGTH[v.kind]) / 2 - 2;
        want = Math.min(want, Math.max(0, gap * 0.9));
      }
      // Behind you: slow and wait.
      if (you) {
        const rx = you.x - v.x;
        const ry = you.y - v.y;
        const along = rx * v.dx + ry * v.dy;
        const across = Math.abs(-rx * v.dy + ry * v.dx);
        if (along > 0 && along < 30 && across < 3.2) {
          const gap = along - LENGTH[v.kind] / 2 - 4.5;
          want = Math.min(want, Math.max(0, gap * 0.8));
        }
      }
      const dv = want - v.v;
      v.v += dv > 0 ? Math.min(dv, 3.2 * dt) : Math.max(dv, -9 * dt);
      if (v.v < 0) v.v = 0;
      v.s += v.v * dt;
      for (let guard = 0; v.s >= g.len[v.e]! && guard < 8; guard++) {
        v.s -= g.len[v.e]!;
        this.turn(v);
      }
      if (v.s >= g.len[v.e]!) v.s = g.len[v.e]! - 0.01;
      this.locate(v);
    }
  }

  /** Vehicles on the road now. */
  count() {
    return this.vehicles.filter((v) => v.e >= 0).length;
  }
}
