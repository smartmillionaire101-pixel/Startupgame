/**
 * The catalogue's pictures, rendered ahead from the game's own 3D models and
 * floor textures (scripts/furniture-thumbs.ts, into public/thumbs/): one per
 * furniture item and one per floor finish. Buy mode, the furniture shops and
 * the Shop app show these at once; only a finish or paint you pick is drawn
 * live (./thumbs3d.ts). Pure: no three.js here.
 */
const base = (): string => {
  const b = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return b.endsWith('/') ? b : `${b}/`;
};

/** A furniture item's picture ('sofa-2'). */
export const furnitureThumb = (itemId: string): string =>
  `${base()}thumbs/furniture/${itemId}.webp`;

/** A floor finish's swatch ('marble'). */
export const floorThumb = (finish: string): string => `${base()}thumbs/floor/${finish}.webp`;
