import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { KvAccountStore } from '../src/serverless/kv-accounts.js';
import { KvGame, SNAPSHOT_EVERY } from '../src/serverless/kv-game.js';
import { MemoryKv, kvJson } from '../src/serverless/kv.js';
import {
  configFor,
  createRuntime,
  handle,
  modeFor,
  runClock,
  storeFor,
} from '../src/serverless/netlify.js';
import { founderSetup, T0 } from './helpers.js';

const PREVIEW = 'preview' as const;
const PROD = 'production' as const;

function client(rt: Awaited<ReturnType<typeof createRuntime>>) {
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await handle(
      rt,
      new Request(`https://runway.test${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
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
    return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers };
  };
  return {
    call,
    cookie: () => cookie,
    async signIn(phone: string) {
      const start = await call('POST', '/api/auth/start', {
        phone,
        dob: { year: 1994, month: 2, day: 3 },
      });
      return call('POST', '/api/auth/verify', { phone, code: start.json.devCode });
    },
  };
}

describe('serverless key-value store', () => {
  it('compare-and-swap refuses stale and duplicate writes', async () => {
    const kv = new MemoryKv();
    expect((await kv.set('k', 'a', { ifNew: true })).ok).toBe(true);
    expect((await kv.set('k', 'b', { ifNew: true })).ok).toBe(false);
    const e = await kv.get('k');
    expect((await kv.set('k', 'c', { ifMatch: e!.etag })).ok).toBe(true);
    expect((await kv.set('k', 'd', { ifMatch: e!.etag })).ok).toBe(false);
    expect(new TextDecoder().decode((await kv.get('k'))!.data)).toBe('c');
  });

  it('read-modify-write retries until it wins', async () => {
    const kv = new MemoryKv();
    await Promise.all(
      Array.from({ length: 10 }, () => kvJson.update<number>(kv, 'n', (n) => (n ?? 0) + 1, 50)),
    );
    expect((await kvJson.get<number>(kv, 'n'))!.value).toBe(10);
  });
});

describe('the world on a key-value store', () => {
  const make = (kv: MemoryKv) => new KvGame(kv, { seed: 7, now: () => T0 });

  it('two functions acting at once both land, in order, with no lost update', async () => {
    const kv = new MemoryKv();
    const a = make(kv);
    const b = make(kv);
    await a.refresh();
    await a.openMarkets(['lagos']);
    await b.refresh();
    const v = a.current.version;
    // Both start from the same world; b's first commit attempt collides and is re-run.
    const ra = await a.execute(null, { type: 'market.open', market: 'accra' });
    const rb = await b.execute(null, { type: 'market.open', market: 'kigali' });
    expect(ra.ok && rb.ok).toBe(true);
    const fresh = make(kv);
    await fresh.refresh();
    expect(fresh.current.version).toBe(v + 2);
    expect(fresh.current.markets.accra && fresh.current.markets.kigali).toBeTruthy();
  });

  it('a rule refusal changes nothing', async () => {
    const kv = new MemoryKv();
    const g = make(kv);
    await g.openMarkets(['lagos']);
    const before = g.current.version;
    const r = await g.execute('nobody', { type: 'player.gig' });
    expect(r.ok).toBe(false);
    const fresh = make(kv);
    await fresh.refresh();
    expect(fresh.current.version).toBe(before);
  });

  it('a cold start loads the newest snapshot and replays the log after it', async () => {
    const kv = new MemoryKv();
    const g = make(kv);
    await g.openMarkets(['lagos', 'accra', 'kigali']);
    // Fewer than SNAPSHOT_EVERY commands: nothing but the first snapshot exists yet.
    expect((await kv.list('snap/')).length).toBe(1);
    const fresh = make(kv);
    await fresh.refresh();
    expect(fresh.current.version).toBe(g.current.version);
    expect(fresh.current).toEqual(g.current);
  });

  it('snapshots every SNAPSHOT_EVERY commands and keeps only the newest few', async () => {
    const kv = new MemoryKv();
    const g = make(kv);
    await g.refresh();
    for (let i = 0; i < SNAPSHOT_EVERY * 4; i++) {
      const r = await g.execute(null, {
        type: 'market.data',
        market: 'lagos',
        unitsPerUsd: 1500 + i,
      });
      expect(r.ok).toBe(true);
    }
    const snaps = await kv.list('snap/');
    // The genesis snapshot plus the newest three.
    expect(snaps.length).toBe(4);
    expect(snaps[0]).toBe(`snap/${String(0).padStart(12, '0')}`);
    expect(snaps[snaps.length - 1]).toBe(`snap/${String(g.current.version).padStart(12, '0')}`);
    const fresh = make(kv);
    await fresh.refresh();
    expect(fresh.current).toEqual(g.current);
  });

  it('upgrades an older saved world on load', async () => {
    const kv = new MemoryKv();
    const g = make(kv);
    await g.openMarkets(['lagos']);
    const old = structuredClone(g.current) as unknown as Record<string, unknown>;
    delete old.banks;
    old.schemaVersion = 6;
    const keys = await kv.list('snap/');
    for (const k of keys) await kv.delete(k);
    await kv.set(
      `snap/${String(g.current.version).padStart(12, '0')}`,
      gzipSync(JSON.stringify(old)),
    );
    const fresh = make(kv);
    await fresh.refresh();
    expect(fresh.current.banks).toEqual({});
  });
});

describe('cold starts racing on a new store', () => {
  it('many functions starting at once agree on one world', async () => {
    const kv = new MemoryKv();
    const games = Array.from({ length: 6 }, () => new KvGame(kv, { seed: 7, now: () => T0 }));
    await Promise.all(
      games.map((g) => g.openMarkets(['lagos', 'nairobi', 'london', 'accra', 'kigali', 'dubai'])),
    );
    await Promise.all(games.map((g) => g.refresh()));
    const versions = new Set(games.map((g) => g.current.version));
    expect(versions.size).toBe(1);
    expect(Object.keys(games[0]!.current.markets).length).toBe(6);
    expect(
      games.every((g) => JSON.stringify(g.current) === JSON.stringify(games[0]!.current)),
    ).toBe(true);
  });

  it('never starts a second world when the snapshot listing is momentarily empty', async () => {
    const kv = new MemoryKv();
    const g = new KvGame(kv, { seed: 7, now: () => T0 });
    await g.openMarkets(['lagos', 'accra']);
    // Lose every snapshot: the log alone must not be mistaken for an empty store.
    for (const k of await kv.list('snap/')) await kv.delete(k);
    const fresh = new KvGame(kv, { seed: 7, now: () => T0 + 999_999 });
    await expect(fresh.refresh()).rejects.toThrow('Could not load the world.');
  });
});

describe('accounts on a key-value store', () => {
  it('keeps users, sessions, chats and reports, and deletes personal data', async () => {
    const s = new KvAccountStore(new MemoryKv());
    await s.createUser('u1', 'h1', T0);
    await s.createUser('u2', 'h2', T0);
    expect(await s.findUserByPhone('h1')).toEqual({ id: 'u1' });
    await s.createSession('tok', 'u1', T0, 1000);
    expect(await s.sessionUser('tok', T0 + 1)).toBe('u1');
    expect(await s.sessionUser('tok', T0 + 1001)).toBeUndefined();

    const chat = await s.createChat('c1', 'u2', 'u1', T0);
    expect(chat).toMatchObject({ a: 'u1', b: 'u2' });
    expect((await s.createChat('c2', 'u1', 'u2', T0)).id).toBe('c1');
    await Promise.all([
      s.addMessage('c1', 'u1', 'hello', false, T0 + 1),
      s.addMessage('c1', 'u2', 'hi', false, T0 + 2),
    ]);
    expect((await s.messages('c1')).map((m) => m.text).sort()).toEqual(['hello', 'hi']);
    expect((await s.chatsFor('u1'))[0]!.last_text).toBeTruthy();
    expect(await s.recentMessageCount('u1', T0)).toBe(1);
    await s.report('c1', 'u2', 'spam', T0);
    expect(await s.openReports()).toHaveLength(1);

    await s.deleteUser('u1', T0);
    expect(await s.findUserByPhone('h1')).toBeUndefined();
    expect(await s.sessionUser('tok', T0 + 1)).toBeUndefined();
    expect(await s.chatsFor('u2')).toEqual([]);
  });
});

describe('Netlify runtime', () => {
  it('tells production from previews, and never lets a preview URL reach the live world', () => {
    const prod = { context: 'production', published: true };
    expect(modeFor(prod, 'https://runwaystartup.netlify.app/api/state')).toBe('production');
    expect(modeFor(prod, 'https://play.example.com/api/state')).toBe('production');
    expect(modeFor({ context: 'deploy-preview', published: false })).toBe('preview');
    // Even if the context were misreported, a permalink host is a preview.
    expect(modeFor(prod, 'https://deploy-preview-3--runwaystartup.netlify.app/api/meta')).toBe(
      'preview',
    );
    expect(modeFor(prod, 'https://6ac2--runwaystartup.netlify.app/')).toBe('preview');
    expect(modeFor(undefined, 'https://runwaystartup.netlify.app/')).toBe('preview');
  });

  it('gives each preview address one store shared by all its deploys', () => {
    expect(storeFor('production', 'https://runwaystartup.netlify.app/api/state')).toEqual({
      name: 'runway',
      perDeploy: false,
    });
    const pr = 'https://deploy-preview-5--runwaystartup.netlify.app/api/state';
    expect(storeFor('preview', pr)).toEqual({
      name: 'runway-preview-deploy-preview-5',
      perDeploy: false,
    });
    expect(storeFor('preview', 'https://Feature_X--runwaystartup.netlify.app/').name).toBe(
      'runway-preview-feature-x',
    );
    // Not a preview address: that deploy's own store.
    expect(storeFor('preview', 'https://runwaystartup.netlify.app/')).toEqual({
      name: 'runway',
      perDeploy: true,
    });
    expect(storeFor('preview')).toEqual({ name: 'runway', perDeploy: true });
  });

  it('keeps one generated session secret per store and turns dev tools on only in previews', async () => {
    const kv = new MemoryKv();
    const a = await configFor(kv, PREVIEW);
    const b = await configFor(kv, PREVIEW);
    expect(a.SESSION_SECRET).toBe(b.SESSION_SECRET);
    expect(a.SESSION_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(a.DEV_TOOLS).toBe(true);
    const prod = await configFor(new MemoryKv(), PROD);
    expect(prod.DEV_TOOLS).toBe(false);
    expect(prod.NODE_ENV).toBe('production');
    expect(prod.SHOW_SIGNIN_CODE).toBe(true);
  });

  it('serves the whole sign-in and play loop through the function handler', async () => {
    const kv = new MemoryKv();
    const rt = await createRuntime(kv, await configFor(kv, PREVIEW));
    const c = client(rt);
    expect((await c.call('GET', '/api/health')).json.ok).toBe(true);
    const meta = await c.call('GET', '/api/meta');
    expect(meta.json.markets.length).toBe(10);
    expect(meta.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect((await c.call('GET', '/api/state')).status).toBe(401);

    const verified = await c.signIn('+2348039990001');
    expect(verified.status).toBe(200);
    const created = await c.call('POST', '/api/commands', { command: founderSetup('kv_founder') });
    expect(created.status).toBe(200);
    const state = await c.call('GET', '/api/state');
    expect(state.json.view.me.handle).toBe('kv_founder');
    // Live updates fall back to polling.
    expect((await c.call('GET', '/api/events')).status).toBe(204);
    // Missing CSRF header is refused, as on the long-running server.
    const csrf = await handle(
      rt,
      new Request('https://runway.test/api/commands', { method: 'POST', body: '{}' }),
    );
    expect(csrf.status).toBe(403);

    // A second function instance (cold start) sees the same world and sessions.
    const rt2 = await createRuntime(kv, await configFor(kv, PREVIEW));
    const again = await handle(
      rt2,
      new Request('https://runway.test/api/state', { headers: { cookie: c.cookie() } }),
    );
    expect(again.status).toBe(200);
    expect(((await again.json()) as { view: { me: { handle: string } } }).view.me.handle).toBe(
      'kv_founder',
    );
  });

  it('the clock settles markets once a game month has passed', async () => {
    const kv = new MemoryKv();
    const rt = await createRuntime(kv, await configFor(kv, PREVIEW));
    expect(rt.config.MONTH_MINUTES).toBe(5);
    const month = rt.game.current.markets.lagos!.month;
    const realNow = Date.now;
    try {
      const later = realNow() + 5 * 60_000;
      Date.now = () => later;
      const r = await runClock({ ...rt, config: { ...rt.config, FX_FEED_URL: '' } });
      expect(r.settled).toBe(Object.keys(rt.game.current.markets).length);
      // Nothing more until the next month ends.
      const again = await runClock({ ...rt, config: { ...rt.config, FX_FEED_URL: '' } });
      expect(again.settled).toBe(0);
    } finally {
      Date.now = realNow;
    }
    const fresh = new KvGame(kv, { seed: 1, now: () => T0 });
    await fresh.refresh();
    expect(fresh.current.markets.lagos!.month).toBe(month + 1);
  });
});

describe('store self-test (previews)', () => {
  it('reports the guarantees the game relies on', async () => {
    const kv = new MemoryKv();
    const rt = await createRuntime(kv, await configFor(kv, PREVIEW));
    const res = await handle(rt, new Request('https://runway.test/api/dev/kv-selftest'));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      createOnlyHonoured: true,
      staleWriteRefused: true,
      casWithReadEtag: true,
    });
    expect(String(body.secret)).toHaveLength(8);
    // Not exposed in production.
    const prodKv = new MemoryKv();
    const prod = await createRuntime(prodKv, await configFor(prodKv, PROD));
    const hidden = await handle(prod, new Request('https://runway.test/api/dev/kv-selftest'));
    expect(hidden.status).toBe(404);
  });
});
