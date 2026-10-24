/**
 * The business and first class lounge at the departure airport (player
 * feedback: "a first-class lounge in the airport for waiting"). You wait
 * here between security and the gate:
 *
 * - `LoungeScene`, over the trip sheet: the room in 3D (./Lounge3D, lazy)
 *   or drawn (Lite, or no WebGL): runway-view windows, the bar, à la carte
 *   tables, armchairs, the quiet room's daybeds, the shower suites, the host
 *   at the desk, other travellers, and you where you chose to be. When the
 *   flight is called the departures screen lights up and a banner says so.
 *   A camera button keeps a photo.
 * - `LoungePanel`, in the trip sheet: what to do while you wait (a meal, a
 *   drink, a shower, a rest, the other travellers), each once, with what it
 *   does to you (the engine's `travel.lounge`); who's here (players flying
 *   up front from this airport, and made-up premium travellers); then
 *   "Boarding" when the flight is called.
 */
import { lazy, Suspense, useRef, useState } from 'react';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { use3d } from '../../three-kit/quality';
import { SnapButton } from '../../photos/SnapButton';
import { resultCard } from '../../photos/snap';
import { AvatarFigure, type AvatarLook } from '../art';
import { PlaneSide } from '../airport/planes';
import { CITY_NAMES, type LoungeInfo } from '../travel';
import type { LoungeSpot } from './lounge3d';
import {
  LOUNGE_ICON,
  fxLine,
  loungeLabel,
  staffLook,
  type LoungeActId,
  type Premium,
  type PremiumFx,
  type Traveller,
} from './premium';
import './premium.css';

const Lounge3D = lazy(() => import('./Lounge3D'));

const ACTS: LoungeActId[] = ['dine', 'drink', 'shower', 'rest', 'mingle'];

/** Where you stand in the drawn lounge for each spot (x, y in the SVG, and the pose). */
const DRAWN: Record<LoungeSpot, { x: number; y: number; flip?: boolean }> = {
  wait: { x: 214, y: 200 },
  dine: { x: 312, y: 186 },
  drink: { x: 92, y: 182, flip: true },
  shower: { x: 352, y: 224 },
  rest: { x: 46, y: 228 },
  mingle: { x: 250, y: 214 },
  board: { x: 420, y: 230 },
};

function Person({
  look,
  x,
  y,
  s = 1,
  flip,
}: {
  look: AvatarLook;
  x: number;
  y: number;
  s?: number;
  flip?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <AvatarFigure look={look} />
    </g>
  );
}

/** The lounge drawn (Lite): one SVG, you at the spot you chose. */
function LoungeDrawn({
  cabin,
  night,
  livery,
  me,
  crowd,
  spot,
  called,
}: {
  cabin: Premium;
  night: boolean;
  livery: string;
  me: AvatarLook;
  crowd: Traveller[];
  spot: LoungeSpot;
  called: boolean;
}) {
  const first = cabin === 'first';
  const wall = first ? '#1c1410' : '#1f2937';
  const floor = first ? '#3a2e26' : '#334155';
  const gold = first ? '#c9a227' : '#2dd4bf';
  const leather = first ? '#8b5a2b' : '#475569';
  const you = DRAWN[spot];
  return (
    <svg
      viewBox="0 0 400 250"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className="lounge-drawn"
    >
      <rect x="-200" y="0" width="800" height="250" fill={wall} />
      {/* Runway-view windows: the sky, the apron, a plane at the stand, another taking off. */}
      <rect x="-200" y="12" width="800" height="104" fill={night ? '#1e1b4b' : '#7dd3fc'} />
      <rect
        x="-200"
        y="12"
        width="800"
        height="40"
        fill={night ? '#0b1026' : '#38bdf8'}
        opacity="0.6"
      />
      <rect x="-200" y="86" width="800" height="30" fill={night ? '#374151' : '#9ca3af'} />
      <path d="M -200 100 H 600" stroke="#f8fafc" strokeWidth="1.5" strokeDasharray="12 10" />
      <g transform="translate(180 106) scale(0.9)">
        <PlaneSide livery={livery} />
      </g>
      <g className="lounge-climb">
        <g transform="translate(40 60) scale(0.3) rotate(-10)">
          <PlaneSide livery="#be123c" gear={false} />
        </g>
      </g>
      <g fill={gold}>
        {Array.from({ length: 9 }, (_, k) => (
          <rect key={k} x={-10 + k * 52} y="12" width="3" height="104" />
        ))}
        <rect x="-200" y="10" width="800" height="3" />
        <rect x="-200" y="115" width="800" height="3" />
      </g>
      <rect x="130" y="0" width="140" height="11" fill="#050505" />
      <text
        x="200"
        y="9"
        textAnchor="middle"
        fontSize="8"
        fontWeight="800"
        fill={first ? '#fcd34d' : '#93c5fd'}
      >
        {first ? t('First class lounge') : t('Business lounge')}
      </text>
      <rect x="-200" y="118" width="800" height="140" fill={floor} />
      {/* The bar, its bottles and the bartender. */}
      <rect x="6" y="120" width="120" height="24" fill="#0f0a07" opacity="0.6" />
      {Array.from({ length: 12 }, (_, k) => (
        <rect
          key={k}
          x={12 + k * 9}
          y={126 + (k % 2) * 2}
          width="4"
          height="12"
          rx="1"
          fill={['#15803d', '#b45309', '#e5e7eb', '#0e7490'][k % 4]}
        />
      ))}
      <Person look={staffLook('lounge:bartender', '#111827', false)} x={64} y={166} s={0.9} />
      <rect x="10" y="158" width="116" height="26" rx="3" fill={first ? '#5b3a22' : '#334155'} />
      <rect x="8" y="156" width="120" height="4" rx="2" fill={gold} />
      {[28, 58, 100].map((x) => (
        <rect key={x} x={x} y="148" width="3" height="9" fill="#fde68a" opacity="0.9" />
      ))}
      {/* À la carte: white cloths, leather chairs. */}
      {[300, 352].map((x) => (
        <g key={x}>
          <rect x={x - 22} y="168" width="44" height="8" rx="3" fill="#f8fafc" />
          <rect x={x - 3} y="176" width="6" height="16" fill="#3f2a1c" />
          <circle cx={x - 8} cy="167" r="3.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.6" />
          <circle cx={x + 8} cy="167" r="3.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.6" />
          <rect x={x + 13} y="160" width="2" height="7" fill="#fde68a" />
        </g>
      ))}
      {/* Armchairs round a low table. */}
      {[176, 246].map((x, n) => (
        <g key={x}>
          <rect x={x - 18} y="184" width="36" height="26" rx="8" fill={leather} />
          <rect
            x={x - 21}
            y="194"
            width="42"
            height="18"
            rx="7"
            fill={n ? leather : leather}
            opacity="0.85"
          />
        </g>
      ))}
      <rect x="196" y="200" width="30" height="5" rx="2" fill={gold} />
      {/* The quiet room: daybeds behind a screen. */}
      <rect x="-200" y="212" width="290" height="40" fill="#0f172a" opacity="0.25" />
      <rect x="90" y="196" width="4" height="54" fill={first ? '#5b3a22' : '#334155'} />
      {[20, 62].map((x) => (
        <rect
          key={x}
          x={x - 18}
          y="226"
          width="36"
          height="12"
          rx="4"
          fill={first ? '#e9dcc3' : '#cbd5e1'}
        />
      ))}
      <text
        x="48"
        y="208"
        textAnchor="middle"
        fontSize="6"
        fontWeight="700"
        fill="#e2e8f0"
        opacity="0.8"
      >
        {t('Quiet room')}
      </text>
      {/* The shower suites, frosted glass. */}
      <rect x="326" y="198" width="70" height="52" fill="#e0f2fe" opacity="0.35" />
      <text x="361" y="208" textAnchor="middle" fontSize="6" fontWeight="700" fill="#e2e8f0">
        {t('Shower suites')}
      </text>
      {/* The host at the desk. */}
      <Person
        look={staffLook('lounge:host', first ? '#1c1410' : '#0f172a')}
        x={140}
        y={238}
        s={0.9}
      />
      <rect x="120" y="226" width="44" height="18" rx="3" fill={first ? '#5b3a22' : '#334155'} />
      {/* The other travellers. */}
      {crowd.slice(0, 5).map((p, n) => {
        const at = [
          { x: 176, y: 198 },
          { x: 352, y: 186 },
          { x: 104, y: 182 },
          { x: 272, y: 214 },
          { x: 20, y: 236 },
        ][n]!;
        return <Person key={p.id} look={p.look} x={at.x} y={at.y} s={0.95} flip={n % 2 === 1} />;
      })}
      {/* You. */}
      <g
        className="lounge-you"
        style={{ transform: `translate(${you.x}px, ${you.y}px)` }}
        data-lounge-you={spot}
      >
        <g
          transform={`scale(${you.flip ? -1.05 : 1.05} 1.05)`}
          opacity={spot === 'shower' ? 0.55 : 1}
        >
          <AvatarFigure look={me} />
        </g>
        <text y="-44" textAnchor="middle" fontSize="7" fontWeight="800" fill="#fef3c7">
          {t('You')}
        </text>
      </g>
      {called && (
        <rect
          x="330"
          y="122"
          width="64"
          height="16"
          rx="2"
          fill="#050505"
          stroke="#fbbf24"
          strokeWidth="0.8"
        />
      )}
      {called && (
        <text x="362" y="133" textAnchor="middle" fontSize="7" fontWeight="800" fill="#fbbf24">
          {t('Boarding')}
        </text>
      )}
    </svg>
  );
}

export function LoungeScene({
  cabin,
  marketId,
  night,
  livery,
  me,
  crowd,
  spot,
  called,
  boardLine,
}: {
  cabin: Premium;
  marketId: string;
  night: boolean;
  livery: string;
  me: AvatarLook;
  crowd: Traveller[];
  spot: LoungeSpot;
  called: boolean;
  /** "SV 123 to London is now boarding", when the flight is called. */
  boardLine: string | null;
}) {
  const three = use3d();
  const snap = useRef<(() => string | null) | null>(null);
  const [ready, setReady] = useState(!three);
  const city = CITY_NAMES[marketId] ?? marketId;
  const title = cabin === 'first' ? t('First class lounge') : t('Business lounge');
  const [looks] = useState(() => ({
    host: staffLook('lounge:host', cabin === 'first' ? '#1c1410' : '#0f172a'),
    bartender: staffLook('lounge:bartender', '#111827', false),
    waiter: staffLook('lounge:waiter', '#f8fafc', false),
  }));
  return (
    <div
      className={`lounge-scene lounge-${cabin}`}
      data-lounge={cabin}
      data-lounge-spot={spot}
      data-lounge-called={called ? 'yes' : 'no'}
      data-lounge-ready={ready ? 'yes' : 'no'}
    >
      {three ? (
        <Suspense fallback={<div className="lounge-loading">{title}</div>}>
          <Lounge3D
            cabin={cabin}
            night={night}
            livery={livery}
            me={me}
            crowd={crowd.map((c) => c.look)}
            host={looks.host}
            bartender={looks.bartender}
            waiter={looks.waiter}
            spot={spot}
            called={called}
            onReady={() => setReady(true)}
            onCamera={(f) => {
              snap.current = f;
            }}
          />
        </Suspense>
      ) : (
        <LoungeDrawn
          cabin={cabin}
          night={night}
          livery={livery}
          me={me}
          crowd={crowd}
          spot={spot}
          called={called}
        />
      )}
      <div className="lounge-sign">
        <b>{title}</b>
        <span className="small">{city}</span>
      </div>
      {boardLine && (
        <p className="lounge-call" role="status" data-lounge-call="">
          <span aria-hidden="true">🔔</span> {boardLine}
        </p>
      )}
      <SnapButton
        action="lounge-photo"
        className="btn btn-subtle lounge-snap"
        label={t('Photo')}
        title={title}
        file="my-lounge"
        city={city}
        make={() =>
          snap.current?.() ??
          resultCard({
            kicker: `${title} · ${city}`,
            title: t('Waiting in style'),
            subtitle: crowd
              .slice(0, 3)
              .map((c) => c.name)
              .join(' · '),
            stats: [],
            footer: city,
            tone: 'night',
          })
        }
      />
    </div>
  );
}

/** The spot you're at in the lounge for an act. */
export const spotOf = (act: LoungeActId): LoungeSpot => act;

export function LoungePanel({
  info,
  crowd,
  called,
  onSpot,
  onBoard,
  toName,
}: {
  info: LoungeInfo;
  crowd: Traveller[];
  called: boolean;
  onSpot: (s: LoungeSpot) => void;
  onBoard: () => void;
  toName: string;
}) {
  const { send, busy } = useView();
  const [last, setLast] = useState<{ act: string; text: string; fx: PremiumFx } | null>(null);
  const cabin = info.cabin;
  const run = async (act: LoungeActId, withId?: string) => {
    onSpot(spotOf(act));
    const r = await send<{ text: string; changes: PremiumFx }>({
      type: 'travel.lounge',
      act,
      ...(withId ? { with: withId } : {}),
    });
    if (r) setLast({ act, text: tx(r.text), fx: r.changes ?? {} });
  };
  return (
    <div className="lounge-panel" data-lounge-panel={cabin}>
      <p className="small muted">
        {cabin === 'first'
          ? t('Your flight isn’t called yet. The lounge is yours: what would you like?')
          : t('Your flight isn’t called yet. What would you like while you wait?')}
      </p>
      <ul className="lounge-acts">
        {ACTS.map((act) => {
          const opt = info.acts.find((a) => a.act === act);
          const done = info.done.includes(act);
          return (
            <li key={act}>
              <button
                type="button"
                className={`lounge-act${done ? ' is-done' : ''}`}
                data-lounge-act={act}
                disabled={busy || done}
                onClick={() => void run(act)}
              >
                <span aria-hidden="true">{LOUNGE_ICON[act]}</span>
                <b>{loungeLabel(act, cabin)}</b>
                <span className="small muted">{done ? t('Done') : opt ? fxLine(opt) : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {last && (
        <p className="lounge-result small" data-lounge-result={last.act} role="status">
          {last.text} {fxLine(last.fx) && <span className="muted">({fxLine(last.fx)})</span>}
        </p>
      )}
      <div className="lounge-people" data-lounge-people="">
        <b className="small">{t('Who’s here')}</b>
        <ul>
          {info.guests.map((g) => (
            <li key={g.id} data-lounge-guest={g.id}>
              <span>
                <b>{g.name}</b>{' '}
                <span className="small muted">
                  {t('Flying {cabin} to {city}', {
                    cabin: g.cabin === 'first' ? t('First class') : t('Business'),
                    city: g.toName,
                  })}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-subtle"
                disabled={busy || info.done.includes('mingle')}
                onClick={() => void run('mingle', g.id)}
              >
                {t('Say hello')}
              </button>
            </li>
          ))}
          {crowd.slice(0, 4).map((c) => (
            <li key={c.id} data-lounge-traveller="">
              <span>
                <b>{c.name}</b> <span className="small muted">{c.role}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {called ? (
        <button
          type="button"
          className="btn btn-primary trip-go"
          data-lounge-board=""
          onClick={onBoard}
        >
          {t('Boarding: go to the gate for {city}', { city: toName })}
        </button>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={onBoard}>
          {t('Go to the gate')}
        </button>
      )}
    </div>
  );
}
