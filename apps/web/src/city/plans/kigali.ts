import type { CityPlan } from './types';

/** Kigali: a city of hills, roundabouts and motos; Kiyovu, Kimihurura, Kacyiru. */
export const kigali: CityPlan = {
  districts: [
    { id: 'nyabugogo', name: 'Nyabugogo', kind: 'market', at: [0, 0], size: [2, 2], hosts: ['market'] },
    { id: 'kacyiru', name: 'Kacyiru', kind: 'tech', at: [2, 0], size: [3, 2], hosts: ['hub'] },
    { id: 'nyarugenge', name: 'Nyarugenge', kind: 'downtown', at: [0, 2], size: [2, 2], hosts: ['eventhall'] },
    { id: 'kiyovu', name: 'Kiyovu', kind: 'finance', at: [2, 2], size: [2, 2], hosts: ['finance'] },
    { id: 'kimihurura', name: 'Kimihurura', kind: 'nightlife', at: [4, 2], size: [2, 2], hosts: ['investors'] },
    { id: 'remera', name: 'Remera', kind: 'residential', at: [2, 4], size: [3, 2], hosts: ['home', 'airport'] },
  ],
  hills: [
    { at: [0, 4], height: 3 },
    { at: [1, 5], height: 2 },
    { at: [5, 4], height: 3 },
    { at: [5, 0], height: 2 },
  ],
  streets: 'radial',
  landmarks: [{ kind: 'convention-dome', name: 'Convention Centre', at: [5, 1] }],
  transit: ['boda', 'bus'],
  streetNames: [
    'KN 3 Avenue',
    'KG 7 Avenue',
    'KN 5 Road',
    'Boulevard de la Révolution',
    'KN 4 Avenue',
    'KG 11 Avenue',
    'Avenue de la Paix',
    'KN 82 Street',
    'KG 9 Avenue',
  ],
};
