'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { t } from '@/lib/i18n/pt-br';
import { cn } from '@/lib/ui/cn';
import { IconButton } from './IconButton';

interface Props {
  id: string; value: string; onChange: (value: string) => void; label: string; testId: string;
  placeholder?: string; describedBy?: string; invalid?: boolean; multiline?: boolean;
  /** `new-password` for password/secret kinds, so browsers do not autofill saved logins into them. */
  autoComplete?: 'off' | 'new-password';
}

/**
 * Masked input with a show/hide toggle. The multiline variant masks a textarea with `-webkit-text-security`.
 * Spellcheck and autocorrect are off so the browser never sends the secret to a spelling service.
 */
export function SecretInput({ id, value, onChange, label, testId, placeholder, describedBy, invalid, multiline, autoComplete = 'off' }: Props) {
  const [revealed, setRevealed] = useState(false);
  const common = {
    id, value, placeholder, 'aria-describedby': describedBy, 'aria-invalid': invalid || undefined,
    autoComplete: multiline ? 'off' : autoComplete, autoCorrect: 'off', autoCapitalize: 'off', spellCheck: false,
  } as const;
  const toggleLabel = `${revealed ? t.hide : t.show} ${label}`;

  return (
    <div className="relative">
      {multiline ? (
        <Textarea
          {...common} data-testid={testId} rows={5} onChange={(e) => onChange(e.target.value)}
          className={cn('min-h-28 resize-y pr-10 font-mono text-xs', !revealed && '[-webkit-text-security:disc]')}
        />
      ) : (
        <Input
          {...common} data-testid={testId} type={revealed ? 'text' : 'password'} onChange={(e) => onChange(e.target.value)}
          className={cn('pr-10', revealed && 'font-mono')}
        />
      )}
      <IconButton
        label={toggleLabel} title={revealed ? t.hide : t.show} aria-pressed={revealed} onClick={() => setRevealed((r) => !r)}
        className={cn('absolute right-1', multiline ? 'top-1' : 'top-1/2 -translate-y-1/2')}
      >
        {revealed ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </IconButton>
    </div>
  );
}
