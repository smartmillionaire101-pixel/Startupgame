/**
 * Founder Journey 6: the guided first session (blueprint §3, §3.1, FR-002).
 *
 * A small coach card above the bottom bar tells a new founder the one thing
 * to do next, with a ring on where to tap. Five steps: the flat (open the
 * phone, check your own balance), the café (meet a contact, pick an idea),
 * the first customer (the sales pipeline), business money (the first
 * payment lands in the company account; pay a small business cost) and
 * what's next (the three objectives).
 *
 * Never a gate: the card covers nothing important, "Skip tutorial" (or Esc
 * while it has focus) ends it at any point, and every step finishes on what
 * the server says happened, so skipping leaves an ordinary, valid game.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { money } from '../format';
import { t } from '../i18n';
import { useView } from '../store';
import { Button } from '../ui';
import { openPhone, useNav } from '../phone/bus';
import { visitPlace } from '../city/goto';
import { businessesOf, isCafe } from '../city/contract';
import { cityViewOf } from '../city/travel';
import { Objectives } from '../city/JourneyPanel';
import type { JourneyGo } from '../city/journey';
import { chapterCopy, journeyOf } from '../city/journey';
import {
  TUTORIAL_STEPS,
  activeStep,
  claimNewPlayer,
  finishTutorial,
  setTutorial,
  skipTutorial,
  useTutorial,
  type TutorialStep,
} from './state';
import { stepFor, tutorialFacts } from './steps';
import { useSpotlight } from './spotlight';
import './tutorial.css';

const IdeaScene = lazy(() => import('./IdeaScene'));

type View = ReturnType<typeof useView>['view'];

/** The café contact: the owner of a café in town (an AI character), or a regular. */
export function cafeContact(view: View): { name: string; cafe: string; id: string | null } {
  const cafe = businessesOf(cityViewOf(view)).find((b) => b.open && isCafe(b.kind));
  return cafe
    ? { name: cafe.owner.name, cafe: cafe.name, id: cafe.id }
    : { name: t('Sam'), cafe: t('the corner café'), id: null };
}

/** Which phone screen is showing (null: the phone is closed). */
function usePhoneApp(): string | null {
  const [app, setApp] = useState<string | null>(null);
  useEffect(() => {
    const check = () => {
      const frame = document.querySelector('.phone[role="dialog"] .phone-frame');
      const next = frame ? (frame.getAttribute('data-phone-app') ?? 'home') : null;
      setApp((a) => (a === next ? a : next));
    };
    check();
    const timer = setInterval(check, 300);
    return () => clearInterval(timer);
  }, []);
  return app;
}

export function TutorialHost() {
  const { view } = useView();
  const id = view.me.id;
  const facts = tutorialFacts(view);
  // A player just created on this browser: start their tutorial.
  useEffect(() => {
    claimNewPlayer(view.me, facts.founded);
    // Once per player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const state = useTutorial(id);
  const step = state?.status === 'active' ? state.step : null;
  // Steps finish on what the server says happened.
  const target = state && step ? stepFor(state, facts) : null;
  useEffect(() => {
    if (step && target && target !== step) setTutorial(id, { step: target });
  }, [id, step, target]);
  const phoneApp = usePhoneApp();
  const [ideaOpen, setIdeaOpen] = useState(false);
  const spot = !step
    ? null
    : step === 'phone'
      ? phoneApp === null
        ? '.topbar-phone'
        : phoneApp === 'home'
          ? '.phone [data-app="bank"]'
          : null
      : step === 'sale'
        ? phoneApp === null
          ? '[data-coach-action]'
          : phoneApp === 'home'
            ? '.phone [data-app="sales"]'
            : null
        : step === 'idea' && !ideaOpen && phoneApp === null
          ? '[data-coach-action]'
          : null;
  useSpotlight(spot);
  if (!step) return null;
  return (
    <>
      {phoneApp === null && !ideaOpen && <CoachCard step={step} onCafe={() => setIdeaOpen(true)} />}
      {ideaOpen && (
        <Suspense fallback={null}>
          <IdeaScene onClose={() => setIdeaOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

function CoachCard({ step, onCafe }: { step: TutorialStep; onCafe: () => void }) {
  const { view } = useView();
  const id = view.me.id;
  const ref = useRef<HTMLElement>(null);
  const n = TUTORIAL_STEPS.indexOf(step) + 1;
  // A new step: move focus to the card so a keyboard or screen reader follows.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [step]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      skipTutorial(id);
    }
  };
  return (
    <aside
      ref={ref}
      className={`coach coach-${step}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="coach-title"
      aria-describedby="coach-text"
      data-tutorial-step={step}
      tabIndex={-1}
      onKeyDown={onKey}
    >
      <div className="coach-top">
        <span className="coach-count">{t('Step {n} of {total}', { n, total: 5 })}</span>
        <button type="button" className="coach-skip" onClick={() => skipTutorial(id)}>
          {t('Skip tutorial')}
        </button>
      </div>
      <StepBody step={step} onCafe={onCafe} />
    </aside>
  );
}

function StepBody({ step, onCafe }: { step: TutorialStep; onCafe: () => void }) {
  const { view, cur, send, busy } = useView();
  const nav = useNav();
  const id = view.me.id;
  const facts = tutorialFacts(view);
  const c = facts.company;
  const contact = useMemo(() => cafeContact(view), [view]);
  const personal = view.accounts.local?.balance ?? 0;
  switch (step) {
    case 'phone':
      return (
        <>
          <h2 id="coach-title" className="coach-title">
            {t('Your flat')}
          </h2>
          <p id="coach-text" className="coach-text">
            {t(
              'This is home. Your phone runs your life here: open it and check your personal balance in the Bank app.',
            )}
          </p>
          <Button size="sm" data-coach-action onClick={() => openPhone({ app: 'home' })}>
            {t('Open my phone')}
          </Button>
        </>
      );
    case 'idea':
      return (
        <>
          <h2 id="coach-title" className="coach-title">
            {t('Coffee with {name}', { name: contact.name })}
          </h2>
          <p id="coach-text" className="coach-text">
            {t(
              '{name}, who runs {cafe}, hears the same problems from customers every day. Meet them at the café: one of these could be your business.',
              { name: contact.name, cafe: contact.cafe },
            )}
          </p>
          <Button size="sm" data-coach-action data-tutorial="cafe" onClick={onCafe}>
            {t('Go to the café')}
          </Button>
        </>
      );
    case 'sale':
      // Founder setup: meetings and demos cost the company money, so fund it first.
      if (c?.setup && c.setup.step !== 'done' && c.cash <= 0)
        return (
          <>
            <h2 id="coach-title" className="coach-title">
              {t('Fund your company')}
            </h2>
            <p id="coach-text" className="coach-text" data-coach-unfunded="">
              {t(
                'Before the first customer: register {company} and put money in. Sales meetings and demos are paid from the business account.',
                { company: c.name },
              )}
            </p>
            <Button
              size="sm"
              data-coach-action
              onClick={() => nav?.go({ kind: 'tab', tab: 'company' })}
            >
              {t('Open Company')}
            </Button>
          </>
        );
      return (
        <>
          <h2 id="coach-title" className="coach-title">
            {t('Your first customer')}
          </h2>
          <p id="coach-text" className="coach-text">
            {t(
              'Ideas are cheap; customers are not. Find a lead in the Sales app and take them from the first call to a signature.',
            )}
          </p>
          <Button size="sm" data-coach-action onClick={() => openPhone({ app: 'sales' })}>
            {t('Open Sales')}
          </Button>
        </>
      );
    case 'payment': {
      const x = c as
        | (typeof c & {
            starterIdea?: { paid: { amount: number } | null } | null;
            expenseCosts?: Record<string, number>;
          })
        | null;
      const paid = x?.starterIdea?.paid ?? null;
      const account = c?.sales?.accounts[0];
      const costs = x?.expenseCosts ?? null;
      return (
        <>
          <h2 id="coach-title" className="coach-title">
            {t('Business money')}
          </h2>
          <p id="coach-text" className="coach-text">
            {c && paid && account
              ? t(
                  '{name} paid {amount} up front. It went into {company}’s business account, not your own pocket.',
                  { name: account.name, amount: money(paid.amount, c.currency), company: c.name },
                )
              : c
                ? t(
                    'When customers pay, the money goes into {company}’s business account, not your own pocket.',
                    { company: c.name },
                  )
                : t('Start a company first: it gets its own business account.')}
          </p>
          <div className="coach-accounts" aria-label={t('Your two accounts')}>
            <div data-account-kind="personal">
              <span className="small muted">{t('Personal (yours)')}</span>
              <strong>{money(personal, cur)}</strong>
            </div>
            {c && (
              <div data-account-kind="business">
                <span className="small muted">
                  {t('Business ({company})', { company: c.name })}
                </span>
                <strong>{money(c.cash, c.currency)}</strong>
              </div>
            )}
          </div>
          {c && costs && (
            <>
              <p className="small">
                {t('Company costs come out of the business account. Pay a small one now:')}
              </p>
              <div className="coach-row">
                {(['cards', 'domain', 'coffee'] as const).map((item) => (
                  <Button
                    key={item}
                    size="sm"
                    variant={item === 'cards' ? 'primary' : 'subtle'}
                    data-expense={item}
                    data-coach-action={item === 'cards' ? true : undefined}
                    disabled={busy || (costs[item] ?? 0) > c.cash}
                    onClick={() =>
                      void send(
                        { type: 'company.expense', companyId: c.id, item },
                        t('Paid {amount} from {company}’s account.', {
                          amount: money(costs[item] ?? 0, c.currency),
                          company: c.name,
                        }),
                      )
                    }
                  >
                    {t('{item} · {amount}', {
                      item: expenseLabel(item),
                      amount: money(costs[item] ?? 0, c.currency),
                    })}
                  </Button>
                ))}
              </div>
            </>
          )}
          {/* Founder setup: a company not yet funded has nothing to pay a cost with. */}
          {c && costs && c.setup && c.cash < Math.min(...Object.values(costs)) && (
            <p className="small" data-coach-unfunded="">
              {t('{company} has no money in it yet: register and fund it on the Company screen.', {
                company: c.name,
              })}
            </p>
          )}
          {(!c || (c.setup && costs && c.cash < Math.min(...Object.values(costs)))) && (
            <Button size="sm" onClick={() => setTutorial(id, { step: 'end' })}>
              {t('Next')}
            </Button>
          )}
        </>
      );
    }
    case 'end': {
      const j = journeyOf(view);
      const ch1 = j?.chapters[0];
      const go = (g: JourneyGo) => {
        finishTutorial(id);
        if (g.kind === 'place') visitPlace(g.place);
        else if (g.kind === 'tab')
          nav?.go({ kind: 'tab', tab: g.tab === 'company' || g.tab === 'me' ? g.tab : 'money' });
        else if (g.kind === 'app') openPhone({ app: g.app as 'sales' });
      };
      return (
        <>
          <h2 id="coach-title" className="coach-title">
            {t('What’s next')}
          </h2>
          <p id="coach-text" className="coach-text">
            {t(
              'That’s the basics. Three things to do next: your main goal, a time-sensitive opportunity and something for you.',
            )}
          </p>
          {ch1 && (
            <p className="small muted" data-coach-chapter>
              {t('Chapter 1 · {title}: {done} of {need} steps done', {
                title: chapterCopy(ch1.id).title,
                done: ch1.steps.filter((s) => s.done && !s.optional).length,
                need: ch1.need,
              })}
            </p>
          )}
          <p className="small muted" data-coach-stages>
            {t(
              'From here your Company screen guides you stage by stage: Idea, First customers, Product fit, Seed, Growth and Series A, each with a checklist. Your mentor at the Hub explains each one.',
            )}
          </p>
          {j && <Objectives j={j} onGo={go} />}
          <Button size="sm" data-coach-action onClick={() => finishTutorial(id)}>
            {t('Finish tutorial')}
          </Button>
        </>
      );
    }
  }
}

const expenseLabel = (item: 'cards' | 'domain' | 'coffee') =>
  ({
    cards: t('Business cards'),
    domain: t('A website domain'),
    coffee: t('Coffee for a customer'),
  })[item];

/** A line of coaching inside the phone (its home screen and the Bank app). */
export function PhoneTip({ where }: { where: 'home' | 'bank' }) {
  const { view } = useView();
  useTutorial(view.me.id);
  const step = activeStep(view.me.id);
  const text =
    where === 'home'
      ? step === 'phone'
        ? t('Tap Bank to see your own money.')
        : step === 'sale'
          ? t('Tap Sales to find your first customer.')
          : null
      : step === 'phone' || step === 'idea' || step === 'payment'
        ? t(
            'This is your personal account: your own savings and spending. Your company gets a separate business account.',
          )
        : null;
  if (!text) return null;
  return (
    <p className="coach-tip" role="note" data-coach-tip={where}>
      <span aria-hidden="true">💡 </span>
      {text}
    </p>
  );
}
