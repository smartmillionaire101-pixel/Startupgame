import { useCallback, useEffect, useState } from 'react';
import { api, type ChatSummary } from '../api';
import { useView } from '../store';
import { Button, Card, Empty, Sheet } from '../ui';

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
        .catch((e: Error) => toast(e.message, 'error')),
    [toast],
  );
  useEffect(load, [load]);
  const others = view.players.filter((p) => !chats.some((c) => c.with.id === p.id));
  return (
    <Card title="Chats">
      {chats.length === 0 ? (
        <Empty>No conversations yet.</Empty>
      ) : (
        <ul className="list">
          {chats.map((c) => (
            <li key={c.id} className="spread">
              <div>
                <div className="item-title">{c.with.name}</div>
                <div className="small muted">{c.blocked ? 'Blocked' : c.lastText}</div>
              </div>
              <Button variant="subtle" onClick={() => setOpenId(c.id)}>
                Open
              </Button>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <details style={{ marginTop: '0.5rem' }}>
          <summary className="small">Start a conversation</summary>
          <ul className="list">
            {others.map((p) => (
              <li key={p.id} className="spread">
                <span>
                  {p.name} <span className="small muted">({p.role})</span>
                </span>
                <Button variant="ghost" onClick={() => setStartWith(p.id)}>
                  Say hi
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

function StarterSheet({
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
    <Sheet title="Start with one tap" onClose={() => onDone()}>
      <div className="choice-grid">
        {starters.map((s) => (
          <button
            key={s}
            className="choice"
            onClick={() =>
              void api
                .startChat(playerId, s)
                .then((r) => onDone(r.chat.id))
                .catch((e: Error) => toast(e.message, 'error'))
            }
          >
            “{s}”
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function ChatSheet({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { toast, meta } = useView();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.messages>> | null>(null);
  const [text, setText] = useState('');
  const load = useCallback(
    () =>
      void api
        .messages(chatId)
        .then(setData)
        .catch((e: Error) => toast(e.message, 'error')),
    [chatId, toast],
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);
  const sendMsg = async () => {
    try {
      const r = await api.send(chatId, text);
      if (r.flagged) toast('Careful: that looks like a common scam pattern.', 'info');
      setText('');
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <Sheet title={data?.chat.with.name ?? 'Chat'} onClose={onClose}>
      <div className="chat-log">
        {data?.messages.map((m) => (
          <div key={m.id} className={`bubble${m.mine ? ' mine' : ''}`}>
            {m.text}
          </div>
        ))}
      </div>
      {data?.chat.blocked ? (
        <p className="small muted">This chat is blocked.</p>
      ) : (
        <>
          <div className="row" style={{ marginTop: '0.5rem' }}>
            <input
              aria-label="Message"
              value={text}
              maxLength={meta?.chatMaxLength ?? 280}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && text.trim() && void sendMsg()}
              style={{ flex: 1 }}
            />
            <Button disabled={!text.trim()} onClick={() => void sendMsg()}>
              Send
            </Button>
          </div>
          <p className="small muted">
            No links, numbers, emails or handles. Commitments happen on deal cards.
          </p>
          <div className="row">
            <Button variant="ghost" onClick={() => void api.block(chatId).then(load)}>
              Block
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void api.report(chatId, 'scam').then(() => {
                  toast('Reported. A moderator will review.', 'ok');
                  load();
                })
              }
            >
              Report
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
