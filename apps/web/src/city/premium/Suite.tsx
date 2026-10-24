/**
 * The flight in business or first class (player feedback: "The first class
 * just shows a private seat: improve this experience to actually show how
 * it is in flight"). Instead of the cabin going by on a timer, you live the
 * flight: a timeline from take-off to the meal, the night and the arrival,
 * and at each moment something to choose.
 *
 * - Take-off: the crew member who looks after you brings champagne; the
 *   amenity kit and pyjamas wait on the ottoman (first); the doors slide
 *   shut if you like. Watch a film, work, or (first, long haul) go to the
 *   onboard bar or the shower spa.
 * - The meal: dine on demand (first: five courses; business: three), each
 *   served at your seat on china, with champagne in first.
 * - The night: turndown (first: the seat becomes a made-up bed, the doors
 *   close, the lights dim; business: lie flat), or work through it.
 * - Arrival: what the flight did to you, then "Prepare for landing".
 *
 * Each act goes to the engine once (`travel.inflight`): its effects land
 * with you. The scene is 3D (./Suite3D, lazy) or drawn (Lite). A camera
 * button keeps a photo. The cabin's service card (../acts/CabinService)
 * stays for what each class gives you.
 */
import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { use3d } from '../../three-kit/quality';
import { SnapButton } from '../../photos/SnapButton';
import { resultCard } from '../../photos/snap';
import { AvatarFigure, avatarLook, type AvatarLook } from '../art';
import { CabinService } from '../acts/CabinService';
import { genderOf } from '../life';
import { CITY_GEO, CITY_NAMES, fmtFlightTime, inflightOf } from '../travel';
import { skyOver } from '../flight3d/world';
import type { SuiteState } from './suite3d';
import {
  FLIGHT_STAGES,
  INFLIGHT_ICON,
  addFx,
  crewName,
  fxLine,
  inflightLabel,
  menuFor,
  stageLabel,
  staffLook,
  type FlightStage,
  type InflightActId,
  type Premium,
  type PremiumFx,
} from './premium';
import './premium.css';

const Suite3D = lazy(() => import('./Suite3D'));

/** Now, or `runway.flightClock` (a date, for screenshots), like the flight's own sky. */
function flightNow(): number {
  try {
    const v = localStorage.getItem('runway.flightClock');
    const n = v ? (Number.isFinite(Number(v)) ? Number(v) : Date.parse(v)) : NaN;
    if (Number.isFinite(n)) return n;
  } catch {
    /* storage blocked: now */
  }
  return Date.now();
}

/** What each moment offers (and the bar and spa only on a first class long haul). */
const OFFER: Record<FlightStage, InflightActId[]> = {
  boarding: ['watch', 'work', 'bar', 'spa'],
  meal: ['dine', 'watch'],
  night: ['sleep', 'work', 'watch'],
  arrival: ['spa', 'bar'],
};

/** The crew's line at each moment. */
function crewLine(stage: FlightStage, cabin: Premium, name: string, city: string): string {
  if (stage === 'boarding')
    return cabin === 'first'
      ? t(
          '{name}: Welcome aboard. A glass of champagne? Your pyjamas and kit are on the ottoman.',
          {
            name,
          },
        )
      : t('{name}: Welcome aboard. Something to drink before we take off?', { name });
  if (stage === 'meal')
    return cabin === 'first'
      ? t('{name}: Whenever you’re ready, I’ll serve the menu course by course.', { name })
      : t('{name}: Dinner is three courses tonight. Shall I bring the first?', { name });
  if (stage === 'night')
    return cabin === 'first'
      ? t('{name}: Shall I make up your bed? I’ll close the doors for you.', { name })
      : t('{name}: Your seat goes fully flat. Sleep well.', { name });
  return t('{name}: Good morning. We land in {city} shortly.', { name, city });
}

/** The suite drawn (Lite): the window, the seat or the bed, the screen, the table, the crew. */
function SuiteDrawn({
  cabin,
  me,
  crew,
  state,
  night,
}: {
  cabin: Premium;
  me: AvatarLook;
  crew: AvatarLook;
  state: SuiteState;
  night: boolean;
}) {
  const first = cabin === 'first';
  const wood = first ? '#5b3a22' : '#334155';
  const leather = first ? '#e9dcc3' : '#64748b';
  const sleeping = state.act === 'sleep';
  const dark = sleeping || state.stage === 'night';
  const away = state.act === 'bar' || state.act === 'spa';
  const closed = first && state.doors === 'closed';
  return (
    <svg
      viewBox="0 0 400 260"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={`suite-drawn${dark ? ' is-dark' : ''}`}
    >
      <rect x="-200" y="0" width="800" height="260" fill={first ? '#f5efe6' : '#e2e8f0'} />
      {/* Windows onto the sky. */}
      {[50, 130, 210].map((x) => (
        <g key={x}>
          <rect x={x} y="30" width="44" height="60" rx="20" fill={night ? '#1e1b4b' : '#7dd3fc'} />
          <rect x={x} y="62" width="44" height="12" fill="#f8fafc" opacity="0.8" />
          <rect
            x={x}
            y="30"
            width="44"
            height="60"
            rx="20"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="3"
          />
        </g>
      ))}
      {/* The screen on the bulkhead. */}
      <rect x="290" y="40" width={first ? 92 : 66} height={first ? 54 : 40} rx="4" fill="#0f172a" />
      <rect
        x="294"
        y="44"
        width={first ? 84 : 58}
        height={first ? 46 : 32}
        fill={state.act === 'watch' ? '#f97316' : '#1e3a8a'}
        data-suite-screen={state.act === 'watch' ? 'film' : 'map'}
      />
      <rect x="-200" y="186" width="800" height="80" fill={first ? '#3a2e26' : '#2b3850'} />
      {/* The console and its lamp. */}
      <rect x="240" y="150" width="54" height="40" fill={wood} />
      <rect x="262" y="128" width="6" height="22" fill="#c9a227" />
      <circle cx="265" cy="126" r="9" fill="#fde68a" opacity={dark ? 0.9 : 0.6} />
      {/* The seat, or the bed made up. */}
      {sleeping ? (
        <g data-suite-bed="">
          <rect x="40" y="160" width="200" height="22" rx="6" fill="#f8fafc" />
          <rect
            x="40"
            y="152"
            width="130"
            height="14"
            rx="5"
            fill={first ? '#1e3a8a' : '#64748b'}
          />
          <rect x="196" y="150" width="36" height="14" rx="6" fill="#ffffff" />
          {!away && (
            <g transform="translate(160 158) rotate(-90) scale(0.9)">
              <AvatarFigure look={me} />
            </g>
          )}
        </g>
      ) : (
        <g data-suite-seat="">
          <rect x="120" y="96" width="40" height="80" rx="10" fill={leather} />
          <rect x="70" y="150" width="90" height="26" rx="8" fill={leather} />
          <rect x="74" y="176" width="80" height="12" fill={wood} />
          {!away && (
            <g transform="translate(118 176) scale(1.05)">
              <AvatarFigure look={me} />
            </g>
          )}
        </g>
      )}
      {/* The ottoman with the kit and pyjamas. */}
      <rect x="10" y="160" width="46" height="28" rx="6" fill={leather} />
      {state.stage === 'boarding' && state.act === null && (
        <g data-suite-kit="">
          <rect x="16" y="152" width="18" height="8" rx="2" fill={first ? '#7c2d12' : '#1e3a8a'} />
          {first && <rect x="36" y="153" width="16" height="7" rx="2" fill="#cbd5e1" />}
        </g>
      )}
      {/* The table with the course on china, and champagne. */}
      {state.course > 0 && !sleeping && !away && (
        <g data-suite-table={state.course}>
          <rect x="60" y="138" width="70" height="6" rx="2" fill="#f8fafc" />
          <ellipse
            cx="90"
            cy="137"
            rx="14"
            ry="4"
            fill={state.plate?.[0] ?? '#f8fafc'}
            stroke="#cbd5e1"
          />
          <ellipse cx="90" cy="135" rx="7" ry="3" fill={state.plate?.[1] ?? '#7c2d12'} />
          <rect x="118" y="124" width="3" height="13" fill={first ? '#fde68a' : '#7f1d1d'} />
        </g>
      )}
      {/* The crew at your door. */}
      <g transform="translate(330 196) scale(1.1)">
        <AvatarFigure look={crew} />
      </g>
      {/* The doors (first): two panels that slide shut. */}
      {first && (
        <g className="suite-doors" data-suite-doors={closed ? 'closed' : 'open'}>
          <rect x={closed ? 300 : 360} y="100" width="40" height="90" fill={wood} opacity="0.95" />
          <rect x={closed ? 340 : 392} y="100" width="40" height="90" fill={wood} opacity="0.95" />
        </g>
      )}
      {dark && <rect x="-200" y="0" width="800" height="260" fill="#1e1b4b" opacity="0.45" />}
      {state.act === 'bar' && (
        <text x="200" y="120" textAnchor="middle" fontSize="16" fontWeight="800" fill="#7c2d12">
          🍸 {t('Onboard bar')}
        </text>
      )}
      {state.act === 'spa' && (
        <text x="200" y="120" textAnchor="middle" fontSize="16" fontWeight="800" fill="#0e7490">
          🚿 {t('Shower spa')}
        </text>
      )}
    </svg>
  );
}

export function SuiteFlight({
  cabin,
  from,
  to,
  hours,
  onLand,
}: {
  cabin: Premium;
  from: string;
  to: string;
  /** The flight's real length (hours). */
  hours: number;
  /** "Prepare for landing": on to the landing. */
  onLand: () => void;
}) {
  const { view, send, busy } = useView();
  const three = use3d();
  const info = inflightOf(view);
  const toName = CITY_NAMES[to] ?? to;
  const crew = crewName(`${from}:${to}:${cabin}`);
  const [stage, setStage] = useState<FlightStage>('boarding');
  const [act, setAct] = useState<InflightActId | null>(null);
  const [course, setCourse] = useState(0);
  const [doors, setDoors] = useState<'open' | 'closed'>('open');
  const [total, setTotal] = useState<PremiumFx>({});
  const [last, setLast] = useState<{ act: InflightActId; text: string; fx: PremiumFx } | null>(
    null,
  );
  const [ready, setReady] = useState(!three);
  const snap = useRef<(() => string | null) | null>(null);
  const menu = useMemo(() => menuFor(cabin), [cabin]);
  const looks = useMemo(
    () => ({
      me: avatarLook(view.me.background?.id, view.me.id, genderOf(view.me)),
      crew: staffLook(`crew:${from}:${to}`, cabin === 'first' ? '#1c1410' : '#1e293b'),
      others: [
        avatarLook('i-banker', `${from}:${to}:pax:0`),
        avatarLook('f-corporate', `${from}:${to}:pax:1`),
      ],
    }),
    // The flight's people don't change while it shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // The sky over the route's midpoint, halfway through the flight (the windows).
  const [sky] = useState(() => {
    const a = CITY_GEO[from];
    const b = CITY_GEO[to];
    const lat = ((a?.lat ?? 0) + (b?.lat ?? 0)) / 2;
    const lon = ((a?.lon ?? 0) + (b?.lon ?? 0)) / 2;
    const s = skyOver(lat, lon, flightNow() + (hours * 3_600_000) / 2).state;
    return {
      zenith: `#${s.zenith.getHexString()}`,
      horizon: `#${s.horizon.getHexString()}`,
      night: s.night > 0.5,
    };
  });
  const state = useMemo<SuiteState>(
    () => ({
      stage,
      act,
      course,
      plate: course > 0 ? menu[Math.min(course, menu.length) - 1]!.colors : null,
      doors,
    }),
    [stage, act, course, doors, menu],
  );
  const offered = (a: InflightActId) =>
    info ? info.acts.some((x) => x.act === a) : a !== 'bar' && a !== 'spa';
  const done = (a: InflightActId) => !!info?.done.includes(a);
  const fxOf = (a: InflightActId) => {
    const o = info?.acts.find((x) => x.act === a);
    if (!o) return '';
    const { act: _a, ...rest } = o;
    void _a;
    return fxLine(rest);
  };

  /** Do something: the scene changes at once; the engine applies its effects (once). */
  const run = async (a: InflightActId) => {
    setAct(a);
    if (a === 'sleep') setDoors('closed');
    if (a === 'dine' && course === 0) setCourse(1);
    if (!info || done(a)) return;
    const r = await send<{ text: string; changes: PremiumFx }>({ type: 'travel.inflight', act: a });
    if (r) {
      setLast({ act: a, text: tx(r.text), fx: r.changes ?? {} });
      setTotal((x) => addFx(x, r.changes ?? {}));
    }
  };
  const next = () => {
    const i = FLIGHT_STAGES.indexOf(stage);
    const n = FLIGHT_STAGES[Math.min(FLIGHT_STAGES.length - 1, i + 1)]!;
    setStage(n);
    // Morning: the bed goes back to a seat and the doors open.
    if (n === 'arrival') {
      setAct(null);
      setDoors('open');
    } else if (n === 'night') setAct(null);
    else if (n === 'meal') setAct(null);
  };

  const city = CITY_NAMES[from] ?? from;
  const title = cabin === 'first' ? t('First class suite') : t('Business class seat');
  return (
    <div
      className={`fl-cabin suite-flight cab-${cabin}`}
      data-cabin={cabin}
      data-suite-stage={stage}
      data-suite-act={act ?? 'none'}
      data-suite-doors={doors}
      data-suite-ready={ready ? 'yes' : 'no'}
    >
      <div className="suite-scene">
        {three ? (
          <Suspense fallback={<div className="suite-loading">{title}</div>}>
            <Suite3D
              cabin={cabin}
              me={looks.me}
              crew={looks.crew}
              others={looks.others}
              zenith={sky.zenith}
              horizon={sky.horizon}
              night={sky.night}
              state={state}
              onReady={() => setReady(true)}
              onCamera={(f) => {
                snap.current = f;
              }}
            />
          </Suspense>
        ) : (
          <SuiteDrawn
            cabin={cabin}
            me={looks.me}
            crew={looks.crew}
            state={state}
            night={sky.night}
          />
        )}
        <ol className="suite-timeline" aria-label={t('Your flight')}>
          {FLIGHT_STAGES.map((s, n) => (
            <li
              key={s}
              className={`${s === stage ? 'is-now' : ''}${FLIGHT_STAGES.indexOf(stage) > n ? ' is-done' : ''}`}
              data-flight-stage={s}
              aria-current={s === stage ? 'step' : undefined}
            >
              {stageLabel(s)}
            </li>
          ))}
        </ol>
        <p className="suite-crew" data-suite-crew="">
          {crewLine(stage, cabin, crew, toName)}
        </p>
        <SnapButton
          action="suite-photo"
          className="btn btn-subtle suite-snap"
          label={t('Photo')}
          title={title}
          file="my-suite"
          city={city}
          make={() =>
            snap.current?.() ??
            resultCard({
              kicker: `${title} · ${city} → ${toName}`,
              title: cabin === 'first' ? t('Flying first class') : t('Flying business class'),
              subtitle: fmtFlightTime(hours),
              stats: [],
              footer: toName,
              tone: 'night',
            })
          }
        />
      </div>
      <div className="suite-panel">
        {stage === 'meal' && (
          <div className="suite-menu" data-suite-menu="">
            <b className="small">{cabin === 'first' ? t('Dine on demand') : t('Tonight’s menu')}</b>
            <ol>
              {menu.map((c, n) => (
                <li
                  key={c.id}
                  className={n < course ? 'is-served' : ''}
                  data-course={c.id}
                  data-served={n < course ? 'yes' : 'no'}
                >
                  {c.name()}
                </li>
              ))}
            </ol>
            {course > 0 && course < menu.length && (
              <button
                type="button"
                className="btn btn-subtle"
                data-next-course=""
                onClick={() => setCourse((c) => Math.min(menu.length, c + 1))}
              >
                {t('Serve the next course')}
              </button>
            )}
          </div>
        )}
        <div className="suite-acts">
          {OFFER[stage]
            .filter((a) => offered(a))
            .map((a) => (
              <button
                key={a}
                type="button"
                className={`suite-act${act === a ? ' is-on' : ''}${done(a) ? ' is-done' : ''}`}
                data-inflight-act={a}
                disabled={busy && !done(a)}
                onClick={() => void run(a)}
              >
                <span aria-hidden="true">{INFLIGHT_ICON[a]}</span>
                <b>{inflightLabel(a, cabin)}</b>
                <span className="small muted">{done(a) ? t('Done') : fxOf(a)}</span>
              </button>
            ))}
          {cabin === 'first' && (
            <button
              type="button"
              className="suite-act"
              data-suite-door-toggle=""
              aria-pressed={doors === 'closed'}
              onClick={() => setDoors((d) => (d === 'open' ? 'closed' : 'open'))}
            >
              <span aria-hidden="true">🚪</span>
              <b>{doors === 'open' ? t('Close the doors') : t('Open the doors')}</b>
            </button>
          )}
        </div>
        {last && (
          <p className="suite-result small" role="status" data-inflight-result={last.act}>
            {last.text} {fxLine(last.fx) && <span className="muted">({fxLine(last.fx)})</span>}
          </p>
        )}
        {stage === 'arrival' && (
          <p className="suite-summary small" data-flight-summary="">
            {fxLine(total) ? t('On arrival: {fx}', { fx: fxLine(total) }) : t('You land rested.')}
          </p>
        )}
        <details className="suite-service">
          <summary className="small">{t('What your cabin includes')}</summary>
          <CabinService cls={cabin} />
        </details>
        {stage === 'arrival' ? (
          <button type="button" className="btn btn-primary" data-suite-land="" onClick={onLand}>
            {t('Prepare for landing')}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" data-suite-next="" onClick={next}>
            {t('Next: {stage}', {
              stage: stageLabel(FLIGHT_STAGES[FLIGHT_STAGES.indexOf(stage) + 1]!),
            })}{' '}
            ›
          </button>
        )}
      </div>
    </div>
  );
}
