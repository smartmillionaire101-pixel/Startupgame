/**
 * Sign-up in three steps (the approved redesign): 1 "Pick your path" (the
 * three careers, each with you in its outfit; skipped when a role card on
 * the landing page already picked it), 2 "Your look" (a big live preview on
 * the city's skyline, with sex, skin, hair, hair colour and outfit colour,
 * and the full creator behind "More options"), 3 "About you" (name, city,
 * username, email, a founder's background and 18+), then Play.
 *
 * It sends exactly what the one-screen form did (POST /api/onboarding, then
 * the look as `player.appearance`). On a wide screen the live avatar stands
 * on the left and the steps are on the right.
 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  BACKGROUNDS,
  GENDER_PARTS,
  HAIR_COLOURS,
  SKIN_TONES,
  fitAppearance,
  inRoleOutfit,
  type Appearance,
  type Background,
} from '@runway/engine';
import { ApiError, api } from '../api';
import { LANGS, setLang, t, tx, useLang } from '../i18n';
import { useGame } from '../store';
import { Button, Sheet } from '../ui';
import { AvatarFigure, avatarLook, lookFromAppearance, type AvatarLook } from '../city/art';
import {
  Creator,
  HAIR_COLOUR_NAME,
  HAIR_NAME,
  TOP_NAME,
  randomAppearance,
} from '../avatar/Creator';
import { PortraitOf } from '../avatar/Portrait';
import { markJoinedHere } from '../phone/settings';
import { markNewPlayer } from '../tutorial/state';
import { CitySkyline, Flag, citySky } from '../signup/cityArt';
import {
  STEPS,
  USERNAME_RE,
  browserTimeZone,
  emailProblem,
  firstStep,
  guessCity,
  prevStep,
  suggestUsername,
  type EmailProblem,
  type JoinRole,
  type Step,
} from '../signup/logic';
import '../tutorial/tutorial.css';
import '../signup/signup.css';

export type { JoinRole } from '../signup/logic';

type Gender = 'female' | 'male';

/** Founder Journey 6: the founder backgrounds offered on the entry screen. */
const FOUNDER_CHOICES = ['f-engineer', 'f-consultant', 'f-dropout', 'f-banker'];
/** Outfit colours (null: the colour the outfit came with). */
const OUTFITS: { c: string | null; name: () => string }[] = [
  { c: null, name: () => t('Your look’s colour') },
  { c: '#dc2626', name: () => t('Red') },
  { c: '#2563eb', name: () => t('Blue') },
  { c: '#16a34a', name: () => t('Green') },
  { c: '#f59e0b', name: () => t('Amber') },
  { c: '#7c3aed', name: () => t('Purple') },
];
const ROLES: readonly JoinRole[] = ['founder', 'investor', 'banker'];

/** A role's name, as French says it for this gender. */
function roleName(role: JoinRole, gender: Gender): string {
  if (gender === 'female')
    return {
      founder: t('Founder|woman'),
      investor: t('Investor|woman'),
      banker: t('Banker|woman'),
    }[role];
  return { founder: t('Founder'), investor: t('Investor'), banker: t('Banker') }[role];
}
const PROMISE: Record<JoinRole, () => string> = {
  founder: () => t('Build a startup from idea to exit.'),
  investor: () => t('Back winners. Then raise your own fund.'),
  banker: () => t('Run a bank. Lend, advise, win the licence.'),
};
const DOES: Record<JoinRole, () => string[]> = {
  founder: () => [t('Ship a product'), t('Win customers'), t('Raise rounds')],
  investor: () => [t('Hear pitches'), t('Pick startups'), t('Raise from LPs')],
  banker: () => [t('Win the licence'), t('Lend to firms'), t('Advise on deals')],
};
const STEP_NAME: Record<Step, () => string> = {
  path: () => t('Pick your path'),
  look: () => t('Your look'),
  about: () => t('About you'),
};
const STEP_SHORT: Record<Step, () => string> = {
  path: () => t('Path'),
  look: () => t('Look'),
  about: () => t('About you'),
};

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
function backgroundModifiers(b: Background): string[] {
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

function emailMessage(p: EmailProblem): string {
  switch (p) {
    case 'empty':
      return t('Add your email so you can log in again.');
    case 'spaces':
      return t('Take out the spaces.');
    case 'at':
      return t('An email has one @, like ada@gmail.com');
    case 'name':
      return t('Add the part before the @, like ada@gmail.com');
    case 'domain':
      return t('Add the part after the @, like ada@gmail.com');
    case 'chars':
      return t('Take out the symbols < > " , ; and apostrophes.');
    case 'end':
      return t('Add the end of your email, like ada@gmail.com');
    case 'long':
      return t('That email is too long.');
  }
}

/** A random sex to start from (the look starts random too; you change both on step 2). */
const randomGender = (): Gender =>
  crypto.getRandomValues(new Uint8Array(1))[0]! % 2 ? 'female' : 'male';

type FieldName = 'name' | 'city' | 'username' | 'email' | 'form';

/** What's been picked, kept across a change of language (which redraws the app). */
interface Carry {
  skipped: boolean;
  step: Step;
  role: JoinRole;
  gender: Gender;
  look: Appearance;
  touched: boolean;
  custom: boolean;
  outfit: string | null;
  name: string;
  market: string | null;
  manualUsername: string | null;
  attempt: number;
  email: string;
  emailSeen: boolean;
  background: string;
  adult: boolean;
}
let carry: Carry | null = null;
const takeCarry = () => {
  const c = carry;
  carry = null;
  return c;
};

export function Onboarding({
  joinAs,
  onBack,
  onLogIn,
}: {
  /** @deprecated sign-up always fills the screen; kept for callers. */
  embedded?: boolean;
  /** The role a landing page card picked: the path step is skipped. */
  joinAs?: JoinRole;
  /** Leave sign-up (back to the landing page), when there's somewhere to go. */
  onBack?: () => void;
  /** "Already playing? Log in". */
  onLogIn?: () => void;
}) {
  const { account, meta, refresh, toast } = useGame();
  const lang = useLang();
  // Changing language redraws the whole app: carry what's been picked across.
  const [carried] = useState(takeCarry);
  const skipped = carried?.skipped ?? !!joinAs;
  const [step, setStep] = useState<Step>(() => carried?.step ?? firstStep(joinAs));
  const [role, setRole] = useState<JoinRole>(carried?.role ?? joinAs ?? 'founder');
  const [start] = useState(() => {
    const g = randomGender();
    return { g, look: randomAppearance(g) };
  });
  const [gender, setGender] = useState<Gender>(carried?.gender ?? start.g);
  // A random look to start from; once you change any of it, it stays yours
  // when you change sex. A look from the full creator (custom) keeps its own
  // clothes; otherwise you wear your role's outfit.
  const [look, setLook] = useState<Appearance>(carried?.look ?? start.look);
  const [touched, setTouched] = useState(carried?.touched ?? false);
  const [custom, setCustom] = useState(carried?.custom ?? false);
  const [outfit, setOutfit] = useState<string | null>(carried?.outfit ?? null);
  const [creator, setCreator] = useState(false);
  const [name, setName] = useState(carried?.name ?? '');
  const [market, setMarket] = useState<string | null>(carried?.market ?? null);
  const [manualUsername, setManualUsername] = useState<string | null>(
    carried?.manualUsername ?? null,
  );
  const [attempt, setAttempt] = useState(carried?.attempt ?? 0);
  const [email, setEmail] = useState(
    carried?.email ?? account?.email ?? account?.pendingEmail ?? '',
  );
  const [emailSeen, setEmailSeen] = useState(carried?.emailSeen ?? false);
  const [background, setBackground] = useState(carried?.background ?? 'f-engineer');
  const [adult, setAdult] = useState(carried?.adult ?? false);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [loading, setLoading] = useState(false);

  const markets = useMemo(() => meta?.markets ?? [], [meta]);
  const guessed = useMemo(() => guessCity(markets, browserTimeZone()), [markets]);
  const city = market ?? guessed ?? 'lagos';
  const cityName = markets.find((m) => m.id === city)?.name ?? '';
  const username = manualUsername ?? suggestUsername(name, attempt);

  const dressed = custom ? fitAppearance(look, gender) : inRoleOutfit(look, role, gender);
  const shownA = outfit ? { ...dressed, topColor: outfit } : dressed;
  const bottom = avatarLook(role === 'founder' ? background : undefined, 'preview', gender).bottom;
  const shown = lookFromAppearance(shownA, gender, bottom);

  // Is the username free in the chosen city? Asked once typing stops; a
  // made-up one that's taken gets the next number.
  const [check, setCheck] = useState<{ u: string; m: string; ok: boolean; reason?: string }>();
  useEffect(() => {
    if (!USERNAME_RE.test(username) || !city) return;
    let live = true;
    const id = setTimeout(() => {
      api.checkName(username, city, 'handle').then(
        (r) => {
          if (!live) return;
          setCheck({ u: username, m: city, ok: r.ok, reason: r.reason });
          if (!r.ok && manualUsername === null && attempt < 8) setAttempt((a) => a + 1);
        },
        () => undefined, // can't tell: the server checks again on Play
      );
    }, 350);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [username, city, manualUsername, attempt]);
  const checked = check && check.u === username && check.m === city ? check : undefined;

  const pickGender = (g: Gender) => {
    setGender(g);
    setLook((l) => (touched || custom ? fitAppearance(l, g) : randomAppearance(g)));
  };
  const edit = (patch: Partial<Appearance>) => {
    setLook((l) => ({ ...l, ...patch }));
    setTouched(true);
  };

  // A new step starts at the top, its heading focused for screen readers.
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    document.scrollingElement?.scrollTo?.(0, 0);
    heading.current?.focus();
  }, [step]);
  const go = (s: Step) => {
    moved.current = true;
    setStep(s);
  };
  const back = () => {
    const p = prevStep(step, skipped);
    if (p) go(p);
    else onBack?.();
  };
  const canBack = !!prevStep(step, skipped) || !!onBack;

  const emailIssue = emailProblem(email);
  const validate = () => {
    const e: Partial<Record<FieldName, string>> = {};
    if (!name.trim()) e.name = t('Add your name.');
    if (!market && !guessed) e.city = t('Choose the city you want to build in.');
    if (!USERNAME_RE.test(username.trim()))
      e.username = t('Use 3 to 20 letters, numbers or underscores.');
    else if (checked && !checked.ok) e.username = tx(checked.reason ?? 'That handle is taken.');
    if (emailIssue) e.email = emailMessage(emailIssue);
    return e;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading || !adult) return;
    const found = validate();
    setErrors(found);
    setEmailSeen(true);
    const first = (['name', 'city', 'username', 'email'] as const).find((k) => found[k]);
    if (first) {
      document.getElementById(`su-${first}`)?.focus();
      return;
    }
    setLoading(true);
    try {
      await api.onboard({
        username: username.trim(),
        email: email.trim(),
        role,
        name: name.trim() || username.trim(),
        gender,
        market: city,
        ...(role === 'founder' ? { backgroundId: background } : {}),
      });
      // The look you see is the look you get.
      const saved = await api
        .command({ type: 'player.appearance', appearance: fitAppearance(shownA, gender) })
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
      const msg = tx((err as Error).message);
      const code = err instanceof ApiError ? err.code : '';
      if (code.startsWith('player.handle') || /handle|username/i.test((err as Error).message)) {
        setErrors({ username: msg });
        document.getElementById('su-username')?.focus();
      } else if (code === 'email') {
        setErrors({ email: msg });
        document.getElementById('su-email')?.focus();
      } else setErrors({ form: msg });
    } finally {
      setLoading(false);
    }
  };

  const stepIndex = STEPS.indexOf(step);
  const roleTag = `${roleName(role, gender)} · ${TOP_NAME[dressed.topStyle]()}`;
  const handle = USERNAME_RE.test(username) ? `@${username}` : '';

  const topBar = (
    <div className="su-top">
      {canBack ? (
        <button
          type="button"
          className="su-back"
          data-signin-back={prevStep(step, skipped) ? undefined : ''}
          onClick={back}
        >
          ‹ {t('Back')}
        </button>
      ) : (
        <span />
      )}
      <ol
        className="su-dots"
        aria-label={t('Step {n} of {total}', { n: stepIndex + 1, total: STEPS.length })}
      >
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={i === stepIndex ? 'on' : i < stepIndex ? 'done' : undefined}
            aria-hidden="true"
          />
        ))}
      </ol>
      <div className="su-lang" role="group" aria-label={t('Language')}>
        {LANGS.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={lang === l.id}
            aria-label={l.label}
            lang={l.id}
            onClick={() => {
              if (l.id !== lang)
                carry = {
                  skipped,
                  step,
                  role,
                  gender,
                  look,
                  touched,
                  custom,
                  outfit,
                  name,
                  market,
                  manualUsername,
                  attempt,
                  email,
                  emailSeen,
                  background,
                  adult,
                };
              void setLang(l.id);
            }}
          >
            {l.id.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );

  const stepper = (
    <ol className="su-stepper">
      {STEPS.map((s, i) => {
        const state = i < stepIndex ? 'done' : i === stepIndex ? 'on' : 'next';
        const sub =
          s === 'path'
            ? roleName(role, gender)
            : s === 'look'
              ? state === 'on'
                ? t('Now')
                : TOP_NAME[dressed.topStyle]()
              : t('Name, city, email');
        const body = (
          <>
            <b>
              {i + 1} · {STEP_SHORT[s]()}
              {state === 'done' ? ' ✓' : ''}
            </b>
            <span>{sub}</span>
          </>
        );
        return (
          <li key={s} className={state} aria-current={state === 'on' ? 'step' : undefined}>
            {state === 'done' ? (
              <button type="button" onClick={() => go(s)}>
                {body}
              </button>
            ) : (
              <div>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );

  const logIn = onLogIn && (
    <p className="su-login">
      {t('Already playing?')}{' '}
      <button type="button" onClick={onLogIn}>
        {t('Log in')}
      </button>
    </p>
  );

  return (
    <div className="su" data-signup="" data-step={step} data-signup-role={role}>
      <aside className="su-side" aria-label={t('Your player')}>
        <Stage
          variant="side"
          city={city}
          look={shown}
          label={t('Your player in {city}', { city: cityName })}
        >
          <div className="su-brand">
            <img src="/icon.svg" alt="" width={34} height={34} /> Runway
          </div>
          {(name.trim() || handle) && (
            <div className="su-st-name su-st-name-right">
              <b>{name.trim()}</b>
              <span>{handle}</span>
            </div>
          )}
          <div className="su-st-tags">
            <span className="su-tag">
              <Flag city={city} /> {cityName}
              {!market && step !== 'about' && <small>· {t('you pick on step 3')}</small>}
            </span>
            {step !== 'path' && (
              <span className="su-tag">
                {roleTag}
                <button type="button" onClick={() => go('path')}>
                  {t('Change')}
                </button>
              </span>
            )}
          </div>
        </Stage>
      </aside>
      <main className="su-main">
        {topBar}
        {stepper}
        {step === 'path' && (
          <section className="su-step su-step-path" aria-labelledby="su-h">
            <h1 id="su-h" ref={heading} tabIndex={-1} className="su-h1">
              {STEP_NAME.path()}
            </h1>
            <p className="su-sub">{t('You’ll meet the other two in every city.')}</p>
            <RoleCards role={role} setRole={setRole} look={look} gender={gender} custom={custom} />
            <p className="su-disclaimer">
              {meta?.disclaimer
                ? tx(meta.disclaimer)
                : t('This is a game. Nothing here is financial, legal, or tax advice.')}
            </p>
            <div className="su-dock">
              <button type="button" className="su-play" onClick={() => go('look')}>
                {t('Continue')} <span aria-hidden="true">▶</span>
              </button>
              {logIn}
            </div>
          </section>
        )}
        {step === 'look' && (
          <section className="su-step su-step-look" aria-labelledby="su-h">
            <h1 id="su-h" ref={heading} tabIndex={-1} className="su-h1">
              {STEP_NAME.look()}
            </h1>
            <p className="su-sub su-wide-only">{t('Every tap updates your player on the left.')}</p>
            <Stage
              variant="big"
              city={city}
              look={shown}
              label={t('Your player in {city}', { city: cityName })}
            >
              <div className="su-st-tags">
                <span className="su-tag">
                  <Flag city={city} /> {cityName}
                  {!market && <small>· {t('you pick next')}</small>}
                </span>
                <span className="su-tag">
                  {roleTag}
                  <button type="button" onClick={() => go('path')}>
                    {t('Change')}
                  </button>
                </span>
              </div>
              <span className="su-live" aria-hidden="true">
                {t('LIVE')}
              </span>
            </Stage>
            <LookControls
              gender={gender}
              pickGender={pickGender}
              look={shownA}
              base={dressed}
              bottom={bottom}
              edit={edit}
              outfit={outfit}
              setOutfit={setOutfit}
              openCreator={() => setCreator(true)}
            />
            <div className="su-dock">
              <button type="button" className="su-play" onClick={() => go('about')}>
                <span className="su-phone-only">{t('Next')}</span>
                <span className="su-wide-only">{t('Next: About you')}</span>{' '}
                <span aria-hidden="true">▶</span>
              </button>
              <span className="su-dock-hint su-wide-only">
                {t('Name, city, username, email, 18+')}
              </span>
              {logIn}
            </div>
          </section>
        )}
        {step === 'about' && (
          <form
            className="su-step su-step-about"
            aria-labelledby="su-h"
            onSubmit={submit}
            noValidate
          >
            <h1 id="su-h" ref={heading} tabIndex={-1} className="su-h1">
              {STEP_NAME.about()}
            </h1>
            <Stage
              variant="strip"
              city={city}
              look={shown}
              label={t('Your player in {city}', { city: cityName })}
            >
              <span className="su-tag su-strip-city">
                <Flag city={city} /> {cityName}
              </span>
              <div className="su-st-name">
                <b>{name.trim() || ' '}</b>
                <span>
                  {handle}
                  {handle ? ' · ' : ''}
                  {roleName(role, gender)}
                </span>
              </div>
              <span className="su-live su-live-top" aria-hidden="true">
                {t('LIVE')}
              </span>
            </Stage>
            <AboutFields
              name={name}
              setName={(v) => {
                setName(v);
                setAttempt(0);
                if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
              }}
              markets={markets}
              city={city}
              setCity={(m) => {
                setMarket(m);
                setErrors((e) => ({ ...e, city: undefined }));
              }}
              username={username}
              setUsername={(v) => {
                setManualUsername(v);
                if (errors.username) setErrors((e) => ({ ...e, username: undefined }));
              }}
              checked={checked}
              email={email}
              setEmail={(v) => {
                setEmail(v);
                if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
              }}
              emailSeen={emailSeen}
              seeEmail={() => setEmailSeen(true)}
              emailIssue={emailIssue}
              role={role}
              background={background}
              setBackground={setBackground}
              errors={errors}
            />
            <div className="su-dock">
              {errors.form && (
                <p role="alert" className="su-err su-form-err">
                  {errors.form}
                </p>
              )}
              <label className="su-check">
                <input
                  type="checkbox"
                  name="adult"
                  checked={adult}
                  onChange={(e) => setAdult(e.target.checked)}
                />
                <span>{t('I’m 18 or older')}</span>
              </label>
              <Button
                type="submit"
                className="su-play"
                loading={loading}
                disabled={!adult}
                aria-describedby={adult ? undefined : 'su-adult-hint'}
              >
                {t('Play')} <span aria-hidden="true">▶</span>
              </Button>
              {!adult && (
                <span id="su-adult-hint" className="su-sr">
                  {t('Tick “I’m 18 or older” to play.')}
                </span>
              )}
              {logIn}
            </div>
          </form>
        )}
      </main>
      {creator && (
        <Sheet title={t('Make my look')} onClose={() => setCreator(false)}>
          <Creator
            initial={shownA}
            gender={gender}
            bottom={bottom}
            onSave={(a) => {
              setLook(a);
              setCustom(true);
              setTouched(true);
              setOutfit(null);
              setCreator(false);
            }}
            onCancel={() => setCreator(false)}
            cancelLabel={t('Skip for now')}
            saveLabel={t('Use this look')}
          />
        </Sheet>
      )}
    </div>
  );
}

/** Your player on the city's skyline: big (step 2), a strip (step 3) or the wide screen's side. */
function Stage({
  variant,
  city,
  look,
  label,
  children,
}: {
  variant: 'big' | 'strip' | 'side';
  city: string;
  look: AvatarLook;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`su-stage su-stage-${variant}`}
      style={{ background: citySky(city) }}
      data-city={city}
    >
      <CitySkyline city={city} />
      <div className="su-ground" />
      <svg
        className="su-fig"
        viewBox="-16 -48 32 52"
        role="img"
        aria-label={label}
        data-preview=""
        data-top={look.top}
        data-hair={look.hairStyle}
        data-skin={look.skin}
      >
        <AvatarFigure look={look} />
      </svg>
      {children}
    </div>
  );
}

/** A native radio dressed as a card, chip or swatch: arrow keys, labels and focus come free. */
function Radio({
  name,
  checked,
  onPick,
  label,
  className,
  children,
  value,
  labelledBy,
  describedBy,
}: {
  name: string;
  checked: boolean;
  onPick: () => void;
  /** The radio's name when its content isn't (a colour swatch). */
  label?: string;
  className: string;
  children?: ReactNode;
  value: string;
  labelledBy?: string;
  describedBy?: string;
}) {
  return (
    <label className={`su-radio ${className}${checked ? ' on' : ''}`} title={label}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onPick}
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
      />
      {children}
    </label>
  );
}

function RoleCards({
  role,
  setRole,
  look,
  gender,
  custom,
}: {
  role: JoinRole;
  setRole: (r: JoinRole) => void;
  look: Appearance;
  gender: Gender;
  custom: boolean;
}) {
  const id = useId();
  return (
    <div className="su-roles" role="radiogroup" aria-label={t('Pick your path')}>
      {ROLES.map((r) => {
        const a = custom ? fitAppearance(look, gender) : inRoleOutfit(look, r, gender);
        const bottom = avatarLook(
          r === 'founder' ? 'f-engineer' : undefined,
          'preview',
          gender,
        ).bottom;
        return (
          <Radio
            key={r}
            name={`${id}-role`}
            value={r}
            checked={role === r}
            onPick={() => setRole(r)}
            className="su-role"
            labelledBy={`${id}-${r}-t`}
            describedBy={`${id}-${r}-p`}
          >
            <span className={`su-role-art su-role-${r}`} aria-hidden="true">
              <span className="su-role-floor" />
              <svg viewBox="-16 -48 32 52" className="su-role-fig">
                <AvatarFigure look={lookFromAppearance(a, gender, bottom)} />
              </svg>
            </span>
            <span className="su-role-body">
              <span className="su-role-title" id={`${id}-${r}-t`}>
                {roleName(r, gender)}
              </span>
              <span className="su-role-promise" id={`${id}-${r}-p`}>
                {PROMISE[r]()}
              </span>
              <span className="su-role-does">
                {DOES[r]().map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
            </span>
            <span className="su-role-tick" aria-hidden="true">
              {role === r ? '✓' : ''}
            </span>
          </Radio>
        );
      })}
    </div>
  );
}

function LookControls({
  gender,
  pickGender,
  look,
  base,
  bottom,
  edit,
  outfit,
  setOutfit,
  openCreator,
}: {
  gender: Gender;
  pickGender: (g: Gender) => void;
  /** The look as shown (outfit colour on). */
  look: Appearance;
  /** The look before the outfit colour (its own colour is the first swatch). */
  base: Appearance;
  bottom: string;
  edit: (p: Partial<Appearance>) => void;
  outfit: string | null;
  setOutfit: (c: string | null) => void;
  openCreator: () => void;
}) {
  const id = useId();
  const hairs = GENDER_PARTS[gender].hairStyle;
  // The row of hairstyles scrolls sideways: start it with yours in view.
  const thumbs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = thumbs.current;
    const on = row?.querySelector<HTMLElement>('.su-thumb.on');
    if (row && on && row.scrollWidth > row.clientWidth)
      row.scrollLeft = Math.max(0, on.offsetLeft - row.clientWidth / 2 + 29);
    // Only when the row changes (a new sex), not on every pick.
  }, [gender]);
  return (
    <div className="su-look">
      <div className="su-seg" role="radiogroup" aria-label={t('I am')}>
        {(['female', 'male'] as const).map((g) => (
          <Radio
            key={g}
            name={`${id}-sex`}
            value={g}
            checked={gender === g}
            onPick={() => pickGender(g)}
            className="su-seg-opt"
          >
            {g === 'female' ? t('Woman') : t('Man')}
          </Radio>
        ))}
      </div>
      <div className="su-row">
        <div className="su-row-h">
          <span id={`${id}-skin`}>{t('Skin')}</span>
        </div>
        <div className="su-swatches" role="radiogroup" aria-labelledby={`${id}-skin`}>
          {SKIN_TONES.map((c, i) => (
            <Radio
              key={c}
              name={`${id}-skin-r`}
              value={c}
              checked={look.skin === c}
              onPick={() => edit({ skin: c })}
              label={t('Skin tone {n}', { n: i + 1 })}
              className="su-swatch"
            >
              <span style={{ background: c }} />
            </Radio>
          ))}
        </div>
      </div>
      <div className="su-row">
        <div className="su-row-h">
          <span id={`${id}-hair`}>{t('Hair')}</span>
          <span className="su-row-val">{HAIR_NAME[look.hairStyle]()}</span>
        </div>
        <div className="su-thumbs" role="radiogroup" aria-labelledby={`${id}-hair`} ref={thumbs}>
          {hairs.map((h) => (
            <Radio
              key={h}
              name={`${id}-hair-r`}
              value={h}
              checked={look.hairStyle === h}
              onPick={() => edit({ hairStyle: h })}
              className="su-thumb"
            >
              <PortraitOf
                look={lookFromAppearance({ ...look, hairStyle: h }, gender, bottom)}
                size={48}
              />
              <span className="su-thumb-name">{HAIR_NAME[h]()}</span>
            </Radio>
          ))}
        </div>
      </div>
      <div className="su-row">
        <div className="su-row-h">
          <span id={`${id}-hc`}>{t('Hair colour')}</span>
        </div>
        <div className="su-swatches" role="radiogroup" aria-labelledby={`${id}-hc`}>
          {HAIR_COLOURS.map((c, i) => (
            <Radio
              key={c}
              name={`${id}-hc-r`}
              value={c}
              checked={look.hairColor === c}
              onPick={() => edit({ hairColor: c })}
              label={HAIR_COLOUR_NAME[i]!()}
              className="su-swatch"
            >
              <span style={{ background: c }} />
            </Radio>
          ))}
        </div>
      </div>
      <div className="su-row">
        <div className="su-row-h">
          <span id={`${id}-oc`}>{t('Outfit colour')}</span>
          <span className="su-row-val">{TOP_NAME[base.topStyle]()}</span>
        </div>
        <div className="su-swatches" role="radiogroup" aria-labelledby={`${id}-oc`}>
          {OUTFITS.map(({ c, name }) => (
            <Radio
              key={c ?? 'own'}
              name={`${id}-oc-r`}
              value={c ?? 'own'}
              checked={outfit === c}
              onPick={() => setOutfit(c)}
              label={name()}
              className="su-swatch"
            >
              <span style={{ background: c ?? base.topColor }} />
            </Radio>
          ))}
        </div>
      </div>
      <button type="button" className="su-more" onClick={openCreator}>
        <span>{t('More options')} ›</span>
        <small>{t('face, glasses, beard, hats')}</small>
      </button>
    </div>
  );
}

function AboutFields({
  name,
  setName,
  markets,
  city,
  setCity,
  username,
  setUsername,
  checked,
  email,
  setEmail,
  emailSeen,
  seeEmail,
  emailIssue,
  role,
  background,
  setBackground,
  errors,
}: {
  name: string;
  setName: (v: string) => void;
  markets: { id: string; name: string; country: string }[];
  city: string;
  setCity: (m: string) => void;
  username: string;
  setUsername: (v: string) => void;
  checked?: { ok: boolean; reason?: string };
  email: string;
  setEmail: (v: string) => void;
  emailSeen: boolean;
  seeEmail: () => void;
  emailIssue: EmailProblem | null;
  role: JoinRole;
  background: string;
  setBackground: (v: string) => void;
  errors: Partial<Record<FieldName, string>>;
}) {
  const id = useId();
  const nameOk = !!name.trim() && !errors.name;
  const userErr =
    errors.username ?? (checked && !checked.ok ? tx(checked.reason ?? '') : undefined);
  const userOk = !userErr && checked?.ok;
  const emailErr = errors.email ?? (emailSeen && emailIssue ? emailMessage(emailIssue) : undefined);
  const emailOk = !emailErr && !emailIssue && emailSeen;
  const list = FOUNDER_CHOICES.map((b) => BACKGROUNDS.find((x) => x.id === b)).filter(
    (b): b is Background => !!b,
  );
  const bg = list.find((b) => b.id === background);
  return (
    <div className="su-fields">
      <div className="su-field">
        <label className="su-label" htmlFor="su-name">
          {t('Your name')}
        </label>
        <div className={`su-in${errors.name ? ' err' : nameOk ? ' ok' : ''}`}>
          <input
            id="su-name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
            aria-invalid={!!errors.name || undefined}
            aria-describedby={errors.name ? 'su-name-err' : undefined}
          />
          {nameOk && (
            <span className="su-in-ic" aria-hidden="true">
              ✓
            </span>
          )}
        </div>
        {errors.name && (
          <p className="su-err" id="su-name-err" role="alert">
            {errors.name}
          </p>
        )}
      </div>

      <div className="su-field">
        <div className="su-label">
          <span id={`${id}-city`}>{t('Your city')}</span>{' '}
          <small>· {t('the skyline changes')}</small>
        </div>
        <div
          className="su-chips"
          role="radiogroup"
          aria-labelledby={`${id}-city`}
          aria-describedby={errors.city ? 'su-city-err' : undefined}
          id="su-city"
          tabIndex={-1}
        >
          {markets.map((m) => (
            <Radio
              key={m.id}
              name={`${id}-city-r`}
              value={m.id}
              checked={city === m.id}
              onPick={() => setCity(m.id)}
              className="su-chip"
            >
              <Flag city={m.id} />
              <span data-market={m.id}>{m.name}</span>
            </Radio>
          ))}
        </div>
        {errors.city && (
          <p className="su-err" id="su-city-err" role="alert">
            {errors.city}
          </p>
        )}
      </div>

      <div className="su-field">
        <label className="su-label" htmlFor="su-username">
          {t('Username')}
        </label>
        <div className={`su-in${userErr ? ' err' : userOk ? ' ok' : ''}`}>
          <span className="su-in-pre" aria-hidden="true">
            @
          </span>
          <input
            id="su-username"
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
            aria-invalid={!!userErr || undefined}
            aria-describedby={`su-username-st su-username-hint${userErr ? ' su-username-err' : ''}`}
          />
          <span className="su-in-ic" id="su-username-st" aria-live="polite">
            {userOk ? `✓ ${t('Available')}` : userErr ? `! ${t('Check')}` : ''}
          </span>
        </div>
        {userErr ? (
          <p className="su-err" id="su-username-err" role="alert">
            {userErr}
          </p>
        ) : null}
        <p className="su-hint" id="su-username-hint">
          {t('Made from your name. Edit any time. Letters, numbers, underscores.')}
        </p>
      </div>

      <div className="su-field">
        <div className="su-label-row">
          <label className="su-label" htmlFor="su-email">
            {t('Email')}
          </label>
          <span className="su-req">({t('required')})</span>
        </div>
        <p className="su-why" id="su-email-why">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect x="3" y="7" width="10" height="8" rx="2" fill="currentColor" />
            <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          {t('So you can log in on any device and never lose your game.')}
        </p>
        <div className={`su-in${emailErr ? ' err' : emailOk ? ' ok' : ''}`}>
          <input
            id="su-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={seeEmail}
            maxLength={254}
            required
            aria-required="true"
            aria-invalid={!!emailErr || undefined}
            aria-describedby={`su-email-why${emailErr ? ' su-email-err' : ''}`}
          />
          <span className="su-in-ic" aria-hidden="true">
            {emailOk ? `✓ ${t('Looks good')}` : emailErr ? `! ${t('Check')}` : ''}
          </span>
        </div>
        {emailErr && (
          <p className="su-err" id="su-email-err" role="alert">
            {emailErr}
          </p>
        )}
      </div>

      {role === 'founder' && (
        <div className="su-field">
          <div className="su-label-row">
            <label className="su-label" htmlFor="su-background">
              {t('Before this you were')}
            </label>
            <span className="su-req">({t('founders')})</span>
          </div>
          <div className="su-in su-select">
            <select
              id="su-background"
              name="background"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              aria-describedby="su-background-hint"
            >
              {list.map((b) => (
                <option key={b.id} value={b.id}>
                  {tx(b.name)} · {tx(b.strengths)}
                </option>
              ))}
            </select>
          </div>
          {bg && (
            <p className="su-hint" id="su-background-hint">
              {t('Gap: {gap}', { gap: tx(bg.gaps) })} · {backgroundModifiers(bg).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
