/**
 * The suite in 3D (lazy-loaded): ./suite3d.ts on a Stage you can orbit and
 * zoom; the camera follows you (to the bar and the spa and back). The
 * flight's own sky colours the windows.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { Stage, gestures } from '../../interiors3d/stage';
import type { AvatarLook } from '../art';
import { SuiteWorld, type SuiteState } from './suite3d';

export interface Suite3DProps {
  cabin: 'business' | 'first';
  me: AvatarLook;
  crew: AvatarLook;
  others: AvatarLook[];
  zenith: string;
  horizon: string;
  night: boolean;
  state: SuiteState;
  onReady?: () => void;
  onCamera?: (snap: (() => string | null) | null) => void;
}

export default function Suite3D(props: Suite3DProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const parent = canvas.parentElement!;
    let stage: Stage;
    try {
      stage = new Stage(canvas, {
        target: new THREE.Vector3(0.1, 0.5, 0),
        span: 4,
        azimuth: 0.9,
        elevation: 0.72,
        minAzimuth: 0.2,
        maxAzimuth: 1.9,
        minElevation: 0.4,
        maxElevation: 1.3,
        background: '#111827',
        shadowSize: 6,
        shadowMap: 1024,
        maxFps: 30,
      });
    } catch {
      return;
    }
    const P = live.current;
    const world = new SuiteWorld(stage, {
      cabin: P.cabin,
      me: P.me,
      crew: P.crew,
      others: P.others,
      zenith: P.zenith,
      horizon: P.horizon,
      night: P.night,
    });
    world.set(P.state);
    stage.fit = world.fitPoints();
    stage.fitCenter = new THREE.Vector3(0.2, 0.6, 0);
    stage.fitMargin = 1.25;
    const size = () => {
      const r = parent.getBoundingClientRect();
      stage.setSize(r.width, r.height);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(parent);
    let sent = false;
    stage.onFrame = () => {
      if (sent) return;
      sent = true;
      live.current.onReady?.();
    };
    let last: SuiteState | null = null;
    const off = stage.add((t, dt) => {
      const s = live.current.state;
      if (s !== last) {
        last = s;
        world.set(s);
      }
      const busy = world.update(t, dt);
      const f = world.focus();
      stage.lookAt(f.x * 0.8 + 0.1, f.z * 0.85, Math.min(1, dt * 2.5));
      return busy;
    });
    const offG = gestures(canvas, {
      tap: () => {},
      orbit: (dx, dy) => stage.orbit(dx, dy),
      zoom: (f) => stage.zoomBy(f),
    });
    live.current.onCamera?.(() => stage.snapshot());
    return () => {
      live.current.onCamera?.(null);
      off();
      offG();
      ro.disconnect();
      world.dispose();
      stage.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="suite-3d" aria-hidden="true" data-suite-3d="" />;
}
