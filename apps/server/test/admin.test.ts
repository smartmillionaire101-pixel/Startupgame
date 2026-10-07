import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store/sqlite.js';
import { KvAccountStore } from '../src/serverless/kv-accounts.js';
import { MemoryKv } from '../src/serverless/kv.js';
import { T0, api, makeApp, playAsGuest, founderSetup } from './helpers.js';
import { GameService } from '../src/game.js';

const H = { 'x-runway': '1' };
const cleanup: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function fixture(opts: Parameters<typeof makeApp>[0] = {}) {
  const f = await makeApp(opts);
  cleanup.push(async () => {
    await f.app.close();
    f.store.close();
  });
  return f;
}
describe.each(['SQLite', 'serverless'])('visit metrics (%s)', (kind) => {
  it('deduplicates heartbeats, expires live tabs, resumes visits after inactivity and rolls UTC days', async () => {
    const store = kind === 'SQLite' ? new Store(':memory:') : new KvAccountStore(new MemoryKv());
    if (store instanceof Store) cleanup.push(() => store.close());
    expect((await store.visitStats(T0)).total).toBe(0);
    await store.recordVisit('a', T0);
    await store.recordVisit('a', T0 + 100);
    await store.recordVisit('b', T0 + 100);
    expect(await store.visitStats(T0 + 100)).toMatchObject({
      total: 2,
      today: 2,
      active: 2,
      since: T0,
    });
    expect((await store.visitStats(T0 + 45_101)).active).toBe(0);
    await store.recordVisit('a', T0 + 30 * 60_000 + 101);
    expect((await store.visitStats(T0 + 30 * 60_000 + 101)).total).toBe(3);
    await store.recordVisit('a', T0 + 86_400_000);
    const stats = await store.visitStats(T0 + 86_400_000);
    expect(stats).toMatchObject({ total: 4, today: 1, active: 1 });
    expect(stats.daily.slice(-2).map((d) => d.visits)).toEqual([3, 1]);
  });
});
it('preserves concurrent serverless traffic updates across instances', async () => {
  const kv = new MemoryKv();
  await Promise.all(
    Array.from({ length: 6 }, (_, i) => new KvAccountStore(kv).recordVisit(String(i), T0)),
  );
  expect(await new KvAccountStore(kv).visitStats(T0)).toMatchObject({ total: 6, active: 6 });
});
it('persists traffic after reopening SQLite', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runway-admin-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'test.db');
  const first = new Store(path);
  first.recordVisit('a', T0);
  first.close();
  const second = new Store(path);
  expect(second.visitStats(T0)).toMatchObject({ total: 1, active: 1 });
  second.close();
});
it('requires authentication, issues a private expiring cookie, rejects tampering and limits login attempts', async () => {
  let time = T0;
  const { app } = await fixture({ now: () => time });
  expect((await app.inject('/api/admin/dashboard')).statusCode).toBe(401);
  const login = (token: string) =>
    app.inject({ method: 'POST', url: '/api/admin/login', headers: H, payload: { token } });
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { token: 'admin-token-123' },
      })
    ).statusCode,
  ).toBe(403);
  expect((await login('wrong')).statusCode).toBe(401);
  const signed = await login('admin-token-123');
  expect(signed.statusCode).toBe(200);
  expect(signed.headers['set-cookie']).toContain('HttpOnly');
  expect(signed.headers['set-cookie']).toContain('SameSite=Strict');
  const cookie = `rw_admin=${signed.cookies[0]!.value}`;
  const get = (c: string) => app.inject({ url: '/api/admin/dashboard', headers: { cookie: c } });
  const good = await get(cookie);
  expect(good.statusCode).toBe(200);
  expect(good.headers['cache-control']).toBe('no-store');
  expect((await get(`${cookie}x`)).statusCode).toBe(401);
  time += 8 * 60 * 60_000 + 1;
  expect((await get(cookie)).statusCode).toBe(401);
  for (let i = 0; i < 5; i++) await login('wrong');
  expect((await login('wrong')).statusCode).toBe(429);
});
it('only permits explicit loopback development access, never forwarded spoofing or production', async () => {
  for (const production of [false, true]) {
    const { app } = await fixture({
      allowLocalAdmin: true,
      env: {
        ADMIN_TOKEN: '',
        NODE_ENV: production ? 'production' : 'test',
        DEV_TOOLS: production ? '0' : '1',
      },
    });
    const get = (remoteAddress: string, host: string) =>
      app.inject({
        url: '/api/admin/dashboard',
        remoteAddress,
        headers: { host, 'x-forwarded-for': '127.0.0.1' },
      });
    expect((await get('127.0.0.1', 'localhost:8787')).statusCode).toBe(production ? 503 : 200);
    expect((await get('198.51.100.4', 'localhost:8787')).statusCode).toBe(503);
    expect((await get('127.0.0.1', 'attacker.example')).statusCode).toBe(503);
  }
  const { app } = await fixture({ env: { ADMIN_TOKEN: '' } });
  expect((await app.inject('/api/admin/dashboard')).statusCode).toBe(503);
});
it('counts real visits and human players, exposes persisted finances, and excludes admin reads', async () => {
  const { app, game, store } = await fixture();
  const cookie = await playAsGuest(app);
  const user = api(app, cookie);
  await user.command(founderSetup('admin_founder'));
  await user.post('/api/online', {});
  const id = randomUUID();
  expect(
    (await app.inject({ method: 'POST', url: '/api/visits', payload: { id } })).statusCode,
  ).toBe(403);
  expect((await user.post('/api/visits', { id: 'bad' })).statusCode).toBe(400);
  expect((await user.post('/api/visits', { id })).statusCode).toBe(204);
  await user.post('/api/visits', { id });
  const r = await app.inject({
    url: '/api/admin/dashboard',
    headers: { authorization: 'Bearer admin-token-123' },
  });
  const body = r.json();
  expect(body.visits).toMatchObject({ total: 1, active: 1 });
  expect(body.onlinePlayers).toBe(1);
  expect(body.players).toHaveLength(1);
  expect(body.finances.totals.NGN.capital).toBeGreaterThan(0);
  expect(body.businesses).toBe(1);
  expect(body.localAccess).toBe(false);
  expect(body.players[0]).not.toHaveProperty('email');
  game.snapshot();
  const restored = new GameService(store, { seed: 99, now: () => T0, snapshotEvery: 5 });
  expect(restored.current.activity).toEqual(game.current.activity);
  expect(store.visitStats(T0).total).toBe(1);
});
