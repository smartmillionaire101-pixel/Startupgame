/**
 * Wave 9 §C: small effects for acts: steam, water, sleep Zs, music notes,
 * sparkles and confetti. A pooled sprite system: `emit` spawns, `update`
 * moves and fades, and says whether anything is still alive.
 */
import * as THREE from 'three';
import { glowTexture } from './kit';

const GLYPHS = new Map<string, THREE.Texture>();
export function glyphTexture(ch: string, color: string): THREE.Texture {
  const key = `${ch}|${color}`;
  const hit = GLYPHS.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = 'bold 48px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.strokeText(ch, 32, 34);
  g.fillStyle = color;
  g.fillText(ch, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  GLYPHS.set(key, t);
  return t;
}

interface P {
  s: THREE.Sprite;
  v: THREE.Vector3;
  life: number;
  age: number;
  size: number;
  grow: number;
  alpha: number;
  spin: number;
}

export class Particles {
  readonly group = new THREE.Group();
  private live: P[] = [];
  private pool: THREE.Sprite[] = [];

  emit(
    pos: THREE.Vector3,
    o: {
      vel?: THREE.Vector3;
      life?: number;
      size?: number;
      grow?: number;
      color?: string;
      alpha?: number;
      map?: THREE.Texture;
      additive?: boolean;
    } = {},
  ) {
    if (this.live.length > 160) return;
    const s =
      this.pool.pop() ??
      new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    const m = s.material;
    m.map = o.map ?? glowTexture();
    m.color.set(o.color ?? '#ffffff');
    m.blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.opacity = o.alpha ?? 0.6;
    m.needsUpdate = true;
    s.position.copy(pos);
    s.scale.setScalar(o.size ?? 0.2);
    s.renderOrder = 5;
    this.group.add(s);
    this.live.push({
      s,
      v: o.vel ?? new THREE.Vector3(0, 0.4, 0),
      life: o.life ?? 1.4,
      age: 0,
      size: o.size ?? 0.2,
      grow: o.grow ?? 1.8,
      alpha: o.alpha ?? 0.6,
      spin: 0,
    });
  }

  update(dt: number): boolean {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.age += dt;
      const u = p.age / p.life;
      if (u >= 1) {
        this.group.remove(p.s);
        this.pool.push(p.s);
        this.live.splice(i, 1);
        continue;
      }
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(p.size * (1 + (p.grow - 1) * u));
      p.s.material.opacity = p.alpha * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85);
    }
    return this.live.length > 0;
  }

  clear() {
    for (const p of this.live) this.group.remove(p.s);
    this.live = [];
  }

  get count() {
    return this.live.length;
  }
}

/** Emitters for the common effects, called each frame with a spawn chance. */
export const fx = {
  steam(ps: Particles, at: THREE.Vector3, dt: number, rate = 10) {
    if (Math.random() < dt * rate)
      ps.emit(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25)), {
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.45 + Math.random() * 0.2, 0),
        life: 1.6,
        size: 0.22,
        grow: 3,
        color: '#ffffff',
        alpha: 0.42,
      });
  },
  water(ps: Particles, at: THREE.Vector3, dt: number) {
    for (let i = 0; i < 3; i++)
      if (Math.random() < dt * 30)
        ps.emit(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)), {
          vel: new THREE.Vector3(0, -2.4, 0),
          life: 0.75,
          size: 0.05,
          grow: 1,
          color: '#93c5fd',
          alpha: 0.85,
        });
  },
  zz(ps: Particles, at: THREE.Vector3, dt: number) {
    if (Math.random() < dt * 1.2)
      ps.emit(at.clone(), {
        vel: new THREE.Vector3(0.12, 0.3, 0),
        life: 2.4,
        size: 0.22,
        grow: 1.6,
        map: glyphTexture('Z', '#e0e7ff'),
        alpha: 0.95,
      });
  },
  notes(ps: Particles, at: THREE.Vector3, dt: number, color = '#f9a8d4') {
    if (Math.random() < dt * 2.5)
      ps.emit(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, 0)), {
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.45, 0),
        life: 1.8,
        size: 0.2,
        grow: 1.2,
        map: glyphTexture(Math.random() > 0.5 ? '♪' : '♫', color),
        alpha: 1,
      });
  },
  sparkle(ps: Particles, at: THREE.Vector3, dt: number, color = '#fde047', rate = 8) {
    if (Math.random() < dt * rate)
      ps.emit(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6)), {
        vel: new THREE.Vector3(0, 0.25, 0),
        life: 0.9,
        size: 0.12,
        grow: 0.3,
        color,
        alpha: 1,
        additive: true,
      });
  },
  hearts(ps: Particles, at: THREE.Vector3, dt: number) {
    if (Math.random() < dt * 1.5)
      ps.emit(at.clone(), {
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.4, 0),
        life: 1.6,
        size: 0.2,
        map: glyphTexture('♥', '#fb7185'),
        alpha: 1,
        grow: 1.2,
      });
  },
  hair(ps: Particles, at: THREE.Vector3, dt: number, color: string) {
    if (Math.random() < dt * 14)
      ps.emit(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)), {
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, -0.9, (Math.random() - 0.5) * 0.3),
        life: 0.9,
        size: 0.04,
        grow: 1,
        color,
        alpha: 1,
      });
  },
};
