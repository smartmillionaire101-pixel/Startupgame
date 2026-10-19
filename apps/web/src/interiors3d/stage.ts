/**
 * Wave 9 §C: one WebGL stage per scene. A renderer (DPR ≤ 2, soft shadows,
 * filmic tone mapping), an orthographic bird's-eye camera you orbit and
 * zoom, warm interior lighting (a sun with soft shadows, sky and bounce
 * light, a few lamps) and a render-on-demand loop: frames are drawn only
 * while something moves, and never while the tab is hidden.
 */
import * as THREE from 'three';
import { cpuGl, softwareGl } from '../three-kit/quality';

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
  /** Shadow map resolution (default 2048). */
  shadowMap?: number;
  /** Frames a second at most while animating (default 60). */
  maxFps?: number;
}

/** A phone-sized screen. */
const phone = () =>
  typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600;
/** A phone with few cores or little memory. */
function weakDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return phone() && ((navigator.hardwareConcurrency || 4) <= 4 || mem <= 4);
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
  /** How far the camera stands from what it looks at (metres; an orthographic view looks the same from any distance, this only sets what's clipped and the fog's depth). */
  distance = 60;
  w = 1;
  h = 1;
  private opts!: StageOpts;
  private animators = new Set<Animator>();
  private dirty = true;
  private raf = 0;
  private last = 0;
  private t0 = performance.now();
  private disposed = false;
  /** Put away by `parkStage` (drawing nothing) until a view takes it again. */
  private parked = false;
  private camListeners = new Set<() => void>();
  private onVis = () => (document.hidden ? cancelAnimationFrame(this.raf) : this.kick());
  /** Called after each drawn frame. */
  onFrame: (() => void) | null = null;
  frames = 0;
  readonly soft: boolean;
  maxFps: number;

  constructor(
    readonly canvas: HTMLCanvasElement,
    o: StageOpts,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !softwareGl(),
      alpha: false,
      powerPreference: 'high-performance',
    });
    // Reading back each shader's log stalls until the GPU has compiled it: only while developing.
    this.renderer.debug.checkShaderErrors = !import.meta.env.PROD;
    // A software renderer (no GPU) gets a lighter stage: 1× pixels, no shadows, 4 fps.
    this.soft = softwareGl();
    // A phone with few cores or little memory: fewer pixels and a smaller shadow map.
    const weak = weakDevice();
    this.renderer.setPixelRatio(
      this.soft ? 1 : Math.min(weak ? 1.5 : 2, window.devicePixelRatio || 1),
    );
    this.renderer.shadowMap.enabled = !this.soft;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.target = o.target.clone();
    this.azimuth = o.azimuth;
    this.elevation = o.elevation;
    this.span = o.span;
    this.maxFps = 60;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

    this.hemi = new THREE.HemisphereLight('#fff4e0', '#4a3b2c', 1.35);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight('#ffffff', 0.25);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight('#fff1d6', 1.9);
    this.sun.castShadow = true;
    const sm = this.soft ? 512 : Math.min(phone() ? 1024 : 4096, o.shadowMap ?? 2048);
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);
    this.setup(o);
    document.addEventListener('visibilitychange', this.onVis);
  }

  /** The view's own settings: the camera, the light, the sky (a new stage, or one taken from `parkStage`). */
  private setup(o: StageOpts) {
    this.opts = o;
    this.maxFps = cpuGl() ? 4 : (o.maxFps ?? 60);
    this.scene.background = new THREE.Color(o.background ?? '#16223d');
    this.scene.fog = null;
    this.target.copy(o.target);
    this.azimuth = o.azimuth;
    this.elevation = o.elevation;
    this.span = o.span;
    this.camera.far = 200;
    this.hemi.color.set('#fff4e0');
    this.hemi.intensity = 1.35;
    this.ambient.intensity = 0.25;
    this.sun.color.set('#fff1d6');
    this.sun.intensity = 1.9;
    const s = o.shadowSize ?? 10;
    const sc = this.sun.shadow.camera;
    sc.left = -s;
    sc.right = s;
    sc.top = s;
    sc.bottom = -s;
    sc.near = 1;
    sc.far = 80;
    sc.updateProjectionMatrix();
    this.sun.position.set(this.target.x - 8, 20, this.target.z + 10);
    this.sun.target.position.copy(this.target);
    this.updateCamera();
  }

  /** Size the drawing buffer to the canvas's CSS box. */
  setSize(w: number, h: number) {
    if (w < 2 || h < 2) return;
    // Sizing the drawing buffer again, even to the size it is, waits for the
    // GPU: a kept stage (`parkStage`) often fits already.
    const c = this.canvas;
    const pr = this.renderer.getPixelRatio();
    if (
      w === this.w &&
      h === this.h &&
      c.width === Math.floor(w * pr) &&
      c.height === Math.floor(h * pr)
    )
      return this.updateCamera();
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.updateCamera();
  }

  /** Points to keep in view at zoom 1 (the span follows them as the camera turns). */
  fit: THREE.Vector3[] | null = null;
  /** The middle of what's fitted (the target can wander off it when zoomed in). */
  fitCenter: THREE.Vector3 | null = null;
  /** Extra room around the fitted points (1 = none). */
  fitMargin = 1.08;
  /** Fraction of the height the picture is moved up by. */
  shiftY = 0;

  private fitSpan() {
    if (!this.fit?.length) return;
    const c = this.camera;
    const r = this.distance;
    const ce = Math.cos(this.elevation);
    c.position.set(
      this.target.x + r * ce * Math.sin(this.azimuth),
      this.target.y + r * Math.sin(this.elevation),
      this.target.z + r * ce * Math.cos(this.azimuth),
    );
    c.lookAt(this.target);
    c.updateMatrixWorld();
    const t = (this.fitCenter ?? this.target).clone().applyMatrix4(c.matrixWorldInverse);
    let mx = 0;
    let my = 0;
    for (const p of this.fit) {
      const v = p.clone().applyMatrix4(c.matrixWorldInverse);
      mx = Math.max(mx, Math.abs(v.x - t.x));
      my = Math.max(my, Math.abs(v.y - t.y));
    }
    const aspect = this.w / this.h;
    // span is the shorter side: portrait → width, landscape → height.
    this.span =
      aspect >= 1
        ? Math.max(2 * my, (2 * mx) / aspect) * this.fitMargin
        : Math.max(2 * mx, 2 * my * aspect) * this.fitMargin;
  }

  updateCamera() {
    this.fitSpan();
    const aspect = this.w / this.h;
    const half = this.span / 2 / this.zoom;
    const hw = aspect >= 1 ? half * aspect : half;
    const hh = aspect >= 1 ? half : half / aspect;
    const c = this.camera;
    c.left = -hw;
    c.right = hw;
    // shiftY moves the picture up (a sheet covers the bottom of the screen).
    c.top = hh - this.shiftY * 2 * hh;
    c.bottom = -hh - this.shiftY * 2 * hh;
    const r = this.distance;
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
    if (
      this.disposed ||
      this.parked ||
      this.raf ||
      (typeof document !== 'undefined' && document.hidden)
    )
      return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private lastDraw = 0;
  private tick = (now: number) => {
    this.raf = 0;
    if (this.disposed || this.parked) return;
    // Frame cap: skip this frame if the last one was drawn too recently.
    const gap = 1000 / this.maxFps - 4;
    if (now - this.lastDraw < gap && !this.dirty) {
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    this.lastDraw = now;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = (now - this.t0) / 1000;
    let busy = false;
    for (const a of this.animators) if (a(t, dt)) busy = true;
    // The first frame waits for its shaders, compiled off the main thread
    // where the GPU can (no stall, no half-drawn first frame).
    if (this.holds > 0) return;
    if (!this.warmed) {
      this.warmed = true;
      void this.warm();
      return;
    }
    if (busy || this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      this.frames++;
      this.onFrame?.();
    }
    if (busy || this.dirty) this.raf = requestAnimationFrame(this.tick);
  };

  private warmed = false;
  private holds = 0;
  /** Counts the views this stage has served (`unpark`). */
  private view = 0;
  /** Draw nothing until `release` (what the first frame needs is still being built). */
  hold() {
    this.holds++;
  }
  release() {
    this.holds = Math.max(0, this.holds - 1);
    this.invalidate();
  }
  /**
   * Compile the scene's shaders without blocking where the GPU allows it
   * (KHR_parallel_shader_compile); nothing is drawn until they're ready
   * (2.5 s at most).
   */
  async warm(): Promise<void> {
    if (this.disposed) return;
    this.holds++;
    // (Parked and taken again meanwhile: the new view's holds start afresh.)
    const view = this.view;
    try {
      await Promise.race([
        this.renderer.compileAsync(this.scene, this.camera),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    } catch {
      /* drawn the ordinary way */
    } finally {
      if (view === this.view) this.holds--;
      this.invalidate();
    }
  }

  /** Draw now (the first frame). */
  renderNow() {
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    this.onFrame?.();
  }

  /**
   * A photo of the view as a JPEG data URL (null when the canvas can't be
   * read). The drawing buffer isn't kept between frames (no
   * preserveDrawingBuffer), so this draws a frame and reads it in the same
   * tick; `maxSide` scales a big (2× DPR) picture down to keep it small.
   */
  snapshot(maxSide = 1080, quality = 0.8): string | null {
    try {
      this.renderer.render(this.scene, this.camera);
      const src = this.canvas;
      const k = Math.min(1, maxSide / Math.max(src.width, src.height));
      const jpeg = (c: HTMLCanvasElement) => {
        const url = c.toDataURL('image/jpeg', quality);
        return url.startsWith('data:image/jpeg') ? url : null;
      };
      if (k >= 1) return jpeg(src);
      const out = document.createElement('canvas');
      out.width = Math.round(src.width * k);
      out.height = Math.round(src.height * k);
      const g = out.getContext('2d');
      if (!g) return null;
      g.drawImage(src, 0, 0, out.width, out.height);
      return jpeg(out);
    } catch {
      return null;
    }
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

  /**
   * Put away for the next view (`parkStage`): nothing drawn; the context,
   * the shaders it compiled and the textures it holds are kept. So is its
   * drawing buffer: sizing it again waits for the GPU (seconds without one),
   * and the next view is the same size on a phone.
   */
  park() {
    this.parked = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.animators.clear();
    this.camListeners.clear();
    this.onFrame = null;
    // What the view left on the stage is its own to dispose of; only the lights stay.
    const own = new Set<THREE.Object3D>([this.hemi, this.ambient, this.sun, this.sun.target]);
    for (const c of [...this.scene.children]) if (!own.has(c)) this.scene.remove(c);
    this.canvas.remove();
  }
  /** Taken again (`unparkStage`) for a view with these settings. */
  unpark(o: StageOpts) {
    this.parked = false;
    this.view++;
    this.zoom = 1;
    this.distance = 60;
    this.fit = null;
    this.fitCenter = null;
    this.fitMargin = 1.08;
    this.shiftY = 0;
    this.frames = 0;
    this.holds = 0;
    // New things on it compile off the main thread again before the first frame.
    this.warmed = false;
    this.dirty = true;
    this.t0 = performance.now();
    this.lastDraw = 0;
    this.setup(o);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVis);
    this.animators.clear();
    this.camListeners.clear();
    // (Parts kept for the next open give up their GPU copies too: the context goes.)
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/**
 * A stage kept between opens of a view (Home3D's: going home again, or the
 * one made ahead while you're on the map): making a WebGL context and
 * compiling its shaders takes a moment on a phone, seconds without a GPU.
 * One per kind of view at most (a phone's memory).
 */
const PARKED = new Map<string, Stage>();

/** Put a view's stage away for the next one of its kind (or dispose of it, if one's kept already). */
export function parkStage(kind: string, s: Stage) {
  const ctx = s.renderer.getContext();
  if (PARKED.has(kind) || ctx.isContextLost()) return s.dispose();
  s.park();
  PARKED.set(kind, s);
}

/** The kept stage of this kind set up for a new view (null when there's none). */
export function unparkStage(kind: string, o: StageOpts): Stage | null {
  const s = PARKED.get(kind);
  if (!s) return null;
  PARKED.delete(kind);
  if (s.renderer.getContext().isContextLost()) {
    s.dispose();
    return null;
  }
  s.unpark(o);
  return s;
}

/** Whether a stage of this kind is kept. */
export const hasParkedStage = (kind: string) => PARKED.has(kind);

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
