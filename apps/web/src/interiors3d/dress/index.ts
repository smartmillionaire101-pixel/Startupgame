/**
 * Which family furnishes a room (./types.ts): offices, money rooms, shops,
 * halls and hotels, services (clinics, banks, gyms, salons, schools) and
 * industry (workshops, warehouses, depots). Rooms no family claims keep
 * ../venues.ts's own props.
 */
import type { RoomKind } from '../../city/rooms';
import { offices } from './offices';
import type { Family } from './types';

const BY_KIND: Partial<Record<RoomKind, Family>> = {
  office: offices,
  cowork: offices,
  hub: offices,
};

/** Rooms whose own props (../venues.ts) stay, with the family's added round them. */
export const KEEP_PROPS: ReadonlySet<RoomKind> = new Set<RoomKind>(['furniture', 'showroom']);

export function familyOf(kind: RoomKind, variant: string): Family | null {
  // A bar or lounge is furnished here only as a hotel's (its nightlife is ../nightlife3d.ts's).
  if (
    (kind === 'bar' || kind === 'lounge') &&
    !/hotel|guesthouse|co-living|event-venue|members-club/.test(variant)
  )
    return null;
  return BY_KIND[kind] ?? null;
}

export { Dresser, TRI_CAP, seeded } from './core';
export type { DressCtx, SeatCall } from './types';
