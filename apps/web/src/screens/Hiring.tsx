/**
 * Chapter 2, "The First Team" (blueprint §2.1, §6.4, FR-007): team health
 * (workload, who might leave, missing skills), the hiring pipeline (post a
 * role, find candidates, interview, offer) and the co-founder chooser
 * (invite a real player who's online, or choose an AI co-founder).
 */
import { useState } from 'react';
import { amountInput, money, parseAmount, pct } from '../format';
import { t, tx } from '../i18n';
import { useOnlinePlayers } from '../city/OnlineNow';
import { useView, type Company as CompanyT } from '../store';
import { Bar, Button, Card, Empty, Field, Pill, Segmented, Sheet } from '../ui';
import { HirePick, PlanChecks, livePlanChecks } from './FounderGuide';
import './hiring.css';

type HiringT = CompanyT['hiring'];
type CandT = HiringT['candidates'][number];
type OfferT = HiringT['aiCofounder']['offers'][number];
type Style = 'technical' | 'culture' | 'work_trial';
type Band = 'lean' | 'market' | 'generous';

const ROLES = ['engineer', 'product', 'sales', 'marketing', 'support', 'operations', 'finance'];

const roleName = (r: string) =>
  ({
    engineer: t('Engineer'),
    product: t('Product'),
    sales: t('Sales'),
    marketing: t('Marketing'),
    support: t('Support'),
    operations: t('Operations'),
    finance: t('Finance'),
  })[r] ?? r;

const seniorityName = (s: string) =>
  ({ junior: t('Junior'), mid: t('Mid'), senior: t('Senior'), head: t('Head') })[s] ?? s;

const title = (seniority: string | null, role: string) =>
  seniority
    ? t('{seniority} {role}', {
        seniority: seniorityName(seniority),
        role: roleName(role).toLowerCase(),
      })
    : roleName(role);

const gapText = (role: string) =>
  ({
    engineer: t('No engineer: you are the only one building the product.'),
    product: t('No designer or product person: features take longer and look rougher.'),
    sales: t('No one selling or marketing but you.'),
    support: t('No support: customers wait for answers and some leave.'),
    operations: t('No operations lead: admin piles up as the team grows.'),
    finance: t('No finance person: the books get messy.'),
  })[role] ?? role;

const workloadWord = (w: number) =>
  w > 140 ? t('Overloaded') : w > 115 ? t('Stretched') : w < 35 ? t('Not enough to do') : t('Fine');

const riskWord = (r: string) => ({ low: t('Low'), medium: t('Medium'), high: t('High') })[r] ?? r;

const valuesWord = (v: string) =>
  ({
    mission: t('Wants work that matters'),
    money: t('Motivated by pay'),
    craft: t('Cares about doing great work'),
    stability: t('Wants a steady job'),
  })[v] ?? v;

const styleWord = (s: string) =>
  ({
    independent: t('Works best alone'),
    collaborative: t('Loves working in a team'),
    structured: t('Likes clear plans'),
    fast: t('Moves fast'),
  })[s] ?? s;

const personalityWord = (p: string) =>
  ({
    steady: t('steady'),
    ambitious: t('ambitious'),
    anxious: t('anxious'),
    maverick: t('maverick'),
  })[p] ?? p;

const fitWord = (f: number) =>
  f >= 0.7 ? t('Great fit') : f >= 0.4 ? t('Decent fit') : t('Poor fit');

const cofounderTitle = (x: string) =>
  ({ CTO: t('CTO'), CEO: t('CEO-operator'), Growth: t('Growth lead') })[x] ?? x;

const cofounderPitch = (id: string) =>
  ({
    cto: t('Builds the product with you and leads the engineers.'),
    operator: t('Runs the day to day so you can manage a bigger team.'),
    growth: t('Finds customers and grows revenue.'),
  })[id] ?? '';

/** Your stake now and the share an option pool already set aside (fractions). */
function stakes(c: CompanyT, meId: string) {
  const row = (id: string) => c.capTable.rows.find((r) => r.holderId === id)?.pct ?? 0;
  return { mine: row(meId) / 100, pool: row('pool') / 100 };
}

/** Plain-language dilution for an equity grant to staff (from the pool first). */
export function staffDilution(c: CompanyT, meId: string, equityPct: number) {
  const { mine, pool } = stakes(c, meId);
  const e = equityPct / 100;
  if (e <= 0) return t('No equity: your stake stays {pct}.', { pct: pct(mine, 1) });
  if (e <= pool)
    return t('Comes from the option pool you already set aside: your stake stays {pct}.', {
      pct: pct(mine, 1),
    });
  const after = mine / (1 + e - pool);
  return t('New shares are issued: your stake goes from {from} to {to}.', {
    from: pct(mine, 1),
    to: pct(after, 1),
  });
}

// ---------------------------------------------------------------- team health

export function TeamHealth({ c }: { c: CompanyT }) {
  const team = c.team;
  return (
    <Card title={t('Team health')}>
      {c.staff.length === 0 ? (
        <p className="small muted">{t('Just you so far. Here is what the team is missing.')}</p>
      ) : (
        <ul className="list">
          {c.staff.map((s) => {
            const p = team.people.find((x) => x.staffId === s.id);
            if (!p) return null;
            return (
              <li key={s.id} className="hire-person">
                <div className="spread">
                  <span className="item-title">
                    {s.name}
                    {p.cofounder && (
                      <>
                        {' '}
                        <Pill tone="info">{t('Co-founder')}</Pill>
                      </>
                    )}
                  </span>
                  <Pill tone={p.risk === 'high' ? 'bad' : p.risk === 'medium' ? 'warn' : 'good'}>
                    {t('Leaving risk: {risk}', { risk: riskWord(p.risk) })}
                  </Pill>
                </div>
                <Bar
                  label={t('Workload of {name}', { name: s.name })}
                  value={Math.min(1, p.workload / 150)}
                  tone={p.workload > 140 ? 'bad' : p.workload > 115 ? 'warn' : 'good'}
                />
                <p className="small muted">
                  {t('Workload {n}% · {word} · morale {m}', {
                    n: p.workload,
                    word: workloadWord(p.workload),
                    m: Math.round(s.morale),
                  })}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {team.gaps.length === 0 ? (
        <p className="small good">{t('Every key skill is covered.')}</p>
      ) : (
        <>
          <h3 className="hire-sub">{t('Missing skills')}</h3>
          <ul className="hire-gaps">
            {team.gaps.map((g) => (
              <li key={g}>{gapText(g)}</li>
            ))}
          </ul>
        </>
      )}
      <p className="small muted">
        {t(
          'Overworked people get unhappy and leave. Hire for the gaps, and a head or a senior lets you manage more people.',
        )}
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------- co-founder

export function CofounderCard({ c }: { c: CompanyT }) {
  const [sheet, setSheet] = useState<'ai' | 'human' | null>(null);
  const hired = c.hiring.aiCofounder.hired;
  return (
    <Card title={t('Co-founder')}>
      {hired ? (
        <p>
          {t('{name} is your {title} co-founder.', {
            name: hired.name,
            title: cofounderTitle(hired.title),
          })}
        </p>
      ) : (
        <p className="small muted">
          {t(
            'A co-founder shares the work and owns part of the company. Invite a real player, or choose an AI co-founder.',
          )}
        </p>
      )}
      <div className="row">
        <Button variant="subtle" onClick={() => setSheet('human')}>
          {t('Invite a real player')}
        </Button>
        {!hired && (
          <Button variant="subtle" onClick={() => setSheet('ai')}>
            {t('Choose an AI co-founder')}
          </Button>
        )}
      </div>
      {sheet === 'ai' && <AiCofounderSheet c={c} onClose={() => setSheet(null)} />}
      {sheet === 'human' && <InvitePlayerSheet c={c} onClose={() => setSheet(null)} />}
    </Card>
  );
}

function AiCofounderSheet({ c, onClose }: { c: CompanyT; onClose: () => void }) {
  const { view, send, cur } = useView();
  const { mine } = stakes(c, view.me.id);
  const choose = async (o: OfferT) => {
    const r = await send({ type: 'cofounder.ai', companyId: c.id, candidateId: o.id }, () =>
      t('{name} joins as your co-founder.', { name: o.name }),
    );
    if (r) onClose();
  };
  return (
    <Sheet title={t('Choose an AI co-founder')} onClose={onClose}>
      <p className="small muted">
        {t(
          'They join for founder shares, vesting monthly over 4 years after a 1-year cliff, and a small salary. Agreeing terms takes 4h.',
        )}
      </p>
      <ul className="hire-cands">
        {c.hiring.aiCofounder.offers.map((o) => (
          <li key={o.id} className="hire-cand">
            <div className="spread">
              <strong>{o.name}</strong>
              <Pill tone="info">{cofounderTitle(o.title)}</Pill>
            </div>
            <p className="small">{cofounderPitch(o.id)}</p>
            <p className="small muted">
              {t('Skill {n} · wants {pct} · salary {amount}/mo', {
                n: Math.round(o.skill * 100),
                pct: pct(o.equityBps / 10_000, 0),
                amount: money(o.salary, cur),
              })}
            </p>
            <p className="small">
              {t('Your stake goes from {from} to {to}.', {
                from: pct(mine, 1),
                to: pct(mine * (1 - o.equityBps / 10_000), 1),
              })}
            </p>
            <Button onClick={() => void choose(o)}>
              {t('Bring in {name} (4h)', { name: o.name })}
            </Button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function InvitePlayerSheet({ c, onClose }: { c: CompanyT; onClose: () => void }) {
  const { view, send } = useView();
  const { players, failed } = useOnlinePlayers(true);
  const [pick, setPick] = useState<string | null>(null);
  const [role, setRole] = useState<'CEO' | 'CTO' | 'COO'>('CTO');
  const [equity, setEquity] = useState(20);
  const { mine } = stakes(c, view.me.id);
  const here = (players ?? []).filter((p) => p.here && p.id !== view.me.id);
  const invite = async (playerId: string) => {
    const r = await send(
      {
        type: 'cofounder.invite',
        companyId: c.id,
        playerId,
        title: role,
        equityBps: Math.round(equity * 100),
      },
      () => t('Invitation sent. They get a deal card to accept.'),
    );
    if (r) onClose();
  };
  return (
    <Sheet title={t('Invite a real player')} onClose={onClose}>
      <p className="small muted">
        {t('Co-founders must be in your city. They get a deal card and decide.')}
      </p>
      {players === null && !failed ? (
        <p className="small muted">{t('Loading…')}</p>
      ) : here.length === 0 ? (
        <Empty>{t('No one else is online in your city right now.')}</Empty>
      ) : (
        <ul className="list">
          {here.map((p) => (
            <li key={p.id}>
              <div className="spread">
                <div>
                  <div className="item-title">{p.name}</div>
                  <div className="small muted">
                    {p.company ?? '@' + p.handle}
                    {p.placeName ? ' · ' + p.placeName : ''}
                  </div>
                </div>
                <Button variant="subtle" onClick={() => setPick(p.id)}>
                  {t('Invite')}
                </Button>
              </div>
              {pick === p.id && (
                <div className="hire-form">
                  <Segmented
                    label={t('Their title')}
                    value={role}
                    onChange={setRole}
                    options={[
                      { value: 'CEO', label: t('CEO') },
                      { value: 'CTO', label: t('CTO') },
                      { value: 'COO', label: t('COO') },
                    ]}
                  />
                  <Field label={t('Their share: {pct}', { pct: pct(equity / 100, 0) })}>
                    {(id) => (
                      <input
                        id={id}
                        type="range"
                        min={1}
                        max={50}
                        step={1}
                        value={equity}
                        onChange={(e) => setEquity(Number(e.target.value))}
                      />
                    )}
                  </Field>
                  <p className="small">
                    {t('Your stake goes from {from} to {to}.', {
                      from: pct(mine, 1),
                      to: pct(mine * (1 - equity / 100), 1),
                    })}
                  </p>
                  <Button onClick={() => void invite(p.id)}>{t('Send invitation')}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- pipeline

export function HiringPipeline({ c }: { c: CompanyT }) {
  const { send, cur, view } = useView();
  const h = c.hiring;
  const [role, setRole] = useState('engineer');
  const [seniority, setSeniority] = useState<string>('');
  const [band, setBand] = useState<Band>('market');
  const [offer, setOffer] = useState<CandT | null>(null);
  const openRoles = h.roles.filter((r) => r.status === 'open');
  const hoursLeft = view.me.hours.left;

  const post = () =>
    send(
      {
        type: 'hire.open',
        companyId: c.id,
        role: role as never,
        ...(seniority ? { seniority: seniority as never } : {}),
        salaryBand: band,
      },
      () => t('Job posted. Now find candidates for it.'),
    );
  const interview = (cand: CandT, style: Style) =>
    send<{ fee: number; skill: number | null; fit: number | null }>(
      { type: 'hire.interview', companyId: c.id, candidateId: cand.id, style },
      (r) => {
        const bits: string[] = [];
        if (r.skill !== null) bits.push(t('true skill {n}', { n: Math.round(r.skill * 100) }));
        if (r.fit !== null) bits.push(fitWord(r.fit).toLowerCase());
        return t('Interview with {name} done: {what}.', { name: cand.name, what: bits.join(', ') });
      },
    );

  return (
    <Card title={t('Hiring')} sub={t('Post a role, meet candidates, interview, then offer')}>
      <div className="hire-form">
        <div className="chips" role="group" aria-label={t('Role to hire')}>
          {ROLES.map((r) => (
            <button key={r} className="chip" aria-pressed={role === r} onClick={() => setRole(r)}>
              {roleName(r)}
            </button>
          ))}
        </div>
        <Field label={t('Seniority')}>
          {(id) => (
            <select id={id} value={seniority} onChange={(e) => setSeniority(e.target.value)}>
              <option value="">{t('Any level')}</option>
              {['junior', 'mid', 'senior', 'head'].map((s) => (
                <option key={s} value={s}>
                  {seniorityName(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Segmented
          label={t('Salary band')}
          value={band}
          onChange={setBand}
          options={[
            { value: 'lean', label: t('Lean') },
            { value: 'market', label: t('Market rate') },
            { value: 'generous', label: t('Generous') },
          ]}
        />
        <p className="small muted">
          {band === 'lean'
            ? t('Cheaper asks, but weaker candidates apply.')
            : band === 'generous'
              ? t('Stronger candidates apply, and they ask for more.')
              : t('Typical candidates for the role.')}
        </p>
        <Button
          onClick={() => void post()}
          disabled={openRoles.length >= h.maxOpenRoles || c.cash < h.postingCost}
        >
          {t('Post the job ({amount})', { amount: money(h.postingCost, cur) })}
        </Button>
      </div>

      {openRoles.length === 0 ? (
        <Empty>{t('No open roles. Post one to start meeting candidates.')}</Empty>
      ) : (
        openRoles.map((r) => {
          const cands = h.candidates.filter((x) => x.roleId === r.id);
          return (
            <section key={r.id} className="hire-role" aria-label={title(r.seniority, r.role)}>
              <div className="spread">
                <h3 className="hire-sub">{title(r.seniority, r.role)}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void send({ type: 'hire.close', companyId: c.id, roleId: r.id }, () =>
                      t('Role closed.'),
                    )
                  }
                >
                  {t('Close role')}
                </Button>
              </div>
              <Button
                variant="subtle"
                disabled={r.sourced >= h.maxSources || hoursLeft < h.sourceHours}
                onClick={() =>
                  void send<{ candidateIds: string[] }>(
                    { type: 'hire.source', companyId: c.id, roleId: r.id },
                    (res) => t('{n} candidates applied.', { n: res.candidateIds.length }),
                  )
                }
              >
                {r.sourced >= h.maxSources
                  ? t('You have met everyone looking')
                  : t('Find candidates ({h}h)', { h: h.sourceHours })}
              </Button>
              {cands.length === 0 ? (
                <p className="small muted">{t('No candidates yet.')}</p>
              ) : (
                <>
                  <HirePick cands={cands} />
                  <ul className="hire-cands">
                    {cands.map((x) => (
                      <CandidateCard
                        key={x.id}
                        x={x}
                        cur={cur}
                        hours={h.interviewHours}
                        hoursLeft={hoursLeft}
                        cash={c.cash}
                        onInterview={(s) => void interview(x, s)}
                        onOffer={() => setOffer(x)}
                      />
                    ))}
                  </ul>
                </>
              )}
            </section>
          );
        })
      )}
      {offer && (
        <PipelineOfferSheet c={c} cand={offer} meId={view.me.id} onClose={() => setOffer(null)} />
      )}
    </Card>
  );
}

function CandidateCard({
  x,
  cur,
  hours,
  hoursLeft,
  cash,
  onInterview,
  onOffer,
}: {
  x: CandT;
  cur: string;
  hours: Record<Style, number>;
  hoursLeft: number;
  cash: number;
  onInterview: (s: Style) => void;
  onOffer: () => void;
}) {
  const unknown = t('Unknown until interviewed');
  const did = (s: Style) => x.interviews.includes(s);
  return (
    <li className="hire-cand" aria-label={x.name}>
      <div className="spread">
        <strong>{x.name}</strong>
        <Pill tone={x.monthsLeft === 0 ? 'bad' : x.monthsLeft === 1 ? 'warn' : undefined}>
          {x.monthsLeft === 0
            ? t('Decides this month')
            : x.monthsLeft === 1
              ? t('Decides within 1 month')
              : t('Decides within {n} months', { n: x.monthsLeft })}
        </Pill>
      </div>
      <p className="small muted">
        {title(x.seniority, x.role)} · {t('asks {amount}/month', { amount: money(x.ask, cur) })}
        {x.competingOffers
          ? ' · ' +
            (x.competingOffers > 1
              ? t('{n} other offers', { n: x.competingOffers })
              : t('1 other offer'))
          : ''}
      </p>
      <dl className="hire-cv">
        <dt>{t('Skill')}</dt>
        <dd>
          {x.skill !== null
            ? t('{n} (checked)', { n: Math.round(x.skill * 100) })
            : t('CV says {n}', { n: Math.round(x.cvSkill * 100) })}
        </dd>
        <dt>{t('Values')}</dt>
        <dd>{valuesWord(x.values)}</dd>
        <dt>{t('Work style')}</dt>
        <dd>{styleWord(x.workStyle)}</dd>
        <dt>{t('Risk tolerance')}</dt>
        <dd>
          {x.riskAppetite >= 0.6 ? t('High') : x.riskAppetite >= 0.3 ? t('Medium') : t('Low')}
        </dd>
        <dt>{t('Pay')}</dt>
        <dd>{x.equityPreference > 0.6 ? t('likes equity') : t('prefers cash')}</dd>
        <dt>{t('Fit')}</dt>
        <dd className={x.fit === null ? 'muted' : ''}>
          {x.fit !== null ? fitWord(x.fit) : unknown}
        </dd>
        <dt>{t('Personality')}</dt>
        <dd className={x.personality === null ? 'muted' : ''}>
          {x.personality !== null ? personalityWord(x.personality) : unknown}
        </dd>
      </dl>
      {x.keen && <p className="small good">{t('Keen to join you.')}</p>}
      <div className="hire-actions">
        <Button
          variant="subtle"
          size="sm"
          disabled={did('technical') || hoursLeft < hours.technical}
          onClick={() => onInterview('technical')}
        >
          {t('Technical interview ({h}h)', { h: hours.technical })}
        </Button>
        <Button
          variant="subtle"
          size="sm"
          disabled={did('culture') || hoursLeft < hours.culture}
          onClick={() => onInterview('culture')}
        >
          {t('Culture interview ({h}h)', { h: hours.culture })}
        </Button>
        <Button
          variant="subtle"
          size="sm"
          disabled={did('work_trial') || hoursLeft < hours.work_trial || cash < x.trialFee}
          onClick={() => onInterview('work_trial')}
        >
          {t('Paid work trial ({h}h + {amount})', {
            h: hours.work_trial,
            amount: money(x.trialFee, cur),
          })}
        </Button>
        <Button size="sm" onClick={onOffer}>
          {t('Make an offer')}
        </Button>
      </div>
    </li>
  );
}

function PipelineOfferSheet({
  c,
  cand,
  meId,
  onClose,
}: {
  c: CompanyT;
  cand: CandT;
  meId: string;
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
    <Sheet title={t('Offer to {name}', { name: cand.name })} onClose={onClose}>
      <p className="small muted">
        {t('{title}. Asks {amount}/month.', {
          title: title(cand.seniority, cand.role),
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
      <p className="small">{staffDilution(c, meId, equity)}</p>
      {/* What this salary does to the money: payroll and runway, live. */}
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
