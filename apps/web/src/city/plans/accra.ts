import type { CityPlan } from './types';

/** Accra: Airport City money, Osu's Oxford Street, Makola Market, the Atlantic shore. */
export const accra: CityPlan = {
  districts: [
    {
      id: 'east-legon',
      name: 'East Legon',
      kind: 'residential',
      at: [0, 0],
      size: [2, 2],
      hosts: ['home'],
    },
    {
      id: 'cantonments',
      name: 'Cantonments',
      kind: 'residential',
      at: [2, 0],
      size: [2, 2],
      hosts: ['investors'],
    },
    {
      id: 'airport-city',
      name: 'Airport City',
      kind: 'finance',
      at: [4, 0],
      size: [3, 2],
      hosts: ['finance', 'airport'],
    },
    { id: 'makola', name: 'Makola', kind: 'market', at: [0, 3], size: [2, 2], hosts: ['market'] },
    { id: 'osu', name: 'Osu', kind: 'nightlife', at: [2, 3], size: [2, 2], hosts: ['hub'] },
    {
      id: 'labadi',
      name: 'Labadi',
      kind: 'waterfront',
      at: [4, 3],
      size: [3, 2],
      hosts: ['eventhall'],
    },
    { id: 'jamestown', name: 'Jamestown', kind: 'waterfront', at: [0, 5], size: [3, 2] },
  ],
  water: { side: 'south', name: 'Gulf of Guinea' },
  open: { rows: [5], cols: [4] },
  streets: 'organic',
  landmarks: [
    { kind: 'star-gate', name: 'Black Star Gate', at: [3, 5] },
    { kind: 'lighthouse', name: 'Jamestown Lighthouse', at: [0, 6] },
    { kind: 'market-hall', name: 'Kaneshie Market', at: [1, 4] },
  ],
  transit: ['bus', 'okada'],
  marketName: 'Makola Market',
  streetNames: [
    'Oxford Street',
    'Liberation Road',
    'Independence Avenue',
    'Ring Road Central',
    'Kwame Nkrumah Avenue',
    'High Street',
    'Castle Road',
    'Cantonments Road',
    'Labadi Road',
    'Boundary Road',
  ],
};
