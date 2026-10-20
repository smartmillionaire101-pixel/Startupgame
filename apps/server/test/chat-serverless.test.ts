/**
 * Chat as it runs on Netlify: two function instances sharing one key-value
 * store, nothing streamed (clients poll), and no work allowed after a
 * response. A player's message reaches the other player; AI characters,
 * programmes included, answer within the request; a message whose request
 * was cut off gets its answer when the thread is next read, once.
 */
import { describe, expect, it } from 'vitest';
import { KvAccountStore } from '../src/serverless/kv-accounts.js';
import { MemoryKv } from '../src/serverless/kv.js';
import { configFor, createRuntime, handle } from '../src/serverless/netlify.js';
import { AI_REPLY_LATE_MS } from '../src/ai-claude.js';
import { founderSetup } from './helpers.js';

type Runtime = Awaited<ReturnType<typeof createRuntime>>;

/** A player whose requests land on the given instances in turn. */
function client(instances: Runtime[]) {
  let cookie = '';
  let n = 0;
  const call = async (method: string, path: string, body?: unknown) => {
    const rt = instances[n++ % instances.length]!;
    const res = await handle(
      rt,
      new Request(`https://deploy-preview-9--runway.test${path}`, {
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
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  return { call };
}

async function world() {
  const kv = new MemoryKv();
  const config = await configFor(kv, 'preview');
  const one = await createRuntime(kv, config);
  const two = await createRuntime(kv, config);
  const player = async (handle: string, instances: Runtime[]) => {
    const c = client(instances);
    expect((await c.call('POST', '/api/auth/guest', { adult: true })).status).toBe(200);
    expect((await c.call('POST', '/api/commands', { command: founderSetup(handle) })).status).toBe(
      200,
    );
    const view = (await c.call('GET', '/api/state')).json.view;
    return { ...c, id: view.me.id as string, view };
  };
  return { kv, one, two, player };
}

describe('chat on a serverless host', () => {
  it('a message sent through one instance reaches the other player through another', async () => {
    const { one, two, player } = await world();
    const a = await player('sl_ada', [one, two]);
    const b = await player('sl_bola', [two, one]);
    expect((await b.call('GET', '/api/events')).status).toBe(204);

    const sent = await a.call('POST', '/api/chats', { playerId: b.id, text: 'Hello Bola' });
    expect(sent.status).toBe(200);
    for (let i = 0; i < 2; i++) {
      // Whichever instance answers, B's list has it, unread (not B's own).
      const list = await b.call('GET', '/api/chats');
      expect(list.json.chats).toHaveLength(1);
      expect(list.json.chats[0]).toMatchObject({
        id: sent.json.chat.id,
        with: { id: a.id },
        lastText: 'Hello Bola',
        lastMine: false,
      });
    }
    const thread = await b.call('GET', `/api/chats/${sent.json.chat.id}/messages`);
    expect(
      thread.json.messages.map((m: { text: string; mine: boolean }) => [m.text, m.mine]),
    ).toEqual([['Hello Bola', false]]);
    // B answers; A, on the other instance, sees it.
    expect(
      (await b.call('POST', `/api/chats/${sent.json.chat.id}/messages`, { text: 'Hi Ada!' }))
        .status,
    ).toBe(200);
    const back = await a.call('GET', `/api/chats/${sent.json.chat.id}/messages`);
    expect(back.json.messages.map((m: { text: string }) => m.text)).toEqual([
      'Hello Bola',
      'Hi Ada!',
    ]);
  });

  it('AI characters answer in the request, programmes and LPs included', async () => {
    const { one, two, player } = await world();
    const a = await player('sl_amara', [one, two]);
    const city = a.view.market as Record<string, { id: string }[]>;
    const ids = [
      `fund:${a.view.market.funds.find((f: { ai: boolean }) => f.ai).id}`,
      `acc:${city.accelerators![0]!.id}`,
      `dp:${city.devPartners![0]!.id}`,
      `lp:${city.lps![0]!.id}`,
    ];
    for (const characterId of ids) {
      const opened = await a.call('GET', `/api/ai-chat/${encodeURIComponent(characterId)}`);
      expect(opened.status, characterId).toBe(200);
      expect(opened.json.thread.available).toBe(true);
      const r = await a.call('POST', '/api/ai-chat', { characterId, text: 'Any advice?' });
      expect(r.status, characterId).toBe(200);
      expect(r.json.reply.text.length).toBeGreaterThan(0);
      const read = await a.call('GET', `/api/ai-chat/${encodeURIComponent(characterId)}`);
      expect(read.json.messages.map((m: { mine: boolean }) => m.mine)).toEqual([true, false]);
    }
  });

  it('a message whose request was cut off is answered when the thread is read, once', async () => {
    const { kv, one, two, player } = await world();
    const a = await player('sl_kemi', [one, two]);
    const fund = a.view.market.funds.find((f: { ai: boolean }) => f.ai);
    const characterId = `fund:${fund.id}`;
    // The function stopped after keeping the message, before the answer.
    const store = new KvAccountStore(kv);
    const at = Date.now();
    await store.addAiMessage(a.id, characterId, fund.partner, false, 'Are you investing?', at);

    // Too soon to tell it from a send still in progress: nothing yet.
    const early = await a.call('GET', `/api/ai-chat/${characterId}`);
    expect(early.json.messages.map((m: { mine: boolean }) => m.mine)).toEqual([true]);

    const realNow = Date.now;
    try {
      Date.now = () => at + AI_REPLY_LATE_MS + 1;
      const late = await a.call('GET', `/api/ai-chat/${characterId}`);
      expect(late.json.messages.map((m: { mine: boolean }) => m.mine)).toEqual([true, false]);
      expect(late.json.thread.unread).toBe(0);
      const again = await a.call('GET', `/api/ai-chat/${characterId}`);
      expect(again.json.messages).toHaveLength(2);
    } finally {
      Date.now = realNow;
    }
  });

  it('sending the same unanswered message again (a retry) answers it without a copy', async () => {
    const { kv, one, two, player } = await world();
    const a = await player('sl_tobi', [one, two]);
    const fund = a.view.market.funds.find((f: { ai: boolean }) => f.ai);
    const characterId = `fund:${fund.id}`;
    const store = new KvAccountStore(kv);
    await store.addAiMessage(a.id, characterId, fund.partner, false, 'Hello!', Date.now());
    const r = await a.call('POST', '/api/ai-chat', { characterId, text: 'Hello!' });
    expect(r.status).toBe(200);
    const read = await a.call('GET', `/api/ai-chat/${characterId}`);
    expect(read.json.messages.map((m: { mine: boolean; text: string }) => m.mine)).toEqual([
      true,
      false,
    ]);
    // Once answered, the same words are a new message.
    await a.call('POST', '/api/ai-chat', { characterId, text: 'Hello!' });
    expect((await a.call('GET', `/api/ai-chat/${characterId}`)).json.messages).toHaveLength(4);
  });
});
