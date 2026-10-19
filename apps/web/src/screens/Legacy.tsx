/**
 * Institutions and legacy (investor blueprint §10.5, Phase 9): run your own
 * accelerator (cohorts of small SAFE cheques, a demo day each quarter) and
 * the hall of fame across every city.
 */
import type { PlayerView } from '@runway/engine';
import { useState } from 'react';
import { money, parseAmount, pct } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Empty, Pill } from '../ui';
import './investor.css';

type Accel = NonNullable<PlayerView['playerAccelerator']>;
type Hall = NonNullable<PlayerView['hallOfFame']>;

const accelOf = (view: PlayerView): Accel | null =>
  (view as { playerAccelerator?: Accel | null }).playerAccelerator ?? null;
const hallOf = (view: PlayerView): Hall | null =>
  (view as { hallOfFame?: Hall | null }).hallOfFame ?? null;

function AcceleratorCard({ a }: { a: Accel }) {
  const { view, send } = useView();
  const [name, setName] = useState('');
  const [cheque, setCheque] = useState('');
  const [equity, setEquity] = useState('700');
  const [admit, setAdmit] = useState('');
  const funds = ((view as { lpFunds?: PlayerView['lpFunds'] }).lpFunds?.gp ?? []).filter(
    (f) => f.stage === 'investing',
  );
  const [fundId, setFundId] = useState('');
  const x = a.accelerator;
  if (!x)
    return (
      <Card
        title={t('Run an accelerator')}
        sub={t('Small cheques, a cohort, a demo day each quarter')}
      >
        {a.canFound ? (
          <div className="inv-form">
            <div className="row">
              <input
                aria-label={t('Accelerator name')}
                placeholder={t('Accelerator name')}
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                aria-label={t('Cheque per startup')}
                inputMode="decimal"
                placeholder={t('{lo}–{hi} a startup', {
                  lo: money(a.limits.cheque[0]!, a.limits.currency),
                  hi: money(a.limits.cheque[1]!, a.limits.currency),
                })}
                value={cheque}
                onChange={(e) => setCheque(e.target.value)}
              />
              <select
                aria-label={t('Equity for the cheque')}
                value={equity}
                onChange={(e) => setEquity(e.target.value)}
              >
                {['500', '700', '1000'].map((b) => (
                  <option key={b} value={b}>
                    {pct(Number(b) / 10_000, 0)}
                  </option>
                ))}
              </select>
              {funds.length > 0 && (
                <select
                  aria-label={t('Pay from')}
                  value={fundId}
                  onChange={(e) => setFundId(e.target.value)}
                >
                  <option value="">{t('Your personal savings')}</option>
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <Button
              disabled={name.trim().length < 3 || !(parseAmount(cheque) ?? 0)}
              onClick={() =>
                void send(
                  {
                    type: 'accelerator.found',
                    name,
                    cheque: parseAmount(cheque) ?? 0,
                    equityBps: Number(equity),
                    ...(fundId ? { fundId } : {}),
                  },
                  (r: { message: string }) => tx(r.message),
                )
              }
            >
              {t('Open it')}
            </Button>
          </div>
        ) : (
          <Empty>{t('An accelerator comes once you run a fund (rung 4).')}</Empty>
        )}
      </Card>
    );
  const flow = (view.market.dealFlow ?? []).filter((d) => !x.admitted.includes(d.companyId));
  return (
    <Card
      title={x.name}
      sub={t('{cheque} for {pct} · {n} demo days', {
        cheque: money(x.cheque, x.currency),
        pct: pct(x.equityBps / 10_000, 0),
        n: x.demoDays,
      })}
    >
      {x.fundName && (
        <p className="small muted">{t('Cheques from {fund}.', { fund: x.fundName })}</p>
      )}
      <h3 className="cap-h">{t('Cohort')}</h3>
      {x.cohort.length === 0 ? (
        <p className="small muted">{t('No startups yet.')}</p>
      ) : (
        x.cohort.map((c) => (
          <div key={c.companyId} className="inv-row">
            <span className="grow">{c.name}</span>
            {c.done ? (
              <Pill>{t('graduated')}</Pill>
            ) : (
              <Pill tone="info">{t('demo day month {n}', { n: c.demoDayMonth ?? 0 })}</Pill>
            )}
          </div>
        ))
      )}
      <div className="row">
        <select aria-label={t('Startup')} value={admit} onChange={(e) => setAdmit(e.target.value)}>
          <option value="">{t('Pick a startup to admit')}</option>
          {flow.map((d) => (
            <option key={d.companyId} value={d.companyId}>
              {d.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!admit}
          onClick={() =>
            void send({ type: 'accelerator.admit', companyId: admit }, (r: { message: string }) =>
              tx(r.message),
            )
          }
        >
          {t('Offer a place')}
        </Button>
      </div>
    </Card>
  );
}

function Table({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; name: string; value: string }[];
}) {
  return (
    <>
      <h3 className="cap-h">{title}</h3>
      {rows.length === 0 ? (
        <p className="small muted">{t('Nobody yet.')}</p>
      ) : (
        <ol className="list small">
          {rows.map((r) => (
            <li key={r.key}>
              {r.name} <span className="muted">· {r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function HallOfFame({ h }: { h: Hall }) {
  return (
    <Card title={t('Hall of fame')} sub={t('Across every city')}>
      <Table
        title={t('Funds by cash returned')}
        rows={h.funds.map((f) => ({
          key: f.id,
          name: `${f.name} (${f.manager})`,
          value: `DPI ${f.dpi.toFixed(2)}×`,
        }))}
      />
      <Table
        title={t('Investors by realised gains')}
        rows={h.investors.map((x) => ({
          key: x.id,
          name: x.name,
          value: money(x.gainsUsd, 'USD'),
        }))}
      />
      <Table
        title={t('Firms by assets')}
        rows={h.firms.map((x) => ({
          key: x.id,
          name: `${x.name} (${x.head})`,
          value: money(x.aumUsd, 'USD'),
        }))}
      />
      <Table
        title={t('Syndicate leads by carry')}
        rows={h.syndicateLeads.map((x) => ({
          key: x.id,
          name: x.name,
          value: money(x.carryUsd, 'USD'),
        }))}
      />
      <Table
        title={t('Accelerators')}
        rows={h.accelerators.map((x) => ({
          key: x.id,
          name: `${x.name} (${x.owner})`,
          value: t('{n} startups · {d} demo days', { n: x.admitted, d: x.demoDays }),
        }))}
      />
    </Card>
  );
}

export function Legacy() {
  const { view } = useView();
  const a = accelOf(view);
  const h = hallOf(view);
  return (
    <div className="stack">
      {a && <AcceleratorCard a={a} />}
      {h && <HallOfFame h={h} />}
    </div>
  );
}
