/**
 * Phase 5 life events: the pop-up. When something has happened in your life
 * (an open life event in `view.decisions`) its card opens on its own, one at
 * a time, and only while you're on a main screen: never over a place scene,
 * a ride or its chooser, the phone, the month's recap or any other sheet
 * (anything with role="dialog" on screen waits for it to close).
 *
 * Each event pops up once on this device (remembered per player); closed
 * with "Decide later", it waits in the Decisions list on Today, and takes
 * its default at the month's end. `runway.lifeEventsPopup = '0'` turns the
 * pop-up off (end-to-end specs about other things); the events still come.
 */
import { useEffect, useState } from 'react';
import { useView } from './store';
import { LifeEventSheet } from './screens/Decisions';

/** Set to '0' to never pop life events up on their own. */
const POPUP_KEY = 'runway.lifeEventsPopup';
const SEEN_KEY = (playerId: string) => `runway.lifeSeen.${playerId}`;
/** How often to look for a calm moment (ms). */
const POLL_MS = 1200;

function popupOff(): boolean {
  try {
    return localStorage.getItem(POPUP_KEY) === '0';
  } catch {
    return false;
  }
}

function readSeen(playerId: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY(playerId)) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeSeen(playerId: string, ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY(playerId), JSON.stringify(ids.slice(-30)));
  } catch {
    /* storage blocked: it may pop up again next time */
  }
}

/** Nothing else is open over the screen (a sheet, a scene, the phone, the ride chooser…). */
const calm = () => typeof document !== 'undefined' && !document.querySelector('[role="dialog"]');

/** Mounted once in the game: pops up the next life event when the screen is calm. */
export function LifeEventHost() {
  const { view } = useView();
  const playerId = view.me.id;
  const [seen, setSeen] = useState<string[]>(() => readSeen(playerId));
  const [shownId, setShownId] = useState<string | null>(null);
  const d = view.decisions;
  const next = d.lifeOn ? d.open.find((e) => e.life && !seen.includes(e.id)) : undefined;
  const nextId = next?.id ?? null;

  useEffect(() => {
    if (shownId || !nextId || popupOff()) return;
    const timer = setInterval(() => {
      if (!calm()) return;
      clearInterval(timer);
      setSeen((s) => {
        const ids = [...s, nextId];
        writeSeen(playerId, ids);
        return ids;
      });
      setShownId(nextId);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [shownId, nextId, playerId]);

  if (!shownId) return null;
  // Answered, it's in `recent` with its result: the card stays on it until OK.
  const ev =
    d.open.find((e) => e.id === shownId) ?? d.recent.find((e) => e.id === shownId && e.life);
  if (!ev) return null;
  return <LifeEventSheet ev={ev} onClose={() => setShownId(null)} />;
}
