import { useCallback, useEffect, useState } from 'react';
import { api, type ChatSummary } from '../api';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Empty, Sheet } from '../ui';

const roleLabel = (r: string) =>
  ({ founder: t('founder'), investor: t('investor'), banker: t('banker') })[r] ?? r;

/** Private, text-only chat (§15). Nothing in a chat is binding; deal cards are. */
export function Chats() {
  const { view, toast } = useView();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [startWith, setStartWith] = useState<string | null>(null);
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
              <Button variant="subtle" onClick={() => setOpenId(c.id)}>
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
                <Button variant="ghost" onClick={() => setStartWith(p.id)}>
                  {t('Say hi')}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {openId && (
        <ChatSheet
          chatId={openId}
          onClose={() => {
            setOpenId(null);
            load();
          }}
        />
      )}
      {startWith && (
        <StarterSheet
          playerId={startWith}
          onDone={(id) => {
            setStartWith(null);
            load();
            if (id) setOpenId(id);
          }}
        />
      )}
    </Card>
  );
}

export function StarterSheet({
  playerId,
  onDone,
}: {
  playerId: string;
  onDone: (chatId?: string) => void;
}) {
  const { toast } = useView();
  const [starters, setStarters] = useState<string[]>([]);
  useEffect(
    () =>
      void api
        .starters(playerId)
        .then((r) => setStarters(r.starters))
        .catch(() => setStarters([])),
    [playerId],
  );
  return (
    <Sheet title={t('Start with one tap')} onClose={() => onDone()}>
      <div className="choice-grid">
        {starters.map((s) => (
          <button
            key={s}
            className="choice"
            onClick={() =>
              void api
                .startChat(playerId, s)
                .then((r) => onDone(r.chat.id))
                .catch((e: Error) => toast(tx(e.message), 'error'))
            }
          >
            “{tx(s)}”
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function ChatSheet({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { toast, meta } = useView();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.messages>> | null>(null);
  const [text, setText] = useState('');
  const load = useCallback(
    () =>
      void api
        .messages(chatId)
        .then(setData)
        .catch((e: Error) => toast(tx(e.message), 'error')),
    [chatId, toast],
  );
  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [load]);
  const sendMsg = async () => {
    try {
      const r = await api.send(chatId, text);
      if (r.flagged) toast(t('Careful: that looks like a common scam pattern.'), 'info');
      setText('');
      load();
    } catch (e) {
      toast(tx((e as Error).message), 'error');
    }
  };
  return (
    <Sheet title={data?.chat.with.name ?? t('Chat')} onClose={onClose}>
      <div className="chat-log">
        {data?.messages.map((m) => (
          <div key={m.id} className={`bubble${m.mine ? ' mine' : ''}`}>
            {m.text}
          </div>
        ))}
      </div>
      {data?.chat.blocked ? (
        <p className="small muted">{t('This chat is blocked.')}</p>
      ) : (
        <>
          <div className="row" style={{ marginTop: '0.5rem' }}>
            <input
              aria-label={t('Message')}
              value={text}
              maxLength={meta?.chatMaxLength ?? 280}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && text.trim() && void sendMsg()}
              style={{ flex: 1 }}
            />
            <Button disabled={!text.trim()} onClick={() => void sendMsg()}>
              {t('Send')}
            </Button>
          </div>
          <p className="small muted">
            {t('No links, numbers, emails or handles. Commitments happen on deal cards.')}
          </p>
          <div className="row">
            <Button variant="ghost" onClick={() => void api.block(chatId).then(load)}>
              {t('Block')}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void api.report(chatId, 'scam').then(() => {
                  toast(t('Reported. A moderator will review.'), 'ok');
                  load();
                })
              }
            >
              {t('Report')}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
