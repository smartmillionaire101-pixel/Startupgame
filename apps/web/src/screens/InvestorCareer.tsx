/**
 * The investor career (investor blueprint §2–3, §5.3): the ladder from angel
 * to institution with each rung's requirements and unlocks, invitations up
 * the ladder, the first session (investable money → a café shortlist → a
 * first call → a small SAFE → the portfolio → the ladder) and three prompts.
 * The engine derives everything (`view.investorCareer`); null hides it.
 */
import type { PlayerView } from '@runway/engine';
import { useState } from 'react';
import { money, pct } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Pill, Segmented, Stat } from '../ui';
import { useJourneyGo } from '../city/journeyGo';
import { stageLabel } from './common';
import './investor.css';

export type Career = NonNullable<PlayerView['investorCareer']>;
type Rung = Career['rungs'][number];
type Req = Rung['requirements'][number];
type Tutorial = NonNullable<Career['tutorial']>;

/** The career, or null (other roles, worlds before the release, an older server). */
export const careerOf = (view: PlayerView): Career | null =>
  (view as { investorCareer?: Career | null }).investorCareer ?? null;

export function rungTitle(id: string): string {
  switch (id) {
    case 'angel':
      return t('Angel');
    case 'syndicate':
      return t('Syndicate lead');
    case 'emerging':
      return t('Emerging manager');
    case 'manager':
      return t('Fund manager');
    case 'established':
      return t('Established GP');
    case 'firm':
      return t('Firm founder');
    case 'allocator':
      return t('Allocator');
    default:
      return t('Institution leader');
  }
}

function rungUnlocks(n: number): string {
  switch (n) {
    case 1:
      return t('Angel cheques, deal flow, diligence and the stock market.');
    case 2:
      return t('Lead syndicates: bring backers into your deals and earn deal-by-deal carry.');
    case 3:
      return t('Raise Fund I from AI and player LPs.');
    case 4:
      return t('A management fee every month, reserves, an investment committee and LP letters.');
    case 5:
      return t('Raise Fund II and strategy funds on the cash you returned.');
    case 6:
      return t('A firm: partners and associates, a carry pool and several funds at once.');
    case 7:
      return t('Commit to other funds as an LP, a family office and a fund of funds.');
    default:
      return t('Run an institution’s balance sheet: a senior salary and a mandate.');
  }
}

function reqLabel(id: string): string {
  switch (id) {
    case 'profile':
      return t('Be an investor');
    case 'deals':
      return t('Deals (syndicates count)');
    case 'stars':
      return t('Investor stars');
    case 'lp-score':
      return t('LP panel score');
    case 'fund':
      return t('Close Fund I');
    case 'dpi':
      return t('Cash returned (DPI)');
    case 'reups':
      return t('LPs who would re-up');
    case 'funds':
      return t('Funds raised');
    case 'hires':
      return t('Partners or associates hired');
    case 'liquid':
      return t('Liquid wealth (60 months of living costs)');
    default:
      return t('A senior role at a DFI or bank');
  }
}

function ReqLine({ r }: { r: Req }) {
  const value = (v: number) =>
    r.currency ? money(v, r.currency) : Number.isInteger(v) ? String(v) : v.toFixed(2);
  return (
    <li className={`career-req${r.done ? ' done' : ''}`}>
      <span>
        {r.done ? '✓ ' : ''}
        {reqLabel(r.id)}
      </span>
      <span className="small muted">
        {value(r.have)} / {value(r.need)}
      </span>
      <span className="career-track" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (r.have / Math.max(r.need, 0.0001)) * 100)}%` }} />
      </span>
    </li>
  );
}

/** The ladder as a vertical path: where you are, what's next and what it takes. */
export function CareerLadder({ compact }: { compact?: boolean }) {
  const { view, send } = useView();
  const career = careerOf(view);
  const [all, setAll] = useState(!compact);
  if (!career) return null;
  const shown = all
    ? career.rungs
    : career.rungs.filter((r) => r.n === career.current || r.n === career.next);
  return (
    <Card
      title={t('Your investor career')}
      sub={t('Angel is the first rung, not the last')}
      className="career-card"
      action={
        compact ? (
          <Button variant="ghost" onClick={() => setAll((x) => !x)}>
            {all ? t('Less') : t('All rungs')}
          </Button>
        ) : undefined
      }
    >
      {career.invitations.map((inv) => (
        <div key={inv.id} className="career-invite" data-invitation={inv.kind}>
          <p>
            {inv.kind === 'co-lead'
              ? t('{name} would like to co-lead your first syndicate: they’ll match your cheque.', {
                  name: inv.fromName,
                })
              : t('{name} offers to anchor your Fund I with {amount}.', {
                  name: inv.fromName,
                  amount: money(inv.amount, inv.currency),
                })}
          </p>
          <div className="row">
            <Button
              onClick={() =>
                void send(
                  { type: 'career.invitation', invitationId: inv.id, accept: true },
                  (r: { message: string }) => tx(r.message),
                )
              }
            >
              {t('Accept')}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void send(
                  { type: 'career.invitation', invitationId: inv.id, accept: false },
                  t('Declined.'),
                )
              }
            >
              {t('Decline')}
            </Button>
          </div>
        </div>
      ))}
      <ol className="career-ladder">
        {shown.map((r) => (
          <li key={r.n} className={`career-rung career-${r.status}`} data-rung={r.id}>
            <div className="career-rung-head">
              <span className="career-dot" aria-hidden="true">
                {r.status === 'reached' ? '✓' : r.n}
              </span>
              <strong>{rungTitle(r.id)}</strong>
              {r.n === career.current && <Pill tone="good">{t('You are here')}</Pill>}
              {r.status === 'next' && <Pill tone="info">{t('Next')}</Pill>}
              {career.pinned === r.n && <Pill>{t('Pinned')}</Pill>}
            </div>
            <p className="small muted">{rungUnlocks(r.n)}</p>
            {r.status !== 'reached' && (
              <ul className="career-reqs">
                {r.requirements.map((q) => (
                  <ReqLine key={q.id} r={q} />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {!compact && (
        <div className="kpis">
          <Stat
            label={t('Largest angel cheque')}
            value={money(career.ceiling.maxCheque, career.ceiling.currency)}
            hint={t('{share} of liquid net worth', { share: pct(career.ceiling.share, 0) })}
          />
          <Stat
            label={t('Investable')}
            value={money(career.ceiling.investable, career.ceiling.currency)}
            hint={t('Savings less six months of living costs')}
          />
        </div>
      )}
      {!compact && (
        <p className="small muted">
          {t('{stages} rounds need a lead: a syndicate or a fund.', {
            stages: career.ceiling.leadStages.map(stageLabel).join(', '),
          })}{' '}
          {career.tracks.lp
            ? t('You can commit to other funds as an LP.')
            : t('LP commitments open at {amount} of liquid wealth.', {
                amount: money(career.tracks.lpNeed, career.ceiling.currency),
              })}
        </p>
      )}
    </Card>
  );
}

function promptText(p: { id: string; label: string; name?: string }): string {
  const [kind, a, b] = p.id.split('.');
  if (kind === 'tutorial') return t('Finish your first session');
  if (kind === 'rung' && a) {
    const title = rungTitle(
      ['', 'angel', 'syndicate', 'emerging', 'manager', 'established', 'firm'][Number(a)] ?? '',
    );
    return t('Become a {rung}: {step}', {
      rung: title.toLowerCase(),
      step: b && b !== 'done' ? reqLabel(b).toLowerCase() : t('almost there'),
    });
  }
  if (kind === 'event') return t('Go to {name}', { name: p.name ?? '' });
  if (kind === 'comp') return t('Judge {name}', { name: p.name ?? '' });
  if (kind === 'dealflow') return t('See who is raising this month');
  if (kind === 'dinner') return t('Dinner with {name}', { name: p.name ?? '' });
  if (kind === 'coffee') return t('Coffee in the Investor Quarter');
  return tx(p.label);
}

/** Main, opportunity and personal: always something meaningful to do (§1.2, §10.2). */
export function InvestorPrompts() {
  const { view } = useView();
  const career = careerOf(view);
  const go = useJourneyGo();
  if (!career) return null;
  const list = [
    { kind: t('Main'), p: career.prompts.main },
    { kind: t('Opportunity'), p: career.prompts.opportunity },
    { kind: t('Personal'), p: career.prompts.personal },
  ].filter((x) => x.p);
  return (
    <Card title={t('What to do now')} className="career-prompts">
      <ul className="list">
        {list.map(({ kind, p }) => (
          <li key={p!.id} className="row">
            <span className="small muted">{kind}</span> <span>{promptText(p!)}</span>
            {p!.go && (
              <Button variant="ghost" onClick={() => go(p!.go!)}>
                {t('Go')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function stepTitle(id: string): string {
  switch (id) {
    case 'profile':
      return t('Your profile and thesis');
    case 'investable':
      return t('What you can invest');
    case 'shortlist':
      return t('Three startups at the café');
    case 'first-call':
      return t('A first call');
    case 'term-sheet':
      return t('A small SAFE');
    case 'portfolio':
      return t('Your portfolio');
    default:
      return t('The ladder');
  }
}

/** The first session (§3): one concept at a time, ending with a real position. */
export function InvestorFirstSession() {
  const { view, send } = useView();
  const career = careerOf(view);
  const tut: Tutorial | null = career?.tutorial ?? null;
  if (!career || !tut || tut.done || !tut.step) return null;
  const pick = tut.picks.find((x) => x.companyId === tut.shortlist) ?? null;
  const next = (ok: string) => void send({ type: 'investor.tutorial', action: 'next' }, ok);
  const n = tut.steps.findIndex((s) => s.id === tut.step) + 1;
  return (
    <Card
      title={t('First session · step {n} of {total}', { n, total: tut.steps.length })}
      sub={stepTitle(tut.step)}
      className="career-tutorial"
      action={
        <Button
          variant="ghost"
          onClick={() =>
            void send(
              { type: 'investor.tutorial', action: 'skip' },
              t('Skipped. Your profile and thesis are saved.'),
            )
          }
        >
          {t('Skip')}
        </Button>
      }
    >
      <ol className="career-steps" aria-label={t('Steps')}>
        {tut.steps.map((s) => (
          <li key={s.id} className={s.done ? 'done' : s.id === tut.step ? 'now' : ''}>
            {stepTitle(s.id)}
          </li>
        ))}
      </ol>
      {tut.step === 'investable' && (
        <>
          <div className="kpis">
            <Stat label={t('Savings')} value={money(tut.liquid, tut.currency)} tone="money" />
            <Stat
              label={t('Kept for living costs')}
              value={money(tut.livingCost * tut.reserveMonths, tut.currency)}
              hint={t('{n} months: never invest the rent', { n: tut.reserveMonths })}
            />
            <Stat
              label={t('Investable')}
              value={<span data-investable>{money(tut.investable, tut.currency)}</span>}
            />
            <Stat
              label={t('Suggested first cheque')}
              value={money(tut.chequeCap, tut.currency)}
              hint={t('At most a tenth of what you can invest')}
            />
          </div>
          <Button onClick={() => next(t('Now meet some founders.'))}>{t('Got it')}</Button>
        </>
      )}
      {tut.step === 'shortlist' && (
        <>
          <p className="small">
            {t(
              'An angel at the café shows you three startups looking for money. Pick one to look at closely.',
            )}
          </p>
          {tut.picks.map((c) => (
            <div key={c.companyId} className="career-pick" data-pick={c.companyId}>
              <div>
                <strong>{c.name}</strong>{' '}
                {c.fits && <Pill tone="good">{t('Fits your thesis')}</Pill>}
                <p className="small muted">
                  {tx(c.idea)} · {stageLabel(c.stage)} · {c.stars.toFixed(1)}★
                </p>
              </div>
              <Button
                variant="subtle"
                onClick={() =>
                  void send(
                    { type: 'investor.tutorial', action: 'shortlist', companyId: c.companyId },
                    t('Shortlisted {name}.', { name: c.name }),
                  )
                }
              >
                {t('Shortlist')}
              </Button>
            </div>
          ))}
        </>
      )}
      {tut.step === 'first-call' && pick && (
        <>
          <p className="small">
            {t(
              'A first call costs 4 hours and unlocks revenue, customers and burn. Information is earned, not given.',
            )}
          </p>
          {tut.recovery && <p className="warn small">{tx(tut.recovery.message)}</p>}
          <Button
            onClick={() =>
              void send(
                { type: 'invest.diligence', companyId: pick.companyId, depth: 1 },
                (r: { message: string }) => tx(r.message),
              )
            }
          >
            {t('First call with {name} (4h)', { name: pick.name })}
          </Button>
        </>
      )}
      {tut.step === 'term-sheet' && pick && (
        <>
          <p className="small">
            {t(
              'A SAFE turns into shares at the next priced round, at most at its valuation cap. Your ownership is about the amount divided by the cap.',
            )}
          </p>
          <div className="kpis">
            <Stat label={t('Amount')} value={money(pick.suggestedAmount, pick.currency)} />
            <Stat label={t('Valuation cap')} value={money(pick.suggestedCap, pick.currency)} />
            <Stat
              label={t('About')}
              value={pct(pick.suggestedAmount / Math.max(1, pick.suggestedCap), 1)}
              hint={t('of the company')}
            />
          </div>
          {tut.recovery && <p className="warn small">{tx(tut.recovery.message)}</p>}
          <div className="row">
            <Button
              onClick={() =>
                void send(
                  {
                    type: 'invest.propose',
                    companyId: pick.companyId,
                    instrument: 'safe',
                    amount: pick.suggestedAmount,
                    valuation: pick.suggestedCap,
                    proRata: true,
                    boardSeat: false,
                    vetoOnSale: false,
                  },
                  (x: { status: string }) =>
                    x.status === 'accepted'
                      ? t('Accepted. You’re in.')
                      : x.status === 'declined'
                        ? t('They walked away.')
                        : t('Term sheet sent.'),
                )
              }
            >
              {t('Send the SAFE (2h)')}
            </Button>
            {tut.recovery?.second && (
              <Button
                variant="ghost"
                onClick={() =>
                  void send(
                    {
                      type: 'investor.tutorial',
                      action: 'shortlist',
                      companyId: tut.recovery!.second!,
                    },
                    t('Picked the second startup.'),
                  )
                }
              >
                {t('Pick the second startup')}
              </Button>
            )}
          </div>
        </>
      )}
      {tut.step === 'portfolio' && (
        <>
          <p className="small">
            {t(
              'Your first position is below: cost, ownership and the mark. The mark is paper, not cash: only a sale, a secondary or an IPO pays you.',
            )}
          </p>
          <Button onClick={() => next(t('One more thing: the ladder.'))}>{t('Got it')}</Button>
        </>
      )}
      {tut.step === 'ladder' && (
        <>
          <p className="small">
            {t(
              'Angel is the first rung. Lead a syndicate next, then raise Fund I. The stock market and LP commitments are other places for your money.',
            )}
          </p>
          <CareerLadder compact />
          <Button onClick={() => next(t('First session done. Next rung pinned.'))}>
            {t('Pin my next rung')}
          </Button>
        </>
      )}
    </Card>
  );
}

/** The Portfolio tab's sections; later rungs add theirs as they open. */
export type InvestorSection = 'overview' | 'markets' | 'syndicates';

export function InvestorSections({
  tab,
  onTab,
}: {
  tab: InvestorSection;
  onTab: (t: InvestorSection) => void;
}) {
  const { view } = useView();
  const career = careerOf(view);
  if (!career) return null;
  const options: { value: InvestorSection; label: string }[] = [
    { value: 'overview', label: t('Overview') },
    { value: 'markets', label: t('Markets') },
    { value: 'syndicates', label: t('Syndicates') },
  ];
  return (
    <div className="inv-tabs">
      <Segmented label={t('Portfolio sections')} value={tab} onChange={onTab} options={options} />
    </div>
  );
}
