/**
 * Wave 7 §B: a busy airport. Top to bottom:
 *
 * 1. A split-flap departures board, amber on black: six rows (time, flight,
 *    destination, gate, status). The day's schedule is deterministic from
 *    the airport and the game day; destinations are the game's markets and
 *    the airlines are made-up local ones.
 * 2. The apron from above: gates, a taxiway and the runway, planes pushing
 *    back, taxiing, taking off and landing (something moves every few
 *    seconds), and ground vehicles.
 * 3. The terminal: travellers walking with their bags.
 *
 * And a bottom sheet "Your trip", in the order of a real trip: the ticket
 * desk (where do you want to go? the time, the fare; book it, unless you
 * booked in the Travel app) → check in for that flight (the boarding pass
 * names the destination) → security → the lounge (Who's here: investors wait
 * for flights too) → board, each step a short animation you can skip. "More" keeps the detailed cards (departures, trips).
 *
 * One requestAnimationFrame loop moves the planes, vehicles and people
 * through refs; it stops while the tab is hidden or motion is reduced.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { money } from '../../format';
import { t } from '../../i18n';
import { useView } from '../../store';
import { AvatarFigure, avatarLook } from '../art';
import type { FlightDesk } from '../Interiors';
import type { Place } from '../layout';
import type { PersonRef } from '../PersonCard';
import type { PresenceView } from '../people';
import { reduceMotion } from '../ride/state';
import {
  AIRPORT_NAMES,
  airportSchedule,
  boardRows,
  CITY_NAMES,
  fmtFlightTime,
  localMinutes,
  scheduleDay,
  type FlightStatus,
  type ScheduledFlight,
} from '../travel';
import { bookCommand, nextBookable, seatOf, ticketFrom, useTicket, type Ticket } from '../ticket';
import { WhoIsHere } from '../WhoIsHere';
import './airport.css';

const STATUS_LABEL = (s: FlightStatus) =>
  s === 'Boarding'
    ? t('Boarding')
    : s === 'Delayed'
      ? t('Delayed')
      : s === 'Departed'
        ? t('Departed')
        : s === 'Landed'
          ? t('Landed')
          : t('On time');

// ---------------------------------------------------------------------------
// The split-flap board

/** One cell of letters; each letter flips in turn when the text changes. */
function Flaps({ text, width, delay }: { text: string; width: number; delay: number }) {
  const chars = text.toUpperCase().padEnd(width, ' ').slice(0, width).split('');
  return (
    <span className="flaps" aria-hidden key={text}>
      {chars.map((c, i) => (
        <span key={i} className="flap" style={{ animationDelay: `${delay + i * 0.035}s` }}>
          {c === ' ' ? ' ' : c}
        </span>
      ))}
    </span>
  );
}

function Board({ marketId, day }: { marketId: string; day: string }) {
  const schedule = useMemo(() => airportSchedule(marketId, day), [marketId, day]);
  // The board moves on: every few seconds it's a few minutes later.
  const [clock, setClock] = useState(() => ({ base: localMinutes(marketId), tick: 0 }));
  useEffect(() => {
    if (reduceMotion()) return;
    const id = setInterval(() => setClock((c) => ({ ...c, tick: c.tick + 1 })), 6000);
    return () => clearInterval(id);
  }, []);
  const now = clock.base + clock.tick * 6;
  const rows = boardRows(schedule, now);
  return (
    <section className="board" aria-label={t('Departures board')}>
      <header className="board-head">
        <span>{t('Departures and arrivals')}</span>
        <span>{AIRPORT_NAMES[marketId] ?? ''}</span>
      </header>
      <table>
        <thead className="sr-only">
          <tr>
            <th>{t('Time')}</th>
            <th>{t('Flight')}</th>
            <th>{t('Destination')}</th>
            <th>{t('Gate')}</th>
            <th>{t('Status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, n) => {
            const where = r.arrival ? t('from {city}', { city: r.cityName }) : r.cityName;
            const status = STATUS_LABEL(r.status);
            return (
              <tr
                key={`${r.flight}:${r.at}`}
                data-board-row=""
                data-status={r.status}
                className={`is-${r.status.toLowerCase().replace(' ', '-')}`}
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
                  <span className="sr-only">{where}</span>
                  <Flaps text={where} width={13} delay={n * 0.08 + 0.2} />
                </td>
                <td>
                  <span className="sr-only">{r.gate}</span>
                  <Flaps text={r.gate} width={3} delay={n * 0.08 + 0.3} />
                </td>
                <td className="board-status">
                  <span className="sr-only">{status}</span>
                  <Flaps text={status} width={9} delay={n * 0.08 + 0.35} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The apron and the terminal

interface Key {
  t: number;
  x: number;
  y: number;
  r: number;
  s?: number;
  o?: number;
}

const GATES = [70, 160, 250, 340];
const TAXI_Y = 132;
const RWY_Y = 200;

/** A departure: push back, taxi to the runway's west end, roll and lift. */
const departure = (gx: number): Key[] => [
  { t: 0, x: gx, y: 70, r: 90 },
  { t: 1800, x: gx, y: 70, r: 90 },
  { t: 3200, x: gx, y: TAXI_Y, r: 90 },
  { t: 3800, x: gx, y: TAXI_Y, r: 180 },
  { t: 3800 + gx * 14, x: 24, y: TAXI_Y, r: 180 },
  { t: 4600 + gx * 14, x: 24, y: RWY_Y, r: 90 },
  { t: 5000 + gx * 14, x: 24, y: RWY_Y, r: 0 },
  { t: 7600 + gx * 14, x: 360, y: RWY_Y, r: 0, s: 1.15 },
  { t: 8600 + gx * 14, x: 470, y: RWY_Y - 26, r: -8, s: 1.7, o: 0 },
];
/** An arrival: touch down from the east, slow, turn off and taxi to a gate. */
const arrival = (gx: number): Key[] => [
  { t: 0, x: 500, y: RWY_Y - 30, r: 188, s: 1.7, o: 0 },
  { t: 1200, x: 380, y: RWY_Y, r: 180, s: 1.15 },
  { t: 3600, x: 120, y: RWY_Y, r: 180 },
  { t: 4200, x: 90, y: RWY_Y, r: 270 },
  { t: 5000, x: 90, y: TAXI_Y, r: 270 },
  { t: 5400, x: 90, y: TAXI_Y, r: 0 },
  { t: 5400 + Math.abs(gx - 90) * 14, x: gx, y: TAXI_Y, r: 0 },
  { t: 5900 + Math.abs(gx - 90) * 14, x: gx, y: TAXI_Y, r: 270 },
  { t: 7200 + Math.abs(gx - 90) * 14, x: gx, y: 70, r: 270 },
];

interface PlaneSpec {
  keys: Key[];
  period: number;
  offset: number;
  livery: string;
}

function at(keys: Key[], ms: number) {
  const last = keys[keys.length - 1]!;
  if (ms >= last.t) return { ...last, s: last.s ?? 1, o: last.o ?? 1 };
  let i = 1;
  while (i < keys.length && keys[i]!.t <= ms) i++;
  const a = keys[i - 1]!;
  const b = keys[i]!;
  const f = (ms - a.t) / Math.max(1, b.t - a.t);
  let dr = b.r - a.r;
  if (dr > 180) dr -= 360;
  if (dr < -180) dr += 360;
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    r: a.r + dr * f,
    s: (a.s ?? 1) + ((b.s ?? 1) - (a.s ?? 1)) * f,
    o: (a.o ?? 1) + ((b.o ?? 1) - (a.o ?? 1)) * f,
  };
}

/** A top-down airliner, nose along +x. */
function PlaneTop({ livery }: { livery: string }) {
  return (
    <g>
      <ellipse cx="2" cy="3" rx="20" ry="16" fill="#0f172a" opacity="0.12" />
      <path
        d="M 4 -2 L -6 -18 L -11 -18 L -6 -2 Z M 4 2 L -6 18 L -11 18 L -6 2 Z"
        fill="#e2e8f0"
        stroke="#64748b"
        strokeWidth="0.6"
      />
      <path
        d="M 20 0 Q 18 -3 12 -3 L -14 -3 L -19 -1 L -19 1 L -14 3 L 12 3 Q 18 3 20 0 Z"
        fill="#f8fafc"
        stroke="#64748b"
        strokeWidth="0.6"
      />
      <path
        d="M -14 -2 L -19 -8 L -21 -8 L -18 -1 Z M -14 2 L -19 8 L -21 8 L -18 1 Z"
        fill={livery}
      />
    </g>
  );
}

function Apron({
  schedule,
  walkers,
}: {
  schedule: ScheduledFlight[];
  walkers: { look: ReturnType<typeof avatarLook>; speed: number; y: number; bag: string }[];
}) {
  const planes = useMemo<PlaneSpec[]>(() => {
    const liveries = [...new Set(schedule.map((f) => f.livery))];
    const L = (n: number) => liveries[n % Math.max(1, liveries.length)] ?? '#0f766e';
    return [
      { keys: departure(GATES[0]!), period: 13000, offset: 0, livery: L(0) },
      { keys: arrival(GATES[1]!), period: 14000, offset: 3000, livery: L(1) },
      { keys: departure(GATES[2]!), period: 15000, offset: 6500, livery: L(2) },
      { keys: arrival(GATES[3]!), period: 16000, offset: 9500, livery: L(3) },
      // A touch-and-go: lands from the east and lifts off again to the west.
      {
        keys: [
          { t: 0, x: 500, y: RWY_Y - 30, r: 180, s: 1.7, o: 0 },
          { t: 1200, x: 380, y: RWY_Y, r: 180, s: 1.15 },
          { t: 3000, x: 160, y: RWY_Y, r: 180 },
          { t: 4400, x: -80, y: RWY_Y - 26, r: 172, s: 1.7, o: 0 },
        ],
        period: 11000,
        offset: 1500,
        livery: L(4),
      },
    ];
  }, [schedule]);
  const planeRefs = useRef<(SVGGElement | null)[]>([]);
  const carRefs = useRef<(SVGGElement | null)[]>([]);
  const walkerRefs = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const put = (ms: number) => {
      planes.forEach((p, n) => {
        const el = planeRefs.current[n];
        if (!el) return;
        const local = (ms + p.offset) % p.period;
        const k = at(p.keys, local);
        el.setAttribute(
          'transform',
          `translate(${k.x.toFixed(1)} ${k.y.toFixed(1)}) rotate(${k.r.toFixed(1)}) scale(${k.s.toFixed(2)})`,
        );
        el.setAttribute('opacity', k.o.toFixed(2));
      });
      carRefs.current.forEach((el, n) => {
        if (!el) return;
        const span = 360;
        const cyc = ((ms / 1000) * (n ? 34 : 24) + n * 170) % (span * 2);
        const x = cyc < span ? 20 + cyc : 20 + span * 2 - cyc;
        el.setAttribute(
          'transform',
          `translate(${x.toFixed(1)} ${n ? 104 : 96}) scale(${cyc < span ? 1 : -1} 1)`,
        );
      });
      walkerRefs.current.forEach((el, n) => {
        if (!el) return;
        const w = walkers[n]!;
        const span = 460;
        const x = (((((ms / 1000) * w.speed + n * 53) % span) + span) % span) - 30;
        const dir = w.speed > 0 ? 1 : -1;
        el.setAttribute('transform', `translate(${x.toFixed(1)} ${w.y}) scale(${dir * 0.9} 0.9)`);
      });
    };
    put(2000);
    if (reduceMotion()) return;
    const step = (now: number) => {
      put(now - t0 + 2000);
      raf = requestAnimationFrame(step);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [planes, walkers]);

  return (
    <>
      <div className="apron">
        <svg
          viewBox="0 0 400 236"
          preserveAspectRatio="xMidYMid slice"
          role="img"
          aria-label={t('The apron: planes coming and going')}
        >
          <rect x="-200" y="-50" width="800" height="400" fill="#9ca3af" />
          <rect x="-200" y="160" width="800" height="200" fill="#86efac" opacity="0.6" />
          {/* Terminal and jet bridges. */}
          <rect x="-200" y="0" width="800" height="40" fill="#e2e8f0" />
          <rect x="-200" y="34" width="800" height="6" fill="#93c5fd" />
          {GATES.map((g, n) => (
            <g key={g}>
              <rect x={g + 2} y="40" width="8" height="26" fill="#cbd5e1" stroke="#94a3b8" />
              <text x={g - 22} y="56" fontSize="9" fontWeight="800" fill="#475569">
                {`A${n + 1}`}
              </text>
              <path d={`M ${g} 92 V 104`} stroke="#facc15" strokeWidth="2" />
            </g>
          ))}
          {/* Service road, taxiway and runway. */}
          <rect x="-200" y="92" width="800" height="16" fill="#6b7280" />
          <path
            d={`M -200 ${TAXI_Y} H 600`}
            stroke="#facc15"
            strokeWidth="2"
            strokeDasharray="8 6"
          />
          <rect x="-200" y={RWY_Y - 16} width="800" height="32" fill="#374151" />
          <path
            d={`M -200 ${RWY_Y} H 600`}
            stroke="#f8fafc"
            strokeWidth="2"
            strokeDasharray="16 12"
          />
          {[10, 18, 26].map((x) => (
            <rect key={x} x={x} y={RWY_Y - 12} width="4" height="24" fill="#f8fafc" />
          ))}
          <text
            x="44"
            y={RWY_Y + 5}
            fontSize="12"
            fontWeight="800"
            fill="#f8fafc"
            transform={`rotate(90 44 ${RWY_Y})`}
          >
            09
          </text>
          {[0, 1].map((n) => (
            <g
              key={n}
              ref={(el) => {
                carRefs.current[n] = el;
              }}
              data-ground-vehicle=""
            >
              <rect x="-9" y="-4" width="18" height="8" rx="2" fill={n ? '#f59e0b' : '#e11d48'} />
              {!n && (
                <>
                  <rect x="-24" y="-3" width="12" height="6" fill="#64748b" />
                  <rect x="-38" y="-3" width="12" height="6" fill="#64748b" />
                </>
              )}
            </g>
          ))}
          {planes.map((p, n) => (
            <g
              key={n}
              ref={(el) => {
                planeRefs.current[n] = el;
              }}
              data-plane=""
            >
              <PlaneTop livery={p.livery} />
            </g>
          ))}
        </svg>
      </div>
      <div className="terminal">
        <svg viewBox="0 0 400 90" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <rect x="-200" y="-10" width="800" height="110" fill="#f1f5f9" />
          <rect x="-200" y="-10" width="800" height="40" fill="#cbd5e1" />
          {Array.from({ length: 10 }, (_, k) => (
            <rect key={k} x={-200 + k * 80} y="-4" width="60" height="28" fill="#bae6fd" />
          ))}
          <rect x="-200" y="58" width="800" height="3" fill="#e2e8f0" />
          {walkers.map((w, n) => (
            <g
              key={n}
              ref={(el) => {
                walkerRefs.current[n] = el;
              }}
              transform={`translate(${n * 40} ${w.y})`}
            >
              <rect x="-17" y="-14" width="10" height="13" rx="2" fill={w.bag} />
              <AvatarFigure look={w.look} />
            </g>
          ))}
        </svg>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Your trip

type Step = 'ticket' | 'checkin' | 'security' | 'lounge' | 'board';
const STEPS: Step[] = ['ticket', 'checkin', 'security', 'lounge', 'board'];
const STEP_LABEL = (s: Step) =>
  s === 'ticket'
    ? t('Ticket')
    : s === 'checkin'
      ? t('Check in')
      : s === 'security'
        ? t('Security')
        : s === 'lounge'
          ? t('Lounge')
          : t('Boarding');

/** Your ticket in one line: "14:05 · Savanna Air SV 123 · Gate B4". */
const ticketLine = (k: Ticket) =>
  [
    k.time,
    [k.airline, k.flight].filter(Boolean).join(' '),
    k.gate ? t('Gate {gate}', { gate: k.gate }) : '',
  ]
    .filter(Boolean)
    .join(' · ');

function BoardingPass({ ticket, from }: { ticket: Ticket; from: string }) {
  const line = ticketLine(ticket);
  return (
    <div className="trip-pass" data-boarding-pass={ticket.to}>
      <b>{t('Boarding pass')}</b>
      <span className="trip-pass-route">
        {from} → {ticket.toName}
      </span>
      <span className="small">
        {line ? `${line} · ` : ''}
        {t('Seat {seat}', { seat: seatOf(ticket) })}
      </span>
    </div>
  );
}

function TripSheet({
  place,
  marketId,
  players,
  desk,
  homeId,
  schedule,
  now,
  abroad,
  onMore,
}: {
  place: Place;
  marketId: string;
  players: PresenceView[];
  desk?: FlightDesk;
  homeId: string | null;
  schedule: ScheduledFlight[];
  now: number;
  abroad: boolean;
  onMore: () => void;
}) {
  const { busy, send, view } = useView();
  const fromName = CITY_NAMES[marketId] ?? marketId;
  const flights = (desk?.destinations ?? [])
    .map((d) => ({ d, f: nextBookable(schedule, d.id, now) }))
    // The next to leave first: today's still to come, then tomorrow's from the morning.
    .sort((a, b) => departs(a.f, now) - departs(b.f, now));
  // A ticket booked for a flight out of here (in the Travel app, or at the desk below).
  // Wave 12: the ticket is the server's (paid when booked), on every device.
  const held = useTicket();
  const ticket = ticketFrom(held, marketId, desk?.destinations ?? []);
  // A good ticket from somewhere else, or to somewhere you can't fly now: cancel to change.
  const other = held && held.status === 'valid' && held !== ticket ? held : null;
  // No ticket yet: the first thing is the ticket desk, where you choose where to go.
  const [step, setStep] = useState<Step>(() => (ticket ? 'checkin' : 'ticket'));
  const [playing, setPlaying] = useState<Step | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  // Without a ticket (flown, or no longer on sale) you're at the desk.
  const at: Step = ticket ? step : 'ticket';
  const next = (s: Step) => STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(s) + 1)]!;
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPlaying(null);
  };
  const finish = () => {
    stop();
    setStep((s) => next(s));
  };
  const play = (s: Step) => {
    if (reduceMotion()) {
      setStep(next(s));
      return;
    }
    setPlaying(s);
    timer.current = setTimeout(finish, s === 'checkin' ? 1500 : 1700);
  };
  const book = async (to: string) => {
    const row = flights.find((x) => x.d.id === to);
    if (!row || !desk) return;
    if (ticket?.to === to) {
      stop();
      setStep('checkin');
      return;
    }
    const { d, f } = row;
    // The fare is charged now (Wave 12): the desk takes your money and prints the ticket.
    const r = await send<{ charged: number; currency: string }>(
      bookCommand(marketId, d, view.market.month, undefined, f),
      (r) => t('Booked: {amount} charged.', { amount: money(r.charged, r.currency) }),
    );
    if (!r) return;
    stop();
    setStep('checkin');
  };
  const cancel = () =>
    void send<{ refund: number; currency: string }>({ type: 'travel.cancel' }, (r) =>
      t('Ticket cancelled: {amount} refunded.', { amount: money(r.refund, r.currency) }),
    ).then((r) => {
      if (r) setStep('ticket');
    });

  let body: ReactNode = null;
  if (playing && ticket)
    body = (
      <div className={`trip-anim trip-anim-${playing}`} data-trip-anim={playing}>
        {playing === 'checkin' ? (
          <BoardingPass ticket={ticket} from={fromName} />
        ) : (
          <div className="trip-scanner">
            <span className="trip-bag" />
          </div>
        )}
        <button type="button" className="btn btn-ghost" onClick={finish}>
          {t('Skip')}
        </button>
      </div>
    );
  else if (at === 'ticket')
    body = flights.length ? (
      <div className="trip-desk">
        <p className="small muted">
          {t(
            'Ticket desk: where do you want to go? Choose a flight and book it: the fare is charged now.',
          )}
        </p>
        {held?.status === 'missed' && (
          <p className="small" data-ticket-missed={held.to}>
            {t('You missed your flight to {city}. The fare isn’t refunded.', {
              city: held.toName,
            })}
          </p>
        )}
        {other && (
          <p className="small" data-ticket-other={other.to}>
            {t('You hold a ticket to {city}. Cancel it to book another flight.', {
              city: other.toName,
            })}{' '}
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={cancel}>
              {t('Cancel ticket · {amount} back', { amount: money(other.refund, other.currency) })}
            </button>
          </p>
        )}
        <ul className="trip-flights" aria-label={t('Where do you want to go?')}>
          {flights.map(({ d, f }) => (
            <li
              key={d.id}
              data-dest={d.id}
              className={ticket?.to === d.id ? 'is-booked' : undefined}
            >
              <span className="trip-flight-time">{f?.time ?? '—'}</span>
              <span className="trip-flight-main">
                <b>{d.name}</b>
                <span className="small muted">
                  {f ? `${f.airline} · ${f.flight}` : ''}
                  {d.hours > 0 && d.hours < 40 ? ` · ${fmtFlightTime(d.hours)}` : ''}
                  {d.id === homeId ? ` · ${t('Home city')}` : ''}
                </span>
              </span>
              <span className="trip-flight-fare">{desk ? money(d.fare, desk.currency) : ''}</span>
              <button
                type="button"
                className={`btn ${ticket?.to === d.id ? 'btn-primary' : 'btn-ghost'}`}
                disabled={busy || d.done || !!other || (!!ticket && ticket.to !== d.id)}
                aria-label={t('Book a flight to {city}', { city: d.name })}
                onClick={() => void book(d.id)}
              >
                {d.done ? t('This month') : ticket?.to === d.id ? t('Booked') : t('Book')}
              </button>
            </li>
          ))}
        </ul>
      </div>
    ) : (
      <p className="small muted">{t('No flights from here today.')}</p>
    );
  else if (ticket && at === 'checkin')
    body = (
      <div className="trip-lounge">
        <p className="small muted" data-ticket={ticket.to}>
          {t('Your ticket: {from} → {to}', { from: fromName, to: ticket.toName })}
          {ticketLine(ticket) ? ` · ${ticketLine(ticket)}` : ''} ·{' '}
          <span data-ticket-paid>
            {t('Paid {amount}', { amount: money(ticket.fare, ticket.currency) })}
          </span>
        </p>
        <button type="button" className="btn btn-primary trip-go" onClick={() => play('checkin')}>
          {t('Check in for {city}', { city: ticket.toName })}
        </button>
      </div>
    );
  else if (ticket && at === 'security')
    body = (
      <div className="trip-lounge">
        <BoardingPass ticket={ticket} from={fromName} />
        <button type="button" className="btn btn-primary trip-go" onClick={() => play('security')}>
          {t('Go through security')}
        </button>
      </div>
    );
  else if (ticket && at === 'lounge')
    body = (
      <div className="trip-lounge">
        <p className="small muted">
          {t('Investors wait for flights too. See who’s in the lounge.')}
        </p>
        <WhoIsHere place={place} players={players} />
        <button type="button" className="btn btn-primary trip-go" onClick={() => setStep('board')}>
          {t('Go to the gate')}
        </button>
      </div>
    );
  else if (ticket)
    body = (
      <div className="trip-lounge">
        <BoardingPass ticket={ticket} from={fromName} />
        <button
          type="button"
          className="btn btn-primary trip-go"
          disabled={busy}
          aria-label={t('Board for {city}', { city: ticket.toName })}
          onClick={() => desk?.onFly(ticket.to)}
        >
          {t('Board the flight to {city}', { city: ticket.toName })}
        </button>
      </div>
    );

  const canFlyHome = abroad && !!homeId && flights.some((x) => x.d.id === homeId && !x.d.done);
  return (
    <div className="place-tray trip-sheet" aria-label={t('Your trip')} role="region">
      <div className="trip-head">
        <b>{t('Your trip')}</b>
        {canFlyHome && !ticket && !other && (
          // Going home: book the flight home, then check in for it.
          <button
            type="button"
            className="btn btn-subtle"
            disabled={busy}
            onClick={() => void book(homeId!)}
          >
            {t('Fly home')}
          </button>
        )}
        {ticket && at !== 'ticket' && (
          // Before it leaves: the fare back, minus a small fee.
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || !!playing}
            aria-label={t('Cancel your ticket to {city}', { city: ticket.toName })}
            onClick={cancel}
          >
            {t('Cancel ticket')}
          </button>
        )}
      </div>
      <ol className="trip-steps">
        {STEPS.map((s, n) => {
          const done = STEPS.indexOf(at) > n;
          return (
            <li key={s}>
              <button
                type="button"
                className={`trip-step${s === at ? ' is-now' : ''}${done ? ' is-done' : ''}`}
                aria-current={s === at ? 'step' : undefined}
                // Every step after the ticket desk needs a ticket.
                disabled={!ticket && s !== 'ticket'}
                onClick={() => {
                  stop();
                  setStep(s);
                }}
              >
                <span className="trip-step-n">{done ? '✓' : n + 1}</span>
                {STEP_LABEL(s)}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="trip-body">{body}</div>
      <button type="button" className="btn btn-ghost tray-more" onClick={onMore}>
        {t('More')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function AirportScene({
  place,
  title,
  marketId,
  onClose,
  players = [],
  desk,
  homeId = null,
  onFlyHome,
  children,
}: {
  place: Place;
  title: string;
  marketId: string;
  onClose: () => void;
  onPerson?: (p: PersonRef) => void;
  players?: PresenceView[];
  desk?: FlightDesk;
  homeId?: string | null;
  onFlyHome?: () => void;
  /** The detailed cards, under "More". */
  children: ReactNode;
}) {
  const { view } = useView();
  const [more, setMore] = useState(false);
  const [{ at0, now }] = useState(() => ({ at0: Date.now(), now: localMinutes(marketId) }));
  const day = scheduleDay(view.market.month, at0);
  const schedule = useMemo(() => airportSchedule(marketId, day), [marketId, day]);
  const walkers = useMemo(() => {
    const bgs = [
      'f-engineer',
      'b-commercial',
      'f-dropout',
      'i-operator',
      'f-corporate',
      'b-fintech',
    ];
    const bags = ['#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981'];
    return Array.from({ length: 10 }, (_, n) => ({
      look: avatarLook(bgs[n % bgs.length], `${marketId}:traveller${n}`),
      speed: (n % 2 ? -1 : 1) * (22 + ((n * 7) % 18)),
      y: 70 + (n % 3) * 7,
      bag: bags[n % bags.length]!,
    }));
  }, [marketId]);

  return (
    <div
      className={`place-scene airport-scene${more ? ' is-more' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-room="airport"
      data-scene={place.id}
    >
      <header className="place-head">
        <div className="place-title">
          <h2>{title}</h2>
          <span className="small muted">
            {AIRPORT_NAMES[marketId] ?? CITY_NAMES[marketId] ?? ''}
          </span>
        </div>
        <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
          ✕
        </button>
      </header>
      {more ? (
        <div className="place-more">
          <button type="button" className="place-back" onClick={() => setMore(false)}>
            ‹ {t('Back to the terminal')}
          </button>
          <div className="interior">{children}</div>
        </div>
      ) : (
        <>
          <div className="airport-view">
            <Board marketId={marketId} day={day} />
            <Apron schedule={schedule} walkers={walkers} />
          </div>
          <TripSheet
            place={place}
            marketId={marketId}
            players={players}
            desk={desk}
            homeId={homeId}
            schedule={schedule}
            now={now}
            abroad={!!onFlyHome}
            onMore={() => setMore(true)}
          />
        </>
      )}
    </div>
  );
}

/** When a flight next leaves, for ordering: one already gone today leaves tomorrow. */
function departs(f: ScheduledFlight | null, now: number): number {
  if (!f) return Infinity;
  return f.at + f.late > now ? f.at : f.at + 86_400_000;
}
