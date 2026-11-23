/**
 * The terminal in 3D (lazy-loaded): ./terminal3d.ts on a Stage, seen through
 * a perspective eye. One canvas for a whole trip through the airport: the
 * zone changes as you go (the camera glides on), the WebGL context stays.
 * The scenes around it (../airport/AirportScene, ../airport/arrivals) keep
 * every button and caption in the DOM, and the drawn views for Lite or when
 * WebGL fails (`onFail`).
 */
import { useEffect, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { Stage } from '../../interiors3d/stage';
import { TerminalWorld, type TerminalOpts, type Zone } from './terminal3d';

export interface Terminal3DProps {
  opts: TerminalOpts;
  zone: Zone;
  /** The zone's moment is playing (a bag onto the belt, through the arch, up the bridge). */
  playing: boolean;
  onReady?: () => void;
  /** No WebGL here: the caller draws the 2D view instead. */
  onFail?: () => void;
}

export default function Terminal3D(props: Terminal3DProps): ReactElement {
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
        target: new THREE.Vector3(0, 1, 0),
        span: 10,
        azimuth: 0,
        elevation: 0.3,
        background: '#a9d3ee',
        shadowSize: 9,
        shadowMap: 1024,
        maxFps: 30,
      });
    } catch {
      live.current.onFail?.();
      return;
    }
    let world: TerminalWorld;
    try {
      world = new TerminalWorld(stage, live.current.opts, live.current.zone);
    } catch {
      stage.dispose();
      live.current.onFail?.();
      return;
    }
    const mark = () => {
      canvas.dataset.people = String(world.peopleCount);
      canvas.dataset.crowd = world.crowdReady ? 'ready' : 'baking';
      canvas.dataset.zone = live.current.zone;
    };
    world.onChange = mark;
    mark();
    // The first frame waits (a moment at most) for the travellers to be baked.
    stage.hold();
    let held = true;
    const release = () => {
      if (!held) return;
      held = false;
      stage.release();
    };
    const holdTimer = window.setTimeout(release, 3500);
    const prev = world.onChange;
    world.onChange = () => {
      prev?.();
      if (world.crowdReady) release();
    };
    const size = () => {
      const r = parent.getBoundingClientRect();
      stage.setSize(r.width, r.height);
      world.setAspect(r.width / Math.max(1, r.height));
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(parent);
    let sent = false;
    stage.onFrame = () => {
      if (sent) return;
      sent = true;
      canvas.dataset.ready = 'yes';
      live.current.onReady?.();
    };
    const off = stage.add((t, dt) => {
      world.setZone(live.current.zone, live.current.playing, t);
      return world.update(t, dt);
    });
    const lost = (e: Event) => {
      e.preventDefault();
      live.current.onFail?.();
    };
    canvas.addEventListener('webglcontextlost', lost);
    return () => {
      window.clearTimeout(holdTimer);
      canvas.removeEventListener('webglcontextlost', lost);
      off();
      ro.disconnect();
      world.dispose();
      stage.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="terminal-3d"
      aria-hidden="true"
      data-terminal-3d={props.opts.mode}
    />
  );
}
