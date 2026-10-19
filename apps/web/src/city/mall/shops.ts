/**
 * The mall's shops (player feedback: "people should go to the malls to
 * shop"): their names on the signs, colours and icons. What they sell and
 * the prices come from the engine (`me.mall`, ../leisure.ts).
 */
import type { MallShopId } from '@runway/engine';
import { t } from '../../i18n';
import type { AvatarLook } from '../art';
import type { MallItemView } from '../leisure';

export const SHOP_ORDER: readonly MallShopId[] = [
  'fashion',
  'phones',
  'home',
  'supermarket',
  'foodcourt',
  'cinema',
];

/** The fashion shop is of its city; the others are the mall's own. */
const FASHION: Record<string, string> = {
  lagos: 'Ankara & Co.',
  nairobi: 'Kitenge House',
  london: 'Thread & Needle',
  accra: 'Kente Corner',
  freetown: 'Lappa Styles',
  kigali: 'Imigongo Wear',
  johannesburg: 'Shweshwe Studio',
  cairo: 'Khayamiya Fashion',
  dubai: 'Souk Couture',
  'san-francisco': 'Golden Thread',
};

export const shopName = (shop: MallShopId, market: string): string =>
  shop === 'fashion'
    ? (FASHION[market] ?? 'City Fashion')
    : {
        phones: 'Signal Phones & Electronics',
        home: 'Home & Living',
        supermarket: 'FreshMart',
        foodcourt: 'Food Court',
        cinema: 'Starlight Cinema',
      }[shop];

export const SHOP_COLOUR: Record<MallShopId, string> = {
  fashion: '#db2777',
  phones: '#2563eb',
  home: '#a16207',
  supermarket: '#16a34a',
  foodcourt: '#ea580c',
  cinema: '#7c3aed',
};

export const SHOP_ICON: Record<MallShopId, string> = {
  fashion: '👗',
  phones: '📱',
  home: '🛋️',
  supermarket: '🛒',
  foodcourt: '🍔',
  cinema: '🎬',
};

export const shopBlurb = (shop: MallShopId): string =>
  ({
    fashion: () => t('Clothes and accessories'),
    phones: () => t('Phones, laptops and TVs'),
    home: () => t('Furniture and decor'),
    supermarket: () => t('Groceries and snacks'),
    foodcourt: () => t('Eat something'),
    cinema: () => t('Watch a film'),
  })[shop]();

/** The tops' colours by name (the avatar creator's names). */
const COLOUR_NAME: Record<string, () => string> = {
  '#0f766e': () => t('Teal'),
  '#2563eb': () => t('Blue'),
  '#1e3a8a': () => t('Navy'),
  '#dc2626': () => t('Red'),
  '#16a34a': () => t('Green'),
  '#f59e0b': () => t('Amber'),
  '#7c3aed': () => t('Purple'),
  '#db2777': () => t('Pink'),
  '#f97316': () => t('Orange'),
  '#111827': () => t('Black'),
  '#e2e8f0': () => t('White'),
  '#a16207': () => t('Gold'),
};
export const colourName = (hex: string): string => COLOUR_NAME[hex.toLowerCase()]?.() ?? hex;

/** Whether you wear it (clothes and accessories). */
export const isWearable = (it: MallItemView) => !!(it.topStyle || it.headwear || it.glasses);

/** What wearing an item looks like (for trying it on). */
export function wearing(look: AvatarLook, it: MallItemView, colour: string): AvatarLook {
  return {
    ...look,
    ...(it.topStyle ? { topStyle: it.topStyle as AvatarLook['topStyle'], top: colour } : {}),
    ...(it.headwear ? { headwear: it.headwear as AvatarLook['headwear'] } : {}),
    ...(it.glasses ? { glasses: it.glasses as AvatarLook['glasses'] } : {}),
  };
}

const ICON: Record<string, string> = {
  tee: '👕',
  shirt: '👔',
  hoodie: '🧥',
  kaftan: '👘',
  dress: '👗',
  blazer: '🧥',
  cap: '🧢',
  beanie: '🧶',
  shades: '🕶️',
  'laptop-2': '💻',
  'tv-2': '📺',
  'sound-1': '🔊',
  'sofa-2': '🛋️',
  'bed-2': '🛏️',
  'rug-2': '🧶',
  'lights-2': '💡',
  'plants-1': '🪴',
  'art-2': '🖼️',
  groceries: '🧺',
  'groceries-week': '🛒',
  snacks: '🥤',
  'local-plate': '🍲',
  burger: '🍔',
  smoothie: '🧃',
  film: '🎬',
  'film-vip': '🍿',
};
/** A picture for an item (its card, the receipt). */
export const itemIcon = (it: MallItemView): string =>
  ICON[it.topStyle ?? it.headwear ?? it.glasses ?? it.id] ?? (it.phone ? '📱' : SHOP_ICON[it.shop]);
