/**
 * Wave 8 §B: people in a pose. `AvatarFigure` stands; acts also need someone
 * sitting (a chair, a stool, a cinema seat) and lying (a massage table).
 * Feet (or the seat) at (0,0), like `AvatarFigure`.
 */
import { AvatarFigure, shade, type AvatarLook } from '../art';

/** Room scale for a person whose feet are at room y (the same as the room's own people). */
export const roomScale = (y: number) => 1.3 + ((y - 140) / 100) * 0.65;

/**
 * Seated, facing you: the body drops onto the seat (at y = -9), knees
 * forward, shins down to the floor. The figure's own legs are hidden.
 */
export function SeatedFigure({ look }: { look: AvatarLook }) {
  const shoe = '#111827';
  return (
    <g className="act-seated">
      <ellipse cx="0" cy="0" rx="7.5" ry="2.6" fill="#0f172a" opacity="0.2" />
      {/* Shins and shoes. */}
      <rect x="-4.2" y="-7" width="3.4" height="7" rx="1.5" fill={shade(look.bottom, -0.1)} />
      <rect x="0.8" y="-7" width="3.4" height="7" rx="1.5" fill={shade(look.bottom, -0.22)} />
      <ellipse cx="-2.5" cy="-0.6" rx="2.6" ry="1.4" fill={shoe} />
      <ellipse cx="2.5" cy="-0.6" rx="2.6" ry="1.4" fill={shoe} />
      {/* The upper body, lowered onto the seat. */}
      <g transform="translate(0 4)">
        <AvatarFigure look={look} />
      </g>
      {/* Thighs toward you (foreshortened), over the hips. */}
      <rect x="-5.4" y="-10.5" width="5" height="5" rx="2.2" fill={shade(look.bottom, 0.08)} />
      <rect x="0.4" y="-10.5" width="5" height="5" rx="2.2" fill={look.bottom} />
    </g>
  );
}

/** Lying on your front, head to the left (a massage table), at table height. */
export function LyingFigure({ look }: { look: AvatarLook }) {
  return (
    <g className="act-lying" transform="rotate(-90) translate(0 0)">
      <AvatarFigure look={look} />
    </g>
  );
}
