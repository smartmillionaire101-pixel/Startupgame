/**
 * The city's bus (danfo, matatu, trotro, poda-poda, Routemaster…): side-on
 * inside, seats, passengers, a conductor at the door calling the stops, the
 * street sliding past the windows, and a ticker naming the real districts
 * along the route.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../../i18n';
import { AvatarFigure, avatarLook } from '../art';
import { fnv } from '../travel';
import { Repeat, Sky, Skyline, slide, Street, VB, type SceneProps } from './art';

const P = 1000;
const BG = ['f-engineer', 'b-commercial', 'f-dropout', 'i-operator', 'f-corporate', 'b-fintech'];

export function BusScene({
  uid,
  flavour,
  marketId,
  part,
  look,
  frameRef,
  stops,
  livery,
}: SceneProps & { stops: string[]; livery: string }) {
  const far = useRef<SVGGElement>(null);
  const mid = useRef<SVGGElement>(null);
  const cabin = useRef<SVGGElement>(null);
  const conductor = useRef<SVGGElement>(null);
  const straps = useRef<(SVGGElement | null)[]>([]);
  const call = useRef<SVGTextElement>(null);
  const ticker = useRef<HTMLOListElement>(null);
  const seed = fnv(`${marketId}:bus`);

  useEffect(() => {
    let last = -1;
    frameRef.current = (ms, k) => {
      slide(far.current, ms, 20, P);
      slide(mid.current, ms, 120, P);
      const bump = Math.sin(ms / 120) * 1.4 + Math.sin(ms / 47) * 0.6;
      cabin.current?.setAttribute('transform', `translate(0 ${bump.toFixed(1)})`);
      conductor.current?.setAttribute(
        'transform',
        `translate(352 452) rotate(${(Math.sin(ms / 300) * 4).toFixed(1)})`,
      );
      straps.current.forEach((s, n) =>
        s?.setAttribute('transform', `rotate(${(Math.sin(ms / 260 + n) * 8).toFixed(1)})`),
      );
      // The next stop: the ticker moves on as the trip goes.
      const idx = Math.min(stops.length - 1, Math.floor(k * stops.length));
      if (idx !== last) {
        last = idx;
        if (call.current) call.current.textContent = `${stops[idx] ?? ''}!`;
        const items = ticker.current?.children;
        if (items)
          for (let i = 0; i < items.length; i++) {
            items[i]!.classList.toggle('is-next', i === idx);
            items[i]!.classList.toggle('is-past', i < idx);
          }
      }
    };
    return () => {
      frameRef.current = null;
    };
  }, [frameRef, stops]);

  // Passengers on the bench (you're one of them).
  const seats: ReactNode[] = [];
  for (let n = 0; n < 5; n++) {
    const x = 40 + n * 62;
    const you = n === 2;
    const l = you ? look : avatarLook(BG[(seed + n) % BG.length], `${marketId}:pax${n}`);
    seats.push(
      <g key={n} transform={`translate(${x} 470) scale(${n % 2 ? -2 : 2} 2)`}>
        <AvatarFigure look={l} />
      </g>,
    );
  }

  return (
    <div className="bus">
      <svg
        className="ride-svg bus-interior ride-interior"
        viewBox={`0 0 ${VB.w} ${VB.h}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <Sky uid={uid} part={part} horizon={330} />
        <Repeat id={`${uid}-far`} period={P} layerRef={far}>
          <Skyline flavour={flavour} part={part} seed={seed} period={P} base={260} />
        </Repeat>
        <Repeat id={`${uid}-mid`} period={P} layerRef={mid}>
          <Street
            flavour={flavour}
            part={part}
            seed={seed + 3}
            period={P}
            base={330}
            signs={stops}
          />
        </Repeat>
        <g ref={cabin}>
          {/* The body: wall, windows, roof rail. */}
          <path
            fillRule="evenodd"
            fill={livery}
            d={`M ${VB.x0} ${VB.y0} H ${VB.x1} V ${VB.y1} H ${VB.x0} Z ${Array.from(
              { length: 9 },
              (_, n) => {
                const x = -440 + n * 140;
                return `M ${x} 90 h 120 v 210 h -120 Z`;
              },
            ).join(' ')}`}
          />
          <rect x={VB.x0} y="296" width={VB.x1 - VB.x0} height="10" fill="#0f172a" opacity="0.35" />
          <rect x={VB.x0} y="52" width={VB.x1 - VB.x0} height="8" fill="#9ca3af" />
          {/* The route board over the windows, as painted on the bus. */}
          <rect x="-20" y="-6" width="440" height="40" rx="6" fill="#0f172a" />
          <text
            x="200"
            y="20"
            textAnchor="middle"
            fontSize="15"
            fontWeight="800"
            fill="#fbbf24"
            fontFamily="ui-monospace, monospace"
          >
            {stops.length > 1 ? `${stops[0]} → ${stops[stops.length - 1]}` : (stops[0] ?? '')}
          </text>
          {[60, 180, 300].map((x, n) => (
            <g key={n} transform={`translate(${x} 60)`}>
              <g
                ref={(el) => {
                  straps.current[n] = el;
                }}
              >
                <line y2="34" stroke="#4b5563" strokeWidth="3" />
                <ellipse cy="40" rx="7" ry="8" fill="none" stroke="#4b5563" strokeWidth="3" />
              </g>
            </g>
          ))}
          {/* Bench back, the people on it, the seat in front of them. */}
          <rect x={VB.x0} y="360" width={VB.x1 - VB.x0} height="80" rx="10" fill="#7f1d1d" />
          {seats}
          <rect x={VB.x0} y="450" width={VB.x1 - VB.x0} height="40" rx="8" fill="#991b1b" />
          <rect x={VB.x0} y="490" width={VB.x1 - VB.x0} height={VB.y1 - 490} fill="#1f2937" />
          {/* The conductor, hanging on at the door, calling the next stop. */}
          <g ref={conductor} transform="translate(352 452)">
            <g transform="scale(-2.1 2.1)">
              <AvatarFigure look={avatarLook('b-commercial', `${marketId}:conductor`)} />
            </g>
          </g>
          <g transform="translate(300 250)">
            <path
              d="M 0 0 h 96 a 10 10 0 0 1 10 10 v 22 a 10 10 0 0 1 -10 10 h -70 l -10 12 l -2 -12 h -14 a 10 10 0 0 1 -10 -10 v -22 a 10 10 0 0 1 10 -10 Z"
              fill="#fff"
              transform="translate(-60 0)"
            />
            <text
              ref={call}
              x="-7"
              y="27"
              textAnchor="middle"
              fontSize="13"
              fontWeight="800"
              fill="#0f172a"
              fontFamily="system-ui, sans-serif"
            >
              {stops[0] ?? ''}!
            </text>
          </g>
        </g>
      </svg>
      <div className="bus-ticker" data-stop-ticker="">
        <span className="bus-ticker-label">{t('Next stop')}</span>
        <ol ref={ticker} aria-label={t('Stops')}>
          {stops.map((s, n) => (
            <li key={n} className={n === 0 ? 'is-next' : ''}>
              {s}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
