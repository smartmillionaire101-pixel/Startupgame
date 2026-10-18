/**
 * "What should I do now?" (Phase 2, Simple mode): one sentence and one big
 * button that goes straight there. It shows the journey's main objective, or
 * else the best opportunity, or else a personal one (the same three the
 * Journey sheet offers), and hides when there's nothing to suggest.
 *
 * On Today it is a card at the top. On the City map (`onMap`) it is a small
 * banner in the bottom corner, in place of the "What to do now" chip: the
 * suggestion and a Go button. Tucked away (×) it is a small 💡 button until
 * the suggestion changes, so it doesn't keep coming back over the map.
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

/** The suggestion the player tucked away on the map (by objective id). */
const HIDDEN_KEY = 'runway.nextStepHidden';
function readHidden(): string | null {
  try {
    return localStorage.getItem(HIDDEN_KEY);
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
  const [hidden, setHidden] = useState(readHidden);
  const o = nextObjective(objectivesFor(view));
  if (!o || !o.go) return null;
  const go = o.go;
  if (onMap) {
    const hide = (v: string | null) => {
      setHidden(v);
      try {
        if (v) localStorage.setItem(HIDDEN_KEY, v);
        else localStorage.removeItem(HIDDEN_KEY);
      } catch {
        /* storage blocked: tucked away for this visit */
      }
    };
    if (hidden === o.id)
      return (
        <button
          type="button"
          className="next-step-tucked"
          data-next-step={o.id}
          aria-label={t('What should I do now?')}
          title={t('What should I do now?')}
          onClick={() => hide(null)}
        >
          <span aria-hidden="true">💡</span>
        </button>
      );
    return (
      <section
        className="next-step-chip"
        aria-label={t('What should I do now?')}
        data-next-step={o.id}
      >
        <span className="next-step-icon" aria-hidden="true">
          {o.icon}
        </span>
        <span className="next-step-text">
          <span className="next-step-title">{t('What should I do now?')}</span>
          <b className="next-step-label">{o.label}</b>
        </span>
        <Button className="btn btn-primary next-step-go" onClick={() => (onGo ?? fallback)(go)}>
          {goLabel(go)}
        </Button>
        <button
          type="button"
          className="next-step-hide"
          aria-label={t('Hide')}
          onClick={() => hide(o.id)}
        >
          ×
        </button>
      </section>
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
