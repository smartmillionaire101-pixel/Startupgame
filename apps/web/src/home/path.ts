/**
 * A* on the home grid: 4-way moves, Manhattan distance, walls between tiles.
 */
import { key } from './layout';

export interface Grid {
  w: number;
  h: number;
  blocked: ReadonlySet<string>;
  /** "x,y|x2,y2" edges you can't cross. */
  walls: ReadonlySet<string>;
}

export interface Tile {
  x: number;
  y: number;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export const inside = (g: Grid, x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h;
export const walkable = (g: Grid, x: number, y: number) =>
  inside(g, x, y) && !g.blocked.has(key(x, y));

function neighbours(g: Grid, t: Tile): Tile[] {
  const out: Tile[] = [];
  for (const [dx, dy] of DIRS) {
    const x = t.x + dx;
    const y = t.y + dy;
    if (!walkable(g, x, y)) continue;
    if (g.walls.has(`${key(t.x, t.y)}|${key(x, y)}`)) continue;
    out.push({ x, y });
  }
  return out;
}

/** The shortest path from `from` to `to` (both included), or null when there's none. */
export function findPath(g: Grid, from: Tile, to: Tile): Tile[] | null {
  if (!walkable(g, to.x, to.y)) return null;
  const start = key(from.x, from.y);
  const goal = key(to.x, to.y);
  if (start === goal) return [from];
  const h = (t: Tile) => Math.abs(t.x - to.x) + Math.abs(t.y - to.y);
  const gScore = new Map<string, number>([[start, 0]]);
  const came = new Map<string, Tile>();
  const tiles = new Map<string, Tile>([[start, from]]);
  // Small grids (≤ 224 tiles): a sorted open list is plenty.
  const open: { k: string; f: number; n: number }[] = [{ k: start, f: h(from), n: 0 }];
  let n = 0;
  const closed = new Set<string>();
  while (open.length) {
    open.sort((a, b) => a.f - b.f || a.n - b.n);
    const cur = open.shift()!;
    if (closed.has(cur.k)) continue;
    if (cur.k === goal) {
      const path: Tile[] = [];
      let k: string | undefined = goal;
      while (k) {
        const t: Tile = tiles.get(k)!;
        path.unshift(t);
        const prev = came.get(k);
        k = prev ? key(prev.x, prev.y) : undefined;
      }
      return path;
    }
    closed.add(cur.k);
    const t = tiles.get(cur.k)!;
    for (const nb of neighbours(g, t)) {
      const nk = key(nb.x, nb.y);
      const score = gScore.get(cur.k)! + 1;
      if (score < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, score);
        came.set(nk, t);
        tiles.set(nk, nb);
        open.push({ k: nk, f: score + h(nb), n: ++n });
      }
    }
  }
  return null;
}

/**
 * A path to `to`, or (when it's blocked or walled off) to the reachable
 * walkable tile nearest it.
 */
export function pathTowards(g: Grid, from: Tile, to: Tile): Tile[] | null {
  const direct = findPath(g, from, to);
  if (direct) return direct;
  let best: Tile[] | null = null;
  let bestD = Infinity;
  for (let x = 0; x < g.w; x++)
    for (let y = 0; y < g.h; y++) {
      if (!walkable(g, x, y)) continue;
      const d = Math.abs(x - to.x) + Math.abs(y - to.y);
      if (d > bestD) continue;
      const p = findPath(g, from, { x, y });
      if (!p) continue;
      if (d < bestD || (best && p.length < best.length)) {
        best = p;
        bestD = d;
      }
    }
  return best;
}
