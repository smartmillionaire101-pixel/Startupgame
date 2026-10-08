/**
 * Wave 9 §C: a place's room in 3D (lazy-loaded): the room for its kind
 * (./venues.ts), the people in it doing what they do (eating, dancing,
 * typing…), you at the door, and when you do something, Wave 8's act played
 * by a 3D rig (./acts3d.ts) on the script's timeline: walk in, take the
 * station, the loop, the result.
 *
 * The 2D room (../city/PlaceScene.tsx) stays mounted underneath, invisible:
 * its captions, Skip, result card and accessible people list still work.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import type { AvatarLook } from '../city/art';
import { timeline } from '../city/acts/ActStage';
import type { ActId, ActScript } from '../city/acts/types';
import { ENTRANCE, type Activity, type RoomKind, type Slot } from '../city/rooms';
import { makeCharacter, pose, type Character, type PoseId } from './character';
import { Particles } from './fx';
import { disposeTree, mat } from './kit';
import { makeRig, type Rig } from './acts3d';
import { BACK, RD, ROOM_STYLE, RW, buildVenue, vx, vz, type VenueRoom } from './venues';
import { Stage, gestures } from './stage';
import { aimStageSun, interiorLight } from './daylight';
import type { SunState } from '../city/sun';

export interface VenuePerson {
  id: string;
  look: AvatarLook;
  slot: number;
  act: Activity;
  staff: boolean;
}

export interface Venue3DProps {
  room: RoomKind;
  tint: string;
  sign?: string;
  night: boolean;
  slots: Slot[];
  people: VenuePerson[];
  me: AvatarLook;
  act: {
    n: number;
    id: ActId;
    variant: string;
    script: ActScript;
    ended: boolean;
    newLook: AvatarLook;
    extra: (seed: string) => AvatarLook;
  } | null;
  onPerson: (id: string) => void;
  onReady: () => void;
  reduced: boolean;
  /** Wave 12: the city's real sun: the daylight through the windows (or open to the sky). */
  sun?: SunState | null;
}

const POSE: Record<Activity, PoseId> = {
  eating: 'eat',
  drinking: 'drink',
  chatting: 'chat',
  dancing: 'dance',
  typing: 'type',
  ordering: 'chat',
  serving: 'chat',
  workout: 'squat',
  watching: 'sit',
  browsing: 'browse',
  relaxing: 'sit',
  waiting: 'idle',
  presenting: 'present',
  dj: 'dance',
  singing: 'sing',
  playing: 'chat',
  football: 'run',
};

const SEATED: Partial<Record<Activity, PoseId>> = {
  eating: 'eat',
  drinking: 'drink',
  typing: 'type',
  watching: 'sit',
  relaxing: 'sit',
  chatting: 'sit',
  waiting: 'sit',
};

export default function Venue3D(props: Venue3DProps): ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });
  const stageRef = useRef<Stage | null>(null);
  const roomRef = useRef<VenueRoom | null>(null);
  const peopleRef = useRef(new Map<string, { c: Character; p: VenuePerson }>());
  const meRef = useRef<Character | null>(null);
  const rigRef = useRef<{ rig: Rig; n: number; t0: number; ended: boolean } | null>(null);

  const { room, tint, sign, night, slots, people, me, act } = props;

  // ---- Stage and room.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const parent = canvas.parentElement!;
    let stage: Stage;
    try {
      stage = new Stage(canvas, {
        target: new THREE.Vector3(0, 0.6, 0.2),
        span: 12,
        azimuth: 0.3,
        elevation: 0.68,
        minAzimuth: -0.95,
        maxAzimuth: 0.95,
        minElevation: 0.35,
        maxElevation: 1.25,
        background: '#0f172a',
        shadowSize: 9,
        shadowMap: 1024,
        maxFps: 30,
      });
    } catch {
      return;
    }
    stageRef.current = stage;
    const r = parent.getBoundingClientRect();
    stage.setSize(r.width, r.height);
    const ro = new ResizeObserver(() => {
      const b = parent.getBoundingClientRect();
      stage.setSize(b.width, b.height);
    });
    ro.observe(parent);
    stage.fitCenter = new THREE.Vector3(0, 0.6, 0.2);
    stage.fitMargin = 1.02;
    const fit: THREE.Vector3[] = [];
    for (const x of [-RW / 2, RW / 2])
      for (const z of [BACK + 0.6, RD / 2])
        for (const y of [0, 2.2]) fit.push(new THREE.Vector3(x * 0.6, y, z));
    stage.fit = fit;
    stage.sun.position.set(-6, 14, 9);
    stage.sun.target.position.set(0, 0, 0);
    const particles = new Particles();
    stage.scene.add(particles.group);
    stage.scene.userData.particles = particles;
    // Side walls facing the camera drop down.
    const cut = () => {
      const v = roomRef.current;
      if (!v) return;
      const dx = Math.sin(stage.azimuth);
      const dz = Math.cos(stage.azimuth);
      for (const s of v.sides) {
        const c = s.nx * dx + s.nz * dz > 0.25;
        for (const m of s.meshes) m.scale.y = c ? 0.3 : 3.0;
      }
    };
    const offCam = stage.onCamera(cut);
    let sent = false;
    stage.onFrame = () => {
      if (!sent && roomRef.current) {
        sent = true;
        live.current.onReady();
      }
    };
    const offG = gestures(canvas, {
      tap: (x, y) => {
        const objs: THREE.Object3D[] = [];
        for (const { c } of peopleRef.current.values()) if (c.root.visible) objs.push(c.root);
        const hit = stage.pick(x, y, objs);
        const id = hit?.object.userData.character as string | undefined;
        if (id) live.current.onPerson(id);
      },
      orbit: (dx, dy) => stage.orbit(dx, dy),
      zoom: (f) => stage.zoomBy(f),
    });
    return () => {
      ro.disconnect();
      offCam();
      offG();
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const v = buildVenue({ kind: room, tint, sign, slots, night });
    roomRef.current = v;
    stage.scene.add(v.root);
    const st = ROOM_STYLE[room];
    const mood = st.mood ?? 'day';
    stage.hemi.intensity = mood === 'club' ? 0.35 : mood === 'dark' ? 0.25 : night ? 0.8 : 1.25;
    stage.hemi.color.set(mood === 'club' ? '#a78bfa' : '#fff4e0');
    stage.sun.intensity =
      mood === 'club' || mood === 'dark' ? 0.3 : st.open ? 2.2 : night ? 0.8 : 1.6;
    stage.ambient.intensity = mood === 'club' ? 0.15 : 0.25;
    stage.hemi.userData.base = stage.hemi.intensity;
    stage.scene.background = new THREE.Color(st.open ? (night ? '#0b1328' : '#7dd3fc') : '#0f172a');
    stage.updateCamera();
    return () => {
      stage.scene.remove(v.root);
      disposeTree(v.root);
      roomRef.current = null;
    };
  }, [room, tint, sign, slots, night]);

  // ---- Wave 12: daylight from the real sun, in along its bearing (day rooms only:
  // clubs and dark rooms keep their own light).
  const sun = props.sun ?? null;
  useEffect(() => {
    const stage = stageRef.current;
    const st = ROOM_STYLE[room];
    const mood = st.mood ?? 'day';
    if (!stage || !sun || mood === 'club' || mood === 'dark') return;
    const l = interiorLight(sun);
    stage.sun.color.set(l.sunColor);
    stage.sun.intensity = l.sunIntensity * (st.open ? 1.15 : 0.85);
    if (st.open)
      stage.scene.background = new THREE.Color(
        sun.night > 0.5 ? '#0b1328' : sun.golden > 0.3 ? '#f4a96b' : '#7dd3fc',
      );
    aimStageSun(stage, sun, new THREE.Vector3(0, 0, 0), 16);
    stage.invalidate();
  }, [room, tint, sign, slots, night, sun]);

  // ---- People.
  const peopleKey = people.map((p) => `${p.id}:${p.slot}:${p.act}`).join('|');
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const map = new Map<string, { c: Character; p: VenuePerson }>();
    for (const p of people) {
      const c = makeCharacter(p.look, p.id);
      stage.scene.add(c.root);
      if (p.act === 'drinking') {
        const g = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.03, 0.12, 10),
          mat('#f59e0b', { opacity: 0.85 }),
        );
        g.position.y = 0.05;
        c.handR.add(g);
      }
      if (p.act === 'singing') {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat('#3f3f46'));
        m.position.y = 0.1;
        c.handR.add(m);
      }
      map.set(p.id, { c, p });
    }
    peopleRef.current = map;
    stage.invalidate();
    return () => {
      for (const { c } of map.values()) stage.scene.remove(c.root);
    };
    // peopleKey stands for `people`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleKey]);

  // ---- You.
  const meKey = `${me.skin}${me.hair}${me.hairStyle}${me.top}${me.bottom}${me.accessory}`;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const c = makeCharacter(me, 'me');
    meRef.current = c;
    stage.scene.add(c.root);
    return () => {
      stage.scene.remove(c.root);
      meRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey, act?.n]);

  // ---- The act's rig.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !act) return;
    const rig = makeRig(act.id, act.script.station, {
      look: me,
      newLook: act.newLook,
      extra: act.extra,
      tint,
      variant: act.variant,
    });
    stage.scene.add(rig.props);
    rigRef.current = { rig, n: act.n, t0: performance.now(), ended: false };
    return () => {
      stage.scene.remove(rig.props);
      disposeTree(rig.props);
      rigRef.current = null;
      (stage.scene.userData.particles as Particles).clear();
    };
    // A new act is a new n.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act?.n]);
  useEffect(() => {
    if (rigRef.current && act?.ended) rigRef.current.ended = true;
  }, [act?.ended]);

  // ---- The loop.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const particles = stage.scene.userData.particles as Particles;
    const ent = new THREE.Vector3(vx(ENTRANCE.x), 0, vz(ENTRANCE.y));
    let dimNow = 0;
    let focused = false;
    const off = stage.add((t, dt) => {
      const P = live.current;
      const v = roomRef.current;
      const r = rigRef.current;
      const station = r?.rig.station;
      // Everyone in their places.
      for (const { c, p } of peopleRef.current.values()) {
        const s = P.slots[p.slot];
        if (!s) continue;
        const seat = v?.seats.get(p.slot);
        const near = station && Math.hypot(vx(s.x) - station.x, vz(s.y) - station.z) < 1.3;
        c.root.visible = !near;
        if (!c.root.visible) continue;
        if (seat && s.sit) {
          c.root.position.copy(seat.pos);
          c.root.rotation.y = seat.ry;
          pose(c, SEATED[p.act] ?? 'sit', t, { seat: seat.h, phase: p.slot });
        } else {
          c.root.position.set(vx(s.x), 0, vz(s.y));
          const flip = s.flip ? -1 : 1;
          c.root.rotation.y =
            p.act === 'serving' || p.act === 'dj' || p.act === 'presenting'
              ? 0
              : p.act === 'football'
                ? (-flip * Math.PI) / 2
                : flip * 0.5;
          if (p.act === 'football') c.root.position.x += Math.sin(t * 0.8 + p.slot) * 0.8;
          pose(c, POSE[p.act] ?? 'idle', t, { phase: p.slot });
        }
      }
      // You: at the door, or in the act.
      const you = meRef.current;
      let dim = 0;
      if (you) {
        if (!r) {
          you.root.position.copy(ent);
          you.root.rotation.y = Math.PI + 0.6;
          pose(you, 'idle', t);
        } else {
          const tl = timeline(P.act!.script);
          const time = r.ended ? tl.total : performance.now() - r.t0;
          const ms = time - tl.loopAt;
          const k = Math.max(0, Math.min(1, ms / P.act!.script.loopMs));
          dim = r.rig.dim;
          if (time < tl.walk && !P.reduced) {
            const u = time / tl.walk;
            you.root.position.lerpVectors(ent, r.rig.station, u);
            you.root.rotation.y = Math.atan2(r.rig.station.x - ent.x, r.rig.station.z - ent.z);
            pose(you, 'walk', t);
          } else {
            const f = r.rig.update(ms, r.ended ? 1 : k, you, dt, particles) ?? {};
            const seat = f.seat ?? r.rig.seat;
            you.root.position.set(
              r.rig.station.x + (f.dx ?? 0),
              f.dy ?? 0,
              r.rig.station.z + (f.dz ?? 0),
            );
            you.root.rotation.y = f.ry ?? r.rig.ry;
            if (f.pose !== undefined || !('pose' in f))
              pose(you, f.pose ?? r.rig.pose, t, { seat });
          }
        }
      }
      // The camera moves in on your act, and back out after.
      {
        const fc = stage.fitCenter!;
        const want = r && !P.reduced ? r.rig.station : fc;
        const wz = r ? 1.5 : 1;
        const u = P.reduced ? 1 : Math.min(1, dt * 2.5);
        const tx = want.x;
        const tz = want.z + (r ? -0.2 : 0);
        if (r) focused = true;
        if (
          focused &&
          (Math.abs(stage.target.x - tx) > 0.005 ||
            Math.abs(stage.target.z - tz) > 0.005 ||
            Math.abs(stage.zoom - wz) > 0.005)
        ) {
          stage.target.x += (tx - stage.target.x) * u;
          stage.target.z += (tz - stage.target.z) * u;
          stage.zoom += (wz - stage.zoom) * u;
          stage.updateCamera();
        } else if (!r) focused = false;
      }
      // Dim the room for the act; sweep the club lights.
      dimNow += (dim - dimNow) * Math.min(1, dt * 3);
      if (v) {
        for (const l of v.lamps)
          l.intensity = (l.userData.base ??= l.intensity) * (1 - dimNow * 0.85);
        v.movers.forEach((l, i) => {
          l.position.x = Math.sin(t * 0.9 + i * 2) * 4;
          l.position.z = Math.cos(t * 0.7 + i) * 2;
          l.color.setHSL((t * 0.08 + i * 0.33) % 1, 0.9, 0.55);
        });
        for (const d of v.decks) d.rotation.y += dt * 4;
        for (const s of v.screens)
          s.emissiveIntensity =
            ROOM_STYLE[P.room].mood === 'dark' || P.room === 'karaoke'
              ? 0.9 + Math.sin(t * 7) * 0.15
              : 0.6;
      }
      stage.hemi.intensity =
        (stage.hemi.userData.base ??= stage.hemi.intensity) * (1 - dimNow * 0.7);
      particles.update(dt);
      return true;
    });
    return () => {
      off();
    };
  }, []);

  return <canvas ref={canvasRef} className="room-3d" data-room-3d="" aria-hidden="true" />;
}
