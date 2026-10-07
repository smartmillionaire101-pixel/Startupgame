/**
 * Top-down 3/4 furniture (Stardew-style): each piece shows its top and a
 * darker front face, and tall pieces rise above their footprint. Drawn in
 * local pixels with (0,0) at the footprint's top-left; one tile is 32 px.
 * Quality tiers 1–3 change materials (plain, warm, luxe with brass).
 */
import type { ReactNode } from 'react';

export const TILE = 32;

interface Mat {
  wood: string;
  woodDark: string;
  fabric: string;
  fabricDark: string;
  metal: string;
  accent: string;
}

const MATS: Record<number, Mat> = {
  1: {
    wood: '#b98a5e',
    woodDark: '#8a613d',
    fabric: '#8a9bb0',
    fabricDark: '#66778c',
    metal: '#9aa3ad',
    accent: '#cbd5e1',
  },
  2: {
    wood: '#9a6b43',
    woodDark: '#6f4a2c',
    fabric: '#2f7d74',
    fabricDark: '#205a53',
    metal: '#6b7280',
    accent: '#f59e0b',
  },
  3: {
    wood: '#5b3a29',
    woodDark: '#3b2418',
    fabric: '#7a2e45',
    fabricDark: '#561f31',
    metal: '#2b2f36',
    accent: '#d4a843',
  },
};

/** A box in 3/4 view: a top of height `top` over a front face of height `face`. */
function Box({
  x = 0,
  y = 0,
  w,
  top,
  face,
  fill,
  side,
  r = 3,
}: {
  x?: number;
  y?: number;
  w: number;
  top: number;
  face: number;
  fill: string;
  side: string;
  r?: number;
}) {
  return (
    <g>
      <rect x={x} y={y + top - r} width={w} height={face + r} rx={r} fill={side} />
      <rect x={x} y={y} width={w} height={top} rx={r} fill={fill} />
    </g>
  );
}

const shadow = (w: number, h: number) => (
  <ellipse cx={w / 2} cy={h - 3} rx={w / 2 - 2} ry={5} fill="#000" opacity="0.13" />
);

export function SlotArt({
  slot,
  tier,
  w,
  h,
  night,
}: {
  slot: string;
  tier: number;
  w: number;
  h: number;
  night?: boolean;
}): ReactNode {
  const m = MATS[tier] ?? MATS[1]!;
  const W = w * TILE;
  const H = h * TILE;
  switch (slot) {
    case 'bed':
      return (
        <g>
          {shadow(W, H)}
          <Box x={2} y={-6} w={W - 4} top={12} face={8} fill={m.woodDark} side={m.woodDark} />
          <Box x={2} y={4} w={W - 4} top={H - 16} face={10} fill="#f4f1ea" side={m.wood} />
          <rect x={6} y={8} width={W - 12} height={12} rx={5} fill="#ffffff" stroke="#e2ded4" />
          <rect x={2} y={30} width={W - 4} height={H - 46} rx={4} fill={m.fabric} />
          <rect x={2} y={30} width={W - 4} height={6} rx={3} fill={m.fabricDark} opacity="0.6" />
          {tier >= 3 && <rect x={2} y={H - 26} width={W - 4} height={5} fill={m.accent} />}
        </g>
      );
    case 'sofa':
      return (
        <g>
          {shadow(W, H)}
          <Box x={1} y={-4} w={W - 2} top={10} face={10} fill={m.fabricDark} side={m.fabricDark} />
          <Box x={1} y={8} w={W - 2} top={12} face={10} fill={m.fabric} side={m.fabricDark} />
          <Box x={-2} y={2} w={8} top={18} face={10} fill={m.fabricDark} side={m.fabricDark} />
          <Box x={W - 6} y={2} w={8} top={18} face={10} fill={m.fabricDark} side={m.fabricDark} />
          {[1, 2].map((i) => (
            <line
              key={i}
              x1={(W / 3) * i}
              y1={9}
              x2={(W / 3) * i}
              y2={20}
              stroke={m.fabricDark}
              strokeWidth="1"
            />
          ))}
          {tier >= 2 && <rect x={8} y={-1} width={10} height={9} rx={3} fill={m.accent} />}
        </g>
      );
    case 'desk':
      return (
        <g>
          {shadow(W, H)}
          <rect x={4} y={18} width={4} height={12} fill={m.woodDark} />
          <rect x={W - 8} y={18} width={4} height={12} fill={m.woodDark} />
          <Box x={1} y={2} w={W - 2} top={16} face={5} fill={m.wood} side={m.woodDark} />
          <circle cx={W - 14} cy={30} r={6} fill={tier >= 3 ? '#111827' : '#4b5563'} />
        </g>
      );
    case 'laptop':
      return (
        <g transform="translate(8 2)">
          <rect x={0} y={0} width={18} height={11} rx={1.5} fill="#1f2937" />
          <rect x={1.5} y={1.5} width={15} height={8} rx={1} fill={night ? '#93c5fd' : '#60a5fa'} />
          <rect x={-2} y={11} width={22} height={4} rx={1.5} fill="#9ca3af" />
        </g>
      );
    case 'wardrobe':
      return (
        <g>
          {shadow(W, H)}
          <Box x={1} y={-26} w={W - 2} top={8} face={48} fill={m.woodDark} side={m.wood} />
          <line x1={W / 2} y1={-16} x2={W / 2} y2={28} stroke={m.woodDark} strokeWidth="1.5" />
          <circle cx={W / 2 - 4} cy={6} r={1.6} fill={m.accent} />
          <circle cx={W / 2 + 4} cy={6} r={1.6} fill={m.accent} />
        </g>
      );
    case 'tv':
      return (
        <g>
          {shadow(W, H)}
          <Box x={2} y={14} w={W - 4} top={8} face={8} fill={m.wood} side={m.woodDark} />
          <rect x={6} y={-16} width={W - 12} height={30} rx={2} fill="#0f172a" />
          <rect
            className="home-tv-screen"
            x={8}
            y={-14}
            width={W - 16}
            height={26}
            fill={night ? '#1e3a8a' : '#334155'}
          />
          {tier >= 2 && <rect x={W / 2 - 1} y={12} width={2} height={4} fill="#475569" />}
        </g>
      );
    case 'gaming':
      return (
        <g>
          {shadow(W, H)}
          <Box x={6} y={10} w={W - 12} top={8} face={6} fill="#111827" side="#030712" />
          <circle cx={W / 2} cy={14} r={2} fill={tier >= 2 ? '#22d3ee' : '#4ade80'} />
          <rect x={8} y={24} width={16} height={6} rx={3} fill="#374151" />
        </g>
      );
    case 'sound':
      return (
        <g>
          {shadow(W, H)}
          <Box x={8} y={-6} w={W - 16} top={6} face={30} fill="#1f2937" side="#111827" />
          <circle cx={W / 2} cy={8} r={5} fill="#374151" stroke="#4b5563" />
          <circle cx={W / 2} cy={19} r={3} fill="#374151" />
        </g>
      );
    case 'plants':
      return (
        <g>
          {shadow(W, H)}
          <Box x={9} y={16} w={W - 18} top={4} face={11} fill="#7c4a2d" side="#a0613b" />
          <circle cx={W / 2} cy={8} r={9} fill="#2f855a" />
          <circle cx={W / 2 - 6} cy={13} r={6} fill="#38a169" />
          <circle cx={W / 2 + 6} cy={12} r={6} fill="#276749" />
          {tier >= 3 && <circle cx={W / 2} cy={2} r={4} fill="#48bb78" />}
        </g>
      );
    case 'art':
      return (
        <g>
          <rect x={2} y={-30} width={W - 4} height={22} rx={1} fill={m.accent} />
          <rect x={4} y={-28} width={W - 8} height={18} fill="#fde68a" />
          <path d={`M5 -11 L13 -20 L19 -14 L23 -18 L${W - 5} -11 Z`} fill="#0f766e" />
          <circle cx={W - 9} cy={-23} r={2.5} fill="#f97316" />
        </g>
      );
    case 'cooling':
      return (
        <g>
          <rect x={6} y={-36} width={W - 12} height={14} rx={4} fill="#f8fafc" stroke="#cbd5e1" />
          <line x1={10} y1={-26} x2={W - 10} y2={-26} stroke="#94a3b8" />
        </g>
      );
    case 'lights':
      return (
        <g>
          {night && (
            <circle cx={W / 2} cy={0} r={46} fill="url(#home-glow)" className="home-glow" />
          )}
          {shadow(W, H)}
          <rect x={W / 2 - 1.5} y={-14} width={3} height={40} fill="#57534e" />
          <ellipse cx={W / 2} cy={27} rx={7} ry={3} fill="#44403c" />
          <path
            d={`M${W / 2 - 9} -8 L${W / 2 + 9} -8 L${W / 2 + 6} -20 L${W / 2 - 6} -20 Z`}
            fill={night ? '#fde68a' : '#fef3c7'}
            stroke="#d6b36a"
          />
        </g>
      );
    case 'kitchen':
      return (
        <g>
          {shadow(W, H)}
          <Box x={1} y={-6} w={W - 2} top={H - 2} face={8} fill="#e7e5e4" side={m.wood} />
          <circle cx={W / 2} cy={8} r={6} fill="#1f2937" stroke={m.metal} strokeWidth="2" />
          <circle cx={W / 2} cy={26} r={6} fill="#1f2937" stroke={m.metal} strokeWidth="2" />
          {tier >= 2 && (
            <rect x={4} y={H - 22} width={W - 8} height={10} rx={2} fill={m.metal} opacity="0.5" />
          )}
        </g>
      );
    case 'fridge':
      return (
        <g>
          {shadow(W, H)}
          <Box
            x={2}
            y={-22}
            w={W - 4}
            top={6}
            face={44}
            fill={tier >= 3 ? '#cbd5e1' : '#f8fafc'}
            side={tier >= 3 ? '#94a3b8' : '#e2e8f0'}
          />
          <line x1={3} y1={0} x2={W - 3} y2={0} stroke="#94a3b8" />
          <rect x={W - 9} y={-12} width={2} height={8} fill="#64748b" />
          <rect x={W - 9} y={4} width={2} height={10} fill="#64748b" />
        </g>
      );
    case 'coffee':
      return (
        <g>
          {shadow(W, H)}
          <Box x={1} y={-6} w={W - 2} top={H - 2} face={8} fill="#e7e5e4" side={m.wood} />
          <rect
            x={9}
            y={-6}
            width={14}
            height={18}
            rx={2}
            fill={tier >= 3 ? '#b45309' : '#374151'}
          />
          <rect x={13} y={8} width={6} height={5} rx={1} fill="#fff" />
        </g>
      );
    case 'washer':
      return (
        <g>
          {shadow(W, H)}
          <Box x={2} y={-8} w={W - 4} top={6} face={32} fill="#f8fafc" side="#e2e8f0" />
          <circle cx={W / 2} cy={12} r={8} fill="#bfdbfe" stroke="#94a3b8" strokeWidth="2" />
        </g>
      );
    case 'power':
      return (
        <g>
          {shadow(W, H)}
          <Box x={4} y={2} w={W - 8} top={8} face={18} fill="#a3a3a3" side="#737373" />
          <path d="M14 13 L19 13 L15 20 L20 20 L12 28 L14 21 L10 21 Z" fill="#facc15" />
        </g>
      );
    case 'wifi':
      return (
        <g>
          <Box x={6} y={6} w={W - 12} top={10} face={12} fill={m.wood} side={m.woodDark} />
          <rect x={10} y={4} width={12} height={5} rx={1.5} fill="#111827" />
          <circle cx={13} cy={6.5} r={0.9} fill="#22c55e" />
          <circle cx={16} cy={6.5} r={0.9} fill="#22c55e" />
          <line x1={20} y1={4} x2={22} y2={-4} stroke="#111827" strokeWidth="1.2" />
        </g>
      );
    case 'books':
      return (
        <g>
          {shadow(W, H)}
          <Box x={2} y={-16} w={W - 4} top={4} face={H + 10} fill={m.woodDark} side={m.wood} />
          {Array.from({ length: Math.max(2, h * 2) }, (_, i) => (
            <g key={i}>
              {[0, 1, 2, 3].map((j) => (
                <rect
                  key={j}
                  x={5 + j * 5.5}
                  y={-10 + i * ((H + 6) / Math.max(2, h * 2))}
                  width={4.5}
                  height={10}
                  fill={['#b91c1c', '#1d4ed8', '#047857', '#ca8a04'][(i + j) % 4]}
                />
              ))}
            </g>
          ))}
        </g>
      );
    case 'rug':
      return (
        <g>
          <rect
            x={4}
            y={4}
            width={W - 8}
            height={H - 8}
            rx={tier >= 2 ? 10 : 3}
            fill={tier >= 3 ? '#7c2d12' : tier === 2 ? '#a16207' : '#94a3b8'}
            opacity="0.85"
          />
          <rect
            x={10}
            y={10}
            width={W - 20}
            height={H - 20}
            rx={tier >= 2 ? 7 : 2}
            fill="none"
            stroke={tier >= 2 ? m.accent : '#e2e8f0'}
            strokeWidth="2"
            strokeDasharray={tier === 1 ? '4 3' : undefined}
          />
        </g>
      );
    case 'dining':
      return (
        <g>
          {shadow(W, H)}
          {[
            [W / 2 - 8, -2],
            [W / 2 + 8, -2],
            [W / 2 - 8, H - 10],
            [W / 2 + 8, H - 10],
          ].map(([cx, cy], i) => (
            <rect key={i} x={cx! - 5} y={cy} width={10} height={10} rx={2} fill={m.woodDark} />
          ))}
          <Box x={8} y={8} w={W - 16} top={H - 26} face={7} fill={m.wood} side={m.woodDark} />
          <circle cx={W / 2} cy={H / 2 - 6} r={5} fill="#fff" opacity="0.8" />
        </g>
      );
    default:
      return <rect x={4} y={4} width={W - 8} height={H - 8} rx={4} fill={m.wood} />;
  }
}

/** Fixtures every home has. */
export function FixtureArt({ id, w, h }: { id: string; w: number; h: number }): ReactNode {
  const W = w * TILE;
  const H = h * TILE;
  switch (id) {
    case 'mat':
      return (
        <g>
          <rect x={4} y={8} width={W - 8} height={H - 14} rx={5} fill="#d6d3d1" />
          <rect x={4} y={36} width={W - 8} height={H - 44} rx={4} fill="#a8a29e" />
          <rect x={8} y={12} width={W - 16} height={12} rx={5} fill="#fafaf9" />
        </g>
      );
    case 'kitchenette':
      return (
        <g>
          {shadow(W, H)}
          <Box x={1} y={-6} w={W - 2} top={H - 2} face={8} fill="#d6d3d1" side="#a8a29e" />
          <rect x={6} y={4} width={W - 12} height={14} rx={3} fill="#94a3b8" />
          <circle cx={W / 2} cy={34} r={6} fill="#292524" stroke="#78716c" strokeWidth="2" />
        </g>
      );
    case 'cushions':
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <ellipse
              key={i}
              cx={TILE * i + TILE / 2}
              cy={H / 2 + 2}
              rx={12}
              ry={9}
              fill={['#f59e0b', '#0ea5e9', '#e11d48'][i]}
              opacity="0.85"
            />
          ))}
        </g>
      );
    case 'toilet':
      return (
        <g>
          {shadow(W, H)}
          <rect x={9} y={-2} width={14} height={10} rx={2} fill="#f1f5f9" stroke="#cbd5e1" />
          <ellipse cx={W / 2} cy={18} rx={9} ry={10} fill="#f8fafc" stroke="#cbd5e1" />
          <ellipse cx={W / 2} cy={18} rx={5} ry={6} fill="#bae6fd" />
        </g>
      );
    case 'sink':
      return (
        <g>
          {shadow(W, H)}
          <Box x={4} y={2} w={W - 8} top={16} face={10} fill="#f8fafc" side="#e2e8f0" />
          <ellipse cx={W / 2} cy={11} rx={8} ry={5} fill="#bae6fd" />
          <rect x={W / 2 - 1} y={-14} width={2} height={14} fill="#94a3b8" />
          <rect x={6} y={-30} width={W - 12} height={16} rx={2} fill="#e0f2fe" stroke="#94a3b8" />
        </g>
      );
    case 'shower':
      return (
        <g>
          <rect x={1} y={1} width={W - 2} height={H - 2} rx={2} fill="#dbeafe" stroke="#93c5fd" />
          <circle cx={W / 2} cy={H / 2} r={3} fill="#64748b" />
          <rect x={W / 2 - 1} y={-24} width={2} height={20} fill="#94a3b8" />
          <circle cx={W / 2} cy={-24} r={4} fill="#94a3b8" />
          <path d={`M1 1 L1 ${H - 1}`} stroke="#bfdbfe" strokeWidth="3" />
        </g>
      );
    case 'shared-bath':
      return (
        <g>
          <rect x={3} y={-34} width={W - 6} height={34} rx={2} fill="#7dd3fc" stroke="#0369a1" />
          <circle cx={W - 9} cy={-16} r={1.6} fill="#0c4a6e" />
          <text x={W / 2} y={-22} textAnchor="middle" fontSize="9" fill="#0c4a6e">
            WC
          </text>
        </g>
      );
    case 'bathtub':
      return (
        <g>
          {shadow(W, H)}
          <rect x={2} y={2} width={W - 4} height={H - 4} rx={10} fill="#f8fafc" stroke="#cbd5e1" />
          <rect x={7} y={7} width={W - 14} height={H - 14} rx={7} fill="#bae6fd" />
        </g>
      );
    case 'pool':
      return (
        <g>
          {shadow(W, H)}
          <rect x={3} y={3} width={W - 6} height={H - 6} rx={5} fill="#5b3a22" />
          <rect x={9} y={9} width={W - 18} height={H - 18} rx={2} fill="#166534" />
          <circle cx={W * 0.3} cy={H / 2} r={3} fill="#fff" />
          <circle cx={W * 0.65} cy={H / 2 - 4} r={3} fill="#facc15" />
          <circle cx={W * 0.7} cy={H / 2 + 4} r={3} fill="#dc2626" />
        </g>
      );
    case 'piano':
      return (
        <g>
          {shadow(W, H)}
          <path
            d={`M4 ${H - 10} L4 10 Q4 3 14 3 L${W - 8} ${H * 0.4} L${W - 6} ${H - 10} Z`}
            fill="#111827"
          />
          <rect x={4} y={H - 16} width={W - 10} height={8} fill="#f8fafc" />
        </g>
      );
    default:
      return null;
  }
}
