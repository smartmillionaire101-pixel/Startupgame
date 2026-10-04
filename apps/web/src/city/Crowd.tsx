/**
 * Everyone else on the map: ambient AI characters strolling their loops and
 * other players gliding to their latest reported positions. One animation
 * frame loop writes transforms straight to the DOM (no React re-renders);
 * with reduced motion, people stand still and players jump.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AvatarFigure, avatarLook } from './art';
import {
  findPath,
  nearestStreetPoint,
  pathLength,
  pointAlong,
  project,
  TW,
  type CityLayout,
  type Pt,
} from './layout';
import { hash } from './contract';
import { personAt, type AiPerson, type PresenceView } from './people';

const KIND_COLOR: Record<string, string> = {
  partner: '#d97706',
  founder: '#0d9488',
  candidate: '#7c3aed',
  shopper: '#e11d48',
  player: '#2563eb',
  owner: '#ea580c',
  angel: '#ca8a04',
};

interface Glide {
  path: Pt[];
  t0: number;
  ms: number;
  at: Pt;
  dx: number;
  dy: number;
}

/** A tiny deterministic offset so people at the same spot don't stack exactly. */
const jitter = (id: string): Pt => {
  const h = hash(id);
  return { x: ((h % 7) - 3) * 0.05, y: (((h >>> 4) % 7) - 3) * 0.05 };
};

function Figure({
  id,
  name,
  kind,
  bg,
  scale,
  setRef,
}: {
  id: string;
  name: string;
  kind: string;
  bg: string;
  scale: number;
  setRef: (id: string, el: SVGGElement | null) => void;
}) {
  const look = useMemo(() => avatarLook(bg, id), [bg, id]);
  const w = name.length * 5.4 + 16;
  return (
    <g
      ref={(el) => setRef(id, el)}
      data-person={id}
      data-scale={scale}
      className={`city-person city-person-${kind}`}
      transform="translate(-9999,-9999)"
    >
      <rect className="city-hit" x={-11} y={-48} width={22} height={52} fill="transparent" />
      <g className="city-person-fig" transform={`scale(${scale},${scale})`}>
        <AvatarFigure look={look} />
      </g>
      <g className="city-tag" transform={`translate(0 ${-46 * scale - 6})`}>
        <rect x={-w / 2} y={-7.5} width={w} height={14} rx={7} />
        <circle cx={-w / 2 + 7} cy={-0.5} r={2.6} fill={KIND_COLOR[kind]} />
        <text x={5} y={3} textAnchor="middle">
          {name}
        </text>
      </g>
    </g>
  );
}

export const Crowd = memo(function Crowd({
  layout,
  ai,
  players,
  reduced,
}: {
  layout: CityLayout;
  ai: AiPerson[];
  players: PresenceView[];
  reduced: boolean;
}) {
  const els = useRef(new Map<string, SVGGElement>());
  const glides = useRef(new Map<string, Glide>());
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
        const sc = Number(el.dataset.scale ?? 1);
        el.querySelector('.city-person-fig')?.setAttribute(
          'transform',
          `scale(${want === 'left' ? -sc : sc},${sc})`,
        );
      }
    }
    if (walking !== el.classList.contains('is-walking')) el.classList.toggle('is-walking', walking);
  };

  // New positions for other players: glide along the streets to them.
  useEffect(() => {
    const now = performance.now();
    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.id);
      const j = jitter(p.id);
      const target = nearestStreetPoint(layout, { x: p.x, y: p.y });
      const goal = { x: target.x + j.x, y: target.y + j.y };
      const g = glides.current.get(p.id);
      if (!g) {
        glides.current.set(p.id, { path: [goal], t0: now, ms: 0, at: goal, dx: 0, dy: 0 });
        continue;
      }
      if (Math.abs(g.at.x - goal.x) + Math.abs(g.at.y - goal.y) < 0.01) continue;
      const from = nearestStreetPoint(layout, g.at);
      const path = findPath(layout, from, target).map((q) => ({ x: q.x + j.x, y: q.y + j.y }));
      const len = pathLength(path);
      // Far jumps (a new session, travel) snap; short ones glide at walking pace.
      const ms = reduced || len > 40 ? 0 : Math.min(4500, Math.max(700, (len / 3) * 1000));
      glides.current.set(p.id, { path, t0: now, ms, at: g.at, dx: 0, dy: 0 });
    }
    for (const id of [...glides.current.keys()]) if (!seen.has(id)) glides.current.delete(id);
  }, [players, layout, reduced]);

  // Draw a frame: everyone where they should be right now.
  const frame = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    frame.current = () => {
      const now = Date.now();
      for (const a of ai) {
        const s = personAt(a, now);
        place(a.id, s.at, s.dx, s.dy, s.walking && !reduced);
      }
      const pnow = performance.now();
      for (const [id, g] of glides.current) {
        const k = g.ms ? Math.min(1, (pnow - g.t0) / g.ms) : 1;
        const { p, dx, dy } =
          g.path.length > 1 ? pointAlong(g.path, k) : { p: g.path[0]!, dx: 0, dy: 0 };
        g.at = p;
        place(id, p, dx, dy, k < 1);
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
    <g className="city-crowd">
      {ai.map((a) => (
        <Figure
          key={a.id}
          id={a.id}
          name={a.name.split(' ')[0] ?? a.name}
          kind={a.kind}
          bg={a.bg}
          scale={1}
          setRef={setRef}
        />
      ))}
      {players.map((p) => (
        <Figure
          key={p.id}
          id={p.id}
          name={p.name.split(' ')[0] ?? p.name}
          kind="player"
          bg={p.backgroundId}
          scale={1.15}
          setRef={setRef}
        />
      ))}
    </g>
  );
});
