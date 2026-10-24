/**
 * The lounge in 3D (lazy-loaded): ./lounge3d.ts on a Stage you can orbit
 * and zoom. The scene around it (./Lounge.tsx) keeps the buttons, the
 * people and the drawn lounge for Lite.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { Stage, gestures } from '../../interiors3d/stage';
import type { AvatarLook } from '../art';
import { LoungeWorld, type LoungeSpot } from './lounge3d';

export interface Lounge3DProps {
  cabin: 'business' | 'first';
  night: boolean;
  livery: string;
  me: AvatarLook;
  crowd: AvatarLook[];
  host: AvatarLook;
  bartender: AvatarLook;
  waiter: AvatarLook;
  spot: LoungeSpot;
  called: boolean;
  onReady?: () => void;
  /** Hands over a camera: a photo of the lounge as it is now. */
  onCamera?: (snap: (() => string | null) | null) => void;
}

export default function Lounge3D(props: Lounge3DProps): ReactElement {
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
        target: new THREE.Vector3(0, 0.4, -0.3),
        span: 11,
        azimuth: 0.32,
        elevation: 0.62,
        minAzimuth: -0.9,
        maxAzimuth: 0.9,
        minElevation: 0.35,
        maxElevation: 1.2,
        background: '#0b1020',
        shadowSize: 9,
        shadowMap: 1024,
        maxFps: 30,
      });
    } catch {
      return;
    }
    const P = live.current;
    const world = new LoungeWorld(stage, {
      cabin: P.cabin,
      night: P.night,
      livery: P.livery,
      me: P.me,
      crowd: P.crowd,
      host: P.host,
      bartender: P.bartender,
      waiter: P.waiter,
    });
    stage.fit = world.fitPoints();
    stage.fitCenter = new THREE.Vector3(0, 0.6, -0.2);
    stage.fitMargin = 0.98;
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
    const off = stage.add((t, dt) => {
      world.setActivity(live.current.spot, t);
      world.setCalled(live.current.called);
      return world.update(t, dt);
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

  return (
    <canvas ref={canvasRef} className="room-3d lounge-3d" aria-hidden="true" data-lounge-3d="" />
  );
}
