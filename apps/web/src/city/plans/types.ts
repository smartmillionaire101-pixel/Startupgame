/**
 * City plans (Wave 3 §C): one small data file per market that the layout
 * generator reads, so every city has its own districts, water, hills, street
 * pattern, bridges and landmarks instead of one board with a different paint
 * job.
 *
 * Coordinates are in blocks: `at: [col, row]` is a block (col along grid x,
 * row along grid y; x runs down-right on screen, y down-left). Bridges join
 * street intersections, also in block units. The generator grows districts
 * into neighbouring free blocks when a world has more banks, funds or
 * businesses than a district's rectangle holds, so plans stay small.
 */
import type { LandmarkKind } from '../flavour';

export type DistrictKind =
  | 'downtown'
  | 'finance'
  | 'tech'
  | 'market'
  | 'residential'
  | 'nightlife'
  | 'industrial'
  | 'waterfront'
  | 'park'
  | 'airport'
  | 'campus';

/** The important places a district can host. */
export type Host =
  | 'finance' // lenders and player banks
  | 'investors' // fund offices
  | 'market' // the customer-segment stalls
  | 'hub' // the Hub, your office and the newsstand, on one corner
  | 'home'
  | 'eventhall'
  | 'airport';

export type Side = 'north' | 'south' | 'east' | 'west';

export interface PlanDistrict {
  /** Stable id: local businesses name it in their seed (`district`). */
  id: string;
  /** Proper name, shown on the map and in the Places list. */
  name: string;
  kind: DistrictKind;
  at: [number, number];
  size: [number, number];
  /** Important places placed here. */
  hosts?: Host[];
}

export type Transit =
  | 'bus'
  | 'danfo'
  | 'matatu'
  | 'cable-car'
  | 'tube'
  | 'tram'
  | 'okada'
  | 'boda'
  | 'keke'
  | 'metro'
  | 'ferry'
  | 'abra';

export interface PlanBridge {
  name: string;
  from: [number, number];
  to: [number, number];
  style?: 'suspension' | 'bascule' | 'beam' | 'arch';
  color?: string;
}

export interface CityPlan {
  districts: PlanDistrict[];
  /**
   * Water along one side of the city (the Bay, the Atlantic), or, with
   * `river`, a river across it: north/south run it along grid x in place of
   * block row `river`, east/west along grid y in place of block column
   * `river`. `also` adds more coast (San Francisco's Bay wraps two sides).
   */
  water?: { side: Side; name: string; river?: number; also?: Side[] };
  hills?: { at: [number, number]; height: number }[];
  /**
   * Wave 4: open lanes (parks, plazas) between districts, so the city
   * breathes. Each number is a plan column (or row) that an open lane is
   * inserted before; everything from there on shifts along by one block.
   * A district straddling the lane stretches across it, and keeps the lane
   * open too unless it runs out of other blocks.
   */
  open?: { cols?: number[]; rows?: number[] };
  streets: 'grid' | 'organic' | 'radial' | 'mixed';
  /**
   * Street intersections joined by a bridge. Across a river (one bank to the
   * other, same street) it is a walkable street; reaching off the map over
   * the coast it is scenery.
   */
  bridges?: PlanBridge[];
  landmarks: { kind: LandmarkKind; name: string; at: [number, number] }[];
  transit: Transit[];
  /** Real street names, painted on the streets (shown zoomed in). */
  streetNames: string[];
  /** Wave 5: the city's real market, named over the Market's stalls (Balogun Market…). */
  marketName?: string;
  /** Wave 5: a sandy beach along a coast (Lumley Beach). */
  beach?: { side: Side; name: string };
}
