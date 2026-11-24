/**
 * Where a model lands on the screen, for the framing tests (the whole
 * plane, the golfer, the bowler in the picture): its box in its own frame
 * (a turned model's world-aligned box is bigger than it is), the corners
 * projected through the camera, as −1 … 1 across (left, right) and up
 * (bottom, top). Null when nothing of it is drawn or a corner is behind the
 * camera.
 *
 * A skinned mesh (the CC0 people, ../three-kit/humans) is measured as it is
 * posed now, not by its geometry's bind-pose box: that box is in the rig's
 * own space (lying down, a different size), nowhere near the person drawn.
 * The model is brought up to date first (`updateMatrixWorld`, which a
 * person's model hooks to follow its joints).
 */
import * as THREE from 'three';

export interface ScreenBox {
  l: number;
  r: number;
  b: number;
  t: number;
}

const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _box = new THREE.Box3();
const _part = new THREE.Box3();
const _v = new THREE.Vector3();

export function screenBoxOf(obj: THREE.Object3D, camera: THREE.Camera): ScreenBox | null {
  obj.parent?.updateWorldMatrix(true, false);
  obj.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  _inv.copy(obj.matrixWorld).invert();
  _box.makeEmpty();
  obj.traverseVisible((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (!g) return;
    let local: THREE.Box3;
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
      const sk = o as THREE.SkinnedMesh;
      sk.computeBoundingBox();
      local = sk.boundingBox!;
    } else {
      if (!g.boundingBox) g.computeBoundingBox();
      local = g.boundingBox!;
    }
    if (local.isEmpty()) return;
    _box.union(_part.copy(local).applyMatrix4(_m.multiplyMatrices(_inv, o.matrixWorld)));
  });
  if (_box.isEmpty()) return null;
  const out = { l: Infinity, r: -Infinity, b: Infinity, t: -Infinity };
  for (let i = 0; i < 8; i++) {
    _v.set(
      i & 1 ? _box.max.x : _box.min.x,
      i & 2 ? _box.max.y : _box.min.y,
      i & 4 ? _box.max.z : _box.min.z,
    )
      .applyMatrix4(obj.matrixWorld)
      .project(camera);
    if (_v.z > 1) return null;
    out.l = Math.min(out.l, _v.x);
    out.r = Math.max(out.r, _v.x);
    out.b = Math.min(out.b, _v.y);
    out.t = Math.max(out.t, _v.y);
  }
  return out;
}

/** The box as fractions of the canvas from its top-left ("left,top,right,bottom"), or ''. */
export function screenBoxAttr(b: ScreenBox | null): string {
  if (!b) return '';
  return [(b.l + 1) / 2, (1 - b.t) / 2, (b.r + 1) / 2, (1 - b.b) / 2]
    .map((n) => n.toFixed(3))
    .join(',');
}
