/**
 * Pure-SVG city art: isometric boxes, buildings by motif, trees, vehicles,
 * landmarks and the player's avatar. No images: everything is shapes, so
 * the city costs a few kilobytes and scales crisply on any screen.
 */
import { memo, type ReactNode } from 'react';
import { hash } from './contract';
import type { Flavour, LandmarkKind, TreeKind, VehicleSpec } from './flavour';
import { project, TH, TW, type Decor, type Place, type Pt } from './layout';
import { BridgeTop, BusinessBody, Hill, PlanLandmark, Station } from './art-places';

// ---------------------------------------------------------------------------
// Geometry and colour helpers

export const r1 = (n: number) => Math.round(n * 10) / 10;
/** "x,y" of a grid point raised z px. */
export const P = (x: number, y: number, z = 0) => {
  const p = project(x, y);
  return `${r1(p.x)},${r1(p.y - z)}`;
};
export const poly = (...pts: string[]) => pts.join(' ');

function rgb(hex: string): [number, number, number] {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(hex);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0').slice(0, 6);
  const n = parseInt(f, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Lighten (amt > 0) or darken (amt < 0) a hex colour. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = rgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const m = (c: number) => Math.round((t - c) * p + c);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
export function mix(a: string, b: string, p: number): string {
  const [r, g, bl] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * p);
  return `rgb(${m(r, r2)},${m(g, g2)},${m(bl, b2)})`;
}

/** Transform mapping (u tiles along the face, v px down) onto a visible face. */
export const leftM = (x: number, y: number, d: number, zt: number) => {
  const o = project(x, y + d);
  return `matrix(${TW},${TH},0,1,${r1(o.x)},${r1(o.y - zt)})`;
};
export const rightM = (x: number, y: number, w: number, d: number, zt: number) => {
  const o = project(x + w, y + d);
  return `matrix(${TW},${-TH},0,1,${r1(o.x)},${r1(o.y - zt)})`;
};

/** Shared gradients and filters, defined once per map. */
export function ArtDefs({ f }: { f: Flavour }) {
  return (
    <defs>
      <linearGradient id="ao" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.16" />
      </linearGradient>
      <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="cyl" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.25" />
      </linearGradient>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={f.sky[0]} />
        <stop offset="1" stopColor={f.sky[1]} />
      </linearGradient>
      <linearGradient id="water" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={shade(f.edgeColor, 0.2)} />
        <stop offset="1" stopColor={shade(f.edgeColor, -0.15)} />
      </linearGradient>
      <radialGradient id="glow">
        <stop offset="0" stopColor="#ef4444" stopOpacity="0.7" />
        <stop offset="1" stopColor="#ef4444" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="pulse">
        <stop offset="0.55" stopColor="#f59e0b" stopOpacity="0" />
        <stop offset="0.8" stopColor="#f59e0b" stopOpacity="0.55" />
        <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

// ---------------------------------------------------------------------------
// Primitives

export function Box({
  x,
  y,
  w,
  d,
  h,
  z = 0,
  color,
  top,
  left,
  right,
  edge = true,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  z?: number;
  color: string;
  top?: string;
  left?: string;
  right?: string;
  edge?: boolean;
}) {
  const zt = z + h;
  const lf = poly(P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, zt), P(x, y + d, zt));
  const rf = poly(P(x + w, y + d, z), P(x + w, y, z), P(x + w, y, zt), P(x + w, y + d, zt));
  return (
    <g>
      <polygon points={lf} fill={left ?? color} />
      <polygon points={rf} fill={right ?? shade(color, -0.2)} />
      {h > 6 && <polygon points={lf} fill="url(#ao)" />}
      {h > 6 && <polygon points={rf} fill="url(#ao)" />}
      <polygon
        points={poly(P(x, y, zt), P(x + w, y, zt), P(x + w, y + d, zt), P(x, y + d, zt))}
        fill={top ?? shade(color, 0.18)}
      />
      {edge && h > 6 && (
        <polyline
          points={poly(P(x + w, y + d, z), P(x + w, y + d, zt), P(x, y + d, zt))}
          fill="none"
          stroke="#fff"
          strokeOpacity="0.28"
          strokeWidth="0.8"
        />
      )}
    </g>
  );
}

/** Rows of windows on both visible faces. */
export function Windows({
  x,
  y,
  w,
  d,
  zt,
  h,
  color,
  seed,
  top = 7,
  bottom = 6,
  row = 10,
  win = 5,
  colW = 0.11,
  gap = 0.25,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  zt: number;
  h: number;
  color: string;
  seed: string;
  top?: number;
  bottom?: number;
  row?: number;
  win?: number;
  colW?: number;
  gap?: number;
}) {
  const s = hash(seed);
  const face = (len: number, side: number) => {
    const out: ReactNode[] = [];
    let n = 0;
    for (let v = top; v + win <= h - bottom; v += row)
      for (let u = (len % gap) / 2 + (gap - colW) / 2; u + colW <= len - 0.04; u += gap) {
        n++;
        const lit = ((s >>> (n % 24)) + n * 7 + side) % 9 === 0;
        out.push(
          <rect
            key={n}
            x={r1(u * 100) / 100}
            y={v}
            width={colW}
            height={win}
            fill={lit ? '#fde68a' : color}
          />,
        );
      }
    return out;
  };
  return (
    <>
      <g transform={leftM(x, y, d, zt)}>{face(w, 0)}</g>
      <g transform={rightM(x, y, w, d, zt)}>{face(d, 1)}</g>
    </>
  );
}

/** Two-sided gable roof, ridge along x. */
export function Gable({
  x,
  y,
  w,
  d,
  z,
  rise,
  color,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  z: number;
  rise: number;
  color: string;
}) {
  const m = y + d / 2;
  return (
    <g>
      <polygon
        points={poly(P(x, y, z), P(x + w, y, z), P(x + w, m, z + rise), P(x, m, z + rise))}
        fill={shade(color, -0.25)}
      />
      <polygon
        points={poly(P(x + w, y + d, z), P(x + w, y, z), P(x + w, m, z + rise))}
        fill={shade(color, 0.55)}
      />
      <polygon
        points={poly(P(x, y + d, z), P(x + w, y + d, z), P(x + w, m, z + rise), P(x, m, z + rise))}
        fill={color}
      />
    </g>
  );
}

/** Upright cylinder centred on a grid point. */
export function Cylinder({
  cx,
  cy,
  r,
  h,
  z = 0,
  color,
  top,
}: {
  cx: number;
  cy: number;
  r: number;
  h: number;
  z?: number;
  color: string;
  top?: string;
}) {
  const c = project(cx, cy);
  const rx = r1(TW * Math.SQRT2 * r);
  const ry = r1(TH * Math.SQRT2 * r);
  const yb = r1(c.y - z);
  const yt = r1(c.y - z - h);
  return (
    <g>
      <ellipse cx={c.x} cy={yb} rx={rx} ry={ry} fill={shade(color, -0.2)} />
      <rect x={r1(c.x - rx)} y={yt} width={rx * 2} height={r1(h)} fill={color} />
      <rect x={r1(c.x - rx)} y={yt} width={rx * 2} height={r1(h)} fill="url(#cyl)" />
      <ellipse cx={c.x} cy={yt} rx={rx} ry={ry} fill={top ?? shade(color, 0.2)} />
    </g>
  );
}

/** Soft cast shadow toward the east (light from the north-west). */
export function Shadow({
  x,
  y,
  w,
  d,
  h,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
}) {
  const s = Math.min(1.6, h / 55);
  return (
    <polygon
      points={poly(P(x, y), P(x + w + s, y), P(x + w + s, y + d), P(x, y + d))}
      fill="#0f172a"
      opacity="0.13"
    />
  );
}

// ---------------------------------------------------------------------------
// Trees and small decor

export function Tree({
  x,
  y,
  kind,
  leaf,
  size = 1,
}: {
  x: number;
  y: number;
  kind: TreeKind;
  leaf: [string, string];
  size?: number;
}) {
  const p = project(x, y);
  const s = size;
  const trunk = '#7c4a24';
  return (
    <g transform={`translate(${r1(p.x)},${r1(p.y)}) scale(${r1(s * 10) / 10})`}>
      <ellipse cx="3" cy="1" rx="9" ry="4" fill="#0f172a" opacity="0.14" />
      {kind === 'palm' ? (
        <>
          <path d="M0 0 Q 1 -12 4 -24" stroke={trunk} strokeWidth="2.6" fill="none" />
          {[-150, -110, -70, -30, 10].map((a) => (
            <ellipse
              key={a}
              cx="4"
              cy="-24"
              rx="9"
              ry="2.6"
              fill={a % 20 ? leaf[0] : leaf[1]}
              transform={`rotate(${a} 4 -24) translate(7 0)`}
            />
          ))}
        </>
      ) : kind === 'acacia' ? (
        <>
          <path d="M0 0 L0 -9 L-4 -15 M0 -9 L4 -16" stroke={trunk} strokeWidth="2" fill="none" />
          <ellipse cx="0" cy="-17" rx="14" ry="4.5" fill={leaf[1]} />
          <ellipse cx="-1" cy="-18.5" rx="11" ry="3.2" fill={leaf[0]} />
        </>
      ) : kind === 'cypress' ? (
        <>
          <rect x="-1" y="-5" width="2" height="5" fill={trunk} />
          <ellipse cx="0" cy="-15" rx="5" ry="12" fill={leaf[1]} />
          <ellipse cx="-1.4" cy="-16" rx="3" ry="9" fill={leaf[0]} />
        </>
      ) : (
        <>
          <rect x="-1.2" y="-8" width="2.4" height="8" fill={trunk} />
          <circle cx="0" cy="-15" r="9" fill={leaf[1]} />
          <circle cx="-2" cy="-17" r="7" fill={leaf[0]} />
          <circle cx="-4" cy="-20" r="2.6" fill="#fff" opacity="0.18" />
        </>
      )}
    </g>
  );
}

function House({ d: dc }: { d: Decor }) {
  const { x, y } = dc;
  const w = dc.w ?? 1;
  const d = dc.d ?? 1;
  const h = dc.h ?? 20;
  const color = dc.color ?? '#eee';
  const tall = h > 34;
  return (
    <g>
      <Shadow x={x} y={y} w={w} d={d} h={h} />
      <Box x={x} y={y} w={w} d={d} h={h} color={color} />
      <Windows
        x={x}
        y={y}
        w={w}
        d={d}
        zt={h}
        h={h}
        color={shade(color, -0.45)}
        seed={`${x},${y}`}
        row={tall ? 9 : 12}
        gap={tall ? 0.24 : 0.4}
      />
      {tall ? (
        <Box x={x + 0.25} y={y + 0.25} w={0.3} d={0.3} h={4} z={h} color="#94a3b8" />
      ) : (
        <Gable x={x} y={y} w={w} d={d} z={h} rise={10} color={dc.roof ?? '#7c2d12'} />
      )}
    </g>
  );
}

export function Fountain({ x, y, size = 0.6 }: { x: number; y: number; size?: number }) {
  return (
    <g>
      <Cylinder cx={x} cy={y} r={size * 0.7} h={3} color="#cbd5e1" top="#7dd3fc" />
      <Cylinder cx={x} cy={y} r={size * 0.12} h={9} z={3} color="#e2e8f0" />
      <g className="city-spray">
        <circle cx={project(x, y).x} cy={project(x, y).y - 15} r="2.2" fill="#bae6fd" />
      </g>
    </g>
  );
}

function Lamp({ x, y }: { x: number; y: number }) {
  const p = project(x, y);
  return (
    <g>
      <line x1={p.x} y1={p.y} x2={p.x} y2={p.y - 13} stroke="#334155" strokeWidth="1" />
      <circle cx={p.x} cy={p.y - 13.5} r="1.6" fill="#fef3c7" />
    </g>
  );
}

function Bench({ x, y }: { x: number; y: number }) {
  return <Box x={x} y={y} w={0.4} d={0.12} h={3} color="#a16207" edge={false} />;
}

function RunwayStrip({ d: dc }: { d: Decor }) {
  const { x, y } = dc;
  const w = dc.w ?? 3;
  const d = dc.d ?? 1.2;
  const plane = project(x + w * 0.62, y + d / 2);
  return (
    <g>
      <polygon points={poly(P(x, y), P(x + w, y), P(x + w, y + d), P(x, y + d))} fill="#475569" />
      <line
        x1={project(x + 0.2, y + d / 2).x}
        y1={project(x + 0.2, y + d / 2).y}
        x2={project(x + w - 0.2, y + d / 2).x}
        y2={project(x + w - 0.2, y + d / 2).y}
        stroke="#f8fafc"
        strokeWidth="1.2"
        strokeDasharray="5 5"
      />
      <g transform={`translate(${r1(plane.x)},${r1(plane.y - 4)})`} className="city-plane">
        <ellipse cx="2" cy="6" rx="16" ry="5" fill="#0f172a" opacity="0.15" />
        {/* fuselage along +x (down-right on screen), wings across */}
        <polygon points="-16,-8 14,7 17,7 -13,-9" fill="#f8fafc" />
        <polygon points="-2,-6 -14,3 -9,4 4,-2" fill="#cbd5e1" />
        <polygon points="2,-1 14,-8 18,-6 6,1" fill="#e2e8f0" />
        <polygon points="-15,-9 -18,-15 -14,-14 -11,-8" fill="#0ea5e9" />
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Landmarks

function Landmark({
  x,
  y,
  kind,
  color,
}: {
  x: number;
  y: number;
  kind: LandmarkKind;
  color: string;
}) {
  const c = project(x, y);
  switch (kind) {
    case 'clocktower':
      return (
        <g>
          <Shadow x={x - 1.2} y={y - 0.2} w={1.9} d={0.9} h={110} />
          <Box x={x - 1.3} y={y - 0.1} w={1.4} d={0.8} h={22} color={color} />
          <Windows
            x={x - 1.3}
            y={y - 0.1}
            w={1.4}
            d={0.8}
            zt={22}
            h={22}
            color={shade(color, -0.4)}
            seed="parl"
            row={8}
            win={6}
            colW={0.06}
            gap={0.14}
          />
          <Box x={x - 0.2} y={y - 0.2} w={0.55} d={0.55} h={84} color={color} />
          <Windows
            x={x - 0.2}
            y={y - 0.2}
            w={0.55}
            d={0.55}
            zt={84}
            h={60}
            color={shade(color, -0.35)}
            seed="ben"
            row={8}
            win={5}
            colW={0.05}
            gap={0.12}
          />
          <Box
            x={x - 0.25}
            y={y - 0.25}
            w={0.65}
            d={0.65}
            h={12}
            z={84}
            color={shade(color, 0.1)}
          />
          <g transform={leftM(x - 0.25, y - 0.25, 0.65, 96)}>
            <ellipse
              cx="0.325"
              cy="6"
              rx="0.2"
              ry="4.6"
              fill="#fefce8"
              stroke="#1f2937"
              strokeWidth="0.03"
            />
          </g>
          <g transform={rightM(x - 0.25, y - 0.25, 0.65, 0.65, 96)}>
            <ellipse cx="0.325" cy="6" rx="0.2" ry="4.6" fill="#fefce8" />
          </g>
          <polygon
            points={poly(
              P(x - 0.25, y + 0.4, 96),
              P(x + 0.4, y + 0.4, 96),
              P(x + 0.075, y + 0.075, 126),
            )}
            fill={shade(color, -0.1)}
          />
          <polygon
            points={poly(
              P(x + 0.4, y + 0.4, 96),
              P(x + 0.4, y - 0.25, 96),
              P(x + 0.075, y + 0.075, 126),
            )}
            fill={shade(color, -0.35)}
          />
        </g>
      );
    case 'theatre':
      return (
        <g>
          <ellipse cx={c.x + 10} cy={c.y + 4} rx="70" ry="30" fill="#0f172a" opacity="0.12" />
          <Cylinder cx={x} cy={y} r={1.35} h={16} color={color} />
          <Cylinder cx={x} cy={y} r={1.1} h={10} z={16} color={shade(color, -0.08)} />
          <ellipse
            cx={c.x}
            cy={c.y - 30}
            rx={TW * Math.SQRT2 * 1.5}
            ry={TH * Math.SQRT2 * 1.5}
            fill={shade(color, -0.25)}
          />
          <ellipse
            cx={c.x}
            cy={c.y - 32}
            rx={TW * Math.SQRT2 * 1.4}
            ry={TH * Math.SQRT2 * 1.4}
            fill={shade(color, 0.15)}
          />
          <path
            d={`M ${c.x - 40} ${c.y - 32} Q ${c.x} ${c.y - 62} ${c.x + 40} ${c.y - 32} Z`}
            fill={shade(color, 0.05)}
          />
          <path
            d={`M ${c.x - 30} ${c.y - 34} Q ${c.x} ${c.y - 55} ${c.x + 8} ${c.y - 40}`}
            fill="none"
            stroke="#fff"
            strokeOpacity="0.4"
            strokeWidth="2"
          />
        </g>
      );
    case 'conference-tower':
      return (
        <g>
          <Shadow x={x - 0.5} y={y - 0.5} w={1} d={1} h={120} />
          <Cylinder cx={x + 0.9} cy={y + 0.6} r={0.7} h={14} color="#d6d3d1" />
          <ellipse
            cx={project(x + 0.9, y + 0.6).x}
            cy={project(x + 0.9, y + 0.6).y - 14}
            rx="28"
            ry="10"
            fill="#a16207"
          />
          <Cylinder cx={x} cy={y} r={0.42} h={104} color={color} />
          {Array.from({ length: 12 }, (_, i) => (
            <rect
              key={i}
              x={c.x - 18}
              y={c.y - 12 - i * 8}
              width="36"
              height="2"
              fill="#78350f"
              opacity="0.35"
            />
          ))}
          <Cylinder cx={x} cy={y} r={0.5} h={6} z={104} color={shade(color, -0.15)} />
          <rect x={c.x - 1} y={c.y - 128} width="2" height="18" fill="#475569" />
        </g>
      );
    case 'needle-tower': {
      const H = 230;
      return (
        <g>
          <polygon
            points={poly(P(x, y), P(x + 3.2, y), P(x + 3.2, y + 0.6), P(x, y + 0.6))}
            fill="#0f172a"
            opacity="0.12"
          />
          <polygon
            points={`${c.x - 18},${c.y} ${c.x},${c.y + 8} ${c.x + 4},${c.y - H * 0.6} ${c.x - 6},${c.y - H * 0.62}`}
            fill={shade(color, 0.15)}
          />
          <polygon
            points={`${c.x},${c.y + 8} ${c.x + 18},${c.y} ${c.x + 6},${c.y - H * 0.62} ${c.x + 4},${c.y - H * 0.6}`}
            fill={shade(color, -0.2)}
          />
          <polygon
            points={`${c.x - 6},${c.y - H * 0.62} ${c.x + 4},${c.y - H * 0.6} ${c.x + 1},${c.y - H}`}
            fill={shade(color, 0.3)}
          />
          <polygon
            points={`${c.x + 4},${c.y - H * 0.6} ${c.x + 6},${c.y - H * 0.62} ${c.x + 1},${c.y - H}`}
            fill={shade(color, -0.1)}
          />
          {Array.from({ length: 14 }, (_, i) => (
            <line
              key={i}
              x1={c.x - 16 + i}
              y1={c.y - 6 - i * 10}
              x2={c.x + 16 - i}
              y2={c.y - 6 - i * 10}
              stroke="#0ea5e9"
              strokeOpacity="0.35"
              strokeWidth="1"
            />
          ))}
          <Box
            x={x + 1.1}
            y={y - 1.1}
            w={0.7}
            d={0.7}
            h={90}
            color="#7dd3fc"
            left="#bae6fd"
            right="#38bdf8"
          />
        </g>
      );
    }
    case 'pyramid': {
      const pr = (s: number, ox: number, oy: number) => (
        <g>
          <polygon
            points={poly(
              P(ox, oy),
              P(ox + s + s * 0.9, oy),
              P(ox + s + s * 0.9, oy + s),
              P(ox, oy + s),
            )}
            fill="#0f172a"
            opacity="0.1"
          />
          <polygon
            points={poly(P(ox, oy + s), P(ox + s, oy + s), P(ox + s / 2, oy + s / 2, s * 26))}
            fill={color}
          />
          <polygon
            points={poly(P(ox + s, oy + s), P(ox + s, oy), P(ox + s / 2, oy + s / 2, s * 26))}
            fill={shade(color, -0.22)}
          />
        </g>
      );
      return (
        <g>
          {pr(1.2, x + 0.5, y - 1.6)}
          {pr(2.4, x - 1.4, y - 1)}
        </g>
      );
    }
    case 'star-gate':
      return (
        <g>
          <Shadow x={x - 1.2} y={y - 0.2} w={2.4} d={0.4} h={60} />
          <Box x={x - 1.2} y={y - 0.2} w={0.45} d={0.4} h={44} color={color} />
          <Box x={x + 0.75} y={y - 0.2} w={0.45} d={0.4} h={44} color={color} />
          <Box x={x - 1.3} y={y - 0.25} w={2.6} d={0.5} h={10} z={44} color={color} />
          <g transform={`translate(${r1(c.x)},${r1(c.y - 66)})`}>
            <polygon
              points="0,-9 2.6,-2.8 9,-2.8 3.9,1.2 5.8,7.6 0,3.8 -5.8,7.6 -3.9,1.2 -9,-2.8 -2.6,-2.8"
              fill="#111827"
            />
          </g>
        </g>
      );
    case 'cotton-tree':
      return (
        <g>
          <ellipse cx={c.x + 12} cy={c.y + 6} rx="64" ry="26" fill="#0f172a" opacity="0.14" />
          <path
            d={`M ${c.x - 7} ${c.y} Q ${c.x - 3} ${c.y - 30} ${c.x - 18} ${c.y - 52} M ${c.x + 6} ${c.y} Q ${c.x + 4} ${c.y - 34} ${c.x + 22} ${c.y - 54}`}
            stroke="#6b4423"
            strokeWidth="7"
            fill="none"
          />
          <rect x={c.x - 7} y={c.y - 38} width="14" height="38" fill="#7c5230" rx="3" />
          {[
            [-30, -62, 26],
            [0, -76, 30],
            [30, -62, 26],
            [-14, -86, 22],
            [16, -88, 22],
          ].map(([dx, dy, rr], i) => (
            <circle
              key={i}
              cx={c.x + dx!}
              cy={c.y + dy!}
              r={rr}
              fill={i % 2 ? '#15803d' : '#166534'}
            />
          ))}
          <circle cx={c.x - 16} cy={c.y - 92} r="8" fill="#fff" opacity="0.12" />
        </g>
      );
    case 'convention-dome': {
      const rx = TW * Math.SQRT2 * 1.3;
      const bands = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
      return (
        <g>
          <ellipse
            cx={c.x + 8}
            cy={c.y + 4}
            rx={rx + 8}
            ry={rx / 2.2}
            fill="#0f172a"
            opacity="0.12"
          />
          <Cylinder cx={x} cy={y} r={1.3} h={8} color="#e2e8f0" />
          {bands.map((b, i) => (
            <path
              key={b}
              d={`M ${c.x - rx * (1 - i * 0.16)} ${c.y - 8 - i * 9} A ${rx * (1 - i * 0.16)} ${12 + 4 * (5 - i)} 0 0 1 ${c.x + rx * (1 - i * 0.16)} ${c.y - 8 - i * 9}`}
              fill={i === 0 ? color : 'none'}
              stroke={b}
              strokeWidth="4"
              opacity="0.9"
            />
          ))}
          <path
            d={`M ${c.x - rx} ${c.y - 8} A ${rx} 62 0 0 1 ${c.x + rx} ${c.y - 8}`}
            fill="url(#cyl)"
          />
        </g>
      );
    }
    case 'hillbrow-tower':
      return (
        <g>
          <Shadow x={x - 0.3} y={y - 0.3} w={0.6} d={0.6} h={150} />
          <Cylinder cx={x} cy={y} r={0.3} h={150} color={color} />
          <Cylinder cx={x} cy={y} r={0.55} h={14} z={112} color="#475569" top="#64748b" />
          <Cylinder cx={x} cy={y} r={0.5} h={6} z={130} color="#94a3b8" />
          <rect x={c.x - 1} y={c.y - 178} width="2" height="28" fill="#334155" />
          <circle cx={c.x} cy={c.y - 179} r="2" fill="#ef4444" className="city-blink" />
        </g>
      );
    default:
      return PlanLandmark({ x, y, kind, color }) ?? <Fountain x={x} y={y} size={1} />;
  }
}

// ---------------------------------------------------------------------------
// Buildings by motif

export function Awning({
  x,
  y,
  w,
  d,
  z,
  color,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  z: number;
  color: string;
}) {
  const n = Math.max(3, Math.round(w / 0.18));
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const u0 = x + (w * i) / n;
    const u1 = x + (w * (i + 1)) / n;
    out.push(
      <polygon
        key={i}
        points={poly(
          P(u0, y + d, z),
          P(u1, y + d, z),
          P(u1, y + d + 0.22, z - 6),
          P(u0, y + d + 0.22, z - 6),
        )}
        fill={i % 2 ? '#fff' : color}
      />,
    );
  }
  return <g>{out}</g>;
}

function DoorMark({ p, color }: { p: Place; color: string }) {
  if (!p.doorFace) return null;
  const dh = Math.min(12, p.h * 0.45);
  if (p.doorFace === 'left') {
    const u = p.door.x - p.x;
    return (
      <g transform={leftM(p.x, p.y, p.d, dh)}>
        <rect x={Math.max(0, u - 0.09)} y={0} width={0.18} height={dh} fill={color} />
      </g>
    );
  }
  const u = p.y + p.d - p.door.y;
  return (
    <g transform={rightM(p.x, p.y, p.w, p.d, dh)}>
      <rect x={Math.max(0, u - 0.09)} y={0} width={0.18} height={dh} fill={color} />
    </g>
  );
}

function BuildingBody({ p, f }: { p: Place; f: Flavour }) {
  const { x, y, w, d, h, color: c, accent: a } = p;
  const dark = shade(c, -0.55);
  switch (p.motif) {
    case 'columns': {
      const stone = mix('#f5f5f4', c, 0.08);
      const hb = h - 12;
      const cols: ReactNode[] = [];
      for (let u = 0.1; u < w - 0.05; u += 0.2)
        cols.push(
          <rect key={u} x={u} y={8} width={0.07} height={hb - 12} fill="#fff" opacity="0.85" />,
        );
      const colsR: ReactNode[] = [];
      for (let u = 0.1; u < d - 0.05; u += 0.2)
        colsR.push(
          <rect key={u} x={u} y={8} width={0.07} height={hb - 12} fill="#fff" opacity="0.55" />,
        );
      return (
        <g>
          <Box x={x - 0.06} y={y - 0.06} w={w + 0.12} d={d + 0.12} h={5} color="#d6d3d1" />
          <Box x={x} y={y} w={w} d={d} h={hb} z={5} color={stone} />
          <g transform={leftM(x, y, d, hb + 5)}>
            {cols}
            <rect x={0} y={0} width={w} height={6} fill={c} />
            <rect x={w / 2 - 0.13} y={hb - 16} width={0.26} height={16} fill={dark} />
          </g>
          <g transform={rightM(x, y, w, d, hb + 5)}>
            {colsR}
            <rect x={0} y={0} width={d} height={6} fill={shade(c, -0.2)} />
          </g>
          <Box x={x - 0.04} y={y - 0.04} w={w + 0.08} d={d + 0.08} h={5} z={hb + 5} color={c} />
          <polygon
            points={poly(
              P(x, y + d + 0.04, hb + 10),
              P(x + w, y + d + 0.04, hb + 10),
              P(x + w / 2, y + d + 0.04, hb + 22),
            )}
            fill={stone}
          />
          <polygon
            points={poly(
              P(x + 0.2, y + d + 0.04, hb + 11.5),
              P(x + w - 0.2, y + d + 0.04, hb + 11.5),
              P(x + w / 2, y + d + 0.04, hb + 19),
            )}
            fill={a}
            opacity="0.85"
          />
        </g>
      );
    }
    case 'glass': {
      const lines = (len: number) => {
        const out: ReactNode[] = [];
        for (let v = 4; v < h; v += 7)
          out.push(
            <rect key={`h${v}`} x={0} y={v} width={len} height={0.8} fill="#fff" opacity="0.3" />,
          );
        for (let u = 0.25; u < len; u += 0.25)
          out.push(
            <rect key={`v${u}`} x={u} y={0} width={0.015} height={h} fill="#fff" opacity="0.25" />,
          );
        out.push(
          <polygon
            key="refl"
            points={`${len * 0.1},${h} ${len * 0.35},${h} ${len * 0.8},0 ${len * 0.55},0`}
            fill="#fff"
            opacity="0.16"
          />,
        );
        return out;
      };
      return (
        <g>
          <Box
            x={x}
            y={y}
            w={w}
            d={d}
            h={h}
            color={c}
            left={mix(c, '#7dd3fc', 0.45)}
            right={mix(c, '#0c4a6e', 0.25)}
            top={mix(c, '#e0f2fe', 0.6)}
          />
          <g transform={leftM(x, y, d, h)}>{lines(w)}</g>
          <g transform={rightM(x, y, w, d, h)}>{lines(d)}</g>
          <Box x={x + 0.3} y={y + 0.3} w={w - 0.6} d={d - 0.6} h={5} z={h} color="#cbd5e1" />
          <polyline
            points={poly(P(x, y + d, h), P(x + w, y + d, h), P(x + w, y, h))}
            fill="none"
            stroke={a}
            strokeWidth="2"
          />
        </g>
      );
    }
    case 'tower': {
      const h1 = Math.round(h * 0.55);
      const h2 = Math.round(h * 0.28);
      const h3 = h - h1 - h2;
      const win = shade(c, -0.5);
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h1} color={c} />
          <Windows x={x} y={y} w={w} d={d} zt={h1} h={h1} color={win} seed={p.id} />
          <Box
            x={x + 0.12}
            y={y + 0.12}
            w={w - 0.24}
            d={d - 0.24}
            h={h2}
            z={h1}
            color={shade(c, 0.06)}
          />
          <Windows
            x={x + 0.12}
            y={y + 0.12}
            w={w - 0.24}
            d={d - 0.24}
            zt={h1 + h2}
            h={h2}
            color={win}
            seed={p.id + '2'}
            top={4}
            bottom={3}
          />
          <Box x={x + 0.26} y={y + 0.26} w={w - 0.52} d={d - 0.52} h={h3} z={h1 + h2} color={a} />
          <line
            x1={project(x + w / 2, y + d / 2).x}
            y1={project(x + w / 2, y + d / 2).y - h}
            x2={project(x + w / 2, y + d / 2).x}
            y2={project(x + w / 2, y + d / 2).y - h - 16}
            stroke="#334155"
            strokeWidth="1.2"
          />
          <circle
            cx={project(x + w / 2, y + d / 2).x}
            cy={project(x + w / 2, y + d / 2).y - h - 16}
            r="1.6"
            fill="#ef4444"
            className="city-blink"
          />
        </g>
      );
    }
    case 'shopfront':
    case 'kiosk':
    case 'b-kiosk': {
      const kiosk = p.motif === 'kiosk' || p.motif === 'b-kiosk';
      const wall = kiosk ? c : mix(c, '#ffffff', 0.55);
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color={wall} />
          <g transform={leftM(x, y, d, h)}>
            <rect x={0} y={0} width={w} height={kiosk ? 5 : 7} fill={kiosk ? a : c} />
            <rect
              x={0.1}
              y={kiosk ? 8 : 12}
              width={w - 0.2}
              height={h - (kiosk ? 12 : 16)}
              fill="#bae6fd"
            />
            <polygon
              points={`0.15,${h - 4} 0.35,${h - 4} 0.6,${kiosk ? 8 : 12} 0.4,${kiosk ? 8 : 12}`}
              fill="#fff"
              opacity="0.5"
            />
          </g>
          <g transform={rightM(x, y, w, d, h)}>
            <rect x={0} y={0} width={d} height={kiosk ? 5 : 7} fill={shade(kiosk ? a : c, -0.15)} />
          </g>
          {kiosk ? (
            <Box x={x - 0.1} y={y - 0.1} w={w + 0.2} d={d + 0.2} h={3} z={h} color={a} />
          ) : (
            <Awning x={x} y={y} w={w} d={d} z={h - 8} color={a} />
          )}
        </g>
      );
    }
    case 'loft': {
      const brick = c;
      const win = (len: number) => {
        const out: ReactNode[] = [];
        for (let v = 7; v + 9 <= h - 4; v += 13)
          for (let u = 0.1; u + 0.22 <= len; u += 0.33) {
            out.push(<rect key={`${u}${v}`} x={u} y={v} width={0.24} height={9} fill="#f1f5f9" />);
            out.push(
              <rect
                key={`i${u}${v}`}
                x={u + 0.02}
                y={v + 1}
                width={0.2}
                height={7}
                fill={(u * 10 + v) % 3 < 1 ? '#fde68a' : '#334155'}
              />,
            );
          }
        return out;
      };
      const t = project(x + w * 0.65, y + d * 0.35);
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color={brick} />
          <g transform={leftM(x, y, d, h)}>{win(w)}</g>
          <g transform={rightM(x, y, w, d, h)}>{win(d)}</g>
          <Box
            x={x - 0.03}
            y={y - 0.03}
            w={w + 0.06}
            d={d + 0.06}
            h={3}
            z={h}
            color={shade(brick, -0.25)}
          />
          <line
            x1={t.x - 5}
            y1={t.y - h - 3}
            x2={t.x - 5}
            y2={t.y - h - 12}
            stroke="#57534e"
            strokeWidth="1.2"
          />
          <line
            x1={t.x + 5}
            y1={t.y - h - 3}
            x2={t.x + 5}
            y2={t.y - h - 12}
            stroke="#57534e"
            strokeWidth="1.2"
          />
          <rect x={t.x - 7} y={t.y - h - 24} width="14" height="13" rx="2" fill="#a16207" />
          <polygon
            points={`${t.x - 8},${t.y - h - 24} ${t.x + 8},${t.y - h - 24} ${t.x},${t.y - h - 31}`}
            fill="#57534e"
          />
        </g>
      );
    }
    case 'garden': {
      const roofTrees = [
        [0.3, 0.3],
        [w - 0.35, 0.5],
        [0.6, d - 0.3],
      ];
      return (
        <g>
          <Box
            x={x}
            y={y}
            w={w}
            d={d}
            h={h}
            color={c}
            left={mix(c, '#e0f2fe', 0.55)}
            right={mix(c, '#0c4a6e', 0.15)}
          />
          <g transform={leftM(x, y, d, h)}>
            {Array.from({ length: Math.floor(w / 0.3) }, (_, i) => (
              <rect
                key={i}
                x={0.08 + i * 0.3}
                y={5}
                width={0.02}
                height={h - 5}
                fill="#fff"
                opacity="0.6"
              />
            ))}
          </g>
          <Box x={x} y={y} w={w} d={d} h={3} z={h} color="#65a30d" top="#84cc16" />
          {roofTrees.map(([tx, ty], i) => (
            <g key={i} transform={`translate(0 ${-h - 3})`}>
              <Tree
                x={x + tx!}
                y={y + ty!}
                kind="round"
                leaf={['#4ade80', '#15803d']}
                size={0.55}
              />
            </g>
          ))}
        </g>
      );
    }
    case 'shophouse': {
      const shut = (len: number, dim: boolean) => {
        const out: ReactNode[] = [];
        for (let v = 9; v + 9 <= h - 4; v += 13)
          for (let u = 0.12; u + 0.2 <= len; u += 0.32) {
            out.push(
              <rect
                key={`${u}${v}`}
                x={u}
                y={v}
                width={0.09}
                height={9}
                fill={shade(a === '#fef3c7' ? '#0f766e' : a, dim ? -0.2 : 0)}
              />,
            );
            out.push(
              <rect
                key={`b${u}${v}`}
                x={u + 0.1}
                y={v}
                width={0.09}
                height={9}
                fill={shade(a === '#fef3c7' ? '#0f766e' : a, dim ? -0.3 : -0.1)}
              />,
            );
          }
        return out;
      };
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color={c} left={mix(c, '#ffffff', 0.25)} />
          <g transform={leftM(x, y, d, h)}>{shut(w, false)}</g>
          <g transform={rightM(x, y, w, d, h)}>{shut(d, true)}</g>
          <Gable
            x={x - 0.04}
            y={y - 0.04}
            w={w + 0.08}
            d={d + 0.08}
            z={h}
            rise={9}
            color={f.roofs[0] ?? '#7c2d12'}
          />
        </g>
      );
    }
    case 'stall':
    case 'b-stall': {
      const top = 15;
      const poles = [
        [x, y + d],
        [x + w, y + d],
        [x + w, y],
      ].map(([px, py], i) => {
        const q = project(px!, py!);
        return (
          <line
            key={i}
            x1={q.x}
            y1={q.y}
            x2={q.x}
            y2={q.y - top}
            stroke="#78716c"
            strokeWidth="1"
          />
        );
      });
      const n = 4;
      const stripes: ReactNode[] = [];
      for (let i = 0; i < n; i++) {
        const u0 = x - 0.08 + ((w + 0.16) * i) / n;
        const u1 = x - 0.08 + ((w + 0.16) * (i + 1)) / n;
        stripes.push(
          <polygon
            key={i}
            points={poly(
              P(u0, y - 0.08, top + 4),
              P(u1, y - 0.08, top + 4),
              P(u1, y + d + 0.1, top),
              P(u0, y + d + 0.1, top),
            )}
            fill={i % 2 ? '#fff' : a}
          />,
        );
      }
      const goods = ['#ef4444', '#f59e0b', '#22c55e', '#a855f7'];
      return (
        <g opacity={p.dim ? 0.55 : 1}>
          <Box x={x + 0.05} y={y + 0.15} w={w - 0.1} d={d - 0.3} h={6} color="#a16207" />
          {goods.map((g, i) => {
            const q = project(x + 0.18 + i * 0.15, y + d / 2);
            return <circle key={g} cx={q.x} cy={q.y - 7.5} r="1.8" fill={g} />;
          })}
          {poles}
          {stripes}
        </g>
      );
    }
    case 'hub': {
      const umb = [
        [x + 0.3, y + d + 0.32],
        [x + 0.95, y + d + 0.32],
      ];
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color={mix(c, '#fff7ed', 0.6)} />
          <g transform={leftM(x, y, d, h)}>
            <rect x={0} y={0} width={w} height={6} fill={c} />
            <rect x={0.08} y={10} width={w - 0.16} height={h - 12} fill="#bae6fd" />
            <rect x={w / 2 - 0.12} y={h - 13} width={0.24} height={13} fill="#7c2d12" />
          </g>
          <g transform={rightM(x, y, w, d, h)}>
            <rect x={0} y={0} width={d} height={6} fill={shade(c, -0.15)} />
            <rect x={0.1} y={10} width={d - 0.2} height={h - 14} fill="#7dd3fc" opacity="0.8" />
          </g>
          <Awning x={x} y={y} w={w} d={d} z={h - 7} color={c} />
          <Box x={x + 0.25} y={y + 0.2} w={0.7} d={0.5} h={7} z={h} color="#334155" />
          {umb.map(([ux, uy], i) => {
            const q = project(ux!, uy!);
            return (
              <g key={i}>
                <line x1={q.x} y1={q.y} x2={q.x} y2={q.y - 10} stroke="#57534e" strokeWidth="0.8" />
                <ellipse cx={q.x} cy={q.y - 10} rx="7" ry="3" fill={i ? '#14b8a6' : '#f43f5e'} />
              </g>
            );
          })}
        </g>
      );
    }
    case 'office': {
      const top = project(x + w / 2, y + d / 2);
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color={c} left={shade(c, 0.12)} />
          <g transform={leftM(x, y, d, h)}>
            <rect x={0} y={h - 10} width={w} height={10} fill="#99f6e4" opacity="0.8" />
          </g>
          <Windows
            x={x}
            y={y}
            w={w}
            d={d}
            zt={h}
            h={h - 10}
            color="#134e4a"
            seed={'office' + h}
            top={6}
            bottom={2}
          />
          <Box
            x={x + 0.08}
            y={y + 0.08}
            w={w - 0.16}
            d={d - 0.16}
            h={2}
            z={h}
            color="#4ade80"
            top="#86efac"
            edge={false}
          />
          <line
            x1={top.x + 6}
            y1={top.y - h - 2}
            x2={top.x + 6}
            y2={top.y - h - 20}
            stroke="#334155"
            strokeWidth="1"
          />
          <polygon
            points={`${top.x + 6},${top.y - h - 20} ${top.x + 18},${top.y - h - 16} ${top.x + 6},${top.y - h - 12}`}
            fill={a}
            className="city-flag"
          />
          {p.siren && (
            <g className="city-siren">
              <circle cx={top.x - 4} cy={top.y - h - 6} r="16" fill="url(#glow)" />
              <rect x={top.x - 7} y={top.y - h - 9} width="6" height="5" rx="2" fill="#ef4444" />
            </g>
          )}
        </g>
      );
    }
    case 'home': {
      const tier = p.level ?? 2;
      if (tier === 1)
        return (
          <g>
            <Box x={x} y={y} w={w} d={d} h={h} color={c} />
            <Windows
              x={x}
              y={y}
              w={w}
              d={d}
              zt={h}
              h={h}
              color={shade(c, -0.45)}
              seed="flat"
              row={9}
              gap={0.21}
            />
            <Box x={x + 0.2} y={y + 0.2} w={0.3} d={0.3} h={5} z={h} color="#94a3b8" />
          </g>
        );
      if (tier === 5) {
        const pool = poly(
          P(x - 0.05, y + d + 0.05),
          P(x + w * 0.6, y + d + 0.05),
          P(x + w * 0.6, y + d + 0.45),
          P(x - 0.05, y + d + 0.45),
        );
        return (
          <g>
            <polygon points={pool} fill="#38bdf8" stroke="#e0f2fe" strokeWidth="1.5" />
            <Box x={x} y={y} w={w} d={d * 0.85} h={h - 10} color="#f8fafc" right="#e2e8f0" />
            <g transform={leftM(x, y, d * 0.85, h - 10)}>
              <rect x={0.1} y={5} width={w - 0.2} height={h - 18} fill="#7dd3fc" opacity="0.85" />
            </g>
            <Box
              x={x + 0.2}
              y={y + 0.1}
              w={w * 0.6}
              d={d * 0.55}
              h={10}
              z={h - 10}
              color="#f1f5f9"
            />
            <Tree
              x={x + w + 0.15}
              y={y + d - 0.1}
              kind="palm"
              leaf={['#65a30d', '#3f6212']}
              size={1}
            />
          </g>
        );
      }
      return (
        <g>
          {tier === 4 && (
            <Box
              x={x - 0.1}
              y={y + d + 0.05}
              w={w + 0.1}
              d={0.14}
              h={4}
              color="#16a34a"
              edge={false}
            />
          )}
          {tier === 3 && (
            <Box
              x={x + w * 0.62}
              y={y + d * 0.1}
              w={w * 0.38}
              d={d * 0.45}
              h={12}
              color={shade(c, -0.05)}
            />
          )}
          <Box x={x} y={y} w={tier === 3 ? w * 0.62 : w} d={d} h={h} color={c} />
          <Windows
            x={x}
            y={y}
            w={tier === 3 ? w * 0.62 : w}
            d={d}
            zt={h}
            h={h}
            color={shade(c, -0.45)}
            seed={'home' + tier}
            row={12}
            gap={0.36}
            top={6}
          />
          <Gable
            x={x - 0.05}
            y={y - 0.05}
            w={(tier === 3 ? w * 0.62 : w) + 0.1}
            d={d + 0.1}
            z={h}
            rise={tier === 4 ? 14 : 11}
            color={a}
          />
        </g>
      );
    }
    case 'terminal': {
      const ct = project(x + w - 0.3, y + 0.3);
      return (
        <g>
          <Box
            x={x}
            y={y}
            w={w}
            d={d}
            h={h}
            color={c}
            left={mix(c, '#7dd3fc', 0.5)}
            right={mix(c, '#0369a1', 0.25)}
          />
          <g transform={leftM(x, y, d, h)}>
            {Array.from({ length: Math.floor(w / 0.2) }, (_, i) => (
              <rect
                key={i}
                x={0.05 + i * 0.2}
                y={4}
                width={0.015}
                height={h - 4}
                fill="#fff"
                opacity="0.6"
              />
            ))}
          </g>
          <polyline
            points={poly(
              P(x - 0.05, y + d + 0.05, h + 2),
              P(x + w / 2, y + d / 2, h + 9),
              P(x + w + 0.05, y + d + 0.05, h + 2),
            )}
            fill="none"
            stroke={a}
            strokeWidth="3"
          />
          <Cylinder cx={x + w - 0.3} cy={y + 0.3} r={0.16} h={52} color="#e2e8f0" />
          <Cylinder
            cx={x + w - 0.3}
            cy={y + 0.3}
            r={0.32}
            h={8}
            z={52}
            color="#0ea5e9"
            top="#e0f2fe"
          />
          <circle cx={ct.x} cy={ct.y - 66} r="1.8" fill="#ef4444" className="city-blink" />
        </g>
      );
    }
    case 'newsstand':
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color={c} />
          <g transform={leftM(x, y, d, h)}>
            {['#f43f5e', '#fde047', '#38bdf8', '#a3e635'].map((m, i) => (
              <rect key={m} x={0.05 + i * 0.13} y={6} width={0.1} height={7} fill={m} />
            ))}
          </g>
          <Box x={x - 0.08} y={y - 0.08} w={w + 0.16} d={d + 0.16} h={3} z={h} color={a} />
        </g>
      );
    case 'hall': {
      const arc = (len: number) => `M 0 0 Q ${len / 2} -22 ${len} 0 Z`;
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color={c} />
          <g transform={leftM(x, y, d, h)}>
            <path d={arc(w)} fill={shade(c, -0.08)} />
            <rect x={w / 2 - 0.3} y={h - 18} width={0.6} height={18} fill="#475569" />
            <rect x={0.2} y={10} width={w - 0.4} height={8} fill={a} opacity="0.9" />
          </g>
          <polygon
            points={poly(
              P(x + w, y + d, h),
              P(x + w, y, h),
              P(x + w / 2, y, h + 11),
              P(x + w / 2, y + d, h + 11),
            )}
            fill={shade(c, -0.2)}
          />
          <polygon
            points={poly(
              P(x, y + d, h),
              P(x + w / 2, y + d, h + 11),
              P(x + w / 2, y, h + 11),
              P(x, y, h),
            )}
            fill={shade(c, 0.1)}
          />
          <g transform={leftM(x, y, d, h)}>
            <path d={arc(w)} fill={shade(c, -0.05)} />
          </g>
        </g>
      );
    }
    default:
      return BusinessBody({ p }) ?? <Box x={x} y={y} w={w} d={d} h={h} color={c} />;
  }
}

export const Building = memo(function Building({ p, f }: { p: Place; f: Flavour }) {
  return (
    <g
      data-place={p.id}
      data-category={p.category}
      className={`city-building${p.dim ? ' is-dim' : ''}`}
    >
      {p.motif !== 'stall' && p.motif !== 'b-stall' && (
        <Shadow x={p.x} y={p.y} w={p.w} d={p.d} h={p.h} />
      )}
      <BuildingBody p={p} f={f} />
      {p.motif !== 'stall' && p.motif !== 'b-stall' && p.motif !== 'hall' && (
        <DoorMark p={p} color={shade(p.color, -0.6)} />
      )}
      {/* Generous invisible hit area: the footprint plus the building's height. */}
      <polygon
        className="city-hit"
        points={poly(
          P(p.x, p.y, p.h + 8),
          P(p.x + p.w, p.y, p.h + 8),
          P(p.x + p.w, p.y + p.d, 0),
          P(p.x, p.y + p.d, 0),
          P(p.x, p.y + p.d, p.h + 8),
        )}
        fill="transparent"
      />
    </g>
  );
});

export function DecorItem({ d, f }: { d: Decor; f: Flavour }) {
  switch (d.kind) {
    case 'tree':
      return <Tree x={d.x} y={d.y} kind={f.tree} leaf={f.leaf} size={d.size ?? 1} />;
    case 'house':
      return <House d={d} />;
    case 'fountain':
      return <Fountain x={d.x} y={d.y} size={d.size} />;
    case 'bench':
      return <Bench x={d.x} y={d.y} />;
    case 'lamp':
      return <Lamp x={d.x} y={d.y} />;
    case 'runway':
      return <RunwayStrip d={d} />;
    case 'landmark':
      return <Landmark x={d.x} y={d.y} kind={d.landmark ?? f.landmark} color={f.landmarkColor} />;
    case 'hill':
      return <Hill d={d} leaf={f.leaf[1]} park={f.park} />;
    case 'bridge':
      return <BridgeTop d={d} />;
    case 'station':
      return <Station d={d} />;
  }
}

// ---------------------------------------------------------------------------
// Vehicles

export function VehicleShape({ spec, axis }: { spec: VehicleSpec; axis: 'x' | 'y' }) {
  const w = axis === 'x' ? spec.len : spec.wid;
  const d = axis === 'x' ? spec.wid : spec.len;
  const x = -w / 2;
  const y = -d / 2;
  const glass = '#1e293b';
  if (spec.extra === 'rider') {
    const c = project(0, 0);
    return (
      <g>
        <ellipse cx={c.x + 2} cy={c.y + 1} rx="7" ry="3" fill="#0f172a" opacity="0.15" />
        <Box x={x} y={y} w={w} d={d} h={4} z={1} color={spec.body} edge={false} />
        <rect
          x={c.x - 2}
          y={c.y - 11}
          width="4"
          height="7"
          rx="2"
          fill={spec.accent === '#111827' ? '#334155' : spec.accent}
        />
        <circle cx={c.x} cy={c.y - 12.5} r="2.6" fill={spec.accent} />
      </g>
    );
  }
  const h = spec.h;
  const band = (zt: number, bh: number) => (
    <>
      <g transform={leftM(x, y, d, zt)}>
        <rect x={0.04} y={0} width={w - 0.08} height={bh} fill={glass} opacity="0.85" />
      </g>
      <g transform={rightM(x, y, w, d, zt)}>
        <rect x={0.04} y={0} width={d - 0.08} height={bh} fill={glass} opacity="0.75" />
      </g>
    </>
  );
  return (
    <g>
      <polygon
        points={poly(P(x, y), P(x + w + 0.15, y), P(x + w + 0.15, y + d), P(x, y + d))}
        fill="#0f172a"
        opacity="0.18"
      />
      <Box x={x} y={y} w={w} d={d} h={h - 1} z={1} color={spec.body} />
      {spec.extra === 'double' ? (
        <>
          {band(h - 2, 4)}
          {band(h - 11, 4)}
        </>
      ) : (
        band(h - 2, Math.min(5, h * 0.4))
      )}
      {spec.extra === 'stripes' && (
        <>
          <g transform={leftM(x, y, d, 5)}>
            <rect x={0} y={0} width={w} height={1.6} fill={spec.accent} />
          </g>
          <g transform={rightM(x, y, w, d, 5)}>
            <rect x={0} y={0} width={d} height={1.6} fill={spec.accent} />
          </g>
        </>
      )}
      {spec.extra === 'sign' && (
        <Box x={-0.06} y={-0.04} w={0.12} d={0.08} h={3} z={h} color={spec.accent} edge={false} />
      )}
      {spec.extra === 'cable' && (
        <>
          <g transform={leftM(x, y, d, h - 1)}>
            <rect x={0} y={3} width={w} height={2} fill={spec.accent} />
          </g>
          <Box
            x={x - 0.04}
            y={y - 0.04}
            w={w + 0.08}
            d={d + 0.08}
            h={2}
            z={h}
            color="#7f1d1d"
            edge={false}
          />
        </>
      )}
      {spec.extra === 'sensor' && (
        <Cylinder cx={0} cy={0} r={0.07} h={3} z={h} color={spec.accent} />
      )}
      {spec.extra === 'rack' && (
        <Box
          x={x + 0.08}
          y={y + 0.05}
          w={w - 0.16}
          d={d - 0.1}
          h={3}
          z={h}
          color={spec.accent}
          edge={false}
        />
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Avatar

export interface AvatarLook {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'afro' | 'bun' | 'long' | 'braids' | 'buzz';
  top: string;
  bottom: string;
  accessory: 'glasses' | 'tie' | 'cap' | 'lanyard' | 'scarf' | 'none';
  /** Wave 5: the player's choice (AI characters: from their seed). */
  gender?: 'female' | 'male';
}

const SKINS = [
  '#5c3a21',
  '#7a4a2a',
  '#8d5524',
  '#a0673a',
  '#c68642',
  '#e0ac69',
  '#f1c27d',
  '#ffdbac',
];
const HAIRS = ['#120c08', '#2b1b10', '#4a2c17', '#0f0f0f', '#7a4b24', '#3f3f46'];
const STYLES: AvatarLook['hairStyle'][] = ['short', 'afro', 'bun', 'long', 'braids', 'buzz'];
const OUTFITS: Record<string, Pick<AvatarLook, 'top' | 'bottom' | 'accessory'>> = {
  'f-engineer': { top: '#0f766e', bottom: '#1e293b', accessory: 'glasses' },
  'f-banker': { top: '#1e3a8a', bottom: '#1e293b', accessory: 'tie' },
  'f-dropout': { top: '#f97316', bottom: '#2563eb', accessory: 'cap' },
  'f-consultant': { top: '#475569', bottom: '#334155', accessory: 'lanyard' },
  'f-second-time': { top: '#7c3aed', bottom: '#1f2937', accessory: 'none' },
  'f-corporate': { top: '#e2e8f0', bottom: '#334155', accessory: 'tie' },
  'i-operator': { top: '#065f46', bottom: '#374151', accessory: 'none' },
  'i-banker': { top: '#111827', bottom: '#111827', accessory: 'tie' },
  'i-consultant': { top: '#64748b', bottom: '#334155', accessory: 'glasses' },
  'i-corporate': { top: '#1e40af', bottom: '#1f2937', accessory: 'tie' },
  'i-exited': { top: '#fef3c7', bottom: '#a16207', accessory: 'scarf' },
  'i-first': { top: '#db2777', bottom: '#1f2937', accessory: 'none' },
  'b-commercial': { top: '#1e3a8a', bottom: '#111827', accessory: 'tie' },
  'b-regulator': { top: '#334155', bottom: '#111827', accessory: 'glasses' },
  'b-fintech': { top: '#0891b2', bottom: '#1e293b', accessory: 'lanyard' },
  'b-ib': { top: '#0f172a', bottom: '#0f172a', accessory: 'tie' },
  'b-microfinance': { top: '#15803d', bottom: '#78350f', accessory: 'scarf' },
  'b-wealthy': { top: '#a16207', bottom: '#1f2937', accessory: 'scarf' },
};

const FEMALE_STYLES: AvatarLook['hairStyle'][] = ['bun', 'long', 'braids', 'afro'];
const MALE_STYLES: AvatarLook['hairStyle'][] = ['short', 'buzz', 'afro', 'short'];

/**
 * Appearance from the background (outfit) and the player id (skin, hair).
 * With a gender (Wave 5) the hair and figure follow it; without one (saved
 * players, AI characters) it comes from the seed, as before.
 */
export function avatarLook(
  backgroundId: string | undefined,
  playerId: string,
  gender?: 'female' | 'male' | null,
): AvatarLook {
  const h = hash(`${playerId}:${backgroundId ?? ''}`);
  const outfit = OUTFITS[backgroundId ?? ''] ?? {
    top: '#0f766e',
    bottom: '#1e293b',
    accessory: 'none' as const,
  };
  const style = STYLES[(h >>> 9) % STYLES.length]!;
  const g = gender ?? (['bun', 'long', 'braids'].includes(style) ? 'female' : 'male');
  const styles = g === 'female' ? FEMALE_STYLES : MALE_STYLES;
  return {
    skin: SKINS[h % SKINS.length]!,
    hair: HAIRS[(h >>> 5) % HAIRS.length]!,
    hairStyle: gender ? styles[(h >>> 9) % styles.length]! : style,
    ...outfit,
    // A tie reads as a man's suit: women wear a scarf instead.
    ...(g === 'female' && outfit.accessory === 'tie' ? { accessory: 'scarf' as const } : {}),
    gender: g,
  };
}

/** A small vector character with feet at (0,0). Legs swing when the parent has .is-walking. */
export function AvatarFigure({ look, label }: { look: AvatarLook; label?: string }) {
  const { skin, hair, hairStyle, top, bottom, accessory } = look;
  return (
    <g className="city-avatar-fig">
      <ellipse cx="0" cy="0" rx="7" ry="3" fill="#0f172a" opacity="0.22" />
      <g className="city-leg city-leg-l">
        <rect x="-3.6" y="-12" width="3.2" height="12" rx="1.5" fill={bottom} />
        <ellipse cx="-2" cy="-0.5" rx="2.4" ry="1.3" fill="#111827" />
      </g>
      <g className="city-leg city-leg-r">
        <rect x="0.4" y="-12" width="3.2" height="12" rx="1.5" fill={shade(bottom, -0.15)} />
        <ellipse cx="2" cy="-0.5" rx="2.4" ry="1.3" fill="#111827" />
      </g>
      {look.gender === 'female' && (
        <path d="M -5.6 -12.5 L 5.6 -12.5 L 7 -5 L -7 -5 Z" fill={bottom} />
      )}
      <g className="city-body">
        <rect x="-5.5" y="-24" width="11" height="14" rx="4" fill={top} />
        <rect
          x="-7.6"
          y="-23"
          width="3"
          height="11"
          rx="1.5"
          fill={shade(top, -0.12)}
          className="city-arm-l"
        />
        <rect
          x="4.6"
          y="-23"
          width="3"
          height="11"
          rx="1.5"
          fill={shade(top, -0.18)}
          className="city-arm-r"
        />
        {accessory === 'tie' && <polygon points="0,-23 1.5,-20 0,-13 -1.5,-20" fill="#b91c1c" />}
        {accessory === 'lanyard' && (
          <>
            <path d="M -3 -24 L 0 -17 L 3 -24" stroke="#f59e0b" strokeWidth="0.9" fill="none" />
            <rect x="-1.5" y="-17" width="3" height="3.5" rx="0.6" fill="#fff" />
          </>
        )}
        {accessory === 'scarf' && (
          <rect x="-5" y="-25" width="10" height="3" rx="1.5" fill="#f59e0b" />
        )}
        <rect x="-1.8" y="-26.5" width="3.6" height="3" fill={shade(skin, -0.1)} />
        <circle cx="0" cy="-31" r="6" fill={skin} />
        {hairStyle === 'afro' && <circle cx="0" cy="-34" r="7.2" fill={hair} />}
        {hairStyle === 'short' && (
          <path d="M -6 -31 A 6 6 0 0 1 6 -31 L 6 -33 Q 0 -40 -6 -33 Z" fill={hair} />
        )}
        {hairStyle === 'buzz' && (
          <path d="M -5.8 -32 A 6 6 0 0 1 5.8 -32 Q 0 -36 -5.8 -32 Z" fill={hair} />
        )}
        {hairStyle === 'bun' && (
          <>
            <path d="M -6 -31 A 6 6 0 0 1 6 -31 Q 0 -39 -6 -31 Z" fill={hair} />
            <circle cx="0" cy="-38.5" r="3" fill={hair} />
          </>
        )}
        {hairStyle === 'long' && (
          <path
            d="M -6.5 -24 L -6.5 -32 A 6.5 6.5 0 0 1 6.5 -32 L 6.5 -24 L 4.5 -24 L 4.5 -31 Q 0 -35 -4.5 -31 L -4.5 -24 Z"
            fill={hair}
          />
        )}
        {hairStyle === 'braids' && (
          <>
            <path d="M -6 -31 A 6 6 0 0 1 6 -31 Q 0 -38 -6 -31 Z" fill={hair} />
            <rect x="-7" y="-32" width="2" height="10" rx="1" fill={hair} />
            <rect x="5" y="-32" width="2" height="10" rx="1" fill={hair} />
          </>
        )}
        {(hairStyle === 'afro' || hairStyle === 'buzz') && (
          <circle cx="0" cy="-30" r="5.2" fill={skin} />
        )}
        <circle cx="2" cy="-30.5" r="0.8" fill="#111827" />
        <circle cx="-1.5" cy="-30.5" r="0.8" fill="#111827" />
        {look.gender === 'female' && (
          <>
            <circle cx="-5.8" cy="-28.6" r="0.9" fill="#fbbf24" />
            <circle cx="5.8" cy="-28.6" r="0.9" fill="#fbbf24" />
          </>
        )}
        <path d="M -0.8 -27.6 Q 0.6 -26.6 2 -27.6" stroke="#7c2d12" strokeWidth="0.7" fill="none" />
        {accessory === 'glasses' && (
          <g stroke="#111827" strokeWidth="0.7" fill="none">
            <circle cx="-1.5" cy="-30.5" r="1.8" />
            <circle cx="2.2" cy="-30.5" r="1.8" />
          </g>
        )}
        {accessory === 'cap' && (
          <>
            <path d="M -6 -33 A 6 6 0 0 1 6 -33 Z" fill="#dc2626" />
            <rect x="2" y="-34" width="6" height="1.8" rx="0.9" fill="#b91c1c" />
          </>
        )}
      </g>
      {label && (
        <g transform="translate(0 -48)">
          <rect
            x={-label.length * 3 - 6}
            y="-8"
            width={label.length * 6 + 12}
            height="14"
            rx="7"
            fill="#0f172a"
            opacity="0.8"
          />
          <text x="0" y="2" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Bunting (Wave 2): strings of pennants over a venue with an event coming up.

const PENNANTS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

/** A sagging string of pennants between two screen points. */
function Garland({ a, b, sag, n }: { a: Pt; b: Pt; sag: number; n: number }) {
  const at = (u: number): Pt => ({
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u + sag * 4 * u * (1 - u),
  });
  const mid = at(0.5);
  const flags: ReactNode[] = [];
  for (let k = 0; k < n; k++) {
    const u0 = (k + 0.15) / n;
    const u1 = (k + 0.85) / n;
    const p0 = at(u0);
    const p1 = at(u1);
    const tip = at((u0 + u1) / 2);
    flags.push(
      <polygon
        key={k}
        points={`${r1(p0.x)},${r1(p0.y)} ${r1(p1.x)},${r1(p1.y)} ${r1(tip.x)},${r1(tip.y + 6)}`}
        fill={PENNANTS[k % PENNANTS.length]}
      />,
    );
  }
  return (
    <g>
      <path
        d={`M ${r1(a.x)} ${r1(a.y)} Q ${r1(mid.x)} ${r1(mid.y + sag)} ${r1(b.x)} ${r1(b.y)}`}
        stroke="#334155"
        strokeWidth="0.7"
        fill="none"
      />
      {flags}
    </g>
  );
}

/** Bunting draped along a building's two visible roof edges, plus a flag on a pole. */
export function Bunting({ p }: { p: Place }) {
  const z = p.h + 3;
  const sp = (x: number, y: number): Pt => {
    const s = project(x, y);
    return { x: s.x, y: s.y - z };
  };
  const front = sp(p.x, p.y + p.d);
  const corner = sp(p.x + p.w, p.y + p.d);
  const back = sp(p.x + p.w, p.y);
  const top = project(p.x + p.w / 2, p.y + p.d / 2);
  const poleX = r1(top.x);
  const poleY = r1(top.y - p.h - (p.motif === 'hall' ? 11 : 2));
  const n = (a: Pt, b: Pt) => Math.max(3, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 9));
  return (
    <g className="city-bunting" pointerEvents="none">
      <Garland a={front} b={corner} sag={4} n={n(front, corner)} />
      <Garland a={corner} b={back} sag={4} n={n(corner, back)} />
      <line x1={poleX} y1={poleY} x2={poleX} y2={poleY - 22} stroke="#475569" strokeWidth="1.2" />
      <polygon
        className="city-flag"
        points={`${poleX},${poleY - 22} ${poleX + 13},${poleY - 18} ${poleX},${poleY - 14}`}
        fill="#8b5cf6"
      />
      <circle cx={poleX} cy={poleY - 22.5} r="1.3" fill="#fbbf24" />
    </g>
  );
}
