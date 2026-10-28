import { TILE } from './art';
import type { HotelWindow } from './hotel';
import type { HomePlan } from './layout';
import { homeWindows } from './windows';

/**
 * The 2D (Lite) home's windows, drawn from the list the 3D house builds its
 * panes from (playtest #40): panes in the back wall's face, and a strip of
 * glass in the side walls seen from above. `wallH` is the back wall's height (px).
 */
export function HomeWindows({
  plan,
  night,
  hotel,
  wallH,
}: {
  plan: HomePlan;
  night: boolean;
  hotel?: readonly HotelWindow[] | null;
  wallH: number;
}) {
  const W = plan.w * TILE;
  const sky = night ? '#1e2a5a' : '#bae6fd';
  return (
    <g className="home-windows">
      {homeWindows(plan, { hotel }).map((o, i) => {
        const id = `${o.wall}:${o.c.toFixed(2)}:${o.w.toFixed(2)}`;
        if (o.wall !== 'back')
          return (
            <rect
              key={i}
              data-window={id}
              x={o.wall === 'left' ? -6 : W + 2}
              y={(o.c - o.w / 2) * TILE}
              width={4}
              height={o.w * TILE}
              rx={1}
              fill={sky}
              stroke="#f8fafc"
              strokeWidth="1"
            />
          );
        const pw = Math.round(o.w * TILE);
        return (
          <g key={i} data-window={id} transform={`translate(${o.c * TILE - pw / 2} ${-wallH + 8})`}>
            <rect width={pw} height="24" rx="2" fill={sky} stroke="#f8fafc" strokeWidth="3" />
            {night ? (
              <>
                <circle cx={pw * 0.23} cy="7" r="1" fill="#fff" />
                <circle cx={pw * 0.68} cy="12" r="1" fill="#fff" />
                <circle cx={pw * 0.77} cy="6" r="3" fill="#fef9c3" />
              </>
            ) : (
              <path
                d={`M2 22 L${pw * 0.23} 14 L${pw * 0.36} 18 L${pw * 0.55} 10 L${pw * 0.73} 16 L${pw - 2} 12 L${pw - 2} 22 Z`}
                fill="#7dd3fc"
                opacity="0.7"
              />
            )}
            <line x1={pw / 2} y1="0" x2={pw / 2} y2="24" stroke="#f8fafc" strokeWidth="2" />
          </g>
        );
      })}
    </g>
  );
}
