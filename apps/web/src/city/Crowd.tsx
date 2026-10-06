/**
 * Street life (docs/WAVE6-ALIVE-CITY.md §C1): a few anonymous passers-by
 * strolling the pavements. They have no names and no tap target: everyone you
 * can talk to is inside a building ("Who's here"). One animation-frame loop
 * writes transforms straight to the DOM (no React re-renders); with reduced
 * motion, they stand still.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AvatarFigure, avatarLook } from './art';
import { project, TW, type Pt } from './layout';
import { personAt, type Walker } from './people';

function Figure({
  w,
  setRef,
}: {
  w: Walker;
  setRef: (id: string, el: SVGGElement | null) => void;
}) {
  const look = useMemo(() => avatarLook(w.bg, w.id), [w.bg, w.id]);
  return (
    <g
      ref={(el) => setRef(w.id, el)}
      data-walker={w.id}
      className="city-person city-passerby"
      transform="translate(-9999,-9999)"
    >
      <g className="city-person-fig">
        <AvatarFigure look={look} />
      </g>
    </g>
  );
}

export const Crowd = memo(function Crowd({
  walkers,
  reduced,
}: {
  walkers: Walker[];
  reduced: boolean;
}) {
  const els = useRef(new Map<string, SVGGElement>());
  const setRef = useMemo(
    () => (id: string, el: SVGGElement | null) => {
      if (el) els.current.set(id, el);
      else els.current.delete(id);
    },
    [],
  );

  const place = (id: string, p: Pt, dx: number, dy: number, walking: boolean) => {
    const el = els.current.get(id);
    if (!el) return;
    const s = project(p.x, p.y);
    el.setAttribute('transform', `translate(${s.x.toFixed(1)},${s.y.toFixed(1)})`);
    const sdx = (dx - dy) * TW;
    if (Math.abs(sdx) > 0.001) {
      const want = sdx < 0 ? 'left' : 'right';
      if (el.dataset.face !== want) {
        el.dataset.face = want;
        el.querySelector('.city-person-fig')?.setAttribute(
          'transform',
          `scale(${want === 'left' ? -1 : 1},1)`,
        );
      }
    }
    if (walking !== el.classList.contains('is-walking')) el.classList.toggle('is-walking', walking);
  };

  // Draw a frame: everyone where the clock says.
  const frame = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    frame.current = () => {
      const now = Date.now();
      for (const w of walkers) {
        const s = personAt(w, now);
        place(w.id, s.at, s.dx, s.dy, s.walking && !reduced);
      }
    };
    frame.current();
  });

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      // About 30 frames a second is plenty for a stroll, and kinder to phones.
      if (t - last > 32) {
        last = t;
        frame.current();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <g className="city-crowd" pointerEvents="none" aria-hidden="true">
      {walkers.map((w) => (
        <Figure key={w.id} w={w} setRef={setRef} />
      ))}
    </g>
  );
});
