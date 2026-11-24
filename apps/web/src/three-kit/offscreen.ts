/**
 * The one offscreen WebGL renderer the game's pictures are drawn with: the
 * catalogue's thumbnails (../shop/thumbs3d.ts) and the people's sprites and
 * portraits (./humans/sprite.ts). One context for all of them (a phone has
 * few to spare), sized per picture, transparent, ACES-toned like the game's
 * own views. If the context is lost it is made again on the next picture;
 * if WebGL can't start at all every caller gets null and keeps its fallback.
 */
import * as THREE from 'three';

let renderer: THREE.WebGLRenderer | null = null;
let broken = false;

/** The shared renderer (made on first use), or null where WebGL can't run. */
export function offscreenRenderer(): THREE.WebGLRenderer | null {
  if (renderer || broken) return renderer;
  try {
    const canvas = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    r.setPixelRatio(1);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.setClearColor(0x000000, 0);
    canvas.addEventListener('webglcontextlost', () => {
      // Lost (the GPU reset, too many contexts): a new one next time.
      if (renderer === r) renderer = null;
      r.dispose();
    });
    renderer = r;
  } catch {
    broken = true;
  }
  return renderer;
}

/**
 * Draw a scene into a picture of w × h device pixels (a data URL; WebP where
 * the browser writes it, else PNG). Null when there's no renderer.
 */
export function snapshot(
  scene: THREE.Scene,
  camera: THREE.Camera,
  w: number,
  h: number,
  opts: { type?: string; quality?: number; exposure?: number } = {},
): string | null {
  const r = offscreenRenderer();
  if (!r) return null;
  r.setSize(w, h, false);
  r.toneMappingExposure = opts.exposure ?? 1.05;
  r.setClearColor(0x000000, 0);
  r.clear();
  r.render(scene, camera);
  return r.domElement.toDataURL(opts.type ?? 'image/png', opts.quality);
}
