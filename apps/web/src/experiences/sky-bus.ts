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
