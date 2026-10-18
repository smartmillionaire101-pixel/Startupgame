import { useState, type FormEvent } from 'react';
import { BACKGROUNDS, type Appearance, type Background } from '@runway/engine';
import { api } from '../api';
import { t, tx } from '../i18n';
import { useGame } from '../store';
import { Button, Field, Sheet } from '../ui';
import { AvatarFigure, avatarLook, lookFromAppearance } from '../city/art';
import { Creator, randomAppearance } from '../avatar/Creator';
import { PortraitOf } from '../avatar/Portrait';
import { markJoinedHere } from '../phone/settings';
import { markNewPlayer } from '../tutorial/state';
import '../tutorial/tutorial.css';

type Gender = 'female' | 'male';

/** Founder Journey 6: the founder backgrounds offered on the entry screen. */
const FOUNDER_CHOICES = ['f-engineer', 'f-consultant', 'f-dropout', 'f-banker'];
/** Outfit colours (null: the colour your look came with). */
const OUTFITS: { c: string | null; name: () => string }[] = [
  { c: null, name: () => t('Your look’s colour') },
  { c: '#dc2626', name: () => t('Red') },
  { c: '#2563eb', name: () => t('Blue') },
  { c: '#16a34a', name: () => t('Green') },
  { c: '#f59e0b', name: () => t('Amber') },
  { c: '#7c3aed', name: () => t('Purple') },
];

const SKILL_LABEL: Record<string, () => string> = {
  product: () => t('Product'),
  sales: () => t('Sales'),
  fundraising: () => t('Fundraising'),
  finance: () => t('Finance'),
  hiring: () => t('Hiring'),
  leadership: () => t('Leadership'),
  negotiation: () => t('Negotiation'),
  publicSpeaking: () => t('Public speaking'),
  investing: () => t('Investing'),
  risk: () => t('Risk'),
};

/** Plain-language starting modifiers of a background. */
export function backgroundModifiers(b: Background): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(b.skills)) {
    const name = SKILL_LABEL[k]?.() ?? k;
    if (v >= 40) out.push(t('Strong at {skill}', { skill: name.toLowerCase() }));
    else if (v <= 15) out.push(t('Weak at {skill}', { skill: name.toLowerCase() }));
  }
  out.push(
    b.savingsMultiplier >= 1.3
      ? t('More savings')
      : b.savingsMultiplier < 0.8
        ? t('Less savings')
        : t('Average savings'),
  );
  if (b.hoursBonus > 0) out.push(t('+{n} hours a month', { n: b.hoursBonus }));
  if (b.hoursBonus < 0) out.push(t('{n} hours a month', { n: b.hoursBonus }));
  return out;
}

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
  const [background, setBackground] = useState('f-engineer');
  const [outfit, setOutfit] = useState<string | null>(null);
  // Phase 6a: a random look to start from (the creator is optional); once you
  // edit it, it stays yours when you change who you are.
  const [look, setLook] = useState<Appearance>(() => randomAppearance());
  const [custom, setCustom] = useState(false);
  const pickGender = (g: Gender) => {
    setGender(g);
    if (!custom) setLook(randomAppearance(g));
  };
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
        ...(role === 'founder' ? { backgroundId: background } : {}),
      });
      // Phase 6a: the look you see is the look you get (made or random).
      const saved = await api
        .command({
          type: 'player.appearance',
          appearance: outfit ? { ...look, topColor: outfit } : look,
        })
        .then(
          () => true,
          () => false,
        );
      // Founders get the guided first session; the outfit colour is kept on
      // this device too if the look couldn't be saved.
      markNewPlayer({ founder: role === 'founder', top: saved ? null : outfit });
      // Phase 2: a player who joins from Simple mode's start day gets it on by default.
      markJoinedHere();
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
                onClick={() => pickGender(g)}
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
        <LookChoice
          background={role === 'founder' ? background : undefined}
          gender={gender}
          look={look}
          setLook={(a) => {
            setLook(a);
            setCustom(true);
            setOutfit(null);
          }}
          outfit={outfit}
          setOutfit={setOutfit}
        />
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
        {role === 'founder' && <BackgroundChoice value={background} onChange={setBackground} />}
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

/** Founder Journey 6: who you were before (skills, savings, hours). */
function BackgroundChoice({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const list = FOUNDER_CHOICES.map((id) => BACKGROUNDS.find((b) => b.id === id)).filter(
    (b): b is Background => !!b,
  );
  return (
    <div className="stack" role="group" aria-label={t('Your background')}>
      <span className="field-label">{t('Your background')}</span>
      <span className="small muted">{t('It sets your starting skills, savings and hours.')}</span>
      <div className="choice-grid onboard-backgrounds">
        {list.map((b) => (
          <button
            key={b.id}
            type="button"
            className="choice"
            data-background={b.id}
            aria-pressed={value === b.id}
            onClick={() => onChange(b.id)}
          >
            <strong>{tx(b.name)}</strong>
            <span className="small">{tx(b.strengths)}</span>
            <span className="small muted">{t('Gap: {gap}', { gap: tx(b.gaps) })}</span>
            <span className="onboard-mods small">
              {backgroundModifiers(b).map((m) => (
                <span key={m} className="onboard-mod">
                  {m}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A preview of your character, an outfit colour, and (Phase 6a) the
 * character creator behind "Make my look". Skipping it keeps the random look.
 */
function LookChoice({
  background,
  gender,
  look,
  setLook,
  outfit,
  setOutfit,
}: {
  background?: string;
  gender: Gender | null;
  look: Appearance;
  setLook: (a: Appearance) => void;
  outfit: string | null;
  setOutfit: (c: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const g = gender ?? 'female';
  const bottom = avatarLook(background, 'preview', g).bottom;
  const shown = lookFromAppearance(outfit ? { ...look, topColor: outfit } : look, g, bottom);
  return (
    <div className="stack">
      <div className="onboard-look" role="group" aria-label={t('Outfit colour')}>
        <PortraitOf look={shown} size={64} label={t('Your look')} />
        <svg viewBox="-16 -48 32 52" width="40" height="66" aria-hidden="true">
          <AvatarFigure look={shown} />
        </svg>
        <div className="stack">
          <span className="field-label">{t('Outfit colour')}</span>
          <div className="onboard-swatches">
            {OUTFITS.map(({ c, name }) => (
              <button
                key={c ?? 'default'}
                type="button"
                className="onboard-swatch"
                aria-pressed={outfit === c}
                aria-label={name()}
                style={{ background: c ?? look.topColor }}
                onClick={() => setOutfit(c)}
              />
            ))}
          </div>
        </div>
      </div>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t('Make my look')}
      </Button>
      {open && (
        <Sheet title={t('Make my look')} onClose={() => setOpen(false)}>
          <Creator
            initial={outfit ? { ...look, topColor: outfit } : look}
            gender={g}
            bottom={bottom}
            onSave={(a) => {
              setLook(a);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
            cancelLabel={t('Skip for now')}
            saveLabel={t('Use this look')}
          />
        </Sheet>
      )}
    </div>
  );
}
