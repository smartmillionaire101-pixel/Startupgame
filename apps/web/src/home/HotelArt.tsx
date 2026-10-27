/**
 * Your hotel room in Lite (no 3D): the flat room scene's back wall and
 * foreground, drawn by tier like the 3D rooms (./hotel.ts) so the price
 * steps read here too. A pod's single bed in its alcove and a locker; a
 * budget room's small window, double bed, desk and
 * rail; a business room's king bed, work desk with an ergonomic chair,
 * armchair, TV console and tea tray; a suite's glass wall onto the balcony
 * and the skyline, the sofa set on a rug, the TV wall, the dining table
 * under a pendant, the bar and, through a doorway, the bedroom.
 *
 * Only your room: the neighbours' rooms are never drawn. Coordinates are the
 * room scene's (viewBox 0 −80 360 320, the floor from y = 140).
 */
import type { ReactNode } from 'react';
import type { HotelTier } from '../city/travel';
import { hotelContents } from './hotel';

const FLOOR = 140;

function Shell({ wall, floor, line }: { wall: string; floor: string; line: string }) {
  const lines: ReactNode[] = [];
  for (let k = -4; k <= 4; k++)
    lines.push(
      <line
        key={k}
        x1={180 + k * 44}
        y1={FLOOR}
        x2={180 + k * 88}
        y2={240}
        stroke={line}
        strokeWidth="1"
      />,
    );
  return (
    <g>
      <rect x="0" y="-80" width="360" height={FLOOR + 80} fill={wall} />
      <rect x="0" y={FLOOR} width="360" height={100} fill={floor} />
      {lines}
      <rect x="0" y={FLOOR - 4} width="360" height="4" fill="#00000022" />
    </g>
  );
}

/** A window: sky (or night), the city beyond, curtains either side. */
function Win({
  x,
  y,
  w,
  h,
  night,
  drape,
  mullions = 1,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  night: boolean;
  drape: string;
  mullions?: number;
}) {
  const sky = night ? '#1e2a4a' : '#bfe3f5';
  const towers = [0.05, 0.2, 0.36, 0.52, 0.68, 0.84].map((f, i) => ({
    x: x + f * w,
    hgt: h * (0.25 + ((i * 37) % 5) * 0.08),
  }));
  return (
    <g>
      <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} fill="#25272c" />
      <rect x={x} y={y} width={w} height={h} fill={sky} />
      {towers.map((t, i) => (
        <rect
          key={i}
          x={t.x}
          y={y + h - t.hgt}
          width={w * 0.12}
          height={t.hgt}
          fill={night ? '#2c3a5e' : '#8fb3c9'}
        />
      ))}
      {night &&
        towers.map((t, i) => (
          <rect
            key={`l${i}`}
            x={t.x + 2}
            y={y + h - t.hgt + 4}
            width={3}
            height={3}
            fill="#fde68a"
          />
        ))}
      {Array.from({ length: mullions }, (_, i) => (
        <rect
          key={`m${i}`}
          x={x + ((i + 1) * w) / (mullions + 1) - 1}
          y={y}
          width="2"
          height={h}
          fill="#25272c"
        />
      ))}
      <rect x={x - 14} y={y - 8} width="14" height={h + 16} rx="3" fill={drape} />
      <rect x={x + w} y={y - 8} width="14" height={h + 16} rx="3" fill={drape} />
    </g>
  );
}

function Art({
  x,
  y,
  w,
  h,
  c,
  frame = '#2a2a2e',
}: Record<'x' | 'y' | 'w' | 'h', number> & {
  c: string;
  frame?: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={frame} />
      <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="#f5efe4" />
      <circle cx={x + w * 0.4} cy={y + h * 0.45} r={Math.min(w, h) * 0.2} fill={c} />
      <rect x={x + w * 0.55} y={y + h * 0.3} width={w * 0.25} height={h * 0.45} fill="#1e3a5f" />
    </g>
  );
}

function Lamp({ x, y, glow }: { x: number; y: number; glow: boolean }) {
  return (
    <g>
      {glow && <circle cx={x} cy={y + 6} r="22" fill="#fde68a" opacity="0.25" />}
      <path
        d={`M ${x - 9} ${y + 12} L ${x + 9} ${y + 12} L ${x + 6} ${y} L ${x - 6} ${y} Z`}
        fill="#fff1d6"
      />
    </g>
  );
}

function Plant({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g>
      <rect x={x - 8 * s} y={y - 14 * s} width={16 * s} height={14 * s} rx="2" fill="#e7e2d8" />
      <circle cx={x} cy={y - 26 * s} r={12 * s} fill="#3f7d45" />
      <circle cx={x - 8 * s} cy={y - 34 * s} r={8 * s} fill="#4d9a52" />
      <circle cx={x + 7 * s} cy={y - 36 * s} r={9 * s} fill="#2f6b3a" />
    </g>
  );
}

/** The back of the room: walls, windows, the big things against them. */
export function HotelBack({
  tier,
  night,
  pod = false,
}: {
  tier: HotelTier | null;
  night: boolean;
  /** A one-star hotel's pod: a single bed in its alcove, a locker, the bathroom shared. */
  pod?: boolean;
}) {
  const t = tier ?? 'budget';
  const isPod = pod && t === 'budget';
  return (
    <g data-hotel-art={isPod ? 'pod' : t} data-furniture={hotelContents(t, isPod).join(' ')}>
      {isPod && (
        <g>
          <Shell wall="#e3e7e4" floor="#cfc6b6" line="#b8ad9b" />
          <Win x={230} y={14} w={50} h={46} night={night} drape="#9fb3c8" />
          {/* The shared bathroom's sign by the door. */}
          <rect x="300" y="38" width="52" height="102" fill="#cbd5e1" />
          <rect x="306" y="54" width="40" height="16" rx="3" fill="#f8fafc" />
          <rect x="318" y="58" width="16" height="8" rx="2" fill="#64748b" />
          {/* The pod: a single bed in its alcove, a reading light, a curtain. */}
          <rect x="40" y="62" width="150" height="78" rx="10" fill="#d9d3c7" />
          <rect x="46" y="68" width="138" height="66" rx="8" fill="#efeae0" />
          <rect x="52" y="106" width="126" height="28" rx="4" fill="#f4f1ea" />
          <rect x="52" y="116" width="126" height="18" fill="#8aa2b8" />
          <rect x="58" y="100" width="34" height="12" rx="5" fill="#fff" />
          <circle cx="170" cy="78" r="5" fill="#fde68a" opacity={night ? 0.95 : 0.6} />
          <rect x="40" y="62" width="14" height="78" rx="4" fill="#9fb3c8" opacity="0.85" />
          {/* Your locker. */}
          <rect x="206" y="80" width="40" height="60" rx="3" fill="#94a3b8" />
          <rect x="210" y="86" width="32" height="24" rx="2" fill="#a8b5c6" />
          <rect x="210" y="112" width="32" height="24" rx="2" fill="#a8b5c6" />
          <rect x="236" y="96" width="3" height="6" fill="#475569" />
        </g>
      )}
      {t === 'budget' && !isPod && (
        <g>
          <Shell wall="#e3e7e4" floor="#d9c3a2" line="#c4ad8b" />
          <Win x={200} y={10} w={70} h={64} night={night} drape="#9fb3c8" />
          {/* The shower room's door, ajar, white tiles behind it. */}
          <rect x="300" y="38" width="52" height="102" fill="#d4f1f8" />
          <rect x="300" y="38" width="16" height="102" fill="#f8fafc" />
          <rect x="318" y="60" width="26" height="40" fill="#bfe3f0" opacity="0.6" />
          {/* A clothes rail in its niche. */}
          <rect x="10" y="40" width="44" height="2" fill="#9ca3af" />
          {['#64748b', '#e5e7eb', '#1e3a5f'].map((c, i) => (
            <rect key={c} x={14 + i * 13} y="42" width="10" height="38" rx="2" fill={c} />
          ))}
          {/* The bed: a plain double, a grey blanket. */}
          <rect x="70" y="92" width="120" height="14" rx="3" fill="#8b8f96" />
          <rect x="70" y="104" width="120" height="36" rx="4" fill="#f4f1ea" />
          <rect x="70" y="116" width="120" height="24" fill="#8aa2b8" />
          <rect x="80" y="98" width="40" height="12" rx="5" fill="#fff" />
          <rect x="132" y="98" width="40" height="12" rx="5" fill="#fff" />
          {/* A small desk and TV. */}
          <rect x="210" y="104" width="60" height="6" fill="#c99a66" />
          <rect x="214" y="110" width="4" height="30" fill="#c99a66" />
          <rect x="262" y="110" width="4" height="30" fill="#c99a66" />
          <rect x="222" y="82" width="36" height="22" fill="#1d1d22" />
        </g>
      )}
      {t === 'business' && (
        <g>
          <Shell wall="#c9d3dd" floor="#b0825a" line="#946a46" />
          <rect x="0" y="122" width="360" height="18" fill="#4b6279" opacity="0.18" />
          <Win x={216} y={-6} w={110} h={88} night={night} drape="#d8cfc0" mullions={2} />
          <Art x={70} y={20} w={80} h={46} c="#c2410c" />
          {/* The king bed: an upholstered headboard, a bench at its foot. */}
          <rect x="44" y="76" width="132" height="34" rx="4" fill="#5b3a22" />
          <rect x="46" y="100" width="128" height="40" rx="4" fill="#f8f6f1" />
          <rect x="46" y="114" width="128" height="26" fill="#4f6db8" />
          <rect x="46" y="112" width="128" height="5" fill="#3e5795" />
          {[56, 98, 136].map((x) => (
            <rect key={x} x={x} y="92" width="30" height="13" rx="5" fill="#fff" />
          ))}
          {/* Bedside lamps. */}
          <rect x="22" y="112" width="20" height="28" fill="#9a6a3f" />
          <rect x="178" y="112" width="20" height="28" fill="#9a6a3f" />
          <Lamp x={32} y={98} glow={night} />
          <Lamp x={188} y={98} glow={night} />
          {/* The armchair by the window, its side table. */}
          <rect x="232" y="102" width="40" height="38" rx="6" fill="#4a6a8a" />
          <rect x="236" y="92" width="32" height="20" rx="5" fill="#557799" />
          <rect x="282" y="116" width="22" height="3" fill="#f1ece4" />
          <rect x="292" y="119" width="3" height="21" fill="#c9a35a" />
          <Lamp x={293} y={102} glow={night} />
          <Plant x={334} y={140} s={0.9} />
        </g>
      )}
      {t === 'luxury' && (
        <g>
          <Shell wall="#e9dccb" floor="#6b4329" line="#55341f" />
          {/* A walnut-panelled wall, the glass wall onto the balcony. */}
          <rect x="0" y="-80" width="70" height="220" fill="#5a3a24" />
          {[14, 28, 42, 56].map((x) => (
            <rect key={x} x={x} y="-80" width="1.5" height="220" fill="#3f2818" />
          ))}
          <Win x={150} y={-40} w={190} h={150} night={night} drape="#b9935f" mullions={3} />
          <rect x="150" y="96" width="190" height="14" fill="#bfe3f0" opacity="0.45" />
          <rect x="150" y="96" width="190" height="2" fill="#d9dde3" />
          {/* The TV on the walnut wall. */}
          <rect x="8" y="30" width="56" height="34" fill="#1d1d22" />
          <rect x="4" y="104" width="64" height="16" fill="#2a211b" />
          <rect x="4" y="104" width="64" height="2" fill="#c9a35a" />
          {/* Through a doorway: the bedroom, the king bed, a bedside lamp. */}
          <rect x="84" y="20" width="56" height="120" fill="#7a5d48" />
          <rect x="88" y="26" width="48" height="114" fill="#d9c7ad" />
          <rect x="92" y="96" width="40" height="18" fill="#8a6d55" />
          <rect x="92" y="110" width="40" height="18" fill="#f8f6f1" />
          <rect x="92" y="120" width="40" height="8" fill="#6b3f2a" />
          <Lamp x={128} y={86} glow={night} />
          <Art x={94} y={40} w={36} h={26} c="#b45309" frame="#c9a35a" />
          <Plant x={344} y={140} s={1.1} />
          {/* The bar: bottles on a brass shelf over a marble counter. */}
          <rect x="150" y="70" width="40" height="2" fill="#c9a35a" />
          {['#14532d', '#7c2d12', '#1e3a8a', '#a16207'].map((c, i) => (
            <rect key={c} x={153 + i * 9} y="58" width="5" height="12" rx="1" fill={c} />
          ))}
        </g>
      )}
    </g>
  );
}

/** The front of the room: what stands in front of the people. */
export function HotelFront({
  tier,
  night,
  pod = false,
}: {
  tier: HotelTier | null;
  night: boolean;
  pod?: boolean;
}) {
  const t = tier ?? 'budget';
  if (t === 'budget' && pod)
    return (
      <g data-hotel-front="pod">
        {/* Your suitcase by the pod (no desk, no chair). */}
        <rect x="270" y="198" width="26" height="36" rx="4" fill="#1e3a5f" />
        <rect x="278" y="192" width="10" height="6" rx="2" fill="#16161a" />
      </g>
    );
  if (t === 'budget')
    return (
      <g>
        {/* Your suitcase, a plain chair. */}
        <rect x="290" y="198" width="26" height="36" rx="4" fill="#1e3a5f" />
        <rect x="298" y="192" width="10" height="6" rx="2" fill="#16161a" />
        <rect x="216" y="196" width="30" height="6" fill="#9a6a3f" />
        <rect x="218" y="202" width="4" height="26" fill="#9a6a3f" />
        <rect x="240" y="202" width="4" height="26" fill="#9a6a3f" />
      </g>
    );
  if (t === 'business')
    return (
      <g>
        {/* The bench at the bed's foot, the work desk and its ergonomic chair, the tea tray. */}
        <rect x="70" y="160" width="90" height="12" rx="4" fill="#3f5872" />
        <rect x="200" y="182" width="90" height="6" fill="#5a3a24" />
        <rect x="204" y="188" width="4" height="40" fill="#1d1d22" />
        <rect x="282" y="188" width="4" height="40" fill="#1d1d22" />
        <rect x="230" y="198" width="34" height="8" rx="3" fill="#2b2f36" />
        <rect x="232" y="176" width="30" height="24" rx="5" fill="#3a3f47" />
        <rect x="245" y="206" width="4" height="20" fill="#d9dde3" />
        <rect x="20" y="200" width="56" height="34" fill="#5a3a24" />
        <rect x="26" y="192" width="14" height="8" rx="2" fill="#d9dde3" />
        <rect x="46" y="194" width="8" height="6" rx="2" fill="#f8f6f1" />
        <rect x="290" y="198" width="26" height="36" rx="4" fill="#1e3a5f" />
      </g>
    );
  return (
    <g>
      {/* The rug, the sofa and the coffee table; the dining table under its pendant. */}
      <ellipse cx="150" cy="214" rx="120" ry="20" fill="#8b2c3a" opacity="0.85" />
      <ellipse cx="150" cy="214" rx="104" ry="15" fill="none" stroke="#c9a24a" strokeWidth="2" />
      <rect x="100" y="198" width="100" height="10" rx="3" fill="#f1ece4" />
      <rect x="140" y="190" width="12" height="8" rx="2" fill="#f9a8d4" />
      <rect x="40" y="176" width="44" height="40" rx="6" fill="#a8846a" />
      <rect x="44" y="166" width="36" height="16" rx="5" fill="#b8957b" />
      <line x1="300" y1="80" x2="300" y2="148" stroke="#1d1d22" strokeWidth="1.5" />
      {night && <circle cx="300" cy="156" r="30" fill="#fde68a" opacity="0.25" />}
      <path d="M 286 160 L 314 160 L 308 148 L 292 148 Z" fill="#c9a35a" />
      <rect x="262" y="186" width="76" height="8" rx="2" fill="#5a3a24" />
      <rect x="268" y="194" width="4" height="34" fill="#2a211b" />
      <rect x="328" y="194" width="4" height="34" fill="#2a211b" />
      {[258, 336].map((x) => (
        <rect key={x} x={x - 6} y="176" width="12" height="40" rx="3" fill="#efe7da" />
      ))}
    </g>
  );
}
