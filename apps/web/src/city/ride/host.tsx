/**
 * Mounts the ride scene in its own small React root on <body>, loaded the
 * first time a ride starts (its own chunk), so the map and the City screen
 * don't have to render it.
 */
import { createRoot } from 'react-dom/client';
import { RideScene } from './RideScene';
import { useRide } from './state';

function RideHost() {
  const ride = useRide();
  return ride ? <RideScene key={ride.id} ride={ride} /> : null;
}

let mounted = false;
export function mountRideHost() {
  if (mounted || typeof document === 'undefined') return;
  mounted = true;
  const el = document.createElement('div');
  el.id = 'ride-root';
  document.body.appendChild(el);
  createRoot(el).render(<RideHost />);
}
