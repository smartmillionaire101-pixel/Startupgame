/**
 * 8-ball pool, top down on the phone: a 9-foot table with its cushions,
 * pockets and sights, numbered solids and stripes, the cue you pull back to
 * strike, an aiming line with a ghost ball, spin, ball in hand, and every
 * shot replayed from the server's own physics.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  POOL_CORNER,
  POOL_FOOT,
  POOL_H,
  POOL_HEAD,
  POOL_HEAD_X,
  POOL_R,
  POOL_SIDE,
  POOL_W,
  poolAim,
  type PlayerView,
  type PoolBall,
  type PoolShotLog,
} from '@runway/engine';
import { useView } from '../store';
import { t } from '../i18n';
import { softwareGl, useQuality } from '../three-kit/quality';
import {
  LONG_SIGHTS,
  RAIL,
  SHORT_SIGHTS,
  aimAt,
  ballColour,
  frameAt,
  isStripe,
  onCue,
  poolReplay,
  pullPower,
  screenDir,
  spinFromPad,
  tableLayout,
  toScreen,
  toTable,
  type PoolFrame,
  type TableLayout,
} from './pool-view';
import { reduceMotion, sfx } from './sfx';

type Room = PlayerView['playRooms'][number];
type Mode = 'aim' | 'pull' | 'place' | null;

const wrap = (a: number) => (a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a);

export function PoolGame({
  room,
  me,
  live,
  serverNow,
}: {
  room: Room;
  me: string;
  live: boolean;
  serverNow: () => number;
}) {
  const { send, busy } = useView();
  const pool = room.pool!;
  const mine = live && room.turn === me;
  const quality = useQuality();
  const hq = quality === '3d' && !softwareGl();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layout, setLayout] = useState<TableLayout>(() => tableLayout(358, 600));
  const [angle, setAngle] = useState(() => {
    const c = room.balls.find((b) => b.id === 0)!;
    const on = room.balls.find((b) => b.id === pool.targets[0] && !b.potted);
    return on ? aimAt(c, on.x, on.y) : 0;
  });
  const [power, setPower] = useState(0);
  // The pull as the finger last left it (events can outrun renders on a slow phone).
  const pulled = useRef(0);
  const [lastPower, setLastPower] = useState(55);
  const [spin, setSpin] = useState({ spin: 0, side: 0 });
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null);
  const [anim, setAnim] = useState<{ n: number; frames: PoolFrame[] } | null>(null);
  const [frame, setFrame] = useState<PoolFrame | null>(null);
  const mode = useRef<Mode>(null);
  const pullFrom = useRef({ x: 0, y: 0 });
  const seen = useRef<number | null>(null);
  const names = (id: string | undefined) =>
    id === me ? t('You') : (room.members.find((m) => m.id === id)?.name ?? '');

  // Fit the table to the screen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const w = Math.min(el.clientWidth || 358, 460);
      const h = Math.max(380, Math.min(window.innerHeight * 0.66, 760));
      setLayout(tableLayout(w, h));
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    window.addEventListener('resize', fit);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);

  // Replay each new shot from the logged stroke (not the one already on the table when we arrived).
  const last = pool.last;
  // The last shot this table has shown (until then, the balls are still rolling here).
  const [shownN, setShownN] = useState(last?.n ?? 0);
  useEffect(() => {
    if (!last) return;
    const first = seen.current === null;
    if (seen.current === last.n) return;
    seen.current = last.n;
    const replay =
      (first && serverNow() > pool.readyAt + 300) || !last.before || reduceMotion()
        ? null
        : poolReplay(last);
    if (!replay?.frames.length) {
      const id = requestAnimationFrame(() => setShownN(last.n));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    let raf = 0;
    let ev = 0;
    sfx.cue(Math.min(100, Math.hypot(last.vx ?? 0, last.vy ?? 0) / 9));
    const step = () => {
      const tt = (performance.now() - start) / 1000;
      if (ev === 0) setAnim({ n: last.n, frames: replay.frames });
      while (ev < replay.events.length && replay.events[ev]!.t <= tt) {
        const e = replay.events[ev++]!;
        if (e.kind === 'ball') sfx.click(e.speed);
        else if (e.kind === 'rail') sfx.cushion(e.speed);
        else sfx.pocket();
      }
      const f = frameAt(replay.frames, tt);
      setFrame(f);
      if (tt < replay.frames[replay.frames.length - 1]!.t) raf = requestAnimationFrame(step);
      else {
        setAnim(null);
        setFrame(null);
        setShownN(last.n);
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      setAnim(null);
      setFrame(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new shot (its number) starts a replay
  }, [last?.n]);

  const rolling = !!anim || (!!last && last.n !== shownN);
  const inHand = mine && !rolling ? pool.inHand : null;
  const cueBall = room.balls.find((b) => b.id === 0)!;
  const cue = useMemo(
    () => (inHand && place ? { ...cueBall, ...place } : cueBall),
    [inHand, place, cueBall],
  );
  // A new turn: aim at the first ball on, ball in hand starts where the cue ball is.
  const turnKey = `${room.round}:${room.turn}`;
  const [turnSeen, setTurnSeen] = useState(turnKey);
  if (turnSeen !== turnKey) {
    setTurnSeen(turnKey);
    setPlace(null);
    setPower(0);
    const on = room.balls.find((b) => b.id === pool.targets[0] && !b.potted);
    if (on) setAngle(aimAt(cueBall, on.x, on.y));
  }

  const balls: readonly PoolBall[] = frame?.balls ?? room.balls.map((b) => (b.id === 0 ? cue : b));
  const guide = useMemo(
    () => (mine && !rolling ? poolAim(balls, angle, cue.x, cue.y) : null),
    [mine, rolling, balls, angle, cue.x, cue.y],
  );

  const staticTable = useMemo(() => drawTable(layout, hq), [layout, hq]);

  // Paint.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, hq ? 2.5 : 1.5);
    const w = Math.round(layout.width * dpr),
      h = Math.round(layout.height * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, layout.width, layout.height);
    if (staticTable) g.drawImage(staticTable, 0, 0, layout.width, layout.height);
    if (inHand === 'kitchen') {
      const [x0, y0] = toScreen(layout, POOL_HEAD_X, 0);
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(x0, y0, POOL_H * layout.scale, POOL_HEAD_X * layout.scale);
    }
    if (guide && mine && !rolling) drawGuide(g, layout, cue, guide, pool.targets);
    for (const b of balls) if (!b.potted) drawBall(g, layout, b, hq);
    if (inHand) {
      const [sx, sy] = toScreen(layout, cue.x, cue.y);
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.setLineDash([3, 3]);
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(sx, sy, POOL_R * layout.scale * 2.2, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    if (mine && !rolling) drawCue(g, layout, cue, angle, power);
  }, [
    layout,
    staticTable,
    balls,
    guide,
    mine,
    rolling,
    cue,
    angle,
    power,
    inHand,
    hq,
    pool.targets,
  ]);

  const point = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const strike = useCallback(
    (p: number) => {
      if (!mine || busy || rolling) return;
      const pw = Math.max(5, Math.min(100, Math.round(p)));
      setLastPower(pw);
      sfx.cue(pw);
      void send({
        type: 'play.shot',
        roomId: room.id,
        round: room.round,
        angle: wrap(angle),
        power: pw,
        ...(spin.spin ? { spin: spin.spin } : {}),
        ...(spin.side ? { side: spin.side } : {}),
        ...(pool.inHand ? { cueX: cue.x, cueY: cue.y } : {}),
      });
      setPower(0);
    },
    [mine, busy, rolling, send, room.id, room.round, angle, spin, pool.inHand, cue.x, cue.y],
  );
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!mine || rolling || busy) return;
    const p = point(e);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const [tx, ty] = toTable(layout, p.x, p.y);
    const [cx, cy] = toScreen(layout, cue.x, cue.y);
    if (inHand && Math.hypot(p.x - cx, p.y - cy) < Math.max(16, POOL_R * layout.scale * 2)) {
      mode.current = 'place';
    } else if (onCue(layout, cue, angle, p.x, p.y)) {
      mode.current = 'pull';
      pullFrom.current = p;
      pulled.current = 0;
      setPower(0);
    } else {
      mode.current = 'aim';
      setAngle(aimAt(cue, tx, ty));
    }
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!mode.current) return;
    const p = point(e);
    const [tx, ty] = toTable(layout, p.x, p.y);
    if (mode.current === 'place') {
      const maxX = pool.inHand === 'kitchen' ? POOL_HEAD_X : POOL_W - POOL_R;
      setPlace({
        x: Math.max(POOL_R, Math.min(maxX, tx)),
        y: Math.max(POOL_R, Math.min(POOL_H - POOL_R, ty)),
      });
    } else if (mode.current === 'pull') {
      pulled.current = pullPower(angle, pullFrom.current, p);
      setPower(pulled.current);
    } else setAngle(aimAt(cue, tx, ty));
  };
  const onUp = () => {
    const m = mode.current;
    mode.current = null;
    if (m === 'pull') {
      if (pulled.current >= 3) strike(pulled.current);
      else {
        // A tap on the stick (no pull) aims there instead.
        setPower(0);
        const [tx, ty] = toTable(layout, pullFrom.current.x, pullFrom.current.y);
        if (Math.hypot(tx - cue.x, ty - cue.y) > POOL_R * 2) setAngle(aimAt(cue, tx, ty));
      }
      pulled.current = 0;
    }
  };

  const shown = power || 0;
  const myGroup = pool.groups[me];
  // The referee speaks in names (never "You breaks").
  const called = (id: string | undefined) => room.members.find((m) => m.id === id)?.name ?? '';
  const call = last ? callText(last, called, room) : '';
  const onEight = mine && pool.targets.length === 1 && pool.targets[0] === 8 && pool.broken;
  const hint = !live
    ? ''
    : !mine
      ? room.turn && room.ai.includes(room.turn)
        ? t('The AI player is lining up its shot…')
        : t('{name} is at the table.', { name: names(room.turn) })
      : rolling
        ? ''
        : inHand === 'kitchen'
          ? t('Ball in hand: drag the cue ball behind the line, then break.')
          : inHand
            ? t('Ball in hand: drag the cue ball anywhere, then shoot.')
            : onEight
              ? t('Pot the 8 to win the frame.')
              : !myGroup
                ? t('Open table: pot any ball but the 8.')
                : myGroup === 'solids'
                  ? t('You are solids (1–7).')
                  : t('You are stripes (9–15).');

  return (
    <div className="pool">
      <div className="pool-hud">
        {room.members.map((m) => {
          const g = pool.groups[m.id];
          const ids =
            g === 'solids'
              ? [1, 2, 3, 4, 5, 6, 7]
              : g === 'stripes'
                ? [9, 10, 11, 12, 13, 14, 15]
                : [];
          return (
            <div key={m.id} className={`pool-player ${room.turn === m.id ? 'at-table' : ''}`}>
              <strong>{m.id === me ? t('You') : m.name}</strong>
              <small>
                {g === 'solids' ? t('Solids') : g === 'stripes' ? t('Stripes') : t('Open table')}
              </small>
              <span className="pool-rack" aria-hidden="true">
                {ids.map((id) => {
                  const down = room.balls.find((b) => b.id === id)?.potted;
                  return (
                    <i
                      key={id}
                      className={`${isStripe(id) ? 'stripe' : ''} ${down ? 'down' : ''}`}
                      style={{ '--ball': ballColour(id) } as React.CSSProperties}
                    />
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
      <div
        className="pool-power"
        role="meter"
        aria-label={t('Shot power')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(shown)}
      >
        <span style={{ width: `${shown}%` }} />
        <b>{t('Power {n}%', { n: Math.round(shown || lastPower) })}</b>
      </div>
      <p className="pool-hint" role="status">
        {rolling ? call || t('Balls rolling…') : hint}
      </p>
      <div className="pool-table" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          style={{ width: layout.width, height: layout.height }}
          role="img"
          aria-label={t('Pool table: drag to aim, pull the cue back and let go to shoot')}
          data-cue={toScreen(layout, cue.x, cue.y).map(Math.round).join(',')}
          data-angle={angle.toFixed(4)}
          data-rolling={rolling ? '1' : '0'}
          data-mine={mine && !rolling ? '1' : '0'}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => {
            mode.current = null;
            setPower(0);
          }}
        />
      </div>
      {!rolling && last && <p className="pool-call">{call}</p>}
      {mine && (
        <div className="pool-controls">
          <button
            type="button"
            aria-label={t('Aim left')}
            disabled={rolling}
            onClick={() => setAngle((a) => wrap(a - 0.005))}
          >
            ◀
          </button>
          <button
            type="button"
            aria-label={t('Aim right')}
            disabled={rolling}
            onClick={() => setAngle((a) => wrap(a + 0.005))}
          >
            ▶
          </button>
          <button
            type="button"
            className="pool-spin"
            aria-label={t('Spin: tap where to strike the cue ball')}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const px = ((e.clientX - r.left) / r.width) * 2 - 1;
              const py = ((e.clientY - r.top) / r.height) * 2 - 1;
              setSpin(e.clientX || e.clientY ? spinFromPad(px, py) : { spin: 0, side: 0 });
            }}
          >
            <i style={{ left: `${50 + spin.side * 36}%`, top: `${50 - spin.spin * 36}%` }} />
          </button>
          <label className="pool-slider">
            {t('Power')}
            <input
              type="range"
              min="5"
              max="100"
              value={lastPower}
              onChange={(e) => setLastPower(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="experience-primary"
            disabled={busy || rolling}
            onClick={() => strike(lastPower)}
          >
            {t('Shoot')}
          </button>
        </div>
      )}
    </div>
  );
}

/** What the last shot did, in words. */
function callText(last: PoolShotLog, names: (id: string | undefined) => string, room: Room) {
  const by = names(last.by);
  const next = names(room.members.find((m) => m.id !== last.by)?.id);
  switch (last.call) {
    case 'break':
      return last.pots.length
        ? t('{name} breaks and pots.', { name: by })
        : t('{name} breaks.', { name: by });
    case 'pot':
      return t('{name} pots and plays on.', { name: by });
    case 'groups':
      return t('{name} takes {group} and plays on.', {
        name: by,
        group: last.took === 'solids' ? t('solids') : t('stripes'),
      });
    case 'miss':
    case 'safe':
      return t('No pot. {name} to the table.', { name: next });
    case 'foul-scratch':
      return t('Scratch! {name} has ball in hand.', { name: next });
    case 'foul-no-hit':
      return t('Foul: no ball hit. {name} has ball in hand.', { name: next });
    case 'foul-wrong-ball':
      return t('Foul: wrong ball first. {name} has ball in hand.', { name: next });
    case 'foul-no-rail':
      return t('Foul: no cushion after contact. {name} has ball in hand.', { name: next });
    case 'timeout':
      return t('Out of time. {name} has ball in hand.', { name: next });
    case 'win':
      return t('{name} pots the 8 and wins the frame!', { name: by });
    case 'lose-eight':
      return t('{name} pots the 8 too soon and loses the frame.', { name: by });
    default:
      return '';
  }
}

// ---------------------------------------------------------------- Drawing

/** The table itself (rails, cloth, pockets, sights), drawn once per size. */
function drawTable(L: TableLayout, hq: boolean): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  const k = hq ? 2 : 1.25;
  c.width = Math.round(L.width * k);
  c.height = Math.round(L.height * k);
  const g = c.getContext('2d');
  if (!g) return null;
  g.scale(k, k);
  const s = L.scale;
  const W = L.width,
    H = L.height;
  // Wooden rails.
  const wood = g.createLinearGradient(0, 0, W, 0);
  wood.addColorStop(0, '#3d1d0c');
  wood.addColorStop(0.08, '#7a3e1b');
  wood.addColorStop(0.5, '#8d4a22');
  wood.addColorStop(0.92, '#7a3e1b');
  wood.addColorStop(1, '#3d1d0c');
  g.fillStyle = wood;
  roundRect(g, 0, 0, W, H, 4.5 * s);
  g.fill();
  if (hq) {
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 0.6;
    for (let i = 0; i < 30; i++) {
      g.beginPath();
      const y = (H / 30) * i + 3;
      g.moveTo(0, y);
      g.bezierCurveTo(W * 0.3, y + 4, W * 0.6, y - 4, W, y + 2);
      g.stroke();
    }
  }
  // Cloth.
  const [x0, y0] = toScreen(L, POOL_W, 0);
  const cw = POOL_H * s,
    ch = POOL_W * s;
  const cloth = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, H * 0.62);
  cloth.addColorStop(0, '#16935a');
  cloth.addColorStop(1, '#0b5b37');
  // The cushions' rubber, a little darker, inside the rails.
  const cushion = 4.2 * s;
  g.fillStyle = '#0a5232';
  g.fillRect(x0 - cushion, y0 - cushion, cw + 2 * cushion, ch + 2 * cushion);
  g.fillStyle = cloth;
  g.fillRect(x0, y0, cw, ch);
  if (hq) {
    // A fine nap on the cloth.
    const img = g.getImageData(x0 * k, y0 * k, cw * k, ch * k);
    let seed = 7;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const n = ((seed % 13) - 6) * 0.9;
      img.data[i] = img.data[i]! + n;
      img.data[i + 1] = img.data[i + 1]! + n;
      img.data[i + 2] = img.data[i + 2]! + n;
    }
    g.putImageData(img, x0 * k, y0 * k);
  }
  // Cushion noses catch the light.
  g.strokeStyle = 'rgba(160,255,200,0.18)';
  g.lineWidth = 1;
  g.strokeRect(x0, y0, cw, ch);
  // Pockets: dark holes in leather.
  const pocket = (x: number, y: number, r: number) => {
    const [px, py] = toScreen(L, x, y);
    g.fillStyle = '#2a1608';
    g.beginPath();
    g.arc(px, py, (r + 1.6) * s, 0, Math.PI * 2);
    g.fill();
    const hole = g.createRadialGradient(px, py, 0, px, py, r * s);
    hole.addColorStop(0, '#000');
    hole.addColorStop(0.75, '#050505');
    hole.addColorStop(1, '#1b1b1b');
    g.fillStyle = hole;
    g.beginPath();
    g.arc(px, py, r * s, 0, Math.PI * 2);
    g.fill();
  };
  const cr = POOL_CORNER * 0.72;
  pocket(-0.8, -0.8, cr);
  pocket(POOL_W + 0.8, -0.8, cr);
  pocket(-0.8, POOL_H + 0.8, cr);
  pocket(POOL_W + 0.8, POOL_H + 0.8, cr);
  pocket(POOL_W / 2, -2.4, POOL_SIDE * 0.92);
  pocket(POOL_W / 2, POOL_H + 2.4, POOL_SIDE * 0.92);
  // Sights on the rails (mother-of-pearl diamonds).
  g.fillStyle = '#f3ead2';
  const diamond = (sx: number, sy: number) => {
    const d = Math.max(1.6, 1.1 * s);
    g.beginPath();
    g.moveTo(sx, sy - d);
    g.lineTo(sx + d * 0.6, sy);
    g.lineTo(sx, sy + d);
    g.lineTo(sx - d * 0.6, sy);
    g.closePath();
    g.fill();
  };
  const off = RAIL * 0.55;
  for (const x of LONG_SIGHTS) {
    diamond(...toScreen(L, x, -off));
    diamond(...toScreen(L, x, POOL_H + off));
  }
  for (const y of SHORT_SIGHTS) {
    diamond(...toScreen(L, -off, y));
    diamond(...toScreen(L, POOL_W + off, y));
  }
  // The head string, the head and foot spots.
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.setLineDash([4, 4]);
  g.beginPath();
  g.moveTo(...toScreen(L, POOL_HEAD_X, 0));
  g.lineTo(...toScreen(L, POOL_HEAD_X, POOL_H));
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (const [x, y] of [POOL_HEAD, POOL_FOOT]) {
    const [sx, sy] = toScreen(L, x, y);
    g.beginPath();
    g.arc(sx, sy, 1.2, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawBall(g: CanvasRenderingContext2D, L: TableLayout, b: PoolBall, hq: boolean) {
  const [x, y] = toScreen(L, b.x, b.y);
  const r = POOL_R * L.scale;
  // Shadow under the table light.
  g.fillStyle = 'rgba(0,0,0,0.32)';
  g.beginPath();
  g.ellipse(x + r * 0.28, y + r * 0.35, r * 1.02, r * 0.92, 0, 0, Math.PI * 2);
  g.fill();
  const colour = ballColour(b.id);
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = isStripe(b.id) ? '#f7f3e6' : colour;
  g.fillRect(x - r, y - r, 2 * r, 2 * r);
  if (isStripe(b.id)) {
    // The band, turned a little with where the ball has rolled.
    const turn = (b.x + b.y) / (POOL_R * 2) + b.id;
    g.translate(x, y);
    g.rotate(turn);
    g.fillStyle = colour;
    g.fillRect(-r, -r * 0.55, 2 * r, r * 1.1);
    g.rotate(-turn);
    g.translate(-x, -y);
  }
  if (b.id > 0) {
    // The number disc.
    g.fillStyle = '#fbf8ee';
    g.beginPath();
    g.arc(x, y, r * 0.5, 0, Math.PI * 2);
    g.fill();
    if (r >= 5) {
      g.fillStyle = '#111';
      g.font = `700 ${Math.max(5, r * 0.62)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(b.id), x, y + r * 0.04);
    }
  }
  // Light and shade: a sphere under one lamp.
  const shade = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
  shade.addColorStop(0, 'rgba(255,255,255,0.55)');
  shade.addColorStop(0.25, 'rgba(255,255,255,0.08)');
  shade.addColorStop(0.75, 'rgba(0,0,0,0.12)');
  shade.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = shade;
  g.fillRect(x - r, y - r, 2 * r, 2 * r);
  g.restore();
  if (hq) {
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(x - r * 0.38, y - r * 0.42, r * 0.16, 0, Math.PI * 2);
    g.fill();
  }
}

function drawGuide(
  g: CanvasRenderingContext2D,
  L: TableLayout,
  cue: { x: number; y: number },
  guide: NonNullable<ReturnType<typeof poolAim>>,
  targets: readonly number[],
) {
  const [cx, cy] = toScreen(L, cue.x, cue.y);
  const [gx, gy] = toScreen(L, guide.ghost.x, guide.ghost.y);
  const legal = guide.ball === null || targets.includes(guide.ball);
  g.strokeStyle = legal ? 'rgba(255,255,255,0.75)' : 'rgba(255,110,110,0.85)';
  g.lineWidth = 1.2;
  g.setLineDash([4, 4]);
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(gx, gy);
  g.stroke();
  g.setLineDash([]);
  // The ghost ball: where the cue ball will be at contact.
  g.beginPath();
  g.arc(gx, gy, POOL_R * L.scale, 0, Math.PI * 2);
  g.stroke();
  if (guide.dir && guide.ball !== null) {
    // Where the object ball goes, and the cue ball's tangent line.
    const [ox, oy] = [
      guide.ghost.x + guide.dir.x * 2 * POOL_R,
      guide.ghost.y + guide.dir.y * 2 * POOL_R,
    ];
    const [sx, sy] = toScreen(L, ox, oy);
    const [ex, ey] = toScreen(L, ox + guide.dir.x * 38, oy + guide.dir.y * 38);
    g.strokeStyle = legal ? 'rgba(255,255,255,0.9)' : 'rgba(255,110,110,0.9)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(ex, ey);
    g.stroke();
    const ux = guide.ghost.x - cue.x,
      uy = guide.ghost.y - cue.y,
      ul = Math.hypot(ux, uy) || 1;
    const dot = (ux / ul) * guide.dir.x + (uy / ul) * guide.dir.y;
    const tx = ux / ul - dot * guide.dir.x,
      ty = uy / ul - dot * guide.dir.y,
      tl = Math.hypot(tx, ty);
    if (tl > 0.05) {
      const [ax, ay] = toScreen(L, guide.ghost.x + (tx / tl) * 22, guide.ghost.y + (ty / tl) * 22);
      g.strokeStyle = 'rgba(190,230,255,0.6)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(gx, gy);
      g.lineTo(ax, ay);
      g.stroke();
    }
  }
}

function drawCue(
  g: CanvasRenderingContext2D,
  L: TableLayout,
  cue: { x: number; y: number },
  angle: number,
  power: number,
) {
  const [cx, cy] = toScreen(L, cue.x, cue.y);
  const [dx, dy] = screenDir(angle);
  const pull = (power / 100) * 150;
  const tip = POOL_R * L.scale + 3 + pull;
  const len = 147 * L.scale;
  const nx = -dy,
    ny = dx;
  const at = (d: number, w: number, side: number) =>
    [cx - dx * d + nx * w * side, cy - dy * d + ny * w * side] as const;
  const seg = (from: number, to: number, w0: number, w1: number, fill: string | CanvasGradient) => {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(...at(from, w0, 1));
    g.lineTo(...at(to, w1, 1));
    g.lineTo(...at(to, w1, -1));
    g.lineTo(...at(from, w0, -1));
    g.closePath();
    g.fill();
  };
  const w = Math.max(1.4, 0.65 * L.scale);
  // Its shadow on the cloth.
  g.save();
  g.translate(4, 6);
  seg(tip, tip + len, w, w * 2.3, 'rgba(0,0,0,0.25)');
  g.restore();
  seg(tip, tip + 1.6 * L.scale, w, w, '#3a6fb0'); // chalked tip
  seg(tip + 1.6 * L.scale, tip + 4 * L.scale, w, w * 1.02, '#f4f0e4'); // ferrule
  seg(tip + 4 * L.scale, tip + len * 0.62, w * 1.02, w * 1.8, '#e5c48c'); // maple shaft
  seg(tip + len * 0.62, tip + len * 0.66, w * 1.8, w * 1.85, '#1c1c1c');
  seg(tip + len * 0.66, tip + len * 0.86, w * 1.85, w * 2.1, '#5a2410'); // butt
  seg(tip + len * 0.86, tip + len, w * 2.1, w * 2.3, '#222'); // wrap
}
