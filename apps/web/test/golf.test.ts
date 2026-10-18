import { describe, expect, it } from 'vitest';
import { golfCourse, MARKET_IDS } from '@runway/engine';
import {
  PUTTER,
  clubFor,
  defaultAim,
  dist,
  flightAt,
  headingTo,
  hit,
  holeGeo,
  lieAt,
  strokeRng,
} from '../src/city/golf/game';

describe('golf: the holes and the ball', () => {
  it('every city’s holes have a tee, a fairway and a green where they should be', () => {
    for (const id of MARKET_IDS)
      for (const h of golfCourse(id).holes) {
        const g = holeGeo(h);
        expect(lieAt(g, g.pin)).toBe('green');
        expect(lieAt(g, { x: g.pin.x + 200, z: g.pin.z })).toBe('rough');
        if (h.par > 3) expect(lieAt(g, g.line[12]!)).toBe('fairway');
      }
  });

  it('a full drive carries about the driver’s distance, the same on replay', () => {
    const g = holeGeo(golfCourse('lagos').holes.find((h) => h.par >= 4)!);
    const club = clubFor(g.length, 'tee');
    expect(club.id).toBe('driver');
    const aim = defaultAim(g, g.tee, club, 'tee');
    const a = hit(g, g.tee, 'tee', club, 95, aim, strokeRng('x', 0, 0));
    const b = hit(g, g.tee, 'tee', club, 95, aim, strokeRng('x', 0, 0));
    expect(a).toEqual(b);
    expect(a.carry).toBeGreaterThan(200);
    expect(a.carry).toBeLessThan(240);
    expect(flightAt(a, 0.5).y).toBeGreaterThan(10);
    expect(flightAt(a, 1).y).toBeCloseTo(0);
  });

  it('a putt at the right pace drops; a tap-in always does', () => {
    const g = holeGeo(golfCourse('nairobi').holes[0]!);
    const ball = { x: g.pin.x, z: g.pin.z + 5 };
    const aim = headingTo(ball, g.pin);
    const good = hit(g, ball, 'green', PUTTER, ((5 + 0.4) / PUTTER.carry) * 100, aim, () => 0.5);
    expect(good.holed).toBe(true);
    const long = hit(g, ball, 'green', PUTTER, 100, aim, () => 0.5);
    expect(long.holed).toBe(false);
    const tap = hit(g, { x: g.pin.x, z: g.pin.z + 0.5 }, 'green', PUTTER, 10, aim, () => 0.9);
    expect(tap.holed).toBe(true);
    expect(dist(tap.rest, g.pin)).toBe(0);
  });
});
