/**
 * Wave 9 §C, Buy mode: where you put your furniture. Kept on this device per
 * player and thing: localStorage `runway.place.<playerId>.<slot>` holds
 * `{ x, y, rot }` (tiles; rot in quarter turns). The engine doesn't know;
 * the floor plan is adjusted here before anything is drawn or walked.
 */
import { blockedTiles, key, planFor, wallEdges, type HomePlan, type Spot } from '../home/layout';
import { findPath } from '../home/path';

export interface Placement {
  x: number;
  y: number;
  /** Quarter turns (0–3): 0 faces +z (away from the back wall). */
  rot: number;
}

const KEY = (playerId: string, slot: string) => `runway.place.${playerId}.${slot}`;

/** Slots you can move (fixed, wall-mounted and on-the-desk things stay put). */
export const MOVABLE = new Set([
  'sofa',
  'bed',
  'desk',
  'tv',
  'plants',
  'sound',
  'gaming',
  'fridge',
  'washer',
  'power',
  'lights',
  'rug',
  'dining',
  'wardrobe',
  'books',
  'coffee',
  'wifi',
]);

export function loadPlacements(playerId: string, slots: Iterable<string>): Record<string, Placement> {
  const out: Record<string, Placement> = {};
  for (const slot of slots) {
    try {
      const raw = localStorage.getItem(KEY(playerId, slot));
      if (!raw) continue;
      const p = JSON.parse(raw) as Partial<Placement>;
      if (
        typeof p.x === 'number' &&
        typeof p.y === 'number' &&
        typeof p.rot === 'number' &&
        Number.isInteger(p.x) &&
        Number.isInteger(p.y)
      )
        out[slot] = { x: p.x, y: p.y, rot: ((Math.round(p.rot) % 4) + 4) % 4 };
    } catch {
      /* unreadable: the default spot */
    }
  }
  return out;
}

export function savePlacement(playerId: string, slot: string, p: Placement | null) {
  try {
    if (p) localStorage.setItem(KEY(playerId, slot), JSON.stringify(p));
    else localStorage.removeItem(KEY(playerId, slot));
  } catch {
    /* storage blocked: lasts this visit */
  }
}

/** The footprint of a slot turned `rot` quarter turns, with its top-left at (x, y). */
export function placedSpot(base: Spot, p: Placement): Spot & { rot: number } {
  const turned = p.rot % 2 === 1;
  const w = turned ? base.h : base.w;
  const h = turned ? base.w : base.h;
  // Stand in front of it: the tile next to the side it faces.
  const front = [
    { x: p.x + Math.floor((w - 1) / 2), y: p.y + h },
    { x: p.x + w, y: p.y + Math.floor((h - 1) / 2) },
    { x: p.x + Math.floor((w - 1) / 2), y: p.y - 1 },
    { x: p.x - 1, y: p.y + Math.floor((h - 1) / 2) },
  ][p.rot]!;
  return { ...base, x: p.x, y: p.y, w, h, interact: front, rot: p.rot };
}

/**
 * Can this slot go here? Inside the home, on free floor (not over another
 * thing you own or a fixture), not across a wall, and with a free tile in
 * front to use it from.
 */
export function canPlace(
  plan: HomePlan,
  owned: ReadonlySet<string>,
  slot: string,
  p: Placement,
): boolean {
  const base = plan.slots[slot];
  if (!base || !MOVABLE.has(slot)) return false;
  const s = placedSpot(base, p);
  if (s.x < 0 || s.y < 0 || s.x + s.w > plan.w || s.y + s.h > plan.h) return false;
  const others = new Set(owned);
  others.delete(slot);
  const blocked = blockedTiles(plan, others);
  const tiles = new Set<string>();
  for (let x = s.x; x < s.x + s.w; x++)
    for (let y = s.y; y < s.y + s.h; y++) {
      const k = key(x, y);
      if (s.blocked && blocked.has(k)) return false;
      tiles.add(k);
    }
  if (tiles.has(key(plan.door.x, plan.door.y))) return false;
  // No wall runs through it.
  for (const wl of plan.walls) {
    if (wl.dir === 'h' && wl.y > s.y && wl.y < s.y + s.h && wl.x >= s.x && wl.x < s.x + s.w)
      return false;
    if (wl.dir === 'v' && wl.x > s.x && wl.x < s.x + s.w && wl.y >= s.y && wl.y < s.y + s.h)
      return false;
  }
  const f = s.interact;
  if (f.x < 0 || f.y < 0 || f.x >= plan.w || f.y >= plan.h) return false;
  if (blocked.has(key(f.x, f.y)) || tiles.has(key(f.x, f.y))) return false;
  // Everything stays reachable from the front door.
  const next: HomePlan = { ...plan, slots: { ...plan.slots, [slot]: s } };
  const g = { w: plan.w, h: plan.h, blocked: blockedTiles(next, owned), walls: wallEdges(plan) };
  const reach = [...Object.entries(next.slots)]
    .filter(([k]) => owned.has(k))
    .map(([, x]) => x.interact)
    .concat(Object.values(next.fixtures).map((x) => x!.interact));
  return reach.every((t) => !!findPath(g, plan.door, t));
}

/** The plan with your placements applied (invalid ones are ignored). */
export function withPlacements(
  plan: HomePlan,
  owned: ReadonlySet<string>,
  placements: Record<string, Placement>,
): HomePlan {
  const entries = Object.entries(placements).filter(([slot]) => owned.has(slot));
  if (!entries.length) return plan;
  let out: HomePlan = { ...plan, slots: { ...plan.slots } };
  for (const [slot, p] of entries) {
    if (!canPlace(out, owned, slot, p)) continue;
    out.slots[slot] = placedSpot(plan.slots[slot]!, p);
    // The sofa's seats move with it.
    if (slot === 'sofa') {
      const s = out.slots.sofa!;
      const turned = p.rot % 2 === 1;
      const n = turned ? s.h : s.w;
      const seats = Array.from({ length: n }, (_, i) =>
        turned ? { x: s.x, y: s.y + i } : { x: s.x + i, y: s.y },
      );
      const mid = Math.floor(n / 2);
      out = { ...out, seats: [seats[mid]!, ...seats.filter((_, i) => i !== mid)] };
    }
  }
  return out;
}

/** The default spot of a slot (for "put it back"). */
export const defaultSpot = (tier: number, slot: string) => planFor(tier).slots[slot];
