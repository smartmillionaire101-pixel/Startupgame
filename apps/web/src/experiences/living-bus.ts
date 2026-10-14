let host: string | null = null;
const listeners = new Set<() => void>();
export const livingPlace = () => host;
export const onLiving = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
export function openLiving(id: string) {
  host = id;
  listeners.forEach((f) => f());
}
export function closeLiving() {
  host = null;
  listeners.forEach((f) => f());
}
