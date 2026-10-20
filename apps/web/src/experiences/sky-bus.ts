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
 * and make its canvas in a quiet moment, so a tap goes up at once. Returns a
 * cancel: the list gone before that moment came (you picked somewhere else,
 * going home say), the canvas isn't made in the middle of opening it.
 */
export function prewarmSky(city: string): () => void {
  let gone = false;
  const go = () => {
    if (gone) return;
    import('./Panorama').then(
      (m) => !gone && m.prewarm(city),
      () => {},
    );
  };
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(go, { timeout: 2000 });
    return () => {
      gone = true;
      cancelIdleCallback(id);
    };
  }
  const t = setTimeout(go, 300);
  return () => {
    gone = true;
    clearTimeout(t);
  };
}
