import type { CSSProperties } from 'react';
import { cityLook } from '../city/three/cities';
import { localHour } from '../city/travel';

/**
 * The first moment of a sky view, before the real city is drawn: the city's
 * own sky, hills and water, rising (CSS on the compositor, so it keeps moving
 * while the 3D city is laid out). It fades as the first real frame comes.
 */
export function SkyRise({ city, up = false }: { city: string; up?: boolean }) {
  const look = cityLook(city);
  const h = localHour(city);
  const dark = !(h >= 6.3 && h < 19);
  const style = {
    '--rise-land': look.hillColor,
    '--rise-park': look.park,
    '--rise-sea': look.water[1],
  } as CSSProperties;
  return (
    <div
      className={`sky-rise${dark ? ' is-dark' : ''}${up ? ' is-up' : ''}`}
      style={style}
      aria-hidden="true"
    >
      <div className="sky-rise-sea" />
      <div className="sky-rise-land" />
    </div>
  );
}
