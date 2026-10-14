/** The phone's Sales app: your company's deal pipeline, stacked for a small screen. */
import { SalesPipeline } from '../../screens/Sales';
import { t } from '../../i18n';
import { useView } from '../../store';
import { Nothing } from '../shared';

export function SalesApp() {
  const { view } = useView();
  const c = view.companies.find((x) => x.status === 'active');
  if (!c) return <Nothing icon="shop">{t('You don’t run a company right now.')}</Nothing>;
  return (
    <div className="phone-stack">
      <SalesPipeline c={c} compact />
    </div>
  );
}
