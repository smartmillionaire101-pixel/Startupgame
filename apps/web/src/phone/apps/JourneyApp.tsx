/** The phone's Journey app: the founder journey's objectives and chapters. */
import { JourneyPanel } from '../../city/JourneyPanel';
import { openCompanyTab } from '../../screens/Company';
import type { JourneyGo } from '../../city/journey';
import { openSky } from '../../experiences/sky-bus';
import { useNav, type PhoneApp } from '../bus';
import type { PhoneCtx } from '../shared';

export function JourneyApp({ ctx }: { ctx: PhoneCtx }) {
  const nav = useNav();
  const go = (g: JourneyGo) => {
    if (g.kind === 'place') ctx.goPlace(g.place);
    else if (g.kind === 'app') ctx.open(g.app as PhoneApp);
    else if (g.kind === 'tab') {
      if (g.section) openCompanyTab(g.section);
      nav?.go({ kind: 'tab', tab: g.tab });
      ctx.close();
    } else {
      ctx.close();
      openSky(g.id);
    }
  };
  return (
    <div className="phone-stack">
      <JourneyPanel onGo={go} />
    </div>
  );
}
