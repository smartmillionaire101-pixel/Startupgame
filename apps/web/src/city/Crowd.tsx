/**
 * Street life (docs/WAVE6-ALIVE-CITY.md §C1): a few anonymous passers-by
 * strolling the pavements. They have no names and no tap target: everyone you
 * can talk to is inside a building ("Who's here"). One animation-frame loop
 * writes transforms straight to the DOM (no React re-renders); with reduced
 * motion, they stand still.
 *
 * Wave 7: people are drawn at map scale and depth-sorted with the buildings.
 * Each figure renders (through a portal) into its own small group, which the
 * map moves into the skyline's depth slot for where the person stands.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AvatarFigure, avatarLook, MAP_FIGURE_SCALE } from './art';
import { project, TW, type Pt } from './layout';
import { personAt, type Walker } from './people';

const SVG_NS = 'http://www.w3.org/2000/svg';

type PlaceDepth = (host: Element, depth: number) => void;

interface Slot {
  el: SVGGElement;
  host: SVGGElement;
}

function Figure({ w, setRef }: { w: Walker; setRef: (id: string, slot: Slot | null) => void }) {
  const look = useMemo(() => avatarLook(w.bg, w.id), [w.bg, w.id]);
  const [host] = useState(() => {
    const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    g.setAttribute('pointer-events', 'none');
    return g;
  });
  useEffect(() => () => host.remove(), [host]);
  return createPortal(
    <g
      ref={(el) => setRef(w.id, el ? { el, host } : null)}
      data-walker={w.id}
      className="city-person city-passerby"
      transform="translate(-9999,-9999)"
    >
      <g className="city-person-fig" transform={`scale(${MAP_FIGURE_SCALE},${MAP_FIGURE_SCALE})`}>
        <AvatarFigure look={look} />
      </g>
    </g>,
    host,
  );
}

export const Crowd = memo(function Crowd({
  walkers,
  reduced,
  paused = false,
  placeDepth,
}: {
  walkers: Walker[];
  reduced: boolean;
  /** The map is covered (a place's scene): nobody moves meanwhile. */
  paused?: boolean;
  /** Put a person's group into the depth slot for `depth` (x + y in tiles). */
  placeDepth?: PlaceDepth;
}) {
  const els = useRef(new Map<string, Slot>());
  const groupRef = useRef<SVGGElement>(null);
  const setRef = useMemo(
    () => (id: string, slot: Slot | null) => {
      if (slot) els.current.set(id, slot);
      else els.current.delete(id);
    },
    [],
  );

  const place = (id: string, p: Pt, dx: number, dy: number, walking: boolean) => {
    const slot = els.current.get(id);
    if (!slot) return;
    const { el, host } = slot;
    const s = project(p.x, p.y);
    el.setAttribute('transform', `translate(${s.x.toFixed(1)},${s.y.toFixed(1)})`);
    if (placeDepth) placeDepth(host, p.x + p.y);
    else if (groupRef.current && host.parentNode !== groupRef.current)
      groupRef.current.appendChild(host);
    const sdx = (dx - dy) * TW;
    if (Math.abs(sdx) > 0.001) {
      const want = sdx < 0 ? 'left' : 'right';
      if (el.dataset.face !== want) {
        el.dataset.face = want;
        const k = MAP_FIGURE_SCALE;
        el.querySelector('.city-person-fig')?.setAttribute(
          'transform',
          `scale(${want === 'left' ? -k : k},${k})`,
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
    if (paused) return;
    if (reduced) {
      // Standing still: one more frame once the map's depth slots exist.
      const id = requestAnimationFrame(() => frame.current());
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      // About 15 frames a second is plenty for a stroll at map scale, and much
      // kinder to phones (each step repaints the map); nothing at all while
      // the tab is hidden.
      if (t - last > 64 && document.visibilityState !== 'hidden') {
        last = t;
        frame.current();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced, walkers, paused]);

  return (
    <g ref={groupRef} className="city-crowd" pointerEvents="none" aria-hidden="true">
      {walkers.map((w) => (
        <Figure key={w.id} w={w} setRef={setRef} />
      ))}
    </g>
  );
});
