// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as F from '../../../scripts/osm/format.mjs';
import {
  decodeTile,
  BUILDING_TYPES,
  FLAG_COLOUR,
  FLAG_CORE,
  FLAG_ESTIMATED,
  FLAG_PART,
  FLAG_ROOF_COLOUR,
  GeoFormatError,
  MATERIALS,
  ROOF_SHAPES,
  TREE_KINDS,
  decodeBuildingTile,
  decodeTerrain,
  decodeTrees,
  elevationAt,
  tileOf,
  tileUrl,
  tilesInView,
  type GeoIndex,
} from '../src/city/geo3d/tiles';

const square = (x: number, y: number, s: number): [number, number][] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];

describe('3D city tiles: encoder (scripts/osm/format.mjs) ↔ decoder (geo3d/tiles.ts)', () => {
  it('shares the enums', () => {
    expect([...BUILDING_TYPES]).toEqual(F.BUILDING_TYPES);
    expect([...ROOF_SHAPES]).toEqual(F.ROOF_SHAPES);
    expect([...MATERIALS]).toEqual(F.MATERIALS);
    expect([...TREE_KINDS]).toEqual(F.TREE_KINDS);
    expect(F.FORMAT_VERSION).toBe(1);
    expect([FLAG_COLOUR, FLAG_ROOF_COLOUR, FLAG_ESTIMATED, FLAG_PART, FLAG_CORE]).toEqual([
      F.FLAG_COLOUR,
      F.FLAG_ROOF_COLOUR,
      F.FLAG_ESTIMATED,
      F.FLAG_PART,
      F.FLAG_CORE,
    ]);
  });

  it('round-trips buildings at 0.1 m, including negative tiles, colours and flags', () => {
    const tx = -3;
    const ty = 2;
    const a = {
      points: [
        [-2512.34, 2100.06],
        [-2480.01, 2100.04],
        [-2480.0, 2140.17],
        [-2512.3, 2140.2],
      ],
      height: 23.47,
      minHeight: 0,
      type: F.typeCode('office'),
      roof: F.roofCode('flat'),
      material: F.materialCode('glass'),
      levels: 7,
      roofHeight: 1.5,
      colour: F.parseColour('#336699'),
      roofColour: -1,
      estimated: false,
      part: false,
      core: true,
    };
    const b = {
      points: square(-2900, 2950, 12),
      height: 6.4,
      minHeight: 3.2,
      type: F.typeCode('house'),
      roof: F.roofCode('gabled'),
      material: 0,
      levels: 0,
      roofHeight: 0,
      colour: -1,
      roofColour: F.parseColour('red'),
      estimated: true,
      part: true,
      core: false,
    };
    const bytes = F.encodeTile(tx, ty, [a, b]);
    expect(bytes.length).toBe(16 + F.buildingBytes(a) + F.buildingBytes(b));
    const t = decodeBuildingTile(bytes);
    expect([t.tx, t.ty, t.length]).toEqual([tx, ty, 2]);
    expect([...t.count]).toEqual([4, 4]);
    expect([...t.start]).toEqual([0, 4]);
    a.points.forEach(([x, y], k) => {
      expect(Math.abs(t.xy[2 * k]! - x!)).toBeLessThanOrEqual(0.051);
      expect(Math.abs(t.xy[2 * k + 1]! - y!)).toBeLessThanOrEqual(0.051);
    });
    expect(t.height[0]).toBeCloseTo(23.5, 4);
    // The 3D map's view of the same tile: outlines and heights per building.
    const flat = decodeTile(bytes.slice().buffer);
    expect(flat.map((b) => b.p.length)).toEqual([8, 8]);
    expect(flat[0]!.h).toBeCloseTo(23.5, 4);
    expect(flat[1]!.p[0]).toBeCloseTo(t.xy[8]!, 4);
    expect(t.minHeight[1]).toBeCloseTo(3.2, 4);
    expect(t.roofHeight[0]).toBe(1.5);
    expect(t.levels[0]).toBe(7);
    expect(BUILDING_TYPES[t.type[0]!]).toBe('office');
    expect(BUILDING_TYPES[t.type[1]!]).toBe('house');
    expect(ROOF_SHAPES[t.roof[1]!]).toBe('gabled');
    expect(MATERIALS[t.material[0]!]).toBe('glass');
    expect(t.colour[0]).toBe(0x336699);
    expect(t.colour[1]).toBe(-1);
    expect(t.roofColour[1]).toBe(0xb03a2e);
    expect(t.flags[0]).toBe(FLAG_COLOUR | FLAG_CORE);
    expect(t.flags[1]).toBe(FLAG_ROOF_COLOUR | FLAG_ESTIMATED | FLAG_PART);
    // Accepts a view into a bigger buffer.
    const padded = new Uint8Array(bytes.length + 8);
    padded.set(bytes, 8);
    expect(decodeBuildingTile(padded.subarray(8)).xy).toEqual(t.xy);
  });

  it('refuses points beyond the i16 range and foreign files', () => {
    expect(() =>
      F.encodeTile(0, 0, [{ points: square(4000, 0, 10), height: 3, colour: -1, roofColour: -1 }]),
    ).toThrow(RangeError);
    expect(F.fitsTile(square(4000, 0, 10), 0, 0)).toBe(false);
    expect(F.fitsTile(square(900, 900, 200), 0, 0)).toBe(true);
    const html = new TextEncoder().encode('<!doctype html><html></html>');
    expect(() => decodeBuildingTile(html)).toThrow(GeoFormatError);
    const bad = F.encodeTile(0, 0, [{ points: square(1, 1, 5), height: 3 }]);
    expect(() => decodeBuildingTile(bad.subarray(0, bad.length - 2))).toThrow(GeoFormatError);
  });

  it('round-trips terrain and samples it bilinearly', () => {
    const cols = 3;
    const rows = 2;
    const elev = [0, 10, 20, 100, 110, 120.05];
    const t = decodeTerrain(F.encodeTerrain(cols, rows, [-100, -50, 100, 50], elev));
    expect([t.cols, t.rows]).toEqual([3, 2]);
    expect(t.bounds).toEqual([-100, -50, 100, 50]);
    [...t.elev].forEach((e, i) => expect(Math.abs(e - elev[i]!)).toBeLessThanOrEqual(0.051));
    expect(elevationAt(t, -100, -50)).toBeCloseTo(0, 3);
    expect(elevationAt(t, 0, -50)).toBeCloseTo(10, 3);
    expect(elevationAt(t, -50, 0)).toBeCloseTo(55, 3);
    expect(elevationAt(t, 999, 999)).toBeCloseTo(120.1, 1);
    // A high city keeps its range (Johannesburg ~1750 m).
    const high = decodeTerrain(F.encodeTerrain(2, 2, [0, 0, 1, 1], [1600, 1650, 1700, 1802.3]));
    expect(high.elev[3]).toBeCloseTo(1802.3, 1);
  });

  it('round-trips trees', () => {
    const trees = [
      { x: 10.5, y: -20, height: 9, kind: 0 },
      { x: -7000, y: 6999.5, height: 14, kind: 3 },
    ];
    const t = decodeTrees(F.encodeTrees(trees));
    expect(t.length).toBe(2);
    expect([...t.xy]).toEqual([10.5, -20, -7000, 6999.5]);
    expect([...t.height]).toEqual([9, 14]);
    expect(TREE_KINDS[t.kind[1]!]).toBe('street');
    // A big city falls back to 1 m units.
    const far = decodeTrees(F.encodeTrees([{ x: 20000.4, y: -19000, height: 8, kind: 1 }]));
    expect([...far.xy]).toEqual([20000, -19000]);
  });

  it('locates tiles', () => {
    expect(tileOf(-0.1, 999.9)).toEqual([-1, 0]);
    expect(tileUrl('san-francisco', -2, 3)).toBe('/geo/san-francisco/b--2_3.bin');
    const index = {
      tileSize: 1000,
      tiles: [
        { x: 0, y: 0, n: 1, bytes: 1 },
        { x: 5, y: 5, n: 1, bytes: 1 },
        { x: -1, y: 0, n: 1, bytes: 1 },
      ],
    } as GeoIndex;
    expect(tilesInView(index, [-10, 10, 500, 600]).map((t) => t.x)).toEqual([0, -1]);
  });
});
