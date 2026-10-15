/**
 * Coach marks (Founder Journey 6): a glowing ring on the one thing to tap
 * next. Non-blocking: the page stays usable and nothing is covered, so a
 * founder can always do something else. The ring follows the element as
 * screens change (checked a few times a second).
 */
import { useEffect } from 'react';

const CLASS = 'coach-spot';

export function useSpotlight(selector: string | null) {
  useEffect(() => {
    if (!selector) return;
    let el: Element | null = null;
    const apply = () => {
      let next: Element | null = null;
      try {
        next = document.querySelector(selector);
      } catch {
        next = null;
      }
      if (next === el) return;
      el?.classList.remove(CLASS);
      el = next;
      el?.classList.add(CLASS);
    };
    apply();
    const timer = setInterval(apply, 400);
    return () => {
      clearInterval(timer);
      el?.classList.remove(CLASS);
    };
  }, [selector]);
}
