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
 * which translates exact matches, then the engine's templates (fr/engine-texts:
 * 'Loan from {lender} repaid in full.' reads any lender, and what fills a
 * placeholder is translated too), then sentence by sentence, and otherwise
 * leaves the English.
 */
import { useSyncExternalStore } from 'react';

/**
 * The French catalog is its own chunk, loaded only for French players (English
 * players never download it). Until it arrives the text reads in English;
 * main.tsx waits for it before the first render when French is chosen.
 */
let FR: Record<string, string> | null = null;
/** The engine's templates, for tx() (French only). */
let SERVER: Record<string, string> | null = null;
let loadingFr: Promise<void> | null = null;

/** Load a language's catalog (English has none). */
export function loadLang(l: Lang): Promise<void> {
  if (l !== 'fr' || FR) return Promise.resolve();
  loadingFr ??= import('./fr').then(
    (m) => {
      FR = m.FR;
      SERVER = m.FR_SERVER;
    },
    () => {
      loadingFr = null; // offline: English for now, retried next time
    },
  );
  return loadingFr;
}

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

/** Switch language (once its catalog has loaded). */
export function setLang(next: Lang): Promise<void> {
  if (next === lang) return Promise.resolve();
  if (next === 'fr' && !FR) return loadLang('fr').then(() => apply(next));
  apply(next);
  return Promise.resolve();
}

function apply(next: Lang) {
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

/**
 * Translate a UI string written in English. A key can end in "|context"
 * ('Founder|woman') when French needs a form English doesn't: English (and
 * any missing translation) drops the context.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const found = lang === 'fr' ? FR?.[text] : undefined;
  return fill(found ?? text.replace(/\|[a-z]+$/, ''), vars);
}

/** A server template: its words around the placeholders, as a whole-text match. */
interface Pattern {
  re: RegExp;
  names: string[];
  fr: string;
  /** Its longest run of words, checked before the regex (cheap). */
  lit: string;
}

let PATTERNS: Pattern[] | null = null;
const SEEN = new Map<string, string>();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The templates, most words first: the most specific one that fits wins. */
function patterns(): Pattern[] {
  if (PATTERNS) return PATTERNS;
  const out: (Pattern & { score: number })[] = [];
  for (const [en, fr] of Object.entries(SERVER ?? {})) {
    const parts = en.split(/\{(\w+)\}/);
    if (parts.length < 2) continue;
    const lits = parts.filter((_, i) => i % 2 === 0);
    const src = parts.map((x, i) => (i % 2 ? '([\\s\\S]*?)' : escapeRe(x))).join('');
    out.push({
      re: new RegExp(`^${src}$`),
      names: parts.filter((_, i) => i % 2 === 1),
      fr,
      lit: lits.reduce((a, b) => (b.length > a.length ? b : a), ''),
      score: lits.join('').length,
    });
  }
  PATTERNS = out.sort((a, b) => b.score - a.score);
  return PATTERNS;
}

/** One piece of server text: exact, a template, or a lower-case word the catalog has capitalised. */
function txOne(text: string, depth: number): string | undefined {
  const exact = FR?.[text];
  if (exact !== undefined) return exact;
  if (depth > 3 || !/[A-Za-z]{2}/.test(text)) return undefined;
  for (const p of patterns()) {
    if (p.lit && !text.includes(p.lit)) continue;
    const m = p.re.exec(text);
    if (!m) continue;
    const vars: Record<string, string> = {};
    p.names.forEach((n, i) => {
      vars[n] = txPart(m[i + 1] ?? '', depth + 1);
    });
    return fill(p.fr, vars);
  }
  const lower = /^[a-z]/.test(text) ? FR?.[text[0]!.toUpperCase() + text.slice(1)] : undefined;
  return lower !== undefined ? lower[0]!.toLowerCase() + lower.slice(1) : undefined;
}

/** What fills a placeholder: translated when it's catalog text, its spacing kept. */
function txPart(value: string, depth: number): string {
  const [, lead, core, tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(value)!;
  if (!core) return value;
  // A sentence the template ends itself ("passing for now: {why}.") is in the catalog with its full stop.
  const stopped = /[.!?]$/.test(core) ? undefined : txOne(`${core}.`, depth)?.replace(/\.$/, '');
  return `${lead}${txOne(core, depth) ?? stopped ?? core}${tail}`;
}

/**
 * Translate text that came from the server: an exact match, an engine
 * template, or else sentence by sentence; English when nothing fits.
 */
export function tx(text: string): string {
  if (lang !== 'fr' || !FR || !text) return text;
  const seen = SEEN.get(text);
  if (seen !== undefined) return seen;
  let out = txOne(text, 0);
  if (out === undefined) {
    const sentences = text.split(/(?<=[.!?”])\s+(?=[A-Z“])/);
    if (sentences.length > 1) {
      const each = sentences.map((s) => txOne(s, 0));
      if (each.some((s) => s !== undefined)) out = each.map((s, i) => s ?? sentences[i]).join(' ');
    }
  }
  out ??= text;
  if (SEEN.size > 2000) SEEN.clear();
  SEEN.set(text, out);
  return out;
}

/** BCP 47 locale for Intl formatting. */
export const locale = () => (lang === 'fr' ? 'fr-FR' : 'en-GB');
