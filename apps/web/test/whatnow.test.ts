import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import { officeOf } from '../src/city/contract';
import { buildLayout, type CityInput } from '../src/city/layout';
import { PLANS } from '../src/city/plans';
import { dayPartOf, dayPlanFor, suggestionsFor, type Suggestion } from '../src/city/whatnow';

/**
 * "What to do now" by time of day (player feedback: "What to do is always
 * clubbing; it should be a proper experience and based on time of day").
 */

const item = (id: string, label: string, over: Record<string, unknown> = {}) => ({
  id,
  label,
  price: 2000,
  fun: 5,
  meetChance: 0.2,
  activity: true,
  ...over,
});

const biz = (id: string, kind: string, items: unknown[], shape = 'shopfront') => ({
  id,
  name: `${kind} ${id}`,
  kind,
  kindLabel: kind,
  category: 'food',
  district: 'yaba',
  owner: { name: `Owner ${id}` },
  look: { shape, color: '#f00', awning: null },
  open: true,
  venue: { items },
  gigs: [{ id: 'shift', label: 'Shift', hours: 8, pay: 5000, skillMatch: false }],
  buys: [],
  you: { customer: false, canPitch: false, reason: null },
});

/** A city with somewhere for every part of the day. */
const CITY = [
  biz(
    'cafe1',
    'cafe',
    [item('coffee', 'Coffee and akara', { energy: 10, activity: false })],
    'restaurant',
  ),
  biz(
    'cafe2',
    'coffee-shop',
    [item('toast', 'Toast', { energy: 8, activity: false })],
    'restaurant',
  ),
  biz(
    'rest1',
    'restaurant',
    [item('jollof', 'Jollof rice', { energy: 15, activity: false })],
    'restaurant',
  ),
  biz('rest2', 'buka', [item('amala', 'Amala', { energy: 12, activity: false })], 'restaurant'),
  biz('gym1', 'gym', [item('class', 'A spin class')]),
  biz('cine1', 'cinema', [item('film', 'A film')]),
  biz('bar1', 'rooftop-bar', [item('cocktail', 'Cocktails')]),
  biz('club1', 'nightclub', [item('dance', 'Dance', { fun: 9 })]),
  biz('club2', 'karaoke', [item('sing', 'Sing', { fun: 8 })]),
  biz('club3', 'live-music', [item('gig', 'A live set', { fun: 8 })]),
  biz('spa1', 'spa', [item('massage', 'A massage')]),
];

const view = (
  me: Record<string, unknown> = {},
  over: Record<string, unknown> = {},
  pocket = 1_000_000,
): PlayerView =>
  ({
    market: {
      id: 'lagos',
      name: 'Lagos',
      month: 3,
      costOfLiving: 100_000,
      bankName: 'Marina Bank',
      banks: [],
      funds: [],
      talent: [],
      segments: [],
      businesses: CITY,
    },
    companies: [],
    accounts: { local: { balance: pocket } },
    players: [],
    directory: [],
    bank: null,
    me: {
      id: 'me',
      role: 'founder',
      energy: 80,
      hours: { left: 100 },
      lifestyle: { tier: 2 },
      ...me,
    },
    ...over,
  }) as unknown as PlayerView;

const kinds = (s: Suggestion[]) => s.map((x) => x.kind);

describe('What to do now: the time of day', () => {
  it('splits the day into morning, day, evening and night', () => {
    expect([5, 6, 9.9, 10, 16.9, 17, 20.9, 21, 23, 0].map(dayPartOf)).toEqual([
      'night',
      'morning',
      'morning',
      'day',
      'day',
      'evening',
      'evening',
      'night',
      'night',
      'night',
    ]);
  });

  it('suggests breakfast, a workout or cooking in the morning, never a club', () => {
    const s = suggestionsFor(view(), 3, 8);
    expect(s[0]).toMatchObject({ kind: 'breakfast' });
    expect(['cafe1', 'cafe2'].map((id) => `biz:${id}`)).toContain(s[0]!.placeId);
    expect(kinds(s)).toEqual(expect.arrayContaining(['gym']));
    expect(kinds(s)).not.toContain('fun');
  });

  it('suggests work and lunch in the day, and the mall or golf', () => {
    const s = suggestionsFor(
      view(
        { role: 'banker' },
        {
          banker: {
            centralBank: 'lagos:central-bank',
            bank: { status: 'applying', licence: { missing: ['interview'] } },
          },
        },
      ),
      4,
      13,
    );
    expect(s[0]).toMatchObject({
      kind: 'work',
      detail: 'central-bank',
      placeId: 'civic:lagos:central-bank',
    });
    expect(kinds(s)).toEqual(['work', 'lunch', 'mall', 'golf']);
  });

  it('suggests dinner, a film, drinks or the sunset in the evening', () => {
    const s = suggestionsFor(view(), 4, 19);
    expect(kinds(s)).toEqual(['dinner', 'cinema', 'drinks', 'sky']);
    expect(s.find((x) => x.kind === 'sky')!.placeId).toMatch(/^sky:/);
  });

  it('suggests a night out or bed at night', () => {
    const s = suggestionsFor(view(), 2, 23);
    expect(s[0]).toMatchObject({ kind: 'fun', night: true });
    expect(['biz:club1', 'biz:club2', 'biz:club3']).toContain(s[0]!.placeId);
    expect(s[1]).toMatchObject({ kind: 'sleep', placeId: 'home' });
  });

  it('shows a pick for each part of the day', () => {
    const plan = dayPlanFor(view({ energy: 10 }));
    expect(plan.morning?.kind).toBe('breakfast');
    expect(plan.day?.kind).toBe('lunch');
    expect(plan.evening?.kind).toBe('dinner');
    expect(plan.night?.kind).toBe('fun');
  });
});

describe('What to do now: role', () => {
  it('sends a founder to the office in the morning and to leads in the day', () => {
    const founder = view(
      {},
      {
        companies: [{ id: 'c1', name: 'Oja', status: 'active', industry: 'fintech', teamSize: 2 }],
      },
    );
    expect(suggestionsFor(founder, 3, 8).find((x) => x.kind === 'work')).toMatchObject({
      placeId: 'office',
      name: 'Oja',
      detail: 'office',
    });
    expect(kinds(suggestionsFor(founder, 3, 13))).toContain('customers');
  });

  it('sends a licensed banker to their own bank, and an investor to deal flow', () => {
    const banker = view(
      { role: 'banker' },
      {
        bank: { id: 'bk1', status: 'licensed' },
        market: { ...view().market, banks: [{ id: 'bk1', name: 'Thames Trust' }] },
        banker: { centralBank: 'lagos:central-bank', bank: null },
      },
    );
    // Still negotiating with the shareholders: nothing to do at the Central Bank yet.
    const forming = view(
      { role: 'banker' },
      { banker: { centralBank: 'lagos:central-bank', bank: { status: 'forming' } } },
    );
    expect(kinds(suggestionsFor(forming, 4, 13))).not.toContain('work');
    expect(suggestionsFor(banker, 1, 13)[0]).toMatchObject({
      kind: 'work',
      placeId: 'playerbank:bk1',
      name: 'Thames Trust',
    });
    expect(suggestionsFor(view({ role: 'investor' }), 1, 13)[0]).toMatchObject({
      kind: 'work',
      detail: 'deals',
      placeId: 'hub',
    });
  });
});

describe('What to do now: life bars', () => {
  it('puts sleep first when exhausted or tired at night, eating when tired in the day', () => {
    expect(suggestionsFor(view({ energy: 10 }), 3, 13)[0]!.kind).toBe('sleep');
    expect(suggestionsFor(view({ energy: 35 }), 3, 22)[0]!.kind).toBe('sleep');
    const day = suggestionsFor(view({ energy: 35 }), 3, 13);
    expect(day[0]).toMatchObject({ kind: 'eat', placeId: 'biz:rest1' });
  });

  it('suggests something calm when stressed: a spa, golf or a view', () => {
    const s = suggestionsFor(
      view({ bars: { energy: 80, health: 70, happiness: 60, stress: 80 } }),
      3,
      13,
    );
    expect(['spa', 'golf', 'sky']).toContain(s[0]!.kind);
    const calm = [0, 1, 2].map(
      (seed) =>
        suggestionsFor(
          view({ bars: { energy: 80, health: 70, happiness: 60, stress: 80 } }),
          1,
          13,
          {
            seed,
          },
        )[0]!.kind,
    );
    expect(new Set(calm)).toEqual(new Set(['spa', 'golf', 'sky']));
  });
});

describe('What to do now: variety and real places', () => {
  it('doesn’t repeat the place you just went to', () => {
    const first = suggestionsFor(view(), 1, 23)[0]!;
    const next = suggestionsFor(view(), 1, 23, { recent: [first.placeId] })[0]!;
    expect(next.kind).toBe('fun');
    expect(next.placeId).not.toBe(first.placeId);
    // And the hour turns the choice by itself.
    const bySeed = new Set(
      [0, 1, 2].map((seed) => suggestionsFor(view(), 1, 23, { seed })[0]!.placeId),
    );
    expect(bySeed.size).toBe(3);
  });

  it('never lists the same place twice', () => {
    for (const hour of [7, 13, 19, 23]) {
      const s = suggestionsFor(view({ energy: 30 }), 8, hour);
      expect(new Set(s.map((x) => x.placeId)).size, String(hour)).toBe(s.length);
    }
  });

  it('only suggests places the city has', () => {
    const none = () => false;
    for (const hour of [7, 13, 19, 23]) {
      const s = suggestionsFor(view({ energy: 10 }), 8, hour, { has: none });
      expect(kinds(s), String(hour)).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^(mall|golf|sleep|cook)$/)]),
      );
    }
    // Every planned city has the golf course, the mall, a home, the Hub and an office.
    for (const m of Object.keys(PLANS)) {
      const input = {
        marketId: m,
        lenders: [],
        playerBanks: [],
        funds: [{ id: 'f', name: 'F', office: officeOf({ id: 'f' }) }],
        segments: [{ key: 's', name: 'S', industry: 'x' }],
        industry: null,
        office: null,
        homeTier: 1,
      } as unknown as CityInput;
      const ids = new Set(buildLayout(input).places.map((p) => p.id));
      for (const id of ['golf', 'mall', 'home', 'hub', 'office', 'eventhall'])
        expect(ids.has(id), `${m} ${id}`).toBe(true);
    }
  });

  it('leaves out going out when you’re broke', () => {
    const s = suggestionsFor(view({}, {}, 10), 4, 19);
    expect(kinds(s)).not.toEqual(expect.arrayContaining(['dinner', 'cinema', 'drinks', 'fun']));
  });
});
