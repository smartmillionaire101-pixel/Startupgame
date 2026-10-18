/**
 * Facial hair against the skin. A beard in the hair's colour can come out as
 * pale as the skin, or paler (light-brown hair on deep skin): drawn across
 * the jaw that reads as a mask, or not at all. So facial hair (and brows)
 * always come out clearly darker than the skin, in every drawing of a
 * person: the portrait, the map figure and the 3D people.
 */

const channels = (c: string): [number, number, number] => {
  if (c.startsWith('#')) {
    const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join('') : c.slice(1, 7);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = (c.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
  return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0];
};

/** Relative brightness of a #rgb, #rrggbb or rgb(...) colour, 0–1. */
export function lum(c: string): number {
  const [r, g, b] = channels(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** A colour darkened by `amt` (0–1), as #rrggbb. */
export function darker(c: string, amt: number): string {
  const hex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n * (1 - amt))))
      .toString(16)
      .padStart(2, '0');
  const [r, g, b] = channels(c);
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** The colour to draw facial hair and brows in: the hair's when that's dark enough, else deeper. */
export function facialHairColour(skin: string, hair: string): string {
  if (lum(hair) < lum(skin) - 0.12) return hair;
  const deep = darker(hair, 0.55);
  return lum(deep) < lum(skin) - 0.08 ? deep : darker(skin, 0.6);
}
