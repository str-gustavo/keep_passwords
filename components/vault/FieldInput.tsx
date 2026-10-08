'use client';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { t } from '@/lib/i18n/pt-br';
import type { FieldDef, FieldKind } from '@/lib/record-types/catalog';
import { GeneratorPopover } from './GeneratorPopover';
import { SecretInput } from './SecretInput';
import { StrengthMeter } from './StrengthMeter';

const INPUT_TYPE: Partial<Record<FieldKind, string>> = { url: 'url', email: 'email', phone: 'tel', date: 'date' };
const AUTOCOMPLETE: Partial<Record<FieldKind, string>> = { url: 'url', email: 'email', phone: 'tel' };

/** DOM id of a form input; also used to move focus to the first invalid field. */
export const fieldInputId = (key: string) => `record-field-${key}`;

/** One catalog field of the record form. `data-testid="field-<key>"` sits on the native input/textarea. */
export function FieldInput({ def, value, onChange, error }: { def: FieldDef; value: string; onChange: (value: string) => void; error?: string }) {
  const id = fieldInputId(def.key);
  const testId = `field-${def.key}`;
  const helpId = def.kind === 'totp' ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const a11y = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy } as const;

  let control: React.ReactNode;
  switch (def.kind) {
    case 'password':
      control = (
        <>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <SecretInput id={id} value={value} onChange={onChange} label={def.label} testId={testId} describedBy={describedBy} invalid={!!error} />
            </div>
            <GeneratorPopover onPick={onChange} />
          </div>
          <StrengthMeter password={value} />
        </>
      );
      break;
    case 'secret':
    case 'totp':
      // The otpauth link carries the TOTP seed, so it is masked like any other secret.
      control = (
        <SecretInput
          id={id} value={value} onChange={onChange} label={def.label} testId={testId} describedBy={describedBy} invalid={!!error}
          placeholder={def.kind === 'totp' ? 'otpauth://totp/...' : undefined}
        />
      );
      break;
    case 'secretMultiline':
      control = <SecretInput multiline id={id} value={value} onChange={onChange} label={def.label} testId={testId} describedBy={describedBy} invalid={!!error} />;
      break;
    case 'multiline':
      control = <Textarea {...a11y} data-testid={testId} rows={4} value={value} onChange={(e) => onChange(e.target.value)} className="resize-y" />;
      break;
    case 'number':
      // Text + numeric keyboard: type="number" would silently drop invalid input instead of letting validation explain it.
      control = <Input {...a11y} data-testid={testId} type="text" inputMode="numeric" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />;
      break;
    default:
      control = (
        <Input
          {...a11y} data-testid={testId} type={INPUT_TYPE[def.kind] ?? 'text'} autoComplete={AUTOCOMPLETE[def.kind] ?? 'off'}
          value={value} onChange={(e) => onChange(e.target.value)}
        />
      );
  }

  return (
    <Field label={def.label} htmlFor={id} error={error} errorId={errorId}>
      {control}
      {helpId && <p id={helpId} className="mt-1 text-xs text-fg-muted">{t.totpHelp}</p>}
    </Field>
  );
}
