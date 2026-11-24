/**
 * three-kit/compile.ts: a view's shaders compiling in the background, the
 * view closed meanwhile (its materials disposed of, the renderer let go of).
 * three.js's own compileAsync then threw from a timer ("Cannot read
 * properties of undefined (reading 'isReady')", the pool test at 1440×900
 * on the deploy preview); this one just stops waiting.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { compileScene } from '../src/three-kit/compile';

/** A renderer with the parallel-compile extension whose programs are ready when told. */
function fakeRenderer(mats: THREE.Material[], parallel = true) {
  const props = new WeakMap<object, Record<string, unknown>>();
  let ready = false;
  for (const m of mats) props.set(m, { currentProgram: { isReady: () => ready } });
  const renderer = {
    compile: () => new Set(mats),
    extensions: { has: (n: string) => parallel && n === 'KHR_parallel_shader_compile' },
    properties: {
      get(o: object) {
        if (!props.has(o)) props.set(o, {});
        return props.get(o)!;
      },
      remove: (o: object) => props.delete(o),
    },
  };
  return {
    renderer: renderer as unknown as THREE.WebGLRenderer,
    /** What `material.dispose()` does to the renderer's record of it. */
    dispose: (m: THREE.Material) => renderer.properties.remove(m),
    ready: () => (ready = true),
  };
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();

describe('compileScene', () => {
  afterEach(() => vi.useRealTimers());

  it('waits for the programs, then resolves', async () => {
    vi.useFakeTimers();
    const r = fakeRenderer([new THREE.MeshBasicMaterial()]);
    let done = false;
    void compileScene(r.renderer, scene, camera).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(50);
    expect(done).toBe(false);
    r.ready();
    await vi.advanceTimersByTimeAsync(20);
    expect(done).toBe(true);
  });

  it('a material disposed of while it compiles counts as done (no throw)', async () => {
    vi.useFakeTimers();
    const m = new THREE.MeshBasicMaterial();
    const r = fakeRenderer([m]);
    const done = compileScene(r.renderer, scene, camera);
    r.dispose(m);
    await vi.advanceTimersByTimeAsync(20);
    await expect(done).resolves.toBeUndefined();
  });

  it('stops when the caller no longer cares, or after the timeout', async () => {
    vi.useFakeTimers();
    let gone = false;
    const a = fakeRenderer([new THREE.MeshBasicMaterial()]);
    let doneA = false;
    void compileScene(a.renderer, scene, camera, { cancelled: () => gone }).then(
      () => (doneA = true),
    );
    await vi.advanceTimersByTimeAsync(30);
    expect(doneA).toBe(false);
    gone = true;
    await vi.advanceTimersByTimeAsync(20);
    expect(doneA).toBe(true);

    const b = fakeRenderer([new THREE.MeshBasicMaterial()]);
    let doneB = false;
    void compileScene(b.renderer, scene, camera, { timeout: 100 }).then(() => (doneB = true));
    await vi.advanceTimersByTimeAsync(130);
    expect(doneB).toBe(true);
  });

  it('without the extension there is nothing to wait for', async () => {
    const r = fakeRenderer([new THREE.MeshBasicMaterial()], false);
    await expect(compileScene(r.renderer, scene, camera)).resolves.toBeUndefined();
  });
});
