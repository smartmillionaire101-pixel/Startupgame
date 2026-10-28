/**
 * Where a model lands on the screen, for the framing tests (the whole
 * plane, the golfer, the bowler in the picture): its box in its own frame
 * (a turned model's world-aligned box is bigger than it is), the corners
 * projected through the camera, as −1 … 1 across (left, right) and up
 * (bottom, top). Null when nothing of it is drawn or a corner is behind the
 * camera.
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
  obj.updateWorldMatrix(true, true);
  camera.updateMatrixWorld();
  _inv.copy(obj.matrixWorld).invert();
  _box.makeEmpty();
  obj.traverseVisible((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (!g) return;
    if (!g.boundingBox) g.computeBoundingBox();
    _box.union(_part.copy(g.boundingBox!).applyMatrix4(_m.multiplyMatrices(_inv, o.matrixWorld)));
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
