/**
 * The planes, drawn once and used wherever one shows: the apron from above,
 * the gate window, take-off and landing. An airliner (twin engines under
 * swept wings, the fin and tailplane at the back) and a business jet (engines
 * on the rear fuselage, a T-tail), side-on facing right with the wheels at
 * y = 0, or from above with the nose along +x. Proportions follow a real
 * narrow-body: the wing root a little ahead of the middle, short gear.
 *
 * The gear sits in its own group (`.pl-gear`) so a scene can fold it away
 * in flight; `gear={false}` leaves it out.
 */
export type PlaneKind = 'airliner' | 'bizjet';

/** The top of the lifestyle ladder flies its own jet. */
export const fliesPrivate = (tier: number | undefined) => (tier ?? 2) >= 5;

const SKIN = '#f8fafc';
const BELLY = '#e2e8f0';
const LINE = '#94a3b8';
const METAL = '#cbd5e1';
const GLASS = '#1e293b';
const TYRE = '#1f2937';

/** Landing gear: a strut, a door and the wheels, hanging from `top`. */
function Leg({ x, top, r, pair }: { x: number; top: number; r: number; pair?: boolean }) {
  return (
    <g>
      <rect x={x - 0.7} y={top} width="1.4" height={-top - r} fill="#64748b" />
      {pair ? (
        <>
          <circle cx={x - r * 0.9} cy={-r} r={r} fill={TYRE} />
          <circle cx={x + r * 0.9} cy={-r} r={r} fill={TYRE} />
          <circle cx={x - r * 0.9} cy={-r} r={r * 0.4} fill="#9ca3af" />
          <circle cx={x + r * 0.9} cy={-r} r={r * 0.4} fill="#9ca3af" />
        </>
      ) : (
        <>
          <circle cx={x} cy={-r} r={r} fill={TYRE} />
          <circle cx={x} cy={-r} r={r * 0.4} fill="#9ca3af" />
        </>
      )}
    </g>
  );
}

function AirlinerSide({ livery, gear }: { livery: string; gear: boolean }) {
  return (
    <g data-plane-kind="airliner">
      {gear && (
        <g className="pl-gear">
          <Leg x={48} top={-12.5} r={2.6} />
          <Leg x={-6} top={-12.5} r={3.1} pair />
        </g>
      )}
      {/* Tailplane, the far side's tip showing past the fuselage. */}

      {/* Fuselage: a round nose, a straight cabin, the tail cone sweeping up. */}
      <path
        d="M 62 -16.5 C 61.2 -22.6 56 -26.5 46 -26.5 L -36 -26.5 C -46 -26.5 -56 -26 -63 -24.4 L -64.4 -22.4 C -56 -19.6 -44 -12.8 -32 -11.5 L 50 -11.5 C 57 -11.5 62 -13.2 62 -16.5 Z"
        fill={SKIN}
        stroke={LINE}
        strokeWidth="0.6"
      />
      <path
        d="M 61.6 -14.5 C 60 -12.2 56 -11.5 50 -11.5 L -32 -11.5 C -40 -12.4 -48 -16 -54 -18.8 L -50 -15.6 L 52 -15.6 Z"
        fill={BELLY}
      />
      {/* Tailplane, swept like the wing. */}
      <path
        d="M -47 -21.6 L -62 -26.4 L -68 -26 L -57 -19.6 Z"
        fill={METAL}
        stroke={LINE}
        strokeWidth="0.5"
      />
      {/* Livery: the cheatline and the fin. */}
      <path d="M -48 -17.4 L 56 -17.4 L 57.8 -15.8 L -46 -15.8 Z" fill={livery} />
      <path d="M -36 -26.4 L -55.5 -51 L -62.5 -51 L -63.6 -25 Z" fill={livery} />
      <path d="M -41 -27 L -56.4 -46.5 L -58 -46.5 L -48 -27 Z" fill="#fff" opacity="0.28" />
      <circle cx="-56" cy="-36" r="3.2" fill="#fff" opacity="0.85" />
      {/* Cabin windows, doors, the cockpit. */}
      <g fill={GLASS}>
        {Array.from({ length: 19 }, (_, k) => (
          <rect key={k} x={-40 + k * 4.3} y="-22.6" width="2.1" height="3" rx="1" />
        ))}
      </g>
      <g fill="none" stroke={LINE} strokeWidth="0.5">
        <rect x="42" y="-24.6" width="3.6" height="8.6" rx="1" />
        <rect x="-35" y="-24.6" width="3.4" height="8.6" rx="1" />
      </g>
      <path d="M 50.5 -23.4 L 55.4 -23.6 L 58.8 -20.4 L 51 -20.3 Z" fill={GLASS} />
      <path d="M 53.4 -23.6 L 53.4 -20.3" stroke={SKIN} strokeWidth="0.5" />
      {/* The near wing, low and swept, with a winglet, and its engine. */}
      <path
        d="M 19 -14 L -16 -6.8 L -24 -6.8 L -12 -13.4 Z"
        fill={METAL}
        stroke={LINE}
        strokeWidth="0.5"
      />
      <path d="M -12 -13.4 L -24 -6.8 L -21.4 -6.8 L -9 -13.4 Z" fill="#94a3b8" opacity="0.7" />
      <path
        d="M -20 -6.8 L -23.2 -10.6 L -24.8 -10.6 L -24 -6.8 Z"
        fill={METAL}
        stroke={LINE}
        strokeWidth="0.4"
      />
      <rect x="7" y="-13.6" width="7" height="2.4" fill={METAL} />
      <rect
        x="3"
        y="-12.4"
        width="19"
        height="8"
        rx="4"
        fill={BELLY}
        stroke={LINE}
        strokeWidth="0.5"
      />
      <path d="M 3.6 -10.6 L -1.6 -8.4 L 3.6 -6.2 Z" fill="#64748b" />
      <ellipse cx="21.6" cy="-8.4" rx="1.4" ry="3.6" fill="#334155" />
      <rect x="12" y="-12.4" width="3" height="8" fill={livery} opacity="0.9" />
    </g>
  );
}

function BizjetSide({ livery, gear }: { livery: string; gear: boolean }) {
  return (
    <g data-plane-kind="bizjet">
      {gear && (
        <g className="pl-gear">
          <Leg x={30} top={-9.5} r={2} />
          <Leg x={-8} top={-9.5} r={2.5} />
        </g>
      )}
      {/* The near wing, low and swept, a winglet at the tip. */}
      <path
        d="M 10 -10 L -16 -4.8 L -23 -4.8 L -10 -9.8 Z"
        fill={METAL}
        stroke={LINE}
        strokeWidth="0.5"
      />
      <path d="M -19.6 -4.8 L -23.4 -10 L -25 -10 L -23 -4.8 Z" fill={livery} />
      {/* Fuselage: a long pointed nose, slim cabin, tail cone. */}
      <path
        d="M 45 -12.6 C 42 -17.4 36 -19.4 27 -19.4 L -26 -19.4 C -34 -19.4 -40 -18.6 -44.6 -17 L -45 -15 C -39 -12.4 -30 -9.2 -22 -9.2 L 30 -9.2 C 37 -9.2 43 -10.4 45 -12.6 Z"
        fill={SKIN}
        stroke={LINE}
        strokeWidth="0.6"
      />
      <path d="M -40 -13.8 L 40 -13.8 L 42.2 -12.4 L -38 -12.4 Z" fill={livery} />
      {/* T-tail: the fin in the livery, the tailplane on top. */}
      <path d="M -27 -19.2 L -38 -37 L -44 -37 L -44.6 -17.4 Z" fill={livery} />
      <path
        d="M -34.6 -36 L -47.6 -38.6 L -50 -37.4 L -41 -35 Z"
        fill={METAL}
        stroke={LINE}
        strokeWidth="0.4"
      />
      {/* Oval cabin windows, the door, the cockpit. */}
      <g fill={GLASS}>
        {Array.from({ length: 6 }, (_, k) => (
          <ellipse key={k} cx={-12 + k * 5.2} cy="-16.2" rx="1.4" ry="1.8" />
        ))}
      </g>
      <rect
        x="20"
        y="-18.4"
        width="3.6"
        height="8.2"
        rx="1.4"
        fill="none"
        stroke={LINE}
        strokeWidth="0.5"
      />
      <path d="M 29.4 -18 L 34.6 -17.8 L 38.6 -15 L 30.4 -15 Z" fill={GLASS} />
      {/* An engine on each side of the rear fuselage. */}
      <rect x="-25" y="-22" width="6" height="3" fill={METAL} />
      <rect
        x="-33"
        y="-24.6"
        width="17"
        height="6.4"
        rx="3.2"
        fill={BELLY}
        stroke={LINE}
        strokeWidth="0.5"
      />
      <ellipse cx="-16.4" cy="-21.4" rx="1" ry="2.8" fill="#334155" />
      <path d="M -33 -23 L -36.4 -21.4 L -33 -19.8 Z" fill="#64748b" />
    </g>
  );
}

/** A plane side-on, facing right, wheels on the ground at y = 0. */
export function PlaneSide({
  kind = 'airliner',
  livery = '#0f766e',
  gear = true,
}: {
  kind?: PlaneKind;
  livery?: string;
  gear?: boolean;
}) {
  return kind === 'bizjet' ? (
    <BizjetSide livery={livery} gear={gear} />
  ) : (
    <AirlinerSide livery={livery} gear={gear} />
  );
}

const TOP_WINGS = 'M 7 -3 L -8 -21 L -12.5 -21 L -5 -3 Z M 7 3 L -8 21 L -12.5 21 L -5 3 Z';
const TOP_BODY =
  'M 23 0 C 23 -2.2 21 -3.2 17 -3.2 L -14 -3.2 C -18 -3 -21.6 -1.8 -24 0 C -21.6 1.8 -18 3 -14 3.2 L 17 3.2 C 21 3.2 23 2.2 23 0 Z';
const JET_WINGS = 'M 3 -1.8 L -6 -14 L -9 -14 L -5 -1.8 Z M 3 1.8 L -6 14 L -9 14 L -5 1.8 Z';
const JET_BODY =
  'M 17 0 C 16 -1.6 13 -2.3 9 -2.3 L -11 -2.3 C -14 -2.1 -16.4 -1.2 -18 0 C -16.4 1.2 -14 2.1 -11 2.3 L 9 2.3 C 13 2.3 16 1.6 17 0 Z';

/** A plane from above, nose along +x, about 47 long. */
export function PlaneTop({ kind = 'airliner', livery }: { kind?: PlaneKind; livery: string }) {
  if (kind === 'bizjet')
    return (
      <g data-plane-kind="bizjet">
        <g transform="translate(2 3)" fill="#0f172a" opacity="0.14">
          <path d={JET_WINGS} />
          <path d={JET_BODY} />
        </g>
        <path d={JET_WINGS} fill={METAL} stroke={LINE} strokeWidth="0.5" />
        <path
          d="M -12 -1 L -16 -6 L -17.6 -6 L -15.6 -1 Z M -12 1 L -16 6 L -17.6 6 L -15.6 1 Z"
          fill={METAL}
        />
        <path d={JET_BODY} fill={SKIN} stroke={LINE} strokeWidth="0.5" />
        <rect
          x="-12"
          y="-4.6"
          width="6"
          height="2.2"
          rx="1.1"
          fill={BELLY}
          stroke={LINE}
          strokeWidth="0.4"
        />
        <rect
          x="-12"
          y="2.4"
          width="6"
          height="2.2"
          rx="1.1"
          fill={BELLY}
          stroke={LINE}
          strokeWidth="0.4"
        />
        <path d="M -13 -0.5 L -18 -0.4 L -18 0.4 L -13 0.5 Z" fill={livery} />
        <path d="M 14.8 -1 Q 15.8 0 14.8 1 L 13.6 0.8 L 13.6 -0.8 Z" fill={GLASS} />
        <path
          d="M -6 -14 L -9 -14 L -8.6 -12.6 L -5.8 -12.6 Z M -6 14 L -9 14 L -8.6 12.6 L -5.8 12.6 Z"
          fill={livery}
        />
      </g>
    );
  return (
    <g data-plane-kind="airliner">
      <g transform="translate(2 3)" fill="#0f172a" opacity="0.14">
        <path d={TOP_WINGS} />
        <path d={TOP_BODY} />
      </g>
      {/* Engines slung under swept wings, from a little ahead of the middle. */}
      <rect
        x="0.4"
        y="-10.4"
        width="7.6"
        height="3"
        rx="1.5"
        fill={BELLY}
        stroke={LINE}
        strokeWidth="0.4"
      />
      <rect
        x="0.4"
        y="7.4"
        width="7.6"
        height="3"
        rx="1.5"
        fill={BELLY}
        stroke={LINE}
        strokeWidth="0.4"
      />
      <path d={TOP_WINGS} fill={METAL} stroke={LINE} strokeWidth="0.5" />
      <path
        d="M -8 -21 L -12.5 -21 L -12 -19.6 L -7.8 -19.6 Z M -8 21 L -12.5 21 L -12 19.6 L -7.8 19.6 Z"
        fill={livery}
      />
      {/* Tailplane. */}
      <path
        d="M -15 -2 L -21 -9.4 L -23.6 -9.4 L -20.4 -1.4 Z M -15 2 L -21 9.4 L -23.6 9.4 L -20.4 1.4 Z"
        fill={METAL}
        stroke={LINE}
        strokeWidth="0.4"
      />
      {/* Fuselage, tapering to the tail. */}
      <path d={TOP_BODY} fill={SKIN} stroke={LINE} strokeWidth="0.5" />
      {/* The fin from above, in the livery, and a crown stripe. */}
      <path d="M -14 -0.8 L -24 -0.4 L -24 0.4 L -14 0.8 Z" fill={livery} />
      <path d="M 16 -0.5 L -12 -0.5 L -12 0.5 L 16 0.5 Z" fill={livery} opacity="0.55" />
      <path d="M 20.8 -1.7 Q 22.2 0 20.8 1.7 L 19.4 1.3 L 19.4 -1.3 Z" fill={GLASS} />
    </g>
  );
}
