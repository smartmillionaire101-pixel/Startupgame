/**
 * Golf in Lite (no WebGL): the hole from the side, drawn on a canvas. Sky,
 * hills and trees, the ground in front of you coloured by what it is
 * (fairway, rough, sand, water, the green), the flag, your own figure in
 * your colours swinging face-on (backswing to the left, follow-through to
 * the right), your partners, and the ball's arc. The view zooms out to keep
 * the ball in shot while it flies.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import type { AvatarLook } from '../art';
import { along, dist, lieAt, type Lie } from './game';
import type { GolfDrawProps, GolfFrame } from './frame';

const LIE_COLOUR: Record<Lie, string> = {
  tee: '#86cc52',
  fairway: '#7cc04a',
  fringe: '#79c447',
  green: '#95d95e',
  rough: '#4c8a2c',
  bunker: '#ecdcab',
  water: '#2f86c9',
  holed: '#95d95e',
};

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** A face-on golfer: feet at (x, y), `px` pixels a metre. */
function drawGolfer(
  ctx: CanvasRenderingContext2D,
  look: AvatarLook,
  x: number,
  y: number,
  px: number,
  swing: number,
  putting: boolean,
  cheer: boolean,
) {
  const m = px;
  const hipY = y - 0.86 * m;
  const shY = y - 1.38 * m;
  const headY = y - 1.6 * m;
  const lean = putting ? 0.12 : 0.07;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Legs, a little flexed.
  ctx.strokeStyle = look.bottom;
  ctx.lineWidth = 0.13 * m;
  for (const s of [-1, 1]) {
    const turn = swing > 0 && s === -1 ? swing * 0.08 : 0;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.09 * m, hipY);
    ctx.lineTo(x + s * 0.17 * m - turn * m, y - 0.42 * m);
    ctx.lineTo(x + s * 0.2 * m - turn * m * 1.5, y - 0.03 * m);
    ctx.stroke();
  }
  ctx.fillStyle = '#1f2937';
  for (const s of [-1, 1])
    ctx.fillRect(x + s * 0.2 * m - 0.09 * m, y - 0.07 * m, 0.18 * m, 0.07 * m);
  // The torso, turning (narrower) at the top and the finish.
  const turn = Math.abs(swing);
  const half = 0.2 * m * (1 - turn * 0.35);
  ctx.fillStyle = look.top;
  ctx.beginPath();
  ctx.moveTo(x - half, shY + lean * m);
  ctx.lineTo(x + half, shY + lean * m);
  ctx.lineTo(x + 0.15 * m, hipY + 0.06 * m);
  ctx.lineTo(x - 0.15 * m, hipY + 0.06 * m);
  ctx.closePath();
  ctx.fill();
  if (look.topStyle === 'dress' || look.topStyle === 'kaftan') {
    // A man's kaftan is a straight tunic to mid-thigh; a dress (or a woman's kaftan) flares.
    const tunic = look.topStyle === 'kaftan' && look.gender !== 'female';
    const w = tunic ? 0.17 : 0.26;
    const len = tunic ? 0.22 : 0.42;
    ctx.beginPath();
    ctx.moveTo(x - 0.16 * m, hipY);
    ctx.lineTo(x + 0.16 * m, hipY);
    ctx.lineTo(x + w * m, hipY + len * m);
    ctx.lineTo(x - w * m, hipY + len * m);
    ctx.closePath();
    ctx.fill();
  }
  // The head, hair and cap (long hair hangs behind the head).
  const hx = x + (swing < 0 ? swing * 0.04 * m : 0);
  if (look.hairStyle === 'long' || look.hairStyle === 'braids' || look.hairStyle === 'locs') {
    ctx.fillStyle = look.hair;
    ctx.fillRect(hx - 0.19 * m, headY + lean * m - 0.04 * m, 0.38 * m, 0.3 * m);
  }
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(hx, headY + lean * m, 0.15 * m, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.hair;
  if (look.hairStyle !== 'bald') {
    ctx.beginPath();
    const big = look.hairStyle === 'afro' ? 0.21 : look.hairStyle === 'long' ? 0.17 : 0.155;
    ctx.arc(hx, headY + lean * m - 0.03 * m, big * m, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  // A face: eyes looking down at the ball, a smile.
  ctx.fillStyle = '#111827';
  for (const ex of [-0.05, 0.05]) {
    ctx.beginPath();
    ctx.arc(hx + ex * m, headY + lean * m + 0.02 * m, 0.016 * m, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#7f1d1d';
  ctx.lineWidth = Math.max(1, 0.012 * m);
  ctx.beginPath();
  ctx.arc(hx, headY + lean * m + 0.06 * m, 0.04 * m, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  if (look.headwear === 'cap' || look.accessory === 'cap') {
    ctx.fillStyle = look.top;
    ctx.beginPath();
    ctx.arc(hx, headY + lean * m - 0.04 * m, 0.16 * m, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(hx - 0.02 * m, headY + lean * m - 0.06 * m, 0.24 * m, 0.04 * m);
  }
  // Arms and club: they swing round the shoulders in the picture's plane.
  const sx = x;
  const sy = shY + lean * m + 0.06 * m;
  if (cheer) {
    ctx.strokeStyle = look.top;
    ctx.lineWidth = 0.1 * m;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx + s * half * 0.8, sy);
      ctx.lineTo(sx + s * 0.35 * m, sy - 0.55 * m);
      ctx.stroke();
    }
    return;
  }
  const amp = putting ? 0.35 : 1;
  // θ from straight down, + towards the left of the picture.
  const theta = swing < 0 ? lerp(0.06, 2.55, -swing * amp) : lerp(0.06, -2.65, swing * amp);
  // Wrists: the club is upright by half-way back, past level at the top (and the same through).
  const u = Math.abs(swing);
  const hinge = putting
    ? 0
    : swing < 0
      ? u < 0.5
        ? Math.PI * u
        : Math.PI / 2 + (u - 0.5) * 1.2
      : -(u < 0.5 ? Math.PI * u : Math.PI / 2 + (u - 0.5) * 0.4);
  const arm = 0.6 * m;
  const hands = { x: sx - Math.sin(theta) * arm, y: sy + Math.cos(theta) * arm };
  ctx.strokeStyle = look.top;
  ctx.lineWidth = 0.09 * m;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx + s * half * 0.85, sy);
    ctx.lineTo(hands.x, hands.y);
    ctx.stroke();
  }
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(hands.x, hands.y, 0.055 * m, 0, Math.PI * 2);
  ctx.fill();
  const clubA = theta + hinge;
  const len = (putting ? 0.82 : 0.98) * m;
  const cx = hands.x - Math.sin(clubA) * len;
  const cy = hands.y + Math.cos(clubA) * len;
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 0.025 * m;
  ctx.beginPath();
  ctx.moveTo(hands.x, hands.y);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  ctx.fillStyle = '#374151';
  ctx.fillRect(cx - 0.06 * m, cy - 0.025 * m, 0.12 * m, 0.05 * m);
}

export default function Golf2D(props: GolfDrawProps): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let scale = 60;
    let camX = 0;
    // The flying ball's trail (along, height), cleared when it's not flying.
    const trail: [number, number][] = [];
    let ready = false;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const f: GolfFrame = live.current.frame();
      const g = f.geo;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (!W || !H) return;
      // Either side: the view grows and shrinks as the tray comes and goes.
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // The picture's line: from the golfer along their heading.
      const origin = f.golfer;
      const H0 = f.heading;
      const alongOf = (p: { x: number; z: number }) =>
        (p.x - origin.x) * Math.sin(H0) - (p.z - origin.z) * Math.cos(H0);
      const ballA = alongOf(f.ball);
      const pinA = alongOf(g.pin);
      // Zoom: close on the golfer, out to keep a flying ball in shot.
      const flying = f.cam === 'follow';
      const span = flying
        ? Math.max(30, ballA + 25)
        : f.putting
          ? Math.max(8, Math.min(30, pinA + 4))
          : 9;
      // At address the golfer stands about a third of the picture tall.
      const wantScale =
        flying || f.putting ? (W * 0.86) / span : Math.min(W / 4.5, (H * 0.4) / 1.9);
      scale = lerp(scale, wantScale, 0.12);
      const wantCam = flying ? Math.max(0, ballA / 2) : f.putting ? Math.min(pinA, 30) / 2 : 1.2;
      camX = lerp(camX, wantCam, 0.12);
      const gy = H * 0.66;
      const sxOf = (a: number) => W / 2 + (a - camX) * scale;
      // Sky and sun.
      const sky = ctx.createLinearGradient(0, 0, 0, gy);
      sky.addColorStop(0, '#3b82d6');
      sky.addColorStop(1, '#d6ebfb');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, gy);
      ctx.fillStyle = 'rgba(255,248,220,0.9)';
      ctx.beginPath();
      ctx.arc(W * 0.82, H * 0.14, 22, 0, Math.PI * 2);
      ctx.fill();
      // Far hills (slow parallax) and a tree line.
      ctx.fillStyle = '#7fa889';
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= W; x += 20)
        ctx.lineTo(x, gy - 40 - Math.sin((x + camX * 2) / 90) * 18 - Math.sin((x + camX) / 37) * 6);
      ctx.lineTo(W, gy);
      ctx.fill();
      for (let k = -2; k < 26; k++) {
        const a = Math.floor(camX / 14) * 14 + k * 14 - 60;
        const x = sxOf(a) * 0.5 + W * 0.25;
        const s = 0.6 + ((Math.abs(a) * 7) % 5) / 10;
        ctx.fillStyle = '#2f6b33';
        ctx.beginPath();
        ctx.arc(x, gy - 30 * s, 16 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // The ground in front: coloured by what it is.
      const step = Math.max(0.5, (3 / scale) * 4);
      for (let a = camX - W / 2 / scale - 2; a < camX + W / 2 / scale + 2; a += step) {
        const p = along(origin, H0, a);
        const lie = dist(p, g.pin) < 0.2 ? 'green' : lieAt(g, p);
        ctx.fillStyle = LIE_COLOUR[lie];
        const x0 = sxOf(a);
        // A strip at the ball's line, the rest of the ground fading into the rough.
        ctx.fillRect(x0, gy, step * scale + 1, Math.min(H - gy, 26));
        if (lie === 'water') {
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(x0, gy + 3, step * scale + 1, 2);
        }
      }
      const near = ctx.createLinearGradient(0, gy + 26, 0, H);
      near.addColorStop(0, '#5a9a34');
      near.addColorStop(1, '#3c7424');
      ctx.fillStyle = near;
      ctx.fillRect(0, gy + 26, W, H - gy - 26);
      for (let y = gy + 34; y < H; y += 18) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(0, y, W, 8);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, gy, W, 3);
      // The pin.
      const pinX = sxOf(pinA);
      if (pinX > -20 && pinX < W + 20) {
        const ps = Math.max(0.6, scale / 30);
        ctx.fillStyle = '#0b1209';
        ctx.fillRect(pinX - 4 * ps, gy - 1, 8 * ps, 3);
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pinX, gy);
        ctx.lineTo(pinX, gy - Math.max(30, 2.4 * scale));
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        const top = gy - Math.max(30, 2.4 * scale);
        ctx.beginPath();
        ctx.moveTo(pinX, top);
        ctx.lineTo(pinX + Math.max(16, 0.75 * scale), top + Math.max(5, 0.24 * scale));
        ctx.lineTo(pinX, top + Math.max(10, 0.48 * scale));
        ctx.fill();
      }
      // Partners, behind.
      f.partners.forEach((p, i) => {
        const a = alongOf(p);
        const look = live.current.partners[i];
        if (!look) return;
        drawGolfer(ctx, look, sxOf(a), gy - 4, scale * 0.8, 0, false, p.clap);
      });
      // You.
      const gx = sxOf(0);
      drawGolfer(ctx, live.current.me, gx, gy, scale, f.swing, f.putting, f.cheer);
      // The ball's trail while it flies.
      if (flying) {
        const lastT = trail[trail.length - 1];
        if (!lastT || Math.abs(lastT[0] - ballA) > 1) trail.push([ballA, f.ball.y]);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (const [a, h] of trail) {
          ctx.beginPath();
          ctx.arc(sxOf(a), gy - h * scale, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      } else trail.length = 0;
      // The ball.
      const bx = sxOf(ballA);
      const by = gy - f.ball.y * scale - Math.max(2, 0.05 * scale);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(bx, gy + 1, Math.max(2, 0.06 * scale), 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(3.5, 0.05 * scale), 0, Math.PI * 2);
      ctx.fill();
      // The aim's carry, a marker on the ground.
      if (f.aim && !flying && !f.putting) {
        const ax = sxOf(alongOf(along(f.ball, f.aim.heading, f.aim.carry)));
        ctx.strokeStyle = '#fde047';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(bx, gy + 6);
        ctx.lineTo(Math.min(W, ax), gy + 6);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (!ready) {
        ready = true;
        live.current.onReady?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="golf-2d" data-golf-2d="" aria-hidden="true" />;
}
