/**
 * Wave 9 §B: which city map to draw. "3D" is the WebGL city (three.js,
 * loaded on demand); "Lite" is Wave 8's 2D map (canvas + SVG), which also
 * stands in whenever WebGL is missing or fails.
 *
 * The choice is localStorage `runway.mapQuality` = '3d' | 'lite' (phone
 * Settings → Map quality). This module is tiny and has no three.js in it: it
 * is part of the main bundle.
 */
import { useSyncExternalStore } from 'react';

export type MapQuality = '3d' | 'lite';
const MAP_QUALITY_KEY = 'runway.mapQuality';

const listeners = new Set<() => void>();
let memory: MapQuality | null = null;

export function getMapQuality(): MapQuality {
  if (memory) return memory;
  try {
    const v = localStorage.getItem(MAP_QUALITY_KEY);
    if (v === '3d' || v === 'lite') return v;
  } catch {
    /* storage blocked: the default */
  }
  return '3d';
}

/**
 * Whether the player picked the map's quality themselves (Settings → Map
 * quality). The default 3D map steps down to Lite by itself when it runs too
 * slowly; a 3D map the player chose only suggests it.
 */
export function mapQualityChosen(): boolean {
  if (memory) return true;
  try {
    const v = localStorage.getItem(MAP_QUALITY_KEY);
    return v === '3d' || v === 'lite';
  } catch {
    return false;
  }
}

/** Frame checks (every `SLOW_CHECK_MS`) after the first `SLOW_GRACE_MS`, while the 3D map is up. */
export const SLOW_CHECK_MS = 2000;
export const SLOW_GRACE_MS = 10_000;
/** This many slow checks in a row (ten seconds) and the map is too slow here. */
export const SLOW_CHECKS = 5;

/**
 * Too slow to play: the page's own time per frame (`costMs`) or the time
 * between frames (`gapMs`, smoothed). 120 ms of work a frame, or under about
 * 4 frames a second, and taps and the city both feel stuck (the play-test's
 * phone ran at 2).
 */
export const isSlowFrame = (s: { costMs: number; gapMs: number }) =>
  s.costMs > 120 || s.gapMs > 250;

export function setMapQuality(q: MapQuality) {
  memory = q;
  try {
    localStorage.setItem(MAP_QUALITY_KEY, q);
  } catch {
    /* not persisted: lasts for this session */
  }
  for (const l of listeners) l();
}

export function useMapQuality(): MapQuality {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getMapQuality,
    () => 'lite' as MapQuality,
  );
}

let webgl: boolean | null = null;

/** Whether this browser can draw WebGL at all (checked once). */
export function hasWebGL(): boolean {
  if (webgl !== null) return webgl;
  webgl = false;
  if (typeof document === 'undefined') return webgl;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    webgl = !!gl;
    (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

/** A WebGL map failed at run time (context lost for good, a shader error): use Lite. */
export function markWebGLBroken() {
  webgl = false;
  for (const l of listeners) l();
}
