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
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import './golf.css';
import { use3d } from '../../three-kit/quality';
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { avatarLook } from '../art';
import { golfAttire } from './attire';
import { genderOf, looseCmd } from '../life';
import { npcName } from '../people';
import type { SceneProps } from '../PlaceScene';
import { golfOf } from '../leisure';
import Golf2D from './Golf2D';
import { GolfInviteSheet } from './GolfInvite';
import { GolfMatch } from './GolfMatch';
import { clearGolfFriend, pickedGolfFriend } from './invite-bus';
import { activeMatch } from './match';
import { SnapButton } from '../../photos/SnapButton';
import { resultCard } from '../../photos/snap';
import { LIE_WORD, MiniMap, PowerBar, Mark, powerAt, reachOf, signed, vsParText } from './parts';
import type { CamMode, GolfFrame } from './frame';
import {
  CLUBS,
  LIE_CARRY,
  MAX_STROKES,
  POWER_MAX,
  PUTTER,
  clubFor,
  defaultAim,
  dist,
  flightAt,
  hit,
  holeGeo,
  partnerCard,
  powerZone,
  rollAt,
  roundStats,
  scoreName,
  shotLength,
  skillOf,
  strokeRng,
  type Club,
  type HoleGeo,
  type Lie,
  type Pt2,
  type Shot,
  type ShotLog,
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
  /** Every stroke of the round so far (the mini-map's trace, the card's numbers). */
  log: ShotLog[];
}

const PARTNER_BG = ['i-exited', 'b-wealthy', 'i-operator', 'f-second-time'];
const easeOut = (u: number) => 1 - (1 - Math.max(0, Math.min(1, u))) ** 2;
const clampAim = (a: number) => Math.max(-0.45, Math.min(0.45, a));

interface RoundResult {
  fee?: number;
  vsPar?: number;
  total?: number;
  best?: number;
  rounds?: number;
  hours?: number;
  energy?: number;
  effects?: { fun?: number; social?: number };
  barsFx?: { stress?: number };
  met?: { name: string; role: string } | null;
  message?: string;
}

/**
 * The golf club: a solo round, or a match with a friend for money when you
 * have one on (GolfMatch.tsx) — sent from here, from their chat, or accepted
 * from an invitation.
 */
export function GolfScene(props: SceneProps) {
  const { view } = useView();
  const active = activeMatch(view);
  // The match on screen: once shown it stays (its result) until you leave it.
  const [shown, setShown] = useState<string | null>(null);
  const [left, setLeft] = useState<string[]>([]);
  const [inviting, setInviting] = useState(pickedGolfFriend);
  if (active && shown === null && !left.includes(active.id)) setShown(active.id);
  if (shown)
    return (
      <GolfMatch
        {...props}
        roomId={shown}
        onLeave={() => {
          setLeft((l) => [...l, shown]);
          setShown(null);
        }}
        onRematch={(id) => setShown(id)}
      />
    );
  return (
    <GolfSolo
      {...props}
      onFriend={() => setInviting('')}
      sheet={
        inviting !== null ? (
          <GolfInviteSheet
            preselect={inviting || null}
            onClose={() => {
              clearGolfFriend();
              setInviting(null);
            }}
            onInvited={(id) => {
              clearGolfFriend();
              setInviting(null);
              setShown(id);
            }}
          />
        ) : null
      }
    />
  );
}

function GolfSolo(props: SceneProps & { onFriend: () => void; sheet: ReactNode }) {
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
  // Dressed for the course: a polo, trousers and a cap (no dress, kaftan or tie).
  const me = golfAttire(
    avatarLook(view.me.background?.id, view.me.id, genderOf(view.me)),
    view.me.id,
  );
  const month = view.market.month;
  // Two AI playing partners (cheap to work out: no memo).
  const partners = [0, 1].map((k) => {
    const seed = `golf:${market}:${month}:${k}`;
    return {
      name: npcName(market, seed),
      look: golfAttire(avatarLook(PARTNER_BG[(k + month) % PARTNER_BG.length], seed), seed),
      card: partnerCard(`${seed}:${view.me.id}`, pars),
    };
  });
  const skill = skillOf(course.you?.rounds ?? 0);
  const rngSeed = `${view.me.id}:${market}:${month}:${course.you?.rounds ?? 0}`;

  const [stage, setStage] = useState<'intro' | 'play' | 'card'>('intro');

  const [banner, setBanner] = useState<string | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [lunch, setLunch] = useState<string | null>(null);
  // Your best here before this round (the card says when you beat it).
  const [bestBefore, setBestBefore] = useState<number | null>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const readRef = useRef<HTMLDivElement>(null);
  const carryRef = useRef<HTMLSpanElement>(null);
  const clubsRef = useRef<HTMLDivElement>(null);

  const newHole = (hole: number, card: number[], now: number, log: ShotLog[]): Play => ({
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
    log,
  });
  // What the tray and the chips show: the play as of the last change.
  const [play, setPlay] = useState<Play>(() => newHole(0, [], 0, []));
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
    P.current = newHole(p.hole + 1, card, performance.now(), p.log);
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
        const zone = powerZone(power);
        const n = Math.round(power);
        if (meterRef.current) {
          meterRef.current.style.setProperty('--power', `${(power / POWER_MAX) * 100}%`);
          meterRef.current.dataset.power = String(n);
          meterRef.current.dataset.zone = zone;
        }
        const read = readRef.current;
        if (read && read.dataset.power !== String(n)) {
          read.dataset.power = String(n);
          read.dataset.zone = zone;
          read.firstElementChild!.textContent =
            zone === 'sweet'
              ? t('{n}% · Sweet!', { n })
              : zone === 'lunge'
                ? t('{n}% · Lunge!', { n })
                : t('{n}%', { n });
          read.lastElementChild!.textContent =
            zone === 'sweet'
              ? t('Let go now')
              : zone === 'lunge'
                ? t('Too much: it’ll fly wild')
                : t('Keep holding…');
        }
        if (carryRef.current)
          carryRef.current.textContent =
            p.club === PUTTER
              ? t('Rolls about {m} m', {
                  m: Math.round(reachOf(p) * Math.min(1.1, power / 100) * 10) / 10,
                })
              : t('Carries about {m} m', {
                  m: Math.round(reachOf(p) * Math.min(1.1, power / 100)),
                });
      } else if (p.phase === 'swing' && p.shot) {
        const s = p.shot;
        const putt = s.club === PUTTER;
        const D = (putt ? 300 : 230) * sp;
        const T = putt ? 0 : Math.min(3600, 1200 + s.carry * 9) * sp;
        const R =
          (putt ? Math.min(2600, 700 + s.roll * 90) : Math.min(1800, 500 + s.roll * 25)) * sp;
        if (e > D + T + R) {
          P.current = { ...p, phase: s.holed ? 'holed' : 'rest', t0: now };
          // A drop in the hole gets the cheer; any other shot gets its result card.
          if (s.holed) flash(tx(scoreName(p.strokes, g.par)));
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
    const logged: ShotLog = {
      hole: p.hole,
      par: g.par,
      club: p.club.id,
      from: shot.from,
      land: shot.land,
      rest: shot.rest,
      lie: shot.lie,
      fromLie: p.lie,
      penalty: shot.penalty,
    };
    P.current = {
      ...p,
      phase: 'swing',
      t0: performance.now(),
      power,
      shot,
      strokes: p.strokes + 1 + (shot.penalty ? 1 : 0),
      log: [...p.log, logged],
    };
    bump();
  };
  // A cancelled hold (the system took the touch, the window lost focus) is no shot.
  const abort = () => {
    const p = P.current;
    if (p.phase !== 'charging') return;
    P.current = { ...p, phase: 'address', t0: performance.now() };
    bump();
  };
  const nudge = (d: number) => {
    const p = P.current;
    if (p.phase !== 'address') return;
    const step = p.club === PUTTER ? 0.006 : 0.022;
    P.current = { ...p, aimOff: clampAim(p.aimOff + d * step) };
    bump();
  };
  const pickClub = (club: Club) => {
    const p = P.current;
    if (p.phase !== 'address' || p.club === PUTTER || club.id === p.club.id) return;
    P.current = { ...p, club, aimOff: 0 };
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
    window.addEventListener('blur', abort);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', abort);
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

  // The chip for the club in your hand stays in sight (a suggested club can be off to the side).
  useEffect(() => {
    const on = clubsRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    const row = clubsRef.current;
    if (!on || !row) return;
    const x = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
    if (typeof row.scrollTo === 'function')
      row.scrollTo({ left: x, behavior: fast ? 'auto' : 'smooth' });
  }, [play.club.id, play.hole, stage, fast]);

  const p = play;
  const g = geos[p.hole]!;
  const putting = p.club === PUTTER;
  const charging = p.phase === 'charging';
  const left = dist(p.ball, g.pin);
  const toPin = Math.round(left);
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

  const card = p.card;
  // This hole's strokes (the mini-map's trace) and the last one (its result card).
  const holeShots = p.log.filter((s) => s.hole === p.hole);
  const last = holeShots.at(-1);
  const showResult =
    !!last && last.lie !== 'holed' && (p.phase === 'rest' || p.phase === 'address');
  const pool = putting ? [PUTTER] : CLUBS.filter((c) => c.id !== 'driver' || p.lie === 'tee');
  const aimDeg = Math.round((p.aimOff * 180) / Math.PI);
  const dots = Math.max(g.par + 2, p.strokes);

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
              : stage === 'card'
                ? t('{n} holes · Par {par} · round complete', {
                    n: geos.length,
                    par: course.par,
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
      <div className={`golf-view${stage === 'card' ? ' is-card' : ''}`}>
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
            <div className="golf-hud">
              <div
                className="golf-chip"
                data-golf-strokes={p.strokes}
                data-golf-to-pin={Math.round(dist(p.ball, g.pin) * 100) / 100}
                data-golf-lie={p.lie}
              >
                <span className="golf-kicker">
                  {t('Hole {n}/{of}', { n: p.hole + 1, of: geos.length })}
                </span>
                <b className="golf-par">{t('Par {par}', { par: g.par })}</b>
                <span className="golf-len">{t('{m} m', { m: g.length })}</span>
                <span
                  className="golf-dots"
                  role="img"
                  aria-label={t('{n} strokes so far', { n: p.strokes })}
                >
                  {Array.from({ length: dots }, (_, i) => (
                    <i
                      key={i}
                      className={`${i < p.strokes ? 'on' : ''}${i === g.par - 1 ? ' par' : ''}`}
                    />
                  ))}
                </span>
              </div>
              <div className="golf-pin" aria-live="polite">
                <b>
                  {p.lie === 'green' ? Math.max(0, Math.round(left * 10) / 10) : toPin}
                  <small> m</small>
                </b>
                <span>
                  {p.lie === 'green'
                    ? t('to the hole · {lie}', { lie: LIE_WORD[p.lie]() })
                    : t('to the pin · {lie}', { lie: LIE_WORD[p.lie]() })}
                </span>
              </div>
              <MiniMap
                g={g}
                ball={p.ball}
                aim={p.phase === 'address' ? aimOf(p) : null}
                shots={p.phase === 'swing' ? holeShots.slice(0, -1) : holeShots}
              />
            </div>
            {showResult && last && (
              <ShotCard
                key={`${p.hole}:${holeShots.length}`}
                shot={last}
                n={p.strokes - (last.penalty ? 1 : 0)}
                left={left}
                lie={p.lie}
                next={clubFor(left, p.lie)}
              />
            )}
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
                  P.current = newHole(0, [], performance.now(), []);
                  bump();
                  setResult(null);
                  setBestBefore(course.you?.best ?? null);
                  setStage('play');
                }}
              >
                {t('Tee off')}
              </button>
              <button
                type="button"
                className="btn btn-subtle"
                data-action="golf-friend"
                onClick={props.onFriend}
              >
                ⛳ {t('Play with a friend')}
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
        {stage === 'intro' && props.sheet}
        {stage === 'card' && (
          <ScoreCard
            card={card}
            pars={pars}
            holes={course.holes.map((h) => h.n)}
            par={course.par}
            partners={partners}
            log={p.log}
            result={result}
            bestBefore={bestBefore}
            hours={course.hours}
            cur={cur}
            busy={busy}
            onHandIn={() => void handIn(card)}
            onAgain={() => setStage('intro')}
            onDone={props.onClose}
            courseName={tx(course.name)}
            city={view.here?.name ?? view.market.name}
          />
        )}
      </div>
      {stage === 'play' && (
        <div className="golf-tray" role="group" aria-label={t('Your shot')}>
          <div className="golf-clubs" ref={clubsRef} role="group" aria-label={t('Clubs')}>
            {pool.map((c) => (
              <button
                key={c.id}
                type="button"
                className="golf-club"
                data-action="golf-club"
                data-club={c.id}
                aria-pressed={c.id === p.club.id}
                disabled={p.phase !== 'address' || putting}
                onClick={() => pickClub(c)}
              >
                <b>{tx(c.label)}</b>
                <span>
                  {c === PUTTER
                    ? t('On the green')
                    : t('{m} m', { m: Math.round(c.carry * LIE_CARRY[p.lie]) })}
                </span>
              </button>
            ))}
          </div>
          <PowerBar
            meterRef={meterRef}
            readRef={readRef}
            charging={charging}
            need={need}
            hint={t('Let go in the green')}
          />
          <div className="golf-swingrow">
            <button
              type="button"
              className="golf-aim"
              aria-label={t('Aim left')}
              data-action="golf-left"
              disabled={p.phase !== 'address'}
              onClick={() => nudge(-1)}
            >
              <span aria-hidden="true">◀</span>
              <small>{t('Aim')}</small>
            </button>
            <div className="golf-swing-wrap">
              <button
                type="button"
                className="golf-swing"
                data-action="golf-swing"
                aria-label={
                  charging ? t('Let go to hit') : putting ? t('Hold to putt') : t('Hold to swing')
                }
                disabled={p.phase !== 'address' && p.phase !== 'charging'}
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  startSwing();
                }}
                onPointerUp={release}
                onPointerCancel={abort}
                onContextMenu={(e) => e.preventDefault()}
              >
                <b>{charging ? t('Let go') : t('Hold')}</b>
                <small>{charging ? t('to hit') : putting ? t('to putt') : t('to swing')}</small>
              </button>
            </div>
            <button
              type="button"
              className="golf-aim"
              aria-label={t('Aim right')}
              data-action="golf-right"
              disabled={p.phase !== 'address'}
              onClick={() => nudge(1)}
            >
              <span aria-hidden="true">▶</span>
              <small>{t('Aim')}</small>
            </button>
          </div>
          <div className="golf-sub">
            {charging ? (
              <span ref={carryRef} />
            ) : (
              <span data-golf-aim={aimDeg}>
                {aimDeg === 0
                  ? t('Aim: straight at it')
                  : aimDeg > 0
                    ? t('Aim {n}° right', { n: aimDeg })
                    : t('Aim {n}° left', { n: -aimDeg })}
              </span>
            )}
            <span className="golf-sweet-note">
              {charging ? t('Over 100 % is a lunge') : t('Sweet spot 80–100 %')}
            </span>
            <button
              type="button"
              className="golf-pickup"
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

/** After a shot: how far it went, what it lies on, what's left and the club for it. */
function ShotCard({
  shot,
  n,
  left,
  lie,
  next,
}: {
  shot: ShotLog;
  n: number;
  left: number;
  lie: Lie;
  next: Club;
}) {
  const m = Math.round(shotLength(shot) * (shot.club === PUTTER.id ? 10 : 1));
  const len = shot.club === PUTTER.id ? m / 10 : m;
  const drive = shot.fromLie === 'tee' && (shot.club === 'driver' || shot.club === 'wood');
  const club = CLUBS.find((c) => c.id === shot.club) ?? PUTTER;
  const rest = lie === 'green' ? Math.round(left * 10) / 10 : Math.round(left);
  return (
    <div
      className="golf-shot"
      role="status"
      data-golf-shot={shot.lie}
      data-golf-shot-m={Math.round(shotLength(shot))}
    >
      <span className="golf-kicker">
        {t('Stroke {n} · {lie}', { n, lie: LIE_WORD[shot.penalty ? 'water' : shot.lie]() })}
      </span>
      <b>
        {shot.club === PUTTER.id
          ? t('{m} m putt', { m: len })
          : drive
            ? t('{m} m drive', { m: len })
            : t('{m} m with the {club}', { m: len, club: tx(club.label) })}
      </b>
      <span>
        {shot.penalty
          ? t('One stroke penalty, dropped · {m} m left', { m: rest })
          : lie === 'green'
            ? t('{m} m left · time to putt', { m: rest })
            : t('{m} m left · try the {club}', { m: rest, club: tx(next.label) })}
      </span>
    </div>
  );
}

function ScoreCard({
  card,
  pars,
  holes,
  par,
  partners,
  log,
  result,
  bestBefore,
  hours,
  cur,
  busy,
  onHandIn,
  onAgain,
  onDone,
  courseName,
  city,
}: {
  courseName: string;
  city: string;
  card: number[];
  pars: number[];
  holes: number[];
  par: number;
  partners: { name: string; card: number[] }[];
  log: ShotLog[];
  result: RoundResult | null;
  bestBefore: number | null;
  hours: number;
  cur: string;
  busy: boolean;
  onHandIn: () => void;
  onAgain: () => void;
  onDone: () => void;
}) {
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const sum = total(card);
  const vs = sum - par;
  const stats = roundStats(log);
  const ok = !!result?.fee;
  const best = ok && (bestBefore === null || vs < bestBefore);
  const effects: [string, number][] = result
    ? (
        [
          [t('Fun'), result.effects?.fun ?? 0],
          [t('Social'), result.effects?.social ?? 0],
          [t('Energy'), result.energy ?? 0],
          [t('Stress'), result.barsFx?.stress ?? 0],
        ] as [string, number][]
      ).filter(([, v]) => v !== 0)
    : [];
  return (
    <div className="golf-card" data-golf-scorecard="" role="region" aria-label={t('Scorecard')}>
      <div className="golf-card-head">
        <div>
          <span className="golf-kicker">{t('Scorecard')}</span>
          <h3 className="golf-vs" data-golf-vs={vs}>
            {t('{vs} · {n} strokes', { vs: vsParText(vs), n: sum })}
          </h3>
          <p className="small muted">
            {vs === 0
              ? t('Level par')
              : vs < 0
                ? t('{n} under par', { n: -vs })
                : t('{n} over par', { n: vs })}
            {ok &&
              ` · ${
                bestBefore === null
                  ? t('Your first round here')
                  : best
                    ? t('Your best round here (was {was})', { was: vsParText(bestBefore) })
                    : t('Your best here: {best}', { best: vsParText(bestBefore) })
              }`}
          </p>
        </div>
        <span className="golf-trophy" aria-hidden="true">
          {best ? '🏆' : '⛳'}
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t('Hole')}</th>
            {holes.map((h) => (
              <th key={h}>{h}</th>
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
            <td>{par}</td>
          </tr>
          <tr className="you">
            <th>{t('You')}</th>
            {card.map((x, i) => (
              <td key={i}>
                <Mark strokes={x} par={pars[i]!} />
              </td>
            ))}
            <td data-golf-total={sum}>{sum}</td>
          </tr>
          {partners.map((m) => (
            <tr key={m.name}>
              <th>{m.name.split(' ')[0]}</th>
              {m.card.map((x, i) => (
                <td key={i}>
                  <Mark strokes={x} par={pars[i]!} />
                </td>
              ))}
              <td>{total(m.card)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="golf-legend">
        <span>
          <i className="golf-key birdie" aria-hidden="true" />
          {t('Under par')}
        </span>
        <span>
          <i className="golf-key bogey" aria-hidden="true" />
          {t('Bogey')}
        </span>
        <span>
          <i className="golf-key double" aria-hidden="true" />
          {t('Double bogey or worse')}
        </span>
      </p>
      <div className="golf-stats">
        {stats.fairwayHoles > 0 && (
          <div data-golf-stat="fairways">
            <b>
              {stats.fairways}/{stats.fairwayHoles}
            </b>
            <span>{t('Fairways hit')}</span>
          </div>
        )}
        <div data-golf-stat="putts">
          <b>{stats.putts}</b>
          <span>{t('Putts')}</span>
        </div>
        {stats.longest > 0 && (
          <div data-golf-stat="longest">
            <b>{t('{m} m', { m: stats.longest })}</b>
            <span>{t('Longest drive')}</span>
          </div>
        )}
      </div>
      {result ? (
        <div className="golf-result" data-golf-result={ok ? 'ok' : 'error'}>
          {result.fee !== undefined && (
            <p className="golf-fee">
              <span>{t('Green fee paid')}</span>
              <b>{money(result.fee, cur)}</b>
            </p>
          )}
          {ok && (
            <p className="golf-fx">
              <span>{t('{n} hours on the course', { n: result.hours ?? hours })}</span>
              {effects.map(([k, v]) => (
                <b key={k} className={(k === t('Stress') ? -v : v) > 0 ? 'up' : 'down'}>
                  {k} {signed(v)}
                </b>
              ))}
            </p>
          )}
          {result.met && (
            <p data-golf-met="">
              {t('On the course you got talking with {name} ({role}). They’re in your contacts.', {
                name: result.met.name,
                role: tx(result.met.role),
              })}
            </p>
          )}
          {!ok && result.message && <p>{tx(result.message)}</p>}
        </div>
      ) : (
        <p className="small muted">{t('Handing in your card…')}</p>
      )}
      <div className="golf-intro-actions">
        {!ok && result && (
          <button type="button" className="btn" disabled={busy} onClick={onHandIn}>
            {t('Hand in your card')}
          </button>
        )}
        <SnapButton
          action="golf-photo"
          label={t('Photo of my round')}
          title={t('Your round')}
          file="my-golf-round"
          city={city}
          make={() =>
            resultCard({
              kicker: courseName,
              title: t('{vs} · {n} strokes', { vs: vsParText(vs), n: sum }),
              subtitle: partners.length
                ? t('{n} holes with {names}', {
                    n: card.length,
                    names: partners.map((m) => m.name.split(' ')[0]).join(', '),
                  })
                : undefined,
              stats: [
                { label: t('Putts'), value: String(stats.putts) },
                ...(stats.fairwayHoles > 0
                  ? [{ label: t('Fairways hit'), value: `${stats.fairways}/${stats.fairwayHoles}` }]
                  : []),
                ...(stats.longest > 0
                  ? [{ label: t('Longest drive'), value: t('{m} m', { m: stats.longest }) }]
                  : []),
                ...partners.map((m) => ({
                  label: m.name.split(' ')[0]!,
                  value: vsParText(total(m.card) - par),
                })),
              ],
              footer: city,
              tone: 'green',
            })
          }
        />
        <button
          type="button"
          className="btn btn-subtle"
          data-action="golf-again"
          disabled={busy || !ok}
          onClick={onAgain}
        >
          {t('Play again')}
        </button>
        <button
          type="button"
          className="btn btn-primary golf-done"
          data-action="golf-done"
          onClick={onDone}
        >
          {t('Done')}
        </button>
      </div>
    </div>
  );
}
