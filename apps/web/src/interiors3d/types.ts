/**
 * Wave 9 §C: what the 2D scenes hand their lazy 3D views (types only, so the
 * scenes don't load three.js until a 3D view is shown).
 */
import type { MutableRefObject } from 'react';
import type { AvatarLook } from '../city/art';
import type { HomeAct, HomePlan, Spot } from '../home/layout';

export interface Home3DPerson {
  id: string;
  look: AvatarLook;
  /** Tile coordinates (fractional while walking). */
  x: number;
  y: number;
  pose: 'stand' | 'sit' | 'lie';
}

export interface Home3DObject {
  id: string;
  label: string;
  spot: Spot & { rot?: number };
  slot?: string;
  owned?: boolean;
  tier?: number;
}

export interface PickResult {
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
  buyMode: boolean;
  ghost: Ghost | null;
  /** A slot being moved (drawn as the ghost instead). */
  moving: string | null;
  api: MutableRefObject<Home3DApi | null>;
  /** The floor's affine map onto the screen, as an SVG transform (2D hit layer). */
  onCamera: (svgTransform: string) => void;
  onReady: () => void;
  reduced: boolean;
}
