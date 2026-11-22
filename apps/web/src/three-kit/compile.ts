/**
 * `renderer.compileAsync`, safe to leave behind: compile a scene's shaders,
 * then wait (off the main thread where the GPU can, KHR_parallel_shader_compile)
 * until they're ready.
 *
 * three.js's own version polls each material's program every 10 ms and
 * throws, uncaught in a timer, when one of them has been disposed of in the
 * meantime (its program is gone: "reading 'isReady'"), e.g. a view closed
 * while its first frame was still compiling. Here a material let go of (or
 * a renderer disposed of) counts as done, and the wait stops when the
 * caller says it no longer matters (`cancelled`) or after `timeout` ms.
 */
import type * as THREE from 'three';

type Program = { isReady(): boolean };

export function compileScene(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Object3D,
  camera: THREE.Camera,
  { timeout = Infinity, cancelled }: { timeout?: number; cancelled?: () => boolean } = {},
): Promise<void> {
  const waiting = renderer.compile(scene, camera);
  // Without the extension the programs were made just now, on this thread: nothing to wait for.
  if (!renderer.extensions.has('KHR_parallel_shader_compile')) return Promise.resolve();
  const until = performance.now() + timeout;
  return new Promise((resolve) => {
    const check = () => {
      const props = renderer.properties;
      for (const m of waiting) {
        const p = (props.get(m) as { currentProgram?: Program }).currentProgram;
        if (!p || p.isReady()) waiting.delete(m);
      }
      if (!waiting.size || cancelled?.() || performance.now() >= until) resolve();
      else setTimeout(check, 10);
    };
    check();
  });
}
