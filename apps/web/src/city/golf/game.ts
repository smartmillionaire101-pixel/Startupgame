/**
 * Golf: the rules and the ball (no drawing). The city's three holes come
 * from the engine (`golfCourse`); here they get a shape on the ground (tee,
 * fairway, rough, bunkers, a pond, the green and its pin) and a ball that
 * flies, lands, rolls and drops in.
 *
 * The world: metres, y up, the tee at the origin and the hole running
 * towards −z. A shot is the club, the power (0–110 %, held on the meter) and
 * the aim (a heading). Its small miss comes from a seeded stream (your id,
 * the month, the hole and the stroke), so a shot is the same on replay and
 * fair for everyone; rounds played steady your hands a little.
 */
import type { GolfHole } from '@runway/engine';
import { hash, seeded } from '../contract';

export type Lie = 'tee' | 'fairway' | 'rough' | 'bunker' | 'water' | 'fringe' | 'green' | 'holed';

export interface Pt2 {
  x: number;
  z: number;
}
export interface Oval extends Pt2 {
  rx: number;
  rz: number;
}

export interface HoleGeo {
  n: number;
  par: number;
  length: number;
  tee: Pt2;
  pin: Pt2;
  /** The fairway's middle line, tee to green. */
  line: Pt2[];
  /** Where the fairway starts and ends along the line (0–1), and its half-width. */
  fairway: [number, number];
  fairwayHalf: number;
  greenR: number;
  bunkers: Oval[];
  water: Oval | null;
}

export interface Club {
  id: string;
  /** Translatable. */
  label: string;
  /** Carry at full power, metres. */
  carry: number;
  /** Peak height as a share of the carry. */
  loft: number;
  /** Miss at full stretch (degrees). */
  spread: number;
}

export const CLUBS: readonly Club[] = [
  { id: 'driver', label: 'Driver', carry: 235, loft: 0.14, spread: 4.5 },
  { id: 'wood', label: '3-wood', carry: 205, loft: 0.15, spread: 4 },
  { id: 'iron5', label: '5-iron', carry: 172, loft: 0.17, spread: 3.4 },
  { id: 'iron7', label: '7-iron', carry: 146, loft: 0.2, spread: 3 },
  { id: 'iron9', label: '9-iron', carry: 122, loft: 0.24, spread: 2.6 },
  { id: 'wedge', label: 'Wedge', carry: 95, loft: 0.3, spread: 2.2 },
  { id: 'chip', label: 'Sand wedge', carry: 60, loft: 0.34, spread: 2 },
];
export const PUTTER: Club = { id: 'putter', label: 'Putter', carry: 22, loft: 0, spread: 0.9 };

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const dist = (a: Pt2, b: Pt2) => Math.hypot(a.x - b.x, a.z - b.z);

/** The hole's shape on the ground. */
export function holeGeo(h: GolfHole): HoleGeo {
  const L = h.length;
  const side = h.bend * Math.min(60, L * 0.16);
  const pin = { x: side, z: -L };
  // The fairway bends late (a dogleg): straight off the tee, then round.
  const line: Pt2[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    line.push({ x: side * t * t, z: -L * t });
  }
  const r = seeded(hash(`golf-hole:${h.n}:${L}:${h.bend}`));
  const greenR = h.par === 3 ? 15 : 13;
  const bunkers: Oval[] = [];
  for (let k = 0; k < h.bunkers; k++) {
    const a = (k / Math.max(1, h.bunkers)) * Math.PI * 1.4 + 0.5 + r() * 0.5;
    bunkers.push({
      x: pin.x + Math.cos(a) * (greenR + 5),
      z: pin.z + Math.sin(a) * (greenR + 5) * 0.9 + 4,
      rx: 4 + r() * 2,
      rz: 3 + r() * 1.5,
    });
  }
  if (h.par >= 4) {
    const t = Math.min(0.85, 225 / L);
    const c = line[Math.round(t * 24)]!;
    bunkers.push({ x: c.x + (r() < 0.5 ? -1 : 1) * 17, z: c.z, rx: 6, rz: 4 });
  }
  const water = h.water
    ? (() => {
        const t = h.par === 3 ? 0.62 : 0.78;
        const c = line[Math.round(t * 24)]!;
        return { x: c.x + (h.par === 3 ? 0 : (r() < 0.5 ? -1 : 1) * 14), z: c.z, rx: 16, rz: 9 };
      })()
    : null;
  return {
    n: h.n,
    par: h.par,
    length: L,
    tee: { x: 0, z: 0 },
    pin,
    line,
    fairway: h.par === 3 ? [0.82, 0.95] : [0.16, 0.96],
    fairwayHalf: 17,
    greenR,
    bunkers,
    water,
  };
}

/** The nearest point on the fairway's line: its distance and where along it (0–1). */
function nearLine(g: HoleGeo, p: Pt2) {
  let best = { d: Infinity, t: 0 };
  for (let i = 0; i + 1 < g.line.length; i++) {
    const a = g.line[i]!;
    const b = g.line[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
    const d = Math.hypot(p.x - (a.x + u * dx), p.z - (a.z + u * dz));
    if (d < best.d) best = { d, t: (i + u) / (g.line.length - 1) };
  }
  return best;
}

const inOval = (o: Oval, p: Pt2) => ((p.x - o.x) / o.rx) ** 2 + ((p.z - o.z) / o.rz) ** 2 <= 1;

/** What the ball sits on here. Far off the line is the trees (the ball stops in the rough). */
export function lieAt(g: HoleGeo, p: Pt2): Lie {
  const toPin = dist(p, g.pin);
  if (toPin <= g.greenR) return 'green';
  if (g.water && inOval(g.water, p)) return 'water';
  if (g.bunkers.some((b) => inOval(b, p))) return 'bunker';
  if (toPin <= g.greenR + 3) return 'fringe';
  const n = nearLine(g, p);
  if (n.d <= g.fairwayHalf && n.t >= g.fairway[0] && n.t <= g.fairway[1]) return 'fairway';
  if (dist(p, g.tee) < 4) return 'tee';
  return 'rough';
}

/** How far off the middle line you can go before the trees. */
export const TREE_LINE = 48;

/** The club for this distance and lie (the driver only off the tee). */
export function clubFor(distance: number, lie: Lie): Club {
  if (lie === 'green') return PUTTER;
  const pool = CLUBS.filter((c) => c.id !== 'driver' || lie === 'tee');
  const reach = (c: Club) => c.carry * LIE_CARRY[lie];
  return (
    pool
      .slice()
      .reverse()
      .find((c) => reach(c) >= distance * 0.97) ?? pool[0]!
  );
}

/** How far a club carries from each lie (out of a bunker, much less). */
export const LIE_CARRY: Record<Lie, number> = {
  tee: 1,
  fairway: 1,
  fringe: 1,
  green: 1,
  rough: 0.85,
  bunker: 0.65,
  water: 0.85,
  holed: 1,
};
const LIE_SPREAD: Record<Lie, number> = {
  tee: 1,
  fairway: 1,
  fringe: 1,
  green: 1,
  rough: 1.35,
  bunker: 1.8,
  water: 1.35,
  holed: 1,
};

/** The heading (radians, 0 = −z, positive to the right, +x) from a to b. */
export const headingTo = (a: Pt2, b: Pt2) => Math.atan2(b.x - a.x, -(b.z - a.z));
export const along = (p: Pt2, h: number, d: number): Pt2 => ({
  x: p.x + Math.sin(h) * d,
  z: p.z - Math.cos(h) * d,
});

/** Where to aim by default: the pin, or the fairway's middle when the pin's out of reach. */
export function defaultAim(g: HoleGeo, ball: Pt2, club: Club, lie: Lie): number {
  const reach = club.carry * LIE_CARRY[lie];
  if (club === PUTTER || dist(ball, g.pin) <= reach * 1.05) return headingTo(ball, g.pin);
  const here = nearLine(g, ball).t;
  // The point on the line about one shot ahead.
  let best = g.line[g.line.length - 1]!;
  for (let i = Math.ceil(here * 24); i < g.line.length; i++) {
    const c = g.line[i]!;
    if (dist(ball, c) >= reach * 0.92) {
      best = c;
      break;
    }
  }
  return headingTo(ball, best);
}

export interface Shot {
  club: Club;
  from: Pt2;
  /** Where it lands, where it stops (after the roll). */
  land: Pt2;
  rest: Pt2;
  /** Peak height, metres (0 for a putt). */
  apex: number;
  /** Sideways curve at the middle of the flight (metres, + right). */
  curve: number;
  heading: number;
  carry: number;
  roll: number;
  lie: Lie;
  /** Dropped after the water (one penalty stroke). */
  penalty: boolean;
  holed: boolean;
}

/** One stroke's own random stream (fair, the same on replay). */
export const strokeRng = (seed: string, hole: number, stroke: number) =>
  seeded(hash(`golf:${seed}:${hole}:${stroke}`));

/** Skill from rounds played: 0 (first round) … 0.5. */
export const skillOf = (rounds: number) => Math.min(0.5, rounds * 0.04);

/**
 * Hit the ball. `power` is 0–110 (over 100 is a lunge: a little further,
 * much less straight); `aim` is the heading.
 */
export function hit(
  g: HoleGeo,
  ball: Pt2,
  lie: Lie,
  club: Club,
  power: number,
  aim: number,
  rnd: () => number,
  skill = 0,
): Shot {
  const p = Math.max(0.05, Math.min(1.1, power / 100));
  const steady = 1 - skill;
  if (club === PUTTER) {
    const miss = ((rnd() * 2 - 1) * club.spread * steady * Math.PI) / 180;
    const heading = aim + miss;
    const roll = p * club.carry;
    const toHole = dist(ball, g.pin);
    // Holed: it reaches the cup on line and isn't racing (or it's a tap-in).
    const end = along(ball, heading, roll);
    const ahead = (g.pin.x - ball.x) * Math.sin(heading) - (g.pin.z - ball.z) * Math.cos(heading);
    const wide = Math.abs(
      (g.pin.x - ball.x) * Math.cos(heading) + (g.pin.z - ball.z) * Math.sin(heading),
    );
    const holed =
      toHole < 0.9 || (ahead > 0 && roll >= toHole - 0.2 && roll <= toHole + 3 && wide < 0.2);
    let rest = holed ? { ...g.pin } : end;
    if (!holed && lieAt(g, rest) !== 'green' && lieAt(g, rest) !== 'fringe')
      rest = along(ball, heading, Math.min(roll, toHole + g.greenR * 0.6));
    return {
      club,
      from: ball,
      land: ball,
      rest,
      apex: 0,
      curve: 0,
      heading,
      carry: 0,
      roll: holed ? toHole : dist(ball, rest),
      lie: holed ? 'holed' : lieAt(g, rest),
      penalty: false,
      holed,
    };
  }
  const over = Math.max(0, p - 1);
  const spreadDeg =
    club.spread * LIE_SPREAD[lie] * steady * (0.55 + 0.45 * Math.min(1, p)) + over * 60;
  // A miss is a push or pull plus a curve the same way (hooks and slices).
  const u = rnd() * 2 - 1;
  const hook = over > 0 ? -1 : 0;
  const missDeg = u * spreadDeg + hook * over * 40;
  const heading = aim + (missDeg * 0.55 * Math.PI) / 180;
  const carry =
    club.carry * LIE_CARRY[lie] * Math.min(p, 1) * (1 + over * 0.6) * (0.97 + rnd() * 0.05);
  const curve = Math.tan((missDeg * 0.45 * Math.PI) / 180) * carry;
  const straight = along(ball, heading, carry);
  // The curve bends the landing sideways (right is +).
  const land = {
    x: straight.x + Math.cos(heading) * curve,
    z: straight.z + Math.sin(heading) * curve,
  };
  const landLie = lieAt(g, land);
  const rollShare =
    landLie === 'green' ? 0.06 : landLie === 'fairway' ? 0.11 : landLie === 'bunker' ? 0 : 0.03;
  const rollH = headingTo(ball, land);
  let rest = landLie === 'water' ? land : along(land, rollH, carry * rollShare);
  // Trees stop it at the edge of the rough.
  const n = nearLine(g, rest);
  if (n.d > TREE_LINE) {
    const t = Math.round(n.t * (g.line.length - 1));
    const c = g.line[Math.max(0, Math.min(g.line.length - 1, t))]!;
    const k = TREE_LINE / n.d;
    rest = { x: c.x + (rest.x - c.x) * k, z: c.z + (rest.z - c.z) * k };
  }
  // Past the green there is a bank: it can't run away for ever.
  if (dist(rest, g.pin) > dist(ball, g.pin) + 40 && dist(ball, g.pin) < 120)
    rest = along(g.pin, headingTo(g.pin, rest), g.greenR + 18);
  let lie2 = lieAt(g, rest);
  let penalty = false;
  if (lie2 === 'water' || lieAt(g, land) === 'water') {
    // Drop behind the pond, back towards where you played from, one stroke added.
    penalty = true;
    const back = headingTo(land, ball);
    const w = g.water!;
    let drop = { ...land };
    for (let k = 0; k < 40 && lieAt(g, drop) === 'water'; k++) drop = along(drop, back, 2);
    rest = along(drop, back, 3);
    lie2 = lieAt(g, rest);
    void w;
  }
  // A lucky one: it dropped in from the fairway.
  const holed = !penalty && dist(rest, g.pin) < 0.3;
  return {
    club,
    from: ball,
    land,
    rest: holed ? { ...g.pin } : rest,
    apex: carry * club.loft,
    curve,
    heading,
    carry,
    roll: dist(land, rest),
    lie: holed ? 'holed' : lie2,
    penalty,
    holed,
  };
}

/** Where the ball is `u` (0–1) of the way through the flight (x, height, z). */
export function flightAt(s: Shot, u: number) {
  const k = Math.max(0, Math.min(1, u));
  const straight = along(s.from, s.heading, s.carry * k);
  const side = s.curve * k * k;
  return {
    x: straight.x + Math.cos(s.heading) * side,
    y: 4 * s.apex * k * (1 - k),
    z: straight.z + Math.sin(s.heading) * side,
  };
}

/** Where the ball is `u` (0–1) of the way through its roll (it slows down). */
export function rollAt(s: Shot, u: number) {
  const k = 1 - (1 - Math.max(0, Math.min(1, u))) ** 2;
  return { x: lerp(s.land.x, s.rest.x, k), y: 0, z: lerp(s.land.z, s.rest.z, k) };
}

/** The most a hole counts (a pick-up after this many). */
export const MAX_STROKES = 10;

/** An AI partner's card: par give or take, from the seed. */
export function partnerCard(seed: string, pars: readonly number[]): number[] {
  const r = seeded(hash(`golf-partner:${seed}`));
  const spread = [-1, 0, 0, 0, 1, 1, 1, 2];
  return pars.map((p) => p + spread[Math.floor(r() * spread.length)]!);
}

/** Golf words for a score against par on one hole. */
export function scoreName(strokes: number, par: number): string {
  const d = strokes - par;
  if (strokes === 1) return 'Hole in one!';
  if (d <= -3) return 'Albatross!';
  if (d === -2) return 'Eagle!';
  if (d === -1) return 'Birdie!';
  if (d === 0) return 'Par';
  if (d === 1) return 'Bogey';
  if (d === 2) return 'Double bogey';
  if (d === 3) return 'Triple bogey';
  return 'Holed out';
}

// ---------------------------------------------------------------------------
// For the HUD and the scorecard (no physics here: they only read shots).

/** Where the power meter is: winding up, the sweet spot (80–100 %), or a lunge. */
export type PowerZone = 'build' | 'sweet' | 'lunge';
export const SWEET_FROM = 80;
export const SWEET_TO = 100;
export const POWER_MAX = 110;
export const powerZone = (power: number): PowerZone =>
  power > SWEET_TO ? 'lunge' : power >= SWEET_FROM ? 'sweet' : 'build';

/** A hole's score as golf marks it on the card. */
export type ScoreMark = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double';
export function scoreMark(strokes: number, par: number): ScoreMark {
  const d = strokes - par;
  return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double';
}

/** One stroke as the round remembers it (for the mini-map trace and the card's numbers). */
export interface ShotLog {
  hole: number;
  /** The hole's par (a drive is a tee shot on a par 4 or 5). */
  par: number;
  club: string;
  from: Pt2;
  land: Pt2;
  rest: Pt2;
  /** What it came to rest on ('holed' when it dropped). */
  lie: Lie;
  /** The lie it was played from. */
  fromLie: Lie;
  penalty: boolean;
}

/** How far a shot went, from where it was played to where it stopped. */
export const shotLength = (s: Pick<ShotLog, 'from' | 'rest'>) => dist(s.from, s.rest);

export interface RoundStats {
  putts: number;
  /** Tee shots on par 4s and 5s that stopped on the fairway, of how many. */
  fairways: number;
  fairwayHoles: number;
  /** The longest tee shot on a par 4 or 5, metres (0 = none). */
  longest: number;
}

export function roundStats(log: readonly ShotLog[]): RoundStats {
  let putts = 0;
  let fairways = 0;
  let fairwayHoles = 0;
  let longest = 0;
  const teed = new Set<number>();
  for (const s of log) {
    if (s.club === PUTTER.id) putts++;
    if (s.fromLie === 'tee' && s.par >= 4 && !teed.has(s.hole)) {
      teed.add(s.hole);
      fairwayHoles++;
      if (s.lie === 'fairway' && !s.penalty) fairways++;
      if (!s.penalty) longest = Math.max(longest, shotLength(s));
    }
  }
  return { putts, fairways, fairwayHoles, longest: Math.round(longest) };
}
