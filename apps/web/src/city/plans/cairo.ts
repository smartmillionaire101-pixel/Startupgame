import type { CityPlan } from './types';

/** Cairo: Downtown and Garden City on the east bank of the Nile, Zamalek and Giza across. */
export const cairo: CityPlan = {
  districts: [
    {
      id: 'zamalek',
      name: 'Zamalek',
      kind: 'nightlife',
      at: [0, 0],
      size: [2, 3],
      hosts: ['investors'],
    },
    {
      id: 'downtown',
      name: 'Downtown',
      kind: 'downtown',
      at: [3, 0],
      size: [2, 2],
      hosts: ['finance'],
    },
    {
      id: 'khan-el-khalili',
      name: 'Khan el-Khalili',
      kind: 'market',
      at: [5, 0],
      size: [2, 2],
      hosts: ['market'],
    },
    {
      id: 'garden-city',
      name: 'Garden City',
      kind: 'downtown',
      at: [3, 2],
      size: [2, 2],
      hosts: ['hub'],
    },
    {
      id: 'heliopolis',
      name: 'Heliopolis',
      kind: 'residential',
      at: [5, 2],
      size: [2, 2],
      hosts: ['airport', 'eventhall'],
    },
    { id: 'maadi', name: 'Maadi', kind: 'residential', at: [3, 4], size: [2, 2], hosts: ['home'] },
    { id: 'new-cairo', name: 'New Cairo', kind: 'tech', at: [5, 4], size: [2, 3] },
  ],
  water: { side: 'west', name: 'The Nile', river: 2 },
  streets: 'organic',
  bridges: [
    { name: 'Qasr El Nil Bridge', from: [2, 1], to: [3, 1], style: 'arch', color: '#b45309' },
    { name: '6th October Bridge', from: [2, 3], to: [3, 3], style: 'beam', color: '#a8a29e' },
    { name: 'Abbas Bridge', from: [2, 6], to: [3, 6], style: 'beam', color: '#a8a29e' },
  ],
  landmarks: [
    { kind: 'cairo-tower', name: 'Cairo Tower', at: [1, 2] },
    { kind: 'pyramid', name: 'Pyramids of Giza', at: [0, 5] },
    { kind: 'minaret', name: 'Al-Azhar', at: [6, 1] },
  ],
  transit: ['bus', 'metro', 'ferry'],
  streetNames: [
    'Tahrir Street',
    'Qasr El Nil',
    'Talaat Harb',
    '26th of July Street',
    'Corniche El Nil',
    'Ramses Street',
    'Mohamed Mahmoud',
    'Abbas Bridge Road',
    'Al-Muizz Street',
    'Road 9',
  ],
};
