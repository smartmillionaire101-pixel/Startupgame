import type { World } from './types.js';

/** Deterministic, replay-safe ids: prefix + base36 counter. */
export function newId(world: World, prefix: string): string {
  const id = `${prefix}_${world.nextId.toString(36)}`;
  world.nextId += 1;
  return id;
}
