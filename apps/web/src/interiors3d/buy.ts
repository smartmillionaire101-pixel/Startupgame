/**
 * Buy mode's catalogue (the feedback round): which cards show for the tab,
 * the floor, the room, the price filter and a search, what's new to you,
 * and the basket ("Pick several": one thing per slot, a total, then Buy all).
 * Pure: no React, no three.js.
 */
import type { BoostKey } from '@runway/engine';

export interface BuyItem {
  id: string;
  slot: string;
  tier: number;
  label: string;
  price: number;
}

export type BuyTab = 'new' | 'owned' | 'all' | 'design';
export type PriceFilter = 'any' | 'afford' | 'low' | 'high';

export const BUY_ROOMS: { id: string; label: string; slots: string[] }[] = [
  {
    id: 'living',
    label: 'Living room',
    slots: ['sofa', 'tv', 'sound', 'gaming', 'rug', 'lights', 'plants', 'art', 'books'],
  },
  { id: 'bedroom', label: 'Bedroom', slots: ['bed', 'wardrobe', 'desk', 'laptop'] },
  { id: 'kitchen', label: 'Kitchen', slots: ['kitchen', 'fridge', 'coffee', 'dining'] },
  { id: 'utility', label: 'Utility', slots: ['washer', 'cooling', 'power', 'wifi'] },
];

const slotOrder = BUY_ROOMS.flatMap((r) => r.slots);
const orderOf = (slot: string) => {
  const i = slotOrder.indexOf(slot);
  return i < 0 ? 99 : i;
};

/** New to you: the next step up in each slot (the basic one where you have none). */
export function isNew(item: BuyItem, owned: ReadonlyMap<string, number>): boolean {
  return item.tier === (owned.get(item.slot) ?? 0) + 1;
}

export interface BuyQuery {
  tab: Exclude<BuyTab, 'design'>;
  /** 'all' or a BUY_ROOMS id. */
  room: string;
  price: PriceFilter;
  search: string;
  /** The slots on the floor you're looking at (all when absent). */
  floorSlots?: ReadonlySet<string>;
  pocket: number;
  /** Searches the translated names too. */
  name?: (item: BuyItem) => string;
}

/** The cards to show, in room and tier order (or by price when sorting). */
export function buyCards(
  items: readonly BuyItem[],
  owned: ReadonlyMap<string, number>,
  q: BuyQuery,
): BuyItem[] {
  const room = BUY_ROOMS.find((r) => r.id === q.room);
  const needle = q.search.trim().toLowerCase();
  const out = items.filter((f) => {
    if (q.floorSlots && !q.floorSlots.has(f.slot)) return false;
    if (room && !room.slots.includes(f.slot)) return false;
    if (q.tab === 'owned' && owned.get(f.slot) !== f.tier) return false;
    if (q.tab === 'new' && !isNew(f, owned)) return false;
    if (q.price === 'afford' && owned.get(f.slot) !== f.tier && f.price > q.pocket) return false;
    if (needle) {
      const hay = `${f.label} ${q.name?.(f) ?? ''} ${f.slot}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  return out.sort((a, z) =>
    q.price === 'low'
      ? a.price - z.price
      : q.price === 'high'
        ? z.price - a.price
        : orderOf(a.slot) - orderOf(z.slot) || a.tier - z.tier,
  );
}

/** How many things you own (cards in the Owned tab). */
export const ownedCount = (items: readonly BuyItem[], owned: ReadonlyMap<string, number>) =>
  items.filter((f) => owned.get(f.slot) === f.tier).length;

/**
 * Tick a card into the basket (or out): one thing per slot, so ticking a
 * sofa swaps out the sofa already in it. Things you own can't go in.
 */
export function toggleBasket(
  basket: readonly string[],
  item: BuyItem,
  items: readonly BuyItem[],
  owned: ReadonlyMap<string, number>,
): string[] {
  if (basket.includes(item.id)) return basket.filter((id) => id !== item.id);
  if (owned.get(item.slot) === item.tier) return [...basket];
  const sameSlot = new Set(items.filter((f) => f.slot === item.slot).map((f) => f.id));
  return [...basket.filter((id) => !sameSlot.has(id)), item.id];
}

/** The basket's things (in the order you ticked them) and their total. */
export function basketTotal(
  basket: readonly string[],
  items: readonly BuyItem[],
): { items: BuyItem[]; total: number } {
  const byId = new Map(items.map((f) => [f.id, f]));
  const picked = basket.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  return { items: picked, total: picked.reduce((a, f) => a + f.price, 0) };
}

/** The boosts to show on a card, biggest first ('+Social +2'), comfort last. */
export function boostLines(b: Partial<Record<BoostKey, number>> | undefined): [BoostKey, number][] {
  return (Object.entries(b ?? {}) as [BoostKey, number][])
    .filter(([, v]) => v > 0)
    .sort((a, z) => (a[0] === 'comfort' ? 1 : 0) - (z[0] === 'comfort' ? 1 : 0) || z[1] - a[1]);
}

/** A slot's footprint on a card: '3×1', or 'wall' for what hangs on one. */
export function footprint(spot: { w: number; h: number; wall?: boolean } | undefined): string {
  if (!spot) return '1×1';
  return spot.wall ? 'wall' : `${spot.w}×${spot.h}`;
}
