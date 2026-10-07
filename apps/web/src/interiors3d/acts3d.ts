/**
 * Wave 9 §C: Wave 8's act scripts (../city/acts/scripts.tsx) played in 3D.
 * The 2D script still sets the timeline (walk in, settle, the loop, the
 * captions, the haircut's swap moment); each rig here builds its props and
 * extras at the script's station and moves them for a moment of the loop:
 * the barber's clippers and the mirror reveal, the waiter's plate, the DJ's
 * beat, the treadmill, the film's flicker…
 */
import * as THREE from 'three';
import type { AvatarLook } from '../city/art';
import type { ActId } from '../city/acts/types';
import { makeCharacter, pose, setHair, type Character, type PoseId } from './character';
import { buildModel, carPaint, chairAt } from './furniture';
import { fx, type Particles } from './fx';
import { Kit, mat } from './kit';
import { BACK, vx, vz } from './venues';

export interface RigCtx {
  look: AvatarLook;
  newLook: AvatarLook;
  extra: (seed: string) => AvatarLook;
  tint: string;
  variant: string;
}

export interface RigFrame {
  pose?: PoseId;
  /** Offsets from the station (metres). */
  dx?: number;
  dy?: number;
  dz?: number;
  ry?: number;
  seat?: number;
}

export interface Rig {
  props: THREE.Group;
  station: THREE.Vector3;
  ry: number;
  pose: PoseId;
  seat: number;
  /** How dark the room gets (0–1). */
  dim: number;
  /** Extras: for picking and cleanup. */
  extras: Character[];
  update(ms: number, k: number, you: Character, dt: number, ps: Particles): RigFrame | void;
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const seg = (k: number, a: number, b: number) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

function extraAt(
  g: THREE.Group,
  ctx: RigCtx,
  seed: string,
  x: number,
  z: number,
  ry = 0,
): Character {
  const c = makeCharacter(ctx.extra(seed), `extra:${seed}`);
  c.root.position.set(x, 0, z);
  c.root.rotation.y = ry;
  g.add(c.root);
  return c;
}

function holdIn(c: Character, obj: THREE.Object3D, hand: 'L' | 'R' = 'R') {
  (hand === 'R' ? c.handR : c.handL).add(obj);
  return obj;
}

const glass = (color = '#f59e0b') => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.03, 0.12, 10),
    mat(color, { opacity: 0.85, rough: 0.1 }),
  );
  m.position.y = 0.05;
  g.add(m);
  return g;
};

export function makeRig(id: ActId, station2d: { x: number; y: number }, ctx: RigCtx): Rig {
  const props = new THREE.Group();
  const sx = vx(station2d.x);
  const sz = vz(station2d.y);
  const station = new THREE.Vector3(sx, 0, sz);
  const extras: Character[] = [];
  const add = (c: Character) => (extras.push(c), c);
  const model = (
    mid: string,
    x: number,
    z: number,
    w: number,
    d: number,
    ry = 0,
    tint?: string,
    tier = 2,
  ) => {
    const m = buildModel(mid, { w, d, tier, tint });
    m.group.position.set(x, 0, z);
    m.group.rotation.y = ry;
    props.add(m.group);
    return m;
  };
  const base: Omit<Rig, 'update'> = {
    props,
    station,
    ry: 0,
    pose: 'stand',
    seat: 0.45,
    dim: 0.25,
    extras,
  };

  switch (id) {
    case 'haircut': {
      // The chair facing a mirror; the barber circles you with the clippers.
      const salon = ctx.variant === 'salon';
      const st = model('salon-station', sx, sz - 0.15, 1.2, 2.2, 0, salon ? '#be185d' : '#7f1d1d');
      void st;
      const barber = add(
        extraAt(props, ctx, salon ? 'stylist' : 'barber', sx + 0.6, sz, -Math.PI / 2),
      );
      const clip = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.14, 0.04),
        mat(salon ? '#f472b6' : '#111827'),
      );
      body.position.y = -0.05;
      clip.add(body);
      holdIn(barber, clip);
      // A cape: a cone over your shoulders.
      const cape = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 0.75, 16, 1, true),
        mat(salon ? '#f9a8d4' : '#1f2937', { side: THREE.DoubleSide }),
      );
      cape.position.y = 0.12;
      let swapped = false;
      let caped = false;
      return {
        ...base,
        ry: Math.PI,
        pose: 'sit',
        seat: 0.55,
        dim: 0.2,
        update(ms, k, you, dt, ps) {
          if (ms < 0) return;
          if (!caped) {
            you.torso.add(cape);
            caped = true;
          }
          cape.visible = k < 0.8;
          // The barber walks round behind and beside you.
          const a = Math.sin(k * Math.PI * 5) * 0.9;
          barber.root.position.set(sx + Math.sin(a) * 0.62, 0, sz + Math.cos(a) * 0.62 - 0.05);
          barber.root.rotation.y = Math.atan2(
            sx - barber.root.position.x,
            sz - barber.root.position.z,
          );
          pose(barber, k > 0.82 ? 'clap' : 'cut', ms / 1000);
          if (k > 0.1 && k < 0.8) {
            const hp = new THREE.Vector3();
            you.head.getWorldPosition(hp);
            fx.hair(ps, hp.add(new THREE.Vector3(0, 0.25, 0)), dt, ctx.look.hair);
          }
          if (!swapped && k >= 0.62) {
            swapped = true;
            setHair(you, ctx.newLook);
          }
          if (k >= 0.62 && k < 0.95) {
            const hp = new THREE.Vector3();
            you.head.getWorldPosition(hp);
            fx.sparkle(ps, hp.add(new THREE.Vector3(0, 0.3, 0)), dt, '#fde047', 10);
          }
          // Mirror check: turn your head.
          if (k > 0.82) you.head.rotation.y = Math.sin(ms / 300) * 0.4;
          return { pose: 'sit', seat: 0.55, ry: Math.PI };
        },
      };
    }
    case 'meal': {
      // A table in front of you; the waiter brings the plate.
      const tk = new Kit();
      chairAt(tk, sx, sz, Math.PI, 'dining', '#5b3a22');
      props.add(tk.build());
      model('restaurant-table', sx, sz - 0.65, 1.0, 0.8, 0, '#f8fafc', 2);
      const waiter = add(extraAt(props, ctx, 'waiter', sx + 3, BACK + 1, -Math.PI / 2));
      const plate = new THREE.Group();
      const pm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.12, 0.025, 20),
        mat('#ffffff', { rough: 0.3 }),
      );
      plate.add(pm);
      const food = new THREE.Group();
      const kind = ctx.variant;
      if (kind === 'cup') {
        const cup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.04, 0.09, 12),
          mat('#f8fafc'),
        );
        cup.position.y = 0.055;
        food.add(cup);
        const coffee = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.045, 0.01, 12),
          mat('#3f2a1c'),
        );
        coffee.position.y = 0.1;
        food.add(coffee);
      } else if (kind === 'laptop') {
        const lap = buildModel('laptop', { w: 0.5, d: 0.4, tier: 2 });
        lap.group.rotation.y = Math.PI;
        food.add(lap.group);
        for (const s of lap.screens) s.emissiveIntensity = 0.9;
      } else {
        const rice = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), mat('#ea580c'));
        rice.scale.set(1, 0.45, 1);
        rice.position.set(-0.03, 0.03, 0);
        food.add(rice);
        const meat = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.05), mat('#7c2d12'));
        meat.position.set(0.06, 0.04, 0.02);
        food.add(meat);
        const greens = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat('#16a34a'));
        greens.position.set(0.04, 0.03, -0.06);
        food.add(greens);
      }
      plate.add(food);
      if (kind !== 'laptop') holdIn(waiter, plate);
      else {
        plate.position.set(sx, 0.77, sz - 0.6);
        props.add(plate);
      }
      let onTable = kind === 'laptop';
      return {
        ...base,
        ry: Math.PI,
        pose: 'sit',
        seat: 0.45,
        dim: 0.22,
        update(ms, k, you, dt, ps) {
          const t = ms / 1000;
          // The waiter: from the back to your table and away.
          const wIn = seg(k, 0.05, 0.3);
          const wOut = seg(k, 0.36, 0.6);
          const tx = sx + 0.7;
          const tz = sz - 0.65;
          if (kind !== 'laptop') {
            const x = wOut > 0 ? lerp(tx, sx + 3, ease(wOut)) : lerp(sx + 3, tx, ease(wIn));
            const z = wOut > 0 ? lerp(tz, BACK + 1, ease(wOut)) : lerp(BACK + 1, tz, ease(wIn));
            waiter.root.position.set(x, 0, z);
            const moving = (wIn > 0 && wIn < 1) || (wOut > 0 && wOut < 1);
            waiter.root.rotation.y =
              wOut > 0
                ? Math.atan2(sx + 3 - tx, BACK + 1 - tz)
                : Math.atan2(tx - (sx + 3), tz - (BACK + 1));
            pose(waiter, moving ? 'walk' : 'chat', t);
            if (!moving) waiter.root.rotation.y = -Math.PI / 2;
            if (!onTable) {
              waiter.armR.rotation.x = -1.4;
              waiter.foreR.rotation.x = -0.2;
            }
            if (!onTable && k >= 0.32) {
              onTable = true;
              waiter.handR.remove(plate);
              plate.position.set(sx, 0.775, sz - 0.5);
              props.add(plate);
            }
          } else pose(waiter, 'idle', t);
          if (onTable && kind === 'plate') {
            const eaten = seg(k, 0.4, 0.92);
            food.scale.setScalar(Math.max(0.05, 1 - eaten * 0.95));
            if (k < 0.6)
              fx.steam(ps, plate.position.clone().add(new THREE.Vector3(0, 0.1, 0)), dt, 5);
          }
          if (onTable && kind === 'cup' && k < 0.85)
            fx.steam(ps, plate.position.clone().add(new THREE.Vector3(0, 0.12, 0)), dt, 4);
          void you;
          return {
            pose:
              kind === 'laptop'
                ? 'type'
                : k > 0.38 && k < 0.92
                  ? kind === 'cup'
                    ? 'drink'
                    : 'eat'
                  : 'sit',
            seat: 0.45,
          };
        },
      };
    }
    case 'drink': {
      // A high table: a friend across from you, glasses up for a clink.
      const tk = new Kit();
      tk.cyl(0.35, 0.35, 0.04, '#1c1917', sx, 1.02, sz - 0.5, { rough: 0.2 });
      tk.cyl(0.04, 0.04, 1.02, '#27272a', sx, 0, sz - 0.5);
      tk.cyl(0.25, 0.25, 0.02, '#27272a', sx, 0, sz - 0.5);
      chairAt(tk, sx, sz, 0, 'bar', ctx.tint);
      props.add(tk.build());
      const friend = add(extraAt(props, ctx, 'friend', sx, sz - 1.05, 0));
      const mine = glass(ctx.variant === 'lounge' ? '#ec4899' : '#f59e0b');
      const theirs = glass('#fde68a');
      holdIn(friend, theirs);
      let held = false;
      return {
        ...base,
        ry: Math.PI,
        pose: 'drink',
        seat: 0.78,
        dim: 0.3,
        update(ms, k, you, dt, ps) {
          const t = ms / 1000;
          if (!held && ms >= 0) {
            holdIn(you, mine);
            held = true;
          }
          const clink = seg(k, 0.45, 0.6);
          pose(friend, 'chat', t, { phase: 2 });
          if (clink > 0 && clink < 1) {
            friend.armR.rotation.x = -1.6;
            friend.foreR.rotation.x = -0.4;
            const glassPos = new THREE.Vector3(sx, 1.55, sz - 0.5);
            if (clink > 0.4 && clink < 0.7) fx.sparkle(ps, glassPos, dt, '#fde047', 30);
            return { pose: 'cheer', seat: 0.78 };
          }
          return { pose: k > 0.1 ? 'drink' : 'sit', seat: 0.78 };
        },
      };
    }
    case 'dance':
    case 'beach': {
      if (id === 'beach' && ctx.variant !== 'party') {
        // A day bed in the sun with a drink.
        model('lounger', sx, sz, 0.8, 2, 0, '#0ea5e9');
        model('parasol', sx + 0.8, sz - 0.6, 1, 1, 0, '#f97316');
        return {
          ...base,
          ry: 0,
          pose: 'lie',
          seat: 0.45,
          dim: 0.1,
          update(_ms, k, you, dt, ps) {
            if (k > 0.5) fx.sparkle(ps, new THREE.Vector3(sx, 1.0, sz), dt, '#fde68a', 2);
            void you;
            return { pose: 'lie', seat: 0.45, dz: 0.2 };
          },
        };
      }
      // You on the floor; a crowd around you; lights.
      const crowd = [
        [-1.0, 0.4],
        [1.0, 0.3],
        [-0.6, -0.9],
        [0.7, -1.0],
        [0, 1.0],
      ].map(([x, z], i) =>
        add(extraAt(props, ctx, `dancer${i}`, sx + x!, sz + z!, (i * 1.3) % Math.PI)),
      );
      const vip = ctx.variant === 'vip';
      if (vip) {
        const tk = new Kit();
        tk.cyl(0.04, 0.05, 0.35, '#14532d', sx + 0.4, 0, sz - 0.4, { rough: 0.2 });
        props.add(tk.build());
      }
      return {
        ...base,
        ry: 0,
        pose: 'dance',
        dim: 0.6,
        update(ms, k, you, dt, ps) {
          const t = ms / 1000;
          crowd.forEach((c, i) => {
            pose(c, k > 0.5 && k < 0.7 ? 'cheer' : 'dance', t, { phase: i * 1.3 });
            c.root.rotation.y += dt * (i % 2 ? 0.6 : -0.4);
          });
          if (vip || (k > 0.5 && k < 0.7))
            fx.sparkle(
              ps,
              new THREE.Vector3(sx, 2.2, sz),
              dt,
              ['#f472b6', '#22d3ee', '#fde047'][Math.floor(t * 3) % 3]!,
              16,
            );
          fx.notes(ps, new THREE.Vector3(vx(180), 1.9, vz(136) + 0.6), dt, '#c4b5fd');
          void you;
          return { pose: k > 0.5 && k < 0.7 ? 'cheer' : 'dance', ry: Math.sin(t * 0.8) * 0.6 };
        },
      };
    }
    case 'workout': {
      const v = ctx.variant;
      const coach = add(extraAt(props, ctx, 'coach', sx + 1.1, sz - 0.2, -Math.PI / 2 - 0.4));
      if (v === 'climb') {
        const k = new Kit();
        k.box(2.6, 3.0, 0.2, '#64748b', sx, 0, BACK + 0.12);
        for (let i = 0; i < 24; i++)
          k.sphere(
            0.06,
            ['#ef4444', '#facc15', '#22c55e', '#3b82f6'][i % 4]!,
            sx - 1.1 + ((i * 37) % 22) / 10,
            0.3 + ((i * 53) % 26) / 10,
            BACK + 0.24,
            { seg: 6 },
          );
        props.add(k.build());
        return {
          ...base,
          station: new THREE.Vector3(sx, 0, BACK + 0.55),
          ry: Math.PI,
          pose: 'stand',
          dim: 0.2,
          update(ms, kk, you) {
            const t = ms / 1000;
            pose(coach, kk > 0.85 ? 'clap' : 'chat', t);
            const up = ease(seg(kk, 0.05, 0.75)) * 1.6;
            pose(you, 'walk', t * 0.5);
            you.armL.rotation.x = -2.6 + Math.sin(t * 3) * 0.3;
            you.armR.rotation.x = -2.6 - Math.sin(t * 3) * 0.3;
            return { pose: undefined, dy: up - (kk > 0.85 ? (kk - 0.85) * 10 : 0) };
          },
        };
      }
      if (v === 'weights') {
        const bells: THREE.Object3D[] = [];
        return {
          ...base,
          ry: 0,
          pose: 'lift',
          dim: 0.2,
          update(ms, kk, you) {
            const t = ms / 1000;
            if (!bells.length && ms >= 0)
              for (const h of ['L', 'R'] as const) {
                const b = new THREE.Group();
                const bar = new THREE.Mesh(
                  new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8),
                  mat('#d4d4d8', { metal: 0.6 }),
                );
                bar.rotation.z = Math.PI / 2;
                b.add(bar);
                for (const s of [-1, 1]) {
                  const w = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10),
                    mat('#18181b'),
                  );
                  w.rotation.z = Math.PI / 2;
                  w.position.x = s * 0.12;
                  b.add(w);
                }
                bells.push(holdIn(you, b, h));
              }
            pose(coach, kk > 0.85 ? 'clap' : 'squat', t, { phase: 1 });
            return { pose: kk > 0.9 ? 'cheer' : 'lift' };
          },
        };
      }
      // Run on a treadmill.
      model('treadmill', sx, sz, 0.8, 1.8, Math.PI);
      return {
        ...base,
        ry: Math.PI,
        pose: 'run',
        dim: 0.2,
        update(ms, kk, you, dt, ps) {
          const t = ms / 1000;
          pose(coach, kk > 0.85 ? 'clap' : 'chat', t);
          if (kk > 0.5) fx.sparkle(ps, new THREE.Vector3(sx, 1.9, sz), dt, '#7dd3fc', 3);
          void you;
          return { pose: kk > 0.9 ? 'cheer' : 'run', dy: 0.17 };
        },
      };
    }
    case 'cinema': {
      model('cinema-seats', sx, sz, 0.7, 0.7, Math.PI, '#991b1b');
      const pop = new THREE.Group();
      const box = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.14, 8), mat('#dc2626'));
      box.position.y = 0.07;
      pop.add(box);
      const corn = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat('#fef3c7'));
      corn.position.y = 0.15;
      pop.add(corn);
      let held = false;
      return {
        ...base,
        ry: Math.PI,
        pose: 'sit',
        seat: 0.48,
        dim: 0.75,
        update(ms, k, you) {
          if (!held && ms >= 0) {
            holdIn(you, pop, 'L');
            held = true;
          }
          return {
            pose: k > 0.3 && k < 0.86 && Math.sin(ms / 900) > 0.6 ? 'eat' : 'sit',
            seat: 0.48,
          };
        },
      };
    }
    case 'karaoke':
    case 'gig': {
      const mic = new THREE.Group();
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 10, 8),
        mat('#3f3f46', { metal: 0.6 }),
      );
      head.position.y = 0.1;
      mic.add(head);
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.012, 0.16, 8),
        mat('#111827'),
      );
      handle.position.y = 0.02;
      mic.add(handle);
      const crowd = [-1.2, -0.4, 0.4, 1.2].map((x, i) =>
        add(
          extraAt(
            props,
            ctx,
            `fan${i}`,
            sx + x,
            sz + (id === 'gig' ? -1.6 : 1.1),
            id === 'gig' ? 0 : Math.PI,
          ),
        ),
      );
      let held = false;
      if (id === 'gig') {
        // The band on the stage at the back.
        const band = [-1.2, 0, 1.2].map((x, i) =>
          add(extraAt(props, ctx, `band${i}`, x + 0.6, BACK + 1.2, 0)),
        );
        for (const b of band) b.root.position.y = 0.45;
        return {
          ...base,
          ry: Math.PI,
          pose: 'cheer',
          dim: 0.55,
          update(ms, k, you, dt, ps) {
            const t = ms / 1000;
            band.forEach((b, i) => pose(b, i === 1 ? 'sing' : 'dance', t, { phase: i }));
            crowd.forEach((c, i) => pose(c, k > 0.5 ? 'cheer' : 'dance', t, { phase: i * 0.8 }));
            fx.notes(ps, new THREE.Vector3(0.6, 2.4, BACK + 1.2), dt);
            void you;
            return { pose: k > 0.4 ? 'cheer' : 'dance' };
          },
        };
      }
      return {
        ...base,
        ry: 0,
        pose: 'sing',
        dim: 0.45,
        update(ms, k, you, dt, ps) {
          const t = ms / 1000;
          if (!held && ms >= 0) {
            holdIn(you, mic);
            held = true;
          }
          crowd.forEach((c, i) => pose(c, k > 0.55 ? 'clap' : 'idle', t, { phase: i }));
          fx.notes(ps, new THREE.Vector3(sx, 2.0, sz), dt);
          if (k > 0.88) fx.sparkle(ps, new THREE.Vector3(sx, 2.0, sz), dt, '#fde047', 20);
          void you;
          return { pose: k > 0.88 ? 'cheer' : 'sing' };
        },
      };
    }
    case 'spa': {
      model('massage-table', sx, sz - 0.1, 0.8, 2, 0);
      const therapist = add(extraAt(props, ctx, 'therapist', sx + 0.65, sz - 0.1, -Math.PI / 2));
      return {
        ...base,
        ry: 0,
        pose: 'lie',
        seat: 0.72,
        dim: 0.4,
        update(ms, k, you, dt, ps) {
          const t = ms / 1000;
          pose(therapist, 'cut', t);
          therapist.torso.rotation.x = 0.4;
          fx.steam(ps, new THREE.Vector3(sx - 0.6, 0.4, sz + 1), dt, 4);
          if (k > 0.75) fx.sparkle(ps, new THREE.Vector3(sx, 1.0, sz), dt, '#fca5a5', 3);
          void you;
          return { pose: 'lie', seat: 0.72, dz: 0.2 };
        },
      };
    }
    case 'football': {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mat('#f8fafc'));
      ball.castShadow = true;
      props.add(ball);
      const mates = [
        [1.6, -1.2],
        [2.6, 0.8],
        [-2.2, -1.6],
      ].map(([x, z], i) => add(extraAt(props, ctx, `player${i}`, sx + x!, sz + z!, -Math.PI / 2)));
      const keeper = add(extraAt(props, ctx, 'keeper', vx(0) + 0.9, 0, Math.PI / 2));
      return {
        ...base,
        ry: -Math.PI / 2,
        pose: 'run',
        dim: 0.15,
        update(ms, k, you, dt, ps) {
          const t = ms / 1000;
          // Pass in, dribble, shoot at 0.6, goal at 0.72.
          const shoot = seg(k, 0.6, 0.72);
          const bx =
            shoot > 0
              ? lerp(sx - 0.4, vx(0) + 0.4, ease(shoot))
              : lerp(sx + 1.6, sx - 0.4, ease(seg(k, 0.05, 0.55)));
          const bz = shoot > 0 ? lerp(sz, 0.2, shoot) : lerp(sz - 1.2, sz, seg(k, 0.05, 0.3));
          ball.position.set(bx, 0.11 + (shoot > 0 ? Math.sin(shoot * Math.PI) * 0.6 : 0), bz);
          ball.rotation.z += dt * 8;
          mates.forEach((m, i) => {
            pose(m, k > 0.72 ? 'cheer' : 'run', t, { phase: i });
            m.root.position.x -= k < 0.6 ? dt * 0.4 : 0;
          });
          keeper.root.position.z = shoot > 0 ? lerp(0, -0.9, shoot) : Math.sin(t) * 0.4;
          pose(keeper, shoot > 0.5 ? 'cheer' : 'idle', t);
          if (k > 0.72 && k < 0.95)
            fx.sparkle(
              ps,
              new THREE.Vector3(vx(0) + 0.6, 1.4, 0.2),
              dt,
              ['#facc15', '#22c55e', '#f472b6'][Math.floor(t * 6) % 3]!,
              40,
            );
          const run = seg(k, 0.05, 0.6);
          void you;
          return {
            pose: k >= 0.58 && k < 0.66 ? 'kick' : k > 0.72 ? 'cheer' : 'run',
            dx: -run * 0.4,
          };
        },
      };
    }
    case 'arcade': {
      if (ctx.variant === 'bowling') {
        const k = new Kit();
        k.box(1.1, 0.04, 6, '#d4a373', sx, 0, sz - 3.3, { rough: 0.3 });
        props.add(k.build());
        const pins: THREE.Mesh[] = [];
        for (let r = 0; r < 4; r++)
          for (let c = 0; c <= r; c++) {
            const p = new THREE.Mesh(
              new THREE.CylinderGeometry(0.03, 0.05, 0.28, 10),
              mat('#f8fafc'),
            );
            p.position.set(sx + (c - r / 2) * 0.14, 0.18, sz - 5.6 - r * 0.13);
            p.castShadow = true;
            props.add(p);
            pins.push(p);
          }
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 14, 10),
          mat('#1d4ed8', { rough: 0.2 }),
        );
        props.add(ball);
        return {
          ...base,
          ry: Math.PI,
          pose: 'stand',
          dim: 0.45,
          update(_ms, kk, you, dt, ps) {
            const roll = seg(kk, 0.15, 0.6);
            ball.position.set(sx, 0.13, lerp(sz - 0.4, sz - 5.6, roll));
            if (kk > 0.6)
              pins.forEach((p, i) => {
                p.rotation.x = Math.min(1.5, (kk - 0.6) * 8 * (1 + (i % 3) * 0.3));
                p.rotation.z = (i % 2 ? 1 : -1) * Math.min(0.8, (kk - 0.6) * 4);
              });
            if (kk > 0.6 && kk < 0.75)
              fx.sparkle(ps, new THREE.Vector3(sx, 0.8, sz - 5.8), dt, '#fde047', 30);
            void you;
            return { pose: kk < 0.15 ? 'lift' : kk > 0.7 ? 'cheer' : 'stand' };
          },
        };
      }
      const m = model('arcade', sx, sz - 0.85, 0.8, 0.8, 0, '#7c3aed');
      return {
        ...base,
        ry: Math.PI,
        pose: 'type',
        dim: 0.45,
        update(ms, k, you, dt, ps) {
          for (const s of m.screens) s.emissiveIntensity = 0.8 + Math.sin(ms / 70) * 0.3;
          if (k > 0.7) fx.sparkle(ps, new THREE.Vector3(sx, 2.0, sz - 0.8), dt, '#a78bfa', 12);
          const t = ms / 1000;
          pose(you, 'stand', t);
          you.armL.rotation.x = you.armR.rotation.x = -0.9;
          you.foreL.rotation.x = -0.4 + Math.sin(t * 16) * 0.12;
          you.foreR.rotation.x = -0.4 + Math.cos(t * 13) * 0.12;
          return { pose: undefined };
        },
      };
    }
    case 'gallery': {
      const pts = [vx(82), vx(180), vx(278)];
      return {
        ...base,
        ry: Math.PI,
        pose: 'browse',
        dim: 0.2,
        update(_ms, k, you, dt, ps) {
          const i = Math.min(2, Math.floor(k * 3));
          const u = seg(k * 3 - i, 0.7, 1);
          const x = lerp(pts[i]!, pts[Math.min(2, i + 1)]!, ease(u)) - sx;
          if (ctx.variant === 'opening' && k > 0.5)
            fx.sparkle(ps, new THREE.Vector3(sx + x, 2.2, sz), dt, '#fde68a', 4);
          void you;
          return { pose: u > 0 && u < 1 ? 'walk' : 'browse', dx: x, dz: -1.2, ry: Math.PI };
        },
      };
    }
    case 'showroom': {
      const v = ctx.variant;
      if (v === 'car') {
        const m = buildModel('car:luxury', { w: 2, d: 4.5, tier: 1, tint: carPaint('luxury') });
        m.group.position.set(sx + 0.38, 0, sz - 0.1);
        m.group.rotation.y = 0;
        props.add(m.group);
        const dealer = add(extraAt(props, ctx, 'dealer', sx - 1.0, sz + 0.6, Math.PI / 2));
        return {
          ...base,
          ry: 0,
          pose: 'sit',
          seat: 0.55,
          dim: 0.25,
          update(ms, k, you, dt, ps) {
            pose(dealer, 'present', ms / 1000);
            if (k > 0.6) fx.sparkle(ps, new THREE.Vector3(sx + 0.4, 1.6, sz), dt, '#fde047', 6);
            void you;
            return { pose: 'sit', seat: 0.55, ry: 0 };
          },
        };
      }
      if (v === 'tv') {
        const m = model('tv', sx, sz - 1.4, 2.2, 0.6, 0, undefined, 3);
        return {
          ...base,
          ry: Math.PI,
          pose: 'stand',
          dim: 0.3,
          update(ms) {
            for (const s of m.screens) s.emissiveIntensity = 0.9 + Math.sin(ms / 90) * 0.2;
            return { pose: 'browse' };
          },
        };
      }
      model('sofa', sx, sz, 2.2, 0.9, Math.PI, '#0f766e', 3);
      return {
        ...base,
        ry: Math.PI,
        pose: 'sit',
        seat: 0.5,
        update: () => ({ pose: 'sit', seat: 0.5 }),
      };
    }
    default: {
      // A counter: you and someone behind it.
      model('counter', sx, sz - 0.9, 2, 0.7, 0, ctx.tint);
      const clerk = add(extraAt(props, ctx, 'clerk', sx, sz - 1.6, 0));
      return {
        ...base,
        ry: Math.PI,
        pose: 'chat',
        update(ms, k) {
          pose(clerk, 'chat', ms / 1000, { phase: 1 });
          return { pose: k > 0.8 ? 'wave' : 'chat' };
        },
      };
    }
  }
}

/** A mirror check needs a mirror: the reveal looks at your face from the front. */
export const RIG_IDS: ActId[] = [
  'haircut',
  'meal',
  'drink',
  'dance',
  'workout',
  'cinema',
  'karaoke',
  'spa',
  'football',
  'arcade',
  'gallery',
  'gig',
  'beach',
  'showroom',
  'generic',
];
