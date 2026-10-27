/**
 * Golf: one moment of the round, for whoever draws it (the 3D course, or
 * the 2D side view in Lite). The scene owns the timeline and hands the
 * drawing a `GolfFrame` every animation frame.
 */
import type { AvatarLook } from '../art';
import type { HoleGeo, Pt2 } from './game';

export type CamMode = 'intro' | 'aim' | 'swing' | 'follow' | 'putt' | 'holed';

export interface GolfFrame {
  hole: number;
  geo: HoleGeo;
  ball: { x: number; y: number; z: number };
  /** Where the golfer stands (feet) and the heading they play along. */
  golfer: Pt2;
  heading: number;
  /** −1 (top of the backswing) … 0 (address / impact) … 1 (finish). */
  swing: number;
  putting: boolean;
  club: 'driver' | 'iron' | 'putter';
  cam: CamMode;
  /** 0–1 through the hole's fly-over (cam 'intro'). */
  intro: number;
  /** The aim line: its heading and how far the club carries. */
  aim: { heading: number; carry: number } | null;
  /** Playing partners: where they stand and whether they clap. */
  partners: { x: number; z: number; face: number; clap: boolean }[];
  /** A cheer: the ball dropped. */
  cheer: boolean;
  /**
   * Who swings: 0 is `me`, 1 the first partner… (a match: whoever's shot it
   * is). Missing: you. The others stand in the `partners` spots, in order.
   */
  swinger?: number;
}

export interface GolfDrawProps {
  me: AvatarLook;
  partners: AvatarLook[];
  frame: () => GolfFrame;
  onReady?: () => void;
}

/** Where a drawing put something on screen, as `data-golf-<key>`. */
export type ScreenMark = 'ball' | 'aim-end' | 'flag';

/**
 * Notes on the canvas where the ball, the aim's end and the flag are drawn,
 * as fractions of its width and height ("0.281,0.774"; empty when off
 * screen), so a test can check the controls leave them clear. Written only
 * when it changes.
 */
export function markScreen(
  canvas: HTMLCanvasElement,
  key: ScreenMark,
  at: { x: number; y: number } | null,
): void {
  const v =
    at && at.x >= 0 && at.x <= 1 && at.y >= 0 && at.y <= 1
      ? `${at.x.toFixed(3)},${at.y.toFixed(3)}`
      : '';
  const name = key === 'aim-end' ? 'golfAimEnd' : key === 'ball' ? 'golfBall' : 'golfFlag';
  if (canvas.dataset[name] !== v) canvas.dataset[name] = v;
}
