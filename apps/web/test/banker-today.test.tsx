import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BankerToday } from '../src/screens/BankerToday';

/** Today for a banker (player feedback: "Today shows start a company"). */

const go = vi.fn();
let view: Record<string, unknown> = {};

vi.mock('../src/store', () => ({
  useView: () => ({ view, cur: 'GBP', send: vi.fn(), meta: { bankTypes: [] } }),
  useGame: () => ({ busy: false, lite: false }),
}));
vi.mock('../src/phone/bus', () => ({ useNav: () => ({ go }) }));

afterEach(() => {
  cleanup();
  go.mockReset();
});

const base = {
  me: { role: 'banker' },
  market: { currency: 'GBP', costOfLiving: 100_000, baseRateBps: 750, banks: [] },
  accounts: { local: { balance: 500_000 } },
  deals: [],
  bankWork: null,
};

const missing = ['hire.cro', 'hire.aml', 'system', 'branch'];
const applying = {
  ...base,
  bank: { id: 'bk1', name: 'Thames Trust', status: 'applying', licenceDueMonth: 3 },
  banker: {
    centralBank: 'london:central-bank',
    tutorial: null,
    bank: {
      status: 'applying',
      licence: { day: 12, reviewDays: 30, decisionMonth: 3, missing },
    },
  },
  bankWork: { banker: true, active: [] },
};

it('starts a new banker on their bank, not a company', () => {
  view = { ...base, bank: null, banker: { centralBank: 'london:central-bank', bank: null } };
  render(<BankerToday />);
  expect(screen.getByRole('heading', { name: /Start your bank/ })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Start a bank' })).toBeTruthy();
  expect(screen.queryByText(/Start again/)).toBeNull();
  expect(screen.getByRole('listitem', { current: 'step' }).getAttribute('data-stage')).toBe('name');
});

it('tracks the licence review and its checklist, and points at the next item', () => {
  view = applying;
  const { container } = render(<BankerToday />);
  expect(screen.getByText('Review: day 12 of 30')).toBeTruthy();
  expect(screen.getByText('4 of 8 done')).toBeTruthy();
  expect(container.querySelector('[data-stage="checklist"]')!.getAttribute('aria-current')).toBe(
    'step',
  );
  fireEvent.click(container.querySelector('[data-step="hire.cro"]')!);
  expect(go).toHaveBeenCalledWith({ kind: 'tab', tab: 'bank' });
  expect(screen.getByText('The advisory desk is open now')).toBeTruthy();
});

it('sends a banker who still needs the interview to the Central Bank', () => {
  view = {
    ...applying,
    banker: {
      ...applying.banker,
      bank: {
        status: 'applying',
        licence: { ...applying.banker.bank.licence, missing: ['interview', ...missing] },
      },
    },
  };
  const { container } = render(<BankerToday />);
  fireEvent.click(container.querySelector('[data-step="interview"]')!);
  expect(go).toHaveBeenCalledWith({ kind: 'place', place: 'civic:london:central-bank' });
});

const licensed = (capitalRatio: number) => ({
  ...base,
  bank: {
    id: 'bk1',
    name: 'Thames Trust',
    status: 'licensed',
    stars: 4,
    minCapitalRatio: 0.1,
    policy: { loanSpreadPp: 4, depositRateBps: 400 },
    figures: {
      deposits: 84_000_000,
      loans: 61_000_000,
      customers: 3420,
      capitalRatio,
      lendingRoom: 2_000_000,
    },
    lastMonth: { net: 410_000 },
    loanBook: [
      { borrower: 'Ada', outstanding: 1_500_000, rateBps: 1100, monthsLeft: 8, missed: 1 },
      { borrower: 'Oja Ltd', outstanding: 3_000_000, rateBps: 1100, monthsLeft: 8, missed: 0 },
    ],
  },
  deals: [
    {
      id: 'd1',
      status: 'open',
      counterparty: { kind: 'playerbank', id: 'bk1' },
      terms: { kind: 'loan', amount: 6_200_000 },
    },
  ],
  bankWork: { banker: true, active: [{ id: 'm1', client: { name: 'Kola Foods' } }] },
});

it('sums up a licensed bank and warns when capital is thin', () => {
  view = licensed(0.106);
  const { container } = render(<BankerToday />);
  expect(container.querySelector('[data-banker-today="licensed"]')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Capital is thin' })).toBeTruthy();
  expect(screen.getByText('1 loan request')).toBeTruthy();
  expect(screen.getByText('1 advisory mandate')).toBeTruthy();
  expect(screen.getByText('1 late borrower')).toBeTruthy();
  expect(container.querySelector('[data-step="capital"]')).toBeTruthy();
  expect(screen.queryByText(/Start your bank/)).toBeNull();
});

it('puts the loan requests next when capital is healthy', () => {
  view = licensed(0.2);
  const { container } = render(<BankerToday />);
  expect(screen.queryByRole('heading', { name: /Capital is/ })).toBeNull();
  const next = container.querySelectorAll('[data-step="requests"]');
  // In "Waiting for you" and as the next step.
  expect(next).toHaveLength(2);
  expect(next[1]!.textContent).toContain('Answer the loan requests');
});
