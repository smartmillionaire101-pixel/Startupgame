/**
 * Golf with a friend for money (mockups 3c and 3d): the match HUD and the
 * result. The course and the tray are the solo round's (GolfScene.tsx,
 * golf.css); what differs is who decides the ball. Here you only send your
 * shot's inputs (club, aim, power) as `play.golf`; the engine plays the
 * ball out with the same physics, seeded per room, player, hole and stroke,
 * and every client draws the shots from the match log it sends back.
 *
 * Both players play every hole; whoever is farther from the hole goes next.
 * Each shot has a 60 s clock (when it runs out the engine plays a soft
 * stroke for you, on the next sync). The lowest total takes the pot.
 *
 * News comes by polling (the store's `quicken`, and a sync when a clock or
 * an AI friend's turn is due), so it works where the server can't stream.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameExitAsk, GameExitButton } from '../../experiences/GameExit';
import { golfCourse, type MarketId } from '@runway/engine';
import { api } from '../../api';
import { use3d } from '../../three-kit/quality';
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { avatarLook } from '../art';
import type { SceneProps } from '../PlaceScene';
import { golfAttire } from './attire';
import Golf2D from './Golf2D';
import type { CamMode, GolfFrame } from './frame';
import {
  CLUBS,
  LIE_CARRY,
  PUTTER,
  clubFor,
  defaultAim,
  dist,
  flightAt,
  holeGeo,
  rollAt,
  scoreName,
  type Club,
  type HoleGeo,
  type Pt2,
} from './game';
import { isMatch, shotOf, shotTiming, vsParOf, type MatchRoom, type MatchShot } from './match';
import {
  ClubColumn,
  LIE_WORD,
  Mark,
  MiniMap,
  PowerMeter,
  PowerRead,
  ShotControls,
  paintPower,
  powerAt,
  vsParText,
} from './parts';

const Golf3D = lazy(() =>
  import('../../interiors3d/Golf3D').catch(() => ({ default: () => null })),
);

const reduceMotion = () =>
  (typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ||
  (typeof document !== 'undefined' &&
    document.documentElement.dataset.reduceMotion !== undefined &&
    !['false', '0'].includes(document.documentElement.dataset.reduceMotion));

const clampAim = (a: number) => Math.max(-0.45, Math.min(0.45, a));
const easeOut = (u: number) => 1 - (1 - Math.max(0, Math.min(1, u))) ** 2;
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const first = (name: string) => name.split(' ')[0] ?? name;

type Phase = 'address' | 'charging' | 'sending';

interface Props extends SceneProps {
  roomId: string;
  /** Back to the club (the solo round and the invite sheet). */
  onLeave: () => void;
  /** A rematch was sent: show that match. */
  onRematch: (roomId: string) => void;
}

export function GolfMatch(props: Props) {
  const { view } = useView();
  const room = view.playRooms.find((r) => r.id === props.roomId);
  if (!isMatch(room))
    return (
      <div className="place-scene golf-scene" role="dialog" aria-label={props.title}>
        <header className="place-head">
          <div className="place-title">
            <h2>{props.title}</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('Close')}
            onClick={props.onClose}
          >
            ✕
          </button>
        </header>
        <div className="golf-view">
          <div className="golf-intro">
            <p>{t('This match is over.')}</p>
            <button type="button" className="btn" onClick={props.onLeave}>
              {t('Back to the club')}
            </button>
          </div>
        </div>
      </div>
    );
  return <Match {...props} room={room} />;
}

function Match(props: Props & { room: MatchRoom }) {
  const { room } = props;
  const { view, send, busy, refresh, quicken } = useView();
  const me = view.me.id;
  const G = room.golf;
  const want3d = use3d();
  const [fast] = useState(reduceMotion);
  /** Asking "Cancel the game?" / "Leave the game?" (the same question as every table game). */
  const [exiting, setExiting] = useState(false);
  const sp = fast ? 0.25 : 1;
  const market = view.here?.id ?? view.market.id;
  const course = useMemo(() => golfCourse(market as MarketId), [market]);
  const geos = useMemo<HoleGeo[]>(() => course.holes.map(holeGeo), [course]);
  const other = room.host === me ? G.invite : room.host;
  const people = G.people as Record<
    string,
    { name: string; backgroundId: string | null; gender: 'female' | 'male' | null; ai: boolean }
  >;
  const otherName = people[other]?.name ?? room.members.find((m) => m.id === other)?.name ?? '';
  const myLook = useMemo(
    () => golfAttire(avatarLook(view.me.background?.id, me, view.me.gender ?? undefined), me),
    [view.me.background?.id, view.me.gender, me],
  );
  const otherBg = people[other]?.backgroundId ?? undefined;
  const otherGender = people[other]?.gender ?? null;
  const otherLook = useMemo(
    () => golfAttire(avatarLook(otherBg, other, otherGender), other),
    [other, otherBg, otherGender],
  );

  // ---- News: quick polling while the match is open, a sync when something is due.
  useEffect(() => quicken(), [quicken]);
  const offset = useRef(0);
  useEffect(() => {
    offset.current = (view.clock?.serverNow ?? Date.now()) - Date.now();
  }, [view.clock?.serverNow]);
  const roomRef = useRef(room);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    roomRef.current = room;
    refreshRef.current = refresh;
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let busyTick = false;
    let n = 0;
    const timer = setInterval(() => {
      const at = Date.now() + offset.current;
      setNow(at);
      if (document.hidden || busyTick) return;
      const r = roomRef.current;
      const live = r.status === 'waiting' || r.status === 'playing';
      if (!live) return;
      const due =
        (r.status === 'playing' && at >= r.deadline) || (r.aiDueAt !== null && at >= r.aiDueAt);
      n++;
      if (!due && r.turn === me && r.status === 'playing' && n % 4 !== 0) return;
      if (!due && n % 2 !== 0) return;
      busyTick = true;
      const sync = due
        ? api.command({ type: 'play.sync', roomId: r.id }).catch(() => undefined)
        : Promise.resolve();
      void sync
        .then(() => refreshRef.current())
        .finally(() => {
          busyTick = false;
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [me]);

  // ---- The shots: each new one in the log plays out on the course, in order.
  const seen = useRef(G.shots.length);
  const anim = useRef<{ shot: MatchShot; t0: number } | null>(null);
  const [animating, setAnimating] = useState(false);
  const [phase, setPhase] = useState<Phase>('address');
  const phaseRef = useRef<{ phase: Phase; t0: number; stance: number; club: Club }>({
    phase: 'address',
    t0: 0,
    stance: 0,
    club: PUTTER,
  });
  const meterRef = useRef<HTMLDivElement>(null);
  const readRef = useRef<HTMLDivElement>(null);

  const mine = G.players[me];
  const hole = G.hole;
  const g = geos[hole]!;
  // Your club and aim for this stroke (back to the course's suggestion on each new ball).
  const key = `${hole}:${mine?.strokes ?? 0}:${G.shots.length}`;
  const [sel, setSel] = useState<{ key: string; club: Club | null; aimOff: number }>({
    key,
    club: null,
    aimOff: 0,
  });
  const choice = sel.key === key ? sel : { key, club: null, aimOff: 0 };
  const lie = mine?.lie ?? 'tee';
  const ball = mine?.ball ?? g.tee;
  const club = lie === 'green' ? PUTTER : (choice.club ?? clubFor(dist(ball, g.pin), lie));
  const aim = defaultAim(g, ball, club, lie) + choice.aimOff;
  const myTurn = room.status === 'playing' && room.turn === me;
  const canSwing = myTurn && !animating && phase === 'address';
  const live = useRef({ club, aim, myTurn, geos, me, other });
  useEffect(() => {
    live.current = { club, aim, myTurn, geos, me, other };
  });

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const r = roomRef.current;
      const at = performance.now();
      const a = anim.current;
      if (a) {
        const s = shotOf(a.shot);
        if (at - a.t0 > shotTiming(s, sp).total + 900 * sp) {
          anim.current = null;
          setAnimating(false);
        }
      } else if (seen.current < r.golf.shots.length) {
        anim.current = { shot: r.golf.shots[seen.current]!, t0: at };
        seen.current++;
        if (phaseRef.current.phase === 'sending') {
          phaseRef.current = { ...phaseRef.current, phase: 'address' };
          setPhase('address');
        }
        setAnimating(true);
      }
      const ph = phaseRef.current;
      if (ph.phase === 'charging') {
        paintPower(meterRef.current, readRef.current, powerAt(at - ph.t0, ph.club === PUTTER));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sp]);

  // ---- Your swing: hold to wind up, let go to send the shot.
  const startSwing = () => {
    if (!canSwing) return;
    phaseRef.current = { phase: 'charging', t0: performance.now(), stance: aim, club };
    setPhase('charging');
  };
  const release = async () => {
    const ph = phaseRef.current;
    if (ph.phase !== 'charging') return;
    const power = powerAt(performance.now() - ph.t0, ph.club === PUTTER);
    if (power < 4) {
      phaseRef.current = { ...ph, phase: 'address' };
      setPhase('address');
      return;
    }
    phaseRef.current = { ...ph, phase: 'sending' };
    setPhase('sending');
    const r = await send<{ late?: boolean }>(
      {
        type: 'play.golf',
        roomId: room.id,
        round: room.round,
        club: ph.club.id as 'putter',
        aim: Math.max(-Math.PI, Math.min(Math.PI, ph.stance)),
        power: Math.min(110, Math.round(power * 10) / 10),
      },
      (x) => (x?.late ? t('Your shot clock ran out: a soft shot was played for you.') : null),
    );
    // Refused (or late): back to the address. A shot that counted plays out first.
    if (!r || r.late) {
      phaseRef.current = { ...phaseRef.current, phase: 'address' };
      setPhase('address');
    }
  };
  const abort = () => {
    if (phaseRef.current.phase !== 'charging') return;
    phaseRef.current = { ...phaseRef.current, phase: 'address' };
    setPhase('address');
  };
  const nudge = (d: number) => {
    if (!canSwing) return;
    setSel({ ...choice, aimOff: clampAim(choice.aimOff + d * (club === PUTTER ? 0.006 : 0.022)) });
  };
  const pickUp = () => {
    if (!canSwing) return;
    void send({
      type: 'play.golf',
      roomId: room.id,
      round: room.round,
      club: 'putter',
      aim: 0,
      power: 0,
      pickup: true,
    });
  };

  // ---- The frame the drawing reads.
  const frame = useCallback((): GolfFrame => {
    const r = roomRef.current;
    const L = live.current;
    const a = anim.current;
    const at = performance.now();
    let holeNo = r.golf.hole;
    let shooter = r.status === 'playing' ? (r.turn ?? L.me) : L.me;
    let ball = { x: 0, y: 0, z: 0 };
    let heading = 0;
    let swing = 0;
    let putting = false;
    let clubKind: GolfFrame['club'] = 'iron';
    let cam: CamMode = 'aim';
    let cheer = false;
    let golferAt: Pt2;
    let aimLine: GolfFrame['aim'] = null;
    if (a) {
      const s = shotOf(a.shot);
      holeNo = a.shot.hole;
      shooter = a.shot.by;
      putting = s.club === PUTTER;
      clubKind = putting
        ? 'putter'
        : s.club.id === 'driver' || s.club.id === 'wood'
          ? 'driver'
          : 'iron';
      heading = a.shot.aim;
      golferAt = s.from;
      const { D, T, R, total } = shotTiming(s, sp);
      const e = at - a.t0;
      const back = -Math.min(1, a.shot.power / 100);
      if (e < D) {
        swing = back * (1 - (e / D) ** 2);
        ball = { x: s.from.x, y: 0, z: s.from.z };
        cam = putting ? 'putt' : 'swing';
      } else if (e < total) {
        swing = putting
          ? Math.min(0.4, ((e - D) / (400 * sp)) * 0.4)
          : Math.min(1, easeOut((e - D) / (700 * sp)));
        if (!putting && e - D < T) ball = flightAt(s, (e - D) / T);
        else if (putting) {
          const k = easeOut((e - D - T) / R);
          ball = {
            x: s.from.x + (s.rest.x - s.from.x) * k,
            y: 0,
            z: s.from.z + (s.rest.z - s.from.z) * k,
          };
        } else ball = rollAt(s, (e - D - T) / R);
        cam = putting ? 'putt' : e - D < 600 * sp ? 'swing' : 'follow';
      } else {
        swing = putting ? 0.4 : 1;
        ball = s.holed
          ? { x: s.rest.x, y: -0.06, z: s.rest.z }
          : { x: s.rest.x, y: 0, z: s.rest.z };
        cam = s.holed ? 'holed' : putting ? 'putt' : 'follow';
        cheer = s.holed;
      }
    } else {
      const c = r.golf.players[shooter];
      const gg = L.geos[holeNo]!;
      const at0 = c?.ball ?? gg.tee;
      golferAt = at0;
      ball = { x: at0.x, y: 0, z: at0.z };
      const lie = c?.lie ?? 'tee';
      const cl =
        shooter === L.me ? L.club : lie === 'green' ? PUTTER : clubFor(dist(at0, gg.pin), lie);
      putting = cl === PUTTER;
      clubKind = putting ? 'putter' : cl.id === 'driver' || cl.id === 'wood' ? 'driver' : 'iron';
      const ph = phaseRef.current;
      heading =
        shooter === L.me
          ? ph.phase === 'address'
            ? L.aim
            : ph.stance
          : defaultAim(gg, at0, cl, lie);
      cam = putting ? 'putt' : 'aim';
      if (shooter === L.me && ph.phase === 'charging') {
        swing = -Math.min(1, powerAt(at - ph.t0, putting) / 100);
        if (!putting) cam = 'swing';
      }
      if (shooter === L.me && L.myTurn && ph.phase !== 'sending') {
        const reach = cl.carry * LIE_CARRY[lie];
        aimLine = {
          heading,
          carry:
            ph.phase === 'charging'
              ? reach * Math.min(1.06, powerAt(at - ph.t0, putting) / 100)
              : Math.min(reach, dist(at0, gg.pin) + (putting ? 0.5 : 15)),
        };
      }
      if (c?.done) {
        cam = 'holed';
        ball = { x: gg.pin.x, y: -0.06, z: gg.pin.z };
      }
    }
    const g2 = L.geos[holeNo]!;
    const rx = Math.cos(heading);
    const rz = Math.sin(heading);
    const off = putting ? 0.5 : 0.62;
    const golfer = { x: golferAt.x - rx * off, z: golferAt.z - rz * off };
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    const px = golfer.x - fx * 3 - rx * 2.4;
    const pz = golfer.z - fz * 3 - rz * 2.4;
    return {
      hole: holeNo,
      geo: g2,
      ball,
      golfer,
      heading,
      swing,
      putting,
      club: clubKind,
      cam,
      intro: 1,
      aim: aimLine,
      partners: [{ x: px, z: pz, face: Math.atan2(golfer.x - px, golfer.z - pz), clap: cheer }],
      cheer,
      swinger: shooter === L.me ? 0 : 1,
    };
  }, [sp]);

  // ---- What the screen shows.
  const cur = room.currency;
  const pot = room.status === 'finished' ? room.stake * room.members.length : room.pot;
  const left = Math.max(0, room.deadline - now);
  const turnName =
    room.turn === me ? t('You') : first(room.members.find((m) => m.id === room.turn)?.name ?? '');
  const pars = G.pars;
  const total = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const youCard = mine?.card ?? [];
  const otherCard = G.players[other]?.card ?? [];
  const status =
    room.status === 'playing' && !animating && phase !== 'charging'
      ? myTurn
        ? phase === 'sending'
          ? 'sending'
          : 'address'
        : 'watch'
      : room.status === 'playing'
        ? animating
          ? 'shot'
          : phase
        : room.status;
  const need = Math.round(
    Math.min(
      100,
      ((dist(ball, g.pin) + (club === PUTTER ? 0.4 : 0)) / (club.carry * LIE_CARRY[lie])) * 100,
    ),
  );
  const pool = club === PUTTER ? [PUTTER] : CLUBS.filter((c) => c.id !== 'driver' || lie === 'tee');
  const holeShots = G.shots.filter((s) => s.hole === hole && s.by === me);

  const playerCard = (id: string, label: string) => {
    const c = G.players[id];
    const done = c?.done;
    const vs = c ? vsParOf(c.card, pars) + (done ? 0 : 0) : 0;
    const gHere = geos[hole]!;
    const m = c ? dist(c.ball, gHere.pin) : gHere.length;
    return (
      <div
        className={`golf-mp${room.turn === id && room.status === 'playing' ? ' is-turn' : ''}${id === me ? ' is-me' : ''}`}
        data-golf-player={id === me ? 'me' : 'them'}
        data-golf-score={c ? total(c.card) : 0}
      >
        <span className="golf-mp-face" aria-hidden="true">
          {label.slice(0, 1)}
        </span>
        <span className="golf-mp-text">
          <b>{label}</b>
          <small>
            {!c
              ? ''
              : done
                ? t('Holed out in {n}', { n: c.card.at(-1) ?? c.strokes })
                : c.strokes === 0
                  ? t('On the tee')
                  : c.strokes === 1
                    ? t('1 shot · {m} m left', {
                        m: c.lie === 'green' ? Math.round(m * 10) / 10 : Math.round(m),
                      })
                    : t('{n} shots · {m} m left', {
                        n: c.strokes,
                        m: c.lie === 'green' ? Math.round(m * 10) / 10 : Math.round(m),
                      })}
          </small>
        </span>
        <strong className="golf-mp-vs">{vsParText(vs)}</strong>
      </div>
    );
  };

  const header = (
    <header className="place-head">
      <div className="place-title">
        <h2>{props.title}</h2>
        <span className="small muted">
          {room.status === 'playing'
            ? t('Hole {n} of {of} · Par {par} · vs {name}', {
                n: hole + 1,
                of: G.holes,
                par: pars[hole]!,
                name: first(otherName),
              })
            : room.status === 'waiting'
              ? t('Waiting for {name}', { name: first(otherName) })
              : t('Round complete · vs {name}', { name: first(otherName) })}
        </span>
      </div>
      {room.status === 'playing' && (
        <GameExitButton room={room} me={me} look="golf" onAsk={() => setExiting(true)} />
      )}
      <button type="button" className="icon-btn" aria-label={t('Close')} onClick={props.onClose}>
        ✕
      </button>
    </header>
  );

  const drawing = want3d ? (
    <Suspense fallback={<Golf2D me={myLook} partners={[otherLook]} frame={frame} />}>
      <Golf3D me={myLook} partners={[otherLook]} frame={frame} market={market} />
    </Suspense>
  ) : (
    <Golf2D me={myLook} partners={[otherLook]} frame={frame} />
  );

  return (
    <div
      className={`place-scene golf-scene golf-match-scene${room.status === 'playing' ? ' is-play' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      data-room="golf"
      data-golf-match={room.status}
      data-golf-turn={myTurn ? 'me' : 'them'}
      data-golf-phase={status}
      data-golf-hole={hole + 1}
    >
      {header}
      {exiting && (
        <GameExitAsk
          room={room}
          me={me}
          look="golf"
          onStay={() => setExiting(false)}
          onGone={() => {
            setExiting(false);
            props.onLeave();
          }}
        />
      )}
      <div className={`golf-view${room.status === 'playing' ? '' : ' is-card'}`}>
        {drawing}
        {room.status === 'playing' && (
          <>
            <div className="golf-mhud">
              <div className="golf-mp-row">
                {playerCard(me, t('You'))}
                {playerCard(other, first(otherName))}
              </div>
              <div className="golf-mhud-row">
                <div className="golf-mhud-side">
                  <span className="golf-pot" data-golf-pot={pot}>
                    💰 {t('Pot {pot}', { pot: money(pot, cur) })}
                  </span>
                  <span className="golf-clock" data-golf-clock={Math.ceil(left / 1000)}>
                    ⏱ {clock(left)}
                  </span>
                  <MiniCard
                    pars={pars}
                    hole={hole}
                    rows={[
                      { name: t('You'), card: youCard, me: true },
                      { name: first(otherName), card: otherCard, me: false },
                    ]}
                  />
                </div>
                <MiniMap
                  g={g}
                  ball={ball}
                  aim={canSwing ? aim : null}
                  shots={holeShots.map((s) => ({
                    hole: s.hole,
                    par: pars[s.hole]!,
                    club: s.club,
                    from: s.from,
                    land: s.land,
                    rest: s.rest,
                    lie: s.lie,
                    fromLie: s.fromLie,
                    penalty: s.penalty,
                  }))}
                />
              </div>
            </div>
            <div className="golf-tray" role="group" aria-label={t('Your shot')}>
              {myTurn && (
                <ClubColumn
                  pool={pool}
                  club={club}
                  lie={lie}
                  disabled={!canSwing || club === PUTTER}
                  onPick={(c) => setSel({ ...choice, club: c, aimOff: 0 })}
                />
              )}
              <ShotControls
                canAim={canSwing}
                onAim={nudge}
                meter={
                  <PowerMeter
                    key={`${hole}:${mine?.strokes ?? 0}`}
                    meterRef={meterRef}
                    need={myTurn ? need : null}
                    lie={lie}
                  />
                }
                swing={{
                  disabled: !(canSwing || phase === 'charging'),
                  label:
                    phase === 'charging'
                      ? t('Let go to hit')
                      : club === PUTTER
                        ? t('Hold to putt')
                        : t('Hold to swing'),
                  big: phase === 'charging' ? t('Let go') : myTurn ? t('Hold') : t('Wait'),
                  small:
                    phase === 'charging'
                      ? t('to hit')
                      : !myTurn
                        ? t('their shot')
                        : club === PUTTER
                          ? t('to putt')
                          : t('to swing'),
                  onDown: startSwing,
                  onUp: () => void release(),
                  onCancel: abort,
                }}
                mid={
                  phase === 'charging' ? (
                    <PowerRead readRef={readRef} />
                  ) : animating ? null : (
                    <>
                      <div className="golf-turn-card" role="status" data-golf-turn-card="">
                        <span className="golf-kicker">
                          {myTurn
                            ? club === PUTTER
                              ? t('Your putt')
                              : t('Your shot')
                            : t('{name}’s shot', { name: turnName })}
                        </span>
                        <b>
                          {myTurn
                            ? lie === 'green'
                              ? t('Hole it for {score}', {
                                  score: tx(
                                    scoreName((mine?.strokes ?? 0) + 1, pars[hole]!),
                                  ).replace(/!$/, ''),
                                })
                              : t('{m} m to the pin · {lie}', {
                                  m: Math.round(dist(ball, g.pin)),
                                  lie: LIE_WORD[lie](),
                                })
                            : room.ai.includes(room.turn ?? '')
                              ? t('{name} is lining it up…', { name: turnName })
                              : t('{name} is playing', { name: turnName })}
                        </b>
                        <span>
                          {myTurn
                            ? t('{name} is watching · {time} left for your shot', {
                                name: first(otherName),
                                time: clock(left),
                              })
                            : t('{time} on their clock', { time: clock(left) })}
                        </span>
                      </div>
                      {myTurn && (
                        <button
                          type="button"
                          className="golf-pickup"
                          data-action="golf-pickup"
                          title={t('Pick up = par + {n}', { n: 3 })}
                          disabled={!canSwing || (mine?.strokes ?? 0) === 0}
                          onClick={pickUp}
                        >
                          {t('Pick up')} ›
                        </button>
                      )}
                    </>
                  )
                }
              />
            </div>
          </>
        )}
        {room.status === 'waiting' && (
          <div className="golf-intro" data-golf-waiting="">
            <span className="golf-kicker">{t('Golf challenge')}</span>
            <h3>
              {room.host === me
                ? people[other]?.ai
                  ? t('{name} is on the way…', { name: otherName })
                  : t('Waiting for {name} to accept', { name: otherName })
                : t('Your invitation from {name}', { name: otherName })}
            </h3>
            <p className="small">
              {people[other]?.ai && G.inviteHandicap !== null
                ? t('AI friend · golf handicap {n}', { n: G.inviteHandicap })
                : t('They see your invitation in their phone.')}
            </p>
            <span className="golf-pot" data-golf-pot={pot}>
              💰 {t('Pot {pot}', { pot: money(pot, cur) })}
            </span>
            <p className="small muted">
              {room.stake
                ? t(
                    'Your {stake} stake is held in the pot. If they say no or don’t answer in 30 minutes, it comes back to you.',
                    { stake: money(room.stake, cur) },
                  )
                : t('A free round, for fun. If they don’t answer in 30 minutes, it’s off.')}
            </p>
            {room.host === me && !exiting && (
              <div className="golf-intro-actions">
                <GameExitButton room={room} me={me} look="golf" onAsk={() => setExiting(true)} />
              </div>
            )}
          </div>
        )}
        {(room.status === 'finished' || room.status === 'cancelled') && (
          <Result
            room={room}
            me={me}
            other={other}
            otherName={otherName}
            youCard={youCard}
            otherCard={otherCard}
            busy={busy}
            onRematch={async () => {
              const r = await send<{ id: string }>({
                type: 'play.create',
                game: 'golf',
                venue: room.venue,
                title: room.title,
                stake: room.stake,
                invite: other,
                holes: G.holes,
              });
              if (r) props.onRematch(r.id);
            }}
            onDone={props.onClose}
            onBack={props.onLeave}
          />
        )}
      </div>
    </div>
  );
}

/** The scorecard in the tray: both players, hole by hole. */
function MiniCard({
  pars,
  hole,
  rows,
}: {
  pars: readonly number[];
  hole: number;
  rows: { name: string; card: readonly number[]; me: boolean }[];
}) {
  return (
    <table className="golf-minicard" aria-label={t('Scorecard')}>
      <thead>
        <tr>
          <th />
          {pars.map((_, i) => (
            <th key={i}>{i + 1}</th>
          ))}
          <th>{t('Tot')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className={r.me ? 'you' : ''}>
            <th>{r.name}</th>
            {pars.map((_, i) => (
              <td key={i}>{r.card[i] ?? (i === hole ? '…' : '·')}</td>
            ))}
            <td>{r.card.reduce((a, b) => a + b, 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The end (mockup 3d): who took the pot, both cards, and the money for the round. */
function Result({
  room,
  me,
  other,
  otherName,
  youCard,
  otherCard,
  busy,
  onRematch,
  onDone,
  onBack,
}: {
  room: MatchRoom;
  me: string;
  other: string;
  otherName: string;
  youCard: readonly number[];
  otherCard: readonly number[];
  busy: boolean;
  onRematch: () => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const cur = room.currency;
  const G = room.golf;
  const pars = G.pars;
  const total = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const cancelled = room.status === 'cancelled';
  const tie = !cancelled && room.winners.length > 1;
  const won = !cancelled && room.winners.length === 1 && room.winners[0] === me;
  const pot = room.stake * room.members.length;
  const played = !!G.players[me];
  const net = cancelled
    ? 0
    : (won ? pot : tie ? room.stake : 0) - room.stake - (played ? G.fee : 0);
  const name = first(otherName);
  return (
    <div
      className="golf-card golf-result-card"
      data-golf-result-card={won ? 'won' : tie ? 'tie' : cancelled ? 'cancelled' : 'lost'}
    >
      {cancelled ? (
        <>
          <span className="golf-kicker">{t('Match called off')}</span>
          <h3>{t('Your stake is back')}</h3>
          <p className="small muted">{tx(room.last)}</p>
        </>
      ) : (
        <div className="golf-win">
          <span className="golf-win-cup" aria-hidden="true">
            {won ? '🏆' : tie ? '🤝' : '⛳'}
          </span>
          <span className="golf-kicker">
            {won
              ? t('You win the pot')
              : tie
                ? t('A tie: both stakes back')
                : t('{name} wins the pot', { name })}
          </span>
          <b
            className={`golf-win-amount${won ? ' up' : ''}`}
            data-golf-net={won ? pot : tie ? 0 : -room.stake}
          >
            {won
              ? `+${money(pot, cur)}`
              : tie
                ? money(room.stake, cur)
                : `−${money(room.stake, cur)}`}
          </b>
          <p className="small muted">
            {t('{a} strokes to {name}’s {b}', { a: total(youCard), name, b: total(otherCard) })}
            {won ? ` · ${t('paid to your personal account')}` : ''}
          </p>
        </div>
      )}
      {!cancelled && (
        <table>
          <thead>
            <tr>
              <th>{t('Hole')}</th>
              {pars.map((_, i) => (
                <th key={i}>{i + 1}</th>
              ))}
              <th>{t('Total')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="par">
              <th>{t('Par')}</th>
              {pars.map((p, i) => (
                <td key={i}>{p}</td>
              ))}
              <td>{total(pars)}</td>
            </tr>
            <tr className="you">
              <th>{t('You')}</th>
              {youCard.map((x, i) => (
                <td key={i}>
                  <Mark strokes={x} par={pars[i]!} />
                </td>
              ))}
              <td data-golf-total={total(youCard)}>{total(youCard)}</td>
            </tr>
            <tr>
              <th>{name}</th>
              {otherCard.map((x, i) => (
                <td key={i}>
                  <Mark strokes={x} par={pars[i]!} />
                </td>
              ))}
              <td>{total(otherCard)}</td>
            </tr>
          </tbody>
        </table>
      )}
      <div className="golf-ledger" data-golf-ledger="">
        {room.stake > 0 && (
          <p>
            <span>{t('Your stake')}</span>
            <b>−{money(room.stake, cur)}</b>
          </p>
        )}
        {won && room.stake > 0 && (
          <p>
            <span>{t('Social game winnings')}</span>
            <b className="up">+{money(pot, cur)}</b>
          </p>
        )}
        {(tie || cancelled) && room.stake > 0 && (
          <p>
            <span>{t('Game entry refunded')}</span>
            <b className="up">+{money(room.stake, cur)}</b>
          </p>
        )}
        {played && (
          <p>
            <span>{t('Green fee')}</span>
            <b>−{money(G.fee, cur)}</b>
          </p>
        )}
        <p className="golf-ledger-net">
          <span>{t('Net for the round')}</span>
          <b className={net > 0 ? 'up' : net < 0 ? 'down' : ''}>
            {net > 0 ? '+' : net < 0 ? '−' : ''}
            {money(Math.abs(net), cur)}
          </b>
        </p>
      </div>
      <div className="golf-intro-actions">
        {!cancelled ? (
          <button
            type="button"
            className="btn btn-subtle"
            data-action="golf-rematch"
            disabled={busy}
            onClick={onRematch}
          >
            {room.stake ? t('Rematch {stake}', { stake: money(room.stake, cur) }) : t('Rematch')}
          </button>
        ) : (
          <button type="button" className="btn btn-subtle" onClick={onBack}>
            {t('Back to the club')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          data-action="golf-match-done"
          onClick={onDone}
        >
          {t('Done')}
        </button>
      </div>
      {!cancelled && room.stake > 0 && (
        <p className="small muted golf-result-note">
          {t('A tie would have returned {stake} to each of you.', {
            stake: money(room.stake, cur),
          })}
        </p>
      )}
      <span hidden data-golf-other={other} />
    </div>
  );
}
