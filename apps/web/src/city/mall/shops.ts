/**
 * The mall's shops (player feedback: "people should go to the malls to
 * shop", then "more stores and more items to buy"): their names on the
 * signs, colours and icons. What they sell and the prices come from the
 * engine (`me.mall`, ../leisure.ts); which shops are open here too (`shops`:
 * the first six on an older server). The feedback round adds The Suit Shop
 * ("a banker should be able to buy suits for a banker from the mall").
 */
import type { MallShopId } from '@runway/engine';
import { TOP_COLOURS } from '@runway/engine';
import { t } from '../../i18n';
import type { AvatarLook } from '../art';
import { legsColour } from '../../avatar/worn';
import type { MallItemView, MallView } from '../leisure';

/** Every shop, the first six then the bigger mall's (The Suit Shop by the designer boutique). */
export const SHOP_ORDER: readonly MallShopId[] = [
  'fashion',
  'phones',
  'home',
  'supermarket',
  'foodcourt',
  'cinema',
  'outlet',
  'designer',
  'suits',
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
  suits: 'The Suit Shop',
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
  suits: '#14213d',
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
  suits: '🤵',
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
    suits: () => t('Tailoring and formal wear'),
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
  // Suit cloths (the engine's SUIT_COLOURS).
  '#1f2633': () => t('Charcoal'),
  '#1e2a44': () => t('Navy'),
  '#0f1115': () => t('Black'),
  '#4b5563': () => t('Grey'),
  '#a8a29e': () => t('Stone'),
  '#a07a52': () => t('Camel'),
  '#5b1a2a': () => t('Burgundy'),
  '#1f3b2d': () => t('Forest green'),
  // Shirts and blouses (SHIRT_COLOURS).
  '#f8fafc': () => t('White'),
  '#bfdbfe': () => t('Sky blue'),
  '#fbcfe8': () => t('Pale pink'),
  '#f5efe4': () => t('Ivory'),
  '#ddd6fe': () => t('Lilac'),
};
export const colourName = (hex: string): string => COLOUR_NAME[hex.toLowerCase()]?.() ?? hex;

/** Whether you wear it (clothes and accessories; shoes, watches, jewellery and bags too). */
export const isWearable = (it: Pick<MallItemView, 'topStyle' | 'headwear' | 'glasses' | 'worn'>) =>
  !!(it.topStyle || it.headwear || it.glasses || it.worn);

/** Whether it's in your wardrobe already (a top: in this colour), to wear free. */
export const ownsIt = (it: MallItemView, colour: string) =>
  !!it.have && (!it.topStyle || !!it.haveColours?.includes(colour.toLowerCase()));

/** What wearing an item looks like (for trying it on, and the wardrobe's previews). */
export function wearing(
  look: AvatarLook,
  it: Pick<MallItemView, 'topStyle' | 'headwear' | 'glasses' | 'worn'>,
  colour: string,
): AvatarLook {
  return {
    ...look,
    ...(it.topStyle ? { topStyle: it.topStyle as AvatarLook['topStyle'], top: colour } : {}),
    ...(it.headwear ? { headwear: it.headwear as AvatarLook['headwear'] } : {}),
    ...(it.glasses ? { glasses: it.glasses as AvatarLook['glasses'] } : {}),
    ...(it.worn ? { [it.worn.slot]: it.worn.style } : {}),
    ...(it.worn?.slot === 'legs' ? { bottom: legsColour(it.worn.style) ?? look.bottom } : {}),
    // A suit's trousers match its jacket (unless you wear jeans or chinos with it).
    ...(it.topStyle === 'suit' && !legsColour(look.legs) ? { bottom: colour } : {}),
  };
}

/** The colours an item comes in (a suit's cloths), or the creator's. */
export const coloursOf = (it: Pick<MallItemView, 'colours'>): readonly string[] =>
  it.colours?.length ? it.colours : TOP_COLOURS;

/** The colour you get an item in: the one you picked if it comes in it, else its first. */
export const colourFor = (it: Pick<MallItemView, 'colours'>, colour: string): string => {
  const cs = coloursOf(it);
  return cs.includes(colour.toLowerCase()) ? colour : cs[0]!;
};

/**
 * The Suit Shop's catalogue, by what each thing is (the chips over its list:
 * suits, shirts and blouses, ties, shoes, watches and bags).
 */
export type SuitAisle = 'all' | 'suits' | 'shirts' | 'ties' | 'shoes' | 'watches' | 'bags';
export const SUIT_AISLES: readonly SuitAisle[] = [
  'all',
  'suits',
  'shirts',
  'ties',
  'shoes',
  'watches',
  'bags',
];
export const aisleLabel = (a: SuitAisle): string =>
  ({
    all: () => t('All'),
    suits: () => t('Suits'),
    shirts: () => t('Shirts & blouses'),
    ties: () => t('Ties'),
    shoes: () => t('Shoes'),
    watches: () => t('Watches'),
    bags: () => t('Bags'),
  })[a]();
/** The aisle an item is in. */
export function aisleOf(it: Pick<MallItemView, 'topStyle' | 'worn'>): SuitAisle {
  if (it.topStyle === 'suit') return 'suits';
  if (it.topStyle) return 'shirts';
  const slot = it.worn?.slot;
  if (slot === 'tie') return 'ties';
  if (slot === 'shoes') return 'shoes';
  if (slot === 'watch') return 'watches';
  if (slot === 'bag') return 'bags';
  return 'all';
}

/** What an item does, in a few words (its card, the shop's list). */
export function itemNote(it: MallItemView): string {
  if (it.local) return t('A local style');
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
  // The feedback round.
  suit: '🤵',
  blouse: '👚',
  'sui-tie-silk': '👔',
  'sui-tie-knit': '👔',
  'sui-tie-bow': '🎀',
  'sui-oxfords': '👞',
  'sui-oxfords-handmade': '👞',
  'shoe-oxfords': '👞',
  'sui-loafers': '👞',
  'des-loafers': '👞',
  'sui-courts': '👠',
  'shoe-courts': '👠',
  'sui-watch': '⌚',
  'sui-briefcase': '💼',
  'sui-folio': '📁',
  'sui-tote': '👜',
  'fash-chinos': '👖',
  'out-chinos': '👖',
  'spt-joggers': '👖',
  'out-trainers': '👟',
  'spt-trainers': '👟',
};
/** A picture for an item (its card, the receipt, your purchases). */
export const itemIcon = (
  it: Pick<MallItemView, 'id' | 'topStyle' | 'headwear' | 'glasses' | 'phone' | 'shop'>,
): string =>
  ICON[it.id] ??
  ICON[it.topStyle ?? it.headwear ?? it.glasses ?? ''] ??
  (it.phone ? '📱' : SHOP_ICON[it.shop]);

/**
 * Round 7: a thing for your home you have that a home can have more of (a
 * second speaker, more plants: `home.extra.buy`), with room for another.
 */
export function anotherOk(
  style:
    { extraSlots: string[]; extrasPerSlot: number; extras: { slot: string }[] } | null | undefined,
  it: Pick<MallItemView, 'owned' | 'furniture' | 'slot'>,
): boolean {
  return (
    !!it.owned &&
    !!it.furniture &&
    !!it.slot &&
    !!style?.extraSlots.includes(it.slot) &&
    style.extras.filter((x) => x.slot === it.slot).length < style.extrasPerSlot
  );
}
