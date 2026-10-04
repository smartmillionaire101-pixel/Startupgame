/**
 * Building interiors: one sheet per place, each reusing the game's existing
 * flows (loans, pitching, discovery, hiring, personal money, travel, news).
 */
import { useState, type ReactNode } from 'react';
import type { Command } from '@runway/engine';
import { amountInput, money, parseAmount, pct } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Empty, Field, Pill, Sheet } from '../ui';
import { BankScreen } from '../screens/Bank';
import { SegmentCard, Team } from '../screens/Company';
import { CompanyKpis } from '../screens/Home';
import { Portfolio } from '../screens/Investor';
import { Credit, FoundCompany, PersonalMoney, People, Travel } from '../screens/Me';
import { LoanCard, PitchFlow, PitchSheet, moodLabel } from '../screens/Money';
import { Digest } from '../screens/News';
import { stageLabel } from '../screens/common';
import { AvatarFigure, Building, avatarLook, shade } from './art';
import {
  activeCompany,
  hash,
  lendersOf,
  rescueOf,
  storyOf,
  type CompanyStory,
  type LenderProductView,
  type LenderView,
  type RescuePlan,
  type StoryPlace,
} from './contract';
import { project, type CityLayout, type Place } from './layout';

/** Where a story or rescue action points, as a navigable request. */
export type GoTo = (place: StoryPlace) => void;
export type Nav = (tab: 'company' | 'money' | 'news' | 'me' | 'home') => void;

const NPC_NAMES: Record<string, string[]> = {
  lagos: ['Chiamaka', 'Tunde', 'Ngozi', 'Bayo', 'Funmi', 'Emeka'],
  nairobi: ['Wanjiru', 'Otieno', 'Achieng', 'Kamau', 'Njeri', 'Mwangi'],
  london: ['Priya', 'Tom', 'Grace', 'Oliver', 'Amara', 'Callum'],
  accra: ['Ama', 'Kwame', 'Efua', 'Kofi', 'Akosua', 'Yaw'],
  freetown: ['Fatmata', 'Mohamed', 'Isatu', 'Abu', 'Mariama', 'Ibrahim'],
  kigali: ['Aline', 'Eric', 'Clarisse', 'Jean', 'Diane', 'Patrick'],
  johannesburg: ['Thandi', 'Sipho', 'Lerato', 'Pieter', 'Naledi', 'Thabo'],
  cairo: ['Nour', 'Omar', 'Mariam', 'Youssef', 'Salma', 'Karim'],
  dubai: ['Layla', 'Rashid', 'Aisha', 'Faisal', 'Meera', 'Hamdan'],
};
const npcName = (market: string, seed: string) => {
  const xs = NPC_NAMES[market] ?? ['Sam', 'Alex', 'Jordan', 'Robin'];
  return xs[hash(seed) % xs.length]!;
};

const npcBackgrounds = ['b-commercial', 'i-banker', 'i-operator', 'i-exited', 'b-fintech'];

/** Illustrated header: the building, a person to talk to and a caption. */
function Scene({
  place,
  layout,
  who,
  role,
  tint,
}: {
  place: Place;
  layout: CityLayout;
  who?: string;
  role?: string;
  tint?: string;
}) {
  const c = project(place.x + place.w / 2, place.y + place.d / 2);
  const size = Math.max(70, place.h + 50);
  const vb = `${c.x - 95} ${c.y - size} 190 ${size + 24}`;
  const look = avatarLook(npcBackgrounds[hash(place.id) % npcBackgrounds.length], place.id);
  return (
    <div
      className="interior-scene"
      style={{
        background: `linear-gradient(160deg, ${shade(tint ?? place.color, 0.82)}, ${shade(
          tint ?? place.color,
          0.6,
        )})`,
      }}
      aria-hidden="true"
    >
      <svg viewBox={vb} preserveAspectRatio="xMidYMax meet">
        <ellipse cx={c.x} cy={c.y + 8} rx="90" ry="18" fill="#fff" opacity="0.35" />
        <Building p={{ ...place, dim: false }} f={layout.flavour} />
      </svg>
      {who && (
        <div className="interior-npc">
          <svg viewBox="-14 -44 28 48" width="44" height="72">
            <AvatarFigure look={look} />
          </svg>
          <div>
            <div className="item-title">{who}</div>
            {role && <div className="small muted">{role}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function InteriorSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="interior">{children}</div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Bank

const appetiteLabel = (a: LenderView['appetite']) =>
  ({ tight: t('Lending is tight'), normal: t('Lending as usual'), loose: t('Keen to lend') })[a];

const lenderKindLabel = (k: string) =>
  (
    ({
      'high-street': t('High-street bank'),
      challenger: t('Challenger bank'),
      government: t('Government scheme'),
      development: t('Development bank'),
      microfinance: t('Microfinance'),
      fintech: t('Fintech lender'),
    }) as Record<string, string>
  )[k] ?? k;

const productKindLabel = (k: string) =>
  (
    ({
      'startup-loan': t('Start-up loan'),
      'working-capital': t('Working capital'),
      'revenue-based': t('Revenue-based'),
      'asset-finance': t('Asset finance'),
      overdraft: t('Overdraft'),
    }) as Record<string, string>
  )[k] ?? k;

const guaranteeLabel = (g: string) =>
  (
    ({
      required: t('Personal guarantee required'),
      optional: t('Guarantee optional'),
      none: t('No guarantee'),
    }) as Record<string, string>
  )[g] ?? g;

function ProductCard({ lender, p }: { lender: LenderView; p: LenderProductView }) {
  const { view, send, cur } = useView();
  const company = activeCompany(view);
  const [open, setOpen] = useState(false);
  const cap = p.you?.maxMinor || p.amount[1];
  const [amount, setAmount] = useState(
    amountInput(Math.max(p.amount[0], Math.min(cap, p.amount[1]))),
  );
  const [months, setMonths] = useState(Math.min(Math.max(12, p.termMonths[0]), p.termMonths[1]));
  const [pg, setPg] = useState(p.guarantee === 'required');
  const founderProduct = p.borrower === 'founder';
  const companyId = p.you?.companyId ?? company?.id ?? null;
  const canApply = p.you?.eligible !== false && (founderProduct || !!companyId);
  const apply = () => {
    const n = parseAmount(amount) ?? 0;
    // lenderId/productId are part of the Wave 1 contract (§A).
    const cmd = founderProduct
      ? { type: 'player.loan', amount: n, months, lenderId: lender.id, productId: p.id }
      : {
          type: 'company.loan',
          companyId: companyId!,
          amount: n,
          months,
          personalGuarantee: pg,
          lenderId: lender.id,
          productId: p.id,
        };
    void send(
      cmd as unknown as Command,
      (r: { message?: string; text?: string; declined?: boolean; reason?: string } | null) =>
        r?.declined && r.reason
          ? t('Declined: {reason}', { reason: tx(r.reason) })
          : r?.message
            ? t('{message} See Deals.', { message: tx(r.message) })
            : r?.text
              ? tx(r.text)
              : t('Application sent.'),
    ).then((r) => r && setOpen(false));
  };
  return (
    <Card
      title={tx(p.label)}
      action={<Pill tone={p.you?.eligible ? 'good' : undefined}>{productKindLabel(p.kind)}</Pill>}
    >
      <p className="small">{tx(p.pitch)}</p>
      <dl className="product-terms">
        <div>
          <dt>{t('Amount')}</dt>
          <dd>
            {money(p.amount[0], cur)}–{money(p.amount[1], cur)}
          </dd>
        </div>
        <div>
          <dt>{p.kind === 'revenue-based' || p.revenueShareBps ? t('Repay') : t('Rate today')}</dt>
          <dd>
            {p.kind === 'revenue-based' || p.revenueShareBps
              ? t('{multiple}× via {pct} of revenue', {
                  multiple: (1 + p.rateBps / 10000).toFixed(2).replace(/0$/, ''),
                  pct: pct((p.revenueShareBps ?? 0) / 10000, 0),
                })
              : t('{rate} a year', { rate: pct(p.rateBps / 10000, 1) })}
          </dd>
        </div>
        <div>
          <dt>{t('Term')}</dt>
          <dd>{t('{min}–{max} months', { min: p.termMonths[0], max: p.termMonths[1] })}</dd>
        </div>
        <div>
          <dt>{t('Guarantee')}</dt>
          <dd>{guaranteeLabel(p.guarantee)}</dd>
        </div>
      </dl>
      {p.you &&
        (p.you.eligible ? (
          <p className="good small">
            {t('You: eligible up to {amount}', { amount: money(p.you.maxMinor, cur) })}
          </p>
        ) : (
          <p className="bad small">{p.you.reason ? tx(p.you.reason) : t('Not eligible yet.')}</p>
        ))}
      {!open ? (
        <Button variant="subtle" disabled={!canApply} onClick={() => setOpen(true)}>
          {t('Apply')}
        </Button>
      ) : (
        <div className="stack">
          <div className="grid2">
            <Field label={t('Amount ({cur})', { cur })}>
              {(id) => <input id={id} value={amount} onChange={(e) => setAmount(e.target.value)} />}
            </Field>
            <Field label={t('Months')}>
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={p.termMonths[0]}
                  max={p.termMonths[1]}
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                />
              )}
            </Field>
          </div>
          {!founderProduct && p.guarantee !== 'none' && (
            <label className="row small">
              <input
                type="checkbox"
                checked={pg}
                disabled={p.guarantee === 'required'}
                onChange={(e) => setPg(e.target.checked)}
              />{' '}
              {t('Personal guarantee (cheaper, but your savings are at risk)')}
            </label>
          )}
          <div className="row">
            <Button onClick={apply}>{t('Send application')}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('Cancel')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function BankInterior({ place, layout }: { place: Place; layout: CityLayout }) {
  const { view } = useView();
  const company = activeCompany(view);
  const lender = lendersOf(view).find((l) => l.id === place.ref);
  const officer = npcName(view.market.id, place.id);
  if (!lender) return null;
  const forCompany = lender.products.filter((p) => p.borrower === 'company');
  const forFounder = lender.products.filter((p) => p.borrower === 'founder');
  return (
    <>
      <Scene
        place={place}
        layout={layout}
        who={officer}
        role={t('Loan officer')}
        tint={lender.look.color}
      />
      <div className="row">
        <Pill>{lenderKindLabel(lender.kind)}</Pill>
        <Pill
          tone={
            lender.appetite === 'tight' ? 'warn' : lender.appetite === 'loose' ? 'good' : undefined
          }
        >
          {appetiteLabel(lender.appetite)}
        </Pill>
        <Pill>{t('Base rate {rate}%', { rate: (view.market.baseRateBps / 100).toFixed(2) })}</Pill>
      </div>
      <p className="small muted">
        {t('“Welcome to {bank}. Here is what we can offer you today.”', { bank: lender.name })}
      </p>
      {lender.products.length > 0 ? (
        <>
          {forFounder.length > 0 && <h3 className="interior-h">{t('For founders')}</h3>}
          {forFounder.map((p) => (
            <ProductCard key={p.id} lender={lender} p={p} />
          ))}
          {forCompany.length > 0 && <h3 className="interior-h">{t('For companies')}</h3>}
          {forCompany.map((p) => (
            <ProductCard key={p.id} lender={lender} p={p} />
          ))}
        </>
      ) : (
        <>
          {company ? (
            <LoanCard c={company} />
          ) : (
            <Card>
              <Empty>{t('Business loans are for founders with an active company.')}</Empty>
            </Card>
          )}
          <Credit />
        </>
      )}
    </>
  );
}

function PlayerBankInterior({ place, layout }: { place: Place; layout: CityLayout }) {
  const { view } = useView();
  const bank = view.market.banks.find((b) => b.id === place.ref);
  const company = activeCompany(view);
  if (!bank) return null;
  return (
    <>
      <Scene place={place} layout={layout} who={bank.owner} role={t('Owner')} />
      <div className="row">
        <Pill>{tx(bank.typeLabel)}</Pill>
        <Pill>{bank.stars.toFixed(1)}★</Pill>
        <Pill>{t('Deposits {rate}%', { rate: (bank.depositRateBps / 100).toFixed(2) })}</Pill>
      </div>
      {company && bank.lends.companies ? <LoanCard c={company} bankId={bank.id} /> : <Credit />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Investor office

const officeStyleLabel = (s: string) =>
  (
    ({
      loft: t('Converted warehouse loft'),
      tower: t('Corner suite in a tower'),
      garden: t('Garden office'),
      shophouse: t('Restored shophouse'),
      glass: t('Glass studio'),
    }) as Record<string, string>
  )[s] ?? s;

function InvestorInterior({ place, layout }: { place: Place; layout: CityLayout }) {
  const { view } = useView();
  const fund = view.market.funds.find((f) => f.id === place.ref);
  const company = activeCompany(view);
  const [pitching, setPitching] = useState(false);
  if (!fund) return null;
  const fits =
    company &&
    (fund.sectors === 'any' || fund.sectors.includes(company.industry)) &&
    fund.stages.includes(company.nextStage);
  const pitches = view.pitches.filter((p) => p.fundId === fund.id);
  const open = pitches.find(
    (p) =>
      (p.status === 'questions' || p.status === 'partner-meeting') && p.companyId === company?.id,
  );
  const anyOpen = view.pitches.some(
    (p) =>
      (p.status === 'questions' || p.status === 'partner-meeting') && p.companyId === company?.id,
  );
  return (
    <>
      <Scene place={place} layout={layout} who={fund.partner} role={t('Partner')} />
      <p className="small muted">{officeStyleLabel(place.motif)}</p>
      <div className="row">
        <Pill
          tone={fund.mood === 'hungry' ? 'good' : fund.mood === 'cautious' ? 'warn' : undefined}
        >
          {moodLabel(fund.mood)}
        </Pill>
        {company && (fits ? <Pill tone="good">{t('Fits')}</Pill> : <Pill>{t('Off-thesis')}</Pill>)}
        {fund.market !== view.me.market && <Pill tone="info">{fund.marketName}</Pill>}
      </div>
      <Card title={t('Thesis')}>
        <p>{tx(fund.thesis)}</p>
        <dl className="product-terms">
          <div>
            <dt>{t('Cheque')}</dt>
            <dd>
              {money(fund.check[0], fund.currency)}–{money(fund.check[1], fund.currency)}
            </dd>
          </div>
          <div>
            <dt>{t('Stages')}</dt>
            <dd>{fund.stages.map(stageLabel).join(', ')}</dd>
          </div>
          <div>
            <dt>{t('Minimum stars')}</dt>
            <dd>{fund.minStars.toFixed(1)}★</dd>
          </div>
        </dl>
      </Card>
      {open && <PitchFlow pitchId={open.id} />}
      {company ? (
        <Button disabled={anyOpen} onClick={() => setPitching(true)}>
          {t('Pitch {name}', { name: fund.name })}
        </Button>
      ) : (
        <p className="small muted">
          {t('Founders pitch here. Investors meet partners at events.')}
        </p>
      )}
      {pitches.length > 0 && (
        <Card title={t('Pitch history')}>
          <ul className="list small">
            {pitches.slice(0, 5).map((p) => (
              <li key={p.id}>
                <b>{p.companyName}</b> · {tx(p.reason)}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {pitching && company && (
        <PitchSheet
          c={company}
          target={{ fundId: fund.id, name: fund.name, check: fund.check }}
          onClose={() => setPitching(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Market, hub, office, home, airport, newsstand, event hall

function MarketInterior({ place, layout }: { place: Place; layout: CityLayout }) {
  const { view, cur } = useView();
  const company = activeCompany(view);
  const segs = view.market.segments;
  const focus = segs.find((s) => s.key === place.ref);
  const own = company ? segs.filter((s) => s.industry === company.industry) : [];
  const ordered = focus && own.includes(focus) ? [focus, ...own.filter((s) => s !== focus)] : own;
  const others = segs.filter((s) => !own.includes(s));
  return (
    <>
      <Scene place={place} layout={layout} who={focus?.name} role={focus?.incumbentName} />
      <p className="small muted">
        {t(
          'Every stall is a customer segment. Interviews reveal needs, willingness to pay and objections.',
        )}
      </p>
      {company ? (
        ordered.map((s) => <SegmentCard key={s.key} c={company} s={s} />)
      ) : (
        <Card>
          <Empty>{t('Start a company to interview customers here.')}</Empty>
        </Card>
      )}
      <details className="card">
        <summary className="item-title">
          {company
            ? t('Other stalls ({n})', { n: others.length })
            : t('All stalls ({n})', { n: others.length })}
        </summary>
        <ul className="list small">
          {others.map((s) => (
            <li key={s.key}>
              <b>{s.name}</b> · {s.needsLabel} ·{' '}
              {t('{buyers} buyers · budget {budget}/mo', {
                buyers: s.buyers.toLocaleString(),
                budget: money(s.budget, cur),
              })}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

function HubInterior({ place, layout }: { place: Place; layout: CityLayout }) {
  const { view } = useView();
  const company = activeCompany(view);
  return (
    <>
      <Scene
        place={place}
        layout={layout}
        who={npcName(view.market.id, 'hub')}
        role={t('Community manager')}
      />
      <p className="small muted">
        {t(
          'Co-working café: founders, talent and freelancers. Avatars of other players arrive soon.',
        )}
      </p>
      {company && <Team c={company} />}
      <People />
    </>
  );
}

const levelLabel = (l: RescuePlan['level']) =>
  ({ watch: t('Watch'), danger: t('Danger'), critical: t('Critical') })[l];

export const placeLabel = (p: StoryPlace) =>
  ({
    bank: t('Finance Row'),
    investors: t('Investor Quarter'),
    market: t('The Market'),
    hub: t('The Hub'),
    office: t('Your office'),
    home: t('Your home'),
    airport: t('Airport'),
  })[p] ?? p;

function ActionButtons({
  command,
  place,
  onGo,
  label,
}: {
  command?: Command;
  place: StoryPlace;
  onGo: GoTo;
  label?: string;
}) {
  const { send } = useView();
  return (
    <div className="row">
      {command && (
        <Button
          variant="primary"
          onClick={() =>
            void send(command, (r: { message?: string; text?: string } | null) =>
              r?.message ? tx(r.message) : r?.text ? tx(r.text) : t('Done.'),
            )
          }
        >
          {label ?? t('Do it')}
        </Button>
      )}
      {place !== 'office' && (
        <Button variant={command ? 'ghost' : 'subtle'} onClick={() => onGo(place)}>
          {t('Go to {place}', { place: placeLabel(place) })}
        </Button>
      )}
    </div>
  );
}

export function RescueCard({ plan, onGo }: { plan: RescuePlan; onGo: GoTo }) {
  return (
    <section className={`card rescue rescue-${plan.level}`} aria-live="polite">
      <header className="card-head">
        <h2>{t('Rescue plan')}</h2>
        <Pill tone={plan.level === 'watch' ? 'warn' : 'bad'}>{levelLabel(plan.level)}</Pill>
      </header>
      {plan.level === 'critical' && (
        <p className="bad">
          <b>{t('One more missed payroll ends the company.')}</b>
        </p>
      )}
      {plan.deadline && <p>{tx(plan.deadline)}</p>}
      {plan.monthsLeft !== null && (
        <p className="small muted">{t('About {n} months of cash left.', { n: plan.monthsLeft })}</p>
      )}
      <ul className="list">
        {plan.options.map((o) => (
          <li key={o.id}>
            <div className="item-title">{tx(o.label)}</div>
            <div className="small">{tx(o.effect)}</div>
            {o.cost && <div className="small muted">{tx(o.cost)}</div>}
            <ActionButtons command={o.command} place={o.place} onGo={onGo} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StoryCard({ story, onGo }: { story: CompanyStory; onGo: GoTo }) {
  return (
    <Card title={t('This month')}>
      <p className="story-headline">{tx(story.headline)}</p>
      <ul className="list story-items">
        {story.items.map((it, i) => (
          <li key={i} className={`story-item story-${it.tone}`}>
            <span className="story-dot" aria-hidden="true" />
            <div>
              <div>{tx(it.text)}</div>
              {it.cause && (
                <div className="small muted">{t('Because: {cause}', { cause: tx(it.cause) })}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {story.next.length > 0 && (
        <>
          <h3 className="interior-h">{t('Suggested moves')}</h3>
          <ul className="list">
            {story.next.map((a, i) => (
              <li key={i}>
                <div className="item-title">{tx(a.label)}</div>
                <div className="small muted">{tx(a.why)}</div>
                <ActionButtons command={a.command} place={a.place} onGo={onGo} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function OfficeInterior({
  place,
  layout,
  onGo,
  nav,
}: {
  place: Place;
  layout: CityLayout;
  onGo: GoTo;
  nav: Nav;
}) {
  const { view } = useView();
  const c = activeCompany(view);
  if (!c) {
    if (view.me.role === 'banker' && view.bank) return <BankScreen />;
    if (view.me.role === 'investor')
      return (
        <>
          <Scene place={place} layout={layout} />
          <Portfolio />
        </>
      );
    return (
      <>
        <Scene place={place} layout={layout} />
        <Card title={t('Start again')} tone="good">
          <FoundCompany />
        </Card>
      </>
    );
  }
  const story = storyOf(c);
  const rescue = rescueOf(c);
  return (
    <>
      <Scene place={place} layout={layout} who={view.me.name} role={c.name} />
      {rescue && <RescueCard plan={rescue} onGo={onGo} />}
      <CompanyKpis c={c} />
      {story && <StoryCard story={story} onGo={onGo} />}
      {c.warnings.length > 0 && (
        <Card title={t('Warning signs')} tone="warn">
          <ul className="list">
            {c.warnings.map((w) => (
              <li key={w}>{tx(w)}</li>
            ))}
          </ul>
        </Card>
      )}
      <div className="row">
        <Button variant="subtle" onClick={() => nav('company')}>
          {t('Open the company screen')}
        </Button>
        <Button variant="ghost" onClick={() => nav('money')}>
          {t('Open the money screen')}
        </Button>
      </div>
    </>
  );
}

function HomeInterior({ place, layout }: { place: Place; layout: CityLayout }) {
  const { view } = useView();
  return (
    <>
      <Scene place={place} layout={layout} />
      <p className="small muted">
        {t('{tier}: {housing}', {
          tier: tx(view.me.lifestyle.name),
          housing: tx(view.me.lifestyle.housing),
        })}
      </p>
      <PersonalMoney travel={false} />
    </>
  );
}

function AirportInterior({ place, layout }: { place: Place; layout: CityLayout }) {
  return (
    <>
      <Scene place={place} layout={layout} />
      <Travel />
    </>
  );
}

function NewsstandInterior({ place, layout, nav }: { place: Place; layout: CityLayout; nav: Nav }) {
  return (
    <>
      <Scene place={place} layout={layout} />
      <Digest />
      <Button variant="subtle" onClick={() => nav('news')}>
        {t('Open the news screen')}
      </Button>
    </>
  );
}

function EventHallInterior({ place, layout }: { place: Place; layout: CityLayout }) {
  return (
    <>
      <Scene place={place} layout={layout} />
      <Card title={t('Opening soon')}>
        <p>
          {t(
            'Hosted events, demo days and networking with other players open here in the next wave.',
          )}
        </p>
      </Card>
    </>
  );
}

export function Interior({
  place,
  layout,
  title,
  onClose,
  onGo,
  nav,
}: {
  place: Place;
  layout: CityLayout;
  title: string;
  onClose: () => void;
  onGo: GoTo;
  nav: Nav;
}) {
  const body = (() => {
    switch (place.kind) {
      case 'lender':
        return <BankInterior place={place} layout={layout} />;
      case 'playerbank':
        return <PlayerBankInterior place={place} layout={layout} />;
      case 'fund':
        return <InvestorInterior place={place} layout={layout} />;
      case 'stall':
        return <MarketInterior place={place} layout={layout} />;
      case 'hub':
        return <HubInterior place={place} layout={layout} />;
      case 'office':
        return <OfficeInterior place={place} layout={layout} onGo={onGo} nav={nav} />;
      case 'home':
        return <HomeInterior place={place} layout={layout} />;
      case 'airport':
        return <AirportInterior place={place} layout={layout} />;
      case 'newsstand':
        return <NewsstandInterior place={place} layout={layout} nav={nav} />;
      case 'eventhall':
        return <EventHallInterior place={place} layout={layout} />;
    }
  })();
  return (
    <InteriorSheet title={title} onClose={onClose}>
      {body}
    </InteriorSheet>
  );
}
