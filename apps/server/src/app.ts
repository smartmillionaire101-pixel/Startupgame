/**
 * HTTP API. Thin: validate at the boundary, call the engine through
 * GameService, return read models. All game rules live in the engine.
 */
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  BACKGROUNDS,
  INCORPORATION,
  INDUSTRIES,
  INDUSTRY_LABEL,
  LIFESTYLE_TIERS,
  MARKET_DATA,
  MAX_SLIDES,
  REVENUE_MODELS,
  SLIDES,
  STAGES,
  SYSTEM_COMMANDS,
  CHAT_MAX_LENGTH,
  checkChatMessage,
  checkName,
  commandSchema,
  digest,
  economyDashboard,
  playerView,
  startersFor,
  type MarketId,
  BANK_TYPES,
} from '@runway/engine';
import { AuthService, SESSION_COOKIE, SESSION_TTL_MS, isAdult, normalisePhone } from './auth.js';
import type { Config } from './config.js';
import type { Game } from './game.js';
import type { SmsProvider } from './adapters/sms.js';
import type { AccountStore } from './store/types.js';

/** Avatars not seen for this long drop off the city map. */
export const PRESENCE_WINDOW_MS = 120_000;

export const DISCLAIMER = 'This is a game. Nothing here is financial, legal, or tax advice.';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

export interface AppDeps {
  config: Config;
  store: AccountStore;
  game: Game;
  sms: SmsProvider;
  now: () => number;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, store, game, sms, now } = deps;
  const auth = new AuthService(store, config.SESSION_SECRET, now);
  const prod = config.NODE_ENV === 'production';

  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: prod ? 'info' : 'debug',
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'req.body.phone',
              'req.body.code',
              'res.headers["set-cookie"]',
            ],
          },
    bodyLimit: 16 * 1024,
    trustProxy: prod,
    genReqId: () => randomUUID(),
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  // ---------------------------------------------------------------- hooks

  app.addHook('onRequest', async (req, reply) => {
    req.userId = await auth.userForToken(req.cookies[SESSION_COOKIE]);
    // CSRF defence in depth: SameSite=Strict cookies plus a custom header that
    // cross-site forms cannot send.
    if (
      req.url.startsWith('/api/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers['x-runway'] !== '1'
    ) {
      return reply.code(403).send({ error: { code: 'csrf', message: 'Missing request header.' } });
    }
  });

  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.userId)
      return reply.code(401).send({ error: { code: 'auth', message: 'Sign in first.' } });
  };

  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({
        error: { code: 'invalid', message: err.issues[0]?.message ?? 'Invalid request.' },
      });
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, 'unhandled error');
    return reply.code(status).send({
      error: {
        code: status === 429 ? 'rate' : 'error',
        message: status >= 500 ? 'Something went wrong.' : err.message,
      },
    });
  });

  // ---------------------------------------------------------------- public

  app.get('/api/health', async () => ({ ok: true, version: game.current.version }));

  app.get('/api/meta', async () => ({
    disclaimer: DISCLAIMER,
    markets: Object.values(game.current.markets).map((m) => ({
      id: m.id,
      name: m.data.name,
      country: m.data.country,
      currency: m.data.currency,
      timeZone: m.data.timeZone,
      card: m.data.card,
      costOfLiving: m.data.costOfLiving * 100,
    })),
    backgrounds: BACKGROUNDS,
    industries: INDUSTRIES.map((id) => ({ id, label: INDUSTRY_LABEL[id] })),
    revenueModels: REVENUE_MODELS,
    stages: STAGES,
    slides: SLIDES,
    maxSlides: MAX_SLIDES,
    incorporation: INCORPORATION,
    lifestyleTiers: LIFESTYLE_TIERS,
    chatMaxLength: CHAT_MAX_LENGTH,
    bankTypes: Object.entries(BANK_TYPES).map(([id, t]) => ({
      id,
      label: t.label,
      minCapitalCol: t.minCapitalCol,
      earns: t.earns,
      risk: t.risk,
    })),
    devTools: config.DEV_TOOLS,
  }));

  /** Public daily digest (§10): top five headlines per market. Cached by the service worker for offline reading. */
  app.get('/api/digest', async (req, reply) => {
    const { market } = z
      .object({ market: z.enum(Object.keys(MARKET_DATA) as [MarketId, ...MarketId[]]) })
      .parse(req.query);
    const m = game.current.markets[market];
    if (!m)
      return reply
        .code(404)
        .send({ error: { code: 'market', message: 'That market isn’t open yet.' } });
    reply.header('cache-control', 'public, max-age=300');
    return {
      market,
      month: m.month,
      note: m.economicNote,
      headlines: digest(game.current, market),
    };
  });

  app.get(
    '/api/names/check',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req) => {
      const q = z
        .object({
          name: z.string().max(40),
          market: z.enum(Object.keys(MARKET_DATA) as [MarketId, ...MarketId[]]),
          kind: z.enum(['company', 'handle']).default('company'),
        })
        .parse(req.query);
      const taken = game.current.names[q.market] ?? {};
      if (q.kind === 'handle') {
        const r = checkName(q.name, { taken: {}, kind: 'handle' });
        if (!r.ok) return r;
        return taken[`@${r.normalised}`] ? { ok: false, reason: 'That handle is taken.' } : r;
      }
      return checkName(q.name, { taken });
    },
  );

  // ---------------------------------------------------------------- auth

  const authLimit = {
    config: { rateLimit: { max: config.AUTH_RATE_LIMIT, timeWindow: '10 minutes' } },
  };

  app.post('/api/auth/start', authLimit, async (req, reply) => {
    const body = z
      .object({
        phone: z.string().max(24),
        dob: z.object({
          year: z.number().int().min(1900),
          month: z.number().int().min(1).max(12),
          day: z.number().int().min(1).max(31),
        }),
      })
      .parse(req.body);
    const phone = normalisePhone(body.phone);
    if (!phone)
      return reply.code(400).send({
        error: { code: 'phone', message: 'Enter a valid mobile number with country code.' },
      });
    if (!isAdult(body.dob, new Date(now())))
      return reply
        .code(403)
        .send({ error: { code: 'age', message: 'Runway is for players aged 18 and over.' } });
    const code = await auth.issueOtp(phone);
    await sms.send(phone, `Your Runway code is ${code}. It expires in 10 minutes.`);
    if (config.DEV_TOOLS) return { sent: true, devCode: code, codeShown: 'dev' as const };
    if (config.SHOW_SIGNIN_CODE) return { sent: true, devCode: code, codeShown: 'no-sms' as const };
    return { sent: true };
  });

  app.post('/api/auth/verify', authLimit, async (req, reply) => {
    const body = z
      .object({ phone: z.string().max(24), code: z.string().regex(/^\d{6}$/) })
      .parse(req.body);
    const phone = normalisePhone(body.phone);
    if (!phone)
      return reply
        .code(400)
        .send({ error: { code: 'phone', message: 'Enter a valid mobile number.' } });
    const r = await auth.verifyOtp(phone, body.code);
    if (!r.ok) return reply.code(401).send({ error: { code: 'otp', message: r.reason } });
    reply.setCookie(SESSION_COOKIE, r.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: prod,
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
    });
    return { ok: true, isNew: r.isNew };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await auth.logout(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.delete('/api/account', { preHandler: requireUser }, async (req, reply) => {
    const id = req.userId!;
    if (game.current.players[id])
      await game.execute(null, { type: 'player.anonymize', playerId: id });
    await store.deleteUser(id, now());
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { deleted: true };
  });

  // ---------------------------------------------------------------- game

  app.get('/api/state', { preHandler: requireUser }, async (req) => {
    const view = playerView(game.current, req.userId!);
    return view ? { onboarded: true, view } : { onboarded: false };
  });

  app.post(
    '/api/commands',
    { preHandler: requireUser, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const parsed = z.object({ command: commandSchema }).safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: {
            code: 'invalid',
            message: parsed.error.issues[0]?.message ?? 'Invalid command.',
          },
        });
      const { command } = parsed.data;
      if (SYSTEM_COMMANDS.has(command.type))
        return reply.code(403).send({ error: { code: 'forbidden', message: 'Not allowed.' } });
      const r = await game.execute(req.userId!, command);
      if (!r.ok) return reply.code(422).send({ error: r.error });
      return { ok: true, result: r.result, version: r.world.version };
    },
  );

  /** Server-sent events: tells clients to refetch when the world changes. Tiny payloads for low data use. */
  app.get('/api/events', { preHandler: requireUser }, (req, reply) => {
    // Serverless hosts can't hold a connection open: 204 tells the client to poll.
    const events = game.events;
    if (!events) return reply.code(204).send();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    reply.raw.write(`retry: 5000\ndata: ${JSON.stringify({ version: game.current.version })}\n\n`);
    let pending: NodeJS.Timeout | null = null;
    const onChange = () => {
      // Coalesce bursts (a settlement touches everyone) into one message per second.
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        reply.raw.write(`data: ${JSON.stringify({ version: game.current.version })}\n\n`);
      }, 1000);
    };
    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    events.on('changed', onChange);
    req.raw.on('close', () => {
      events.off('changed', onChange);
      clearInterval(keepAlive);
      if (pending) clearTimeout(pending);
    });
  });

  // ---------------------------------------------------------------- chat (§15)

  const chatView = (
    userId: string,
    c: {
      id: string;
      a: string;
      b: string;
      blocked_by: string | null;
      last_text?: string | null;
      last_at?: number | null;
    },
  ) => {
    const other = c.a === userId ? c.b : c.a;
    const p = game.current.players[other];
    return {
      id: c.id,
      with: {
        id: other,
        name: p?.name ?? 'Former player',
        handle: p?.handle ?? '',
        role: p?.role ?? 'founder',
      },
      blocked: !!c.blocked_by,
      blockedByMe: c.blocked_by === userId,
      lastText: c.last_text ?? null,
      lastAt: c.last_at ?? null,
    };
  };
  const ownChat = async (userId: string, chatId: string) => {
    const c = await store.getChat(chatId);
    return c && (c.a === userId || c.b === userId) ? c : undefined;
  };

  app.get('/api/chats', { preHandler: requireUser }, async (req) => ({
    chats: (await store.chatsFor(req.userId!)).map((c) => chatView(req.userId!, c)),
  }));

  app.get('/api/chats/starters/:playerId', { preHandler: requireUser }, async (req, reply) => {
    const { playerId } = z.object({ playerId: z.string().max(64) }).parse(req.params);
    const me = game.current.players[req.userId!];
    const other = game.current.players[playerId];
    if (!me || !other || other.ai)
      return reply.code(404).send({ error: { code: 'player', message: 'Player not found.' } });
    return { starters: startersFor(me.role, other.role) };
  });

  app.post('/api/chats', { preHandler: requireUser }, async (req, reply) => {
    const body = z
      .object({ playerId: z.string().max(64), starter: z.string().max(200) })
      .parse(req.body);
    const me = game.current.players[req.userId!];
    const other = game.current.players[body.playerId];
    if (!me || !other || other.ai || other.id === me.id)
      return reply.code(404).send({ error: { code: 'player', message: 'Player not found.' } });
    // Chats start from one-tap conversation starters.
    if (!startersFor(me.role, other.role).includes(body.starter))
      return reply
        .code(400)
        .send({ error: { code: 'starter', message: 'Pick a conversation starter.' } });
    const existing = await store.findChat(me.id, other.id);
    if (existing?.blocked_by)
      return reply.code(403).send({ error: { code: 'blocked', message: 'This chat is blocked.' } });
    const chat =
      existing ??
      (await store.createChat(`chat_${randomUUID().slice(0, 12)}`, me.id, other.id, now()));
    await store.addMessage(chat.id, me.id, body.starter, false, now());
    return { chat: chatView(me.id, chat) };
  });

  app.get('/api/chats/:id/messages', { preHandler: requireUser }, async (req, reply) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const chat = await ownChat(req.userId!, id);
    if (!chat) return reply.code(404).send({ error: { code: 'chat', message: 'Chat not found.' } });
    return {
      chat: chatView(req.userId!, chat),
      messages: (await store.messages(id)).map((m) => ({
        id: m.id,
        mine: m.sender === req.userId,
        text: m.text,
        at: m.created_at,
      })),
    };
  });

  app.post(
    '/api/chats/:id/messages',
    { preHandler: requireUser, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
      const { text } = z.object({ text: z.string().max(CHAT_MAX_LENGTH * 2) }).parse(req.body);
      const chat = await ownChat(req.userId!, id);
      if (!chat)
        return reply.code(404).send({ error: { code: 'chat', message: 'Chat not found.' } });
      if (chat.blocked_by)
        return reply
          .code(403)
          .send({ error: { code: 'blocked', message: 'This chat is blocked.' } });
      const check = checkChatMessage(text);
      if (!check.ok)
        return reply.code(400).send({ error: { code: 'filtered', message: check.reason } });
      await store.addMessage(id, req.userId!, check.text, check.flagged, now());
      return { ok: true, flagged: check.flagged };
    },
  );

  app.post('/api/chats/:id/block', { preHandler: requireUser }, async (req, reply) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    if (!(await ownChat(req.userId!, id)))
      return reply.code(404).send({ error: { code: 'chat', message: 'Chat not found.' } });
    await store.blockChat(id, req.userId!);
    return { ok: true };
  });

  app.post('/api/chats/:id/report', { preHandler: requireUser }, async (req, reply) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const { reason } = z
      .object({ reason: z.enum(['harassment', 'scam', 'spam', 'other']) })
      .parse(req.body);
    if (!(await ownChat(req.userId!, id)))
      return reply.code(404).send({ error: { code: 'chat', message: 'Chat not found.' } });
    await store.report(id, req.userId!, reason, now());
    await store.blockChat(id, req.userId!);
    return { ok: true };
  });

  // ---------------------------------------------------------------- presence (city map)

  // Where avatars stand is social and ephemeral, so like chat it lives outside
  // the simulation and is never visible to reporters or arbitrators.
  const coord = z.number().finite().min(-100_000).max(100_000);

  app.post(
    '/api/presence',
    {
      preHandler: requireUser,
      // Per player rather than per address: many phones share one carrier IP.
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) => req.userId ?? req.ip,
        },
      },
    },
    async (req, reply) => {
      const body = z
        .object({ x: coord, y: coord, place: z.string().max(64).nullable() })
        .parse(req.body);
      const me = game.current.players[req.userId!];
      if (!me)
        return reply
          .code(404)
          .send({ error: { code: 'player', message: 'Create a player first.' } });
      if (await store.getPresenceVisible(me.id))
        await store.putPresence(me.id, me.market, { ...body, at: now() });
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/presence',
    {
      preHandler: requireUser,
      // Polled every few seconds by each open map: count per player, not per shared address.
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) => req.userId ?? req.ip,
        },
      },
    },
    async (req) => {
      const world = game.current;
      const me = world.players[req.userId!];
      if (!me) return { players: [] };
      const rows = (await store.listPresence(me.market, now() - PRESENCE_WINDOW_MS)).filter(
        (r) => r.userId !== me.id && world.players[r.userId]?.market === me.market,
      );
      const blocked = await Promise.all(
        rows.map(async (r) => !!(await store.findChat(me.id, r.userId))?.blocked_by),
      );
      return {
        players: rows
          .filter((_, i) => !blocked[i])
          .map((r) => {
            const p = world.players[r.userId]!;
            const company = [...p.companyIds]
              .reverse()
              .map((id) => world.companies[id])
              .find((c) => c?.status === 'active');
            return {
              id: p.id,
              name: p.name,
              handle: p.handle,
              role: p.role,
              backgroundId: p.backgroundId,
              stars: p.stars.value,
              company: company?.name ?? null,
              x: r.x,
              y: r.y,
              place: r.place,
              seenAt: r.at,
            };
          }),
      };
    },
  );

  app.get('/api/me/presence', { preHandler: requireUser }, async (req) => ({
    visible: await store.getPresenceVisible(req.userId!),
  }));

  app.put('/api/me/presence', { preHandler: requireUser }, async (req) => {
    const { visible } = z.object({ visible: z.boolean() }).parse(req.body);
    await store.setPresenceVisible(req.userId!, visible);
    return { visible };
  });

  // ---------------------------------------------------------------- ops

  app.get('/api/admin/economy', async (req, reply) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!config.ADMIN_TOKEN || token !== config.ADMIN_TOKEN)
      return reply.code(404).send({ error: { code: 'not-found', message: 'Not found.' } });
    return { ...economyDashboard(game.current), openReports: (await store.openReports()).length };
  });

  if (config.DEV_TOOLS) {
    /** Dev only: advance a market by one game month without waiting for midnight. */
    app.post('/api/dev/settle', { preHandler: requireUser }, async (req, reply) => {
      const { market } = z
        .object({ market: z.enum(Object.keys(MARKET_DATA) as [MarketId, ...MarketId[]]) })
        .parse(req.body);
      const open = game.current.markets[market];
      if (!open)
        return reply
          .code(404)
          .send({ error: { code: 'market', message: 'That market isn’t open yet.' } });
      const last = open.lastSettledDate!;
      const d = new Date(`${last}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      const r = await game.execute(null, {
        type: 'market.settle',
        market,
        date: d.toISOString().slice(0, 10),
      });
      if (!r.ok) return reply.code(422).send({ error: r.error });
      return { ok: true, month: game.current.markets[market]!.month };
    });
  }

  // ---------------------------------------------------------------- web client

  const dist = config.WEB_DIST ? resolve(config.WEB_DIST) : null;
  if (dist && existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist, wildcard: false, maxAge: prod ? '1h' : 0 });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.method !== 'GET')
        return reply.code(404).send({ error: { code: 'not-found', message: 'Not found.' } });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
