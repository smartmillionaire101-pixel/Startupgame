/**
 * Wave 12 §A: the pool table. Drag on the cloth to aim (the guide shows where
 * the cue ball meets the first ball and where that ball goes), set the power
 * and spin, shoot. The shot goes to the server, which runs the shared physics
 * and the rules; every shot (yours, theirs, the AI's) then plays here from the
 * very same simulation, and the table snaps to the server's result.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  POCKETS,
  POOL_TABLE,
  cueSpotOk,
  simulateShot,
  type PoolBall,
  type PoolFrame,
} from '@runway/engine';
import { t } from '../i18n';
import { reduceMotion } from '../ui';
import type { Act } from './GamesHost';
import { Face } from './GamesHost';
import type { Match } from './useMatch';

const { W, L, R } = POOL_TABLE;
const RAIL = 7.5;
const COLORS = [
  '#f8f5ec',
  '#f2b705',
  '#1d4ed8',
  '#dc2626',
  '#7c3aed',
  '#f97316',
  '#15803d',
  '#7f1d1d',
  '#111111',
];
const colorOf = (n: number) => COLORS[n > 8 ? n - 8 : n]!;

type Pool = NonNullable<Match['pool']>;

function predict(balls: readonly PoolBall[], cx: number, cy: number, dx: number, dy: number) {
  let best = Infinity;
  let hit: PoolBall | null = null;
  for (const b of balls) {
    if (b[0] === 0) continue;
    const ox = cx - b[1];
    const oy = cy - b[2];
    const bq = ox * dx + oy * dy;
    const c = ox * ox + oy * oy - 4 * R * R;
    const disc = bq * bq - c;
    if (disc < 0) continue;
    const tt = -bq - Math.sqrt(disc);
    if (tt > 0 && tt < best) {
      best = tt;
      hit = b;
    }
  }
  // Up to the cushion when nothing's in the way.
  const tx = dx > 0 ? (W - R - cx) / dx : dx < 0 ? (R - cx) / dx : Infinity;
  const ty = dy > 0 ? (L - R - cy) / dy : dy < 0 ? (R - cy) / dy : Infinity;
  const wall = Math.min(tx, ty);
  if (!hit || best > wall) return { gx: cx + dx * wall, gy: cy + dy * wall, hit: null };
  return { gx: cx + dx * best, gy: cy + dy * best, hit };
}

function drawBall(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, s: number) {
  const r = R * s;
  ctx.save();
  ctx.translate(x, y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.arc(r * 0.18, r * 0.25, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = n > 8 ? '#f8f5ec' : colorOf(n);
  ctx.fillRect(-r, -r, 2 * r, 2 * r);
  if (n > 8) {
    ctx.fillStyle = colorOf(n);
    ctx.fillRect(-r, -r * 0.55, 2 * r, r * 1.1);
  }
  if (n > 0) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = `700 ${Math.max(7, r * 0.62)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 0, r * 0.04);
  }
  const shine = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r * 1.05);
  shine.addColorStop(0, 'rgba(255,255,255,0.75)');
  shine.addColorStop(0.25, 'rgba(255,255,255,0.12)');
  shine.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = shine;
  ctx.fillRect(-r, -r, 2 * r, 2 * r);
  ctx.restore();
}

export default function PoolTable({ g, act, busy }: { g: Match; act: Act; busy: boolean }) {
  const p = g.pool as Pool;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(3);
  const [aim, setAim] = useState<[number, number]>([0, -1]);
  const [power, setPower] = useState(0.6);
  const [spin, setSpin] = useState(0);
  // Where you've put the cue ball (ball in hand), for this shot only.
  const [placed, setCue] = useState<{ seq: number; at: [number, number] } | null>(null);
  const cue = placed && placed.seq === p.seq ? placed.at : null;
  const [anim, setAnim] = useState<{
    frames: PoolFrame[];
    start: number;
    by: string;
    potted: number[];
    foul: string | null;
  } | null>(null);
  const queue = useRef<Pool['recent']>([]);
  const seen = useRef<number>(p.seq);
  const dragging = useRef<'aim' | 'cue' | null>(null);
  const me = g.seats.find((s) => s.you);
  const mine = p.yourTurn && g.status === 'playing' && !anim;
  const inHand = p.ballInHand && mine;

  // Fit the table to the screen.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = Math.max(320, window.innerHeight - 290);
      setScale(Math.max(1.4, Math.min(w / (W + 2 * RAIL), h / (L + 2 * RAIL))));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const next = useCallback(() => {
    const r = queue.current.shift();
    if (!r) return null;
    const out = simulateShot(
      r.before,
      { dx: r.dx, dy: r.dy, power: r.power, spin: r.spin },
      { frameEvery: 4 },
    );
    return {
      frames: out.frames,
      start: performance.now(),
      by: r.by,
      potted: r.potted,
      foul: r.foul,
    };
  }, []);

  // New shots from the server: queue them for playback.
  useEffect(() => {
    const fresh = p.recent.filter((r) => r.seq > seen.current);
    if (!fresh.length) return;
    seen.current = p.seq;
    if (reduceMotion()) return;
    queue.current.push(...fresh);
    const id = setTimeout(() => setAnim((a) => a ?? next()), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.seq]);

  const cuePos = (): [number, number] | null => {
    if (inHand && cue) return cue;
    const c = p.balls.find((b) => b[0] === 0);
    if (c) return [c[1], c[2]];
    if (inHand) {
      // Default spot: the head spot or the nearest free one.
      for (let k = 0; k < 30; k++) {
        const y = L * 0.75 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 2 * R;
        if (cueSpotOk(p.balls, W / 2, y, false)) return [W / 2, y];
      }
    }
    return null;
  };

  // Draw.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = (W + 2 * RAIL) * scale;
    const ch = (L + 2 * RAIL) * scale;
    c.width = Math.round(cw * dpr);
    c.height = Math.round(ch * dpr);
    c.style.width = `${cw}px`;
    c.style.height = `${ch}px`;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const s = scale;
    const X = (x: number) => (x + RAIL) * s;
    const Y = (y: number) => (y + RAIL) * s;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Rails: wood.
      const wood = ctx.createLinearGradient(0, 0, cw, ch);
      wood.addColorStop(0, '#6b3a1f');
      wood.addColorStop(0.5, '#8a4b25');
      wood.addColorStop(1, '#5a2f17');
      ctx.fillStyle = wood;
      ctx.beginPath();
      ctx.roundRect(0, 0, cw, ch, 14 * (s / 3));
      ctx.fill();
      // Cushions and cloth.
      ctx.fillStyle = '#0b5f4a';
      ctx.fillRect(X(-2.2), Y(-2.2), (W + 4.4) * s, (L + 4.4) * s);
      const cloth = ctx.createRadialGradient(
        X(W / 2),
        Y(L / 2),
        10,
        X(W / 2),
        Y(L / 2),
        L * s * 0.62,
      );
      cloth.addColorStop(0, '#1b9a73');
      cloth.addColorStop(1, '#0d6e52');
      ctx.fillStyle = cloth;
      ctx.fillRect(X(0), Y(0), W * s, L * s);
      // Head string and foot spot.
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(L * 0.75));
      ctx.lineTo(X(W), Y(L * 0.75));
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(X(W / 2), Y(L * 0.25), 1.6, 0, Math.PI * 2);
      ctx.fill();
      // Diamonds on the rails.
      ctx.fillStyle = '#f4e7c5';
      for (let i = 1; i < 4; i++) {
        for (const x of [-RAIL / 2, W + RAIL / 2]) {
          ctx.beginPath();
          ctx.arc(X(x), Y((L / 8) * i), 1.2 * (s / 3) + 0.6, 0, Math.PI * 2);
          ctx.arc(X(x), Y(L / 2 + (L / 8) * i), 1.2 * (s / 3) + 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const y of [-RAIL / 2, L + RAIL / 2]) {
          ctx.beginPath();
          ctx.arc(X((W / 4) * i), Y(y), 1.2 * (s / 3) + 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Pockets.
      for (const pk of POCKETS) {
        ctx.fillStyle = '#050505';
        ctx.beginPath();
        ctx.arc(
          X(Math.max(-1, Math.min(W + 1, pk.x))),
          Y(Math.max(-1, Math.min(L + 1, pk.y))),
          (pk.side ? 4.6 : 5.4) * s,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      // Balls: the animation frame, else the table.
      let balls: PoolBall[] = p.balls;
      let playing = false;
      if (anim) {
        const tt = (performance.now() - anim.start) / 1000;
        const i = anim.frames.findIndex((f) => f.t >= tt);
        if (i === -1) {
          const nx = next();
          if (nx) {
            setAnim(nx);
            return;
          }
          setAnim(null);
          return;
        }
        balls = anim.frames[i]!.balls;
        playing = true;
      } else if (inHand) {
        const pos = cuePos();
        balls = p.balls.filter((b) => b[0] !== 0);
        if (pos) balls = [[0, pos[0], pos[1]], ...balls];
      }
      // Aim guide and cue.
      const cb = balls.find((b) => b[0] === 0);
      if (mine && cb && !playing) {
        const [dx, dy] = aim;
        const pr = predict(balls, cb[1], cb[2], dx, dy);
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(X(cb[1]), Y(cb[2]));
        ctx.lineTo(X(pr.gx), Y(pr.gy));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.arc(X(pr.gx), Y(pr.gy), R * s, 0, Math.PI * 2);
        ctx.stroke();
        if (pr.hit) {
          const ox = pr.hit[1] - pr.gx;
          const oy = pr.hit[2] - pr.gy;
          const ol = Math.hypot(ox, oy) || 1;
          ctx.strokeStyle = 'rgba(255,240,170,0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(X(pr.hit[1]), Y(pr.hit[2]));
          ctx.lineTo(X(pr.hit[1] + (ox / ol) * 26), Y(pr.hit[2] + (oy / ol) * 26));
          ctx.stroke();
        }
        // The cue stick, pulled back by the power.
        const back = R + 2 + power * 16;
        const len = 120;
        const sx = cb[1] - dx * back;
        const sy = cb[2] - dy * back;
        const grad = ctx.createLinearGradient(X(sx), Y(sy), X(sx - dx * len), Y(sy - dy * len));
        grad.addColorStop(0, '#f1e3c2');
        grad.addColorStop(0.03, '#3b82f6');
        grad.addColorStop(0.06, '#e8d3a5');
        grad.addColorStop(0.7, '#a0652e');
        grad.addColorStop(1, '#2b1608');
        ctx.strokeStyle = grad;
        ctx.lineCap = 'round';
        ctx.lineWidth = 2.2 * (s / 3) + 1.5;
        ctx.beginPath();
        ctx.moveTo(X(sx), Y(sy));
        ctx.lineTo(X(sx - dx * len), Y(sy - dy * len));
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
      for (const [n, x, y] of balls) drawBall(ctx, n, X(x), Y(y), s);
      if (inHand && cb && !playing) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(X(cb[1]), Y(cb[2]), R * s * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (playing) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, p, anim, aim, power, mine, inHand, cue]);

  const toTable = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    return [(e.clientX - rect.left) / scale - RAIL, (e.clientY - rect.top) / scale - RAIL] as const;
  };
  const point = (e: React.PointerEvent, start: boolean) => {
    if (!mine) return;
    const [x, y] = toTable(e);
    const pos = cuePos();
    if (!pos) return;
    if (start)
      dragging.current = inHand && Math.hypot(x - pos[0], y - pos[1]) < 3.2 * R ? 'cue' : 'aim';
    if (dragging.current === 'cue') {
      const others = p.balls.filter((b) => b[0] !== 0);
      if (cueSpotOk(others, x, y, false)) setCue({ seq: p.seq, at: [x, y] });
      return;
    }
    const dx = x - pos[0];
    const dy = y - pos[1];
    const l = Math.hypot(dx, dy);
    if (l > 0.5) setAim([dx / l, dy / l]);
  };
  const nudge = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    setAim(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
  };
  const shoot = () => {
    const pos = cuePos();
    void act({
      type: 'game.play',
      gameId: g.id,
      move: {
        k: 'shot',
        dx: aim[0],
        dy: aim[1],
        power,
        spin,
        ...(inHand && pos
          ? { cueX: Math.round(pos[0] * 100) / 100, cueY: Math.round(pos[1] * 100) / 100 }
          : {}),
      },
    });
  };

  const turnSeat = g.seats.find((s) => s.id === p.turn);
  const groupOf = (id: string) => p.groups?.[id] ?? null;
  const left = (grp: 'solids' | 'stripes' | null) =>
    grp
      ? p.balls.filter(([n]) => (grp === 'solids' ? n >= 1 && n <= 7 : n >= 9)).map(([n]) => n)
      : [];
  const last = anim ?? null;
  return (
    <section
      className="gm-pool"
      aria-label={t('Pool table')}
      data-pool-seq={p.seq}
      data-your-turn={p.yourTurn ? '1' : '0'}
    >
      <div className="gm-pool-players">
        {g.seats.map((s) => {
          const grp = groupOf(s.id);
          return (
            <div
              key={s.id}
              className={`gm-pp${p.turn === s.id ? ' is-turn' : ''}`}
              data-pool-player={s.id}
            >
              <Face id={s.id} name={s.name} ai={s.ai} size={28} />
              <span className="gm-pp-name">{s.you ? t('You') : s.name.split(' ')[0]}</span>
              <span className="gm-pp-group">
                {grp ? (
                  left(grp).map((n) => (
                    <i key={n} style={{ background: colorOf(n) }} className={n > 8 ? 'st' : ''} />
                  ))
                ) : (
                  <span className="small">{t('open table')}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="gm-pool-table" ref={wrap}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={t('Pool table: {n} balls left', {
            n: p.balls.filter(([n]) => n !== 0).length,
          })}
          onPointerDown={(e) => {
            (e.target as HTMLCanvasElement).setPointerCapture?.(e.pointerId);
            point(e, true);
          }}
          onPointerMove={(e) => dragging.current && point(e, false)}
          onPointerUp={() => (dragging.current = null)}
        />
        {last && (last.potted.length > 0 || last.foul) && (
          <div className="gm-pool-flash" aria-live="polite">
            {last.foul
              ? last.foul === 'scratch'
                ? t('Scratch! Ball in hand.')
                : t('Foul! Ball in hand.')
              : t('Potted {n}', { n: last.potted.filter((n) => n !== 0).join(', ') })}
          </div>
        )}
      </div>
      <p className="small gm-status" aria-live="polite">
        {g.status !== 'playing'
          ? ''
          : anim
            ? t('…')
            : p.yourTurn
              ? inHand
                ? t('Ball in hand: drag the cue ball, then aim.')
                : t('Your shot. Drag on the table to aim.')
              : t('{name} is at the table.', { name: turnSeat?.name ?? '' })}
      </p>
      {g.status === 'playing' && (
        <div className="gm-pool-ctl" aria-hidden={!mine}>
          <div className="gm-row">
            <button
              type="button"
              className="btn btn-subtle btn-sm"
              aria-label={t('Aim left')}
              disabled={!mine}
              onClick={() => nudge(-1)}
            >
              ⟲
            </button>
            <label className="gm-power">
              <span>{t('Power')}</span>
              <input
                type="range"
                min={5}
                max={100}
                value={Math.round(power * 100)}
                disabled={!mine}
                aria-label={t('Power')}
                onChange={(e) => setPower(Number(e.target.value) / 100)}
              />
            </label>
            <button
              type="button"
              className="btn btn-subtle btn-sm"
              aria-label={t('Aim right')}
              disabled={!mine}
              onClick={() => nudge(1)}
            >
              ⟳
            </button>
          </div>
          <div className="gm-row">
            <div className="segmented gm-spin" role="radiogroup" aria-label={t('Spin')}>
              {[
                [-0.8, t('Draw')],
                [0, t('Stun')],
                [0.8, t('Follow')],
              ].map(([v, l]) => (
                <button
                  key={l as string}
                  type="button"
                  role="radio"
                  aria-checked={spin === v}
                  className={spin === v ? 'on' : ''}
                  disabled={!mine}
                  onClick={() => setSpin(v as number)}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary gm-shoot"
              disabled={!mine || busy}
              onClick={shoot}
            >
              {t('Shoot')}
            </button>
          </div>
        </div>
      )}
      {me && p.groups?.[me.id] && (
        <p className="small gm-muted">
          {p.groups[me.id] === 'solids'
            ? t('You’re on solids (1–7).')
            : t('You’re on stripes (9–15).')}
        </p>
      )}
    </section>
  );
}
