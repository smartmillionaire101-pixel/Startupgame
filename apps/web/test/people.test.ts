import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import { cityInput, officeOf } from '../src/city/contract';
import { buildLayout, type CityInput } from '../src/city/layout';
import {
  contactChat,
  contactsOf,
  crowdSize,
  eventKindsOf,
  eventsOf,
  flaggedPlaces,
  newBusinessIds,
  normPresence,
  passersBy,
  peopleField,
  personAt,
  playersByPlace,
  savedContact,
} from '../src/city/people';

const cityIn = (marketId = 'lagos'): CityInput => ({
  marketId,
  lenders: [
    { id: 'l1', name: 'Marina Bank', look: { color: '#123', accent: '#fff', motif: 'columns' } },
  ],
  playerBanks: [],
  funds: Array.from({ length: 6 }, (_, i) => ({
    id: `f${i}`,
    name: `Fund ${i}`,
    office: officeOf({ id: `f${i}` }),
  })),
  segments: Array.from({ length: 12 }, (_, i) => ({
    key: `s${i}`,
    name: `Segment ${i}`,
    industry: 'fintech',
  })),
  industry: 'fintech',
  office: { headcount: 2, siren: false },
  homeTier: 2,
});

describe('passers-by (Wave 6: nobody to tap on the street)', () => {
  const layout = buildLayout(cityIn());

  it('are deterministic for a city, and differ between cities', () => {
    expect(passersBy(layout, 6)).toEqual(passersBy(buildLayout(cityIn()), 6));
    const other = passersBy(buildLayout(cityIn('nairobi')), 6);
    expect(other.map((p) => p.route)).not.toEqual(passersBy(layout, 6).map((p) => p.route));
  });

  it('are a few anonymous people: no names, no characters to talk to', () => {
    for (const max of [0, 4, 7, 10]) {
      const cast = passersBy(layout, max);
      expect(cast.length).toBeLessThanOrEqual(max);
      expect(new Set(cast.map((p) => p.id)).size).toBe(cast.length);
      for (const w of cast) {
        expect(w.id).toMatch(/^walker:/);
        expect(w).not.toHaveProperty('name');
      }
    }
    expect(crowdSize(375)).toBeLessThanOrEqual(4);
    expect(crowdSize(375)).toBeLessThan(crowdSize(1280));
  });

  it('loop the pavement inside the city, where the clock says', () => {
    for (const p of passersBy(layout, 10)) {
      expect(p.route[0]).toEqual(p.route[p.route.length - 1]);
      for (const q of p.route) {
        expect(q.x).toBeGreaterThanOrEqual(0);
        expect(q.y).toBeGreaterThanOrEqual(0);
        expect(q.x).toBeLessThanOrEqual(layout.extent);
        expect(q.y).toBeLessThanOrEqual(layout.extent);
      }
      expect(p.period).toBeGreaterThan(1000);
    }
    const [p] = passersBy(layout, 4);
    const t = 1_700_000_000_000;
    expect(personAt(p!, t)).toEqual(personAt(p!, t));
    expect(personAt(p!, t + p!.period)).toEqual(personAt(p!, t));
    const atStart = personAt({ ...p!, phase: 0 }, 0);
    expect(atStart.walking).toBe(false);
    expect(atStart.at).toEqual(p!.route[0]);
  });
});

describe('Wave 6 adapters', () => {
  const v = (market: Record<string, unknown>, me: Record<string, unknown> = {}, players = []) =>
    ({ market, me, players }) as unknown as PlayerView;

  it('read businesses[].people, or say the engine has none yet', () => {
    const view = v(
      {
        businesses: [
          {
            id: 'b1',
            name: 'Mama Put',
            isNew: true,
            people: [
              { id: 'biz:b1', name: 'Ada', kind: 'owner', role: 'Owner', gender: 'female' },
              { id: 'npc:lagos:3', name: 'Tunde', kind: 'regular', role: 'Taxi driver' },
              { id: 'p9', name: 'Kemi', kind: 'staff', role: 'Bartender', playerId: 'p9' },
              { id: 'x', kind: 'alien' },
              { name: 'no id' },
            ],
          },
          { id: 'b2', name: 'Old Shop' },
          { id: 'b3', name: 'Shut', isNew: true, open: false },
        ],
      },
      {},
      [{ id: 'p9', name: 'Kemi', ai: false }] as never,
    );
    const ps = peopleField(view, 'b1')!;
    expect(ps.map((p) => p.id)).toEqual(['biz:b1', 'npc:lagos:3', 'p9', 'x']);
    expect(ps[0]).toMatchObject({ kind: 'owner', gender: 'female', human: false });
    expect(ps[2]).toMatchObject({ kind: 'staff', playerId: 'p9', human: true });
    expect(ps[3]!.kind).toBe('regular');
    expect(peopleField(view, 'b2')).toBeNull();
    expect(peopleField(view, 'nope')).toBeNull();
    expect(newBusinessIds(view)).toEqual(['b1']);
    expect(newBusinessIds(v({}))).toEqual([]);
  });

  it('count players by the building they are in', () => {
    const ps = normPresence({
      players: [
        { id: 'a', x: 1, y: 1, place: 'hub' },
        { id: 'b', x: 1, y: 1, place: 'hub' },
        { id: 'c', x: 1, y: 1, place: 'biz:b1' },
        { id: 'd', x: 1, y: 1, place: null },
      ],
    });
    expect(Object.fromEntries(playersByPlace(ps))).toEqual({ hub: 2, 'biz:b1': 1 });
  });

  it('read saved contacts with their chat id, and find the chat for each kind', () => {
    const view = v(
      {},
      {
        contacts: [
          { id: 'c1', kind: 'local', refId: 'npc:lagos:3', chatId: 'npc:lagos:3', name: 'Tunde' },
          { id: 'c2', kind: 'fund', refId: 'f1', name: 'Pat, Fund', month: 2 },
          { id: 'c3', kind: 'player', refId: 'p9', chatId: 'p9', name: 'Kemi', month: 3 },
          { id: 'c4', kind: 'founder', refId: 'ai1', chatId: 'ai1', name: 'Bot', month: 1 },
          { id: 'c5', kind: 'talent', refId: 't1', name: 'Job seeker' },
        ],
      },
      [{ id: 'p9', name: 'Kemi' }] as never,
    );
    const cs = contactsOf(view);
    const by = (id: string) => cs.find((c) => c.id === id)!;
    expect(by('c1')).toMatchObject({ kind: 'local', chatId: 'npc:lagos:3' });
    expect(by('c2').chatId).toBeNull();
    expect(contactChat(by('c1'), view)).toEqual({ ai: 'npc:lagos:3' });
    expect(contactChat(by('c2'), view)).toEqual({ ai: 'fund:f1' });
    expect(contactChat(by('c3'), view)).toEqual({ player: 'p9' });
    expect(contactChat(by('c4'), view)).toEqual({ ai: 'ai1' });
    expect(contactChat(by('c5'), view)).toBeNull();
    expect(savedContact(cs, 'npc:lagos:3')?.id).toBe('c1');
    expect(savedContact(cs, 'fund:f1')?.id).toBe('c2');
    expect(savedContact(cs, 'biz:zz')).toBeNull();
  });
});

describe('Wave 2 adapters', () => {
  it('normalise presence and drop bad rows and yourself', () => {
    const out = normPresence(
      {
        players: [
          {
            id: 'a',
            name: 'Ada',
            x: 4,
            y: 2.5,
            place: 'hub',
            stars: 2,
            backgroundId: 'f-engineer',
          },
          { id: 'me', name: 'Me', x: 1, y: 1 },
          { id: 'b', name: 'Bad', x: 'nope', y: 1 },
          { id: 'c', name: 'Inf', x: Infinity, y: 1 },
          null,
        ],
      },
      'me',
    );
    expect(out.map((p) => p.id)).toEqual(['a']);
    expect(out[0]).toMatchObject({ place: 'hub', company: null, role: 'founder' });
    expect(normPresence({})).toEqual([]);
    expect(normPresence(null)).toEqual([]);
  });

  const v = (market: Record<string, unknown>, me: Record<string, unknown> = {}) =>
    ({ market, me }) as unknown as PlayerView;

  it('fall back when the engine sends no events or contacts', () => {
    expect(eventsOf(v({}))).toBeNull();
    expect(eventKindsOf(v({}))).toBeNull();
    expect(contactsOf(v({}))).toEqual([]);
    expect(flaggedPlaces(null)).toEqual([]);
  });

  it('read events, kinds and contacts when present', () => {
    const events = eventsOf(
      v({
        events: [
          { id: 'e1', kind: 'demo-day', title: 'Demo', venue: 'hub', status: 'upcoming' },
          { id: 'e2', venue: 'office', youHost: true, status: 'upcoming' },
          {
            id: 'e3',
            venue: 'hall',
            status: 'held',
            outcome: { summary: 'Full room', contacts: 3 },
          },
          { id: 'e4', venue: 'office', status: 'upcoming' },
          { nope: true },
        ],
      }),
    )!;
    expect(events.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(events[2]!.outcome).toEqual({ summary: 'Full room', contacts: 3 });
    // Bunting: the hub (upcoming), your office (you host); not a held hall or another's office.
    expect(flaggedPlaces(events)).toEqual(['hub', 'office']);

    const kinds = eventKindsOf(
      v({ eventKinds: [{ kind: 'founder-meetup', label: 'Meetup', cost: 500, capacity: [5, 9] }] }),
    )!;
    expect(kinds[0]).toMatchObject({ kind: 'founder-meetup', cost: 500, capacity: [5, 9] });

    const contacts = contactsOf(
      v(
        {},
        {
          contacts: [
            { id: 'fund:f1', kind: 'fund', refId: 'f1', name: 'Old', warmth: 2, month: 1 },
            { id: 'player:p', kind: 'player', refId: 'p', name: 'New', warmth: 0.5, month: 4 },
          ],
        },
      ),
    );
    expect(contacts.map((c) => c.name)).toEqual(['New', 'Old']);
    expect(contacts[1]!.warmth).toBe(1);
  });

  it('opens the Event Hall once the engine sends events', () => {
    const base = {
      market: {
        id: 'lagos',
        bankName: 'Bank',
        banks: [],
        funds: [],
        segments: [],
      },
      companies: [],
      me: { lifestyle: { tier: 2 } },
    };
    const hall = (view: unknown) =>
      buildLayout(cityInput(view as PlayerView)).places.find((p) => p.id === 'eventhall');
    expect(hall(base)?.soon).toBe(true);
    expect(hall({ ...base, market: { ...base.market, events: [] } })?.soon).toBe(false);
  });
});
