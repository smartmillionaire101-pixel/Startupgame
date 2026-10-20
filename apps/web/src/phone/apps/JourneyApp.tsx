/** The phone's Journey app: the founder journey's objectives and chapters. */
import { JourneyPanel } from '../../city/JourneyPanel';
import type { JourneyGo } from '../../city/journey';
import { runJourneyGo } from '../../city/journeyGo';
import { useNav } from '../bus';
import type { PhoneCtx } from '../shared';
import { RecapButton } from '../../recap/Recap';

export function JourneyApp({ ctx }: { ctx: PhoneCtx }) {
  const nav = useNav();
  const go = (g: JourneyGo) =>
    runJourneyGo(g, {
      place: ctx.goPlace,
      app: ctx.open,
      tab: (tab) => {
        nav?.go({ kind: 'tab', tab });
        ctx.close();
      },
      beforeSky: ctx.close,
    });
  return (
    <div className="phone-stack">
      <RecapButton onOpen={ctx.close} />
      <JourneyPanel onGo={go} />
    </div>
  );
}
