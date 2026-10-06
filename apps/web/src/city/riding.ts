/**
 * Are you on a ride right now? (Wave 7: "What to do now" hides during rides.)
 *
 * A tiny shim shared by the map and the ride scenes: whoever starts or ends a
 * ride dispatches `window` CustomEvent 'runway:riding' with `detail: boolean`
 * (CityMap does when your vehicle appears and goes; city/ride's RideScene does
 * too, through its `isRiding` state). Anything can read it with useRiding().
 */
import { useSyncExternalStore } from 'react';

export const RIDING_EVENT = 'runway:riding';

let riding = false;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener(RIDING_EVENT, (e) => {
    const next = !!(e as CustomEvent<unknown>).detail;
    if (next === riding) return;
    riding = next;
    for (const l of listeners) l();
  });
}

/** Tell the app a ride started (true) or ended (false). */
export function setRiding(on: boolean) {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(RIDING_EVENT, { detail: on }));
}

export const isRiding = () => riding;

export function useRiding(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    isRiding,
    () => false,
  );
}
