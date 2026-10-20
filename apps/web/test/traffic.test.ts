import { describe, expect, it } from 'vitest';
import { loadGeo } from '../src/city/geo';
import { RoadIndex, type Seg } from '../src/city/three/roads';
import {
  buildGraph,
  fleetOf,
  kindOfSlot,
  trafficBudget,
  TrafficSim,
  type VehicleKind,
} from '../src/city/three/traffic';

/** A 6 × 6 grid of streets 100 m apart (class 2 on the middle line, residential elsewhere). */
function grid(): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i <= 5; i++)
    for (let j = 0; j < 5; j++) {
      const c = i === 2 ? 2 : 5;
      out.push({ ax: i * 100, ay: j * 100, bx: i * 100, by: (j + 1) * 100, c, ha: 0, hb: 0 });
      out.push({ ax: j * 100, ay: i * 100, bx: (j + 1) * 100, by: i * 100, c, ha: 0, hb: 0 });
    }
  return out;
}

const run = (kinds: VehicleKind[], seed: number, steps: number) => {
  const sim = new TrafficSim(buildGraph(grid()), kinds, seed, false);
  const f = { x: 250, y: 250, r: 400 };
  sim.fill(f);
  for (let k = 0; k < steps; k++) sim.step(0.1, f, null);
  return sim;
};

describe('street traffic', () => {
  it('joins segments that meet into a road graph', () => {
    const g = buildGraph(grid());
    expect(g.nx.length).toBe(36);
    expect(g.ea.length).toBe(60);
    // A crossroads has four ways, a corner two.
    const at = (x: number, y: number) => [...g.nx].findIndex((nx, i) => nx === x && g.ny[i] === y);
    expect(g.adj[at(200, 200)]!.length).toBe(4);
    expect(g.adj[at(0, 0)]!.length).toBe(2);
  });

  it('is deterministic for a seed, and different for another', () => {
    const kinds: VehicleKind[] = Array.from({ length: 20 }, (_, k) => (k % 4 ? 'car' : 'moto'));
    const a = run(kinds, 7, 200).vehicles.map((v) => [v.x.toFixed(3), v.y.toFixed(3)]);
    const b = run(kinds, 7, 200).vehicles.map((v) => [v.x.toFixed(3), v.y.toFixed(3)]);
    const c = run(kinds, 8, 200).vehicles.map((v) => [v.x.toFixed(3), v.y.toFixed(3)]);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('keeps every vehicle on a road, in its lane, and moving', () => {
    const kinds: VehicleKind[] = Array.from({ length: 30 }, () => 'car');
    const sim = run(kinds, 3, 300);
    expect(sim.count()).toBe(30);
    for (const v of sim.vehicles) {
      // Within a lane's width of a grid line.
      const offX = Math.abs(v.x - Math.round(v.x / 100) * 100);
      const offY = Math.abs(v.y - Math.round(v.y / 100) * 100);
      expect(Math.min(offX, offY)).toBeLessThan(4);
    }
    expect(sim.vehicles.some((v) => v.v > 3)).toBe(true);
  });

  it('busier on main roads', () => {
    const kinds: VehicleKind[] = Array.from({ length: 60 }, () => 'car');
    const sim = new TrafficSim(buildGraph(grid()), kinds, 11, false);
    sim.fill({ x: 250, y: 250, r: 600 });
    const main = sim.vehicles.filter((v) => sim.g.cls[v.e] === 2).length;
    // The class-2 line is 2 of 12 lines (a sixth of the road) but gets far more than a sixth.
    expect(main / 60).toBeGreaterThan(0.25);
  });

  it('slows down and waits behind you', () => {
    const sim = new TrafficSim(buildGraph(grid()), ['car'], 1, false);
    const f = { x: 250, y: 250, r: 400 };
    sim.fill(f);
    const v = sim.vehicles[0]!;
    // Put the car on the main street going +y, with you 20 m ahead in its lane.
    const e = [...sim.g.ea].findIndex(
      (a, i) => sim.g.nx[a] === 200 && sim.g.ny[a] === 100 && sim.g.ny[sim.g.eb[i]!] === 200,
    );
    v.e = e;
    v.fwd = true;
    v.s = 10;
    v.v = 12;
    sim.step(0.01, f, null);
    const you = { x: v.x + v.dx * 20, y: v.y + v.dy * 20 };
    for (let k = 0; k < 60; k++) sim.step(0.1, f, you);
    const gap = Math.hypot(you.x - v.x, you.y - v.y);
    expect(gap).toBeGreaterThan(5);
    expect(v.v).toBeLessThan(0.5);
  });

  it('drives on the left where the city does', () => {
    const right = run(['car'], 5, 0);
    const sim = new TrafficSim(buildGraph(grid()), ['car'], 5, true);
    sim.fill({ x: 250, y: 250, r: 400 });
    expect(sim.laneOf(sim.vehicles[0]!)).toBe(-right.laneOf(right.vehicles[0]!));
  });

  it('caps the budget on a software GPU, and mixes local vehicles', () => {
    expect(trafficBudget('high', false)).toBeGreaterThanOrEqual(40);
    expect(trafficBudget('high', false)).toBeLessThanOrEqual(120);
    expect(trafficBudget('low', true)).toBe(15);
    expect(trafficBudget('high', true)).toBe(15);
    const lagos = Array.from({ length: 200 }, (_, k) => kindOfSlot(fleetOf('lagos'), 1, k));
    expect(lagos).toContain('keke');
    expect(lagos).toContain('moto');
    expect(lagos).toContain('bus');
    expect(fleetOf('lagos').bus[0]).toBe('#f2c230');
    const london = Array.from({ length: 200 }, (_, k) => kindOfSlot(fleetOf('london'), 1, k));
    expect(london).not.toContain('keke');
    expect(fleetOf('london').taxi).toBe('#141414');
    expect(fleetOf('london').leftHand).toBe(true);
  });

  it('fills the streets around a point of real Lagos', async () => {
    const g = (await loadGeo('lagos'))!;
    const roads = new RoadIndex(g);
    const graph = buildGraph(roads.segs);
    const kinds = Array.from({ length: 40 }, (_, k) => kindOfSlot(fleetOf('lagos'), 9, k));
    const sim = new TrafficSim(graph, kinds, 9, false);
    const s = roads.segs[Math.floor(roads.segs.length / 2)]!;
    const f = { x: s.ax, y: s.ay, r: 450 };
    sim.fill(f);
    for (let k = 0; k < 100; k++) sim.step(0.25, f, null);
    expect(sim.count()).toBe(40);
    for (const v of sim.vehicles)
      expect(Math.hypot(v.x - f.x, v.y - f.y)).toBeLessThan(f.r * 1.3 + 30);
  });

  it('gathers more traffic on the streets close to you than far away', () => {
    const kinds: VehicleKind[] = Array.from({ length: 200 }, () => 'car');
    const sim = new TrafficSim(buildGraph(grid()), kinds, 5, false);
    const f = { x: 250, y: 250, r: 400 };
    sim.fill(f);
    const near = sim.vehicles.filter((v) => Math.hypot(v.x - f.x, v.y - f.y) < 150).length;
    const far = sim.vehicles.filter((v) => Math.hypot(v.x - f.x, v.y - f.y) >= 250).length;
    // The inner circle is about a sixth of the area within reach, yet holds more than the outer band.
    expect(near).toBeGreaterThan(far);
  });
});

describe('street traffic keeps its distance', () => {
  /** One long straight street (x from 0 to 2000, y = 0), a junction every 100 m. */
  const street = (): Seg[] =>
    Array.from({ length: 20 }, (_, i) => ({
      ax: i * 100,
      ay: 0,
      bx: (i + 1) * 100,
      by: 0,
      c: 4,
      ha: 0,
      hb: 0,
    }));

  it('queues behind the car in front, on into the next street, without overlapping', () => {
    const kinds: VehicleKind[] = Array.from({ length: 12 }, () => 'car');
    const sim = new TrafficSim(buildGraph(street()), kinds, 4, false);
    const f = { x: 1000, y: 0, r: 1500 };
    sim.fill(f);
    // Everyone eastbound on the first streets, a car's length apart or less.
    sim.vehicles.forEach((v, i) => {
      v.e = Math.floor(i / 4);
      v.fwd = sim.g.nx[sim.g.ea[v.e]!]! < sim.g.nx[sim.g.eb[v.e]!]!;
      v.s = (i % 4) * 25 + 1;
      v.v = 10;
      v.ne = -1;
    });
    // You stand in the road further on: the front one stops, the rest queue.
    const you = { x: 600, y: sim.laneOf(sim.vehicles[0]!) };
    let min = Infinity;
    for (let k = 0; k < 1200; k++) {
      sim.step(0.05, f, you);
      const xs = sim.vehicles.map((v) => v.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) min = Math.min(min, xs[i]! - xs[i - 1]!);
    }
    // Never closer than a car's length (4.4 m), nose to nose.
    expect(min).toBeGreaterThan(4.4);
    expect(sim.vehicles.every((v) => v.v < 1 && v.x < you.x)).toBe(true);
  });

  it('finds the car in front of you in your lane (and not the one coming the other way)', () => {
    const sim = new TrafficSim(buildGraph(street()), ['car', 'car'], 2, false);
    sim.fill({ x: 1000, y: 0, r: 1500 });
    const [ahead, oncoming] = sim.vehicles;
    for (const [v, fwd, s] of [
      [ahead!, true, 50],
      [oncoming!, false, 40],
    ] as const) {
      v.e = 5;
      v.fwd = sim.g.nx[sim.g.ea[5]!]! < sim.g.nx[sim.g.eb[5]!]! ? fwd : !fwd;
      v.s = s;
      v.v = 7;
    }
    sim.step(0.001, { x: 1000, y: 0, r: 1500 }, null);
    // You: eastbound in the right-hand lane at x = 520.
    const lane = sim.laneOf(ahead!);
    const lead = sim.leadOf(520, ahead!.y, 1, 0, 4.4)!;
    expect(lead).not.toBeNull();
    expect(lead.gap).toBeCloseTo(ahead!.x - 520 - 4.4, 0);
    expect(lead.v).toBeGreaterThan(0);
    expect(Math.abs(ahead!.y - lane)).toBeLessThan(0.01);
    // Nothing ahead once past it.
    expect(sim.leadOf(ahead!.x + 10, ahead!.y, 1, 0, 4.4)).toBeNull();
  });
});
