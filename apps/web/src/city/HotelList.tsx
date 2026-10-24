/**
 * A city's named hotels (the feedback round: "More hotel options in
 * different parts of the city"): a small map of the city with a price pin
 * per hotel, area and price filters, and a card per hotel with its stars,
 * district, distance from the centre, room and price a night. Booking one
 * books the flight and the stay together (the room is one of the three
 * hotel rooms: the hotel decides which).
 */
import { useMemo, useState } from 'react';
import { money } from '../format';
import { t, tx } from '../i18n';
import { planOf } from './plans';
import type { NamedHotel } from './travel';
import './hotels.css';

type Band = 'any' | 'low' | 'mid' | 'high';
type Sort = 'nearest' | 'price';

/** Gradients for the hotel tiles, one per district (by a hash of its id). */
const TILES: readonly [string, string][] = [
  ['#b45309', '#78350f'],
  ['#7c3aed', '#4c1d95'],
  ['#0369a1', '#0c4a6e'],
  ['#0f766e', '#134e4a'],
  ['#be123c', '#881337'],
  ['#15803d', '#14532d'],
  ['#475569', '#1e293b'],
  ['#a16207', '#713f12'],
];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const tileOf = (district: string) => TILES[hash(district) % TILES.length]!;

/** A round number near v (two significant figures), for the price filter bands. */
function nice(v: number): number {
  if (v <= 0) return 0;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / step) * step;
}

/** The two price breaks: a third of the hotels under the first, a third over the second. */
function bandsOf(hotels: NamedHotel[]): [number, number] {
  const p = hotels.map((h) => h.night).sort((a, b) => a - b);
  if (!p.length) return [0, 0];
  const lo = nice(p[Math.floor(p.length / 3)]!);
  const hi = nice(p[Math.floor((2 * p.length) / 3)]!);
  return [lo, Math.max(hi, lo + 1)];
}

const inBand = (h: NamedHotel, band: Band, [lo, hi]: [number, number]) =>
  band === 'any' ||
  (band === 'low' && h.night < lo) ||
  (band === 'mid' && h.night >= lo && h.night < hi) ||
  (band === 'high' && h.night >= hi);

export function Stars({ n }: { n: number }) {
  return (
    <span className="hotel-stars" role="img" aria-label={t('{n} stars', { n })}>
      {'★'.repeat(n)}
      <span className="hotel-stars-off">{'★'.repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}

/**
 * The city's plan as a thumbnail: each district a soft block with its name,
 * the water on its side, and a price pin for each hotel shown.
 */
function HotelMap({
  marketId,
  hotels,
  currency,
  picked,
}: {
  marketId: string;
  hotels: NamedHotel[];
  currency: string;
  picked: string | null;
}) {
  const plan = planOf(marketId);
  if (!plan) return null;
  const W = 330;
  const H = 130;
  const ds = plan.districts;
  const minX = Math.min(...ds.map((d) => d.at[0]));
  const minY = Math.min(...ds.map((d) => d.at[1]));
  const maxX = Math.max(...ds.map((d) => d.at[0] + d.size[0]));
  const maxY = Math.max(...ds.map((d) => d.at[1] + d.size[1]));
  const pad = 14;
  const sx = (W - 2 * pad) / Math.max(1, maxX - minX);
  const sy = (H - 2 * pad) / Math.max(1, maxY - minY);
  const box = (d: (typeof ds)[number]) => ({
    x: pad + (d.at[0] - minX) * sx,
    y: pad + (d.at[1] - minY) * sy,
    w: d.size[0] * sx,
    h: d.size[1] * sy,
  });
  const byId = new Map(ds.map((d) => [d.id, box(d)]));
  const side = plan.water?.side;
  const water =
    side === 'south'
      ? { x: 0, y: H - 14, w: W, h: 14 }
      : side === 'north'
        ? { x: 0, y: 0, w: W, h: 12 }
        : side === 'east'
          ? { x: W - 12, y: 0, w: 12, h: H }
          : side === 'west'
            ? { x: 0, y: 0, w: 12, h: H }
            : null;
  // Pins in the same district stand side by side.
  const seen = new Map<string, number>();
  const pins = hotels.flatMap((h) => {
    const b = byId.get(h.district);
    if (!b) return [];
    const k = seen.get(h.district) ?? 0;
    seen.set(h.district, k + 1);
    const x = b.x + b.w / 2 + ((k % 2) * 2 - 1) * (k ? 20 : 0);
    const y = b.y + b.h / 2 + Math.floor(k / 2) * 17 - (k ? 6 : 0);
    return [{ h, x: Math.max(18, Math.min(W - 18, x)), y: Math.max(22, Math.min(H - 4, y)) }];
  });
  return (
    <svg
      className="hotel-map"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={t('Map of the hotels')}
      data-hotel-map=""
    >
      <rect width={W} height={H} rx="10" fill="#eae3d6" />
      {water && <rect {...water} fill="#9fc6d8" />}
      {ds.map((d) => {
        const b = box(d);
        return (
          <g key={d.id}>
            <rect
              x={b.x + 2}
              y={b.y + 2}
              width={Math.max(0, b.w - 4)}
              height={Math.max(0, b.h - 4)}
              rx="5"
              fill={d.kind === 'park' ? '#c7dfb4' : '#f4efe6'}
              stroke="#fffdf9"
              strokeWidth="2"
            />
            <text
              x={b.x + 6}
              y={b.y + b.h - 6}
              fontSize="7"
              fill="#655c52"
              style={{ textTransform: 'uppercase' }}
            >
              {d.name}
            </text>
          </g>
        );
      })}
      {pins.map(({ h, x, y }) => (
        <g
          key={h.id}
          transform={`translate(${x},${y})`}
          data-hotel-pin={h.id}
          className={picked === h.id ? 'is-picked' : undefined}
        >
          <rect x="-21" y="-19" width="42" height="15" rx="7.5" />
          <text x="0" y="-8" fontSize="8.5" textAnchor="middle" fontWeight="700">
            {money(h.night, currency)}
          </text>
          <path d="M-4 -4 L0 1 L4 -4z" />
        </g>
      ))}
    </svg>
  );
}

export function HotelList({
  city,
  marketId,
  hotels,
  currency,
  fare,
  balance,
  busy,
  picked = null,
  choose = false,
  onBook,
}: {
  city: string;
  marketId: string;
  hotels: NamedHotel[];
  currency: string;
  /** The flight booked with the stay (0 when you're already there). */
  fare: number;
  balance: number;
  busy: boolean;
  /** The hotel you've booked (its card says so). */
  picked?: string | null;
  /**
   * Choosing (the flight's trip picker): each card picks its hotel and the
   * picker's own button books. Otherwise each card books straight away.
   */
  choose?: boolean;
  onBook: (h: NamedHotel) => void;
}) {
  const [area, setArea] = useState<string>('all');
  const [band, setBand] = useState<Band>('any');
  const [sort, setSort] = useState<Sort>('nearest');
  const breaks = useMemo(() => bandsOf(hotels), [hotels]);
  const areas = useMemo(() => {
    const out = new Map<string, string>();
    for (const h of [...hotels].sort((a, b) => a.km - b.km)) out.set(h.district, h.area);
    return [...out];
  }, [hotels]);
  const shown = hotels
    .filter((h) => (area === 'all' || h.district === area) && inBand(h, band, breaks))
    .sort((a, b) => (sort === 'nearest' ? a.km - b.km : a.night - b.night));
  const nights = hotels[0]?.nights ?? 3;
  const fmt = (v: number) => money(v, currency);
  return (
    <div className="hotel-list" data-hotel-list={marketId}>
      <div className="spread">
        <b>{t('{city} · {n} nights', { city, n: nights })}</b>
        <span className="small muted">{t('{n} hotels', { n: hotels.length })}</span>
      </div>
      <HotelMap marketId={marketId} hotels={shown} currency={currency} picked={picked} />
      <div className="hotel-filters chips" role="group" aria-label={t('Area')}>
        <button
          type="button"
          className="chip"
          aria-pressed={area === 'all'}
          onClick={() => setArea('all')}
        >
          {t('All areas')}
        </button>
        {areas.map(([id, name]) => (
          <button
            key={id}
            type="button"
            className="chip"
            aria-pressed={area === id}
            data-hotel-area={id}
            onClick={() => setArea(id)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="hotel-filters chips" role="group" aria-label={t('Price a night')}>
        {(
          [
            ['any', t('Any price')],
            ['low', t('Under {price}', { price: fmt(breaks[0]) })],
            ['mid', t('{low}–{high}', { low: fmt(breaks[0]), high: fmt(breaks[1]) })],
            ['high', t('{price}+', { price: fmt(breaks[1]) })],
          ] as [Band, string][]
        ).map(([b, label]) => (
          <button
            key={b}
            type="button"
            className="chip"
            aria-pressed={band === b}
            data-hotel-band={b}
            onClick={() => setBand(b)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          data-hotel-sort={sort}
          onClick={() => setSort(sort === 'nearest' ? 'price' : 'nearest')}
        >
          {sort === 'nearest' ? t('Sort: nearest') : t('Sort: cheapest')}
        </button>
      </div>
      {shown.length === 0 && (
        <p className="small muted">{t('No hotels match. Try another area or price.')}</p>
      )}
      <ul className="hotel-cards" aria-label={t('Hotels in {city}', { city })}>
        {shown.map((h) => {
          const [a, b] = tileOf(h.district);
          const affordable = h.affordable ?? balance >= fare + h.price;
          const mine = picked === h.id;
          return (
            <li
              key={h.id}
              className={`hotel-card${mine ? ' is-picked' : ''}`}
              data-hotel-id={h.id}
              data-hotel-room={h.tier}
            >
              <div
                className="hotel-tile"
                style={{ background: `linear-gradient(150deg, ${a}, ${b})` }}
                aria-hidden="true"
              >
                <i>{h.area}</i>
              </div>
              <div className="hotel-body">
                <div className="hotel-top">
                  <b className="hotel-name">{h.name}</b>
                  <span className="hotel-price">
                    {fmt(h.night)}
                    <small>{t('a night')}</small>
                  </span>
                </div>
                <Stars n={h.stars} />
                <span className="small muted">
                  <span aria-hidden="true">📍 </span>
                  {t('{area} · {km} km from the centre', { area: h.area, km: h.km })}
                </span>
                <div className="spread small">
                  <span>
                    <span aria-hidden="true">🛏 </span>
                    {tx(h.room)}
                  </span>
                  <button
                    type="button"
                    className={`btn btn-sm ${mine ? 'btn-primary' : 'btn-subtle'}`}
                    disabled={busy || !affordable || (!choose && !!picked)}
                    aria-pressed={choose ? mine : undefined}
                    aria-label={
                      choose
                        ? t('Choose {name}', { name: h.name })
                        : t('Book {name}', { name: h.name })
                    }
                    data-hotel-book-id={h.id}
                    onClick={() => onBook(h)}
                  >
                    {!affordable
                      ? t('Can’t afford')
                      : choose
                        ? mine
                          ? t('Chosen')
                          : t('Choose')
                        : mine
                          ? t('Booked')
                          : t('Book')}
                  </button>
                </div>
                <span className="small muted" data-hotel-total="">
                  {fare > 0
                    ? t('{n} nights {stay} · with the flight {total}', {
                        n: h.nights,
                        stay: fmt(h.price),
                        total: fmt(fare + h.price),
                      })
                    : t('{n} nights {stay}', { n: h.nights, stay: fmt(h.price) })}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
