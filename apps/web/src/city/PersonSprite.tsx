/**
 * PersonSprite: a person as a picture of the game's real 3D person (the CC0
 * Quaternius model the 3D views draw, in their look and a pose), for the
 * places that still draw the flat 2D `AvatarFigure` (./art.tsx).
 *
 * ## Swapping AvatarFigure → PersonSprite
 *
 * Inside an SVG scene, the same place, the same units, feet on the same spot:
 *
 *     <AvatarFigure look={look} />
 *     <PersonSprite look={look} />                        // standing, facing you
 *     <PersonSprite look={look} pose="walk" angle="side" flip />
 *
 * In HTML (a card, a list), a box `height` CSS pixels tall (width 0.64 ×):
 *
 *     <PersonSprite html look={look} height={120} pose="wave" />
 *
 * Props: `look` (an `AvatarLook`, from `avatarLook(...)` as AvatarFigure
 * takes), `pose` (default 'stand'), `angle` (default 'front'), `phase` (0..1,
 * the moment of the pose: two phases of 'walk' make a two-frame walk),
 * `flip` (mirror: walking left), `label` (screen readers), `html` +
 * `height` (an HTML box instead of SVG content), `shadow` (the ground
 * shadow, on by default), `className`.
 *
 * Poses (`SPRITE_POSES`): stand, idle, walk, run, sit, dance, eat, drink,
 * type, read, play, cheer, wave, chat, present, clap, browse, sing, squat,
 * lift, kick, stir, cut (lie and lieSide too, but they don't fit the upright
 * frame). Seated poses (sit, eat, drink, type, read, play) sit on a 0.45 m
 * seat with the feet still at (0,0): the seat is at y ≈ -10. A bag, a
 * briefcase, a glass and so on come from the look (`bag`…), not the pose.
 *
 * Angles: front, three-quarter (their left side turned to you), side (their
 * left profile; `flip` for the right), back, top (from high above, for a map;
 * the person is foreshortened, feet still at the anchor).
 *
 * The frame is `FRAME` (x -16..16, y -48..2, the wardrobe's figure box): a
 * person 1.75 m tall stands 38 units, like AvatarFigure. Poses that reach
 * up or out (cheer, dance, sing: `REACH_POSES`) draw a bigger picture,
 * `REACH_FRAME` (x -25..25, y -60..2), at the same place and scale: the body
 * is where it always is, the raised hands overflow `FRAME` by up to 12
 * units above and 6 each side, so give those poses room (the HTML box lets
 * them overflow; inside an SVG, leave room or let it overflow).
 *
 * ## Fallback
 *
 * The 2D figure is drawn until the picture is ready, and for good where it
 * can't be (no WebGL, `runway.models` or `runway.sprites` = off, the models
 * failed to load, unit tests): nothing is ever blank. Once the picture shows,
 * the 2D figure stays in the page, hidden, so its data-* attributes (what the
 * look is) are still there for tests and tools. The picture is drawn once,
 * lazily (when the element nears the screen), one at a time, and kept (an LRU
 * this session, CacheStorage across visits): ../three-kit/humans/spriteCache.ts.
 *
 * Look fields: skin, hair colour and style (the kit's heads; an afro,
 * twists, a man's bun, braids and locs, a woman's buzz cut, and hair under
 * headwear are the game's own hair fitted to the model's head), facial hair
 * (grown on the jaw, lips left bare),
 * glasses, headwear, top style (tee, hoodie, shirt, blazer, suit, dress,
 * kaftan as the kit's nearest outfit, recoloured), top and bottom colours,
 * legs (jeans, chinos), shoes, tie, watch, necklace, earrings, scarf, belt
 * and bag, all as the 3D views draw them. Not mapped: `face` (face shape:
 * the model has one head shape per hairstyle) and `socks` (hidden by the
 * model's trousers).
 */
import { useRef } from 'react';
import { AvatarFigure, type AvatarLook } from './art';
import { SeatedFigure } from './acts/figure';
import { useSprite } from '../three-kit/humans/useSprite';
import {
  FRAME,
  SEATED,
  frameFor,
  type SpriteAngle,
  type SpritePose,
} from '../three-kit/humans/spriteCache';

export type { SpriteAngle, SpritePose } from '../three-kit/humans/spriteCache';
export { SPRITE_POSES } from '../three-kit/humans/spriteCache';

export interface PersonSpriteProps {
  look: AvatarLook;
  pose?: SpritePose;
  angle?: SpriteAngle;
  phase?: number;
  flip?: boolean;
  label?: string;
  /** An HTML box (`height` CSS px tall) instead of SVG content. */
  html?: boolean;
  /** The picture's height in CSS pixels (the HTML box's; in SVG, measured when not given). */
  height?: number;
  shadow?: boolean;
  className?: string;
}

/** The 2D drawing for a pose (the fallback). */
function Fallback({ look, pose, label }: { look: AvatarLook; pose: SpritePose; label?: string }) {
  return SEATED.has(pose) ? (
    <SeatedFigure look={look} />
  ) : (
    <AvatarFigure look={look} label={label} />
  );
}

/** A person as SVG content (feet at 0,0), or as an HTML box with `html`. */
export function PersonSprite(props: PersonSpriteProps) {
  if (props.html) {
    const h = props.height ?? 96;
    return (
      <svg
        className={`person-sprite-box${props.className ? ` ${props.className}` : ''}`}
        viewBox={`${FRAME.x} ${FRAME.y} ${FRAME.w} ${FRAME.h}`}
        width={(h * FRAME.w) / FRAME.h}
        height={h}
        style={{ display: 'block', flex: 'none', overflow: 'visible' }}
        role={props.label ? 'img' : undefined}
        aria-label={props.label}
        aria-hidden={props.label ? undefined : true}
      >
        <SpriteG {...props} className={undefined} label={undefined} height={h} />
      </svg>
    );
  }
  return <SpriteG {...props} />;
}

function SpriteG({
  look,
  pose = 'stand',
  angle = 'front',
  phase = 0,
  flip,
  label,
  height,
  shadow = true,
  className,
}: PersonSpriteProps) {
  const frame = useRef<SVGRectElement>(null);
  const pic = frameFor(pose);
  const { url, state } = useSprite(
    { kind: 'body', look, pose, angle, phase, ...(height ? { cssPx: height } : {}) },
    frame,
  );
  return (
    <g
      className={`person-sprite${className ? ` ${className}` : ''}`}
      data-sprite={state}
      data-pose={pose}
      data-angle={angle}
    >
      {url && shadow && (
        <ellipse
          cx="0"
          cy={angle === 'top' ? 0.5 : 0}
          rx={angle === 'top' ? 8 : 7}
          ry={angle === 'top' ? 4.5 : 2.6}
          fill="#0f172a"
          opacity="0.22"
        />
      )}
      {/* The 2D figure: shown until the picture is ready, then kept (hidden) for what it says. */}
      <g visibility={url ? 'hidden' : undefined} aria-hidden={url ? true : undefined}>
        <g transform={flip ? 'scale(-1 1)' : undefined}>
          <Fallback look={look} pose={pose} label={label} />
        </g>
      </g>
      {url && (
        <image
          href={url}
          x={pic.x}
          y={pic.y}
          width={pic.w}
          height={pic.h}
          preserveAspectRatio="none"
          transform={flip ? 'scale(-1 1)' : undefined}
          role={label ? 'img' : undefined}
          aria-label={label}
          style={{ pointerEvents: 'none' }}
        />
      )}
      <rect
        ref={frame}
        x={FRAME.x}
        y={FRAME.y}
        width={FRAME.w}
        height={FRAME.h}
        fill="none"
        pointerEvents="none"
      />
    </g>
  );
}
