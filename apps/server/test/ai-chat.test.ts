/**
 * Wave 5 §C: chatting with AI characters. Both account stores, the replies
 * (live data, deterministic, never acting in the engine) and the HTTP routes
 * on the long-running server and the serverless handler.
 */
import { describe, expect, it } from 'vitest';
import { KvAccountStore } from '../src/serverless/kv-accounts.js';
import { MemoryKv } from '../src/serverless/kv.js';
import { configFor, createRuntime, handle } from '../src/serverless/netlify.js';
import { Store } from '../src/store/sqlite.js';
import type { AccountStore } from '../src/store/types.js';
import { aiReply, intentOf, money, resolveCharacter } from '../src/ai-chat.js';
import { T0, api, founderSetup, makeApp, playAsGuest } from './helpers.js';

const stores: [string, () => AccountStore][] = [
  ['SQLite', () => new Store(':memory:')],
  ['key-value', () => new KvAccountStore(new MemoryKv())],
];

describe.each(stores)('AI threads in the %s store', (_name, make) => {
  it('keeps threads per player, newest first, with unread counts', async () => {
    const store = make();
    await store.createUser('u1', 'h1', T0);
    await store.createUser('u2', 'h2', T0);
    const m1 = await store.addAiMessage('u1', 'fund:f1', 'Ada Partner', false, 'Hello', T0);
    const m2 = await store.addAiMessage('u1', 'fund:f1', 'Ada Partner', true, 'Hi there', T0 + 1);
    expect(m2.id).toBeGreaterThan(m1.id);
    expect(m2).toMatchObject({ fromAi: true, text: 'Hi there', at: T0 + 1 });
    await store.addAiMessage('u1', 'biz:b1', 'Mama T', false, 'Any jobs?', T0 + 2);
    await store.addAiMessage('u2', 'fund:f1', 'Ada Partner', false, 'Mine', T0 + 3);

    const threads = await store.aiThreads('u1');
    expect(threads.map((t) => t.characterId)).toEqual(['biz:b1', 'fund:f1']);
    expect(threads[1]).toMatchObject({
      name: 'Ada Partner',
      lastText: 'Hi there',
      lastFromAi: true,
      unread: 1,
      count: 2,
    });
    expect(threads[0]).toMatchObject({ unread: 0, lastFromAi: false, count: 1 });

    await store.markAiRead('u1', 'fund:f1');
    expect((await store.aiThread('u1', 'fund:f1'))?.unread).toBe(0);
    expect((await store.aiMessages('u1', 'fund:f1')).map((m) => [m.fromAi, m.text])).toEqual([
      [false, 'Hello'],
      [true, 'Hi there'],
    ]);
    expect((await store.aiMessages('u1', 'fund:f1', 1)).map((m) => m.text)).toEqual(['Hi there']);
    // Isolation: the other player sees only their own thread.
    expect((await store.aiThreads('u2')).map((t) => t.lastText)).toEqual(['Mine']);
    expect(await store.aiThread('u2', 'biz:b1')).toBeUndefined();
    expect(await store.aiMessages('u2', 'biz:b1')).toEqual([]);
  });

  it('deletes a player’s AI threads with their account', async () => {
    const store = make();
    await store.createUser('u1', 'h1', T0);
    await store.createUser('u2', 'h2', T0);
    await store.addAiMessage('u1', 'p_9', 'Tunde', false, 'Hi', T0);
    await store.addAiMessage('u2', 'p_9', 'Tunde', false, 'Hi too', T0);
    await store.deleteUser('u1', T0 + 10);
    expect(await store.aiThreads('u1')).toEqual([]);
    expect(await store.aiMessages('u1', 'p_9')).toEqual([]);
    expect(await store.aiThreads('u2')).toHaveLength(1);
  });
});

describe('AI replies', () => {
  it('reads what a message is about, in English and French', () => {
    expect(intentOf('Hello!')).toBe('greet');
    expect(intentOf('What do you invest in?')).toBe('invest');
    expect(intentOf('Any jobs going?')).toBe('work');
    expect(intentOf('What do you need to buy?')).toBe('needs');
    expect(intentOf('Can we meet for coffee?')).toBe('meet');
    expect(intentOf('Un conseil ?')).toBe('advice');
    expect(intentOf('On se voit pour un café ?')).toBe('meet');
    expect(intentOf('Merci')).toBe('thanks');
  });

  it('formats short amounts', () => {
    expect(money(250_000_000, 'NGN')).toBe('₦2.5m');
    expect(money(4_000_000, 'GBP')).toBe('£40k');
    expect(money(250_000_000, 'NGN', 'fr')).toBe('₦2,5 M');
  });

  it('answers from live data, deterministically, without touching the world', async () => {
    const { app, game } = await makeApp();
    const s = api(app, await playAsGuest(app));
    await s.command(founderSetup('ai_chatter'));
    const world = game.current;
    const me = Object.values(world.players).find((p) => p.handle === 'ai_chatter')!;
    const fund = Object.values(world.funds).find(
      (f) => f.ai && !f.angelId && f.market === 'lagos',
    )!;
    const ch = resolveCharacter(world, `fund:${fund.id}`)!;
    expect(ch).toMatchObject({ kind: 'partner', name: fund.partner, org: fund.name });
    const version = world.version;
    const a = aiReply(world, me, ch, 'What do you invest in?', 1);
    expect(a).toBe(aiReply(world, me, ch, 'What do you invest in?', 1));
    expect(a).toMatch(/cheques of/);
    const fr = aiReply(world, me, ch, 'Vous investissez dans quoi ?', 1, 'fr');
    expect(fr).toMatch(/tickets de/);
    // Varied over the thread.
    const replies = new Set(
      Array.from({ length: 8 }, (_, n) => aiReply(world, me, ch, 'Tell me more', n)),
    );
    expect(replies.size).toBeGreaterThan(1);
    expect(game.current.version).toBe(version);

    // Business owners know what they sell and buy; founders their numbers.
    const biz = Object.values(world.markets.lagos!.businesses ?? {})[0];
    if (biz) {
      const owner = resolveCharacter(world, `biz:${biz.id}`)!;
      expect(owner).toMatchObject({ kind: 'owner', name: biz.owner.name, place: `biz:${biz.id}` });
      expect(aiReply(world, me, owner, 'Hi', 1)).toContain(biz.name);
    }
    const founder = Object.values(world.players).find(
      (p) => p.ai && !p.angel && p.companyIds.length,
    )!;
    const fc = resolveCharacter(world, founder.id)!;
    expect(fc.kind).toBe('founder');
    expect(aiReply(world, me, fc, 'How are your numbers?', 3)).toMatch(/customers|team of/);
    const angel = Object.values(world.players).find((p) => p.ai && p.angel);
    if (angel) expect(resolveCharacter(world, angel.id)?.kind).toBe('angel');

    // Humans and unknown ids are not AI characters.
    expect(resolveCharacter(world, me.id)).toBeNull();
    expect(resolveCharacter(world, 'fund:nope')).toBeNull();
    expect(resolveCharacter(world, 'lp:nope')).toBeNull();
    expect(resolveCharacter(world, 'zzz:1')).toBeNull();
  });
});

describe('AI chat routes', () => {
  it('posts, replies, lists and reads threads, privately per player', async () => {
    const { app, game } = await makeApp();
    const a = api(app, await playAsGuest(app));
    const b = api(app, await playAsGuest(app));
    expect((await a.post('/api/ai-chat', { characterId: 'fund:x', text: 'hi' })).statusCode).toBe(
      404,
    );
    await a.command(founderSetup('ada_route'));
    await b.command(founderSetup('bola_route'));
    const fund = Object.values(game.current.funds).find(
      (f) => f.ai && !f.angelId && f.market === 'lagos',
    )!;
    const characterId = `fund:${fund.id}`;

    const r = await a.post('/api/ai-chat', { characterId, text: 'Hello! What do you invest in?' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.reply.mine).toBe(false);
    expect(body.reply.text.length).toBeGreaterThan(10);
    expect(body.thread).toMatchObject({
      characterId,
      name: fund.partner,
      kind: 'partner',
      org: fund.name,
      place: characterId,
      available: true,
      unread: 0,
      count: 2,
    });

    const list = (await a.get('/api/ai-chat')).json();
    expect(list.threads).toHaveLength(1);
    expect(list.threads[0]).toMatchObject({ characterId, lastText: body.reply.text });
    const thread = (await a.get(`/api/ai-chat/${encodeURIComponent(characterId)}`)).json();
    expect(thread.messages.map((m: { mine: boolean }) => m.mine)).toEqual([true, false]);

    // Someone else's view: no thread, but the character exists.
    expect((await b.get('/api/ai-chat')).json().threads).toEqual([]);
    const empty = await b.get(`/api/ai-chat/${encodeURIComponent(characterId)}`);
    expect(empty.statusCode).toBe(200);
    expect(empty.json().messages).toEqual([]);

    // Contact details are filtered like player chats; humans aren't AI characters.
    expect(
      (await a.post('/api/ai-chat', { characterId, text: 'Call me on +234 803 123 4567' }))
        .statusCode,
    ).toBe(400);
    const bId = (await b.get('/api/state')).json().view.me.id;
    expect((await a.post('/api/ai-chat', { characterId: bId, text: 'hi' })).statusCode).toBe(404);
    expect((await a.get('/api/ai-chat/not%20valid')).statusCode).toBe(404);

    // French replies when asked.
    const fr = await a.post('/api/ai-chat', {
      characterId,
      text: 'Vous investissez dans quoi ?',
      lang: 'fr',
    });
    expect(fr.json().reply.text).toMatch(/tickets/);

    // Needs the CSRF header.
    const noHeader = await app.inject({
      method: 'POST',
      url: '/api/ai-chat',
      headers: { cookie: (await playAsGuest(app)) as string },
      payload: { characterId, text: 'hi' },
    });
    expect(noHeader.statusCode).toBe(403);

    // Deleting the account deletes its AI threads.
    expect((await a.del('/api/account')).statusCode).toBe(200);
  });

  it('files an angel’s thread under the angel, whether asked by person or fund', async () => {
    const { app, game } = await makeApp();
    const s = api(app, await playAsGuest(app));
    await s.command(founderSetup('angel_asker'));
    const angel = Object.values(game.current.players).find((p) => p.ai && p.angel);
    if (!angel) return;
    const viaFund = await s.post('/api/ai-chat', {
      characterId: `fund:${angel.angel!.fundId}`,
      text: 'Can we meet for lunch?',
    });
    expect(viaFund.json().thread).toMatchObject({ characterId: angel.id, kind: 'angel' });
    const read = (
      await s.get(`/api/ai-chat/${encodeURIComponent(`fund:${angel.angel!.fundId}`)}`)
    ).json();
    expect(read.thread.characterId).toBe(angel.id);
    expect(read.messages).toHaveLength(2);
  });

  it('tells the phone who wrote the last player-chat message', async () => {
    const { app, game } = await makeApp();
    const a = api(app, await playAsGuest(app));
    const b = api(app, await playAsGuest(app));
    await a.command(founderSetup('ada_lastm'));
    await b.command(founderSetup('bola_lastm'));
    const bId = Object.values(game.current.players).find((p) => p.handle === 'bola_lastm')!.id;
    const starters = (await a.get(`/api/chats/starters/${bId}`)).json().starters as string[];
    await a.post('/api/chats', { playerId: bId, starter: starters[0] });
    expect((await a.get('/api/chats')).json().chats[0].lastMine).toBe(true);
    expect((await b.get('/api/chats')).json().chats[0].lastMine).toBe(false);
  });

  it('rate-limits each player', async () => {
    const { app, game } = await makeApp();
    const s = api(app, await playAsGuest(app));
    await s.command(founderSetup('ai_rate_x'));
    const fund = Object.values(game.current.funds).find((f) => f.ai && !f.angelId)!;
    const codes: number[] = [];
    for (let i = 0; i < 22; i++)
      codes.push(
        (await s.post('/api/ai-chat', { characterId: `fund:${fund.id}`, text: `hi ${i}` }))
          .statusCode,
      );
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  it('works through the serverless handler on a key-value store', async () => {
    const kv = new MemoryKv();
    const rt = await createRuntime(kv, await configFor(kv, 'preview'));
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
        '203.0.113.9',
      );
      const set = res.headers.getSetCookie().find((c) => c.startsWith('rw_session='));
      if (set) cookie = set.split(';')[0]!;
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : null };
    };
    expect((await call('POST', '/api/auth/guest', { adult: true })).status).toBe(200);
    expect(
      (await call('POST', '/api/commands', { command: founderSetup('kv_aichat') })).json,
    ).toMatchObject({ ok: true });
    const state = await call('GET', '/api/state');
    const partner = (
      state.json.view.market.funds as { id: string; ai: boolean; angel: unknown }[]
    ).find((f) => f.ai && !f.angel)!;
    const posted = await call('POST', '/api/ai-chat', {
      characterId: `fund:${partner.id}`,
      text: 'Any advice?',
    });
    expect(posted.status).toBe(200);
    expect(posted.json.thread.count).toBe(2);
    const threads = await call('GET', '/api/ai-chat');
    expect(threads.json.threads).toHaveLength(1);
    expect((await call('DELETE', '/api/account')).status).toBe(200);
    expect(await kv.list('ai/')).toEqual([]);
  });
});
