/**
 * The city you're in, for the phone's Map, Rides and Fit apps: the same
 * deterministic layout the City map draws, plus names and colours for places.
 */
import { useMemo } from 'react';
import { t } from '../../i18n';
import { CATEGORY_COLOR, cityInput } from '../../city/contract';
import { findPath, pathLength, travelTiles, type CityInput, type Place } from '../../city/layout';
import { useGeo } from '../../city/geo';
import { buildCityLayout } from '../../city/geoLayout';
import { cityViewOf, isAbroad } from '../../city/travel';
import type { IconName } from '../icons';
import type { View } from '../shared';

export function useCityLayout(view: View) {
  const input = cityInput(cityViewOf(view));
  const key = JSON.stringify(input);
  // Wave 8: the real map when the city has one (null while it loads).
  const geo = useGeo(input.marketId);
  return useMemo(() => {
    if (geo === 'loading') return null;
    try {
      return buildCityLayout(JSON.parse(key) as CityInput, geo);
    } catch {
      return null;
    }
  }, [key, geo]);
}

export function placeName(p: Place, view: View): string {
  const abroad = isAbroad(view);
  const company = view.companies.find((c) => c.status === 'active')?.name ?? null;
  switch (p.kind) {
    case 'office':
      return abroad ? t('Coworking space') : (company ?? t('Your office'));
    case 'home':
      return abroad ? t('Your hotel') : t('Your home');
    case 'hub':
      return t('The Hub');
    case 'airport':
      return t('Airport');
    case 'newsstand':
      return t('Newsstand');
    case 'eventhall':
      return t('Event Hall');
    default:
      return p.name || p.id;
  }
}

/** Colour of a place's dot on the mini map. */
export function placeColor(p: Place): string {
  if (p.kind === 'business' && p.category) return CATEGORY_COLOR[p.category];
  return (
    (
      {
        lender: '#0f766e',
        playerbank: '#0f766e',
        fund: '#4f46e5',
        capital: '#7e22ce',
        stall: '#ea580c',
        hub: '#0891b2',
        office: '#111827',
        home: '#16a34a',
        airport: '#475569',
        newsstand: '#64748b',
        eventhall: '#c026d3',
      } as Partial<Record<Place['kind'], string>>
    )[p.kind] ?? '#64748b'
  );
}

export function placeIcon(p: Place): IconName {
  switch (p.kind) {
    case 'lender':
    case 'playerbank':
      return 'bank';
    case 'fund':
    case 'capital':
      return 'invest';
    case 'home':
      return 'house';
    case 'office':
      return 'founder';
    case 'airport':
      return 'travel';
    case 'newsstand':
      return 'news';
    case 'eventhall':
      return 'social';
    case 'hub':
      return 'people';
    case 'stall':
      return 'shop';
    default:
      return 'pin';
  }
}

/** Tiles along the streets from where you usually start to a place (an estimate). */
export function tilesTo(layout: NonNullable<ReturnType<typeof useCityLayout>>, p: Place): number {
  try {
    return Math.max(1, travelTiles(layout, pathLength(findPath(layout, layout.start, p.door))));
  } catch {
    return Math.hypot(p.door.x - layout.start.x, p.door.y - layout.start.y);
  }
}
