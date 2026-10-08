import { NEXUS_ORANGE, X_CHEVRON, X_STROKES } from './paths';

/** The bare Nexus X (orange), inline version of public/brand/nexus-x.svg. Decorative. */
export function NexusMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <g fill={NEXUS_ORANGE}>
        <path d={X_CHEVRON} />
        {X_STROKES.map((d) => <path key={d} d={d} />)}
      </g>
    </svg>
  );
}
