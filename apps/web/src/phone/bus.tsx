/**
 * Opening the phone from anywhere (a person card's "Chat", a contact), and
 * the navigation the phone and the Home inbox share.
 */
import { createContext, useContext } from 'react';
import type { PlayerView } from '@runway/engine';
import type { Target } from './navigate';

export type PhoneApp = 'home' | 'messages' | 'alerts' | 'contacts' | 'wallet' | 'jobs' | 'map';

export interface PhoneOpen {
  app?: PhoneApp;
  /** Open the chat with this AI character. */
  ai?: string;
  /** Open (or start) the chat with this player. */
  player?: string;
  /** Text to put in the message box, or send at once to an AI character. */
  say?: string;
}

const listeners = new Set<(o: PhoneOpen) => void>();

export function openPhone(o: PhoneOpen = {}) {
  for (const l of listeners) l(o);
}

export function onPhone(cb: (o: PhoneOpen) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
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
