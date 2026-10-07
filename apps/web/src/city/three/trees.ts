/**
 * Wave 9 §B: trees, instanced — in the parks and along the smaller streets,
 * placed deterministically (hashes, no randomness). Each city has its kind:
 * round street trees, palms, cypresses, flat-topped acacias, jacarandas.
 */
import * as THREE from 'three';
import { ROAD_CLASSES, type GeoData } from '../geo';
import type { CityLook } from './cities';
import { COVER, type GroundMask } from './mask';
import { h3 } from './buildings';

export interface TreeSpot {
  x: number;
  y: number;
  s: number;
  c: number;
}

export function treeSpots(
  data: GeoData,
  look: CityLook,
  mask: GroundMask,
  max: number,
): TreeSpot[] {
  const out: TreeSpot[] = [];
  const [bx0, by0, bx1, by1] = data.bounds;
  // Parks: a jittered grid.
  const step = 17;
  const parks: TreeSpot[] = [];
  for (let y = by0; y < by1; y += step)
    for (let x = bx0; x < bx1; x += step) {
      const r = h3(Math.round(x), Math.round(y), 31);
      if (r > 0.62) continue;
      const px = x + (h3(Math.round(x), Math.round(y), 32) - 0.5) * step;
      const py = y + (h3(Math.round(x), Math.round(y), 33) - 0.5) * step;
      if (mask.coverAt(px, py) !== COVER.park || mask.roadAt(px, py) || mask.builtAt(px, py))
        continue;
      parks.push({ x: px, y: py, s: 0.75 + r * 0.7, c: r });
    }
  // Streets: both sides of the smaller roads, on the pavement.
  const street: TreeSpot[] = [];
  if (look.streetTrees > 0) {
    const half = [0, 0, 9, 7.5, 6.5, 5.5];
    for (let ci = 2; ci < ROAD_CLASSES.length; ci++)
      for (const road of data.roads?.[ROAD_CLASSES[ci]!] ?? []) {
        const l = road.l;
        let carry = 0;
        for (let i = 0; i + 3 < l.length; i += 2) {
          const ax = l[i]!;
          const ay = l[i + 1]!;
          const bx = l[i + 2]!;
          const by = l[i + 3]!;
          const L = Math.hypot(bx - ax, by - ay);
          if (L < 1) continue;
          const nx = -(by - ay) / L;
          const ny = (bx - ax) / L;
          for (let d = carry; d < L; d += look.streetTrees) {
            for (const sg of [1, -1]) {
              const x = ax + ((bx - ax) * d) / L + nx * sg * half[ci]!;
              const y = ay + ((by - ay) * d) / L + ny * sg * half[ci]!;
              const r = h3(Math.round(x * 3), Math.round(y * 3), 41);
              if (r > 0.8) continue;
              const cov = mask.coverAt(x, y);
              if (cov !== COVER.land && cov !== COVER.park) continue;
              if (mask.builtAt(x, y)) continue;
              street.push({ x, y, s: 0.65 + r * 0.45, c: r });
            }
          }
          carry = (carry - L) % look.streetTrees;
          if (carry < 0) carry += look.streetTrees;
        }
      }
  }
  // Keep within the budget, evenly.
  const all = [...parks, ...street];
  if (all.length <= max) return all;
  const keep = max / all.length;
  for (const t of all) if (h3(Math.round(t.x * 7), Math.round(t.y * 7), 51) < keep) out.push(t);
  return out;
}

function crownGeometry(kind: CityLook['tree']): THREE.BufferGeometry {
  switch (kind) {
    case 'palm': {
      // Six drooping fronds around the top of the trunk.
      const parts: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 7; k++) {
        const f = new THREE.PlaneGeometry(1.1, 4.2, 1, 2);
        const p = f.attributes.position!;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i) + 2.1;
          p.setY(i, y);
          p.setZ(i, -0.12 * y * y);
        }
        f.rotateX(-Math.PI / 2 + 0.35);
        f.rotateY((k / 7) * Math.PI * 2);
        f.translate(0, 9, 0);
        parts.push(f);
      }
      return merge(parts);
    }
    case 'cypress': {
      const g = new THREE.ConeGeometry(2.2, 9, 7);
      g.translate(0, 7.5, 0);
      return g;
    }
    case 'acacia': {
      const g = new THREE.IcosahedronGeometry(3.6, 0);
      g.scale(1.4, 0.45, 1.4);
      g.translate(0, 6.2, 0);
      return g;
    }
    default: {
      const g = new THREE.IcosahedronGeometry(3, 1);
      g.translate(0, 5.6, 0);
      return g;
    }
  }
}

function merge(parts: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    pos.push(...(g.attributes.position!.array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Instanced trees, in chunks so that off-screen ones are skipped. */
export function treeMeshes(
  spots: TreeSpot[],
  look: CityLook,
  shadows: boolean,
  chunk = 2500,
): THREE.Group {
  const group = new THREE.Group();
  const trunkH = look.tree === 'palm' ? 9 : look.tree === 'cypress' ? 3.5 : 4.5;
  const trunk = new THREE.CylinderGeometry(look.tree === 'palm' ? 0.2 : 0.22, 0.32, trunkH, 5);
  trunk.translate(0, trunkH / 2, 0);
  const crown = crownGeometry(look.tree);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: look.tree === 'palm' ? '#8a7356' : '#5a4632',
    roughness: 1,
  });
  const crownMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.95,
    side: look.tree === 'palm' ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: true,
  });
  const byChunk = new Map<string, TreeSpot[]>();
  for (const s of spots) {
    const k = `${Math.floor(s.x / chunk)},${Math.floor(s.y / chunk)}`;
    let a = byChunk.get(k);
    if (!a) byChunk.set(k, (a = []));
    a.push(s);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  for (const list of byChunk.values()) {
    const t = new THREE.InstancedMesh(trunk, trunkMat, list.length);
    const c = new THREE.InstancedMesh(crown, crownMat, list.length);
    list.forEach((s, i) => {
      q.setFromAxisAngle(up, s.c * 6.283);
      m.compose(new THREE.Vector3(s.x, 0, s.y), q, new THREE.Vector3(s.s, s.s, s.s));
      t.setMatrixAt(i, m);
      c.setMatrixAt(i, m);
      col.set(look.leaf[Math.floor(s.c * look.leaf.length) % look.leaf.length]!);
      col.multiplyScalar(0.85 + 0.3 * ((s.c * 7.7) % 1));
      c.setColorAt(i, col);
    });
    for (const im of [t, c]) {
      im.computeBoundingSphere();
      im.castShadow = shadows;
      im.receiveShadow = false;
      group.add(im);
    }
  }
  return group;
}
