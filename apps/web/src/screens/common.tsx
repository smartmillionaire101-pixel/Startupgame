import { useState } from 'react';
import { amountInput, money, parseAmount, titleCase } from '../format';
import { useView, type Deal } from '../store';
import { Button, Card, Empty, Field, Pill } from '../ui';

const STATUS_TONE = {
  open: 'info',
  accepted: 'good',
  declined: 'bad',
  expired: 'warn',
  withdrawn: 'warn',
} as const;

/** A deal card (§9): same terms for both sides on one screen; accept, counter or walk. */
export function DealCard({ deal }: { deal: Deal }) {
  const { send, cur } = useView();
  const [countering, setCountering] = useState(false);
  const t = deal.terms;
  const [amount, setAmount] = useState(amountInput('amount' in t ? t.amount : 0));
  const [valuation, setValuation] = useState(
    amountInput(t.kind === 'investment' ? t.valuation : t.kind === 'acquisition' ? t.price : 0),
  );
  const [equity, setEquity] = useState(t.kind === 'cofounder' ? t.equityBps / 100 : 10);

  const act = (action: 'accept' | 'decline' | 'withdraw') =>
    send(
      { type: 'deal.act', dealId: deal.id, action },
      action === 'accept' ? 'Deal accepted.' : action === 'decline' ? 'Declined.' : 'Withdrawn.',
    );
  const counter = async () => {
    const terms =
      t.kind === 'investment'
        ? {
            amount: parseAmount(amount) ?? undefined,
            valuation: parseAmount(valuation) ?? undefined,
          }
        : t.kind === 'acquisition'
          ? { price: parseAmount(valuation) ?? undefined }
          : t.kind === 'loan'
            ? { amount: parseAmount(amount) ?? undefined }
            : { equityBps: Math.round(equity * 100) };
    const r = await send(
      { type: 'deal.act', dealId: deal.id, action: 'counter', terms },
      'Counter sent.',
    );
    if (r) setCountering(false);
  };

  return (
    <Card
      title={`${titleCase(t.kind)} · ${deal.companyName}`}
      action={
        <Pill tone={STATUS_TONE[deal.status]}>
          {deal.yourTurn ? 'Your move' : titleCase(deal.status)}
        </Pill>
      }
    >
      <p style={{ fontSize: '1.02rem' }}>{deal.summary}</p>
      <p className="small muted">
        {deal.proposerName} → {deal.counterpartyName}
        {deal.status === 'open' && ` · expires month ${deal.expiresMonth}`}
      </p>
      {deal.waterfall && (
        <details>
          <summary className="small">Who gets what</summary>
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
        <summary className="small">Full terms and history</summary>
        <ul className="small muted">
          {t.kind === 'investment' && (
            <>
              <li>
                {t.instrument === 'safe' ? 'SAFE (post-money cap)' : 'Priced round'} ·{' '}
                {titleCase(t.stage)}
              </li>
              <li>
                Amount {money(t.amount, cur)} · {t.instrument === 'safe' ? 'cap' : 'pre-money'}{' '}
                {money(t.valuation, cur)}
              </li>
              <li>
                Liquidation preference {t.liquidationMultiple}x{' '}
                {t.participating ? 'participating' : 'non-participating'}
              </li>
              <li>
                Pro-rata {t.proRata ? 'yes' : 'no'} · board seat {t.boardSeat ? 'yes' : 'no'} · veto
                on sale {t.vetoOnSale ? 'yes' : 'no'}
              </li>
              {t.poolTopUpBps > 0 && (
                <li>Option pool top-up to {t.poolTopUpBps / 100}% (pre-money)</li>
              )}
            </>
          )}
          {deal.history.map((h, i) => (
            <li key={i}>
              Month {h.month}: {h.action} — {h.summary}
            </li>
          ))}
        </ul>
      </details>
      {deal.status === 'open' && deal.yourTurn && !countering && (
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <Button onClick={() => void act('accept')}>Accept</Button>
          <Button variant="subtle" onClick={() => setCountering(true)}>
            Counter
          </Button>
          <Button variant="ghost" onClick={() => void act('decline')}>
            Decline
          </Button>
        </div>
      )}
      {countering && (
        <div className="stack" style={{ marginTop: '0.5rem' }}>
          {(t.kind === 'investment' || t.kind === 'loan') && (
            <Field label={`Amount (${cur})`}>
              {(id) => <input id={id} value={amount} onChange={(e) => setAmount(e.target.value)} />}
            </Field>
          )}
          {(t.kind === 'investment' || t.kind === 'acquisition') && (
            <Field
              label={
                t.kind === 'acquisition'
                  ? `Price (${cur})`
                  : `${t.instrument === 'safe' ? 'Valuation cap' : 'Pre-money valuation'} (${cur})`
              }
            >
              {(id) => (
                <input id={id} value={valuation} onChange={(e) => setValuation(e.target.value)} />
              )}
            </Field>
          )}
          {t.kind === 'cofounder' && (
            <Field label={`Equity: ${equity}%`}>
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
            <Button onClick={() => void counter()}>Send counter</Button>
            <Button variant="ghost" onClick={() => setCountering(false)}>
              Cancel
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
          Withdraw
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
      {open.length === 0 && <Empty>No open deal cards. Everything binding happens here.</Empty>}
      {open.map((d) => (
        <DealCard key={d.id} deal={d} />
      ))}
      {closed.length > 0 && (
        <details>
          <summary className="muted small">Past deals ({closed.length})</summary>
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
  const unread = view.inbox.filter((i) => !i.read);
  const items = view.inbox.slice(0, limit);
  return (
    <Card
      title={`Inbox${unread.length ? ` · ${unread.length} new` : ''}`}
      action={
        unread.length > 0 && (
          <Button variant="ghost" onClick={() => void send({ type: 'inbox.read' })}>
            Mark read
          </Button>
        )
      }
    >
      {items.length === 0 ? (
        <Empty>Nothing yet.</Empty>
      ) : (
        <ul className="list">
          {items.map((i) => (
            <li key={i.id} style={{ opacity: i.read ? 0.65 : 1 }}>
              <span aria-hidden>{KIND_ICON[i.kind] ?? '•'}</span> {i.text}
              <div className="small muted">Month {i.month}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
