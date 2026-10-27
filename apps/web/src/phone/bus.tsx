/**
 * Opening the phone from anywhere (a person card's "Chat", a contact), and
 * the navigation the phone and the Home inbox share.
 */
import { createContext, useContext } from 'react';
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
  | 'goingout'
  /** The founder journey: chapters and objectives (founders only). */
  | 'journey'
  /** Founder Journey 2a: the sales pipeline (founders with a company). */
  | 'sales'
  /** Founder Journey 5: exits, the stock market, wealth and the capital allocator paths. */
  | 'capital'
  /** My purchases: your wardrobe and the things you keep (../avatar/Wardrobe.tsx). */
  | 'purchases'
  /** Shop note: the catalogue, ordered online for delivery, and your orders. */
  | 'shop';

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
  /** Wave 10: open the Homes app on your portfolio, at this home. */
  property?: string;
  /** Open the Bank app on this transaction's receipt (`money.send` returns its `receiptId`). */
  receipt?: string;
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
// (the HUD's round phone button). The phone itself keeps it up to date.

let badge = 0;
const badgeListeners = new Set<() => void>();

export function setPhoneBadge(n: number) {
  if (n === badge) return;
  badge = n;
  for (const l of badgeListeners) l();
} /** The AI chat id for a city character (fund partners, AI founders, owners and angels). */
export function aiCharacterId(a: { kind: string; ref: string; chat?: string }): string | null {
  if (a.chat) return a.chat;
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
