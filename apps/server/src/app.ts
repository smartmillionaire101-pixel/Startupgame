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
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  BACKGROUNDS,
  STARTER_IDEAS,
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
  locationOf,
  playerView,
  receiptView,
  startersFor,
  statementView,
  recapView,
  STATEMENT_PAGE_MAX,
  type MarketId,
  BANK_TYPES,
} from '@runway/engine';
import {
  AuthService,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  isAdult,
  normaliseEmail,
  normalisePhone,
} from './auth.js';
import { monthMsOf, type Config } from './config.js';
import type { Game } from './game.js';
import type { SmsProvider } from './adapters/sms.js';
import {
  emailProviderFrom,
  isReservedAddress,
  signInEmail,
  type EmailProvider,
} from './adapters/email.js';
import type { AccountStore, AiThreadRow, ChatRow, FeedbackRow } from './store/types.js';
import {
  CARD_TEXT,
  VOICE_MAX_BYTES,
  VOICE_MAX_MS,
  VOICE_TEXT,
  cardFor,
  chatCommandTarget,
  looksLike,
  messageView,
  PLAY_GAMES,
  playInviteCard,
  techEventCard,
  voiceType,
  type Card,
} from './chat-cards.js';
import {
  CHARACTER_ID,
  characterBlock,
  resolveCharacter,
  safeView,
  templateReply,
  type Character,
} from './ai-chat.js';
import { registerAdmin } from './admin.js';
import { AI_CHAT_HISTORY, claudeReply, createClient, type AiClient } from './ai-claude.js';

/** Avatars not seen for this long drop off the city map. */
export const PRESENCE_WINDOW_MS = 120_000;
/** "Online now" lists players whose game sent a heartbeat this recently. */
export const ONLINE_LIST_WINDOW_MS = 120_000;

export const DISCLAIMER = 'This is a game. Nothing here is financial, legal, or tax advice.';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

export interface AppDeps {
  /** Process-local development only. Serverless runtimes never enable this. */
  allowLocalAdmin?: boolean;
  config: Config;
  store: AccountStore;
  game: Game;
  sms: SmsProvider;
  /** Defaults to the provider the config selects (Resend, SMTP, or the dev logger). */
  email?: EmailProvider;
  now: () => number;
  /** Builds the Claude client for AI chat (tests pass a fake; no network in tests). */
  createAiClient?: (apiKey: string) => AiClient;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, store, game, sms, now } = deps;
  const monthMs = monthMsOf(config);
  // How often an authenticated request records "seen" (away mode, inactivity):
  // a fifth of a game month, between 30 seconds and 10 minutes.
  const seenEvery = Math.min(600_000, Math.max(30_000, Math.round(monthMs / 5)));
  const auth = new AuthService(store, config.SESSION_SECRET, now);
  const prod = config.NODE_ENV === 'production';
  const emailer = deps.email ?? emailProviderFrom(config, (m) => console.log(m));

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
              'req.body.email',
              'req.body.token',
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
  // Sign-in, guest and email-link routes always count per address (a new
  // guest gets a new id, so per-player keys would never run out).
  const byAddress = (req: FastifyRequest) => req.ip;
  const byPlayer = (req: FastifyRequest) => (req.userId ? `u:${req.userId}` : req.ip);
  // Limits count per signed-in player, else per address: on mobile networks
  // many phones share one public IP (carrier NAT), and a busy game screen
  // polls several endpoints. Checked after sign-in is known (preHandler), so a
  // made-up cookie can't buy a fresh allowance.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    hook: 'preHandler',
    keyGenerator: (req: FastifyRequest) => (req.userId ? `u:${req.userId}` : req.ip),
    // The app's own files (the page, scripts, art) aren't limited: before
    // sign-in they'd all count against one shared address, and a phone
    // opening the game would be turned away for loading it.
    allowList: (req: FastifyRequest) => !req.url.startsWith('/api/'),
  });

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
    // Away mode counts game months since a player was last seen; keep that fresh, cheaply.
    const me = game.current.players[req.userId];
    if (me && !me.ai && now() - me.lastActiveAt >= seenEvery) {
      try {
        await game.execute(req.userId, { type: 'player.seen' });
      } catch (err) {
        req.log.warn({ err }, 'could not record player as seen');
      }
    }
  };

  /** How many of each kind of note (feedback, error report) are kept. */
  const NOTES_KEPT = 300;
  /** Keep a note for the admin dashboard, without ever failing the request it's about. */
  const note = (
    kind: FeedbackRow['kind'],
    userId: string | null,
    text: string,
    context: Record<string, string>,
  ) =>
    Promise.resolve()
      .then(() =>
        store.addFeedback(
          { id: randomUUID().slice(0, 8), kind, user_id: userId, text, context, created_at: now() },
          NOTES_KEPT,
        ),
      )
      .catch((e: unknown) => app.log.warn({ err: e }, 'could not keep a note'));

  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({
        error: { code: 'invalid', message: err.issues[0]?.message ?? 'Invalid request.' },
      });
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) {
      req.log.error({ err }, 'unhandled error');
      note('server', req.userId ?? null, err.message || 'Unknown error', {
        request: `${req.method} ${req.url.split('?')[0]}`,
        stack: (err.stack ?? '').split('\n').slice(1, 8).join('\n'),
      });
    }
    return reply.code(status).send({
      error: {
        code: status === 429 ? 'rate' : 'error',
        // Test deployments (dev tools on) say what broke; production never does.
        message:
          status >= 500
            ? config.DEV_TOOLS
              ? `Something went wrong. (${err.message})`
              : 'Something went wrong.'
            : err.message,
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
    /** Founder Journey 6: the starting ideas offered at the café. */
    ideas: STARTER_IDEAS,
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
    // Per player once signed in (onboarding is signed in as a guest): many
    // phones share one carrier address and each checks a few names.
    { config: { rateLimit: { max: 60, timeWindow: '1 minute', keyGenerator: byPlayer } } },
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
    config: {
      rateLimit: { max: config.AUTH_RATE_LIMIT, timeWindow: '10 minutes', keyGenerator: byAddress },
    },
  };

  const setSession = (reply: FastifyReply, token: string) =>
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: prod,
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
    });

  /** Ends the session this browser had, if any (logging into another account). */
  const dropCurrentSession = async (req: FastifyRequest) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token && req.userId) await auth.logout(token);
  };

  /** Guest play: confirm 18+, get a session. Progress lives in this browser until saved. */
  app.post(
    '/api/auth/guest',
    {
      config: {
        rateLimit: {
          max: config.GUEST_RATE_LIMIT,
          timeWindow: '10 minutes',
          keyGenerator: byAddress,
        },
      },
    },
    async (req, reply) => {
      const parsed = z.object({ adult: z.literal(true) }).safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: { code: 'age', message: 'Confirm you are 18 or older to play.' } });
      await dropCurrentSession(req);
      const { token } = await auth.createGuest();
      setSession(reply, token);
      return { ok: true, guest: true };
    },
  );

  // Quick entry keeps email private and unverified. It never claims an existing
  // email account or makes the player wait for a confirmation link.
  app.post(
    '/api/onboarding',
    {
      config: {
        rateLimit: {
          max: config.GUEST_RATE_LIMIT,
          timeWindow: '10 minutes',
          keyGenerator: byAddress,
        },
      },
    },
    async (req, reply) => {
      const body = z
        .object({
          username: z.string().trim().min(3).max(20),
          email: z.string().max(254),
          role: z.enum(['founder', 'investor', 'banker']),
          name: z.string().trim().min(1).max(40).optional(),
          gender: z.enum(['female', 'male']).optional(),
          market: z.enum(Object.keys(MARKET_DATA) as [MarketId, ...MarketId[]]).optional(),
          /** Founder Journey 6: the founder background chosen on the entry screen. */
          backgroundId: z.string().max(32).optional(),
          adult: z.literal(true),
        })
        .parse(req.body);
      const email = normaliseEmail(body.email);
      if (!email)
        return reply
          .code(400)
          .send({ error: { code: 'email', message: 'Enter a valid email address.' } });
      let userId = req.userId;
      if (!userId) {
        const guest = await auth.createGuest();
        userId = guest.userId;
        setSession(reply, guest.token);
      }
      const existing = game.current.players[userId];
      if (existing) {
        if (existing.handle === body.username && existing.role === body.role) return { ok: true };
        return reply
          .code(409)
          .send({ error: { code: 'player.exists', message: 'Player already exists.' } });
      }
      const account = await store.getAccount(userId);
      if (account?.email !== email) await store.setPendingEmail(userId, email);
      const r = await game.execute(userId, {
        type: 'player.quickStart',
        username: body.username,
        role: body.role,
        ...(body.name ? { name: body.name } : {}),
        ...(body.gender ? { gender: body.gender } : {}),
        ...(body.market ? { market: body.market } : {}),
        ...(body.backgroundId ? { backgroundId: body.backgroundId } : {}),
      });
      if (!r.ok) return reply.code(422).send({ error: r.error });
      return { ok: true };
    },
  );

  // Links on screen instead of by email: never in production; in development
  // and previews (dev tools or SHOW_SIGNIN_CODE) so testers and E2E can sign in.
  const showLinks = !prod && (config.DEV_TOOLS || config.SHOW_SIGNIN_CODE);
  const linkBase = (req: FastifyRequest) => {
    if (config.PUBLIC_URL) return config.PUBLIC_URL.replace(/\/$/, '');
    // Production never trusts the Host header for a link that carries a key.
    if (prod) return null;
    const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0]!;
    return `${proto}://${req.host}`;
  };

  // Per-email limit on top of the per-address one. In memory: on serverless
  // hosts it counts per function instance, which still slows abuse a lot.
  const EMAIL_WINDOW_MS = 15 * 60_000;
  const LINKS_PER_EMAIL = 5;
  const linkTimes = new Map<string, number[]>();
  const tooManyLinks = (email: string) => {
    const t = now();
    if (linkTimes.size > 10_000)
      for (const [k, v] of linkTimes)
        if (!v.some((x) => x > t - EMAIL_WINDOW_MS)) linkTimes.delete(k);
    const recent = (linkTimes.get(email) ?? []).filter((x) => x > t - EMAIL_WINDOW_MS);
    recent.push(t);
    linkTimes.set(email, recent);
    return recent.length > LINKS_PER_EMAIL;
  };

  /**
   * Ask for a sign-in link. `intent: 'save'` (signed in) confirms an email for
   * this account; `'login'` opens the email's account (or, if none, saves the
   * guest who asked, or makes a new one). Always the same answer, whether or
   * not the email has an account.
   */
  app.post(
    '/api/auth/email',
    {
      config: {
        rateLimit: {
          max: config.EMAIL_RATE_LIMIT,
          timeWindow: '15 minutes',
          keyGenerator: byAddress,
        },
      },
    },
    async (req, reply) => {
      const body = z
        .object({
          email: z.string().max(254),
          intent: z.enum(['login', 'save']),
          lang: z.enum(['en', 'fr']).default('en'),
        })
        .parse(req.body);
      const email = normaliseEmail(body.email);
      if (!email)
        return reply
          .code(400)
          .send({ error: { code: 'email', message: 'Enter a valid email address.' } });
      if (body.intent === 'save' && !req.userId)
        return reply.code(401).send({ error: { code: 'auth', message: 'Sign in first.' } });
      const base = linkBase(req);
      if ((!emailer.real && !showLinks) || !base) {
        if (prod) req.log.warn('email sign-in is off: set an email provider and PUBLIC_URL');
        return reply.code(503).send({
          error: { code: 'email.off', message: 'Email sign-in isn’t switched on yet.' },
        });
      }
      if (tooManyLinks(email))
        return reply.code(429).send({
          error: { code: 'rate', message: 'Too many tries. Wait a few minutes and try again.' },
        });
      const token = await auth.issueEmailToken(email, body.intent, req.userId ?? null);
      const link = `${base}/?signin=${token}`;
      // Reserved test domains (example.com, .test…) never get real mail.
      if (emailer.real && !isReservedAddress(email)) {
        try {
          await emailer.send(signInEmail(email, link, body.intent, body.lang));
        } catch (err) {
          req.log.error({ err }, 'sign-in email failed');
          return reply.code(502).send({
            error: { code: 'email.failed', message: 'We couldn’t send the email. Try again.' },
          });
        }
      }
      return showLinks ? { ok: true, sent: true, devLink: link } : { ok: true, sent: true };
    },
  );

  /** Open a sign-in link: sets the session cookie. */
  app.post(
    '/api/auth/email/verify',
    {
      config: {
        rateLimit: {
          max: Math.max(60, config.EMAIL_RATE_LIMIT),
          timeWindow: '15 minutes',
          keyGenerator: byAddress,
        },
      },
    },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().max(200) }).parse(req.body);
      const r = await auth.useEmailToken(token);
      if (!r.ok)
        return reply
          .code(r.code === 'email.taken' ? 409 : r.code === 'auth' ? 401 : 400)
          .send({ error: { code: r.code, message: r.message } });
      await dropCurrentSession(req);
      setSession(reply, r.token);
      return {
        ok: true,
        intent: r.intent,
        isNew: r.isNew,
        account: { guest: false, email: r.email },
      };
    },
  );

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
    setSession(reply, r.token);
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

  /**
   * The player's world, plus `account`: `{ guest, email }`. A guest's game is
   * kept only by this browser's session cookie until they save it with an email.
   */
  // The state is polled (every 20 s where the host can't stream): an answer
  // the client already has comes back as an empty 304. Its tag leaves out
  // the server's clock, the one thing that differs between two such answers.
  app.get('/api/state', { preHandler: requireUser }, async (req, reply) => {
    const view = playerView(game.current, req.userId!, { now: now(), monthMs });
    const a = await store.getAccount(req.userId!);
    const account = {
      guest: a?.guest ?? false,
      email: a?.email ?? null,
      ...(a?.pendingEmail ? { pendingEmail: a.pendingEmail } : {}),
    };
    const json = JSON.stringify(
      view ? { onboarded: true, view, account } : { onboarded: false, account },
    );
    const tag = `"${createHash('sha1')
      .update(json.replace(/"serverNow":\d+/, ''))
      .digest('base64url')}"`;
    reply.header('etag', tag).header('cache-control', 'private, no-cache');
    if (req.headers['if-none-match'] === tag) return reply.code(304).send();
    return reply.type('application/json; charset=utf-8').send(json);
  });

  /**
   * The player's bank statement for one of their own accounts, a page at a
   * time (`before` is the previous page's `next`), filtered by direction,
   * game month and text. Only the player's own lines, ever.
   */
  app.get('/api/statement', { preHandler: requireUser }, async (req, reply) => {
    const parsed = z
      .object({
        account: z.enum(['local', 'usd']).default('local'),
        dir: z.enum(['all', 'in', 'out']).default('all'),
        q: z.string().max(80).optional(),
        month: z.coerce.number().int().min(0).max(100_000).optional(),
        before: z.coerce.number().int().min(0).optional(),
        limit: z.coerce.number().int().min(1).max(STATEMENT_PAGE_MAX).optional(),
      })
      .safeParse(req.query);
    if (!parsed.success)
      return reply.code(400).send({ error: { code: 'invalid', message: 'Invalid query.' } });
    const statement = statementView(game.current, req.userId!, parsed.data);
    if (!statement)
      return reply.code(404).send({ error: { code: 'account', message: 'No such account.' } });
    reply.header('cache-control', 'private, no-store');
    return { statement };
  });

  /** The month recap for an earlier month (the current one comes with the player view). */
  app.get('/api/recap', { preHandler: requireUser }, async (req, reply) => {
    const parsed = z
      .object({ month: z.coerce.number().int().min(0).max(100_000).optional() })
      .safeParse(req.query);
    if (!parsed.success)
      return reply.code(400).send({ error: { code: 'invalid', message: 'Invalid query.' } });
    const recap = recapView(game.current, req.userId!, parsed.data.month);
    if (!recap)
      return reply.code(404).send({ error: { code: 'player', message: 'No such player.' } });
    reply.header('cache-control', 'private, no-store');
    return { recap };
  });

  /** One transaction's receipt, as the player saw it (404 unless it touched their accounts). */
  app.get('/api/receipts/:ref', { preHandler: requireUser }, async (req, reply) => {
    const { ref } = z.object({ ref: z.string().max(32) }).parse(req.params);
    const receipt = receiptView(game.current, req.userId!, ref);
    if (!receipt)
      return reply.code(404).send({ error: { code: 'receipt', message: 'Receipt not found.' } });
    reply.header('cache-control', 'private, no-store');
    return { receipt };
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
      last_sender?: string | null;
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
      /** Whether the last message is yours (Wave 5: unread badges in the phone). */
      lastMine: !!c.last_sender && c.last_sender === userId,
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

  /** Find or open the chat with another (human) player; a reply to send when you can't. */
  const chatWith = async (
    me: string,
    otherId: string,
  ): Promise<ChatRow | { code: number; error: { code: string; message: string } }> => {
    const other = game.current.players[otherId];
    if (!game.current.players[me] || !other || other.ai || other.id === me)
      return { code: 404, error: { code: 'player', message: 'Player not found.' } };
    const existing = await store.findChat(me, other.id);
    if (existing?.blocked_by)
      return { code: 403, error: { code: 'blocked', message: 'This chat is blocked.' } };
    return (
      existing ?? (await store.createChat(`chat_${randomUUID().slice(0, 12)}`, me, other.id, now()))
    );
  };

  // Wave 13: a chat starts with whatever you type first (the old one-tap
  // starters are still accepted, as plain text, from older clients).
  app.post('/api/chats', { preHandler: requireUser }, async (req, reply) => {
    const body = z
      .object({
        playerId: z.string().max(64),
        text: z
          .string()
          .max(CHAT_MAX_LENGTH * 2)
          .optional(),
        starter: z
          .string()
          .max(CHAT_MAX_LENGTH * 2)
          .optional(),
      })
      .parse(req.body);
    const check = checkChatMessage(body.text ?? body.starter ?? '');
    if (!check.ok)
      return reply.code(400).send({ error: { code: 'filtered', message: check.reason } });
    const chat = await chatWith(req.userId!, body.playerId);
    if ('error' in chat) return reply.code(chat.code).send({ error: chat.error });
    await store.addMessage(chat.id, req.userId!, check.text, check.flagged, now());
    return { chat: chatView(req.userId!, chat), flagged: check.flagged };
  });

  app.get('/api/chats/:id/messages', { preHandler: requireUser }, async (req, reply) => {
    const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
    const chat = await ownChat(req.userId!, id);
    if (!chat) return reply.code(404).send({ error: { code: 'chat', message: 'Chat not found.' } });
    const members: [string, string] = [chat.a, chat.b];
    return {
      chat: chatView(req.userId!, chat),
      messages: (await store.messages(id)).map((m) =>
        messageView(game.current, m, req.userId!, members, now()),
      ),
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

  // ---- Wave 13: voice notes. Raw audio up to VOICE_MAX_BYTES, of an allowed
  // type whose bytes match it; stored apart from the chat (never in the world).
  app.addContentTypeParser(
    /^audio\//,
    { parseAs: 'buffer', bodyLimit: VOICE_MAX_BYTES },
    (_req, body, done) => done(null, body),
  );

  app.post(
    '/api/chats/with/:playerId/voice',
    {
      preHandler: requireUser,
      bodyLimit: VOICE_MAX_BYTES,
      config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { playerId } = z.object({ playerId: z.string().max(64) }).parse(req.params);
      const { ms } = z
        .object({
          ms: z.coerce
            .number()
            .int()
            .min(300)
            .max(VOICE_MAX_MS + 1_000),
        })
        .parse(req.query);
      const type = voiceType(req.headers['content-type']);
      const data = Buffer.isBuffer(req.body) ? req.body : null;
      if (!type || !data)
        return reply
          .code(415)
          .send({ error: { code: 'voice.type', message: 'That isn’t a voice note we can play.' } });
      if (data.length > VOICE_MAX_BYTES)
        return reply
          .code(413)
          .send({ error: { code: 'voice.size', message: 'That voice note is too long.' } });
      if (!looksLike(type, data))
        return reply
          .code(415)
          .send({ error: { code: 'voice.type', message: 'That isn’t a voice note we can play.' } });
      const chat = await chatWith(req.userId!, playerId);
      if ('error' in chat) return reply.code(chat.code).send({ error: chat.error });
      const voiceId = `vn_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const at = now();
      const length = Math.min(ms, VOICE_MAX_MS);
      await store.putVoice(
        {
          id: voiceId,
          chat_id: chat.id,
          sender: req.userId!,
          mime: type,
          ms: length,
          size: data.length,
          created_at: at,
        },
        new Uint8Array(data),
      );
      await store.addMessage(chat.id, req.userId!, VOICE_TEXT, false, at, {
        kind: 'voice',
        meta: JSON.stringify({ voiceId, ms: length, mime: type }),
      });
      return { chat: chatView(req.userId!, chat), voice: { id: voiceId, ms: length } };
    },
  );

  /** Only the two people in the chat can play its voice notes. */
  app.get('/api/chats/:id/voice/:voiceId', { preHandler: requireUser }, async (req, reply) => {
    const { id, voiceId } = z
      .object({ id: z.string().max(64), voiceId: z.string().regex(/^vn_[a-f0-9]{1,32}$/) })
      .parse(req.params);
    const chat = await ownChat(req.userId!, id);
    const v = chat ? await store.getVoice(voiceId) : undefined;
    if (!chat || !v || v.row.chat_id !== chat.id)
      return reply.code(404).send({ error: { code: 'voice', message: 'Voice note not found.' } });
    const all = Buffer.from(v.data);
    reply
      .header('content-type', v.row.mime)
      .header('cache-control', 'private, max-age=86400')
      .header('accept-ranges', 'bytes')
      .header('content-disposition', 'inline');
    // Safari plays audio with range requests.
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
    if (range && (range[1] || range[2])) {
      const size = all.length;
      let from = range[1] ? Number(range[1]) : size - Number(range[2]);
      let to = range[1] && range[2] ? Number(range[2]) : size - 1;
      from = Math.max(0, from);
      to = Math.min(size - 1, to);
      if (from > to) return reply.code(416).header('content-range', `bytes */${size}`).send();
      return reply
        .code(206)
        .header('content-range', `bytes ${from}-${to}/${size}`)
        .send(all.subarray(from, to + 1));
    }
    return reply.send(all);
  });

  // ---- Wave 13: doing things together from a chat. The command must be aimed
  // at the chat partner; it runs like any command, then a card for both.
  app.post(
    '/api/chats/with/:playerId/act',
    { preHandler: requireUser, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { playerId } = z.object({ playerId: z.string().max(64) }).parse(req.params);
      const body = z
        .object({
          command: commandSchema.optional(),
          techEventId: z.string().max(64).optional(),
          /** An invitation to play (with your waiting table for that game, if any). */
          playGame: z.enum(PLAY_GAMES).optional(),
        })
        .parse(req.body);
      const chat = await chatWith(req.userId!, playerId);
      if ('error' in chat) return reply.code(chat.code).send({ error: chat.error });
      let card: Card | null = null;
      let result: unknown = null;
      if (body.command) {
        if (chatCommandTarget(body.command) !== playerId)
          return reply
            .code(400)
            .send({ error: { code: 'chat.act', message: 'That can’t be done from this chat.' } });
        const r = await game.execute(req.userId!, body.command);
        if (!r.ok) return reply.code(422).send({ error: r.error });
        result = r.result;
        card = cardFor(game.current, body.command, r.result);
      } else if (body.techEventId) {
        card = techEventCard(game.current, body.techEventId);
        if (!card)
          return reply
            .code(422)
            .send({ error: { code: 'techevent.missing', message: 'We can’t find that event.' } });
      } else if (body.playGame) {
        card = playInviteCard(game.current, req.userId!, body.playGame);
      }
      if (!card)
        return reply
          .code(400)
          .send({ error: { code: 'chat.act', message: 'That can’t be done from this chat.' } });
      await store.addMessage(chat.id, req.userId!, CARD_TEXT[card.type], false, now(), {
        kind: 'card',
        meta: JSON.stringify(card),
      });
      return {
        ok: true,
        result,
        chat: chatView(req.userId!, chat),
        version: game.current.version,
      };
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

  // ---------------------------------------------------------------- feedback

  const CRASH_REPEAT_MS = 10 * 60_000;
  const seenCrashes = new Map<string, number>();
  const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  // Where the player was when they wrote (or when a screen crashed): what the
  // client knows, kept short.
  const noteContext = z
    .record(z.string().max(40), z.string().max(500))
    .refine((c) => Object.keys(c).length <= 12, 'Too much context.')
    .default({});

  /** Players tell whoever runs the game what they think, from inside the game. */
  app.post(
    '/api/feedback',
    {
      preHandler: requireUser,
      config: { rateLimit: { max: 5, timeWindow: '10 minutes', keyGenerator: byPlayer } },
    },
    async (req) => {
      const body = z
        .object({
          topic: z.enum(['bug', 'confusing', 'idea', 'love', 'other']),
          text: z.string().trim().min(3, 'Tell us a little more.').max(2000),
          context: noteContext,
        })
        .parse(req.body);
      const me = game.current.players[req.userId!];
      const context = {
        ...body.context,
        topic: body.topic,
        player: me?.name ?? 'Unknown',
        role: me?.role ?? '',
        city: me?.market ?? '',
        browser: String(req.headers['user-agent'] ?? '').slice(0, 200),
      };
      await note('player', req.userId!, body.text, context);
      // An email too, to whoever looks after the game (FEEDBACK_EMAILS, else the admins).
      const inboxes = config.FEEDBACK_EMAILS.length ? config.FEEDBACK_EMAILS : config.ADMIN_EMAILS;
      if (emailer.real && inboxes.length) {
        const lines = Object.entries(context).map(([k, v]) => `${k}: ${v}`);
        const text = `${body.text}\n\n${lines.join('\n')}`;
        const html = `<p>${escapeHtml(body.text).replace(/\n/g, '<br>')}</p><p style="color:#666">${lines.map(escapeHtml).join('<br>')}</p>`;
        void Promise.all(
          inboxes.map((to) =>
            emailer.send({
              to,
              subject: `Runway feedback (${body.topic}) from ${context.player}`,
              text,
              html,
            }),
          ),
        ).catch((err: unknown) => req.log.warn({ err }, 'could not email feedback'));
      }
      return { ok: true };
    },
  );

  /** A screen that crashed on a player's phone (sent by the game itself, not typed). */
  app.post(
    '/api/client-errors',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: byPlayer } } },
    async (req) => {
      const body = z
        .object({
          message: z.string().trim().min(1).max(500),
          stack: z.string().max(2000).default(''),
          context: noteContext,
        })
        .parse(req.body);
      // The same crash from the same phone counts once in a while (in memory:
      // on serverless each instance keeps its own, which is close enough).
      const who = req.userId ?? req.ip;
      const key = `${who}:${body.message}`;
      const t = now();
      for (const [k, at] of seenCrashes) if (t - at > CRASH_REPEAT_MS) seenCrashes.delete(k);
      if (seenCrashes.has(key)) return { ok: true };
      seenCrashes.set(key, t);
      const me = req.userId ? game.current.players[req.userId] : undefined;
      await note('client', req.userId ?? null, body.message, {
        ...body.context,
        ...(me ? { player: me.name, city: me.market } : {}),
        stack: body.stack.split('\n').slice(0, 8).join('\n'),
        browser: String(req.headers['user-agent'] ?? '').slice(0, 200),
      });
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- AI chat (Wave 5 §C)

  // Characters run by the simulation answer from templates filled with live
  // data, or with Claude when a key is set (Wave 6), from the same facts. Like
  // player chats, threads live outside the simulation, private to each player.
  const characterParam = z.object({ characterId: z.string().regex(CHARACTER_ID) });
  let aiClient: AiClient | null = null;
  const claude = (): AiClient | null => {
    const key = config.ANTHROPIC_API_KEY;
    if (!key) return null;
    aiClient ??= (deps.createAiClient ?? createClient)(key);
    return aiClient;
  };

  const aiThreadView = (t: AiThreadRow | undefined, ch: Character | null, characterId: string) => ({
    characterId,
    name: ch?.name ?? t?.name ?? '',
    kind: ch?.kind ?? null,
    org: ch?.org ?? null,
    market: ch?.market ?? null,
    place: ch?.place ?? null,
    /** False once the character has left the world (the thread stays readable). */
    role: ch?.role ?? null,
    available: !!ch,
    lastText: t?.lastText ?? null,
    lastAt: t?.lastAt ?? null,
    lastFromAi: t?.lastFromAi ?? false,
    unread: t?.unread ?? 0,
    count: t?.count ?? 0,
  });

  app.get('/api/ai-chat', { preHandler: requireUser }, async (req) => {
    const world = game.current;
    const threads = await store.aiThreads(req.userId!);
    const view = threads.some((t) => t.characterId.startsWith('npc:'))
      ? safeView(world, req.userId!)
      : null;
    return {
      threads: threads.map((t) =>
        aiThreadView(t, resolveCharacter(world, t.characterId, view), t.characterId),
      ),
    };
  });

  app.get('/api/ai-chat/:characterId', { preHandler: requireUser }, async (req, reply) => {
    const parsed = characterParam.safeParse(req.params);
    if (!parsed.success)
      return reply
        .code(404)
        .send({ error: { code: 'character', message: 'Character not found.' } });
    const ch = resolveCharacter(
      game.current,
      parsed.data.characterId,
      parsed.data.characterId.startsWith('npc:') ? safeView(game.current, req.userId!) : null,
    );
    // An angel's fund id names the angel: their thread is under their own id.
    const characterId = ch?.id ?? parsed.data.characterId;
    const thread = await store.aiThread(req.userId!, characterId);
    if (!ch && !thread)
      return reply
        .code(404)
        .send({ error: { code: 'character', message: 'Character not found.' } });
    if (thread?.unread) await store.markAiRead(req.userId!, characterId);
    return {
      thread: { ...aiThreadView(thread, ch, characterId), unread: 0 },
      messages: (await store.aiMessages(req.userId!, characterId)).map((m) => ({
        id: m.id,
        mine: !m.fromAi,
        text: m.text,
        at: m.at,
      })),
    };
  });

  app.post(
    '/api/ai-chat',
    {
      preHandler: requireUser,
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) => req.userId ?? req.ip,
        },
      },
    },
    async (req, reply) => {
      const body = z
        .object({
          characterId: z.string().regex(CHARACTER_ID),
          text: z.string().max(CHAT_MAX_LENGTH * 2),
          lang: z.enum(['en', 'fr']).default('en'),
        })
        .parse(req.body);
      const world = game.current;
      const me = world.players[req.userId!];
      if (!me)
        return reply
          .code(404)
          .send({ error: { code: 'player', message: 'Create a player first.' } });
      const view = safeView(world, me.id);
      const ch = resolveCharacter(world, body.characterId, view);
      if (!ch || ch.id === me.id)
        return reply
          .code(404)
          .send({ error: { code: 'character', message: 'Character not found.' } });
      const check = checkChatMessage(body.text);
      if (!check.ok)
        return reply.code(400).send({ error: { code: 'filtered', message: check.reason } });
      const before = (await store.aiThread(me.id, ch.id))?.count ?? 0;
      const memory = before ? await store.aiMemory(me.id, ch.id) : undefined;
      await store.addAiMessage(me.id, ch.id, ch.name, false, check.text, now());
      // The template reply always: it's the fallback, and it moves the thread's memory on.
      const tpl = templateReply(world, me, ch, check.text, {
        lang: body.lang,
        n: before + 1,
        memory,
        view,
      });
      let text = tpl.text;
      let nextMemory = tpl.memory;
      const client = claude();
      if (
        client &&
        (await store.takeAiBudget(
          me.id,
          new Date(now()).toISOString().slice(0, 10),
          config.AI_CHAT_DAILY_LIMIT,
        ))
      ) {
        const history = await store.aiMessages(me.id, ch.id, AI_CHAT_HISTORY);
        const r = await claudeReply(client, {
          ...(config.AI_CHAT_MODEL ? { model: config.AI_CHAT_MODEL } : {}),
          characterBlock: characterBlock(world, me, ch, body.lang, view, memory),
          history,
        });
        if (r.ok) {
          text = r.text;
          // The template lines weren't sent, so they stay available later.
          nextMemory = tpl.memoryWithoutLines;
        } else req.log.warn({ reason: r.reason }, 'ai chat: using a template reply');
      }
      const m = await store.addAiMessage(me.id, ch.id, ch.name, true, text, now());
      await store.setAiMemory(me.id, ch.id, nextMemory);
      await store.markAiRead(me.id, ch.id);
      const thread = await store.aiThread(me.id, ch.id);
      return {
        reply: { id: m.id, mine: false, text: m.text, at: m.at },
        flagged: check.flagged,
        thread: aiThreadView(thread, ch, ch.id),
      };
    },
  );

  // ---------------------------------------------------------------- presence (city map)

  // All game screens send a heartbeat every 15 seconds. Only an anonymous total
  // is exposed, independent of map visibility; closed/hidden tabs expire in 45s.
  app.post(
    '/api/online',
    {
      preHandler: requireUser,
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) => req.userId ?? req.ip,
        },
      },
    },
    async (req, reply) => {
      if (!game.current.players[req.userId!])
        return reply
          .code(404)
          .send({ error: { code: 'player', message: 'Create a player first.' } });
      reply.header('Cache-Control', 'no-store');
      return { count: await store.heartbeatOnline(req.userId!, now(), 45_000) };
    },
  );

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
      // Stored under the city you're physically in (Wave 4: flights).
      if (await store.getPresenceVisible(me.id))
        await store.putPresence(me.id, locationOf(me), { ...body, at: now() });
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
      // `?place=<placeId>`: only the players at that place (a scene's "who's here").
      const { place } = z
        .object({ place: z.string().min(1).max(64).optional() })
        .parse(req.query ?? {});
      const world = game.current;
      const me = world.players[req.userId!];
      if (!me) return { players: [] };
      // Everyone in the same city as you right now, residents and visitors alike.
      const here = locationOf(me);
      const rows = (await store.listPresence(here, now() - PRESENCE_WINDOW_MS)).filter((r) => {
        const p = world.players[r.userId];
        return (
          r.userId !== me.id &&
          !!p &&
          locationOf(p) === here &&
          (place === undefined || r.place === place)
        );
      });
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
              // Phase 6a: how they look, so they're drawn as they made themselves.
              gender: p.gender ?? null,
              appearance: p.appearance ?? null,
              appearanceAt: p.appearanceAt ?? null,
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

  // "Online now": the real players online across every city, for finding someone
  // to chat or play with. Only players who show themselves on the map (the same
  // setting as presence), never AI players, and nobody either side has blocked.
  const PLACE_NAMES: Record<string, string> = {
    hub: 'The Hub',
    eventhall: 'Event Hall',
    airport: 'Airport',
    newsstand: 'Newsstand',
    office: 'Office',
    home: 'Home',
  };
  const placeName = (market: MarketId, place: string | null): string | null => {
    if (!place) return null;
    if (PLACE_NAMES[place]) return PLACE_NAMES[place]!;
    const world = game.current;
    if (place.startsWith('biz:'))
      return world.markets[market]?.businesses?.[place.slice(4)]?.name ?? null;
    if (place.startsWith('fund:')) return world.funds[place.slice(5)]?.name ?? null;
    return null;
  };
  app.get(
    '/api/online/players',
    {
      preHandler: requireUser,
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) => req.userId ?? req.ip,
        },
      },
    },
    async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      const world = game.current;
      const me = world.players[req.userId!];
      if (!me) return { players: [] };
      const at = now();
      const ids = (await store.onlinePlayerIds(at - ONLINE_LIST_WINDOW_MS)).filter((id) => {
        const p = world.players[id];
        return id !== me.id && !!p && !p.ai;
      });
      const blocked = new Set(
        (await store.chatsFor(me.id))
          .filter((c) => !!c.blocked_by)
          .map((c) => (c.a === me.id ? c.b : c.a)),
      );
      const shown = (
        await Promise.all(
          ids
            .filter((id) => !blocked.has(id))
            .map(async (id) => ((await store.getPresenceVisible(id)) ? id : null)),
        )
      ).filter((id): id is string => !!id);
      // Where they stand, for the cities they're in (one lookup per city).
      const markets = [...new Set(shown.map((id) => locationOf(world.players[id]!)))];
      const spots = new Map<string, string | null>();
      for (const m of markets)
        for (const r of await store.listPresence(m, at - PRESENCE_WINDOW_MS))
          spots.set(r.userId, r.place);
      // What they're playing (a waiting or running table), from the world.
      const playing = new Map<string, string>();
      for (const r of Object.values(world.playRooms ?? {}))
        if (r.status === 'waiting' || r.status === 'playing')
          for (const m of r.members) playing.set(m.id, r.game);
      const here = locationOf(me);
      return {
        players: shown
          .map((id) => {
            const p = world.players[id]!;
            const market = locationOf(p);
            const place = spots.get(id) ?? null;
            const company = [...p.companyIds]
              .reverse()
              .map((c) => world.companies[c])
              .find((c) => c?.status === 'active');
            return {
              id: p.id,
              name: p.name,
              handle: p.handle,
              role: p.role,
              backgroundId: p.backgroundId,
              // Phase 6a: how they look, so they're drawn as they made themselves.
              gender: p.gender ?? null,
              appearance: p.appearance ?? null,
              appearanceAt: p.appearanceAt ?? null,
              stars: p.stars.value,
              company: company?.name ?? null,
              market,
              city: world.markets[market]?.data.name ?? MARKET_DATA[market]?.name ?? market,
              here: market === here,
              place,
              placeName: placeName(market, place),
              inGame: playing.get(id) ?? null,
            };
          })
          .sort((a, b) => Number(b.here) - Number(a.here) || a.name.localeCompare(b.name))
          .slice(0, 200),
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

  registerAdmin(app, deps);
  app.post(
    '/api/visits',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute', keyGenerator: byAddress } },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.body);
      await store.recordVisit(id, now());
      return reply.header('Cache-Control', 'no-store').code(204).send();
    },
  );

  if (config.DEV_TOOLS) {
    /** Dev only: advance a market by one game month without waiting for the clock. */
    app.post('/api/dev/settle', { preHandler: requireUser }, async (req, reply) => {
      const { market } = z
        .object({ market: z.enum(Object.keys(MARKET_DATA) as [MarketId, ...MarketId[]]) })
        .parse(req.body);
      const open = game.current.markets[market];
      if (!open)
        return reply
          .code(404)
          .send({ error: { code: 'market', message: 'That market isn’t open yet.' } });
      // An extra month: the clock's own schedule is left as it is.
      const r = await game.execute(null, { type: 'market.settle', market, monthMs });
      if (!r.ok) return reply.code(422).send({ error: r.error });
      return { ok: true, month: game.current.markets[market]!.month };
    });
  }

  // ---------------------------------------------------------------- web client

  const dist = config.WEB_DIST ? resolve(config.WEB_DIST) : null;
  if (dist && existsSync(dist)) {
    // Resolve assets on each request: Vite rebuilds create new hashed filenames.
    // Enumerating files at startup leaves rebuilt clients pointing at missing routes.
    await app.register(fastifyStatic, {
      root: dist,
      wildcard: true,
      maxAge: prod ? '1h' : 0,
      setHeaders: (reply, path) => {
        if (path.endsWith('.html')) reply.header('Cache-Control', 'no-store');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      const pathname = req.url.split('?')[0]!;
      if (
        pathname.startsWith('/api/') ||
        pathname.startsWith('/assets/') ||
        /\.[^/]+$/.test(pathname) ||
        req.method !== 'GET'
      )
        return reply.code(404).send({ error: { code: 'not-found', message: 'Not found.' } });
      return reply.header('Cache-Control', 'no-store').sendFile('index.html', { maxAge: 0 });
    });
  }

  return app;
}
