import type { CityPlan } from './types';

/** Lagos: the mainland (Ikeja, Yaba, Surulere) and the islands across the Lagoon. */
export const lagos: CityPlan = {
  districts: [
    { id: 'ikeja', name: 'Ikeja', kind: 'market', at: [0, 0], size: [2, 3], hosts: ['airport'] },
    { id: 'yaba', name: 'Yaba', kind: 'tech', at: [2, 0], size: [3, 2], hosts: ['hub'] },
    { id: 'surulere', name: 'Surulere', kind: 'residential', at: [5, 0], size: [2, 3] },
    { id: 'balogun', name: 'Balogun', kind: 'market', at: [0, 4], size: [2, 2], hosts: ['market'] },
    { id: 'marina', name: 'Marina', kind: 'finance', at: [2, 4], size: [2, 2], hosts: ['finance'] },
    {
      id: 'ikoyi',
      name: 'Ikoyi',
      kind: 'residential',
      at: [4, 4],
      size: [2, 1],
      hosts: ['investors'],
    },
    {
      id: 'victoria-island',
      name: 'Victoria Island',
      kind: 'downtown',
      at: [4, 5],
      size: [2, 2],
      hosts: ['eventhall'],
    },
    { id: 'lekki', name: 'Lekki', kind: 'residential', at: [6, 4], size: [1, 3], hosts: ['home'] },
  ],
  water: { side: 'south', name: 'Lagos Lagoon', river: 3, also: ['south'] },
  streets: 'organic',
  bridges: [
    { name: 'Third Mainland Bridge', from: [1, 3], to: [1, 4], style: 'beam', color: '#cbd5e1' },
    { name: 'Carter Bridge', from: [3, 3], to: [3, 4], style: 'beam', color: '#a8a29e' },
    { name: 'Eko Bridge', from: [5, 3], to: [5, 4], style: 'beam', color: '#cbd5e1' },
  ],
  landmarks: [{ kind: 'theatre', name: 'National Theatre', at: [3, 2] }],
  transit: ['danfo', 'okada', 'keke', 'bus', 'ferry'],
  streetNames: [
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
    'Obafemi Awolowo Way',
    'Bode Thomas Street',
  ],
};
