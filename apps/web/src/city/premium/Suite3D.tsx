/**
 * The cabin in 3D (lazy-loaded): ./suite3d.ts seen through a perspective
 * eye inside the plane. Drag to look round, pinch to come closer; the eye
 * follows you (down the aisle to the bar and the spa and back). Outside,
 * the same gestures orbit the plane.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { Stage, gestures } from '../../interiors3d/stage';
import type { AvatarLook } from '../art';
import type { SkyColours } from './outside';
import type { FlightStage } from './premium';
import { SuiteWorld, type SuiteState, type SuiteStatus } from './suite3d';

export interface Suite3DProps {
  cabin: 'business' | 'first';
  me: AvatarLook;
  crew: AvatarLook;
  others: AvatarLook[];
  skies: Record<FlightStage, SkyColours>;
  livery?: string;
  state: SuiteState;
  onReady?: () => void;
  onStatus?: (s: SuiteStatus) => void;
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
        target: new THREE.Vector3(0, 0.8, 0),
        span: 4,
        azimuth: 0.9,
        elevation: 0.7,
        background: '#1a1a1a',
        shadowSize: 6,
        shadowMap: 512,
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
      skies: P.skies,
      livery: P.livery,
    });
    world.onStatus = (s) => live.current.onStatus?.(s);
    world.set(P.state);
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
      return world.update(t, dt);
    });
    const offG = gestures(canvas, {
      tap: () => {},
      orbit: (dx, dy) => world.orbit(dx, dy),
      zoom: (f) => world.zoom(f),
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
