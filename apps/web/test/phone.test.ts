import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import { inboxTarget, tabsFor } from '../src/phone/navigate';
import { aiCharacterId } from '../src/phone/bus';

const view = (
  role: string,
  companies: { id: string; status: string }[] = [],
  deals = [] as unknown[],
) =>
  ({ me: { role }, companies, deals }) as unknown as Pick<PlayerView, 'me' | 'companies' | 'deals'>;

describe('the phone: where alerts take you', () => {
  const founder = view(
    'founder',
    [{ id: 'c1', status: 'active' }],
    [{ id: 'd1', counterparty: { kind: 'fund', id: 'f1' } }],
  );
  const investor = view('investor');
  const banker = view('banker', [], [{ id: 'd2', counterparty: { kind: 'playerbank', id: 'b1' } }]);

  it('has the right tabs per role', () => {
    expect(tabsFor(founder)).toContain('money');
    expect(tabsFor(investor)).toContain('deals');
    expect(tabsFor(banker)).toContain('bank');
  });

  it('opens deal cards on the deals screen for each role', () => {
    expect(
      inboxTarget({ kind: 'deal', text: 'x', ref: { kind: 'deal', id: 'd1' } }, founder),
    ).toEqual({ kind: 'tab', tab: 'money', dealId: 'd1' });
    expect(
      inboxTarget({ kind: 'deal', text: 'x', ref: { kind: 'deal', id: 'd2' } }, banker),
    ).toEqual({
      kind: 'tab',
      tab: 'bank',
      dealId: 'd2',
    });
    expect(inboxTarget({ kind: 'pitch', text: 'x' }, investor)).toMatchObject({ tab: 'deals' });
  });

  it('sends companies, events, businesses and news to the right place', () => {
    const c = { kind: 'warning', text: 'x', ref: { kind: 'company', id: 'c1' } };
    expect(inboxTarget(c, founder)).toEqual({ kind: 'tab', tab: 'company' });
    expect(inboxTarget({ ...c, ref: { kind: 'company', id: 'other' } }, investor)).toEqual({
      kind: 'tab',
      tab: 'deals',
    });
    expect(
      inboxTarget({ kind: 'system', text: 'x', ref: { kind: 'event', id: 'e1' } }, founder),
    ).toEqual({
      kind: 'place',
      place: 'eventhall',
    });
    expect(
      inboxTarget({ kind: 'system', text: 'x', ref: { kind: 'business', id: 'b9' } }, founder),
    ).toEqual({ kind: 'place', place: 'biz:b9' });
    expect(
      inboxTarget({ kind: 'system', text: 'x', ref: { kind: 'accelerator', id: 'a1' } }, founder),
    ).toEqual({ kind: 'place', place: 'acc:a1' });
    expect(inboxTarget({ kind: 'reporter', text: 'x' }, founder)).toEqual({
      kind: 'tab',
      tab: 'news',
    });
    expect(inboxTarget({ kind: 'system', text: 'Your loan was approved' }, banker)).toEqual({
      kind: 'tab',
      tab: 'bank',
    });
    expect(inboxTarget({ kind: 'system', text: 'Welcome' }, founder)).toEqual({
      kind: 'tab',
      tab: 'home',
    });
  });

  it('names AI characters for chat', () => {
    expect(aiCharacterId({ kind: 'partner', ref: 'f1' })).toBe('fund:f1');
    expect(aiCharacterId({ kind: 'owner', ref: 'b1' })).toBe('biz:b1');
    expect(aiCharacterId({ kind: 'angel', ref: 'p1' })).toBe('p1');
    expect(aiCharacterId({ kind: 'shopper', ref: 's' })).toBeNull();
  });
});
