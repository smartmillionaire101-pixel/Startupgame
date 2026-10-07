/**
 * Wave 9 §C: a low-poly 3D person with the player's look (skin, hair and
 * style, outfit colours, accessory) from `avatarLook`. Jointed (hips, knees,
 * shoulders, elbows, neck) so one function, `pose`, can put them in any
 * stance for a moment in time: walking, sitting, lying, dancing, eating…
 *
 * The root sits at the feet and faces +z; turn it with `root.rotation.y`.
 */
import * as THREE from 'three';
import type { AvatarLook } from '../city/art';
import { mat, contactShadow } from './kit';

export type PoseId =
  | 'stand'
  | 'idle'
  | 'walk'
  | 'run'
  | 'sit'
  | 'lie'
  | 'lieSide'
  | 'dance'
  | 'type'
  | 'eat'
  | 'drink'
  | 'cheer'
  | 'wave'
  | 'chat'
  | 'squat'
  | 'lift'
  | 'sing'
  | 'kick'
  | 'stir'
  | 'play'
  | 'read'
  | 'cut'
  | 'present'
  | 'clap'
  | 'browse';

const SKIN_GEO = new THREE.SphereGeometry(1, 14, 10);
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);

export interface Character {
  root: THREE.Group;
  /** Everything above the feet (lowered when sitting, turned when lying). */
  body: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  hair: THREE.Group;
  thighL: THREE.Group;
  thighR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  /** Attach props to a hand (a mic, a fork, clippers). */
  handL: THREE.Group;
  handR: THREE.Group;
  shadow: THREE.Mesh;
  look: AvatarLook;
  /** For picking: the id of who this is. */
  id: string;
}

const HIP_Y = 0.82;
const THIGH = 0.42;
const SHIN = 0.4;
const UPPER = 0.3;
const FORE = 0.28;

function limb(r: number, len: number, color: string) {
  const m = new THREE.Mesh(capsule(r, len), mat(color, { rough: 0.8 }));
  m.position.y = -len / 2;
  m.castShadow = true;
  return m;
}

function buildHair(look: AvatarLook): THREE.Group {
  const g = new THREE.Group();
  const hm = mat(look.hair, { rough: 0.9 });
  const add = (
    geo: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
  ) => {
    const m = new THREE.Mesh(geo, hm);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const cap = new THREE.SphereGeometry(0.152, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  switch (look.hairStyle) {
    case 'afro':
      add(new THREE.SphereGeometry(0.2, 12, 10), 0, 0.1, -0.07, 1, 0.9, 1);
      break;
    case 'bun':
      add(cap, 0, 0.005, 0, 1.02, 1.02, 1.05);
      add(new THREE.SphereGeometry(0.075, 10, 8), 0, 0.16, -0.08);
      break;
    case 'long':
      add(cap, 0, 0.005, 0, 1.04, 1.05, 1.06);
      add(new THREE.BoxGeometry(0.3, 0.34, 0.12), 0, -0.14, -0.08);
      break;
    case 'braids':
      add(cap, 0, 0.005, 0, 1.03, 1.03, 1.05);
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * 0.6 + (i / 5) * Math.PI * 0.8;
        add(
          new THREE.CylinderGeometry(0.018, 0.014, 0.34, 6),
          Math.cos(a) * 0.13,
          -0.16,
          Math.sin(a) * 0.13 - 0.02,
        );
      }
      break;
    case 'buzz':
      add(cap, 0, 0.002, 0, 1.0, 0.95, 1.0);
      break;
    default:
      // short
      add(cap, 0, 0.012, -0.005, 1.04, 1.08, 1.06);
      add(new THREE.BoxGeometry(0.22, 0.05, 0.08), 0, 0.1, 0.1);
  }
  g.userData.style = look.hairStyle;
  return g;
}

/** A person with this look. */
export function makeCharacter(look: AvatarLook, id = ''): Character {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const female = look.gender === 'female';
  const skin = mat(look.skin, { rough: 0.7 });
  const top = look.top;
  const bottom = look.bottom;
  const shoe = mat('#1f2937', { rough: 0.6 });

  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  body.add(hips);
  const pelvis = new THREE.Mesh(
    new THREE.BoxGeometry(female ? 0.3 : 0.28, 0.16, 0.18),
    mat(bottom),
  );
  pelvis.position.y = 0.0;
  pelvis.castShadow = true;
  hips.add(pelvis);

  const leg = (side: number) => {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.085, -0.02, 0);
    hips.add(thigh);
    thigh.add(limb(0.068, THIGH - 0.1, bottom));
    const shin = new THREE.Group();
    shin.position.y = -THIGH;
    thigh.add(shin);
    shin.add(limb(0.058, SHIN - 0.1, bottom));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.2), shoe);
    foot.position.set(0, -SHIN + 0.0, 0.04);
    foot.castShadow = true;
    shin.add(foot);
    return { thigh, shin };
  };
  const L = leg(1);
  const R = leg(-1);

  const torso = new THREE.Group();
  torso.position.y = 0.06;
  hips.add(torso);
  const chest = new THREE.Mesh(capsule(female ? 0.14 : 0.155, 0.26), mat(top, { rough: 0.85 }));
  chest.scale.set(1.05, 1, 0.72);
  chest.position.y = 0.24;
  chest.castShadow = true;
  torso.add(chest);

  const arm = (side: number) => {
    const a = new THREE.Group();
    a.position.set(side * (female ? 0.2 : 0.215), 0.47, 0);
    torso.add(a);
    a.add(limb(0.052, UPPER - 0.06, top));
    const fore = new THREE.Group();
    fore.position.y = -UPPER;
    a.add(fore);
    const f = new THREE.Mesh(capsule(0.044, FORE - 0.08), skin);
    f.position.y = -FORE / 2;
    f.castShadow = true;
    fore.add(f);
    const hand = new THREE.Group();
    hand.position.y = -FORE - 0.02;
    fore.add(hand);
    const h = new THREE.Mesh(SKIN_GEO, skin);
    h.scale.setScalar(0.05);
    hand.add(h);
    a.rotation.z = side * 0.08;
    return { a, fore, hand };
  };
  const AL = arm(1);
  const AR = arm(-1);

  const head = new THREE.Group();
  head.position.y = 0.52;
  torso.add(head);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), skin);
  neck.position.y = 0.03;
  head.add(neck);
  const skull = new THREE.Mesh(SKIN_GEO, skin);
  skull.scale.set(0.14, 0.155, 0.145);
  skull.position.y = 0.2;
  skull.castShadow = true;
  head.add(skull);
  const eye = mat('#111111', { rough: 0.3 });
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(SKIN_GEO, eye);
    e.scale.setScalar(0.016);
    e.position.set(sx * 0.05, 0.215, 0.132);
    head.add(e);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.01), mat('#7f1d1d'));
  mouth.position.set(0, 0.15, 0.138);
  head.add(mouth);
  const hair = buildHair(look);
  hair.position.y = 0.2;
  head.add(hair);

  // Accessories.
  switch (look.accessory) {
    case 'glasses': {
      const gm = mat('#111827', { rough: 0.3 });
      for (const sx of [-1, 1]) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 5, 12), gm);
        r.position.set(sx * 0.052, 0.215, 0.14);
        head.add(r);
      }
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), gm);
      b.position.set(0, 0.22, 0.145);
      head.add(b);
      break;
    }
    case 'cap': {
      const cm = mat(top, { rough: 0.7 });
      const c = new THREE.Mesh(
        new THREE.SphereGeometry(0.158, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        cm,
      );
      c.position.y = 0.23;
      head.add(c);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.14), cm);
      brim.position.set(0, 0.24, 0.17);
      head.add(brim);
      hair.visible = look.hairStyle === 'long' || look.hairStyle === 'braids';
      break;
    }
    case 'tie': {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.24, 0.02), mat('#991b1b'));
      t.position.set(0, 0.3, 0.115);
      torso.add(t);
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.03), mat('#f8fafc'));
      collar.position.set(0, 0.43, 0.1);
      torso.add(collar);
      break;
    }
    case 'scarf': {
      const s = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.035, 6, 14), mat('#e11d48'));
      s.rotation.x = Math.PI / 2;
      s.position.y = 0.47;
      torso.add(s);
      break;
    }
    case 'lanyard': {
      const l = new THREE.Mesh(
        new THREE.TorusGeometry(0.12, 0.006, 4, 16, Math.PI),
        mat('#2563eb'),
      );
      l.rotation.z = Math.PI;
      l.position.set(0, 0.44, 0.105);
      torso.add(l);
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.01), mat('#f8fafc'));
      card.position.set(0, 0.28, 0.12);
      torso.add(card);
      break;
    }
  }

  const shadow = contactShadow(0.6, 0.6, 0.5);
  root.add(shadow);

  const c: Character = {
    root,
    body,
    hips,
    torso,
    head,
    hair,
    thighL: L.thigh,
    thighR: R.thigh,
    shinL: L.shin,
    shinR: R.shin,
    armL: AL.a,
    armR: AR.a,
    foreL: AL.fore,
    foreR: AR.fore,
    handL: AL.hand,
    handR: AR.hand,
    shadow,
    look,
    id,
  };
  root.userData.character = id;
  root.traverse((o) => (o.userData.character = id));
  return c;
}

/** Swap a person's hair (a haircut). */
export function setHair(c: Character, look: AvatarLook) {
  const parent = c.hair.parent!;
  const pos = c.hair.position.clone();
  const vis = c.hair.visible;
  parent.remove(c.hair);
  c.hair = buildHair(look);
  c.hair.position.copy(pos);
  c.hair.visible = vis;
  c.hair.traverse((o) => (o.userData.character = c.id));
  parent.add(c.hair);
  c.look = { ...c.look, ...look };
}

const S = Math.sin;

/**
 * Put a person in a pose at time `t` (seconds). `seat` is the height of
 * what they sit on (sitting), or of the bed (lying). `phase` desyncs crowds.
 */
export function pose(
  c: Character,
  p: PoseId,
  t: number,
  o: { seat?: number; phase?: number } = {},
) {
  const ph = (o.phase ?? 0) * 1.7;
  const tt = t + ph;
  // Reset.
  c.body.position.set(0, 0, 0);
  c.body.rotation.set(0, 0, 0);
  c.hips.rotation.set(0, 0, 0);
  c.torso.rotation.set(0, 0, 0);
  c.head.rotation.set(0, 0, 0);
  c.thighL.rotation.set(0, 0, 0);
  c.thighR.rotation.set(0, 0, 0);
  c.shinL.rotation.set(0, 0, 0);
  c.shinR.rotation.set(0, 0, 0);
  c.armL.rotation.set(0, 0, 0.08);
  c.armR.rotation.set(0, 0, -0.08);
  c.foreL.rotation.set(0, 0, 0);
  c.foreR.rotation.set(0, 0, 0);
  c.shadow.visible = true;
  c.shadow.position.set(0, 0.012, 0);
  const breathe = S(tt * 2) * 0.012;
  const seated = (h: number) => {
    c.body.position.y = h - HIP_Y + 0.04;
    c.thighL.rotation.x = c.thighR.rotation.x = -Math.PI / 2 + 0.08;
    c.shinL.rotation.x = c.shinR.rotation.x = Math.PI / 2 - 0.08;
    c.shadow.visible = false;
  };
  switch (p) {
    case 'walk':
    case 'run': {
      const sp = p === 'run' ? 11 : 7.5;
      const amp = p === 'run' ? 0.75 : 0.5;
      const s = S(tt * sp);
      c.thighL.rotation.x = s * amp;
      c.thighR.rotation.x = -s * amp;
      c.shinL.rotation.x = Math.max(0, -s) * amp * 1.2;
      c.shinR.rotation.x = Math.max(0, s) * amp * 1.2;
      c.armL.rotation.x = -s * amp * 0.8;
      c.armR.rotation.x = s * amp * 0.8;
      c.foreL.rotation.x = c.foreR.rotation.x = p === 'run' ? -1.2 : -0.3;
      c.body.position.y = Math.abs(S(tt * sp)) * (p === 'run' ? 0.06 : 0.03);
      c.torso.rotation.x = p === 'run' ? 0.15 : 0.03;
      break;
    }
    case 'sit':
      seated(o.seat ?? 0.45);
      c.armL.rotation.x = c.armR.rotation.x = -0.35;
      c.foreL.rotation.x = c.foreR.rotation.x = -0.6;
      c.torso.rotation.x = -0.04 + breathe;
      break;
    case 'type':
    case 'eat':
    case 'drink':
    case 'read':
    case 'play': {
      seated(o.seat ?? 0.45);
      c.armL.rotation.x = c.armR.rotation.x = -0.6;
      c.foreL.rotation.x = c.foreR.rotation.x = -0.9;
      if (p === 'type') {
        c.foreL.rotation.x += S(tt * 18) * 0.08;
        c.foreR.rotation.x += S(tt * 18 + 1) * 0.08;
        c.head.rotation.x = 0.12;
      } else if (p === 'eat') {
        const u = (S(tt * 2.6) + 1) / 2;
        c.armR.rotation.x = -0.6 - u * 0.6;
        c.foreR.rotation.x = -0.9 - u * 1.1;
        c.head.rotation.x = 0.1 - u * 0.1;
      } else if (p === 'drink') {
        const u = Math.max(0, S(tt * 1.4));
        c.armR.rotation.x = -0.6 - u * 0.7;
        c.foreR.rotation.x = -1.2 - u * 0.8;
        c.head.rotation.x = -u * 0.25;
      } else if (p === 'read') {
        c.head.rotation.x = 0.3;
      } else {
        c.foreL.rotation.x += S(tt * 14) * 0.08;
        c.foreR.rotation.x += S(tt * 11) * 0.08;
        c.torso.rotation.z = S(tt * 2) * 0.05;
      }
      break;
    }
    case 'lie':
    case 'lieSide': {
      // On their back, head towards -z, at the bed's height.
      // The body turns about the feet: the hips end up at the root, the head at -z.
      c.body.position.y = (o.seat ?? 0.5) + 0.1;
      c.body.position.z = HIP_Y;
      c.body.rotation.x = -Math.PI / 2;
      c.armL.rotation.z = 0.15;
      c.armR.rotation.z = -0.15;
      c.torso.rotation.x = breathe;
      if (p === 'lieSide') c.body.rotation.z = 0.5;
      c.shadow.visible = false;
      break;
    }
    case 'dance': {
      const b = S(tt * 8);
      c.body.position.y = Math.abs(b) * 0.08;
      c.hips.rotation.y = S(tt * 4) * 0.35;
      c.torso.rotation.z = S(tt * 4) * 0.12;
      c.armL.rotation.z = 2.4 + S(tt * 8) * 0.4;
      c.armR.rotation.z = -2.4 - S(tt * 8 + 1) * 0.4;
      c.foreL.rotation.z = 0.4;
      c.foreR.rotation.z = -0.4;
      c.thighL.rotation.x = Math.max(0, b) * -0.4;
      c.thighR.rotation.x = Math.max(0, -b) * -0.4;
      c.shinL.rotation.x = Math.max(0, b) * 0.6;
      c.shinR.rotation.x = Math.max(0, -b) * 0.6;
      c.head.rotation.x = S(tt * 8) * 0.12;
      break;
    }
    case 'cheer':
      c.armL.rotation.z = 2.7;
      c.armR.rotation.z = -2.7;
      c.body.position.y = Math.abs(S(tt * 6)) * 0.06;
      break;
    case 'clap': {
      const u = (S(tt * 14) + 1) / 2;
      c.armL.rotation.x = c.armR.rotation.x = -1.0;
      c.armL.rotation.z = 0.3 + u * 0.25;
      c.armR.rotation.z = -0.3 - u * 0.25;
      c.foreL.rotation.x = c.foreR.rotation.x = -0.7;
      break;
    }
    case 'wave':
      c.armR.rotation.z = -2.5;
      c.foreR.rotation.z = S(tt * 9) * 0.5;
      break;
    case 'chat':
    case 'present':
      c.armR.rotation.x = -0.6 - S(tt * 3) * 0.3;
      c.foreR.rotation.x = -0.8;
      c.armL.rotation.x = p === 'present' ? -0.2 : -0.3 + S(tt * 2.3) * 0.2;
      c.foreL.rotation.x = p === 'present' ? -0.2 : -0.6;
      c.head.rotation.y = S(tt * 0.9) * 0.25;
      c.torso.rotation.y = S(tt * 0.7) * 0.08;
      break;
    case 'browse':
      c.head.rotation.y = S(tt * 0.6) * 0.5;
      c.head.rotation.x = 0.15;
      c.armL.rotation.x = c.armR.rotation.x = 0.1;
      break;
    case 'squat': {
      const u = (S(tt * 3) + 1) / 2;
      c.body.position.y = -u * 0.32;
      c.thighL.rotation.x = c.thighR.rotation.x = -u * 1.3;
      c.shinL.rotation.x = c.shinR.rotation.x = u * 1.5;
      c.torso.rotation.x = u * 0.35;
      c.armL.rotation.x = c.armR.rotation.x = -u * 1.4;
      break;
    }
    case 'lift': {
      const u = (S(tt * 3) + 1) / 2;
      c.armL.rotation.x = c.armR.rotation.x = -0.3;
      c.foreL.rotation.x = c.foreR.rotation.x = -0.4 - u * 1.9;
      c.body.position.y = breathe;
      break;
    }
    case 'sing':
      c.armR.rotation.x = -1.0;
      c.foreR.rotation.x = -1.5;
      c.armR.rotation.z = -0.3;
      c.armL.rotation.z = 0.9 + S(tt * 3) * 0.6;
      c.head.rotation.x = -0.15 + S(tt * 4) * 0.08;
      c.body.position.y = Math.abs(S(tt * 4)) * 0.03;
      c.hips.rotation.y = S(tt * 2) * 0.15;
      break;
    case 'kick': {
      const s = S(tt * 6);
      c.thighR.rotation.x = -Math.max(0, s) * 1.2 + 0.2;
      c.shinR.rotation.x = Math.max(0, -s) * 0.8;
      c.armL.rotation.x = s * 0.5;
      c.armR.rotation.z = -0.5;
      break;
    }
    case 'stir': {
      c.armR.rotation.x = -0.9;
      c.foreR.rotation.x = -0.6;
      c.foreR.rotation.y = S(tt * 6) * 0.5;
      c.armL.rotation.x = -0.6;
      c.foreL.rotation.x = -0.6;
      c.head.rotation.x = 0.3;
      break;
    }
    case 'cut': {
      c.armR.rotation.x = -1.3 + S(tt * 5) * 0.2;
      c.foreR.rotation.x = -0.6;
      c.armL.rotation.x = -1.1;
      c.foreL.rotation.x = -0.9 + S(tt * 9) * 0.15;
      c.head.rotation.x = 0.2;
      c.torso.rotation.x = 0.12;
      break;
    }
    case 'idle':
    case 'stand':
    default:
      c.torso.rotation.x = breathe;
      c.head.rotation.y = p === 'idle' ? S(tt * 0.5) * 0.2 : 0;
      c.armL.rotation.x = S(tt * 1.1) * 0.03;
      c.armR.rotation.x = -S(tt * 1.1) * 0.03;
  }
}

/** Every person's meshes, for picking. */
export const characterMeshes = (cs: Iterable<Character>) => {
  const out: THREE.Object3D[] = [];
  for (const c of cs)
    c.root.traverse((o) => (o as THREE.Mesh).isMesh && o !== c.shadow && out.push(o));
  return out;
};
