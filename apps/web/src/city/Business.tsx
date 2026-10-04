/**
 * Local businesses (Wave 3 §C): the interior of a shop, restaurant or
 * workshop (eat and meet, take a shift, sell to them), the Jobs board at the
 * Hub and "Who buys what" at the Market. The commands (`venue.buy`,
 * `gig.take`, `business.pitch`) go through the app's usual `send` flow.
 */
import { useState } from 'react';
import type { Command } from '@runway/engine';

const cmd = (c: Command) => c;
import { money } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Empty, Field, Pill, Sheet } from '../ui';
import {
  activeCompany,
  angelsOf,
  businessesOf,
  CATEGORY_COLOR,
  type BusinessCategory,
  type BusinessView,
} from './contract';
import type { CityLayout, Place } from './layout';
import { contactsOf, type PresenceView } from './people';

/** What the economy commands answer (engine §B). */
type PitchResult = {
  answer: 'yes' | 'later' | 'no';
  monthly?: number;
  reason?: string;
  message?: string;
  coffee?: number;
} | null;
type GigResult = {
  pay?: number;
  promised?: number;
  tax?: number;
  short?: boolean;
  message?: string;
} | null;
type BuyResult = { price?: number; message?: string } | null;
type Loose = { message?: string; text?: string } | null;

const resultText = (r: Loose, fallback: string) =>
  r?.message ? tx(r.message) : r?.text ? tx(r.text) : fallback;

export const categoryLabel = (c: BusinessCategory | string) =>
  (
    ({
      food: t('Food and drink'),
      retail: t('Shops'),
      services: t('Services'),
      trades: t('Trades'),
      health: t('Health'),
      education: t('Education'),
      logistics: t('Logistics'),
      hospitality: t('Hospitality'),
    }) as Record<string, string>
  )[c] ?? c;

/** Who you can bring along: players here, contacts, fund partners and AI angels. */
function inviteOptions(
  view: ReturnType<typeof useView>['view'],
  players: PresenceView[],
): { id: string; label: string; group: string }[] {
  const out: { id: string; label: string; group: string }[] = [];
  const seen = new Set<string>();
  const add = (id: string, label: string, group: string) => {
    if (!id || seen.has(id) || id === view.me.id) return;
    seen.add(id);
    out.push({ id, label, group });
  };
  for (const p of players) add(p.id, p.name, t('Players here'));
  for (const c of contactsOf(view)) add(c.refId, c.name, t('Your contacts'));
  for (const a of angelsOf(view)) add(a.id, a.name, t('Angel investors'));
  for (const f of view.market.funds)
    if (f.market === view.market.id)
      add(f.id, t('{name} ({fund})', { name: f.partner, fund: f.name }), t('Fund partners'));
  return out;
}

function InviteSelect({
  value,
  onChange,
  players,
}: {
  value: string;
  onChange: (v: string) => void;
  players: PresenceView[];
}) {
  const { view } = useView();
  const opts = inviteOptions(view, players);
  const groups = [...new Set(opts.map((o) => o.group))];
  return (
    <Field label={t('Invite someone')}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('Just me')}</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {opts
                .filter((o) => o.group === g)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Eat, drink, buy: the price comes out of your own pocket. */
function Venue({ b, players }: { b: BusinessView; players: PresenceView[] }) {
  const { view, send, cur } = useView();
  const [withId, setWithId] = useState('');
  const pocket = view.accounts.local?.balance ?? 0;
  if (!b.venue || !b.venue.items.length) return null;
  const buy = (itemId: string, label: string) =>
    void send(
      cmd({
        type: 'venue.buy',
        businessId: b.id,
        itemId,
        ...(withId ? { withId } : {}),
      }),
      (r: BuyResult) => resultText(r, t('Enjoy: {item}.', { item: tx(label) })),
    );
  return (
    <Card title={b.category === 'food' ? t('Eat and drink') : t('Buy')}>
      <p className="small muted" data-pocket={pocket}>
        {t('In your pocket: {amount}', { amount: money(pocket, cur) })}
      </p>
      <div className="biz-invite">
        <InviteSelect value={withId} onChange={setWithId} players={players} />
      </div>
      <ul className="biz-items">
        {b.venue.items.map((it) => (
          <li key={it.id}>
            <span>
              <span className="item-title">{tx(it.label)}</span>
              {it.meeting && <span className="small muted"> · {t('good for a meeting')}</span>}
              {it.energy ? (
                <span className="small muted"> · {t('+{n} energy', { n: it.energy })}</span>
              ) : null}
            </span>
            <b>{money(it.price, cur)}</b>
            <Button
              variant="subtle"
              disabled={pocket < it.price}
              onClick={() => buy(it.id, it.label)}
            >
              {withId ? t('Buy for two') : t('Buy')}
            </Button>
          </li>
        ))}
      </ul>
      {withId && (
        <p className="small muted">{t('You pay. A meal together warms the contact up.')}</p>
      )}
    </Card>
  );
}

function GigRow({
  b,
  g,
  showWhere,
  onGo,
}: {
  b: BusinessView;
  g: BusinessView['gigs'][number];
  showWhere?: string;
  onGo?: () => void;
}) {
  const { view, send, cur } = useView();
  const left = view.me.hours.left;
  return (
    <li>
      <span>
        <span className="item-title">{tx(g.label)}</span>
        {showWhere && <span className="small muted"> · {showWhere}</span>}
        <span className="small muted">
          {' '}
          · {t('{h}h', { h: g.hours })} · {money(g.pay, cur)}
        </span>
      </span>
      {g.skillMatch && <Pill tone="good">{t('Your skills')}</Pill>}
      <Button
        variant="subtle"
        disabled={left < g.hours}
        onClick={() =>
          void send(cmd({ type: 'gig.take', businessId: b.id, gigId: g.id }), (r: GigResult) =>
            resultText(
              r,
              r?.short && typeof r.pay === 'number'
                ? t('They could only pay {amount}.', { amount: money(r.pay, cur) })
                : t('Shift done at {name}.', { name: b.name }),
            ),
          )
        }
      >
        {t('Take shift')}
      </Button>
      {onGo && (
        <Button variant="ghost" onClick={onGo}>
          {t('Go')}
        </Button>
      )}
    </li>
  );
}

function Gigs({ b }: { b: BusinessView }) {
  const { view } = useView();
  if (!b.gigs.length) return null;
  return (
    <Card title={t('Gigs')}>
      <p className="small muted">
        {t('Paid from their till. You have {h} hours left this month.', {
          h: view.me.hours.left,
        })}
      </p>
      <ul className="biz-gigs">
        {b.gigs.map((g) => (
          <GigRow key={g.id} b={b} g={g} />
        ))}
      </ul>
    </Card>
  );
}

/** What the business spends on startup products, who supplies it, and your pitch. */
function SellToThem({ b }: { b: BusinessView }) {
  const { view, send, cur } = useView();
  const company = activeCompany(view);
  const [answer, setAnswer] = useState<{ tone: 'good' | 'bad' | 'warn'; text: string } | null>(
    null,
  );
  const wants = company ? b.buys.find((x) => x.sector === company.industry) : undefined;
  const pitch = async () => {
    if (!company) return;
    const r = await send<PitchResult>(
      cmd({ type: 'business.pitch', companyId: company.id, businessId: b.id }),
    );
    if (!r) return;
    const yes = r.answer === 'yes';
    const later = r.answer === 'later';
    setAnswer({
      tone: yes ? 'good' : later ? 'warn' : 'bad',
      text: yes
        ? typeof r.monthly === 'number'
          ? t('Yes! {owner} will buy about {amount} a month from {company}.', {
              owner: b.owner.name,
              amount: money(r.monthly, cur),
              company: company.name,
            })
          : t('Yes! {owner} is giving {company} a try.', {
              owner: b.owner.name,
              company: company.name,
            })
        : r.reason
          ? later
            ? t('Come back when: {reason}', { reason: tx(r.reason) })
            : t('Not now: {reason}', { reason: tx(r.reason) })
          : resultText(r, t('Not now.')),
    });
  };
  return (
    <Card title={t('Sell to them')}>
      {b.buys.length ? (
        <ul className="biz-buys">
          {b.buys.map((x) => (
            <li key={x.sector} className={company?.industry === x.sector ? 'is-yours' : undefined}>
              <span>
                <span className="item-title">{tx(x.label)}</span>
                <span className="small muted">
                  {' '}
                  · {t('about {amount}/mo', { amount: money(x.monthlyBudget, cur) })}
                </span>
              </span>
              {x.supplier ? (
                <Pill tone={x.supplier.you ? 'good' : undefined}>
                  {x.supplier.you ? t('You supply them') : x.supplier.name}
                </Pill>
              ) : (
                <Pill tone="info">{t('No supplier yet')}</Pill>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('They don’t buy startup products yet.')}</Empty>
      )}
      {company ? (
        <>
          {b.you.customer && <p className="good small">{t('They are already your customer.')}</p>}
          {!wants && b.buys.length > 0 && (
            <p className="small muted">
              {t('They don’t buy in your sector ({sector}).', {
                sector: tx(company.industryLabel),
              })}
            </p>
          )}
          {b.you.reason && <p className="small muted">{tx(b.you.reason)}</p>}
          <Button disabled={!b.you.canPitch || b.you.customer} onClick={() => void pitch()}>
            {t('Pitch {company}', { company: company.name })}
          </Button>
          {answer && (
            <div className={`card card-deal deal-${answer.tone}`} role="status">
              <p className={answer.tone === 'good' ? 'good' : answer.tone === 'bad' ? 'bad' : ''}>
                {answer.text}
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="small muted">{t('Start a company to sell to local businesses.')}</p>
      )}
    </Card>
  );
}

export function BusinessInterior({
  place,
  layout,
  players,
  header,
}: {
  place: Place;
  layout: CityLayout;
  players: PresenceView[];
  /** The illustrated scene (from Interiors), with the owner. */
  header: (who: string, role: string, tint: string) => React.ReactNode;
}) {
  const { view } = useView();
  const b = businessesOf(view).find((x) => x.id === place.ref);
  if (!b) return <Empty>{t('This business has closed.')}</Empty>;
  const area = layout.areas.find((a) => a.id === place.area);
  return (
    <div className="biz" data-business={b.id}>
      {header(b.owner.name, t('Owner'), b.look.color)}
      <div className="row">
        <Pill>{tx(b.kindLabel)}</Pill>
        <span className="pill" style={{ borderColor: CATEGORY_COLOR[b.category] }}>
          <span className="chip-dot" style={{ background: CATEGORY_COLOR[b.category] }} />{' '}
          {categoryLabel(b.category)}
        </span>
        {area && <Pill>{area.name}</Pill>}
        {b.you.customer && <Pill tone="good">{t('Your customer')}</Pill>}
      </div>
      <Venue b={b} players={players} />
      <Gigs b={b} />
      <SellToThem b={b} />
    </div>
  );
}

/** Every gig in the city, best paid first (on the Hub's wall). */
export function JobsBoard({ onVisit }: { onVisit?: (placeId: string) => void }) {
  const { view } = useView();
  const all = businessesOf(view)
    .filter((b) => b.open)
    .flatMap((b) => b.gigs.map((g) => ({ b, g })))
    .sort((x, y) => Number(y.g.skillMatch) - Number(x.g.skillMatch) || y.g.pay - x.g.pay);
  if (!all.length) return null;
  return (
    <Card title={t('Jobs board')}>
      <p className="small muted">
        {t('Shifts and freelance jobs at local businesses. Pay comes from their till.')}
      </p>
      <ul className="biz-gigs jobs-board">
        {all.slice(0, 24).map(({ b, g }) => (
          <GigRow
            key={`${b.id}:${g.id}`}
            b={b}
            g={g}
            showWhere={b.name}
            onGo={onVisit ? () => onVisit(`biz:${b.id}`) : undefined}
          />
        ))}
      </ul>
    </Card>
  );
}

/** Which local businesses buy what, so founders can find customers (at the Market). */
export function WhoBuysWhat({ onVisit }: { onVisit?: (placeId: string) => void }) {
  const { view, cur } = useView();
  const company = activeCompany(view);
  const biz = businessesOf(view).filter((b) => b.open);
  if (!biz.length) return null;
  const sectors = new Map<
    string,
    {
      label: string;
      total: number;
      rows: { b: BusinessView; budget: number; supplier: string | null; you: boolean }[];
    }
  >();
  for (const b of biz)
    for (const x of b.buys) {
      const s = sectors.get(x.sector) ?? { label: x.label, total: 0, rows: [] };
      s.total += x.monthlyBudget;
      s.rows.push({
        b,
        budget: x.monthlyBudget,
        supplier: x.supplier?.name ?? null,
        you: !!x.supplier?.you,
      });
      sectors.set(x.sector, s);
    }
  const order = [...sectors.entries()].sort(
    ([a, x], [b, y]) =>
      Number(b === company?.industry) - Number(a === company?.industry) || y.total - x.total,
  );
  return (
    <Card title={t('Who buys what')}>
      <p className="small muted">
        {t('What the city’s businesses spend each month on startup products, by sector.')}
      </p>
      {order.map(([key, s]) => (
        <details key={key} className="who-buys" open={key === company?.industry}>
          <summary>
            <b>{tx(s.label)}</b> ·{' '}
            {t('{n} businesses, about {amount}/mo', {
              n: s.rows.length,
              amount: money(s.total, cur),
            })}
            {key === company?.industry && <Pill tone="good">{t('Your sector')}</Pill>}
          </summary>
          <ul className="biz-buys">
            {s.rows
              .sort((a, b) => b.budget - a.budget)
              .map((r) => (
                <li key={r.b.id}>
                  <span>
                    <span className="item-title">{r.b.name}</span>
                    <span className="small muted">
                      {' '}
                      · {money(r.budget, cur)} ·{' '}
                      {r.you ? t('You supply them') : (r.supplier ?? t('No supplier yet'))}
                    </span>
                  </span>
                  {onVisit && (
                    <Button variant="ghost" onClick={() => onVisit(`biz:${r.b.id}`)}>
                      {t('Go')}
                    </Button>
                  )}
                </li>
              ))}
          </ul>
        </details>
      ))}
    </Card>
  );
}

/** Invite someone to a meal (from a person card): pick a place and a dish. */
export function MealSheet({
  withId,
  withName,
  onClose,
}: {
  withId: string;
  withName: string;
  onClose: () => void;
}) {
  const { view, send, cur } = useView();
  const venues = businessesOf(view).filter(
    (b) => b.open && b.venue && b.venue.items.some((i) => i.meeting),
  );
  const [pick, setPick] = useState(venues[0]?.id ?? '');
  const b = venues.find((x) => x.id === pick);
  const items = b?.venue?.items.filter((i) => i.meeting) ?? [];
  return (
    <Sheet title={t('Invite {name} to a meal', { name: withName })} onClose={onClose}>
      {venues.length === 0 ? (
        <Empty>{t('No restaurants are open for meetings yet.')}</Empty>
      ) : (
        <div className="stack">
          <Field label={t('Where')}>
            {(id) => (
              <select id={id} value={pick} onChange={(e) => setPick(e.target.value)}>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {tx(v.kindLabel)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <ul className="biz-items">
            {items.map((it) => (
              <li key={it.id}>
                <span className="item-title">{tx(it.label)}</span>
                <b>{money(it.price, cur)}</b>
                <Button
                  onClick={() =>
                    void send(
                      cmd({ type: 'venue.buy', businessId: b!.id, itemId: it.id, withId }),
                      (r: BuyResult) =>
                        resultText(
                          r,
                          t('Lunch with {name} at {place}.', { name: withName, place: b!.name }),
                        ),
                    ).then((r) => r && onClose())
                  }
                >
                  {t('Invite')}
                </Button>
              </li>
            ))}
          </ul>
          <p className="small muted">{t('You pay. A meal together warms the contact up.')}</p>
        </div>
      )}
    </Sheet>
  );
}
