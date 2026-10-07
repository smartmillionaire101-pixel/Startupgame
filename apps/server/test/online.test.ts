import { describe, expect, it } from 'vitest';
import { KvAccountStore } from '../src/serverless/kv-accounts.js';
import { MemoryKv } from '../src/serverless/kv.js';
import { Store } from '../src/store/sqlite.js';
import { T0, api, founderSetup, makeApp, playAsGuest } from './helpers.js';

describe.each(['SQLite', 'serverless'])('online players (%s)', (kind) => {
  const make = () =>
    kind === 'SQLite' ? new Store(':memory:') : new KvAccountStore(new MemoryKv());

  it('deduplicates accounts, includes hidden players and expires old heartbeats', async () => {
    const store = make();
    try {
      expect(await store.heartbeatOnline('a', T0, 45_000)).toBe(1);
      expect(await store.heartbeatOnline('a', T0 + 100, 45_000)).toBe(1);
      await store.setPresenceVisible('b', false);
      expect(await store.heartbeatOnline('b', T0 + 100, 45_000)).toBe(2);
      expect(await store.heartbeatOnline('c', T0 + 45_100, 45_000)).toBe(3);
      expect(await store.heartbeatOnline('c', T0 + 45_101, 45_000)).toBe(1);
    } finally {
      if (store instanceof Store) store.close();
    }
  });

  it('removes deleted accounts immediately', async () => {
    const store = make();
    try {
      await store.createGuestUser('a', T0);
      await store.heartbeatOnline('a', T0, 45_000);
      await store.deleteUser('a', T0);
      expect(await store.heartbeatOnline('b', T0, 45_000)).toBe(1);
    } finally {
      if (store instanceof Store) store.close();
    }
  });
});

it('preserves concurrent heartbeats from separate serverless instances', async () => {
  const kv = new MemoryKv();
  await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      new KvAccountStore(kv).heartbeatOnline(`p${i}`, T0, 45_000),
    ),
  );
  expect(await new KvAccountStore(kv).heartbeatOnline('p0', T0, 45_000)).toBe(6);
});

it('requires a player and CSRF protection, and returns only a non-cached total across cities', async () => {
  let now = T0;
  const { app, store, game } = await makeApp({ now: () => now });
  try {
    const cookie = await playAsGuest(app);
    const a = api(app, cookie);
    expect(
      (await app.inject({ method: 'POST', url: '/api/online', headers: { 'x-runway': '1' } }))
        .statusCode,
    ).toBe(401);
    expect((await a.post('/api/online', {})).statusCode).toBe(404);
    await a.command(founderSetup('online_a'));
    expect(
      (await app.inject({ method: 'POST', url: '/api/online', headers: { cookie } })).statusCode,
    ).toBe(403);
    const first = await a.post('/api/online', {});
    expect(first.json()).toEqual({ count: 1 });
    expect(first.headers['cache-control']).toBe('no-store');
    game.openMarkets(['nairobi']);
    const b = api(app, await playAsGuest(app));
    expect(
      (await b.command({ ...founderSetup('online_b'), market: 'nairobi' })).json(),
    ).toMatchObject({ ok: true });
    expect((await b.post('/api/online', {})).json()).toEqual({ count: 2 });
    expect((await a.post('/api/online', {})).json()).toEqual({ count: 2 });
    now += 45_001;
    expect((await b.post('/api/online', {})).json()).toEqual({ count: 1 });
  } finally {
    await app.close();
    store.close();
  }
});
