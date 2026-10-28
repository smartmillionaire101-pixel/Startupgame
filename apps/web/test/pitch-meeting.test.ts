import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadLang, setLang } from '../src/i18n';
import { pctOf } from '../src/screens/PitchMeeting';

/** Round 7 #13: the share an ask buys, never "0%" for a small ask. */
describe('pitch meeting: the share you give', () => {
  beforeAll(() => loadLang('fr'));
  afterEach(() => void setLang('en'));

  it('shows the real decimals, and "<0.1%" for a sliver', () => {
    expect(pctOf(150_000_00, 750_000_00)).toBe('16.7%');
    expect(pctOf(5_000_00, 995_000_00)).toBe('0.50%');
    expect(pctOf(100_000_00, 482_000_000_00)).toBe('<0.1%');
    expect(pctOf(0, 100)).toBe('0%');
    setLang('fr');
    expect(pctOf(5_000_00, 995_000_00)).toBe('0,50 %');
  });
});
