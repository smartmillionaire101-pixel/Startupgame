/**
 * Cycling: side-on parallax in four layers (the sky for the time of day, the
 * city's skyline in its palette, buildings and billboards, the kerb and road
 * dashes) and you on your bike with a two-frameRef pedal cycle. The city's own
 * traffic (okada, keke, danfo…) passes the other way.
 */
import { useEffect, useRef } from 'react';
import { fnv } from '../travel';
import {
  Kerb,
  Repeat,
  SideTorso,
  SideVehicle,
  Sky,
  Skyline,
  slide,
  Street,
  trafficOf,
  VB,
  type SceneProps,
} from './art';

const P = 1000;
const ROAD = 470;

export function CycleScene({ uid, flavour, marketId, part, look, frameRef }: SceneProps) {
  const far = useRef<SVGGElement>(null);
  const mid = useRef<SVGGElement>(null);
  const near = useRef<SVGGElement>(null);
  const dashes = useRef<SVGGElement>(null);
  const legsA = useRef<SVGGElement>(null);
  const legsB = useRef<SVGGElement>(null);
  const wheels = useRef<(SVGGElement | null)[]>([]);
  const rider = useRef<SVGGElement>(null);
  const car = useRef<SVGGElement>(null);
  const traffic = trafficOf(flavour);
  const seed = fnv(marketId);

  useEffect(() => {
    frameRef.current = (ms) => {
      slide(far.current, ms, 14, P);
      slide(mid.current, ms, 70, P);
      slide(near.current, ms, 190, P);
      slide(dashes.current, ms, 260, 80);
      const pedal = Math.floor(ms / 170) % 2 === 0;
      legsA.current?.setAttribute('visibility', pedal ? 'visible' : 'hidden');
      legsB.current?.setAttribute('visibility', pedal ? 'hidden' : 'visible');
      const deg = ((ms / 1000) * 540) % 360;
      for (const w of wheels.current) w?.setAttribute('transform', `rotate(${deg.toFixed(0)})`);
      rider.current?.setAttribute(
        'transform',
        `translate(200 ${(ROAD + 35 + Math.sin(ms / 85) * 0.8).toFixed(1)})`,
      );
      // Oncoming traffic: one vehicle every 3.2 s.
      const cyc = (ms % 3200) / 3200;
      car.current?.setAttribute(
        'transform',
        `translate(${(1300 - cyc * 2400).toFixed(0)} ${ROAD + 30}) scale(0.85)`,
      );
    };
    return () => {
      frameRef.current = null;
    };
  }, [frameRef]);

  const v = traffic[seed % traffic.length]!;
  const wheel = (cx: number, n: number) => (
    <g transform={`translate(${cx} 0)`}>
      <circle r="19" fill="none" stroke="#111827" strokeWidth="4" />
      <g
        ref={(el) => {
          wheels.current[n] = el;
        }}
      >
        <path
          d="M -17 0 H 17 M 0 -17 V 17 M -12 -12 L 12 12 M -12 12 L 12 -12"
          stroke="#94a3b8"
          strokeWidth="1.2"
        />
      </g>
    </g>
  );

  return (
    <svg
      className="ride-svg"
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      preserveAspectRatio="xMidYMid meet"
      data-parallax="4"
      aria-hidden
    >
      <Sky uid={uid} part={part} horizon={ROAD} />
      <Repeat id={`${uid}-far`} period={P} layerRef={far}>
        <Skyline flavour={flavour} part={part} seed={seed} period={P} base={ROAD - 120} />
      </Repeat>
      <rect
        x={VB.x0}
        y={ROAD - 122}
        width={VB.x1 - VB.x0}
        height="130"
        fill={flavour.land}
        opacity="0.35"
      />
      <Repeat id={`${uid}-mid`} period={P} layerRef={mid}>
        <Street
          flavour={flavour}
          part={part}
          seed={seed + 1}
          period={P}
          base={ROAD - 10}
          signs={flavour.streets}
        />
      </Repeat>
      <rect x={VB.x0} y={ROAD - 12} width={VB.x1 - VB.x0} height="16" fill={flavour.sidewalk} />
      <Repeat id={`${uid}-near`} period={P} layerRef={near}>
        <Kerb flavour={flavour} period={P} base={ROAD + 2} />
      </Repeat>
      <rect
        x={VB.x0}
        y={ROAD + 4}
        width={VB.x1 - VB.x0}
        height={VB.y1 - ROAD}
        fill={flavour.asphalt}
      />
      <rect x={VB.x0} y={ROAD + 4} width={VB.x1 - VB.x0} height="4" fill={flavour.curb} />
      <g ref={dashes}>
        {Array.from({ length: 26 }, (_, k) => (
          <rect
            key={k}
            x={VB.x0 + k * 80}
            y={ROAD + 44}
            width="40"
            height="5"
            fill={flavour.lane}
          />
        ))}
      </g>
      <g ref={car}>
        <SideVehicle {...v} />
      </g>
      <g ref={rider} transform={`translate(200 ${ROAD + 35})`}>
        {/* The bike: wheels at y = 0 (the road surface is +25). */}
        <g transform="translate(0 6)">
          {wheel(-34, 0)}
          {wheel(34, 1)}
          <path
            d="M -34 0 L -8 -2 L 6 -30 L -14 -30 Z M -8 -2 L 34 0 M 6 -30 L 30 -38 L 34 0 M -16 -36 L -4 -36"
            stroke={flavour.roofs[0] ?? '#0f766e'}
            strokeWidth="4"
            strokeLinejoin="round"
            fill="none"
          />
          <path d="M 26 -44 L 36 -42" stroke="#111827" strokeWidth="4" strokeLinecap="round" />
        </g>
        {/* Two frames of pedalling. */}
        <g ref={legsA} stroke={look.bottom} strokeWidth="7" strokeLinecap="round" fill="none">
          <path d="M -8 -34 L 4 -20 L -2 -2" />
          <path d="M -8 -34 L -16 -16 L -10 2" opacity="0.7" />
        </g>
        <g
          ref={legsB}
          stroke={look.bottom}
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
          visibility="hidden"
        >
          <path d="M -8 -34 L -2 -16 L 6 -6" />
          <path d="M -8 -34 L -10 -20 L -16 -4" opacity="0.7" />
        </g>
        <g transform="translate(-6 -28)">
          <SideTorso look={look} lean={18} />
        </g>
        <path d="M 2 -64 L 30 -40" stroke={look.top} strokeWidth="6" strokeLinecap="round" />
      </g>
    </svg>
  );
}
