import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../src/store/sqlite.js';
import { KvAccountStore } from '../src/serverless/kv-accounts.js';
import { MemoryKv } from '../src/serverless/kv.js';
import type { EmailMessage } from '../src/adapters/email.js';
import { T0, api, makeApp, playAsGuest, founderSetup } from './helpers.js';

const ADMIN = { authorization: 'Bearer admin-token-123' };
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

describe.each(['SQLite', 'serverless'])('notes store (%s)', (kind) => {
  it('lists the newest first and keeps only the newest of each kind', async () => {
    const store = kind === 'SQLite' ? new Store(':memory:') : new KvAccountStore(new MemoryKv());
    if (store instanceof Store) cleanup.push(() => store.close());
    for (let i = 0; i < 5; i++)
      await store.addFeedback(
        {
          id: `p${i}`,
          kind: 'player',
          user_id: 'u1',
          text: `note ${i}`,
          context: { screen: 'city' },
          created_at: T0 + i,
        },
        3,
      );
    await store.addFeedback(
      { id: 'c0', kind: 'client', user_id: null, text: 'crash', context: {}, created_at: T0 },
      3,
    );
    const player = await store.recentFeedback('player', 10);
    expect(player.map((r) => r.text)).toEqual(['note 4', 'note 3', 'note 2']);
    expect(player[0]!.context).toEqual({ screen: 'city' });
    expect((await store.recentFeedback('client', 10)).map((r) => r.text)).toEqual(['crash']);
    expect(await store.recentFeedback('server', 10)).toEqual([]);
  });
});

it('takes a player’s feedback with where they were and shows it on the admin dashboard', async () => {
  const { app } = await fixture();
  const cookie = await playAsGuest(app);
  const user = api(app, cookie);
  await user.command(founderSetup('feedback_founder'));
  expect((await user.post('/api/feedback', { topic: 'bug', text: 'x' })).statusCode).toBe(400);
  const sent = await user.post('/api/feedback', {
    topic: 'bug',
    text: 'The discovery meeting said something went wrong.',
    context: { screen: 'city', lastError: 'Something went wrong. (1 min ago)' },
  });
  expect(sent.statusCode).toBe(200);
  // Signed out: no feedback (the dashboard needs to know who wrote it).
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/feedback',
        headers: { 'x-runway': '1' },
        payload: { topic: 'idea', text: 'hello there' },
      })
    ).statusCode,
  ).toBe(401);
  expect((await app.inject('/api/admin/feedback')).statusCode).toBe(401);
  const r = await app.inject({ url: '/api/admin/feedback', headers: ADMIN });
  expect(r.statusCode).toBe(200);
  const { feedback } = r.json() as {
    feedback: { text: string; player: string; context: Record<string, string> }[];
  };
  expect(feedback).toHaveLength(1);
  expect(feedback[0]).toMatchObject({
    text: 'The discovery meeting said something went wrong.',
    context: { topic: 'bug', screen: 'city', lastError: 'Something went wrong. (1 min ago)' },
  });
  expect(feedback[0]!.player).toBeTruthy();
  expect(feedback[0]!.context.city).toBeTruthy();
});

it('limits how much feedback one player sends at once', async () => {
  const { app } = await fixture();
  const user = api(app, await playAsGuest(app));
  for (let i = 0; i < 5; i++)
    expect(
      (await user.post('/api/feedback', { topic: 'idea', text: `idea ${i}` })).statusCode,
    ).toBe(200);
  expect((await user.post('/api/feedback', { topic: 'idea', text: 'one more' })).statusCode).toBe(
    429,
  );
});

it('emails feedback to the admin accounts when email is on', async () => {
  const mail: EmailMessage[] = [];
  const { app } = await fixture({
    env: { ADMIN_EMAILS: 'owner@example.com' },
    email: { real: true, send: async (m) => void mail.push(m) },
  });
  const user = api(app, await playAsGuest(app));
  await user.post('/api/feedback', { topic: 'love', text: 'Great game <3' });
  await new Promise((r) => setTimeout(r, 0));
  expect(mail).toHaveLength(1);
  expect(mail[0]!.to).toBe('owner@example.com');
  expect(mail[0]!.subject).toContain('love');
  expect(mail[0]!.html).toContain('Great game &#60;3');
});

it('records crashes from phones once each, and requests the server fails', async () => {
  const { app } = await fixture();
  app.get('/api/test-boom', async () => {
    throw new Error('Blob store unavailable');
  });
  const user = api(app, await playAsGuest(app));
  const crash = {
    message: 'Cannot read properties of undefined',
    stack: 'at Sales',
    context: { screen: 'city' },
  };
  expect((await user.post('/api/client-errors', crash)).statusCode).toBe(200);
  expect((await user.post('/api/client-errors', crash)).statusCode).toBe(200);
  const boom = await app.inject({ url: '/api/test-boom?x=1' });
  expect(boom.statusCode).toBe(500);
  await new Promise((r) => setTimeout(r, 0));
  const { errors } = (await app.inject({ url: '/api/admin/feedback', headers: ADMIN })).json() as {
    errors: { kind: string; text: string; context: Record<string, string> }[];
  };
  expect(errors.filter((e) => e.kind === 'client')).toHaveLength(1);
  expect(errors.find((e) => e.kind === 'client')).toMatchObject({
    text: 'Cannot read properties of undefined',
    context: { screen: 'city' },
  });
  expect(errors.find((e) => e.kind === 'server')).toMatchObject({
    text: 'Blob store unavailable',
    context: { request: 'GET /api/test-boom' },
  });
});
