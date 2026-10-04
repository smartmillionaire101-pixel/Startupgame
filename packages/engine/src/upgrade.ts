/**
 * World schema upgrades (see docs/adr/0001). Saved worlds are upgraded in
 * place on load, deterministically, so replaying later commands stays exact.
 * Each step fills defaults for fields introduced by that version.
 */
import { capitalNames } from './data/capital.js';
import type { MarketId } from './data/markets.js';
import { seedExtraFunds, seedLenders } from './capital.js';
import { normaliseName } from './names.js';
import type { World } from './types.js';

export const CURRENT_SCHEMA = 8;

type Step = (world: World) => void;

const STEPS: Record<number, Step> = {
  // v1 → v2: Phase 2 (markets open in waves; later Phase 2 fields default here).
  1: () => {},
  // v2 → v3: personal loans and on-time payment history.
  2: (world) => {
    for (const p of Object.values(world.players)) {
      p.loans ??= [];
      p.credit.onTimePayments ??= 0;
    }
  },
  // v3 → v4: travel and relocation.
  3: (world) => {
    for (const p of Object.values(world.players)) p.visited ??= {};
    for (const c of Object.values(world.companies)) c.aiCeo ??= false;
  },
  // v4 → v5: B2B marketplace.
  4: (world) => {
    world.listings ??= {};
    world.contracts ??= {};
    for (const c of Object.values(world.companies)) {
      c.supply ??= {
        cogsMult: 1,
        overheadMult: 1,
        outputMult: 1,
        reliabilityAdd: 0,
        moraleAdd: 0,
        skillAdd: 0,
      };
      c.supplyDisruptionMonth ??= null;
      c.ledgerThisMonth ??= { playerRevenue: 0, supplierCost: 0, flaggedRevenue: 0 };
      c.lastFlaggedRevenue ??= 0;
      c.fraudStreak ??= 0;
      c.bannedFromRaising ??= false;
    }
  },
  // v5 → v6: governance, player acquisitions, arbitration.
  5: (world) => {
    world.votes ??= {};
    world.disputes ??= {};
    for (const k of Object.values(world.contracts)) k.plannedEndMonth ??= k.endMonth;
    for (const c of Object.values(world.companies)) {
      c.board ??= [];
      c.vetoes ??= [];
      c.parentId ??= null;
      c.removedFounders ??= {};
    }
  },
  // v6 → v7: player-owned banks; loans remember their lender.
  6: (world) => {
    world.banks ??= {};
    for (const c of Object.values(world.companies)) {
      for (const l of c.finance.loans) {
        l.lenderAccount ??= world.markets[c.market]!.ext.bank;
        l.lenderBankId ??= null;
      }
    }
    for (const p of Object.values(world.players)) {
      for (const l of p.loans) {
        l.lenderAccount ??= world.markets[l.market]!.ext.bank;
        l.lenderBankId ??= null;
      }
    }
  },
  // v7 → v8: per-market lenders and depth-scaled funds (Wave 1). Existing funds stay.
  7: (world) => {
    for (const id of Object.keys(world.markets) as MarketId[]) {
      const m = world.markets[id]!;
      m.lenders ??= seedLenders(id);
      const names = (world.names[id] ??= {});
      // Reserve the new AI names, unless a player already holds one.
      for (const n of capitalNames(id)) names[normaliseName(n)] ??= 'ai';
      seedExtraFunds(world, id);
    }
  },
};

export function upgradeWorld(world: World): World {
  while (world.schemaVersion < CURRENT_SCHEMA) {
    const step = STEPS[world.schemaVersion];
    if (!step) throw new Error(`No upgrade from schema ${world.schemaVersion}`);
    step(world);
    world.schemaVersion += 1;
  }
  return world;
}
