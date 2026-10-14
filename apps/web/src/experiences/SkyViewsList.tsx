import { skyViewsIn } from '@runway/engine';
import { openSky } from './sky-bus';

const KIND_ICON = { wheel: '🎡', cable: '🚡', deck: '🏙', tram: '🚋', hill: '⛰' } as const;

/** This city's sky views as buttons (the Places list, the Sky views sheet). */
export function SkyViewsList({ city, onOpen }: { city: string; onOpen?: () => void }) {
  const views = skyViewsIn(city);
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
