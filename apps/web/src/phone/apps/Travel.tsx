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
  if (dests.length === 0)
    return <Nothing icon="travel">{t('No flights from here right now.')}</Nothing>;
  const schedule = airportSchedule(here.id, day);
  const rows = dests
    .map((d) => ({ d, f: nextFlightTo(schedule, d.id, now) }))
    .sort((a, b) => ((a.f?.time ?? '99') < (b.f?.time ?? '99') ? -1 : 1));
  return (
    <div className="phone-stack">
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
                onClick={async () => {
                  if (!(await send({ type: 'travel.book', to: d.id as MarketId }))) return;
                  setTicket({
                    from: here.id,
                    to: d.id,
                    toName: d.name,
                    fare: d.fare,
                    currency: cur,
                    hours: d.hours,
                    time: f?.time,
                    airline: f?.airline,
                    flight: f?.flight,
                    gate: f?.gate,
                  });
                  ctx.goPlace('airport');
                }}
              >
                {d.done ? t('Already this month') : booked?.to === d.id ? t('Booked') : t('Book')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
