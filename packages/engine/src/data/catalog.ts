/**
 * The catalogue (player feedback: "a catalogue so I can actually see the
 * items … different options and pricing on each item", and "shopping online
 * rather than going to the shop each time"). Released with SHOP_NOTE.
 *
 * Every thing the shops sell is a catalogue entry: the lifestyle shop's
 * furniture and appliances (one entry per slot, its quality tiers as
 * variants), the mall's things (phones and the weekly shop grouped by tier),
 * the car dealers' models, and walls and dividers for your home. An entry has
 * variants (a different thing: a tier, a size, a wall's length; each its own
 * base price, from the shops' own prices) and option groups (a finish, a
 * fabric, a warranty, a brand …), each option a price factor in thousandths.
 * Prices are worked out in the engine (catalog.ts `withOptions`), so they are
 * deterministic and the same in the shop and online.
 *
 * Online, a category has delivery terms: a fee (a share of the price, with a
 * floor in cost-of-living units) and a wait in real seconds, standard or
 * express (twice the fee, a shorter wait). Things you do there (the food
 * court, a film, the arcade) aren't sold online.
 */
import { ensure } from '../errors.js';
import { FURNITURE_SLOTS, SHOP_KINDS_FOR_SLOT, type FurnitureSlot } from './lifestyle-shop.js';
import { MALL_ITEMS, type MallItem, type MallShopId } from './mall.js';

export type CatalogCategory =
  | 'home'
  | 'appliances'
  | 'electronics'
  | 'fashion'
  | 'beauty'
  | 'groceries'
  | 'books'
  | 'sports'
  | 'cars'
  | 'walls';

/** Filter order in the catalogue. */
export const CATALOG_CATEGORIES: readonly CatalogCategory[] = [
  'home',
  'walls',
  'appliances',
  'electronics',
  'fashion',
  'beauty',
  'groceries',
  'books',
  'sports',
  'cars',
];

/** Translatable category names. */
export const CATEGORY_LABEL: Record<CatalogCategory, string> = {
  home: 'Home & furniture',
  walls: 'Walls & dividers',
  appliances: 'Appliances',
  electronics: 'Electronics',
  fashion: 'Fashion',
  beauty: 'Health & beauty',
  groceries: 'Groceries',
  books: 'Books & toys',
  sports: 'Sports',
  cars: 'Cars',
};

export interface CatalogOption {
  id: string;
  /** Translatable. */
  label: string;
  /** Price factor in thousandths (1000 = the base price). */
  permille: number;
  /** A colour to show (and to paint the thing in 3D), when it is one. */
  swatch?: string;
}

export type OptionGroupId =
  'finish' | 'warranty' | 'fabric' | 'edition' | 'brand' | 'format' | 'wrap' | 'paint' | 'trim';

export interface OptionGroup {
  id: OptionGroupId;
  /** Translatable. */
  label: string;
  /** The first option is the default. */
  options: CatalogOption[];
}

const g = (id: OptionGroupId, label: string, options: CatalogOption[]): OptionGroup => ({
  id,
  label,
  options,
});

/** Option groups, by what they're for. */
export const OPTION_GROUPS = {
  woodFinish: g('finish', 'Finish', [
    { id: 'oak', label: 'Light oak', permille: 1000, swatch: '#c99a66' },
    { id: 'white', label: 'White', permille: 1000, swatch: '#eeeae2' },
    { id: 'black', label: 'Black ash', permille: 1080, swatch: '#2b2a28' },
    { id: 'walnut', label: 'Walnut', permille: 1150, swatch: '#6b4428' },
    { id: 'green', label: 'Forest velvet', permille: 1200, swatch: '#1f6e52' },
  ]),
  warranty: g('warranty', 'Warranty', [
    { id: 'w1', label: '1 year (included)', permille: 1000 },
    { id: 'w3', label: '3 years', permille: 1080 },
    { id: 'w5', label: '5 years', permille: 1150 },
  ]),
  fabric: g('fabric', 'Fabric', [
    { id: 'standard', label: 'Standard', permille: 1000 },
    { id: 'organic', label: 'Organic cotton', permille: 1300 },
    { id: 'premium', label: 'Premium, tailored', permille: 1800 },
  ]),
  edition: g('edition', 'Edition', [
    { id: 'standard', label: 'Standard', permille: 1000 },
    { id: 'limited', label: 'Limited edition', permille: 1500 },
  ]),
  brand: g('brand', 'Brand', [
    { id: 'usual', label: 'The usual brand', permille: 1000 },
    { id: 'store', label: 'Store’s own', permille: 850 },
    { id: 'premium', label: 'Premium brand', permille: 1300 },
  ]),
  format: g('format', 'Format', [
    { id: 'paperback', label: 'Paperback', permille: 1000 },
    { id: 'hardback', label: 'Hardback', permille: 1600 },
    { id: 'signed', label: 'Signed copy', permille: 2500 },
  ]),
  wrap: g('wrap', 'Gift wrap', [
    { id: 'none', label: 'No wrapping', permille: 1000 },
    { id: 'wrapped', label: 'Gift-wrapped', permille: 1050 },
  ]),
  paint: g('paint', 'Paint', [
    { id: 'white', label: 'Solid white', permille: 1000, swatch: '#f2f2ef' },
    { id: 'black', label: 'Solid black', permille: 1000, swatch: '#1c1d20' },
    { id: 'silver', label: 'Metallic silver', permille: 1030, swatch: '#b9bec4' },
    { id: 'blue', label: 'Metallic blue', permille: 1030, swatch: '#2b4f8c' },
    { id: 'red', label: 'Pearl red', permille: 1060, swatch: '#a3242c' },
  ]),
  trim: g('trim', 'Trim', [
    { id: 'standard', label: 'Standard', permille: 1000 },
    { id: 'sport', label: 'Sport', permille: 1120 },
    { id: 'premium', label: 'Premium leather', permille: 1250 },
  ]),
  wallPaint: g('finish', 'Finish', [
    { id: 'white', label: 'Painted white', permille: 1000, swatch: '#f1ede4' },
    { id: 'sage', label: 'Sage green', permille: 1000, swatch: '#9fb59a' },
    { id: 'clay', label: 'Terracotta', permille: 1000, swatch: '#c47a5a' },
    { id: 'charcoal', label: 'Charcoal', permille: 1050, swatch: '#3b3d40' },
    { id: 'timber', label: 'Timber-clad', permille: 1400, swatch: '#b07a48' },
  ]),
  glass: g('finish', 'Glass', [
    { id: 'clear', label: 'Clear glass', permille: 1000, swatch: '#cfe8f0' },
    { id: 'frosted', label: 'Frosted', permille: 1150, swatch: '#e8eef0' },
    { id: 'framed', label: 'Black-framed', permille: 1250, swatch: '#22262a' },
  ]),
  screen: g('finish', 'Panels', [
    { id: 'paper', label: 'Paper screen', permille: 1000, swatch: '#f3ead6' },
    { id: 'slats', label: 'Oak slats', permille: 1200, swatch: '#c99a66' },
    { id: 'glass', label: 'Sliding glass', permille: 1350, swatch: '#cfe8f0' },
  ]),
  shelf: g('finish', 'Wood', [
    { id: 'oak', label: 'Light oak', permille: 1000, swatch: '#c99a66' },
    { id: 'white', label: 'White', permille: 1000, swatch: '#eeeae2' },
    { id: 'walnut', label: 'Walnut', permille: 1200, swatch: '#6b4428' },
  ]),
} as const satisfies Record<string, OptionGroup>;

// ---------------------------------------------------------------- Walls and dividers

export type WallKind = 'full' | 'half' | 'glass' | 'sliding' | 'bookshelf';
export const WALL_KINDS: readonly WallKind[] = ['full', 'half', 'glass', 'sliding', 'bookshelf'];

export interface WallSpec {
  kind: WallKind;
  /** Translatable. */
  label: string;
  /** Translatable: one line for the catalogue. */
  blurb: string;
  /** Price per tile of length, in cost-of-living units. */
  priceCol: number;
  /** You can walk through it (a sliding door or screen). */
  passable: boolean;
  finish: OptionGroup;
}

export const WALLS: Record<WallKind, WallSpec> = {
  full: {
    kind: 'full',
    label: 'Full wall',
    blurb: 'A floor-to-ceiling stud wall, plastered and painted.',
    priceCol: 0.03,
    passable: false,
    finish: OPTION_GROUPS.wallPaint,
  },
  half: {
    kind: 'half',
    label: 'Half wall',
    blurb: 'A waist-high partition: rooms that still feel open.',
    priceCol: 0.018,
    passable: false,
    finish: OPTION_GROUPS.wallPaint,
  },
  glass: {
    kind: 'glass',
    label: 'Glass divider',
    blurb: 'A glass partition: a room of its own, the light still through.',
    priceCol: 0.06,
    passable: false,
    finish: OPTION_GROUPS.glass,
  },
  sliding: {
    kind: 'sliding',
    label: 'Sliding door or screen',
    blurb: 'Slides open to walk through, closes for privacy.',
    priceCol: 0.07,
    passable: true,
    finish: OPTION_GROUPS.screen,
  },
  bookshelf: {
    kind: 'bookshelf',
    label: 'Bookshelf divider',
    blurb: 'Open shelves both sides: a divider that holds your books.',
    priceCol: 0.05,
    passable: false,
    finish: OPTION_GROUPS.shelf,
  },
};

/** Lengths a wall comes in (tiles; a tile is a metre). */
export const WALL_LENGTHS = [1, 2, 3, 4] as const;
/** Most walls and dividers one home can have. */
export const WALLS_MAX = 24;
/** Most room names. */
export const ROOM_LABELS_MAX = 16;
/** Share of the price you get back selling a wall. */
export const WALL_SELL_BACK = 0.4;
/** Business kinds that sell walls in person. */
export const WALL_SHOP_KINDS: readonly string[] = ['furniture-store'];

// ---------------------------------------------------------------- Delivery

export interface DeliveryTerms {
  /** Fee as a share of the price. */
  rate: number;
  /** The least a delivery costs (cost-of-living units). */
  minCol: number;
  /** Real seconds until it's at your door: standard and express. */
  standardS: number;
  expressS: number;
}

/** Express costs this many times the standard fee. */
export const EXPRESS_FEE = 2;

export const DELIVERY_TERMS: Record<CatalogCategory, DeliveryTerms> = {
  groceries: { rate: 0.05, minCol: 0.002, standardS: 45, expressS: 20 },
  beauty: { rate: 0.05, minCol: 0.002, standardS: 60, expressS: 25 },
  fashion: { rate: 0.04, minCol: 0.002, standardS: 60, expressS: 25 },
  books: { rate: 0.04, minCol: 0.002, standardS: 60, expressS: 25 },
  sports: { rate: 0.04, minCol: 0.003, standardS: 60, expressS: 25 },
  electronics: { rate: 0.03, minCol: 0.004, standardS: 60, expressS: 30 },
  home: { rate: 0.06, minCol: 0.008, standardS: 90, expressS: 40 },
  appliances: { rate: 0.06, minCol: 0.008, standardS: 90, expressS: 40 },
  walls: { rate: 0.06, minCol: 0.008, standardS: 90, expressS: 40 },
  cars: { rate: 0.01, minCol: 0.05, standardS: 180, expressS: 90 },
};

export type DeliverySpeed = 'standard' | 'express';

/**
 * The delivery fee for a thing of this price (minor units): the category's
 * share of the price, at least its floor (`minFee`: `minCol` in the city's
 * money); express is `EXPRESS_FEE` times that. The client shows the same sum.
 */
export function deliveryFee(
  category: CatalogCategory,
  price: number,
  minFee: number,
  speed: DeliverySpeed,
): number {
  const std = Math.max(minFee, Math.round(price * DELIVERY_TERMS[category].rate));
  return speed === 'express' ? std * EXPRESS_FEE : std;
}

/** How long it takes (ms). */
export const deliveryMs = (category: CatalogCategory, speed: DeliverySpeed): number =>
  (speed === 'express' ? DELIVERY_TERMS[category].expressS : DELIVERY_TERMS[category].standardS) *
  1000;

// ---------------------------------------------------------------- Entries

export type EntrySource = 'furniture' | 'mall' | 'car' | 'wall';

export interface CatalogVariantSpec {
  /** The engine item it is: a furniture id ('sofa-2'), a mall item, a car model, a wall length. */
  ref: string;
  /** Translatable (a furniture tier's own name; a length). */
  label?: string;
  /** A quality tier, 1–3, when it has one. */
  tier?: number;
}

export interface CatalogEntrySpec {
  /** 'furn:sofa', 'mall:top-tee', 'car:hatchback', 'wall:glass'. */
  id: string;
  source: EntrySource;
  category: CatalogCategory;
  variants: CatalogVariantSpec[];
  groups: OptionGroup[];
  /** Mall shops it's sold in (in person), for the mall's catalogue. */
  shops?: MallShopId[];
}

const APPLIANCE_SLOTS = new Set<FurnitureSlot>([
  'kitchen',
  'fridge',
  'washer',
  'cooling',
  'power',
  'coffee',
]);

/** The category of a furniture slot. */
export function slotCategory(slot: FurnitureSlot): CatalogCategory {
  if (APPLIANCE_SLOTS.has(slot)) return 'appliances';
  if (SHOP_KINDS_FOR_SLOT[slot].includes('furniture-store')) return 'home';
  return 'electronics';
}

const SHOP_CATEGORY: Partial<Record<MallShopId, CatalogCategory>> = {
  fashion: 'fashion',
  outlet: 'fashion',
  designer: 'fashion',
  shoes: 'fashion',
  suits: 'fashion',
  jewellery: 'fashion',
  phones: 'electronics',
  home: 'home',
  supermarket: 'groceries',
  beauty: 'beauty',
  pharmacy: 'beauty',
  books: 'books',
  toys: 'books',
  sports: 'sports',
};

/** Things you do there, not things you take home: never online, not in the catalogue. */
export const inPersonOnly = (x: MallItem): boolean =>
  !!x.hours || !SHOP_CATEGORY[x.shop] || x.shop === 'foodcourt';

/** The mall item's category, or null (the food court, a film, the arcade). */
export function mallCategory(x: MallItem): CatalogCategory | null {
  if (inPersonOnly(x)) return null;
  if (x.furnitureId) return null; // sold as the furniture entry
  return SHOP_CATEGORY[x.shop] ?? null;
}

/** The option group for a mall item. */
export function mallGroups(x: MallItem): OptionGroup[] {
  if (x.topStyle || x.headwear || x.glasses) return [OPTION_GROUPS.fabric];
  if (x.phone || x.keep === 'gadget') return [OPTION_GROUPS.warranty];
  if (x.worn) return [OPTION_GROUPS.edition];
  if (x.keep === 'book') return [OPTION_GROUPS.format];
  if (x.keep) return [OPTION_GROUPS.wrap];
  return [OPTION_GROUPS.brand];
}

/** Mall items grouped into one entry, as tiers or sizes (the rest are an entry each). */
const MALL_GROUPS: { id: string; refs: string[] }[] = [
  { id: 'phone', refs: ['phone-1', 'phone-2', 'phone-3'] },
  { id: 'groceries', refs: ['groceries', 'groceries-week'] },
];

function buildEntries(): CatalogEntrySpec[] {
  const out: CatalogEntrySpec[] = [];
  for (const slot of FURNITURE_SLOTS) {
    const category = slotCategory(slot);
    out.push({
      id: `furn:${slot}`,
      source: 'furniture',
      category,
      variants: [1, 2, 3].map((tier) => ({ ref: `${slot}-${tier}`, tier })),
      groups: [category === 'home' ? OPTION_GROUPS.woodFinish : OPTION_GROUPS.warranty],
      shops: MALL_ITEMS.filter((x) => x.furnitureId?.startsWith(`${slot}-`)).map((x) => x.shop),
    });
  }
  for (const wall of WALL_KINDS)
    out.push({
      id: `wall:${wall}`,
      source: 'wall',
      category: 'walls',
      variants: WALL_LENGTHS.map((n) => ({ ref: String(n) })),
      groups: [WALLS[wall].finish],
    });
  const grouped = new Set(MALL_GROUPS.flatMap((x) => x.refs));
  for (const grp of MALL_GROUPS) {
    const first = MALL_ITEMS.find((x) => x.id === grp.refs[0])!;
    out.push({
      id: `mall:${grp.id}`,
      source: 'mall',
      category: mallCategory(first)!,
      variants: grp.refs.map((ref, i) => ({ ref, tier: i + 1 })),
      groups: mallGroups(first),
      shops: [first.shop],
    });
  }
  for (const x of MALL_ITEMS) {
    if (grouped.has(x.id)) continue;
    const category = mallCategory(x);
    if (!category) continue;
    out.push({
      id: `mall:${x.id}`,
      source: 'mall',
      category,
      variants: [{ ref: x.id }],
      groups: mallGroups(x),
      shops: [x.shop],
    });
  }
  return out;
}

/** Every entry but the cars (those are per city: catalog.ts adds them). */
export const CATALOG_ENTRIES: readonly CatalogEntrySpec[] = buildEntries();

/** The car entry for a model (the same groups for every model). */
export const carEntry = (modelId: string): CatalogEntrySpec => ({
  id: `car:${modelId}`,
  source: 'car',
  category: 'cars',
  variants: [{ ref: modelId }],
  groups: [OPTION_GROUPS.paint, OPTION_GROUPS.trim],
});

/** Chosen options: group id → option id. */
export type ChosenOptions = Partial<Record<OptionGroupId, string>>;

/**
 * A price with options: each group's factor applied in turn (rounded to
 * whole minor units each time), missing groups at their first option.
 * Refused for a group the thing doesn't have or an option it doesn't come in.
 */
export function priceWithOptions(
  base: number,
  groups: readonly OptionGroup[],
  chosen: ChosenOptions = {},
): { price: number; chosen: ChosenOptions } {
  for (const k of Object.keys(chosen))
    ensure(
      groups.some((x) => x.id === k),
      'shop.option',
      'That doesn’t come with that option.',
    );
  let price = base;
  const out: ChosenOptions = {};
  for (const grp of groups) {
    const want = chosen[grp.id];
    const opt = want ? grp.options.find((o) => o.id === want) : grp.options[0];
    ensure(opt, 'shop.option', 'That option isn’t available.');
    out[grp.id] = opt.id;
    price = Math.round((price * opt.permille) / 1000);
  }
  return { price, chosen: out };
}

/** The swatch of a chosen finish or paint, if it has one. */
export function swatchOf(groups: readonly OptionGroup[], chosen: ChosenOptions): string | null {
  for (const grp of groups) {
    const id = chosen[grp.id];
    const o = grp.options.find((x) => x.id === id);
    if (o?.swatch && (grp.id === 'finish' || grp.id === 'paint')) return o.swatch;
  }
  return null;
}

/** Groups for a purchase by its source and ref (what the buy commands check options against). */
export function groupsFor(source: EntrySource, ref: string): OptionGroup[] {
  if (source === 'car') return carEntry(ref).groups;
  if (source === 'wall')
    return WALLS[ref as WallKind]?.finish ? [WALLS[ref as WallKind].finish] : [];
  if (source === 'furniture') {
    const slot = ref.replace(/-[123]$/, '') as FurnitureSlot;
    return [slotCategory(slot) === 'home' ? OPTION_GROUPS.woodFinish : OPTION_GROUPS.warranty];
  }
  const x = MALL_ITEMS.find((i) => i.id === ref);
  return x ? mallGroups(x) : [];
}
