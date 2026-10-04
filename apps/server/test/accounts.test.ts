/**
 * Guest play and email sign-in links: both account stores, and the HTTP
 * routes on both the long-running server (SQLite) and the serverless
 * handler (key-value store).
 */
import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Store } from '../src/store/sqlite.js';
import { KvAccountStore } from '../src/serverless/kv-accounts.js';
import { MemoryKv } from '../src/serverless/kv.js';
import { configFor, createRuntime, handle } from '../src/serverless/netlify.js';
import { normaliseEmail } from '../src/auth.js';
import {
  DevEmailProvider,
  ResendEmailProvider,
  emailProviderFrom,
  isReservedAddress,
  signInEmail,
  SmtpEmailProvider,
  type EmailMessage,
} from '../src/adapters/email.js';
import type { AccountStore } from '../src/store/types.js';
import { api, founderSetup, makeApp, playAsGuest, T0 } from './helpers.js';

const H = { 'x-runway': '1' };
const tokenOf = (link: string) => new URL(link).searchParams.get('signin')!;

describe('emails', () => {
  it('normalises addresses', () => {
    expect(normaliseEmail('  Ada@Example.COM ')).toBe('ada@example.com');
    expect(normaliseEmail('nope')).toBeNull();
    expect(normaliseEmail('a@b')).toBeNull();
    expect(normaliseEmail('a b@c.d')).toBeNull();
    expect(normaliseEmail('a<b>@c.d')).toBeNull();
  });

  it('picks Resend, then SMTP, then the dev logger', () => {
    const log = () => {};
    expect(
      emailProviderFrom({ RESEND_API_KEY: 'k', EMAIL_FROM: 'R <r@x.io>' }, log),
    ).toBeInstanceOf(ResendEmailProvider);
    expect(
      emailProviderFrom({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'me@gmail.com' }, log),
    ).toBeInstanceOf(SmtpEmailProvider);
    const dev = emailProviderFrom({}, log);
    expect(dev).toBeInstanceOf(DevEmailProvider);
    expect(dev.real).toBe(false);
  });

  it('sends through Resend’s API', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const p = new ResendEmailProvider('key-1', 'Runway <r@x.io>', (async (
      url: string,
      init: RequestInit,
    ) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    }) as typeof fetch);
    await p.send(signInEmail('a@x.io', 'https://r.io/?signin=abc', 'login', 'en'));
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer key-1');
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({
      from: 'Runway <r@x.io>',
      to: ['a@x.io'],
      subject: 'Your Runway sign-in link',
    });
  });

  it('writes a plain sign-in email in English or French', () => {
    const en = signInEmail('a@x.io', 'https://r.io/?signin=abc', 'save', 'en');
    expect(en.subject).toBe('Your Runway sign-in link');
    expect(en.text).toContain('https://r.io/?signin=abc');
    expect(en.text).toContain('expires in 15 minutes');
    expect(en.text).toContain('If this wasn’t you');
    expect(en.html).toContain('href="https://r.io/?signin=abc"');
    const fr = signInEmail('a@x.io', 'https://r.io/?signin=abc', 'login', 'fr');
    expect(fr.subject).toBe('Votre lien de connexion Runway');
    expect(fr.text).toContain('15 minutes');
  });

  it('knows which addresses can never receive mail', () => {
    expect(isReservedAddress('e2e-abc@example.com')).toBe(true);
    expect(isReservedAddress('x@runway.test')).toBe(true);
    expect(isReservedAddress('someone@gmail.com')).toBe(false);
  });
});

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

describe.each(stores)('account store: %s', (_name, make) => {
  it('creates guests, sets an email once per account, and forgets it on delete', async () => {
    const { store, kv } = make();
    await store.createGuestUser('u_a', T0);
    await store.createGuestUser('u_b', T0);
    expect(await store.getAccount('u_a')).toEqual({ guest: true, email: null });
    expect(await store.findUserByEmail('ada@example.com')).toBeUndefined();

    expect(await store.setEmail('u_a', 'ada@example.com')).toBe(true);
    expect(await store.getAccount('u_a')).toEqual({ guest: false, email: 'ada@example.com' });
    expect(await store.findUserByEmail('ada@example.com')).toEqual({ id: 'u_a' });
    // Someone else can't take it; the owner setting it again is fine.
    expect(await store.setEmail('u_b', 'ada@example.com')).toBe(false);
    expect((await store.getAccount('u_b'))!.guest).toBe(true);
    expect(await store.setEmail('u_a', 'ada@example.com')).toBe(true);

    // Changing email frees the old one.
    expect(await store.setEmail('u_a', 'ada2@example.com')).toBe(true);
    expect(await store.findUserByEmail('ada@example.com')).toBeUndefined();
    expect(await store.setEmail('u_b', 'ada@example.com')).toBe(true);

    await store.deleteUser('u_a', T0);
    expect(await store.getAccount('u_a')).toBeUndefined();
    expect(await store.findUserByEmail('ada2@example.com')).toBeUndefined();
    if (kv) expect((await kv.list('email/')).length).toBe(1);
    // A deleted account's email is free again.
    await store.createGuestUser('u_c', T0);
    expect(await store.setEmail('u_c', 'ada2@example.com')).toBe(true);
  });

  it('refuses an email for an unknown account', async () => {
    const { store, kv } = make();
    expect(await store.setEmail('u_nobody', 'x@example.com')).toBe(false);
    if (kv) expect(await kv.list('email/')).toEqual([]);
    expect(await store.findUserByEmail('x@example.com')).toBeUndefined();
  });

  it('takes sign-in tokens once, and never after they expire', async () => {
    const { store } = make();
    const row = {
      email: 'a@example.com',
      intent: 'login' as const,
      userId: null,
      expiresAt: T0 + 1000,
    };
    await store.putEmailToken('h1', row);
    await store.putEmailToken('h2', { ...row, expiresAt: T0 - 1 });
    expect(await store.takeEmailToken('h1', T0)).toEqual(row);
    expect(await store.takeEmailToken('h1', T0)).toBeUndefined();
    expect(await store.takeEmailToken('h2', T0)).toBeUndefined();
    expect(await store.takeEmailToken('nope', T0)).toBeUndefined();
  });
});

// Loosely typed on purpose: tests read whatever the server answered.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = { status: number; json: { [k: string]: any } | null };
type Call = ((
  method: string,
  path: string,
  body?: unknown,
  opts?: { csrf?: boolean },
) => Promise<Res>) & { cookie: () => string; setCookie: (c: string) => void };

/** A cookie-keeping client over the long-running server. */
function fastifyClient(app: FastifyInstance): Call {
  let cookie = '';
  const call = (async (method, path, body, opts) => {
    const res = await app.inject({
      method: method as 'GET',
      url: path,
      headers: { ...(opts?.csrf === false ? {} : H), ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { payload: body as object }),
    });
    const set = res.cookies.find((c) => c.name === 'rw_session');
    if (set) cookie = set.value ? `rw_session=${set.value}` : '';
    return { status: res.statusCode, json: res.body ? res.json() : null };
  }) as Call;
  call.cookie = () => cookie;
  call.setCookie = (c) => (cookie = c);
  return call;
}

/** The same over the serverless handler, on a fresh key-value store. */
async function kvClient() {
  const kv = new MemoryKv();
  const rt = await createRuntime(kv, await configFor(kv, 'preview'));
  const client = (): Call => {
    let cookie = '';
    const call = (async (method, path, body, opts) => {
      const res = await handle(
        rt,
        new Request(`https://deploy-preview-9--runway.netlify.app${path}`, {
          method,
          headers: {
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(opts?.csrf === false ? {} : H),
            ...(cookie ? { cookie } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        '203.0.113.9',
      );
      const set = res.headers.getSetCookie().find((c) => c.startsWith('rw_session='));
      if (set) {
        const v = set.split(';')[0]!;
        cookie = v === 'rw_session=' ? '' : v;
      }
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : null };
    }) as Call;
    call.cookie = () => cookie;
    call.setCookie = (c) => (cookie = c);
    return call;
  };
  return { client, kv };
}

const hosts: [string, () => Promise<{ client: () => Call; kv?: MemoryKv }>][] = [
  [
    'server',
    async () => {
      const { app } = await makeApp();
      return { client: () => fastifyClient(app) };
    },
  ],
  ['serverless', async () => kvClient()],
];

/** Ask for a link and open it with the same client. */
async function useLink(call: Call, email: string, intent: 'login' | 'save') {
  const asked = await call('POST', '/api/auth/email', { email, intent });
  expect(asked.status).toBe(200);
  return call('POST', '/api/auth/email/verify', { token: tokenOf(asked.json!.devLink) });
}

describe.each(hosts)('guest play and email sign-in (%s)', (_name, make) => {
  it('needs adult:true and the CSRF header to play as a guest', async () => {
    const call = (await make()).client();
    expect((await call('POST', '/api/auth/guest', {})).status).toBe(400);
    expect((await call('POST', '/api/auth/guest', { adult: false })).status).toBe(400);
    expect((await call('POST', '/api/auth/guest', { adult: 'yes' })).status).toBe(400);
    const csrf = await call('POST', '/api/auth/guest', { adult: true }, { csrf: false });
    expect(csrf.status).toBe(403);
    expect((await call('GET', '/api/state')).status).toBe(401);
    const ok = await call('POST', '/api/auth/guest', { adult: true });
    expect(ok).toEqual({ status: 200, json: { ok: true, guest: true } });
    expect((await call('GET', '/api/state')).json).toEqual({
      onboarded: false,
      account: { guest: true, email: null },
    });
  });

  it('saves a guest with an email link, keeps their player, and logs back in by email', async () => {
    const { client, kv } = await make();
    const call = client();
    await call('POST', '/api/auth/guest', { adult: true });
    const created = await call('POST', '/api/commands', { command: founderSetup('guest_one') });
    expect(created.status).toBe(200);
    const playerId = (await call('GET', '/api/state')).json!.view.me.id;

    // Asking needs the CSRF header and a real address.
    const body = { email: '  Guest.One@Example.com ', intent: 'save' };
    expect((await call('POST', '/api/auth/email', body, { csrf: false })).status).toBe(403);
    const badEmail = await call('POST', '/api/auth/email', { ...body, email: 'nope' });
    expect(badEmail.status).toBe(400);
    const asked = await call('POST', '/api/auth/email', body);
    expect(asked.status).toBe(200);
    expect(asked.json).toMatchObject({ ok: true, sent: true });
    expect(asked.json!.devLink).toMatch(/\/\?signin=[\w-]{43}$/);
    // Not saved until the link is opened.
    expect((await call('GET', '/api/state')).json!.account).toEqual({ guest: true, email: null });
    const token = tokenOf(asked.json!.devLink);
    const opened = await call('POST', '/api/auth/email/verify', { token });
    expect(opened).toEqual({
      status: 200,
      json: {
        ok: true,
        intent: 'save',
        isNew: false,
        account: { guest: false, email: 'guest.one@example.com' },
      },
    });
    const state = (await call('GET', '/api/state')).json!;
    expect(state.account).toEqual({ guest: false, email: 'guest.one@example.com' });
    expect(state.view.me.id).toBe(playerId);
    if (kv) expect((await kv.list('email/')).length).toBe(1);
    // Single use.
    const again = await call('POST', '/api/auth/email/verify', { token });
    expect(again.status).toBe(400);
    expect(again.json!.error.code).toBe('link.bad');

    // Sign out, then back in on another device by email: same player.
    expect((await call('POST', '/api/auth/logout', {})).status).toBe(200);
    expect((await call('GET', '/api/state')).status).toBe(401);
    const other = client();
    const login = await useLink(other, 'GUEST.ONE@example.com', 'login');
    expect(login.json).toMatchObject({ ok: true, intent: 'login', isNew: false });
    const back = (await other('GET', '/api/state')).json!;
    expect(back.view.me.id).toBe(playerId);
    expect(back.view.me.handle).toBe('guest_one');
    expect(back.account).toEqual({ guest: false, email: 'guest.one@example.com' });

    // Deleting the account frees the email and removes its key.
    expect((await other('DELETE', '/api/account')).status).toBe(200);
    if (kv) expect(await kv.list('email/')).toEqual([]);
    const fresh = await useLink(client(), 'guest.one@example.com', 'login');
    expect(fresh.json).toMatchObject({ ok: true, isNew: true });
  });

  it('answers the same whether or not an email has an account', async () => {
    const { client } = await make();
    const a = client();
    await a('POST', '/api/auth/guest', { adult: true });
    await useLink(a, 'known@example.com', 'save');
    const b = client();
    const known = await b('POST', '/api/auth/email', {
      email: 'known@example.com',
      intent: 'login',
    });
    const unknown = await b('POST', '/api/auth/email', {
      email: 'unknown@example.com',
      intent: 'login',
    });
    expect(known.status).toBe(unknown.status);
    expect(Object.keys(known.json!).sort()).toEqual(Object.keys(unknown.json!).sort());
  });

  it('never gives a saved email to a second account (409, suggests logging in)', async () => {
    const { client } = await make();
    const a = client();
    await a('POST', '/api/auth/guest', { adult: true });
    await a('POST', '/api/commands', { command: founderSetup('first_one') });
    expect((await useLink(a, 'taken@example.com', 'save')).status).toBe(200);
    const b = client();
    await b('POST', '/api/auth/guest', { adult: true });
    const dup = await useLink(b, 'taken@example.com', 'save');
    expect(dup.status).toBe(409);
    expect(dup.json!.error).toEqual({
      code: 'email.taken',
      message: 'That email already has a saved game. Log in with it instead.',
    });
    expect((await b('GET', '/api/state')).json!.account).toEqual({ guest: true, email: null });
    // Logging in with it opens the first account.
    await useLink(b, 'taken@example.com', 'login');
    expect((await b('GET', '/api/state')).json!.view.me.handle).toBe('first_one');
  });

  it('login with a new email from a guest saves that guest', async () => {
    const { client } = await make();
    const a = client();
    await a('POST', '/api/auth/guest', { adult: true });
    await a('POST', '/api/commands', { command: founderSetup('saved_by_login') });
    const r = await useLink(a, 'newbie@example.com', 'login');
    expect(r.json).toMatchObject({ ok: true, isNew: false });
    const s = (await a('GET', '/api/state')).json!;
    expect(s.view.me.handle).toBe('saved_by_login');
    expect(s.account.email).toBe('newbie@example.com');
  });

  it('needs a session to save, and lets a guest log out', async () => {
    const call = (await make()).client();
    const anon = await call('POST', '/api/auth/email', { email: 'a@example.com', intent: 'save' });
    expect(anon.status).toBe(401);
    await call('POST', '/api/auth/guest', { adult: true });
    expect((await call('POST', '/api/auth/logout', {})).status).toBe(200);
    expect((await call('GET', '/api/state')).status).toBe(401);
  });

  it('refuses bad tokens with a clear message', async () => {
    const call = (await make()).client();
    const r = await call('POST', '/api/auth/email/verify', { token: 'x'.repeat(43) });
    expect(r.status).toBe(400);
    expect(r.json!.error.message).toMatch(/expired or was already used/);
    const csrf = await call('POST', '/api/auth/email/verify', { token: 'x' }, { csrf: false });
    expect(csrf.status).toBe(403);
  });
});

describe('sign-in links: expiry, limits, providers', () => {
  it('expire after 15 minutes', async () => {
    let t = T0;
    const { app } = await makeApp({ now: () => t });
    const c = fastifyClient(app);
    const asked = await c('POST', '/api/auth/email', {
      email: 'late@example.com',
      intent: 'login',
    });
    t += 15 * 60_000 + 1;
    const r = await c('POST', '/api/auth/email/verify', { token: tokenOf(asked.json!.devLink) });
    expect(r.status).toBe(400);
  });

  it('limits links per email', async () => {
    const { app } = await makeApp();
    const c = fastifyClient(app);
    const ask = (email: string) => c('POST', '/api/auth/email', { email, intent: 'login' });
    for (let i = 0; i < 5; i++) expect((await ask('busy@example.com')).status).toBe(200);
    expect((await ask('busy@example.com')).status).toBe(429);
    expect((await ask('calm@example.com')).status).toBe(200);
  });

  it('limits links and new guests per address', async () => {
    const { app } = await makeApp();
    const c = fastifyClient(app);
    const links: number[] = [];
    for (let i = 0; i < 21; i++)
      links.push(
        (await c('POST', '/api/auth/email', { email: `p${i}@example.com`, intent: 'login' }))
          .status,
      );
    expect(links.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(links[20]).toBe(429);
    const guests: number[] = [];
    for (let i = 0; i < 31; i++)
      guests.push((await c('POST', '/api/auth/guest', { adult: true })).status);
    expect(guests.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(guests[30]).toBe(429);
  });

  it('production with no email provider says email sign-in is off; guest play still works', async () => {
    const { app } = await makeApp({ env: { NODE_ENV: 'production', DEV_TOOLS: '0' } });
    const c = fastifyClient(app);
    const r = await c('POST', '/api/auth/email', { email: 'a@gmail.com', intent: 'login' });
    expect(r).toEqual({
      status: 503,
      json: { error: { code: 'email.off', message: 'Email sign-in isn’t switched on yet.' } },
    });
    expect((await c('POST', '/api/auth/guest', { adult: true })).status).toBe(200);
  });

  it('production sends the link by email to PUBLIC_URL and never shows it', async () => {
    const sent: EmailMessage[] = [];
    const email = { real: true, send: async (m: EmailMessage) => void sent.push(m) };
    const { app } = await makeApp({
      env: {
        NODE_ENV: 'production',
        DEV_TOOLS: '0',
        SHOW_SIGNIN_CODE: '1',
        PUBLIC_URL: 'https://runway.example/',
      },
      email,
    });
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/email',
      headers: { ...H, host: 'evil.example' },
      payload: { email: 'Player@Gmail.com', intent: 'login', lang: 'fr' },
    });
    expect(r.json()).toEqual({ ok: true, sent: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('player@gmail.com');
    expect(sent[0]!.subject).toBe('Votre lien de connexion Runway');
    const link = /https:\/\/runway\.example\/\?signin=[\w-]+/.exec(sent[0]!.text)![0];
    const v = await app.inject({
      method: 'POST',
      url: '/api/auth/email/verify',
      headers: H,
      payload: { token: tokenOf(link) },
    });
    expect(v.statusCode).toBe(200);
    expect(v.cookies.find((x) => x.name === 'rw_session')?.secure).toBe(true);
    // Reserved test domains never get real mail.
    await app.inject({
      method: 'POST',
      url: '/api/auth/email',
      headers: H,
      payload: { email: 'bot@example.com', intent: 'login' },
    });
    expect(sent).toHaveLength(1);
  });

  it('production without PUBLIC_URL refuses rather than trusting the Host header', async () => {
    const email = { real: true, send: async () => {} };
    const { app } = await makeApp({ env: { NODE_ENV: 'production', DEV_TOOLS: '0' }, email });
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/email',
      headers: H,
      payload: { email: 'a@gmail.com', intent: 'login' },
    });
    expect(r.statusCode).toBe(503);
  });

  it('a failed send is reported, not hidden', async () => {
    const email = {
      real: true,
      send: async () => {
        throw new Error('smtp down');
      },
    };
    const { app } = await makeApp({ env: { PUBLIC_URL: 'https://r.example' }, email });
    const c = fastifyClient(app);
    const r = await c('POST', '/api/auth/email', { email: 'a@gmail.com', intent: 'login' });
    expect(r.status).toBe(502);
    expect(r.json!.error.code).toBe('email.failed');
  });

  it('serverless previews build links from the preview address', async () => {
    const { client } = await kvClient();
    const c = client();
    const r = await c('POST', '/api/auth/email', { email: 'p@example.com', intent: 'login' });
    expect(r.json!.devLink).toMatch(/^https:\/\/deploy-preview-9--runway\.netlify\.app\/\?signin=/);
  });

  it('netlify production links point at the site URL', async () => {
    const before = process.env.URL;
    process.env.URL = 'https://runway.netlify.app';
    try {
      const prod = await configFor(new MemoryKv(), 'production');
      expect(prod.PUBLIC_URL).toBe('https://runway.netlify.app');
      expect((await configFor(new MemoryKv(), 'preview')).PUBLIC_URL).toBe('');
    } finally {
      if (before === undefined) delete process.env.URL;
      else process.env.URL = before;
    }
  });
});

describe('guest accounts and the world', () => {
  it('a guest plays and is anonymised on delete', async () => {
    const { app, game } = await makeApp();
    const s = api(app, await playAsGuest(app));
    expect((await s.command(founderSetup('guest_two'))).statusCode).toBe(200);
    const id = Object.values(game.current.players).find((p) => p.handle === 'guest_two')!.id;
    expect((await s.del('/api/account')).statusCode).toBe(200);
    expect(game.current.players[id]?.handle).not.toBe('guest_two');
  });
});
