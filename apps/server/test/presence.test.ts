import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PRESENCE_WINDOW_MS } from '../src/app.js';
import { KvAccountStore } from '../src/serverless/kv-accounts.js';
import { MemoryKv } from '../src/serverless/kv.js';
import { configFor, createRuntime, handle } from '../src/serverless/netlify.js';
import { Store } from '../src/store/sqlite.js';
import type { AccountStore } from '../src/store/types.js';
import { T0, api, founderSetup, makeApp, signIn } from './helpers.js';

const stores: [string, () => { store: AccountStore; kv?: MemoryKv }][] = [
  ['SQLite', () => ({ store: new Store(':memory:') })],
  [
    'key-value',
    () => {
      const kv = new MemoryKv();
      return { store: new KvAccountStore(kv), kv };
    },
  ],
];

describe.each(stores)('presence in the %s store', (_name, make) => {
  const at = (x: number, t: number, place: string | null = null) => ({ x, y: x, place, at: t });

  it('keeps one position per player, per market, within the window', async () => {
    const { store } = make();
    await store.createUser('u1', 'h1', T0);
    await store.putPresence('u1', 'lagos', at(1, T0));
    await store.putPresence('u1', 'lagos', at(2, T0 + 1000, 'hub'));
    await store.putPresence('u2', 'lagos', at(3, T0 - 60_000));
    await store.putPresence('u3', 'nairobi', at(4, T0));
    const rows = await store.listPresence('lagos', T0 - 30_000);
    expect(rows).toEqual([
      { userId: 'u1', market: 'lagos', x: 2, y: 2, place: 'hub', at: T0 + 1000 },
    ]);
    expect((await store.listPresence('lagos', T0 - 120_000)).map((r) => r.userId).sort()).toEqual([
      'u1',
      'u2',
    ]);
    expect((await store.listPresence('nairobi', 0)).map((r) => r.userId)).toEqual(['u3']);

    // Moving market replaces the old position.
    await store.putPresence('u1', 'nairobi', at(5, T0 + 2000));
    expect((await store.listPresence('lagos', 0)).map((r) => r.userId)).toEqual(['u2']);
    expect((await store.listPresence('nairobi', 0)).map((r) => r.userId).sort()).toEqual([
      'u1',
      'u3',
    ]);
  });

  it('defaults to visible; hiding removes the position', async () => {
    const { store } = make();
    expect(await store.getPresenceVisible('u1')).toBe(true);
    await store.putPresence('u1', 'lagos', at(1, T0));
    await store.setPresenceVisible('u1', false);
    expect(await store.getPresenceVisible('u1')).toBe(false);
    expect(await store.listPresence('lagos', 0)).toEqual([]);
    await store.setPresenceVisible('u1', true);
    expect(await store.getPresenceVisible('u1')).toBe(true);
  });

  it('prunes long-stale positions', async () => {
    const { store, kv } = make();
    await store.putPresence('old', 'lagos', at(1, T0 - 3_600_000));
    await store.putPresence('new', 'lagos', at(1, T0));
    expect((await store.listPresence('lagos', T0 - 120_000)).map((r) => r.userId)).toEqual(['new']);
    if (kv) expect(await kv.list('presence/lagos/')).toEqual(['presence/lagos/new']);
    else
      expect(
        (store as Store).db
          .prepare('SELECT user_id FROM presence')
          .all()
          .map((r) => r.user_id),
      ).toEqual(['new']);
  });

  it('account deletion removes presence and its setting', async () => {
    const { store, kv } = make();
    await store.createUser('u1', 'h1', T0);
    await store.putPresence('u1', 'lagos', at(1, T0));
    await store.setPresenceVisible('u1', true);
    await store.deleteUser('u1', T0);
    expect(await store.listPresence('lagos', 0)).toEqual([]);
    if (kv) {
      expect(await kv.list('presence')).toEqual([]);
    }
  });
});

const investorSetup = (handle: string) => ({
  type: 'player.create',
  handle,
  name: 'Bola',
  role: 'investor',
  backgroundId: 'i-exited',
  market: 'lagos',
  investor: { sectors: ['fintech'], stages: ['seed'], checkSize: 100_000_00 },
});

function put(
  app: FastifyInstance,
  cookie: string,
  payload: unknown,
  headers = { 'x-runway': '1' },
) {
  return app.inject({
    method: 'PUT',
    url: '/api/me/presence',
    headers: { cookie, ...headers },
    payload: payload as object,
  });
}

describe('presence routes', () => {
  it('shows other visible, unblocked players in my market, recently seen', async () => {
    let t = T0;
    const { app, game } = await makeApp({ now: () => t });
    game.openMarkets(['nairobi']);
    const aCookie = await signIn(app, '+2348030000011');
    const a = api(app, aCookie);
    const b = api(app, await signIn(app, '+2348030000022'));
    const c = api(app, await signIn(app, '+2348030000033'));
    const d = api(app, await signIn(app, '+2348030000044'));
    expect((await a.post('/api/presence', { x: 1, y: 2, place: null })).statusCode).toBe(404);
    await a.command(founderSetup('alpha_one'));
    await b.command(investorSetup('beta_two'));
    await c.command(founderSetup('gamma_three'));
    await d.command({ ...founderSetup('delta_four'), market: 'nairobi' });
    const id = async (s: typeof a) => (await s.get('/api/state')).json().view.me.id as string;
    const [aId, bId, cId] = [await id(a), await id(b), await id(c)];

    expect((await a.post('/api/presence', { x: 10, y: 20, place: 'hub' })).statusCode).toBe(204);
    expect((await b.post('/api/presence', { x: 30, y: 40, place: null })).statusCode).toBe(204);
    expect((await c.post('/api/presence', { x: 50, y: 60, place: 'market' })).statusCode).toBe(204);
    expect((await d.post('/api/presence', { x: 1, y: 1, place: null })).statusCode).toBe(204);

    const seen = (await a.get('/api/presence')).json().players;
    expect(seen.map((p: { id: string }) => p.id).sort()).toEqual([bId, cId].sort());
    const gamma = seen.find((p: { id: string }) => p.id === cId);
    expect(gamma).toEqual({
      id: cId,
      name: 'Ada',
      handle: 'gamma_three',
      role: 'founder',
      backgroundId: 'f-engineer',
      stars: game.current.players[cId]!.stars.value,
      company: expect.stringContaining('Trader Pay'),
      x: 50,
      y: 60,
      place: 'market',
      seenAt: T0,
    });
    expect(seen.find((p: { id: string }) => p.id === bId).company).toBeNull();
    // Market isolation: the Nairobi player only sees nobody.
    expect((await d.get('/api/presence')).json().players).toEqual([]);

    // Wave 6: `?place=` lists only the players at that place.
    const atPlace = async (s: typeof a, place: string) =>
      (await s.get(`/api/presence?place=${encodeURIComponent(place)}`))
        .json()
        .players.map((p: { id: string }) => p.id);
    expect(await atPlace(a, 'market')).toEqual([cId]);
    expect(await atPlace(b, 'hub')).toEqual([aId]);
    expect(await atPlace(a, 'biz:nowhere')).toEqual([]);
    expect((await a.get(`/api/presence?place=${'x'.repeat(65)}`)).statusCode).toBe(400);

    // Blocking hides both ways.
    const starters = (await a.get(`/api/chats/starters/${bId}`)).json().starters as string[];
    const chat = (await a.post('/api/chats', { playerId: bId, starter: starters[0] })).json().chat;
    await b.post(`/api/chats/${chat.id}/block`, {});
    expect((await a.get('/api/presence')).json().players.map((p: { id: string }) => p.id)).toEqual([
      cId,
    ]);
    expect((await b.get('/api/presence')).json().players.map((p: { id: string }) => p.id)).toEqual([
      cId,
    ]);

    // Visibility off: hidden at once, and later reports are ignored.
    expect((await a.get('/api/me/presence')).json()).toEqual({ visible: true });
    expect((await put(app, aCookie, { visible: false })).json()).toEqual({ visible: false });
    expect((await a.get('/api/me/presence')).json()).toEqual({ visible: false });
    expect((await a.post('/api/presence', { x: 11, y: 21, place: null })).statusCode).toBe(204);
    expect((await c.get('/api/presence')).json().players.map((p: { id: string }) => p.id)).toEqual([
      bId,
    ]);
    await put(app, aCookie, { visible: true });
    await a.post('/api/presence', { x: 12, y: 22, place: null });
    expect(
      (await c.get('/api/presence'))
        .json()
        .players.map((p: { id: string }) => p.id)
        .sort(),
    ).toEqual([aId, bId].sort());

    // Staleness: nobody has reported for two minutes.
    t = T0 + PRESENCE_WINDOW_MS + 1;
    expect((await c.get('/api/presence')).json().players).toEqual([]);

    // Account deletion removes presence.
    t = T0;
    await a.post('/api/presence', { x: 13, y: 23, place: null });
    await a.del('/api/account');
    expect((await c.get('/api/presence')).json().players.map((p: { id: string }) => p.id)).toEqual([
      bId,
    ]);
  });

  it('lists players by the city they are in, visitors included (Wave 4)', async () => {
    const { app, game } = await makeApp();
    game.openMarkets(['nairobi']);
    const a = api(app, await signIn(app, '+2348030000011'));
    const d = api(app, await signIn(app, '+2348030000044'));
    await a.command(founderSetup('alpha_one'));
    await d.command({ ...investorSetup('delta_four'), market: 'nairobi' });
    const id = async (s: typeof a) => (await s.get('/api/state')).json().view.me.id as string;
    const [aId, dId] = [await id(a), await id(d)];
    const ids = async (s: typeof a) =>
      (await s.get('/api/presence')).json().players.map((p: { id: string }) => p.id);

    await a.post('/api/presence', { x: 1, y: 1, place: null });
    await d.post('/api/presence', { x: 2, y: 2, place: null });
    expect(await ids(a)).toEqual([]);
    expect(await ids(d)).toEqual([]);

    // The Nairobi investor flies to Lagos: now they're on the Lagos map, and see it.
    expect((await d.command({ type: 'travel.fly', to: 'lagos' })).statusCode).toBe(200);
    await d.post('/api/presence', { x: 3, y: 3, place: 'airport' });
    expect(await ids(a)).toEqual([dId]);
    expect(await ids(d)).toEqual([aId]);

    // Home again: gone from Lagos.
    await d.command({ type: 'travel.fly', to: 'nairobi' });
    await d.post('/api/presence', { x: 4, y: 4, place: null });
    expect(await ids(a)).toEqual([]);
    expect(await ids(d)).toEqual([]);
  });

  it('needs a session, the CSRF header and valid coordinates', async () => {
    const { app } = await makeApp();
    const cookie = await signIn(app);
    const s = api(app, cookie);
    await s.command(founderSetup());
    expect((await app.inject({ method: 'GET', url: '/api/presence' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/me/presence' })).statusCode).toBe(401);
    const noCsrf = await app.inject({
      method: 'POST',
      url: '/api/presence',
      headers: { cookie },
      payload: { x: 1, y: 1, place: null },
    });
    expect(noCsrf.statusCode).toBe(403);
    expect((await put(app, cookie, { visible: false }, {} as never)).statusCode).toBe(403);
    expect((await s.post('/api/presence', { x: 'a', y: 1, place: null })).statusCode).toBe(400);
    expect((await s.post('/api/presence', { x: 1, y: 1, place: 'x'.repeat(65) })).statusCode).toBe(
      400,
    );
    expect((await put(app, cookie, { visible: 'no' })).statusCode).toBe(400);
  });

  it('rate-limits position reports', async () => {
    const { app } = await makeApp();
    const s = api(app, await signIn(app));
    await s.command(founderSetup());
    const codes: number[] = [];
    for (let i = 0; i < 32; i++)
      codes.push((await s.post('/api/presence', { x: i, y: i, place: null })).statusCode);
    expect(codes.slice(0, 30).every((c) => c === 204)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });
});

describe('presence through the serverless handler', () => {
  it('two players see each other on a key-value store', async () => {
    const kv = new MemoryKv();
    const rt = await createRuntime(kv, await configFor(kv, 'preview'));
    const clients = ['+2348039990011', '+2348039990022'].map(() => {
      let cookie = '';
      const call = async (method: string, path: string, body?: unknown) => {
        const res = await handle(
          rt,
          new Request(`https://runway.test${path}`, {
            method,
            headers: {
              ...(body === undefined ? {} : { 'content-type': 'application/json' }),
              'x-runway': '1',
              ...(cookie ? { cookie } : {}),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          }),
          '203.0.113.7',
        );
        const set = res.headers.getSetCookie().find((c) => c.startsWith('rw_session='));
        if (set) cookie = set.split(';')[0]!;
        const text = await res.text();
        return { status: res.status, json: text ? JSON.parse(text) : null };
      };
      return call;
    });
    const phones = ['+2348039990011', '+2348039990022'];
    for (const [i, call] of clients.entries()) {
      const start = await call('POST', '/api/auth/start', {
        phone: phones[i],
        dob: { year: 1994, month: 2, day: 3 },
      });
      await call('POST', '/api/auth/verify', { phone: phones[i], code: start.json.devCode });
      const created = await call('POST', '/api/commands', {
        command: founderSetup(i ? `zed_walks` : `kv0_pres`),
      });
      expect(created.json).toMatchObject({ ok: true });
    }
    const [a, b] = clients as [(typeof clients)[0], (typeof clients)[0]];
    expect((await a('POST', '/api/online')).json).toEqual({ count: 1 });
    expect((await b('POST', '/api/online')).json).toEqual({ count: 2 });
    expect((await a('POST', '/api/online')).json).toEqual({ count: 2 });
    expect((await a('POST', '/api/presence', { x: 5, y: 6, place: 'hall' })).status).toBe(204);
    const seen = await b('GET', '/api/presence');
    expect(seen.status).toBe(200);
    expect(seen.json.players).toHaveLength(1);
    expect(seen.json.players[0]).toMatchObject({ handle: 'kv0_pres', x: 5, y: 6, place: 'hall' });
    expect((await a('PUT', '/api/me/presence', { visible: false })).json).toEqual({
      visible: false,
    });
    expect((await b('GET', '/api/presence')).json.players).toEqual([]);
    expect(await kv.list('presence/')).toEqual([]);
  });
});
