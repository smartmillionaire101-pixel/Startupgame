/**
 * Rides (Bolt style): pick where to, see walk / bike / transit / taxi with
 * time, fare and effort, and Book. A bus or taxi is paid with `city.ride`;
 * then the City takes you there by that mode (`visitPlace(place, mode)`).
 */
import { useMemo, useState } from 'react';
import type { Command } from '@runway/engine';
import { api, ApiError } from '../../api';
import { money } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import { rideLabel } from '../../city/Transport';
import {
  cityViewOf,
  rememberRide,
  RIDE_MODES,
  rideDistance,
  rideFare,
  rideMinutes,
  type RideMode,
} from '../../city/travel';
import { visitPlace } from '../../city/goto';
import type { Place } from '../../city/layout';
import { Icon, type IconName } from '../icons';
import { H, Nothing, RowIcon, type PhoneCtx } from '../shared';
import { placeColor, placeIcon, placeName, tilesTo, useCityLayout } from './city';

const MODE_ICON: Record<RideMode, IconName> = {
  walk: 'walk',
  cycle: 'cycle',
  bus: 'bus',
  taxi: 'taxi',
};

const effort = (m: RideMode, tiles: number) =>
  m === 'walk'
    ? tiles > 25
      ? t('Tiring')
      : t('Some effort')
    : m === 'cycle'
      ? t('Some effort')
      : t('Restful');

export function Rides({ ctx }: { ctx: PhoneCtx }) {
  const { view, toast, refresh } = useView();
  const city = cityViewOf(view).market;
  const layout = useCityLayout(view);
  const [q, setQ] = useState('');
  const [to, setTo] = useState<Place | null>(null);
  const [mode, setMode] = useState<RideMode>('taxi');
  const [busy, setBusy] = useState(false);
  const places = useMemo(
    () =>
      (layout?.places ?? [])
        .filter((p) => !p.soon && p.kind !== 'stall')
        .map((p) => ({ p, name: placeName(p, view) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [layout, view],
  );
  if (!layout)
    return <Nothing icon="rides">{t('The city map isn’t available right now.')}</Nothing>;

  if (!to) {
    const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
    const shown = places.filter((x) => match(x.name)).slice(0, 60);
    return (
      <div className="phone-stack">
        <div className="phone-where">
          <Icon name="pin" size={18} />
          <input
            type="search"
            aria-label={t('Where to?')}
            placeholder={t('Where to?')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <ul className="phone-list" aria-label={t('Places')}>
          {shown.map(({ p, name }) => (
            <li key={p.id}>
              <button className="phone-row" data-place={p.id} onClick={() => setTo(p)}>
                <RowIcon name={placeIcon(p)} color={placeColor(p)} />
                <span className="phone-row-main">
                  <span className="item-title">{name}</span>
                </span>
                <Icon name="chevron" size={16} />
              </button>
            </li>
          ))}
        </ul>
        {shown.length === 0 && <Nothing>{t('Nothing matches.')}</Nothing>}
      </div>
    );
  }

  const tiles = tilesTo(layout, to);
  const fare = (m: RideMode) => rideFare(m, tiles, city.costOfLiving);
  const book = async () => {
    if (mode === 'bus' || mode === 'taxi') {
      setBusy(true);
      try {
        await api.command({
          type: 'city.ride',
          mode,
          distance: rideDistance(tiles),
        } as unknown as Command);
        void refresh();
      } catch (e) {
        // A server without rides yet: the ride is free.
        if (!(e instanceof ApiError && e.code === 'command.unknown')) {
          setBusy(false);
          toast(e instanceof Error ? tx(e.message) : t('Something went wrong.'), 'error');
          return;
        }
      }
      setBusy(false);
    }
    rememberRide(mode);
    visitPlace(to.id, mode);
    ctx.close();
  };
  return (
    <div className="phone-stack">
      <section className="phone-card phone-trip">
        <div className="phone-trip-line">
          <span className="phone-trip-dot from" />
          <span className="small muted">{t('From where you are')}</span>
        </div>
        <div className="phone-trip-line">
          <span className="phone-trip-dot to" />
          <span className="item-title">{placeName(to, view)}</span>
          <button className="phone-link" onClick={() => setTo(null)}>
            {t('Change')}
          </button>
        </div>
      </section>
      <H>{t('Choose a ride')}</H>
      <ul className="phone-rides" role="radiogroup" aria-label={t('Choose a ride')}>
        {RIDE_MODES.map((m) => (
          <li key={m}>
            <button
              className="phone-ride"
              role="radio"
              aria-checked={mode === m}
              data-mode={m}
              onClick={() => setMode(m)}
            >
              <span className="phone-ride-icon">
                <Icon name={MODE_ICON[m]} size={24} />
              </span>
              <span className="phone-row-main">
                <span className="item-title">{rideLabel(m, city.id)}</span>
                <span className="small muted">
                  {t('{n} min', { n: rideMinutes(m, tiles) })} · {effort(m, tiles)}
                </span>
              </span>
              <span className="phone-ride-fare">
                {fare(m) ? money(fare(m), city.currency) : t('Free')}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Button onClick={() => void book()} disabled={busy}>
        {t('Book {ride}', { ride: rideLabel(mode, city.id) })}
      </Button>
    </div>
  );
}
