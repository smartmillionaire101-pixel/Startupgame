/**
 * Messages: chats with players and AI characters (Wave 5 §C).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, type AiThread, type ChatMessage, type ChatSummary } from '../../api';
import { getLang, t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button, Empty, EmptyState } from '../../ui';
import { visitPlace } from '../../city/goto';
import { businessesOf } from '../../city/contract';
import { cityViewOf, hereOf } from '../../city/travel';
import { Avatar, isObj, kindName, str, type PhoneCtx, type ThreadRef, type View } from '../shared';
import { ChatActions, EmojiPicker, PlayerMessage, VoiceRecorder, type ActBody } from './ChatExtras';

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
    // Ties (never-messaged threads) keep a fixed order, so the list doesn't
    // shuffle when a poll brings the same threads back in another order.
  ].sort((a, b) => b.lastAt - a.lastAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return (
    <>
      <Button onClick={onNew}>{t('New message')}</Button>
      {convos.length === 0 ? (
        <EmptyState icon="people">
          {t('No conversations yet. Say hello to someone in town.')}
        </EmptyState>
      ) : (
        <ul className="phone-list" aria-label={t('Conversations')}>
          {convos.map((c) => (
            <li key={c.key}>
              <button className="phone-row" onClick={() => onOpen(c.ref)}>
                <Avatar name={c.name} ai={c.ai} id={'player' in c.ref ? c.ref.player : c.ref.ai} />
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
                  <Avatar name={p.name} id={p.id} />
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
                    <Avatar name={p.name} ai id={p.id} />
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

/** How close to the bottom (px) still counts as "reading the newest message". */
const STICK_PX = 48;

/**
 * Keeps a chat log on its newest message, the way a messaging app does: a new
 * message, a card that grows, or the log shrinking when the on-screen keyboard
 * opens keep you at the bottom, unless you've scrolled up to read, in which
 * case nothing moves under you. It scrolls the log itself: the old
 * `scrollIntoView` also scrolled every box around it (the phone, the page
 * behind it on iOS) and put the newest message under the sticky message box.
 * Gives the refs for the log (the scroller) and its items (what grows), and
 * `pin()`, to jump to the bottom after you send something.
 */
export function useStickToBottom(dep: unknown) {
  const log = useRef<HTMLDivElement>(null);
  const items = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const toEnd = useCallback(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    const onScroll = () => {
      stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    // The log resizing (the keyboard) or its content growing (a card's buttons,
    // a voice note) without a new message: stay at the bottom if you were there.
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (stuck.current) toEnd();
          });
    ro?.observe(el);
    if (items.current) ro?.observe(items.current);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [toEnd]);
  // Before paint, so a new message never shows a frame in the wrong place.
  useLayoutEffect(() => {
    if (stuck.current) toEnd();
  }, [dep, toEnd]);
  const pin = useCallback(() => {
    stuck.current = true;
    toEnd();
  }, [toEnd]);
  return { log, items, pin };
}

function ChatLog({ messages, typing }: { messages: ChatMessage[]; typing?: boolean }) {
  const { log, items } = useStickToBottom(`${messages.length}:${typing ? 1 : 0}`);
  return (
    <div className="phone-log" aria-live="polite" ref={log}>
      <div className="phone-log-items" ref={items}>
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
      </div>
    </div>
  );
}

/**
 * Tapping Send mustn't take focus from the message box: on a phone that
 * closes the on-screen keyboard, the whole chat jumps down, and the next tap
 * in the box opens it again and jumps it back up. The tap still sends.
 */
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

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
      <button
        className="btn btn-primary"
        type="submit"
        disabled={!value.trim() || disabled}
        onMouseDown={keepFocus}
      >
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
  const { toast, lite } = useView();
  const [thread, setThread] = useState<AiThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [missing, setMissing] = useState(false);
  const said = useRef(false);
  const shown = useRef(messages);
  useEffect(() => {
    shown.current = messages;
  }, [messages]);

  const post = useCallback(
    async (body: string) => {
      const same = (ms: ChatMessage[]) => ms.filter((m) => m.mine && m.id > 0 && m.text === body);
      const before = same(shown.current).length;
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
        // The request can be cut off after your message was kept (a slow
        // connection, the host's time limit): show the thread as it really
        // is. A message that was kept gets its answer (see the poll below).
        const kept = await api.aiThread(id, getLang()).then(
          (r) => {
            setThread(r.thread);
            setMessages(r.messages);
            return same(r.messages).length > before;
          },
          () => false,
        );
        if (!kept) {
          setMessages((m) => m.filter((x) => x !== mine));
          toast(tx((e as Error).message), 'error');
        }
        return kept;
      } finally {
        setTyping(false);
      }
    },
    [id, toast],
  );

  useEffect(() => {
    let live = true;
    api.aiThread(id, getLang()).then(
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

  // Your message without an answer yet (not while it's being sent): look
  // again every few seconds, so the answer shows when it's there.
  const last = messages[messages.length - 1];
  const waiting = !typing && !!last?.mine && last.id > 0;
  useEffect(() => {
    if (!waiting) return;
    let live = true;
    const timer = setInterval(
      () => {
        if (document.visibilityState === 'hidden') return;
        void api.aiThread(id, getLang()).then(
          (r) => {
            if (!live) return;
            setThread(r.thread);
            setMessages(r.messages);
          },
          () => {},
        );
      },
      lite ? 15_000 : 4_000,
    );
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id, waiting, lite]);

  if (missing) return <Empty>{t('This person isn’t around any more.')}</Empty>;
  if (!thread) return <p className="muted small">{t('Loading…')}</p>;
  const quick = QUICK[thread.kind ?? ''] ?? [() => t('Hello!'), () => t('Any advice?')];
  return (
    <div className="phone-thread" data-thread={thread.characterId}>
      <div className="phone-thread-head">
        <Avatar name={thread.name} ai id={thread.characterId} />
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

/** The message box of a player chat: text with emoji, a voice note, Send. */
function PlayerComposer({
  value,
  onChange,
  onSend,
  onVoice,
  plus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onVoice: (audio: Blob, ms: number) => Promise<boolean>;
  /** The "+" (do something together) button, first in the row. */
  plus?: ReactNode;
}) {
  const { meta } = useView();
  const input = useRef<HTMLInputElement>(null);
  const [emoji, setEmoji] = useState(false);
  const max = meta?.chatMaxLength ?? 280;
  const insert = (e: string) => {
    const el = input.current;
    const from = el?.selectionStart ?? value.length;
    const to = el?.selectionEnd ?? from;
    const next = (value.slice(0, from) + e + value.slice(to)).slice(0, max);
    onChange(next);
    const at = Math.min(next.length, from + e.length);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at, at);
    });
  };
  return (
    <div className="chat-composer">
      {emoji && <EmojiPicker onPick={insert} onClose={() => setEmoji(false)} />}
      <form
        className="phone-compose"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) {
            setEmoji(false);
            onSend();
          }
        }}
      >
        {plus}
        <button
          type="button"
          className="chat-icon-btn"
          aria-label={t('Emoji')}
          aria-expanded={emoji}
          title={t('Emoji')}
          onClick={() => setEmoji(!emoji)}
        >
          😊
        </button>
        <input
          ref={input}
          aria-label={t('Message')}
          placeholder={t('Message')}
          value={value}
          maxLength={max}
          onChange={(e) => onChange(e.target.value)}
        />
        <VoiceRecorder onSend={onVoice} />
        <button
          className="btn btn-primary chat-send"
          type="submit"
          aria-label={t('Send')}
          disabled={!value.trim()}
          onMouseDown={keepFocus}
        >
          <span className="chat-send-text">{t('Send')}</span>
          <span className="chat-send-icon" aria-hidden="true">
            ➤
          </span>
        </button>
      </form>
    </div>
  );
}

/** Cards that change someone's money or homes: the receiver's view refreshes when one arrives. */
const MONEY_CARDS = new Set(['payment', 'gift']);

export function PlayerThreadView({
  playerId,
  draft,
  chats,
  markSeen,
  ctx,
}: {
  playerId: string;
  draft?: string;
  chats: ChatSummary[];
  markSeen: (c: { id: string; lastAt: number | null }) => void;
  ctx?: PhoneCtx;
}) {
  const { view, toast, refresh, lite } = useView();
  const known = chats.find((c) => c.with.id === playerId) ?? null;
  const [started, setChatId] = useState<string | null>(null);
  const chatId = started ?? known?.id ?? null;
  const [data, setData] = useState<Awaited<ReturnType<typeof api.messages>> | null>(null);
  const [text, setText] = useState(draft ?? '');
  const [busy, setBusy] = useState(false);
  const other = view.players.find((p) => p.id === playerId);
  const lastSeenId = useRef<number | null>(null);
  /**
   * Messages you sent that the server hasn't shown back yet, drawn straight
   * away. The server's copy takes the place of one in the same render (never
   * both on screen, never neither): a load that has a message of yours with
   * the same text, newer than the last one shown when you sent (`since`), or
   * any load asked for after the send finished (`after`), which must have it.
   */
  const [pending, setPending] = useState<
    { key: number; text: string; since: number; after: number | null }[]
  >([]);
  const pendingKey = useRef(0);
  // Loads asked for, and the newest one shown. The 4 s poll and the reload
  // after you send overlap: an older answer arriving last used to replace the
  // newer one, so the message you'd just sent vanished until the next poll.
  const asked = useRef(0);
  const shown = useRef(0);

  const load = useCallback(() => {
    if (!chatId) return;
    const n = ++asked.current;
    void api.messages(chatId).then(
      (r) => {
        if (n < shown.current) return;
        shown.current = n;
        setData(r);
        setPending((p) => {
          if (!p.length) return p;
          const echoed = r.messages.filter((m) => m.mine);
          return p.filter((x) => {
            if (x.after !== null && x.after < n) return false;
            const i = echoed.findIndex((m) => m.id > x.since && m.text === x.text);
            if (i < 0) return true;
            echoed.splice(i, 1);
            return false;
          });
        });
        const last = r.messages[r.messages.length - 1];
        markSeen({ id: chatId, lastAt: last?.at ?? null });
        // Money (or a home) just arrived from them: show it in your balance now.
        const before = lastSeenId.current;
        lastSeenId.current = last?.id ?? 0;
        if (
          before !== null &&
          r.messages.some((m) => m.id > before && !m.mine && m.card && MONEY_CARDS.has(m.card.type))
        )
          void refresh();
      },
      (e: Error) => toast(tx(e.message), 'error'),
    );
  }, [chatId, markSeen, toast, refresh]);

  // No chat with them in the list you have (it's refreshed every so often):
  // they may have just written to you. Look it up now, and while you're here.
  useEffect(() => {
    if (chatId) return;
    let live = true;
    const find = () =>
      void api.chats().then(
        (r) => {
          const c = r.chats.find((x) => x.with.id === playerId);
          if (live && c) setChatId((cur) => cur ?? c.id);
        },
        () => {},
      );
    find();
    const timer = setInterval(
      () => {
        if (document.visibilityState !== 'hidden') find();
      },
      lite ? 15_000 : 4_000,
    );
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [chatId, playerId, lite]);

  useEffect(() => {
    if (!chatId) return;
    load();
    // A chat on screen polls quickly, so payments and answers show up promptly.
    const timer = setInterval(
      () => {
        if (document.visibilityState !== 'hidden') load();
      },
      lite ? 15_000 : 4_000,
    );
    return () => clearInterval(timer);
  }, [chatId, load, lite]);

  const name = data?.chat.with.name ?? known?.with.name ?? other?.name ?? t('Chat');
  const partner = { id: playerId, name };
  const blocked = !!data?.chat.blocked;

  const sendMsg = async () => {
    const body = text;
    const key = --pendingKey.current;
    setText('');
    setPending((p) => [...p, { key, text: body, since: lastSeenId.current ?? 0, after: null }]);
    pin();
    const sent = () =>
      setPending((p) => p.map((x) => (x.key === key ? { ...x, after: asked.current } : x)));
    try {
      if (!chatId) {
        // The first message you type starts the chat.
        const r = await api.startChat(playerId, body);
        if (r.flagged) toast(t('Careful: that looks like a common scam pattern.'), 'info');
        sent();
        setChatId(r.chat.id);
        return;
      }
      const r = await api.send(chatId, body);
      if (r.flagged) toast(t('Careful: that looks like a common scam pattern.'), 'info');
      sent();
      load();
    } catch (e) {
      setPending((p) => p.filter((x) => x.key !== key));
      setText(body);
      toast(tx((e as Error).message), 'error');
    }
  };

  const sendVoice = async (audio: Blob, ms: number) => {
    try {
      const r = await api.sendVoice(playerId, audio, ms);
      if (!chatId) setChatId(r.chat.id);
      else load();
      return true;
    } catch (e) {
      toast(tx((e as Error).message), 'error');
      return false;
    }
  };

  const act = async <R,>(body: ActBody, ok?: string): Promise<R | null> => {
    setBusy(true);
    try {
      const r = await api.act<R>(playerId, body);
      const msg = (r.result as { message?: string } | null)?.message;
      toast(ok ?? (msg ? tx(msg) : t('Done.')), 'ok');
      if (!chatId) setChatId(r.chat.id);
      else load();
      await refresh();
      return (r.result ?? ({} as R)) as R;
    } catch (e) {
      toast(tx((e as Error).message), 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const messages = data?.messages ?? [];
  const { log, items, pin } = useStickToBottom(`${messages.length}:${pending.length}`);
  return (
    <div className="phone-thread" data-player-thread={playerId}>
      <div className="phone-thread-head">
        <Avatar name={name} id={playerId} />
        <div className="phone-row-main">
          <div className="item-title">{name}</div>
          {other && <div className="small muted">{kindName(other.role)}</div>}
        </div>
      </div>
      {/* The log is the only thing that scrolls: the head stays on top and the
          message box at the bottom, and the newest message is never under it. */}
      <div className="phone-log" aria-live="polite" ref={log}>
        <div className="phone-log-items" ref={items}>
          {/* The rules and Block / Report open the chat, above its first message,
              rather than under the message box, where they pushed it up and down. */}
          {!blocked && (
            <div className="chat-intro">
              <p className="small muted">
                {t('No links, numbers, emails or handles. Commitments happen on deal cards.')}
              </p>
              {chatId && (
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
              )}
            </div>
          )}
          {chatId && messages.length === 0 && !data && pending.length === 0 && (
            <p className="small muted">{t('Loading…')}</p>
          )}
          {!chatId && pending.length === 0 && (
            <p className="small muted chat-empty">{t('No messages yet. Say hello 👋')}</p>
          )}
          {chatId &&
            messages.map((m) => (
              <PlayerMessage
                key={m.id}
                m={m}
                chatId={chatId}
                partner={partner}
                ctx={ctx}
                onChanged={load}
              />
            ))}
          {pending.map((p) => (
            <div key={p.key} className="bubble mine chat-pending" data-pending aria-busy="true">
              {p.text}
            </div>
          ))}
        </div>
      </div>
      {blocked ? (
        <p className="small muted">{t('This chat is blocked.')}</p>
      ) : (
        <ChatActions partner={partner} act={act} busy={busy} goPlace={ctx?.goPlace}>
          {(plus) => (
            <PlayerComposer
              value={text}
              onChange={setText}
              onSend={() => void sendMsg()}
              onVoice={sendVoice}
              plus={other?.ai ? undefined : plus}
            />
          )}
        </ChatActions>
      )}
    </div>
  );
}
