/**
 * The map's gestures, shown once (Phase 2): the first time the City map
 * appears, a short card says how to move around it, and "Got it" puts it
 * away for good (`runway.gestureHint` in this browser). A plain card, no
 * animation, so it suits reduced motion as it is.
 */
import { useState } from 'react';
import { t } from '../i18n';

const KEY = 'runway.gestureHint';

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true; // storage blocked: don't nag on every visit
  }
}

export function GestureHint() {
  const [open, setOpen] = useState(() => !seen());
  if (!open) return null;
  const done = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* not remembered: it shows again next time */
    }
    setOpen(false);
  };
  return (
    <div className="gesture-hint" role="note" aria-label={t('How to use the map')}>
      <p>{t('Drag to look around · Pinch to zoom · Tap a building to go in')}</p>
      <button type="button" className="btn btn-primary gesture-hint-ok" onClick={done}>
        {t('Got it')}
      </button>
    </div>
  );
}
