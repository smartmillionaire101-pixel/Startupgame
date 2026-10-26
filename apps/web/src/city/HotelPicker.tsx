/**
 * Choosing where to stay when you book a flight abroad: a guesthouse, a
 * business hotel or a five-star, priced for the city and for what you have.
 * The best one that still leaves you some money is chosen for you; one tap
 * books the flight and the hotel together. "No hotel" books the flight only.
 * With the feedback round the city's named hotels are listed instead
 * (./HotelList): book one, or just the flight.
 */
import { useState } from 'react';
import { money } from '../format';
import { t } from '../i18n';
import { HotelList } from './HotelList';
import {
  suggestHotel,
  suggestNamedHotel,
  type HotelOption,
  type HotelTier,
  type NamedHotel,
} from './travel';
import './hotels.css';

const BLURB: Record<HotelTier, () => string> = {
  budget: () => t('Clean and simple'),
  business: () => t('Near the business district'),
  luxury: () => t('Five stars'),
};

export const HOTEL_STARS: Record<HotelTier, string> = {
  budget: '★',
  business: '★★★',
  luxury: '★★★★★',
};

export function HotelPicker({
  city,
  marketId = '',
  hotels,
  named = [],
  fare,
  currency,
  balance,
  busy,
  onBook,
  onCancel,
}: {
  city: string;
  /** The destination (the named hotels' map). */
  marketId?: string;
  hotels: HotelOption[];
  /** The city's named hotels (the feedback round; empty: the three tiers). */
  named?: NamedHotel[];
  /** The flight, minor units of your home currency. */
  fare: number;
  currency: string;
  /** What's in your personal account. */
  balance: number;
  busy: boolean;
  /** A tier, and with the feedback round the named hotel (its room tier). */
  onBook: (hotel: HotelTier | null, hotelId?: string) => void;
  onCancel: () => void;
}) {
  if (named.length > 0)
    return (
      <NamedPicker
        {...{ city, marketId, named, fare, currency, balance, busy, onBook, onCancel }}
      />
    );
  return <TierPicker {...{ city, hotels, fare, currency, balance, busy, onBook, onCancel }} />;
}

/**
 * The feedback round: the city's named hotels to choose from, the best one
 * that still leaves you some money chosen for you; one tap books the flight
 * and that hotel, or choose no hotel for the flight only.
 */
function NamedPicker({
  city,
  marketId,
  named,
  fare,
  currency,
  balance,
  busy,
  onBook,
  onCancel,
}: {
  city: string;
  marketId: string;
  named: NamedHotel[];
  fare: number;
  currency: string;
  balance: number;
  busy: boolean;
  onBook: (hotel: HotelTier | null, hotelId?: string) => void;
  onCancel: () => void;
}) {
  // Affordable with this fare (business and first cost more than the server's economy check).
  const options = named.map((h) => ({ ...h, affordable: balance >= fare + h.price }));
  const [pick, setPick] = useState<string | null>(() => suggestNamedHotel(options, fare, balance));
  const chosen = options.find((h) => h.id === pick && h.affordable);
  return (
    <div className="hotel-picker" data-hotel-picker={city}>
      <b className="small">{t('Stay in {city}', { city })}</b>
      <HotelList
        city={city}
        marketId={marketId}
        hotels={options}
        currency={currency}
        fare={fare}
        balance={balance}
        busy={busy}
        picked={chosen?.id ?? null}
        choose
        onBook={(h) => setPick(h.id)}
      />
      <button
        type="button"
        className={`btn ${chosen ? 'btn-ghost' : 'btn-subtle'}`}
        aria-pressed={!chosen}
        data-hotel-none=""
        onClick={() => setPick(null)}
      >
        {t('No hotel')} · {t('Just the flight')}
      </button>
      <div className="hotel-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          data-hotel-book={chosen?.id ?? 'none'}
          onClick={() => onBook(chosen ? chosen.tier : null, chosen?.id)}
        >
          {chosen
            ? t('Book flight + hotel · {total}', { total: money(fare + chosen.price, currency) })
            : t('Book flight · {total}', { total: money(fare, currency) })}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t('Back')}
        </button>
      </div>
    </div>
  );
}

/** The three hotels a city had before the named ones: a guesthouse, a business hotel, a five-star. */
function TierPicker({
  city,
  hotels,
  fare,
  currency,
  balance,
  busy,
  onBook,
  onCancel,
}: {
  city: string;
  hotels: HotelOption[];
  fare: number;
  currency: string;
  balance: number;
  busy: boolean;
  onBook: (hotel: HotelTier | null) => void;
  onCancel: () => void;
}) {
  // Affordable with this fare (business and first cost more than the server's economy check).
  const options = hotels.map((h) => ({
    ...h,
    affordable: h.affordable && balance >= fare + h.price,
  }));
  const [pick, setPick] = useState<HotelTier | 'none'>(
    () => suggestHotel(options, fare, balance) ?? 'none',
  );
  const chosen = options.find((h) => h.tier === pick);
  return (
    <div className="hotel-picker" data-hotel-picker={city}>
      <b className="small">{t('Stay in {city}', { city })}</b>
      <div className="hotel-options" role="radiogroup" aria-label={t('Hotels')}>
        {options.map((h) => (
          <label
            key={h.tier}
            className={`hotel-option${pick === h.tier ? ' is-picked' : ''}${h.affordable ? '' : ' is-off'}`}
            data-hotel={h.tier}
          >
            <input
              type="radio"
              name={`hotel-${city}`}
              value={h.tier}
              checked={pick === h.tier}
              disabled={!h.affordable}
              onChange={() => setPick(h.tier)}
            />
            <span className="hotel-main">
              <span className="hotel-name">{h.name}</span>
              <span className="small muted">
                <span aria-hidden="true">{HOTEL_STARS[h.tier]} </span>
                {h.affordable ? BLURB[h.tier]() : t('Can’t afford')}
              </span>
            </span>
            <span className="hotel-price">{money(h.price, currency)}</span>
          </label>
        ))}
        <label className={`hotel-option${pick === 'none' ? ' is-picked' : ''}`} data-hotel="none">
          <input
            type="radio"
            name={`hotel-${city}`}
            value="none"
            checked={pick === 'none'}
            onChange={() => setPick('none')}
          />
          <span className="hotel-main">
            <span className="hotel-name">{t('No hotel')}</span>
            <span className="small muted">{t('Just the flight')}</span>
          </span>
          <span className="hotel-price">{money(0, currency)}</span>
        </label>
      </div>
      <div className="hotel-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          data-hotel-book
          onClick={() => onBook(chosen ? chosen.tier : null)}
        >
          {chosen
            ? t('Book flight + hotel · {total}', { total: money(fare + chosen.price, currency) })
            : t('Book flight · {total}', { total: money(fare, currency) })}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t('Back')}
        </button>
      </div>
    </div>
  );
}
