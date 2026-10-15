/** The phone's Capital app: exits, the stock market, your wealth and the allocator paths. */
import { CapitalHub } from '../../screens/Capital';
import type { PhoneCtx } from '../shared';

export function CapitalApp({ ctx }: { ctx: PhoneCtx }) {
  return (
    <div className="phone-stack">
      <CapitalHub open={(app) => ctx.open(app)} />
    </div>
  );
}
