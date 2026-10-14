import { expect, it } from 'vitest';
import { T0, api, founderSetup, makeApp, playAsGuest } from './helpers.js';

type Row = { id: string; here: boolean; city: string; inGame: string | null; place: string | null };

it('lists real players online across cities: visible ones only, no AI, no blocks', async () => {
  let now = T0;
  const { app, store, game } = await makeApp({ now: () => now });
  try {
    game.openMarkets(['nairobi']);
    const join = async (handle: string, market = 'lagos') => {
      const s = api(app, await playAsGuest(app));
      expect((await s.command({ ...founderSetup(handle), market })).json()).toMatchObject({
        ok: true,
      });
      const id = (await s.get('/api/state')).json().view.me.id as string;
      return { s, id };
    };
    const a = await join('aa_one');
    const b = await join('bb_two');
    const c = await join('cc_three', 'nairobi');
    const d = await join('dd_four');
    const e = await join('ee_five');

    expect((await app.inject({ method: 'GET', url: '/api/online/players' })).statusCode).toBe(401);

    for (const p of [a, b, c, d, e]) await p.s.post('/api/online', {});
    // An AI player marked online (it never would be) still isn't listed.
    const ai = Object.values(game.current.players).find((p) => p.ai)!;
    await store.heartbeatOnline(ai.id, now, 45_000);
    // d hides from the map; e is blocked by a.
    await store.setPresenceVisible(d.id, false);
    const chat = (await a.s.post('/api/chats', { playerId: e.id, text: 'hi' })).json().chat;
    await a.s.post(`/api/chats/${chat.id}/block`, {});

    // b stands at the Hub and hosts a waiting snooker table.
    await b.s.post('/api/presence', { x: 3, y: 4, place: 'hub' });
    expect(
      (
        await b.s.command({
          type: 'play.create',
          game: 'snooker',
          venue: `home:${b.id}`,
          title: 'Frame?',
          stake: 0,
        })
      ).json(),
    ).toMatchObject({ ok: true });

    const res = await a.s.get('/api/online/players');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const rows = res.json().players as Row[];
    expect(rows.map((r) => r.id)).toEqual([b.id, c.id]);
    expect(rows[0]).toMatchObject({
      here: true,
      city: 'Lagos',
      place: 'hub',
      placeName: 'The Hub',
      inGame: 'snooker',
      role: 'founder',
    });
    expect(rows[1]).toMatchObject({ here: false, city: 'Nairobi', inGame: null });

    // The block works both ways.
    const fromE = (await e.s.get('/api/online/players')).json().players as Row[];
    expect(fromE.map((r) => r.id)).not.toContain(a.id);

    // Gone quiet for over two minutes: off the list.
    now += 121_000;
    await a.s.post('/api/online', {});
    expect((await a.s.get('/api/online/players')).json().players).toEqual([]);
  } finally {
    await app.close();
    store.close();
  }
});

it('sends an invitation to play as a chat card, with your waiting table', async () => {
  const { app, store } = await makeApp();
  try {
    const join = async (handle: string) => {
      const s = api(app, await playAsGuest(app));
      expect((await s.command(founderSetup(handle))).json()).toMatchObject({ ok: true });
      return { s, id: (await s.get('/api/state')).json().view.me.id as string };
    };
    const a = await join('aa_one');
    const b = await join('zz_xyzq');
    // No table yet: an open invitation.
    expect(
      (await a.s.post(`/api/chats/with/${b.id}/act`, { playGame: 'football' })).statusCode,
    ).toBe(200);
    const made = (
      await a.s.command({
        type: 'play.create',
        game: 'snooker',
        venue: `home:${a.id}`,
        title: 'Frame?',
        stake: 0,
      })
    ).json();
    expect(made.ok).toBe(true);
    const r = await a.s.post(`/api/chats/with/${b.id}/act`, { playGame: 'snooker' });
    expect(r.statusCode).toBe(200);
    const chatId = r.json().chat.id as string;
    const messages = (await b.s.get(`/api/chats/${chatId}/messages`)).json().messages;
    const cards = messages.filter((m: { kind: string }) => m.kind === 'card');
    expect(cards.map((m: { card: { game: string } }) => m.card.game)).toEqual([
      'football',
      'snooker',
    ]);
    expect(cards[0].card).toMatchObject({ type: 'play', status: 'open', city: 'Lagos' });
    expect(cards[1].card).toMatchObject({
      type: 'play',
      roomId: made.result.id,
      venue: `home:${a.id}`,
      status: 'waiting',
      from: a.id,
    });
    expect((await a.s.post(`/api/chats/with/${b.id}/act`, { playGame: 'chess' })).statusCode).toBe(
      400,
    );
  } finally {
    await app.close();
    store.close();
  }
});
