/**
 * The penalty shootout from behind the spot: the goal, its net and the
 * keeper 11 metres away under the stadium lights. Swipe to shoot (where you
 * let go is where it's going, faster is harder, a bowed swipe curls it);
 * in goal, pick your dive. Each kick plays out as the server decided it:
 * saves, the woodwork, the net bulging, the crowd.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GOAL_H,
  GOAL_HALF,
  FOOTBALL_R,
  SPOT,
  laneOf,
  type PlayerView,
  type Penalty,
  type KickOutcome,
} from '@runway/engine';
import { useView } from '../store';
import { t } from '../i18n';
import { softwareGl, useQuality } from '../three-kit/quality';
import {
  ballAt,
  camera,
  diveZones,
  keeperPose,
  project,
  shootoutCard,
  swipeToKick,
  type Camera,
  type SwipePoint,
} from './shootout-view';
import { reduceMotion, sfx } from './sfx';

type Room = PlayerView['playRooms'][number];

/** Slow motion: the flight (≈0.4 s for real) is shown over this long. */
const FLIGHT_MS = 1100;
const AFTER_MS = 1300;

const DIVE_LABELS = [
  'Dive top left',
  'Dive top right',
  'Stay in the middle',
  'Dive bottom left',
  'Dive bottom right',
];

function outcomeText(o: KickOutcome | undefined, goal: boolean) {
  switch (o) {
    case 'goal':
      return t('GOAL!');
    case 'post-in':
      return t('GOAL! In off the post.');
    case 'bar-in':
      return t('GOAL! In off the bar.');
    case 'saved':
      return t('SAVED!');
    case 'post':
      return t('Off the post!');
    case 'bar':
      return t('Off the crossbar!');
    case 'wide':
      return t('Wide!');
    case 'over':
      return t('Over the bar!');
    case 'none':
      return t('No shot: out of time.');
    default:
      return goal ? t('GOAL!') : t('SAVED!');
  }
}

export function Shootout({ room, me, live }: { room: Room; me: string; live: boolean }) {
  const { send, busy } = useView();
  const quality = useQuality();
  const hq = quality === '3d' && !softwareGl();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 358, h: 420 });
  const cam = useMemo(() => camera(size.w, size.h), [size]);
  const [anim, setAnim] = useState<{ p: Penalty; ms: number } | null>(null);
  const [banner, setBanner] = useState<{ text: string; good: boolean } | null>(null);
  const [trail, setTrail] = useState<SwipePoint[]>([]);
  const [hint, setHint] = useState('');
  const pts = useRef<SwipePoint[]>([]);
  const seen = useRef<number | null>(null);
  const shooting = room.shooter === me;
  const locked = room.myMove !== null;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const w = Math.min(el.clientWidth || 358, 520);
      setSize({ w, h: Math.round(Math.min(w * 0.98, window.innerHeight * 0.56)) });
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  // Play each new kick out (not the ones already taken when we arrived).
  const count = room.penalties.length;
  // The kicks this pitch has shown (a newer one is about to play out).
  const [shown, setShown] = useState(count);
  const playing = !!anim || shown < count;
  const canAct = live && !playing && !locked && !busy;
  useEffect(() => {
    const first = seen.current === null;
    if (seen.current === count) return;
    seen.current = count;
    const p = room.penalties[count - 1];
    if (first || !p) {
      const id = requestAnimationFrame(() => setShown(count));
      return () => cancelAnimationFrame(id);
    }
    const good = p.goal === (p.shooter === me);
    const text = outcomeText(p.outcome, p.goal);
    if (reduceMotion() || !p.end) {
      const id = requestAnimationFrame(() => {
        setBanner({ text, good });
        setShown(count);
      });
      return () => cancelAnimationFrame(id);
    }
    sfx.kick(p.kick?.power ?? 0.6);
    const start = performance.now();
    let raf = 0;
    let hit = false;
    let started = false;
    const step = () => {
      const ms = performance.now() - start;
      if (!started) {
        started = true;
        setBanner(null);
      }
      if (!hit && ms >= FLIGHT_MS) {
        hit = true;
        setBanner({ text, good });
        if (p.outcome === 'saved') sfx.glove();
        else if (p.outcome === 'post' || p.outcome === 'bar') sfx.post();
        else if (p.goal) sfx.net();
        if (p.outcome === 'post-in' || p.outcome === 'bar-in') sfx.post();
        sfx.crowd(p.goal, 0.05);
      }
      setAnim({ p, ms });
      if (ms < FLIGHT_MS + AFTER_MS) raf = requestAnimationFrame(step);
      else {
        setAnim(null);
        setShown(count);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new kick starts an animation
  }, [count]);
  useEffect(() => {
    if (!banner || playing) return;
    const id = setTimeout(() => setBanner(null), 2600);
    return () => clearTimeout(id);
  }, [banner, playing]);

  // What to draw: the kick being played out, or the last one's end (reduced motion), or the ready state.
  const scene = useMemo(() => {
    const p = anim?.p;
    if (p && p.end) {
      const s = anim.ms <= FLIGHT_MS ? anim.ms / FLIGHT_MS : 1 + (anim.ms - FLIGHT_MS) / AFTER_MS;
      const realT = (Math.min(anim.ms, FLIGHT_MS + AFTER_MS) / FLIGHT_MS) * (p.time ?? 0.45);
      return {
        ball: ballAt(p.end, p.kick?.curve ?? 0, p.kick?.power ?? 0.6, p.outcome ?? 'goal', s),
        dive: p.keeper,
        kt: realT,
        bulge: p.goal && s > 1 ? Math.min(1, (s - 1) * 3) * (1 - Math.max(0, s - 1.6)) : 0,
        end: p.end,
      };
    }
    return { ball: { x: 0, y: FOOTBALL_R, z: SPOT }, dive: -1, kt: 0, bulge: 0, end: null };
  }, [anim]);

  const backdrop = useMemo(() => drawBackdrop(cam, hq), [cam, hq]);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, hq ? 2.5 : 1.5);
    const W = Math.round(cam.width * dpr),
      H = Math.round(cam.height * dpr);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (backdrop) g.drawImage(backdrop, 0, 0, cam.width, cam.height);
    drawNet(g, cam, scene.end, scene.bulge);
    const ballBehind = scene.ball.z < 0.35;
    if (ballBehind) drawBall(g, cam, scene.ball, hq);
    drawKeeper(g, cam, scene.dive, scene.kt);
    drawFrame(g, cam);
    if (!ballBehind) drawBall(g, cam, scene.ball, hq);
    if (trail.length > 1) {
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      trail.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
    }
  }, [cam, backdrop, scene, trail, hq]);

  const point = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!shooting || !canAct) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pts.current = [point(e)];
    setTrail(pts.current);
    setHint('');
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pts.current.length) return;
    pts.current = [...pts.current, point(e)].slice(-60);
    setTrail(pts.current);
  };
  const onUp = () => {
    const swipe = pts.current;
    pts.current = [];
    setTrail([]);
    if (!shooting || !canAct || swipe.length < 2) return;
    const kick = swipeToKick(cam, swipe);
    if (!kick) {
      setHint(t('Swipe up towards the goal to shoot.'));
      return;
    }
    void send({
      type: 'play.penalty',
      roomId: room.id,
      round: room.round,
      lane: laneOf(kick.x, kick.y),
      kick,
    });
  };

  const card = shootoutCard(room.penalties.map((p) => p.goal));
  const [a, b] = room.members;
  const nameOf = (id?: string) =>
    id === me ? t('You') : (room.members.find((m) => m.id === id)?.name ?? '');
  const shooterName = nameOf(room.shooter);
  const keeperName = nameOf(room.members.find((m) => m.id !== room.shooter)?.id);
  const prompt = !live
    ? ''
    : playing
      ? ''
      : shooting
        ? locked
          ? t('Shot taken. {name} is in goal…', { name: keeperName })
          : t(
              'Your penalty. Swipe from the ball: let go where you want it, faster is harder, bend the swipe to curl it.',
            )
        : locked
          ? t('Dive picked. {name} steps up…', { name: shooterName })
          : t('You are in goal. Tap where you will dive.');

  return (
    <div className="shootout">
      <div className="shootout-card" aria-label={t('Shootout score')}>
        {[a, b].map((m, i) =>
          m ? (
            <div key={m.id} className={room.shooter === m.id && live ? 'up' : ''}>
              <strong>{nameOf(m.id)}</strong>
              <span className="kicks">
                {Array.from({ length: Math.max(5, (i ? card.b : card.a).length) }, (_, k) => {
                  const g = (i ? card.b : card.a)[k];
                  return (
                    <i
                      key={k}
                      className={g === undefined ? '' : g ? 'goal' : 'miss'}
                      aria-label={g === undefined ? t('To take') : g ? t('Goal') : t('Missed')}
                    />
                  );
                })}
              </span>
              <b>{m.score}</b>
            </div>
          ) : null,
        )}
        {card.suddenDeath && live && <small className="sudden">{t('Sudden death')}</small>}
      </div>
      <p className="shootout-prompt" role="status">
        {hint || prompt}
      </p>
      <div className="shootout-pitch" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          style={{ width: cam.width, height: cam.height }}
          role="img"
          aria-label={t('The goal and the keeper, from the penalty spot')}
          data-ball={(() => {
            const p = project(cam, 0, FOOTBALL_R, SPOT);
            return `${Math.round(p.x)},${Math.round(p.y)}`;
          })()}
          data-goal={(() => {
            const l = project(cam, -GOAL_HALF, GOAL_H, 0),
              r = project(cam, GOAL_HALF, 0, 0);
            return [l.x, l.y, r.x, r.y].map(Math.round).join(',');
          })()}
          data-playing={playing ? '1' : '0'}
          data-turn={canAct ? (shooting ? 'shoot' : 'dive') : 'wait'}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => {
            pts.current = [];
            setTrail([]);
          }}
        />
        {!shooting && canAct && (
          <div className="shootout-dives">
            {diveZones(cam).map((z) => (
              <button
                key={z.lane}
                type="button"
                style={{ left: z.x, top: z.y, width: z.w, height: z.h }}
                aria-label={t(DIVE_LABELS[z.lane]!)}
                onClick={() =>
                  void send({
                    type: 'play.penalty',
                    roomId: room.id,
                    round: room.round,
                    lane: z.lane,
                  })
                }
              />
            ))}
          </div>
        )}
        {banner && (
          <div className={`shootout-banner ${banner.good ? 'good' : 'bad'}`} role="status">
            {banner.text}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Drawing

/** The stadium, the boards and the pitch with its markings (drawn once per size). */
function drawBackdrop(c: Camera, hq: boolean): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const k = hq ? 2 : 1.25;
  const cv = document.createElement('canvas');
  cv.width = Math.round(c.width * k);
  cv.height = Math.round(c.height * k);
  const g = cv.getContext('2d');
  if (!g) return null;
  g.scale(k, k);
  const W = c.width,
    H = c.height;
  // Night sky and the stand.
  const sky = g.createLinearGradient(0, 0, 0, c.horizon);
  sky.addColorStop(0, '#0b1426');
  sky.addColorStop(1, '#1b2a44');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const boardTop = project(c, 0, 1.0, -7).y;
  const standTop = project(c, 0, 9, -14).y;
  g.fillStyle = '#16202f';
  g.fillRect(0, standTop, W, boardTop - standTop);
  // The crowd: rows of heads in club colours.
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const shirts = ['#d33', '#e8e8e8', '#2b6fd6', '#f2c230', '#2a2a2a', '#c94d8a'];
  const rows = hq ? 14 : 8;
  for (let r = 0; r < rows; r++) {
    const y = standTop + ((boardTop - standTop) * (r + 0.5)) / rows;
    const step = hq ? 5 : 8;
    for (let x = rnd() * step; x < W; x += step * (0.8 + rnd() * 0.5)) {
      g.fillStyle = shirts[Math.floor(rnd() * shirts.length)]!;
      g.globalAlpha = 0.45 + rnd() * 0.4;
      g.fillRect(x, y, step * 0.7, ((boardTop - standTop) / rows) * 0.7);
    }
  }
  g.globalAlpha = 1;
  // Floodlight glow.
  if (hq)
    for (const fx of [0.08, 0.92]) {
      const glow = g.createRadialGradient(W * fx, 8, 2, W * fx, 8, W * 0.5);
      glow.addColorStop(0, 'rgba(255,250,220,0.55)');
      glow.addColorStop(1, 'rgba(255,250,220,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
    }
  // Advertising boards.
  const bl = project(c, -40, 1.0, -7),
    br = project(c, 40, 0, -7);
  g.fillStyle = '#0e4c8a';
  g.fillRect(0, bl.y, W, br.y - bl.y);
  g.fillStyle = '#ffffff';
  g.font = `800 ${Math.max(8, (br.y - bl.y) * 0.62)}px system-ui, sans-serif`;
  g.textBaseline = 'middle';
  for (let x = -W; x < W * 2; x += W * 0.42) g.fillText('RUNWAY', x, (bl.y + br.y) / 2);
  // Grass in mown stripes.
  for (let z = -7, i = 0; z < SPOT + 4.5; z += 2, i++) {
    const a = project(c, -60, 0, z),
      b = project(c, -60, 0, z + 2);
    g.fillStyle = i % 2 ? '#2f8a3a' : '#38994a';
    g.fillRect(0, a.y, W, b.y - a.y + 1);
  }
  // Pitch markings.
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  const line = (pts: [number, number][]) => {
    g.beginPath();
    pts.forEach(([x, z], i) => {
      const p = project(c, x, 0, z);
      g.lineWidth = Math.max(1, 0.12 * p.k);
      if (i) g.lineTo(p.x, p.y);
      else g.moveTo(p.x, p.y);
    });
    g.stroke();
  };
  line([
    [-40, 0],
    [40, 0],
  ]);
  line([
    [-9.16, 0],
    [-9.16, 5.5],
    [9.16, 5.5],
    [9.16, 0],
  ]);
  line([
    [-20.16, 0],
    [-20.16, 16.5],
    [20.16, 16.5],
    [20.16, 0],
  ]);
  // The penalty spot.
  const spot = project(c, 0, 0, SPOT);
  g.fillStyle = '#fff';
  g.beginPath();
  g.ellipse(spot.x, spot.y, 0.09 * spot.k, 0.03 * spot.k, 0, 0, Math.PI * 2);
  g.fill();
  // Vignette.
  const v = g.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.45, H * 0.9);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  return cv;
}

/** The net: its back and sides, bulging where a goal hits it. */
function drawNet(
  g: CanvasRenderingContext2D,
  c: Camera,
  hit: { x: number; y: number } | null,
  bulge: number,
) {
  const depthAt = (y: number) => -2 + (y / GOAL_H) * 1.0; // 2 m deep at the ground, 1 m at the top
  const pushed = (x: number, y: number, z: number) => {
    if (!hit || !bulge) return project(c, x, y, z);
    const d = Math.hypot(x - hit.x, y - hit.y);
    const push = bulge * 0.7 * Math.exp(-(d * d) / 0.6);
    return project(c, x, y, z - push);
  };
  g.strokeStyle = 'rgba(255,255,255,0.38)';
  g.lineWidth = 0.7;
  g.beginPath();
  // Back: lines across and up.
  for (let y = 0; y <= GOAL_H + 0.001; y += 0.22) {
    for (let x = -GOAL_HALF; x <= GOAL_HALF + 0.001; x += 0.22) {
      const p = pushed(x, y, depthAt(y));
      if (x === -GOAL_HALF) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
  }
  for (let x = -GOAL_HALF; x <= GOAL_HALF + 0.001; x += 0.22) {
    for (let y = 0; y <= GOAL_H + 0.001; y += 0.22) {
      const p = pushed(x, y, depthAt(y));
      if (y === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
  }
  // Roof and sides.
  for (let x = -GOAL_HALF; x <= GOAL_HALF + 0.001; x += 0.3) {
    const a = project(c, x, GOAL_H, 0),
      b = project(c, x, GOAL_H, depthAt(GOAL_H));
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
  }
  for (const sx of [-GOAL_HALF, GOAL_HALF])
    for (let y = 0; y <= GOAL_H + 0.001; y += 0.25) {
      const a = project(c, sx, y, 0),
        b = project(c, sx, y, depthAt(y));
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
  g.stroke();
}

/** Posts and crossbar (in front of the net and keeper). */
function drawFrame(g: CanvasRenderingContext2D, c: Camera) {
  const tl = project(c, -GOAL_HALF, GOAL_H, 0),
    tr = project(c, GOAL_HALF, GOAL_H, 0);
  const bl = project(c, -GOAL_HALF, 0, 0),
    br = project(c, GOAL_HALF, 0, 0);
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 0.12 * tl.k + 2;
  g.beginPath();
  g.moveTo(bl.x + 1, bl.y);
  g.lineTo(tl.x + 1, tl.y + 1);
  g.lineTo(tr.x + 1, tr.y + 1);
  g.lineTo(br.x + 1, br.y);
  g.stroke();
  g.strokeStyle = '#f7f7f2';
  g.lineWidth = 0.12 * tl.k;
  g.beginPath();
  g.moveTo(bl.x, bl.y);
  g.lineTo(tl.x, tl.y);
  g.lineTo(tr.x, tr.y);
  g.lineTo(br.x, br.y);
  g.stroke();
}

function drawBall(
  g: CanvasRenderingContext2D,
  c: Camera,
  b: { x: number; y: number; z: number },
  hq: boolean,
) {
  const sh = project(c, b.x, 0, b.z);
  const p = project(c, b.x, b.y, b.z);
  const r = FOOTBALL_R * p.k;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(sh.x, sh.y, r * 1.1, r * 0.35, 0, 0, Math.PI * 2);
  g.fill();
  const shade = g.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
  shade.addColorStop(0, '#ffffff');
  shade.addColorStop(0.7, '#e4e4e4');
  shade.addColorStop(1, '#9a9a9a');
  g.fillStyle = shade;
  g.beginPath();
  g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.fill();
  if (r > 3) {
    // Panels, turning as it flies.
    const spin = (SPOT - b.z) * 2.2;
    g.fillStyle = '#1d1d1d';
    for (let i = 0; i < (hq ? 5 : 3); i++) {
      const a = spin + (i * Math.PI * 2) / 5;
      const px = p.x + Math.cos(a) * r * 0.55,
        py = p.y + Math.sin(a) * r * 0.45;
      g.beginPath();
      for (let j = 0; j < 5; j++) {
        const q = a + (j * Math.PI * 2) / 5;
        const qx = px + Math.cos(q) * r * 0.2,
          qy = py + Math.sin(q) * r * 0.2;
        if (j) g.lineTo(qx, qy);
        else g.moveTo(qx, qy);
      }
      g.closePath();
      g.fill();
    }
  }
}

/** The keeper: a full figure that springs and stretches towards their dive. */
function drawKeeper(g: CanvasRenderingContext2D, c: Camera, lane: number, t: number) {
  const pose = keeperPose(lane, t);
  const f = Math.max(0, Math.min(1, (t - 0.06) / 0.62));
  const e = lane < 0 ? 0 : 1 - (1 - f) * (1 - f);
  const up = lane === 2 || lane < 0 ? 0 : e;
  const tilt = lane === 2 ? 0 : pose.tilt * e;
  const reachUp = 2.15;
  const stand = { x: 0, y: 0.95 };
  const diveHip = {
    x: pose.hands.x - (reachUp - 0.95) * Math.sin(tilt),
    y: pose.hands.y - (reachUp - 0.95) * Math.cos(tilt),
  };
  const hip = {
    x: stand.x + (diveHip.x - stand.x) * up,
    y: Math.max(0.12, stand.y + (diveHip.y - stand.y) * up),
  };
  // A crouch in the middle.
  if (lane === 2) hip.y = 0.95 - 0.2 * e;
  const Z = 0.35;
  const cos = Math.cos(tilt),
    sin = Math.sin(tilt);
  const W = (lx: number, ly: number) =>
    project(c, hip.x + lx * cos + (ly - 0.95) * sin, hip.y - lx * sin + (ly - 0.95) * cos, Z);
  const limb = (pts: [number, number][], width: number, colour: string) => {
    g.strokeStyle = colour;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const p = W(x, y);
      g.lineWidth = width * p.k;
      if (i) g.lineTo(p.x, p.y);
      else g.moveTo(p.x, p.y);
    });
    g.stroke();
  };
  // Arms: out at the sides when set, both up and together at full stretch.
  const hand = (side: number): [number, number] => [
    side * (0.55 * (1 - up) + 0.08 * up),
    1.2 * (1 - up) + reachUp * up,
  ];
  const elbow = (side: number): [number, number] => [
    side * (0.42 * (1 - up) + 0.12 * up),
    1.32 * (1 - up) + 1.8 * up,
  ];
  const kneeBend = lane === 2 ? 0.1 + 0.1 * e : 0.05;
  const shadow = project(c, hip.x, 0, Z);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath();
  g.ellipse(shadow.x, shadow.y, 0.6 * shadow.k, 0.12 * shadow.k, 0, 0, Math.PI * 2);
  g.fill();
  // Legs (socks and boots), shorts, shirt, arms, gloves, head.
  limb(
    [
      [-0.13, 0.95],
      [-0.2 - kneeBend, 0.5],
      [-0.22, 0.05],
    ],
    0.15,
    '#1d1d1d',
  );
  limb(
    [
      [0.13, 0.95],
      [0.2 + kneeBend, 0.5],
      [0.22, 0.05],
    ],
    0.15,
    '#1d1d1d',
  );
  limb(
    [
      [-0.2, 0.42],
      [-0.22, 0.08],
    ],
    0.13,
    '#f0f0f0',
  );
  limb(
    [
      [0.2, 0.42],
      [0.22, 0.08],
    ],
    0.13,
    '#f0f0f0',
  );
  limb(
    [
      [-0.12, 0.98],
      [0.12, 0.98],
    ],
    0.26,
    '#1d1d1d',
  );
  limb(
    [
      [0, 1.05],
      [0, 1.48],
    ],
    0.4,
    '#c6f432',
  );
  for (const side of [-1, 1]) {
    limb([[side * 0.2, 1.45], elbow(side), hand(side)], 0.11, '#c6f432');
    const h = W(...hand(side));
    g.fillStyle = '#f5f5f5';
    g.beginPath();
    g.arc(h.x, h.y, 0.09 * h.k, 0, Math.PI * 2);
    g.fill();
  }
  const head = W(0, 1.7);
  g.fillStyle = '#7a4b2f';
  g.beginPath();
  g.arc(head.x, head.y, 0.12 * head.k, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1a1210';
  g.beginPath();
  g.arc(head.x, head.y - 0.03 * head.k, 0.12 * head.k, Math.PI, Math.PI * 2);
  g.fill();
}
