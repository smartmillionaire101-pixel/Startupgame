import { useCallback, useEffect, useState } from 'react';
import { api, type ChatSummary } from '../api';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Empty } from '../ui';
import { openPhone } from '../phone/bus';

const roleLabel = (r: string) =>
  ({ founder: t('founder'), investor: t('investor'), banker: t('banker') })[r] ?? r;

/**
 * Private chats (§15). Nothing in a chat is binding; deal cards are. Wave 13:
 * conversations open in the phone's Messages (emoji, voice notes, cards).
 */
export function Chats() {
  const { view, toast } = useView();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const load = useCallback(
    () =>
      void api
        .chats()
        .then((r) => setChats(r.chats))
        .catch((e: Error) => toast(tx(e.message), 'error')),
    [toast],
  );
  useEffect(load, [load]);
  // AI angels are in view.players too (Wave 3) but don't chat.
  const others = view.players.filter((p) => !p.ai && !chats.some((c) => c.with.id === p.id));
  return (
    <Card title={t('Chats')}>
      {chats.length === 0 ? (
        <Empty>{t('No conversations yet.')}</Empty>
      ) : (
        <ul className="list">
          {chats.map((c) => (
            <li key={c.id} className="spread">
              <div>
                <div className="item-title">{c.with.name}</div>
                <div className="small muted">{c.blocked ? t('Blocked') : c.lastText}</div>
              </div>
              <Button variant="subtle" onClick={() => openPhone({ player: c.with.id })}>
                {t('Open')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <details style={{ marginTop: '0.5rem' }}>
          <summary className="small">{t('Start a conversation')}</summary>
          <ul className="list">
            {others.map((p) => (
              <li key={p.id} className="spread">
                <span>
                  {p.name} <span className="small muted">({roleLabel(p.role)})</span>
                </span>
                <Button variant="ghost" onClick={() => openPhone({ player: p.id })}>
                  {t('Say hi')}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
