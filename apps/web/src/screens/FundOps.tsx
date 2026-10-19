/**
 * Running a fund after its first close (investor blueprint §5.3 "Fund
 * dashboard", §8.3, Phase 5): NAV, TVPI, DPI and IRR; the portfolio plan
 * and reserves; the investment committee; the quarterly LP letter and LP
 * trust; the fund's life (harvest, an extension vote, wind-down). Also the
 * pro-rata offers a portfolio company's new round brings.
 */
import { useState } from 'react';
import { money, parseAmount, pct } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Pill, Sparkline, Stat } from '../ui';
import { lpFundsOf } from './Funds';
import './investor.css';

export function positionStatusText(s: string): string {
  switch (s) {
    case 'raising':
      return t('raising');
    case 'at-risk':
      return t('at risk');
    case 'exited':
      return t('exited');
    case 'written-off':
      return t('written off');
    default:
      return t('healthy');
  }
}

export function FundManagement({ fundId }: { fundId: string }) {
  const { view, send } = useView();
  const f = lpFundsOf(view)?.gp.find((x) => x.id === fundId);
  const [companies, setCompanies] = useState('');
  const [avg, setAvg] = useState('');
  const [ratio, setRatio] = useState('0.4');
  const [icCompany, setIcCompany] = useState('');
  const [icAmount, setIcAmount] = useState('');
  const [reserve, setReserve] = useState<Record<string, string>>({});
  if (!f || !f.ops) return null;
  const o = f.ops;
  const m = o.metrics;
  const cur = f.currency;
  const raising = view.market.dealFlow ?? [];
  return (
    <div className="inv-form fund-ops">
      <h3 className="cap-h">{t('Fund dashboard')}</h3>
      <div className="inv-grid">
        <Stat
          label={t('NAV')}
          value={money(m.nav, cur)}
          hint={t('Marks plus cash: paper, not cash')}
        />
        <Stat
          label={t('TVPI')}
          value={`${m.tvpi.toFixed(2)}×`}
          hint={t('Cash back and marks, per unit paid in')}
        />
        <Stat
          label={t('DPI')}
          value={`${m.dpi.toFixed(2)}×`}
          tone={m.dpi >= 1 ? 'good' : undefined}
          hint={t('Cash back per unit paid in: what LPs judge')}
        />
        <Stat
          label={t('IRR')}
          value={m.irr === null ? '—' : pct(m.irr, 1)}
          hint={t('A year, on real cash flows')}
        />
        <Stat
          label={t('Dry powder')}
          value={money(m.dryPowder, cur)}
          hint={t('Cash less reserves')}
          tone="money"
        />
        <Stat label={t('Reserves')} value={money(m.reserves, cur)} />
        <Stat label={t('Distributed')} value={money(m.distributed, cur)} />
        <Stat
          label={t('Fees paid')}
          value={money(f.feesPaid, cur)}
          hint={t('{rate} a year now', { rate: pct(o.feeRate, 1) })}
        />
      </div>
      {o.navHistory.length > 1 && <Sparkline values={o.navHistory} label={t('NAV history')} />}
      <p className="small muted">
        {t(
          'Month {n} of {term}: investing for the first {invest}, then harvest (follow-ons only).',
          {
            n: o.monthsIn,
            term: o.termMonths,
            invest: o.investMonths,
          },
        )}
      </p>

      <h3 className="cap-h">{t('Portfolio construction')}</h3>
      {o.plan && (
        <p className="small">
          {t('Plan: {n} companies at about {avg}, {ratio} kept for follow-ons.', {
            n: o.plan.companies,
            avg: money(o.plan.avgCheque, cur),
            ratio: pct(o.plan.reserveRatio, 0),
          })}
        </p>
      )}
      <div className="row">
        <input
          aria-label={t('Companies planned')}
          inputMode="numeric"
          placeholder={t('Companies')}
          value={companies}
          onChange={(e) => setCompanies(e.target.value)}
        />
        <input
          aria-label={t('Average first cheque')}
          inputMode="decimal"
          placeholder={t('Average cheque')}
          value={avg}
          onChange={(e) => setAvg(e.target.value)}
        />
        <select
          aria-label={t('Reserve ratio')}
          value={ratio}
          onChange={(e) => setRatio(e.target.value)}
        >
          {['0.3', '0.4', '0.5'].map((r) => (
            <option key={r} value={r}>
              {t('{pct} reserves', { pct: pct(Number(r), 0) })}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="subtle"
          disabled={!Number(companies) || !(parseAmount(avg) ?? 0)}
          onClick={() =>
            void send(
              {
                type: 'fund.plan',
                fundId,
                companies: Math.round(Number(companies)),
                avgCheque: parseAmount(avg) ?? 0,
                reserveRatio: Number(ratio),
              },
              (r: { message: string }) => tx(r.message),
            )
          }
        >
          {t('Save plan')}
        </Button>
      </div>

      <h3 className="cap-h">{t('Portfolio')}</h3>
      {o.positions.length === 0 ? (
        <p className="small muted">{t('No investments yet.')}</p>
      ) : (
        o.positions.map((p) => (
          <div key={p.companyId} className="inv-row">
            <span className="grow">
              <strong>{p.name}</strong>{' '}
              <Pill
                tone={
                  p.status === 'at-risk' ? 'warn' : p.status === 'written-off' ? 'bad' : undefined
                }
              >
                {positionStatusText(p.status)}
              </Pill>
              <div className="small muted">
                {t('In {in} · mark {mark} · back {out} · {moic}×', {
                  in: money(p.invested, cur),
                  mark: money(p.mark, cur),
                  out: money(p.returned, cur),
                  moic: p.moic.toFixed(2),
                })}
              </div>
            </span>
            {p.status !== 'written-off' && p.status !== 'exited' && (
              <span className="row">
                <input
                  aria-label={t('Reserve for {name}', { name: p.name })}
                  inputMode="decimal"
                  placeholder={money(p.reserve, cur)}
                  value={reserve[p.companyId] ?? ''}
                  onChange={(e) => setReserve((r) => ({ ...r, [p.companyId]: e.target.value }))}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void send(
                      {
                        type: 'fund.reserve',
                        fundId,
                        companyId: p.companyId,
                        amount: parseAmount(reserve[p.companyId] ?? '') ?? 0,
                      },
                      t('Reserve set.'),
                    )
                  }
                >
                  {t('Reserve')}
                </Button>
              </span>
            )}
          </div>
        ))
      )}

      <h3 className="cap-h">{t('Investment committee')}</h3>
      <p className="small muted">
        {t('Cheques over {amount} need the committee first.', {
          amount: money(o.icThreshold, cur),
        })}
      </p>
      <div className="row">
        <select
          aria-label={t('Company')}
          value={icCompany}
          onChange={(e) => setIcCompany(e.target.value)}
        >
          <option value="">{t('Pick a company')}</option>
          {raising.map((c) => (
            <option key={c.companyId} value={c.companyId}>
              {c.name}
            </option>
          ))}
          {o.positions.map((p) => (
            <option key={`f-${p.companyId}`} value={p.companyId}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          aria-label={t('Cheque')}
          inputMode="decimal"
          placeholder={t('Cheque')}
          value={icAmount}
          onChange={(e) => setIcAmount(e.target.value)}
        />
        <Button
          size="sm"
          variant="subtle"
          disabled={!icCompany || !(parseAmount(icAmount) ?? 0)}
          onClick={() =>
            void send(
              { type: 'fund.ic', fundId, companyId: icCompany, amount: parseAmount(icAmount) ?? 0 },
              (r: { message: string; reasons: string[] }) =>
                [tx(r.message), ...r.reasons.map(tx)].join(' '),
            )
          }
        >
          {t('Take it to IC (2h)')}
        </Button>
      </div>
      {o.ic.map((x) => (
        <div key={x.dealKey} className="small">
          {(view.directory.find((c) => c.id === x.companyId)?.name ?? '') + ' · '}
          {money(x.amount, cur)}{' '}
          <Pill
            tone={x.status === 'approved' ? 'good' : x.status === 'rejected' ? 'bad' : undefined}
          >
            {x.status === 'approved' ? t('approved') : t('rejected')}
          </Pill>
        </div>
      ))}

      <div className="row">
        <Button
          size="sm"
          variant="ghost"
          disabled={!icCompany}
          onClick={() =>
            void send(
              { type: 'fund.lpac', fundId, companyId: icCompany },
              (r: { message: string }) => tx(r.message),
            )
          }
        >
          {t('A conflict? Ask the LP advisory committee')}
        </Button>
      </div>

      <h3 className="cap-h">{t('Your LPs')}</h3>
      {o.letterDue && (
        <div className="career-invite">
          <p>
            {t(
              'The quarterly letter is due. Honest marks build trust; a rosy one wins a little now and backfires if the next round prices lower.',
            )}
          </p>
          <div className="row">
            <Button
              onClick={() =>
                void send({ type: 'fund.letter', fundId, honest: true }, (r: { message: string }) =>
                  tx(r.message),
                )
              }
            >
              {t('Write it straight (3h)')}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void send(
                  { type: 'fund.letter', fundId, honest: false },
                  (r: { message: string }) => tx(r.message),
                )
              }
            >
              {t('Talk the book up (3h)')}
            </Button>
          </div>
        </div>
      )}
      {o.relations.map((r, i) => (
        <div key={i} className="inv-row">
          <span className="grow">{r.name}</span>
          <span className="small">{t('trust {pct}', { pct: pct(r.trust, 0) })}</span>
          {r.reup && <Pill tone="good">{t('would re-up')}</Pill>}
        </div>
      ))}
      <p className="small muted">{t('{n} LPs would re-up into your next fund.', { n: o.reups })}</p>
      {!o.extension && (
        <Button
          variant="ghost"
          onClick={() =>
            void send({ type: 'fund.extend', fundId }, (r: { message: string }) => tx(r.message))
          }
        >
          {t('Ask LPs for an extension')}
        </Button>
      )}
      {o.extension && (
        <p className="small">
          {o.extension.status === 'open'
            ? t('LPs vote on an extension when the term ends.')
            : o.extension.status === 'approved'
              ? t('LPs extended the fund.')
              : t('LPs voted against an extension.')}
        </p>
      )}
    </div>
  );
}

/** Pro-rata offers: keep your ownership when a company you back raises again (§6.5). */
export function ProRataOffers() {
  const { view, send } = useView();
  const offers = (view as { prorata?: typeof view.prorata }).prorata ?? [];
  if (offers.length === 0) return null;
  return (
    <Card
      title={t('Pro-rata offers')}
      sub={t('Your right to keep your share of the next round')}
      tone="good"
    >
      {offers.map((o) => (
        <div key={o.id} className="inv-row" data-prorata={o.id}>
          <span className="grow">
            <strong>{o.companyName}</strong>{' '}
            {o.viaFund && (
              <span className="small muted">{t('via {fund}', { fund: o.viaFund })}</span>
            )}
            <div className="small">
              {t('{amount} at the round’s terms, until month {n}', {
                amount: money(o.amount, o.currency),
                n: o.expiresMonth,
              })}
            </div>
          </span>
          <Button
            size="sm"
            onClick={() =>
              void send(
                { type: 'prorata.answer', offerId: o.id, take: true },
                (r: { message: string }) => tx(r.message),
              )
            }
          >
            {t('Follow on')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void send({ type: 'prorata.answer', offerId: o.id, take: false }, t('Passed.'))
            }
          >
            {t('Pass')}
          </Button>
        </div>
      ))}
    </Card>
  );
}
