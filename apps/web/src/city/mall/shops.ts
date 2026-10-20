/**
 * The mall's shops (player feedback: "people should go to the malls to
 * shop", then "more stores and more items to buy"): their names on the
 * signs, colours and icons. What they sell and the prices come from the
 * engine (`me.mall`, ../leisure.ts); which shops are open here too (`shops`:
 * the first six on an older server).
 */
import type { MallShopId } from '@runway/engine';
import { t } from '../../i18n';
import type { AvatarLook } from '../art';
import type { MallItemView, MallView } from '../leisure';

/** Every shop, the first six then the bigger mall's. */
export const SHOP_ORDER: readonly MallShopId[] = [
  'fashion',
  'phones',
  'home',
  'supermarket',
  'foodcourt',
  'cinema',
  'outlet',
  'designer',
  'shoes',
  'jewellery',
  'beauty',
  'books',
  'sports',
  'toys',
  'pharmacy',
  'arcade',
];

const FIRST: readonly MallShopId[] = SHOP_ORDER.slice(0, 6);

/** The shops open in this mall (the engine says; an older server: the first six). */
export const shopsOf = (mall: MallView | null): readonly MallShopId[] => {
  const open = new Set(mall?.shops ?? FIRST);
  return SHOP_ORDER.filter((s) => open.has(s));
};

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

const NAMES: Record<Exclude<MallShopId, 'fashion'>, string> = {
  phones: 'Signal Phones & Electronics',
  home: 'Home & Living',
  supermarket: 'FreshMart',
  foodcourt: 'Food Court',
  cinema: 'Starlight Cinema',
  outlet: 'Everyday Outlet',
  designer: 'Atelier Luxe',
  shoes: 'Stride Shoes',
  jewellery: 'Gold & Time',
  beauty: 'Glow Beauty & Fragrance',
  books: 'Chapter & Verse Books',
  sports: 'Peak Sports',
  toys: 'Wonder Toys & Gifts',
  pharmacy: 'CarePlus Pharmacy',
  arcade: 'Pixel Arcade',
};

export const shopName = (shop: MallShopId, market: string): string =>
  shop === 'fashion' ? (FASHION[market] ?? 'City Fashion') : NAMES[shop];

export const SHOP_COLOUR: Record<MallShopId, string> = {
  fashion: '#db2777',
  phones: '#2563eb',
  home: '#a16207',
  supermarket: '#16a34a',
  foodcourt: '#ea580c',
  cinema: '#7c3aed',
  outlet: '#0891b2',
  designer: '#1f2937',
  shoes: '#c2410c',
  jewellery: '#b8860b',
  beauty: '#e11d74',
  books: '#7c2d12',
  sports: '#0284c7',
  toys: '#f59e0b',
  pharmacy: '#059669',
  arcade: '#9333ea',
};

export const SHOP_ICON: Record<MallShopId, string> = {
  fashion: '👗',
  phones: '📱',
  home: '🛋️',
  supermarket: '🛒',
  foodcourt: '🍔',
  cinema: '🎬',
  outlet: '🏷️',
  designer: '👜',
  shoes: '👟',
  jewellery: '💍',
  beauty: '💄',
  books: '📚',
  sports: '⚽',
  toys: '🧸',
  pharmacy: '💊',
  arcade: '🕹️',
};

export const shopBlurb = (shop: MallShopId): string =>
  ({
    fashion: () => t('Clothes and accessories'),
    phones: () => t('Phones, laptops and TVs'),
    home: () => t('Furniture and decor'),
    supermarket: () => t('Groceries and snacks'),
    foodcourt: () => t('Eat something'),
    cinema: () => t('Watch a film'),
    outlet: () => t('Value fashion for less'),
    designer: () => t('Designer labels'),
    shoes: () => t('Shoes for every day'),
    jewellery: () => t('Jewellery and watches'),
    beauty: () => t('Beauty and fragrance'),
    books: () => t('Books and stationery'),
    sports: () => t('Sports kit and fitness'),
    toys: () => t('Toys, flowers and gifts'),
    pharmacy: () => t('Health and hygiene'),
    arcade: () => t('Games, VR and bowling'),
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

/** What an item does, in a few words (its card, the shop's list). */
export function itemNote(it: MallItemView): string {
  if (isWearable(it)) return t('You wear it');
  if (it.furniture) return t('For your home');
  if (it.hours) return t('{n} hours', { n: it.hours });
  if (it.hunger && it.hunger >= 15) return t('Fills you up');
  if (it.hygiene) return t('Freshens you up');
  if (it.health) return t('Good for your health');
  if (it.energy) return t('A boost of energy');
  if (it.keep) return t('Yours to keep');
  if (it.hunger) return t('A treat');
  return '';
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
  headwrap: '🧣',
  gele: '👑',
  shades: '🕶️',
  round: '👓',
  square: '👓',
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
  // The bigger mall.
  'fash-jeans': '👖',
  'out-jeans': '👖',
  'fash-belt': '🪢',
  'out-socks': '🧦',
  'out-tote': '👜',
  'des-bag': '👜',
  'des-scarf': '🧣',
  'gad-earbuds': '🎧',
  'gad-headphones': '🎧',
  'gad-tablet': '📱',
  'gad-smartwatch': '⌚',
  'gad-console': '🎮',
  'gad-game': '🎮',
  'gad-powerbank': '🔋',
  'gad-speaker': '🔊',
  'dec-candles': '🕯️',
  'dec-cushions': '🛋️',
  'dec-vase': '🏺',
  'dec-frame': '🖼️',
  'dec-throw': '🧶',
  'dec-mugs': '☕',
  'sup-fruit': '🍎',
  'sup-breakfast': '🥚',
  'sup-coffee': '☕',
  'sup-drinks': '🥤',
  'sup-toiletries': '🧴',
  'sup-cleaning': '🧽',
  'fc-pizza': '🍕',
  'fc-noodles': '🍜',
  'fc-chicken': '🍗',
  'fc-icecream': '🍦',
  'fc-coffee': '🥐',
  'fc-shawarma': '🌯',
  'film-3d': '🕶️',
  'film-double': '🎞️',
  popcorn: '🍿',
  'shoe-flipflops': '🩴',
  'shoe-sandals': '🩴',
  'shoe-trainers': '👟',
  'shoe-running': '👟',
  'shoe-loafers': '👞',
  'shoe-heels': '👠',
  'shoe-boots': '👢',
  'shoe-designer': '👟',
  'jew-bracelet': '📿',
  'jew-studs': '💎',
  'jew-necklace': '📿',
  'jew-cufflinks': '💎',
  'jew-watch': '⌚',
  'jew-dress-watch': '⌚',
  'jew-gold-chain': '🔗',
  'jew-ring': '💍',
  'jew-luxury-watch': '⌚',
  'bty-soap': '🧼',
  'bty-haircare': '🧴',
  'bty-grooming': '🪒',
  'bty-skincare': '🧴',
  'bty-lipstick': '💄',
  'bty-makeup': '💄',
  'bty-cologne': '🌬️',
  'bty-perfume': '🌸',
  'bty-luxury': '✨',
  'book-magazine': '📰',
  'book-notebook': '📓',
  'book-kids': '📖',
  'book-novel': '📕',
  'book-business': '📘',
  'book-biography': '📗',
  'book-cookbook': '📙',
  'book-photo': '📚',
  'book-ereader': '📱',
  'spt-jersey': '👕',
  'spt-tracksuit': '🧥',
  'spt-bottle': '🧴',
  'spt-football': '⚽',
  'spt-yoga': '🧘',
  'spt-dumbbells': '🏋️',
  'spt-gymbag': '🎒',
  'spt-racket': '🎾',
  'spt-bike': '🚲',
  'toy-card': '💌',
  'toy-chocolates': '🍫',
  'toy-puzzle': '🧩',
  'toy-flowers': '💐',
  'toy-teddy': '🧸',
  'toy-boardgame': '🎲',
  'toy-rc-car': '🏎️',
  'toy-blocks': '🧱',
  'toy-hamper': '🧺',
  'ph-sanitiser': '🧴',
  'ph-painkillers': '💊',
  'ph-energy': '⚡',
  'ph-toothcare': '🪥',
  'ph-sleep': '🌙',
  'ph-vitamins': '💊',
  'ph-sunscreen': '🧴',
  'ph-firstaid': '🩹',
  'arc-airhockey': '🏒',
  'arc-claw': '🧸',
  'arc-tokens': '🪙',
  'arc-karaoke': '🎤',
  'arc-bowling': '🎳',
  'arc-vr': '🥽',
};
/** A picture for an item (its card, the receipt). */
export const itemIcon = (it: MallItemView): string =>
  ICON[it.id] ??
  ICON[it.topStyle ?? it.headwear ?? it.glasses ?? ''] ??
  (it.phone ? '📱' : SHOP_ICON[it.shop]);
