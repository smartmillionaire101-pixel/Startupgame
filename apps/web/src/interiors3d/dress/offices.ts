/**
 * Offices: your company's (desks and screens, a glass meeting room, a kitchen
 * corner, a whiteboard), a co-working floor (bench desks, phone booths, a
 * coffee bar, sofas), the Hub (communal tables, beanbags, a stand-up wall),
 * the state's (wooden desks, flags, filing, a counter; a courtroom) and the
 * professional employers' (a law firm's books, an engineers' drawing boards,
 * a consultancy's glass and art).
 */
import { BACK, RW } from '../roomGeom';
import { tone } from '../kit';
import { Dresser } from './core';
import {
  armchair,
  art,
  banner,
  beamSeats,
  beanbag,
  boardTable,
  bookcase,
  ceilingFan,
  clock,
  coffeeTable,
  counter,
  desk,
  filing,
  flag,
  glassWall,
  kitchenette,
  plant,
  plantsAlong,
  poster,
  printer,
  rug,
  sofa,
  stickyWall,
  wainscot,
  wallTv,
  waterCooler,
  whiteboard,
  windows,
} from './props';
import type { DressCtx, Family, Look, SeatCall } from './types';

type Office = 'startup' | 'cowork' | 'hub' | 'tech' | 'gov' | 'court' | 'law' | 'eng' | 'consult';

export function officeOf(c: DressCtx): Office {
  const v = c.variant;
  if (v === 'high-court') return 'court';
  if (v === 'ministry-finance' || (c.kind === 'office' && /ministry|embassy|council/.test(v)))
    return 'gov';
  if (v === 'employer-law') return 'law';
  if (v === 'employer-engineering') return 'eng';
  if (v === 'employer-consultancy') return 'consult';
  if (v === 'employer-tech' || v === 'tech-campus') return 'tech';
  if (c.kind === 'hub') return 'hub';
  if (c.kind === 'cowork') return 'cowork';
  return 'startup';
}

const LOOKS: Record<Office, (t: number) => Look> = {
  startup: (t) =>
    [
      { floor: 'carpet', floorTint: '#8a929c', wall: '#e8ecef' },
      { floor: 'oak', wall: '#eef1f3' },
      { floor: 'parquet', wall: '#f3f4f6' },
    ][t - 1] as Look,
  cowork: (t) =>
    t === 1 ? { floor: 'concrete', wall: '#e9e4dc' } : { floor: 'oak', wall: '#f1ede6' },
  hub: () => ({ floor: 'concrete', wall: '#e0f2fe' }),
  tech: () => ({ floor: 'oak', wall: '#eef2ff' }),
  gov: (t) => ({ floor: t === 3 ? 'parquet' : 'carpet', floorTint: '#6b4f3a', wall: '#ece3cf' }),
  court: () => ({ floor: 'parquet-dark', wall: '#e9dfc8' }),
  law: () => ({ floor: 'carpet', floorTint: '#3f4a5a', wall: '#ece6da' }),
  eng: () => ({ floor: 'carpet', floorTint: '#7b8794', wall: '#e2e8f0' }),
  consult: () => ({ floor: 'oak', wall: '#f5f5f4' }),
};

/** The desk style and screens for each kind of office. */
const DESK: Record<Office, Parameters<typeof desk>[4]> = {
  startup: { style: 'white', screens: 2 },
  cowork: { style: 'wood', screens: 'laptop', w: 1.4 },
  hub: { style: 'white', screens: 'laptop' },
  tech: { style: 'white', screens: 2 },
  gov: { style: 'glb', screens: 1 },
  court: { style: 'exec', screens: 'laptop' },
  law: { style: 'exec', screens: 1 },
  eng: { style: 'white', screens: 2 },
  consult: { style: 'white', screens: 'laptop' },
};

/** This place's desks (a startup picks white or oak, and its chairs' colour). */
const DESK_PICK = new WeakMap<Dresser, Parameters<typeof desk>[4]>();
function deskOf(d: Dresser, t: Office): Parameters<typeof desk>[4] {
  let o = DESK_PICK.get(d);
  if (!o) {
    o = { ...DESK[t] };
    if (t === 'startup' || t === 'tech' || t === 'consult') {
      o.style = d.pick(['white', 'white', 'wood'] as const);
      o.chairColour = d.pick(['#1f2328', '#1e3a8a', '#7f1d1d', '#3f6212']);
    }
    DESK_PICK.set(d, o);
  }
  return o;
}

/** A desk in front of someone at (x, z) facing θ (0 is +z). */
export function deskFacing(
  d: Dresser,
  x: number,
  z: number,
  th: number,
  o: Parameters<typeof desk>[4],
) {
  const dx = Math.sin(th) * 0.55;
  const dz = Math.cos(th) * 0.55;
  desk(d, x + dx, z + dz, th + Math.PI, o);
  d.claim(Dresser.rect(x + dx * 0.5, z + dz * 0.5, 1.4, 1.4));
}

/** A glass-walled meeting room in a back corner from x0 to x1, its front at zf. */
function meetingRoom(
  d: Dresser,
  _c: DressCtx,
  x0: number,
  x1: number,
  zf: number,
  o: { table?: string; chairs?: 'office' | 'fancy'; tv?: boolean } = {},
) {
  const inner = Math.abs(x0) < Math.abs(x1) ? x0 : x1;
  const outer = inner === x0 ? x1 : x0;
  // A door where someone stands on the line (or by the inner end).
  let gap: [number, number] =
    inner < outer ? [0.25, 1.15] : [Math.abs(x1 - x0) - 1.15, Math.abs(x1 - x0) - 0.25];
  for (const [px, pz] of d.people)
    if (px > Math.min(x0, x1) && px < Math.max(x0, x1) && Math.abs(pz - zf) < 0.4) {
      const t = px - Math.min(x0, x1);
      gap = [t - 0.5, t + 0.5];
    }
  glassWall(d, Math.min(x0, x1), zf, Math.max(x0, x1), zf, { gap });
  for (const e of [x0, x1]) if (Math.abs(e) < RW / 2 - 0.3) glassWall(d, e, BACK, e, zf);
  const cx = (x0 + x1) / 2;
  const cz = (BACK + zf) / 2 + 0.05;
  const w = Math.min(2.4, Math.abs(x1 - x0) - 1.4);
  boardTable(d, cx, cz, w, 0.95, {
    top: o.table ?? '#e7e5e4',
    chairs: o.chairs ?? 'office',
    skip: (x, z) => !d.free(Dresser.rect(x, z, 0.5, 0.5), { margin: 0.15, furniture: false }),
  });
  if (o.tv !== false) wallTv(d, cx, 1.2, 1.3);
  plant(d, outer - Math.sign(outer) * 0.4, BACK + 0.4, 2);
  d.claim({ x0: Math.min(x0, x1), z0: BACK, x1: Math.max(x0, x1), z1: zf + 0.1 });
}

/** Spare desks in two rows wherever there's room (an office has more desks than people in it today). */
function spareDesks(
  d: Dresser,
  o: Parameters<typeof desk>[4],
  rows: number[],
  xs: number[],
  odds = 0.8,
) {
  for (const z of rows)
    for (const x of xs) {
      if (d.rng() > odds) continue;
      // The desk and its chair behind it (people sit facing the back wall).
      const r = Dresser.rect(x, z + 0.25, (o?.w ?? 1.3) + 0.05, 1.3);
      if (!d.free(r)) continue;
      d.claim(r);
      desk(d, x, z, 0, { ...o, chair: true });
    }
}

function startup(c: DressCtx, d: Dresser, t: Office) {
  const night = c.night;
  // Two arrangements of the back wall (the right-hand corner is the least seen):
  // A: meeting room left, windows, kitchen right; B: kitchen left, windows, meeting room right.
  const L = d.flip ? 1 : -1;
  const kit = t === 'tech' ? '#5b7065' : d.pick(['#e7e2d6', '#5b7065', '#2b2f33', '#d9c7a7']);
  const table = t === 'consult' ? '#f5f5f4' : d.pick(['#ddd6cc', '#3b2a20', '#f1f1ef']);
  let wx0: number;
  let wx1: number;
  let px: number;
  if (L < 0) {
    meetingRoom(d, c, -RW / 2 + 0.05, -2.2, -1.15, { table });
    kitchenette(d, 1.7, 4.75, { colour: kit });
    wx0 = -2.0;
    wx1 = 1.5;
    px = 5.4;
  } else {
    kitchenette(d, -RW / 2 + 0.1, -3.0, { colour: kit });
    meetingRoom(d, c, 1.3, 5.2, -1.15, { table });
    wx0 = -2.8;
    wx1 = 1.1;
    px = -2.4;
  }
  // A high table by the kitchen.
  const hx = L < 0 ? 3.6 : -4.4;
  if (d.fits(hx, -1.75, 0.7, 0.7)) {
    d.cyl(0.35, 0.35, 0.04, '#f1f1ef', hx, 1.02, -1.75);
    d.cyl(0.03, 0.03, 1.02, '#3f3f46', hx, 0, -1.75);
    d.cyl(0.25, 0.25, 0.02, '#3f3f46', hx, 0, -1.75);
  }
  // The middle of the back wall: windows over a low storage run, a whiteboard beside.
  const wbLeft = d.rng() < 0.5;
  const wbx = wbLeft ? wx0 + 0.6 : wx1 - 0.6;
  whiteboard(d, wbx, 1.0, 1.1);
  const w0 = wbLeft ? wx0 + 1.2 : wx0;
  const w1 = wbLeft ? wx1 : wx1 - 1.2;
  windows(d, w0, w1, { night });
  d.box(w1 - w0 - 0.1, 0.62, 0.42, '#f1f1ef', (w0 + w1) / 2, 0, BACK + 0.22);
  for (let i = 0; i < 3; i++)
    d.bit(
      0.3,
      0.26,
      0.24,
      d.pick(['#1e3a8a', '#e5e7eb', '#a16207']),
      w0 + 0.4 + i * 0.7,
      0.62,
      BACK + 0.22,
    );
  plant(d, w1 - 0.35, BACK + 0.25, 1);
  d.claim({ x0: wx0, z0: BACK, x1: wx1, z1: BACK + 0.5 });
  // A printer and the water cooler.
  if (d.fits(px, -2.5, 0.7, 0.6)) printer(d, px, -2.5, 0);
  if (d.fits(px, -1.75, 0.4, 0.4)) waterCooler(d, px, -1.75);
  if (d.rng() < 0.6) rug(d, -1.0, 2.4, 3.0, 1.2, d.pick(['#475569', '#7c2d12', '#0f766e']));
  // Spare desks.
  spareDesks(
    d,
    deskOf(d, t),
    [-0.65, 1.15],
    [-4.7, -3.33, -1.95, -0.6, 0.75, 2.1, 3.45, 4.8],
    t === 'startup' ? 0.75 : 0.85,
  );
  plantsAlong(d, [-5.5, 5.5, -5.5], 2.6, [3, 2, 2]);
  if (t === 'eng') {
    // A drawing board, hard hats and the plans pinned up.
    if (d.fits(-4.8, 1.6, 1.3, 1.0)) {
      d.box(1.2, 0.03, 0.85, '#f8fafc', -4.8, 0.95, 1.6, { rx: -0.35 });
      d.box(0.05, 0.95, 0.05, '#52525b', -5.3, 0, 1.6);
      d.box(0.05, 0.95, 0.05, '#52525b', -4.3, 0, 1.6);
      d.bit(0.9, 0.005, 0.6, '#bfdbfe', -4.8, 1.0, 1.6, { rx: -0.35, plain: true });
    }
    poster(d, L < 0 ? 3.6 : -3.6, 1.6, 0.7, 0.5, 'SITE PLAN', '#1e40af');
    for (let i = 0; i < 3; i++)
      d.kit.sphere(0.13, '#facc15', (L < 0 ? -1.6 : 1.0) + i * 0.32, 0.72, BACK + 0.22, {
        sy: 0.7,
      });
  }
  if (t === 'consult') {
    art(d, L < 0 ? 4.3 : -4.3, 1.4, 1.0, 0.75);
    sofa(d, L < 0 ? -4.4 : 4.4, 2.3, 0, 1.8, '#5b6b7a', 'couch');
  }
  if (t === 'tech') {
    for (const [x, z, col] of [
      [-4.6, 2.2, '#f97316'],
      [-3.8, 2.6, '#6366f1'],
      [5.2, 0.6, '#10b981'],
    ] as const)
      if (d.fits(x, z, 0.8, 0.8)) beanbag(d, x, z, col);
  }
}

function cowork(c: DressCtx, d: Dresser) {
  const L = d.flip ? 1 : -1;
  // A coffee bar along one end of the back wall, with stools.
  const bx = L < 0 ? 4.0 : -4.0;
  counter(d, bx, BACK + 0.45, 0, 3.0, { body: '#3f3f46', top: '#d6b98c', till: false });
  d.box(0.3, 0.42, 0.34, '#b91c1c', bx - 0.8, 0.95, BACK + 0.45, { round: 0.03 });
  for (let i = 0; i < 6; i++)
    d.can(0.04, 0.1, d.pick(['#f8fafc', '#fde68a']), bx + 0.2 + i * 0.1, 0.95, BACK + 0.4);
  d.box(3.0, 0.03, 0.25, '#7c5a3c', bx, 1.6, BACK + 0.13);
  d.box(3.0, 0.03, 0.25, '#7c5a3c', bx, 2.0, BACK + 0.13);
  for (let i = 0; i < 10; i++)
    d.can(
      0.05,
      0.16,
      d.pick(['#a16207', '#14532d', '#7f1d1d', '#e5e7eb']),
      bx - 1.3 + i * 0.28,
      1.63,
      BACK + 0.13,
    );
  d.claim({ x0: bx - 1.6, z0: BACK, x1: bx + 1.6, z1: BACK + 0.9 });
  // Phone booths on the other side.
  const px = L < 0 ? -5.3 : 5.3;
  for (const k of [0, 1]) {
    const x = px - L * k * 1.25;
    d.box(1.15, 2.2, 0.05, '#1f2937', x, 0, BACK + 0.03);
    d.box(1.15, 0.08, 1.1, '#1f2937', x, 2.15, BACK + 0.55);
    d.box(0.05, 2.2, 1.1, '#1f2937', x - 0.57, 0, BACK + 0.55);
    d.box(0.05, 2.2, 1.1, '#1f2937', x + 0.57, 0, BACK + 0.55);
    glassWall(d, x - 0.55, BACK + 1.1, x + 0.55, BACK + 1.1, { h: 2.15, frame: '#1f2937' });
    d.box(0.6, 0.03, 0.4, '#d6b98c', x, 1.0, BACK + 0.25);
    d.cyl(0.18, 0.18, 0.05, c.tint, x, 0.6, BACK + 0.6);
    d.cyl(0.03, 0.03, 0.6, '#3f3f46', x, 0, BACK + 0.6);
  }
  d.claim({
    x0: Math.min(px, px - L * 1.25) - 0.6,
    z0: BACK,
    x1: Math.max(px, px - L * 1.25) + 0.6,
    z1: BACK + 1.2,
  });
  // Windows between, over a long counter of plants.
  windows(d, L < 0 ? -2.8 : -2.4, L < 0 ? 2.4 : 2.8, { night: c.night, sill: 0.8 });
  for (let i = 0; i < 4; i++) plant(d, (L < 0 ? -2.3 : -1.9) + i * 1.4, BACK + 0.35, 1);
  // Sofas round a rug at the front.
  const sx = L < 0 ? -4.2 : 4.2;
  if (d.free(Dresser.rect(sx, 2.3, 2.2, 1.0))) {
    rug(d, sx, 2.0, 2.6, 1.8, '#c2410c');
    sofa(d, sx, 2.6, Math.PI, 2.0, '#4b5563', 'couch');
    coffeeTable(d, sx, 1.8, 1.0, 0.5);
    d.claim(Dresser.rect(sx, 2.2, 2.4, 1.4));
  }
  spareDesks(d, DESK.cowork, [-0.65, 1.15], [-4.6, -3.2, -1.8, 0.9, 2.3, 3.7, 5.1], 0.7);
  plantsAlong(d, [5.6, -5.6], 0.4, [3, 3]);
  // A neon-ish sign of the tint over the bar.
  poster(d, bx, 2.25, 1.6, 0.4, 'COFFEE', tone(c.tint, -0.1));
}

function hub(c: DressCtx, d: Dresser) {
  const L = d.flip ? 1 : -1;
  // The stand-up corner: a sticky-note wall and a big screen.
  const sx = L < 0 ? -3.6 : 3.6;
  stickyWall(d, sx - 0.4, 2.6, 1.3);
  wallTv(d, sx + 1.8 * (L < 0 ? 1 : -1), 1.3, 1.6);
  // A café counter in the other corner.
  const cx = L < 0 ? 4.1 : -4.1;
  counter(d, cx, BACK + 0.5, 0, 2.8, { body: c.tint, top: '#f1f1ef', front: 'CAFÉ' });
  d.box(0.32, 0.42, 0.34, '#27272a', cx + 0.7, 0.97, BACK + 0.5, { round: 0.03 });
  poster(d, cx, 1.7, 2.2, 0.55, 'THE HUB', tone(c.tint, -0.2));
  d.claim({ x0: cx - 1.5, z0: BACK, x1: cx + 1.5, z1: BACK + 1.0 });
  windows(d, -1.0, 1.4, { night: c.night });
  // Beanbags, a ping-pong table, banners.
  for (const [x, z, col] of [
    [-5.2, 1.5, '#f97316'],
    [-4.6, 2.5, '#22c55e'],
    [5.4, 1.0, '#6366f1'],
    [-5.4, -0.5, '#eab308'],
    [3.2, 2.7, '#ec4899'],
  ] as const)
    if (d.fits(d.mx(x), z, 0.8, 0.8)) beanbag(d, d.mx(x), z, col);
  const tx = L < 0 ? 1.0 : -1.0;
  if (d.fits(tx, -1.8, 2.8, 1.6)) {
    d.box(2.6, 0.04, 1.5, '#1e3a8a', tx, 0.74, -1.8, { rough: 0.5 });
    d.box(2.6, 0.005, 0.03, '#f8fafc', tx, 0.78, -1.8);
    d.box(0.02, 0.15, 1.5, '#e5e7eb', tx, 0.78, -1.8);
    for (const s of [-1, 1]) d.box(0.1, 0.74, 1.0, '#1f2937', tx + s * 0.9, 0, -1.8);
  }
  banner(d, d.mx(5.6), -2.4, 'BUILD SHIP LEARN', c.tint, { h: 1.9, w: 0.75 });
  // A communal table where there's room.
  spareDesks(d, DESK.hub, [-0.65, 1.15], [-4.7, -3.33, -1.95, 2.1, 3.45, 4.8], 0.5);
  plantsAlong(d, [5.6, -5.6], 2.6, [2, 3]);
}

function gov(c: DressCtx, d: Dresser) {
  const wood = '#6b4a33';
  wainscot(d, 1.0, '#8a6544');
  const stripes = [c.tint, '#ffffff', c.tint];
  // Flags, a portrait and the clock at the back centre.
  flag(d, -0.9, BACK + 0.35, stripes);
  flag(d, 0.9, BACK + 0.35, stripes);
  art(d, 0, 1.5, 0.8, 1.0, 7, '#8a6d3b');
  clock(d, 2.4, 2.2);
  d.claim({ x0: -1.3, z0: BACK, x1: 1.3, z1: BACK + 0.7 });
  // Filing along the back wall, a counter for papers, visitors' benches.
  filing(d, d.mx(-4.2), BACK + 0.32, 0, 4, '#8b8f94');
  bookcase(d, d.mx(-2.3), BACK + 0.2, 0, 1.4, 2.0, wood);
  d.claim({
    x0: Math.min(d.mx(-5.2), d.mx(-1.6)),
    z0: BACK,
    x1: Math.max(d.mx(-5.2), d.mx(-1.6)),
    z1: BACK + 0.7,
  });
  const kx = d.mx(3.9);
  counter(d, kx, -2.3, 0, 3.0, { body: wood, top: '#3b2a20', till: false });
  for (let i = 0; i < 5; i++)
    d.bit(
      0.22,
      0.04 + d.rng() * 0.12,
      0.3,
      d.pick(['#f5f5f4', '#e7e5e4', '#fde68a']),
      kx - 1.1 + i * 0.5,
      0.97,
      -2.35,
      { ry: d.rng() * 0.3, plain: true },
    );
  d.claim(Dresser.rect(kx, -2.3, 3.2, 0.9));
  poster(d, kx, 1.6, 1.6, 0.4, 'ENQUIRIES', '#14532d');
  for (const [x, z] of [
    [-4.8, 2.4],
    [2.8, 2.7],
  ] as const)
    if (d.fits(d.mx(x), z, 1.7, 0.6)) beamSeats(d, d.mx(x), z, Math.PI, 3, '#7c5a3c');
  ceilingFan(d, -2, 0.6);
  ceilingFan(d, 2.5, 0.6);
  spareDesks(d, DESK.gov, [-0.65, 1.15], [-4.7, -3.33, 0.75, 2.1, 3.45, 4.8], 0.6);
  plantsAlong(d, [5.6, -5.6], 0.8, [3, 2]);
}

function court(c: DressCtx, d: Dresser) {
  const wood = '#5a3b26';
  wainscot(d, 1.4, wood);
  // The bench: raised, panelled, three high-backed chairs, the arms above.
  d.box(4.2, 0.35, 1.6, tone(wood, -0.05), 0, 0, BACK + 0.8);
  d.box(4.0, 1.15, 0.12, wood, 0, 0.35, BACK + 1.5);
  d.box(4.1, 0.06, 0.5, tone(wood, 0.08), 0, 1.5, BACK + 1.42);
  for (const x of [-1.2, 0, 1.2]) {
    d.box(0.62, 0.1, 0.55, '#7f1d1d', x, 0.8, BACK + 0.7);
    d.box(0.62, x === 0 ? 1.4 : 1.1, 0.12, '#7f1d1d', x, 0.85, BACK + 0.42, { round: 0.03 });
  }
  d.cyl(0.42, 0.42, 0.05, '#d4af37', 0, 2.25, BACK + 0.03, {
    rx: Math.PI / 2,
    metal: 0.7,
    rough: 0.3,
  });
  d.cyl(0.32, 0.32, 0.06, tone(c.tint, -0.1), 0, 2.25, BACK + 0.04, { rx: Math.PI / 2 });
  flag(d, -2.6, BACK + 0.35, [c.tint, '#ffffff', c.tint]);
  d.claim({ x0: -2.9, z0: BACK, x1: 2.3, z1: BACK + 1.7 });
  // The witness box and the clerk's table.
  const wx = d.mx(3.6);
  if (d.fits(wx, -2.2, 1.2, 1.1)) {
    d.box(1.1, 0.2, 1.0, wood, wx, 0, -2.2);
    d.box(1.1, 1.05, 0.06, wood, wx, 0.2, -1.7);
    d.box(0.06, 1.05, 1.0, wood, wx - 0.55, 0.2, -2.2);
    d.box(0.06, 1.05, 1.0, wood, wx + 0.55, 0.2, -2.2);
  }
  // Counsel's tables are the seated people's; the public sits on pews at the front.
  for (const [x, z] of [
    [-4.6, 2.5],
    [4.8, 1.5],
  ] as const) {
    const xx = d.mx(x);
    if (!d.fits(xx, z, 2.0, 0.7)) continue;
    d.box(2.0, 0.06, 0.45, wood, xx, 0.42, z);
    d.box(2.0, 0.55, 0.06, wood, xx, 0.45, z + 0.22);
    for (const s of [-1, 1]) d.box(0.06, 0.42, 0.45, tone(wood, -0.1), xx + s * 0.95, 0, z);
  }
  // A rail between the well and the public.
  for (let x = -5.6; x < 5.6; x += 0.25)
    if (d.free(Dresser.rect(x, 0.75, 0.1, 0.1), { margin: 0.25, stations: false }))
      d.box(0.04, 0.85, 0.04, tone(wood, 0.05), x, 0, 0.72);
  ceilingFan(d, -3, 0);
  ceilingFan(d, 3, 0);
}

function law(c: DressCtx, d: Dresser) {
  const L = d.flip ? 1 : -1;
  for (let i = 0; i < 3; i++)
    bookcase(d, (L < 0 ? -5.2 : 2.9) + i * 1.15, BACK + 0.2, 0, 1.1, 2.3, '#4a3426');
  d.claim({ x0: L < 0 ? -5.8 : 2.3, z0: BACK, x1: L < 0 ? -1.8 : 5.8, z1: BACK + 0.5 });
  meetingRoom(d, c, L < 0 ? 1.8 : -RW / 2 + 0.05, L < 0 ? RW / 2 - 0.05 : -1.8, -1.15, {
    table: '#3b2a20',
    chairs: 'fancy',
    tv: false,
  });
  art(d, L < 0 ? 3.8 : -3.8, 1.3, 1.2, 0.8, 12, '#b08d57');
  art(d, -0.2, 1.4, 0.7, 0.9, 21, '#b08d57');
  if (d.fits(L < 0 ? -0.9 : 0.9, -2.5, 1.0, 1.0))
    armchair(d, L < 0 ? -0.9 : 0.9, -2.5, L < 0 ? -0.4 : 0.4, '#7f1d1d');
  spareDesks(d, DESK.law, [-0.65, 1.15], [-4.7, 0.75, 2.1, 3.45, 4.8], 0.6);
  plantsAlong(d, [5.6, -5.6], 2.5, [3, 3]);
  rug(d, -2.2, 0.6, 3.6, 2.4, '#7f1d1d');
}

export const offices: Family = {
  look: (c, d) => LOOKS[officeOf(c)](d.tier),
  seat: (c, d, s: SeatCall) => {
    const t = officeOf(c);
    if (s.pair) return false;
    // At a desk: facing the back wall (desk style), or along the room (the Hub's tables).
    const th = s.style === 'desk' ? Math.PI : s.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    deskFacing(d, s.x, s.z, th, { ...deskOf(d, t), chair: true });
    return true;
  },
  dress: (c, d) => {
    const t = officeOf(c);
    if (t === 'cowork') cowork(c, d);
    else if (t === 'hub') hub(c, d);
    else if (t === 'gov') gov(c, d);
    else if (t === 'court') court(c, d);
    else if (t === 'law') law(c, d);
    else startup(c, d, t);
  },
};
