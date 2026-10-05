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
      <line
        key={k}
        x1={x0}
        y1={FLOOR_Y}
        x2={x1}
        y2={240}
        stroke={shade(floor, -0.12)}
        strokeWidth="1"
      />,
    );
  }
  return (
    <>
      <rect y="-220" width="360" height={FLOOR_Y + 220} fill={wall} />
      <rect y="0" width="360" height="10" fill={shade(wall, -0.12)} />
      <polygon points={`0,${FLOOR_Y} 360,${FLOOR_Y} 360,240 0,240`} fill={floor} />
      {lines}
      {[162, 190, 222].map((y) => (
        <line
          key={y}
          x1="0"
          y1={y}
          x2="360"
          y2={y}
          stroke={shade(floor, -0.08)}
          strokeWidth="0.8"
        />
      ))}
      <rect y={FLOOR_Y - 8} width="360" height="8" fill={trim ?? shade(wall, -0.25)} />
    </>
  );
}

function Window({
  x,
  y,
  w,
  h,
  sky = '#bae6fd',
  night = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  sky?: string;
  night?: boolean;
}) {
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
      <path
        d={`M ${x - 9} ${len + 8} L ${x + 9} ${len + 8} L ${x + 5} ${len} L ${x - 5} ${len} Z`}
        fill="#292524"
      />
      <ellipse cx={x} cy={len + 9} rx="5" ry="2" fill={c} className="room-glow" />
    </g>
  );
}

/** A table seen from the front: its top and a cloth that hides seated legs. */
function Table({
  x,
  y,
  w,
  top = '#a16207',
  cloth,
  items = 'plates',
}: {
  x: number;
  y: number;
  w: number;
  top?: string;
  cloth?: string;
  items?: 'plates' | 'cups' | 'laptops' | 'papers' | 'none';
}) {
  const ty = y - 24;
  return (
    <g>
      <rect x={x - w / 2} y={ty} width={w} height="6" rx="2" fill={top} />
      {cloth ? (
        <path
          d={`M ${x - w / 2} ${ty + 5} L ${x + w / 2} ${ty + 5} L ${x + w / 2 + 3} ${y + 6} L ${x - w / 2 - 3} ${y + 6} Z`}
          fill={cloth}
        />
      ) : (
        <>
          <rect
            x={x - w / 2 + 4}
            y={ty + 6}
            width="5"
            height={y - ty + 2}
            fill={shade(top, -0.25)}
          />
          <rect
            x={x + w / 2 - 9}
            y={ty + 6}
            width="5"
            height={y - ty + 2}
            fill={shade(top, -0.25)}
          />
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

function Counter({
  x,
  y,
  w,
  h = 30,
  c,
  top,
}: {
  x: number;
  y: number;
  w: number;
  h?: number;
  c: string;
  top?: string;
}) {
  return (
    <g>
      <rect x={x} y={y - h} width={w} height={h} fill={c} />
      <rect
        x={x - 3}
        y={y - h - 5}
        width={w + 6}
        height="6"
        rx="1.5"
        fill={top ?? shade(c, -0.3)}
      />
      <rect x={x + 6} y={y - h + 8} width={w - 12} height="2" fill={shade(c, 0.2)} />
    </g>
  );
}

function Shelf({
  x,
  y,
  w,
  rows = 3,
  c = '#92400e',
  goods,
}: {
  x: number;
  y: number;
  w: number;
  rows?: number;
  c?: string;
  goods: string[];
}) {
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
      <path
        d="M -58 -10 Q -58 -24 -40 -26 L -22 -42 Q -10 -48 16 -46 L 34 -30 L 52 -26 Q 60 -24 60 -12 L 60 -6 L -58 -6 Z"
        fill={c}
      />
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
      <rect
        x={x - 10}
        y={y - 8}
        width="20"
        height="10"
        rx="2"
        fill="#fef08a"
        stroke="#ca8a04"
        strokeWidth="0.6"
      />
    </g>
  );
}

function Sign({
  x,
  y,
  w,
  text,
  c,
  fg = '#fff',
}: {
  x: number;
  y: number;
  w: number;
  text: string;
  c: string;
  fg?: string;
}) {
  return (
    <g>
      <rect x={x - w / 2} y={y} width={w} height="18" rx="4" fill={c} />
      <text
        x={x}
        y={y + 12.5}
        textAnchor="middle"
        fontSize="9"
        fontWeight="800"
        fill={fg}
        letterSpacing="0.06em"
      >
        {text}
      </text>
    </g>
  );
}

function Desk({
  x,
  y,
  w = 70,
  monitor = '#0f172a',
}: {
  x: number;
  y: number;
  w?: number;
  monitor?: string;
}) {
  const ty = y - 24;
  return (
    <g>
      <rect x={x - 12} y={ty - 22} width="24" height="16" rx="1.5" fill={monitor} />
      <rect
        x={x - 10}
        y={ty - 20}
        width="20"
        height="12"
        fill="#38bdf8"
        opacity="0.6"
        className="room-screen"
      />
      <rect x={x - 2} y={ty - 6} width="4" height="6" fill="#334155" />
      <rect x={x - w / 2} y={ty} width={w} height="6" fill="#e7e5e4" />
      <rect x={x - w / 2} y={ty + 6} width={w} height={y - ty + 2} fill="#d6d3d1" />
    </g>
  );
}

function Whiteboard({
  x,
  y,
  w = 80,
  h = 50,
  notes = true,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  notes?: boolean;
}) {
  const colors = ['#fde047', '#f9a8d4', '#86efac', '#93c5fd'];
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#fff" stroke="#94a3b8" strokeWidth="2" />
      {notes &&
        Array.from({ length: 8 }, (_, k) => (
          <rect
            key={k}
            x={x + 6 + (k % 4) * (w / 4.4)}
            y={y + 6 + Math.floor(k / 4) * 20}
            width="12"
            height="12"
            fill={colors[k % 4]}
          />
        ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// The apartment (Wave 6 §C2): every home slot has a spot. What you own is
// drawn in its tier's colour; an empty spot is drawn faintly, so you can see
// what's missing. Slots the flat doesn't know yet go on the floor as boxes.

const TIER_COLORS = ['#a8a29e', '#2563eb', '#7c3aed'];
const FAINT = 0.14;

/** Whether a piece is yours, and how good. `basic`: the flat's own (no item). */
type Piece = { tier: number; owned: boolean; basic?: boolean };
type Draw = (c: string, p: Piece) => ReactNode;

/** Drawn behind the people (on the wall and against it). */
const BACK_PIECES: Record<string, Draw> = {
  wardrobe: (c) => (
    <g>
      <rect x={28} y={60} width={32} height={80} rx="2" fill={shade(c, 0.35)} />
      <line x1={44} y1={62} x2={44} y2={138} stroke={shade(c, -0.2)} />
      <circle cx={41} cy={100} r="1.5" fill="#44403c" />
      <circle cx={47} cy={100} r="1.5" fill="#44403c" />
    </g>
  ),
  cooling: (c, p) =>
    p.tier >= 2 ? (
      <g>
        <rect x={66} y={6} width={52} height={15} rx="4" fill="#f8fafc" stroke={c} />
        {[0, 1, 2].map((k) => (
          <line key={k} x1={71} y1={14 + k * 2} x2={113} y2={14 + k * 2} stroke="#cbd5e1" />
        ))}
      </g>
    ) : (
      <g>
        <circle cx={92} cy={13} r={9} fill="none" stroke={c} strokeWidth="2" />
        <path d="M 92 13 l 7 -3 M 92 13 l -3 7 M 92 13 l -3 -7" stroke={c} strokeWidth="3" />
      </g>
    ),
  art: (c) => <Picture x={126} y={30} w={34} h={26} c={c} />,
  power: (c) => (
    <g>
      <rect x={128} y={88} width={20} height={30} rx="2" fill="#e5e7eb" stroke={c} />
      <path d="M 140 92 l -6 11 h 5 l -3 11 l 8 -14 h -5 z" fill={c} />
    </g>
  ),
  plants: (_c, p) => <Plant x={160} y={140} s={0.7 + p.tier * 0.15} />,
  tv: (c) => (
    <g>
      <rect x={172} y={34} width={64} height={40} rx="2" fill="#0f172a" />
      <rect x={175} y={37} width={58} height={34} fill={c} opacity="0.65" className="room-screen" />
      <rect x={182} y={104} width={44} height={36} fill="#57534e" />
    </g>
  ),
  sound: () => (
    <g>
      {[168, 230].map((x) => (
        <g key={x}>
          <rect x={x} y={98} width={10} height={42} rx="2" fill="#1f2937" />
          <circle cx={x + 5} cy={112} r="3" fill="#4b5563" />
          <circle cx={x + 5} cy={126} r="4" fill="#4b5563" />
        </g>
      ))}
    </g>
  ),
  books: (c) => (
    <Shelf
      x={244}
      y={22}
      w={30}
      rows={4}
      c="#78350f"
      goods={[c, '#f59e0b', '#16a34a', '#e11d48']}
    />
  ),
  wifi: (c) => (
    <g>
      <rect x={248} y={12} width={20} height={6} rx="2" fill="#1f2937" />
      <line x1={252} y1={12} x2={250} y2={4} stroke="#1f2937" strokeWidth="1.5" />
      <line x1={264} y1={12} x2={266} y2={4} stroke="#1f2937" strokeWidth="1.5" />
      <circle cx={258} cy={15} r="1.3" fill={c} className="room-light" />
    </g>
  ),
  lights: (c) => <Pendant x={292} len={20} c={c === TIER_COLORS[0] ? '#fbbf24' : c} />,
  kitchen: (c) => (
    <g>
      <rect x={278} y={62} width={26} height={9} rx="2" fill="#d6d3d1" />
      <Counter x={272} y={140} w={38} h={40} c="#e7e5e4" top={c} />
      <circle cx={282} cy={94} r="2.5" fill="#44403c" />
      <circle cx={292} cy={94} r="2.5" fill="#44403c" />
    </g>
  ),
  coffee: (c) => (
    <g>
      <rect x={298} y={80} width={10} height={14} rx="2" fill="#292524" />
      <rect x={300} y={83} width={6} height={3} fill={c} />
      <rect x={301} y={89} width={4} height={4} fill="#fff" />
    </g>
  ),
  washer: (c) => (
    <g>
      <rect x={284} y={112} width={24} height={26} rx="2" fill="#f8fafc" stroke="#cbd5e1" />
      <circle cx={296} cy={126} r={8} fill="#bae6fd" stroke={c} strokeWidth="2" />
    </g>
  ),
  fridge: (c) => (
    <g>
      <rect x={312} y={64} width={22} height={76} rx="3" fill="#f1f5f9" stroke="#cbd5e1" />
      <line x1={312} y1={88} x2={334} y2={88} stroke="#cbd5e1" />
      <rect x={315} y={72} width={2} height={10} fill={c} />
      <rect x={315} y={94} width={2} height={14} fill={c} />
    </g>
  ),
};

/** Drawn in front of the people (on the floor). */
const FRONT_PIECES: Record<string, Draw> = {
  rug: (c) => <ellipse cx={176} cy={222} rx={76} ry={12} fill={c} opacity="0.55" />,
  bed: (c) => (
    <g>
      <rect x={26} y={150} width={7} height={44} rx="2" fill="#78350f" />
      <rect x={28} y={180} width={72} height={14} rx="2" fill="#57534e" />
      <rect x={32} y={168} width={66} height={14} rx="3" fill={c} />
      <rect x={36} y={161} width={18} height={9} rx="3" fill="#fff" />
    </g>
  ),
  dining: (c) => (
    <g>
      <Table x={294} y={196} w={46} top={c === TIER_COLORS[0] ? '#a16207' : c} items="plates" />
      <rect x={262} y={170} width={6} height={28} rx="2" fill="#78350f" />
      <rect x={320} y={170} width={6} height={28} rx="2" fill="#78350f" />
    </g>
  ),
  sofa: (c) => <Sofa x={150} y={204} w={96} c={c} />,
  laptop: (c) => (
    <g>
      <path d="M 138 214 l 4 -12 h 16 l -4 12 Z" fill={c} />
      <rect x={136} y={213} width={20} height={2} fill="#475569" />
    </g>
  ),
  desk: () => <Desk x={68} y={238} w={56} />,
  gaming: (c) => (
    <g>
      <rect x={222} y={224} width={26} height={10} rx="3" fill="#111827" />
      <circle cx={228} cy={229} r="2" fill="#22d3ee" />
      <circle cx={242} cy={229} r="2" fill={c} />
    </g>
  ),
};

const { rug: rugPiece, ...FLOOR } = FRONT_PIECES;
const RUG: Record<string, Draw> = { rug: rugPiece! };

/** Your stuff: slot → tier (the best you own in that slot). */
function piecesOf(items: HomeItemView[] | null): Map<string, Piece> {
  const out = new Map<string, Piece>();
  for (const i of items ?? []) {
    const slot = i.slot.toLowerCase();
    const prev = out.get(slot);
    if (!prev || i.tier > prev.tier) out.set(slot, { tier: i.tier, owned: true });
  }
  // A bare flat still has a bed and an old sofa.
  for (const slot of ['bed', 'sofa'])
    if (!out.has(slot)) out.set(slot, { tier: 1, owned: false, basic: true });
  return out;
}

function Pieces({ draw, mine }: { draw: Record<string, Draw>; mine: Map<string, Piece> }) {
  return (
    <>
      {Object.entries(draw).map(([slot, fn]) => {
        const p = mine.get(slot) ?? { tier: 1, owned: false };
        const c = p.owned ? TIER_COLORS[p.tier - 1]! : '#94a3b8';
        return (
          <g
            key={slot}
            data-furniture={slot}
            data-owned={p.owned ? '1' : '0'}
            opacity={p.owned || p.basic ? 1 : FAINT}
          >
            {fn(c, p)}
          </g>
        );
      })}
    </>
  );
}

function ApartmentBack({ items, car }: { items: HomeItemView[] | null; car: string | null }) {
  const mine = piecesOf(items);
  return (
    <g>
      <Wall wall="#fef3c7" floor="#d6a86b" />
      <Window x={68} y={30} w={50} h={52} />
      {car && (
        <g data-car={car} aria-label={car}>
          <Car x={93} y={80} c="#dc2626" w={40} />
        </g>
      )}
      <Pieces draw={BACK_PIECES} mine={mine} />
    </g>
  );
}

function ApartmentFront({ items }: { items: HomeItemView[] | null }) {
  const mine = piecesOf(items);
  // Anything the flat has no spot for (a slot added later) sits on the floor, boxed.
  const known = new Set([...Object.keys(BACK_PIECES), ...Object.keys(FRONT_PIECES)]);
  const extra = [...mine.entries()].filter(([s, p]) => p.owned && !known.has(s));
  return (
    <g>
      <Pieces draw={RUG} mine={mine} />
      <rect x={128} y={214} width={46} height={14} rx="3" fill="#a16207" />
      <Pieces draw={FLOOR} mine={mine} />
      {extra.map(([slot, p], k) => (
        <g key={slot} data-furniture={slot} data-owned="1">
          <rect
            x={96 + k * 20}
            y={226}
            width={16}
            height={12}
            rx="2"
            fill={TIER_COLORS[p.tier - 1]}
          />
          <rect x={96 + k * 20} y={230} width={16} height={2} fill="#fff" opacity="0.6" />
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Wave 6 rooms: things to do (§A2) and showrooms (§A3).

/** An arcade cabinet. */
function Cabinet({ x, c }: { x: number; c: string }) {
  return (
    <g>
      <rect x={x - 20} y={64} width={40} height={76} rx="3" fill={c} />
      <rect x={x - 20} y={64} width={40} height={10} fill={shade(c, -0.3)} />
      <rect x={x - 15} y={78} width={30} height={22} fill="#22d3ee" className="room-screen" />
      <rect x={x - 18} y={104} width={36} height={6} fill={shade(c, -0.2)} />
      <circle cx={x - 8} cy={107} r="2" fill="#f43f5e" />
      <circle cx={x + 4} cy={107} r="2" fill="#fde047" />
    </g>
  );
}

function Tv({ x, y, w = 62, c }: { x: number; y: number; w?: number; c: string }) {
  const h = Math.round(w * 0.6);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="2" fill="#0f172a" />
      <rect
        x={x + 3}
        y={y + 3}
        width={w - 6}
        height={h - 6}
        fill={c}
        opacity="0.7"
        className="room-screen"
      />
    </g>
  );
}

/** A lounger or day bed seen from the front (hides seated legs). */
function DayBed({ x, w, c }: { x: number; w: number; c: string }) {
  return (
    <g>
      <rect x={x - w / 2} y={196} width={w} height={12} rx="4" fill={c} />
      <rect x={x - w / 2 + 2} y={206} width={w - 4} height={10} fill="#a16207" />
    </g>
  );
}

function newRoomBack(kind: RoomKind, t: string, sign: string | undefined): ReactNode {
  switch (kind) {
    case 'lounge':
      return (
        <g>
          <Wall wall={shade(t, -0.6)} floor="#3f3f46" trim={shade(t, -0.75)} />
          <Window x={18} y={22} w={120} h={70} night />
          <Shelf
            x={252}
            y={30}
            w={96}
            rows={2}
            c="#78350f"
            goods={['#f59e0b', '#a855f7', '#16a34a', '#e5e7eb']}
          />
          <Counter x={248} y={140} w={104} h={32} c="#78350f" top="#451a03" />
          {sign && (
            <text
              x="194"
              y="56"
              textAnchor="middle"
              fontSize="12"
              fontWeight="800"
              fill="#5eead4"
              className="room-neon"
            >
              {sign.split(' ')[0]}
            </text>
          )}
          <Pendant x={170} len={24} c="#f59e0b" />
          <Pendant x={222} len={18} c="#f59e0b" />
          <Plant x={156} y={140} s={1.1} />
        </g>
      );
    case 'karaoke':
      return (
        <g>
          <Wall wall="#3b0764" floor="#1e1b4b" trim="#581c87" />
          <rect x="104" y="18" width="152" height="84" rx="3" fill="#0f172a" />
          <rect
            x="108"
            y="22"
            width="144"
            height="76"
            fill="#7c3aed"
            opacity="0.55"
            className="room-screen"
          />
          {[0, 1, 2].map((k) => (
            <rect
              key={k}
              x={124 + k * 6}
              y={52 + k * 14}
              width={112 - k * 18}
              height="6"
              rx="3"
              fill={k === 0 ? '#fde047' : '#f5f3ff'}
              opacity="0.9"
            />
          ))}
          {[64, 276].map((x) => (
            <g key={x}>
              <rect x={x} y={50} width={20} height={90} rx="3" fill="#111827" />
              <circle cx={x + 10} cy={74} r="6" fill="#374151" />
              <circle cx={x + 10} cy={110} r="8" fill="#374151" />
            </g>
          ))}
          <circle cx="40" cy="20" r="9" fill="#cbd5e1" className="room-ball" />
          {sign && <Sign x={180} y={-40} w={160} text={sign} c="#db2777" />}
        </g>
      );
    case 'arcade':
      return (
        <g>
          <Wall wall="#0f172a" floor="#1e293b" trim="#312e81" />
          <polygon points="236,140 340,140 360,240 214,240" fill="#d97706" />
          <polygon points="236,140 248,140 230,240 214,240" fill="#92400e" />
          <polygon points="328,140 340,140 360,240 346,240" fill="#92400e" />
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <g key={k}>
              <ellipse
                cx={272 + (k % 3) * 12 + (k > 2 ? 6 : 0)}
                cy={k > 2 ? 136 : 140}
                rx="3.5"
                ry="7"
                fill="#fff"
              />
              <rect
                x={269 + (k % 3) * 12 + (k > 2 ? 6 : 0)}
                y={k > 2 ? 131 : 135}
                width="7"
                height="1.6"
                fill="#dc2626"
              />
            </g>
          ))}
          <Cabinet x={52} c="#7c3aed" />
          <Cabinet x={112} c="#db2777" />
          <Cabinet x={172} c="#0891b2" />
          {sign && <Sign x={180} y={22} w={170} text={sign} c="#7c3aed" fg="#fde047" />}
        </g>
      );
    case 'spa':
      return (
        <g>
          <Wall wall="#ecfeff" floor="#d6d3d1" trim="#a5f3fc" />
          <Window x={20} y={26} w={96} h={70} sky="#d9f99d" />
          <Shelf
            x={136}
            y={36}
            w={80}
            rows={2}
            c="#a8a29e"
            goods={['#fff', '#99f6e4', '#fef3c7']}
          />
          <Counter x={262} y={140} w={88} h={34} c="#f5f5f4" top="#14b8a6" />
          {[150, 170, 190].map((x) => (
            <g key={x}>
              <rect x={x} y={124} width="6" height="10" fill="#fef3c7" />
              <ellipse cx={x + 3} cy={121} rx="2" ry="3" fill="#f59e0b" className="room-light" />
            </g>
          ))}
          <Plant x={240} y={140} s={1.2} />
          {sign && <Sign x={306} y={60} w={100} text={sign} c="#0f766e" />}
        </g>
      );
    case 'beach':
      return (
        <g>
          <rect y="-220" width="360" height="310" fill="#7dd3fc" />
          <circle cx="300" cy="22" r="18" fill="#fde047" />
          <rect y="88" width="360" height="52" fill="#0ea5e9" />
          {[0, 1, 2, 3].map((k) => (
            <path
              key={k}
              d={`M ${k * 96} 104 q 12 -6 24 0 t 24 0`}
              stroke="#e0f2fe"
              strokeWidth="2"
              fill="none"
            />
          ))}
          <polygon points="0,140 360,140 360,240 0,240" fill="#fde68a" />
          <g>
            <path d="M 30 140 q 6 -50 -2 -96" stroke="#78350f" strokeWidth="6" fill="none" />
            {[-60, -20, 20, 60].map((r) => (
              <ellipse
                key={r}
                cx="28"
                cy="44"
                rx="26"
                ry="7"
                fill="#16a34a"
                transform={`rotate(${r} 28 44)`}
              />
            ))}
          </g>
          {[80, 170].map((x, k) => (
            <g key={x}>
              <line x1={x + 20} y1={198} x2={x + 20} y2={130} stroke="#57534e" strokeWidth="2" />
              <path
                d={`M ${x - 10} 134 Q ${x + 20} 108 ${x + 50} 134 Z`}
                fill={k ? t : '#f43f5e'}
              />
            </g>
          ))}
          <rect x="284" y="96" width="70" height="44" fill="#a16207" />
          <polygon points="276,100 362,100 344,74 294,74" fill="#ca8a04" />
          {sign && <Sign x={318} y={110} w={70} text={sign.split(' ')[0]!} c="#0369a1" />}
        </g>
      );
    case 'stage':
      return (
        <g>
          <Wall wall="#18181b" floor="#27272a" trim="#3f3f46" />
          <g className="room-beams">
            <polygon points="90,0 110,0 200,126 150,126" fill="#fde047" opacity="0.16" />
            <polygon points="250,0 270,0 210,126 160,126" fill="#f472b6" opacity="0.16" />
          </g>
          <rect x="40" y="122" width="280" height="22" fill="#3f3f46" />
          <rect x="40" y="122" width="280" height="4" fill="#71717a" />
          <rect x="54" y="88" width="30" height="34" rx="2" fill="#111827" />
          <circle cx="69" cy="105" r="9" fill="#374151" />
          <g>
            <ellipse cx="256" cy="112" rx="16" ry="10" fill="#dc2626" />
            <ellipse cx="236" cy="104" rx="8" ry="3" fill="#fde047" />
            <ellipse cx="278" cy="102" rx="8" ry="3" fill="#fde047" />
          </g>
          <line x1="196" y1="124" x2="196" y2="92" stroke="#a1a1aa" strokeWidth="1.5" />
          <circle cx="196" cy="90" r="2.5" fill="#71717a" />
          {sign && <Sign x={180} y={30} w={170} text={sign} c="#be123c" />}
        </g>
      );
    case 'pitch':
      return (
        <g>
          <rect y="-220" width="360" height="360" fill="#1e3a8a" />
          {Array.from({ length: 19 }, (_, k) => (
            <line key={k} x1={k * 20} y1="40" x2={k * 20} y2="140" stroke="#64748b" />
          ))}
          <line x1="0" y1="40" x2="360" y2="40" stroke="#94a3b8" strokeWidth="2" />
          {[24, 336].map((x) => (
            <g key={x}>
              <rect x={x - 2} y="-30" width="4" height="170" fill="#cbd5e1" />
              <rect x={x - 14} y="-40" width="28" height="12" rx="2" fill="#f8fafc" />
              <rect
                x={x - 12}
                y="-38"
                width="24"
                height="8"
                fill="#fef9c3"
                className="room-light"
              />
            </g>
          ))}
          <polygon points="0,140 360,140 360,240 0,240" fill="#16a34a" />
          {[0, 1, 2, 3].map((k) => (
            <polygon
              key={k}
              points={`${k * 90},140 ${k * 90 + 45},140 ${k * 120 - 30},240 ${k * 120 - 90},240`}
              fill="#15803d"
              opacity="0.5"
            />
          ))}
          <rect x="132" y="96" width="96" height="44" fill="none" stroke="#fff" strokeWidth="4" />
          {Array.from({ length: 6 }, (_, k) => (
            <line
              key={k}
              x1={140 + k * 16}
              y1="98"
              x2={140 + k * 16}
              y2="140"
              stroke="#e2e8f0"
              opacity="0.6"
            />
          ))}
          <path d="M 40 186 Q 180 172 320 186" stroke="#fff" strokeWidth="2" fill="none" />
          {sign && <Sign x={180} y={56} w={150} text={sign} c="#14532d" />}
        </g>
      );
    case 'appliance':
      return (
        <g>
          <Wall wall="#f8fafc" floor="#cbd5e1" />
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <Tv
              key={k}
              x={16 + (k % 3) * 80}
              y={16 + Math.floor(k / 3) * 50}
              w={k % 3 === 1 ? 72 : 62}
              c={['#38bdf8', '#a855f7', '#f97316', '#22c55e', t, '#e11d48'][k]!}
            />
          ))}
          <rect x="262" y="58" width="32" height="82" rx="3" fill="#f1f5f9" stroke="#94a3b8" />
          <line x1="262" y1="86" x2="294" y2="86" stroke="#94a3b8" />
          <rect x="304" y="100" width="44" height="40" rx="3" fill="#fff" stroke="#94a3b8" />
          <circle cx="326" cy="122" r="12" fill="#bae6fd" stroke="#64748b" strokeWidth="2" />
          {sign && <Sign x={130} y={116} w={150} text={sign} c={t} />}
        </g>
      );
    default:
      return null;
  }
}

function newRoomFront(kind: RoomKind, t: string): ReactNode {
  switch (kind) {
    case 'lounge':
      return (
        <g>
          <Sofa x={98} y={214} w={108} c={t} />
          <Sofa x={232} y={222} w={92} c={shade(t, -0.25)} />
          <rect x={150} y={222} width={34} height={12} rx="3" fill="#292524" />
          <g>
            <path d="M 168 222 q -6 -10 0 -16 q 6 6 0 16 Z" fill="#14b8a6" />
            <line x1="168" y1="206" x2="168" y2="194" stroke="#a8a29e" strokeWidth="1.5" />
          </g>
        </g>
      );
    case 'karaoke':
      return (
        <g>
          <Sofa x={120} y={226} w={110} c="#db2777" />
          <Sofa x={240} y={226} w={110} c="#7c3aed" />
          <line x1="150" y1="176" x2="150" y2="150" stroke="#9ca3af" strokeWidth="2" />
        </g>
      );
    case 'arcade':
      return <circle cx="300" cy="226" r="9" fill="#1d4ed8" stroke="#1e3a8a" strokeWidth="2" />;
    case 'spa':
      return (
        <g>
          {[110, 194].map((x) => (
            <g key={x}>
              <rect x={x - 36} y={196} width={72} height={10} rx="4" fill="#fff" />
              <rect x={x - 36} y={202} width={72} height={6} fill="#99f6e4" />
              <rect x={x - 30} y={208} width={5} height={20} fill="#a8a29e" />
              <rect x={x + 25} y={208} width={5} height={20} fill="#a8a29e" />
            </g>
          ))}
        </g>
      );
    case 'beach':
      return (
        <g>
          <DayBed x={98} w={64} c="#f8fafc" />
          <DayBed x={186} w={64} c={shade(t, 0.5)} />
          <circle cx="300" cy="230" r="7" fill="#f97316" />
        </g>
      );
    case 'stage':
      return (
        <g>
          {[0, 1, 2, 3].map((k) => (
            <rect
              key={k}
              x={60 + k * 70}
              y="146"
              width="14"
              height="6"
              rx="2"
              fill={['#fde047', '#f472b6', '#22d3ee', '#a3e635'][k]}
              className={`room-light room-light-${k % 3}`}
            />
          ))}
        </g>
      );
    case 'pitch':
      return <circle cx="204" cy="224" r="6" fill="#fff" stroke="#0f172a" strokeWidth="1.5" />;
    case 'appliance':
      return (
        <g>
          <Table x={160} y={232} w={110} top="#e2e8f0" items="laptops" />
          <PriceTag x={130} y={184} />
          <PriceTag x={276} y={150} />
        </g>
      );
    default:
      return null;
  }
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
  /** Your car, parked outside the flat's window (its name). */
  car?: string | null;
}

export function RoomBack({ kind, tint, sign, home = null, car = null }: RoomArtProps) {
  const fresh = newRoomBack(kind, tint, sign);
  if (fresh) return fresh;
  const t = tint;
  switch (kind) {
    case 'restaurant':
      return (
        <g>
          <Wall wall={shade(t, 0.75)} floor="#b45309" />
          <rect x="222" y="40" width="130" height="58" fill="#44403c" />
          <rect x="228" y="46" width="118" height="46" fill="#fbbf24" opacity="0.35" />
          <g className="room-steam">
            <path
              d="M 258 60 q 6 -8 0 -16 q -6 -8 0 -16"
              stroke="#fff"
              strokeWidth="2"
              fill="none"
              opacity="0.7"
            />
            <path
              d="M 300 60 q 6 -8 0 -16 q -6 -8 0 -16"
              stroke="#fff"
              strokeWidth="2"
              fill="none"
              opacity="0.7"
            />
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
            <rect
              key={k}
              x={30}
              y={30 + k * 11}
              width={70 - k * 12}
              height="4"
              fill="#fef3c7"
              opacity="0.8"
            />
          ))}
          <Counter x={30} y={140} w={140} h={38} c={shade(t, -0.2)} />
          <g>
            <rect x="120" y="76" width="34" height="26" rx="3" fill="#a8a29e" />
            <rect x="126" y="82" width="22" height="8" fill="#57534e" />
            <rect x="132" y="92" width="4" height="8" fill="#292524" />
            <path
              d="M 134 74 q 4 -6 0 -12"
              stroke="#fff"
              strokeWidth="1.5"
              fill="none"
              className="room-steam"
            />
          </g>
          <Shelf
            x={190}
            y={30}
            w={84}
            rows={2}
            goods={['#fef3c7', '#fde68a', '#d6d3d1', '#a8a29e']}
          />
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
            <rect
              key={k}
              x={20 + k * 56}
              y="44"
              width="14"
              height="40"
              rx="3"
              fill={['#f472b6', '#22d3ee', '#a3e635', '#fbbf24'][k % 4]}
              opacity="0.5"
              className={`room-light room-light-${k % 3}`}
            />
          ))}
          {sign && <Sign x={180} y={-46} w={180} text={sign} c="#7c3aed" />}
        </g>
      );
    case 'bar':
      return (
        <g>
          <Wall wall={shade(t, -0.55)} floor="#44403c" trim={shade(t, -0.7)} />
          <Shelf
            x={40}
            y={26}
            w={230}
            rows={3}
            c="#78350f"
            goods={['#16a34a', '#b45309', '#e11d48', '#eab308', '#a855f7', '#e5e7eb']}
          />
          <Counter x={30} y={140} w={240} h={32} c="#78350f" top="#451a03" />
          {sign && (
            <text
              x="310"
              y="58"
              textAnchor="middle"
              fontSize="13"
              fontWeight="800"
              fill="#f472b6"
              className="room-neon"
            >
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
          <rect
            x="40"
            y="16"
            width="250"
            height="100"
            fill={t}
            opacity="0.35"
            className="room-movie"
          />
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
          <rect
            x="20"
            y="20"
            width="160"
            height="96"
            fill="#cbd5e1"
            opacity="0.6"
            stroke="#94a3b8"
          />
          <rect x="196" y="76" width="90" height="8" fill="#475569" />
          {[204, 222, 240, 258, 276].map((x, k) => (
            <rect
              key={x}
              x={x}
              y={62 - k * 2}
              width="8"
              height={14 + k * 2}
              rx="2"
              fill="#0f172a"
            />
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
          <Wall
            wall={kind === 'hub' ? '#ecfccb' : kind === 'office' ? shade(t, 0.82) : '#f1f5f9'}
            floor="#a8a29e"
          />
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
            <rect
              key={x}
              x={x - 30}
              y="56"
              width="60"
              height="40"
              fill="#bae6fd"
              opacity="0.4"
              stroke="#94a3b8"
            />
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
          <rect
            x="54"
            y="72"
            width="112"
            height="22"
            fill="#a855f7"
            opacity="0.6"
            className="room-screen"
          />
          <rect x="30" y="110" width="160" height="30" fill="#4c1d95" />
          <Whiteboard x={220} y={26} w={110} h={56} />
          {sign && <Sign x={275} y={96} w={110} text={sign} c="#7e22ce" />}
        </g>
      );
    case 'devpartner':
      return (
        <g>
          <Wall wall="#ecfeff" floor="#a8a29e" />
          <rect
            x="24"
            y="22"
            width="130"
            height="80"
            fill="#e0f2fe"
            stroke="#0e7490"
            strokeWidth="2"
          />
          <path
            d="M 40 60 q 20 -26 40 -6 q 14 10 30 -10 q 14 -8 30 10 l 0 30 l -100 0 Z"
            fill="#86efac"
          />
          {[60, 90, 120].map((x) => (
            <circle key={x} cx={x} cy={56 + (x % 3) * 6} r="3" fill="#dc2626" />
          ))}
          {['#0ea5e9', '#16a34a', '#f59e0b'].map((c, k) => (
            <g key={c}>
              <line
                x1={200 + k * 40}
                y1="30"
                x2={200 + k * 40}
                y2="130"
                stroke="#78716c"
                strokeWidth="2"
              />
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
          <Shelf
            x={20}
            y={26}
            w={110}
            rows={4}
            c="#78350f"
            goods={['#f97316', '#a3e635', '#e5e7eb', '#a855f7']}
          />
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
      return <ApartmentBack items={home} car={car} />;
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
          <rect y="-220" width="360" height="360" fill="#bae6fd" />
          <polygon points="0,140 360,140 360,240 0,240" fill="#d6b88f" />
          {[60, 180, 300].map((x, k) => (
            <g key={x}>
              <rect
                x={x - 52}
                y="40"
                width="104"
                height="100"
                fill={['#fef3c7', '#fee2e2', '#dcfce7'][k]}
              />
              <path
                d={`M ${x - 58} 40 L ${x + 58} 40 L ${x + 52} 22 L ${x - 52} 22 Z`}
                fill={['#ea580c', '#dc2626', '#16a34a'][k]}
              />
              {[0, 1, 2, 3, 4].map((s) => (
                <rect
                  key={s}
                  x={x - 52 + s * 22}
                  y="40"
                  width="11"
                  height="8"
                  fill="#fff"
                  opacity="0.6"
                />
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
            <polygon
              key={k}
              points={`${30 + k * 42},6 ${50 + k * 42},6 ${40 + k * 42},16`}
              fill={['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6'][k % 4]}
            />
          ))}
        </g>
      );
    case 'airport':
      return (
        <g>
          <Wall wall="#e2e8f0" floor="#cbd5e1" />
          <rect
            x="10"
            y="10"
            width="190"
            height="104"
            fill="#bae6fd"
            stroke="#94a3b8"
            strokeWidth="3"
          />
          <g className="room-plane">
            <path
              d="M 40 70 L 150 64 Q 162 64 162 70 Q 162 76 150 76 L 40 76 Z"
              fill="#f8fafc"
              stroke="#64748b"
            />
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
          <rect
            x="100"
            y="24"
            width="200"
            height="80"
            fill="#14532d"
            stroke="#a16207"
            strokeWidth="4"
          />
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
          <Shelf
            x={190}
            y={30}
            w={140}
            rows={3}
            c="#44403c"
            goods={['#f59e0b', '#0ea5e9', '#78716c']}
          />
          {sign && <Sign x={260} y={100} w={130} text={sign} c={t} />}
        </g>
      );
    case 'shop':
    default:
      return (
        <g>
          <Wall wall={shade(t, 0.82)} floor="#a8a29e" />
          <Shelf
            x={20}
            y={24}
            w={140}
            rows={4}
            goods={[t, '#f59e0b', '#22c55e', '#e5e7eb', '#3b82f6']}
          />
          <Shelf x={190} y={24} w={90} rows={3} goods={['#f43f5e', t, '#a855f7']} />
          <Counter x={210} y={140} w={130} h={34} c={shade(t, -0.2)} />
          {sign && <Sign x={290} y={94} w={110} text={sign} c={shade(t, -0.35)} />}
        </g>
      );
  }
}

export function RoomFront({ kind, tint, home = null }: RoomArtProps) {
  const fresh = newRoomFront(kind, tint);
  if (fresh) return fresh;
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
            <rect
              key={k}
              x={60 + k * 40}
              y="232"
              width="38"
              height="8"
              fill={['#f472b6', '#22d3ee', '#a3e635'][k % 3]}
              opacity="0.35"
              className={`room-light room-light-${k % 3}`}
            />
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
                <circle
                  key={s}
                  cx={x - 44 + s * 17}
                  cy="148"
                  r="6"
                  fill={
                    [
                      ['#f97316', '#facc15'],
                      ['#dc2626', '#f87171'],
                      ['#16a34a', '#84cc16'],
                    ][k]![s % 2]
                  }
                />
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
          <rect
            x="98"
            y="200"
            width="10"
            height="8"
            rx="2"
            fill="none"
            stroke="#0369a1"
            strokeWidth="2"
          />
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
