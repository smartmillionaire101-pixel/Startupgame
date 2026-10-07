/**
 * Wave 9 §C: every place's room in 3D. The 2D rooms (../city/rooms.ts) are a
 * 360 × 240 front-on box: x across, y from the back wall (≈130) to the front
 * (240). Here that box becomes a 12 × 7.6 m room with the back wall at
 * z = -3.8 and the front open to the camera. Each kind of room has a floor,
 * walls and its props; seated people get a seat (and a table, a desk or a
 * mirror) where they sit.
 */
import * as THREE from 'three';
import type { RoomKind, Slot } from '../city/rooms';
import { buildModel, chairAt, type Model } from './furniture';
import { FLOOR_SCALE, Kit, floorTexture, mat, signTexture, type FloorKind, tone } from './kit';

export const RW = 12;
export const RD = 6.6;
export const BACK = -RD / 2;
export const WALL_H = 3.0;

/** 2D room x → metres. */
export const vx = (x: number) => ((x - 180) / 360) * RW;
/** 2D room y (feet) → metres (z). */
export const vz = (y: number) => BACK + 0.8 + ((Math.max(118, y) - 130) / 110) * (RD - 1.1);

type SeatStyle =
  'table' | 'desk' | 'stool' | 'row' | 'armchair' | 'salon' | 'lounger' | 'sofa' | 'none';

interface RoomStyle {
  floor: FloorKind;
  floorTint?: string;
  wall: string;
  /** No walls: outdoors (a beach, a pitch). */
  open?: boolean;
  seat: SeatStyle;
  /** Dim, coloured light (a club, a cinema). */
  mood?: 'club' | 'dark' | 'warm' | 'day';
}

export const ROOM_STYLE: Record<RoomKind, RoomStyle> = {
  restaurant: { floor: 'parquet', wall: '#8a3b22', seat: 'table', mood: 'warm' },
  cafe: { floor: 'checker', floorTint: '#efe6d6', wall: '#b7793f', seat: 'table', mood: 'warm' },
  club: { floor: 'dance', wall: '#1e1b4b', seat: 'stool', mood: 'club' },
  bar: { floor: 'parquet-dark', wall: '#4a2e1d', seat: 'stool', mood: 'warm' },
  cinema: { floor: 'carpet', floorTint: '#5b1a1a', wall: '#1c1917', seat: 'row', mood: 'dark' },
  gym: { floor: 'concrete', wall: '#334155', seat: 'none', mood: 'day' },
  cowork: { floor: 'parquet', wall: '#e2e8f0', seat: 'desk', mood: 'day' },
  office: { floor: 'carpet', floorTint: '#7b8794', wall: '#dbe4ee', seat: 'desk', mood: 'day' },
  bank: { floor: 'marble', wall: '#d6d3d1', seat: 'none', mood: 'day' },
  investor: { floor: 'parquet-dark', wall: '#3f4a3c', seat: 'table', mood: 'warm' },
  accelerator: {
    floor: 'carpet',
    floorTint: '#6b7a8f',
    wall: '#f1f5f9',
    seat: 'table',
    mood: 'day',
  },
  devpartner: { floor: 'parquet', wall: '#dfe7e2', seat: 'table', mood: 'day' },
  showroom: { floor: 'marble', wall: '#e5e7eb', seat: 'none', mood: 'day' },
  furniture: { floor: 'parquet', wall: '#efe4d2', seat: 'sofa', mood: 'warm' },
  apartment: { floor: 'parquet', wall: '#efe4d2', seat: 'sofa', mood: 'warm' },
  hotel: { floor: 'carpet', floorTint: '#8c7a62', wall: '#e9dcc7', seat: 'armchair', mood: 'warm' },
  hub: { floor: 'parquet', wall: '#e0f2fe', seat: 'table', mood: 'day' },
  market: { floor: 'stone', wall: '#c2b49a', seat: 'none', mood: 'day' },
  eventhall: { floor: 'parquet', wall: '#312e81', seat: 'none', mood: 'warm' },
  airport: { floor: 'marble', wall: '#cbd5e1', seat: 'row', mood: 'day' },
  shop: { floor: 'tile', wall: '#f5f5f4', seat: 'none', mood: 'day' },
  clinic: { floor: 'tile', wall: '#e0f2f1', seat: 'row', mood: 'day' },
  gallery: { floor: 'concrete', wall: '#f8fafc', seat: 'none', mood: 'day' },
  school: { floor: 'parquet', wall: '#fef3c7', seat: 'desk', mood: 'day' },
  workshop: { floor: 'concrete', wall: '#64748b', seat: 'none', mood: 'day' },
  lounge: { floor: 'parquet-dark', wall: '#2e1065', seat: 'armchair', mood: 'warm' },
  karaoke: { floor: 'carpet', floorTint: '#4c1d95', wall: '#1e1b4b', seat: 'sofa', mood: 'club' },
  arcade: { floor: 'carpet', floorTint: '#1e293b', wall: '#0f172a', seat: 'none', mood: 'club' },
  spa: { floor: 'stone', wall: '#e7e0d3', seat: 'lounger', mood: 'warm' },
  beach: { floor: 'sand', wall: '#000', open: true, seat: 'lounger', mood: 'day' },
  stage: { floor: 'parquet-dark', wall: '#111827', seat: 'none', mood: 'club' },
  pitch: { floor: 'turf', wall: '#000', open: true, seat: 'none', mood: 'day' },
  appliance: { floor: 'tile', wall: '#e2e8f0', seat: 'none', mood: 'day' },
  salon: { floor: 'checker', floorTint: '#f5efe6', wall: '#f3d9e0', seat: 'salon', mood: 'day' },
};

/** A seat someone sits on in the room. */
export interface SeatSpot {
  pos: THREE.Vector3;
  ry: number;
  h: number;
  /** Lying (a lounger, a massage table). */
  lie?: boolean;
}

export interface VenueRoom {
  root: THREE.Group;
  /** Wall runs that cut away when they face the camera: [normal x, z, meshes]. */
  sides: { nx: number; nz: number; meshes: THREE.Object3D[] }[];
  /** Seats for each slot index (seated slots only). */
  seats: Map<number, SeatSpot>;
  /** Animated bits: screens, DJ decks, lights. */
  screens: THREE.MeshStandardMaterial[];
  decks: THREE.Object3D[];
  /** Coloured lights that sweep (a club). */
  movers: THREE.PointLight[];
  lamps: THREE.PointLight[];
}

const place = (root: THREE.Group, m: Model, x: number, z: number, ry = 0) => {
  m.group.position.set(x, 0, z);
  m.group.rotation.y = ry;
  root.add(m.group);
  return m;
};

function floor(root: THREE.Group, kind: FloorKind, tint?: string, w = RW, d = RD) {
  const tex = floorTexture(kind, tint).clone();
  tex.needsUpdate = true;
  const s = FLOOR_SCALE[kind];
  tex.repeat.set(w / s, d / s);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    mat('#ffffff', { map: tex, rough: kind === 'marble' ? 0.3 : 0.8, own: true }),
  );
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  root.add(m);
  return m;
}

/** Group seated slots into tables of two (side by side in 2D) and singles. */
function pairs(slots: { s: Slot; i: number }[]) {
  const left = [...slots].sort((a, b) => a.s.x - b.s.x);
  const used = new Set<number>();
  const out: { a: { s: Slot; i: number }; b?: { s: Slot; i: number } }[] = [];
  for (const a of left) {
    if (used.has(a.i)) continue;
    used.add(a.i);
    const b = left.find(
      (c) =>
        !used.has(c.i) && Math.abs(c.s.y - a.s.y) <= 14 && c.s.x - a.s.x > 0 && c.s.x - a.s.x <= 64,
    );
    if (b) used.add(b.i);
    out.push({ a, b });
  }
  return out;
}

export interface VenueOpts {
  kind: RoomKind;
  tint: string;
  sign?: string;
  slots: Slot[];
  night: boolean;
}

export function buildVenue(o: VenueOpts): VenueRoom {
  const st = ROOM_STYLE[o.kind];
  const root = new THREE.Group();
  const seats = new Map<number, SeatSpot>();
  const screens: THREE.MeshStandardMaterial[] = [];
  const decks: THREE.Object3D[] = [];
  const movers: THREE.PointLight[] = [];
  const lamps: THREE.PointLight[] = [];
  const sides: VenueRoom['sides'] = [];
  const add = (
    id: string,
    x: number,
    z: number,
    w: number,
    d: number,
    ry = 0,
    tint?: string,
    tier = 2,
    seed = 0,
  ) => {
    const m = place(root, buildModel(id, { w, d, tier, tint, seed }), x, z, ry);
    screens.push(...m.screens);
    if (m.parts.deckL) decks.push(m.parts.deckL, m.parts.deckR!);
    return m;
  };
  const backZ = (d: number) => BACK + d / 2 + 0.02;

  // ---- Shell.
  if (st.open) {
    floor(root, st.floor, st.floorTint, RW + 10, RD + 8);
  } else {
    floor(root, st.floor, st.floorTint);
    const k = new Kit();
    // A rim of skirting and a soft dark band along the walls.
    k.box(RW, 0.1, 0.03, tone(st.wall, -0.2), 0, 0, BACK + 0.02);
    root.add(k.build());
    const wallMat = mat(st.wall, { rough: 0.9 });
    const mk = (w: number, d: number, x: number, z: number) => {
      const g = new THREE.BoxGeometry(w, 1, d);
      g.translate(0, 0.5, 0);
      const m = new THREE.Mesh(g, wallMat);
      m.position.set(x, 0, z);
      m.scale.y = WALL_H;
      m.receiveShadow = true;
      m.castShadow = true;
      root.add(m);
      return m;
    };
    const back = mk(RW + 0.4, 0.2, 0, BACK - 0.1);
    const left = mk(0.2, RD + 0.2, -RW / 2 - 0.1, 0);
    const right = mk(0.2, RD + 0.2, RW / 2 + 0.1, 0);
    // A low front ledge so the room reads as a cut-away.
    const front = mk(RW + 0.4, 0.2, 0, RD / 2 + 0.1);
    front.scale.y = 0.25;
    front.userData.low = true;
    sides.push(
      { nx: 0, nz: -1, meshes: [back] },
      { nx: -1, nz: 0, meshes: [left] },
      { nx: 1, nz: 0, meshes: [right] },
    );
    // AO along the back wall.
    const ao = new THREE.Mesh(
      new THREE.PlaneGeometry(RW, 0.8),
      new THREE.MeshBasicMaterial({
        color: '#000',
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    ao.rotation.x = -Math.PI / 2;
    ao.position.set(0, 0.005, BACK + 0.4);
    root.add(ao);
    // The name on the back wall.
    if (o.sign) {
      const sm = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 0.9),
        new THREE.MeshStandardMaterial({
          map: signTexture(o.sign, tone(o.tint, -0.15), '#ffffff'),
          emissive: '#ffffff',
          emissiveIntensity: 0.25,
          transparent: true,
        }),
      );
      (sm.material as THREE.MeshStandardMaterial).emissiveMap = (
        sm.material as THREE.MeshStandardMaterial
      ).map;
      sm.material.map!.repeat.set(1, 0.25);
      sm.material.map!.offset.set(0, 0.75);
      sm.position.set(
        o.kind === 'club' || o.kind === 'cinema' || o.kind === 'stage' ? -3.6 : 0,
        2.55,
        BACK + 0.02,
      );
      root.add(sm);
    }
  }

  // ---- Seats for seated slots.
  const seated = o.slots.map((s, i) => ({ s, i })).filter((x) => x.s.sit);
  const seat = (i: number, x: number, z: number, ry: number, h: number, lie = false) =>
    seats.set(i, { pos: new THREE.Vector3(x, 0, z), ry, h, lie });
  const style = st.seat;
  if (style === 'table') {
    for (const p of pairs(seated)) {
      const ax = vx(p.a.s.x);
      const az = vz(p.a.s.y);
      if (p.b) {
        const bx = vx(p.b.s.x);
        const mx = (ax + bx) / 2;
        const tk = new Kit();
        chairAt(tk, ax, az, Math.PI / 2, 'dining', '#5b3a22');
        chairAt(tk, bx, az, -Math.PI / 2, 'dining', '#5b3a22');
        root.add(tk.build());
        add(
          'restaurant-table',
          mx,
          az,
          1.2,
          0.9,
          Math.PI / 2,
          o.kind === 'restaurant' ? '#f8fafc' : o.kind === 'cafe' ? '#d6b98c' : '#e7e5e4',
          2,
          Math.round(ax * 10),
        );
        seat(p.a.i, ax, az, Math.PI / 2, 0.45);
        seat(p.b.i, bx, az, -Math.PI / 2, 0.45);
      } else {
        const dir = p.a.s.flip ? -1 : 1;
        const tk = new Kit();
        chairAt(tk, ax, az, (dir * Math.PI) / 2, 'dining', '#5b3a22');
        root.add(tk.build());
        add('restaurant-table', ax + dir * 0.75, az, 1.0, 0.8, Math.PI / 2, '#e7e5e4', 2, 1);
        seat(p.a.i, ax, az, (dir * Math.PI) / 2, 0.45);
      }
    }
  } else if (style === 'desk') {
    for (const { s, i } of seated) {
      const x = vx(s.x);
      const z = vz(s.y);
      // The desk behind them (its chair, at local z = 0.55, under them), the screen towards us.
      add('office-desk', x, z - 0.55, 1.3, 0.8, 0);
      seat(i, x, z, Math.PI, 0.46);
    }
  } else if (style === 'stool') {
    const rows = new Map<number, { s: Slot; i: number }[]>();
    for (const x of seated)
      rows.set(Math.round(x.s.y / 20), [...(rows.get(Math.round(x.s.y / 20)) ?? []), x]);
    for (const row of rows.values()) {
      const xs = row.map((r) => vx(r.s.x));
      const z = vz(row[0]!.s.y);
      const x0 = Math.min(...xs) - 0.6;
      const x1 = Math.max(...xs) + 0.6;
      const tk = new Kit();
      tk.box(x1 - x0, 0.06, 0.5, '#1c1917', (x0 + x1) / 2, 1.02, z - 0.55, { rough: 0.2 });
      for (const x of [x0 + 0.15, x1 - 0.15]) tk.box(0.08, 1.02, 0.08, '#27272a', x, 0, z - 0.55);
      for (const r of row) chairAt(tk, vx(r.s.x), z, 0, 'bar', o.tint);
      root.add(tk.build());
      for (const r of row) seat(r.i, vx(r.s.x), z, Math.PI, 0.78);
    }
  } else if (style === 'row') {
    for (const { s, i } of seated) {
      const x = vx(s.x);
      const z = vz(s.y);
      add(
        'cinema-seats',
        x,
        z,
        0.7,
        0.7,
        Math.PI,
        o.kind === 'cinema' ? '#991b1b' : o.kind === 'airport' ? '#334155' : '#0f766e',
      );
      seat(i, x, z, Math.PI, 0.48);
    }
  } else if (style === 'armchair' || style === 'sofa') {
    for (const p of pairs(seated)) {
      const ax = vx(p.a.s.x);
      const az = vz(p.a.s.y);
      if (p.b) {
        const bx = vx(p.b.s.x);
        add('armchair', ax, az, 0.9, 0.9, Math.PI / 2, o.kind === 'lounge' ? '#6d28d9' : undefined);
        add(
          'armchair',
          bx,
          az,
          0.9,
          0.9,
          -Math.PI / 2,
          o.kind === 'lounge' ? '#6d28d9' : undefined,
        );
        add('coffee-table', (ax + bx) / 2, az, 0.9, 0.7, Math.PI / 2, undefined, 2);
        seat(p.a.i, ax, az, Math.PI / 2, 0.5);
        seat(p.b.i, bx, az, -Math.PI / 2, 0.5);
      } else {
        add(
          style === 'sofa' ? 'sofa' : 'armchair',
          ax,
          az,
          style === 'sofa' ? 2.2 : 0.9,
          0.9,
          Math.PI,
          o.kind === 'karaoke' ? '#be185d' : undefined,
          2,
        );
        seat(p.a.i, ax, az, Math.PI, 0.5);
      }
    }
  } else if (style === 'salon') {
    for (const { s, i } of seated) {
      const x = vx(s.x);
      const z = vz(s.y);
      if (s.act === 'waiting') {
        add('cinema-seats', x, z, 0.7, 0.7, Math.PI, '#be185d');
        seat(i, x, z, Math.PI, 0.48);
        continue;
      }
      const d = 2 * (z - 0.15 - BACK);
      add('salon-station', x, z - 0.15, 1.2, d, 0, o.tint);
      seat(i, x, z, Math.PI, 0.55);
    }
  } else if (style === 'lounger') {
    for (const { s, i } of seated) {
      const x = vx(s.x);
      const z = vz(s.y);
      add('lounger', x, z, 0.8, 2, 0, o.kind === 'spa' ? '#d6d3d1' : '#0ea5e9');
      if (o.kind === 'beach')
        add('parasol', x + 0.7, z - 0.6, 1, 1, 0, i % 2 ? '#f97316' : '#0ea5e9');
      seat(i, x, z + 0.1, 0, 0.55);
    }
  }

  // ---- Props by kind.
  const counterAt = (x2d: number, y2d: number, w: number, tint?: string) =>
    add('counter', vx(x2d), vz(y2d) + 0.6, w, 0.7, 0, tint ?? o.tint);
  switch (o.kind) {
    case 'restaurant': {
      add('bar-counter', vx(286), vz(150) + 0.6, 3.4, 2.2, 0, '#7c2d12');
      add('plants', -RW / 2 + 0.5, backZ(0.6), 0.8, 0.8, 0, undefined, 2);
      add('plants', RW / 2 - 0.5, RD / 2 - 0.6, 0.8, 0.8, 0, undefined, 3);
      for (const x of [-4, 0, 4])
        add('art', x - 1.2, backZ(1) - 0.45, 1, 1, 0, undefined, 2, x + 9);
      break;
    }
    case 'cafe': {
      counterAt(86, 146, 3.4, '#a16207');
      const em = add('espresso', vx(86) + 0.9, vz(146) + 0.6, 0.6, 0.45);
      em.group.position.y = 1.03;
      add('plants', RW / 2 - 0.5, backZ(0.6), 0.8, 0.8, 0, undefined, 2);
      add('art', 3, backZ(1) - 0.45, 1.2, 1, 0, undefined, 3, 4);
      break;
    }
    case 'club':
    case 'stage': {
      const djX = vx(o.kind === 'club' ? 180 : 116);
      if (o.kind === 'stage') add('stage', 0.6, BACK + 1.3, 7.5, 2.4, 0, o.tint);
      add('dj-booth', djX, vz(136) + 0.75, 1.8, 0.8, 0, o.tint);
      add('bar-counter', RW / 2 - 1.6, 1.0, 3.5, 1.6, -Math.PI / 2, '#312e81');
      for (const [x, c] of [
        [-3, '#ec4899'],
        [0, '#22d3ee'],
        [3, '#a3e635'],
      ] as const) {
        const l = new THREE.PointLight(c, 6, 9, 1.4);
        l.position.set(x, 2.6, 0.5);
        root.add(l);
        movers.push(l);
      }
      // A mirror ball.
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 16, 12),
        mat('#e5e7eb', { metal: 0.9, rough: 0.15 }),
      );
      ball.position.set(0, 2.7, 0.3);
      root.add(ball);
      decks.push(ball);
      break;
    }
    case 'bar':
    case 'lounge': {
      add(
        'bar-counter',
        vx(150),
        vz(144) + 0.6,
        6,
        2.2,
        0,
        o.kind === 'bar' ? '#5b3a22' : '#4c1d95',
      );
      add('plants', RW / 2 - 0.5, backZ(0.6), 0.8, 0.8, 0, undefined, 3);
      break;
    }
    case 'cinema':
      add('screen-wall', 0, backZ(0.3), RW - 1, 0.3);
      break;
    case 'karaoke': {
      add('screen-wall', 0, backZ(0.3), 7, 0.3);
      add('mic', vx(150), vz(172) - 0.2, 0.4, 0.4);
      add('mic', vx(206), vz(176) - 0.2, 0.4, 0.4);
      const l = new THREE.PointLight('#f472b6', 5, 8, 1.4);
      l.position.set(0, 2.5, -1);
      root.add(l);
      movers.push(l);
      break;
    }
    case 'arcade':
      for (const x of [52, 112, 172, 232])
        add(
          'arcade',
          vx(x),
          vz(162) - 0.9,
          0.8,
          0.8,
          0,
          ['#7c3aed', '#db2777', '#0891b2', '#ea580c'][(x / 60) | 0],
        );
      add('pool-table', 2.8, 1.6, 2.2, 1.2);
      break;
    case 'gym': {
      for (const x of [-4.2, -2.9, -1.6]) add('treadmill', x, BACK + 1.0, 0.8, 1.8, Math.PI);
      add('weight-rack', 1.8, BACK + 0.4, 1.8, 0.6);
      add('bench', 3.8, -1.0, 1.4, 1.6);
      add('art', 0, backZ(1) - 0.45, 3, 1, 0, undefined, 1, 2);
      const mk = new Kit();
      mk.plane(4, 1.8, '#dbeafe', 1.5, 1.7, BACK + 0.03, { metal: 0.6, rough: 0.05 });
      root.add(mk.build());
      break;
    }
    case 'cowork':
    case 'office':
    case 'hub': {
      add('meeting-table', 2.5, -1.8, 3.2, 2.2, 0, '#e7e5e4');
      add('books', -RW / 2 + 0.5, -1, 1.6, 0.5, Math.PI / 2, undefined, 2);
      add('plants', RW / 2 - 0.5, backZ(0.6), 0.8, 0.8, 0, undefined, 2);
      add('plants', -RW / 2 + 0.5, backZ(0.6), 0.8, 0.8, 0, undefined, 3);
      const wb = new Kit();
      wb.box(2.4, 1.3, 0.05, '#f8fafc', -2, 1.0, BACK + 0.05);
      root.add(wb.build());
      break;
    }
    case 'bank':
      add('bank-counter', vx(180), vz(150) + 0.7, 8, 0.8, 0, '#1d4ed8');
      add('plants', -RW / 2 + 0.5, RD / 2 - 0.7, 0.8, 0.8, 0, undefined, 3);
      for (const x of [-1.6, 1.6]) {
        const k = new Kit();
        k.cyl(0.04, 0.04, 0.95, '#a8a29e', x, 0, 1.2, { metal: 0.6, rough: 0.3 });
        k.box(0.03, 0.05, 2, '#991b1b', x, 0.85, 2.2);
        k.cyl(0.04, 0.04, 0.95, '#a8a29e', x, 0, 3.2, { metal: 0.6, rough: 0.3 });
        root.add(k.build());
      }
      break;
    case 'investor':
    case 'devpartner':
      add('books', -RW / 2 + 0.4, -1.2, 2.4, 0.5, Math.PI / 2, undefined, 3);
      add('art', 1.5, backZ(1) - 0.45, 1.2, 1, 0, undefined, 3, 11);
      add('plants', RW / 2 - 0.6, backZ(0.6), 0.8, 0.8, 0, undefined, 3);
      add('office-desk', vx(250) + 0.2, vz(176) - 0.5, 1.4, 0.8, 0);
      break;
    case 'accelerator':
    case 'school':
    case 'eventhall': {
      if (o.kind === 'eventhall') add('stage', 0, BACK + 1.2, 6, 2.2, 0, o.tint);
      add('screen-wall', o.kind === 'eventhall' ? 0 : -2.5, backZ(0.3), 5, 0.3);
      add('plants', RW / 2 - 0.6, backZ(0.6), 0.8, 0.8, 0, undefined, 2);
      break;
    }
    case 'showroom':
      for (const [x, c, k] of [
        [-3, '#dc2626', 'luxury'],
        [2.6, '#2563eb', 'city-suv'],
      ] as const) {
        const m = buildModel(`car:${k}`, { w: 2, d: 4.5, tier: 1, tint: c });
        m.group.position.set(x, 0.12, -1.0);
        m.group.rotation.y = 0.5;
        const k2 = new Kit();
        k2.cyl(2.4, 2.4, 0.12, '#e5e7eb', x, 0, -1.0, { seg: 40, rough: 0.2 });
        root.add(k2.build(), m.group);
      }
      add('office-desk', vx(300), vz(160) - 0.5, 1.4, 0.8, 0);
      break;
    case 'furniture':
      add('bed', -3.5, BACK + 1.2, 2, 2.4, 0, undefined, 3);
      add('wardrobe', 0, backZ(0.6), 1.8, 0.6, 0, undefined, 3);
      add('lights', 2.2, BACK + 0.6, 0.6, 0.6, 0, undefined, 2);
      add('dining', 3.6, -1.2, 2, 2, 0, undefined, 3);
      add('rug', vx(130), vz(196) + 0.2, 3, 2, 0, undefined, 3);
      break;
    case 'appliance':
      for (const x of [-4, -1.5, 1]) add('tv', x, backZ(0.6), 2.2, 0.6, 0, undefined, 3);
      add('fridge', 3.5, backZ(0.7), 1, 0.7, 0, undefined, 3);
      add('washer', 4.6, backZ(0.7), 0.7, 0.7, 0, undefined, 2);
      add('counter', vx(290), vz(156) + 0.6, 2.2, 0.7, 0, o.tint);
      break;
    case 'hotel':
    case 'apartment':
      add('bed', -3.2, BACK + 1.25, 2.1, 2.5, 0, undefined, 3);
      add('wardrobe', 0.2, backZ(0.6), 1.8, 0.6, 0, undefined, 3);
      add('tv', 3, backZ(0.5), 2, 0.5, 0, undefined, 2);
      add('lights', -1.6, BACK + 0.5, 0.6, 0.6, 0, undefined, 2);
      add('rug', 0, 1, 3, 2, 0, undefined, 3);
      break;
    case 'market':
      for (const x of [70, 190, 300])
        add(
          'stall',
          vx(x),
          vz(150) + 0.6,
          2.6,
          1,
          0,
          ['#16a34a', '#ea580c', '#2563eb'][(x / 100) | 0],
        );
      break;
    case 'airport':
      add('checkin', vx(250), vz(156) + 0.7, 4, 0.8);
      add('screen-wall', -3, backZ(0.3), 3.4, 0.3);
      break;
    case 'shop':
      add('shelves', -3.5, backZ(0.5), 3.4, 0.5);
      add('shelves', 0, backZ(0.5), 3, 0.5);
      add('shelves', -RW / 2 + 0.3, 0, 2.6, 0.5, Math.PI / 2);
      counterAt(260, 156, 2.4);
      add('display-case', -1, 1.4, 2, 0.7);
      break;
    case 'clinic':
      add('reception', vx(110), vz(156) + 0.7, 2.4, 0.7, 0, '#ccfbf1');
      add('plants', RW / 2 - 0.5, backZ(0.6), 0.8, 0.8, 0, undefined, 2);
      break;
    case 'gallery':
      for (const [x, s] of [
        [-4, 1],
        [-1.3, 2],
        [1.4, 3],
        [4.1, 4],
      ] as const)
        add('art', x, backZ(1) - 0.45, 1.3, 1, 0, undefined, 3, s * 5);
      add('easel', -2, 0.6, 1.3, 0.3, 0.3, undefined, 1, 8);
      add('easel', 2.4, 1.2, 1.3, 0.3, -0.4, undefined, 1, 9);
      break;
    case 'workshop':
      add('workbench', -3, backZ(0.7), 3.2, 0.7);
      {
        const m = buildModel('car:hatchback', { w: 2, d: 4.5, tier: 1, tint: '#64748b' });
        m.group.position.set(2.5, 0.5, -0.8);
        m.group.rotation.y = Math.PI / 2;
        const k = new Kit();
        k.box(4.4, 0.12, 2, '#f59e0b', 2.5, 0.38, -0.8);
        k.box(0.3, 0.4, 0.3, '#3f3f46', 1, 0, -0.8);
        k.box(0.3, 0.4, 0.3, '#3f3f46', 4, 0, -0.8);
        root.add(k.build(), m.group);
      }
      break;
    case 'spa':
      add('spa-pool', 2.6, BACK + 1.6, 4, 2.4);
      add('massage-table', vx(236), vz(172) - 0.2, 0.8, 2, Math.PI / 2);
      add('plants', -RW / 2 + 0.5, backZ(0.6), 0.8, 0.8, 0, undefined, 3);
      add('plants', RW / 2 - 0.5, RD / 2 - 0.6, 0.8, 0.8, 0, undefined, 2);
      break;
    case 'beach': {
      const sea = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 12),
        mat('#0ea5e9', { rough: 0.15, metal: 0.1, emissive: '#0369a1', emissiveIntensity: 0.15 }),
      );
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, 0.03, BACK - 5.5);
      root.add(sea);
      const surf = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 0.6),
        mat('#f0f9ff', { opacity: 0.7 }),
      );
      surf.rotation.x = -Math.PI / 2;
      surf.position.set(0, 0.04, BACK + 0.4);
      root.add(surf);
      add('bar-counter', vx(310) - 0.3, vz(150) + 0.4, 2.6, 1.6, -0.3, '#a16207');
      for (const [x, z] of [
        [-5.4, -2.5],
        [5.6, 2.5],
        [-5.8, 2],
      ] as const) {
        const k = new Kit();
        k.cyl(0.1, 0.16, 3.4, '#8b5a2b', x, 0, z, { rz: 0.12 });
        for (let i = 0; i < 6; i++)
          k.box(
            1.4,
            0.05,
            0.35,
            '#15803d',
            x + Math.cos(i) * 0.6 + 0.4,
            3.35,
            z + Math.sin(i) * 0.6,
            { ry: i, rz: -0.3 },
          );
        root.add(k.build());
      }
      break;
    }
    case 'pitch': {
      const k = new Kit();
      k.box(RW, 0.01, 0.08, '#ffffff', 0, 0.02, 0, {});
      k.torus(1.2, 0.04, '#ffffff', 0, 0.02, 0, { rx: Math.PI / 2, seg: 32 });
      k.box(0.08, 0.01, RD - 1, '#ffffff', 0, 0.02, 0);
      for (const [x, z] of [
        [-RW / 2 - 0.4, 0],
        [RW / 2 + 0.4, 0],
      ] as const)
        k.box(0.1, 1.2, RD + 2, '#334155', x, 0, z, { opacity: 0.6 });
      root.add(k.build());
      add('goal', -RW / 2 + 0.6, 0, 3, 1.2, Math.PI / 2);
      add('goal', RW / 2 - 0.6, 0, 3, 1.2, -Math.PI / 2);
      break;
    }
    case 'salon':
      add('plants', RW / 2 - 0.5, backZ(0.6), 0.8, 0.8, 0, undefined, 2);
      add('shelves', -RW / 2 + 0.3, -1, 2.4, 0.5, Math.PI / 2);
      break;
    default:
      break;
  }

  // ---- Light: warm pendants (or the club's beams).
  if (!st.open) {
    const warm = st.mood === 'warm' || o.night;
    for (const x of [-3.5, 3.5]) {
      const l = new THREE.PointLight(
        warm ? '#ffcf8f' : '#fff7ed',
        st.mood === 'club' || st.mood === 'dark' ? 1.2 : 3.2,
        9,
        1.5,
      );
      l.position.set(x, 2.6, -0.5);
      root.add(l);
      lamps.push(l);
      const k = new Kit();
      k.cyl(0.005, 0.005, 0.5, '#111', x, 2.5, -0.5);
      k.cyl(0.08, 0.22, 0.2, warm ? '#f59e0b' : '#e5e7eb', x, 2.3, -0.5, {
        emissive: '#fde68a',
        emissiveIntensity: warm ? 1.4 : 0.6,
      });
      root.add(k.build());
    }
  }

  return { root, sides, seats, screens, decks, movers, lamps };
}
