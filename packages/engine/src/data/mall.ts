/**
 * The mall's shops and what they sell (re-exported by ./leisure.ts).
 *
 * - The first six shops (fashion, phones and electronics, home and
 *   furniture, a supermarket, a food court, a cinema): prices in
 *   cost-of-living units, so they scale with the city like everything else.
 *   Furniture and electronics are the lifestyle shop's own items
 *   (data/lifestyle-shop.ts): they go into your home inventory.
 * - The bigger mall (player feedback: "more stores and more items to buy,
 *   like a lot of different things"): ten more shops (value and designer
 *   fashion, shoes, jewellery and watches, beauty and fragrance, books,
 *   sports, toys and gifts, a pharmacy, an arcade) and more in the first six.
 *   Their items are `more`: sold only once the investor release note is
 *   logged (releases.ts), so a world from before it replays exactly.
 *   Imported goods (gadgets, gold, watches, designer labels, fragrance) are
 *   priced in US dollars at the day's rate (`usd`) when that is dearer than
 *   their cost-of-living price; the rest by the cost of living.
 * - Things you keep (books, toys, gadgets …) go in your bag
 *   (`Player.belongings`); clothes, shoes, jewellery, watches and bags go
 *   in your wardrobe and on you (`worn`, ../wardrobe.ts); food, the
 *   pharmacy and the beauty counter move your needs and life bars.
 *
 * Names are generic, never real brands.
 */
import type { TopStyle, WornPart } from '../appearance.js';

export type MallShopId =
  | 'fashion'
  | 'phones'
  | 'home'
  | 'supermarket'
  | 'foodcourt'
  | 'cinema'
  // The bigger mall (investor release).
  | 'outlet'
  | 'designer'
  | 'shoes'
  | 'jewellery'
  | 'beauty'
  | 'books'
  | 'sports'
  | 'toys'
  | 'pharmacy'
  | 'arcade';

/** The first six shops (every world). */
export const MALL_SHOPS_FIRST: readonly MallShopId[] = [
  'fashion',
  'phones',
  'home',
  'supermarket',
  'foodcourt',
  'cinema',
];

/** Every shop: the first six, then the bigger mall's ten. */
export const MALL_SHOPS: readonly MallShopId[] = [
  ...MALL_SHOPS_FIRST,
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

/** Business kinds whose till takes a mall shop's sales (the mall's branch of them). */
export const MALL_TILLS: Record<Exclude<MallShopId, 'home' | 'foodcourt'>, readonly string[]> = {
  fashion: ['boutique', 'tailor', 'fabric-stall'],
  phones: ['electronics', 'appliance-store', 'phone-repair'],
  supermarket: ['grocer', 'corner-shop'],
  cinema: ['cinema'],
  outlet: ['market-stall', 'fabric-stall', 'boutique'],
  designer: ['boutique', 'tailor'],
  shoes: ['boutique', 'market-stall'],
  jewellery: ['souk-stall', 'boutique'],
  beauty: ['salon', 'spa', 'pharmacy'],
  books: ['print-shop'],
  sports: ['bike-shop', 'gym', 'studio-gym'],
  toys: ['corner-shop', 'market-stall'],
  pharmacy: ['pharmacy', 'clinic'],
  arcade: ['arcade', 'karaoke'],
};

export type PhoneTier = 1 | 2 | 3;

/** What a thing you keep is (in your bag; a friend's gift). */
export type BelongingKind =
  | 'clothes'
  | 'shoes'
  | 'bag'
  | 'jewellery'
  | 'watch'
  | 'beauty'
  | 'book'
  | 'sports'
  | 'toy'
  | 'gadget'
  | 'decor'
  | 'flowers'
  | 'sweets';

export interface MallItem {
  id: string;
  shop: MallShopId;
  /** Translatable. */
  label: string;
  /** Cost-of-living units (furniture: the lifestyle shop's price). */
  priceCol: number;
  /** Imported goods: at least this many US dollars at the day's rate. */
  usd?: number;
  /** The bigger mall: sold once the investor release note is logged. */
  more?: true;
  /** Clothes: the top it puts you in (a colour is picked at the till). */
  topStyle?: TopStyle;
  /** Accessories. */
  headwear?: 'cap' | 'beanie' | 'headwrap' | 'gele';
  glasses?: 'shades' | 'round' | 'square';
  /** A new phone. */
  phone?: PhoneTier;
  /** A lifestyle-shop item (furniture, a TV, a laptop): into your home. */
  furnitureId?: string;
  /** Something you keep (in your bag): what it is. */
  keep?: BelongingKind;
  /**
   * Something you keep that you wear (shoes, a watch, jewellery, a bag, jeans):
   * the part of your look it is. In your wardrobe, never the bag (wardrobe.ts).
   */
  worn?: WornPart;
  /** Food: hunger filled; fun; energy. */
  hunger?: number;
  fun?: number;
  energy?: number;
  /** Hygiene (soap, skincare, a toothbrush). */
  hygiene?: number;
  /** Life bars: health gained (vitamins, a bike); stress eased (a film, a book). */
  health?: number;
  stress?: number;
  /** Hours it takes (a film, the arcade). */
  hours?: number;
}

const it = (x: MallItem) => x;
/** An item of the bigger mall. */
const more = (x: Omit<MallItem, 'more'>): MallItem => ({ ...x, more: true });

export const PHONE_NAMES: Record<PhoneTier, string> = {
  1: 'Everyday smartphone',
  2: 'Mid-range smartphone',
  3: 'Flagship smartphone',
};

export const MALL_ITEMS: readonly MallItem[] = [
  // Fashion: a new top in the colour you pick, and a few accessories.
  it({ id: 'top-tee', shop: 'fashion', label: 'T-shirt', priceCol: 0.015, topStyle: 'tee' }),
  it({ id: 'top-shirt', shop: 'fashion', label: 'Smart shirt', priceCol: 0.03, topStyle: 'shirt' }),
  it({ id: 'top-hoodie', shop: 'fashion', label: 'Hoodie', priceCol: 0.035, topStyle: 'hoodie' }),
  it({ id: 'top-kaftan', shop: 'fashion', label: 'Kaftan', priceCol: 0.06, topStyle: 'kaftan' }),
  it({ id: 'top-dress', shop: 'fashion', label: 'Dress', priceCol: 0.06, topStyle: 'dress' }),
  it({ id: 'top-blazer', shop: 'fashion', label: 'Blazer', priceCol: 0.09, topStyle: 'blazer' }),
  it({ id: 'acc-cap', shop: 'fashion', label: 'Cap', priceCol: 0.01, headwear: 'cap' }),
  it({ id: 'acc-beanie', shop: 'fashion', label: 'Beanie', priceCol: 0.01, headwear: 'beanie' }),
  it({ id: 'acc-shades', shop: 'fashion', label: 'Sunglasses', priceCol: 0.02, glasses: 'shades' }),
  // Phones and electronics.
  it({ id: 'phone-1', shop: 'phones', label: PHONE_NAMES[1], priceCol: 0.15, phone: 1 }),
  it({ id: 'phone-2', shop: 'phones', label: PHONE_NAMES[2], priceCol: 0.4, phone: 2 }),
  it({ id: 'phone-3', shop: 'phones', label: PHONE_NAMES[3], priceCol: 1, phone: 3 }),
  it({ id: 'laptop-2', shop: 'phones', label: '', priceCol: 0, furnitureId: 'laptop-2' }),
  it({ id: 'tv-2', shop: 'phones', label: '', priceCol: 0, furnitureId: 'tv-2' }),
  it({ id: 'sound-1', shop: 'phones', label: '', priceCol: 0, furnitureId: 'sound-1' }),
  // Home and furniture.
  it({ id: 'sofa-2', shop: 'home', label: '', priceCol: 0, furnitureId: 'sofa-2' }),
  it({ id: 'bed-2', shop: 'home', label: '', priceCol: 0, furnitureId: 'bed-2' }),
  it({ id: 'rug-2', shop: 'home', label: '', priceCol: 0, furnitureId: 'rug-2' }),
  it({ id: 'lights-2', shop: 'home', label: '', priceCol: 0, furnitureId: 'lights-2' }),
  it({ id: 'plants-1', shop: 'home', label: '', priceCol: 0, furnitureId: 'plants-1' }),
  it({ id: 'art-2', shop: 'home', label: '', priceCol: 0, furnitureId: 'art-2' }),
  // The supermarket.
  it({
    id: 'groceries',
    shop: 'supermarket',
    label: 'A basket of groceries',
    priceCol: 0.012,
    hunger: 20,
  }),
  it({
    id: 'groceries-week',
    shop: 'supermarket',
    label: 'The weekly shop',
    priceCol: 0.035,
    hunger: 40,
  }),
  it({
    id: 'snacks',
    shop: 'supermarket',
    label: 'Snacks and a cold drink',
    priceCol: 0.004,
    hunger: 10,
    energy: 2,
  }),
  // The food court.
  it({
    id: 'local-plate',
    shop: 'foodcourt',
    label: 'A local favourite',
    priceCol: 0.006,
    hunger: 35,
    fun: 2,
  }),
  it({
    id: 'burger',
    shop: 'foodcourt',
    label: 'Burger and fries',
    priceCol: 0.007,
    hunger: 35,
    fun: 2,
  }),
  it({
    id: 'smoothie',
    shop: 'foodcourt',
    label: 'Fresh smoothie',
    priceCol: 0.003,
    hunger: 8,
    energy: 4,
  }),
  // The cinema.
  it({
    id: 'film',
    shop: 'cinema',
    label: 'Watch a film',
    priceCol: 0.012,
    fun: 18,
    stress: -4,
    hours: 2.5,
  }),
  it({
    id: 'film-vip',
    shop: 'cinema',
    label: 'Film in the VIP seats',
    priceCol: 0.03,
    fun: 24,
    stress: -6,
    hours: 2.5,
  }),

  // ---- The bigger mall: more in the first six shops.
  more({
    id: 'acc-headwrap',
    shop: 'fashion',
    label: 'Headwrap',
    priceCol: 0.012,
    headwear: 'headwrap',
  }),
  more({
    id: 'acc-round',
    shop: 'fashion',
    label: 'Round glasses',
    priceCol: 0.025,
    glasses: 'round',
  }),
  more({
    id: 'fash-jeans',
    shop: 'fashion',
    label: 'Jeans',
    priceCol: 0.03,
    keep: 'clothes',
    worn: { slot: 'legs', style: 'jeans' },
  }),
  more({
    id: 'fash-belt',
    shop: 'fashion',
    label: 'Leather belt',
    priceCol: 0.015,
    keep: 'clothes',
    worn: { slot: 'belt', style: 'leather' },
  }),
  more({
    id: 'gad-earbuds',
    shop: 'phones',
    label: 'Wireless earbuds',
    priceCol: 0.03,
    usd: 60,
    keep: 'gadget',
    fun: 4,
  }),
  more({
    id: 'gad-headphones',
    shop: 'phones',
    label: 'Noise-cancelling headphones',
    priceCol: 0.08,
    usd: 250,
    keep: 'gadget',
    fun: 5,
    stress: -2,
  }),
  more({
    id: 'gad-tablet',
    shop: 'phones',
    label: 'Tablet',
    priceCol: 0.2,
    usd: 380,
    keep: 'gadget',
    fun: 6,
  }),
  more({
    id: 'gad-smartwatch',
    shop: 'phones',
    label: 'Smartwatch',
    priceCol: 0.12,
    usd: 230,
    keep: 'watch',
    worn: { slot: 'watch', style: 'smart' },
    health: 2,
  }),
  more({
    id: 'gad-console',
    shop: 'phones',
    label: 'Games console',
    priceCol: 0.25,
    usd: 450,
    keep: 'gadget',
    fun: 12,
  }),
  more({
    id: 'gad-game',
    shop: 'phones',
    label: 'A new video game',
    priceCol: 0.03,
    usd: 60,
    keep: 'gadget',
    fun: 8,
  }),
  more({
    id: 'gad-powerbank',
    shop: 'phones',
    label: 'Power bank',
    priceCol: 0.01,
    usd: 25,
    keep: 'gadget',
  }),
  more({
    id: 'gad-speaker',
    shop: 'phones',
    label: 'Portable speaker',
    priceCol: 0.04,
    usd: 80,
    keep: 'gadget',
    fun: 5,
  }),
  more({
    id: 'dec-candles',
    shop: 'home',
    label: 'Scented candles',
    priceCol: 0.006,
    keep: 'decor',
    stress: -1,
  }),
  more({ id: 'dec-cushions', shop: 'home', label: 'Cushions', priceCol: 0.012, keep: 'decor' }),
  more({ id: 'dec-vase', shop: 'home', label: 'Ceramic vase', priceCol: 0.015, keep: 'decor' }),
  more({ id: 'dec-frame', shop: 'home', label: 'Photo frame', priceCol: 0.005, keep: 'decor' }),
  more({ id: 'dec-throw', shop: 'home', label: 'Woven throw', priceCol: 0.02, keep: 'decor' }),
  more({ id: 'dec-mugs', shop: 'home', label: 'Set of mugs', priceCol: 0.008, keep: 'decor' }),
  more({
    id: 'sup-fruit',
    shop: 'supermarket',
    label: 'Fresh fruit',
    priceCol: 0.004,
    hunger: 10,
    health: 1,
  }),
  more({
    id: 'sup-breakfast',
    shop: 'supermarket',
    label: 'Bread, eggs and milk',
    priceCol: 0.005,
    hunger: 15,
  }),
  more({
    id: 'sup-coffee',
    shop: 'supermarket',
    label: 'Coffee and tea',
    priceCol: 0.006,
    energy: 5,
  }),
  more({
    id: 'sup-drinks',
    shop: 'supermarket',
    label: 'Soft drinks multipack',
    priceCol: 0.005,
    hunger: 4,
    energy: 2,
  }),
  more({
    id: 'sup-toiletries',
    shop: 'supermarket',
    label: 'Toiletries',
    priceCol: 0.006,
    hygiene: 15,
  }),
  more({
    id: 'sup-cleaning',
    shop: 'supermarket',
    label: 'Cleaning supplies',
    priceCol: 0.007,
    hygiene: 10,
  }),
  more({
    id: 'fc-pizza',
    shop: 'foodcourt',
    label: 'Pizza slice and a drink',
    priceCol: 0.006,
    hunger: 30,
    fun: 2,
  }),
  more({
    id: 'fc-noodles',
    shop: 'foodcourt',
    label: 'Stir-fried noodles',
    priceCol: 0.006,
    hunger: 32,
    fun: 1,
  }),
  more({
    id: 'fc-chicken',
    shop: 'foodcourt',
    label: 'Fried chicken and chips',
    priceCol: 0.007,
    hunger: 35,
    fun: 2,
  }),
  more({
    id: 'fc-icecream',
    shop: 'foodcourt',
    label: 'Ice cream',
    priceCol: 0.003,
    hunger: 6,
    fun: 5,
  }),
  more({
    id: 'fc-coffee',
    shop: 'foodcourt',
    label: 'Coffee and a pastry',
    priceCol: 0.004,
    hunger: 8,
    energy: 6,
  }),
  more({
    id: 'fc-shawarma',
    shop: 'foodcourt',
    label: 'Shawarma wrap',
    priceCol: 0.005,
    hunger: 28,
    fun: 1,
  }),
  more({
    id: 'film-3d',
    shop: 'cinema',
    label: 'A 3D film',
    priceCol: 0.018,
    fun: 21,
    stress: -4,
    hours: 2.5,
  }),
  more({
    id: 'film-double',
    shop: 'cinema',
    label: 'A double bill',
    priceCol: 0.022,
    fun: 30,
    stress: -6,
    hours: 5,
  }),
  more({
    id: 'popcorn',
    shop: 'cinema',
    label: 'Popcorn and a fizzy drink',
    priceCol: 0.004,
    hunger: 8,
    fun: 3,
  }),

  // ---- Value fashion: everyday clothes for less.
  more({ id: 'out-tee', shop: 'outlet', label: 'Basic T-shirt', priceCol: 0.006, topStyle: 'tee' }),
  more({
    id: 'out-shirt',
    shop: 'outlet',
    label: 'Cotton shirt',
    priceCol: 0.012,
    topStyle: 'shirt',
  }),
  more({
    id: 'out-hoodie',
    shop: 'outlet',
    label: 'Everyday hoodie',
    priceCol: 0.014,
    topStyle: 'hoodie',
  }),
  more({
    id: 'out-dress',
    shop: 'outlet',
    label: 'Summer dress',
    priceCol: 0.016,
    topStyle: 'dress',
  }),
  more({ id: 'out-cap', shop: 'outlet', label: 'Baseball cap', priceCol: 0.004, headwear: 'cap' }),
  more({
    id: 'out-beanie',
    shop: 'outlet',
    label: 'Knit beanie',
    priceCol: 0.004,
    headwear: 'beanie',
  }),
  more({
    id: 'out-socks',
    shop: 'outlet',
    label: 'Pack of socks',
    priceCol: 0.003,
    keep: 'clothes',
    worn: { slot: 'socks', style: 'plain' },
  }),
  more({
    id: 'out-jeans',
    shop: 'outlet',
    label: 'Value jeans',
    priceCol: 0.012,
    keep: 'clothes',
    worn: { slot: 'legs', style: 'jeans' },
  }),
  more({
    id: 'out-tote',
    shop: 'outlet',
    label: 'Canvas tote bag',
    priceCol: 0.004,
    keep: 'bag',
    worn: { slot: 'bag', style: 'tote' },
  }),

  // ---- The designer boutique.
  more({
    id: 'des-blazer',
    shop: 'designer',
    label: 'Tailored designer blazer',
    priceCol: 0.22,
    usd: 450,
    topStyle: 'blazer',
  }),
  more({
    id: 'des-dress',
    shop: 'designer',
    label: 'Silk evening dress',
    priceCol: 0.2,
    usd: 400,
    topStyle: 'dress',
  }),
  more({
    id: 'des-kaftan',
    shop: 'designer',
    label: 'Embroidered agbada',
    priceCol: 0.18,
    topStyle: 'kaftan',
  }),
  more({
    id: 'des-shirt',
    shop: 'designer',
    label: 'Designer shirt',
    priceCol: 0.08,
    usd: 160,
    topStyle: 'shirt',
  }),
  more({
    id: 'des-shades',
    shop: 'designer',
    label: 'Designer sunglasses',
    priceCol: 0.07,
    usd: 220,
    glasses: 'shades',
  }),
  more({
    id: 'des-frames',
    shop: 'designer',
    label: 'Designer frames',
    priceCol: 0.06,
    usd: 180,
    glasses: 'square',
  }),
  more({
    id: 'des-headwrap',
    shop: 'designer',
    label: 'Silk headwrap',
    priceCol: 0.04,
    headwear: 'headwrap',
  }),
  more({
    id: 'des-gele',
    shop: 'designer',
    label: 'Aso-oke gele',
    priceCol: 0.05,
    headwear: 'gele',
  }),
  more({
    id: 'des-bag',
    shop: 'designer',
    label: 'Leather handbag',
    priceCol: 0.25,
    usd: 900,
    keep: 'bag',
    worn: { slot: 'bag', style: 'handbag' },
    fun: 6,
  }),
  more({
    id: 'des-scarf',
    shop: 'designer',
    label: 'Silk scarf',
    priceCol: 0.05,
    usd: 150,
    keep: 'clothes',
    worn: { slot: 'scarf', style: 'silk' },
  }),

  // ---- Shoes.
  more({
    id: 'shoe-flipflops',
    shop: 'shoes',
    label: 'Flip-flops',
    priceCol: 0.004,
    keep: 'shoes',
    worn: { slot: 'shoes', style: 'flipflops' },
  }),
  more({
    id: 'shoe-sandals',
    shop: 'shoes',
    label: 'Leather sandals',
    priceCol: 0.015,
    keep: 'shoes',
    worn: { slot: 'shoes', style: 'sandals' },
  }),
  more({
    id: 'shoe-trainers',
    shop: 'shoes',
    label: 'Trainers',
    priceCol: 0.03,
    keep: 'shoes',
    worn: { slot: 'shoes', style: 'trainers' },
    fun: 3,
  }),
  more({
    id: 'shoe-running',
    shop: 'shoes',
    label: 'Running shoes',
    priceCol: 0.045,
    keep: 'shoes',
    worn: { slot: 'shoes', style: 'running' },
    health: 1,
  }),
  more({
    id: 'shoe-loafers',
    shop: 'shoes',
    label: 'Leather loafers',
    priceCol: 0.05,
    keep: 'shoes',
    worn: { slot: 'shoes', style: 'loafers' },
  }),
  more({
    id: 'shoe-heels',
    shop: 'shoes',
    label: 'Heels',
    priceCol: 0.045,
    keep: 'shoes',
    worn: { slot: 'shoes', style: 'heels' },
  }),
  more({
    id: 'shoe-boots',
    shop: 'shoes',
    label: 'Ankle boots',
    priceCol: 0.06,
    keep: 'shoes',
    worn: { slot: 'shoes', style: 'boots' },
  }),
  more({
    id: 'shoe-designer',
    shop: 'shoes',
    label: 'Designer sneakers',
    priceCol: 0.15,
    usd: 350,
    keep: 'shoes',
    worn: { slot: 'shoes', style: 'sneakers' },
    fun: 5,
  }),

  // ---- Jewellery and watches.
  more({
    id: 'jew-bracelet',
    shop: 'jewellery',
    label: 'Beaded bracelet',
    priceCol: 0.008,
    keep: 'jewellery',
    worn: { slot: 'bracelet', style: 'beaded' },
  }),
  more({
    id: 'jew-studs',
    shop: 'jewellery',
    label: 'Silver stud earrings',
    priceCol: 0.02,
    usd: 45,
    keep: 'jewellery',
    worn: { slot: 'earrings', style: 'studs' },
  }),
  more({
    id: 'jew-necklace',
    shop: 'jewellery',
    label: 'Silver necklace',
    priceCol: 0.04,
    usd: 90,
    keep: 'jewellery',
    worn: { slot: 'necklace', style: 'silver' },
  }),
  more({
    id: 'jew-cufflinks',
    shop: 'jewellery',
    label: 'Cufflinks',
    priceCol: 0.03,
    usd: 70,
    keep: 'jewellery',
    worn: { slot: 'cufflinks', style: 'silver' },
  }),
  more({
    id: 'jew-watch',
    shop: 'jewellery',
    label: 'Everyday watch',
    priceCol: 0.04,
    usd: 80,
    keep: 'watch',
    worn: { slot: 'watch', style: 'everyday' },
  }),
  more({
    id: 'jew-dress-watch',
    shop: 'jewellery',
    label: 'Dress watch',
    priceCol: 0.3,
    usd: 650,
    keep: 'watch',
    worn: { slot: 'watch', style: 'dress' },
    fun: 5,
  }),
  more({
    id: 'jew-gold-chain',
    shop: 'jewellery',
    label: 'Gold chain',
    priceCol: 0.4,
    usd: 1200,
    keep: 'jewellery',
    worn: { slot: 'necklace', style: 'gold' },
    fun: 6,
  }),
  more({
    id: 'jew-ring',
    shop: 'jewellery',
    label: 'Diamond ring',
    priceCol: 1.2,
    usd: 3000,
    keep: 'jewellery',
    worn: { slot: 'ring', style: 'diamond' },
    fun: 8,
  }),
  more({
    id: 'jew-luxury-watch',
    shop: 'jewellery',
    label: 'Luxury Swiss watch',
    priceCol: 3,
    usd: 9000,
    keep: 'watch',
    worn: { slot: 'watch', style: 'luxury' },
    fun: 10,
  }),

  // ---- Beauty and fragrance.
  more({
    id: 'bty-soap',
    shop: 'beauty',
    label: 'Shower gel and soap',
    priceCol: 0.003,
    keep: 'beauty',
    hygiene: 15,
  }),
  more({
    id: 'bty-haircare',
    shop: 'beauty',
    label: 'Hair care kit',
    priceCol: 0.012,
    keep: 'beauty',
    hygiene: 10,
  }),
  more({
    id: 'bty-grooming',
    shop: 'beauty',
    label: 'Grooming kit',
    priceCol: 0.015,
    keep: 'beauty',
    hygiene: 15,
  }),
  more({
    id: 'bty-skincare',
    shop: 'beauty',
    label: 'Skincare set',
    priceCol: 0.02,
    keep: 'beauty',
    hygiene: 20,
  }),
  more({
    id: 'bty-lipstick',
    shop: 'beauty',
    label: 'Lipstick',
    priceCol: 0.008,
    keep: 'beauty',
    fun: 2,
  }),
  more({
    id: 'bty-makeup',
    shop: 'beauty',
    label: 'Make-up palette',
    priceCol: 0.025,
    keep: 'beauty',
    fun: 3,
  }),
  more({
    id: 'bty-cologne',
    shop: 'beauty',
    label: 'Cologne',
    priceCol: 0.05,
    usd: 85,
    keep: 'beauty',
    fun: 4,
  }),
  more({
    id: 'bty-perfume',
    shop: 'beauty',
    label: 'Perfume',
    priceCol: 0.06,
    usd: 95,
    keep: 'beauty',
    fun: 4,
  }),
  more({
    id: 'bty-luxury',
    shop: 'beauty',
    label: 'Luxury fragrance',
    priceCol: 0.15,
    usd: 260,
    keep: 'beauty',
    fun: 6,
  }),

  // ---- Books.
  more({
    id: 'book-magazine',
    shop: 'books',
    label: 'Magazine',
    priceCol: 0.002,
    keep: 'book',
    fun: 2,
  }),
  more({
    id: 'book-notebook',
    shop: 'books',
    label: 'Notebook and pen',
    priceCol: 0.003,
    keep: 'book',
  }),
  more({
    id: 'book-kids',
    shop: 'books',
    label: 'Children’s picture book',
    priceCol: 0.005,
    keep: 'book',
    fun: 3,
  }),
  more({
    id: 'book-novel',
    shop: 'books',
    label: 'Paperback novel',
    priceCol: 0.006,
    keep: 'book',
    fun: 6,
    stress: -2,
  }),
  more({
    id: 'book-business',
    shop: 'books',
    label: 'Business bestseller',
    priceCol: 0.01,
    keep: 'book',
    fun: 3,
  }),
  more({
    id: 'book-biography',
    shop: 'books',
    label: 'Founder biography',
    priceCol: 0.012,
    keep: 'book',
    fun: 4,
  }),
  more({
    id: 'book-cookbook',
    shop: 'books',
    label: 'Cookbook',
    priceCol: 0.015,
    keep: 'book',
    fun: 3,
  }),
  more({
    id: 'book-photo',
    shop: 'books',
    label: 'Coffee-table photo book',
    priceCol: 0.03,
    keep: 'book',
    fun: 4,
  }),
  more({
    id: 'book-ereader',
    shop: 'books',
    label: 'E-reader',
    priceCol: 0.06,
    usd: 130,
    keep: 'gadget',
    fun: 6,
    stress: -2,
  }),

  // ---- Sports.
  more({ id: 'spt-jersey', shop: 'sports', label: 'Team jersey', priceCol: 0.03, topStyle: 'tee' }),
  more({
    id: 'spt-tracksuit',
    shop: 'sports',
    label: 'Tracksuit top',
    priceCol: 0.035,
    topStyle: 'hoodie',
  }),
  more({
    id: 'spt-bottle',
    shop: 'sports',
    label: 'Water bottle',
    priceCol: 0.003,
    keep: 'sports',
  }),
  more({
    id: 'spt-football',
    shop: 'sports',
    label: 'Match football',
    priceCol: 0.008,
    keep: 'sports',
    fun: 4,
  }),
  more({
    id: 'spt-yoga',
    shop: 'sports',
    label: 'Yoga mat',
    priceCol: 0.01,
    keep: 'sports',
    health: 2,
    stress: -2,
  }),
  more({
    id: 'spt-dumbbells',
    shop: 'sports',
    label: 'Dumbbells',
    priceCol: 0.025,
    keep: 'sports',
    health: 2,
  }),
  more({
    id: 'spt-gymbag',
    shop: 'sports',
    label: 'Gym bag',
    priceCol: 0.02,
    keep: 'bag',
    worn: { slot: 'bag', style: 'gymbag' },
  }),
  more({
    id: 'spt-racket',
    shop: 'sports',
    label: 'Tennis racket',
    priceCol: 0.04,
    usd: 90,
    keep: 'sports',
    fun: 4,
  }),
  more({
    id: 'spt-bike',
    shop: 'sports',
    label: 'Bicycle',
    priceCol: 0.25,
    usd: 400,
    keep: 'sports',
    health: 3,
    fun: 6,
  }),

  // ---- Toys and gifts.
  more({
    id: 'toy-card',
    shop: 'toys',
    label: 'Greeting card',
    priceCol: 0.002,
    keep: 'toy',
    fun: 1,
  }),
  more({
    id: 'toy-chocolates',
    shop: 'toys',
    label: 'Box of chocolates',
    priceCol: 0.006,
    keep: 'sweets',
    hunger: 5,
    fun: 4,
  }),
  more({
    id: 'toy-puzzle',
    shop: 'toys',
    label: 'Jigsaw puzzle',
    priceCol: 0.008,
    keep: 'toy',
    fun: 4,
    stress: -1,
  }),
  more({
    id: 'toy-flowers',
    shop: 'toys',
    label: 'Bouquet of flowers',
    priceCol: 0.01,
    keep: 'flowers',
    fun: 4,
  }),
  more({
    id: 'toy-teddy',
    shop: 'toys',
    label: 'Teddy bear',
    priceCol: 0.012,
    keep: 'toy',
    fun: 4,
  }),
  more({
    id: 'toy-boardgame',
    shop: 'toys',
    label: 'Board game',
    priceCol: 0.02,
    keep: 'toy',
    fun: 6,
  }),
  more({
    id: 'toy-rc-car',
    shop: 'toys',
    label: 'Remote-control car',
    priceCol: 0.03,
    keep: 'toy',
    fun: 6,
  }),
  more({
    id: 'toy-blocks',
    shop: 'toys',
    label: 'Building blocks set',
    priceCol: 0.035,
    keep: 'toy',
    fun: 6,
  }),
  more({
    id: 'toy-hamper',
    shop: 'toys',
    label: 'Gift hamper',
    priceCol: 0.05,
    keep: 'sweets',
    hunger: 10,
    fun: 6,
  }),

  // ---- The pharmacy.
  more({
    id: 'ph-sanitiser',
    shop: 'pharmacy',
    label: 'Hand sanitiser',
    priceCol: 0.002,
    hygiene: 5,
  }),
  more({
    id: 'ph-painkillers',
    shop: 'pharmacy',
    label: 'Painkillers',
    priceCol: 0.002,
    health: 1,
    stress: -1,
  }),
  more({ id: 'ph-energy', shop: 'pharmacy', label: 'Energy drink', priceCol: 0.002, energy: 6 }),
  more({
    id: 'ph-toothcare',
    shop: 'pharmacy',
    label: 'Toothbrush and toothpaste',
    priceCol: 0.003,
    hygiene: 10,
  }),
  more({
    id: 'ph-sleep',
    shop: 'pharmacy',
    label: 'Herbal sleep aid',
    priceCol: 0.004,
    stress: -3,
  }),
  more({ id: 'ph-vitamins', shop: 'pharmacy', label: 'Multivitamins', priceCol: 0.006, health: 3 }),
  more({
    id: 'ph-sunscreen',
    shop: 'pharmacy',
    label: 'Sunscreen',
    priceCol: 0.006,
    keep: 'beauty',
    health: 1,
  }),
  more({
    id: 'ph-firstaid',
    shop: 'pharmacy',
    label: 'First-aid kit',
    priceCol: 0.01,
    keep: 'sports',
  }),

  // ---- The arcade.
  more({
    id: 'arc-airhockey',
    shop: 'arcade',
    label: 'A game of air hockey',
    priceCol: 0.002,
    fun: 6,
    hours: 0.25,
  }),
  more({
    id: 'arc-claw',
    shop: 'arcade',
    label: 'Claw machine prize',
    priceCol: 0.003,
    keep: 'toy',
    fun: 5,
  }),
  more({
    id: 'arc-tokens',
    shop: 'arcade',
    label: 'Arcade tokens',
    priceCol: 0.004,
    fun: 10,
    hours: 0.5,
  }),
  more({
    id: 'arc-karaoke',
    shop: 'arcade',
    label: 'Karaoke booth',
    priceCol: 0.008,
    fun: 12,
    stress: -3,
    hours: 1,
  }),
  more({
    id: 'arc-bowling',
    shop: 'arcade',
    label: 'A lane of bowling',
    priceCol: 0.01,
    fun: 14,
    stress: -3,
    hours: 1,
  }),
  more({
    id: 'arc-vr',
    shop: 'arcade',
    label: 'VR experience',
    priceCol: 0.012,
    fun: 16,
    stress: -2,
    hours: 0.5,
  }),
];

const MALL_BY_ID = new Map(MALL_ITEMS.map((x) => [x.id, x]));
export const mallItem = (id: string) => MALL_BY_ID.get(id);

/** Whether a thing can be bought for a friend (not furniture for your home, not an outing that takes hours). */
export const giftable = (x: MallItem) => !x.furnitureId && !x.hours;

/** Clothes and accessories: what you wear. */
export const wearable = (x: MallItem) => !!(x.topStyle || x.headwear || x.glasses);

/** Everything that goes in your wardrobe: clothes and accessories, and the things you keep that you wear. */
export const forWardrobe = (x: MallItem) => wearable(x) || !!x.worn;

/** Shopping together (malltrips.ts): what an outing to the mall with a friend does. */
export const MALL_TRIP = {
  /** Social and fun for both of you when you meet there. */
  social: 18,
  fun: 10,
  /** The relationship: both contacts' warmth, and trust. */
  warmth: 0.12,
  trust: 0.03,
  /** Stress eased (life bars) for each of you. */
  stress: -4,
  /** A gift: their fun and social and yours, and warmth on top (more for a bigger gift, capped). */
  giftFun: 8,
  giftSocial: 6,
  giverSocial: 4,
  giftWarmth: 0.05,
  giftWarmthMax: 0.15,
  giftTrust: 0.01,
  /** Invitations you can send a month; gifts on one outing. */
  invitesPerMonth: 8,
  giftsPerTrip: 12,
  /** Things kept in your bag (the oldest go when it's full). */
  bagMax: 80,
  /**
   * Things in your wardrobe (wardrobe.ts): their own list, so a bag full of
   * sweets never pushes out your shoes. Every item in every colour fits.
   */
  wardrobeMax: 400,
} as const;
