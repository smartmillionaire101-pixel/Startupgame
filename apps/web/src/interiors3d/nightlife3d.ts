/**
 * Nightlife in 3D: a venue's floor plan, look and light from its style
 * (../city/nightlife.ts), built from the room kit (./kit.ts) and the shared
 * models (./furniture.ts). Low-poly and merged per material, at most four
 * point lights, so a packed club still runs on a phone.
 *
 * Indoor plans are a cut-away box like ./venues.ts; open-air ones (a
 * rooftop, a beach, a yard, a Nile boat) are a deck with what's beyond it: a
 * skyline, a tower's spire, a red bridge, a wheel, green hills, a river, the
 * sea. `animate` sweeps the beams, pulses the floor to the genre's tempo and
 * flickers the fire (still when motion is reduced).
 */
import * as THREE from 'three';
import type { Activity, Slot } from '../city/rooms';
import { GENRES, isOpenAir, type NightStyle } from '../city/nightlife';
import { buildModel, chairAt } from './furniture';
import { Kit, floorTexture, FLOOR_SCALE, mat, rugTexture, tone } from './kit';
import { BACK, RD, RW, WALL_H, vx, vz, type SeatSpot, type VenueRoom } from './venues';
import type { PoseId } from './character';
import { buildClubParts, type ClubParts } from './club3d';
import { softwareGl } from '../three-kit/quality';

export interface NightEnv {
  background: THREE.Color | THREE.Texture;
  hemi: number;
  hemiColor: string;
  sun: number;
  ambient: number;
  /** A lower camera, to see what's beyond an open-air venue. */
  elevation?: number;
}

export interface NightRoom extends VenueRoom {
  env: NightEnv;
  /** Standing higher (on a stage), by slot. */
  lift: Map<number, number>;
  /** Facing (radians), by slot: the dart player faces the board. */
  faces: Map<number, number>;
  /** Poses by activity, over the room's defaults (musicians play, darts are thrown). */
  poses: Partial<Record<Activity, PoseId>>;
  animate: (t: number, dt: number, reduced: boolean) => void;
}

export interface NightOpts {
  style: NightStyle;
  tint: string;
  sign?: string;
  slots: Slot[];
  night: boolean;
}

// ---------------------------------------------------------------------------
// Textures (canvas, one each)

const TEX = new Map<string, THREE.CanvasTexture>();
function tex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const hit = TEX.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  TEX.set(key, t);
  return t;
}

/** A word in neon: glowing letters on nothing. */
function neonTexture(text: string, color: string) {
  return tex(`neon:${text}:${color}`, 512, 128, (g) => {
    g.clearRect(0, 0, 512, 128);
    g.font = '900 78px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 22;
    g.fillStyle = color;
    g.fillText(text, 256, 66, 490);
    g.shadowBlur = 0;
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.55;
    g.fillText(text, 256, 66, 490);
  });
}

/** Lit windows for a skyline's towers. */
function windowsTexture(night: boolean) {
  return tex(`win:${night}`, 64, 128, (g) => {
    g.fillStyle = night ? '#0f172a' : '#64748b';
    g.fillRect(0, 0, 64, 128);
    let s = 9;
    for (let y = 2; y < 128; y += 6)
      for (let x = 2; x < 64; x += 6) {
        s = (s * 16807) % 2147483647;
        const lit = s % 100 < (night ? 55 : 20);
        g.fillStyle = lit ? (night ? '#fde68a' : '#e2e8f0') : night ? '#1e293b' : '#475569';
        g.fillRect(x, y, 3, 4);
      }
  });
}

/** Spray paint (Nairobi's genge walls, a Joburg warehouse). */
function muralTexture(glow: readonly string[]) {
  return tex(`mural:${glow.join()}`, 512, 256, (g) => {
    g.fillStyle = '#27272a';
    g.fillRect(0, 0, 512, 256);
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = glow[i % 3]!;
      g.lineWidth = 18 + (i % 3) * 8;
      g.beginPath();
      g.moveTo(20 + i * 56, 200 - (i % 2) * 60);
      g.bezierCurveTo(60 + i * 56, 40, 100 + i * 50, 220, 140 + i * 52, 90);
      g.stroke();
    }
    for (let i = 0; i < 5; i++) {
      g.fillStyle = glow[(i + 1) % 3]!;
      g.beginPath();
      g.arc(60 + i * 100, 60 + (i % 2) * 120, 26, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** A sky from the top of the screen to the horizon. */
function skyTexture(top: string, low: string) {
  return tex(`sky:${top}:${low}`, 4, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, top);
    gr.addColorStop(1, low);
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
  });
}

// ---------------------------------------------------------------------------

/** Group seated slots into side-by-side pairs (as ./venues.ts does). */
function pairs(slots: { s: Slot; i: number }[]) {
  const left = [...slots].sort((a, b) => a.s.x - b.s.x);
  const used = new Set<number>();
  const out: { a: { s: Slot; i: number }; b?: { s: Slot; i: number } }[] = [];
  for (const a of left) {
    if (used.has(a.i)) continue;
    used.add(a.i);
    const b = left.find(
      (c) =>
        !used.has(c.i) && Math.abs(c.s.y - a.s.y) <= 14 && c.s.x - a.s.x > 0 && c.s.x - a.s.x <= 64,
    );
    if (b) used.add(b.i);
    out.push({ a, b });
  }
  return out;
}

export function buildNightVenue(o: NightOpts): NightRoom {
  const s = o.style;
  const has = (p: string) => s.props.includes(p as never);
  const open = isOpenAir(s);
  const root = new THREE.Group();
  const seats = new Map<number, SeatSpot>();
  const screens: THREE.MeshStandardMaterial[] = [];
  const decks: THREE.Object3D[] = [];
  const lamps: THREE.PointLight[] = [];
  const sides: VenueRoom['sides'] = [];
  const lift = new Map<number, number>();
  const faces = new Map<number, number>();
  const poses: NightRoom['poses'] = { playing: 'present' };
  /** Animated: beams that sweep, tiles that pulse, flames that flicker, lights that move. */
  const beams: THREE.Object3D[] = [];
  const pulse: THREE.MeshStandardMaterial[] = [];
  const flames: { l: THREE.PointLight; m?: THREE.Object3D }[] = [];
  const movers: THREE.PointLight[] = [];
  const k = new Kit();
  const add = (
    id: string,
    x: number,
    z: number,
    w: number,
    d: number,
    ry = 0,
    tint?: string,
    tier = 2,
  ) => {
    const m = buildModel(id, { w, d, tier, tint });
    m.group.position.set(x, 0, z);
    m.group.rotation.y = ry;
    root.add(m.group);
    screens.push(...m.screens);
    if (m.parts.deckL) decks.push(m.parts.deckL, m.parts.deckR!);
    return m;
  };
  const light = (c: string, i: number, x: number, y: number, z: number, dist = 9) => {
    const l = new THREE.PointLight(c, i, dist, 1.4);
    l.position.set(x, y, z);
    root.add(l);
    return l;
  };
  const seat = (i: number, x: number, z: number, ry: number, h: number) =>
    seats.set(i, { pos: new THREE.Vector3(x, 0, z), ry, h });
  const slots = o.slots;
  const accent = s.accent;
  const [g0, g1, g2] = s.glow;

  // ---- The floor.
  const floorKind = s.floor3d;
  const fw = open ? RW + 2 : RW;
  const fd = open ? RD + 1 : RD;
  {
    const t = floorTexture(floorKind, s.floorTint).clone();
    t.needsUpdate = true;
    const sc = FLOOR_SCALE[floorKind];
    t.repeat.set(fw / sc, fd / sc);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(fw, fd),
      mat('#ffffff', { map: t, rough: floorKind === 'marble' ? 0.25 : 0.8, own: true }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.z = open ? 0.4 : 0;
    m.receiveShadow = true;
    root.add(m);
  }

  // ---- The shell: walls, or what's beyond the edge.
  if (!open) {
    const wallMat = mat(s.wall, { rough: 0.9 });
    const mk = (w: number, d: number, x: number, z: number) => {
      const g = new THREE.BoxGeometry(w, 1, d);
      g.translate(0, 0.5, 0);
      const m = new THREE.Mesh(g, wallMat);
      m.position.set(x, 0, z);
      m.scale.y = WALL_H;
      m.receiveShadow = true;
      root.add(m);
      return m;
    };
    const back = mk(RW + 0.4, 0.2, 0, BACK - 0.1);
    const left = mk(0.2, RD + 0.2, -RW / 2 - 0.1, 0);
    const right = mk(0.2, RD + 0.2, RW / 2 + 0.1, 0);
    const front = mk(RW + 0.4, 0.2, 0, RD / 2 + 0.1);
    front.scale.y = 0.25;
    sides.push(
      { nx: 0, nz: -1, meshes: [back] },
      { nx: -1, nz: 0, meshes: [left] },
      { nx: 1, nz: 0, meshes: [right] },
    );
    k.box(RW, 0.1, 0.03, tone(s.wall, -0.2), 0, 0, BACK + 0.02);
  } else {
    backdrop(o, root, k);
  }

  // A sign: the style's neon word (or the venue's first word) on the back wall.
  const word = s.neon ?? o.sign?.split(' ')[0];
  // (A club has its own name in lights: ./club3d.ts.)
  if (word && !open && !s.club) {
    const nm = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 1.05),
      new THREE.MeshBasicMaterial({
        map: neonTexture(word, g0),
        transparent: true,
        depthWrite: false,
      }),
    );
    nm.position.set(s.layout === 'pub' || s.layout === 'speakeasy' ? -2.4 : 0, 2.45, BACK + 0.05);
    if (s.layout === 'band') nm.position.y = 2.6;
    root.add(nm);
  }

  // ---- Seats for the seated slots, by floor plan.
  const seated = slots.map((x, i) => ({ s: x, i })).filter((x) => x.s.sit);
  const seatKind = (sl: Slot): 'sofa' | 'stool' | 'table' | 'cushion' | 'lounger' | 'bench' => {
    switch (s.layout) {
      case 'dancefloor':
        return 'sofa';
      case 'rooftop':
        return has('cushions') ? 'cushion' : 'sofa';
      case 'pub':
        return sl.y < 200 ? 'stool' : 'table';
      case 'speakeasy':
        return sl.y < 195 ? 'stool' : sl.x < 150 ? 'sofa' : 'table';
      case 'shisha':
        return 'cushion';
      case 'beach':
        return 'lounger';
      case 'boat':
        return 'bench';
      default:
        return 'table';
    }
  };
  const sofaTint = has('gold') ? '#111827' : tone(accent, -0.05);
  const plastic = has('braai') ? '#dc2626' : s.layout === 'yard' ? '#f8fafc' : '#5b3a22';
  for (const p of pairs(seated)) {
    const kind = seatKind(p.a.s);
    const ax = vx(p.a.s.x);
    const az = vz(p.a.s.y);
    const bx = p.b ? vx(p.b.s.x) : ax;
    const mx = (ax + bx) / 2;
    const span = Math.abs(bx - ax) + 1.0;
    if (kind === 'stool') {
      for (const q of [p.a, p.b]) {
        if (!q) continue;
        chairAt(k, vx(q.s.x), vz(q.s.y), 0, 'bar', tone(accent, -0.2));
        seat(q.i, vx(q.s.x), vz(q.s.y), Math.PI, 0.78);
      }
      continue;
    }
    if (kind === 'sofa' || kind === 'bench') {
      if (kind === 'sofa')
        add('sofa', mx, az - 0.12, Math.min(2.6, span + 0.3), 0.9, 0, sofaTint, 3);
      else {
        k.box(span + 0.2, 0.42, 0.55, tone(accent, -0.2), mx, 0, az - 0.05, { round: 0.04 });
        k.box(span + 0.2, 0.5, 0.1, tone(accent, -0.3), mx, 0.42, az - 0.32);
      }
      // A low table in front, a candle or a bottle on it.
      k.box(Math.min(1.4, span - 0.2), 0.36, 0.5, '#1c1917', mx, 0, az + 0.75, { round: 0.03 });
      if (has('candles') || s.light === 'dim')
        k.cyl(0.04, 0.04, 0.1, '#fde68a', mx, 0.36, az + 0.75, {
          emissive: '#fbbf24',
          emissiveIntensity: 2,
        });
      else
        k.cyl(0.05, 0.06, 0.32, has('gold') ? '#ca8a04' : '#15803d', mx + 0.2, 0.36, az + 0.75, {
          rough: 0.2,
        });
      for (const q of [p.a, p.b]) if (q) seat(q.i, vx(q.s.x), az, 0, kind === 'sofa' ? 0.5 : 0.44);
      continue;
    }
    if (kind === 'cushion') {
      const c = [g0, g1, accent][p.a.i % 3]!;
      k.box(span + 0.3, 0.24, 0.8, tone(c, -0.15), mx, 0, az - 0.05, { round: 0.08 });
      k.box(span + 0.3, 0.45, 0.22, tone(c, -0.3), mx, 0.18, az - 0.4, { round: 0.08 });
      for (const dx of [-span / 3, span / 3])
        k.sphere(0.13, tone(c, 0.15), mx + dx, 0.42, az - 0.3, { sx: 1.4, sy: 1, sz: 0.6 });
      // The low table with its hookah.
      k.cyl(0.42, 0.42, 0.05, '#a16207', mx, 0.26, az + 0.75, { metal: 0.5, rough: 0.3, seg: 20 });
      k.cyl(0.08, 0.12, 0.26, '#78350f', mx, 0, az + 0.75);
      if (has('hookah') || s.layout === 'shisha')
        hookah(k, mx + 0.15, 0.31, az + 0.7, [g0, g1, g2][p.a.i % 3]!);
      for (const q of [p.a, p.b]) if (q) seat(q.i, vx(q.s.x), az, 0, 0.3);
      continue;
    }
    if (kind === 'lounger') {
      for (const q of [p.a, p.b]) {
        if (!q) continue;
        const x = vx(q.s.x);
        const z = vz(q.s.y);
        add('lounger', x, z, 0.8, 2, 0, '#f8fafc');
        seat(q.i, x, z + 0.1, 0, 0.55);
      }
      add('parasol', mx, az - 0.7, 1, 1, 0, accent);
      continue;
    }
    // A table between two chairs facing each other.
    const round = s.layout === 'band';
    const style = s.layout === 'yard' ? 'plastic' : 'dining';
    chairAt(k, ax, az, Math.PI / 2, style, plastic);
    if (p.b) chairAt(k, bx, az, -Math.PI / 2, style, plastic);
    const tx = p.b ? mx : ax + 0.75;
    if (round) {
      const cloth = has('gold') ? '#d4a017' : '#f8fafc';
      k.cyl(0.55, 0.62, 0.74, cloth, tx, 0, az, { seg: 20 });
      k.cyl(0.04, 0.04, 0.12, '#fde68a', tx, 0.74, az, {
        emissive: '#fbbf24',
        emissiveIntensity: 1.6,
      });
    } else if (s.layout === 'yard') {
      k.box(0.9, 0.04, 0.7, plastic, tx, 0.7, az);
      for (const [dx, dz] of [
        [-0.38, -0.28],
        [0.38, -0.28],
        [-0.38, 0.28],
        [0.38, 0.28],
      ] as const)
        k.cyl(0.025, 0.025, 0.7, tone(plastic, -0.15), tx + dx, 0, az + dz);
      if (has('calabash')) k.sphere(0.12, '#a16207', tx, 0.82, az, { sx: 1, sy: 0.8, sz: 1 });
      else
        for (const dx of [-0.15, 0.1])
          k.cyl(0.035, 0.035, 0.24, dx < 0 ? '#a16207' : '#15803d', tx + dx, 0.74, az, {
            rough: 0.2,
          });
    } else {
      add('restaurant-table', tx, az, 1.1, 0.8, Math.PI / 2, '#5b3a22');
      k.cyl(0.04, 0.04, 0.16, '#f59e0b', tx, 0.76, az, { opacity: 0.85 });
    }
    seat(p.a.i, ax, az, Math.PI / 2, 0.45);
    if (p.b) seat(p.b.i, bx, az, -Math.PI / 2, 0.45);
  }

  // ---- The floor plan's own things.
  const gold = has('gold') || s.club?.tier === 'luxe';
  const counter = (x0: number, x1: number, z: number, c: string, bottlesAt?: number) => {
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    k.box(w, 1.05, 0.6, c, cx, 0, z, { round: 0.03 });
    k.box(w + 0.12, 0.06, 0.72, '#1c1917', cx, 1.05, z, { rough: 0.2 });
    k.box(w, 0.04, 0.04, g1, cx, 0.1, z + 0.31, {
      emissive: g1,
      emissiveIntensity: 1.4,
      noShadow: true,
    });
    if (bottlesAt !== undefined)
      bottles(k, x0, x1, bottlesAt, gold ? '#fbbf24' : g0, s.light === 'dim');
    if (gold) k.box(w + 0.14, 0.03, 0.74, '#ca8a04', cx, 1.11, z, { metal: 0.85, rough: 0.2 });
  };
  const djBooth = (x: number, z: number) => {
    add('dj-booth', x, z, 1.8, 0.8, 0, g0);
  };
  switch (s.layout) {
    case 'dancefloor': {
      counter(3.5, 6, vz(150) + 0.65, tone(accent, -0.2), BACK + 0.2);
      speakers(k, [vx(112), vx(248)], vz(136) + 0.6, 1.6);
      // A club's own floor, booth and VIP corner (./club3d.ts).
      if (s.club) break;
      djBooth(vx(180), vz(136) + 0.8);
      // An LED floor that pulses to the beat.
      const tiles = [g0, g1, g2].map(
        (c) =>
          new THREE.MeshStandardMaterial({
            color: c,
            emissive: c,
            emissiveIntensity: 0.6,
            roughness: 0.3,
          }),
      );
      pulse.push(...tiles);
      const tg = new THREE.BoxGeometry(0.9, 0.02, 0.9);
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 4; j++) {
          const m = new THREE.Mesh(tg, tiles[(i + j) % 3]!);
          m.position.set(-2.3 + i * 0.95, 0.01, 0.0 + j * 0.95);
          m.receiveShadow = true;
          root.add(m);
        }
      if (has('vip')) {
        const gold = has('gold') ? '#ca8a04' : '#a1a1aa';
        k.box(3.7, 0.08, 3.2, tone(s.wall, 0.1), -4.15, 0, 1.4);
        for (const z of [-0.1, 1.2, 2.5]) {
          k.cyl(0.04, 0.06, 0.95, gold, -2.2, 0, z, { metal: 0.8, rough: 0.2 });
          k.sphere(0.07, gold, -2.2, 0.98, z, { metal: 0.8, rough: 0.2 });
        }
        k.box(0.05, 0.05, 2.6, '#b91c1c', -2.2, 0.8, 1.2);
        const vipSign = new THREE.Mesh(
          new THREE.PlaneGeometry(1.6, 0.4),
          new THREE.MeshBasicMaterial({
            map: neonTexture('VIP', has('gold') ? '#fbbf24' : g0),
            transparent: true,
            depthWrite: false,
          }),
        );
        vipSign.position.set(-4.4, 2.2, BACK + 0.05);
        root.add(vipSign);
      }
      break;
    }
    case 'warehouse': {
      // The DJ on a low riser, under a truss of lights.
      const riser = 0.3;
      if (!s.club) {
        k.box(7.2, riser, 1.9, '#18181b', 0, 0, BACK + 1.0);
        k.box(7.2, 0.04, 0.04, g0, 0, riser - 0.04, BACK + 1.96, {
          emissive: g0,
          emissiveIntensity: 2,
          noShadow: true,
        });
        const booth = add('dj-booth', 0, BACK + 1.55, 1.8, 0.8, 0, g0);
        booth.group.position.y = riser;
        slots.forEach((sl, i) => {
          if (sl.act === 'dj') lift.set(i, riser);
        });
      }
      k.box(9, 0.12, 0.12, '#52525b', 0, 2.75, -0.5, { metal: 0.6 });
      k.box(9, 0.12, 0.12, '#52525b', 0, 2.75, 1.2, { metal: 0.6 });
      for (let i = 0; i < 6; i++) k.cyl(0.09, 0.07, 0.2, '#27272a', -3.7 + i * 1.5, 2.55, -0.5, {});
      speakers(k, [-4.4, 4.4], BACK + 0.9, 2.3);
      for (const x of [-3.0, 3.0])
        k.box(0.45, WALL_H, 0.45, tone(s.wall, 0.08), x * 1.6, 0, BACK + 0.25);
      counter(-6, -4.2, vz(150) + 0.65, '#3f3f46', BACK + 0.2);
      if (has('arches')) arches(k, s.wall);
      break;
    }
    case 'pub': {
      const z = vz(146) + 0.75;
      counter(-5.6, 0.6, z, tone(accent, -0.15), BACK + 0.2);
      if (has('taps'))
        for (let i = 0; i < 5; i++) {
          const x = -4.6 + i * 0.5;
          k.cyl(0.02, 0.02, 0.32, '#ca8a04', x, 1.1, z - 0.1, { metal: 0.8, rough: 0.2 });
          k.box(
            0.06,
            0.12,
            0.06,
            ['#dc2626', '#1d4ed8', '#16a34a', '#facc15', '#f8fafc'][i]!,
            x,
            1.42,
            z - 0.1,
          );
        }
      // Wood panelling.
      k.box(RW, 1.0, 0.06, tone(s.wall, 0.1), 0, 0, BACK + 0.04);
      k.box(RW, 0.06, 0.1, tone(s.wall, 0.25), 0, 1.0, BACK + 0.06);
      if (has('darts')) {
        const dx = vx(266);
        k.box(0.8, 0.8, 0.05, '#1c1917', dx, 1.35, BACK + 0.06);
        k.cyl(0.28, 0.28, 0.04, '#111111', dx, 1.75, BACK + 0.1, { rx: Math.PI / 2, seg: 24 });
        k.cyl(0.22, 0.22, 0.045, '#b91c1c', dx, 1.75, BACK + 0.105, { rx: Math.PI / 2, seg: 24 });
        k.cyl(0.16, 0.16, 0.05, '#f5f5dc', dx, 1.75, BACK + 0.11, { rx: Math.PI / 2, seg: 24 });
        k.cyl(0.09, 0.09, 0.055, '#15803d', dx, 1.75, BACK + 0.115, { rx: Math.PI / 2, seg: 20 });
        k.cyl(0.03, 0.03, 0.06, '#b91c1c', dx, 1.75, BACK + 0.12, { rx: Math.PI / 2, seg: 12 });
        // The chalk scoreboard, and a line on the floor to throw from.
        k.box(0.6, 0.8, 0.04, '#1f2937', dx - 1.0, 1.35, BACK + 0.06);
        k.box(0.62, 0.02, 0.06, '#f8fafc', dx, 0.005, vz(168) + 0.9, { noShadow: true });
        slots.forEach((sl, i) => {
          if (sl.act === 'playing' && sl.x > 240) faces.set(i, Math.PI);
        });
      }
      if (has('pool')) {
        add('pool-table', vx(190) + 0.1, vz(218) - 0.25, 2.2, 1.2);
      }
      if (has('tv')) {
        k.box(1.5, 0.9, 0.06, '#111827', 4.8, 1.75, BACK + 0.06);
        const scr = mat('#16a34a', { emissive: '#22c55e', emissiveIntensity: 0.6, own: true });
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.76), scr);
        sm.position.set(4.8, 2.2, BACK + 0.1);
        root.add(sm);
        screens.push(scr);
      }
      if (has('chalkboard')) {
        k.box(1.1, 0.8, 0.05, '#1f2937', -1.3, 1.9, BACK + 0.06);
        for (let i = 0; i < 4; i++)
          k.box(0.8 - i * 0.12, 0.03, 0.02, '#f8fafc', -1.3, 2.1 - i * 0.15, BACK + 0.09, {
            noShadow: true,
          });
      }
      if (has('fermenters'))
        for (const x of [2.6, 3.7, 4.8]) {
          k.cyl(0.42, 0.42, 1.9, '#d4d4d8', x, 0.5, BACK + 0.6, { metal: 0.85, rough: 0.25 });
          k.cyl(0.42, 0.05, 0.5, '#d4d4d8', x, 2.4, BACK + 0.6, { metal: 0.85, rough: 0.25 });
          k.cyl(0.05, 0.42, 0.5, '#a1a1aa', x, 0, BACK + 0.6, { metal: 0.85, rough: 0.25 });
        }
      for (const x of [-3, 1.5]) pendant(k, x, -0.2, g0);
      if (has('fairy-lights')) bulbs(k, -6, 6, 2.6, -0.5, [g0, g1, g2]);
      break;
    }
    case 'speakeasy': {
      const z = vz(146) + 0.75;
      counter(-0.6, 6, z, tone(accent, -0.2), BACK + 0.2);
      // The back-lit bottle wall.
      k.plane(6.4, 1.3, tone(g0, -0.3), 2.7, 1.75, BACK + 0.03, {
        emissive: g0,
        emissiveIntensity: 0.5,
      });
      if (has('piano')) {
        add('piano', vx(52), vz(150) + 0.9, 1.5, 0.6, Math.PI);
        poses.playing = 'play';
        slots.forEach((sl, i) => {
          if (sl.act === 'playing' && sl.who === 'staff') faces.set(i, Math.PI);
        });
      }
      if (has('art'))
        for (const [x, c] of [
          [-5, g1],
          [-3.4, g2],
        ] as const) {
          k.box(1.1, 1.3, 0.05, '#78350f', x, 1.3, BACK + 0.05);
          k.plane(0.95, 1.15, c, x, 1.95, BACK + 0.09, { emissive: c, emissiveIntensity: 0.15 });
        }
      for (const x of [-2.5, 3.5]) pendant(k, x, 0.6, g0, 0.9);
      break;
    }
    case 'rooftop': {
      counter(3.4, 6.2, vz(152) + 0.7, tone(accent, -0.15));
      // A pergola over the bar.
      for (const x of [3.5, 6.1])
        for (const z of [-2.6, 0.2]) k.box(0.1, 2.6, 0.1, '#57534e', x, 0, z);
      for (let i = 0; i < 6; i++) k.box(2.8, 0.06, 0.12, '#78716c', 4.8, 2.6, -2.5 + i * 0.5);
      djBooth(vx(54), vz(142) + 0.75);
      railing(k, has('gold'));
      if (has('fairy-lights')) bulbs(k, -6.5, 6.5, 2.7, -1.2, [g0, g1, g2]);
      if (has('lanterns')) for (const x of [-3, 0, 3]) lantern(k, x, 2.2, 0.2, g0);
      if (has('plants')) {
        add('plants', -6.0, 2.6, 0.8, 0.8, 0, undefined, 3);
        add('plants', 6.0, 2.6, 0.8, 0.8, 0, undefined, 3);
      }
      if (has('palms')) palm(k, -6.6, -2.4);
      if (has('hookah')) hookah(k, vx(60), 0, vz(236), g0);
      break;
    }
    case 'shisha': {
      counter(3.6, 6, vz(150) + 0.65, tone(accent, -0.3), BACK + 0.2);
      // Arches on the walls, rugs on the floor, lanterns overhead.
      for (const x of [-4, -0.8, 2.2]) {
        k.box(0.18, 2.2, 0.12, tone(accent, -0.1), x - 1.0, 0, BACK + 0.08);
        k.box(0.18, 2.2, 0.12, tone(accent, -0.1), x + 1.0, 0, BACK + 0.08);
        arch(k, 1.0, 0.09, tone(accent, -0.1), x, 2.2, BACK + 0.08);
        k.plane(1.8, 2.2, tone(s.wall, -0.15), x, 1.1, BACK + 0.04, {});
      }
      const rug = new THREE.Mesh(
        new THREE.PlaneGeometry(8.4, 4.6),
        mat('#ffffff', { map: rugTexture(3, accent), own: true }),
      );
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(-0.6, 0.012, 1.1);
      rug.receiveShadow = true;
      root.add(rug);
      for (const [x, c] of [
        [-3.6, g0],
        [-0.5, g1],
        [2.4, g2],
      ] as const)
        lantern(k, x, 2.3, 0.4, c);
      if (has('oud')) oud(k, vx(58) + 0.3, 0, vz(150) + 0.35);
      if (has('tv')) {
        k.box(1.4, 0.85, 0.06, '#111827', 4.6, 1.8, BACK + 0.06);
        const scr = mat('#16a34a', { emissive: '#22c55e', emissiveIntensity: 0.6, own: true });
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 0.72), scr);
        sm.position.set(4.6, 2.22, BACK + 0.1);
        root.add(sm);
        screens.push(scr);
      }
      break;
    }
    case 'beach': {
      // The bar hut, a DJ by the water, the fire.
      counter(3.6, 6.2, vz(152) + 0.6, tone(accent, -0.25));
      for (const x of [3.6, 6.2]) k.box(0.12, 2.3, 0.12, '#78350f', x, 0, vz(152) + 0.2);
      k.cyl(0.2, 2.1, 0.9, '#ca8a04', 4.9, 2.3, vz(152) - 0.1, { seg: 8 });
      djBooth(vx(150), vz(140) + 0.7);
      if (has('bonfire')) fire(k, root, flames, vx(186), vz(210));
      for (const [x, z] of [
        [-5.6, -2.0],
        [-6.2, 1.6],
        [6.6, 2.6],
      ] as const)
        palm(k, x, z);
      if (has('gold'))
        for (const z of [-0.5, 1.5]) k.box(0.06, 1.2, 0.06, '#ca8a04', -3.0, 0, z, { metal: 0.8 });
      bulbs(k, -5.6, 4.0, 2.8, -1.6, [g0, g1, g2]);
      break;
    }
    case 'yard': {
      counter(3.3, 6.2, vz(148) + 0.65, tone(accent, -0.2));
      k.box(3.2, 0.1, 1.6, accent, 4.75, 2.5, vz(148) + 0.2);
      for (const x of [3.3, 6.2]) k.box(0.1, 2.5, 0.1, '#57534e', x, 0, vz(148) + 0.9);
      if (has('braai')) {
        braai(k, vx(70), vz(150) + 0.75);
        const l = light('#fb923c', 2.6, vx(70), 1.0, vz(150) + 0.75, 5);
        flames.push({ l });
        poses.serving = 'stir';
      }
      if (has('crates'))
        for (const [x, z] of [
          [2.0, -2.4],
          [2.5, -2.3],
        ] as const)
          for (let i = 0; i < 3; i++)
            k.box(0.5, 0.3, 0.38, ['#dc2626', '#facc15', '#16a34a'][i]!, x, i * 0.31, z);
      speakers(k, [-5.6], vz(186), 1.4);
      if (has('palms')) {
        palm(k, 5.8, -2.6);
        palm(k, -6.4, 1.8);
      }
      if (has('fairy-lights') || has('lanterns')) bulbs(k, -6, 6, 2.6, -0.4, [g0, g1, g2]);
      break;
    }
    case 'boat': {
      // The deck's sides and railing, a canopy of lights, the DJ.
      k.box(RW + 2, 0.5, 0.25, '#f8fafc', 0, 0, RD / 2 + 0.75);
      k.box(RW + 2, 0.5, 0.25, '#f8fafc', 0, 0, BACK - 0.2);
      for (let i = 0; i <= 12; i++) {
        k.cyl(0.03, 0.03, 0.95, '#e5e7eb', -6.5 + i * (13 / 12), 0.5, BACK - 0.2, { metal: 0.7 });
      }
      k.box(RW + 2, 0.05, 0.05, '#e5e7eb', 0, 1.45, BACK - 0.2, { metal: 0.7 });
      for (const x of [-5, 5])
        for (const z of [-2.8, 2.8]) k.cyl(0.06, 0.06, 2.8, '#e5e7eb', x, 0, z, { metal: 0.6 });
      bulbs(k, -5, 5, 2.8, -2.8, [g0, g1, g2]);
      bulbs(k, -5, 5, 2.8, 2.8, [g1, g2, g0]);
      djBooth(vx(190), vz(140) + 0.75);
      counter(-6.2, -3.6, vz(152) + 0.65, tone(accent, -0.2));
      if (has('lanterns')) for (const x of [-2.5, 2.5]) lantern(k, x, 2.4, 0, g0);
      break;
    }
    case 'band': {
      // The stage and the band on it.
      const h = 0.32;
      k.box(8.2, h, 2.0, tone(accent, -0.45), 0.2, 0, BACK + 1.1);
      k.box(8.2, 0.05, 0.05, g0, 0.2, h - 0.05, BACK + 2.1, {
        emissive: g0,
        emissiveIntensity: 1.6,
        noShadow: true,
      });
      slots.forEach((sl, i) => {
        if (sl.who === 'staff' && sl.y < 140) lift.set(i, h);
      });
      if (has('drums')) drums(k, vx(240) + 0.1, h, vz(136) - 0.65);
      if (has('piano')) {
        const pm = add('piano', vx(240), BACK + 0.55, 1.5, 0.6, 0);
        pm.group.position.y = h;
      }
      if (has('oud')) oud(k, vx(118) + 0.3, h, vz(136) + 0.2);
      else guitar(k, vx(118) + 0.25, h, vz(136) + 0.15, g1);
      add('mic', vx(180), vz(134) + 0.25, 0.4, 0.4).group.position.y = h;
      speakers(k, [-4.8, 5.2], BACK + 0.8, 1.5, h);
      counter(5.0, 6.2, vz(150) + 0.65, tone(accent, -0.25), BACK + 0.2);
      if (has('palms')) {
        palm(k, -6.6, -1.8);
        palm(k, 6.8, 2.2);
      }
      if (has('fairy-lights') || has('lanterns')) bulbs(k, -6, 6, 2.8, 0.3, [g0, g1, g2]);
      if (has('gold'))
        k.plane(8.2, 2.2, '#ca8a04', 0.2, 1.6, BACK + 0.04, {
          emissive: '#a16207',
          emissiveIntensity: 0.4,
          metal: 0.6,
        });
      poses.playing = 'clap';
      poses.singing = 'sing';
      break;
    }
  }
  let club: ClubParts | null = null;
  if (s.club)
    club = buildClubParts({
      style: s,
      look: s.club,
      k,
      root,
      slots,
      lift,
      pulse,
      decks,
      model: (id, x, z, w, d, ry, tint) => add(id, x, z, w, d, ry, tint),
      lite: softwareGl(),
    });
  if (has('graffiti') && !open) {
    const gm = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 1.6),
      new THREE.MeshStandardMaterial({ map: muralTexture(s.glow), roughness: 0.9 }),
    );
    gm.position.set(s.layout === 'warehouse' ? 0 : -2.8, 1.25, BACK + 0.03);
    if (s.layout === 'warehouse') gm.position.y = 1.9;
    root.add(gm);
  }
  if (has('mirrorball')) {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 14, 10),
      mat('#e5e7eb', { metal: 0.95, rough: 0.12 }),
    );
    ball.position.set(0, 2.65, 0.6);
    root.add(ball);
    decks.push(ball);
  }

  // ---- Light.
  const lit = s.light === 'neon' || s.light === 'disco' || s.light === 'strobe';
  if (lit) {
    const cs = [g0, g1, g2];
    const n = s.light === 'strobe' ? 2 : 3;
    for (let i = 0; i < n; i++) movers.push(light(cs[i]!, 6, (i - (n - 1) / 2) * 3.4, 2.6, 0.8));
  } else if (!open || s.light === 'lantern') {
    for (const x of [-3.5, 3.5])
      lamps.push(
        light(
          s.light === 'dim' ? '#fbbf24' : '#ffcf8f',
          s.light === 'dim' ? 1.4 : 2.6,
          x,
          2.5,
          0.2,
        ),
      );
  } else {
    lamps.push(light(g0, 2.2, -2.5, 2.4, 0.5));
    if (o.night) lamps.push(light(g1, 1.8, 3, 2.4, 1.2));
  }
  if (club ? club.beams : has('lasers') || lit) {
    const beamMat = new THREE.MeshBasicMaterial({
      color: g0,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beamMat2 = beamMat.clone();
    beamMat2.color.set(g1);
    const cone = new THREE.ConeGeometry(0.55, 3.2, 10, 1, true);
    cone.translate(0, -1.6, 0);
    for (const [x, m] of [
      [-3.2, beamMat],
      [0, beamMat2],
      [3.2, beamMat],
    ] as const) {
      const b = new THREE.Mesh(cone, m);
      b.position.set(x, 2.95, 0.2);
      root.add(b);
      beams.push(b);
    }
  }

  root.add(k.build());

  // ---- The scene's air.
  const env = envOf(s, o.night, open);
  const bpm = GENRES[s.genre].groove.bpm;
  const animate = (t: number, dt: number, reduced: boolean) => {
    void dt;
    if (reduced) return;
    const beat = (t * bpm) / 60;
    const ph = beat % 1;
    beams.forEach((b, i) => {
      if (b.userData.static) return;
      b.rotation.z = Math.sin(t * 0.9 + i * 2.1) * 0.55;
      b.rotation.x = Math.cos(t * 0.7 + i) * 0.35;
    });
    pulse.forEach((m, i) => {
      m.emissiveIntensity = 0.25 + (Math.floor(beat) % 3 === i ? 1.3 * (1 - ph) : 0.1);
    });
    movers.forEach((l, i) => {
      l.position.x = Math.sin(t * 0.8 + i * 2) * 4;
      l.position.z = Math.cos(t * 0.6 + i) * 2;
      l.intensity = s.light === 'strobe' ? (ph < 0.12 ? 9 : 2.5) : 5 + 2 * (1 - ph);
    });
    for (const f of flames) f.l.intensity = 2.2 + Math.sin(t * 13) * 0.4 + Math.sin(t * 7.3) * 0.3;
    club?.animate(t, beat, ph);
  };

  return {
    root,
    sides,
    seats,
    screens,
    decks,
    movers: [],
    lamps,
    env,
    lift,
    faces,
    poses,
    animate,
  };
}

function envOf(s: NightStyle, night: boolean, open: boolean): NightEnv {
  if (open) {
    const top = night ? tone(s.wall, 0.1) : s.light === 'sunset' ? '#5b8fd6' : '#7dd3fc';
    const low = night ? tone(s.wall, 0.42) : s.light === 'sunset' ? '#f8b26a' : '#e0f2fe';
    return {
      background: skyTexture(top, low),
      hemi: night ? 0.55 : 1.15,
      hemiColor: night ? '#a5b4fc' : '#ffe9cc',
      sun: night ? 0.35 : 1.9,
      ambient: night ? 0.18 : 0.3,
      elevation: 0.46,
    };
  }
  const bg = new THREE.Color(tone(s.wall, -0.2));
  switch (s.light) {
    case 'neon':
    case 'disco':
      return { background: bg, hemi: 0.35, hemiColor: s.glow[0], sun: 0.3, ambient: 0.15 };
    case 'strobe':
      return { background: bg, hemi: 0.25, hemiColor: '#e5e7eb', sun: 0.22, ambient: 0.1 };
    case 'dim':
      return { background: bg, hemi: 0.5, hemiColor: '#ffd7a0', sun: 0.45, ambient: 0.2 };
    case 'lantern':
      return { background: bg, hemi: 0.55, hemiColor: '#ffcf9a', sun: 0.5, ambient: 0.2 };
    default:
      return {
        background: bg,
        hemi: night ? 0.75 : 0.95,
        hemiColor: '#fff1d6',
        sun: night ? 0.7 : 1.1,
        ambient: 0.25,
      };
  }
}

// ---------------------------------------------------------------------------
// What's beyond an open-air venue.

function backdrop(o: NightOpts, root: THREE.Group, k: Kit) {
  const s = o.style;
  const night = o.night;
  const b =
    s.backdrop ?? (s.layout === 'beach' ? 'sea' : s.layout === 'boat' ? 'river' : 'skyline');
  const water = mat(night ? '#0c4a6e' : '#0ea5e9', {
    rough: 0.12,
    metal: 0.2,
    emissive: night ? '#082f49' : '#0369a1',
    emissiveIntensity: 0.25,
  });
  const winTex = windowsTexture(night);
  const tower = (x: number, z: number, w: number, h: number, base = -6) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, w),
      new THREE.MeshStandardMaterial({
        map: winTex,
        emissive: night ? '#fde68a' : '#000000',
        emissiveMap: night ? winTex : null,
        emissiveIntensity: night ? 0.6 : 0,
        roughness: 0.8,
      }),
    );
    m.position.set(x, base + h / 2, z);
    root.add(m);
  };
  const towers = (n: number, z: number, hmax: number, seed: number) => {
    for (let i = 0; i < n; i++) {
      const h = 6 + ((i * 37 + seed * 11) % hmax);
      tower(-22 + (i * 44) / (n - 1), z - (i % 3) * 3, 2.4 + (i % 3) * 0.8, h);
    }
  };
  const sea = (y: number, z: number, depth = 40) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(90, depth), water);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, y, z);
    root.add(m);
  };
  const onRoof = s.layout === 'rooftop';
  switch (b) {
    case 'sea':
      if (onRoof) sea(-5, -24);
      else {
        sea(0.02, BACK - 16.5, 30);
        const surf = new THREE.Mesh(
          new THREE.PlaneGeometry(40, 0.6),
          mat('#f0f9ff', { opacity: 0.7 }),
        );
        surf.rotation.x = -Math.PI / 2;
        surf.position.set(0, 0.04, BACK - 1.4);
        root.add(surf);
        // Sand down to the water.
        const sand = new THREE.Mesh(new THREE.PlaneGeometry(40, 3), mat('#e8c98f'));
        sand.rotation.x = -Math.PI / 2;
        sand.position.set(0, 0.005, BACK - 0.5);
        root.add(sand);
      }
      break;
    case 'lagoon':
      sea(-5, -16, 22);
      towers(9, -18, 14, 3);
      break;
    case 'river': {
      sea(onRoof ? -6 : -0.6, -20, 36);
      if (s.layout === 'boat') sea(-0.6, 14, 20);
      towers(11, -20, 12, 5);
      for (const x of [-12, 9]) {
        k.cyl(0.6, 0.8, 16, '#475569', x, -6, -16);
        k.sphere(1.2, '#475569', x, 10.4, -16);
        k.cyl(0.12, 0.12, 2.2, '#475569', x, 11.2, -16);
      }
      // Lights on the water.
      for (let i = 0; i < 9; i++)
        k.box(
          1.4,
          0.02,
          0.1,
          s.glow[i % 3]!,
          -16 + i * 4,
          onRoof ? -5.95 : -0.55,
          -10 - (i % 3) * 2,
          {
            emissive: s.glow[i % 3],
            emissiveIntensity: 2,
            noShadow: true,
          },
        );
      break;
    }
    case 'hills': {
      const hill = (x: number, z: number, r: number, c: string) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10), mat(c, { rough: 0.95 }));
        m.scale.y = 0.38;
        m.position.set(x, -6, z);
        root.add(m);
      };
      hill(-14, -20, 16, night ? '#14532d' : '#4d7c0f');
      hill(10, -24, 20, night ? '#166534' : '#65a30d');
      hill(-2, -15, 11, night ? '#15803d' : '#84cc16');
      for (let i = 0; i < 14; i++)
        k.sphere(0.15, '#fde68a', -18 + i * 2.7, -2.4 + (i % 4) * 0.7, -22 - (i % 3) * 4, {
          emissive: '#fde68a',
          emissiveIntensity: night ? 2 : 0.2,
        });
      break;
    }
    case 'spire':
      towers(10, -20, 14, 9);
      // The tallest tower in the world, lit up its whole height.
      k.cyl(0.35, 1.6, 30, night ? '#cbd5e1' : '#e2e8f0', -1.5, -6, -13, {
        metal: 0.6,
        rough: 0.3,
        seg: 6,
        emissive: '#93c5fd',
        emissiveIntensity: night ? 0.35 : 0,
      });
      k.cyl(0.02, 0.35, 8, '#e2e8f0', -1.5, 24, -13, { seg: 6 });
      for (let i = 0; i < 8; i++)
        k.sphere(0.25, '#fde68a', -1.5, -2 + i * 3.6, -12.2, {
          emissive: '#fde68a',
          emissiveIntensity: night ? 2 : 0.2,
        });
      if (s.layout === 'beach') sea(0.02, BACK - 16.5, 30);
      break;
    case 'bridge': {
      sea(-6, -22, 34);
      towers(6, -26, 10, 2);
      for (const x of [-9, 9]) {
        k.box(0.8, 18, 0.8, '#c2410c', x, -6, -20);
        k.box(2.2, 0.5, 0.8, '#c2410c', x, 9, -20);
      }
      k.box(40, 0.5, 1.2, '#9a3412', 0, 1.5, -20);
      for (let i = 0; i <= 20; i++) {
        const x = -20 + i * 2;
        const u = Math.abs(((x + 9) % 18) - 9) / 9;
        k.box(0.06, 0.6 + u * u * 9.5, 0.06, '#c2410c', x, 2, -20);
      }
      break;
    }
    case 'wheel': {
      towers(10, -20, 9, 2);
      sea(-6, -20, 26);
      k.torus(7, 0.15, night ? '#93c5fd' : '#e2e8f0', 9, 4, -16, { seg: 40 });
      for (let i = 0; i < 8; i++)
        k.box(0.06, 14, 0.06, '#e2e8f0', 9, -3, -16, { rz: (i * Math.PI) / 8 });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        k.sphere(0.35, '#f8fafc', 9 + Math.cos(a) * 7, 4 + Math.sin(a) * 7, -16, {
          emissive: '#bae6fd',
          emissiveIntensity: night ? 1.4 : 0,
        });
      }
      break;
    }
    case 'wall': {
      // A courtyard wall, painted.
      k.box(RW + 2, 2.4, 0.25, s.wall, 0, 0, BACK - 0.2);
      k.box(RW + 2, 0.12, 0.35, tone(s.wall, -0.2), 0, 2.4, BACK - 0.2);
      for (const [x, c] of [
        [-4, s.glow[0]],
        [0, s.glow[1]],
        [4, s.glow[2]],
      ] as const)
        k.plane(2.6, 1.2, c, x, 1.3, BACK - 0.06, { opacity: 0.55 });
      break;
    }
    default:
      towers(12, -18, 16, 1);
  }
  // A rooftop is high up: a parapet and a glimpse of street far below.
  if (onRoof) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 30),
      mat(night ? '#0b1220' : '#94a3b8'),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -6.1, -8);
    root.add(ground);
  }
}

// ---------------------------------------------------------------------------
// Props (low-poly, into the kit)

function bottles(k: Kit, x0: number, x1: number, z: number, glow: string, dim: boolean) {
  const w = x1 - x0;
  k.box(w, 1.6, 0.28, '#2a1d14', (x0 + x1) / 2, 0.9, z);
  k.plane(w - 0.1, 1.2, tone(glow, -0.25), (x0 + x1) / 2, 1.75, z + 0.15, {
    emissive: glow,
    emissiveIntensity: dim ? 0.55 : 0.3,
  });
  for (const y of [1.3, 1.75]) {
    k.box(w, 0.04, 0.25, '#3f2a1c', (x0 + x1) / 2, y, z + 0.1);
    for (let i = 0; i < Math.floor(w / 0.17); i++)
      k.cyl(
        0.035,
        0.035,
        0.22 + (i % 3) * 0.05,
        ['#15803d', '#b45309', '#e5e7eb', '#7c2d12', '#0e7490'][i % 5]!,
        x0 + 0.1 + i * 0.17,
        y + 0.04,
        z + 0.12,
        { opacity: 0.85, rough: 0.1 },
      );
  }
}

function speakers(k: Kit, xs: number[], z: number, h: number, y = 0) {
  for (const x of xs) {
    k.box(0.7, h, 0.6, '#111827', x, y, z, { round: 0.02 });
    for (let i = 0; i < Math.floor(h / 0.55); i++)
      k.cyl(0.2, 0.2, 0.03, '#374151', x, y + 0.3 + i * 0.55, z + 0.3, {
        rx: Math.PI / 2,
        seg: 14,
      });
  }
}

function pendant(k: Kit, x: number, z: number, c: string, y = 2.3) {
  k.cyl(0.005, 0.005, WALL_H - y, '#111', x, y + 0.2, z);
  k.cyl(0.08, 0.24, 0.22, '#1c1917', x, y, z);
  k.sphere(0.07, c, x, y + 0.02, z, { emissive: c, emissiveIntensity: 2 });
}

function lantern(k: Kit, x: number, y: number, z: number, c: string) {
  k.cyl(0.005, 0.005, 0.6, '#44403c', x, y + 0.35, z);
  k.cyl(0.14, 0.1, 0.36, '#a16207', x, y, z, { metal: 0.6, rough: 0.3, seg: 8 });
  k.sphere(0.1, c, x, y + 0.17, z, { emissive: c, emissiveIntensity: 2.4 });
  k.cyl(0.02, 0.14, 0.12, '#a16207', x, y + 0.36, z, { seg: 8 });
}

/** A catenary of bulbs between two posts. */
function bulbs(k: Kit, x0: number, x1: number, y: number, z: number, cs: string[]) {
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = x0 + (x1 - x0) * u;
    const yy = y - Math.sin(u * Math.PI) * 0.45;
    k.sphere(0.06, cs[i % cs.length]!, x, yy, z, {
      emissive: cs[i % cs.length],
      emissiveIntensity: 2.2,
      noShadow: true,
      seg: 6,
    });
  }
}

function railing(k: Kit, gold: boolean) {
  const c = gold ? '#ca8a04' : '#a1a1aa';
  k.box(RW + 2, 1.0, 0.04, '#bae6fd', 0, 0.05, BACK - 0.05, { opacity: 0.25, noShadow: true });
  k.box(RW + 2, 0.06, 0.08, c, 0, 1.05, BACK - 0.05, { metal: 0.8, rough: 0.2 });
  for (const x of [-(RW / 2 + 0.9), RW / 2 + 0.9]) {
    k.box(0.04, 1.0, RD + 1, '#bae6fd', x, 0.05, 0.4, { opacity: 0.25, noShadow: true });
    k.box(0.08, 0.06, RD + 1, c, x, 1.05, 0.4, { metal: 0.8, rough: 0.2 });
  }
}

function palm(k: Kit, x: number, z: number) {
  k.cyl(0.1, 0.16, 3.4, '#8b5a2b', x, 0, z, { rz: 0.12 });
  for (let i = 0; i < 6; i++)
    k.box(1.4, 0.05, 0.35, '#15803d', x + Math.cos(i) * 0.6 + 0.4, 3.35, z + Math.sin(i) * 0.6, {
      ry: i,
      rz: -0.3,
    });
}

function hookah(k: Kit, x: number, y: number, z: number, c: string) {
  k.sphere(0.12, c, x, y + 0.12, z, { opacity: 0.85, rough: 0.1 });
  k.cyl(0.02, 0.025, 0.4, '#a8a29e', x, y + 0.22, z, { metal: 0.8, rough: 0.3 });
  k.cyl(0.07, 0.04, 0.07, '#78350f', x, y + 0.62, z);
  k.sphere(0.035, '#f97316', x, y + 0.7, z, { emissive: '#f97316', emissiveIntensity: 2 });
  k.torus(0.16, 0.012, '#57534e', x + 0.12, y + 0.35, z, { ry: 0.6, seg: 12 });
}

function oud(k: Kit, x: number, y: number, z: number) {
  k.sphere(0.2, '#a16207', x, y + 1.05, z, { sx: 1, sy: 1.25, sz: 0.55 });
  k.box(0.05, 0.42, 0.04, '#78350f', x + 0.05, y + 1.25, z, { rz: -0.6 });
  k.box(0.08, 0.1, 0.05, '#78350f', x + 0.24, y + 1.48, z, { rz: -1.2 });
}

function guitar(k: Kit, x: number, y: number, z: number, c: string) {
  k.box(0.32, 0.36, 0.08, c, x, y + 0.85, z, { round: 0.06 });
  k.box(0.05, 0.5, 0.03, '#1c1917', x + 0.15, y + 1.05, z, { rz: -0.7 });
  // The amp behind.
  k.box(0.6, 0.55, 0.35, '#18181b', x - 0.4, y, z - 0.8, { round: 0.02 });
  k.plane(0.5, 0.35, '#3f3f46', x - 0.4, y + 0.3, z - 0.62, {});
}

function drums(k: Kit, x: number, y: number, z: number) {
  k.cyl(0.32, 0.32, 0.4, '#b91c1c', x, y + 0.1, z, { rx: Math.PI / 2, seg: 18 });
  k.cyl(0.33, 0.33, 0.02, '#f5f5f4', x, y + 0.1, z + 0.21, { rx: Math.PI / 2, seg: 18 });
  for (const [dx, dy] of [
    [-0.45, 0.55],
    [0.45, 0.55],
  ] as const)
    k.cyl(0.16, 0.16, 0.16, '#b91c1c', x + dx, y + dy, z + 0.1, { seg: 14 });
  for (const dx of [-0.75, 0.75]) {
    k.cyl(0.015, 0.015, 1.0, '#a1a1aa', x + dx, y, z, { metal: 0.8 });
    k.cyl(0.26, 0.26, 0.01, '#fbbf24', x + dx, y + 1.0, z, { metal: 0.9, rough: 0.2, seg: 18 });
  }
}

function braai(k: Kit, x: number, z: number) {
  // A drum braai on legs, coals glowing, meat on the grid.
  for (const [dx, dz] of [
    [-0.35, -0.2],
    [0.35, -0.2],
    [-0.35, 0.2],
    [0.35, 0.2],
  ] as const)
    k.cyl(0.025, 0.025, 0.7, '#3f3f46', x + dx, 0, z + dz);
  k.cyl(0.32, 0.32, 1.0, '#27272a', x, 0.85, z, { rz: Math.PI / 2, seg: 14 });
  k.box(0.95, 0.04, 0.55, '#f97316', x, 0.85, z, {
    emissive: '#ea580c',
    emissiveIntensity: 2.2,
    noShadow: true,
  });
  k.box(1.0, 0.02, 0.6, '#71717a', x, 0.92, z, { metal: 0.7 });
  for (let i = 0; i < 5; i++)
    k.box(0.16, 0.05, 0.08, '#7c2d12', x - 0.36 + i * 0.18, 0.94, z - 0.1 + (i % 2) * 0.2);
}

function fire(k: Kit, root: THREE.Group, flames: { l: THREE.PointLight }[], x: number, z: number) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.sphere(0.16, '#57534e', x + Math.cos(a) * 0.55, 0.08, z + Math.sin(a) * 0.55, { sy: 0.6 });
  }
  k.box(0.9, 0.1, 0.1, '#78350f', x, 0.05, z, { ry: 0.6 });
  k.box(0.9, 0.1, 0.1, '#78350f', x, 0.05, z, { ry: -0.6 });
  k.cyl(0.0, 0.3, 0.7, '#f97316', x, 0.1, z, {
    emissive: '#f97316',
    emissiveIntensity: 2.4,
    noShadow: true,
    seg: 8,
  });
  k.cyl(0.0, 0.16, 0.45, '#fde047', x, 0.12, z, {
    emissive: '#fde047',
    emissiveIntensity: 2.4,
    noShadow: true,
    seg: 8,
  });
  const l = new THREE.PointLight('#fb923c', 2.4, 6, 1.4);
  l.position.set(x, 0.9, z);
  root.add(l);
  flames.push({ l });
}

/** Half a ring, standing (an arch's top). */
function arch(k: Kit, r: number, tube: number, c: string, x: number, y: number, z: number) {
  k.add(new THREE.TorusGeometry(r, tube, 6, 16, Math.PI), mat(c), x, y, z, {});
}

function arches(k: Kit, wall: string) {
  // Railway arches in brick along the back.
  const brick = tone(wall, 0.12);
  for (const x of [-4, 0, 4]) {
    k.box(0.35, 1.8, 0.2, brick, x - 1.7, 0, BACK + 0.12);
    arch(k, 1.7, 0.18, brick, x, 1.8, BACK + 0.12);
    k.plane(3.0, 1.8, tone(wall, -0.25), x, 0.9, BACK + 0.05, {});
  }
  k.box(0.35, 1.8, 0.2, brick, 5.7, 0, BACK + 0.12);
}
