import { describe, expect, it } from 'vitest';
import {
  multipleText,
  portfolioSummary,
  positionMultiple,
  type PortfolioRow,
} from '../src/screens/portfolio';

const row = (r: Partial<PortfolioRow>): PortfolioRow => ({
  currency: 'NGN',
  invested: 100,
  mark: 100,
  returned: 0,
  writtenOff: false,
  status: 'active',
  ...r,
});

describe('portfolio returns (Phase 8)', () => {
  it('counts held value at the mark, exits as cash, write-offs as nothing', () => {
    const rows = [
      row({ invested: 100, mark: 300 }), // paper gain
      row({ invested: 100, mark: 0, returned: 250, status: 'acquired' }), // exited
      row({ invested: 100, mark: 80, writtenOff: true }), // lost
    ];
    const [s] = portfolioSummary(rows);
    expect(s).toEqual({
      currency: 'NGN',
      positions: 3,
      invested: 300,
      held: 300,
      returned: 250,
      tvpi: 1.83,
      dpi: 0.83,
      writeOffs: 1,
    });
    expect(rows.map(positionMultiple)).toEqual([3, 2.5, 0]);
  });

  it('never adds across currencies, and copes with nothing invested', () => {
    const s = portfolioSummary([
      row({ currency: 'NGN', invested: 100, mark: 200 }),
      row({ currency: 'USD', invested: 0, mark: 0 }),
    ]);
    expect(s.map((x) => [x.currency, x.tvpi, x.dpi])).toEqual([
      ['NGN', 2, 0],
      ['USD', null, null],
    ]);
    expect(multipleText(null)).toBe('–');
    expect(multipleText(1.834)).toBe('1.8×');
  });
});
