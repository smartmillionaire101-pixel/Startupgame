/**
 * The aircraft and the people in them, for the skydive and the helicopter
 * ride (./air3d.ts places them each frame): a light helicopter in the game's
 * teal and cream (bubble cabin, four-blade main rotor, tail boom, fin, tail
 * rotor, skids), its cabin from inside (the bubble's frame, the instrument
 * panel, tan leather seats, the pilot in a headset), the high-wing jump plane
 * with its door rolled up, the jumper (helmet, goggles, rig) in the poses of
 * a jump, the canopy, and your own arms in freefall with the wrist altimeter.
 *
 * Phones: every model is built with the room kit (../../interiors3d/kit.ts),
 * one merged mesh per material, low-poly; only what turns (rotors, props)
 * and what changes (the altimeter's face) stays separate. Metres, nose
 * towards −z, the ground (skids, wheels) at y = 0 unless said.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AvatarLook } from '../../city/art';
import { Kit, mat } from '../../interiors3d/kit';
import { makeCharacter, pose, type Character } from '../../interiors3d/character';

const TEAL = '#0f766e';
const CREAM = '#f7f3ec';
const AMBER = '#d97706';
const GLASS = '#16324f';

type V3 = [number, number, number];

/** A bent tube through these points (a skid, a frame post), for a kit. */
const tube = (pts: V3[], r: number) =>
  new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))),
    10,
    r,
    6,
  );

/** A canvas texture drawn once (a livery, a title, a screen). */
function drawn(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Lettering on a clear background (a title on a fuselage). */
function title(text: string, color: string, w: number, h: number, font: string) {
  const t = drawn(w, h, (g) => {
    g.fillStyle = color;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
  });
  return new THREE.MeshStandardMaterial({
    map: t,
    transparent: true,
    depthWrite: false,
    roughness: 0.5,
  });
}

/** A material of its own (it carries a texture made for this model). */
const own = (map: THREE.Texture, o: { rough?: number; metal?: number } = {}) =>
  new THREE.MeshStandardMaterial({ map, roughness: o.rough ?? 0.4, metalness: o.metal ?? 0.1 });

/** What a model gives back: the group, and the parts that turn. */
export interface Craft {
  group: THREE.Group;
  /** Turned about their own axis each frame (rotors, props). */
  spin: { part: THREE.Object3D; axis: 'x' | 'y' | 'z'; rate: number }[];
  /** Textures made for this model (freed with it). */
  textures: THREE.Texture[];
}

// ---------------------------------------------------------------- The helicopter

/** The cabin's centre height and radius (the cockpit inside uses the same). */
const CY = 1.55;
const R = 1.25;
const CAB = new THREE.Vector3(1.05, 1.0, 1.55);

/** The main rotor: mast, hub, four blades with amber tips and (still) a soft disc. */
function mainRotor(blur: boolean) {
  const k = new Kit();
  const metal = mat('#4b5563', { rough: 0.4, metal: 0.6 });
  const dark = mat('#1f2937', { rough: 0.6 });
  const blade = mat('#374151', { rough: 0.5 });
  const tip = mat(AMBER);
  k.add(new THREE.CylinderGeometry(0.09, 0.12, 0.45, 8), metal, 0, -0.18, 0, {});
  k.add(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10), dark, 0, 0, 0, {});
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    const b = new THREE.BoxGeometry(0.32, 0.04, 5.3);
    b.translate(0, 0, 2.7);
    k.add(b, blade, 0, 0, 0, { ry: a });
    const t = new THREE.BoxGeometry(0.33, 0.045, 0.35);
    t.translate(0, 0, 5.2);
    k.add(t, tip, 0, 0, 0, { ry: a });
  }
  const g = k.build();
  if (blur) {
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 5.45, 40),
      mat('#9ca3af', { opacity: 0.16, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    g.add(disc);
  }
  g.position.set(0, CY + 1.55, 0.3);
  return g;
}

/**
 * A light helicopter, seen from outside. `reduced`: the rotors stand still
 * (their discs show they turn). ~11 m long.
 */
export function helicopter({ reduced = false }: { reduced?: boolean } = {}): Craft {
  const livery = drawn(256, 128, (g) => {
    g.fillStyle = TEAL;
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = AMBER;
    g.fillRect(0, 69, 256, 6);
    g.fillStyle = CREAM;
    g.fillRect(0, 75, 256, 53);
  });
  const k = new Kit();
  const body = own(livery, { rough: 0.35, metal: 0.15 });
  const glass = mat(GLASS, { rough: 0.05, metal: 0.9, opacity: 0.85 });
  const metal = mat('#4b5563', { rough: 0.4, metal: 0.6 });
  const dark = mat('#1f2937', { rough: 0.6 });
  const teal = mat(TEAL, { rough: 0.35, metal: 0.15 });
  const amber = mat(AMBER);
  const cabin = new THREE.SphereGeometry(R, 24, 16);
  cabin.scale(CAB.x, CAB.y, CAB.z);
  k.add(cabin, body, 0, CY, 0, {});
  // The bubble: the windscreen and chin windows over the nose, then the side doors' windows.
  for (const [p0, pl, t0, tl] of [
    [1.17, 0.66, 0.12, 0.62],
    [1.88, 0.24, 0.2, 0.3],
    [0.88, 0.24, 0.2, 0.3],
  ] as const) {
    const s = new THREE.SphereGeometry(
      R * 1.012,
      14,
      10,
      Math.PI * p0,
      Math.PI * pl,
      Math.PI * t0,
      Math.PI * tl,
    );
    s.scale(CAB.x, CAB.y, CAB.z);
    k.add(s, glass, 0, CY, 0, {});
  }
  // The engine cowling and exhaust.
  k.add(new RoundedBoxGeometry(1.1, 0.55, 2.2, 2, 0.22), body, 0, CY + 1.12, 0.75, {});
  k.add(new THREE.CylinderGeometry(0.12, 0.14, 0.4, 8), metal, 0, CY + 1.12, 1.95, {
    rx: Math.PI / 2,
  });
  // Tail boom, fin with its amber tip, the stabiliser and its end plates.
  k.add(new THREE.CylinderGeometry(0.16, 0.38, 5.6, 10), teal, 0, CY + 0.55, 4.3, {
    rx: Math.PI / 2 - 0.05,
  });
  k.add(new THREE.BoxGeometry(0.08, 1.5, 0.85), teal, 0, CY + 1.15, 6.85, { rx: -0.35 });
  k.add(new THREE.BoxGeometry(0.085, 0.3, 0.6), amber, 0, CY + 1.85, 7.12, { rx: -0.35 });
  k.add(new THREE.BoxGeometry(1.8, 0.06, 0.42), teal, 0, CY + 0.62, 6.1, {});
  for (const sx of [-1, 1])
    k.add(new THREE.BoxGeometry(0.05, 0.32, 0.4), amber, sx * 0.9, CY + 0.66, 6.1, {});
  // Skids and their cross tubes.
  for (const sx of [-1, 1])
    k.add(
      tube(
        [
          [sx * 1.05, 0.38, -2.35],
          [sx * 1.05, 0.1, -1.9],
          [sx * 1.05, 0.06, 0],
          [sx * 1.05, 0.08, 1.7],
        ],
        0.055,
      ),
      metal,
      0,
      0,
      0,
      {},
    );
  for (const z of [-0.95, 0.95])
    k.add(
      tube(
        [
          [-1.05, 0.08, z],
          [-0.85, 0.75, z],
          [0, 0.55, z],
          [0.85, 0.75, z],
          [1.05, 0.08, z],
        ],
        0.05,
      ),
      metal,
      0,
      0,
      0,
      {},
    );
  // Door seams; the navigation lights (red left, green right) and the beacon.
  for (const sx of [-1, 1])
    k.add(new THREE.TorusGeometry(0.62, 0.012, 3, 14, Math.PI), dark, sx * 1.3, CY + 0.05, 0.25, {
      ry: Math.PI / 2,
      rz: -Math.PI / 2,
    });
  const lamp = (c: string, x: number, y: number, z: number) =>
    k.add(
      new THREE.SphereGeometry(0.08, 6, 4),
      mat(c, { emissive: c, emissiveIntensity: 2 }),
      x,
      y,
      z,
      {},
    );
  lamp('#ef4444', -0.9, CY + 0.6, 6.1);
  lamp('#22c55e', 0.9, CY + 0.6, 6.1);
  lamp('#f43f5e', 0, CY + 1.42, 1.0);
  const group = k.build();
  // The name down both sides of the boom.
  const name = title('RUNWAY', CREAM, 256, 40, '800 32px system-ui, sans-serif');
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.4), name);
    m.position.set(sx * 0.33, CY + 0.6, 3.4);
    m.rotation.y = (sx * Math.PI) / 2;
    group.add(m);
  }
  const rotor = mainRotor(true);
  group.add(rotor);
  // The tail rotor, on the left of the fin.
  const tk = new Kit();
  tk.add(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 8), metal, 0, 0, 0, { rz: Math.PI / 2 });
  for (let i = 0; i < 2; i++)
    tk.add(new THREE.BoxGeometry(0.03, 1.3, 0.1), mat('#e5e7eb'), -0.03, 0, 0, {
      rx: (i * Math.PI) / 2 + 0.4,
    });
  const tail = tk.build();
  const tdisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.66, 20),
    mat('#d1d5db', { opacity: 0.28, side: THREE.DoubleSide }),
  );
  tdisc.rotation.y = Math.PI / 2;
  tdisc.position.x = -0.04;
  tail.add(tdisc);
  tail.position.set(-0.14, CY + 1.25, 6.95);
  group.add(tail);
  return {
    group,
    spin: reduced
      ? []
      : [
          { part: rotor, axis: 'y', rate: -24 },
          { part: tail, axis: 'x', rate: 60 },
        ],
    textures: [livery, name.map!],
  };
}

/** The panel's two screens: the attitude indicator and the moving map. */
function panelTexture() {
  return drawn(256, 96, (g) => {
    g.fillStyle = '#0b1220';
    g.fillRect(0, 0, 256, 96);
    // Attitude: sky over ground, the aircraft symbol.
    g.save();
    g.beginPath();
    g.arc(64, 48, 40, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#2b7bd3';
    g.fillRect(0, 0, 128, 50);
    g.fillStyle = '#8b5a2b';
    g.fillRect(0, 50, 128, 50);
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(20, 50);
    g.lineTo(108, 50);
    g.stroke();
    g.restore();
    g.strokeStyle = '#fbbf24';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(42, 48);
    g.lineTo(58, 48);
    g.lineTo(64, 54);
    g.lineTo(70, 48);
    g.lineTo(86, 48);
    g.stroke();
    // The map: the river, the route dashed, you.
    g.fillStyle = '#16302a';
    g.fillRect(132, 4, 120, 88);
    g.strokeStyle = '#4f86a8';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(132, 60);
    g.bezierCurveTo(170, 40, 210, 80, 252, 54);
    g.stroke();
    g.strokeStyle = '#fbbf24';
    g.lineWidth = 2;
    g.setLineDash([5, 4]);
    g.beginPath();
    g.moveTo(192, 86);
    g.lineTo(204, 52);
    g.lineTo(180, 22);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(192, 78);
    g.lineTo(186, 90);
    g.lineTo(198, 90);
    g.fill();
  });
}

/** The pilot: white shirt, dark trousers, a headset. */
const PILOT: AvatarLook = {
  skin: '#8d5524',
  hair: '#1f2937',
  hairStyle: 'short',
  top: '#f8fafc',
  bottom: '#1f2937',
  accessory: 'none',
  gender: 'male',
  trousers: true,
};

/**
 * The helicopter from inside, in the same frame as `helicopter()`: the
 * bubble's frame (centre post, door posts, roof arch, sill), the doors and
 * rear bulkhead in cabin trim, the headliner, the instrument panel on its
 * stalk under a glare shield, the cyclic and collective, two tan leather
 * seats and the pilot in the right-hand one; the rotor turns overhead.
 */
export function cockpit({ reduced = false }: { reduced?: boolean } = {}): Craft {
  const k = new Kit();
  const frame = mat('#d6d3cd', { rough: 0.5 });
  const dark = mat('#1f2937', { rough: 0.7 });
  const leather = mat('#8a6a4f', { rough: 0.6 });
  const trim = mat('#2b3a3a', { rough: 0.8 });
  k.add(new THREE.BoxGeometry(2.2, 0.05, 2.3), mat('#374151'), 0, 0.62, 0.55, {});
  const ry = CY + 1.18;
  k.add(
    tube(
      [
        [0, ry - 0.02, 0.2],
        [0, ry - 0.12, -0.75],
        [0, CY + 0.55, -1.6],
        [0, CY - 0.3, -1.92],
      ],
      0.05,
    ),
    frame,
    0,
    0,
    0,
    {},
  );
  for (const sx of [-1, 1]) {
    k.add(
      tube(
        [
          [sx * 0.15, ry, 0.25],
          [sx * 0.9, CY + 0.95, 0.05],
          [sx * 1.27, CY + 0.2, -0.15],
          [sx * 1.27, CY - 0.55, -0.15],
          [sx * 1.1, 0.75, -0.2],
        ],
        0.07,
      ),
      frame,
      0,
      0,
      0,
      {},
    );
    k.add(
      tube(
        [
          [sx * 1.15, CY - 0.6, -0.35],
          [sx * 0.95, CY - 0.75, -1.2],
          [sx * 0.25, CY - 0.9, -1.75],
        ],
        0.04,
      ),
      frame,
      0,
      0,
      0,
      {},
    );
    k.add(new THREE.BoxGeometry(0.04, 0.05, 0.22), dark, sx * 1.24, CY + 0.05, 0.25, {});
    k.add(new RoundedBoxGeometry(0.08, 0.75, 1.5, 1, 0.03), trim, sx * 1.2, 1.0, 0.45, {});
    k.add(
      new RoundedBoxGeometry(0.14, 0.06, 0.6, 1, 0.02),
      mat('#3b2f2a'),
      sx * 1.12,
      1.38,
      0.55,
      {},
    );
  }
  k.add(new THREE.BoxGeometry(2.4, 1.9, 0.08), trim, 0, 1.6, 2.15, {});
  // The headliner and the overhead console with its switches.
  const roof = new THREE.SphereGeometry(1.3, 16, 6, 0, Math.PI * 2, 0, 0.55);
  roof.scale(1.05, 0.9, 1.0);
  k.add(roof, mat('#9ca3af', { rough: 0.9, side: THREE.BackSide }), 0, CY + 0.12, 0.7, {});
  k.add(new RoundedBoxGeometry(0.42, 0.08, 0.6, 1, 0.03), dark, 0, ry - 0.08, 0.05, {});
  for (let i = 0; i < 8; i++)
    k.add(
      new THREE.BoxGeometry(0.018, 0.02, 0.018),
      mat(i % 3 ? '#e5e7eb' : '#ef4444'),
      -0.15 + (i % 4) * 0.1,
      ry - 0.13,
      -0.1 + Math.floor(i / 4) * 0.15,
      {},
    );
  // The instrument panel on its stalk, tilted up to the pilots, under the glare shield.
  k.add(new RoundedBoxGeometry(1.0, 0.34, 0.14, 2, 0.05), dark, 0, CY - 0.32, -1.15, {
    rx: -0.35,
  });
  k.add(
    new RoundedBoxGeometry(1.1, 0.05, 0.28, 1, 0.02),
    mat('#111827', { rough: 0.95 }),
    0,
    CY - 0.32 + 0.19,
    -1.15 + 0.12,
    { rx: -0.35 },
  );
  k.add(new THREE.BoxGeometry(0.16, 0.45, 0.16), dark, 0, 0.85, -1.08, {});
  // Seats: cushion, back, headrest, the amber belt.
  for (const sx of [-1, 1]) {
    const x = sx * 0.48;
    k.add(new RoundedBoxGeometry(0.55, 0.14, 0.55, 2, 0.05), leather, x, 1.03, 0.35, {});
    k.add(new RoundedBoxGeometry(0.55, 0.8, 0.14, 2, 0.05), leather, x, 1.47, 0.65, {
      rx: -0.12,
    });
    k.add(new RoundedBoxGeometry(0.34, 0.2, 0.12, 2, 0.04), leather, x, 1.95, 0.71, {});
    k.add(new THREE.BoxGeometry(0.06, 0.7, 0.02), mat(AMBER), x + sx * 0.12, 1.5, 0.57, {
      rz: sx * 0.25,
    });
  }
  // The cyclic for the pilot (right seat) and the collective by the seat.
  k.add(
    tube(
      [
        [0.48, 0.66, -0.15],
        [0.48, 0.9, -0.2],
        [0.47, 1.2, -0.25],
      ],
      0.025,
    ),
    dark,
    0,
    0,
    0,
    {},
  );
  k.add(new THREE.CapsuleGeometry(0.035, 0.1, 2, 6), dark, 0.47, 1.26, -0.26, {});
  k.add(
    tube(
      [
        [0.16, 0.95, 0.3],
        [0.16, 1.05, -0.15],
      ],
      0.025,
    ),
    dark,
    0,
    0,
    0,
    {},
  );
  const group = k.build();
  // The screens, lit.
  const screens = panelTexture();
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.88, 0.3),
    new THREE.MeshBasicMaterial({ map: screens }),
  );
  panel.position.set(0, CY - 0.32, -1.15);
  panel.rotation.x = -0.35;
  panel.translateZ(0.075);
  group.add(panel);
  // The pilot, in the right seat, hands on the controls, a headset on.
  const pilot = makeCharacter(PILOT, 'pilot');
  pose(pilot, 'sit', 0, { seat: 0.52 });
  pilot.shadow.visible = false;
  pilot.root.position.set(0.48, 0.65, 0.45);
  pilot.root.rotation.y = Math.PI;
  pilot.armR.rotation.x = -0.35;
  pilot.foreR.rotation.x = -0.9;
  pilot.armL.rotation.x = -0.3;
  pilot.foreL.rotation.x = -0.8;
  pilot.head.rotation.y = -0.45;
  const hk = new Kit();
  const black = mat('#111827');
  hk.add(new THREE.TorusGeometry(0.16, 0.02, 4, 12, Math.PI), black, 0, 0.21, 0, {
    ry: Math.PI / 2,
  });
  for (const sx of [-1, 1])
    hk.add(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10), black, sx * 0.15, 0.2, 0, {
      rz: Math.PI / 2,
    });
  hk.add(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 4), black, 0.1, 0.14, 0.09, {
    rz: Math.PI / 2.4,
    ry: 0.8,
  });
  pilot.head.add(hk.build());
  group.add(pilot.root);
  const rotor = mainRotor(false);
  group.add(rotor);
  return {
    group,
    spin: reduced ? [] : [{ part: rotor, axis: 'y', rate: -24 }],
    textures: [screens],
  };
}

// ---------------------------------------------------------------- The jump plane

/**
 * A high-wing twin turboprop in white with a teal cheat line, nose towards
 * −z, its fuselage centred on y = 0. The jump door is open on the left (−x):
 * the roll-up door pushed up, the frame, the grab bar. `door` is where its
 * sill's middle is.
 */
export function jumpPlane({ reduced = false }: { reduced?: boolean } = {}): Craft & {
  door: THREE.Vector3;
} {
  const k = new Kit();
  const white = mat('#f8fafc', { rough: 0.35, metal: 0.1 });
  const teal = mat(TEAL, { rough: 0.35 });
  const dark = mat('#111827', { rough: 0.9 });
  const glass = mat(GLASS, { rough: 0.05, metal: 0.8 });
  const grey = mat('#9ca3af');
  k.add(new RoundedBoxGeometry(1.9, 1.95, 10, 2, 0.55), white, 0, 0, 0, {});
  const nose = new THREE.SphereGeometry(1, 16, 10);
  nose.scale(0.95, 0.85, 1.6);
  k.add(nose, white, 0, -0.08, -5.0, {});
  k.add(new THREE.CylinderGeometry(0.3, 0.95, 4.2, 12), white, 0, 0.25, 6.8, {
    rx: Math.PI / 2 + 0.1,
  });
  for (const sx of [-1, 1]) {
    k.add(new THREE.BoxGeometry(0.02, 0.18, 9.8), teal, sx * 0.955, -0.15, 0, {});
    k.add(new THREE.PlaneGeometry(1.1, 0.42), glass, sx * 0.9, 0.5, -4.6, {
      ry: (sx * Math.PI) / 2 - sx * 0.25,
    });
  }
  for (let i = 0; i < 4; i++)
    k.add(new THREE.CircleGeometry(0.2, 10), glass, 0.962, 0.4, -2.6 + i * 1.0, {
      ry: Math.PI / 2,
    });
  // The wing on its struts, the engines, the fixed gear.
  k.add(new RoundedBoxGeometry(19, 0.26, 1.9, 1, 0.1), white, 0, 1.08, -1.6, {});
  for (const sx of [-1, 1]) {
    k.add(new THREE.BoxGeometry(0.6, 0.27, 1.9), teal, sx * 9.25, 1.08, -1.6, {});
    k.add(new THREE.BoxGeometry(5.8, 0.08, 0.1), mat('#cbd5e1'), sx * 3.4, 0.0, -1.5, {
      rz: sx * 0.3,
    });
    k.add(new THREE.CylinderGeometry(0.42, 0.36, 2.8, 10), white, sx * 3.1, 0.92, -2.4, {
      rx: Math.PI / 2,
    });
    k.add(new THREE.ConeGeometry(0.22, 0.45, 10), teal, sx * 3.1, 0.92, -4.0, {
      rx: -Math.PI / 2,
    });
    k.add(new THREE.BoxGeometry(0.1, 1.0, 0.25), grey, sx * 1.25, -1.2, 0.4, { rz: sx * 0.6 });
    k.add(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12), dark, sx * 1.6, -1.62, 0.4, {
      rz: Math.PI / 2,
    });
  }
  k.add(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12), dark, 0, -1.55, -4.3, {
    rz: Math.PI / 2,
  });
  k.add(new RoundedBoxGeometry(0.16, 2.5, 1.9, 1, 0.06), teal, 0, 1.75, 8.2, { rx: -0.3 });
  k.add(new RoundedBoxGeometry(6.2, 0.12, 1.3, 1, 0.05), white, 0, 0.95, 8.4, {});
  // The door: the dark opening with a warm light inside, the frame, the bar, the rolled-up door.
  const door = new THREE.Vector3(-0.958, -0.05, 2.4);
  const d = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) =>
    k.add(geo, m, door.x + x, door.y + y, door.z + z, { ry: -Math.PI / 2 });
  d(new THREE.PlaneGeometry(1.35, 1.6), mat('#2a2f38', { rough: 1 }), -0.001, 0, 0);
  d(
    new THREE.PlaneGeometry(1.2, 0.5),
    mat('#fde68a', { emissive: '#fbbf24', emissiveIntensity: 0.25, opacity: 0.25 }),
    -0.003,
    0.5,
    0,
  );
  const fr = mat('#94a3b8', { metal: 0.5, rough: 0.4 });
  for (const [h, w, y, z] of [
    [1.7, 0.08, 0, -0.7],
    [1.7, 0.08, 0, 0.7],
    [0.08, 1.48, 0.82, 0],
    [0.08, 1.48, -0.82, 0],
  ] as const)
    k.add(new THREE.BoxGeometry(0.06, h, w), fr, door.x - 0.02, door.y + y, door.z + z, {});
  k.add(
    new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6),
    mat(AMBER, { metal: 0.4 }),
    door.x - 0.08,
    door.y + 0.9,
    door.z,
    { rx: Math.PI / 2 },
  );
  k.add(new THREE.BoxGeometry(0.06, 0.16, 1.4), white, door.x - 0.03, door.y + 0.98, door.z, {});
  const group = k.build();
  // The titles down both sides.
  const name = title('RUNWAY SKYDIVE', TEAL, 512, 64, '800 46px system-ui, sans-serif');
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.45), name);
    m.position.set(sx * 0.962, 0.45, -1.6);
    m.rotation.y = (sx * Math.PI) / 2;
    group.add(m);
  }
  // The props: three blades and a faint disc each.
  const spin: Craft['spin'] = [];
  for (const sx of [-1, 1]) {
    const pk = new Kit();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.BoxGeometry(0.12, 1.3, 0.03);
      b.translate(0, 0.65, 0);
      pk.add(b, dark, 0, 0, 0, { rz: (i / 3) * Math.PI * 2 });
    }
    const prop = pk.build();
    prop.add(
      new THREE.Mesh(
        new THREE.CircleGeometry(1.3, 24),
        mat('#9ca3af', { opacity: 0.1, side: THREE.DoubleSide }),
      ),
    );
    prop.position.set(sx * 3.1, 0.92, -3.86);
    group.add(prop);
    if (!reduced) spin.push({ part: prop, axis: 'z', rate: sx * 40 });
  }
  return { group, spin, textures: [name.map!], door };
}

// ---------------------------------------------------------------- The jumper

/**
 * You, dressed for the jump: an orange jumpsuit over your own face and skin,
 * a white helmet (your hair under it), blue goggles and the black rig on
 * your back with its straps and the pilot-chute handle.
 */
export function jumper(look: AvatarLook): Character {
  const c = makeCharacter(
    {
      skin: look.skin,
      hair: look.hair,
      hairStyle: look.hairStyle,
      gender: look.gender,
      ...(look.face ? { face: look.face } : {}),
      top: '#f97316',
      bottom: '#1e293b',
      accessory: 'none',
      trousers: true,
    },
    'jumper',
  );
  c.hair.visible = false;
  c.shadow.visible = false;
  const hk = new Kit();
  hk.add(
    new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
    mat('#f8fafc', { rough: 0.3 }),
    0,
    0.21,
    0,
    {},
  );
  hk.add(
    new THREE.BoxGeometry(0.22, 0.07, 0.04),
    mat('#0ea5e9', { rough: 0.1, metal: 0.6 }),
    0,
    0.22,
    0.13,
    {},
  );
  hk.add(
    new THREE.BoxGeometry(0.2, 0.05, 0.02),
    mat('#0c4a6e', { rough: 0.05, metal: 0.8 }),
    0,
    0.22,
    0.152,
    {},
  );
  c.head.add(hk.build());
  const tk = new Kit();
  tk.add(
    new RoundedBoxGeometry(0.34, 0.46, 0.16, 2, 0.05),
    mat('#111827', { rough: 0.8 }),
    0,
    0.27,
    -0.17,
    {},
  );
  for (const sx of [-1, 1])
    tk.add(new THREE.BoxGeometry(0.04, 0.5, 0.02), mat('#111827'), sx * 0.08, 0.25, 0.115, {});
  tk.add(new THREE.SphereGeometry(0.03, 6, 4), mat('#f59e0b'), 0, 0.06, -0.26, {});
  c.torso.add(tk.build());
  return c;
}

/**
 * The box position: belly to earth, arms out and bent, knees bent, back
 * arched; `track`: arms swept back, legs straight. The body lies along +z
 * (the head forward) from the feet at the root.
 */
export function boxPose(c: Character, track = false) {
  pose(c, 'stand', 0);
  c.shadow.visible = false;
  c.root.rotation.set(Math.PI / 2, 0, 0);
  c.torso.rotation.x = -0.25;
  c.head.rotation.x = -0.45;
  if (track) {
    c.armL.rotation.set(0, 0, 0.35);
    c.armR.rotation.set(0, 0, -0.35);
    c.foreL.rotation.set(0, 0, 0);
    c.foreR.rotation.set(0, 0, 0);
    c.thighL.rotation.set(0, 0, 0.08);
    c.thighR.rotation.set(0, 0, -0.08);
    c.shinL.rotation.x = c.shinR.rotation.x = 0.1;
    return;
  }
  c.armL.rotation.set(0, 0, 1.55);
  c.armR.rotation.set(0, 0, -1.55);
  c.foreL.rotation.set(0, 0, 1.3);
  c.foreR.rotation.set(0, 0, -1.3);
  c.thighL.rotation.set(0.15, 0, 0.32);
  c.thighR.rotation.set(0.15, 0, -0.32);
  c.shinL.rotation.x = c.shinR.rotation.x = 1.15;
}

/** Sitting on the door's sill, legs out in the wind, a hand on the bar. */
export function doorPose(c: Character) {
  pose(c, 'sit', 0, { seat: 0.02 });
  c.shadow.visible = false;
  c.root.rotation.set(0, -Math.PI / 2, 0);
  c.armR.rotation.set(-2.6, 0, -0.2);
  c.foreR.rotation.x = -0.3;
  c.armL.rotation.set(-0.5, 0, 0.5);
  c.head.rotation.x = -0.25;
  c.shinL.rotation.x = 1.1;
  c.shinR.rotation.x = 1.3;
}

/** Hanging in the harness, hands up on the toggles. */
export function canopyPose(c: Character, turn = 0) {
  pose(c, 'stand', 0);
  c.shadow.visible = false;
  c.root.rotation.set(0, 0, 0);
  c.armL.rotation.set(0, 0, 2.7 - Math.max(0, -turn) * 0.6);
  c.armR.rotation.set(0, 0, -2.7 + Math.max(0, turn) * 0.6);
  c.thighL.rotation.x = c.thighR.rotation.x = -0.25;
  c.shinL.rotation.x = c.shinR.rotation.x = 0.3;
}

/**
 * The canopy: seven cells in red, white and blue on an arc, its lines down
 * to the harness. The jumper's feet are at the origin; the canopy ~6 m up.
 */
export function canopy(): THREE.Group {
  const k = new Kit();
  const colours = ['#ef4444', '#f8fafc', '#2563eb', '#ef4444', '#2563eb', '#f8fafc', '#ef4444'];
  const n = colours.length;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i - (n - 1) / 2) / n) * 1.6;
    const x = Math.sin(a) * 5;
    const y = 2 + Math.cos(a) * 5;
    k.add(new THREE.BoxGeometry(1.32, 0.38, 2.9), mat(colours[i]!, { rough: 0.8 }), x, y, 0, {
      rz: -a,
    });
    // Two lines from each cell down to the risers at the shoulders.
    for (const z of [-1.1, 1.1]) pts.push(x, y - 0.2, z, Math.sign(x) * 0.2, 1.55, 0);
  }
  const g = k.build();
  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(
    new THREE.LineSegments(
      lines,
      new THREE.LineBasicMaterial({ color: '#e5e7eb', transparent: true, opacity: 0.7 }),
    ),
  );
  return g;
}

// ---------------------------------------------------------------- Your arms in freefall

/**
 * Your arms out in front in the box position, in the camera's frame:
 * orange sleeves, black gloves and cuffs, and the altimeter on your left
 * wrist (`setAlt` redraws its face).
 */
export function freefallArms(): Craft & { setAlt: (m: number) => void } {
  const k = new Kit();
  const sleeve = mat('#f97316', { rough: 0.85 });
  const glove = mat('#1f2937', { rough: 0.7 });
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let altAt = new THREE.Vector3();
  for (const sx of [-1, 1]) {
    const from = new THREE.Vector3(sx * 0.3, -0.42, -0.2);
    const to = new THREE.Vector3(sx * 0.15, -0.1, -0.8);
    const dir = to.clone().sub(from);
    const len = dir.length();
    dir.normalize();
    e.setFromQuaternion(q.setFromUnitVectors(up, dir));
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const rot = { rx: e.x, ry: e.y, rz: e.z };
    k.add(new THREE.CapsuleGeometry(0.06, len, 3, 8), sleeve, mid.x, mid.y, mid.z, rot);
    const hand = to.clone().addScaledVector(dir, 0.07);
    const h = new THREE.SphereGeometry(0.06, 10, 6);
    h.scale(1.15, 0.7, 1.4);
    k.add(h, glove, hand.x, hand.y, hand.z, rot);
    const cuff = to.clone().addScaledVector(dir, -0.04);
    k.add(new THREE.CylinderGeometry(0.064, 0.064, 0.05, 10), glove, cuff.x, cuff.y, cuff.z, rot);
    if (sx < 0)
      altAt = to
        .clone()
        .addScaledVector(dir, -0.14)
        .add(new THREE.Vector3(0.03, 0.06, 0));
  }
  const group = k.build();
  // The altimeter: a dial facing you, its face drawn on a canvas.
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const face = new THREE.CanvasTexture(c);
  face.colorSpace = THREE.SRGBColorSpace;
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.025, 16), [
    mat('#111827'),
    new THREE.MeshBasicMaterial({ map: face }),
    mat('#111827'),
  ]);
  dial.position.copy(altAt);
  dial.lookAt(0, 0.1, 0.3);
  dial.rotateX(Math.PI / 2);
  group.add(dial);
  let shown = -1;
  const setAlt = (m: number) => {
    const v = Math.max(0, Math.round(m / 10) * 10);
    if (v === shown) return;
    shown = v;
    const g = c.getContext('2d');
    if (!g) return;
    const A = (h: number) => -Math.PI / 2 + (h / 4000) * Math.PI * 2;
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#111827';
    g.beginPath();
    g.arc(64, 64, 63, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    for (const [a, b, col] of [
      [0, 1000, '#dc2626'],
      [1000, 1700, '#f59e0b'],
      [1700, 4000, '#e5e7eb'],
    ] as const) {
      g.strokeStyle = col;
      g.beginPath();
      g.arc(64, 64, 52, A(a), A(b));
      g.stroke();
    }
    g.strokeStyle = '#fbbf24';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64 + Math.cos(A(v)) * 46, 64 + Math.sin(A(v)) * 46);
    g.stroke();
    g.fillStyle = '#fff';
    g.font = 'bold 22px sans-serif';
    g.textAlign = 'center';
    g.fillText(String(v), 64, 96);
    face.needsUpdate = true;
  };
  setAlt(4000);
  return { group, spin: [], textures: [face], setAlt };
}
