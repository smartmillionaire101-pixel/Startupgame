import { skyViewsIn } from '@runway/engine';
import { useEffect } from 'react';
import { openSky, prewarmSky } from './sky-bus';

const KIND_ICON = { wheel: '🎡', cable: '🚡', deck: '🏙', tram: '🚋', hill: '⛰' } as const;

/** This city's sky views as buttons (the Places list, the Sky views sheet). */
export function SkyViewsList({
  city,
  onOpen,
  prewarm = true,
}: {
  city: string;
  onOpen?: () => void;
  /** Fetch the views' map and terrain as the list shows (not in Lite mode). */
  prewarm?: boolean;
}) {
  const views = skyViewsIn(city);
  const any = views.length > 0;
  useEffect(() => {
    if (prewarm && any) prewarmSky(city);
  }, [prewarm, any, city]);
  if (!views.length) return null;
  return (
    <ul className="places-list sky-views-list">
      {views.map((v) => (
        <li key={v.id}>
          <button
            type="button"
            className="place-btn"
            data-sky-view={v.id}
            onClick={() => {
              onOpen?.();
              openSky(v.id);
            }}
          >
            <span aria-hidden>{KIND_ICON[v.kind]}</span> {v.name}
          </button>
        </li>
      ))}
    </ul>
  );
}
