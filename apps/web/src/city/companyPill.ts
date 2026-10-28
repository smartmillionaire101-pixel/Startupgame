/** The HUD's company pill: how long the money lasts, under the company's cash. */
import type { PlayerView } from '@runway/engine';
import { runway } from '../format';
import { t } from '../i18n';
import { rescueOf } from './contract';

type CompanyV = PlayerView['companies'][number];

/** Still being set up (registered, funded, an office): the founder setup's tracker is open. */
export const settingUp = (c: CompanyV | null | undefined): boolean =>
  !!c?.setup && c.setup.step !== 'done';

/**
 * The pill's second line: "Setting up" until the company opens (play-test:
 * "₦0 · Profitable" right after reserving the name), the months a rescue
 * leaves, "Pre-revenue" with no costs or sales yet, else the runway.
 */
export function companyPillLine(c: CompanyV): string {
  if (settingUp(c)) return t('Setting up');
  const rescue = rescueOf(c);
  if (rescue) return t('{n} mo left', { n: rescue.monthsLeft ?? '?' });
  if (c.monthlyRevenue <= 0 && c.runwayMonths === null) return t('Pre-revenue');
  return runway(c.runwayMonths);
}
