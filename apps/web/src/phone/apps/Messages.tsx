/**
 * Messages: chats with players and AI characters (Wave 5 §C).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type AiThread, type ChatMessage, type ChatSummary } from '../../api';
import { getLang, t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button, Empty } from '../../ui';
import { visitPlace } from '../../city/goto';
import { businessesOf } from '../../city/contract';
import { cityViewOf, hereOf } from '../../city/travel';
import { Avatar, isObj, kindName, str, type ThreadRef, type View } from '../shared';
import { FriendActions } from './Friends';

// ---------------------------------------------------------------------------
// People you can message

/** Wave 5 capital places in the city you're in, if the engine sends them. */
export function capitalOf(view: View) {
  const city = hereOf(view) as unknown as Record<string, unknown>;
  const out: { id: string; place: string; name: string; manager: string; kind: string }[] = [];
  const add = (key: string, prefix: string, kind: string) => {
    const xs = city[key];
    if (!Array.isArray(xs)) return;
    for (const x of xs)
      if (isObj(x) && typeof x.id === 'string') {
        const name = str(x.name, str(x.label, '—'));
        const m = isObj(x.manager) ? str(x.manager.name) : str(x.manager);
        out.push({
          id: `${prefix}:${x.id}`,
          place: `${prefix}:${x.id}`,
          name,
          manager: str(x.managerName, m) || name,
          kind,
        });
      }
  };
  add('accelerators', 'acc', 'accelerator');
  add('devPartners', 'dp', 'devpartner');
  add('lps', 'lp', 'lp');
  return out;
}

export interface AiContact {
  id: string;
  kind: string;
  name: string;
  org: string | null;
}

/** AI characters in the city you're in, for "New message". */
export function aiPeopleOf(view: View): AiContact[] {
  const city = hereOf(view);
  const out: AiContact[] = [];
  for (const f of city.funds) {
    if (!f.ai || f.market !== city.id) continue;
    const a = (f as typeof f & { angel?: { playerId: string; name: string } | null }).angel;
    out.push(
      a
        ? { id: a.playerId, kind: 'angel', name: a.name, org: f.name }
        : { id: `fund:${f.id}`, kind: 'partner', name: f.partner, org: f.name },
    );
  }
  for (const x of capitalOf(view))
    out.push({ id: x.id, kind: x.kind, name: x.manager, org: x.name });
  for (const c of view.directory) {
    if (!c.ai || c.status !== 'active' || c.market !== city.id) continue;
    const f = c.founders.find((x) => x.ai);
    if (f) out.push({ id: f.id, kind: 'founder', name: f.name, org: c.name });
  }
  for (const b of businessesOf(cityViewOf(view)))
    if (b.open) out.push({ id: `biz:${b.id}`, kind: 'owner', name: b.owner.name, org: b.name });
  return out;
}

// ---------------------------------------------------------------------------
// Unread player chats

export const chatUnread = (c: ChatSummary, seen: Record<string, number>) =>
  !c.lastMine && c.lastAt !== null && c.lastAt > (seen[c.id] ?? 0) ? 1 : 0;

interface Convo {
  key: string;
  ref: ThreadRef;
  name: string;
  sub: string;
  lastText: string | null;
  lastAt: number;
  unread: number;
  ai: boolean;
}

export function MessagesList({
  chats,
  ai,
  seen,
  onOpen,
  onNew,
}: {
  chats: ChatSummary[];
  ai: AiThread[];
  seen: Record<string, number>;
  onOpen: (r: ThreadRef) => void;
  onNew: () => void;
}) {
  const convos: Convo[] = [
    ...chats.map((c) => ({
      key: `chat:${c.id}`,
      ref: { player: c.with.id },
      name: c.with.name,
      sub: kindName(c.with.role),
      lastText: c.blocked ? t('Blocked') : c.lastText,
      lastAt: c.lastAt ?? 0,
      unread: chatUnread(c, seen),
      ai: false,
    })),
    ...ai.map((x) => ({
      key: `ai:${x.characterId}`,
      ref: { ai: x.characterId },
      name: x.name,
      sub: x.org
        ? t('{role} · {company}', { role: kindName(x.kind), company: x.org })
        : kindName(x.kind),
      lastText: x.lastText,
      lastAt: x.lastAt ?? 0,
      unread: x.unread,
      ai: true,
    })),
  ].sort((a, b) => b.lastAt - a.lastAt);
  return (
    <>
      <Button onClick={onNew}>{t('New message')}</Button>
      {convos.length === 0 ? (
        <Empty>{t('No conversations yet. Say hello to someone in town.')}</Empty>
      ) : (
        <ul className="phone-list" aria-label={t('Conversations')}>
          {convos.map((c) => (
            <li key={c.key}>
              <button className="phone-row" onClick={() => onOpen(c.ref)}>
                <Avatar name={c.name} ai={c.ai} />
                <span className="phone-row-main">
                  <span className="item-title">{c.name}</span>
                  <span className="small muted">{c.sub}</span>
                  {c.lastText && <span className="small phone-row-last">{tx(c.lastText)}</span>}
                </span>
                {c.unread > 0 && (
                  <span className="phone-unread" aria-label={t('{n} unread', { n: c.unread })}>
                    {c.unread}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function NewMessage({ onPick }: { onPick: (r: ThreadRef) => void }) {
  const { view } = useView();
  const [q, setQ] = useState('');
  const people = useMemo(() => aiPeopleOf(view), [view]);
  const players = view.players.filter((p) => !p.ai);
  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
  const groups: { title: string; kinds: string[] }[] = [
    { title: t('Investors'), kinds: ['partner', 'angel', 'lp'] },
    { title: t('Programmes'), kinds: ['accelerator', 'devpartner'] },
    { title: t('Founders'), kinds: ['founder'] },
    { title: t('Businesses'), kinds: ['owner'] },
  ];
  const shownPlayers = players.filter((p) => match(p.name));
  return (
    <>
      <input
        className="phone-search"
        type="search"
        aria-label={t('Search people')}
        placeholder={t('Search people')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {shownPlayers.length > 0 && (
        <section>
          <h3 className="phone-h">{t('Players')}</h3>
          <ul className="phone-list">
            {shownPlayers.map((p) => (
              <li key={p.id}>
                <button className="phone-row" onClick={() => onPick({ player: p.id })}>
                  <Avatar name={p.name} />
                  <span className="phone-row-main">
                    <span className="item-title">{p.name}</span>
                    <span className="small muted">{kindName(p.role)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {groups.map((g) => {
        const xs = people.filter(
          (p) => g.kinds.includes(p.kind) && (match(p.name) || match(p.org ?? '')),
        );
        if (!xs.length) return null;
        return (
          <section key={g.title}>
            <h3 className="phone-h">{g.title}</h3>
            <ul className="phone-list" data-group={g.kinds[0]}>
              {xs.map((p) => (
                <li key={p.id}>
                  <button
                    className="phone-row"
                    data-character={p.id}
                    onClick={() => onPick({ ai: p.id })}
                  >
                    <Avatar name={p.name} ai />
                    <span className="phone-row-main">
                      <span className="item-title">{p.name}</span>
                      <span className="small muted">
                        {p.org
                          ? t('{role} · {company}', { role: kindName(p.kind), company: p.org })
                          : kindName(p.kind)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

const QUICK: Record<string, (() => string)[]> = {
  partner: [() => t('What do you invest in?'), () => t('Any advice?'), () => t('Can we meet?')],
  angel: [() => t('What do you invest in?'), () => t('Can we meet?'), () => t('Any advice?')],
  lp: [() => t('What do you invest in?'), () => t('Can we meet?')],
  accelerator: [() => t('What do you invest in?'), () => t('Any advice?')],
  devpartner: [() => t('What do you invest in?'), () => t('Any advice?')],
  founder: [() => t('How’s business?'), () => t('Are you hiring?'), () => t('Any advice?')],
  owner: [() => t('What do you need to buy?'), () => t('Any work going?'), () => t('Can we meet?')],
};

function ChatLog({ messages, typing }: { messages: ChatMessage[]; typing?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, typing]);
  return (
    <div className="phone-log" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={`bubble${m.mine ? ' mine' : ''}`}>
          {m.text}
        </div>
      ))}
      {typing && (
        <div className="bubble phone-typing" aria-label={t('Typing…')}>
          <span />
          <span />
          <span />
        </div>
      )}
      <div ref={end} />
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
}) {
  const { meta } = useView();
  return (
    <form
      className="phone-compose"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && !disabled) onSend();
      }}
    >
      <input
        aria-label={t('Message')}
        placeholder={t('Message')}
        value={value}
        maxLength={meta?.chatMaxLength ?? 280}
        onChange={(e) => onChange(e.target.value)}
      />
      <button className="btn btn-primary" type="submit" disabled={!value.trim() || disabled}>
        {t('Send')}
      </button>
    </form>
  );
}

export function AiThreadView({
  id,
  say,
  onClose,
}: {
  id: string;
  say?: string;
  onClose: () => void;
}) {
  const { toast } = useView();
  const [thread, setThread] = useState<AiThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [missing, setMissing] = useState(false);
  const said = useRef(false);

  const post = useCallback(
    async (body: string) => {
      const mine: ChatMessage = { id: -Date.now(), mine: true, text: body, at: Date.now() };
      setMessages((m) => [...m, mine]);
      setTyping(true);
      try {
        const r = await api.aiSend(id, body, getLang());
        if (r.flagged) toast(t('Careful: that looks like a common scam pattern.'), 'info');
        setThread(r.thread);
        setMessages((m) => [...m, r.reply]);
        return true;
      } catch (e) {
        setMessages((m) => m.filter((x) => x !== mine));
        toast(tx((e as Error).message), 'error');
        return false;
      } finally {
        setTyping(false);
      }
    },
    [id, toast],
  );

  useEffect(() => {
    let live = true;
    api.aiThread(id).then(
      (r) => {
        if (!live) return;
        setThread(r.thread);
        setMessages(r.messages);
        if (say && !said.current) {
          said.current = true;
          void post(say);
        }
      },
      () => live && setMissing(true),
    );
    return () => {
      live = false;
    };
  }, [id, say, post]);

  if (missing) return <Empty>{t('This person isn’t around any more.')}</Empty>;
  if (!thread) return <p className="muted small">{t('Loading…')}</p>;
  const quick = QUICK[thread.kind ?? ''] ?? [() => t('Hello!'), () => t('Any advice?')];
  return (
    <div className="phone-thread" data-thread={thread.characterId}>
      <div className="phone-thread-head">
        <Avatar name={thread.name} ai />
        <div className="phone-row-main">
          <div className="item-title">{thread.name}</div>
          <div className="small muted">
            {thread.org
              ? t('{role} · {company}', { role: kindName(thread.kind), company: thread.org })
              : kindName(thread.kind)}
          </div>
        </div>
        {thread.place && (
          <Button
            variant="subtle"
            onClick={() => {
              visitPlace(thread.place!);
              onClose();
            }}
          >
            {t('Go there')}
          </Button>
        )}
      </div>
      {messages.length === 0 && !typing && (
        <p className="small muted">
          {t('Say hello. They answer from what’s really going on in town.')}
        </p>
      )}
      <ChatLog messages={messages} typing={typing} />
      {thread.available && (
        <>
          <div className="chips phone-quick">
            {[() => t('Hello!'), ...quick]
              .slice(messages.length ? 1 : 0, messages.length ? 4 : 3)
              .map((q) => (
                <button key={q()} className="chip" disabled={typing} onClick={() => void post(q())}>
                  {q()}
                </button>
              ))}
          </div>
          <Composer
            value={text}
            onChange={setText}
            disabled={typing}
            onSend={() => {
              const body = text;
              setText('');
              void post(body).then((ok) => !ok && setText(body));
            }}
          />
        </>
      )}
    </div>
  );
}

export function PlayerThreadView({
  playerId,
  draft,
  chats,
  markSeen,
}: {
  playerId: string;
  draft?: string;
  chats: ChatSummary[];
  markSeen: (c: { id: string; lastAt: number | null }) => void;
}) {
  const { view, toast } = useView();
  const known = chats.find((c) => c.with.id === playerId) ?? null;
  const [started, setChatId] = useState<string | null>(null);
  const chatId = started ?? known?.id ?? null;
  const [data, setData] = useState<Awaited<ReturnType<typeof api.messages>> | null>(null);
  const [starters, setStarters] = useState<string[] | null>(null);
  const [text, setText] = useState(draft ?? '');
  const other = view.players.find((p) => p.id === playerId);

  const load = useCallback(() => {
    if (!chatId) return;
    void api.messages(chatId).then(
      (r) => {
        setData(r);
        const last = r.messages[r.messages.length - 1];
        markSeen({ id: chatId, lastAt: last?.at ?? null });
      },
      (e: Error) => toast(tx(e.message), 'error'),
    );
  }, [chatId, markSeen, toast]);

  useEffect(() => {
    if (!chatId) return;
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [chatId, load]);

  useEffect(() => {
    if (chatId || known) return;
    void api.starters(playerId).then(
      (r) => setStarters(r.starters),
      () => setStarters([]),
    );
  }, [chatId, known, playerId]);

  const name = data?.chat.with.name ?? known?.with.name ?? other?.name ?? t('Chat');

  if (!chatId)
    return (
      <div className="phone-thread">
        <div className="phone-thread-head">
          <Avatar name={name} />
          <div className="item-title">{name}</div>
        </div>
        {/* Wave 8: Send money, Invite over, Plan a hangout. */}
        {!other?.ai && <FriendActions playerId={playerId} />}
        <p className="small muted">{t('Start with one tap')}</p>
        <div className="choice-grid">
          {(starters ?? []).map((s) => (
            <button
              key={s}
              className="choice"
              onClick={() =>
                void api.startChat(playerId, s).then(
                  (r) => setChatId(r.chat.id),
                  (e: Error) => toast(tx(e.message), 'error'),
                )
              }
            >
              “{tx(s)}”
            </button>
          ))}
        </div>
      </div>
    );

  const sendMsg = async () => {
    const body = text;
    setText('');
    try {
      const r = await api.send(chatId, body);
      if (r.flagged) toast(t('Careful: that looks like a common scam pattern.'), 'info');
      load();
    } catch (e) {
      setText(body);
      toast(tx((e as Error).message), 'error');
    }
  };

  return (
    <div className="phone-thread">
      <div className="phone-thread-head">
        <Avatar name={name} />
        <div className="phone-row-main">
          <div className="item-title">{name}</div>
          {other && <div className="small muted">{kindName(other.role)}</div>}
        </div>
      </div>
      {!other?.ai && <FriendActions playerId={playerId} />}
      <ChatLog messages={data?.messages ?? []} />
      {data?.chat.blocked ? (
        <p className="small muted">{t('This chat is blocked.')}</p>
      ) : (
        <>
          <Composer value={text} onChange={setText} onSend={() => void sendMsg()} />
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
    </div>
  );
}
