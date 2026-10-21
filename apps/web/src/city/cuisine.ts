/**
 * Places to eat of each city: their cuisine, menu, room and price level.
 * The data lives in the engine (packages/engine/src/data/cuisine.ts) because
 * a place's style is also what it charges; the web draws it from here.
 */
export {
  ALL_FOOD_STYLES,
  FOOD_STYLES,
  dishOf,
  foodLevelOf,
  foodStyleOf,
  isFoodPlaceKind,
} from '@runway/engine';
export type { FoodLevel, FoodPlace, FoodStyle, FoodTier } from '@runway/engine';
