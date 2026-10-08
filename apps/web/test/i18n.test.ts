import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FR, FR_PARTS } from '../src/i18n/fr';
import { loadLang, setLang, t, tx } from '../src/i18n';
import { money, parseAmount, pct } from '../src/format';

const SRC = join(__dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

/** Every first argument of t('…') in the client source. */
function uiStrings() {
  const found: { text: string; file: string }[] = [];
  const re = /(?<![\w.])t\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const file of files(SRC).filter((f) => !f.includes('/i18n/'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(re)) {
      found.push({ text: m[2]!.replace(/\\(['"`\\])/g, '$1'), file: file.slice(SRC.length + 1) });
    }
  }
  return found;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('French (§20)', () => {
  beforeAll(() => loadLang('fr'));
  afterEach(() => void setLang('en'));

  it('has a translation for every UI string', () => {
    const missing = uiStrings()
      .filter((s) => FR[s.text] === undefined)
      .map((s) => `${s.file}: ${s.text}`);
    expect(missing).toEqual([]);
  });

  it('never builds a UI string from a template literal (use {placeholders})', () => {
    const bad = uiStrings().filter((s) => s.text.includes('${'));
    expect(bad).toEqual([]);
  });

  it('keeps the same placeholders in both languages', () => {
    const bad = Object.entries(FR)
      .filter(([en, fr]) => placeholders(en).join() !== placeholders(fr).join())
      .map(([en]) => en);
    expect(bad).toEqual([]);
  });

  it('has no conflicting translations between screens', () => {
    const seen = new Map<string, string>();
    const conflicts: string[] = [];
    for (const part of Object.values(FR_PARTS))
      for (const [en, fr] of Object.entries(part)) {
        if (seen.has(en) && seen.get(en) !== fr) conflicts.push(en);
        seen.set(en, fr);
      }
    expect(conflicts).toEqual([]);
  });

  it('translates, fills placeholders and falls back to English', () => {
    setLang('fr');
    expect(t('Home')).toBe('Accueil');
    expect(t('{n} mo', { n: 4 })).toBe('4 mois');
    expect(t('Not in the catalog')).toBe('Not in the catalog');
    expect(tx('A dynamic server message 123')).toBe('A dynamic server message 123');
    setLang('en');
    expect(t('{n} mo', { n: 4 })).toBe('4 mo');
  });

  it('formats money and percentages the French way', () => {
    setLang('fr');
    expect(money(250_000_000, 'NGN')).toBe('₦2,5 M');
    expect(money(1_200_000, 'NGN')).toBe('₦12 k');
    expect(money(120_000, 'NGN')).toBe('₦1 200');
    expect(pct(0.125, 1)).toBe('12,5 %');
    expect(parseAmount('2,5 M')).toBe(250_000_000);
    expect(parseAmount('1 200')).toBe(120_000);
    expect(parseAmount('1,2 Md')).toBe(120_000_000_000);
    expect(parseAmount('1,200')).toBe(120_000);
  });
});
