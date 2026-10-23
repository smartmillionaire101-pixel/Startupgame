/**
 * The terminal, one view per step of your trip, over the trip sheet: the
 * check-in hall (desks under the airline's signs, your bag onto the belt),
 * security (the bag through the scanner, you through the arch), the lounge
 * (planes taking off past the glass: the business lounge's buffet, the first
 * class lounge's champagne bar, or in economy the plastic seats at the gate)
 * and the gate, where your plane waits
 * outside the windows at the jet bridge, or on the tarmac with its airstairs
 * if it's your own jet. Boarding walks you up the bridge or the stairs.
 *
 * Every view is one SVG drawn once; what moves is CSS on a few groups,
 * still when motion is reduced (`.is-playing` starts each step's moment).
 */
import { t } from '../../i18n';
import { AvatarFigure, avatarLook, type AvatarLook } from '../art';
import { PlaneSide, type PlaneKind } from './planes';
import './halls.css';

export type HallStep = 'checkin' | 'security' | 'lounge' | 'board';

const VB = '0 0 400 236';

/** You, walking or standing, `s` times the map's size. */
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

function Suitcase({ x, y, c = '#0ea5e9' }: { x: number; y: number; c?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-9" y="-20" width="18" height="20" rx="3" fill={c} />
      <rect
        x="-4"
        y="-24"
        width="8"
        height="5"
        rx="2"
        fill="none"
        stroke="#334155"
        strokeWidth="1.6"
      />
      <rect x="-9" y="-11" width="18" height="2" fill="#0f172a" opacity="0.25" />
    </g>
  );
}

/** Tall windows onto the apron: sky, the tarmac, mullions; `children` stand outside. */
function Windows({
  top,
  bottom,
  night,
  children,
}: {
  top: number;
  bottom: number;
  night: boolean;
  children?: React.ReactNode;
}) {
  const ground = bottom - (bottom - top) * 0.28;
  return (
    <g>
      <rect
        x="-200"
        y={top}
        width="800"
        height={ground - top}
        fill={night ? '#1e1b4b' : '#7dd3fc'}
      />
      <rect
        x="-200"
        y={top}
        width="800"
        height={(ground - top) * 0.45}
        fill={night ? '#0b1026' : '#38bdf8'}
        opacity="0.6"
      />
      <rect x="-200" y={ground} width="800" height={bottom - ground} fill="#9ca3af" />
      <path
        d={`M -200 ${ground + 8} H 600`}
        stroke="#facc15"
        strokeWidth="1.5"
        strokeDasharray="10 8"
      />
      {children}
      <g fill="#475569">
        {Array.from({ length: 12 }, (_, k) => (
          <rect key={k} x={-200 + k * 70} y={top} width="4" height={bottom - top} />
        ))}
        <rect x="-200" y={top - 4} width="800" height="5" />
        <rect x="-200" y={bottom - 2} width="800" height="6" />
      </g>
      <path
        d={`M -200 ${top + 6} L 600 ${top + 40} V ${top + 52} L -200 ${top + 18} Z`}
        fill="#fff"
        opacity="0.1"
      />
    </g>
  );
}

// ---------------------------------------------------------------------------

function CheckIn({
  look,
  livery,
  airline,
  toName,
  night,
}: {
  look: AvatarLook;
  livery: string;
  airline: string;
  toName: string;
  night: boolean;
}) {
  const agents = ['f-corporate', 'i-banker', 'b-commercial'].map((b, n) =>
    avatarLook(b, `checkin:${airline}:${n}`),
  );
  return (
    <>
      <rect x="-200" y="0" width="800" height="236" fill="#e2e8f0" />
      <Windows top={10} bottom={96} night={night}>
        <g transform="translate(250 88) scale(0.9)">
          <PlaneSide livery={livery} />
        </g>
      </Windows>
      <rect x="-200" y="96" width="800" height="30" fill="#f1f5f9" />
      <rect x="-200" y="186" width="800" height="60" fill="#cbd5e1" />
      {[70, 200, 330].map((x, n) => (
        <g key={x}>
          {/* The airline's sign over each desk, and where to. */}
          <rect x={x - 46} y="97" width="92" height="21" rx="3" fill="#0f172a" />
          <rect x={x - 46} y="97" width="8" height="21" rx="2" fill={livery} />
          <text x={x - 34} y="107" fontSize="8" fontWeight="800" fill="#f8fafc">
            {airline}
          </text>
          <text x={x - 34} y="115" fontSize="6.5" fontWeight="700" fill="#fde68a">
            {n === 1 ? toName : n ? t('Bag drop') : t('Check in')}
          </text>
          <Person look={agents[n]!} x={x - 8} y={175} s={1.4} />
          <rect x={x - 40} y="150" width="56" height="38" rx="3" fill="#64748b" />
          <rect x={x - 42} y="146" width="60" height="6" rx="2" fill="#94a3b8" />
          <rect x={x - 26} y="156" width="28" height="4" rx="2" fill={livery} />
          {/* The scale and the belt that takes bags away. */}
          <rect x={x + 16} y="168" width="30" height="20" fill="#475569" />
          <rect x={x + 16} y="164" width="30" height="5" fill="#1f2937" />
          <rect x={x + 44} y="140" width="10" height="48" fill="#334155" />
        </g>
      ))}
      <g className="hall-bag">
        <g className="hall-bag-move">
          <Suitcase x={216} y={208} c="#f59e0b" />
        </g>
      </g>
      <Person look={look} x={192} y={214} s={1.5} />
      {/* The queue: posts and belts. */}
      <g>
        {[30, 110, 260, 340].map((x) => (
          <g key={x}>
            <rect x={x - 1.5} y="200" width="3" height="26" fill="#94a3b8" />
            <rect x={x - 4} y="224" width="8" height="3" rx="1" fill="#64748b" />
          </g>
        ))}
        <path
          d="M 30 204 Q 70 210 110 204 M 260 204 Q 300 210 340 204"
          stroke="#1d4ed8"
          strokeWidth="2.4"
          fill="none"
        />
      </g>
    </>
  );
}

function Security({ look, night }: { look: AvatarLook; night: boolean }) {
  const officer = avatarLook('f-corporate', 'security:officer');
  return (
    <>
      <rect x="-200" y="0" width="800" height="236" fill="#e5e7eb" />
      <Windows top={10} bottom={70} night={night} />
      <rect x="-200" y="70" width="800" height="120" fill="#f1f5f9" />
      <rect x="-200" y="186" width="800" height="60" fill="#d1d5db" />
      {/* The scanner: a belt, the tunnel, its screen. */}
      <rect x="-40" y="168" width="250" height="10" rx="3" fill="#334155" />
      <rect x="-40" y="178" width="250" height="14" fill="#64748b" />
      <g className="hall-tray">
        <g className="hall-tray-move">
          <rect x="-16" y="160" width="40" height="8" rx="2" fill="#475569" />
          <Suitcase x={4} y={160} c="#f59e0b" />
        </g>
      </g>
      <rect x="60" y="120" width="80" height="50" rx="6" fill="#94a3b8" />
      <rect x="66" y="132" width="68" height="36" fill="#1f2937" />
      <g fill="#475569">
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <rect key={k} x={67 + k * 11.2} y="133" width="10" height="34" opacity="0.8" />
        ))}
      </g>
      <rect x="150" y="104" width="34" height="24" rx="3" fill="#0f172a" />
      <rect x="153" y="107" width="28" height="18" fill="#164e63" />
      <path d="M 158 120 l 6 -6 l 5 4 l 7 -8" stroke="#67e8f9" strokeWidth="1.4" fill="none" />
      {/* The arch you walk through, its light turning green. */}
      <rect x="252" y="96" width="10" height="94" fill="#cbd5e1" />
      <rect x="306" y="96" width="10" height="94" fill="#cbd5e1" />
      <rect x="248" y="88" width="72" height="12" rx="3" fill="#94a3b8" />
      <circle cx="284" cy="94" r="3.4" className="hall-arch-light" />
      <Person look={officer} x={344} y={196} s={1.5} flip />
      <g className="hall-walk-through">
        <g className="hall-walk-move">
          <Person look={look} x={230} y={210} s={1.6} walking />
        </g>
      </g>
      <rect x="-200" y="210" width="800" height="3" fill="#9ca3af" opacity="0.5" />
    </>
  );
}

/** Economy: no lounge, a row of plastic seats by the gate, a vending machine. */
function WaitingArea({ night, livery }: { night: boolean; livery: string }) {
  const crowd = ['f-engineer', 'b-commercial', 'f-dropout', 'i-operator', 'b-fintech'];
  return (
    <g data-lounge="economy">
      <rect x="-200" y="0" width="800" height="236" fill="#e2e8f0" />
      <Windows top={12} bottom={150} night={night}>
        <g transform="translate(196 132) scale(1.1)">
          <PlaneSide livery={livery} />
        </g>
      </Windows>
      <rect x="-200" y="150" width="800" height="90" fill="#94a3b8" />
      <rect x="20" y="96" width="34" height="80" rx="3" fill="#dc2626" />
      <rect x="25" y="104" width="24" height="40" fill="#fecaca" />
      <g fill="#1e3a8a">
        {Array.from({ length: 9 }, (_, k) => (
          <g key={k}>
            <rect x={70 + k * 36} y="196" width="30" height="14" rx="3" />
            <rect x={70 + k * 36} y="184" width="30" height="12" rx="3" opacity="0.85" />
          </g>
        ))}
      </g>
      {crowd.map((bg, n) => (
        <g key={bg} transform={`translate(${86 + n * 72} 200) scale(1.1)`}>
          <AvatarFigure look={avatarLook(bg, `gate-wait:${n}`)} />
        </g>
      ))}
    </g>
  );
}

/** First class: walnut and gold, a champagne bar, white cloths. */
function FirstLounge({ night, livery }: { night: boolean; livery: string }) {
  return (
    <g data-lounge="first">
      <rect x="-200" y="0" width="800" height="236" fill="#1c1410" />
      <Windows top={12} bottom={150} night={night}>
        <g transform="translate(196 132) scale(1.1)">
          <PlaneSide livery={livery} />
        </g>
      </Windows>
      <rect x="-200" y="150" width="800" height="90" fill="#3a2e26" />
      <rect x="-200" y="150" width="800" height="3" fill="#c9a227" />
      <rect x="120" y="20" width="160" height="20" rx="3" fill="#0f0a07" />
      <text x="200" y="34" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fcd34d">
        {t('First class lounge')}
      </text>
      {/* The champagne bar. */}
      <rect x="20" y="168" width="110" height="40" rx="4" fill="#5b3a22" />
      <rect x="20" y="166" width="110" height="5" rx="2" fill="#c9a227" />
      {[34, 50, 66, 82, 98].map((x) => (
        <g key={x}>
          <rect x={x} y="152" width="3" height="14" fill="#fde68a" />
          <rect x={x + 1} y="160" width="1" height="6" fill="#e0f2fe" />
        </g>
      ))}
      <rect x="112" y="144" width="7" height="22" rx="2" fill="#14532d" />
      {/* A table laid with a white cloth, two leather chairs. */}
      <rect x="250" y="186" width="70" height="8" rx="3" fill="#f8fafc" />
      <rect x="282" y="194" width="6" height="22" fill="#5b3a22" />
      {[232, 330].map((x) => (
        <rect key={x} x={x - 14} y="180" width="30" height="36" rx="8" fill="#e9dcc3" />
      ))}
    </g>
  );
}

function Lounge({
  night,
  livery,
  cabin,
}: {
  night: boolean;
  livery: string;
  cabin?: 'economy' | 'business' | 'first';
}) {
  if (cabin === 'economy') return <WaitingArea night={night} livery={livery} />;
  if (cabin === 'first') return <FirstLounge night={night} livery={livery} />;
  return (
    <g data-lounge={cabin ?? 'lounge'}>
      <rect x="-200" y="0" width="800" height="236" fill="#292524" />
      <Windows top={12} bottom={150} night={night}>
        <g transform="translate(196 132) scale(1.1)">
          <PlaneSide livery={livery} />
        </g>
        {/* Another one climbing out, far off. */}
        <g className="hall-climb">
          <g transform="translate(0 70) scale(0.35) rotate(-12)">
            <PlaneSide livery="#be123c" gear={false} />
          </g>
        </g>
      </Windows>
      <rect x="-200" y="150" width="800" height="90" fill="#57534e" />
      {/* Armchairs, low tables, a lamp. */}
      {[40, 130, 270, 360].map((x, n) => (
        <g key={x}>
          <rect
            x={x - 22}
            y="178"
            width="44"
            height="34"
            rx="9"
            fill={n % 2 ? '#9a3412' : '#7c2d12'}
          />
          <rect
            x={x - 26}
            y="190"
            width="52"
            height="24"
            rx="8"
            fill={n % 2 ? '#c2410c' : '#9a3412'}
          />
        </g>
      ))}
      <rect x="182" y="196" width="40" height="6" rx="3" fill="#a16207" />
      <rect x="198" y="202" width="8" height="18" fill="#78350f" />
      <rect x="196" y="186" width="5" height="10" rx="1" fill="#f8fafc" />
      <rect x="206" y="188" width="6" height="8" rx="1" fill="#fde68a" />
      {cabin === 'business' && (
        <g>
          <rect x="120" y="20" width="160" height="20" rx="3" fill="#0f172a" />
          <text x="200" y="34" textAnchor="middle" fontSize="10" fontWeight="800" fill="#93c5fd">
            {t('Business lounge')}
          </text>
          {/* The buffet. */}
          <rect x="280" y="160" width="110" height="14" rx="3" fill="#e7e5e4" />
          {[292, 314, 336, 358, 378].map((x, n) => (
            <ellipse
              key={x}
              cx={x}
              cy="159"
              rx="8"
              ry="3"
              fill={['#ea580c', '#16a34a', '#facc15', '#b91c1c', '#f8fafc'][n]}
            />
          ))}
        </g>
      )}
    </g>
  );
}

function Gate({
  look,
  kind,
  livery,
  gate,
  toName,
  night,
}: {
  look: AvatarLook;
  kind: PlaneKind;
  livery: string;
  gate: string;
  toName: string;
  night: boolean;
}) {
  const jet = kind === 'bizjet';
  const agent = avatarLook('i-banker', `gate:${gate}`);
  return (
    <>
      <rect x="-200" y="0" width="800" height="236" fill="#e2e8f0" />
      <Windows top={10} bottom={176} night={night}>
        {jet ? (
          <g>
            <g transform="translate(200 150) scale(1.6)" data-gate-plane="bizjet">
              <PlaneSide kind="bizjet" livery={livery} />
            </g>
            {/* The airstairs down from the door, a red carpet to them. */}
            <rect x="262" y="149" width="90" height="3" fill="#b91c1c" />
            <path
              d="M 236 134 L 240 134 L 264 150 L 258 150 Z"
              fill="#e2e8f0"
              stroke="#94a3b8"
              strokeWidth="0.6"
            />
            <g stroke="#64748b" strokeWidth="0.8">
              {[0, 1, 2, 3, 4].map((k) => (
                <path key={k} d={`M ${241 + k * 4.4} ${137 + k * 2.9} h 4`} />
              ))}
            </g>
            <path d="M 240 128 L 266 144" stroke="#94a3b8" strokeWidth="1" fill="none" />
          </g>
        ) : (
          <g>
            <g transform="translate(180 150) scale(1.3)" data-gate-plane="airliner">
              <PlaneSide livery={livery} />
            </g>
            {/* The jet bridge, from the terminal out to the front door. */}
            <path d="M 228 112 L 244 112 L 252 180 L 196 180 Z" fill="#cbd5e1" />
            <path d="M 230 120 L 242 120 L 246 158 L 214 158 Z" fill="#bae6fd" opacity="0.8" />
            <rect x="228" y="108" width="17" height="26" rx="2" fill="#94a3b8" />
            <rect x="231" y="112" width="11" height="7" fill="#e2e8f0" />
            <rect x="222" y="158" width="7" height="18" fill="#64748b" />
          </g>
        )}
        <g className="hall-board">
          <g className={jet ? 'hall-board-stairs' : 'hall-board-bridge'}>
            <Person look={look} x={0} y={0} s={1} walking />
          </g>
        </g>
      </Windows>
      {/* The gate: its sign, the desk, a row of seats. */}
      <rect x="50" y="22" width="96" height="30" rx="4" fill="#0f172a" />
      <text x="60" y="35" fontSize="11" fontWeight="800" fill="#fde68a">
        {t('Gate {gate}', { gate })}
      </text>
      <text x="60" y="47" fontSize="8" fontWeight="700" fill="#4ade80">
        {toName}
      </text>
      <rect x="-200" y="176" width="800" height="70" fill="#cbd5e1" />
      <Person look={agent} x={86} y={196} s={1.3} />
      <rect x="54" y="182" width="64" height="30" rx="3" fill="#475569" />
      <rect x="52" y="178" width="68" height="6" rx="2" fill="#94a3b8" />
      <g fill="#1e3a8a">
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <g key={k}>
            <rect x={140 + k * 40} y="204" width="34" height="18" rx="5" />
            <rect x={140 + k * 40} y="190" width="34" height="14" rx="5" opacity="0.85" />
          </g>
        ))}
      </g>
    </>
  );
}

export function TerminalView({
  cabin,
  step,
  playing,
  look,
  kind,
  livery,
  airline,
  gate,
  toName,
  night,
}: {
  /** The cabin on your ticket: the lounge you wait in (missing: an older server). */
  cabin?: 'economy' | 'business' | 'first';
  step: HallStep;
  playing: boolean;
  look: AvatarLook;
  kind: PlaneKind;
  livery: string;
  airline: string;
  gate: string;
  toName: string;
  night: boolean;
}) {
  return (
    <div className={`hall hall-at-${step}${playing ? ' is-playing' : ''}`} data-hall={step}>
      <svg viewBox={VB} preserveAspectRatio="xMidYMid slice" aria-hidden>
        {step === 'checkin' ? (
          <CheckIn look={look} livery={livery} airline={airline} toName={toName} night={night} />
        ) : step === 'security' ? (
          <Security look={look} night={night} />
        ) : step === 'lounge' ? (
          <Lounge night={night} livery={livery} cabin={cabin} />
        ) : (
          <Gate look={look} kind={kind} livery={livery} gate={gate} toName={toName} night={night} />
        )}
      </svg>
    </div>
  );
}
