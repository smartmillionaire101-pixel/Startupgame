/**
 * The skydive and the helicopter ride, Inside or Outside (../src/experiences/air/air3d.ts):
 * the choice remembered per player, and where the rig puts the camera and
 * which model it shows in each phase.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AirRig, saveCamMode, savedCamMode } from '../src/experiences/air/air3d';
import { exitPlane, newHeli, newJump, stepJump, type Jump } from '../src/experiences/air/flight';
import type { AvatarLook } from '../src/city/art';

/** jsdom has no 2D canvas: the models' painted textures draw into a context that does nothing. */
const noop: object = new Proxy(() => noop, { get: () => noop, set: () => true, apply: () => noop });
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    noop) as unknown as HTMLCanvasElement['getContext'];
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const LOOK: AvatarLook = {
  skin: '#c68642',
  hair: '#3b2414',
  hairStyle: 'short',
  top: '#2563eb',
  bottom: '#1f2937',
  accessory: 'none',
  gender: 'female',
};
const cam = () => ({ pos: new THREE.Vector3(), yaw: 0, pitch: 0, fov: 60 });
const opts = { reduced: false, night: false };

describe('Inside | Outside, remembered', () => {
  it('starts Outside, then keeps each player’s own choice', () => {
    expect(savedCamMode('p1')).toBe('outside');
    saveCamMode('p1', 'inside');
    expect(savedCamMode('p1')).toBe('inside');
    expect(savedCamMode('p2')).toBe('outside');
  });

  it('works without storage (private mode): Outside, and saving doesn’t throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(savedCamMode('p1')).toBe('outside');
    expect(() => saveCamMode('p1', 'inside')).not.toThrow();
  });
});

describe('the helicopter', () => {
  const h = { ...newHeli(1000, 2000), alt: 220, speed: 75, heading: 0 };

  it('Outside: a chase camera behind and above, the helicopter in view', () => {
    const rig = new AirRig('heli', LOOK, opts);
    const c = cam();
    rig.placeHeli(h, 220, 'outside', c, 0.016);
    expect(rig.shown).toBe('heli');
    // Heading north (−z): the camera is south of it (behind) and higher.
    expect(c.pos.z).toBeGreaterThan(2010);
    expect(c.pos.y).toBeGreaterThan(224);
    expect(c.pitch).toBeLessThan(0);
    rig.dispose();
  });

  it('Inside: in the cabin, looking ahead over the panel', () => {
    const rig = new AirRig('heli', LOOK, opts);
    const c = cam();
    rig.placeHeli(h, 220, 'inside', c, 0.016);
    expect(rig.shown).toBe('cockpit');
    expect(c.pos.distanceTo(new THREE.Vector3(1000, 222, 2000))).toBeLessThan(2.5);
    expect(Math.abs(c.yaw - h.heading)).toBeLessThan(0.3);
    rig.dispose();
  });
});

describe('the skydive', () => {
  const at = (phase: 'door' | 'freefall'): Jump => {
    let j = stepJump(newJump(0, 0), 20, { turn: 0, track: false });
    if (phase === 'freefall') j = stepJump(exitPlane(j), 0.5, { turn: 0, track: false });
    expect(j.phase).toBe(phase);
    return j;
  };

  it('at the door: the plane from outside; the door’s frame from inside', () => {
    const rig = new AirRig('skydive', LOOK, opts);
    const j = at('door');
    const c = cam();
    rig.placeJump(j, 0, 'outside', c, 0.016, 0, { track: false, turn: 0 });
    expect(rig.shown).toBe('plane');
    rig.placeJump(j, 0, 'inside', c, 0.016, 0, { track: false, turn: 0 });
    expect(rig.shown).toBe('');
    expect(c.pos.y).toBeCloseTo(j.alt + 1.7);
    rig.dispose();
  });

  it('in freefall: you from the chase camera; your arms from inside', () => {
    const rig = new AirRig('skydive', LOOK, opts);
    const j = at('freefall');
    const c = cam();
    rig.placeJump(j, 0, 'outside', c, 0.016, 0, { track: false, turn: 0 });
    expect(rig.shown).toBe('jumper');
    expect(c.pos.y).toBeGreaterThan(j.alt + 1);
    expect(Math.hypot(c.pos.x - j.x, c.pos.z - j.z)).toBeGreaterThan(2);
    rig.placeJump(j, 0, 'inside', c, 0.016, 0, { track: false, turn: 0 });
    expect(rig.shown).toBe('arms');
    rig.dispose();
  });
});
