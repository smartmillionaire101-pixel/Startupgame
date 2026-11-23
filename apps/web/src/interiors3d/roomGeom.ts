/**
 * The venue box (./venues.ts): a 12 × 6.6 m room, the back wall at
 * z = -3.3, and the 2D rooms' 360 × 240 coordinates in metres.
 */
export const RW = 12;
export const RD = 6.6;
export const BACK = -RD / 2;
export const WALL_H = 3.0;

/** 2D room x → metres. */
export const vx = (x: number) => ((x - 180) / 360) * RW;
/** 2D room y (feet) → metres (z). */
export const vz = (y: number) => BACK + 0.8 + ((Math.max(118, y) - 130) / 110) * (RD - 1.1);
