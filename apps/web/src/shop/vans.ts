/**
 * Round 7: one order is one van (engine basket.ts). The deliveries waiting
 * for a home grouped by the van they ride in ("Your delivery is outside: 3
 * items · Unpack all"), what an unpacked thing leaves to place (straight to
 * placing: a painting is never hung before you pick where), and the hand-off
 * from wherever you unpacked to the home scene that places them.
 *
 * Pure apart from the small hand-off bus at the end.
 */
import type { PlayerView } from '@runway/engine';
import { MOVABLE } from '../interiors3d/placement';

type DeliveryRow = PlayerView['living']['deliveries'][number];

export interface VanGroup {
  /** The van's id (a delivery on its own is its own van). */
  id: string;
  items: DeliveryRow[];
  /** When it's at your door (all of it arrives together). */
  arrivesAt: number;
}

/** A home's waiting deliveries by van, the first to arrive first. */
export function vansOf(deliveries: readonly DeliveryRow[], owner: string): VanGroup[] {
  const by = new Map<string, DeliveryRow[]>();
  for (const d of deliveries) {
    if (d.owner !== owner || d.complete) continue;
    const id = (d as DeliveryRow & { van?: string }).van ?? d.id;
    by.set(id, [...(by.get(id) ?? []), d]);
  }
  return [...by.entries()]
    .map(([id, items]) => ({ id, items, arrivesAt: Math.max(...items.map((d) => d.arrivesAt)) }))
    .sort((a, z) => a.arrivesAt - z.arrivesAt || (a.id < z.id ? -1 : 1));
}

/** Something just unpacked that you place yourself. */
export type ToPlace =
  | { kind: 'slot'; slot: string }
  | { kind: 'extra'; slot: string; id: string }
  | { kind: 'wall'; id: string };

/** What placing a delivery's thing takes, once it's unpacked (null: nothing to place). */
export function toPlace(d: DeliveryRow): ToPlace | null {
  const o = d.order as
    { extra?: { id: string; slot: string }; wall?: { id: string } } | null | undefined;
  if (o?.extra) return { kind: 'extra', slot: o.extra.slot, id: o.extra.id };
  if (o?.wall) return { kind: 'wall', id: o.wall.id };
  if (d.item && MOVABLE.has(d.item.slot)) return { kind: 'slot', slot: d.item.slot };
  return null;
}

// ---------------------------------------------------------------- hand-off

let queue: ToPlace[] = [];
const listeners = new Set<() => void>();

/** Unpacked: these go straight to placing, in the home scene (now, or when it opens). */
export function placeAfterUnpack(xs: readonly ToPlace[]) {
  if (!xs.length) return;
  queue = [...queue, ...xs];
  for (const l of listeners) l();
}

/** The things waiting to be placed (taken: cleared). */
export function takeToPlace(): ToPlace[] {
  const q = queue;
  queue = [];
  return q;
}

/** The home scene listens while it's open. */
export function onToPlace(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Whether a home scene is open to place things now. */
export const placingHere = () => listeners.size > 0;

/**
 * The commands that unpack a van: one "Unpack all" where the world has
 * vans (round 7), else each delivery in turn (a van of one, before it).
 */
export function unpackCommands(
  van: VanGroup,
  basket: boolean,
): { type: 'living.collect'; deliveryId: string; all?: boolean }[] {
  if (basket) return [{ type: 'living.collect', deliveryId: van.items[0]!.id, all: true }];
  return van.items.map((d) => ({ type: 'living.collect', deliveryId: d.id }));
}
