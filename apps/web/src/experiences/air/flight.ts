/**
 * The skydive and the helicopter ride as plain state you step forward (the
 * 3D view, ./AirFlight.tsx, only draws it): the climb, the exit, freefall
 * with your body position to hold, the pull, the canopy you steer to the
 * landing target and the flare; and a helicopter flying a route past the
 * city's landmarks, by autopilot or by your hand. Metres: x east, z south,
 * y up (the 3D city's own). Pure: the unit tests step every phase.
 */
import { SKYDIVE } from '@runway/engine';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- The skydive

type JumpPhase = 'climb' | 'door' | 'freefall' | 'canopy' | 'landed';

/**
 * Time runs faster than real (a jump's minute of freefall and few minutes
 * under canopy in about a minute), the same way at any frame rate.
 */
export const JUMP = {
  /** The climb to altitude (s on screen). */
  climbS: 9,
  exit: SKYDIVE.exit,
  /** Freefall: terminal velocity (m/s, real) and the speed-up. */
  terminal: 55,
  freefallX: 3.2,
  /** Under canopy: sink and forward speed (m/s, real) and the speed-up. */
  sink: 5,
  glide: 10,
  canopyX: 9,
  /** Degrees a second the canopy turns at full toggle (on screen). */
  turnRate: 0.75,
  /** Tracking across the sky in freefall (m/s, real). */
  track: 14,
  /** The opener fires the reserve here if you haven't pulled. */
  aad: SKYDIVE.deployLow,
  /** Flare in the last metres: the canopy slows to a stand-up landing. */
  flareAt: 25,
  /** Exit this far from the target, upwind (m). */
  offset: 1400,
  /** Body position: inside this (−1 … 1) counts as stable. */
  stableBand: 0.35,
} as const;

export interface Jump {
  phase: JumpPhase;
  /** Seconds in this phase (on screen). */
  t: number;
  x: number;
  z: number;
  alt: number;
  heading: number;
  /** Where to land (the target's centre). */
  tx: number;
  tz: number;
  /** Body position in freefall (0 = a perfect arch). */
  body: number;
  /** Seconds of freefall, and of them stable. */
  fall: number;
  stable: number;
  deployAt: number | null;
  flared: boolean;
  /** At touchdown: metres from the target's centre. */
  miss: number | null;
}

export interface JumpInput {
  /** −1 … 1: turn left or right (toggles under canopy, a turn in freefall). */
  turn: number;
  /** Track forward in freefall (arms back, legs straight). */
  track: boolean;
}

/** A jump from the plane over the city, upwind of the target, heading for it. */
export function newJump(tx: number, tz: number, windFrom = 0.6): Jump {
  const x = tx + Math.sin(windFrom) * JUMP.offset;
  const z = tz - Math.cos(windFrom) * JUMP.offset;
  return {
    phase: 'climb',
    t: 0,
    x,
    z,
    alt: 900,
    heading: Math.atan2(tx - x, -(tz - z)),
    tx,
    tz,
    body: 0,
    fall: 0,
    stable: 0,
    deployAt: null,
    flared: false,
    miss: null,
  };
}

/** The bearing from the jumper to the target (radians, 0 = north) and the distance. */
export function toTarget(j: Jump) {
  return {
    bearing: Math.atan2(j.tx - j.x, -(j.tz - j.z)),
    dist: Math.hypot(j.tx - j.x, j.tz - j.z),
  };
}

/**
 * One step of `dt` seconds (on screen). `drift` is the air pushing your body
 * position about (−1 … 1, the caller's noise); `arch` nudges it back.
 */
export function stepJump(j: Jump, dt: number, input: JumpInput, drift = 0): Jump {
  const s: Jump = { ...j, t: j.t + dt };
  if (s.phase === 'climb') {
    s.alt = 900 + (JUMP.exit - 900) * Math.min(1, s.t / JUMP.climbS);
    if (s.t >= JUMP.climbS) return { ...s, phase: 'door', t: 0, alt: JUMP.exit };
    return s;
  }
  if (s.phase === 'door' || s.phase === 'landed') return s;
  if (s.phase === 'freefall') {
    const k = dt * JUMP.freefallX;
    s.alt -= JUMP.terminal * k;
    s.heading = wrap(s.heading + input.turn * 1.4 * dt);
    const v = input.track ? JUMP.track : 2;
    s.x += Math.sin(s.heading) * v * k;
    s.z -= Math.cos(s.heading) * v * k;
    // The air pushes you about; a still body (no input) settles a little by itself.
    s.body = clamp(s.body + drift * dt * 1.6 - s.body * dt * 0.3, -1, 1);
    s.fall += dt;
    if (Math.abs(s.body) <= JUMP.stableBand) s.stable += dt;
    // Never pulled: the opener fires the reserve at its height.
    if (s.alt <= JUMP.aad) return deploy({ ...s, alt: JUMP.aad });
    return s;
  }
  // Under canopy.
  const k = dt * JUMP.canopyX;
  s.heading = wrap(s.heading + input.turn * JUMP.turnRate * dt);
  const flaring = s.flared && s.alt < JUMP.flareAt;
  const sink = flaring ? JUMP.sink * 0.35 : JUMP.sink * (1 + Math.abs(input.turn) * 0.4);
  const glide = flaring ? JUMP.glide * 0.3 : JUMP.glide;
  s.alt -= sink * k;
  s.x += Math.sin(s.heading) * glide * k;
  s.z -= Math.cos(s.heading) * glide * k;
  if (s.alt <= 0) {
    s.alt = 0;
    s.phase = 'landed';
    s.t = 0;
    s.miss = Math.round(Math.hypot(s.tx - s.x, s.tz - s.z) * 10) / 10;
  }
  return s;
}

/** Out of the door. */
export const exitPlane = (j: Jump): Jump =>
  j.phase === 'door' ? { ...j, phase: 'freefall', t: 0 } : j;

/** Arch: the body back to a stable position. */
export const arch = (j: Jump): Jump => ({ ...j, body: j.body * 0.35 });

/** Pull: the canopy opens (at this altitude). */
export function deploy(j: Jump): Jump {
  if (j.phase !== 'freefall') return j;
  return { ...j, phase: 'canopy', t: 0, deployAt: Math.round(j.alt) };
}

/** Flare: both toggles down for the landing (only near the ground). */
export const flare = (j: Jump): Jump =>
  j.phase === 'canopy' && j.alt < JUMP.flareAt * 3 ? { ...j, flared: true } : j;

/** Style (0–100): how much of freefall you held a stable arch, and the landing. */
export function jumpStyle(j: Jump) {
  const stable = j.fall > 0 ? j.stable / j.fall : 0;
  return Math.round(clamp(stable * 85 + (j.flared ? 15 : 0), 0, 100));
}

// ---------------------------------------------------------------- The helicopter

export interface Waypoint {
  name: string;
  x: number;
  z: number;
  /** About how tall it stands (m). */
  h: number;
  detail?: string;
}

/**
 * The tour's route: from the heliport to the nearest landmark, then each
 * next-nearest (within `reach` of the start), `count` of them, and home.
 */
export function heliRoute(
  start: { x: number; z: number },
  marks: readonly Waypoint[],
  count: number,
  reach = 7000,
): Waypoint[] {
  const left = marks.filter((m) => Math.hypot(m.x - start.x, m.z - start.z) <= reach);
  const out: Waypoint[] = [];
  let at = start;
  while (out.length < count && left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++)
      if (
        Math.hypot(left[i]!.x - at.x, left[i]!.z - at.z) <
        Math.hypot(left[best]!.x - at.x, left[best]!.z - at.z)
      )
        best = i;
    const [m] = left.splice(best, 1);
    out.push(m!);
    at = m!;
  }
  return out;
}

export interface Heli {
  x: number;
  z: number;
  alt: number;
  heading: number;
  /** m/s on screen. */
  speed: number;
  /** The next waypoint (route.length: heading home; route.length + 1: landed). */
  leg: number;
  /** You have the controls. */
  manual: boolean;
  t: number;
  /** Landmarks passed (their names), for the commentary and the card. */
  seen: string[];
}

const HELI = {
  cruise: 220,
  /** On-screen ground speed (the tour in a minute or two). */
  speed: 75,
  /** Radians a second the autopilot turns at most; your hand turns a little faster. */
  turn: 0.45,
  handTurn: 0.7,
  /** Hovering near the pad, it turns on the spot this fast. */
  hoverTurn: 1.2,
  /** A landmark counts as passed within this (m). */
  passBy: 260,
  /** Metres kept above the roofs under and ahead of it, and how far ahead it looks (s). */
  clearance: 45,
  ahead: [1.5, 4, 8],
  /** The approach home: slowing from here (m); over the pad within this, straight down. */
  approach: 700,
  overPad: 50,
} as const;

/** How tall the city stands at a point (m above the ground): roofs, towers, landmarks. */
export type RoofAt = (x: number, z: number) => number;

export const newHeli = (x: number, z: number): Heli => ({
  x,
  z,
  alt: 0,
  heading: 0,
  speed: 0,
  leg: 0,
  manual: false,
  t: 0,
  seen: [],
});

export interface HeliInput {
  turn: number;
  climb: number;
}

/** The lowest it may fly here: clear of the roofs under it and along its way ahead. */
function floorAt(s: Heli, roof: RoofAt | undefined, speed: number) {
  if (!roof) return 0;
  const fx = Math.sin(s.heading);
  const fz = -Math.cos(s.heading);
  let top = roof(s.x, s.z);
  for (const t of HELI.ahead) top = Math.max(top, roof(s.x + fx * speed * t, s.z + fz * speed * t));
  // Under a metre is the ground (the pad's slab, a kerb): nothing to climb over.
  return top > 1 ? top + HELI.clearance : 0;
}

/**
 * One step: lift off to the cruise height, fly to each landmark (or where you
 * steer, with the controls), then home: slow down facing the pad, hover over
 * it and straight down onto it, where it stays (player feedback: "when we
 * landed it didn't stop, it kept passing through buildings": it used to sink
 * to the ground half a kilometre out and crawl the rest of the way through
 * the streets). `roof` keeps it above the city all the way: it climbs over
 * whatever stands under it or ahead, slowing while it does.
 */
export function stepHeli(
  h: Heli,
  dt: number,
  route: readonly Waypoint[],
  home: { x: number; z: number },
  input: HeliInput = { turn: 0, climb: 0 },
  roof?: RoofAt,
): Heli {
  const s: Heli = { ...h, t: h.t + dt, seen: h.seen };
  if (s.leg > route.length) return s;
  const homeLeg = s.leg === route.length;
  const goal = route[s.leg] ?? { name: '', x: home.x, z: home.z, h: 0 };
  const d = Math.hypot(goal.x - s.x, goal.z - s.z);
  // Coming in to the pad, the pilot lands it, even if you had the controls.
  const landing = homeLeg && d < HELI.approach;
  if (landing) s.manual = false;
  const floor = floorAt(s, roof, Math.max(s.speed, 20));
  // Lift off first.
  if (s.t < 6 && !homeLeg) {
    s.alt = Math.min(Math.max(HELI.cruise, floor), s.alt + 45 * dt);
    s.speed = Math.min(HELI.speed, s.speed + 8 * dt);
  }
  if (s.manual) {
    s.heading = wrap(s.heading + clamp(input.turn, -1, 1) * HELI.handTurn * dt);
    s.alt = clamp(s.alt + clamp(input.climb, -1, 1) * 40 * dt, 80, 700);
    s.speed = Math.min(HELI.speed, s.speed + 10 * dt);
  } else if (landing) {
    const want = Math.atan2(goal.x - s.x, -(goal.z - s.z));
    const off = wrap(want - s.heading);
    s.heading = wrap(s.heading + clamp(off, -HELI.hoverTurn * dt, HELI.hoverTurn * dt));
    if (d > HELI.overPad) {
      // Slower the nearer, and nearly still until it faces the pad; height held over the roofs.
      const target = Math.abs(off) > 0.4 ? 3 : clamp(d * 0.35, 8, HELI.speed);
      s.speed += clamp(target - s.speed, -30 * dt, 15 * dt);
      s.alt = Math.max(s.alt + (Math.max(floor, 60) - s.alt) * Math.min(1, dt * 0.4), floor);
    } else {
      // Over the pad: drift onto it and come straight down.
      s.speed = 0;
      const k = Math.min(1, dt * 2);
      s.x += (goal.x - s.x) * k;
      s.z += (goal.z - s.z) * k;
      s.alt = Math.max(0, s.alt - Math.max(8, s.alt * 0.8) * dt);
      if (s.alt <= 0.5 && Math.hypot(goal.x - s.x, goal.z - s.z) < 3)
        return { ...s, x: goal.x, z: goal.z, alt: 0, speed: 0, leg: route.length + 1 };
      return s;
    }
  } else {
    const want = Math.atan2(goal.x - s.x, -(goal.z - s.z));
    const turn = clamp(wrap(want - s.heading), -HELI.turn * dt, HELI.turn * dt);
    s.heading = wrap(s.heading + turn);
    if (s.t >= 6) {
      s.speed = Math.min(HELI.speed, s.speed + 10 * dt);
      const cruise = HELI.cruise + (goal.h > 150 ? goal.h * 0.4 : 0);
      s.alt += (Math.max(cruise, floor) - s.alt) * Math.min(1, dt * 0.5);
    }
  }
  // Never into a roof: below the floor it climbs hard and slows until it's over.
  if (s.alt < floor) {
    s.alt = Math.min(floor, s.alt + 60 * dt);
    if (s.alt < floor) s.speed = Math.max(4, s.speed - 40 * dt);
  }
  s.x += Math.sin(s.heading) * s.speed * dt;
  s.z -= Math.cos(s.heading) * s.speed * dt;
  const near = Math.hypot(goal.x - s.x, goal.z - s.z);
  if (!homeLeg && near < HELI.passBy) {
    s.seen = [...s.seen, goal.name];
    s.leg++;
  }
  return s;
}

/** Which side a point is on, flying this heading ('left' or 'right'). */
export function sideOf(h: { x: number; z: number; heading: number }, p: { x: number; z: number }) {
  const fx = Math.sin(h.heading),
    fz = -Math.cos(h.heading);
  const cross = fx * (p.z - h.z) - fz * (p.x - h.x);
  return cross > 0 ? 'right' : 'left';
}
