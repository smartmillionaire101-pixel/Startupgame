/**
 * Playtest #40: a home's windows (and its front door), in one place. The 3D
 * house builds its panes from this list and the 2D (Lite) home draws its
 * windows from it, so a picture blocked by a window in one is blocked in the
 * other. Pure: tiles, no three.js.
 *
 * Each opening is on an outer wall: `back` (along x at the top edge, z = 0),
 * `left`/`right` (along y at x = 0 / x = w), `front` (the front door). `c` is
 * its middle along that wall and `w` its width (tiles); `tall` panes reach
 * nearly to the floor.
 */
import { blockOf } from './grounds';
import type { HotelWindow } from './hotel';
import type { HomePlan } from './layout';

export type OuterWall = 'back' | 'left' | 'right' | 'front';

export interface WallOpening {
  wall: OuterWall;
  c: number;
  w: number;
  tall?: boolean;
  kind: 'window' | 'door';
}

export interface WindowOpts {
  /** A floor of a tower (a block of flats, a hotel): no windows in the side walls. */
  tower?: boolean;
  /** A hotel room's windows, where its plan puts them. */
  hotel?: readonly HotelWindow[] | null;
}

/**
 * The windows of a home's plan: big panes on the back wall (one per room of
 * three tiles or more, not the bathroom), louvred ones in the side walls of
 * the rooms three tiles deep or more (not in a tower). `opts` defaults to
 * what the plan says (a flat is a floor of its block).
 */
export function homeWindows(plan: HomePlan, opts?: WindowOpts): WallOpening[] {
  const hotel = opts?.hotel ?? null;
  const tower = opts?.tower ?? (!!hotel || blockOf(plan) !== null);
  const out: WallOpening[] = [];
  for (const r of plan.rooms) {
    if (r.open) continue;
    if (r.y === 0 && r.w >= 3 && r.id !== 'bathroom' && !hotel)
      out.push({ wall: 'back', c: r.x + r.w * 0.62, w: Math.min(1.6, r.w * 0.35), kind: 'window' });
    if (r.x === 0 && r.h >= 3 && !tower)
      out.push({ wall: 'left', c: r.y + r.h * 0.6, w: Math.min(1.8, r.h * 0.4), kind: 'window' });
    if (r.x + r.w === plan.w && r.h >= 3 && !tower)
      out.push({ wall: 'right', c: r.y + r.h * 0.55, w: Math.min(2.0, r.h * 0.4), kind: 'window' });
  }
  for (const w of hotel ?? [])
    out.push({ wall: 'back', c: w.c, w: w.w, ...(w.tall ? { tall: true } : {}), kind: 'window' });
  return out;
}

/** The openings a picture can't hang over: the windows, and the front door downstairs. */
export function wallOpenings(plan: HomePlan, opts?: WindowOpts): WallOpening[] {
  const out = homeWindows(plan, opts);
  if ((plan.level ?? 0) === 0)
    out.push({ wall: 'front', c: plan.door.x + 0.5, w: 1, kind: 'door' });
  return out;
}

/**
 * How far a picture's middle keeps from an opening's edge (tiles): half the
 * widest painting with its frame, the window's frame, and a little gap.
 */
export const PICTURE_CLEAR = 0.55 + 0.06 + 0.05;

/**
 * The outer wall right behind a thing on a wall at tile (x, y) facing `rot`
 * (0 faces +y, 1 +x, 2 -y, 3 -x), and where its middle is along it; null on
 * an inner wall.
 */
export function outerWallAt(
  plan: Pick<HomePlan, 'w' | 'h'>,
  x: number,
  y: number,
  rot: number,
): { wall: OuterWall; at: number } | null {
  const r = ((rot % 4) + 4) % 4;
  if (r === 0 && y === 0) return { wall: 'back', at: x + 0.5 };
  if (r === 1 && x === 0) return { wall: 'left', at: y + 0.5 };
  if (r === 2 && y === plan.h - 1) return { wall: 'front', at: x + 0.5 };
  if (r === 3 && x === plan.w - 1) return { wall: 'right', at: y + 0.5 };
  return null;
}

/** Would a picture on tile (x, y) facing `rot` hang over (or crowd) a window or the door? */
export function overOpening(
  plan: HomePlan,
  x: number,
  y: number,
  rot: number,
  openings: readonly WallOpening[] = wallOpenings(plan),
): boolean {
  const o = outerWallAt(plan, x, y, rot);
  if (!o) return false;
  return openings.some((w) => w.wall === o.wall && Math.abs(o.at - w.c) < w.w / 2 + PICTURE_CLEAR);
}
