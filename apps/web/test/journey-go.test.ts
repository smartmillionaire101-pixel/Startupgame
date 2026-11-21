import { describe, expect, it } from 'vitest';
import { awayFromHere } from '../src/city/journeyGo';

describe('awayFromHere (a journey step from inside a place)', () => {
  const hub = { id: 'hub', kind: 'hub' };

  it('turns a step at the place you are in into its Company section', () => {
    expect(awayFromHere({ kind: 'place', place: 'hub' }, hub, 'team')).toEqual({
      kind: 'tab',
      tab: 'company',
      section: 'team',
    });
    expect(awayFromHere({ kind: 'place', place: 'hub' }, hub)).toEqual({
      kind: 'tab',
      tab: 'company',
    });
  });

  it('keeps every other step as it is', () => {
    const market = { kind: 'place', place: 'market' } as const;
    expect(awayFromHere(market, hub)).toBe(market);
    const tab = { kind: 'tab', tab: 'company' } as const;
    expect(awayFromHere(tab, hub)).toBe(tab);
    const app = { kind: 'app', app: 'sales' } as const;
    expect(awayFromHere(app, hub)).toBe(app);
    expect(awayFromHere({ kind: 'place', place: 'hub' }, null)).toEqual({
      kind: 'place',
      place: 'hub',
    });
  });
});
