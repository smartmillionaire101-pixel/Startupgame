/**
 * Wave 6 §B2: AI characters that follow the conversation. The template path
 * (memory, follow-ups, no repeated lines, one greeting, the player's own
 * words), the regulars (`npc:<market>:<n>`), the thread memory and daily
 * budget in both stores, and the Claude path with the client mocked. No
 * network calls anywhere.
 */
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { Player, World } from '@runway/engine';
import { KvAccountStore } from '../src/serverless/kv-accounts.js';
import { MemoryKv } from '../src/serverless/kv.js';
import { Store } from '../src/store/sqlite.js';
import type { AccountStore } from '../src/store/types.js';
import {
  CHARACTER_ID,
  characterBlock,
  characterFacts,
  intentOf,
  isFollowUp,
  parseMemory,
  resolveCharacter,
  templateReply,
  type AiMemory,
  type Character,
  type Lang,
} from '../src/ai-chat.js';
import { FROZEN_RULES, claudeReply, toMessages, type AiClient } from '../src/ai-claude.js';
import { T0, api, founderSetup, makeApp, playAsGuest } from './helpers.js';

const sentences = (s: string) =>
  s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Plays a conversation through the templates, threading the memory as the server does. */
function converse(world: World, me: Player, ch: Character, texts: string[], lang: Lang = 'en') {
  let memory: AiMemory | undefined;
  const replies: string[] = [];
  const memories: AiMemory[] = [];
  texts.forEach((text, i) => {
    const r = templateReply(world, me, ch, text, { lang, n: i * 2 + 1, memory });
    memory = r.memory;
    replies.push(r.text);
    memories.push(r.memory);
  });
  return { replies, memories };
}

async function lagosWorld(handle: string) {
  const ctx = await makeApp();
  const s = api(ctx.app, await playAsGuest(ctx.app));
  await s.command(founderSetup(handle));
  const world = ctx.game.current;
  const me = Object.values(world.players).find((p) => p.handle === handle)!;
  const fund = Object.values(world.funds).find((f) => f.ai && !f.angelId && f.market === 'lagos')!;
  return { ...ctx, s, world, me, fund };
}

describe('templates that follow the conversation', () => {
  it('reads follow-ups', () => {
    for (const t of ['yes', 'Tell me more', 'How much?', 'when?', 'Where?', 'why?', 'ok'])
      expect(isFollowUp(t)).toBe(true);
    for (const t of ['Combien ?', 'Dites-m’en plus', 'Pourquoi ?', 'oui'])
      expect(isFollowUp(t)).toBe(true);
    expect(isFollowUp('What do you invest in?')).toBe(false);
    expect(isFollowUp('yes but can we meet for coffee next week?')).toBe(false);
    expect(intentOf('Tell me more')).toBe('other');
  });

  it('continues the topic with the next unused detail, and never repeats a line', async () => {
    const { world, me, fund } = await lagosWorld('conv_follow');
    const ch = resolveCharacter(world, `fund:${fund.id}`)!;
    const { replies, memories } = converse(world, me, ch, [
      'Hello!',
      'What do you invest in?',
      'Tell me more',
      'ok',
      'and?',
      'Any advice?',
      'more',
      'Can we meet?',
      'yes',
      'Tell me more',
      'Tell me more',
      'why?',
      'Thanks!',
      'Tell me more',
    ]);
    // Same inputs, same conversation.
    expect(converse(world, me, ch, ['Hello!', 'What do you invest in?']).replies).toEqual(
      replies.slice(0, 2),
    );
    // The investing question is answered from the investing facts (which line
    // comes first depends on the thread, and the company name is random).
    expect(memories[1]!.topic).toBe('invest');
    expect(replies[1]).toMatch(/cheques of|fits what we do/);
    // Follow-ups stay on investing and say something new from that topic.
    const invest = characterFacts(world, me, ch, 'en', null, memories[1]).invest;
    expect(memories[2]!.topic).toBe('invest');
    expect(invest).toContain(replies[2]);
    expect(replies[2]).not.toBe(replies[1]);
    expect(memories[2]!.lastIntent).toBe('other');
    // A meeting question changes topic; its follow-up stays there.
    expect(memories[7]!.topic).toBe('meet');
    expect(memories[8]!.topic).toBe('meet');
    // Not one sentence twice in the thread.
    const all = replies.flatMap(sentences);
    expect(new Set(all).size).toBe(all.length);
    // Every reply says something.
    for (const r of replies) expect(r.length).toBeGreaterThan(3);
  });

  it('greets only on the first message', async () => {
    const { world, me, fund } = await lagosWorld('conv_greet');
    const ch = resolveCharacter(world, `fund:${fund.id}`)!;
    const { replies } = converse(world, me, ch, ['Hi', 'Hello again', 'Good morning']);
    expect(replies[0]).toMatch(/^(Hi|Hey|Ah),? Ada/);
    expect(replies[1]).not.toMatch(/^(Hi|Hey|Ah)\b/);
    expect(replies[2]).not.toMatch(/^(Hi|Hey|Ah)\b/);
    expect(replies.join(' ').match(/\bAda\b/g)).toHaveLength(1);
    // A first message that isn't a greeting still gets one.
    expect(converse(world, me, ch, ['What do you invest in?']).replies[0]).toMatch(/Ada/);
  });

  it('picks up the player’s own words: company, amount, place', async () => {
    const { world, me, fund } = await lagosWorld('conv_words');
    const ch = resolveCharacter(world, `fund:${fund.id}`)!;
    const biz = Object.values(world.markets.lagos!.businesses ?? {})[0]!;
    const { replies, memories } = converse(world, me, ch, [
      'My startup is called Kola Pay.',
      'We want to raise ₦50m this year. Do you invest?',
      `Could we meet at ${biz.name}?`,
    ]);
    expect(replies[0]).toContain('Kola Pay');
    expect(replies[1]).toContain('₦50m');
    expect(replies[2]).toContain(biz.name);
    expect(memories[2]!.said).toEqual({ company: 'Kola Pay', amount: '₦50m', place: biz.name });
    // The player's own company, named in passing, counts too.
    const mine = world.companies[me.companyIds[0]!]!.name;
    expect(converse(world, me, ch, [`How is ${mine} doing for you?`]).replies[0]).toContain(mine);
  });

  it('follows in French too', async () => {
    const { world, me, fund } = await lagosWorld('conv_fr');
    const ch = resolveCharacter(world, `fund:${fund.id}`)!;
    const { replies, memories } = converse(
      world,
      me,
      ch,
      ['Bonjour !', 'Vous investissez dans quoi ?', 'Dites-m’en plus', 'Combien ?'],
      'fr',
    );
    expect(replies[0]).toMatch(/Ada/);
    // The cheque line comes once, whether with the greeting or the question.
    expect(replies.slice(0, 2).join(' ')).toMatch(/tickets de/);
    expect(replies.join(' ').match(/tickets de/g)).toHaveLength(1);
    expect(memories[3]!.topic).toBe('invest');
    const all = replies.flatMap(sentences);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps founders and owners on topic as well', async () => {
    const { world, me } = await lagosWorld('conv_others');
    const founder = Object.values(world.players).find(
      (p) => p.ai && !p.angel && p.companyIds.length,
    )!;
    const fc = resolveCharacter(world, founder.id)!;
    const f = converse(world, me, fc, ['How are your numbers?', 'Tell me more', 'and?']);
    expect(f.replies[0]).toMatch(/customers|team of/);
    expect(f.memories[2]!.topic).toBe('numbers');
    const biz = Object.values(world.markets.lagos!.businesses ?? {}).find(
      (b) => b.closedMonth === undefined,
    )!;
    const owner = resolveCharacter(world, `biz:${biz.id}`)!;
    const o = converse(world, me, owner, ['Hi', 'Who works here?', 'What do you sell?', 'more']);
    expect(o.replies[0]).toContain(biz.name);
    expect(o.replies[1]).toMatch(/team|hiring|shift|work/i);
    for (const thread of [f.replies, o.replies]) {
      const all = thread.flatMap(sentences);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('reads stored memory defensively', () => {
    expect(parseMemory(null)).toMatchObject({ turns: 0, topic: null, used: [] });
    expect(parseMemory({ topic: 'nonsense', used: ['x', 3], turns: -1 })).toMatchObject({
      topic: null,
      used: [3],
      turns: 0,
    });
  });
});

describe('regulars (npc:<market>:<n>)', () => {
  it('are stable people with a job and a neighbourhood', async () => {
    const { world, me } = await lagosWorld('conv_npc');
    expect(CHARACTER_ID.test('npc:lagos:3')).toBe(true);
    expect(CHARACTER_ID.test('npc:san-francisco:12')).toBe(true);
    expect(CHARACTER_ID.test('npc:lagos:x')).toBe(false);
    const a = resolveCharacter(world, 'npc:lagos:3')!;
    expect(a).toMatchObject({ id: 'npc:lagos:3', kind: 'regular', market: 'lagos' });
    expect(a.name.split(' ').length).toBeGreaterThanOrEqual(2);
    expect(a.role).toBeTruthy();
    expect(resolveCharacter(world, 'npc:lagos:3')).toEqual(a);
    expect(resolveCharacter(world, 'npc:atlantis:1')).toBeNull();
    // The city's own "who's here" entry wins when the view has it.
    const view = {
      market: {
        businesses: [
          {
            id: 'b1',
            people: [
              {
                id: 'npc:lagos:3',
                name: 'Ama Test',
                kind: 'regular',
                role: 'Nurse',
                gender: 'female',
              },
            ],
          },
        ],
      },
    };
    expect(resolveCharacter(world, 'npc:lagos:3', view)).toMatchObject({
      name: 'Ama Test',
      role: 'Nurse',
      place: 'biz:b1',
    });

    const { replies } = converse(world, me, a, [
      'Hi! What do you do?',
      'What do you think of the city?',
      'Tell me more',
      'Where should I eat?',
      'Any jobs around?',
    ]);
    expect(replies[0]).toContain(a.name.split(' ')[0]!);
    expect(replies[0]!.toLowerCase()).toContain(a.role!.toLowerCase());
    const all = replies.flatMap(sentences);
    expect(new Set(all).size).toBe(all.length);
    expect(characterBlock(world, me, a, 'en', null)).toContain(a.name);
  });

  it('chat through the route', async () => {
    const { s } = await lagosWorld('conv_npc_route');
    const r = await s.post('/api/ai-chat', { characterId: 'npc:lagos:7', text: 'Hi there' });
    expect(r.statusCode).toBe(200);
    expect(r.json().thread).toMatchObject({ characterId: 'npc:lagos:7', kind: 'regular' });
    const read = await s.get(`/api/ai-chat/${encodeURIComponent('npc:lagos:7')}`);
    expect(read.json().messages).toHaveLength(2);
    expect(
      (await s.post('/api/ai-chat', { characterId: 'npc:mars:1', text: 'hi' })).statusCode,
    ).toBe(404);
  });
});

const stores: [string, () => AccountStore][] = [
  ['SQLite', () => new Store(':memory:')],
  ['key-value', () => new KvAccountStore(new MemoryKv())],
];

describe.each(stores)('AI memory and budget in the %s store', (_name, make) => {
  it('keeps memory with the thread', async () => {
    const store = make();
    await store.createUser('u1', 'h1', T0);
    expect(await store.aiMemory('u1', 'fund:f1')).toBeUndefined();
    await store.setAiMemory('u1', 'fund:f1', { topic: 'invest' });
    expect(await store.aiMemory('u1', 'fund:f1')).toBeUndefined(); // no thread yet
    await store.addAiMessage('u1', 'fund:f1', 'Ada', false, 'Hi', T0);
    await store.setAiMemory('u1', 'fund:f1', { topic: 'invest', used: [1, 2] });
    expect(await store.aiMemory('u1', 'fund:f1')).toEqual({ topic: 'invest', used: [1, 2] });
    expect(await store.aiMemory('u2', 'fund:f1')).toBeUndefined();
    await store.deleteUser('u1', T0 + 1);
    expect(await store.aiMemory('u1', 'fund:f1')).toBeUndefined();
  });

  it('counts Claude replies per player per day', async () => {
    const store = make();
    await store.createUser('u1', 'h1', T0);
    expect(await store.takeAiBudget('u1', '2026-10-06', 2)).toBe(true);
    expect(await store.takeAiBudget('u1', '2026-10-06', 2)).toBe(true);
    expect(await store.takeAiBudget('u1', '2026-10-06', 2)).toBe(false);
    expect(await store.takeAiBudget('u2', '2026-10-06', 2)).toBe(true);
    expect(await store.takeAiBudget('u1', '2026-10-07', 2)).toBe(true);
    expect(await store.takeAiBudget('u1', '2026-10-07', 0)).toBe(false);
  });
});

describe('the template path over HTTP (no key)', () => {
  it('stores memory so follow-ups continue and nothing repeats', async () => {
    const { s, fund, store, me } = await lagosWorld('conv_route');
    const characterId = `fund:${fund.id}`;
    const texts = ['What do you invest in?', 'Tell me more', 'ok', 'and?'];
    const replies: string[] = [];
    for (const text of texts)
      replies.push((await s.post('/api/ai-chat', { characterId, text })).json().reply.text);
    const memory = parseMemory(await store.aiMemory(me.id, characterId));
    expect(memory).toMatchObject({ topic: 'invest', turns: 4 });
    const all = replies.flatMap(sentences);
    expect(new Set(all).size).toBe(all.length);
  });
});

// ---------------------------------------------------------------- Claude, mocked

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;
const message = (text: string, stop: string = 'end_turn') =>
  ({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'test-model',
    content: text ? [{ type: 'text', text, citations: null }] : [],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  }) as unknown as Anthropic.Beta.BetaMessage;

function fakeClient(answer: (p: Params) => Promise<Anthropic.Beta.BetaMessage>) {
  const calls: Params[] = [];
  const keys: string[] = [];
  const make = (apiKey: string): AiClient => {
    keys.push(apiKey);
    return {
      beta: {
        messages: {
          create: (p: Params) => {
            calls.push(structuredClone(p));
            return answer(p);
          },
        },
      },
    };
  };
  return { calls, keys, make };
}

async function claudeApp(
  answer: (p: Params) => Promise<Anthropic.Beta.BetaMessage>,
  env: Record<string, string> = {},
  now?: () => number,
) {
  const fake = fakeClient(answer);
  const ctx = await makeApp({
    env: { ANTHROPIC_API_KEY: 'sk-test-not-real', AI_CHAT_MODEL: 'test-model', ...env },
    createAiClient: fake.make,
    ...(now ? { now } : {}),
  });
  const s = api(ctx.app, await playAsGuest(ctx.app));
  await s.command(founderSetup('claude_user'));
  const fund = Object.values(ctx.game.current.funds).find(
    (f) => f.ai && !f.angelId && f.market === 'lagos',
  )!;
  return { ...ctx, ...fake, s, characterId: `fund:${fund.id}`, fund };
}

describe('the Claude path (client mocked)', () => {
  it('sends the exact request and uses the answer', async () => {
    const { s, calls, keys, characterId, fund } = await claudeApp(async () =>
      message('Happy to talk. What are you building?'),
    );
    const r = await s.post('/api/ai-chat', { characterId, text: 'What do you invest in?' });
    expect(r.statusCode).toBe(200);
    expect(r.json().reply.text).toBe('Happy to talk. What are you building?');
    expect(keys).toEqual(['sk-test-not-real']);
    expect(calls).toHaveLength(1);
    const p = calls[0]!;
    expect(p).toMatchObject({
      model: 'test-model',
      max_tokens: 600,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
    });
    expect(p).not.toHaveProperty('thinking');
    expect(p).not.toHaveProperty('temperature');
    const system = p.system as Anthropic.Beta.BetaTextBlockParam[];
    expect(system[0]).toEqual({
      type: 'text',
      text: FROZEN_RULES,
      cache_control: { type: 'ephemeral' },
    });
    expect(system[1]!.cache_control).toBeUndefined();
    // The character block: persona, language and live facts from the templates.
    expect(system[1]!.text).toContain(fund.partner);
    expect(system[1]!.text).toContain(fund.name);
    expect(system[1]!.text).toMatch(/cheques of/);
    expect(system[1]!.text).toMatch(/reply in English/);
    expect(p.messages).toEqual([{ role: 'user', content: 'What do you invest in?' }]);

    // The thread goes along; French when the player writes French.
    await s.post('/api/ai-chat', { characterId, text: 'Vous êtes où ?', lang: 'fr' });
    const p2 = calls[1]!;
    expect((p2.system as Anthropic.Beta.BetaTextBlockParam[])[1]!.text).toMatch(/tickets de/);
    expect((p2.system as Anthropic.Beta.BetaTextBlockParam[])[1]!.text).toMatch(/reply in French/);
    expect(p2.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(p2.messages[2]).toEqual({ role: 'user', content: 'Vous êtes où ?' });
  });

  it('defaults the model when none is set', async () => {
    const fake = fakeClient(async () => message('Hi.'));
    const { app } = await makeApp({
      env: { ANTHROPIC_API_KEY: 'sk-test-not-real' },
      createAiClient: fake.make,
    });
    const s = api(app, await playAsGuest(app));
    await s.command(founderSetup('claude_default'));
    await s.post('/api/ai-chat', { characterId: 'npc:lagos:1', text: 'Hi' });
    expect(typeof fake.calls[0]!.model).toBe('string');
    expect(fake.calls[0]!.model.length).toBeGreaterThan(0);
  });

  it.each([
    ['a refusal', async () => message('', 'refusal')],
    ['an empty answer', async () => message('   ')],
    [
      'a timeout',
      async (): Promise<Anthropic.Beta.BetaMessage> => {
        throw new Anthropic.APIConnectionTimeoutError();
      },
    ],
    [
      'a connection error',
      async (): Promise<Anthropic.Beta.BetaMessage> => {
        throw new Anthropic.APIConnectionError({ message: 'down' });
      },
    ],
    [
      'any other error',
      async (): Promise<Anthropic.Beta.BetaMessage> => {
        throw new Error('boom');
      },
    ],
  ])('falls back to the template on %s', async (_what, answer) => {
    const { s, calls, characterId } = await claudeApp(answer);
    const r = await s.post('/api/ai-chat', { characterId, text: 'What do you invest in?' });
    expect(r.statusCode).toBe(200);
    expect(r.json().reply.text).toMatch(/cheques of/);
    expect(calls).toHaveLength(1);
  });

  it('keeps template lines unused when Claude answered', async () => {
    const { s, characterId, store, me } = await (async () => {
      const ctx = await claudeApp(async () => message('Let’s talk.'));
      const meId = Object.values(ctx.game.current.players).find((p) => p.handle === 'claude_user')!;
      return { ...ctx, me: meId };
    })();
    await s.post('/api/ai-chat', { characterId, text: 'What do you invest in?' });
    const mem = parseMemory(await store.aiMemory(me.id, characterId));
    expect(mem).toMatchObject({ topic: 'invest', turns: 1, used: [] });
  });

  it('stops calling Claude after the daily limit, and starts again the next day', async () => {
    let t = T0;
    const { s, calls, characterId } = await claudeApp(
      async () => message('From Claude.'),
      { AI_CHAT_DAILY_LIMIT: '2' },
      () => t,
    );
    const texts: string[] = [];
    for (let i = 0; i < 3; i++)
      texts.push(
        (await s.post('/api/ai-chat', { characterId, text: `What do you invest in? ${i}` })).json()
          .reply.text,
      );
    expect(calls).toHaveLength(2);
    expect(texts.slice(0, 2)).toEqual(['From Claude.', 'From Claude.']);
    expect(texts[2]).not.toBe('From Claude.');
    t += 24 * 3_600_000;
    await s.post('/api/ai-chat', { characterId, text: 'And today?' });
    expect(calls).toHaveLength(3);
  });

  it('sends at most 16 turns, starting with the player, alternating', () => {
    const turns = Array.from({ length: 30 }, (_, i) => ({ fromAi: i % 2 === 1, text: `m${i}` }));
    const msgs = toMessages(turns);
    expect(msgs.length).toBeLessThanOrEqual(16);
    expect(msgs[0]!.role).toBe('user');
    msgs.forEach((m, i) => expect(m.role).toBe(i % 2 === 0 ? 'user' : 'assistant'));
    // Leading assistant turns go; same-side turns merge.
    expect(
      toMessages([
        { fromAi: true, text: 'a' },
        { fromAi: false, text: 'b' },
        { fromAi: false, text: 'c' },
      ]),
    ).toEqual([{ role: 'user', content: 'b\nc' }]);
  });

  it('gives up after the deadline', async () => {
    const never: AiClient = {
      beta: { messages: { create: () => new Promise<Anthropic.Beta.BetaMessage>(() => {}) } },
    };
    const r = await claudeReply(never, {
      characterBlock: 'x',
      history: [{ fromAi: false, text: 'hi' }],
      deadlineMs: 20,
    });
    expect(r).toEqual({ ok: false, reason: 'timeout' });
  });

  it('uses templates only when no key is set', async () => {
    const fake = fakeClient(async () => message('never'));
    const { app } = await makeApp({ createAiClient: fake.make });
    const s = api(app, await playAsGuest(app));
    await s.command(founderSetup('no_key_here'));
    const r = await s.post('/api/ai-chat', { characterId: 'npc:lagos:2', text: 'Hi' });
    expect(r.statusCode).toBe(200);
    expect(fake.calls).toHaveLength(0);
    expect(fake.keys).toHaveLength(0);
  });
});
