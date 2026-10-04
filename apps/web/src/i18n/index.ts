/**
 * Languages (§20 "English at launch, French in phase 2").
 *
 * Gettext style: the English text is the key, so anything without a
 * translation still reads correctly in English. Placeholders use {name}:
 *
 *   t('Offer for {name}', { name: target.name })
 *
 * French catalogs live in ./fr, one file per screen; a test checks every
 * t('…') in the source has a French entry with the same placeholders.
 * Text produced by the game server (news, inbox, refusals) goes through tx(),
 * which translates exact matches and otherwise leaves the English.
 */
import { useSyncExternalStore } from 'react';
import { FR } from './fr';

export type Lang = 'en' | 'fr';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'Français' },
];

const KEY = 'rw_lang';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'fr') return saved;
  } catch {
    // Storage blocked: fall through to the browser language.
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr')
    ? 'fr'
    : 'en';
}

let lang: Lang = detect();
const listeners = new Set<() => void>();

export const getLang = () => lang;

export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Not persisted; still switches for this session.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const l of listeners) l();
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getLang,
    getLang,
  );
}

const fill = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;

/** Translate a UI string written in English. */
export function t(text: string, vars?: Record<string, string | number>): string {
  return fill(lang === 'fr' ? (FR[text] ?? text) : text, vars);
}

/** Translate text that came from the server, when there's an exact match. */
export function tx(text: string): string {
  return lang === 'fr' ? (FR[text] ?? text) : text;
}

/** BCP 47 locale for Intl formatting. */
export const locale = () => (lang === 'fr' ? 'fr-FR' : 'en-GB');
