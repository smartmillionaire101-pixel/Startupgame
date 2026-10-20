/**
 * Choosing your cabin when you book a flight (player feedback: "I should
 * choose which class I want: economy, business and first class, because
 * remember we have lifestyle in the game"). The three side by side, each with
 * its fare, what you get and how you'll land; one you can't afford is greyed
 * out. Then, abroad, the hotel (./HotelPicker); flying home, just the flight.
 */
import { useState } from 'react';
import { money } from '../format';
import { t } from '../i18n';
import { HotelPicker } from './HotelPicker';
import type { CabinOption, CabinTier, HotelOption, HotelTier } from './travel';
import './hotels.css';

export const CABIN_NAME: Record<CabinTier, () => string> = {
  economy: () => t('Economy'),
  business: () => t('Business'),
  first: () => t('First class'),
};

const CABIN_ICON: Record<CabinTier, string> = { economy: '💺', business: '🛋️', first: '🥂' };

/** What each cabin gives you, in a few words. */
const PERKS: Record<CabinTier, () => string[]> = {
  economy: () => [t('Standard seat'), t('Meal on a tray'), t('Queues at the airport')],
  business: () => [
    t('Lie-flat seat'),
    t('Lounge access'),
    t('Priority boarding'),
    t('Amenity kit'),
  ],
  first: () => [
    t('Private suite with a bed'),
    t('Lounge access'),
    t('Champagne and caviar'),
    t('Chauffeur on arrival'),
  ],
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

export function CabinPicker({
  cabins,
  currency,
  pick,
  onPick,
  name,
}: {
  cabins: CabinOption[];
  currency: string;
  pick: CabinTier;
  onPick: (c: CabinTier) => void;
  /** The radio group's name (unique per destination). */
  name: string;
}) {
  return (
    <div className="cabin-options" role="radiogroup" aria-label={t('Cabin class')}>
      {cabins.map((c) => (
        <label
          key={c.cabin}
          className={`cabin-option cabin-${c.cabin}${pick === c.cabin ? ' is-picked' : ''}${c.affordable ? '' : ' is-off'}`}
          data-cabin-option={c.cabin}
        >
          <input
            type="radio"
            name={name}
            value={c.cabin}
            checked={pick === c.cabin}
            disabled={!c.affordable}
            onChange={() => onPick(c.cabin)}
          />
          <span className="cabin-head">
            <span aria-hidden="true">{CABIN_ICON[c.cabin]}</span> <b>{CABIN_NAME[c.cabin]()}</b>
          </span>
          <span className="cabin-price">{money(c.price, currency)}</span>
          <ul className="cabin-perks">
            {PERKS[c.cabin]().map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <span className="cabin-land small">{landing(c)}</span>
          {c.hours > 0 && (
            <span className="cabin-hours small muted">
              {t('{h}h lost at the airport', { h: c.hours })}
            </span>
          )}
          {!c.affordable && <span className="cabin-off small">{t('Can’t afford')}</span>}
        </label>
      ))}
    </div>
  );
}

/** The cabin, then (abroad) the hotel, then one button that books them. */
export function TripPicker({
  city,
  cabins,
  hotels,
  fare,
  currency,
  balance,
  busy,
  onBook,
  onCancel,
}: {
  city: string;
  /** Empty from an older server: economy only, the fare as it is. */
  cabins: CabinOption[];
  hotels: HotelOption[];
  /** The economy fare, minor units of your home currency. */
  fare: number;
  currency: string;
  balance: number;
  busy: boolean;
  onBook: (hotel: HotelTier | null, cabin: CabinTier) => void;
  onCancel: () => void;
}) {
  const [cabin, setCabin] = useState<CabinTier>('economy');
  const chosen = cabins.find((c) => c.cabin === cabin);
  const price = chosen?.price ?? fare;
  return (
    <div className="trip-picker" data-trip-picker={city}>
      {cabins.length > 0 && (
        <>
          <b className="small">{t('How do you want to fly to {city}?', { city })}</b>
          <CabinPicker
            cabins={cabins}
            currency={currency}
            pick={cabin}
            onPick={setCabin}
            name={`cabin-${city}`}
          />
        </>
      )}
      {hotels.length > 0 ? (
        // A new suggestion for each cabin: what's left after the fare changes.
        <HotelPicker
          key={cabin}
          city={city}
          hotels={hotels}
          fare={price}
          currency={currency}
          balance={balance}
          busy={busy || (!!chosen && !chosen.affordable)}
          onBook={(hotel) => onBook(hotel, cabin)}
          onCancel={onCancel}
        />
      ) : (
        <div className="hotel-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || (!!chosen && !chosen.affordable)}
            data-cabin-book
            onClick={() => onBook(null, cabin)}
          >
            {t('Book flight · {total}', { total: money(price, currency) })}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t('Back')}
          </button>
        </div>
      )}
    </div>
  );
}
