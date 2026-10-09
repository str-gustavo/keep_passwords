'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { RefreshCw, WandSparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { generatePassword, type PasswordOptions } from '@/lib/generator/password';
import { t } from '@/lib/i18n/pt-br';
import { IconButton } from './IconButton';
import { StrengthMeter } from './StrengthMeter';

type CharClass = 'upper' | 'lower' | 'digits' | 'symbols';
const CLASSES: { key: CharClass; label: string }[] = [
  { key: 'upper', label: t.genUpper },
  { key: 'lower', label: t.genLower },
  { key: 'digits', label: t.genDigits },
  { key: 'symbols', label: t.genSymbols },
];
const MIN = 8;
const MAX = 64;
const DEFAULTS: PasswordOptions = { length: 20, upper: true, lower: true, digits: true, symbols: true, excludeAmbiguous: false };
const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n)));

/** `generate-password` button plus a small popover that previews a generated password; "Usar" hands it to `onPick`. */
export function GeneratorPopover({ onPick }: { onPick: (password: string) => void }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<PasswordOptions>(DEFAULTS);
  const [lengthText, setLengthText] = useState(String(DEFAULTS.length));
  const [value, setValue] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const lengthId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Options and the preview change together inside event handlers: no effect, no generation during render.
  const apply = (next: PasswordOptions) => { setOpts(next); setValue(generatePassword(next)); };
  const toggleOpen = () => { if (!open) setValue(generatePassword(opts)); setOpen(!open); };
  const close = () => { setOpen(false); root.current?.querySelector<HTMLButtonElement>('[data-testid="generate-password"]')?.focus(); };
  const onLengthText = (text: string) => {
    setLengthText(text);
    const n = Number(text);
    if (text.trim() !== '' && Number.isInteger(n) && n >= MIN && n <= MAX && n !== opts.length) apply({ ...opts, length: n });
  };
  const onLengthBlur = () => {
    const n = Number(lengthText);
    const v = lengthText.trim() !== '' && Number.isFinite(n) ? clamp(n) : opts.length;
    setLengthText(String(v));
    if (v !== opts.length) apply({ ...opts, length: v });
  };
  const enabled = CLASSES.filter((c) => opts[c.key]).length;
  const toggleClass = (key: CharClass, on: boolean) => { if (on || enabled > 1) apply({ ...opts, [key]: on }); };

  return (
    <div
      ref={root} className="relative shrink-0"
      // Escape closes only the popover; preventDefault keeps the surrounding <dialog> from closing too.
      onKeyDown={(e) => { if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }}
    >
      <IconButton
        data-testid="generate-password" label={t.generatePassword} title={t.generatePassword}
        aria-haspopup="dialog" aria-expanded={open} onClick={toggleOpen} className="h-[38px] w-[38px] border border-border"
      >
        <WandSparkles className="h-4 w-4" aria-hidden="true" />
      </IconButton>
      {open && (
        <div
          role="dialog" aria-label={t.generatePassword}
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-border bg-surface p-4 shadow-float"
        >
          <p className="min-h-[38px] select-all break-all rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-fg-strong">{value}</p>
          <StrengthMeter password={value} />
          <div className="mt-3 flex items-center justify-between gap-3">
            <Label htmlFor={lengthId} className="mb-0">{t.genLength}</Label>
            <div className="w-20 shrink-0">
              <Input
                id={lengthId} type="number" inputMode="numeric" min={MIN} max={MAX} value={lengthText}
                onChange={(e) => onLengthText(e.target.value)} onBlur={onLengthBlur} className="text-center tabular-nums"
                // Enter applies the length instead of submitting the record form around the popover.
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onLengthBlur(); } }}
              />
            </div>
          </div>
          <div className="mt-1 divide-y divide-border">
            {CLASSES.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-center justify-between gap-3 py-2 text-[13px] text-fg">
                <span>{c.label}</span>
                <Switch checked={opts[c.key]} onChange={(v) => toggleClass(c.key, v)} label={c.label} />
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setValue(generatePassword(opts))}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />{t.generate}
            </Button>
            <Button type="button" size="sm" data-testid="generate-password-use" onClick={() => { onPick(value); close(); }}>{t.usePassword}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
