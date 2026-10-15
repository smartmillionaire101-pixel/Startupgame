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
    ).toEqual({ kind: 'phone', open: { app: 'events' } });
    expect(
      inboxTarget({ kind: 'system', text: 'x', ref: { kind: 'business', id: 'b9' } }, founder),
    ).toEqual({ kind: 'place', place: 'biz:b9' });
    expect(
      inboxTarget({ kind: 'system', text: 'x', ref: { kind: 'accelerator', id: 'a1' } }, founder),
    ).toEqual({ kind: 'place', place: 'cap:a1' });
    expect(inboxTarget({ kind: 'reporter', text: 'x' }, founder)).toEqual({
      kind: 'tab',
      tab: 'news',
    });
    expect(inboxTarget({ kind: 'system', text: 'Your loan was approved' }, banker)).toEqual({
      kind: 'tab',
      tab: 'bank',
    });
    // Nowhere useful to go: not tappable.
    expect(inboxTarget({ kind: 'system', text: 'Welcome' }, founder)).toBeNull();
  });

  it('gives every kind of notification a place to act', () => {
    const f = {
      ...founder,
      journey: {},
      market: { accelerators: [{ id: 'acc1', name: 'Launchpad Lagos' }] },
    } as typeof founder;
    // A payment: its receipt; the sender's chat when there is no receipt.
    expect(
      inboxTarget(
        {
          kind: 'system',
          text: 'Ada sent you ₦5,000.',
          ref: { kind: 'player', id: 'p2' },
          from: 'p2',
          receipt: 'tx9',
        },
        f,
      ),
    ).toEqual({ kind: 'phone', open: { receipt: 'tx9' } });
    expect(
      inboxTarget({ kind: 'system', text: 'x', ref: { kind: 'gift', id: 'g1' }, from: 'p2' }, f),
    ).toEqual({ kind: 'phone', open: { player: 'p2' } });
    // A deal card.
    expect(
      inboxTarget({ kind: 'deal', text: 'New deal card', ref: { kind: 'deal', id: 'd1' } }, f),
    ).toEqual({ kind: 'tab', tab: 'money', dealId: 'd1' });
    // Hiring and staff: the Team tab.
    const co = { kind: 'company', id: 'c1' };
    expect(inboxTarget({ kind: 'staff', text: 'Bo took another job.', ref: co }, f)).toEqual({
      kind: 'tab',
      tab: 'company',
      section: 'team',
    });
    expect(
      inboxTarget({ kind: 'deal', text: 'x', ref: { kind: 'candidate', id: 'k' } }, f),
    ).toEqual({ kind: 'tab', tab: 'company', section: 'team' });
    // Board votes.
    expect(inboxTarget({ kind: 'deal', text: 'Vote needed at Co: sell', ref: co }, f)).toEqual({
      kind: 'tab',
      tab: 'company',
      section: 'board',
    });
    // Sales: the pipeline.
    expect(
      inboxTarget({ kind: 'warning', text: 'Mama Put went cold: the deal ran out of time.' }, f),
    ).toEqual({
      kind: 'phone',
      open: { app: 'sales' },
    });
    expect(inboxTarget({ kind: 'lead', text: 'First customer: a buyer signed up.' }, f)).toEqual({
      kind: 'tab',
      tab: 'company',
      section: 'customers',
    });
    // Friends & Family: Money for the founder.
    expect(
      inboxTarget(
        { kind: 'deal', text: 'Ada committed to your Friends & Family round for Co.' },
        f,
      ),
    ).toEqual({ kind: 'tab', tab: 'money' });
    // An accelerator named in the note: walk to its office.
    expect(inboxTarget({ kind: 'deal', text: 'Launchpad Lagos took you in.', ref: co }, f)).toEqual(
      { kind: 'place', place: 'cap:acc1' },
    );
    // Competitions, events, visits: the Events app.
    expect(
      inboxTarget({ kind: 'milestone', text: 'Co won Pitch Night (8/10) and ₦1m.', ref: co }, f),
    ).toEqual({ kind: 'phone', open: { app: 'events' } });
    expect(inboxTarget({ kind: 'meeting', text: 'x', ref: { kind: 'visit', id: 'v' } }, f)).toEqual(
      {
        kind: 'phone',
        open: { app: 'events' },
      },
    );
    // Homes, chapters, the recap.
    expect(
      inboxTarget({ kind: 'warning', text: 'You missed a mortgage payment on your flat.' }, f),
    ).toEqual({
      kind: 'phone',
      open: { app: 'homes' },
    });
    expect(
      inboxTarget(
        { kind: 'milestone', text: 'Chapter 1 complete: The Hustle. Next: The First Team.' },
        f,
      ),
    ).toEqual({ kind: 'phone', open: { app: 'journey' } });
    expect(inboxTarget({ kind: 'milestone', text: 'Milestone: First hire' }, f)).toEqual({
      kind: 'phone',
      open: { app: 'journey' },
    });
    expect(inboxTarget({ kind: 'system', text: 'Your month in review is ready.' }, f)).toEqual({
      kind: 'recap',
    });
    // Distress: the office, where the rescue plan is.
    expect(
      inboxTarget({ kind: 'warning', text: 'Co is in distress: 2 months left.', ref: co }, f),
    ).toEqual({ kind: 'place', place: 'office' });
    // Stories: the news.
    expect(
      inboxTarget({ kind: 'reporter', text: 'x', ref: { kind: 'media', id: 'm' } }, f),
    ).toEqual({ kind: 'tab', tab: 'news' });
  });

  it('names AI characters for chat', () => {
    expect(aiCharacterId({ kind: 'partner', ref: 'f1' })).toBe('fund:f1');
    expect(aiCharacterId({ kind: 'owner', ref: 'b1' })).toBe('biz:b1');
    expect(aiCharacterId({ kind: 'angel', ref: 'p1' })).toBe('p1');
    expect(aiCharacterId({ kind: 'shopper', ref: 's' })).toBeNull();
  });
});
