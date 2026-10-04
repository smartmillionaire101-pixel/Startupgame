/**
 * Accounts: guests play in this browser until they save their progress with
 * an email (a sign-in link, no password). Saved players log in on any device
 * with a new link.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type EmailIntent } from '../api';
import { getLang, t, tx } from '../i18n';
import { useGame } from '../store';
import { Button, Card, Field, Sheet } from '../ui';

/** Warn before closing the tab only while a request is on its way. */
function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [active]);
}

/**
 * Email field → "check your inbox". In development and previews the server
 * also hands back the link, shown as a button, since no email is sent there.
 */
export function EmailLinkForm({
  intent,
  submitLabel,
}: {
  intent: EmailIntent;
  submitLabel: string;
}) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<{ email: string; devLink?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useLeaveGuard(loading);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api.emailLink(email, intent, getLang());
      setSent({ email: email.trim(), ...(r.devLink ? { devLink: r.devLink } : {}) });
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'email.off'
          ? t('Email sign-in isn’t switched on yet.')
          : tx((err as Error).message),
      );
    } finally {
      setLoading(false);
    }
  };

  if (sent)
    return (
      <div className="stack">
        <p role="status">
          {t('Check your inbox: we sent a link to {email}. It expires in 15 minutes.', {
            email: sent.email,
          })}
        </p>
        {intent === 'save' && (
          <p className="small muted">
            {t('Open it in this browser to finish saving. Your game stays here meanwhile.')}
          </p>
        )}
        {sent.devLink && (
          <a className="btn btn-primary btn-block" href={sent.devLink}>
            {t('Preview: open your sign-in link')}
          </a>
        )}
        <Button type="button" variant="ghost" onClick={() => setSent(null)}>
          {t('Use a different email')}
        </Button>
      </div>
    );

  return (
    <form onSubmit={submit}>
      <Field label={t('Email')}>
        {(id) => (
          <input
            id={id}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            required
          />
        )}
      </Field>
      {error && (
        <p className="small field-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="btn btn-primary btn-block" loading={loading}>
        {submitLabel}
      </Button>
      <p className="small muted">{t('No password needed: we email you a one-time link.')}</p>
    </form>
  );
}

export function SaveProgressSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title={t('Save progress')} onClose={onClose}>
      <p>
        {t(
          'Saving lets you come back on any device. Without it, your game lives only in this browser.',
        )}
      </p>
      <EmailLinkForm intent="save" submitLabel={t('Email me a link')} />
    </Sheet>
  );
}

/** "Save progress" button that opens the sheet; renders nothing for saved accounts. */
export function SaveProgressButton({ variant = 'primary' }: { variant?: 'primary' | 'ghost' }) {
  const { account } = useGame();
  const [open, setOpen] = useState(false);
  if (!account?.guest) return null;
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {t('Save progress')}
      </Button>
      {open && <SaveProgressSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** Sign out; a guest is warned first that leaving loses an unsaved game. */
export function SignOutButton() {
  const { account, refresh } = useGame();
  const [warn, setWarn] = useState(false);
  const [saving, setSaving] = useState(false);
  const leave = () => void api.logout().then(refresh);
  return (
    <>
      <Button variant="ghost" onClick={() => (account?.guest ? setWarn(true) : leave())}>
        {t('Sign out')}
      </Button>
      {warn && !saving && (
        <Sheet title={t('Leave this game?')} onClose={() => setWarn(false)}>
          <p>{t('You’ll lose this game unless you save it with an email.')}</p>
          <div className="stack">
            <Button onClick={() => setSaving(true)}>{t('Save progress')}</Button>
            <Button variant="danger" onClick={leave}>
              {t('Leave anyway')}
            </Button>
          </div>
        </Sheet>
      )}
      {saving && (
        <SaveProgressSheet
          onClose={() => {
            setSaving(false);
            setWarn(false);
          }}
        />
      )}
    </>
  );
}

/** Settings → Account: who you're signed in as. */
export function AccountStatus() {
  const { account } = useGame();
  if (!account) return null;
  if (account.email)
    return (
      <p>
        {t('Saved as {email}', { email: account.email })}
        <br />
        <span className="small muted">{t('Log in with this email on any device.')}</span>
      </p>
    );
  if (account.guest)
    return (
      <>
        <p>
          {t('Guest: not saved yet')}
          <br />
          <span className="small muted">
            {t(
              'Saving lets you come back on any device. Without it, your game lives only in this browser.',
            )}
          </span>
        </p>
        <SaveProgressButton />
      </>
    );
  return null;
}

const NUDGE_KEY = 'rw_save_nudge';

interface NudgeMemo {
  id?: string;
  month?: number;
  dismissed?: boolean;
}

/** The month this player started in this browser (remembered on first sight). */
function nudgeMemo(id: string, month: number): NudgeMemo {
  try {
    const saved = JSON.parse(localStorage.getItem(NUDGE_KEY) ?? '{}') as NudgeMemo;
    if (saved.id === id) return saved;
    const fresh = { id, month };
    localStorage.setItem(NUDGE_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    // Storage blocked: start counting from now.
    return { id, month };
  }
}

/**
 * Home: a gentle nudge to save, once a guest has played through their first
 * month. Remembers (in this browser) the month they started, and "not now".
 */
export function SaveNudge() {
  const { account, view } = useGame();
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  if (!account?.guest || !view || hidden) return null;
  const memo = nudgeMemo(view.me.id, view.market.month);
  if (memo.dismissed || view.market.month <= (memo.month ?? view.market.month)) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(NUDGE_KEY, JSON.stringify({ ...memo, dismissed: true }));
    } catch {
      /* not remembered; hidden for this visit */
    }
  };
  return (
    <Card title={t('Keep your game')} tone="good">
      <p>
        {t(
          'Saving lets you come back on any device. Without it, your game lives only in this browser.',
        )}
      </p>
      <div className="row">
        <Button onClick={() => setOpen(true)}>{t('Save progress')}</Button>
        <Button variant="ghost" onClick={dismiss}>
          {t('Not now')}
        </Button>
      </div>
      {open && <SaveProgressSheet onClose={() => setOpen(false)} />}
    </Card>
  );
}
