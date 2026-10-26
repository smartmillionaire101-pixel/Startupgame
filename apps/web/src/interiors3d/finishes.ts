/**
 * A home's floors and walls as built, and the finishes you chose in Buy
 * mode's Design tab (engine data/home-style.ts, `view.me.homeStyle`): a
 * floor per room ('0:living' → 'marble') and paint for the walls. The 3D
 * house (./house.ts) and the Design tab both read these. Pure: no three.js.
 */
import type { BlockTier } from '../home/grounds';
import type { RoomId } from '../home/layout';
import type { FloorKind } from './kit';

export const WALL_GREEN = '#1d8a65';
export const WALL_INNER = '#23946e';
export const WALL_CAP = '#f4f1ea';

/** What you chose: floors by room key ('0:living') and the walls' paint. */
export interface HomeFinish {
  floors?: Record<string, string>;
  wall?: string | null;
}

/** A room's own floor (a house; a flat's block can change it, see `BLOCK_FLOORS`). */
export function floorKind(id: RoomId, tier: number): FloorKind {
  switch (id) {
    case 'kitchen':
    case 'living':
    case 'dining':
      return tier >= 5 ? 'marble' : 'cream';
    case 'bathroom':
      return 'bath';
    case 'study':
      return 'parquet-dark';
    case 'cinema':
      return 'carpet';
    case 'gym':
      return 'concrete';
    case 'bedroom':
    case 'guest':
    case 'landing':
      return 'oak';
    case 'hall':
      return 'marble';
    case 'office':
      return 'parquet-dark';
    case 'balcony':
    case 'terrace':
      return 'stone';
  }
}

/**
 * A flat's floors by its block (player feedback: Modest looked the same as
 * Lean): a shared flat's worn concrete and cheap tiles, a small flat's warm
 * tiles and honey oak (the default), a good flat's parquet and marble.
 */
export const BLOCK_FLOORS: Record<BlockTier, Partial<Record<RoomId, [FloorKind, string?]>>> = {
  walkup: {
    bedroom: ['concrete', '#cfc8ba'],
    living: ['tile', '#d6cfc1'],
    kitchen: ['concrete', '#c9c2b4'],
    bathroom: ['tile', '#c9d2cf'],
  },
  block: {},
  modern: {
    living: ['parquet', '#f3e5d2'],
    dining: ['parquet', '#f3e5d2'],
    kitchen: ['marble', '#f4efe6'],
    bathroom: ['marble', '#e8e0d4'],
    guest: ['oak'],
  },
};

/** A flat's walls by its block: tired grey-green paint, a fresh blue, a modern slate. */
export const BLOCK_WALLS: Record<
  BlockTier,
  { outer: string; inner: string; cap: string; drape: string }
> = {
  walkup: { outer: '#9aa79f', inner: '#a9b5ad', cap: '#e4ddcf', drape: '#c9a978' },
  block: { outer: '#4f86a8', inner: '#5d93b4', cap: '#f6f3ec', drape: '#e9dcc3' },
  modern: { outer: '#46505c', inner: '#55606d', cap: '#f1efe9', drape: '#d8d2c8' },
};

/** A house's walls as built. */
export const HOUSE_WALLS = { outer: WALL_GREEN, inner: WALL_INNER, cap: WALL_CAP, drape: '' };

/** A room's floor as built: its block's (a flat), else the house's, and its tint. */
export function builtFloor(
  id: RoomId,
  tier: number,
  block: BlockTier | null,
): [FloorKind, string?] {
  return (block ? BLOCK_FLOORS[block][id] : undefined) ?? [floorKind(id, tier)];
}

/** The floor a room has now: the finish you chose (untinted), or as built. */
export function roomFloor(
  id: RoomId,
  level: number,
  tier: number,
  block: BlockTier | null,
  finish?: HomeFinish | null,
): [FloorKind, string?] {
  const chosen = finish?.floors?.[`${level}:${id}`];
  return chosen ? [chosen as FloorKind] : builtFloor(id, tier, block);
}

/** Lighten (amount > 0) or darken a hex colour. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v + (amount > 0 ? (255 - v) * amount : v * amount))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** The walls' colours: as built, or in the paint you chose (inner walls a shade lighter). */
export function wallPalette(
  block: BlockTier | null,
  paint?: string | null,
): { outer: string; inner: string; cap: string; drape: string } {
  const built = block ? BLOCK_WALLS[block] : HOUSE_WALLS;
  if (!paint) return built;
  return { ...built, outer: paint, inner: shade(paint, 0.08) };
}
