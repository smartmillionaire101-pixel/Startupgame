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
  powerZone,
  roundStats,
  scoreMark,
  strokeRng,
  type ShotLog,
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

describe('golf: what the HUD and the scorecard read', () => {
  it('splits the meter into wind-up, the sweet spot and the lunge', () => {
    expect(powerZone(50)).toBe('build');
    expect(powerZone(79.9)).toBe('build');
    expect(powerZone(80)).toBe('sweet');
    expect(powerZone(100)).toBe('sweet');
    expect(powerZone(100.5)).toBe('lunge');
  });

  it('marks scores the golf way', () => {
    expect(scoreMark(2, 4)).toBe('eagle');
    expect(scoreMark(3, 4)).toBe('birdie');
    expect(scoreMark(4, 4)).toBe('par');
    expect(scoreMark(5, 4)).toBe('bogey');
    expect(scoreMark(7, 4)).toBe('double');
  });

  it('counts putts, fairways hit and the longest drive from the shots', () => {
    const at = (x: number, z: number) => ({ x, z });
    const shot = (o: Partial<ShotLog>): ShotLog => ({
      hole: 0,
      par: 4,
      club: 'driver',
      from: at(0, 0),
      land: at(0, -200),
      rest: at(0, -221),
      lie: 'fairway',
      fromLie: 'tee',
      penalty: false,
      ...o,
    });
    const log = [
      shot({}),
      shot({
        club: 'wedge',
        fromLie: 'fairway',
        from: at(0, -221),
        rest: at(0, -262),
        lie: 'green',
      }),
      shot({ club: 'putter', fromLie: 'green', lie: 'holed' }),
      // A par 3: its tee shot isn't a drive.
      shot({ hole: 1, par: 3, club: 'iron7', rest: at(0, -150), lie: 'green' }),
      shot({ hole: 1, par: 3, club: 'putter', fromLie: 'green', lie: 'holed' }),
      // Into the rough off the tee on a par 5.
      shot({ hole: 2, par: 5, rest: at(30, -230), lie: 'rough' }),
    ];
    const s = roundStats(log);
    expect(s.putts).toBe(2);
    expect(s.fairwayHoles).toBe(2);
    expect(s.fairways).toBe(1);
    expect(s.longest).toBe(Math.round(Math.hypot(30, 230)));
    expect(roundStats([])).toEqual({ putts: 0, fairways: 0, fairwayHoles: 0, longest: 0 });
  });
});
