/**
 * "What should I do now?" (Phase 2, Simple mode): one sentence and one big
 * button that goes straight there. It shows the journey's main objective, or
 * else the best opportunity, or else a personal one (the same three the
 * Journey sheet offers), and hides when there's nothing to suggest.
 *
 * On Today it is a card at the top. On the City map (`onMap`) it is a 💡
 * button with the other map buttons (a red dot while there's a suggestion
 * you haven't opened): tapping it opens a small card with the suggestion
 * and a Go button, so it never covers the map by itself.
 */
import { useState } from 'react';
import { t } from '../i18n';
import { useView } from '../store';
import { Button } from '../ui';
import { objectivesFor, type JourneyGo, type Objective } from './journey';
import { useJourneyGo } from './journeyGo';

/**
 * The one objective worth doing next: main, else opportunity, else personal,
 * skipping one with nowhere to go (the card is a button). Null hides the card.
 */
export function nextObjective(o: Record<Objective['kind'], Objective | null>): Objective | null {
  return [o.main, o.opportunity, o.personal].find((x) => !!x?.go) ?? null;
}

/** The last suggestion the player opened on the map (by objective id): no red dot for it. */
const SEEN_KEY = 'runway.nextStepSeen';
function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

/** The big button's word: walk somewhere, or open the thing. */
const goLabel = (g: JourneyGo) => (g.kind === 'place' ? t('Go there') : t('Open it'));

export function NextStepCard({
  onGo,
  onMap = false,
}: {
  /** Where Go leads; by default through the app's navigation (as a notification does). */
  onGo?: (g: JourneyGo) => void;
  onMap?: boolean;
}) {
  const { view } = useView();
  const fallback = useJourneyGo();
  const [seen, setSeen] = useState(readSeen);
  const [open, setOpen] = useState(false);
  const o = nextObjective(objectivesFor(view));
  if (!o || !o.go) return null;
  const go = o.go;
  if (onMap) {
    const show = () => {
      setOpen(true);
      setSeen(o.id);
      try {
        localStorage.setItem(SEEN_KEY, o.id);
      } catch {
        /* storage blocked: the dot comes back next visit */
      }
    };
    return (
      <div className="next-step-pin" data-next-step={o.id}>
        <button
          type="button"
          className="next-step-bulb has-label"
          aria-label={t('What should I do now?')}
          aria-expanded={open}
          data-new={seen !== o.id ? '' : undefined}
          onClick={() => (open ? setOpen(false) : show())}
        >
          <span aria-hidden="true">💡</span>
          {/* On the map (Simple mode): a word with the bulb, like the buttons beside it. */}
          <span className="next-step-bulb-label" aria-hidden="true">
            {t('Next step')}
          </span>
          {seen !== o.id && <span className="next-step-dot" aria-hidden="true" />}
        </button>
        {open && (
          <section className="next-step-pop" aria-labelledby="next-step-pop-title">
            <div className="next-step-pop-head">
              <h2 className="next-step-title" id="next-step-pop-title">
                {t('What should I do now?')}
              </h2>
              <button
                type="button"
                className="next-step-hide"
                aria-label={t('Close')}
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <b className="next-step-label">
              <span aria-hidden="true">{o.icon}</span> {o.label}
            </b>
            {o.why && <span className="next-step-why">{o.why}</span>}
            <Button
              className="btn btn-primary btn-block next-step-go"
              onClick={() => {
                setOpen(false);
                (onGo ?? fallback)(go);
              }}
            >
              {goLabel(go)}
            </Button>
          </section>
        )}
      </div>
    );
  }
  return (
    <section className="next-step card" aria-labelledby="next-step-title" data-next-step={o.id}>
      <h2 className="next-step-title" id="next-step-title">
        {t('What should I do now?')}
      </h2>
      <div className="next-step-main">
        <span className="next-step-icon" aria-hidden="true">
          {o.icon}
        </span>
        <span className="next-step-text">
          <b className="next-step-label">{o.label}</b>
          {o.why && <span className="next-step-why">{o.why}</span>}
        </span>
      </div>
      <Button
        className="btn btn-primary btn-lg btn-block next-step-go"
        onClick={() => (onGo ?? fallback)(go)}
      >
        {goLabel(go)}
      </Button>
    </section>
  );
}
