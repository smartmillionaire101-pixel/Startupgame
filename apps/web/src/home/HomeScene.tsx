import { openLiving } from '../experiences/living-bus';
import { useDaylight } from '../city/useDaylight';
import { openPlay } from '../experiences/play-bus';
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
import './dividers.css';
import { use3d } from '../three-kit/quality';
import type { Ghost, Home3DApi, Home3DPerson } from '../interiors3d/types';
import {
  MOVABLE,
  canPlace,
  extraKey,
  loadPlacements,
  nudgeOnWall,
  placedSpot,
  savePlacement,
  screenToGrid,
  slotOf,
  snapToWall,
  turnOnWall,
  withPlacements,
  type Placement,
} from '../interiors3d/placement';
import { BuySheet, PlaceBar } from '../interiors3d/BuyMode';
import { dividerPaint, paintColour, type HomeFinish } from '../interiors3d/finishes';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { openPhone, type PhoneOpen } from '../phone/bus';
import { HudButton, HudRail } from '../ui';
import { AvatarFigure, avatarLook, type AvatarLook } from '../city/art';
import { businessesOf, hash } from '../city/contract';
import { carOf, genderOf, nearest, sellsOf, storeForSlot } from '../city/life';
import type { SceneProps } from '../city/PlaceScene';
import { DecorArt, FixtureArt, SlotArt, TILE } from './art';
import {
  KIND_OF_TIER,
  TIER_HOME,
  bathDoors,
  blockedTiles,
  floorsFor,
  withBuiltIns,
  homeSpecOf,
  key,
  wallEdges,
  type HomeAct,
  type HomeKind,
  type HomePlan,
  type Spot,
  type Verb,
} from './layout';
import { blockOf, groundsFor, outdoorThings, type Grounds } from './grounds';
import {
  HOTEL_ACTS,
  HOTEL_MODELS,
  HOTEL_SHELL_TIER,
  HOTEL_TIER_LABEL,
  HOTEL_WINDOWS,
  hotelFurniture,
  hotelGrounds,
  hotelPlan,
  hotelRow,
  type HotelStay,
  type HotelWindow,
} from './hotel';
import { HomeWindows } from './HomeWindows';
import { HotelKnocked, HotelNeighbours, holidaysOf } from '../phone/apps/Holiday';
import type { HotelTier } from '../city/travel';
import { ActFx } from './ActFx';
import { RestChip } from './RestChip';
import { PhotoSheet, addPhoto } from './HomePhotos';
import { pathTowards, walkable, type Grid, type Tile } from './path';
import { balconyView } from './balcony';
import type PanoramaView from '../experiences/Panorama';
import { NEEDS, actsLeft, inviteesOf, ownedTiers, type NeedKey } from './view';
import { OPTION_GROUPS, WALLS } from '@runway/engine';
import {
  canPlaceDivider,
  dividerAt,
  dividersOn,
  homeExtrasOf,
  nudgeDivider,
  turnDivider,
  wallSwatch,
  withDividers,
  type Divider,
  type RoomName,
  type WallView,
} from './dividers';
import { CatalogueSheet } from '../shop/CatalogueSheet';
import { onlineCatalog } from '../shop/catalog';
import { onToPlace, takeToPlace, type ToPlace } from '../shop/vans';
import { DeliveryBanner } from './DeliveryBanner';

/** Wave 9 §C: the 3D home, loaded on demand (three.js is its own chunk). */
// A chunk that fails to load (offline) leaves the 2D home in place.
const Home3D = lazy(() => import('../interiors3d/Home3D').catch(() => ({ default: () => null })));
/** The penthouse balcony's skyline: the real city in 3D (three.js, loaded on demand). */
type PanoramaProps = Parameters<typeof PanoramaView>[0];
const Panorama = lazy<(p: PanoramaProps) => ReactNode>(() =>
  import('../experiences/Panorama').catch(() => ({ default: () => null })),
);

/** The back wall's face, in px above row 0. */
const WALL = 44;
const SPEED = 3.5; // tiles per second
const ACT_MS = 2200;
const TAP_SLOP = 8;
const MAX_GUESTS = 4;

/** Arrow keys as steps on screen (x right, y down). */
const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

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
  /** Another one of a thing (player feedback): its own tier (else its slot's). */
  tier?: number;
  /** Draw order: the footprint's bottom edge. */
  base: number;
  /** Wave 12: a model of its own (decor, things outside), its finish and facing. */
  model?: string;
  finish?: number;
  ry?: number;
  outdoor?: boolean;
  /** A visitor can use it too (the stairs, the balcony). */
  guest?: boolean;
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
  /** Round 7: the object they sit or lie on (for the 3D pose: the right bed, the chair's seat). */
  seat?: string;
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

/** Round 7e: a bed you can sit on the edge of (yours, the mat, a guest bed). */
const isBed = (o: { verbs: readonly unknown[] }) =>
  o.verbs.some((v) => !!v && typeof v === 'object' && 'act' in v && v.act === 'sleep');

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
  cars?: string[];
  estate?: 'villa' | 'mansion' | 'penthouse' | null;
  /** Wave 12: the host's kind of home and wealth band (the size of the house). */
  kind?: HomeKind;
  wealth?: number;
  /** The neighbourhood their home is in (a penthouse's view). */
  hood?: string | null;
  /** Shop note: their walls and dividers, room names and furniture finishes. */
  walls?: WallView[];
  rooms?: RoomName[];
  finishes?: Map<string, string>;
}

/**
 * Your hotel room abroad (./hotel.ts): drawn like your home, furnished by
 * the hotel. No furniture of yours, no guests, no shopping: sleep, freshen
 * up, go out, and the stay's details under More.
 */
export interface HotelRoom {
  /** null: no hotel booked (an old save): the budget room. */
  tier: HotelTier | null;
  name: string | null;
  /** A one-star hotel's pod (a single bed, a locker, the bathroom shared). */
  pod?: boolean;
  /** The named hotel's stars and room ("Pod · shared bathroom"), when known. */
  stars?: number;
  room?: string | null;
}

/** Wave 12: the name of a home by its kind (owners), else by lifestyle tier. */
const KIND_NAME: Partial<Record<HomeKind, string>> = {
  studio: 'Studio',
  townhouse: 'Townhouse',
  villa: 'Villa',
  mansion: 'Mansion',
  penthouse: 'Penthouse',
};

export function HomeScene({
  place,
  title,
  onClose,
  onVisit,
  places,
  hostView,
  hotel,
  children,
}: SceneProps & { hostView?: HostView; hotel?: HotelRoom | null }) {
  const { view, send, busy, cur, toast, quicken } = useView();
  const hotelTier: HotelTier | null = hotel ? (hotel.tier ?? 'budget') : null;
  const tier = hotelTier
    ? HOTEL_SHELL_TIER[hotelTier]
    : Math.max(
        1,
        Math.min(
          5,
          hostView?.tier ?? view.me.residence?.lifestyleTier ?? view.me.lifestyle?.tier ?? 2,
        ),
      );
  // Wave 12: the house grows with the kind of home and how rich its owner is.
  const residence = hostView ? null : view.me.residence;
  const specKind = hostView
    ? (hostView.kind ?? KIND_OF_TIER[tier]!)
    : homeSpecOf(residence, tier).kind;
  const specWealth = hostView ? (hostView.wealth ?? 1) : homeSpecOf(residence, tier).wealth;
  // A house has an upstairs (a mansion a roof terrace too): one floor at a time.
  const floors = useMemo(
    () =>
      hotelTier
        ? [hotelPlan(hotelTier, hotel?.pod)]
        : floorsFor(tier, { kind: specKind, wealth: specWealth }),
    [hotelTier, hotel?.pod, tier, specKind, specWealth],
  );
  const [floorAt, setFloorAt] = useState(0);
  const floor = Math.min(floorAt, floors.length - 1);
  const basePlan = floors[floor]!;
  const level = basePlan.level ?? 0;
  const floorRef = useRef(floor);
  useEffect(() => {
    floorRef.current = floor;
  }, [floor]);
  const garageKey = hotelTier
    ? ''
    : (hostView ? (hostView.cars ?? []) : view.me.garage.map((c) => c.modelId)).join(',');
  // A home comes with its kitchen, fridge and utility room (layout.ts builtIns).
  const tiers = useMemo(
    () =>
      hotelTier
        ? hotelFurniture(basePlan, hotelTier)
        : withBuiltIns(basePlan, hostView?.tiers ?? ownedTiers(view)),
    [view, hostView, hotelTier, basePlan],
  );
  const ownedKey = [...tiers.keys()].sort().join(',');
  const owned = useMemo(() => new Set(ownedKey ? ownedKey.split(',') : []), [ownedKey]);
  // Player feedback: more than one of a thing (a second speaker), each placed on its own.
  const extraList = hotelTier || hostView ? null : view.me.homeStyle?.extras;
  const extraKeyList = (extraList ?? [])
    .map((x) => `${extraKey(x.slot, x.id)}:${x.tier}`)
    .join(',');
  const extraTiers = useMemo(
    () =>
      new Map(
        (extraKeyList ? extraKeyList.split(',') : []).map((k) => {
          const i = k.lastIndexOf(':');
          return [k.slice(0, i), Number(k.slice(i + 1))] as const;
        }),
      ),
    [extraKeyList],
  );
  const extraKeys = useMemo(() => [...extraTiers.keys()], [extraTiers]);
  // Wave 9 §C: where you moved things in Buy mode (this device only).
  const placeOwner = hostView?.id ?? view.me.id;
  const [placements, setPlacements] = useState<Record<string, Placement>>(() =>
    loadPlacements(placeOwner, MOVABLE),
  );
  // The extras' spots too, as they're bought (what's moved this visit wins).
  const placed = useMemo(
    () =>
      extraKeys.length ? { ...loadPlacements(placeOwner, extraKeys), ...placements } : placements,
    [placeOwner, extraKeys, placements],
  );
  // Shop note: the walls and dividers put up here, the rooms named, the finishes bought.
  const myHome = view.me.home;
  const extras = useMemo(
    () =>
      hostView
        ? {
            walls: hostView.walls ?? [],
            rooms: hostView.rooms ?? [],
            finishes: hostView.finishes ?? new Map<string, string>(),
          }
        : homeExtrasOf(myHome),
    [hostView, myHome],
  );
  const [wallPlacing, setWallPlacing] = useState<(Divider & { label: string }) | null>(null);
  const movingWall = wallPlacing?.id ?? null;
  const dividers = useMemo(
    () =>
      hotelTier ? [] : dividersOn(extras.walls, floor, basePlan).filter((d) => d.id !== movingWall),
    [hotelTier, extras.walls, floor, basePlan, movingWall],
  );
  // A hotel room stays as the hotel laid it out.
  const plan = useMemo(
    () =>
      hotelTier
        ? basePlan
        : withPlacements(withDividers(basePlan, dividers), owned, placed, extraKeys),
    [hotelTier, basePlan, owned, placed, dividers, extraKeys],
  );
  /** What you own here, the extras that found a spot on this floor among it. */
  const ownedHere = useMemo(() => {
    const keys = extraKeys.filter((k) => k in plan.slots);
    return keys.length ? new Set([...owned, ...keys]) : owned;
  }, [owned, extraKeys, plan]);
  /** What's drawn as the house: its own walls (dividers are drawn as themselves). */
  const drawPlan = useMemo(
    () => (plan.walls === basePlan.walls ? plan : { ...plan, walls: basePlan.walls }),
    [plan, basePlan],
  );
  // Buy mode's Design tab: a floor or paint you're trying on.
  const [tryFinish, setTryFinish] = useState<HomeFinish | null>(null);
  // A plastered divider takes the walls' paint (player feedback: "not all the walls change").
  const wallPaint = hotelTier || hostView ? null : (tryFinish ?? view.me.homeStyle?.chosen)?.wall;
  const blockTier = blockOf(basePlan);
  const dividers3d = useMemo(
    () =>
      dividers.map((d) => {
        const paint = dividerPaint(d.kind, d.finish, blockTier, wallPaint);
        return { ...d, swatch: paint ?? wallSwatch(d.kind, d.finish), painted: !!paint };
      }),
    [dividers, blockTier, wallPaint],
  );
  const roomNames = extras.rooms.filter((r) => r.floor === floor);
  // ---- 3D (Wave 9 §C): drawn by three.js under this scene's invisible 2D hit layer.
  // Buy mode: a house's floors that have things on them.
  const buyFloors = useMemo(
    () =>
      floors
        .map((f, index) => ({ index, slots: Object.keys(f.slots) }))
        .filter((f) => f.slots.length > 0),
    [floors],
  );
  const want3d = use3d();
  const [ready3d, setReady3d] = useState(false);
  const is3d = want3d && ready3d;
  const api3d = useRef<Home3DApi | null>(null);
  const mat3d = useRef<string | null>(null);
  // Look around: a slow full turn round the house (stopped by any touch).
  const [looking, setLooking] = useState(false);
  const lookStop = useRef<(() => void) | null>(null);
  // Stopping calls lookAround's onEnd, which clears these.
  const endLook = useCallback(() => lookStop.current?.(), []);
  const grid: Grid = useMemo(
    () => ({
      w: plan.w,
      h: plan.h,
      blocked: blockedTiles(plan, ownedHere),
      walls: wallEdges(plan),
    }),
    [plan, ownedHere],
  );
  const { night, dusk } = useDaylight(view.market.id);
  const car = hostView || hotelTier ? null : carOf(view);

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
  // The grounds are the ground floor's (upstairs, they're below you).
  const groundPlan = floors[0]!;
  // A holiday: your room's number, and friends from the trip in the rooms next door.
  const stayKey = hotelTier ? hotelStayKey(view) : '';
  const stay = useMemo(
    () => (stayKey ? (JSON.parse(stayKey) as Required<Pick<HotelStay, 'room' | 'friends'>>) : null),
    [stayKey],
  );
  const grounds = useMemo(
    () =>
      hotelTier
        ? hotelGrounds(groundPlan, { tier: hotelTier, name: hotel?.name, ...stay })
        : groundsFor(groundPlan, garageKey ? garageKey.split(',') : []),
    [hotelTier, hotel?.name, groundPlan, garageKey, stay],
  );
  /** Friends' doors along the corridor (../interiors3d/hotel-tower.ts draws them). */
  const friendDoors = useMemo(
    () =>
      (grounds.hotel?.doors ?? []).flatMap((d) =>
        d.friend
          ? [{ ...d.friend, room: d.number, x: hotelRow(groundPlan).rooms[d.slot].door }]
          : [],
      ),
    [grounds, groundPlan],
  );
  const carNames = useMemo(
    () => new Map<string, string>((view.market.shop?.cars ?? []).map((c) => [c.id, c.label])),
    [view.market.shop],
  );
  const guestView = !!hostView;
  const objects = useMemo(
    () =>
      buildObjects(plan, tiers, night, grounds, (m) => carNames.get(m) ?? m, {
        outside: level === 0,
        host: !guestView,
        hotel: hotelTier,
        extras: extraTiers,
      }),
    [plan, tiers, night, grounds, carNames, level, guestView, hotelTier, extraTiers],
  );

  // ---- People
  const meLook = avatarLook(view.me.background?.id, view.me.id, genderOf(view.me));
  const meStart = { x: plan.door.x, y: plan.door.y - 1 };
  const me = useRef<Person>(newPerson('me', view.me.name, meLook, meStart));
  /** Round 7: the rest under way (held sit or lie) and how to get up from it. */
  const restRef = useRef<{ spot: 'seat' | 'bed'; label: string } | null>(null);
  const getUpRef = useRef<(() => Promise<void>) | null>(null);
  const guestKey = hotelTier ? `hotel:${view.me.id}` : view.me.id;
  const [guests, setGuests] = useState<Guest[]>(() => {
    // Your guests are back home, not in your hotel room: a friend from next door
    // comes in from the holiday's visit (the server's, below).
    if (hotel) return [];
    if (!hostView) return GUESTS.get(view.me.id) ?? [];
    seenGuests.add(hostView.id); // The host is already home: seated, not walking in.
    return [{ personId: hostView.id, name: hostView.name }];
  });
  const guestPeople = useRef(new Map<string, Person>());
  const guestSpots = useMemo(() => {
    // Guests stay downstairs.
    const g = floor === 0 ? plan : groundPlan;
    const d = g.slots.dining?.interact ?? g.door;
    return [g.seats[1] ?? d, g.seats[2] ?? d, g.seats[0] ?? d, d];
  }, [plan, groundPlan, floor]);

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
    const f = grounds.focus;
    const top = Math.min(-WALL - 10, f.y * TILE - 10);
    const bottom = Math.max(plan.h * TILE + 14, (f.y + f.h) * TILE + 10);
    return {
      x0: Math.min(-12, f.x * TILE - 10),
      x1: Math.max(plan.w * TILE + 12, (f.x + f.w) * TILE + 10),
      y0: top,
      y1: bottom,
    };
  }, [plan, grounds]);
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
        // Lying (round 7e, Lite): a little up the bed, the head on the pillow.
        p.pose === 'lie'
          ? 'translate(0 -7) scale(0.95)'
          : `scale(${(p.facing * 0.95).toFixed(2)} 0.95)`,
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
      // Round 7: walking off a seat or a bed ends the rest.
      if (p === me.current && restRef.current) void getUpRef.current?.();
      if (p.pose !== 'stand') {
        p.pose = 'stand';
        p.at = undefined;
        p.seat = undefined;
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
    if (floor !== 0) return;
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
  }, [guests, guestSpots, plan, floor, seatAt, walk, writePerson, bump]);

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
  const [sheet, setSheet] = useState<'edit' | 'invite' | 'buy' | 'party' | null>(null);
  // The penthouse balcony's skyline, in 3D.
  const [sky, setSky] = useState(false);
  const [ring, setRing] = useState<{ x: number; y: number; n: number } | null>(null);
  const rings = useRef(0);
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
  const [placing, setPlacing] = useState<{
    /** Its key: the slot, or the slot and id of another one of it ('sound#extra_1k'). */
    slot: string;
    label: string;
    p: Placement;
    /** Bought and on its way: its tier (what you own there is what's shown otherwise). */
    tier?: number;
  } | null>(null);
  // Buy all: the things bought, placed in turn once each is put down.
  const [placeQueue, setPlaceQueue] = useState<{ slot: string; label: string; tier: number }[]>([]);
  const finish3d: HomeFinish | null =
    hotelTier || hostView ? null : (tryFinish ?? view.me.homeStyle?.chosen ?? null);
  const ghost: Ghost | null = useMemo(() => {
    if (!placing) return null;
    const slot = slotOf(placing.slot);
    const base = basePlan.slots[slot];
    if (!base) return null;
    return {
      slot,
      tier: placing.tier ?? extraTiers.get(placing.slot) ?? tiers.get(slot) ?? 1,
      spot: placedSpot(base, placing.p),
      ok: canPlace(plan, ownedHere, placing.slot, placing.p),
    };
  }, [placing, basePlan, plan, ownedHere, tiers, extraTiers]);
  const onWall = !!placing && !!basePlan.slots[slotOf(placing.slot)]?.wall;
  const startPlacing = (slot: string, label: string, tier?: number) => {
    if (!MOVABLE.has(slotOf(slot))) return false;
    const s = plan.slots[slot] as (Spot & { rot?: number; lift?: number }) | undefined;
    if (!s) return false;
    const rot = s.rot ?? 0;
    setSheet(null);
    setTryFinish(null);
    setMenuState(null);
    setPlacing({
      slot,
      label,
      p: { x: s.x, y: s.y, rot, ...(s.lift ? { lift: s.lift } : {}) },
      ...(tier ? { tier } : {}),
    });
    return true;
  };
  /**
   * Screen arrows to a step on the floor grid: left and right as you see
   * them, up away from you, however the camera has turned (player feedback:
   * "when I click left the item goes right").
   */
  const gridStep = (dx: number, dy: number) => {
    const api = api3d.current;
    if (!is3d || !api) return { dx, dy };
    const o = api.project(0, 0, 0);
    const ex = api.project(1, 0, 0);
    const ez = api.project(0, 1, 0);
    return screenToGrid(dx, dy, { x: ex.x - o.x, y: ex.y - o.y }, { x: ez.x - o.x, y: ez.y - o.y });
  };
  /** Nudge what you're placing (or the wall you're putting up) a tile, as you see it. */
  const nudge = (dx: number, dy: number) => {
    const g = gridStep(dx, dy);
    if (wallPlacing) return setWallPlacing(nudgeDivider(plan, wallPlacing, g.dx, g.dy));
    if (!placing) return;
    setPlacing({
      ...placing,
      p: onWall
        ? nudgeOnWall(plan, placing.p, g.dx, g.dy)
        : { ...placing.p, x: placing.p.x + g.dx, y: placing.p.y + g.dy },
    });
  };
  const turnPlacing = () => {
    if (!placing) return;
    setPlacing({
      ...placing,
      p: onWall ? turnOnWall(plan, placing.p) : { ...placing.p, rot: (placing.p.rot + 1) % 4 },
    });
  };
  // Bought another one: placed as soon as it's in the home (the view has it).
  const [placeSoon, setPlaceSoon] = useState<{ key: string; label: string } | null>(null);
  useEffect(() => {
    if (!placeSoon || !extraTiers.has(placeSoon.key)) return;
    const go = window.setTimeout(() => {
      setPlaceSoon(null);
      if (!startPlacing(placeSoon.key, placeSoon.label))
        toast(t('No room for it on this floor. Make some space, then move it.'));
    }, 0);
    return () => clearTimeout(go);
    // startPlacing reads the plan of this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeSoon, extraTiers, plan]);
  /** The next thing from Buy all that stands on this floor (the rest keep their places). */
  const placeNext = (queue: { slot: string; label: string; tier: number }[]) => {
    let rest = queue;
    while (rest.length) {
      const [next, ...more] = rest;
      rest = more;
      if (startPlacing(next!.slot, next!.label, next!.tier)) break;
    }
    setPlaceQueue(rest);
  };
  const finishPlacing = () => {
    if (!placing || !ghost?.ok) return;
    const p = placing.p;
    savePlacement(placeOwner, placing.slot, p);
    setPlacements((xs) => ({ ...xs, [placing.slot]: p }));
    setPlacing(null);
    if (placeQueue.length) placeNext(placeQueue);
  };
  const cancelPlacing = () => {
    setPlacing(null);
    if (placeQueue.length) placeNext(placeQueue);
  };
  const closeBuy = () => {
    setSheet(null);
    setTryFinish(null);
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
    if (placeQueue.length) placeNext(placeQueue);
  };
  // ---- Shop note: putting up a wall or divider, and naming rooms.
  const [naming, setNaming] = useState<{ x: number; y: number; label: string } | 'pick' | null>(
    null,
  );
  const [shopWalls, setShopWalls] = useState(false);
  // Round 7: the online catalogue, its own button on the rail and in Buy mode (on a phone too).
  const [shopAll, setShopAll] = useState(false);
  const wallGhost = useMemo(
    () =>
      wallPlacing
        ? { ...wallPlacing, ok: canPlaceDivider(plan, owned, dividers, wallPlacing) }
        : null,
    [wallPlacing, plan, owned, dividers],
  );
  const startWall = (w: WallView) => {
    const dir = w.dir ?? 'h';
    const at =
      w.x !== undefined && w.y !== undefined && (w.floor ?? 0) === floor
        ? { x: w.x, y: w.y }
        : dividerAt(plan, w.len, dir, Math.floor(plan.w / 2), Math.floor(plan.h / 2));
    setSheet(null);
    setMenuState(null);
    setPlacing(null);
    setNaming(null);
    setWallPlacing({
      id: w.id,
      kind: w.kind,
      len: w.len,
      finish: w.finish,
      dir,
      ...at,
      label: tx(WALLS[w.kind].label),
    });
  };
  const finishWall = async () => {
    if (!wallPlacing || !wallGhost?.ok) return;
    const w = wallPlacing;
    const r = await send(
      { type: 'home.wall.place', wallId: w.id, floor, x: w.x, y: w.y, dir: w.dir },
      t('It’s up.'),
    );
    if (r !== null) setWallPlacing(null);
  };
  const saveName = async () => {
    if (!naming || naming === 'pick') return;
    const r = await send({
      type: 'home.room.label',
      floor,
      x: naming.x,
      y: naming.y,
      label: naming.label.trim(),
    });
    if (r !== null) setNaming('pick');
  };
  /** A tap on a tile while putting up a wall or naming a room. */
  const tapWall = (tile: { x: number; y: number } | null | undefined): boolean => {
    if (wallPlacing) {
      if (tile)
        setWallPlacing({
          ...wallPlacing,
          ...dividerAt(plan, wallPlacing.len, wallPlacing.dir, tile.x, tile.y),
        });
      return true;
    }
    if (naming) {
      if (tile) {
        const had = roomNames.find((r) => Math.abs(r.x - tile.x) + Math.abs(r.y - tile.y) <= 1);
        setNaming(
          had ? { x: had.x, y: had.y, label: had.label } : { x: tile.x, y: tile.y, label: '' },
        );
      }
      return true;
    }
    return false;
  };
  // ---- Round 7: unpacked things go straight to placing (a painting is never hung for you).
  const [toPlaceQ, setToPlaceQ] = useState<ToPlace[]>(() =>
    hotelTier || hostView ? [] : takeToPlace(),
  );
  useEffect(() => {
    if (hotelTier || hostView) return;
    return onToPlace(() => setToPlaceQ((q) => [...q, ...takeToPlace()]));
  }, [hotelTier, hostView]);
  const toPlaceSince = useRef(0);
  useEffect(() => {
    if (!toPlaceQ.length || placing || wallPlacing || sheet || placeQueue.length) return;
    const [next, ...rest] = toPlaceQ;
    if (!toPlaceSince.current) toPlaceSince.current = Date.now();
    // In the home yet (the view after the unpack)? Give it a few seconds, then let it go.
    const wall = next!.kind === 'wall' ? extras.walls.find((w) => w.id === next!.id) : undefined;
    const ready =
      next!.kind === 'slot'
        ? owned.has(next!.slot)
        : next!.kind === 'extra'
          ? extraTiers.has(extraKey(next!.slot, next!.id))
          : !!wall;
    if (!ready && Date.now() - toPlaceSince.current < 6000) {
      const retry = window.setTimeout(() => setToPlaceQ((q) => [...q]), 500);
      return () => clearTimeout(retry);
    }
    const go = window.setTimeout(() => {
      toPlaceSince.current = 0;
      setToPlaceQ(rest);
      if (!ready) return;
      if (next!.kind === 'wall') return startWall(wall!);
      const key = next!.kind === 'extra' ? extraKey(next!.slot, next!.id) : next!.slot;
      // Placed already (chosen while it was on its way): it stays where you put it.
      if (next!.kind === 'slot' && placements[key]) return;
      startPlacing(key, slotLabel(next!.slot));
    }, 0);
    return () => clearTimeout(go);
    // startPlacing and startWall read this render's plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toPlaceQ, placing, wallPlacing, sheet, placeQueue, owned, extraTiers, extras.walls]);

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
        p.seat = obj.id;
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
        p.seat = undefined;
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

  // ---- Round 7: resting (gameplay note). Sitting on a seat or lying on a bed is
  // held until you get up (or walk off): the chip under the HUD shows it, and
  // the server settles the game time you rested (`home.rest`).
  const restOn = !!view.me.rest && !hostView;
  const [resting, setResting] = useState<{ spot: 'seat' | 'bed'; label: string } | null>(null);
  const setRest = (r: { spot: 'seat' | 'bed'; label: string } | null) => {
    restRef.current = r;
    setResting(r);
  };
  const startRest = (spot: 'seat' | 'bed', obj: Obj) => {
    const label =
      spot === 'bed'
        ? obj.id === 'bed' && !owned.has('bed') && plan.fixtures.mat
          ? t('Napping on the mat')
          : t('Napping')
        : obj.id === 'sofa'
          ? owned.has('sofa') || !plan.fixtures.cushions
            ? t('Resting on the sofa')
            : t('Resting on the cushions')
          : isBed(obj)
            ? obj.id === 'bed' && !owned.has('bed') && plan.fixtures.mat
              ? t('Sitting on the mat')
              : t('Sitting on the bed')
            : t('Resting: {thing}', { thing: obj.label });
    setRest({ spot, label });
    void send({ type: 'home.rest', action: 'start', spot }).then((r) => {
      if (r === null && restRef.current?.spot === spot) {
        setRest(null);
        standUp();
      }
    });
  };
  const standUp = () => {
    const p = me.current;
    if (p.pose === 'stand') return;
    p.pose = 'stand';
    p.at = undefined;
    p.seat = undefined;
    writePerson(p);
    bump(p);
    api3d.current?.wake();
  };
  useEffect(() => {
    getUpRef.current = async () => {
      if (!restRef.current) return;
      setRest(null);
      const r = await send<{ minutes: number; stress: number; energy: number; hours: number }>({
        type: 'home.rest',
        action: 'stop',
      });
      if (!r) return;
      const lines: { text: string; tone: string }[] = [];
      if (r.energy) lines.push({ text: t('{n} energy', { n: `+${r.energy}` }), tone: 'energy' });
      if (r.stress)
        lines.push({ text: t('{n} stress', { n: `${Math.round(r.stress)}` }), tone: 'fun' });
      if (r.hours) lines.push({ text: t('{n}h rested', { n: r.hours }), tone: 'hours' });
      if (!lines.length) lines.push({ text: t('A short rest'), tone: 'fun' });
      float(lines);
    };
  });
  const getUp = () => {
    standUp();
    void getUpRef.current?.();
  };
  // Leaving home while resting gets you up; back home after a reload, an old rest is settled.
  useEffect(() => {
    if (view.me.rest?.resting && !restRef.current) {
      restRef.current = { spot: view.me.rest.resting.spot, label: '' };
      void getUpRef.current?.();
    }
    return () => {
      if (restRef.current) void getUpRef.current?.();
    };
    // Once, on entering and leaving the home.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Up or down the stairs: you come out where they meet that floor. */
  const goFloor = (to: number) => {
    const next = floors[to];
    if (!next || to === floor) return;
    const from = floor;
    const meet = next.decor.find((d) => d.verbs.some((v) => 'to' in v && v.to === from));
    const at =
      meet?.spot.interact ??
      next.decor.find((d) => d.model.startsWith('stair'))?.spot.interact ??
      next.door;
    const p = me.current;
    Object.assign(p, {
      x: at.x,
      y: at.y,
      path: [],
      i: 0,
      pose: 'stand',
      at: undefined,
      arrive: undefined,
    });
    p.tile = key(at.x, at.y);
    cam.current.manual = false;
    cam.current.ready = false;
    setMenuState(null);
    setWalkPath(null);
    setPlacing(null);
    setFloorAt(to);
    writePerson(p);
    bump(p);
  };

  const choose = (obj: Obj, v: Verb) => {
    setMenu(null);
    if (v.id === 'skyline') return setSky(true);
    if (v.id === 'party') return setSheet('party');
    if (v.id === 'floor' && 'to' in v) {
      const to = v.to;
      const path = walk(me.current, obj.spot.interact, () => goFloor(to));
      setWalkPath(reduceMotion() ? null : path);
      return;
    }
    if (v.id === 'game')
      return openPlay({ venue: `home:${placeOwner}`, name: homeName, game: 'football' });
    if (v.id === 'out') return onClose();
    if (v.id === 'invite') return setSheet('invite');
    if (v.id === 'order') return openPhone({ app: 'chop' } as unknown as PhoneOpen);
    if ('model' in v) {
      // Your car of choice for the day, then out to the city.
      if (hostView) return;
      void (async () => {
        if (car?.modelId !== v.model && !(await send({ type: 'car.select', modelId: v.model })))
          return;
        onClose();
      })();
      return;
    }
    if ('slot' in v) return goShop(v.slot);
    if ('move' in v) return startPlacing(v.move, obj.label);
    if ('extra' in v) {
      void send({ type: 'home.extra.sell', extraId: v.extra }, (x: { refund?: number } | null) =>
        t('Sold for {amount}.', { amount: money(x?.refund ?? 0, cur) }),
      );
      return;
    }
    const p = me.current;
    if (v.id === 'sit') {
      const sofa = obj.id === 'sofa';
      const seat = sofa ? plan.seats[0] : undefined;
      const path = walk(p, obj.spot.interact, () => {
        if (seat && owned.has('sofa')) seatAt(p, seat);
        else if (isBed(obj)) {
          // Round 7e: on the edge of the bed (or the mat), at its foot, facing the room.
          p.pose = 'sit';
          p.at = {
            x: (obj.spot.x + obj.spot.w / 2) * TILE,
            y: (obj.spot.y + obj.spot.h) * TILE - 6,
          };
        } else {
          // The cushions, a chair at the table, the cinema seats: sit where you are.
          const at = seat ?? obj.spot.interact;
          p.x = at.x;
          p.y = at.y;
          p.pose = 'sit';
          p.at = { x: (at.x + 0.5) * TILE, y: (at.y + 0.55) * TILE };
        }
        p.seat = obj.id;
        writePerson(p);
        bump(p);
        api3d.current?.wake();
        if (restOn) startRest('seat', obj);
      });
      setWalkPath(reduceMotion() ? null : path);
      return;
    }
    if (
      'act' in v &&
      v.act === 'nap' &&
      restOn &&
      obj.verbs.some((x) => 'act' in x && x.act === 'sleep')
    ) {
      // Round 7: a nap is lying down on the bed (or the mat) until you wake up.
      const path = walk(p, obj.spot.interact, () => {
        p.pose = 'lie';
        p.at = { x: (obj.spot.x + obj.spot.w / 2) * TILE, y: (obj.spot.y + 1.9) * TILE };
        p.seat = obj.id;
        writePerson(p);
        bump(p);
        api3d.current?.wake();
        startRest('bed', obj);
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
  const drag = useRef<{
    x: number;
    y: number;
    cx: number;
    cy: number;
    moved: boolean;
    /** Dragging the thing you're placing (not the view), last over this tile. */
    grab?: boolean;
    tx?: number;
    ty?: number;
  } | null>(null);
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
    const base = basePlan.slots[slotOf(placing.slot)]!;
    if (base.wall) {
      // On a wall: the tile in front of it, facing away from the wall there.
      if (tx < 0 || ty < 0 || tx >= plan.w || ty >= plan.h) return;
      return setPlacing({ ...placing, p: snapToWall(plan, { ...placing.p, x: tx, y: ty }) });
    }
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
  /** The floor tile under a point on screen (3D or 2D). */
  const tileAt = (clientX: number, clientY: number) => {
    if (is3d && api3d.current) {
      const r = svgRef.current!.getBoundingClientRect();
      return api3d.current.pick(clientX - r.left, clientY - r.top)?.tile ?? null;
    }
    const w = toWorld(clientX, clientY);
    return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) };
  };
  const onDown = (e: React.PointerEvent) => {
    if (lookStop.current) endLook();
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
    // Placing: a finger on the thing (or just by it) drags it along the floor.
    let grab = false;
    if (placing && ghost && pts.current.size === 1) {
      const at = tileAt(e.clientX, e.clientY);
      const s = ghost.spot;
      grab = !!at && at.x >= s.x - 1 && at.x <= s.x + s.w && at.y >= s.y - 1 && at.y <= s.y + s.h;
    }
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      cx: cam.current.x,
      cy: cam.current.y,
      moved: false,
      ...(grab ? { grab: true } : {}),
    };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const prev = pts.current.get(e.pointerId);
    if (prev) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.grab && placing && pts.current.size < 2) {
      if (!d.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      d.moved = true;
      const at = tileAt(e.clientX, e.clientY);
      if (at && (at.x !== d.tx || at.y !== d.ty)) {
        d.tx = at.x;
        d.ty = at.y;
        placeAt(at.x, at.y);
      }
      return;
    }
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
      if (tapWall(hit?.tile)) return;
      if (placing) {
        if (hit?.tile) placeAt(hit.tile.x, hit.tile.y);
        return;
      }
      // The 3D thing under your finger wins; else the 2D hit layer; else the floor.
      // A visitor only uses what a guest can (the stairs, the balcony).
      const svgObj = (e.target as Element).closest?.('[data-obj]');
      const id = hit?.obj ?? svgObj?.getAttribute('data-obj') ?? undefined;
      const found = id ? objects.find((o) => o.id === id) : undefined;
      const obj = (hostView && !found?.guest) || !found?.verbs.length ? undefined : found;
      if (obj) {
        setMenu(menu?.id === obj.id ? null : obj);
        return;
      }
      setMenu(null);
      // Buy mode open: a tap on the home round it closes the catalogue.
      if (sheet === 'buy') return closeBuy();
      if (!hit?.tile) return;
      const path = walk(me.current, hit.tile);
      setWalkPath(reduceMotion() ? null : path);
      setRing({ x: (hit.tile.x + 0.5) * TILE, y: (hit.tile.y + 0.5) * TILE, n: ++rings.current });
      return;
    }
    if (wallPlacing || naming) {
      const w = toWorld(e.clientX, e.clientY);
      tapWall({ x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) });
      return;
    }
    if (placing) {
      const w = toWorld(e.clientX, e.clientY);
      placeAt(Math.floor(w.x / TILE), Math.floor(w.y / TILE));
      return;
    }
    const el = (e.target as Element).closest?.('[data-obj]');
    if (el) {
      const obj = objects.find((o) => o.id === el.getAttribute('data-obj'));
      if (obj && (!hostView || obj.guest) && obj.verbs.length) {
        setMenu(menu?.id === obj.id ? null : obj);
        return;
      }
    }
    setMenu(null);
    if (sheet === 'buy') return closeBuy();
    const w = toWorld(e.clientX, e.clientY);
    const tx = Math.floor(w.x / TILE);
    const ty = Math.floor(w.y / TILE);
    if (tx < 0 || ty < 0 || tx >= plan.w || ty >= plan.h) return;
    cam.current.manual = false;
    const path = walk(me.current, { x: tx, y: ty });
    setWalkPath(reduceMotion() ? null : path);
    setRing({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, n: ++rings.current });
  };
  const onKey = (e: React.KeyboardEvent) => {
    const dir = ARROWS[e.key];
    // Placing: the arrow keys nudge it (the window's listener below).
    if (!dir || acting || placing || wallPlacing) return;
    e.preventDefault();
    const p = me.current;
    cam.current.manual = false;
    // As you see it: left is left on screen, up is away from you.
    const g = gridStep(dir[0], dir[1]);
    walk(p, { x: Math.round(p.x) + g.dx, y: Math.round(p.y) + g.dy });
  };
  // While placing, the arrow keys nudge it, R turns it, Enter puts it down, Escape
  // cancels; with Buy mode open, Escape closes it.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  const onWindowKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
    if (placing || wallPlacing) {
      if (typing) return;
      const dir = ARROWS[e.key];
      if (dir) {
        e.preventDefault();
        nudge(dir[0], dir[1]);
      } else if (e.key === 'r' || e.key === 'R') {
        if (wallPlacing) setWallPlacing(turnDivider(plan, wallPlacing));
        else turnPlacing();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (wallPlacing) void finishWall();
        else finishPlacing();
      } else if (e.key === 'Escape') {
        if (wallPlacing) setWallPlacing(null);
        else cancelPlacing();
      }
      return;
    }
    if (sheet === 'buy' && e.key === 'Escape') {
      e.preventDefault();
      closeBuy();
    }
  };
  useEffect(() => {
    keys.current = onWindowKey;
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const addGuest = (g: Guest) => {
    setGuests((xs) => {
      const next = [...xs.filter((x) => x.personId !== g.personId), g].slice(-MAX_GUESTS);
      GUESTS.set(guestKey, next);
      for (const id of guestPeople.current.keys())
        if (!next.some((x) => x.personId === id)) guestPeople.current.delete(id);
      return next;
    });
  };
  const dropGuest = (personId: string) => {
    setGuests((xs) => {
      const next = xs.filter((x) => x.personId !== personId);
      GUESTS.set(guestKey, next);
      guestPeople.current.delete(personId);
      seenGuests.delete(personId);
      return next;
    });
  };

  // ---- A holiday in the same hotel: your friend's avatar at their door in
  // the corridor. Knock (`hotel.knock`): they're told, and when they open the
  // door (`hotel.answer`) they walk over and sit down in your room; on their
  // screen, they're in your room with you. Say goodbye (`hotel.leave`) ends
  // it for both. An AI friend answers at once.
  const corridor = useRef(new Map<string, Home3DPerson & { ry: number }>());
  const holiday = hotelTier ? hotelHoliday(view) : undefined;
  const visit = holiday?.visit?.me ? holiday.visit : null;
  /** Who's over: your guest (you host), or the host whose room you're in. */
  const visitor = visit ? (visit.me === 'host' ? visit.guest : visit.host) : null;
  // Friends' doors down the corridor, or a visit on (in their room or yours):
  // a knock, an answer or a goodbye shows within seconds.
  const quickHotel = !!holiday && (friendDoors.length > 0 || !!holiday.visit?.me);
  useEffect(() => (quickHotel ? quicken() : undefined), [quickHotel, quicken]);
  const knockedBy = holiday?.knocks[0] ?? null;
  const myKnock = holiday?.myKnock ?? null;
  const [knocking, setKnocking] = useState<string | null>(null);
  /** Knocking and waiting for them to answer (yours, or one sent before this screen opened). */
  const waiting = knocking ?? (myKnock?.status === 'pending' && !visit ? myKnock.to : null);
  useEffect(() => {
    const m = corridor.current;
    m.clear();
    for (const f of friendDoors)
      if (!guests.some((g) => g.personId === f.id))
        m.set(f.id, {
          id: `corridor:${f.id}`,
          look: guestLook(f.id),
          x: f.x - 0.5,
          y: groundPlan.h + 0.3,
          pose: 'stand',
          ry: 0,
        });
    api3d.current?.wake();
  }, [friendDoors, guests, groundPlan]);
  /** They open up and walk along the corridor to your door, then come in. */
  const walkOver = (id: string, done: () => void) => {
    const f = friendDoors.find((x) => x.id === id);
    const p = corridor.current.get(id);
    if (!f || !p) return done();
    const from = p.x;
    const to = groundPlan.door.x;
    let t0 = 0;
    const MS = reduceMotion() ? 300 : 1800;
    const step = () => {
      const now = performance.now();
      t0 ||= now;
      const u = Math.min(1, (now - t0) / MS);
      const q = corridor.current.get(id);
      if (q) q.x = from + (to - from) * u;
      api3d.current?.wake();
      if (u < 1) return void requestAnimationFrame(step);
      corridor.current.delete(id);
      done();
    };
    requestAnimationFrame(step);
  };
  const knock = async (f: (typeof friendDoors)[number]) => {
    if (waiting || visit || !holiday) return;
    setHotelMore(false);
    const name = f.name.split(' ')[0]!;
    setKnocking(f.id);
    toast(t('You knock on {name}’s door…', { name }));
    const r = await send<{ answered?: 'yes' | 'no' | null; text?: string }>({
      type: 'hotel.knock',
      holidayId: holiday.id,
      playerId: f.id,
    });
    // Waiting for them now shows from the view (`myKnock`); an AI friend answered at
    // once: "yes" walks over (below, from the visit), "not now" is said.
    setKnocking(null);
    if (r?.answered === 'no')
      toast(t('{name}: “{text}”', { name, text: r.text ? tx(r.text) : '' }));
  };
  // Your knock turned down: you're told.
  const declinedAt = myKnock?.status === 'declined' ? myKnock.at : 0;
  const seenDecline = useRef(declinedAt);
  useEffect(() => {
    if (!declinedAt || declinedAt === seenDecline.current) return;
    seenDecline.current = declinedAt;
    // (An AI friend's own words were said as they answered.)
    if (myKnock && !holiday?.companions.find((c) => c.id === myKnock.to)?.ai)
      toast(t('{name} can’t come over right now.', { name: myKnock.name.split(' ')[0]! }));
  }, [declinedAt, myKnock, holiday, toast]);
  // The visit, as the server has it: your guest walks in (or is already seated), or you're in their room.
  const visitorId = hotelTier ? (visitor?.id ?? null) : undefined;
  const lastVisit = useRef<{ id: string; me: 'host' | 'guest'; room: number | null } | null>(null);
  /** Who you were knocking for as of the last render (the visit clears the knock). */
  const wasWaiting = useRef(waiting);
  useEffect(() => {
    if (visitorId === undefined) return;
    const was = lastVisit.current;
    if (was && was.id !== visitorId) {
      dropGuest(was.id);
      const name = guests.find((g) => g.personId === was.id)?.name ?? '';
      toast(
        was.me === 'host'
          ? t('{name} went back to room {room}.', {
              name: name.split(' ')[0]!,
              room: was.room ?? '',
            })
          : t('You’re back in your room.'),
      );
      lastVisit.current = null;
    }
    if (!visitorId || !visit || !visitor || lastVisit.current) return;
    lastVisit.current = { id: visitorId, me: visit.me!, room: visit.guest.room };
    const guest = { personId: visitorId, name: visitor.name };
    if (visit.me === 'host' && wasWaiting.current === visitorId) {
      walkOver(visitorId, () => {
        addGuest(guest);
        toast(
          t('{name} came over from room {room}.', {
            name: visitor.name.split(' ')[0]!,
            room: visit.guest.room ?? '',
          }),
          'ok',
        );
      });
      return;
    }
    // Already over (or you came to their room): seated.
    seenGuests.add(visitorId);
    addGuest(guest);
    if (visit.me === 'guest') {
      // You walk in from their door.
      const p = me.current;
      p.x = plan.door.x;
      p.y = plan.door.y - 1;
      walk(p, guestSpots[1] ?? guestSpots[0]!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the visitor changes
  }, [visitorId]);
  useEffect(() => {
    wasWaiting.current = waiting;
  });
  const goodbye = async () => {
    if (!holiday) return;
    setHotelMore(false);
    await send({ type: 'hotel.leave', holidayId: holiday.id });
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
    ...(floor === 0 ? guests : []).map((g) => ({
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
    // Shop note: walls and dividers you put up, each in its own look.
    for (const d of dividers) {
      const sw = wallSwatch(d.kind, d.finish);
      const len = d.len * TILE;
      const x = d.x * TILE;
      const y = d.y * TILE;
      const glass = d.kind === 'glass';
      const tall = d.kind === 'half' ? 6 : 10;
      items.push({
        k: `div-${d.id}`,
        base: d.dir === 'h' ? d.y + 0.06 : d.y + d.len,
        node: (
          <g
            key={`div-${d.id}`}
            className="home-divider"
            data-divider={d.id}
            data-kind={d.kind}
            opacity={glass ? 0.7 : 1}
          >
            {d.dir === 'h' ? (
              <>
                <rect
                  x={x}
                  y={y - 2 - tall}
                  width={len}
                  height={tall}
                  fill={glass ? '#cfe8f0' : sw}
                />
                <rect
                  x={x}
                  y={y - 5 - tall}
                  width={len}
                  height={5}
                  fill={glass ? '#9aa3a8' : '#f4f1ea'}
                />
                {d.kind === 'sliding' && (
                  <path
                    d={`M${x + len / 2} ${y - 2 - tall} V${y - 2}`}
                    stroke="#3f3a35"
                    strokeWidth="2"
                  />
                )}
                {d.kind === 'bookshelf' &&
                  Array.from({ length: d.len * 5 }, (_, i) => (
                    <rect
                      key={i}
                      x={x + 3 + i * (TILE / 5)}
                      y={y - tall}
                      width={3}
                      height={tall - 3}
                      fill={['#b91c1c', '#1d4ed8', '#15803d', '#ca8a04'][i % 4]}
                    />
                  ))}
              </>
            ) : (
              <rect
                x={x - 3}
                y={y - 15}
                width={6}
                height={len + 3}
                fill={glass ? '#9fd3e3' : sw}
                strokeDasharray={d.kind === 'sliding' ? '6 4' : undefined}
                stroke={d.kind === 'sliding' ? '#3f3a35' : undefined}
              />
            )}
          </g>
        ),
      });
    }
    drawPlan.walls.forEach((s, n) => {
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
  }, [objects, drawPlan, dividers]);
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
            <ellipse
              className="home-person-shadow"
              cx="0"
              cy="0"
              rx="11"
              ry="4"
              fill="#000"
              opacity="0.16"
            />
            <g className="city-avatar">
              <AvatarFigure look={p.look} />
            </g>
            {/* Round 7e: lying down (Lite): under the covers, the head on the pillow. */}
            <g className="home-covers" aria-hidden="true">
              <rect x="-14" y="-25" width="28" height="30" rx="6" fill="#e2e8f0" />
              <rect x="-14" y="-25" width="28" height="5" rx="2.5" fill="#ffffff" />
              <path d="M -9 -10 Q 0 -7 9 -10" stroke="#94a3b8" strokeWidth="1" fill="none" />
              <text className="home-zz" x="9" y="-44">
                z
              </text>
              <text className="home-zz late" x="14" y="-52">
                z
              </text>
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
        tier: o.tier ?? (o.slot ? (tiers.get(o.slot) ?? 1) : (o.finish ?? 1)),
        ...(o.model ? { model: o.model } : {}),
        ...(o.ry !== undefined ? { ry: o.ry } : {}),
        ...(o.outdoor ? { outdoor: true } : {}),
        // Shop note: the finish you bought it in.
        ...(o.slot && o.id === o.slot && extras.finishes.get(o.slot)
          ? {
              finish:
                OPTION_GROUPS.woodFinish.options.find((x) => x.id === extras.finishes.get(o.slot!))
                  ?.swatch ?? undefined,
            }
          : {}),
      })),
    [objects, tiers, extras.finishes],
  );
  const people3d = useCallback((): Home3DPerson[] => {
    const out: Home3DPerson[] = [];
    const guestsHere = floorRef.current === 0 ? [...guestPeople.current.values()] : [];
    for (const p of [me.current, ...guestsHere])
      out.push({
        id: p.id,
        look: p.look,
        x: p.x,
        y: p.y,
        pose: p.pose,
        ...(p.seat ? { seat: p.seat } : {}),
      });
    for (const p of corridor.current.values()) out.push({ ...p });
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

  // ---- Look around and photos of the house.
  const toggleLook = () => {
    if (lookStop.current) return endLook();
    const stop = api3d.current?.lookAround(() => {
      lookStop.current = null;
      setLooking(false);
    });
    if (!stop) return;
    lookStop.current = stop;
    setMenu(null);
    setLooking(true);
  };
  // Stop turning when the 3D view goes away or you start moving furniture.
  useEffect(() => {
    if (!is3d || placing) endLook();
  }, [is3d, placing, endLook]);
  useEffect(() => endLook, [endLook]);
  /** The photo sheet: open with the photo just taken (null: couldn't read the view). */
  const [photo, setPhoto] = useState<{ src: string | null } | null>(null);
  const [flash, setFlash] = useState(0);
  const takePhoto = () => {
    const src = api3d.current?.snapshot() ?? null;
    endLook();
    setMenu(null);
    if (src) {
      addPhoto(src);
      if (!reduceMotion()) setFlash((n) => n + 1);
    } else toast(t('Couldn’t take a photo on this device.'));
    setPhoto({ src });
  };

  const inviteLeft = actsLeft(view, 'invite');
  // ---- The penthouse balcony: the city it looks out over.
  const city = view.here?.id ?? view.market.id;
  // A hotel's balcony looks over the city's heart (your home's neighbourhood is elsewhere).
  const hood = hotel
    ? null
    : hostView
      ? (hostView.hood ?? null)
      : (residence?.neighbourhood ?? null);
  const balconyName = hostView
    ? t('{name}’s balcony', { name: hostView.name.split(' ')[0]! })
    : t('Your balcony');
  // A penthouse's balcony, or a hotel suite's (its loungers look out over the city).
  const hasBalcony = plan.kind === 'penthouse' || hotelTier === 'luxury';
  const balcony = useMemo(
    () => (hasBalcony ? balconyView(city, balconyName, hood) : null),
    [hasBalcony, city, balconyName, hood],
  );
  const levelName = (l: number) =>
    l === 2 ? t('Roof terrace') : l === 1 ? t('Upper floor') : t('Ground floor');
  const pocket = view.accounts.local?.balance ?? 0;
  const homeName = hotel
    ? (hotel.name ?? t('Your hotel room'))
    : hostView
      ? t('{name}’s place', { name: hostView.name.split(' ')[0]! })
      : residence && KIND_NAME[specKind]
        ? t(KIND_NAME[specKind]!)
        : t(TIER_HOME[tier - 1]!);
  // ---- The hotel room's tray: what a traveller who just arrived wants.
  const [hotelMore, setHotelMore] = useState(false);
  const hotelAct = (ids: string[], act: HomeAct) => {
    const obj = ids.map((id) => objects.find((o) => o.id === id)).find(Boolean);
    const v = obj?.verbs.find((x) => 'act' in x && x.act === act);
    if (obj && v) choose(obj, v);
  };

  return (
    <div
      className={`place-scene home-scene${is3d ? ' is-3d' : ''}${placing || wallPlacing || naming ? ' is-placing' : ''}`}
      data-dividers={dividers.length}
      data-extras={ownedHere.size - owned.size}
      data-placing={placing?.slot}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-room={hotelTier ? 'hotel' : 'apartment'}
      data-hotel-room={hotelTier ?? undefined}
      data-bathroom={
        hotelTier
          ? ['shower', 'toilet', 'sink', 'bathtub'].filter((f) => f in plan.fixtures).join(' ')
          : undefined
      }
      data-scene={place.id}
      data-tier={tier}
      data-kind={plan.kind}
      data-wealth={plan.wealth}
      data-plan-w={plan.w}
      data-floor={level}
      data-floors={floors.length}
      data-night={night ? '1' : '0'}
      data-energy={view.me.energy}
      data-pocket={pocket}
      data-host-view={hostView?.id}
    >
      {hotelTier && (
        <div className="home-hotel-head">
          <h2>{homeName}</h2>
          {/* The named hotel's own stars and room, else the tier's (playtest round 6:
              a one-star pod read as "★ room" under a double bed). */}
          <span data-hotel-tier={hotelTier} data-hotel-pod={hotel?.pod ? '' : undefined}>
            {hotel?.stars && hotel.room
              ? `${'★'.repeat(hotel.stars)} ${tx(hotel.room)}`
              : t(HOTEL_TIER_LABEL[hotelTier])}
          </span>
          {visit && visitor ? (
            <span className="small holiday-neighbours" data-hotel-visit={visit.me}>
              {visit.me === 'host'
                ? t('{name} is over from room {room}', {
                    name: visitor.name.split(' ')[0]!,
                    room: visit.guest.room ?? '',
                  })
                : t('In {name}’s room · {room}', {
                    name: visitor.name.split(' ')[0]!,
                    room: visit.host.room ?? '',
                  })}
            </span>
          ) : (
            <HotelNeighbours />
          )}
          {visit && visitor ? (
            <button
              type="button"
              className="home-hotel-knock"
              data-action="hotel-goodbye"
              data-friend={visitor.id}
              disabled={busy}
              onClick={() => void goodbye()}
            >
              <span aria-hidden="true">👋</span>
              {t('Say goodbye to {name}', { name: visitor.name.split(' ')[0]! })}
            </button>
          ) : (
            !knockedBy &&
            friendDoors.slice(0, 1).map((f) => (
              <button
                key={f.id}
                type="button"
                className="home-hotel-knock"
                data-hotel-knock={f.id}
                data-knocking={waiting === f.id ? '' : undefined}
                disabled={!!waiting || busy}
                onClick={() => void knock(f)}
              >
                <span aria-hidden="true">🚪</span>
                {waiting === f.id
                  ? t('Knocking on {name}’s door…', { name: f.name.split(' ')[0]! })
                  : t('Knock on {name}’s door', { name: f.name.split(' ')[0]! })}
              </button>
            ))
          )}
          <HotelKnocked />
        </div>
      )}
      <div className="home-stage">
        {/* Out on the balcony, the room's 3D steps aside for the city's (a phone's WebGL). */}
        {want3d && !sky && (
          <Suspense fallback={null}>
            <Home3D
              plan={drawPlan}
              dividers={dividers3d}
              finish={finish3d}
              tier={tier}
              objects={objects3d}

              people={people3d}
              acting={acting3d}
              night={night}
              dusk={dusk}
              car={car?.modelId ?? null}
              cars={
                hotelTier
                  ? []
                  : hostView
                    ? (hostView.cars ?? [])
                    : view.me.garage.map((c) => c.modelId)
              }
              grounds={grounds}
              delivery={
                hotelTier
                  ? null
                  : (view.living.deliveries.find((d) => d.owner === placeOwner && !d.complete) ??
                    null)
              }
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
          onWheel={(e) => {
            if (!is3d) return;
            endLook();
            api3d.current?.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
          }}
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
            <pattern id="home-marble" width="32" height="32" patternUnits="userSpaceOnUse">
              <rect width="32" height="32" fill="#f3efe8" />
              <rect width="16" height="16" fill="#e9e3d8" />
              <rect x="16" y="16" width="16" height="16" fill="#e9e3d8" />
              <path d="M2 28 Q12 18 30 6" stroke="#d6cfc2" strokeWidth="0.8" fill="none" />
            </pattern>
            <pattern id="home-deck" width="24" height="10" patternUnits="userSpaceOnUse">
              <rect width="24" height="10" fill="#c8a27a" />
              <path d="M0 9.5 H24" stroke="#9a7650" strokeWidth="1" />
            </pattern>
            <pattern id="home-bath" width="12" height="12" patternUnits="userSpaceOnUse">
              <rect width="12" height="12" fill="var(--home-bath)" />
              <path d="M0 11.5 H12 M11.5 0 V12" stroke="var(--home-bath-line)" strokeWidth="1" />
            </pattern>
          </defs>
          <g ref={worldRef}>
            <Shell
              plan={plan}
              night={night}
              paint={paintColour(wallPaint)}
              floors={finish3d?.floors}
              level={level}
              hotel={hotelTier ? HOTEL_WINDOWS[hotelTier] : null}
            />
            {/* The rug lies under the tiles in 2D; in 3D it's hidden like the rest. */}
            <g className="home-rugs">
              {objects
                .filter((o) => o.id === 'rug')
                .map((o) => (
                  <ObjNode key={o.id} o={o} />
                ))}
            </g>
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
            {wallGhost && (
              <rect
                className="home-wall-ghost"
                data-ok={wallGhost.ok ? '1' : '0'}
                x={wallGhost.dir === 'h' ? wallGhost.x * TILE : wallGhost.x * TILE - 5}
                y={wallGhost.dir === 'h' ? wallGhost.y * TILE - 5 : wallGhost.y * TILE}
                width={wallGhost.dir === 'h' ? wallGhost.len * TILE : 10}
                height={wallGhost.dir === 'h' ? 10 : wallGhost.len * TILE}
                rx={3}
              />
            )}
            {/* Room names are a planning aid: shown while editing, hidden the rest of the time. */}
            {(sheet === 'buy' || sheet === 'edit' || !!placing || !!wallPlacing || !!naming) &&
              (roomNames.length > 0 || (naming && naming !== 'pick')) && (
                <g className="home-room-names" data-rooms={roomNames.length}>
                  {roomNames.map((r) => (
                    <text
                      key={`${r.x},${r.y}`}
                      data-room-name={r.label}
                      x={(r.x + 0.5) * TILE}
                      y={(r.y + 0.6) * TILE}
                      textAnchor="middle"
                    >
                      {r.label}
                    </text>
                  ))}
                  {naming && naming !== 'pick' && (
                    <circle
                      className="home-room-pin"
                      cx={(naming.x + 0.5) * TILE}
                      cy={(naming.y + 0.5) * TILE}
                      r={9}
                    />
                  )}
                </g>
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
                  // "Add: Air conditioning", not "Get a air conditioning" (play-test #40).
                  aria-label={t('Add: {thing}', { thing: slotLabel(o.slot!) })}
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
        {floors.length > 1 && (
          <div className="home-floors" role="group" aria-label={t('Floors')}>
            {[...floors.keys()].reverse().map((i) => (
              <button
                key={i}
                type="button"
                data-floor-btn={floors[i]!.level ?? i}
                aria-pressed={i === floor}
                onClick={() => goFloor(i)}
              >
                {levelName(floors[i]!.level ?? i)}
              </button>
            ))}
          </div>
        )}
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
        {flash > 0 && <div key={flash} className="home-flash" aria-hidden="true" />}
        {resting && <RestChip spot={resting.spot} label={resting.label} onUp={getUp} />}
        {placing && ghost && (
          <PlaceBar
            label={placing.label}
            ok={ghost.ok}
            moved={!!placed[placing.slot]}
            onWall={onWall}
            coming={
              placing.tier !== undefined ||
              (!tiers.has(slotOf(placing.slot)) && !extraTiers.has(placing.slot))
            }
            onRotate={turnPlacing}
            onNudge={nudge}
            onLift={
              onWall
                ? (d) =>
                    setPlacing({
                      ...placing,
                      p: {
                        ...placing.p,
                        lift: Math.max(-1, Math.min(1, (placing.p.lift ?? 0) + d)),
                      },
                    })
                : undefined
            }
            lift={placing.p.lift ?? 0}
            at={`${placing.p.x},${placing.p.y},${placing.p.rot}`}
            tiles={onWall ? null : { w: ghost.spot.w, d: ghost.spot.h }}
            onDone={finishPlacing}
            onReset={resetPlacing}
            onCancel={cancelPlacing}
          />
        )}
        {wallPlacing && wallGhost && (
          <PlaceBar
            label={wallPlacing.label}
            ok={wallGhost.ok}
            moved={false}
            onRotate={() => setWallPlacing(turnDivider(plan, wallPlacing))}
            onNudge={nudge}
            onDone={() => void finishWall()}
            onReset={() => {}}
            onCancel={() => setWallPlacing(null)}
          />
        )}
        {naming && (
          <div className="place-bar home-naming" role="toolbar" aria-label={t('Name a room')}>
            {naming === 'pick' ? (
              <p className="place-hint">{t('Tap a room to name it.')}</p>
            ) : (
              <form
                className="place-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveName();
                }}
              >
                <input
                  className="home-naming-input"
                  aria-label={t('Room name')}
                  maxLength={24}
                  placeholder={t('Office, nursery, gym…')}
                  value={naming.label}
                  onChange={(e) => setNaming({ ...naming, label: e.target.value })}
                />
                <button type="submit" className="place-done" disabled={busy}>
                  {naming.label.trim() ? t('Save') : t('Clear')}
                </button>
              </form>
            )}
            <div className="place-row">
              <button type="button" className="place-cancel" onClick={() => setNaming(null)}>
                {t('Done')}
              </button>
            </div>
          </div>
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
      {/* Round 7: the van per order, "Unpack all" (then straight to placing). */}
      {!hotelTier && <DeliveryBanner owner={placeOwner} />}
      {/* The room's buttons: a rail of icons on the right, the rest behind ⋯
          (out of the way while you place something). */}
      {!placing && !wallPlacing && !naming && (
        <HudRail
          label={hotelTier ? t('Hotel room actions') : t('Home actions')}
          className="home-rail"
          extras={
            <>
              {hotelTier && balcony && (
                <HudButton
                  label={t('Balcony')}
                  data-action="hotel-balcony"
                  onClick={() => setSky(true)}
                >
                  <span aria-hidden="true">🌇</span>
                </HudButton>
              )}
              {hotelTier && (
                <HudButton
                  icon="info"
                  label={t('About your stay')}
                  data-action="more"
                  aria-haspopup="dialog"
                  onClick={() => setHotelMore(true)}
                />
              )}
              {is3d && hotelTier && (
                <HudButton
                  icon="rotate"
                  label={t('Turn')}
                  data-action="turn"
                  onClick={() => {
                    endLook();
                    api3d.current?.turn(1);
                  }}
                />
              )}
              {is3d && (
                <HudButton
                  icon="camera"
                  label={t('Photo')}
                  data-action="photo"
                  onClick={takePhoto}
                />
              )}
              {!hotelTier && !hostView && (
                <HudButton
                  icon="sofa"
                  label={t('Edit')}
                  aria-haspopup="dialog"
                  onClick={() => setSheet('edit')}
                />
              )}
              {!hotelTier && (
                <HudButton
                  icon="friends"
                  label={t('Home & friends')}
                  aria-haspopup="dialog"
                  onClick={() => openLiving(placeOwner)}
                />
              )}
              {!hotelTier && (
                <HudButton
                  icon="pad"
                  label={t('Play together')}
                  aria-haspopup="dialog"
                  onClick={() => openPlay({ venue: `home:${placeOwner}`, name: homeName })}
                />
              )}
              {!hotelTier && !hostView && (
                <HudButton
                  icon="wave"
                  label={t('Invite')}
                  aria-haspopup="dialog"
                  onClick={() => setSheet('invite')}
                />
              )}
              {!hotelTier && balcony && (
                <HudButton
                  label={t('Watch the skyline')}
                  data-action="skyline"
                  onClick={() => setSky(true)}
                >
                  <span aria-hidden="true">🌆</span>
                </HudButton>
              )}
              {is3d && (
                <HudButton
                  icon="plus"
                  label={t('Zoom in')}
                  onClick={() => api3d.current?.zoom(1.25)}
                />
              )}
              {is3d && (
                <HudButton
                  icon="minus"
                  label={t('Zoom out')}
                  onClick={() => api3d.current?.zoom(0.8)}
                />
              )}
            </>
          }
        >
          {hostView ? (
            <HudButton icon="wave" tone="accent" label={t('Say goodbye')} onClick={onClose} />
          ) : (
            <HudButton
              icon="door"
              tone="accent"
              label={t('Go out')}
              data-action="go-out"
              onClick={onClose}
            />
          )}
          {hotelTier ? (
            <>
              <HudButton
                label={t('Sleep')}
                data-action="hotel-sleep"
                disabled={busy || !!acting}
                onClick={() => hotelAct(['bed'], 'sleep')}
              >
                <span aria-hidden="true">🛏</span>
              </HudButton>
              <HudButton
                label={t('Freshen up')}
                data-action="hotel-freshen"
                disabled={busy || !!acting}
                onClick={() => hotelAct(['shower', 'bathtub'], 'shower')}
              >
                <span aria-hidden="true">🚿</span>
              </HudButton>
            </>
          ) : (
            !hostView && (
              <>
                <HudButton
                  icon="cart"
                  label={t('Buy')}
                  aria-haspopup="dialog"
                  onClick={() => setSheet('buy')}
                />
                {view.me.shop && (
                  <HudButton
                    label={t('Shop')}
                    data-action="shop-online"
                    aria-haspopup="dialog"
                    onClick={() => setShopAll(true)}
                  >
                    <span aria-hidden="true">🛍️</span>
                  </HudButton>
                )}
              </>
            )
          )}
          {is3d && !hotelTier && (
            <HudButton
              icon="rotate"
              label={t('Turn')}
              data-action="turn"
              onClick={() => {
                endLook();
                api3d.current?.turn(1);
              }}
            />
          )}
          {is3d && (
            <HudButton
              icon="eye"
              label={t('Look around')}
              data-action="look-around"
              data-looking={looking ? '1' : '0'}
              aria-pressed={looking}
              onClick={toggleLook}
            />
          )}
        </HudRail>
      )}
      {hotelTier && hotelMore && (
        <div className="home-sheet-back" onClick={() => setHotelMore(false)}>
          <section
            className="home-sheet"
            role="dialog"
            aria-label={t('About your stay')}
            data-hotel-more=""
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h3>{t('About your stay')}</h3>
              <button
                type="button"
                className="icon-btn"
                aria-label={t('Close')}
                onClick={() => setHotelMore(false)}
              >
                ✕
              </button>
            </header>
            {(friendDoors.length > 0 || visitor) && (
              <div className="home-hotel-friends" data-hotel-friends="">
                {visitor && (
                  <button
                    type="button"
                    className="home-bar-btn"
                    data-action="hotel-goodbye"
                    data-friend={visitor.id}
                    disabled={busy}
                    onClick={() => void goodbye()}
                  >
                    <span aria-hidden="true">👋</span>
                    {t('Say goodbye to {name}', { name: visitor.name.split(' ')[0]! })}
                  </button>
                )}
                {friendDoors
                  .filter((f) => f.id !== visitor?.id)
                  .map((f) => {
                    const first = f.name.split(' ')[0]!;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className="home-bar-btn"
                        data-action="hotel-knock"
                        data-friend={f.id}
                        disabled={!!waiting || !!visit || busy}
                        onClick={() => void knock(f)}
                      >
                        <span aria-hidden="true">🚪</span>
                        {t('Knock on {name}’s door · {room}', { name: first, room: f.room })}
                      </button>
                    );
                  })}
              </div>
            )}
            <div className="interior">{children}</div>
          </section>
        </div>
      )}
      {sheet === 'buy' && (
        <BuySheet
          owned={tiers}
          placed={placements}
          onClose={closeBuy}
          onPlace={(slot, label) => void startPlacing(slot, label)}
          extras={extraList ?? []}
          onPlaceExtra={(key, label) => setPlaceSoon({ key, label })}
          onPlaceAll={placeNext}
          plan={basePlan}
          floors={buyFloors}
          onFloor={goFloor}
          onTurn={is3d ? (dir) => api3d.current?.turn(dir) : undefined}
          onPreview={setTryFinish}
          walls={extras.walls}
          floor={floor}
          onPlaceWall={startWall}
          onShopWalls={() => {
            setSheet(null);
            setShopWalls(true);
          }}
          onShop={
            view.me.shop
              ? () => {
                  setSheet(null);
                  setShopAll(true);
                }
              : undefined
          }
          onNameRooms={() => {
            setSheet(null);
            setNaming('pick');
          }}
        />
      )}
      {shopAll && view.me.shop && (
        <CatalogueSheet
          mode="online"
          title={t('Shop online')}
          entries={onlineCatalog(view)}
          currency={view.me.shop.currency}
          onClose={() => setShopAll(false)}
          dock
          onBack={() => {
            setShopAll(false);
            setSheet('buy');
          }}
        />
      )}
      {shopWalls && view.me.shop && (
        <CatalogueSheet
          mode="online"
          title={t('Walls & dividers')}
          entries={onlineCatalog(view)}
          currency={view.me.shop.currency}
          category="walls"
          onClose={() => setShopWalls(false)}
          dock
          onBack={() => {
            setShopWalls(false);
            setSheet('buy');
          }}
        />
      )}

      {sheet && sheet !== 'buy' && (
        <div className="home-sheet-back" onClick={() => setSheet(null)}>
          <section
            className="home-sheet"
            role="dialog"
            aria-label={sheetTitle(sheet)}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h3>{sheetTitle(sheet)}</h3>
              <button
                type="button"
                className="icon-btn"
                aria-label={t('Close')}
                onClick={() => setSheet(null)}
              >
                ✕
              </button>
            </header>
            {sheet === 'party' ? (
              <PartyList
                people={view.living.people}
                busy={busy}
                onInvite={async (ids) => {
                  let sent = 0;
                  for (const id of ids)
                    if (await send({ type: 'visit.invite', toPlayerId: id })) sent++;
                  if (sent) {
                    toast(
                      t('{n} invited. They’ll see your skyline when they come over.', { n: sent }),
                      'ok',
                    );
                    setSheet(null);
                  }
                }}
                onContacts={() => setSheet('invite')}
              />
            ) : sheet === 'edit' ? (
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
      {photo && (
        <PhotoSheet
          first={photo.src}
          city={view.here?.name ?? view.market.name}
          onClose={() => setPhoto(null)}
        />
      )}
      {sky && balcony && (
        <Suspense fallback={null}>
          <Panorama
            city={city}
            balcony={balcony}
            holdingHands={false}
            onClose={() => setSky(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

const sheetTitle = (s: 'edit' | 'invite' | 'party') =>
  s === 'edit'
    ? t('Furnish your home')
    : s === 'party'
      ? t('Host a party')
      : t('Invite someone over');

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

function buildObjects(
  plan: HomePlan,
  tiers: Map<string, number>,
  night: boolean,
  grounds: Grounds,
  carName: (model: string) => string,
  /**
   * `outside`: the ground floor (the grounds are yours to use); `host`: your
   * own home; `hotel`: a hotel room (only what a guest of the hotel can do).
   */
  opts: {
    outside: boolean;
    host: boolean;
    hotel?: HotelTier | null;
    /** More of a thing you have, by key ('sound#extra_1k') → its tier. */
    extras?: ReadonlyMap<string, number>;
  } = {
    outside: true,
    host: true,
  },
): Obj[] {
  const out: Obj[] = [];
  const has = (s: string) => tiers.has(s);
  const tierOf = (s: string) => tiers.get(s) ?? 1;
  const act = (id: HomeAct, label: string): Verb => ({ id, act: id, label });
  const buy = (slot: string, label = t('Add: {thing}', { thing: slotLabel(slot) })): Verb => ({
    id: 'buy',
    label,
    slot,
  });
  const upgrade = (slot: string): Verb => ({ id: 'buy', label: t('Upgrade'), slot });
  const push = (o: Omit<Obj, 'base'>) => out.push({ ...o, base: o.spot.y + o.spot.h });
  const slotObj = (slot: string, verbs: Verb[], extra?: ReactNode) => {
    // Upstairs or down: each floor has its own things.
    const s = plan.slots[slot];
    if (!s) return;
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
  // Round 7e: or sit on its edge (a rest like a chair's).
  if (has('bed') || !plan.fixtures.mat)
    slotObj('bed', [
      act('sleep', t('Sleep')),
      { id: 'sit', label: t('Sit on the bed') },
      act('nap', t('Nap')),
    ]);
  else
    fixture('bed', 'mat', t('Sleeping mat'), [
      act('sleep', t('Sleep')),
      { id: 'sit', label: t('Sit on the mat') },
      act('nap', t('Nap')),
      buy('bed'),
    ]);
  // Kitchen (or the kitchenette).
  const kitchenVerbs = [
    act('cook', t('Cook')),
    act('snack', t('Snack')),
    { id: 'order', label: t('Order in') } as Verb,
  ];
  if (has('kitchen') || !plan.fixtures.kitchenette) slotObj('kitchen', kitchenVerbs);
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
  if (has('sofa') || !plan.fixtures.cushions)
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
  for (const slot of ['wardrobe', 'plants', 'art', 'lights', 'sound', 'cooling', 'power', 'wifi'])
    if (has(slot)) slotObj(slot, [upgrade(slot)]);
  // Round 7: a chair at the table to sit on.
  if (has('dining'))
    slotObj('dining', [{ id: 'sit', label: t('Sit at the table') }, upgrade('dining')]);
  // The utility room: wash and dry your clothes.
  if (has('washer')) slotObj('washer', [act('laundry', t('Do laundry')), upgrade('washer')]);
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
  // Wave 12: what a bigger home comes with (guest beds, the island, the gym, the cinema).
  for (const d of plan.decor)
    push({
      id: d.id,
      label: t(d.label),
      spot: d.spot,
      verbs: [
        // Round 7: seats you can sit on (round 7e: a guest bed's edge too).
        ...(d.model === 'cinema-seats' ? [{ id: 'sit', label: t('Sit') } as Verb] : []),
        ...(d.model === 'guest-bed' ? [{ id: 'sit', label: t('Sit on the bed') } as Verb] : []),
        ...d.verbs.map((v): Verb =>
          'act' in v
            ? act(v.act, t(v.label))
            : v.id === 'floor'
              ? { id: 'floor', label: t(v.label), to: v.to }
              : { id: 'invite', label: t(v.label) },
        ),
      ],
      art: <DecorArt model={d.model} w={d.spot.w} h={d.spot.h} />,
      model: d.model,
      finish: d.tier,
      ry: (d.spot.rot * Math.PI) / 2,
      ...(d.verbs.some((v) => 'to' in v) ? { guest: true } : {}),
    });
  // …and outside: the pool, the loungers, your cars. You use them from the front door.
  for (const o of opts.outside ? outdoorThings(grounds) : []) {
    const spot: Spot = {
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      blocked: false,
      interact: { ...plan.door },
    };
    push({
      id: o.id,
      label: o.model.startsWith('car:') ? carName(o.model.slice(4)) : t(o.label),
      spot,
      verbs: o.verbs
        // Only the owner throws a party.
        .filter((v) => opts.host || !('id' in v) || v.id !== 'party')
        .map((v): Verb =>
          'act' in v
            ? act(v.act, t(v.label))
            : 'model' in v
              ? { id: 'car', label: t(v.label, { car: carName(v.model) }), model: v.model }
              : v.id === 'skyline'
                ? { id: 'skyline', label: t(v.label) }
                : { id: 'party', label: t(v.label) },
        ),
      ...(o.id === 'skyline' ? { guest: true } : {}),
      art: <DecorArt model={o.model} w={o.w} h={o.h} />,
      model: o.model,
      finish: 2,
      ry: o.rot,
      outdoor: true,
    });
  }
  // A hotel room: the hotel's things, used the way a guest can (no moving, buying or upgrading).
  if (opts.hotel) {
    // …drawn as the hotel's own fittings (a suite's freestanding tub, rain shower, double basins).
    const own = HOTEL_MODELS[opts.hotel];
    return out
      .filter((o) => o.owned !== false)
      .map((o) => ({
        ...o,
        ...(own[o.id] ? { model: own[o.id] } : {}),
        verbs: o.verbs.filter(
          (v) => ('act' in v && HOTEL_ACTS.has(v.act)) || v.id === 'out' || v.id === 'sit',
        ),
      }));
  }
  // More of a thing (player feedback): each its own, to move or sell back.
  for (const [k, tier] of opts.extras ?? []) {
    const s = plan.slots[k];
    const slot = slotOf(k);
    if (!s) continue;
    push({
      id: k,
      label: slotLabel(slot),
      spot: s,
      verbs: [
        { id: 'move', label: t('Move'), move: k },
        { id: 'sell', label: t('Sell it back'), extra: k.slice(slot.length + 1) },
      ],
      slot,
      owned: true,
      tier,
      art: <SlotArt slot={slot} tier={tier} w={s.w} h={s.h} night={night} />,
    });
  }
  // Owned slots carry their verbs; the rest get a "+".
  for (const slot of Object.keys(plan.slots)) if (!has(slot) && !slot.includes('#')) plus(slot);
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
      data-car={o.model?.startsWith('car:') ? o.label : undefined}
      data-outdoor={o.outdoor ? '1' : undefined}
      role="button"
      aria-label={o.label}
      transform={`translate(${x} ${y})`}
    >
      {o.art}
    </g>
  );
}

/** Floors, the back wall with windows, the side walls. */
/**
 * A floor you chose (Buy mode's Design tab) in the 2D home: the nearest of its
 * patterns, or a flat colour (play-test: the Lite home showed no finish at all).
 */
const FLOOR_2D: Record<string, string> = {
  oak: 'url(#home-wood)',
  parquet: 'url(#home-wood)',
  'parquet-dark': '#7a4f2e',
  cream: 'url(#home-tile)',
  tile: 'url(#home-tile)',
  checker: 'url(#home-tile)',
  carpet: '#b9a99a',
  concrete: '#b8b3aa',
  stone: 'url(#home-deck)',
  marble: 'url(#home-marble)',
};

function Shell({
  plan,
  night,
  paint,
  floors,
  level = 0,
  hotel,
}: {
  plan: HomePlan;
  night: boolean;
  /** A hotel room's windows (where the hotel's plan puts them). */
  hotel?: readonly HotelWindow[] | null;
  /** The walls' paint (a colour), or null as built. */
  paint?: string | null;
  /** Floors you chose, by room key ('0:living'). */
  floors?: Record<string, string>;
  level?: number;
}) {
  const W = plan.w * TILE;
  const H = plan.h * TILE;
  const fill = (id: string) =>
    FLOOR_2D[floors?.[`${level}:${id}`] ?? ''] ??
    (id === 'kitchen'
      ? 'url(#home-tile)'
      : id === 'bathroom'
        ? 'url(#home-bath)'
        : id === 'hall'
          ? 'url(#home-marble)'
          : id === 'balcony' || id === 'terrace'
            ? 'url(#home-deck)'
            : 'url(#home-wood)');
  const outdoors = plan.rooms.filter((r) => r.open && r.y === 0);
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
          key={`${r.id}:${r.x},${r.y}`}
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
      <rect
        x={-8}
        y={-WALL}
        width={W + 16}
        height={WALL}
        fill={paint ?? 'var(--home-wall-face)'}
        data-wall-paint={paint ?? undefined}
      />
      <rect x={-8} y={-WALL - 8} width={W + 16} height={8} fill="var(--home-wall-top)" />
      <rect x={-8} y={-6} width={W + 16} height={6} fill="var(--home-skirting)" />
      {/* Out on a roof terrace: the sky and the city over a glass railing. */}
      {outdoors.map((r) => (
        <g key={`sky${r.x}`} className="home-sky">
          <rect
            x={r.x * TILE}
            y={-WALL - 8}
            width={r.w * TILE}
            height={WALL + 8}
            fill={night ? '#1e2a5a' : '#bae6fd'}
          />
          <path
            d={skylinePath(r.x * TILE, r.w * TILE, -4)}
            fill={night ? '#0f172a' : '#94a3b8'}
            opacity="0.85"
          />
          <rect
            x={r.x * TILE}
            y={-16}
            width={r.w * TILE}
            height={14}
            fill="#bfe3f0"
            opacity="0.5"
          />
          <rect x={r.x * TILE} y={-17} width={r.w * TILE} height={3} fill="#d9dde3" />
        </g>
      ))}
      <rect x={-8} y={-WALL - 8} width={8} height={H + WALL + 8} fill="var(--home-wall-top)" />
      <rect x={W} y={-WALL - 8} width={8} height={H + WALL + 8} fill="var(--home-wall-top)" />
      {/* The windows the 3D house has (playtest #40: one list, so Buy mode keeps pictures off them). */}
      <HomeWindows plan={plan} night={night} hotel={hotel} wallH={WALL} />
      {/* Bathroom doors, swung open, with a sign. */}
      {bathDoors(plan).map((d) => {
        const L = TILE * 0.85;
        const hx = d.x * TILE;
        const hy = d.y * TILE;
        const s = d.inside;
        return d.dir === 'h' ? (
          <g key={`bd${d.x},${d.y}`} className="home-bath-door" data-bath-door="">
            <path
              d={`M${hx + L + 2} ${hy} A${L} ${L} 0 0 ${s > 0 ? 1 : 0} ${hx + 2} ${hy + s * L}`}
              fill="none"
              stroke="#94a3b8"
              strokeDasharray="3 3"
            />
            <rect
              x={hx}
              y={s > 0 ? hy : hy - L}
              width={4}
              height={L}
              rx={1}
              fill="#fbfaf7"
              stroke="#64748b"
            />
            <rect x={hx + TILE / 2 - 5} y={hy - 4} width={10} height={8} rx={2} fill="#0ea5e9" />
          </g>
        ) : (
          <g key={`bd${d.x},${d.y}`} className="home-bath-door" data-bath-door="">
            <path
              d={`M${hx} ${hy + L + 2} A${L} ${L} 0 0 ${s > 0 ? 0 : 1} ${hx + s * L} ${hy + 2}`}
              fill="none"
              stroke="#94a3b8"
              strokeDasharray="3 3"
            />
            <rect
              x={s > 0 ? hx : hx - L}
              y={hy}
              width={L}
              height={4}
              rx={1}
              fill="#fbfaf7"
              stroke="#64748b"
            />
            <rect x={hx - 4} y={hy + TILE / 2 - 5} width={8} height={10} rx={2} fill="#0ea5e9" />
          </g>
        );
      })}
    </g>
  );
}

/** A row of towers along the top of a terrace (px; `w` wide, standing on `base`). */
function skylinePath(x0: number, w: number, base: number) {
  let d = `M${x0} ${base}`;
  for (let x = 0, i = 0; x < w; i++) {
    const bw = 10 + ((i * 7) % 9) * 2;
    const bh = 14 + ((i * 13) % 11) * 2.4;
    const ex = Math.min(w, x + bw);
    d += ` L${x0 + x} ${base - bh} L${x0 + ex} ${base - bh}`;
    x = ex;
  }
  return `${d} L${x0 + w} ${base} Z`;
}

/** The front ledge ("walls down") with the door gap (a glass railing along a balcony). */
function Front({ plan }: { plan: HomePlan }) {
  const W = plan.w * TILE;
  const H = plan.h * TILE;
  if ((plan.level ?? 0) > 0)
    return (
      <g className="home-front" pointerEvents="none">
        <rect x={-8} y={H} width={W + 16} height={8} fill="var(--home-wall-top)" />
        {plan.rooms
          .filter((r) => r.open && r.y + r.h === plan.h)
          .map((r) => (
            <rect key={r.x} x={r.x * TILE} y={H} width={r.w * TILE} height={8} fill="#bfe3f0" />
          ))}
      </g>
    );
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

/**
 * A penthouse party: invite players in town over (the same invitation as
 * "Invite over"); when they come, your home opens for them with the balcony
 * and its skyline. Contacts can come too (the Invite list).
 */
function PartyList({
  people,
  busy,
  onInvite,
  onContacts,
}: {
  people: { id: string; name: string }[];
  busy: boolean;
  onInvite: (ids: string[]) => void;
  onContacts: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="home-sheet-body">
      <p className="small muted">
        {t('Friends come up to your balcony to watch the city with you.')}
      </p>
      {people.length ? (
        <div className="home-invitees" role="list">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              role="listitem"
              className="home-row"
              data-party-invite={p.id}
              aria-pressed={picked.has(p.id)}
              onClick={() => toggle(p.id)}
            >
              <span aria-hidden="true">{picked.has(p.id) ? '✅' : '🧑'}</span>
              <span>
                <b>{p.name}</b>
                <small>{t('Player in town')}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="small muted">{t('No other players in town right now.')}</p>
      )}
      <div className="home-party-actions">
        <button
          type="button"
          className="home-bar-btn"
          data-action="party-send"
          disabled={busy || picked.size === 0}
          onClick={() => onInvite([...picked])}
        >
          {t('🥂 Send invitations ({n})', { n: picked.size })}
        </button>
        <button type="button" className="home-bar-btn" onClick={onContacts}>
          {t('👋 Invite a contact')}
        </button>
      </div>
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

/**
 * Your stay as the hotel room needs it, as a string that only changes when it
 * does (the view changes all the time): your holiday's room number and the
 * friends from the trip in the hotel now, with theirs.
 */
/** The holiday whose hotel you're in (you're going, it has a hotel). */
const hotelHoliday = (view: Parameters<typeof holidaysOf>[0]) =>
  holidaysOf(view).find((x) => x.myStatus !== 'pending' && x.hotel);

function hotelStayKey(view: Parameters<typeof holidaysOf>[0]): string {
  const h = hotelHoliday(view);
  // Over at a friend's: their room, the doors either side of it.
  const host = h?.visit?.me === 'guest' ? h.visit.host.id : view.me.id;
  const room = h?.rooms[host];
  if (!h || !room) return '';
  const friends = h.companionsHere
    .filter((c) => h.rooms[c.id] && c.id !== host)
    .map((c) => ({ id: c.id, name: c.name, room: h.rooms[c.id]! }));
  return JSON.stringify({ room, friends });
}
