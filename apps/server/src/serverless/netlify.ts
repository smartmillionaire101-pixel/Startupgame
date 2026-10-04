/**
 * Runway on Netlify: the same HTTP API, run inside Netlify Functions.
 *
 * - The Fastify app is built once per function instance and fed each request
 *   through `inject` (no socket), so every route, validation rule, security
 *   header and rate limit is the one the long-running server uses.
 * - State lives in Netlify Blobs (`KvGame` for the world, `KvAccountStore`
 *   for accounts and chats). Before each request the instance checks whether
 *   the stored world changed and reloads only then.
 * - Production uses the site-wide store, which survives redeploys. Deploy
 *   previews and branch deploys each get their own store and dev tools, so
 *   tests there never touch the live world.
 * - The settlement clock and data feeds run in a scheduled function.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDeployStore, getStore } from '@netlify/blobs';
import type { Context } from '@netlify/functions';
import type { FastifyInstance } from 'fastify';
import type { MarketId } from '@runway/engine';
import { buildApp } from '../app.js';
import { loadConfig, type Config } from '../config.js';
import { DevSmsProvider } from '../adapters/sms.js';
import { fetchFxUpdates } from '../adapters/feeds.js';
import { KvAccountStore } from './kv-accounts.js';
import { KvGame } from './kv-game.js';
import { NetlifyKv, kvJson, type Kv } from './kv.js';

type DeployInfo = Pick<Context['deploy'], 'context' | 'published'>;

/** Production, or any other deploy (previews, branch deploys), which gets its own store and dev tools. */
export type Mode = 'production' | 'preview';

/**
 * Which world a request belongs to. Production only when Netlify says so and
 * the request isn't on a deploy permalink: preview and branch URLs always
 * contain "--" (deploy-preview-3--site.netlify.app), so a preview can never
 * write to the live world even if the deploy context were reported wrongly.
 */
export function modeFor(deploy: DeployInfo | undefined, url?: string): Mode {
  const host = url ? new URL(url).hostname : '';
  if (host.includes('--')) return 'preview';
  return deploy?.context === 'production' ? 'production' : 'preview';
}

export function kvFor(mode: Mode): Kv {
  const opts = { name: 'runway', consistency: 'strong' as const };
  return new NetlifyKv(mode === 'production' ? getStore(opts) : getDeployStore(opts));
}

/**
 * The session secret: from the environment when set, otherwise generated once
 * and kept in the site's private store (never in the repository).
 */
async function sessionSecret(kv: Kv): Promise<string> {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const key = 'secrets/session';
  await kv.set(key, randomBytes(48).toString('base64url'), { ifNew: true });
  const e = await kv.get(key);
  return new TextDecoder().decode(e!.data);
}

export async function configFor(kv: Kv, mode: Mode): Promise<Config> {
  const prod = mode === 'production';
  return loadConfig({
    ...process.env,
    NODE_ENV: prod ? 'production' : 'development',
    DEV_TOOLS: prod ? '0' : '1',
    // Previews are test environments: automated runs sign in many times from one address.
    AUTH_RATE_LIMIT: prod ? (process.env.AUTH_RATE_LIMIT ?? '5') : '100',
    // No SMS gateway is connected yet: show the code on screen.
    SHOW_SIGNIN_CODE: process.env.SHOW_SIGNIN_CODE ?? '1',
    SESSION_SECRET: await sessionSecret(kv),
    // Free public FX source (USD base), refreshed every six hours by the clock.
    FX_FEED_URL: process.env.FX_FEED_URL ?? 'https://open.er-api.com/v6/latest/USD',
    WEB_DIST: '',
  });
}

export interface Runtime {
  app: FastifyInstance;
  game: KvGame;
  kv: Kv;
  config: Config;
}

export async function createRuntime(kv: Kv, config: Config): Promise<Runtime> {
  const now = () => Date.now();
  const game = new KvGame(kv, {
    seed: config.WORLD_SEED,
    now,
    log: (msg, extra) => console.log(JSON.stringify({ msg, ...extra })),
  });
  await game.refresh();
  // A brand-new world (or newly configured markets) opens its markets on first use.
  if (config.OPEN_MARKETS.some((m) => !game.current.markets[m]))
    await game.openMarkets(config.OPEN_MARKETS);
  const app = await buildApp({
    config,
    store: new KvAccountStore(kv),
    game,
    sms: new DevSmsProvider((m) => console.log(m)),
    now,
  });
  await app.ready();
  return { app, game, kv, config };
}

const INSTANCE = randomUUID().slice(0, 8);

/**
 * Previews only: checks the guarantees the game relies on against the real
 * store (create-only writes, compare-and-swap, read-your-writes) and reports
 * which function instance answered, with a short fingerprint of its session
 * secret (a hash, never the secret), so a deploy check can see whether
 * instances agree.
 */
export async function kvSelfTest(rt: Runtime) {
  const kv = rt.kv;
  const key = `selftest/${INSTANCE}-${randomUUID().slice(0, 8)}`;
  const first = await kv.set(key, 'a', { ifNew: true });
  const second = await kv.set(key, 'b', { ifNew: true });
  const read = await kv.get(key);
  const stale = await kv.set(key, 'c', { ifMatch: '"not-the-etag"' });
  const cas = read ? await kv.set(key, 'd', { ifMatch: read.etag }) : { ok: false };
  const after = await kv.get(key);
  await kv.delete(key);
  const text = (e: { data: Uint8Array } | null) => (e ? new TextDecoder().decode(e.data) : null);
  return {
    instance: INSTANCE,
    secret: createHash('sha256').update(rt.config.SESSION_SECRET).digest('hex').slice(0, 8),
    createOnlyHonoured: first.ok && !second.ok && text(read) === 'a',
    staleWriteRefused: !stale.ok,
    readEtag: read?.etag ?? null,
    casWithReadEtag: cas.ok && text(after) === 'd',
    worldVersion: rt.game.current.version,
  };
}

/** Pass a Fetch API request through the Fastify app and back. */
export async function handle(rt: Runtime, req: Request, ip?: string): Promise<Response> {
  await rt.game.refresh();
  const url = new URL(req.url);
  if (url.pathname === '/api/dev/kv-selftest' && rt.config.DEV_TOOLS)
    return Response.json(await kvSelfTest(rt));
  const body =
    req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : Buffer.from(await req.arrayBuffer());
  const res = await rt.app.inject({
    method: req.method as 'GET',
    url: url.pathname + url.search,
    headers: Object.fromEntries(req.headers),
    ...(body?.length ? { payload: body } : {}),
    ...(ip ? { remoteAddress: ip } : {}),
  });
  const headers = new Headers();
  for (const [k, v] of Object.entries(res.headers)) {
    if (v === undefined || k === 'content-length' || k === 'transfer-encoding') continue;
    for (const one of Array.isArray(v) ? v : [v]) headers.append(k, String(one));
  }
  const empty = res.statusCode === 204 || res.statusCode === 304 || req.method === 'HEAD';
  return new Response(empty ? null : new Uint8Array(res.rawPayload), {
    status: res.statusCode,
    headers,
  });
}

export const FX_EVERY_MS = 6 * 3_600_000;

/** The scheduled clock: open configured markets, run due settlements, refresh FX. */
export async function runClock(rt: Runtime, now = Date.now()) {
  await rt.game.openMarkets(rt.config.OPEN_MARKETS);
  const settled = await rt.game.tick();
  let fx = 0;
  const last = await kvJson.get<{ at: number }>(rt.kv, 'feeds/fx');
  if (rt.config.FX_FEED_URL && (!last || now - last.value.at >= FX_EVERY_MS)) {
    await kvJson.set(rt.kv, 'feeds/fx', { at: now });
    try {
      const current = Object.fromEntries(
        Object.values(rt.game.current.markets).map((m) => [m.id, m.data.unitsPerUsd]),
      ) as Partial<Record<MarketId, number>>;
      for (const u of await fetchFxUpdates(rt.config.FX_FEED_URL, current)) {
        await rt.game.execute(null, {
          type: 'market.data',
          market: u.market,
          unitsPerUsd: u.unitsPerUsd,
        });
        fx++;
      }
    } catch (err) {
      console.warn('FX feed unavailable; keeping last values', (err as Error).message);
    }
  }
  return { settled, fx, version: rt.game.current.version };
}
