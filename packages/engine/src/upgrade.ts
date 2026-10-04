/**
 * World schema upgrades (see docs/adr/0001). Saved worlds are upgraded in
 * place on load, deterministically, so replaying later commands stays exact.
 * Each step fills defaults for fields introduced by that version.
 */
import type { World } from './types.js';

export const CURRENT_SCHEMA = 4;

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
