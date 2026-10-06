/**
 * Wave 8 §B: your look, changed by what you do (a haircut, braids). Stored
 * client-side per player in localStorage `runway.look.<playerId>` and applied
 * by `avatarLook` everywhere you are drawn (the map, rooms, home, cards).
 *
 * No imports from the art: this module is read by `avatarLook` itself.
 */
import { useSyncExternalStore } from 'react';

export type HairStyle = 'short' | 'afro' | 'bun' | 'long' | 'braids' | 'buzz';
export const HAIR_STYLES: readonly HairStyle[] = ['short', 'afro', 'bun', 'long', 'braids', 'buzz'];

export interface LookOverride {
  hairStyle?: HairStyle;
  hair?: string;
}

const KEY = (playerId: string) => `runway.look.${playerId}`;
const cache = new Map<string, LookOverride | null>();
let version = 0;
const listeners = new Set<() => void>();

const valid = (raw: unknown): LookOverride | null => {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const out: LookOverride = {};
  if (typeof o.hairStyle === 'string' && (HAIR_STYLES as string[]).includes(o.hairStyle))
    out.hairStyle = o.hairStyle as HairStyle;
  if (typeof o.hair === 'string' && /^#[0-9a-f]{3,8}$/i.test(o.hair)) out.hair = o.hair;
  return out.hairStyle || out.hair ? out : null;
};

/** Your saved look, or null (AI characters and players who never changed it). */
export function lookOverride(playerId: string): LookOverride | null {
  if (!playerId || playerId.startsWith('ai:') || playerId.includes(':')) return null;
  if (cache.has(playerId)) return cache.get(playerId)!;
  let o: LookOverride | null = null;
  try {
    const s = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY(playerId));
    o = s ? valid(JSON.parse(s)) : null;
  } catch {
    o = null;
  }
  cache.set(playerId, o);
  return o;
}

/** Save a new look and redraw everyone who shows it. */
export function setLookOverride(playerId: string, o: LookOverride | null) {
  const v = o ? valid(o) : null;
  cache.set(playerId, v);
  try {
    if (v) localStorage.setItem(KEY(playerId), JSON.stringify(v));
    else localStorage.removeItem(KEY(playerId));
  } catch {
    /* storage blocked: the look lasts this session */
  }
  version++;
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  const onStorage = (e: StorageEvent) => {
    if (!e.key?.startsWith('runway.look.')) return;
    cache.delete(e.key.slice('runway.look.'.length));
    version++;
    f();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(f);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
};

/** Changes whenever a look changes: add it to the deps of a memoised `avatarLook`. */
export const useLookVersion = () =>
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );

const BARBER: HairStyle[] = ['buzz', 'short', 'afro'];
const SALON_F: HairStyle[] = ['braids', 'bun', 'long', 'afro'];
const SALON_M: HairStyle[] = ['afro', 'short', 'buzz'];
const DYES = ['#7a4b24', '#2b1b10', '#4a2c17', '#120c08'];

/**
 * The next look from a chair: a barber gives the next cut, a salon the next
 * style (and sometimes a new colour). Always different from what you have.
 */
export function nextLook(
  cur: { hairStyle: HairStyle; hair: string; gender?: 'female' | 'male' },
  where: 'barber' | 'salon',
): Required<LookOverride> {
  const list = where === 'barber' ? BARBER : cur.gender === 'female' ? SALON_F : SALON_M;
  const at = list.indexOf(cur.hairStyle);
  const hairStyle = list[(at + 1) % list.length]!;
  const hair =
    where === 'salon' ? DYES[(DYES.indexOf(cur.hair) + 1 + DYES.length) % DYES.length]! : cur.hair;
  return { hairStyle, hair };
}

/** A name for a style, for the result card (English: the caller translates). */
export const STYLE_NAME: Record<HairStyle, string> = {
  short: 'A sharp short cut',
  afro: 'A fresh afro',
  bun: 'A neat bun',
  long: 'Long and glossy',
  braids: 'Braids',
  buzz: 'A clean fade',
};
