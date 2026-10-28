/**
 * Ten-pin bowling, played out: the ball down the lane (where it's released,
 * its line, its speed and the hook it picks up once it leaves the oil), the
 * ten pins it scatters (pins knock pins, off the kickbacks and into the pit),
 * and the scoring (ten frames, strikes and spares counting the next balls, the
 * tenth frame's bonus balls).
 *
 * Distances in metres, seen from the bowler: x across the lane (0 is the
 * middle, positive to the right), z down the lane from the foul line (the
 * head pin stands at 18.29 m). Pins are numbered 1–10 the usual way: 1 at the
 * front, 7 back left, 10 back right. The physics is plain discs on a deck with
 * a fixed step, so the same throw always ends the same way (the engine owns
 * the outcome; the client replays it for the animation).
 */
import type { Rng } from './rng.js';

/** Foul line to the head pin. */
export const LANE_LEN = 18.29;
/** Half the lane's width (41.5 inches). */
export const LANE_HALF = 0.527;
/** The gutters' width; the kickbacks (the side walls of the pin deck) stand beyond them. */
export const GUTTER_W = 0.235;
export const KICKBACK = LANE_HALF + GUTTER_W;
/** Where the oil ends and the ball starts to hook (40 feet). */
export const OIL_END = 12.2;
export const BALL_R = 0.109;
export const PIN_R = 0.0605;
/** A pin knocked down: its footprint lying on the deck (it sweeps more). */
export const PIN_DOWN_R = 0.085;
const BALL_M = 6.8;
const PIN_M = 1.55;
/** Pins 12 inches apart, rows 12·cos 30° deep. */
export const PIN_SPACE = 0.3048;
export const PIN_ROW = 0.264;
/** Past the back row: the pit. */
export const PIT_Z = LANE_LEN + 3 * PIN_ROW + 0.32;
/**
 * The pin deck: a pin struck slower than `tipV` wobbles and stays up, and
 * wood on wood keeps `pins` of its speed. 'lively' is the deck as it first
 * shipped; 'true' (the feedback round, playtest round 6: two strikes from two
 * plain straight swipes) carries less, so a hook into the pocket strikes far
 * more often than a straight ball does.
 */
export type BowlDeck = 'lively' | 'true';
const DECKS: Record<BowlDeck, { tipV: number; pins: number }> = {
  lively: { tipV: 0.6, pins: 0.5 },
  true: { tipV: 1.0, pins: 0.25 },
};
/** Ball to pin. */
const RESTITUTION = 0.72;
/** A fallen pin sliding on the deck slows this much (m/s²). */
const PIN_FRICTION = 1.6;
/** Full hook (m/s² across, spin 1) on the dry back end; in the oil a sliver of it. */
const HOOK = 1.35;
const OIL_HOOK = 0.1;
const DT = 1 / 400;
/** The longest a roll plays out (s). */
const MAX_T = 6;
/** Pins keep moving this long after the ball reaches the deck (s). */
const SETTLE = 2.2;

/** Pin n (1–10) where it stands. */
export const PIN_SPOTS: readonly (readonly [number, number])[] = [
  [0, LANE_LEN],
  [-PIN_SPACE / 2, LANE_LEN + PIN_ROW],
  [PIN_SPACE / 2, LANE_LEN + PIN_ROW],
  [-PIN_SPACE, LANE_LEN + 2 * PIN_ROW],
  [0, LANE_LEN + 2 * PIN_ROW],
  [PIN_SPACE, LANE_LEN + 2 * PIN_ROW],
  [(-PIN_SPACE * 3) / 2, LANE_LEN + 3 * PIN_ROW],
  [-PIN_SPACE / 2, LANE_LEN + 3 * PIN_ROW],
  [PIN_SPACE / 2, LANE_LEN + 3 * PIN_ROW],
  [(PIN_SPACE * 3) / 2, LANE_LEN + 3 * PIN_ROW],
];
export const FULL_RACK: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** What the bowler does: where they let go, the line, how hard, how much hook. */
export interface BowlInput {
  /** Release point across the foul line (m, −0.45 … 0.45). */
  x: number;
  /** The line (radians off straight, positive to the right). */
  aim: number;
  /** 0 … 1: how hard. */
  power: number;
  /** −1 … 1: the hook (positive curls right, a right-hander's hook is negative). */
  spin: number;
}

/** The throw as it actually left the hand (the input with the bowler's wobble). */
export interface BowlLaunch {
  x: number;
  aim: number;
  /** m/s. */
  speed: number;
  spin: number;
}

export interface PinState {
  n: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  down: boolean;
  /** Seconds into the roll it was knocked over (−1: standing). */
  at: number;
  /** The way it fell (radians, 0 = down the lane). */
  dir: number;
  /** In the pit or the gutter: gone from the deck. */
  gone: boolean;
}

export interface BowlFrame {
  t: number;
  ball: { x: number; z: number; gutter: boolean };
  pins: { n: number; x: number; z: number; down: boolean; dir: number }[];
}

export interface BowlSim {
  /** Pin numbers knocked down this roll. */
  knocked: number[];
  gutter: boolean;
  /** Seconds the roll took (the ball to the pit, the pins settled). */
  time: number;
  /** When the ball reached the first pin row (s; −1 if it never did on the lane). */
  impact: number;
  /** Where the ball crossed the head pin's row (m across). */
  entry: number;
  pins: PinState[];
  /** Every 1/60 s, when asked for (the client's animation). */
  frames: BowlFrame[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The ball's speed for a power (6.2 m/s, a gentle roll, to 9.6 m/s, 21 mph). */
export const bowlSpeed = (power: number) => 6.2 + 3.4 * clamp(power, 0, 1);

/** The input as a launch with no wobble (what the client previews). */
export function launchOf(i: BowlInput): BowlLaunch {
  return {
    x: clamp(i.x, -0.45, 0.45),
    aim: clamp(i.aim, -0.2, 0.2),
    speed: bowlSpeed(i.power),
    spin: clamp(i.spin, -1, 1),
  };
}

/**
 * The bowler's execution: a steadier bowler (skill 0 … 1) wobbles less. The
 * same rng draws the same wobble, so a roll comes out the same on replay.
 */
export function wobble(rng: Rng, i: BowlInput, skill: number): BowlLaunch {
  const s = clamp(skill, 0, 1);
  const l = launchOf(i);
  return {
    x: clamp(l.x + rng.normal(0, 0.01 + 0.03 * (1 - s)), -0.5, 0.5),
    aim: clamp(l.aim + rng.normal(0, 0.002 + 0.01 * (1 - s)), -0.25, 0.25),
    speed: Math.max(4, l.speed * (1 + rng.normal(0, 0.008 + 0.03 * (1 - s)))),
    spin: clamp(l.spin + rng.normal(0, 0.04 + 0.15 * (1 - s)), -1.2, 1.2),
  };
}

/**
 * The ball's line with no pins in the way: where it is at depth `z` (m
 * across), or null once it's in the gutter. For aiming (the AI, the guide).
 */
export function ballLineAt(l: BowlLaunch, z: number): number | null {
  const vz = l.speed * Math.cos(l.aim);
  let x = l.x,
    bz = 0,
    vx = l.speed * Math.sin(l.aim);
  for (let t = 0; t < MAX_T && bz < z; t += DT) {
    vx += (bz < OIL_END ? OIL_HOOK : 1) * HOOK * l.spin * DT;
    x += vx * DT;
    bz += vz * DT;
    if (Math.abs(x) > LANE_HALF) return null;
  }
  return x;
}

/**
 * Play a roll out at the pins still standing (pin numbers). Deterministic:
 * a fixed step, a fixed order. `record` keeps the frames for the animation.
 */
export function simulateBowl(
  standing: readonly number[],
  l: BowlLaunch,
  record = false,
  deck: BowlDeck = 'lively',
): BowlSim {
  const { tipV, pins: pinE } = DECKS[deck];
  const pins: PinState[] = standing
    .filter((n) => n >= 1 && n <= 10)
    .map((n) => ({
      n,
      x: PIN_SPOTS[n - 1]![0],
      z: PIN_SPOTS[n - 1]![1],
      vx: 0,
      vz: 0,
      down: false,
      at: -1,
      dir: 0,
      gone: false,
    }));
  const ball = {
    x: l.x,
    z: 0,
    vx: l.speed * Math.sin(l.aim),
    vz: l.speed * Math.cos(l.aim),
    gutter: false,
    gone: false,
  };
  const frames: BowlFrame[] = [];
  let impact = -1;
  let entry = NaN;
  let end = MAX_T;
  let t = 0;
  let nextFrame = 0;
  const snap = () =>
    frames.push({
      t,
      ball: { x: ball.x, z: ball.z, gutter: ball.gutter },
      pins: pins.map((p) => ({ n: p.n, x: p.x, z: p.z, down: p.down, dir: p.dir })),
    });
  const knock = (p: PinState, vx: number, vz: number) => {
    if (p.down) return;
    p.down = true;
    p.at = t;
    p.dir = Math.atan2(vx, vz);
  };
  for (; t < end; t += DT) {
    if (record && t >= nextFrame) {
      snap();
      nextFrame += 1 / 60;
    }
    // The ball: the hook once it's off the oil, the gutter if it drops off the edge.
    if (!ball.gone) {
      if (!ball.gutter) ball.vx += (ball.z < OIL_END ? OIL_HOOK : 1) * HOOK * l.spin * DT;
      ball.x += ball.vx * DT;
      ball.z += ball.vz * DT;
      if (!ball.gutter && Math.abs(ball.x) > LANE_HALF) {
        ball.gutter = true;
        ball.x = Math.sign(ball.x) * (LANE_HALF + 0.12);
        ball.vx = 0;
      }
      if (Number.isNaN(entry) && ball.z >= LANE_LEN) entry = ball.x;
      if (impact < 0 && ball.z >= LANE_LEN - BALL_R - PIN_R) {
        impact = t;
        end = Math.min(MAX_T, t + SETTLE);
      }
      if (ball.z > PIT_Z) ball.gone = true;
    }
    // Fallen pins slide and slow; off the deck into the pit or the gutter.
    for (const p of pins) {
      if (!p.down || p.gone) continue;
      const v = Math.hypot(p.vx, p.vz);
      if (v > 0) {
        const k = Math.max(0, v - PIN_FRICTION * DT) / v;
        p.vx *= k;
        p.vz *= k;
      }
      p.x += p.vx * DT;
      p.z += p.vz * DT;
      if (Math.abs(p.x) > KICKBACK - PIN_DOWN_R) {
        p.x = Math.sign(p.x) * (KICKBACK - PIN_DOWN_R);
        p.vx = -p.vx * 0.5;
      }
      if (p.z > PIT_Z + 0.1 || p.z < LANE_LEN - 1.2) p.gone = true;
    }
    // The ball into pins (not from the gutter).
    if (!ball.gone && !ball.gutter && ball.z > LANE_LEN - 0.4)
      for (const p of pins) {
        if (p.gone) continue;
        hit(ball, BALL_R, BALL_M, p, p.down ? PIN_DOWN_R : PIN_R, RESTITUTION, knock, tipV);
      }
    // Pins into pins.
    for (let i = 0; i < pins.length; i++) {
      const a = pins[i]!;
      if (a.gone) continue;
      for (let j = i + 1; j < pins.length; j++) {
        const b = pins[j]!;
        if (b.gone || (!a.down && !b.down)) continue;
        if (a.down) hit(a, PIN_DOWN_R, PIN_M, b, b.down ? PIN_DOWN_R : PIN_R, pinE, knock, tipV);
        else hit(b, PIN_DOWN_R, PIN_M, a, PIN_R, pinE, knock, tipV);
      }
    }
    if (ball.gone && pins.every((p) => !p.down || p.gone || Math.hypot(p.vx, p.vz) < 0.02)) {
      end = Math.min(end, t + 0.3);
    }
  }
  if (record) snap();
  return {
    knocked: pins.filter((p) => p.down).map((p) => p.n),
    gutter: ball.gutter,
    time: Math.round(t * 1000) / 1000,
    impact: Math.round(impact * 1000) / 1000,
    entry: Number.isNaN(entry) ? 0 : Math.round(entry * 1000) / 1000,
    pins,
    frames,
  };
}

/**
 * A moving body `a` meets pin `p`. A standing pin struck hard enough goes
 * down and moves; struck softly it wobbles and stays, and `a` glances off it.
 */
function hit(
  a: { x: number; z: number; vx: number; vz: number },
  ra: number,
  ma: number,
  p: PinState,
  rp: number,
  e: number,
  knock: (p: PinState, vx: number, vz: number) => void,
  tipV: number,
) {
  const dx = p.x - a.x,
    dz = p.z - a.z;
  const d = Math.hypot(dx, dz);
  const min = ra + rp;
  if (d >= min || d === 0) return;
  const nx = dx / d,
    nz = dz / d;
  const vn = (a.vx - p.vx) * nx + (a.vz - p.vz) * nz;
  if (vn > 0) {
    if (!p.down && vn < tipV) {
      // A wobble: the pin holds, the other bounces off it.
      a.vx -= (1 + e) * vn * nx;
      a.vz -= (1 + e) * vn * nz;
    } else {
      const j = ((1 + e) * vn) / (1 / ma + 1 / PIN_M);
      a.vx -= (j / ma) * nx;
      a.vz -= (j / ma) * nz;
      p.vx += (j / PIN_M) * nx;
      p.vz += (j / PIN_M) * nz;
      knock(p, p.vx, p.vz);
    }
  }
  // Apart again (a standing pin holds its spot).
  const over = min - d;
  if (p.down) {
    const wa = 1 / ma,
      wp = 1 / PIN_M;
    a.x -= (nx * over * wa) / (wa + wp);
    a.z -= (nz * over * wa) / (wa + wp);
    p.x += (nx * over * wp) / (wa + wp);
    p.z += (nz * over * wp) / (wa + wp);
  } else {
    a.x -= nx * over;
    a.z -= nz * over;
  }
}

// ---------------------------------------------------------------- Scoring

export interface BowlFrameScore {
  rolls: number[];
  /** The running total once the frame can be scored (null: waiting on bonus balls). */
  total: number | null;
  /** How the frame reads on the sheet: X, /, − and the counts. */
  marks: string[];
}

export interface BowlGameState {
  frames: BowlFrameScore[];
  /** The total so far (frames that can be scored). */
  score: number;
  /** What the sheet would read now, counting the bonus balls bowled so far (≥ score). */
  soFar: number;
  /** All ten frames bowled. */
  done: boolean;
  /** The frame the next ball is in (0–9), and which ball of it (0–2). */
  frame: number;
  ball: number;
  /** The next ball gets a fresh rack (a first ball, or the tenth's after a strike or spare). */
  fresh: boolean;
  /** How many pins stand for the next ball. */
  pinsUp: number;
}

/**
 * A bowler's game from their rolls (pins down per ball), in order: the frames,
 * the running totals, and where the next ball goes. Strikes count the next two
 * balls, spares the next one; the tenth frame gives a third ball after a
 * strike or a spare. A perfect game is twelve strikes, 300.
 */
export function bowlingGame(rolls: readonly number[]): BowlGameState {
  const frames: BowlFrameScore[] = [];
  let i = 0;
  let running = 0;
  let scorable = true;
  for (let f = 0; f < 10 && i < rolls.length; f++) {
    const a = rolls[i]!;
    let used: number[];
    let bonus: number[] = [];
    if (f < 9) {
      if (a === 10) {
        used = [10];
        bonus = rolls.slice(i + 1, i + 3);
        i += 1;
        scorable &&= bonus.length === 2;
      } else {
        used = rolls.slice(i, i + 2);
        i += used.length;
        if (used.length === 2 && used[0]! + used[1]! === 10) {
          bonus = rolls.slice(i, i + 1);
          scorable &&= bonus.length === 1;
        } else scorable &&= used.length === 2;
      }
    } else {
      // The tenth: a third ball after a strike or a spare.
      used = rolls.slice(i, i + 3);
      if (used.length >= 2 && used[0] !== 10 && used[0]! + used[1]! !== 10) used = used.slice(0, 2);
      i += used.length;
      scorable &&= !needMore(used);
    }
    const pins = used.reduce((s, x) => s + x, 0) + bonus.reduce((s, x) => s + x, 0);
    if (scorable) running += pins;
    frames.push({ rolls: used, total: scorable ? running : null, marks: marksOf(used) });
  }
  // Where the next ball goes.
  const n = frames.length;
  const last = frames[n - 1];
  const done = n === 10 && !needMore(last!.rolls);
  let frame = 0;
  let ball = 0;
  if (last && !done) {
    const open = n === 10 || (last.rolls.length === 1 && last.rolls[0] !== 10);
    frame = open ? n - 1 : n;
    ball = open ? last.rolls.length : 0;
  } else if (done) frame = 9;
  let pinsUp = 10;
  let fresh = true;
  if (!done && ball > 0) {
    const r = frames[frame]!.rolls;
    if (ball === 1) {
      fresh = r[0] === 10;
      pinsUp = fresh ? 10 : 10 - r[0]!;
    } else {
      // The tenth's third ball: after a strike, the second ball's leave (or a fresh rack).
      fresh = r[0] === 10 ? r[1] === 10 : true;
      pinsUp = fresh ? 10 : 10 - r[1]!;
    }
  }
  return {
    frames,
    score: frames.reduce((s, f) => (f.total === null ? s : f.total), 0),
    // Every pin down so far with the bonus balls already bowled (playtest round 6:
    // two strikes read 0 until the third ball).
    soFar: frames.reduce((s, _f, k) => s + framePins(rolls, frames, k), 0),
    done,
    frame,
    ball,
    fresh,
    pinsUp,
  };
}

/** A frame's pins with whatever of its bonus balls have been bowled. */
function framePins(rolls: readonly number[], frames: BowlFrameScore[], k: number) {
  const f = frames[k]!;
  const own = f.rolls.reduce((s, x) => s + x, 0);
  if (k === 9) return own;
  const at = frames.slice(0, k + 1).reduce((s, x) => s + x.rolls.length, 0);
  const bonus = f.rolls[0] === 10 ? 2 : f.rolls.length === 2 && own === 10 ? 1 : 0;
  return own + rolls.slice(at, at + bonus).reduce((s, x) => s + x, 0);
}

/** A tenth frame still owed a ball. */
function needMore(r: readonly number[]) {
  if (r.length < 2) return true;
  if (r[0] === 10 || r[0]! + r[1]! === 10) return r.length < 3;
  return false;
}

function marksOf(r: readonly number[]): string[] {
  const out: string[] = [];
  let up = 10;
  for (const v of r) {
    if (up === 10 && v === 10) out.push('X');
    else if (up < 10 && v === up) {
      out.push('/');
      up = 10;
      continue;
    } else {
      out.push(v === 0 ? '−' : String(v));
      up -= v;
      continue;
    }
    up = 10;
  }
  return out;
}

// ---------------------------------------------------------------- Aiming

/**
 * The line that takes a ball released at `x0` with this power and hook to
 * `target` across at depth `z` (a bisection on the line; ±0.2 rad at most).
 */
export function aimFor(x0: number, power: number, spin: number, target: number, z = LANE_LEN) {
  let lo = -0.2,
    hi = 0.2;
  const at = (aim: number) => {
    const l = launchOf({ x: x0, aim, power, spin });
    // In the gutter: past the edge on the side it went.
    return ballLineAt(l, z) ?? (aim > 0 ? LANE_HALF + 1 : -LANE_HALF - 1);
  };
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < target) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 1e5) / 1e5;
}

/** Where to hit a leave (pins standing): the front pins, weighted to the middle of them. */
export function spareTarget(standing: readonly number[]) {
  const up = standing.filter((n) => n >= 1 && n <= 10);
  if (!up.length) return { x: 0, z: LANE_LEN };
  const front = Math.min(...up.map((n) => PIN_SPOTS[n - 1]![1]));
  const xs = up.map((n) => PIN_SPOTS[n - 1]![0]);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  // Lead with the front pin, leaning towards the middle of the leave.
  const lead = up
    .filter((n) => PIN_SPOTS[n - 1]![1] === front)
    .map((n) => PIN_SPOTS[n - 1]![0])
    .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0]!;
  return { x: lead + (mid - lead) * 0.35, z: front };
}

/**
 * How an AI bowler (or a suggested line) plays: a hooking ball into the 1–3
 * pocket at a full rack, a straighter ball at the heart of a leave. The
 * engine adds the bowler's wobble.
 */
export function aiBowl(rng: Rng, standing: readonly number[]): BowlInput {
  const power = 0.55 + rng.range(0, 0.15);
  if (standing.length === 10) {
    const x0 = 0.3,
      spin = -0.55;
    return { x: x0, aim: aimFor(x0, power, spin, 0.075), power, spin };
  }
  const tgt = spareTarget(standing);
  const x0 = clamp(-tgt.x * 0.6, -0.4, 0.4);
  return { x: x0, aim: aimFor(x0, power, 0, tgt.x, tgt.z), power, spin: 0 };
}
