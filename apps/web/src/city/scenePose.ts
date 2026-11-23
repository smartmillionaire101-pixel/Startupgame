/**
 * What a person in a 2D room looks like doing their thing, as a `PersonSprite`
 * pose and angle (./PersonSprite.tsx): the room's activity (./rooms.ts), and
 * whether they sit. Pure; no three.js.
 */
import type { SpriteAngle, SpritePose } from '../three-kit/humans/spriteCache';
import type { Activity } from './rooms';

/**
 * People's sprites in a 2D room are drawn this much bigger than AvatarFigure
 * (whose big cartoon head reads bigger than a real person's), to sit right
 * beside the rooms' furniture.
 */
export const SPRITE_K = 1.15;

/** A small stable number from an id (to vary poses between people). */
const pick = (id: string, n: number) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
};

const STANDING: Record<Activity, SpritePose | readonly SpritePose[]> = {
  eating: 'idle',
  drinking: ['chat', 'idle'],
  chatting: ['chat', 'idle', 'chat'],
  dancing: 'dance',
  typing: 'browse',
  ordering: 'chat',
  serving: 'present',
  workout: ['lift', 'squat'],
  watching: 'idle',
  browsing: 'browse',
  relaxing: 'idle',
  waiting: 'stand',
  presenting: 'present',
  dj: 'stir',
  singing: 'sing',
  playing: 'browse',
  football: 'kick',
};

const SITTING: Partial<Record<Activity, SpritePose>> = {
  eating: 'eat',
  drinking: 'drink',
  typing: 'type',
  playing: 'play',
  watching: 'sit',
  relaxing: 'sit',
  waiting: 'sit',
  chatting: 'sit',
};

/** The pose for someone doing `act` (seated or standing); `id` varies it between people. */
export function activityPose(act: Activity, seated: boolean, id = ''): SpritePose {
  if (seated) return SITTING[act] ?? 'sit';
  const p = STANDING[act] ?? 'idle';
  return typeof p === 'string' ? p : p[pick(id, p.length)]!;
}

/** Activities done turned towards someone (a table, a counter, a friend): three-quarter. */
const TURNED = new Set<Activity>([
  'chatting',
  'eating',
  'drinking',
  'ordering',
  'serving',
  'presenting',
  'typing',
]);

/**
 * The angle: turned towards whoever they're with, from behind when they
 * watch a screen on the back wall, else facing you. `flip` (for the sprite)
 * turns a three-quarter view to face the way the slot faces (a slot that
 * isn't flipped faces right).
 */
export function activityAngle(
  act: Activity,
  seated: boolean,
): { angle: SpriteAngle; flip: boolean } {
  if (seated && act === 'watching') return { angle: 'back', flip: false };
  if (TURNED.has(act)) return { angle: 'three-quarter', flip: true };
  return { angle: 'front', flip: false };
}
