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
