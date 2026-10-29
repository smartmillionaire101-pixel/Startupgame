/**
 * Round 7 (player feedback: "the city is sometimes slow to load at start"):
 * what's happening while the city gets ready, step by step, with a bar that
 * moves: your game (in), the map of the city (its own download), the streets
 * and buildings (laid out on this device), then drawing it.
 */
import { t } from '../i18n';
import { useView } from '../store';
import './city-loading.css';

export type CityLoadStep = 'map' | 'layout' | 'draw';
const STEPS: CityLoadStep[] = ['map', 'layout', 'draw'];

const label = (s: CityLoadStep | 'game', city: string) =>
  s === 'game'
    ? t('Your game')
    : s === 'map'
      ? t('The map of {city}', { city })
      : s === 'layout'
        ? t('Streets and buildings')
        : t('Drawing the city');

export function CityLoading({
  step,
  city,
  className = '',
}: {
  step: CityLoadStep;
  city: string;
  className?: string;
}) {
  const at = STEPS.indexOf(step);
  // Your game is in (1 of 4); each step creeps across its own quarter.
  const from = 25 + at * 25;
  return (
    <div
      className={`city-loading city-load ${className}`}
      role="status"
      aria-live="polite"
      data-city-loading={step}
    >
      <div className="city-load-card">
        <p className="city-load-title">{t('Getting {city} ready', { city })}</p>
        <div
          className="city-load-bar"
          role="progressbar"
          aria-label={t('Loading the city')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={from}
        >
          {/* Scaled, not widened: it keeps moving while the page is busy laying the city out. */}
          <i style={{ '--from': from / 100, '--to': (from + 22) / 100 } as React.CSSProperties} />
        </div>
        <ol className="city-load-steps">
          {(['game', ...STEPS] as const).map((s, i) => {
            const state = i - 1 < at ? 'done' : i - 1 === at ? 'now' : 'next';
            return (
              <li key={s} data-state={state}>
                <span aria-hidden="true">
                  {state === 'done' ? '✓' : state === 'now' ? '•' : '·'}
                </span>{' '}
                {label(s, city)}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** The last step, while the 3D map's code loads (the city you're in). */
export function CityDrawing() {
  const { view } = useView();
  return <CityLoading step="draw" city={view.market.name} />;
}
