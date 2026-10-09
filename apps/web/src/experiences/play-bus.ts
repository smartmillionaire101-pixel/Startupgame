export interface PlayPlace {
  roomId?: string;
  venue: string;
  name: string;
  game?: 'quiz' | 'snooker' | 'football';
}
let place: PlayPlace | null = null;
const listeners = new Set<() => void>();
export const playPlace = () => place;
export const onPlay = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
export function openPlay(next: PlayPlace) {
  place = next;
  listeners.forEach((f) => f());
}
export function closePlay() {
  place = null;
  listeners.forEach((f) => f());
}
