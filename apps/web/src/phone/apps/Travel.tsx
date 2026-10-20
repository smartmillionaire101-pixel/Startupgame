/**
 * Travel: where you can fly from the city you're in, with the departure
 * time, airline, flight number, flight time and fare. You choose where to go
 * and book first; then you go to the airport and check in for that flight.
 */
import type { MarketId } from '@runway/engine';
import { useState } from 'react';
import { money } from '../../format';
import { t } from '../../i18n';
import { useView } from '../../store';
import {
  airportSchedule,
  destinationsOf,
  fmtFlightTime,
  hereOf,
  isAbroad,
  localMinutes,
  nextFlightTo,
  scheduleDay,
} from '../../city/travel';
import { setTicket, ticketFrom, useTicket } from '../../city/ticket';
import { CABIN_NAME, TripPicker } from '../../city/CabinPicker';
import { HolidayCards } from './Holiday';
import { FlyingWith } from '../../city/companions';
import type { CabinTier, Destination, HotelTier } from '../../city/travel';
import { Icon } from '../icons';
import { Nothing, type PhoneCtx } from '../shared';

export function Travel({ ctx }: { ctx: PhoneCtx }) {
  const { view, cur, send, busy } = useView();
  const here = hereOf(view);
  const dests = destinationsOf(view);
  const month = view.market.month;
  const [{ day, now }] = useState(() => ({
    day: scheduleDay(month),
    now: localMinutes(here.id),
  }));
  const booked = ticketFrom(useTicket(), here.id, dests);
  // The destination whose hotels you're choosing from, before booking.
  const [choosing, setChoosing] = useState<string | null>(null);
  const balance = view.accounts.local?.balance ?? 0;
  if (dests.length === 0)
    return <Nothing icon="travel">{t('No flights from here right now.')}</Nothing>;
  const schedule = airportSchedule(here.id, day);
  const rows = dests
    .map((d) => ({ d, f: nextFlightTo(schedule, d.id, now) }))
    .sort((a, b) => ((a.f?.time ?? '99') < (b.f?.time ?? '99') ? -1 : 1));
  const book = async (d: Destination, hotel: HotelTier | null, cabin: CabinTier = 'economy') => {
    const f = rows.find((r) => r.d.id === d.id)?.f;
    const cmd = {
      type: 'travel.book' as const,
      to: d.id as MarketId,
      ...(hotel ? { hotel } : {}),
      // Economy is the ticket as it always was: only an upgrade goes on the command.
      ...(cabin !== 'economy' ? { cabin } : {}),
      // The flight off the board: friends on holiday from this city get the same one.
      ...(f
        ? { flight: { airline: f.airline, number: f.flight, time: f.time, gate: f.gate } }
        : {}),
    };
    if (!(await send(cmd))) return;
    setChoosing(null);
    const stay = hotel ? d.hotels.find((h) => h.tier === hotel) : undefined;
    const seat = d.cabins.find((c) => c.cabin === cabin);
    setTicket({
      from: here.id,
      to: d.id,
      toName: d.name,
      fare: seat?.price ?? d.fare,
      ...(d.cabins.length ? { cabin } : {}),
      currency: cur,
      hours: d.hours,
      time: f?.time,
      airline: f?.airline,
      flight: f?.flight,
      gate: f?.gate,
      ...(stay ? { hotel: { tier: stay.tier, name: stay.name, paid: stay.price } } : {}),
    });
    ctx.goPlace('airport');
  };
  return (
    <div className="phone-stack">
      {/* Holiday with friends: invitations, your trips with friends, Invite friends. */}
      <HolidayCards goPlace={ctx.goPlace} />
      {booked && (
        <div className="phone-card phone-ticket" data-ticket={booked.to}>
          <div className="spread">
            <span>
              <span className="small muted">{t('Your ticket')}</span>
              <br />
              <b>
                {here.name} → {booked.toName}
              </b>
              <br />
              <span className="small muted">
                {[booked.time, booked.airline, booked.flight].filter(Boolean).join(' · ')}
              </span>
              {booked.cabin && (
                <span
                  className={`small ticket-cabin is-${booked.cabin}`}
                  data-ticket-cabin={booked.cabin}
                >
                  {CABIN_NAME[booked.cabin]()}
                </span>
              )}
              <FlyingWith to={booked.to} />
              {booked.hotel && (
                <span className="small hotel-stay" data-ticket-hotel={booked.hotel.tier}>
                  {t('Hotel: {name}', { name: booked.hotel.name })} ·{' '}
                  {money(booked.hotel.paid, cur)}
                </span>
              )}
            </span>
            <button className="btn btn-primary" onClick={() => ctx.goPlace('airport')}>
              {t('Go to the airport')}
            </button>
          </div>
        </div>
      )}
      {booked && (
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => void send({ type: 'travel.cancel' })}
        >
          Cancel ticket · full refund
        </button>
      )}
      <p className="small muted">
        Flights are charged when booked. Boarding does not charge again.
      </p>
      <p className="small muted">
        {t('Where do you want to go? Choose a flight and book it, then check in at the airport.')}
      </p>
      <ul className="phone-list" aria-label={t('Flights')}>
        {rows.map(({ d, f }) => (
          <li key={d.id} className="phone-card phone-flight" data-flight={d.id}>
            <div className="phone-flight-top">
              <span className="phone-flight-time">{f?.time ?? '—'}</span>
              <Icon name="travel" size={18} />
              <span className="item-title">
                {d.name}
                {isAbroad(view) && d.id === view.market.id && (
                  <span className="small muted"> · {t('home')}</span>
                )}
              </span>
              <span className="phone-flight-fare">{money(d.fare, cur)}</span>
            </div>
            <div className="spread small muted">
              <span>
                {f ? `${f.airline} · ${f.flight}` : ''}
                {d.hours > 0 && d.hours < 40 ? ` · ${fmtFlightTime(d.hours)}` : ''}
              </span>
              <button
                className={`btn ${booked?.to === d.id ? 'btn-primary' : 'btn-subtle'}`}
                disabled={busy || d.done || !!booked}
                aria-label={t('Book a flight to {city}', { city: d.name })}
                // Abroad: the cabin and the hotel; home: the cabin (when the server sells them).
                onClick={() =>
                  d.hotels.length || d.cabins.length ? setChoosing(d.id) : void book(d, null)
                }
              >
                {d.done ? t('Already this month') : booked?.to === d.id ? t('Booked') : t('Book')}
              </button>
            </div>
            {choosing === d.id && !booked && (
              <TripPicker
                city={d.name}
                cabins={d.cabins}
                hotels={d.hotels}
                fare={d.fare}
                currency={cur}
                balance={balance}
                busy={busy}
                onBook={(hotel, cabin) => void book(d, hotel, cabin)}
                onCancel={() => setChoosing(null)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
