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
 *
 * Settlements take seconds on a big world, far longer than the gap between
 * other players' commits, so they are committed first and computed after:
 * their only refusals are cheap checks (settlePrecheck), made on the world
 * the entry commits on. The entry says so (`first`), and if computing it
 * still fails, live and replay both record the same no-op (the version moves
 * on, nothing else changes). The clock settles every due city in one
 * `market.settleBatch`: one entry, one computation, one snapshot. A function
 * far behind (a settlement, or more than SNAPSHOT_EVERY entries) jumps to a
 * newer snapshot rather than recomputing the log.
 */
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  DEFAULT_MONTH_MS,
  commandSchema,
  createWorld,
  dispatch,
  dueSettlements,
  settlePrecheck,
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
const NOTHING_DUE = { code: 'settle.none', message: 'Nothing to settle.' };
/** Short random pause between commit attempts, so racing functions spread out. */
const backoff = (attempt: number) =>
  new Promise((r) => setTimeout(r, Math.min(400, 15 * 2 ** attempt) * (0.5 + Math.random())));

interface LogEntry {
  actor: string | null;
  command: Command;
  at: number;
  /** Committed before it was computed: a failure computing it is a logged no-op. */
  first?: true;
}

type SettleCommand = Extract<Command, { type: 'market.settle' | 'market.settleBatch' }>;
const isSettle = (c: Command): c is SettleCommand =>
  c.type === 'market.settle' || c.type === 'market.settleBatch';

/** The next version with nothing else changed: a committed-first entry that couldn't run. */
const skipped = (world: World): World => Object.freeze({ ...world, version: world.version + 1 });

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
        const world = await this.readSnapshot(key);
        if (!world) continue;
        this.world = world;
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

  private async readSnapshot(key: string): Promise<World | null> {
    const snap = await this.kv.get(key);
    if (!snap) return null;
    return upgradeWorld(JSON.parse(gunzipSync(snap.data).toString('utf8')) as World);
  }

  /**
   * Jump to the newest snapshot at or beyond `version`, if there is one: far
   * cheaper than recomputing a settlement or a long run of the log.
   */
  private async jumpToSnapshot(version: number): Promise<boolean> {
    const keys = await this.kv.list('snap/');
    for (const key of [...keys].reverse()) {
      if (Number(key.slice('snap/'.length)) < version) break;
      const world = await this.readSnapshot(key);
      if (!world) continue; // pruned since the listing
      if (world.version < version) break;
      this.world = world;
      this.opts.log?.('caught up from snapshot', { version: world.version });
      return true;
    }
    return false;
  }

  /**
   * Run one log entry on a world, the same way live and in replay. A failure
   * is only possible for an entry committed before it was computed: that one
   * becomes a no-op both times.
   */
  private run(world: World, e: LogEntry): DispatchResult {
    const command = commandSchema.parse(e.command);
    let r: DispatchResult;
    try {
      r = dispatch(world, command, { actorId: e.actor, now: e.at });
    } catch (err) {
      if (!e.first) throw err;
      r = { ok: false, world, error: { code: 'command.failed', message: (err as Error).message } };
    }
    if (r.ok) return r;
    if (!e.first) throw new Error(`Replay diverged at version ${world.version + 1}`);
    this.opts.log?.('committed command did not run', { version: world.version + 1, ...r.error });
    return { ok: false, world: skipped(world), error: r.error };
  }

  /** Apply log entries newer than the cached world. */
  private async catchUp() {
    // Entries applied since the world was last loaded from (or matched) a snapshot.
    let replayed = 0;
    for (;;) {
      const v = this.world!.version;
      const next = await this.kv.get(logKey(v + 1));
      if (!next) break;
      const e = JSON.parse(new TextDecoder().decode(next.data)) as LogEntry;
      // A settlement costs seconds to recompute, and a long way behind costs
      // many entries: a snapshot past them, when there is one, is cheaper.
      const far = replayed > 0 && replayed % SNAPSHOT_EVERY === 0;
      if ((far || isSettle(e.command)) && (await this.jumpToSnapshot(v + 1))) {
        replayed = 0;
        continue;
      }
      this.world = this.run(this.world!, e).world;
      replayed++;
    }
    if (replayed >= SNAPSHOT_EVERY) await this.saveSnapshot();
  }

  /** Keep the newest world: a slower call must not put back an older one. */
  private adopt(world: World) {
    if (!this.world || world.version > this.world.version) this.world = world;
  }

  private async saveSnapshot() {
    const v = this.world!.version;
    // Write-once per version: losing the race means someone saved the same world.
    await this.kv.set(snapKey(v), gzipSync(JSON.stringify(this.world)), { ifNew: true });
    const keys = await this.kv.list('snap/');
    for (const old of keys.slice(0, -SNAPSHOTS_KEPT))
      if (old !== GENESIS) await this.kv.delete(old);
  }

  async execute(actorId: string | null, raw: Command): Promise<DispatchResult> {
    // Only what the log can be replayed from goes into it: an entry that fails
    // the schema would stop every later start (catchUp parses each entry).
    const command = commandSchema.parse(raw);
    if (isSettle(command)) {
      const r = await this.commitFirst(actorId, () => command);
      return r ?? { ok: false, world: this.current, error: NOTHING_DUE };
    }
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
        this.adopt(r.world);
        if (r.world.version % SNAPSHOT_EVERY === 0) await this.saveSnapshot();
        return r;
      }
      // Someone else committed this version first: catch up and try again.
      await backoff(attempt);
      await this.refresh();
    }
    throw new Error('The world is busy. Try again.');
  }

  /**
   * A settlement: checked cheaply on the current world, committed, then
   * computed. Losing the commit race costs only the check, so it can't be
   * starved by other players committing while a settlement computes.
   * `build` makes the command for the world it will commit on (null: nothing
   * to do, nothing is committed).
   */
  private async commitFirst(
    actorId: string | null,
    build: (world: World, now: number) => SettleCommand | null,
  ): Promise<DispatchResult | null> {
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      const base = this.world ?? (await this.refresh());
      const now = this.opts.now();
      const command = build(base, now);
      if (!command) return null;
      const refused = settlePrecheck(base, command, { actorId, now });
      if (refused) return { ok: false, world: base, error: refused };
      const entry: LogEntry = { actor: actorId, command, at: now, first: true };
      const committed = await this.kv.set(logKey(base.version + 1), JSON.stringify(entry), {
        ifNew: true,
      });
      if (committed.ok) {
        const r = this.run(base, entry);
        this.adopt(r.world);
        if (r.ok) await this.saveSnapshot();
        return r;
      }
      // Lost the race: catch up (small entries, usually) and try straight away.
      if (attempt >= 3) await backoff(attempt - 3);
      await this.refresh();
    }
    throw new Error('The world is busy. Try again.');
  }

  /**
   * A month whose period ended more than `graceMs` ago and is still not
   * settled: the scheduled clock is late (or, on a preview, there is none).
   */
  overdue(now: number, graceMs: number): boolean {
    const monthMs = this.opts.monthMs ?? DEFAULT_MONTH_MS;
    return dueSettlements(this.current, now, monthMs).some((d) => now - d.at > graceMs);
  }

  async openMarkets(ids: readonly MarketId[]) {
    await this.refresh();
    for (const market of ids) {
      if (this.current.markets[market]) continue;
      const r = await this.execute(null, { type: 'market.open', market });
      if (r.ok) this.opts.log?.('market opened', { market });
    }
  }

  /**
   * Run any settlements that are due (a game month's period boundary has
   * passed): all of them in one batch, oldest first per market, as if settled
   * one after another. Returns how many were due. `max` settles at most that
   * many (the oldest), for a request catching up a late clock.
   */
  async tick(max = Infinity) {
    await this.refresh();
    const monthMs = this.opts.monthMs ?? DEFAULT_MONTH_MS;
    let due = 0;
    // Worked out again on the world each attempt commits on: another clock
    // run may have settled some meanwhile.
    const r = await this.commitFirst(null, (world, now) => {
      const settlements = dueSettlements(world, now, monthMs)
        .slice(0, max)
        .map(({ market, at }) => ({
          market,
          at,
          monthMs,
        }));
      due = settlements.length;
      if (due === 0) return null;
      return settlements.length === 1
        ? { type: 'market.settle', ...settlements[0]! }
        : { type: 'market.settleBatch', settlements };
    });
    if (!r) return 0;
    if (!r.ok) this.opts.log?.('settlement skipped', { due, error: r.error });
    else this.opts.log?.('markets settled', { due, result: r.result });
    return due;
  }
}
