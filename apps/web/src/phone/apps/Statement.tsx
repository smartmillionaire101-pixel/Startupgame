/**
 * The bank statement and transaction receipts (Bank app). The engine's ledger
 * is the source of truth: the player view carries the latest lines of each
 * account, and the full statement comes a page at a time from
 * `/api/statement` (filtered by money in or out, game month and text). Tap a
 * line for its receipt (`/api/receipts/:ref`): reference, date and time, type,
 * from and to, amount, fee, exchange rate, note, status and the balance after.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Receipt, StatementLine } from '@runway/engine';
import { api, type StatementPage } from '../../api';
import { gameMonth, moneyExact } from '../../format';
import { locale, t, tx } from '../../i18n';
import { useView } from '../../store';
import { Button } from '../../ui';
import { H, Nothing } from '../shared';
import '../bank.css';

type Which = 'local' | 'usd';
type Dir = 'all' | 'in' | 'out';

const kindLabel = (k: string) =>
  ({
    transfer: t('Transfer'),
    purchase: t('Purchase'),
    sale: t('Sale'),
    fee: t('Fee'),
    salary: t('Salary'),
    loan: t('Loan'),
    refund: t('Refund'),
    stake: t('Game stake'),
    pot: t('Game winnings'),
    tax: t('Tax'),
    rent: t('Rent'),
    investment: t('Investment'),
    income: t('Income'),
    exchange: t('Currency exchange'),
    deposit: t('Deposit'),
  })[k] ?? t('Other');

/** Names of the outside world, as the engine writes them. */
const partyName = (c: StatementLine['counterparty']) =>
  c.kind === 'self' ? t('You') : c.kind === 'game' ? t('Game pot') : tx(c.name);

const partyKind = (k: string) =>
  ({
    player: t('Player'),
    company: t('Company'),
    business: t('Business'),
    bank: t('Bank'),
    fund: t('Fund'),
    game: t('Game'),
    fee: t('Fee'),
    tax: t('Tax'),
    world: '',
    self: '',
  })[k] ?? '';

const when = (at: number | null) =>
  at === null
    ? null
    : new Date(at).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });

const signed = (minor: number, currency: string) =>
  `${minor > 0 ? '+' : minor < 0 ? '−' : ''}${moneyExact(Math.abs(minor), currency)}`;

const rateText = (fx: NonNullable<Receipt['fx']>) => {
  const r = fx.rate;
  const digits = r >= 100 ? 2 : r >= 1 ? 4 : 6;
  const n = r.toLocaleString(locale(), { maximumFractionDigits: digits });
  return `1 ${fx.from} = ${n} ${fx.to}`;
};

// ---------------------------------------------------------------------------
// A line

function TxLine({
  line,
  currency,
  onOpen,
}: {
  line: StatementLine;
  currency: string;
  onOpen: (l: StatementLine) => void;
}) {
  const dir = line.amount >= 0 ? 'in' : 'out';
  return (
    <li>
      <button
        type="button"
        className={`bank-line bank-${dir}`}
        data-tx-line
        data-ref={line.ref ?? ''}
        data-dir={dir}
        onClick={() => onOpen(line)}
      >
        <span className="bank-line-main">
          <span className="bank-line-desc">{tx(line.description)}</span>
          <span className="small muted">
            {partyName(line.counterparty)}
            {' · '}
            {kindLabel(line.kind)}
            {' · '}
            {when(line.at) ?? gameMonth(line.month)}
          </span>
          {line.note && !line.fee && <span className="small bank-line-note">“{line.note}”</span>}
        </span>
        <span className="bank-line-nums">
          <span className={`bank-amount ${dir === 'in' ? 'good' : 'bad'}`} data-amount>
            {signed(line.amount, currency)}
          </span>
          <span className="small muted" data-balance-after>
            {moneyExact(line.balance, currency)}
          </span>
        </span>
      </button>
    </li>
  );
}

export function TxList({
  lines,
  currency,
  onOpen,
}: {
  lines: StatementLine[];
  currency: string;
  onOpen: (l: StatementLine) => void;
}) {
  return (
    <ul className="bank-lines">
      {lines.map((l) => (
        <TxLine key={l.key} line={l} currency={currency} onOpen={onOpen} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// The statement

export function StatementScreen({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (l: StatementLine, currency: string) => void;
}) {
  const { view } = useView();
  const [which, setWhich] = useState<Which>('local');
  const [dir, setDir] = useState<Dir>('all');
  const [month, setMonth] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState<{ key: string; data: StatementPage } | null>(null);
  const [more, setMore] = useState<StatementLine[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acc = which === 'usd' ? view.accounts.usd : view.accounts.local;

  // Search as you type, a moment after the last key.
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);

  // The first page, again whenever the world changes (new money in or out).
  const version = view.worldVersion;
  const key = JSON.stringify([which, dir, q, month, version]);
  const loading = page?.key !== key;
  useEffect(() => {
    const ctl = new AbortController();
    api
      .statement({ account: which, dir, q: q || undefined, month }, ctl.signal)
      .then((r) => {
        setPage({ key, data: r.statement });
        setMore([]);
        setNext(r.statement.next);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => ctl.abort();
  }, [key, which, dir, q, month]);

  const loadMore = () => {
    if (next === null) return;
    setLoadingMore(true);
    api
      .statement({ account: which, dir, q: q || undefined, month, before: next })
      .then((r) => {
        setMore((m) => [...m, ...r.statement.lines]);
        setNext(r.statement.next);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingMore(false));
  };

  // Until the first page arrives, the latest lines from the view.
  const data = page?.data ?? null;
  const lines = data ? [...data.lines, ...more] : (acc?.statement.lines ?? []);
  const currency = data?.currency ?? acc?.currency ?? view.market.currency;
  const months = (data?.months ?? []).slice(0, 6);

  return (
    <div className="phone-stack" data-statement data-loading={loading || undefined}>
      <div className="spread">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ‹ {t('Bank')}
        </Button>
        <span className="small muted">{t('Statement')}</span>
      </div>

      <section className="phone-card phone-hero tone-bank" aria-label={t('Statement')}>
        {view.accounts.usd && (
          <div className="chips" role="group" aria-label={t('Account')}>
            {(['local', 'usd'] as const).map((w) => (
              <button
                key={w}
                className="chip"
                aria-pressed={which === w}
                onClick={() => setWhich(w)}
              >
                {w === 'local'
                  ? t('Personal account ({currency})', {
                      currency: view.accounts.local?.currency ?? '',
                    })
                  : t('Dollar account (USD)')}
              </button>
            ))}
          </div>
        )}
        <div className="small">{t('Balance ({currency})', { currency })}</div>
        <div className="phone-hero-big" data-statement-balance>
          {moneyExact(data?.balance ?? acc?.balance ?? 0, currency)}
        </div>
        {data && (
          <div className="bank-totals">
            <span>
              {t('Money in')}{' '}
              <b className="good" data-total-in>
                +{moneyExact(data.totals.in, currency)}
              </b>
            </span>
            <span>
              {t('Money out')}{' '}
              <b className="bad" data-total-out>
                −{moneyExact(data.totals.out, currency)}
              </b>
            </span>
          </div>
        )}
      </section>

      <section className="phone-card" aria-label={t('Filters')}>
        <div className="chips" role="group" aria-label={t('Direction')}>
          {(['all', 'in', 'out'] as const).map((d) => (
            <button
              key={d}
              className="chip"
              aria-pressed={dir === d}
              data-dir-filter={d}
              onClick={() => setDir(d)}
            >
              {d === 'all' ? t('All') : d === 'in' ? t('Money in') : t('Money out')}
            </button>
          ))}
        </div>
        {months.length > 1 && (
          <div className="chips" role="group" aria-label={t('Period')}>
            <button className="chip" aria-pressed={month === null} onClick={() => setMonth(null)}>
              {t('All months')}
            </button>
            {months.map((m) => (
              <button
                key={m}
                className="chip"
                aria-pressed={month === m}
                onClick={() => setMonth(m)}
              >
                {gameMonth(m)}
              </button>
            ))}
          </div>
        )}
        <input
          className="input phone-search"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('Search: name, description, note, reference')}
          aria-label={t('Search transactions')}
        />
      </section>

      <section className="phone-card" aria-label={t('Transactions')}>
        <div className="spread">
          <H>{t('Transactions')}</H>
          {data && <span className="small muted">{t('{n} lines', { n: data.totals.count })}</span>}
        </div>
        <div className="bank-head small muted" aria-hidden="true">
          <span>{t('Description')}</span>
          <span>{t('Amount · balance')}</span>
        </div>
        {error && <p className="small bad">{tx(error)}</p>}
        {lines.length === 0 ? (
          <Nothing>{loading ? t('Loading…') : t('No transactions match.')}</Nothing>
        ) : (
          <TxList lines={lines} currency={currency} onOpen={(l) => onOpen(l, currency)} />
        )}
        {next !== null && (
          <Button variant="subtle" loading={loadingMore} onClick={loadMore}>
            {t('Show older')}
          </Button>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A receipt

/** Old lines (before receipts existed) have no reference: their receipt is the line. */
function lineReceipt(line: StatementLine, currency: string, me: string): Receipt {
  const self = { name: me, kind: 'self' as const };
  const out = line.amount < 0;
  return {
    ref: line.ref ?? '',
    status: 'completed',
    at: line.at,
    month: line.month,
    kind: line.kind,
    description: line.description,
    direction: out ? 'out' : 'in',
    from: out ? self : line.counterparty,
    to: out ? line.counterparty : self,
    counterparty: line.counterparty,
    amount: Math.abs(line.amount),
    fee: 0,
    total: Math.abs(line.amount),
    currency: currency as Receipt['currency'],
    fx: line.fx,
    note: line.note,
    balanceAfter: line.balance,
    lines: [],
  };
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bank-row">
      <span className="muted">{label}</span>
      <span className={tone}>{value}</span>
    </div>
  );
}

export function ReceiptScreen({
  refId,
  line,
  currency,
  onBack,
}: {
  refId: string | null;
  line?: StatementLine;
  currency?: string;
  onBack: () => void;
}) {
  const { view } = useView();
  const [receipt, setReceipt] = useState<Receipt | null>(() =>
    line && !line.ref ? lineReceipt(line, currency ?? view.market.currency, view.me.name) : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    if (!refId) return;
    api
      .receipt(refId)
      .then((r) => live.current && setReceipt(r.receipt))
      .catch((e: unknown) => live.current && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live.current = false;
    };
  }, [refId]);

  const summary = useMemo(() => {
    if (!receipt) return '';
    const c = receipt.currency;
    const rows = [
      t('Runway receipt {ref}', { ref: receipt.ref || '—' }),
      `${kindLabel(receipt.kind)} · ${t('Completed')}`,
      when(receipt.at) ?? gameMonth(receipt.month),
      t('From: {name}', { name: partyName(receipt.from) }),
      t('To: {name}', { name: partyName(receipt.to) }),
      t('Amount: {amount}', { amount: moneyExact(receipt.amount, c) }),
      ...(receipt.fee ? [t('Fee: {amount}', { amount: moneyExact(receipt.fee, c) })] : []),
      ...(receipt.fx
        ? [
            t('Exchange rate: {rate}', { rate: rateText(receipt.fx) }),
            t('Received: {amount}', {
              amount: moneyExact(receipt.fx.received, receipt.fx.to),
            }),
          ]
        : []),
      ...(receipt.note ? [t('Note: {note}', { note: receipt.note })] : []),
    ];
    return rows.join('\n');
  }, [receipt]);

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: t('Receipt'), text: summary });
      else await navigator.clipboard.writeText(summary);
      setCopied(true);
    } catch {
      try {
        await navigator.clipboard.writeText(summary);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }
  };

  const r = receipt;
  const c = r?.currency ?? currency ?? view.market.currency;
  const out = r?.direction === 'out';
  return (
    <div className="phone-stack" data-receipt={r?.ref ?? refId ?? ''}>
      <div className="spread">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ‹ {t('Back')}
        </Button>
        <span className="small muted">{t('Receipt')}</span>
      </div>
      {!r ? (
        <section className="phone-card">
          {error ? <p className="small bad">{tx(error)}</p> : <Nothing>{t('Loading…')}</Nothing>}
        </section>
      ) : (
        <section className="phone-card bank-receipt" aria-label={t('Receipt')}>
          <div className="bank-receipt-top">
            <span className="bank-receipt-kind">{kindLabel(r.kind)}</span>
            <span className={`bank-receipt-amount ${out ? 'bad' : 'good'}`} data-receipt-amount>
              {r.direction === 'own'
                ? moneyExact(r.amount, c)
                : signed(out ? -r.total : r.total, c)}
            </span>
            <span className="bank-status" data-receipt-status>
              ✓ {t('Completed')}
            </span>
            <span className="small muted">{tx(r.description)}</span>
          </div>
          <div className="bank-rows">
            <Row label={t('Reference')} value={r.ref || '—'} />
            <Row label={t('Date and time')} value={when(r.at) ?? gameMonth(r.month)} />
            <Row label={t('Game month')} value={String(r.month)} />
            <Row label={t('Type')} value={kindLabel(r.kind)} />
            <Row
              label={t('From')}
              value={[partyName(r.from), partyKind(r.from.kind)].filter(Boolean).join(' · ')}
            />
            <Row
              label={t('To')}
              value={[partyName(r.to), partyKind(r.to.kind)].filter(Boolean).join(' · ')}
            />
            <Row label={t('Amount')} value={moneyExact(r.amount, c)} />
            <Row label={t('Fee')} value={moneyExact(r.fee, c)} tone={r.fee ? 'bad' : undefined} />
            {r.direction !== 'own' && (
              <Row
                label={out ? t('Total debited') : t('Total credited')}
                value={signed(out ? -r.total : r.total, c)}
                tone={out ? 'bad' : 'good'}
              />
            )}
            {r.fx && (
              <>
                <Row label={t('Exchange rate')} value={rateText(r.fx)} />
                <Row
                  label={t('Conversion fee')}
                  value={(r.fx.feeBps / 100).toLocaleString(locale()) + ' %'}
                />
                <Row
                  label={out ? t('They received') : t('They sent')}
                  value={
                    out ? moneyExact(r.fx.received, r.fx.to) : moneyExact(r.fx.sent, r.fx.from)
                  }
                />
              </>
            )}
            {r.note && <Row label={t('Note')} value={`“${r.note}”`} />}
            <Row label={t('Status')} value={t('Completed')} tone="good" />
            <Row label={t('Balance after')} value={moneyExact(r.balanceAfter, c)} />
          </div>
          <Button variant="subtle" data-share-receipt onClick={() => void share()}>
            {copied ? t('Copied') : t('Share or copy')}
          </Button>
        </section>
      )}
    </div>
  );
}
