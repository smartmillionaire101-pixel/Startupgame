/**
 * The bookkeeping behind people's sprites and portraits (../../city/
 * PersonSprite.tsx, ../../avatar/PersonPortrait.tsx), with no three.js in it:
 * what a picture is keyed by, an LRU of the pictures made this session, a
 * render queue (one picture at a time, deduplicated, cancellable, the newest
 * request first) and an optional persistent copy in CacheStorage, so a
 * returning player's people appear without three.js or the models loading.
 *
 * The drawing itself is ./sprite.ts, imported only when a picture is due.
 * Unit-tested: test/person-sprite.test.ts.
 */
import type { AvatarLook } from '../../city/art';
import type { PoseId } from '../../interiors3d/character';
import { webglAvailable } from '../quality';

/** Bump when the pictures would come out differently (lighting, framing, models). */
export const SPRITE_VERSION = 2;

/** Every pose the 3D person has (../../interiors3d/character.ts `pose`). */
export type SpritePose = PoseId;
export const SPRITE_POSES: readonly SpritePose[] = [
  'stand',
  'idle',
  'walk',
  'run',
  'sit',
  'dance',
  'eat',
  'drink',
  'type',
  'read',
  'play',
  'cheer',
  'wave',
  'chat',
  'present',
  'clap',
  'browse',
  'sing',
  'squat',
  'lift',
  'kick',
  'stir',
  'cut',
  'lie',
  'lieSide',
];

/** Seated poses (on a 0.45 m seat, feet on the floor). */
export const SEATED = new Set<SpritePose>(['sit', 'eat', 'drink', 'type', 'read', 'play']);

/**
 * The camera's side of the person: front, three-quarter (their left side
 * turned towards you), side (their left profile), back, or top (from high
 * above, for a map).
 */
export type SpriteAngle = 'front' | 'three-quarter' | 'side' | 'back' | 'top';

export interface SpriteSpec {
  /** A full figure (feet at the anchor) or a head-and-shoulders portrait. */
  kind: 'body' | 'portrait';
  look: AvatarLook;
  pose: SpritePose;
  angle: SpriteAngle;
  /** 0..1: the moment of the pose (a walk's stride, a wave's swing). */
  phase: number;
  /** The picture's height in device pixels (bucketed: ./spriteCache `bucketPx`). */
  px: number;
}

/**
 * The full figure's picture in `AvatarFigure` units (feet at 0,0, a person
 * about 38 tall, x to the right, y down): the same box the wardrobe draws
 * its figures in, so a sprite drops in where the 2D figure was.
 */
export const FRAME = { x: -16, y: -48, w: 32, h: 50 } as const;
/**
 * Poses whose hands go above the head or out to the side (cheering, dancing,
 * a singer's arm): drawn in a bigger box, `REACH_FRAME`, with the same feet
 * and the same scale, so the person is exactly where and as big as in
 * `FRAME`; only the hands overflow it (callers let SVG overflow show).
 */
export const REACH_POSES: ReadonlySet<SpritePose> = new Set<SpritePose>(['cheer', 'dance', 'sing']);
export const REACH_FRAME = { x: -25, y: -60, w: 50, h: 62 } as const;
/** The box a pose's picture covers (feet at 0,0, AvatarFigure units). */
export const frameFor = (pose: SpritePose) => (REACH_POSES.has(pose) ? REACH_FRAME : FRAME);

/** AvatarFigure units per metre (a 1.75 m person stands 38 tall). */
export const UNITS_PER_M = 38 / 1.75;

const BODY_PX = [48, 64, 96, 128, 192, 256, 384, 512];
const PORTRAIT_PX = [48, 64, 96, 128, 192, 256, 320];

/** The picture size to draw for `px` device pixels: the next bucket up (so pictures are shared). */
export function bucketPx(px: number, kind: SpriteSpec['kind'] = 'body'): number {
  const b = kind === 'portrait' ? PORTRAIT_PX : BODY_PX;
  const want = Number.isFinite(px) ? Math.max(1, px) : b[2]!;
  for (const x of b) if (x >= want) return x;
  return b[b.length - 1]!;
}

/** A look as a stable string: keys in order, empty and 'none' fields dropped. */
export function lookKey(look: AvatarLook): string {
  const rec = look as unknown as Record<string, unknown>;
  const keys = Object.keys(rec)
    .filter((k) => rec[k] !== undefined && rec[k] !== null && rec[k] !== '' && rec[k] !== 'none')
    .sort();
  return keys.map((k) => `${k}=${String(rec[k]).toLowerCase()}`).join(';');
}

/** The cache key of a picture. */
export function spriteKey(s: SpriteSpec): string {
  const phase = Math.round((s.phase % 1) * 8) / 8;
  return `v${SPRITE_VERSION}|${s.kind}|${s.pose}|${s.angle}|${phase}|${s.px}|${lookKey(s.look)}`;
}

/** A short hash of a key (two FNV-1a passes, 16 hex digits): the persistent cache's name for it. */
export function hashKey(k: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ k.length;
  for (let i = 0; i < k.length; i++) {
    const c = k.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c ^ (i & 0xff), 0x01000197) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** Least-recently-used map with a size cap. */
export class Lru<V> {
  private m = new Map<string, V>();
  constructor(readonly max: number) {}
  get(k: string): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  has(k: string) {
    return this.m.has(k);
  }
  set(k: string, v: V) {
    this.m.delete(k);
    this.m.set(k, v);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value!);
  }
  get size() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
}

interface Job<T> {
  key: string;
  run: () => Promise<T>;
  /** Callers still waiting on it. */
  want: number;
  resolve: (v: T | null) => void;
  promise: Promise<T | null>;
  started: boolean;
}

/**
 * A render queue: at most `concurrency` jobs at once, a job asked for twice
 * is done once, the newest request goes first (what was just scrolled to),
 * and a job nobody waits for any more is dropped before it starts. Between
 * jobs it gives the page a breath (`pause`), so a screenful of people never
 * blocks a frame for long.
 */
export class RenderQueue<T> {
  private waiting: Job<T>[] = [];
  private jobs = new Map<string, Job<T>>();
  private running = 0;
  constructor(
    readonly concurrency = 1,
    private pause: () => Promise<void> = () => new Promise((r) => setTimeout(r, 0)),
  ) {}

  /** Ask for a job; `cancel` says this caller no longer wants it. Resolves null if dropped or failed. */
  request(key: string, run: () => Promise<T>): { promise: Promise<T | null>; cancel: () => void } {
    let job = this.jobs.get(key);
    if (job) {
      job.want++;
      if (!job.started) {
        // Asked for again: to the front.
        this.waiting = this.waiting.filter((j) => j !== job);
        this.waiting.push(job);
      }
    } else {
      let resolve!: (v: T | null) => void;
      const promise = new Promise<T | null>((r) => (resolve = r));
      job = { key, run, want: 1, resolve, promise, started: false };
      this.jobs.set(key, job);
      this.waiting.push(job);
      this.pump();
    }
    const j = job;
    let done = false;
    return {
      promise: j.promise,
      cancel: () => {
        if (done) return;
        done = true;
        j.want--;
        if (j.want <= 0 && !j.started) {
          this.waiting = this.waiting.filter((x) => x !== j);
          this.jobs.delete(j.key);
          j.resolve(null);
        }
      },
    };
  }

  /** Jobs not yet started. */
  get pending() {
    return this.waiting.length;
  }
  get active() {
    return this.running;
  }

  private pump() {
    while (this.running < this.concurrency && this.waiting.length) {
      const job = this.waiting.pop()!;
      job.started = true;
      this.running++;
      void (async () => {
        let out: T | null = null;
        try {
          out = await job.run();
        } catch {
          out = null;
        }
        this.jobs.delete(job.key);
        job.resolve(out);
        await this.pause();
        this.running--;
        this.pump();
      })();
    }
  }
}

/** Where pictures persist between visits (CacheStorage here; a Map in tests). */
export interface SpriteStore {
  get(hash: string): Promise<string | null>;
  put(hash: string, url: string): Promise<void>;
}

const CACHE_PREFIX = 'runway-sprites-';
const cacheName = () => `${CACHE_PREFIX}v${SPRITE_VERSION}`;
const reqUrl = (hash: string) => `/__runway-sprite/${hash}`;

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

/** CacheStorage, where the browser has it (a secure page); null otherwise. Old versions are cleared. */
export function cacheStorageStore(): SpriteStore | null {
  try {
    if (typeof caches === 'undefined' || typeof window === 'undefined') return null;
  } catch {
    return null;
  }
  let open: Promise<Cache | null> | null = null;
  const cache = () =>
    (open ??= (async () => {
      try {
        for (const n of await caches.keys())
          if (n.startsWith(CACHE_PREFIX) && n !== cacheName()) void caches.delete(n);
        return await caches.open(cacheName());
      } catch {
        return null;
      }
    })());
  return {
    async get(hash) {
      try {
        const c = await cache();
        const r = await c?.match(reqUrl(hash));
        return r ? await blobToDataUrl(await r.blob()) : null;
      } catch {
        return null;
      }
    },
    async put(hash, url) {
      try {
        const c = await cache();
        if (!c) return;
        const blob = await (await fetch(url)).blob();
        await c.put(reqUrl(hash), new Response(blob, { headers: { 'content-type': blob.type } }));
      } catch {
        /* full or blocked: this session's copy will do */
      }
    },
  };
}

/** What a renderer gives back: the picture, and whether it may be kept between visits. */
export interface Rendered {
  url: string;
  /** False for the far (low-detail) models a software GPU uses. */
  persist: boolean;
}

/**
 * Pictures by spec: the session's LRU, else the persistent store, else drawn
 * (through the queue). `render` returns null when it can't draw (no WebGL,
 * the models failed): the caller keeps its 2D fallback.
 */
export function createSpriteSource(opts: {
  render: (s: SpriteSpec) => Promise<Rendered | null>;
  store?: SpriteStore | null;
  max?: number;
  queue?: RenderQueue<string>;
}) {
  const lru = new Lru<string>(opts.max ?? 400);
  const queue = opts.queue ?? new RenderQueue<string>(1);
  const failed = new Set<string>();
  return {
    /** A picture already made this session (synchronously), else undefined. */
    peek(s: SpriteSpec): string | undefined {
      return lru.get(spriteKey(s));
    },
    /** The picture, or null if it can't be drawn (or the request was cancelled). */
    request(s: SpriteSpec): { promise: Promise<string | null>; cancel: () => void } {
      const key = spriteKey(s);
      const hit = lru.get(key);
      if (hit) return { promise: Promise.resolve(hit), cancel: () => {} };
      if (failed.has(key)) return { promise: Promise.resolve(null), cancel: () => {} };
      const hash = hashKey(key);
      let cancelled = false;
      let queued: { cancel: () => void } | null = null;
      // The persistent copy first (not queued behind drawing: it's only a read).
      const promise = (async () => {
        const kept = opts.store ? await opts.store.get(hash) : null;
        if (kept) {
          lru.set(key, kept);
          return kept;
        }
        if (cancelled) return null;
        const q = queue.request(key, async () => {
          const again = lru.get(key);
          if (again) return again;
          const out = await opts.render(s);
          if (!out) {
            failed.add(key);
            throw new Error('no picture');
          }
          lru.set(key, out.url);
          if (out.persist && opts.store) void opts.store.put(hash, out.url);
          return out.url;
        });
        queued = q;
        return q.promise;
      })();
      return {
        promise,
        cancel: () => {
          cancelled = true;
          queued?.cancel();
        },
      };
    },
    lru,
    queue,
  };
}

/**
 * Whether people are drawn from the 3D model at all: WebGL works, and
 * neither the CC0 models (`runway.models` = off) nor the sprites
 * (`runway.sprites` = off) are turned off. Never in tests (jsdom).
 */
export function spritesEnabled(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    if (localStorage.getItem('runway.models') === 'off') return false;
    if (localStorage.getItem('runway.sprites') === 'off') return false;
  } catch {
    /* storage blocked: on */
  }
  return webglAvailable();
}

let source: ReturnType<typeof createSpriteSource> | null = null;
/** The game's one picture source (three.js and ./sprite.ts load with the first picture drawn). */
export function spriteSource() {
  return (source ??= createSpriteSource({
    render: (s) => import('./sprite').then((m) => m.renderSprite(s)),
    store: cacheStorageStore(),
  }));
}
