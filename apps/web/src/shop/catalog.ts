/**
 * The catalogue the Shop app and the shops show (player feedback: "a
 * catalogue so I can actually see the items … different options and pricing
 * on each item"). Built from the engine's entries (data/catalog.ts: the same
 * variants, option groups and price factors the buy commands use) and the
 * prices in the view: online at home-city prices (`view.me.shop`), in a shop
 * at that shop's (the mall's items, the showroom's floor).
 *
 * Pure: no React, no three.js.
 */
import {
  CATALOG_CATEGORIES,
  CATALOG_ENTRIES,
  CATEGORY_LABEL,
  FURNITURE,
  MALL_ITEMS,
  PHONE_NAMES,
  WALLS,
  carEntry,
  deliveryFee,
  priceWithOptions,
  swatchOf,
  type CatalogCategory,
  type CatalogEntrySpec,
  type ChosenOptions,
  type DeliverySpeed,
  type MallItem,
  type MallShopId,
  type OptionGroup,
  type PlayerView,
  type WallKind,
} from '@runway/engine';
import { itemIcon } from '../city/mall/shops';

export interface CatVariant {
  /** The engine item: a furniture id, a mall item, a car model, a wall length. */
  ref: string;
  /** Untranslated (tx() it). */
  label: string;
  tier?: number;
  price: number;
  owned?: boolean;
}

export interface CatEntry {
  id: string;
  source: CatalogEntrySpec['source'];
  category: CatalogCategory;
  /** Untranslated (tx() it); furniture shows its slot's name instead. */
  label: string;
  slot?: string;
  /** A mall thing (its first variant): what it is, for its picture and its buy command. */
  mall?: MallItem;
  wall?: WallKind;
  variants: CatVariant[];
  groups: OptionGroup[];
  /** Running costs a month (a car). */
  monthlyCost?: number;
}

export type ShopView = NonNullable<PlayerView['me']['shop']>;

const furnitureLabel = (ref: string) => FURNITURE.find((f) => f.id === ref)?.label ?? ref;
const mallLabel = (ref: string) => MALL_ITEMS.find((x) => x.id === ref)?.label ?? ref;

/** One metre, two metres … (untranslated: the catalogue translates '{n} m'). */
export const wallLengthLabel = (n: number | string) => `${n} m`;

function entryLabel(e: CatalogEntrySpec): string {
  if (e.id === 'mall:phone') return 'Smartphone';
  if (e.id === 'mall:groceries') return 'Groceries';
  if (e.source === 'wall') return WALLS[e.id.slice(5) as WallKind].label;
  if (e.source === 'mall') return mallLabel(e.variants[0]!.ref);
  return e.id.slice(5);
}

function variantLabel(e: CatalogEntrySpec, ref: string): string {
  if (e.source === 'furniture') return furnitureLabel(ref);
  if (e.source === 'wall') return wallLengthLabel(ref);
  if (e.id === 'mall:phone') return PHONE_NAMES[Number(ref.slice(6)) as 1 | 2 | 3];
  return mallLabel(ref);
}

/** Owned already (furniture of that tier, the phone you have, a car in your garage). */
function ownedOf(view: PlayerView) {
  const home = new Set((view.me.home?.items ?? []).map((i) => i.itemId));
  const phone = view.me.mall?.phone?.tier;
  const cars = new Set(view.me.garage.map((c) => c.modelId));
  return (e: CatalogEntrySpec, ref: string) =>
    e.source === 'furniture'
      ? home.has(ref)
      : e.source === 'car'
        ? cars.has(ref)
        : e.id === 'mall:phone'
          ? phone === Number(ref.slice(6))
          : false;
}

function make(
  e: CatalogEntrySpec,
  price: (ref: string) => number | undefined,
  owned: (e: CatalogEntrySpec, ref: string) => boolean,
  only?: (ref: string) => boolean,
): CatEntry | null {
  const variants = e.variants
    .filter((v) => !only || only(v.ref))
    .flatMap((v) => {
      const p = price(v.ref);
      return p === undefined || p <= 0
        ? []
        : [
            {
              ref: v.ref,
              label: variantLabel(e, v.ref),
              ...(v.tier ? { tier: v.tier } : {}),
              price: p,
              ...(owned(e, v.ref) ? { owned: true } : {}),
            },
          ];
    });
  if (!variants.length) return null;
  const mall =
    e.source === 'mall' ? MALL_ITEMS.find((x) => x.id === e.variants[0]!.ref) : undefined;
  return {
    id: e.id,
    source: e.source,
    category: e.category,
    label: entryLabel(e),
    ...(e.source === 'furniture' ? { slot: e.id.slice(5) } : {}),
    ...(mall ? { mall } : {}),
    ...(e.source === 'wall' ? { wall: e.id.slice(5) as WallKind } : {}),
    variants,
    groups: e.groups,
  };
}

/** Everything sold online (delivered to your home), at home-city prices. */
export function onlineCatalog(view: PlayerView): CatEntry[] {
  const shop = view.me.shop;
  if (!shop) return [];
  const owned = ownedOf(view);
  const out: CatEntry[] = [];
  for (const e of CATALOG_ENTRIES) {
    const p = (ref: string) =>
      e.source === 'wall' ? shop.prices[`wall:${e.id.slice(5)}:${ref}`] : shop.prices[ref];
    const x = make(e, p, owned);
    if (x) out.push(x);
  }
  for (const c of shop.cars) {
    const x = make(carEntry(c.id), (ref) => shop.prices[`car:${ref}`], owned);
    if (x) out.push({ ...x, label: c.label, monthlyCost: c.monthlyCost });
  }
  return out;
}

/** What a mall shop sells, at the mall's prices (furniture: only the tiers it stocks). */
export function mallCatalog(view: PlayerView, shopId: MallShopId): CatEntry[] {
  const items = view.me.mall?.items ?? [];
  const priceOf = new Map(items.map((i) => [i.id, i.price]));
  const owned = ownedOf(view);
  const out: CatEntry[] = [];
  for (const e of CATALOG_ENTRIES) {
    if (!e.shops?.includes(shopId)) continue;
    if (e.source === 'furniture') {
      // The mall's stock of it: item id = the furniture id.
      const stocked = MALL_ITEMS.filter((x) => x.shop === shopId && x.furnitureId).map(
        (x) => x.furnitureId!,
      );
      const x = make(
        e,
        (ref) => priceOf.get(ref),
        owned,
        (ref) => stocked.includes(ref),
      );
      if (x) out.push(x);
    } else {
      const x = make(e, (ref) => priceOf.get(ref), owned);
      if (x) out.push(x);
    }
  }
  return out;
}

/** A showroom's floor: its furniture slots (and walls at a furniture store), or its cars. */
export function showroomCatalog(
  view: PlayerView,
  sells: { slots: string[] } | { cars: true },
  floor: {
    furniture: { id: string; slot: string; price: number }[];
    cars: { id: string; label: string; price: number; monthlyCost: number }[];
  },
  walls: boolean,
): CatEntry[] {
  const owned = ownedOf(view);
  const out: CatEntry[] = [];
  if ('cars' in sells) {
    for (const c of floor.cars) {
      const x = make(carEntry(c.id), () => c.price, owned);
      if (x) out.push({ ...x, label: c.label, monthlyCost: c.monthlyCost });
    }
    return out;
  }
  const price = new Map(floor.furniture.map((f) => [f.id, f.price]));
  for (const e of CATALOG_ENTRIES) {
    if (e.source === 'furniture' && sells.slots.includes(e.id.slice(5))) {
      const x = make(e, (ref) => price.get(ref), owned);
      if (x) out.push(x);
    }
    if (walls && e.source === 'wall') {
      const shop = view.me.shop;
      const x = shop ? make(e, (ref) => shop.prices[`wall:${e.id.slice(5)}:${ref}`], owned) : null;
      if (x) out.push(x);
    }
  }
  return out;
}

export type SortBy = 'featured' | 'price-up' | 'price-down';

/** Filter by category (null: all) and search words, then sort. */
export function browse(
  entries: CatEntry[],
  o: {
    category: CatalogCategory | null;
    sort: SortBy;
    query?: string;
    label?: (e: CatEntry) => string;
  },
): CatEntry[] {
  const q = (o.query ?? '').trim().toLowerCase();
  const from = (e: CatEntry) => Math.min(...e.variants.map((v) => v.price));
  const shown = entries.filter(
    (e) =>
      (!o.category || e.category === o.category) &&
      (!q || (o.label ? o.label(e) : e.label).toLowerCase().includes(q)),
  );
  if (o.sort === 'featured') return shown;
  const dir = o.sort === 'price-up' ? 1 : -1;
  return [...shown].sort((a, b) => dir * (from(a) - from(b)) || (a.id < b.id ? -1 : 1));
}

/** The categories these entries are in, in the catalogue's order. */
export const categoriesOf = (entries: CatEntry[]) =>
  CATALOG_CATEGORIES.filter((c) => entries.some((e) => e.category === c)).map((id) => ({
    id,
    label: CATEGORY_LABEL[id],
  }));

/** A variant's price with these options (the engine's own sum). */
export const priced = (e: CatEntry, v: CatVariant, chosen: ChosenOptions) =>
  priceWithOptions(v.price, e.groups, chosen).price;

/** The colour a finish or paint shows in a picture, if it has one. */
export const finishSwatch = (e: CatEntry, chosen: ChosenOptions) => swatchOf(e.groups, chosen);

/** The delivery fee and wait for an online order (the engine's terms). */
export function deliveryQuote(shop: ShopView, e: CatEntry, price: number, speed: DeliverySpeed) {
  const terms = shop.delivery[e.category];
  return {
    fee: deliveryFee(e.category, price, terms.minFee, speed),
    seconds: speed === 'express' ? terms.expressS : terms.standardS,
  };
}

type DeliveryRow = PlayerView['living']['deliveries'][number];

/** What's in a delivery, untranslated (tx() it). */
export function deliveryLabel(d: DeliveryRow): string {
  if (d.order?.mall) return mallLabel(d.order.mall.item);
  if (d.item) return furnitureLabel(d.item.itemId);
  const x = MALL_ITEMS.find((i) => i.id === d.label);
  return x ? x.label : d.label.replace(/-/g, ' ');
}

/** A delivery's icon. */
export function deliveryIcon(d: DeliveryRow): string {
  if (d.kind === 'car') return '🚗';
  if (d.kind === 'wall') return '🧱';
  if (d.kind === 'food') return '🍲';
  if (d.kind === 'furniture') return '🛋️';
  const x = d.order?.mall ? MALL_ITEMS.find((i) => i.id === d.order!.mall!.item) : undefined;
  return x ? itemIcon(x) : '📦';
}

/** The buy command for an entry: in a shop (no delivery) or online. */
export function buyCommand(
  e: CatEntry,
  v: CatVariant,
  chosen: ChosenOptions,
  o: { delivery?: DeliverySpeed; businessId?: string; colour?: string; inMall?: boolean },
): Record<string, unknown> & { type: string } {
  const options = { options: chosen };
  const delivery = o.delivery ? { delivery: o.delivery } : {};
  if (e.source === 'wall')
    return {
      type: 'home.wall.buy',
      kind: e.wall,
      length: Number(v.ref),
      ...options,
      ...delivery,
      ...(o.businessId ? { businessId: o.businessId } : {}),
    };
  if (e.source === 'car')
    return {
      type: 'car.buy',
      modelId: v.ref,
      ...options,
      ...delivery,
      ...(o.delivery ? {} : { keepCurrent: true }),
      ...(o.businessId ? { businessId: o.businessId } : {}),
    };
  if (e.source === 'furniture' && !o.inMall)
    return {
      type: 'home.order',
      itemId: v.ref,
      ...options,
      ...delivery,
      ...(o.businessId ? { businessId: o.businessId } : {}),
    };
  const mall = MALL_ITEMS.find((x) => x.id === v.ref || x.furnitureId === v.ref);
  return {
    type: 'mall.buy',
    itemId: mall?.id ?? v.ref,
    ...(mall?.topStyle && o.colour ? { colour: o.colour } : {}),
    ...options,
    ...delivery,
  };
}
