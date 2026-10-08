/**
 * Wave 12 §A: a game in play over the API. The game route shows only what the
 * viewer may see, and settles a finished game itself (the client never
 * reports a winner).
 */
import { describe, expect, it } from 'vitest';
import { api, founderSetup, makeApp, playAsGuest, T0 } from './helpers.js';

describe('GET /api/games/:id', () => {
  it('serves the game to its players, hides answers, and settles when time is up', async () => {
    let clock = T0;
    const { app, game } = await makeApp({ now: () => clock });
    const cookieA = await playAsGuest(app);
    const a = api(app, cookieA);
    expect((await a.command(founderSetup('ada_quiz'))).statusCode).toBe(200);
    const bar = Object.values(game.current.markets.lagos!.businesses!).find(
      (b) => b.kind === 'bar' || b.kind === 'pub',
    )!;
    const made = await a.command({
      type: 'game.create',
      kind: 'quiz',
      where: 'venue',
      businessId: bar.id,
      stake: 10_000,
      ai: 2,
    });
    expect(made.statusCode, made.body).toBe(200);
    const id = made.json().result.gameId as string;
    expect((await a.command({ type: 'game.start', gameId: id })).statusCode).toBe(200);
    clock += 6000;
    const r = await a.get(`/api/games/${id}`);
    expect(r.statusCode).toBe(200);
    const g = r.json().game;
    expect(g.kind).toBe('quiz');
    expect(g.quiz.phase).toBe('question');
    expect(g.quiz.current.right).toBeNull();
    expect(g.quiz.current.options).toHaveLength(4);
    // Unchanged: 304.
    const again = await app.inject({
      method: 'GET',
      url: `/api/games/${id}`,
      headers: { cookie: cookieA, 'if-none-match': r.headers.etag as string },
    });
    expect(again.statusCode).toBe(304);
    // Someone in another city can't see it.
    const b = api(app, await playAsGuest(app));
    await b.command({ ...founderSetup('bisi_far'), market: 'london' });
    expect((await b.get(`/api/games/${id}`)).statusCode).toBe(404);
    // Long after the last question, looking at it settles it.
    clock += 10 * 60_000;
    const done = (await a.get(`/api/games/${id}`)).json().game;
    expect(done.status).toBe('settled');
    expect(done.result.winners.length).toBeGreaterThan(0);
    expect(game.current.accounts['acc:games:lagos']!.balance).toBe(0);
    // A client can't hand itself the pot.
    const claim = await a.command({ type: 'game.finish', gameId: 'game_nope' });
    expect(claim.statusCode).toBe(422);
  });
});
