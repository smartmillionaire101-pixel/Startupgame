/**
 * Open a sky view from anywhere (the city map's landmarks, the Places list,
 * the Sky views button): SkyHost draws it full screen on top.
 */
let open: string | null = null;
const listeners = new Set<() => void>();
export const skyOpen = () => open;
export const onSky = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
export function openSky(viewId: string) {
  open = viewId;
  listeners.forEach((f) => f());
}
export function closeSky() {
  open = null;
  listeners.forEach((f) => f());
}

/**
 * A city's sky views are on screen: fetch the view's code, map and terrain
 * and make its canvas in a quiet moment, so a tap goes up at once.
 */
export function prewarmSky(city: string) {
  const go = () => {
    import('./Panorama').then(
      (m) => m.prewarm(city),
      () => {},
    );
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 2000 });
  else setTimeout(go, 300);
}
