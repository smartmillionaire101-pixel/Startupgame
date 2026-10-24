/**
 * Syndicates (investor blueprint §8.1, Phase 3): lead one deal with backers'
 * money and earn deal-by-deal carry, or back someone else's. The engine
 * keeps the syndicate's account and its single holding (`view.syndicates`).
 */
import type { PlayerView } from '@runway/engine';
import { useState } from 'react';
import { money, parseAmount, pct } from '../format';
import { t, tx } from '../i18n';
import { useView } from '../store';
import { Button, Card, Empty, Field, Pill, Segmented } from '../ui';
import { careerOf } from './InvestorCareer';
import './investor.css';

type SyndicatesView = NonNullable<PlayerView['syndicates']>;
type Row = SyndicatesView['led'][number];

const syndicatesOf = (view: PlayerView): SyndicatesView | null =>
  (view as { syndicates?: SyndicatesView | null }).syndicates ?? null;

function statusText(s: Row['status']): string {
  switch (s) {
    case 'open':
      return t('taking backers');
    case 'offered':
      return t('offer sent');
    case 'closed':
      return t('invested');
    case 'exited':
      return t('finished');
    case 'failed':
      return t('refunded');
    default:
      return t('cancelled');
  }
}

function LeadForm() {
  const { view, send } = useView();
  const flow = (view.market.dealFlow ?? []).filter((d) => d.canInvest);
  const cap = careerOf(view)?.ceiling;
  const [companyId, setCompanyId] = useState(flow[0]?.companyId ?? '');
  const [lead, setLead] = useState('');
  const [target, setTarget] = useState('');
  const [carry, setCarry] = useState('0.2');
  const c = flow.find((d) => d.companyId === companyId);
  if (flow.length === 0) return <Empty>{t('No one in this city is raising right now.')}</Empty>;
  const leadAmount = parseAmount(lead) ?? 0;
  const targetAmount = parseAmount(target) ?? 0;
  const valuation = c ? (c.instrument === 'safe' ? c.valuation + targetAmount : c.valuation) : 0;
  return (
    <div className="inv-form">
      <Field label={t('Company')}>
        {(id) => (
          <select id={id} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {flow.map((d) => (
              <option key={d.companyId} value={d.companyId}>
                {d.name} · {tx(d.industryLabel)} · {d.stars.toFixed(1)}★
              </option>
            ))}
          </select>
        )}
      </Field>
      {c && (
        <p className="inv-note">
          {t('{name} takes at most {max} from one investor. Their terms: {terms}.', {
            name: c.name,
            max: money(c.maxCheck, c.currency),
            terms:
              c.instrument === 'safe'
                ? t('a SAFE capped at {v} plus the round', { v: money(c.valuation, c.currency) })
                : t('a priced round at {v} before the money', {
                    v: money(c.valuation, c.currency),
                  }),
          })}
        </p>
      )}
      <div className="grid2">
        <Field
          label={t('Your own cheque')}
          hint={
            cap ? t('Up to {amount}', { amount: money(cap.maxCheque, cap.currency) }) : undefined
          }
        >
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              value={lead}
              onChange={(e) => setLead(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('Target with backers')}>
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Segmented
        label={t('Your carry on backers’ profits')}
        value={carry}
        onChange={setCarry}
        options={[
          { value: '0.15', label: '15%' },
          { value: '0.2', label: '20%' },
        ]}
      />
      <Button
        disabled={!c || leadAmount <= 0 || targetAmount <= leadAmount}
        onClick={() =>
          void send(
            {
              type: 'syndicate.open',
              companyId,
              leadAmount,
              target: targetAmount,
              carry: Number(carry),
              instrument: c!.instrument,
              valuation,
              proRata: true,
              boardSeat: false,
            },
            (r: { message: string }) => tx(r.message),
          )
        }
      >
        {t('Open the syndicate (4h)')}
      </Button>
      <p className="inv-note">
        {t(
          'Backers have until month end. Then the company gets one term sheet for everything raised; if it says no, everyone is refunded.',
        )}
      </p>
    </div>
  );
}

function BackForm({ s }: { s: Row }) {
  const { send } = useView();
  const [amount, setAmount] = useState('');
  const v = parseAmount(amount) ?? 0;
  return (
    <div className="row">
      <input
        aria-label={t('Amount to back')}
        inputMode="decimal"
        placeholder={t('From {amount}', { amount: money(s.minBack, s.currency) })}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Button
        size="sm"
        disabled={v < s.minBack}
        onClick={() =>
          void send(
            { type: 'syndicate.back', syndicateId: s.id, amount: v },
            (r: { message: string }) => tx(r.message),
          )
        }
      >
        {t('Back it')}
      </Button>
    </div>
  );
}

function SyndicateRow({ s, mode }: { s: Row; mode: 'led' | 'backed' | 'open' }) {
  const { send } = useView();
  return (
    <div className="inv-row" data-syndicate={s.status}>
      <div className="grow">
        <strong>{s.companyName}</strong>{' '}
        <span className="small muted">
          {t('led by {name} · {carry} carry', { name: s.leadName, carry: pct(s.carry, 0) })}
        </span>
        <div className="small">
          {t('{raised} of {target} · {n} backers', {
            raised: money(s.raised, s.currency),
            target: money(s.target, s.currency),
            n: s.backers.length,
          })}
        </div>
        {s.yours > 0 && (
          <div className="small muted">
            {t('Yours {amount} · back {returned} · mark {mark}', {
              amount: money(s.yours, s.currency),
              returned: money(s.yourReturned, s.currency),
              mark: money(s.yourMark, s.currency),
            })}
          </div>
        )}
        {mode === 'led' && s.carryPaid > 0 && (
          <div className="small good">
            {t('Carry earned {amount}', { amount: money(s.carryPaid, s.currency) })}
          </div>
        )}
        {mode === 'open' && <BackForm s={s} />}
      </div>
      <Pill tone={s.status === 'closed' ? 'good' : s.status === 'open' ? 'info' : undefined}>
        {statusText(s.status)}
      </Pill>
      {mode === 'led' && s.status === 'open' && (
        <div className="row">
          <Button
            size="sm"
            onClick={() =>
              void send({ type: 'syndicate.close', syndicateId: s.id }, (r: { message: string }) =>
                tx(r.message),
              )
            }
          >
            {t('Close and offer')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void send(
                { type: 'syndicate.cancel', syndicateId: s.id },
                t('Cancelled. Everyone was refunded.'),
              )
            }
          >
            {t('Cancel')}
          </Button>
        </div>
      )}
    </div>
  );
}

export function Syndicates() {
  const { view } = useView();
  const s = syndicatesOf(view);
  if (!s) return null;
  return (
    <div className="stack">
      <Card title={t('Lead a syndicate')} sub={t('Your cheque plus your backers’, one deal')}>
        {s.canLead ? (
          <LeadForm />
        ) : (
          <Empty>
            {t('Syndicates open at rung 2: two angel deals and 2★. Back someone else’s meanwhile.')}
          </Empty>
        )}
      </Card>
      {s.led.length > 0 && (
        <Card title={t('Syndicates you lead')}>
          {s.led.map((x) => (
            <SyndicateRow key={x.id} s={x} mode="led" />
          ))}
        </Card>
      )}
      <Card
        title={t('Open to back')}
        sub={t('Back a lead you trust; they take a carry on your profit')}
      >
        {s.open.length === 0 ? (
          <Empty>{t('No syndicate is taking backers here right now.')}</Empty>
        ) : (
          s.open.map((x) => <SyndicateRow key={x.id} s={x} mode="open" />)
        )}
      </Card>
      {s.backed.length > 0 && (
        <Card title={t('Syndicates you backed')}>
          {s.backed.map((x) => (
            <SyndicateRow key={x.id} s={x} mode="backed" />
          ))}
        </Card>
      )}
    </div>
  );
}
