/**
 * A penthouse balcony's view: the city's real skyline (the sky view's 3D
 * city, ../experiences/Panorama.tsx) from the top of your tower, in your
 * neighbourhood when the map knows it, else the city's high-rise heart.
 */
import type { SkyViewSpec } from '@runway/engine';
import { HOODS } from '../city/properties';

/** Where a city's towers are, [lat, lon], and how high its penthouses sit (metres). */
const TOWERS: Record<string, { at: [number, number]; height: number }> = {
  'san-francisco': { at: [37.7848, -122.3905], height: 120 },
  lagos: { at: [6.4305, 3.4245], height: 110 },
  london: { at: [51.5031, -0.0281], height: 130 },
  dubai: { at: [25.1855, 55.2615], height: 190 },
  nairobi: { at: [-1.2655, 36.8045], height: 95 },
  accra: { at: [5.6035, -0.1825], height: 70 },
  freetown: { at: [8.4845, -13.2335], height: 55 },
  kigali: { at: [-1.9455, 30.0605], height: 65 },
  johannesburg: { at: [-26.1065, 28.0545], height: 120 },
  cairo: { at: [30.0585, 31.2225], height: 110 },
};

const norm = (s: string) => s.toLowerCase().replace(/[-_]+/g, ' ').trim();

/** The sky view from a penthouse balcony in this city (and neighbourhood, if known). */
export function balconyView(
  market: string,
  name: string,
  neighbourhood?: string | null,
): SkyViewSpec {
  const city = TOWERS[market] ?? { at: [0, 0] as [number, number], height: 100 };
  const n = neighbourhood ? norm(neighbourhood) : '';
  const hood = n
    ? (HOODS[market]?.[n] ??
      Object.entries(HOODS[market] ?? {}).find(([k]) => n.includes(k) || k.includes(n))?.[1])
    : undefined;
  return {
    id: `penthouse:${market}`,
    market: market as SkyViewSpec['market'],
    name,
    kind: 'deck',
    at: hood ?? city.at,
    height: city.height,
    blurb: 'The whole city from your balcony.',
  };
}
