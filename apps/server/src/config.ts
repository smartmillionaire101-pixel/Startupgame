import { z } from 'zod';

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
  FX_FEED_URL: z.string().url().optional().or(z.literal('')),
  ADMIN_TOKEN: z.string().optional(),
  WEB_DIST: z.string().optional(),
  SNAPSHOT_EVERY: z.coerce.number().int().min(1).default(200),
});

export type Config = z.infer<typeof schema> & { SESSION_SECRET: string };

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
