import { type ReactNode, cloneElement, isValidElement, type ReactElement, useEffect, useId } from 'react';
import type { AppointmentStatus, NotificationStatus, PaymentOrderStatus, ReferralStatus, RewardStatus } from '@salonpro/shared';
import { statusLabel } from '@salonpro/shared';

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return <Tag className={`card ${className}`}>{children}</Tag>;
}

export function CardHeader({
  title,
  subtitle,
  action,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4 ${className}`}>
      <div className="min-w-0">
        <h3 className="truncate text-[15px] font-semibold text-ink-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-[13px] text-ink-400">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3 flex items-end justify-between gap-4 ${className}`}>
      <div>
        <h2 className="text-[17px] font-semibold text-ink-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[13px] text-ink-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status pills                                                        */
/* ------------------------------------------------------------------ */

const STATUS_TONE: Record<string, string> = {
  completed: 'bg-mint-100 text-mint-500',
  paid: 'bg-mint-100 text-mint-500',
  delivered: 'bg-mint-100 text-mint-500',
  sent: 'bg-mint-100 text-mint-500',
  credited: 'bg-mint-100 text-mint-500',
  rewarded: 'bg-mint-100 text-mint-500',
  qualified: 'bg-brand-100 text-brand-700',
  posted: 'bg-mint-100 text-mint-500',
  processed: 'bg-mint-100 text-mint-500',
  active: 'bg-mint-100 text-mint-500',

  confirmed: 'bg-sky-100 text-sky-500',
  booked: 'bg-sky-100 text-sky-500',
  checked_in: 'bg-brand-100 text-brand-700',
  in_progress: 'bg-brand-100 text-brand-700',
  queued: 'bg-sky-100 text-sky-500',
  registered: 'bg-sky-100 text-sky-500',
  created: 'bg-ink-100 text-ink-500',
  attempted: 'bg-ink-100 text-ink-500',

  pending: 'bg-brand-100 text-brand-700',
  partially_paid: 'bg-brand-100 text-brand-700',
  partially_refunded: 'bg-brand-100 text-brand-700',
  unpaid: 'bg-brand-100 text-brand-700',
  invited: 'bg-brand-100 text-brand-700',

  cancelled: 'bg-ink-100 text-ink-500',
  no_show: 'bg-rose-100 text-rose-500',
  failed: 'bg-rose-100 text-rose-500',
  refunded: 'bg-rose-100 text-rose-500',
  reversed: 'bg-rose-100 text-rose-500',
  rejected: 'bg-rose-100 text-rose-500',
  suppressed: 'bg-ink-100 text-ink-500',
  deactivated: 'bg-rose-100 text-rose-500',
  inactive: 'bg-ink-100 text-ink-500',
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONE[status] ?? 'bg-ink-100 text-ink-500';
  return (
    <span className={`chip ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label ?? statusLabel(status)}
    </span>
  );
}

export type { AppointmentStatus, NotificationStatus, PaymentOrderStatus, ReferralStatus, RewardStatus };

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  loading = false,
  icon,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'brand' | 'ghost' | 'quiet' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}) {
  const variants = {
    primary: 'btn-primary',
    brand: 'btn-brand',
    ghost: 'btn-ghost',
    quiet: 'btn-quiet',
    danger: 'btn-danger',
  } as const;
  const sizes = { sm: 'btn-sm', md: '', lg: 'px-6 py-3 text-[15px]' } as const;
  return (
    <button
      className={`${variants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <Spinner size={14} className={variant === 'brand' ? 'text-white' : 'text-current'} /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin ${className}`}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  /* Wire the <label> to the control it names: `htmlFor` + an id, so tapping the
   * label focuses the field and a screen reader announces what it is for. Only
   * applied when the child is a single element; a wrapper (e.g. the +91 prefix
   * around the phone input) is left alone and the hint still names the field. */
  const id = useId();
  const control =
    isValidElement(children) && (children.props as { id?: string }).id === undefined
      ? cloneElement(children as ReactElement<{ id?: string }>, { id })
      : children;

  return (
    <div className={className}>
      {label ? (
        <label className="label" htmlFor={isValidElement(children) ? id : undefined}>
          {label}
        </label>
      ) : null}
      {control}
      {hint && !error ? <p className="mt-1 text-[12px] text-ink-400">{hint}</p> : null}
      {error ? <p className="mt-1 text-[12px] font-medium text-rose-500">{error}</p> : null}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`field ${props.className ?? ''}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`field min-h-[90px] resize-y ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`field appearance-none bg-[length:16px] pr-9 ${props.className ?? ''}`}>
      {props.children}
    </select>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 ${disabled ? 'opacity-60' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? 'bg-brand-500' : 'bg-ink-200'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
      {label || description ? (
        <span className="min-w-0">
          {label ? <span className="block text-[14px] font-medium text-ink-800">{label}</span> : null}
          {description ? <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-400">{description}</span> : null}
        </span>
      ) : null}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon = '✨',
  title,
  description,
  action,
  className = '',
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-2xl">{icon}</div>
      <h3 className="text-[16px] font-semibold text-ink-800">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-[13.5px] leading-relaxed text-ink-400">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function LoadingBlock({ rows = 3, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  className = '',
}: {
  tone?: 'info' | 'warn' | 'danger' | 'success';
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'border-sky-500/20 bg-sky-100 text-sky-500',
    warn: 'border-brand-500/25 bg-brand-100 text-brand-700',
    danger: 'border-rose-500/20 bg-rose-100 text-rose-500',
    success: 'border-mint-500/20 bg-mint-100 text-mint-500',
  } as const;
  return (
    <div className={`rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed ${tones[tone]} ${className}`}>
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      <div className="text-ink-600">{children}</div>
    </div>
  );
}

/** Right-hand slide-over used for detail views and forms. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={`relative flex h-full w-full ${width} flex-col bg-white shadow-lift animate-fade-up`}>
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-semibold">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[13px] text-ink-400">{subtitle}</p> : null}
          </div>
          <button className="btn-quiet btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <div className="border-t border-ink-100 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'max-w-md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={`relative w-full ${size} rounded-t-3xl bg-white shadow-lift animate-fade-up sm:rounded-2xl`}>
        <div className="border-b border-ink-100 px-5 py-4">
          <h2 className="text-[16px] font-semibold">{title}</h2>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data display                                                        */
/* ------------------------------------------------------------------ */

export function Stat({
  label,
  value,
  sub,
  tone = 'default',
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'brand' | 'dark' | 'mint' | 'rose';
  icon?: ReactNode;
}) {
  const tones = {
    default: 'bg-white border-ink-100',
    brand: 'bg-brand-soft border-brand-200',
    dark: 'bg-brand-sheen border-brand-400/30 text-white shadow-brand',
    mint: 'bg-mint-100 border-mint-500/20',
    rose: 'bg-rose-100 border-rose-500/20',
  } as const;
  const onDark = tone === 'dark';
  return (
    <div className={`rounded-3xl border p-4 shadow-card ${tones[tone]}`}>
      {icon ? (
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${
            onDark ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-600'
          }`}
        >
          {icon}
        </span>
      ) : null}
      <p className={`kpi mt-3 ${onDark ? 'text-white' : 'text-ink-900'}`}>{value}</p>
      <p className={`mt-1 text-[12.5px] font-medium ${onDark ? 'text-white/80' : 'text-ink-400'}`}>{label}</p>
      {sub ? <p className={`mt-1 text-[12px] ${onDark ? 'text-white/75' : 'text-ink-400'}`}>{sub}</p> : null}
    </div>
  );
}

export function Table({
  head,
  children,
  className = '',
}: {
  head: ReactNode[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-ink-100">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3 text-[12px] font-semibold uppercase tracking-wide text-ink-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-[13.5px] text-ink-700 ${className}`}>{children}</td>;
}

export function Badge({
  children,
  tone = 'ink',
  className = '',
}: {
  children: ReactNode;
  tone?: 'ink' | 'brand' | 'muted' | 'success';
  className?: string;
}) {
  const tones = {
    ink: 'bg-ink-900 text-white',
    brand: 'bg-brand-100 text-brand-700',
    muted: 'bg-ink-100 text-ink-500',
    success: 'bg-mint-100 text-mint-500',
  } as const;
  return <span className={`chip ${tones[tone]} ${className}`}>{children}</span>;
}

export function Avatar({ name, size = 36, tone = 'ink' }: { name: string; size?: number; tone?: 'ink' | 'brand' }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${
        tone === 'brand' ? 'bg-brand-sheen text-white shadow-brand' : 'bg-brand-100 text-brand-700'
      }`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {letters || '?'}
    </span>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className = '',
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={`no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
            value === tab.id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'
          }`}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="ml-1.5 text-ink-300">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, max = 100, tone = 'brand' }: { value: number; max?: number; tone?: 'brand' | 'ink' | 'mint' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const tones = { brand: 'bg-brand-sheen', ink: 'bg-ink-800', mint: 'bg-mint-500' } as const;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
      <div className={`h-full rounded-full ${tones[tone]} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Charts (dependency-free SVG)                                        */
/* ------------------------------------------------------------------ */

export function BarChart({
  data,
  height = 160,
  format = (n: number) => String(n),
}: {
  data: { label: string; value: number }[];
  height?: number;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <EmptyState icon="📈" title="No data for this range" />;
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="group relative flex h-full flex-1 flex-col justify-end">
          <div
            className="w-full rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-300 transition-all duration-500 group-hover:from-brand-700 group-hover:to-brand-200"
            style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
          />
          <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-[11px] font-medium text-white group-hover:block">
            {format(d.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values, height = 44, tone = '#EC4899' }: { values: number[]; height?: number; tone?: string }) {
  if (values.length < 2) return <div className="h-11" />;
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const width = 240;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 6) - 3}`);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-11 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={points.join(' ')} fill="none" stroke={tone} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points={`0,${height} ${points.join(' ')} ${width},${height}`} fill={tone} opacity="0.08" />
    </svg>
  );
}

export function DonutChart({
  slices,
  size = 132,
  centerLabel,
  centerValue,
}: {
  slices: { label: string; value: number; color: string }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#F1E2EA" strokeWidth="14" />
          {total > 0 &&
            slices.map((slice) => {
              const length = (slice.value / total) * circumference;
              const dash = `${length} ${circumference - length}`;
              const element = (
                <circle
                  key={slice.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth="14"
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              );
              offset += length;
              return element;
            })}
        </g>
        {centerValue ? (
          <>
            <text x="50%" y="47%" textAnchor="middle" className="fill-ink-900" style={{ fontSize: 17, fontWeight: 700 }}>
              {centerValue}
            </text>
            <text x="50%" y="62%" textAnchor="middle" className="fill-ink-400" style={{ fontSize: 10.5 }}>
              {centerLabel}
            </text>
          </>
        ) : null}
      </svg>
      <ul className="min-w-0 space-y-1.5">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-[13px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: slice.color }} />
            <span className="truncate text-ink-600">{slice.label}</span>
            <span className="ml-auto font-medium text-ink-800">
              {total ? Math.round((slice.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
