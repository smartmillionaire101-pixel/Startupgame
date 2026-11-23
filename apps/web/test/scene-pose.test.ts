import { describe, expect, it } from 'vitest';
import { activityAngle, activityPose } from '../src/city/scenePose';
import { SEATED, SPRITE_POSES } from '../src/three-kit/humans/spriteCache';
import type { Activity } from '../src/city/rooms';

const ACTS: Activity[] = [
  'eating',
  'drinking',
  'chatting',
  'dancing',
  'typing',
  'ordering',
  'serving',
  'workout',
  'watching',
  'browsing',
  'relaxing',
  'waiting',
  'presenting',
  'dj',
  'singing',
  'playing',
  'football',
];

describe('room people as sprites', () => {
  it('seated people get a seated pose, standing people a standing one', () => {
    for (const a of ACTS) {
      for (const id of ['a', 'bb', 'ccc', 'occupant-17']) {
        const sit = activityPose(a, true, id);
        const stand = activityPose(a, false, id);
        expect(SPRITE_POSES).toContain(sit);
        expect(SPRITE_POSES).toContain(stand);
        expect(SEATED.has(sit)).toBe(true);
        expect(SEATED.has(stand)).toBe(false);
      }
    }
  });

  it('does what the room says', () => {
    expect(activityPose('dancing', false)).toBe('dance');
    expect(activityPose('eating', true)).toBe('eat');
    expect(activityPose('drinking', true)).toBe('drink');
    expect(activityPose('typing', true)).toBe('type');
    expect(['lift', 'squat']).toContain(activityPose('workout', false, 'x'));
    // The same person always does the same thing.
    expect(activityPose('workout', false, 'p1')).toBe(activityPose('workout', false, 'p1'));
  });

  it('watching a screen from a seat is seen from behind; talking is turned', () => {
    expect(activityAngle('watching', true).angle).toBe('back');
    expect(activityAngle('chatting', false)).toEqual({ angle: 'three-quarter', flip: true });
    expect(activityAngle('dancing', false)).toEqual({ angle: 'front', flip: false });
  });
});
