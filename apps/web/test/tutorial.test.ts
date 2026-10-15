import { describe, expect, it } from 'vitest';
import { stepFor, type TutorialFacts } from '../src/tutorial/steps';
import { tutorialApps } from '../src/tutorial/state';

const none: TutorialFacts = {
  company: null,
  founded: false,
  sold: false,
  paid: false,
  expensed: false,
};

describe('first-session tutorial steps (Founder Journey 6)', () => {
  it('moves on only when the game says the step happened', () => {
    expect(stepFor({ step: 'phone' }, none)).toBe('phone');
    expect(stepFor({ step: 'phone', seen: ['bank'] }, none)).toBe('idea');
    expect(stepFor({ step: 'idea' }, none)).toBe('idea');
    expect(stepFor({ step: 'idea' }, { ...none, founded: true })).toBe('sale');
    expect(stepFor({ step: 'sale' }, { ...none, founded: true })).toBe('sale');
    expect(stepFor({ step: 'sale' }, { ...none, founded: true, sold: true })).toBe('payment');
    expect(stepFor({ step: 'sale', noSale: true }, { ...none, founded: true })).toBe('payment');
    expect(
      stepFor({ step: 'payment' }, { ...none, founded: true, sold: true, expensed: true }),
    ).toBe('end');
  });

  it('catches up when a founder did things another way (a company from the Me tab)', () => {
    expect(stepFor({ step: 'phone' }, { ...none, founded: true })).toBe('sale');
  });

  it('shows one new system at a time, and every app with no tutorial', () => {
    expect(tutorialApps('phone')!.has('bank')).toBe(true);
    expect(tutorialApps('phone')!.has('sales')).toBe(false);
    expect(tutorialApps('phone')!.has('invest')).toBe(false);
    expect(tutorialApps('sale')!.has('sales')).toBe(true);
    expect(tutorialApps(null)).toBeNull();
  });
});
