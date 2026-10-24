/**
 * Walls and dividers you put up at home, and the names you give rooms
 * (player feedback: "dividers and walls so I can divide my apartment into
 * different rooms, since it mostly comes as an open plan").
 *
 * The engine keeps what you own and where each one stands (`home.wall.*`:
 * a floor, a tile edge and a direction, like the plan's own walls); this
 * file fits them to the floor plan: in the home, not over another wall,
 * not through something that stands on the floor, and everything still
 * reachable from the front door. A sliding door or screen can be walked
 * through; the rest are walls to walk round.
 */
import { WALLS, wallEdgesOf, type WallKind } from '@runway/engine';
import { blockedTiles, key, wallEdges, type HomePlan, type Spot } from './layout';
import { findPath } from './path';

export interface WallView {
  id: string;
  kind: WallKind;
  len: number;
  finish: string;
  paid: number;
  floor?: number;
  x?: number;
  y?: number;
  dir?: 'h' | 'v';
}

export interface Divider {
  id: string;
  kind: WallKind;
  len: number;
  finish: string;
  x: number;
  y: number;
  dir: 'h' | 'v';
}

export interface RoomName {
  floor: number;
  x: number;
  y: number;
  label: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const KINDS = new Set(['full', 'half', 'glass', 'sliding', 'bookshelf']);

/** Walls, room names and furniture finishes from a home view (yours or a host's). */
export function homeExtrasOf(home: unknown): {
  walls: WallView[];
  rooms: RoomName[];
  finishes: Map<string, string>;
} {
  const h = isObj(home) ? home : {};
  const walls = (Array.isArray(h.walls) ? h.walls : []).filter(
    (w): w is WallView =>
      isObj(w) &&
      typeof w.id === 'string' &&
      KINDS.has(w.kind as string) &&
      typeof w.len === 'number',
  );
  const rooms = (Array.isArray(h.rooms) ? h.rooms : []).filter(
    (r): r is RoomName => isObj(r) && typeof r.label === 'string' && typeof r.x === 'number',
  );
  const finishes = new Map<string, string>();
  for (const i of Array.isArray(h.items) ? h.items : [])
    if (isObj(i) && typeof i.slot === 'string' && typeof i.finish === 'string')
      finishes.set(i.slot, i.finish);
  return { walls, rooms, finishes };
}

/** A finish's colour. */
export const wallSwatch = (kind: WallKind, finish: string): string =>
  WALLS[kind].finish.options.find((o) => o.id === finish)?.swatch ??
  WALLS[kind].finish.options[0]!.swatch ??
  '#f1ede4';

export const passable = (kind: WallKind) => WALLS[kind].passable;

/** The plan's wall segments a divider covers. */
export const segmentsOf = (d: Pick<Divider, 'x' | 'y' | 'dir' | 'len'>) =>
  Array.from({ length: d.len }, (_, i) =>
    d.dir === 'h'
      ? { dir: 'h' as const, x: d.x + i, y: d.y }
      : { dir: 'v' as const, x: d.x, y: d.y + i },
  );

/** Inside the home, on an inner edge (not along the outer walls). */
export function inBounds(
  plan: Pick<HomePlan, 'w' | 'h'>,
  d: Pick<Divider, 'x' | 'y' | 'dir' | 'len'>,
) {
  return d.dir === 'h'
    ? d.x >= 0 && d.x + d.len <= plan.w && d.y >= 1 && d.y <= plan.h - 1
    : d.y >= 0 && d.y + d.len <= plan.h && d.x >= 1 && d.x <= plan.w - 1;
}

/** Edges in the plan's own form ('h:x,y'), for overlap checks. */
const planEdges = (plan: HomePlan) => new Set(plan.walls.map((s) => `${s.dir}:${s.x},${s.y}`));

/** Placed walls on this floor that fit the plan (in bounds, over no wall or each other). */
export function dividersOn(walls: WallView[], floor: number, plan: HomePlan): Divider[] {
  const taken = planEdges(plan);
  const out: Divider[] = [];
  for (const w of walls) {
    if (w.x === undefined || w.y === undefined || !w.dir || (w.floor ?? 0) !== floor) continue;
    const d: Divider = {
      id: w.id,
      kind: w.kind,
      len: w.len,
      finish: w.finish,
      x: w.x,
      y: w.y,
      dir: w.dir,
    };
    if (!inBounds(plan, d)) continue;
    const edges = wallEdgesOf(d.x, d.y, d.dir, d.len);
    if (edges.some((e) => taken.has(e))) continue;
    for (const e of edges) taken.add(e);
    out.push(d);
  }
  return out;
}

/** The plan with these dividers as walls (the ones you can't walk through). */
export function withDividers(plan: HomePlan, ds: Divider[]): HomePlan {
  const solid = ds.filter((d) => !passable(d.kind));
  if (!solid.length) return plan;
  return { ...plan, walls: [...plan.walls, ...solid.flatMap(segmentsOf)] };
}

/** Tiles of each thing standing on the floor (owned furniture, fixtures, decor). */
function footprints(plan: HomePlan, owned: ReadonlySet<string>) {
  const at = new Map<string, string>();
  const add = (id: string, s: Spot | undefined) => {
    if (!s || !s.blocked || s.wall) return;
    for (let x = s.x; x < s.x + s.w; x++)
      for (let y = s.y; y < s.y + s.h; y++) at.set(key(x, y), id);
  };
  for (const [slot, s] of Object.entries(plan.slots)) if (owned.has(slot)) add(slot, s);
  for (const [id, s] of Object.entries(plan.fixtures)) add(id, s);
  for (const d of plan.decor) add(d.id, d.spot);
  return at;
}

/**
 * Can this divider go here? In the home, along an inner edge, not over a
 * wall or another divider, not through something standing on the floor, and
 * with everything you use still reachable from the front door.
 */
export function canPlaceDivider(
  plan: HomePlan,
  owned: ReadonlySet<string>,
  others: Divider[],
  d: Divider,
): boolean {
  if (!inBounds(plan, d)) return false;
  const taken = planEdges(plan);
  for (const o of others) for (const s of segmentsOf(o)) taken.add(`${s.dir}:${s.x},${s.y}`);
  const mine = segmentsOf(d);
  if (mine.some((s) => taken.has(`${s.dir}:${s.x},${s.y}`))) return false;
  const at = footprints(plan, owned);
  for (const s of mine) {
    const [a, b] =
      s.dir === 'h' ? [key(s.x, s.y - 1), key(s.x, s.y)] : [key(s.x - 1, s.y), key(s.x, s.y)];
    if (at.has(a) && at.get(a) === at.get(b)) return false;
  }
  if (passable(d.kind)) return true;
  const next = withDividers(plan, [...others, d]);
  const g = { w: plan.w, h: plan.h, blocked: blockedTiles(plan, owned), walls: wallEdges(next) };
  const targets = [
    ...Object.entries(plan.slots)
      .filter(([slot, s]) => owned.has(slot) && !!s)
      .map(([, s]) => s.interact),
    ...Object.values(plan.fixtures).map((s) => s!.interact),
    ...plan.decor.map((x) => x.spot.interact),
  ];
  return targets.every((t) => !!findPath(g, plan.door, t));
}

/** A divider moved by a tile (kept in the home). */
export function nudgeDivider<T extends Pick<Divider, 'x' | 'y' | 'dir' | 'len'>>(
  plan: Pick<HomePlan, 'w' | 'h'>,
  d: T,
  dx: number,
  dy: number,
): T {
  const [x0, x1, y0, y1] =
    d.dir === 'h' ? [0, plan.w - d.len, 1, plan.h - 1] : [1, plan.w - 1, 0, plan.h - d.len];
  return {
    ...d,
    x: Math.max(x0, Math.min(x1, d.x + dx)),
    y: Math.max(y0, Math.min(y1, d.y + dy)),
  };
}

/** Turned a quarter: along the other axis, from the same corner (kept in the home). */
export function turnDivider<T extends Pick<Divider, 'x' | 'y' | 'dir' | 'len'>>(
  plan: Pick<HomePlan, 'w' | 'h'>,
  d: T,
): T {
  return nudgeDivider(plan, { ...d, dir: d.dir === 'h' ? 'v' : 'h' }, 0, 0);
}

/** Where a divider of this length goes when you tap a tile (centred on it, along its top or left edge). */
export function dividerAt(
  plan: Pick<HomePlan, 'w' | 'h'>,
  len: number,
  dir: 'h' | 'v',
  tx: number,
  ty: number,
): { x: number; y: number } {
  if (dir === 'h')
    return {
      x: Math.max(0, Math.min(plan.w - len, tx - Math.floor((len - 1) / 2))),
      y: Math.max(1, Math.min(plan.h - 1, ty)),
    };
  return {
    x: Math.max(1, Math.min(plan.w - 1, tx)),
    y: Math.max(0, Math.min(plan.h - len, ty - Math.floor((len - 1) / 2))),
  };
}
