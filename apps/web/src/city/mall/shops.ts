/**
 * The mall's shops (player feedback: "people should go to the malls to
 * shop"): their names on the signs, colours and icons. What they sell and
 * the prices come from the engine (`me.mall`, ../leisure.ts).
 */
import type { MallShopId } from '@runway/engine';
import { t } from '../../i18n';

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
