/**
 * Wave 8 §B: the choreography engine's vocabulary. A script is a short scene
 * played in a room when you do something there: you walk from the door to a
 * station, take a pose, staff and props play a 4–8 s loop, something visibly
 * changes, then a result card.
 *
 * Coordinates are the room's (./rooms.ts): a 360 × 240 box, back wall to
 * y≈140, feet on the floor below. Scripts draw their props once (React) and
 * animate them in `tick`, which writes attributes on named nodes; it is
 * called by one requestAnimationFrame loop per scene and never sets state.
 */
import type { ReactNode } from 'react';
import type { AvatarLook } from '../art';

export type ActId =
  | 'haircut'
  | 'meal'
  | 'drink'
  | 'dance'
  | 'workout'
  | 'cinema'
  | 'karaoke'
  | 'spa'
  | 'football'
  | 'arcade'
  | 'gallery'
  | 'gig'
  | 'beach'
  | 'showroom'
  | 'generic';

export type Pose = 'stand' | 'sit' | 'lie';

/** Named nodes a script animates: drawn with `data-n="plate"`, found once the stage mounts. */
export type Nodes = (name: string) => SVGElement | undefined;

export interface ActCtx {
  look: AvatarLook;
  /** Your look after the act (a haircut); else the same as `look`. */
  newLook: AvatarLook;
  /** A staff member or extra, stable per place. */
  extra: (seed: string, bg?: string) => AvatarLook;
  tint: string;
  variant: string;
  /** What you bought (its label, translated). */
  label: string;
}

/** What a frame does to you, on top of standing at the station. */
export interface YouFrame {
  dx?: number;
  dy?: number;
  /** Degrees. */
  rot?: number;
  /** Vertical squash (a squat): 1 is none. */
  sy?: number;
  /** Legs swinging (walking, running). */
  walking?: boolean;
  /** Face left. */
  flip?: boolean;
}

export interface ActScript {
  id: ActId;
  /** Where your feet (or seat) end up. */
  station: { x: number; y: number; flip?: boolean };
  pose: Pose;
  /** Extra classes on your posed figure (arm animations: 'act-pose-dance'…). */
  poseClass?: string;
  /** Your size at the station; defaults to the room's scale for that depth. */
  scale?: number;
  /** Something you hold while posed (a mic, dumbbells), drawn in your figure's frame. */
  hold?: (c: ActCtx) => ReactNode;
  /** The loop's length (ms): 4–8 s. */
  loopMs: number;
  /** Captions through the loop: [from k (0–1), English text]. */
  steps: [number, string][];
  /** The haircut swaps your hair at this k. */
  swapAt?: number;
  /** Darken the room this much behind the act (0–1). */
  dim?: number;
  back?: (c: ActCtx) => ReactNode;
  front?: (c: ActCtx) => ReactNode;
  /** One frame of the loop. `ms` < 0 while you are still walking in. */
  tick?: (n: Nodes, ms: number, k: number) => YouFrame | void;
}

// ---------------------------------------------------------------------------
// Frame helpers for scripts

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Progress of k through [a, b], 0–1. */
export const seg = (k: number, a: number, b: number) => clamp01((k - a) / (b - a));
export const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

/** Place a node: translate, then rotate (deg), then scale (negative sx flips). */
export function put(el: SVGElement | undefined, x: number, y: number, s = 1, rot = 0, sx = s) {
  if (!el) return;
  el.setAttribute(
    'transform',
    `translate(${f1(x)} ${f1(y)})${rot ? ` rotate(${f1(rot)})` : ''}${s !== 1 || sx !== s ? ` scale(${sx.toFixed(3)} ${s.toFixed(3)})` : ''}`,
  );
}
export function fade(el: SVGElement | undefined, o: number) {
  el?.setAttribute('opacity', o.toFixed(2));
}
export function show(el: SVGElement | undefined, on: boolean) {
  if (el && (el.style.display === 'none') === on) el.style.display = on ? '' : 'none';
}
/** Set text only when it changes. */
export function text(el: SVGElement | undefined, s: string) {
  if (el && el.textContent !== s) el.textContent = s;
}
export function walking(el: SVGElement | undefined, on: boolean) {
  if (el && el.classList.contains('is-walking') !== on) el.classList.toggle('is-walking', on);
}
