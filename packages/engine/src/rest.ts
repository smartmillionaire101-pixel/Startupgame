/**
 * Round 7 (gameplay note, player feedback: "sit down at home"): resting at
 * home. Sit on the sofa, a chair or an armchair (`seat`) and your stress
 * falls; lie down on a bed or the starter flat's sleeping mat (`bed`) for a
 * nap and your energy comes back. Both run on the game clock: for every 15
 * game minutes, a seat takes 1 off stress and a bed adds 4 energy. Resting
 * spends game hours, like any other activity, and is capped per rest and
 * per month.
 *
 * `home.rest` `start` keeps where and when you sat down (the game minute of
 * the command's logged time); `stop` (Get up / Wake up) settles the whole
 * 15-minute blocks since then. Replay-safe: both read only the command's
 * logged `now`. No money moves.
 */
import { ensure } from './errors.js';
import { getMarket, hoursLeft, spendHours } from './helpers.js';
import { bumpStress } from './lifebars.js';
import { clamp } from './math.js';
import { gameMinute } from './places.js';
import type { Player, World } from './types.js';

export const REST = {
  /** Game minutes in one block of rest. */
  block: 15,
  /** A seat: stress off per block. */
  seatStress: 1,
  /** A bed: energy back per block. */
  bedEnergy: 4,
  /** The longest one rest counts for, in game minutes. */
  maxMinutes: { seat: 240, bed: 480 },
  /** Most stress resting takes off, and energy it gives back, in a month. */
  monthStress: 40,
  monthEnergy: 120,
} as const;

export type RestSpot = keyof typeof REST.maxMinutes;

/** What resting has done this month: stress taken off and energy given back (positive). */
function restMonth(p: Player, month: number) {
  const r = p.restMonth;
  return r && r.month === month ? r : { month, stress: 0, energy: 0 };
}

/** Settle a rest that's under way: whole blocks since you sat down, within the caps. */
function settleRest(world: World, p: Player, now: number) {
  const r = p.rest!;
  const m = getMarket(world, p.market);
  const elapsed = Math.max(0, gameMinute(m, now) - r.since);
  const byTime = Math.floor(Math.min(elapsed, REST.maxMinutes[r.spot]) / REST.block);
  // Resting spends hours: never more blocks than the hours you have left.
  const blocks = Math.min(byTime, Math.floor((hoursLeft(p) * 60) / REST.block));
  const done = restMonth(p, m.month);
  let stress = 0;
  let energy = 0;
  if (r.spot === 'seat') {
    const want = Math.min(blocks * REST.seatStress, REST.monthStress - done.stress);
    if (want > 0) stress = Math.round(bumpStress(p, -want) * 100) / 100;
  } else {
    const want = Math.min(blocks * REST.bedEnergy, REST.monthEnergy - done.energy);
    if (want > 0) {
      const before = p.energy;
      p.energy = clamp(p.energy + want, 0, 100);
      energy = Math.round(p.energy - before);
    }
  }
  const hours = (blocks * REST.block) / 60;
  if (hours > 0) spendHours(p, hours, 'Resting');
  p.restMonth = { month: m.month, stress: done.stress - stress, energy: done.energy + energy };
  delete p.rest;
  return { spot: r.spot, minutes: blocks * REST.block, hours, stress, energy };
}

/** `home.rest`: sit or lie down (`start`, with a `spot`), or get up (`stop`). */
export function homeRest(
  world: World,
  me: Player,
  cmd: { action: 'start' | 'stop'; spot?: RestSpot },
  now: number,
) {
  if (cmd.action === 'stop') {
    ensure(me.rest, 'home.rest.none', 'You’re not resting.');
    return { ...settleRest(world, me, now), resting: null };
  }
  ensure(cmd.spot, 'home.rest.spot', 'Pick somewhere to rest.');
  // Sitting down somewhere else ends the rest before it.
  const before = me.rest ? settleRest(world, me, now) : null;
  const m = getMarket(world, me.market);
  me.rest = { spot: cmd.spot!, since: gameMinute(m, now) };
  return { resting: { ...me.rest }, ended: before };
}

/** For your own view (gameplay note): the rest under way, the rates and what's left this month. */
export function restView(world: World, p: Player) {
  const done = restMonth(p, getMarket(world, p.market).month);
  return {
    resting: p.rest ? { ...p.rest } : null,
    block: REST.block,
    seatStress: REST.seatStress,
    bedEnergy: REST.bedEnergy,
    maxMinutes: { ...REST.maxMinutes },
    stressLeft: REST.monthStress - done.stress,
    energyLeft: REST.monthEnergy - done.energy,
  };
}
