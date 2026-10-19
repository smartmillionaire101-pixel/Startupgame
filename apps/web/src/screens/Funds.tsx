/**
 * Funds raised the full way and LP investing (investor blueprint §5.3
 * "Fund dashboard" and "LP portfolio", §7.3, §8.2, Phases 4–5): the GP's
 * console (terms, LP pipeline, closes, capital, and — once investing —
 * the management tools) and the LP portfolio (funds raising, commitments,
 * capital calls with deadlines, distributions).
 */
import type { PlayerView } from '@runway/engine';
import { useState } from 'react';
import { money, parseAmount, pct } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Empty, Field, Pill, Segmented, Stat } from '../ui';
import { stageLabel } from './common';
import { FundManagement } from './FundOps';
import './investor.css';

type LpFunds = NonNullable<PlayerView['lpFunds']>;
type GpFund = LpFunds['gp'][number];
type FundCardView = LpFunds['raising'][number];

export const lpFundsOf = (view: PlayerView): LpFunds | null =>
  (view as { lpFunds?: LpFunds | null }).lpFunds ?? null;

export function fundStageText(s: string): string {
  switch (s) {
    case 'raising':
      return t('raising');
    case 'investing':
      return t('investing');
    case 'harvest':
      return t('harvest');
    case 'extended':
      return t('extended');
    case 'wound-down':
      return t('wound down');
    default:
      return t('did not close');
  }
}

function strategyText(s: string): string {
  switch (s) {
    case 'growth':
      return t('Growth');
    case 'public':
      return t('Public equity / crossover');
    case 'impact':
      return t('Impact');
    case 'fof':
      return t('Fund of funds');
    default:
      return t('Seed');
  }
}

function LaunchForm({ lp }: { lp: LpFunds }) {
  const { view, send, meta } = useView();
  const d = lp.defaults;
  const [sectors, setSectors] = useState<string[]>(view.me.investor?.sectors ?? []);
  const [stages, setStages] = useState<string[]>(['seed']);
  const [why, setWhy] = useState('');
  const [strategy, setStrategy] = useState<'seed' | 'growth' | 'public' | 'impact' | 'fof'>('seed');
  const [target, setTarget] = useState('');
  const [min, setMin] = useState('');
  const [fee, setFee] = useState('0.02');
  const [carry, setCarry] = useState('0.2');
  const [hurdle, setHurdle] = useState('0');
  const [gp, setGp] = useState('0.02');
  const targetAmount = parseAmount(target) ?? d.minTarget * 2;
  const minAmount = parseAmount(min) ?? Math.round(targetAmount / 50);
  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  return (
    <div className="inv-form">
      <Field label={t('Strategy')}>
        {(id) => (
          <select id={id} value={strategy} onChange={(e) => setStrategy(e.target.value as never)}>
            {(['seed', 'growth', 'public', 'impact', 'fof'] as const).map((s) => (
              <option key={s} value={s}>
                {strategyText(s)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('Sectors')}>
        {() => (
          <div className="chips">
            {meta?.industries.map((i) => (
              <button
                key={i.id}
                className="chip"
                aria-pressed={sectors.includes(i.id)}
                onClick={() => setSectors((s) => toggle(s, i.id))}
              >
                {tx(i.label)}
              </button>
            ))}
          </div>
        )}
      </Field>
      <Field label={t('Stages')}>
        {() => (
          <div className="chips">
            {['pre-seed', 'seed', 'series-a', 'series-b', 'growth'].map((s) => (
              <button
                key={s}
                className="chip"
                aria-pressed={stages.includes(s)}
                onClick={() => setStages((x) => toggle(x, s))}
              >
                {stageLabel(s)}
              </button>
            ))}
          </div>
        )}
      </Field>
      <Field label={t('Why now, and why you’ll win (one line)')}>
        {(id) => (
          <input id={id} value={why} maxLength={200} onChange={(e) => setWhy(e.target.value)} />
        )}
      </Field>
      <div className="grid2">
        <Field
          label={t('Target size')}
          hint={t('At least {amount}', { amount: money(d.minTarget, d.currency) })}
        >
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('Smallest commitment')}>
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              placeholder={money(Math.round(targetAmount / 50), d.currency)}
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Segmented
        label={t('Management fee')}
        value={fee}
        onChange={setFee}
        options={['0.015', '0.02', '0.025'].map((v) => ({ value: v, label: pct(Number(v), 1) }))}
      />
      <Segmented
        label={t('Carry')}
        value={carry}
        onChange={setCarry}
        options={['0.15', '0.2', '0.25'].map((v) => ({ value: v, label: pct(Number(v), 0) }))}
      />
      <Segmented
        label={t('Hurdle a year')}
        value={hurdle}
        onChange={setHurdle}
        options={['0', '0.06', '0.08'].map((v) => ({ value: v, label: pct(Number(v), 0) }))}
      />
      <Segmented
        label={t('Your own commitment')}
        value={gp}
        onChange={setGp}
        options={['0.01', '0.02'].map((v) => ({ value: v, label: pct(Number(v), 0) }))}
      />
      <p className="inv-note">
        {t(
          'Fund life {term} months: {invest} investing, then harvest. The fee steps down to {step} after the investment period. You commit {gp} of the fund from your own savings, called like everyone else’s.',
          {
            term: d.termMonths,
            invest: d.investMonths,
            step: pct(d.feeStepDown, 1),
            gp: pct(Number(gp), 0),
          },
        )}
      </p>
      <Button
        disabled={!sectors.length || !stages.length || why.trim().length < 10}
        onClick={() =>
          void send(
            {
              type: 'fund.launch',
              sectors: sectors as never,
              stages: stages as never,
              checkSize: view.me.investor?.checkSize ?? 0,
              why,
              strategy,
              target: targetAmount,
              minCommit: minAmount,
              feeRate: Number(fee),
              carry: Number(carry),
              hurdle: Number(hurdle),
              gpCommit: Number(gp),
              termMonths: d.termMonths,
              investMonths: d.investMonths,
              keyPerson: true,
            },
            (r: { message: string }) => tx(r.message),
          )
        }
      >
        {t('Start raising (15h)')}
      </Button>
    </div>
  );
}

function kindText(k: string): string {
  switch (k) {
    case 'player':
      return t('Player');
    case 'gp':
      return t('You (GP)');
    case 'pension':
      return t('Pension fund');
    case 'family-office':
      return t('Family office');
    case 'endowment':
      return t('Endowment');
    case 'dfi-fof':
      return t('DFI fund-of-funds');
    default:
      return t('Sovereign fund');
  }
}

function GpFundCard({ f }: { f: GpFund }) {
  const { send } = useView();
  const progress = f.committed / Math.max(1, f.target);
  return (
    <Card
      title={f.name}
      sub={`${strategyText(f.strategy)} · ${fundStageText(f.stage)}`}
      tone={f.stage === 'failed' ? 'bad' : f.stage === 'raising' ? undefined : 'good'}
      className="fund-card"
    >
      <div className="inv-grid">
        <Stat
          label={t('Committed')}
          value={money(f.committed, f.currency)}
          hint={t('{pct} of the {target} target', {
            pct: pct(progress, 0),
            target: money(f.target, f.currency),
          })}
        />
        <Stat label={t('Paid in')} value={money(f.paidIn, f.currency)} />
        <Stat label={t('Cash in the fund')} value={money(f.cash, f.currency)} tone="money" />
        <Stat label={t('LPs')} value={f.lps} />
      </div>
      {f.stage === 'raising' && (
        <>
          <p className="small">
            {t(
              'A first close needs {amount} committed. {n} months left to get there, or the raise fails and commitments are released.',
              { amount: money(f.firstCloseNeed, f.currency), n: f.monthsLeftToRaise ?? 0 },
            )}
          </p>
          <div className="row">
            <Button
              disabled={!f.canFirstClose}
              onClick={() =>
                void send({ type: 'fund.close', fundId: f.id }, (r: { message: string }) =>
                  tx(r.message),
                )
              }
            >
              {t('Hold the first close')}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void send({ type: 'fund.abandon', fundId: f.id }, t('Raise called off.'))
              }
            >
              {t('Call off the raise')}
            </Button>
          </div>
          <h3 className="cap-h">{t('LP pipeline')}</h3>
          <p className="inv-note">
            {t(
              'Meet AI LPs at their offices in the Investor Quarter (they decide at month end). Players commit from their LP portfolio.',
            )}
          </p>
          {f.lpPipeline.map((x) => (
            <div key={x.id} className="inv-row">
              <span className="grow">
                {x.name} <span className="small muted">{kindText(x.kind)}</span>
              </span>
              {x.laterFundsOnly ? (
                <Pill>{t('Fund II and later')}</Pill>
              ) : (
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() =>
                    void send(
                      { type: 'lp.pitch', lpId: x.id, fundId: f.id },
                      (r: { message: string }) => tx(r.message),
                    )
                  }
                >
                  {t('Pitch')}
                </Button>
              )}
            </div>
          ))}
        </>
      )}
      {f.canFinalClose && (
        <Button
          variant="secondary"
          onClick={() =>
            void send({ type: 'fund.close', fundId: f.id }, (r: { message: string }) =>
              tx(r.message),
            )
          }
        >
          {t('Hold the final close')}
        </Button>
      )}
      <h3 className="cap-h">{t('LPs')}</h3>
      {f.commitments.map((c) => (
        <div key={c.id} className="inv-row" data-commitment={c.kind}>
          <span className="grow">
            {c.name} <span className="small muted">{kindText(c.kind)}</span>{' '}
            {c.anchor && <Pill tone="info">{t('Anchor')}</Pill>}
            {c.status === 'defaulted' && <Pill tone="bad">{t('Defaulted')}</Pill>}
          </span>
          <span className="small">
            {t('{paid} of {committed} paid', {
              paid: money(c.paidIn, f.currency),
              committed: money(c.committed, f.currency),
            })}
          </span>
        </div>
      ))}
      {f.strategy === 'fof' && f.stage === 'investing' && <FofCommits fundId={f.id} />}
      {f.stage !== 'raising' && f.stage !== 'failed' && <FundManagement fundId={f.id} />}
    </Card>
  );
}

/** The GP's console: start a raise, then run each fund. */
export function FundConsole() {
  const { view } = useView();
  const lp = lpFundsOf(view);
  if (!lp) return null;
  const raising = lp.gp.some((f) => f.stage === 'raising');
  return (
    <div className="stack">
      {lp.gp.map((f) => (
        <GpFundCard key={f.id} f={f} />
      ))}
      {lp.canLaunch && !raising ? (
        <Card
          title={t('Raise a fund the full way')}
          sub={t('Your terms, your LPs, a first and a final close')}
        >
          <LaunchForm lp={lp} />
        </Card>
      ) : (
        !raising && (
          <Card title={t('Raise a fund the full way')}>
            <Empty>
              {lp.gp.length === 0
                ? t('Fund I opens at rung 3: three deals and an LP panel score of 0.42.')
                : t(
                    'Fund II opens at rung 5: Fund I returned 0.5× in cash and two LPs would re-up.',
                  )}
            </Empty>
          </Card>
        )
      )}
    </div>
  );
}

function JoinRow({ f }: { f: FundCardView }) {
  const { send } = useView();
  const [amount, setAmount] = useState('');
  const v = parseAmount(amount) ?? 0;
  return (
    <div className="inv-row" data-fund={f.id}>
      <div className="grow">
        <strong>{f.name}</strong> {f.ai && <span className="small muted">{t('AI fund')}</span>}
        <div className="small muted">
          {t('{manager} · {city} · {stage}', {
            manager: f.managerName,
            city: f.city,
            stage: fundStageText(f.stage),
          })}
        </div>
        <div className="small">{tx(f.thesis)}</div>
        <div className="small muted">
          {f.terms
            ? t('Target {target} · fee {fee} · carry {carry} · {n} LPs', {
                target: money(f.target, f.currency),
                fee: pct(f.terms.feeRate, 1),
                carry: pct(f.terms.carry, 0),
                n: f.lps,
              })
            : t('Size {size}', { size: money(f.size, f.currency) })}
        </div>
        <div className="small">
          {'dpi' in f.record
            ? t('Track record: {deals} deals, {exits} exits, {writeOffs} write-offs, DPI {dpi}×', {
                deals: f.record.deals,
                exits: f.record.exits,
                writeOffs: f.record.writeOffs,
                dpi: f.record.dpi,
              })
            : t(
                'Track record: {deals} deals, {writeOffs} write-offs. Diligence shows cash returned.',
                {
                  deals: f.record.deals,
                  writeOffs: f.record.writeOffs,
                },
              )}
        </div>
        <div className="row">
          {!f.diligenced && !f.ai && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void send({ type: 'lp.diligence', fundId: f.id }, (r: { message: string }) =>
                  tx(r.message),
                )
              }
            >
              {t('LP diligence (6h)')}
            </Button>
          )}
          <input
            aria-label={t('Commitment')}
            inputMode="decimal"
            placeholder={t('From {amount}', { amount: money(f.minCommit, f.currency) })}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button
            size="sm"
            disabled={v < f.minCommit}
            onClick={() =>
              void send({ type: 'lp.commit', fundId: f.id, amount: v }, (r: { message: string }) =>
                tx(r.message),
              )
            }
          >
            {t('Commit')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The LP portfolio: calls due, commitments, and funds raising (§5.3). */
export function LpPortfolio() {
  const { view, send } = useView();
  const lp = lpFundsOf(view);
  if (!lp) return null;
  const cur = view.market.currency;
  return (
    <div className="stack">
      {lp.calls.length > 0 && (
        <Card title={t('Capital calls due')} tone="warn">
          {lp.calls.map((c) => (
            <div key={c.id} className="inv-row" data-call={c.id}>
              <span className="grow">
                {c.fundName}{' '}
                <span className="small muted">
                  {t('due by month {n} (now {m})', { n: c.dueMonth, m: c.month })}
                </span>
              </span>
              <strong>{money(c.amount, c.currency)}</strong>
              <Button
                size="sm"
                onClick={() =>
                  void send({ type: 'lp.pay', callId: c.id }, (r: { message: string }) =>
                    tx(r.message),
                  )
                }
              >
                {t('Pay')}
              </Button>
              {c.canDelay && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void send({ type: 'lp.delay', callId: c.id }, (r: { message: string }) =>
                      tx(r.message),
                    )
                  }
                >
                  {t('Ask for a month')}
                </Button>
              )}
            </div>
          ))}
          <p className="inv-note">
            {t(
              'Missing a call forfeits a quarter of what you paid into that fund, goes on your credit record, and bars new commitments for six months.',
            )}
          </p>
        </Card>
      )}
      <Card title={t('Your LP commitments')}>
        {lp.book.length === 0 ? (
          <Empty>{t('No commitments yet.')}</Empty>
        ) : (
          lp.book.map((f) => (
            <div key={f.id} className="inv-row">
              <span className="grow">
                <strong>{f.name}</strong>{' '}
                {f.yours?.status === 'defaulted' && <Pill tone="bad">{t('Defaulted')}</Pill>}
                <div className="small muted">
                  {t('Committed {c} · paid in {p} · back {d}', {
                    c: money(f.yours?.committed ?? 0, f.currency),
                    p: money(f.yours?.paidIn ?? 0, f.currency),
                    d: money(f.yours?.distributed ?? 0, f.currency),
                  })}
                </div>
              </span>
              {!f.ai && f.yours?.status === 'committed' && (
                <label className="row small">
                  <input
                    type="checkbox"
                    checked={!!f.yours?.autopay}
                    onChange={(e) =>
                      void send(
                        { type: 'lp.autopay', fundId: f.id, on: e.target.checked },
                        e.target.checked
                          ? t('Calls will be paid automatically.')
                          : t('Autopay off.'),
                      )
                    }
                  />{' '}
                  {t('Autopay calls')}
                </label>
              )}
            </div>
          ))
        )}
      </Card>
      <Card
        title={t('Funds you can join')}
        sub={t('Diversified venture, paid in over capital calls')}
      >
        {!lp.trackOpen ? (
          <Empty>
            {t('LP commitments open at {amount} of liquid wealth.', {
              amount: money(lp.trackNeed, cur),
            })}
          </Empty>
        ) : lp.bannedUntil !== null ? (
          <Empty>
            {t('After a missed call: no new commitments until month {n}.', { n: lp.bannedUntil })}
          </Empty>
        ) : lp.raising.length === 0 ? (
          <Empty>{t('No fund is raising right now.')}</Empty>
        ) : (
          lp.raising.map((f) => <JoinRow key={f.id} f={f} />)
        )}
      </Card>
    </div>
  );
}

/** A fund of funds backs other managers' funds (Phase 7). */
function FofCommits({ fundId }: { fundId: string }) {
  const { view, send } = useView();
  const lp = lpFundsOf(view);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const targets = (lp?.raising ?? []).filter((x) => x.strategy !== 'fof');
  return (
    <div className="inv-form">
      <h3 className="cap-h">{t('Back other managers')}</h3>
      {targets.length === 0 ? (
        <p className="small muted">{t('No fund is raising right now.')}</p>
      ) : (
        targets.map((x) => (
          <div key={x.id} className="inv-row">
            <span className="grow">
              {x.name} <span className="small muted">{x.managerName}</span>
            </span>
            <input
              aria-label={t('Commitment')}
              inputMode="decimal"
              placeholder={t('From {amount}', { amount: money(x.minCommit, x.currency) })}
              value={amounts[x.id] ?? ''}
              onChange={(e) => setAmounts((a) => ({ ...a, [x.id]: e.target.value }))}
            />
            <Button
              size="sm"
              onClick={() =>
                void send(
                  {
                    type: 'fof.commit',
                    fundId,
                    targetFundId: x.id,
                    amount: parseAmount(amounts[x.id] ?? '') ?? 0,
                  },
                  (r: { message: string }) => tx(r.message),
                )
              }
            >
              {t('Commit')}
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
