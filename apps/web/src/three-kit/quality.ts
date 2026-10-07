/**
 * Wave 9: how the game draws its 3D views. `runway.quality` in localStorage:
 * '3d' (the default, when WebGL works) or 'lite' (the 2D SVG scenes). Shared
 * by the city map and the interiors; the Settings app writes it.
 */
import { useSyncExternalStore } from 'react';

export type Quality = '3d' | 'lite';

export const QUALITY_KEY = 'runway.quality';

const listeners = new Set<() => void>();
let memory: Quality | null = null;

function saved(): Quality | null {
  if (memory) return memory;
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    if (v === '3d' || v === 'lite') return v;
  } catch {
    /* storage blocked: the default */
  }
  return null;
}

let gl: boolean | null = null;
/** Whether this browser can draw WebGL at all (checked once). */
export function webglAvailable(): boolean {
  if (gl !== null) return gl;
  try {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') return (gl = false);
    if (/jsdom/i.test(navigator.userAgent)) return (gl = false);
    const c = document.createElement('canvas');
    const ctx = c.getContext('webgl2') ?? c.getContext('webgl');
    gl = !!ctx;
    (ctx as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    gl = false;
  }
  return gl;
}

/** The player's choice, else 3D. */
export const getQuality = (): Quality => saved() ?? '3d';

export function setQuality(q: Quality) {
  memory = q;
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    /* lasts this session */
  }
  for (const l of listeners) l();
}

/** The quality setting, live. */
export function useQuality(): Quality {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === QUALITY_KEY) {
          memory = null;
          cb();
        }
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener('storage', onStorage);
      };
    },
    getQuality,
    () => 'lite' as Quality,
  );
}

/** Draw in 3D: the player didn't choose Lite and WebGL works. */
export function use3d(): boolean {
  return useQuality() === '3d' && webglAvailable();
}
