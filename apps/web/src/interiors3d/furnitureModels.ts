/**
 * The furniture as CC0 models (Quaternius "Ultimate Furniture" and "Ultimate
 * Home Interior", public/models/props/furniture.glb), by catalogue id and
 * quality tier (1 basic, 2 good, 3 luxury), fitted to the item's footprint
 * (w × d, front +z) the way ./furniture.ts's low-poly builders are.
 *
 * The low-poly builder still runs: its merged body is dropped for the model,
 * while what it keeps separate stays (a pan on the hob, a screen, a lamp's
 * light, where people sit). Until the models arrive the low-poly body is
 * drawn, and `swapLater` puts the model in when they do; a bought finish
 * (`refinish`, ./dividers.ts) is put back on it.
 */
import * as THREE from 'three';
import { propFit, propsNow, type Fit } from '../three-kit/props';
import type { ModelOpts } from './furniture';

interface Part extends Fit {
  m: string;
  x?: number;
  z?: number;
  /** Stand its back against z = -d/2 (a bed, a wardrobe, a sofa). */
  back?: boolean;
}
interface Spec {
  parts: Part[];
  /** Keep the low-poly builder's separate meshes (default true). */
  keepExtras?: boolean;
}

const SOFA_COLORS = ['#8a6e57', '#6f7a86', '#2b2b30'];
const KITCHEN = ['#e7e2d6', '#5b7065', '#2b2f33'];

/** The low-poly dining chairs' places (./furniture.ts dining), as the model's. */
function diningChairs(o: ModelOpts, w: number, d: number): [number, number, number][] {
  const chairs: [number, number, number][] = [
    [0, d / 2 + 0.3, Math.PI],
    [0, -d / 2 - 0.3, 0],
  ];
  if (o.tier >= 2) {
    chairs.length = 0;
    for (const sx of [-0.33, 0.33]) {
      chairs.push([sx * w, d / 2 + 0.3, Math.PI]);
      chairs.push([sx * w, -d / 2 - 0.3, 0]);
    }
  }
  if (o.tier === 1) chairs.push([w / 2 + 0.3, 0, -Math.PI / 2]);
  return chairs;
}

/** A kitchen run along the back: units side by side, a fridge at the end in a better home. */
function kitchenRun(o: ModelOpts): Spec {
  const depth = 0.6;
  const unitW = 1.01 * (depth / 1.12);
  const fridge = o.tier >= 2 && o.w > 2.2;
  const room = o.w - 0.04 - (fridge ? 0.7 : 0);
  const n = Math.max(1, Math.floor(room / unitW));
  const order = [
    'Kitchen_2Drawers',
    'Kitchen_Sink',
    'Kitchen_Oven',
    'Kitchen_Cabinet1',
    'Kitchen_2Drawers',
  ];
  const colours = { Kitchen: o.tint ?? KITCHEN[o.tier - 1]! };
  const x0 = -o.w / 2 + 0.02 + unitW / 2;
  const z = -o.d / 2 + depth / 2 + 0.02;
  const parts: Part[] = [];
  for (let i = 0; i < n; i++)
    parts.push({
      m: n === 1 ? 'Kitchen_Oven' : order[i % order.length]!,
      w: unitW,
      d: depth,
      hTo: 0.9,
      x: x0 + i * unitW,
      z,
      colours,
    });
  if (fridge)
    parts.push({
      m: 'Kitchen_Fridge',
      w: 0.66,
      d: 0.66,
      h: 1.85,
      x: o.w / 2 - 0.37,
      z: -o.d / 2 + 0.36,
    });
  return { parts };
}

const SPECS: Record<string, (o: ModelOpts) => Spec | null> = {
  bed: (o) => ({
    parts: [
      {
        m: ['Bed_Single', 'BedDouble', 'Bed_King'][o.tier - 1]!,
        w: o.w - 0.1,
        d: Math.min(o.d - 0.1, 2.3),
        back: true,
      },
    ],
  }),
  wardrobe: (o) => ({
    parts: [
      { m: o.tier === 1 ? 'ShortCloset' : 'Closet', w: o.w - 0.05, d: o.d - 0.05, back: true },
    ],
  }),
  sofa: (o) => {
    const c = o.tint ?? SOFA_COLORS[o.tier - 1]!;
    return {
      parts: [
        {
          m: ['Couch_Small1', 'Couch_Medium1', 'Sofa'][o.tier - 1]!,
          w: Math.min(o.w - 0.1, 2.6),
          d: Math.min(o.d, 1.0),
          back: true,
          colours: { Couch_Blue: c, Sofa: c, Legs: '#2a1d14' },
        },
      ],
    };
  },
  armchair: (o) => ({
    parts: [
      {
        m: 'Sofa_individual',
        w: o.w - 0.05,
        d: o.d - 0.05,
        colours: { Sofa: o.tint ?? '#c58b3d' },
      },
    ],
  }),
  'coffee-table': (o) => ({
    parts: [{ m: 'Table2', w: o.w - 0.1, d: o.d - 0.1, ry: Math.PI / 2 }],
  }),
  books: (o) => ({ parts: [{ m: 'Bookcase_Books', w: o.w - 0.05, d: o.d, back: true }] }),
  plants: (o) => ({
    parts: [
      {
        m: ['Houseplant_3', 'Houseplant_1', 'Houseplant_6'][o.tier - 1]!,
        w: o.w * 1.3,
        d: o.d * 1.3,
        h: [0.8, 1.0, 1.2][o.tier - 1]!,
      },
    ],
  }),
  lights: () => ({ parts: [{ m: 'Light_Floor1', w: 0.5, d: 0.5, h: 1.55 }] }),
  dining: (o) => {
    const w = Math.min(o.w - 0.6, o.tier === 1 ? 0.9 : 1.4);
    const d = Math.min(o.d - 0.7, o.tier === 1 ? 0.75 : 0.9);
    const parts: Part[] = [
      { m: o.tier === 1 ? 'Table_RoundSmall' : 'Table_RoundLarge', w, d, hTo: 0.74 },
    ];
    for (const [x, z, ry] of diningChairs(o, w, d))
      parts.push({ m: o.tier === 3 ? 'Chair_2' : 'Chair', w: 0.5, d: 0.5, h: 0.95, x, z, ry });
    return { parts };
  },
  desk: (o) => {
    const w = Math.min(o.w - 0.1, 1.5);
    const d = 0.65;
    const z = -o.d / 2 + d / 2 + 0.05;
    return {
      keepExtras: false,
      parts: [
        { m: 'Desk', w, d, hTo: o.tier === 3 ? 1.0 : 0.76, z },
        {
          m: o.tier === 1 ? 'Chair' : 'OfficeChair',
          w: 0.6,
          d: 0.6,
          h: 1.0,
          z: z + d / 2 + 0.28,
          ry: Math.PI,
        },
      ],
    };
  },
  kitchen: kitchenRun,
  kitchenette: (o) => kitchenRun({ ...o, tier: 1 }),
  fridge: (o) => ({
    parts: [{ m: 'Kitchen_Fridge', w: o.w - 0.05, d: o.d - 0.05, h: 1.85, back: true }],
  }),
  washer: (o) => ({
    parts: [{ m: 'Bathroom_WashingMachine', w: o.w - 0.05, d: o.d - 0.05, h: 0.85, back: true }],
  }),
  toilet: () => ({ parts: [{ m: 'Bathroom_Toilet', w: 0.5, d: 0.75, h: 0.8, back: true, x: 0 }] }),
  sink: (o) => ({
    parts: [{ m: 'Bathroom_Sink', w: Math.min(o.w, 0.65), d: 0.45, hTo: 0.95, back: true }],
  }),
  bathtub: (o) => ({
    parts: [
      {
        m: 'Bathroom_Bathtub',
        w: Math.min(o.w - 0.1, o.w >= o.d ? 1.7 : 0.8),
        d: Math.min(o.d - 0.1, o.w >= o.d ? 0.8 : 1.7),
        hTo: 0.58,
        ry: o.w >= o.d ? Math.PI / 2 : 0,
      },
    ],
  }),
  'restaurant-table': () => ({ parts: [{ m: 'Table_RoundSmall', w: 1.0, d: 1.0, hTo: 0.76 }] }),
  'office-desk': (o) => ({
    parts: [
      { m: 'Desk', w: Math.min(o.w - 0.1, 1.4), d: 0.7, hTo: 0.74 },
      { m: 'OfficeChair', w: 0.6, d: 0.6, h: 1.0, z: 0.62, ry: Math.PI },
    ],
  }),
  shelves: (o) => ({
    parts: [{ m: 'Shelf_Large', w: o.w - 0.05, d: Math.max(0.4, o.d - 0.05), h: 2.0, back: true }],
  }),
};

/** Whether this id has a CC0 model. */
export const hasGlb = (id: string) => id in SPECS;

/** The model for an item (null when it has none, or before the models arrive). */
export function furnitureGlb(
  id: string,
  o: ModelOpts,
): { group: THREE.Group; keepExtras: boolean } | null {
  const spec = SPECS[id]?.(o);
  if (!spec || !propsNow('furniture')) return null;
  const g = new THREE.Group();
  g.name = 'cc0';
  for (const p of spec.parts) {
    const m = propFit('furniture', p.m, p);
    if (!m) return null;
    const size = m.userData.size as THREE.Vector3;
    m.position.set(p.x ?? 0, 0, p.back ? -o.d / 2 + size.z / 2 + 0.03 : (p.z ?? 0));
    g.add(m);
  }
  return { group: g, keepExtras: spec.keepExtras ?? true };
}

/**
 * Drawn low-poly for now (the models still on their way): put the model in
 * this group when they arrive, unless the group has gone (disposed, or not
 * in a scene any more).
 */
const waiting: { ref: WeakRef<THREE.Group>; id: string; o: ModelOpts }[] = [];
let listening = false;
export function swapLater(
  group: THREE.Group,
  id: string,
  o: ModelOpts,
  refinish: (g: THREE.Object3D, swatch: string) => void,
) {
  if (!hasGlb(id) || typeof WeakRef === 'undefined') return;
  waiting.push({ ref: new WeakRef(group), id, o });
  if (listening) return;
  listening = true;
  void import('../three-kit/props').then(({ loadProps }) =>
    loadProps('furniture').then((set) => {
      if (!set) return;
      for (const w of waiting.splice(0)) {
        const g = w.ref.deref();
        if (!g) continue;
        const glb = furnitureGlb(w.id, w.o);
        if (!glb) continue;
        for (const c of [...g.children])
          if (c.userData.kitPart || (!glb.keepExtras && !c.userData.contactShadow))
            c.removeFromParent();
        g.add(glb.group);
        if (g.userData.finish) refinish(glb.group, g.userData.finish as string);
        const obj = g.userData.obj;
        if (obj !== undefined) glb.group.traverse((c) => (c.userData.obj = obj));
      }
    }),
  );
}
