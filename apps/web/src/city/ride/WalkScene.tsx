/**
 * Walking: a top-down camera following you up a procedural street strip
 * (shops and vendors' umbrellas on one side, the road on the other), with a
 * few people walking the other way and the city's traffic passing.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { avatarLook, type AvatarLook } from '../art';
import { fnv, seeded } from '../travel';
import { trafficOf, VB, type SceneProps } from './art';

const H = 1400;
const WALK = 150;
const ROAD_X = 230;

/** A person seen from above: shoulders, head and two stepping feet. */
function TopPerson({
  look,
  feet,
}: {
  look: AvatarLook;
  feet?: (el: SVGGElement | null, n: number) => void;
}) {
  return (
    <g>
      <ellipse cx="2" cy="4" rx="15" ry="12" fill="#0f172a" opacity="0.18" />
      <g ref={(el) => feet?.(el, 0)}>
        <ellipse cx="-6" cy="-12" rx="4" ry="6" fill="#1f2937" />
      </g>
      <g ref={(el) => feet?.(el, 1)}>
        <ellipse cx="6" cy="10" rx="4" ry="6" fill="#1f2937" />
      </g>
      <ellipse cx="0" cy="0" rx="16" ry="10" fill={look.top} />
      <circle cx="0" cy="-1" r="8.5" fill={look.hair} />
      {look.accessory === 'cap' && <ellipse cx="0" cy="-8" rx="6" ry="4" fill={look.top} />}
    </g>
  );
}

export function WalkScene({ uid, flavour, marketId, look, frameRef }: SceneProps) {
  const strip = useRef<SVGGElement>(null);
  const feet = useRef<(SVGGElement | null)[]>([]);
  const others = useRef<(SVGGElement | null)[]>([]);
  const cars = useRef<(SVGGElement | null)[]>([]);
  const seed = fnv(`${marketId}:walk`);
  const traffic = trafficOf(flavour);

  useEffect(() => {
    frameRef.current = (ms) => {
      const s = (ms / 1000) * 110;
      strip.current?.setAttribute('transform', `translate(0 ${(s % H).toFixed(1)})`);
      const step = Math.floor(ms / 260) % 2;
      feet.current.forEach((f, n) =>
        f?.setAttribute('transform', `translate(0 ${(n === step ? -5 : 5) * (n ? -1 : 1)})`),
      );
      others.current.forEach((o, n) => {
        const y = ((s * 1.7 + n * 260) % 1300) - 400;
        o?.setAttribute(
          'transform',
          `translate(${WALK + (n % 2 ? -34 : 30)} ${y.toFixed(0)}) rotate(180)`,
        );
      });
      cars.current.forEach((c, n) => {
        const y = n ? ((s * 3.4 + 600) % 1800) - 500 : 1300 - ((s * 2.2) % 1800);
        c?.setAttribute(
          'transform',
          `translate(${ROAD_X + (n ? 110 : 50)} ${y.toFixed(0)}) rotate(${n ? 180 : 0})`,
        );
      });
    };
    return () => {
      frameRef.current = null;
    };
  }, [frameRef]);

  const rnd = seeded(seed);
  const tiles: ReactNode[] = [];
  // Shopfronts, awnings and vendors' umbrellas, top-down.
  for (let y = 0, k = 0; y < H; k++) {
    const h = 90 + Math.floor(rnd() * 90);
    const wall = flavour.walls[k % flavour.walls.length]!;
    const roof = flavour.roofs[k % flavour.roofs.length]!;
    tiles.push(
      <g key={`s${k}`}>
        <rect x={VB.x0} y={y} width={WALK - 60 - VB.x0} height={h - 6} fill={roof} />
        <rect x={WALK - 100} y={y + 8} width="34" height={h - 22} fill={wall} />
        <path
          d={`M ${WALK - 66} ${y + 10} h 14 v ${h - 26} h -14 Z`}
          fill={k % 2 ? '#ef4444' : '#0ea5e9'}
          opacity="0.9"
        />
      </g>,
    );
    if (k % 2 === 0)
      tiles.push(
        <g key={`u${k}`} transform={`translate(${WALK - 30} ${y + h / 2})`}>
          <circle r="22" fill={k % 4 ? '#f59e0b' : '#16a34a'} />
          <path d="M -22 0 H 22 M 0 -22 V 22" stroke="#fff" strokeWidth="3" opacity="0.7" />
          <rect x="-12" y="18" width="24" height="12" rx="2" fill="#92400e" />
        </g>,
      );
    y += h;
  }
  const lane = Array.from({ length: Math.ceil(H / 70) }, (_, k) => (
    <rect key={`l${k}`} x={ROAD_X + 78} y={k * 70} width="5" height="34" fill={flavour.lane} />
  ));
  const block = (
    <>
      <rect x={WALK - 60} y="0" width={ROAD_X - WALK + 60} height={H} fill={flavour.sidewalk} />
      <rect x={ROAD_X} y="0" width={VB.x1 - ROAD_X} height={H} fill={flavour.asphalt} />
      <rect x={ROAD_X - 6} y="0" width="6" height={H} fill={flavour.curb} />
      {lane}
      {tiles}
    </>
  );
  const walkers = Array.from({ length: 4 }, (_, n) =>
    avatarLook(`f-${['engineer', 'dropout', 'corporate', 'consultant'][n]}`, `${marketId}:w${n}`),
  );

  return (
    <svg
      className="ride-svg"
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      preserveAspectRatio="xMidYMid meet"
      data-walk-strip=""
      aria-hidden
    >
      <rect x={VB.x0} y={VB.y0} width={VB.x1 - VB.x0} height={VB.y1 - VB.y0} fill={flavour.land} />
      <defs>
        <g id={`${uid}-strip`}>{block}</g>
      </defs>
      <g ref={strip}>
        {[-2, -1, 0].map((n) => (
          <use key={n} href={`#${uid}-strip`} y={n * H + 200} />
        ))}
      </g>
      {[0, 1].map((n) => {
        const v = traffic[(seed + n) % traffic.length]!;
        return (
          <g
            key={n}
            ref={(el) => {
              cars.current[n] = el;
            }}
          >
            <rect x="-17" y="-34" width="34" height="68" rx="9" fill={v.body} />
            <rect x="-13" y="-22" width="26" height="14" rx="3" fill="#1e293b" opacity="0.75" />
            <rect x="-13" y="14" width="26" height="10" rx="3" fill="#1e293b" opacity="0.6" />
          </g>
        );
      })}
      {walkers.map((l, n) => (
        <g
          key={n}
          ref={(el) => {
            others.current[n] = el;
          }}
        >
          <TopPerson look={l} />
        </g>
      ))}
      <g transform={`translate(${WALK + 8} 380)`} className="ride-you">
        <circle r="26" fill="none" stroke="#fff" strokeWidth="3" opacity="0.8" />
        <TopPerson
          look={look}
          feet={(el, n) => {
            feet.current[n] = el;
          }}
        />
      </g>
    </svg>
  );
}
