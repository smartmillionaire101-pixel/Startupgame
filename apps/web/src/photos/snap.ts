/**
 * The camera (player feedback: "a camera for when I'm watching a view and want
 * to take a picture, or to show my results in games, or my company's
 * performance"). Two kinds of picture, both small JPEG data URLs that the
 * photo sheet (../home/HomePhotos.tsx) keeps, saves and shares:
 *
 * - `canvasJpeg`: what a 3D view shows right now, with a caption along the
 *   bottom (the sky view's name and city);
 * - `resultCard`: a card drawn for sharing: a kicker, a big headline, a few
 *   figures and a footer (a golf round, a game's result, your company).
 */

const BRAND = 'Runway';

/** Fit text to `max` pixels wide, shrinking the font down to `min`. */
function fit(
  g: CanvasRenderingContext2D,
  text: string,
  weight: number,
  size: number,
  max: number,
  min = 18,
) {
  let s = size;
  for (; s > min; s -= 2) {
    g.font = `${weight} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    if (g.measureText(text).width <= max) break;
  }
  return s;
}

const jpeg = (c: HTMLCanvasElement, quality: number) => {
  try {
    const url = c.toDataURL('image/jpeg', quality);
    return url.startsWith('data:image/jpeg') ? url : null;
  } catch {
    return null;
  }
};

/**
 * A 3D view as a JPEG, scaled down to `maxSide`, with an optional caption on
 * a dark band along the bottom. Draw the frame first in the same tick (WebGL
 * keeps no drawing buffer between frames).
 */
export function canvasJpeg(
  src: HTMLCanvasElement,
  opts: { maxSide?: number; quality?: number; caption?: string } = {},
): string | null {
  const { maxSide = 1080, quality = 0.82, caption } = opts;
  if (!src.width || !src.height) return null;
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  const out = document.createElement('canvas');
  out.width = Math.round(src.width * k);
  out.height = Math.round(src.height * k);
  const g = out.getContext('2d');
  if (!g) return null;
  try {
    g.drawImage(src, 0, 0, out.width, out.height);
  } catch {
    return null;
  }
  if (caption) {
    const band = Math.round(out.height * 0.09);
    const grad = g.createLinearGradient(0, out.height - band * 1.6, 0, out.height);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = grad;
    g.fillRect(0, out.height - band * 1.6, out.width, band * 1.6);
    const pad = Math.round(out.width * 0.04);
    g.fillStyle = '#fff';
    g.textBaseline = 'alphabetic';
    fit(g, caption, 700, Math.round(band * 0.42), out.width - pad * 2 - 140);
    g.fillText(caption, pad, out.height - band * 0.4);
    g.font = `600 ${Math.round(band * 0.3)}px system-ui, sans-serif`;
    g.globalAlpha = 0.8;
    g.textAlign = 'right';
    g.fillText(BRAND, out.width - pad, out.height - band * 0.4);
    g.globalAlpha = 1;
    g.textAlign = 'left';
  }
  return jpeg(out, quality);
}

export interface ResultCardSpec {
  /** Small capitals over the headline ("IKOYI GOLF CLUB"). */
  kicker: string;
  /** The big line ("74 · 2 over par"). */
  title: string;
  /** A line under it ("Three holes with Ada and Tunde"). */
  subtitle?: string;
  /** Up to six figures, two to a row. */
  stats: { label: string; value: string }[];
  /** The bottom line ("Month 7 · Lagos"). */
  footer?: string;
  /** The card's colours. */
  tone?: 'green' | 'teal' | 'night';
}

const TONES = {
  green: ['#14532d', '#16a34a'],
  teal: ['#134e4a', '#0f766e'],
  night: ['#0f172a', '#334155'],
} as const;

/** A shareable card (1080×1350, a phone-friendly 4:5) as a JPEG data URL. */
export function resultCard(spec: ResultCardSpec): string | null {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  const [a, b] = TONES[spec.tone ?? 'teal'];
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, a);
  bg.addColorStop(1, b);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const pad = 84;
  g.fillStyle = '#fff';
  g.textBaseline = 'top';
  // Kicker.
  g.globalAlpha = 0.8;
  fit(g, spec.kicker.toUpperCase(), 700, 36, W - pad * 2);
  g.fillText(spec.kicker.toUpperCase(), pad, pad);
  g.globalAlpha = 1;
  // Headline.
  const size = fit(g, spec.title, 800, 120, W - pad * 2, 48);
  g.fillText(spec.title, pad, pad + 70);
  let y = pad + 70 + size + 24;
  if (spec.subtitle) {
    g.globalAlpha = 0.9;
    fit(g, spec.subtitle, 500, 40, W - pad * 2);
    g.fillText(spec.subtitle, pad, y);
    g.globalAlpha = 1;
    y += 70;
  }
  // Figures: two to a row, in rounded tiles.
  const stats = spec.stats.slice(0, 6);
  const gap = 28;
  const tw = (W - pad * 2 - gap) / 2;
  const th = 190;
  y += 30;
  stats.forEach((s, i) => {
    const x = pad + (i % 2) * (tw + gap);
    const ty = y + Math.floor(i / 2) * (th + gap);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.roundRect(x, ty, tw, th, 28);
    g.fill();
    g.fillStyle = '#fff';
    g.globalAlpha = 0.75;
    fit(g, s.label.toUpperCase(), 700, 28, tw - 56);
    g.fillText(s.label.toUpperCase(), x + 28, ty + 30);
    g.globalAlpha = 1;
    fit(g, s.value, 800, 64, tw - 56, 28);
    g.fillText(s.value, x + 28, ty + 86);
  });
  // Footer and the game's name.
  g.textBaseline = 'alphabetic';
  g.globalAlpha = 0.8;
  if (spec.footer) {
    fit(g, spec.footer, 500, 34, W - pad * 2 - 220);
    g.fillText(spec.footer, pad, H - pad);
  }
  g.textAlign = 'right';
  g.font = '800 40px system-ui, sans-serif';
  g.fillText(BRAND, W - pad, H - pad);
  return jpeg(c, 0.88);
}
