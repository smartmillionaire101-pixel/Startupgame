import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { economyDashboard } from '@runway/engine';
import type { AppDeps } from './app.js';
import { LIVE_WINDOW_MS } from './visits.js';
import { z } from 'zod';

const COOKIE = 'rw_admin';
const TTL = 8 * 60 * 60_000;
const equal = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function registerAdmin(app: FastifyInstance, deps: AppDeps) {
  const { config, now, store, game } = deps;
  const local = (req: FastifyRequest) =>
    deps.allowLocalAdmin === true &&
    config.NODE_ENV !== 'production' &&
    !config.ADMIN_TOKEN &&
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.raw.socket.remoteAddress ?? '') &&
    /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host ?? '');
  const sign = (expires: string) =>
    createHmac('sha256', config.SESSION_SECRET)
      .update(`admin:${config.ADMIN_TOKEN}:${expires}`)
      .digest('hex');
  const authorized = (req: FastifyRequest) => {
    if (local(req)) return true;
    if (!config.ADMIN_TOKEN) return false;
    const bearer = req.headers.authorization?.replace(/^Bearer /, '');
    if (bearer && equal(bearer, config.ADMIN_TOKEN)) return true;
    const [expires = '', signature = ''] = (req.cookies[COOKIE] ?? '').split('.');
    return (
      /^\d+$/.test(expires) &&
      Number(expires) > now() &&
      Number(expires) <= now() + TTL &&
      equal(signature, sign(expires))
    );
  };
  const protect = async (req: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');
    if (!authorized(req))
      return reply
        .code(req.url === '/api/admin/economy' ? 404 : config.ADMIN_TOKEN ? 401 : 503)
        .send({
          error: {
            message: config.ADMIN_TOKEN
              ? 'Admin sign-in required.'
              : 'Set ADMIN_TOKEN on the server to enable admin access.',
          },
        });
  };
  app.post(
    '/api/admin/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) => req.ip,
        },
      },
    },
    async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      const { token } = z.object({ token: z.string().max(1024) }).parse(req.body);
      if (!config.ADMIN_TOKEN || !equal(token, config.ADMIN_TOKEN))
        return reply.code(401).send({ error: { message: 'Incorrect admin password.' } });
      const expires = String(now() + TTL);
      reply.setCookie(COOKIE, `${expires}.${sign(expires)}`, {
        path: '/api/admin',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: TTL / 1000,
      });
      return { ok: true };
    },
  );
  app.post('/api/admin/logout', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store').clearCookie(COOKIE, { path: '/api/admin' });
    return { ok: true };
  });
  app.get('/api/admin/dashboard', { preHandler: protect }, async (req) => {
    const at = now();
    const [visits, onlineIds, reports] = await Promise.all([
      store.visitStats(at),
      store.onlinePlayerIds(at - LIVE_WINDOW_MS),
      store.openReports(),
    ]);
    const world = game.current;
    const online = new Set(onlineIds);
    const players = Object.values(world.players)
      .filter((p) => !p.ai && !(p.name === 'Former player' && p.handle.startsWith('former_')))
      .map((p) => ({
        id: p.id,
        name: p.name,
        handle: p.handle,
        role: p.role,
        city: p.market,
        joinedAt: p.joinedAt,
        lastActiveAt: p.lastActiveAt,
        online: online.has(p.id),
      }))
      .sort((a, b) => Number(b.online) - Number(a.online) || b.joinedAt - a.joinedAt);
    const ids = new Set(players.map((p) => p.id));
    const roles = ['founder', 'investor', 'banker'].map((role) => ({
      name: role,
      count: players.filter((p) => p.role === role).length,
    }));
    const cities = Object.values(world.markets).map((m) => ({
      name: m.id,
      count: players.filter((p) => p.city === m.id).length,
    }));
    return {
      at,
      localAccess: local(req),
      visits,
      players,
      roles,
      cities,
      onlinePlayers: players.filter((p) => p.online).length,
      businesses: Object.values(world.companies).filter(
        (c) => !c.ai && c.founderIds.some((id) => ids.has(id)),
      ).length,
      banks: Object.values(world.banks).filter((b) => ids.has(b.ownerId)).length,
      funds: Object.values(world.funds).filter((f) => f.managerId && ids.has(f.managerId)).length,
      openReports: reports.length,
      finances: {
        since: world.activity?.since ?? null,
        totals: world.activity?.totals ?? {},
        recent: (world.activity?.recent ?? []).map((a) => ({
          ...a,
          memo: undefined,
          player: players.find((p) => p.id === a.playerId)?.name ?? 'Former player',
        })),
      },
    };
  });
  app.get('/api/admin/economy', { preHandler: protect }, async () => ({
    ...economyDashboard(game.current),
    openReports: (await store.openReports()).length,
  }));
}
