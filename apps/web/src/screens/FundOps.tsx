/**
 * Running a fund after its first close (investor blueprint §8.3, Phase 5):
 * the fund dashboard. Later phases add reserves, the investment committee,
 * marks, LP letters and the fund's life.
 */
import { money } from '../format';
import { t } from '../i18n';
import { useView } from '../store';
import { Stat } from '../ui';
import { lpFundsOf } from './Funds';

export function FundManagement({ fundId }: { fundId: string }) {
  const { view } = useView();
  const f = lpFundsOf(view)?.gp.find((x) => x.id === fundId);
  if (!f) return null;
  return (
    <div className="inv-grid">
      <Stat label={t('Fees paid')} value={money(f.feesPaid, f.currency)} />
      <Stat label={t('Carry paid')} value={money(f.carryPaid, f.currency)} />
    </div>
  );
}
