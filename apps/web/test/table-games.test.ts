import { describe, expect, it } from 'vitest';
import {
  GOAL_H,
  GOAL_HALF,
  POOL_H,
  POOL_W,
  SPOT,
  poolRack,
  poolSpeed,
  simulatePool,
  type PoolShotLog,
} from '@runway/engine';
import {
  FULL_PULL,
  RAIL,
  aimAt,
  ballColour,
  frameAt,
  isStripe,
  onCue,
  poolReplay,
  pullPower,
  screenDir,
  spinFromPad,
  tableLayout,
  toScreen,
  toTable,
} from '../src/experiences/pool-view';
import {
  KICKER_Z,
  KICK_RUN,
  ballAt,
  camera,
  kickerTime,
  diveZones,
  keeperPose,
  kickTarget,
  onGoalPlane,
  project,
  shootoutCard,
  swipeToKick,
  type SwipePoint,
} from '../src/experiences/shootout-view';

describe('pool on the phone', () => {
  it('fits the table upright with real proportions', () => {
    const L = tableLayout(358, 700);
    expect(L.width).toBeLessThanOrEqual(358);
    expect(L.height / L.width).toBeCloseTo((POOL_W + 2 * RAIL) / (POOL_H + 2 * RAIL), 1);
    // Short of height, it scales down to fit.
    const short = tableLayout(358, 400);
    expect(short.height).toBeLessThanOrEqual(400);
  });

  it('maps the table to the screen and back, the break end at the bottom', () => {
    const L = tableLayout(358, 700);
    const [hx, hy] = toScreen(L, 30, 60);
    const [fx, fy] = toScreen(L, 220, 60);
    expect(hy).toBeGreaterThan(fy);
    expect(hx).toBeCloseTo(fx, 6);
    const [x, y] = toTable(L, hx, hy);
    expect(x).toBeCloseTo(30, 6);
    expect(y).toBeCloseTo(60, 6);
    // Aiming up the table points up the screen.
    const [dx, dy] = screenDir(0);
    expect(dx).toBeCloseTo(0, 6);
    expect(dy).toBeCloseTo(-1, 6);
    expect(aimAt({ x: 50, y: 60 }, 100, 60)).toBeCloseTo(0, 6);
  });

  it('pulling the cue back straight sets the power; sideways does not', () => {
    const angle = 0; // up the screen: pulling back is moving down
    const from = { x: 100, y: 300 };
    expect(pullPower(angle, from, { x: 100, y: 300 + FULL_PULL / 2 })).toBeCloseTo(50, 6);
    expect(pullPower(angle, from, { x: 100, y: 300 + FULL_PULL * 2 })).toBe(100);
    expect(pullPower(angle, from, { x: 160, y: 300 })).toBeCloseTo(0, 6);
    expect(pullPower(angle, from, { x: 100, y: 250 })).toBe(0);
  });

  it('knows a press on the cue stick from a press elsewhere', () => {
    const L = tableLayout(358, 700);
    const cue = { x: 60, y: 63.5 };
    const [cx, cy] = toScreen(L, cue.x, cue.y);
    // Behind the cue ball (aiming up the table, the stick is below it).
    expect(onCue(L, cue, 0, cx, cy + 80)).toBe(true);
    expect(onCue(L, cue, 0, cx, cy - 120)).toBe(false);
    expect(onCue(L, cue, 0, cx + 120, cy + 80)).toBe(false);
  });

  it('spin from the pad: top is follow, bottom is draw, clamped to the ball', () => {
    expect(spinFromPad(0, -1)).toEqual({ spin: 1, side: 0 });
    expect(spinFromPad(0, 0.5)).toEqual({ spin: -0.5, side: 0 });
    const far = spinFromPad(2, 2);
    expect(Math.hypot(far.spin, far.side)).toBeLessThanOrEqual(1.01);
  });

  it('replays a logged shot exactly as the engine played it', () => {
    const before = poolRack({
      next: () => 0.5,
      int: (a) => a,
      range: (a) => a,
      chance: () => false,
      pick: (x) => x[0]!,
      normal: (m = 0) => m,
      shuffle: (x) => [...x],
    });
    const s = poolSpeed(90);
    const sim = simulatePool(before, s, 0.3, 0, 0);
    const log: PoolShotLog = {
      by: 'p1',
      n: 1,
      call: 'break',
      before,
      vx: s,
      vy: 0.3,
      spin: 0,
      side: 0,
      time: sim.time,
      pots: sim.pots,
    };
    const { frames, events } = poolReplay(log);
    expect(frames.length).toBeGreaterThan(60);
    expect(frames.at(-1)!.balls).toEqual(sim.balls);
    expect(events).toEqual(sim.events);
    expect(frameAt(frames, 0)!.balls).toEqual(before);
    expect(frameAt(frames, 999)).toBe(frames.at(-1));
    expect(poolReplay({ ...log, before: undefined }).frames).toEqual([]);
  });

  it('colours the balls the real way', () => {
    expect(ballColour(1)).toBe(ballColour(9));
    expect(ballColour(8)).toBe('#141414');
    expect(isStripe(9)).toBe(true);
    expect(isStripe(7)).toBe(false);
    expect(isStripe(8)).toBe(false);
  });
});

describe('the shootout on the phone', () => {
  const cam = camera(360, 420);
  const swipe = (to: { x: number; y: number }, ms: number, bow = 0): SwipePoint[] => {
    const from = project(cam, 0, 0.11, SPOT);
    return Array.from({ length: 11 }, (_, i) => {
      const q = i / 10;
      return {
        x: from.x + (to.x - from.x) * q + bow * Math.sin(Math.PI * q),
        y: from.y + (to.y - from.y) * q,
        t: ms * q,
      };
    });
  };

  it('puts the goal across most of the screen, the ball below it', () => {
    const l = project(cam, -GOAL_HALF, 0, 0),
      r = project(cam, GOAL_HALF, 0, 0);
    expect(r.x - l.x).toBeCloseTo(360 * 0.84, 0);
    const ball = project(cam, 0, 0.11, SPOT);
    expect(ball.y).toBeGreaterThan(l.y);
    expect(ball.y).toBeLessThan(420);
    const back = onGoalPlane(cam, r.x, project(cam, 0, GOAL_H, 0).y);
    expect(back.x).toBeCloseTo(GOAL_HALF, 6);
    expect(back.y).toBeCloseTo(GOAL_H, 6);
  });

  it('a swipe to the top corner aims there; faster is harder; a bow curls it', () => {
    const corner = project(cam, -3, 2, 0);
    const slow = swipeToKick(cam, swipe(corner, 400))!;
    const fast = swipeToKick(cam, swipe(corner, 90))!;
    expect(slow.x).toBeCloseTo(-3, 1);
    expect(slow.y).toBeCloseTo(2, 1);
    expect(fast.power).toBeGreaterThan(slow.power);
    expect(slow.curve).toBe(0);
    // Bowing right sends it out right, curling back in to where you let go.
    const curled = swipeToKick(cam, swipe(corner, 300, 40))!;
    expect(curled.curve).toBeLessThan(0);
    expect(curled.x).toBeGreaterThan(-3);
    expect(kickTarget(curled).x).toBeCloseTo(-3, 1);
  });

  it('a short swipe is driven along the ground; a tap is not a kick', () => {
    const from = project(cam, 0, 0.11, SPOT);
    const short = swipeToKick(cam, [
      { x: from.x, y: from.y, t: 0 },
      { x: from.x + 20, y: from.y - 60, t: 120 },
    ])!;
    expect(short.y).toBeLessThan(0.3);
    expect(short.x).toBeGreaterThan(0);
    expect(swipeToKick(cam, [{ x: 10, y: 10, t: 0 }])).toBeNull();
    expect(
      swipeToKick(cam, [
        { x: 100, y: 300, t: 0 },
        { x: 104, y: 296, t: 50 },
      ]),
    ).toBeNull();
  });

  it('flies the ball to where it crossed the line, then on into the net', () => {
    const end = { x: 2, y: 1 };
    const start = ballAt(end, 0, 0.6, 'goal', 0);
    expect(start.z).toBeCloseTo(SPOT, 6);
    const line = ballAt(end, 0.5, 0.6, 'goal', 1);
    expect(line.x).toBeCloseTo(2, 6);
    expect(line.y).toBeCloseTo(1, 6);
    expect(line.z).toBeCloseTo(0, 6);
    expect(ballAt(end, 0, 0.6, 'goal', 2).z).toBeLessThan(-1);
    expect(ballAt(end, 0, 0.6, 'saved', 2).z).toBeGreaterThan(0);
    expect(ballAt({ x: 1, y: 2.6 }, 0, 1, 'over', 2).y).toBeGreaterThan(2.6);
    // Curl bends the flight on the way.
    const mid = ballAt(end, -0.8, 0.6, 'goal', 0.5);
    const straight = ballAt(end, 0, 0.6, 'goal', 0.5);
    expect(mid.x).toBeGreaterThan(straight.x);
  });

  it('dives the keeper towards the chosen corner', () => {
    const set = keeperPose(-1, 0.5);
    expect(set.hands.x).toBe(0);
    const left = keeperPose(0, 0.7);
    expect(left.hands.x).toBeLessThan(-2);
    expect(left.tilt).toBeLessThan(0);
    const zones = diveZones(cam);
    expect(zones.map((z) => z.lane)).toEqual([0, 1, 2, 3, 4]);
    expect(zones[0]!.x).toBeLessThan(zones[1]!.x);
  });

  it('keeps the score card the shootout way', () => {
    const c = shootoutCard([true, false, true, true]);
    expect(c.a).toEqual([true, true]);
    expect(c.b).toEqual([false, true]);
    expect(c.suddenDeath).toBe(false);
    expect(shootoutCard(Array(10).fill(true)).suddenDeath).toBe(true);
  });
});

describe('round 7e: the kicker on the pitch', () => {
  it('stands below the goal and inside the canvas, on a phone, a tablet and a laptop', () => {
    for (const [w, h] of [
      [358, 351],
      [360, 420],
      [520, 504],
      [520, 510],
    ] as const) {
      const cam = camera(w, h);
      const feet = project(cam, -0.78, 0, KICKER_Z);
      const head = project(cam, -0.78, 1.8, KICKER_Z);
      const line = project(cam, 0, 0, 0);
      const bar = project(cam, 0, GOAL_H, 0);
      expect(feet.y).toBeLessThan(h - 20);
      expect(head.y).toBeGreaterThan(line.y - 0.1 * h);
      expect(bar.y).toBeGreaterThan(0);
      // Left of the ball, where the swipe starts.
      expect(project(cam, -0.78 + 0.3, 1, KICKER_Z).x).toBeLessThan(project(cam, 0, 0, SPOT).x);
    }
  });

  it('runs up, then strikes the ball as it leaves', () => {
    expect(kickerTime(-1)).toBeLessThan(0);
    expect(kickerTime(0)).toBe(0);
    expect(kickerTime(KICK_RUN.lead)).toBeCloseTo(KICK_RUN.contact, 6);
    expect(kickerTime(KICK_RUN.lead + 500)).toBeGreaterThan(KICK_RUN.contact);
  });
});
