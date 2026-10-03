import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useGame } from '../store';
import { Button, Field } from '../ui';

/** Sign up / sign in with phone verification and an 18+ check (§3 step 1). */
export function SignIn() {
  const { refresh, toast, meta } = useGame();
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    const [year, month, day] = dob.split('-').map(Number);
    if (!year || !month || !day) return toast('Enter your date of birth.', 'error');
    setLoading(true);
    try {
      const r = await api.startAuth(phone, { year, month, day });
      setDevCode(r.devCode);
      setStep('code');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.verify(phone, code);
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="hero">
        <div className="brand" style={{ fontSize: '1.1rem' }}>
          <img src="/icon.svg" alt="" width={28} height={28} /> Runway
        </div>
        <h1 style={{ marginTop: '1rem' }}>Build, invest and grow.</h1>
        <p className="muted">Real startup lessons. No real-world losses.</p>
      </div>
      <section className="card">
        {step === 'phone' ? (
          <form onSubmit={start}>
            <Field
              label="Mobile number"
              hint="One account per number. We store it only as a one-way hash."
            >
              {(id) => (
                <input
                  id={id}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+234 803 123 4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              )}
            </Field>
            <Field label="Date of birth" hint="Runway is 18+. We check it and don’t keep it.">
              {(id) => (
                <input
                  id={id}
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                />
              )}
            </Field>
            <Button type="submit" className="btn btn-primary btn-block" loading={loading}>
              Send code
            </Button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <Field
              label="6-digit code"
              hint={
                devCode
                  ? `Dev mode: your code is ${devCode}`
                  : 'Sent by SMS. It expires in 10 minutes.'
              }
            >
              {(id) => (
                <input
                  id={id}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                />
              )}
            </Field>
            <div className="row">
              <Button type="submit" loading={loading}>
                Verify
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep('phone')}>
                Change number
              </Button>
            </div>
          </form>
        )}
      </section>
      <p className="disclaimer">
        {meta?.disclaimer ?? 'This is a game. Nothing here is financial, legal, or tax advice.'}
      </p>
    </div>
  );
}
