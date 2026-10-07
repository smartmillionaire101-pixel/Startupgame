/**
 * Wave 9 §B: how each city looks in 3D — its building palette, the kind of
 * low-rise it is made of (San Francisco's pale stucco rows, London's brick
 * terraces, Lagos's cream houses under terracotta and zinc), how tall it gets,
 * its trees, and the hills on its horizon. Real-world colours, not the 2D
 * map's cartoon ones.
 */

export interface CityLook {
  /** Low-rise walls: stucco, paint, brick. */
  walls: string[];
  /** Brick (a share of low-rise is brick where the city is). */
  brick: string[];
  /** Mid-rise and office walls: concrete, stone. */
  stone: string[];
  /** Curtain-wall glass tints. */
  glass: string[];
  /** Flat roofs. */
  flatRoofs: string[];
  /** Pitched roofs: tile, slate, zinc. */
  pitchedRoofs: string[];
  /** Share of low-rise with a pitched roof. */
  pitched: number;
  /** Low-rise lot: frontage [min, max] and depth [min, max] in metres. */
  lotW: [number, number];
  lotD: [number, number];
  /** Gap between neighbours (0: terraced rows). */
  gap: [number, number];
  /** Floors by zone: residential, urban, downtown. */
  floors: { res: [number, number]; urban: [number, number]; down: [number, number] };
  /** How many towers downtown (0–1), and how tall they can go (floors). */
  towers: number;
  towerMax: number;
  /** Towers line the motorways (Dubai's Sheikh Zayed Road). */
  towersOnMotorway?: boolean;
  /** Ground between buildings. */
  ground: string;
  park: string;
  beach: string;
  water: [deep: string, shallow: string];
  tree: 'round' | 'palm' | 'cypress' | 'acacia' | 'jacaranda';
  leaf: string[];
  /** Street-tree spacing along residential streets (metres; 0: none). */
  streetTrees: number;
  /** Hills beyond the map, by bearing (deg, 0 = north, 90 = east): height in metres. */
  horizon: { at: number; h: number; spread: number }[];
  hillColor: string;
  /** Haze: how milky the distance gets (0–1). */
  haze: number;
  /** Latitude, for the sun. */
  lat: number;
}

const BASE: CityLook = {
  walls: ['#ece6da', '#e3dccb', '#d8cfbd', '#efe9de', '#d9d4ca'],
  brick: ['#9a5a42', '#8a4b36'],
  stone: ['#c9c3b8', '#b8b2a7', '#d6d0c4', '#a9a49b'],
  glass: ['#5d7a8c', '#46677a', '#7d97a6', '#3b5463'],
  flatRoofs: ['#cfcac1', '#bdb8ae', '#d9d5cd', '#a9a59d'],
  pitchedRoofs: ['#8f4a32', '#7a3f2c', '#5b5f63'],
  pitched: 0.3,
  lotW: [8, 14],
  lotD: [12, 20],
  gap: [1, 4],
  floors: { res: [1, 3], urban: [3, 7], down: [6, 22] },
  towers: 0.25,
  towerMax: 40,
  ground: '#b9b5a8',
  park: '#6f9a4f',
  beach: '#e6d6ad',
  water: ['#1f4f78', '#2f6f96'],
  tree: 'round',
  leaf: ['#4f7a35', '#3f6a2c', '#5d8a3c'],
  streetTrees: 16,
  horizon: [],
  hillColor: '#7d8a6a',
  haze: 0.5,
  lat: 0,
};

export const CITY_LOOKS: Record<string, CityLook> = {
  'san-francisco': {
    ...BASE,
    // Pale stucco: whites, creams, greys and a few pastels (the photo).
    walls: [
      '#f1eee8',
      '#e9e4d9',
      '#e2dccf',
      '#f3ece0',
      '#dcd8d0',
      '#e8dfd2',
      '#d7dbdd',
      '#efe2d6',
      '#dfe3d8',
      '#e6d9c7',
      '#cfd6db',
      '#f0e3c8',
    ],
    brick: ['#9b5c45', '#a8705a'],
    stone: ['#cfc8bb', '#bfb6a6', '#d9d2c4', '#a7a29a', '#8f8b85'],
    glass: ['#5a7d93', '#41657c', '#7f9cad', '#2f4a5c', '#6f8f86'],
    flatRoofs: ['#d6d2ca', '#c4c0b8', '#e0ddd6', '#b3afa8', '#cbc4b6'],
    pitchedRoofs: ['#7c7f82', '#8c5b47', '#6b6e70'],
    pitched: 0.06,
    lotW: [7.6, 10],
    lotD: [18, 26],
    gap: [0, 0.6],
    floors: { res: [2, 4], urban: [3, 8], down: [8, 30] },
    towers: 0.4,
    towerMax: 48,
    ground: '#b8b4aa',
    park: '#6d8f4c',
    water: ['#1e4f7d', '#2c6b99'],
    tree: 'cypress',
    leaf: ['#4a6b34', '#3d5c2c', '#56773b'],
    streetTrees: 22,
    // Marin and the East Bay hills; San Bruno Mountain to the south.
    horizon: [
      { at: 340, h: 420, spread: 50 },
      { at: 30, h: 320, spread: 35 },
      { at: 80, h: 380, spread: 45 },
      { at: 175, h: 260, spread: 35 },
    ],
    hillColor: '#8a7f62',
    haze: 0.55,
    lat: 37.77,
  },
  lagos: {
    ...BASE,
    walls: ['#efe4c9', '#e8d6ad', '#dcc092', '#f2ebd9', '#d9c7a6', '#e6dccb', '#cfc6b0', '#e9cfa0'],
    stone: ['#d5cbb7', '#c2b8a3', '#e0d8c6', '#a8a091'],
    glass: ['#4f7488', '#3f6275', '#6e8e9c'],
    flatRoofs: ['#bdb4a2', '#a9a08e', '#cfc6b3'],
    // Terracotta, rusty zinc and aluminium.
    pitchedRoofs: ['#a4553a', '#8e4a33', '#8a6d58', '#9aa0a4', '#7b4b38', '#b06446'],
    pitched: 0.65,
    lotW: [10, 16],
    lotD: [11, 18],
    gap: [1.5, 4],
    floors: { res: [1, 3], urban: [2, 5], down: [5, 18] },
    towers: 0.2,
    towerMax: 30,
    ground: '#b9ab8c',
    park: '#5f8e3c',
    beach: '#e8d4a6',
    water: ['#2a5867', '#3c7280'],
    tree: 'palm',
    leaf: ['#4f7a2a', '#5f8a2f', '#3f6a24'],
    streetTrees: 26,
    horizon: [],
    hillColor: '#6f7f4f',
    haze: 0.7,
    lat: 6.5,
  },
  london: {
    ...BASE,
    walls: ['#e9e4da', '#ddd5c6', '#d2c7b3', '#c8bca5'],
    brick: ['#8e4f37', '#9c5c3f', '#7a4431', '#a5694d', '#b07a57', '#6f4637'],
    stone: ['#d8d0bf', '#c9bfac', '#b8b0a2', '#9e9a93'],
    glass: ['#5b7686', '#47606f', '#7a909c', '#344c5a'],
    flatRoofs: ['#a7a39b', '#8f8b84', '#b9b4ab'],
    pitchedRoofs: ['#4c5258', '#596067', '#3f454b', '#6b4b3e'],
    pitched: 0.55,
    lotW: [5.5, 8],
    lotD: [10, 15],
    gap: [0, 0.3],
    floors: { res: [2, 4], urban: [4, 8], down: [6, 16] },
    towers: 0.12,
    towerMax: 40,
    ground: '#a9a79d',
    park: '#5f8a3f',
    water: ['#3b5560', '#4c6670'],
    tree: 'round',
    leaf: ['#4d6e32', '#3e5f2a', '#5a7a38'],
    streetTrees: 18,
    horizon: [
      { at: 0, h: 110, spread: 60 },
      { at: 160, h: 140, spread: 60 },
    ],
    hillColor: '#6e7a5c',
    haze: 0.65,
    lat: 51.5,
  },
  dubai: {
    ...BASE,
    walls: ['#efe6d4', '#e6d8bd', '#f4efe5', '#dccaa9', '#ebe0cb', '#f2ece2'],
    stone: ['#e3d6bd', '#d4c4a5', '#efe7d8', '#bfb39c'],
    glass: ['#6d8fa6', '#4d7690', '#8fb0c2', '#3e6178', '#7aa0a8'],
    flatRoofs: ['#ddd3c0', '#cfc3ad', '#e8e0d0'],
    pitchedRoofs: ['#b07a4f', '#9a6a46'],
    pitched: 0.05,
    lotW: [16, 26],
    lotD: [16, 26],
    gap: [5, 9],
    floors: { res: [1, 3], urban: [4, 12], down: [12, 60] },
    towers: 0.75,
    towerMax: 80,
    towersOnMotorway: true,
    ground: '#d9c7a2',
    park: '#6f9a4a',
    beach: '#f0e2bf',
    water: ['#1f6f8f', '#3b9ab5'],
    tree: 'palm',
    leaf: ['#5d7f32', '#4c6e2a'],
    streetTrees: 24,
    horizon: [
      { at: 110, h: 30, spread: 90 },
      { at: 200, h: 20, spread: 60 },
    ],
    hillColor: '#d9c08f',
    haze: 0.8,
    lat: 25.2,
  },
  cairo: {
    ...BASE,
    walls: ['#d9c6a3', '#cdb38a', '#c4a57c', '#e2d3b6', '#bf9f78', '#d5bf9c', '#ad8d6a'],
    brick: ['#a5694a', '#9a6045', '#b27656'],
    stone: ['#d8c7a7', '#c8b493', '#bba78a'],
    glass: ['#5d7a88', '#4b6876'],
    flatRoofs: ['#b9a98c', '#a69679', '#c8b99b'],
    pitchedRoofs: ['#8f6b4c'],
    pitched: 0.02,
    lotW: [12, 20],
    lotD: [14, 22],
    gap: [0, 1],
    floors: { res: [4, 9], urban: [6, 12], down: [8, 18] },
    towers: 0.15,
    towerMax: 40,
    ground: '#c7b48f',
    park: '#6b8c45',
    water: ['#2f5a6b', '#3f6f80'],
    tree: 'palm',
    leaf: ['#5d7a33', '#4c6b2a'],
    streetTrees: 30,
    horizon: [{ at: 95, h: 160, spread: 40 }],
    hillColor: '#c4a87c',
    haze: 0.85,
    lat: 30.04,
  },
  nairobi: {
    ...BASE,
    walls: ['#ebe5d7', '#ddd0b6', '#cfc0a2', '#e6dccb', '#d6cbb7'],
    stone: ['#cfc6b4', '#bcb29e', '#a8a091'],
    glass: ['#56788c', '#3f6276'],
    flatRoofs: ['#b9b2a3', '#a59e8f'],
    pitchedRoofs: ['#9a3f2c', '#86402f', '#7d8286', '#5f6a4e'],
    pitched: 0.7,
    lotW: [12, 20],
    lotD: [12, 20],
    gap: [3, 7],
    floors: { res: [1, 2], urban: [3, 8], down: [8, 24] },
    towers: 0.3,
    towerMax: 40,
    ground: '#a99d7d',
    park: '#6a8c3f',
    tree: 'acacia',
    leaf: ['#5a7d33', '#4a6c2b', '#6b8b3a'],
    streetTrees: 20,
    horizon: [
      { at: 250, h: 420, spread: 40 },
      { at: 0, h: 160, spread: 70 },
    ],
    hillColor: '#6f7d4f',
    haze: 0.55,
    lat: -1.29,
  },
  accra: {
    ...BASE,
    walls: ['#efe7d3', '#e7d2a9', '#d6bd92', '#e9e2d0', '#dcc9a6'],
    stone: ['#d3c8b2', '#c0b49c'],
    glass: ['#56798c', '#41657a'],
    flatRoofs: ['#b8ae9a', '#a59b87'],
    pitchedRoofs: ['#9aa1a6', '#8c4f32', '#a8adb0', '#7c4a35'],
    pitched: 0.7,
    lotW: [10, 16],
    lotD: [10, 16],
    gap: [2, 5],
    floors: { res: [1, 2], urban: [2, 5], down: [5, 16] },
    towers: 0.15,
    towerMax: 25,
    ground: '#b6a27c',
    park: '#64893a',
    beach: '#e8d3a3',
    water: ['#24607a', '#3a7d94'],
    tree: 'palm',
    leaf: ['#557b2c', '#4a6d27'],
    streetTrees: 24,
    horizon: [{ at: 0, h: 120, spread: 60 }],
    hillColor: '#6f7f4c',
    haze: 0.7,
    lat: 5.6,
  },
  freetown: {
    ...BASE,
    walls: ['#ece2c8', '#d9e0d2', '#e8d0c0', '#d8dbe6', '#e9dcb9', '#f0eadc'],
    stone: ['#cfc6b2', '#bdb4a0'],
    glass: ['#56798c'],
    flatRoofs: ['#b5ad9b', '#a39a88'],
    pitchedRoofs: ['#7b4a32', '#8a8f93', '#6f4433', '#9da2a5', '#8b5a3e'],
    pitched: 0.85,
    lotW: [9, 14],
    lotD: [9, 14],
    gap: [1.5, 4],
    floors: { res: [1, 2], urban: [2, 4], down: [3, 8] },
    towers: 0.05,
    towerMax: 12,
    ground: '#a39a7c',
    park: '#4f7f35',
    beach: '#ead8ad',
    water: ['#245c74', '#367690'],
    tree: 'round',
    leaf: ['#3f7a2e', '#336a27', '#4d8a35'],
    streetTrees: 14,
    horizon: [
      { at: 180, h: 650, spread: 50 },
      { at: 120, h: 420, spread: 40 },
      { at: 240, h: 380, spread: 30 },
    ],
    hillColor: '#4d6e38',
    haze: 0.6,
    lat: 8.48,
  },
  kigali: {
    ...BASE,
    walls: ['#efe9dc', '#e0d4bc', '#d4c3a3', '#e9e5da', '#d9cfbd'],
    stone: ['#cfc6b4', '#bdb39f'],
    glass: ['#56798c', '#3f6276'],
    flatRoofs: ['#b5ae9f', '#a29b8c'],
    pitchedRoofs: ['#a2462f', '#8f3e2a', '#7c8287', '#b0563a'],
    pitched: 0.85,
    lotW: [11, 18],
    lotD: [11, 18],
    gap: [3, 6],
    floors: { res: [1, 2], urban: [2, 5], down: [5, 16] },
    towers: 0.1,
    towerMax: 20,
    ground: '#9e9070',
    park: '#55893a',
    tree: 'cypress',
    leaf: ['#3f7a2e', '#4a8433', '#356b28'],
    streetTrees: 16,
    horizon: [
      { at: 0, h: 380, spread: 80 },
      { at: 120, h: 300, spread: 60 },
      { at: 240, h: 340, spread: 60 },
    ],
    hillColor: '#557a3f',
    haze: 0.55,
    lat: -1.95,
  },
  johannesburg: {
    ...BASE,
    walls: ['#e9e4d9', '#d9cfbd', '#cbbfa8', '#e2dccf', '#d3c6ae'],
    brick: ['#9a5b43', '#8b5039', '#a8694c'],
    stone: ['#cbc4b6', '#b8b0a1', '#a39d91', '#8e8a83'],
    glass: ['#56788b', '#3f6275', '#6e8b9a'],
    flatRoofs: ['#aca596', '#9a9384'],
    pitchedRoofs: ['#7a3e2c', '#5b6168', '#8a4a33', '#6f7479'],
    pitched: 0.75,
    lotW: [14, 22],
    lotD: [16, 26],
    gap: [4, 8],
    floors: { res: [1, 2], urban: [3, 8], down: [10, 30] },
    towers: 0.35,
    towerMax: 50,
    ground: '#a99a78',
    park: '#647f3c',
    tree: 'jacaranda',
    leaf: ['#5b7a34', '#7e6bb0', '#4d6b2d', '#8a77c0'],
    streetTrees: 14,
    horizon: [
      { at: 0, h: 120, spread: 90 },
      { at: 200, h: 90, spread: 70 },
    ],
    hillColor: '#9a8a62',
    haze: 0.6,
    lat: -26.2,
  },
};

export const cityLook = (marketId: string): CityLook => CITY_LOOKS[marketId] ?? BASE;
