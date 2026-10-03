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
  commandSchema,
  createWorld,
  dispatch,
  dueSettlements,
  type Command,
  type World,
} from '@runway/engine';
import type { Store } from './store/sqlite.js';

export interface GameEvents {
  changed: [{ version: number; actors: string[] }];
}

export class GameService {
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
      world = snap.world;
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
  execute(actorId: string | null, command: Command) {
    const now = this.opts.now();
    const r = dispatch(this.world, command, { actorId, now });
    if (!r.ok) return r;
    this.lastSeq = this.store.appendCommand(actorId, command, now, r.world.version);
    this.world = r.world;
    this.sinceSnapshot += 1;
    if (this.sinceSnapshot >= this.opts.snapshotEvery || command.type === 'market.settle')
      this.snapshot();
    this.events.emit('changed', { version: r.world.version, actors: actorId ? [actorId] : [] });
    return r;
  }

  snapshot() {
    this.store.saveSnapshot(this.lastSeq, this.world.version, this.world, this.opts.now());
    this.sinceSnapshot = 0;
  }

  /** Run any settlements that are due (local midnight passed in a market). */
  tick() {
    const due = dueSettlements(this.world, this.opts.now());
    for (const { market, date } of due) {
      const r = this.execute(null, { type: 'market.settle', market, date });
      if (!r.ok) this.opts.log?.('settlement failed', { market, date, error: r.error });
      else
        this.opts.log?.('market settled', {
          market,
          date,
          month: this.world.markets[market].month,
        });
    }
    return due.length;
  }
}
