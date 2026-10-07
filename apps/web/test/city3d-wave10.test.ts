/** Wave 10 §B: getting around (your car, buses that stop) and your homes on the map. */
import { describe, expect, it } from 'vitest';
import { loadGeo } from '../src/city/geo';
import { hoodAt, HOODS, propertiesOf } from '../src/city/properties';
import { routeS } from '../src/city/three/actors';
import { skyAt } from '../src/city/three/sky';
import {
  fuelCost,
  rideFare,
  rideMinutes,
  rideModesFor,
  rideVehicle,
  RIDE_MODES,
} from '../src/city/travel';

describe('getting around (Wave 10 §B)', () => {
  const car = { modelId: 'city-suv', label: 'Tiguan', monthlyCost: 40_000 };

  it('offers your own car first, only where it is', () => {
    expect(rideModesFor(null)).toEqual(RIDE_MODES);
    expect(rideModesFor(car)).toEqual(['drive', 'walk', 'cycle', 'bus', 'taxi']);
    expect(rideModesFor(car, true)).toEqual(RIDE_MODES);
  });

  it('drives free (fuel shown, paid in running costs), quicker than a taxi', () => {
    expect(rideFare('drive', 30, 300_000)).toBe(0);
    expect(fuelCost(car, 30, 300_000)).toBeGreaterThan(0);
    expect(fuelCost(car, 80, 300_000)).toBeGreaterThan(fuelCost(car, 10, 300_000));
    expect(fuelCost({ ...car, modelId: 'electric' }, 30, 300_000)).toBe(0);
    expect(rideMinutes('drive', 30)).toBeLessThan(rideMinutes('taxi', 30));
    const v = rideVehicle('drive', 'lagos', [], { modelId: 'luxury', label: 'S' })!;
    expect(v.id).toBe('my-car-luxury');
  });

  it('buses wait at their stops', () => {
    const bus = { len: 2000, speed: 10, offset: 0, stopGap: 400 };
    // 5 stops, 40 s between them plus 7 s at each.
    expect(routeS(bus, 20)).toBeCloseTo(200, 6);
    expect(routeS(bus, 41)).toBeCloseTo(400, 6);
    expect(routeS(bus, 46)).toBeCloseTo(400, 6);
    expect(routeS(bus, 48)).toBeCloseTo(410, 6);
    const car = { len: 2000, speed: 10, offset: 0, stopGap: 0 };
    expect(routeS(car, 46)).toBeCloseTo(460, 6);
  });

  it('turns the sky deep blue at night, gold at dusk', () => {
    const night = skyAt(23, 37.7, 0.5);
    expect(night.night).toBe(1);
    expect(night.zenith.b).toBeGreaterThan(night.zenith.r);
    expect(night.zenith.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.06);
    expect(skyAt(12, 37.7, 0.5).night).toBe(0);
  });
});

describe('your homes on the map (Wave 10 §B)', () => {
  it('reads the portfolio wherever the view keeps it, and nothing when absent', () => {
    expect(propertiesOf({ me: {} })).toEqual([]);
    expect(propertiesOf(null)).toEqual([]);
    const a = propertiesOf({
      me: {
        properties: [
          { id: 'p1', market: 'lagos', neighbourhood: 'Banana Island', tier: 'mansion' },
          { nope: true },
        ],
      },
    });
    expect(a).toEqual([
      {
        id: 'p1',
        market: 'lagos',
        neighbourhood: 'Banana Island',
        tier: 'mansion',
        name: '',
        home: false,
      },
    ]);
    const b = propertiesOf({
      portfolio: [
        { propertyId: 'x', marketId: 'london', neighborhood: 'Mayfair', kind: 'penthouse' },
      ],
    });
    expect(b[0]).toMatchObject({
      id: 'x',
      market: 'london',
      neighbourhood: 'Mayfair',
      tier: 'penthouse',
    });
  });

  it('finds real neighbourhoods on each city map', async () => {
    const sf = (await loadGeo('san-francisco'))!;
    const ph = hoodAt(sf, 'san-francisco', 'Pacific Heights');
    const sc = hoodAt(sf, 'san-francisco', 'sea-cliff');
    const soma = hoodAt(sf, 'san-francisco', 'SoMa lofts');
    // Sea Cliff is west of Pacific Heights; SoMa south-east of it.
    expect(sc.x).toBeLessThan(ph.x - 2000);
    expect(soma.x).toBeGreaterThan(ph.x + 1500);
    expect(soma.y).toBeGreaterThan(ph.y);
    const lagos = (await loadGeo('lagos'))!;
    const bi = hoodAt(lagos, 'lagos', 'Banana Island');
    const [x0, y0, x1, y1] = lagos.bounds;
    expect(bi.x > x0 && bi.x < x1 && bi.y > y0 && bi.y < y1).toBe(true);
    // Unknown names still land somewhere stable.
    expect(hoodAt(lagos, 'lagos', 'Nowhere')).toEqual(hoodAt(lagos, 'lagos', 'Nowhere'));
    for (const id of ['lagos', 'london', 'dubai', 'san-francisco', 'nairobi', 'accra'])
      expect(Object.keys(HOODS[id]!).length).toBeGreaterThan(3);
  });
});
