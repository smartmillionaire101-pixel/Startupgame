/**
 * Wave 13: chats between players. No starters (the first message is what you
 * type), voice notes only the two of you can play, and cards for what you do
 * together from the chat: a payment, a date, an invitation over, a tech event
 * and a home given as a gift, each with its live state.
 */
import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { api, founderSetup, makeApp, signIn } from './helpers.js';

const JOBURG = 'johannesburg' as const;

/** A tiny WebM (EBML magic, then padding): enough for the server's checks. */
const webm = (size = 2048) => {
  const b = Buffer.alloc(size, 0x20);
  b.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  return b;
};

async function players(app: FastifyInstance, game: { openMarkets(ids: 'johannesburg'[]): void }) {
  game.openMarkets([JOBURG]);
  const a = api(app, await signIn(app, '+2348030000101'));
  const b = api(app, await signIn(app, '+2348030000202'));
  const c = api(app, await signIn(app, '+2348030000303'));
  const made = await a.command({ ...founderSetup('amaka_one'), market: JOBURG, name: 'Amaka' });
  if (made.statusCode !== 200) throw new Error(made.body);
  await b.command({ ...founderSetup('bayo_two'), market: JOBURG, name: 'Bayo' });
  await c.command({ ...founderSetup('chidi_three'), market: JOBURG, name: 'Chidi' });
  const id = async (x: typeof a) => (await x.get('/api/state')).json().view.me.id as string;
  return { a, b, c, aId: await id(a), bId: await id(b) };
}

const voice = (app: FastifyInstance, cookie: string, to: string, body: Buffer, type: string) =>
  app.inject({
    method: 'POST',
    url: `/api/chats/with/${to}/voice?ms=4200`,
    headers: { cookie, 'x-runway': '1', 'content-type': type },
    payload: body,
  });

describe('player chats (Wave 13)', () => {
  it('starts with typed text (emoji welcome), no starter needed', async () => {
    const { app, game } = await makeApp();
    const { a, b, bId } = await players(app, game);
    const r = await a.post('/api/chats', {
      playerId: bId,
      text: 'Hey 👋 how’s the build going? 🚀',
    });
    expect(r.statusCode).toBe(200);
    const chat = r.json().chat;
    const seen = (await b.get(`/api/chats/${chat.id}/messages`)).json();
    expect(seen.messages[0]).toMatchObject({
      text: 'Hey 👋 how’s the build going? 🚀',
      kind: 'text',
    });
    // Contact details are still refused.
    expect(
      (await a.post('/api/chats', { playerId: bId, text: 'text me on 0803 123 4567' })).statusCode,
    ).toBe(400);
  });

  it('stores voice notes apart and lets only the two players play them', async () => {
    const { app, game } = await makeApp();
    const cookieA = await signIn(app, '+2348030000101');
    const { b, c, bId } = await players(app, game);
    // Refused: wrong type, bytes that don't match, too big.
    expect((await voice(app, cookieA, bId, webm(), 'audio/x-wav')).statusCode).toBe(415);
    expect((await voice(app, cookieA, bId, Buffer.alloc(4000, 1), 'audio/webm')).statusCode).toBe(
      415,
    );
    expect((await voice(app, cookieA, bId, webm(600 * 1024), 'audio/webm')).statusCode).toBe(413);

    const ok = await voice(app, cookieA, bId, webm(), 'audio/webm;codecs=opus');
    expect(ok.statusCode, ok.body).toBe(200);
    const { chat, voice: v } = ok.json();
    expect(v.ms).toBe(4200);
    const msgs = (await b.get(`/api/chats/${chat.id}/messages`)).json().messages;
    expect(msgs.at(-1)).toMatchObject({ kind: 'voice', voice: { id: v.id, ms: 4200 } });
    // The text never carries the audio.
    expect(JSON.stringify(msgs).length).toBeLessThan(1000);

    const played = await b.get(`/api/chats/${chat.id}/voice/${v.id}`);
    expect(played.statusCode).toBe(200);
    expect(played.headers['content-type']).toBe('audio/webm');
    expect(played.rawPayload.length).toBe(2048);
    // Range requests (Safari).
    const part = await app.inject({
      method: 'GET',
      url: `/api/chats/${chat.id}/voice/${v.id}`,
      headers: { cookie: await signIn(app, '+2348030000202'), range: 'bytes=0-99' },
    });
    expect(part.statusCode).toBe(206);
    expect(part.rawPayload.length).toBe(100);
    // Nobody else.
    expect((await c.get(`/api/chats/${chat.id}/voice/${v.id}`)).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/api/chats/${chat.id}/voice/${v.id}` })).statusCode,
    ).toBe(401);

    // Blocked chats can't send.
    await b.post(`/api/chats/${chat.id}/block`, {});
    expect((await voice(app, cookieA, bId, webm(), 'audio/webm')).statusCode).toBe(403);
  });

  it('posts a payment card for both and credits the receiver at once', async () => {
    const { app, game } = await makeApp();
    const { a, b, c, aId, bId } = await players(app, game);
    const before = (await b.get('/api/state')).json().view.accounts.local.balance as number;
    const r = await a.post(`/api/chats/with/${bId}/act`, {
      command: { type: 'money.send', toPlayerId: bId, amount: 500_000, note: 'Lunch 🍲' },
    });
    expect(r.statusCode, r.body).toBe(200);
    const after = (await b.get('/api/state')).json().view.accounts.local.balance as number;
    expect(after - before).toBe(r.json().result.received);
    const chatId = r.json().chat.id;
    const mine = (await a.get(`/api/chats/${chatId}/messages`)).json().messages.at(-1);
    const theirs = (await b.get(`/api/chats/${chatId}/messages`)).json().messages.at(-1);
    expect(mine).toMatchObject({ mine: true, kind: 'card' });
    expect(theirs).toMatchObject({
      mine: false,
      kind: 'card',
      card: { type: 'payment', amount: 500_000, note: 'Lunch 🍲', from: aId, status: 'done' },
    });
    // Only at the chat partner.
    const cId = (await c.get('/api/state')).json().view.me.id;
    const wrong = await a.post(`/api/chats/with/${bId}/act`, {
      command: { type: 'money.send', toPlayerId: cId, amount: 1000 },
    });
    expect(wrong.statusCode).toBe(400);
    // Not any command.
    const other = await a.post(`/api/chats/with/${bId}/act`, {
      command: { type: 'player.gig' },
    });
    expect(other.statusCode).toBe(400);
  });

  it('dates, invitations over, tech events and gifted homes show their state', async () => {
    const { app, game } = await makeApp();
    const { a, b, bId } = await players(app, game);
    const msgs = async (x: typeof a, chatId: string) =>
      (await x.get(`/api/chats/${chatId}/messages`)).json().messages as {
        card?: Record<string, unknown>;
      }[];

    // Invite over, then accept from the card.
    const v = await a.post(`/api/chats/with/${bId}/act`, {
      command: { type: 'visit.invite', toPlayerId: bId },
    });
    expect(v.statusCode, v.body).toBe(200);
    const chatId = v.json().chat.id;
    let card = (await msgs(b, chatId)).at(-1)!.card!;
    expect(card).toMatchObject({ type: 'visit', status: 'pending' });
    expect((await b.command({ type: 'visit.accept', inviteId: card.inviteId })).statusCode).toBe(
      200,
    );
    expect((await msgs(a, chatId)).at(-1)!.card).toMatchObject({ status: 'accepted' });

    // A date on one of the city's sky views.
    const view = (await a.get('/api/state')).json().view;
    const d = await a.post(`/api/chats/with/${bId}/act`, {
      command: { type: 'living.date.invite', playerId: bId, location: 'home' },
    });
    expect(d.statusCode, d.body).toBe(200);
    card = (await msgs(b, chatId)).at(-1)!.card!;
    expect(card).toMatchObject({ type: 'date', status: 'invited' });
    await b.command({ type: 'living.date.accept', dateId: card.dateId });
    expect((await msgs(a, chatId)).at(-1)!.card).toMatchObject({ status: 'together' });

    // A tech event together: both can go.
    const ev = (view.here?.techEvents ?? view.market.techEvents).find(
      (e: { status: string }) => e.status === 'on',
    );
    const t = await a.post(`/api/chats/with/${bId}/act`, { techEventId: ev.id });
    expect(t.statusCode, t.body).toBe(200);
    expect(
      (await a.post(`/api/chats/with/${bId}/act`, { techEventId: 'te:johannesburg:99:0' }))
        .statusCode,
    ).toBe(422);
    await b.command({ type: 'techevent.attend', eventId: ev.id });
    expect((await msgs(a, chatId)).at(-1)!.card).toMatchObject({
      type: 'techevent',
      status: 'on',
      going: [bId],
    });

    // A home as a gift (bought outright: a founder in Johannesburg can afford the cheapest).
    const props = Object.values(game.current.properties ?? {})
      .filter((p) => p.market === JOBURG && !p.ownerId)
      .sort((x, y) => x.basePrice - y.basePrice);
    let bought: string | null = null;
    for (const p of props.slice(0, 5)) {
      const r = await a.command({ type: 'property.buy', propertyId: p.id });
      if (r.statusCode === 200) {
        bought = p.id;
        break;
      }
    }
    expect(bought).not.toBeNull();
    const g = await a.post(`/api/chats/with/${bId}/act`, {
      command: { type: 'property.gift', propertyId: bought, toPlayerId: bId },
    });
    expect(g.statusCode, g.body).toBe(200);
    card = (await msgs(b, chatId)).at(-1)!.card!;
    expect(card).toMatchObject({ type: 'gift', status: 'pending', propertyId: bought });
    await b.command({ type: 'property.gift.accept', giftId: card.giftId });
    expect((await msgs(a, chatId)).at(-1)!.card).toMatchObject({ status: 'accepted' });
    const mineNow = (await b.get('/api/state')).json().view.me.properties as { id: string }[];
    expect(mineNow.map((p) => p.id)).toContain(bought);
  });
});
