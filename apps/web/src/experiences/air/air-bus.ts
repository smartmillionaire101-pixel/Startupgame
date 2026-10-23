/**
 * Open a skydive or a helicopter ride from anywhere (the Going out app, the
 * skydive centre or the heliport on the map): AirHost shows the booking,
 * then the flight, full screen on top.
 */
export interface AirRequest {
  kind: 'skydive' | 'heli';
  /** The option to start on (a tandem, a charter …). */
  itemId?: string;
}

let open: AirRequest | null = null;
const listeners = new Set<() => void>();
export const airOpen = () => open;
export const onAir = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
export function openAir(req: AirRequest) {
  open = req;
  listeners.forEach((f) => f());
}
export function closeAir() {
  open = null;
  listeners.forEach((f) => f());
}

/** Which flight a venue item is (a skydive, a helicopter ride), or null. */
export function airOf(item: { id: string }): AirRequest['kind'] | null {
  if (/^skydive-/.test(item.id)) return 'skydive';
  if (/^heli-/.test(item.id)) return 'heli';
  return null;
}
