/**
 * A minimal key-value port with compare-and-swap, so serverless functions
 * can share state safely. `NetlifyKv` wraps Netlify Blobs (strong
 * consistency); `MemoryKv` is the same contract in memory, for tests.
 */
import type { Store as BlobStore } from '@netlify/blobs';

export interface KvEntry {
  data: Uint8Array;
  etag: string;
}

export type KvCondition = { ifMatch: string } | { ifNew: true } | undefined;

export interface Kv {
  get(key: string): Promise<KvEntry | null>;
  /** Write; with a condition, returns ok:false (and writes nothing) when it doesn't hold. */
  set(
    key: string,
    data: Uint8Array | string,
    cond?: KvCondition,
  ): Promise<{ ok: boolean; etag?: string }>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export const kvJson = {
  async get<T>(kv: Kv, key: string): Promise<{ value: T; etag: string } | null> {
    const e = await kv.get(key);
    return e ? { value: JSON.parse(dec.decode(e.data)) as T, etag: e.etag } : null;
  },
  set(kv: Kv, key: string, value: unknown, cond?: KvCondition) {
    return kv.set(key, JSON.stringify(value), cond);
  },
  /**
   * Read-modify-write with optimistic concurrency: retried when another
   * writer got there first. `fn` returns the new value, or undefined to skip.
   */
  async update<T>(
    kv: Kv,
    key: string,
    fn: (current: T | undefined) => T | undefined,
    attempts = 8,
  ): Promise<T | undefined> {
    for (let i = 0; i < attempts; i++) {
      const cur = await kvJson.get<T>(kv, key);
      const next = fn(cur?.value);
      if (next === undefined) return cur?.value;
      const r = await kvJson.set(kv, key, next, cur ? { ifMatch: cur.etag } : { ifNew: true });
      if (r.ok) return next;
    }
    throw new Error(`Too much contention on ${key}`);
  },
};

export class MemoryKv implements Kv {
  private readonly map = new Map<string, KvEntry>();
  private n = 0;

  async get(key: string) {
    const e = this.map.get(key);
    return e ? { data: e.data.slice(), etag: e.etag } : null;
  }

  async set(key: string, data: Uint8Array | string, cond?: KvCondition) {
    const cur = this.map.get(key);
    if (cond && 'ifNew' in cond && cur) return { ok: false };
    if (cond && 'ifMatch' in cond && cur?.etag !== cond.ifMatch) return { ok: false };
    const bytes = typeof data === 'string' ? enc.encode(data) : data.slice();
    const etag = `"${++this.n}"`;
    this.map.set(key, { data: bytes, etag });
    return { ok: true, etag };
  }

  async delete(key: string) {
    this.map.delete(key);
  }

  async list(prefix: string) {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}

export class NetlifyKv implements Kv {
  constructor(private readonly store: BlobStore) {}

  async get(key: string) {
    const r = await this.store.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!r) return null;
    return { data: new Uint8Array(r.data), etag: r.etag ?? '' };
  }

  async set(key: string, data: Uint8Array | string, cond?: KvCondition) {
    const body = typeof data === 'string' ? data : new Blob([data as Uint8Array<ArrayBuffer>]);
    // Netlify returns etags on reads; a store that doesn't (the local dev
    // server) gets plain writes rather than a refused compare-and-swap.
    const r = await this.store.set(
      key,
      body,
      cond && 'ifMatch' in cond
        ? { onlyIfMatch: cond.ifMatch }
        : cond && 'ifNew' in cond
          ? { onlyIfNew: true }
          : {},
    );
    return { ok: r.modified, ...(r.etag ? { etag: r.etag } : {}) };
  }

  async delete(key: string) {
    await this.store.delete(key);
  }

  async list(prefix: string) {
    const r = await this.store.list({ prefix });
    return r.blobs.map((b) => b.key).sort();
  }
}
