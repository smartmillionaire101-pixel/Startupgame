import { describe, expect, it } from 'vitest';
import { geoTile, WalkGraph } from '../src/city/geoLayout';
import { Drive, type DriveWorld } from '../src/city/three/drive';
import type { Lead } from '../src/city/three/traffic';

/** Streets 200 m apart, x and y from 0 to 1000 (metres), all residential. */
function grid() {
  const x: number[] = [];
  const y: number[] = [];
  const id = (i: number, j: number) => j * 6 + i;
  for (let j = 0; j <= 5; j++)
    for (let i = 0; i <= 5; i++) {
      x.push(i * 200);
      y.push(j * 200);
    }
  const a: number[] = [];
  const b: number[] = [];
  const c: number[] = [];
  for (let j = 0; j <= 5; j++)
    for (let i = 0; i <= 5; i++) {
      for (const [di, dj] of [
        [1, 0],
        [0, 1],
      ] as const) {
        if (i + di > 5 || j + dj > 5) continue;
        a.push(id(i, j));
        b.push(id(i + di, j + dj));
        c.push(5);
      }
    }
  return new WalkGraph(x, y, a, b, c);
}

/** A world with no lanes (the path as given), and maybe a car in front. */
function world(lead: () => Lead | null = () => null): DriveWorld & { line: number } {
  return {
    streetPath: (p) => [...p],
    roadAt: () => ({ c: 5, n: 'Broad Street' }),
    leadAhead: lead,
    setDriving: () => {},
    setRouteLine(pts) {
      this.line = pts?.length ?? 0;
    },
    pace: 1,
    line: 0,
  };
}

/** East along y = 200 from x = 0 to x = 1000, then the destination. */
const east = [0, 200, 400, 600, 800, 1000].map((x) => geoTile(x, 200));

describe('driving your own car', () => {
  it('stands until you hold GO, then drives; left alone, it says so and then drives itself', () => {
    const w = world();
    const d = new Drive(w, grid(), east, east.at(-1)!, 100_000);
    for (let k = 0; k < 20; k++) d.step(0.1);
    expect(d.view().kmh).toBe(0);
    expect(d.view().left).toBeCloseTo(1000, 0);
    d.hold('go', true);
    for (let k = 0; k < 30; k++) d.step(0.1);
    expect(d.view().kmh).toBeGreaterThan(5);
    expect(w.line).toBeGreaterThan(1);
    d.hold('go', false);
    // Coasts to a stop, then the hint, then the car drives you.
    for (let k = 0; k < 100 && d.view().kmh > 0; k++) d.step(0.1);
    expect(d.view().kmh).toBe(0);
    for (let k = 0; k < 45; k++) d.step(0.1);
    expect(d.view().hint).toBe(true);
    expect(d.view().auto).toBe(false);
    for (let k = 0; k < 40; k++) d.step(0.1);
    expect(d.view().auto).toBe(true);
    let done = false;
    for (let k = 0; k < 4000 && !done; k++) done = d.step(0.1).done;
    expect(done).toBe(true);
  });

  it('offers the ways at a crossroads (the route lit), and re-routes down another', () => {
    const d = new Drive(world(), grid(), east, east.at(-1)!, 100_000);
    d.hold('go', true);
    let ways = d.view().ways;
    for (let k = 0; k < 2000 && !ways; k++) {
      d.step(0.05);
      ways = d.view().ways;
    }
    expect(ways).toEqual([
      { dir: 'left', route: false },
      { dir: 'straight', route: true },
      { dir: 'right', route: false },
    ]);
    const before = d.view().left;
    d.choose('left');
    expect(d.view().reroutes).toBe(1);
    // Up the side street and round: further to go than straight on.
    expect(d.view().left).toBeGreaterThan(before);
    // The new route's next turn is named.
    expect(d.view().next.dir).not.toBe('straight');
  });

  it('keeps its distance behind the car in front', () => {
    let gap = 15;
    const d = new Drive(
      world(() => ({ gap, v: 0 })),
      grid(),
      east,
      east.at(-1)!,
      100_000,
    );
    d.hold('go', true);
    // (Four seconds: stuck behind a car that never moves, it would go on past after five.)
    for (let k = 0; k < 80; k++) {
      const s0 = d.view().left;
      d.step(0.05);
      gap -= s0 - d.view().left;
    }
    expect(gap).toBeGreaterThanOrEqual(2.5 - 1e-6);
    expect(d.view().kmh).toBe(0);
  });
});
