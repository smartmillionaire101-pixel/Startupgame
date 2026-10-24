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
  return (
    <>
      <p className="small muted">
        {t(
          'Costs money every month; changes your energy, hours and how investors and tabloids see you. Fixed costs are hard to cut later.',
        )}
      </p>
      <div className="choice-grid">
        {view.lifestyleTiers.map((tier) => (
          <button
            key={tier.tier}
            className="choice"
            data-lifestyle-tier={tier.tier}
            aria-pressed={view.me.lifestyle.tier === tier.tier}
            onClick={() =>
              void send(
                { type: 'player.lifestyle', tier: tier.tier },
                t('Lifestyle: {name}.', { name: tx(tier.name) }),
              )
            }
          >
            <div className="spread">
              <span className="item-title">{tx(tier.name)}</span>
              <span>{t('{amount}/mo', { amount: money(tier.monthlyCost, cur) })}</span>
            </div>
            <div className="small muted">
              {tx(tier.housing)} · {tx(tier.transport)} ·{' '}
              {t('{n}h', { n: `${tier.hours >= 0 ? '+' : ''}${tier.hours}` })}
            </div>
          </button>
        ))}
      </div>
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
