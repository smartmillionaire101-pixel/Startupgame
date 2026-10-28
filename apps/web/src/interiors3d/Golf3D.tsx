/**
 * Golf in 3D (lazy-loaded): the hole you're on (tee, striped fairway, rough,
 * bunkers, a pond, the green, the flag, trees and hills under a sky), your
 * own figure swinging (./golfSwing.ts), your playing partners, the ball's
 * flight with a trail, and a camera that flies over the hole, stands behind
 * you to aim, turns face-on for the swing, chases the ball and kneels for
 * the putt. The scene (../city/golf/GolfScene.tsx) runs the round; this only
 * draws the frame it's handed.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { seeded, hash } from '../city/contract';
import { along, type HoleGeo } from '../city/golf/game';
import { markScreen, type GolfDrawProps, type GolfFrame } from '../city/golf/frame';
import { screenBoxAttr, screenBoxOf } from '../three-kit/screen-box';
import { cpuGl, softwareGl } from '../three-kit/quality';
import { makeCharacter, pose } from './character';
import { golfPose, makeClub, partnerPose, type GolfClub3D } from './golfSwing';
import { disposeTree, mat } from './kit';

const FOG = '#cfe6f7';

function skyDome(): THREE.Mesh {
  const g = new THREE.SphereGeometry(1500, 24, 12);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0);
      vec3 top = vec3(0.23,0.52,0.88); vec3 hor = vec3(0.82,0.91,0.98);
      vec3 c = mix(hor, top, pow(h, 0.55));
      gl_FragColor = vec4(c, 1.0); }`,
  });
  const s = new THREE.Mesh(g, m);
  s.renderOrder = -1;
  return s;
}

/** A flat shape on the ground (an ellipse), a little above it. */
function flatOval(
  rx: number,
  rz: number,
  color: string,
  y: number,
  o: { rough?: number; metal?: number } = {},
) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    mat(color, { rough: o.rough ?? 0.95, metal: o.metal ?? 0, own: true }),
  );
  m.rotation.x = -Math.PI / 2;
  m.scale.set(rx, rz, 1);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

/** The hole on the ground. */
function buildHole(g: HoleGeo, market: string): { root: THREE.Group; flag: THREE.Mesh } {
  const root = new THREE.Group();
  const r = seeded(hash(`golf3d:${market}:${g.n}`));
  // The rough: a wide field with a little colour in it.
  const size = 1400;
  const ground = new THREE.PlaneGeometry(size, size, 70, 70);
  ground.rotateX(-Math.PI / 2);
  const col: number[] = [];
  const base = new THREE.Color('#4c8a2c');
  const c = new THREE.Color();
  const pos = ground.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.9 + r() * 0.16;
    c.copy(base).multiplyScalar(k);
    col.push(c.r, c.g, c.b);
  }
  ground.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const gm = new THREE.Mesh(
    ground,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  gm.position.set(g.pin.x / 2, 0, g.pin.z / 2);
  gm.receiveShadow = true;
  root.add(gm);

  // The fairway: a ribbon along its line, mown in stripes.
  const t0 = Math.round(g.fairway[0] * (g.line.length - 1));
  const t1 = Math.round(g.fairway[1] * (g.line.length - 1));
  const fpos: number[] = [];
  const fcol: number[] = [];
  const light = new THREE.Color('#7fc44a');
  const dark = new THREE.Color('#6db23d');
  const steps: { x: number; z: number }[] = [];
  for (let i = t0; i < t1; i++) {
    const a = g.line[i]!;
    const b = g.line[i + 1]!;
    for (let k = 0; k < 4; k++) {
      const u = k / 4;
      steps.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u });
    }
  }
  steps.push(g.line[t1]!);
  for (let i = 0; i + 1 < steps.length; i++) {
    const a = steps[i]!;
    const b = steps[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    // Rounded ends: narrower at the first and last metres.
    const tip = (j: number) => Math.min(1, j / 3, (steps.length - 1 - j) / 3) * 0.35 + 0.65;
    const ha = g.fairwayHalf * tip(i);
    const hb = g.fairwayHalf * tip(i + 1);
    const quad = [
      [a.x + nx * ha, a.z + nz * ha],
      [a.x - nx * ha, a.z - nz * ha],
      [b.x + nx * hb, b.z + nz * hb],
      [b.x - nx * hb, b.z - nz * hb],
    ];
    const tri = [0, 1, 2, 2, 1, 3];
    const stripe = Math.floor(i / 3) % 2 ? light : dark;
    for (const ti of tri) {
      fpos.push(quad[ti]![0]!, 0.02, quad[ti]![1]!);
      fcol.push(stripe.r, stripe.g, stripe.b);
    }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
  fg.setAttribute('color', new THREE.Float32BufferAttribute(fcol, 3));
  fg.computeVertexNormals();
  const fm = new THREE.Mesh(
    fg,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
  );
  fm.receiveShadow = true;
  root.add(fm);

  // The tee box and its markers.
  const tee = new THREE.Mesh(
    new THREE.BoxGeometry(7, 0.08, 6),
    mat('#86cc52', { rough: 0.9, own: true }),
  );
  tee.position.set(0, 0.02, 0.5);
  tee.receiveShadow = true;
  root.add(tee);
  for (const x of [-3.2, 3.2]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat('#dc2626'));
    m.position.set(x, 0.1, -2.5);
    root.add(m);
  }

  // Water, bunkers, the fringe, the green and the cup.
  if (g.water) {
    const bank = flatOval(g.water.rx + 1.2, g.water.rz + 1.2, '#3d6b2a', 0.024);
    const pond = flatOval(g.water.rx, g.water.rz, '#2f86c9', 0.03, { rough: 0.08, metal: 0.25 });
    bank.position.set(g.water.x, 0.024, g.water.z);
    pond.position.set(g.water.x, 0.03, g.water.z);
    root.add(bank, pond);
  }
  for (const b of g.bunkers) {
    const lip = flatOval(b.rx + 0.5, b.rz + 0.5, '#5b9a37', 0.026);
    lip.position.set(b.x, 0.026, b.z);
    root.add(lip);
    const s = flatOval(b.rx, b.rz, '#ecdcab', 0.032);
    s.position.set(b.x, 0.032, b.z);
    root.add(s);
  }
  const fringe = flatOval(g.greenR + 3, g.greenR + 3, '#79c447', 0.034);
  fringe.position.set(g.pin.x, 0.034, g.pin.z);
  root.add(fringe);
  const green = flatOval(g.greenR, g.greenR * 0.92, '#95d95e', 0.038, { rough: 0.7 });
  green.position.set(g.pin.x, 0.038, g.pin.z);
  root.add(green);
  const cup = flatOval(0.12, 0.12, '#0b1209', 0.042);
  cup.position.set(g.pin.x, 0.042, g.pin.z);
  root.add(cup);
  // The flag.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.4, 6), mat('#f8fafc'));
  pole.position.set(g.pin.x, 1.2, g.pin.z);
  pole.castShadow = true;
  root.add(pole);
  const clothG = new THREE.PlaneGeometry(0.75, 0.48, 6, 2);
  clothG.translate(0.375, 0, 0);
  const flag = new THREE.Mesh(clothG, mat('#ef4444', { side: THREE.DoubleSide, own: true }));
  flag.position.set(g.pin.x, 2.15, g.pin.z);
  flag.castShadow = true;
  root.add(flag);

  // Trees: both sides of the hole, and a stand behind the green.
  const spots: { x: number; z: number; s: number; kind: number }[] = [];
  const L = g.line.length;
  for (let i = 0; i < L; i++) {
    const p = g.line[i]!;
    const q = g.line[Math.min(L - 1, i + 1)]!;
    const dx = q.x - p.x || 0.0001;
    const dz = q.z - p.z || -1;
    const l = Math.hypot(dx, dz);
    for (const side of [-1, 1])
      for (let k = 0; k < 2; k++) {
        const off = g.fairwayHalf + 32 + k * 14 + r() * 12;
        spots.push({
          x: p.x + (-dz / l) * off * side + (r() - 0.5) * 6,
          z: p.z + (dx / l) * off * side + (r() - 0.5) * 6,
          s: 0.8 + r() * 0.7,
          kind: r() < 0.3 ? 1 : 0,
        });
      }
  }
  for (let k = 0; k < 18; k++) {
    const a = Math.PI * (0.15 + 0.7 * (k / 17)) + (r() - 0.5) * 0.2;
    const d = g.greenR + 22 + r() * 25;
    spots.push({
      x: g.pin.x + Math.cos(a) * d,
      z: g.pin.z - Math.sin(a) * d,
      s: 0.9 + r() * 0.8,
      kind: r() < 0.35 ? 1 : 0,
    });
  }
  // Nothing in front of the tee camera.
  const trees = spots.filter((s) => s.z < -6 || Math.abs(s.x) > 30);
  const trunkG = new THREE.CylinderGeometry(0.22, 0.32, 3, 6);
  trunkG.translate(0, 1.5, 0);
  const crownG = new THREE.IcosahedronGeometry(2.8, 1);
  crownG.translate(0, 5, 0);
  const pineG = new THREE.ConeGeometry(2.4, 7, 8);
  pineG.translate(0, 5.5, 0);
  const trunk = new THREE.InstancedMesh(trunkG, mat('#6b4a2f'), trees.length);
  const crowns = new THREE.InstancedMesh(
    crownG,
    mat('#2f7d32', { rough: 0.95, own: true }),
    trees.length,
  );
  const pines = new THREE.InstancedMesh(
    pineG,
    mat('#1f5f3a', { rough: 0.95, own: true }),
    trees.length,
  );
  const m4 = new THREE.Matrix4();
  const tint = new THREE.Color();
  let nc = 0;
  let np = 0;
  trees.forEach((t, i) => {
    m4.makeScale(t.s, t.s * (0.9 + (i % 3) * 0.1), t.s);
    m4.setPosition(t.x, 0, t.z);
    trunk.setMatrixAt(i, m4);
    tint.setHSL(0.27 + ((i * 37) % 10) / 160, 0.5, 0.26 + ((i * 13) % 7) / 70);
    if (t.kind) {
      pines.setMatrixAt(np, m4);
      pines.setColorAt(np++, tint);
    } else {
      crowns.setMatrixAt(nc, m4);
      crowns.setColorAt(nc++, tint);
    }
  });
  crowns.count = nc;
  pines.count = np;
  for (const im of [trunk, crowns, pines]) {
    im.castShadow = true;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    root.add(im);
  }

  // Far hills behind the green.
  for (let k = 0; k < 6; k++) {
    const h = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 10),
      mat(k % 2 ? '#5d8f63' : '#6c9c6a', { rough: 1, own: true }),
    );
    h.scale.set(160 + r() * 140, 40 + r() * 50, 90);
    h.position.set(g.pin.x + (k - 2.5) * 190 + (r() - 0.5) * 80, -8, g.pin.z - 420 - r() * 160);
    root.add(h);
  }

  // The clubhouse behind the tee, white with a green roof.
  const ch = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(18, 5, 9), mat('#f3efe6'));
  walls.position.y = 2.5;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(12, 3.4, 4), mat('#1f5131'));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.55);
  roof.position.y = 6.6;
  for (const m of [walls, roof]) {
    m.castShadow = true;
    ch.add(m);
  }
  ch.position.set(-34, 0, 26);
  ch.rotation.y = 0.5;
  root.add(ch);
  return { root, flag };
}

function holeAt(frame: GolfFrame) {
  return frame.geo;
}

export default function Golf3D(props: GolfDrawProps & { market: string }): ReactElement | null {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });
  useEffect(() => {
    const canvas = ref.current!;
    const parent = canvas.parentElement!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !softwareGl(), alpha: false });
    } catch {
      return;
    }
    const soft = softwareGl();
    renderer.setPixelRatio(soft ? 1 : Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = !soft;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(FOG);
    scene.fog = new THREE.Fog(FOG, 140, 900);
    scene.add(skyDome());
    const hemi = new THREE.HemisphereLight('#e8f4ff', '#3f6b2a', 1.25);
    const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(soft ? 512 : 2048, soft ? 512 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 18;
    sc.bottom = -18;
    sc.near = 1;
    sc.far = 120;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    scene.add(hemi, sun, sun.target);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 3000);

    // You and your partners. Each holds a full bag: in a match the one
    // whose shot it is (`frame.swinger`) swings, the others stand by.
    type Bag = Record<'driver' | 'iron' | 'putter', GolfClub3D>;
    const figure = (look: typeof live.current.me, key: string) => {
      const c = makeCharacter(look, key);
      const clubs: Bag = {
        driver: makeClub('driver'),
        iron: makeClub('iron'),
        putter: makeClub('putter'),
      };
      for (const k of Object.values(clubs)) c.root.add(k.root);
      scene.add(c.root);
      return { c, clubs };
    };
    const figs = [
      figure(live.current.me, 'me'),
      ...live.current.partners.slice(0, 2).map((look, i) => figure(look, `partner:${i}`)),
    ];
    // A caddie's bag by the tee.
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.9, 10), mat('#1e3a8a'));
    bag.rotation.z = 0.25;
    bag.castShadow = true;
    scene.add(bag);

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 14, 10),
      mat('#ffffff', { rough: 0.35 }),
    );
    ball.castShadow = true;
    scene.add(ball);
    const ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.07, 12),
      new THREE.MeshBasicMaterial({
        color: '#000000',
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    ballShadow.rotation.x = -Math.PI / 2;
    scene.add(ballShadow);
    // The flight's trail.
    const TRAIL = 64;
    const trailPos = new Float32Array(TRAIL * 3);
    const trailG = new THREE.BufferGeometry();
    trailG.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Line(
      trailG,
      new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 }),
    );
    trail.frustumCulled = false;
    scene.add(trail);
    let trailN = 0;
    // The aim line and the target ring.
    const aimG = new THREE.BufferGeometry();
    const aimPos = new Float32Array(2 * 3 * 40);
    aimG.setAttribute('position', new THREE.BufferAttribute(aimPos, 3));
    const aimLine = new THREE.LineSegments(
      aimG,
      new THREE.LineBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.9 }),
    );
    aimLine.frustumCulled = false;
    scene.add(aimLine);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.2, 32),
      new THREE.MeshBasicMaterial({
        color: '#fde047',
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);

    let hole: { n: number; root: THREE.Group; flag: THREE.Mesh } | null = null;
    const camPos = new THREE.Vector3(0, 30, 30);
    const camLook = new THREE.Vector3();
    let lastCam = '';
    let ready = false;
    const size = () => {
      const b = parent.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) return;
      renderer.setSize(b.width, b.height, false);
      camera.aspect = b.width / b.height;
      // A tall phone gets a wider view, so the swing and the hole both fit.
      camera.fov = camera.aspect < 0.7 ? 60 : 48;
      camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(parent);

    const v = new THREE.Vector3();
    const want = new THREE.Vector3();
    const look = new THREE.Vector3();
    let raf = 0;
    let last = performance.now();
    const minGap = cpuGl() ? 120 : soft ? 45 : 0;
    const t0 = performance.now();
    let frameN = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      if (now - last < minGap) return;
      const dt = Math.min(0.6, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const f = live.current.frame();
      const g = holeAt(f);
      if (!hole || hole.n !== f.hole) {
        if (hole) {
          scene.remove(hole.root);
          disposeTree(hole.root);
        }
        const h = buildHole(g, live.current.market);
        scene.add(h.root);
        hole = { n: f.hole, ...h };
        trailN = 0;
      }
      // The flag in the breeze.
      hole.flag.rotation.y = Math.sin(t * 1.7) * 0.35 + 0.4;
      hole.flag.scale.x = 0.9 + Math.sin(t * 5.3) * 0.08;

      // The golfer: feet at their spot, the target on their left.
      const H = f.heading;
      const fx = Math.sin(H);
      const fz = -Math.cos(H);
      // Their facing (+z of the figure) is the target line's right.
      const zx = Math.cos(H);
      const zz = Math.sin(H);
      const swinger = Math.max(0, Math.min(figs.length - 1, f.swinger ?? 0));
      const me = figs[swinger]!.c;
      const clubs = figs[swinger]!.clubs;
      me.root.visible = true;
      me.root.position.set(f.golfer.x, 0, f.golfer.z);
      me.root.rotation.y = Math.atan2(zx, zz);
      for (const [k, c] of Object.entries(clubs)) c.root.visible = k === f.club;
      if (f.cheer) {
        pose(me, 'cheer', t);
        for (const c of Object.values(clubs)) c.root.visible = false;
      } else golfPose(me, f.swing, f.putting, clubs[f.club], t);
      figs
        .filter((_, k) => k !== swinger)
        .forEach((p, i) => {
          const s = f.partners[i];
          if (!s) {
            p.c.root.visible = false;
            return;
          }
          p.c.root.visible = true;
          p.c.root.position.set(s.x, 0, s.z);
          p.c.root.rotation.y = s.face;
          for (const [k, c] of Object.entries(p.clubs)) c.root.visible = k === 'iron';
          partnerPose(p.c, p.clubs.iron, t + i * 1.3, s.clap ? 'clap' : 'stand');
        });
      // The bag stands behind you; on a tall phone (the camera further back) beside you
      // instead, so it isn't a big shape in the corner of the picture.
      const tallView = camera.aspect < 0.75;
      const back = tallView ? -0.6 : 2.2;
      const side = tallView ? 1.8 : 1.4;
      bag.position.set(
        f.golfer.x - fx * back - zx * side,
        0.45,
        f.golfer.z - fz * back - zz * side,
      );
      bag.visible = !f.putting;

      // The ball, its shadow and trail.
      ball.position.set(f.ball.x, f.ball.y + 0.05, f.ball.z);
      ball.visible = f.cam !== 'holed' || f.ball.y > 0;
      ballShadow.position.set(f.ball.x, 0.05, f.ball.z);
      ballShadow.scale.setScalar(1 + f.ball.y * 0.05);
      (ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0.08,
        0.35 - f.ball.y * 0.01,
      );
      if (f.cam === 'follow') {
        if (
          trailN === 0 ||
          v
            .set(
              trailPos[(trailN - 1) * 3]!,
              trailPos[(trailN - 1) * 3 + 1]!,
              trailPos[(trailN - 1) * 3 + 2]!,
            )
            .distanceTo(ball.position) > 0.8
        ) {
          if (trailN >= TRAIL) {
            trailPos.copyWithin(0, 3);
            trailN = TRAIL - 1;
          }
          trailPos.set([ball.position.x, ball.position.y, ball.position.z], trailN * 3);
          trailN++;
          trailG.attributes.position!.needsUpdate = true;
        }
      } else if (f.cam === 'aim' || f.cam === 'putt' || f.cam === 'intro') trailN = 0;
      trailG.setDrawRange(0, trailN);
      trail.visible = trailN > 1;

      // The aim line: dashes along the heading to the carry.
      if (f.aim && (f.cam === 'aim' || f.cam === 'putt' || f.cam === 'swing')) {
        aimLine.visible = true;
        ring.visible = !f.putting;
        const n = 20;
        for (let i = 0; i < n; i++) {
          const a = along(f.ball, f.aim.heading, (f.aim.carry * (2 * i)) / (2 * n));
          const b = along(f.ball, f.aim.heading, (f.aim.carry * (2 * i + 1)) / (2 * n));
          aimPos.set([a.x, 0.12, a.z, b.x, 0.12, b.z], i * 6);
        }
        aimG.setDrawRange(0, n * 2);
        aimG.attributes.position!.needsUpdate = true;
        const end = along(f.ball, f.aim.heading, f.aim.carry);
        ring.position.set(end.x, 0.1, end.z);
        const s = Math.max(1, f.aim.carry / 60);
        ring.scale.setScalar(s);
      } else {
        aimLine.visible = false;
        ring.visible = false;
      }

      // The camera.
      const tall = camera.aspect < 0.75;
      const bx = f.ball.x;
      const bz = f.ball.z;
      let k = 4;
      switch (f.cam) {
        case 'intro': {
          const u = f.intro;
          const L = g.line.length - 1;
          const p = g.line[Math.round(Math.min(1, u * 0.75) * L)]!;
          want.set(p.x + 22, 46 - u * 18, p.z + 40);
          look.set(g.pin.x, 0, g.pin.z);
          k = 3;
          break;
        }
        case 'aim':
          // A tall phone sees little across: from further back and straight down the line,
          // so you (standing left of the ball) are in the picture, clear of the clubs.
          if (tall) {
            want.set(bx - fx * 8.6 + zx * 0.1, 2.35, bz - fz * 8.6 + zz * 0.1);
            look.set(bx + fx * 30 - zx * 0.6, 0.3, bz + fz * 30 - zz * 0.6);
          } else {
            want.set(bx - fx * 5.6 + zx * 0.9, 2.1, bz - fz * 5.6 + zz * 0.9);
            look.set(bx + fx * 30, 0.4, bz + fz * 30);
          }
          break;
        case 'swing': {
          // Side-on; a tall phone stands further off so the backswing clears the clubs.
          const off = tall ? 6.2 : 4.6;
          want.set(f.golfer.x + zx * off - fx * 1.2, 1.0, f.golfer.z + zz * off - fz * 1.2);
          look.set(f.golfer.x + fx * 0.2, 1.05, f.golfer.z + fz * 0.2);
          k = 5;
          break;
        }
        case 'follow':
          want.set(bx - fx * 11 + zx * 3, 4 + f.ball.y * 0.45, bz - fz * 11 + zz * 3);
          look.set(bx, f.ball.y * 0.8, bz);
          k = 3.2;
          break;
        case 'putt': {
          const dx = g.pin.x - bx;
          const dz = g.pin.z - bz;
          const d = Math.max(1, Math.hypot(dx, dz));
          const m = Math.min(d, 7) / d;
          // Down the line, low behind the ball: you on the left, the cup ahead
          // (a tall phone a little further back, so you aren't cut at the edge).
          if (tall) want.set(bx - fx * 6.4 + zx * 0.05, 1.7, bz - fz * 6.4 + zz * 0.05);
          else want.set(bx - fx * 4.6 + zx * 0.3, 1.45, bz - fz * 4.6 + zz * 0.3);
          look.set(bx + dx * m * 0.45, 0.25, bz + dz * m * 0.45);
          break;
        }
        case 'holed': {
          // Near the hole: you and the cup in one picture; far off, you.
          const gx = f.golfer.x;
          const gz = f.golfer.z;
          if (Math.hypot(g.pin.x - gx, g.pin.z - gz) < 14) {
            const mx = (gx + g.pin.x) / 2;
            const mz = (gz + g.pin.z) / 2;
            want.set(mx + zx * 5 - fx * 2, 1.8, mz + zz * 5 - fz * 2);
            look.set(mx, 0.6, mz);
          } else {
            want.set(gx + zx * 4.8 - fx * 1.2, 1.3, gz + zz * 4.8 - fz * 1.2);
            look.set(gx, 1.0, gz);
          }
          break;
        }
      }
      // A cut when the mode changes (except into the follow), then easing.
      // Into the swing too: gliding round from behind the ball to beside it,
      // in a straight line while looking down the fairway, swept the ball off
      // the left of the screen and under the clubs, for as long as the glide
      // took (a second or more on a slow phone's software WebGL).
      if (lastCam !== f.cam && f.cam !== 'follow') {
        camPos.copy(want);
        camLook.copy(look);
      }
      lastCam = f.cam;
      const e = 1 - Math.exp(-dt * k);
      camPos.lerp(want, e);
      camLook.lerp(look, e);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      // The sun's shadows follow what you're looking at.
      sun.position.set(camLook.x + 30, 60, camLook.z + 20);
      sun.target.position.copy(camLook);
      renderer.render(scene, camera);
      // Where the ball, the aim's end and the flag landed on screen (tests).
      const onScreen = (x: number, y: number, z: number) => {
        v.set(x, y, z).project(camera);
        return v.z < 1 ? { x: (v.x + 1) / 2, y: (1 - v.y) / 2 } : null;
      };
      markScreen(
        canvas,
        'ball',
        ball.visible ? onScreen(ball.position.x, ball.position.y, ball.position.z) : null,
      );
      markScreen(
        canvas,
        'aim-end',
        aimLine.visible ? onScreen(ring.position.x, ring.position.y, ring.position.z) : null,
      );
      markScreen(canvas, 'flag', onScreen(g.pin.x, 2.15, g.pin.z));
      // Where you are on screen (your box, every few frames): tests check you're in the picture.
      if (frameN++ % 6 === 0) markGolfer(canvas, me.root, camera, Object.values(clubs));
      if (!ready) {
        ready = true;
        live.current.onReady?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (hole) disposeTree(hole.root);
      disposeTree(scene);
      renderer.dispose();
    };
  }, []);
  return <canvas ref={ref} className="golf-3d" aria-hidden="true" data-golf-3d="" />;
}

/**
 * The golfer's box on the canvas as `data-golf-golfer` (fractions: "left,top,right,bottom"):
 * the person, not the club (at the top of the backswing it reaches well past them).
 */
function markGolfer(
  canvas: HTMLCanvasElement,
  root: THREE.Object3D,
  camera: THREE.Camera,
  clubs: { root: THREE.Object3D }[],
) {
  const shown = clubs.map((c) => c.root.visible);
  for (const c of clubs) c.root.visible = false;
  const v = screenBoxAttr(screenBoxOf(root, camera));
  clubs.forEach((c, i) => (c.root.visible = shown[i]!));
  if (canvas.dataset.golfGolfer !== v) canvas.dataset.golfGolfer = v;
}
