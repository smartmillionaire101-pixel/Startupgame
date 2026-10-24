/**
 * What the cabin windows show (player feedback: "Look outside the plane…
 * cannot see outside the plane"): one small canvas shared by every pane,
 * drawn from the sky of the hour (the flight's own colours: ../flight3d)
 * and the moment of the flight (./cabinplan `outsideAt`):
 *
 * - low (just after take-off, before landing): the horizon near eye level,
 *   fields and roads below (the city's lights at night), a few clouds
 *   above;
 * - climbing: through a layer of cloud, the horizon tilted nose-up;
 * - at cruise: the deep sky above, the cloud deck far below with the
 *   ground showing through its gaps.
 *
 * The picture wraps sideways and slides past (the plane moving), so the
 * panes scroll by sampling it further along; it's redrawn only when the
 * height has changed enough to see (a phone redraws a 96 × 160 canvas a
 * few dozen times in a climb, never every frame).
 */
import * as THREE from 'three';
import { fnv, seeded } from '../travel';

export interface SkyColours {
  zenith: string;
  horizon: string;
  night: boolean;
}

const W = 96;
const H = 160;

const mix = (a: string, b: string, k: number) =>
  `#${new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, k))).getHexString()}`;

/** Draw the view: `alt` 0 on the ground … 1 at cruise; `pitch` tilts the horizon. */
export function drawOutside(
  g: CanvasRenderingContext2D,
  sky: SkyColours,
  alt: number,
  pitch: number,
  seed = 1,
  scale = 1,
) {
  const rnd = seeded(fnv(`outside:${seed}`));
  g.save();
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.clearRect(0, 0, W, H);
  // Tilt round the middle; draw oversize so the corners stay covered.
  g.translate(W / 2, H / 2);
  g.rotate(-pitch);
  g.translate(-W / 2, -H / 2);
  const X0 = -W;
  const X1 = 2 * W;
  // The horizon sits lower in the pane the higher you are (you look down on the deck).
  const hy = H * (0.5 + 0.08 * alt);
  const sky0 = g.createLinearGradient(0, -H * 0.5, 0, hy);
  sky0.addColorStop(
    0,
    sky.night ? mix(sky.zenith, '#000000', 0.3) : mix(sky.zenith, '#0b2a6b', alt * 0.35),
  );
  sky0.addColorStop(1, sky.horizon);
  g.fillStyle = sky0;
  g.fillRect(X0, -H, X1 - X0, hy + H);
  if (sky.night) {
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i++) {
      const s = rnd() < 0.2 ? 1.5 : 1;
      g.fillRect(rnd() * W, rnd() * hy * 0.9, s, s);
    }
  }
  // The ground: nearer and larger the lower you are, hazier the higher.
  const ground = sky.night ? '#0b1020' : mix('#5f7f45', '#7c8f70', alt);
  g.fillStyle = ground;
  g.fillRect(X0, hy, X1 - X0, H * 2);
  const rows = 7;
  for (let r = 0; r < rows; r++) {
    // Perspective: rows crowd towards the horizon.
    const t0 = r / rows;
    const t1 = (r + 1) / rows;
    const y0 = hy + (H - hy + 20) * t0 * t0;
    const y1 = hy + (H - hy + 20) * t1 * t1;
    const n = 3 + Math.round((1 - t0) * 4);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * W + rnd() * 6;
      const w = W / n - 1;
      if (sky.night) {
        // Towns at night: little clusters of warm lights.
        if (rnd() < 0.45) {
          g.fillStyle = rnd() < 0.5 ? '#fbbf24' : '#fde68a';
          const k = 2 + Math.floor(rnd() * 5);
          for (let j = 0; j < k; j++) {
            const lx = x + rnd() * w;
            const ly = y0 + rnd() * (y1 - y0);
            for (const dx of [0, W]) g.fillRect(lx - dx, ly, 1, 1);
          }
        }
      } else {
        const tone = ['#6b8e4e', '#8a9a5b', '#a3a36b', '#4f7a3f', '#9c8b5e'][
          Math.floor(rnd() * 5)
        ]!;
        g.fillStyle = mix(tone, '#b7c4cf', alt * 0.65);
        for (const dx of [0, W, -W]) g.fillRect(x + dx, y0, w, Math.max(1, y1 - y0 - 1));
      }
    }
  }
  // A road or a river across, low down only.
  if (alt < 0.6) {
    g.strokeStyle = sky.night ? 'rgba(251,191,36,0.55)' : 'rgba(120,130,140,0.7)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(X0, H * 0.95);
    g.quadraticCurveTo(W / 2, hy + 10, X1, hy + 22);
    g.stroke();
  }
  // Haze along the horizon.
  const haze = g.createLinearGradient(0, hy - 6, 0, hy + 30 + alt * 30);
  haze.addColorStop(0, sky.horizon);
  haze.addColorStop(1, `${sky.horizon}00`);
  g.fillStyle = haze;
  g.fillRect(X0, hy - 6, X1 - X0, 40 + alt * 30);
  // Clouds: puffs above the horizon down low, a deck below it at cruise.
  const cloud = sky.night ? 'rgba(148,163,184,0.55)' : 'rgba(255,255,255,0.92)';
  const puff = (x: number, y: number, r: number) => {
    for (const dx of [0, W, -W]) {
      g.beginPath();
      g.ellipse(x + dx, y, r * 1.6, r * 0.7, 0, 0, Math.PI * 2);
      g.ellipse(x + dx + r * 0.9, y - r * 0.35, r, r * 0.6, 0, 0, Math.PI * 2);
      g.ellipse(x + dx - r * 0.8, y - r * 0.2, r * 0.8, r * 0.5, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  g.fillStyle = cloud;
  if (alt < 0.7) {
    for (let i = 0; i < 5; i++) puff(rnd() * W, hy - 10 - rnd() * 40 * (1 - alt), 5 + rnd() * 6);
  }
  if (alt > 0.35) {
    // The deck: denser and further below the higher you are.
    const deck = Math.min(1, (alt - 0.35) / 0.5);
    const top = hy + 4 + (1 - deck) * 10;
    for (let i = 0; i < 40 * deck; i++) {
      const y = top + Math.pow(rnd(), 1.4) * (H - top);
      const r = 3 + ((y - top) / (H - top)) * 12;
      puff(rnd() * W, y, r);
    }
  }
  // Climbing through a layer: the pane goes milky.
  const inCloud = Math.max(0, 1 - Math.abs(alt - 0.45) / 0.12);
  if (inCloud > 0) {
    g.fillStyle = sky.night
      ? `rgba(71,85,105,${0.8 * inCloud})`
      : `rgba(241,245,249,${0.85 * inCloud})`;
    g.fillRect(X0, -H, X1 - X0, 3 * H);
  }
  g.restore();
}

/**
 * The panes' shared picture: redrawn when the height or the sky changes,
 * scrolled every frame. `scale` draws it bigger (the sky behind the plane,
 * outside).
 */
export class OutsideView {
  readonly texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D | null;
  private drawn = { alt: -1, pitch: 0, sky: '' };

  constructor(
    private seed = 1,
    private scale = 1,
  ) {
    const c = document.createElement('canvas');
    c.width = W * scale;
    c.height = H * scale;
    this.g = c.getContext('2d');
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.wrapS = THREE.RepeatWrapping;
  }

  /** Draw it again if what's outside has changed enough to see. */
  set(sky: SkyColours, alt: number, pitch: number) {
    const key = `${sky.zenith}${sky.horizon}${sky.night}`;
    const d = this.drawn;
    if (d.sky === key && Math.abs(d.alt - alt) < 0.03 && Math.abs(d.pitch - pitch) < 0.02)
      return false;
    this.drawn = { alt, pitch, sky: key };
    if (this.g) drawOutside(this.g, sky, alt, pitch, this.seed, this.scale);
    this.texture.needsUpdate = true;
    return true;
  }

  /** The ground slides past: faster down low, slow at cruise. */
  scroll(dt: number, alt: number) {
    this.texture.offset.x = (this.texture.offset.x + dt * (0.12 - 0.1 * alt)) % 1;
  }

  dispose() {
    this.texture.dispose();
  }
}
