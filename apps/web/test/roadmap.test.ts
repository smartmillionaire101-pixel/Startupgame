import { describe, expect, it } from 'vitest';
import { FEATURES } from '@runway/engine';
import { FR } from '../src/i18n/fr';

describe('product roadmap in French', () => {
  it('translates every feature name, description and customer request', () => {
    const missing = FEATURES.flatMap((f) => [f.name, f.blurb, f.ask]).filter((s) => !FR[s]);
    expect(missing).toEqual([]);
  });

  it('translates the engine’s ready-to-release and dependency notes', () => {
    const missing = FEATURES.flatMap((f) => [
      `${f.name} is ready to release.`,
      `Ship ${f.name} first.`,
    ]).filter((s) => !FR[s]);
    expect(missing).toEqual([]);
  });
});
