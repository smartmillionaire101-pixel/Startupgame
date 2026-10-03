import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameService } from '../src/game.js';
import { Store } from '../src/store/sqlite.js';
import { fetchFxUpdates } from '../src/adapters/feeds.js';
import { isAdult, normalisePhone } from '../src/auth.js';
import { api, founderSetup, makeApp, signIn, T0 } from './helpers.js';

const H = { 'x-runway': '1' };
const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('auth (§18)', () => {
  it('signs up with phone + OTP and sets an httpOnly, SameSite=Strict session cookie', async () => {
    const { app, sent } = await makeApp();
    const start = await app.inject({
      method: 'POST',
      url: '/api/auth/start',
      headers: H,
      payload: { phone: '+44 7700 900123', dob: { year: 1990, month: 1, day: 1 } },
    });
    expect(start.statusCode).toBe(200);
    expect(sent[0]).toMatch(/Your Runway code is \d{6}/);
    const code = start.json().devCode;
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      headers: H,
      payload: { phone: '+447700900123', code: code === '000000' ? '111111' : '000000' },
    });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      headers: H,
      payload: { phone: '+447700900123', code },
    });
    expect(ok.statusCode).toBe(200);
    const c = ok.cookies.find((x) => x.name === 'rw_session')!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe('Strict');
    // A used code cannot be replayed.
    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      headers: H,
      payload: { phone: '+447700900123', code },
    });
    expect(replay.statusCode).toBe(401);
  });

  it('refuses under-18s and bad numbers; one account per number', async () => {
    const { app } = await makeApp();
    const kid = await app.inject({
      method: 'POST',
      url: '/api/auth/start',
      headers: H,
      payload: { phone: '+254712345678', dob: { year: 2015, month: 1, day: 1 } },
    });
    expect(kid.statusCode).toBe(403);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/start',
      headers: H,
      payload: { phone: '12', dob: { year: 1990, month: 1, day: 1 } },
    });
    expect(bad.statusCode).toBe(400);
    const a = await signIn(app, '+2348030000001');
    await api(app, a).command(founderSetup('first_one'));
    const b = await signIn(app, '+2348030000001');
    const state = await api(app, b).get('/api/state');
    expect(state.json().onboarded).toBe(true);
  });

  it('never stores phone numbers in plain text', async () => {
    const { app, store } = await makeApp();
    await signIn(app, '+2348039999999');
    const rows = store.db.prepare('SELECT phone_hash FROM users').all() as { phone_hash: string }[];
    expect(rows[0]!.phone_hash).not.toContain('8039999999');
    expect(rows[0]!.phone_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalises phones and checks age precisely', () => {
    expect(normalisePhone('+234 (803) 123-4567')).toBe('+2348031234567');
    expect(normalisePhone('abc')).toBeNull();
    const now = new Date(Date.UTC(2026, 9, 3));
    expect(isAdult({ year: 2008, month: 10, day: 3 }, now)).toBe(true);
    expect(isAdult({ year: 2008, month: 10, day: 4 }, now)).toBe(false);
  });
});

describe('API boundary', () => {
  it('requires the CSRF header on state-changing requests', async () => {
    const { app } = await makeApp();
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/start',
      payload: { phone: '+2348031234567', dob: { year: 1990, month: 1, day: 1 } },
    });
    expect(r.statusCode).toBe(403);
  });

  it('requires a session for game routes', async () => {
    const { app } = await makeApp();
    expect((await app.inject({ method: 'GET', url: '/api/state' })).statusCode).toBe(401);
  });

  it('onboards, plays, and maps rule errors to 422 and bad input to 400', async () => {
    const { app } = await makeApp();
    const s = api(app, await signIn(app));
    expect((await s.get('/api/state')).json()).toEqual({ onboarded: false });
    const created = await s.command(founderSetup());
    expect(created.statusCode).toBe(200);
    const view = (await s.get('/api/state')).json().view;
    expect(view.me.handle).toBe('ada_builds');
    expect(view.companies[0].name).toMatch(/Trader Pay/);
    expect(view.inbox.length).toBeGreaterThan(0);

    const cid = view.companies[0].id;
    expect(
      (await s.command({ type: 'company.build', companyId: cid, hours: 160 })).statusCode,
    ).toBe(200);
    const tooMuch = await s.command({ type: 'company.build', companyId: cid, hours: 160 });
    expect(tooMuch.statusCode).toBe(422);
    expect(tooMuch.json().error.code).toBe('hours.short');
    expect(
      (await s.command({ type: 'company.build', companyId: cid, hours: 'lots' })).statusCode,
    ).toBe(400);
    expect(
      (await s.command({ type: 'market.settle', market: 'lagos', date: '2030-01-01' })).statusCode,
    ).toBe(403);
  });

  it('serves meta for onboarding with the disclaimer', async () => {
    const { app } = await makeApp();
    const meta = (await app.inject({ method: 'GET', url: '/api/meta' })).json();
    expect(meta.disclaimer).toBe(
      'This is a game. Nothing here is financial, legal, or tax advice.',
    );
    expect(meta.markets.map((m: { id: string }) => m.id)).toEqual(['lagos', 'nairobi', 'london']);
    expect(meta.backgrounds.filter((b: { role: string }) => b.role === 'founder')).toHaveLength(6);
  });

  it('serves the public digest', async () => {
    const { app } = await makeApp();
    const r = await app.inject({ method: 'GET', url: '/api/digest?market=nairobi' });
    expect(r.statusCode).toBe(200);
    expect(r.json().market).toBe('nairobi');
    expect(r.headers['cache-control']).toContain('max-age');
  });

  it('checks names live', async () => {
    const { app } = await makeApp();
    const r = await app.inject({
      method: 'GET',
      url: '/api/names/check?name=Flutterwav&market=lagos',
    });
    expect(r.json().ok).toBe(false);
    const ok = await app.inject({
      method: 'GET',
      url: '/api/names/check?name=Mama%20Put%20Pay&market=lagos',
    });
    expect(ok.json().ok).toBe(true);
  });

  it('hides the economy dashboard without the admin token', async () => {
    const { app } = await makeApp();
    expect((await app.inject({ method: 'GET', url: '/api/admin/economy' })).statusCode).toBe(404);
    const r = await app.inject({
      method: 'GET',
      url: '/api/admin/economy',
      headers: { authorization: 'Bearer admin-token-123' },
    });
    expect(r.json().companies.active).toBeGreaterThan(0);
  });

  it('advances a market with the dev settle route', async () => {
    const { app } = await makeApp();
    const s = api(app, await signIn(app));
    await s.command(founderSetup());
    const r = await s.post('/api/dev/settle', { market: 'lagos' });
    expect(r.json().month).toBe(1);
  });
});

describe('chat (§15)', () => {
  it('starts from a starter, filters contact details, and supports block and report', async () => {
    const { app } = await makeApp();
    const a = api(app, await signIn(app, '+2348030000011'));
    const b = api(app, await signIn(app, '+2348030000022'));
    const c = api(app, await signIn(app, '+2348030000033'));
    await a.command(founderSetup('alpha_one'));
    await b.command({
      type: 'player.create',
      handle: 'beta_two',
      name: 'Bola',
      role: 'investor',
      backgroundId: 'i-exited',
      market: 'lagos',
      investor: { sectors: ['fintech'], stages: ['seed'], checkSize: 100_000_00 },
    });
    await c.command(founderSetup('gamma_three'));
    const bId = (await b.get('/api/state')).json().view.me.id;

    const free = await a.post('/api/chats', { playerId: bId, starter: 'hello there' });
    expect(free.statusCode).toBe(400);
    const starters = (await a.get(`/api/chats/starters/${bId}`)).json().starters as string[];
    const chat = (await a.post('/api/chats', { playerId: bId, starter: starters[0] })).json().chat;

    expect(
      (await a.post(`/api/chats/${chat.id}/messages`, { text: 'Call me on +234 803 123 4567' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await a.post(`/api/chats/${chat.id}/messages`, { text: 'Our MRR grew 20% last month.' }))
        .statusCode,
    ).toBe(200);
    const seen = (await b.get(`/api/chats/${chat.id}/messages`)).json();
    expect(seen.messages.map((m: { text: string }) => m.text)).toEqual([
      starters[0],
      'Our MRR grew 20% last month.',
    ]);
    // Private between participants.
    expect((await c.get(`/api/chats/${chat.id}/messages`)).statusCode).toBe(404);

    expect((await b.post(`/api/chats/${chat.id}/report`, { reason: 'spam' })).statusCode).toBe(200);
    expect((await a.post(`/api/chats/${chat.id}/messages`, { text: 'hello?' })).statusCode).toBe(
      403,
    );
  });
});

describe('account deletion (§18)', () => {
  it('anonymises the player and ends the session', async () => {
    const { app, game } = await makeApp();
    const cookie = await signIn(app);
    const s = api(app, cookie);
    await s.command(founderSetup());
    const id = (await s.get('/api/state')).json().view.me.id;
    expect((await s.del('/api/account')).json().deleted).toBe(true);
    expect(game.current.players[id]!.name).toBe('Former player');
    expect((await s.get('/api/state')).statusCode).toBe(401);
  });
});

describe('persistence and replay', () => {
  it('rebuilds the exact world from snapshot + command log after a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'runway-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'game.db');
    let t = T0;
    const now = () => (t += 1000);
    const first = await makeApp({ path, now });
    const s = api(first.app, await signIn(first.app));
    await s.command(founderSetup());
    const cid = (await s.get('/api/state')).json().view.companies[0].id;
    for (let i = 0; i < 7; i++)
      await s.command({
        type: 'company.strategy',
        companyId: cid,
        marketingBudget: 1000_00 * (i + 1),
      });
    await s.post('/api/dev/settle', { market: 'lagos' });
    await s.command({ type: 'company.build', companyId: cid, hours: 20 });
    const before = JSON.stringify(first.game.current);
    await first.app.close();
    first.store.close();

    const store = new Store(path);
    const again = new GameService(store, { seed: 99, snapshotEvery: 5, now });
    expect(JSON.stringify(again.current)).toBe(before);
    store.close();
  });

  it('opens configured markets in waves at boot, once, and keeps them after restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'runway-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'game.db');
    const first = await makeApp({ path });
    first.game.openMarkets(['accra', 'cairo']);
    first.game.openMarkets(['accra']);
    expect(Object.keys(first.game.current.markets)).toEqual([
      'lagos',
      'nairobi',
      'london',
      'accra',
      'cairo',
    ]);
    const meta = (await first.app.inject({ method: 'GET', url: '/api/meta' })).json();
    expect(meta.markets.map((m: { id: string }) => m.id)).toContain('cairo');
    const before = JSON.stringify(first.game.current);
    await first.app.close();
    first.store.close();
    const store = new Store(path);
    const again = new GameService(store, { seed: 99, snapshotEvery: 5, now: () => T0 });
    expect(JSON.stringify(again.current)).toBe(before);
    store.close();
  });

  it('settles markets when local midnight passes', async () => {
    let t = T0;
    const { game } = await makeApp({ now: () => t });
    expect(game.tick()).toBe(0);
    t += 86_400_000;
    expect(game.tick()).toBe(3);
    expect(game.current.markets.lagos!.month).toBe(1);
  });
});

describe('data feeds (§17)', () => {
  it('turns FX moves into updates and ignores noise and bad data', async () => {
    const fake = (async () =>
      new Response(
        JSON.stringify({ result: 'success', rates: { NGN: 1600, KES: 129.21, GBP: 2 } }),
      )) as typeof fetch;
    const updates = await fetchFxUpdates(
      'https://fx.test',
      { lagos: 1530, nairobi: 129.2, london: 0.745 },
      fake,
    );
    expect(updates).toEqual([{ market: 'lagos', unitsPerUsd: 1600 }]);
  });
});
