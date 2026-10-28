/**
 * Settlements on the key-value world: committed first and computed after, all
 * due cities in one batch, and a function far behind jumping to a snapshot.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as engine from '@runway/engine';
import type { Command, DispatchResult, World } from '@runway/engine';
import { KvGame, SNAPSHOT_EVERY } from '../src/serverless/kv-game.js';
import { MemoryKv, type Kv, type KvCondition } from '../src/serverless/kv.js';
import { RELEASE_NOTE } from '../src/release.js';
import { T0 } from './helpers.js';

/** Test hooks around the engine's dispatch: a slow or failing settlement. */
const hooks = vi.hoisted(() => ({
  settleMs: 0,
  failSettle: false,
}));

vi.mock('@runway/engine', async (importOriginal) => {
  const real = await importOriginal<typeof engine>();
  return {
    ...real,
    dispatch: (world: World, command: Command, ctx: engine.CommandContext): DispatchResult => {
      if (command.type === 'market.settle' || command.type === 'market.settleBatch') {
        if (hooks.failSettle)
          return { ok: false, world, error: { code: 'settle.test', message: 'Test failure.' } };
        // A big world's settlement: seconds of synchronous work.
        const until = performance.now() + hooks.settleMs;
        while (performance.now() < until);
      }
      return real.dispatch(world, command, ctx);
    },
  };
});

const { dispatch } = engine;
const MONTH = 60_000;
const pad = (v: number) => String(v).padStart(12, '0');
const MARKETS = ['lagos', 'accra', 'kigali', 'nairobi'] as const;
/** Worlds compared as their saved form, the version (one entry vs several) aside. */
const same = (w: World) => JSON.parse(JSON.stringify({ ...w, version: 0 })) as unknown;

beforeEach(() => {
  hooks.settleMs = 0;
  hooks.failSettle = false;
});

/** A small live world: several cities, the current release, a human player. */
async function setup(kv: Kv, clock: { now: number }, log?: (m: string, x?: object) => void) {
  const g = new KvGame(kv, { seed: 7, now: () => clock.now, monthMs: MONTH, ...(log && { log }) });
  await g.openMarkets(MARKETS);
  await g.execute(null, { type: 'system.announce', ...RELEASE_NOTE });
  const r = await g.execute('human-1', {
    type: 'player.quickStart',
    username: 'ada_builds',
    role: 'founder',
    market: 'lagos',
  });
  expect(r.ok).toBe(true);
  return g;
}

async function entries(kv: Kv) {
  const out: { actor: string | null; command: Command; at: number; first?: boolean }[] = [];
  for (let v = 1; ; v++) {
    const e = await kv.get(`log/${pad(v)}`);
    if (!e) return out;
    out.push(JSON.parse(new TextDecoder().decode(e.data)));
  }
}

/** A copy of a store with only the genesis snapshot: a start that must replay the whole log. */
async function logOnly(kv: MemoryKv) {
  const copy = new MemoryKv();
  for (const k of await kv.list('log/')) await copy.set(k, (await kv.get(k))!.data);
  await copy.set(`snap/${pad(0)}`, (await kv.get(`snap/${pad(0)}`))!.data);
  return copy;
}

describe('a batch of settlements', () => {
  it('leaves the same world as the same settlements one after another, skipping refusals', async () => {
    const clock = { now: T0 };
    const g = await setup(new MemoryKv(), clock);
    const base = g.current;
    clock.now = T0 + 3 * MONTH + 5_000;
    const due = engine.dueSettlements(base, clock.now, MONTH);
    const open = Object.keys(base.markets).length;
    expect(open).toBeGreaterThan(MARKETS.length);
    expect(due.length).toBe(3 * open);
    const settlements = due.map(({ market, at }) => ({ market, at, monthMs: MONTH }));
    // One already done by then (a repeat) and a city not open: refused, so skipped.
    settlements.splice(2, 0, { ...settlements[0]! });
    settlements.push({ market: 'dubai', at: due[0]!.at, monthMs: MONTH });

    const ctx = { actorId: null, now: clock.now };
    let one = base;
    const refused: string[] = [];
    for (const s of settlements) {
      const r = dispatch(one, { type: 'market.settle', ...s }, ctx);
      if (r.ok) one = r.world;
      else refused.push(r.error.code);
    }
    expect(refused).toEqual(['settle.date', 'market.missing']);

    const batch = dispatch(base, { type: 'market.settleBatch', settlements }, ctx);
    if (!batch.ok) throw new Error(batch.error.message);
    expect(batch.world.version).toBe(base.version + 1);
    expect(same(batch.world)).toEqual(same(one));
    const result = batch.result as { settled: unknown[]; skipped: { code: string }[] };
    expect(result.settled).toHaveLength(due.length);
    expect(result.skipped.map((s) => s.code)).toEqual(['settle.date', 'market.missing']);
    // The world it ran on is untouched.
    expect(base.markets.lagos!.settledAt).toBe(T0);
  });

  it('is refused, changing nothing, when none of it can settle', () => {
    const w = engine.createWorld({ seed: 1, now: T0 });
    const r = dispatch(
      w,
      { type: 'market.settleBatch', settlements: [{ market: 'dubai' }] },
      { actorId: null, now: T0 },
    );
    expect(r.ok).toBe(false);
    expect(r.world).toBe(w);
  });

  it('is a system command only', () => {
    const w = engine.createWorld({ seed: 1, now: T0 });
    const r = dispatch(
      w,
      { type: 'market.settleBatch', settlements: [{ market: 'lagos' }] },
      { actorId: 'someone', now: T0 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('command.forbidden');
  });
});

describe('the serverless clock', () => {
  it('settles every due city in one log entry and one snapshot, as one-by-one settles would', async () => {
    const kv = new MemoryKv();
    const clock = { now: T0 };
    const g = await setup(kv, clock);
    const before = g.current;
    const snaps = (await kv.list('snap/')).length;
    clock.now = T0 + 2 * MONTH + 1_000;
    const open = Object.keys(before.markets) as (keyof typeof before.markets)[];
    expect(open.length).toBeGreaterThan(MARKETS.length);
    expect(await g.tick()).toBe(2 * open.length);
    expect(g.current.version).toBe(before.version + 1);
    for (const m of open) expect(g.current.markets[m]!.month).toBe(before.markets[m]!.month + 2);
    const log = await entries(kv);
    expect(log.at(-1)!.command.type).toBe('market.settleBatch');
    expect(log.at(-1)!.first).toBe(true);
    const keys = await kv.list('snap/');
    expect(keys.at(-1)).toBe(`snap/${pad(g.current.version)}`);
    expect(keys.length).toBe(Math.min(snaps + 1, 4));
    // Nothing more is due.
    expect(await g.tick()).toBe(0);
    expect(g.current.version).toBe(before.version + 1);

    // The same months settled the old way, one log entry per city (a log written
    // before batches): still replays, to the same world.
    const old = await logOnly(kv);
    await old.delete(`log/${pad(before.version + 1)}`);
    let v = before.version;
    for (const { market, at } of engine.dueSettlements(before, clock.now, MONTH))
      await old.set(
        `log/${pad(++v)}`,
        JSON.stringify({
          actor: null,
          command: { type: 'market.settle', market, at, monthMs: MONTH },
          at: clock.now,
        }),
      );
    const oldStart = new KvGame(old, { seed: 7, now: () => clock.now, monthMs: MONTH });
    await oldStart.refresh();
    expect(oldStart.current.version).toBe(before.version + 2 * open.length);
    expect(same(oldStart.current)).toEqual(same(g.current));

    // And the batch replays from the log alone.
    const fresh = new KvGame(await logOnly(kv), { seed: 7, now: () => clock.now, monthMs: MONTH });
    await fresh.refresh();
    expect(fresh.current).toEqual(g.current);
  });

  it('a single due city is a plain market.settle', async () => {
    const kv = new MemoryKv();
    const clock = { now: T0 };
    const g = new KvGame(kv, { seed: 7, now: () => clock.now, monthMs: MONTH });
    await g.openMarkets(['lagos']);
    clock.now = T0 + MONTH;
    const [last, ...others] = engine.dueSettlements(g.current, clock.now, MONTH).reverse();
    for (const { market, at } of others)
      expect((await g.execute(null, { type: 'market.settle', market, at })).ok).toBe(true);
    expect(await g.tick()).toBe(1);
    expect((await entries(kv)).at(-1)!.command).toEqual({
      type: 'market.settle',
      market: last!.market,
      at: last!.at,
      monthMs: MONTH,
    });
  });

  it('two clock runs at once settle each month once', async () => {
    const kv = new MemoryKv();
    const clock = { now: T0 };
    const a = await setup(kv, clock);
    const b = new KvGame(kv, { seed: 7, now: () => clock.now, monthMs: MONTH });
    await b.refresh();
    const month = a.current.markets.lagos!.month;
    clock.now = T0 + MONTH + 1;
    await Promise.all([a.tick(), b.tick()]);
    await a.refresh();
    await b.refresh();
    expect(a.current.markets.lagos!.month).toBe(month + 1);
    expect(b.current).toEqual(a.current);
  });
});

/**
 * A store where another function keeps committing small commands, as a
 * parallel writer would: whenever anyone reads or writes the log, the
 * commits due by then (one every `everyMs`) have already landed.
 */
class BusyKv implements Kv {
  readonly inner = new MemoryKv();
  lost = 0;
  others = 0;
  stopped = false;
  private last = performance.now();
  constructor(
    private readonly everyMs: number,
    private readonly actor: string,
    private readonly at: number,
  ) {}
  private async others_commit() {
    if (this.stopped) return;
    const due = Math.floor((performance.now() - this.last) / this.everyMs);
    this.last += due * this.everyMs;
    for (let n = 0; n < due; n++) {
      let v = 1;
      while (await this.inner.get(`log/${pad(v)}`)) v++;
      const entry = { actor: this.actor, command: { type: 'player.seen' }, at: this.at };
      await this.inner.set(`log/${pad(v)}`, JSON.stringify(entry), { ifNew: true });
      this.others++;
    }
  }
  async get(k: string) {
    if (k.startsWith('log/')) await this.others_commit();
    return this.inner.get(k);
  }
  async set(k: string, d: Uint8Array | string, c?: KvCondition) {
    if (k.startsWith('log/')) await this.others_commit();
    const r = await this.inner.set(k, d, c);
    if (!r.ok && k.startsWith('log/')) this.lost++;
    return r;
  }
  delete(k: string) {
    return this.inner.delete(k);
  }
  list(p: string) {
    return this.inner.list(p);
  }
}

describe('a settlement under other players’ traffic', () => {
  for (const everyMs of [50, 250]) {
    it(`commits within a few attempts while others commit every ${everyMs} ms`, async () => {
      const clock = { now: T0 };
      const quiet = new MemoryKv();
      await setup(quiet, clock);
      const kv = new BusyKv(everyMs, 'human-1', T0);
      for (const k of [...(await quiet.list('log/')), ...(await quiet.list('snap/'))])
        await kv.inner.set(k, (await quiet.get(k))!.data);
      const g = new KvGame(kv, { seed: 7, now: () => clock.now, monthMs: MONTH });
      await g.refresh();
      const month = g.current.markets.lagos!.month;
      // Each settlement computes for longer than the gap between others' commits.
      hooks.settleMs = everyMs * 3;
      clock.now = T0 + MONTH + 1;
      const t = performance.now();
      const r = await g.execute(null, { type: 'market.settle', market: 'lagos', monthMs: MONTH });
      expect(r.ok).toBe(true);
      expect(kv.lost).toBeLessThanOrEqual(3);
      expect(performance.now() - t).toBeLessThan(hooks.settleMs + 2_000);
      expect(g.current.markets.lagos!.month).toBe(month + 1);
      // The clock too, with others still committing.
      clock.now = T0 + 2 * MONTH + 1;
      const due = engine.dueSettlements(g.current, clock.now, MONTH).length;
      expect(due).toBeGreaterThan(MARKETS.length);
      expect(await g.tick()).toBe(due);
      expect(kv.lost).toBeLessThanOrEqual(6);
      expect(kv.others).toBeGreaterThan(0);
      // Everyone else's commits and the settlements replay to the same world.
      hooks.settleMs = 0;
      kv.stopped = true;
      await g.refresh();
      const fresh = new KvGame(await logOnly(kv.inner), { seed: 7, now: () => clock.now });
      await fresh.refresh();
      expect(fresh.current).toEqual(g.current);
    });
  }

  it('a committed settlement that fails to compute is the same no-op live and in replay', async () => {
    const kv = new MemoryKv();
    const clock = { now: T0 };
    const notes: string[] = [];
    const g = await setup(kv, clock, (m) => notes.push(m));
    const before = g.current;
    hooks.failSettle = true;
    clock.now = T0 + MONTH + 1;
    const r = await g.execute(null, { type: 'market.settle', market: 'lagos', monthMs: MONTH });
    expect(r.ok).toBe(false);
    expect(notes).toContain('committed command did not run');
    expect(g.current.version).toBe(before.version + 1);
    expect(same(g.current)).toEqual(same(before));
    const fresh = new KvGame(await logOnly(kv), { seed: 7, now: () => clock.now });
    await fresh.refresh();
    expect(fresh.current.version).toBe(g.current.version);
    expect(same(fresh.current)).toEqual(same(before));
    // A cheap refusal commits nothing.
    hooks.failSettle = false;
    const refused = await g.execute(null, { type: 'market.settle', market: 'dubai' });
    expect(refused.ok).toBe(false);
    expect((await entries(kv)).length).toBe(g.current.version);
  });
});

describe('catching up', () => {
  it('jumps to a snapshot when behind by a settlement or many entries, to the world a full replay gives', async () => {
    const kv = new MemoryKv();
    const clock = { now: T0 };
    const writer = await setup(kv, clock);
    const notes: string[] = [];
    const behind = new KvGame(kv, {
      seed: 7,
      now: () => clock.now,
      monthMs: MONTH,
      log: (m) => notes.push(m),
    });
    await behind.refresh();

    // Many entries behind: replays some, then finds a snapshot past them.
    for (let i = 0; i < SNAPSHOT_EVERY * 2 + 3; i++)
      await writer.execute(null, { type: 'market.data', market: 'lagos', unitsPerUsd: 1500 + i });
    await behind.refresh();
    expect(notes).toContain('caught up from snapshot');
    expect(behind.current).toEqual(writer.current);

    // Behind by a settlement: no recomputing it.
    notes.length = 0;
    clock.now = T0 + MONTH + 1;
    await writer.tick();
    hooks.failSettle = true; // computing the settlement here would make a different world
    await behind.refresh();
    hooks.failSettle = false;
    expect(notes).toEqual(['caught up from snapshot']);
    expect(behind.current).toEqual(writer.current);

    // A full replay of the log agrees.
    const fresh = new KvGame(await logOnly(kv), { seed: 7, now: () => clock.now });
    await fresh.refresh();
    expect(same(fresh.current)).toEqual(same(behind.current));
    expect(fresh.current.version).toBe(behind.current.version);
  });

  it('replays a settlement whose snapshot was never written (the function died first)', async () => {
    const kv = new MemoryKv();
    const clock = { now: T0 };
    const g = await setup(kv, clock);
    clock.now = T0 + MONTH + 1;
    await g.tick();
    const keys = await kv.list('snap/');
    await kv.delete(keys.at(-1)!);
    const cold = new KvGame(kv, { seed: 7, now: () => clock.now });
    await cold.refresh();
    expect(cold.current).toEqual(g.current);
  });
});
