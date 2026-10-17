/**
 * Whether a signed-out visitor sees the landing page (./Landing.tsx) first:
 * yes, unless they came by an emailed sign-in link, or this browser has
 * \`runway.landingSeen\` set (the e2e fixture sets it for specs about other things).
 */
const ARRIVED_BY_LINK =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('signin');

export function shouldShowLanding(): boolean {
  if (ARRIVED_BY_LINK) return false;
  try {
    return localStorage.getItem('runway.landingSeen') !== '1';
  } catch {
    return true;
  }
}
