/**
 * A club's own room in 3D (player feedback: "The clubs all look the same"):
 * what ../city/clubLook.ts picked for it, over its city's dance-floor or
 * warehouse plan (./nightlife3d.ts keeps the bar, the seats and the light).
 *
 * The dance floor's shape (a grid, a wide strip, a round floor, a raised
 * stage), the DJ booth (decks, a riser, a pod, a gold throne), the light rig
 * (lasers, strobes, an LED wall, chandeliers; beams stay with nightlife3d),
 * a VIP corner and a mezzanine, the material's own touches (velvet drapes,
 * marble columns, gold pilasters, neon tubes, a mural, palms) and the club's
 * name in lights. Static parts go into the shared kit (merged per material);
 * the few animated ones keep their own materials. Lite (software WebGL)
 * draws fewer of the costly bits. Nothing moves when motion is reduced:
 * nightlife3d's animate stops before calling ours, and strobes rest dim.
 */
import * as THREE from 'three';
import type { ClubLook, SignFont } from '../city/clubLook';
import type { NightStyle } from '../city/nightlife';
import type { Slot } from '../city/rooms';
import { mat, tone, type Kit } from './kit';
import { BACK, RD, RW, WALL_H, vx, vz } from './venues';

export interface ClubCtx {
  style: NightStyle;
  look: ClubLook;
  k: Kit;
  root: THREE.Group;
  slots: Slot[];
  lift: Map<number, number>;
  /** Floor tiles that pulse with nightlife3d's beat. */
  pulse: THREE.MeshStandardMaterial[];
  /** Decks the DJ plays (nightlife3d hands them to the act rig). */
  decks: THREE.Object3D[];
  /** A furniture model (nightlife3d's `add`). */
  model: (
    id: string,
    x: number,
    z: number,
    w: number,
    d: number,
    ry?: number,
    tint?: string,
  ) => {
    group: THREE.Group;
  };
  /** Software WebGL: fewer beams and drops. */
  lite: boolean;
}

export interface ClubParts {
  /** Per frame, with the beat (in beats) and its phase (0–1). */
  animate: (t: number, beat: number, ph: number) => void;
  /** nightlife3d's swinging cones are wanted too. */
  beams: boolean;
}

// ---------------------------------------------------------------------------
// Textures

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

const FONT: Record<SignFont, string> = {
  sans: '900 92px system-ui, sans-serif',
  serif: '700 92px Georgia, "Times New Roman", serif',
  mono: '700 86px ui-monospace, Menlo, monospace',
  script: 'italic 700 96px "Brush Script MT", "Segoe Script", cursive',
};

/** The club's name in lights. */
function signTexture(text: string, color: string, font: SignFont) {
  return tex(`club-sign:${text}:${color}:${font}`, 1024, 160, (g) => {
    g.clearRect(0, 0, 1024, 160);
    g.font = FONT[font];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 26;
    g.fillStyle = color;
    g.fillText(text, 512, 84, 990);
    g.shadowBlur = 0;
    g.globalAlpha = 0.6;
    g.fillStyle = '#ffffff';
    g.fillText(text, 512, 84, 990);
  });
}

/** An LED wall: bars of the palette that scroll. */
function ledTexture(glow: readonly string[]) {
  const t = tex(`club-led:${glow.join()}`, 256, 64, (g) => {
    g.fillStyle = '#05050a';
    g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 32; i++) {
      const h = 10 + ((i * 37) % 50);
      g.fillStyle = glow[i % 3]!;
      g.fillRect(i * 8 + 1, 64 - h, 6, h);
    }
    // The pixel grid.
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 0; y < 64; y += 4) g.fillRect(0, y, 256, 1);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Spray paint on a raw wall. */
function muralTexture(glow: readonly string[]) {
  return tex(`club-mural:${glow.join()}`, 512, 256, (g) => {
    g.fillStyle = '#3f3f46';
    g.fillRect(0, 0, 512, 256);
    g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      g.strokeStyle = glow[i % 3]!;
      g.lineWidth = 14 + (i % 3) * 10;
      g.beginPath();
      g.moveTo(10 + i * 72, 220);
      g.bezierCurveTo(50 + i * 70, 20, 90 + i * 66, 240, 150 + i * 60, 60);
      g.stroke();
    }
  });
}

const glowMat = (c: string, i = 1.6) =>
  new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.35 });

// ---------------------------------------------------------------------------

export function buildClubParts(c: ClubCtx): ClubParts {
  const { look, k, root, slots, lift } = c;
  const [g0, g1, g2] = look.glow;
  const luxe = look.tier === 'luxe';
  const gold = '#ca8a04';
  const trim = luxe ? gold : '#a1a1aa';
  const warehouse = c.style.layout === 'warehouse';
  const djAt = slots.findIndex((s) => s.act === 'dj');
  const dj = slots[djAt];
  const djX = dj ? vx(dj.x) : 0;
  const djZ = dj ? vz(dj.y) : BACK + 1;
  const boothZ = djZ + 0.75;
  const strobes: THREE.MeshStandardMaterial[] = [];
  const lasers: THREE.Object3D[] = [];
  let led: THREE.Texture | null = null;
  const rings: THREE.MeshStandardMaterial[] = [];

  // ---- The dance floor.
  const cx = 0.1;
  const cz = 1.35;
  const tiles = [g0, g1, g2].map((col) => glowMat(col, 0.6));
  c.pulse.push(...tiles);
  const grid = (nx: number, nz: number, size: number, x0: number, z0: number, y = 0.01) => {
    const geo = new THREE.BoxGeometry(size - 0.05, 0.02, size - 0.05);
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const m = new THREE.Mesh(geo, tiles[(i + j) % 3]!);
        m.position.set(x0 + i * size, y, z0 + j * size);
        m.receiveShadow = true;
        root.add(m);
      }
  };
  let floorLift = 0;
  switch (look.floorShape) {
    case 'grid':
      grid(6, 4, 0.95, -2.3, 0);
      break;
    case 'wide':
      grid(8, 3, 0.85, -2.6, 0.3);
      break;
    case 'round': {
      const rings3 = c.lite ? 2 : 3;
      const sectors = c.lite ? 6 : 10;
      for (let r = 0; r < rings3; r++) {
        const inner = r === 0 ? 0 : 0.2 + r * 0.62;
        const outer = 0.15 + (r + 1) * 0.62;
        for (let s = 0; s < sectors; s++) {
          const geo = new THREE.RingGeometry(
            inner,
            outer,
            6,
            1,
            (s / sectors) * Math.PI * 2,
            (Math.PI * 2) / sectors - 0.04,
          );
          geo.rotateX(-Math.PI / 2);
          const m = new THREE.Mesh(geo, tiles[(s + r) % 3]!);
          m.position.set(cx, 0.012, cz);
          root.add(m);
        }
      }
      const rim = glowMat(luxe ? '#fbbf24' : g1, 1.8);
      rings.push(rim);
      const tor = new THREE.Mesh(new THREE.TorusGeometry(0.2 + rings3 * 0.62, 0.035, 6, 48), rim);
      tor.rotation.x = -Math.PI / 2;
      tor.position.set(cx, 0.03, cz);
      root.add(tor);
      break;
    }
    case 'raised': {
      floorLift = 0.14;
      const w = 5.6;
      const d = 3.3;
      k.box(w, floorLift - 0.02, d, luxe ? '#1c1917' : '#18181b', cx, 0, cz, { round: 0.02 });
      for (const [dx, dz, ww, dd] of [
        [0, d / 2, w, 0.04],
        [0, -d / 2, w, 0.04],
        [w / 2, 0, 0.04, d],
        [-w / 2, 0, 0.04, d],
      ] as const)
        k.box(ww, 0.04, dd, luxe ? '#fbbf24' : g1, cx + dx, floorLift - 0.08, cz + dz, {
          emissive: luxe ? '#fbbf24' : g1,
          emissiveIntensity: 2,
          noShadow: true,
        });
      grid(5, 3, 1.0, cx - 2.0, cz - 1.0, floorLift);
      slots.forEach((sl, i) => {
        if (sl.act !== 'dancing') return;
        const x = vx(sl.x);
        const z = vz(sl.y);
        if (Math.abs(x - cx) < w / 2 - 0.15 && Math.abs(z - cz) < d / 2 - 0.15)
          lift.set(i, floorLift);
      });
      break;
    }
  }

  // ---- The DJ booth.
  const deckGlow = (x: number, y: number, z: number) => {
    // Two platters, glowing, that the act rig spins.
    for (const dx of [-0.35, 0.35]) {
      const p = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.17, 0.03, 18),
        mat('#18181b', { metal: 0.4, rough: 0.4 }),
      );
      p.position.set(x + dx, y + 0.015, z);
      root.add(p);
      c.decks.push(p);
    }
    k.box(0.22, 0.04, 0.3, '#27272a', x, y, z, {});
  };
  switch (look.booth) {
    case 'deck': {
      const m = c.model('dj-booth', djX, boothZ, 1.8, 0.8, 0, g0);
      void m;
      break;
    }
    case 'riser': {
      const h = 0.34;
      k.box(4.4, h, 2.0, '#111827', djX, 0, djZ + 0.1, { round: 0.02 });
      k.box(4.4, 0.05, 0.05, g0, djX, h - 0.06, djZ + 1.12, {
        emissive: g0,
        emissiveIntensity: 2.2,
        noShadow: true,
      });
      const m = c.model('dj-booth', djX, boothZ, 1.8, 0.8, 0, g0);
      m.group.position.y = h;
      if (djAt >= 0) lift.set(djAt, h);
      break;
    }
    case 'pod': {
      k.cyl(0.95, 1.05, 1.0, '#0f172a', djX, 0, boothZ, { seg: c.lite ? 14 : 28 });
      const ring = glowMat(g1, 2);
      rings.push(ring);
      const tor = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.04, 6, c.lite ? 20 : 40), ring);
      tor.rotation.x = -Math.PI / 2;
      tor.position.set(djX, 1.0, boothZ);
      root.add(tor);
      k.cyl(1.0, 1.0, 0.04, '#1f2937', djX, 0.98, boothZ, { seg: c.lite ? 14 : 28 });
      deckGlow(djX, 1.02, boothZ - 0.1);
      // Its own glowing band down the middle.
      k.cyl(1.06, 1.06, 0.06, g0, djX, 0.45, boothZ, {
        emissive: g0,
        emissiveIntensity: 1.8,
        seg: c.lite ? 14 : 28,
        noShadow: true,
      });
      break;
    }
    case 'throne': {
      const h = 0.42;
      k.box(4.0, h, 2.2, luxe ? '#f5f5f4' : tone(look.accent, -0.3), djX, 0, djZ + 0.15, {
        rough: 0.25,
        round: 0.03,
      });
      k.box(4.04, 0.05, 2.24, gold, djX, h - 0.03, djZ + 0.15, { metal: 0.85, rough: 0.2 });
      // The booth: a black front with gold trim.
      k.box(2.0, 1.0, 0.7, '#0c0a09', djX, h, boothZ, { round: 0.04 });
      k.box(2.06, 0.06, 0.76, gold, djX, h + 1.0, boothZ, { metal: 0.85, rough: 0.2 });
      k.box(2.0, 0.06, 0.02, gold, djX, h + 0.5, boothZ + 0.36, { metal: 0.85, rough: 0.2 });
      deckGlow(djX, h + 1.06, boothZ);
      // A framed arch behind the DJ.
      k.box(0.14, 2.3, 0.14, gold, djX - 1.6, 0, BACK + 0.12, { metal: 0.85, rough: 0.2 });
      k.box(0.14, 2.3, 0.14, gold, djX + 1.6, 0, BACK + 0.12, { metal: 0.85, rough: 0.2 });
      k.box(3.34, 0.14, 0.14, gold, djX, 2.3, BACK + 0.12, { metal: 0.85, rough: 0.2 });
      if (djAt >= 0) lift.set(djAt, h);
      break;
    }
  }

  // ---- VIP: a raised corner behind a rope.
  if (look.vip) {
    const x0 = warehouse ? 3.0 : -6.0;
    const x1 = warehouse ? 6.0 : -2.3;
    const xm = (x0 + x1) / 2;
    const edge = warehouse ? x0 : x1;
    k.box(x1 - x0, 0.08, 3.2, luxe ? '#1c1917' : tone(look.wall, 0.12), xm, 0, 1.4);
    for (const z of [-0.1, 1.2, 2.5]) {
      k.cyl(0.04, 0.06, 0.95, trim, edge, 0, z, { metal: 0.85, rough: 0.2 });
      k.sphere(0.07, trim, edge, 0.98, z, { metal: 0.85, rough: 0.2 });
    }
    k.box(0.05, 0.05, 2.6, luxe ? '#9f1239' : look.accent, edge, 0.8, 1.2);
    const vip = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.4),
      new THREE.MeshBasicMaterial({
        map: signTexture('VIP', luxe ? '#fbbf24' : g0, look.font),
        transparent: true,
        depthWrite: false,
      }),
    );
    vip.position.set(warehouse ? 4.6 : -4.4, 2.15, BACK + 0.06);
    root.add(vip);
    if (luxe) {
      // Champagne on ice at the tables.
      for (const z of [0.6, 2.0]) {
        k.cyl(0.12, 0.1, 0.22, '#e5e7eb', xm, 0.36, z, { metal: 0.9, rough: 0.15 });
        k.cyl(0.035, 0.04, 0.3, '#14532d', xm, 0.45, z, { rough: 0.2 });
        k.cyl(0.012, 0.035, 0.08, gold, xm, 0.75, z, { metal: 0.9 });
      }
    }
  }

  // ---- A mezzanine: a gallery up the side wall.
  if (look.mezzanine) {
    const side = warehouse ? 1 : -1;
    const wallX = side * (RW / 2);
    const depth = 1.2;
    const ix = wallX - side * depth;
    const z0 = -1.5;
    const z1 = RD / 2 - 0.6;
    const zm = (z0 + z1) / 2;
    const y = 2.1;
    k.box(depth, 0.14, z1 - z0, luxe ? '#f5f5f4' : '#27272a', wallX - side * (depth / 2), y, zm, {
      rough: 0.4,
    });
    k.box(0.04, 0.75, z1 - z0, '#bae6fd', ix, y + 0.14, zm, { opacity: 0.3, noShadow: true });
    k.box(0.07, 0.06, z1 - z0, trim, ix, y + 0.88, zm, { metal: 0.85, rough: 0.2 });
    k.box(0.05, 0.05, z1 - z0, g2, ix, y - 0.04, zm, {
      emissive: g2,
      emissiveIntensity: 2.2,
      noShadow: true,
    });
    for (const z of [z0 + 0.2, z1 - 0.2])
      k.cyl(0.07, 0.07, y, trim, ix + side * 0.12, 0, z, { metal: 0.7, rough: 0.3 });
    // Sofas up there, a silhouette of a party.
    for (const z of [z0 + 1.0, z1 - 1.2])
      k.box(
        0.5,
        0.4,
        1.0,
        luxe ? '#7f1d1d' : tone(look.accent, -0.1),
        wallX - side * 0.35,
        y + 0.14,
        z,
        {
          round: 0.06,
        },
      );
  }

  // ---- The light rig.
  switch (look.rig) {
    case 'lasers': {
      const n = c.lite ? 4 : 8;
      const geo = new THREE.BoxGeometry(0.025, 0.025, 9);
      geo.translate(0, 0, 4.5);
      const mats = [g0, g2].map(
        (col) =>
          new THREE.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
      );
      for (let i = 0; i < n; i++) {
        const l = new THREE.Mesh(geo, mats[i % 2]!);
        l.position.set(djX, 2.75, BACK + 0.3);
        l.rotation.set(0.28, (i / (n - 1) - 0.5) * 1.6, 0);
        l.userData.base = l.rotation.y;
        root.add(l);
        lasers.push(l);
      }
      k.box(0.5, 0.2, 0.3, '#18181b', djX, 2.65, BACK + 0.2, {});
      break;
    }
    case 'strobes': {
      // A truss over the floor with white panels.
      k.box(8, 0.1, 0.1, '#52525b', 0, 2.8, cz - 0.6, { metal: 0.6 });
      k.box(8, 0.1, 0.1, '#52525b', 0, 2.8, cz + 0.6, { metal: 0.6 });
      const n = c.lite ? 4 : 6;
      const geo = new THREE.BoxGeometry(0.5, 0.08, 0.3);
      for (let i = 0; i < n; i++) {
        const m = glowMat('#f8fafc', 0.5);
        strobes.push(m);
        const s = new THREE.Mesh(geo, m);
        s.position.set(-3.5 + (i * 7) / (n - 1), 2.7, cz + (i % 2 ? 0.6 : -0.6));
        root.add(s);
      }
      break;
    }
    case 'ledwall': {
      led = ledTexture(look.glow).clone();
      led.needsUpdate = true;
      led.wrapS = THREE.RepeatWrapping;
      const w = 6.2;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, 1.5),
        new THREE.MeshBasicMaterial({ map: led, toneMapped: false }),
      );
      m.position.set(djX, 1.6, BACK + 0.05);
      root.add(m);
      k.box(w + 0.2, 1.7, 0.06, '#0a0a0a', djX, 0.75, BACK + 0.01, {});
      break;
    }
    case 'chandeliers': {
      for (const x of [-3, 0.1, 3]) {
        const y = 2.45;
        const z = cz - 0.2;
        k.cyl(0.006, 0.006, WALL_H - y, '#a16207', x, y + 0.3, z);
        k.torus(0.42, 0.025, gold, x, y + 0.15, z, { rx: Math.PI / 2, metal: 0.9, rough: 0.2 });
        k.torus(0.26, 0.02, gold, x, y + 0.32, z, { rx: Math.PI / 2, metal: 0.9, rough: 0.2 });
        k.sphere(0.13, '#fef3c7', x, y + 0.2, z, { emissive: '#fde68a', emissiveIntensity: 2.2 });
        const drops = c.lite ? 6 : 12;
        for (let i = 0; i < drops; i++) {
          const a = (i / drops) * Math.PI * 2;
          k.cyl(0.0, 0.035, 0.14, '#f8fafc', x + Math.cos(a) * 0.42, y, z + Math.sin(a) * 0.42, {
            emissive: '#e0f2fe',
            emissiveIntensity: 1.2,
            rough: 0.1,
            seg: 6,
            noShadow: true,
          });
        }
      }
      break;
    }
  }

  // ---- The material's own touches.
  switch (look.theme) {
    case 'velvet':
      // Drapes in folds either side of the back wall.
      for (const x0 of [-RW / 2 + 0.2, RW / 2 - 1.6])
        for (let i = 0; i < 6; i++)
          k.box(
            0.24,
            WALL_H - 0.1,
            0.12,
            tone(look.accent, i % 2 ? -0.08 : 0.06),
            x0 + i * 0.24,
            0,
            BACK + 0.1,
            {
              round: 0.05,
            },
          );
      break;
    case 'marble':
    case 'gold':
      // Columns (white marble) or pilasters (black and gold).
      for (const x of [-4.4, 4.4]) {
        const white = look.theme === 'marble';
        k.cyl(0.22, 0.24, WALL_H - 0.2, white ? '#f5f5f4' : '#0c0a09', x, 0, BACK + 0.3, {
          rough: 0.2,
          seg: 16,
        });
        for (const y of [0, WALL_H - 0.28])
          k.box(0.6, 0.14, 0.6, gold, x, y, BACK + 0.3, { metal: 0.85, rough: 0.2 });
      }
      break;
    case 'neon':
      // Tubes along the back and the side wall.
      for (const [y, col] of [
        [0.35, g1],
        [2.75, g2],
      ] as const) {
        k.box(RW - 0.4, 0.04, 0.04, col, 0, y, BACK + 0.08, {
          emissive: col,
          emissiveIntensity: 2.4,
          noShadow: true,
        });
        k.box(0.04, 0.04, RD - 0.6, col, -RW / 2 + 0.08, y, 0, {
          emissive: col,
          emissiveIntensity: 2.4,
          noShadow: true,
        });
      }
      break;
    case 'warehouse':
    case 'techno': {
      if (look.theme === 'warehouse' && !look.mezzanine) {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(4.6, 1.8),
          new THREE.MeshStandardMaterial({ map: muralTexture(look.glow), roughness: 0.9 }),
        );
        m.rotation.y = Math.PI / 2;
        m.position.set(-RW / 2 + 0.03, 1.3, 0.6);
        root.add(m);
      }
      // Ducts and cables overhead.
      k.cyl(0.18, 0.18, RW - 0.6, '#71717a', 0, 2.75, BACK + 0.5, {
        rz: Math.PI / 2,
        metal: 0.7,
        rough: 0.4,
        seg: 10,
      });
      break;
    }
    case 'tropical':
      for (const [x, z] of [
        [-5.6, -2.4],
        [5.7, 2.6],
      ] as const) {
        k.box(0.6, 0.5, 0.6, '#78350f', x, 0, z, { round: 0.05 });
        k.cyl(0.08, 0.12, 2.3, '#8b5a2b', x, 0.5, z, { rz: 0.1 });
        for (let i = 0; i < 6; i++)
          k.box(
            1.1,
            0.04,
            0.3,
            '#15803d',
            x + Math.cos(i) * 0.45 + 0.2,
            2.75,
            z + Math.sin(i) * 0.45,
            {
              ry: i,
              rz: -0.3,
            },
          );
      }
      // Rattan on the back wall.
      k.box(RW - 0.4, 0.9, 0.05, '#a16207', 0, 0, BACK + 0.04, { rough: 0.95 });
      break;
  }

  // ---- The club's name in lights.
  if (look.sign) {
    const color = luxe ? '#fde68a' : g0;
    const y = look.rig === 'ledwall' ? 2.62 : 2.45;
    const w = look.rig === 'ledwall' ? 4.2 : 4.6;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w * (160 / 1024)),
      new THREE.MeshBasicMaterial({
        map: signTexture(look.sign, color, look.font),
        transparent: true,
        depthWrite: false,
      }),
    );
    sign.position.set(djX, y, BACK + 0.07);
    root.add(sign);
    if (luxe)
      k.box(w + 0.3, 0.04, 0.05, gold, djX, y - (w * 160) / 1024 / 2 - 0.06, BACK + 0.05, {
        metal: 0.9,
        rough: 0.2,
      });
  }

  return {
    beams: look.rig === 'beams',
    animate(t, beat, ph) {
      lasers.forEach((l, i) => {
        l.rotation.y = (l.userData.base as number) + Math.sin(t * 0.7 + i * 0.4) * 0.25;
        l.rotation.x = 0.25 + Math.sin(t * 1.1 + i) * 0.08;
      });
      // Strobes on the beat, never more than a soft flash, one panel at a time.
      const on = Math.floor(beat) % Math.max(1, strobes.length);
      strobes.forEach((m, i) => (m.emissiveIntensity = i === on && ph < 0.15 ? 3 : 0.4));
      if (led) led.offset.x = (t * 0.08) % 1;
      rings.forEach((m) => (m.emissiveIntensity = 1.4 + (1 - ph) * 1.2));
    },
  };
}
