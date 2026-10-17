/**
 * Where a journey objective's Go button takes you, in one place: the City's
 * Journey sheet, the phone's Journey app and the "What should I do now?"
 * card (Phase 2) all run the same steps, each with its own way to walk to a
 * place, open an app or switch tab.
 */
import { useCallback } from 'react';
import { useNav, type PhoneApp } from '../phone/bus';
import type { TabId } from '../phone/navigate';
import { openSky } from '../experiences/sky-bus';
import { openCompanyTab } from '../screens/Company';
import type { JourneyGo } from './journey';

export interface JourneyGoHandlers {
  /** Walk to a place on the map (and go in). */
  place: (id: string) => void;
  /** Open a phone app. */
  app: (app: PhoneApp) => void;
  /** Switch to a bottom tab (its Company section is already chosen). */
  tab: (tab: TabId) => void;
  /** Before a sky view opens (close whatever is in front of the map). */
  beforeSky?: () => void;
}

/** Run a Go: the one mapping from a journey target to an action. */
export function runJourneyGo(g: JourneyGo, h: JourneyGoHandlers) {
  switch (g.kind) {
    case 'place':
      h.place(g.place);
      return;
    case 'app':
      h.app(g.app as PhoneApp);
      return;
    case 'tab':
      if (g.section) openCompanyTab(g.section);
      h.tab(g.tab);
      return;
    case 'sky':
      h.beforeSky?.();
      openSky(g.id);
  }
}

/**
 * Go from anywhere in the game screen (Today, the City HUD): through the
 * app's navigation, the same way a notification does.
 */
export function useJourneyGo(): (g: JourneyGo) => void {
  const nav = useNav();
  return useCallback(
    (g: JourneyGo) =>
      runJourneyGo(g, {
        place: (place) => nav?.go({ kind: 'place', place }),
        app: (app) => nav?.go({ kind: 'phone', open: { app } }),
        tab: (tab) => nav?.go({ kind: 'tab', tab }),
      }),
    [nav],
  );
}
