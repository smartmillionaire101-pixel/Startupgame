/** Small, accessible UI primitives. No UI framework: keeps the app tiny. */
import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useGame } from './store';

export function Card({
  title,
  action,
  children,
  tone,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  tone?: 'warn' | 'good';
}) {
  return (
    <section className={`card${tone ? ` card-${tone}` : ''}`}>
      {(title || action) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Button({
  variant = 'primary',
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  loading?: boolean;
}) {
  const { busy } = useGame();
  return (
    <button className={`btn btn-${variant}`} disabled={rest.disabled || busy || loading} {...rest}>
      {children}
    </button>
  );
}

export function Bar({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: 'good' | 'bad' | 'warn';
}) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className="bar"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <div className="bar-row">
        <span>{label}</span>
        <span>{Math.round(v * 100)}</span>
      </div>
      <div className="bar-track">
        <div className={`bar-fill${tone ? ` bar-${tone}` : ''}`} style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  );
}

/** Tiny SVG sparkline. Hidden in lite mode (no charts for low bandwidth). */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const { lite } = useGame();
  if (lite || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const w = 120;
  const h = 32;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`)
    .join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'good' | 'bad' | 'warn' | 'info';
}) {
  return <span className={`pill${tone ? ` pill-${tone}` : ''}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** Bottom sheet for focused flows (offers, pitches, deal cards). */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({
  label,
  confirmLabel,
  onConfirm,
  variant = 'danger',
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  variant?: 'danger' | 'primary';
}) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <div className="row">
      <Button variant={variant} onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button variant="ghost" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </div>
  ) : (
    <Button variant="ghost" onClick={() => setArmed(true)}>
      {label}
    </Button>
  );
}

export function Toasts() {
  const { toasts } = useGame();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
