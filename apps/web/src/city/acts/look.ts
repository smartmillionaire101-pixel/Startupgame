/**
 * Your look, and everyone else's, as `avatarLook` reads it.
 *
 * Two sources, merged by `avatarLook` (../art.tsx) everywhere a person is
 * drawn (the map, rooms, home, cards, portraits):
 *
 * - Phase 6a: the look a player saved in the character creator, which the
 *   server keeps (`player.appearance`) and sends in the view and in presence.
 *   `rememberLook` collects it here, by player id, so a figure drawn from
 *   just an id finds it.
 * - Wave 8 §B: a look changed by what you do (a haircut, braids), stored on
 *   this device first in localStorage `runway.look.<playerId>` so it shows at
 *   once. It carries the time it was made (`at`): the newer of it and the
 *   server's look wins, so a look saved on another device later replaces it.
 *
 * No imports from the art: this module is read by `avatarLook` itself.
 */
import { useSyncExternalStore } from 'react';
import {
  HAIR_STYLES as ALL_STYLES,
  MARKET_IDS,
  type Appearance,
  type MarketId,
  type HairStyle as EngineHairStyle,
} from '@runway/engine';

export type HairStyle = EngineHairStyle;
const HAIR_STYLES: readonly HairStyle[] = ALL_STYLES;

export interface LookOverride {
  hairStyle?: HairStyle;
  hair?: string;
  /** Founder Journey 6: an outfit colour picked on the entry screen. */
  top?: string;
  /** When this device made the change (ms); missing on older saves (= oldest). */
  at?: number;
}

const KEY = (playerId: string) => `runway.look.${playerId}`;
const cache = new Map<string, LookOverride | null>();
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  listeners.forEach((f) => f());
};

const valid = (raw: unknown): LookOverride | null => {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const out: LookOverride = {};
  if (typeof o.hairStyle === 'string' && (HAIR_STYLES as string[]).includes(o.hairStyle))
    out.hairStyle = o.hairStyle as HairStyle;
  if (typeof o.hair === 'string' && /^#[0-9a-f]{3,8}$/i.test(o.hair)) out.hair = o.hair;
  if (typeof o.top === 'string' && /^#[0-9a-f]{3,8}$/i.test(o.top)) out.top = o.top;
  if (!(out.hairStyle || out.hair || out.top)) return null;
  if (typeof o.at === 'number' && Number.isFinite(o.at)) out.at = o.at;
  return out;
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
  // A new haircut keeps the outfit colour you picked (and the other way round).
  const v = o ? valid({ ...(lookOverride(playerId) ?? {}), ...o, at: o.at ?? Date.now() }) : null;
  cache.set(playerId, v);
  try {
    if (v) localStorage.setItem(KEY(playerId), JSON.stringify(v));
    else localStorage.removeItem(KEY(playerId));
  } catch {
    /* storage blocked: the look lasts this session */
  }
  bump();
}

// ---------------------------------------------------------------------------
// Phase 6a: looks the server keeps (the creator), by player id.

const known = new Map<string, { a: Appearance; at: number }>();

/**
 * Note a player's saved look (from the view or presence); null forgets it.
 * Redraws only when something changed.
 */
export function rememberLook(
  playerId: string,
  a: Appearance | null | undefined,
  at?: number | null,
) {
  if (!playerId) return;
  const was = known.get(playerId);
  if (!a) {
    if (was) {
      known.delete(playerId);
      bump();
    }
    return;
  }
  const next = { a, at: at ?? 0 };
  if (was && was.at === next.at && JSON.stringify(was.a) === JSON.stringify(a)) return;
  known.set(playerId, next);
  bump();
}

// Home cities: a look nobody chose takes the skin tones of the person's own
// city (the engine's SKIN_MIX), so they look the same wherever they're seen.
// Someone whose home we don't know (an AI person, a passer-by) lives in the
// city on screen.
const homes = new Map<string, MarketId>();
let localCity: MarketId | null = null;
const isCity = (m: unknown): m is MarketId =>
  typeof m === 'string' && (MARKET_IDS as readonly string[]).includes(m);

/** Note a player's home city (from the view or presence). */
export function rememberHome(playerId: string, home: unknown) {
  if (!playerId || !isCity(home) || homes.get(playerId) === home) return;
  homes.set(playerId, home);
  bump();
}

/** The city a person's unchosen look takes its skin tones from. */
export const homeOf = (playerId: string): MarketId | null => homes.get(playerId) ?? localCity;

/** Everyone a view names: you, and the players in your market. */
export function rememberViewLooks(view: {
  me: { id: string; market?: string; appearance?: Appearance | null; appearanceAt?: number | null };
  market?: { id?: string };
  players?: {
    id: string;
    home?: string;
    appearance?: Appearance | null;
    appearanceAt?: number | null;
  }[];
}) {
  const here = view.market?.id;
  if (isCity(here) && localCity !== here) {
    localCity = here;
    bump();
  }
  rememberHome(view.me.id, view.me.market);
  rememberLook(view.me.id, view.me.appearance, view.me.appearanceAt);
  for (const p of view.players ?? []) {
    rememberHome(p.id, p.home);
    if (p.appearance !== undefined) rememberLook(p.id, p.appearance, p.appearanceAt);
  }
}

/** A player's look from the server, if they saved one. */
export const savedLook = (playerId: string): { a: Appearance; at: number } | null =>
  known.get(playerId) ?? null;

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

const BARBER: HairStyle[] = ['buzz', 'short', 'afro', 'bald', 'twists'];
const SALON_F: HairStyle[] = ['braids', 'bun', 'long', 'afro', 'locs', 'twists', 'curly'];
const SALON_M: HairStyle[] = ['afro', 'short', 'buzz', 'twists', 'locs'];
const DYES = ['#7a4b24', '#2b1b10', '#4a2c17', '#120c08'];

/**
 * The next look from a chair: a barber gives the next cut, a salon the next
 * style (and sometimes a new colour). Always different from what you have.
 */
export function nextLook(
  cur: { hairStyle: HairStyle; hair: string; gender?: 'female' | 'male' },
  where: 'barber' | 'salon',
): Required<Pick<LookOverride, 'hairStyle' | 'hair'>> {
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
  bald: 'A clean shave',
  locs: 'Fresh locs',
  twists: 'Neat twists',
  curly: 'Soft curls',
};
