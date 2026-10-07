/**
 * Wave 10 §C: a home on the property market in 3D (lazy-loaded). The Wave 9
 * house generator scaled to the listing: a studio is one room, a townhouse
 * three bedrooms, a villa or mansion gets the big plan with a pool terrace
 * (a mansion a formal garden and a fountain too), a penthouse a terrace high
 * over the city. Furnished as a show home; drag to look round, pinch to zoom.
 */
import { useMemo, useRef, type ReactElement } from 'react';
import { planFor } from '../home/layout';
import Home3D from './Home3D';
import { SLOT_MODEL } from './catalog';
import type { Home3DApi, Home3DObject } from './types';

export interface PropertyTour3DProps {
  /** Floor plan tier, 1–5. */
  planTier: number;
  /** Furniture quality, 1–3. */
  finish: number;
  estate: 'villa' | 'mansion' | 'penthouse' | null;
  night: boolean;
  onReady: () => void;
  api?: React.MutableRefObject<Home3DApi | null>;
}

const FIXTURES: [string, string][] = [
  ['door', 'door'],
  ['shower', 'shower'],
  ['toilet', 'toilet'],
  ['sink', 'sink'],
  ['bathtub', 'bathtub'],
  ['pool', 'pool'],
  ['piano', 'piano'],
  ['shared-bath', 'bathroom'],
];

export default function PropertyTour3D(props: PropertyTour3DProps): ReactElement | null {
  const plan = planFor(props.planTier);
  const own = useRef<Home3DApi | null>(null);
  const api = props.api ?? own;
  const objects = useMemo(() => {
    const out: Home3DObject[] = [];
    for (const [slot, spot] of Object.entries(plan.slots))
      if (SLOT_MODEL[slot])
        out.push({ id: slot, label: slot, spot, slot, owned: true, tier: props.finish });
    for (const [fx, id] of FIXTURES) {
      const spot = plan.fixtures[fx as keyof typeof plan.fixtures];
      if (spot) out.push({ id, label: id, spot });
    }
    return out;
  }, [plan, props.finish]);
  return (
    <Home3D
      plan={plan}
      tier={props.planTier}
      objects={objects}
      people={() => []}
      acting={null}
      night={props.night}
      dusk={false}
      car={props.planTier >= 4 ? 'luxury' : null}
      buyMode={false}
      sheetOpen={false}
      ghost={null}
      moving={null}
      api={api}
      onCamera={() => {}}
      onReady={props.onReady}
      reduced={false}
      estate={props.estate}
    />
  );
}
