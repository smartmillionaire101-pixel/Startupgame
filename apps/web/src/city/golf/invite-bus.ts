/**
 * Golf with a friend: open the invitation card for a match (from a chat card
 * or the notice), or the invite sheet for a friend (from their chat). The
 * card itself is GolfInviteHost.tsx, mounted once for the whole app.
 */
let shown: string | null = null;
const listeners = new Set<() => void>();
export const golfInviteShown = () => shown;
export const onGolfInvite = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
export function showGolfInvite(roomId: string | null) {
  shown = roomId;
  listeners.forEach((f) => f());
}

/** Asked from a friend's chat: open the golf invite sheet with them picked. */
let pickedFriend: string | null = null;
export const pickedGolfFriend = () => pickedFriend;
export const clearGolfFriend = () => {
  pickedFriend = null;
};
