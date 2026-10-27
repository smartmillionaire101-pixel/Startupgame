import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BankInterviewCard } from '../src/screens/BankLicence';

/** Play-test #13: the Central Bank interview's result stays on the card. */

let view: Record<string, unknown> = {};

vi.mock('../src/store', () => ({
  useView: () => ({ view, send: vi.fn(), busy: false }),
  useGame: () => ({ busy: false, lite: false }),
}));
vi.mock('../src/phone/bus', () => ({ useNav: () => ({ go: vi.fn() }) }));

afterEach(cleanup);

const questions = ['capital', 'risk', 'aml', 'governance'].map((id) => ({
  id,
  topic: id,
  text: `Question on ${id}?`,
  options: ['A', 'B', 'C'],
}));

const withInterview = (interview: unknown) => ({
  market: { currency: 'NGN' },
  banker: {
    bank: {
      id: 'bk1',
      name: 'Lagoon Trust',
      status: 'applying',
      licence: { interview, interviewPass: 60, questions },
    },
  },
});

it('shows the score and the pass once the interview is passed', () => {
  view = withInterview({ score: 79, month: 1, at: 100, weakest: 'risk' });
  const { container } = render(<BankInterviewCard />);
  const res = container.querySelector('[data-interview-result="passed"]')!;
  expect(res.textContent).toContain('Interview passed: 79/100.');
  expect(container.querySelector('[data-question]')).toBeNull();
});

it('shows a failed score and the weakest answer above the questions', () => {
  view = withInterview({ score: 41, month: 1, at: 100, weakest: 'aml' });
  const { container } = render(<BankInterviewCard />);
  const res = container.querySelector('[data-interview-result="failed"]')!;
  expect(res.textContent).toContain('41/100');
  expect(res.textContent).toContain('Question on aml?');
  expect(container.querySelectorAll('[data-question]').length).toBe(4);
});

it('shows only the questions before any interview', () => {
  view = withInterview(null);
  const { container } = render(<BankInterviewCard />);
  expect(container.querySelector('[data-interview-result]')).toBeNull();
  expect(container.querySelectorAll('[data-question]').length).toBe(4);
});
