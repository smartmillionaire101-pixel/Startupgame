import { useState } from 'react';
import { t, tx } from '../i18n';
import { amountInput, money, parseAmount, titleCase } from '../format';
import { useView, type Deal } from '../store';
import { Button, Card, Empty, Field, Pill } from '../ui';
import { useNav } from '../phone/bus';

/** Funding stages, in the player's language. */
export const stageLabel = (s: string) =>
  (
    ({
      'pre-seed': t('Pre-seed'),
      seed: t('Seed'),
      'series-a': t('Series A'),
      'series-b': t('Series B'),
      'series-c': t('Series C'),
    }) as Record<string, string>
  )[s] ?? titleCase(s);

const kindLabel = (k: string) =>
  (
    ({
      investment: t('Investment'),
      cofounder: t('Co-founder'),
      loan: t('Loan'),
      acquisition: t('Acquisition'),
      'personal-loan': t('Personal loan'),
      supply: t('Supply'),
    }) as Record<string, string>
  )[k] ?? titleCase(k);

const statusLabel = (st: string) =>
  (
    ({
      open: t('Pending'),
      accepted: t('Accepted'),
      declined: t('Declined'),
      expired: t('Expired'),
      withdrawn: t('Withdrawn'),
    }) as Record<string, string>
  )[st] ?? titleCase(st);

const actionLabel = (a: string) =>
  (
    ({
      propose: t('proposed'),
      counter: t('countered'),
      accept: t('accepted'),
      decline: t('declined'),
      expire: t('expired'),
      withdraw: t('withdrawn'),
    }) as Record<string, string>
  )[a] ?? a;

const yesNo = (b: boolean) => (b ? t('yes') : t('no'));

const STATUS_TONE = {
  open: 'info',
  accepted: 'good',
  declined: 'bad',
  expired: 'warn',
  withdrawn: 'warn',
} as const;

/** A deal card (§9): same terms for both sides on one screen; accept, counter or walk. */
export function DealCard({ deal }: { deal: Deal }) {
  const { send } = useView();
  // Deals are priced in the currency of the market they happen in.
  const cur = deal.currency;
  const [countering, setCountering] = useState(false);
  const terms = deal.terms;
  const [amount, setAmount] = useState(amountInput('amount' in terms ? terms.amount : 0));
  const [valuation, setValuation] = useState(
    amountInput(
      terms.kind === 'investment'
        ? terms.valuation
        : terms.kind === 'acquisition' || terms.kind === 'supply'
          ? terms.price
          : 0,
    ),
  );
  const [equity, setEquity] = useState(terms.kind === 'cofounder' ? terms.equityBps / 100 : 10);

  const act = (action: 'accept' | 'decline' | 'withdraw') =>
    send(
      { type: 'deal.act', dealId: deal.id, action },
      action === 'accept'
        ? t('Deal accepted.')
        : action === 'decline'
          ? t('Declined.')
          : t('Withdrawn.'),
    );
  const counter = async () => {
    const next =
      terms.kind === 'investment'
        ? {
            amount: parseAmount(amount) ?? undefined,
            valuation: parseAmount(valuation) ?? undefined,
          }
        : terms.kind === 'acquisition' || terms.kind === 'supply'
          ? { price: parseAmount(valuation) ?? undefined }
          : terms.kind === 'loan' || terms.kind === 'personal-loan'
            ? { amount: parseAmount(amount) ?? undefined }
            : { equityBps: Math.round(equity * 100) };
    const r = await send(
      { type: 'deal.act', dealId: deal.id, action: 'counter', terms: next },
      t('Counter sent.'),
    );
    if (r) setCountering(false);
  };

  return (
    <Card
      title={t('{kind} · {company}', { kind: kindLabel(terms.kind), company: deal.companyName })}
      action={
        <Pill tone={STATUS_TONE[deal.status]}>
          {deal.yourTurn ? t('Your move') : statusLabel(deal.status)}
        </Pill>
      }
    >
      <p style={{ fontSize: '1.02rem' }}>{tx(deal.summary)}</p>
      <p className="small muted">
        {deal.proposerName} → {deal.counterpartyName}
        {deal.status === 'open' && t(' · expires month {n}', { n: deal.expiresMonth })}
      </p>
      {deal.waterfall && (
        <details>
          <summary className="small">{t('Who gets what')}</summary>
          <table className="table">
            <tbody>
              {deal.waterfall.map((l) => (
                <tr key={l.holderId}>
                  <td>{l.name}</td>
                  <td className="num">{money(l.total, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <details>
        <summary className="small">{t('Full terms and history')}</summary>
        <ul className="small muted">
          {terms.kind === 'investment' && (
            <>
              <li>
                {terms.instrument === 'safe' ? t('SAFE (post-money cap)') : t('Priced round')} ·{' '}
                {stageLabel(terms.stage)}
              </li>
              <li>
                {terms.instrument === 'safe'
                  ? t('Amount {amount} · cap {valuation}', {
                      amount: money(terms.amount, cur),
                      valuation: money(terms.valuation, cur),
                    })
                  : t('Amount {amount} · pre-money {valuation}', {
                      amount: money(terms.amount, cur),
                      valuation: money(terms.valuation, cur),
                    })}
              </li>
              <li>
                {terms.participating
                  ? t('Liquidation preference {n}x participating', {
                      n: terms.liquidationMultiple,
                    })
                  : t('Liquidation preference {n}x non-participating', {
                      n: terms.liquidationMultiple,
                    })}
              </li>
              <li>
                {t('Pro-rata {proRata} · board seat {board} · veto on sale {veto}', {
                  proRata: yesNo(terms.proRata),
                  board: yesNo(terms.boardSeat),
                  veto: yesNo(terms.vetoOnSale),
                })}
              </li>
              {terms.poolTopUpBps > 0 && (
                <li>
                  {t('Option pool top-up to {pct}% (pre-money)', { pct: terms.poolTopUpBps / 100 })}
                </li>
              )}
            </>
          )}
          {deal.history.map((h, i) => (
            <li key={i}>
              {t('Month {n}: {action} — {summary}', {
                n: h.month,
                action: actionLabel(h.action),
                summary: tx(h.summary),
              })}
            </li>
          ))}
        </ul>
      </details>
      {deal.status === 'open' && deal.yourTurn && !countering && (
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <Button onClick={() => void act('accept')}>{t('Accept')}</Button>
          <Button variant="subtle" onClick={() => setCountering(true)}>
            {t('Counter')}
          </Button>
          <Button variant="ghost" onClick={() => void act('decline')}>
            {t('Decline')}
          </Button>
        </div>
      )}
      {countering && (
        <div className="stack" style={{ marginTop: '0.5rem' }}>
          {(terms.kind === 'investment' ||
            terms.kind === 'loan' ||
            terms.kind === 'personal-loan') && (
            <Field label={t('Amount ({cur})', { cur })}>
              {(id) => <input id={id} value={amount} onChange={(e) => setAmount(e.target.value)} />}
            </Field>
          )}
          {(terms.kind === 'investment' ||
            terms.kind === 'acquisition' ||
            terms.kind === 'supply') && (
            <Field
              label={
                terms.kind === 'supply'
                  ? t('Price per month ({cur})', { cur })
                  : terms.kind === 'acquisition'
                    ? t('Price ({cur})', { cur })
                    : terms.instrument === 'safe'
                      ? t('Valuation cap ({cur})', { cur })
                      : t('Pre-money valuation ({cur})', { cur })
              }
            >
              {(id) => (
                <input id={id} value={valuation} onChange={(e) => setValuation(e.target.value)} />
              )}
            </Field>
          )}
          {terms.kind === 'cofounder' && (
            <Field label={t('Equity: {pct}%', { pct: equity })}>
              {(id) => (
                <input
                  id={id}
                  type="range"
                  min={1}
                  max={50}
                  value={equity}
                  onChange={(e) => setEquity(Number(e.target.value))}
                />
              )}
            </Field>
          )}
          <div className="row">
            <Button onClick={() => void counter()}>{t('Send counter')}</Button>
            <Button variant="ghost" onClick={() => setCountering(false)}>
              {t('Cancel')}
            </Button>
          </div>
        </div>
      )}
      {deal.status === 'open' && deal.youProposed && !deal.yourTurn && (
        <Button
          variant="ghost"
          onClick={() => void act('withdraw')}
          style={{ marginTop: '0.5rem' }}
        >
          {t('Withdraw')}
        </Button>
      )}
    </Card>
  );
}

export function DealList({ filter }: { filter?: (d: Deal) => boolean }) {
  const { view } = useView();
  const deals = view.deals.filter(filter ?? (() => true));
  const open = deals.filter((d) => d.status === 'open');
  const closed = deals.filter((d) => d.status !== 'open').slice(0, 8);
  return (
    <>
      {open.length === 0 && (
        <Empty>{t('No open deal cards. Everything binding happens here.')}</Empty>
      )}
      {open.map((d) => (
        <DealCard key={d.id} deal={d} />
      ))}
      {closed.length > 0 && (
        <details>
          <summary className="muted small">{t('Past deals ({n})', { n: closed.length })}</summary>
          {closed.map((d) => (
            <DealCard key={d.id} deal={d} />
          ))}
        </details>
      )}
    </>
  );
}

const KIND_ICON: Record<string, string> = {
  lead: '🧲',
  meeting: '🤝',
  reporter: '📰',
  pitch: '📨',
  warning: '⚠️',
  deal: '📝',
  system: 'ℹ️',
  milestone: '🏁',
  staff: '👥',
};

export function Inbox({ limit = 8 }: { limit?: number }) {
  const { view, send } = useView();
  const nav = useNav();
  const unread = view.inbox.filter((i) => !i.read);
  const items = view.inbox.slice(0, limit);
  return (
    <Card
      title={unread.length ? t('Inbox · {n} new', { n: unread.length }) : t('Inbox')}
      action={
        unread.length > 0 && (
          <Button variant="ghost" onClick={() => void send({ type: 'inbox.read' })}>
            {t('Mark read')}
          </Button>
        )
      }
    >
      {items.length === 0 ? (
        <Empty>{t('Nothing yet.')}</Empty>
      ) : (
        <ul className="list">
          {items.map((i) => (
            <li key={i.id} style={{ opacity: i.read ? 0.65 : 1 }}>
              {nav ? (
                <button className="inbox-item" data-alert={i.kind} onClick={() => nav.openItem(i)}>
                  <span aria-hidden>{KIND_ICON[i.kind] ?? '•'}</span> {tx(i.text)}
                  <div className="small muted">{t('Month {n}', { n: i.month })} ›</div>
                </button>
              ) : (
                <>
                  <span aria-hidden>{KIND_ICON[i.kind] ?? '•'}</span> {tx(i.text)}
                  <div className="small muted">{t('Month {n}', { n: i.month })}</div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Pick who to deal with: the market's AI bank (empty value) or a licensed
 * player bank that offers this product (§8).
 */
export function BankPicker({
  value,
  onChange,
  product,
  label,
  none,
}: {
  value: string;
  onChange: (id: string) => void;
  product: 'people' | 'companies' | 'advisory';
  label?: string;
  none?: string;
}) {
  const { view } = useView();
  const banks = view.market.banks.filter((b) => b.lends[product]);
  if (banks.length === 0) return null;
  return (
    <Field label={label ?? t('Lender')}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{none ?? view.market.bankName}</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} · {b.typeLabel} · {b.stars.toFixed(1)}★
              {product === 'advisory' ? '' : t(' · base +{pp}pp', { pp: b.loanSpreadPp })}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
