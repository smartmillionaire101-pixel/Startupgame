/**
 * Choosing where to stay when you book a flight abroad: a guesthouse, a
 * business hotel or a five-star, priced for the city and for what you have.
 * The best one that still leaves you some money is chosen for you; one tap
 * books the flight and the hotel together. "No hotel" books the flight only.
 */
import { useState } from 'react';
import { money } from '../format';
import { t } from '../i18n';
import { suggestHotel, type HotelOption, type HotelTier } from './travel';
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
  /** The flight, minor units of your home currency. */
  fare: number;
  currency: string;
  /** What's in your personal account. */
  balance: number;
  busy: boolean;
  onBook: (hotel: HotelTier | null) => void;
  onCancel: () => void;
}) {
  const [pick, setPick] = useState<HotelTier | 'none'>(
    () => suggestHotel(hotels, fare, balance) ?? 'none',
  );
  const chosen = hotels.find((h) => h.tier === pick);
  return (
    <div className="hotel-picker" data-hotel-picker={city}>
      <b className="small">{t('Where will you stay in {city}?', { city })}</b>
      <div className="hotel-options" role="radiogroup" aria-label={t('Hotels')}>
        {hotels.map((h) => (
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
