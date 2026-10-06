/**
 * A taxi: two seconds of booking (the car crawls to you on a little map,
 * "Driver arriving", the plate and a rating), then the back seat: the
 * driver's head, the dashboard, the street rushing at the windscreen and a
 * mini-map of the real route with the car moving and turning along it.
 */
import { useEffect, useMemo, useRef } from 'react';
import { t } from '../../i18n';
import { avatarLook } from '../art';
import { pointAlong, project, type Pt } from '../layout';
import { npcName } from '../people';
import { driveOnLeft, fnv, seeded } from '../travel';
import { Sky, SKY, VB, type SceneProps } from './art';

export const BOOKING_MS = 2000;

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

/** A number plate in the city's style (made up, never a real one). */
function plateOf(marketId: string, seed: number): string {
  const r = seeded(seed);
  const L = () => 'ABCDEFGHJKLMNPRSTUVWXYZ'[Math.floor(r() * 23)]!;
  const D = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 10)).join('');
  switch (marketId) {
    case 'lagos':
      return `LND ${D(3)} ${L()}${L()}`;
    case 'nairobi':
      return `KD${L()} ${D(3)}${L()}`;
    case 'london':
      return `L${L()}${D(2)} ${L()}${L()}${L()}`;
    case 'accra':
      return `GR ${D(4)}-${D(2)}`;
    case 'freetown':
      return `AF${L()} ${D(3)}`;
    case 'kigali':
      return `RA${L()} ${D(3)} ${L()}`;
    case 'johannesburg':
      return `${L()}${L()} ${D(2)} ${L()}${L()} GP`;
    case 'dubai':
      return `${L()} ${D(5)}`;
    case 'san-francisco':
      return `${D(1)}${L()}${L()}${L()}${D(3)}`;
    default:
      return `${L()}${L()}${L()} ${D(3)}`;
  }
}

export function TaxiScene({
  uid,
  flavour,
  marketId,
  part,
  frameRef,
  path,
  rideId,
}: SceneProps & { path: Pt[]; rideId: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const crawl = useRef<SVGGElement>(null);
  const dashes = useRef<(SVGRectElement | null)[]>([]);
  const sides = useRef<(SVGRectElement | null)[]>([]);
  const charm = useRef<SVGGElement>(null);
  const mini = useRef<SVGGElement>(null);
  const body = useRef<SVGGElement>(null);
  const seed = fnv(`${marketId}:taxi:${rideId}`);
  const driver = npcName(marketId, `taxi:${rideId}`);
  const driverLook = avatarLook('b-commercial', `taxi:${rideId}`);
  const plate = plateOf(marketId, seed);
  const rating = (4.6 + (seed % 4) / 10).toFixed(1);
  const rhd = driveOnLeft(marketId);
  const dx = rhd ? 290 : 110;
  const cab =
    marketId === 'london'
      ? '#111827'
      : (flavour.vehicles.find((v) => /taxi|cab/.test(v.id))?.body ?? '#facc15');

  // The route, projected like the city map, framed in a small box.
  const route = useMemo(() => {
    const pts = path.map((p) => project(p.x, p.y));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(40, Math.max(...xs) - minX);
    const h = Math.max(40, Math.max(...ys) - minY);
    const pad = Math.max(w, h) * 0.15;
    return {
      d: pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
      box: `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`,
      end: pts[pts.length - 1] ?? { x: 0, y: 0 },
      u: Math.max(w, h) / 100,
    };
  }, [path]);

  useEffect(() => {
    let booked = false;
    frameRef.current = (ms, k) => {
      if (ms < BOOKING_MS) {
        const b = ms / BOOKING_MS;
        crawl.current?.setAttribute(
          'transform',
          b < 0.5
            ? `translate(${(20 + b * 2 * 100).toFixed(0)} 30)`
            : `translate(120 ${(30 + (b - 0.5) * 2 * 60).toFixed(0)}) rotate(90)`,
        );
        wrap.current?.classList.toggle('is-arriving', b > 0.4);
        return;
      }
      if (!booked) {
        booked = true;
        wrap.current?.classList.add('is-riding');
      }
      // Lane dashes and the street's edges rushing at the windscreen.
      for (let i = 0; i < dashes.current.length; i++) {
        const p = ((ms / 700 + i / 5) % 1) ** 2;
        const el = dashes.current[i];
        if (!el) continue;
        const w = 2 + p * 16;
        el.setAttribute('x', (200 - w / 2).toFixed(1));
        el.setAttribute('y', (200 + p * 140).toFixed(1));
        el.setAttribute('width', w.toFixed(1));
        el.setAttribute('height', (3 + p * 34).toFixed(1));
      }
      for (let i = 0; i < sides.current.length; i++) {
        const el = sides.current[i];
        if (!el) continue;
        const p = ((ms / 1600 + (i >> 1) / 3) % 1) ** 2;
        const left = i % 2 === 0;
        const w = 10 + p * 260;
        const h = 30 + p * 330;
        el.setAttribute('x', (left ? 170 - p * 520 - w : 230 + p * 520).toFixed(1));
        el.setAttribute('y', (200 - h * 0.8).toFixed(1));
        el.setAttribute('width', w.toFixed(1));
        el.setAttribute('height', h.toFixed(1));
      }
      charm.current?.setAttribute('transform', `rotate(${(Math.sin(ms / 380) * 9).toFixed(1)})`);
      body.current?.setAttribute(
        'transform',
        `translate(0 ${(Math.sin(ms / 140) * 1.2).toFixed(1)})`,
      );
      const { p, dx: ddx, dy: ddy } = pointAlong(path, ease(k));
      const s = project(p.x, p.y);
      const deg = (Math.atan2((ddx + ddy) * 16, (ddx - ddy) * 32) * 180) / Math.PI;
      mini.current?.setAttribute(
        'transform',
        `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${deg.toFixed(0)})`,
      );
    };
    return () => {
      frameRef.current = null;
    };
  }, [frameRef, path]);

  const [sky0] = SKY[part];
  const shade = part === 'night' ? '#020617' : '#1f2937';

  return (
    <div ref={wrap} className="taxi" data-taxi="">
      <div className="taxi-booking" aria-live="polite">
        <svg viewBox="0 0 240 120" className="taxi-booking-map" aria-hidden>
          <rect width="240" height="120" rx="12" fill="#e7e5df" />
          <path
            d="M 0 30 H 240 M 120 0 V 120 M 0 90 H 240 M 200 0 V 120"
            stroke="#fff"
            strokeWidth="12"
          />
          <path
            d="M 20 30 H 120 V 90"
            stroke="#0f766e"
            strokeWidth="3"
            strokeDasharray="6 5"
            fill="none"
          />
          <g transform="translate(120 92)">
            <circle r="9" fill="#0f766e" opacity="0.25" className="taxi-pulse" />
            <circle r="5" fill="#0f766e" stroke="#fff" strokeWidth="2" />
          </g>
          <g ref={crawl} transform="translate(20 30)">
            <rect
              x="-9"
              y="-5"
              width="18"
              height="10"
              rx="3"
              fill={cab}
              stroke="#111827"
              strokeWidth="1"
            />
          </g>
        </svg>
        <p className="taxi-status">
          <b className="taxi-finding">{t('Finding your driver…')}</b>
          <b className="taxi-arriving">{t('Driver arriving')}</b>
        </p>
        <p className="taxi-driver">
          <span className="taxi-plate">{plate}</span>
          <span>
            {driver} · ★ {rating}
          </span>
        </p>
      </div>
      <svg
        className="ride-svg taxi-interior ride-interior"
        viewBox={`0 0 ${VB.w} ${VB.h}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <Sky uid={uid} part={part} horizon={200} />
        <rect x={VB.x0} y="200" width={VB.x1 - VB.x0} height="400" fill={flavour.land} />
        <path d="M 192 200 L 208 200 L 700 600 L -300 600 Z" fill={flavour.asphalt} />
        {Array.from({ length: 6 }, (_, i) => (
          <rect
            key={i}
            ref={(el) => {
              sides.current[i] = el;
            }}
            fill={flavour.walls[i % flavour.walls.length]}
            stroke={flavour.roofs[i % flavour.roofs.length]}
            strokeWidth="3"
          />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <rect
            key={i}
            ref={(el) => {
              dashes.current[i] = el;
            }}
            fill={flavour.lane}
          />
        ))}
        <g ref={body}>
          {/* The cabin around the windscreen. */}
          <path
            fillRule="evenodd"
            fill={shade}
            d={`M ${VB.x0} ${VB.y0} H ${VB.x1} V ${VB.y1} H ${VB.x0} Z M 6 -20 Q 200 -50 394 -20 L 430 330 Q 200 316 -20 330 Z`}
          />
          <path d="M 6 -20 Q 200 -50 394 -20" stroke="#334155" strokeWidth="8" fill="none" />
          {/* Mirror and a charm hanging from it. */}
          <rect x="168" y="-22" width="64" height="18" rx="6" fill="#0f172a" />
          <rect x="172" y="-19" width="56" height="12" rx="4" fill={sky0} opacity="0.6" />
          <g transform="translate(200 -4)">
            <g ref={charm}>
              <line x1="0" y1="0" x2="0" y2="26" stroke="#e5e7eb" strokeWidth="1" />
              <path d="M -7 26 L 7 26 L 0 44 Z" fill="#16a34a" />
            </g>
          </g>
          {/* Dashboard and wheel. */}
          <path d="M -300 300 Q 200 280 700 300 L 700 420 L -300 420 Z" fill="#111827" />
          <rect x={dx - 60} y="306" width="120" height="16" rx="8" fill="#1f2937" />
          <ellipse cx={dx} cy="350" rx="62" ry="22" fill="none" stroke="#0b0f19" strokeWidth="9" />
          <rect x="182" y="300" width="36" height="24" rx="4" fill="#0f172a" stroke="#475569" />
          <rect x="186" y="304" width="28" height="16" rx="2" fill="#0f766e" opacity="0.8" />
          {/* Front seats: the driver, the empty passenger seat. */}
          <rect x={400 - dx - 54} y="330" width="108" height="300" rx="26" fill="#374151" />
          <rect x={400 - dx - 30} y="296" width="60" height="44" rx="14" fill="#4b5563" />
          <g transform={`translate(${dx} 300)`}>
            <path d="M -66 140 Q -64 70 0 64 Q 64 70 66 140 Z" fill={driverLook.top} />
            <rect x="-11" y="40" width="22" height="30" fill={driverLook.skin} />
            <ellipse cx="-30" cy="20" rx="6" ry="9" fill={driverLook.skin} />
            <ellipse cx="30" cy="20" rx="6" ry="9" fill={driverLook.skin} />
            <ellipse cx="0" cy="12" rx="31" ry="36" fill={driverLook.skin} />
            <path
              d="M -32 8 Q -34 -26 0 -26 Q 34 -26 32 8 Q 30 30 0 34 Q -30 30 -32 8 Z"
              fill={driverLook.hair}
            />
          </g>
          <rect x={dx - 58} y="400" width="116" height="300" rx="26" fill="#374151" />
          {/* Your knees on the back seat. */}
          <ellipse cx="150" cy="600" rx="56" ry="40" fill="#1f2937" />
          <ellipse cx="250" cy="600" rx="56" ry="40" fill="#1f2937" />
        </g>
      </svg>
      <div className="taxi-mini" aria-hidden>
        <svg viewBox={route.box} preserveAspectRatio="xMidYMid meet">
          <path
            d={route.d}
            stroke="#cbd5e1"
            strokeWidth={route.u * 9}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={route.d}
            stroke="#0f766e"
            strokeWidth={route.u * 4}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={route.end.x}
            cy={route.end.y}
            r={route.u * 6}
            fill="#ef4444"
            stroke="#fff"
            strokeWidth={route.u * 2}
          />
          <g ref={mini} data-mini-car="">
            <rect
              x={-route.u * 7}
              y={-route.u * 4}
              width={route.u * 14}
              height={route.u * 8}
              rx={route.u * 2}
              fill={cab}
              stroke="#111827"
              strokeWidth={route.u}
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
