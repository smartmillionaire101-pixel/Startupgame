/**
 * Chapter 3, "The Fundraising Game" (blueprint §2.1, §6.6, §7.2–7.4):
 *  - FundingChooser: every way to fund the company side by side, in plain
 *    words, with whether you can use it right now and a Go button.
 *  - FriendsRoundCard: open, fill (friends, AI angels), close or cancel a
 *    Friends & Family round on SAFE terms.
 *  - FriendsBacking: back someone else's round, whatever your role.
 *  - FounderMoney / BalanceSheet: founder money as equity or a loan, the
 *    business reserve, and what the company owns and owes.
 *  - RunwayExplainer: runway and burn in one or two sentences (FR-012).
 */
import { useState } from 'react';
import { amountInput, money, parseAmount, pct } from '../format';
import { t, tx } from '../i18n';
import { openPhone, useNav } from '../phone/bus';
import { useView, type Company } from '../store';
import { Button, Card, Confirm, Empty, Field, Pill, Segmented } from '../ui';

type Finance = Company['founderFinance'];

const monthsText = (n: number) =>
  n < 1
    ? t('less than a month')
    : n < 2
      ? t('about 1 month')
      : t('{n} months', { n: Math.floor(n) });

/** "At this spending you have 7 months of cash." (§7.4: never a misleading number at zero burn). */
export function RunwayExplainer({ c }: { c: Company }) {
  const f: Finance = c.founderFinance;
  const cur = c.currency;
  let lines: string[];
  if (f.cashFlowPositive)
    lines = [
      c.monthlyRevenue > 0
        ? t('You earn at least as much as you spend each month: cash-flow positive.')
        : t('Not losing money: there are no monthly costs yet.'),
    ];
  else {
    lines = [
      t('At this spending you have {months} of cash.', { months: monthsText(f.runwayMonths ?? 0) }),
      t('You spend {amount} more than you earn each month.', { amount: money(f.netBurn, cur) }),
    ];
    if (f.reserve > 0)
      lines.push(
        t('Counting your reserve of {amount}, that’s {months}.', {
          amount: money(f.reserve, cur),
          months: monthsText(f.runwayWithReserve ?? 0),
        }),
      );
  }
  return (
    <Card title={t('How long your money lasts')}>
      <div aria-label={t('Money lasts explainer')}>
        {lines.map((l) => (
          <p key={l} className="item-title">
            {l}
          </p>
        ))}
      </div>
      <details className="small muted">
        <summary>{t('What’s this?')}</summary>
        {t(
          'How long your money lasts (investors call it runway) is your available cash divided by what you lose each month (costs minus revenue). Investment and loans add cash, but they are not revenue.',
        )}
      </details>
    </Card>
  );
}

// ---------------------------------------------------------------- funding chooser

interface Option {
  id: string;
  title: string;
  what: string;
  range: string;
  cost: string;
  time: string;
  ok: boolean;
  reason: string;
  go: () => void;
  goLabel: string;
}

export function FundingChooser({
  c,
  onTab,
}: {
  c: Company;
  /** Switch the Money screen's tab (the Raise tab holds investors and the bank loan). */
  onTab: (tab: 'raise') => void;
}) {
  const { view, send } = useView();
  const nav = useNav();
  const m = view.market;
  const cur = c.currency;
  const range = (lo: number, hi: number) =>
    lo === hi ? money(lo, cur) : `${money(lo, cur)}–${money(hi, cur)}`;
  const banned = c.bannedFromRaising;
  const early = c.nextStage === 'pre-seed' || c.nextStage === 'seed';
  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const angels = m.angels;
  const angelChecks = angels.map((a) => a.check);
  const vcs = m.funds.filter(
    (f) =>
      f.ai &&
      !f.angel &&
      f.market === m.id &&
      f.stages.includes(c.nextStage) &&
      (f.sectors === 'any' || f.sectors.includes(c.industry)),
  );
  const companyLoans = m.lenders.flatMap((l) =>
    l.products.filter((p) => p.borrower === 'company').map((p) => ({ l, p })),
  );
  const okLoan = companyLoans.filter((x) => x.p.you.eligible);
  const grants = m.devPartners.flatMap((d) =>
    d.programs.map((p) => ({ d, p, you: p.you.find((y) => y.companyId === c.id) })),
  );
  const okGrant = grants.find((g) => g.you?.status === 'eligible');
  const accs = m.accelerators.map((a) => ({ a, you: a.you.find((y) => y.companyId === c.id) }));
  const okAcc = accs.find((x) => x.you?.status === 'eligible');
  const comps = m.competitions.list.filter((x) => x.status === 'open');
  const okComp = comps.find((x) => x.you.canEnter);
  const bootstrapped = view.journey?.bootstrap !== null && view.journey?.bootstrap !== undefined;
  const ffOpen = view.friendsRounds.find((r) => r.companyId === c.id && r.status === 'open');

  const options: Option[] = [
    {
      id: 'bootstrap',
      title: t('Bootstrap'),
      what: t('Grow on your own savings and what customers pay. Slower, but you keep it all.'),
      range: t('Your savings and revenue'),
      cost: t('No dilution, no interest'),
      time: t('Now'),
      ok: true,
      reason: bootstrapped ? t('You chose to bootstrap.') : '',
      goLabel: bootstrapped ? t('Stop bootstrapping') : t('Choose to bootstrap'),
      go: () =>
        void send(
          { type: 'journey.bootstrap', on: !bootstrapped },
          bootstrapped ? t('You can raise again.') : t('Bootstrapping: no outside money for now.'),
        ),
    },
    {
      id: 'ff',
      title: t('Friends & Family'),
      what: t(
        'People who know you back you early on a SAFE. Other players can join, and AI angels if you ask.',
      ),
      range: t('You set the target'),
      cost: t('Dilution later: a SAFE turns into shares at your cap'),
      time: t('Close whenever you’re ready'),
      ok: !banned,
      reason: banned
        ? t('Barred from raising after a fraud ruling.')
        : ffOpen
          ? t('Your round is open.')
          : '',
      goLabel: ffOpen ? t('See your round') : t('Start a round'),
      go: () => scrollTo('ff-round'),
    },
    {
      id: 'angel',
      title: t('AI angel'),
      what: t('A local angel writes a small cheque on a SAFE after a pitch and their questions.'),
      range: angelChecks.length
        ? range(
            Math.min(...angelChecks.map((x) => x[0])),
            Math.max(...angelChecks.map((x) => x[1])),
          )
        : '—',
      cost: t('About 3–8% dilution on a SAFE'),
      time: t('1–2 months: pitch, questions, offer'),
      ok: !banned && early && angels.length > 0,
      reason: banned
        ? t('Barred from raising after a fraud ruling.')
        : !early
          ? t('Angels back pre-seed and seed companies.')
          : angels.length === 0
            ? t('No angels are investing here right now.')
            : '',
      goLabel: t('Pitch an angel'),
      go: () => onTab('raise'),
    },
    {
      id: 'loan',
      title: t('Bank loan'),
      what: t(
        'Borrow and repay monthly with interest. You keep your shares, but repayments are due even in a bad month.',
      ),
      range: okLoan.length
        ? t('Up to {amount}', {
            amount: money(Math.max(...okLoan.map((x) => x.p.you.maxMinor)), cur),
          })
        : t('Depends on your revenue'),
      cost: companyLoans.length
        ? t('Interest from {rate}% a year', {
            rate: (Math.min(...companyLoans.map((x) => x.p.rateBps)) / 100).toFixed(1),
          })
        : t('Interest'),
      time: t('An offer on a deal card'),
      ok: okLoan.length > 0,
      reason: okLoan.length ? '' : tx(companyLoans.find((x) => x.p.you.reason)?.p.you.reason ?? ''),
      goLabel: t('Ask for a loan'),
      go: () => onTab('raise'),
    },
    {
      id: 'grant',
      title: t('Grant or scheme'),
      what: t(
        'Free money from a development partner or government scheme, with conditions and a report.',
      ),
      range: grants.length
        ? range(
            Math.min(...grants.map((g) => g.p.amount[0])),
            Math.max(...grants.map((g) => g.p.amount[1])),
          )
        : '—',
      cost: t('No equity, no repayment'),
      time: t('Decided at month end'),
      ok: !!okGrant,
      reason: okGrant
        ? ''
        : tx(grants.find((g) => g.you?.reason)?.you?.reason ?? t('No open programmes here.')),
      goLabel: t('Apply in town'),
      go: () => {
        const g = okGrant ?? grants[0];
        if (g) nav?.go({ kind: 'place', place: `dp:${g.d.id}` });
      },
    },
    {
      id: 'accelerator',
      title: t('Accelerator'),
      what: t('A cohort with a mentor and a demo day, for a small slice of equity.'),
      range: accs.length
        ? range(Math.min(...accs.map((x) => x.a.check)), Math.max(...accs.map((x) => x.a.check)))
        : '—',
      cost: accs.length
        ? t('{pct}% equity on a SAFE', {
            pct: (Math.min(...accs.map((x) => x.a.equityBps)) / 100).toFixed(0),
          })
        : t('Equity'),
      time: t('Decided at month end, demo day after the cohort'),
      ok: !!okAcc,
      reason: okAcc
        ? ''
        : tx(
            accs.find((x) => x.you?.reason)?.you?.reason ?? t('No accelerator here takes you now.'),
          ),
      goLabel: t('Apply in town'),
      go: () => {
        const x = okAcc ?? accs[0];
        if (x) nav?.go({ kind: 'place', place: `acc:${x.a.id}` });
      },
    },
    {
      id: 'competition',
      title: t('Competition'),
      what: t('Pitch on stage against other startups for prize money and attention.'),
      range: comps.length
        ? t('Prize pool {amount}', { amount: money(comps[0]!.prizePool, comps[0]!.currency) })
        : t('Prize money'),
      cost: t('No dilution; prep takes hours'),
      time: t('Judged at month end'),
      ok: !!okComp,
      reason: okComp
        ? ''
        : comps.length
          ? tx(comps[0]!.you.enterReason ?? '')
          : t('No competition this month.'),
      goLabel: t('See competitions'),
      go: () => openPhone({ app: 'events' }),
    },
    {
      id: 'vc',
      title: t('Venture capital'),
      what: t(
        'A fund invests a larger amount for a real share and usually a say in big decisions.',
      ),
      range: vcs.length
        ? range(Math.min(...vcs.map((f) => f.check[0])), Math.max(...vcs.map((f) => f.check[1])))
        : '—',
      cost: t('Often 15–25% dilution, preferences and board seats'),
      time: t('2–3 months: questions, partner meeting, term sheet'),
      ok: !banned && vcs.length > 0,
      reason: banned
        ? t('Barred from raising after a fraud ruling.')
        : vcs.length === 0
          ? t('No fund here backs your stage and sector.')
          : c.monthlyRevenue <= 0
            ? t('Possible, but VCs want traction: revenue helps a lot.')
            : '',
      goLabel: t('Pitch a fund'),
      go: () => onTab('raise'),
    },
  ];

  return (
    <Card title={t('Fund your company')} sub={t('Compare every way to get money, side by side')}>
      <ul className="list fund-options">
        {options.map((o) => (
          <li key={o.id} className="fund-option" data-option={o.id}>
            <div className="spread">
              <span className="item-title">{o.title}</span>
              <Pill tone={o.ok ? 'good' : 'warn'}>{o.ok ? t('Available now') : t('Not yet')}</Pill>
            </div>
            <p className="small">{o.what}</p>
            <dl className="fund-facts small">
              <div>
                <dt>{t('Money')}</dt>
                <dd>{o.range}</dd>
              </div>
              <div>
                <dt>{t('Costs you')}</dt>
                <dd>{o.cost}</dd>
              </div>
              <div>
                <dt>{t('Time to close')}</dt>
                <dd>{o.time}</dd>
              </div>
            </dl>
            {o.reason && <p className="small muted">{o.reason}</p>}
            <Button
              variant="subtle"
              aria-label={`${o.goLabel}: ${o.title}`}
              disabled={!o.ok && o.id !== 'grant' && o.id !== 'accelerator'}
              onClick={o.go}
            >
              {o.goLabel}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- Friends & Family

export function FriendsRoundCard({ c }: { c: Company }) {
  const { view, send } = useView();
  const cur = c.currency;
  const round = view.friendsRounds.find((r) => r.companyId === c.id && r.status === 'open');
  const past = view.friendsRounds.filter((r) => r.companyId === c.id && r.status !== 'open');
  const suggested = Math.max(c.valuation.value, 1);
  const [target, setTarget] = useState(amountInput(Math.round(suggested * 0.05)));
  const [cap, setCap] = useState(amountInput(Math.round(suggested)));
  const [discount, setDiscount] = useState(20);
  const tgt = parseAmount(target) ?? 0;
  const capV = parseAmount(cap) ?? 0;
  if (!round)
    return (
      <Card title={t('Friends & Family round')} className="ff-card">
        <div id="ff-round" />
        <p className="small">
          {t(
            'Friends, family and other players back you on a SAFE: it becomes shares at your next priced round, at the cap or the discount, whichever is better for them. Money waits in escrow until you close.',
          )}
        </p>
        <div className="grid2">
          <Field label={t('Target ({cur})', { cur })}>
            {(id) => <input id={id} value={target} onChange={(e) => setTarget(e.target.value)} />}
          </Field>
          <Field label={t('Valuation cap ({cur})', { cur })}>
            {(id) => <input id={id} value={cap} onChange={(e) => setCap(e.target.value)} />}
          </Field>
        </div>
        <Field label={t('Discount on the next round')}>
          {() => (
            <Segmented<string>
              label={t('Discount on the next round')}
              value={String(discount)}
              options={['0', '10', '20', '30'].map((v) => ({ value: v, label: `${v}%` }))}
              onChange={(v) => setDiscount(Number(v))}
            />
          )}
        </Field>
        {tgt > 0 && capV > 0 && (
          <p className="small muted">
            {t(
              'If you raise the full {amount}, your backers will own about {pct} after it converts.',
              {
                amount: money(tgt, cur),
                pct: pct(tgt / capV, 1),
              },
            )}
          </p>
        )}
        <Button
          disabled={tgt <= 0 || capV <= tgt * 2}
          onClick={() =>
            void send(
              {
                type: 'ff.open',
                companyId: c.id,
                target: tgt,
                valuationCap: capV,
                discountPct: discount,
              },
              (r: { message: string }) => tx(r.message),
            )
          }
        >
          {t('Open the round')}
        </Button>
        {capV > 0 && capV <= tgt * 2 && (
          <p className="small bad">{t('The valuation cap must be more than twice the target.')}</p>
        )}
        {past.length > 0 && (
          <p className="small muted">
            {past
              .map((r) =>
                r.status === 'closed'
                  ? t('Closed: {amount} from {n} backers', {
                      amount: money(r.committed, cur),
                      n: r.commitments.length,
                    })
                  : t('Cancelled round'),
              )
              .join(' · ')}
          </p>
        )}
      </Card>
    );
  return (
    <Card title={t('Friends & Family round')} sub={t('Open')} className="ff-card">
      <div id="ff-round" />
      <p className="item-title">
        {t('{have} of {target} committed', {
          have: money(round.committed, cur),
          target: money(round.target, cur),
        })}
      </p>
      <p className="small muted">
        {t('SAFE · cap {cap} · {d}% discount', {
          cap: money(round.valuationCap, cur),
          d: round.discountPct,
        })}
      </p>
      {round.commitments.length === 0 ? (
        <Empty>{t('No one has committed yet. Your contacts were invited.')}</Empty>
      ) : (
        <ul className="list small">
          {round.commitments.map((x) => (
            <li key={x.name} className="spread">
              <span>
                {x.name} {x.ai && <Pill>{t('AI angel')}</Pill>}
              </span>
              <span>{money(x.amount, cur)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <Button
          variant="subtle"
          disabled={!round.canAskAi}
          onClick={() =>
            void send(
              { type: 'ff.askAi', roundId: round.id },
              (r: { yes: { name: string }[]; no: string[] }) =>
                r.yes.length
                  ? t('{names} committed.', { names: r.yes.map((x) => x.name).join(', ') })
                  : t('The angels passed this month.'),
            )
          }
        >
          {round.canAskAi ? t('Ask AI angels') : t('Angels asked this month')}
        </Button>
      </div>
      {round.commitments.length > 0 && (
        <Confirm
          variant="primary"
          label={t('Close the round')}
          confirmLabel={t('Close and take {amount}', { amount: money(round.committed, cur) })}
          onConfirm={() =>
            void send({ type: 'ff.close', roundId: round.id }, (r: { message: string }) =>
              tx(r.message),
            )
          }
        />
      )}
      <Confirm
        label={t('Cancel the round')}
        confirmLabel={t('Cancel and refund everyone')}
        onConfirm={() =>
          void send({ type: 'ff.cancel', roundId: round.id }, (r: { message: string }) =>
            tx(r.message),
          )
        }
      />
    </Card>
  );
}

/** Other founders' rounds you can back (any role). */
export function FriendsBacking() {
  const { view } = useView();
  const mine = new Set(view.companies.map((c) => c.id));
  const rounds = view.friendsRounds.filter(
    (r) => !mine.has(r.companyId) && (r.status === 'open' || r.yourCommitment > 0),
  );
  if (!rounds.length) return null;
  return (
    <Card title={t('Back a friend')} sub={t('Friends & Family rounds near you')}>
      <ul className="list">
        {rounds.map((r) => (
          <BackRow key={r.id} r={r} />
        ))}
      </ul>
    </Card>
  );
}

function BackRow({ r }: { r: FriendsRoundView }) {
  const { send, view } = useView();
  const [amount, setAmount] = useState('');
  const v = parseAmount(amount) ?? 0;
  return (
    <li>
      <div className="spread">
        <span className="item-title">{r.companyName}</span>
        <Pill tone={r.status === 'open' ? 'good' : undefined}>
          {r.status === 'open'
            ? t('Open')
            : r.status === 'closed'
              ? t('Round closed')
              : t('Cancelled')}
        </Pill>
      </div>
      <div className="small muted">
        {t('{founder} · {have} of {target} · cap {cap} · {d}% discount', {
          founder: r.founderName,
          have: money(r.committed, r.currency),
          target: money(r.target, r.currency),
          cap: money(r.valuationCap, r.currency),
          d: r.discountPct,
        })}
      </div>
      {r.yourCommitment > 0 && (
        <div className="small good">
          {t('You committed {amount}', { amount: money(r.yourCommitment, r.currency) })}
        </div>
      )}
      {r.status === 'open' &&
        (r.blocker ? (
          <p className="small muted">{tx(r.blocker)}</p>
        ) : (
          <>
            <p className="small muted">
              {t(
                'You get a SAFE: shares later if the company raises a priced round. You could lose all of it. Your money waits in escrow until the founder closes; if they cancel, it comes back.',
              )}
            </p>
            <div className="row">
              <input
                aria-label={t('Amount to commit to {company}', { company: r.companyName })}
                value={amount}
                placeholder={t('e.g. 500k')}
                onChange={(e) => setAmount(e.target.value)}
                style={{ flex: 1 }}
              />
              <Button
                variant="subtle"
                disabled={v <= 0 || v > (view.accounts.local?.balance ?? 0)}
                onClick={() =>
                  void send(
                    { type: 'ff.commit', roundId: r.id, amount: v },
                    (x: { message: string }) => tx(x.message),
                  ).then(() => setAmount(''))
                }
              >
                {t('Commit')}
              </Button>
            </div>
          </>
        ))}
    </li>
  );
}

type FriendsRoundView = ReturnType<typeof useView>['view']['friendsRounds'][number];

// ---------------------------------------------------------------- founder money

/** Put money in as equity or a loan; repay founder loans; move money to and from the reserve. */
export function FounderMoney({ c }: { c: Company }) {
  const { send, view } = useView();
  const cur = c.currency;
  const f = c.founderFinance;
  const [amount, setAmount] = useState('');
  const [as, setAs] = useState<'equity' | 'loan'>('equity');
  const [repay, setRepay] = useState('');
  const [res, setRes] = useState('');
  const v = parseAmount(amount) ?? 0;
  const owed = f.founderLoans.find((x) => x.founderId === view.me.id)?.owed ?? 0;
  const shares = v > 0 && f.sharePrice > 0 ? Math.floor(v / f.sharePrice) : 0;
  const totalShares = c.capTable.rows.reduce((a, r) => a + r.shares, 0);
  return (
    <>
      <Card title={t('Your money in the company')}>
        <p className="small muted">
          {t('Your savings: {amount}. Choose how the company records what you put in.', {
            amount: money(view.accounts.local?.balance ?? 0, cur),
          })}
        </p>
        <Segmented<'equity' | 'loan'>
          label={t('Put in as')}
          value={as}
          options={[
            { value: 'equity', label: t('Equity (shares)') },
            { value: 'loan', label: t('Founder loan') },
          ]}
          onChange={setAs}
        />
        <div className="row">
          <input
            aria-label={t('Amount to put in')}
            value={amount}
            placeholder={t('e.g. 500k')}
            onChange={(e) => setAmount(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button
            variant="subtle"
            disabled={v <= 0}
            onClick={() =>
              void send(
                { type: 'company.contribute', companyId: c.id, amount: v, as },
                (r: { message: string }) => tx(r.message),
              ).then(() => setAmount(''))
            }
          >
            {as === 'equity' ? t('Put in for shares') : t('Lend to the company')}
          </Button>
        </div>
        <p className="small">
          {as === 'equity'
            ? v > 0
              ? t(
                  'Buys about {n} new shares ({pct} more of the company). You get it back only by selling shares.',
                  {
                    n: shares.toLocaleString(),
                    pct: pct(totalShares ? shares / (totalShares + shares) : 0, 1),
                  },
                )
              : t(
                  'Equity buys new shares at today’s price. You get it back only by selling shares.',
                )
            : t('The company will owe you this. It can repay you later; it is never revenue.')}
        </p>
        {owed > 0 && (
          <>
            <p className="small">
              {t('The company owes you {amount} (founder loan).', { amount: money(owed, cur) })}
            </p>
            <div className="row">
              <input
                aria-label={t('Amount to repay you')}
                value={repay}
                placeholder={amountInput(owed)}
                onChange={(e) => setRepay(e.target.value)}
                style={{ flex: 1 }}
              />
              <Button
                variant="subtle"
                disabled={!parseAmount(repay)}
                onClick={() =>
                  void send(
                    {
                      type: 'company.repayFounder',
                      companyId: c.id,
                      amount: parseAmount(repay) ?? 0,
                    },
                    (r: { message: string }) => tx(r.message),
                  ).then(() => setRepay(''))
                }
              >
                {t('Repay me')}
              </Button>
            </div>
          </>
        )}
      </Card>
      <Card title={t('Business reserve')}>
        <p className="small muted">
          {t(
            'Set money aside for tax and planned bills. It isn’t counted as available cash or in how long your money lasts, but if a month can’t be paid, the reserve covers it first.',
          )}
        </p>
        <p className="small">
          {t('Available {a} · Reserve {r} · Total {t}', {
            a: money(f.available, cur),
            r: money(f.reserve, cur),
            t: money(f.total, cur),
          })}
        </p>
        <div className="row">
          <input
            aria-label={t('Amount to move')}
            value={res}
            placeholder={t('e.g. 500k')}
            onChange={(e) => setRes(e.target.value)}
            style={{ flex: 1 }}
          />
          {(['in', 'out'] as const).map((dir) => (
            <Button
              key={dir}
              variant="subtle"
              disabled={!parseAmount(res)}
              onClick={() =>
                void send(
                  { type: 'company.reserve', companyId: c.id, amount: parseAmount(res) ?? 0, dir },
                  dir === 'in' ? t('Moved to the reserve.') : t('Moved back to available cash.'),
                ).then(() => setRes(''))
              }
            >
              {dir === 'in' ? t('To reserve') : t('Back to cash')}
            </Button>
          ))}
        </div>
      </Card>
    </>
  );
}

/** What the company owns and owes (§7.2): founder loans are a liability, not income. */
export function BalanceSheet({ c }: { c: Company }) {
  const b = c.founderFinance.balanceSheet;
  const cur = c.currency;
  const row = (label: string, v: number, neg = false) => (
    <tr>
      <td>{label}</td>
      <td className="num">{neg && v > 0 ? `−${money(v, cur)}` : money(v, cur)}</td>
    </tr>
  );
  return (
    <Card title={t('Balance sheet')}>
      <table className="table">
        <tbody>
          {row(t('Available cash'), b.cash)}
          {row(t('Business reserve'), b.reserve)}
          {row(t('Unpaid invoices'), b.receivables)}
          <tr>
            <th>{t('What it owns')}</th>
            <th className="num">{money(b.assets, cur)}</th>
          </tr>
          {row(t('Bank loans'), b.bankDebt, true)}
          {row(t('Founder loans'), b.founderLoans, true)}
          {row(t('Unpaid payroll'), b.unpaidPayroll, true)}
          <tr>
            <th>{t('What it owes')}</th>
            <th className="num">{money(b.liabilities, cur)}</th>
          </tr>
          <tr>
            <th>{t('Net assets')}</th>
            <th className={`num ${b.equity >= 0 ? 'good' : 'bad'}`}>{money(b.equity, cur)}</th>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}
