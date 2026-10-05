/**
 * Local flavour per market: palette, landmark, street names and the vehicles
 * that move through the streets. Pure data; drawn by CityMap.
 */

export type TreeKind = 'round' | 'palm' | 'jacaranda' | 'acacia' | 'cypress';
export type EdgeKind = 'water' | 'hills' | 'dunes' | 'mine-dumps';
export type LandmarkKind =
  | 'clocktower'
  | 'theatre'
  | 'conference-tower'
  | 'needle-tower'
  | 'pyramid'
  | 'star-gate'
  | 'cotton-tree'
  | 'convention-dome'
  | 'hillbrow-tower'
  | 'fountain'
  // Wave 3: per-city landmarks from the city plans.
  | 'transamerica'
  | 'painted-ladies'
  | 'cable-car'
  | 'gherkin'
  | 'london-eye'
  | 'lighthouse'
  | 'cairo-tower'
  | 'minaret'
  | 'sail-hotel'
  | 'wind-tower'
  // Wave 5: a city's famous market (Balogun, Makola, Big Market…).
  | 'market-hall';

export interface VehicleSpec {
  id: string;
  body: string;
  accent: string;
  /** Length along the street, in tiles. */
  len: number;
  /** Width across the street, in tiles. */
  wid: number;
  /** Height in px. */
  h: number;
  /** Two-storey bus, rider on a bike, roof sign, etc. */
  extra?: 'double' | 'rider' | 'sign' | 'stripes' | 'rack' | 'cable' | 'sensor';
}

export interface Flavour {
  sky: [string, string];
  land: string;
  asphalt: string;
  sidewalk: string;
  curb: string;
  lane: string;
  park: string;
  parkEdge: string;
  walls: string[];
  roofs: string[];
  tree: TreeKind;
  leaf: [string, string];
  edge: EdgeKind;
  edgeColor: string;
  landmark: LandmarkKind;
  landmarkColor: string;
  vehicles: VehicleSpec[];
  streets: string[];
  /** Drifting fog over the city (San Francisco). */
  fog?: boolean;
}

const car = (id: string, body: string): VehicleSpec => ({
  id,
  body,
  accent: '#e2e8f0',
  len: 0.5,
  wid: 0.28,
  h: 9,
});

const BASE: Flavour = {
  sky: ['#dbeafe', '#f0fdf4'],
  land: '#cfe3c4',
  asphalt: '#5b6470',
  sidewalk: '#e7e5df',
  curb: '#c9c5bb',
  lane: '#f8fafc',
  park: '#9fd38c',
  parkEdge: '#7fbf6b',
  walls: ['#f4e3c9', '#e9d5c1', '#d6e4f0', '#f1d4d4', '#e2e8d0'],
  roofs: ['#9a3412', '#7c2d12', '#475569', '#57534e'],
  tree: 'round',
  leaf: ['#4ade80', '#16a34a'],
  edge: 'hills',
  edgeColor: '#a7d39a',
  landmark: 'fountain',
  landmarkColor: '#94a3b8',
  vehicles: [car('car', '#2563eb'), car('car2', '#e11d48')],
  streets: ['Main Street', 'Market Road', 'High Street', 'Station Road', 'Park Avenue'],
};

export const FLAVOURS: Record<string, Flavour> = {
  lagos: {
    ...BASE,
    sky: ['#fde68a', '#fef3c7'],
    land: '#e9d3a5',
    asphalt: '#4b5260',
    sidewalk: '#eadfca',
    curb: '#cdbf9f',
    park: '#93c97a',
    parkEdge: '#6fae58',
    walls: ['#fbd38d', '#f6ad55', '#fefcbf', '#c6f6d5', '#fed7e2', '#e2e8f0'],
    roofs: ['#9c4221', '#2f855a', '#2b6cb0', '#975a16'],
    tree: 'palm',
    leaf: ['#65a30d', '#3f6212'],
    edge: 'water',
    edgeColor: '#5fb3c9',
    landmark: 'theatre',
    landmarkColor: '#e5e7eb',
    vehicles: [
      {
        id: 'danfo',
        body: '#facc15',
        accent: '#111827',
        len: 0.8,
        wid: 0.34,
        h: 14,
        extra: 'stripes',
      },
      {
        id: 'danfo2',
        body: '#fbbf24',
        accent: '#111827',
        len: 0.8,
        wid: 0.34,
        h: 14,
        extra: 'stripes',
      },
      {
        id: 'okada',
        body: '#dc2626',
        accent: '#111827',
        len: 0.3,
        wid: 0.12,
        h: 11,
        extra: 'rider',
      },
      { id: 'keke', body: '#facc15', accent: '#15803d', len: 0.38, wid: 0.24, h: 11 },
      car('car', '#1e40af'),
    ],
    streets: [
      'Broad Street',
      'Marina',
      'Awolowo Road',
      'Adeola Odeku',
      'Allen Avenue',
      'Herbert Macaulay Way',
      'Ozumba Mbadiwe',
      'Ikorodu Road',
      'Admiralty Way',
      'Kingsway Road',
    ],
  },
  london: {
    ...BASE,
    sky: ['#cbd5e1', '#e0f2fe'],
    land: '#bcd6b0',
    asphalt: '#4a4f57',
    sidewalk: '#dcdad5',
    curb: '#b8b4ab',
    park: '#8cc97c',
    parkEdge: '#6aaa5a',
    walls: ['#b4533c', '#c9a27e', '#e7e2d6', '#9a3412', '#d6d3d1', '#a8a29e'],
    roofs: ['#334155', '#475569', '#1e293b', '#57534e'],
    tree: 'round',
    leaf: ['#4d7c0f', '#365314'],
    edge: 'water',
    edgeColor: '#6b8fa3',
    landmark: 'clocktower',
    landmarkColor: '#d6c39a',
    vehicles: [
      {
        id: 'routemaster',
        body: '#dc2626',
        accent: '#fef2f2',
        len: 0.95,
        wid: 0.34,
        h: 24,
        extra: 'double',
      },
      {
        id: 'routemaster2',
        body: '#b91c1c',
        accent: '#fef2f2',
        len: 0.95,
        wid: 0.34,
        h: 24,
        extra: 'double',
      },
      { id: 'cab', body: '#111827', accent: '#fbbf24', len: 0.5, wid: 0.28, h: 11, extra: 'sign' },
      car('car', '#e5e7eb'),
      {
        id: 'bike',
        body: '#16a34a',
        accent: '#111827',
        len: 0.28,
        wid: 0.1,
        h: 10,
        extra: 'rider',
      },
    ],
    streets: [
      'Threadneedle Street',
      'Lombard Street',
      'Old Street',
      'Brick Lane',
      'Kingsway',
      'Shoreditch High Street',
      'Cheapside',
      'Fleet Street',
      'Moorgate',
      'Strand',
    ],
  },
  nairobi: {
    ...BASE,
    sky: ['#bae6fd', '#ecfccb'],
    land: '#d6c58f',
    asphalt: '#525866',
    sidewalk: '#e7dfc9',
    curb: '#c4b88f',
    park: '#a3c96e',
    parkEdge: '#80a94f',
    walls: ['#fde68a', '#fecaca', '#d9f99d', '#e5e7eb', '#fed7aa', '#bfdbfe'],
    roofs: ['#b91c1c', '#166534', '#92400e', '#334155'],
    tree: 'acacia',
    leaf: ['#84cc16', '#4d7c0f'],
    edge: 'hills',
    edgeColor: '#9cb86a',
    landmark: 'conference-tower',
    landmarkColor: '#d4a373',
    vehicles: [
      {
        id: 'matatu',
        body: '#7c3aed',
        accent: '#facc15',
        len: 0.8,
        wid: 0.34,
        h: 14,
        extra: 'stripes',
      },
      {
        id: 'matatu2',
        body: '#059669',
        accent: '#f472b6',
        len: 0.8,
        wid: 0.34,
        h: 14,
        extra: 'stripes',
      },
      {
        id: 'matatu3',
        body: '#0f172a',
        accent: '#22d3ee',
        len: 0.8,
        wid: 0.34,
        h: 14,
        extra: 'stripes',
      },
      {
        id: 'boda',
        body: '#ef4444',
        accent: '#111827',
        len: 0.3,
        wid: 0.12,
        h: 11,
        extra: 'rider',
      },
      car('car', '#f8fafc'),
    ],
    streets: [
      'Moi Avenue',
      'Kenyatta Avenue',
      'Ngong Road',
      'Waiyaki Way',
      'Kimathi Street',
      'Mama Ngina Street',
      'Muindi Mbingu Street',
      'Harambee Avenue',
      'Haile Selassie Avenue',
    ],
  },
  dubai: {
    ...BASE,
    sky: ['#fde68a', '#e0f2fe'],
    land: '#f1dcae',
    asphalt: '#3f4652',
    sidewalk: '#efe6d2',
    curb: '#d6c7a6',
    park: '#a7d38f',
    parkEdge: '#86b86f',
    walls: ['#f5f5f4', '#e7e5e4', '#fef3c7', '#e0f2fe', '#f1f5f9'],
    roofs: ['#a16207', '#0e7490', '#64748b', '#78716c'],
    tree: 'palm',
    leaf: ['#65a30d', '#3f6212'],
    edge: 'water',
    edgeColor: '#38bdf8',
    landmark: 'needle-tower',
    landmarkColor: '#cbd5e1',
    vehicles: [
      car('suv', '#f8fafc'),
      car('car', '#0f172a'),
      { id: 'taxi', body: '#f5f5f4', accent: '#dc2626', len: 0.5, wid: 0.28, h: 11, extra: 'sign' },
      { id: 'bus', body: '#e5e7eb', accent: '#dc2626', len: 0.95, wid: 0.34, h: 15 },
      car('sport', '#dc2626'),
    ],
    streets: [
      'Sheikh Zayed Road',
      'Al Wasl Road',
      'Jumeirah Road',
      'Al Khail Road',
      'Financial Centre Road',
      'Al Satwa Road',
      'Happiness Street',
      'Al Safa Street',
    ],
  },
  cairo: {
    ...BASE,
    sky: ['#fed7aa', '#fef9c3'],
    land: '#e8d4a2',
    asphalt: '#555b66',
    sidewalk: '#ebe0c6',
    curb: '#cfbf98',
    park: '#a3c97e',
    parkEdge: '#80a95c',
    walls: ['#f5deb3', '#e7c9a0', '#f3e8d0', '#d6c4a8', '#fde68a'],
    roofs: ['#92400e', '#78716c', '#a16207', '#57534e'],
    tree: 'palm',
    leaf: ['#65a30d', '#3f6212'],
    edge: 'water',
    edgeColor: '#4fa3b8',
    landmark: 'pyramid',
    landmarkColor: '#e3c58f',
    vehicles: [
      {
        id: 'taxi',
        body: '#f8fafc',
        accent: '#111827',
        len: 0.5,
        wid: 0.28,
        h: 11,
        extra: 'stripes',
      },
      {
        id: 'microbus',
        body: '#e2e8f0',
        accent: '#1d4ed8',
        len: 0.8,
        wid: 0.34,
        h: 14,
        extra: 'stripes',
      },
      { id: 'tuktuk', body: '#2563eb', accent: '#facc15', len: 0.36, wid: 0.22, h: 11 },
      car('car', '#78716c'),
    ],
    streets: [
      'Tahrir Street',
      'Qasr El Nil',
      'Talaat Harb',
      '26th of July Street',
      'Corniche El Nil',
      'Ramses Street',
      'Mohamed Mahmoud',
      'Abbas Bridge Road',
    ],
  },
  accra: {
    ...BASE,
    sky: ['#fde68a', '#dcfce7'],
    land: '#ddc08f',
    asphalt: '#4e5462',
    sidewalk: '#ecdcc0',
    curb: '#cdb88f',
    park: '#93c97a',
    parkEdge: '#6fae58',
    walls: ['#fde68a', '#bbf7d0', '#fecaca', '#fef3c7', '#e0e7ff', '#fed7aa'],
    roofs: ['#b91c1c', '#15803d', '#a16207', '#1e293b'],
    tree: 'palm',
    leaf: ['#65a30d', '#3f6212'],
    edge: 'water',
    edgeColor: '#4aa7c8',
    landmark: 'star-gate',
    landmarkColor: '#f1f5f9',
    vehicles: [
      {
        id: 'trotro',
        body: '#f8fafc',
        accent: '#facc15',
        len: 0.8,
        wid: 0.34,
        h: 14,
        extra: 'rack',
      },
      {
        id: 'trotro2',
        body: '#facc15',
        accent: '#16a34a',
        len: 0.8,
        wid: 0.34,
        h: 14,
        extra: 'stripes',
      },
      {
        id: 'taxi',
        body: '#facc15',
        accent: '#b91c1c',
        len: 0.5,
        wid: 0.28,
        h: 11,
        extra: 'stripes',
      },
      car('car', '#0f172a'),
    ],
    streets: [
      'Oxford Street',
      'Liberation Road',
      'Independence Avenue',
      'Ring Road Central',
      'Kwame Nkrumah Avenue',
      'High Street',
      'Castle Road',
      'Cantonments Road',
    ],
  },
  freetown: {
    ...BASE,
    sky: ['#bae6fd', '#dcfce7'],
    land: '#b9d6a2',
    asphalt: '#525866',
    sidewalk: '#e5ded0',
    curb: '#c4b99f',
    park: '#86c56f',
    parkEdge: '#63a64d',
    walls: ['#fbcfe8', '#bfdbfe', '#fde68a', '#bbf7d0', '#fed7aa', '#ddd6fe'],
    roofs: ['#64748b', '#b91c1c', '#0f766e', '#92400e'],
    tree: 'round',
    leaf: ['#22c55e', '#15803d'],
    edge: 'water',
    edgeColor: '#3fa6c4',
    landmark: 'cotton-tree',
    landmarkColor: '#166534',
    vehicles: [
      {
        id: 'podapoda',
        body: '#f8fafc',
        accent: '#2563eb',
        len: 0.8,
        wid: 0.34,
        h: 14,
        extra: 'rack',
      },
      { id: 'keke', body: '#facc15', accent: '#111827', len: 0.36, wid: 0.22, h: 11 },
      {
        id: 'okada',
        body: '#2563eb',
        accent: '#111827',
        len: 0.3,
        wid: 0.12,
        h: 11,
        extra: 'rider',
      },
      car('car', '#16a34a'),
    ],
    streets: [
      'Siaka Stevens Street',
      'Lightfoot Boston Street',
      'Wilkinson Road',
      'Kissy Road',
      'Pademba Road',
      'Wallace Johnson Street',
      'Howe Street',
      'Lumley Beach Road',
    ],
  },
  kigali: {
    ...BASE,
    sky: ['#bae6fd', '#ecfccb'],
    land: '#a9cf8f',
    asphalt: '#4b5563',
    sidewalk: '#e7e8e1',
    curb: '#c3c6b8',
    park: '#8fd07a',
    parkEdge: '#6bb357',
    walls: ['#f8fafc', '#e2e8f0', '#fef3c7', '#dcfce7', '#e0f2fe'],
    roofs: ['#b45309', '#1e40af', '#15803d', '#78716c'],
    tree: 'cypress',
    leaf: ['#22c55e', '#166534'],
    edge: 'hills',
    edgeColor: '#7fbf63',
    landmark: 'convention-dome',
    landmarkColor: '#f1f5f9',
    vehicles: [
      {
        id: 'moto',
        body: '#16a34a',
        accent: '#facc15',
        len: 0.3,
        wid: 0.12,
        h: 11,
        extra: 'rider',
      },
      {
        id: 'moto2',
        body: '#dc2626',
        accent: '#16a34a',
        len: 0.3,
        wid: 0.12,
        h: 11,
        extra: 'rider',
      },
      { id: 'bus', body: '#1d4ed8', accent: '#f8fafc', len: 0.95, wid: 0.34, h: 15 },
      car('car', '#f8fafc'),
    ],
    streets: [
      'KN 3 Avenue',
      'KG 7 Avenue',
      'KN 5 Road',
      'Boulevard de la Révolution',
      'KN 4 Avenue',
      'KG 11 Avenue',
      'Avenue de la Paix',
      'KN 82 Street',
    ],
  },
  johannesburg: {
    ...BASE,
    sky: ['#bfdbfe', '#fef9c3'],
    land: '#d8c896',
    asphalt: '#4b5260',
    sidewalk: '#e6e1d3',
    curb: '#c4bb9f',
    park: '#9cc97a',
    parkEdge: '#7aac58',
    walls: ['#e7e5e4', '#fde68a', '#fecaca', '#d1d5db', '#fed7aa'],
    roofs: ['#7c2d12', '#334155', '#a16207', '#57534e'],
    tree: 'jacaranda',
    leaf: ['#a78bfa', '#7c3aed'],
    edge: 'mine-dumps',
    edgeColor: '#e9c46a',
    landmark: 'hillbrow-tower',
    landmarkColor: '#e5e7eb',
    vehicles: [
      {
        id: 'minibus',
        body: '#f8fafc',
        accent: '#f59e0b',
        len: 0.8,
        wid: 0.34,
        h: 14,
        extra: 'stripes',
      },
      {
        id: 'minibus2',
        body: '#e5e7eb',
        accent: '#0ea5e9',
        len: 0.8,
        wid: 0.34,
        h: 14,
        extra: 'stripes',
      },
      { id: 'bus', body: '#f97316', accent: '#f8fafc', len: 0.95, wid: 0.34, h: 15 },
      car('bakkie', '#991b1b'),
      car('car', '#1f2937'),
    ],
    streets: [
      'Jan Smuts Avenue',
      'Rivonia Road',
      'Commissioner Street',
      'Fox Street',
      'Main Street',
      'Oxford Road',
      'Bree Street',
      'Juta Street',
    ],
  },
  'san-francisco': {
    ...BASE,
    sky: ['#cbd5e1', '#f1f5f9'],
    land: '#c9d6b8',
    asphalt: '#4b5563',
    sidewalk: '#e5e7eb',
    curb: '#c7cbd1',
    park: '#93c47d',
    parkEdge: '#6fa35a',
    // Victorian pastels.
    walls: ['#f9c6d0', '#bfe3d0', '#fde9a9', '#c7d7f5', '#e9d5ff', '#fbd5b5', '#f1f5f9'],
    roofs: ['#64748b', '#475569', '#9a3412', '#334155'],
    tree: 'cypress',
    leaf: ['#4d7c0f', '#365314'],
    edge: 'water',
    edgeColor: '#5b8fa8',
    landmark: 'transamerica',
    landmarkColor: '#e7e5e4',
    fog: true,
    vehicles: [
      {
        id: 'cablecar',
        body: '#b91c1c',
        accent: '#fde68a',
        len: 0.75,
        wid: 0.32,
        h: 15,
        extra: 'cable',
      },
      {
        id: 'muni',
        body: '#e5e7eb',
        accent: '#b91c1c',
        len: 0.95,
        wid: 0.34,
        h: 15,
        extra: 'stripes',
      },
      {
        id: 'robotaxi',
        body: '#f8fafc',
        accent: '#0f172a',
        len: 0.52,
        wid: 0.28,
        h: 11,
        extra: 'sensor',
      },
      {
        id: 'scooter',
        body: '#16a34a',
        accent: '#111827',
        len: 0.26,
        wid: 0.1,
        h: 10,
        extra: 'rider',
      },
      car('car', '#1e3a8a'),
    ],
    streets: [
      'Market Street',
      'Valencia Street',
      'Mission Street',
      'Folsom Street',
      'Howard Street',
      'The Embarcadero',
      'Castro Street',
      'Haight Street',
    ],
  },
};

export const flavourOf = (marketId: string): Flavour => FLAVOURS[marketId] ?? BASE;
