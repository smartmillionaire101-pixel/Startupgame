/**
 * Driving your own car on the 3D map: you hold GO (or BRAKE) and the car
 * keeps its lane by itself, up to the road's speed, never closer than a gap
 * to the car in front. At each junction on the route it slows and offers the
 * ways on (← ↑ →, only those that exist; the route's lit): another one
 * re-routes from that street. Left alone at a standstill it says how to
 * drive, then drives you there gently itself. No three.js and no React:
 * CityMap3D steps it each frame and DriveHud shows it.
 *
 * The trip runs faster than life (kilometres in a few seconds, as before):
 * speeds here are on the map (m/s), `pace` times a real car's; the speed
 * shown is the real one.
 */
import type { WalkGraph } from '../geoLayout';
import { geoMetres, geoTile } from '../geoLayout';
import type { Pt } from '../layout';
import type { Lead } from './traffic';
import { VMAX } from './traffic';

export type Way = 'left' | 'straight' | 'right';

interface P2 {
  x: number;
  y: number;
}

/** What the car needs from the map around it (Actors gives it). */
export interface DriveWorld {
  /** Your lane along a centre-line path (tiles); from the start's lane, not its kerb, when `fromLane`. */
  streetPath(path: readonly Pt[], how: 'lane', fromLane?: boolean): Pt[];
  /** The road at a point (metres): class and name. */
  roadAt(x: number, y: number): { c: number; n?: string } | null;
  /** The vehicle in front of you, at the trip's pace. */
  leadAhead(): Lead | null;
  /** Driving on (more traffic on these streets, at your pace); the route line ahead. */
  setDriving(on: boolean, path?: readonly Pt[], cruise?: number): void;
  setRouteLine(pts: readonly P2[] | null): void;
  /** How much faster than life the trip runs. */
  readonly pace: number;
}

interface Junction {
  /** Where along the street path (m). */
  s: number;
  node: number;
  /** The ways on: which neighbour each leads to. */
  ways: { dir: Way; to: number }[];
  /** The route's way. */
  route: Way;
  /** The street the route turns into (its name, when known). */
  street?: string;
}

export interface DriveView {
  /** Real-life speed (km/h). */
  kmh: number;
  /** Metres to go. */
  left: number;
  /** The next turn on the route (or the end). */
  next: { dir: Way | 'arrive'; dist: number; street?: string };
  /** After it: how far on to the one after (m). */
  then: number | null;
  /** At a junction now: the ways you can take, the route's lit. */
  ways: { dir: Way; route: boolean }[] | null;
  /** Standing still, untouched: how to drive. */
  hint: boolean;
  /** Left alone a while: the car drives itself. */
  auto: boolean;
  /** Re-routed (a count: the HUD can say so). */
  reroutes: number;
}

/** Ways by angle: within 35° of straight on; U-turns (beyond 150°) aren't offered. */
const STRAIGHT = (35 * Math.PI) / 180;
const UTURN = (150 * Math.PI) / 180;
/** Standing still untouched: the hint after this long (s), the car drives itself after this. */
const HINT_AFTER = 4;
const AUTO_AFTER = 8;
/** The gap kept to the car in front (m), and how far ahead the route line runs. */
const GAP = 2.5;
const LINE_AHEAD = 700;

/** Signed turn from heading a to heading b (radians, positive = left, map x east / y south). */
function turnOf(a: P2, b: P2) {
  // y south: a left turn is clockwise on the page's maths, i.e. cross < 0.
  return -Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
}
const wayOf = (rel: number): Way | null =>
  Math.abs(rel) > UTURN ? null : Math.abs(rel) < STRAIGHT ? 'straight' : rel > 0 ? 'left' : 'right';
const IDEAL: Record<Way, number> = { left: Math.PI / 2, straight: 0, right: -Math.PI / 2 };

const toM = (p: Pt): P2 => {
  const m = geoMetres(p);
  return { x: m.e, y: m.s };
};

export class Drive {
  /** Held: GO, BRAKE. */
  go = false;
  brake = false;
  private v = 0;
  private s = 0;
  private street: P2[] = [];
  private cum: number[] = [];
  private len = 0;
  private junctions: Junction[] = [];
  private idle = 0;
  private auto = false;
  private blocked = 0;
  private ghost = 0;
  private reroutes = 0;
  readonly cruise: number;
  private destM: P2;

  constructor(
    private world: DriveWorld,
    private graph: WalkGraph,
    path: readonly Pt[],
    private dest: Pt,
    ms: number,
  ) {
    this.destM = toM(dest);
    this.setRoute(path.map(toM), null);
    // About the trip's planned time at a side street's pace.
    this.cruise = (this.len / Math.max(0.5, ms / 1000)) * 1.15;
    world.setDriving(true, path, this.cruise);
  }

  /** Metres along the street path → a point and the way it heads. */
  private at(s: number): { p: P2; dx: number; dy: number } {
    const c = this.cum;
    let i = 1;
    while (i < c.length - 1 && c[i]! < s) i++;
    const a = this.street[i - 1]!;
    const b = this.street[i]!;
    const L = c[i]! - c[i - 1]! || 1;
    const u = Math.max(0, Math.min(1, (s - c[i - 1]!) / L));
    return {
      p: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u },
      dx: b.x - a.x,
      dy: b.y - a.y,
    };
  }

  /**
   * A new route along `centre` (metres, the road centre lines): your lane
   * along it (on from `from`, where the car is, when re-routing), and its
   * junctions with the ways on from each.
   */
  private setRoute(centre: P2[], from: P2 | null) {
    const tiles = centre.map((p) => geoTile(p.x, p.y));
    const lane = this.world.streetPath(tiles, 'lane', !!from).map(toM);
    this.street = from ? [from, ...lane] : lane;
    this.cum = [0];
    for (let i = 1; i < this.street.length; i++)
      this.cum.push(
        this.cum[i - 1]! +
          Math.hypot(
            this.street[i]!.x - this.street[i - 1]!.x,
            this.street[i]!.y - this.street[i - 1]!.y,
          ),
      );
    this.len = this.cum[this.cum.length - 1]!;
    this.s = 0;
    // Junctions: route points where three or more ways meet.
    const g = this.graph;
    this.junctions = [];
    let j = 0;
    for (let k = 1; k < centre.length - 1; k++) {
      const node = g.nodeAt(centre[k]!.x, centre[k]!.y);
      if (node === undefined) continue;
      const nbs = g.neighbours(node);
      if (nbs.length < 3) continue;
      const here = centre[k]!;
      const inDir = { x: here.x - centre[k - 1]!.x, y: here.y - centre[k - 1]!.y };
      const outDir = { x: centre[k + 1]!.x - here.x, y: centre[k + 1]!.y - here.y };
      const route = wayOf(turnOf(inDir, outDir));
      if (!route) continue;
      const prev = g.nodeAt(centre[k - 1]!.x, centre[k - 1]!.y);
      const onRoute = g.nodeAt(centre[k + 1]!.x, centre[k + 1]!.y);
      // One way per direction: the street nearest to it (the route's own
      // street always stands for the route's way).
      const best = new Map<Way, { to: number; err: number }>();
      for (const to of nbs) {
        if (to === prev) continue;
        const rel = turnOf(inDir, { x: g.x[to]! - here.x, y: g.y[to]! - here.y });
        const w = to === onRoute ? route : wayOf(rel);
        if (!w) continue;
        const err = to === onRoute ? -1 : Math.abs(rel - IDEAL[w]);
        if (err < (best.get(w)?.err ?? Infinity)) best.set(w, { to, err });
      }
      if (!best.has(route)) continue;
      // Along the street path: the lane point nearest the junction (in order).
      let bs = 0;
      let bd = Infinity;
      for (; j < this.street.length; j++) {
        const d = Math.hypot(this.street[j]!.x - here.x, this.street[j]!.y - here.y);
        if (d < bd) {
          bd = d;
          bs = this.cum[j]!;
        } else if (d > bd + 40) break;
      }
      j = Math.max(0, j - 1);
      const after = { x: here.x + outDir.x * 0.5, y: here.y + outDir.y * 0.5 };
      const name =
        route === 'straight' ? undefined : this.world.roadAt(after.x, after.y)?.n || undefined;
      this.junctions.push({
        s: bs,
        node,
        route,
        ways: (['left', 'straight', 'right'] as const)
          .filter((w) => best.has(w))
          .map((dir) => ({ dir, to: best.get(dir)!.to })),
        ...(name ? { street: name } : {}),
      });
    }
  }

  /** The junction whose ways are showing (until you're at it). */
  private showing: Junction | null = null;

  /** The junction you're coming up to now (choices showing), if any. */
  private current(): Junction | null {
    if (this.showing && this.showing.s - this.s >= 1) return this.showing;
    this.showing = null;
    const pace = Math.max(this.v, this.cruise * 0.3);
    for (const jn of this.junctions) {
      const d = jn.s - this.s;
      if (d < 1) continue;
      // Within about two seconds (or 40 m) of it, and a choice to make.
      if (d < Math.max(40, pace * 2.2) && jn.ways.length > 1) this.showing = jn;
      return this.showing;
    }
    return null;
  }

  /** Take another way at the junction ahead: re-routed from that street. */
  choose(dir: Way) {
    const jn = this.current();
    if (!jn || jn.route === dir) return;
    const way = jn.ways.find((w) => w.dir === dir);
    if (!way) return;
    const centre = this.graph.pathVia(jn.node, way.to, this.destM.x, this.destM.y);
    centre.push(this.destM);
    // On from where the car is: up to the junction is the new path's first stretch.
    this.showing = null;
    this.setRoute(centre, this.at(this.s).p);
    this.reroutes++;
    this.world.setDriving(
      true,
      centre.map((p) => geoTile(p.x, p.y)),
      this.cruise,
    );
  }

  /** Press (or let go of) a pedal. */
  hold(which: 'go' | 'brake', on: boolean) {
    this[which] = on;
    if (on) this.touch();
  }

  /** Any input: you're driving (the car stops driving itself). */
  touch() {
    this.idle = 0;
    this.auto = false;
  }

  /**
   * On by `dt` seconds. Returns where the car is now (tiles) and the way it
   * heads, and whether you're there.
   */
  step(dt: number): { p: Pt; dx: number; dy: number; done: boolean } {
    const pace = this.world.pace;
    if (this.go || this.brake) this.touch();
    const here = this.at(this.s).p;
    const road = this.world.roadAt(here.x, here.y);
    // The road's speed (at the trip's pace).
    const limit = Math.max(this.cruise * 0.6, (VMAX[road?.c ?? 4] ?? 10) * pace);
    // The car in front (not in the last few metres: you pull in to the kerb).
    const lead = this.ghost > 0 || this.len - this.s < 15 ? null : this.world.leadAhead();
    let room = lead ? Math.max(0, lead.gap - GAP) : Infinity;
    for (let left = Math.min(1, dt); left > 1e-4; left -= 0.05) {
      const h = Math.min(0.05, left);
      const toGo = this.len - this.s;
      // Hold GO (or let it drive itself): up to the limit; nothing held: coast.
      let want = this.brake ? 0 : this.go ? limit : this.auto ? limit * 0.6 : 0;
      // Into the stop at the end, and slowing for each junction with a choice
      // (a turn more): about a second and a half to see it coming.
      want = Math.min(want, Math.sqrt(2 * limit * toGo) + 1);
      const jn = this.junctions.find((j) => j.s > this.s + 0.5);
      if (jn && (jn.route !== 'straight' || jn.ways.length > 1)) {
        const slow = jn.route === 'straight' ? limit * 0.6 : limit * 0.4;
        want = Math.min(want, Math.max(slow, (jn.s - this.s) / 1.5));
      }
      if (lead) want = Math.min(want, Math.max(0, lead.v + room * 2));
      const dv = want - this.v;
      const rate = this.brake
        ? limit * 2
        : dv > 0
          ? limit * 0.6
          : this.go
            ? limit * 2.5
            : limit * 0.35;
      this.v = Math.max(0, this.v + Math.max(-rate * h, Math.min(rate * h, dv)));
      const move = Math.min(this.v * h, room, toGo);
      // Held up by the car in front: only as fast as you actually move.
      if (move < this.v * h && move < toGo) this.v = move / h;
      this.s += move;
      if (lead) room += lead.v * h - move;
    }
    // Stuck behind a car that doesn't move (it's waiting for you, say): after
    // a few seconds, on past it. The seconds count while you ask to go: let
    // go of GO and press it again (a thumb does) and they keep counting.
    if (!lead || room >= 0.5) this.blocked = 0;
    else if (this.go || this.auto) this.blocked += Math.min(dt, 0.25);
    if (this.blocked > 5) {
      this.ghost = 2;
      this.blocked = 0;
    }
    if (this.ghost > 0) this.ghost -= dt;
    // Untouched at a standstill: the hint, then the car drives itself.
    if (!this.go && !this.brake && this.v < 0.5 && !this.auto) {
      // (A long frame, the first one say, counts for a quarter second at most.)
      this.idle += Math.min(dt, 0.25);
      if (this.idle > AUTO_AFTER) this.auto = true;
    }
    const { p, dx, dy } = this.at(this.s);
    // The route line: the road ahead of you.
    const line: P2[] = [p];
    for (let i = 1; i < this.street.length; i++) {
      if (this.cum[i]! <= this.s) continue;
      if (this.cum[i]! > this.s + LINE_AHEAD) {
        line.push(this.at(this.s + LINE_AHEAD).p);
        break;
      }
      line.push(this.street[i]!);
    }
    this.world.setRouteLine(line.length > 1 ? line : null);
    const done = this.len - this.s < 0.05;
    // The heading, in tiles (the map's own way of saying it).
    const d = geoTile(dx, dy);
    return { p: done ? this.dest : geoTile(p.x, p.y), dx: d.x, dy: d.y, done };
  }

  /** For the HUD. */
  view(): DriveView {
    const pace = this.world.pace;
    const ahead = this.junctions.filter((j) => j.s > this.s + 0.5 && j.route !== 'straight');
    const first = ahead[0];
    const next = first
      ? {
          dir: first.route,
          dist: first.s - this.s,
          ...(first.street ? { street: first.street } : {}),
        }
      : { dir: 'arrive' as const, dist: this.len - this.s };
    const then = first ? (ahead[1]?.s ?? this.len) - first.s : null;
    const jn = this.current();
    return {
      kmh: Math.round((this.v / Math.max(1, pace)) * 3.6),
      left: Math.max(0, this.len - this.s),
      next,
      then,
      ways: jn ? jn.ways.map((w) => ({ dir: w.dir, route: w.dir === jn.route })) : null,
      hint: !this.auto && this.idle > HINT_AFTER,
      auto: this.auto,
      reroutes: this.reroutes,
    };
  }

  /** Off the road: the route line goes. */
  end() {
    this.world.setRouteLine(null);
  }
}
