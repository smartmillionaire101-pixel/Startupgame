/**
 * Illustrated rooms (Wave 5 §D), front-on in a 360 × 240 box. Each room is
 * two layers: the back (walls, counters, screens: behind the people) and the
 * front (tables, seat rows, stall tables: in front of them, hiding seated
 * people's legs). People stand on the slots in ./rooms.ts.
 */
import type { ReactNode } from 'react';
import { shade } from './art';
import type { HomeItemView } from './life';
import type { RoomKind } from './rooms';

const FLOOR_Y = 140;

function Wall({ wall, floor, trim }: { wall: string; floor: string; trim?: string }) {
  const lines: ReactNode[] = [];
  for (let k = -4; k <= 4; k++) {
    const x0 = 180 + k * 44;
    const x1 = 180 + k * 88;
    lines.push(
      <line key={k} x1={x0} y1={FLOOR_Y} x2={x1} y2={240} stroke={shade(floor, -0.12)} strokeWidth="1" />,
    );
  }
  return (
    <>
      <rect width="360" height={FLOOR_Y} fill={wall} />
      <rect y="0" width="360" height="10" fill={shade(wall, -0.12)} />
      <polygon points={`0,${FLOOR_Y} 360,${FLOOR_Y} 360,240 0,240`} fill={floor} />
      {lines}
      {[162, 190, 222].map((y) => (
        <line key={y} x1="0" y1={y} x2="360" y2={y} stroke={shade(floor, -0.08)} strokeWidth="0.8" />
      ))}
      <rect y={FLOOR_Y - 8} width="360" height="8" fill={trim ?? shade(wall, -0.25)} />
    </>
  );
}

function Window({ x, y, w, h, sky = '#bae6fd', night = false }: { x: number; y: number; w: number; h: number; sky?: string; night?: boolean }) {
  return (
    <g>
      <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx="2" fill="#e7e5e4" />
      <rect x={x} y={y} width={w} height={h} fill={night ? '#1e293b' : sky} />
      {/* A skyline outside. */}
      {[0.08, 0.26, 0.44, 0.62, 0.8].map((u, k) => (
        <rect
          key={k}
          x={x + w * u}
          y={y + h * (0.45 + ((k * 37) % 5) * 0.08)}
          width={w * 0.14}
          height={h * (0.55 - ((k * 37) % 5) * 0.08)}
          fill={night ? '#334155' : '#94a3b8'}
          opacity="0.75"
        />
      ))}
      <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke="#e7e5e4" strokeWidth="3" />
    </g>
  );
}

function Plant({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M -9 0 L 9 0 L 7 -14 L -7 -14 Z" fill="#b45309" />
      <ellipse cx="-6" cy="-24" rx="7" ry="12" fill="#16a34a" transform="rotate(-25 -6 -24)" />
      <ellipse cx="6" cy="-24" rx="7" ry="12" fill="#15803d" transform="rotate(25 6 -24)" />
      <ellipse cx="0" cy="-30" rx="6" ry="13" fill="#22c55e" />
    </g>
  );
}

function Picture({ x, y, w, h, c }: { x: number; y: number; w: number; h: number; c: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#78350f" />
      <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill={shade(c, 0.6)} />
      <circle cx={x + w * 0.35} cy={y + h * 0.4} r={Math.min(w, h) * 0.16} fill={c} />
      <polygon
        points={`${x + 3},${y + h - 3} ${x + w * 0.5},${y + h * 0.45} ${x + w - 3},${y + h - 3}`}
        fill={shade(c, -0.2)}
      />
    </g>
  );
}

function Pendant({ x, len = 34, c = '#fbbf24' }: { x: number; len?: number; c?: string }) {
  return (
    <g>
      <line x1={x} y1="0" x2={x} y2={len} stroke="#44403c" strokeWidth="1" />
      <path d={`M ${x - 9} ${len + 8} L ${x + 9} ${len + 8} L ${x + 5} ${len} L ${x - 5} ${len} Z`} fill="#292524" />
      <ellipse cx={x} cy={len + 9} rx="5" ry="2" fill={c} className="room-glow" />
    </g>
  );
}

/** A table seen from the front: its top and a cloth that hides seated legs. */
function Table({ x, y, w, top = '#a16207', cloth, items = 'plates' }: { x: number; y: number; w: number; top?: string; cloth?: string; items?: 'plates' | 'cups' | 'laptops' | 'papers' | 'none' }) {
  const ty = y - 24;
  return (
    <g>
      <rect x={x - w / 2} y={ty} width={w} height="6" rx="2" fill={top} />
      {cloth ? (
        <path d={`M ${x - w / 2} ${ty + 5} L ${x + w / 2} ${ty + 5} L ${x + w / 2 + 3} ${y + 6} L ${x - w / 2 - 3} ${y + 6} Z`} fill={cloth} />
      ) : (
        <>
          <rect x={x - w / 2 + 4} y={ty + 6} width="5" height={y - ty + 2} fill={shade(top, -0.25)} />
          <rect x={x + w / 2 - 9} y={ty + 6} width="5" height={y - ty + 2} fill={shade(top, -0.25)} />
          <rect x={x - w / 2} y={ty + 6} width={w} height="10" fill={shade(top, -0.12)} />
        </>
      )}
      {items === 'plates' && (
        <>
          <ellipse cx={x - w * 0.22} cy={ty} rx="8" ry="2.6" fill="#fff" />
          <ellipse cx={x - w * 0.22} cy={ty - 1.5} rx="4.5" ry="1.6" fill="#ea580c" />
          <ellipse cx={x + w * 0.22} cy={ty} rx="8" ry="2.6" fill="#fff" />
          <ellipse cx={x + w * 0.22} cy={ty - 1.5} rx="4.5" ry="1.6" fill="#65a30d" />
          <rect x={x - 2} y={ty - 9} width="4" height="9" rx="1" fill="#dc2626" opacity="0.8" />
        </>
      )}
      {items === 'cups' && (
        <>
          <rect x={x - w * 0.25 - 3} y={ty - 7} width="7" height="7" rx="1.5" fill="#fff" />
          <rect x={x + w * 0.2 - 3} y={ty - 7} width="7" height="7" rx="1.5" fill="#fde68a" />
        </>
      )}
      {items === 'laptops' && (
        <>
          <path d={`M ${x - w * 0.3} ${ty} l 5 -12 h 18 l -5 12 Z`} fill="#94a3b8" />
          <path d={`M ${x + w * 0.05} ${ty} l 5 -12 h 18 l -5 12 Z`} fill="#cbd5e1" />
        </>
      )}
      {items === 'papers' && (
        <>
          <rect x={x - w * 0.3} y={ty - 2} width="16" height="3" fill="#fff" />
          <rect x={x + w * 0.1} y={ty - 2} width="16" height="3" fill="#e0f2fe" />
        </>
      )}
    </g>
  );
}

function Counter({ x, y, w, h = 30, c, top }: { x: number; y: number; w: number; h?: number; c: string; top?: string }) {
  return (
    <g>
      <rect x={x} y={y - h} width={w} height={h} fill={c} />
      <rect x={x - 3} y={y - h - 5} width={w + 6} height="6" rx="1.5" fill={top ?? shade(c, -0.3)} />
      <rect x={x + 6} y={y - h + 8} width={w - 12} height="2" fill={shade(c, 0.2)} />
    </g>
  );
}

function Shelf({ x, y, w, rows = 3, c = '#92400e', goods }: { x: number; y: number; w: number; rows?: number; c?: string; goods: string[] }) {
  const out: ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    const sy = y + r * 20;
    out.push(<rect key={`s${r}`} x={x} y={sy + 14} width={w} height="3" fill={c} />);
    for (let k = 0; k < Math.floor(w / 12); k++)
      out.push(
        <rect
          key={`g${r}-${k}`}
          x={x + 3 + k * 12}
          y={sy + 2 + ((k + r) % 3)}
          width="8"
          height={12 - ((k + r) % 3)}
          rx="1"
          fill={goods[(k + r * 2) % goods.length]}
        />,
      );
  }
  return <g>{out}</g>;
}

/** One row of cinema / event seats (front layer). */
function SeatRow({ y, x0, x1, c }: { y: number; x0: number; x1: number; c: string }) {
  const out: ReactNode[] = [];
  for (let x = x0; x <= x1; x += 30)
    out.push(
      <g key={x}>
        <rect x={x - 13} y={y - 30} width="26" height="20" rx="5" fill={c} />
        <rect x={x - 14} y={y - 12} width="28" height="16" rx="3" fill={shade(c, -0.2)} />
      </g>,
    );
  return <g>{out}</g>;
}

function Sofa({ x, y, w, c }: { x: number; y: number; w: number; c: string }) {
  return (
    <g>
      <rect x={x - w / 2} y={y - 34} width={w} height="20" rx="6" fill={shade(c, -0.1)} />
      <rect x={x - w / 2} y={y - 18} width={w} height="18" rx="4" fill={c} />
      <rect x={x - w / 2 - 6} y={y - 26} width="10" height="26" rx="4" fill={shade(c, -0.2)} />
      <rect x={x + w / 2 - 4} y={y - 26} width="10" height="26" rx="4" fill={shade(c, -0.2)} />
    </g>
  );
}

function Car({ x, y, c, w = 120 }: { x: number; y: number; c: string; w?: number }) {
  const s = w / 120;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="2" rx="62" ry="6" fill="#0f172a" opacity="0.2" />
      <path d="M -58 -10 Q -58 -24 -40 -26 L -22 -42 Q -10 -48 16 -46 L 34 -30 L 52 -26 Q 60 -24 60 -12 L 60 -6 L -58 -6 Z" fill={c} />
      <path d="M -18 -40 L 12 -42 L 26 -30 L -30 -30 Z" fill="#bae6fd" />
      <line x1="-2" y1="-41" x2="-2" y2="-30" stroke={c} strokeWidth="3" />
      <circle cx="-34" cy="-6" r="10" fill="#111827" />
      <circle cx="-34" cy="-6" r="4" fill="#9ca3af" />
      <circle cx="36" cy="-6" r="10" fill="#111827" />
      <circle cx="36" cy="-6" r="4" fill="#9ca3af" />
      <rect x="52" y="-22" width="6" height="4" rx="1" fill="#fde68a" />
    </g>
  );
}

function PriceTag({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y + 10} stroke="#64748b" />
      <rect x={x - 10} y={y - 8} width="20" height="10" rx="2" fill="#fef08a" stroke="#ca8a04" strokeWidth="0.6" />
    </g>
  );
}

function Sign({ x, y, w, text, c, fg = '#fff' }: { x: number; y: number; w: number; text: string; c: string; fg?: string }) {
  return (
    <g>
      <rect x={x - w / 2} y={y} width={w} height="18" rx="4" fill={c} />
      <text x={x} y={y + 12.5} textAnchor="middle" fontSize="9" fontWeight="800" fill={fg} letterSpacing="0.06em">
        {text}
      </text>
    </g>
  );
}

function Desk({ x, y, w = 70, monitor = '#0f172a' }: { x: number; y: number; w?: number; monitor?: string }) {
  const ty = y - 24;
  return (
    <g>
      <rect x={x - 12} y={ty - 22} width="24" height="16" rx="1.5" fill={monitor} />
      <rect x={x - 10} y={ty - 20} width="20" height="12" fill="#38bdf8" opacity="0.6" className="room-screen" />
      <rect x={x - 2} y={ty - 6} width="4" height="6" fill="#334155" />
      <rect x={x - w / 2} y={ty} width={w} height="6" fill="#e7e5e4" />
      <rect x={x - w / 2} y={ty + 6} width={w} height={y - ty + 2} fill="#d6d3d1" />
    </g>
  );
}

function Whiteboard({ x, y, w = 80, h = 50, notes = true }: { x: number; y: number; w?: number; h?: number; notes?: boolean }) {
  const colors = ['#fde047', '#f9a8d4', '#86efac', '#93c5fd'];
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#fff" stroke="#94a3b8" strokeWidth="2" />
      {notes &&
        Array.from({ length: 8 }, (_, k) => (
          <rect key={k} x={x + 6 + (k % 4) * (w / 4.4)} y={y + 6 + Math.floor(k / 4) * 20} width="12" height="12" fill={colors[k % 4]} />
        ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// The apartment: what you own, else a basic furnished flat.

const TIER_COLORS = ['#a8a29e', '#2563eb', '#7c3aed'];

function ApartmentBack({ items }: { items: HomeItemView[] | null }) {
  const has = (slot: RegExp) => items?.find((i) => slot.test(i.slot) || slot.test(i.itemId));
  const tv = has(/tv|screen/);
  const art = has(/art|paint/);
  const kitchen = has(/kitchen/);
  const sound = has(/sound|speaker|audio/);
  const bed = has(/bed/);
  const basic = !items || items.length === 0;
  return (
    <g>
      <Wall wall="#fef3c7" floor="#d6a86b" />
      <Window x={22} y={24} w={86} h={70} />
      {(art || basic) && <Picture x={128} y={26} w={44} h={34} c={art ? TIER_COLORS[art.tier - 1]! : '#f472b6'} />}
      {tv && (
        <g data-furniture="tv">
          <rect x={190} y={34} width={80} height={46} rx="2" fill="#0f172a" />
          <rect x={194} y={38} width={72} height={38} fill={TIER_COLORS[tv.tier - 1]} opacity="0.65" className="room-screen" />
          <rect x={200} y={96} width={60} height={36} fill="#57534e" />
        </g>
      )}
      {kitchen && (
        <g data-furniture="kitchen">
          <rect x={286} y={60} width={70} height={72} fill="#e7e5e4" />
          <rect x={286} y={56} width={70} height={6} fill={TIER_COLORS[kitchen.tier - 1]} />
          <rect x={292} y={24} width={58} height={26} fill="#f5f5f4" stroke="#d6d3d1" />
          <circle cx={306} cy={56} r="3" fill="#44403c" />
          <circle cx={322} cy={56} r="3" fill="#44403c" />
        </g>
      )}
      {sound && (
        <g data-furniture="sound">
          <rect x={176} y={88} width={12} height={44} rx="2" fill="#1f2937" />
          <circle cx={182} cy={104} r="4" fill="#4b5563" />
          <circle cx={182} cy={120} r="5" fill="#4b5563" />
        </g>
      )}
      {(bed || basic) && (
        <g data-furniture="bed">
          <rect x={288} y={bed ? 104 : 96} width={68} height={34} rx="3" fill={bed ? TIER_COLORS[bed.tier - 1] : '#94a3b8'} />
          <rect x={290} y={bed ? 98 : 90} width={22} height={10} rx="3" fill="#fff" />
        </g>
      )}
      <Plant x={14} y={138} s={has(/plant/) ? 1.2 : 0.9} />
    </g>
  );
}

function ApartmentFront({ items }: { items: HomeItemView[] | null }) {
  const has = (slot: RegExp) => items?.find((i) => slot.test(i.slot) || slot.test(i.itemId));
  const sofa = has(/sofa|couch/);
  const desk = has(/desk|office/);
  const gaming = has(/gam|console/);
  const basic = !items || items.length === 0;
  return (
    <g>
      {(sofa || basic) && (
        <g data-furniture="sofa">
          <Sofa x={150} y={204} w={96} c={sofa ? TIER_COLORS[sofa.tier - 1]! : '#78716c'} />
        </g>
      )}
      {desk && (
        <g data-furniture="desk">
          <Desk x={60} y={214} w={64} />
        </g>
      )}
      {gaming && (
        <g data-furniture="gaming">
          <rect x={226} y={222} width={26} height={10} rx="3" fill="#111827" />
          <circle cx={232} cy={227} r="2" fill="#22d3ee" />
          <circle cx={246} cy={227} r="2" fill="#f43f5e" />
        </g>
      )}
      <rect x={130} y={214} width={44} height={14} rx="3" fill="#a16207" />
    </g>
  );
}

// ---------------------------------------------------------------------------

export interface RoomArtProps {
  kind: RoomKind;
  /** The place's colour (a business's look, a bank's brand…). */
  tint: string;
  /** Short sign over the room (a name, "DEMO DAY"…). */
  sign?: string;
  /** Your apartment's furniture (null: none known, a basic flat). */
  home?: HomeItemView[] | null;
}

export function RoomBack({ kind, tint, sign, home = null }: RoomArtProps) {
  const t = tint;
  switch (kind) {
    case 'restaurant':
      return (
        <g>
          <Wall wall={shade(t, 0.75)} floor="#b45309" />
          <rect x="222" y="40" width="130" height="58" fill="#44403c" />
          <rect x="228" y="46" width="118" height="46" fill="#fbbf24" opacity="0.35" />
          <g className="room-steam">
            <path d="M 258 60 q 6 -8 0 -16 q -6 -8 0 -16" stroke="#fff" strokeWidth="2" fill="none" opacity="0.7" />
            <path d="M 300 60 q 6 -8 0 -16 q -6 -8 0 -16" stroke="#fff" strokeWidth="2" fill="none" opacity="0.7" />
          </g>
          {[236, 252, 268].map((x) => (
            <rect key={x} x={x} y={30} width="10" height="12" fill="#fff" stroke="#d6d3d1" />
          ))}
          <Counter x={222} y={140} w={130} h={40} c={shade(t, -0.15)} />
          <Picture x={30} y={34} w={50} h={38} c={t} />
          <Picture x={100} y={40} w={36} h={30} c="#16a34a" />
          {sign && <Sign x={115} y={92} w={150} text={sign} c={shade(t, -0.3)} />}
          <Pendant x={93} len={50} />
          <Pendant x={220} len={56} />
        </g>
      );
    case 'cafe':
      return (
        <g>
          <Wall wall={shade(t, 0.8)} floor="#a16207" />
          <rect x="20" y="22" width="140" height="44" rx="3" fill="#1c1917" />
          {[0, 1, 2].map((k) => (
            <rect key={k} x={30} y={30 + k * 11} width={70 - k * 12} height="4" fill="#fef3c7" opacity="0.8" />
          ))}
          <Counter x={30} y={140} w={140} h={38} c={shade(t, -0.2)} />
          <g>
            <rect x="120" y="76" width="34" height="26" rx="3" fill="#a8a29e" />
            <rect x="126" y="82" width="22" height="8" fill="#57534e" />
            <rect x="132" y="92" width="4" height="8" fill="#292524" />
            <path d="M 134 74 q 4 -6 0 -12" stroke="#fff" strokeWidth="1.5" fill="none" className="room-steam" />
          </g>
          <Shelf x={190} y={30} w={84} rows={2} goods={['#fef3c7', '#fde68a', '#d6d3d1', '#a8a29e']} />
          <Window x={290} y={26} w={60} h={70} />
          {sign && <Sign x={240} y={88} w={110} text={sign} c={shade(t, -0.3)} />}
          <Plant x={340} y={140} />
        </g>
      );
    case 'club':
      return (
        <g>
          <Wall wall="#1e1b4b" floor="#0f172a" trim="#312e81" />
          <g className="room-beams">
            <polygon points="60,0 90,0 150,140 100,140" fill="#f472b6" opacity="0.18" />
            <polygon points="270,0 300,0 260,140 210,140" fill="#22d3ee" opacity="0.18" />
            <polygon points="170,0 190,0 230,140 150,140" fill="#a3e635" opacity="0.12" />
          </g>
          <line x1="180" y1="0" x2="180" y2="16" stroke="#94a3b8" />
          <circle cx="180" cy="26" r="11" fill="#cbd5e1" className="room-ball" />
          <circle cx="176" cy="22" r="2.5" fill="#fff" />
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <rect key={k} x={20 + k * 56} y="44" width="14" height="40" rx="3" fill={['#f472b6', '#22d3ee', '#a3e635', '#fbbf24'][k % 4]} opacity="0.5" className={`room-light room-light-${k % 3}`} />
          ))}
          {sign && <Sign x={180} y={92} w={140} text={sign} c="#7c3aed" />}
        </g>
      );
    case 'bar':
      return (
        <g>
          <Wall wall={shade(t, -0.55)} floor="#44403c" trim={shade(t, -0.7)} />
          <Shelf x={40} y={26} w={230} rows={3} c="#78350f" goods={['#16a34a', '#b45309', '#e11d48', '#eab308', '#a855f7', '#e5e7eb']} />
          <Counter x={30} y={140} w={240} h={32} c="#78350f" top="#451a03" />
          {sign && (
            <text x="310" y="58" textAnchor="middle" fontSize="13" fontWeight="800" fill="#f472b6" className="room-neon">
              {sign.split(' ')[0]}
            </text>
          )}
          <Window x={290} y={74} w={56} h={44} night />
          <Pendant x={90} len={20} c="#f59e0b" />
          <Pendant x={210} len={20} c="#f59e0b" />
        </g>
      );
    case 'cinema':
      return (
        <g>
          <Wall wall="#450a0a" floor="#1c1917" trim="#7f1d1d" />
          <rect x="40" y="16" width="250" height="100" fill="#f8fafc" opacity="0.9" />
          <rect x="40" y="16" width="250" height="100" fill={t} opacity="0.35" className="room-movie" />
          <circle cx="120" cy="70" r="22" fill="#fde68a" opacity="0.7" />
          <polygon points="160,110 220,40 280,110" fill="#334155" opacity="0.5" />
          <rect x="30" y="10" width="10" height="130" fill="#7f1d1d" />
          <rect x="290" y="10" width="10" height="130" fill="#7f1d1d" />
          <rect x="314" y="80" width="40" height="60" fill="#292524" />
          <rect x="318" y="84" width="32" height="10" fill="#fde047" />
        </g>
      );
    case 'gym':
      return (
        <g>
          <Wall wall="#e2e8f0" floor="#334155" />
          <rect x="20" y="20" width="160" height="96" fill="#cbd5e1" opacity="0.6" stroke="#94a3b8" />
          <rect x="196" y="76" width="90" height="8" fill="#475569" />
          {[204, 222, 240, 258, 276].map((x, k) => (
            <rect key={x} x={x} y={62 - k * 2} width="8" height={14 + k * 2} rx="2" fill="#0f172a" />
          ))}
          <g>
            <rect x="296" y="96" width="56" height="10" rx="2" fill="#1f2937" />
            <rect x="340" y="60" width="6" height="40" fill="#475569" />
            <rect x="330" y="56" width="20" height="10" rx="2" fill="#111827" />
          </g>
          {sign && <Sign x={100} y={30} w={120} text={sign} c={t} />}
        </g>
      );
    case 'cowork':
    case 'office':
    case 'hub':
      return (
        <g>
          <Wall wall={kind === 'hub' ? '#ecfccb' : kind === 'office' ? shade(t, 0.82) : '#f1f5f9'} floor="#a8a29e" />
          <Window x={20} y={22} w={120} h={70} />
          <Whiteboard x={170} y={30} />
          {kind === 'hub' && <Sign x={300} y={30} w={90} text={sign ?? 'HUB'} c="#65a30d" />}
          {kind !== 'hub' && sign && <Sign x={300} y={30} w={100} text={sign} c={shade(t, -0.3)} />}
          <Plant x={340} y={140} s={1.1} />
          {kind === 'hub' && (
            <g>
              <Counter x={260} y={140} w={70} h={30} c="#78350f" />
              <rect x="276" y="98" width="16" height="14" rx="2" fill="#a8a29e" />
            </g>
          )}
        </g>
      );
    case 'bank':
      return (
        <g>
          <Wall wall="#f8fafc" floor="#e7e5e4" trim={t} />
          {[30, 330].map((x) => (
            <g key={x}>
              <rect x={x - 10} y="14" width="20" height="126" fill="#e2e8f0" />
              <rect x={x - 13} y="14" width="26" height="8" fill="#cbd5e1" />
            </g>
          ))}
          <Sign x={180} y={18} w={180} text={sign ?? 'BANK'} c={t} />
          <Counter x={60} y={140} w={240} h={40} c={shade(t, 0.2)} top={shade(t, -0.3)} />
          {[90, 180, 270].map((x) => (
            <rect key={x} x={x - 30} y="56" width="60" height="40" fill="#bae6fd" opacity="0.4" stroke="#94a3b8" />
          ))}
        </g>
      );
    case 'investor':
      return (
        <g>
          <Wall wall="#f5f5f4" floor="#78716c" />
          <Window x={20} y={20} w={200} h={96} />
          <Picture x={250} y={30} w={60} h={46} c={t} />
          {sign && <Sign x={290} y={90} w={110} text={sign} c="#1c1917" />}
          <Plant x={340} y={140} s={1.2} />
        </g>
      );
    case 'accelerator':
      return (
        <g>
          <Wall wall="#fdf4ff" floor="#a8a29e" />
          <rect x="30" y="20" width="160" height="90" fill="#0f172a" />
          <text x="110" y="58" textAnchor="middle" fontSize="16" fontWeight="900" fill="#f0abfc">
            DEMO DAY
          </text>
          <rect x="54" y="72" width="112" height="22" fill="#a855f7" opacity="0.6" className="room-screen" />
          <rect x="30" y="110" width="160" height="30" fill="#4c1d95" />
          <Whiteboard x={220} y={26} w={110} h={56} />
          {sign && <Sign x={275} y={96} w={110} text={sign} c="#7e22ce" />}
        </g>
      );
    case 'devpartner':
      return (
        <g>
          <Wall wall="#ecfeff" floor="#a8a29e" />
          <rect x="24" y="22" width="130" height="80" fill="#e0f2fe" stroke="#0e7490" strokeWidth="2" />
          <path d="M 40 60 q 20 -26 40 -6 q 14 10 30 -10 q 14 -8 30 10 l 0 30 l -100 0 Z" fill="#86efac" />
          {[60, 90, 120].map((x) => (
            <circle key={x} cx={x} cy={56 + (x % 3) * 6} r="3" fill="#dc2626" />
          ))}
          {['#0ea5e9', '#16a34a', '#f59e0b'].map((c, k) => (
            <g key={c}>
              <line x1={200 + k * 40} y1="30" x2={200 + k * 40} y2="130" stroke="#78716c" strokeWidth="2" />
              <rect x={202 + k * 40} y="30" width="26" height="18" fill={c} />
            </g>
          ))}
          {sign && <Sign x={260} y={100} w={130} text={sign} c="#0e7490" />}
        </g>
      );
    case 'showroom':
      return (
        <g>
          <Wall wall="#f1f5f9" floor="#cbd5e1" />
          <Window x={10} y={14} w={340} h={100} />
          {sign && <Sign x={180} y={116} w={150} text={sign} c={t} />}
        </g>
      );
    case 'furniture':
      return (
        <g>
          <Wall wall="#fff7ed" floor="#d6a86b" />
          <Shelf x={20} y={26} w={110} rows={4} c="#78350f" goods={['#f97316', '#a3e635', '#e5e7eb', '#a855f7']} />
          <Picture x={160} y={30} w={50} h={40} c="#0ea5e9" />
          <Picture x={226} y={36} w={40} h={30} c="#f43f5e" />
          <g>
            <line x1="300" y1="70" x2="300" y2="132" stroke="#44403c" strokeWidth="2" />
            <path d="M 286 72 L 314 72 L 308 54 L 292 54 Z" fill="#fde68a" />
          </g>
          {sign && <Sign x={220} y={92} w={130} text={sign} c={t} />}
        </g>
      );
    case 'apartment':
      return <ApartmentBack items={home} />;
    case 'hotel':
      return (
        <g>
          <Wall wall="#e0e7ff" floor="#a5b4fc" />
          <Window x={230} y={20} w={110} h={80} />
          <Picture x={40} y={30} w={60} h={40} c="#0ea5e9" />
          <rect x="20" y="96" width="190" height="44" rx="4" fill="#fff" />
          <rect x="20" y="112" width="190" height="28" fill="#6366f1" opacity="0.7" />
          <rect x="26" y="86" width="40" height="16" rx="5" fill="#fff" stroke="#e5e7eb" />
          <rect x="70" y="86" width="40" height="16" rx="5" fill="#fff" stroke="#e5e7eb" />
        </g>
      );
    case 'market':
      return (
        <g>
          <rect width="360" height="140" fill="#bae6fd" />
          <polygon points="0,140 360,140 360,240 0,240" fill="#d6b88f" />
          {[60, 180, 300].map((x, k) => (
            <g key={x}>
              <rect x={x - 52} y="40" width="104" height="100" fill={['#fef3c7', '#fee2e2', '#dcfce7'][k]} />
              <path
                d={`M ${x - 58} 40 L ${x + 58} 40 L ${x + 52} 22 L ${x - 52} 22 Z`}
                fill={['#ea580c', '#dc2626', '#16a34a'][k]}
              />
              {[0, 1, 2, 3, 4].map((s) => (
                <rect key={s} x={x - 52 + s * 22} y="40" width="11" height="8" fill="#fff" opacity="0.6" />
              ))}
            </g>
          ))}
          {sign && <Sign x={180} y={2} w={170} text={sign} c="#7c2d12" />}
        </g>
      );
    case 'eventhall':
      return (
        <g>
          <Wall wall="#312e81" floor="#78716c" trim="#4338ca" />
          <rect x="70" y="20" width="220" height="70" fill="#1e1b4b" stroke="#a5b4fc" />
          <text x="180" y="60" textAnchor="middle" fontSize="15" fontWeight="900" fill="#e0e7ff">
            {sign ?? 'EVENT'}
          </text>
          <rect x="60" y="110" width="240" height="30" fill="#4338ca" />
          <g className="room-beams">
            <polygon points="20,0 40,0 120,140 70,140" fill="#fde047" opacity="0.12" />
            <polygon points="320,0 340,0 290,140 240,140" fill="#fde047" opacity="0.12" />
          </g>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
            <polygon key={k} points={`${30 + k * 42},6 ${50 + k * 42},6 ${40 + k * 42},16`} fill={['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6'][k % 4]} />
          ))}
        </g>
      );
    case 'airport':
      return (
        <g>
          <Wall wall="#e2e8f0" floor="#cbd5e1" />
          <rect x="10" y="10" width="190" height="104" fill="#bae6fd" stroke="#94a3b8" strokeWidth="3" />
          <g className="room-plane">
            <path d="M 40 70 L 150 64 Q 162 64 162 70 Q 162 76 150 76 L 40 76 Z" fill="#f8fafc" stroke="#64748b" />
            <path d="M 90 70 L 70 46 L 82 46 L 110 70 Z" fill="#94a3b8" />
          </g>
          <rect x="220" y="14" width="130" height="62" fill="#0f172a" />
          {[0, 1, 2, 3].map((k) => (
            <g key={k}>
              <rect x="226" y={20 + k * 13} width="70" height="8" fill="#fde047" opacity="0.85" />
              <rect x="302" y={20 + k * 13} width="40" height="8" fill="#4ade80" opacity="0.7" />
            </g>
          ))}
          <Counter x={210} y={140} w={130} h={34} c="#475569" />
        </g>
      );
    case 'clinic':
      return (
        <g>
          <Wall wall="#f0fdf4" floor="#d1d5db" />
          <rect x="40" y="26" width="30" height="30" fill="#fff" />
          <rect x="51" y="30" width="8" height="22" fill="#dc2626" />
          <rect x="44" y="37" width="22" height="8" fill="#dc2626" />
          <Counter x={60} y={140} w={110} h={34} c="#e2e8f0" top="#16a34a" />
          <Picture x={220} y={34} w={60} h={40} c="#16a34a" />
          {sign && <Sign x={250} y={92} w={120} text={sign} c={t} />}
        </g>
      );
    case 'gallery':
      return (
        <g>
          <Wall wall="#fafaf9" floor="#d6d3d1" />
          <Picture x={30} y={30} w={70} h={56} c="#f43f5e" />
          <Picture x={130} y={20} w={90} h={70} c="#0ea5e9" />
          <Picture x={250} y={34} w={60} h={50} c="#f59e0b" />
          {sign && <Sign x={180} y={100} w={130} text={sign} c="#1c1917" />}
        </g>
      );
    case 'school':
      return (
        <g>
          <Wall wall="#fefce8" floor="#a8a29e" />
          <rect x="100" y="24" width="200" height="80" fill="#14532d" stroke="#a16207" strokeWidth="4" />
          <path d="M 120 50 h 60 M 120 66 h 90 M 120 82 h 40" stroke="#f0fdf4" strokeWidth="2" />
          <Window x={20} y={24} w={60} h={70} />
          {sign && <Sign x={200} y={110} w={130} text={sign} c={t} />}
        </g>
      );
    case 'workshop':
      return (
        <g>
          <Wall wall="#e7e5e4" floor="#57534e" />
          <rect x="20" y="20" width="120" height="110" fill="#a8a29e" />
          {[30, 50, 70, 90, 110].map((y) => (
            <line key={y} x1="20" y1={y} x2="140" y2={y} stroke="#78716c" />
          ))}
          <Shelf x={190} y={30} w={140} rows={3} c="#44403c" goods={['#f59e0b', '#0ea5e9', '#78716c']} />
          {sign && <Sign x={260} y={100} w={130} text={sign} c={t} />}
        </g>
      );
    case 'shop':
    default:
      return (
        <g>
          <Wall wall={shade(t, 0.82)} floor="#a8a29e" />
          <Shelf x={20} y={24} w={140} rows={4} goods={[t, '#f59e0b', '#22c55e', '#e5e7eb', '#3b82f6']} />
          <Shelf x={190} y={24} w={90} rows={3} goods={['#f43f5e', t, '#a855f7']} />
          <Counter x={210} y={140} w={130} h={34} c={shade(t, -0.2)} />
          {sign && <Sign x={290} y={94} w={110} text={sign} c={shade(t, -0.35)} />}
        </g>
      );
  }
}

export function RoomFront({ kind, tint, home = null }: RoomArtProps) {
  switch (kind) {
    case 'restaurant':
      return (
        <g>
          <Table x={93} y={186} w={78} cloth="#fff" />
          <Table x={220} y={196} w={84} cloth={shade(tint, 0.5)} />
        </g>
      );
    case 'cafe':
      return (
        <g>
          <Table x={208} y={192} w={40} items="laptops" />
          <Table x={272} y={192} w={56} items="cups" />
        </g>
      );
    case 'club':
      return (
        <g>
          <rect x="120" y="120" width="120" height="22" fill="#111827" />
          <rect x="130" y="124" width="40" height="8" rx="3" fill="#334155" />
          <circle cx="146" cy="128" r="3" fill="#a3e635" className="room-light room-light-1" />
          <circle cx="214" cy="128" r="3" fill="#f472b6" className="room-light room-light-2" />
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <rect key={k} x={60 + k * 40} y="232" width="38" height="8" fill={['#f472b6', '#22d3ee', '#a3e635'][k % 3]} opacity="0.35" className={`room-light room-light-${k % 3}`} />
          ))}
        </g>
      );
    case 'bar':
      return (
        <g>
          {[92, 144, 196].map((x) => (
            <g key={x}>
              <rect x={x - 10} y={170} width="20" height="5" rx="2" fill="#1c1917" />
              <rect x={x - 2} y={174} width="4" height="22" fill="#44403c" />
            </g>
          ))}
          <rect x="60" y="158" width="170" height="10" rx="2" fill="#78350f" />
        </g>
      );
    case 'cinema':
      return (
        <g>
          <SeatRow y={182} x0={80} x1={260} c="#991b1b" />
          <SeatRow y={222} x0={50} x1={290} c="#b91c1c" />
        </g>
      );
    case 'gym':
      return (
        <g>
          <rect x="40" y="206" width="80" height="6" rx="3" fill="#0ea5e9" opacity="0.5" />
          <rect x="140" y="220" width="80" height="6" rx="3" fill="#f43f5e" opacity="0.5" />
        </g>
      );
    case 'cowork':
    case 'office':
    case 'hub':
      return (
        <g>
          <Desk x={115} y={178} w={110} />
          {kind === 'hub' ? (
            <Table x={266} y={214} w={60} items="cups" />
          ) : (
            <Desk x={266} y={214} w={110} />
          )}
        </g>
      );
    case 'bank':
      return (
        <g>
          {[100, 280].map((x) => (
            <g key={x}>
              <rect x={x - 2} y="196" width="4" height="30" fill="#a16207" />
              <circle cx={x} cy="194" r="4" fill="#ca8a04" />
            </g>
          ))}
          <path d="M 100 200 Q 190 214 280 200" stroke="#b91c1c" strokeWidth="3" fill="none" />
        </g>
      );
    case 'investor':
      return (
        <g>
          <Table x={178} y={196} w={90} top="#1c1917" items="papers" />
          <Sofa x={66} y={214} w={70} c="#334155" />
        </g>
      );
    case 'accelerator':
      return (
        <g>
          <Table x={230} y={200} w={96} items="laptops" />
          <ellipse cx="40" cy="214" rx="26" ry="14" fill="#f472b6" />
        </g>
      );
    case 'devpartner':
      return <Table x={178} y={194} w={96} top="#0e7490" items="papers" />;
    case 'showroom':
      return (
        <g>
          <Car x={110} y={222} c={tint} w={150} />
          <Car x={270} y={190} c="#0f172a" w={110} />
          <PriceTag x={190} y={176} />
          <PriceTag x={330} y={150} />
        </g>
      );
    case 'furniture':
      return (
        <g>
          <Sofa x={130} y={210} w={100} c={tint} />
          <rect x="240" y="196" width="80" height="20" rx="4" fill="#7c3aed" opacity="0.7" />
          <rect x="236" y="214" width="88" height="10" fill="#57534e" />
          <PriceTag x={150} y={168} />
          <PriceTag x={280} y={180} />
        </g>
      );
    case 'apartment':
      return <ApartmentFront items={home} />;
    case 'hotel':
      return (
        <g>
          <rect x="280" y="212" width="40" height="22" rx="4" fill="#be123c" />
          <rect x="294" y="206" width="12" height="6" rx="2" fill="#881337" />
        </g>
      );
    case 'market':
      return (
        <g>
          {[60, 180, 300].map((x, k) => (
            <g key={x}>
              <rect x={x - 54} y="150" width="108" height="16" fill="#92400e" />
              {[0, 1, 2, 3, 4, 5].map((s) => (
                <circle key={s} cx={x - 44 + s * 17} cy="148" r="6" fill={[['#f97316', '#facc15'], ['#dc2626', '#f87171'], ['#16a34a', '#84cc16']][k]![s % 2]} />
              ))}
            </g>
          ))}
        </g>
      );
    case 'eventhall':
      return (
        <g>
          <rect x="140" y="206" width="16" height="22" fill="#78350f" />
          <ellipse cx="148" cy="206" rx="14" ry="4" fill="#f5f5f4" />
          <rect x="260" y="206" width="16" height="22" fill="#78350f" />
          <ellipse cx="268" cy="206" rx="14" ry="4" fill="#f5f5f4" />
        </g>
      );
    case 'airport':
      return (
        <g>
          <rect x="90" y="208" width="26" height="22" rx="3" fill="#0ea5e9" />
          <rect x="98" y="200" width="10" height="8" rx="2" fill="none" stroke="#0369a1" strokeWidth="2" />
          <rect x="310" y="214" width="24" height="18" rx="3" fill="#f59e0b" />
        </g>
      );
    case 'clinic':
      return <SeatRow y={196} x0={220} x1={320} c="#16a34a" />;
    case 'gallery':
      return <rect x="90" y="226" width="120" height="10" rx="2" fill="#78716c" />;
    case 'school':
      return (
        <g>
          <Desk x={160} y={186} w={60} monitor="#334155" />
          <Desk x={240} y={186} w={60} monitor="#334155" />
          <Desk x={320} y={186} w={60} monitor="#334155" />
        </g>
      );
    case 'workshop':
      return <rect x="60" y="196" width="120" height="14" fill="#44403c" />;
    default:
      return null;
  }
}
