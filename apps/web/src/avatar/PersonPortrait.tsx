/**
 * PersonPortrait: a person's head and shoulders rendered from the game's 3D
 * person (the CC0 model, front three-quarter, lit like the game), a drop-in
 * for ./Portrait.tsx with the same props and sizes:
 *
 *     <PortraitOf look={look} size={72} />        →  <PersonPortraitOf look={look} size={72} />
 *     <Portrait id={id} bg={bg} gender={g} />     →  <PersonPortrait id={id} bg={bg} gender={g} />
 *
 * It is the same `svg.portrait` (round by CSS, the soft `.portrait-bg`
 * behind, data-hair / data-skin / data-top on it) with the picture inside.
 * The flat portrait (./portrait.ts) is drawn until the picture is ready, and
 * for good where it can't be (no WebGL, the models off or failed, tests);
 * once the picture shows, the flat shapes stay in the page, hidden. Pictures
 * are drawn lazily (on screen), one at a time, and kept: see
 * ../three-kit/humans/spriteCache.ts and ../city/PersonSprite.tsx.
 */
import { memo, useMemo, useRef } from 'react';
import { avatarLook, type AvatarLook } from '../city/art';
import { useLookVersion } from '../city/acts/look';
import { useSprite } from '../three-kit/humans/useSprite';
import { PortraitShapes } from './Portrait';
import './avatar.css';

/** The portrait of a look. `size` in CSS pixels (or any CSS length: measured). */
export const PersonPortraitOf = memo(function PersonPortraitOf({
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
  const box = useRef<SVGSVGElement>(null);
  const { url, state } = useSprite(
    { kind: 'portrait', look, ...(typeof size === 'number' ? { cssPx: size } : {}) },
    box,
  );
  return (
    <svg
      ref={box}
      className={`portrait${className ? ` ${className}` : ''}`}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      data-hair={look.hairStyle}
      data-skin={look.skin}
      data-top={look.top}
      data-sprite={state}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <rect className="portrait-bg" x="0" y="0" width="100" height="100" />
      <g visibility={url ? 'hidden' : undefined}>
        <PortraitShapes look={look} />
      </g>
      {url && <image href={url} x="0" y="0" width="100" height="100" />}
    </svg>
  );
});

/** The portrait of a person by id, as every other drawing of them shows them. */
export function PersonPortrait({
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
  return <PersonPortraitOf look={look} size={size} className={className} label={label} />;
}
