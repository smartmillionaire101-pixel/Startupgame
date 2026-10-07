/**
 * Wave 4 HUD pieces: the ride chooser for far trips across town, and the
 * "Next month in 3:42" countdown chip.
 */
import { useEffect, useState } from 'react';
import { money } from '../format';
import { t } from '../i18n';
import { quoteRide } from './ride/state';
import './ride/map.css';
import {
  fmtCountdown,
  fuelCost,
  msLeft,
  rideFare,
  rideMinutes,
  rideModesFor,
  transitName,
  type ClockView,
  type MyCar,
  type RideMode,
} from './travel';

/** Small line icons (no emoji: phones without the font would show boxes). */
export function RideIcon({ mode }: { mode: RideMode | 'clock' | 'plane' }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (mode) {
    case 'walk':
      return (
        <svg {...common}>
          <circle cx="13" cy="4" r="2" />
          <path d="M12 7l-3 4 3 2 1 7M12 13l3 2M9 11l-2 3M11 15l-3 6" />
        </svg>
      );
    case 'cycle':
      return (
        <svg {...common}>
          <circle cx="6" cy="16" r="3.5" />
          <circle cx="18" cy="16" r="3.5" />
          <path d="M6 16l4-7h5l3 7M10 9l3 7h-7M14 6h3" />
        </svg>
      );
    case 'bus':
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="15" rx="3" />
          <path d="M4 11h16M8 18v3M16 18v3M8 14.5h.01M16 14.5h.01" />
        </svg>
      );
    case 'taxi':
      return (
        <svg {...common}>
          <path d="M5 16V12l2-5h10l2 5v4z M3 16h18M7 19v-3M17 19v-3M10 4h4" />
          <path d="M7.5 13.5h.01M16.5 13.5h.01" />
        </svg>
      );
    case 'drive':
      return (
        <svg {...common}>
          <path d="M4 15v-3l2.2-5h11.6l2.2 5v3z M2.5 15h19v3h-19z" />
          <path d="M7 18v2M17 18v2M7 12h10" />
          <circle cx="7" cy="15.5" r=".6" />
          <circle cx="17" cy="15.5" r=".6" />
        </svg>
      );
    case 'plane':
      return (
        <svg {...common}>
          <path d="M3 13l18-7-5 14-3-6-6 3 1-4z" />
        </svg>
      );
    default:
      return (
        <svg {...common} width={14} height={14}>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l3 2M10 3h4" />
        </svg>
      );
  }
}

/** The city's transit by its own name ("Danfo", "Matatu", "Muni"…); plain "Bus" is translated. */
export function transitLabel(marketId: string) {
  const name = transitName(marketId);
  return name === 'Bus' ? t('Bus') : name === 'Minibus taxi' ? t('Minibus taxi') : name;
}

export const rideLabel = (mode: RideMode, marketId: string) =>
  mode === 'walk'
    ? t('Walk')
    : mode === 'cycle'
      ? t('Cycle')
      : mode === 'bus'
        ? transitLabel(marketId)
        : mode === 'drive'
          ? t('Drive')
          : t('Taxi');

/**
 * How do you want to get there? Your own car (when you have one here: fuel
 * is in its running cost), walk (free, slow), cycle (free, faster), the
 * city's own transit or a taxi (with fares), each with an ETA. The last
 * choice is highlighted.
 */
export function RideChooser({
  tiles,
  where,
  marketId,
  currency,
  costOfLiving,
  preferred,
  busy,
  onPick,
  onCancel,
  car = null,
  abroad = false,
}: {
  tiles: number;
  where: string;
  marketId: string;
  currency: string;
  costOfLiving: number;
  preferred: RideMode;
  busy: boolean;
  onPick: (mode: RideMode) => void;
  onCancel: () => void;
  /** Your car (life.ts carOf): "Drive" when it is in this city. */
  car?: MyCar | null;
  /** You flew here: your car stayed at home. */
  abroad?: boolean;
}) {
  const modes = rideModesFor(car, abroad);
  // Escape cancels, like any dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="ride-chooser" role="dialog" aria-label={t('How do you want to get there?')}>
      <div className="ride-head">
        <span>
          <b>{t('How do you want to get there?')}</b>
          {where && <span className="ride-where"> · {where}</span>}
        </span>
        <button type="button" className="icon-btn" aria-label={t('Cancel')} onClick={onCancel}>
          ✕
        </button>
      </div>
      <div className={`ride-grid${modes.length > 4 ? ' has-car' : ''}`}>
        {modes.map((mode) => {
          const fare = rideFare(mode, tiles, costOfLiving);
          const fuel = mode === 'drive' ? fuelCost(car, tiles, costOfLiving) : 0;
          return (
            <button
              key={mode}
              type="button"
              className={`ride-opt${mode === preferred ? ' is-last' : ''}`}
              data-mode={mode}
              disabled={busy}
              onClick={() => {
                // The ride scene shows where you're going and what it costs.
                quoteRide({ mode, fare, currency, where, fuel, car: car?.label });
                onPick(mode);
              }}
            >
              <span className="ride-icon" aria-hidden>
                <RideIcon mode={mode} />
              </span>
              <span className="ride-name">
                {rideLabel(mode, marketId)}
                {mode === 'drive' && car && <span className="ride-car"> · {car.label}</span>}
              </span>
              <span className="ride-meta">
                {mode === 'drive'
                  ? fuel > 0
                    ? t('Fuel ≈ {amount}', { amount: money(fuel, currency) })
                    : t('Charged at home')
                  : fare > 0
                    ? `≈ ${money(fare, currency)}`
                    : t('Free')}{' '}
                · {t('{n} min', { n: rideMinutes(mode, tiles) })}
              </span>
            </button>
          );
        })}
      </div>
      {car && abroad && (
        <p className="ride-note small muted">
          {t('Your car is at home. Take a bus or a taxi here.')}
        </p>
      )}
    </div>
  );
}

/** "Next month in 3:42", ticking every second; "Month closing…" at zero. */
export function MonthCountdown({ clock }: { clock: ClockView }) {
  const [tick, setTick] = useState<{ at: number; now: number; server: number } | null>(null);
  useEffect(() => {
    // When this clock arrived (local time): the countdown runs from there.
    const at = Date.now();
    const update = () => setTick({ at, now: Date.now(), server: clock.serverNow });
    const first = setTimeout(update, 0);
    const id = setInterval(update, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [clock.serverNow]);
  const left =
    tick && tick.server === clock.serverNow
      ? msLeft(clock, tick.at, tick.now)
      : Math.max(0, clock.nextSettlementAt - clock.serverNow);
  return (
    <span className="hud-clock" role="timer" aria-live="off">
      <RideIcon mode="clock" />{' '}
      {left > 0 ? t('Next month in {time}', { time: fmtCountdown(left) }) : t('Month closing…')}
    </span>
  );
}
