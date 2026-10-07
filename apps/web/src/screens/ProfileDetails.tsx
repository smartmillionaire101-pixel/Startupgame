import { useState, type FormEvent } from 'react';
import type { Industry, Stage } from '@runway/engine';
import { useView } from '../store';
import { amountInput, parseAmount } from '../format';
import { t, tx } from '../i18n';
import { Button, Card, Field } from '../ui';

export function ProfileDetails() {
  const { view, meta, send, busy, account } = useView();
  const me = view.me;
  const [name, setName] = useState(me.name);
  const [gender, setGender] = useState(me.gender ?? '');
  const [background, setBackground] = useState(me.background?.id ?? '');
  const [sectors, setSectors] = useState<Industry[]>(me.investor?.sectors ?? ['fintech']);
  const [stages, setStages] = useState<Stage[]>(me.investor?.stages ?? ['seed']);
  const [check, setCheck] = useState(amountInput(me.investor?.checkSize ?? 0));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    await send(
      {
        type: 'player.profile',
        name,
        backgroundId: background,
        ...(gender ? { gender: gender as 'female' | 'male' } : {}),
        ...(me.role === 'investor'
          ? { investor: { sectors, stages, checkSize: parseAmount(check) ?? 0 } }
          : {}),
      },
      t('Profile saved.'),
    );
  };
  return (
    <Card title={t('Profile details')}>
      {(account?.email || account?.pendingEmail) && (
        <p className="small muted">
          {account.email
            ? t('Saved as {email}', { email: account.email })
            : t('Email: {email} (not confirmed)', { email: account.pendingEmail! })}
        </p>
      )}
      <form onSubmit={save} className="stack">
        <Field label={t('Your name')}>
          {(id) => (
            <input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={40}
            />
          )}
        </Field>
        <Field label={t('You are')}>
          {(id) => (
            <select id={id} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">{t('Choose later')}</option>
              <option value="female">{t('Female')}</option>
              <option value="male">{t('Male')}</option>
            </select>
          )}
        </Field>
        <Field
          label={t('Background')}
          hint={t('Changing your background keeps your current skills and savings.')}
        >
          {(id) => (
            <select id={id} value={background} onChange={(e) => setBackground(e.target.value)}>
              {meta?.backgrounds
                .filter((b) => b.role === me.role)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {tx(b.name)}
                  </option>
                ))}
            </select>
          )}
        </Field>
        {me.role === 'investor' && (
          <>
            <Field label={t('Sectors')}>
              {(id) => (
                <select
                  id={id}
                  multiple
                  value={sectors}
                  onChange={(e) =>
                    setSectors(Array.from(e.target.selectedOptions, (o) => o.value as Industry))
                  }
                  required
                >
                  {meta?.industries.map((i) => (
                    <option key={i.id} value={i.id}>
                      {tx(i.label)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('Stages')}>
              {(id) => (
                <select
                  id={id}
                  multiple
                  value={stages}
                  onChange={(e) =>
                    setStages(Array.from(e.target.selectedOptions, (o) => o.value as Stage))
                  }
                  required
                >
                  {meta?.stages.map((s) => (
                    <option key={s} value={s}>
                      {tx(s)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('Typical cheque')} hint={view.market.currency}>
              {(id) => (
                <input id={id} value={check} onChange={(e) => setCheck(e.target.value)} required />
              )}
            </Field>
          </>
        )}
        <Button
          type="submit"
          loading={busy}
          disabled={!name.trim() || (me.role === 'investor' && (parseAmount(check) ?? 0) <= 0)}
        >
          {t('Save profile')}
        </Button>
      </form>
    </Card>
  );
}
