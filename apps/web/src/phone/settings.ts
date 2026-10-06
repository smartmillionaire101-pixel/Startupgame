/**
 * Phone Settings (Wave 7 §C): Reduce motion, Always skip rides and Sound,
 * kept in localStorage so the City, rides and scenes can read them too.
 *
 *  - `runway.reduceMotion` '1' / '0': also mirrored as `data-reduce-motion`
 *    on <html> at once, so CSS can switch animations off.
 *  - `runway.skipRides` '1' / '0': ride scenes jump straight to arrival.
 *  - `runway.sound` '1' / '0': cosmetic for now.
 */
import { useSyncExternalStore } from 'react';

export type SettingKey = 'reduceMotion' | 'skipRides' | 'sound';

const KEYS: Record<SettingKey, string> = {
  reduceMotion: 'runway.reduceMotion',
  skipRides: 'runway.skipRides',
  sound: 'runway.sound',
};

const DEFAULTS: Record<SettingKey, boolean> = {
  reduceMotion: false,
  skipRides: false,
  sound: true,
};

const listeners = new Set<() => void>();
const memory: Partial<Record<SettingKey, boolean>> = {};

function read(key: SettingKey): boolean {
  if (memory[key] !== undefined) return memory[key]!;
  try {
    const v = localStorage.getItem(KEYS[key]);
    if (v === '1' || v === '0') return v === '1';
  } catch {
    /* storage blocked: defaults */
  }
  return DEFAULTS[key];
}

/** The player's own choice (not the system setting). */
export const getSetting = (key: SettingKey) => read(key);

/** Reduced motion from either the in-game setting or the system. */
export function prefersReducedMotion(): boolean {
  if (read('reduceMotion')) return true;
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

function applyMotion(on: boolean) {
  if (typeof document === 'undefined') return;
  if (on) document.documentElement.dataset.reduceMotion = '1';
  else delete document.documentElement.dataset.reduceMotion;
}

export function setSetting(key: SettingKey, on: boolean) {
  memory[key] = on;
  try {
    localStorage.setItem(KEYS[key], on ? '1' : '0');
  } catch {
    /* not persisted; lasts for this session */
  }
  if (key === 'reduceMotion') applyMotion(on);
  for (const l of listeners) l();
}

export function useSetting(key: SettingKey): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read(key),
    () => DEFAULTS[key],
  );
}

/** Put the saved Reduce motion choice on <html> (called once when the phone loads). */
export function applySavedSettings() {
  applyMotion(read('reduceMotion'));
}
