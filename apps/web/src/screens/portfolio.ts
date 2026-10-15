/**
 * Portfolio returns (Phase 8, §7.4, §9.5): what you put in, what is still
 * held at its mark, what came back as cash, and the multiples investors use.
 * Per currency, never added across currencies. Pure: the screen and the
 * tests share it.
 *
 * - TVPI (total value to paid-in): (still held + returned) ÷ invested.
 * - DPI (distributions to paid-in): returned ÷ invested. Only this is cash.
 * - A position's multiple: (its mark + what it returned) ÷ what it cost.
 */
export interface PortfolioRow {
  currency: string;
  invested: number;
  mark: number;
  returned: number;
  writtenOff: boolean;
  status: string;
}

export interface PortfolioSummary {
  currency: string;
  positions: number;
  invested: number;
  /** Positions not exited or written off, at their mark. */
  held: number;
  returned: number;
  tvpi: number | null;
  dpi: number | null;
  writeOffs: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A position's value now: nothing once written off, its mark while the company is active. */
export const heldValue = (r: PortfolioRow) => (r.writtenOff || r.status !== 'active' ? 0 : r.mark);

/** (value now + cash back) ÷ cost, or null with nothing invested. */
export function positionMultiple(r: PortfolioRow): number | null {
  return r.invested > 0 ? round2((heldValue(r) + r.returned) / r.invested) : null;
}

export function portfolioSummary(rows: readonly PortfolioRow[]): PortfolioSummary[] {
  const by = new Map<string, PortfolioSummary>();
  for (const r of rows) {
    const s = by.get(r.currency) ?? {
      currency: r.currency,
      positions: 0,
      invested: 0,
      held: 0,
      returned: 0,
      tvpi: null,
      dpi: null,
      writeOffs: 0,
    };
    s.positions += 1;
    s.invested += r.invested;
    s.held += heldValue(r);
    s.returned += r.returned;
    if (r.writtenOff) s.writeOffs += 1;
    by.set(r.currency, s);
  }
  return [...by.values()].map((s) => ({
    ...s,
    tvpi: s.invested > 0 ? round2((s.held + s.returned) / s.invested) : null,
    dpi: s.invested > 0 ? round2(s.returned / s.invested) : null,
  }));
}

/** "2.4×", or "–" when there is nothing to divide by. */
export const multipleText = (m: number | null) => (m === null ? '–' : `${m.toFixed(1)}×`);
