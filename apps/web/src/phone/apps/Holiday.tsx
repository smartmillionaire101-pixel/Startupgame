/**
 * Holiday with friends (player feedback: "People can invite their friends on
 * holidays to these places on travel trips").
 *
 * - From a booked trip abroad (or while you're there), Invite friends: pick
 *   friends, and whether you pay their flight and hotel (`holiday.invite`).
 * - An invitation names the city, the month and the hotel, and what it costs
 *   you: Accept (books the same city and hotel tier from your own city),
 *   Pay my own way, or Decline (`holiday.accept` / `holiday.decline`).
 * - The host's trip card lists who's coming.
 * - Together in the city: "Holiday in London with Ada", your rooms side by
 *   side, things to do together (`holiday.together`) and what you did, with
 *   the shared bonus.
 *
 * Used by the Travel app, Today, the City map (HolidayBanner) and the hotel
 * room (HotelNeighbours). Read loosely: an older server sends no `holidays`.
 */
import { useState } from 'react';
import type { Appearance, PlayerView } from '@runway/engine';
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import { visitPlace } from '../../city/goto';
import { friendsOf } from '../friends';
import { contactsOf } from '../../city/people';
import { isObj, list, num, str } from '../shared';
import './holiday.css';

// ---------------------------------------------------------------- Reading the view

export interface HolidayView {
  id: string;
  market: string;
  city: string;
  month: number;
  hotel: { tier: string; name: string } | null;
  host: { id: string; name: string };
  mine: boolean;
  myStatus: 'host' | 'pending' | 'accepted' | 'declined';
  invite: {
    hostPays: boolean;
    cost: number;
    currency: string;
    affordable: boolean;
    blocked: string | null;
  } | null;
  guests: {
    id: string;
    name: string;
    status: 'pending' | 'accepted' | 'declined';
    hostPays: boolean;
    here: boolean;
    estimate: number | null;
    /** An AI friend's answer and their chat reply. */
    ai: { answer: 'yes' | 'pay' | 'busy'; text: string } | null;
  }[];
  /** Everyone else coming: how they look, their room, their seat when you share a flight. */
  companions: Companion[];
  /** Fly together: your seat on the host's flight and who's beside you. */
  flight: {
    from: string;
    seat: string;
    airline?: string;
    number?: string;
    time?: string;
    gate?: string;
    with: { id: string; name: string; seat: string }[];
  } | null;
  together: boolean;
  companionsHere: { id: string; name: string }[];
  rooms: Record<string, number>;
  things: {
    businessId: string;
    placeId: string;
    name: string;
    kind: string;
    planned: { by: string; members: { id: string; name: string }[]; joined: boolean } | null;
  }[];
  done: {
    hangoutId: string;
    businessId: string;
    name: string;
    members: { id: string; name: string }[];
  }[];
  bonus: { happiness: number; stress: number; trust: number };
  /** Friends knocking on your hotel door (`hotel.answer`). */
  knocks: { from: string; name: string; room: number | null; at: number }[];
  /** Your last knock on a friend's door: waiting, or turned down. */
  myKnock: {
    to: string;
    name: string;
    room: number | null;
    at: number;
    status: 'pending' | 'declined';
  } | null;
  /** A friend over in someone's room: the guest is in the host's room. */
  visit: {
    host: { id: string; name: string; room: number | null };
    guest: { id: string; name: string; room: number | null };
    since: number;
    me: 'host' | 'guest' | null;
  } | null;
}

export interface Companion {
  id: string;
  name: string;
  ai: boolean;
  gender: 'female' | 'male';
  backgroundId: string | null;
  appearance: Appearance | null;
  from: string;
  room: number | null;
  seat: string | null;
  sameFlight: boolean;
  here: boolean;
}

const STATUSES = ['pending', 'accepted', 'declined'] as const;
const ANSWERS = ['yes', 'pay', 'busy'] as const;
const opt = (x: unknown) => (typeof x === 'string' && x ? x : undefined);
const people = (x: unknown) => list(x).map((m) => ({ id: str(m.id), name: str(m.name, '—') }));

export function holidaysOf(view: PlayerView): HolidayView[] {
  const raw = (view as unknown as Record<string, unknown>).holidays;
  return list(raw)
    .filter((h) => typeof h.id === 'string')
    .map((h) => {
      const host = isObj(h.host) ? h.host : {};
      const inv = isObj(h.invite) ? h.invite : null;
      const hotel = isObj(h.hotel) ? h.hotel : null;
      const bonus = isObj(h.bonus) ? h.bonus : {};
      const rooms: Record<string, number> = {};
      if (isObj(h.rooms))
        for (const [k, v] of Object.entries(h.rooms)) if (typeof v === 'number') rooms[k] = v;
      return {
        id: h.id as string,
        market: str(h.market),
        city: str(h.city),
        month: num(h.month),
        hotel: hotel ? { tier: str(hotel.tier), name: str(hotel.name) } : null,
        host: { id: str(host.id), name: str(host.name, '—') },
        mine: !!h.mine,
        myStatus: (['host', ...STATUSES] as const).includes(h.myStatus as 'host')
          ? (h.myStatus as HolidayView['myStatus'])
          : 'pending',
        invite: inv
          ? {
              hostPays: !!inv.hostPays,
              cost: num(inv.cost),
              currency: str(inv.currency, view.market.currency),
              affordable: inv.affordable !== false,
              blocked: typeof inv.blocked === 'string' ? inv.blocked : null,
            }
          : null,
        guests: list(h.guests).map((g) => ({
          id: str(g.id),
          name: str(g.name, '—'),
          status: (STATUSES as readonly string[]).includes(str(g.status))
            ? (g.status as 'pending')
            : 'pending',
          hostPays: !!g.hostPays,
          here: !!g.here,
          estimate: typeof g.estimate === 'number' ? g.estimate : null,
          ai:
            isObj(g.ai) && (ANSWERS as readonly string[]).includes(str(g.ai.answer))
              ? { answer: g.ai.answer as 'yes', text: str(g.ai.text) }
              : null,
        })),
        companions: list(h.companions).map((c) => ({
          id: str(c.id),
          name: str(c.name, '—'),
          ai: !!c.ai,
          gender: c.gender === 'male' ? ('male' as const) : ('female' as const),
          backgroundId: opt(c.backgroundId) ?? null,
          appearance: isObj(c.appearance) ? (c.appearance as unknown as Appearance) : null,
          from: str(c.from),
          room: typeof c.room === 'number' ? c.room : null,
          seat: opt(c.seat) ?? null,
          sameFlight: !!c.sameFlight,
          here: !!c.here,
        })),
        flight: isObj(h.flight)
          ? {
              from: str(h.flight.from),
              seat: str(h.flight.seat),
              airline: opt(h.flight.airline),
              number: opt(h.flight.number),
              time: opt(h.flight.time),
              gate: opt(h.flight.gate),
              with: list(h.flight.with).map((w) => ({
                id: str(w.id),
                name: str(w.name, '—'),
                seat: str(w.seat),
              })),
            }
          : null,
        together: !!h.together,
        companionsHere: people(h.companionsHere),
        rooms,
        things: list(h.things).map((x) => {
          const p = isObj(x.planned) ? x.planned : null;
          return {
            businessId: str(x.businessId),
            placeId: str(x.placeId, `biz:${str(x.businessId)}`),
            name: str(x.name, '—'),
            kind: str(x.kind),
            planned: p
              ? { by: str(p.by, '—'), members: people(p.members), joined: !!p.joined }
              : null,
          };
        }),
        done: list(h.done).map((d) => ({
          hangoutId: str(d.hangoutId),
          businessId: str(d.businessId),
          name: str(d.name, '—'),
          members: people(d.members),
        })),
        bonus: {
          happiness: num(bonus.happiness, 5),
          stress: num(bonus.stress, -8),
          trust: num(bonus.trust, 0.05),
        },
        knocks: list(h.knocks).map((k) => ({
          from: str(k.from),
          name: str(k.name, '—'),
          room: typeof k.room === 'number' ? k.room : null,
          at: num(k.at),
        })),
        myKnock: isObj(h.myKnock)
          ? {
              to: str(h.myKnock.to),
              name: str(h.myKnock.name, '—'),
              room: typeof h.myKnock.room === 'number' ? h.myKnock.room : null,
              at: num(h.myKnock.at),
              status: h.myKnock.status === 'declined' ? 'declined' : 'pending',
            }
          : null,
        visit:
          isObj(h.visit) && isObj(h.visit.host) && isObj(h.visit.guest)
            ? {
                host: roomer(h.visit.host),
                guest: roomer(h.visit.guest),
                since: num(h.visit.since),
                me:
                  h.visit.me === 'host' || h.visit.me === 'guest'
                    ? (h.visit.me as 'host' | 'guest')
                    : null,
              }
            : null,
      };
    });
}

const roomer = (x: Record<string, unknown>) => ({
  id: str(x.id),
  name: str(x.name, '—'),
  room: typeof x.room === 'number' ? x.room : null,
});

const first = (name: string) => name.split(' ')[0] ?? name;

/** The game date of a holiday's month ("This month · Year 1, Month 3"; months count from 0). */
export const holidayDate = (month: number) =>
  `${t('This month')} · ${t('Year {y}, Month {m}', { y: Math.floor(month / 12) + 1, m: (month % 12) + 1 })}`;

/** AI people in your contacts you could take on holiday: AI founders, owners, the city's regulars. */
export function aiFriendsOf(view: PlayerView): { id: string; name: string; role: string }[] {
  const ais = new Set(view.players.filter((p) => p.ai).map((p) => p.id));
  const seen = new Set<string>();
  return contactsOf(view)
    .filter(
      (c) =>
        (c.kind === 'founder' && ais.has(c.refId)) ||
        (c.kind === 'local' && /^(npc|biz):/.test(c.refId)),
    )
    .sort((a, b) => b.warmth - a.warmth)
    .filter((c) => !seen.has(c.refId) && !!seen.add(c.refId))
    .slice(0, 8)
    .map((c) => {
      const [name, ...rest] = c.name.split(',');
      return { id: c.refId, name: name!.trim() || '—', role: rest.join(',').trim() };
    });
}
const names = (xs: { name: string }[]) => xs.map((x) => first(x.name)).join(', ');

/** The trip abroad you could invite friends on: a booked ticket, or where you are. */
export function tripOf(view: PlayerView): { market: string; city: string } | null {
  const me = view.me as unknown as Record<string, unknown>;
  const home = str(me.market, view.market.id);
  const ticket = isObj(me.flightTicket) ? me.flightTicket : null;
  const cityOf = (id: string) => view.me.destinations.find((d) => d.id === id)?.name ?? id;
  if (ticket && str(ticket.to) && ticket.to !== home)
    return { market: str(ticket.to), city: cityOf(str(ticket.to)) };
  const loc = isObj(me.location) ? me.location : null;
  if (loc && str(loc.market) && loc.market !== home)
    return { market: str(loc.market), city: str(loc.name) || cityOf(str(loc.market)) };
  return null;
}

/** The holiday you're on in the city you're in, with friends there now. */
export function holidayHere(view: PlayerView): HolidayView | null {
  return holidaysOf(view).find((h) => h.together) ?? null;
}

// ---------------------------------------------------------------- Invite friends

export function HolidayInvite({ city, onDone }: { city: string; onDone: () => void }) {
  const { view, send, busy } = useView();
  const already = new Set(
    holidaysOf(view)
      .filter((h) => h.mine)
      .flatMap((h) => h.guests.filter((g) => g.status !== 'declined').map((g) => g.id)),
  );
  const friends = friendsOf(view).filter((f) => !already.has(f.id));
  const aiFriends = aiFriendsOf(view).filter((f) => !already.has(f.id));
  const [who, setWho] = useState<string[]>([]);
  const [hostPays, setHostPays] = useState(false);
  const toggle = (id: string) =>
    setWho((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id].slice(0, 6)));
  const invite = async () => {
    const r = await send<{ message?: string; replies?: unknown[] }>(
      { type: 'holiday.invite', inviteeIds: who, hostPays },
      (r) =>
        r?.replies?.length && r.message
          ? tx(r.message)
          : t('Invitations sent. They’ll see them when they’re next on.'),
    );
    if (r !== null) onDone();
  };
  return (
    <section
      className="holiday-card holiday-picker"
      aria-label={t('Invite friends')}
      data-holiday-picker
    >
      <div className="spread">
        <b>{t('Invite friends to {city}', { city })}</b>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          {t('Cancel')}
        </button>
      </div>
      <p className="small muted">
        {t('They fly from their own city to the same hotel. The invitation lasts this month.')}
      </p>
      {friends.length === 0 && aiFriends.length === 0 ? (
        <p className="small muted">{t('No friends to ask yet.')}</p>
      ) : (
        <ul className="holiday-friends" aria-label={t('Who')}>
          {friends.map((f) => (
            <li key={f.id}>
              <label className="holiday-check" data-holiday-friend={f.id}>
                <input type="checkbox" checked={who.includes(f.id)} onChange={() => toggle(f.id)} />
                <span className="item-title">{f.name}</span>
              </label>
            </li>
          ))}
          {aiFriends.map((f) => (
            <li key={f.id}>
              <label className="holiday-check" data-holiday-friend={f.id} data-holiday-ai="">
                <input type="checkbox" checked={who.includes(f.id)} onChange={() => toggle(f.id)} />
                <span>
                  <span className="item-title">{f.name}</span>
                  <br />
                  <span className="small muted">
                    {f.role ? `${tx(f.role)} · ` : ''}
                    {t('From your contacts: they answer right away')}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <label className="holiday-check holiday-pay" data-holiday-hostpays>
        <input type="checkbox" checked={hostPays} onChange={() => setHostPays((v) => !v)} />
        <span>
          <span className="item-title">{t('I’ll pay for their flight and hotel')}</span>
          <br />
          <span className="small muted">
            {hostPays
              ? t('Charged to you when they accept.')
              : t('Off: everyone pays their own way.')}
          </span>
        </span>
      </label>
      <Button disabled={busy || who.length === 0} onClick={() => void invite()}>
        {who.length > 1 ? t('Invite {n} friends', { n: who.length }) : t('Send the invitation')}
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------- The cards

function Invitation({ h }: { h: HolidayView }) {
  const { send, busy } = useView();
  const inv = h.invite;
  const accept = (payOwn: boolean) =>
    void send<{ message?: string }>(
      { type: 'holiday.accept', holidayId: h.id, ...(payOwn ? { payOwn } : {}) },
      (r) => (r?.message ? tx(r.message) : t('You’re going.')),
    );
  return (
    <section className="holiday-card holiday-invite" data-holiday-invite={h.id}>
      <span className="holiday-kicker">{t('Holiday invitation')}</span>
      <b className="holiday-title">
        {t('{name} invited you to {city}', { name: h.host.name, city: h.city })}
      </b>
      <span className="small" data-holiday-date>
        {holidayDate(h.month)}
        {h.hotel ? ` · ${t('Hotel: {name}', { name: h.hotel.name })}` : ` · ${t('Flight only')}`}
      </span>
      {inv && (
        <span className="small" data-holiday-cost>
          {inv.hostPays
            ? t('{name} pays your flight and hotel ({cost}).', {
                name: first(h.host.name),
                cost: money(inv.cost, inv.currency),
              })
            : inv.cost > 0
              ? t('You pay your own way: {cost} from your city.', {
                  cost: money(inv.cost, inv.currency),
                })
              : t('You’re already there: nothing to book.')}
        </span>
      )}
      {inv?.blocked && (
        <span className="small bad" role="note">
          {tx(inv.blocked)}
        </span>
      )}
      {inv && !inv.affordable && !inv.blocked && (
        <span className="small bad" role="note">
          {t('You can’t afford it right now.')}
        </span>
      )}
      <div className="row">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void send({ type: 'holiday.decline', holidayId: h.id }, t('Maybe next time.'))
          }
        >
          {t('Decline')}
        </Button>
        {inv?.hostPays && (
          <Button variant="subtle" disabled={busy} onClick={() => accept(true)}>
            {t('Pay my own way')}
          </Button>
        )}
        <Button disabled={busy} onClick={() => accept(false)}>
          {t('Accept')}
        </Button>
      </div>
    </section>
  );
}

function GuestList({ h }: { h: HolidayView }) {
  const { view } = useView();
  const cur = view.accounts.local?.currency ?? view.market.currency;
  const label = (s: string, here: boolean) =>
    here
      ? t('Here')
      : s === 'accepted'
        ? t('Coming')
        : s === 'declined'
          ? t('Can’t come')
          : t('Invited');
  return (
    <ul className="holiday-guests" aria-label={t('Who’s coming')}>
      {h.guests.map((g) => (
        <li key={g.id} data-holiday-guest={g.id} data-status={g.status}>
          <span className="holiday-guest-main">
            <span>{g.name}</span>
            {g.ai && g.ai.text && (
              <span className="holiday-reply" data-holiday-reply={g.ai.answer}>
                “{tx(g.ai.text)}”
              </span>
            )}
          </span>
          <span className={`pill holiday-${g.status}`}>
            {g.ai?.answer === 'pay'
              ? t('If you pay')
              : g.ai?.answer === 'busy'
                ? t('Not this month')
                : label(g.status, g.here)}
            {h.mine && g.hostPays && g.status !== 'declined' ? ` · ${t('you pay')}` : ''}
            {h.mine && g.estimate ? ` ~${money(g.estimate, cur)}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Together({ h, goPlace }: { h: HolidayView; goPlace: (place: string) => void }) {
  const { view, send, busy } = useView();
  const go = async (x: HolidayView['things'][number]) => {
    const r = await send<{ message?: string }>(
      { type: 'holiday.together', holidayId: h.id, businessId: x.businessId },
      (r) => (r?.message ? tx(r.message) : null),
    );
    if (r !== null) goPlace(x.placeId);
  };
  const myRoom = h.rooms[view.me.id];
  return (
    <>
      {myRoom && h.hotel && (
        <span className="small" data-holiday-rooms>
          {t('Your room: {room}', { room: myRoom })} ·{' '}
          {h.companionsHere
            .filter((c) => h.rooms[c.id])
            .map((c) => t('{name} in {room}', { name: first(c.name), room: h.rooms[c.id]! }))
            .join(' · ')}
        </span>
      )}
      <b className="small">{t('Things to do together')}</b>
      <span className="small muted">
        {t('Together: happiness +{h}, stress {s}, trust between you up.', {
          h: h.bonus.happiness,
          s: h.bonus.stress,
        })}
      </span>
      <ul className="holiday-things" aria-label={t('Things to do together')}>
        {h.things.map((x) => (
          <li key={x.businessId} data-holiday-thing={x.businessId}>
            <span className="holiday-thing-main">
              <span className="item-title">{x.name}</span>
              {x.planned && (
                <span className="small muted">
                  {t('{name} is going', { name: first(x.planned.by) })} · {names(x.planned.members)}
                </span>
              )}
            </span>
            {x.planned?.joined ? (
              <Button variant="subtle" onClick={() => goPlace(x.placeId)}>
                {t('Go')}
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => void go(x)}>
                {x.planned ? t('Join') : t('Go together')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function HolidayCard({ h, goPlace }: { h: HolidayView; goPlace: (place: string) => void }) {
  const { view } = useView();
  const [inviting, setInviting] = useState(false);
  // A guest's card: the host and the other friends coming.
  const others = h.mine
    ? []
    : [h.host, ...h.guests.filter((g) => g.status === 'accepted' && g.id !== view.me.id)];
  return (
    <section
      className={`holiday-card holiday-trip${h.together ? ' is-together' : ''}`}
      data-holiday={h.id}
      data-holiday-together={h.together ? '' : undefined}
    >
      <span className="holiday-kicker">
        {h.together
          ? t('Holiday in {city} with {names}', { city: h.city, names: names(h.companionsHere) })
          : t('Holiday in {city}', { city: h.city })}
      </span>
      <b className="holiday-title">
        {h.mine
          ? t('Your trip to {city}', { city: h.city })
          : t('{name}’s trip to {city}', { name: h.host.name, city: h.city })}
      </b>
      <span className="small" data-holiday-date>
        {holidayDate(h.month)}
        {h.hotel ? ` · ${t('Hotel: {name}', { name: h.hotel.name })}` : ` · ${t('Flight only')}`}
      </span>
      {!h.mine && others.length > 0 && (
        <span className="small muted">{t('With {names}', { names: names(others) })}</span>
      )}
      {h.flight && h.flight.with.length > 0 && (
        <span className="small holiday-flying" data-holiday-flying>
          ✈ {t('Flying with {names}', { names: names(h.flight.with) })} ·{' '}
          {t('Seat {seat}', { seat: h.flight.seat })}
        </span>
      )}
      {h.guests.length > 0 && <GuestList h={h} />}
      {h.together && <Together h={h} goPlace={goPlace} />}
      {h.done.length > 0 && (
        <ul className="holiday-done" aria-label={t('Done together')}>
          {h.done.map((d) => (
            <li key={d.hangoutId} data-holiday-done={d.hangoutId}>
              ✓ {t('{place} with {names}', { place: d.name, names: names(d.members) })} ·{' '}
              <span className="good" data-holiday-bonus>
                {t('happier, less stressed, closer')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {h.mine &&
        (inviting ? (
          <HolidayInvite city={h.city} onDone={() => setInviting(false)} />
        ) : (
          <Button variant="subtle" onClick={() => setInviting(true)}>
            {t('Invite more friends')}
          </Button>
        ))}
    </section>
  );
}

/**
 * Every holiday card: invitations waiting for you, your trips with friends,
 * and (with a trip abroad and no holiday on it yet) a prompt to invite friends.
 */
export function HolidayCards({
  goPlace = visitPlace,
  prompt = true,
}: {
  goPlace?: (place: string) => void;
  /** Show "Invite friends" for a trip with no holiday yet. */
  prompt?: boolean;
}) {
  const { view } = useView();
  const [inviting, setInviting] = useState(false);
  const all = holidaysOf(view);
  const trip = tripOf(view);
  // Hosting one there already, or on a friend's holiday there: no prompt.
  const hosting = trip && all.some((h) => h.market === trip.market && h.myStatus !== 'pending');
  const pending = all.filter((h) => h.myStatus === 'pending');
  const trips = all.filter((h) => h.myStatus !== 'pending');
  if (!all.length && !(prompt && trip)) return null;
  return (
    <div className="holiday-stack">
      {pending.map((h) => (
        <Invitation key={h.id} h={h} />
      ))}
      {trips.map((h) => (
        <HolidayCard key={h.id} h={h} goPlace={goPlace} />
      ))}
      {prompt &&
        trip &&
        !hosting &&
        (inviting ? (
          <HolidayInvite city={trip.city} onDone={() => setInviting(false)} />
        ) : (
          <section className="holiday-card holiday-prompt" data-holiday-prompt={trip.market}>
            <span className="holiday-kicker">{t('Holiday with friends')}</span>
            <span className="small">
              {t('Going to {city}? Bring friends: same hotel, things to do together.', {
                city: trip.city,
              })}
            </span>
            <Button onClick={() => setInviting(true)}>{t('Invite friends')}</Button>
          </section>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------- On the map, in the hotel

/** The City map: "Holiday in London with Ada" while you're there together. */
export function HolidayBanner() {
  const { view } = useView();
  const h = holidayHere(view);
  if (!h) return null;
  return (
    <div className="hud-banner holiday-banner" role="status" data-holiday-with={h.id}>
      <span aria-hidden="true" className="holiday-banner-icon">
        🏖
      </span>
      <span>
        <b>
          {t('Holiday in {city} with {names}', { city: h.city, names: names(h.companionsHere) })}
        </b>
        {h.done.length > 0 && (
          <span className="small"> · {t('{n} done together', { n: h.done.length })}</span>
        )}
      </span>
    </div>
  );
}

/** The hotel room: your friends from the holiday in the rooms next to yours. */
/**
 * A friend from your holiday knocking on your hotel door (`view.holidays[].knocks`):
 * Open the door (you go over to their room) or Not now (`hotel.answer`).
 */
export function HotelKnocked() {
  const { view, send, busy } = useView();
  const h = holidaysOf(view).find(
    (x) => x.myStatus !== 'pending' && x.hotel && x.knocks.length && !x.visit,
  );
  const k = h?.knocks[0];
  if (!h || !k) return null;
  const name = first(k.name);
  const answer = (accept: boolean) =>
    void send(
      { type: 'hotel.answer', holidayId: h.id, from: k.from, accept },
      accept ? t('You go over to {name}’s room.', { name }) : t('Maybe later.'),
    );
  return (
    <div className="hotel-knocked" role="alert" data-hotel-knocked={k.from}>
      <span className="hotel-knocked-who">
        <span aria-hidden="true">🚪 </span>
        {t('{name} is knocking', { name })}
      </span>
      <span className="hotel-knocked-acts">
        <button
          type="button"
          className="hotel-knocked-btn is-primary"
          data-action="hotel-open"
          disabled={busy}
          onClick={() => answer(true)}
        >
          {t('Open the door')}
        </button>
        <button
          type="button"
          className="hotel-knocked-btn"
          data-action="hotel-not-now"
          disabled={busy}
          onClick={() => answer(false)}
        >
          {t('Not now')}
        </button>
      </span>
    </div>
  );
}

export function HotelNeighbours() {
  const { view } = useView();
  const h = holidaysOf(view).find((x) => x.myStatus !== 'pending' && x.hotel && x.together);
  const mine = h?.rooms[view.me.id];
  if (!h || !mine) return null;
  const next = h.companionsHere.filter((c) => h.rooms[c.id]);
  if (!next.length) return null;
  return (
    <span className="small holiday-neighbours" data-hotel-neighbours>
      {t('Room {room}', { room: mine })} ·{' '}
      {next
        .map((c) => t('{name} next door in {room}', { name: first(c.name), room: h.rooms[c.id]! }))
        .join(' · ')}
    </span>
  );
}
