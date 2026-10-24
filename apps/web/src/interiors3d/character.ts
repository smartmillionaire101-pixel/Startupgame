/**
 * Wave 9 §C: a low-poly 3D person with the player's look (skin, hair and
 * style, outfit colours, accessory) from `avatarLook`. Jointed (hips, knees,
 * shoulders, elbows, neck) so one function, `pose`, can put them in any
 * stance for a moment in time: walking, sitting, lying, dancing, eating…
 *
 * Clothes are layered garments (the feedback round: "a banker should be in a
 * suit"), not only a tint: a suit's jacket with lapels over a shirt's V and a
 * tie, its skirt below the waist and sleeves to the wrist with shirt cuffs; a
 * blazer open over a tee; a hoodie's hood, drawstrings, pocket and ribbed hem;
 * a shirt's collar and placket; a blouse's soft neck; proper shoes (Oxfords,
 * loafers, courts, trainers with their soles) and a briefcase or a folio.
 *
 * The root sits at the feet and faces +z; turn it with `root.rotation.y`.
 */
import * as THREE from 'three';
import { shade, type AvatarLook } from '../city/art';
import { mat, contactShadow } from './kit';
import { facialHairColour } from '../avatar/tone';
import {
  BAG_COLOUR,
  BEADS,
  BELT_COLOUR,
  BLOUSE_IVORY,
  SCARF_COLOUR,
  SHIRT_WHITE,
  SILVER,
  TIE_COLOUR,
  WATCH_COLOUR,
  necklaceColour,
  shoeColour,
} from '../avatar/worn';

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

/**
 * Geometries for hair and the creator's parts, made once and shared by
 * everyone who wears them (a room full of people builds no new ones).
 */
const GEO = new Map<string, THREE.BufferGeometry>();
const geo = (key: string, make: () => THREE.BufferGeometry) => {
  let g = GEO.get(key);
  if (!g) GEO.set(key, (g = make()));
  return g;
};
const CAP = () =>
  geo('cap', () => new THREE.SphereGeometry(0.152, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55));

/**
 * Hair by style, plus what sits on it (Phase 6a: facial hair and headwear),
 * in one group centred on the skull so `setHair` swaps them together.
 */
function buildHair(look: AvatarLook): THREE.Group {
  const g = new THREE.Group();
  const hm = mat(look.hair, { rough: 0.9 });
  const add = (
    geom: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    m: THREE.Material = hm,
  ) => {
    const o = new THREE.Mesh(geom, m);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  const headwear = look.headwear ?? 'none';
  // A headwrap or gele covers the hair; a beanie leaves only what hangs below it.
  const covered = headwear === 'headwrap' || headwear === 'gele';
  const hatted = headwear === 'beanie';
  const strand = (len: number) =>
    geo(`strand:${len}`, () => new THREE.CylinderGeometry(0.018, 0.014, len, 6));
  if (!covered)
    switch (look.hairStyle) {
      case 'afro':
        if (!hatted)
          add(
            geo('afro', () => new THREE.SphereGeometry(0.2, 12, 10)),
            0,
            0.1,
            -0.07,
            1,
            0.9,
            1,
          );
        break;
      case 'bun':
        add(CAP(), 0, 0.005, 0, 1.02, 1.02, 1.05);
        if (!hatted)
          add(
            geo('bun', () => new THREE.SphereGeometry(0.075, 10, 8)),
            0,
            0.16,
            -0.08,
          );
        break;
      case 'long':
        add(CAP(), 0, 0.005, 0, 1.04, 1.05, 1.06);
        add(
          geo('long', () => new THREE.BoxGeometry(0.3, 0.34, 0.12)),
          0,
          -0.14,
          -0.08,
        );
        break;
      case 'braids':
      case 'locs': {
        add(CAP(), 0, 0.005, 0, 1.03, 1.03, 1.05);
        const n = look.hairStyle === 'locs' ? 9 : 6;
        const len = look.hairStyle === 'locs' ? 0.4 : 0.34;
        for (let i = 0; i < n; i++) {
          const a = Math.PI * 0.6 + (i / (n - 1)) * Math.PI * 0.8;
          add(strand(len), Math.cos(a) * 0.13, -0.08 - len / 4, Math.sin(a) * 0.13 - 0.02);
        }
        break;
      }
      case 'twists':
        add(CAP(), 0, 0.005, 0, 1.03, 1.03, 1.05);
        if (!hatted)
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const t = add(strand(0.12), Math.cos(a) * 0.08, 0.15, Math.sin(a) * 0.08 - 0.02);
            t.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
          }
        break;
      case 'curly':
        add(CAP(), 0, 0.01, -0.005, 1.04, 1.06, 1.06);
        if (!hatted)
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            add(
              geo('curl', () => new THREE.IcosahedronGeometry(0.055, 0)),
              Math.cos(a) * 0.11,
              0.11 + (i % 2) * 0.02,
              Math.sin(a) * 0.11 - 0.02,
            );
          }
        break;
      case 'bald':
        break;
      case 'buzz':
        add(CAP(), 0, 0.002, 0, 1.0, 0.95, 1.0);
        break;
      default:
        // short
        add(CAP(), 0, 0.012, -0.005, 1.04, 1.08, 1.06);
        add(
          geo('fringe', () => new THREE.BoxGeometry(0.22, 0.05, 0.08)),
          0,
          0.1,
          0.1,
        );
    }
  // Facial hair, darker than the skin whatever the hair colour (../avatar/tone.ts).
  const facial = look.facialHair ?? 'none';
  const fc = facialHairColour(look.skin, look.hair);
  const fm = mat(fc, { rough: 0.9 });
  if (facial === 'beard')
    add(
      geo(
        'beard',
        () => new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55),
      ),
      0,
      -0.02,
      0.01,
      0.145,
      0.15,
      0.15,
      fm,
    );
  if (facial === 'stubble')
    add(
      geo(
        'beard',
        () => new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55),
      ),
      0,
      -0.02,
      0.005,
      0.142,
      0.15,
      0.146,
      mat(fc, { rough: 0.9, opacity: 0.4 }),
    );
  if (facial === 'goatee')
    add(
      geo('goatee', () => new THREE.BoxGeometry(0.06, 0.06, 0.03)),
      0,
      -0.11,
      0.12,
      1,
      1,
      1,
      fm,
    );
  if (facial === 'moustache' || facial === 'goatee' || facial === 'beard')
    add(
      geo('moustache', () => new THREE.BoxGeometry(0.08, 0.018, 0.02)),
      0,
      -0.035,
      0.14,
      1,
      1,
      1,
      fm,
    );
  // Headwear, in the top's colour (a matching gele and buba).
  const wm = mat(look.top, { rough: 0.8 });
  if (headwear === 'beanie') {
    add(CAP(), 0, 0.03, 0, 1.1, 1.05, 1.1, wm);
  } else if (headwear === 'headwrap' || headwear === 'gele') {
    add(CAP(), 0, 0.01, -0.005, 1.1, 1.18, 1.12, wm);
    if (headwear === 'gele') {
      const fan = add(
        geo('gele', () => new THREE.SphereGeometry(1, 14, 8)),
        0,
        0.17,
        -0.02,
        0.3,
        0.11,
        0.2,
        wm,
      );
      fan.rotation.x = -0.25;
      add(
        geo('gele-top', () => new THREE.ConeGeometry(0.1, 0.12, 8)),
        0,
        0.25,
        -0.03,
        1,
        1,
        0.6,
        wm,
      );
    } else
      add(
        geo('knot', () => new THREE.SphereGeometry(0.055, 8, 6)),
        0.05,
        0.16,
        0.05,
        1,
        1,
        1,
        wm,
      );
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
  // Shoes from the wardrobe in their colour (plain dark ones otherwise).
  const shoe = mat(look.shoes && look.shoes !== 'none' ? shoeColour(look.shoes) : '#1f2937', {
    rough: 0.6,
  });

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
    shoeShape(foot, look.shoes, shoe);
    if (look.shoes === 'boots') {
      const b = new THREE.Mesh(
        geo('boot', () => new THREE.CylinderGeometry(0.066, 0.07, 0.16, 8)),
        shoe,
      );
      b.position.y = -SHIN + 0.1;
      shin.add(b);
    } else if (look.shoes === 'heels' || look.shoes === 'courts') {
      const h = new THREE.Mesh(
        geo('heel', () => new THREE.BoxGeometry(0.025, 0.07, 0.025)),
        shoe,
      );
      h.position.set(0, -SHIN - 0.05, -0.04);
      shin.add(h);
    }
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
    // A watch on the left wrist, a bracelet on the right (from the wardrobe).
    const band =
      side === 1 && look.watch && look.watch !== 'none'
        ? WATCH_COLOUR[look.watch]
        : side === -1 && look.bracelet === 'beaded'
          ? BEADS
          : null;
    if (band) {
      const w = new THREE.Mesh(
        geo('band', () => new THREE.CylinderGeometry(0.05, 0.05, 0.035, 10)),
        mat(band, { rough: 0.35 }),
      );
      w.position.y = -FORE + 0.05;
      fore.add(w);
    }
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

  // Glasses (Phase 6a: round, square or shades; older looks: the outfit's).
  const glasses = look.glasses ?? (look.accessory === 'glasses' ? 'round' : 'none');
  if (glasses !== 'none') {
    const gm = mat(glasses === 'shades' ? '#0b1120' : '#111827', { rough: 0.3 });
    for (const sx of [-1, 1]) {
      const r =
        glasses === 'round'
          ? new THREE.Mesh(
              geo('lens-round', () => new THREE.TorusGeometry(0.035, 0.007, 5, 12)),
              gm,
            )
          : new THREE.Mesh(
              glasses === 'shades'
                ? geo('lens-shade', () => new THREE.BoxGeometry(0.07, 0.04, 0.01))
                : geo('lens-square', () => new THREE.BoxGeometry(0.07, 0.045, 0.008)),
              glasses === 'shades' ? gm : mat('#e2e8f0', { rough: 0.2, opacity: 0.35 }),
            );
      r.position.set(sx * 0.052, 0.215, 0.14);
      head.add(r);
    }
    const b = new THREE.Mesh(
      geo('bridge', () => new THREE.BoxGeometry(0.03, 0.006, 0.006)),
      gm,
    );
    b.position.set(0, 0.22, 0.145);
    head.add(b);
  }
  // A cap (Phase 6a headwear, or an outfit's).
  if (look.headwear === 'cap' || (!look.headwear && look.accessory === 'cap')) {
    const cm = mat(top, { rough: 0.7 });
    const c = new THREE.Mesh(
      geo('capdome', () => new THREE.SphereGeometry(0.158, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
      cm,
    );
    c.position.y = 0.23;
    head.add(c);
    const brim = new THREE.Mesh(
      geo('brim', () => new THREE.BoxGeometry(0.2, 0.015, 0.14)),
      cm,
    );
    brim.position.set(0, 0.24, 0.17);
    head.add(brim);
    hair.visible =
      look.hairStyle === 'long' || look.hairStyle === 'braids' || look.hairStyle === 'locs';
  }
  // Long tops: a kaftan to the knee, a dress that flares. A man's kaftan is a
  // straight tunic to mid-thigh over his trousers, so it never reads as a dress.
  if (look.topStyle === 'kaftan' || look.topStyle === 'dress') {
    const dress = look.topStyle === 'dress';
    const tunic = !dress && !female;
    const skirt = new THREE.Mesh(
      dress
        ? geo('dress', () => new THREE.CylinderGeometry(0.16, 0.3, 0.46, 12))
        : tunic
          ? geo('tunic', () => new THREE.CylinderGeometry(0.165, 0.175, 0.24, 12))
          : geo('kaftan', () => new THREE.CylinderGeometry(0.17, 0.22, 0.4, 12)),
      mat(top, { rough: 0.85 }),
    );
    skirt.position.y = dress ? -0.2 : tunic ? -0.07 : -0.16;
    skirt.castShadow = true;
    hips.add(skirt);
  }
  // From the wardrobe: a necklace, a silk scarf, a belt, earrings and a bag.
  if (look.necklace && look.necklace !== 'none') {
    const n = new THREE.Mesh(
      geo('necklace', () => new THREE.TorusGeometry(0.075, 0.008, 5, 18)),
      mat(necklaceColour(look.necklace), { rough: 0.25 }),
    );
    n.rotation.x = Math.PI / 2 - 0.5;
    n.position.set(0, 0.44, 0.03);
    torso.add(n);
  }
  if (look.scarf === 'silk') {
    const s = new THREE.Mesh(
      geo('scarf', () => new THREE.TorusGeometry(0.085, 0.035, 6, 14)),
      mat(SCARF_COLOUR),
    );
    s.rotation.x = Math.PI / 2;
    s.position.y = 0.47;
    torso.add(s);
  }
  if (look.belt === 'leather') {
    const b = new THREE.Mesh(
      geo('belt', () => new THREE.CylinderGeometry(0.155, 0.155, 0.035, 14)),
      mat(BELT_COLOUR, { rough: 0.5 }),
    );
    b.scale.set(1, 1, 0.75);
    b.position.y = 0.05;
    hips.add(b);
  }
  if (look.earrings === 'studs')
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(SKIN_GEO, mat(SILVER, { rough: 0.2 }));
      e.scale.setScalar(0.014);
      e.position.set(sx * 0.14, 0.16, 0.0);
      head.add(e);
    }
  // A bag on the shoulder (a briefcase is carried and a folio held: ./dressBody).
  if (look.bag && look.bag !== 'none' && look.bag !== 'briefcase' && look.bag !== 'folio') {
    const bm = mat(BAG_COLOUR[look.bag]!, { rough: 0.6 });
    const bag = new THREE.Mesh(
      look.bag === 'gymbag'
        ? geo('gymbag', () => new THREE.BoxGeometry(0.3, 0.16, 0.14))
        : look.bag === 'tote' || look.bag === 'worktote'
          ? geo('tote', () => new THREE.BoxGeometry(0.06, 0.26, 0.24))
          : geo('handbag', () => new THREE.BoxGeometry(0.07, 0.15, 0.2)),
      bm,
    );
    // Hung from the right shoulder, at the hip.
    bag.position.set(-0.27, look.bag === 'gymbag' ? -0.02 : 0.02, 0);
    bag.castShadow = true;
    torso.add(bag);
    const strap = new THREE.Mesh(
      geo('strap', () => new THREE.BoxGeometry(0.02, 0.48, 0.02)),
      bm,
    );
    strap.position.set(-0.2, 0.3, 0);
    strap.rotation.z = -0.3;
    torso.add(strap);
  }
  // Outfit accessories.
  // An outfit's tie (an old look), unless one from the wardrobe is on.
  switch (wearsTie(look) ? 'none' : look.accessory) {
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

  // Garments over the body (the feedback round): sleeves, jackets, a hood, a tie, a bag in hand.
  dressBody(look, { torso, female, foreL: AL.fore, foreR: AR.fore, handR: AR.hand });

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

// ---------------------------------------------------------------- Garments

/** Shoes by style: a toe cap on leather shoes, a sole and a stripe on trainers. */
function shoeShape(foot: THREE.Mesh, style: AvatarLook['shoes'], m: THREE.Material) {
  if (style === 'oxfords' || style === 'loafers' || style === 'courts' || style === 'heels') {
    const toe = new THREE.Mesh(
      geo('toe', () => new THREE.SphereGeometry(0.05, 12, 8)),
      style === 'oxfords' ? mat(shoeColour(style), { rough: 0.2 }) : m,
    );
    toe.scale.set(1, 0.7, 1.1);
    toe.position.set(0, -0.005, 0.08);
    foot.add(toe);
  } else if (style === 'trainers' || style === 'running' || style === 'sneakers') {
    const sole = new THREE.Mesh(
      geo('sole', () => new THREE.BoxGeometry(0.108, 0.025, 0.24)),
      mat('#e5e7eb', { rough: 0.8 }),
    );
    sole.position.set(0, -0.035, 0.015);
    foot.add(sole);
    const stripe = new THREE.Mesh(
      geo('stripe', () => new THREE.BoxGeometry(0.104, 0.012, 0.12)),
      mat(style === 'running' ? '#f97316' : '#0f766e'),
    );
    stripe.position.set(0, 0, -0.02);
    foot.add(stripe);
  }
}

/** Whether a look wears a tie from the wardrobe (over a collar: a suit, a shirt or a blazer). */
const wearsTie = (look: AvatarLook) =>
  !!look.tie &&
  look.tie !== 'none' &&
  (look.topStyle === 'suit' || look.topStyle === 'shirt' || look.topStyle === 'blazer');

/** A flat shape (a shirt's V, a lapel, a tie's blade), made once. */
const flat = (key: string, pts: readonly (readonly [number, number])[]) =>
  geo(`flat:${key}`, () => {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0]![0], pts[0]![1]);
    for (const p of pts.slice(1)) sh.lineTo(p[0], p[1]);
    return new THREE.ShapeGeometry(sh);
  });

/** The parts of a person clothes hang on. */
interface Body {
  torso: THREE.Group;
  female: boolean;
  foreL: THREE.Group;
  foreR: THREE.Group;
  handR: THREE.Group;
}

/** The chest's front, where flat pieces lie (it is a capsule squashed front to back). */
const chestZ = (female: boolean) => (female ? 0.14 : 0.155) * 0.72 + 0.002;

/** Put a flat piece on the chest, leaned back with the top of it. */
function onChest(b: Body, mesh: THREE.Object3D, dz = 0, lean = -0.19) {
  const g = new THREE.Group();
  g.position.set(0, 0.27, chestZ(b.female) + dz);
  g.rotation.x = lean;
  mesh.position.y -= 0.27;
  g.add(mesh);
  b.torso.add(g);
}

/** Sleeves down to the wrist, with a cuff at the end in its own colour (if it has one). */
function sleeves(b: Body, colour: string, cuff: string | null) {
  for (const f of [b.foreL, b.foreR]) {
    const s = new THREE.Mesh(
      geo('sleeve', () => new THREE.CapsuleGeometry(0.052, 0.15, 4, 10)),
      mat(colour, { rough: 0.8 }),
    );
    s.position.y = -0.1;
    s.castShadow = true;
    f.add(s);
    if (cuff) {
      const k = new THREE.Mesh(
        geo('cuff', () => new THREE.CylinderGeometry(0.047, 0.047, 0.035, 12)),
        mat(cuff, { rough: 0.6 }),
      );
      k.position.y = -0.215;
      f.add(k);
    }
  }
}

/** A jacket's skirt below the waist (so it reads as a jacket, not a jumper): open or done up. */
function jacketSkirt(b: Body, colour: string, open: boolean) {
  const h = open ? 0.18 : 0.2;
  const k = b.female ? 0.92 : 1;
  const sk = new THREE.Mesh(
    geo(
      `skirt:${open}:${k}`,
      () =>
        new THREE.CylinderGeometry(
          0.162 * k,
          0.175 * k,
          h,
          20,
          1,
          true,
          open ? 0.35 : 0,
          open ? Math.PI * 2 - 0.7 : Math.PI * 2,
        ),
    ),
    mat(colour, { rough: 0.8, side: THREE.DoubleSide }),
  );
  sk.scale.z = 0.76;
  // The opening (if any) faces the front.
  sk.rotation.y = Math.PI;
  sk.position.y = 0.06 - h / 2;
  sk.castShadow = true;
  b.torso.add(sk);
}

/** Lapels either side of the V. */
function lapels(b: Body, colour: string, depth: number) {
  for (const sx of [-1, 1]) {
    const l = new THREE.Mesh(
      flat(`lapel:${sx}:${depth}`, [
        [sx * 0.02, 0.5],
        [sx * 0.085, 0.5],
        [sx * 0.105, 0.43],
        [sx * 0.012, 0.5 - depth],
      ]),
      mat(colour, { rough: 0.5, side: THREE.DoubleSide }),
    );
    l.position.z = 0.004;
    onChest(b, l);
  }
}

/** A tie: its knot and blade, or a bow tie at the collar. */
function tieOn(b: Body, style: string) {
  const c = TIE_COLOUR[style] ?? TIE_COLOUR.silk!;
  if (style === 'bow') {
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(
        geo('bow', () => new THREE.ConeGeometry(0.022, 0.05, 6)),
        mat(c, { rough: 0.4 }),
      );
      w.rotation.z = (sx * Math.PI) / 2;
      w.position.set(sx * 0.022, 0.475, 0.008);
      onChest(b, w);
    }
    return;
  }
  const knot = new THREE.Mesh(
    geo('tie-knot', () => new THREE.BoxGeometry(0.04, 0.035, 0.03)),
    mat(shade(c, -0.12), { rough: 0.4 }),
  );
  knot.position.set(0, 0.475, 0);
  onChest(b, knot);
  const blade = new THREE.Mesh(
    flat('tie', [
      [-0.016, 0.46],
      [0.016, 0.46],
      [0.026, 0.3],
      [0, 0.27],
      [-0.026, 0.3],
    ]),
    mat(c, { rough: 0.4, side: THREE.DoubleSide }),
  );
  onChest(b, blade, 0.006);
}

/** A button on the front. */
function button(b: Body, y: number, colour: string) {
  const m = new THREE.Mesh(
    geo('button', () => new THREE.SphereGeometry(0.011, 8, 6)),
    mat(colour, { rough: 0.4 }),
  );
  m.position.set(0, y, chestZ(b.female) - 0.001);
  b.torso.add(m);
}

/** A pocket square on the left breast. */
function pocketSquare(b: Body, colour: string) {
  const sq = new THREE.Mesh(
    geo('pocket-square', () => new THREE.BoxGeometry(0.04, 0.02, 0.01)),
    mat(colour),
  );
  sq.position.set(0.075, 0.36, chestZ(b.female) - 0.005);
  b.torso.add(sq);
}

/** The top's layers by style, the tie, and a bag carried in the hand or under the arm. */
function dressBody(look: AvatarLook, b: Body) {
  const top = look.top;
  const tie = wearsTie(look) ? look.tie! : null;
  switch (look.topStyle ?? 'tee') {
    case 'suit': {
      // Under a woman's suit with no tie, an ivory blouse with a soft neck; else a white shirt.
      const blouse = b.female && !tie;
      const under = blouse ? BLOUSE_IVORY : SHIRT_WHITE;
      onChest(
        b,
        new THREE.Mesh(
          blouse
            ? flat('blouse-v', [
                [-0.075, 0.5],
                [0.075, 0.5],
                [0.03, 0.28],
                [0, 0.25],
                [-0.03, 0.28],
              ])
            : flat('shirt-v', [
                [-0.07, 0.5],
                [0.07, 0.5],
                [0, 0.25],
              ]),
          mat(under, { rough: 0.5, side: THREE.DoubleSide }),
        ),
        -0.002,
      );
      if (tie) tieOn(b, tie);
      lapels(b, shade(top, -0.25), b.female ? 0.27 : 0.24);
      for (const y of b.female ? [0.17] : [0.2, 0.12]) button(b, y, shade(top, -0.45));
      pocketSquare(b, '#f8fafc');
      jacketSkirt(b, top, false);
      sleeves(b, top, under);
      break;
    }
    case 'blazer': {
      // Open over a white tee (or a shirt and tie): a wide front, lapels, a pocket square.
      onChest(
        b,
        new THREE.Mesh(
          flat('tee-front', [
            [-0.075, 0.5],
            [0.075, 0.5],
            [0.05, 0.05],
            [-0.05, 0.05],
          ]),
          mat(SHIRT_WHITE, { rough: 0.85, side: THREE.DoubleSide }),
        ),
        -0.002,
        -0.1,
      );
      if (tie) tieOn(b, tie);
      lapels(b, shade(top, -0.2), 0.3);
      pocketSquare(b, '#d97706');
      jacketSkirt(b, top, true);
      sleeves(b, top, null);
      break;
    }
    case 'hoodie': {
      const rib = shade(top, -0.15);
      const hm = mat(top, { rough: 0.9 });
      // The hood, bunched behind the neck.
      const ring = new THREE.Mesh(
        geo('hood-ring', () => new THREE.TorusGeometry(0.09, 0.045, 8, 20)),
        hm,
      );
      ring.rotation.x = Math.PI / 2 - 0.35;
      ring.position.set(0, 0.5, -0.03);
      b.torso.add(ring);
      const hood = new THREE.Mesh(
        geo('hood', () => new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
        hm,
      );
      hood.scale.set(1.2, 0.8, 0.7);
      hood.rotation.x = -1.4;
      hood.position.set(0, 0.47, -0.11);
      b.torso.add(hood);
      // Drawstrings with their tips.
      for (const sx of [-1, 1]) {
        const d = new THREE.Mesh(
          geo('string', () => new THREE.CylinderGeometry(0.005, 0.005, 0.14, 5)),
          mat('#f8fafc'),
        );
        d.position.set(sx * 0.03, 0.4, 0);
        onChest(b, d, 0.006);
        const tip = new THREE.Mesh(
          geo('string-tip', () => new THREE.SphereGeometry(0.009, 6, 4)),
          mat('#f8fafc'),
        );
        tip.position.set(sx * 0.03, 0.33, 0);
        onChest(b, tip, 0.006);
      }
      // The kangaroo pocket and the ribbed hem.
      const pk = new THREE.Mesh(
        geo('pocket', () => new THREE.BoxGeometry(0.22, 0.1, 0.02)),
        mat(rib, { rough: 0.95 }),
      );
      pk.position.set(0, 0.07, chestZ(b.female) - 0.002);
      b.torso.add(pk);
      const hem = new THREE.Mesh(
        geo('hem', () => new THREE.CylinderGeometry(0.162, 0.165, 0.05, 20)),
        mat(rib, { rough: 0.95 }),
      );
      hem.scale.z = 0.76;
      hem.position.y = -0.03;
      b.torso.add(hem);
      sleeves(b, top, rib);
      break;
    }
    case 'shirt': {
      // A collar, the placket and its buttons (or a tie), sleeves with cuffs.
      const cm = mat(shade(top, 0.08), { rough: 0.6, side: THREE.DoubleSide });
      for (const sx of [-1, 1])
        onChest(
          b,
          new THREE.Mesh(
            flat(`collar:${sx}`, [
              [sx * 0.012, 0.5],
              [sx * 0.075, 0.5],
              [sx * 0.05, 0.44],
              [sx * 0.008, 0.46],
            ]),
            cm,
          ),
          0.004,
        );
      const pl = new THREE.Mesh(
        geo('placket', () => new THREE.BoxGeometry(0.012, 0.32, 0.004)),
        mat(shade(top, -0.12), { rough: 0.7 }),
      );
      pl.position.set(0, 0.29, 0);
      onChest(b, pl, 0.001);
      if (tie) tieOn(b, tie);
      else for (const y of [0.34, 0.24, 0.14]) button(b, y, shade(top, -0.3));
      sleeves(b, top, shade(top, -0.06));
      break;
    }
    case 'blouse': {
      // A soft gathered neck and sleeves to the wrist.
      const n = new THREE.Mesh(
        geo('blouse-neck', () => new THREE.TorusGeometry(0.075, 0.016, 6, 18, Math.PI)),
        mat(shade(top, 0.12), { rough: 0.5 }),
      );
      n.rotation.set(Math.PI / 2 + 0.35, 0, Math.PI);
      n.position.set(0, 0.47, 0.02);
      b.torso.add(n);
      sleeves(b, top, null);
      break;
    }
  }
  // A briefcase in the right hand; a folio under the left arm.
  if (look.bag === 'briefcase') {
    const bc = new THREE.Mesh(
      geo('briefcase', () => new THREE.BoxGeometry(0.08, 0.28, 0.38)),
      mat(BAG_COLOUR.briefcase!, { rough: 0.4 }),
    );
    bc.position.set(0, -0.18, 0);
    bc.castShadow = true;
    b.handR.add(bc);
    const handle = new THREE.Mesh(
      geo('briefcase-handle', () => new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI)),
      mat('#111111'),
    );
    handle.rotation.y = Math.PI / 2;
    handle.position.set(0, -0.04, 0);
    b.handR.add(handle);
    const clasp = new THREE.Mesh(
      geo('clasp', () => new THREE.BoxGeometry(0.085, 0.02, 0.03)),
      mat('#c8a25a', { metal: 0.8, rough: 0.3 }),
    );
    clasp.position.set(0, -0.08, 0);
    b.handR.add(clasp);
  } else if (look.bag === 'folio') {
    const f = new THREE.Mesh(
      geo('folio', () => new THREE.BoxGeometry(0.03, 0.3, 0.22)),
      mat(BAG_COLOUR.folio!, { rough: 0.4 }),
    );
    f.position.set(0.06, -0.12, 0.04);
    f.castShadow = true;
    b.foreL.add(f);
  }
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
