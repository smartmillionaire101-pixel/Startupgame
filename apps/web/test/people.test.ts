import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import { cityInput, officeOf } from '../src/city/contract';
import { buildLayout, type CityInput } from '../src/city/layout';
import {
  aiCharacters,
  contactsOf,
  crowdSize,
  eventKindsOf,
  eventsOf,
  flaggedPlaces,
  normPresence,
  personAt,
  type CrowdInput,
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

const crowdIn = (marketId = 'lagos'): CrowdInput => ({
  marketId,
  funds: Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, partner: `Partner ${i}` })),
  founders: Array.from({ length: 5 }, (_, i) => ({
    id: `ai-founder-${i}`,
    name: `Founder ${i}`,
    companyId: `c${i}`,
  })),
  candidates: Array.from({ length: 4 }, (_, i) => ({ id: `cand-${i}`, name: `Candidate ${i}` })),
  segments: Array.from({ length: 12 }, (_, i) => ({ key: `s${i}` })),
});

describe('ambient AI characters', () => {
  const layout = buildLayout(cityIn());

  it('are deterministic for a market', () => {
    const a = aiCharacters(layout, crowdIn(), 12);
    const b = aiCharacters(buildLayout(cityIn()), crowdIn(), 12);
    expect(a).toEqual(b);
    // Input order doesn't matter.
    const shuffled = { ...crowdIn(), funds: [...crowdIn().funds].reverse() };
    expect(aiCharacters(layout, shuffled, 12)).toEqual(a);
    // Another market casts differently.
    const other = aiCharacters(buildLayout(cityIn('nairobi')), crowdIn('nairobi'), 12);
    expect(other.map((p) => p.route)).not.toEqual(a.map((p) => p.route));
  });

  it('respect the density budget and include every kind', () => {
    for (const max of [0, 4, 9, 16]) {
      const cast = aiCharacters(layout, crowdIn(), max);
      expect(cast.length).toBeLessThanOrEqual(max);
      expect(new Set(cast.map((p) => p.id)).size).toBe(cast.length);
    }
    const kinds = new Set(aiCharacters(layout, crowdIn(), 9).map((p) => p.kind));
    expect([...kinds].sort()).toEqual(['candidate', 'founder', 'partner', 'shopper']);
    expect(crowdSize(375)).toBeLessThan(crowdSize(1280));
  });

  it('stay near their places on closed loops inside the city', () => {
    const cast = aiCharacters(layout, crowdIn(), 16);
    for (const p of cast) {
      const home = layout.places.find((x) => x.id === p.home)!;
      expect(home).toBeDefined();
      if (p.kind === 'partner') expect(home.kind).toBe('fund');
      if (p.kind === 'shopper') expect(home.kind).toBe('stall');
      if (p.kind === 'founder' || p.kind === 'candidate') expect(home.id).toBe('hub');
      expect(p.route[0]).toEqual(p.route[p.route.length - 1]);
      for (const q of p.route) {
        expect(q.x).toBeGreaterThanOrEqual(0);
        expect(q.y).toBeGreaterThanOrEqual(0);
        expect(q.x).toBeLessThanOrEqual(layout.extent);
        expect(q.y).toBeLessThanOrEqual(layout.extent);
        // Within a block or so of their door.
        expect(Math.abs(q.x - home.door.x) + Math.abs(q.y - home.door.y)).toBeLessThan(9);
      }
      expect(p.period).toBeGreaterThan(1000);
    }
  });

  it('are where the clock says, for everyone', () => {
    const [p] = aiCharacters(layout, crowdIn(), 4);
    const t = 1_700_000_000_000;
    expect(personAt(p!, t)).toEqual(personAt(p!, t));
    expect(personAt(p!, t + p!.period)).toEqual(personAt(p!, t));
    // Standing at the start during the dwell.
    const atStart = personAt({ ...p!, phase: 0 }, 0);
    expect(atStart.walking).toBe(false);
    expect(atStart.at).toEqual(p!.route[0]);
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
