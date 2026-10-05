import { z } from 'zod';
import { MARKET_IDS } from '@runway/engine';

const bool = z
  .enum(['0', '1', 'true', 'false'])
  .optional()
  .transform((v) => v === '1' || v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_PATH: z.string().default('./data/runway.db'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters').optional(),
  WORLD_SEED: z.coerce.number().int().default(20261003),
  DEV_TOOLS: bool,
  /**
   * Show the sign-in code on screen because no SMS gateway is connected yet
   * (test deployments). Anyone can then sign in with any number, so turn it
   * off once a real SMS provider is plugged in.
   */
  SHOW_SIGNIN_CODE: bool,
  /** Legacy phone sign-in: attempts allowed per IP address per 10 minutes, for each step. */
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(5),
  /** New guest accounts per IP address per 10 minutes (generous: phones share carrier IPs). */
  GUEST_RATE_LIMIT: z.coerce.number().int().min(1).default(30),
  /** Sign-in links per IP address per 15 minutes. Each email also gets 5 per 15 minutes. */
  EMAIL_RATE_LIMIT: z.coerce.number().int().min(1).default(20),
  /**
   * The site's address, for sign-in links (https://runway.example). Required
   * in production for email sign-in; elsewhere the request's own address is used.
   */
  PUBLIC_URL: z.string().url().optional().or(z.literal('')),
  /** Email sign-in, option 1: Resend (https://resend.com). */
  RESEND_API_KEY: z.string().optional(),
  /** Email sign-in, option 2: SMTP, e.g. Gmail with an App Password (smtp.gmail.com, 465). */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(1).max(65535).optional(),
  ),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** Sender, e.g. "Runway <you@gmail.com>". Defaults to the SMTP user. */
  EMAIL_FROM: z.string().optional(),
  FX_FEED_URL: z.string().url().optional().or(z.literal('')),
  ADMIN_TOKEN: z.string().optional(),
  WEB_DIST: z.string().optional(),
  SNAPSHOT_EVERY: z.coerce.number().int().min(1).default(200),
  /**
   * Real minutes in one game month (Wave 4). Every market settles once per
   * month, at the same instant. Production and previews: 5. Tests may use any value.
   */
  MONTH_MINUTES: z.coerce.number().positive().max(525_600).default(15),
  /** Markets to have open, in opening order. Unopened ones open on the next boot. */
  OPEN_MARKETS: z
    .string()
    .default(MARKET_IDS.join(','))
    .transform((v) =>
      v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(MARKET_IDS)).min(1)),
});

export type Config = z.infer<typeof schema> & { SESSION_SECRET: string };

/** One game month in real milliseconds. */
export const monthMsOf = (config: Pick<Config, 'MONTH_MINUTES'>): number =>
  Math.max(1_000, Math.round(config.MONTH_MINUTES * 60_000));

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid configuration:\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === 'production') {
    if (!cfg.SESSION_SECRET) throw new Error('SESSION_SECRET is required in production.');
    if (cfg.DEV_TOOLS) throw new Error('DEV_TOOLS must be off in production.');
  }
  return {
    ...cfg,
    SESSION_SECRET: cfg.SESSION_SECRET ?? 'dev-only-secret-do-not-use-in-production!!',
  };
}
