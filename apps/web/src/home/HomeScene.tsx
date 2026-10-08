/**
 * Your home, walkable (docs/WAVE7-IMMERSIVE.md §A): a top-down 3/4 view of a
 * flat that grows with your lifestyle tier. Tap the floor to walk there (A*),
 * tap a thing for up to four verbs; choosing one walks you over, plays a short
 * action and sends `home.act`. Guests you invite walk in and sit down.
 *
 * Rendering: one SVG; static layers are React, moving people are written by a
 * single requestAnimationFrame loop through refs (React only hears about a
 * person when they change tile, for the depth sort). The loop pauses when the
 * tab is hidden; reduced motion cuts instead of walking.
 */
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import './home.css';
import { use3d } from '../three-kit/quality';
import type { Ghost, Home3DApi, Home3DPerson } from '../interiors3d/types';
import {
  MOVABLE,
  canPlace,
  loadPlacements,
  placedSpot,
  savePlacement,
  withPlacements,
  type Placement,
} from '../interiors3d/placement';
import { BuySheet, PlaceBar } from '../interiors3d/BuyMode';
import { money } from '../format';
import { t } from '../i18n';
import { useView } from '../store';
import { openPhone, type PhoneOpen } from '../phone/bus';
import { AvatarFigure, avatarLook, type AvatarLook } from '../city/art';
import { businessesOf, hash } from '../city/contract';
import { carOf, genderOf, nearest, sellsOf, storeForSlot } from '../city/life';
import type { SceneProps } from '../city/PlaceScene';
import { dayLightOf, useSun } from '../city/sun';
import { FixtureArt, SlotArt, TILE } from './art';
import {
  TIER_HOME,
  blockedTiles,
  key,
  planFor,
  wallEdges,
  type HomeAct,
  type HomePlan,
  type Spot,
  type Verb,
} from './layout';
import { ActFx } from './ActFx';
import { pathTowards, walkable, type Grid, type Tile } from './path';
import { NEEDS, actsLeft, inviteesOf, moodOf, needsOf, ownedTiers, type NeedKey } from './view';

/** Wave 9 §C: the 3D home, loaded on demand (three.js is its own chunk). */
// A chunk that fails to load (offline) leaves the 2D home in place.
const Home3D = lazy(() => import('../interiors3d/Home3D').catch(() => ({ default: () => null })));

/** The back wall's face, in px above row 0. */
const WALL = 44;
const SPEED = 3.5; // tiles per second
const ACT_MS = 2200;
const TAP_SLOP = 8;
const MAX_GUESTS = 4;

const reduceMotion = () =>
  (typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ||
  (typeof document !== 'undefined' &&
    document.documentElement.dataset.reduceMotion !== undefined &&
    !['false', '0'].includes(document.documentElement.dataset.reduceMotion));

const SLOT_LABEL: Record<string, string> = {
  sofa: 'Sofa',
  bed: 'Bed',
  desk: 'Desk',
  tv: 'TV',
  plants: 'Plants',
  art: 'Art',
  kitchen: 'Kitchen',
  sound: 'Sound system',
  gaming: 'Console',
  fridge: 'Fridge',
  washer: 'Washing machine',
  cooling: 'Air conditioning',
  power: 'Backup power',
  lights: 'Lamp',
  rug: 'Rug',
  dining: 'Dining table',
  wardrobe: 'Wardrobe',
  books: 'Bookshelf',
  coffee: 'Coffee machine',
  wifi: 'Wi-Fi',
  laptop: 'Laptop',
};
const slotLabel = (s: string) => t(SLOT_LABEL[s] ?? 'Furniture');

const NEED_ICON: Record<NeedKey, string> = { hunger: '🍲', hygiene: '🚿', fun: '🎮', social: '💬' };
const needLabel = (k: NeedKey) =>
  ({ hunger: t('Hunger'), hygiene: t('Hygiene'), fun: t('Fun'), social: t('Social') })[k];

/** Something you can tap in the flat. */
interface Obj {
  id: string;
  label: string;
  spot: Spot;
  verbs: Verb[];
  art: ReactNode;
  /** `data-furniture` (the slot) and whether you own it. */
  slot?: string;
  owned?: boolean;
  /** Draw order: the footprint's bottom edge. */
  base: number;
}

interface Person {
  id: string;
  name: string;
  look: AvatarLook;
  x: number;
  y: number;
  path: Tile[];
  /** Where on the path we're heading. */
  i: number;
  facing: 1 | -1;
  /** Snapped onto a seat or a bed (px offsets from the tile grid). */
  pose: 'stand' | 'sit' | 'lie';
  at?: { x: number; y: number };
  arrive?: () => void;
  tile: string;
}

interface Guest {
  personId: string;
  name: string;
}

/** Guests stay for this session (client-side). */
const GUESTS = new Map<string, Guest[]>();

const tileOf = (p: { x: number; y: number }) => key(Math.round(p.x), Math.round(p.y));

function newPerson(id: string, name: string, look: AvatarLook, at: Tile): Person {
  return {
    id,
    name,
    look,
    x: at.x,
    y: at.y,
    path: [],
    i: 0,
    facing: 1,
    pose: 'stand',
    tile: key(at.x, at.y),
  };
}

/** Pixel position of a person's feet. */
function feet(p: Person): { x: number; y: number } {
  if (p.at) return p.at;
  return { x: (p.x + 0.5) * TILE, y: (p.y + 0.72) * TILE };
}

/** Draw-order key for a person. */
function baseOf(p: Person): number {
  if (p.pose !== 'stand' && p.at) return p.at.y / TILE + (p.pose === 'lie' ? 1.3 : 0.6);
  return p.y + 0.72;
}

const GUEST_BG = ['f-dropout', 'i-first', 'b-wealthy', 'f-corporate', 'i-operator', 'b-fintech'];
const guestLook = (personId: string) =>
  avatarLook(GUEST_BG[hash(personId) % GUEST_BG.length], personId);

/**
 * Wave 8 §C: a friend's home you're visiting, shown read-only (no acts, no
 * shopping): their tier and furniture, with them in it.
 */
export interface HostView {
  id: string;
  name: string;
  tier: number;
  tiers: Map<string, number>;
}

export function HomeScene({
  place,
  title,
  onClose,
  onVisit,
  places,
  hostView,
}: SceneProps & { hostView?: HostView }) {
  const { view, send, busy, cur, toast } = useView();
  const tier = Math.max(1, Math.min(5, hostView?.tier ?? view.me.lifestyle?.tier ?? 2));
  const basePlan = planFor(tier);
  const tiers = useMemo(() => hostView?.tiers ?? ownedTiers(view), [view, hostView]);
  const ownedKey = [...tiers.keys()].sort().join(',');
  const owned = useMemo(() => new Set(ownedKey ? ownedKey.split(',') : []), [ownedKey]);
  // Wave 9 §C: where you moved things in Buy mode (this device only).
  const placeOwner = hostView?.id ?? view.me.id;
  const [placements, setPlacements] = useState<Record<string, Placement>>(() =>
    loadPlacements(placeOwner, MOVABLE),
  );
  const plan = useMemo(
    () => withPlacements(basePlan, owned, placements),
    [basePlan, owned, placements],
  );
  // ---- 3D (Wave 9 §C): drawn by three.js under this scene's invisible 2D hit layer.
  const want3d = use3d();
  const [ready3d, setReady3d] = useState(false);
  const is3d = want3d && ready3d;
  const api3d = useRef<Home3DApi | null>(null);
  const mat3d = useRef<string | null>(null);
  const grid: Grid = useMemo(
    () => ({ w: plan.w, h: plan.h, blocked: blockedTiles(plan, owned), walls: wallEdges(plan) }),
    [plan, owned],
  );
  // Wave 12: the city's real sun (sunrise and sunset at their real times).
  const sun = useSun(view.market.id);
  const night = sun.night > 0.5;
  const dusk = !night && dayLightOf(sun) !== 'day';
  const car = hostView ? null : carOf(view);
  const needs = needsOf(view);
  const mood = moodOf(view);

  // ---- Showrooms (Edit, and the "+" spots)
  const showroomFor = useCallback(
    (want: 'furniture' | 'appliance' | 'car') => {
      const doors = new Map((places ?? []).map((p) => [p.id, p.door]));
      return nearest(
        businessesOf(view).filter((b) => {
          if (!b.open) return false;
          const s = sellsOf(view, b);
          if (!s) return false;
          if ('cars' in s) return want === 'car';
          return want !== 'car' && s.slots.some((x) => storeForSlot(x) === want);
        }),
        (b) => doors.get(`biz:${b.id}`),
        place.door,
      );
    },
    [view, places, place.door],
  );
  const goShop = (slot: string) => {
    const s = showroomFor(slot === 'car' ? 'car' : storeForSlot(slot));
    if (s && onVisit) onVisit(`biz:${s.id}`);
    else toast(t('No showroom is open for that right now.'));
  };

  // ---- What's in the flat
  const objects = useMemo(() => buildObjects(plan, tiers, night), [plan, tiers, night]);

  // ---- People
  const meLook = avatarLook(view.me.background?.id, view.me.id, genderOf(view.me));
  const meStart = { x: plan.door.x, y: plan.door.y - 1 };
  const me = useRef<Person>(newPerson('me', view.me.name, meLook, meStart));
  const [guests, setGuests] = useState<Guest[]>(() => {
    if (!hostView) return GUESTS.get(view.me.id) ?? [];
    seenGuests.add(hostView.id); // The host is already home: seated, not walking in.
    return [{ personId: hostView.id, name: hostView.name }];
  });
  const guestPeople = useRef(new Map<string, Person>());
  const guestSpots = useMemo(() => {
    const d = plan.slots.dining!.interact;
    return [plan.seats[1]!, plan.seats[2]!, plan.seats[0]!, d];
  }, [plan]);

  /** Snap a person onto a seat (or stand next to it when it's free floor). */
  const seatAt = useCallback(
    (p: Person, seat: Tile) => {
      p.x = seat.x;
      p.y = seat.y;
      if (owned.has('sofa') && plan.seats.some((s) => s.x === seat.x && s.y === seat.y)) {
        p.pose = 'sit';
        p.at = { x: (seat.x + 0.5) * TILE, y: (seat.y + 0.55) * TILE };
      } else {
        p.pose = 'stand';
        p.at = undefined;
      }
    },
    [owned, plan],
  );

  // ---- Depth sort: React hears when someone changes tile or pose.
  const [depth, setDepth] = useState<Record<string, number>>({});
  const bump = useCallback((p: Person) => {
    const b = Math.round(baseOf(p) * 4) / 4;
    setDepth((d) => (d[p.id] === b ? d : { ...d, [p.id]: b }));
  }, []);

  // ---- Refs the loop writes
  const svgRef = useRef<SVGSVGElement | null>(null);
  const worldRef = useRef<SVGGElement | null>(null);
  const nodes = useRef(new Map<string, SVGGElement>());
  const cam = useRef({ x: 0, y: 0, manual: false, ready: false });
  const [size, setSize] = useState({ w: 360, h: 480 });

  const bounds = useMemo(() => {
    const top = -WALL - 10;
    const bottom = plan.h * TILE + 14 + (car ? 58 : 0);
    return { x0: -12, x1: plan.w * TILE + 12, y0: top, y1: bottom };
  }, [plan, car]);
  const zoom = useMemo(() => {
    const fw = size.w / (bounds.x1 - bounds.x0);
    const fh = size.h / (bounds.y1 - bounds.y0);
    return Math.max(0.72, Math.min(1.75, Math.min(fw, fh)));
  }, [size, bounds]);

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize((s) =>
        Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1
          ? s
          : { w: r.width, h: r.height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Camera target: centred when the flat fits, else following you (clamped). */
  const camTarget = useCallback(() => {
    const vw = size.w / zoom;
    const vh = size.h / zoom;
    const f = feet(me.current);
    const clampAxis = (want: number, lo: number, hi: number, span: number) =>
      hi - lo <= span ? (lo + hi) / 2 : Math.max(lo + span / 2, Math.min(hi - span / 2, want));
    return {
      x: clampAxis(f.x, bounds.x0, bounds.x1, vw),
      y: clampAxis(f.y - 20, bounds.y0, bounds.y1, vh),
    };
  }, [size, zoom, bounds]);

  const writeCamera = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    if (mat3d.current) {
      if (w.getAttribute('transform') !== mat3d.current) w.setAttribute('transform', mat3d.current);
      return;
    }
    const c = cam.current;
    w.setAttribute(
      'transform',
      `translate(${(size.w / 2 - c.x * zoom).toFixed(1)} ${(size.h / 2 - c.y * zoom).toFixed(1)}) scale(${zoom.toFixed(3)})`,
    );
  }, [size, zoom]);

  const writePerson = useCallback((p: Person) => {
    const g = nodes.current.get(p.id);
    if (!g) return;
    const f = feet(p);
    g.setAttribute('transform', `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)})`);
    const walking = p.path.length > 0 && p.i < p.path.length;
    g.classList.toggle('is-walking', walking);
    g.dataset.pose = p.pose;
    g.dataset.tile = p.tile;
    const inner = g.firstElementChild as SVGGElement | null;
    if (inner)
      inner.setAttribute(
        'transform',
        p.pose === 'lie' ? 'scale(0.95)' : `scale(${(p.facing * 0.95).toFixed(2)} 0.95)`,
      );
  }, []);

  // ---- The loop
  const [walkPath, setWalkPath] = useState<Tile[] | null>(null);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const people = () => [me.current, ...guestPeople.current.values()];
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const p of people()) {
        if (p.i < p.path.length) api3d.current?.wake();
        if (p.i >= p.path.length) continue;
        const target = p.path[p.i]!;
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const d = Math.hypot(dx, dy);
        const move = SPEED * dt;
        if (dx !== 0) p.facing = dx > 0 ? 1 : -1;
        if (d <= move) {
          p.x = target.x;
          p.y = target.y;
          p.i++;
        } else {
          p.x += (dx / d) * move;
          p.y += (dy / d) * move;
        }
        const tk = tileOf(p);
        if (tk !== p.tile) {
          p.tile = tk;
          bump(p);
        }
        if (p.i >= p.path.length) {
          p.path = [];
          p.i = 0;
          const done = p.arrive;
          p.arrive = undefined;
          if (p.id === 'me') setWalkPath(null);
          done?.();
          bump(p);
        }
        writePerson(p);
      }
      const c = cam.current;
      const tgt = camTarget();
      if (!c.manual) {
        if (!c.ready || reduceMotion()) {
          c.x = tgt.x;
          c.y = tgt.y;
          c.ready = true;
        } else {
          c.x += (tgt.x - c.x) * Math.min(1, dt * 6);
          c.y += (tgt.y - c.y) * Math.min(1, dt * 6);
        }
      }
      writeCamera();
      raf = requestAnimationFrame(step);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(step);
    };
    const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    for (const p of people()) writePerson(p);
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [bump, camTarget, writeCamera, writePerson]);

  /** Walk a person towards a tile (or the nearest walkable one); `arrive` runs at the end. */
  const walk = useCallback(
    (p: Person, to: Tile, arrive?: () => void) => {
      const from = { x: Math.round(p.x), y: Math.round(p.y) };
      if (p.pose !== 'stand') {
        p.pose = 'stand';
        p.at = undefined;
      }
      // Standing on something (off a seat): start from the nearest free tile.
      const start = walkable(grid, from.x, from.y)
        ? from
        : (pathTowards(grid, plan.door, from)?.at(-1) ?? plan.door);
      const path = pathTowards(grid, start, to) ?? [start];
      if (reduceMotion()) {
        const end = path[path.length - 1]!;
        p.x = end.x;
        p.y = end.y;
        p.path = [];
        p.i = 0;
        p.tile = key(end.x, end.y);
        writePerson(p);
        bump(p);
        arrive?.();
        return path;
      }
      p.x = start.x;
      p.y = start.y;
      p.path = path;
      p.i = 0;
      p.arrive = arrive;
      return path;
    },
    [grid, plan, writePerson, bump],
  );

  // Guests: spawn at the door and walk to a seat (or appear seated when reopening).
  useEffect(() => {
    const map = guestPeople.current;
    guests.forEach((g, n) => {
      if (map.has(g.personId)) return;
      const p = newPerson(`guest:${g.personId}`, g.name, guestLook(g.personId), plan.door);
      map.set(g.personId, p);
      const seat = guestSpots[n % guestSpots.length]!;
      if (seenGuests.has(g.personId)) seatAt(p, seat);
      else {
        seenGuests.add(g.personId);
        walk(p, seat, () => {
          seatAt(p, seat);
          writePerson(p);
          bump(p);
        });
      }
      bump(p);
    });
  }, [guests, guestSpots, plan, seatAt, walk, writePerson, bump]);

  // ---- Interaction state
  const [menuState, setMenuState] = useState<{ obj: Obj; at: { x: number; y: number } } | null>(
    null,
  );
  const menu = menuState?.obj ?? null;
  const setMenu = (o: Obj | null) => {
    if (!o) return setMenuState(null);
    if (is3d && api3d.current) {
      const s = o.spot;
      const at = api3d.current.project(s.x + s.w / 2, s.y + s.h / 2, s.wall ? 2.2 : 1.3);
      return setMenuState({ obj: o, at });
    }
    const c = cam.current;
    const ox = (o.spot.x + o.spot.w / 2) * TILE;
    const oy = o.spot.wall ? -WALL / 2 : o.spot.y * TILE;
    setMenuState({
      obj: o,
      at: { x: (ox - c.x) * zoom + size.w / 2, y: (oy - c.y) * zoom + size.h / 2 },
    });
  };
  const [sheet, setSheet] = useState<'edit' | 'invite' | 'buy' | null>(null);
  const [ring, setRing] = useState<{ x: number; y: number; n: number } | null>(null);
  const [acting, setActing] = useState<{
    act: HomeAct;
    x: number;
    y: number;
    obj?: string;
  } | null>(null);
  const [floats, setFloats] = useState<
    { id: number; text: string; x: number; y: number; tone: string; sx: number; sy: number }[]
  >([]);
  // ---- Buy mode: the thing you're placing.
  const [placing, setPlacing] = useState<{ slot: string; label: string; p: Placement } | null>(
    null,
  );
  const ghost: Ghost | null = useMemo(() => {
    if (!placing) return null;
    const base = basePlan.slots[placing.slot];
    if (!base) return null;
    return {
      slot: placing.slot,
      tier: tiers.get(placing.slot) ?? 1,
      spot: placedSpot(base, placing.p),
      ok: canPlace(plan, owned, placing.slot, placing.p),
    };
  }, [placing, basePlan, plan, owned, tiers]);
  const startPlacing = (slot: string, label: string) => {
    if (!MOVABLE.has(slot)) return;
    const s = plan.slots[slot];
    if (!s) return;
    const rot = (s as { rot?: number }).rot ?? 0;
    setSheet(null);
    setMenuState(null);
    setPlacing({ slot, label, p: { x: s.x, y: s.y, rot } });
  };
  const finishPlacing = () => {
    if (!placing || !ghost?.ok) return;
    const p = placing.p;
    savePlacement(placeOwner, placing.slot, p);
    setPlacements((xs) => ({ ...xs, [placing.slot]: p }));
    setPlacing(null);
  };
  const resetPlacing = () => {
    if (!placing) return;
    savePlacement(placeOwner, placing.slot, null);
    setPlacements((xs) => {
      const next = { ...xs };
      delete next[placing.slot];
      return next;
    });
    setPlacing(null);
  };
  const floatId = useRef(0);
  const actTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(actTimer.current), []);

  const float = useCallback((lines: { text: string; tone: string }[]) => {
    const f = feet(me.current);
    const add = lines.map((l, n) => ({
      id: ++floatId.current,
      ...l,
      x: f.x,
      y: f.y - 52 - n * 14,
      // In 3D: over your head on screen, one line under another.
      ...(() => {
        const at = api3d.current?.project(me.current.x + 0.5, me.current.y + 0.5, 2.0);
        return { sx: at?.x ?? 0, sy: (at?.y ?? 0) - n * 18 };
      })(),
    }));
    setFloats((xs) => [...xs, ...add]);
    window.setTimeout(
      () => setFloats((xs) => xs.filter((x) => !add.some((a) => a.id === x.id))),
      2200,
    );
  }, []);

  const runAct = useCallback(
    async (act: HomeAct, obj: Obj) => {
      const p = me.current;
      if (act === 'sleep' || act === 'nap') {
        p.pose = 'lie';
        p.at = {
          x: (obj.spot.x + obj.spot.w / 2) * TILE,
          y: (obj.spot.y + 1.9) * TILE,
        };
        writePerson(p);
        bump(p);
      }
      const f = feet(p);
      setActing({ act, x: f.x, y: f.y, obj: obj.id });
      await new Promise<void>((res) => {
        actTimer.current = window.setTimeout(res, reduceMotion() ? 250 : ACT_MS);
      });
      setActing(null);
      if (p.pose === 'lie') {
        p.pose = 'stand';
        p.at = undefined;
        writePerson(p);
        bump(p);
      }
      const r = await send<{ effects?: Record<string, number>; cost?: number }>({
        type: 'home.act',
        act,
      });
      if (!r) return;
      const lines: { text: string; tone: string }[] = [];
      const e = r.effects ?? {};
      const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
      if (e.energy) lines.push({ text: t('{n} energy', { n: sign(e.energy) }), tone: 'energy' });
      for (const k of NEEDS)
        if (e[k])
          lines.push({
            text: t('{n} {need}', { n: sign(e[k]), need: needLabel(k).toLowerCase() }),
            tone: k,
          });
      if (e.hours) lines.push({ text: t('+{n}h', { n: e.hours }), tone: 'hours' });
      if (r.cost) lines.push({ text: `−${money(r.cost, cur)}`, tone: 'money' });
      if (!lines.length) lines.push({ text: t('Feeling good'), tone: 'fun' });
      float(lines);
    },
    [send, cur, float, writePerson, bump],
  );

  const choose = (obj: Obj, v: Verb) => {
    setMenu(null);
    if (v.id === 'out') return onClose();
    if (v.id === 'invite') return setSheet('invite');
    if (v.id === 'order') return openPhone({ app: 'chop' } as unknown as PhoneOpen);
    if ('slot' in v) return goShop(v.slot);
    if ('move' in v) return startPlacing(v.move, obj.label);
    const p = me.current;
    if (v.id === 'sit') {
      const seat = plan.seats[0]!;
      const path = walk(p, obj.spot.interact, () => {
        seatAt(p, seat);
        writePerson(p);
        bump(p);
      });
      setWalkPath(reduceMotion() ? null : path);
      return;
    }
    if ('act' in v) {
      const act = v.act;
      const path = walk(p, obj.spot.interact, () => {
        const sx = obj.spot.x + obj.spot.w / 2 - 0.5;
        if (sx !== p.x) p.facing = sx > p.x ? 1 : -1;
        writePerson(p);
        void runAct(act, obj);
      });
      setWalkPath(reduceMotion() ? null : path);
    }
  };

  // ---- Pointer: tap to walk or open a thing, drag to pan.
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(
    null,
  );
  const toWorld = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const c = cam.current;
    return {
      x: (clientX - r.left - size.w / 2) / zoom + c.x,
      y: (clientY - r.top - size.h / 2) / zoom + c.y,
    };
  };
  // 3D: one finger orbits, two pinch to zoom.
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  /** A tap on a tile while placing: the thing moves there (centred on it). */
  const placeAt = (tx: number, ty: number) => {
    if (!placing) return;
    const base = basePlan.slots[placing.slot]!;
    const turned = placing.p.rot % 2 === 1;
    const w = turned ? base.h : base.w;
    const h = turned ? base.w : base.h;
    setPlacing({
      ...placing,
      p: {
        ...placing.p,
        x: Math.max(0, Math.min(plan.w - w, tx - Math.floor((w - 1) / 2))),
        y: Math.max(0, Math.min(plan.h - h, ty - Math.floor((h - 1) / 2))),
      },
    });
  };
  const onDown = (e: React.PointerEvent) => {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      cx: cam.current.x,
      cy: cam.current.y,
      moved: false,
    };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const prev = pts.current.get(e.pointerId);
    if (prev) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (is3d && api3d.current) {
      if (pts.current.size >= 2) {
        const [a, b] = [...pts.current.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch.current > 0 && dist > 0) api3d.current.zoom(dist / pinch.current);
        pinch.current = dist;
        d.moved = true;
        return;
      }
      if (!d.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      if (!d.moved) setMenu(null);
      d.moved = true;
      if (prev) api3d.current.orbit(e.clientX - prev.x, e.clientY - prev.y);
      return;
    }
    if (!d.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    d.moved = true;
    const fitsW = bounds.x1 - bounds.x0 <= size.w / zoom;
    const fitsH = bounds.y1 - bounds.y0 <= size.h / zoom;
    if (fitsW && fitsH) return;
    const c = cam.current;
    c.manual = true;
    const vw = size.w / zoom;
    const vh = size.h / zoom;
    const cl = (v: number, lo: number, hi: number, span: number) =>
      hi - lo <= span ? (lo + hi) / 2 : Math.max(lo + span / 2, Math.min(hi - span / 2, v));
    c.x = cl(d.cx - dx / zoom, bounds.x0, bounds.x1, vw);
    c.y = cl(d.cy - dy / zoom, bounds.y0, bounds.y1, vh);
    setMenu(null);
  };
  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    const d = drag.current;
    if (pts.current.size === 0) drag.current = null;
    if (!d || d.moved || acting) return;
    if (is3d && api3d.current) {
      const r = svgRef.current!.getBoundingClientRect();
      const hit = api3d.current.pick(e.clientX - r.left, e.clientY - r.top);
      if (placing) {
        if (hit?.tile) placeAt(hit.tile.x, hit.tile.y);
        return;
      }
      // The 3D thing under your finger wins; else the 2D hit layer; else the floor.
      const svgObj = hostView ? null : (e.target as Element).closest?.('[data-obj]');
      const id = hostView ? undefined : (hit?.obj ?? svgObj?.getAttribute('data-obj') ?? undefined);
      const obj = id ? objects.find((o) => o.id === id) : undefined;
      if (obj) {
        setMenu(menu?.id === obj.id ? null : obj);
        return;
      }
      setMenu(null);
      if (!hit?.tile) return;
      const path = walk(me.current, hit.tile);
      setWalkPath(reduceMotion() ? null : path);
      setRing({ x: (hit.tile.x + 0.5) * TILE, y: (hit.tile.y + 0.5) * TILE, n: Date.now() });
      return;
    }
    if (placing) {
      const w = toWorld(e.clientX, e.clientY);
      placeAt(Math.floor(w.x / TILE), Math.floor(w.y / TILE));
      return;
    }
    const el = hostView ? null : (e.target as Element).closest?.('[data-obj]');
    if (el) {
      const obj = objects.find((o) => o.id === el.getAttribute('data-obj'));
      if (obj) {
        setMenu(menu?.id === obj.id ? null : obj);
        return;
      }
    }
    setMenu(null);
    const w = toWorld(e.clientX, e.clientY);
    const tx = Math.floor(w.x / TILE);
    const ty = Math.floor(w.y / TILE);
    if (tx < 0 || ty < 0 || tx >= plan.w || ty >= plan.h) return;
    cam.current.manual = false;
    const path = walk(me.current, { x: tx, y: ty });
    setWalkPath(reduceMotion() ? null : path);
    setRing({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, n: Date.now() });
  };
  const onKey = (e: React.KeyboardEvent) => {
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[
      e.key
    ];
    if (!dir || acting) return;
    e.preventDefault();
    const p = me.current;
    cam.current.manual = false;
    walk(p, { x: Math.round(p.x) + dir[0]!, y: Math.round(p.y) + dir[1]! });
  };

  const addGuest = (g: Guest) => {
    setGuests((xs) => {
      const next = [...xs.filter((x) => x.personId !== g.personId), g].slice(-MAX_GUESTS);
      GUESTS.set(view.me.id, next);
      for (const id of guestPeople.current.keys())
        if (!next.some((x) => x.personId === id)) guestPeople.current.delete(id);
      return next;
    });
  };
  const invite = async (personId: string, name: string) => {
    const r = await send<{
      guest?: { name?: string };
      effects?: { social?: number; fun?: number };
      cost?: number;
    }>({
      type: 'home.invite',
      personId,
    });
    if (!r) return;
    setSheet(null);
    addGuest({ personId, name: r.guest?.name ?? name });
    const lines: { text: string; tone: string }[] = [];
    if (r.effects?.social)
      lines.push({
        text: t('{n} {need}', {
          n: `+${r.effects.social}`,
          need: needLabel('social').toLowerCase(),
        }),
        tone: 'social',
      });
    if (r.effects?.fun)
      lines.push({
        text: t('{n} {need}', { n: `+${r.effects.fun}`, need: needLabel('fun').toLowerCase() }),
        tone: 'fun',
      });
    if (r.cost) lines.push({ text: `−${money(r.cost, cur)}`, tone: 'money' });
    float(lines);
  };

  // ---- Draw order
  const people = [
    { id: 'me', name: view.me.name, look: meLook, base: meStart.y + 0.72 },
    ...guests.map((g) => ({
      id: `guest:${g.personId}`,
      name: g.name,
      look: guestLook(g.personId),
      base: plan.door.y + 0.72,
    })),
  ];
  const personOf = (id: string) =>
    id === 'me' ? me.current : guestPeople.current.get(id.slice('guest:'.length));
  const sorted = useMemo(() => {
    const items: { k: string; base: number; node: ReactNode }[] = [];
    for (const o of objects)
      if (!o.spot.wall && o.spot.blocked !== false)
        items.push({ k: o.id, base: o.base, node: <ObjNode key={o.id} o={o} /> });
    for (const o of objects)
      if (!o.spot.wall && o.spot.blocked === false && o.id !== 'rug')
        items.push({ k: o.id, base: o.base - 0.5, node: <ObjNode key={o.id} o={o} /> });
    plan.walls.forEach((s, n) => {
      const x = s.x * TILE;
      const y = s.y * TILE;
      items.push({
        k: `wall${n}`,
        base: s.dir === 'h' ? s.y + 0.05 : s.y + 1,
        node:
          s.dir === 'h' ? (
            <g key={`wall${n}`} className="home-wall">
              <rect
                x={x - 1}
                y={y - 12}
                width={TILE + 2}
                height={10}
                fill="var(--home-wall-face)"
              />
              <rect x={x - 1} y={y - 15} width={TILE + 2} height={5} fill="var(--home-wall-top)" />
            </g>
          ) : (
            <g key={`wall${n}`} className="home-wall">
              <rect x={x - 3} y={y - 15} width={6} height={TILE + 3} fill="var(--home-wall-top)" />
            </g>
          ),
      });
    });
    return items;
  }, [objects, plan]);
  const drawn = [...sorted];
  for (const p of people)
    drawn.push({
      k: p.id,
      base: depth[p.id] ?? p.base,
      node: (
        <g
          key={p.id}
          className={`home-person${p.id === 'me' ? ' is-me' : ''}`}
          data-home-avatar={p.id === 'me' ? '' : undefined}
          data-guest={p.id === 'me' ? undefined : p.id.slice('guest:'.length)}
          ref={(el) => {
            if (el) {
              nodes.current.set(p.id, el);
              const q = personOf(p.id);
              if (q) writePerson(q);
            } else nodes.current.delete(p.id);
          }}
        >
          <g>
            <ellipse cx="0" cy="0" rx="11" ry="4" fill="#000" opacity="0.16" />
            <g className="city-avatar">
              <AvatarFigure look={p.look} />
            </g>
          </g>
          {p.id !== 'me' && (
            <g className="home-tag" transform="translate(0 -50)">
              <rect
                x={-p.name.split(' ')[0]!.length * 3.2 - 6}
                y={-8}
                width={p.name.split(' ')[0]!.length * 6.4 + 12}
                height={13}
                rx={6.5}
              />
              <text y={2} textAnchor="middle">
                {p.name.split(' ')[0]}
              </text>
            </g>
          )}
        </g>
      ),
    });
  drawn.sort((a, b) => a.base - b.base || (a.k < b.k ? -1 : 1));

  const menuAt = menuState?.at ?? null;

  // ---- What the 3D view needs.
  const objects3d = useMemo(
    () =>
      objects.map((o) => ({
        id: o.id,
        label: o.label,
        spot: o.spot,
        slot: o.slot,
        owned: o.owned,
        tier: o.slot ? (tiers.get(o.slot) ?? 1) : 1,
      })),
    [objects, tiers],
  );
  const people3d = useCallback((): Home3DPerson[] => {
    const out: Home3DPerson[] = [];
    for (const p of [me.current, ...guestPeople.current.values()])
      out.push({ id: p.id, look: p.look, x: p.x, y: p.y, pose: p.pose });
    return out;
  }, []);
  const onCamera3d = useCallback(
    (m: string) => {
      mat3d.current = m;
      writeCamera();
    },
    [writeCamera],
  );
  const onReady3d = useCallback(() => setReady3d(true), []);
  const acting3d = useMemo(() => (acting ? { act: acting.act, obj: acting.obj } : null), [acting]);
  useEffect(() => {
    if (!want3d) mat3d.current = null;
  }, [want3d]);

  const inviteLeft = actsLeft(view, 'invite');
  const pocket = view.accounts.local?.balance ?? 0;
  const homeName = hostView
    ? t('{name}’s place', { name: hostView.name.split(' ')[0]! })
    : t(TIER_HOME[tier - 1]!);

  return (
    <div
      className={`place-scene home-scene${is3d ? ' is-3d' : ''}${placing ? ' is-placing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-room="apartment"
      data-scene={place.id}
      data-tier={tier}
      data-night={night ? '1' : '0'}
      data-energy={view.me.energy}
      data-pocket={pocket}
      data-host-view={hostView?.id}
    >
      <header className="home-hud">
        <div
          className="home-mood"
          data-mood={mood}
          title={t('Mood {n}', { n: mood })}
          aria-label={t('Mood {n}', { n: mood })}
        >
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="16" className="home-mood-track" />
            <circle
              cx="20"
              cy="20"
              r="16"
              className="home-mood-fill"
              strokeDasharray={`${(mood / 100) * 100.5} 100.5`}
              data-low={mood < 30 ? '1' : undefined}
            />
          </svg>
          <b>{mood}</b>
        </div>
        <div className="home-needs" role="list" aria-label={t('Needs')}>
          {needs &&
            NEEDS.map((k) => (
              <span
                key={k}
                role="listitem"
                className={`home-need${needs[k] < 40 ? ' is-low' : ''}`}
                data-need={k}
                data-value={needs[k]}
                title={`${needLabel(k)} ${needs[k]}`}
                aria-label={`${needLabel(k)} ${needs[k]}`}
              >
                <span aria-hidden="true">{NEED_ICON[k]}</span>
                <i>
                  <i style={{ width: `${needs[k]}%` }} />
                </i>
              </span>
            ))}
        </div>
        <div className="home-title">
          <b>{homeName}</b>
          <span>⚡ {view.me.energy}</span>
        </div>
        <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="home-stage">
        {want3d && (
          <Suspense fallback={null}>
            <Home3D
              plan={plan}
              tier={tier}
              objects={objects3d}
              people={people3d}
              acting={acting3d}
              night={night}
              dusk={dusk}
              sun={sun}
              car={car?.modelId ?? null}
              buyMode={sheet === 'buy' || !!placing}
              sheetOpen={sheet === 'buy'}
              ghost={ghost}
              moving={placing?.slot ?? null}
              api={api3d}
              onCamera={onCamera3d}
              onReady={onReady3d}
              reduced={reduceMotion()}
            />
          </Suspense>
        )}
        <svg
          ref={svgRef}
          className="home-svg"
          width={size.w}
          height={size.h}
          role="application"
          aria-label={t('Your home. Tap the floor to walk, tap things to use them.')}
          tabIndex={0}
          data-home-grid=""
          data-w={plan.w}
          data-h={plan.h}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={(e) => {
            pts.current.delete(e.pointerId);
            drag.current = null;
          }}
          onWheel={(e) => is3d && api3d.current?.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1)}
          onKeyDown={onKey}
        >
          <defs>
            <radialGradient id="home-glow">
              <stop offset="0" stopColor="#fde68a" stopOpacity="0.55" />
              <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
            </radialGradient>
            <pattern id="home-wood" width="32" height="12" patternUnits="userSpaceOnUse">
              <rect width="32" height="12" fill="var(--home-wood)" />
              <path d="M0 11.5 H32 M20 0 V12" stroke="var(--home-wood-line)" strokeWidth="1" />
            </pattern>
            <pattern id="home-tile" width="16" height="16" patternUnits="userSpaceOnUse">
              <rect width="16" height="16" fill="var(--home-tile)" />
              <rect width="8" height="8" fill="var(--home-tile-2)" />
              <rect x="8" y="8" width="8" height="8" fill="var(--home-tile-2)" />
            </pattern>
            <pattern id="home-bath" width="12" height="12" patternUnits="userSpaceOnUse">
              <rect width="12" height="12" fill="var(--home-bath)" />
              <path d="M0 11.5 H12 M11.5 0 V12" stroke="var(--home-bath-line)" strokeWidth="1" />
            </pattern>
          </defs>
          <g ref={worldRef}>
            <Shell plan={plan} night={night} />
            {objects
              .filter((o) => o.id === 'rug')
              .map((o) => (
                <ObjNode key={o.id} o={o} />
              ))}
            <g className="home-tiles">
              {Array.from({ length: plan.w * plan.h }, (_, n) => {
                const x = n % plan.w;
                const y = Math.floor(n / plan.w);
                return (
                  <rect
                    key={n}
                    data-tile={key(x, y)}
                    x={x * TILE}
                    y={y * TILE}
                    width={TILE}
                    height={TILE}
                  />
                );
              })}
            </g>
            {walkPath && walkPath.length > 1 && (
              <polyline
                className="home-path"
                points={walkPath
                  .map((p) => `${(p.x + 0.5) * TILE},${(p.y + 0.5) * TILE}`)
                  .join(' ')}
              />
            )}
            {ring && <circle key={ring.n} className="home-ring" cx={ring.x} cy={ring.y} r="13" />}
            <g className="home-wallitems">
              {objects
                .filter((o) => o.spot.wall)
                .map((o) => (
                  <ObjNode key={o.id} o={o} />
                ))}
            </g>
            <g className="home-objects">{drawn.map((d) => d.node)}</g>
            <Front plan={plan} />
            {car && (
              <g
                data-car={car.label}
                transform={`translate(${(plan.door.x + 2) * TILE} ${plan.h * TILE + 20})`}
              >
                <rect
                  x={-20}
                  y={-6}
                  width={plan.w * TILE - (plan.door.x + 2) * TILE + 20}
                  height={44}
                  fill="#9ca3af"
                  opacity="0.5"
                />
                <rect x={0} y={2} width={70} height={28} rx={9} fill="#dc2626" />
                <rect x={14} y={6} width={34} height={20} rx={5} fill="#1f2937" opacity="0.8" />
                <circle cx={14} cy={31} r={5} fill="#111827" />
                <circle cx={56} cy={31} r={5} fill="#111827" />
              </g>
            )}
            {acting && !is3d && <ActFx act={acting.act} x={acting.x} y={acting.y} />}
            {ghost && !is3d && (
              <rect
                className="home-ghost"
                data-ok={ghost.ok ? '1' : '0'}
                x={ghost.spot.x * TILE}
                y={ghost.spot.y * TILE}
                width={ghost.spot.w * TILE}
                height={ghost.spot.h * TILE}
                rx={4}
              />
            )}
            {objects
              .filter((o) => !hostView && o.slot && !o.owned)
              .map((o) => (
                <g
                  key={`plus-${o.id}`}
                  className="home-plus"
                  data-obj={o.id}
                  data-furniture={o.slot}
                  data-owned="0"
                  role="button"
                  aria-label={t('Get a {thing}', { thing: slotLabel(o.slot!).toLowerCase() })}
                  transform={plusAt(o)}
                >
                  <circle r="7.5" />
                  <path d="M-4 0 H4 M0 -4 V4" />
                </g>
              ))}
            {(night || dusk) && (
              <rect
                className="home-tint"
                x={bounds.x0 - 40}
                y={bounds.y0 - 40}
                width={bounds.x1 - bounds.x0 + 80}
                height={bounds.y1 - bounds.y0 + 80}
                fill={night ? '#0b1440' : '#f97316'}
                opacity={night ? 0.32 : 0.08}
              />
            )}
            {(is3d ? [] : floats).map((f) => (
              <text
                key={f.id}
                className={`home-float tone-${f.tone}`}
                x={f.x}
                y={f.y}
                textAnchor="middle"
              >
                {f.text}
              </text>
            ))}
          </g>
        </svg>
        {is3d &&
          floats.map((f) => (
            <span
              key={f.id}
              className={`home-float home-float-3d tone-${f.tone}`}
              style={{ left: f.sx, top: f.sy }}
            >
              {f.text}
            </span>
          ))}
        {is3d && !placing && (
          <div className="home-cam" role="group" aria-label={t('Camera')}>
            <button
              type="button"
              aria-label={t('Turn left')}
              onClick={() => api3d.current?.turn(-1)}
            >
              ⟲
            </button>
            <button
              type="button"
              aria-label={t('Turn right')}
              onClick={() => api3d.current?.turn(1)}
            >
              ⟳
            </button>
            <button
              type="button"
              aria-label={t('Zoom in')}
              onClick={() => api3d.current?.zoom(1.25)}
            >
              +
            </button>
            <button
              type="button"
              aria-label={t('Zoom out')}
              onClick={() => api3d.current?.zoom(0.8)}
            >
              −
            </button>
          </div>
        )}
        {placing && ghost && (
          <PlaceBar
            label={placing.label}
            ok={ghost.ok}
            moved={!!placements[placing.slot]}
            onRotate={() =>
              setPlacing({ ...placing, p: { ...placing.p, rot: (placing.p.rot + 1) % 4 } })
            }
            onNudge={(dx, dy) =>
              setPlacing({
                ...placing,
                p: { ...placing.p, x: placing.p.x + dx, y: placing.p.y + dy },
              })
            }
            onDone={finishPlacing}
            onReset={resetPlacing}
            onCancel={() => setPlacing(null)}
          />
        )}
        {menu && menuAt && (
          <PieMenu
            obj={menu}
            at={menuAt}
            width={size.w}
            busy={busy}
            left={(act) => actsLeft(view, act)}
            onPick={(v) => choose(menu, v)}
            onClose={() => setMenu(null)}
          />
        )}
      </div>
      <nav className="home-bar" aria-label={t('Home actions')}>
        {hostView ? (
          <button type="button" className="home-bar-btn" onClick={onClose}>
            <span aria-hidden="true">👋</span>
            {t('Say goodbye')}
          </button>
        ) : (
          <>
            <button type="button" className="home-bar-btn" onClick={() => setSheet('buy')}>
              <span aria-hidden="true">🛒</span>
              {t('Buy')}
            </button>
            <button type="button" className="home-bar-btn" onClick={() => setSheet('edit')}>
              <span aria-hidden="true">🛋</span>
              {t('Edit')}
            </button>
            <button type="button" className="home-bar-btn" onClick={() => setSheet('invite')}>
              <span aria-hidden="true">👋</span>
              {t('Invite')}
            </button>
            <button type="button" className="home-bar-btn" onClick={onClose}>
              <span aria-hidden="true">🚪</span>
              {t('Go out')}
            </button>
          </>
        )}
      </nav>
      {sheet === 'buy' && (
        <BuySheet
          owned={tiers}
          placed={placements}
          onClose={() => setSheet(null)}
          onPlace={startPlacing}
        />
      )}
      {sheet && sheet !== 'buy' && (
        <div className="home-sheet-back" onClick={() => setSheet(null)}>
          <section
            className="home-sheet"
            role="dialog"
            aria-label={sheet === 'edit' ? t('Furnish your home') : t('Invite someone over')}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h3>{sheet === 'edit' ? t('Furnish your home') : t('Invite someone over')}</h3>
              <button
                type="button"
                className="icon-btn"
                aria-label={t('Close')}
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </header>
            {sheet === 'edit' ? (
              <EditList
                comfort={(view.me as unknown as { home?: { comfort?: number } }).home?.comfort ?? 0}
                owned={owned.size}
                showroom={showroomFor}
                car={car?.label ?? null}
                onGo={(id) => onVisit?.(`biz:${id}`)}
              />
            ) : (
              <InviteList
                view={view}
                left={inviteLeft}
                busy={busy}
                guests={guests.length}
                onInvite={(id, name) => void invite(id, name)}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** Where a "+" sits: the spot's centre, or its corner when something else stands there. */
function plusAt(o: Obj): string {
  const s = o.spot;
  if (s.wall) return `translate(${(s.x + s.w / 2) * TILE} ${-WALL / 2})`;
  if (o.slot === 'laptop') return `translate(${s.x * TILE + 8} ${(s.y + 1) * TILE - 6})`;
  const corner = ['bed', 'kitchen', 'sofa'].includes(o.slot ?? '');
  const x = corner ? (s.x + s.w) * TILE - 10 : (s.x + s.w / 2) * TILE;
  const y = corner ? s.y * TILE + 10 : (s.y + s.h / 2) * TILE;
  return `translate(${x} ${y})`;
}

/** Guests you've seen walk in this session (reopening shows them seated). */
const seenGuests = new Set<string>();

// ---------------------------------------------------------------------------
// What's in the flat

function buildObjects(plan: HomePlan, tiers: Map<string, number>, night: boolean): Obj[] {
  const out: Obj[] = [];
  const has = (s: string) => tiers.has(s);
  const tierOf = (s: string) => tiers.get(s) ?? 1;
  const act = (id: HomeAct, label: string): Verb => ({ id, act: id, label });
  const buy = (
    slot: string,
    label = t('Get a {thing}', { thing: slotLabel(slot).toLowerCase() }),
  ): Verb => ({
    id: 'buy',
    label,
    slot,
  });
  const upgrade = (slot: string): Verb => ({ id: 'buy', label: t('Upgrade'), slot });
  const push = (o: Omit<Obj, 'base'>) => out.push({ ...o, base: o.spot.y + o.spot.h });
  const slotObj = (slot: string, verbs: Verb[], extra?: ReactNode) => {
    const s = plan.slots[slot]!;
    push({
      id: slot,
      label: slotLabel(slot),
      spot: s,
      verbs:
        MOVABLE.has(slot) && verbs.length < 4
          ? [...verbs, { id: 'move', label: t('Move'), move: slot }]
          : verbs,
      slot,
      owned: true,
      art: (
        <>
          <SlotArt slot={slot} tier={tierOf(slot)} w={s.w} h={s.h} night={night} />
          {extra}
        </>
      ),
    });
  };
  const fixture = (id: string, fx: keyof HomePlan['fixtures'], label: string, verbs: Verb[]) => {
    const s = plan.fixtures[fx];
    if (!s) return;
    push({ id, label, spot: s, verbs, art: <FixtureArt id={fx} w={s.w} h={s.h} /> });
  };
  const plus = (slot: string) => {
    const s = plan.slots[slot]!;
    out.push({
      id: `plus:${slot}`,
      label: slotLabel(slot),
      spot: { ...s, blocked: false },
      verbs: [buy(slot)],
      slot,
      owned: false,
      art: null,
      base: -99,
    });
  };

  // Bed (or a floor mat).
  if (has('bed')) slotObj('bed', [act('sleep', t('Sleep')), act('nap', t('Nap'))]);
  else
    fixture('bed', 'mat', t('Sleeping mat'), [
      act('sleep', t('Sleep')),
      act('nap', t('Nap')),
      buy('bed'),
    ]);
  // Kitchen (or the kitchenette).
  const kitchenVerbs = [
    act('cook', t('Cook')),
    act('snack', t('Snack')),
    { id: 'order', label: t('Order in') } as Verb,
  ];
  if (has('kitchen')) slotObj('kitchen', kitchenVerbs);
  else fixture('kitchen', 'kitchenette', t('Kitchenette'), kitchenVerbs);
  if (has('fridge'))
    slotObj('fridge', [
      act('snack', t('Snack')),
      act('cook', t('Cook')),
      { id: 'order', label: t('Order in') },
    ]);
  if (has('coffee')) slotObj('coffee', [act('snack', t('Have a coffee'))]);
  // Sofa (or floor cushions).
  const tvVerb = has('tv') ? [act('tv', t('Watch TV'))] : [];
  if (has('sofa'))
    slotObj('sofa', [
      { id: 'sit', label: t('Sit') },
      { id: 'invite', label: t('Invite friend') },
      ...tvVerb,
    ]);
  else
    fixture('sofa', 'cushions', t('Cushions'), [
      { id: 'sit', label: t('Sit') },
      { id: 'invite', label: t('Invite friend') },
      ...tvVerb,
    ]);
  if (has('tv')) slotObj('tv', [act('tv', t('Watch TV'))]);
  if (has('gaming')) slotObj('gaming', [act('game', t('Play'))]);
  if (has('desk'))
    slotObj(
      'desk',
      [act('work', t('Work')), act('read', t('Read'))],
      has('laptop') ? (
        <g data-furniture="laptop" data-owned="1">
          <SlotArt slot="laptop" tier={tierOf('laptop')} w={1} h={1} night={night} />
        </g>
      ) : null,
    );
  else if (has('laptop')) slotObj('laptop', [act('read', t('Read')), buy('desk')]);
  if (has('books')) slotObj('books', [act('read', t('Read'))]);
  if (has('rug')) slotObj('rug', [act('workout', t('Work out'))]);
  for (const slot of [
    'wardrobe',
    'plants',
    'art',
    'lights',
    'sound',
    'washer',
    'cooling',
    'power',
    'wifi',
    'dining',
  ])
    if (has(slot)) slotObj(slot, [upgrade(slot)]);
  // Bathroom.
  if (plan.fixtures['shared-bath'])
    fixture('bathroom', 'shared-bath', t('Shared bathroom'), [
      act('shower', t('Shower')),
      act('toilet', t('Use the toilet')),
    ]);
  fixture('shower', 'shower', t('Shower'), [act('shower', t('Shower'))]);
  fixture('toilet', 'toilet', t('Toilet'), [act('toilet', t('Use'))]);
  fixture('sink', 'sink', t('Sink'), [act('toilet', t('Freshen up'))]);
  fixture('bathtub', 'bathtub', t('Bathtub'), [act('shower', t('Take a bath'))]);
  fixture('pool', 'pool', t('Pool table'), [act('tv', t('Play pool'))]);
  fixture('piano', 'piano', t('Piano'), [act('tv', t('Play the piano'))]);
  fixture('door', 'door', t('Front door'), [{ id: 'out', label: t('Go out') }]);
  // Owned slots carry their verbs; the rest get a "+".
  for (const slot of Object.keys(plan.slots)) if (!has(slot)) plus(slot);
  return out;
}

function ObjNode({ o }: { o: Obj }) {
  if (!o.art) return null;
  const x = o.spot.x * TILE;
  const y = o.spot.wall ? 0 : o.spot.y * TILE;
  return (
    <g
      className="home-obj"
      data-obj={o.id}
      data-furniture={o.owned ? o.slot : undefined}
      data-owned={o.owned ? '1' : undefined}
      role="button"
      aria-label={o.label}
      transform={`translate(${x} ${y})`}
    >
      {o.art}
    </g>
  );
}

/** Floors, the back wall with windows, the side walls. */
function Shell({ plan, night }: { plan: HomePlan; night: boolean }) {
  const W = plan.w * TILE;
  const H = plan.h * TILE;
  const fill = (id: string) =>
    id === 'kitchen'
      ? 'url(#home-tile)'
      : id === 'bathroom'
        ? 'url(#home-bath)'
        : 'url(#home-wood)';
  const windows = plan.rooms.filter((r) => r.y === 0 && r.id !== 'bathroom');
  return (
    <g className="home-shell">
      <rect
        x={-12}
        y={-WALL - 10}
        width={W + 24}
        height={H + WALL + 24}
        rx={6}
        fill="var(--home-outside)"
      />
      {plan.rooms.map((r) => (
        <rect
          key={r.id}
          data-room={r.id}
          x={r.x * TILE}
          y={r.y * TILE}
          width={r.w * TILE}
          height={r.h * TILE}
          fill={fill(r.id)}
        />
      ))}
      <rect x={0} y={0} width={W} height={14} fill="#000" opacity="0.08" />
      {/* The back wall, front face showing. */}
      <rect x={-8} y={-WALL} width={W + 16} height={WALL} fill="var(--home-wall-face)" />
      <rect x={-8} y={-WALL - 8} width={W + 16} height={8} fill="var(--home-wall-top)" />
      <rect x={-8} y={-6} width={W + 16} height={6} fill="var(--home-skirting)" />
      {windows.map((r) => {
        const cx = (r.x + r.w / 2) * TILE + (r.id === 'bedroom' ? TILE : 0);
        return (
          <g key={r.id} transform={`translate(${cx - 22} ${-WALL + 8})`}>
            <rect
              width="44"
              height="24"
              rx="2"
              fill={night ? '#1e2a5a' : '#bae6fd'}
              stroke="#f8fafc"
              strokeWidth="3"
            />
            {night ? (
              <>
                <circle cx="10" cy="7" r="1" fill="#fff" />
                <circle cx="30" cy="12" r="1" fill="#fff" />
                <circle cx="34" cy="6" r="3" fill="#fef9c3" />
              </>
            ) : (
              <path
                d="M2 22 L10 14 L16 18 L24 10 L32 16 L42 12 L42 22 Z"
                fill="#7dd3fc"
                opacity="0.7"
              />
            )}
            <line x1="22" y1="0" x2="22" y2="24" stroke="#f8fafc" strokeWidth="2" />
          </g>
        );
      })}
      <rect x={-8} y={-WALL - 8} width={8} height={H + WALL + 8} fill="var(--home-wall-top)" />
      <rect x={W} y={-WALL - 8} width={8} height={H + WALL + 8} fill="var(--home-wall-top)" />
    </g>
  );
}

/** The front ledge ("walls down") with the door gap. */
function Front({ plan }: { plan: HomePlan }) {
  const W = plan.w * TILE;
  const H = plan.h * TILE;
  const dx = plan.door.x * TILE;
  return (
    <g className="home-front" pointerEvents="none">
      <rect x={-8} y={H} width={dx + 8} height={8} fill="var(--home-wall-top)" />
      <rect x={dx + TILE} y={H} width={W - dx - TILE + 8} height={8} fill="var(--home-wall-top)" />
      <rect x={dx + 2} y={H} width={TILE - 4} height={6} rx={2} fill="#a16207" />
    </g>
  );
}

function PieMenu({
  obj,
  at,
  width,
  busy,
  left,
  onPick,
  onClose,
}: {
  obj: Obj;
  at: { x: number; y: number };
  width: number;
  busy: boolean;
  left: (act: string) => number | null;
  onPick: (v: Verb) => void;
  onClose: () => void;
}) {
  const verbs = obj.verbs.slice(0, 4);
  const n = verbs.length;
  const below = at.y < 100;
  // Chips in a gentle arc (the middle ones higher), kept inside the stage.
  const est = verbs.reduce((a, v) => a + v.label.length * 8 + 34, 0) + (n - 1) * 6 + 36;
  const w = Math.min(est, width - 16);
  const x = Math.max(8, Math.min(width - 8 - w, at.x - w / 2));
  const lift = (i: number) => {
    const d = Math.abs(i - (n - 1) / 2);
    return Math.round(d * d * 6);
  };
  return (
    <div
      className={`home-pie${below ? ' is-below' : ''}`}
      role="menu"
      aria-label={obj.label}
      style={{
        left: x,
        width: w,
        ...(below ? { top: at.y + 10 } : { bottom: `calc(100% - ${at.y - 6}px)` }),
      }}
    >
      <span className="home-pie-name">{obj.label}</span>
      <div className="home-pie-row">
        {verbs.map((v, i) => {
          const usesLeft = 'act' in v ? left(v.act) : null;
          const done = usesLeft === 0;
          return (
            <button
              key={`${v.id}${i}`}
              type="button"
              role="menuitem"
              className="home-chip"
              data-verb={'act' in v ? v.act : v.id}
              disabled={done || (busy && 'act' in v)}
              style={{ transform: `translateY(${below ? -lift(i) : lift(i)}px)` }}
              onClick={() => onPick(v)}
            >
              <span>{v.label}</span>
              {done && <small>{t('Done for this month')}</small>}
            </button>
          );
        })}
        <button type="button" className="home-pie-x" aria-label={t('Close')} onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  );
}

function EditList({
  comfort,
  owned,
  showroom,
  car,
  onGo,
}: {
  comfort: number;
  owned: number;
  showroom: (w: 'furniture' | 'appliance' | 'car') => { id: string; name: string } | undefined;
  car: string | null;
  onGo: (id: string) => void;
}) {
  const rows: { id: string; icon: string; label: string; sub: string }[] = [];
  const f = showroom('furniture');
  const a = showroom('appliance');
  const c = showroom('car');
  if (f) rows.push({ id: f.id, icon: '🛋', label: t('Furniture showroom'), sub: f.name });
  if (a && a.id !== f?.id)
    rows.push({ id: a.id, icon: '📺', label: t('TVs and appliances'), sub: a.name });
  if (c)
    rows.push({
      id: c.id,
      icon: '🚗',
      label: car ? t('Your car: {car}', { car }) : t('Buy a car'),
      sub: c.name,
    });
  return (
    <div className="home-sheet-body">
      <p className="small muted" data-comfort={comfort}>
        {t('Comfort {n} · {owned} of {total} things for your flat', {
          n: comfort,
          owned,
          total: 21,
        })}
      </p>
      {rows.length ? (
        rows.map((r) => (
          <button
            key={r.icon}
            type="button"
            className="home-row"
            data-action={`showroom:${r.icon === '🛋' ? 'furniture' : r.icon === '📺' ? 'appliance' : 'car'}`}
            onClick={() => onGo(r.id)}
          >
            <span aria-hidden="true">{r.icon}</span>
            <span>
              <b>{r.label}</b>
              <small>{r.sub}</small>
            </span>
          </button>
        ))
      ) : (
        <p className="small muted">{t('No showroom is open for that right now.')}</p>
      )}
    </div>
  );
}

function InviteList({
  view,
  left,
  busy,
  guests,
  onInvite,
}: {
  view: Parameters<typeof inviteesOf>[0];
  left: number | null;
  busy: boolean;
  guests: number;
  onInvite: (personId: string, name: string) => void;
}) {
  const people = inviteesOf(view);
  const done = left === 0;
  return (
    <div className="home-sheet-body">
      <p className="small muted">
        {done
          ? t('Done for this month')
          : left !== null
            ? t('Snacks for two · {n} left this month', { n: left })
            : t('Snacks for two')}
        {guests >= MAX_GUESTS ? ` · ${t('The flat is full')}` : ''}
      </p>
      {people.length ? (
        <div className="home-invitees" role="list">
          {people.map((p) => (
            <button
              key={p.personId}
              type="button"
              role="listitem"
              className="home-row"
              data-invite={p.personId}
              disabled={busy || done}
              onClick={() => onInvite(p.personId, p.name)}
            >
              <span aria-hidden="true">{p.contact ? '👤' : '💼'}</span>
              <span>
                <b>{p.name}</b>
                <small>{p.sub || (p.contact ? t('Contact') : t('In town'))}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="small muted">{t('No one to invite yet. Meet people around town first.')}</p>
      )}
    </div>
  );
}
