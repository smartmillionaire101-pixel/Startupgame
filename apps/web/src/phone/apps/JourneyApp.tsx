/** The phone's Journey app: the journey's objectives and chapters (founders' or investors'). */
import { JourneyPanel } from '../../city/JourneyPanel';
import type { JourneyGo } from '../../city/journey';
import { runJourneyGo } from '../../city/journeyGo';
import { useNav } from '../bus';
import type { PhoneCtx } from '../shared';
import { RecapButton } from '../../recap/Recap';
import { useView } from '../../store';
import { journeyOf } from '../../city/journey';
import { CareerLadder, InvestorPrompts, careerOf } from '../../screens/InvestorCareer';

export function JourneyApp({ ctx }: { ctx: PhoneCtx }) {
  const nav = useNav();
  const { view } = useView();
  // A server without the investor journey: the career ladder alone.
  if (careerOf(view) && !journeyOf(view))
    return (
      <div className="phone-stack">
        <InvestorPrompts />
        <CareerLadder />
      </div>
    );
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
      {/* Investors: the ladder behind the later chapters. */}
      {journeyOf(view)?.kind === 'investor' && careerOf(view) && <CareerLadder compact />}
    </div>
  );
}
