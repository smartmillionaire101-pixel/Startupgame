import { useEffect, useState } from 'react';
import type { Command, Industry, MarketId, RevenueModel, Stage } from '@runway/engine';
import { api } from '../api';
import { money, parseAmount, titleCase } from '../format';
import { t, tx } from '../i18n';
import { useGame } from '../store';
import { Button, Field, Pill } from '../ui';
import { AvatarFigure, avatarLook } from '../city/art';

type Role = 'founder' | 'investor' | 'banker';

const roleCards = (): { role: Role; title: string; text: string; disabled?: boolean }[] => [
  { role: 'founder', title: t('Founder'), text: t('Build a company from an idea to an exit.') },
  {
    role: 'investor',
    title: t('Investor'),
    text: t('Back founders with your savings, then raise a fund.'),
  },
  {
    role: 'banker',
    title: t('Banker'),
    text: t('Start a bank: take deposits, lend, and answer to the central bank.'),
  },
];

const stageLabel = (s: string) =>
  ({
    'pre-seed': t('Pre-seed'),
    seed: t('Seed'),
    'series-a': t('Series A'),
    'series-b': t('Series B'),
    'series-c': t('Series C'),
  })[s] ?? titleCase(s);

const modelLabel = (r: string) =>
  ({
    subscription: t('Subscription'),
    transaction: t('Transaction'),
    usage: t('Usage'),
    marketplace: t('Marketplace'),
    'one-off': t('One-off'),
    services: t('Services'),
  })[r] ?? titleCase(r);

const Dots = ({ n }: { n: number }) => (
  <div className="steps" aria-label={t('Step {n} of {total}', { n: n + 1, total: 5 })}>
    {[0, 1, 2, 3, 4].map((i) => (
      <span key={i} className={i <= n ? 'on' : ''} />
    ))}
  </div>
);

/** Onboarding in under two minutes (§3): role, background, market, role setup, start. */
export function Onboarding() {
  const { meta, send, refresh } = useGame();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role>('founder');
  const [backgroundId, setBackgroundId] = useState('');
  const [market, setMarket] = useState<MarketId>('lagos');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | ''>('');
  const [handle, setHandle] = useState('');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState<Industry>('fintech');
  const [model, setModel] = useState<RevenueModel>('subscription');
  const [idea, setIdea] = useState('');
  const [incorporation, setIncorporation] = useState<'local' | 'uk' | 'us'>('local');
  const [sectors, setSectors] = useState<Industry[]>(['fintech']);
  const [stages, setStages] = useState<Stage[]>(['pre-seed', 'seed']);
  const [check, setCheck] = useState('');
  const [bankType, setBankType] = useState('microfinance');
  const [nameCheck, setNameCheck] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [handleCheck, setHandleCheck] = useState<{ ok: boolean; reason?: string } | null>(null);

  // Live name checks against the market (§18), debounced.
  useEffect(() => {
    if (company.trim().length < 3) return;
    const timer = setTimeout(
      () =>
        void api
          .checkName(company, market, 'company')
          .then(setNameCheck)
          .catch(() => setNameCheck(null)),
      350,
    );
    return () => clearTimeout(timer);
  }, [company, market]);
  useEffect(() => {
    if (handle.trim().length < 3) return;
    const timer = setTimeout(
      () =>
        void api
          .checkName(handle, market, 'handle')
          .then(setHandleCheck)
          .catch(() => setHandleCheck(null)),
      350,
    );
    return () => clearTimeout(timer);
  }, [handle, market]);

  if (!meta)
    return (
      <div className="app">
        <p className="muted">{t('Loading…')}</p>
      </div>
    );
  const backgrounds = meta.backgrounds.filter((b) => b.role === role);
  const m = meta.markets.find((x) => x.id === market)!;

  const finish = async () => {
    // Wave 5: who you are (the engine stores it once section A lands; older ones ignore it).
    const base = {
      type: 'player.create' as const,
      handle,
      name,
      role,
      backgroundId,
      market,
      ...(gender ? { gender } : {}),
    };
    const cmd: Command =
      role === 'founder'
        ? {
            ...base,
            company: { name: company, industry, revenueModel: model, idea, incorporation },
          }
        : role === 'banker'
          ? {
              ...base,
              bank: { name: company, bankType: bankType as 'commercial' | 'microfinance' },
            }
          : { ...base, investor: { sectors, stages, checkSize: parseAmount(check) ?? 0 } };
    const r = await send(cmd, t('Welcome to Runway.'));
    if (r) await refresh();
  };

  const canSetup =
    gender !== '' &&
    name.trim().length >= 1 &&
    handleCheck?.ok === true &&
    (role === 'founder'
      ? nameCheck?.ok === true && idea.trim().length >= 5
      : role === 'banker'
        ? nameCheck?.ok === true
        : sectors.length > 0 && stages.length > 0 && (parseAmount(check) ?? 0) > 0);

  return (
    <div className="app">
      <div className="hero" style={{ paddingTop: '1.4rem' }}>
        <h1>{t('Set up your player')}</h1>
        <Dots n={step} />
      </div>

      {step === 0 && (
        <div className="choice-grid">
          {roleCards().map((r) => (
            <button
              key={r.role}
              className="choice"
              aria-pressed={role === r.role}
              disabled={r.disabled}
              onClick={() => {
                setRole(r.role);
                setBackgroundId('');
                setStep(1);
              }}
            >
              <div className="item-title">
                {r.title} {r.disabled && <Pill>{t('Phase 2')}</Pill>}
              </div>
              <div className="muted small">{r.text}</div>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <>
          <p className="muted">{t('Your background shapes your skills, network and savings.')}</p>
          <div className="choice-grid">
            {backgrounds.map((b) => (
              <button
                key={b.id}
                className="choice"
                aria-pressed={backgroundId === b.id}
                onClick={() => {
                  setBackgroundId(b.id);
                  setStep(2);
                }}
              >
                <div className="item-title">{tx(b.name)}</div>
                <div className="small">
                  <span className="good">+</span> {tx(b.strengths)}
                </div>
                <div className="small">
                  <span className="bad">−</span> {tx(b.gaps)}
                </div>
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => setStep(0)} style={{ marginTop: '0.8rem' }}>
            {t('Back')}
          </Button>
        </>
      )}

      {step === 2 && (
        <>
          <p className="muted">{t('Pick your city. Your clock follows its time zone.')}</p>
          <div className="choice-grid">
            {meta.markets.map((mk) => (
              <button
                key={mk.id}
                className="choice"
                aria-pressed={market === mk.id}
                onClick={() => {
                  setMarket(mk.id as MarketId);
                  setStep(3);
                }}
              >
                <div className="spread">
                  <div className="item-title">
                    {mk.name}, {mk.country}
                  </div>
                  <Pill>{mk.currency}</Pill>
                </div>
                <div className="small muted">
                  {t('Living costs {amount}/month', {
                    amount: money(mk.costOfLiving, mk.currency),
                  })}
                </div>
                <div className="row small" style={{ marginTop: '0.3rem' }}>
                  <Pill>
                    {t('Cost')} {'●'.repeat(mk.card.costOfLiving)}
                  </Pill>
                  <Pill>
                    {t('Talent')} {'●'.repeat(mk.card.talent)}
                  </Pill>
                  <Pill>
                    {t('Capital')} {'●'.repeat(mk.card.capitalAccess)}
                  </Pill>
                  <Pill>
                    {t('Regulation')} {'●'.repeat(mk.card.regulation)}
                  </Pill>
                </div>
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => setStep(1)} style={{ marginTop: '0.8rem' }}>
            {t('Back')}
          </Button>
        </>
      )}

      {step === 3 && (
        <section className="card">
          <div className="gender-pick" role="group" aria-label={t('You are')}>
            {(['female', 'male'] as const).map((g) => (
              <button
                key={g}
                type="button"
                className="choice"
                aria-pressed={gender === g}
                data-gender={g}
                onClick={() => setGender(g)}
              >
                <svg viewBox="-16 -46 32 50" width="52" height="82" aria-hidden="true">
                  <AvatarFigure look={avatarLook(backgroundId, `preview:${handle || name}`, g)} />
                </svg>
                <span className="item-title">{g === 'female' ? t('Female') : t('Male')}</span>
              </button>
            ))}
          </div>
          <Field label={t('Your name')}>
            {(id) => (
              <input
                id={id}
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <Field
            label={t('Handle')}
            hint={
              handleCheck && !handleCheck.ok ? (
                <span className="bad">{tx(handleCheck.reason ?? '')}</span>
              ) : handleCheck?.ok ? (
                <span className="good">{t('Available')}</span>
              ) : (
                t('Letters, numbers, underscores.')
              )
            }
          >
            {(id) => (
              <input
                id={id}
                value={handle}
                maxLength={20}
                onChange={(e) => setHandle(e.target.value)}
              />
            )}
          </Field>
          {role === 'founder' ? (
            <>
              <Field label={t('Industry')}>
                {(id) => (
                  <select
                    id={id}
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value as Industry)}
                  >
                    {meta.industries.map((i) => (
                      <option key={i.id} value={i.id}>
                        {tx(i.label)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label={t('Business model')}>
                {(id) => (
                  <select
                    id={id}
                    value={model}
                    onChange={(e) => setModel(e.target.value as RevenueModel)}
                  >
                    {meta.revenueModels.map((r) => (
                      <option key={r} value={r}>
                        {modelLabel(r)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label={t('Your idea in one line')}>
                {(id) => (
                  <input
                    id={id}
                    value={idea}
                    maxLength={120}
                    placeholder={t('Payments for market traders that work offline')}
                    onChange={(e) => setIdea(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('Company name')}
                hint={
                  nameCheck && !nameCheck.ok ? (
                    <span className="bad">{tx(nameCheck.reason ?? '')}</span>
                  ) : nameCheck?.ok ? (
                    <span className="good">{t('Available in {market}', { market: m.name })}</span>
                  ) : (
                    t('Checked against brands and names taken in your market.')
                  )
                }
              >
                {(id) => (
                  <input
                    id={id}
                    value={company}
                    maxLength={32}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('Incorporation')}
                hint={t('Foreign holding companies cost more but some investors prefer them.')}
              >
                {(id) => (
                  <select
                    id={id}
                    value={incorporation}
                    onChange={(e) => setIncorporation(e.target.value as 'local' | 'uk' | 'us')}
                  >
                    {Object.entries(meta.incorporation).map(([k, v]) => (
                      <option key={k} value={k}>
                        {tx(v.label)} ({money(Math.round(m.costOfLiving * v.costCol), m.currency)})
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </>
          ) : role === 'banker' ? (
            <>
              <Field
                label={t('Bank name')}
                hint={
                  nameCheck && !nameCheck.ok ? (
                    <span className="bad">{tx(nameCheck.reason ?? '')}</span>
                  ) : nameCheck?.ok ? (
                    <span className="good">{t('Available in {market}', { market: m.name })}</span>
                  ) : (
                    t('Checked against brands and names taken in your market.')
                  )
                }
              >
                {(id) => (
                  <input
                    id={id}
                    value={company}
                    maxLength={32}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t('Licence')}>
                {() => (
                  <div className="choice-grid">
                    {meta.bankTypes.map((bt) => (
                      <button
                        key={bt.id}
                        type="button"
                        className="choice"
                        aria-pressed={bankType === bt.id}
                        onClick={() => setBankType(bt.id)}
                      >
                        <div className="item-title">{tx(bt.label)}</div>
                        <div className="muted small">
                          {t('Minimum capital {amount}', {
                            amount: money(
                              Math.round(m.costOfLiving * bt.minCapitalCol),
                              m.currency,
                            ),
                          })}
                        </div>
                        <div className="muted small">
                          {t('Earns: {text}', { text: tx(bt.earns) })}
                        </div>
                        <div className="muted small">
                          {t('Risk: {text}', { text: tx(bt.risk) })}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              <p className="small muted">
                {t(
                  'You put in 80% of your savings. AI shareholders add two to five times that, depending on your credibility. Short of the minimum, the licence is refused and the capital comes back.',
                )}
              </p>
            </>
          ) : (
            <>
              <Field label={t('Sectors')}>
                {() => (
                  <div className="chips">
                    {meta.industries.map((i) => (
                      <button
                        key={i.id}
                        type="button"
                        className="chip"
                        aria-pressed={sectors.includes(i.id as Industry)}
                        onClick={() =>
                          setSectors((s) =>
                            s.includes(i.id as Industry)
                              ? s.filter((x) => x !== i.id)
                              : [...s, i.id as Industry],
                          )
                        }
                      >
                        {tx(i.label)}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              <Field label={t('Stages')}>
                {() => (
                  <div className="chips">
                    {meta.stages.slice(0, 3).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="chip"
                        aria-pressed={stages.includes(s as Stage)}
                        onClick={() =>
                          setStages((x) =>
                            x.includes(s as Stage) ? x.filter((y) => y !== s) : [...x, s as Stage],
                          )
                        }
                      >
                        {stageLabel(s)}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              <Field
                label={t('Typical cheque ({currency})', { currency: m.currency })}
                hint={t('e.g. 5m or 250k')}
              >
                {(id) => (
                  <input
                    id={id}
                    value={check}
                    inputMode="decimal"
                    onChange={(e) => setCheck(e.target.value)}
                  />
                )}
              </Field>
            </>
          )}
          <div className="row" style={{ marginTop: '0.6rem' }}>
            <Button disabled={!canSetup} onClick={() => setStep(4)}>
              {t('Continue')}
            </Button>
            <Button variant="ghost" onClick={() => setStep(2)}>
              {t('Back')}
            </Button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="card stack">
          <h2>{t('Ready')}</h2>
          <p>
            {role === 'founder'
              ? t('{company} opens in {market}.', { company, market: m.name })
              : role === 'banker'
                ? t(
                    '{company} applies for a licence in {market}. The central bank decides in two months.',
                    { company, market: m.name },
                  )
                : t('You start investing in {market}.', { market: m.name })}{' '}
            {t(
              'Time runs fast: a game month passes every few real minutes, at the same moment in every city.',
            )}
          </p>
          <p className="disclaimer">{tx(meta.disclaimer)}</p>
          <div className="row">
            <Button onClick={() => void finish()}>{t('Start')}</Button>
            <Button variant="ghost" onClick={() => setStep(3)}>
              {t('Back')}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
