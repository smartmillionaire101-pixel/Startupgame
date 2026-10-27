/**
 * Phase 3: life bars. Energy, Health, Happiness and Stress, 0–100 each, the
 * same rules for every player (no difficulty setting).
 *
 * - Energy is the existing `Player.energy`.
 * - Health and stress are stored (`Player.health`, `Player.stress`). Humans
 *   created after the release note start at 80 and 20; older saves read as
 *   75 and 25 (`healthOf` / `stressOf`, like `needsOf`), so there's no
 *   schema step.
 * - Happiness is derived, never stored: the average of the fun and social
 *   needs, `round((fun + social) / 2)`.
 *
 * Choices cost something you can feel: walking far takes hours and energy
 * (`city.walk`), a bus a little time and energy, a taxi less time but money.
 * Rest, fun, friends and exercise move the bars at once; work adds a little
 * stress (capped per month). Each month the bars settle (`settleBars`):
 * overwork, missed living costs and a short runway raise stress; neglect
 * lowers health. Very low health or very high stress costs hours next month
 * (`barHoursFactor`, folded into `computeHours`), and how you feel nudges
 * sales and pitch odds (`barEdge`: a pure modifier, no new RNG draws).
 *
 * Everything here is switched on by `LIFE_BARS_NOTE` (`lifeBarsOn`): worlds
 * that never logged it play exactly as before. AI players have no bars.
 */
import type { BusinessKindSpec, VenueItem } from './data/businesses.js';
import { ensure } from './errors.js';
import { companyRunway } from './company.js';
import { getMarket, hoursLeft, notify } from './helpers.js';
import { clamp } from './math.js';
import { MOOD_LOW, moodOf, needsOf, type HomeActId } from './needs.js';
import { feedbackOn, lifeBarsOn } from './releases.js';
import type { RideDistance, RideMode } from './travel.js';
import type { Player, World } from './types.js';

// ---------------------------------------------------------------- Config

export const LIFE_BARS = {
  /** New human players (after the release note). */
  healthStart: 80,
  stressStart: 20,
  /** Saves from before the note read as these. */
  healthBackfill: 75,
  stressBackfill: 25,

  /** `city.walk`: the trip time shown to the player, clamped to this range (minutes). */
  walkMinutes: [1, 240] as [number, number],
  /** Minutes of travel per point of energy. */
  walkMinutesPerEnergy: { walk: 14, cycle: 20 } as Record<WalkMode, number>,
  /** Hours are the trip time; cycling is twice as quick, so half the hours. */
  walkHoursFactor: { walk: 1, cycle: 0.5 } as Record<WalkMode, number>,
  /** A walk or ride of at least this long is exercise (+1 health). */
  walkHealthMinutes: 30,
  walkHealth: 1,
  /** Health from walking, at most this much a month (so it can't be farmed). */
  walkHealthCap: 4,
  /** Below this energy you're too tired to walk anywhere far. */
  walkMinEnergy: 10,

  /** Hours a ride takes, by mode and distance (a rescue: it never refuses on hours). */
  rideHours: {
    bus: { short: 0.4, medium: 0.6, long: 0.9 },
    taxi: { short: 0.15, medium: 0.25, long: 0.4 },
    drive: { short: 0.15, medium: 0.25, long: 0.4 },
  } as Record<RideMode, Record<RideDistance, number>>,
  /** Energy a ride takes (a crowded bus is tiring). */
  rideEnergy: { bus: 1, taxi: 0, drive: 0 } as Record<RideMode, number>,

  /** Seeing friends: a hangout, a visit or having someone over. */
  socialStress: -4,
  /** Each work action (build, gig, sales step, pitch). */
  workStress: 1,
  /** Stress from work actions in one month, at most. */
  workStressCap: 25,

  /** Month end. */
  stressHours: 140,
  stressPerOverHour: 0.3,
  stressMissedLiving: 15,
  stressShortRunway: 8,
  /** Runway (months) under which a company is a worry. */
  shortRunwayMonths: 3,
  stressRelief: -10,
  stressHappyRelief: -6,
  happyRelief: 60,
  healthBaseline: -3,
  healthHungry: -8,
  healthDirty: -5,
  healthStressed: -6,
  healthBurnout: -5,
  healthRested: 3,
  /** A need under this hurts health; stress over this hurts health. */
  lowNeed: 30,
  highStress: 75,
  restedEnergy: 60,

  /** Consequences: next month's hours. */
  unwellHealth: 25,
  unwellHours: 0.7,
  stressedOutStress: 85,
  stressedOutHours: 0.8,

  /** Odds: `barEdge`. */
  edge: {
    tired: -0.05,
    stressed: -0.05,
    poorHealth: -0.04,
    happy: 0.02,
    great: 0.02,
  },
  tiredEnergy: 30,
  poorHealth: 30,
  happyHappiness: 70,
  greatEnergy: 70,
  greatStress: 40,
};

/** Immediate effects of home acts (stress and health; needs and energy are in needs.ts). */
export const HOME_ACT_BARS: Partial<Record<HomeActId, { health?: number; stress?: number }>> = {
  sleep: { stress: -4 },
  nap: { stress: -1 },
  tv: { stress: -3 },
  game: { stress: -3 },
  read: { stress: -3 },
  workout: { health: 4, stress: -2 },
  cook: { health: 1 },
  snack: { health: -1 },
  laundry: { stress: -1 },
};

/** Venues where an activity is exercise. */
export const SPORT_KINDS: readonly string[] = [
  'gym',
  'climbing-gym',
  'studio-gym',
  'football-pitch',
];
/** Exercise at a sport venue. */
const SPORT_BARS = { health: 4, stress: -2 };
/** Junk and snack food, at a venue or delivered (item ids at food businesses). */
const JUNK_FOOD_ITEMS: readonly string[] = ['pastry', 'bread', 'food', 'snack'];
const JUNK_FOOD_HEALTH = -1;

// ---------------------------------------------------------------- Reading and changing the bars

export type WalkMode = 'walk' | 'cycle';
export interface Bars {
  energy: number;
  health: number;
  happiness: number;
  stress: number;
}

export const healthOf = (p: Player): number => p.health ?? LIFE_BARS.healthBackfill;
export const stressOf = (p: Player): number => p.stress ?? LIFE_BARS.stressBackfill;

/** 0–100: the average of the fun and social needs (derived, never stored). */
export function happinessOf(p: Player): number {
  const n = needsOf(p);
  return Math.round((n.fun + n.social) / 2);
}

/** All four bars, rounded, for the view. */
export function barsOf(p: Player): Bars {
  return {
    energy: Math.round(p.energy),
    health: Math.round(healthOf(p)),
    happiness: happinessOf(p),
    stress: Math.round(stressOf(p)),
  };
}

/** Change health (clamped 0–100); returns the change actually applied. */
export function bumpHealth(p: Player, by: number): number {
  const before = healthOf(p);
  p.health = clamp(before + by, 0, 100);
  return p.health - before;
}

/** Change stress (clamped 0–100); returns the change actually applied. */
export function bumpStress(p: Player, by: number): number {
  const before = stressOf(p);
  p.stress = clamp(before + by, 0, 100);
  return p.stress - before;
}

/** Change energy (clamped 0–100); returns the change actually applied. */
export function bumpEnergy(p: Player, by: number): number {
  const before = p.energy;
  p.energy = clamp(before + by, 0, 100);
  return p.energy - before;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Apply health and stress changes; returns what was applied (only keys that were asked for). */
export function applyBars(
  p: Player,
  fx: { health?: number; stress?: number },
): { health?: number; stress?: number } {
  const out: { health?: number; stress?: number } = {};
  if (fx.health) out.health = round2(bumpHealth(p, fx.health));
  if (fx.stress) out.stress = round2(bumpStress(p, fx.stress));
  return out;
}

/** Bars apply to humans in worlds that logged the release note. */
export const barsApply = (world: World, p: Player): boolean => !p.ai && lifeBarsOn(world);

// ---------------------------------------------------------------- Walking and rides

/**
 * What a walk or a cycle costs, for the client to preview before the trip.
 * `minutes` is the trip time shown to the player (clamped 1–240). 112
 * minutes on foot: 1.87h and 8 energy, and +1 health (it's exercise).
 */
export function walkCost(mode: WalkMode, minutes: number) {
  const [lo, hi] = LIFE_BARS.walkMinutes;
  const mins = clamp(Math.round(Number.isFinite(minutes) ? minutes : lo), lo, hi);
  return {
    mode,
    minutes: mins,
    hours: round2((mins / 60) * LIFE_BARS.walkHoursFactor[mode]),
    energy: Math.round(mins / LIFE_BARS.walkMinutesPerEnergy[mode]),
    health: mins >= LIFE_BARS.walkHealthMinutes ? LIFE_BARS.walkHealth : 0,
  };
}

/** What a ride costs in time and energy (the fare is `rideFare` in travel.ts). */
export function rideCost(mode: RideMode, distance: RideDistance) {
  return {
    mode,
    distance,
    hours: LIFE_BARS.rideHours[mode][distance],
    energy: LIFE_BARS.rideEnergy[mode],
  };
}

/** `city.walk`: walk or cycle across town; costs hours and energy, refused when you can't. */
export function walk(world: World, p: Player, mode: WalkMode, minutes: number) {
  const cost = walkCost(mode, minutes);
  const verb = mode === 'walk' ? 'walk' : 'cycle';
  ensure(
    hoursLeft(p) >= cost.hours,
    'walk.hours',
    `Not enough hours left this month to ${verb} that far — take a bus or a taxi.`,
  );
  ensure(
    p.energy >= Math.max(LIFE_BARS.walkMinEnergy, cost.energy),
    'walk.tired',
    `You’re too tired to ${verb} that far — take a bus or a taxi.`,
  );
  p.hours.used += cost.hours;
  const energy = Math.round(bumpEnergy(p, -cost.energy));
  // Exercise, up to a few points of health a month.
  const month = getMarket(world, p.market).month;
  const had = p.walkHealth?.month === month ? p.walkHealth.n : 0;
  const gain = Math.min(cost.health, Math.max(0, LIFE_BARS.walkHealthCap - had));
  const health = gain ? round2(bumpHealth(p, gain)) : 0;
  if (gain) p.walkHealth = { month, n: had + gain };
  const what = mode === 'walk' ? 'You walked' : 'You cycled';
  return {
    mode,
    minutes: cost.minutes,
    hours: cost.hours,
    energy,
    health,
    hoursLeft: round2(hoursLeft(p)),
    bars: barsOf(p),
    text: `${what} ${cost.minutes} min: ${cost.hours}h and ${cost.energy} energy.${health ? ' Good exercise.' : ''}`,
  };
}

/**
 * A ride's time and energy (after the fare is paid). It never refuses: with
 * too few hours left it uses what's left, down to 0.
 */
export function rideBars(p: Player, mode: RideMode, distance: RideDistance) {
  const cost = rideCost(mode, distance);
  const hours = round2(Math.min(cost.hours, hoursLeft(p)));
  p.hours.used += hours;
  const energy = cost.energy ? Math.round(bumpEnergy(p, -cost.energy)) : 0;
  return { hours, energy, hoursLeft: round2(hoursLeft(p)), bars: barsOf(p) };
}

// ---------------------------------------------------------------- Immediate effects

/** What a venue item does for health and stress. */
export function venueBars(spec: BusinessKindSpec, it: VenueItem) {
  if (SPORT_KINDS.includes(spec.kind) && it.activity) return { ...SPORT_BARS };
  const fx: { health?: number; stress?: number } = {};
  // Clubs, bars and anything fun to do (items with a fun score): fun eases stress.
  if (it.fun) fx.stress = -Math.round(it.fun / 5);
  if (spec.category === 'food' && JUNK_FOOD_ITEMS.includes(it.id)) fx.health = JUNK_FOOD_HEALTH;
  return fx;
}

/** A delivered meal: junk food costs a little health (other items can't be told apart). */
export const foodBars = (itemId: string) =>
  JUNK_FOOD_ITEMS.includes(itemId) ? { health: JUNK_FOOD_HEALTH } : {};

/** A work action: +1 stress, at most 25 a month from work. Returns the change applied. */
export function workStress(world: World, p: Player): number {
  const month = getMarket(world, p.market).month;
  const had = p.workStress?.month === month ? p.workStress.n : 0;
  const add = Math.min(LIFE_BARS.workStress, Math.max(0, LIFE_BARS.workStressCap - had));
  if (add <= 0) return 0;
  p.workStress = { month, n: had + add };
  return bumpStress(p, add);
}

// ---------------------------------------------------------------- Month end

const isUnwell = (p: Player) => healthOf(p) < LIFE_BARS.unwellHealth;
const isStressedOut = (p: Player) => stressOf(p) > LIFE_BARS.stressedOutStress;

/** Next month's hours multiplier from health and stress (1 for players without bars). */
export function barHoursFactor(p: Player): number {
  if (p.ai) return 1;
  return (
    (isUnwell(p) ? LIFE_BARS.unwellHours : 1) * (isStressedOut(p) ? LIFE_BARS.stressedOutHours : 1)
  );
}

/**
 * Month-end for the bars, after energy and needs have settled and before
 * hours are reset (settlePerson). `hoursUsed`: this month's hours;
 * `missedLiving`: living costs weren't covered.
 */
export function settleBars(
  world: World,
  p: Player,
  month: number,
  { hoursUsed, missedLiving }: { hoursUsed: number; missedLiving: boolean },
) {
  const L = LIFE_BARS;
  const wasUnwell = isUnwell(p);
  const wasStressedOut = isStressedOut(p);
  const company = p.companyIds
    .map((id) => world.companies[id])
    .find((c) => c && c.status === 'active');
  const shortRunway = !!company && companyRunway(world, company) < L.shortRunwayMonths;
  const happy = happinessOf(p) > L.happyRelief;
  bumpStress(
    p,
    L.stressPerOverHour * Math.max(0, hoursUsed - L.stressHours) +
      (missedLiving ? L.stressMissedLiving : 0) +
      (shortRunway ? L.stressShortRunway : 0) +
      L.stressRelief +
      (happy ? L.stressHappyRelief : 0),
  );
  const n = needsOf(p);
  bumpHealth(
    p,
    L.healthBaseline +
      (n.hunger < L.lowNeed ? L.healthHungry : 0) +
      (n.hygiene < L.lowNeed ? L.healthDirty : 0) +
      (stressOf(p) > L.highStress ? L.healthStressed : 0) +
      (p.burnout ? L.healthBurnout : 0) +
      (p.energy > L.restedEnergy ? L.healthRested : 0),
  );
  p.health = Math.round(healthOf(p) * 10) / 10;
  p.stress = Math.round(stressOf(p) * 10) / 10;
  if (isUnwell(p) && !wasUnwell)
    notify(world, p.id, {
      month,
      kind: 'warning',
      text: 'You’re unwell. Rest, eat well and see the gym: fewer hours until you recover.',
    });
  if (isStressedOut(p) && !wasStressedOut)
    notify(world, p.id, {
      month,
      kind: 'warning',
      text: 'You’re stressed out. See friends, sleep and slow down: fewer hours and weaker pitches until you do.',
    });
}

// ---------------------------------------------------------------- Odds and the view

/**
 * Feeling great: rested and calm. With `cared` (the feedback release, play-test:
 * "'Feeling great' with Mood 21, Hunger 0, Hygiene 0") you must also be fed,
 * washed and not lonely or bored: no need under `lowNeed`, mood not low.
 */
function feelingGreat(p: Player, cared: boolean): boolean {
  const L = LIFE_BARS;
  if (!(p.energy > L.greatEnergy && stressOf(p) < L.greatStress)) return false;
  if (!cared) return true;
  const n = needsOf(p);
  return moodOf(p) >= MOOD_LOW && Object.values(n).every((v) => v >= L.lowNeed);
}

/**
 * How you feel, as a small edge on sales and pitch odds (−0.14 to +0.04).
 * Zero for AI players; callers add it only when `lifeBarsOn`. `cared`: the
 * feedback release's stricter "feeling great" (`feelingGreat`).
 */
export function barEdge(p: Player | undefined, cared = false): number {
  if (!p || p.ai) return 0;
  const L = LIFE_BARS;
  const e = L.edge;
  const stress = stressOf(p);
  return (
    (p.energy < L.tiredEnergy ? e.tired : 0) +
    (stress > L.highStress ? e.stressed : 0) +
    (healthOf(p) < L.poorHealth ? e.poorHealth : 0) +
    (happinessOf(p) > L.happyHappiness ? e.happy : 0) +
    (feelingGreat(p, cared) ? e.great : 0)
  );
}

/** `barEdge` when the release is on, else 0 (so old worlds' odds are untouched). */
export const barEdgeIn = (world: World, p: Player | undefined): number =>
  p && barsApply(world, p) ? barEdge(p, feedbackOn(world)) : 0;

export interface BarEffect {
  id: string;
  text: string;
  tone: 'good' | 'bad';
}

/**
 * The effects the bars have right now, in plain English. `cared` (the feedback
 * release): the stricter "feeling great", and a low mood is named too (it
 * costs hours next month, `moodHoursFactor`).
 */
export function barEffects(p: Player, cared = false): BarEffect[] {
  const L = LIFE_BARS;
  const out: BarEffect[] = [];
  const bad = (id: string, text: string) => out.push({ id, text, tone: 'bad' });
  const good = (id: string, text: string) => out.push({ id, text, tone: 'good' });
  const health = healthOf(p);
  const stress = stressOf(p);
  if (p.energy < L.tiredEnergy) bad('tired', 'Tired: sales and pitches are harder');
  if (health < L.unwellHealth)
    bad('unwell', 'Unwell: fewer hours this month, and sales and pitches are harder');
  else if (health < L.poorHealth) bad('run-down', 'Run down: sales and pitches are harder');
  if (stress > L.stressedOutStress)
    bad('stressed-out', 'Stressed out: fewer hours and weaker pitches');
  else if (stress > L.highStress) bad('stressed', 'Stressed: sales and pitches are harder');
  if (cared && p.needs && moodOf(p) < MOOD_LOW)
    bad('low-mood', 'Feeling low: fewer hours next month. Eat, wash and have some fun');
  if (happinessOf(p) > L.happyHappiness) good('happy', 'Happy: +sales, +pitches');
  if (feelingGreat(p, cared)) good('feeling-great', 'Feeling great: +sales, +pitches');
  return out;
}
