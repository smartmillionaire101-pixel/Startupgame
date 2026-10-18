import { describe, expect, it } from 'vitest';
import { LIFE_EVENT_TEMPLATES } from '@runway/engine';
import { FR } from '../src/i18n/fr';

/**
 * Phase 5 life events: the card shows the engine's English (titles, stories,
 * choices and what happened) through the French catalog, so every line needs
 * a translation with the same {placeholders}.
 */
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('life events in French', () => {
  it('translates every line of every life event', () => {
    const lines = LIFE_EVENT_TEMPLATES.flatMap((t) => [
      t.title,
      t.body,
      ...t.choices.flatMap((c) => [c.label, c.outcome, c.win, c.lose]),
    ]).filter((s): s is string => !!s);
    expect(lines.filter((s) => FR[s] === undefined)).toEqual([]);
    expect(lines.filter((s) => placeholders(s).join() !== placeholders(FR[s]!).join())).toEqual([]);
  });
});
