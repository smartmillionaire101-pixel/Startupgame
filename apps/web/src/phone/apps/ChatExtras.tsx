/**
 * Wave 13: what a chat between two players can do besides text. Emoji (a
 * picker that inserts at the cursor), voice notes (record with the
 * microphone, play back with progress), and cards for things done together
 * from the chat: a payment, a date, an invitation over, a tech event and a
 * home given as a gift. Each card shows its live state and the next step.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { skyViewById, skyViewsIn, type Command } from '@runway/engine';
import type { ChatCard, ChatMessage } from '../../api';
import { money, moneyExact } from '../../format';
import { t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import { openLiving } from '../../experiences/living-bus';
import { openPlay } from '../../experiences/play-bus';
import { showGolfInvite } from '../../city/golf/invite-bus';
import { StakeChips } from '../../city/golf/parts';
import { golfOf } from '../../city/leisure';
import { techEventsOf } from '../friends';
import { openVisit } from '../Visit';
import type { PhoneCtx } from '../shared';
import { SendMoney } from './Friends';
import './chat.css';

// ---------------------------------------------------------------- Emoji

/** Common emoji by category. No keycaps or digits (the chat filters count digits). */
const EMOJI: { id: string; label: () => string; icon: string; list: string[] }[] = [
  {
    id: 'smileys',
    label: () => t('Smileys'),
    icon: '😀',
    list: [
      ...'😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😴 🤤 😷 🤒 🤕 🤢 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬'.split(
        ' ',
      ),
    ],
  },
  {
    id: 'gestures',
    label: () => t('People'),
    icon: '👋',
    list: [
      ...'👋 🤚 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 💪 🫶 👀 🧠 🙋 🙆 🙅 🤷 🤦 💃 🕺 👯 🧑‍💻 👩‍💼 👨‍💼 🧑‍🍳 🧑‍🎤'.split(
        ' ',
      ),
    ],
  },
  {
    id: 'hearts',
    label: () => t('Hearts'),
    icon: '❤️',
    list: [
      ...'❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💯 ✨ 🌟 ⭐ 🔥 💫 💥 🎉 🎊 💐 🌹'.split(
        ' ',
      ),
    ],
  },
  {
    id: 'food',
    label: () => t('Food'),
    icon: '🍕',
    list: [
      ...'☕ 🍵 🧃 🥤 🍺 🍻 🥂 🍷 🍸 🍹 🍕 🍔 🍟 🌭 🌮 🌯 🥙 🍣 🍜 🍲 🍛 🍚 🍗 🍖 🥩 🥗 🥘 🍳 🥞 🧇 🥐 🍞 🥑 🍌 🍍 🥭 🍉 🍓 🍒 🍰 🎂 🧁 🍩 🍪 🍫 🍿'.split(
        ' ',
      ),
    ],
  },
  {
    id: 'fun',
    label: () => t('Activities'),
    icon: '⚽',
    list: [
      ...'⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🎱 ⛳ 🏊 🚴 🏃 🧘 🏋️ 🎮 🎲 🎯 🎳 🎤 🎧 🎸 🎹 🥁 🎬 🎨 🎭 🎟️ 🏆 🥇 🎁 🎈'.split(
        ' ',
      ),
    ],
  },
  {
    id: 'travel',
    label: () => t('Places'),
    icon: '🌍',
    list: [
      ...'🌍 🌎 🌏 🏙️ 🌆 🌇 🌃 🌉 🎡 🚡 🗼 🏠 🏡 🏢 🏦 🏨 🏖️ 🏝️ ⛰️ 🌅 🌄 🚗 🚕 🚌 🚆 ✈️ 🛫 🚀 ⛵ 🛥️ 🌞 🌙 🌧️ ⛈️ 🌈'.split(
        ' ',
      ),
    ],
  },
  {
    id: 'objects',
    label: () => t('Work & money'),
    icon: '💼',
    list: [
      ...'💼 💰 💸 💵 💶 💷 💳 🪙 📈 📉 📊 💡 🧾 📝 📌 📎 📅 📆 ⏰ ⌛ 💻 📱 🖥️ ⌨️ 🔒 🔑 🔧 🛠️ ⚙️ 📣 📢 🗣️ ✅ ❌ ⚠️ ❓ ❗ 🆗 🆕'.split(
        ' ',
      ),
    ],
  },
];

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (e: string) => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState(EMOJI[0]!.id);
  const shown = EMOJI.find((c) => c.id === cat) ?? EMOJI[0]!;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="chat-emoji" role="dialog" aria-label={t('Emoji')}>
      <div className="chat-emoji-tabs" role="group" aria-label={t('Emoji categories')}>
        {EMOJI.map((c) => (
          <button
            key={c.id}
            type="button"
            className="chat-emoji-tab"
            aria-pressed={c.id === cat}
            aria-label={c.label()}
            title={c.label()}
            onClick={() => setCat(c.id)}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div className="chat-emoji-grid" role="group" aria-label={shown.label()}>
        {shown.list.map((e) => (
          <button
            key={e}
            type="button"
            className="chat-emoji-btn"
            aria-label={t('Insert {emoji}', { emoji: e })}
            onClick={() => onPick(e)}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Voice notes

const VOICE_MAX_MS = 60_000;
const VOICE_MAX_BYTES = 512 * 1024;
const VOICE_MIMES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/aac'];

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const canRecord = () =>
  typeof window !== 'undefined' &&
  typeof window.MediaRecorder !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia;

function pickMime(): string {
  for (const m of VOICE_MIMES)
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* older browsers */
    }
  return '';
}

/**
 * Tap the mic to record (up to a minute), then send or bin it. Asks for the
 * microphone the first time; says so plainly when it's blocked or missing.
 */
export function VoiceRecorder({
  onSend,
  disabled,
}: {
  onSend: (audio: Blob, ms: number) => Promise<boolean>;
  disabled?: boolean;
}) {
  const { toast } = useView();
  const [state, setState] = useState<'idle' | 'asking' | 'recording' | 'sending'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<{
    r: MediaRecorder;
    stream: MediaStream;
    chunks: Blob[];
    started: number;
    send: boolean;
    timer: ReturnType<typeof setInterval>;
  } | null>(null);

  useEffect(
    () => () => {
      const cur = rec.current;
      if (cur) {
        cur.send = false;
        clearInterval(cur.timer);
        if (cur.r.state !== 'inactive') cur.r.stop();
        cur.stream.getTracks().forEach((x) => x.stop());
      }
    },
    [],
  );

  const stop = (send: boolean) => {
    const cur = rec.current;
    if (!cur) return;
    cur.send = send;
    clearInterval(cur.timer);
    if (cur.r.state !== 'inactive') cur.r.stop();
  };

  const start = async () => {
    if (!canRecord()) {
      toast(t('Voice notes need a browser that can record audio.'), 'error');
      return;
    }
    setState('asking');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState('idle');
      toast(
        t('No microphone. Allow it for this site in your browser settings to send voice notes.'),
        'error',
      );
      return;
    }
    const mime = pickMime();
    let r: MediaRecorder;
    try {
      r = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: 32_000,
      });
    } catch {
      stream.getTracks().forEach((x) => x.stop());
      setState('idle');
      toast(t('Voice notes need a browser that can record audio.'), 'error');
      return;
    }
    const started = Date.now();
    const cur = {
      r,
      stream,
      chunks: [] as Blob[],
      started,
      send: false,
      timer: setInterval(() => {
        const ms = Date.now() - started;
        setElapsed(ms);
        if (ms >= VOICE_MAX_MS) stop(true);
      }, 200),
    };
    rec.current = cur;
    r.ondataavailable = (e) => {
      if (e.data.size) cur.chunks.push(e.data);
    };
    r.onstop = () => {
      stream.getTracks().forEach((x) => x.stop());
      rec.current = null;
      const ms = Math.min(VOICE_MAX_MS, Date.now() - cur.started);
      if (!cur.send) {
        setState('idle');
        setElapsed(0);
        return;
      }
      const type = (r.mimeType || mime || 'audio/webm').split(';')[0]!;
      const blob = new Blob(cur.chunks, { type });
      if (ms < 500 || !blob.size) {
        setState('idle');
        setElapsed(0);
        toast(t('Too short. Hold on a moment longer.'), 'info');
        return;
      }
      if (blob.size > VOICE_MAX_BYTES) {
        setState('idle');
        setElapsed(0);
        toast(t('That voice note is too long.'), 'error');
        return;
      }
      setState('sending');
      void onSend(blob, ms).finally(() => {
        setState('idle');
        setElapsed(0);
      });
    };
    r.start(250);
    setElapsed(0);
    setState('recording');
  };

  if (state === 'recording' || state === 'sending')
    return (
      <div className="chat-recording" role="group" aria-label={t('Recording a voice note')}>
        <span className="chat-rec-dot" aria-hidden="true" />
        <span className="chat-rec-time" aria-live="polite" data-recording-ms={elapsed}>
          {clock(elapsed)} / {clock(VOICE_MAX_MS)}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={state === 'sending'}
          onClick={() => stop(false)}
        >
          {t('Cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={state === 'sending'}
          onClick={() => stop(true)}
        >
          {state === 'sending' ? t('Sending…') : t('Send voice note')}
        </button>
      </div>
    );
  return (
    <button
      type="button"
      className="chat-icon-btn"
      aria-label={t('Record a voice note')}
      title={t('Record a voice note')}
      disabled={disabled || state === 'asking'}
      onClick={() => void start()}
    >
      🎤
    </button>
  );
}

/** A voice note in the chat: play or pause, a progress bar, its length. */
function VoiceNote({ src, ms, mine }: { src: string; ms: number; mine: boolean }) {
  const { toast } = useView();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<'idle' | 'playing' | 'paused' | 'ended'>('idle');
  const [pos, setPos] = useState(0);
  const total = Math.max(1, ms / 1000);
  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );
  const toggle = () => {
    let a = audio.current;
    if (!a) {
      a = new Audio(src);
      a.preload = 'auto';
      a.ontimeupdate = () => setPos(a!.currentTime);
      a.onended = () => {
        setState('ended');
        setPos(total);
      };
      a.onpause = () => setState((s) => (s === 'playing' ? 'paused' : s));
      a.onerror = () => {
        setState('idle');
        toast(t('Couldn’t play that voice note.'), 'error');
      };
      audio.current = a;
    }
    if (state === 'playing') {
      a.pause();
      return;
    }
    if (state === 'ended') a.currentTime = 0;
    setState('playing');
    a.play().catch(() => {
      setState('idle');
      toast(t('Couldn’t play that voice note.'), 'error');
    });
  };
  const pct = Math.min(100, Math.round((pos / total) * 100));
  return (
    <div
      className={`chat-voice${mine ? ' mine' : ''}`}
      data-voice-state={state}
      data-voice-src={src}
    >
      <button
        type="button"
        className="chat-voice-play"
        aria-label={state === 'playing' ? t('Pause voice note') : t('Play voice note')}
        onClick={toggle}
      >
        {state === 'playing' ? '❚❚' : '▶'}
      </button>
      <div
        className="chat-voice-bar"
        role="progressbar"
        aria-label={t('Voice note')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="chat-voice-time">
        {state === 'idle' ? clock(ms) : `${clock(pos * 1000)} / ${clock(ms)}`}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- Cards

const STATUS_LABEL: Record<string, () => string> = {
  pending: () => t('Waiting for an answer'),
  invited: () => t('Waiting for an answer'),
  accepted: () => t('Accepted'),
  together: () => t('Together now'),
  declined: () => t('Declined'),
  cancelled: () => t('Called off'),
  ended: () => t('Ended'),
  expired: () => t('Expired'),
  gone: () => t('No longer available'),
  over: () => t('Over'),
  playing: () => t('Game on'),
  finished: () => t('Game over'),
};
const PLAY_GAME: Record<string, () => string> = {
  quiz: () => t('a quiz'),
  snooker: () => t('snooker'),
  football: () => t('a penalty shootout'),
  golf: () => t('golf'),
};

function CardShell({
  icon,
  title,
  children,
  status,
  type,
}: {
  icon: string;
  title: string;
  children?: ReactNode;
  status?: string;
  type: string;
}) {
  return (
    <div className="chat-card" data-card={type} data-card-status={status}>
      <div className="chat-card-head">
        <span className="chat-card-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="item-title">{title}</span>
      </div>
      {children}
      {status && STATUS_LABEL[status] && (
        <span className="small muted chat-card-status">{STATUS_LABEL[status]!()}</span>
      )}
    </div>
  );
}

function ChatCardView({
  card,
  mine,
  partner,
  ctx,
  onChanged,
}: {
  card: ChatCard;
  mine: boolean;
  partner: { id: string; name: string };
  ctx?: PhoneCtx;
  onChanged: () => void;
}) {
  const { view, send, busy } = useView();
  const me = view.me.id;
  const run = async (command: Command, ok?: string | ((r: unknown) => string | null)) => {
    const r = await send(command, ok);
    onChanged();
    return r;
  };
  const first = partner.name.split(' ')[0] ?? partner.name;
  switch (card.type) {
    case 'payment': {
      const amount = mine
        ? moneyExact(card.amount, card.currency)
        : moneyExact(card.received, card.receivedCurrency);
      return (
        <CardShell
          type="payment"
          icon="💸"
          title={
            mine
              ? t('You sent {amount}', { amount })
              : t('{name} sent you {amount}', { name: first, amount })
          }
        >
          {card.note && <span className="chat-card-note">“{card.note}”</span>}
          {mine && card.fee > 0 && (
            <span className="small muted">
              {t('Fee {amount}', { amount: moneyExact(card.fee, card.currency) })}
            </span>
          )}
          {ctx && (
            <div className="row">
              <Button variant="subtle" onClick={() => ctx.open('bank')}>
                {card.receiptId ? t('View receipt') : t('Open Bank')}
              </Button>
            </div>
          )}
        </CardShell>
      );
    }
    case 'date': {
      const place =
        card.location === 'home'
          ? t('At home')
          : (card.viewId && skyViewById(card.viewId)?.name) || tx(card.location.replace(/-/g, ' '));
      const guest = !mine;
      return (
        <CardShell
          type="date"
          icon="🌇"
          status={card.status}
          title={
            mine
              ? t('You asked {name} on a date', { name: first })
              : t('{name} asked you on a date', { name: first })
          }
        >
          <span className="small">{place}</span>
          {card.status === 'invited' && guest && (
            <div className="row">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run({ type: 'living.date.end', dateId: card.dateId }, t('Maybe next time.'))
                }
              >
                {t('Decline')}
              </Button>
              <Button
                disabled={busy}
                onClick={async () => {
                  const r = await run(
                    { type: 'living.date.accept', dateId: card.dateId },
                    t('It’s a date.'),
                  );
                  if (r !== null) {
                    ctx?.close();
                    openLiving(card.from);
                  }
                }}
              >
                {t('Accept date')}
              </Button>
            </div>
          )}
          {card.status === 'invited' && mine && (
            <div className="row">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void run({ type: 'living.date.end', dateId: card.dateId })}
              >
                {t('Call it off')}
              </Button>
            </div>
          )}
          {card.status === 'together' && (
            <div className="row">
              <Button
                onClick={() => {
                  ctx?.close();
                  openLiving(card.from === me ? me : card.from);
                }}
              >
                {t('Open the date')}
              </Button>
            </div>
          )}
        </CardShell>
      );
    }
    case 'visit':
      return (
        <CardShell
          type="visit"
          icon="🏠"
          status={card.status}
          title={
            mine
              ? t('You invited {name} over', { name: first })
              : t('{name} invited you over', { name: first })
          }
        >
          {card.city && <span className="small">{card.city}</span>}
          {card.status === 'pending' && !mine && (
            <div className="row">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(
                    { type: 'visit.decline', inviteId: card.inviteId },
                    t('Maybe next time.'),
                  )
                }
              >
                {t('Decline')}
              </Button>
              <Button
                disabled={busy}
                onClick={async () => {
                  const r = await run({ type: 'visit.accept', inviteId: card.inviteId });
                  if (r !== null) {
                    ctx?.close();
                    openVisit();
                  }
                }}
              >
                {t('Accept')}
              </Button>
            </div>
          )}
          {card.status === 'accepted' && !mine && (
            <div className="row">
              <Button
                onClick={() => {
                  ctx?.close();
                  openVisit();
                }}
              >
                {t('Go in')}
              </Button>
            </div>
          )}
          {card.status === 'accepted' && mine && (
            <span className="small">{t('{name} is coming over.', { name: first })}</span>
          )}
        </CardShell>
      );
    case 'gift':
      return (
        <CardShell
          type="gift"
          icon="🎁"
          status={card.status}
          title={
            mine
              ? t('You offered {name} a home', { name: first })
              : t('{name} wants to give you a home', { name: first })
          }
        >
          <span className="small">
            {tx(card.label)} · {card.city}
          </span>
          {card.value > 0 && (
            <span className="small muted">
              {t('Worth about {amount}', { amount: money(card.value, card.currency) })}
            </span>
          )}
          {card.status === 'pending' && !mine && (
            <div className="row">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(
                    { type: 'property.gift.decline', giftId: card.giftId },
                    t('You declined the gift.'),
                  )
                }
              >
                {t('Decline')}
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void run({ type: 'property.gift.accept', giftId: card.giftId }, (r: unknown) =>
                    tx(String((r as { message?: string })?.message ?? '')),
                  )
                }
              >
                {t('Accept the home')}
              </Button>
            </div>
          )}
          {card.status === 'pending' && mine && (
            <div className="row">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(
                    { type: 'property.gift.decline', giftId: card.giftId },
                    t('Offer withdrawn.'),
                  )
                }
              >
                {t('Take it back')}
              </Button>
            </div>
          )}
          {card.status === 'accepted' && !mine && ctx && (
            <div className="row">
              <Button variant="subtle" onClick={() => ctx.open('homes')}>
                {t('See it in Homes')}
              </Button>
            </div>
          )}
        </CardShell>
      );
    case 'techevent': {
      const going = card.going ?? [];
      const iGo = going.includes(me);
      // You first, then them.
      const names = [...(iGo ? [t('You')] : []), ...(going.some((id) => id !== me) ? [first] : [])];
      return (
        <CardShell
          type="techevent"
          icon="🎟"
          status={card.status === 'over' ? 'over' : undefined}
          title={
            mine
              ? t('You asked {name} to {event}', { name: first, event: card.title })
              : t('{name} asked you to {event}', { name: first, event: card.title })
          }
        >
          <span className="small">
            {t('Day {day}', { day: card.day })} · {tx(card.venue)} · {card.city}
          </span>
          <span className="small muted">
            {card.ticket > 0 ? money(card.ticket, card.currency) : t('Free')}
            {names.length > 0 ? ` · ${t('Going: {names}', { names: names.join(', ') })}` : ''}
          </span>
          {card.status === 'on' && (
            <div className="row">
              {iGo ? (
                <>
                  <span className="small">{t('You went ✓')}</span>
                  {ctx && (
                    <Button variant="subtle" onClick={() => ctx.goPlace(card.placeId)}>
                      {t('Go to the venue')}
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run({ type: 'techevent.attend', eventId: card.eventId }, (r: unknown) =>
                      tx(String((r as { message?: string })?.message ?? '')),
                    )
                  }
                >
                  {t('Go together')}
                </Button>
              )}
            </div>
          )}
        </CardShell>
      );
    }
    case 'play': {
      const game = PLAY_GAME[card.game]?.() ?? card.game;
      const sameCity = (view.here?.id ?? view.market.id) === card.market;
      const open = card.roomId && card.venue && card.status === 'waiting';
      return (
        <CardShell
          type="play"
          icon="🎮"
          status={card.status === 'open' || card.status === 'waiting' ? undefined : card.status}
          title={
            mine
              ? t('You asked {name} to play {game}', { name: first, game })
              : t('{name} wants to play {game}', { name: first, game })
          }
        >
          <span className="small">
            {card.title ? `${card.title} · ${card.city}` : card.city}
            {card.stake
              ? ` · ${t('{stake} entry', { stake: money(card.stake, card.currency ?? '') })}`
              : ''}
          </span>
          {!open && card.status === 'open' && (
            <span className="small muted">
              {mine
                ? t('Host a table at a venue or at home and invite them again to bring them to it.')
                : t('Reply to agree where to meet, or host a table and invite them.')}
            </span>
          )}
          {open && !mine && (
            <div className="row">
              {sameCity ? (
                card.game === 'golf' ? (
                  <Button onClick={() => showGolfInvite(card.roomId!)}>
                    {t('See the invitation')}
                  </Button>
                ) : (
                  <Button
                    onClick={() =>
                      openPlay({
                        venue: card.venue!,
                        name: card.title ?? card.city,
                        roomId: card.roomId!,
                        game: card.game === 'golf' ? undefined : card.game,
                      })
                    }
                  >
                    {t('Go to the table')}
                  </Button>
                )
              ) : (
                <span className="small muted">
                  {t('Travel to {city} to join this table.', { city: card.city })}
                </span>
              )}
            </div>
          )}
        </CardShell>
      );
    }
  }
}

/** One message in a player chat. */
export function PlayerMessage({
  m,
  chatId,
  partner,
  ctx,
  onChanged,
}: {
  m: ChatMessage;
  chatId: string;
  partner: { id: string; name: string };
  ctx?: PhoneCtx;
  onChanged: () => void;
}) {
  if (m.kind === 'card' && m.card)
    return (
      <div className={`chat-card-row${m.mine ? ' mine' : ''}`} data-message={m.id}>
        <ChatCardView
          card={m.card}
          mine={m.mine}
          partner={partner}
          ctx={ctx}
          onChanged={onChanged}
        />
      </div>
    );
  if (m.kind === 'voice' && m.voice)
    return (
      <div className={`bubble chat-voice-bubble${m.mine ? ' mine' : ''}`} data-message={m.id}>
        <VoiceNote src={`/api/chats/${chatId}/voice/${m.voice.id}`} ms={m.voice.ms} mine={m.mine} />
      </div>
    );
  return (
    <div className={`bubble${m.mine ? ' mine' : ''}`} data-message={m.id}>
      {m.text}
    </div>
  );
}

// ---------------------------------------------------------------- Doing things together

export type ActBody = { command: Command } | { techEventId: string };
type Panel = 'money' | 'date' | 'event' | 'gift' | 'golf' | null;

/**
 * The "+" menu of a player chat: send money, plan a date, invite them over,
 * a tech event together, give a home. Everything goes through `act` so a card
 * lands in the chat for both of you.
 */
export function ChatActions({
  partner,
  act,
  busy,
  children,
  goPlace,
}: {
  partner: { id: string; name: string };
  act: <R = unknown>(body: ActBody, ok?: string) => Promise<R | null>;
  busy: boolean;
  /** Go to a place in the city (the phone closes): golf with a friend waits at the club. */
  goPlace?: (place: string) => void;
  /** The composer, given the "+" button to put first in its row. */
  children: (plus: ReactNode) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const pick = (p: Panel) => {
    setPanel(p);
    setOpen(false);
  };
  const plus = (
    <button
      type="button"
      className="chat-icon-btn chat-plus"
      aria-label={t('Do something together')}
      aria-expanded={open}
      onClick={() => {
        setOpen(!open);
        setPanel(null);
      }}
    >
      {open ? '×' : '+'}
    </button>
  );
  return (
    <div className="chat-actions">
      {open && (
        <div className="chat-actions-menu" role="menu" aria-label={t('Do something together')}>
          <button type="button" role="menuitem" onClick={() => pick('money')}>
            💸 {t('Send money')}
          </button>
          <button type="button" role="menuitem" onClick={() => pick('date')}>
            🌇 {t('Plan a date')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              void act(
                { command: { type: 'visit.invite', toPlayerId: partner.id } },
                t('Invitation sent. They’ll see it in their phone.'),
              );
            }}
          >
            🏠 {t('Invite over')}
          </button>
          <button type="button" role="menuitem" onClick={() => pick('event')}>
            🎟 {t('Tech event together')}
          </button>
          <button type="button" role="menuitem" onClick={() => pick('gift')}>
            🎁 {t('Give a home')}
          </button>
          <button type="button" role="menuitem" onClick={() => pick('golf')}>
            ⛳ {t('Golf for money')}
          </button>
        </div>
      )}
      {panel === 'money' && (
        <SendMoney
          key={partner.id}
          to={partner.id}
          toName={partner.name}
          onDone={() => setPanel(null)}
          via={(command) => act({ command })}
        />
      )}
      {panel === 'date' && (
        <DatePanel partner={partner} act={act} busy={busy} onDone={() => setPanel(null)} />
      )}
      {panel === 'event' && (
        <EventPanel partner={partner} act={act} busy={busy} onDone={() => setPanel(null)} />
      )}
      {panel === 'golf' && (
        <GolfPanel
          partner={partner}
          act={act}
          busy={busy}
          onDone={() => setPanel(null)}
          goPlace={goPlace}
        />
      )}
      {panel === 'gift' && (
        <GiftPanel partner={partner} act={act} busy={busy} onDone={() => setPanel(null)} />
      )}
      {children(plus)}
    </div>
  );
}

interface PanelProps {
  partner: { id: string; name: string };
  act: <R = unknown>(body: ActBody, ok?: string) => Promise<R | null>;
  busy: boolean;
  onDone: () => void;
}

function PanelHead({ title, onDone }: { title: string; onDone: () => void }) {
  return (
    <div className="spread">
      <h3 className="phone-h">{title}</h3>
      <button type="button" className="btn btn-ghost" onClick={onDone}>
        {t('Cancel')}
      </button>
    </div>
  );
}

function DatePanel({ partner, act, busy, onDone }: PanelProps) {
  const { view } = useView();
  const city = view.here?.id ?? view.market.id;
  const views = skyViewsIn(city);
  const [where, setWhere] = useState(views[0]?.id ?? 'home');
  const ICON: Record<string, string> = {
    wheel: '🎡',
    cable: '🚡',
    deck: '🏙',
    tram: '🚋',
    hill: '⛰',
  };
  const send = async () => {
    const r = await act(
      {
        command:
          where === 'home'
            ? { type: 'living.date.invite', playerId: partner.id, location: 'home' }
            : {
                type: 'living.date.invite',
                playerId: partner.id,
                location: 'sky-view',
                viewId: where,
              },
      },
      t('Date invitation sent.'),
    );
    if (r !== null) onDone();
  };
  return (
    <section className="phone-card chat-panel" aria-label={t('Plan a date')}>
      <PanelHead title={t('Plan a date')} onDone={onDone} />
      <p className="small muted">
        {t('You both need to be in the same city. {name} chooses whether to accept.', {
          name: partner.name,
        })}
      </p>
      <div className="chat-choices" role="radiogroup" aria-label={t('Where')}>
        {views.map((v) => (
          <label key={v.id} className="phone-row phone-check" data-date-place={v.id}>
            <input
              type="radio"
              name="date-where"
              checked={where === v.id}
              onChange={() => setWhere(v.id)}
            />
            <span aria-hidden="true">{ICON[v.kind] ?? '🌇'}</span>
            <span className="item-title">{v.name}</span>
          </label>
        ))}
        <label className="phone-row phone-check" data-date-place="home">
          <input
            type="radio"
            name="date-where"
            checked={where === 'home'}
            onChange={() => setWhere('home')}
          />
          <span aria-hidden="true">🏠</span>
          <span className="item-title">{t('At my home (invite them over first)')}</span>
        </label>
      </div>
      <Button disabled={busy} onClick={() => void send()}>
        {t('Send the invitation')}
      </Button>
    </section>
  );
}

function EventPanel({ partner, act, busy, onDone }: PanelProps) {
  const { view } = useView();
  const events = (techEventsOf(view) ?? []).filter((e) => e.status === 'on' && !e.past);
  const [pick, setPick] = useState(events[0]?.id ?? '');
  const cur = view.here?.currency ?? view.market.currency;
  const send = async () => {
    const r = await act({ techEventId: pick }, t('Invitation sent.'));
    if (r !== null) onDone();
  };
  return (
    <section className="phone-card chat-panel" aria-label={t('Tech event together')}>
      <PanelHead title={t('Tech event together')} onDone={onDone} />
      {events.length === 0 ? (
        <p className="small muted">{t('Nothing on this month.')}</p>
      ) : (
        <>
          <div className="chat-choices" role="radiogroup" aria-label={t('Events')}>
            {events.map((e) => (
              <label key={e.id} className="phone-row phone-check" data-event-pick={e.id}>
                <input
                  type="radio"
                  name="chat-event"
                  checked={pick === e.id}
                  onChange={() => setPick(e.id)}
                />
                <span className="phone-row-main">
                  <span className="item-title">{tx(e.title)}</span>
                  <span className="small muted">
                    {tx(e.label)} · {t('Day {day}', { day: e.day })} · {tx(e.venue.name)} ·{' '}
                    {e.ticket > 0 ? money(e.ticket, cur) : t('Free')}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Button disabled={busy || !pick} onClick={() => void send()}>
            {t('Invite {name}', { name: partner.name })}
          </Button>
        </>
      )}
    </section>
  );
}

function GiftPanel({ partner, act, busy, onDone }: PanelProps) {
  const { view } = useView();
  const homes = view.me.properties ?? [];
  const blocker = (p: (typeof homes)[number]) =>
    p.mortgage
      ? t('Has a mortgage: pay it off first.')
      : p.rentedOut
        ? t('Let to tenants: end the let first.')
        : null;
  const free = homes.filter((p) => !blocker(p));
  const [pick, setPick] = useState(free[0]?.id ?? '');
  const chosen = homes.find((p) => p.id === pick);
  const send = async () => {
    const r = await act(
      { command: { type: 'property.gift', propertyId: pick, toPlayerId: partner.id } },
      t('Offer sent. It’s theirs once they accept.'),
    );
    if (r !== null) onDone();
  };
  return (
    <section className="phone-card chat-panel" aria-label={t('Give a home')}>
      <PanelHead title={t('Give a home')} onDone={onDone} />
      {homes.length === 0 ? (
        <p className="small muted">{t('You don’t own a home yet. Buy one in Homes.')}</p>
      ) : (
        <>
          <div className="chat-choices" role="radiogroup" aria-label={t('Your homes')}>
            {homes.map((p) => {
              const why = blocker(p);
              return (
                <label
                  key={p.id}
                  className="phone-row phone-check"
                  data-gift-pick={p.id}
                  aria-disabled={!!why}
                >
                  <input
                    type="radio"
                    name="chat-gift"
                    disabled={!!why}
                    checked={pick === p.id}
                    onChange={() => setPick(p.id)}
                  />
                  <span className="phone-row-main">
                    <span className="item-title">
                      {tx(p.tierLabel)} · {p.street}
                    </span>
                    <span className="small muted">
                      {p.neighbourhood}, {p.marketName} · {money(p.value, p.currency)}
                    </span>
                    {why && <span className="small bad">{why}</span>}
                    {!why && p.residence && (
                      <span className="small muted">{t('You live here: you’d move out.')}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="small muted">
            {t(
              'A gift, not a sale: no money changes hands. {name} pays its running costs from then on.',
              {
                name: partner.name,
              },
            )}
          </p>
          <Button disabled={busy || !chosen || !!blocker(chosen)} onClick={() => void send()}>
            {t('Give it to {name}', { name: partner.name })}
          </Button>
        </>
      )}
    </section>
  );
}

/**
 * Golf with a friend for money, from their chat: the stake per player and
 * the holes. Your stake goes into the pot as you send it; a card lands in
 * the chat for both of you, and they answer it (or the notice) with Accept
 * or Decline. Then you wait for them at the club.
 */
function GolfPanel({
  partner,
  act,
  busy,
  onDone,
  goPlace,
}: PanelProps & { goPlace?: (place: string) => void }) {
  const { view } = useView();
  const golf = golfOf(view, view.here?.id ?? view.market.id);
  const opts = golf.match;
  const cur = golf.currency || view.market.currency;
  const [stake, setStake] = useState(opts?.stakes[2] ?? 0);
  const [holes, setHoles] = useState(golf.holes.length);
  const [sent, setSent] = useState(false);
  if (!opts) return null;
  const first = partner.name.split(' ')[0] ?? partner.name;
  const invite = async () => {
    const r = await act<{ id: string }>(
      {
        command: {
          type: 'play.create',
          game: 'golf',
          venue: opts.venue,
          title: t('Golf with a friend'),
          stake,
          invite: partner.id,
          holes,
        },
      },
      t('Invitation sent. Your stake is in the pot.'),
    );
    if (r) setSent(true);
  };
  return (
    <div className="chat-panel chat-golf" aria-label={t('Golf for money')}>
      <PanelHead title={t('Golf with {name}', { name: first })} onDone={onDone} />
      {sent ? (
        <>
          <p className="small">
            {t('Invitation sent. Wait for {name} at {club}.', { name: first, club: golf.name })}
          </p>
          {goPlace && <Button onClick={() => goPlace('golf')}>{t('Go to the club')}</Button>}
        </>
      ) : (
        <>
          <p className="small muted">
            {t('{n} holes at {club}. Lowest total wins the pot; a tie gets both stakes back.', {
              n: holes,
              club: golf.name,
            })}
          </p>
          <div className="row">
            {[golf.holes.length, 1].map((n) => (
              <button
                key={n}
                type="button"
                className="chip"
                aria-pressed={holes === n}
                onClick={() => setHoles(n)}
              >
                {n === 1 ? t('1 hole') : t('{n} holes', { n })}
              </button>
            ))}
          </div>
          <StakeChips stakes={opts.stakes} value={stake} onChange={setStake} currency={cur} />
          <p className="small muted">
            {t('Pot {pot}', { pot: money(stake * 2, cur) })} ·{' '}
            {t('Green fee {fee} each, paid to the club', { fee: money(golf.fee, cur) })}
          </p>
          <Button disabled={busy} onClick={() => void invite()}>
            {stake
              ? t('Invite {name} · pay {stake} into the pot', {
                  name: first,
                  stake: money(stake, cur),
                })
              : t('Invite {name} · free round', { name: first })}
          </Button>
        </>
      )}
    </div>
  );
}
