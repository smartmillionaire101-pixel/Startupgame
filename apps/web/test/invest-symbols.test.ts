import { expect, it } from 'vitest';
import { symbolsOf } from '../src/phone/apps/Invest';

/** Play-test #33: the Invest app's ticker showed YABA and IKEJ twice. */
it('gives every listed company its own symbol', () => {
  const names = [
    'Yaba Bank Plc',
    'Ikeja Retail Plc',
    'Yaba Insurance Plc',
    'Ikeja Schools Plc',
    'Eko Haulage Plc',
    'Eko Foods Plc',
    'VelaStack',
  ];
  const syms = symbolsOf(names);
  expect(new Set(syms).size).toBe(names.length);
  expect(syms[0]).toBe('YABA');
  expect(syms[6]).toBe('VELA');
  for (const s of syms) expect(s).toMatch(/^[A-Z0-9]{2,4}$/);
});
