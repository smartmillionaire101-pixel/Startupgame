/**
 * Feedback from inside the game, and crash reports nobody has to type.
 *
 * - The Feedback button (top row, and on a screen that failed) opens a short
 *   form: what it's about, and what happened. The game adds where the player
 *   was, so nobody has to describe their screen.
 * - A screen that crashes, or a script error on the page, is sent on its own
 *   (once in a while per error), with the same context.
 *
 * Both land in the admin dashboard (/admin → Feedback and errors).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { t } from './i18n';
import { pageRelease } from './update';
import { Sheet } from './ui';

type Topic = 'bug' | 'confusing' | 'idea' | 'love' | 'other';

// ---------------------------------------------------------------- context

let screen = '';
let lastProblem: { text: string; at: number } | null = null;

/** The screen the player is on (App sets it as they move about). */
export function setFeedbackScreen(name: string) {
  screen = name;
}

/** The last error the player saw (an error toast or a crash), sent with feedback. */
export function recordProblem(text: string) {
  lastProblem = { text: text.slice(0, 300), at: Date.now() };
}

function context(): Record<string, string> {
  const c: Record<string, string> = {
    screen: screen || 'unknown',
    page: location.pathname,
    release: pageRelease() ?? 'unknown',
    window: `${window.innerWidth}x${window.innerHeight}`,
  };
  // Only a recent one: an old error has nothing to do with what they write now.
  if (lastProblem && Date.now() - lastProblem.at < 30 * 60_000)
    c.lastError = `${lastProblem.text} (${Math.round((Date.now() - lastProblem.at) / 60_000)} min ago)`;
  return c;
}

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'x-runway': '1', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// ---------------------------------------------------------------- crash reports

const sent = new Set<string>();

/** Tell the dashboard a screen crashed (each different error once per page). */
export function reportCrash(err: unknown, where?: string) {
  const e = err instanceof Error ? err : new Error(String(err));
  const message = (e.message || e.name || 'Unknown error').slice(0, 500);
  recordProblem(message);
  if (sent.has(message) || sent.size >= 20) return;
  sent.add(message);
  void post('/api/client-errors', {
    message,
    stack: (e.stack ?? '').slice(0, 2000),
    context: { ...context(), ...(where ? { screen: where } : {}) },
  }).catch(() => {});
}

/** Script errors from the game's own code (not browser extensions), reported once each. */
export function watchPageErrors() {
  window.addEventListener('error', (e) => {
    if (!e.filename?.startsWith(location.origin)) return;
    reportCrash(e.error ?? e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason: unknown = e.reason;
    // A request the game already told the player about isn't a crash.
    if (reason instanceof Error && reason.name === 'AbortError') return;
    if (reason && typeof reason === 'object' && 'status' in reason) return;
    reportCrash(reason);
  });
}

// ---------------------------------------------------------------- the form

let open: Topic | null = null;
const listeners = new Set<() => void>();
const setOpen = (v: Topic | null) => {
  open = v;
  listeners.forEach((l) => l());
};

/** Open the feedback form (from anywhere), optionally on a topic. */
export function openFeedback(topic: Topic = 'other') {
  setOpen(topic);
}

/** The form itself; mounted once by the app. */
export function FeedbackHost() {
  const topic = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );
  if (!topic) return null;
  return <FeedbackSheet initial={topic} onClose={() => setOpen(null)} />;
}

const TOPICS: { id: Topic; emoji: string; label: () => string }[] = [
  { id: 'bug', emoji: '🐞', label: () => t('Something broke') },
  { id: 'confusing', emoji: '🤔', label: () => t('Confusing') },
  { id: 'idea', emoji: '💡', label: () => t('An idea') },
  { id: 'love', emoji: '❤️', label: () => t('I love this') },
  { id: 'other', emoji: '💬', label: () => t('Something else') },
];

function FeedbackSheet({ initial, onClose }: { initial: Topic; onClose: () => void }) {
  const [topic, setTopic] = useState<Topic>(initial);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  useEffect(() => {
    if (state !== 'sent') return;
    const id = window.setTimeout(onClose, 2500);
    return () => clearTimeout(id);
  }, [state, onClose]);

  const send = async () => {
    if (text.trim().length < 3) {
      setError(t('Tell us a little more.'));
      return;
    }
    setState('sending');
    setError('');
    try {
      const r = await post('/api/feedback', { topic, text: text.trim(), context: context() });
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(
          r.status === 429
            ? t('That’s a lot of feedback at once. Try again in a few minutes.')
            : (body?.error?.message ?? t('Couldn’t send it. Try again.')),
        );
      }
      setState('sent');
    } catch (e) {
      setState('error');
      setError(
        e instanceof TypeError
          ? t('Couldn’t reach the game. Check your connection and try again.')
          : e instanceof Error
            ? e.message
            : t('Couldn’t send it. Try again.'),
      );
    }
  };

  return (
    <Sheet title={t('Send feedback')} onClose={onClose}>
      {state === 'sent' ? (
        <p className="feedback-thanks" role="status" data-feedback-sent="">
          <span aria-hidden="true">🙏</span> {t('Thank you! The Runway team reads every message.')}
        </p>
      ) : (
        <div className="feedback-form" data-feedback-form="">
          <p className="small muted">
            {t('Tell the Runway team what you think. We’ll see which screen you were on.')}
          </p>
          <div className="chips" role="radiogroup" aria-label={t('What is it about?')}>
            {TOPICS.map((o) => (
              <button
                key={o.id}
                type="button"
                className="chip"
                role="radio"
                aria-checked={topic === o.id}
                onClick={() => setTopic(o.id)}
              >
                <span aria-hidden="true">{o.emoji}</span> {o.label()}
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="feedback-text">{t('What happened?')}</label>
            <textarea
              id="feedback-text"
              rows={5}
              maxLength={2000}
              value={text}
              placeholder={
                topic === 'bug'
                  ? t('What were you doing, and what went wrong?')
                  : t('Write as much or as little as you like.')
              }
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError('');
              }}
            />
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={state === 'sending'}
            aria-busy={state === 'sending' || undefined}
            onClick={() => void send()}
          >
            {state === 'sending' ? t('Sending…') : t('Send')}
          </button>
        </div>
      )}
    </Sheet>
  );
}
