import { describe, expect, it } from 'vitest';
import { cuisineOf, mealAt, openAt, priceHint } from '../src/city/eatout';

describe('Eat out', () => {
  it('names the cuisine from the kind, then the name, then the city', () => {
    expect(cuisineOf('buka', 'Iya Basira Amala Joint', 'lagos')).toBe('Nigerian');
    expect(cuisineOf('chop-bar', 'Osu Chop Bar', 'accra')).toBe('Ghanaian');
    expect(cuisineOf('curry-house', 'Banglatown Spice House', 'london')).toBe('Indian');
    expect(cuisineOf('restaurant', 'North Beach Trattoria', 'san-francisco')).toBe('Italian');
    expect(cuisineOf('grill-house', 'Mzee Kamau Choma Zone', 'nairobi')).toBe('Kenyan');
    expect(cuisineOf('restaurant', 'Somewhere', 'nowhere')).toBeNull();
  });

  it('keeps hours by kind, past midnight too', () => {
    expect(openAt('cafe', 8)).toBe(true);
    expect(openAt('cafe', 21)).toBe(false);
    expect(openAt('suya-spot', 13)).toBe(false);
    expect(openAt('suya-spot', 1)).toBe(true);
    expect(openAt('restaurant', 20)).toBe(true);
    expect(openAt('nightclub', 20)).toBe(false);
    expect([mealAt(8), mealAt(13), mealAt(20), mealAt(2)]).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'dinner',
    ]);
  });

  it('gives a price hint from the dearest meal against the cost of living', () => {
    const col = 100_000;
    expect(
      priceHint(
        [
          { price: 600, energy: 7 },
          { price: 200, energy: 2 },
        ],
        col,
      ),
    ).toBe(1);
    expect(priceHint([{ price: 1500, energy: 9 }], col)).toBe(2);
    expect(
      priceHint(
        [
          { price: 1200, energy: 8 },
          { price: 2500, energy: 10 },
        ],
        col,
      ),
    ).toBe(3);
    expect(priceHint(undefined, col)).toBeNull();
  });
});
