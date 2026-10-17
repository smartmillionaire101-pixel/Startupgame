/**
 * Simple mode's way to a screen without a tab (Phase 2): four tabs leave out
 * Money (founders) and Deal offers (investors), so the "My …" screen starts
 * with one big link there. Nothing in normal mode, where they have tabs.
 */
import { t } from '../i18n';
import { useNav } from '../phone/bus';
import type { TabId } from '../phone/navigate';
import { useSimple } from '../phone/settings';
import { Icon } from '../ui';

export function SimpleLink({
  to,
  emoji,
  label,
  hint,
  badge = 0,
}: {
  to: TabId;
  emoji: string;
  label: string;
  hint: string;
  /** Things waiting for you there (your turn on a deal). */
  badge?: number;
}) {
  const simple = useSimple();
  const nav = useNav();
  if (!simple) return null;
  return (
    <button
      type="button"
      className="card link-card simple-link"
      data-simple-link={to}
      onClick={() => {
        nav?.go({ kind: 'tab', tab: to });
      }}
    >
      <span className="simple-link-emoji" aria-hidden="true">
        {emoji}
      </span>
      <span className="link-card-main">
        <b>{label}</b>
        <span className="small muted">{hint}</span>
      </span>
      {badge > 0 && (
        <span className="badge-inline" aria-label={t('{n} waiting for you', { n: badge })}>
          {badge}
        </span>
      )}
      <Icon name="chevron" className="link-card-go" />
    </button>
  );
}
