/**
 * Street traffic around you: a pool of vehicles that live near the camera
 * (or your car) and drive the real OSM road graph — keeping to their lane,
 * easing off into each junction (and waiting while another vehicle crosses
 * it), queueing behind the car in front (on into the next street, too) and
 * behind you. Vehicles that fall too far behind are moved back in near you,
 * so the streets you're on are never empty. Pure (no three.js): Actors draws it.
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
  /** Edge ids by grid cell, in every cell an edge passes through (spawning near a point). */
  grid: Map<number, number[]>;
  /** Node ids by rounded position (`x,y` in whole metres). */
  ids: Map<string, number>;
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
    // A long straight road is in every cell along it, not just its middle's.
    const ax = xs[ea[e]!]!;
    const ay = ys[ea[e]!]!;
    const n = Math.ceil(len[e]! / (CELL / 2));
    let last = NaN;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const k = ckey(
        Math.floor((ax + (xs[eb[e]!]! - ax) * t) / CELL),
        Math.floor((ay + (ys[eb[e]!]! - ay) * t) / CELL),
      );
      if (k === last) continue;
      last = k;
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      if (list[list.length - 1] !== e) list.push(e);
    }
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
    ids,
  };
}

// ---------------------------------------------------------------------------
// The vehicles

/** Cruising speed by road class (m/s): motorway … residential. */
export const VMAX = [24, 19, 14, 12, 10, 8];
/** How much more often a vehicle is put on each road class (main roads are busier). */
const DENSITY = [5, 5, 4, 3, 1.6, 0.8];
/** Lane offset from the centre line (m), by class (your own car keeps to the same lanes). */
export const LANE = [5.5, 5.5, 3.6, 3.2, 2.2, 1.9];
/** Body length (m) by kind: how close the next one queues. */
export const LENGTH: Record<VehicleKind, number> = { car: 4.4, bus: 11, moto: 2, keke: 2.7 };

export interface Vehicle {
  kind: VehicleKind;
  /** Edge, and the way along it (true: from ea to eb). */
  e: number;
  fwd: boolean;
  /** Distance along the edge in the travel direction (m). */
  s: number;
  /** The street it takes at the end of this one (chosen on the way in, so it queues into it). */
  ne: number;
  nf: boolean;
  /** Its place in its lane's queue (this step). */
  qi: number;
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
  /** Driving: which way you're heading (unit vector, map metres). Traffic comes back in ahead of you. */
  hx?: number;
  hy?: number;
}

/** You, on the road: traffic behind you slows down and waits. */
export interface Obstacle {
  x: number;
  y: number;
}

/** The vehicle in front of you in your lane: how far to its back (m), and its speed (m/s). */
export interface Lead {
  gap: number;
  v: number;
}

/** A vehicle in a junction holds up the others coming into it (m from its middle). */
const JUNCTION = 6;
const laneKey = (e: number, fwd: boolean) => e * 2 + (fwd ? 1 : 0);

export class TrafficSim {
  readonly vehicles: Vehicle[] = [];
  private spawned = 0;
  /** Driving: the streets of your route (more traffic is put on them). */
  private route: Set<number> | null = null;
  /** Where you are (no one is put down on top of you). */
  private you: Obstacle | null = null;
  /** Edges already looked at in this search (near()). */
  private seen: Int32Array | null = null;
  private stamp = 0;
  /** Vehicles by lane (edge and way), back to front: rebuilt each step. */
  private lanes = new Map<number, Vehicle[]>();
  /** How much larger than life the vehicles are drawn (zoomed out): they queue that much further apart. */
  size = 1;

  constructor(
    readonly g: RoadGraph,
    readonly kinds: readonly VehicleKind[],
    private seed: number,
    readonly leftHand: boolean,
  ) {}

  /**
   * Edges near a point, weighted for picking (main roads more), each with
   * the stretch of it that's in reach (from `a` to `b` metres along it).
   */
  private near(f: Focus, minD: number): { e: number; w: number; a: number; b: number }[] {
    const out: { e: number; w: number; a: number; b: number }[] = [];
    const g = this.g;
    const seen = (this.seen ??= new Int32Array(g.ea.length));
    const mark = ++this.stamp;
    const i0 = Math.floor((f.x - f.r) / CELL);
    const i1 = Math.floor((f.x + f.r) / CELL);
    const j0 = Math.floor((f.y - f.r) / CELL);
    const j1 = Math.floor((f.y + f.r) / CELL);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const list = g.grid.get(ckey(i, j));
        if (!list) continue;
        for (const e of list) {
          if (seen[e] === mark) continue;
          seen[e] = mark;
          // The edge's nearest point to the focus, and the stretch within reach of it.
          const ax = g.nx[g.ea[e]!]!;
          const ay = g.ny[g.ea[e]!]!;
          const L = g.len[e]!;
          const ux = (g.nx[g.eb[e]!]! - ax) / L;
          const uy = (g.ny[g.eb[e]!]! - ay) / L;
          const t = Math.max(0, Math.min(L, (f.x - ax) * ux + (f.y - ay) * uy));
          const mx = ax + ux * t;
          const my = ay + uy * t;
          const d = Math.hypot(mx - f.x, my - f.y);
          if (d > f.r || d < minD) continue;
          const half = Math.sqrt(Math.max(0, f.r * f.r - d * d));
          const a = Math.max(0, t - half);
          const b = Math.min(L, t + half);
          // Busier close to you: up to 7× the chance on the streets around you,
          // so the roads you can see carry traffic, not just the far ones.
          const near = 1 - d / f.r;
          // Driving: mostly on the road ahead, where you'll meet it (you overtake the rest).
          const ahead =
            f.hx === undefined || d < 1
              ? 1
              : ((mx - f.x) * f.hx + (my - f.y) * f.hy!) / d > 0.2
                ? 4
                : 0.25;
          // Driving: your own streets carry the traffic you drive with.
          const mine = this.route?.has(e) ? 12 : 1;
          out.push({
            e,
            w: (DENSITY[g.cls[e]!] ?? 1) * (b - a) * (1 + 6 * near * near) * ahead * mine,
            a,
            b,
          });
        }
      }
    return out;
  }

  /**
   * Your route while you drive (map metres, along the road centre lines):
   * more of the traffic is put on its streets. Null to stop.
   */
  setRoute(pts: readonly { x: number; y: number }[] | null) {
    if (!pts) {
      this.route = null;
      return;
    }
    const g = this.g;
    const set = new Set<number>();
    const at = (p: { x: number; y: number }) => g.ids.get(`${Math.round(p.x)},${Math.round(p.y)}`);
    for (let i = 1; i < pts.length; i++) {
      const a = at(pts[i - 1]!);
      const b = at(pts[i]!);
      if (a === undefined || b === undefined) continue;
      for (const e of g.adj[a]!) if (g.ea[e] === b || g.eb[e] === b) set.add(e);
    }
    this.route = set;
  }

  private place(v: Vehicle, f: Focus, minD: number) {
    // Few roads in reach (a sparse part of the map): look further out.
    let cand = this.near(f, minD);
    if (!cand.length) cand = this.near({ ...f, r: f.r * 2 }, 0);
    v.life++;
    if (!cand.length) {
      v.e = -1;
      return;
    }
    const total = cand.reduce((a, c) => a + c.w, 0);
    // A few tries for a spot clear of you and of the vehicles already there.
    for (let tries = 0; tries < 4; tries++) {
      let r = h3(this.seed, this.spawned++, 31) * total;
      let pick = cand[cand.length - 1]!;
      for (const c of cand) {
        r -= c.w;
        if (r < 0) {
          pick = c;
          break;
        }
      }
      const k = this.spawned;
      v.e = pick.e;
      v.fwd = h3(this.seed, k, 37) < 0.5;
      // Somewhere on the stretch in reach (s runs from the end it's leaving).
      const at = pick.a + h3(this.seed, k, 41) * (pick.b - pick.a);
      v.s = v.fwd ? at : this.g.len[pick.e]! - at;
      v.v = (VMAX[this.g.cls[pick.e]!] ?? 8) * 0.6;
      this.locate(v);
      if (this.clear(v)) break;
    }
    this.chooseNext(v);
  }

  /** Nothing where a vehicle has just been put down: not you, not another in its lane. */
  private clear(v: Vehicle) {
    const you = this.you;
    if (you && Math.hypot(you.x - v.x, you.y - v.y) < 14) return false;
    const room = LENGTH[v.kind] * this.size + 4;
    for (const o of this.vehicles)
      if (o !== v && o.e === v.e && o.fwd === v.fwd && Math.abs(o.s - v.s) < room) return false;
    return true;
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
        ne: -1,
        nf: true,
        qi: 0,
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

  /** The node a vehicle's edge starts from (behind it). */
  private behind(v: Vehicle) {
    return v.fwd ? this.g.ea[v.e]! : this.g.eb[v.e]!;
  }

  /** Whether a vehicle's chosen next street still leads on from where it's heading. */
  private nextOk(v: Vehicle) {
    const g = this.g;
    const at = this.ahead(v);
    return v.ne >= 0 && (v.nf ? g.ea[v.ne] : g.eb[v.ne]) === at;
  }

  /**
   * The street to take at the end of this one (not straight back, unless
   * it's a dead end); main roads preferred.
   */
  private chooseNext(v: Vehicle) {
    const g = this.g;
    if (v.e < 0) return;
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
    v.nf = g.ea[next] === at;
    v.ne = next;
  }

  /** At the node: on into the street chosen for it. */
  private turn(v: Vehicle) {
    if (!this.nextOk(v)) this.chooseNext(v);
    v.e = v.ne;
    v.fwd = v.nf;
    this.chooseNext(v);
  }

  /**
   * Move everyone on by dt seconds. Vehicles outside the focus come back in
   * near it; `you` (your car or you on foot) holds up whoever is behind you.
   * Each vehicle looks only at the one in front of it in its lane (lanes are
   * kept sorted), and at who is in the junction ahead: no all-pairs checks.
   */
  step(dt: number, f: Focus, you: Obstacle | null) {
    const g = this.g;
    if (dt <= 0) return;
    this.you = you;
    // Who's in which lane, back to front (for queueing).
    const lanes = this.lanes;
    for (const l of lanes.values()) l.length = 0;
    // Who's in a junction (three or more ways) now: just before it or just after.
    const busy = new Map<number, Vehicle>();
    for (const v of this.vehicles) {
      if (v.e < 0) continue;
      const key = laneKey(v.e, v.fwd);
      let l = lanes.get(key);
      if (!l) lanes.set(key, (l = []));
      l.push(v);
      if (!this.nextOk(v)) this.chooseNext(v);
      const ahead = this.ahead(v);
      const from = this.behind(v);
      if (g.len[v.e]! - v.s < JUNCTION && g.adj[ahead]!.length >= 3) busy.set(ahead, v);
      else if (v.s < JUNCTION && g.adj[from]!.length >= 3 && !busy.has(from)) busy.set(from, v);
    }
    for (const l of lanes.values()) {
      if (l.length > 1) l.sort((a, b) => a.s - b.s);
      l.forEach((v, i) => (v.qi = i));
    }
    // Driving: the area sits ahead of you (centre 0.4 r in front). Anything left
    // more than 60 m behind you comes back in on the road ahead, close enough to see.
    const driving = f.hx !== undefined;
    const behindAt = -(f.r * 0.4 + 60);
    for (const v of this.vehicles) {
      const behind = driving && v.e >= 0 && (v.x - f.x) * f.hx! + (v.y - f.y) * f.hy! < behindAt;
      if (v.e < 0 || behind || Math.hypot(v.x - f.x, v.y - f.y) > f.r * 1.25) {
        // Gone too far (or never placed): back in, out of sight-line of you.
        this.place(v, f, driving ? 30 : Math.min(f.r * 0.5, 160));
        continue;
      }
      const L = g.len[v.e]!;
      const vmax = (VMAX[g.cls[v.e]!] ?? 8) * v.temper * (v.kind === 'bus' ? 0.8 : 1);
      let want = vmax;
      // How far it may move at most this step: never into the one in front.
      let room = Infinity;
      // Ease off into a junction (three or more ways), lightly.
      const rem = L - v.s;
      const at = this.ahead(v);
      const deg = g.adj[at]!.length;
      if (deg >= 3) {
        want = Math.min(want, 3 + rem * 0.45);
        // Someone else is crossing it: wait at the line.
        const o = busy.get(at);
        if (o && o !== v && rem >= JUNCTION) {
          want = Math.min(want, Math.max(0, (rem - JUNCTION) * 0.8));
          room = Math.min(room, rem - JUNCTION);
        }
      }
      // Queue behind the vehicle in front: in this lane, or the first one in the next.
      const mine = lanes.get(laneKey(v.e, v.fwd))!;
      let lead: Vehicle | undefined = mine[v.qi + 1];
      let ahead = lead ? lead.s - v.s : 0;
      if (!lead && v.ne >= 0) {
        lead = lanes.get(laneKey(v.ne, v.nf))?.[0];
        if (lead === v) lead = undefined;
        ahead = lead ? rem + lead.s : 0;
      }
      if (lead) {
        const gap = ahead - ((LENGTH[lead.kind] + LENGTH[v.kind]) / 2) * this.size - 2;
        want = Math.min(want, Math.max(0, lead.v + gap * 0.9));
        if (gap < 4) want = Math.min(want, Math.max(0, gap * 0.9));
        room = Math.min(room, gap + lead.v * dt);
      }
      // Behind you: slow and wait.
      if (you) {
        const rx = you.x - v.x;
        const ry = you.y - v.y;
        const along = rx * v.dx + ry * v.dy;
        const across = Math.abs(-rx * v.dy + ry * v.dx);
        if (along > 0 && along < 30 && across < 2.6) {
          const gap = along - (LENGTH[v.kind] / 2) * this.size - 4.5;
          want = Math.min(want, Math.max(0, gap * 0.8));
          room = Math.min(room, gap);
        }
      }
      const dv = want - v.v;
      v.v += dv > 0 ? Math.min(dv, 3.2 * dt) : Math.max(dv, -9 * dt);
      if (v.v < 0) v.v = 0;
      const move = Math.min(v.v * dt, Math.max(0, room));
      if (move < v.v * dt) v.v = move / dt;
      v.s += move;
      for (let guard = 0; v.s >= g.len[v.e]! && guard < 8; guard++) {
        v.s -= g.len[v.e]!;
        this.turn(v);
      }
      if (v.s >= g.len[v.e]!) v.s = g.len[v.e]! - 0.01;
      this.locate(v);
    }
  }

  /**
   * The vehicle in front of a car at (x, y) heading (hx, hy) in its lane (or
   * crossing it), within `reach` metres; `len` is that car's own length. Null
   * when the road ahead is clear.
   */
  leadOf(x: number, y: number, hx: number, hy: number, len: number, reach = 60): Lead | null {
    let best: Lead | null = null;
    for (const v of this.vehicles) {
      if (v.e < 0) continue;
      const rx = v.x - x;
      const ry = v.y - y;
      const along = rx * hx + ry * hy;
      if (along <= 0 || along > reach) continue;
      // In your lane (about a car's width either side, more for one across
      // it in a junction), going your way or crossing; not coming at you.
      const dot = v.dx * hx + v.dy * hy;
      const side = Math.abs(v.dx * hy - v.dy * hx);
      const half = (LENGTH[v.kind] * this.size) / 2;
      if (dot < -0.3 || Math.abs(-rx * hy + ry * hx) > 1.8 + half * side) continue;
      // To its back (or, across your way, its side: half a car's width).
      const gap = along - half * Math.abs(dot) - side - len / 2;
      // How fast it moves on out of your way (one crossing doesn't).
      if (!best || gap < best.gap) best = { gap, v: v.v * Math.max(0, dot) };
    }
    return best;
  }

  /** Vehicles on the road now. */
  count() {
    return this.vehicles.filter((v) => v.e >= 0).length;
  }
}
