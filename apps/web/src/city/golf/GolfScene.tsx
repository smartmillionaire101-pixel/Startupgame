/**
 * The golf course (player feedback: "they should actually play golf and
 * show the full avatar playing"). Walk into the city's golf club and play
 * its three holes: aim with ◀ ▶, change club if you like, hold the swing
 * button to wind up the backswing (the meter fills; past 100 % you lunge),
 * let go to swing. The ball flies with the camera after it, lands, rolls;
 * on the green you putt. Two AI partners play along. At the end the
 * scorecard goes to the engine (`golf.round`): the green fee is charged,
 * the round takes its hours, and you may have met someone on the course.
 *
 * The shots run here (./game.ts, a seeded stream per stroke); the course is
 * drawn in 3D (../../interiors3d/Golf3D.tsx) or, in Lite, from the side
 * (./Golf2D.tsx).
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './golf.css';
import { use3d } from '../../three-kit/quality';
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { avatarLook } from '../art';
import { genderOf, looseCmd } from '../life';
import { npcName } from '../people';
import type { SceneProps } from '../PlaceScene';
import { golfOf } from '../leisure';
import Golf2D from './Golf2D';
import type { CamMode, GolfFrame } from './frame';
import {
  CLUBS,
  LIE_CARRY,
  MAX_STROKES,
  PUTTER,
  along,
  clubFor,
  defaultAim,
  dist,
  flightAt,
  hit,
  holeGeo,
  partnerCard,
  rollAt,
  scoreName,
  skillOf,
  strokeRng,
  type Club,
  type HoleGeo,
  type Lie,
  type Pt2,
  type Shot,
} from './game';

const Golf3D = lazy(() =>
  import('../../interiors3d/Golf3D').catch(() => ({ default: () => null })),
);

const reduceMotion = () =>
  (typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ||
  (typeof document !== 'undefined' &&
    document.documentElement.dataset.reduceMotion !== undefined &&
    !['false', '0'].includes(document.documentElement.dataset.reduceMotion));

type Phase = 'flyover' | 'address' | 'charging' | 'swing' | 'rest' | 'holed' | 'done';

interface Play {
  hole: number;
  ball: Pt2;
  lie: Lie;
  strokes: number;
  card: number[];
  club: Club;
  aimOff: number;
  phase: Phase;
  t0: number;
  power: number;
  shot: Shot | null;
  /** The heading the shot was played along (the golfer's stance). */
  stance: number;
}

const PARTNER_BG = ['i-exited', 'b-wealthy', 'i-operator', 'f-second-time'];
const LIE_WORD: Record<Lie, () => string> = {
  tee: () => t('Tee'),
  fairway: () => t('Fairway'),
  rough: () => t('Rough'),
  bunker: () => t('Bunker'),
  water: () => t('Water'),
  fringe: () => t('Fringe'),
  green: () => t('On the green'),
  holed: () => t('In the hole'),
};

/** Power (0–110) after holding for `ms`: up to 110 and back down, over and over. */
const powerAt = (ms: number, putt = false) => {
  // The putter's meter fills half as fast: short putts need a soft touch.
  const half = putt ? 2600 : 1300;
  const x = ms % (2 * half);
  return 110 * (x < half ? x / half : (2 * half - x) / half);
};
const reachOf = (p: { club: Club; lie: Lie }) => p.club.carry * LIE_CARRY[p.lie];
const easeOut = (u: number) => 1 - (1 - Math.max(0, Math.min(1, u))) ** 2;
const clampAim = (a: number) => Math.max(-0.45, Math.min(0.45, a));

interface RoundResult {
  fee?: number;
  vsPar?: number;
  total?: number;
  best?: number;
  rounds?: number;
  met?: { name: string; role: string } | null;
  message?: string;
}

export function GolfScene(props: SceneProps) {
  const { view, send, busy } = useView();
  const want3d = use3d();
  const [fast] = useState(reduceMotion);
  // Pictures for review can slow the round down (localStorage runway.golfSlow).
  const [slow] = useState(() => {
    try {
      return Math.max(1, Math.min(10, Number(localStorage.getItem('runway.golfSlow')) || 1));
    } catch {
      return 1;
    }
  });
  const sp = (fast ? 0.25 : 1) * slow;
  const market = view.market.id;
  const course = golfOf(view, market);
  const geos = useMemo<HoleGeo[]>(() => course.holes.map(holeGeo), [course.holes]);
  const pars = course.holes.map((h) => h.par);
  const cur = course.currency || view.market.currency;
  const pocket = view.accounts.local?.balance ?? 0;
  const hoursLeft = (view.me as { hours?: { left?: number } }).hours?.left ?? 99;
  const me = avatarLook(view.me.background?.id, view.me.id, genderOf(view.me));
  const month = view.market.month;
  // Two AI playing partners (cheap to work out: no memo).
  const partners = [0, 1].map((k) => {
    const seed = `golf:${market}:${month}:${k}`;
    return {
      name: npcName(market, seed),
      look: avatarLook(PARTNER_BG[(k + month) % PARTNER_BG.length], seed),
      card: partnerCard(`${seed}:${view.me.id}`, pars),
    };
  });
  const skill = skillOf(course.you?.rounds ?? 0);
  const rngSeed = `${view.me.id}:${market}:${month}:${course.you?.rounds ?? 0}`;

  const [stage, setStage] = useState<'intro' | 'play' | 'card'>('intro');

  const [banner, setBanner] = useState<string | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [lunch, setLunch] = useState<string | null>(null);
  const meterRef = useRef<HTMLDivElement>(null);

  const newHole = (hole: number, card: number[], now: number): Play => ({
    hole,
    ball: { ...geos[hole]!.tee },
    lie: 'tee',
    strokes: 0,
    card,
    club: clubFor(geos[hole]!.length, 'tee'),
    aimOff: 0,
    phase: 'flyover',
    t0: now,
    power: 0,
    shot: null,
    stance: 0,
  });
  // What the tray and the chips show: the play as of the last change.
  const [play, setPlay] = useState<Play>(() => newHole(0, [], 0));
  const P = useRef<Play>(play);
  const bump = useCallback(() => setPlay(P.current), []);

  const aimOf = (p: Play) => {
    const g = geos[p.hole]!;
    return defaultAim(g, p.ball, p.club, p.lie) + p.aimOff;
  };

  const flash = useCallback((text: string) => {
    setBanner(text);
    window.setTimeout(() => setBanner((b) => (b === text ? null : b)), 1500);
  }, []);

  // ---- Hand in the card.
  const handIn = useCallback(
    async (card: number[]) => {
      const r = await send<RoundResult>(looseCmd({ type: 'golf.round', strokes: card }));
      setResult(r ?? { message: t('Your card wasn’t taken. Try again.') });
    },
    [send],
  );

  // ---- The timeline: phases move on with time.
  const finishHole = useCallback(() => {
    const p = P.current;
    const card = [...p.card, Math.min(MAX_STROKES, p.strokes)];
    if (card.length >= geos.length) {
      // Done: the timeline stops here (the card is handed in once).
      P.current = { ...p, card, phase: 'done' };
      bump();
      setStage('card');
      void handIn(card);
      return;
    }
    P.current = newHole(p.hole + 1, card, performance.now());
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geos, bump, handIn]);

  useEffect(() => {
    if (stage !== 'play') return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const p = P.current;
      const now = performance.now();
      const e = now - p.t0;
      const g = geos[p.hole]!;
      if (p.phase === 'flyover' && e > 2600 * sp) {
        P.current = { ...p, phase: 'address', t0: now };
        bump();
      } else if (p.phase === 'charging') {
        const power = powerAt(e, p.club === PUTTER);
        if (meterRef.current) {
          meterRef.current.style.setProperty('--power', `${(power / 110) * 100}%`);
          meterRef.current.dataset.power = String(Math.round(power));
        }
      } else if (p.phase === 'swing' && p.shot) {
        const s = p.shot;
        const putt = s.club === PUTTER;
        const D = (putt ? 300 : 230) * sp;
        const T = putt ? 0 : Math.min(3600, 1200 + s.carry * 9) * sp;
        const R =
          (putt ? Math.min(2600, 700 + s.roll * 90) : Math.min(1800, 500 + s.roll * 25)) * sp;
        if (e > D + T + R) {
          P.current = { ...p, phase: s.holed ? 'holed' : 'rest', t0: now };
          if (s.holed) {
            const n = p.strokes;
            flash(tx(scoreName(n, g.par)));
          } else if (s.penalty) flash(t('In the water: one stroke penalty, drop'));
          else flash(LIE_WORD[s.lie]());
          bump();
        }
      } else if (p.phase === 'rest' && e > 900 * sp) {
        const s = p.shot!;
        const strokes = p.strokes;
        if (strokes >= MAX_STROKES) {
          flash(t('Picked up'));
          P.current = { ...p, phase: 'holed', t0: now };
          bump();
          return;
        }
        const lie = s.lie;
        const left = dist(s.rest, g.pin);
        P.current = {
          ...p,
          ball: s.rest,
          lie,
          club: clubFor(left, lie),
          aimOff: 0,
          phase: 'address',
          t0: now,
          shot: null,
        };
        bump();
      } else if (p.phase === 'holed' && e > 1900 * sp) {
        finishHole();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stage, geos, sp, bump, flash, finishHole]);

  // ---- The swing: hold to wind up, let go to hit.
  const startSwing = () => {
    const p = P.current;
    if (stage !== 'play' || p.phase !== 'address') return;
    P.current = { ...p, phase: 'charging', t0: performance.now(), stance: aimOf(p) };
    bump();
  };
  const release = () => {
    const p = P.current;
    if (p.phase !== 'charging') return;
    const power = powerAt(performance.now() - p.t0, p.club === PUTTER);
    if (power < 4) {
      P.current = { ...p, phase: 'address', t0: performance.now() };
      bump();
      return;
    }
    const g = geos[p.hole]!;
    const rnd = strokeRng(rngSeed, p.hole, p.strokes);
    const shot = hit(g, p.ball, p.lie, p.club, power, p.stance, rnd, skill);
    P.current = {
      ...p,
      phase: 'swing',
      t0: performance.now(),
      power,
      shot,
      strokes: p.strokes + 1 + (shot.penalty ? 1 : 0),
    };
    bump();
  };
  const nudge = (d: number) => {
    const p = P.current;
    if (p.phase !== 'address') return;
    const step = p.club === PUTTER ? 0.006 : 0.022;
    P.current = { ...p, aimOff: clampAim(p.aimOff + d * step) };
    bump();
  };
  const cycleClub = () => {
    const p = P.current;
    if (p.phase !== 'address' || p.club === PUTTER) return;
    const pool = CLUBS.filter((c) => c.id !== 'driver' || p.lie === 'tee');
    const i = pool.findIndex((c) => c.id === p.club.id);
    P.current = { ...p, club: pool[(i + 1) % pool.length]!, aimOff: 0 };
    bump();
  };
  const pickUp = () => {
    const p = P.current;
    if (p.phase !== 'address') return;
    const g = geos[p.hole]!;
    P.current = {
      ...p,
      strokes: Math.min(MAX_STROKES, Math.max(p.strokes + 1, g.par + 2)),
      phase: 'holed',
      t0: performance.now(),
    };
    flash(t('Picked up'));
    bump();
  };
  useEffect(() => {
    if (stage !== 'play') return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        startSwing();
      } else if (e.key === 'ArrowLeft') nudge(-1);
      else if (e.key === 'ArrowRight') nudge(1);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        release();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  // ---- The frame the drawing reads.
  const frame = useCallback((): GolfFrame => {
    const p = P.current;
    const g = geos[p.hole]!;
    const now = performance.now();
    const e = now - p.t0;
    const putting = p.club === PUTTER;
    const live = p.phase === 'address' ? aimOf(p) : p.stance;
    let heading = live;
    let ball = { x: p.ball.x, y: 0, z: p.ball.z };
    let swing = 0;
    let cam: CamMode = putting ? 'putt' : 'aim';
    let cheer = false;
    let golferAt = p.ball;
    if (p.phase === 'flyover') cam = 'intro';
    if (p.phase === 'charging') {
      swing = -Math.min(1, powerAt(e, p.club === PUTTER) / 100) * (putting ? 1 : 1);
      if (!putting) cam = 'swing';
    }
    if ((p.phase === 'swing' || p.phase === 'rest') && p.shot) {
      const s = p.shot;
      heading = p.stance;
      golferAt = s.from;
      const D = (putting ? 300 : 230) * sp;
      const T = putting ? 0 : Math.min(3600, 1200 + s.carry * 9) * sp;
      const back = -Math.min(1, p.power / 100);
      if (p.phase === 'rest') {
        swing = putting ? 0.4 : 1;
        ball = { x: s.rest.x, y: 0, z: s.rest.z };
        cam = putting ? 'putt' : 'follow';
      } else if (e < D) {
        const u = e / D;
        swing = back * (1 - u * u);
      } else {
        swing = putting
          ? Math.min(0.4, ((e - D) / (400 * sp)) * 0.4)
          : Math.min(1, easeOut((e - D) / (700 * sp)));
        if (!putting && e - D < T) {
          const f = flightAt(s, (e - D) / T);
          ball = f;
        } else {
          const R = putting
            ? Math.min(2600, 700 + s.roll * 90) * sp
            : Math.min(1800, 500 + s.roll * 25) * sp;
          const u = (e - D - T) / R;
          ball = putting
            ? (() => {
                const k = 1 - (1 - Math.max(0, Math.min(1, u))) ** 2;
                return {
                  x: s.from.x + (s.rest.x - s.from.x) * k,
                  y: 0,
                  z: s.from.z + (s.rest.z - s.from.z) * k,
                };
              })()
            : rollAt(s, u);
        }
        cam = putting ? 'putt' : e - D < 600 * sp ? 'swing' : 'follow';
      }
    }
    if (p.phase === 'holed' || p.phase === 'done') {
      cam = 'holed';
      cheer = !!p.shot?.holed || p.strokes <= g.par;
      ball = { x: g.pin.x, y: -0.06, z: g.pin.z };
      golferAt = p.shot?.from ?? p.ball;
      heading = p.stance;
    }
    // Feet to the left of the ball, looking at it.
    const rx = Math.cos(heading);
    const rz = Math.sin(heading);
    const off = putting ? 0.5 : 0.62;
    const golfer = { x: golferAt.x - rx * off, z: golferAt.z - rz * off };
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    const mates = partners.map((_, k) => {
      const x = golfer.x - fx * (3 + k * 0.8) - rx * (2.4 + k * 1.5);
      const z = golfer.z - fz * (3 + k * 0.8) - rz * (2.4 + k * 1.5);
      return {
        x,
        z,
        face: Math.atan2(golfer.x - x, golfer.z - z),
        clap: p.phase === 'holed' || p.phase === 'done',
      };
    });
    // The ring: where this club carries at full power, or (while you wind
    // up) at the power on the meter.
    const reach = reachOf(p);
    const aimCarry =
      p.phase === 'charging'
        ? reach * Math.min(1.06, powerAt(e, p.club === PUTTER) / 100)
        : putting
          ? Math.min(reach, dist(p.ball, g.pin) + 0.5)
          : Math.min(reach, dist(p.ball, g.pin) + 15);
    return {
      hole: p.hole,
      geo: g,
      ball,
      golfer,
      heading,
      swing,
      putting,
      club: putting ? 'putter' : p.club.id === 'driver' || p.club.id === 'wood' ? 'driver' : 'iron',
      cam,
      intro: Math.min(1, e / (2600 * sp)),
      aim:
        p.phase === 'address' || p.phase === 'charging' ? { heading: live, carry: aimCarry } : null,
      partners: mates,
      cheer,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geos, partners, sp]);

  const p = play;
  const g = geos[p.hole]!;
  const toPin = Math.round(dist(p.ball, g.pin));
  // The power that carries (or rolls) the ball to the pin: a mark on the meter.
  const need = Math.round(
    Math.min(100, ((dist(p.ball, g.pin) + (p.club === PUTTER ? 0.4 : 0)) / reachOf(p)) * 100),
  );
  const canPlay = pocket >= course.fee && hoursLeft >= course.hours;
  const why =
    pocket < course.fee
      ? t('The green fee is {fee}; you don’t have it.', { fee: money(course.fee, cur) })
      : hoursLeft < course.hours
        ? t('Three holes take {n} hours; you don’t have them this month.', { n: course.hours })
        : null;

  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const card = p.card;

  return (
    <div
      className="place-scene golf-scene"
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      data-room="golf"
      data-golf-stage={stage}
      data-golf-phase={p.phase}
      data-golf-hole={p.hole + 1}
    >
      <header className="place-head">
        <div className="place-title">
          <h2>{props.title}</h2>
          <span className="small muted">
            {stage === 'play'
              ? t('Hole {n} of {of} · Par {par} · {m} m', {
                  n: p.hole + 1,
                  of: geos.length,
                  par: g.par,
                  m: g.length,
                })
              : t('{n} holes · Par {par}', { n: geos.length, par: course.par })}
          </span>
        </div>
        <span className="golf-pocket" data-pocket={pocket}>
          {money(pocket, view.market.currency)}
        </span>
        <button type="button" className="icon-btn" aria-label={t('Close')} onClick={props.onClose}>
          ✕
        </button>
      </header>
      <div className="golf-view">
        {want3d ? (
          <Suspense
            fallback={<Golf2D me={me} partners={partners.map((x) => x.look)} frame={frame} />}
          >
            <Golf3D me={me} partners={partners.map((x) => x.look)} frame={frame} market={market} />
          </Suspense>
        ) : (
          <Golf2D me={me} partners={partners.map((x) => x.look)} frame={frame} />
        )}
        {stage === 'play' && (
          <>
            <div
              className="golf-chip"
              data-golf-strokes={p.strokes}
              data-golf-to-pin={Math.round(dist(p.ball, g.pin) * 100) / 100}
              data-golf-lie={p.lie}
            >
              <b>{t('Stroke {n}', { n: p.strokes + 1 })}</b>
              <span>
                {p.lie === 'green'
                  ? t('{m} m to the hole', {
                      m: Math.max(0, Math.round(dist(p.ball, g.pin) * 10) / 10),
                    })
                  : t('{m} m to the pin', { m: toPin })}
              </span>
              <span>{LIE_WORD[p.lie]()}</span>
            </div>
            <MiniMap g={g} ball={p.ball} aim={p.phase === 'address' ? aimOf(p) : null} />
          </>
        )}
        {banner && (
          <div className="golf-banner" role="status">
            {banner}
          </div>
        )}
        {stage === 'intro' && (
          <div className="golf-intro" data-golf-intro="">
            <h3>{tx(course.name)}</h3>
            <p>
              {t('Three holes, par {par}, with {a} and {b}.', {
                par: course.par,
                a: partners[0]!.name,
                b: partners[1]!.name,
              })}
            </p>
            <ul className="golf-holes">
              {course.holes.map((h) => (
                <li key={h.n}>
                  {t('Hole {n} · Par {par} · {m} m', { n: h.n, par: h.par, m: h.length })}
                </li>
              ))}
            </ul>
            <p className="small">
              {t('Green fee {fee} · {n} hours', { fee: money(course.fee, cur), n: course.hours })}
              {course.you ? ` · ${t('Rounds played: {n}', { n: course.you.rounds })}` : ''}
            </p>
            <p className="small muted">
              {t(
                'Aim with ◀ ▶. Hold the swing button to wind up, let go to hit: 80–100 % is sweet, more is a lunge.',
              )}
            </p>
            {why && <p className="golf-why">{why}</p>}
            <div className="golf-intro-actions">
              <button
                type="button"
                className="btn"
                data-action="golf-start"
                disabled={!canPlay}
                onClick={() => {
                  P.current = newHole(0, [], performance.now());
                  bump();
                  setResult(null);
                  setStage('play');
                }}
              >
                {t('Tee off')}
              </button>
              {course.clubId && (
                <button
                  type="button"
                  className="btn btn-subtle"
                  data-action="golf-lunch"
                  disabled={busy}
                  onClick={async () => {
                    const r = await send<{ message?: string }>(
                      looseCmd({
                        type: 'venue.buy',
                        businessId: course.clubId,
                        itemId: 'clubhouse',
                      }),
                    );
                    if (r) setLunch(tx(r.message ?? t('Lunch at the clubhouse')));
                  }}
                >
                  {t('Lunch at the clubhouse')}
                </button>
              )}
            </div>
            {lunch && <p className="small">{lunch}</p>}
          </div>
        )}
        {stage === 'card' && (
          <div className="golf-card" data-golf-scorecard="">
            <h3>{t('Scorecard')}</h3>
            <table>
              <thead>
                <tr>
                  <th>{t('Hole')}</th>
                  {course.holes.map((h) => (
                    <th key={h.n}>{h.n}</th>
                  ))}
                  <th>{t('Total')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="par">
                  <th>{t('Par')}</th>
                  {pars.map((x, i) => (
                    <td key={i}>{x}</td>
                  ))}
                  <td>{course.par}</td>
                </tr>
                <tr className="you">
                  <th>{t('You')}</th>
                  {card.map((x, i) => (
                    <td key={i} className={x < pars[i]! ? 'under' : x > pars[i]! ? 'over' : ''}>
                      {x}
                    </td>
                  ))}
                  <td data-golf-total={total(card)}>{total(card)}</td>
                </tr>
                {partners.map((m) => (
                  <tr key={m.name}>
                    <th>{m.name.split(' ')[0]}</th>
                    {m.card.map((x, i) => (
                      <td key={i}>{x}</td>
                    ))}
                    <td>{total(m.card)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="golf-vs">
              {(() => {
                const d = total(card) - course.par;
                return d === 0
                  ? t('Level par')
                  : d < 0
                    ? t('{n} under par', { n: -d })
                    : t('{n} over par', { n: d });
              })()}
            </p>
            {result ? (
              <div className="golf-result" data-golf-result={result.fee ? 'ok' : 'error'}>
                {result.fee !== undefined && (
                  <p>
                    {t('Green fee {fee} paid · {n} hours on the course', {
                      fee: money(result.fee, cur),
                      n: course.hours,
                    })}
                  </p>
                )}
                {result.met && (
                  <p data-golf-met="">
                    {t(
                      'On the course you got talking with {name} ({role}). They’re in your contacts.',
                      {
                        name: result.met.name,
                        role: tx(result.met.role),
                      },
                    )}
                  </p>
                )}
                {!result.fee && result.message && <p>{tx(result.message)}</p>}
              </div>
            ) : (
              <p className="small muted">{t('Handing in your card…')}</p>
            )}
            <div className="golf-intro-actions">
              {!result?.fee && result && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void handIn(card)}
                >
                  {t('Hand in your card')}
                </button>
              )}
              <button
                type="button"
                className="btn btn-subtle"
                data-action="golf-again"
                disabled={busy || !result?.fee}
                onClick={() => setStage('intro')}
              >
                {t('Play again')}
              </button>
              <button type="button" className="btn" data-action="golf-done" onClick={props.onClose}>
                {t('Done')}
              </button>
            </div>
          </div>
        )}
      </div>
      {stage === 'play' && (
        <div className="golf-tray" role="group" aria-label={t('Your shot')}>
          <div className="golf-row">
            <button
              type="button"
              className="btn btn-subtle golf-aim"
              aria-label={t('Aim left')}
              data-action="golf-left"
              disabled={p.phase !== 'address'}
              onClick={() => nudge(-1)}
            >
              ◀
            </button>
            <button
              type="button"
              className="btn btn-subtle golf-club"
              data-action="golf-club"
              disabled={p.phase !== 'address' || p.club === PUTTER}
              onClick={cycleClub}
            >
              <b>{tx(p.club.label)}</b>
              <span className="small">
                {p.club === PUTTER ? t('Putter') : t('{m} m', { m: p.club.carry })}
              </span>
            </button>
            <button
              type="button"
              className="btn btn-subtle golf-aim"
              aria-label={t('Aim right')}
              data-action="golf-right"
              disabled={p.phase !== 'address'}
              onClick={() => nudge(1)}
            >
              ▶
            </button>
          </div>
          <div className="golf-meter" ref={meterRef} data-power="0" aria-hidden="true">
            <span className="golf-sweet" />
            <span
              className="golf-need"
              data-golf-need={need}
              style={{ left: `${(need / 110) * 100}%` }}
            />
            <span className="golf-fill" />
          </div>
          <div className="golf-row">
            <button
              type="button"
              className="btn golf-swing"
              data-action="golf-swing"
              disabled={p.phase !== 'address' && p.phase !== 'charging'}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                startSwing();
              }}
              onPointerUp={release}
              onPointerCancel={release}
              onContextMenu={(e) => e.preventDefault()}
            >
              {p.phase === 'charging'
                ? t('Let go to hit')
                : p.club === PUTTER
                  ? t('Hold to putt')
                  : t('Hold to swing')}
            </button>
            <button
              type="button"
              className="btn btn-subtle golf-pickup"
              data-action="golf-pickup"
              disabled={p.phase !== 'address' || p.strokes === 0}
              onClick={pickUp}
            >
              {t('Pick up')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The hole from above: fairway, hazards, green, the ball and where you're aiming. */
function MiniMap({ g, ball, aim }: { g: HoleGeo; ball: Pt2; aim: number | null }) {
  const pts = [...g.line, ...g.bunkers, ...(g.water ? [g.water] : [])];
  const x0 = Math.min(...pts.map((p) => p.x)) - 30;
  const x1 = Math.max(...pts.map((p) => p.x)) + 30;
  const z0 = Math.min(...pts.map((p) => p.z)) - 25;
  const z1 = Math.max(...pts.map((p) => p.z)) + 15;
  const W = 64;
  const H = 120;
  const k = Math.min(W / (x1 - x0), H / (z1 - z0));
  const X = (x: number) => (x - x0) * k + (W - (x1 - x0) * k) / 2;
  const Y = (z: number) => (z - z0) * k + (H - (z1 - z0) * k) / 2;
  const t0 = Math.round(g.fairway[0] * (g.line.length - 1));
  const fair = g.line.slice(t0, Math.round(g.fairway[1] * (g.line.length - 1)) + 1);
  const end = aim !== null ? along(ball, aim, Math.min(250, dist(ball, g.pin) + 10)) : null;
  return (
    <svg className="golf-map" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <rect x="0" y="0" width={W} height={H} rx="6" fill="#3f7a26" />
      <polyline
        points={fair.map((p) => `${X(p.x)},${Y(p.z)}`).join(' ')}
        fill="none"
        stroke="#7cc04a"
        strokeWidth={g.fairwayHalf * 2 * k}
        strokeLinecap="round"
      />
      {g.water && (
        <ellipse
          cx={X(g.water.x)}
          cy={Y(g.water.z)}
          rx={g.water.rx * k}
          ry={g.water.rz * k}
          fill="#2f86c9"
        />
      )}
      {g.bunkers.map((b, i) => (
        <ellipse key={i} cx={X(b.x)} cy={Y(b.z)} rx={b.rx * k} ry={b.rz * k} fill="#ecdcab" />
      ))}
      <circle cx={X(g.pin.x)} cy={Y(g.pin.z)} r={g.greenR * k} fill="#95d95e" />
      <line
        x1={X(g.pin.x)}
        y1={Y(g.pin.z)}
        x2={X(g.pin.x)}
        y2={Y(g.pin.z) - 7}
        stroke="#fff"
        strokeWidth="0.8"
      />
      <polygon
        points={`${X(g.pin.x)},${Y(g.pin.z) - 7} ${X(g.pin.x) + 4},${Y(g.pin.z) - 5.5} ${X(g.pin.x)},${Y(g.pin.z) - 4}`}
        fill="#ef4444"
      />
      {end && (
        <line
          x1={X(ball.x)}
          y1={Y(ball.z)}
          x2={X(end.x)}
          y2={Y(end.z)}
          stroke="#fde047"
          strokeWidth="0.8"
          strokeDasharray="2 2"
        />
      )}
      <circle cx={X(ball.x)} cy={Y(ball.z)} r="2" fill="#fff" stroke="#111" strokeWidth="0.5" />
    </svg>
  );
}
