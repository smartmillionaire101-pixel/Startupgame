/**
 * Choosing your cabin when you book a flight (player feedback: "I should
 * choose which class I want: economy, business and first class, because
 * remember we have lifestyle in the game"). The three, a row each with its
 * fare, what you get and how you'll land (a row each, not side by side: three
 * cards across pushed the Travel app off a phone); one you can't afford is
 * greyed out. Then (first-class release, player feedback: "When I book first class
 * travel the return is always economy") the way home: a return booked now,
 * in the same cabin unless you choose another. Then, abroad, the hotel
 * (./HotelPicker); flying home, just the flight, on the return you hold.
 */
import { useState } from 'react';
import { money } from '../format';
import { t } from '../i18n';
import { HotelPicker } from './HotelPicker';
import type { Ticket } from './ticket';
import type { CabinOption, CabinTier, HotelOption, HotelTier, NamedHotel } from './travel';
import './hotels.css';

export const CABIN_NAME: Record<CabinTier, () => string> = {
  economy: () => t('Economy'),
  business: () => t('Business'),
  first: () => t('First class'),
};

const CABIN_ICON: Record<CabinTier, string> = { economy: '💺', business: '🛋️', first: '🥂' };

/** What each cabin gives you, in a few words (one short line on a phone). */
const PERKS: Record<CabinTier, () => string[]> = {
  economy: () => [t('Standard seat'), t('Meal on a tray')],
  business: () => [t('Lie-flat seat'), t('Lounge'), t('Priority boarding')],
  first: () => [t('Private suite'), t('Champagne'), t('Chauffeur on arrival')],
};

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/** How you'll land: "Tiring · Energy −10" (only what changes). */
function landing(c: CabinOption): string {
  const feel =
    c.cabin === 'first' ? t('Restful') : c.cabin === 'business' ? t('Fairly fresh') : t('Tiring');
  const bits = [feel];
  if (c.energy) bits.push(t('Energy {n}', { n: signed(c.energy) }));
  if (c.stress) bits.push(t('Stress {n}', { n: signed(c.stress) }));
  return bits.join(' · ');
}

function CabinPicker({
  cabins,
  currency,
  pick,
  onPick,
  name,
  leg = 'out',
  paid,
}: {
  cabins: CabinOption[];
  currency: string;
  pick: CabinTier;
  onPick: (c: CabinTier) => void;
  /** The radio group's name (unique per destination). */
  name: string;
  /** The way out (or one way), or the way home of a return. */
  leg?: 'out' | 'return';
  /** The cabin of the return ticket you hold: already paid. */
  paid?: CabinTier;
}) {
  return (
    <div
      className={`cabin-options${leg === 'return' ? ' is-return' : ''}`}
      role="radiogroup"
      aria-label={leg === 'return' ? t('Cabin home') : t('Cabin class')}
    >
      {cabins.map((c) => {
        const held = paid === c.cabin;
        const ok = c.affordable || held;
        return (
          <label
            key={c.cabin}
            className={`cabin-option cabin-${c.cabin}${pick === c.cabin ? ' is-picked' : ''}${ok ? '' : ' is-off'}`}
            {...(leg === 'return'
              ? { 'data-return-option': c.cabin }
              : { 'data-cabin-option': c.cabin })}
            {...(held ? { 'data-cabin-paid': '' } : {})}
          >
            <input
              type="radio"
              name={name}
              value={c.cabin}
              checked={pick === c.cabin}
              disabled={!ok}
              onChange={() => onPick(c.cabin)}
            />
            <span className="cabin-main">
              <span className="cabin-head">
                <span aria-hidden="true">{CABIN_ICON[c.cabin]}</span> <b>{CABIN_NAME[c.cabin]()}</b>
              </span>
              <span className="cabin-perks small muted">{PERKS[c.cabin]().join(' · ')}</span>
              <span className="cabin-land small">
                {landing(c)}
                {c.hours > 0 && (
                  <span className="cabin-hours muted">
                    {' · '}
                    {t('{h}h at the airport', { h: c.hours })}
                  </span>
                )}
              </span>
              {!ok && <span className="cabin-off small">{t('Can’t afford')}</span>}
            </span>
            <span className={`cabin-price${held ? ' is-held' : ''}`}>
              {held ? t('Your return ticket · paid') : money(c.price, currency)}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * Both legs of your ticket (first-class release): the way out and the way
 * home, each with its cabin (and fare), or the flight home on a return you
 * hold. Nothing for a one-way ticket.
 */
export function TicketLegs({
  ticket,
  fromName,
  homeName,
  prices,
}: {
  ticket: Ticket;
  fromName: string;
  homeName: string;
  /** Show each leg's fare. */
  prices?: boolean;
}) {
  if (!ticket.back && !ticket.prepaid) return null;
  const out = ticket.cabin ?? 'economy';
  return (
    <span className="ticket-legs small" data-ticket-legs="">
      {ticket.prepaid ? (
        <span data-ticket-leg="home" data-leg-cabin={out}>
          <span aria-hidden="true">↩ </span>
          {t('Return: {from} → {to}', { from: fromName, to: ticket.toName })} ·{' '}
          <b>{CABIN_NAME[out]()}</b> · {t('paid when you booked')}
        </span>
      ) : (
        <span data-ticket-leg="out" data-leg-cabin={out}>
          <span aria-hidden="true">✈ </span>
          {t('Outbound: {from} → {to}', { from: fromName, to: ticket.toName })} ·{' '}
          <b>{CABIN_NAME[out]()}</b>
          {prices ? ` · ${money(ticket.fare, ticket.currency)}` : ''}
        </span>
      )}
      {ticket.back && (
        <span data-ticket-leg="return" data-leg-cabin={ticket.back.cabin}>
          <span aria-hidden="true">↩ </span>
          {t('Return: {from} → {to}', { from: ticket.toName, to: homeName })} ·{' '}
          <b>{CABIN_NAME[ticket.back.cabin]()}</b>
          {prices ? ` · ${money(ticket.back.fare, ticket.currency)}` : ''}
        </span>
      )}
    </span>
  );
}

/**
 * The cabin, then (first-class release) the way home in its own cabin (the
 * same as the way out unless you change it), then abroad the hotel, then one
 * button that books them. Flying home on a return you hold, its cabin comes
 * first, already paid.
 */
export function TripPicker({
  city,
  marketId = '',
  cabins,
  hotels,
  hotelList = [],
  fare,
  currency,
  balance,
  busy,
  returnCabins = [],
  homeName = '',
  held = null,
  initial,
  onBook,
  onCancel,
}: {
  city: string;
  /** The destination (for the named hotels' map). */
  marketId?: string;
  /** Empty from an older server: economy only, the fare as it is. */
  cabins: CabinOption[];
  hotels: HotelOption[];
  /** The city's named hotels (the feedback round; empty: the three tiers). */
  hotelList?: NamedHotel[];
  /** The economy fare, minor units of your home currency. */
  fare: number;
  currency: string;
  balance: number;
  busy: boolean;
  /** The way home from there per cabin (empty: one way only). */
  returnCabins?: CabinOption[];
  homeName?: string;
  /** Flying home: the return ticket you hold. */
  held?: { cabin: CabinTier; paid: number } | null;
  /** The cabin to start on (flying home: the one you flew out in). */
  initial?: CabinTier;
  onBook: (
    hotel: HotelTier | null,
    cabin: CabinTier,
    back: CabinTier | null,
    hotelId?: string,
  ) => void;
  onCancel: () => void;
}) {
  const [cabin, setCabin] = useState<CabinTier>(held?.cabin ?? initial ?? 'economy');
  const canReturn = cabins.length > 0 && returnCabins.length > 0;
  // A return whenever the cabin you start on is affordable both ways (playtest: a
  // return defaulted to one way unless even first class both ways was affordable,
  // and the way home was then charged again at the airport). One way stays a tap away.
  const [roundTrip, setRoundTrip] = useState(() => {
    const start = held?.cabin ?? initial ?? 'economy';
    const outFare = cabins.find((c) => c.cabin === start)?.price ?? fare;
    const backFare = returnCabins.find((c) => c.cabin === start)?.price ?? 0;
    return canReturn && balance >= outFare + backFare;
  });
  const chosen = cabins.find((c) => c.cabin === cabin);
  const usingHeld = !!held && held.cabin === cabin;
  const out = usingHeld ? 0 : (chosen?.price ?? fare);
  // The way home follows the way out until you choose it yourself: in the same
  // cabin when you can pay for both, else the best one you can (never a dead end).
  const [backPick, setBackPick] = useState<CabinTier | null>(null);
  const fits = (c: CabinTier) =>
    balance >= out + (returnCabins.find((r) => r.cabin === c)?.price ?? Infinity);
  const order: CabinTier[] = ['first', 'business', 'economy'];
  const back =
    backPick ?? (fits(cabin) ? cabin : (order.slice(order.indexOf(cabin)).find(fits) ?? cabin));
  // A cabin you can only afford one way: the trip turns one way (Return is a tap away).
  const pickCabin = (c: CabinTier) => {
    setCabin(c);
    const o = held?.cabin === c ? 0 : (cabins.find((x) => x.cabin === c)?.price ?? fare);
    if (roundTrip && !returnCabins.some((r) => balance >= o + r.price)) setRoundTrip(false);
  };
  const backPrice = roundTrip ? (returnCabins.find((c) => c.cabin === back)?.price ?? 0) : 0;
  const price = out + backPrice;
  const short = !usingHeld && balance < price;
  const returns = returnCabins.map((c) => ({ ...c, affordable: balance >= out + c.price }));
  const blocked = busy || (!usingHeld && !!chosen && !chosen.affordable) || short;
  return (
    <div className="trip-picker" data-trip-picker={city}>
      {held && (
        <p className="small trip-held" data-held-return={held.cabin}>
          <span aria-hidden="true">🎫 </span>
          {t('You hold a return ticket home in {cabin}, already paid.', {
            cabin: CABIN_NAME[held.cabin](),
          })}
        </p>
      )}
      {cabins.length > 0 && (
        <>
          <b className="small">{t('How do you want to fly to {city}?', { city })}</b>
          <CabinPicker
            cabins={cabins}
            currency={currency}
            pick={cabin}
            onPick={pickCabin}
            name={`cabin-${city}`}
            paid={held?.cabin}
          />
        </>
      )}
      {held && !usingHeld && (
        <p className="small muted" data-held-refund="">
          {t('Your {cabin} return is refunded, and this one charged.', {
            cabin: CABIN_NAME[held.cabin](),
          })}
        </p>
      )}
      {canReturn && (
        <div className="trip-kind" role="radiogroup" aria-label={t('Trip')}>
          <label className={roundTrip ? 'is-picked' : ''} data-trip-kind="return">
            <input
              type="radio"
              name={`trip-${city}`}
              checked={roundTrip}
              onChange={() => setRoundTrip(true)}
            />
            {t('Return')}
          </label>
          <label className={roundTrip ? '' : 'is-picked'} data-trip-kind="oneway">
            <input
              type="radio"
              name={`trip-${city}`}
              checked={!roundTrip}
              onChange={() => setRoundTrip(false)}
            />
            {t('One way')}
          </label>
        </div>
      )}
      {canReturn && !roundTrip && (
        <p className="small muted" data-trip-oneway="">
          {t('One way: the flight home isn’t booked. You pay for it when you book it.')}
        </p>
      )}
      {canReturn && roundTrip && (
        <div className="trip-back" data-trip-back={back}>
          <b className="small">{t('And home to {city}?', { city: homeName })}</b>
          <CabinPicker
            cabins={returns}
            currency={currency}
            pick={back}
            onPick={setBackPick}
            name={`back-${city}`}
            leg="return"
          />
          <p className="small muted">
            {t('Both legs are charged now; the way home is on your ticket.')}
          </p>
        </div>
      )}
      {short && <p className="small cabin-off">{t('Can’t afford')}</p>}
      {hotels.length > 0 || hotelList.length > 0 ? (
        // A new suggestion for each choice: what's left after the fares change.
        <HotelPicker
          key={`${cabin}:${roundTrip ? back : '-'}`}
          city={city}
          marketId={marketId}
          hotels={hotels}
          named={hotelList}
          fare={price}
          currency={currency}
          balance={balance}
          busy={blocked}
          onBook={(hotel, hotelId) => onBook(hotel, cabin, roundTrip ? back : null, hotelId)}
          onCancel={onCancel}
        />
      ) : (
        <div className="hotel-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={blocked}
            data-cabin-book
            onClick={() => onBook(null, cabin, roundTrip ? back : null)}
          >
            {usingHeld
              ? t('Use my return ticket')
              : t('Book flight · {total}', { total: money(price, currency) })}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t('Back')}
          </button>
        </div>
      )}
    </div>
  );
}
