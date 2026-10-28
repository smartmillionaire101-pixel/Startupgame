import { describe, expect, it } from 'vitest';
import { RELEASE_NOTE } from '../src/release.js';
import { api, makeApp, playAsGuest } from './helpers.js';

/**
 * Round 7 (player feedback: "the city is sometimes slow to load at start"):
 * a new founder's /api/state stays inside a size budget. Every listed
 * company's analysis rode in it twice (the stock market and the exchange):
 * about 700 KB on a preview-sized world, 424 KB on this test world; now an
 * analysis is read when its company opens (351 KB here).
 */
const BUDGET = 400_000;

describe('the state a new player loads', () => {
  it('stays inside its budget, with each stock analysis read on demand', async () => {
    const { app, game } = await makeApp();
    // As a server starts: the current release note switches every feature on.
    await game.execute(null, { type: 'system.announce', ...RELEASE_NOTE });
    const cookie = await playAsGuest(app);
    const call = api(app, cookie);
    const made = await call.command({
      type: 'player.create',
      handle: 'budget_obi',
      name: 'Obi Budget',
      role: 'founder',
      backgroundId: 'f-engineer',
      market: 'london',
      gender: 'female',
      company: {
        name: 'Budget Health',
        industry: 'healthtech',
        revenueModel: 'subscription',
        idea: 'Telehealth for families',
        incorporation: 'local',
      },
    });
    expect(made.statusCode, made.body).toBe(200);
    const r = await call.get('/api/state');
    expect(r.statusCode).toBe(200);
    expect(r.body.length).toBeLessThan(BUDGET);
    const v = r.json().view;
    const listings = [
      ...v.capital.market,
      ...(v.exchange?.markets ?? []).flatMap((m: { listings: unknown[] }) => m.listings),
    ] as Record<string, unknown>[];
    expect(listings.length).toBeGreaterThan(0);
    for (const l of listings) expect(l.analysis).toBeUndefined();

    // A company's page reads its analysis.
    const id = v.capital.market[0].companyId as string;
    const a = await call.get(`/api/stocks/${id}`);
    expect(a.statusCode).toBe(200);
    expect(a.json().analysis.marketCap).toBeGreaterThan(0);
    expect((await call.get('/api/stocks/co_nothing')).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/stocks/${id}` })).statusCode).toBe(401);
  });
});
