/**
 * The React side of people's pictures (./spriteCache.ts): asks for a picture
 * once its element is on screen (or near it), at the size it is drawn at
 * (device pixels, up to DPR 2), and hands back its URL when it's ready, or
 * null meanwhile and for good where it can't be drawn (no WebGL, the models
 * off or failed, tests): the caller shows its 2D drawing until then. No
 * three.js here: it loads with the first picture actually drawn.
 */
import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { AvatarLook } from '../../city/art';
import {
  bucketPx,
  spriteKey,
  spriteSource,
  spritesEnabled,
  type SpriteAngle,
  type SpritePose,
  type SpriteSpec,
} from './spriteCache';

export interface SpriteWant {
  kind: SpriteSpec['kind'];
  look: AvatarLook;
  pose?: SpritePose;
  angle?: SpriteAngle;
  phase?: number;
  /** The picture's height in CSS pixels, if known (else measured from `ref`). */
  cssPx?: number;
}

const dpr = () =>
  Math.min(2, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));

/**
 * The picture for `want`, drawn when `ref`'s element comes into view.
 * `ref` should be the box the picture fills (its height is the picture's).
 */
export function useSprite(
  want: SpriteWant,
  ref: RefObject<Element | null>,
): { url: string | null; state: 'off' | 'loading' | 'ready' | 'failed' } {
  const [on] = useState(spritesEnabled);
  const [measured, setMeasured] = useState<number | null>(null);
  const cssPx = want.cssPx ?? measured;
  const [seen, setSeen] = useState(false);
  const pose = want.pose ?? 'stand';
  const angle = want.angle ?? (want.kind === 'portrait' ? 'three-quarter' : 'front');
  const phase = want.phase ?? 0;
  const lookJson = JSON.stringify(want.look);
  const px = cssPx ? bucketPx(cssPx * dpr(), want.kind) : null;
  const spec = useMemo<SpriteSpec | null>(
    () =>
      px
        ? {
            kind: want.kind,
            look: JSON.parse(lookJson) as AvatarLook,
            pose,
            angle,
            phase,
            px,
          }
        : null,
    [want.kind, lookJson, pose, angle, phase, px],
  );
  const key = spec ? spriteKey(spec) : null;
  // A picture made already (this session) shows at once, with no 2D frame first.
  const made = on && spec ? spriteSource().peek(spec) : undefined;
  const [got, setGot] = useState<{ key: string; url: string } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  // On screen (or nearly): measure the box and start.
  useEffect(() => {
    if (!on || seen) return;
    const el = ref.current;
    if (!el) return;
    const measure = (h: number) => {
      if (!want.cssPx && h > 0) setMeasured(h);
      if (h > 0 || want.cssPx) setSeen(true);
    };
    if (typeof IntersectionObserver === 'undefined') {
      measure(el.getBoundingClientRect().height);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) measure(e.boundingClientRect.height);
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [on, seen, ref, want.cssPx]);

  useEffect(() => {
    if (!on || !seen || !spec || !key) return;
    const src = spriteSource();
    if (src.peek(spec)) return;
    let gone = false;
    const r = src.request(spec);
    void r.promise.then((url) => {
      if (gone) return;
      if (url) setGot({ key, url });
      else setFailedKey(key);
    });
    return () => {
      gone = true;
      r.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spec follows key
  }, [on, seen, key]);

  // (A look that changed keeps the last picture until its own is ready: no flash of the 2D one.)
  const failed = !!key && failedKey === key;
  const url = failed ? null : (made ?? got?.url ?? null);
  const state = !on ? 'off' : failed ? 'failed' : url ? 'ready' : 'loading';
  return { url, state };
}
