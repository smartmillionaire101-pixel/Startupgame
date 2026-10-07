// @vitest-environment node
/**
 * The OpenStreetMap → 3D city pipeline (scripts/osm), offline: synthetic
 * fixtures only (Overpass and AWS are reached by the GitHub Action alone).
 */
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import geoSF from '../src/city/geo/san-francisco.json';
import {
  buildingsFrom,
  estimateHeight,
  fitBudget,
  heightOf,
  overtureTags,
  resolveParts,
  tileBuildings,
} from '../../../scripts/osm/buildings.mjs';
import { CITIES } from '../../../scripts/osm/cities.mjs';
import { encodeTile, parseColour, parseLength, typeCode } from '../../../scripts/osm/format.mjs';
import { areaOf, hash32, projector, signedArea, simplifyRing } from '../../../scripts/osm/geom.mjs';
import {
  clampWater,
  decodeTerrarium,
  lonLatToPixel,
  sampleGrid,
  terrainPlan,
  terrariumElevation,
} from '../../../scripts/osm/terrain.mjs';
import { readOverture } from '../../../scripts/osm/overture.mjs';
import { chunkBox } from '../../../scripts/osm/tiles.mjs';
import { cityTrees, sampleStreets } from '../../../scripts/osm/trees.mjs';
import { decodeBuildingTile } from '../src/city/geo3d/tiles';

type Pt = [number, number];

describe('projection (shared with build.mjs)', () => {
  it('matches the committed geo JSON frame', () => {
    const proj = projector(CITIES['san-francisco'].wide);
    expect(proj.origin.map((v: number) => Math.round(v * 1e6) / 1e6)).toEqual(geoSF.origin);
    const { wide } = CITIES['san-francisco'];
    const tl = proj.p(wide[0], wide[3]).map(Math.round);
    const br = proj.p(wide[2], wide[1]).map(Math.round);
    expect([...tl, ...br]).toEqual(geoSF.bounds);
  });

  it('maps east to +x, north to −y, and inverts', () => {
    const proj = projector([0, 0, 2, 2]);
    expect(proj.p(1, 1)).toEqual([0, -0]);
    const [x, y] = proj.p(1.01, 1.02);
    expect(x).toBeGreaterThan(1000);
    expect(y).toBeLessThan(-2000);
    const [lon, lat] = proj.inv(x, y);
    expect(lon).toBeCloseTo(1.01, 9);
    expect(lat).toBeCloseTo(1.02, 9);
  });
});

describe('footprint simplification', () => {
  it('drops near-collinear points within 0.5 m and keeps right angles', () => {
    const ring: Pt[] = [
      [0, 0],
      [5, 0.2],
      [10, 0],
      [10, 4],
      [10.3, 8],
      [10, 12],
      [0, 12],
      [0, 0],
    ];
    const out = simplifyRing(ring, 0.5) as Pt[];
    expect(out).toHaveLength(4);
    for (const c of [
      [0, 0],
      [10, 0],
      [10, 12],
      [0, 12],
    ])
      expect(out).toContainEqual(c);
  });

  it('keeps every corner of an L shape and small real notches', () => {
    const l: Pt[] = [
      [0, 0],
      [20, 0],
      [20, 8],
      [8, 8],
      [8, 20],
      [0, 20],
    ];
    expect(simplifyRing(l, 0.5)).toHaveLength(6);
    const notch: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 1],
      [11, 1],
      [11, 0],
      [20, 0],
      [20, 10],
      [0, 10],
    ];
    expect(simplifyRing(notch, 0.5)).toHaveLength(8);
  });

  it('collapses degenerate rings', () => {
    expect(
      simplifyRing(
        [
          [0, 0],
          [1, 0],
          [0, 0],
        ],
        0.5,
      ),
    ).toBeNull();
    expect(
      simplifyRing(
        [
          [0, 0],
          [5, 0.1],
          [10, 0],
          [0, 0],
        ],
        0.5,
      ),
    ).toBeNull();
  });
});

describe('tags and heights', () => {
  it('parses lengths and colours', () => {
    expect(parseLength('12')).toBe(12);
    expect(parseLength('12.5 m')).toBe(12.5);
    expect(parseLength('100 ft')).toBeCloseTo(30.48, 3);
    expect(parseLength('10\'6"')).toBeCloseTo(3.2004, 3);
    expect(parseLength('tall')).toBeNaN();
    expect(parseColour('#fff')).toBe(0xffffff);
    expect(parseColour('#A0522D')).toBe(0xa0522d);
    expect(parseColour('light_grey')).toBe(0xd3d3d3);
    expect(parseColour('chartreuse-ish')).toBe(-1);
    expect(typeCode('detached')).toBe(typeCode('house'));
    expect(typeCode('yes')).toBe(0);
  });

  it('prefers height, then levels × 3.2, then the estimate', () => {
    expect(heightOf({ height: '25 m' }, 0, 200, false, 0.5)).toMatchObject({
      height: 25,
      estimated: false,
    });
    expect(heightOf({ 'building:levels': '4' }, 0, 200, false, 0.5)).toMatchObject({
      height: 12.8,
      levels: 4,
      estimated: false,
    });
    expect(
      heightOf({ 'building:levels': '4', 'roof:height': '3' }, 0, 200, false, 0.5),
    ).toMatchObject({ height: 15.8, roofHeight: 3 });
    expect(
      heightOf({ height: '60', 'building:min_level': '10' }, 0, 200, false, 0.5),
    ).toMatchObject({ height: 60, minHeight: 32 });
    expect(heightOf({ min_height: '40', height: '30' }, 0, 200, false, 0.5).height).toBeCloseTo(
      43.2,
    );
    expect(heightOf({}, typeCode('house'), 120, false, 0.3).estimated).toBe(true);
  });

  it('estimates deterministically and plausibly by type, size and zone', () => {
    const house = estimateHeight(typeCode('house'), 120, false, 0.2);
    expect(house).toEqual(estimateHeight(typeCode('house'), 120, false, 0.2));
    expect(house.height).toBeGreaterThanOrEqual(3.2);
    expect(house.height).toBeLessThanOrEqual(9.6);
    const shed = estimateHeight(typeCode('shed'), 15, false, 0.9);
    expect(shed.height).toBeLessThan(4);
    const coreOffice = estimateHeight(typeCode('office'), 2500, true, 0.9);
    expect(coreOffice.height).toBeGreaterThan(50);
    const plain = estimateHeight(0, 300, false, 0.5);
    expect(plain.height).toBeLessThan(estimateHeight(0, 300, true, 0.5).height);
    for (let i = 0; i < 200; i++) {
      const h = (hash32(i) % 1000) / 1000;
      const est = estimateHeight(i % 20, 20 + i * 37, i % 3 === 0, h);
      expect(est.height).toBeGreaterThan(2);
      expect(est.height).toBeLessThan(140);
    }
  });
});

// A tiny lon/lat box around (0, 0) so 1e-5° ≈ 1.1 m.
const wide = [-0.05, -0.05, 0.05, 0.05];
const proj = projector(wide);
const bounds = [-5566, -5527, 5566, 5527];
const core = [-500, -500, 500, 500];
const geomOf = (pts: Pt[]) =>
  pts.map(([x, y]) => ({ lon: proj.inv(x, y)[0], lat: proj.inv(x, y)[1] }));
const closed = (pts: Pt[]) => [...pts, pts[0]!];

describe('buildings from Overpass elements', () => {
  const elements = [
    {
      type: 'way',
      id: 1,
      tags: { building: 'apartments', 'building:levels': '5', 'building:colour': 'white' },
      geometry: geomOf(closed(square(100, 100, 20))),
    },
    {
      type: 'way',
      id: 2,
      tags: { building: 'yes' },
      // Counter-clockwise in the stored frame: gets reversed.
      geometry: geomOf(closed(square(1500, -2200, 9).reverse())),
    },
    {
      type: 'relation',
      id: 3,
      tags: { building: 'office', type: 'multipolygon', height: '80' },
      members: [
        {
          role: 'outer',
          geometry: geomOf([
            [300, 300],
            [340, 300],
            [340, 340],
          ]),
        },
        {
          role: 'outer',
          geometry: geomOf([
            [340, 340],
            [300, 340],
            [300, 300],
          ]),
        },
      ],
    },
    // A tall office with two tiers as building:parts.
    {
      type: 'way',
      id: 4,
      tags: { building: 'office', 'building:material': 'glass' },
      geometry: geomOf(closed(square(600, 600, 40))),
    },
    {
      type: 'way',
      id: 5,
      tags: { 'building:part': 'yes', height: '30' },
      geometry: geomOf(closed(square(600, 600, 40))),
    },
    {
      type: 'way',
      id: 6,
      tags: { 'building:part': 'yes', height: '120', min_height: '30' },
      geometry: geomOf(closed(square(610, 610, 20))),
    },
    { type: 'way', id: 7, tags: { building: 'no' }, geometry: geomOf(closed(square(0, 0, 9))) },
    { type: 'node', id: 8, tags: { natural: 'tree' }, lat: 0, lon: 0 },
  ];

  it('projects, orients, tags and deduplicates', () => {
    const seen = new Set<string>();
    const list = buildingsFrom(elements, proj, bounds, core, seen);
    expect(buildingsFrom(elements, proj, bounds, core, seen)).toHaveLength(0);
    expect(list).toHaveLength(6);
    for (const b of list) expect(signedArea(b.points)).toBeGreaterThan(0);
    const apt = list.find((b: { type: number }) => b.type === typeCode('apartments'));
    expect(apt!.height).toBeCloseTo(16, 5);
    expect(apt!.colour).toBe(0xffffff);
    expect(apt!.core).toBe(true);
    expect(areaOf(apt!.points)).toBeCloseTo(400, 0);
    const yes = list.find((b: { type: number }) => b.type === 0);
    expect(yes!.estimated).toBe(true);
    expect(yes!.core).toBe(false);
    const rel = list.find((b: { height: number }) => b.height === 80);
    expect(rel!.points).toHaveLength(4);
  });

  it('lets building parts replace the outline they cover, inheriting its look', () => {
    const list = resolveParts(buildingsFrom(elements, proj, bounds, core));
    expect(list).toHaveLength(5);
    const parts = list.filter((b: { part: boolean }) => b.part);
    expect(parts).toHaveLength(2);
    for (const p of parts) {
      expect(p.type).toBe(typeCode('office'));
      expect(p.material).toBe(3);
    }
    expect(parts.find((p: { height: number }) => p.height === 120).minHeight).toBe(30);
  });

  it('tiles by centroid and survives encode → decode', () => {
    const list = resolveParts(buildingsFrom(elements, proj, bounds, core));
    const tiles = tileBuildings(list);
    expect([...tiles.keys()].sort()).toEqual(['0,0', '1,-3']);
    const t = tiles.get('1,-3');
    const dec = decodeBuildingTile(encodeTile(t.tx, t.ty, t.buildings));
    expect(dec.length).toBe(1);
    const xs = [...dec.xy].filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeCloseTo(1500, 0);
    expect(Math.max(...xs)).toBeCloseTo(1509, 0);
  });

  it('drops the smallest footprints, farthest from the core, first to meet the budget', () => {
    const many = Array.from({ length: 400 }, (_, i) => {
      const s = i % 2 ? 4 : 12;
      return {
        points: square(i * 30, 0, s),
        cx: i * 30 + s / 2,
        cy: s / 2,
        area: s * s,
        core: i < 10,
        part: false,
        estimated: true,
        colour: -1,
        roofColour: -1,
      };
    });
    const coreBox = [0, 0, 300, 300];
    const all = fitBudget(many, 1e9, coreBox);
    expect(all.list).toHaveLength(400);
    expect([all.minArea, all.dropped]).toEqual([0, 0]);
    const cut = fitBudget(many, 16 + 300 * 28, coreBox);
    expect(cut.list).toHaveLength(300);
    expect(cut.dropped).toBe(100);
    // The core stays whole, every big footprint stays, and the small ones
    // kept are the nearest to the core.
    expect(cut.list.filter((b: { core: boolean }) => b.core)).toHaveLength(10);
    expect(cut.list.filter((b: { area: number }) => b.area === 144)).toHaveLength(200);
    const smallX = cut.list
      .filter((b: { area: number; core: boolean }) => b.area === 16 && !b.core)
      .map((b: { cx: number }) => b.cx);
    expect(Math.max(...smallX)).toBeLessThan(
      Math.min(...many.filter((b) => b.area === 16 && !cut.list.includes(b)).map((b) => b.cx)),
    );
    expect(cut.minArea).toBeGreaterThan(0);
    expect(cut.minArea).toBeLessThan(16);
  });
});

describe('Overture buildings (overture.py export)', () => {
  it('maps Overture fields onto OSM tags', () => {
    expect(
      overtureTags({ kind: 'building', class: 'apartments', num_floors: 6, facade_color: 'beige' }),
    ).toEqual({ building: 'apartments', 'building:levels': '6', 'building:colour': 'beige' });
    expect(overtureTags({ kind: 'building', subtype: 'education' }).building).toBe('school');
    expect(overtureTags({ kind: 'building', subtype: 'residential' }).building).toBe('house');
    expect(overtureTags({ kind: 'building' }).building).toBe('yes');
    expect(overtureTags({ kind: 'part', height: 40, min_height: 10 })).toEqual({
      'building:part': 'yes',
      height: '40',
      min_height: '10',
    });
  });

  it('streams the newline-delimited export into footprints', async () => {
    const file = fileURLToPath(new URL('./fixtures/overture-sample.ndjson', import.meta.url));
    const { buildings, rows, bad } = await readOverture(file, proj, bounds, core);
    expect([rows, bad]).toEqual([8, 1]);
    // Underground and out-of-box rows go; the multipolygon gives two.
    expect(buildings).toHaveLength(6);
    const office = buildings.find((b: { type: number }) => b.type === typeCode('office'))!;
    expect(office).toMatchObject({
      height: 95.5,
      levels: 24,
      estimated: false,
      colour: 0x8899aa,
      material: 3,
      roof: 1,
    });
    expect(office.area).toBeGreaterThan(400);
    const house = buildings.find((b: { type: number }) => b.type === typeCode('house'))!;
    expect(house.estimated).toBe(true);
    const churches = buildings.filter((b: { type: number }) => b.type === typeCode('church'));
    expect(churches).toHaveLength(2);
    expect(churches[0]).toMatchObject({ height: 12.4, levels: 2, roof: 2, roofHeight: 6 });
    expect(churches[0].roofColour).toBe(0xb03a2e);
    for (const b of buildings) expect(signedArea(b.points)).toBeGreaterThan(0);
    const resolved = resolveParts(buildings);
    expect(resolved).toHaveLength(6);
    const part = resolved.find((b: { part: boolean }) => b.part)!;
    expect(part).toMatchObject({ height: 40, minHeight: 10, type: typeCode('office') });
  });
});

describe('Overpass chunks', () => {
  it('covers the box with sub-boxes no bigger than the step', () => {
    const boxes = chunkBox([-122.52, 37.7, -122.35, 37.84], 0.05);
    expect(boxes).toHaveLength(4 * 3);
    for (const [w, s, e, n] of boxes) {
      expect(e - w).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(n - s).toBeLessThanOrEqual(0.05 + 1e-9);
    }
    expect(boxes[0]![0]).toBe(-122.52);
    expect(boxes.at(-1)![2]).toBeCloseTo(-122.35, 9);
    expect(boxes.at(-1)![3]).toBeCloseTo(37.84, 9);
  });
});

describe('terrain', () => {
  it('decodes Terrarium pixels and PNG tiles', () => {
    expect(terrariumElevation(128, 0, 0)).toBe(0);
    expect(terrariumElevation(128, 100, 128)).toBe(100.5);
    expect(terrariumElevation(127, 255, 0)).toBe(-1);
    const png = new PNG({ width: 4, height: 2 });
    for (let i = 0; i < 8; i++) {
      // elevation = 10·i metres
      const e = 10 * i + 32768;
      png.data[4 * i] = Math.floor(e / 256);
      png.data[4 * i + 1] = e % 256;
      png.data[4 * i + 2] = 0;
      png.data[4 * i + 3] = 255;
    }
    const tile = decodeTerrarium(PNG.sync.write(png));
    expect([tile.width, tile.height]).toEqual([4, 2]);
    expect([...tile.elev]).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
  });

  it('plans the grid and zoom', () => {
    const sf = terrainPlan(14960, 15476, 37.77);
    expect(sf.cols).toBeGreaterThanOrEqual(129);
    expect(sf.cols).toBeLessThanOrEqual(513);
    expect(sf.zoom).toBeGreaterThanOrEqual(12);
    expect(sf.zoom).toBeLessThanOrEqual(14);
    const small = terrainPlan(1000, 1000, 0);
    expect([small.cols, small.rows]).toEqual([129, 129]);
  });

  it('samples a mosaic bilinearly in the local frame', () => {
    const z = 12;
    // A synthetic world: elevation = global pixel x (pixel centres at +0.5).
    const getTile = (_z: number, tx: number) => {
      const elev = new Float32Array(256 * 256);
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) elev[y * 256 + x] = tx * 256 + x + 0.5;
      return { width: 256, height: 256, elev };
    };
    const b = [-1000, -1000, 1000, 1000];
    const grid = sampleGrid({ cols: 5, rows: 5, bounds: b, zoom: z, inv: proj.inv, getTile });
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 5; i++) {
        const x = -1000 + 500 * i;
        const y = -1000 + 500 * j;
        const [lon, lat] = proj.inv(x, y);
        const [gx] = lonLatToPixel(lon, lat, z);
        expect(grid[j * 5 + i]).toBeCloseTo(gx!, 1);
      }
  });

  it('puts the sea and water at 0 m and keeps land non-negative', () => {
    const b = [0, 0, 100, 100];
    const elev = new Float32Array(121).fill(25);
    elev[0] = -3;
    // Land: the west half; a lake in the land's middle.
    const land = [[0, 0, 50, 0, 50, 100, 0, 100]];
    const water = [[15, 35, 35, 35, 35, 65, 15, 65]];
    const out = clampWater(elev, 11, 11, b, land, water);
    const at = (x: number, y: number) => out[(y / 10) * 11 + x / 10];
    expect(at(10, 10)).toBe(25);
    expect(at(0, 0)).toBe(0);
    expect(at(80, 50)).toBe(0);
    expect(at(20, 50)).toBe(0);
    expect(at(40, 90)).toBe(25);
    // No land polygons: the whole box is land.
    expect(clampWater(elev, 11, 11, b, [], [])[60]).toBe(25);
  });
});

describe('trees', () => {
  it('plants street trees about every 15 m on alternating sides', () => {
    const trees = sampleStreets([[0, 0, 300, 0]], 15, 6, 1);
    expect(trees).toHaveLength(20);
    const north = trees.filter((t: { y: number }) => t.y < 0).length;
    expect(north).toBe(10);
    for (const t of trees) expect(Math.abs(Math.abs(t.y) - 6)).toBeLessThanOrEqual(1);
  });

  it('samples parks and streets deterministically, outside water, within the cap', () => {
    const park = [0, 0, 400, 0, 400, 400, 0, 400];
    const input = {
      tagged: [
        { x: 10, y: 10, height: 9, kind: 0 },
        { x: 5000, y: 5000, height: 9, kind: 0 },
      ],
      parks: [park],
      green: [],
      streets: [[-500, -100, 500, -100]],
      water: [[100, 100, 300, 100, 300, 300, 100, 300]],
      bounds: [-1000, -1000, 1000, 1000],
    };
    const a = cityTrees(input);
    expect(a).toEqual(cityTrees(input));
    expect(a.filter((t: { kind: number }) => t.kind === 0)).toHaveLength(1);
    expect(a.some((t: { kind: number }) => t.kind === 1)).toBe(true);
    expect(a.some((t: { kind: number }) => t.kind === 3)).toBe(true);
    for (const t of a) expect(t.x > 100 && t.x < 300 && t.y > 100 && t.y < 300).toBe(false);
    const capped = cityTrees({ ...input, cap: 50 });
    expect(capped).toHaveLength(50);
  });
});

function square(x: number, y: number, s: number): Pt[] {
  return [
    [x, y],
    [x + s, y],
    [x + s, y + s],
    [x, y + s],
  ];
}
