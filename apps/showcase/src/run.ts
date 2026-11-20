/**
 * One showcase day, end to end:
 *
 *   npm run day -w @runway/showcase -- --data ../../showcase-data
 *
 * 1. Signs the characters back in (or creates them on day 1) in the showcase
 *    world, a database of its own in the data folder.
 * 2. Starts a game server on that database (the web app must be built:
 *    npm run build -w @runway/web).
 * 3. Each character plays its day (Claude when ANTHROPIC_API_KEY is set, else
 *    the scripted stand-in) and gets its screenshots and clip taken.
 * 4. Writes days/day-NNN/ (pictures, plan.json, issue.md) and state.json,
 *    and stops the server so the database is complete on disk.
 *
 * Options: --data <dir> (required), --port <n> (4400), --media-base <url>
 * (where the issue's pictures will be served from; default: relative paths),
 * --model <id> (SHOWCASE_MODEL, default claude-opus-5-5).
 */
import Anthropic from '@anthropic-ai/sdk';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { playScripted, playWithClaude, type DayPlan } from './brain.js';
import { capture, type Captured } from './capture.js';
import { GameClient } from './game.js';
import { issueBody, issueTitle } from './issue.js';
import { PERSONAS, type Persona, type Role } from './personas.js';
import { mintSessions } from './sessions.js';

export interface ShowcaseState {
  day: number;
  agents: Partial<Record<Role, { userId: string }>>;
  /** Each character's story from its last day. */
  last: Partial<Record<Role, string>>;
}

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};

const repo = (...p: string[]) => fileURLToPath(new URL(`../../../${p.join('/')}`, import.meta.url));

function startServer(dbPath: string, port: number): ChildProcess {
  // One process (node with tsx loaded), so the stop signal reaches the server itself.
  const child = spawn(process.execPath, ['--import', 'tsx', repo('apps/server/src/main.ts')], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      HOST: '127.0.0.1',
      DATABASE_PATH: dbPath,
      WEB_DIST: repo('apps/web/dist'),
      ADMIN_TOKEN: 'showcase-local-only',
      // The showcase world has no AI chat of its own; keep the key out of the server.
      ANTHROPIC_API_KEY: '',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  return child;
}

async function waitFor(base: string, ms = 120_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error('The game server did not start.');
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const exited = new Promise((r) => child.once('exit', r));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((r) => setTimeout(r, 15_000))]);
}

/** Sign up a new character in the showcase world. */
async function create(
  base: string,
  persona: Persona,
): Promise<{ game: GameClient; userId: string }> {
  const game = await GameClient.guest(base);
  const meta = await game.meta();
  const market = meta.markets.find((m) => persona.market.test(`${m.name}, ${m.country}`));
  if (!market) throw new Error(`${persona.name}'s city (${persona.market}) is not open.`);
  const r = await game.command({ ...persona.setup, market: market.id });
  if (!r.ok) throw new Error(`Creating ${persona.name}: ${r.error}`);
  const { view } = await game.state();
  const userId = (view?.me as { id?: string } | undefined)?.id;
  if (!userId) throw new Error(`Creating ${persona.name}: no player id.`);
  return { game, userId };
}

async function main() {
  const dataDir = resolve(arg('data') ?? '');
  if (!arg('data')) throw new Error('--data <dir> is required.');
  const port = Number(arg('port', '4400'));
  const base = `http://127.0.0.1:${port}`;
  const model = arg('model', process.env.SHOWCASE_MODEL || 'claude-opus-5-5')!;
  mkdirSync(dataDir, { recursive: true });

  const statePath = join(dataDir, 'state.json');
  const state: ShowcaseState = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, 'utf8'))
    : { day: 0, agents: {}, last: {} };
  const day = state.day + 1;
  const date = new Date().toISOString().slice(0, 10);
  const dayDir = `days/day-${String(day).padStart(3, '0')}`;
  const outDir = join(dataDir, dayDir);
  const mediaBase = (arg('media-base') ?? '.').replace(/\/$/, '');

  const dbPath = join(dataDir, 'showcase.db');
  const known = Object.values(state.agents).map((a) => a!.userId);
  const tokens = known.length ? mintSessions(dbPath, known) : {};

  const server = startServer(dbPath, port);
  const entries: { plan: DayPlan; media: Captured }[] = [];
  try {
    await waitFor(base);
    const claude = process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 3 }) : null;
    console.log(
      `Showcase day ${day}: ${claude ? `Claude (${model})` : 'scripted stand-in (no ANTHROPIC_API_KEY)'}`,
    );

    for (const persona of PERSONAS) {
      let game: GameClient;
      const saved = state.agents[persona.role];
      if (saved && tokens[saved.userId]) game = new GameClient(base, tokens[saved.userId]!);
      else {
        const made = await create(base, persona);
        state.agents[persona.role] = { userId: made.userId };
        game = made.game;
        console.log(`Created ${persona.name} (${made.userId}).`);
      }
      const ctx = { day, yesterday: state.last[persona.role] };
      let plan: DayPlan;
      try {
        plan = claude
          ? await playWithClaude(claude, model, game, persona, ctx)
          : await playScripted(game, persona, ctx);
      } catch (err) {
        // One character's bad day shouldn't lose the others'.
        console.error(`${persona.name}: ${(err as Error).message}`);
        continue;
      }
      const media = await capture(base, game.token, persona, plan.shots, outDir);
      entries.push({ plan, media });
      state.last[persona.role] = plan.story;
      console.log(`${persona.name}: ${plan.story}`);
    }
  } finally {
    await stopServer(server);
  }

  if (entries.length === 0) throw new Error('No character finished the day.');
  state.day = day;
  writeFileSync(join(outDir, 'plan.json'), JSON.stringify(entries, null, 2));
  writeFileSync(
    join(outDir, 'issue.md'),
    issueBody(day, entries, mediaBase === '.' ? '.' : `${mediaBase}/${dayDir}`),
  );
  writeFileSync(join(outDir, 'title.txt'), issueTitle(day, date));
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(`Wrote ${dayDir} (${entries.length} of ${PERSONAS.length} characters).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
