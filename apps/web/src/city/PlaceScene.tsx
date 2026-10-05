/**
 * Places you walk into (docs/WAVE5-FUN-LIFE-AND-CAPITAL.md §D): going into
 * any place opens a full-screen scene, not a card. An illustrated room for
 * the kind of place, the people in it (AI characters and players whose
 * presence `place` is this place) doing something, and a bottom tray of 2–4
 * things to do here plus "More" for everything else (the detailed cards).
 *
 * Commands from sections A and B (job.take, home.buy, car.buy,
 * accelerator.apply, grant.apply, lp.pitch, pitch.angel, event.broadcast)
 * are offered only when the view carries the data they need.
 */
import { createContext, useMemo, useState, type ReactNode } from 'react';
import './scenes.css';
import type { PlayerView } from '@runway/engine';
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Card, Empty, Pill } from '../ui';
import { PitchSheet } from '../screens/Money';
import { AvatarFigure, avatarLook } from './art';
import {
  activeCompany,
  angelsOf,
  businessesOf,
  hash,
  lendersOf,
  type AngelRef,
  type BusinessView,
} from './contract';
import type { Place } from './layout';
import {
  acceleratorsOf,
  angelsAtOf,
  attendeesAiOf,
  carOf,
  devPartnersOf,
  genderOf,
  homeOf,
  jobsOf,
  looseCmd,
  lpsOf,
  lunchVenueOf,
  lunchVenues,
  myJobOf,
  sellsCars,
  sellsFurniture,
  shopOf,
  type AngelHere,
} from './life';
import { eventsOf, npcName, type AiPerson, type PresenceView } from './people';
import type { PersonRef } from './PersonCard';
import { RoomBack, RoomFront } from './RoomArt';
import {
  ENTRANCE,
  ROOM_SLOTS,
  regularsFor,
  roomOf,
  seat,
  type Activity,
  type RoomKind,
} from './rooms';

/** Inside a scene, the old card header (a building and a person) is not drawn. */
export const InScene = createContext(false);

type View = PlayerView;

const PATRON_BG = [
  'b-commercial',
  'f-dropout',
  'f-engineer',
  'i-first',
  'b-wealthy',
  'f-corporate',
];
const STAFF_BG = ['b-commercial', 'i-operator', 'b-fintech', 'f-consultant'];

interface Occupant {
  id: string;
  name: string;
  role: string;
  bg: string;
  gender: 'female' | 'male' | null;
  staff: boolean;
  act?: Activity;
  /** Tap → person card; null for you. */
  person: PersonRef | null;
  you?: boolean;
  /** Show a name tag (not on anonymous regulars). */
  tag: boolean;
}

const aiPerson = (
  place: Place,
  kind: AiPerson['kind'],
  ref: string,
  name: string,
  bg: string,
  extra: Partial<AiPerson> = {},
): AiPerson => ({
  id: `ai:${kind}:${ref}`,
  kind,
  name,
  ref,
  bg,
  home: place.id,
  route: [place.door, place.door],
  period: 1000,
  phase: 0,
  dwell: 1,
  ...extra,
});

const pickBg = (xs: string[], seed: string) => xs[hash(seed) % xs.length]!;

/** The AI angels sitting in this business: `view.here.angelsAt`, else where the map walks them. */
export function angelsIn(
  view: View,
  businessId: string,
): (AngelHere & { fundId: string | null })[] {
  const all = angelsOf(view);
  const byId = new Map<string, AngelRef>(all.map((a) => [a.id, a]));
  const at = angelsAtOf(view);
  if (at)
    return (at[businessId] ?? []).map((a) => ({ ...a, fundId: byId.get(a.id)?.fundId ?? null }));
  const venues = lunchVenues(view);
  return all
    .filter((a) => lunchVenueOf(a.id, venues) === businessId)
    .map((a) => ({ id: a.id, name: a.name, fundId: a.fundId }));
}

/** Who's in the room: staff, AI characters who belong here, players here, regulars. */
function occupantsOf(
  view: View,
  place: Place,
  room: RoomKind,
  players: PresenceView[],
  business: BusinessView | undefined,
): Occupant[] {
  const out: Occupant[] = [];
  const m = view.market;
  const ai = (a: AiPerson, staff: boolean, role: string, act?: Activity): Occupant => ({
    id: a.id,
    name: a.name,
    role,
    bg: a.bg,
    gender: null,
    staff,
    act,
    person: { kind: 'ai', a },
    tag: true,
  });
  const staffMember = (seed: string, role: string, act?: Activity) =>
    ai(
      aiPerson(
        place,
        'staff',
        `${place.id}:${seed}`,
        npcName(m.id, `${place.id}:${seed}`),
        pickBg(STAFF_BG, seed),
      ),
      true,
      role,
      act,
    );

  switch (place.kind) {
    case 'business': {
      if (business) {
        out.push(
          ai(
            aiPerson(
              place,
              'owner',
              business.id,
              business.owner.name,
              pickBg(STAFF_BG, business.id),
            ),
            true,
            t('Owner'),
          ),
        );
        for (const a of angelsIn(view, business.id).slice(0, 2))
          out.push(
            ai(
              aiPerson(
                place,
                'angel',
                a.id,
                a.name,
                pickBg(['i-exited', 'i-operator', 'b-wealthy'], a.id),
                {
                  fund: a.fundId ?? undefined,
                },
              ),
              false,
              t('Angel investor'),
              room === 'restaurant' ? 'eating' : 'chatting',
            ),
          );
      }
      break;
    }
    case 'fund': {
      const f = m.funds.find((x) => x.id === place.ref);
      if (f) {
        out.push(
          ai(
            aiPerson(
              place,
              'partner',
              f.id,
              f.partner,
              pickBg(['i-banker', 'i-operator', 'i-exited'], f.id),
            ),
            true,
            t('Partner'),
          ),
        );
        const angel = angelsOf(view).find((a) => a.fundId === f.id);
        if (angel)
          out.push(
            ai(
              aiPerson(place, 'angel', angel.id, angel.name, 'i-exited', { fund: f.id }),
              false,
              t('Angel investor'),
            ),
          );
      }
      break;
    }
    case 'lender':
      out.push(staffMember('officer', t('Loan officer')));
      out.push(staffMember('teller', t('Teller')));
      break;
    case 'playerbank': {
      const b = m.banks.find((x) => x.id === place.ref);
      if (b) out.push(staffMember('owner', t('Owner')));
      break;
    }
    case 'hub': {
      out.push(staffMember('manager', t('Community manager')));
      const founders = view.directory
        .filter((c) => c.ai && c.status === 'active' && c.market === m.id)
        .sort((a, b) => hash(`${a.id}:${m.month}`) - hash(`${b.id}:${m.month}`))
        .slice(0, 3);
      for (const c of founders) {
        const f = c.founders.find((x) => x.ai) ?? c.founders[0];
        if (f)
          out.push(
            ai(
              aiPerson(
                place,
                'founder',
                f.id,
                f.name,
                pickBg(['f-engineer', 'f-dropout', 'f-second-time'], f.id),
                { company: c.id },
              ),
              false,
              t('Founder'),
              'typing',
            ),
          );
      }
      for (const c of m.talent.slice(0, 2))
        out.push(
          ai(
            aiPerson(place, 'candidate', c.id, c.name, pickBg(['f-dropout', 'f-engineer'], c.id)),
            false,
            t('Looking for work'),
            'chatting',
          ),
        );
      break;
    }
    case 'stall': {
      out.push(staffMember('stall-a', t('Stallholder')));
      out.push(staffMember('stall-b', t('Stallholder')));
      const segs = [...m.segments].sort((a, b) =>
        a.key === place.ref ? -1 : b.key === place.ref ? 1 : 0,
      );
      for (const s of segs.slice(0, 3))
        out.push(
          ai(
            aiPerson(
              place,
              'shopper',
              s.key,
              npcName(m.id, `shopper:${s.key}`),
              pickBg(PATRON_BG, s.key),
            ),
            false,
            t('Customer'),
          ),
        );
      break;
    }
    case 'office': {
      const c = activeCompany(view);
      const team = Math.min(4, Math.max(0, (c?.teamSize ?? 1) - 1));
      for (let k = 0; k < team; k++) {
        const o = staffMember(`team${k}`, t('Your team'), 'typing');
        out.push({ ...o, staff: false });
      }
      break;
    }
    case 'airport':
      out.push(staffMember('checkin', t('Check-in')));
      break;
    case 'eventhall': {
      out.push(staffMember('host', t('Events manager'), 'presenting'));
      const raw = (m as unknown as { events?: unknown[] }).events ?? [];
      const names = raw.flatMap((e) => attendeesAiOf(e)).slice(0, 5);
      names.forEach((a, k) =>
        out.push(
          ai(
            aiPerson(place, 'patron', `${place.id}:att${k}`, a.name, pickBg(PATRON_BG, a.name)),
            false,
            tx(a.kind),
          ),
        ),
      );
      break;
    }
    default:
      if ((place.kind as string) === 'capital') out.push(staffMember('lead', t('Programme lead')));
  }

  // Players whose presence is this place.
  for (const p of players.filter((x) => x.place === place.id).slice(0, 4))
    out.push({
      id: p.id,
      name: p.name,
      role: t('Player'),
      bg: p.backgroundId,
      gender: p.gender ?? null,
      staff: false,
      person: { kind: 'player', p },
      tag: true,
    });

  // Regulars, so no room is ever empty.
  const guests = out.filter((o) => !o.staff).length;
  const n = regularsFor(room, place.id, m.month, guests);
  const used = new Set(out.map((o) => o.name));
  for (let k = 0; k < n; k++) {
    let name = npcName(m.id, `${place.id}:reg${k}:${m.month}`);
    for (let j = 1; used.has(name) && j < 8; j++) name = npcName(m.id, `${place.id}:reg${k}:${j}`);
    used.add(name);
    out.push(
      ai(
        aiPerson(place, 'patron', `${place.id}:${k}`, name, pickBg(PATRON_BG, `${place.id}:${k}`)),
        false,
        t('Regular'),
      ),
    );
    out[out.length - 1]!.tag = false;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The tray

export interface TrayAction {
  id: string;
  label: string;
  sub?: string;
  icon: string;
  disabled?: boolean;
  /** Ask for a second tap before doing it (big purchases). */
  confirm?: boolean;
  run: () => void | Promise<unknown>;
}

type Loose = { message?: string; text?: string; reason?: string; answer?: string } | null;
const said = (r: Loose, fallback: string) =>
  r?.message ? tx(r.message) : r?.text ? tx(r.text) : fallback;

function TrayButton({ a }: { a: TrayAction }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      className={`tray-card${armed ? ' is-armed' : ''}`}
      data-action={a.id}
      disabled={a.disabled}
      onClick={() => {
        if (a.confirm && !armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        void a.run();
      }}
    >
      <span className="tray-icon" aria-hidden="true">
        {a.icon}
      </span>
      <span className="tray-text">
        <span className="tray-label">{armed ? t('Tap again to confirm') : a.label}</span>
        {a.sub && <span className="tray-sub">{a.sub}</span>}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// The scene

export interface SceneProps {
  place: Place;
  title: string;
  onClose: () => void;
  /** Tap someone in the room. */
  onPerson: (p: PersonRef) => void;
  /** Walk somewhere else (a furniture store, the Hub). */
  onVisit?: (placeId: string) => void;
  /** Leave for a screen (company, money, news). */
  nav: (tab: 'company' | 'money' | 'news' | 'me' | 'home') => void;
  players: PresenceView[];
  abroad: boolean;
  /** The airport: fly home. */
  onFlyHome?: () => void;
  /** The detailed cards, under "More". */
  children: ReactNode;
}

export function PlaceScene({
  place,
  title,
  onClose,
  onPerson,
  onVisit,
  nav,
  players,
  abroad,
  onFlyHome,
  children,
}: SceneProps) {
  const { view, send, cur, busy } = useView();
  const [more, setMore] = useState(false);
  const [pitch, setPitch] = useState<{
    fundId: string;
    name: string;
    check: [number, number];
  } | null>(null);
  const company = activeCompany(view);
  const business =
    place.kind === 'business' ? businessesOf(view).find((b) => b.id === place.ref) : undefined;
  const capitalKind =
    (place.kind as string) === 'capital'
      ? acceleratorsOf(view).some((a) => a.id === place.ref)
        ? 'accelerator'
        : devPartnersOf(view).some((d) => d.id === place.ref)
          ? 'devpartner'
          : 'lp'
      : undefined;
  const room = roomOf(place, {
    abroad,
    businessKind: business?.kind,
    businessShape: business?.look.shape,
    capital: capitalKind,
  });
  const home = place.kind === 'home' && !abroad ? homeOf(view) : null;
  const pocket = view.accounts.local?.balance ?? 0;

  const occupants = useMemo(
    () => occupantsOf(view, place, room, players, business),
    [view, place, room, players, business],
  );
  const seats = useMemo(
    () =>
      seat(
        room,
        occupants.map((o) => ({ staff: o.staff })),
      ),
    [room, occupants],
  );
  const slots = ROOM_SLOTS[room];
  const placed = occupants
    .map((o, n) => ({ o, slot: seats[n]! >= 0 ? slots[seats[n]!]! : null }))
    .filter((x): x is { o: Occupant; slot: (typeof slots)[number] } => x.slot !== null);
  const meLook = avatarLook(view.me.background?.id, view.me.id, genderOf(view.me));

  // ---- What you can do here.
  const actions: TrayAction[] = [];
  const toMore: TrayAction = {
    id: 'more-details',
    label: t('See everything here'),
    icon: '☰',
    run: () => setMore(true),
  };
  const go = (tab: Parameters<SceneProps['nav']>[0], label: string, icon: string): TrayAction => ({
    id: `nav:${tab}`,
    label,
    icon,
    run: () => nav(tab),
  });

  if (business) {
    const b = business;
    // Eat, drink, buy: one tap.
    const items = [...(b.venue?.items ?? [])].sort(
      (x, y) => Number(!!y.energy) - Number(!!x.energy) || x.price - y.price,
    );
    for (const it of items.slice(0, 2))
      actions.push({
        id: `buy:${it.id}`,
        label: t('Buy {item}', { item: tx(it.label) }),
        sub: it.energy
          ? t('{price} · +{n} energy', { price: money(it.price, cur), n: it.energy })
          : money(it.price, cur),
        icon:
          room === 'cafe'
            ? '☕'
            : room === 'bar' || room === 'club'
              ? '🍹'
              : room === 'restaurant'
                ? '🍽'
                : '🛍',
        disabled: pocket < it.price || busy,
        run: () =>
          send(looseCmd({ type: 'venue.buy', businessId: b.id, itemId: it.id }), (r: Loose) =>
            said(r, t('Enjoy: {item}.', { item: tx(it.label) })),
          ),
      });
    // A car or furniture (section A's shop).
    const shop = shopOf(view);
    if (sellsCars(b.kind) && shop.cars.length) {
      const mine = carOf(view);
      for (const c of shop.cars.filter((x) => x.id !== mine?.modelId).slice(0, 2))
        actions.push({
          id: `car:${c.id}`,
          label: t('Buy the {car}', { car: tx(c.label) }),
          sub: t('{price} · {cost}/mo to run', {
            price: money(c.price, cur),
            cost: money(c.monthlyCost, cur),
          }),
          icon: '🚗',
          confirm: true,
          disabled: pocket < c.price || busy,
          run: () =>
            send(looseCmd({ type: 'car.buy', modelId: c.id }), (r: Loose) =>
              said(r, t('The {car} is yours.', { car: tx(c.label) })),
            ),
        });
    }
    if (sellsFurniture(b.kind) && shop.furniture.length) {
      const owned = new Set((homeOf(view)?.items ?? []).map((i) => i.itemId));
      const pickFurniture = shop.furniture
        .filter((f) => !owned.has(f.id) && f.price <= Math.max(pocket, 1))
        .sort((x, y) => y.price - x.price)
        .slice(0, 2);
      for (const f of pickFurniture.length ? pickFurniture : shop.furniture.slice(0, 2))
        actions.push({
          id: `home:${f.id}`,
          label: t('Buy {item}', { item: tx(f.label) }),
          sub: money(f.price, cur),
          icon: '🛋',
          confirm: true,
          disabled: pocket < f.price || busy,
          run: () =>
            send(looseCmd({ type: 'home.buy', itemId: f.id }), (r: Loose) =>
              said(r, t('{item} is on its way to your flat.', { item: tx(f.label) })),
            ),
        });
    }
    // A job here (section A), else a shift.
    const job = jobsOf(view).find((j) => j.businessId === b.id);
    const myJob = myJobOf(view);
    if (job && myJob?.businessId !== b.id)
      actions.push({
        id: `job:${job.role}`,
        label: t('Work here: {role}', { role: tx(job.label) }),
        sub: t('{pay}/mo · {h}h a month', { pay: money(job.monthlyPay, cur), h: job.hours }),
        icon: '💼',
        confirm: !!myJob,
        disabled: busy,
        run: () =>
          send(looseCmd({ type: 'job.take', businessId: b.id, role: job.role }), (r: Loose) =>
            said(r, t('You start at {place} this month.', { place: b.name })),
          ),
      });
    else if (b.gigs[0]) {
      const g = b.gigs[0];
      actions.push({
        id: `gig:${g.id}`,
        label: t('Take a shift: {gig}', { gig: tx(g.label) }),
        sub: t('{h}h · {pay}', { h: g.hours, pay: money(g.pay, cur) }),
        icon: '🧾',
        disabled: view.me.hours.left < g.hours || busy,
        run: () =>
          send(looseCmd({ type: 'gig.take', businessId: b.id, gigId: g.id }), (r: Loose) =>
            said(r, t('Shift done at {name}.', { name: b.name })),
          ),
      });
    }
    // An angel at the next table (section B).
    const angel = company ? angelsIn(view, b.id)[0] : undefined;
    if (angel && company)
      actions.push({
        id: `angel:${angel.id}`,
        label: t('Pitch {name}', { name: angel.name }),
        sub: t('An angel, here now: a warm pitch'),
        icon: '🤝',
        disabled: busy,
        run: () =>
          send(
            looseCmd({ type: 'pitch.angel', angelId: angel.id, companyId: company.id }),
            (r: Loose) => said(r, t('You pitched {name} over the table.', { name: angel.name })),
          ),
      });
    // Sell to them.
    if (
      company &&
      b.you.canPitch &&
      !b.you.customer &&
      b.buys.some((x) => x.sector === company.industry)
    )
      actions.push({
        id: 'sell',
        label: t('Pitch {company}', { company: company.name }),
        sub: t('Sell to {owner}', { owner: b.owner.name }),
        icon: '📣',
        disabled: busy,
        run: () =>
          send(
            looseCmd({ type: 'business.pitch', companyId: company.id, businessId: b.id }),
            (r: Loose) =>
              r?.answer === 'yes'
                ? t('Yes! {owner} is giving {company} a try.', {
                    owner: b.owner.name,
                    company: company.name,
                  })
                : r?.reason
                  ? t('Not now: {reason}', { reason: tx(r.reason) })
                  : said(r, t('Not now.')),
          ),
      });
  } else if (place.kind === 'lender' || place.kind === 'playerbank') {
    const lender = lendersOf(view).find((l) => l.id === place.ref);
    const products = lender?.products.filter((p) => p.you?.eligible) ?? [];
    actions.push({
      id: 'loans',
      label: products.length
        ? t('See {n} loans you can get', { n: products.length })
        : t('Ask about a loan'),
      icon: '🏦',
      run: () => setMore(true),
    });
    actions.push(go('money', t('Your money and credit'), '💳'));
  } else if (place.kind === 'fund') {
    const f = view.market.funds.find((x) => x.id === place.ref);
    if (f && company)
      actions.push({
        id: 'pitch-fund',
        label: t('Pitch {name}', { name: f.name }),
        sub: t('Cheques of {min}–{max}', {
          min: money(f.check[0], f.currency),
          max: money(f.check[1], f.currency),
        }),
        icon: '📊',
        disabled: view.pitches.some(
          (p) =>
            (p.status === 'questions' || p.status === 'partner-meeting') &&
            p.companyId === company.id,
        ),
        run: () => setPitch({ fundId: f.id, name: f.name, check: f.check }),
      });
    actions.push({ ...toMore, label: t('Their thesis') });
  } else if (capitalKind === 'accelerator') {
    const a = acceleratorsOf(view).find((x) => x.id === place.ref);
    if (a && company)
      actions.push({
        id: 'apply',
        label: a.status
          ? t('Applied: {status}', { status: tx(a.status) })
          : t('Apply with {company}', { company: company.name }),
        sub: t('Answer at the next settlement'),
        icon: '🚀',
        disabled: !!a.status || busy,
        run: () =>
          send(
            looseCmd({ type: 'accelerator.apply', acceleratorId: a.id, companyId: company.id }),
            (r: Loose) => said(r, t('Application sent to {name}.', { name: a.name })),
          ),
      });
    actions.push(toMore);
  } else if (capitalKind === 'devpartner') {
    const d = devPartnersOf(view).find((x) => x.id === place.ref);
    for (const g of (d?.programs ?? []).slice(0, 3))
      actions.push({
        id: `grant:${g.id}`,
        label: g.status
          ? t('{programme}: {status}', { programme: tx(g.label), status: tx(g.status) })
          : t('Apply: {programme}', { programme: tx(g.label) }),
        sub: g.eligible
          ? g.amount
            ? t('Up to {amount}, no equity', { amount: money(g.amount, cur) })
            : t('No equity')
          : g.reason
            ? tx(g.reason)
            : t('Not eligible yet.'),
        icon: '🌍',
        disabled: !company || !g.eligible || !!g.status || busy,
        run: () =>
          company
            ? send(
                looseCmd({
                  type: 'grant.apply',
                  partnerId: d!.id,
                  programId: g.id,
                  companyId: company.id,
                }),
                (r: Loose) => said(r, t('Application sent to {name}.', { name: d!.name })),
              )
            : undefined,
      });
    actions.push(toMore);
  } else if (capitalKind === 'lp') {
    const lp = lpsOf(view).find((x) => x.id === place.ref);
    if (lp && view.fund)
      actions.push({
        id: 'lp-pitch',
        label: t('Pitch {fund} to {lp}', { fund: view.fund.name, lp: lp.name }),
        sub: t('Their commitment arrives at settlement'),
        icon: '🏛',
        disabled: busy,
        run: () =>
          send(looseCmd({ type: 'lp.pitch', lpId: lp.id }), (r: Loose) =>
            said(r, t('You pitched {name}.', { name: lp.name })),
          ),
      });
    actions.push(toMore);
  } else if (place.kind === 'hub') {
    const job = jobsOf(view)[0];
    if (job && !myJobOf(view))
      actions.push({
        id: 'hub-job',
        label: t('Get a job at {place}', { place: job.businessName }),
        sub: t('{role} · {pay}/mo', { role: tx(job.label), pay: money(job.monthlyPay, cur) }),
        icon: '💼',
        run: () => onVisit?.(`biz:${job.businessId}`),
      });
    actions.push({ ...toMore, id: 'jobs-board', label: t('Jobs board and people'), icon: '📌' });
    const acc = acceleratorsOf(view)[0];
    if (acc)
      actions.push({
        id: 'hub-acc',
        label: t('Visit {name}', { name: acc.name }),
        icon: '🚀',
        run: () => onVisit?.(`cap:${acc.id}`),
      });
  } else if (place.kind === 'stall') {
    actions.push({ ...toMore, id: 'interview', label: t('Interview customers'), icon: '🗣' });
    actions.push({ ...toMore, id: 'who-buys', label: t('Who buys what'), icon: '🧺' });
  } else if (place.kind === 'office') {
    if (abroad) {
      actions.push(go('company', t('Open the company screen'), '🏢'));
      if (onFlyHome)
        actions.push({ id: 'fly-home', label: t('Fly home'), icon: '✈', run: onFlyHome });
    } else {
      actions.push(go('company', t('Open the company screen'), '🏢'));
      actions.push(go('money', t('Open the money screen'), '💰'));
      actions.push({ ...toMore, label: t('This month at the office') });
    }
  } else if (place.kind === 'home') {
    if (abroad) {
      if (onFlyHome)
        actions.push({ id: 'fly-home', label: t('Fly home'), icon: '✈', run: onFlyHome });
    } else {
      const store = businessesOf(view).find((b) => b.open && sellsFurniture(b.kind));
      if (store)
        actions.push({
          id: 'furnish',
          label: t('Furnish your flat'),
          sub: store.name,
          icon: '🛋',
          run: () => onVisit?.(`biz:${store.id}`),
        });
      actions.push({ ...toMore, label: t('Your money and lifestyle'), icon: '💳' });
      actions.push(go('me', t('Your profile and contacts'), '🪪'));
    }
  } else if (place.kind === 'eventhall') {
    const events = eventsOf(view) ?? [];
    const mine = events.find((e) => e.youHost && e.status === 'upcoming');
    if (mine) {
      const spend = Math.round(view.market.costOfLiving * 2);
      actions.push({
        id: 'broadcast',
        label: t('Advertise your event'),
        sub: t('{amount}: more people come', { amount: money(spend, cur) }),
        icon: '📢',
        disabled: pocket < spend || busy,
        run: () =>
          send(looseCmd({ type: 'event.broadcast', eventId: mine.id, spend }), (r: Loose) =>
            said(r, t('Word is out about “{title}”.', { title: mine.title })),
          ),
      });
    }
    const next = events.find((e) => e.status === 'upcoming' && !e.youHost && !e.youGoing);
    if (next)
      actions.push({
        id: 'rsvp',
        label: t('Go to “{title}”', { title: next.title }),
        sub: next.dateLabel,
        icon: '🎟',
        disabled: busy,
        run: () =>
          send(
            looseCmd({ type: 'event.rsvp', eventId: next.id, going: true }),
            t('See you there.'),
          ),
      });
    actions.push({ ...toMore, label: t('Host or join an event'), icon: '🎤' });
  } else if (place.kind === 'airport') {
    if (abroad && onFlyHome)
      actions.push({ id: 'fly-home', label: t('Fly home'), icon: '✈', run: onFlyHome });
    actions.push({ ...toMore, id: 'departures', label: t('Departures'), icon: '🛫' });
  } else if (place.kind === 'newsstand') {
    actions.push({ ...toMore, label: t('Read the papers'), icon: '📰' });
    actions.push(go('news', t('Open the news screen'), '🗞'));
  }
  const primary = actions.slice(0, 4);

  const sign =
    business?.name ??
    (place.kind === 'office' && !abroad ? company?.name : undefined) ??
    (place.kind === 'hub' ? t('The Hub') : place.name || undefined);

  return (
    <div
      className={`place-scene${more ? ' is-more' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-room={room}
      data-scene={place.id}
    >
      <header className="place-head">
        <div className="place-title">
          <h2>{title}</h2>
          {business && <span className="small muted">{tx(business.kindLabel)}</span>}
        </div>
        <button type="button" className="icon-btn" aria-label={t('Close')} onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="place-room">
        <svg
          viewBox="0 -80 360 320"
          preserveAspectRatio="xMidYMax slice"
          role="group"
          aria-label={t('People here')}
        >
          <RoomBack
            kind={room}
            tint={business?.look.color ?? place.color}
            sign={sign?.toUpperCase().slice(0, 22)}
            home={home?.items ?? null}
          />
          {placed
            .filter((x) => x.slot.sit)
            .map((x) => (
              <Person key={x.o.id} o={x.o} slot={x.slot} onTap={onPerson} />
            ))}
          <RoomFront
            kind={room}
            tint={business?.look.color ?? place.color}
            home={home?.items ?? null}
          />
          {placed
            .filter((x) => !x.slot.sit)
            .sort((a, b) => a.slot.y - b.slot.y)
            .map((x) => (
              <Person key={x.o.id} o={x.o} slot={x.slot} onTap={onPerson} />
            ))}
          <g
            className="scene-you"
            transform={`translate(${ENTRANCE.x} ${ENTRANCE.y}) scale(-1.9 1.9)`}
          >
            <AvatarFigure look={meLook} />
          </g>
        </svg>
      </div>
      {more ? (
        <div className="place-more">
          <button type="button" className="place-back" onClick={() => setMore(false)}>
            ‹ {t('Back to the room')}
          </button>
          <div className="interior">{children}</div>
        </div>
      ) : (
        <div className="place-tray">
          {business?.venue && (
            <p className="small muted tray-pocket" data-pocket={pocket}>
              {t('In your pocket: {amount}', { amount: money(pocket, cur) })}
            </p>
          )}
          <div className="tray-actions" role="group" aria-label={t('What you can do here')}>
            {primary.length ? (
              primary.map((a) => <TrayButton key={a.id} a={a} />)
            ) : (
              <p className="small muted">{t('Have a look around.')}</p>
            )}
          </div>
          <button type="button" className="btn btn-ghost tray-more" onClick={() => setMore(true)}>
            {t('More')}
          </button>
        </div>
      )}
      {pitch && company && <PitchSheet c={company} target={pitch} onClose={() => setPitch(null)} />}
    </div>
  );
}

/** One person in the room, doing their thing; tap for their card. */
function Person({
  o,
  slot,
  onTap,
}: {
  o: Occupant;
  slot: { x: number; y: number; act: Activity; flip?: boolean };
  onTap: (p: PersonRef) => void;
}) {
  const look = useMemo(() => avatarLook(o.bg, o.id, o.gender), [o.bg, o.id, o.gender]);
  const s = 1.3 + ((slot.y - 140) / 100) * 0.65;
  const act = o.act ?? slot.act;
  const tap = () => o.person && onTap(o.person);
  return (
    <g
      className={`scene-person${o.staff ? ' is-staff' : ''}`}
      data-act={act}
      data-occupant={o.id}
      transform={`translate(${slot.x} ${slot.y})`}
      role="button"
      tabIndex={0}
      aria-label={t('{name}, {role}', { name: o.name, role: o.role })}
      onClick={tap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          tap();
        }
      }}
    >
      <g transform={`scale(${slot.flip ? -s : s} ${s})`}>
        <rect x="-10" y="-44" width="20" height="46" fill="transparent" />
        <g className="scene-fig">
          <AvatarFigure look={look} />
        </g>
      </g>
      {o.tag && (
        <g className="scene-tag" transform={`translate(0 ${-48 * s - 4})`}>
          <rect
            x={-o.name.length * 2.6 - 5}
            y="-7"
            width={o.name.length * 5.2 + 10}
            height="11"
            rx="5.5"
          />
          <text y="1.5" textAnchor="middle">
            {o.name}
          </text>
        </g>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Details (under "More") for the Wave 5 capital offices.

export function CapitalDetails({ place }: { place: Place }) {
  const { view, cur } = useView();
  const acc = acceleratorsOf(view).find((x) => x.id === place.ref);
  const dev = devPartnersOf(view).find((x) => x.id === place.ref);
  const lp = lpsOf(view).find((x) => x.id === place.ref);
  if (acc)
    return (
      <Card title={acc.name}>
        {acc.blurb && <p>{tx(acc.blurb)}</p>}
        <div className="row">
          {acc.cash > 0 && (
            <Pill tone="good">
              {t('{amount} for {pct}%', { amount: money(acc.cash, cur), pct: acc.equityPct })}
            </Pill>
          )}
          {acc.status && <Pill tone="info">{tx(acc.status)}</Pill>}
        </div>
        <p className="small muted">
          {t(
            'A new cohort every three months: cash for a little equity, a mentor and a demo day that gets funds interested.',
          )}
        </p>
      </Card>
    );
  if (dev)
    return (
      <Card title={dev.name}>
        {dev.blurb && <p>{tx(dev.blurb)}</p>}
        {dev.programs.length ? (
          <ul className="list">
            {dev.programs.map((g) => (
              <li key={g.id}>
                <div className="item-title">{tx(g.label)}</div>
                <div className="small muted">
                  {g.amount
                    ? t('Up to {amount}, no equity', { amount: money(g.amount, cur) })
                    : t('No equity')}
                  {g.reason ? ` · ${tx(g.reason)}` : ''}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{t('No grant windows open right now.')}</Empty>
        )}
      </Card>
    );
  if (lp)
    return (
      <Card title={lp.name}>
        <Pill>{tx(lp.kindLabel)}</Pill>
        <p className="small muted">
          {t(
            'Limited partners back funds. Pitch them with your track record and stars; commitments arrive at settlement.',
          )}
        </p>
      </Card>
    );
  return <Empty>{t('Nobody’s in right now.')}</Empty>;
}
