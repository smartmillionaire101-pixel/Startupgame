import { dispatch } from '../src/dispatch.js';
import type { Command } from '../src/commands.js';
import { createWorld } from '../src/world.js';
import type { MarketId } from '../src/data/markets.js';
import type { World } from '../src/types.js';

export const T0 = Date.UTC(2026, 9, 3, 12, 0, 0);
export const DAY = 86_400_000;

export function makeWorld(seed = 42, markets: MarketId[] = ['lagos', 'nairobi', 'london']): World {
  return createWorld({ seed, now: T0, markets, aiStartupsPerMarket: 6 });
}

/** Apply a command and fail the test loudly on a rule error. */

export function run(
  world: World,
  actorId: string | null,
  cmd: Command,
  now = T0,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests read loosely-typed command results
): { world: World; result: any } {
  const r = dispatch(world, cmd, { actorId, now });
  if (!r.ok) throw new Error(`${cmd.type} failed: ${r.error.code} ${r.error.message}`);
  return { world: r.world, result: r.result };
}

export function tryRun(world: World, actorId: string | null, cmd: Command, now = T0) {
  return dispatch(world, cmd, { actorId, now });
}

export function addFounder(
  world: World,
  id = 'u_founder',
  market: MarketId = 'lagos',
  name = 'Paylink',
): World {
  return run(world, id, {
    type: 'player.create',
    handle: `h_${id}`.slice(0, 20),
    name: 'Ada Founder',
    role: 'founder',
    backgroundId: 'f-engineer',
    market,
    company: {
      name,
      industry: 'fintech',
      revenueModel: 'subscription',
      idea: 'Payments for market traders',
      incorporation: 'local',
    },
  }).world;
}

export function addInvestor(world: World, id = 'u_investor', market: MarketId = 'lagos'): World {
  return run(world, id, {
    type: 'player.create',
    handle: `h_${id}`.slice(0, 20),
    name: 'Ike Investor',
    role: 'investor',
    backgroundId: 'i-exited',
    market,
    investor: {
      sectors: ['fintech', 'saas'],
      stages: ['pre-seed', 'seed'],
      checkSize: 5_000_000_00,
    },
  }).world;
}

export function settle(world: World, market: MarketId, months: number, start = T0): World {
  let w = world;
  for (let i = 0; i < months; i++) {
    const last = w.markets[market]!.lastSettledDate!;
    const d = new Date(`${last}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    w = run(
      w,
      null,
      { type: 'market.settle', market, date: d.toISOString().slice(0, 10) },
      start + (i + 1) * DAY,
    ).world;
  }
  return w;
}

export function moneyByCurrency(world: World): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of Object.values(world.accounts))
    out[a.currency] = (out[a.currency] ?? 0) + a.balance;
  return out;
}

export function negativeInternalAccounts(world: World) {
  return Object.values(world.accounts).filter((a) => !a.external && a.balance < 0);
}

export const companyOf = (world: World, playerId: string) =>
  world.companies[world.players[playerId]!.companyIds[0]!]!;
