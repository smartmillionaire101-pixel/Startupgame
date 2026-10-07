/**
 * Wave 9 §C: a tech event's hall in 3D (lazy-loaded). The stage with the big
 * screen and a speaker at the lectern, rows of people listening; then the
 * networking (everyone up and chatting), and on demo day you on the stage
 * while the hall claps. The 2D scene keeps the bubbles, buttons and result.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { AvatarLook } from '../city/art';
import { makeCharacter, pose, type Character } from './character';
import { buildModel } from './furniture';
import { Particles, fx } from './fx';
import { disposeTree } from './kit';
import { Stage, gestures } from './stage';
import { BACK, RD, RW, buildVenue } from './venues';

export interface TechEvent3DProps {
  phase: 'intro' | 'talk' | 'network' | 'pitch' | 'done';
  crowd: AvatarLook[];
  /** Your seat in the crowd. */
  you: number;
  me: AvatarLook;
  speaker: AvatarLook;
  onReady: () => void;
}

const ROWS = 3;
const PER_ROW = 6;
const seatPos = (n: number) => {
  const row = Math.floor(n / PER_ROW);
  const i = n % PER_ROW;
  return new THREE.Vector3(-3.6 + i * 1.45 + (row % 2) * 0.35, 0, 0.2 + row * 1.05);
};
const minglePos = (n: number) =>
  new THREE.Vector3(-4.6 + ((n * 67) % 90) / 10, 0, -0.4 + ((n * 29) % 34) / 10);

export default function TechEvent3D(props: TechEvent3DProps) {
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
        target: new THREE.Vector3(0, 0.6, -0.2),
        span: 11,
        azimuth: 0.15,
        elevation: 0.62,
        minAzimuth: -0.8,
        maxAzimuth: 0.8,
        background: '#0b1020',
        shadowSize: 9,
        shadowMap: 1024,
        maxFps: 30,
      });
    } catch {
      return;
    }
    const r = parent.getBoundingClientRect();
    stage.setSize(r.width, r.height);
    const ro = new ResizeObserver(() => {
      const b = parent.getBoundingClientRect();
      stage.setSize(b.width, b.height);
    });
    ro.observe(parent);
    stage.fitCenter = new THREE.Vector3(0, 0.6, -0.2);
    stage.fit = [-RW / 2, RW / 2].flatMap((x) =>
      [BACK + 0.4, RD / 2].map((z) => new THREE.Vector3(x * 0.7, 0, z)),
    );
    const hall = buildVenue({ kind: 'eventhall', tint: '#f59e0b', slots: [], night: true });
    stage.scene.add(hall.root);
    for (const m of hall.screens) m.emissiveIntensity = 0.9;
    stage.hemi.intensity = 0.7;
    stage.sun.intensity = 0.8;
    // Chairs in rows.
    for (let n = 0; n < ROWS * PER_ROW; n++) {
      const m = buildModel('cinema-seats', { w: 0.7, d: 0.7, tier: 1, tint: '#334155' });
      const p = seatPos(n);
      m.group.position.copy(p);
      m.group.rotation.y = Math.PI;
      stage.scene.add(m.group);
    }
    const spot = new THREE.SpotLight('#fff1c4', 30, 14, 0.5, 0.6, 1.2);
    spot.position.set(0.8, 6, 1.5);
    spot.target.position.set(1.2, 0, BACK + 1.2);
    stage.scene.add(spot, spot.target);
    const crowd: Character[] = live.current.crowd.map((look, n) => {
      const c = makeCharacter(
        n === live.current.you ? live.current.me : look,
        n === live.current.you ? 'me' : `crowd:${n}`,
      );
      stage.scene.add(c.root);
      return c;
    });
    const speaker = makeCharacter(live.current.speaker, 'speaker');
    stage.scene.add(speaker.root);
    const particles = new Particles();
    stage.scene.add(particles.group);
    let sent = false;
    stage.onFrame = () => {
      if (!sent) {
        sent = true;
        live.current.onReady();
      }
    };
    const lectern = new THREE.Vector3(1.68, 0.45, BACK + 1.2);
    const off = stage.add((t, dt) => {
      const P = live.current;
      const net = P.phase === 'network';
      const pitch = P.phase === 'pitch';
      crowd.forEach((c, n) => {
        const you = n === P.you;
        if (you && pitch) {
          c.root.position.set(lectern.x - 0.6, 0.45, lectern.z + 0.1);
          c.root.rotation.y = 0;
          pose(c, 'present', t);
          return;
        }
        if (net) {
          c.root.position.copy(minglePos(n));
          c.root.rotation.y = n % 2 ? 0.8 : -2.3;
          pose(c, 'chat', t, { phase: n });
        } else {
          c.root.position.copy(seatPos(n));
          c.root.rotation.y = Math.PI;
          pose(c, pitch && !you ? 'clap' : 'sit', t, { seat: 0.48, phase: n });
          if (pitch) {
            c.body.position.y = 0.48 - 0.82 + 0.04;
            c.thighL.rotation.x = c.thighR.rotation.x = -Math.PI / 2 + 0.08;
            c.shinL.rotation.x = c.shinR.rotation.x = Math.PI / 2 - 0.08;
          }
        }
      });
      speaker.root.visible = !pitch;
      speaker.root.position.set(lectern.x + 0.05, 0.45, lectern.z - 0.35);
      speaker.root.rotation.y = 0;
      pose(speaker, 'present', t);
      if (pitch)
        fx.sparkle(
          particles,
          new THREE.Vector3(lectern.x - 0.6, 2.3, lectern.z),
          dt,
          '#fde047',
          10,
        );
      particles.update(dt);
      return true;
    });
    const offG = gestures(canvas, {
      tap: () => {},
      orbit: (dx, dy) => stage.orbit(dx, dy),
      zoom: (f) => stage.zoomBy(f),
    });
    return () => {
      off();
      offG();
      ro.disconnect();
      disposeTree(hall.root);
      stage.dispose();
    };
  }, []);
  return <canvas ref={canvasRef} className="room-3d" aria-hidden="true" data-tech-3d="" />;
}
