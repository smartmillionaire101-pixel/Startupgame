/**
 * Nightlife rooms in 2D (Lite mode, and the invisible layer under the 3D
 * room): each floor plan in ./nightlife.ts drawn front-on in the same
 * 360 × 240 box as ./RoomArt.tsx, in its style's palette and light. Two
 * layers: the back (sky or walls, the bar, the stage, the floor: behind the
 * people) and the front (sofas, tables, cushions: hiding seated legs).
 */
import type { CSSProperties, ReactNode } from 'react';
import { shade } from './art';
import { GENRES, isOpenAir, type Backdrop, type NightStyle } from './nightlife';

const FLOOR_Y = 140;

function Room({ s }: { s: NightStyle }) {
  return (
    <>
      <rect y="-220" width="360" height={FLOOR_Y + 220} fill={s.wall} />
      <rect y={FLOOR_Y - 8} width="360" height="8" fill={shade(s.wall, -0.3)} />
      <polygon points={`0,${FLOOR_Y} 360,${FLOOR_Y} 360,240 0,240`} fill={s.floor} />
      {[160, 186, 216].map((y) => (
        <line
          key={y}
          x1="0"
          y1={y}
          x2="360"
          y2={y}
          stroke={shade(s.floor, 0.08)}
          strokeWidth="0.7"
        />
      ))}
    </>
  );
}

function Sky({ s, night }: { s: NightStyle; night: boolean }) {
  const top = night ? shade(s.wall, -0.2) : '#7dd3fc';
  const low = night ? shade(s.wall, 0.15) : s.light === 'sunset' ? '#fdba74' : '#bae6fd';
  const id = `nl-sky-${s.id}`;
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={low} />
        </linearGradient>
      </defs>
      <rect y="-220" width="360" height="360" fill={`url(#${id})`} />
      {night &&
        [20, 64, 120, 210, 268, 330].map((x, k) => (
          <circle key={x} cx={x} cy={-60 + ((k * 37) % 50)} r="1" fill="#fff" opacity="0.7" />
        ))}
      <circle
        cx={night ? 300 : 60}
        cy={-40}
        r={night ? 9 : 14}
        fill={night ? '#f8fafc' : '#fde047'}
        opacity="0.9"
      />
    </>
  );
}

/** What's beyond the railing. */
function Beyond({ b, night, s }: { b: Backdrop | undefined; night: boolean; s: NightStyle }) {
  const bld = night ? '#1e293b' : '#64748b';
  const win = night ? '#fde68a' : '#cbd5e1';
  const water = night ? '#0c4a6e' : '#0ea5e9';
  const towers = (n: number, hmax: number, seed: number) =>
    Array.from({ length: n }, (_, k) => {
      const w = 18 + ((k * 7 + seed) % 14);
      const x = (k * 360) / n + ((k * 13) % 9);
      const h = 30 + ((k * 37 + seed) % hmax);
      return (
        <g key={k}>
          <rect x={x} y={120 - h} width={w} height={h} fill={bld} />
          {Array.from({ length: Math.floor(h / 12) }, (_, r) => (
            <rect
              key={r}
              x={x + 4}
              y={124 - h + r * 12}
              width={w - 8}
              height="3"
              fill={win}
              opacity="0.55"
            />
          ))}
        </g>
      );
    });
  switch (b) {
    case 'sea':
    case 'lagoon':
      return (
        <g>
          {b === 'lagoon' && towers(10, 40, 3)}
          <rect y={b === 'lagoon' ? 112 : 92} width="360" height="40" fill={water} />
          {[0, 1, 2, 3].map((k) => (
            <path
              key={k}
              d={`M ${k * 96} 112 q 12 -5 24 0 t 24 0`}
              stroke="#e0f2fe"
              strokeWidth="1.5"
              fill="none"
              opacity="0.6"
            />
          ))}
        </g>
      );
    case 'river':
      return (
        <g>
          {towers(12, 46, 5)}
          {[60, 190].map((x) => (
            <g key={x}>
              <rect x={x} y={52} width="6" height="68" fill={bld} />
              <circle cx={x + 3} cy={50} r="5" fill={bld} />
              <rect x={x + 2} y={38} width="2" height="10" fill={bld} />
            </g>
          ))}
          <rect y="114" width="360" height="22" fill={water} />
          {[30, 100, 170, 240, 310].map((x) => (
            <rect key={x} x={x} y={118} width="16" height="2" fill={s.glow[0]} opacity="0.6" />
          ))}
        </g>
      );
    case 'hills':
      return (
        <g>
          <path
            d="M 0 96 Q 60 52 130 88 T 250 76 T 360 90 L 360 136 L 0 136 Z"
            fill={night ? '#14532d' : '#4d7c0f'}
          />
          <path
            d="M 0 112 Q 90 84 180 108 T 360 104 L 360 136 L 0 136 Z"
            fill={night ? '#166534' : '#65a30d'}
          />
          {[40, 90, 150, 210, 270, 320].map((x, k) => (
            <circle key={x} cx={x} cy={104 + (k % 3) * 6} r="1.6" fill={win} opacity="0.9" />
          ))}
        </g>
      );
    case 'spire':
      return (
        <g>
          {towers(11, 58, 9)}
          <polygon
            points="196,120 204,120 202,-20 199,-60 198,-20"
            fill={night ? '#334155' : '#94a3b8'}
          />
          <rect x="197" y="-10" width="6" height="130" fill={win} opacity="0.25" />
        </g>
      );
    case 'bridge':
      return (
        <g>
          <rect y="104" width="360" height="32" fill={water} />
          {[90, 270].map((x) => (
            <g key={x}>
              <rect x={x - 4} y={30} width="8" height="90" fill="#c2410c" />
              <rect x={x - 8} y={44} width="16" height="3" fill="#c2410c" />
            </g>
          ))}
          <path
            d="M 0 60 Q 90 30 90 30 Q 180 100 270 30 Q 360 60 360 60"
            stroke="#c2410c"
            strokeWidth="2"
            fill="none"
          />
          <rect y="98" width="360" height="4" fill="#9a3412" />
        </g>
      );
    case 'wheel':
      return (
        <g>
          {towers(10, 36, 2)}
          <circle
            cx="250"
            cy="70"
            r="44"
            stroke={night ? '#93c5fd' : '#e2e8f0'}
            strokeWidth="2.5"
            fill="none"
          />
          {[0, 30, 60, 90, 120, 150].map((r) => (
            <line
              key={r}
              x1="250"
              y1="70"
              x2={250 + 44 * Math.cos((r * Math.PI) / 180)}
              y2={70 + 44 * Math.sin((r * Math.PI) / 180)}
              stroke="#e2e8f0"
              strokeWidth="0.8"
            />
          ))}
          <rect y="112" width="360" height="24" fill={water} />
        </g>
      );
    case 'wall':
      return (
        <g>
          <rect y="40" width="360" height="100" fill={shade(s.wall, 0.1)} />
          <rect y="40" width="360" height="6" fill={shade(s.wall, -0.2)} />
          {[30, 140, 250].map((x, k) => (
            <rect
              key={x}
              x={x}
              y={62}
              width="80"
              height="40"
              rx="4"
              fill={s.glow[k % 3]}
              opacity="0.35"
            />
          ))}
        </g>
      );
    default:
      return <g>{towers(12, 54, 1)}</g>;
  }
}

function FairyLights({ c, y = -6 }: { c: [string, string, string]; y?: number }) {
  const pts = Array.from({ length: 19 }, (_, k) => k * 20);
  return (
    <g>
      <path
        d={`M 0 ${y} Q 90 ${y + 26} 180 ${y} T 360 ${y}`}
        stroke="#44403c"
        strokeWidth="0.8"
        fill="none"
      />
      {pts.map((x, k) => {
        const u = (x % 180) / 180;
        const yy = y + 26 * 2 * u * (1 - u);
        return (
          <circle
            key={x}
            cx={x}
            cy={yy + 2}
            r="2.2"
            fill={c[k % 3]}
            className={`room-light room-light-${k % 3}`}
          />
        );
      })}
    </g>
  );
}

function Neon({
  text,
  x,
  y,
  c,
  size = 18,
}: {
  text: string;
  x: number;
  y: number;
  c: string;
  size?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={size}
      fontWeight="900"
      fill={c}
      stroke={shade(c, 0.4)}
      strokeWidth="0.6"
      letterSpacing="0.08em"
      className="room-neon nl-neon"
      style={{ filter: `drop-shadow(0 0 4px ${c})` }}
    >
      {text}
    </text>
  );
}

function Beams({ c }: { c: [string, string, string] }) {
  return (
    <g className="room-beams">
      <polygon points="60,-40 80,-40 150,140 100,140" fill={c[0]} opacity="0.16" />
      <polygon points="280,-40 300,-40 260,140 210,140" fill={c[1]} opacity="0.16" />
      <polygon points="172,-40 188,-40 230,140 140,140" fill={c[2]} opacity="0.1" />
    </g>
  );
}

function Counter({
  x,
  w,
  c,
  y = FLOOR_Y,
  h = 30,
}: {
  x: number;
  w: number;
  c: string;
  y?: number;
  h?: number;
}) {
  return (
    <g>
      <rect x={x} y={y - h} width={w} height={h} fill={c} />
      <rect x={x - 3} y={y - h - 5} width={w + 6} height="6" rx="1.5" fill={shade(c, -0.35)} />
      <rect x={x + 4} y={y - h + 8} width={w - 8} height="2" fill={shade(c, 0.25)} />
    </g>
  );
}

function Bottles({ x, y, w, glow }: { x: number; y: number; w: number; glow?: string }) {
  const c = ['#16a34a', '#b45309', '#e11d48', '#eab308', '#a855f7', '#e5e7eb'];
  return (
    <g>
      {glow && <rect x={x - 4} y={y - 4} width={w + 8} height="50" fill={glow} opacity="0.3" />}
      {[0, 1].map((r) => (
        <g key={r}>
          <rect x={x} y={y + r * 22 + 16} width={w} height="3" fill="#78350f" />
          {Array.from({ length: Math.floor(w / 9) }, (_, k) => (
            <rect
              key={k}
              x={x + 2 + k * 9}
              y={y + r * 22 + 4 + (k % 3)}
              width="5"
              height={12 - (k % 3)}
              rx="1"
              fill={c[(k + r) % c.length]}
            />
          ))}
        </g>
      ))}
    </g>
  );
}

function Speaker({ x, y, h = 40 }: { x: number; y: number; h?: number }) {
  return (
    <g>
      <rect x={x - 10} y={y - h} width="20" height={h} rx="2" fill="#111827" />
      <circle cx={x} cy={y - h * 0.3} r="6" fill="#374151" />
      <circle cx={x} cy={y - h * 0.75} r="3.5" fill="#374151" />
    </g>
  );
}

function Palm({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M 0 0 q 6 -50 -2 -96" stroke="#78350f" strokeWidth="6" fill="none" />
      {[-60, -20, 20, 60].map((r) => (
        <ellipse
          key={r}
          cx="-2"
          cy="-96"
          rx="26"
          ry="6"
          fill="#16a34a"
          transform={`rotate(${r} -2 -96)`}
        />
      ))}
    </g>
  );
}

function Lantern({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g>
      <line x1={x} y1={y - 30} x2={x} y2={y} stroke="#44403c" strokeWidth="0.8" />
      <path
        d={`M ${x - 5} ${y} L ${x + 5} ${y} L ${x + 7} ${y + 10} L ${x} ${y + 16} L ${x - 7} ${y + 10} Z`}
        fill="#a16207"
      />
      <circle cx={x} cy={y + 8} r="3.5" fill={c} className="room-glow" />
    </g>
  );
}

function Hookah({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g>
      <ellipse cx={x} cy={y - 5} rx="6" ry="6" fill={c} opacity="0.8" />
      <rect x={x - 1.2} y={y - 24} width="2.4" height="18" fill="#a8a29e" />
      <rect x={x - 4} y={y - 27} width="8" height="4" rx="1" fill="#78350f" />
      <circle cx={x} cy={y - 29} r="2" fill="#f97316" className="room-glow" />
      <path
        d={`M ${x + 2} ${y - 14} q 14 4 18 -6`}
        stroke="#57534e"
        strokeWidth="1.2"
        fill="none"
      />
      <path
        d={`M ${x} ${y - 34} q -5 -8 0 -16 q 5 -8 0 -14`}
        stroke="#e5e7eb"
        strokeWidth="2"
        fill="none"
        opacity="0.4"
        className="room-steam"
      />
    </g>
  );
}

function Sofa({ x, y, w, c }: { x: number; y: number; w: number; c: string }) {
  return (
    <g>
      <rect x={x - w / 2} y={y - 30} width={w} height="18" rx="6" fill={shade(c, -0.15)} />
      <rect x={x - w / 2} y={y - 16} width={w} height="16" rx="4" fill={c} />
      <rect x={x - w / 2 - 5} y={y - 24} width="9" height="24" rx="4" fill={shade(c, -0.3)} />
      <rect x={x + w / 2 - 4} y={y - 24} width="9" height="24" rx="4" fill={shade(c, -0.3)} />
    </g>
  );
}

function Stool({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g>
      <rect x={x - 10} y={y - 10} width="20" height="5" rx="2" fill={c} />
      <rect x={x - 2} y={y - 6} width="4" height="20" fill="#27272a" />
    </g>
  );
}

function SmallTable({
  x,
  y,
  w,
  c,
  cloth,
}: {
  x: number;
  y: number;
  w: number;
  c: string;
  cloth?: string;
}) {
  return (
    <g>
      {cloth ? (
        <path
          d={`M ${x - w / 2} ${y - 20} L ${x + w / 2} ${y - 20} L ${x + w / 2 + 4} ${y + 6} L ${x - w / 2 - 4} ${y + 6} Z`}
          fill={cloth}
        />
      ) : (
        <>
          <rect x={x - w / 2} y={y - 22} width={w} height="5" rx="2" fill={c} />
          <rect x={x - 2} y={y - 17} width="4" height="22" fill={shade(c, -0.3)} />
        </>
      )}
      <rect x={x - 8} y={y - 30} width="5" height="8" rx="1" fill="#fbbf24" opacity="0.85" />
      <rect x={x + 3} y={y - 29} width="5" height="7" rx="1" fill="#e5e7eb" opacity="0.85" />
    </g>
  );
}

function Plastic({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g>
      <rect x={x - 24} y={y - 24} width="48" height="5" rx="1.5" fill={c} />
      <rect x={x - 20} y={y - 19} width="3" height="24" fill={shade(c, -0.2)} />
      <rect x={x + 17} y={y - 19} width="3" height="24" fill={shade(c, -0.2)} />
      <rect x={x - 6} y={y - 34} width="5" height="10" rx="1" fill="#a16207" />
      <rect x={x + 3} y={y - 33} width="5" height="9" rx="1" fill="#15803d" />
    </g>
  );
}

function Crates({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {[0, 1, 2].map((k) => (
        <rect
          key={k}
          x={x + (k === 2 ? 8 : 0)}
          y={y - 14 * (k + 1)}
          width="30"
          height="13"
          fill={['#dc2626', '#facc15', '#16a34a'][k]}
          stroke="#00000033"
        />
      ))}
    </g>
  );
}

function Dartboard({ x, y }: { x: number; y: number }) {
  return (
    <g data-prop="darts">
      <rect x={x - 20} y={y - 20} width="40" height="40" fill="#1c1917" />
      <circle cx={x} cy={y} r="15" fill="#111" />
      <circle cx={x} cy={y} r="12" fill="#dc2626" />
      <circle cx={x} cy={y} r="9" fill="#f5f5dc" />
      <circle cx={x} cy={y} r="6" fill="#16a34a" />
      <circle cx={x} cy={y} r="2" fill="#dc2626" />
      <rect
        x={x + 26}
        y={y - 18}
        width="26"
        height="34"
        fill="#1f2937"
        stroke="#78350f"
        strokeWidth="2"
      />
      {[0, 1, 2].map((k) => (
        <rect
          key={k}
          x={x + 30}
          y={y - 12 + k * 9}
          width={14 - k * 3}
          height="2"
          fill="#f8fafc"
          opacity="0.8"
        />
      ))}
    </g>
  );
}

function Braai({ x, y }: { x: number; y: number }) {
  return (
    <g data-prop="braai">
      <path d={`M ${x - 26} ${y - 16} a 26 12 0 0 0 52 0 Z`} fill="#27272a" />
      <rect x={x - 26} y={y - 18} width="52" height="3" fill="#71717a" />
      {[-16, -6, 4, 14].map((d) => (
        <rect key={d} x={x + d} y={y - 24} width="8" height="5" rx="2" fill="#7c2d12" />
      ))}
      <ellipse
        cx={x}
        cy={y - 16}
        rx="20"
        ry="3"
        fill="#f97316"
        className="room-glow"
        opacity="0.8"
      />
      <path
        d={`M ${x - 6} ${y - 28} q -6 -10 0 -20 q 6 -10 0 -18`}
        stroke="#d4d4d8"
        strokeWidth="3"
        fill="none"
        opacity="0.35"
        className="room-steam"
      />
      <rect x={x - 20} y={y - 6} width="3" height="20" fill="#3f3f46" />
      <rect x={x + 17} y={y - 6} width="3" height="20" fill="#3f3f46" />
    </g>
  );
}

function Bonfire({ x, y }: { x: number; y: number }) {
  return (
    <g data-prop="bonfire">
      <ellipse cx={x} cy={y} rx="30" ry="7" fill="#f97316" opacity="0.25" />
      <rect
        x={x - 18}
        y={y - 5}
        width="36"
        height="5"
        rx="2"
        fill="#78350f"
        transform={`rotate(12 ${x} ${y})`}
      />
      <rect
        x={x - 18}
        y={y - 5}
        width="36"
        height="5"
        rx="2"
        fill="#92400e"
        transform={`rotate(-12 ${x} ${y})`}
      />
      <path
        d={`M ${x - 10} ${y - 4} Q ${x - 8} ${y - 26} ${x} ${y - 36} Q ${x + 8} ${y - 24} ${x + 10} ${y - 4} Z`}
        fill="#f97316"
        className="room-light"
      />
      <path
        d={`M ${x - 5} ${y - 4} Q ${x - 3} ${y - 18} ${x} ${y - 24} Q ${x + 4} ${y - 16} ${x + 5} ${y - 4} Z`}
        fill="#fde047"
      />
    </g>
  );
}

function Band({ s }: { s: NightStyle }) {
  return (
    <g>
      <rect x="66" y="116" width="228" height="28" fill={shade(s.accent, -0.45)} />
      <rect x="66" y="116" width="228" height="4" fill={shade(s.accent, -0.1)} />
      {s.props.includes('drums') && (
        <g>
          <ellipse cx="254" cy="110" rx="14" ry="9" fill="#dc2626" />
          <ellipse cx="236" cy="102" rx="7" ry="3" fill="#fde047" />
          <ellipse cx="272" cy="100" rx="7" ry="3" fill="#fde047" />
        </g>
      )}
      {s.props.includes('piano') && (
        <g>
          <rect x="226" y="88" width="56" height="28" fill="#111827" />
          <rect x="226" y="108" width="56" height="5" fill="#f8fafc" />
        </g>
      )}
      {s.props.includes('oud') && <ellipse cx="128" cy="116" rx="9" ry="7" fill="#a16207" />}
      <line x1="180" y1="118" x2="180" y2="94" stroke="#a1a1aa" strokeWidth="1.5" />
      <circle cx="180" cy="92" r="2.5" fill="#71717a" />
      <Speaker x={58} y={144} h={44} />
      <Speaker x={302} y={144} h={44} />
    </g>
  );
}

/** Behind the people. */
export function NightBack({ s, sign, night }: { s: NightStyle; sign?: string; night: boolean }) {
  const p = (x: string) => s.props.includes(x as never);
  const word = s.neon ?? sign?.split(' ')[0];
  const style = {
    '--nl-beat': `${(60 / GENRES[s.genre].groove.bpm).toFixed(3)}s`,
  } as CSSProperties;
  const outdoor = isOpenAir(s);
  let body: ReactNode;
  switch (s.layout) {
    case 'dancefloor':
      body = (
        <>
          <Room s={s} />
          {p('arches') &&
            [40, 150, 260].map((x) => (
              <path
                key={x}
                d={`M ${x} 132 v -70 a 30 30 0 0 1 60 0 v 70`}
                fill={shade(s.wall, -0.25)}
              />
            ))}
          {p('graffiti') && <Graffiti s={s} />}
          <Beams c={s.glow} />
          {word && <Neon text={word} x={180} y={-30} c={s.glow[0]} size={22} />}
          {p('mirrorball') && (
            <g>
              <line x1="180" y1="-80" x2="180" y2="-4" stroke="#94a3b8" />
              <circle cx="180" cy="6" r="11" fill="#e5e7eb" className="room-ball" />
            </g>
          )}
          <Speaker x={112} y={142} h={50} />
          <Speaker x={248} y={142} h={50} />
          <rect x="134" y="116" width="92" height="26" fill="#111827" />
          <rect x="134" y="116" width="92" height="3" fill={s.glow[1]} className="room-light" />
          <Counter x={286} w={74} c={shade(s.accent, -0.2)} />
          <Bottles x={290} y={60} w={66} glow={s.glow[1]} />
          {p('vip') && (
            <g data-prop="vip">
              <rect x="0" y="150" width="112" height="90" fill={shade(s.floor, 0.06)} />
              <rect x="0" y="146" width="112" height="5" fill={p('gold') ? '#ca8a04' : s.glow[0]} />
              <text
                x="56"
                y="166"
                textAnchor="middle"
                fontSize="8"
                fontWeight="800"
                fill={p('gold') ? '#fbbf24' : s.glow[0]}
              >
                VIP
              </text>
            </g>
          )}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
            <rect
              key={k}
              x={118 + (k % 4) * 34}
              y={170 + Math.floor(k / 4) * 32}
              width="32"
              height="30"
              fill={s.glow[k % 3]}
              opacity="0.18"
              className={`room-light room-light-${k % 3}`}
            />
          ))}
        </>
      );
      break;
    case 'warehouse':
      body = (
        <>
          <Room s={s} />
          {p('arches')
            ? [10, 130, 250].map((x) => (
                <g key={x}>
                  <path
                    d={`M ${x} 132 v -80 a 50 50 0 0 1 100 0 v 80`}
                    fill={shade(s.wall, -0.35)}
                  />
                  <path
                    d={`M ${x} 132 v -80 a 50 50 0 0 1 100 0 v 80`}
                    fill="none"
                    stroke={shade(s.wall, 0.15)}
                    strokeWidth="3"
                  />
                </g>
              ))
            : [30, 100, 170, 240, 310].map((x) => (
                <rect key={x} x={x} y={-80} width="6" height="212" fill={shade(s.wall, -0.2)} />
              ))}
          {p('graffiti') && <Graffiti s={s} />}
          <Beams c={s.glow} />
          {word && <Neon text={word} x={180} y={30} c={s.glow[0]} size={20} />}
          <rect x="84" y="112" width="192" height="30" fill="#18181b" />
          <rect x="84" y="112" width="192" height="3" fill={s.glow[0]} className="room-light" />
          <Speaker x={70} y={142} h={70} />
          <Speaker x={290} y={142} h={70} />
          <Counter x={0} w={70} c="#3f3f46" />
          <g className="nl-strobe">
            <rect x="0" y="-80" width="360" height="320" fill="#fff" opacity="0" />
          </g>
        </>
      );
      break;
    case 'pub':
      body = (
        <>
          <Room s={s} />
          <rect y="70" width="360" height="62" fill={shade(s.wall, -0.2)} />
          {[20, 70, 120, 170, 220, 270, 320].map((x) => (
            <rect
              key={x}
              x={x}
              y={78}
              width="40"
              height="46"
              rx="2"
              fill="none"
              stroke={shade(s.wall, 0.1)}
              strokeWidth="1.5"
            />
          ))}
          {p('fermenters') &&
            [214, 254].map((x) => (
              <g key={x}>
                <rect x={x} y={0} width="32" height="110" rx="10" fill="#d4d4d8" />
                <polygon points={`${x},110 ${x + 32},110 ${x + 16},128`} fill="#a1a1aa" />
                <rect x={x + 6} y={14} width="4" height="80" fill="#f8fafc" opacity="0.6" />
              </g>
            ))}
          <Bottles x={30} y={20} w={170} />
          <Counter x={20} w={190} c={shade(s.accent, -0.1)} h={34} />
          {p('taps') &&
            [50, 80, 110, 140].map((x, k) => (
              <g key={x}>
                <rect x={x} y={90} width="5" height="16" fill="#ca8a04" />
                <rect
                  x={x - 3}
                  y={88}
                  width="11"
                  height="4"
                  rx="1"
                  fill={['#dc2626', '#1d4ed8', '#16a34a', '#facc15'][k]}
                />
              </g>
            ))}
          {p('tv') && (
            <g>
              <rect x="296" y="20" width="60" height="40" fill="#111827" />
              <rect x="300" y="24" width="52" height="32" fill="#15803d" className="room-screen" />
              <line x1="326" y1="24" x2="326" y2="56" stroke="#f8fafc" strokeWidth="0.8" />
              <circle cx="326" cy="40" r="6" stroke="#f8fafc" strokeWidth="0.8" fill="none" />
            </g>
          )}
          {p('chalkboard') && (
            <g>
              <rect
                x="300"
                y="-30"
                width="54"
                height="40"
                fill="#1f2937"
                stroke="#78350f"
                strokeWidth="3"
              />
              {[0, 1, 2, 3].map((k) => (
                <rect
                  key={k}
                  x={306}
                  y={-22 + k * 8}
                  width={40 - k * 6}
                  height="2"
                  fill="#f8fafc"
                  opacity="0.75"
                />
              ))}
            </g>
          )}
          {p('darts') && <Dartboard x={262} y={40} />}
          {p('fairy-lights') && <FairyLights c={s.glow} y={-40} />}
          {[80, 200].map((x) => (
            <g key={x}>
              <line x1={x} y1="-80" x2={x} y2="-20" stroke="#44403c" />
              <ellipse cx={x} cy="-16" rx="9" ry="5" fill={s.glow[0]} className="room-glow" />
            </g>
          ))}
          {p('pool') && <ellipse cx="190" cy="232" rx="60" ry="10" fill="#000" opacity="0.2" />}
        </>
      );
      break;
    case 'speakeasy':
      body = (
        <>
          <Room s={s} />
          <rect x="150" y="-10" width="200" height="104" fill={shade(s.glow[0], -0.55)} />
          <Bottles x={158} y={2} w={186} glow={s.glow[0]} />
          <Bottles x={158} y={46} w={186} />
          <Counter x={150} w={200} c={shade(s.accent, -0.2)} h={36} />
          {p('piano') && (
            <g data-prop="piano">
              <rect x="14" y="96" width="76" height="40" fill="#0c0a09" />
              <rect x="14" y="120" width="76" height="6" fill="#f5f5f4" />
              <rect x="14" y="84" width="76" height="14" fill="#1c1917" />
            </g>
          )}
          {p('art') &&
            [24, 84].map((x, k) => (
              <g key={x}>
                <rect x={x} y={-6} width="44" height="54" fill="#78350f" />
                <rect x={x + 4} y={-2} width="36" height="46" fill={s.glow[k + 1]} opacity="0.55" />
              </g>
            ))}
          {[60, 250].map((x) => (
            <g key={x}>
              <line x1={x} y1="-80" x2={x} y2="-30" stroke="#44403c" />
              <circle cx={x} cy="-26" r="5" fill={s.glow[0]} className="room-glow" />
            </g>
          ))}
          {sign && <Neon text={sign.split(' ')[0]!} x={250} y={-50} c={s.glow[2]} size={12} />}
        </>
      );
      break;
    case 'rooftop':
      body = (
        <>
          <Sky s={s} night={night} />
          <Beyond b={s.backdrop} night={night} s={s} />
          <polygon points={`0,${FLOOR_Y} 360,${FLOOR_Y} 360,240 0,240`} fill={s.floor} />
          {[150, 170, 196, 226].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="360"
              y2={y}
              stroke={shade(s.floor, -0.12)}
              strokeWidth="0.8"
            />
          ))}
          <rect y="120" width="360" height="20" fill="#e0f2fe" opacity="0.25" />
          <rect y="118" width="360" height="3" fill={p('gold') ? '#ca8a04' : '#cbd5e1'} />
          {p('fairy-lights') && <FairyLights c={s.glow} y={-20} />}
          <Counter x={282} w={78} c={shade(s.accent, -0.15)} />
          <rect x="276" y="70" width="90" height="10" fill={s.accent} />
          <rect x="30" y="118" width="48" height="22" fill="#111827" />
          <rect x="30" y="118" width="48" height="3" fill={s.glow[0]} className="room-light" />
          {p('hookah') && <Hookah x={60} y={236} c={s.glow[0]} />}
          {p('lanterns') &&
            [100, 180, 260].map((x) => <Lantern key={x} x={x} y={10} c={s.glow[0]} />)}
          {p('palms') && <Palm x={10} y={140} s={0.9} />}
        </>
      );
      break;
    case 'shisha':
      body = (
        <>
          <Room s={s} />
          {[20, 110, 200].map((x) => (
            <path
              key={x}
              d={`M ${x} 130 v -64 q 0 -36 40 -46 q 40 10 40 46 v 64`}
              fill={shade(s.wall, -0.25)}
              stroke={shade(s.accent, 0.1)}
              strokeWidth="2"
            />
          ))}
          {[40, 130, 220].map((x, k) => (
            <Lantern key={x} x={x} y={-30} c={s.glow[k % 3]!} />
          ))}
          <rect
            x="30"
            y="160"
            width="280"
            height="80"
            rx="6"
            fill={shade(s.accent, -0.35)}
            opacity="0.55"
          />
          <rect
            x="44"
            y="168"
            width="252"
            height="64"
            rx="4"
            fill="none"
            stroke={s.glow[0]}
            strokeWidth="1.5"
            opacity="0.5"
          />
          <Counter x={286} w={74} c={shade(s.accent, -0.25)} />
          {p('tv') && (
            <g>
              <rect x="286" y="40" width="60" height="36" fill="#111827" />
              <rect x="290" y="44" width="52" height="28" fill="#15803d" className="room-screen" />
            </g>
          )}
          {p('neon-sign') && (s.neon ?? sign) && (
            <Neon text={(s.neon ?? sign!.split(' ')[0])!} x={180} y={-50} c={s.glow[0]} size={16} />
          )}
          {p('oud') && <ellipse cx="72" cy="140" rx="10" ry="8" fill="#a16207" data-prop="oud" />}
          <rect x="36" y="140" width="46" height="10" rx="3" fill={s.glow[1]} opacity="0.7" />
        </>
      );
      break;
    case 'beach':
      body = (
        <>
          <Sky s={s} night={night} />
          {s.backdrop === 'spire' ? <Beyond b="spire" night={night} s={s} /> : null}
          <rect y="88" width="360" height="52" fill={night ? '#0c4a6e' : '#0ea5e9'} />
          {[0, 1, 2, 3].map((k) => (
            <path
              key={k}
              d={`M ${k * 96} 106 q 12 -6 24 0 t 24 0`}
              stroke="#e0f2fe"
              strokeWidth="2"
              fill="none"
            />
          ))}
          <polygon points="0,140 360,140 360,240 0,240" fill={s.floor} />
          <Palm x={24} y={146} />
          <Palm x={346} y={136} s={0.8} />
          <rect x="284" y="96" width="72" height="44" fill={shade(s.accent, -0.3)} />
          <polygon points="276,100 364,100 346,72 294,72" fill={s.accent} />
          {sign && <Neon text={sign.split(' ')[0]!} x={320} y={92} c="#fff" size={9} />}
          <rect x="128" y="122" width="44" height="20" fill="#1c1917" />
          <Speaker x={120} y={142} h={30} />
          <Speaker x={180} y={142} h={30} />
          {p('bonfire') && <Bonfire x={186} y={210} />}
          {p('calabash') && <ellipse cx="296" cy="236" rx="8" ry="6" fill="#a16207" />}
          {p('fairy-lights') && <FairyLights c={s.glow} />}
        </>
      );
      break;
    case 'yard':
      body = (
        <>
          <Sky s={s} night={night} />
          <Beyond b={s.backdrop ?? 'wall'} night={night} s={s} />
          {p('palms') && <Palm x={330} y={140} s={0.9} />}
          <polygon points="0,140 360,140 360,240 0,240" fill={s.floor} />
          {(p('fairy-lights') || p('lanterns')) && <FairyLights c={s.glow} y={10} />}
          <rect x="262" y="80" width="98" height="60" fill={shade(s.accent, -0.3)} />
          <rect x="270" y="92" width="82" height="22" fill="#1c1917" />
          <rect x="262" y="72" width="98" height="10" fill={s.accent} />
          {p('crates') && <Crates x={226} y={140} />}
          <Speaker x={20} y={140} h={44} />
          {p('calabash') &&
            [290, 310, 330].map((x) => (
              <ellipse key={x} cx={x} cy={110} rx="6" ry="5" fill="#a16207" />
            ))}
        </>
      );
      break;
    case 'boat':
      body = (
        <>
          <Sky s={s} night={night} />
          <Beyond b="river" night={night} s={s} />
          <polygon points="0,140 360,140 360,240 0,240" fill={s.floor} />
          {[150, 168, 190, 214].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="360"
              y2={y}
              stroke={shade(s.floor, -0.2)}
              strokeWidth="1"
            />
          ))}
          <rect y="128" width="360" height="3" fill="#f8fafc" />
          {[0, 40, 80, 120, 160, 200, 240, 280, 320, 360].map((x) => (
            <rect key={x} x={x - 1} y={128} width="2" height="12" fill="#f8fafc" />
          ))}
          <FairyLights c={s.glow} y={-30} />
          {[60, 300].map((x) => (
            <rect key={x} x={x} y={-80} width="5" height="210" fill="#e5e7eb" />
          ))}
          <rect x="150" y="120" width="80" height="22" fill="#111827" />
          <rect x="150" y="120" width="80" height="3" fill={s.glow[0]} className="room-light" />
          <Counter x={0} w={80} c={shade(s.accent, -0.2)} />
          <Beams c={s.glow} />
        </>
      );
      break;
    case 'band':
      body = (
        <>
          {outdoor ? (
            <>
              <Sky s={s} night={night} />
              <polygon points="0,140 360,140 360,240 0,240" fill={s.floor} />
              <Palm x={20} y={140} />
              <Palm x={350} y={140} s={0.85} />
            </>
          ) : (
            <Room s={s} />
          )}
          {(p('fairy-lights') || p('lanterns')) && <FairyLights c={s.glow} y={-30} />}
          {p('gold') && (
            <rect x="60" y="-40" width="240" height="150" fill="#ca8a04" opacity="0.15" />
          )}
          {p('graffiti') && <Graffiti s={s} />}
          <g className="room-beams">
            <polygon points="90,-40 110,-40 200,126 150,126" fill={s.glow[0]} opacity="0.16" />
            <polygon points="250,-40 270,-40 210,126 160,126" fill={s.glow[1]} opacity="0.16" />
          </g>
          <Band s={s} />
          <Counter x={310} w={50} c={shade(s.accent, -0.25)} />
          {word && <Neon text={word} x={180} y={-50} c={s.glow[0]} size={14} />}
          {p('mirrorball') && (
            <circle cx="180" cy="0" r="10" fill="#e5e7eb" className="room-ball" />
          )}
        </>
      );
      break;
  }
  return (
    <g className={`nl-back nl-${s.layout}`} data-nightlife-art={s.id} style={style}>
      {body}
    </g>
  );
}

function Graffiti({ s }: { s: NightStyle }) {
  return (
    <g opacity="0.75">
      {[0, 1, 2, 3, 4].map((k) => (
        <path
          key={k}
          d={`M ${10 + k * 72} ${100 - (k % 2) * 30} q 20 -40 40 0 t 30 -10`}
          stroke={s.glow[k % 3]}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
      ))}
      <circle cx="300" cy="40" r="14" fill={s.glow[1]} opacity="0.6" />
      <circle cx="60" cy="20" r="10" fill={s.glow[2]} opacity="0.6" />
    </g>
  );
}

/** In front of seated people (their legs). */
export function NightFront({ s }: { s: NightStyle }) {
  const p = (x: string) => s.props.includes(x as never);
  const seat = shade(s.accent, -0.1);
  switch (s.layout) {
    case 'dancefloor':
      return (
        <g>
          {p('vip') && (
            <>
              <Sofa x={56} y={190} w={96} c={p('gold') ? '#111827' : seat} />
              <Sofa x={56} y={226} w={96} c={p('gold') ? '#111827' : seat} />
              {[112, 112].map((x, k) => (
                <rect
                  key={k}
                  x={x}
                  y={156 + k * 46}
                  width="4"
                  height="26"
                  fill={p('gold') ? '#ca8a04' : '#a1a1aa'}
                />
              ))}
              <path d="M 114 160 q 0 20 0 42" stroke="#b91c1c" strokeWidth="3" fill="none" />
            </>
          )}
          {!p('vip') && (
            <>
              <Stool x={300} y={196} c={seat} />
            </>
          )}
        </g>
      );
    case 'warehouse':
      return (
        <g>
          <rect x="120" y="128" width="120" height="16" fill="#27272a" />
          <circle cx="146" cy="134" r="4" fill={s.glow[0]} className="room-light" />
          <circle cx="214" cy="134" r="4" fill={s.glow[1]} className="room-light room-light-1" />
        </g>
      );
    case 'pub':
      return (
        <g>
          {[60, 104, 148].map((x) => (
            <Stool key={x} x={x} y={186} c="#7f1d1d" />
          ))}
          <SmallTable x={62} y={226} w={54} c="#78350f" />
          {p('pool') && (
            <g data-prop="pool">
              <rect x="150" y="206" width="90" height="24" rx="4" fill="#78350f" />
              <rect x="156" y="209" width="78" height="17" rx="3" fill="#15803d" />
              <circle cx="176" cy="216" r="2.2" fill="#f8fafc" />
              <circle cx="206" cy="214" r="2.2" fill="#dc2626" />
              <circle cx="212" cy="219" r="2.2" fill="#facc15" />
              <rect x="152" y="228" width="6" height="12" fill="#57534e" />
              <rect x="232" y="228" width="6" height="12" fill="#57534e" />
            </g>
          )}
        </g>
      );
    case 'speakeasy':
      return (
        <g>
          {[176, 216, 256, 296].map((x) => (
            <Stool key={x} x={x} y={186} c={seat} />
          ))}
          <Sofa x={79} y={210} w={84} c={seat} />
          <Sofa x={79} y={240} w={84} c={shade(seat, -0.1)} />
          <SmallTable x={221} y={230} w={44} c="#1c1917" />
          {p('candles') &&
            [79, 221].map((x) => (
              <circle
                key={x}
                cx={x}
                cy={x === 79 ? 196 : 202}
                r="2.5"
                fill="#fbbf24"
                className="room-glow"
              />
            ))}
        </g>
      );
    case 'rooftop':
      return (
        <g>
          <Sofa x={135} y={208} w={84} c={seat} />
          <Sofa x={239} y={234} w={84} c={shade(seat, 0.1)} />
          <rect x="120" y="212" width="30" height="10" rx="3" fill="#292524" />
          {p('plants') && (
            <g>
              <rect x="330" y="214" width="20" height="18" fill="#a16207" />
              <ellipse cx="340" cy="206" rx="12" ry="14" fill="#16a34a" />
            </g>
          )}
          {p('candles') && (
            <circle cx="135" cy="210" r="2.5" fill="#fbbf24" className="room-glow" />
          )}
        </g>
      );
    case 'shisha':
      return (
        <g>
          {[
            [129, 198],
            [231, 198],
            [95, 236],
            [209, 236],
          ].map(([x, y]) => (
            <g key={`${x}`}>
              <rect x={x! - 46} y={y! - 12} width="92" height="14" rx="6" fill={seat} />
              <rect x={x! - 46} y={y! - 4} width="92" height="6" rx="3" fill={shade(seat, -0.25)} />
              {p('hookah') && <Hookah x={x!} y={y! - 10} c={s.glow[((x! / 10) % 3) | 0]!} />}
            </g>
          ))}
        </g>
      );
    case 'beach':
      return (
        <g>
          {[48, 94].map((x) => (
            <g key={x}>
              <rect x={x - 22} y={200} width="44" height="12" rx="4" fill="#f8fafc" />
              <rect x={x - 20} y={210} width="40" height="8" fill="#a16207" />
            </g>
          ))}
        </g>
      );
    case 'yard':
      return (
        <g>
          {p('braai') ? (
            <Braai x={70} y={166} />
          ) : (
            <Counter x={40} w={60} c={shade(s.accent, -0.3)} y={166} h={20} />
          )}
          <Plastic x={153} y={198} c={p('braai') ? '#dc2626' : '#f8fafc'} />
          <Plastic x={253} y={206} c={p('braai') ? '#dc2626' : '#f8fafc'} />
          <Plastic x={133} y={236} c={p('braai') ? '#1d4ed8' : '#16a34a'} />
          {p('calabash') && <ellipse cx="153" cy="170" rx="6" ry="5" fill="#a16207" />}
        </g>
      );
    case 'boat':
      return (
        <g>
          <rect x="276" y="174" width="84" height="14" rx="3" fill={seat} />
          <rect x="0" y="236" width="360" height="3" fill="#f8fafc" />
          {[0, 60, 120, 180, 240, 300, 360].map((x) => (
            <rect key={x} x={x - 1} y={226} width="2" height="14" fill="#f8fafc" />
          ))}
        </g>
      );
    case 'band':
      return (
        <g>
          <SmallTable x={71} y={200} w={62} c="#78350f" cloth={p('gold') ? '#d4a017' : '#f8fafc'} />
          <SmallTable
            x={284}
            y={204}
            w={62}
            c="#78350f"
            cloth={p('gold') ? '#be185d' : shade(s.accent, 0.5)}
          />
        </g>
      );
  }
}
