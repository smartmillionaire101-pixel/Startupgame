/**
 * Wave 8 §A: hand-drawn landmarks for the real maps, at their real places
 * and (roughly) their real heights: the Golden Gate and Bay Bridges, the
 * Transamerica Pyramid and Salesforce Tower, Tower Bridge, the Shard and the
 * London Eye, the Lekki–Ikoyi Link Bridge, the Cotton Tree and Lumley
 * Beach, the KICC, Burj Khalifa…
 *
 * Drawn in the map's SVG among the buildings. Heights are metres at the
 * same scale as the OSM buildings on the canvas.
 */
import type { ReactNode } from 'react';
import { Box, P, poly, r1, shade } from './art';
import { GEO_KX, GEO_TILE_M } from './geoLayout';
import { project, type Decor, type Pt } from './layout';

/** Metres of height → px. */
const M = (m: number) => m * GEO_KX * 0.8;
/** Metres along the ground → tiles. */
const T = (m: number) => m / GEO_TILE_M;

const pt = (p: { x: number; y: number }) => `${r1(p.x)},${r1(p.y)}`;

/** A point a fraction f along a bridge, `side` tiles across it, raised z px. */
function along(from: Pt, to: Pt, f: number, side: number, z: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const q = project(from.x + dx * f + (-dy / len) * side, from.y + dy * f + (dx / len) * side);
  return { x: q.x, y: q.y - z };
}

function Suspension({
  d,
  towers,
  H,
  deck,
}: {
  d: Decor;
  towers: number[];
  H: number;
  deck: number;
}) {
  const a = d.from!;
  const b = d.to!;
  const col = d.color ?? '#9ca3af';
  const out: ReactNode[] = [];
  const zH = M(H);
  const zD = M(deck);
  const side = T(16);
  // The deck's girders, in the bridge's colour, either side of the road.
  for (const s of [-side, side])
    out.push(
      <line
        key={`deck${s}`}
        x1={r1(along(a, b, 0, s, zD).x)}
        y1={r1(along(a, b, 0, s, zD).y)}
        x2={r1(along(a, b, 1, s, zD).x)}
        y2={r1(along(a, b, 1, s, zD).y)}
        stroke={shade(col, -0.1)}
        strokeWidth="3.5"
      />,
    );
  // Main cables and hangers, on both sides.
  for (const s of [-side, side]) {
    const ends = [0, ...towers, 1];
    let dpath = '';
    for (let i = 0; i + 1 < ends.length; i++) {
      const f0 = ends[i]!;
      const f1 = ends[i + 1]!;
      const z0 = i === 0 ? zD : zH;
      const z1 = i + 1 === ends.length - 1 ? zD : zH;
      const p0 = along(a, b, f0, s, z0);
      const p1 = along(a, b, f1, s, z1);
      const mid = along(a, b, (f0 + f1) / 2, s, zD + M(6));
      // Quadratic through the mid point: control = 2·mid − (p0+p1)/2.
      const cx = 2 * mid.x - (p0.x + p1.x) / 2;
      const cy = 2 * mid.y - (p0.y + p1.y) / 2;
      dpath += `${i ? '' : `M ${pt(p0)} `}Q ${r1(cx)},${r1(cy)} ${pt(p1)} `;
      const n = 10;
      for (let k = 1; k < n; k++) {
        const u = k / n;
        const f = f0 + (f1 - f0) * u;
        const top = {
          x: (1 - u) * (1 - u) * p0.x + 2 * (1 - u) * u * cx + u * u * p1.x,
          y: (1 - u) * (1 - u) * p0.y + 2 * (1 - u) * u * cy + u * u * p1.y,
        };
        const bot = along(a, b, f, s, zD);
        out.push(
          <line
            key={`h${s}${i}${k}`}
            x1={r1(top.x)}
            y1={r1(top.y)}
            x2={r1(bot.x)}
            y2={r1(bot.y)}
            stroke={col}
            strokeWidth="0.6"
            opacity="0.8"
          />,
        );
      }
    }
    out.push(<path key={`cable${s}`} d={dpath} fill="none" stroke={col} strokeWidth="1.8" />);
  }
  // Towers: two legs and cross-braces.
  for (const f of towers) {
    const legs = [-side, side].map((s) => ({
      base: along(a, b, f, s, 0),
      top: along(a, b, f, s, zH + 6),
    }));
    out.push(
      <g key={`t${f}`}>
        {legs.map((l, i) => (
          <line
            key={i}
            x1={r1(l.base.x)}
            y1={r1(l.base.y)}
            x2={r1(l.top.x)}
            y2={r1(l.top.y)}
            stroke={shade(col, -0.08)}
            strokeWidth="6"
          />
        ))}
        {[0.98, 0.75, 0.5, 0.3].map((u) => {
          const p = along(a, b, f, -side, zH * u);
          const q = along(a, b, f, side, zH * u);
          return (
            <line
              key={u}
              x1={r1(p.x)}
              y1={r1(p.y)}
              x2={r1(q.x)}
              y2={r1(q.y)}
              stroke={col}
              strokeWidth="3"
            />
          );
        })}
      </g>,
    );
  }
  return <g data-landmark={d.name}>{out}</g>;
}

function CableStayed({ d }: { d: Decor }) {
  const a = d.from!;
  const b = d.to!;
  const col = d.color ?? '#e5e7eb';
  const mandela = /Mandela/i.test(d.name ?? '');
  const pylons = mandela ? [0.35, 0.68] : [0.42];
  const H = M(mandela ? 42 : 90);
  const zD = M(mandela ? 8 : 12);
  const out: ReactNode[] = [];
  out.push(
    <polyline
      key="deck"
      points={[0, 1].map((f) => pt(along(a, b, f, 0, zD))).join(' ')}
      fill="none"
      stroke={shade(col, -0.35)}
      strokeWidth="5"
    />,
  );
  for (const f of pylons) {
    const base = along(a, b, f, 0, 0);
    const top = along(a, b, f, 0, H);
    for (let k = 1; k <= 7; k++)
      for (const dir of [-1, 1]) {
        const g = f + dir * k * (mandela ? 0.04 : 0.07);
        if (g < 0 || g > 1) continue;
        const q = along(a, b, g, 0, zD);
        const tp = along(a, b, f, 0, H * (0.55 + k * 0.06));
        out.push(
          <line
            key={`c${f}${k}${dir}`}
            x1={r1(tp.x)}
            y1={r1(tp.y)}
            x2={r1(q.x)}
            y2={r1(q.y)}
            stroke={col}
            strokeWidth="0.8"
          />,
        );
      }
    out.push(
      <line
        key={`p${f}`}
        x1={r1(base.x)}
        y1={r1(base.y)}
        x2={r1(top.x)}
        y2={r1(top.y)}
        stroke={mandela ? '#f8fafc' : '#cbd5e1'}
        strokeWidth="5"
      />,
    );
  }
  return <g data-landmark={d.name}>{out}</g>;
}

function Bascule({ d }: { d: Decor }) {
  const a = d.from!;
  const b = d.to!;
  const col = d.color ?? '#1e3a8a';
  const H = M(65);
  const tower = (f: number) => {
    const c = along(a, b, f, 0, 0);
    const w = 16;
    return (
      <g key={f}>
        <rect x={c.x - w / 2} y={c.y - H} width={w} height={H} fill="#d6c7a1" />
        <rect x={c.x - w / 2} y={c.y - H} width={w * 0.4} height={H} fill="#e7dcc0" />
        {[0.3, 0.55, 0.8].map((u) => (
          <rect key={u} x={c.x - 2} y={c.y - H * u - 5} width="4" height="6" fill="#475569" />
        ))}
        <polygon
          points={`${c.x - w / 2 - 1},${c.y - H} ${c.x + w / 2 + 1},${c.y - H} ${c.x},${c.y - H - 18}`}
          fill={col}
        />
        {[-1, 1].map((s) => (
          <polygon
            key={s}
            points={`${c.x + s * (w / 2) - 2},${c.y - H} ${c.x + s * (w / 2) + 2},${c.y - H} ${c.x + s * (w / 2)},${c.y - H - 10}`}
            fill={col}
          />
        ))}
      </g>
    );
  };
  const w1 = along(a, b, 0.37, 0, H * 0.82);
  const w2 = along(a, b, 0.63, 0, H * 0.82);
  const e1 = along(a, b, 0, 0, M(8));
  const e2 = along(a, b, 1, 0, M(8));
  const t1 = along(a, b, 0.37, 0, H * 0.6);
  const t2 = along(a, b, 0.63, 0, H * 0.6);
  const d1 = along(a, b, 0.37, 0, M(9));
  const d2 = along(a, b, 0.63, 0, M(9));
  return (
    <g data-landmark={d.name}>
      <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} stroke="#475569" strokeWidth="4" />
      <line x1={d1.x} y1={d1.y} x2={d2.x} y2={d2.y} stroke={col} strokeWidth="4" />
      <path
        d={`M ${pt(e1)} Q ${pt(along(a, b, 0.2, 0, M(14)))} ${pt(t1)}`}
        stroke={col}
        strokeWidth="2.6"
        fill="none"
      />
      <path
        d={`M ${pt(e2)} Q ${pt(along(a, b, 0.8, 0, M(14)))} ${pt(t2)}`}
        stroke={col}
        strokeWidth="2.6"
        fill="none"
      />
      {tower(0.37)}
      {tower(0.63)}
      <line x1={w1.x} y1={w1.y} x2={w2.x} y2={w2.y} stroke={col} strokeWidth="5" />
      <line
        x1={w1.x}
        y1={w1.y + 7}
        x2={w2.x}
        y2={w2.y + 7}
        stroke={shade(col, 0.35)}
        strokeWidth="2.5"
      />
    </g>
  );
}

/** A tall prism with a tapering top. */
function Tower({
  x,
  y,
  s,
  h,
  color,
  top,
  children,
}: {
  x: number;
  y: number;
  s: number;
  h: number;
  color: string;
  top?: string;
  children?: ReactNode;
}) {
  return (
    <g>
      <polygon
        points={poly(
          P(x - s, y - s),
          P(x + s * 2.4, y - s),
          P(x + s * 2.4, y + s),
          P(x - s, y + s),
        )}
        fill="#0f172a"
        opacity="0.12"
      />
      <Box x={x - s} y={y - s} w={2 * s} d={2 * s} h={h} color={color} top={top} />
      {children}
    </g>
  );
}

/** Light window bands up a tower's two faces. */
function Bands({
  x,
  y,
  s,
  h,
  n,
  color,
}: {
  x: number;
  y: number;
  s: number;
  h: number;
  n: number;
  color: string;
}) {
  const out: ReactNode[] = [];
  for (let i = 1; i < n; i++) {
    const z = (h * i) / n;
    out.push(
      <polyline
        key={i}
        points={poly(P(x - s, y + s, z), P(x + s, y + s, z), P(x + s, y - s, z))}
        fill="none"
        stroke={color}
        strokeWidth="0.6"
        opacity="0.6"
      />,
    );
  }
  return <>{out}</>;
}

function Pyramid({
  x,
  y,
  s,
  h,
  left,
  right,
  stripes,
}: {
  x: number;
  y: number;
  s: number;
  h: number;
  left: string;
  right: string;
  stripes?: string;
}) {
  const apex = P(x, y, h);
  const out: ReactNode[] = [
    <polygon
      key="sh"
      points={poly(P(x - s, y - s), P(x + s * 3, y), P(x - s, y + s))}
      fill="#0f172a"
      opacity="0.12"
    />,
    <polygon key="l" points={poly(P(x - s, y + s), P(x + s, y + s), apex)} fill={left} />,
    <polygon key="r" points={poly(P(x + s, y + s), P(x + s, y - s), apex)} fill={right} />,
  ];
  if (stripes)
    for (let i = 1; i < 14; i++) {
      const k = 1 - i / 14;
      out.push(
        <polyline
          key={i}
          points={poly(
            P(x - s * k, y + s * k, h * (1 - k)),
            P(x + s * k, y + s * k, h * (1 - k)),
            P(x + s * k, y - s * k, h * (1 - k)),
          )}
          fill="none"
          stroke={stripes}
          strokeWidth="0.6"
        />,
      );
    }
  return <>{out}</>;
}

const UMBRELLAS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];

export function GeoSprite({ d }: { d: Decor }): ReactNode {
  const { x, y } = d;
  const c = project(x, y);
  switch (d.sprite) {
    case 'suspension':
      return /Golden Gate/i.test(d.name ?? '') ? (
        <Suspension d={d} towers={[0.27, 0.73]} H={227} deck={3} />
      ) : (
        <Suspension d={d} towers={[0.12, 0.36, 0.62, 0.86]} H={160} deck={3} />
      );
    case 'cable-stayed':
      return <CableStayed d={d} />;
    case 'bascule':
      return <Bascule d={d} />;
    case 'transamerica': {
      const s = T(26);
      const h = M(260);
      return (
        <g data-landmark={d.name}>
          <Pyramid x={x} y={y} s={s} h={h} left="#f5f5f4" right="#d6d3d1" stripes="#a8a29e" />
          <rect x={c.x - 0.8} y={c.y - h - 24} width="1.6" height="26" fill="#e7e5e4" />
        </g>
      );
    }
    case 'salesforce': {
      const s = T(26);
      const h = M(326);
      return (
        <g data-landmark={d.name}>
          <Tower x={x} y={y} s={s} h={h * 0.9} color="#b9c6d2" top="#dbe4ec">
            <Bands x={x} y={y} s={s} h={h * 0.9} n={24} color="#eef2f6" />
          </Tower>
          <Box
            x={x - s * 0.85}
            y={y - s * 0.85}
            w={s * 1.7}
            d={s * 1.7}
            h={h * 0.1}
            z={h * 0.9}
            color="#e2e8f0"
            top="#f8fafc"
          />
        </g>
      );
    }
    case 'shard': {
      const s = T(30);
      const h = M(310);
      const apex = P(x, y, h);
      return (
        <g data-landmark={d.name}>
          <Pyramid
            x={x}
            y={y}
            s={s}
            h={h * 0.97}
            left="#a8c4d8"
            right="#7d9db6"
            stripes="#d8e6f0"
          />
          <polyline
            points={poly(P(x + s * 0.1, y + s * 0.1, h * 0.9), apex)}
            stroke="#e2edf5"
            strokeWidth="1.2"
          />
        </g>
      );
    }
    case 'london-eye': {
      const R = M(60);
      const hub = { x: c.x, y: c.y - M(70) };
      const spokes: ReactNode[] = [];
      for (let k = 0; k < 16; k++) {
        const t = (k / 16) * Math.PI * 2;
        const px = hub.x + Math.cos(t) * R * 0.42;
        const py = hub.y + Math.sin(t) * R;
        spokes.push(
          <line
            key={k}
            x1={hub.x}
            y1={hub.y}
            x2={r1(px)}
            y2={r1(py)}
            stroke="#cbd5e1"
            strokeWidth="0.6"
          />,
          <ellipse
            key={`p${k}`}
            cx={r1(px)}
            cy={r1(py)}
            rx="2.2"
            ry="1.8"
            fill="#e0f2fe"
            stroke="#64748b"
            strokeWidth="0.4"
          />,
        );
      }
      return (
        <g data-landmark={d.name}>
          <line x1={c.x - 12} y1={c.y} x2={hub.x} y2={hub.y} stroke="#e2e8f0" strokeWidth="3" />
          <line x1={c.x + 8} y1={c.y + 2} x2={hub.x} y2={hub.y} stroke="#e2e8f0" strokeWidth="3" />
          <ellipse
            cx={hub.x}
            cy={hub.y}
            rx={R * 0.42}
            ry={R}
            fill="none"
            stroke="#f8fafc"
            strokeWidth="2.6"
          />
          {spokes}
          <circle cx={hub.x} cy={hub.y} r="2.5" fill="#94a3b8" />
        </g>
      );
    }
    case 'big-ben': {
      const s = T(6);
      const h = M(96);
      const cl = P(x, y + s, h * 0.72);
      const [cx, cy] = cl.split(',').map(Number) as [number, number];
      return (
        <g data-landmark={d.name}>
          <Tower x={x} y={y} s={s} h={h * 0.8} color="#d6b97a" top="#c9a95f" />
          <circle cx={cx - 3} cy={cy} r="3.6" fill="#fef9c3" stroke="#78350f" strokeWidth="0.6" />
          <polygon
            points={poly(P(x - s, y + s, h * 0.8), P(x + s, y + s, h * 0.8), P(x, y, h))}
            fill="#334155"
          />
          <polygon
            points={poly(P(x + s, y + s, h * 0.8), P(x + s, y - s, h * 0.8), P(x, y, h))}
            fill="#1e293b"
          />
        </g>
      );
    }
    case 'gherkin': {
      const h = M(180);
      const R = M(28);
      const top = c.y - h;
      return (
        <g data-landmark={d.name}>
          <ellipse cx={c.x + 10} cy={c.y} rx={R * 1.4} ry={R * 0.5} fill="#0f172a" opacity="0.12" />
          <path
            d={`M ${c.x - R * 0.8} ${c.y} C ${c.x - R * 1.2} ${c.y - h * 0.5}, ${c.x - R * 0.7} ${top + 8}, ${c.x} ${top} C ${c.x + R * 0.7} ${top + 8}, ${c.x + R * 1.2} ${c.y - h * 0.5}, ${c.x + R * 0.8} ${c.y} Z`}
            fill="#4b7a8f"
          />
          {Array.from({ length: 9 }, (_, i) => (
            <path
              key={i}
              d={`M ${c.x - R * 0.9 + i * R * 0.25} ${c.y} Q ${c.x - R * 0.3 + i * R * 0.12} ${c.y - h * 0.6} ${c.x + i * 1.2 - 4} ${top + 4}`}
              stroke="#9cc4d4"
              strokeWidth="0.9"
              fill="none"
            />
          ))}
        </g>
      );
    }
    case 'kicc': {
      const s = T(14);
      const h = M(105);
      const cap = P(x, y, h);
      const [kx, ky] = cap.split(',').map(Number) as [number, number];
      return (
        <g data-landmark={d.name}>
          <ellipse cx={c.x + 28} cy={c.y + 6} rx={M(30)} ry={M(10)} fill="#b45309" />
          <path
            d={`M ${c.x + 28 - M(30)} ${c.y + 6} Q ${c.x + 28} ${c.y - M(28)} ${c.x + 28 + M(30)} ${c.y + 6} Z`}
            fill="#c2410c"
          />
          <Tower x={x} y={y} s={s} h={h} color="#c08457" top="#d6a77a">
            <Bands x={x} y={y} s={s} h={h} n={28} color="#fde68a" />
          </Tower>
          <ellipse cx={kx} cy={ky} rx={M(16)} ry={M(5)} fill="#a16207" />
          <rect x={kx - 0.8} y={ky - 16} width="1.6" height="16" fill="#78350f" />
        </g>
      );
    }
    case 'dome': {
      const R = M(55);
      return (
        <g data-landmark={d.name}>
          <ellipse cx={c.x} cy={c.y} rx={R * 1.1} ry={R * 0.4} fill="#0f172a" opacity="0.12" />
          <path
            d={`M ${c.x - R} ${c.y} A ${R} ${R * 0.85} 0 0 1 ${c.x + R} ${c.y} Z`}
            fill="#f8fafc"
          />
          {['#22c55e', '#facc15', '#3b82f6', '#ef4444'].map((col, i) => (
            <path
              key={col}
              d={`M ${c.x - R + i * R * 0.5} ${c.y} A ${R} ${R * 0.85} 0 0 1 ${c.x - R + (i + 1) * R * 0.5} ${c.y - R * 0.2}`}
              stroke={col}
              strokeWidth="2.4"
              fill="none"
              opacity="0.85"
            />
          ))}
        </g>
      );
    }
    case 'burj-khalifa': {
      const h = M(828);
      const steps = [
        [T(30), 0.0, 0.32],
        [T(22), 0.32, 0.55],
        [T(15), 0.55, 0.72],
        [T(9), 0.72, 0.82],
      ] as const;
      return (
        <g data-landmark={d.name}>
          <polygon
            points={poly(P(x - T(30), y - T(30)), P(x + T(160), y), P(x - T(30), y + T(30)))}
            fill="#0f172a"
            opacity="0.1"
          />
          {steps.map(([s, z0, z1]) => (
            <Box
              key={z0}
              x={x - s}
              y={y - s}
              w={2 * s}
              d={2 * s}
              h={h * (z1 - z0)}
              z={h * z0}
              color="#c4d3df"
              top="#e2e8f0"
            />
          ))}
          <polygon
            points={poly(
              P(x - T(4), y + T(4), h * 0.82),
              P(x + T(4), y + T(4), h * 0.82),
              P(x, y, h),
            )}
            fill="#e2e8f0"
          />
          <polygon
            points={poly(
              P(x + T(4), y + T(4), h * 0.82),
              P(x + T(4), y - T(4), h * 0.82),
              P(x, y, h),
            )}
            fill="#94a3b8"
          />
        </g>
      );
    }
    case 'burj-al-arab': {
      const h = M(321);
      const w = M(60);
      return (
        <g data-landmark={d.name}>
          <ellipse
            cx={c.x + 20}
            cy={c.y + 4}
            rx={w * 1.2}
            ry={w * 0.3}
            fill="#0f172a"
            opacity="0.12"
          />
          <path
            d={`M ${c.x - w * 0.5} ${c.y} Q ${c.x + w * 1.1} ${c.y - h * 0.45} ${c.x - w * 0.3} ${c.y - h} L ${c.x - w * 0.5} ${c.y} Z`}
            fill="#f8fafc"
          />
          <line
            x1={c.x - w * 0.55}
            y1={c.y}
            x2={c.x - w * 0.35}
            y2={c.y - h * 1.03}
            stroke="#cbd5e1"
            strokeWidth="3"
          />
          <ellipse
            cx={c.x + w * 0.2}
            cy={c.y - h * 0.82}
            rx={w * 0.22}
            ry={w * 0.05}
            fill="#94a3b8"
          />
        </g>
      );
    }
    case 'cairo-tower': {
      const h = M(187);
      const w = M(14);
      return (
        <g data-landmark={d.name}>
          <path
            d={`M ${c.x - w} ${c.y} L ${c.x - w * 0.7} ${c.y - h * 0.85} L ${c.x + w * 0.7} ${c.y - h * 0.85} L ${c.x + w} ${c.y} Z`}
            fill="#c08457"
          />
          {Array.from({ length: 12 }, (_, i) => (
            <line
              key={i}
              x1={c.x - w * 0.9}
              y1={c.y - (h * 0.85 * i) / 12}
              x2={c.x + w * 0.9}
              y2={c.y - (h * 0.85 * (i + 1)) / 12}
              stroke="#a16207"
              strokeWidth="0.6"
            />
          ))}
          <path
            d={`M ${c.x - w * 0.7} ${c.y - h * 0.85} L ${c.x - w * 1.3} ${c.y - h * 0.94} L ${c.x + w * 1.3} ${c.y - h * 0.94} L ${c.x + w * 0.7} ${c.y - h * 0.85} Z`}
            fill="#92400e"
          />
          <rect x={c.x - 0.8} y={c.y - h} width="1.6" height={h * 0.06} fill="#78350f" />
        </g>
      );
    }
    case 'hillbrow': {
      const h = M(270);
      const w = M(9);
      return (
        <g data-landmark={d.name}>
          <rect x={c.x - w} y={c.y - h * 0.85} width={w * 2} height={h * 0.85} fill="#d6d3d1" />
          <rect x={c.x - w} y={c.y - h * 0.85} width={w * 0.8} height={h * 0.85} fill="#e7e5e4" />
          <ellipse cx={c.x} cy={c.y - h * 0.8} rx={w * 2.6} ry={w * 0.8} fill="#a8a29e" />
          <rect
            x={c.x - w * 2.6}
            y={c.y - h * 0.88}
            width={w * 5.2}
            height={h * 0.08}
            fill="#57534e"
          />
          <rect x={c.x - 1} y={c.y - h} width="2" height={h * 0.12} fill="#dc2626" />
        </g>
      );
    }
    case 'cotton-tree': {
      const h = M(50);
      return (
        <g data-landmark={d.name}>
          <ellipse cx={c.x + 8} cy={c.y + 2} rx={M(34)} ry={M(10)} fill="#0f172a" opacity="0.15" />
          <path
            d={`M ${c.x - 5} ${c.y} L ${c.x - 3} ${c.y - h * 0.6} L ${c.x + 3} ${c.y - h * 0.6} L ${c.x + 5} ${c.y} Z`}
            fill="#78716c"
          />
          <ellipse cx={c.x} cy={c.y - h * 0.75} rx={M(32)} ry={M(13)} fill="#3f7d3a" />
          <ellipse cx={c.x - M(12)} cy={c.y - h * 0.85} rx={M(16)} ry={M(9)} fill="#4d9a45" />
          <ellipse cx={c.x + M(14)} cy={c.y - h * 0.9} rx={M(15)} ry={M(8)} fill="#5aab4f" />
        </g>
      );
    }
    case 'beach': {
      const a = d.from ?? { x, y };
      const b = d.to ?? { x, y };
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(4, Math.min(40, Math.round(len / 1.5)));
      const out: ReactNode[] = [];
      for (let k = 0; k <= n; k++) {
        const p = along(a, b, k / n, (k % 3) * 0.25 - 0.25, 0);
        out.push(
          <g key={k} data-beach-umbrella>
            <line x1={p.x} y1={p.y} x2={p.x} y2={p.y - 11} stroke="#78716c" strokeWidth="1" />
            <path
              d={`M ${p.x - 7} ${p.y - 10} Q ${p.x} ${p.y - 17} ${p.x + 7} ${p.y - 10} Z`}
              fill={UMBRELLAS[k % UMBRELLAS.length]}
            />
          </g>,
        );
      }
      return (
        <g data-landmark={d.name} data-beach={d.name}>
          {out}
        </g>
      );
    }
    case 'theatre': {
      const R = M(70);
      return (
        <g data-landmark={d.name}>
          <ellipse cx={c.x} cy={c.y} rx={R} ry={R * 0.45} fill="#e7e5e4" />
          <path
            d={`M ${c.x - R} ${c.y} Q ${c.x} ${c.y - R * 0.95} ${c.x + R} ${c.y} Z`}
            fill="#d6d3d1"
          />
          {Array.from({ length: 9 }, (_, i) => (
            <line
              key={i}
              x1={c.x - R + (i * R) / 4}
              y1={c.y}
              x2={c.x - R * 0.5 + (i * R) / 8}
              y2={c.y - R * 0.45}
              stroke="#a8a29e"
              strokeWidth="0.8"
            />
          ))}
          <ellipse cx={c.x} cy={c.y - R * 0.48} rx={R * 0.35} ry={R * 0.08} fill="#78716c" />
        </g>
      );
    }
    case 'star-gate': {
      const h = M(30);
      const w = M(40);
      return (
        <g data-landmark={d.name}>
          <rect x={c.x - w} y={c.y - h} width={w * 0.4} height={h} fill="#e7e5e4" />
          <rect x={c.x + w * 0.6} y={c.y - h} width={w * 0.4} height={h} fill="#d6d3d1" />
          <rect x={c.x - w} y={c.y - h - 6} width={w * 2} height="7" fill="#e7e5e4" />
          <polygon
            points={`${c.x},${c.y - h - 22} ${c.x + 4},${c.y - h - 12} ${c.x + 9},${c.y - h - 12} ${c.x + 5},${c.y - h - 7} ${c.x + 6},${c.y - h + 0} ${c.x},${c.y - h - 4} ${c.x - 6},${c.y - h} ${c.x - 5},${c.y - h - 7} ${c.x - 9},${c.y - h - 12} ${c.x - 4},${c.y - h - 12}`}
            fill="#111827"
          />
        </g>
      );
    }
    case 'lighthouse': {
      const h = M(28);
      return (
        <g data-landmark={d.name}>
          <path
            d={`M ${c.x - 5} ${c.y} L ${c.x - 3} ${c.y - h} L ${c.x + 3} ${c.y - h} L ${c.x + 5} ${c.y} Z`}
            fill="#f8fafc"
          />
          {[0.2, 0.5, 0.8].map((u) => (
            <rect
              key={u}
              x={c.x - 4.6 + u * 1.6}
              y={c.y - h * u - 3}
              width={9.2 - u * 3.2}
              height="4"
              fill="#dc2626"
            />
          ))}
          <rect x={c.x - 3.5} y={c.y - h - 6} width="7" height="6" fill="#fde68a" />
          <polygon
            points={`${c.x - 4},${c.y - h - 6} ${c.x + 4},${c.y - h - 6} ${c.x},${c.y - h - 11}`}
            fill="#dc2626"
          />
        </g>
      );
    }
    case 'minaret': {
      const h = M(55);
      return (
        <g data-landmark={d.name}>
          <rect x={c.x - 4} y={c.y - h} width="8" height={h} fill="#e7d7b5" />
          <rect x={c.x - 6} y={c.y - h * 0.65} width="12" height="3" fill="#c9b48a" />
          <rect x={c.x - 6} y={c.y - h * 0.9} width="12" height="3" fill="#c9b48a" />
          <path
            d={`M ${c.x - 4} ${c.y - h} Q ${c.x} ${c.y - h - 14} ${c.x + 4} ${c.y - h} Z`}
            fill="#c9b48a"
          />
        </g>
      );
    }
    case 'painted-ladies': {
      const cols = ['#f9a8d4', '#a7f3d0', '#fde68a', '#bfdbfe', '#ddd6fe', '#fecaca'];
      return (
        <g data-landmark={d.name}>
          {cols.map((col, i) => {
            const bx = x + T(9) * i - T(27);
            const by = y + T(9) * i * 0 - T(4);
            const s = T(4);
            const hh = M(13);
            const ridge = P(bx + s, by + s, hh + 7);
            return (
              <g key={col}>
                <Box x={bx} y={by} w={2 * s} d={2 * s} h={hh} color={col} />
                <polygon
                  points={poly(P(bx, by + 2 * s, hh), P(bx + 2 * s, by + 2 * s, hh), ridge)}
                  fill={shade(col, -0.3)}
                />
              </g>
            );
          })}
        </g>
      );
    }
    default:
      return null;
  }
}
