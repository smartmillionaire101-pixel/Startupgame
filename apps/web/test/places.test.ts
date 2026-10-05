import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import { cityInput } from '../src/city/contract';
import { buildLayout, findPath } from '../src/city/layout';
import {
  acceleratorsOf,
  angelsAtOf,
  devPartnersOf,
  genderOf,
  homeOf,
  jobsOf,
  myJobOf,
  shopOf,
} from '../src/city/life';
import { PLANS } from '../src/city/plans';
import { avatarLook } from '../src/city/art';
import {
  ENTRANCE,
  ROOM_KINDS,
  ROOM_SLOTS,
  businessRoom,
  regularsFor,
  roomOf,
  seat,
} from '../src/city/rooms';
import { suggestionsFor } from '../src/city/whatnow';

const biz = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Biz ${id}`,
  kind: 'restaurant',
  kindLabel: 'Restaurant',
  category: 'food',
  district: 'yaba',
  owner: { name: `Owner ${id}` },
  look: { shape: 'restaurant', color: '#f00', awning: null },
  open: true,
  venue: { items: [{ id: 'meal', label: 'Jollof rice', price: 2000, energy: 10 }] },
  gigs: [{ id: 'shift', label: 'Waiting shift', hours: 8, pay: 5000, skillMatch: false }],
  buys: [{ sector: 'fintech', label: 'Payments', monthlyBudget: 90000, supplier: null }],
  you: { customer: false, canPitch: true, reason: null },
  ...over,
});

/** A view with only the fields these adapters read. */
const view = (
  market: Record<string, unknown> = {},
  me: Record<string, unknown> = {},
  pocket = 1_000_000,
): PlayerView =>
  ({
    market: {
      id: 'lagos',
      name: 'Lagos',
      month: 3,
      costOfLiving: 100_000,
      bankName: 'Marina Bank',
      banks: [],
      funds: [],
      talent: [],
      segments: [{ key: 'k', name: 'Kiosks', industry: 'fintech' }],
      businesses: [
        biz('b1'),
        biz('b2', { kind: 'cafe', look: { shape: 'restaurant', color: '#0f0' } }),
      ],
      ...market,
    },
    companies: [{ id: 'c1', name: 'Oja', status: 'active', industry: 'fintech', teamSize: 2 }],
    accounts: { local: { balance: pocket } },
    players: [],
    directory: [],
    me: { id: 'me', energy: 80, hours: { left: 100 }, lifestyle: { tier: 2 }, ...me },
  }) as unknown as PlayerView;

describe('rooms (Wave 5 §D)', () => {
  it('has a furnished room with staff and guest spots for every kind', () => {
    for (const k of ROOM_KINDS) {
      const slots = ROOM_SLOTS[k];
      expect(slots.length, k).toBeGreaterThan(1);
      expect(
        slots.some((s) => s.who === 'guest'),
        k,
      ).toBe(true);
      for (const s of slots) {
        expect(s.x, k).toBeGreaterThanOrEqual(0);
        expect(s.x, k).toBeLessThanOrEqual(360);
        expect(s.y, k).toBeGreaterThan(130);
        expect(s.y, k).toBeLessThanOrEqual(240);
      }
    }
    expect(ENTRANCE.y).toBeLessThanOrEqual(240);
  });

  it('picks the room from the business kind and shape', () => {
    expect(businessRoom('restaurant')).toBe('restaurant');
    expect(businessRoom('buka', 'stall')).toBe('restaurant');
    expect(businessRoom('cafe')).toBe('cafe');
    expect(businessRoom('coffee-roaster')).toBe('cafe');
    expect(businessRoom('nightclub')).toBe('club');
    expect(businessRoom('lounge')).toBe('bar');
    expect(businessRoom('rooftop-bar')).toBe('bar');
    expect(businessRoom('pub', 'pub')).toBe('bar');
    expect(businessRoom('cinema')).toBe('cinema');
    expect(businessRoom('gym')).toBe('gym');
    expect(businessRoom('car-dealership')).toBe('showroom');
    expect(businessRoom('furniture-store')).toBe('furniture');
    expect(businessRoom('co-working')).toBe('cowork');
    expect(businessRoom('art-gallery')).toBe('gallery');
    expect(businessRoom('clinic', 'clinic')).toBe('clinic');
    expect(businessRoom('tailor', 'shopfront')).toBe('shop');
  });

  it('turns your office and home into a desk and a hotel room abroad', () => {
    const p = { ref: undefined, motif: 'office' as const };
    expect(roomOf({ ...p, kind: 'office' })).toBe('office');
    expect(roomOf({ ...p, kind: 'office' }, { abroad: true })).toBe('cowork');
    expect(roomOf({ ...p, kind: 'home' })).toBe('apartment');
    expect(roomOf({ ...p, kind: 'home' }, { abroad: true })).toBe('hotel');
    expect(roomOf({ ...p, kind: 'lender' })).toBe('bank');
    expect(roomOf({ ...p, kind: 'fund' })).toBe('investor');
    expect(roomOf({ ...p, kind: 'capital' }, { capital: 'accelerator' })).toBe('accelerator');
    expect(roomOf({ ...p, kind: 'capital' }, { capital: 'devpartner' })).toBe('devpartner');
  });

  it('seats staff in staff spots and never two people in one spot', () => {
    const people = [
      { staff: false },
      { staff: true },
      { staff: false },
      { staff: false },
      { staff: true },
    ];
    const out = seat('restaurant', people);
    const used = out.filter((n) => n >= 0);
    expect(new Set(used).size).toBe(used.length);
    expect(ROOM_SLOTS.restaurant[out[1]!]!.who).toBe('staff');
    // A room overflows gracefully.
    const crowd = seat(
      'apartment',
      Array.from({ length: 6 }, () => ({ staff: false })),
    );
    expect(crowd.filter((n) => n === -1).length).toBe(4);
  });

  it('fills rooms with a few regulars, but never your flat', () => {
    expect(regularsFor('restaurant', 'biz:x', 1, 0)).toBeGreaterThan(0);
    expect(regularsFor('apartment', 'home', 1, 0)).toBe(0);
    expect(regularsFor('restaurant', 'biz:x', 1, 0)).toBe(regularsFor('restaurant', 'biz:x', 1, 0));
  });
});

describe('Wave 5 view adapters', () => {
  it('fall back to nothing when the engine sends nothing', () => {
    const v = view();
    expect(jobsOf(v)).toEqual([]);
    expect(myJobOf(v)).toBeNull();
    expect(homeOf(v)).toBeNull();
    expect(shopOf(v)).toEqual({ furniture: [], cars: [] });
    expect(acceleratorsOf(v)).toEqual([]);
    expect(devPartnersOf(v)).toEqual([]);
    expect(angelsAtOf(v)).toBeNull();
    expect(genderOf(v.me)).toBeNull();
    expect(cityInput(v).capital).toBeUndefined();
  });

  it('read jobs, the shop, capital and angels when present', () => {
    const v = view(
      {
        jobs: [
          {
            businessId: 'b1',
            businessName: 'Biz b1',
            role: 'waiter',
            label: 'Waiter',
            monthlyPay: 30000,
            hours: 40,
          },
          {
            businessId: 'b2',
            businessName: 'Biz b2',
            role: 'barista',
            label: 'Barista',
            monthlyPay: 40000,
            hours: 40,
          },
          { nope: true },
        ],
        shop: {
          furniture: [{ itemId: 'sofa-2', slot: 'sofa', label: 'Sofa', tier: 2, price: 50000 }],
          cars: [{ modelId: 'hatch', label: 'Hatchback', price: 900000, monthlyCost: 20000 }],
        },
        accelerators: [{ id: 'acc1', name: 'Yaba Demo Days' }],
        devPartners: [
          {
            id: 'dp1',
            name: 'Youth Fund',
            programs: [{ id: 'g1', label: 'Youth jobs', amount: 500000 }],
          },
        ],
        lps: [{ id: 'lp1', name: 'Pension Fund', kind: 'pension' }],
        angelsAt: { b2: [{ id: 'ang1', name: 'Dolores' }] },
      },
      {
        gender: 'female',
        home: { items: [{ slot: 'sofa', itemId: 'sofa-2', label: 'Sofa', tier: 2 }], comfort: 3 },
      },
    );
    expect(jobsOf(v).map((j) => j.role)).toEqual(['barista', 'waiter']);
    expect(shopOf(v).cars[0]!.id).toBe('hatch');
    expect(shopOf(v).furniture[0]!.slot).toBe('sofa');
    expect(devPartnersOf(v)[0]!.programs[0]!.eligible).toBe(true);
    expect(angelsAtOf(v)).toEqual({ b2: [{ id: 'ang1', name: 'Dolores' }] });
    expect(genderOf(v.me)).toBe('female');
    expect(homeOf(v)!.items).toHaveLength(1);
    // Accelerators sit by the Hub; partners and LPs with the investors, all on the map.
    const input = cityInput(v);
    expect(input.capital!.map((c) => c.kind)).toEqual(['accelerator', 'devpartner', 'lp']);
    const l = buildLayout(input);
    for (const id of ['cap:acc1', 'cap:dp1', 'cap:lp1']) {
      const p = l.places.find((x) => x.id === id);
      expect(p, id).toBeDefined();
      const path = findPath(l, l.start, p!.door);
      expect(path[path.length - 1]).toEqual(p!.door);
    }
  });
});

describe('What to do now', () => {
  it('suggests three things, a job first when you’re broke', () => {
    const v = view(
      {
        jobs: [
          {
            businessId: 'b1',
            businessName: 'Mama Titi’s Buka',
            role: 'waiter',
            label: 'Waiter',
            monthlyPay: 30000,
            hours: 40,
          },
        ],
      },
      {},
      10,
    );
    const s = suggestionsFor(v);
    expect(s).toHaveLength(3);
    expect(s[0]).toMatchObject({ kind: 'job', placeId: 'biz:b1', name: 'Mama Titi’s Buka' });
    expect(new Set(s.map((x) => x.placeId)).size).toBe(3);
  });

  it('sends a tired player to eat, and a founder to an angel at a café', () => {
    const v = view({ angelsAt: { b2: [{ id: 'ang1', name: 'Dolores' }] } }, { energy: 20 });
    const s = suggestionsFor(v);
    expect(s[0]!.kind).toBe('eat');
    expect(s.find((x) => x.kind === 'angel')).toMatchObject({ placeId: 'biz:b2', name: 'Dolores' });
  });

  it('points at an accelerator to apply to', () => {
    const v = view({ accelerators: [{ id: 'acc1', name: 'Yaba Demo Days' }] });
    expect(suggestionsFor(v).find((x) => x.kind === 'accelerator')?.placeId).toBe('cap:acc1');
  });

  it('always has something to do', () => {
    const v = view({ businesses: [] });
    expect(suggestionsFor(v).length).toBeGreaterThanOrEqual(2);
  });
});

describe('avatars', () => {
  it('follow the chosen gender, and stay stable without one', () => {
    for (let k = 0; k < 20; k++) {
      expect(['bun', 'long', 'braids', 'afro']).toContain(
        avatarLook('f-engineer', `p${k}`, 'female').hairStyle,
      );
      expect(['short', 'buzz', 'afro']).toContain(
        avatarLook('f-engineer', `p${k}`, 'male').hairStyle,
      );
      expect(avatarLook('f-banker', `p${k}`, 'female').accessory).not.toBe('tie');
    }
    expect(avatarLook('f-engineer', 'x')).toEqual(avatarLook('f-engineer', 'x'));
  });
});

describe('real streets and markets (Wave 5)', () => {
  it('names each city’s market, streets and landmarks', () => {
    for (const [m, plan] of Object.entries(PLANS)) {
      expect(plan.marketName, m).toBeTruthy();
      expect(plan.streetNames.length, m).toBeGreaterThanOrEqual(9);
      expect(new Set(plan.streetNames).size, m).toBe(plan.streetNames.length);
      expect(plan.landmarks.length, m).toBeGreaterThanOrEqual(2);
      expect(
        plan.landmarks.some((l) => l.kind === 'market-hall'),
        m,
      ).toBe(true);
    }
    expect(PLANS.lagos!.marketName).toBe('Balogun Market');
    expect(PLANS.lagos!.streetNames).toEqual(
      expect.arrayContaining([
        'Broad Street',
        'Ahmadu Bello Way',
        'Adeola Odeku',
        'Admiralty Way',
        'Herbert Macaulay Way',
      ]),
    );
    expect(PLANS.freetown!.streetNames).toEqual(
      expect.arrayContaining([
        'Siaka Stevens Street',
        'Lumley Beach Road',
        'Wilkinson Road',
        'Kissy Road',
      ]),
    );
  });

  it('fills out Freetown: hills, a beach and more districts', () => {
    const plan = PLANS.freetown!;
    expect(plan.districts.length).toBeGreaterThanOrEqual(9);
    expect(plan.hills!.length).toBeGreaterThanOrEqual(6);
    expect(plan.beach?.name).toBe('Lumley Beach');
    expect(plan.districts.map((d) => d.name)).toEqual(
      expect.arrayContaining(['Congo Cross', 'Hill Station']),
    );
    const l = buildLayout({
      marketId: 'freetown',
      lenders: [],
      playerBanks: [],
      funds: [],
      segments: [{ key: 's', name: 'S', industry: 'x' }],
      industry: null,
      office: null,
      homeTier: 1,
    });
    expect(l.marketName).toBe('Big Market');
    expect(l.beach?.name).toBe('Lumley Beach');
    expect(l.decor.filter((d) => d.kind === 'hill').length).toBeGreaterThanOrEqual(5);
    expect(l.decor.find((d) => d.landmark === 'market-hall')?.name).toBe('Big Market');
    // The sea starts further out where the beach is.
    const west = l.waters.find((w) => w.side === 'west')!;
    expect(west.x1).toBeLessThan(-3);
    const names = l.streets.map((s) => s.name);
    expect(names).toContain('Siaka Stevens Street');
  });
});
