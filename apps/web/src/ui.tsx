/** Small, accessible UI primitives. No UI framework: keeps the app tiny. */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { useGame } from './store';
import { t } from './i18n';

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
      <div
        className={`stat-value${typeof value === 'string' && value.length > 9 ? ' is-long' : ''}`}
      >
        {value}
      </div>
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
          <button className="icon-btn" aria-label={t('Close')} onClick={onClose}>
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
        {t('Cancel')}
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
      {toasts.map((x) => (
        <div key={x.id} className={`toast toast-${x.tone}`}>
          {x.text}
        </div>
      ))}
    </div>
  );
}

/**
 * A card that folds (Wave 7): title, a one-line summary while closed, and
 * the body on demand. Keeps long screens to a first screen you can read.
 */
export function Fold({
  title,
  sub,
  open,
  children,
  id,
}: {
  title: ReactNode;
  sub?: ReactNode;
  open?: boolean;
  children: ReactNode;
  id?: string;
}) {
  return (
    <details className="card fold" open={open} data-fold={id}>
      <summary className="fold-head">
        <span className="fold-title">
          <h2>{title}</h2>
          {sub && <span className="fold-sub">{sub}</span>}
        </span>
        <Icon name="chevron" className="fold-chev" />
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

export type IconName =
  | 'city'
  | 'today'
  | 'company'
  | 'portfolio'
  | 'deals'
  | 'bank'
  | 'money'
  | 'me'
  | 'phone'
  | 'news'
  | 'plus'
  | 'minus'
  | 'locate'
  | 'list'
  | 'people'
  | 'spark'
  | 'chevron'
  | 'close'
  | 'bolt';

/** One stroke style for every icon: 24-unit grid, 1.8 stroke, round caps. */
const PATHS: Record<IconName, ReactNode> = {
  city: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V9l5-3v15" />
      <path d="M10 21V4l9 4v13" />
      <path d="M13 10h3M13 14h3M13 18h3" />
    </>
  ),
  today: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M8 14.5h3" />
    </>
  ),
  company: (
    <>
      <rect x="3" y="7.5" width="18" height="12.5" rx="2.5" />
      <path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2" />
      <path d="M3 13h18" />
    </>
  ),
  portfolio: (
    <>
      <path d="M12 3v9l7.5 4.5" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  deals: <path d="M4 7h12l-3-3M20 17H8l3 3" />,
  bank: (
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18" />
    </>
  ),
  money: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  me: (
    <>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" />
      <path d="M10.5 18.3h3" />
    </>
  ),
  news: (
    <>
      <path d="M4 5.5h13v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z" />
      <path d="M17 9h3v9.5a2 2 0 0 1-2 2" />
      <path d="M7.5 9h6M7.5 12.5h6M7.5 16h4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  locate: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  list: <path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01" />,
  people: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </>
  ),
  spark: <path d="M12 3l2.2 6.3L20.5 12l-6.3 2.2L12 20.5l-2.2-6.3L3.5 12l6.3-2.7z" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  bolt: <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" />,
};

export function Icon({
  name,
  size = 22,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** A number that ticks to its new value; with reduced motion it just changes. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value || reduceMotion()) {
      from.current = value;
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    const t0 = performance.now();
    const ms = 600;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const v = k < 1 ? start + (value - start) * (1 - Math.pow(1 - k, 3)) : value;
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

/** Reduced motion: the OS setting, or the in-game one (`runway.reduceMotion`). */
export function reduceMotion(): boolean {
  if (typeof document !== 'undefined') {
    const d = document.documentElement.dataset.reduceMotion;
    if (d === '1') return true;
    if (d === '0') return false;
  }
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Work out reduced motion at start-up (and when the OS setting or the stored
 * preference changes) and expose it as `data-reduce-motion` on <html>, so CSS
 * and code share one answer. The phone's Settings can dispatch
 * `runway:reduce-motion` after writing `runway.reduceMotion` to apply it at once.
 */
export function initReduceMotion() {
  if (typeof window === 'undefined') return;
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const apply = () => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('runway.reduceMotion');
    } catch {
      /* storage blocked: the OS setting decides */
    }
    const on =
      stored === '1' || stored === 'true'
        ? true
        : stored === '0' || stored === 'false'
          ? false
          : !!mq?.matches;
    document.documentElement.dataset.reduceMotion = on ? '1' : '0';
  };
  apply();
  mq?.addEventListener?.('change', apply);
  window.addEventListener('storage', (e) => {
    if (e.key === 'runway.reduceMotion') apply();
  });
  window.addEventListener('runway:reduce-motion', apply);
}
