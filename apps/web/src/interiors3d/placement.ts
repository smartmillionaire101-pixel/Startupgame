/**
 * Wave 9 §C, Buy mode: where you put your furniture. Kept on this device per
 * player and thing: localStorage `runway.place.<playerId>.<key>` holds
 * `{ x, y, rot }` (tiles; rot in quarter turns; `lift` for a picture's
 * height). The engine doesn't know; the floor plan is adjusted here before
 * anything is drawn or walked.
 *
 * A thing's key is its slot ('sound'), or for another one of it (player
 * feedback: more than one speaker, engine `homeExtras`) its slot and id
 * ('sound#extra_1k'), placed on its own. Things on a wall (art) hang on any
 * wall, outer or inner, facing into the room: the tile in front of it and the
 * way it faces (`wallBehind`). Nudges follow the camera (`screenToGrid`).
 */
import { blockedTiles, key, roomAt, wallEdges, type HomePlan, type Spot } from '../home/layout';
import { findPath } from '../home/path';

export interface Placement {
  x: number;
  y: number;
  /** Quarter turns (0–3): 0 faces +z (away from the back wall). */
  rot: number;
  /** On a wall: a step lower (-1) or higher (1) than eye height. */
  lift?: number;
}

const KEY = (playerId: string, slot: string) => `runway.place.${playerId}.${slot}`;

/** Another one of a thing: its key in the plan ('sound#extra_1k'). */
export const extraKey = (slot: string, id: string) => `${slot}#${id}`;
/** The slot a key is for ('sound#extra_1k' → 'sound'). */
export const slotOf = (k: string) => k.split('#')[0]!;
/** Things that hang on a wall (anywhere along one). */
export const ON_WALL = new Set(['art']);
/** How far a step of `lift` moves a picture up or down (m). */
export const LIFT_STEP = 0.3;

/** Slots you can move (fixed, built-in and on-the-desk things stay put). */
export const MOVABLE = new Set([
  'art',
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

export function loadPlacements(
  playerId: string,
  slots: Iterable<string>,
): Record<string, Placement> {
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
        out[slot] = {
          x: p.x,
          y: p.y,
          rot: ((Math.round(p.rot) % 4) + 4) % 4,
          ...(typeof p.lift === 'number' && p.lift
            ? { lift: Math.max(-1, Math.min(1, Math.round(p.lift))) }
            : {}),
        };
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
export function placedSpot(base: Spot, p: Placement): Spot & { rot: number; lift?: number } {
  if (base.wall) {
    // On a wall: one tile, the tile in front of it to use it from.
    const [fx, fy] = FACING[p.rot]!;
    return {
      ...base,
      x: p.x,
      y: p.y,
      w: 1,
      h: 1,
      blocked: false,
      wall: true,
      interact: { x: p.x + fx, y: p.y + fy },
      rot: p.rot,
      ...(p.lift ? { lift: p.lift } : {}),
    };
  }
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

/** The way each quarter turn faces, in tiles: 0 is +y (+z in 3D), 1 is +x. */
const FACING: [number, number][] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/** Is there a wall right behind a thing on tile (x, y) facing `rot` (outer or inner)? */
export function wallBehind(plan: HomePlan, x: number, y: number, rot: number): boolean {
  if (x < 0 || y < 0 || x >= plan.w || y >= plan.h) return false;
  // A balcony or a roof terrace has a glass railing, not a wall to hang things on.
  if (plan.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)?.open)
    return false;
  const [fx, fy] = FACING[((rot % 4) + 4) % 4]!;
  const bx = x - fx;
  const by = y - fy;
  if (bx < 0 || by < 0 || bx >= plan.w || by >= plan.h) return true;
  // Inside the home: one of its own walls (or a divider) between the two tiles, or
  // the edge of the floor (a room that doesn't fill the grid).
  if (!roomAt(plan, bx, by)) return true;
  return wallEdges(plan).has(`${key(x, y)}|${key(bx, by)}`);
}

/**
 * Screen arrows to the floor grid (player feedback: "when I click left the
 * item goes right"): `ex` and `ez` are where one tile along +x and along +y
 * (+z in 3D) go on screen (px, y down). Left and right are left and right
 * on screen; up is away from you. The grid step that points most nearly
 * that way, whichever way the camera has turned.
 */
export function screenToGrid(
  dx: number,
  dy: number,
  ex: { x: number; y: number },
  ez: { x: number; y: number },
): { dx: number; dy: number } {
  const len = (v: { x: number; y: number }) => Math.hypot(v.x, v.y) || 1;
  const a = { x: ex.x / len(ex), y: ex.y / len(ex) };
  const b = { x: ez.x / len(ez), y: ez.y / len(ez) };
  const steps = [
    { dx: 1, dy: 0, s: a },
    { dx: -1, dy: 0, s: { x: -a.x, y: -a.y } },
    { dx: 0, dy: 1, s: b },
    { dx: 0, dy: -1, s: { x: -b.x, y: -b.y } },
  ];
  let best = steps[0]!;
  let score = -Infinity;
  for (const st of steps) {
    const d = st.s.x * dx + st.s.y * dy;
    if (d > score + 1e-9) {
      score = d;
      best = st;
    }
  }
  return { dx: best.dx, dy: best.dy };
}

/**
 * A thing on a wall, nudged a tile on the grid: along its wall (onto the
 * next wall in a corner), or away from it to the next wall that way, or
 * back through it to the wall's other side.
 */
export function nudgeOnWall(plan: HomePlan, p: Placement, dx: number, dy: number): Placement {
  const [fx, fy] = FACING[p.rot]!;
  const toward = dx * fx + dy * fy;
  const crosses = (x: number, y: number, nx: number, ny: number) =>
    nx < 0 ||
    ny < 0 ||
    nx >= plan.w ||
    ny >= plan.h ||
    wallBehind(plan, x, y, rotOf(nx - x, ny - y, true));
  if (toward === 0) {
    // Along the wall; in a corner, onto the wall it meets.
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (crosses(p.x, p.y, nx, ny)) return { ...p, rot: rotOf(dx, dy, true) };
    return { ...p, x: nx, y: ny };
  }
  if (toward > 0) {
    // Across the room to the next wall that way, facing back.
    let x = p.x;
    let y = p.y;
    for (let i = 0; i < plan.w + plan.h; i++) {
      const nx = x + fx;
      const ny = y + fy;
      if (crosses(x, y, nx, ny)) break;
      x = nx;
      y = ny;
    }
    return x === p.x && y === p.y ? p : { ...p, x, y, rot: (p.rot + 2) % 4 };
  }
  // Back through the wall it hangs on, onto its other side (not out of the home).
  const bx = p.x - fx;
  const by = p.y - fy;
  if (bx < 0 || by < 0 || bx >= plan.w || by >= plan.h || !roomAt(plan, bx, by)) return p;
  return { ...p, x: bx, y: by, rot: (p.rot + 2) % 4 };
}

/** The quarter turn facing (dx, dy) — or, `back`, with its back that way. */
function rotOf(dx: number, dy: number, back = false): number {
  const i = FACING.findIndex(([fx, fy]) => fx === (back ? -dx : dx) && fy === (back ? -dy : dy));
  return i < 0 ? 0 : i;
}

/** A thing on a wall dropped on a tile: the way it faced if there's a wall behind, else one that has. */
export function snapToWall(plan: HomePlan, p: Placement): Placement {
  for (let i = 0; i < 4; i++) {
    const rot = (p.rot + i) % 4;
    if (wallBehind(plan, p.x, p.y, rot)) return { ...p, rot };
  }
  return p;
}

/** A thing on a wall turned: the next way it can face with a wall behind it. */
export function turnOnWall(plan: HomePlan, p: Placement): Placement {
  for (let i = 1; i <= 4; i++) {
    const rot = (p.rot + i) % 4;
    if (wallBehind(plan, p.x, p.y, rot)) return { ...p, rot };
  }
  return p;
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
  return fitted(plan, owned, slot, p) !== null;
}

/**
 * The spot this slot takes at `p` (with the tile you use it from), or null
 * when it can't go there.
 */
function fitted(
  plan: HomePlan,
  owned: ReadonlySet<string>,
  slot: string,
  p: Placement,
): (Spot & { rot: number }) | null {
  const base = plan.slots[slot] ?? plan.slots[slotOf(slot)];
  if (!base || !MOVABLE.has(slotOf(slot))) return null;
  const s = placedSpot(base, p);
  if (base.wall) return fittedOnWall(plan, owned, slot, s);
  if (s.x < 0 || s.y < 0 || s.x + s.w > plan.w || s.y + s.h > plan.h) return null;
  // Everything else that stands on the floor (with this one owned, so its
  // stand-in fixture, a mat or a kitchenette, isn't there), minus itself.
  const withIt = new Set(owned);
  withIt.add(slot);
  const blocked = blockedTiles(plan, withIt);
  const cur = plan.slots[slot];
  if (cur && cur.blocked && !cur.wall)
    for (let x = cur.x; x < cur.x + cur.w; x++)
      for (let y = cur.y; y < cur.y + cur.h; y++) blocked.delete(key(x, y));
  const tiles = new Set<string>();
  for (let x = s.x; x < s.x + s.w; x++)
    for (let y = s.y; y < s.y + s.h; y++) {
      const k = key(x, y);
      if (s.blocked && blocked.has(k)) return null;
      tiles.add(k);
    }
  if (tiles.has(key(plan.door.x, plan.door.y))) return null;
  // No wall runs through it.
  for (const wl of plan.walls) {
    if (wl.dir === 'h' && wl.y > s.y && wl.y < s.y + s.h && wl.x >= s.x && wl.x < s.x + s.w)
      return null;
    if (wl.dir === 'v' && wl.x > s.x && wl.x < s.x + s.w && wl.y >= s.y && wl.y < s.y + s.h)
      return null;
  }
  // Everything else stays reachable from the front door…
  const placed = { ...s };
  const next: HomePlan = { ...plan, slots: { ...plan.slots, [slot]: placed } };
  const g = { w: plan.w, h: plan.h, blocked: blockedTiles(next, withIt), walls: wallEdges(plan) };
  const others = [...Object.entries(next.slots)]
    .filter(([k]) => withIt.has(k) && k !== slot)
    .map(([, x]) => x.interact)
    .concat(Object.values(next.fixtures).map((x) => x!.interact));
  if (!others.every((t) => !!findPath(g, plan.door, t))) return null;
  // …and there's a free tile next to it to use it from (in front, if it can).
  const sides: { x: number; y: number }[] = [s.interact];
  for (let x = s.x; x < s.x + s.w; x++) sides.push({ x, y: s.y + s.h }, { x, y: s.y - 1 });
  for (let y = s.y; y < s.y + s.h; y++) sides.push({ x: s.x + s.w, y }, { x: s.x - 1, y });
  const use = sides.find(
    (f) =>
      f.x >= 0 &&
      f.y >= 0 &&
      f.x < plan.w &&
      f.y < plan.h &&
      !tiles.has(key(f.x, f.y)) &&
      !g.blocked.has(key(f.x, f.y)) &&
      !!findPath(g, plan.door, f),
  );
  if (!use) return null;
  return { ...placed, interact: use };
}

/** On a wall: a wall behind it, in the home, not over the door, not on another picture. */
function fittedOnWall(
  plan: HomePlan,
  owned: ReadonlySet<string>,
  slot: string,
  s: Spot & { rot: number },
): (Spot & { rot: number }) | null {
  if (!wallBehind(plan, s.x, s.y, s.rot)) return null;
  if (s.x === plan.door.x && s.y === plan.door.y) return null;
  const facing = (o: Spot & { rot?: number }) => o.rot ?? 0;
  for (const [k, o] of Object.entries(plan.slots)) {
    if (k === slot || !o.wall || !owned.has(k)) continue;
    const same = s.x >= o.x && s.x < o.x + o.w && s.y >= o.y && s.y < o.y + o.h;
    if (same && facing(o) === s.rot) return null;
  }
  const f = s.interact;
  const front = f.x >= 0 && f.y >= 0 && f.x < plan.w && f.y < plan.h ? f : { x: s.x, y: s.y };
  return { ...s, interact: front };
}

/**
 * Another one of a thing with no spot saved (or one that no longer fits):
 * the free spot nearest to where its slot's one stands, or null when the
 * home has no room for it.
 */
function freeSpot(
  plan: HomePlan,
  owned: ReadonlySet<string>,
  k: string,
): (Spot & { rot: number }) | null {
  const base = plan.slots[slotOf(k)];
  if (!base) return null;
  const tries: Placement[] = [];
  for (let y = 0; y < plan.h; y++)
    for (let x = 0; x < plan.w; x++)
      for (const rot of base.wall ? [0, 1, 2, 3] : [(base as { rot?: number }).rot ?? 0])
        tries.push({ x, y, rot });
  // Keep off where the things you don't have yet would go.
  const kept = new Set<string>();
  for (const [sk, o] of Object.entries(plan.slots))
    if (!owned.has(sk) && !o.wall)
      for (let x = o.x; x < o.x + o.w; x++)
        for (let y = o.y; y < o.y + o.h; y++) kept.add(key(x, y));
  const d = (p: Placement) =>
    Math.abs(p.x - base.x) + Math.abs(p.y - base.y) + (kept.has(key(p.x, p.y)) ? 1000 : 0);
  tries.sort((a, z) => d(a) - d(z));
  for (const p of tries) {
    const f = fitted(plan, owned, k, p);
    if (f) return f;
  }
  return null;
}

/**
 * The plan with your placements applied (invalid ones are ignored), and the
 * other ones of a thing (`extras`, their keys) each in its saved spot, or the
 * nearest free one (left out when there's no room).
 */
export function withPlacements(
  plan: HomePlan,
  owned: ReadonlySet<string>,
  placements: Record<string, Placement>,
  extras: readonly string[] = [],
): HomePlan {
  const entries = Object.entries(placements).filter(
    ([slot]) => owned.has(slot) && !slot.includes('#'),
  );
  if (!entries.length && !extras.length) return plan;
  let out: HomePlan = { ...plan, slots: { ...plan.slots } };
  for (const [slot, p] of entries) {
    const f = fitted(out, owned, slot, p);
    if (!f) continue;
    out.slots[slot] = f;
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
  // The other ones, each after the last (so none stands on another).
  const all = new Set([...owned, ...extras]);
  for (const k of extras) {
    if (!out.slots[slotOf(k)] || !MOVABLE.has(slotOf(k))) continue;
    const saved = placements[k];
    const f = (saved && fitted(out, all, k, saved)) || freeSpot(out, all, k);
    if (f) out.slots[k] = f;
  }
  return out;
}
