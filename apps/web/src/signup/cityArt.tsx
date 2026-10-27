/**
 * Sign-up's city art: a small drawn flag for each city (no emoji font
 * needed) and each city's skyline, in the title screen's flat style (a row
 * of towers with lit windows and a sun) with one palette, one sky and one
 * landmark each, so a change of city shows at a glance.
 */
import type { ReactNode } from 'react';

const FLAGS: Record<string, ReactNode> = {
  lagos: (
    <>
      <rect width="10" height="20" fill="#008751" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#008751" />
    </>
  ),
  nairobi: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="30" height="6" fill="#000" />
      <rect y="7" width="30" height="6" fill="#bb0000" />
      <rect y="14" width="30" height="6" fill="#006600" />
      <ellipse cx="15" cy="10" rx="3" ry="6" fill="#bb0000" stroke="#000" strokeWidth=".8" />
    </>
  ),
  london: (
    <>
      <rect width="30" height="20" fill="#012169" />
      <path d="M0 0L30 20M30 0L0 20" stroke="#fff" strokeWidth="4" />
      <path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" strokeWidth="1.4" />
      <path d="M15 0V20M0 10H30" stroke="#fff" strokeWidth="6" />
      <path d="M15 0V20M0 10H30" stroke="#c8102e" strokeWidth="3.4" />
    </>
  ),
  accra: (
    <>
      <rect width="30" height="7" fill="#ce1126" />
      <rect y="6.6" width="30" height="7" fill="#fcd116" />
      <rect y="13.3" width="30" height="7" fill="#006b3f" />
      <path d="M15 6.8l1.2 3.4h3.5l-2.8 2 1 3.4-2.9-2.1-2.9 2.1 1-3.4-2.8-2h3.5z" fill="#000" />
    </>
  ),
  freetown: (
    <>
      <rect width="30" height="7" fill="#1eb53a" />
      <rect y="6.6" width="30" height="7" fill="#fff" />
      <rect y="13.3" width="30" height="7" fill="#0072c6" />
    </>
  ),
  kigali: (
    <>
      <rect width="30" height="10" fill="#00a1de" />
      <rect width="30" height="5" y="10" fill="#fad201" />
      <rect width="30" height="5" y="15" fill="#20603d" />
      <circle cx="25" cy="4.5" r="2.4" fill="#e5be01" />
    </>
  ),
  johannesburg: (
    <>
      <rect width="30" height="10" fill="#e03c31" />
      <rect y="10" width="30" height="10" fill="#001489" />
      <path d="M0 0L13 10L0 20" fill="none" stroke="#fff" strokeWidth="8" />
      <path d="M13 10H30" stroke="#fff" strokeWidth="7" />
      <path d="M0 0L13 10L0 20" fill="none" stroke="#007749" strokeWidth="4.5" />
      <path d="M13 10H30" stroke="#007749" strokeWidth="4" />
      <path d="M0 3.5L8.5 10L0 16.5z" fill="#ffb81c" />
      <path d="M0 5.3L6.2 10L0 14.7z" fill="#000" />
    </>
  ),
  cairo: (
    <>
      <rect width="30" height="7" fill="#ce1126" />
      <rect y="6.6" width="30" height="7" fill="#fff" />
      <rect y="13.3" width="30" height="7" fill="#000" />
      <circle cx="15" cy="10" r="1.8" fill="#c09300" />
    </>
  ),
  dubai: (
    <>
      <rect width="30" height="7" fill="#00732f" />
      <rect y="6.6" width="30" height="7" fill="#fff" />
      <rect y="13.3" width="30" height="7" fill="#000" />
      <rect width="8" height="20" fill="#ff0000" />
    </>
  ),
  'san-francisco': (
    <>
      <rect width="30" height="20" fill="#fff" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} y={i * 3.08} width="30" height="1.54" fill="#b22234" />
      ))}
      <rect width="13" height="10.8" fill="#3c3b6e" />
    </>
  ),
};

/** The flag of a city's country, drawn (decoration: the city's name is always next to it). */
export function Flag({ city, width = 20 }: { city: string; width?: number }) {
  return (
    <svg
      className="su-flag"
      viewBox="0 0 30 20"
      width={width}
      height={Math.round((width * 2) / 3)}
      aria-hidden="true"
      data-flag={city}
    >
      {FLAGS[city] ?? <rect width="30" height="20" fill="#94a3b8" />}
    </svg>
  );
}

/** The title screen's towers: [x, top, width]. */
const TOWERS: readonly [number, number, number][] = [
  [8, 70, 34],
  [46, 46, 40],
  [90, 88, 30],
  [124, 58, 44],
  [172, 30, 36],
  [212, 74, 30],
  [246, 52, 42],
  [292, 84, 34],
  [330, 64, 40],
];

interface Sky {
  /** The sun (or moon). */
  sun: string;
  /** Tower colours, in turn. */
  palette: readonly string[];
  /** Towers left out to make room for the landmark (indexes into TOWERS). */
  skip?: readonly number[];
  /** Behind the towers. */
  back?: ReactNode;
  /** In front of the towers: the landmark. */
  front?: ReactNode;
  /** The stage's sky behind the drawing. */
  sky: string;
  /** What the landmark is (tests and the stage's description). */
  landmark: string;
}

const sky = (a: string, b: string, c: string, d: string) =>
  `radial-gradient(120% 80% at 0% 0%, ${a} 0%, transparent 55%), radial-gradient(100% 90% at 100% 20%, ${b} 0%, transparent 60%), linear-gradient(170deg, ${c} 0%, ${d} 100%)`;

/** A five-pointed star centred on (cx, cy). */
const star = (cx: number, cy: number, r: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.42 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

export const SKYLINES: Record<string, Sky> = {
  lagos: {
    landmark: 'lagoon bridge',
    sun: '#fde68a',
    palette: ['#134e4a', '#0f766e', '#155e75', '#14532d', '#115e59'],
    sky: sky('#fb923c', '#8b5cf6', '#0f766e', '#1e1b4b'),
    front: (
      <>
        <path d="M0 116 Q95 100 190 112 T380 106 V140 H0z" fill="#0b3b38" opacity=".75" />
        <path d="M0 118 H380" stroke="#e2e8f0" strokeWidth="2.5" opacity=".7" />
        {Array.from({ length: 14 }, (_, i) => (
          <rect key={i} x={10 + i * 28} y="118" width="3" height="22" fill="#e2e8f0" opacity=".6" />
        ))}
      </>
    ),
  },
  london: {
    landmark: 'Big Ben and the Eye',
    sun: '#e5e7eb',
    palette: ['#334155', '#1e3a8a', '#475569', '#312e81', '#1e293b'],
    skip: [4, 7],
    sky: sky('#94a3b8', '#6366f1', '#334155', '#1e1b4b'),
    back: (
      <>
        <circle cx="306" cy="78" r="44" fill="none" stroke="#cbd5e1" strokeWidth="3" opacity=".8" />
        {Array.from({ length: 12 }, (_, a) => (
          <path
            key={a}
            d={`M306 78 L${(306 + 44 * Math.cos((a / 6) * Math.PI)).toFixed(1)} ${(78 + 44 * Math.sin((a / 6) * Math.PI)).toFixed(1)}`}
            stroke="#cbd5e1"
            strokeWidth="1.2"
            opacity=".6"
          />
        ))}
      </>
    ),
    front: (
      <>
        <rect x="170" y="34" width="26" height="106" fill="#3f3a2e" />
        <path d="M168 34 L183 4 L198 34z" fill="#3f3a2e" />
        <circle cx="183" cy="50" r="8" fill="#fde68a" />
        <circle cx="183" cy="50" r="8" fill="none" stroke="#3f3a2e" strokeWidth="1.5" />
      </>
    ),
  },
  dubai: {
    landmark: 'the tallest spire',
    sun: '#fdba74',
    palette: ['#7c2d12', '#9a3412', '#78350f', '#713f12', '#451a03'],
    skip: [4],
    sky: sky('#fdba74', '#f472b6', '#c2410c', '#431407'),
    front: (
      <path
        d="M186 140 L186 60 L189 60 L189 30 L191 30 L191 2 L193 30 L195 30 L195 60 L198 60 L198 140z"
        fill="#1f2937"
      />
    ),
  },
  'san-francisco': {
    landmark: 'the Golden Gate',
    sun: '#fde68a',
    palette: ['#1e3a8a', '#334155', '#0f766e', '#312e81', '#1e293b'],
    skip: [2, 3, 5, 6],
    sky: sky('#fdba74', '#60a5fa', '#1e3a8a', '#0f172a'),
    front: (
      <>
        <path d="M60 112 H330" stroke="#c0362c" strokeWidth="5" />
        <rect x="104" y="40" width="9" height="100" fill="#c0362c" />
        <rect x="272" y="40" width="9" height="100" fill="#c0362c" />
        <path
          d="M30 110 Q108 40 108 40 Q190 100 276 40 Q340 100 360 110"
          fill="none"
          stroke="#c0362c"
          strokeWidth="2.5"
        />
      </>
    ),
  },
  cairo: {
    landmark: 'the pyramids',
    sun: '#fcd34d',
    palette: ['#78350f', '#92400e', '#57534e', '#713f12', '#44403c'],
    skip: [3, 4, 5],
    sky: sky('#fcd34d', '#f97316', '#b45309', '#451a03'),
    front: (
      <>
        <path d="M110 140 L170 60 L230 140z" fill="#d6a85c" />
        <path d="M170 60 L230 140 H200z" fill="#b8893f" />
        <path d="M200 140 L236 92 L272 140z" fill="#c99a4c" />
      </>
    ),
  },
  nairobi: {
    landmark: 'the KICC tower',
    sun: '#fde68a',
    palette: ['#14532d', '#166534', '#3f6212', '#134e4a', '#1c3a2a'],
    skip: [3, 4],
    sky: sky('#f59e0b', '#16a34a', '#14532d', '#1c1917'),
    front: (
      <>
        {/* The amphitheatre: a cone roof like a traditional hut's, with its spike. */}
        <path d="M112 140 Q132 104 146 84 Q160 104 182 140z" fill="#b45309" />
        <path d="M146 84 Q160 104 182 140 H160z" fill="#92400e" />
        <rect x="145" y="72" width="2" height="13" fill="#78350f" />
        {/* The tower: a cylinder of floors under a wide flat crown and its helipad. */}
        <rect x="184" y="26" width="34" height="114" rx="4" fill="#9a3412" />
        <rect x="201" y="26" width="17" height="114" rx="4" fill="#7c2d12" />
        {Array.from({ length: 13 }, (_, r) => (
          <rect
            key={r}
            x="187"
            y={34 + r * 8}
            width="28"
            height="2.5"
            fill="#fde68a"
            opacity={r % 3 === 1 ? 0.85 : 0.35}
          />
        ))}
        <rect x="178" y="18" width="46" height="9" rx="3" fill="#7c2d12" />
        <ellipse cx="201" cy="17" rx="20" ry="3" fill="#fde68a" opacity=".9" />
      </>
    ),
  },
  accra: {
    landmark: 'the Black Star Gate',
    sun: '#fcd34d',
    palette: ['#14532d', '#a16207', '#7f1d1d', '#065f46', '#78350f'],
    skip: [2, 3, 4, 5],
    sky: sky('#facc15', '#dc2626', '#166534', '#1f2937'),
    front: (
      <>
        {/* Independence Arch: a wide white gate of four arches, the black star on top. */}
        <rect x="112" y="76" width="156" height="64" fill="#f5f5f4" />
        <rect x="104" y="66" width="172" height="12" fill="#e7e5e4" />
        <rect x="104" y="76" width="172" height="3" fill="#a8a29e" />
        {[124, 160, 196, 232].map((x) => (
          <path key={x} d={`M${x} 140 V100 a12 12 0 0 1 24 0 V140z`} fill="#292524" opacity=".7" />
        ))}
        <rect x="172" y="58" width="36" height="9" fill="#e7e5e4" />
        <polygon points={star(190, 46, 13)} fill="#111" />
      </>
    ),
  },
  freetown: {
    landmark: 'the Cotton Tree by the hills and the bay',
    sun: '#fde68a',
    palette: ['#0f766e', '#1e3a8a', '#155e75', '#334155', '#0e7490'],
    skip: [3, 4, 5],
    sky: sky('#38bdf8', '#22c55e', '#0e7490', '#1e1b4b'),
    back: (
      <>
        <path d="M0 92 Q60 52 130 78 T250 62 T380 74 V140 H0z" fill="#166534" />
        <path d="M0 104 Q80 80 160 96 T380 92 V140 H0z" fill="#14532d" />
      </>
    ),
    front: (
      <>
        {/* The Cotton Tree: a thick trunk and a wide, spreading canopy. */}
        <path d="M176 140 Q182 120 182 92 H196 Q196 120 204 140z" fill="#57534e" />
        <path d="M184 100 L160 80 M194 98 L220 78 M189 96 V70" stroke="#57534e" strokeWidth="4" />
        <ellipse cx="190" cy="66" rx="50" ry="18" fill="#15803d" />
        <ellipse cx="160" cy="74" rx="26" ry="12" fill="#166534" />
        <ellipse cx="222" cy="72" rx="28" ry="13" fill="#166534" />
        <ellipse cx="192" cy="54" rx="30" ry="13" fill="#22c55e" />
        {/* The bay. */}
        <path d="M0 118 Q95 112 190 118 T380 116 V140 H0z" fill="#0369a1" opacity=".9" />
        <path
          d="M20 126 h22 M90 130 h18 M240 127 h24 M320 131 h20"
          stroke="#e0f2fe"
          strokeWidth="2"
          opacity=".7"
        />
      </>
    ),
  },
  kigali: {
    landmark: 'the Kigali Convention Centre dome',
    sun: '#fde68a',
    palette: ['#1e3a8a', '#0f766e', '#334155', '#155e75', '#1e293b'],
    skip: [3, 4, 5],
    sky: sky('#22d3ee', '#facc15', '#0369a1', '#172554'),
    back: <path d="M0 98 Q70 68 140 90 T280 80 T380 88 V140 H0z" fill="#365314" opacity=".8" />,
    front: (
      <>
        {/* The dome: a striped spiral of light over a round base. */}
        <rect x="144" y="94" width="92" height="46" fill="#1e293b" />
        <rect x="144" y="104" width="92" height="5" fill="#fde68a" opacity=".7" />
        <path d="M138 96 Q190 10 242 96z" fill="#0284c7" />
        <path d="M150 94 Q190 28 230 94" fill="none" stroke="#facc15" strokeWidth="4" />
        <path d="M162 94 Q190 46 218 94" fill="none" stroke="#22c55e" strokeWidth="4" />
        <path d="M174 94 Q190 64 206 94" fill="none" stroke="#facc15" strokeWidth="4" />
        <rect x="136" y="94" width="108" height="4" rx="2" fill="#0c4a6e" />
      </>
    ),
  },
  johannesburg: {
    landmark: 'Ponte City and the Hillbrow Tower',
    sun: '#fdba74',
    palette: ['#1e3a8a', '#3f3f46', '#7c2d12', '#312e81', '#1e293b'],
    skip: [3, 6],
    sky: sky('#fb923c', '#a855f7', '#7c2d12', '#1e1b4b'),
    front: (
      <>
        {/* Ponte City: the round tower with its sign around the top. */}
        <rect x="122" y="34" width="48" height="106" rx="6" fill="#57534e" />
        <rect x="146" y="34" width="24" height="106" rx="6" fill="#44403c" />
        {Array.from({ length: 11 }, (_, r) => (
          <rect
            key={r}
            x="126"
            y={52 + r * 8}
            width="40"
            height="2.5"
            fill="#fde68a"
            opacity={r % 4 === 2 ? 0.9 : 0.3}
          />
        ))}
        <rect x="122" y="34" width="48" height="12" rx="3" fill="#dc2626" />
        <rect x="130" y="38" width="32" height="3" rx="1.5" fill="#fff" opacity=".9" />
        {/* The Hillbrow Tower: a slim shaft, its pods and the mast. */}
        <path d="M259 140 L261 44 L267 44 L269 140z" fill="#374151" />
        <rect x="252" y="38" width="24" height="12" rx="4" fill="#4b5563" />
        <rect x="255" y="28" width="18" height="8" rx="3" fill="#4b5563" />
        <rect x="252" y="42" width="24" height="3" fill="#fde68a" opacity=".8" />
        <path d="M264 28 V4" stroke="#374151" strokeWidth="2" />
        <circle cx="264" cy="4" r="2" fill="#ef4444" />
      </>
    ),
  },
};

/** A city's skyline (decoration). Unknown cities get Lagos's. */
export function CitySkyline({ city, className }: { city: string; className?: string }) {
  const s = SKYLINES[city] ?? SKYLINES.lagos!;
  const skip = new Set(s.skip ?? []);
  return (
    <svg
      className={className ?? 'su-sky'}
      viewBox="0 0 380 140"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      data-skyline={SKYLINES[city] ? city : 'lagos'}
    >
      <circle cx="300" cy="30" r="15" fill={s.sun} opacity="0.9" />
      {s.back}
      {TOWERS.map(([x, top, w], n) =>
        skip.has(n) ? null : (
          <g key={x}>
            <rect
              x={x}
              y={top}
              width={w}
              height={140 - top}
              rx="3"
              fill={s.palette[n % s.palette.length]}
            />
            {Array.from({ length: Math.floor((132 - top) / 14) }, (_, r) =>
              Array.from({ length: Math.floor((w - 6) / 10) }, (_, c) => (
                <rect
                  key={`${r}-${c}`}
                  x={x + 5 + c * 10}
                  y={top + 8 + r * 14}
                  width="5"
                  height="6"
                  rx="1"
                  fill="#fde68a"
                  opacity={(x + r * 7 + c * 13) % 5 === 0 ? 0.95 : 0.22}
                />
              )),
            )}
          </g>
        ),
      )}
      {s.front}
    </svg>
  );
}

/** The sky behind a city's skyline (a CSS background). */
export const citySky = (city: string) => (SKYLINES[city] ?? SKYLINES.lagos!).sky;
