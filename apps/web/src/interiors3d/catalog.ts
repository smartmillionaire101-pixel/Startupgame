/**
 * Wave 9 §C: what the game's things look like in 3D. Every furniture
 * catalogue item (`${slot}-${tier}`, 21 slots × 3 tiers), every home fixture
 * and every car model maps to a model in ./furniture.ts; anything unknown
 * gets a plain crate. Pure: no three.js here, so it is cheap to test.
 */
import type { HomePlan, Spot } from '../home/layout';

/** Furniture slot → model id (the tier picks the variant). */
export const SLOT_MODEL: Record<string, string> = {
  sofa: 'sofa',
  bed: 'bed',
  desk: 'desk',
  tv: 'tv',
  plants: 'plants',
  art: 'art',
  kitchen: 'kitchen',
  sound: 'sound',
  gaming: 'gaming',
  fridge: 'fridge',
  washer: 'washer',
  cooling: 'cooling',
  power: 'power',
  lights: 'lights',
  rug: 'rug',
  dining: 'dining',
  wardrobe: 'wardrobe',
  books: 'books',
  coffee: 'coffee',
  wifi: 'wifi',
  laptop: 'laptop',
};

/** Home fixtures → model id. */
export const FIXTURE_MODEL: Record<string, string> = {
  door: 'door',
  kitchenette: 'kitchenette',
  mat: 'mat',
  cushions: 'cushions',
  shower: 'shower',
  toilet: 'toilet',
  sink: 'sink',
  'shared-bath': 'shared-bath',
  bathtub: 'bathtub',
  pool: 'pool-table',
  piano: 'piano',
};

export const CAR_MODELS = [
  'motorbike',
  'hatchback',
  'ride-hail-sedan',
  'city-suv',
  'electric',
  'luxury',
];

/** The model for a catalogue item id ('sofa-2'), a slot, a fixture or a car ('car:luxury'). */
export function modelFor(id: string): { model: string; tier: number } {
  if (id.startsWith('car:'))
    return { model: CAR_MODELS.includes(id.slice(4)) ? id : 'car:hatchback', tier: 1 };
  const m = /^([a-z-]+?)-([123])$/.exec(id);
  const slot = m ? m[1]! : id;
  const tier = m ? Number(m[2]) : 1;
  const model = SLOT_MODEL[slot] ?? FIXTURE_MODEL[slot] ?? 'crate';
  return { model, tier };
}

/**
 * Which way a thing in the flat faces (radians about the up axis; 0 faces
 * +z, into the room from the back wall): away from the wall it stands
 * against. A sofa faces the TV; a placed thing keeps its turn.
 */
export function facingOf(plan: HomePlan, id: string, s: Spot & { rot?: number }): number {
  if (typeof s.rot === 'number') return (s.rot * Math.PI) / 2;
  if (id === 'sofa' || id === 'cushions') return Math.PI;
  if (id === 'rug' || id === 'dining' || id === 'pool' || id === 'lights') return 0;
  if (s.wall || s.y === 0) return 0;
  if (s.x + s.w === plan.w) return -Math.PI / 2;
  if (s.x === 0) return Math.PI / 2;
  if (s.y + s.h === plan.h) return Math.PI;
  // Against an inner wall: one behind it (top edge) faces +z, below it faces -z.
  if (plan.walls.some((w) => w.dir === 'h' && w.y === s.y && w.x >= s.x && w.x < s.x + s.w))
    return 0;
  if (plan.walls.some((w) => w.dir === 'h' && w.y === s.y + s.h && w.x >= s.x && w.x < s.x + s.w))
    return Math.PI;
  return 0;
}

/** A spot's centre in world units and its footprint in the model's own frame. */
export function frameOf(s: Spot, ry: number): { x: number; z: number; w: number; d: number } {
  const quarter = Math.round(ry / (Math.PI / 2));
  const turned = Math.abs(quarter) % 2 === 1;
  return {
    x: s.x + s.w / 2,
    z: s.y + s.h / 2,
    w: turned ? s.h : s.w,
    d: turned ? s.w : s.h,
  };
}
