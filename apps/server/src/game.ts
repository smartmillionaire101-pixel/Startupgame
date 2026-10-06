/**
 * GameService: owns the in-memory world and is the single writer.
 *
 * Every successful command is appended to the command log *before* the new
 * world replaces the old one, so a crash can never lose an acknowledged
 * action. On boot the latest snapshot is loaded and later commands replayed;
 * the engine is deterministic, so replay reproduces the world exactly.
 *
 * Node runs commands one at a time on the event loop and dispatch is
 * synchronous, so commands are naturally serialised: no locks needed.
 */
import { EventEmitter } from 'node:events';
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
import type { Store } from './store/sqlite.js';
import type { Awaitable } from './store/types.js';

export interface GameEvents {
  changed: [{ version: number; actors: string[] }];
}

/**
 * What the HTTP API needs from the game: the current world and a way to
 * apply commands. `events` exists only where a process lives long enough to
 * push live updates (server-sent events); serverless hosts poll instead.
 */
export interface Game {
  readonly current: World;
  execute(actorId: string | null, command: Command): Awaitable<DispatchResult>;
  readonly events?: EventEmitter<GameEvents>;
}

export class GameService implements Game {
  private world: World;
  private lastSeq = 0;
  private sinceSnapshot = 0;
  readonly events = new EventEmitter<GameEvents>();

  constructor(
    private readonly store: Store,
    private readonly opts: {
      seed: number;
      snapshotEvery: number;
      now: () => number;
      /** Real length of a game month (MONTH_MINUTES). */
      monthMs?: number;
      log?: (msg: string, extra?: object) => void;
    },
  ) {
    this.events.setMaxListeners(10_000);
    this.world = this.boot();
  }

  private boot(): World {
    const snap = this.store.latestSnapshot<World>();
    let world: World;
    if (snap) {
      world = upgradeWorld(snap.world);
      this.lastSeq = snap.seq;
    } else {
      world = createWorld({ seed: this.opts.seed, now: this.opts.now() });
      this.store.saveSnapshot(0, world.version, world, this.opts.now());
    }
    const pending = this.store.commandsAfter(this.lastSeq);
    for (const row of pending) {
      const cmd = commandSchema.parse(JSON.parse(row.command));
      const r = dispatch(world, cmd, { actorId: row.actor, now: row.at });
      if (!r.ok) throw new Error(`Replay diverged at seq ${row.seq}: ${r.error.code}`);
      if (r.world.version !== row.world_version)
        throw new Error(`Replay version mismatch at seq ${row.seq}`);
      world = r.world;
      this.lastSeq = row.seq;
    }
    if (pending.length)
      this.opts.log?.('replayed command log', { commands: pending.length, version: world.version });
    return world;
  }

  get current(): World {
    return this.world;
  }

  /** Apply a command as a player (actorId) or as the system (null). */
  execute(actorId: string | null, raw: Command) {
    // Only what the log can be replayed from goes into it (boot parses each entry).
    const command = commandSchema.parse(raw);
    const now = this.opts.now();
    const r = dispatch(this.world, command, { actorId, now });
    if (!r.ok) return r;
    this.lastSeq = this.store.appendCommand(actorId, command, now, r.world.version);
    this.world = r.world;
    this.sinceSnapshot += 1;
    if (this.sinceSnapshot >= this.opts.snapshotEvery || command.type === 'market.settle')
      this.snapshot();
    // "I'm here" touches change nothing anyone sees: no need to make every client refetch.
    if (command.type !== 'player.seen')
      this.events.emit('changed', { version: r.world.version, actors: actorId ? [actorId] : [] });
    return r;
  }

  snapshot() {
    this.store.saveSnapshot(this.lastSeq, this.world.version, this.world, this.opts.now());
    this.sinceSnapshot = 0;
  }

  /** Open any configured markets not yet open (§2: markets open in waves). Logged like any command. */
  openMarkets(ids: readonly MarketId[]) {
    for (const market of ids) {
      if (this.world.markets[market]) continue;
      const r = this.execute(null, { type: 'market.open', market });
      if (r.ok) this.opts.log?.('market opened', { market });
    }
  }

  /** Run any settlements that are due (a game month's period boundary has passed). */
  tick() {
    const monthMs = this.opts.monthMs ?? DEFAULT_MONTH_MS;
    const due = dueSettlements(this.world, this.opts.now(), monthMs);
    for (const { market, at } of due) {
      const r = this.execute(null, { type: 'market.settle', market, at, monthMs });
      if (!r.ok) this.opts.log?.('settlement failed', { market, at, error: r.error });
      else
        this.opts.log?.('market settled', {
          market,
          at,
          month: this.world.markets[market]!.month,
        });
    }
    return due.length;
  }
}
