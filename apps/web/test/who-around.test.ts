import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import type { CityLayout } from '../src/city/layout';
import type { PresenceView } from '../src/city/people';
import { peopleAt, whoIsAround } from '../src/city/WhoIsHere';

/**
 * Playtest round 7: real players listed in Who's here were missing from
 * People around. Both lists read the same people; players come first.
 */
const presence = (id: string, place: string | null): PresenceView => ({
  id,
  name: `Player ${id}`,
  handle: id,
  role: 'founder',
  backgroundId: 'f-engineer',
  stars: 0,
  company: null,
  x: 0,
  y: 0,
  place,
  seenAt: 0,
});

const view = {
  me: { id: 'me' },
  market: {
    id: 'lagos',
    month: 3,
    funds: [],
    businesses: [
      {
        id: 'b1',
        name: 'Mama Put',
        kind: 'restaurant',
        people: [
          { id: 'biz:b1', name: 'Ada', kind: 'owner', role: 'Owner' },
          // The engine names a real player in the building under its own id.
          { id: 'person:9', name: 'Player p9', kind: 'staff', role: 'Waiter', playerId: 'p9' },
          { id: 'f1', name: 'Kola', kind: 'founder', role: 'Founder', playerId: 'f1' },
        ],
      },
    ],
  },
  players: [
    { id: 'p9', name: 'Player p9', ai: false },
    { id: 'p7', name: 'Player p7', ai: false },
    { id: 'f1', name: 'Kola', ai: true },
  ],
  directory: [],
} as unknown as PlayerView;

const layout = {
  places: [{ id: 'biz:b1', kind: 'business', ref: 'b1', name: 'Mama Put', x: 0, y: 0 }],
} as unknown as CityLayout;

describe('People around and Who’s here list the same players', () => {
  it('lists every player Who’s here shows, plus players out and about, players first', () => {
    const players = [presence('p9', 'biz:b1'), presence('p7', null)];
    const here = peopleAt(view, layout.places[0]!, players.slice(0, 1), 20);
    const humansHere = here.filter((p) => p.human).map((p) => p.playerId ?? p.id);
    expect(humansHere).toEqual(['p9']);
    const around = whoIsAround(view, layout, players);
    const humans = around.filter((a) => a.p.human);
    expect(humans.map((a) => a.p.playerId ?? a.p.id)).toEqual(['p9', 'p7']);
    expect(humans[0]!.place?.id).toBe('biz:b1');
    expect(humans[1]!.place).toBeNull();
    // Players first, then the notable AI people (once each).
    expect(around.map((a) => a.p.human)).toEqual([true, true, false]);
    expect(around[2]!.p.playerId).toBe('f1');
  });

  it('lists a player the engine places in a building even before presence has them', () => {
    const around = whoIsAround(view, layout, []);
    expect(around.map((a) => [a.p.playerId, a.p.human])).toEqual([
      ['p9', true],
      ['f1', false],
    ]);
  });
});
