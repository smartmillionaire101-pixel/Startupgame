/**
 * Wave 12, dev tools only: walk round any kind of home at any wealth band,
 * furnished and with a garage full of cars, without buying it. It opens the
 * home scene the way a friend's home opens (read-only), so designers and the
 * screenshot specs can see a studio, a villa or a mansion side by side.
 */
import { useMemo, useState } from 'react';
import { t } from '../i18n';
import { Button } from '../ui';
import { HOME_SLOTS } from '../city/life';
import type { Place } from '../city/layout';
import { HomeScene, type HostView } from './HomeScene';
import { TIER_OF_KIND, type HomeKind } from './layout';
import type { HotelTier } from '../city/travel';

const HOTELS: { id: HotelTier; label: string; name: string }[] = [
  { id: 'budget', label: 'Hotel: budget', name: 'Camden Guesthouse' },
  { id: 'business', label: 'Hotel: business', name: 'Canary Wharf Business Hotel' },
  { id: 'luxury', label: 'Hotel: luxury', name: 'The Mayfair Grand' },
];

const KINDS: { id: HomeKind; label: string }[] = [
  { id: 'studio', label: 'Studio' },
  { id: 'apartment', label: 'Apartment' },
  { id: 'townhouse', label: 'Townhouse' },
  { id: 'villa', label: 'Villa' },
  { id: 'mansion', label: 'Mansion' },
  { id: 'penthouse', label: 'Penthouse' },
];

const CARS: Record<HomeKind, string[]> = {
  room: [],
  studio: ['motorbike'],
  apartment: ['hatchback'],
  townhouse: ['hatchback', 'ride-hail-sedan'],
  house: ['hatchback', 'city-suv'],
  villa: ['ride-hail-sedan', 'hatchback', 'luxury', 'city-suv', 'city-suv'],
  mansion: ['ride-hail-sedan', 'hatchback', 'luxury', 'electric', 'city-suv', 'city-suv'],
  penthouse: ['luxury', 'electric'],
};

const place = (kind: HomeKind): Place => ({
  id: `preview:${kind}`,
  kind: 'home',
  name: kind,
  district: 'residential',
  x: 0,
  y: 0,
  w: 1,
  d: 1,
  h: 1,
  motif: 'home',
  color: '#e5e7eb',
  accent: '#9ca3af',
  door: { x: 0, y: 0 },
  doorFace: null,
});

export function HomePreview() {
  const [kind, setKind] = useState<HomeKind | null>(null);
  const [wealth, setWealth] = useState(1);
  // A hotel room abroad, any tier.
  const [hotel, setHotel] = useState<HotelTier | null>(null);
  const stay = HOTELS.find((h) => h.id === hotel);
  const host: HostView | null = useMemo(() => {
    if (!kind) return null;
    const finish = kind === 'studio' ? 1 : kind === 'apartment' || kind === 'townhouse' ? 2 : 3;
    return {
      id: `preview-${kind}`,
      name: 'Sam',
      tier: TIER_OF_KIND[kind],
      tiers: new Map(HOME_SLOTS.map((s) => [s, finish])),
      cars: CARS[kind],
      estate: kind === 'villa' || kind === 'mansion' || kind === 'penthouse' ? kind : null,
      kind,
      wealth,
    };
  }, [kind, wealth]);
  return (
    <div className="stack" data-home-preview="">
      <div className="small muted">{t('Preview a home')}</div>
      <div className="row wrap" role="group" aria-label={t('Wealth')}>
        {[0, 1, 2, 3].map((w) => (
          <Button
            key={w}
            variant={w === wealth ? 'primary' : 'subtle'}
            aria-pressed={w === wealth}
            onClick={() => setWealth(w)}
          >
            {t('Wealth {n}', { n: w })}
          </Button>
        ))}
      </div>
      <div className="row wrap">
        {KINDS.map((k) => (
          <Button
            key={k.id}
            variant="subtle"
            data-preview-kind={k.id}
            onClick={() => setKind(k.id)}
          >
            {t(k.label)}
          </Button>
        ))}
      </div>
      <div className="row wrap">
        {HOTELS.map((h) => (
          <Button
            key={h.id}
            variant="subtle"
            data-preview-hotel={h.id}
            onClick={() => setHotel(h.id)}
          >
            {t(h.label)}
          </Button>
        ))}
      </div>
      {stay && (
        <HomeScene
          key={`hotel:${stay.id}`}
          place={place('room')}
          title={stay.name}
          onClose={() => setHotel(null)}
          onPerson={() => {}}
          nav={() => {}}
          players={[]}
          abroad
          hotel={{ tier: stay.id, name: stay.name }}
        >
          {null}
        </HomeScene>
      )}
      {host && kind && (
        <HomeScene
          key={`${kind}:${wealth}`}
          place={place(kind)}
          title={t('Show home')}
          onClose={() => setKind(null)}
          onPerson={() => {}}
          nav={() => {}}
          players={[]}
          abroad={false}
          hostView={host}
        >
          {null}
        </HomeScene>
      )}
    </div>
  );
}
