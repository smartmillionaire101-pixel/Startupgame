/**
 * Skydives and helicopter rides (the more-games release), opened with
 * `openAir` (./air-bus.ts): first the booking (the options here, their price
 * and the standard of living each needs), then the flight full screen
 * (./AirFlight.tsx, loaded with three.js on demand).
 */
import { Suspense, lazy, useEffect, useState, useSyncExternalStore } from 'react';
import { t, tx } from '../../i18n';
import { money } from '../../format';
import { useView } from '../../store';
import { cover } from '../../three-kit/cover';
import { lifestyleName } from '../../city/wave10';
import { hereOf } from '../../city/travel';
import { airOpen, closeAir, onAir, type AirRequest } from './air-bus';
import type { AirBooking } from './AirFlight';
import './air.css';
import '../experiences.css';

const AirFlight = lazy(() => import('./AirFlight'));

export default function AirHost() {
  const req = useSyncExternalStore(onAir, airOpen, () => null);
  return req ? <AirRoom key={`${req.kind}:${req.itemId ?? ''}`} req={req} /> : null;
}

function AirRoom({ req }: { req: AirRequest }) {
  const { view, send, busy } = useView();
  const [booked, setBooked] = useState<AirBooking | null>(null);
  useEffect(() => cover(), []);
  const city = hereOf(view).id;
  const games = view.me.games;
  const venue = req.kind === 'skydive' ? games?.skydive : games?.heli;
  const cur = games?.currency ?? view.market.currency;
  const pocket = view.accounts.local?.balance ?? 0;

  if (booked)
    return (
      <div className="experience-backdrop air-host">
        <Suspense
          fallback={
            <div className="air">
              <p className="panorama-loading">{t('Getting ready…')}</p>
            </div>
          }
        >
          <AirFlight booking={booked} city={city} onClose={closeAir} />
        </Suspense>
      </div>
    );

  const book = async (itemId: string) => {
    if (!venue) return;
    const r = await send<{ bookingId: string; price: number; kind: 'skydive' | 'heli' }>({
      type: 'games.book',
      businessId: venue.businessId,
      itemId,
    });
    if (!r) return;
    setBooked({
      kind: req.kind,
      item: itemId,
      bookingId: r.bookingId,
      businessId: venue.businessId,
      venueName: venue.name,
      price: r.price,
      currency: cur,
    });
  };

  return (
    <div className="experience-backdrop">
      <section
        className="experience-shell air-book"
        role="dialog"
        aria-modal="true"
        aria-label={req.kind === 'skydive' ? t('Book a skydive') : t('Book a helicopter ride')}
        data-air-book={req.kind}
      >
        <header className="experience-header">
          <div>
            <small>{venue?.name ?? ''}</small>
            <h1>
              {req.kind === 'skydive'
                ? t('Jump over {city}', { city: hereOf(view).name })
                : t('{city} from the air', { city: hereOf(view).name })}
            </h1>
          </div>
          <button className="experience-close" onClick={closeAir} aria-label={t('Close')}>
            ×
          </button>
        </header>
        <p className="experience-note">
          {req.kind === 'skydive'
            ? t(
                'Up to 4,000 m in the jump plane, out of the door, a minute of freefall over the real city, then the canopy down to the target. Your landing is scored.',
              )
            : t(
                'Lift off from the heliport and fly past the city’s landmarks with the pilot’s commentary. Take the controls for a while if you like.',
              )}
        </p>
        {!venue ? (
          <p>{t('There’s nowhere to do this in this city yet.')}</p>
        ) : (
          <ul className="air-options">
            {venue.items.map((it) => (
              <li key={it.id} data-air-item={it.id} className={it.locked ? 'is-locked' : ''}>
                <span className="going-main">
                  <b>{tx(it.label)}</b>
                  <span className="small muted">
                    {it.locked
                      ? t('Unlocks at standard of living {n} ({name})', {
                          n: it.requiresTier,
                          name: lifestyleName(view, it.requiresTier),
                        })
                      : t('{price} · {n} hours', { price: money(it.price, cur), n: it.hours })}
                  </span>
                </span>
                <button
                  type="button"
                  className="experience-primary"
                  data-action="air-book"
                  disabled={busy || it.locked || pocket < it.price}
                  onClick={() => void book(it.id)}
                >
                  {it.locked ? '🔒' : t('Book · {price}', { price: money(it.price, cur) })}
                </button>
              </li>
            ))}
          </ul>
        )}
        {req.kind === 'skydive' && games && games.you.jumps > 0 && (
          <p className="small">
            {t('Jumps: {n} · your best score: {best}', {
              n: games.you.jumps,
              best: games.you.bestJump,
            })}
          </p>
        )}
      </section>
    </div>
  );
}
