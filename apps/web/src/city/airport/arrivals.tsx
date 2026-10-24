/**
 * Arrivals (player feedback: "when I arrive by flight I see just a page with
 * the name of the airport; why can't it be like a live airport?"). Landing
 * opens the city's arrivals hall, alive:
 *
 * - the terminal's sign with the airport's name, big, and the local time;
 * - an arrivals board of flights that just landed, yours highlighted with
 *   where it came from and its baggage belt;
 * - the hall itself, in three short steps you can tap through or skip:
 *   passport control (booths, a queue, your passport stamped), baggage
 *   reclaim (the carousel turning, your suitcase coming round) and the
 *   arrivals hall (drivers holding name signs at the barrier, one for you
 *   from your hotel; a café, a SIM-card kiosk, the taxi rank). Travellers
 *   walk through pulling their bags, light falls through the glass and a
 *   plane taxis past the windows.
 *
 * The way on (your hotel or home, four places worth seeing, or stay in the
 * airport) stays in the sheet under the scene the whole time. Everything is
 * one SVG per step, moved by CSS; still with reduced motion or in Lite.
 * Presentation only: no engine commands.
 */
import { defaultAppearance, seedGender, type MarketId } from '@runway/engine';
import { useMemo, useState, type ReactNode } from 'react';
import { t } from '../../i18n';
import { useView } from '../../store';
import { useQuality } from '../../three-kit/quality';
import { AvatarFigure, lookFromAppearance, type AvatarLook } from '../art';
import { hash } from '../contract';
import { HOTEL_STARS } from '../HotelPicker';
import { reduceMotion } from '../ride/state';
import { lastFlight } from '../ticket';
import { arrivalParty, firstOf, namesOf, type Traveller } from '../companions';
import {
  AIRPORT_NAMES,
  airportSchedule,
  CITY_NAMES,
  flightStatus,
  liveryOf,
  localMinutes,
  nextFlightTo,
  scheduleDay,
  stayHotelIn,
  stayOf,
  type FlightStatus,
} from '../travel';
import { Flaps } from './flaps';
import { PlaneSide } from './planes';
import './arrivals.css';

/** Just landed (player feedback: you arrive in the airport, then go to your hotel). */
export interface Arrival {
  /** Landed in your home city: "Go home" rather than "Go to your hotel". */
  home: boolean;
  /** Leave the airport for a place in the city (walk or ride there). */
  onGo: (where: 'home' | 'office' | 'market' | 'hub' | 'bank') => void;
  /** Stay in the terminal (the usual trip sheet). */
  onStay: () => void;
}

type ArrStep = 'passport' | 'baggage' | 'hall';
const ARR_STEPS: ArrStep[] = ['passport', 'baggage', 'hall'];
const ARR_LABEL = (s: ArrStep) =>
  s === 'passport' ? t('Passport') : s === 'baggage' ? t('Baggage') : t('Exit');

const hhmm = (m: number) => {
  const v = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};

const STATUS = (s: FlightStatus) =>
  s === 'Landed' ? t('Landed') : s === 'Delayed' ? t('Delayed') : t('On time');

/** Bag colours, and the cities travellers come from as well as this one. */
const BAGS = [
  '#0ea5e9',
  '#ef4444',
  '#8b5cf6',
  '#10b981',
  '#f97316',
  '#1e293b',
  '#eab308',
  '#ec4899',
];
const CITIES: MarketId[] = [
  'lagos',
  'nairobi',
  'london',
  'accra',
  'johannesburg',
  'cairo',
  'dubai',
  'san-francisco',
];

/** A traveller: mostly people from this city, some from everywhere the flights come from. */
function travellerLook(seed: string, city: string): AvatarLook {
  const h = hash(seed);
  const from = (h % 10 < 6 ? city : CITIES[h % CITIES.length]!) as MarketId;
  const g = seedGender(seed);
  const a = defaultAppearance(seed, g, from);
  return lookFromAppearance(a, g, ['#1e293b', '#111827', '#334155', '#78350f', '#1e3a8a'][h % 5]!);
}

/** An officer, a barista, a driver: their uniform over a local face. */
function staffLook(seed: string, city: string, top: string): AvatarLook {
  const g = seedGender(seed);
  const a = defaultAppearance(seed, g, city as MarketId);
  return lookFromAppearance({ ...a, topColor: top, topStyle: 'blazer' }, g, '#111827');
}

// ---------------------------------------------------------------------------
// Pieces of the hall

function Person({
  look,
  x,
  y,
  s,
  walking,
  flip,
}: {
  look: AvatarLook;
  x: number;
  y: number;
  s: number;
  walking?: boolean;
  flip?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <g className={`city-person${walking ? ' is-walking' : ''}`}>
        <AvatarFigure look={look} />
      </g>
    </g>
  );
}

/** A suitcase standing on its wheels at (x, y), `h` tall. */
function Case({
  x,
  y,
  c,
  h = 18,
  mine,
}: {
  x: number;
  y: number;
  c: string;
  h?: number;
  mine?: boolean;
}) {
  const w = h * 0.72;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h} width={w} height={h} rx="2.6" fill={c} />
      <rect x={-w / 2} y={-h} width={w * 0.28} height={h} rx="2" fill="#fff" opacity="0.16" />
      <rect
        x={-w * 0.22}
        y={-h - 4}
        width={w * 0.44}
        height="4.6"
        rx="1.6"
        fill="none"
        stroke="#334155"
        strokeWidth="1.4"
      />
      <path d={`M ${-w / 2} ${-h * 0.5} H ${w / 2}`} stroke="#0f172a" strokeOpacity="0.25" />
      {mine && (
        <>
          {/* A ribbon on the handle and a luggage tag: yours. */}
          <path d={`M -1 ${-h - 4} l -4 -5 l 3 0 l 2 4 l 2 -4 l 3 0 l -4 5`} fill="#facc15" />
          <rect
            x={w / 2 - 1}
            y={-h + 2}
            width="5"
            height="7"
            rx="1"
            fill="#fef3c7"
            stroke="#a16207"
            strokeWidth="0.6"
          />
        </>
      )}
    </g>
  );
}

/** A duffel bag lying on the belt. */
function Duffel({ c }: { c: string }) {
  return (
    <g>
      <rect x="-11" y="-9" width="22" height="9" rx="4.5" fill={c} />
      <path d="M -5 -9 Q 0 -15 5 -9" stroke="#1f2937" strokeWidth="1.3" fill="none" />
    </g>
  );
}

/** Someone walking through, pulling a suitcase (or carrying a backpack). */
function Walker({
  look,
  bag,
  y,
  s,
  dur,
  delay,
  left,
  x0,
  pack,
}: {
  look: AvatarLook;
  bag: string;
  y: number;
  s: number;
  dur: number;
  delay: number;
  left: boolean;
  x0: number;
  pack?: boolean;
}) {
  return (
    <g
      className={`arr-walker${left ? ' is-left' : ''}`}
      style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
      transform={`translate(${x0} 0)`}
    >
      <g transform={`translate(0 ${y}) scale(${left ? -s : s} ${s})`}>
        {pack ? (
          <rect x="-9.5" y="-25" width="6" height="10" rx="2" fill={bag} />
        ) : (
          <g>
            <path d="M -5 -12.5 L -13 -15" stroke="#334155" strokeWidth="1.1" />
            <rect x="-21" y="-14" width="9.5" height="13" rx="2" fill={bag} />
            <circle cx="-19" cy="-0.6" r="1.2" fill="#111827" />
            <circle cx="-13.6" cy="-0.6" r="1.2" fill="#111827" />
          </g>
        )}
        <g className="city-person is-walking">
          <AvatarFigure look={look} />
        </g>
      </g>
    </g>
  );
}

/** A sign hanging from the ceiling: white on navy, an icon to its left. */
function HangingSign({
  x,
  y,
  w,
  text,
  icon,
  fill = '#1e3a8a',
  ink = '#f8fafc',
}: {
  x: number;
  y: number;
  w: number;
  text: string;
  icon?: ReactNode;
  fill?: string;
  ink?: string;
}) {
  return (
    <g>
      <path
        d={`M ${x - w / 2 + 8} 92 V ${y} M ${x + w / 2 - 8} 92 V ${y}`}
        stroke="#64748b"
        strokeWidth="0.8"
      />
      <rect x={x - w / 2} y={y} width={w} height="17" rx="2.5" fill={fill} />
      <g transform={`translate(${x - w / 2 + 10} ${y + 8.5})`}>{icon}</g>
      <text
        x={x - w / 2 + 20}
        y={y + 12}
        fontSize="9"
        fontWeight="800"
        fill={ink}
        textLength={Math.min(w - 26, text.length * 5.2)}
        lengthAdjust="spacingAndGlyphs"
      >
        {text}
      </text>
    </g>
  );
}

const IconPassport = () => (
  <g>
    <rect x="-4" y="-5.5" width="8" height="11" rx="1" fill="#f8fafc" />
    <circle cx="0" cy="-1" r="2" fill="none" stroke="#1e3a8a" strokeWidth="0.9" />
  </g>
);
const IconBag = ({ ink = '#f8fafc' }: { ink?: string }) => (
  <g>
    <rect x="-4.5" y="-3.5" width="9" height="8" rx="1.2" fill={ink} />
    <rect x="-2" y="-6" width="4" height="3" rx="1" fill="none" stroke={ink} strokeWidth="1" />
  </g>
);
const IconCar = ({ ink = '#111827' }: { ink?: string }) => (
  <g fill={ink}>
    <path d="M -6 1 L -4.5 -3 Q -4 -4 -2.5 -4 L 2.5 -4 Q 4 -4 4.5 -3 L 6 1 V 3 H -6 Z" />
    <circle cx="-3.4" cy="3.4" r="1.4" />
    <circle cx="3.4" cy="3.4" r="1.4" />
  </g>
);

/** The glass wall onto the apron: sky, a plane taxiing past, sunlight falling across the floor. */
function Shell({
  night,
  livery,
  wall,
  children,
}: {
  night: boolean;
  livery: string;
  wall: string;
  children: ReactNode;
}) {
  return (
    <>
      <defs>
        <linearGradient id="arr-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={night ? '#0b1026' : '#38bdf8'} />
          <stop offset="1" stopColor={night ? '#3730a3' : '#e0f2fe'} />
        </linearGradient>
        <linearGradient id="arr-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6d3d1" />
          <stop offset="1" stopColor="#a8a29e" />
        </linearGradient>
        <linearGradient id="arr-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={night ? '#c7d2fe' : '#fffbeb'} stopOpacity="0.5" />
          <stop offset="1" stopColor={night ? '#c7d2fe' : '#fffbeb'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="-200" y="0" width="800" height="90" fill="url(#arr-sky)" />
      {night && (
        <g fill="#fef9c3">
          {[30, 92, 160, 248, 310, 372].map((x, n) => (
            <circle key={x} cx={x} cy={10 + (n % 3) * 9} r="0.8" />
          ))}
        </g>
      )}
      {/* The far side of the airfield: hangars, the control tower. */}
      <g fill={night ? '#1e1b4b' : '#94a3b8'} opacity="0.8">
        <rect x="-40" y="58" width="90" height="16" />
        <path d="M 60 74 V 62 Q 85 52 110 62 V 74 Z" />
        <rect x="318" y="38" width="7" height="36" />
        <rect x="312" y="32" width="19" height="9" rx="2" />
        <rect x="230" y="62" width="70" height="12" />
      </g>
      {night && <rect x="313.5" y="34" width="16" height="4" fill="#fde68a" />}
      <rect x="-200" y="72" width="800" height="18" fill={night ? '#334155' : '#9ca3af'} />
      <path d="M -200 82 H 600" stroke="#facc15" strokeWidth="1.2" strokeDasharray="9 7" />
      {/* Far off, a plane climbing out; nearer, one taxiing past the glass. */}
      <g className="arr-climb" transform="translate(150 40)">
        <g transform="scale(0.22) rotate(-12)">
          <PlaneSide livery="#be123c" gear={false} />
        </g>
      </g>
      <g className="arr-taxi" transform="translate(250 0)">
        <g transform="translate(0 86) scale(0.62)">
          <PlaneSide livery={livery} />
        </g>
        {night && <circle cx="38" cy="78" r="1.6" fill="#f8fafc" />}
      </g>
      <g fill="#334155">
        {Array.from({ length: 10 }, (_, k) => (
          <rect key={k} x={-12 + k * 48} y="0" width="3" height="92" />
        ))}
        <rect x="-200" y="0" width="800" height="3" />
        <rect x="-200" y="88" width="800" height="5" fill="#475569" />
      </g>
      <path d="M -200 6 L 600 34 V 44 L -200 16 Z" fill="#fff" opacity="0.08" />
      <rect x="-200" y="93" width="800" height="130" fill="url(#arr-floor)" />
      <rect x="-200" y="93" width="800" height="62" fill={wall} />
      <rect x="-200" y="153" width="800" height="3" fill="#78716c" opacity="0.35" />
      {/* The floor's sheen. */}
      <path d="M -200 190 H 600" stroke="#fff" strokeOpacity="0.18" strokeWidth="6" />
      {/* Light through the glass, across the wall and the floor. */}
      <g className="arr-beams">
        <path d="M 20 92 L 70 92 L 170 224 L 90 224 Z" fill="url(#arr-light)" />
        <path d="M 160 92 L 196 92 L 296 224 L 236 224 Z" fill="url(#arr-light)" />
        <path d="M 300 92 L 330 92 L 420 224 L 372 224 Z" fill="url(#arr-light)" />
      </g>
      {children}
    </>
  );
}

// ---------------------------------------------------------------------------
// The three steps

interface Cast {
  city: string;
  look: AvatarLook;
  crowd: AvatarLook[];
  night: boolean;
  livery: string;
  /** Holiday with friends: who walks through with you, and who waits at the barrier. */
  party?: { withMe: Traveller[]; waiting: Traveller[] } | null;
}

/** A friend on holiday with you, with their name over their head. */
function Friend({
  f,
  x,
  y,
  s,
  flip,
  wave,
  lift = 0,
}: {
  f: Traveller;
  x: number;
  y: number;
  s: number;
  flip?: boolean;
  wave?: boolean;
  /** Lift the name tag (k-th friend) so neighbours' tags don't overlap. */
  lift?: number;
}) {
  const w = Math.max(26, f.first.length * 5.2 + 10);
  return (
    <g data-arrival-friend={f.id} className={wave ? 'arr-friend is-waiting' : 'arr-friend'}>
      <Person look={f.look} x={x} y={y} s={s} flip={flip} />
      <g transform={`translate(${x} ${y - 52 * s - lift * 11})`}>
        <rect x={-w / 2} y="-9" width={w} height="11" rx="5.5" fill="#5eead4" />
        <text y="-0.8" fontSize="7.2" fontWeight="800" fill="#0f172a" textAnchor="middle">
          {f.first}
        </text>
      </g>
    </g>
  );
}

/** Your friends from the flight, a step behind you (left of `x`, or right with `right`). */
function WithYou({
  party,
  x,
  y,
  right,
}: {
  party: Cast['party'];
  x: number;
  y: number;
  right?: boolean;
}) {
  return (
    <>
      {(party?.withMe ?? []).slice(0, 3).map((f, k) => (
        <Friend
          key={f.id}
          f={f}
          x={x + (right ? 1 : -1) * 34 * (k + 1)}
          y={y + 2 + (k % 2) * 3}
          s={1.3}
          lift={k % 2}
        />
      ))}
    </>
  );
}

function Passport({ city, look, crowd, night, livery, party }: Cast) {
  const officers = [0, 1, 2].map((n) => staffLook(`${city}:officer${n}`, city, '#1e293b'));
  return (
    <Shell night={night} livery={livery} wall="#e2e8f0">
      <HangingSign x={200} y={98} w={150} text={t('Passport control')} icon={<IconPassport />} />
      {[78, 200, 322].map((x, n) => (
        <g key={x}>
          <Person look={officers[n]!} x={x + 4} y={168} s={1.2} />
          <rect
            x={x - 32}
            y="124"
            width="64"
            height="26"
            rx="2"
            fill="#bfdbfe"
            opacity="0.4"
            stroke="#94a3b8"
            strokeWidth="0.8"
          />
          <rect x={x - 36} y="147" width="72" height="5" rx="2" fill="#94a3b8" />
          <rect x={x - 34} y="151" width="68" height="34" rx="2" fill="#334155" />
          <rect x={x - 34} y="151" width="68" height="3" fill="#1e3a8a" />
          <rect x={x - 30} y="117" width="16" height="9" rx="1.5" fill="#0f172a" />
          <text x={x - 22} y="124" fontSize="7" fontWeight="800" fill="#f8fafc" textAnchor="middle">
            {n + 1}
          </text>
          <circle
            cx={x + 26}
            cy="121"
            r="3"
            className={n === 1 ? 'arr-lamp' : undefined}
            fill={n === 2 ? '#ef4444' : '#22c55e'}
          />
        </g>
      ))}
      {/* Your passport on the counter, the stamp, the nod. */}
      <g className="arr-stamp-moment">
        <rect x="190" y="139" width="14" height="10" rx="1.2" fill="#7f1d1d" />
        <circle cx="197" cy="144" r="2.2" fill="none" stroke="#fde68a" strokeWidth="0.7" />
        <g className="arr-stamp">
          <rect x="205" y="128" width="8" height="5" rx="1" fill="#0f172a" />
          <rect x="207.5" y="120" width="3" height="9" rx="1.4" fill="#78350f" />
        </g>
        <g className="arr-ok">
          <circle cx="230" cy="112" r="7" fill="#16a34a" />
          <path d="M 226.5 112 l 2.5 2.6 l 5 -5.2" stroke="#fff" strokeWidth="1.8" fill="none" />
        </g>
      </g>
      {/* The queue between its belts. */}
      <g>
        {[24, 96, 140, 260, 304, 376].map((x) => (
          <g key={x}>
            <rect x={x - 1.4} y="192" width="2.8" height="22" fill="#9ca3af" />
            <rect x={x - 4} y="212" width="8" height="3" rx="1" fill="#6b7280" />
          </g>
        ))}
        <path
          d="M 24 196 Q 60 201 96 196 M 304 196 Q 340 201 376 196"
          stroke="#1d4ed8"
          strokeWidth="2.2"
          fill="none"
        />
      </g>
      {[40, 72, 118, 282, 330, 360].map((x, n) => (
        <g key={x}>
          {n % 2 === 0 && <Case x={x + 12} y={218} c={BAGS[n % BAGS.length]!} h={14} />}
          <Person look={crowd[n % crowd.length]!} x={x} y={218} s={1.15} flip={n > 2} />
        </g>
      ))}
      <Case x={222} y={214} c="#f59e0b" h={16} mine />
      <WithYou party={party} x={200} y={210} />
      <Person look={look} x={200} y={210} s={1.35} />
    </Shell>
  );
}

/** Where each bag rides the carousel (an oval 274 × 50 around its centre). */
const RX = 137;
const RY = 25;
const LOOP = 14;

function Baggage({
  look,
  crowd,
  night,
  livery,
  belt,
  flight,
  party,
}: Cast & { belt: number; flight: string }) {
  const bags = Array.from({ length: 8 }, (_, n) => n);
  const place = (n: number) => {
    // A bag's place on the oval, as the CSS loop starts it (phase 0 is the left end).
    const a = Math.PI + (n / bags.length) * Math.PI * 2;
    return { x: Math.cos(a) * RX, y: -Math.sin(a) * RY };
  };
  return (
    <Shell night={night} livery={livery} wall="#e7e5e4">
      <HangingSign x={170} y={98} w={140} text={t('Baggage reclaim')} icon={<IconBag />} />
      {/* Adverts on the wall, lit. */}
      <rect x="10" y="102" width="44" height="34" rx="2" fill="#0f766e" />
      <circle cx="32" cy="116" r="8" fill="#fde68a" />
      <rect x="18" y="128" width="28" height="3" rx="1.5" fill="#ccfbf1" />
      {/* People walking behind the carousel. */}
      {crowd.slice(6, 9).map((c, n) => (
        <Walker
          key={n}
          look={c}
          bag={BAGS[(n + 3) % BAGS.length]!}
          y={150}
          s={0.85}
          dur={16 + n * 5}
          delay={-n * 6}
          left={n === 1}
          x0={60 + n * 120}
        />
      ))}
      {/* The belt's screen: your flight, and where it came from. */}
      <g>
        <rect x="318" y="98" width="4" height="40" fill="#64748b" />
        <rect x="290" y="98" width="72" height="30" rx="2.5" fill="#0a0a0a" />
        <text x="296" y="111" fontSize="10" fontWeight="900" fill="#fbbf24">
          {t('Belt {n}', { n: belt })}
        </text>
        <text
          x="296"
          y="122"
          fontSize="7"
          fontWeight="700"
          fill="#fde68a"
          textLength={Math.min(60, flight.length * 4)}
          lengthAdjust="spacingAndGlyphs"
        >
          {flight}
        </text>
      </g>
      {/* The carousel: its skirt, the belt, the island, the chute bags come down. */}
      <ellipse cx="200" cy="180" rx="158" ry="35" fill="#27272a" />
      <ellipse cx="200" cy="174" rx="158" ry="33" fill="#52525b" />
      <ellipse
        cx="200"
        cy="174"
        rx={RX}
        ry={RY}
        fill="none"
        stroke="#3f3f46"
        strokeWidth="13"
        strokeDasharray="2 7"
        className="arr-plates"
      />
      <ellipse cx="200" cy="172" rx="114" ry="17" fill="#a1a1aa" />
      <ellipse cx="200" cy="170" rx="108" ry="14" fill="#d4d4d8" />
      <path d="M 120 140 L 160 140 L 166 164 L 116 164 Z" fill="#3f3f46" />
      <g fill="#18181b">
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <rect key={k} x={122 + k * 6.4} y="141" width="5.2" height="13" />
        ))}
      </g>
      <g transform="translate(200 174)">
        {bags.map((n) => {
          const p = place(n);
          return (
            <g
              key={n}
              className="arr-bag-x"
              style={{ animationDelay: `${(-n / bags.length) * LOOP}s` }}
              transform={`translate(${p.x.toFixed(1)} 0)`}
            >
              <g
                className="arr-bag-y"
                style={{ animationDelay: `${(-n / bags.length) * LOOP - LOOP / 4}s` }}
                transform={`translate(0 ${p.y.toFixed(1)})`}
              >
                {n % 3 === 1 ? (
                  <Duffel c={BAGS[n]!} />
                ) : (
                  <Case x={0} y={0} c={BAGS[n]!} h={n % 2 ? 15 : 18} />
                )}
              </g>
            </g>
          );
        })}
        {/* Yours: out of the chute after a moment, round to the front. */}
        <g
          className="arr-bag-x arr-mine"
          style={{ animationDelay: `${1.2 - LOOP * 0.85}s` }}
          transform="translate(40 0)"
        >
          <g
            className="arr-bag-y"
            style={{ animationDelay: `${1.2 - LOOP * 0.85 - LOOP / 4}s` }}
            transform={`translate(0 ${RY - 1})`}
          >
            <g className="arr-mine-in">
              <Case x={0} y={0} c="#f59e0b" h={19} mine />
              <g className="arr-mine-tag">
                <path d="M 0 -27 l -4 -5 h 8 Z" fill="#facc15" />
                <rect x="-21" y="-43" width="42" height="12" rx="6" fill="#facc15" />
                <text
                  x="0"
                  y="-34.5"
                  fontSize="7"
                  fontWeight="900"
                  fill="#111827"
                  textAnchor="middle"
                >
                  {t('Your bag')}
                </text>
              </g>
            </g>
          </g>
        </g>
      </g>
      {/* Waiting at the belt, a trolley or two. */}
      {[38, 92, 150, 220, 372].map((x, n) => (
        <Person key={x} look={crowd[n % crowd.length]!} x={x} y={218} s={1.15} flip={n > 2} />
      ))}
      <g>
        <path
          d="M 262 196 h 30 l 4 -12 M 262 196 l -3 -8"
          stroke="#94a3b8"
          strokeWidth="1.6"
          fill="none"
        />
        <circle cx="266" cy="200" r="2.6" fill="#1f2937" />
        <circle cx="288" cy="200" r="2.6" fill="#1f2937" />
      </g>
      <WithYou party={party} x={312} y={214} />
      <Person look={look} x={312} y={214} s={1.35} />
    </Shell>
  );
}

/** Name boards at the barrier, held up by drivers and family. */
const BOARDS = [
  'Mr Adeyemi',
  'Dr Mensah',
  'Ms Clarke',
  'J. Patel',
  'Kamau & Co',
  'S. Haddad',
  'Mrs Okafor',
  'A. Ndlovu',
];

function Hall({
  city,
  look,
  crowd,
  night,
  livery,
  sign,
  party,
}: Cast & { sign: { hotel: string; name: string } | null }) {
  const h = hash(city);
  const boards = [0, 1, 2, 3].map((k) => BOARDS[(h + k * 3) % BOARDS.length]!);
  const drivers = [0, 1, 2, 3].map((n) =>
    staffLook(`${city}:driver${n}`, city, n % 2 ? '#111827' : '#334155'),
  );
  const barista = staffLook(`${city}:barista`, city, '#7c2d12');
  const clerk = staffLook(`${city}:sim`, city, '#6d28d9');
  const mineW = sign
    ? Math.min(150, Math.max(sign.hotel.length * 4.3, sign.name.length * 5.4) + 14)
    : 0;
  return (
    <Shell night={night} livery={livery} wall="#f1f5f9">
      {/* Where you came out: the green channel. */}
      <rect x="10" y="104" width="68" height="74" fill="#475569" />
      <rect x="14" y="110" width="60" height="68" fill="#bae6fd" opacity="0.7" />
      <rect
        className="arr-door-l"
        x="14"
        y="110"
        width="30"
        height="68"
        fill="#e0f2fe"
        opacity="0.55"
      />
      <rect
        className="arr-door-r"
        x="44"
        y="110"
        width="30"
        height="68"
        fill="#e0f2fe"
        opacity="0.55"
      />
      <rect x="8" y="95" width="72" height="12" rx="2" fill="#15803d" />
      <text
        x="44"
        y="104"
        fontSize="6.8"
        fontWeight="800"
        fill="#f0fdf4"
        textAnchor="middle"
        textLength="64"
        lengthAdjust="spacingAndGlyphs"
      >
        {t('Nothing to declare')}
      </text>
      {/* The SIM-card kiosk. */}
      <rect x="92" y="108" width="62" height="50" rx="3" fill="#6d28d9" />
      <text x="123" y="121" fontSize="8.5" fontWeight="900" fill="#faf5ff" textAnchor="middle">
        {t('SIM cards')}
      </text>
      <rect x="114" y="125" width="18" height="26" rx="3" fill="#1e1b4b" />
      <rect x="116" y="128" width="14" height="19" rx="1.5" fill="#a5b4fc" />
      <rect x="117" y="131" width="6" height="2" fill="#4338ca" />
      <rect x="117" y="135" width="10" height="2" fill="#4338ca" />
      <Person look={clerk} x={140} y={168} s={1.05} flip />
      <rect x="90" y="156" width="66" height="22" rx="2" fill="#f8fafc" />
      <rect x="90" y="156" width="66" height="4" fill="#a78bfa" />
      {/* The café. */}
      <rect x="166" y="94" width="100" height="12" rx="2" fill="#1c1917" />
      <text x="216" y="103.5" fontSize="8" fontWeight="900" fill="#fde68a" textAnchor="middle">
        {t('Café')}
      </text>
      <g>
        {Array.from({ length: 10 }, (_, k) => (
          <path
            key={k}
            d={`M ${166 + k * 10} 106 h 10 v 8 q -5 4 -10 0 Z`}
            fill={k % 2 ? '#fef3c7' : '#b45309'}
          />
        ))}
      </g>
      <rect x="170" y="118" width="92" height="3" fill="#a16207" />
      <g fill="#f8fafc">
        {[176, 186, 196, 226, 236, 246].map((x) => (
          <rect key={x} x={x} y="112" width="6" height="6" rx="1" opacity="0.9" />
        ))}
      </g>
      <rect x="198" y="126" width="26" height="22" rx="2" fill="#a8a29e" />
      <rect x="202" y="130" width="18" height="6" rx="1" fill="#57534e" />
      <g className="arr-steam" stroke="#fff" strokeOpacity="0.8" strokeWidth="1.2" fill="none">
        <path d="M 206 124 q 3 -4 0 -8 q -3 -4 0 -8" />
        <path d="M 214 124 q 3 -4 0 -8 q -3 -4 0 -8" />
      </g>
      <Person look={barista} x={244} y={168} s={1.05} flip />
      <rect x="168" y="148" width="96" height="30" rx="2" fill="#92400e" />
      <rect x="166" y="146" width="100" height="4" rx="1.5" fill="#d6d3d1" />
      <rect x="180" y="140" width="5" height="6" rx="1" fill="#f8fafc" />
      <rect x="232" y="140" width="6" height="6" rx="1" fill="#fef3c7" />
      {/* The way out to the taxi rank, a cab waiting outside. */}
      <rect x="282" y="106" width="114" height="72" fill="#475569" />
      <rect x="286" y="112" width="106" height="66" fill={night ? '#1e293b' : '#cbd5e1'} />
      <rect x="286" y="160" width="106" height="18" fill="#6b7280" />
      <g className="arr-cab">
        <g transform="translate(330 172) scale(2.3)">
          <IconCar ink="#facc15" />
        </g>
        <rect x="324" y="159" width="12" height="3" rx="1" fill="#111827" />
      </g>
      <rect x="286" y="112" width="106" height="66" fill="#bae6fd" opacity="0.25" />
      <rect x="338" y="112" width="2.5" height="66" fill="#475569" />
      <HangingSign
        x={339}
        y={95}
        w={112}
        text={t('Taxis · Rides')}
        icon={<IconCar />}
        fill="#facc15"
        ink="#111827"
      />
      {/* At the barrier: drivers with name boards, yours among them. */}
      {/* Yours drawn last: a long board (everyone's names) stays on top. */}
      {[0, 1, 3, 2].map((n) => {
        const d = drivers[n]!;
        const x = [112, 176, 252, 330][n]!;
        const mine = n === 2 && !!sign;
        const w = mine ? mineW : 50;
        const top = mine ? 132 : 140;
        return (
          <g key={n} className={mine ? 'arr-your-sign' : undefined}>
            <Person look={d} x={x} y={186} s={1.15} />
            <rect
              x={x - w / 2}
              y={top}
              width={w}
              height={mine ? 26 : 15}
              rx="1.5"
              fill="#fff"
              stroke={mine ? '#0f766e' : '#cbd5e1'}
              strokeWidth={mine ? 2 : 0.8}
            />
            {mine && sign ? (
              <>
                <text
                  x={x}
                  y={top + 10}
                  fontSize="7"
                  fontWeight="700"
                  fill="#334155"
                  textAnchor="middle"
                  textLength={Math.min(w - 10, sign.hotel.length * 4.3)}
                  lengthAdjust="spacingAndGlyphs"
                >
                  {sign.hotel}
                </text>
                <text
                  x={x}
                  y={top + 21}
                  fontSize="9"
                  fontWeight="900"
                  fill="#0f766e"
                  textAnchor="middle"
                  textLength={Math.min(w - 10, sign.name.length * 5.4)}
                  lengthAdjust="spacingAndGlyphs"
                >
                  {sign.name}
                </text>
              </>
            ) : (
              <text
                x={x}
                y={top + 10.5}
                fontSize="7.5"
                fontWeight="800"
                fill="#111827"
                textAnchor="middle"
                textLength={Math.min(44, boards[n]!.length * 4.4)}
                lengthAdjust="spacingAndGlyphs"
              >
                {boards[n]}
              </text>
            )}
          </g>
        );
      })}
      {/* The barrier. */}
      <g>
        {[96, 140, 184, 228, 272, 316, 360, 396].map((x) => (
          <rect key={x} x={x - 1.3} y="178" width="2.6" height="18" fill="#94a3b8" />
        ))}
        <rect
          x="94"
          y="177"
          width="310"
          height="2.6"
          rx="1.3"
          fill="#cbd5e1"
          stroke="#94a3b8"
          strokeWidth="0.5"
        />
        <rect x="94" y="186" width="310" height="1.5" fill="#94a3b8" />
      </g>
      {/* Travellers on their way out. */}
      {crowd.slice(0, 5).map((c, n) => (
        <Walker
          key={n}
          look={c}
          bag={BAGS[n % BAGS.length]!}
          y={206 + (n % 3) * 5}
          s={1.15}
          dur={13 + ((n * 5) % 9)}
          delay={-n * 3.4}
          left={n % 2 === 1}
          x0={40 + n * 78}
          pack={n === 3}
        />
      ))}
      {/* Friends who landed first, waiting for you by your driver. */}
      {(party?.waiting ?? []).slice(0, 3).map((f, k) => (
        <Friend key={f.id} f={f} x={226 - k * 30} y={208} s={1.25} flip wave lift={k % 2} />
      ))}
      <Case x={74} y={216} c="#f59e0b" h={17} mine />
      <WithYou party={party} x={56} y={216} right />
      <Person look={look} x={56} y={216} s={1.35} />
    </Shell>
  );
}

// ---------------------------------------------------------------------------

/** The terminal's sign: Arrivals, the airport's name (big), the city's local time. */
function Fascia({ marketId, now }: { marketId: string; now: number }) {
  const city = CITY_NAMES[marketId] ?? marketId;
  return (
    <div className="arrival-hero arr-fascia" data-arrival-hero="">
      <div className="arr-fascia-top">
        <span className="arrival-sign">
          <span aria-hidden="true">✈</span> {t('Arrivals')}
        </span>
        <p className="arrival-city">
          {city} · {t('Local time {time}', { time: hhmm(now) })}
        </p>
      </div>
      <h2 className="arrival-airport">{AIRPORT_NAMES[marketId] ?? city}</h2>
    </div>
  );
}

interface BoardRow {
  time: string;
  flight: string;
  from: string;
  belt: string;
  status: string;
  mine?: boolean;
}

function ArrivalsBoard({ rows }: { rows: BoardRow[] }) {
  return (
    <section className="board arr-board" aria-label={t('Arrivals board')}>
      <table>
        <thead>
          <tr className="arr-board-head">
            <th>{t('Time')}</th>
            <th>{t('Flight')}</th>
            <th className="board-dest">{t('From')}</th>
            <th>{t('Belt')}</th>
            <th>{t('Status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, n) => (
            <tr
              key={r.flight}
              className={r.mine ? 'is-mine' : undefined}
              data-arrival-row={r.mine ? 'mine' : ''}
            >
              <td>
                <span className="sr-only">{r.time}</span>
                <Flaps text={r.time} width={5} delay={n * 0.08} />
              </td>
              <td>
                <span className="sr-only">{r.flight}</span>
                <Flaps text={r.flight.replace(' ', '')} width={5} delay={n * 0.08 + 0.1} />
              </td>
              <td className="board-dest">
                <span className="sr-only">{r.from}</span>
                <Flaps text={r.from} width={12} delay={n * 0.08 + 0.2} />
              </td>
              <td>
                <span className="sr-only">{r.belt}</span>
                <Flaps text={r.belt} width={2} delay={n * 0.08 + 0.3} />
              </td>
              <td className="board-status">
                <span className="sr-only">{r.status}</span>
                <Flaps text={r.status} width={7} delay={n * 0.08 + 0.35} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Arrivals: the live hall above, the way on below. */
export function ArrivalScene({
  marketId,
  arrival,
  look,
  night,
}: {
  marketId: string;
  arrival: Arrival;
  look: AvatarLook;
  night: boolean;
}) {
  const { view } = useView();
  const lite = useQuality() === 'lite';
  const calm = lite || reduceMotion();
  const city = CITY_NAMES[marketId] ?? marketId;
  const stay = arrival.home ? null : stayOf(view);
  // The feedback round: the named hotel, and where in town it stands.
  const named = stay ? stayHotelIn(view, marketId) : null;
  const [step, setStep] = useState<ArrStep>('passport');
  const [{ now, at0 }] = useState(() => ({ now: localMinutes(marketId), at0: Date.now() }));

  // Your flight: the ticket you flew on (else from home, on today's schedule).
  const trip = useMemo(() => {
    const last = lastFlight();
    const homeId = (view.me as { market?: string }).market ?? null;
    const from = last?.to === marketId ? last.from : !arrival.home ? homeId : null;
    const day = scheduleDay(view.market.month, at0);
    const scheduled = from ? nextFlightTo(airportSchedule(from, day), marketId, 0) : null;
    const flight =
      (last?.to === marketId ? last.flight : undefined) ?? scheduled?.flight ?? 'RW 101';
    const airline = (last?.to === marketId ? last.airline : undefined) ?? scheduled?.airline;
    return {
      from,
      fromName: from ? (CITY_NAMES[from] ?? from) : '',
      flight,
      livery: liveryOf(from ?? marketId, airline),
      belt: 1 + (hash(flight) % 6),
      day,
    };
  }, [view.me, view.market.month, marketId, arrival.home, at0]);

  const rows = useMemo<BoardRow[]>(() => {
    const arrivals = airportSchedule(marketId, trip.day).filter(
      (f) => f.arrival && f.city !== trip.from,
    );
    const landed = arrivals.filter((f) => f.at + f.late <= now).slice(-1);
    const next = arrivals.filter((f) => f.at + f.late > now).slice(0, 2 - landed.length);
    const others = [...landed, ...next].map((f) => ({
      time: f.time,
      flight: f.flight,
      from: f.cityName,
      belt: flightStatus(f, now) === 'Landed' ? String(1 + (hash(f.flight) % 6)) : '',
      status: STATUS(flightStatus(f, now)),
    }));
    const mine: BoardRow = {
      time: hhmm(now - 6),
      flight: trip.flight,
      from: trip.fromName || city,
      belt: String(trip.belt),
      status: t('Landed'),
      mine: true,
    };
    return [mine, ...others];
  }, [marketId, trip, now, city]);

  const crowd = useMemo(
    () => Array.from({ length: 10 }, (_, n) => travellerLook(`${marketId}:arrivals${n}`, marketId)),
    [marketId],
  );
  // Holiday with friends: they come through with you, or wait at the barrier; one board for all.
  const party = useMemo(
    () => (arrival.home ? null : arrivalParty(view, marketId)),
    [view, marketId, arrival.home],
  );
  const sameHotel = party && (!party.hotel || party.hotel === stay?.name);
  const name = sameHotel
    ? [
        firstOf(view.me.name),
        ...party.withMe.map((f) => f.first),
        ...party.waiting.map((f) => f.first),
      ]
        .slice(0, 4)
        .join(', ')
    : view.me.name;
  // First class: a chauffeur meets you (the ticket you flew on says so), fast track through.
  const flown = lastFlight();
  const cabin = flown?.to === marketId ? flown.cabin : undefined;
  const chauffeur = cabin === 'first';
  const sign = chauffeur
    ? { hotel: t('Your chauffeur'), name }
    : stay
      ? { hotel: stay.name, name }
      : null;

  const next = () => setStep((s) => ARR_STEPS[Math.min(2, ARR_STEPS.indexOf(s) + 1)]!);
  const cast: Cast = { city: marketId, look, crowd, night, livery: trip.livery, party };
  const flightLine = trip.fromName
    ? t('{flight} from {city}', { flight: trip.flight, city: trip.fromName })
    : trip.flight;

  const caption =
    step === 'passport'
      ? {
          title: t('Passport control'),
          text:
            cabin === 'first' || cabin === 'business'
              ? t('Fast track: no queue. The officer stamps your passport.')
              : t('The officer checks your passport and stamps it.'),
          go: t('On to baggage'),
        }
      : step === 'baggage'
        ? {
            title: t('Baggage reclaim'),
            text:
              cabin === 'first' || cabin === 'business'
                ? t('Belt {n}: your bag, tagged priority, comes off first.', { n: trip.belt })
                : t('Belt {n}: your suitcase is coming round.', { n: trip.belt }),
            go: t('Pick up your bag'),
          }
        : {
            title: t('Arrivals hall'),
            text: chauffeur
              ? stay
                ? t('Your chauffeur is waiting at the barrier to drive you to {hotel}.', {
                    hotel: stay.name,
                  })
                : t('Your chauffeur is waiting at the barrier with your name.')
              : sign
                ? sameHotel
                  ? t('A driver from {hotel} is holding a sign with all your names.', {
                      hotel: sign.hotel,
                    })
                  : t('A driver from {hotel} is holding a sign with your name.', {
                      hotel: sign.hotel,
                    })
                : t('Taxis and rides are just outside; there’s a café and SIM cards here.'),
            go: '',
          };

  const sights: { where: 'office' | 'market' | 'hub' | 'bank'; icon: string; label: string }[] = [
    {
      where: 'office',
      icon: '💼',
      label: arrival.home ? t('Your office') : t('A desk at the coworking space'),
    },
    { where: 'hub', icon: '🤝', label: t('The tech hub: meet founders and investors') },
    { where: 'market', icon: '🛍️', label: t('The market: customers and suppliers') },
    { where: 'bank', icon: '🏦', label: t('The bank') },
  ];

  return (
    <>
      <div className={`arr-live${calm ? ' is-calm' : ''}`} data-arrival-live={step}>
        <Fascia marketId={marketId} now={now} />
        <ArrivalsBoard rows={rows} />
        <div
          className="arr-hall"
          data-arrival-scene={step}
          onClick={step === 'hall' ? undefined : next}
          aria-hidden="true"
        >
          <svg key={step} viewBox="0 0 400 222" preserveAspectRatio="xMidYMid slice">
            {step === 'passport' ? (
              <Passport {...cast} />
            ) : step === 'baggage' ? (
              <Baggage {...cast} belt={trip.belt} flight={flightLine} />
            ) : (
              <Hall {...cast} sign={sign} />
            )}
          </svg>
        </div>
      </div>
      <section className="trip-sheet arrival-sheet" data-arrival="" aria-label={t('Arrivals')}>
        <div className="arr-guide" data-arrival-step={step}>
          <ol className="arr-steps" aria-label={t('Through the airport')}>
            {ARR_STEPS.map((s, n) => {
              const done = ARR_STEPS.indexOf(step) > n;
              return (
                <li key={s}>
                  <button
                    type="button"
                    className={`arr-step${s === step ? ' is-now' : ''}${done ? ' is-done' : ''}`}
                    aria-current={s === step ? 'step' : undefined}
                    onClick={() => setStep(s)}
                  >
                    <span aria-hidden="true">{done ? '✓' : n + 1}</span> {ARR_LABEL(s)}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="arr-caption">
            <b>{caption.title}</b> {caption.text}
          </p>
          {party && (
            <p className="small arr-party" data-arrival-party="">
              {party.withMe.length > 0 &&
                t('{names} came off the plane with you.', { names: namesOf(party.withMe) })}
              {party.withMe.length > 0 && party.waiting.length > 0 && ' '}
              {party.waiting.length > 0 &&
                (party.waiting.length > 1
                  ? t('{names} got here first and are waiting at the barrier.', {
                      names: namesOf(party.waiting),
                    })
                  : t('{names} got here first and is waiting at the barrier.', {
                      names: namesOf(party.waiting),
                    }))}
            </p>
          )}
          {step !== 'hall' && (
            <div className="arr-guide-go">
              <button type="button" className="btn btn-ghost arr-next" onClick={next}>
                {caption.go} <span aria-hidden>›</span>
              </button>
              <button type="button" className="arr-skip" onClick={() => setStep('hall')}>
                {t('Skip')}
              </button>
            </div>
          )}
        </div>
        <h3 className="arrival-title">
          {arrival.home ? t('Welcome home to {city}', { city }) : t('Welcome to {city}', { city })}
        </h3>
        <div className="arrival-stay">
          <span className="arrival-stay-icon" aria-hidden="true">
            {arrival.home ? '🏠' : '🏨'}
          </span>
          <span className="arrival-stay-text">
            <span className="small">{arrival.home ? t('Your home') : t('Your hotel')}</span>
            <b>{stay?.name ?? (arrival.home ? city : t('A room in town'))}</b>
            {stay && (
              <span className="arrival-stars">
                {named ? '★'.repeat(named.stars) : HOTEL_STARS[stay.tier]}
              </span>
            )}
            {named && (
              <span className="small" data-arrival-hotel={named.id}>
                {t('{area} · {km} km from the centre', { area: named.area, km: named.km })}
              </span>
            )}
          </span>
          {chauffeur && (
            <span className="arrival-chauffeur small" data-arrival-chauffeur="">
              <span aria-hidden="true">🚘</span> {t('Chauffeur included')}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block arrival-go"
          data-arrival-go="home"
          onClick={() => arrival.onGo('home')}
        >
          {arrival.home ? t('Go home') : t('Go to your hotel')} <span aria-hidden>›</span>
        </button>
        <p className="arrival-where">
          <b>{t('Where to go in {city}', { city })}</b>
        </p>
        <ul className="arrival-sights">
          {sights.map((x) => (
            <li key={x.where}>
              <button type="button" data-arrival-go={x.where} onClick={() => arrival.onGo(x.where)}>
                <span className="arrival-sight-icon" aria-hidden="true">
                  {x.icon}
                </span>
                <span>{x.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="arrival-stay-here" onClick={arrival.onStay}>
          {t('Stay in the airport')}
        </button>
      </section>
    </>
  );
}
