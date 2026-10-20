import { describe, expect, it } from 'vitest';
import {
  POOL_H,
  POOL_R,
  POOL_W,
  freeSpot,
  poolAim,
  poolPlan,
  poolRack,
  poolSpeed,
  rollDistance,
  simulatePool,
  type PoolBall,
} from '../src/pool.js';
import { createRng } from '../src/rng.js';

const ball = (id: number, x: number, y: number): PoolBall => ({
  id,
  x,
  y,
  value: id,
  potted: false,
});
const shoot = (balls: PoolBall[], angle: number, power: number, spin = 0, side = 0) => {
  const s = poolSpeed(power);
  return simulatePool(balls, Math.cos(angle) * s, Math.sin(angle) * s, spin, side);
};

describe('8-ball pool physics', () => {
  it('racks fifteen balls in a tight triangle with the 8 in the middle', () => {
    const rack = poolRack(createRng(4));
    expect(rack.map((b) => b.id)).toEqual([...Array(16).keys()]);
    const eight = rack.find((b) => b.id === 8)!;
    const apex = rack.filter((b) => b.id).reduce((m, b) => (b.x < m.x ? b : m));
    expect(eight.x).toBeGreaterThan(apex.x);
    // No two balls overlap.
    for (const a of rack)
      for (const b of rack)
        if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * POOL_R);
    // A different seed racks the other balls differently.
    expect(poolRack(createRng(5))).not.toEqual(rack);
  });

  it('rolls a ball to a stop under friction', () => {
    const sim = shoot([ball(0, 30, 63.5)], 0, 25);
    const cue = sim.balls[0]!;
    expect(cue.x).toBeGreaterThan(60);
    expect(sim.time).toBeGreaterThan(1);
    expect(rollDistance(150)).toBeGreaterThan(rollDistance(100));
    expect(sim.pots).toEqual([]);
  });

  it('bounces off a cushion and loses pace', () => {
    // Straight up the table into the far short cushion, and back.
    const sim = shoot([ball(0, 120, 40)], 0, 60);
    expect(sim.events.some((e) => e.kind === 'rail')).toBe(true);
    const rail = sim.events.find((e) => e.kind === 'rail')!;
    expect(sim.balls[0]!.x).toBeLessThan(POOL_W - POOL_R);
    expect(rail.speed).toBeGreaterThan(0);
  });

  it('a full-ball hit stops the cue ball dead and sends the object ball on (stun)', () => {
    const sim = shoot([ball(0, 60, 63.5), ball(1, 66, 63.5)], 0, 30, -0.28 * 0);
    const cue = sim.balls[0]!,
      one = sim.balls[1]!;
    expect(sim.first).toBe(1);
    expect(one.x - 66).toBeGreaterThan(5 * (cue.x - 60));
  });

  it('draw brings the cue ball back, follow takes it through', () => {
    const start = [ball(0, 100, 63.5), ball(1, 120, 63.5)];
    const draw = shoot(start, 0, 40, -1).balls[0]!;
    const follow = shoot(start, 0, 40, 1).balls[0]!;
    expect(draw.x).toBeLessThan(100);
    expect(follow.x).toBeGreaterThan(120);
  });

  it('a ball sent straight at a corner drops; one into the cushion does not', () => {
    const corner = shoot([ball(0, 40, 40)], Math.atan2(-40, -40), 40);
    expect(corner.pots).toEqual([0]);
    const cushion = shoot([ball(0, 60, 40)], -Math.PI / 2, 40);
    expect(cushion.pots).toEqual([]);
  });

  it('pots an object ball into the side pocket (and follow takes the cue ball in after it)', () => {
    const start = [ball(0, POOL_W / 2, 100), ball(3, POOL_W / 2, 30)];
    // With top spin the cue ball follows the object ball in: a scratch.
    expect(shoot(start, -Math.PI / 2, 45, 0.8).pots).toEqual([3, 0]);
    // A touch of draw holds it up.
    expect(shoot(start, -Math.PI / 2, 45, -0.7).pots).toEqual([3]);
  });

  it('is deterministic: the same shot plays out the same to the bit', () => {
    const rack = poolRack(createRng(9));
    const a = shoot(rack, 0.01, 100);
    const b = shoot(
      rack.map((x) => ({ ...x })),
      0.01,
      100,
    );
    expect(a).toEqual(b);
    // The break spreads the pack and keeps every ball on (or in) the table.
    for (const x of a.balls)
      if (!x.potted) {
        expect(x.x).toBeGreaterThanOrEqual(0);
        expect(x.x).toBeLessThanOrEqual(POOL_W);
        expect(x.y).toBeGreaterThanOrEqual(0);
        expect(x.y).toBeLessThanOrEqual(POOL_H);
      }
    const moved = a.balls.filter((x, i) => Math.hypot(x.x - rack[i]!.x, x.y - rack[i]!.y) > 10);
    expect(moved.length).toBeGreaterThan(8);
  });

  it('the aiming guide finds the ghost ball', () => {
    const balls = [ball(0, 50, 63.5), ball(5, 100, 63.5)];
    const aim = poolAim(balls, 0);
    expect(aim.ball).toBe(5);
    expect(aim.ghost.x).toBeCloseTo(100 - 2 * POOL_R, 5);
    expect(aim.dir!.x).toBeCloseTo(1, 5);
    const miss = poolAim(balls, Math.PI / 2);
    expect(miss.ball).toBeNull();
    expect(miss.ghost.y).toBeCloseTo(POOL_H - POOL_R, 5);
  });

  it('plans a pot that really drops, and places ball in hand behind one', () => {
    const balls = [ball(0, 60, 80), ball(2, 200, 30), ball(8, 150, 100), ball(11, 30, 20)];
    const plan = poolPlan(balls, [2], null);
    expect(plan.target).toBe(2);
    const s = poolSpeed(plan.power);
    const sim = simulatePool(
      balls,
      Math.cos(plan.angle) * s,
      Math.sin(plan.angle) * s,
      plan.spin,
      plan.side,
    );
    expect(sim.pots).toContain(2);
    expect(sim.pots).not.toContain(0);
    const inHand = poolPlan(balls, [11], 'table');
    expect(inHand.cue).toBeDefined();
    expect(inHand.target).toBe(11);
  });

  it('finds a free spot for a ball in hand', () => {
    const balls = [ball(0, 0, 0), ball(1, 63.5, 63.5)];
    const [x, y] = freeSpot(balls, 0, 63.5, 63.5, true);
    expect(Math.hypot(x - 63.5, y - 63.5)).toBeGreaterThanOrEqual(2 * POOL_R);
    expect(x).toBeLessThanOrEqual(63.5);
  });
});
