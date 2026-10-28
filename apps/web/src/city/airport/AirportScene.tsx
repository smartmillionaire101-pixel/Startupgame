import type { MarketId } from '@runway/engine';
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
 * 3. The terminal: travellers walking with their bags. Once you hold a
 *    ticket the view follows your trip (./halls.tsx): the check-in hall,
 *    security, the lounge, the gate with your plane outside the windows.
 *
 * And a bottom sheet "Your trip", in the order of a real trip: the ticket
 * desk (where do you want to go? the time, the fare; book it, unless you
 * booked in the Travel app) → check in for that flight (the boarding pass
 * names the destination) → security → the lounge (Who's here: investors wait
 * for flights too) → board (up the jet bridge, or your own jet's airstairs),
 * each step a short animation you can skip. "More" keeps the detailed cards (departures, trips).
 *
 * Just landed, the scene is Arrivals instead (./arrivals.tsx): the live hall,
 * passport control, baggage reclaim and the way out to your hotel.
 *
 * One requestAnimationFrame loop moves the planes, vehicles and people
 * through refs; it stops while the tab is hidden or motion is reduced.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { money } from '../../format';
import { t } from '../../i18n';
import { useView } from '../../store';

import { AvatarFigure, avatarLook } from '../art';
import { genderOf } from '../life';
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
  flightStatus,
  fmtFlightTime,
  liveryOf,
  nextFlightTo,
  scheduleDay,
  type FlightStatus,
  type ScheduledFlight,
} from '../travel';
import {
  chooseAtDesk,
  departsOf,
  deskPicked,
  seatOf,
  setTicket,
  ticketFrom,
  useWaitedFor,
  useTicket,
  type Ticket,
} from '../ticket';
import { FlyingWith } from '../companions';
import { CABIN_NAME, TicketLegs, TripPicker } from '../CabinPicker';
import { flightsOf, loungeOf, type CabinTier, type HotelTier } from '../travel';
import { LoungePanel, LoungeScene } from '../premium/Lounge';
import type { LoungeSpot } from '../premium/lounge3d';
import { isPremium, loungeCrowd, type Traveller } from '../premium/premium';
import { useDaylight } from '../useDaylight';
import { WhoIsHere } from '../WhoIsHere';
import { ArrivalScene, type Arrival } from './arrivals';
import { Flaps } from './flaps';
import { TerminalView } from './halls';
import { PlaneTop, fliesPrivate } from './planes';
import { flightNow, gameMinuteOf } from '../../gameClock';
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

/** The board's row for the flight on your ticket, if it's on today's schedule. */
const isHeld = (f: ScheduledFlight, k: Ticket | null) =>
  !!k &&
  !f.arrival &&
  f.city === k.to &&
  (k.flight ? f.flight === k.flight : !!k.time && f.time === k.time);

function Board({ marketId, day, start }: { marketId: string; day: string; start: number }) {
  const schedule = useMemo(() => airportSchedule(marketId, day), [marketId, day]);
  // Your flight waits for you: past its time it's boarding, never departed.
  const own = useTicket();
  const held = own?.from === marketId ? own : null;
  // The board moves on: every few seconds it's a few minutes later.
  const [clock, setClock] = useState(() => ({ base: start, tick: 0 }));
  useEffect(() => {
    if (reduceMotion()) return;
    const id = setInterval(() => setClock((c) => ({ ...c, tick: c.tick + 1 })), 6000);
    return () => clearInterval(id);
  }, []);
  const now = clock.base + clock.tick * 6;
  let rows = boardRows(schedule, now);
  const mine = schedule.find((f) => isHeld(f, held));
  // Long past its time, it stays on the board (in its place among the gone).
  if (mine && !rows.some((r) => isHeld(r, held)) && now >= mine.at + mine.late)
    rows = [...rows.slice(1), { ...mine, status: flightStatus(mine, now) }].sort(
      (a, b) => a.at - b.at || a.flight.localeCompare(b.flight),
    );
  const waited = rows.find((r) => isHeld(r, held) && r.status === 'Departed');
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
            const wait = r === waited;
            const shown: FlightStatus = wait ? 'Boarding' : r.status;
            const status = STATUS_LABEL(shown);
            return (
              <tr
                key={`${r.flight}:${r.at}`}
                data-board-row=""
                data-status={shown}
                data-waited={wait ? '' : undefined}
                className={`is-${shown.toLowerCase().replace(' ', '-')}${wait ? ' is-waited' : ''}`}
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
                  <span className="sr-only">
                    {wait ? t('Boarding now · we waited for you') : status}
                  </span>
                  <Flaps text={status} width={9} delay={n * 0.08 + 0.35} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {waited && (
        <p className="board-waited" data-board-waited={waited.flight}>
          {waited.flight} · {waited.cityName}: {t('Boarding now · we waited for you')}
        </p>
      )}
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
interface TripScene {
  at: Step;
  playing: Step | null;
  ticket: Ticket | null;
  /** In the business or first lounge: where you are, and whether your flight is called. */
  spot: LoungeSpot;
  called: boolean;
}

/** The flight is called after this long in the lounge (or three things done). */
const CALL_MS = 45_000;
const STEPS: Step[] = ['ticket', 'checkin', 'security', 'lounge', 'board'];
/** In economy (once cabins are on sale) there's no lounge: you wait at the gate. */
const STEP_LABEL = (s: Step, cabin?: CabinTier) =>
  s === 'ticket'
    ? t('Ticket')
    : s === 'checkin'
      ? t('Check in')
      : s === 'security'
        ? t('Security')
        : s === 'lounge'
          ? cabin === 'economy'
            ? t('Waiting area')
            : t('Lounge')
          : t('Boarding');

/** What your cabin changes at the airport: check-in, the lounge, boarding. */
const PERK = {
  checkin: (c: CabinTier) =>
    c === 'first'
      ? t('Private check-in: a host takes your bags, no queue.')
      : c === 'business'
        ? t('Priority check-in: the short queue.')
        : t('Economy check-in: join the queue.'),
  lounge: (c: CabinTier) =>
    c === 'first'
      ? t(
          'The first class lounge: à la carte dining, champagne and a spa. Investors wait for flights too.',
        )
      : c === 'business'
        ? t(
            'The business lounge: a hot meal, a quiet desk and a shower. Investors wait for flights too.',
          )
        : t('No lounge in economy: a seat by the gate. Investors wait for flights too.'),
  board: (c: CabinTier) =>
    c === 'first'
      ? t('You board first, straight to your suite.')
      : c === 'business'
        ? t('Priority boarding: you’re on before the queue.')
        : t('Economy boards by rows, after everyone else.'),
};

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
  const { view } = useView();
  const waited = useWaitedFor(ticket, ticket.from);
  const homeName = CITY_NAMES[view.me.market] ?? view.me.market;
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
      {waited && <WaitedLine />}
      <FlyingWith to={ticket.to} />
      {ticket.cabin && (
        <span className={`small ticket-cabin is-${ticket.cabin}`} data-pass-cabin={ticket.cabin}>
          {CABIN_NAME[ticket.cabin]()}
        </span>
      )}
      {ticket.hotel && (
        <span className="small" data-pass-hotel={ticket.hotel.tier}>
          {t('Hotel: {name}', { name: ticket.hotel.name })}
        </span>
      )}
      <TicketLegs ticket={ticket} fromName={from} homeName={homeName} />
    </div>
  );
}

/** Past the time on your ticket: the plane hasn't gone without you. */
const WaitedLine = () => (
  <span className="small ticket-waited" data-ticket-waited="">
    {t('Boarding now · we waited for you')}
  </span>
);

function TripSheet({
  place,
  marketId,
  players,
  desk,
  homeId,
  schedule,
  now,
  at: atMin,
  abroad,
  crowd,
  onMore,
  onScene,
}: {
  place: Place;
  marketId: string;
  players: PresenceView[];
  desk?: FlightDesk;
  homeId: string | null;
  schedule: ScheduledFlight[];
  now: number;
  /** The game minute at `now` (null without a game clock). */
  at: number | null;
  abroad: boolean;
  /** The travellers in the business or first lounge today. */
  crowd: Traveller[];
  onMore: () => void;
  /** Where you are in the terminal, for the view above the sheet. */
  onScene: (s: TripScene) => void;
}) {
  const { busy, send, view } = useView();
  const lounge = loungeOf(view);
  const flightsInfo = flightsOf(view);
  const balance = view.accounts.local?.balance ?? 0;
  // The destination whose hotels you're choosing from, before booking ("Fly home"
  // opens the desk on the flight home).
  const [choosing, setChoosing] = useState<string | null>(deskPicked);
  useEffect(() => chooseAtDesk(null), []);
  const fromName = CITY_NAMES[marketId] ?? marketId;
  const flights = (desk?.destinations ?? [])
    .map((d) => ({ d, f: nextFlightTo(schedule, d.id, now) }))
    // The next to leave first: today's still to come, then tomorrow's from the morning.
    .sort((a, b) => departs(a.f, now) - departs(b.f, now));
  // A ticket booked for a flight out of here (in the Travel app, or at the desk below).
  const ticket = ticketFrom(useTicket(), marketId, desk?.destinations ?? []);
  // Past its time on the game clock: it waits for you (check in and board as ever).
  const waited = useWaitedFor(ticket, marketId);
  // No ticket yet: the first thing is the ticket desk, where you choose where to go.
  const [step, setStep] = useState<Step>(() => (ticket ? 'checkin' : 'ticket'));
  const [playing, setPlaying] = useState<Step | null>(null);
  // The lounge (business and first): where you are in it, and when you came in.
  const [spot, setSpot] = useState<LoungeSpot>('wait');
  const [late, setLate] = useState(false);
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
  const fly = () => {
    if (ticket) desk?.onFly(ticket.to);
  };
  // A step's moment ends (or is skipped): on to the next; boarding takes off.
  const finish = (s: Step) => {
    stop();
    if (s === 'board') fly();
    else setStep(next(s));
  };
  const play = (s: Step) => {
    if (reduceMotion()) {
      finish(s);
      return;
    }
    setPlaying(s);
    timer.current = setTimeout(
      () => finish(s),
      s === 'checkin' ? 1500 : s === 'board' ? 1300 : 1700,
    );
  };
  const inLounge = at === 'lounge' && !!lounge && isPremium(ticket?.cabin);
  // In the lounge: the flight is called after a while, or once you've done three things.
  useEffect(() => {
    if (!inLounge) return;
    const id = setTimeout(() => setLate(true), CALL_MS);
    return () => clearTimeout(id);
  }, [inLounge]);
  const called = inLounge && (late || (lounge?.done.length ?? 0) >= 3);
  useEffect(
    () => onScene({ at, playing, ticket, spot: inLounge ? spot : 'wait', called }),
    [at, playing, ticket, onScene, spot, inLounge, called],
  );
  const book = async (
    to: string,
    hotel: HotelTier | null = null,
    cabin: CabinTier = 'economy',
    back: CabinTier | null = null,
    hotelId?: string,
  ) => {
    const row = flights.find((x) => x.d.id === to);
    if (!row || !desk) return;
    const { d, f } = row;
    const home = d.id === homeId;
    const cmd = {
      type: 'travel.book' as const,
      to: d.id as MarketId,
      ...(hotel ? { hotel } : {}),
      // The feedback round: a named hotel (the server takes its room tier from it).
      ...(hotelId ? { hotelId } : {}),
      // Economy is the ticket as it always was: only an upgrade goes on the command.
      // Flying home, the cabin always goes (no cabin means the return you hold).
      ...(cabin !== 'economy' || (home && d.cabins.length) ? { cabin } : {}),
      // A return booked with the flight out, in its own cabin.
      ...(back ? { returnCabin: back } : {}),
      // The flight off the board: friends on holiday from this city get the same one.
      ...(f
        ? { flight: { airline: f.airline, number: f.flight, time: f.time, gate: f.gate } }
        : {}),
    };
    if (!(await send(cmd))) return;
    setChoosing(null);
    const stay = hotelId
      ? d.hotelList.find((h) => h.id === hotelId)
      : hotel
        ? d.hotels.find((h) => h.tier === hotel)
        : undefined;
    const seat = d.cabins.find((c) => c.cabin === cabin);
    const ret = back ? d.returnCabins.find((c) => c.cabin === back) : undefined;
    const held = home ? flightsInfo?.heldReturn : null;
    setTicket({
      from: marketId,
      to: d.id,
      toName: d.name,
      fare: held && held.cabin === cabin ? held.paid : (seat?.price ?? d.fare),
      ...(d.cabins.length ? { cabin } : {}),
      ...(back && ret ? { back: { cabin: back, fare: ret.price } } : {}),
      currency: desk.currency,
      hours: d.hours,
      time: f?.time,
      airline: f?.airline,
      flight: f?.flight,
      gate: f?.gate,
      ...(f && atMin !== null ? { departs: departsOf(f, atMin, now) } : {}),
      ...(stay
        ? {
            hotel: {
              tier: stay.tier,
              name: stay.name,
              paid: stay.price,
              ...(hotelId ? { id: hotelId } : {}),
            },
          }
        : {}),
    });
    stop();
    setStep('checkin');
  };

  let body: ReactNode = null;
  if (playing && ticket)
    body = (
      <div className={`trip-anim trip-anim-${playing}`} data-trip-anim={playing}>
        {playing === 'security' ? (
          <div className="trip-scanner">
            <span className="trip-bag" />
          </div>
        ) : (
          <BoardingPass ticket={ticket} from={fromName} />
        )}
        <button type="button" className="btn btn-ghost" onClick={() => finish(playing)}>
          {t('Skip')}
        </button>
      </div>
    );
  else if (at === 'ticket')
    body = flights.length ? (
      <div className="trip-desk">
        <p className="small muted">
          {t('Ticket desk: where do you want to go? Choose a flight and book it.')}
        </p>
        <ul className="trip-flights" aria-label={t('Where do you want to go?')}>
          {flights.map(({ d, f }) => {
            // The way home you paid for with the flight out (play-test: it read "₦383k · Book").
            const held = d.id === homeId && !d.done ? (flightsInfo?.heldReturn ?? null) : null;
            // The flight you hold, at its own time (it waits for you once that's passed).
            const mine = ticket?.to === d.id ? ticket : null;
            return (
              <li
                key={d.id}
                data-dest={d.id}
                data-held-return={held ? '' : undefined}
                className={mine ? 'is-booked' : undefined}
              >
                <span className="trip-flight-time">{(mine?.time ?? f?.time) || '—'}</span>
                <span className="trip-flight-main">
                  <b>{d.name}</b>
                  {mine && waited && <WaitedLine />}
                  <span className="small muted">
                    {mine?.flight
                      ? [mine.airline, mine.flight].filter(Boolean).join(' · ')
                      : f
                        ? `${f.airline} · ${f.flight}`
                        : ''}
                    {d.hours > 0 && d.hours < 40 ? ` · ${fmtFlightTime(d.hours)}` : ''}
                    {d.id === homeId ? ` · ${t('Home city')}` : ''}
                  </span>
                </span>
                <span className="trip-flight-fare">
                  {held ? t('Your return ticket · paid') : desk ? money(d.fare, desk.currency) : ''}
                </span>
                <button
                  type="button"
                  className={`btn ${ticket?.to === d.id ? 'btn-primary' : 'btn-ghost'}`}
                  disabled={busy || d.done}
                  aria-label={t('Book a flight to {city}', { city: d.name })}
                  // Abroad (not home): choose a hotel first; the cabin when it's on sale.
                  onClick={() =>
                    d.hotels.length || d.hotelList.length || d.cabins.length
                      ? setChoosing(d.id)
                      : void book(d.id)
                  }
                >
                  {d.done
                    ? t('This month')
                    : ticket?.to === d.id
                      ? t('Booked')
                      : held
                        ? t('Use ticket')
                        : t('Book')}
                </button>
                {choosing === d.id && desk && !ticket && (
                  <TripPicker
                    city={d.name}
                    marketId={d.id}
                    cabins={d.cabins}
                    hotels={d.hotels}
                    hotelList={d.hotelList}
                    fare={d.fare}
                    currency={desk.currency}
                    balance={balance}
                    busy={busy}
                    returnCabins={d.returnCabins}
                    homeName={homeId ? (CITY_NAMES[homeId] ?? homeId) : ''}
                    held={d.id === homeId ? (flightsInfo?.heldReturn ?? null) : null}
                    initial={d.id === homeId ? (flightsInfo?.lastCabin ?? undefined) : undefined}
                    onBook={(hotel, cabin, back, hotelId) =>
                      void book(d.id, hotel, cabin, back, hotelId)
                    }
                    onCancel={() => setChoosing(null)}
                  />
                )}
              </li>
            );
          })}
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
          {money(ticket.fare, ticket.currency)}
          {waited && <WaitedLine />}
          {ticket.hotel && (
            <span className="hotel-stay" data-ticket-hotel={ticket.hotel.tier}>
              {t('Hotel: {name}', { name: ticket.hotel.name })} ·{' '}
              {money(ticket.hotel.paid, ticket.currency)}
            </span>
          )}
        </p>
        <TicketLegs
          ticket={ticket}
          fromName={fromName}
          homeName={homeId ? (CITY_NAMES[homeId] ?? homeId) : fromName}
          prices
        />
        {ticket.cabin && (
          <p className="small trip-perk" data-trip-perk="checkin">
            {PERK.checkin(ticket.cabin)}
          </p>
        )}
        <button type="button" className="btn btn-primary trip-go" onClick={() => play('checkin')}>
          {t('Check in for {city}', { city: ticket.toName })}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={async () => {
            const result = await send({ type: 'travel.cancel' });
            if (result) {
              setTicket(null);
              setStep('ticket');
            }
          }}
        >
          {ticket.prepaid ? t('Cancel · keep my return ticket') : t('Cancel ticket · full refund')}
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
  else if (ticket && inLounge && lounge)
    body = (
      <div className="trip-lounge">
        <p className="small muted" data-trip-perk="lounge">
          {PERK.lounge(lounge.cabin)}
        </p>
        <LoungePanel
          info={lounge}
          crowd={crowd}
          called={called}
          onSpot={setSpot}
          toName={ticket.toName}
          onBoard={() => {
            setSpot('board');
            setStep('board');
          }}
        />
      </div>
    );
  else if (ticket && at === 'lounge')
    body = (
      <div className="trip-lounge">
        <p className="small muted" data-trip-perk={ticket.cabin ? 'lounge' : undefined}>
          {ticket.cabin
            ? PERK.lounge(ticket.cabin)
            : t('Investors wait for flights too. See who’s in the lounge.')}
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
        {ticket.cabin && (
          <p className="small trip-perk" data-trip-perk="board">
            {PERK.board(ticket.cabin)}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary trip-go"
          disabled={busy}
          aria-label={t('Board for {city}', { city: ticket.toName })}
          onClick={() => play('board')}
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
        {canFlyHome && ticket?.to !== homeId && (
          // Going home: choose the cabin (the return you hold, or the class you flew
          // out in, comes first), book, then check in for it.
          <button
            type="button"
            className="btn btn-subtle"
            data-fly-home=""
            onClick={() => {
              const d = flights.find((x) => x.d.id === homeId)?.d;
              if (d?.cabins.length) {
                stop();
                setStep('ticket');
                setChoosing(homeId);
              } else void book(homeId!);
            }}
          >
            {t('Fly home')}
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
                {STEP_LABEL(s, ticket?.cabin)}
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

export type { Arrival } from './arrivals';

export function AirportScene({
  place,
  title,
  marketId,
  onClose,
  players = [],
  desk,
  homeId = null,
  onFlyHome,
  arrival: landed = null,
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
  /** Just landed: Arrivals instead of the trip sheet. */
  arrival?: Arrival | null;
  /** The detailed cards, under "More". */
  children: ReactNode;
}) {
  const { view } = useView();
  const [more, setMore] = useState(false);
  const [scene, setScene] = useState<TripScene | null>(null);
  // The sheet reports on every render: keep the same scene unless something changed.
  const onScene = useCallback(
    (s: TripScene) =>
      setScene((p) =>
        p &&
        p.at === s.at &&
        p.playing === s.playing &&
        p.spot === s.spot &&
        p.called === s.called &&
        JSON.stringify(p.ticket) === JSON.stringify(s.ticket)
          ? p
          : s,
      ),
    [],
  );
  const night = useDaylight(marketId).night;
  const look = useMemo(
    () => avatarLook(view.me.background?.id, view.me.id, genderOf(view.me)),
    [view.me],
  );
  // Your own jet at the top of the lifestyle ladder (unless you booked business or first).
  const booked = view.me.flightTicket?.cabin;
  const jet = fliesPrivate(view.me.lifestyle?.tier) && !booked;
  // The game clock's time of day (the HUD's): only flights still to leave are offered.
  const [{ at0, now, at }] = useState(() => ({
    at0: Date.now(),
    now: flightNow(view, marketId),
    at: gameMinuteOf(view),
  }));
  const day = scheduleDay(view.market.month, at0);
  const schedule = useMemo(() => airportSchedule(marketId, day), [marketId, day]);
  // The business or first lounge: made-up premium travellers, and the players flying up front.
  const lounge = loungeOf(view);
  const guestKey = (lounge?.guests ?? []).map((g) => g.id).join(',');
  const crowd = useMemo<Traveller[]>(() => {
    if (!lounge) return [];
    const players = lounge.guests.map((g) => ({
      id: g.id,
      name: g.name,
      role: t('Flying {cabin} to {city}', {
        cabin: g.cabin === 'first' ? t('First class') : t('Business'),
        city: g.toName,
      }),
      look: avatarLook('f-engineer', g.id),
      player: true,
      to: g.to,
    }));
    return [...players, ...loungeCrowd(marketId, day, lounge.cabin)];
    // The guests' ids stand for the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lounge?.cabin, guestKey, marketId, day]);
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
          {/* The airport's own name first (Heathrow, Murtala Muhammed…). */}
          {/* Landed, the airport's name is the big sign below: the header names the city. */}
          <h2>{landed ? (CITY_NAMES[marketId] ?? title) : (AIRPORT_NAMES[marketId] ?? title)}</h2>
          <span className="small muted">
            {landed ? t('Arrivals') : `${t('Departures')} · ${CITY_NAMES[marketId] ?? title}`}
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
          {landed ? (
            <ArrivalScene marketId={marketId} arrival={landed} look={look} night={night} />
          ) : (
            <div className="airport-view">
              {scene?.ticket && scene.at === 'lounge' && lounge && isPremium(scene.ticket.cabin) ? (
                <LoungeScene
                  cabin={lounge.cabin}
                  marketId={marketId}
                  night={night}
                  livery={liveryOf(marketId, scene.ticket.airline)}
                  me={look}
                  crowd={crowd}
                  spot={scene.spot}
                  called={scene.called}
                  boardLine={
                    scene.called
                      ? t('{flight} to {city} is now boarding', {
                          flight: scene.ticket.flight ?? t('Your flight'),
                          city: scene.ticket.toName,
                        })
                      : null
                  }
                />
              ) : (
                <Board marketId={marketId} day={day} start={now} />
              )}
              {scene?.ticket &&
              scene.at === 'lounge' &&
              lounge &&
              isPremium(scene.ticket.cabin) ? null : scene?.ticket && scene.at !== 'ticket' ? (
                <TerminalView
                  cabin={scene.ticket.cabin}
                  step={scene.at}
                  playing={scene.playing === scene.at}
                  look={look}
                  kind={jet ? 'bizjet' : 'airliner'}
                  livery={jet ? '#1e3a8a' : liveryOf(marketId, scene.ticket.airline)}
                  airline={jet ? t('Private jets') : (scene.ticket.airline ?? '')}
                  gate={jet ? 'P1' : (scene.ticket.gate ?? 'A1')}
                  toName={scene.ticket.toName}
                  night={night}
                />
              ) : (
                <Apron schedule={schedule} walkers={walkers} />
              )}
            </div>
          )}
          {!landed && (
            <TripSheet
              place={place}
              marketId={marketId}
              players={players}
              desk={desk}
              homeId={homeId}
              schedule={schedule}
              now={now}
              at={at}
              abroad={!!onFlyHome}
              crowd={crowd}
              onMore={() => setMore(true)}
              onScene={onScene}
            />
          )}
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
