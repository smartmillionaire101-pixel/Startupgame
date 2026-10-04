/**
 * The game world on a key-value store, for serverless hosting where no
 * process lives long enough to hold the world in memory.
 *
 * Same event-sourcing model as the long-running server:
 *   log/<version>   one entry per command (actor, command, time). Creating it
 *                   "only if new" is the commit point: exactly one writer can
 *                   ever produce version N, so concurrent players can't
 *                   overwrite each other.
 *   snap/<version>  gzip snapshots, written once per version every
 *                   SNAPSHOT_EVERY commands and after each settlement; the
 *                   newest few are kept. A reader loads the newest snapshot
 *                   and replays the log after it (the engine is deterministic,
 *                   so replay gives the identical world).
 *
 * Nothing relies on read etags: a warm function knows its world is current
 * when log/<version + 1> doesn't exist yet, which is one small read. On a
 * lost race the command is re-run on the newer world, so the player's action
 * is judged against the true current state.
 */
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  DEFAULT_MONTH_MS,
  commandSchema,
  createWorld,
  dispatch,
  dueSettlements,
  upgradeWorld,
  type Command,
  type DispatchResult,
  type MarketId,
  type World,
} from '@runway/engine';
import type { Game } from '../game.js';
import type { Kv } from './kv.js';

const pad = (v: number) => String(v).padStart(12, '0');
const logKey = (version: number) => `log/${pad(version)}`;
const snapKey = (version: number) => `snap/${pad(version)}`;
const RETRIES = 20;
export const SNAPSHOT_EVERY = 10;
const SNAPSHOTS_KEPT = 3;
const GENESIS = snapKey(0);
/** Short random pause between commit attempts, so racing functions spread out. */
const backoff = (attempt: number) =>
  new Promise((r) => setTimeout(r, Math.min(400, 15 * 2 ** attempt) * (0.5 + Math.random())));

interface LogEntry {
  actor: string | null;
  command: Command;
  at: number;
}

export class KvGame implements Game {
  private world: World | null = null;

  constructor(
    private readonly kv: Kv,
    private readonly opts: {
      seed: number;
      now: () => number;
      /** Real length of a game month (MONTH_MINUTES). */
      monthMs?: number;
      log?: (msg: string, extra?: object) => void;
    },
  ) {}

  get current(): World {
    if (!this.world) throw new Error('KvGame used before refresh()');
    return this.world;
  }

  /** Bring the world up to date: load the newest snapshot on a cold start, then apply newer log entries. */
  async refresh(): Promise<World> {
    if (!this.world) await this.loadLatest();
    await this.catchUp();
    return this.world!;
  }

  /**
   * Newest snapshot that can still be read (a listing can name one another
   * function just pruned). The genesis snapshot is never pruned, so a world
   * that exists always has one; only a store with no snapshot at all gets a
   * new world.
   */
  private async loadLatest(): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const keys = await this.kv.list('snap/');
      for (const key of [...keys].reverse()) {
        const snap = await this.kv.get(key);
        if (!snap) continue;
        this.world = upgradeWorld(JSON.parse(gunzipSync(snap.data).toString('utf8')) as World);
        return;
      }
      if (keys.length === 0 && (await this.init())) return;
      await backoff(attempt);
    }
    throw new Error('Could not load the world.');
  }

  /** Create the world unless someone already has. True if this function created it. */
  private async init(): Promise<boolean> {
    if (await this.kv.get(logKey(1))) return false; // a world exists; its snapshot is not visible yet
    const world = createWorld({ seed: this.opts.seed, now: this.opts.now() });
    const r = await this.kv.set(GENESIS, gzipSync(JSON.stringify(world)), { ifNew: true });
    if (!r.ok) return false;
    this.world = world;
    this.opts.log?.('world created', { seed: this.opts.seed });
    return true;
  }

  /** Apply log entries newer than the cached world. */
  private async catchUp() {
    let replayed = 0;
    for (;;) {
      const next = await this.kv.get(logKey(this.world!.version + 1));
      if (!next) break;
      const e = JSON.parse(new TextDecoder().decode(next.data)) as LogEntry;
      const r = dispatch(this.world!, commandSchema.parse(e.command), {
        actorId: e.actor,
        now: e.at,
      });
      if (!r.ok) throw new Error(`Replay diverged at version ${this.world!.version + 1}`);
      this.world = r.world;
      replayed++;
    }
    if (replayed >= SNAPSHOT_EVERY) await this.saveSnapshot();
  }

  private async saveSnapshot() {
    const v = this.world!.version;
    // Write-once per version: losing the race means someone saved the same world.
    await this.kv.set(snapKey(v), gzipSync(JSON.stringify(this.world)), { ifNew: true });
    const keys = await this.kv.list('snap/');
    for (const old of keys.slice(0, -SNAPSHOTS_KEPT))
      if (old !== GENESIS) await this.kv.delete(old);
  }

  async execute(actorId: string | null, command: Command): Promise<DispatchResult> {
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      const base = this.world ?? (await this.refresh());
      const now = this.opts.now();
      const r = dispatch(base, command, { actorId, now });
      if (!r.ok) return r;
      const entry: LogEntry = { actor: actorId, command, at: now };
      const committed = await this.kv.set(logKey(r.world.version), JSON.stringify(entry), {
        ifNew: true,
      });
      if (committed.ok) {
        this.world = r.world;
        if (r.world.version % SNAPSHOT_EVERY === 0 || command.type === 'market.settle')
          await this.saveSnapshot();
        return r;
      }
      // Someone else committed this version first: catch up and try again.
      await backoff(attempt);
      await this.refresh();
    }
    throw new Error('The world is busy. Try again.');
  }

  async openMarkets(ids: readonly MarketId[]) {
    await this.refresh();
    for (const market of ids) {
      if (this.current.markets[market]) continue;
      const r = await this.execute(null, { type: 'market.open', market });
      if (r.ok) this.opts.log?.('market opened', { market });
    }
  }

  /** Run any settlements that are due (a game month's period boundary has passed). */
  async tick() {
    await this.refresh();
    const monthMs = this.opts.monthMs ?? DEFAULT_MONTH_MS;
    const due = dueSettlements(this.current, this.opts.now(), monthMs);
    for (const { market, at } of due) {
      // Another clock run may have settled it meanwhile: the engine refuses a repeat.
      const r = await this.execute(null, { type: 'market.settle', market, at, monthMs });
      if (!r.ok) this.opts.log?.('settlement skipped', { market, at, error: r.error });
      else this.opts.log?.('market settled', { market, at });
    }
    return due.length;
  }
}
