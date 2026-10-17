/**
 * "What should I do now?" (Phase 2, Simple mode): one sentence and one big
 * button that goes straight there. It shows the journey's main objective, or
 * else the best opportunity, or else a personal one (the same three the
 * Journey sheet offers), and hides when there's nothing to suggest.
 *
 * On Today it is a card at the top; on the City map (`onMap`) it sits at the
 * bottom, in place of the small "What to do now" chip.
 */
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
  const o = nextObjective(objectivesFor(view));
  if (!o || !o.go) return null;
  const go = o.go;
  return (
    <section
      className={`next-step${onMap ? ' next-step-map' : ' card'}`}
      aria-labelledby="next-step-title"
      data-next-step={o.id}
    >
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
