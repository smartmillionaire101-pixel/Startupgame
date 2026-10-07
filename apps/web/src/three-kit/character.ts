/**
 * A low-poly 3D person (Wave 9): legs, body, arms, head and hair, coloured
 * from an avatar look (skin, hair and its style, top, bottom, accessory).
 * About 1.75 m tall, feet at y = 0, facing +z. `pose(walk, phase)` swings
 * the arms and legs. Shared geometries; materials cached by colour.
 *
 * Self-contained: only three.js and a plain look object.
 */
import * as THREE from 'three';

export interface CharacterLook {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'afro' | 'bun' | 'long' | 'braids' | 'buzz';
  top: string;
  bottom: string;
  accessory?: 'glasses' | 'tie' | 'cap' | 'lanyard' | 'scarf' | 'none';
  gender?: 'female' | 'male';
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
export function charMaterial(color: string, rough = 0.8) {
  const k = `${color}:${rough}`;
  let m = mats.get(k);
  if (!m) mats.set(k, (m = new THREE.MeshStandardMaterial({ color, roughness: rough })));
  return m;
}

let G: Record<string, THREE.BufferGeometry> | null = null;
function geoms() {
  if (G) return G;
  const box = (w: number, h: number, d: number, y: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, y, 0);
    return g;
  };
  G = {
    // Limbs hang from their pivots (hip, shoulder): drawn downwards.
    leg: box(0.16, 0.86, 0.18, -0.43),
    shoe: box(0.17, 0.08, 0.26, -0.88),
    torso: box(0.42, 0.62, 0.24, 0),
    skirt: new THREE.CylinderGeometry(0.2, 0.3, 0.42, 8).translate(0, -0.2, 0),
    arm: box(0.11, 0.6, 0.13, -0.3),
    hand: box(0.1, 0.1, 0.1, -0.64),
    neck: box(0.1, 0.08, 0.1, 0),
    head: new THREE.IcosahedronGeometry(0.135, 1),
    hairCap: new THREE.SphereGeometry(0.145, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    afro: new THREE.IcosahedronGeometry(0.2, 1),
    bun: new THREE.SphereGeometry(0.07, 8, 6),
    long: box(0.3, 0.32, 0.12, -0.12),
    cap: new THREE.CylinderGeometry(0.15, 0.15, 0.07, 10),
    brim: box(0.2, 0.02, 0.14, 0),
    glasses: box(0.24, 0.04, 0.02, 0),
    tie: box(0.06, 0.34, 0.02, -0.17),
    ring: new THREE.RingGeometry(0.42, 0.55, 28).rotateX(-Math.PI / 2),
  };
  return G;
}

export interface Character {
  root: THREE.Group;
  /** Swing the limbs: walk 0–1 (standing … striding), phase in radians. */
  pose: (walk: number, phase: number) => void;
  dispose: () => void;
}

export function makeCharacter(look: CharacterLook, opts: { ring?: string } = {}): Character {
  const g = geoms();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = charMaterial(look.skin, 0.7);
  const hair = charMaterial(look.hair, 0.9);
  const top = charMaterial(look.top, 0.85);
  const bottom = charMaterial(look.bottom, 0.85);
  const shoe = charMaterial('#26221f', 0.6);
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const hip = 0.92;
  const legs: THREE.Group[] = [];
  for (const sx of [-0.1, 0.1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, hip, 0);
    body.add(pivot);
    mesh(g.leg!, bottom, pivot);
    mesh(g.shoe!, shoe, pivot, 0, 0, 0.03);
    legs.push(pivot);
  }
  if (look.gender === 'female' && (look.hairStyle === 'long' || look.hairStyle === 'bun'))
    mesh(g.skirt!, bottom, body, 0, hip + 0.05, 0);
  mesh(g.torso!, top, body, 0, hip + 0.31, 0);
  const arms: THREE.Group[] = [];
  for (const sx of [-0.27, 0.27]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, hip + 0.58, 0);
    body.add(pivot);
    mesh(g.arm!, top, pivot);
    mesh(g.hand!, skin, pivot);
    arms.push(pivot);
  }
  mesh(g.neck!, skin, body, 0, hip + 0.66, 0);
  const headY = hip + 0.81;
  mesh(g.head!, skin, body, 0, headY, 0);
  switch (look.hairStyle) {
    case 'afro':
      mesh(g.afro!, hair, body, 0, headY + 0.05, -0.02);
      break;
    case 'bun':
      mesh(g.hairCap!, hair, body, 0, headY + 0.005, 0);
      mesh(g.bun!, hair, body, 0, headY + 0.13, -0.08);
      break;
    case 'long':
    case 'braids':
      mesh(g.hairCap!, hair, body, 0, headY + 0.005, 0);
      mesh(g.long!, hair, body, 0, headY, -0.07);
      break;
    case 'buzz':
      mesh(g.hairCap!, hair, body, 0, headY - 0.01, 0).scale.setScalar(0.97);
      break;
    default:
      mesh(g.hairCap!, hair, body, 0, headY + 0.01, 0);
  }
  if (look.accessory === 'cap') {
    mesh(g.cap!, charMaterial('#1f2937'), body, 0, headY + 0.1, 0);
    mesh(g.brim!, charMaterial('#1f2937'), body, 0, headY + 0.07, 0.12);
  } else if (look.accessory === 'glasses') {
    mesh(g.glasses!, charMaterial('#111827', 0.3), body, 0, headY + 0.01, 0.13);
  } else if (look.accessory === 'tie') {
    mesh(g.tie!, charMaterial('#7f1d1d'), body, 0, hip + 0.58, 0.125);
  }
  if (opts.ring) {
    const ring = new THREE.Mesh(
      g.ring!,
      new THREE.MeshBasicMaterial({ color: opts.ring, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    ring.position.y = 0.04;
    ring.renderOrder = 2;
    root.add(ring);
  }
  const pose = (walk: number, phase: number) => {
    const s = Math.sin(phase) * 0.6 * walk;
    legs[0]!.rotation.x = s;
    legs[1]!.rotation.x = -s;
    arms[0]!.rotation.x = -s * 0.8;
    arms[1]!.rotation.x = s * 0.8;
    body.position.y = Math.abs(Math.cos(phase)) * 0.04 * walk;
  };
  return {
    root,
    pose,
    dispose: () => {
      root.removeFromParent();
    },
  };
}
