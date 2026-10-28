/**
 * The engine's texts in French: every inbox notification the engine can send,
 * and the round-7 refusals, pitch reasons and line tables, has a French entry
 * that tx() reads back with names and amounts filled in.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FR, FR_SERVER } from '../src/i18n/fr';
import { loadLang, setLang, tx } from '../src/i18n';
import { engineTexts, shape } from './engine-texts';

describe('engine texts in French', () => {
  beforeAll(() => loadLang('fr'));
  afterEach(() => void setLang('en'));

  it('finds the engine’s notifications', () => {
    const all = engineTexts();
    expect(all.length).toBeGreaterThan(250);
    expect(all.some((x) => x.text === 'Loan from {} repaid in full.')).toBe(true);
    expect(all.some((x) => x.file === 'rest.ts' && x.text === 'You’re not resting.')).toBe(true);
  });

  it('has a French template for every engine notification', () => {
    const exact = new Set(Object.keys(FR));
    const templates = new Set(Object.keys(FR_SERVER).map(shape));
    const has = (s: string) => (s.includes('{}') ? templates.has(s) : exact.has(s));
    const missing = engineTexts()
      .filter((x) => !has(x.text) && !(x.variants.length && x.variants.every(has)))
      .map((x) => `${x.file}:${x.line} ${x.text}`);
    expect(missing).toEqual([]);
  });

  it('reads filled-in engine text in French', () => {
    setLang('fr');
    expect(tx('Loan from First Lagos Bank repaid in full.')).toBe(
      'Prêt de First Lagos Bank entièrement remboursé.',
    );
    // What fills a placeholder is translated too.
    expect(tx('Ada Obi: “Thank you. We’re passing for now: We’re too far apart on price.”')).toBe(
      'Ada Obi : « Merci. Nous passons notre tour pour l’instant : Nous sommes trop éloignés sur le prix. »',
    );
    expect(tx('Kemi: “Come back when one customer pays you.”')).toBe(
      'Kemi : « Revenez quand un client vous paiera. »',
    );
    expect(tx('Career: you’re now an angel investor. More deals.')).toMatch(/^Carrière : /);
    expect(tx('Resting needs 2h; you have 1h left this month.')).toBe(
      'Se reposer demande 2 h ; il vous reste 1 h ce mois-ci.',
    );
    // Sentence by sentence when the whole doesn't match.
    expect(tx('You’re not resting. Something new the catalog never saw.')).toBe(
      'Vous ne vous reposez pas. Something new the catalog never saw.',
    );
    // English stays English.
    setLang('en');
    expect(tx('Loan from First Lagos Bank repaid in full.')).toBe(
      'Loan from First Lagos Bank repaid in full.',
    );
  });
});
