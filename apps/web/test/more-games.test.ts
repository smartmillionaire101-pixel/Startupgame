import { describe, expect, it } from 'vitest';
import { FULL_RACK, simulateBowl, launchOf, skydiveScore } from '@runway/engine';
import {
  frameAt,
  guideLine,
  isSplit,
  pinTilt,
  rollCall,
  swipeToBowl,
} from '../src/experiences/bowling-view';
import {
  JUMP,
  deploy,
  exitPlane,
  flare,
  heliRoute,
  jumpStyle,
  newHeli,
  newJump,
  sideOf,
  stepHeli,
  stepJump,
  toTarget,
  type Jump,
} from '../src/experiences/air/flight';
import { airOf } from '../src/experiences/air/air-bus';

const swipe = (pts: [number, number, number][]) => pts.map(([x, y, t]) => ({ x, y, t }));

describe('bowling on the phone', () => {
  it('turns a swipe up the lane into a ball: where you stand, the line, the power, the hook', () => {
    const straight = swipeToBowl(
      360,
      swipe([
        [270, 400, 0],
        [270, 300, 60],
        [270, 150, 120],
      ]),
    )!;
    expect(straight.x).toBeGreaterThan(0.2);
    expect(straight.aim).toBe(0);
    expect(straight.spin).toBe(0);
    expect(straight.power).toBeGreaterThan(0.5);
    const slow = swipeToBowl(
      360,
      swipe([
        [180, 400, 0],
        [180, 300, 300],
        [180, 200, 600],
      ]),
    )!;
    expect(slow.power).toBeLessThan(straight.power);
    // Bowed out to the right and back: a hook to the left (negative spin).
    const hook = swipeToBowl(
      360,
      swipe([
        [200, 400, 0],
        [260, 300, 60],
        [200, 160, 120],
      ]),
    )!;
    expect(hook.spin).toBeLessThan(0);
    // A tap or a swipe down is no ball.
    expect(
      swipeToBowl(
        360,
        swipe([
          [200, 400, 0],
          [202, 398, 50],
        ]),
      ),
    ).toBeNull();
    expect(
      swipeToBowl(
        360,
        swipe([
          [200, 200, 0],
          [200, 400, 50],
        ]),
      ),
    ).toBeNull();
  });

  it('draws the guide down the oil and finds the frame of a roll at any moment', () => {
    const g = guideLine({ x: 0.2, aim: 0, power: 0.6, spin: 0 });
    expect(g[0]).toEqual([0.2, 0]);
    expect(g.at(-1)![1]).toBeGreaterThan(11);
    const sim = simulateBowl(FULL_RACK, launchOf({ x: 0, aim: 0, power: 0.6, spin: 0 }), true);
    expect(frameAt(sim.frames, 0)!.ball.z).toBeLessThan(0.2);
    expect(frameAt(sim.frames, 99)).toBe(sim.frames.at(-1));
    expect(frameAt(sim.frames, 1.5)!.ball.z).toBeGreaterThan(frameAt(sim.frames, 0.5)!.ball.z);
    expect(pinTilt(0)).toBe(0);
    expect(pinTilt(1)).toBeCloseTo(Math.PI / 2);
  });

  it('calls a roll: strike, spare, split, gutter, a count', () => {
    expect(rollCall(FULL_RACK, FULL_RACK, false)).toBe('strike');
    expect(rollCall([7], [7], false)).toBe('spare');
    expect(rollCall(FULL_RACK, [], true)).toBe('gutter');
    expect(rollCall(FULL_RACK, [1, 2, 3, 4, 5, 6, 8, 9], false)).toBe('split');
    expect(rollCall(FULL_RACK, [1, 2, 4, 5, 7, 8], false)).toBe('pins');
    expect(isSplit([7, 10])).toBe(true);
    expect(isSplit([6, 10])).toBe(false);
  });
});

describe('a skydive, step by step', () => {
  const run = (j: Jump, secs: number, turn = 0) => {
    for (let k = 0; k < secs / 0.05; k++) j = stepJump(j, 0.05, { turn, track: false }, 0);
    return j;
  };

  it('climbs, waits at the door, falls, opens and lands with a miss distance', () => {
    let j = newJump(0, 0);
    expect(j.phase).toBe('climb');
    j = run(j, JUMP.climbS + 0.2);
    expect(j.phase).toBe('door');
    expect(j.alt).toBe(JUMP.exit);
    j = exitPlane(j);
    expect(j.phase).toBe('freefall');
    j = run(j, 10);
    expect(j.alt).toBeLessThan(JUMP.exit - 1000);
    j = deploy(j);
    expect(j.phase).toBe('canopy');
    expect(j.deployAt).toBe(Math.round(j.alt));
    // Steer straight at the target until the ground, flaring at the end.
    for (let k = 0; k < 4000 && j.phase !== 'landed'; k++) {
      const tt = toTarget(j);
      const rel = Math.atan2(Math.sin(tt.bearing - j.heading), Math.cos(tt.bearing - j.heading));
      if (j.alt < 40) j = flare(j);
      j = stepJump(j, 0.05, { turn: tt.dist > 30 ? Math.sign(rel) : 0, track: false }, 0);
    }
    expect(j.phase).toBe('landed');
    expect(j.miss).not.toBeNull();
    expect(j.flared).toBe(true);
    expect(jumpStyle(j)).toBeGreaterThan(80);
    const score = skydiveScore({ deployAt: j.deployAt!, miss: j.miss!, style: jumpStyle(j) });
    expect(score.score).toBeGreaterThan(300);
  });

  it('fires the reserve at the opener’s height if you never pull', () => {
    let j = exitPlane(run(newJump(0, 0), JUMP.climbS + 0.2));
    j = run(j, 40);
    expect(j.phase).not.toBe('freefall');
    expect(j.deployAt).toBe(JUMP.aad);
  });
});

describe('a helicopter tour', () => {
  const marks = [
    { name: 'Far', x: 5000, z: 0, h: 50 },
    { name: 'Near', x: 300, z: 0, h: 80 },
    { name: 'Mid', x: 1500, z: 400, h: 200 },
    { name: 'Too far', x: 20000, z: 0, h: 50 },
  ];

  it('orders the landmarks nearest first, within reach', () => {
    expect(heliRoute({ x: 0, z: 0 }, marks, 5).map((m) => m.name)).toEqual(['Near', 'Mid', 'Far']);
    expect(heliRoute({ x: 0, z: 0 }, marks, 2)).toHaveLength(2);
  });

  it('flies the route, passing each landmark, and lands back on the pad', () => {
    const route = heliRoute({ x: 0, z: 0 }, marks, 3);
    let h = { ...newHeli(0, 0), heading: Math.PI / 2 };
    for (let k = 0; k < 20000 && h.leg <= route.length; k++)
      h = stepHeli(h, 0.05, route, { x: 0, z: 0 });
    expect(h.leg).toBe(route.length + 1);
    expect(h.seen).toEqual(['Near', 'Mid', 'Far']);
    expect(h.alt).toBe(0);
    expect(Math.hypot(h.x, h.z)).toBeLessThan(40);
  });

  it('lets you take the controls, and knows left from right', () => {
    let h = { ...newHeli(0, 0), manual: true, alt: 200, speed: 50 };
    const before = h.heading;
    for (let k = 0; k < 20; k++)
      h = stepHeli(h, 0.05, marks.slice(0, 1), { x: 0, z: 0 }, { turn: 1, climb: 1 });
    expect(h.heading).toBeGreaterThan(before);
    expect(h.alt).toBeGreaterThan(200);
    expect(sideOf({ x: 0, z: 0, heading: 0 }, { x: 100, z: 0 })).toBe('right');
    expect(sideOf({ x: 0, z: 0, heading: 0 }, { x: -100, z: 0 })).toBe('left');
    expect(airOf({ id: 'skydive-tandem' })).toBe('skydive');
    expect(airOf({ id: 'heli-charter' })).toBe('heli');
    expect(airOf({ id: 'bowling' })).toBeNull();
  });
});
