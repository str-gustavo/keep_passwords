'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { t } from '@/lib/i18n/pt-br';
import type { FieldKind } from '@/lib/record-types/catalog';
import { cn } from '@/lib/ui/cn';
import { formatFieldValue, maskValue, safeHref } from '@/lib/ui/format';
import { CopyButton } from './CopyButton';
import { IconButton } from './IconButton';
import { TotpView } from './TotpView';

const MASKED_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>(['password', 'secret', 'secretMultiline']);

/** One label/value row of the detail panel. Must be rendered inside a `<dl>`. */
export function FieldView({ label, value, kind, testKey }: { label: string; value: string; kind: FieldKind; testKey: string }) {
  const [revealed, setRevealed] = useState(false);
  const masked = MASKED_KINDS.has(kind);
  const href = kind === 'url' ? safeHref(value) : null;
  const formatted = formatFieldValue(kind, value);

  let content: React.ReactNode = masked && !revealed ? maskValue(value) : formatted;
  if (kind === 'totp') content = <TotpView key={value} uri={value} />;
  else if (href) content = <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">{value}</a>;

  return (
    <div className="flex items-start gap-3 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium text-fg-muted">{label}</dt>
        <dd
          data-testid={`detail-field-${testKey}`}
          className={cn('mt-1 text-sm text-fg', masked ? 'break-all font-mono' : 'break-words', (kind === 'multiline' || (kind === 'secretMultiline' && revealed)) && 'whitespace-pre-wrap')}
        >
          {content}
        </dd>
      </div>
      {kind !== 'totp' && (
        <div className="flex shrink-0 items-center gap-1 pt-3">
          {masked && (
            <IconButton
              data-testid={`detail-reveal-${testKey}`} aria-pressed={revealed} label={`${revealed ? t.hide : t.show} ${label}`}
              title={revealed ? t.hide : t.show} onClick={() => setRevealed((r) => !r)}
            >
              {revealed ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </IconButton>
          )}
          {/* Copy always takes the real value; only dates copy their dd/mm/aaaa display form. */}
          <CopyButton value={kind === 'date' ? formatted : value} label={label} testId={`detail-copy-${testKey}`} />
        </div>
      )}
    </div>
  );
}
