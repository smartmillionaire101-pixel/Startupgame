import { describe, expect, it } from 'vitest';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { addFounder, DAY, makeWorld, run, settle, T0 } from './helpers.js';

/**
 * Today for a banker with a licensed bank (player feedback: "Today shows
 * start a company"): the bank's loan book says which borrowers are late, so
 * Today can list them with the loan requests and mandates waiting.
 */
describe('a licensed banker’s loan book', () => {
  it('shows each player borrower’s missed payments, and none for companies', () => {
    let w = run(makeWorld(71, ['lagos']), 'u_bank', {
      type: 'player.create',
      handle: 'h_bank',
      name: 'Bea Banker',
      role: 'banker',
      backgroundId: 'b-wealthy',
      market: 'lagos',
      bank: { name: 'Trust Bank 071', bankType: 'microfinance' },
    }).world;
    w = settle(w, 'lagos', 2, T0 + DAY);
    w = addFounder(w, 'u_f');
    const bank = Object.values(w.banks).find((b) => b.ownerId === 'u_bank')!;
    expect(bank.status).toBe('licensed');

    // A personal loan from the bank with one payment missed (as the month end leaves it).
    const late = structuredClone(w) as World;
    late.players.u_f!.loans.push({
      id: 'loan_t',
      lender: bank.name,
      lenderAccount: bank.account,
      lenderBankId: bank.id,
      market: 'lagos',
      principal: 1_000_000,
      outstanding: 900_000,
      rateBps: 2_000,
      monthlyPayment: 100_000,
      monthsLeft: 10,
      collateral: null,
      missed: 1,
    });
    const book = playerView(late, 'u_bank')!.bank!.loanBook;
    expect(book).toContainEqual(
      expect.objectContaining({ borrower: late.players.u_f!.name, missed: 1 }),
    );
    expect(book.every((l) => typeof l.missed === 'number')).toBe(true);
  });
});
