/**
 * Round 7 (player feedback: "sit down at home"): the chip under the HUD
 * while you rest. "🛋 Resting on the sofa · stress −1 / 15 min · Get up", or
 * "😴 Napping on the mat · energy +4 / 15 min · Wake up", with what it has
 * done so far on the game clock. The engine settles it when you get up
 * (rest.ts); this only shows the rates and counts along.
 */
import { useGameClock } from '../gameClock';
import { t } from '../i18n';
import { useView } from '../store';

export function RestChip({
  spot,
  label,
  onUp,
}: {
  spot: 'seat' | 'bed';
  label: string;
  onUp: () => void;
}) {
  const { view } = useView();
  const clock = useGameClock(view, view.me.market);
  const r = view.me.rest;
  if (!r) return null;
  const since = r.resting?.spot === spot ? r.resting.since : null;
  const blocks =
    since !== null && clock.min !== null
      ? Math.floor(Math.min(Math.max(0, clock.min - since), r.maxMinutes[spot]) / r.block)
      : 0;
  const bed = spot === 'bed';
  const sofar = bed
    ? Math.min(blocks * r.bedEnergy, r.energyLeft)
    : Math.min(blocks * r.seatStress, r.stressLeft);
  const capped = bed ? r.energyLeft <= 0 : r.stressLeft <= 0;
  return (
    <div className="rest-chip" role="group" aria-label={label} data-rest={spot}>
      <span className="rest-ico" aria-hidden="true">
        {bed ? '😴' : '🛋'}
      </span>
      <span className="rest-text">
        <span>{label}</span>
        <span className="rest-sub" data-rest-sofar={sofar} data-rest-blocks={blocks}>
          {capped
            ? t('Rested enough for this month')
            : sofar > 0
              ? bed
                ? t('+{n} energy so far', { n: sofar })
                : t('−{n} stress so far', { n: sofar })
              : t('Spends game hours while you rest')}
        </span>
      </span>
      <span className={`rest-fx ${bed ? 'energy' : 'stress'}`}>
        {bed
          ? t('energy +{n} / {m} min', { n: r.bedEnergy, m: r.block })
          : t('stress −{n} / {m} min', { n: r.seatStress, m: r.block })}
      </span>
      <button type="button" onClick={onUp} data-rest-up>
        {bed ? t('Wake up') : t('Get up')}
      </button>
    </div>
  );
}
