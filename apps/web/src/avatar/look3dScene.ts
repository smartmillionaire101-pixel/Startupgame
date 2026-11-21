/**
 * The 3D turntable behind ./Look3D.tsx: the actual game person (the CC0
 * model from ../three-kit/humans, the low-poly one until it arrives) in the
 * look being chosen, idling and turning slowly. Loaded on demand (three.js
 * is not in the main bundle).
 */
import * as THREE from 'three';
import type { AvatarLook } from '../city/art';
import { makeCharacter, pose, type Character } from '../interiors3d/character';
import { onKitReady } from '../three-kit/humans/kit';

export interface Preview {
  setLook(look: AvatarLook): void;
  dispose(): void;
}

export function createPreview(canvas: HTMLCanvasElement, look: AvatarLook): Preview {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff7ea', '#6b5b4a', 1.7));
  const key = new THREE.DirectionalLight('#ffffff', 2.0);
  key.position.set(1.5, 3, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#cfe0ff', 0.9);
  rim.position.set(-2, 2, -2);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
  camera.position.set(0, 1.05, 4.1);
  camera.lookAt(0, 0.88, 0);
  let person: Character | null = null;
  const put = (l: AvatarLook) => {
    if (person) scene.remove(person.root);
    person = makeCharacter(l, 'preview');
    person.shadow.visible = false;
    scene.add(person.root);
  };
  put(look);
  const size = () => {
    const w = canvas.clientWidth || 120;
    const h = canvas.clientHeight || 180;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  size();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : null;
  ro?.observe(canvas);
  const still =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now();
  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    // About 30 frames a second is plenty for a turntable.
    if (now - last < 30 || document.hidden) return;
    last = now;
    const t = (now - t0) / 1000;
    if (person) {
      person.root.rotation.y = still ? 0.35 : 0.35 + Math.sin(t * 0.5) * 0.9;
      pose(person, 'idle', t);
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  const off = onKitReady(() => renderer.render(scene, camera));
  return {
    setLook: put,
    dispose() {
      cancelAnimationFrame(raf);
      off();
      ro?.disconnect();
      renderer.dispose();
    },
  };
}
