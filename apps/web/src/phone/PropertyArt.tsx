/**
 * Wave 10 §C: a listing's "photo" in 2D (the Lite fallback, and the
 * thumbnails in the Homes app): the building by tier, in the light of the
 * neighbourhood's own palette (stable per neighbourhood).
 */
import { hash } from '../city/contract';

const SKIES: [string, string][] = [
  ['#7dd3fc', '#e0f2fe'],
  ['#fda4af', '#ffedd5'],
  ['#a5b4fc', '#e0e7ff'],
  ['#5eead4', '#ecfeff'],
];
const WALLS = ['#f5f0e6', '#fde7c7', '#e2e8f0', '#fef3c7', '#f1e4d3'];
const ROOFS = ['#9a3412', '#475569', '#7c2d12', '#334155', '#a16207'];

export function PropertyArt({
  tier,
  seed,
  className,
}: {
  tier: string;
  seed: string;
  className?: string;
}) {
  const h = hash(seed);
  const [skyA, skyB] = SKIES[h % SKIES.length]!;
  const wall = WALLS[(h >>> 3) % WALLS.length]!;
  const roof = ROOFS[(h >>> 5) % ROOFS.length]!;
  const id = `pa-${h.toString(36)}-${tier}`;
  const win = (x: number, y: number, w = 8, hh = 9, lit = false) => (
    <rect
      key={`${x},${y}`}
      x={x}
      y={y}
      width={w}
      height={hh}
      rx="1"
      fill={lit ? '#fde68a' : '#93c5fd'}
      stroke="#64748b"
      strokeWidth="0.6"
    />
  );
  let body: React.ReactNode;
  switch (tier) {
    case 'studio':
    case 'apartment': {
      const floors = tier === 'studio' ? 5 : 6;
      const mine = (h >>> 7) % floors;
      body = (
        <g>
          <rect
            x="44"
            y={90 - floors * 13}
            width="72"
            height={floors * 13}
            fill={wall}
            stroke="#94a3b8"
          />
          {Array.from({ length: floors }, (_, f) =>
            [0, 1, 2, 3].map((c) =>
              win(50 + c * 16, 94 - (f + 1) * 13 + 2, 9, 8, f === mine && c === 1),
            ),
          )}
          <rect x="74" y="80" width="12" height="10" fill="#78350f" />
          <rect
            x="120"
            y={90 - (floors - 2) * 13}
            width="30"
            height={(floors - 2) * 13}
            fill="#cbd5e1"
          />
          <rect
            x="12"
            y={90 - (floors - 1) * 13}
            width="28"
            height={(floors - 1) * 13}
            fill="#e2e8f0"
          />
        </g>
      );
      break;
    }
    case 'townhouse':
      body = (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${22 + i * 40} 0)`}>
              <rect
                x="0"
                y="44"
                width="38"
                height="46"
                fill={i === 1 ? wall : '#e7e5e4'}
                stroke="#94a3b8"
              />
              <path d="M-2 46 L19 28 L40 46 Z" fill={roof} />
              {win(5, 52)}
              {win(24, 52, 8, 9, i === 1)}
              {win(5, 70)}
              <rect x="23" y="72" width="10" height="18" fill={i === 1 ? '#1d4ed8' : '#78350f'} />
            </g>
          ))}
        </g>
      );
      break;
    case 'villa':
      body = (
        <g>
          <rect x="30" y="50" width="100" height="40" fill={wall} stroke="#94a3b8" />
          <path d="M24 52 L80 30 L136 52 Z" fill={roof} />
          {win(40, 60, 12, 10)}
          {win(62, 60, 12, 10, true)}
          {win(106, 60, 12, 10)}
          <rect x="84" y="70" width="14" height="20" fill="#78350f" />
          <rect
            x="4"
            y="92"
            width="62"
            height="10"
            rx="2"
            fill="#38bdf8"
            stroke="#e0f2fe"
            strokeWidth="2"
          />
          <circle cx="146" cy="70" r="12" fill="#16a34a" />
          <rect x="144" y="76" width="4" height="16" fill="#78350f" />
        </g>
      );
      break;
    case 'mansion':
      body = (
        <g>
          <rect x="18" y="46" width="124" height="44" fill={wall} stroke="#94a3b8" />
          <rect x="58" y="34" width="44" height="56" fill={wall} stroke="#94a3b8" />
          <path d="M54 36 L80 20 L106 36 Z" fill={roof} />
          <path d="M14 48 L18 40 L58 40 L58 48 Z M102 48 L102 40 L142 40 L146 48 Z" fill={roof} />
          {[62, 72, 82, 92].map((x) => (
            <rect
              key={x}
              x={x}
              y="58"
              width="4"
              height="32"
              fill="#f8fafc"
              stroke="#cbd5e1"
              strokeWidth="0.5"
            />
          ))}
          {win(24, 56)}
          {win(38, 56, 8, 9, true)}
          {win(114, 56)}
          {win(128, 56, 8, 9, true)}
          {win(24, 74)}
          {win(128, 74)}
          <rect x="74" y="74" width="12" height="16" fill="#78350f" />
          <rect x="0" y="94" width="160" height="10" fill="#4d7c0f" />
          <rect
            x="96"
            y="95"
            width="56"
            height="7"
            rx="2"
            fill="#38bdf8"
            stroke="#e0f2fe"
            strokeWidth="1.5"
          />
          <ellipse cx="40" cy="98" rx="10" ry="3" fill="#e5e7eb" />
          <circle cx="8" cy="80" r="9" fill="#15803d" />
          <circle cx="152" cy="80" r="9" fill="#15803d" />
        </g>
      );
      break;
    default:
      // Penthouse: the top of a tower, terrace lit.
      body = (
        <g>
          <rect x="54" y="20" width="52" height="84" fill="#cbd5e1" stroke="#94a3b8" />
          {Array.from({ length: 7 }, (_, f) =>
            [0, 1, 2].map((c) => win(59 + c * 15, 34 + f * 10, 10, 6, false)),
          )}
          <rect x="50" y="14" width="60" height="16" fill="#0f172a" />
          <rect x="52" y="16" width="56" height="12" fill="#fde68a" opacity="0.9" />
          <rect x="48" y="28" width="64" height="2" fill="#e2e8f0" />
          <rect x="14" y="56" width="34" height="48" fill="#94a3b8" />
          <rect x="112" y="46" width="36" height="58" fill="#a1a1aa" />
        </g>
      );
  }
  return (
    <svg
      className={className ?? 'prop-art'}
      viewBox="0 0 160 104"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      data-prop-art={tier}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={skyA} />
          <stop offset="1" stopColor={skyB} />
        </linearGradient>
      </defs>
      <rect width="160" height="104" fill={`url(#${id})`} />
      <rect y="90" width="160" height="14" fill="#86a86b" />
      {body}
    </svg>
  );
}
