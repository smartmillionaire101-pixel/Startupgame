import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import { crowdSize } from '../src/city/people';
import {
  alongRoute,
  cityViewOf,
  clockOf,
  destinationsOf,
  flightsOf,
  fmtCountdown,
  hereOf,
  isAbroad,
  msLeft,
  rideDistance,
  rideFare,
  rideMinutes,
  rideMs,
  rideVehicle,
  routeOf,
  SHORT_HOP,
  transitName,
  airportSchedule,
  boardRows,
  CITY_NAMES,
  fmtFlightTime,
  nextFlightTo,
  stopsAlong,
} from '../src/city/travel';
import { sceneMs } from '../src/city/ride/state';
import { B } from '../src/city/layout';

const market = (id: string, name: string) => ({ id, name, segments: [], currency: 'NGN' });
const viewOf = (over: Record<string, unknown> = {}) =>
  ({
    market: market('lagos', 'Lagos'),
    me: {
      destinations: [
        { id: 'london', name: 'London', tripCost: 900_000, visitingNow: false },
        { id: 'nairobi', name: 'Nairobi', tripCost: 500_000, visitingNow: true },
      ],
    },
    ...over,
  }) as unknown as PlayerView;

describe('Wave 4 contracts, with fallbacks', () => {
  it('reads the clock, or nothing', () => {
    expect(clockOf(viewOf())).toBeNull();
    expect(clockOf(viewOf({ clock: null }))).toBeNull();
    const c = { monthMs: 300_000, nextSettlementAt: 1_000_000, serverNow: 800_000 };
    expect(clockOf(viewOf({ clock: c }))).toEqual(c);
    // 200 s left when the view came; 50 s later, 150 s.
    expect(msLeft(c, 10_000, 60_000)).toBe(150_000);
    expect(msLeft(c, 0, 10_000_000)).toBe(0);
    expect(fmtCountdown(222_000)).toBe('3:42');
    expect(fmtCountdown(3_723_000)).toBe('1:02:03');
  });

  it('is where view.here says, else at home (here is null at home)', () => {
    const home = viewOf();
    expect(hereOf(home).id).toBe('lagos');
    expect(hereOf(viewOf({ here: null })).id).toBe('lagos');
    expect(isAbroad(home)).toBe(false);
    expect(cityViewOf(home)).toBe(home);
    const away = viewOf({ here: market('london', 'London') });
    expect(isAbroad(away)).toBe(true);
    expect(cityViewOf(away).market.id).toBe('london');
  });

  it('lists one-way flights, home first when away; else the old trips', () => {
    const old = destinationsOf(viewOf());
    expect(old.map((d) => [d.id, d.fare, d.hours, d.done])).toEqual([
      ['london', 900_000, 40, false],
      ['nairobi', 500_000, 40, true],
    ]);
    const flights = { fareTo: { london: 450_000, nairobi: 250_000 }, hours: 4 };
    expect(flightsOf(viewOf({ flights }))).toEqual(flights);
    const atHome = destinationsOf(viewOf({ flights }));
    expect(atHome.map((d) => [d.id, d.fare, d.hours])).toEqual([
      ['london', 450_000, 4],
      ['nairobi', 250_000, 4],
    ]);
    const away = destinationsOf(
      viewOf({
        here: market('london', 'London'),
        flights: { fareTo: { lagos: 450_000, nairobi: 300_000 }, hours: 4 },
      }),
    );
    expect(away.map((d) => d.id)).toEqual(['lagos', 'nairobi']);
    expect(away[0]!.name).toBe('Lagos');
  });
});

describe('rides', () => {
  it('sizes trips and fares like the server (shares of cost of living)', () => {
    expect(rideDistance(B)).toBe('short');
    expect(rideDistance(5 * B)).toBe('medium');
    expect(rideDistance(10 * B)).toBe('long');
    expect(rideFare('walk', 40, 100_000)).toBe(0);
    expect(rideFare('cycle', 40, 100_000)).toBe(0);
    expect(rideFare('bus', 10 * B, 100_000)).toBe(500);
    expect(rideFare('taxi', B, 100_000)).toBe(1000);
    expect(SHORT_HOP).toBeGreaterThan(2 * B);
  });

  it('gets faster from walking to the taxi, on screen and in town', () => {
    const tiles = 40;
    expect(rideMs('walk', tiles)).toBeGreaterThan(rideMs('cycle', tiles));
    expect(rideMs('cycle', tiles)).toBeGreaterThan(rideMs('taxi', tiles));
    expect(rideMinutes('walk', tiles)).toBeGreaterThan(rideMinutes('bus', tiles));
    expect(rideMinutes('bus', tiles)).toBeGreaterThan(rideMinutes('taxi', tiles));
    expect(rideMs('walk', 1000)).toBeLessThanOrEqual(6000);
  });

  it('names each city its own transit and finds a vehicle to ride', () => {
    expect(transitName('lagos')).toBe('Danfo');
    expect(transitName('nairobi')).toBe('Matatu');
    expect(transitName('accra')).toBe('Trotro');
    expect(transitName('freetown')).toBe('Poda-poda');
    expect(transitName('san-francisco')).toBe('Muni');
    expect(transitName('atlantis')).toBe('Bus');
    expect(rideVehicle('walk', 'lagos', [])).toBeNull();
    expect(rideVehicle('bus', 'lagos', [])).not.toBeNull();
    const danfo = { id: 'danfo', body: '#ff0', accent: '#000', len: 0.9, wid: 0.3, h: 14 };
    expect(rideVehicle('bus', 'lagos', [danfo])).toBe(danfo);
    expect(rideVehicle('cycle', 'lagos', [])?.extra).toBe('rider');
  });

  it('keeps the crowd small on phones', () => {
    expect(crowdSize(375)).toBeLessThanOrEqual(6);
    expect(crowdSize(1280)).toBeGreaterThan(crowdSize(375));
  });
});

describe('the flight route', () => {
  it('arcs from origin to destination inside the framed map', () => {
    const r = routeOf('lagos', 'london');
    const start = alongRoute(r, 0);
    const end = alongRoute(r, 1);
    expect(start.x).toBeCloseTo(r.a.x);
    expect(end.y).toBeCloseTo(r.b.y);
    for (const k of [0, 0.25, 0.5, 0.75, 1]) {
      const p = alongRoute(r, k);
      expect(p.x).toBeGreaterThanOrEqual(r.box.minX);
      expect(p.x).toBeLessThanOrEqual(r.box.minX + r.box.w);
      expect(p.y).toBeGreaterThanOrEqual(r.box.minY);
      expect(p.y).toBeLessThanOrEqual(r.box.minY + r.box.h);
    }
    // London is north of Lagos: the plane heads up the map (negative y).
    expect(end.y).toBeLessThan(start.y);
  });
});

describe('Wave 7: rides and the busy airport', () => {
  it('scales ride scenes with distance, 5–12 s (walking 5–8 s)', () => {
    for (const mode of ['walk', 'cycle', 'bus', 'taxi'] as const) {
      const short = sceneMs(mode, 1);
      const long = sceneMs(mode, 500);
      expect(short).toBe(5000);
      expect(long).toBe(mode === 'walk' ? 8000 : 12000);
      expect(sceneMs(mode, 40)).toBeGreaterThanOrEqual(short);
    }
  });

  it('names the districts along a route, topped up with streets', () => {
    const areas = [
      { name: 'Yaba', at: { x: 0, y: 0 } },
      { name: 'Ikeja', at: { x: 50, y: 0 } },
      { name: 'Marina', at: { x: 100, y: 0 } },
    ];
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(stopsAlong(areas, ['Broad Street'], path)).toEqual(['Yaba', 'Ikeja', 'Marina']);
    expect(stopsAlong([], ['A Road', 'B Road', 'C Road', 'D Road'], path)).toEqual([
      'A Road',
      'B Road',
      'C Road',
    ]);
  });

  it('keeps a deterministic schedule per airport and day, to real markets', () => {
    const a = airportSchedule('lagos', '3:2026-10-06');
    expect(airportSchedule('lagos', '3:2026-10-06')).toEqual(a);
    expect(airportSchedule('lagos', '4:2026-10-06')).not.toEqual(a);
    expect(a.every((f) => f.city in CITY_NAMES && f.city !== 'lagos')).toBe(true);
    const rows = boardRows(a, 12 * 60);
    expect(rows).toHaveLength(6);
    expect(rows.some((r) => r.status === 'Departed' || r.status === 'Landed')).toBe(true);
    const next = nextFlightTo(a, 'london', 12 * 60);
    expect(next?.city).toBe('london');
    expect(next?.arrival).toBe(false);
  });

  it('formats flight times', () => {
    expect(fmtFlightTime(6 + 20 / 60)).toBe('6h 20m');
    expect(fmtFlightTime(0.5)).toBe('30m');
  });
});
