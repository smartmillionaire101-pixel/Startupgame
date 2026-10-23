/**
 * Ten-pin bowling on a phone (the more-games release): a real lane in 3D
 * (maple boards and the arrows, the gutters, ten pins on the deck, the
 * neighbouring lanes and the masking unit), seen from behind the foul line.
 * Swipe up from where you stand: the swipe's line is the ball's, faster is
 * harder, and a swipe that bows hooks the ball once it leaves the oil (or
 * set it with the sliders and Bowl). The engine rolls the ball and the pins
 * fall as it decided (`play.bowl`); every screen replays the same roll from
 * its launch, the camera riding behind the ball into the crash.
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
import { softwareGl, useQuality, webglAvailable } from '../three-kit/quality';
import {
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

const CALL_TEXT: Record<RollCall, string> = {
  strike: 'STRIKE!',
  spare: 'SPARE!',
  gutter: 'Gutter ball',
  split: 'Split!',
  pins: '{n} pins',
  miss: 'Missed them all',
};

export function callText(call: RollCall, n: number) {
  return call === 'pins' ? (n === 1 ? t('1 pin') : t('{n} pins', { n })) : t(CALL_TEXT[call]);
}

export default function Bowling({ room, me, live }: { room: Room; me: string; live: boolean }) {
  const { send, busy } = useView();
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
  const [now, setNow] = useState(() => Date.now());

  const mine = live && g.bowler === me;
  const ready = now >= g.readyAt - 200;
  const canAct = mine && !roll && ready && !busy;
  const up = g.bowler ? g.players[g.bowler] : undefined;
  const standing = useMemo(() => up?.standing ?? [...FULL_RACK], [up]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
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

  // A new ball: replay it from its launch (not the ones already rolled when we arrived).
  const last = g.last;
  useEffect(() => {
    const first = seen.current === null;
    if (seen.current === g.balls) return;
    seen.current = g.balls;
    if (first || !last) return;
    const sim = simulateBowl(last.standing, last.launch, true);
    const call = rollCall(last.standing, last.knocked, last.gutter);
    const text = callText(call, last.knocked.length);
    const good = (last.by === me) === (call === 'strike' || call === 'spare' || call === 'pins');
    if (reduceMotion()) {
      const id = requestAnimationFrame(() => setBanner({ text, good }));
      return () => cancelAnimationFrame(id);
    }
    sfx.roll(Math.max(0.5, sim.impact > 0 ? sim.impact * SLOW : 2));
    if (sim.impact > 0) sfx.pins(last.knocked.length, sim.impact * SLOW);
    const started = performance.now();
    const id = requestAnimationFrame(() => {
      setBanner(null);
      setRoll({ sim, n: g.balls, started });
    });
    const done = setTimeout(
      () => {
        setRoll(null);
        setBanner({ text, good });
      },
      Math.min(sim.time, 6) * SLOW * 1000 + 200,
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
        l.show(roll.sim, s);
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
    if (!canAct) return;
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
          onPointerCancel={() => {
            pts.current = [];
            setTrail([]);
          }}
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
export function BowlingSheet({ room, me }: { room: Room; me: string }) {
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
            <b className="bowling-total">{m.score}</b>
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
  private guide: THREE.Line;
  private spin = 0;
  private lastZ = 0;
  private disposables: { dispose(): void }[] = [];

  constructor(canvas: HTMLCanvasElement, soft: boolean) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !soft, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, soft ? 1 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const s = this.scene;
    s.background = new THREE.Color('#120d16');
    s.fog = new THREE.Fog('#120d16', 22, 40);
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
    const gl = own(new THREE.BufferGeometry());
    this.guide = new THREE.Line(
      gl,
      own(
        new THREE.LineDashedMaterial({
          color: '#ffffff',
          dashSize: 0.25,
          gapSize: 0.2,
          transparent: true,
          opacity: 0.75,
        }),
      ),
    );
    s.add(this.guide);
    this.idleCamera();
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private idleCamera() {
    this.camera.fov = 26;
    this.camera.position.set(0, 1.5, 2.6);
    this.camera.lookAt(0, 0, -15.5);
    this.camera.updateProjectionMatrix();
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
    this.lastZ = 0;
    const pts = guide.map(([gx, gz]) => new THREE.Vector3(gx, 0.006, -gz));
    this.guide.visible = pts.length > 1;
    this.guide.geometry.setFromPoints(pts);
    this.guide.computeLineDistances();
    this.idleCamera();
  }

  private axis = new THREE.Vector3();
  private q = new THREE.Quaternion();

  /** A recorded roll at `s` seconds: the ball rolling, the pins falling, the camera riding along. */
  show(sim: BowlSim, s: number) {
    const f = frameAt(sim.frames, s);
    if (!f) return;
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
    // The camera: behind the ball down the lane, then holding at the pin deck.
    const follow = Math.min(b.z, 14.2);
    this.camera.fov = 34 - Math.min(1, follow / 14) * 6;
    this.camera.position.set(b.x * 0.4, 1.05 - Math.min(1, follow / 14) * 0.35, -follow + 2.4);
    this.camera.lookAt(b.z < 14.2 ? b.x * 0.6 : 0, 0.15, -Math.max(b.z + 3, LANE_LEN));
    this.camera.updateProjectionMatrix();
  }

  render() {
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
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
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
