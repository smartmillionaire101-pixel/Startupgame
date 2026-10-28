import { HireBrings } from './SalesTeam';
import { useEffect, useState } from 'react';
import { FoundCompany } from './Me';
import { ScreenBoundary } from '../ScreenBoundary';
import { FOUNDER_STAGES } from '@runway/engine';
import type { BuildMode, FounderStageId, Industry, RevenueModel } from '@runway/engine';
import {
  amountInput,
  gameMonth,
  money,
  parseAmount,
  pct,
  runway,
  stars,
  titleCase,
} from '../format';
import { locale, t, tx } from '../i18n';
import { useView, type Company as CompanyT } from '../store';
import { Bar, Button, Card, Confirm, Empty, Field, Fold, Pill, Segmented, Sheet } from '../ui';
import { ExpansionCard } from './Expansion';
import { Roadmap } from './Roadmap';
import { SalesPipeline } from './Sales';
import { InterviewSheet } from './Interview';
import { CofounderCard, HiringPipeline, TeamHealth, staffDilution } from './Hiring';
import { RunwayExplainer } from './FundCompany';
import { RivalsPanel } from './Decisions';
import { FounderSetup, SetupTracker, setupOpen } from './FounderSetup';
import { SimpleLink } from './SimpleLink';
import { CompanyKpis } from './Home';
import { SnapButton } from '../photos/SnapButton';
import { resultCard } from '../photos/snap';
import {
  CheckHeadline,
  PlanChecks,
  StageTracker,
  livePlanChecks,
  stageTitle,
} from './FounderGuide';

type Tab = 'product' | 'roadmap' | 'sales' | 'customers' | 'team' | 'suppliers' | 'board' | 'rules';

const tabLabel = (tab: Tab) =>
  ({
    product: t('Product'),
    roadmap: t('Roadmap'),
    sales: t('Sales'),
    customers: t('Customers'),
    team: t('Team'),
    suppliers: t('Suppliers'),
    board: t('Board'),
    rules: t('Rules'),
  })[tab];

/**
 * The founder stage each tab belongs to (founder guidance): the current
 * stage's tabs come first, and later stages' tabs are dimmed until then.
 */
const stageAt = (id: FounderStageId) => FOUNDER_STAGES.indexOf(id);
const TAB_STAGE: Record<Tab, number> = {
  product: stageAt('idea'),
  sales: stageAt('idea'),
  customers: stageAt('first-customers'),
  rules: stageAt('first-customers'),
  team: stageAt('product-fit'),
  roadmap: stageAt('product-fit'),
  board: stageAt('seed'),
  suppliers: stageAt('growth'),
};
const TABS: Tab[] = [
  'product',
  'roadmap',
  'sales',
  'customers',
  'team',
  'suppliers',
  'board',
  'rules',
];

/** Tabs for the stage a company is at: this stage's first, then earlier ones, then later. */
export function tabsForStage(stage: number): Tab[] {
  const rank = (tab: Tab) => (TAB_STAGE[tab] === stage ? 0 : TAB_STAGE[tab] < stage ? 1 : 2);
  return [...TABS].sort((a, b) => rank(a) - rank(b));
}

const seniorityLabel = (s: string) =>
  ({ junior: t('Junior'), mid: t('Mid'), senior: t('Senior'), head: t('Head') })[s] ?? titleCase(s);

const roleLabel = (r: string) =>
  ({
    engineer: t('Engineer'),
    product: t('Product'),
    sales: t('Sales'),
    marketing: t('Marketing'),
    support: t('Support'),
    operations: t('Operations'),
    finance: t('Finance'),
  })[r] ?? titleCase(r);

/** "Senior engineer" / "Ingénieur senior". */
export const jobTitle = (seniority: string, role: string) => {
  const s = t('{seniority} {role}', {
    seniority: seniorityLabel(seniority).toLowerCase(),
    role: roleLabel(role).toLowerCase(),
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const personalityLabel = (p: string) =>
  ({
    steady: t('steady'),
    ambitious: t('ambitious'),
    anxious: t('anxious'),
    maverick: t('maverick'),
  })[p] ?? p;

const revenueModelLabel = (m: string) =>
  ({
    subscription: t('Subscription'),
    transaction: t('Transaction'),
    usage: t('Usage'),
    marketplace: t('Marketplace'),
    'one-off': t('One Off'),
    services: t('Services'),
  })[m] ?? titleCase(m);

const contractStatusLabel = (st: string) =>
  ({ active: t('active'), ended: t('ended'), cancelled: t('cancelled') })[st] ?? st;

const buildModeLabel = (m: string) =>
  ({ fast: t('Fast'), balanced: t('Balanced'), quality: t('Quality') })[m] ?? titleCase(m);

/** Another screen (the phone's Founder app) can ask for a tab once: `openCompanyTab('roadmap')`. */
const TAB_KEY = 'rw.companyTab';
const tabListeners = new Set<(tab: Tab) => void>();
export function openCompanyTab(tab: Tab) {
  // A Company screen already open switches at once.
  if (tabListeners.size) {
    for (const l of tabListeners) l(tab);
    return;
  }
  try {
    sessionStorage.setItem(TAB_KEY, tab);
  } catch {
    /* storage blocked: the Product tab opens */
  }
}
function takeCompanyTab(): Tab {
  try {
    const v = sessionStorage.getItem(TAB_KEY) as Tab | null;
    sessionStorage.removeItem(TAB_KEY);
    return v ?? 'product';
  } catch {
    return 'product';
  }
}

export function CompanyScreen() {
  const { view } = useView();
  const [tab, setTab] = useState<Tab>(takeCompanyTab);
  useEffect(() => {
    tabListeners.add(setTab);
    return () => {
      tabListeners.delete(setTab);
    };
  }, []);
  const c = view.companies.find((x) => x.status === 'active');
  if (!c) {
    // A founder sets up the company right here, not under Me (player feedback).
    if (view.me.role !== 'founder')
      return <Empty>{t('No active company. Set up your business in Me → Profile.')}</Empty>;
    // Founder setup: step 1 of the tracker is the idea and its name.
    if (view.setupOn)
      return (
        <>
          <SetupTracker idea />
          <section className="card" data-company-setup="">
            <h2>{t('1 · Idea & industry')}</h2>
            <p className="small muted">
              {t(
                'Name it and say what it does. Registering and funding come next, one step at a time.',
              )}
            </p>
            <FoundCompany setup />
          </section>
        </>
      );
    return (
      <section className="card" data-company-setup="">
        <h2>{t('Set up your company')}</h2>
        <p className="small muted">
          {t('Name it and say what it does. You can change the details later.')}
        </p>
        <FoundCompany />
      </section>
    );
  }
  // Founder setup: register, fund, plan and office before the company opens.
  if (setupOpen(c))
    return (
      <>
        <header className="screen-head">
          <span className="screen-logo" aria-hidden="true">
            {c.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="screen-head-main">
            <h1>{c.name}</h1>
            <span className="muted small">{c.idea}</span>
          </span>
          <Pill>{c.industryLabel}</Pill>
        </header>
        <FounderSetup c={c} />
      </>
    );
  return (
    <>
      <header className="screen-head">
        <span className="screen-logo" aria-hidden="true">
          {c.name.trim().charAt(0).toUpperCase()}
        </span>
        <span className="screen-head-main">
          <h1>{c.name}</h1>
          <span className="muted small">{c.idea}</span>
        </span>
        <Pill>{c.industryLabel}</Pill>
      </header>
      {/* Founder setup: the done card hands over to the stage tracker (companies
          founded before the setup, or seeded, have none). */}
      {c.setup && <FounderSetup c={c} />}
      {/* Founder guidance: the stage, its checklist and the next step, first. */}
      <StageTracker c={c} />
      {/* The company's bank, spending, how long the money lasts and revenue, up front. */}
      <CompanyKpis c={c} />
      {/* The camera: your company's numbers as a card to save or share. */}
      <div className="row">
        <SnapButton
          action="company-photo"
          className="btn btn-subtle btn-sm"
          label={t('Share your results')}
          title={t('Your company’s results')}
          file={`${c.name}-results`}
          city={view.market.name}
          make={() =>
            resultCard({
              kicker: `${c.industryLabel} · ${view.market.name}`,
              title: c.name,
              subtitle: tx(c.idea),
              stats: [
                { label: t('Monthly revenue'), value: money(c.monthlyRevenue, c.currency) },
                { label: t('Company bank'), value: money(c.cash, c.currency) },
                {
                  label: t('Money lasts'),
                  value:
                    c.monthlyRevenue <= 0 && c.runwayMonths === null
                      ? t('Pre-revenue')
                      : runway(c.runwayMonths),
                },
                { label: t('Team'), value: String(c.teamSize) },
                { label: t('Stars'), value: stars(c.stars) },
                ...(c.lastRound ? [{ label: t('Last round'), value: titleCase(c.lastRound) }] : []),
              ],
              footer: gameMonth(view.market.month),
              tone: 'teal',
            })
          }
        />
      </div>
      <SimpleLink
        to="money"
        emoji="💰"
        label={t('Money and investors')}
        hint={t('Your bank, loans, deal cards and raising money')}
        badge={view.deals.filter((d) => d.yourTurn).length}
      />
      <div className="tabs" role="tablist">
        {tabsForStage(c.guide.index).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={TAB_STAGE[id] > c.guide.index ? 'tab-later' : undefined}
            title={
              TAB_STAGE[id] > c.guide.index
                ? t('Matters from the {stage} stage', {
                    stage: stageTitle(c.guide.stages[TAB_STAGE[id]]!.id),
                  })
                : undefined
            }
          >
            {tabLabel(id)}
          </button>
        ))}
      </div>
      <ScreenBoundary resetKey={tab} name={`company:${tab}`}>
        {tab === 'product' && (
          // A wide screen: columns (one after the other on a phone).
          <div className="screen-cols">
            <div className="screen-col">
              <RunwayExplainer c={c} />
              <Product c={c} />
            </div>
            <div className="screen-col">
              <Pivot c={c} />
              <RivalsPanel c={c} />
            </div>
            <div className="screen-col">
              {/* A second city is a Growth-stage move: folded away until then. */}
              {c.guide.index >= stageAt('growth') ? (
                <ExpansionCard c={c} />
              ) : (
                <Fold
                  title={t('Later stages')}
                  sub={t('Later: the {stage} stage', { stage: stageTitle('growth') })}
                  id="later-expansion"
                >
                  <ExpansionCard c={c} />
                </Fold>
              )}
            </div>
          </div>
        )}
        {tab === 'roadmap' && <Roadmap c={c} />}
        {tab === 'sales' && <SalesPipeline c={c} />}
        {tab === 'customers' && <Customers c={c} />}
        {tab === 'team' && <Team c={c} />}
        {tab === 'suppliers' && <Suppliers c={c} />}
        {tab === 'board' && <Board c={c} />}
        {tab === 'rules' && <Rules c={c} />}
      </ScreenBoundary>
    </>
  );
}

function Product({ c }: { c: CompanyT }) {
  const { send, view } = useView();
  return (
    <Card title={t('Product')}>
      <Bar label={t('Product fit')} value={c.product.fit} />
      <Bar
        label={t('Reliability')}
        value={c.product.reliability}
        tone={c.product.reliability < 0.35 ? 'bad' : undefined}
      />
      <Bar label={t('Quality')} value={c.product.quality} />
      <Bar
        label={t('Tech debt')}
        value={c.product.techDebt}
        tone={c.product.techDebt > 0.5 ? 'bad' : 'warn'}
      />
      <Field
        label={t('Build mode')}
        hint={t('Fast ships fit sooner but piles up tech debt. Quality pays it down.')}
      >
        {() => (
          <Segmented<BuildMode>
            label={t('Build mode')}
            value={c.product.buildMode}
            options={[
              { value: 'fast', label: t('Fast') },
              { value: 'balanced', label: t('Balanced') },
              { value: 'quality', label: t('Quality') },
            ]}
            onChange={(v) =>
              void send(
                { type: 'company.strategy', companyId: c.id, buildMode: v },
                t('Build mode: {mode}.', { mode: buildModeLabel(v).toLowerCase() }),
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
              (r: { message: string }) => tx(r.message),
            )
          }
          disabled={view.me.hours.left < 40}
        >
          {t('Build yourself (40h)')}
        </Button>
        <span className="small muted">{t('{n}h left this month', { n: view.me.hours.left })}</span>
      </div>
      <p className="small muted">
        {t(
          'Engineers and product staff build every month. Customer discovery makes building count.',
        )}
      </p>
    </Card>
  );
}

function Pivot({ c }: { c: CompanyT }) {
  const [pivot, setPivot] = useState(false);
  return (
    <>
      <Card
        title={t('Pivot')}
        action={
          <Button variant="ghost" onClick={() => setPivot(true)}>
            {t('Consider a pivot')}
          </Button>
        }
      >
        <p className="small muted">
          {t(
            'Keeps cash, team, investors and code. Costs customers, morale and trust. Pivots so far: {n}.',
            { n: c.pivots },
          )}
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
      (x: { message: string }) => tx(x.message),
    );
    if (r) onClose();
  };
  return (
    <Sheet title={t('Pivot')} onClose={onClose}>
      <Segmented
        label={t('Pivot type')}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'customer', label: t('Customer') },
          { value: 'product', label: t('Product') },
          { value: 'market', label: t('Sector') },
          { value: 'model', label: t('Model') },
        ]}
      />
      {kind === 'customer' && (
        <Field label={t('New customer segment')}>
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
        <Field label={t('New sector')}>
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
        <Field label={t('New revenue model')}>
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
                    {revenueModelLabel(m)}
                  </option>
                ))}
            </select>
          )}
        </Field>
      )}
      {kind === 'product' && (
        <p className="small muted">
          {t('New product for the same customers. Fit halves; you keep the customer insight.')}
        </p>
      )}
      <p className="small muted">
        {t('Costs 20 hours. Some customers leave, morale drops, some staff quit.')}
      </p>
      <Button onClick={() => void go()}>{t('Pivot')}</Button>
    </Sheet>
  );
}

function Customers({ c }: { c: CompanyT }) {
  const { send, view, cur } = useView();
  const [price, setPrice] = useState(amountInput(c.price));
  const [mkt, setMkt] = useState(amountInput(c.marketingBudget));
  const [salary, setSalary] = useState(amountInput(c.founderSalary));
  const segs = view.market.segments.filter((s) => s.industry === c.industry);
  // Live checks on what's typed (an amount that doesn't parse yet keeps today's).
  const checks = livePlanChecks(c, {
    price: parseAmount(price) ?? c.price,
    marketing: parseAmount(mkt) ?? c.marketingBudget,
    founderSalary: parseAmount(salary) ?? c.founderSalary,
  });
  const save = () =>
    send(
      {
        type: 'company.strategy',
        companyId: c.id,
        price: parseAmount(price) ?? c.price,
        marketingBudget: parseAmount(mkt) ?? c.marketingBudget,
        founderSalary: parseAmount(salary) ?? c.founderSalary,
      },
      t('Saved. It applies at month end.'),
    );
  return (
    <>
      {segs.map((s) => (
        <SegmentCard key={s.key} c={c} s={s} />
      ))}
      <Card title={t('Business customers')}>
        {(c.businessCustomers ?? []).length === 0 ? (
          <Empty>
            {t(
              'No local businesses buy from you yet. Walk into shops and restaurants in the City and pitch them.',
            )}
          </Empty>
        ) : (
          <ul className="list">
            {(c.businessCustomers ?? []).map((b) => (
              <li key={b.businessId} className="spread">
                <span>{b.name}</span>
                <span>{t('{amount}/month', { amount: money(b.monthly, cur) })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t('Pricing and spend')}>
        <CheckHeadline checks={checks} cur={cur} />
        <Field
          label={t('Price per customer per month ({cur})', { cur })}
          hint={t('Segment budgets: {budgets}', {
            budgets: segs.map((s) => money(s.budget, cur)).join(' / '),
          })}
        >
          {(id) => <input id={id} value={price} onChange={(e) => setPrice(e.target.value)} />}
        </Field>
        <Field label={t('Marketing per month ({cur})', { cur })}>
          {(id) => <input id={id} value={mkt} onChange={(e) => setMkt(e.target.value)} />}
        </Field>
        <Field
          label={t('Your salary per month ({cur})', { cur })}
          hint={t('Paid by the company, taxed, and visible to investors.')}
        >
          {(id) => <input id={id} value={salary} onChange={(e) => setSalary(e.target.value)} />}
        </Field>
        <PlanChecks checks={checks} cur={cur} />
        <p className="small muted">
          {t('The checks update as you type, like a bank’s business-plan checks.')}
        </p>
        <Button onClick={() => void save()}>{t('Save')}</Button>
      </Card>
    </>
  );
}

export type Segment = ReturnType<typeof useView>['view']['market']['segments'][number];

/** One customer segment: who they are, your funnel there, and customer discovery. */
export function SegmentCard({ c, s }: { c: CompanyT; s: Segment }) {
  const { send, cur } = useView();
  const [interview, setInterview] = useState(false);
  const toggleTarget = (key: string) => {
    const next = c.targetSegments.includes(key)
      ? c.targetSegments.filter((k) => k !== key)
      : [...c.targetSegments, key].slice(-2);
    if (next.length === 0) return;
    void send(
      { type: 'company.strategy', companyId: c.id, targetSegments: next },
      t('Targets updated.'),
    );
  };
  const pos = c.segments.find((x) => x.key === s.key);
  const targeted = c.targetSegments.includes(s.key);
  return (
    <Card
      title={
        <>
          {s.name} <Pill>{s.kind.toUpperCase()}</Pill>
        </>
      }
      action={
        <Button variant={targeted ? 'primary' : 'ghost'} onClick={() => toggleTarget(s.key)}>
          {targeted ? t('Targeting') : t('Target')}
        </Button>
      }
    >
      <p className="small">{s.needsLabel}</p>
      <p className="small muted">
        {t('{buyers} buyers · budget {budget}/mo · {incumbent} serves {share}%', {
          buyers: s.buyers.toLocaleString(locale()),
          budget: money(s.budget, cur),
          incumbent: s.incumbentName,
          share: s.incumbentShare,
        })}
        {s.kind === 'b2b'
          ? ' · ' +
            t('{min}–{max} month sales cycle', {
              min: s.salesCycle[0],
              max: s.salesCycle[1],
            })
          : ''}
      </p>
      {pos && (
        <>
          <div className="funnel" aria-label={t('Funnel')}>
            <div>
              <b>{pos.funnel.aware.toLocaleString(locale())}</b>
              {t('Aware')}
            </div>
            <div>
              <b>{pos.funnel.interested.toLocaleString(locale())}</b>
              {t('Interested')}
            </div>
            <div>
              <b>{pos.funnel.trial.toLocaleString(locale())}</b>
              {s.kind === 'b2b' ? t('Pipeline') : t('Trial')}
            </div>
            <div>
              {/* Customers won in Sales count with the funnel's (round 7). */}
              <b>{(pos.paying + (pos.accounts ?? 0)).toLocaleString(locale())}</b>
              {t('Paying')}
            </div>
            <div>
              <b className={pos.churned > 0 ? 'bad' : ''}>{pos.churned.toLocaleString(locale())}</b>
              {t('Churned')}
            </div>
          </div>
          <Bar label={t('Fit for this segment')} value={pos.fit} />
        </>
      )}
      {c.interviews ? (
        // Feedback note: a real interview, three rounds of questions.
        <Button variant="subtle" data-interview-segment={s.key} onClick={() => setInterview(true)}>
          {t('Interview a customer ({h}h)', { h: c.interviews.hours })}
        </Button>
      ) : (
        <Button
          variant="subtle"
          onClick={() =>
            void send(
              { type: 'company.discovery', companyId: c.id, segmentKey: s.key },
              (r: { message: string }) => tx(r.message),
            )
          }
        >
          {t('Customer discovery (20h)')}
        </Button>
      )}
      {interview && (
        <InterviewSheet companyId={c.id} segmentKey={s.key} onClose={() => setInterview(false)} />
      )}
    </Card>
  );
}

export function Team({ c }: { c: CompanyT }) {
  const { view, cur, send } = useView();
  const [role, setRole] = useState<string>('engineer');
  const [offer, setOffer] = useState<(typeof view.market.talent)[number] | null>(null);
  const [raiseFor, setRaiseFor] = useState<CompanyT['staff'][number] | null>(null);
  const pool = view.market.talent.filter((p) => p.role === role);
  return (
    <>
      <TeamHealth c={c} />
      <Card
        title={t('Team · {n}', { n: c.staff.length })}
        action={
          <Pill tone={c.management.overloaded ? 'bad' : undefined}>
            {t('Can manage {n}', { n: c.management.capacity })}
          </Pill>
        }
      >
        {c.staff.length === 0 ? (
          <Empty>{t('Just you. Hire when the budget allows.')}</Empty>
        ) : (
          <ul className="list">
            {c.staff.map((s) => (
              <li key={s.id}>
                <div className="spread">
                  <div>
                    <div className="item-title">{s.name}</div>
                    <div className="small muted">
                      {jobTitle(s.seniority, s.role)} ·{' '}
                      {t('{amount}/mo', { amount: money(s.salary, cur) })}
                      {s.equityBps
                        ? ` · ${pct(s.equityBps / 10000, s.equityBps % 100 ? 2 : 0)}`
                        : ''}{' '}
                      · {personalityLabel(s.personality)}
                    </div>
                    <HireBrings b={c.teamBrings?.[s.id]} />
                  </div>
                  <div className="row">
                    <Button variant="ghost" onClick={() => setRaiseFor(s)}>
                      {t('Raise')}
                    </Button>
                  </div>
                </div>
                <Bar
                  label={t('Morale')}
                  value={s.morale / 100}
                  tone={s.morale < 35 ? 'bad' : s.morale < 55 ? 'warn' : 'good'}
                />
                <div className="row">
                  <Confirm
                    label={t('Let go')}
                    confirmLabel={t('Let go with 2 months’ pay')}
                    variant="primary"
                    onConfirm={() =>
                      void send(
                        { type: 'company.layoff', companyId: c.id, staffId: s.id, generous: true },
                        (r: { message: string }) => tx(r.message),
                      )
                    }
                  />
                  <Confirm
                    label={t('Let go (no pay)')}
                    confirmLabel={t('Yes, nothing')}
                    onConfirm={() =>
                      void send(
                        { type: 'company.layoff', companyId: c.id, staffId: s.id, generous: false },
                        (r: { message: string }) => tx(r.message),
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
            {t(
              'Too many people per manager. Morale falls and mistakes rise. Hire a head or seniors.',
            )}
          </p>
        )}
      </Card>
      <CofounderCard c={c} />
      <HiringPipeline c={c} />
      <Card title={t('Hire')} sub={t('Ready to hire now, no interviews')}>
        <div className="chips" style={{ marginBottom: '0.5rem' }}>
          {['engineer', 'product', 'sales', 'marketing', 'support', 'operations', 'finance'].map(
            (r) => (
              <button key={r} className="chip" aria-pressed={role === r} onClick={() => setRole(r)}>
                {roleLabel(r)}
              </button>
            ),
          )}
        </div>
        {pool.length === 0 ? (
          <Empty>{t('No one looking right now. The pool refreshes monthly.')}</Empty>
        ) : (
          <ul className="list">
            {pool.map((p) => (
              <li key={p.id} className="spread">
                <div>
                  <div className="item-title">{p.name}</div>
                  <div className="small muted">
                    {seniorityLabel(p.seniority)} ·{' '}
                    {t('skill {n}', { n: Math.round(p.skill * 100) })} ·{' '}
                    {t('asks {amount}/month', { amount: money(p.ask, cur) })} ·{' '}
                    {p.equityPreference > 0.6 ? t('likes equity') : t('prefers cash')}
                    {p.competingOffers
                      ? ' · ' +
                        (p.competingOffers > 1
                          ? t('{n} other offers', { n: p.competingOffers })
                          : t('1 other offer'))
                      : ''}
                  </div>
                  <HireBrings b={c.talentBrings?.[p.id]} />
                </div>
                <Button variant="subtle" onClick={() => setOffer(p)}>
                  {t('Offer')}
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
  const { send, cur, view } = useView();
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
    <Sheet title={t('Offer to {name}', { name: cand.name })} onClose={onClose}>
      <p className="small muted">
        {t('{title}. Asks {amount}/month.', {
          title: jobTitle(cand.seniority, cand.role),
          amount: money(cand.ask, cur),
        })}
      </p>
      <Field label={t('Salary per month ({cur})', { cur })}>
        {(id) => <input id={id} value={salary} onChange={(e) => setSalary(e.target.value)} />}
      </Field>
      <Field
        label={t('Equity: {pct}', { pct: pct(equity / 100, Number.isInteger(equity) ? 0 : 1) })}
        hint={t('Granted from the option pool, vesting over four years.')}
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
      {/* The same checks as an offer from the hiring pipeline: dilution, payroll and runway. */}
      <p className="small">{staffDilution(c, view.me.id, equity)}</p>
      <PlanChecks
        checks={livePlanChecks(c, { extraPayroll: parseAmount(salary) ?? cand.ask })}
        cur={cur}
        only={['payroll', 'runway']}
      />
      {reply && (
        <Card tone={reply.outcome === 'accept' ? 'good' : 'warn'}>
          <p>
            <b>
              {reply.outcome === 'accept'
                ? t('Accepted:')
                : reply.outcome === 'counter'
                  ? t('Counter:')
                  : t('Declined:')}
            </b>{' '}
            “{tx(reply.reason)}”
          </p>
        </Card>
      )}
      {reply?.outcome === 'accept' ? (
        <Button onClick={onClose}>{t('Done')}</Button>
      ) : reply?.outcome === 'decline' ? (
        <Button variant="ghost" onClick={onClose}>
          {t('Walk away')}
        </Button>
      ) : (
        <div className="row">
          <Button onClick={() => void make()}>
            {reply?.outcome === 'counter' ? t('Raise the offer (2h)') : t('Make offer (2h)')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('Walk away')}
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
    <Sheet title={t('Raise for {name}', { name: staff.name })} onClose={onClose}>
      <p className="small muted">
        {t('Now {amount}/month. Pay below the market band drags morale.', {
          amount: money(staff.salary, cur),
        })}
      </p>
      <Field label={t('New salary ({cur})', { cur })}>
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
            (r: { message: string }) => tx(r.message),
          ).then((r) => r && onClose())
        }
      >
        {t('Give raise')}
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
          title={tx(r.title)}
          action={
            r.done ? (
              <Pill tone="good">{t('Compliant')}</Pill>
            ) : (
              <Button
                variant="subtle"
                onClick={() =>
                  void send(
                    { type: 'company.comply', companyId: c.id, ruleId: r.id },
                    (x: { message: string }) => tx(x.message),
                  )
                }
              >
                {t('Comply ({n}h)', { n: r.hours })}
              </Button>
            )
          }
        >
          <p className="small">{tx(r.requires)}</p>
          <p className="small muted">
            {t('Cost {amount} · Penalty: {penalty}', {
              amount: money(Math.round(view.market.costOfLiving * r.costCol), cur),
              penalty: tx(r.penalty),
            })}{' '}
            · {r.regulator}
          </p>
        </Card>
      ))}
      <p className="disclaimer">
        {t(
          'Rule cards simplify real law for the game. Nothing here is legal, financial or tax advice.',
        )}
      </p>
      <Card title={t('Shut down')}>
        <p className="small muted">
          {t(
            'Staff are paid first, then creditors, then investors by preference. Winding down properly protects your stars.',
          )}
        </p>
        <Confirm
          label={t('Shut down {name}', { name: c.name })}
          confirmLabel={t('Yes, wind down properly')}
          onConfirm={() =>
            void send({ type: 'company.shutdown', companyId: c.id }, (r: { message: string }) =>
              tx(r.message),
            )
          }
        />
      </Card>
      <p className="small muted">
        {t('Monthly churn last month: {pct}', {
          pct: pct(
            c.segments.reduce((a, s) => a + s.churned, 0) /
              Math.max(
                1,
                c.segments.reduce((a, s) => a + s.paying + s.churned, 0),
              ),
            1,
          ),
        })}
      </p>
    </>
  );
}

/** B2B marketplace (§6): sell your product to other companies, and buy from them. */
function Suppliers({ c }: { c: CompanyT }) {
  const { view, send, cur } = useView();
  const [title, setTitle] = useState(`${c.name} ${c.industryLabel.toLowerCase()}`);
  const [price, setPrice] = useState(amountInput(c.marketRate));
  const [buying, setBuying] = useState<(typeof view.market.listings)[number] | null>(null);
  const others = view.market.listings.filter((l) => l.companyId !== c.id);
  return (
    <>
      <Card
        title={t('Your listing')}
        action={
          c.listing ? (
            <Pill tone={c.listing.active ? 'good' : undefined}>
              {c.listing.active ? t('Live') : t('Paused')}
            </Pill>
          ) : null
        }
      >
        <p className="small muted">
          {t(
            'Market rate for {industry} here: {amount}/month. Prices far above it, or deals with companies you share owners with, are flagged.',
            { industry: c.industryLabel.toLowerCase(), amount: money(c.marketRate, cur) },
          )}
        </p>
        {c.listing ? (
          <>
            <p>
              <b>{c.listing.title}</b> ·{' '}
              {t('{amount}/month', { amount: money(c.listing.price, cur) })}
              {c.listing.reviews.count > 0 &&
                ` · ${stars(c.listing.reviews.sum / c.listing.reviews.count)} (${c.listing.reviews.count})`}
            </p>
            <div className="row">
              <input
                aria-label={t('New price')}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{ flex: 1 }}
              />
              <Button
                variant="subtle"
                onClick={() =>
                  void send(
                    {
                      type: 'listing.update',
                      listingId: c.listing!.id,
                      price: parseAmount(price) ?? c.listing!.price,
                    },
                    t('Price updated.'),
                  )
                }
              >
                {t('Set price')}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  void send(
                    {
                      type: 'listing.update',
                      listingId: c.listing!.id,
                      active: !c.listing!.active,
                    },
                    c.listing!.active ? t('Listing paused.') : t('Listing live.'),
                  )
                }
              >
                {c.listing.active ? t('Pause') : t('Resume')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Field label={t('Title')}>
              {(id) => (
                <input
                  id={id}
                  value={title}
                  maxLength={60}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )}
            </Field>
            <Field label={t('Price per month ({cur})', { cur })}>
              {(id) => <input id={id} value={price} onChange={(e) => setPrice(e.target.value)} />}
            </Field>
            <Button
              onClick={() =>
                void send(
                  {
                    type: 'listing.create',
                    companyId: c.id,
                    title,
                    price: parseAmount(price) ?? c.marketRate,
                  },
                  t('Listed on the marketplace.'),
                )
              }
            >
              {t('List it')}
            </Button>
          </>
        )}
      </Card>
      <Card title={t('Contracts')}>
        {c.contracts.length === 0 ? (
          <Empty>{t('No supply contracts yet.')}</Empty>
        ) : (
          <ul className="list">
            {c.contracts.map((k) => (
              <li key={k.id}>
                <div className="spread">
                  <span>
                    <b>{k.role === 'seller' ? t('You supply:') : t('Supplies you:')}</b>{' '}
                    {k.counterparty} · {tx(k.category)} ·{' '}
                    {t('{amount}/mo', { amount: money(k.price, cur) })}
                  </span>
                  <Pill tone={k.status === 'active' ? 'good' : undefined}>
                    {contractStatusLabel(k.status)}
                  </Pill>
                </div>
                {k.flags.length > 0 && (
                  <div className="small warn">
                    {t('Flagged: {flags}', { flags: k.flags.map(tx).join(', ') })}
                  </div>
                )}
                <div className="row small">
                  {k.status === 'active' && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void send(
                          { type: 'supply.cancel', contractId: k.id },
                          t('Contract cancelled.'),
                        )
                      }
                    >
                      {t('Cancel')}
                    </Button>
                  )}
                  {k.role === 'seller' &&
                    k.status === 'cancelled' &&
                    k.cancelledBy === k.buyerId &&
                    !view.disputes.some((d) => d.refId === k.id) && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          void send(
                            { type: 'dispute.file', kind: 'supply-breach', refId: k.id },
                            (r: { message: string }) => tx(r.message),
                          )
                        }
                      >
                        {t('Take to arbitrator')}
                      </Button>
                    )}
                  {k.role === 'buyer' &&
                    !k.reviewed &&
                    [1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        className="chip"
                        onClick={() =>
                          void send(
                            { type: 'supply.review', contractId: k.id, rating: r },
                            t('Review posted.'),
                          )
                        }
                      >
                        {r}★
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t('Buy from other companies')}>
        <p className="small muted">
          {t('A good supplier beats the default AI one; a failing supplier hurts you.')}
        </p>
        {others.length === 0 ? (
          <Empty>{t('No one is selling yet.')}</Empty>
        ) : (
          <ul className="list">
            {others.map((l) => (
              <li key={l.id} className="spread">
                <div>
                  <div className="item-title">{l.title}</div>
                  <div className="small muted">
                    {tx(l.category)} · {l.seller}
                    {l.sellerAi ? '' : ' ' + t('(player)')} ·{' '}
                    {t('{amount}/mo', { amount: money(l.price, cur) })} ·{' '}
                    {t('uptime {n}%', { n: l.uptime })}
                    {l.rating !== null ? ` · ${l.rating}★` : ''}
                  </div>
                </div>
                <Button variant="subtle" onClick={() => setBuying(l)}>
                  {t('Buy')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {buying && <BuySheet c={c} listing={buying} onClose={() => setBuying(null)} />}
    </>
  );
}

function BuySheet({
  c,
  listing,
  onClose,
}: {
  c: CompanyT;
  listing: ReturnType<typeof useView>['view']['market']['listings'][number];
  onClose: () => void;
}) {
  const { send, cur } = useView();
  const [price, setPrice] = useState(amountInput(listing.price));
  const [months, setMonths] = useState(6);
  return (
    <Sheet title={t('Buy from {name}', { name: listing.seller })} onClose={onClose}>
      <p className="small muted">
        {t('{category}. Listed at {amount}/month; market rate {rate}.', {
          category: tx(listing.category),
          amount: money(listing.price, cur),
          rate: money(listing.marketRate, cur),
        })}
      </p>
      <div className="grid2">
        <Field label={t('Price per month ({cur})', { cur })}>
          {(id) => <input id={id} value={price} onChange={(e) => setPrice(e.target.value)} />}
        </Field>
        <Field label={t('Months')}>
          {(id) => (
            <input
              id={id}
              type="number"
              min={1}
              max={36}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            />
          )}
        </Field>
      </div>
      <Button
        onClick={() =>
          void send(
            {
              type: 'supply.propose',
              buyerCompanyId: c.id,
              listingId: listing.id,
              price: parseAmount(price) ?? listing.price,
              months,
            },
            (r: { status: string }) =>
              r.status === 'accepted'
                ? t('Contract signed.')
                : r.status === 'declined'
                  ? t('They declined.')
                  : t('Offer sent. See Money → Deals.'),
          ).then((r) => r && onClose())
        }
      >
        {t('Send offer')}
      </Button>
    </Sheet>
  );
}

/** Board (§9): who decides major things, and what needs a vote. */
function Board({ c }: { c: CompanyT }) {
  return (
    <>
      <Card title={t('Board')}>
        <ul className="list">
          {c.board.map((b) => (
            <li key={b.id} className="spread">
              <span>{b.name}</span>
              <Pill>{b.founder ? t('Founder') : t('Investor')}</Pill>
            </li>
          ))}
        </ul>
        {c.vetoes.length > 0 && (
          <p className="small warn">
            {t('Veto on any sale: {names}', { names: c.vetoes.join(', ') })}
          </p>
        )}
        {c.parentName && (
          <p className="small muted">{t('Owned by {name}.', { name: c.parentName })}</p>
        )}
      </Card>
      <Card title={t('What needs a vote')}>
        <ul className="list small">
          <li>
            {t('Selling the company: shareholders vote by share count; veto holders must agree.')}
          </li>
          <li>{t('New priced rounds, once investors sit on the board.')}</li>
          <li>{t('Removing a founder CEO: the board can, for poor performance or conduct.')}</li>
        </ul>
        <p className="small muted">
          {t('Votes close at the next month-end. Abstentions don’t count.')}
        </p>
      </Card>
    </>
  );
}
