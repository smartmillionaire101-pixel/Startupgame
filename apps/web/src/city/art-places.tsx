/**
 * Wave 3 art: local business buildings (one look per shape, each with its
 * name sign), the per-city landmarks of the city plans, bridges, hills and
 * transit stops. Same pure-SVG isometric primitives as ./art.
 */
import type { ReactNode } from 'react';
import {
  Awning,
  Box,
  Cylinder,
  Gable,
  P,
  Shadow,
  Windows,
  leftM,
  mix,
  poly,
  r1,
  rightM,
  shade,
} from './art';
import type { LandmarkKind } from './flavour';
import { project, TH, TW, type Decor, type Place, type Pt } from './layout';

// ---------------------------------------------------------------------------
// Businesses

/** A sign board across the top of the front face, in the business's accent. */
function Sign({ p, z, len }: { p: Place; z: number; len?: number }) {
  const w = len ?? p.w;
  return (
    <g transform={leftM(p.x, p.y, p.d, z)}>
      <rect x={0.06} y={0} width={w - 0.12} height={5.5} fill={p.accent} rx={0.02} />
      <rect x={0.16} y={2.2} width={(w - 0.32) * 0.75} height={1.1} fill="#fff" opacity="0.85" />
    </g>
  );
}

/** Café / restaurant tables on the pavement in front of the door. */
function Terrace({ p, n, color }: { p: Place; n: number; color: string }) {
  if (!p.doorFace) return null;
  const out: ReactNode[] = [];
  for (let k = 0; k < n; k++) {
    const f = (k + 0.5) / n;
    const at =
      p.doorFace === 'left'
        ? { x: p.x + 0.12 + (p.w - 0.24) * f, y: p.y + p.d + 0.2 }
        : { x: p.x + p.w + 0.2, y: p.y + 0.12 + (p.d - 0.24) * f };
    const q = project(at.x, at.y);
    out.push(
      <g key={k}>
        <ellipse cx={q.x} cy={q.y} rx="4.5" ry="2" fill="#0f172a" opacity="0.12" />
        <line x1={q.x} y1={q.y} x2={q.x} y2={q.y - 5} stroke="#57534e" strokeWidth="0.8" />
        <ellipse cx={q.x} cy={q.y - 5} rx="3.2" ry="1.4" fill="#f5f5f4" />
        <rect x={q.x - 4.5} y={q.y - 3.5} width="1.6" height="3.5" fill="#78350f" />
        <rect x={q.x + 2.9} y={q.y - 3.5} width="1.6" height="3.5" fill="#78350f" />
        {k % 2 === 0 && (
          <>
            <line x1={q.x} y1={q.y - 5} x2={q.x} y2={q.y - 13} stroke="#57534e" strokeWidth="0.7" />
            <ellipse cx={q.x} cy={q.y - 13} rx="6" ry="2.6" fill={color} />
          </>
        )}
      </g>,
    );
  }
  return <g>{out}</g>;
}

function glassFront(w: number, h: number, top: number, door = true): ReactNode {
  return (
    <>
      <rect x={0.08} y={top} width={w - 0.16} height={h - top - 2} fill="#bae6fd" opacity="0.9" />
      <polygon
        points={`0.15,${h - 3} 0.32,${h - 3} 0.55,${top} 0.38,${top}`}
        fill="#fff"
        opacity="0.45"
      />
      {door && <rect x={w / 2 - 0.1} y={h - 13} width={0.2} height={13} fill="#3f2a1d" />}
    </>
  );
}

/** Business buildings by motif ('b-*'); null for any other motif. */
export function BusinessBody({ p }: { p: Place }): ReactNode {
  const { x, y, w, d, h, color: c, accent: a } = p;
  switch (p.motif) {
    case 'b-shop': {
      const wall = mix(c, '#ffffff', 0.5);
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color={wall} />
          <g transform={leftM(x, y, d, h)}>{glassFront(w, h, 12)}</g>
          <g transform={rightM(x, y, w, d, h)}>
            <rect x={0} y={0} width={d} height={7} fill={shade(c, -0.15)} />
          </g>
          <Sign p={p} z={h - 1} />
          <Awning x={x} y={y} w={w} d={d} z={h - 8} color={a} />
        </g>
      );
    }
    case 'b-restaurant':
    case 'b-cafe': {
      const cafe = p.motif === 'b-cafe';
      const wall = mix(c, '#fff7ed', cafe ? 0.55 : 0.35);
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color={wall} />
          <g transform={leftM(x, y, d, h)}>
            {glassFront(w, h, 11)}
            {/* Warm light inside. */}
            <rect x={0.12} y={h - 9} width={w - 0.24} height={3} fill="#fde68a" opacity="0.7" />
          </g>
          <g transform={rightM(x, y, w, d, h)}>
            <rect x={0.1} y={9} width={d - 0.2} height={h - 13} fill="#fde68a" opacity="0.55" />
          </g>
          <Sign p={p} z={h - 1} />
          <Awning x={x} y={y} w={w} d={d} z={h - 8} color={a} />
          {cafe ? (
            <g transform={`translate(${r1(project(x + w / 2, y + d / 2).x)},${r1(project(x + w / 2, y + d / 2).y - h - 9)})`}>
              <rect x="-5" y="-4" width="10" height="8" rx="2" fill="#fff" stroke="#78350f" />
              <path d="M5 -2 q4 0 0 4" stroke="#78350f" fill="none" />
              <path d="M-2 -7 q2 -2 0 -4 M2 -7 q2 -2 0 -4" stroke="#94a3b8" fill="none" strokeWidth="0.8" />
            </g>
          ) : (
            <Box x={x + 0.2} y={y + 0.15} w={0.25} d={0.25} h={10} z={h} color="#78716c" />
          )}
          <Terrace p={p} n={cafe ? 2 : 3} color={a} />
        </g>
      );
    }
    case 'b-pub': {
      const q = project(x + w, y + d);
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color={c} left={shade(c, 0.05)} />
          <g transform={leftM(x, y, d, h)}>
            <rect x={0} y={0} width={w} height={h} fill="#000" opacity="0.08" />
            <rect x={0.1} y={13} width={w * 0.35} height={h - 16} fill="#fbbf24" opacity="0.65" />
            <rect x={w * 0.55} y={13} width={w * 0.35} height={h - 16} fill="#fbbf24" opacity="0.65" />
            <rect x={w * 0.45 - 0.05} y={h - 14} width={0.18} height={14} fill="#1c1917" />
            <rect x={0.04} y={2} width={w - 0.08} height={7} fill="#1c1917" />
            <rect x={0.14} y={4.5} width={w * 0.6} height={1.6} fill="#fbbf24" />
          </g>
          <Gable x={x} y={y} w={w} d={d} z={h} rise={8} color="#334155" />
          {/* The hanging pub sign at the corner. */}
          <line x1={q.x} y1={q.y - h + 8} x2={q.x + 9} y2={q.y - h + 3} stroke="#1c1917" strokeWidth="1.2" />
          <rect x={q.x + 5} y={q.y - h + 4} width="8" height="9" fill={a} stroke="#1c1917" strokeWidth="0.8" />
          <circle cx={q.x - 2} cy={q.y - h + 14} r="1.6" fill="#fde68a" />
        </g>
      );
    }
    case 'b-warehouse': {
      const ribs: ReactNode[] = [];
      for (let u = 0.08; u < w; u += 0.12)
        ribs.push(<rect key={u} x={u} y={0} width={0.02} height={h} fill="#000" opacity="0.12" />);
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color={c} />
          <g transform={leftM(x, y, d, h)}>
            {ribs}
            <rect x={0.2} y={h - 16} width={0.5} height={16} fill="#475569" />
            {[0, 1, 2, 3].map((k) => (
              <rect key={k} x={0.2} y={h - 16 + k * 4} width={0.5} height={0.6} fill="#94a3b8" />
            ))}
            <rect x={0.85} y={h - 12} width={0.18} height={12} fill="#1f2937" />
          </g>
          <Sign p={p} z={h - 1} len={Math.min(w, 0.9)} />
          {[0, 1, 2].map((k) => (
            <polygon
              key={k}
              points={poly(
                P(x + (w / 3) * k, y, h),
                P(x + (w / 3) * k, y + d, h),
                P(x + (w / 3) * (k + 1), y + d, h + 6),
                P(x + (w / 3) * (k + 1), y, h + 6),
              )}
              fill={k % 2 ? shade(c, -0.15) : shade(c, 0.1)}
            />
          ))}
          <Box x={x + w + 0.05} y={y + 0.2} w={0.22} d={0.3} h={5} color="#a16207" edge={false} />
        </g>
      );
    }
    case 'b-clinic': {
      const ct = project(x + w / 2, y + d / 2);
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color="#f8fafc" />
          <Windows x={x} y={y} w={w} d={d} zt={h} h={h - 8} color="#7dd3fc" seed={p.id} row={9} />
          <g transform={leftM(x, y, d, h)}>
            <rect x={0} y={0} width={w} height={4} fill={a} />
            <rect x={w / 2 - 0.15} y={h - 12} width={0.3} height={12} fill="#bae6fd" />
          </g>
          <Box x={x + w / 2 - 0.2} y={y + d / 2 - 0.2} w={0.4} d={0.08} h={12} z={h} color="#fff" edge={false} />
          <g transform={`translate(${r1(ct.x)},${r1(ct.y - h - 8)})`}>
            <rect x="-2" y="-6" width="4" height="12" fill="#dc2626" />
            <rect x="-6" y="-2" width="12" height="4" fill="#dc2626" />
          </g>
        </g>
      );
    }
    case 'b-school': {
      const q = project(x + 0.1, y + 0.1);
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color={mix(c, '#b45309', 0.35)} />
          <Windows x={x} y={y} w={w} d={d} zt={h} h={h} color="#fef3c7" seed={p.id} row={11} />
          <g transform={leftM(x, y, d, h)}>
            <rect x={w / 2 - 0.14} y={h - 13} width={0.28} height={13} fill="#1e3a8a" />
          </g>
          <Gable x={x} y={y} w={w} d={d} z={h} rise={10} color="#7c2d12" />
          <Sign p={p} z={h - 2} len={w * 0.8} />
          <line x1={q.x} y1={q.y - h - 4} x2={q.x} y2={q.y - h - 30} stroke="#475569" strokeWidth="1" />
          <rect x={q.x} y={q.y - h - 30} width="9" height="6" fill={p.accent} />
        </g>
      );
    }
    case 'b-hotel': {
      const ct = project(x + w / 2, y + d / 2);
      return (
        <g>
          <Box x={x} y={y} w={w} d={d} h={h} color={c} left={shade(c, 0.1)} />
          <Windows x={x} y={y} w={w} d={d} zt={h} h={h - 10} color={shade(c, -0.45)} seed={p.id} row={8} />
          <g transform={leftM(x, y, d, h)}>
            <rect x={0.1} y={h - 10} width={w - 0.2} height={10} fill="#fde68a" opacity="0.7" />
          </g>
          <Box x={x + w / 2 - 0.3} y={y + d} w={0.6} d={0.3} h={2} z={9} color={p.accent} edge={false} />
          <g transform={`translate(${r1(ct.x)},${r1(ct.y - h - 4)})`}>
            <rect x="-14" y="-8" width="28" height="8" rx="1" fill={p.accent} />
            <rect x="-10" y="-5.5" width="20" height="2" fill="#fff" />
          </g>
        </g>
      );
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Landmarks of the city plans

export function PlanLandmark({
  x,
  y,
  kind,
  color,
}: {
  x: number;
  y: number;
  kind: LandmarkKind;
  color: string;
}): ReactNode {
  const c = project(x, y);
  switch (kind) {
    case 'transamerica': {
      const H = 190;
      const s = 0.55;
      return (
        <g data-landmark="transamerica">
          <Shadow x={x - s} y={y - s} w={s * 2} d={s * 2} h={H} />
          <polygon points={poly(P(x - s, y + s), P(x + s, y + s), P(x, y, H))} fill="#f5f5f4" />
          <polygon points={poly(P(x + s, y + s), P(x + s, y - s), P(x, y, H))} fill="#d6d3d1" />
          {Array.from({ length: 16 }, (_, i) => {
            const z = 8 + i * 10;
            const k = 1 - z / H;
            const a = project(x - s * k, y + s * k);
            const b = project(x + s * k, y + s * k);
            return (
              <line key={i} x1={a.x} y1={a.y - z} x2={b.x} y2={b.y - z} stroke="#a8a29e" strokeWidth="0.7" />
            );
          })}
          <rect x={c.x - 0.8} y={c.y - H - 22} width="1.6" height="24" fill="#e7e5e4" />
        </g>
      );
    }
    case 'painted-ladies': {
      const colors = ['#f9a8d4', '#a7f3d0', '#fde68a', '#bfdbfe', '#ddd6fe', '#fecaca'];
      return (
        <g data-landmark="painted-ladies">
          {colors.map((col, i) => {
            const hx = x - 1.6 + i * 0.55;
            const hy = y - 0.2;
            const hh = 26 + (i % 2) * 3 + i * 3;
            return (
              <g key={col}>
                <Box x={hx} y={hy} w={0.5} d={0.7} h={hh} color={col} />
                <g transform={leftM(hx, hy, 0.7, hh)}>
                  <rect x={0.08} y={6} width={0.14} height={7} fill="#fff" />
                  <rect x={0.28} y={6} width={0.14} height={7} fill="#fff" />
                  <rect x={0.08} y={16} width={0.34} height={6} fill="#fff" opacity="0.8" />
                </g>
                <polygon
                  points={poly(P(hx, hy + 0.7, hh), P(hx + 0.5, hy + 0.7, hh), P(hx + 0.25, hy + 0.7, hh + 12))}
                  fill={shade(col, -0.25)}
                />
                <polygon
                  points={poly(P(hx + 0.5, hy + 0.7, hh), P(hx + 0.5, hy, hh), P(hx + 0.25, hy, hh + 12), P(hx + 0.25, hy + 0.7, hh + 12))}
                  fill={shade(col, -0.4)}
                />
              </g>
            );
          })}
        </g>
      );
    }
    case 'cable-car': {
      return (
        <g data-landmark="cable-car">
          <ellipse cx={c.x} cy={c.y} rx={TW * 1.4} ry={TH * 1.4} fill="#57534e" />
          <ellipse cx={c.x} cy={c.y} rx={TW * 1.2} ry={TH * 1.2} fill="#78716c" />
          <line x1={c.x - TW * 2} y1={c.y - TH * 2} x2={c.x + TW * 2} y2={c.y + TH * 2} stroke="#334155" strokeWidth="1.5" />
          <Box x={x - 0.4} y={y - 0.15} w={0.8} d={0.32} h={15} color="#b91c1c" />
          <g transform={leftM(x - 0.4, y - 0.15, 0.32, 15)}>
            <rect x={0.04} y={3} width={0.72} height={4} fill="#fde68a" />
            <rect x={0} y={9} width={0.8} height={1.5} fill="#fef3c7" />
          </g>
          <Box x={x - 0.45} y={y - 0.2} w={0.9} d={0.42} h={2} z={15} color="#7f1d1d" edge={false} />
        </g>
      );
    }
    case 'gherkin': {
      const H = 140;
      const rx = 22;
      return (
        <g data-landmark="gherkin">
          <Shadow x={x - 0.6} y={y - 0.6} w={1.2} d={1.2} h={H} />
          <path
            d={`M ${c.x - rx * 0.75} ${c.y} C ${c.x - rx * 1.25} ${c.y - H * 0.45}, ${c.x - rx * 0.6} ${c.y - H * 0.95}, ${c.x} ${c.y - H} C ${c.x + rx * 0.6} ${c.y - H * 0.95}, ${c.x + rx * 1.25} ${c.y - H * 0.45}, ${c.x + rx * 0.75} ${c.y} Z`}
            fill={mix('#1e3a5f', color, 0.15)}
          />
          {Array.from({ length: 9 }, (_, i) => (
            <path
              key={i}
              d={`M ${c.x - rx + i * 5} ${c.y - 4} Q ${c.x + 6} ${c.y - H * 0.5} ${c.x + rx - 30 + i * 4} ${c.y - H + 12}`}
              stroke="#7dd3fc"
              strokeOpacity="0.45"
              fill="none"
              strokeWidth="1.4"
            />
          ))}
          <path
            d={`M ${c.x - rx * 0.5} ${c.y - 8} C ${c.x - rx * 0.9} ${c.y - H * 0.45}, ${c.x - rx * 0.4} ${c.y - H * 0.9}, ${c.x - 2} ${c.y - H + 4}`}
            stroke="#fff"
            strokeOpacity="0.35"
            strokeWidth="3"
            fill="none"
          />
        </g>
      );
    }
    case 'london-eye': {
      const R = 62;
      const cy = c.y - R - 14;
      return (
        <g data-landmark="london-eye">
          <line x1={c.x - 20} y1={c.y} x2={c.x} y2={cy} stroke="#e2e8f0" strokeWidth="3" />
          <line x1={c.x + 14} y1={c.y + 4} x2={c.x} y2={cy} stroke="#cbd5e1" strokeWidth="3" />
          <ellipse cx={c.x} cy={cy} rx={R * 0.82} ry={R} fill="none" stroke="#f1f5f9" strokeWidth="2.4" />
          {Array.from({ length: 16 }, (_, i) => {
            const t = (i / 16) * Math.PI * 2;
            const px = c.x + Math.cos(t) * R * 0.82;
            const py = cy + Math.sin(t) * R;
            return (
              <g key={i}>
                <line x1={c.x} y1={cy} x2={px} y2={py} stroke="#e2e8f0" strokeWidth="0.6" />
                <ellipse cx={px} cy={py} rx="3.4" ry="2.4" fill="#bae6fd" stroke="#64748b" strokeWidth="0.5" />
              </g>
            );
          })}
          <circle cx={c.x} cy={cy} r="3" fill="#94a3b8" />
        </g>
      );
    }
    case 'lighthouse': {
      const H = 70;
      return (
        <g data-landmark="lighthouse">
          <Shadow x={x - 0.3} y={y - 0.3} w={0.6} d={0.6} h={H} />
          <Cylinder cx={x} cy={y} r={0.38} h={8} color="#e7e5e4" />
          {[0, 1, 2, 3].map((k) => (
            <Cylinder key={k} cx={x} cy={y} r={0.28 - k * 0.02} h={14} z={8 + k * 14} color={k % 2 ? '#fff' : '#dc2626'} />
          ))}
          <Cylinder cx={x} cy={y} r={0.22} h={8} z={64} color="#fde68a" top="#1f2937" />
          <circle cx={c.x} cy={c.y - 68} r="5" fill="#fef9c3" opacity="0.6" className="city-blink" />
        </g>
      );
    }
    case 'cairo-tower': {
      const H = 160;
      return (
        <g data-landmark="cairo-tower">
          <Shadow x={x - 0.3} y={y - 0.3} w={0.6} d={0.6} h={H} />
          <Cylinder cx={x} cy={y} r={0.32} h={H - 26} color={color} />
          {Array.from({ length: 14 }, (_, i) => (
            <path
              key={i}
              d={`M ${c.x - 13} ${c.y - 8 - i * 9} l 13 -6 l 13 6`}
              stroke={shade(color, -0.35)}
              fill="none"
              strokeWidth="0.8"
            />
          ))}
          <path
            d={`M ${c.x - 13} ${c.y - H + 26} Q ${c.x - 24} ${c.y - H + 6} ${c.x - 16} ${c.y - H} L ${c.x + 16} ${c.y - H} Q ${c.x + 24} ${c.y - H + 6} ${c.x + 13} ${c.y - H + 26} Z`}
            fill={shade(color, -0.1)}
          />
          <rect x={c.x - 1} y={c.y - H - 18} width="2" height="18" fill="#475569" />
        </g>
      );
    }
    case 'minaret': {
      return (
        <g data-landmark="minaret">
          <Shadow x={x - 1.2} y={y - 1} w={2.2} d={1.8} h={40} />
          <Box x={x - 1.1} y={y - 0.6} w={1.8} d={1.4} h={22} color="#e7d5b0" />
          <g transform={leftM(x - 1.1, y - 0.6, 1.4, 22)}>
            {[0.3, 0.75, 1.2].map((u) => (
              <path key={u} d={`M ${u} 22 v -10 q 0.12 -6 0.24 0 v 10 z`} fill="#92400e" opacity="0.6" />
            ))}
          </g>
          <ellipse cx={project(x - 0.2, y + 0.1).x} cy={project(x - 0.2, y + 0.1).y - 22} rx="24" ry="9" fill="#c2a46b" />
          <path
            d={`M ${project(x - 0.2, y + 0.1).x - 22} ${project(x - 0.2, y + 0.1).y - 22} Q ${project(x - 0.2, y + 0.1).x} ${project(x - 0.2, y + 0.1).y - 56} ${project(x - 0.2, y + 0.1).x + 22} ${project(x - 0.2, y + 0.1).y - 22} Z`}
            fill="#d4b77c"
          />
          <Cylinder cx={x + 1.1} cy={y + 0.9} r={0.17} h={86} color="#e7d5b0" />
          <Cylinder cx={x + 1.1} cy={y + 0.9} r={0.25} h={4} z={60} color="#c2a46b" />
          <polygon
            points={`${project(x + 1.1, y + 0.9).x - 6},${project(x + 1.1, y + 0.9).y - 86} ${project(x + 1.1, y + 0.9).x + 6},${project(x + 1.1, y + 0.9).y - 86} ${project(x + 1.1, y + 0.9).x},${project(x + 1.1, y + 0.9).y - 104}`}
            fill="#a16207"
          />
        </g>
      );
    }
    case 'sail-hotel': {
      const H = 170;
      return (
        <g data-landmark="sail-hotel">
          <ellipse cx={c.x + 10} cy={c.y + 4} rx="40" ry="14" fill="#0f172a" opacity="0.12" />
          <path
            d={`M ${c.x - 16} ${c.y} Q ${c.x + 34} ${c.y - H * 0.5} ${c.x - 4} ${c.y - H} L ${c.x - 16} ${c.y - H} Z`}
            fill="#f8fafc"
          />
          <path
            d={`M ${c.x - 12} ${c.y - 8} Q ${c.x + 24} ${c.y - H * 0.5} ${c.x - 6} ${c.y - H + 10}`}
            stroke="#cbd5e1"
            fill="none"
            strokeWidth="2"
          />
          <rect x={c.x - 18} y={c.y - H - 14} width="3" height={H + 14} fill="#e2e8f0" />
          <ellipse cx={c.x + 8} cy={c.y - H * 0.78} rx="12" ry="3.5" fill="#94a3b8" />
        </g>
      );
    }
    case 'wind-tower': {
      const sand = '#e7cf9f';
      return (
        <g data-landmark="wind-tower">
          {[
            [-1.3, -0.6, 1.2, 1.0, 18],
            [0.2, -0.2, 1.1, 1.2, 22],
            [-0.6, 0.8, 1.4, 0.8, 16],
          ].map(([dx, dy, w, d, h], i) => (
            <g key={i}>
              <Box x={x + dx!} y={y + dy!} w={w!} d={d!} h={h!} color={sand} />
              <Box x={x + dx! + 0.3} y={y + dy! + 0.25} w={0.32} d={0.32} h={16} z={h!} color={shade(sand, 0.08)} />
              <g transform={leftM(x + dx! + 0.3, y + dy! + 0.25, 0.32, h! + 16)}>
                <rect x={0.06} y={2} width={0.05} height={10} fill="#78350f" opacity="0.6" />
                <rect x={0.2} y={2} width={0.05} height={10} fill="#78350f" opacity="0.6" />
              </g>
            </g>
          ))}
        </g>
      );
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Bridges, hills, stations

/** A bridge's towers, arches and cables (the deck is drawn with the streets). */
export function BridgeTop({ d }: { d: Decor }) {
  const from = d.from!;
  const to = d.to!;
  const col = d.color ?? '#94a3b8';
  const at = (f: number, side: number, z: number) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    // Offset across the deck.
    const ox = (-dy / len) * side;
    const oy = (dx / len) * side;
    const q = project(from.x + dx * f + ox, from.y + dy * f + oy);
    return { x: q.x, y: q.y - z };
  };
  const pt = (p: Pt) => `${r1(p.x)},${r1(p.y)}`;
  if (d.style === 'suspension') {
    const H = 64;
    const towers = [0.22, 0.78];
    const cable = (side: number) => {
      const a = at(0, side, 4);
      const t1 = at(towers[0]!, side, H);
      const m = at(0.5, side, 14);
      const t2 = at(towers[1]!, side, H);
      const b = at(1, side, 4);
      return `M ${pt(a)} Q ${pt(at(0.12, side, 30))} ${pt(t1)} Q ${pt(m)} ${pt(t2)} Q ${pt(at(0.88, side, 30))} ${pt(b)}`;
    };
    return (
      <g data-bridge={d.name}>
        {[-0.3, 0.3].map((s) => (
          <path key={s} d={cable(s)} stroke={col} strokeWidth="1.6" fill="none" />
        ))}
        {towers.map((f) =>
          [-0.3, 0.3].map((s) => {
            const base = at(f, s, 0);
            const top = at(f, s, H + 6);
            return (
              <line key={`${f}${s}`} x1={base.x} y1={base.y + 6} x2={top.x} y2={top.y} stroke={shade(col, -0.1)} strokeWidth="4" />
            );
          }),
        )}
        {towers.map((f) => {
          const a = at(f, -0.3, H - 4);
          const b = at(f, 0.3, H - 4);
          const a2 = at(f, -0.3, H * 0.55);
          const b2 = at(f, 0.3, H * 0.55);
          return (
            <g key={f}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth="3" />
              <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} stroke={col} strokeWidth="3" />
            </g>
          );
        })}
      </g>
    );
  }
  if (d.style === 'bascule') {
    // Two towers with pointed roofs and high walkways between them.
    const tower = (f: number) => {
      const c0 = at(f, 0, 0);
      const g = { x: c0.x, y: c0.y };
      return (
        <g key={f}>
          <rect x={g.x - 9} y={g.y - 56} width="18" height="56" fill="#d6c7a1" />
          <rect x={g.x - 9} y={g.y - 56} width="7" height="56" fill="#e7dcc0" />
          {[14, 28, 42].map((v) => (
            <rect key={v} x={g.x - 4} y={g.y - v - 6} width="3" height="6" fill="#475569" />
          ))}
          <polygon points={`${g.x - 10},${g.y - 56} ${g.x + 10},${g.y - 56} ${g.x},${g.y - 74}`} fill={col} />
          <polygon points={`${g.x - 10},${g.y - 56} ${g.x - 6},${g.y - 56} ${g.x - 8},${g.y - 66}`} fill={shade(col, 0.2)} />
        </g>
      );
    };
    const w1 = at(0.33, 0, 46);
    const w2 = at(0.67, 0, 46);
    const e1 = at(0, 0, 4);
    const e2 = at(1, 0, 4);
    const t1 = at(0.33, 0, 40);
    const t2 = at(0.67, 0, 40);
    return (
      <g data-bridge={d.name}>
        <path d={`M ${pt(e1)} Q ${pt(at(0.2, 0, 10))} ${pt(t1)}`} stroke={col} strokeWidth="2.2" fill="none" />
        <path d={`M ${pt(e2)} Q ${pt(at(0.8, 0, 10))} ${pt(t2)}`} stroke={col} strokeWidth="2.2" fill="none" />
        {tower(0.33)}
        {tower(0.67)}
        <line x1={w1.x} y1={w1.y} x2={w2.x} y2={w2.y} stroke={col} strokeWidth="4" />
        <line x1={w1.x} y1={w1.y + 6} x2={w2.x} y2={w2.y + 6} stroke={shade(col, 0.3)} strokeWidth="2" />
      </g>
    );
  }
  // Arch: one span with hangers.
  const pts = Array.from({ length: 9 }, (_, i) => {
    const f = 0.08 + (0.84 * i) / 8;
    return { f, top: at(f, 0, 4 + Math.sin(Math.PI * ((f - 0.08) / 0.84)) * 26) };
  });
  return (
    <g data-bridge={d.name}>
      <polyline points={pts.map((p) => pt(p.top)).join(' ')} stroke={col} strokeWidth="2.6" fill="none" />
      {pts.map((p, i) => {
        const b = at(p.f, 0, 3);
        return <line key={i} x1={b.x} y1={b.y} x2={p.top.x} y2={p.top.y} stroke={col} strokeWidth="0.7" />;
      })}
    </g>
  );
}

/** A hill: a grassy mound with a few houses on its slopes. */
export function Hill({ d, leaf, park }: { d: Decor; leaf: string; park: string }) {
  const c = project(d.x, d.y);
  const H = (d.h ?? 2) * 16;
  const rx = TW * 3.2;
  const ry = TH * 3.2;
  const houses = [
    [-0.9, 0.5],
    [0.6, 0.8],
    [-0.2, -0.6],
    [0.9, -0.3],
  ];
  return (
    <g data-hill={d.h}>
      <path
        d={`M ${c.x - rx} ${c.y} Q ${c.x - rx * 0.5} ${c.y - H * 1.6} ${c.x} ${c.y - H * 1.7} Q ${c.x + rx * 0.5} ${c.y - H * 1.6} ${c.x + rx} ${c.y} Q ${c.x} ${c.y + ry} ${c.x - rx} ${c.y} Z`}
        fill={park}
      />
      <path
        d={`M ${c.x} ${c.y - H * 1.7} Q ${c.x + rx * 0.5} ${c.y - H * 1.6} ${c.x + rx} ${c.y} Q ${c.x + rx * 0.5} ${c.y + ry * 0.6} ${c.x} ${c.y + ry * 0.4} Z`}
        fill="#000"
        opacity="0.08"
      />
      {houses.map(([hx, hy], i) => {
        const q = project(d.x + hx!, d.y + hy!);
        const lift = H * (1.2 - (Math.abs(hx!) + Math.abs(hy!)) * 0.45);
        const col = i % 2 ? (d.color ?? '#fde68a') : (d.roof ? mix(d.roof, '#ffffff', 0.7) : '#e2e8f0');
        return (
          <g key={i} transform={`translate(${r1(q.x)},${r1(q.y - lift)})`}>
            <rect x="-6" y="-10" width="12" height="10" fill={col} />
            <rect x="-6" y="-10" width="5" height="10" fill="#fff" opacity="0.25" />
            <polygon points="-7,-10 7,-10 0,-17" fill={d.roof ?? '#64748b'} />
          </g>
        );
      })}
      {[-1.4, 1.3].map((tx) => {
        const q = project(d.x + tx, d.y + 0.9);
        return <circle key={tx} cx={q.x} cy={q.y - H * 0.5} r="6" fill={leaf} />;
      })}
    </g>
  );
}

/** A transit stop: a Tube roundel, a metro "M" or a cable-car sign on a post. */
export function Station({ d }: { d: Decor }) {
  const q = project(d.x, d.y);
  return (
    <g data-station={d.name}>
      <line x1={q.x} y1={q.y} x2={q.x} y2={q.y - 18} stroke="#334155" strokeWidth="1.2" />
      {d.name === 'tube' ? (
        <g transform={`translate(${r1(q.x)},${r1(q.y - 22)})`}>
          <circle r="5.5" fill="none" stroke="#dc2626" strokeWidth="2.4" />
          <rect x="-8" y="-1.6" width="16" height="3.2" fill="#1e3a8a" />
        </g>
      ) : d.name === 'metro' ? (
        <g transform={`translate(${r1(q.x)},${r1(q.y - 23)})`}>
          <rect x="-5.5" y="-5.5" width="11" height="11" rx="1.5" fill="#dc2626" />
          <path d="M-3 3 V-3 L0 0.5 L3 -3 V3" stroke="#fff" strokeWidth="1.3" fill="none" />
        </g>
      ) : (
        <g transform={`translate(${r1(q.x)},${r1(q.y - 22)})`}>
          <rect x="-6" y="-4" width="12" height="8" rx="1" fill="#7f1d1d" />
          <rect x="-4" y="-1" width="8" height="2" fill="#fde68a" />
        </g>
      )}
    </g>
  );
}
