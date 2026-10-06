/**
 * Who's here (docs/WAVE6-ALIVE-CITY.md §C1): people live inside buildings.
 *
 * In a scene, a small strip over the room ("Who's here · 4") opens the list
 * of everyone in this place: the engine's `businesses[].people` (owner,
 * staff, AI founders, angels, partners, regulars) plus players whose
 * presence is this place. Each person has Chat (the phone thread), Save
 * (`contact.save`) and, where the place serves a meeting, Invite
 * (`venue.buy` with `withId`).
 *
 * Until the engine sends `people`, the list falls back to what the view
 * already says: the owner, AI angels at the table, a fund's partner, AI
 * founders at the Hub.
 *
 * On the map, "Who's around" lists the players in town and the notable AI
 * people by the place they're in; tap one to go there.
 */
import { useMemo, useState } from 'react';
import './whoishere.css';
import type { PlayerView } from '@runway/engine';
import { money } from '../format';
import { t, tx } from '../i18n';
import { openPhone } from '../phone/bus';
import { useView } from '../store';
import { Button, Sheet } from '../ui';
import { AvatarFigure, avatarLook } from './art';
import { angelsOf, businessesOf, hash } from './contract';
import type { CityLayout, Place } from './layout';
import { angelsAtOf, cityAngelsOf, looseCmd, lunchVenueOf, lunchVenues } from './life';
import {
  contactsOf,
  peopleField,
  savedContact,
  type HereKind,
  type PersonHere,
  type PresenceView,
} from './people';
import { usePlacePresence } from './presence';

type View = PlayerView;

const roleOf = (kind: HereKind) =>
  (
    ({
      owner: t('Owner'),
      staff: t('Staff'),
      founder: t('Founder'),
      angel: t('Angel investor'),
      partner: t('Fund partner'),
      regular: t('Regular'),
      player: t('Player'),
    }) as Record<HereKind, string>
  )[kind];

/** AI angels at a business: `angelsAt` from the engine, else where they lunch. */
function angelsAt(view: View, businessId: string): { id: string; name: string }[] {
  const at = angelsAtOf(view);
  if (at) return at[businessId] ?? [];
  const all = cityAngelsOf(view).length ? cityAngelsOf(view) : angelsOf(view);
  const venues = lunchVenues(view);
  return all.filter((a) => lunchVenueOf(a.id, venues) === businessId);
}

/** AI founders working from the Hub this month: the same few the room draws. */
function foundersAtHub(view: View): PersonHere[] {
  const out: PersonHere[] = [];
  const m = view.market.month;
  const here = view.directory
    .filter((c) => c.ai && c.status === 'active' && c.market === view.market.id)
    .sort((a, b) => hash(`${a.id}:${m}`) - hash(`${b.id}:${m}`))
    .slice(0, 3);
  for (const c of here) {
    const f = c.founders.find((x) => x.ai) ?? c.founders[0];
    if (f)
      out.push({
        id: f.id,
        name: f.name,
        kind: 'founder',
        role: t('{role} · {company}', { role: t('Founder'), company: c.name }),
        playerId: f.id,
        gender: null,
        human: false,
      });
  }
  return out;
}

/** True when the engine lists this fund's partner (or its angel) inside some business. */
function placedElsewhere(view: View, f: { id: string }): boolean {
  const angel = (f as { angel?: { playerId?: unknown } | null }).angel;
  const ids = new Set([
    `fund:${f.id}`,
    ...(typeof angel?.playerId === 'string' ? [angel.playerId] : []),
  ]);
  return businessesOf(view).some((b) =>
    (peopleField(view, b.id) ?? []).some((p) => ids.has(p.id) || ids.has(p.playerId ?? '')),
  );
}

/** What the view says about who's in a place, before players are merged in. */
function aiPeopleAt(view: View, place: Place): PersonHere[] {
  if (place.kind === 'business' && place.ref) {
    const field = peopleField(view, place.ref);
    if (field) return field;
    const b = businessesOf(view).find((x) => x.id === place.ref);
    const out: PersonHere[] = [];
    if (b)
      out.push({
        id: `biz:${b.id}`,
        name: b.owner.name,
        kind: 'owner',
        role: t('Owner'),
        gender: null,
        human: false,
      });
    for (const a of angelsAt(view, place.ref))
      out.push({
        id: a.id,
        name: a.name,
        kind: 'angel',
        role: t('Angel investor'),
        playerId: a.id,
        gender: null,
        human: false,
      });
    return out;
  }
  if (place.kind === 'fund' && place.ref) {
    const f = view.market.funds.find((x) => x.id === place.ref);
    if (!f) return [];
    // Wave 6: the engine places every partner and angel in one building a month.
    // When it does, they are there, not at the office, so nobody shows twice.
    if (placedElsewhere(view, f)) return [];
    const angel = (f as typeof f & { angel?: { playerId?: unknown; name?: unknown } | null }).angel;
    if (angel && typeof angel.playerId === 'string')
      return [
        {
          id: angel.playerId,
          name: typeof angel.name === 'string' ? angel.name : f.partner,
          kind: 'angel',
          role: t('{role} · {company}', { role: t('Angel investor'), company: f.name }),
          playerId: angel.playerId,
          gender: null,
          human: false,
        },
      ];
    return [
      {
        id: `fund:${f.id}`,
        name: f.partner,
        kind: 'partner',
        role: t('{role} · {company}', { role: t('Fund partner'), company: f.name }),
        gender: null,
        human: false,
      },
    ];
  }
  if (place.kind === 'hub') return foundersAtHub(view);
  return [];
}

/** Everyone in a place: the AI people the view knows of, then players from presence. */
export function peopleAt(view: View, place: Place, players: PresenceView[]): PersonHere[] {
  const out = aiPeopleAt(view, place);
  const seen = new Set(out.flatMap((p) => [p.id, p.playerId ?? p.id]));
  for (const p of players) {
    if (p.place !== place.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({
      id: p.id,
      name: p.name,
      kind: 'player',
      role: p.company
        ? t('{role} · {company}', { role: t('Player'), company: p.company })
        : t('Player'),
      playerId: p.id,
      gender: p.gender ?? null,
      human: true,
      ...(p.backgroundId ? { bg: p.backgroundId } : {}),
    });
  }
  // Players first (they're real), then the people who belong here, then regulars.
  const rank = (p: PersonHere) => (p.human ? 0 : p.kind === 'regular' ? 2 : 1);
  return out
    .map((p, n) => ({ p, n }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.n - b.n)
    .map((x) => x.p);
}

/** Outfits by kind: the same ones the room draws, so a face matches its figure. */
const BG: Record<HereKind, string[]> = {
  owner: ['b-commercial', 'i-operator', 'b-fintech', 'f-consultant'],
  staff: ['b-commercial', 'i-operator', 'b-fintech', 'f-consultant'],
  founder: ['f-engineer', 'f-dropout', 'f-second-time'],
  angel: ['i-exited', 'i-operator', 'b-wealthy'],
  partner: ['i-banker', 'i-operator', 'i-exited'],
  regular: ['b-commercial', 'f-dropout', 'f-engineer', 'i-first', 'b-wealthy', 'f-corporate'],
  player: ['f-engineer', 'i-operator', 'b-commercial'],
};

/** The look the room gives this person (its figures are seeded `ai:<kind>:<ref>`). */
function lookOf(p: PersonHere) {
  if (p.bg) return avatarLook(p.bg, p.id, p.gender);
  const ref = p.id.replace(/^(biz|fund):/, '');
  const kind = p.kind === 'regular' ? 'patron' : p.kind;
  const bgs = BG[p.kind];
  return avatarLook(bgs[hash(ref) % bgs.length], `ai:${kind}:${ref}`, p.gender);
}

function Face({ p, size = 40 }: { p: PersonHere; size?: number }) {
  const look = useMemo(() => lookOf(p), [p]);
  return (
    <svg
      className={`who-face who-${p.kind}`}
      viewBox="-14 -48 28 30"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <AvatarFigure look={look} />
    </svg>
  );
}

/** The id `venue.buy` takes for a guest: a player, a fund, or one of your contacts. */
function guestId(p: PersonHere, contactId: string | null): string | null {
  if (p.human) return p.id;
  if (p.playerId) return p.playerId;
  if (p.id.startsWith('fund:')) return p.id.slice(5);
  return contactId;
}

/** Save someone you met as a contact; then "Saved ✓". */
export function SaveContact({ personId, name }: { personId: string; name: string }) {
  const { view, send } = useView();
  const [done, setDone] = useState(false);
  const saved = done || savedContact(contactsOf(view), personId) !== null;
  if (saved)
    return (
      <span className="who-saved" role="status">
        {t('Saved ✓')}
      </span>
    );
  return (
    <Button
      variant="subtle"
      onClick={() =>
        void send(looseCmd({ type: 'contact.save', personId, name }), () =>
          t('{name} is in your contacts.', { name }),
        ).then((r) => r !== null && setDone(true))
      }
    >
      {t('Save')}
    </Button>
  );
}

function PersonRow({
  p,
  place,
  onChat,
}: {
  p: PersonHere;
  place: Place;
  onChat: (p: PersonHere) => void;
}) {
  const { view, send, cur } = useView();
  const [inviting, setInviting] = useState(false);
  const contact = savedContact(contactsOf(view), p.id);
  const business =
    place.kind === 'business' ? businessesOf(view).find((b) => b.id === place.ref) : undefined;
  const meetings = business?.venue?.items.filter((i) => i.meeting) ?? [];
  const withId = guestId(p, contact?.id ?? null);
  return (
    <li className="who-row" data-person-here={p.id} data-kind={p.kind}>
      <div className="who-id">
        <Face p={p} />
        <span className="who-name">
          <span className="item-title">{p.name}</span>
          <span className="small muted">{p.role ? tx(p.role) : roleOf(p.kind)}</span>
        </span>
        {p.human && <span className="pill pill-info">{t('Player')}</span>}
      </div>
      <div className="who-actions">
        <Button variant="subtle" onClick={() => onChat(p)}>
          {t('Chat')}
        </Button>
        <SaveContact personId={p.id} name={p.name} />
        {meetings.length > 0 && withId && (
          <Button variant="ghost" aria-expanded={inviting} onClick={() => setInviting((v) => !v)}>
            {t('Invite')}
          </Button>
        )}
      </div>
      {inviting && business && withId && (
        <div className="who-invite" role="group" aria-label={t('Invite {name}', { name: p.name })}>
          {meetings.map((it) => (
            <Button
              key={it.id}
              variant="ghost"
              onClick={() =>
                void send(
                  looseCmd({
                    type: 'venue.buy',
                    businessId: business.id,
                    itemId: it.id,
                    withId,
                  }),
                  (r: { message?: string } | null) =>
                    r?.message
                      ? tx(r.message)
                      : t('You met {name} at {place}.', { name: p.name, place: business.name }),
                ).then((r) => r !== null && setInviting(false))
              }
            >
              {tx(it.label)} · {money(it.price, cur)}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}

/** Open the chat for someone: a player thread for people, the AI chat for characters. */
export const chatWith = (p: Pick<PersonHere, 'id' | 'human'>) =>
  openPhone(p.human ? { player: p.id } : { ai: p.id });

/** The "Who's here" strip in a scene, and its list. */
export function WhoIsHere({ place, players = [] }: { place: Place; players?: PresenceView[] }) {
  const { view, lite } = useView();
  const inside = usePlacePresence({ place: place.id, enabled: !lite, selfId: view.me.id });
  const people = useMemo(() => {
    const byId = new Map<string, PresenceView>();
    for (const p of [...players, ...inside]) if (p.place === place.id) byId.set(p.id, p);
    return peopleAt(view, place, [...byId.values()]);
  }, [view, place, players, inside]);
  const [open, setOpen] = useState(false);
  if (!people.length) return null;
  const humans = people.filter((p) => p.human).length;
  return (
    <>
      <button
        type="button"
        className="who-strip"
        data-who-count={people.length}
        aria-label={t('Who’s here ({n})', { n: people.length })}
        onClick={() => setOpen(true)}
      >
        <span className="who-faces" aria-hidden="true">
          {people.slice(0, 3).map((p) => (
            <Face key={p.id} p={p} size={24} />
          ))}
        </span>
        <span>{t('Who’s here')}</span>
        <b>{people.length}</b>
        {humans > 0 && <span className="who-humans">{t('{n} players', { n: humans })}</span>}
      </button>
      {open && (
        <Sheet title={t('Who’s here')} onClose={() => setOpen(false)}>
          <ul className="who-list" aria-label={t('People here')}>
            {people.map((p) => (
              <PersonRow
                key={p.id}
                p={p}
                place={place}
                onChat={(x) => {
                  setOpen(false);
                  chatWith(x);
                }}
              />
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// On the map: who's around town, by the place they're in.

interface Around {
  p: PersonHere;
  place: Place;
}

/** Players in town (by building) and the notable AI people, for the map's list. */
export function whoIsAround(view: View, layout: CityLayout, players: PresenceView[]): Around[] {
  const out: Around[] = [];
  const seen = new Set<string>();
  const add = (p: PersonHere, place: Place) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    out.push({ p, place });
  };
  const byId = new Map(layout.places.map((p) => [p.id, p]));
  for (const pl of players) {
    const place = pl.place ? byId.get(pl.place) : undefined;
    if (place) for (const p of peopleAt(view, place, [pl])) if (p.id === pl.id) add(p, place);
  }
  const notable: HereKind[] = ['angel', 'partner', 'founder'];
  for (const place of layout.places) {
    if (place.kind !== 'business' && place.kind !== 'fund' && place.kind !== 'hub') continue;
    for (const p of aiPeopleAt(view, place)) if (notable.includes(p.kind)) add(p, place);
  }
  return out;
}

export function WhoIsAround({
  layout,
  players,
  labelOf,
  onGo,
}: {
  layout: CityLayout;
  players: PresenceView[];
  labelOf: (p: Place) => string;
  onGo: (placeId: string) => void;
}) {
  const { view } = useView();
  const all = useMemo(() => whoIsAround(view, layout, players), [view, layout, players]);
  if (!all.length) return <p className="small muted">{t('Nobody around right now.')}</p>;
  return (
    <>
      <p className="small muted">{t('People are inside the buildings. Go in to meet them.')}</p>
      <ul className="places-list who-around" aria-label={t('People around')}>
        {all.map(({ p, place }) => (
          <li key={p.id}>
            <button
              type="button"
              className="place-btn"
              data-around={p.id}
              onClick={() => onGo(place.id)}
            >
              <Face p={p} size={28} />
              <span>
                {p.name}
                <span className="small muted"> · {labelOf(place)}</span>
              </span>
              {p.human ? (
                <span className="pill pill-info">{t('Player')}</span>
              ) : (
                <span className="small muted">{roleOf(p.kind)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
