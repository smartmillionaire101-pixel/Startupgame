/**
 * Phone Settings (Wave 7 §C): Reduce motion, Always skip rides and Sound,
 * kept in localStorage so the City, rides and scenes can read them too.
 *
 *  - `runway.reduceMotion` '1' / '0': also mirrored as `data-reduce-motion`
 *    on <html> at once, so CSS can switch animations off.
 *  - `runway.skipRides` '1' / '0': ride scenes jump straight to arrival.
 *  - `runway.sound` '1' / '0': background game music.
 *  - `runway.simple` '1' / '0' (Phase 2): Simple mode, for players who aren't
 *    tech-savvy: four tabs, a big "What should I do now?" card, words on every
 *    button, bigger text and Back in one place. Mirrored as `data-simple` on
 *    <html> so CSS can make things bigger. Unset, it follows `simpleByDefault`:
 *    on for players who joined from `SIMPLE_MODE_SINCE`, off for everyone who
 *    already knows the game. An explicit choice in Settings always wins.
 *    Simple mode is for founders only: investors and bankers always play
 *    the full game, whatever is saved (`setSimpleRole`).
 */
import { useSyncExternalStore } from 'react';

export type SettingKey = 'reduceMotion' | 'skipRides' | 'sound' | 'simple';

const KEYS: Record<SettingKey, string> = {
  reduceMotion: 'runway.reduceMotion',
  skipRides: 'runway.skipRides',
  sound: 'runway.sound',
  simple: 'runway.simple',
};

const DEFAULTS: Record<SettingKey, boolean> = {
  reduceMotion: false,
  skipRides: false,
  sound: true,
  // Until the game knows who's playing; then `setSimpleDefault` decides.
  simple: false,
};

/** Simple mode is on by default for players who joined on or after this day (UTC, ms). */
export const SIMPLE_MODE_SINCE = Date.UTC(2026, 9, 18);

/**
 * Simple mode's default for a player who hasn't chosen: on for anyone who
 * joined on or after `SIMPLE_MODE_SINCE` (`joinedAt` in ms since the epoch,
 * as the server's clock records it), off for existing players and when the
 * join time isn't known. Pure: the unit tests check the rule.
 */
export function simpleByDefault(joinedAt: number | null | undefined): boolean {
  return typeof joinedAt === 'number' && Number.isFinite(joinedAt) && joinedAt >= SIMPLE_MODE_SINCE;
}

/**
 * Simple mode as the player sees it: their own choice ('1' / '0') if they
 * made one, else the default for when they joined.
 */
export function resolveSimple(stored: string | null, joinedAt: number | null | undefined): boolean {
  if (stored === '1' || stored === '0') return stored === '1';
  return simpleByDefault(joinedAt);
}

const JOINED_KEY = 'runway.joinedHere';

/**
 * Onboarding finished in this browser: remember when. The player view
 * doesn't carry the join time yet (`me.joinedAt`), so a player who signed
 * up here still gets Simple mode by default; elsewhere it falls back to off.
 */
export function markJoinedHere(now = Date.now()) {
  try {
    localStorage.setItem(JOINED_KEY, String(now));
  } catch {
    /* storage blocked: the server's join time (when it has one) decides */
  }
}

/** When this player joined: the server's time if the view has it, else this browser's record. */
export function joinedAtOf(me: { joinedAt?: number | null }): number | null {
  if (typeof me.joinedAt === 'number') return me.joinedAt;
  try {
    const v = Number(localStorage.getItem(JOINED_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
const memory: Partial<Record<SettingKey, boolean>> = {};
let simpleDefault = DEFAULTS.simple;
/** Founders (or nobody known yet) can have Simple mode; investors and bankers can't. */
let simpleAllowed = true;

function read(key: SettingKey): boolean {
  if (key === 'simple' && !simpleAllowed) return false;
  if (memory[key] !== undefined) return memory[key]!;
  try {
    const v = localStorage.getItem(KEYS[key]);
    if (v === '1' || v === '0') return v === '1';
  } catch {
    /* storage blocked: defaults */
  }
  return key === 'simple' ? simpleDefault : DEFAULTS[key];
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

function applySimple(on: boolean) {
  if (typeof document === 'undefined') return;
  if (on) document.documentElement.dataset.simple = '1';
  else delete document.documentElement.dataset.simple;
}

export function setSetting(key: SettingKey, on: boolean) {
  memory[key] = on;
  try {
    localStorage.setItem(KEYS[key], on ? '1' : '0');
  } catch {
    /* not persisted; lasts for this session */
  }
  if (key === 'reduceMotion') applyMotion(on);
  if (key === 'simple') applySimple(on);
  for (const l of listeners) l();
}

/**
 * Who's playing is known (the game loaded): Simple mode's default for them,
 * from when they joined. A saved choice still wins; this only fills the gap.
 */
export function setSimpleDefault(joinedAt: number | null | undefined) {
  const on = simpleByDefault(joinedAt);
  if (on === simpleDefault) return applySimple(read('simple'));
  simpleDefault = on;
  applySimple(read('simple'));
  for (const l of listeners) l();
}

/**
 * Who's playing is known: Simple mode only applies to founders. Investors
 * and bankers get the full game (all five tabs); their saved choice is kept
 * for if they found a company.
 */
export function setSimpleRole(role: 'founder' | 'investor' | 'banker') {
  const allowed = role === 'founder';
  if (allowed === simpleAllowed) return;
  simpleAllowed = allowed;
  applySimple(read('simple'));
  for (const l of listeners) l();
}

/** Whether Simple mode can be switched on for this player (founders only). */
export const useSimpleAvailable = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => simpleAllowed,
    () => true,
  );

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

/** Simple mode (Phase 2): four tabs, big labelled buttons, one next step. */
export const useSimple = () => useSetting('simple');

/** Put the saved Reduce motion and Simple mode choices on <html> (called once when the phone loads). */
export function applySavedSettings() {
  applyMotion(read('reduceMotion'));
  applySimple(read('simple'));
}
