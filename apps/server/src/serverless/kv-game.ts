/**
 * The game world on a key-value store, for serverless hosting where no
 * process lives long enough to hold the world in memory.
 *
 * Same event-sourcing model as the long-running server:
 *   log/<version>  one entry per command (actor, command, time). Creating it
 *                  with "only if new" is the commit point: exactly one writer
 *                  can ever produce version N, so concurrent players can't
 *                  overwrite each other.
 *   world          gzip snapshot of the latest world. Written after each
 *                  commit; if a function dies between the two writes, the next
 *                  reader replays the missing log entries (the engine is
 *                  deterministic, so replay gives the identical world).
 *
 * On a lost race the command is re-run on the newer world, so the player's
 * action is judged against the true current state.
 */
import { gunzipSync, gzipSync } from 'node:zlib';
import {
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

const WORLD = 'world';
const logKey = (version: number) => `log/${String(version).padStart(12, '0')}`;
const RETRIES = 6;

interface LogEntry {
  actor: string | null;
  command: Command;
  at: number;
}

export class KvGame implements Game {
  private world: World | null = null;
  private etag: string | null = null;

  constructor(
    private readonly kv: Kv,
    private readonly opts: {
      seed: number;
      now: () => number;
      log?: (msg: string, extra?: object) => void;
    },
  ) {}

  get current(): World {
    if (!this.world) throw new Error('KvGame used before refresh()');
    return this.world;
  }

  /**
   * Bring the cached world up to date: reuse it when the stored snapshot is
   * unchanged, otherwise load it. Then replay any log entries past it.
   */
  async refresh(): Promise<World> {
    const etag = this.world ? await this.kv.etag(WORLD) : null;
    if (!this.world || etag !== this.etag) {
      const snap = await this.kv.get(WORLD);
      if (!snap) await this.init();
      else this.load(snap.data, snap.etag);
    }
    await this.catchUp();
    return this.world!;
  }

  private load(data: Uint8Array, etag: string) {
    this.world = upgradeWorld(JSON.parse(gunzipSync(data).toString('utf8')) as World);
    this.etag = etag;
  }

  private async init() {
    const world = createWorld({ seed: this.opts.seed, now: this.opts.now() });
    const r = await this.kv.set(WORLD, gzipSync(JSON.stringify(world)), { ifNew: true });
    if (!r.ok) {
      // Another function created it first.
      const snap = (await this.kv.get(WORLD))!;
      this.load(snap.data, snap.etag);
      return;
    }
    this.world = world;
    this.etag = r.etag ?? (await this.kv.etag(WORLD));
    this.opts.log?.('world created', { seed: this.opts.seed });
  }

  /** Apply log entries newer than the cached world (a writer died before saving the snapshot). */
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
    if (replayed) {
      this.opts.log?.('replayed command log', { replayed, version: this.world!.version });
      await this.saveSnapshot();
    }
  }

  private async saveSnapshot() {
    const data = gzipSync(JSON.stringify(this.world));
    const cond = this.etag ? { ifMatch: this.etag } : { ifNew: true as const };
    const r = await this.kv.set(WORLD, data, cond);
    // Losing this race is harmless: whoever won wrote the same or a newer world.
    if (r.ok) this.etag = r.etag ?? (await this.kv.etag(WORLD));
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
        await this.saveSnapshot();
        return r;
      }
      // Someone else committed this version first: catch up and try again.
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

  /** Run any settlements that are due (local midnight passed in a market). */
  async tick() {
    await this.refresh();
    const due = dueSettlements(this.current, this.opts.now());
    for (const { market, date } of due) {
      const r = await this.execute(null, { type: 'market.settle', market, date });
      if (!r.ok) this.opts.log?.('settlement failed', { market, date, error: r.error });
      else this.opts.log?.('market settled', { market, date });
    }
    return due.length;
  }
}
