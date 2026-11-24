/**
 * A person on the Lite map (./PersonSprite.tsx pictures): a two-frame walk
 * that steps while an ancestor has `.is-walking`, and optionally a standing
 * picture for when they stop. The frames take turns in CSS (city.css,
 * `.walk-sprite`), and only once both are drawn: until then, or with no
 * WebGL, one figure shows (the 2D one, whose legs swing as before).
 *
 * Map people are seen from a little above and to the side: three-quarter.
 * The picture faces right (the map's own flip turns it left).
 */
import type { AvatarLook } from './art';
import { PersonSprite } from './PersonSprite';

export function WalkSprite({
  look,
  rest = false,
  frames = 2,
}: {
  look: AvatarLook;
  rest?: boolean;
  /** 1: one walking picture, no stepping (half the drawing, for passers-by). */
  frames?: 1 | 2;
}) {
  return (
    <g className={`walk-sprite${rest ? ' has-rest' : ''}`}>
      {rest && (
        <g className="ws-rest">
          <PersonSprite look={look} angle="three-quarter" flip />
        </g>
      )}
      <g className="ws-a">
        <PersonSprite look={look} pose="walk" phase={0} angle="three-quarter" flip />
      </g>
      {frames === 2 && (
        <g className="ws-b">
          <PersonSprite
            look={look}
            pose="walk"
            phase={0.5}
            angle="three-quarter"
            flip
            shadow={false}
          />
        </g>
      )}
    </g>
  );
}
