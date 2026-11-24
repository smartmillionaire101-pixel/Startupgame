/**
 * The props rooms are furnished with (./core.ts Dresser): CC0 models where
 * the pack has one (desks, chairs, sofas, plants, kitchens, washing
 * machines), drawn in code where it hasn't (shelves of stock, magazine racks,
 * glass walls, whiteboards, stages, trusses, tills). Every prop stands on the
 * floor at (x, z), its front towards +z before turning by ry, unless it
 * hangs on the back wall (z = BACK).
 */
import * as THREE from 'three';
import { BACK, RW, WALL_H } from '../roomGeom';
import { mat, paintingTexture, rugTexture, signTexture, tone, RUG_Y } from '../kit';
import { canvasTex, jitter, type Dresser } from './core';

const CHROME = '#c7ccd1';
const BLACK = '#1f2328';
const metal = { metal: 0.6, rough: 0.35 };

/** Local (lx, lz) of a prop at (x, z) turned ry, in the room. */
export function at(x: number, z: number, ry: number, lx: number, lz: number): [number, number] {
  const s = Math.sin(ry);
  const c = Math.cos(ry);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

// ---------------------------------------------------------------------------
// Textures

/** Out of the window: the sky and the city's towers (or trees), by day or night. */
function outsideTex(night: boolean, view: 'city' | 'trees' | 'apron') {
  return canvasTex(`dress:out:${night}:${view}`, 256, 128, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 128);
    if (night) {
      sky.addColorStop(0, '#0b1430');
      sky.addColorStop(1, '#2a3560');
    } else {
      sky.addColorStop(0, '#8cc8f0');
      sky.addColorStop(1, '#dff1fb');
    }
    g.fillStyle = sky;
    g.fillRect(0, 0, 256, 128);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) % 1000) / 1000;
    if (view === 'trees') {
      g.fillStyle = night ? '#16301f' : '#4f8a4a';
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        g.arc(i * 20 + r() * 8, 104 - r() * 18, 16 + r() * 10, 0, Math.PI * 2);
        g.fill();
      }
      g.fillRect(0, 100, 256, 28);
      return;
    }
    if (view === 'apron') {
      g.fillStyle = night ? '#1d2433' : '#9aa3ad';
      g.fillRect(0, 96, 256, 32);
      g.fillStyle = night ? '#e5e7eb' : '#f8fafc';
      g.beginPath();
      g.ellipse(128, 92, 70, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.fillRect(110, 70, 10, 22);
      return;
    }
    for (let i = 0; i < 18; i++) {
      const w = 10 + r() * 18;
      const h = 30 + r() * 80;
      const x = i * 15 - 6 + r() * 6;
      g.fillStyle = night ? '#1a2238' : `hsl(210, 12%, ${62 + r() * 18}%)`;
      g.fillRect(x, 128 - h, w, h);
      g.fillStyle = night ? 'rgba(255,214,140,0.85)' : 'rgba(255,255,255,0.35)';
      for (let y = 128 - h + 4; y < 124; y += 7)
        for (let xx = x + 2; xx < x + w - 2; xx += 5)
          if (r() > (night ? 0.55 : 0.3)) g.fillRect(xx, y, 2, 3);
    }
  });
}

/** A whiteboard's scribbles: a chart, boxes and arrows, a list. */
function whiteboardTex(seed: number) {
  return canvasTex(`dress:wb:${seed % 4}`, 256, 128, (g) => {
    g.fillStyle = '#fbfcfd';
    g.fillRect(0, 0, 256, 128);
    g.lineWidth = 3;
    g.strokeStyle = '#1d4ed8';
    const v = seed % 4;
    if (v === 0 || v === 2) {
      g.beginPath();
      g.moveTo(20, 110);
      g.lineTo(20, 20);
      g.moveTo(20, 110);
      g.lineTo(130, 110);
      g.stroke();
      g.strokeStyle = '#16a34a';
      g.beginPath();
      g.moveTo(24, 100);
      g.bezierCurveTo(60, 95, 80, 60, 125, 28);
      g.stroke();
    } else {
      g.strokeRect(20, 24, 50, 30);
      g.strokeRect(100, 24, 50, 30);
      g.strokeRect(60, 80, 50, 30);
      g.beginPath();
      g.moveTo(70, 40);
      g.lineTo(100, 40);
      g.moveTo(125, 54);
      g.lineTo(95, 80);
      g.stroke();
    }
    g.strokeStyle = '#dc2626';
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(160, 24 + i * 18);
      g.lineTo(160 + 40 + ((seed * (i + 3)) % 40), 24 + i * 18);
      g.stroke();
    }
  });
}

/** A poster or a sign's board (text on colour), cached by text. */
export function posterMat(text: string, bg: string, fg = '#ffffff') {
  const m = mat('#ffffff', { map: signTexture(text, bg, fg), rough: 0.6 });
  // (The sign texture is drawn in the top quarter of a square canvas.)
  if (m.map && m.userData.cropped !== true) {
    m.map = m.map.clone();
    m.map.repeat.set(1, 0.25);
    m.map.offset.set(0, 0.75);
    m.map.needsUpdate = true;
    m.userData.cropped = true;
  }
  return m;
}

// ---------------------------------------------------------------------------
// Walls

/** Windows along the back wall from x0 to x1 (panes ~1.4 m), sill at `sill`. */
export function windows(
  d: Dresser,
  x0: number,
  x1: number,
  o: {
    night: boolean;
    sill?: number;
    top?: number;
    view?: 'city' | 'trees' | 'apron';
    frame?: string;
  },
) {
  const sill = o.sill ?? 0.9;
  const top = d.wallTop(x0, x1, o.top ?? 2.6);
  const h = top - sill;
  const n = Math.max(1, Math.round((x1 - x0) / 1.4));
  const pw = (x1 - x0) / n;
  const out = mat('#ffffff', {
    map: outsideTex(o.night, o.view ?? 'city'),
    emissive: '#ffffff',
    emissiveIntensity: o.night ? 0.55 : 0.75,
    rough: 0.1,
  });
  (out as THREE.MeshStandardMaterial).emissiveMap = out.map;
  const frame = o.frame ?? '#d9dde2';
  const z = BACK + 0.012;
  for (let i = 0; i < n; i++) {
    const cx = x0 + pw * (i + 0.5);
    d.kit.add(new THREE.PlaneGeometry(pw - 0.08, h - 0.08), out, cx, sill + h / 2, z, {
      noShadow: true,
    });
    d.box(0.06, h, 0.05, frame, x0 + pw * i, sill, z);
  }
  d.box(0.06, h, 0.05, frame, x1, sill, z);
  d.box(x1 - x0 + 0.06, 0.06, 0.05, frame, (x0 + x1) / 2, top - 0.03, z);
  d.box(x1 - x0 + 0.16, 0.05, 0.16, tone(frame, -0.05), (x0 + x1) / 2, sill - 0.05, BACK + 0.08);
}

/** A whiteboard on the back wall (or at (x, z) on legs when `z` is given). */
export function whiteboard(d: Dresser, x: number, w = 2.0, h0 = 1.1, z?: number, ry = 0) {
  const y = 1.0;
  const h = z === undefined ? Math.min(h0, d.wallTop(x - w / 2, x + w / 2, 3) - y - 0.05) : h0;
  const zz = z ?? BACK + 0.02;
  if (z !== undefined) {
    for (const s of [-1, 1]) {
      const [lx, lz] = at(x, zz, ry, (s * w) / 2, 0);
      d.box(0.04, y + h, 0.04, CHROME, lx, 0, lz, metal);
      const [fx, fz] = at(x, zz, ry, (s * w) / 2, 0);
      d.box(0.05, 0.03, 0.5, CHROME, fx, 0.02, fz, { ...metal, ry });
    }
  }
  d.box(w + 0.06, h + 0.06, 0.03, '#b8bec6', x, y - 0.03, zz, { ...metal, ry });
  const m = mat('#ffffff', { map: whiteboardTex(Math.floor(d.rng() * 4)), rough: 0.3 });
  const [px, pz] = at(x, zz, ry, 0, 0.02);
  d.kit.add(new THREE.PlaneGeometry(w, h), m, px, y + h / 2, pz, { ry, noShadow: true });
  const [tx, tz] = at(x, zz, ry, 0, 0.05);
  d.box(w * 0.7, 0.03, 0.07, '#9ca3af', tx, y - 0.04, tz, { ry });
}

/** A pinboard of sticky notes (a stand-up wall). */
export function stickyWall(d: Dresser, x: number, w = 2.4, h = 1.2) {
  const y = 0.9;
  d.box(w, h, 0.03, '#c69c6d', x, y, BACK + 0.02, { rough: 0.95 });
  const cols = ['#fde047', '#f9a8d4', '#86efac', '#93c5fd', '#fdba74'];
  const lanes = 4;
  for (let l = 0; l < lanes; l++) {
    const lx = x - w / 2 + (w / lanes) * (l + 0.5);
    d.box(0.015, h - 0.1, 0.01, '#7c5a36', x - w / 2 + (w / lanes) * l, y + 0.05, BACK + 0.04);
    const n = 2 + Math.floor(d.rng() * 4);
    for (let i = 0; i < n; i++)
      d.bit(
        0.16,
        0.16,
        0.005,
        d.pick(cols),
        lx + (i % 2 ? 0.1 : -0.1),
        y + h - 0.32 - Math.floor(i / 2) * 0.22,
        BACK + 0.045,
        { plain: true, rz: (d.rng() - 0.5) * 0.2 },
      );
  }
}

/** A framed picture on the back wall (or a wall at x, turned). */
export function art(
  d: Dresser,
  x: number,
  y: number,
  w: number,
  h0: number,
  seed?: number,
  frame = '#2a2420',
) {
  const h = Math.min(h0, d.wallTop(x - w / 2, x + w / 2, 3) - y - 0.06);
  const s = seed ?? Math.floor(d.rng() * 40);
  d.box(w + 0.08, h + 0.08, 0.03, frame, x, y - 0.04, BACK + 0.02);
  const m = mat('#ffffff', { map: paintingTexture(s), rough: 0.8 });
  d.kit.add(new THREE.PlaneGeometry(w, h), m, x, y + h / 2, BACK + 0.04, { noShadow: true });
}

/** A poster (text on colour) on the back wall. */
export function poster(
  d: Dresser,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  bg: string,
  fg = '#fff',
) {
  // (Not over the name board.)
  if (y + h > d.wallTop(x - w / 2, x + w / 2, 3) + 0.01) {
    const top = d.wallTop(x - w / 2, x + w / 2, 3);
    if (top - h < 0.9) return;
    y = top - h;
  }
  d.kit.add(new THREE.PlaneGeometry(w, h), posterMat(text, bg, fg), x, y + h / 2, BACK + 0.025, {
    noShadow: true,
  });
}

/** A wall TV (the room's pulsing picture). */
export function wallTv(d: Dresser, x: number, y0: number, w: number, z = BACK + 0.02, ry = 0) {
  const h = w * 0.5625;
  const y = z < BACK + 0.1 ? Math.min(y0, d.wallTop(x - w / 2, x + w / 2, 3) - h - 0.05) : y0;
  d.box(w + 0.05, h + 0.05, 0.04, BLACK, x, y - 0.025, z, { ry, rough: 0.3 });
  const [sx, sz] = at(x, z, ry, 0, 0.025);
  d.screenAt(w, h, sx, y + h / 2, sz, ry);
}

/** A clock on the back wall. */
export function clock(d: Dresser, x: number, y: number) {
  d.cyl(0.18, 0.18, 0.04, '#f8fafc', x, y, BACK + 0.02, { rx: Math.PI / 2 });
  d.kit.torus(0.18, 0.015, BLACK, x, y, BACK + 0.04, {});
  d.box(0.015, 0.12, 0.01, BLACK, x, y, BACK + 0.065);
  d.box(0.09, 0.015, 0.01, BLACK, x + 0.04, y, BACK + 0.065);
}

/** Panelling along the back wall up to height h (wood, or a painted dado). */
export function wainscot(d: Dresser, h: number, color: string, x0 = -RW / 2, x1 = RW / 2) {
  d.box(x1 - x0, h, 0.03, color, (x0 + x1) / 2, 0, BACK + 0.015, { rough: 0.6 });
  d.box(x1 - x0, 0.04, 0.05, tone(color, -0.1), (x0 + x1) / 2, h, BACK + 0.025);
  const n = Math.floor((x1 - x0) / 0.9);
  for (let i = 1; i < n; i++)
    d.box(0.025, h - 0.12, 0.012, tone(color, -0.08), x0 + ((x1 - x0) / n) * i, 0.06, BACK + 0.035);
}

/** A glass partition from (x0, z0) to (x1, z1), h tall, with a frosted band and a door gap. */
export function glassWall(
  d: Dresser,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  o: { h?: number; gap?: [number, number]; frame?: string } = {},
) {
  const h = o.h ?? 2.4;
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = -Math.atan2(z1 - z0, x1 - x0);
  const frame = o.frame ?? '#3f4650';
  const seg = (a: number, b: number) => {
    if (b - a < 0.05) return;
    const [cx, cz] = at(x0, z0, ry, (a + b) / 2, 0);
    d.kit.add(new THREE.BoxGeometry(b - a, h, 0.02), d.glass, cx, h / 2, cz, {
      ry,
      noShadow: true,
    });
    d.box(b - a, 0.05, 0.06, frame, cx, 0, cz, { ry });
    d.box(b - a, 0.05, 0.06, frame, cx, h - 0.05, cz, { ry });
    d.kit.add(
      new THREE.BoxGeometry(b - a, 0.14, 0.022),
      mat('#f1f5f9', { opacity: 0.6 }),
      cx,
      1.2,
      cz,
      { ry, noShadow: true },
    );
    for (let t = a; t <= b + 0.001; t += Math.max(0.9, (b - a) / Math.ceil((b - a) / 1.2))) {
      const [mx, mz] = at(x0, z0, ry, Math.min(t, b), 0);
      d.box(0.04, h, 0.05, frame, mx, 0, mz, { ry });
    }
  };
  if (o.gap) {
    seg(0, o.gap[0]);
    seg(o.gap[1], len);
  } else seg(0, len);
}

// ---------------------------------------------------------------------------
// Furniture

/** A plant in a pot (size 1 small … 3 tall). */
export function plant(d: Dresser, x: number, z: number, size: 1 | 2 | 3 = 2) {
  const name = ['Houseplant_3', 'Houseplant_1', 'Houseplant_6'][size - 1]!;
  const h = [0.75, 1.1, 1.5][size - 1]!;
  if (d.glb(name, x, z, { w: 0.7, d: 0.7, h })) return;
  d.cyl(0.18, 0.14, 0.35, '#e7e2d6', x, 0, z);
  d.kit.sphere(0.32 + size * 0.06, '#3f7d3a', x, 0.35 + 0.25 + size * 0.12, z, { sy: 1.3 });
}

/** An office chair facing ry. */
export function officeChair(d: Dresser, x: number, z: number, ry: number, colour?: string) {
  if (
    d.glb('OfficeChair', x, z, {
      w: 0.62,
      d: 0.62,
      h: 1.0,
      ry,
      ...(colour ? { colours: { Chair: colour } } : {}),
    })
  )
    return;
  d.cyl(0.25, 0.25, 0.04, BLACK, x, 0.06, z, metal);
  d.cyl(0.03, 0.03, 0.4, CHROME, x, 0.06, z, metal);
  d.box(0.48, 0.08, 0.46, colour ?? BLACK, x, 0.42, z, { round: 0.03, ry });
  const [bx, bz] = at(x, z, ry, 0, -0.22);
  d.box(0.46, 0.6, 0.06, colour ?? BLACK, bx, 0.5, bz, { round: 0.03, ry });
}

/** A side chair (dining, plastic, wooden) facing ry. */
export function sideChair(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  kind: 'chair' | 'plastic' | 'fancy' = 'chair',
  colour?: string,
) {
  const [m, mt] =
    kind === 'plastic'
      ? ['Chair_1', 'Wood']
      : kind === 'fancy'
        ? ['Chair_2', 'Cushing']
        : ['Chair', 'Cushing'];
  if (
    d.glb(m, x, z, {
      w: 0.55,
      d: 0.55,
      h: 0.92,
      ry,
      ...(colour ? { colours: { [mt]: colour } } : {}),
    })
  )
    return;
  d.box(0.44, 0.05, 0.44, colour ?? '#6b4f3a', x, 0.44, z, { ry });
  for (const [lx, lz] of [
    [-0.18, -0.18],
    [0.18, -0.18],
    [-0.18, 0.18],
    [0.18, 0.18],
  ] as const) {
    const [px, pz] = at(x, z, ry, lx, lz);
    d.box(0.035, 0.44, 0.035, '#3f3f46', px, 0, pz);
  }
  const [bx, bz] = at(x, z, ry, 0, -0.2);
  d.box(0.44, 0.45, 0.04, colour ?? '#6b4f3a', bx, 0.48, bz, { ry });
}

/**
 * A work desk: a top on legs (`style` wood drawers, white bench or dark
 * executive), a monitor (or two, or a laptop), a keyboard and a mug, and an
 * office chair unless someone's own seat is drawn there.
 */
export function desk(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  o: {
    w?: number;
    style?: 'white' | 'wood' | 'exec' | 'glb';
    screens?: 0 | 1 | 2 | 'laptop';
    chair?: boolean;
    chairColour?: string;
  } = {},
) {
  const w = o.w ?? 1.3;
  const dd = 0.7;
  const style = o.style ?? 'white';
  const top = 0.74;
  if (style === 'glb' && d.glb('Desk', x, z, { w, d: dd, hTo: top, ry })) {
    // (The model's own top.)
  } else {
    const tc = style === 'wood' ? '#a87b4f' : style === 'exec' ? '#3b2a20' : '#f1f1ef';
    d.box(w, 0.035, dd, tc, x, top - 0.035, z, {
      ry,
      round: 0.008,
      rough: style === 'exec' ? 0.35 : 0.6,
    });
    if (style === 'white') {
      for (const s of [-1, 1]) {
        const [lx, lz] = at(x, z, ry, s * (w / 2 - 0.05), 0);
        d.box(0.05, top - 0.035, dd - 0.1, '#5b6370', lx, 0, lz, { ry, ...metal });
      }
      const [px, pz] = at(x, z, ry, 0, -dd / 2 + 0.06);
      d.box(w - 0.12, 0.32, 0.02, '#cfd4da', px, 0.36, pz, { ry });
    } else {
      const [px, pz] = at(x, z, ry, -w / 2 + 0.22, 0);
      d.box(0.4, top - 0.035, dd - 0.06, tone(tc, -0.06), px, 0, pz, { ry });
      const [qx, qz] = at(x, z, ry, w / 2 - 0.04, 0);
      d.box(0.05, top - 0.035, dd - 0.06, tone(tc, -0.06), qx, 0, qz, { ry });
      const [rx, rz] = at(x, z, ry, 0, -dd / 2 + 0.03);
      d.box(w - 0.1, 0.45, 0.025, tone(tc, -0.08), rx, 0.25, rz, { ry });
    }
  }
  const scr = o.screens ?? 1;
  if (scr === 'laptop') {
    const [lx, lz] = at(x, z, ry, 0, 0.02);
    d.box(0.34, 0.015, 0.24, '#9aa1a9', lx, top, lz, { ry, ...metal });
    const [sx, sz] = at(x, z, ry, 0, -0.1);
    d.box(0.34, 0.22, 0.012, '#9aa1a9', sx, top + 0.01, sz, { ry: ry, rx: -0.25, ...metal });
    const [px, pz] = at(x, z, ry, 0, -0.088);
    d.screenAt(0.3, 0.18, px, top + 0.12, pz, ry);
  } else if (scr) {
    const offs = scr === 2 ? [-0.29, 0.29] : [0];
    for (const ox of offs) {
      const turn = scr === 2 ? -ox * 0.5 : 0;
      const [bx, bz] = at(x, z, ry, ox, -0.2);
      d.box(0.2, 0.012, 0.14, BLACK, bx, top, bz, { ry });
      d.box(0.04, 0.2, 0.03, BLACK, bx, top, bz, { ry });
      d.box(0.56, 0.34, 0.03, BLACK, bx, top + 0.14, bz, { ry: ry + turn, round: 0.005 });
      const [sx, sz] = at(x, z, ry, ox + Math.sin(turn) * 0.02, -0.183);
      d.screenAt(0.52, 0.3, sx, top + 0.31, sz, ry + turn);
    }
    const [kx, kz] = at(x, z, ry, 0, 0.08);
    d.box(0.42, 0.015, 0.13, '#2b2f36', kx, top, kz, { ry });
    const [mx, mz] = at(x, z, ry, 0.32, 0.1);
    d.box(0.06, 0.02, 0.1, '#2b2f36', mx, top, mz, { ry });
  }
  // A mug, a notebook, a lamp or a plant: one or two things of their own.
  const [cx, cz] = at(x, z, ry, -w / 2 + 0.16, 0.05);
  const r = d.rng();
  if (r < 0.4) d.can(0.04, 0.1, d.pick(['#f8fafc', '#ef4444', '#0ea5e9', '#f59e0b']), cx, top, cz);
  else if (r < 0.7)
    d.bit(0.21, 0.02, 0.28, d.pick(['#1e3a8a', '#7f1d1d', '#14532d', '#1f2937']), cx, top, cz, {
      ry: ry + 0.3,
      plain: true,
    });
  else {
    d.cyl(0.05, 0.04, 0.09, '#e7e2d6', cx, top, cz);
    d.kit.sphere(0.08, '#3f7d3a', cx, top + 0.14, cz, { sy: 1.2 });
  }
  if (o.chair !== false) {
    const [ox, oz] = at(x, z, ry, 0, 0.55);
    officeChair(d, ox, oz, ry + Math.PI + (d.rng() - 0.5) * 0.6, o.chairColour);
  }
}

/** A long table (a boardroom's, a meeting room's) with chairs round it. */
export function boardTable(
  d: Dresser,
  x: number,
  z: number,
  w: number,
  dd: number,
  o: {
    ry?: number;
    top?: string;
    chairs?: 'office' | 'fancy' | 'none';
    ends?: boolean;
    skip?: (x: number, z: number) => boolean;
    chairColour?: string;
  } = {},
) {
  const ry = o.ry ?? 0;
  const top = o.top ?? '#4a3426';
  d.box(w, 0.05, dd, top, x, 0.7, z, { ry, round: 0.02, rough: 0.3 });
  for (const s of [-1, 1]) {
    const [lx, lz] = at(x, z, ry, s * (w / 2 - 0.35), 0);
    d.box(0.12, 0.7, dd * 0.6, tone(top, -0.12), lx, 0, lz, { ry });
  }
  if (o.chairs === 'none') return;
  const n = Math.max(1, Math.floor(w / 0.75));
  const place = (lx: number, lz: number, face: number) => {
    const [cx, cz] = at(x, z, ry, lx, lz);
    if (o.skip?.(cx, cz)) return;
    if (o.chairs === 'fancy') sideChair(d, cx, cz, ry + face, 'fancy', o.chairColour);
    else officeChair(d, cx, cz, ry + face + (d.rng() - 0.5) * 0.3, o.chairColour);
  };
  for (let i = 0; i < n; i++) {
    const lx = -w / 2 + (w / n) * (i + 0.5);
    place(lx, dd / 2 + 0.35, Math.PI);
    place(lx, -dd / 2 - 0.35, 0);
  }
  if (o.ends) {
    place(-w / 2 - 0.4, 0, Math.PI / 2);
    place(w / 2 + 0.4, 0, -Math.PI / 2);
  }
  // Papers, a jug and glasses.
  for (let i = 0; i < n; i++) {
    const [px, pz] = at(x, z, ry, -w / 2 + (w / n) * (i + 0.5), dd / 2 - 0.2);
    d.bit(0.22, 0.01, 0.3, '#f8fafc', px, 0.75, pz, { ry, plain: true });
  }
  d.can(0.06, 0.22, '#dbeafe', x, 0.75, z);
}

/** A sofa (CC0 model, recoloured), its back towards -z turned ry. */
export function sofa(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  w = 2.0,
  colour = '#6f7a86',
  kind: 'sofa' | 'couch' | 'small' | 'L' = 'sofa',
) {
  const m =
    kind === 'couch'
      ? 'Couch_Medium1'
      : kind === 'small'
        ? 'Couch_Small1'
        : kind === 'L'
          ? 'Couch_L'
          : 'Sofa';
  if (
    d.glb(m, x, z, {
      w,
      d: kind === 'L' ? w * 0.75 : 0.95,
      ry,
      colours: {
        Couch_Blue: colour,
        Sofa: colour,
        Couch_Beige: colour,
        Couch_BeigeDark: tone(colour, -0.1),
        Legs: '#2a1d14',
      },
    })
  )
    return;
  d.box(w, 0.42, 0.85, colour, x, 0.05, z, { ry, round: 0.06 });
  const [bx, bz] = at(x, z, ry, 0, -0.33);
  d.box(w, 0.45, 0.2, tone(colour, -0.05), bx, 0.42, bz, { ry, round: 0.06 });
}

/** An armchair. */
export function armchair(d: Dresser, x: number, z: number, ry: number, colour = '#8a6e57') {
  if (d.glb('Sofa_individual', x, z, { w: 0.85, d: 0.85, ry, colours: { Sofa: colour } })) return;
  d.box(0.8, 0.42, 0.8, colour, x, 0.05, z, { ry, round: 0.06 });
  const [bx, bz] = at(x, z, ry, 0, -0.3);
  d.box(0.8, 0.42, 0.2, tone(colour, -0.05), bx, 0.42, bz, { ry, round: 0.06 });
}

/** A low coffee table. */
export function coffeeTable(
  d: Dresser,
  x: number,
  z: number,
  w = 0.9,
  dd = 0.55,
  ry = 0,
  colour = '#5b4636',
) {
  d.box(w, 0.04, dd, colour, x, 0.38, z, { ry, round: 0.015, rough: 0.35 });
  d.box(w - 0.1, 0.02, dd - 0.1, tone(colour, -0.1), x, 0.12, z, { ry });
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const [lx, lz] = at(x, z, ry, sx * (w / 2 - 0.05), sz * (dd / 2 - 0.05));
    d.box(0.035, 0.38, 0.035, tone(colour, -0.15), lx, 0, lz);
  }
  d.bit(0.24, 0.02, 0.3, d.pick(['#be123c', '#0f766e', '#1e3a8a']), x - w * 0.2, 0.42, z, {
    ry: ry + 0.2,
    plain: true,
  });
}

/** A rug (flush on the floor). */
export function rug(
  d: Dresser,
  x: number,
  z: number,
  w: number,
  dd: number,
  colour: string,
  ry = 0,
) {
  const m = mat('#ffffff', { map: rugTexture(d.tier, colour), rough: 0.95 });
  d.kit.add(new THREE.PlaneGeometry(w, dd), m, x, RUG_Y, z, {
    rx: -Math.PI / 2,
    rz: ry,
    noShadow: true,
  });
}

/** A bookcase of books (w wide, h tall), its back to -z turned ry. */
export function bookcase(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  w = 1.2,
  h = 2.0,
  wood = '#6b4a33',
  fill = 0.85,
) {
  const dd = 0.34;
  const shelves = Math.max(3, Math.round(h / 0.4));
  const [bx, bz] = at(x, z, ry, 0, -dd / 2 + 0.01);
  d.box(w, h, 0.02, tone(wood, -0.1), bx, 0, bz, { ry });
  for (const s of [-1, 1]) {
    const [sx, sz] = at(x, z, ry, s * (w / 2 - 0.015), 0);
    d.box(0.03, h, dd, wood, sx, 0, sz, { ry });
  }
  const step = h / shelves;
  const cols = [
    '#7f1d1d',
    '#1e3a8a',
    '#14532d',
    '#78350f',
    '#334155',
    '#a16207',
    '#6b21a8',
    '#e7e5e4',
    '#0f766e',
  ];
  for (let i = 0; i <= shelves; i++) {
    const y = Math.min(h - 0.03, i * step);
    d.box(w - 0.04, 0.03, dd, wood, x, y, z, { ry });
    if (i === shelves) break;
    let t = -w / 2 + 0.05;
    while (t < w / 2 - 0.08) {
      const bw = 0.03 + d.rng() * 0.04;
      if (d.rng() > fill) {
        t += 0.12;
        continue;
      }
      const bh = step * (0.55 + d.rng() * 0.3);
      const [px, pz] = at(x, z, ry, t + bw / 2, 0.02);
      d.bit(bw, bh, 0.22, jitter(d, d.pick(cols), 0.06), px, y + 0.03, pz, {
        ry,
        plain: true,
        rz: d.rng() < 0.06 ? 0.25 : 0,
      });
      t += bw + 0.004;
    }
  }
}

/**
 * Shop shelving: uprights, a back and `levels` shelves, filled by `stock`
 * (called per shelf with its height, the space up to the next and the run).
 */
export function shelving(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  w: number,
  h: number,
  dd: number,
  levels: number,
  o: { frame?: string; shelf?: string; back?: string; both?: boolean; header?: string },
  stock: (lx0: number, lx1: number, y: number, room: number, lz: number, depth: number) => void,
) {
  const frame = o.frame ?? '#d6d9dd';
  const shelf = o.shelf ?? '#eceef0';
  const [bx, bz] = at(x, z, ry, 0, o.both ? 0 : -dd / 2 + 0.01);
  d.box(w, h, 0.02, o.back ?? '#f4f5f6', bx, 0, bz, { ry });
  for (const s of [-1, 1]) {
    const [sx, sz] = at(x, z, ry, s * (w / 2 - 0.02), 0);
    d.box(0.04, h, dd, frame, sx, 0, sz, { ry, ...metal });
  }
  const [kx, kz] = at(x, z, ry, 0, 0);
  d.box(w, 0.12, dd, tone(frame, -0.25), kx, 0, kz, { ry });
  const step = (h - 0.12) / levels;
  for (let i = 0; i < levels; i++) {
    const y = 0.12 + i * step;
    d.box(w - 0.04, 0.025, dd, shelf, kx, y, kz, { ry });
    const sides = o.both ? [dd / 4, -dd / 4] : [0.02];
    for (const lz of sides)
      stock(
        -w / 2 + 0.05,
        w / 2 - 0.05,
        y + 0.025,
        step - 0.05,
        lz,
        o.both ? dd / 2 - 0.04 : dd - 0.06,
      );
    // A price strip.
    const [ex, ez] = at(x, z, ry, 0, dd / 2 + 0.005);
    d.box(w - 0.06, 0.035, 0.008, '#fafafa', ex, y - 0.01, ez, { ry, noShadow: true });
  }
  if (o.header) {
    const [hx, hz] = at(x, z, ry, 0, -dd / 2 + 0.03);
    d.kit.add(
      new THREE.PlaneGeometry(w * 0.9, 0.22),
      posterMat(o.header, '#0f766e'),
      hx,
      h + 0.14,
      hz + 0.0,
      { ry, noShadow: true },
    );
  }
}

/** Packs on a shelf: rows of boxes of one product, then the next (facings). */
export function packs(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  palette: readonly string[],
  o: {
    tall?: [number, number];
    wide?: [number, number];
    gap?: number;
    fill?: number;
    kind?: 'box' | 'can' | 'bottle' | 'jar' | 'folded' | 'mixed';
  } = {},
) {
  return (lx0: number, lx1: number, y: number, room: number, lz: number, depth: number) => {
    let t = lx0;
    while (t < lx1 - 0.05) {
      const kind =
        o.kind === 'mixed'
          ? d.pick(['box', 'box', 'can', 'bottle', 'jar'] as const)
          : (o.kind ?? 'box');
      const colour = d.pick(palette);
      const facings = 1 + Math.floor(d.rng() * 4);
      const tall = o.tall ?? [0.12, 0.3];
      const h = Math.min(room - 0.02, tall[0] + d.rng() * (tall[1] - tall[0]));
      const wide = o.wide ?? [0.06, 0.16];
      const pw = wide[0] + d.rng() * (wide[1] - wide[0]);
      if (d.rng() > (o.fill ?? 0.92)) {
        t += pw * facings;
        continue;
      }
      const deep = Math.max(1, Math.min(2, Math.floor(depth / 0.18)));
      for (let f = 0; f < facings && t + pw < lx1; f++) {
        for (let k = 0; k < deep; k++) {
          const [px, pz] = at(x, z, ry, t + pw / 2, lz + depth / 2 - pw / 2 - k * (depth / deep));
          const c = jitter(d, colour, 0.04);
          if (kind === 'can') d.can(pw * 0.42, Math.min(h, 0.14), c, px, y, pz);
          else if (kind === 'bottle') {
            d.can(pw * 0.36, h * 0.75, c, px, y, pz);
            d.can(pw * 0.14, h * 0.25, c, px, y + h * 0.75, pz);
          } else if (kind === 'jar') d.can(pw * 0.45, Math.min(h, 0.16), c, px, y, pz);
          else if (kind === 'folded')
            d.bit(pw * 1.6, 0.06, depth * 0.8, c, px, y + 0.065 * k, pz, { ry, plain: true });
          else d.bit(pw - 0.008, h, Math.min(depth / deep - 0.01, 0.2), c, px, y, pz, { ry });
          if (kind === 'folded') break;
        }
        t += pw + (o.gap ?? 0.004);
      }
      t += 0.01;
    }
  };
}

/** A drinks fridge: glass doors, lit shelves of bottles and cans. */
export function drinksFridge(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  w = 1.2,
  body = '#e5e7eb',
) {
  const h = 1.95;
  const dd = 0.65;
  const [bx, bz] = at(x, z, ry, 0, -dd / 2 + 0.03);
  d.box(w, h, 0.05, '#cbd5e1', bx, 0, bz, { ry });
  for (const s of [-1, 1]) {
    const [sx, sz] = at(x, z, ry, s * (w / 2 - 0.03), 0);
    d.box(0.06, h, dd, body, sx, 0, sz, { ry });
  }
  d.box(w, 0.18, dd, body, x, 0, z, { ry });
  d.box(w, 0.22, dd, tone(body, -0.1), x, h - 0.22, z, { ry });
  const [hx, hz] = at(x, z, ry, 0, dd / 2 + 0.002);
  d.kit.add(
    new THREE.PlaneGeometry(w * 0.85, 0.16),
    posterMat('COLD DRINKS', '#b91c1c'),
    hx,
    h - 0.11,
    hz,
    { ry, noShadow: true },
  );
  const glow = mat('#f8fafc', { emissive: '#e0f2fe', emissiveIntensity: 0.5 });
  const [gx, gz] = at(x, z, ry, 0, -dd / 2 + 0.06);
  d.kit.add(new THREE.PlaneGeometry(w - 0.12, h - 0.42), glow, gx, 0.18 + (h - 0.42) / 2, gz, {
    ry,
    noShadow: true,
  });
  const cols = ['#dc2626', '#16a34a', '#f59e0b', '#1d4ed8', '#7c2d12', '#e5e7eb', '#0891b2'];
  for (let i = 0; i < 4; i++) {
    const y = 0.2 + i * 0.4;
    d.box(w - 0.12, 0.02, dd - 0.1, '#d1d5db', x, y, z, { ry });
    packs(d, x, z, ry, cols, {
      kind: i % 2 ? 'can' : 'bottle',
      tall: [0.22, 0.3],
      wide: [0.07, 0.08],
      fill: 1,
    })(-w / 2 + 0.08, w / 2 - 0.08, y + 0.02, 0.36, -0.05, dd - 0.2);
  }
  const doors = Math.max(1, Math.round(w / 0.6));
  for (let i = 0; i < doors; i++) {
    const [dx, dz] = at(x, z, ry, -w / 2 + (w / doors) * (i + 0.5), dd / 2);
    d.kit.add(
      new THREE.BoxGeometry(w / doors - 0.02, h - 0.42, 0.02),
      d.glass,
      dx,
      0.18 + (h - 0.42) / 2,
      dz,
      { ry, noShadow: true },
    );
    const [px, pz] = at(x, z, ry, -w / 2 + (w / doors) * (i + 1) - 0.06, dd / 2 + 0.03);
    d.box(0.025, 0.6, 0.025, CHROME, px, 0.8, pz, metal);
  }
}

/** A shop counter with a till, a card machine and a few things by the till. */
export function counter(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  w: number,
  o: { body?: string; top?: string; till?: boolean; glass?: boolean; front?: string } = {},
) {
  const dd = 0.62;
  const body = o.body ?? '#7c5a3c';
  if (o.glass) {
    d.box(w, 0.25, dd, body, x, 0, z, { ry });
    d.kit.add(new THREE.BoxGeometry(w - 0.04, 0.7, dd - 0.04), d.glass, x, 0.6, z, {
      ry,
      noShadow: true,
    });
    d.box(w, 0.04, dd, o.top ?? '#e5e7eb', x, 0.95, z, { ry });
    for (const s of [-1, 1]) {
      const [sx, sz] = at(x, z, ry, s * (w / 2 - 0.02), 0);
      d.box(0.04, 0.7, dd, CHROME, sx, 0.25, sz, { ry, ...metal });
    }
    d.box(w - 0.06, 0.02, dd - 0.08, '#f8fafc', x, 0.55, z, { ry });
  } else {
    d.box(w, 0.92, dd, body, x, 0, z, { ry, round: 0.01 });
    d.box(w + 0.04, 0.05, dd + 0.06, o.top ?? '#2b2f36', x, 0.92, z, { ry, rough: 0.3 });
    if (o.front) {
      const [fx, fz] = at(x, z, ry, 0, dd / 2 + 0.006);
      d.kit.add(
        new THREE.PlaneGeometry(w * 0.8, 0.3),
        posterMat(o.front, tone(body, -0.15)),
        fx,
        0.55,
        fz,
        { ry, noShadow: true },
      );
    } else {
      const [kx, kz] = at(x, z, ry, 0, dd / 2 - 0.005);
      d.box(w - 0.1, 0.06, 0.02, tone(body, -0.15), kx, 0.08, kz, { ry });
    }
  }
  if (o.till !== false) {
    const [tx, tz] = at(x, z, ry, w / 2 - 0.35, -0.05);
    d.box(0.36, 0.1, 0.32, '#2b2f36', tx, 0.97, tz, { ry });
    d.box(0.05, 0.16, 0.05, '#2b2f36', tx, 1.07, tz, { ry });
    d.box(0.3, 0.2, 0.03, '#2b2f36', tx, 1.18, tz, { ry: ry + Math.PI, rx: 0.2 });
    const [sx, sz] = at(x, z, ry, w / 2 - 0.35, -0.034);
    d.screenAt(0.26, 0.16, sx, 1.28, sz, ry + Math.PI);
    const [cx, cz] = at(x, z, ry, w / 2 - 0.75, 0.12);
    d.box(0.08, 0.03, 0.15, '#111827', cx, 0.97, cz, { ry: ry + 0.2 });
    const [px, pz] = at(x, z, ry, -w / 2 + 0.3, 0.05);
    for (let i = 0; i < 6; i++)
      d.bit(
        0.07,
        0.12,
        0.05,
        d.pick(['#ef4444', '#f59e0b', '#22c55e', '#3b82f6']),
        px + (i % 3) * 0.08,
        0.97,
        pz + Math.floor(i / 3) * 0.08,
        { ry },
      );
  }
}

/** A magazine rack: stepped, tilted tiers of covers (and papers below). */
export function magazineRack(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  w = 1.4,
  tiers = 5,
  frame = '#5b4636',
) {
  const dd = 0.5;
  const [bx, bz] = at(x, z, ry, 0, -dd / 2 + 0.02);
  d.box(w, 0.35 + tiers * 0.28, 0.03, tone(frame, -0.1), bx, 0, bz, { ry });
  for (const s of [-1, 1]) {
    const [sx, sz] = at(x, z, ry, s * (w / 2 - 0.02), 0);
    d.box(0.04, 0.35 + tiers * 0.28, dd, frame, sx, 0, sz, { ry });
  }
  const covers = [
    '#dc2626',
    '#1d4ed8',
    '#f59e0b',
    '#16a34a',
    '#db2777',
    '#0f172a',
    '#7c3aed',
    '#f8fafc',
    '#0891b2',
  ];
  for (let i = 0; i < tiers; i++) {
    const y = 0.35 + i * 0.28;
    const lz = dd / 2 - 0.08 - i * ((dd - 0.15) / tiers);
    const [rx, rz] = at(x, z, ry, 0, lz + 0.03);
    d.box(w - 0.06, 0.04, 0.03, frame, rx, y - 0.02, rz, { ry });
    const n = Math.floor((w - 0.1) / 0.23);
    for (let k = 0; k < n; k++) {
      const [mx, mz] = at(x, z, ry, -w / 2 + 0.08 + k * 0.23 + 0.1, lz);
      d.bit(0.2, 0.27, 0.012, d.pick(covers), mx, y, mz, { ry, rx: -0.28 });
    }
  }
  // Papers folded on the bottom ledge.
  for (let k = 0; k < Math.floor(w / 0.32); k++) {
    const [px, pz] = at(x, z, ry, -w / 2 + 0.2 + k * 0.32, dd / 2 - 0.15);
    for (let s = 0; s < 4; s++)
      d.bit(0.28, 0.012, 0.36, s % 2 ? '#e7e5e4' : '#f5f5f4', px, 0.05 + s * 0.012, pz, {
        ry,
        plain: true,
      });
  }
}

/** A stack of newspapers on a low stand. */
export function paperStand(d: Dresser, x: number, z: number, ry = 0) {
  d.box(0.7, 0.45, 0.5, '#7c5a3c', x, 0, z, { ry });
  for (let k = 0; k < 2; k++) {
    const [px, pz] = at(x, z, ry, k ? 0.16 : -0.16, 0);
    for (let s = 0; s < 8; s++)
      d.bit(0.3, 0.012, 0.42, s % 3 ? '#efeeea' : '#e2e0da', px, 0.45 + s * 0.012, pz, {
        ry: ry + (d.rng() - 0.5) * 0.08,
        plain: true,
      });
  }
  const [hx, hz] = at(x, z, ry, 0, 0.256);
  d.kit.add(new THREE.PlaneGeometry(0.6, 0.3), posterMat('TODAY', '#111827'), hx, 0.24, hz, {
    ry,
    noShadow: true,
  });
}

/** A kitchen corner along the back wall from x0 to x1: units, a sink, a fridge, a coffee machine and wall cupboards. */
export function kitchenette(
  d: Dresser,
  x0: number,
  x1: number,
  o: { colour?: string; fridge?: boolean; cooler?: boolean } = {},
) {
  const colour = o.colour ?? '#e7e2d6';
  const unit = 0.6;
  const fridge = o.fridge !== false;
  const end = fridge ? x1 - 0.72 : x1;
  const n = Math.max(1, Math.floor((end - x0) / unit));
  const z = BACK + 0.31;
  const order = ['Kitchen_2Drawers', 'Kitchen_Sink', 'Kitchen_Cabinet1', 'Kitchen_2Drawers'];
  let ok = true;
  for (let i = 0; i < n; i++) {
    const cx = x0 + unit * (i + 0.5);
    if (
      !d.glb(order[i % order.length]!, cx, z, {
        w: unit,
        d: 0.6,
        hTo: 0.9,
        colours: { Kitchen: colour },
      })
    )
      ok = false;
  }
  if (!ok) {
    d.box(n * unit, 0.88, 0.6, colour, x0 + (n * unit) / 2, 0, z);
    d.box(n * unit + 0.02, 0.04, 0.62, '#3b3f45', x0 + (n * unit) / 2, 0.88, z);
  }
  // Wall cupboards and a splashback.
  d.box(n * unit, 0.6, 0.012, '#eef0f2', x0 + (n * unit) / 2, 0.92, BACK + 0.008);
  d.box(n * unit, 0.65, 0.34, colour, x0 + (n * unit) / 2, 1.55, BACK + 0.17, { round: 0.01 });
  for (let i = 1; i < n; i++)
    d.box(0.01, 0.6, 0.01, tone(colour, -0.15), x0 + unit * i, 1.57, BACK + 0.345);
  // A coffee machine, a kettle, cups.
  const cm = x0 + unit * (n - 0.5);
  d.box(0.28, 0.38, 0.32, '#1f2328', cm, 0.92, BACK + 0.3, { round: 0.02 });
  d.box(0.2, 0.06, 0.12, CHROME, cm, 1.16, BACK + 0.47, metal);
  d.can(0.08, 0.2, '#e5e7eb', x0 + 0.35, 0.92, BACK + 0.3);
  for (let i = 0; i < 3; i++)
    d.can(
      0.035,
      0.09,
      d.pick(['#f8fafc', '#fca5a5', '#93c5fd']),
      x0 + 0.7 + i * 0.09,
      0.92,
      BACK + 0.42,
    );
  if (fridge && !d.glb('Kitchen_Fridge', x1 - 0.36, BACK + 0.36, { w: 0.68, d: 0.68, h: 1.85 })) {
    d.box(0.66, 1.85, 0.64, '#e5e7eb', x1 - 0.36, 0, BACK + 0.34, { round: 0.03 });
  }
  d.claim({ x0, z0: BACK, x1, z1: BACK + 0.75 });
}

/** A water cooler. */
export function waterCooler(d: Dresser, x: number, z: number) {
  d.box(0.32, 0.95, 0.32, '#e5e7eb', x, 0, z, { round: 0.02 });
  d.can(0.14, 0.42, '#7dd3fc', x, 0.95, z);
  d.box(0.08, 0.06, 0.04, '#3b82f6', x - 0.06, 0.72, z + 0.17);
}

/** A big office printer. */
export function printer(d: Dresser, x: number, z: number, ry = 0) {
  d.box(0.6, 0.85, 0.55, '#e5e7eb', x, 0, z, { ry, round: 0.02 });
  d.box(0.56, 0.18, 0.5, '#d1d5db', x, 0.85, z, { ry, round: 0.02 });
  const [px, pz] = at(x, z, ry, 0.1, 0.2);
  d.box(0.25, 0.03, 0.2, '#f8fafc', px, 1.03, pz, { ry });
  const [sx, sz] = at(x, z, ry, -0.18, 0.22);
  d.box(0.14, 0.08, 0.06, '#334155', sx, 1.0, sz, { ry });
  const [fx, fz] = at(x, z, ry, 0, 0.276);
  for (let i = 0; i < 3; i++) d.box(0.5, 0.008, 0.02, '#9ca3af', fx, 0.2 + i * 0.2, fz, { ry });
}

/** Filing cabinets (n side by side). */
export function filing(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  n = 2,
  colour = '#9ca3af',
  h = 1.3,
) {
  for (let i = 0; i < n; i++) {
    const [cx, cz] = at(x, z, ry, (i - (n - 1) / 2) * 0.47, 0);
    d.box(0.45, h, 0.6, colour, cx, 0, cz, { ry, ...metal });
    const drawers = Math.round(h / 0.33);
    for (let k = 0; k < drawers; k++) {
      const [hx, hz] = at(cx, cz, ry, 0, 0.305);
      d.box(0.42, 0.01, 0.01, tone(colour, -0.2), hx, (k + 1) * (h / drawers) - 0.02, hz, { ry });
      d.box(0.14, 0.025, 0.02, CHROME, hx, (k + 0.6) * (h / drawers), hz, { ry, ...metal });
    }
  }
}

/** A flag on a pole (stripes across, top to bottom along the cloth). */
export function flag(d: Dresser, x: number, z: number, stripes: readonly string[]) {
  d.cyl(0.18, 0.2, 0.06, '#9ca3af', x, 0, z, metal);
  d.cyl(0.02, 0.02, 2.4, '#d4af37', x, 0, z, { metal: 0.8, rough: 0.3 });
  d.kit.sphere(0.04, '#d4af37', x, 2.43, z, { metal: 0.8, rough: 0.3 });
  const w = 0.75 / stripes.length;
  stripes.forEach((c, i) =>
    d.box(w, 0.6, 0.012, c, x + 0.03 + w * (i + 0.5), 1.72, z, { rz: 0, ry: 0 }),
  );
}

/** A tall pillar. */
export function column(d: Dresser, x: number, z: number, colour = '#e7e2d6', round = true) {
  if (round) d.cyl(0.22, 0.22, WALL_H, colour, x, 0, z, { seg: 20 });
  else d.box(0.45, WALL_H, 0.45, colour, x, 0, z);
  d.box(0.56, 0.12, 0.56, tone(colour, -0.08), x, 0, z);
}

/** A bench or bank of chairs joined on a beam (a waiting area), n seats facing ry. */
export function beamSeats(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  n: number,
  colour = '#334155',
) {
  const w = n * 0.55;
  d.box(w, 0.06, 0.08, '#6b7280', x, 0.32, z, { ry, ...metal });
  for (const s of [-1, 1]) {
    const [lx, lz] = at(x, z, ry, s * (w / 2 - 0.15), 0);
    d.box(0.05, 0.32, 0.45, '#6b7280', lx, 0, lz, { ry, ...metal });
  }
  for (let i = 0; i < n; i++) {
    const [cx, cz] = at(x, z, ry, -w / 2 + 0.275 + i * 0.55, 0.02);
    d.box(0.48, 0.06, 0.44, colour, cx, 0.4, cz, { ry, round: 0.02 });
    const [bx, bz] = at(x, z, ry, -w / 2 + 0.275 + i * 0.55, -0.2);
    d.box(0.48, 0.45, 0.05, colour, bx, 0.46, bz, { ry, round: 0.02, rx: -0.1 });
  }
}

/** A queue barrier: posts and a belt. */
export function queuePosts(d: Dresser, pts: [number, number][], belt = '#991b1b') {
  for (const [x, z] of pts) {
    d.cyl(0.16, 0.16, 0.03, '#a8a29e', x, 0, z, metal);
    d.cyl(0.03, 0.03, 0.95, '#d6d3d1', x, 0, z, metal);
  }
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]!;
    const [bx, bz] = pts[i]!;
    const len = Math.hypot(bx - ax, bz - az);
    d.box(len, 0.05, 0.015, belt, (ax + bx) / 2, 0.85, (az + bz) / 2, {
      ry: -Math.atan2(bz - az, bx - ax),
    });
  }
}

/** A ceiling fan hung over (x, z). */
export function ceilingFan(d: Dresser, x: number, z: number) {
  d.cyl(0.015, 0.015, 0.4, '#3f3f46', x, WALL_H - 0.45, z);
  d.cyl(0.1, 0.1, 0.1, '#f5f5f4', x, WALL_H - 0.55, z);
  for (let i = 0; i < 3; i++)
    d.box(
      0.6,
      0.01,
      0.12,
      '#a8a29e',
      x + Math.cos((i * 2 * Math.PI) / 3) * 0.35,
      WALL_H - 0.5,
      z - Math.sin((i * 2 * Math.PI) / 3) * 0.35,
      { ry: (i * 2 * Math.PI) / 3 },
    );
}

/** A beanbag. */
export function beanbag(d: Dresser, x: number, z: number, colour: string) {
  d.kit.sphere(0.38, colour, x, 0.24, z, { sy: 0.62, seg: 14, rough: 0.9 });
  d.kit.sphere(0.25, tone(colour, -0.05), x, 0.36, z - 0.16, { sy: 0.8, seg: 12, rough: 0.9 });
}

/** A low stage, with steps at one end and a skirt. */
export function stagePlatform(
  d: Dresser,
  x: number,
  z: number,
  w: number,
  dd: number,
  h = 0.45,
  colour = '#1f2937',
  top = '#3b2f2a',
) {
  d.box(w, h - 0.03, dd, colour, x, 0, z);
  d.box(w + 0.04, 0.03, dd + 0.04, top, x, h - 0.03, z, { rough: 0.4 });
  for (let i = 0; i < 2; i++)
    d.box(
      0.9,
      (h * (i + 1)) / 3,
      0.3,
      colour,
      x + w / 2 - 0.55,
      0,
      z + dd / 2 + 0.15 + (1 - i) * 0.3,
    );
  d.claim(Dresser_rect(x, z + 0.3, w, dd + 0.6));
}
const Dresser_rect = (x: number, z: number, w: number, dd: number) => ({
  x0: x - w / 2,
  z0: z - dd / 2,
  x1: x + w / 2,
  z1: z + dd / 2,
});

/** A lectern (with the logo panel in `colour`). */
export function lectern(d: Dresser, x: number, z: number, y = 0, colour = '#0f766e', ry = 0) {
  d.box(0.55, 1.05, 0.45, '#3b2f2a', x, y, z, { ry, round: 0.01 });
  d.box(0.62, 0.05, 0.5, '#2a211d', x, y + 1.05, z - 0.02, { ry, rx: -0.2 });
  const [px, pz] = at(x, z, ry, 0, 0.23);
  d.box(0.4, 0.4, 0.01, colour, px, y + 0.5, pz, { ry });
  const [mx, mz] = at(x, z, ry, 0.12, 0.1);
  d.cyl(0.006, 0.006, 0.3, BLACK, mx, y + 1.08, mz, { rx: 0.4 });
}

/** A lighting truss over a stage: two towers and a top beam with spot cans. */
export function truss(d: Dresser, x: number, z: number, w: number, h = 2.75, cans = 6) {
  const piece = (cx: number, cy: number, cz: number, len: number, vertical: boolean) => {
    const o = vertical ? {} : { rz: Math.PI / 2 };
    for (const [ox, oz] of [
      [-0.12, -0.12],
      [0.12, -0.12],
      [-0.12, 0.12],
      [0.12, 0.12],
    ] as const) {
      if (vertical) d.cyl(0.018, 0.018, len, '#9ca3af', cx + ox, cy, cz + oz, { ...metal, seg: 6 });
      else
        d.cyl(0.018, 0.018, len, '#9ca3af', cx + len / 2, cy + ox + 0.12, cz + oz, {
          ...metal,
          ...o,
          seg: 6,
        });
    }
    const n = Math.floor(len / 0.3);
    for (let i = 0; i < n; i++)
      if (vertical)
        d.box(0.25, 0.012, 0.012, '#9ca3af', cx, cy + i * 0.3 + 0.15, cz - 0.12, {
          ...metal,
          rz: 0.8,
        });
      else
        d.box(
          0.012,
          0.25,
          0.012,
          '#9ca3af',
          cx - len / 2 + i * 0.3 + 0.15 + len / 2,
          cy,
          cz - 0.12,
          { ...metal, rz: 0.8 },
        );
  };
  piece(x - w / 2, 0, z, h, true);
  piece(x + w / 2, 0, z, h, true);
  piece(x - w / 2, h - 0.24, z, w, false);
  for (let i = 0; i < cans; i++) {
    const cx = x - w / 2 + (w / (cans + 1)) * (i + 1);
    d.cyl(0.07, 0.09, 0.22, BLACK, cx, h - 0.5, z + 0.18, { rx: 0.6 });
    d.kit.add(
      new THREE.CircleGeometry(0.07, 12),
      mat('#fff7d6', { emissive: '#fff1b8', emissiveIntensity: 1.2 }),
      cx,
      h - 0.42,
      z + 0.31,
      { rx: 0.6 + Math.PI / 2 - 0.5, noShadow: true },
    );
  }
}

/** A tall banner (pull-up or hung) with text. */
export function banner(
  d: Dresser,
  x: number,
  z: number,
  text: string,
  colour: string,
  o: { h?: number; w?: number; hung?: boolean; ry?: number } = {},
) {
  const h = o.h ?? 2.0;
  const w = o.w ?? 0.8;
  const ry = o.ry ?? 0;
  const y = o.hung ? WALL_H - 0.15 - h : 0.08;
  if (!o.hung) d.box(w + 0.05, 0.08, 0.25, '#4b5563', x, 0, z, { ry });
  else d.cyl(0.012, 0.012, w + 0.1, CHROME, x - (w + 0.1) / 2, y + h, z, { rz: -Math.PI / 2 });
  const tex = canvasTex(`dress:banner:${text}:${colour}`, 128, 320, (g) => {
    g.fillStyle = colour;
    g.fillRect(0, 0, 128, 320);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.arc(64, 250, 90, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 22px system-ui, sans-serif';
    g.textAlign = 'center';
    const words = text.split(/\s+/).slice(0, 5);
    words.forEach((wd, i) => g.fillText(wd, 64, 60 + i * 30, 118));
  });
  d.kit.add(
    new THREE.PlaneGeometry(w, h),
    mat('#ffffff', { map: tex, rough: 0.8, side: THREE.DoubleSide }),
    x,
    y + h / 2,
    z,
    { ry, noShadow: true },
  );
}

/** A loudspeaker on a stand (or on the floor). */
export function speaker(d: Dresser, x: number, z: number, ry = 0, stand = true) {
  const y = stand ? 1.2 : 0;
  if (stand) {
    d.cyl(0.02, 0.02, 1.2, BLACK, x, 0, z);
    for (let i = 0; i < 3; i++)
      d.box(0.5, 0.02, 0.03, BLACK, x, 0.02, z, { ry: (i * Math.PI * 2) / 3 });
  }
  d.box(0.38, 0.6, 0.32, '#111318', x, y, z, { ry, round: 0.02 });
  const [cx, cz] = at(x, z, ry, 0, 0.165);
  d.cyl(0.11, 0.11, 0.01, '#2b2f36', cx, y + 0.2, cz, { rx: Math.PI / 2 });
}

/** Rows of chairs from z0 forward, centred on x, `per` chairs a row, facing -z (the stage). */
export function chairRows(
  d: Dresser,
  x: number,
  z0: number,
  rows: number,
  per: number,
  o: {
    gap?: number;
    aisle?: number;
    kind?: 'plastic' | 'chair' | 'fancy';
    colour?: string;
    rowGap?: number;
  } = {},
) {
  const gap = o.gap ?? 0.6;
  const rowGap = o.rowGap ?? 0.85;
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < per; i++) {
      let cx = x + (i - (per - 1) / 2) * gap;
      if (o.aisle) cx += i < per / 2 ? -o.aisle / 2 : o.aisle / 2;
      const cz = z0 + r * rowGap;
      if (!d.free(Dresser_rect(cx, cz, 0.45, 0.45), { margin: 0.2 })) continue;
      sideChair(d, cx, cz, Math.PI, o.kind ?? 'plastic', o.colour);
    }
}

/** Pendant lamps (decor; the room's lights are its own) hung over a line. */
export function pendants(
  d: Dresser,
  pts: [number, number][],
  kind: 'dome' | 'globe' | 'cone' = 'dome',
  colour = '#1f2328',
) {
  for (const [x, z] of pts) {
    d.cyl(0.006, 0.006, 0.7, BLACK, x, WALL_H - 0.7, z);
    if (kind === 'globe')
      d.kit.sphere(0.14, '#fff7e0', x, WALL_H - 0.82, z, {
        emissive: '#ffe7a8',
        emissiveIntensity: 1.0,
      });
    else if (kind === 'cone') d.cyl(0.04, 0.2, 0.22, colour, x, WALL_H - 0.92, z);
    else d.kit.sphere(0.22, colour, x, WALL_H - 0.72, z, { sy: 0.5 });
  }
}

/** A clothes rail of hanging garments. */
export function clothesRail(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  w = 1.4,
  palette: readonly string[] = ['#1f2937', '#be123c', '#f5f5f4', '#1d4ed8', '#a16207', '#047857'],
) {
  for (const s of [-1, 1]) {
    const [lx, lz] = at(x, z, ry, (s * w) / 2, 0);
    d.cyl(0.015, 0.015, 1.55, CHROME, lx, 0, lz, metal);
    d.box(0.05, 0.02, 0.45, CHROME, lx, 0.01, lz, { ry, ...metal });
  }
  d.box(w, 0.025, 0.025, CHROME, x, 1.54, z, { ...metal, ry });
  const n = Math.floor(w / 0.1);
  for (let i = 0; i < n; i++) {
    const [gx, gz] = at(x, z, ry, -w / 2 + 0.08 + i * ((w - 0.16) / (n - 1)), 0);
    const long = d.rng() < 0.3;
    d.bit(
      0.035,
      long ? 1.0 : 0.65,
      0.42,
      jitter(d, d.pick(palette), 0.05),
      gx,
      1.5 - (long ? 1.0 : 0.65),
      gz,
      { ry, plain: true },
    );
  }
}

/** A mannequin wearing `colour`. */
export function mannequin(d: Dresser, x: number, z: number, colour: string, ry = 0) {
  d.cyl(0.18, 0.2, 0.03, '#4b5563', x, 0, z);
  d.cyl(0.015, 0.015, 0.8, '#9ca3af', x, 0, z, metal);
  d.box(0.36, 0.55, 0.22, colour, x, 0.8, z, { ry, round: 0.08 });
  d.box(0.32, 0.25, 0.2, tone(colour, -0.15), x, 0.62, z, { ry, round: 0.06 });
  d.cyl(0.04, 0.05, 0.1, '#e7e5e4', x, 1.35, z);
  d.kit.sphere(0.1, '#e7e5e4', x, 1.52, z, { sy: 1.2 });
}

/** A tall mirror on a stand, or flat on the back wall at x. */
export function mirror(d: Dresser, x: number, z: number, ry = 0, w = 0.6, h = 1.7) {
  d.box(w + 0.06, h + 0.06, 0.04, '#b08d57', x, 0.1, z, { ry, metal: 0.4, rough: 0.4 });
  const [px, pz] = at(x, z, ry, 0, 0.022);
  d.kit.add(
    new THREE.PlaneGeometry(w, h),
    mat('#dbe7ef', { metal: 0.9, rough: 0.05 }),
    px,
    0.13 + h / 2,
    pz,
    { ry, noShadow: true },
  );
}

/** A washing machine (or a drier). */
export function washer(d: Dresser, x: number, z: number, ry = 0, y = 0) {
  if (d.glb('Bathroom_WashingMachine', x, z, { w: 0.62, d: 0.62, h: 0.85, ry, y })) return;
  d.box(0.6, 0.85, 0.6, '#f1f5f9', x, y, z, { ry, round: 0.02 });
  const [dx, dz] = at(x, z, ry, 0, 0.3);
  d.cyl(0.19, 0.19, 0.02, '#94a3b8', dx, y + 0.42, dz, { rx: Math.PI / 2 });
}

/** A gondola: a low double-sided shop island, stocked on both faces. */
export function gondola(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  w: number,
  palette: readonly string[],
  o: {
    h?: number;
    kind?: Parameters<typeof packs>[5] extends infer T
      ? T extends { kind?: infer K }
        ? K
        : never
      : never;
    frame?: string;
    header?: string;
  } = {},
) {
  const h = o.h ?? 1.45;
  shelving(
    d,
    x,
    z,
    ry,
    w,
    h,
    0.9,
    4,
    { both: true, frame: o.frame, header: o.header },
    packs(d, x, z, ry, palette, { kind: o.kind, tall: [0.1, 0.26] }),
  );
  // End cap: a stack of offers.
  const [ex, ez] = at(x, z, ry, w / 2 + 0.25, 0);
  for (let i = 0; i < 9; i++)
    d.bit(
      0.24,
      0.18,
      0.28,
      d.pick(palette),
      ex + ((i % 3) - 1) * 0.0,
      i * 0.18 * 0 + Math.floor(i / 3) * 0.19,
      ez + ((i % 3) - 1) * 0.29,
      { ry },
    );
  const [hx, hz] = at(x, z, ry, w / 2 + 0.25, 0);
  d.kit.add(new THREE.PlaneGeometry(0.5, 0.5), posterMat('OFFER', '#dc2626'), hx, 0.9, hz, {
    ry: ry + Math.PI / 2,
    noShadow: true,
  });
}

/** A rack of shelves with pallets of stock (a warehouse). */
export function palletRack(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  w: number,
  levels = 3,
  h = 2.7,
  palette: readonly string[] = ['#c69c6d', '#b48a5c', '#d8b48a'],
) {
  const dd = 1.0;
  const bays = Math.max(1, Math.round(w / 1.4));
  for (let b = 0; b <= bays; b++) {
    for (const s of [-1, 1]) {
      const [ux, uz] = at(x, z, ry, -w / 2 + (w / bays) * b, (s * dd) / 2);
      d.box(0.07, h, 0.07, '#1d4ed8', ux, 0, uz, { ry });
    }
  }
  for (let l = 0; l < levels; l++) {
    const y = 0.15 + l * ((h - 0.2) / levels);
    for (const s of [-1, 1]) {
      const [bx, bz] = at(x, z, ry, 0, (s * dd) / 2);
      d.box(w, 0.1, 0.06, '#ea580c', bx, y, bz, { ry });
    }
    for (let b = 0; b < bays; b++) {
      const cx = -w / 2 + (w / bays) * (b + 0.5);
      if (d.rng() < 0.12) continue;
      const [px, pz] = at(x, z, ry, cx, 0);
      d.box(1.1, 0.12, 0.9, '#a77b4f', px, y + 0.1, pz, { ry });
      const stackH = Math.min(0.75, (h - 0.2) / levels - 0.3);
      const cols = 3;
      const rows = 2;
      const tiers = Math.max(1, Math.floor(stackH / 0.28));
      for (let t = 0; t < tiers; t++)
        for (let i = 0; i < cols; i++)
          for (let j = 0; j < rows; j++) {
            if (t === tiers - 1 && d.rng() < 0.25) continue;
            const [qx, qz] = at(x, z, ry, cx - 0.36 + i * 0.36, -0.2 + j * 0.42);
            d.bit(0.34, 0.27, 0.4, jitter(d, d.pick(palette), 0.05), qx, y + 0.22 + t * 0.28, qz, {
              ry,
            });
          }
    }
  }
}

/** A pallet of goods on the floor (boxes, sacks or wrapped). */
export function pallet(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  palette: readonly string[],
  tiers = 3,
  sacks = false,
) {
  d.box(1.1, 0.13, 0.9, '#a77b4f', x, 0, z, { ry });
  for (let t = 0; t < tiers; t++)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 2; j++) {
        const [px, pz] = at(x, z, ry, -0.36 + i * 0.36, -0.2 + j * 0.42);
        if (sacks)
          d.bit(0.34, 0.16, 0.42, jitter(d, d.pick(palette), 0.04), px, 0.13 + t * 0.165, pz, {
            ry: ry + (d.rng() - 0.5) * 0.12,
            plain: true,
          });
        else
          d.bit(0.34, 0.28, 0.4, jitter(d, d.pick(palette), 0.05), px, 0.13 + t * 0.285, pz, {
            ry,
          });
      }
}

/** A forklift. */
export function forklift(d: Dresser, x: number, z: number, ry: number) {
  d.box(0.9, 0.55, 1.4, '#f59e0b', x, 0.15, z, { ry, round: 0.05 });
  const [cx, cz] = at(x, z, ry, 0, -0.45);
  d.box(0.85, 0.5, 0.5, '#3f3f46', cx, 0.2, cz, { ry });
  for (const s of [-1, 1]) {
    const [px, pz] = at(x, z, ry, s * 0.4, 0.05);
    d.box(0.05, 1.3, 0.05, BLACK, px, 0.7, pz, { ry });
    const [mx, mz] = at(x, z, ry, s * 0.25, 0.85);
    d.box(0.08, 2.0, 0.08, '#3f3f46', mx, 0.1, mz, { ry });
    const [fx, fz] = at(x, z, ry, s * 0.22, 1.25);
    d.box(0.1, 0.05, 0.8, '#27272a', fx, 0.08, fz, { ry });
  }
  const [tx, tz] = at(x, z, ry, 0, 0.05);
  d.box(0.9, 0.05, 0.9, BLACK, tx, 2.0, tz, { ry });
  for (const [lx, lz] of [
    [-0.48, 0.45],
    [0.48, 0.45],
    [-0.48, -0.5],
    [0.48, -0.5],
  ] as const) {
    const [wx, wz] = at(x, z, ry, lx, lz);
    d.cyl(0.18, 0.18, 0.16, '#111', wx - Math.cos(ry) * 0.08 * Math.sign(lx), 0.18, wz, {
      rz: Math.PI / 2,
      ry,
    });
  }
  const [sx, sz] = at(x, z, ry, 0, -0.15);
  d.box(0.45, 0.12, 0.4, BLACK, sx, 0.75, sz, { ry });
}

/** A bicycle standing (or hung, at y) facing along x after ry. */
export function bike(d: Dresser, x: number, z: number, ry: number, colour: string, y = 0) {
  for (const s of [-1, 1]) {
    const [wx, wz] = at(x, z, ry, s * 0.5, 0);
    d.kit.torus(0.32, 0.025, '#111', wx, y + 0.34, wz, { ry: ry, seg: 18 });
  }
  const p = (lx: number, ly: number, lx2: number, ly2: number, c = colour) => {
    const len = Math.hypot(lx2 - lx, ly2 - ly);
    const [cx, cz] = at(x, z, ry, (lx + lx2) / 2, 0);
    d.box(len, 0.035, 0.035, c, cx, y + (ly + ly2) / 2 - 0.0175, cz, {
      ry,
      rz: Math.atan2(ly2 - ly, lx2 - lx),
    });
  };
  p(-0.5, 0.34, -0.05, 0.36);
  p(-0.05, 0.36, 0.38, 0.75);
  p(-0.5, 0.34, -0.12, 0.78);
  p(-0.12, 0.78, 0.38, 0.75);
  p(-0.05, 0.36, -0.12, 0.78);
  p(0.5, 0.34, 0.4, 0.86);
  p(-0.2, 0.86, -0.02, 0.86, BLACK);
  p(0.3, 0.92, 0.5, 0.92, BLACK);
}

/** A sewing machine on its table, with a stool. */
export function sewingTable(d: Dresser, x: number, z: number, ry: number, cloth: string) {
  d.box(1.0, 0.04, 0.55, '#a87b4f', x, 0.72, z, { ry });
  for (const s of [-1, 1]) {
    const [lx, lz] = at(x, z, ry, s * 0.45, 0);
    d.box(0.04, 0.72, 0.5, '#27272a', lx, 0, lz, { ry, ...metal });
  }
  const [mx, mz] = at(x, z, ry, 0.1, -0.05);
  d.box(0.42, 0.12, 0.18, '#f5f5f4', mx, 0.76, mz, { ry, round: 0.03 });
  const [ax, az] = at(x, z, ry, 0.25, -0.05);
  d.box(0.1, 0.25, 0.16, '#f5f5f4', ax, 0.76, az, { ry, round: 0.03 });
  const [hx, hz] = at(x, z, ry, 0.1, -0.05);
  d.box(0.42, 0.08, 0.14, '#f5f5f4', hx, 0.98, hz, { ry, round: 0.03 });
  const [cx, cz] = at(x, z, ry, -0.2, 0.08);
  d.bit(0.5, 0.02, 0.4, cloth, cx, 0.76, cz, { ry: ry + 0.3, plain: true });
}

/** A roll of cloth standing on end (fabric bolts), or a lying stack. */
export function bolts(
  d: Dresser,
  x: number,
  z: number,
  ry: number,
  n: number,
  palette: readonly string[],
  lying = false,
) {
  for (let i = 0; i < n; i++) {
    if (lying) {
      const [bx, bz] = at(x, z, ry, 0, 0);
      d.bit(1.1, 0.09, 0.32, jitter(d, d.pick(palette), 0.05), bx, i * 0.09, bz, {
        ry: ry + (d.rng() - 0.5) * 0.08,
        plain: true,
      });
    } else {
      const [bx, bz] = at(x, z, ry, (i - (n - 1) / 2) * 0.17, (i % 2) * 0.06);
      d.can(0.075, 1.2 + d.rng() * 0.2, jitter(d, d.pick(palette), 0.05), bx, 0, bz, {
        rz: (d.rng() - 0.5) * 0.15,
      });
    }
  }
}

/** A reception desk with a logo panel and a screen. */
export function reception(
  d: Dresser,
  x: number,
  z: number,
  w: number,
  o: { body?: string; top?: string; logo?: string; logoColour?: string; ry?: number } = {},
) {
  const ry = o.ry ?? 0;
  const body = o.body ?? '#f1f1ef';
  d.box(w, 1.05, 0.55, body, x, 0, z, { ry, round: 0.02 });
  const [tx, tz] = at(x, z, ry, 0, 0.12);
  d.box(w + 0.06, 0.04, 0.35, o.top ?? '#3b2a20', tx, 1.05, tz, { ry, rough: 0.3 });
  const [wx, wz] = at(x, z, ry, 0, -0.3);
  d.box(w - 0.1, 0.03, 0.5, tone(body, -0.05), wx, 0.74, wz, { ry });
  if (o.logo) {
    const [lx, lz] = at(x, z, ry, 0, 0.28);
    d.kit.add(
      new THREE.PlaneGeometry(Math.min(w - 0.3, 1.8), 0.32),
      posterMat(o.logo, o.logoColour ?? '#0f766e'),
      lx,
      0.6,
      lz,
      { ry, noShadow: true },
    );
  }
  const [mx, mz] = at(x, z, ry, w / 2 - 0.45, -0.32);
  d.box(0.48, 0.3, 0.03, BLACK, mx, 0.84, mz, { ry: ry + Math.PI });
  d.box(0.04, 0.1, 0.04, BLACK, mx, 0.76, mz);
}

/** A tall potted tree or a pair of small plants beside a doorway. */
export function plantsAlong(d: Dresser, xs: number[], z: number, sizes?: (1 | 2 | 3)[]) {
  xs.forEach((x, i) => {
    if (d.free(Dresser_rect(x, z, 0.6, 0.6), { margin: 0.25 })) {
      d.claim(Dresser_rect(x, z, 0.6, 0.6));
      plant(d, x, z, sizes?.[i] ?? ((1 + Math.floor(d.rng() * 3)) as 1 | 2 | 3));
    }
  });
}

/** A floor lamp. */
export function floorLamp(d: Dresser, x: number, z: number) {
  if (d.glb('Light_Floor1', x, z, { w: 0.45, d: 0.45, h: 1.6 })) return;
  d.cyl(0.15, 0.15, 0.03, BLACK, x, 0, z);
  d.cyl(0.012, 0.012, 1.45, BLACK, x, 0, z);
  d.cyl(0.14, 0.2, 0.25, '#f5f0e6', x, 1.4, z, { emissive: '#fde68a', emissiveIntensity: 0.4 });
}

/** A chandelier (CC0) hung over (x, z). */
export function chandelier(d: Dresser, x: number, z: number, size = 1.0) {
  if (
    d.glb('Light_Chandelier', x, z, {
      w: size,
      d: size,
      h: size * 0.75,
      y: WALL_H - size * 0.75 - 0.05,
    })
  )
    return;
  d.cyl(0.008, 0.008, 0.4, '#d4af37', x, WALL_H - 0.4, z);
  d.kit.torus(size * 0.35, 0.02, '#d4af37', x, WALL_H - 0.6, z, { rx: Math.PI / 2 });
  for (let i = 0; i < 8; i++)
    d.kit.sphere(
      0.04,
      '#fff7d6',
      x + Math.cos(i) * size * 0.35,
      WALL_H - 0.56,
      z + Math.sin(i) * size * 0.35,
      { emissive: '#ffe7a8', emissiveIntensity: 1.2 },
    );
}
