import type { CityPlan } from './types';

/** Freetown: Central around the Cotton Tree, Aberdeen and Lumley Beach, hills behind. */
export const freetown: CityPlan = {
  districts: [
    {
      id: 'aberdeen',
      name: 'Aberdeen',
      kind: 'waterfront',
      at: [0, 0],
      size: [2, 2],
      hosts: ['investors', 'eventhall'],
    },
    { id: 'central', name: 'Central', kind: 'downtown', at: [2, 0], size: [2, 3], hosts: ['finance', 'market'] },
    { id: 'kissy', name: 'Kissy', kind: 'industrial', at: [4, 0], size: [2, 2], hosts: ['airport'] },
    { id: 'lumley', name: 'Lumley', kind: 'waterfront', at: [0, 2], size: [2, 2], hosts: ['home'] },
    { id: 'congo-cross', name: 'Congo Cross', kind: 'tech', at: [2, 3], size: [2, 2], hosts: ['hub'] },
    { id: 'wilberforce', name: 'Wilberforce', kind: 'residential', at: [0, 4], size: [2, 2] },
  ],
  water: { side: 'north', name: 'Atlantic Ocean', also: ['west'] },
  hills: [
    { at: [4, 3], height: 3 },
    { at: [5, 4], height: 2 },
    { at: [4, 5], height: 2 },
  ],
  streets: 'organic',
  bridges: [{ name: 'Ferry to Lungi', from: [6, 0], to: [6, -3], style: 'beam', color: '#a8a29e' }],
  landmarks: [
    { kind: 'cotton-tree', name: 'Cotton Tree', at: [3, 1] },
    { kind: 'lighthouse', name: 'Cape Lighthouse', at: [0, 0] },
  ],
  transit: ['keke', 'okada', 'bus', 'ferry'],
  streetNames: [
    'Siaka Stevens Street',
    'Lightfoot Boston Street',
    'Wilkinson Road',
    'Kissy Road',
    'Pademba Road',
    'Wallace Johnson Street',
    'Howe Street',
    'Lumley Beach Road',
    'Spur Road',
  ],
};
