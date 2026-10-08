import { useId } from 'react';
import { NEXUS_ORANGE, X_CHEVRON, X_STROKES_BOLD, X_WEDGES } from './paths';

/** At or below this size the simplified artwork (public/brand/icon-small.svg) is drawn. */
const SMALL_MAX = 32;

/**
 * The Nexus Passwords product icon — navy padlock with the orange Nexus X on its body, on a
 * rounded navy square. Inline version of public/brand/icon.svg (icon-small.svg at ≤32 px).
 * Fixed colours, so it looks the same on any background. Decorative.
 */
export function NexusLock({ size = 24, className }: { size?: number; className?: string }) {
  // Per-instance gradient ids (several icons on one page must not share them); keep only
  // characters that are safe inside url(#…) whatever format useId() produces.
  const id = `nexus-lock-${useId().replace(/[^\w-]/g, '')}`;
  const shackle = `${id}-shackle`;
  const body = `${id}-body`;
  const svgProps = { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 128 128', width: size, height: size, className, 'aria-hidden': true, focusable: false } as const;

  if (size <= SMALL_MAX) {
    return (
      <svg {...svgProps}>
        <rect width="128" height="128" rx="28" fill="#0D2A4D" />
        <path d="M40 56V40a24 24 0 0 1 48 0v16" fill="none" stroke="#3F87B4" strokeWidth="16" strokeLinecap="round" />
        <rect x="14" y="50" width="100" height="68" rx="14" fill="#1A6592" />
        <g transform="translate(30 50) scale(0.68)" fill={NEXUS_ORANGE}>
          <path d={X_CHEVRON} />
          {X_WEDGES.map((d) => <path key={d} d={d} />)}
        </g>
      </svg>
    );
  }

  return (
    <svg {...svgProps}>
      <defs>
        <linearGradient id={shackle} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5A9CC6" />
          <stop offset="1" stopColor="#2F78A4" />
        </linearGradient>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22729F" />
          <stop offset="1" stopColor="#125375" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill="#0D2A4D" />
      <path d="M41 58V42a23 23 0 0 1 46 0v16" fill="none" stroke={`url(#${shackle})`} strokeWidth="12" strokeLinecap="round" />
      <rect x="20" y="52" width="88" height="62" rx="14" fill={`url(#${body})`} />
      <g transform="translate(36 55) scale(0.56)" fill={NEXUS_ORANGE}>
        <path d={X_CHEVRON} />
        {X_STROKES_BOLD.map((d) => <path key={d} d={d} />)}
      </g>
    </svg>
  );
}
