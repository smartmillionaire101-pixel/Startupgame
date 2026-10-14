import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import { skyViewById } from '@runway/engine';
import { t } from '../i18n';
import { useView } from '../store';
import { cover } from '../three-kit/cover';
import { closeSky, onSky, skyOpen } from './sky-bus';
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
      <Suspense fallback={<p className="sky-host-loading">{t('Opening your view…')}</p>}>
        <Panorama city={city} viewId={viewId} holdingHands={false} onClose={closeSky} />
      </Suspense>
    </div>
  );
}
