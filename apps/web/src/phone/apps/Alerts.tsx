/**
 * Alerts: the inbox, every item tappable (Wave 5 §C). Stories open the
 * phone's News app; everything else goes where it matters.
 */
import type { PlayerView } from '@runway/engine';
import { t, tx } from '../../i18n';
import { gameMonth } from '../../format';
import { useView } from '../../store';
import { Button, Empty } from '../../ui';
import { openPhone, useNav } from '../bus';
import type { IconName } from '../icons';
import { inboxTarget } from '../navigate';
import { RowIcon, type PhoneCtx } from '../shared';

export const KIND_ICON: Record<string, [IconName, string]> = {
  lead: ['contacts', '#2563eb'],
  meeting: ['people', '#7c3aed'],
  reporter: ['news', '#334155'],
  pitch: ['messages', '#0891b2'],
  warning: ['alerts', '#dc2626'],
  deal: ['invest', '#059669'],
  system: ['settings', '#64748b'],
  milestone: ['founder', '#d97706'],
  staff: ['jobs', '#0f766e'],
};

type InboxItem = PlayerView['inbox'][number];

/** Open an inbox item: stories in the phone's News app, the rest where it matters. */
function useOpenItem(ctx: PhoneCtx) {
  const { view, send } = useView();
  const nav = useNav();
  return (i: InboxItem) => {
    const target = inboxTarget(i, view);
    if (!i.read) void send({ type: 'inbox.read', ids: [i.id] });
    if (!target) return;
    // Inside the phone: stories in News, apps, chats and receipts open right here.
    if (target.kind === 'tab' && target.tab === 'news') return ctx.open('news');
    if (target.kind === 'phone') {
      const o = target.open;
      if (o.player || o.ai) return ctx.chat({ player: o.player, ai: o.ai });
      if (o.app && !o.receipt && o.property === undefined) return ctx.open(o.app);
      ctx.close();
      openPhone(o);
      return;
    }
    nav?.go(target);
    ctx.close();
  };
}

export function Alerts({ ctx }: { ctx: PhoneCtx }) {
  const { view, send } = useView();
  const open = useOpenItem(ctx);
  const unread = view.inbox.filter((i) => !i.read).length;
  return (
    <>
      {unread > 0 && (
        <Button variant="ghost" onClick={() => void send({ type: 'inbox.read' })}>
          {t('Mark all read')}
        </Button>
      )}
      {view.inbox.length === 0 ? (
        <Empty>{t('Nothing yet.')}</Empty>
      ) : (
        <ul className="phone-list" aria-label={t('Alerts')}>
          {view.inbox.slice(0, 60).map((i) => {
            const [icon, color] = KIND_ICON[i.kind] ?? ['alerts', '#64748b'];
            const body = (
              <>
                <RowIcon name={icon} color={color} />
                <span className="phone-row-main">
                  <span>{tx(i.text)}</span>
                  <span className="small muted">{gameMonth(i.month)}</span>
                </span>
                {!i.read && <span className="phone-dot" aria-label={t('New')} />}
              </>
            );
            // Only alerts with somewhere to go are buttons.
            const target = inboxTarget(i, view);
            return (
              <li key={i.id}>
                {target ? (
                  <button
                    className={`phone-row phone-alert${i.read ? ' read' : ''}`}
                    data-alert={i.kind}
                    data-target={target.kind}
                    onClick={() => open(i)}
                  >
                    {body}
                    <span className="phone-chev" aria-hidden>
                      ›
                    </span>
                  </button>
                ) : (
                  <div
                    className={`phone-row phone-alert is-static${i.read ? ' read' : ''}`}
                    data-alert={i.kind}
                  >
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
