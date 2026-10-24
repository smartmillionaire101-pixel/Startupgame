/**
 * Your standard of living (`player.lifestyle`): the five tiers with their
 * monthly cost, housing, transport and hours. Lives in Me → Money, and opens
 * as a sheet from the phone's Home and Settings apps and from any activity a
 * tier locks (player feedback: "I don't see where to change my tier").
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { t, tx } from '../i18n';
import { money } from '../format';
import { useView } from '../store';
import { Button, Card, Sheet } from '../ui';

/** The five tiers to pick from (the current one pressed). */
export function LifestylePicker() {
  const { view, send, cur } = useView();
  /** A tier your savings can't cover a month of, waiting for you to confirm it. */
  const [pending, setPending] = useState<number | null>(null);
  const savings = view.accounts.local?.balance ?? 0;
  const pick = (tier: { tier: number; name: string }) =>
    void send(
      { type: 'player.lifestyle', tier: tier.tier },
      t('Lifestyle: {name}.', { name: tx(tier.name) }),
    ).then(() => setPending(null));
  const confirming = view.lifestyleTiers.find((x) => x.tier === pending);
  return (
    <>
      <p className="small muted">
        {t(
          'Costs money every month; changes your energy, hours and how investors and tabloids see you. Fixed costs are hard to cut later.',
        )}
      </p>
      <div className="choice-grid">
        {view.lifestyleTiers.map((tier) => {
          const current = view.me.lifestyle.tier === tier.tier;
          // Months your savings cover at this tier (income may still arrive before month end).
          const months = Math.floor(savings / Math.max(1, tier.monthlyCost));
          const short = months < 1 && !current;
          return (
            <button
              key={tier.tier}
              className={`choice${short ? ' is-short' : ''}`}
              data-lifestyle-tier={tier.tier}
              data-short={short ? '' : undefined}
              aria-pressed={current}
              onClick={() => (short ? setPending(tier.tier) : pick(tier))}
            >
              <div className="spread">
                <span className="item-title">{tx(tier.name)}</span>
                <span>{t('{amount}/mo', { amount: money(tier.monthlyCost, cur) })}</span>
              </div>
              <div className="small muted">
                {tx(tier.housing)} · {tx(tier.transport)} ·{' '}
                {t('{n}h', { n: `${tier.hours >= 0 ? '+' : ''}${tier.hours}` })}
              </div>
              <div className={`small ${short ? 'lifestyle-short' : 'muted'}`} data-covers={months}>
                {months < 1
                  ? t('⚠ Your savings don’t cover a month')
                  : months >= 12
                    ? t('Your savings cover 12+ months')
                    : months === 1
                      ? t('Your savings cover 1 month')
                      : t('Your savings cover {n} months', { n: months })}
              </div>
            </button>
          );
        })}
      </div>
      {confirming && (
        <div className="lifestyle-confirm" role="alertdialog" data-lifestyle-confirm="">
          <p className="small">
            {t(
              '{name} costs {amount} a month and you have {savings}. Unless money comes in before month end, you’ll be moved down a tier then.',
              {
                name: tx(confirming.name),
                amount: money(confirming.monthlyCost, cur),
                savings: money(savings, cur),
              },
            )}
          </p>
          <div className="row">
            <Button variant="danger" size="sm" onClick={() => pick(confirming)}>
              {t('Switch anyway')}
            </Button>
            <Button variant="subtle" size="sm" onClick={() => setPending(null)}>
              {t('Cancel')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/** The Lifestyle card (Me → Money). */
export function LifestyleCard() {
  return (
    <Card title={t('Lifestyle')}>
      <LifestylePicker />
    </Card>
  );
}

export function LifestyleSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title={t('Lifestyle')} onClose={onClose}>
      <LifestylePicker />
    </Sheet>
  );
}

/** A button that opens the lifestyle picker, wherever a tier matters. */
export function LifestyleButton({
  label,
  size,
  variant = 'subtle',
}: {
  label?: string;
  size?: 'sm';
  variant?: 'subtle' | 'secondary';
}) {
  const [host, setHost] = useState<Element | null>(null);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        data-open-lifestyle=""
        onClick={(e) => {
          e.stopPropagation();
          // Open over the phone (or the page), not inside a faded locked row.
          setHost(e.currentTarget.closest('.phone-frame') ?? document.body);
        }}
      >
        {label ?? t('Change lifestyle')}
      </Button>
      {host && createPortal(<LifestyleSheet onClose={() => setHost(null)} />, host)}
    </>
  );
}
