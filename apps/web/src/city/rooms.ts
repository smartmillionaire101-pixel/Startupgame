/**
 * Places you walk into (docs/WAVE5-FUN-LIFE-AND-CAPITAL.md §D): which room
 * a place is, where people stand or sit in it and what they're doing. Pure
 * data and functions; ./RoomArt.tsx draws the rooms and ./PlaceScene.tsx
 * puts the people in them.
 *
 * Rooms are drawn front-on in a 360 × 240 box: the back wall to y≈140, the
 * floor below. A slot is a spot for a person's feet; seated people sit
 * behind a table or a row of seats that hides their legs.
 */
import { hash, isCafe } from './contract';
import type { Place } from './layout';

export type RoomKind =
  | 'restaurant'
  | 'cafe'
  | 'club'
  | 'bar'
  | 'cinema'
  | 'gym'
  | 'cowork'
  | 'office'
  | 'bank'
  | 'investor'
  | 'accelerator'
  | 'devpartner'
  | 'showroom'
  | 'furniture'
  | 'apartment'
  | 'hotel'
  | 'hub'
  | 'market'
  | 'eventhall'
  | 'airport'
  | 'shop'
  | 'clinic'
  | 'gallery'
  | 'school'
  | 'workshop';

export const ROOM_KINDS: readonly RoomKind[] = [
  'restaurant',
  'cafe',
  'club',
  'bar',
  'cinema',
  'gym',
  'cowork',
  'office',
  'bank',
  'investor',
  'accelerator',
  'devpartner',
  'showroom',
  'furniture',
  'apartment',
  'hotel',
  'hub',
  'market',
  'eventhall',
  'airport',
  'shop',
  'clinic',
  'gallery',
  'school',
  'workshop',
];

export type Activity =
  | 'eating'
  | 'drinking'
  | 'chatting'
  | 'dancing'
  | 'typing'
  | 'ordering'
  | 'serving'
  | 'workout'
  | 'watching'
  | 'browsing'
  | 'relaxing'
  | 'waiting'
  | 'presenting'
  | 'dj';

export interface Slot {
  x: number;
  /** Feet. */
  y: number;
  act: Activity;
  /** Seated: drawn behind the furniture in front of them (legs hidden). */
  sit?: boolean;
  /** Who it's for: staff (owner, officer, partner, DJ) or guests. */
  who: 'staff' | 'guest';
  /** Facing left. */
  flip?: boolean;
}

/** A business's room, from its kind (section A adds clubs, cinemas, showrooms…) and shape. */
export function businessRoom(kind: string, shape?: string): RoomKind {
  const k = kind.toLowerCase();
  if (/night-?club|disco|club(?!.*(golf|book))/.test(k)) return 'club';
  if (/cinema|movie|film/.test(k)) return 'cinema';
  if (/car|dealer|motor|showroom|auto/.test(k)) return 'showroom';
  if (/furnit|interior|homeware|decor/.test(k)) return 'furniture';
  if (/gallery|art/.test(k)) return 'gallery';
  if (/cowork|co-work/.test(k)) return 'cowork';
  if (/gym|fitness|yoga|boxing|pilates|climb|studio/.test(k)) return 'gym';
  if (/lounge|rooftop|bar|pub|music|jazz|live|karaoke|wine/.test(k)) return 'bar';
  if (isCafe(k)) return 'cafe';
  if (
    /restaurant|buka|grill|chop|suya|food|eatery|kitchen|diner|taquer|dim-sum|curry|koshary|shawarma|caff|kibanda|waakye|canteen|bistro/.test(
      k,
    )
  )
    return 'restaurant';
  if (/clinic|dentist|pharmac|health/.test(k)) return 'clinic';
  if (/school|tutor|bootcamp|academy/.test(k)) return 'school';
  if (/mechanic|workshop|depot|warehouse|cold-store|courier|transport/.test(k)) return 'workshop';
  if (/hotel|guesthouse|co-living|event-venue/.test(k)) return 'bar';
  if (shape === 'restaurant') return 'restaurant';
  if (shape === 'pub') return 'bar';
  if (shape === 'clinic') return 'clinic';
  if (shape === 'school') return 'school';
  if (shape === 'warehouse') return 'workshop';
  return 'shop';
}

/** The room you walk into at a place. Away from home, your office is a co-working desk and home a hotel room. */
export function roomOf(
  place: Pick<Place, 'kind' | 'ref' | 'motif'>,
  opts: { abroad?: boolean; businessKind?: string; businessShape?: string; capital?: string } = {},
): RoomKind {
  switch (place.kind) {
    case 'business':
      return businessRoom(opts.businessKind ?? '', opts.businessShape);
    case 'lender':
    case 'playerbank':
      return 'bank';
    case 'fund':
      return 'investor';
    case 'stall':
      return 'market';
    case 'hub':
      return 'hub';
    case 'office':
      return opts.abroad ? 'cowork' : 'office';
    case 'home':
      return opts.abroad ? 'hotel' : 'apartment';
    case 'airport':
      return 'airport';
    case 'eventhall':
      return 'eventhall';
    case 'newsstand':
      return 'shop';
    default: {
      const k = (place as { kind: string }).kind;
      if (k === 'capital')
        return opts.capital === 'accelerator'
          ? 'accelerator'
          : opts.capital === 'devpartner'
            ? 'devpartner'
            : 'investor';
      return 'shop';
    }
  }
}

const S = (
  x: number,
  y: number,
  act: Activity,
  who: Slot['who'] = 'guest',
  more: Partial<Slot> = {},
): Slot => ({
  x,
  y,
  act,
  who,
  ...more,
});

/** Where people go in each room: staff first, then guests (best spots first). */
export const ROOM_SLOTS: Record<RoomKind, Slot[]> = {
  restaurant: [
    S(286, 150, 'serving', 'staff', { flip: true }),
    S(70, 186, 'eating', 'guest', { sit: true }),
    S(116, 186, 'eating', 'guest', { sit: true, flip: true }),
    S(196, 196, 'eating', 'guest', { sit: true }),
    S(244, 196, 'eating', 'guest', { sit: true, flip: true }),
    S(232, 160, 'ordering', 'guest', { flip: true }),
    S(312, 214, 'chatting', 'guest', { flip: true }),
    S(30, 222, 'chatting'),
  ],
  cafe: [
    S(86, 146, 'serving', 'staff'),
    S(208, 192, 'typing', 'guest', { sit: true }),
    S(292, 192, 'drinking', 'guest', { sit: true, flip: true }),
    S(150, 170, 'ordering', 'guest', { flip: true }),
    S(250, 192, 'chatting', 'guest', { sit: true, flip: true }),
    S(330, 216, 'drinking', 'guest', { flip: true }),
    S(40, 218, 'chatting'),
  ],
  club: [
    S(180, 136, 'dj', 'staff'),
    S(120, 200, 'dancing'),
    S(236, 196, 'dancing', 'guest', { flip: true }),
    S(176, 214, 'dancing'),
    S(76, 220, 'dancing', 'guest', { flip: true }),
    S(290, 222, 'dancing'),
    S(320, 176, 'drinking', 'guest', { flip: true }),
    S(36, 180, 'chatting'),
  ],
  bar: [
    S(150, 144, 'serving', 'staff'),
    S(92, 188, 'drinking', 'guest', { sit: true }),
    S(196, 188, 'drinking', 'guest', { sit: true, flip: true }),
    S(292, 204, 'chatting', 'guest', { flip: true }),
    S(252, 208, 'chatting'),
    S(144, 188, 'drinking', 'guest', { sit: true }),
    S(40, 214, 'chatting'),
  ],
  cinema: [
    S(330, 150, 'waiting', 'staff', { flip: true }),
    S(110, 178, 'watching', 'guest', { sit: true }),
    S(170, 178, 'watching', 'guest', { sit: true }),
    S(230, 178, 'watching', 'guest', { sit: true }),
    S(140, 218, 'watching', 'guest', { sit: true }),
    S(200, 218, 'watching', 'guest', { sit: true }),
    S(260, 218, 'watching', 'guest', { sit: true }),
    S(80, 218, 'watching', 'guest', { sit: true }),
  ],
  gym: [
    S(308, 150, 'chatting', 'staff', { flip: true }),
    S(80, 196, 'workout'),
    S(178, 204, 'workout', 'guest', { flip: true }),
    S(250, 184, 'workout'),
    S(130, 220, 'workout'),
    S(36, 214, 'chatting'),
  ],
  cowork: [
    S(300, 152, 'chatting', 'staff', { flip: true }),
    S(80, 178, 'typing', 'guest', { sit: true }),
    S(150, 178, 'typing', 'guest', { sit: true }),
    S(232, 214, 'typing', 'guest', { sit: true }),
    S(300, 214, 'typing', 'guest', { sit: true, flip: true }),
    S(40, 218, 'chatting'),
    S(176, 222, 'chatting', 'guest', { flip: true }),
  ],
  office: [
    S(300, 152, 'chatting', 'staff', { flip: true }),
    S(80, 178, 'typing', 'guest', { sit: true }),
    S(150, 178, 'typing', 'guest', { sit: true }),
    S(232, 214, 'typing', 'guest', { sit: true }),
    S(300, 214, 'typing', 'guest', { sit: true, flip: true }),
    S(40, 218, 'chatting'),
    S(176, 222, 'chatting', 'guest', { flip: true }),
  ],
  bank: [
    S(120, 150, 'serving', 'staff'),
    S(240, 150, 'serving', 'staff'),
    S(130, 196, 'waiting', 'guest', { flip: true }),
    S(250, 198, 'waiting'),
    S(300, 222, 'waiting', 'guest', { flip: true }),
    S(48, 216, 'chatting'),
  ],
  investor: [
    S(250, 176, 'chatting', 'staff', { flip: true }),
    S(150, 196, 'chatting', 'guest', { sit: true }),
    S(206, 196, 'chatting', 'guest', { sit: true, flip: true }),
    S(66, 206, 'relaxing', 'guest', { sit: true }),
    S(320, 214, 'typing', 'guest', { flip: true }),
  ],
  accelerator: [
    S(110, 150, 'presenting', 'staff'),
    S(200, 200, 'watching', 'guest', { sit: true, flip: true }),
    S(260, 200, 'typing', 'guest', { sit: true }),
    S(320, 206, 'chatting', 'guest', { flip: true }),
    S(150, 220, 'chatting'),
    S(40, 214, 'typing', 'guest', { sit: true }),
  ],
  devpartner: [
    S(260, 172, 'chatting', 'staff', { flip: true }),
    S(150, 194, 'chatting', 'guest', { sit: true }),
    S(206, 194, 'typing', 'guest', { sit: true, flip: true }),
    S(320, 214, 'waiting', 'guest', { flip: true }),
    S(50, 214, 'waiting'),
  ],
  showroom: [
    S(300, 160, 'chatting', 'staff', { flip: true }),
    S(150, 200, 'browsing'),
    S(250, 214, 'browsing', 'guest', { flip: true }),
    S(60, 214, 'browsing'),
  ],
  furniture: [
    S(310, 160, 'chatting', 'staff', { flip: true }),
    S(130, 196, 'relaxing', 'guest', { sit: true }),
    S(230, 214, 'browsing', 'guest', { flip: true }),
    S(60, 216, 'browsing'),
  ],
  apartment: [
    S(150, 196, 'relaxing', 'guest', { sit: true }),
    S(250, 214, 'chatting', 'guest', { flip: true }),
  ],
  hotel: [S(250, 214, 'relaxing', 'guest', { flip: true }), S(110, 214, 'chatting')],
  hub: [
    S(300, 152, 'chatting', 'staff', { flip: true }),
    S(80, 178, 'typing', 'guest', { sit: true }),
    S(150, 178, 'typing', 'guest', { sit: true }),
    S(232, 214, 'chatting', 'guest', { sit: true }),
    S(300, 214, 'chatting', 'guest', { sit: true, flip: true }),
    S(40, 218, 'chatting'),
    S(176, 222, 'drinking', 'guest', { flip: true }),
    S(110, 222, 'chatting'),
  ],
  market: [
    S(70, 150, 'serving', 'staff'),
    S(190, 150, 'serving', 'staff'),
    S(300, 150, 'serving', 'staff'),
    S(90, 200, 'ordering', 'guest', { flip: true }),
    S(206, 204, 'browsing'),
    S(300, 210, 'ordering', 'guest', { flip: true }),
    S(150, 224, 'chatting'),
    S(40, 222, 'browsing'),
  ],
  eventhall: [
    S(180, 136, 'presenting', 'staff'),
    S(80, 204, 'chatting'),
    S(120, 206, 'chatting', 'guest', { flip: true }),
    S(240, 206, 'chatting'),
    S(282, 206, 'drinking', 'guest', { flip: true }),
    S(180, 224, 'watching'),
    S(330, 224, 'chatting', 'guest', { flip: true }),
    S(30, 224, 'chatting'),
  ],
  airport: [
    S(250, 156, 'serving', 'staff', { flip: true }),
    S(170, 196, 'waiting'),
    S(80, 206, 'waiting', 'guest', { flip: true }),
    S(300, 214, 'waiting'),
    S(30, 222, 'chatting'),
  ],
  shop: [
    S(260, 156, 'serving', 'staff', { flip: true }),
    S(120, 200, 'browsing'),
    S(200, 214, 'ordering', 'guest', { flip: true }),
    S(50, 216, 'browsing'),
  ],
  clinic: [
    S(110, 156, 'serving', 'staff'),
    S(220, 196, 'waiting', 'guest', { sit: true }),
    S(270, 196, 'waiting', 'guest', { sit: true }),
    S(320, 196, 'waiting', 'guest', { sit: true, flip: true }),
    S(60, 216, 'chatting'),
  ],
  gallery: [
    S(310, 160, 'chatting', 'staff', { flip: true }),
    S(110, 196, 'browsing'),
    S(200, 210, 'browsing', 'guest', { flip: true }),
    S(150, 224, 'chatting'),
  ],
  school: [
    S(70, 152, 'presenting', 'staff'),
    S(160, 186, 'typing', 'guest', { sit: true }),
    S(240, 186, 'typing', 'guest', { sit: true }),
    S(320, 186, 'typing', 'guest', { sit: true }),
    S(200, 224, 'chatting'),
  ],
  workshop: [
    S(110, 176, 'workout', 'staff'),
    S(250, 196, 'chatting', 'guest', { flip: true }),
    S(310, 214, 'browsing'),
    S(50, 214, 'chatting'),
  ],
};

/** Where you stand when you walk in: near the door, bottom right. */
export const ENTRANCE: Slot = { x: 306, y: 232, act: 'waiting', who: 'guest', flip: true };

export interface Seatable {
  /** Staff take the staff spots (an owner behind the counter, a partner at the desk). */
  staff: boolean;
  /** Overrides the slot's activity (an angel chats, a team member types). */
  act?: Activity;
}

/**
 * Seat everyone: staff in staff spots, guests in guest spots (staff who
 * don't fit become guests and vice versa), at most one person a spot.
 * Returns the slot index per person, or -1 when the room is full.
 */
export function seat(kind: RoomKind, people: Seatable[]): number[] {
  const slots = ROOM_SLOTS[kind];
  const free = slots.map(() => true);
  const out = people.map(() => -1);
  const take = (n: number, who: Slot['who'] | null) => {
    const k = slots.findIndex((s, i) => free[i] && (who === null || s.who === who));
    if (k >= 0) {
      free[k] = false;
      out[n] = k;
    }
  };
  people.forEach((p, n) => p.staff && take(n, 'staff'));
  people.forEach((p, n) => !p.staff && take(n, 'guest'));
  people.forEach((_, n) => out[n] === -1 && take(n, null));
  return out;
}

/** How many extra regulars fill a room, so no room feels empty (stable per place and month). */
export function regularsFor(
  kind: RoomKind,
  placeId: string,
  month: number,
  present: number,
): number {
  const slots = ROOM_SLOTS[kind].filter((s) => s.who === 'guest').length;
  if (kind === 'apartment' || kind === 'hotel') return 0;
  const want = 2 + (hash(`${placeId}:${month}`) % 3);
  return Math.max(0, Math.min(slots - 1, want) - present);
}
