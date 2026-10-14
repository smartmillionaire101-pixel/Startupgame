/**
 * Wave 8 §C view adapters: friends, money between players, visits, hangouts
 * and the city's tech events. Read defensively: an older server simply hides
 * what it doesn't send.
 */
import type { PlayerView } from '@runway/engine';
import { hereField } from '../city/life';
import { contactsOf } from '../city/people';
import { isObj, list, num, str } from './shared';

type View = PlayerView;
const field = (view: View, key: string): unknown =>
  (view as unknown as Record<string, unknown>)[key];

// ---------------------------------------------------------------- Friends (human players)

export interface Friend {
  id: string;
  name: string;
  /** In your contacts (else: someone in your city). */
  contact: boolean;
}

/** Players you can send money to, invite over or hang out with: contacts first, then your city. */
export function friendsOf(view: View): Friend[] {
  const out: Friend[] = [];
  const seen = new Set<string>([view.me.id]);
  const humans = new Set(view.players.filter((p) => !p.ai).map((p) => p.id));
  const ais = new Set(view.players.filter((p) => p.ai).map((p) => p.id));
  for (const c of contactsOf(view)) {
    const id = c.kind === 'player' ? c.refId : c.chatId && humans.has(c.chatId) ? c.chatId : null;
    if (!id || seen.has(id) || ais.has(id)) continue;
    seen.add(id);
    out.push({ id, name: c.name.split(',')[0]!.trim() || '—', contact: true });
  }
  for (const p of view.players)
    if (!p.ai && !seen.has(p.id)) {
      seen.add(p.id);
      out.push({ id: p.id, name: p.name, contact: false });
    }
  return out;
}

// ---------------------------------------------------------------- Sending money

export interface SendLimits {
  currency: string;
  used: number;
  limit: number;
  left: number;
  minFee: number;
  feeRate: number;
}

export function sendLimitsOf(view: View): SendLimits | null {
  const s = field(view, 'sendMoney');
  if (!isObj(s)) return null;
  return {
    currency: str(s.currency, view.accounts.local?.currency ?? view.market.currency),
    used: num(s.used),
    limit: num(s.limit),
    left: num(s.left),
    minFee: num(s.minFee),
    feeRate: num(s.feeRate, 0.01),
  };
}

export const feeFor = (amount: number, l: SendLimits | null) =>
  l ? Math.max(Math.round(amount * l.feeRate), l.minFee) : Math.round(amount * 0.01);

// ---------------------------------------------------------------- Visits

export interface VisitRow {
  id: string;
  hostId: string;
  hostName: string;
  guestId: string;
  guestName: string;
  city: string;
  status: 'pending' | 'accepted' | 'declined';
}

const visitRow = (v: Record<string, unknown>): VisitRow => ({
  id: str(v.id),
  hostId: str(v.hostId),
  hostName: str(v.hostName, '—'),
  guestId: str(v.guestId),
  guestName: str(v.guestName, '—'),
  city: str(v.city),
  status: (['pending', 'accepted', 'declined'].includes(str(v.status))
    ? v.status
    : 'pending') as VisitRow['status'],
});

export function visitsOf(view: View): { incoming: VisitRow[]; outgoing: VisitRow[] } {
  const v = field(view, 'visits');
  if (!isObj(v)) return { incoming: [], outgoing: [] };
  return {
    incoming: list(v.incoming)
      .map(visitRow)
      .filter((x) => x.id),
    outgoing: list(v.outgoing)
      .map(visitRow)
      .filter((x) => x.id),
  };
}

export interface Visiting {
  visitId: string;
  cars: string[];
  estate: 'villa' | 'mansion' | 'penthouse' | null;
  host: { id: string; name: string; backgroundId: string; gender: 'female' | 'male' | null };
  tier: number;
  /** Furniture tier per slot the host owns. */
  items: { slot: string; tier: number }[];
}

/** `view.visiting`: the friend's home you're in, or null. */
export function visitingOf(view: View): Visiting | null {
  const v = field(view, 'visiting');
  if (!isObj(v) || !isObj(v.host)) return null;
  const h = v.host;
  const home = isObj(v.home) ? v.home : {};
  return {
    visitId: str(v.visitId),
    cars: Array.isArray(v.cars) ? v.cars.filter((c): c is string => typeof c === 'string') : [],
    estate:
      isObj(v.residence) && ['villa', 'mansion', 'penthouse'].includes(str(v.residence.tier))
        ? (v.residence.tier as 'villa' | 'mansion' | 'penthouse')
        : null,
    host: {
      id: str(h.id),
      name: str(h.name, '—'),
      backgroundId: str(h.backgroundId, 'i-first'),
      gender: h.gender === 'female' || h.gender === 'male' ? h.gender : null,
    },
    tier: Math.max(1, Math.min(5, Math.round(num(v.lifestyleTier, 2)))),
    items: list(home.items)
      .filter((i) => typeof i.slot === 'string')
      .map((i) => ({ slot: i.slot as string, tier: Math.max(1, Math.min(3, num(i.tier, 1))) })),
  };
}

// ---------------------------------------------------------------- Hangouts

export interface HangoutRow {
  id: string;
  placeId: string;
  businessId: string;
  businessName: string;
  city: string;
  when: 'now' | 'tonight';
  host: { id: string; name: string };
  members: { id: string; name: string }[];
  invitees: { id: string; name: string; joined: boolean }[];
  joined: boolean;
  mine: boolean;
}

export function hangoutsOf(view: View): HangoutRow[] {
  return list(field(view, 'hangouts'))
    .filter((h) => typeof h.id === 'string')
    .map((h) => {
      const host = isObj(h.host) ? h.host : {};
      return {
        id: h.id as string,
        placeId: str(h.placeId, `biz:${str(h.businessId)}`),
        businessId: str(h.businessId),
        businessName: str(h.businessName, '—'),
        city: str(h.city),
        when: h.when === 'tonight' ? 'tonight' : 'now',
        host: { id: str(host.id), name: str(host.name, '—') },
        members: list(h.members).map((m) => ({ id: str(m.id), name: str(m.name, '—') })),
        invitees: list(h.invitees).map((m) => ({
          id: str(m.id),
          name: str(m.name, '—'),
          joined: !!m.joined,
        })),
        joined: !!h.joined,
        mine: !!h.mine,
      };
    });
}

// ---------------------------------------------------------------- Tech events

export interface TechSpeakerView {
  id: string;
  name: string;
  role: 'founder' | 'investor';
  org: string;
  talk: string;
}

export interface TechEventView {
  id: string;
  kind: string;
  label: string;
  title: string;
  day: number;
  status: 'on' | 'soon';
  venue: { kind: string; businessId: string | null; name: string; placeId: string };
  speakers: TechSpeakerView[];
  capacity: number;
  going: number;
  ticket: number;
  attended: boolean;
  pitchChance: boolean;
}

/** `here.techEvents` (the city you're in), or null from an older server. */
export function techEventsOf(view: View): TechEventView[] | null {
  const raw = hereField(view, 'techEvents');
  if (!Array.isArray(raw)) return null;
  return list(raw)
    .filter((e) => typeof e.id === 'string')
    .map((e) => {
      const v = isObj(e.venue) ? e.venue : {};
      return {
        id: e.id as string,
        kind: str(e.kind, 'meetup'),
        label: str(e.label, 'Meetup'),
        title: str(e.title, '—'),
        day: num(e.day, 1),
        status: e.status === 'soon' ? 'soon' : 'on',
        venue: {
          kind: str(v.kind, 'hub'),
          businessId: typeof v.businessId === 'string' ? v.businessId : null,
          name: str(v.name, 'The Hub'),
          placeId: str(v.placeId, 'hub'),
        },
        speakers: list(e.speakers).map((s) => ({
          id: str(s.id),
          name: str(s.name, '—'),
          role: s.role === 'investor' ? 'investor' : 'founder',
          org: str(s.org),
          talk: str(s.talk),
        })),
        capacity: num(e.capacity),
        going: num(e.going),
        ticket: num(e.ticket),
        attended: !!e.attended,
        pitchChance: !!e.pitchChance,
      };
    });
}

// ---------------------------------------------------------------- RSVPs (this browser)

const RSVP_KEY = 'runway.rsvp';

export function readRsvps(): string[] {
  try {
    const raw = localStorage.getItem(RSVP_KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writeRsvps(ids: string[]) {
  try {
    localStorage.setItem(RSVP_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    /* storage unavailable: RSVPs last for this session */
  }
}
