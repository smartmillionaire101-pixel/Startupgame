/**
 * Ten-pin bowling on a phone (the more-games release): a real lane in 3D
 * (maple boards and the arrows, the gutters, ten pins on the deck, the
 * neighbouring lanes and the masking unit), seen from behind the foul line.
 * Swipe up from where you stand: the swipe's line is the ball's, faster is
 * harder, and a swipe that bows hooks the ball once it leaves the oil (or
 * set it with the sliders and Bowl). The engine rolls the ball and the pins
 * fall as it decided (`play.bowl`); every screen replays the same roll from
 * its launch, the camera riding behind the ball into the crash. Whoever is
 * up stands at the lane holding the ball (you, in your outfit) and bowls it:
 * a few steps, the swing back, the slide and the release, the follow-through.
 *
 * Without WebGL (or in Lite) the lane is drawn from above.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  BALL_R,
  FULL_RACK,
  KICKBACK,
  LANE_HALF,
  LANE_LEN,
  PIN_SPOTS,
  PIT_Z,
  simulateBowl,
  type BowlInput,
  type BowlSim,
  type PlayerView,
} from '@runway/engine';
import { useView } from '../store';
import { t } from '../i18n';
import { avatarLook, type AvatarLook } from '../city/art';
import { genderOf } from '../city/life';
import { makeCharacter, pose, type Character } from '../interiors3d/character';
import { disposeTree } from '../interiors3d/kit';
import { screenBoxOf } from '../three-kit/screen-box';
import { softwareGl, useQuality, webglAvailable } from '../three-kit/quality';
import {
  dashQuads,
  frameAt,
  guideLine,
  pinTilt,
  rollCall,
  swipeToBowl,
  type RollCall,
  type SwipePoint,
} from './bowling-view';
import { reduceMotion, sfx } from './sfx';

type Room = PlayerView['playRooms'][number];

/** The roll is shown a little slower than real time (≈3 s to the pins). */
const SLOW = 1.25;
/** The bowler's throw: from the first step to letting the ball go at the foul line (ms). */
const RELEASE_MS = 650;

const CALL_TEXT: Record<RollCall, string> = {
  strike: 'STRIKE!',
  spare: 'SPARE!',
  gutter: 'Gutter ball',
  split: 'Split!',
  pins: '{n} pins',
  miss: 'Missed them all',
};

function callText(call: RollCall, n: number) {
  return call === 'pins' ? (n === 1 ? t('1 pin') : t('{n} pins', { n })) : t(CALL_TEXT[call]);
}

export default function Bowling({
  room,
  me,
  live,
  serverNow = Date.now,
}: {
  room: Room;
  me: string;
  live: boolean;
  /** The server's clock (the pins settle by it; a phone's own clock can be seconds out). */
  serverNow?: () => number;
}) {
  const { view, send, busy } = useView();
  const quality = useQuality();
  const gl = quality === '3d' && webglAvailable();
  const g = room.bowling!;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 358, h: 440 });
  const [input, setInput] = useState<BowlInput>({ x: 0.25, aim: 0.004, power: 0.6, spin: -0.4 });
  const [trail, setTrail] = useState<SwipePoint[]>([]);
  const [hint, setHint] = useState('');
  const [banner, setBanner] = useState<{ text: string; good: boolean } | null>(null);
  const pts = useRef<SwipePoint[]>([]);
  const lane = useRef<Lane | null>(null);
  // The roll playing out (its recorded frames), and when it started.
  const [roll, setRoll] = useState<{ sim: BowlSim; n: number; started: number } | null>(null);
  const seen = useRef<number | null>(null);
  const [now, setNow] = useState(() => serverNow());
  const clock = useRef(serverNow);
  useEffect(() => {
    clock.current = serverNow;
  });

  const mine = live && g.bowler === me;
  const ready = now >= g.readyAt - 200;
  const canAct = mine && !roll && ready && !busy;
  const up = g.bowler ? g.players[g.bowler] : undefined;
  const standing = useMemo(() => up?.standing ?? [...FULL_RACK], [up]);
  // Who stands at the lane: you in your own look, or the one who's up.
  const bowlerId = g.bowler ?? me;
  const bowlerLook = useMemo(
    () =>
      bowlerId === view.me.id
        ? avatarLook(view.me.background?.id, view.me.id, genderOf(view.me))
        : avatarLook(undefined, bowlerId),
    [bowlerId, view.me],
  );
  // A throw by hand: the bowler's animation runs until the roll takes over.
  const [throwN, setThrowN] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(clock.current()), 250);
    return () => clearInterval(id);
  }, []);

  // Your ball: bring the lane on screen (the ball waits at its foot), once a turn.
  const turnShown = useRef(-1);
  useEffect(() => {
    if (!canAct || turnShown.current === g.balls) return;
    // Once the prompt and the lane have their size.
    const id = setTimeout(() => {
      turnShown.current = g.balls;
      const el = wrapRef.current;
      if (!el?.scrollIntoView) return;
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight || r.top < 0)
        el.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
    }, 250);
    return () => clearTimeout(id);
  }, [canAct, g.balls]);

  // iOS: keep a swipe on the lane from scrolling the page or the sheet under it.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const stop = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    c.addEventListener('touchmove', stop, { passive: false });
    return () => c.removeEventListener('touchmove', stop);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const w = Math.min(el.clientWidth || 358, 520);
      setSize({ w, h: Math.round(Math.min(w * 1.3, window.innerHeight * 0.56)) });
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  // The 3D lane: built once.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !gl) return;
    let l: Lane;
    try {
      l = new Lane(c, softwareGl());
    } catch {
      return;
    }
    lane.current = l;
    (window as unknown as { __bowl3d?: Lane }).__bowl3d = l;
    return () => {
      l.dispose();
      lane.current = null;
      delete (window as unknown as { __bowl3d?: Lane }).__bowl3d;
    };
  }, [gl]);
  useEffect(() => {
    lane.current?.resize(size.w, size.h);
  }, [size]);
  useEffect(() => {
    lane.current?.setBowler(bowlerId, bowlerLook);
    lane.current?.render();
  }, [bowlerId, bowlerLook, gl]);
  // Your throw, from the swipe until the roll comes back from the server.
  useEffect(() => {
    const l = lane.current;
    if (!throwN || roll || !l) return;
    let raf = 0;
    const end = performance.now() + 2000;
    const step = () => {
      l.render();
      if (performance.now() < end) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [throwN, roll]);

  // A new ball: replay it from its launch (not the ones already rolled when we arrived).
  const last = g.last;
  useEffect(() => {
    const first = seen.current === null;
    if (seen.current === g.balls) return;
    seen.current = g.balls;
    if (first || !last) return;
    const sim = simulateBowl(last.standing, last.launch, true, g.deck ?? 'lively');
    const call = rollCall(last.standing, last.knocked, last.gutter);
    const text = callText(call, last.knocked.length);
    const good = (last.by === me) === (call === 'strike' || call === 'spare' || call === 'pins');
    if (reduceMotion()) {
      const id = requestAnimationFrame(() => setBanner({ text, good }));
      return () => cancelAnimationFrame(id);
    }
    sfx.roll(Math.max(0.5, sim.impact > 0 ? sim.impact * SLOW : 2));
    if (sim.impact > 0) sfx.pins(last.knocked.length, sim.impact * SLOW);
    // The bowler steps up and lets it go first (yours started with your swipe).
    const lead = lane.current?.throwLead(performance.now()) ?? 0;
    const started = performance.now() + lead;
    const id = requestAnimationFrame(() => {
      setBanner(null);
      setRoll({ sim, n: g.balls, started });
    });
    const done = setTimeout(
      () => {
        setRoll(null);
        setBanner({ text, good });
      },
      lead + Math.min(sim.time, 6) * SLOW * 1000 + 200,
    );
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new ball starts an animation
  }, [g.balls]);
  useEffect(() => {
    if (!banner || roll) return;
    const id = setTimeout(() => setBanner(null), 2400);
    return () => clearTimeout(id);
  }, [banner, roll]);

  // Draw: the roll's frames as they play, or the rack waiting for the next ball.
  const guide = useMemo(() => (canAct ? guideLine(input) : []), [canAct, input]);
  useEffect(() => {
    const l = lane.current;
    if (!l) return;
    if (roll) {
      let raf = 0;
      const step = () => {
        const s = (performance.now() - roll.started) / 1000 / SLOW;
        // Until the bowler lets go, the throw (the ball in their hand).
        if (s >= 0) l.show(roll.sim, s);
        l.render();
        if (s < roll.sim.time + 0.2) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }
    l.rack(standing, canAct ? input.x : 0, guide, me === g.bowler ? MY_BALL : THEIR_BALL);
    l.render();
  }, [roll, standing, input, guide, canAct, me, g.bowler]);

  // Lite: the lane from above (the same frames).
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || gl) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (roll) {
      let raf = 0;
      const step = () => {
        const s = (performance.now() - roll.started) / 1000 / SLOW;
        draw2d(ctx, size.w, size.h, frameAt(roll.sim.frames, s), standing, []);
        if (s < roll.sim.time + 0.2) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }
    draw2d(ctx, size.w, size.h, null, standing, guide, canAct ? input.x : null);
  }, [gl, roll, size, standing, guide, canAct, input.x]);

  const bowl = (i: BowlInput) =>
    void send({ type: 'play.bowl', roomId: room.id, round: room.round, ...i });

  const point = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canAct) {
      if (mine && !roll) setHint(t('Wait for the pins to settle.'));
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pts.current = [point(e)];
    setTrail(pts.current);
    setHint('');
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pts.current.length) return;
    pts.current = [...pts.current, point(e)].slice(-80);
    setTrail(pts.current);
  };
  const onUp = () => {
    const swipe = pts.current;
    pts.current = [];
    setTrail([]);
    if (!canAct || swipe.length < 2) return;
    const b = swipeToBowl(size.w, swipe);
    if (!b) {
      setHint(t('Swipe up the lane to bowl.'));
      return;
    }
    setInput(b);
    if (!reduceMotion() && lane.current) {
      lane.current.throwBall(performance.now());
      setThrowN((n) => n + 1);
    }
    bowl(b);
  };

  const who = (id?: string | null) =>
    id === me ? t('You') : (room.members.find((m) => m.id === id)?.name ?? '');
  const prompt = !live
    ? ''
    : roll
      ? ''
      : mine
        ? ready
          ? up && up.ball > 0
            ? t('Frame {f}, ball {b}: {n} pins to pick up. Swipe up from where you stand.', {
                f: up.frame + 1,
                b: up.ball + 1,
                n: standing.length,
              })
            : t(
                'Frame {f}: your ball. Swipe up from where you stand — the line is your aim, faster is harder, bend the swipe to hook it.',
                { f: (up?.frame ?? 0) + 1 },
              )
          : t('The pinsetter is resetting…')
        : room.ai.includes(g.bowler ?? '')
          ? t('{name} steps up to the lane…', { name: who(g.bowler) })
          : t('{name} to bowl.', { name: who(g.bowler) });

  return (
    <div className="bowling" data-bowling="">
      <BowlingSheet room={room} me={me} />
      <p className="bowling-prompt" role="status">
        {hint || prompt}
      </p>
      <div className="bowling-lane" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          style={{ width: size.w, height: size.h }}
          role="img"
          aria-label={t('The bowling lane, from behind the foul line')}
          data-mine={canAct ? '1' : '0'}
          data-rolling={roll ? '1' : '0'}
          data-balls={g.balls}
          data-gl={gl ? '1' : '0'}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          // A browser that takes the touch back mid-swipe still bowls what was swiped.
          onPointerCancel={onUp}
        />
        {trail.length > 1 && (
          <svg
            className="bowling-trail"
            viewBox={`0 0 ${size.w} ${size.h}`}
            style={{ width: size.w, height: size.h }}
            aria-hidden="true"
          >
            <polyline points={trail.map((p) => `${p.x},${p.y}`).join(' ')} />
          </svg>
        )}
        <PinDeck standing={roll ? [] : standing} />
        {banner && (
          <div className={`bowling-banner ${banner.good ? 'good' : 'bad'}`} role="status">
            {banner.text}
          </div>
        )}
      </div>
      {mine && (
        <div className="bowling-controls" aria-label={t('Your ball')}>
          <label className="pool-slider">
            {t('Where you stand')}
            <input
              type="range"
              min={-45}
              max={45}
              value={Math.round(input.x * 100)}
              onChange={(e) => setInput({ ...input, x: Number(e.target.value) / 100 })}
            />
          </label>
          <label className="pool-slider">
            {t('Line')}
            <input
              type="range"
              min={-60}
              max={60}
              value={Math.round(input.aim * 1000)}
              onChange={(e) => setInput({ ...input, aim: Number(e.target.value) / 1000 })}
            />
          </label>
          <label className="pool-slider">
            {t('Hook')}
            <input
              type="range"
              min={-100}
              max={100}
              value={Math.round(input.spin * 100)}
              onChange={(e) => setInput({ ...input, spin: Number(e.target.value) / 100 })}
            />
          </label>
          <label className="pool-slider">
            {t('Power · {n}%', { n: Math.round(input.power * 100) })}
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(input.power * 100)}
              onChange={(e) => setInput({ ...input, power: Number(e.target.value) / 100 })}
            />
          </label>
          <button
            type="button"
            className="experience-primary"
            data-action="bowl"
            disabled={!canAct}
            onClick={() => bowl(input)}
          >
            {t('Bowl')}
          </button>
        </div>
      )}
    </div>
  );
}

/** The pin display: which of the ten stand (the classic triangle, from above). */
function PinDeck({ standing }: { standing: readonly number[] }) {
  return (
    <svg className="bowling-deck" viewBox="-1 -0.2 2 1.4" aria-hidden="true">
      {PIN_SPOTS.map(([x, z], i) => (
        <circle
          key={i}
          cx={(x / 0.5) * 0.9}
          cy={1.05 - ((z - LANE_LEN) / 0.8) * 0.95}
          r={0.13}
          className={standing.includes(i + 1) ? 'up' : 'down'}
        />
      ))}
    </svg>
  );
}

/** The score sheet: every bowler's ten frames, their marks and running totals. */
function BowlingSheet({ room, me }: { room: Room; me: string }) {
  const g = room.bowling!;
  return (
    <div className="bowling-sheet" aria-label={t('Score sheet')}>
      {room.members.map((m) => {
        const p = g.players[m.id];
        return (
          <div
            key={m.id}
            className={`bowling-row${g.bowler === m.id ? ' up' : ''}`}
            data-bowler={m.id}
          >
            <strong>{m.id === me ? t('You') : m.name}</strong>
            <ol>
              {Array.from({ length: 10 }, (_, k) => {
                const f = p?.frames[k];
                return (
                  <li key={k} className={k === 9 ? 'tenth' : ''}>
                    <span className="marks">
                      {(f?.marks ?? []).map((x, j) => (
                        <i key={j} className={x === 'X' ? 'x' : x === '/' ? 'sp' : ''}>
                          {x}
                        </i>
                      ))}
                    </span>
                    <b>{f?.total ?? ''}</b>
                  </li>
                );
              })}
            </ol>
            {/* The bonus balls still to come: what the sheet reads so far, with a +. */}
            <b className="bowling-total" data-score={m.score}>
              {p && p.soFar > m.score ? t('{n}+', { n: p.soFar }) : m.score}
            </b>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Drawing (Lite)

function draw2d(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  f: ReturnType<typeof frameAt>,
  standing: readonly number[],
  guide: [number, number][],
  release: number | null = null,
) {
  // The lane fills the height: z from −0.6 (behind the foul line) to the pit.
  const z0 = -0.6,
    z1 = PIT_Z + 0.3;
  const k = (H - 10) / (z1 - z0);
  const sx = (x: number) => W / 2 + x * k * 2.2;
  const sy = (z: number) => H - 5 - (z - z0) * k;
  g.fillStyle = '#1a1210';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#3a3f47';
  g.fillRect(sx(-KICKBACK), sy(z1), sx(KICKBACK) - sx(-KICKBACK), sy(z0) - sy(z1));
  const wood = g.createLinearGradient(sx(-LANE_HALF), 0, sx(LANE_HALF), 0);
  wood.addColorStop(0, '#d9a868');
  wood.addColorStop(0.5, '#ecc58c');
  wood.addColorStop(1, '#d9a868');
  g.fillStyle = wood;
  g.fillRect(
    sx(-LANE_HALF),
    sy(PIT_Z - 0.3),
    sx(LANE_HALF) - sx(-LANE_HALF),
    sy(z0) - sy(PIT_Z - 0.3),
  );
  g.strokeStyle = '#b3261e';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(sx(-LANE_HALF), sy(0));
  g.lineTo(sx(LANE_HALF), sy(0));
  g.stroke();
  // The arrows, 4.6 m down.
  g.fillStyle = '#7a4a1c';
  for (let a = -3; a <= 3; a++) {
    const x = a * 0.127,
      z = 4.6 + Math.abs(a) * 0.15;
    g.beginPath();
    g.moveTo(sx(x), sy(z + 0.3));
    g.lineTo(sx(x) - 3, sy(z));
    g.lineTo(sx(x) + 3, sy(z));
    g.fill();
  }
  if (guide.length > 1) {
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.setLineDash([4, 5]);
    g.beginPath();
    guide.forEach(([x, z], i) => (i ? g.lineTo(sx(x), sy(z)) : g.moveTo(sx(x), sy(z))));
    g.stroke();
    g.setLineDash([]);
  }
  const pins = f
    ? f.pins
    : standing.map((n) => ({
        n,
        x: PIN_SPOTS[n - 1]![0],
        z: PIN_SPOTS[n - 1]![1],
        down: false,
        dir: 0,
      }));
  for (const p of pins) {
    if (p.z > PIT_Z + 0.05) continue;
    g.fillStyle = p.down ? 'rgba(255,255,255,0.55)' : '#fff';
    g.strokeStyle = '#c62828';
    g.lineWidth = 1.5;
    g.beginPath();
    if (p.down) {
      g.ellipse(sx(p.x), sy(p.z), 3, 7, -p.dir, 0, Math.PI * 2);
    } else g.arc(sx(p.x), sy(p.z), 4, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  const ball = f?.ball ?? (release !== null ? { x: release, z: -0.25, gutter: false } : null);
  if (ball && ball.z < PIT_Z) {
    g.fillStyle = '#1d4ed8';
    g.beginPath();
    g.arc(sx(ball.x), sy(ball.z), Math.max(4, BALL_R * k * 2.2), 0, Math.PI * 2);
    g.fill();
  }
}

// ---------------------------------------------------------------- The lane in 3D

const MY_BALL = '#1d4ed8';
const THEIR_BALL = '#b91c1c';

/** Boards, the arrows and the dots, the foul line: the lane's surface as a texture. */
function laneTexture(soft: boolean) {
  const c = document.createElement('canvas');
  c.width = soft ? 128 : 256;
  c.height = soft ? 1024 : 2048;
  const g = c.getContext('2d')!;
  const W = c.width,
    H = c.height;
  // 39 maple boards, each its own shade.
  for (let b = 0; b < 39; b++) {
    const light = 0.82 + ((b * 7919) % 13) / 100;
    g.fillStyle = `rgb(${Math.round(232 * light)},${Math.round(186 * light)},${Math.round(128 * light)})`;
    g.fillRect((b / 39) * W, 0, W / 39 + 1, H);
  }
  // The pine back end is a touch darker.
  g.fillStyle = 'rgba(120,70,20,0.10)';
  g.fillRect(0, 0, W, H * 0.33);
  // A sheen down the middle (the oil).
  const sheen = g.createLinearGradient(0, 0, W, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(0, H * 0.33, W, H * 0.67);
  const zy = (z: number) => H - (z / 19.4) * H;
  // The arrows (15 feet down) and the dots (7 feet).
  g.fillStyle = '#5b3412';
  for (let a = -3; a <= 3; a++) {
    const x = W / 2 + a * 5 * (W / 39);
    const z = 4.6 + Math.abs(a) * 0.3;
    g.beginPath();
    g.moveTo(x, zy(z + 0.45));
    g.lineTo(x - W / 70, zy(z));
    g.lineTo(x + W / 70, zy(z));
    g.fill();
    g.beginPath();
    g.arc(x, zy(2.1), W / 120, 0, Math.PI * 2);
    g.fill();
  }
  // The foul line.
  g.fillStyle = '#1b1b1b';
  g.fillRect(0, zy(0) - 4, W, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = soft ? 1 : 4;
  return tex;
}

/** A ten-pin: the regulation profile turned on a lathe, white with its two red stripes. */
function pinGeometry() {
  const prof: [number, number][] = [
    [0, 0],
    [0.026, 0],
    [0.04, 0.03],
    [0.055, 0.08],
    [0.0605, 0.114],
    [0.056, 0.16],
    [0.042, 0.21],
    [0.028, 0.25],
    [0.0227, 0.268],
    [0.027, 0.3],
    [0.032, 0.33],
    [0.028, 0.362],
    [0.015, 0.378],
    [0, 0.381],
  ];
  return new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)),
    20,
  );
}

function ballTexture(color: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 128);
  // A marbled swirl.
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.05 + (i % 5) * 0.03})`;
    g.lineWidth = 2 + (i % 4);
    g.beginPath();
    g.moveTo((i * 37) % 256, 0);
    g.bezierCurveTo(((i * 53) % 256) + 30, 40, ((i * 71) % 256) - 30, 90, (i * 97) % 256, 128);
    g.stroke();
  }
  // The finger holes.
  g.fillStyle = '#111';
  for (const [x, y, r] of [
    [60, 40, 7],
    [76, 40, 7],
    [68, 72, 9],
  ] as const) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The bowling alley: the lane and its neighbours, the pins and the ball, the
 * lights. `rack` stands the pins for the next ball; `show` poses a recorded
 * roll at a moment, the camera following the ball.
 */
export class Lane {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 80);
  private pins: THREE.Group[] = [];
  private ball: THREE.Mesh;
  private ballMats: Record<string, THREE.MeshStandardMaterial> = {};
  private guide: THREE.Mesh;
  /** The line the guide's dashes were built for. */
  private guideOf: readonly unknown[] | null = null;
  private spin = 0;
  private lastZ = 0;
  private disposables: { dispose(): void }[] = [];
  /** The bowlers who've stood at the lane (one is shown: whoever is up). */
  private bowlers = new Map<string, Character>();
  private bowler: Character | null = null;
  /** Where the bowler stands across the approach (the ball's line). */
  private stanceX = 0;
  /** When the throw began (performance.now, ms), or null: standing ready with the ball. */
  private throwAt: number | null = null;
  /** The roll is on the lane (the ball is the roll's, not in a hand). */
  private rolling = false;
  private hand = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, soft: boolean) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !soft, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, soft ? 1 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const s = this.scene;
    s.background = new THREE.Color('#120d16');
    s.fog = new THREE.Fog('#120d16', 26, 46);
    s.add(new THREE.HemisphereLight('#fff4e0', '#2a1c14', 0.9));
    const spot = new THREE.DirectionalLight('#ffffff', 1.6);
    spot.position.set(0.5, 6, 2);
    spot.target.position.set(0, 0, -12);
    s.add(spot, spot.target);
    const deckLight = new THREE.PointLight('#fff6e8', 6, 6, 1.6);
    deckLight.position.set(0, 1.4, -LANE_LEN - 0.4);
    s.add(deckLight);

    const own = <T extends { dispose(): void }>(x: T) => (this.disposables.push(x), x);
    const laneTex = own(laneTexture(soft));
    const wood = own(
      new THREE.MeshStandardMaterial({ map: laneTex, roughness: 0.32, metalness: 0.05 }),
    );
    const dark = own(new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.6 }));
    const steel = own(
      new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.35, metalness: 0.7 }),
    );
    const LEN = 19.4;
    // Three lanes side by side (ours in the middle), the approach behind them.
    for (const off of [-1.65, 0, 1.65]) {
      const surface = new THREE.Mesh(own(new THREE.PlaneGeometry(LANE_HALF * 2, LEN)), wood);
      surface.rotation.x = -Math.PI / 2;
      surface.position.set(off, 0, -LEN / 2);
      s.add(surface);
      for (const side of [-1, 1]) {
        // The gutter: a half pipe beside the lane.
        const gut = new THREE.Mesh(
          own(new THREE.CylinderGeometry(0.11, 0.11, LEN, 12, 1, true, Math.PI / 2, Math.PI)),
          steel,
        );
        gut.rotation.x = Math.PI / 2;
        gut.rotation.y = Math.PI;
        gut.position.set(off + side * (LANE_HALF + 0.115), 0.02, -LEN / 2);
        s.add(gut);
      }
      // The capping between lanes, the ball return on the left.
      const cap = new THREE.Mesh(own(new THREE.BoxGeometry(0.18, 0.06, LEN + 3)), dark);
      cap.position.set(off - 0.825, 0.03, -LEN / 2 + 1.5);
      s.add(cap);
    }
    const approach = new THREE.Mesh(
      own(new THREE.PlaneGeometry(6, 4.6)),
      own(new THREE.MeshStandardMaterial({ color: '#d7b07c', roughness: 0.4 })),
    );
    approach.rotation.x = -Math.PI / 2;
    approach.position.set(0, -0.002, 2.3);
    s.add(approach);
    // The pit, the kickbacks and the masking unit with the alley's lights.
    const pit = new THREE.Mesh(own(new THREE.BoxGeometry(6, 0.4, 1.2)), dark);
    pit.position.set(0, -0.25, -PIT_Z - 0.6);
    s.add(pit);
    for (const side of [-1, 1]) {
      const kick = new THREE.Mesh(own(new THREE.BoxGeometry(0.06, 0.8, 1.6)), dark);
      kick.position.set(side * KICKBACK, 0.4, -LANE_LEN - 0.6);
      s.add(kick);
    }
    const mask = new THREE.Mesh(
      own(new THREE.PlaneGeometry(6, 1.2)),
      own(
        new THREE.MeshStandardMaterial({
          map: own(maskTexture()),
          emissive: '#ffffff',
          emissiveMap: own(maskTexture()),
          emissiveIntensity: 0.8,
        }),
      ),
    );
    mask.position.set(0, 1.35, -LANE_LEN - 1.1);
    s.add(mask);

    const pinGeo = own(pinGeometry());
    const pinMat = own(new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 0.25 }));
    const stripe = own(new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.3 }));
    const ring = own(new THREE.TorusGeometry(0.0245, 0.0042, 6, 18));
    for (let i = 0; i < 10; i++) {
      const p = new THREE.Group();
      p.add(new THREE.Mesh(pinGeo, pinMat));
      for (const y of [0.247, 0.262]) {
        const r = new THREE.Mesh(ring, stripe);
        r.rotation.x = Math.PI / 2;
        r.position.y = y;
        p.add(r);
      }
      this.pins.push(p);
      s.add(p);
    }
    for (const c of [MY_BALL, THEIR_BALL])
      this.ballMats[c] = own(
        new THREE.MeshStandardMaterial({
          map: own(ballTexture(c)),
          roughness: 0.18,
          metalness: 0.15,
        }),
      );
    this.ball = new THREE.Mesh(
      own(new THREE.SphereGeometry(BALL_R, 28, 20)),
      this.ballMats[MY_BALL],
    );
    s.add(this.ball);
    // The guide: dashes painted on the boards (a ribbon a few centimetres wide,
    // not a 1-pixel line, so it reads on a phone).
    this.guide = new THREE.Mesh(
      own(new THREE.BufferGeometry()),
      own(
        new THREE.MeshBasicMaterial({
          color: '#ffffff',
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        }),
      ),
    );
    this.guide.renderOrder = 1;
    s.add(this.guide);
    this.idleCamera();
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.render();
  }

  /**
   * Waiting for a ball: over the bowler's right shoulder, the bowler on the
   * left holding the ball in the lower part of the picture (where your
   * finger starts the swipe), the guide down the boards and the rack and the
   * masking unit up top, clear of the bowler.
   */
  private idleCamera() {
    this.camera.fov = 34;
    this.camera.position.set(0.6, 2.4, 7.8);
    this.camera.lookAt(0, 0.9, -6);
    this.camera.updateProjectionMatrix();
  }

  /** Whoever is up stands at the lane (built once each, in their own look). */
  setBowler(id: string, look: AvatarLook) {
    let c = this.bowlers.get(id);
    if (!c) {
      c = makeCharacter(look, id);
      c.root.rotation.y = Math.PI;
      this.scene.add(c.root);
      this.bowlers.set(id, c);
    }
    for (const b of this.bowlers.values()) b.root.visible = b === c;
    this.bowler = c;
  }

  /** Your swipe: the bowler starts the approach now. */
  throwBall(now: number) {
    this.throwAt = now;
  }

  /**
   * A ball was bowled: how long until the bowler lets it go (ms). Your own
   * throw is already on its way; anyone else's starts now.
   */
  throwLead(now: number) {
    if (!this.bowler) return 0;
    if (this.throwAt !== null && now - this.throwAt < RELEASE_MS + 250)
      return Math.max(0, this.throwAt + RELEASE_MS - now);
    this.throwAt = now;
    return RELEASE_MS;
  }

  /**
   * The bowler at `now`: ready with the ball at the chest, or (thrown) the
   * push-away, the steps and the swing back, the slide and the release at
   * the foul line, the follow-through. Until the release the ball is in the
   * right hand.
   */
  private poseBowler(now: number) {
    const c = this.bowler;
    if (!c) return;
    const T = this.throwAt === null ? -1 : (now - this.throwAt) / 1000;
    if (T > 3) this.throwAt = null;
    const R = RELEASE_MS / 1000;
    const lerp = (a: number, b: number, u: number) => a + (b - a) * Math.max(0, Math.min(1, u));
    let z = 1.05;
    if (T < 0 || T > 3) {
      // Ready: the ball held at the right side, the left hand out a little, eyes on the pins.
      pose(c, 'stand', 0);
      c.armR.rotation.set(-0.3, 0, 0.12);
      c.foreR.rotation.set(-0.55, 0, 0);
      c.armL.rotation.set(-0.25, 0, -0.2);
      c.foreL.rotation.set(-0.7, 0, 0);
      c.torso.rotation.x = 0.06;
    } else if (T < R * 0.75) {
      // The push-away and the steps, the ball swinging down and back.
      const u = T / (R * 0.75);
      pose(c, 'walk', T * 1.6);
      c.armR.rotation.set(lerp(-0.3, 1.15, u * 1.2), 0, 0.12);
      c.foreR.rotation.set(lerp(-0.55, 0, u * 2), 0, 0);
      c.armL.rotation.set(-0.3, 0, lerp(-0.35, 1.0, u));
      c.torso.rotation.x = lerp(0.03, 0.3, u);
      z = lerp(1.05, 0.62, u);
    } else {
      // The slide on the left foot, the swing through, and the follow-through.
      const u = Math.min(1, (T - R * 0.75) / (R * 0.25));
      const f = Math.min(1, Math.max(0, (T - R) / 0.5));
      pose(c, 'stand', 0);
      c.thighL.rotation.x = -0.75;
      c.shinL.rotation.x = 0.95;
      c.thighR.rotation.set(0.6, 0, -0.15);
      c.shinR.rotation.x = 0.5;
      c.body.position.y = -0.14;
      c.torso.rotation.x = 0.42 - f * 0.12;
      c.armR.rotation.set(lerp(1.15, -0.5, u) - f * 1.7, 0, 0.1);
      c.foreR.rotation.set(-0.2 * f, 0, 0);
      c.armL.rotation.set(-0.2, 0, 1.15);
      z = lerp(0.62, 0.45, u);
    }
    c.shadow.visible = false;
    c.root.position.set(this.stanceX - 0.36, 0, z);
    // The ball in the right hand until it's let go.
    if (!this.rolling && (T < 0 || T > 3 || T < R)) {
      c.root.updateMatrixWorld(true);
      c.handR.getWorldPosition(this.hand);
      this.ball.visible = true;
      this.ball.position.set(this.hand.x, Math.max(BALL_R, this.hand.y - 0.07), this.hand.z - 0.04);
    } else if (!this.rolling) this.ball.visible = false;
  }

  /** Where the ball (and the bowler) are on screen (−1 … 1 each way), whether the guide shows, for tests. */
  onScreen() {
    this.poseBowler(performance.now());
    this.camera.updateMatrixWorld();
    const v = this.ball.position.clone().project(this.camera);
    const bowler = this.bowler?.root.visible ? screenBoxOf(this.bowler.root, this.camera) : null;
    return {
      ball: { x: v.x, y: v.y, visible: this.ball.visible },
      guide: this.guide.visible,
      bowler,
    };
  }

  /** The pins standing, the ball where you stand, and the guide down the oil. */
  rack(standing: readonly number[], x: number, guide: [number, number][], color: string) {
    this.pins.forEach((p, i) => {
      const up = standing.includes(i + 1);
      p.visible = up;
      p.position.set(PIN_SPOTS[i]![0], 0, -PIN_SPOTS[i]![1]);
      p.quaternion.identity();
    });
    this.ball.material = this.ballMats[color] ?? this.ballMats[MY_BALL]!;
    this.ball.visible = true;
    this.ball.position.set(x, BALL_R, 0.35);
    this.stanceX = x;
    this.rolling = false;
    if (this.bowler) this.bowler.root.visible = true;
    this.lastZ = 0;
    this.guide.visible = guide.length > 1;
    if (guide !== this.guideOf) {
      this.guideOf = guide;
      this.guide.geometry.dispose();
      this.guide.geometry = dashRibbon(guide);
    }
    this.idleCamera();
  }

  private axis = new THREE.Vector3();
  private q = new THREE.Quaternion();

  /** A recorded roll at `s` seconds: the ball rolling, the pins falling, the camera riding along. */
  show(sim: BowlSim, s: number) {
    const f = frameAt(sim.frames, s);
    if (!f) return;
    this.rolling = true;
    this.guide.visible = false;
    const b = f.ball;
    this.ball.visible = b.z < PIT_Z + 0.4;
    this.ball.position.set(b.x, b.gutter ? 0.0 : BALL_R, -b.z);
    // Rolling: a turn for every circumference travelled.
    this.spin += (b.z - this.lastZ) / BALL_R;
    this.lastZ = b.z;
    this.ball.rotation.set(-this.spin, 0, 0);
    for (const p of f.pins) {
      const g = this.pins[p.n - 1]!;
      const end = sim.pins.find((x) => x.n === p.n)!;
      g.visible = true;
      const tilt = p.down ? pinTilt(s - end.at) : 0;
      const gone = p.z > PIT_Z;
      g.position.set(p.x, gone ? -0.3 : Math.sin(tilt) * 0.06, -p.z);
      const dx = Math.sin(p.dir),
        dz = -Math.cos(p.dir);
      this.axis.set(dz, 0, -dx).normalize();
      this.q.setFromAxisAngle(this.axis, tilt);
      g.quaternion.copy(this.q);
    }
    // The ball's first moments from where the bowler stands (their follow-through in the
    // picture), then the camera behind the ball down the lane (the bowler out of its way),
    // holding at the pin deck.
    const watch = s < 0.4 && !!this.bowler;
    if (this.bowler) this.bowler.root.visible = watch;
    if (watch) {
      this.idleCamera();
      return;
    }
    const follow = Math.min(b.z, 14.2);
    this.camera.fov = 34 - Math.min(1, follow / 14) * 6;
    this.camera.position.set(b.x * 0.4, 1.05 - Math.min(1, follow / 14) * 0.35, -follow + 2.4);
    this.camera.lookAt(b.z < 14.2 ? b.x * 0.6 : 0, 0.15, -Math.max(b.z + 3, LANE_LEN));
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.poseBowler(performance.now());
    try {
      this.renderer.render(this.scene, this.camera);
    } catch {
      /* the context went away */
    }
  }

  /** A photo of the lane now. */
  snapshot(): HTMLCanvasElement {
    this.render();
    return this.renderer.domElement;
  }

  dispose() {
    this.guide.geometry.dispose();
    for (const b of this.bowlers.values()) disposeTree(b.root);
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}

/** The guide as flat dashes on the boards, just above them (./bowling-view.ts `dashQuads`). */
function dashRibbon(line: readonly (readonly [number, number])[]) {
  const pos: number[] = [];
  for (const [x, z] of dashQuads(line)) pos.push(x, 0.008, -z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

/** The masking unit over the pins: the alley's name in lights. */
function maskTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 102;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, '#3b0764');
  grad.addColorStop(0.5, '#1e1b4b');
  grad.addColorStop(1, '#3b0764');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 102);
  g.font = '800 42px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#f0abfc';
  g.shadowColor = '#e879f9';
  g.shadowBlur = 14;
  g.fillText('★ RUNWAY LANES ★', 256, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
