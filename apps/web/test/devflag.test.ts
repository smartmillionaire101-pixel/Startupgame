import { describe, expect, it } from 'vitest';
import { readDevFlag } from '../src/devflag';

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('dev tools flag', () => {
  it('is off without ?dev=1', () => {
    expect(readDevFlag('', memory())).toBe(false);
    expect(readDevFlag('?dev=yes', memory())).toBe(false);
  });

  it('?dev=1 turns it on for the session, ?dev=0 turns it off', () => {
    const s = memory();
    expect(readDevFlag('?dev=1', s)).toBe(true);
    // Later page loads in the same tab, without the query.
    expect(readDevFlag('', s)).toBe(true);
    expect(readDevFlag('?dev=0', s)).toBe(false);
    expect(readDevFlag('', s)).toBe(false);
  });

  it('works without storage', () => {
    expect(readDevFlag('?dev=1', null)).toBe(true);
  });
});
