import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { t, tx } from '../i18n';
import { useGame } from '../store';
import { Button, Field } from '../ui';

type Gender = 'female' | 'male';

/**
 * Who you are (name, sex), where you build (the city) and how you play, on one
 * screen: everything else lives in Me → Profile.
 */
export function Onboarding({ embedded = false }: { embedded?: boolean }) {
  const { account, meta, refresh, toast } = useGame();
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [market, setMarket] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(account?.email ?? account?.pendingEmail ?? '');
  const [role, setRole] = useState<'founder' | 'investor' | 'banker'>('founder');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    if (!gender) return setError(t('Choose who you are.'));
    if (!market) return setError(t('Choose the city you want to build in.'));
    setLoading(true);
    setError(null);
    try {
      await api.onboard({
        username: username.trim(),
        email: email.trim(),
        role,
        name: name.trim() || username.trim(),
        gender,
        market,
      });
      toast(t('Welcome to Runway.'), 'ok');
      await refresh();
    } catch (err) {
      setError(tx((err as Error).message));
    } finally {
      setLoading(false);
    }
  };
  const form = (
    <section className="card">
      <h2>{t('Join the game')}</h2>
      <p className="small muted">{t('Set up the rest later in Me → Profile.')}</p>
      <form className="stack" onSubmit={submit}>
        <Field label={t('Your name')}>
          {(id) => (
            <input
              id={id}
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              required
            />
          )}
        </Field>
        <div className="stack" role="group" aria-label={t('I am')}>
          <span className="field-label">{t('I am')}</span>
          <div className="segmented">
            {(['female', 'male'] as const).map((g) => (
              <button
                key={g}
                type="button"
                className={gender === g ? 'on' : undefined}
                aria-pressed={gender === g}
                onClick={() => setGender(g)}
              >
                {g === 'female' ? t('Woman') : t('Man')}
              </button>
            ))}
          </div>
        </div>
        <div className="stack" role="group" aria-label={t('Your city')}>
          <span className="field-label">{t('The city you build in')}</span>
          <div className="choice-grid onboard-cities">
            {(meta?.markets ?? []).map((m) => (
              <button
                key={m.id}
                type="button"
                className="choice"
                data-market={m.id}
                aria-pressed={market === m.id}
                onClick={() => setMarket(m.id)}
              >
                <strong>{m.name}</strong>
                <span className="small muted">{m.country}</span>
              </button>
            ))}
          </div>
        </div>
        <Field label={t('Username')} hint={t('Letters, numbers, underscores.')}>
          {(id) => (
            <input
              id={id}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9_]{3,20}"
              required
            />
          )}
        </Field>
        <Field label={t('Email')}>
          {(id) => (
            <input
              id={id}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              required
            />
          )}
        </Field>
        <Field label={t('Join as')}>
          {(id) => (
            <select
              id={id}
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              <option value="founder">{t('Founder')}</option>
              <option value="investor">{t('Investor')}</option>
              <option value="banker">{t('Banker')}</option>
            </select>
          )}
        </Field>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <Button type="submit" className="btn btn-primary btn-block btn-big" loading={loading}>
          {t('Play now')}
        </Button>
        <p className="small muted">{t('By playing, you confirm you are 18 or older.')}</p>
      </form>
    </section>
  );
  return embedded ? (
    form
  ) : (
    <div className="app">
      <div className="hero">
        <h1>{t('Set up your player')}</h1>
      </div>
      {form}
    </div>
  );
}
