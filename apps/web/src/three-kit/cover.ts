/**
 * A full-screen 3D view on top (a sky view, the home experiences) covers the
 * city map: the map stops drawing until it's uncovered. On a software
 * renderer two scenes drawing at once starve the page (and the one on top).
 */
let covers = 0;

/** Whether something covers the city map now. */
export const covered = (): boolean => covers > 0;

/** Cover the map; call the returned function to uncover (once). */
export function cover(): () => void {
  covers++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    covers--;
  };
}
