/**
 * Opening the phone from anywhere (a person card's "Chat", a contact), and
 * the navigation the phone and the Home inbox share.
 */
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { PlayerView } from '@runway/engine';
import type { Target } from './navigate';

/**
 * The phone's screens. 'home' is the home screen; 'house' is the Home app
 * (your flat). 'wallet' is the Wave 5 name of the Bank app and still opens it.
 */
export type PhoneApp =
  | 'home'
  | 'messages'
  | 'alerts'
  | 'contacts'
  | 'wallet'
  | 'jobs'
  | 'map'
  | 'rides'
  | 'chop'
  | 'bank'
  | 'invest'
  | 'fit'
  | 'founder'
  | 'news'
  | 'travel'
  | 'house'
  | 'social'
  | 'settings'
  /** Wave 8: tech events, hangouts and invitations. */
  | 'events'
  /** Wave 10: the property market and your portfolio; things to do by lifestyle tier. */
  | 'homes'
  | 'goingout';

export interface PhoneOpen {
  app?: PhoneApp;
  /** Open the chat with this AI character. */
  ai?: string;
  /** Open (or start) the chat with this player. */
  player?: string;
  /** Text to put in the message box, or send at once to an AI character. */
  say?: string;
  /** Contacts: open the picker to invite someone over (`home.invite`). */
  invite?: boolean;
  /** Wave 8: open the wallet to send money to this player ('' = pick who). */
  send?: string;
}

const listeners = new Set<(o: PhoneOpen) => void>();
/** An open request made before the phone mounted (e.g. while it lazy-loads). */
let queued: PhoneOpen | null = null;

export function openPhone(o: PhoneOpen = {}) {
  if (!listeners.size) {
    queued = o;
    return;
  }
  for (const l of listeners) l(o);
}

export function onPhone(cb: (o: PhoneOpen) => void): () => void {
  listeners.add(cb);
  if (queued) {
    const o = queued;
    queued = null;
    cb(o);
  }
  return () => listeners.delete(cb);
}

// ---------------------------------------------------------------------------
// The phone's badge (unread messages + alerts), for a phone button elsewhere
// (the top bar). The phone itself keeps it up to date.

let badge = 0;
const badgeListeners = new Set<() => void>();

export function setPhoneBadge(n: number) {
  if (n === badge) return;
  badge = n;
  for (const l of badgeListeners) l();
}

export const getPhoneBadge = () => badge;

/** Unread messages and alerts, live. */
export function usePhoneBadge(): number {
  return useSyncExternalStore(
    (cb) => {
      badgeListeners.add(cb);
      return () => badgeListeners.delete(cb);
    },
    getPhoneBadge,
    getPhoneBadge,
  );
}

/** The AI chat id for a city character (fund partners, AI founders, owners and angels). */
export function aiCharacterId(a: { kind: string; ref: string }): string | null {
  switch (a.kind) {
    case 'partner':
      return `fund:${a.ref}`;
    case 'owner':
      return `biz:${a.ref}`;
    case 'founder':
    case 'angel':
      return a.ref;
    default:
      return null;
  }
}

type InboxItem = PlayerView['inbox'][number];

export interface Nav {
  /** Go to a tab, a deal card or a place in the City. */
  go: (target: Target) => void;
  /** Mark a notification read and go where it matters. */
  openItem: (item: InboxItem) => void;
}

export const NavContext = createContext<Nav | null>(null);

/** Null outside the game screen (tests, onboarding). */
export const useNav = () => useContext(NavContext);
