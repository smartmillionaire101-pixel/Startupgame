import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import { skyViewById } from '@runway/engine';
import { t } from '../i18n';
import { useView } from '../store';
import { cover } from '../three-kit/cover';
import { closeSky, onSky, skyOpen } from './sky-bus';
import { SkyRise } from './SkyRise';
import './experiences.css';
const Panorama = lazy(() => import('./Panorama'));

/** The sky view opened from the city (sky-bus), full screen. */
export default function SkyHost() {
  const viewId = useSyncExternalStore(onSky, skyOpen, () => null);
  return viewId ? <SkyRoom viewId={viewId} /> : null;
}

function SkyRoom({ viewId }: { viewId: string }) {
  const { view } = useView();
  useEffect(() => cover(), []);
  const city = skyViewById(viewId)?.market ?? view.here?.id ?? view.market.id;
  return (
    <div className="experience-backdrop sky-host">
      <Suspense
        fallback={
          <div className="panorama">
            <SkyRise city={city} />
            <p className="panorama-loading">{t('Opening your view…')}</p>
          </div>
        }
      >
        <Panorama city={city} viewId={viewId} holdingHands={false} onClose={closeSky} />
      </Suspense>
    </div>
  );
}
