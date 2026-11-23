/**
 * Landed and going to your hotel (or home): the hotel's car takes you there.
 * In 3D (./Transfer3D, lazy) the ride itself: out of Arrivals to the car at
 * the kerb with your friends, and away into town; in Lite (or without
 * WebGL) the drawn road with its car. The words are the same either way.
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { t } from '../../i18n';
import { useView } from '../../store';
import { use3d } from '../../three-kit/quality';
import { avatarLook } from '../art';
import { RideWith, rideParty } from '../companions';
import { genderOf } from '../life';
import { useDaylight } from '../useDaylight';
import './terminal.css';

const Transfer3D = lazy(() => import('./Transfer3D'));

/** How long the ride shows (ms): the drawn car's dash, or the 3D ride. */
export const rideMs = (three: boolean) => (three ? 4200 : 2200);

export function HotelRide({
  market,
  abroad,
  hotel,
}: {
  market: string;
  abroad: boolean;
  /** The hotel's name (or Home). */
  hotel: string;
}) {
  const { view } = useView();
  const three = use3d();
  const [failed, setFailed] = useState(false);
  const night = useDaylight(market).night;
  const me = useMemo(
    () => avatarLook(view.me.background?.id, view.me.id, genderOf(view.me)),
    [view.me],
  );
  const party = useMemo(
    () => (abroad ? rideParty(view, market).map((f) => f.look) : []),
    [view, market, abroad],
  );
  const drawn = !three || failed;
  return (
    <div className={`stay-transfer${drawn ? '' : ' is-3d'}`} role="status" data-transfer>
      {drawn ? (
        <div className="stay-transfer-road" aria-hidden="true">
          <span className="stay-transfer-car">🚗</span>
        </div>
      ) : (
        <div className="stay-transfer-scene">
          <Suspense fallback={null}>
            <Transfer3D
              me={me}
              party={party}
              night={night}
              car={abroad ? (market === 'london' ? 'Taxi' : 'SUV') : 'NormalCar1'}
              paint={abroad ? (market === 'london' ? '#111827' : '#1f2937') : '#475569'}
              seconds={rideMs(true) / 1000}
              seed={`${market}:${view.me.id}`}
              onFail={() => setFailed(true)}
            />
          </Suspense>
        </div>
      )}
      <div className="stay-transfer-words">
        <p className="stay-transfer-title">
          {abroad ? t('On your way to {hotel}', { hotel }) : t('On your way home')}
        </p>
        {abroad && <RideWith market={market} />}
        <p className="stay-transfer-sub">
          {abroad ? t('Your driver is taking you to the hotel.') : t('Nearly there.')}
        </p>
      </div>
    </div>
  );
}
