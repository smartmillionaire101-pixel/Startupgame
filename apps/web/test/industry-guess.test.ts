import { describe, expect, it } from 'vitest';
import { industryFromIdea } from '../src/screens/industryGuess';

describe('the industry an idea sounds like', () => {
  it('reads health, logistics and the others from the idea (player feedback)', () => {
    expect(industryFromIdea('Mmna — Health tech providing access to quality care')).toBe(
      'healthtech',
    );
    expect(industryFromIdea('Telemedicine for clinics')).toBe('healthtech');
    expect(industryFromIdea('Health insurance claims in one app')).toBe('healthtech');
    expect(industryFromIdea('Deliveries and parcel tracking for shops')).toBe('logistics');
    expect(industryFromIdea('Payments for market traders')).toBe('fintech');
    expect(industryFromIdea('A phone ledger for market traders')).toBe('fintech');
    expect(industryFromIdea('Lessons for students before their exams')).toBe('edtech');
    expect(industryFromIdea('Better prices for cassava farmers')).toBe('agritech');
    expect(industryFromIdea('An online shop for fashion brands')).toBe('ecommerce');
    expect(industryFromIdea('Payroll software for small firms')).toBe('saas');
    expect(industryFromIdea('Des soins à domicile pour les familles')).toBe('healthtech');
  });

  it('suggests nothing when the idea says nothing', () => {
    expect(industryFromIdea('')).toBeNull();
    expect(industryFromIdea('Tee times for golf clubs')).toBeNull();
  });
});
