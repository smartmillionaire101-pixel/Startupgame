/**
 * Wave 9 §B: landmarks as 3D models built from primitives, at their real
 * places (positions from the city file, see geoLayout spritesOf): the Golden
 * Gate and Bay bridges with towers, cables and suspenders, the Transamerica
 * Pyramid, Salesforce Tower, Coit Tower, Tower Bridge, the Shard, the London
 * Eye, the Gherkin, Big Ben, the Burj Khalifa and Burj Al Arab, Cairo Tower,
 * KICC, the Kigali Convention Centre, the Cotton Tree, Hillbrow Tower, the
 * Black Star Gate, and more.
 */
import * as THREE from 'three';
import type { RoadIndex } from './roads';

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(
  color: string,
  o: { rough?: number; metal?: number; emissive?: string; side?: THREE.Side } = {},
) {
  const k = `${color}|${o.rough}|${o.metal}|${o.emissive}|${o.side}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.8,
      metalness: o.metal ?? 0,
      flatShading: true,
      ...(o.emissive ? { emissive: o.emissive } : {}),
      ...(o.side ? { side: o.side } : {}),
    });
    matCache.set(k, m);
  }
  return m;
}
const GLASS = (c: string) => mat(c, { rough: 0.08, metal: 0.9 });

function add(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  g.add(o);
  return o;
}
const box = (w: number, h: number, d: number) =>
  new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
const cyl = (rt: number, rb: number, h: number, n = 16) =>
  new THREE.CylinderGeometry(rt, rb, h, n).translate(0, h / 2, 0);
function lathe(profile: [number, number][], n = 24) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    n,
  );
}

/** Lines in one draw (cables, suspenders). */
function lines(pts: number[], color: string) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
}

function tube(points: THREE.Vector3[], r: number, m: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3(points);
  const o = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), r, 5), m);
  o.castShadow = true;
  return o;
}

// ---------------------------------------------------------------------------
// Bridges

interface Span {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

const at = (s: Span, t: number) => ({ x: s.ax + (s.bx - s.ax) * t, y: s.ay + (s.by - s.ay) * t });

/** A suspension bridge: towers, main cables, suspenders (the deck is the road's). */
function suspension(
  s: Span,
  o: {
    color: string;
    deck: number;
    towerH: number;
    towers: number[];
    anchors?: number[];
    legs: number;
    portals: number;
  },
) {
  const g = new THREE.Group();
  const L = Math.hypot(s.bx - s.ax, s.by - s.ay);
  const dx = (s.bx - s.ax) / L;
  const dy = (s.by - s.ay) / L;
  const nx = -dy;
  const ny = dx;
  const m = mat(o.color, { rough: 0.6 });
  const yaw = -Math.atan2(dy, dx);
  const half = 14;
  // Towers.
  for (const t of o.towers) {
    const p = at(s, t);
    const tower = new THREE.Group();
    tower.position.set(p.x, 0, p.y);
    tower.rotation.y = yaw;
    const top = o.deck + o.towerH;
    for (const sg of [-1, 1]) {
      add(tower, box(o.legs, top, o.legs * 1.6), m, 0, 0, sg * half);
      add(tower, box(o.legs * 0.7, 6, o.legs * 1.2), m, 0, top, sg * half);
    }
    for (let k = 0; k < o.portals; k++) {
      const y = o.deck + 8 + ((top - o.deck - 14) * (k + 1)) / o.portals;
      add(tower, box(o.legs * 0.8, 5, half * 2), m, 0, y, 0);
    }
    add(tower, box(o.legs * 1.6, 3, half * 2 + 6), m, 0, o.deck - 6, 0);
    // A plinth in the water.
    add(tower, box(o.legs * 3, 8, half * 2 + 14), mat('#9d9a92'), 0, -3, 0);
    g.add(tower);
  }
  // Cables: towers' tops sag to the deck mid-span; the side spans run down to the anchors.
  const ts = [...o.towers].sort((a, b) => a - b);
  const anchors = o.anchors ?? [0, 1];
  const top = o.deck + o.towerH + 3;
  const cableM = mat(o.color, { rough: 0.5, metal: 0.2 });
  const susp: number[] = [];
  for (const sg of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    const knots: [number, number][] = [[anchors[0]!, o.deck + 2]];
    for (const t of ts) knots.push([t, top]);
    knots.push([anchors[1]!, o.deck + 2]);
    const yAt = (t: number) => {
      for (let i = 0; i + 1 < knots.length; i++) {
        const [t0, y0] = knots[i]!;
        const [t1, y1] = knots[i + 1]!;
        if (t >= t0 && t <= t1) {
          const u = (t - t0) / (t1 - t0 || 1);
          const lin = y0 + (y1 - y0) * u;
          // Main spans hang (a parabola); side spans are nearly straight.
          const main = y0 === top && y1 === top;
          return main ? lin - 4 * (top - o.deck - 4) * u * (1 - u) : lin - 6 * u * (1 - u);
        }
      }
      return o.deck;
    };
    const N = 80;
    for (let i = 0; i <= N; i++) {
      const t = anchors[0]! + ((anchors[1]! - anchors[0]!) * i) / N;
      const p = at(s, t);
      pts.push(new THREE.Vector3(p.x + nx * sg * half, yAt(t), p.y + ny * sg * half));
    }
    g.add(tube(pts, 0.9, cableM));
    const step = 16 / L;
    for (let t = anchors[0]! + step; t < anchors[1]!; t += step) {
      const y = yAt(t);
      if (y - o.deck < 2) continue;
      const p = at(s, t);
      const x = p.x + nx * sg * half;
      const z = p.y + ny * sg * half;
      susp.push(x, o.deck, z, x, y, z);
    }
  }
  g.add(lines(susp, o.color));
  return g;
}

/** A cable-stayed bridge: pylons with fans of stays. */
function cableStayed(s: Span, o: { color: string; deck: number; pylons: [number, number][] }) {
  const g = new THREE.Group();
  const L = Math.hypot(s.bx - s.ax, s.by - s.ay);
  const dx = (s.bx - s.ax) / L;
  const dy = (s.by - s.ay) / L;
  const m = mat(o.color, { rough: 0.5 });
  const stays: number[] = [];
  for (const [t, H] of o.pylons) {
    const p = at(s, t);
    add(g, box(3, o.deck + H, 4), m, p.x, 0, p.y);
    const reach = Math.min(L * 0.45, H * 2.2);
    for (let k = 1; k <= 10; k++) {
      for (const sg of [-1, 1]) {
        const d = (reach * k) / 10;
        stays.push(
          p.x,
          o.deck + H * (0.55 + 0.04 * k),
          p.y,
          p.x + dx * d * sg,
          o.deck + 1,
          p.y + dy * d * sg,
        );
      }
    }
  }
  g.add(lines(stays, '#e5e7eb'));
  return g;
}

function towerBridge(s: Span) {
  const g = new THREE.Group();
  const L = Math.hypot(s.bx - s.ax, s.by - s.ay);
  const yaw = -Math.atan2(s.by - s.ay, s.bx - s.ax);
  const stone = mat('#cdbf9f');
  const slate = mat('#4f5d6e');
  const blue = mat('#7da3c8', { rough: 0.5 });
  const spanT = Math.min(0.32, 35 / L);
  for (const t of [0.5 - spanT, 0.5 + spanT]) {
    const p = at(s, t);
    const tw = new THREE.Group();
    tw.position.set(p.x, 0, p.y);
    tw.rotation.y = yaw;
    add(tw, box(18, 8, 26), mat('#a49c8a'), 0, -4, 0);
    add(tw, box(16, 52, 16), stone, 0, 0, 0);
    add(
      tw,
      new THREE.ConeGeometry(9, 12, 4).rotateY(Math.PI / 4).translate(0, 6, 0),
      slate,
      0,
      52,
      0,
    );
    for (const a of [-1, 1])
      for (const b of [-1, 1]) {
        add(tw, cyl(1.6, 1.6, 6, 8), stone, a * 7, 52, b * 7);
        add(tw, new THREE.ConeGeometry(1.8, 7, 8).translate(0, 3.5, 0), slate, a * 7, 58, b * 7);
      }
    g.add(tw);
  }
  // High walkways between the towers.
  const a = at(s, 0.5 - spanT);
  const b = at(s, 0.5 + spanT);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  for (const off of [-4, 4]) {
    const w = add(g, box(span, 4, 3), blue, mid.x, 42, mid.y);
    w.rotation.y = yaw;
    w.translateZ(off);
  }
  // Side chains to the shore.
  const chain: number[] = [];
  for (const [t0, t1] of [
    [0.02, 0.5 - spanT],
    [0.5 + spanT, 0.98],
  ] as const)
    for (const sg of [-6, 6]) {
      const n = 12;
      const nx = -(s.by - s.ay) / L;
      const ny = (s.bx - s.ax) / L;
      for (let i = 0; i < n; i++) {
        const u0 = i / n;
        const u1 = (i + 1) / n;
        const y = (u: number) =>
          t0 < 0.5 ? 10 + u * 34 - 8 * u * (1 - u) : 44 - u * 34 - 8 * u * (1 - u);
        const p0 = at(s, t0 + (t1 - t0) * u0);
        const p1 = at(s, t0 + (t1 - t0) * u1);
        chain.push(p0.x + nx * sg, y(u0), p0.y + ny * sg, p1.x + nx * sg, y(u1), p1.y + ny * sg);
      }
    }
  g.add(lines(chain, '#5b8fc4'));
  return g;
}

// ---------------------------------------------------------------------------
// Towers and buildings

function model(kind: string, name: string): THREE.Group | null {
  const g = new THREE.Group();
  switch (kind) {
    case 'transamerica': {
      add(
        g,
        new THREE.CylinderGeometry(1.5, 26, 212, 4, 1).rotateY(Math.PI / 4).translate(0, 106, 0),
        mat('#ece8e0', { rough: 0.6 }),
      );
      // The "wings" (lift and stair towers) and the spire.
      add(g, box(9, 160, 6).translate(0, 0, 0), mat('#e2ddd3'), 0, 0, -14);
      add(g, box(9, 160, 6), mat('#e2ddd3'), 0, 0, 14);
      add(
        g,
        new THREE.CylinderGeometry(0.2, 3.5, 48, 4).rotateY(Math.PI / 4).translate(0, 236, 0),
        mat('#f2efe8'),
      );
      return g;
    }
    case 'salesforce': {
      add(
        g,
        lathe(
          [
            [0, 0],
            [24, 0],
            [23.5, 120],
            [21, 240],
            [17, 300],
            [15.5, 326],
            [0, 326],
          ],
          28,
        ),
        GLASS('#b7c6d1'),
      );
      add(g, cyl(15.8, 16.6, 30, 28), mat('#dfe5ea', { rough: 0.35, metal: 0.4 }), 0, 296, 0);
      return g;
    }
    case 'coit': {
      add(g, cyl(14, 16, 6, 16), mat('#d8d2c4'), 0, 0, 0);
      add(g, cyl(5.6, 5.8, 64, 16), mat('#efeae0', { rough: 0.7 }), 0, 6, 0);
      add(g, cyl(6.4, 5.6, 4, 16), mat('#e6e0d4'), 0, 68, 0);
      return g;
    }
    case 'shard': {
      add(g, new THREE.CylinderGeometry(2, 30, 306, 6, 1).translate(0, 153, 0), GLASS('#b9c9d6'));
      add(g, new THREE.CylinderGeometry(0.4, 4, 20, 6).translate(0, 314, 0), GLASS('#d6e2ea'));
      return g;
    }
    case 'gherkin': {
      add(
        g,
        lathe(
          [
            [0, 0],
            [24, 0],
            [28, 50],
            [27, 100],
            [20, 150],
            [9, 175],
            [0, 180],
          ],
          24,
        ),
        GLASS('#3e6670'),
      );
      return g;
    }
    case 'big-ben': {
      add(g, box(12, 62, 12), mat('#c8b385'), 0, 0, 0);
      add(g, box(14, 16, 14), mat('#cdb98c'), 0, 62, 0);
      for (const [x, z, ry] of [
        [0, 7.05, 0],
        [0, -7.05, Math.PI],
        [7.05, 0, Math.PI / 2],
        [-7.05, 0, -Math.PI / 2],
      ] as const) {
        const face = add(
          g,
          new THREE.CircleGeometry(5, 20),
          mat('#f3ecd2', { emissive: '#000000' }),
          x,
          70,
          z,
        );
        face.rotation.y = ry;
      }
      add(
        g,
        new THREE.ConeGeometry(9, 18, 4).rotateY(Math.PI / 4).translate(0, 9, 0),
        mat('#5a6152'),
        0,
        78,
        0,
      );
      add(
        g,
        new THREE.ConeGeometry(1.5, 10, 6).translate(0, 5, 0),
        mat('#c9a948', { metal: 0.6, rough: 0.4 }),
        0,
        95,
        0,
      );
      return g;
    }
    case 'london-eye': {
      const wheel = new THREE.Group();
      wheel.position.y = 70;
      const steel = mat('#e8ecef', { rough: 0.4, metal: 0.5 });
      wheel.add(new THREE.Mesh(new THREE.TorusGeometry(60, 1.2, 6, 64), steel));
      wheel.add(new THREE.Mesh(new THREE.TorusGeometry(57, 0.5, 4, 64), steel));
      const spokes: number[] = [];
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        spokes.push(0, 0, 0, Math.cos(a) * 60, Math.sin(a) * 60, 0);
        const pod = new THREE.Mesh(
          new THREE.CapsuleGeometry(1.8, 3.5, 3, 8).rotateZ(Math.PI / 2),
          GLASS('#dfe8ee'),
        );
        pod.position.set(Math.cos(a) * 62, Math.sin(a) * 62, 0);
        wheel.add(pod);
      }
      wheel.add(lines(spokes, '#d7dde2'));
      g.add(wheel);
      // The A-frame legs.
      const leg = mat('#d9dee2', { metal: 0.4, rough: 0.5 });
      for (const sx of [-20, 20]) {
        const l = add(g, box(2, 78, 2), leg, sx, 0, 18);
        l.rotation.x = -0.25;
        l.rotation.z = sx > 0 ? 0.24 : -0.24;
      }
      g.rotation.y = 0.5;
      return g;
    }
    case 'burj-khalifa': {
      const steel = GLASS('#c4ced6');
      const tiers = [
        [32, 0, 160],
        [27, 160, 320],
        [22, 320, 450],
        [17, 450, 560],
        [12, 560, 630],
        [8, 630, 680],
      ];
      for (const [r, y0, y1] of tiers) {
        // A three-lobed plan: three overlapping cylinders.
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          add(
            g,
            cyl(r! * 0.55, r! * 0.6, y1! - y0!, 10),
            steel,
            Math.cos(a) * r! * 0.5,
            y0!,
            Math.sin(a) * r! * 0.5,
          );
        }
        add(g, cyl(r! * 0.55, r! * 0.6, y1! - y0!, 12), steel, 0, y0!, 0);
      }
      add(
        g,
        new THREE.CylinderGeometry(0.6, 4.5, 148, 8).translate(0, 74, 0),
        mat('#dfe4e8', { metal: 0.6, rough: 0.3 }),
        0,
        680,
        0,
      );
      return g;
    }
    case 'burj-al-arab': {
      // The sail: a curved triangle, white, with its mast.
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(60, 0);
      shape.quadraticCurveTo(52, 170, 6, 300);
      shape.lineTo(0, 300);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 36,
        bevelEnabled: false,
        curveSegments: 12,
      });
      geo.translate(-20, 0, -18);
      add(g, geo, mat('#f4f4f2', { rough: 0.5 }));
      add(g, box(4, 321, 4), mat('#e2e4e6', { metal: 0.4 }), -22, 0, 0);
      add(g, cyl(14, 14, 3, 20), mat('#e8e8e8'), 30, 200, 0);
      add(g, cyl(60, 70, 4, 24), mat('#d9cfb8'), 0, -2, 0);
      return g;
    }
    case 'cairo-tower': {
      const c = mat('#c79a6a', { rough: 0.9 });
      add(
        g,
        lathe(
          [
            [0, 0],
            [9, 0],
            [7, 20],
            [6.5, 140],
            [9, 160],
            [12, 172],
            [11, 180],
            [0, 182],
          ],
          16,
        ),
        c,
      );
      add(g, cyl(0.3, 0.6, 10, 6), mat('#9ca3af'), 0, 182, 0);
      return g;
    }
    case 'hillbrow': {
      const c = mat('#d8d4cc', { rough: 0.8 });
      add(g, cyl(6, 9, 200, 16), c);
      add(g, cyl(15, 13, 26, 20), c, 0, 200, 0);
      add(g, cyl(5, 6, 20, 12), c, 0, 226, 0);
      add(g, cyl(0.8, 1.6, 23, 8), mat('#c1121f'), 0, 246, 0);
      return g;
    }
    case 'kicc': {
      const c = mat('#c4a174', { rough: 0.85 });
      add(g, cyl(12, 12, 98, 20), c, 0, 0, 0);
      add(g, new THREE.ConeGeometry(17, 9, 20).translate(0, 4.5, 0), mat('#7f6a4f'), 0, 98, 0);
      add(
        g,
        new THREE.SphereGeometry(22, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        mat('#9c5b34'),
        45,
        0,
        10,
      );
      return g;
    }
    case 'dome': {
      add(
        g,
        lathe(
          [
            [0, 0],
            [34, 0],
            [33, 20],
            [26, 40],
            [15, 55],
            [0, 62],
          ],
          28,
        ),
        mat('#d6dbe0', { rough: 0.2, metal: 0.7, emissive: '#000000' }),
      );
      add(g, box(120, 22, 60), mat('#e8e5df'), 70, 0, 0);
      return g;
    }
    case 'cotton-tree': {
      add(g, cyl(2.5, 4, 22, 8), mat('#6b5a45', { rough: 1 }));
      const crown = add(
        g,
        new THREE.IcosahedronGeometry(24, 1),
        mat('#3f6b2a', { rough: 1 }),
        0,
        30,
        0,
      );
      crown.scale.set(1.3, 0.55, 1.2);
      return g;
    }
    case 'star-gate': {
      const w = mat('#f2efe8');
      add(g, box(8, 26, 8), w, -18, 0, 0);
      add(g, box(8, 26, 8), w, 18, 0, 0);
      add(g, box(52, 9, 9), w, 0, 26, 0);
      const star = new THREE.Shape();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
        const r = k % 2 ? 2.6 : 6;
        if (k) star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      add(
        g,
        new THREE.ExtrudeGeometry(star, { depth: 1.5, bevelEnabled: false }),
        mat('#111111'),
        0,
        30.5,
        4.3,
      );
      return g;
    }
    case 'lighthouse': {
      for (let k = 0; k < 5; k++)
        add(
          g,
          cyl(3.2 - k * 0.3, 3.5 - k * 0.3, 5, 12),
          mat(k % 2 ? '#c8102e' : '#f5f5f5'),
          0,
          k * 5,
          0,
        );
      add(g, cyl(2.4, 2.4, 3, 12), mat('#fde68a', { emissive: '#b45309' }), 0, 25, 0);
      add(g, new THREE.ConeGeometry(2.8, 3, 12).translate(0, 1.5, 0), mat('#1f2937'), 0, 28, 0);
      return g;
    }
    case 'minaret': {
      const c = mat('#d9c39b');
      add(g, box(30, 14, 30), c);
      add(
        g,
        new THREE.SphereGeometry(10, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        mat('#c8b48a'),
        0,
        14,
        0,
      );
      add(g, cyl(2.4, 3, 48, 8), c, 18, 0, 18);
      add(g, cyl(3.4, 3.4, 2, 8), c, 18, 34, 18);
      add(g, new THREE.ConeGeometry(2.4, 6, 8).translate(0, 3, 0), c, 18, 48, 18);
      return g;
    }
    case 'theatre': {
      add(g, cyl(58, 62, 22, 32), mat('#d9d2c2'));
      // The "military cap" roof, with its ribs.
      add(
        g,
        new THREE.CylinderGeometry(20, 64, 14, 32, 1).translate(0, 7, 0),
        mat('#8b9096', { metal: 0.3 }),
        0,
        22,
        0,
      );
      return g;
    }
    case 'pyramid': {
      add(
        g,
        new THREE.ConeGeometry(160, 139, 4).rotateY(Math.PI / 4).translate(0, 69.5, 0),
        mat('#d6b77f', { rough: 1 }),
      );
      return g;
    }
    case 'painted-ladies': {
      const cols = ['#f4c6cf', '#bfe0d3', '#f6e3a4', '#c9d8f2', '#e2d2f2', '#f6d2b5', '#f1f5f9'];
      cols.forEach((c, k) => {
        add(g, box(7.6, 11, 16), mat(c), k * 8.2 - 25, 0, 0);
        add(
          g,
          new THREE.ConeGeometry(5.6, 5, 4).rotateY(Math.PI / 4).translate(0, 2.5, 0),
          mat('#5b6168'),
          k * 8.2 - 25,
          11,
          2,
        );
      });
      return g;
    }
    default:
      void name;
      return null;
  }
}

/** Extra landmarks the 2D map did not draw ([lat, lon] are resolved by the scene). */
export const EXTRA_3D: Record<string, { kind: string; name: string; at: [number, number] }[]> = {
  'san-francisco': [{ kind: 'coit', name: 'Coit Tower', at: [37.8024, -122.4058] }],
  london: [],
  dubai: [],
};

export interface LandmarkPlan {
  kind: string;
  name: string;
  e: number;
  s: number;
  e2?: number;
  s2?: number;
  color?: string;
}

/** Deck heights to give bridges a landmark model stands on (applied to the road index). */
export function deckFor(p: LandmarkPlan): number | null {
  if (p.e2 === undefined) return null;
  if (/Golden Gate/i.test(p.name)) return 67;
  if (/Bay Bridge/i.test(p.name)) return 58;
  if (p.kind === 'bascule') return 9;
  return 12;
}

export function buildLandmarks(plans: LandmarkPlan[], roads: RoadIndex): THREE.Group {
  const out = new THREE.Group();
  for (const p of plans) {
    let g: THREE.Group | null = null;
    if (p.e2 !== undefined && p.s2 !== undefined) {
      const s: Span = { ax: p.e, ay: p.s, bx: p.e2, by: p.s2 };
      const deck = deckFor(p) ?? 12;
      if (p.kind === 'suspension' && /Golden Gate/i.test(p.name))
        g = suspension(s, {
          color: '#c0362c',
          deck,
          towerH: 160,
          towers: [0.28, 0.72],
          legs: 10,
          portals: 4,
        });
      else if (p.kind === 'suspension')
        g = suspension(s, {
          color: p.color ?? '#9ca3af',
          deck,
          towerH: 110,
          towers: [0.18, 0.4, 0.6, 0.82],
          legs: 8,
          portals: 3,
        });
      else if (p.kind === 'cable-stayed')
        g = cableStayed(s, {
          color: p.color ?? '#f1f5f9',
          deck,
          pylons: /Mandela/i.test(p.name)
            ? [
                [0.35, 42],
                [0.7, 28],
              ]
            : [[0.5, 85]],
        });
      else if (p.kind === 'bascule') g = towerBridge(s);
      if (g) {
        // Make sure the road deck is under it.
        roads.raiseAlong(s.ax, s.ay, s.bx, s.by, deck);
      }
    } else {
      g = model(p.kind, p.name);
      if (g) g.position.set(p.e, 0, p.s);
    }
    if (g) {
      g.name = p.name;
      out.add(g);
    }
  }
  return out;
}
