/**
 * A low-poly 3D person (Wave 9): legs, body, arms, head and hair, coloured
 * from an avatar look (skin, hair and its style, top, bottom, accessory).
 * About 1.75 m tall, feet at y = 0, facing +z. `pose(walk, phase)` swings
 * the arms and legs. Shared geometries; materials cached by colour.
 * Phase 6a adds the creator's parts: ten hairstyles, facial hair, glasses,
 * headwear (a cap, beanie, headwrap or gele) and long tops (kaftan, dress).
 *
 * Self-contained: only three.js and a plain look object.
 */
import * as THREE from 'three';
import { facialHairColour } from '../avatar/tone';
import { BAG_COLOUR, necklaceColour, shoeColour, type Worn } from '../avatar/worn';

export interface CharacterLook extends Worn {
  skin: string;
  hair: string;
  hairStyle:
    'short' | 'afro' | 'bun' | 'long' | 'braids' | 'buzz' | 'bald' | 'locs' | 'twists' | 'curly';
  top: string;
  bottom: string;
  accessory?: 'glasses' | 'tie' | 'cap' | 'lanyard' | 'scarf' | 'none';
  gender?: 'female' | 'male';
  /** Phase 6a (the character creator); missing = as before. */
  facialHair?: 'none' | 'stubble' | 'moustache' | 'goatee' | 'beard';
  glasses?: 'none' | 'round' | 'square' | 'shades';
  headwear?: 'none' | 'cap' | 'beanie' | 'headwrap' | 'gele';
  topStyle?: 'tee' | 'shirt' | 'blazer' | 'hoodie' | 'kaftan' | 'dress';
  /** Trousers, never a skirt (golf clothes). */
  trousers?: boolean;
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
    // From the wardrobe: a bag at the hip, a chain at the neck.
    bag: box(0.08, 0.2, 0.22, 0),
    necklace: new THREE.TorusGeometry(0.08, 0.012, 4, 14).rotateX(Math.PI / 2 - 0.45),
    tie: box(0.06, 0.34, 0.02, -0.17),
    ring: new THREE.RingGeometry(0.42, 0.55, 28).rotateX(-Math.PI / 2),
    // Phase 6a: the creator's styles and parts, one geometry each for the whole crowd.
    curl: new THREE.IcosahedronGeometry(0.06, 0),
    twist: new THREE.CylinderGeometry(0.024, 0.02, 0.11, 5).translate(0, 0.055, 0),
    loc: new THREE.CylinderGeometry(0.022, 0.018, 0.36, 5).translate(0, -0.18, 0),
    beard: box(0.22, 0.1, 0.07, 0),
    goatee: box(0.08, 0.07, 0.05, 0),
    moustache: box(0.1, 0.025, 0.03, 0),
    shades: box(0.25, 0.055, 0.025, 0),
    wrap: new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6),
    knot: new THREE.SphereGeometry(0.06, 8, 5),
    gele: new THREE.SphereGeometry(1, 10, 6).scale(0.3, 0.12, 0.2),
    kaftan: new THREE.CylinderGeometry(0.22, 0.26, 0.42, 8).translate(0, -0.2, 0),
    // A man's kaftan: a straight tunic to mid-thigh, trousers below.
    tunic: new THREE.CylinderGeometry(0.22, 0.23, 0.24, 8).translate(0, -0.1, 0),
    dress: new THREE.CylinderGeometry(0.2, 0.33, 0.52, 8).translate(0, -0.25, 0),
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
  const shoe = charMaterial(
    look.shoes && look.shoes !== 'none' ? shoeColour(look.shoes) : '#26221f',
    0.6,
  );
  const mesh = (
    geo: THREE.BufferGeometry,
    m: THREE.Material,
    parent: THREE.Object3D,
    x = 0,
    y = 0,
    z = 0,
  ) => {
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
  const topStyle = look.topStyle ?? 'tee';
  if (topStyle === 'kaftan')
    mesh(look.gender === 'female' ? g.kaftan! : g.tunic!, top, body, 0, hip + 0.05, 0);
  else if (topStyle === 'dress') mesh(g.dress!, top, body, 0, hip + 0.08, 0);
  else if (
    !look.trousers &&
    look.gender === 'female' &&
    (look.hairStyle === 'long' || look.hairStyle === 'bun')
  )
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
  if (look.necklace && look.necklace !== 'none')
    mesh(g.necklace!, charMaterial(necklaceColour(look.necklace), 0.25), body, 0, hip + 0.6, 0.03);
  if (look.bag && look.bag !== 'none')
    mesh(g.bag!, charMaterial(BAG_COLOUR[look.bag]!, 0.6), body, -0.34, hip + 0.02, 0);
  const headY = hip + 0.81;
  mesh(g.head!, skin, body, 0, headY, 0);
  const headwear = look.headwear ?? (look.accessory === 'cap' ? 'cap' : 'none');
  // A headwrap or gele covers the hair; a cap or beanie leaves only what hangs below.
  const covered = headwear === 'headwrap' || headwear === 'gele';
  const hatted = headwear === 'cap' || headwear === 'beanie';
  if (!covered)
    switch (look.hairStyle) {
      case 'afro':
        if (!hatted) mesh(g.afro!, hair, body, 0, headY + 0.05, -0.02);
        break;
      case 'bun':
        mesh(g.hairCap!, hair, body, 0, headY + 0.005, 0);
        if (!hatted) mesh(g.bun!, hair, body, 0, headY + 0.13, -0.08);
        break;
      case 'long':
      case 'braids':
        mesh(g.hairCap!, hair, body, 0, headY + 0.005, 0);
        mesh(g.long!, hair, body, 0, headY, -0.07);
        break;
      case 'locs':
        mesh(g.hairCap!, hair, body, 0, headY + 0.005, 0);
        for (let i = 0; i < 7; i++) {
          const a = Math.PI * 0.55 + (i / 6) * Math.PI * 0.9;
          mesh(g.loc!, hair, body, Math.cos(a) * 0.13, headY + 0.03, Math.sin(a) * -0.13);
        }
        break;
      case 'twists':
        mesh(g.hairCap!, hair, body, 0, headY + 0.005, 0);
        if (!hatted)
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const t = mesh(
              g.twist!,
              hair,
              body,
              Math.cos(a) * 0.07,
              headY + 0.1,
              Math.sin(a) * 0.07,
            );
            t.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
          }
        break;
      case 'curly':
        mesh(g.hairCap!, hair, body, 0, headY + 0.01, 0);
        if (!hatted)
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            mesh(g.curl!, hair, body, Math.cos(a) * 0.09, headY + 0.1, Math.sin(a) * 0.09 - 0.01);
          }
        break;
      case 'bald':
        break;
      case 'buzz':
        mesh(g.hairCap!, hair, body, 0, headY - 0.01, 0).scale.setScalar(0.97);
        break;
      default:
        mesh(g.hairCap!, hair, body, 0, headY + 0.01, 0);
    }
  const facial = look.facialHair ?? 'none';
  // Darker than the skin whatever the hair colour (../avatar/tone.ts).
  const fh = facial === 'none' ? hair : charMaterial(facialHairColour(look.skin, look.hair), 0.9);
  if (facial === 'beard') mesh(g.beard!, fh, body, 0, headY - 0.08, 0.08);
  if (facial === 'goatee') mesh(g.goatee!, fh, body, 0, headY - 0.1, 0.11);
  if (facial === 'moustache' || facial === 'goatee' || facial === 'beard')
    mesh(g.moustache!, fh, body, 0, headY - 0.045, 0.125);
  const glasses = look.glasses ?? (look.accessory === 'glasses' ? 'round' : 'none');
  if (glasses === 'shades')
    mesh(g.shades!, charMaterial('#0b1120', 0.2), body, 0, headY + 0.01, 0.13);
  else if (glasses !== 'none')
    mesh(g.glasses!, charMaterial('#111827', 0.3), body, 0, headY + 0.01, 0.13);
  const wear = charMaterial(look.headwear ? look.top : '#1f2937', 0.8);
  if (headwear === 'cap') {
    mesh(g.cap!, wear, body, 0, headY + 0.1, 0);
    mesh(g.brim!, wear, body, 0, headY + 0.07, 0.12);
  } else if (headwear === 'beanie') {
    mesh(g.hairCap!, wear, body, 0, headY + 0.03, 0).scale.setScalar(1.08);
  } else if (headwear === 'headwrap') {
    mesh(g.wrap!, wear, body, 0, headY - 0.01, -0.01);
    mesh(g.knot!, wear, body, 0.04, headY + 0.15, 0.04);
  } else if (headwear === 'gele') {
    mesh(g.wrap!, wear, body, 0, headY - 0.01, -0.01);
    mesh(g.gele!, wear, body, 0, headY + 0.17, -0.02).rotation.x = -0.25;
  }
  if (look.accessory === 'tie') {
    mesh(g.tie!, charMaterial('#7f1d1d'), body, 0, hip + 0.58, 0.125);
  }
  if (opts.ring) {
    const ring = new THREE.Mesh(
      g.ring!,
      new THREE.MeshBasicMaterial({
        color: opts.ring,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: false,
      }),
    );
    // Seen through buildings, so you never lose yourself.
    ring.position.y = 0.04;
    ring.renderOrder = 10;
    ring.name = 'ring';
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
