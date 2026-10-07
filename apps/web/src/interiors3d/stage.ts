/**
 * Wave 9 §C: one WebGL stage per scene. A renderer (DPR ≤ 2, soft shadows,
 * filmic tone mapping), an orthographic bird's-eye camera you orbit and
 * zoom, warm interior lighting (a sun with soft shadows, sky and bounce
 * light, a few lamps) and a render-on-demand loop: frames are drawn only
 * while something moves, and never while the tab is hidden.
 */
import * as THREE from 'three';

export interface StageOpts {
  /** The world-space point the camera looks at. */
  target: THREE.Vector3;
  /** How much of the world fits (metres across the shorter side). */
  span: number;
  /** Camera angles, radians: around the up axis (0 = from +z) and above the floor. */
  azimuth: number;
  elevation: number;
  /** Limits for orbiting. */
  minAzimuth?: number;
  maxAzimuth?: number;
  minElevation?: number;
  maxElevation?: number;
  background?: string;
  /** The sun's shadow box (half-size, metres). */
  shadowSize?: number;
}

export type Animator = (t: number, dt: number) => boolean | void;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;
  readonly target: THREE.Vector3;
  azimuth: number;
  elevation: number;
  span: number;
  zoom = 1;
  w = 1;
  h = 1;
  private opts: StageOpts;
  private animators = new Set<Animator>();
  private dirty = true;
  private raf = 0;
  private last = 0;
  private t0 = performance.now();
  private disposed = false;
  private camListeners = new Set<() => void>();
  private onVis = () => (document.hidden ? cancelAnimationFrame(this.raf) : this.kick());
  /** Called after each drawn frame. */
  onFrame: (() => void) | null = null;
  frames = 0;

  constructor(readonly canvas: HTMLCanvasElement, o: StageOpts) {
    this.opts = o;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(o.background ?? '#16223d');
    this.target = o.target.clone();
    this.azimuth = o.azimuth;
    this.elevation = o.elevation;
    this.span = o.span;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

    this.hemi = new THREE.HemisphereLight('#fff4e0', '#4a3b2c', 1.35);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight('#ffffff', 0.25);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight('#fff1d6', 1.9);
    this.sun.castShadow = true;
    const s = o.shadowSize ?? 10;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -s;
    sc.right = s;
    sc.top = s;
    sc.bottom = -s;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    this.sun.position.set(this.target.x - 8, 20, this.target.z + 10);
    this.sun.target.position.copy(this.target);
    this.scene.add(this.sun, this.sun.target);
    this.updateCamera();
    document.addEventListener('visibilitychange', this.onVis);
  }

  /** Size the drawing buffer to the canvas's CSS box. */
  setSize(w: number, h: number) {
    if (w < 2 || h < 2) return;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.updateCamera();
  }

  updateCamera() {
    const aspect = this.w / this.h;
    const half = this.span / 2 / this.zoom;
    const hw = aspect >= 1 ? half * aspect : half;
    const hh = aspect >= 1 ? half : half / aspect;
    const c = this.camera;
    c.left = -hw;
    c.right = hw;
    c.top = hh;
    c.bottom = -hh;
    const r = 60;
    const ce = Math.cos(this.elevation);
    c.position.set(
      this.target.x + r * ce * Math.sin(this.azimuth),
      this.target.y + r * Math.sin(this.elevation),
      this.target.z + r * ce * Math.cos(this.azimuth),
    );
    c.up.set(0, 1, 0);
    c.lookAt(this.target);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    this.invalidate();
    for (const f of this.camListeners) f();
  }

  onCamera(f: () => void) {
    this.camListeners.add(f);
    return () => this.camListeners.delete(f);
  }

  /** Orbit by a drag (pixels). */
  orbit(dx: number, dy: number) {
    const o = this.opts;
    this.azimuth -= dx * 0.008;
    if (o.minAzimuth !== undefined) this.azimuth = Math.max(o.minAzimuth, this.azimuth);
    if (o.maxAzimuth !== undefined) this.azimuth = Math.min(o.maxAzimuth, this.azimuth);
    this.elevation = Math.max(
      o.minElevation ?? 0.45,
      Math.min(o.maxElevation ?? 1.35, this.elevation + dy * 0.006),
    );
    this.updateCamera();
  }

  zoomBy(f: number) {
    this.zoom = Math.max(0.7, Math.min(3.2, this.zoom * f));
    this.updateCamera();
  }

  /** Move what the camera looks at (smoothly when `k` < 1). */
  lookAt(x: number, z: number, k = 1) {
    const nx = this.target.x + (x - this.target.x) * k;
    const nz = this.target.z + (z - this.target.z) * k;
    if (Math.abs(nx - this.target.x) < 1e-4 && Math.abs(nz - this.target.z) < 1e-4) return;
    this.target.x = nx;
    this.target.z = nz;
    this.updateCamera();
  }

  add(a: Animator) {
    this.animators.add(a);
    this.kick();
    return () => this.animators.delete(a);
  }

  invalidate() {
    this.dirty = true;
    this.kick();
  }

  private kick() {
    if (this.disposed || this.raf || (typeof document !== 'undefined' && document.hidden)) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = (now - this.t0) / 1000;
    let busy = false;
    for (const a of this.animators) if (a(t, dt)) busy = true;
    if (busy || this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      this.frames++;
      this.onFrame?.();
    }
    if (busy || this.dirty) this.raf = requestAnimationFrame(this.tick);
  };

  /** Draw now (the first frame). */
  renderNow() {
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    this.onFrame?.();
  }

  /** A world point on screen, in CSS pixels from the canvas's top-left. */
  project(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * this.w, y: ((1 - p.y) / 2) * this.h };
  }

  private ray = new THREE.Raycaster();
  /** What's under a point (CSS pixels relative to the canvas). */
  pick(x: number, y: number, objects: THREE.Object3D[]): THREE.Intersection | null {
    const ndc = new THREE.Vector2((x / this.w) * 2 - 1, 1 - (y / this.h) * 2);
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(objects, true);
    return hits.find((h) => h.object.visible && (h.object as THREE.Mesh).isMesh) ?? null;
  }

  /** Where a screen point meets the floor (y = 0). */
  floorAt(x: number, y: number): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((x / this.w) * 2 - 1, 1 - (y / this.h) * 2);
    this.ray.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVis);
    this.animators.clear();
    this.camListeners.clear();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** Pointer gestures on an element: tap, one-finger orbit, pinch and wheel zoom. */
export function gestures(
  el: HTMLElement,
  h: {
    tap: (x: number, y: number, e: PointerEvent) => void;
    orbit: (dx: number, dy: number) => void;
    zoom: (f: number) => void;
    /** A drag started (close menus). */
    start?: () => void;
  },
) {
  const pts = new Map<number, { x: number; y: number; x0: number; y0: number }>();
  let moved = false;
  let pinch = 0;
  const rect = () => el.getBoundingClientRect();
  const down = (e: PointerEvent) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    if (pts.size === 1) moved = false;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      moved = true;
    }
  };
  const move = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinch > 0 && d > 0) h.zoom(d / pinch);
      pinch = d;
      return;
    }
    if (!moved && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8) return;
    if (!moved) h.start?.();
    moved = true;
    h.orbit(dx, dy);
  };
  const up = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (!p) return;
    if (!moved && pts.size === 0) {
      const r = rect();
      h.tap(e.clientX - r.left, e.clientY - r.top, e);
    }
  };
  const cancel = (e: PointerEvent) => pts.delete(e.pointerId);
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    h.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('wheel', wheel, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('wheel', wheel);
  };
}
