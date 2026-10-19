/**
 * Eat out (player feedback: "Going out has no restaurants, just night life").
 * The city's places to eat, from the businesses already on the map: what
 * each serves (a readable cuisine from the kind, the name and the city), a
 * price hint from its menu, and whether it's open at this hour.
 *
 * Businesses have no opening hours in the engine (`open` only means it is
 * trading), so the hours here come from the kind: cafés and bakeries for
 * breakfast, street food and canteens at lunch, restaurants and grills for
 * dinner, suya after dark.
 */

export type Meal = 'breakfast' | 'lunch' | 'dinner';

interface FoodKind {
  icon: string;
  /** Translatable: the kind of place, lower case ("chop bar"). */
  type: string;
  /** The meal it is best for. */
  meal: Meal;
  /** Local opening hours [from, to); `to` past 24 runs after midnight. */
  hours: [number, number];
  /** Translatable: a cuisine the kind itself implies (else the city's). */
  cuisine?: string;
}

export const FOOD_KINDS: Record<string, FoodKind> = {
  cafe: { icon: '☕', type: 'café', meal: 'breakfast', hours: [7, 19] },
  'coffee-chain': { icon: '☕', type: 'coffee chain', meal: 'breakfast', hours: [6, 21] },
  'coffee-roaster': { icon: '☕', type: 'coffee roaster', meal: 'breakfast', hours: [7, 18] },
  caff: { icon: '☕', type: 'caff', meal: 'breakfast', hours: [6, 15], cuisine: 'British' },
  bakery: { icon: '🥖', type: 'bakery', meal: 'breakfast', hours: [6, 19] },
  'waakye-stand': {
    icon: '🍢',
    type: 'waakye stand',
    meal: 'breakfast',
    hours: [6, 15],
    cuisine: 'Ghanaian',
  },
  kibanda: { icon: '🍢', type: 'kibanda', meal: 'breakfast', hours: [6, 21], cuisine: 'Kenyan' },
  buka: { icon: '🍲', type: 'buka', meal: 'lunch', hours: [8, 20], cuisine: 'Nigerian' },
  'chop-bar': { icon: '🍲', type: 'chop bar', meal: 'lunch', hours: [9, 21], cuisine: 'Ghanaian' },
  koshary: { icon: '🍲', type: 'koshary', meal: 'lunch', hours: [10, 25], cuisine: 'Egyptian' },
  'dim-sum': { icon: '🥟', type: 'dim sum', meal: 'lunch', hours: [10, 22], cuisine: 'Chinese' },
  taqueria: { icon: '🌮', type: 'taquería', meal: 'lunch', hours: [10, 23], cuisine: 'Mexican' },
  shawarma: {
    icon: '🌯',
    type: 'shawarma',
    meal: 'lunch',
    hours: [11, 27],
    cuisine: 'Middle Eastern',
  },
  'food-truck': { icon: '🚚', type: 'food truck', meal: 'lunch', hours: [11, 21] },
  restaurant: { icon: '🍽️', type: 'restaurant', meal: 'dinner', hours: [12, 23] },
  'curry-house': {
    icon: '🍽️',
    type: 'curry house',
    meal: 'dinner',
    hours: [12, 23],
    cuisine: 'Indian',
  },
  'grill-house': { icon: '🍖', type: 'grill house', meal: 'dinner', hours: [12, 24] },
  'suya-spot': { icon: '🍢', type: 'suya spot', meal: 'dinner', hours: [16, 26] },
};

export const isFoodKind = (kind: string) => kind in FOOD_KINDS;

/** Translatable: the city's own cooking. */
const CITY_CUISINE: Record<string, string> = {
  lagos: 'Nigerian',
  accra: 'Ghanaian',
  nairobi: 'Kenyan',
  freetown: 'Sierra Leonean',
  kigali: 'Rwandan',
  johannesburg: 'South African',
  cairo: 'Egyptian',
  dubai: 'Emirati',
  london: 'British',
  'san-francisco': 'Californian',
};

/** What the name gives away beats the city ("North Beach Trattoria" is Italian). */
const NAME_CUISINE: [RegExp, string][] = [
  [/trattoria|pizz|pasta/i, 'Italian'],
  [/ramen|sushi/i, 'Japanese'],
  [/noodle/i, 'Asian'],
  [/biryani|curry|tandoor/i, 'Indian'],
  [/oyster|chowder|fish|seafood/i, 'Seafood'],
  [/pupus/i, 'Salvadoran'],
  [/swahili/i, 'Swahili'],
  [/krio/i, 'Sierra Leonean'],
  [/shawarma|falafel/i, 'Middle Eastern'],
  [/karak|chapati/i, 'Emirati'],
];

/** Translatable cuisine for a place to eat, or null when nothing fits. */
export function cuisineOf(kind: string, name: string, market: string): string | null {
  const k = FOOD_KINDS[kind];
  if (k?.cuisine) return k.cuisine;
  for (const [re, c] of NAME_CUISINE) if (re.test(name)) return c;
  return CITY_CUISINE[market] ?? null;
}

/** Whether the kind's hours include this local hour (0–23). */
export function openAt(kind: string, hour: number): boolean {
  const k = FOOD_KINDS[kind];
  if (!k) return false;
  const [from, to] = k.hours;
  return (hour >= from && hour < to) || (to > 24 && hour < to - 24);
}

/** The meal people are out for at this local hour. */
export function mealAt(hour: number): Meal {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  return 'dinner';
}

/**
 * $ / $$ / $$$ from the dearest meal on the menu (anything that fills you up
 * more than a drink), against the city's cost of living. Null without a menu.
 */
export function priceHint(
  items: readonly { price: number; energy?: number }[] | undefined,
  costOfLiving: number,
): 1 | 2 | 3 | null {
  if (!items?.length || !(costOfLiving > 0)) return null;
  const meals = items.filter((i) => (i.energy ?? 0) >= 4);
  const top = Math.max(...(meals.length ? meals : items).map((i) => i.price));
  if (!(top > 0)) return null;
  const share = top / costOfLiving;
  return share < 0.007 ? 1 : share < 0.02 ? 2 : 3;
}
