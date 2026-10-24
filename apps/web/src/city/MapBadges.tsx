/**
 * Map badges (see ./mapIcons.ts): the card a tapped badge opens, the Map key
 * sheet, and the "Show names" choice (per viewer: localStorage
 * `runway.mapNames`), shared by the 2D and the 3D maps.
 */
import { useSyncExternalStore } from 'react';
import { t } from '../i18n';
import { Sheet } from '../ui';
import { CATEGORY_COLOR } from './contract';
import type { Place } from './layout';
import { MONEY_RING, placeBadge, type Badge } from './mapIcons';
import './map-badges.css';

// ---- "Show names": today's name pills for everyone who prefers them.
const NAMES_KEY = 'runway.mapNames';
const listeners = new Set<() => void>();
let names: boolean | null = null;

function readNames(): boolean {
  if (names !== null) return names;
  try {
    names = localStorage.getItem(NAMES_KEY) === '1';
  } catch {
    names = false;
  }
  return names;
}

function setMapNames(on: boolean) {
  names = on;
  try {
    localStorage.setItem(NAMES_KEY, on ? '1' : '0');
  } catch {
    /* storage blocked: for this page load only */
  }
  listeners.forEach((l) => l());
}

export function useMapNames(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readNames,
    () => false,
  );
}

// ---- What a place is, in words (the card's type line).
const categoryName = (c: string) =>
  (
    ({
      food: t('Food and drink'),
      retail: t('Shops'),
      services: t('Services'),
      trades: t('Trades'),
      health: t('Health'),
      education: t('Education'),
      logistics: t('Logistics'),
      hospitality: t('Hospitality'),
    }) as Record<string, string>
  )[c] ?? c;

function placeType(p: Place | null): string {
  if (!p) return t('Market');
  if (p.category) return categoryName(p.category);
  return (
    (
      {
        lender: t('Bank'),
        playerbank: t('Bank'),
        fund: t('VC fund'),
        capital: t('Investor'),
        stall: t('Market'),
        hub: t('Startup hub'),
        office: t('Your company'),
        home: t('Your home'),
        airport: t('Airport'),
        newsstand: t('Newsstand'),
        eventhall: t('Events'),
        golf: t('Golf course'),
        mall: t('Shopping mall'),
      } as Partial<Record<Place['kind'], string>>
    )[p.kind] ?? ''
  );
}

/** The badge's disc (for the card and the key). */
function BadgeDisc({ badge, big = false }: { badge: Badge; big?: boolean }) {
  return (
    <span
      className={`mb-disc${badge.money ? ' is-money' : ''}${big ? ' is-big' : ''}`}
      style={{ borderColor: badge.ring }}
      aria-hidden="true"
    >
      {badge.icon}
    </span>
  );
}

/** A tapped badge: its name, what it is, and Go (what tapping a label did before). */
export function BadgeCard({
  place,
  name,
  onGo,
  onClose,
}: {
  place: Place | null;
  name: string;
  onGo: () => void;
  onClose: () => void;
}) {
  const badge = placeBadge(place);
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();
  return (
    <div
      className="mb-card"
      role="group"
      aria-label={name}
      data-badge-card={place?.id ?? 'market'}
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={stop}
    >
      <BadgeDisc badge={badge} big />
      <div className="mb-card-main">
        <span className="mb-card-type">{placeType(place)}</span>
        <b className="mb-card-name">{name}</b>
      </div>
      <button type="button" className="mb-card-go" data-badge-go="" onClick={onGo}>
        {t('Go')}
      </button>
      <button type="button" className="mb-card-x" aria-label={t('Close')} onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

/** The Map key's button, by the zoom buttons. */
export function MapKeyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="7.6" r="1.3" fill="currentColor" />
    </svg>
  );
}

interface KeyGroup {
  id: string;
  title: string;
  note: string;
  badge: Badge;
  more: string[];
}

function keyGroups(): KeyGroup[] {
  const ring = (icon: string, c: string, money = false): Badge => ({ icon, ring: c, money });
  return [
    {
      id: 'funds',
      title: t('Funds and investors'),
      note: t('VCs, angels, accelerators'),
      badge: ring('💰', MONEY_RING, true),
      more: [],
    },
    {
      id: 'banks',
      title: t('Banks and lenders'),
      note: t('Loans, accounts, mobile money'),
      badge: ring('🏦', MONEY_RING, true),
      more: [],
    },
    {
      id: 'cafes',
      title: t('Cafés and bakeries'),
      note: t('Coffee, bread'),
      badge: ring('☕', CATEGORY_COLOR.food),
      more: ['🥖'],
    },
    {
      id: 'food',
      title: t('Restaurants'),
      note: t('Buka, grill, street food'),
      badge: ring('🍽️', CATEGORY_COLOR.food),
      more: ['🍲', '🍖', '🍢', '🌯', '🌮', '🥟', '🚚'],
    },
    {
      id: 'night',
      title: t('Nightlife'),
      note: t('Bars, pubs, clubs, karaoke'),
      badge: ring('🍸', CATEGORY_COLOR.hospitality),
      more: ['🍺', '🪩', '🎤', '🎶'],
    },
    {
      id: 'shops',
      title: t('Shops'),
      note: t('Grocers, phones, fashion, the mall'),
      badge: ring('🛍️', CATEGORY_COLOR.retail),
      more: ['🛒', '📱', '📺', '🛋️', '🚗', '🚲', '🧺'],
    },
    {
      id: 'health',
      title: t('Health'),
      note: t('Clinic, dentist, pharmacy, gym'),
      badge: ring('🏥', CATEGORY_COLOR.health),
      more: ['🦷', '💊', '🏋️', '💆', '🧗', '⚽'],
    },
    {
      id: 'work',
      title: t('Work'),
      note: t('Co-working, The Hub, workshops'),
      badge: ring('💼', '#0f766e'),
      more: ['🚀', '🔧', '🧱'],
    },
    {
      id: 'services',
      title: t('Services'),
      note: t('Salon, tailor, print, repairs'),
      badge: ring('✂️', CATEGORY_COLOR.services),
      more: ['🧵', '🖨️', '🖼️', '📰'],
    },
    {
      id: 'learn',
      title: t('Schools and transport'),
      note: t('Tutoring, depots, warehouses, the airport'),
      badge: ring('🎓', CATEGORY_COLOR.education),
      more: ['🛵', '🚌', '📦', '✈️'],
    },
    {
      id: 'fun',
      title: t('Stay and play'),
      note: t('Hotels, cinema, golf, arcade, events'),
      badge: ring('🎬', CATEGORY_COLOR.hospitality),
      more: ['🛏️', '⛳', '🎳', '🎉', '🏖️', '⛵', '🛩️'],
    },
  ];
}

/** The Map key: what each badge means, and "Show names". */
export function MapKeySheet({ onClose }: { onClose: () => void }) {
  const on = useMapNames();
  return (
    <Sheet title={t('Map key')} onClose={onClose}>
      <div className="mb-key" data-map-key="">
        <label className="mb-switch">
          <span>
            <b>{t('Show names')}</b>
            <span className="small muted">{t('Name pills instead of icons')}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={on}
            aria-label={t('Show names')}
            data-map-names=""
            onChange={(e) => setMapNames(e.target.checked)}
          />
          <span className="mb-switch-track" aria-hidden="true" />
        </label>
        <p className="small muted">
          {t('Tap any badge to see its name. Gold badges are places with money.')}
        </p>
        <ul className="mb-key-list">
          {keyGroups().map((g) => (
            <li key={g.id} data-key-group={g.id}>
              <BadgeDisc badge={g.badge} />
              <span className="mb-key-text">
                <b>{g.title}</b>
                <span className="small muted">{g.note}</span>
                {g.more.length > 0 && (
                  <span className="mb-key-more" aria-hidden="true">
                    {g.more.join(' ')}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <h3 className="mb-key-h">{t('Always named')}</h3>
        <div className="mb-key-named">
          <span className="mb-chip is-home">🏠 {t('Your home')}</span>
          <span className="mb-chip is-office">🏢 {t('Your company')}</span>
          <span className="mb-chip is-heading">📍 {t('Where you’re heading')}</span>
        </div>
      </div>
    </Sheet>
  );
}
