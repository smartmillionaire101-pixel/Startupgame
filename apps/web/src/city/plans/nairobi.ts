import type { CityPlan } from './types';

/** Nairobi: Upper Hill banks, Westlands investors, Kilimani tech, the National Park edge. */
export const nairobi: CityPlan = {
  districts: [
    {
      id: 'westlands',
      name: 'Westlands',
      kind: 'nightlife',
      at: [0, 0],
      size: [2, 2],
      hosts: ['investors'],
    },
    { id: 'eastleigh', name: 'Eastleigh', kind: 'market', at: [4, 0], size: [2, 2] },
    { id: 'kilimani', name: 'Kilimani', kind: 'tech', at: [0, 2], size: [2, 2], hosts: ['hub'] },
    { id: 'cbd', name: 'CBD', kind: 'downtown', at: [2, 2], size: [2, 2], hosts: ['eventhall'] },
    { id: 'gikomba', name: 'Gikomba', kind: 'market', at: [4, 2], size: [2, 2], hosts: ['market'] },
    {
      id: 'upper-hill',
      name: 'Upper Hill',
      kind: 'finance',
      at: [2, 4],
      size: [2, 2],
      hosts: ['finance'],
    },
    { id: 'karen', name: 'Karen', kind: 'residential', at: [0, 4], size: [2, 2], hosts: ['home'] },
    {
      id: 'industrial-area',
      name: 'Industrial Area',
      kind: 'industrial',
      at: [4, 4],
      size: [3, 2],
      hosts: ['airport'],
    },
    { id: 'national-park', name: 'Nairobi National Park', kind: 'park', at: [0, 6], size: [7, 1] },
  ],
  hills: [
    { at: [6, 0], height: 2 },
    { at: [6, 2], height: 3 },
  ],
  open: { rows: [2], cols: [4] },
  streets: 'mixed',
  landmarks: [
    { kind: 'conference-tower', name: 'Conference Centre', at: [2, 1] },
    { kind: 'market-hall', name: 'City Market', at: [3, 3] },
  ],
  transit: ['matatu', 'boda', 'bus'],
  marketName: 'Gikomba Market',
  streetNames: [
    'Moi Avenue',
    'Kenyatta Avenue',
    'Ngong Road',
    'Waiyaki Way',
    'Kimathi Street',
    'Mama Ngina Street',
    'Muindi Mbingu Street',
    'Harambee Avenue',
    'Haile Selassie Avenue',
    'Argwings Kodhek Road',
    'Luthuli Avenue',
  ],
};
