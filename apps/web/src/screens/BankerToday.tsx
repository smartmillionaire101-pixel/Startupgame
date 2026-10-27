/**
 * Today for a banker (player feedback: "Today shows start a company. Should
 * be to start a bank. Or if not a new player it should tell me about the
 * bank."):
 *
 * - No bank yet, or one on its way: "Start your bank", the steps from a name
 *   to the licence, the regulator's review ("Review: day N of 30") and its
 *   checklist, and the one next step (with the advisory desk while you wait).
 * - A licensed bank: deposits, loans, the capital ratio (a warning near the
 *   minimum), last month's profit, what is waiting for you (loan requests,
 *   advisory mandates, late borrowers) and the next step.
 *
 * Everything comes from the view (`view.bank`, `view.banker`, `view.bankWork`,
 * `view.deals`); the work itself stays on the Bank tab.
 */
import './bankers.css';
import '../city/scenes.css';
import { money, pct, stars } from '../format';
import { t } from '../i18n';
import { useNav } from '../phone/bus';
import { useView } from '../store';
import { Card, Pill, Stat } from '../ui';
import { FoundBank } from './Bank';
import { bankerOf, missingLabel } from './BankLicence';

/** One row to tap: where it goes, what it says. */
interface Step {
  id: string;
  icon: string;
  label: string;
  why: string;
  go: () => void;
  count?: number;
  tone?: 'warn' | 'bad';
}

/** Rows like "What to do now": an icon, a line, why, and a chevron. */
function StepList({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <ul className="whatnow-list" aria-label={label}>
      {steps.map((s) => (
        <li key={s.id}>
          <button type="button" className="whatnow-btn" data-step={s.id} onClick={s.go}>
            <span className="tray-icon" aria-hidden="true">
              {s.icon}
            </span>
            <span>
              <b>{s.label}</b>
              <span className="whatnow-why">{s.why}</span>
            </span>
            {s.count !== undefined && (
              <Pill tone={s.tone === 'bad' ? 'bad' : s.tone === 'warn' ? 'warn' : undefined}>
                {s.count}
              </Pill>
            )}
            <span className="whatnow-go" aria-hidden="true">
              ›
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Today's top for a banker: start the bank, or how the bank is doing. */
export function BankerToday() {
  const { view } = useView();
  return view.bank?.status === 'licensed' ? <LicensedBankToday /> : <StartYourBank />;
}

// ---------------------------------------------------------------- start your bank

function StartYourBank() {
  const { view } = useView();
  const nav = useNav();
  const banker = bankerOf(view);
  const nb = banker?.bank ?? null;
  const own = view.bank && !['failed', 'rejected'].includes(view.bank.status) ? view.bank : null;
  const lic = nb?.licence ?? null;
  const applying = own?.status === 'applying' || nb?.status === 'applying';
  const tut = banker?.tutorial;
  const tutDone = (id: string) => !!tut?.steps.find((s) => s.id === id)?.done;
  const toBank = () => nav?.go({ kind: 'tab', tab: 'bank' });
  const toCentralBank = () =>
    banker && nav?.go({ kind: 'place', place: `civic:${banker.centralBank}` });

  const stages = [
    { id: 'name', label: t('Name & licence type'), done: !!own || !!nb },
    { id: 'shareholders', label: t('Shareholders'), done: applying || tutDone('negotiate') },
    { id: 'sign', label: t('Sign & file'), done: applying },
    {
      id: 'interview',
      label: t('Interview'),
      done: !!lic && !lic.missing.includes('interview'),
    },
    { id: 'checklist', label: t('Checklist'), done: !!lic && lic.missing.length === 0 },
    { id: 'licence', label: t('Licence'), done: false },
  ];
  const now = stages.find((s) => !s.done)?.id;
  const checklist = lic
    ? [
        'interview',
        'plan',
        'hire.ceo',
        'hire.cro',
        'hire.compliance',
        'hire.aml',
        'system',
        'branch',
      ].map((id) => ({ id, done: !lic.missing.includes(id) }))
    : [];
  const done = checklist.filter((c) => c.done).length;

  // The one next step.
  const next: Step | null = !own
    ? null
    : nb?.status === 'forming'
      ? {
          id: 'negotiate',
          icon: '🤝',
          label: t('Negotiate with the shareholders'),
          why: t('Compare their offers on the Bank tab, then sign and file'),
          go: toBank,
        }
      : lic && lic.missing.includes('interview')
        ? {
            id: 'interview',
            icon: '🏛',
            label: t('Go to the Central Bank'),
            why: t('The fit-and-proper interview: capital, risk, money laundering, governance'),
            go: toCentralBank,
          }
        : lic && lic.missing.length
          ? {
              id: lic.missing[0]!,
              icon: '📋',
              label: missingLabel(lic.missing[0]!),
              why: t('Next on the licence checklist, on the Bank tab'),
              go: toBank,
            }
          : {
              id: 'wait',
              icon: '⏳',
              label: t('Wait for the Central Bank’s decision'),
              why: lic
                ? t('It decides at the end of month {month}', { month: lic.decisionMonth })
                : t('It decides at the end of month {month}', { month: own.licenceDueMonth }),
              go: toBank,
            };
  const advisory = !!view.bankWork?.banker;

  return (
    <>
      <Card
        title={
          <>
            <span aria-hidden="true">🏦</span> {t('Start your bank')}
          </>
        }
        sub={own ? own.name : undefined}
        className="banker-today"
      >
        <ol className="banker-stages" aria-label={t('Steps to your licence')}>
          {stages.map((s) => (
            <li
              key={s.id}
              data-stage={s.id}
              className={s.done ? 'done' : s.id === now ? 'now' : ''}
              aria-current={s.id === now ? 'step' : undefined}
            >
              {s.done && <span aria-hidden="true">✓ </span>}
              {s.label}
            </li>
          ))}
        </ol>
        {lic ? (
          <>
            <p className="licence-day" data-review-day={lic.day}>
              {t('Review: day {day} of {total}', { day: lic.day, total: lic.reviewDays })}
            </p>
            <div className="licence-bar" aria-hidden="true">
              <span style={{ width: `${Math.round((100 * lic.day) / lic.reviewDays)}%` }} />
            </div>
            <p className="small muted">
              {t(
                'The Central Bank decides at the end of month {month}. Finish the checklist first or the review starts again.',
                { month: lic.decisionMonth },
              )}
            </p>
            <ul className="licence-checklist" aria-label={t('Checklist')}>
              {checklist.map((c) => (
                <li key={c.id} className={c.done ? 'done' : ''} data-check={c.id}>
                  <span aria-hidden="true">{c.done ? '✓' : '○'}</span> {missingLabel(c.id)}
                </li>
              ))}
            </ul>
            <p className="small">
              <b>{t('{done} of {total} done', { done, total: checklist.length })}</b>
            </p>
          </>
        ) : own?.status === 'applying' ? (
          <p className="small">
            {t(
              'The central bank decides in month {month}. It needs at least {min} of capital; you have {have}.',
              {
                month: own.licenceDueMonth,
                min: money(own.minCapital, view.market.currency),
                have: money(own.figures.equity, view.market.currency),
              },
            )}
          </p>
        ) : nb?.status === 'forming' ? (
          <p className="small muted">
            {t(
              'Investor groups have made their offers: compare them, negotiate, then sign and file for your licence.',
            )}
          </p>
        ) : (
          <p className="small muted">
            {t(
              'Name your bank, pick a licence and put in some of your own money. Investor groups offer the rest, then the Central Bank reviews your application.',
            )}
          </p>
        )}
      </Card>
      {!own && <FoundBank />}
      {next && (
        <Card title={t('Next step')}>
          <StepList steps={[next]} label={t('Next step')} />
        </Card>
      )}
      {own && advisory && (
        <Card title={t('While you wait')}>
          <StepList
            label={t('While you wait')}
            steps={[
              {
                id: 'advisory',
                icon: '💼',
                label: t('The advisory desk is open now'),
                why: t('Earn fees before the bank opens'),
                go: toBank,
              },
            ]}
          />
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------- a licensed bank

/** Within two points of the minimum: "capital is thin". */
const THIN_PP = 0.02;

function LicensedBankToday() {
  const { view, cur } = useView();
  const nav = useNav();
  const b = view.bank!;
  const f = b.figures;
  const min = b.minCapitalRatio;
  const below = f.capitalRatio < min;
  const thin = !below && f.capitalRatio < min + THIN_PP;
  const toBank = () => nav?.go({ kind: 'tab', tab: 'bank' });

  const requests = view.deals.filter(
    (d) =>
      d.status === 'open' && d.counterparty.kind === 'playerbank' && d.counterparty.id === b.id,
  );
  const asked = requests.reduce(
    (a, d) => a + ('amount' in d.terms ? (d.terms.amount as number) : 0),
    0,
  );
  const mandates = view.bankWork?.banker ? view.bankWork.active : [];
  const late = b.loanBook.filter((l) => (l.missed ?? 0) > 0);
  const lateSum = late.reduce((a, l) => a + l.outstanding, 0);
  const lateShare = f.loans > 0 ? lateSum / f.loans : 0;
  const net = b.lastMonth.net;

  const waiting: Step[] = [
    ...(requests.length
      ? [
          {
            id: 'requests',
            icon: '📝',
            label:
              requests.length === 1
                ? t('1 loan request')
                : t('{n} loan requests', { n: requests.length }),
            why: t('{amount} in total', { amount: money(asked, cur) }),
            count: requests.length,
            tone: 'warn' as const,
            go: toBank,
          },
        ]
      : []),
    ...(mandates.length
      ? [
          {
            id: 'mandates',
            icon: '💼',
            label:
              mandates.length === 1
                ? t('1 advisory mandate')
                : t('{n} advisory mandates', { n: mandates.length }),
            why: mandates.map((m) => m.client.name).join(' · '),
            count: mandates.length,
            go: toBank,
          },
        ]
      : []),
    ...(late.length
      ? [
          {
            id: 'late',
            icon: '📉',
            label:
              late.length === 1
                ? t('1 late borrower')
                : t('{n} late borrowers', { n: late.length }),
            why: t('{amount} · call or restructure', { amount: money(lateSum, cur) }),
            count: late.length,
            tone: 'bad' as const,
            go: toBank,
          },
        ]
      : []),
  ];

  const next: Step =
    below || thin
      ? {
          id: 'capital',
          icon: '🏦',
          label: t('Bring your capital ratio up'),
          why: t('Lend less or keep profit in the bank until it is well above {min}', {
            min: pct(min),
          }),
          go: toBank,
        }
      : requests.length
        ? {
            id: 'requests',
            icon: '📝',
            label: t('Answer the loan requests'),
            why: t('Borrowers are waiting for a yes or a no'),
            go: toBank,
          }
        : late.length
          ? {
              id: 'late',
              icon: '📉',
              label: t('Chase your late borrowers'),
              why: t('Two missed payments in a row is a default'),
              go: toBank,
            }
          : mandates.length
            ? {
                id: 'mandates',
                icon: '💼',
                label: t('Work on your mandates'),
                why: t('Each one you finish earns a fee'),
                go: toBank,
              }
            : {
                id: 'pricing',
                icon: '📈',
                label: t('Win more depositors'),
                why: t('A better savings rate brings customers, and money to lend'),
                go: toBank,
              };

  return (
    <>
      <div className="kpis" data-banker-today="licensed">
        <Stat
          icon="wallet"
          label={t('Deposits')}
          value={money(f.deposits, cur)}
          hint={t('{n} customers', { n: f.customers })}
        />
        <Stat
          icon="portfolio"
          label={t('Loans')}
          value={money(f.loans, cur)}
          hint={late.length ? t('{pct} late', { pct: pct(lateShare, 1) }) : t('None late')}
          tone={late.length ? 'warn' : undefined}
        />
        <Stat
          icon="spark"
          label={t('Capital ratio')}
          value={pct(f.capitalRatio, 1)}
          hint={t('Minimum {pct}', { pct: pct(min) })}
          tone={below ? 'bad' : thin ? 'warn' : 'good'}
        />
        <Stat
          icon="money"
          label={t('Profit')}
          value={money(net, cur)}
          hint={t('last month')}
          tone={net < 0 ? 'bad' : net > 0 ? 'good' : undefined}
        />
      </div>
      {(below || thin) && (
        <Card
          tone={below ? 'bad' : 'warn'}
          title={below ? t('Capital is below the minimum') : t('Capital is thin')}
          className="capital-thin"
        >
          <p className="small">
            {below
              ? t(
                  '{ratio} is under the {min} minimum: the Central Bank stops you lending until it is back up.',
                  { ratio: pct(f.capitalRatio, 1), min: pct(min) },
                )
              : t(
                  '{ratio} is close to the {min} minimum. A few more big loans and the Central Bank stops you lending.',
                  { ratio: pct(f.capitalRatio, 1), min: pct(min) },
                )}
          </p>
          <div className="capital-meter" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (100 * f.capitalRatio) / (2 * min))}%` }} />
            <i style={{ left: '50%' }} />
          </div>
          <div className="spread small muted">
            <span>0%</span>
            <span>{t('{pct} min', { pct: pct(min) })}</span>
            <span>{pct(2 * min)}</span>
          </div>
        </Card>
      )}
      {waiting.length > 0 && (
        <Card title={t('Waiting for you')}>
          <StepList steps={waiting} label={t('Waiting for you')} />
        </Card>
      )}
      <Card title={t('Next step')}>
        <StepList steps={[next]} label={t('Next step')} />
      </Card>
      <Card
        title={b.name}
        action={<Pill tone="good">{t('Licensed · {stars}', { stars: stars(b.stars) })}</Pill>}
      >
        <ul className="list small">
          <li className="spread">
            <span>{t('Customers')}</span>
            <b>{f.customers.toLocaleString('en-GB')}</b>
          </li>
          <li className="spread">
            <span>{t('Lending rate / savings rate')}</span>
            <b>
              {(view.market.baseRateBps / 100 + b.policy.loanSpreadPp).toFixed(1)}% /{' '}
              {(b.policy.depositRateBps / 100).toFixed(1)}%
            </b>
          </li>
          <li className="spread">
            <span>{t('Can lend now')}</span>
            <b>{money(f.lendingRoom, cur)}</b>
          </li>
        </ul>
      </Card>
    </>
  );
}
