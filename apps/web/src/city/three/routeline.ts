/**
 * The route ahead while you drive: a ribbon laid on your lane, the next few
 * hundred metres, rewritten in place each frame (one buffer, no garbage).
 */
import * as THREE from 'three';

interface P2 {
  x: number;
  y: number;
}

export class RouteLine {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private attr: THREE.BufferAttribute;

  constructor(
    private max = 256,
    private half = 0.8,
  ) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 2 * 3);
    this.attr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    const idx: number[] = [];
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color: '#14b8a6',
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }

  /** Lay it along a polyline (map metres) at the road's height; null hides it. */
  set(pts: readonly P2[] | null, height: (x: number, y: number) => number) {
    const n = pts ? Math.min(pts.length, this.max) : 0;
    this.mesh.visible = n > 1;
    if (n < 2) return;
    const a = this.pos;
    for (let i = 0; i < n; i++) {
      const p = pts![i]!;
      const q = pts![Math.max(0, i - 1)]!;
      const r = pts![Math.min(n - 1, i + 1)]!;
      const L = Math.hypot(r.x - q.x, r.y - q.y) || 1;
      const nx = (-(r.y - q.y) / L) * this.half;
      const ny = ((r.x - q.x) / L) * this.half;
      const h = height(p.x, p.y) + 0.3;
      a.set([p.x + nx, h, p.y + ny, p.x - nx, h, p.y - ny], i * 6);
    }
    this.attr.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, (n - 1) * 6);
  }
}
