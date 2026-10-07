import { describe, expect, it } from 'vitest';
import { makeApp, api, playAsGuest, T0 } from './helpers.js';
import { Store } from '../src/store/sqlite.js';
import { KvAccountStore } from '../src/serverless/kv-accounts.js';
import { MemoryKv } from '../src/serverless/kv.js';
import { createRuntime, configFor, handle } from '../src/serverless/netlify.js';

const H = { 'x-runway': '1' };
describe('quick onboarding', () => {
  it.each(['founder', 'investor', 'banker'] as const)(
    'enters as %s without business setup',
    async (role) => {
      const { app, store } = await makeApp();
      try {
        const joined = await app.inject({
          method: 'POST',
          url: '/api/onboarding',
          headers: H,
          payload: { username: `new_${role}`, email: ' HELLO@example.com ', role, adult: true },
        });
        expect(joined.statusCode).toBe(200);
        const cookie = `rw_session=${joined.cookies.find((c) => c.name === 'rw_session')!.value}`;
        const client = api(app, cookie);
        const state = (await client.get('/api/state')).json();
        expect(state.onboarded).toBe(true);
        expect(state.account).toEqual({
          guest: true,
          email: null,
          pendingEmail: 'hello@example.com',
        });
        expect(state.view.me).toMatchObject({ handle: `new_${role}`, role });
        expect(state.view.companies).toEqual([]);
        expect(state.view.bank).toBeNull();
        expect(JSON.stringify(state.view)).not.toContain('hello@example.com');
        const retry = await client.post('/api/onboarding', {
          username: `new_${role}`,
          email: 'hello@example.com',
          role,
          adult: true,
        });
        expect(retry.statusCode).toBe(200);
        expect(await store.findUserByEmail('hello@example.com')).toBeUndefined();
      } finally {
        await app.close();
        store.close();
      }
    },
  );

  it('rejects invalid entries and never signs into the owner of a submitted email', async () => {
    const { app, store } = await makeApp();
    try {
      const owner = api(app, await playAsGuest(app));
      await store.createGuestUser('owner', T0);
      await store.setEmail('owner', 'saved@example.com');
      const body = {
        username: 'quick_user',
        email: 'saved@example.com',
        role: 'founder',
        adult: true,
      };
      expect(
        (await app.inject({ method: 'POST', url: '/api/onboarding', payload: body })).statusCode,
      ).toBe(403);
      expect(
        (await owner.post('/api/onboarding', { ...body, email: 'not-an-email' })).statusCode,
      ).toBe(400);
      expect((await owner.post('/api/onboarding', { ...body, role: 'admin' })).statusCode).toBe(
        400,
      );
      const joined = await owner.post('/api/onboarding', body);
      expect(joined.statusCode).toBe(200);
      expect((await owner.get('/api/state')).json().view.me.id).not.toBe('owner');
      expect(await store.findUserByEmail('saved@example.com')).toEqual({ id: 'owner' });
      const another = api(app, await playAsGuest(app));
      expect((await another.post('/api/onboarding', body)).statusCode).toBe(422);
      expect((await another.get('/api/state')).json().onboarded).toBe(false);
    } finally {
      await app.close();
      store.close();
    }
  });
});

it.each(['SQLite', 'serverless'])(
  'keeps pending email separate and clears it on confirmation/deletion in %s',
  async (kind) => {
    const store = kind === 'SQLite' ? new Store(':memory:') : new KvAccountStore(new MemoryKv());
    try {
      await store.createGuestUser('a', T0);
      await store.setPendingEmail('a', 'pending@example.com');
      expect((await store.getAccount('a'))?.pendingEmail).toBe('pending@example.com');
      expect(await store.findUserByEmail('pending@example.com')).toBeUndefined();
      await store.setEmail('a', 'pending@example.com');
      expect(await store.getAccount('a')).toEqual({ guest: false, email: 'pending@example.com' });
      await store.setPendingEmail('a', 'other@example.com');
      await store.deleteUser('a', T0);
      expect(await store.getAccount('a')).toBeUndefined();
    } finally {
      if (store instanceof Store) store.close();
    }
  },
);

it('supports quick entry through serverless', async () => {
  const kv = new MemoryKv();
  const rt = await createRuntime(kv, await configFor(kv, 'preview'));
  const response = await handle(
    rt,
    new Request('https://runway.test/api/onboarding', {
      method: 'POST',
      headers: { ...H, 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'serverless_join',
        email: 'join@example.com',
        role: 'banker',
        adult: true,
      }),
    }),
    '203.0.113.7',
  );
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie().some((c) => c.startsWith('rw_session='))).toBe(true);
});
