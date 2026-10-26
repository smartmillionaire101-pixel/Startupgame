/**
 * Wave 9 §C: what the 2D scenes hand their lazy 3D views (types only, so the
 * scenes don't load three.js until a 3D view is shown).
 */
import type { MutableRefObject } from 'react';
import type { AvatarLook } from '../city/art';
import type { HomeAct, HomePlan, Spot } from '../home/layout';
import type { Grounds } from '../home/grounds';
import type { HomeFinish } from './finishes';

export interface Home3DPerson {
  id: string;
  look: AvatarLook;
  /** Tile coordinates (fractional while walking). */
  x: number;
  y: number;
  pose: 'stand' | 'sit' | 'lie';
  /** Which way they face when standing still (radians; 0 = +z), when the scene says. */
  ry?: number;
}

export interface Home3DObject {
  id: string;
  label: string;
  spot: Spot & { rot?: number };
  slot?: string;
  owned?: boolean;
  tier?: number;
  /** Wave 12: the model to draw (a guest bed, the island, a car outside…). */
  model?: string;
  /** Wave 12: its facing (radians; 0 = +z), when the plan says. */
  ry?: number;
  /** Wave 12: outside the house, on the grounds. */
  outdoor?: boolean;
  /** Shop note: the finish bought for it (a colour its wood or fabric takes). */
  finish?: string;
}

/** Shop note: a wall or divider you put up (../home/dividers.ts). */
export interface Home3DDivider {
  id: string;
  kind: 'full' | 'half' | 'glass' | 'sliding' | 'bookshelf';
  len: number;
  x: number;
  y: number;
  dir: 'h' | 'v';
  swatch: string;
}

interface PickResult {
  obj?: string;
  tile?: { x: number; y: number };
  person?: string;
}

export interface Home3DApi {
  pick(x: number, y: number): PickResult | null;
  /** A tile point (x, y in tiles) at height h (metres) on screen. */
  project(x: number, y: number, h: number): { x: number; y: number };
  orbit(dx: number, dy: number): void;
  zoom(f: number): void;
  /** Turn the camera a quarter (±1). */
  turn(dir: number): void;
  /**
   * Turn slowly once all the way round the house ("Look around"); quarter
   * steps when motion is reduced. The returned function stops it where it
   * is; `onEnd` hears when it ends either way.
   */
  lookAround(onEnd: () => void): () => void;
  /** A photo of the view (JPEG data URL), or null when it can't be read. */
  snapshot(): string | null;
  /** Draw again (someone started walking). */
  wake(): void;
}

export interface Ghost {
  slot: string;
  tier: number;
  spot: Spot & { rot: number };
  ok: boolean;
}

export interface Home3DProps {
  plan: HomePlan;
  tier: number;
  objects: Home3DObject[];
  people: () => Home3DPerson[];
  acting: { act: HomeAct; obj?: string } | null;
  night: boolean;
  dusk: boolean;
  car: string | null;
  cars?: string[];
  delivery?: { id: string; orderedAt: number; arrivesAt: number } | null;
  buyMode: boolean;
  /** The catalogue sheet covers the bottom of the screen. */
  sheetOpen: boolean;
  ghost: Ghost | null;
  /** A slot being moved (drawn as the ghost instead). */
  moving: string | null;
  api: MutableRefObject<Home3DApi | null>;
  /** The floor's affine map onto the screen, as an SVG transform (2D hit layer). */
  onCamera: (svgTransform: string) => void;
  onReady: () => void;
  reduced: boolean;
  /** Wave 10: a listing's grounds (pool, garden, penthouse terrace). */
  estate?: 'villa' | 'mansion' | 'penthouse' | null;
  /** Wave 12: the grounds (pool, drive, garages); worked out from the plan when absent. */
  grounds?: Grounds;
  /** Shop note: walls and dividers you put up on this floor. */
  dividers?: Home3DDivider[];
  /** Buy mode: the floors and wall paint you chose (or are trying on). */
  finish?: HomeFinish | null;
}
