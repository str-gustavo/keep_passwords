import { NEXUS_ORANGE, X_CHEVRON, X_STROKES } from './paths';

const X_PATHS = [X_CHEVRON, ...X_STROKES];

/**
 * Static illustration of the three-column vault (icon rail, record list, detail) for the sign-in hero.
 * Pure SVG in fixed brand colours: no raster image and no real text (bars stand in for the words). Decorative.
 */
export function VaultPreview({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 380" aria-hidden="true" focusable="false" className={className} role="presentation">
      <rect width="640" height="380" rx="14" fill="#FFFFFF" />
      {/* Icon rail: the X on top, then the active icon (orange tint) and four more. */}
      <rect width="56" height="380" fill="#0D2A4D" />
      <g transform="translate(16 18) scale(0.24)" fill={NEXUS_ORANGE}>{X_PATHS.map((d) => <path key={d} d={d} />)}</g>
      {[64, 96, 128, 160, 192].map((y, i) => <rect key={y} x="20" y={y} width="16" height="16" rx="4" fill={i === 0 ? '#FFB38A' : '#35587A'} />)}
      {/* Top bar: search field and the orange "new" button. */}
      <rect x="56" width="584" height="48" fill="#FFFFFF" />
      <rect x="56" y="48" width="584" height="1" fill="#E6EAF0" />
      <rect x="220" y="14" width="200" height="20" rx="10" fill="#F6F8FA" stroke="#E6EAF0" />
      <rect x="560" y="14" width="60" height="20" rx="6" fill={NEXUS_ORANGE} />
      {/* Record list, second row selected. */}
      <rect x="56" y="49" width="240" height="331" fill="#FFFFFF" />
      <rect x="296" y="49" width="1" height="331" fill="#E6EAF0" />
      {[72, 112, 152, 192, 232, 272].map((y, i) => (
        <g key={y}>
          {i === 1 && <rect x="64" y={y - 6} width="224" height="32" rx="6" fill="#FFF1E8" />}
          <rect x="72" y={y} width="20" height="20" rx="5" fill={i === 1 ? NEXUS_ORANGE : '#E6EAF0'} />
          <rect x="100" y={y + 2} width={120 - i * 8} height="7" rx="3" fill="#CBD5E1" />
          <rect x="100" y={y + 12} width="80" height="5" rx="2" fill="#E6EAF0" />
        </g>
      ))}
      {/* Detail: title, subtitle, action buttons and four label/value fields. */}
      <rect x="320" y="76" width="140" height="12" rx="4" fill="#0D2A4D" />
      <rect x="320" y="96" width="90" height="6" rx="3" fill="#CBD5E1" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={320 + i * 70} y="118" width="62" height="22" rx="6" fill={i === 0 ? NEXUS_ORANGE : '#FFFFFF'} stroke={i === 0 ? NEXUS_ORANGE : '#E6EAF0'} />
      ))}
      {[164, 204, 244, 284].map((y) => (
        <g key={y}>
          <rect x="320" y={y} width="60" height="5" rx="2" fill="#94A3B8" />
          <rect x="320" y={y + 12} width="280" height="8" rx="3" fill="#E6EAF0" />
        </g>
      ))}
    </svg>
  );
}
