/**
 * Player feedback: "I see the hotel room is now on top of the building so
 * when I spin round my room is just at the top." A hotel room is one room
 * partway up the hotel's tower, not a roof:
 *
 * - your floor of the tower round the room: the corridor along your door
 *   (carpet, the neighbours' numbered doors, a "Do not disturb" on some,
 *   wall lights), the lift lobby (an ice machine in a budget hotel), the
 *   tower's outer wall with its windows;
 * - the neighbours' rooms either side and across the corridor, closed
 *   (player feedback: "people should have privacy in their rooms"): solid
 *   blocks with their ceilings on, only their doors on the corridor and
 *   their curtained windows outside. A friend from your holiday next door
 *   has their name over the door and on the mat (../home/hotel.ts
 *   `hotelDoors`);
 * - the floors above, cut away like a doll's house: the tower's walls rise
 *   past your floor (windows, floor lines, the rooms' partitions, the hotel's
 *   name on the roof) on the sides away from the camera and step aside on the
 *   sides towards it, so nothing hangs over the room;
 * - the floors below, down to the street, and the city round it
 *   (./surroundings.ts `cityBelow`), its towers rising past yours.
 *
 * Every wall of your floor (and the floors above) belongs to one of four
 * sides, cut away like the room's own outer walls (./house.ts `cutWalls`):
 * the walls are unit-high merged meshes the cut scales, the doors, lights,
 * windows and the floors above hide with them. Low poly and merged (a few
 * meshes per side), like the rest of the surroundings. World units as in
 * ./house.ts: the room's floor at y = 0, tile (x, y) at x..x+1, z..z+1.
 */
import * as THREE from 'three';
import type { HotelTier } from '../city/travel';
import {
  HOTEL_CORRIDOR,
  HOTEL_LOBBY,
  hotelDoors,
  hotelRow,
  type HotelDoor,
  type NeighbourSlot,
} from '../home/hotel';
import { buildModel } from './furniture';
import { Kit, mat, tone, type PartOpts } from './kit';
import { canvasTex, cityBelow, towerTexture, type Surroundings } from './surroundings';

/** Floor to floor in the hotel's tower (metres). */
export const HOTEL_STOREY = 3.2;
/** Floors above yours, up to the roof. */
const FLOORS_ABOVE = 4;
const T = 0.16;
const O2 = T / 2;
const WALL_H = 2.6;
const CORR = HOTEL_CORRIDOR;
const ACROSS = 6;
const LOBBY = HOTEL_LOBBY;
/** A closed room's ceiling, seen from above, and its panel lines. */
const CEILING = '#cbc3b6';
const CEILING_LINE = '#b9b0a2';
const ROOM_GREEN = '#23946e';

interface Style {
  facade: string;
  trim: string;
  carpet: string;
  pattern: string;
  corridor: string;
  door: string;
  curtain: string;
  sign: { bg: string; fg: string; font: string };
}

const STYLE: Record<HotelTier, Style> = {
  budget: {
    facade: '#e6dfd2',
    trim: '#b8b0a2',
    carpet: '#55606e',
    pattern: '#6f7c8c',
    corridor: '#ebe2d2',
    door: '#8a6a4a',
    curtain: '#c9cfd6',
    sign: { bg: '#c62828', fg: '#ffffff', font: '800 150px system-ui, sans-serif' },
  },
  business: {
    facade: '#cdd6df',
    trim: '#8995a2',
    carpet: '#2c3e5a',
    pattern: '#4b6590',
    corridor: '#e7e2d8',
    door: '#5a4030',
    curtain: '#d8cfc0',
    sign: { bg: '#16324f', fg: '#ffffff', font: '600 140px system-ui, sans-serif' },
  },
  luxury: {
    facade: '#d8caab',
    trim: '#a8946b',
    carpet: '#6e2632',
    pattern: '#c9a24a',
    corridor: '#f0e7d3',
    door: '#3b2618',
    curtain: '#d9c3a0',
    sign: { bg: '#141414', fg: '#e0bd62', font: 'italic 600 140px Georgia, serif' },
  },
};

export interface TowerSide {
  /** Outward normal on the floor plane (as ./house.ts's sides). */
  n: THREE.Vector2;
  /** Unit-high walls (the cut scales them), their caps (moved to the top), what hides with them. */
  walls: THREE.Group;
  caps: THREE.Group;
  extras: THREE.Group;
}

export interface HotelTower extends Surroundings {
  sides: TowerSide[];
}

/** The corridor's carpet: a border and a repeating motif. */
const carpetTexture = (s: Style) =>
  canvasTex(`hotel-carpet:${s.carpet}`, 128, (g) => {
    g.fillStyle = s.carpet;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = s.pattern;
    g.lineWidth = 5;
    g.strokeRect(10, 10, 108, 108);
    g.fillStyle = s.pattern;
    g.beginPath();
    g.moveTo(64, 34);
    g.lineTo(94, 64);
    g.lineTo(64, 94);
    g.lineTo(34, 64);
    g.closePath();
    g.fill();
  });

/** A door's number on a small brass (or steel) plate. */
const plaqueTexture = (n: number, s: Style) =>
  canvasTex(`hotel-plaque:${n}:${s.sign.bg}`, 64, (g) => {
    g.fillStyle = s.sign.bg;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = s.sign.fg;
    g.font = 'bold 26px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 32, 34, 60);
  });

/** "Do not disturb", on a door hanger. */
const dndTexture = () =>
  canvasTex('hotel-dnd', 64, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#b91c1c';
    g.font = 'bold 13px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [i, w] of ['DO', 'NOT', 'DISTURB'].entries()) g.fillText(w, 32, 16 + i * 16, 60);
  });

const plates = new Map<string, THREE.CanvasTexture>();
/** A friend's name and room over their door. */
function nameplateTexture(name: string, n: number) {
  const id = `${name}|${n}`;
  let t = plates.get(id);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0f3d2e';
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = '#e0bd62';
    g.lineWidth = 4;
    g.strokeRect(4, 4, 248, 56);
    g.fillStyle = '#ffffff';
    g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`${name.split(/\s+/)[0]} · ${n}`, 128, 34, 236);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    plates.set(id, t);
  }
  return t;
}

const signCache = new Map<string, THREE.CanvasTexture>();
/** The hotel's name in its tier's style, `vertical` stacked letters for a blade sign. */
function nameTexture(name: string, s: Style, vertical: boolean) {
  const id = `${name}|${s.sign.bg}|${vertical ? 1 : 0}`;
  let t = signCache.get(id);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = vertical ? 256 : 1024;
    c.height = vertical ? 1024 : 256;
    const g = c.getContext('2d')!;
    g.fillStyle = s.sign.bg;
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = s.sign.fg;
    g.lineWidth = 8;
    g.strokeRect(14, 14, c.width - 28, c.height - 28);
    g.fillStyle = s.sign.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (vertical) {
      const word = (name.split(/\s+/).find((w) => w.length > 2 && !/^the$/i.test(w)) ?? name)
        .slice(0, 7)
        .toUpperCase();
      const step = (c.height - 80) / Math.max(4, word.length);
      g.font = s.sign.font.replace(/\d+px/, `${Math.round(Math.min(step * 0.9, 190))}px`);
      [...word].forEach((ch, i) =>
        g.fillText(
          ch,
          c.width / 2,
          40 + step * (i + 0.5) + (c.height - 80 - step * word.length) / 2,
        ),
      );
    } else {
      g.font = s.sign.font;
      g.fillText(name, c.width / 2, c.height / 2 + 6, c.width - 70);
    }
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    signCache.set(id, t);
  }
  return t;
}

export function hotelTower(o: {
  night: boolean;
  groundY: number;
  /** The room (tiles): W along x, H deep; the window wall at z = 0, the door at z = H. */
  W: number;
  H: number;
  doorX: number;
  tier: HotelTier;
  name: string;
  floor: number;
  /** Your room's number, and the doors either side (friends' named). */
  room?: number;
  doors?: HotelDoor[];
}): HotelTower {
  const st = STYLE[o.tier];
  const { W, H } = o;
  const night = o.night;
  const group = new THREE.Group();
  // Your row: two neighbours on the left; on the right, the room next door,
  // the lift lobby, another room (../home/hotel.ts `hotelRow`).
  const row = hotelRow({ w: W });
  const X0 = row.x0;
  const X1 = row.x1;
  const Z1 = H + CORR + ACROSS;
  const S = HOTEL_STOREY;
  const top = (FLOORS_ABOVE + 1) * S;
  const ours = o.room ?? o.floor * 100 + 16;
  const doors = new Map((o.doors ?? hotelDoors(ours)).map((d) => [d.slot, d] as const));
  const glass = {
    emissive: night ? '#ffcf7a' : '#7fbfe0',
    emissiveIntensity: night ? 0.5 : 0.22,
    rough: 0.08,
  };
  // The neighbours' windows: curtains drawn (a warm glow through them at night).
  const curtain = {
    emissive: night ? '#ffb85c' : '#d9c7a8',
    emissiveIntensity: night ? 0.35 : 0.08,
    rough: 0.95,
  };
  const lamp = { emissive: '#ffd89a', emissiveIntensity: night ? 1.4 : 0.8 };

  // The four sides: back (the windows), front (across the corridor), left, right.
  const normals = [
    new THREE.Vector2(0, -1),
    new THREE.Vector2(0, 1),
    new THREE.Vector2(-1, 0),
    new THREE.Vector2(1, 0),
  ];
  const BACK = 0;
  const FRONT = 1;
  const LEFT = 2;
  const RIGHT = 3;
  const wk = normals.map(() => new Kit());
  const ck = normals.map(() => new Kit());
  const ek = normals.map(() => new Kit());
  /** Always there: the floors, the tower below. */
  const fk = new Kit();

  /** A wall along x (unit high: the side's cut scales it) and its cap. */
  const wallX = (sd: number, x0: number, x1: number, z: number, color: string, th = T) => {
    if (x1 - x0 < 0.05) return;
    wk[sd]!.box(x1 - x0, 1, th, color, (x0 + x1) / 2, 0, z, { rough: 0.85 });
    ck[sd]!.box(x1 - x0 + 0.03, 0.06, th + 0.03, '#f4f1ea', (x0 + x1) / 2, 0, z, { rough: 0.6 });
  };
  const wallZ = (sd: number, z0: number, z1: number, x: number, color: string, th = T) => {
    if (z1 - z0 < 0.05) return;
    wk[sd]!.box(th, 1, z1 - z0, color, x, 0, (z0 + z1) / 2, { rough: 0.85 });
    ck[sd]!.box(th + 0.03, 0.06, z1 - z0 + 0.03, '#f4f1ea', x, 0, (z0 + z1) / 2, { rough: 0.6 });
  };
  /**
   * Player feedback: "I can see the other rooms, people should have privacy
   * in their rooms". A neighbour's room is closed: a solid block as tall as
   * the walls with its ceiling on top (cut down with its side like a wall,
   * still closed), only its door on the corridor and its curtained window.
   */
  const closed = (sd: number, x0: number, x1: number, z0: number, z1: number) => {
    const w = x1 - x0 - T;
    const d = z1 - z0 - T;
    if (w < 0.1 || d < 0.1) return;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    wk[sd]!.box(w, 1, d, st.facade, cx, 0, cz, { rough: 0.9 });
    ck[sd]!.box(w, 0.05, d, CEILING, cx, 0, cz, { rough: 0.95 });
    // Ceiling panels: a few lines so the top reads as a closed room, not a floor.
    for (const t of [0.33, 0.66])
      ck[sd]!.box(w - 0.4, 0.06, 0.04, CEILING_LINE, cx, 0, z0 + T / 2 + d * t, { rough: 0.95 });
  };
  /** A neighbour's window from the outside: a frame, the curtains drawn. */
  const curtained = (e: Kit, along: 'x' | 'z', c: number, fixed: number, w: number, th = T) => {
    if (along === 'x') {
      e.box(w + 0.12, 1.5, th + 0.04, '#25272c', c, 0.8, fixed, { metal: 0.4, rough: 0.4 });
      e.box(w, 1.38, th + 0.06, st.curtain, c, 0.86, fixed, curtain);
      e.box(0.03, 1.38, th + 0.08, tone(st.curtain, -0.25), c, 0.86, fixed);
    } else {
      e.box(th + 0.04, 1.5, w + 0.12, '#25272c', fixed, 0.8, c, { metal: 0.4, rough: 0.4 });
      e.box(th + 0.06, 1.38, w, st.curtain, fixed, 0.86, c, curtain);
      e.box(th + 0.08, 1.38, 0.03, tone(st.curtain, -0.25), fixed, 0.86, c);
    }
  };
  /** A corridor wall with doors: the room side and the corridor's skin facing `f` (±z). */
  const corridorWall = (
    sd: number,
    x0: number,
    x1: number,
    z: number,
    f: 1 | -1,
    list: { x: number; n: number; friend?: string; dnd?: boolean }[],
  ) => {
    wallX(sd, x0, x1, z, ROOM_GREEN);
    wk[sd]!.box(x1 - x0, 1, 0.04, st.corridor, (x0 + x1) / 2, 0, z + f * (O2 + 0.02), {
      rough: 0.9,
    });
    for (const d of list) {
      const dx = d.x;
      const fz = z + f * (O2 + 0.05);
      const e = ek[sd]!;
      const ry = f === 1 ? 0 : Math.PI;
      e.box(1.06, 2.2, 0.05, '#f4f1ea', dx, 0, fz - f * 0.01);
      e.box(0.9, 2.08, 0.06, st.door, dx, 0, fz, { rough: 0.6 });
      e.sphere(0.04, '#d9c27a', dx + 0.32, 1.02, fz + f * 0.04, { metal: 0.8, rough: 0.3, seg: 6 });
      // The room's number on a plate by the door.
      e.add(
        new THREE.PlaneGeometry(0.24, 0.24),
        mat('#ffffff', { map: plaqueTexture(d.n, st), rough: 0.5 }),
        dx + 0.72,
        1.5,
        fz + f * 0.006,
        { ry, noShadow: true },
      );
      if (d.dnd) {
        // "Do not disturb" on the handle.
        e.box(0.11, 0.24, 0.012, '#b91c1c', dx + 0.32, 0.8, fz + f * 0.05, { noShadow: true });
        e.add(
          new THREE.PlaneGeometry(0.09, 0.2),
          mat('#ffffff', { map: dndTexture(), rough: 0.6 }),
          dx + 0.32,
          0.92,
          fz + f * 0.058,
          { ry, noShadow: true },
        );
      }
      if (d.friend) {
        // A friend's room: their name over the door, a light on, a mat outside.
        e.add(
          new THREE.PlaneGeometry(0.96, 0.24),
          mat('#ffffff', {
            map: nameplateTexture(d.friend, d.n),
            rough: 0.5,
            emissive: '#ffffff',
            emissiveIntensity: night ? 0.35 : 0.12,
          }),
          dx,
          2.42,
          fz + f * 0.01,
          { ry, noShadow: true },
        );
        // …and their name on the mat outside, seen even with the wall cut away.
        fk.box(1.1, 0.012, 0.5, '#0f3d2e', dx, 0.0, fz + f * 0.4, { rough: 1, noShadow: true });
        fk.add(
          new THREE.PlaneGeometry(1.0, 0.25),
          mat('#ffffff', { map: nameplateTexture(d.friend, d.n), rough: 0.8 }),
          dx,
          0.016,
          fz + f * 0.4,
          { rx: -Math.PI / 2, ry: f === 1 ? 0 : Math.PI, noShadow: true },
        );
      }
      // A wall light between the doors.
      e.box(0.16, 0.26, 0.08, '#fff3d6', dx - 1.35, 1.7, fz, { ...lamp, noShadow: true });
    }
  };
  const door = (slot: NeighbourSlot) => {
    const d = doors.get(slot)!;
    return {
      x: row.rooms[slot].door,
      n: d.number,
      ...(d.friend ? { friend: d.friend.name } : {}),
      dnd: d.dnd,
    };
  };

  // ---- The floor: the corridor's runner, the slab's edge.
  {
    const ct = carpetTexture(st);
    ct.repeat.set((X1 - X0) / CORR, 1);
    const c = new THREE.Mesh(
      new THREE.PlaneGeometry(X1 - X0, CORR - T),
      mat('#ffffff', { map: ct, rough: 1, own: true }),
    );
    c.rotation.x = -Math.PI / 2;
    c.position.set((X0 + X1) / 2, -0.012, H + CORR / 2);
    c.receiveShadow = true;
    group.add(c);
    // The slab under your floor, its edge a band round the tower.
    fk.box(X1 - X0 + 2 * T + 0.1, 0.4, Z1 + 2 * T + 0.1, st.trim, (X0 + X1) / 2, -0.43, Z1 / 2, {
      rough: 0.8,
    });
  }

  // ---- Your row: closed rooms either side of yours, the lift lobby.
  const { L1, L2, R1, R2 } = row.rooms;
  closed(LEFT, L2.x0, L2.x1, 0, H);
  closed(LEFT, L1.x0, L1.x1, 0, H);
  wallZ(LEFT, 0, H, L1.x0, ROOM_GREEN);
  corridorWall(LEFT, X0, -O2, H + O2, 1, [door('L2'), door('L1')]);
  closed(RIGHT, R1.x0, R1.x1, 0, H);
  wallZ(RIGHT, 0, H + O2, R1.x1, ROOM_GREEN);
  corridorWall(RIGHT, W + O2, R1.x1, H + O2, 1, [door('R1')]);
  // The lift lobby: open to the corridor, the lifts on its back wall, a
  // service room (closed) behind it.
  const LB = row.lobby;
  const LZ = H - 2.6;
  closed(RIGHT, LB.x0, LB.x1, 0, LZ);
  wallX(RIGHT, LB.x0, LB.x1, LZ, ROOM_GREEN);
  wk[RIGHT]!.box(LOBBY, 1, 0.04, st.corridor, LB.x0 + LOBBY / 2, 0, LZ + O2 + 0.02, { rough: 0.9 });
  wallZ(RIGHT, 0, H + O2, LB.x1, ROOM_GREEN);
  {
    const e = ek[RIGHT]!;
    const fz = LZ + O2 + 0.05;
    for (const lx of [LB.x0 + LOBBY * 0.28, LB.x0 + LOBBY * 0.72]) {
      e.box(1.2, 2.3, 0.05, '#c9ced4', lx, 0, fz, { metal: 0.6, rough: 0.35 });
      e.box(0.02, 2.2, 0.07, '#7c848d', lx, 0, fz);
      e.box(0.5, 0.18, 0.04, '#111827', lx, 2.4, fz, {
        emissive: '#ff9b3d',
        emissiveIntensity: 0.9,
        noShadow: true,
      });
    }
    e.box(0.1, 0.22, 0.05, '#d9dde3', LB.x0 + LOBBY / 2, 1.05, fz, {
      emissive: '#ffffff',
      emissiveIntensity: 0.4,
      metal: 0.5,
    });
    // The floor's number over the lifts.
    e.add(
      new THREE.PlaneGeometry(0.5, 0.5),
      mat('#ffffff', { map: plaqueTexture(o.floor, st), rough: 0.5 }),
      LB.x0 + LOBBY / 2,
      2.2,
      fz + 0.01,
      { noShadow: true },
    );
  }
  if (o.tier === 'budget') {
    // An ice machine and a drinks machine by the lifts.
    const x = LB.x1 - 0.5;
    fk.box(0.7, 1.1, 0.65, '#e5e7eb', x, 0, LZ + 0.5, { metal: 0.3, rough: 0.4 });
    fk.box(0.5, 0.12, 0.03, '#38bdf8', x, 0.8, LZ + 0.84, {
      emissive: '#38bdf8',
      emissiveIntensity: 0.7,
      noShadow: true,
    });
    fk.box(0.65, 1.8, 0.75, '#b91c1c', x + 0.05, 0, LZ + 1.4, { rough: 0.5 });
    fk.box(0.03, 1.2, 0.5, '#fde68a', x - 0.29, 0.4, LZ + 1.4, {
      emissive: '#fde68a',
      emissiveIntensity: 0.6,
      noShadow: true,
    });
  } else {
    // A console table and a vase.
    fk.box(0.45, 0.8, 1.3, '#5b4636', LB.x1 - 0.4, 0, LZ + 1.2, { rough: 0.5 });
    fk.cyl(0.1, 0.13, 0.4, '#e7e5e4', LB.x1 - 0.4, 0.8, LZ + 1.2, { seg: 10 });
    fk.sphere(0.22, '#4d8a40', LB.x1 - 0.4, 1.35, LZ + 1.2, { seg: 8 });
  }
  closed(RIGHT, R2.x0, R2.x1, 0, H);
  corridorWall(RIGHT, R2.x0, X1, H + O2, 1, [door('R2')]);
  // Your room's door side gets the corridor's skin too (the door's gap left open).
  wk[FRONT]!.box(o.doorX + 0.08, 1, 0.04, st.corridor, (o.doorX - 0.08) / 2, 0, H + T + 0.02, {
    rough: 0.9,
  });
  wk[FRONT]!.box(
    W - o.doorX - 1 + 0.08,
    1,
    0.04,
    st.corridor,
    (o.doorX + 1 + W + 0.08) / 2,
    0,
    H + T + 0.02,
    {
      rough: 0.9,
    },
  );
  ek[FRONT]!.add(
    new THREE.PlaneGeometry(0.24, 0.24),
    mat('#ffffff', { map: plaqueTexture(ours, st), rough: 0.5 }),
    o.doorX + 1.35,
    1.5,
    H + T + 0.05,
    { noShadow: true },
  );
  ek[FRONT]!.box(0.16, 0.26, 0.08, '#fff3d6', o.doorX - 0.6, 1.7, H + T + 0.06, {
    ...lamp,
    noShadow: true,
  });
  // The neighbours' windows from the inside of the tower's back wall (seen
  // when the back is cut away): curtains drawn.
  for (const [sd, r] of [
    [LEFT, L2],
    [LEFT, L1],
    [RIGHT, R1],
    [RIGHT, R2],
  ] as const)
    curtained(ek[sd]!, 'x', (r.x0 + r.x1) / 2, 0.06, 1.8, 0.02);

  // ---- Across the corridor: a row of closed rooms, their doors on the corridor.
  const across = Math.max(4, Math.round((X1 - X0) / 5.6));
  const aw = (X1 - X0) / across;
  {
    const list: { x: number; n: number; dnd: boolean }[] = [];
    for (let i = 0; i < across; i++) {
      const x = X0 + i * aw;
      if (i > 0) wallZ(FRONT, H + CORR, Z1, x, ROOM_GREEN);
      closed(FRONT, x, x + aw, H + CORR + O2, Z1);
      const n = o.floor * 100 + 50 + i * 2;
      list.push({ x: x + aw * 0.22, n, dnd: i % 3 === 1 });
    }
    corridorWall(FRONT, X0, X1, H + CORR, -1, list);
  }

  // ---- The tower's outer wall round your floor, a window per room (curtained but yours).
  const win = (sd: number, along: 'x' | 'z', c: number, fixed: number, w: number, own = false) => {
    const e = ek[sd]!;
    if (!own) return curtained(e, along, c, fixed, w);
    if (along === 'x') {
      e.box(w + 0.12, 1.5, T + 0.04, '#25272c', c, 0.8, fixed, { metal: 0.4, rough: 0.4 });
      e.box(w, 1.38, T + 0.06, '#9fc8dd', c, 0.86, fixed, glass);
    } else {
      e.box(T + 0.04, 1.5, w + 0.12, '#25272c', fixed, 0.8, c, { metal: 0.4, rough: 0.4 });
      e.box(T + 0.06, 1.38, w, '#9fc8dd', fixed, 0.86, c, glass);
    }
  };
  wallX(BACK, X0 - T, -O2, -O2, st.facade);
  wallX(BACK, W + O2, X1 + T, -O2, st.facade);
  for (const r of [L2, L1, R1, R2]) win(BACK, 'x', (r.x0 + r.x1) / 2, -O2, 1.8);
  wallX(FRONT, X0 - T, X1 + T, Z1 + O2, st.facade);
  wallZ(LEFT, -T, Z1 + T, X0 - O2, st.facade);
  wallZ(RIGHT, -T, Z1 + T, X1 + O2, st.facade);
  for (let i = 0; i < across; i++) win(FRONT, 'x', X0 + (i + 0.55) * aw, Z1 + O2, 1.8);
  for (const [sd, x] of [
    [LEFT, X0 - O2],
    [RIGHT, X1 + O2],
  ] as const) {
    win(sd, 'z', H / 2, x, 1.6);
    // The corridor's own window at its end.
    win(sd, 'z', H + CORR / 2, x, 1.2, true);
    win(sd, 'z', H + CORR + ACROSS / 2, x, 1.6);
  }
  if (o.tier === 'luxury') {
    // The suite's balcony: decking, a glass railing, two loungers and a
    // table looking out over the city, planters at the ends.
    const bx0 = 0.3;
    const bx1 = Math.max(6, W * 0.8);
    const bw = bx1 - bx0;
    const bc = (bx0 + bx1) / 2;
    const BD = 2.6;
    const bz = -BD / 2 - T;
    fk.box(bw, 0.3, BD, st.trim, bc, -0.33, bz, { rough: 0.8 });
    fk.box(bw, 0.02, BD, '#a07850', bc, -0.03, bz, { rough: 0.85 });
    for (let x = bx0 + 0.15; x < bx1; x += 0.3)
      fk.box(0.012, 0.022, BD, '#7a5a3a', x, -0.03, bz, { noShadow: true });
    for (const [w, d, x, z] of [
      [bw, 0.04, bc, -BD - T],
      [0.04, BD, bx0, bz],
      [0.04, BD, bx1, bz],
    ] as const) {
      fk.box(w, 1.0, d, '#bfe3f0', x, 0, z, { opacity: 0.3, rough: 0.05, noShadow: true });
      fk.box(w + 0.02, 0.05, d + 0.04, '#d9dde3', x, 1.0, z, { metal: 0.6, rough: 0.3 });
    }
    for (const [i, x] of [bc - 1.6, bc - 0.5].entries()) {
      const l = buildModel('lounger', { w: 0.9, d: 2, tier: 3, tint: i ? '#e7dcc8' : '#e7dcc8' });
      l.group.position.set(x, 0, bz + 0.05);
      l.group.rotation.y = Math.PI;
      group.add(l.group);
    }
    fk.cyl(0.28, 0.28, 0.03, '#f1ece4', bc + 0.6, 0.48, bz - 0.3, { seg: 18 });
    fk.cyl(0.03, 0.03, 0.48, '#c9a35a', bc + 0.6, 0, bz - 0.3, { metal: 0.7, rough: 0.3 });
    for (const x of [bx0 + 0.45, bx1 - 0.45]) {
      fk.box(0.6, 0.55, 0.6, '#3b3f46', x, 0, bz - 0.7, { round: 0.04 });
      fk.sphere(0.42, '#3f7d45', x, 0.9, bz - 0.7, { seg: 8, sy: 0.9 });
    }
  }

  // ---- The floors above: the tower's walls rise on, cut away like a doll's
  // house (they hide with their side), floor lines, windows, partitions.
  const signMat = mat('#ffffff', {
    map: nameTexture(o.name || 'HOTEL', st, false),
    rough: 0.6,
    ...(night ? { emissive: '#ffffff', emissiveIntensity: 0.15 } : {}),
  });
  const upper = (
    sd: number,
    along: 'x' | 'z',
    a: number,
    b: number,
    fixed: number,
    inward: 1 | -1,
    fins: number[],
  ) => {
    const e = ek[sd]!;
    const len = b - a;
    const c = (a + b) / 2;
    const at = (t: number, off = 0) =>
      along === 'x' ? ([t, fixed + off] as const) : ([fixed + off, t] as const);
    const box = (
      u: number,
      h: number,
      v: number,
      color: string,
      t: number,
      y: number,
      off: number,
      opts: PartOpts = {},
    ) => {
      const [x, z] = at(t, off);
      if (along === 'x') e.box(u, h, v, color, x, y, z, opts);
      else e.box(v, h, u, color, x, y, z, opts);
    };
    box(len, top + 0.9 - WALL_H, T, st.facade, c, WALL_H, 0, { rough: 0.85, noShadow: true });
    for (let k = 1; k <= FLOORS_ABOVE + 1; k++) {
      const y = k * S;
      // The floor line, outside and in, and the slab's edge inside.
      box(len + 0.2, 0.26, T + 0.14, st.trim, c, y - 0.3, 0, { noShadow: true });
      box(len, 0.28, 0.45, '#d4d0c8', c, y - 0.3, inward * (O2 + 0.22), { noShadow: true });
      if (k > FLOORS_ABOVE) break;
      for (let t = a + 1.4; t < b - 1; t += 2.6) {
        box(1.6, 1.6, T + 0.04, '#25272c', t + 0.8, y + 0.75, 0, { noShadow: true });
        box(1.48, 1.48, T + 0.07, '#9fc8dd', t + 0.8, y + 0.81, 0, { ...glass, noShadow: true });
      }
    }
    // The rooms' partitions behind the windows (fins of wall inside).
    for (const t of fins)
      if (t > a + 0.5 && t < b - 0.5)
        box(T, top - S - 0.3, 0.9, ROOM_GREEN, t, S, inward * (O2 + 0.45), { noShadow: true });
    // The parapet's coping and the hotel's name on the roof, readable both ways.
    box(len + 0.3, 0.12, T + 0.2, st.trim, c, top + 0.9, 0, { noShadow: true });
    const sw = Math.min(len * 0.55, 14);
    const sh = sw / 4;
    const sy = top + 1.6 + sh / 2;
    for (const off of [0.05, -0.05]) {
      const [sx, sz] = at(c, off);
      const ry = (along === 'x' ? 0 : Math.PI / 2) + (off < 0 ? Math.PI : 0);
      e.add(new THREE.PlaneGeometry(sw, sh), signMat, sx, sy, sz, { ry, noShadow: true });
    }
    box(sw + 0.2, sh + 0.2, 0.08, '#2a2d33', c, sy - sh / 2 - 0.1, 0, { noShadow: true });
    for (const t of [c - sw * 0.35, c + sw * 0.35])
      box(0.12, 1.6, 0.12, '#2a2d33', t, top + 0.9, 0, { noShadow: true, metal: 0.4 });
  };
  const xs = [L1.x0, -O2, W + O2, R1.x1, LB.x1];
  upper(BACK, 'x', X0 - T, X1 + T, -O2, 1, xs);
  upper(FRONT, 'x', X0 - T, X1 + T, Z1 + O2, -1, xs);
  upper(LEFT, 'z', -T, Z1 + T, X0 - O2, 1, [H, H + CORR]);
  upper(RIGHT, 'z', -T, Z1 + T, X1 + O2, -1, [H, H + CORR]);

  // ---- The floors below, down to the street; the hotel's name down two corners.
  const below = o.floor * S;
  const street = o.groundY - below;
  {
    const hgt = -0.43 - street;
    const faceMat = (len: number) => {
      const tex = towerTexture(night);
      tex.repeat.set(Math.max(1, Math.round(len / 9.6)), Math.round(hgt / 12.8));
      return new THREE.MeshStandardMaterial({
        color: st.facade,
        map: tex,
        roughness: 0.6,
        metalness: 0.1,
        ...(night
          ? { emissive: new THREE.Color('#ffd27a'), emissiveMap: tex, emissiveIntensity: 0.6 }
          : {}),
      });
    };
    const mx = faceMat(X1 - X0);
    const mz = faceMat(Z1);
    const roofM = mat(st.trim, { rough: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 + 2 * T, hgt, Z1 + 2 * T), [
      mz,
      mz,
      roofM,
      roofM,
      mx,
      mx,
    ]);
    body.position.set((X0 + X1) / 2, street + hgt / 2, Z1 / 2);
    body.receiveShadow = true;
    group.add(body);
    // A canopy over the entrance at the street, the name on it.
    fk.box(10, 0.5, 3.5, st.sign.bg, (X0 + X1) / 2, street + 4, Z1 + 1.9, { rough: 0.5 });
    // Blade signs on two corners, from the floor under yours down.
    const blade = mat('#ffffff', {
      map: nameTexture(o.name || 'HOTEL', st, true),
      rough: 0.6,
      emissive: '#ffffff',
      emissiveIntensity: night ? 0.35 : 0.08,
    });
    const bh = Math.min(5 * S, below - 6);
    const bw = bh / 4;
    for (const [x, z] of [
      [X0 - T - bw / 2 - 0.1, Z1 + T],
      [X1 + T + bw / 2 + 0.1, -T],
    ] as const) {
      const yc = -1.2 - bh / 2;
      fk.box(bw + 0.2, bh + 0.2, 0.3, st.sign.bg, x, yc - bh / 2 - 0.1, z, { noShadow: true });
      for (const flip of [0, Math.PI])
        fk.add(new THREE.PlaneGeometry(bw, bh), blade, x, yc, z + (flip ? -0.16 : 0.16), {
          ry: flip,
          noShadow: true,
        });
    }
  }

  // ---- The city round the tower and far below.
  const city = cityBelow({
    night,
    groundY: o.groundY,
    slab: { x: X0 - T, z: -T, w: X1 - X0 + 2 * T, d: Z1 + 2 * T },
    height: below,
    body: false,
  });
  group.add(city.group);
  const built = fk.build();
  group.add(built);

  const sides: TowerSide[] = normals.map((n, i) => {
    const walls = wk[i]!.build();
    walls.scale.y = WALL_H;
    const caps = ck[i]!.build();
    caps.position.y = WALL_H;
    const extras = ek[i]!.build();
    extras.traverse((m) => ((m as THREE.Mesh).castShadow = false));
    return { n, walls, caps, extras };
  });
  return { group, occluders: city.occluders, reach: city.reach, sides };
}
