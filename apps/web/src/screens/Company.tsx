import { useState } from 'react';
import type { BuildMode, Industry, RevenueModel } from '@runway/engine';
import { amountInput, money, parseAmount, pct, titleCase } from '../format';
import { useView, type Company as CompanyT } from '../store';
import { Bar, Button, Card, Confirm, Empty, Field, Pill, Segmented, Sheet } from '../ui';

type Tab = 'product' | 'customers' | 'team' | 'rules';

export function CompanyScreen() {
  const { view } = useView();
  const [tab, setTab] = useState<Tab>('product');
  const c = view.companies.find((x) => x.status === 'active');
  if (!c) return <Empty>No active company. Start one from Home.</Empty>;
  return (
    <>
      <div className="spread">
        <h1>{c.name}</h1>
        <Pill>{c.industryLabel}</Pill>
      </div>
      <p className="muted small">{c.idea}</p>
      <div className="tabs" role="tablist">
        {(['product', 'customers', 'team', 'rules'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {titleCase(t)}
          </button>
        ))}
      </div>
      {tab === 'product' && <Product c={c} />}
      {tab === 'customers' && <Customers c={c} />}
      {tab === 'team' && <Team c={c} />}
      {tab === 'rules' && <Rules c={c} />}
    </>
  );
}

function Product({ c }: { c: CompanyT }) {
  const { send, view } = useView();
  const [pivot, setPivot] = useState(false);
  return (
    <>
      <Card title="Product">
        <Bar label="Product fit" value={c.product.fit} />
        <Bar
          label="Reliability"
          value={c.product.reliability}
          tone={c.product.reliability < 0.35 ? 'bad' : undefined}
        />
        <Bar label="Quality" value={c.product.quality} />
        <Bar
          label="Tech debt"
          value={c.product.techDebt}
          tone={c.product.techDebt > 0.5 ? 'bad' : 'warn'}
        />
        <Field
          label="Build mode"
          hint="Fast ships fit sooner but piles up tech debt. Quality pays it down."
        >
          {() => (
            <Segmented<BuildMode>
              label="Build mode"
              value={c.product.buildMode}
              options={[
                { value: 'fast', label: 'Fast' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'quality', label: 'Quality' },
              ]}
              onChange={(v) =>
                void send(
                  { type: 'company.strategy', companyId: c.id, buildMode: v },
                  `Build mode: ${v}.`,
                )
              }
            />
          )}
        </Field>
        <div className="row">
          <Button
            onClick={() =>
              void send(
                { type: 'company.build', companyId: c.id, hours: 40 },
                (r: { message: string }) => r.message,
              )
            }
            disabled={view.me.hours.left < 40}
          >
            Build yourself (40h)
          </Button>
          <span className="small muted">{view.me.hours.left}h left this month</span>
        </div>
        <p className="small muted">
          Engineers and product staff build every month. Customer discovery makes building count.
        </p>
      </Card>
      <Card
        title="Pivot"
        action={
          <Button variant="ghost" onClick={() => setPivot(true)}>
            Consider a pivot
          </Button>
        }
      >
        <p className="small muted">
          Keeps cash, team, investors and code. Costs customers, morale and trust. Pivots so far:{' '}
          {c.pivots}.
        </p>
      </Card>
      {pivot && <PivotSheet c={c} onClose={() => setPivot(false)} />}
    </>
  );
}

function PivotSheet({ c, onClose }: { c: CompanyT; onClose: () => void }) {
  const { send, view, meta } = useView();
  const [kind, setKind] = useState<'customer' | 'product' | 'market' | 'model'>('customer');
  const [segment, setSegment] = useState(
    view.market.segments.find((s) => s.industry === c.industry && !c.targetSegments.includes(s.key))
      ?.key ?? '',
  );
  const [industry, setIndustry] = useState<Industry>(c.industry === 'fintech' ? 'saas' : 'fintech');
  const [model, setModel] = useState<RevenueModel>(
    c.revenueModel === 'subscription' ? 'transaction' : 'subscription',
  );
  const go = async () => {
    const r = await send(
      {
        type: 'company.pivot',
        companyId: c.id,
        kind,
        ...(kind === 'customer'
          ? { segments: [segment] }
          : kind === 'market'
            ? { industry }
            : kind === 'model'
              ? { revenueModel: model }
              : {}),
      },
      (x: { message: string }) => x.message,
    );
    if (r) onClose();
  };
  return (
    <Sheet title="Pivot" onClose={onClose}>
      <Segmented
        label="Pivot type"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'customer', label: 'Customer' },
          { value: 'product', label: 'Product' },
          { value: 'market', label: 'Sector' },
          { value: 'model', label: 'Model' },
        ]}
      />
      {kind === 'customer' && (
        <Field label="New customer segment">
          {(id) => (
            <select id={id} value={segment} onChange={(e) => setSegment(e.target.value)}>
              {view.market.segments
                .filter((s) => s.industry === c.industry)
                .map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
            </select>
          )}
        </Field>
      )}
      {kind === 'market' && (
        <Field label="New sector">
          {(id) => (
            <select
              id={id}
              value={industry}
              onChange={(e) => setIndustry(e.target.value as Industry)}
            >
              {meta?.industries
                .filter((i) => i.id !== c.industry)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
            </select>
          )}
        </Field>
      )}
      {kind === 'model' && (
        <Field label="New revenue model">
          {(id) => (
            <select
              id={id}
              value={model}
              onChange={(e) => setModel(e.target.value as RevenueModel)}
            >
              {meta?.revenueModels
                .filter((m) => m !== c.revenueModel)
                .map((m) => (
                  <option key={m} value={m}>
                    {titleCase(m)}
                  </option>
                ))}
            </select>
          )}
        </Field>
      )}
      {kind === 'product' && (
        <p className="small muted">
          New product for the same customers. Fit halves; you keep the customer insight.
        </p>
      )}
      <p className="small muted">
        Costs 20 hours. Some customers leave, morale drops, some staff quit.
      </p>
      <Button onClick={() => void go()}>Pivot</Button>
    </Sheet>
  );
}

function Customers({ c }: { c: CompanyT }) {
  const { send, view, cur } = useView();
  const [price, setPrice] = useState(amountInput(c.price));
  const [mkt, setMkt] = useState(amountInput(c.marketingBudget));
  const [salary, setSalary] = useState(amountInput(c.founderSalary));
  const segs = view.market.segments.filter((s) => s.industry === c.industry);
  const toggleTarget = (key: string) => {
    const next = c.targetSegments.includes(key)
      ? c.targetSegments.filter((k) => k !== key)
      : [...c.targetSegments, key].slice(-2);
    if (next.length === 0) return;
    void send(
      { type: 'company.strategy', companyId: c.id, targetSegments: next },
      'Targets updated.',
    );
  };
  const save = () =>
    send(
      {
        type: 'company.strategy',
        companyId: c.id,
        price: parseAmount(price) ?? c.price,
        marketingBudget: parseAmount(mkt) ?? c.marketingBudget,
        founderSalary: parseAmount(salary) ?? c.founderSalary,
      },
      'Saved. It applies at month end.',
    );
  return (
    <>
      {segs.map((s) => {
        const pos = c.segments.find((x) => x.key === s.key);
        const targeted = c.targetSegments.includes(s.key);
        return (
          <Card
            key={s.key}
            title={
              <>
                {s.name} <Pill>{s.kind.toUpperCase()}</Pill>
              </>
            }
            action={
              <Button variant={targeted ? 'primary' : 'ghost'} onClick={() => toggleTarget(s.key)}>
                {targeted ? 'Targeting' : 'Target'}
              </Button>
            }
          >
            <p className="small">{s.needsLabel}</p>
            <p className="small muted">
              {s.buyers.toLocaleString('en-GB')} buyers · budget {money(s.budget, cur)}/mo ·{' '}
              {s.incumbentName} serves {s.incumbentShare}%
              {s.kind === 'b2b' ? ` · ${s.salesCycle[0]}–${s.salesCycle[1]} month sales cycle` : ''}
            </p>
            {pos && (
              <>
                <div className="funnel" aria-label="Funnel">
                  <div>
                    <b>{pos.funnel.aware.toLocaleString('en-GB')}</b>Aware
                  </div>
                  <div>
                    <b>{pos.funnel.interested.toLocaleString('en-GB')}</b>Interested
                  </div>
                  <div>
                    <b>{pos.funnel.trial.toLocaleString('en-GB')}</b>
                    {s.kind === 'b2b' ? 'Pipeline' : 'Trial'}
                  </div>
                  <div>
                    <b>{pos.paying.toLocaleString('en-GB')}</b>Paying
                  </div>
                  <div>
                    <b className={pos.churned > 0 ? 'bad' : ''}>
                      {pos.churned.toLocaleString('en-GB')}
                    </b>
                    Churned
                  </div>
                </div>
                <Bar label="Fit for this segment" value={pos.fit} />
              </>
            )}
            <Button
              variant="subtle"
              onClick={() =>
                void send(
                  { type: 'company.discovery', companyId: c.id, segmentKey: s.key },
                  (r: { message: string }) => r.message,
                )
              }
            >
              Customer discovery (20h)
            </Button>
          </Card>
        );
      })}
      <Card title="Pricing and spend">
        <Field
          label={`Price per customer per month (${cur})`}
          hint={`Segment budgets: ${segs.map((s) => money(s.budget, cur)).join(' / ')}`}
        >
          {(id) => <input id={id} value={price} onChange={(e) => setPrice(e.target.value)} />}
        </Field>
        <Field label={`Marketing per month (${cur})`}>
          {(id) => <input id={id} value={mkt} onChange={(e) => setMkt(e.target.value)} />}
        </Field>
        <Field
          label={`Your salary per month (${cur})`}
          hint="Paid by the company, taxed, and visible to investors."
        >
          {(id) => <input id={id} value={salary} onChange={(e) => setSalary(e.target.value)} />}
        </Field>
        <Button onClick={() => void save()}>Save</Button>
      </Card>
    </>
  );
}

function Team({ c }: { c: CompanyT }) {
  const { view, cur, send } = useView();
  const [role, setRole] = useState<string>('engineer');
  const [offer, setOffer] = useState<(typeof view.market.talent)[number] | null>(null);
  const [raiseFor, setRaiseFor] = useState<CompanyT['staff'][number] | null>(null);
  const pool = view.market.talent.filter((t) => t.role === role);
  return (
    <>
      <Card
        title={`Team · ${c.staff.length}`}
        action={
          <Pill tone={c.management.overloaded ? 'bad' : undefined}>
            Can manage {c.management.capacity}
          </Pill>
        }
      >
        {c.staff.length === 0 ? (
          <Empty>Just you. Hire when the budget allows.</Empty>
        ) : (
          <ul className="list">
            {c.staff.map((s) => (
              <li key={s.id}>
                <div className="spread">
                  <div>
                    <div className="item-title">{s.name}</div>
                    <div className="small muted">
                      {titleCase(s.seniority)} {s.role} · {money(s.salary, cur)}/mo
                      {s.equityBps ? ` · ${s.equityBps / 100}%` : ''} · {s.personality}
                    </div>
                  </div>
                  <div className="row">
                    <Button variant="ghost" onClick={() => setRaiseFor(s)}>
                      Raise
                    </Button>
                  </div>
                </div>
                <Bar
                  label="Morale"
                  value={s.morale / 100}
                  tone={s.morale < 35 ? 'bad' : s.morale < 55 ? 'warn' : 'good'}
                />
                <div className="row">
                  <Confirm
                    label="Let go"
                    confirmLabel="Let go with 2 months’ pay"
                    variant="primary"
                    onConfirm={() =>
                      void send(
                        { type: 'company.layoff', companyId: c.id, staffId: s.id, generous: true },
                        (r: { message: string }) => r.message,
                      )
                    }
                  />
                  <Confirm
                    label="Let go (no pay)"
                    confirmLabel="Yes, nothing"
                    onConfirm={() =>
                      void send(
                        { type: 'company.layoff', companyId: c.id, staffId: s.id, generous: false },
                        (r: { message: string }) => r.message,
                      )
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {c.management.overloaded && (
          <p className="small bad">
            Too many people per manager. Morale falls and mistakes rise. Hire a head or seniors.
          </p>
        )}
      </Card>
      <Card title="Hire">
        <div className="chips" style={{ marginBottom: '0.5rem' }}>
          {['engineer', 'product', 'sales', 'marketing', 'support', 'operations', 'finance'].map(
            (r) => (
              <button key={r} className="chip" aria-pressed={role === r} onClick={() => setRole(r)}>
                {titleCase(r)}
              </button>
            ),
          )}
        </div>
        {pool.length === 0 ? (
          <Empty>No one looking right now. The pool refreshes monthly.</Empty>
        ) : (
          <ul className="list">
            {pool.map((t) => (
              <li key={t.id} className="spread">
                <div>
                  <div className="item-title">{t.name}</div>
                  <div className="small muted">
                    {titleCase(t.seniority)} · skill {Math.round(t.skill * 100)} · asks{' '}
                    {money(t.ask, cur)} ·{' '}
                    {t.equityPreference > 0.6 ? 'likes equity' : 'prefers cash'}
                    {t.competingOffers
                      ? ` · ${t.competingOffers} other offer${t.competingOffers > 1 ? 's' : ''}`
                      : ''}
                  </div>
                </div>
                <Button variant="subtle" onClick={() => setOffer(t)}>
                  Offer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {offer && <OfferSheet c={c} cand={offer} onClose={() => setOffer(null)} />}
      {raiseFor && <RaiseSheet c={c} staff={raiseFor} onClose={() => setRaiseFor(null)} />}
    </>
  );
}

function OfferSheet({
  c,
  cand,
  onClose,
}: {
  c: CompanyT;
  cand: ReturnType<typeof useView>['view']['market']['talent'][number];
  onClose: () => void;
}) {
  const { send, cur } = useView();
  const [salary, setSalary] = useState(amountInput(cand.ask));
  const [equity, setEquity] = useState(0);
  const [reply, setReply] = useState<{ outcome: string; reason: string; salary?: number } | null>(
    null,
  );
  const make = async () => {
    const r = await send<{ outcome: string; reason: string; salary?: number }>({
      type: 'company.offer',
      companyId: c.id,
      candidateId: cand.id,
      salary: parseAmount(salary) ?? cand.ask,
      equityBps: Math.round(equity * 100),
    });
    if (!r) return;
    setReply(r);
    if (r.outcome === 'counter' && r.salary) setSalary(amountInput(r.salary));
  };
  return (
    <Sheet title={`Offer to ${cand.name}`} onClose={onClose}>
      <p className="small muted">
        {titleCase(cand.seniority)} {cand.role}. Asks {money(cand.ask, cur)}/month.
      </p>
      <Field label={`Salary per month (${cur})`}>
        {(id) => <input id={id} value={salary} onChange={(e) => setSalary(e.target.value)} />}
      </Field>
      <Field
        label={`Equity: ${equity}%`}
        hint="Granted from the option pool, vesting over four years."
      >
        {(id) => (
          <input
            id={id}
            type="range"
            min={0}
            max={5}
            step={0.1}
            value={equity}
            onChange={(e) => setEquity(Number(e.target.value))}
          />
        )}
      </Field>
      {reply && (
        <Card tone={reply.outcome === 'accept' ? 'good' : 'warn'}>
          <p>
            <b>
              {reply.outcome === 'accept'
                ? 'Accepted'
                : reply.outcome === 'counter'
                  ? 'Counter'
                  : 'Declined'}
              :
            </b>{' '}
            “{reply.reason}”
          </p>
        </Card>
      )}
      {reply?.outcome === 'accept' ? (
        <Button onClick={onClose}>Done</Button>
      ) : reply?.outcome === 'decline' ? (
        <Button variant="ghost" onClick={onClose}>
          Walk away
        </Button>
      ) : (
        <div className="row">
          <Button onClick={() => void make()}>
            {reply?.outcome === 'counter' ? 'Raise the offer' : 'Make offer'} (2h)
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Walk away
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function RaiseSheet({
  c,
  staff,
  onClose,
}: {
  c: CompanyT;
  staff: CompanyT['staff'][number];
  onClose: () => void;
}) {
  const { send, cur } = useView();
  const [salary, setSalary] = useState(amountInput(Math.round(staff.salary * 1.1)));
  return (
    <Sheet title={`Raise for ${staff.name}`} onClose={onClose}>
      <p className="small muted">
        Now {money(staff.salary, cur)}/month. Pay below the market band drags morale.
      </p>
      <Field label={`New salary (${cur})`}>
        {(id) => <input id={id} value={salary} onChange={(e) => setSalary(e.target.value)} />}
      </Field>
      <Button
        onClick={() =>
          void send(
            {
              type: 'company.raiseSalary',
              companyId: c.id,
              staffId: staff.id,
              salary: parseAmount(salary) ?? staff.salary,
            },
            (r: { message: string }) => r.message,
          ).then((r) => r && onClose())
        }
      >
        Give raise
      </Button>
    </Sheet>
  );
}

function Rules({ c }: { c: CompanyT }) {
  const { send, cur, view } = useView();
  return (
    <>
      {c.rules.map((r) => (
        <Card
          key={r.id}
          title={r.title}
          action={
            r.done ? (
              <Pill tone="good">Compliant</Pill>
            ) : (
              <Button
                variant="subtle"
                onClick={() =>
                  void send(
                    { type: 'company.comply', companyId: c.id, ruleId: r.id },
                    (x: { message: string }) => x.message,
                  )
                }
              >
                Comply ({r.hours}h)
              </Button>
            )
          }
        >
          <p className="small">{r.requires}</p>
          <p className="small muted">
            Cost {money(Math.round(view.market.costOfLiving * r.costCol), cur)} · Penalty:{' '}
            {r.penalty} · {r.regulator}
          </p>
        </Card>
      ))}
      <p className="disclaimer">
        Rule cards simplify real law for the game. Nothing here is legal, financial or tax advice.
      </p>
      <Card title="Shut down">
        <p className="small muted">
          Staff are paid first, then creditors, then investors by preference. Winding down properly
          protects your stars.
        </p>
        <Confirm
          label={`Shut down ${c.name}`}
          confirmLabel="Yes, wind down properly"
          onConfirm={() =>
            void send(
              { type: 'company.shutdown', companyId: c.id },
              (r: { message: string }) => r.message,
            )
          }
        />
      </Card>
      <p className="small muted">
        Monthly churn last month:{' '}
        {pct(
          c.segments.reduce((a, s) => a + s.churned, 0) /
            Math.max(
              1,
              c.segments.reduce((a, s) => a + s.paying + s.churned, 0),
            ),
          1,
        )}
      </p>
    </>
  );
}
