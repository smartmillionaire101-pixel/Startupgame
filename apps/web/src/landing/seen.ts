/** Whether a signed-out visitor sees the landing page (./Landing.tsx) first. */
const SEEN_KEY = 'runway.landingSeen';

/** Arrived by an emailed sign-in link: straight to the game, no landing page. */
const ARRIVED_BY_LINK =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('signin');

export function shouldShowLanding(): boolean {
  if (ARRIVED_BY_LINK) return false;
  try {
    return localStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

/** Pressed Play or Log in: from now on this browser goes straight to sign-up. */
export function markLandingSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* not remembered: the landing page shows again next visit */
  }
}
