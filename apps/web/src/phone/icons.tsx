/**
 * The phone's icon set: one stroke style (24 grid, 1.9 stroke, round caps),
 * white on a coloured tile for apps, currentColor elsewhere.
 */
import type { ReactNode } from 'react';

export type IconName =
  | 'messages'
  | 'alerts'
  | 'contacts'
  | 'rides'
  | 'chop'
  | 'bank'
  | 'invest'
  | 'fit'
  | 'jobs'
  | 'founder'
  | 'news'
  | 'map'
  | 'travel'
  | 'house'
  | 'social'
  | 'settings'
  | 'signal'
  | 'pin'
  | 'walk'
  | 'cycle'
  | 'bus'
  | 'taxi'
  | 'bolt'
  | 'heart'
  | 'food'
  | 'shower'
  | 'smile'
  | 'people'
  | 'chevron'
  | 'close'
  | 'phone'
  | 'shop'
  | 'clinic'
  | 'school'
  | 'truck'
  | 'tools'
  | 'bed'
  | 'events'
  | 'send'
  /** Wave 10: Homes (a key) and Going out (a cocktail). */
  | 'key'
  | 'cocktail'
  /** Wave 12: Games (a controller). */
  | 'games';

const PATHS: Record<IconName, ReactNode> = {
  messages: <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" />,
  alerts: (
    <>
      <path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 004 0" />
    </>
  ),
  contacts: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M16 14.2c2.4-.3 4.1 1.2 4.6 3.8" />
    </>
  ),
  rides: (
    <>
      <path d="M5 16v-4l2-5h10l2 5v4z" />
      <path d="M3 16h18M7 19v-3M17 19v-3" />
      <path d="M7.5 13.2h.01M16.5 13.2h.01" />
    </>
  ),
  chop: (
    <>
      <path d="M4 12h16a8 8 0 01-16 0z" />
      <path d="M9 8c0-1.5 1-1.5 1-3M13 8c0-1.5 1-1.5 1-3" />
    </>
  ),
  bank: (
    <>
      <path d="M3.5 9.5L12 4.5l8.5 5" />
      <path d="M5 10v7M9.7 10v7M14.3 10v7M19 10v7M3.5 19.5h17" />
    </>
  ),
  invest: (
    <>
      <path d="M4 19.5h16" />
      <path d="M5 15l4.5-4.5 3.5 3 6-6.5" />
      <path d="M15 7h4v4" />
    </>
  ),
  fit: (
    <>
      <path d="M6.5 8v8M17.5 8v8M4 10v4M20 10v4M6.5 12h11" />
    </>
  ),
  jobs: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V5.5h6v2M3.5 12.5h17" />
    </>
  ),
  founder: (
    <>
      <path d="M12 3.5c3 2 4.5 5.2 4.5 9l-2 3h-5l-2-3c0-3.8 1.5-7 4.5-9z" />
      <circle cx="12" cy="10" r="1.6" />
      <path d="M9.5 15.5L7 19l3-1M14.5 15.5L17 19l-3-1M12 17v3" />
    </>
  ),
  news: (
    <>
      <path d="M4.5 5.5h12v13h-10a2 2 0 01-2-2z" />
      <path d="M16.5 9h3v7.5a2 2 0 01-2 2" />
      <path d="M7.5 9h6M7.5 12h6M7.5 15h4" />
    </>
  ),
  map: (
    <>
      <path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </>
  ),
  travel: <path d="M3 13.5l18-7-5 14-3-6-6 3 1-4z" />,
  house: (
    <>
      <path d="M4 11l8-6.5 8 6.5" />
      <path d="M6 9.5V19.5h12V9.5" />
      <path d="M10 19.5v-5h4v5" />
    </>
  ),
  social: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  signal: (
    <>
      <path d="M5 18v-2M9.5 18v-5M14 18v-8M18.5 18V6" />
    </>
  ),
  pin: (
    <>
      <path d="M12 20.5s6.5-6 6.5-11a6.5 6.5 0 00-13 0c0 5 6.5 11 6.5 11z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4.5" r="2" />
      <path d="M12 7.5l-3 4 3 2 1 7M12 13.5l3 2M9 11.5l-2 3M11 15.5l-3 5.5" />
    </>
  ),
  cycle: (
    <>
      <circle cx="6" cy="16" r="3.5" />
      <circle cx="18" cy="16" r="3.5" />
      <path d="M6 16l4-7h5l3 7M10 9l3 7H6M14 6h3" />
    </>
  ),
  bus: (
    <>
      <rect x="4" y="3.5" width="16" height="14.5" rx="3" />
      <path d="M4 11h16M8 18v3M16 18v3M8 14.5h.01M16 14.5h.01" />
    </>
  ),
  taxi: (
    <>
      <path d="M5 16v-4l2-5h10l2 5v4z M3 16h18M7 19v-3M17 19v-3M10 4h4" />
      <path d="M7.5 13.2h.01M16.5 13.2h.01" />
    </>
  ),
  bolt: <path d="M13 3L5.5 13.5H12L11 21l7.5-10.5H12z" />,
  events: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M8 14h3M13 14h3M8 17h3" />
    </>
  ),
  send: <path d="M4 12l16-7-6 15-2.5-6.5zM11.5 13.5L20 5" />,
  key: (
    <>
      <circle cx="8" cy="12" r="3.6" />
      <path d="M11.6 12H20M17 12v3M14.5 12v2.2" />
    </>
  ),
  games: (
    <>
      <path d="M7 8h10a4 4 0 014 4l.5 4a2.5 2.5 0 01-4.6 1.4L15.5 15h-7l-1.4 2.4A2.5 2.5 0 012.5 16L3 12a4 4 0 014-4z" />
      <path d="M7.5 10.5v3M6 12h3M15.5 11.5h.01M17.5 13h.01" />
    </>
  ),
  cocktail: (
    <>
      <path d="M5 5h14l-7 8z" />
      <path d="M12 13v6.5M8.5 19.5h7M15.5 3.5l2 3" />
    </>
  ),
  heart: (
    <path d="M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0112 7a4.2 4.2 0 017.5 2.5c0 5.4-7.5 10-7.5 10z" />
  ),
  food: (
    <>
      <path d="M7 3.5v7a2 2 0 002 2v8M11 3.5v7a2 2 0 01-2 2M9 3.5v5" />
      <path d="M16.5 20.5v-17c-2 1-3 3.5-3 7h3" />
    </>
  ),
  shower: (
    <>
      <path d="M5 20V8a4 4 0 018 0" />
      <path d="M10 8.5h6M11 12v.01M13.5 12v.01M16 12v.01M12 15v.01M14.5 15v.01" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  people: (
    <>
      <circle cx="8" cy="9" r="2.6" />
      <circle cx="16" cy="9" r="2.6" />
      <path d="M3.5 18.5c.5-2.6 2.3-4 4.5-4s4 1.4 4.5 4M11.5 18.5c.5-2.6 2.3-4 4.5-4s4 1.4 4.5 4" />
    </>
  ),
  chevron: <path d="M9.5 6l6 6-6 6" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" />
      <path d="M10.5 18.3h3" />
    </>
  ),
  shop: (
    <>
      <path d="M4 9.5l1.5-5h13L20 9.5" />
      <path d="M4 9.5a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0 2.7 2.7 0 005.3 0" />
      <path d="M5.5 11.5v8h13v-8M10 19.5v-4.5h4v4.5" />
    </>
  ),
  clinic: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  school: (
    <>
      <path d="M2.5 9.5L12 5l9.5 4.5L12 14z" />
      <path d="M6.5 11.5v4.5c3 2 8 2 11 0v-4.5M21.5 9.5v5" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6.5h11v10H3zM14 9.5h4l3 3.5v3.5h-7" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17.5" cy="17.5" r="1.8" />
    </>
  ),
  tools: (
    <path d="M14.5 6.5a4 4 0 015 5l-1.5-.5-2 2-2-2 2-2zM13.5 10.5l-8 8a1.4 1.4 0 01-2-2l8-8" />
  ),
  bed: (
    <>
      <path d="M3 18.5v-11M3 14h18v4.5M21 14v-2.5a3 3 0 00-3-3h-7V14" />
      <circle cx="7" cy="11" r="1.8" />
    </>
  ),
};

export function Icon({
  name,
  size = 22,
  className,
  strokeWidth = 1.9,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Battery glyph, filled to `level` (0–100). */
export function Battery({ level }: { level: number }) {
  const w = Math.max(0, Math.min(100, level)) / 100;
  const low = level < 20;
  return (
    <svg width="25" height="12" viewBox="0 0 25 12" aria-hidden="true" focusable="false">
      <rect
        x="0.75"
        y="0.75"
        width="21"
        height="10.5"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.2"
      />
      <rect x="22.6" y="3.8" width="1.8" height="4.4" rx="0.9" fill="currentColor" opacity="0.55" />
      <rect
        x="2.4"
        y="2.4"
        width={Math.max(0.5, 17.7 * w)}
        height="7.2"
        rx="1.6"
        fill={low ? '#ef4444' : 'currentColor'}
      />
    </svg>
  );
}
