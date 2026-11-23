import type { RoomKind, Slot } from '../../city/rooms';
import type { FloorKind } from '../kit';
import type { Dresser } from './core';

/** What a room is furnished from: its kind, what it is (a business kind, a civic role…), the place and its tier. */
export interface DressCtx {
  kind: RoomKind;
  /** A business's kind ('grocer', 'tailor'), a city place's role ('high-court'), or the place's kind ('newsstand', 'fund'). */
  variant: string;
  seed: string;
  tier: 1 | 2 | 3;
  tint: string;
  sign?: string;
  night: boolean;
  slots: Slot[];
}

/** The shell: floor, walls and an accent (what the room's own style would otherwise be). */
export interface Look {
  floor: FloorKind;
  floorTint?: string;
  wall: string;
}

/** Someone's seat: one alone (facing `dir` along x, or towards the back) or two facing each other. */
export type SeatCall =
  | { style: string; pair: true; ax: number; bx: number; z: number; acts: [string, string] }
  | { style: string; pair: false; x: number; z: number; dir: number; act: string };

export interface Family {
  /** The shell for this room (null: the kind's own). */
  look?: (c: DressCtx, d: Dresser) => Look | null;
  /** Draw a seated person's furniture (true: drawn; the default isn't). */
  seat?: (c: DressCtx, d: Dresser, s: SeatCall) => boolean;
  /** Everything else in the room. */
  dress: (c: DressCtx, d: Dresser) => void;
  /** Where the venue's name board goes on the back wall (null: the kind's own place). */
  signAt?: (c: DressCtx) => { x: number; y: number } | null;
  /** Spots (slot index → height) people stand raised on (a stage). */
  lift?: (c: DressCtx) => Map<number, number> | undefined;
}
