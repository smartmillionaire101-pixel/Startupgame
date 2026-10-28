import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import {
  onToPlace,
  placeAfterUnpack,
  takeToPlace,
  toPlace,
  unpackCommands,
  vansOf,
} from '../src/shop/vans';

type Row = PlayerView['living']['deliveries'][number];
const row = (over: Partial<Row> & { id: string; van?: string }): Row =>
  ({
    owner: 'me',
    market: 'lagos',
    label: 'x',
    kind: 'furniture',
    orderedAt: 0,
    arrivesAt: 1000,
    unpackedBy: [],
    complete: false,
    ...over,
  }) as Row;

describe('one order, one van (round 7)', () => {
  it('groups a home’s waiting deliveries by van, the first in first', () => {
    const vans = vansOf(
      [
        row({ id: 'd1', van: 'd1', arrivesAt: 5000 }),
        row({ id: 'd2', van: 'd1', arrivesAt: 5000 }),
        row({ id: 'd3', arrivesAt: 2000 }),
        row({ id: 'd4', complete: true }),
        row({ id: 'd5', owner: 'friend' }),
      ],
      'me',
    );
    expect(vans.map((v) => [v.id, v.items.map((d) => d.id)])).toEqual([
      ['d3', ['d3']],
      ['d1', ['d1', 'd2']],
    ]);
  });

  it('what you place yourself once it’s unpacked: never a painting hung for you', () => {
    expect(toPlace(row({ id: 'a', item: { slot: 'art', itemId: 'art-1', paid: 1 } }))).toEqual({
      kind: 'slot',
      slot: 'art',
    });
    expect(
      toPlace(
        row({
          id: 'b',
          order: { extra: { id: 'extra_1', slot: 'plants', itemId: 'plants-1', paid: 1 } },
        } as never),
      ),
    ).toEqual({ kind: 'extra', slot: 'plants', id: 'extra_1' });
    expect(toPlace(row({ id: 'c', kind: 'wall', order: { wall: { id: 'w1' } } } as never))).toEqual(
      { kind: 'wall', id: 'w1' },
    );
    // A kitchen is built in; groceries aren't placed.
    expect(toPlace(row({ id: 'd', item: { slot: 'kitchen', itemId: 'kitchen-1', paid: 1 } }))).toBe(
      null,
    );
    expect(toPlace(row({ id: 'e', kind: 'parcel' }))).toBe(null);
  });

  it('Unpack all is one command with vans, else each in turn', () => {
    const [van] = vansOf([row({ id: 'd1', van: 'd1' }), row({ id: 'd2', van: 'd1' })], 'me');
    expect(unpackCommands(van!, true)).toEqual([
      { type: 'living.collect', deliveryId: 'd1', all: true },
    ]);
    expect(unpackCommands(van!, false).map((c) => c.deliveryId)).toEqual(['d1', 'd2']);
  });

  it('hands what to place to the home scene, now or when it opens', () => {
    let heard = 0;
    placeAfterUnpack([{ kind: 'slot', slot: 'art' }]);
    const off = onToPlace(() => heard++);
    placeAfterUnpack([{ kind: 'wall', id: 'w1' }]);
    expect(heard).toBe(1);
    expect(takeToPlace()).toEqual([
      { kind: 'slot', slot: 'art' },
      { kind: 'wall', id: 'w1' },
    ]);
    expect(takeToPlace()).toEqual([]);
    off();
  });
});
