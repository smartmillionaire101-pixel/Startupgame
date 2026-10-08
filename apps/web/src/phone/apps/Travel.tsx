/**
 * Travel: where you can fly from the city you're in, with the departure
 * time, airline, flight number, flight time and fare. You choose where to go
 * and book first (Wave 12: the fare is charged when you book); then you go
 * to the airport and check in for that flight. A ticket can be cancelled
 * before it leaves, for a refund minus a small fee.
 */
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
  scheduleDay,
} from '../../city/travel';
import { bookCommand, nextBookable, ticketFrom, useTicket } from '../../city/ticket';
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
  const ticket = useTicket();
  const booked = ticketFrom(ticket, here.id, dests);
  const held = ticket && ticket.status === 'valid' ? ticket : null;
  if (dests.length === 0)
    return <Nothing icon="travel">{t('No flights from here right now.')}</Nothing>;
  const schedule = airportSchedule(here.id, day);
  const rows = dests
    .map((d) => ({ d, f: nextBookable(schedule, d.id, now) }))
    .sort((a, b) => ((a.f?.time ?? '99') < (b.f?.time ?? '99') ? -1 : 1));
  const cancel = () =>
    void send<{ refund: number; currency: string }>({ type: 'travel.cancel' }, (r) =>
      t('Ticket cancelled: {amount} refunded.', { amount: money(r.refund, r.currency) }),
    );
  return (
    <div className="phone-stack">
      {held && (
        <div className="phone-card phone-ticket" data-ticket={held.to}>
          <div className="spread">
            <span>
              <span className="small muted">{t('Your ticket')}</span>
              <br />
              <b>
                {held.from === here.id ? here.name : held.from} → {held.toName}
              </b>
              <br />
              <span className="small muted">
                {[held.time, held.airline, held.flight].filter(Boolean).join(' · ')}
              </span>
              <br />
              <span className="small" data-ticket-paid>
                {t('Paid {amount}', { amount: money(held.fare, held.currency || cur) })}
              </span>
            </span>
            {booked && (
              <button className="btn btn-primary" onClick={() => ctx.goPlace('airport')}>
                {t('Go to the airport')}
              </button>
            )}
          </div>
          <button
            className="btn btn-ghost"
            disabled={busy}
            aria-label={t('Cancel your ticket to {city}', { city: held.toName })}
            onClick={cancel}
          >
            {t('Cancel ticket · {amount} back', {
              amount: money(held.refund, held.currency || cur),
            })}
          </button>
        </div>
      )}
      {ticket?.status === 'missed' && (
        <p className="phone-card small" data-ticket-missed={ticket.to}>
          {t('You missed your flight to {city}. The fare isn’t refunded.', {
            city: ticket.toName,
          })}
        </p>
      )}
      <p className="small muted">
        {held
          ? t('Cancel your ticket to change flights.')
          : t(
              'Where do you want to go? Book a flight (the fare is charged now), then check in at the airport.',
            )}
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
                disabled={d.done || busy || (!!held && held.to !== d.id)}
                aria-label={t('Book a flight to {city}', { city: d.name })}
                onClick={async () => {
                  if (booked?.to === d.id) {
                    ctx.goPlace('airport');
                    return;
                  }
                  const r = await send<{ charged: number; currency: string }>(
                    bookCommand(here.id, d, month, Date.now(), f),
                    (r) => t('Booked: {amount} charged.', { amount: money(r.charged, r.currency) }),
                  );
                  if (r) ctx.goPlace('airport');
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
