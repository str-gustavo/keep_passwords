// Small local controls styled with the Nexus tokens (the web app's components/ui/* depend on Next and are not imported).
// Contrast: primary buttons use #071E3A on orange (≥ 4.6:1 incl. hover), every other text pair is ≥ 4.5:1; focus rings
// are #125375 (8.3:1 on white).
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export const focusRing = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-fg-on-primary hover:bg-primary-hover',
  secondary: 'border border-border bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-navy-light underline-offset-2 hover:underline',
  danger: 'border border-border bg-surface text-danger hover:bg-surface-2',
};
const SIZES: Record<Size, string> = { sm: 'h-7 px-2 text-xs', md: 'h-9 px-3 text-sm' };

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={cx('inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60', focusRing, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  );
}

export const inputClass = cx(
  'h-9 w-full rounded-md border border-fg-muted bg-surface px-3 text-sm text-fg placeholder:text-fg-muted',
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
);

export function Field({ id, label, hint, ...props }: ComponentProps<'input'> & { id: string; label: string; hint?: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-fg">{label}</label>
      <input id={id} className={inputClass} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      {hint && <p id={`${id}-hint`} className="text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

/** Errors are announced assertively (role=alert); confirmations politely (role=status). */
export function Notice({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  const tone = { error: 'border-danger/30 bg-[#FEF2F2] text-danger', success: 'border-success/30 bg-[#F0FDF4] text-success', info: 'border-border bg-surface-2 text-fg' }[kind];
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={cx('rounded-md border px-3 py-2 text-sm', tone)}>
      {children}
    </p>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-fg-muted">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label}
    </div>
  );
}

/** The product icon (simplified ≤32 px artwork of components/brand/NexusLock: navy lock with the orange Nexus X). */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width={size} height={size} aria-hidden="true" focusable="false">
      <rect width="128" height="128" rx="28" fill="#0D2A4D" />
      <path d="M40 56V40a24 24 0 0 1 48 0v16" fill="none" stroke="#3F87B4" strokeWidth="16" strokeLinecap="round" />
      <rect x="14" y="50" width="100" height="68" rx="14" fill="#1A6592" />
      <g transform="translate(30 50) scale(0.68)" fill="#FA681F">
        <path d="M5.6 9H28.6L53.1 41.3C55.2 44.1 56.6 46.8 56.6 50C56.6 53.2 55.2 55.9 53.1 58.7L28.6 91H5.6L37.2 50Z" />
        <path d="M51.9 31.5L69.9 9H94.4L64.1 48.8Z" />
        <path d="M51.9 68.5L69.9 91H94.4L64.1 51.2Z" />
      </g>
    </svg>
  );
}

export { cx };
