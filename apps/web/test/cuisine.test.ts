import { describe, expect, it } from 'vitest';
import { ALL_FOOD_STYLES, FOOD_STYLES, dishOf, foodStyleOf } from '../src/city/cuisine';
import { FR } from '../src/i18n/fr';

const CITIES = [
  'lagos',
  'accra',
  'freetown',
  'nairobi',
  'kigali',
  'johannesburg',
  'cairo',
  'dubai',
  'london',
  'san-francisco',
];

const at = (market: string, kind: string, name: string, id = 'b1') =>
  foodStyleOf({ market, id, kind, name });

describe('restaurants of each city', () => {
  it('reads the place from its name, kind and city', () => {
    const cases: [string, string, string, string, string][] = [
      ['lagos', 'buka', "Mama Titi's Buka", 'lagos-buka', 'Nigerian'],
      ['lagos', 'buka', 'Iya Basira Amala Joint', 'lagos-amala', 'Nigerian'],
      ['lagos', 'restaurant', 'Broad Street Pepper Soup House', 'lagos-pepper-soup', 'Nigerian'],
      ['lagos', 'restaurant', 'Island Bistro', 'lagos-island-dining', 'Nigerian'],
      ['lagos', 'suya-spot', 'Mallam Sule Suya Spot', 'lagos-suya', 'Nigerian'],
      ['accra', 'waakye-stand', 'Auntie Muni Waakye', 'accra-waakye', 'Ghanaian'],
      ['accra', 'chop-bar', 'Makola Kenkey House', 'accra-kenkey', 'Ghanaian'],
      ['accra', 'restaurant', 'Labadi Beach Grill', 'accra-beach-grill', 'Ghanaian'],
      ['nairobi', 'grill-house', 'Mzee Kamau Choma Zone', 'nairobi-choma', 'Kenyan'],
      ['nairobi', 'restaurant', 'Hospital Road Swahili Kitchen', 'nairobi-swahili', 'Swahili'],
      ['nairobi', 'restaurant', 'Eastleigh Biryani House', 'nairobi-somali', 'Somali'],
      ['cairo', 'koshary', 'Koshary El Nour', 'cairo-koshary', 'Egyptian'],
      ['cairo', 'restaurant', 'Zamalek Bistro', 'cairo-nile-dining', 'Egyptian'],
      ['cairo', 'restaurant', 'Al-Muizz Fatta House', 'cairo-old-cairo', 'Egyptian'],
      ['dubai', 'restaurant', 'DIFC Grill Room', 'dubai-tower-dining', 'International'],
      ['dubai', 'restaurant', 'Al Fahidi Machboos House', 'dubai-majlis', 'Emirati'],
      ['dubai', 'cafe', 'Creekside Karak Café', 'dubai-karak', 'Emirati'],
      ['london', 'curry-house', 'Banglatown Spice House', 'london-curry-house', 'Indian'],
      ['london', 'caff', 'Pie & Mash on the Cut', 'london-pie-mash', 'British'],
      ['london', 'restaurant', 'Borough Oyster Bar', 'london-oyster-bar', 'Seafood'],
      ['london', 'restaurant', 'Leather Lane Trattoria', 'london-trattoria', 'Italian'],
      ['london', 'restaurant', 'Soho Noodle Bar', 'london-noodle-bar', 'Asian'],
      ['san-francisco', 'taqueria', 'Mission Pupusería', 'san-francisco-pupuseria', 'Salvadoran'],
      ['san-francisco', 'taqueria', 'Taquería Los Gemelos', 'san-francisco-taqueria', 'Mexican'],
      ['san-francisco', 'dim-sum', 'Golden Lantern Dim Sum', 'san-francisco-dim-sum', 'Chinese'],
      ['san-francisco', 'restaurant', '2nd Street Ramen House', 'san-francisco-ramen', 'Japanese'],
      [
        'johannesburg',
        'grill-house',
        'Orlando Shisa Nyama',
        'johannesburg-shisa-nyama',
        'South African',
      ],
      ['johannesburg', 'food-truck', 'Braam Kota Truck', 'johannesburg-kota', 'South African'],
      ['kigali', 'grill-house', 'Chez Jean Brochettes', 'kigali-brochette', 'Rwandan'],
      ['kigali', 'restaurant', 'Kiyovu Bistro', 'kigali-bistro', 'Rwandan'],
      ['freetown', 'chop-bar', "Mammy Kadi's Cookery", 'freetown-cookery', 'Sierra Leonean'],
      ['freetown', 'restaurant', 'Krio Pot Restaurant', 'freetown-krio-kitchen', 'Sierra Leonean'],
    ];
    for (const [m, kind, name, id, cuisine] of cases) {
      const s = at(m, kind, name);
      expect(s?.id, name).toBe(id);
      expect(s?.cuisine, name).toBe(cuisine);
    }
  });

  it('is deterministic, and not for bars, clubs or shops', () => {
    for (const m of CITIES)
      for (const kind of ['restaurant', 'cafe', 'buka', 'grill-house']) {
        const a = foodStyleOf({ market: m, id: 'x9', kind, name: 'Somewhere' });
        const b = foodStyleOf({ market: m, id: 'x9', kind, name: 'Somewhere' });
        expect(a).toEqual(b);
        expect(a).not.toBeNull();
      }
    for (const kind of ['bar', 'pub', 'nightclub', 'lounge-bar', 'grocer', 'salon'])
      expect(at('lagos', kind, 'Anything')).toBeNull();
  });

  it('gives every city its own restaurants, cafés and street food', () => {
    for (const kind of ['restaurant', 'cafe', 'food-truck']) {
      const ids = CITIES.map((m) => at(m, kind, 'Plain Name')!.id);
      expect(new Set(ids).size, kind).toBe(CITIES.length);
      ids.forEach((id, i) => expect(id.startsWith(`${CITIES[i]}-`)).toBe(true));
    }
    // A city's own food: Lagos is Nigerian, Cairo Egyptian, a London caff British.
    expect(at('lagos', 'buka', 'X')!.cuisine).toBe('Nigerian');
    expect(at('cairo', 'koshary', 'X')!.cuisine).toBe('Egyptian');
    expect(at('london', 'caff', 'X')!.cuisine).toBe('British');
  });

  it('varies between restaurants in one city, by venue', () => {
    for (const m of CITIES) {
      const seen = new Set<string>();
      const looks = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const s = foodStyleOf({ market: m, id: `biz-${m}-${i}`, kind: 'restaurant', name: 'X' })!;
        seen.add(s.id);
        looks.add(`${s.id}:${s.tableCloth}`);
      }
      expect(seen.size, m).toBeGreaterThan(1);
      expect(looks.size, m).toBeGreaterThan(seen.size);
    }
  });

  it('looks different by price tier', () => {
    const street = at('lagos', 'buka', "Mama Titi's Buka")!;
    const casual = at('lagos', 'restaurant', 'Broad Street Pepper Soup House')!;
    const fine = at('lagos', 'restaurant', 'Island Bistro')!;
    expect([street.tier, casual.tier, fine.tier]).toEqual([1, 2, 3]);
    expect(new Set([street.seating, casual.seating, fine.seating]).size).toBe(3);
    expect(fine.seating).toBe('cloth');
    expect(street.outdoor).toBe(true);
    // Every city has a fine-dining room, a street place and a café.
    for (const m of CITIES) {
      const all = FOOD_STYLES[m]!;
      expect(
        all.some((s) => s.tier === 3),
        m,
      ).toBe(true);
      expect(
        all.some((s) => s.tier === 1 && s.kinds.some((k) => k !== 'bakery')),
        m,
      ).toBe(true);
      expect(
        all.some((s) => s.kinds.includes('cafe')),
        m,
      ).toBe(true);
    }
  });

  it('turns the engine’s items into the house dishes', () => {
    const s = at('lagos', 'buka', "Mama Titi's Buka")!;
    const street = [
      { id: 'plate', energy: 7, price: 2700 },
      { id: 'drink', energy: 2, price: 900 },
    ];
    expect(dishOf(s, street[0]!, street)).toMatch(/Jollof/);
    expect(dishOf(s, street[1]!, street)).toBe('Chilled zobo');
    const meal = [
      { id: 'lunch', energy: 8, price: 5400 },
      { id: 'dinner', energy: 10, price: 11250 },
      { id: 'drink', energy: 2, price: 1350 },
    ];
    const curry = at('london', 'curry-house', 'Banglatown Spice House')!;
    expect(dishOf(curry, meal[1]!, meal)).toMatch(/rogan josh/);
    expect(dishOf(curry, meal[0]!, meal)).toBe('Chicken tikka masala');
    const cafe = [
      { id: 'coffee', energy: 5, price: 3 },
      { id: 'breakfast', energy: 7, price: 8 },
      { id: 'pastry', energy: 3, price: 3 },
    ];
    const sf = at('san-francisco', 'cafe', 'X')!;
    expect(dishOf(sf, cafe[0]!, cafe)).toBe('Pour-over coffee');
    expect(dishOf(sf, cafe[1]!, cafe)).toBe('Avocado toast on sourdough');
    expect(dishOf(sf, cafe[2]!, cafe)).toBe('Morning bun');
    expect(dishOf(sf, { id: 'quiz', activity: true }, cafe)).toBeNull();
  });

  it('has French for every cuisine, label and dish', () => {
    const missing: string[] = [];
    for (const s of ALL_FOOD_STYLES)
      for (const str of [s.cuisine, s.label, s.dishes.main, s.dishes.side, s.dishes.drink])
        if (FR[str] === undefined) missing.push(str);
    expect([...new Set(missing)]).toEqual([]);
  });
});
