/**
 * Wave 7 §B: the ride interlude. Full screen over the map (which still plays
 * the trip underneath): a top card in ride-app style (where to, an ETA that
 * counts down, the fare), the scene for the mode, and Skip › from 0.5 s.
 *
 * One requestAnimationFrame loop drives everything through refs; it stops
 * while the tab is hidden. Reduced motion: no scene, just the card and Skip
 * over the map's bird's-eye chase.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { money } from '../../format';
import { useDaylight } from '../useDaylight';
import { t, tx } from '../../i18n';
import { flavourOf } from '../flavour';
import { rideLabel, RideIcon } from '../Transport';
import { fnv, rideMinutes, stopsAlong } from '../travel';
import type { Frame } from './art';
import { BusScene } from './BusScene';
import { CycleScene } from './CycleScene';
import { setSkipRides, skipRide, skipRides, type Ride } from './state';
import { BOOKING_MS, TaxiScene } from './TaxiScene';
import { WalkScene } from './WalkScene';
import './ride.css';

const TRANSIT_LIVERY: Record<string, string> = {
  lagos: '#facc15',
  nairobi: '#7c3aed',
  accra: '#f59e0b',
  freetown: '#0ea5e9',
  kigali: '#1d4ed8',
  johannesburg: '#e2e8f0',
  cairo: '#f8fafc',
  dubai: '#be123c',
  london: '#dc2626',
  'san-francisco': '#b91c1c',
};

export function RideScene({ ride }: { ride: Ride }) {
  const { mode, layout, chase } = ride;
  const marketId = layout.marketId;
  const flavour = layout.flavour ?? flavourOf(marketId);
  const frameRef = useRef<Frame | null>(null);
  const eta = useRef<HTMLSpanElement>(null);
  const slow = useRef<HTMLParagraphElement>(null);
  const [skipShown, setSkipShown] = useState(false);
  const [always, setAlways] = useState(skipRides);
  const sunlight = useDaylight(marketId);
  const part: 'night' | 'dusk' | 'day' = sunlight.night ? 'night' : sunlight.dusk ? 'dusk' : 'day';
  const uid = `ride${ride.id}`;
  const minutes = rideMinutes(mode, ride.tiles);
  const stops = useMemo(
    () => stopsAlong(layout.areas, flavour.streets, ride.path),
    [layout.areas, flavour.streets, ride.path],
  );
  // A taxi can hit a go-slow: more minutes, said in words (the trip's length doesn't change).
  const jam = useMemo(() => {
    const h = fnv(`${ride.id}:${ride.where}:${marketId}`);
    if (mode !== 'taxi' || h % 100 >= 40) return null;
    const street = flavour.streets[h % Math.max(1, flavour.streets.length)] ?? '';
    return { street, n: 3 + (h % 9) };
  }, [mode, ride.id, ride.where, marketId, flavour.streets]);

  // Skip › shows after half a second.
  useEffect(() => {
    const id = setTimeout(() => setSkipShown(true), 500);
    return () => clearTimeout(id);
  }, []);

  // Escape skips, like closing a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skipRide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The one loop: ETA text, the go-slow line, the scene's own frameRef.
  useEffect(() => {
    let raf = 0;
    let lastEta = '';
    let jammed = false;
    const step = () => {
      const ms = performance.now() - ride.startedAt;
      const k = Math.max(0, Math.min(1, ms / ride.ms));
      const booking = mode === 'taxi' && !chase && ms < BOOKING_MS;
      if (jam && !jammed && k > 0.4) {
        jammed = true;
        slow.current?.removeAttribute('hidden');
      }
      const left = booking
        ? minutes
        : Math.max(0, Math.ceil(minutes * (1 - k) + (jammed && jam ? jam.n * (1 - k) : 0)));
      const text = booking
        ? t('Pickup in {n} min', { n: Math.max(1, Math.ceil(2 * (1 - ms / BOOKING_MS))) })
        : left > 0
          ? t('{n} min', { n: left })
          : t('Arriving');
      if (text !== lastEta && eta.current) {
        lastEta = text;
        eta.current.textContent = text;
      }
      frameRef.current?.(ms, k);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(step);
    };
    const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ride, mode, chase, jam, minutes]);

  const common = { uid, flavour, marketId, part, look: ride.look, frameRef };
  const scene = chase ? null : mode === 'walk' ? (
    <WalkScene {...common} />
  ) : mode === 'cycle' ? (
    <CycleScene {...common} />
  ) : mode === 'taxi' ? (
    <TaxiScene {...common} path={ride.path} rideId={ride.id} />
  ) : (
    <BusScene {...common} stops={stops} livery={TRANSIT_LIVERY[marketId] ?? '#f59e0b'} />
  );
  const how = mode === 'drive' && ride.car ? ride.car : rideLabel(mode, marketId);
  const where = ride.where ? tx(ride.where) : '';

  return (
    <div
      className={`ride-scene${chase ? ' is-chase' : ''}`}
      role="dialog"
      aria-modal={!chase}
      aria-label={where ? t('On the way to {place}', { place: where }) : t('On the way')}
      data-ride-mode={mode}
      data-ride-chase={chase ? '1' : undefined}
      data-part={part}
    >
      {scene && <div className="ride-stage">{scene}</div>}
      <div className="ride-card" role="status">
        <span className="ride-card-icon" aria-hidden>
          <RideIcon mode={mode} />
        </span>
        <span className="ride-card-main">
          <span className="ride-card-to">{where || how}</span>
          <span className="ride-card-sub">
            {how} · <span ref={eta} className="ride-eta" />
          </span>
        </span>
        <span className="ride-card-fare">
          {mode === 'drive'
            ? ride.fuel > 0
              ? t('Fuel {amount}', { amount: money(ride.fuel, ride.currency) })
              : t('Your car')
            : ride.fare > 0
              ? money(ride.fare, ride.currency)
              : t('Free')}
        </span>
        {jam && (
          <p ref={slow} className="ride-jam" hidden>
            {marketId === 'lagos'
              ? t('Go-slow on {street}: +{n} min', { street: jam.street, n: jam.n })
              : t('Traffic on {street}: +{n} min', { street: jam.street, n: jam.n })}
          </p>
        )}
      </div>
      {ride.offerSkip && (
        <label className="ride-always">
          <input
            type="checkbox"
            checked={always}
            onChange={(e) => {
              setAlways(e.target.checked);
              setSkipRides(e.target.checked);
            }}
          />
          {t('Always skip rides')}
        </label>
      )}
      {skipShown && (
        <button type="button" className="ride-skip" onClick={skipRide}>
          {t('Skip')} <span aria-hidden>›</span>
        </button>
      )}
    </div>
  );
}
