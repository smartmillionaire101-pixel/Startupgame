/**
 * PersonSprite / PersonPortrait: the picture cache's keys, the LRU, the
 * render queue and the picture source, and the 2D fallback (unit tests run
 * without WebGL, so the components always draw the 2D figure / portrait).
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { avatarLook, type AvatarLook } from '../src/city/art';
import { PersonSprite } from '../src/city/PersonSprite';
import { PersonPortraitOf } from '../src/avatar/PersonPortrait';
import {
  FRAME,
  Lru,
  REACH_FRAME,
  frameFor,
  RenderQueue,
  bucketPx,
  createSpriteSource,
  hashKey,
  lookKey,
  spriteKey,
  spritesEnabled,
  type SpriteSpec,
  type SpriteStore,
} from '../src/three-kit/humans/spriteCache';

afterEach(cleanup);

const LOOK: AvatarLook = {
  skin: '#8d5524',
  hair: '#2b1b10',
  hairStyle: 'afro',
  top: '#16a34a',
  bottom: '#1e293b',
  accessory: 'none',
  gender: 'male',
  topStyle: 'kaftan',
  shoes: 'sandals',
};
const spec = (o: Partial<SpriteSpec> = {}): SpriteSpec => ({
  kind: 'body',
  look: LOOK,
  pose: 'stand',
  angle: 'front',
  phase: 0,
  px: 128,
  ...o,
});
const tick = () => new Promise((r) => setTimeout(r, 0));
const instant = () => Promise.resolve();

describe('sprite keys', () => {
  it('buckets sizes up, within limits', () => {
    expect(bucketPx(40)).toBe(48);
    expect(bucketPx(100)).toBe(128);
    expect(bucketPx(128)).toBe(128);
    expect(bucketPx(5000)).toBe(512);
    expect(bucketPx(NaN)).toBe(96);
    expect(bucketPx(300, 'portrait')).toBe(320);
    expect(bucketPx(900, 'portrait')).toBe(320);
  });

  it('keys a look by what it is, not how it was written', () => {
    const a = lookKey(LOOK);
    const b = lookKey({ ...LOOK, glasses: 'none', headwear: undefined, top: '#16A34A' });
    expect(b).toBe(a);
    expect(lookKey({ ...LOOK, hairStyle: 'twists' })).not.toBe(a);
    expect(lookKey({ ...LOOK, shoes: 'heels' })).not.toBe(a);
  });

  it('keys every input that changes the picture', () => {
    const k = spriteKey(spec());
    expect(spriteKey(spec())).toBe(k);
    for (const o of [
      { pose: 'walk' as const },
      { angle: 'side' as const },
      { px: 256 },
      { kind: 'portrait' as const },
      { phase: 0.5 },
      { look: { ...LOOK, skin: '#ffdbac' } },
    ])
      expect(spriteKey(spec(o))).not.toBe(k);
    expect(hashKey(k)).toMatch(/^[0-9a-f]{16}$/);
    expect(hashKey(k)).toBe(hashKey(k));
    expect(hashKey(spriteKey(spec({ pose: 'sit' })))).not.toBe(hashKey(k));
  });
});

describe('Lru', () => {
  it('evicts the least recently used', () => {
    const l = new Lru<number>(2);
    l.set('a', 1);
    l.set('b', 2);
    expect(l.get('a')).toBe(1);
    l.set('c', 3);
    expect(l.has('b')).toBe(false);
    expect(l.has('a')).toBe(true);
    expect(l.size).toBe(2);
  });
});

describe('RenderQueue', () => {
  it('runs one at a time, newest first, once per key', async () => {
    const q = new RenderQueue<string>(1, instant);
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const job = (k: string, wait?: Promise<void>) => async () => {
      order.push(k);
      if (wait) await wait;
      return k;
    };
    const a = q.request('a', job('a', gate));
    const b = q.request('b', job('b'));
    const c = q.request('c', job('c'));
    const c2 = q.request('c', job('c-again'));
    expect(q.active).toBe(1);
    expect(q.pending).toBe(2);
    release();
    expect(await a.promise).toBe('a');
    expect(await c.promise).toBe('c');
    expect(await c2.promise).toBe('c');
    expect(await b.promise).toBe('b');
    expect(order).toEqual(['a', 'c', 'b']);
  });

  it('drops a job nobody wants before it starts, and resolves null on failure', async () => {
    const q = new RenderQueue<string>(1, instant);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const ran: string[] = [];
    const first = q.request('first', async () => {
      await gate;
      return 'first';
    });
    const gone = q.request('gone', async () => {
      ran.push('gone');
      return 'gone';
    });
    const kept = q.request('gone', async () => 'x');
    gone.cancel();
    expect(q.pending).toBe(1); // still wanted by `kept`
    kept.cancel();
    expect(q.pending).toBe(0);
    expect(await gone.promise).toBeNull();
    const bad = q.request('bad', async () => {
      throw new Error('no GL');
    });
    release();
    expect(await first.promise).toBe('first');
    expect(await bad.promise).toBeNull();
    expect(ran).toEqual([]);
  });
});

describe('createSpriteSource', () => {
  const memStore = () => {
    const m = new Map<string, string>();
    const store: SpriteStore = {
      get: async (h) => m.get(h) ?? null,
      put: async (h, u) => void m.set(h, u),
    };
    return { m, store };
  };

  it('draws once, keeps the picture, and persists only what may be kept', async () => {
    const { m, store } = memStore();
    let drawn = 0;
    const src = createSpriteSource({
      store,
      queue: new RenderQueue<string>(1, instant),
      render: async (s) => {
        drawn++;
        return { url: `data:${s.pose}`, persist: s.pose !== 'walk' };
      },
    });
    expect(src.peek(spec())).toBeUndefined();
    expect(await src.request(spec()).promise).toBe('data:stand');
    expect(src.peek(spec())).toBe('data:stand');
    expect(await src.request(spec()).promise).toBe('data:stand');
    expect(drawn).toBe(1);
    await tick();
    expect(m.size).toBe(1);
    await src.request(spec({ pose: 'walk' })).promise;
    await tick();
    expect(m.size).toBe(1);
  });

  it('reads a kept picture without drawing', async () => {
    const { m, store } = memStore();
    m.set(hashKey(spriteKey(spec())), 'data:kept');
    let drawn = 0;
    const src = createSpriteSource({
      store,
      queue: new RenderQueue<string>(1, instant),
      render: async () => {
        drawn++;
        return { url: 'data:new', persist: true };
      },
    });
    expect(await src.request(spec()).promise).toBe('data:kept');
    expect(drawn).toBe(0);
  });

  it('gives null (the 2D fallback) when it cannot draw, and does not try again', async () => {
    let tries = 0;
    const src = createSpriteSource({
      queue: new RenderQueue<string>(1, instant),
      render: async () => {
        tries++;
        return null;
      },
    });
    expect(await src.request(spec()).promise).toBeNull();
    expect(await src.request(spec()).promise).toBeNull();
    expect(tries).toBe(1);
  });
});

describe('fallback (no WebGL in tests)', () => {
  it('is off in jsdom', () => {
    expect(spritesEnabled()).toBe(false);
  });

  it('PersonSprite draws the 2D figure, feet at the anchor, in SVG and HTML', () => {
    const look = avatarLook('f-engineer', 'p1', 'female');
    const { container } = render(
      <svg>
        <PersonSprite look={look} pose="walk" />
      </svg>,
    );
    const g = container.querySelector('g.person-sprite')!;
    expect(g.getAttribute('data-sprite')).toBe('off');
    expect(g.getAttribute('data-pose')).toBe('walk');
    const fig = g.querySelector('.city-avatar-fig')!;
    expect(fig.getAttribute('data-hair')).toBe(look.hairStyle);
    expect(g.querySelector('image')).toBeNull();
    const frame = g.querySelector(':scope > rect')!;
    expect(Number(frame.getAttribute('y')) + Number(frame.getAttribute('height'))).toBe(
      FRAME.y + FRAME.h,
    );
    cleanup();
    const html = render(<PersonSprite html look={look} height={100} label="Me" />).container;
    const svg = html.querySelector('svg.person-sprite-box')!;
    expect(svg.getAttribute('height')).toBe('100');
    expect(svg.getAttribute('width')).toBe('64');
    expect(svg.getAttribute('aria-label')).toBe('Me');
    expect(svg.querySelector('.city-avatar-fig')).not.toBeNull();
  });

  it('a seated pose falls back to the seated figure', () => {
    const { container } = render(
      <svg>
        <PersonSprite look={LOOK} pose="eat" />
      </svg>,
    );
    expect(container.querySelector('.act-seated .city-avatar-fig')).not.toBeNull();
  });

  it('PersonPortraitOf draws the flat portrait, with the same attributes as PortraitOf', () => {
    const { container } = render(<PersonPortraitOf look={LOOK} size={72} label="Ade" />);
    const svg = container.querySelector('svg.portrait')!;
    expect(svg.getAttribute('data-sprite')).toBe('off');
    expect(svg.getAttribute('data-hair')).toBe('afro');
    expect(svg.getAttribute('data-skin')).toBe(LOOK.skin);
    expect(svg.getAttribute('width')).toBe('72');
    expect(svg.getAttribute('aria-label')).toBe('Ade');
    expect(svg.querySelector('[data-part="face"]')).not.toBeNull();
    expect(svg.querySelector('image')).toBeNull();
  });
});

describe('poses that reach', () => {
  it('cheer, dance and sing get a bigger box with the same feet and scale', () => {
    for (const p of ['cheer', 'dance', 'sing'] as const) expect(frameFor(p)).toBe(REACH_FRAME);
    expect(frameFor('stand')).toBe(FRAME);
    expect(frameFor('wave')).toBe(FRAME);
    // The feet line is the same, and it contains the standing box.
    expect(REACH_FRAME.y + REACH_FRAME.h).toBe(FRAME.y + FRAME.h);
    expect(REACH_FRAME.x).toBeLessThan(FRAME.x);
    expect(REACH_FRAME.y).toBeLessThan(FRAME.y);
    expect(REACH_FRAME.x + REACH_FRAME.w / 2).toBe(0);
  });
});
