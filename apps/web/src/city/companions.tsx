/**
 * Holiday with friends, on the way: who travels with you (view.holidays).
 *
 * - On the flight: the friends booked on the same flight (the host's, from
 *   the same city) and AI friends from that city, in the seats next to yours
 *   (`flight.with`, `companions[].seat`). The boarding pass and the cabin
 *   say "Flying with Bola · 14B".
 * - At arrivals: the ones on your flight walk through passport control and
 *   baggage with you; the ones who came another way (or landed first) wait
 *   at the barrier. The hotel's driver holds a board with everyone's names.
 * - Out together: at a venue you went to together on the holiday, your
 *   companions stand next to you, labelled.
 *
 * Read loosely: an older server sends no companions, and nothing shows.
 */
import { defaultAppearance, type MarketId, type PlayerView } from '@runway/engine';
import { t } from '../i18n';
import { useView } from '../store';
import { AvatarFigure, avatarLook, lookFromAppearance, type AvatarLook } from './art';
import { hash } from './contract';
import { holidaysOf, type Companion, type HolidayView } from '../phone/apps/Holiday';

const BOTTOMS = ['#1e293b', '#111827', '#334155', '#1f2937', '#78350f', '#1e3a8a'];

export interface Traveller {
  id: string;
  name: string;
  first: string;
  look: AvatarLook;
  seat: string | null;
  ai: boolean;
}

export const firstOf = (name: string) => name.split(' ')[0] || name;

/** How a companion is drawn: a player as they look everywhere, an AI friend from the engine's look. */
function companionLook(c: Companion): AvatarLook {
  if (!c.ai) return avatarLook(c.backgroundId ?? undefined, c.id, c.gender);
  const a = c.appearance ?? defaultAppearance(c.id, c.gender, (c.from || null) as MarketId | null);
  return lookFromAppearance(a, c.gender, BOTTOMS[hash(c.id) % BOTTOMS.length]!);
}

const traveller = (c: Companion): Traveller => ({
  id: c.id,
  name: c.name,
  first: firstOf(c.name),
  look: companionLook(c),
  seat: c.seat,
  ai: c.ai,
});

/** The holiday you're going on (or are on) in this city. */
const holidayIn = (view: PlayerView, market: string): HolidayView | null =>
  holidaysOf(view).find(
    (h) => h.market === market && (h.myStatus === 'host' || h.myStatus === 'accepted'),
  ) ?? null;

/** Your flight to `to` with friends on it: your seat, the flight, and who's beside you. */
export function flightPartyTo(
  view: PlayerView,
  to: string,
): { seat: string; flight: string | null; with: Traveller[] } | null {
  const h = holidayIn(view, to);
  if (!h?.flight) return null;
  const on = new Set(h.flight.with.map((w) => w.id));
  const with_ = h.companions.filter((c) => on.has(c.id)).map(traveller);
  if (!with_.length) return null;
  const flight = [h.flight.airline, h.flight.number].filter(Boolean).join(' ') || null;
  return { seat: h.flight.seat, flight, with: with_ };
}

/** Landing in `market`: who walks through with you, and who's waiting at the barrier. */
export function arrivalParty(
  view: PlayerView,
  market: string,
): { hotel: string | null; withMe: Traveller[]; waiting: Traveller[] } | null {
  const h = holidayIn(view, market);
  if (!h) return null;
  const withMe = h.companions.filter((c) => c.sameFlight).map(traveller);
  const waiting = h.companions.filter((c) => !c.sameFlight && c.here).map(traveller);
  if (!withMe.length && !waiting.length) return null;
  return { hotel: h.hotel?.name ?? null, withMe, waiting };
}

/** Everyone sharing your hotel transfer: the companions in the city with you. */
function rideParty(view: PlayerView, market: string): Traveller[] {
  const h = holidayIn(view, market);
  if (!h) return [];
  return h.companions.filter((c) => c.sameFlight || c.here).map(traveller);
}

/**
 * At a venue: your holiday companions with you, when this is a place you
 * planned or went to together on the holiday (`things[].planned`, `done`).
 */
export function venueParty(view: PlayerView, businessId: string | null): Traveller[] {
  if (!businessId) return [];
  for (const h of holidaysOf(view)) {
    if (h.myStatus !== 'host' && h.myStatus !== 'accepted') continue;
    const planned = h.things.find((x) => x.businessId === businessId && x.planned?.joined);
    const done = h.done.find(
      (d) => d.businessId === businessId && d.members.some((m) => m.id === view.me.id),
    );
    if (!planned && !done) continue;
    const ids = new Set(
      [...(planned?.planned?.members ?? []), ...(done?.members ?? [])].map((m) => m.id),
    );
    // AI friends always come along; players who planned it or joined.
    const out = h.companions
      .filter((c) => c.id !== view.me.id && (ids.has(c.id) || c.ai))
      .map(traveller);
    if (out.length) return out;
  }
  return [];
}

/** First names: "Bola", "Bola and Chi", "Bola, Chi and Tunde". */
export function namesOf(xs: { first: string }[]): string {
  const n = xs.map((x) => x.first);
  if (n.length <= 1) return n[0] ?? '';
  return t('{a} and {b}', { a: n.slice(0, -1).join(', '), b: n[n.length - 1]! });
}

/** "Flying with Bola · 14B" on the boarding pass and the ticket: who sits next to you. */
export function FlyingWith({ to }: { to: string }) {
  const { view } = useView();
  const p = flightPartyTo(view, to);
  if (!p) return null;
  return (
    <span className="small flying-with" data-flying-with={p.with.map((w) => w.id).join(' ')}>
      ✈{' '}
      {t('Flying with {names}', {
        names: namesOf(
          p.with.map((w) => ({
            first: w.seat ? t('{name} · {seat}', { name: w.first, seat: w.seat }) : w.first,
          })),
        ),
      })}
    </span>
  );
}

/** The hotel ride ("On your way to …"): "with Bola". */
export function RideWith({ market }: { market: string }) {
  const { view } = useView();
  const with_ = rideParty(view, market);
  if (!with_.length) return null;
  return (
    <p className="stay-transfer-with" data-transfer-with={with_.map((w) => w.id).join(' ')}>
      {t('with {names}', { names: namesOf(with_) })}
    </p>
  );
}

/**
 * In a venue's 2D room: your companions next to you at the door, each with
 * their name over their head (drawn in the room's SVG, beside `scene-you`).
 */
export function VenueParty({ party, x, y }: { party: Traveller[]; x: number; y: number }) {
  if (!party.length) return null;
  return (
    <g data-venue-party={party.map((f) => f.id).join(' ')}>
      <g transform={`translate(${x} ${y - 100})`}>
        <rect x="-18" y="-11" width="36" height="14" rx="7" fill="#facc15" />
        <text y="0" fontSize="9" fontWeight="800" fill="#0f172a" textAnchor="middle">
          {t('You')}
        </text>
      </g>
      {party.slice(0, 3).map((f, k) => {
        const fx = x - 34 * (k + 1);
        const fy = y - 4 * ((k + 1) % 2);
        const w = Math.max(30, f.first.length * 6.4 + 12);
        return (
          <g key={f.id} data-venue-friend={f.id}>
            <g className="scene-friend" transform={`translate(${fx} ${fy}) scale(-1.8 1.8)`}>
              <AvatarFigure look={f.look} />
            </g>
            <g transform={`translate(${fx} ${fy - 96})`}>
              <rect x={-w / 2} y="-11" width={w} height="14" rx="7" fill="#5eead4" />
              <text y="0" fontSize="9" fontWeight="800" fill="#0f172a" textAnchor="middle">
                {f.first}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** Over the venue (2D or 3D): "On holiday with Bola". */
export function VenuePartyLine({ party }: { party: Traveller[] }) {
  if (!party.length) return null;
  return (
    <p className="venue-party" data-venue-with={party.map((f) => f.id).join(' ')}>
      🏖 {t('On holiday with {names}', { names: namesOf(party) })}
    </p>
  );
}
