/**
 * Phase 6a: a person's head and shoulders, drawn from their look
 * (./portrait.ts). Give it a `look`, or an `id` (and background and gender)
 * to draw that person as `avatarLook` sees them, saved creator look included.
 */
import { memo, useMemo } from 'react';
import { avatarLook, type AvatarLook } from '../city/art';
import { useLookVersion } from '../city/acts/look';
import { portraitShapes, type Shape } from './portrait';
import './avatar.css';

function ShapeEl({ s }: { s: Shape }) {
  const common = { 'data-part': s.part, opacity: s.o } as const;
  if (s.el === 'ellipse')
    return <ellipse {...common} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={s.fill} />;
  if (s.el === 'rect')
    return (
      <rect
        {...common}
        x={s.x}
        y={s.y}
        width={s.w}
        height={s.h}
        rx={s.r}
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={s.sw}
      />
    );
  return (
    <path
      {...common}
      d={s.d}
      fill={s.fill}
      stroke={s.stroke}
      strokeWidth={s.sw}
      strokeLinecap="round"
    />
  );
}

/** The portrait of a look. `size` in CSS pixels (or any CSS length). */
export const PortraitOf = memo(function PortraitOf({
  look,
  size = 48,
  className,
  label,
}: {
  look: AvatarLook;
  size?: number | string;
  className?: string;
  /** Read out by screen readers; without it the portrait is decoration. */
  label?: string;
}) {
  const shapes = useMemo(() => portraitShapes(look), [look]);
  return (
    <svg
      className={`portrait${className ? ` ${className}` : ''}`}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      data-hair={look.hairStyle}
      data-skin={look.skin}
      data-top={look.top}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {/* Round by CSS (border-radius), so many portraits on a page share no ids. */}
      <rect className="portrait-bg" x="0" y="0" width="100" height="100" />
      {shapes.map((s, i) => (
        <ShapeEl key={i} s={s} />
      ))}
    </svg>
  );
});

/** The portrait of a person by id, as every other drawing of them shows them. */
export function Portrait({
  id,
  bg,
  gender,
  size,
  className,
  label,
}: {
  id: string;
  bg?: string;
  gender?: 'female' | 'male' | null;
  size?: number | string;
  className?: string;
  label?: string;
}) {
  // A look saved in the creator (or a haircut) redraws every portrait of them.
  const v = useLookVersion();
  const look = useMemo(
    () => avatarLook(bg, id, gender),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- v: a saved look changed
    [bg, id, gender, v],
  );
  return <PortraitOf look={look} size={size} className={className} label={label} />;
}
