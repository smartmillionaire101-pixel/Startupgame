import { describe, expect, it } from 'vitest';
import { MARKET_IDS } from '@runway/engine';
import {
  emailProblem,
  firstStep,
  guessCity,
  nextStep,
  prevStep,
  suggestUsername,
  USERNAME_RE,
} from '../src/signup/logic';
import { SKYLINES } from '../src/signup/cityArt';

describe('sign-up steps', () => {
  it('starts on the path, or on the look when a landing role card picked it', () => {
    expect(firstStep()).toBe('path');
    expect(firstStep(null)).toBe('path');
    expect(firstStep('banker')).toBe('look');
  });

  it('goes path → look → about, and back the same way', () => {
    expect(nextStep('path')).toBe('look');
    expect(nextStep('look')).toBe('about');
    expect(nextStep('about')).toBeNull();
    expect(prevStep('about')).toBe('look');
    expect(prevStep('look')).toBe('path');
    expect(prevStep('path')).toBeNull();
  });

  it('leaves from the look when the path step was skipped', () => {
    expect(prevStep('look', true)).toBeNull();
    expect(prevStep('about', true)).toBe('look');
  });
});

describe('suggestUsername', () => {
  it('makes a username from a name', () => {
    expect(suggestUsername('Ada Okafor')).toBe('ada_okafor');
    expect(suggestUsername('  Chloé  N’Diaye-Bâ ')).toBe('chloe_n_diaye_ba');
    expect(suggestUsername('Kofi')).toBe('kofi');
  });

  it('pads a short name and leaves an empty one empty', () => {
    expect(suggestUsername('Al')).toBe('al_player');
    expect(suggestUsername('')).toBe('');
    expect(suggestUsername('!!! ')).toBe('');
  });

  it('adds a number when the first is taken, keeping 20 characters', () => {
    expect(suggestUsername('Ada Okafor', 1)).toBe('ada_okafor2');
    expect(suggestUsername('Ada Okafor', 2)).toBe('ada_okafor3');
    const long = suggestUsername('Oluwaseun Adebayo-Williams', 1);
    expect(long.length).toBeLessThanOrEqual(20);
    expect(long.endsWith('2')).toBe(true);
  });

  it('always gives what the server accepts', () => {
    for (const name of ['Ada Okafor', 'Al', 'Oluwaseun Adebayo-Williams', 'Zoë', 'Jean Marc 3'])
      for (const n of [0, 1, 9]) expect(suggestUsername(name, n)).toMatch(USERNAME_RE);
  });
});

describe('emailProblem', () => {
  it('accepts what the server accepts', () => {
    for (const e of ['ada@gmail.com', ' ada.okafor+run@mail.co.uk ', 'A@B.CD'])
      expect(emailProblem(e)).toBeNull();
  });

  it('says what is missing', () => {
    expect(emailProblem('')).toBe('empty');
    expect(emailProblem('   ')).toBe('empty');
    expect(emailProblem('ada@gmail')).toBe('end');
    expect(emailProblem('ada@gmail.')).toBe('end');
    expect(emailProblem('ada@.com')).toBe('end');
    expect(emailProblem('ada.gmail.com')).toBe('at');
    expect(emailProblem('ada@@gmail.com')).toBe('at');
    expect(emailProblem('@gmail.com')).toBe('name');
    expect(emailProblem('ada@')).toBe('domain');
    expect(emailProblem('ada okafor@gmail.com')).toBe('spaces');
    expect(emailProblem('ada,o@gmail.com')).toBe('chars');
    expect(emailProblem(`${'a'.repeat(250)}@gmail.com`)).toBe('long');
  });
});

describe('guessCity', () => {
  const markets = [
    { id: 'lagos', timeZone: 'Africa/Lagos' },
    { id: 'nairobi', timeZone: 'Africa/Nairobi' },
    { id: 'london', timeZone: 'Europe/London' },
  ];
  it('picks the city in your time zone', () => {
    expect(guessCity(markets, 'Europe/London')).toBe('london');
    expect(guessCity(markets, 'Africa/Nairobi')).toBe('nairobi');
  });
  it('falls back to Lagos, then the first city', () => {
    expect(guessCity(markets, 'Asia/Tokyo')).toBe('lagos');
    expect(guessCity(markets, null)).toBe('lagos');
    expect(guessCity([{ id: 'london' }], 'UTC')).toBe('london');
    expect(guessCity([], 'UTC')).toBeNull();
  });
});

describe('city skylines', () => {
  it('every game city has its own skyline and landmark', () => {
    for (const id of MARKET_IDS) {
      expect(SKYLINES[id], id).toBeDefined();
      expect(SKYLINES[id]!.front, id).toBeTruthy();
    }
    const landmarks = MARKET_IDS.map((id) => SKYLINES[id]!.landmark);
    expect(new Set(landmarks).size).toBe(MARKET_IDS.length);
    const skies = MARKET_IDS.map((id) => SKYLINES[id]!.sky);
    expect(new Set(skies).size).toBe(MARKET_IDS.length);
  });
});
