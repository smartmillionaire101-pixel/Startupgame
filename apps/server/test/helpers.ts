import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { EmailProvider } from '../src/adapters/email.js';
import type { AiClient } from '../src/ai-claude.js';
import { loadConfig, monthMsOf } from '../src/config.js';
import { GameService } from '../src/game.js';
import { Store } from '../src/store/sqlite.js';

export const T0 = Date.UTC(2026, 9, 3, 12);

export async function makeApp(
  opts: {
    path?: string;
    allowLocalAdmin?: boolean;
    now?: () => number;
    env?: Record<string, string>;
    email?: EmailProvider;
    createAiClient?: (apiKey: string) => AiClient;
  } = {},
) {
  const store = new Store(opts.path ?? ':memory:');
  const now = opts.now ?? (() => T0);
  const config = loadConfig({
    NODE_ENV: 'test',
    DEV_TOOLS: '1',
    SESSION_SECRET: 'x'.repeat(40),
    ADMIN_TOKEN: 'admin-token-123',
    ...opts.env,
  });
  const game = new GameService(store, {
    seed: 99,
    snapshotEvery: 5,
    now,
    monthMs: monthMsOf(config),
  });
  const sent: string[] = [];
  const app = await buildApp({
    ...(opts.allowLocalAdmin ? { allowLocalAdmin: true } : {}),
    config,
    store,
    game,
    sms: { send: async (_p, t) => void sent.push(t) },
    ...(opts.email ? { email: opts.email } : {}),
    ...(opts.createAiClient ? { createAiClient: opts.createAiClient } : {}),
    now,
  });
  return { app, store, game, sent, config };
}

const H = { 'x-runway': '1' };

export async function signIn(app: FastifyInstance, phone = '+2348031234567'): Promise<string> {
  const start = await app.inject({
    method: 'POST',
    url: '/api/auth/start',
    headers: H,
    payload: { phone, dob: { year: 1995, month: 5, day: 4 } },
  });
  const { devCode } = start.json();
  const verify = await app.inject({
    method: 'POST',
    url: '/api/auth/verify',
    headers: H,
    payload: { phone, code: devCode },
  });
  const cookie = verify.cookies.find((c) => c.name === 'rw_session')!;
  return `rw_session=${cookie.value}`;
}

/** Guest play: confirm 18+, get a session cookie. */
export async function playAsGuest(app: FastifyInstance): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/guest',
    headers: H,
    payload: { adult: true },
  });
  if (r.statusCode !== 200) throw new Error(`guest: ${r.statusCode} ${r.body}`);
  const cookie = r.cookies.find((c) => c.name === 'rw_session')!;
  return `rw_session=${cookie.value}`;
}

export function api(app: FastifyInstance, cookie: string) {
  return {
    get: (url: string) => app.inject({ method: 'GET', url, headers: { cookie } }),
    post: (url: string, payload: unknown) =>
      app.inject({ method: 'POST', url, headers: { cookie, ...H }, payload: payload as object }),
    del: (url: string) => app.inject({ method: 'DELETE', url, headers: { cookie, ...H } }),
    command: (command: unknown) =>
      app.inject({
        method: 'POST',
        url: '/api/commands',
        headers: { cookie, ...H },
        payload: { command },
      }),
  };
}

export const founderSetup = (handle = 'ada_builds') => ({
  type: 'player.create',
  handle,
  name: 'Ada',
  role: 'founder',
  backgroundId: 'f-engineer',
  market: 'lagos',
  company: {
    name: `Trader Pay ${handle.replace(/_/g, '').slice(0, 6)}`,
    industry: 'fintech',
    revenueModel: 'subscription',
    idea: 'Payments for market traders',
    incorporation: 'local',
  },
});
